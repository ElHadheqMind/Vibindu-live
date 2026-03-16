import os
import asyncio
import base64
import json
import logging
import traceback
import aiohttp

from google import genai
from google.genai import types
from prompts import LIVE_AGENT_SYSTEM_PROMPT
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
env_file = Path(__file__).parent / ".env"
load_dotenv(env_file, override=True)

log = logging.getLogger("live_agent")
logging.basicConfig(level=logging.INFO)

# Configuration
# Explicitly reload .env to match storyteller/backend
env_file = Path(__file__).parent / ".env"
load_dotenv(env_file, override=True)

# Using native audio latest for better compatibility
MODEL = "models/gemini-2.5-flash-native-audio-preview-12-2025" 
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

if GEMINI_API_KEY:
    masked_key = f"{GEMINI_API_KEY[:10]}...{GEMINI_API_KEY[-5:]}" if len(GEMINI_API_KEY) > 15 else "***"
    log.info(f"Live Agent initialized with API Key: {masked_key}")
else:
    log.error("Live Agent GEMINI_API_KEY is MISSING!")

IS_DOCKER = os.getenv("IS_DOCKER", "false").lower() == "true"
PORT = os.getenv("PORT", "8000")

ORCHESTRATOR_URL = os.getenv("ORCHESTRATOR_URL", f"http://localhost:{PORT}" if IS_DOCKER else "http://localhost:3002")


async def live_agent_websocket(websocket):
    """
    Main WebSocket handler for the Live Agent.
    Mirrors ai_studio_code.py patterns for reliable Gemini Live sessions.
    """
    await websocket.accept()

    client = genai.Client(
        http_options={"api_version": "v1beta"},
        api_key=GEMINI_API_KEY
    )

    # Config — finalized to mirror working patterns from ai_studio_code.py
    config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        media_resolution="MEDIA_RESOLUTION_MEDIUM",
        system_instruction=types.Content(
            parts=[types.Part.from_text(text=LIVE_AGENT_SYSTEM_PROMPT)],
            role="user"
        ),
        tools=[
            types.Tool(
                function_declarations=[
                    types.FunctionDeclaration(
                        name="dispatch_to_team",
                        description="Send the refined automation request to the engineering team. "
                                    "Call this when the user's requirements are clear and validated.",
                        parameters=types.Schema(
                            type="OBJECT",
                            properties={
                                "query": types.Schema(
                                    type="STRING",
                                    description="The complete, refined automation request."
                                ),
                            },
                            required=["query"]
                        )
                    ),
                    types.FunctionDeclaration(
                        name="dispatch_to_computer_agent",
                        description="Send the user's request to the VibIndu Computer Use Agent to perform UI interactions or desktop tasks. "
                                    "Use this ONLY when the user asks for 'computer use' or 'computer agent'.",
                        parameters=types.Schema(
                            type="OBJECT",
                            properties={
                                "query": types.Schema(
                                    type="STRING",
                                    description="The complete, refined request for the computer use agent."
                                ),
                            },
                            required=["query"]
                        )
                    ),
                    types.FunctionDeclaration(
                        name="dispatch_to_storyteller_agent",
                        description="Send the user's request to the Storyteller agent. "
                                    "Call this when the user asks to generate a description of the project or explain the functioning of a certain part. "
                                    "The agent will generate a multimodal description with images and audio narration.",
                        parameters=types.Schema(
                            type="OBJECT",
                            properties={
                                "query": types.Schema(
                                    type="STRING",
                                    description="The topic or prompt for the description."
                                ),
                            },
                            required=["query"]
                        )
                    ),
                    types.FunctionDeclaration(
                        name="configure_swarm_model",
                        description="Configure the model and thinking level for the engineering team. "
                                    "Call this when the user specifies the model (e.g., Gemini 3.1 Flash Lite, 3.1 Pro) or thinking level.",
                        parameters=types.Schema(
                            type="OBJECT",
                            properties={
                                "model": types.Schema(
                                    type="STRING",
                                    description="The model to use, e.g., 'gemini-3.1-flash-lite-preview', 'gemini-3.1-pro-preview', 'gemini-1.5-pro'"
                                ),
                                "thinking_level": types.Schema(
                                    type="STRING",
                                    description="The thinking level to use, e.g., 'low', 'medium', 'high'"
                                ),
                            },
                        )
                    ),
                    types.FunctionDeclaration(
                        name="request_screen_context",
                        description="Ask the frontend application to capture a screenshot of the user's current view. "
                                    "Call this immediately when the user asks you a question about their screen, layout, code, or visual interface "
                                    "but you do not have an image in the current context to look at. Let the user know you are taking a look."
                    ),
                ]
            )
        ],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Zephyr")
            )
        )
    )

    # Queue for outgoing data to Gemini (audio chunks, images, text narration)
    # Reduced size to minimize lag and race condition windows.
    out_queue = asyncio.Queue(maxsize=10)
    
    # Separate queue for deferred images (screenshots) - sent only when safe
    image_queue = asyncio.Queue(maxsize=3)
    
    # Queue for screenshot_response relay from frontend to computer agent
    screenshot_relay_queue = asyncio.Queue(maxsize=5)

    # Shared session state for sub-tasks and loops
    state = {
        "project_path": "",
        "swarm_model": "gemini-3.1-flash-lite-preview",
        "swarm_thinking_level": "low",
        "tool_pending": False,
        "model_responding": False,  # True while model is actively producing audio/text
        "last_stream_narrations": {} # Shared debounce tracking for A2A narrations
    }
    audio_gate = asyncio.Event() 
    audio_gate.set() # Initially open

    try:
        async with client.aio.live.connect(model=MODEL, config=config) as session:
            log.info(f"Connected to Gemini Live API: {MODEL}")

            # Signal the frontend
            try:
                await websocket.send_json({"type": "session_ready"})
            except Exception:
                log.warning("Client disconnected before session_ready")
                return

            async def send_to_gemini():
                """
                Drain the out_queue and send to Gemini. 
                """
                while True:
                    msg = await out_queue.get()
                    try:
                        # 2. Strict type check for policy compliance
                        is_tool_response = isinstance(msg, types.LiveClientToolResponse)
                        is_system_narration = isinstance(msg, dict) and msg.get("is_system", False)
                        
                        if state["tool_pending"] and not is_tool_response and not is_system_narration:
                            # Drop everything except tool responses or system narrations when tool is pending
                            if isinstance(msg, bytes):
                                # User is speaking while a tool is running. Ignore their audio so it doesn't build up.
                                pass
                            else:
                                log.warning(f"[Live] GATE CLOSED: Dropped {msg} (type: {type(msg)})")
                            continue

                        # 3. Don't send narration text while model is actively responding
                        if isinstance(msg, dict) and "end_of_turn" in msg and state["model_responding"]:
                            log.info("[Live] Skipping narration text — model is mid-response. Requeueing.")
                            async def requeue(message_to_requeue):
                                await asyncio.sleep(1.0)
                                await out_queue.put(message_to_requeue)
                            asyncio.create_task(requeue(msg))
                            continue

                        # 4. Use NATIVE methods for sending to Gemini
                        if isinstance(msg, dict) and "end_of_turn" in msg:
                            # Native text input
                            await session.send_realtime_input(text=msg["text"])
                        elif is_tool_response:
                            log.info(f"[Live] Sending Tool Response. ID count: {len(msg.function_responses)}")
                            # Native tool response
                            await session.send_tool_response(function_responses=msg.function_responses)
                        elif isinstance(msg, bytes):
                            # Native audio input
                            await session.send_realtime_input(
                                audio=types.Blob(data=msg, mime_type="audio/pcm;rate=16000")
                            )
                        elif isinstance(msg, types.LiveClientContent):
                            # Fallback for complex client content
                            log.info(f"[Live] Sending Client Content: {msg}")
                            await session.send_client_content(msg)
                        else:
                            # Catch-all
                            log.warning(f"[Live] Using catch-all session.send for type: {type(msg)}")
                            await session.send(input=msg)

                    except Exception as e:
                        err_str = str(e)
                        log.error(f"Error sending to Gemini: {e}")
                        if "1008" in err_str:
                            log.warning("Gemini 1008 detected in SEND loop. Breaking connection.")
                            break
                        await asyncio.sleep(0.1)


            async def send_deferred_images():
                """
                Process images from the image_queue and send them to Gemini.
                Only waits for tool_pending to clear (not model_responding).
                The model ASKED for this screenshot via request_screen_context,
                so sending it while the model is speaking is correct — it acts
                as an interruption and the model will analyze the image.
                """
                while True:
                    img_data = await image_queue.get()
                    try:
                        # Only wait for tool_pending to clear (tool response must be sent first)
                        retries = 0
                        while state["tool_pending"] and retries < 30:
                            await asyncio.sleep(0.2)
                            retries += 1
                        
                        if retries >= 30:
                            log.warning("[Live] Timed out waiting for tool_pending to clear. Dropping image.")
                            continue
                        
                        # Brief stability delay to let the tool response fully process
                        await asyncio.sleep(0.5)
                        
                        log.info(f"[Live] 📸 Sending Screen Image ({len(img_data)} bytes) to Gemini.")
                        
                        # Save locally for debugging
                        try:
                            with open("debug_screenshot.jpg", "wb") as f:
                                f.write(img_data)
                            log.info("[Live] Debug screenshot saved to debug_screenshot.jpg")
                        except Exception:
                            pass

                        # Send as dictionary to use native Live API parsing
                        await session.send(
                            input={"mime_type": "image/jpeg", "data": base64.b64encode(img_data).decode()}
                        )
                        
                        # Add a tiny text prompt to ensure it sees the context if explicitly requested
                        await session.send_realtime_input(text="[SCREENSHOT CAPTURED]")
                        
                        log.info("[Live] ✅ Image sent successfully to Gemini.")
                        
                    except Exception as e:
                        err_str = str(e)
                        log.error(f"[Live] Error sending deferred image: {e}")
                        if "1008" in err_str:
                            log.warning("[Live] 1008 on image send. Session is dead.")
                            break

            async def receive_from_frontend():
                """Continuously receive from frontend and relay to out_queue."""
                while True:
                    try:
                        m = await websocket.receive_json()
                        m_type = m.get("type", "")

                        # Handle both 'audio' and legacy 'audio_chunk' type from frontend
                        if m_type in ("audio", "audio_chunk"):
                            data = base64.b64decode(m.get("data", ""))
                            # Add to outgoing queue as raw PCM16 bytes
                            await out_queue.put(data)
                        
                        elif m_type == "dispatch":
                            query = m.get("query", "")
                            if not query:
                                log.info("[Live] Manual dispatch triggered without query, using context...")
                                query = "Proceed with the automation project as discussed."
                                
                            await websocket.send_json({
                                "type": "dispatched",
                                "query": query
                            })
                            asyncio.create_task(
                                dispatch_to_orchestrator(session, websocket, out_queue, query, state["project_path"], state["swarm_model"], state["swarm_thinking_level"], state["last_stream_narrations"])
                            )

                        elif m_type == "set_context":
                            state["project_path"] = m.get("projectPath", "")
                            log.info(f"[Live] Received project path context: {state['project_path']}")

                        elif m_type == "screenshot_response":
                            # Computer agent relay: frontend captured a screenshot for the computer agent
                            log.info(f"[Live] Received screenshot_response from frontend, forwarding to computer agent")
                            try:
                                screenshot_relay_queue.put_nowait(m)
                            except asyncio.QueueFull:
                                log.warning("[Live] Screenshot relay queue full. Dropping oldest.")
                                try:
                                    screenshot_relay_queue.get_nowait()
                                except asyncio.QueueEmpty:
                                    pass
                                await screenshot_relay_queue.put(m)

                        elif m_type == "image":
                            data = base64.b64decode(m.get("data", ""))
                            log.info(f"[Live] Received screen image from frontend ({len(data)} bytes). Deferring to image queue.")
                            try:
                                image_queue.put_nowait(data)
                            except asyncio.QueueFull:
                                log.warning("[Live] Image queue full. Dropping oldest image.")
                                try:
                                    image_queue.get_nowait()
                                except asyncio.QueueEmpty:
                                    pass
                                await image_queue.put(data)

                    except Exception as e:
                        log.warning(f"Error receiving from frontend: {e}")
                        break

            async def send_pings_to_frontend():
                """Periodically send a ping over the WebSocket to keep the Cloud Run connection alive."""
                while True:
                    try:
                        await asyncio.sleep(45) # Cloud run drops at around 1-5 minutes of inactivity if no pings
                        if websocket.client_state.value == 2: # DISCONNECTED
                            break
                        # We just send a simple ping
                        await websocket.send_json({"type": "ping"})
                    except Exception as e:
                        log.debug(f"Ping failed: {e}")
                        break

            async def receive_from_gemini():
                """
                Receive from Gemini and relay to frontend.
                Manages audio_gate and tool_pending synchronization.
                """
                while True:
                    try:
                        turn = session.receive()
                        async for response in turn:
                            # Any model output (audio or text) signals it's safe to resume streaming
                            safe_text = ""
                            try:
                                safe_text = response.text
                            except ValueError:
                                pass

                            if response.data or safe_text:
                                state["model_responding"] = True
                                if state["tool_pending"]:
                                    state["tool_pending"] = False
                                    audio_gate.set()
                                    log.info("[Live] Model is responding. Gate OPEN.")

                            # Audio data → relay to browser
                            if data := response.data:
                                b64 = base64.b64encode(data).decode()
                                await websocket.send_json({
                                    "type": "audio_chunk",
                                    "data": b64,
                                    "sampleRate": 24000
                                })

                            # Text transcript → relay to browser
                            if safe_text:
                                await websocket.send_json({
                                    "type": "transcript",
                                    "role": "model",
                                    "text": safe_text
                                })

                            # Tool Call detected
                            if hasattr(response, 'tool_call') and response.tool_call:
                                # STOP THE PRESSES: Close gate and clear queue immediately
                                audio_gate.clear()
                                state["tool_pending"] = True 
                                log.info("[Live] 🛑 Tool call detected. Gate LOCKED.")
                                
                                # Flush audio from queue
                                drained = 0
                                stashed = []
                                while not out_queue.empty():
                                    try:
                                        item = out_queue.get_nowait()
                                        # Keep tool responses if they somehow got in early, drop everything else
                                        if isinstance(item, types.LiveClientToolResponse):
                                            stashed.append(item)
                                        else:
                                            drained += 1
                                    except asyncio.QueueEmpty: break
                                for item in stashed: await out_queue.put(item)
                                if drained > 0: log.info(f"[Live] Flushed {drained} frames from queue.")

                                # Batch and queue the tool responses
                                function_responses = []
                                for fc in response.tool_call.function_calls:
                                    if fc.name == "dispatch_to_team":
                                        query = fc.args.get("query", "")
                                        log.info(f"[A2A] Preparing response for: {fc.name}")

                                        await websocket.send_json({
                                            "type": "dispatched",
                                            "query": query
                                        })

                                        function_responses.append(types.FunctionResponse(
                                            name="dispatch_to_team",
                                            id=fc.id,
                                            response={"status": "dispatched"}
                                        ))
                                        
                                        # Background task for actually calling the orchestrator
                                        asyncio.create_task(
                                            dispatch_to_orchestrator(session, websocket, out_queue, query, state["project_path"], state["swarm_model"], state["swarm_thinking_level"], state["last_stream_narrations"])
                                        )

                                    elif fc.name == "dispatch_to_computer_agent":
                                        query = fc.args.get("query", "")
                                        log.info(f"[A2A] Preparing response for: {fc.name}")

                                        await websocket.send_json({
                                            "type": "dispatched", # keeping the same dispatched type for frontend compatibility
                                            "query": query,
                                            "target": "computer_agent"
                                        })

                                        function_responses.append(types.FunctionResponse(
                                            name="dispatch_to_computer_agent",
                                            id=fc.id,
                                            response={"status": "dispatched to computer agent"}
                                        ))
                                        
                                        # Background task for actually calling the computer agent
                                        asyncio.create_task(
                                            dispatch_to_computer_agent_ws(session, websocket, out_queue, query, state["last_stream_narrations"], screenshot_relay_queue)
                                        )

                                    elif fc.name == "dispatch_to_storyteller_agent":
                                        query = fc.args.get("query", "")
                                        log.info(f"[A2A] Preparing response for: {fc.name}")

                                        await websocket.send_json({
                                            "type": "dispatched",
                                            "query": query,
                                            "target": "storyteller_agent"
                                        })

                                        function_responses.append(types.FunctionResponse(
                                            name="dispatch_to_storyteller_agent",
                                            id=fc.id,
                                            response={"status": "dispatched to storyteller agent"}
                                        ))
                                        
                                        asyncio.create_task(
                                            dispatch_to_storyteller_agent_ws(session, websocket, out_queue, query, state["project_path"], state["last_stream_narrations"])
                                        )

                                    elif fc.name == "configure_swarm_model":
                                        new_model = fc.args.get("model", state["swarm_model"])
                                        new_thinking = fc.args.get("thinking_level", state["swarm_thinking_level"])
                                        state["swarm_model"] = new_model
                                        state["swarm_thinking_level"] = new_thinking
                                        log.info(f"[A2A] Swarm Model Configured: {state['swarm_model']} ({state['swarm_thinking_level']})")

                                        await websocket.send_json({
                                            "type": "task_progress",
                                            "text": f"Engineering team configured to use {state['swarm_model']} with {state['swarm_thinking_level']} thinking.",
                                            "agent": "System",
                                            "event_type": "status"
                                        })

                                        function_responses.append(types.FunctionResponse(
                                            name="configure_swarm_model",
                                            id=fc.id,
                                            response={"status": "configured", "model": state["swarm_model"], "thinking_level": state["swarm_thinking_level"]}
                                        ))

                                    elif fc.name == "request_screen_context":
                                        log.info(f"[A2A] Preparing response for: {fc.name}")
                                        
                                        # Tell frontend to capture the screen and send it back as an image
                                        await websocket.send_json({
                                            "type": "capture_screenshot_now",
                                            "maxWidth": 1280,
                                            "maxHeight": 720,
                                            "quality": 0.6
                                        })

                                        function_responses.append(types.FunctionResponse(
                                            name="request_screen_context",
                                            id=fc.id,
                                            response={"status": "capture_requested", "message": "Screenshot requested from frontend with compression. Await the image part."}
                                        ))

                                if function_responses:
                                    # Serialized send via out_queue
                                    await out_queue.put(types.LiveClientToolResponse(
                                        function_responses=function_responses
                                    ))
                                    # Ensure the gate is still locked if we just queued the response
                                    audio_gate.clear() 

                        # Turn ended — model is no longer actively responding
                        state["model_responding"] = False

                    except Exception as e:
                        if "1008" in str(e):
                            log.warning("Gemini 1008 in RECEIVE loop.")
                        else:
                            log.error(f"Error receiving from Gemini: {e}")
                        break



            # Run all loops concurrently, and exit if ANY of them finish/error
            # This prevents zombie tasks from hanging the system when the frontend drops
            done, pending = await asyncio.wait(
                [
                    asyncio.create_task(send_to_gemini()),
                    asyncio.create_task(send_deferred_images()),
                    asyncio.create_task(receive_from_gemini()),
                    asyncio.create_task(receive_from_frontend()),
                    asyncio.create_task(send_pings_to_frontend())
                ],
                return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()

    except Exception as e:
        log.error(f"Live Agent session error: {e}")
        traceback.print_exc()
        try:
            await websocket.send_json({"type": "error", "message": f"Session failed: {str(e)}"})
        except Exception:
            pass
    finally:
        log.info("Live Agent session closed")


async def broadcast_to_vibe(text: str, agent: str = "System", event_type: str = "status", **kwargs):
    """Notify the Orchestrator's broadcast endpoint so the frontend sidebar can sync."""
    try:
        # Use a one-off session to avoid keeping a connection open
        async with aiohttp.ClientSession() as session:
            payload = {
                "type": "status" if event_type == "status" else event_type,
                "text": text,
                "agent": agent
            }
            # Append any extra fields (like imageData, videoUrl, etc.)
            payload.update(kwargs)
            
            async with session.post(f"{ORCHESTRATOR_URL}/api/broadcast", json=payload) as resp:
                if resp.status != 200:
                    log.warning(f"[Broadcast] Orchestrator returned status {resp.status}")
    except Exception as e:
        log.warning(f"[Broadcast] Failed to notify Vibe: {e}")

def highlight_a2a_send(query: str, project_path: str, target: str = "SWARM"):
    """Print a colorful, high-visibility box for A2A dispatch."""
    magenta = "\033[95m"
    cyan = "\033[96m"
    reset = "\033[0m"
    bold = "\033[1m"
    
    border = f"{magenta}=" * 60 + reset
    print(f"\n{border}")
    print(f"{magenta}🚀 {bold}A2A DISPATCH TO {target}{reset}")
    print(f"{cyan}➤ Query:   {reset}{query}")
    if target == "SWARM":
        print(f"{cyan}➤ Project: {reset}{project_path}")
    print(f"{border}\n")

async def dispatch_to_orchestrator(session, websocket, out_queue, query: str, project_path: str = "", model: str = "gemini-3.1-flash-lite-preview", thinking_level: str = "low", last_stream_narrations: dict = None):
    """
    A2A Dispatch: Send the refined user query to the Orchestrator via WebSocket
    and narrate progress back through the Gemini Live session via central out_queue.
    """
    if last_stream_narrations is None:
        last_stream_narrations = {}
    try:
        orchestrator_ws_url = ORCHESTRATOR_URL.replace("http://", "ws://") + "/ws/vibe"
        highlight_a2a_send(query, project_path)

        async with aiohttp.ClientSession() as http_session:
            async with http_session.ws_connect(orchestrator_ws_url) as orch_ws:
                # Send the query to Swarm with project_path
                await orch_ws.send_json({
                    "text": query, 
                    "type": "message",
                    "project_path": project_path,
                    "model": model,
                    "thinking_level": thinking_level
                })
                
                # Notify frontend UI
                await websocket.send_json({
                    "type": "task_progress",
                    "text": "Engineering team is starting work...",
                    "agent": "Orchestrator",
                    "event_type": "status"
                })

                # We no longer put an initial narration here. 
                # Gemini sees the ToolResponse status="dispatched" and talks naturally.

                # Listen for swarm updates
                async for msg in orch_ws:
                    # Check if client still connected
                    if websocket.client_state.value == 2: # DISCONNECTED
                        log.info("[A2A] Client disconnected, stopping swarm listener.")
                        break

                    if msg.type == aiohttp.WSMsgType.TEXT:
                        try:
                            event = json.loads(msg.data)
                            event_type = event.get("type", "")
                            agent_name = event.get("agent", "Team")
                            text = event.get("text", "")

                            # Filter out noisy tool events that don't have user-facing text
                            if event_type in ("tool_call", "tool_result") and not text:
                                # Special case: if it's a tool_call that represents a major step, we could show it,
                                # but user explicitly said "no need for them" if empty.
                                continue

                            # Forward to sidebar
                            try:
                                # High-visibility console log for A2A updates
                                if text:
                                    print(f"[A2A UPDATE] >>> Type: {event_type:12} | Agent: {agent_name:15} | Content: {text[:100]}...")
                                else:
                                    print(f"[A2A UPDATE] >>> Type: {event_type:12} | Agent: {agent_name:15} | (Processing...)")

                                await websocket.send_json({
                                    "type": "task_progress",
                                    "text": text if text else f"Agent {agent_name} is processing...",
                                    "agent": agent_name,
                                    "event_type": event_type
                                })
                            except Exception: break

                            # Narration Logic (Incremental updates)
                            narration_input = None
                            
                            if event_type == "agent_response" and text:
                                # Agent names: SpecAnalyst, GsrsmEngineer, etc.
                                narration_input = f"[A2A Context: Agent {agent_name} completed task. Output: {text}]"
                            elif event_type == "stream" and text and len(text.strip()) > 30:
                                # Debounce stream updates: only narrate if we haven't spoken about this agent recently (e.g. within 5 seconds)
                                current_time = asyncio.get_event_loop().time()
                                last_time = last_stream_narrations.get(agent_name, 0)
                                if current_time - last_time > 10.0:  # Speak every 10 seconds max per agent
                                    last_stream_narrations[agent_name] = current_time
                                    narration_input = f"[A2A Context: Agent {agent_name} streaming partial output: {text[:300]}]"
                            elif event_type == "status" and "complete" in text.lower():
                                narration_input = "[A2A Context: Orchestrator reports project is complete.]"
                            
                            if narration_input:
                                log.info(f"[Live] 📢 Queueing SYSTEM NEWS narration: {narration_input[:100]}...")
                                # Send as standard text WITHOUT end_of_turn during the model's execution to avoid 1008 policy violation
                                await out_queue.put({
                                    "text": narration_input,
                                    "end_of_turn": False,
                                    "is_system": True
                                })

                            if event_type == "stream_complete":
                                try:
                                    await websocket.send_json({ "type": "task_complete", "text": "Project complete!" })
                                except Exception: pass
                                break

                        except Exception as e:
                            log.error(f"[A2A] Event loop error: {e}")
                            if "closed" in str(e).lower(): break
                    elif msg.type in (aiohttp.WSMsgType.ERROR, aiohttp.WSMsgType.CLOSED):
                        break

    except Exception as e:
        log.error(f"[A2A] Global dispatch error: {e}")
        traceback.print_exc()

async def dispatch_to_computer_agent_ws(session, websocket, out_queue, query: str, last_stream_narrations: dict = None, screenshot_relay_queue: asyncio.Queue = None):
    """
    A2A Dispatch to Computer Use Agent: Send the user query to the Computer Agent Server via WebSocket
    and narrate progress back through the Gemini Live session.
    
    Relays screenshot requests/responses and computer actions between the agent and frontend.
    """
    if last_stream_narrations is None:
        last_stream_narrations = {}
    try:
        IS_DOCKER = os.getenv("IS_DOCKER", "false").lower() == "true"
        PORT = os.getenv("PORT", "8000")
        default_computer_url = f"ws://localhost:{PORT}/computer/ws/computer-use" if IS_DOCKER else "ws://localhost:3004/ws/computer-use"
        computer_ws_url = os.getenv("COMPUTER_AGENT_URL", default_computer_url)
        
        highlight_a2a_send(query, "", "COMPUTER USE AGENT")

        async with aiohttp.ClientSession() as http_session:
            async with http_session.ws_connect(computer_ws_url) as orch_ws:
                # Send the query to Computer Agent
                await orch_ws.send_json({
                    "text": query, 
                    "type": "prompt"
                })
                
                # Notify frontend UI
                await websocket.send_json({
                    "type": "task_progress",
                    "text": "Computer Use Agent is taking control of the browser...",
                    "agent": "Computer Agent",
                    "event_type": "status"
                })
                asyncio.create_task(broadcast_to_vibe("Computer Use Agent is taking control of the browser...", "Computer Agent"))

                # Background task: listen for screenshot_response from the relay queue 
                # (populated by the main receive loop) and forward to the computer agent
                frontend_relay_active = True
                
                async def frontend_to_agent_relay():
                    """Listen for messages in the relay queue and forward to computer agent."""
                    nonlocal frontend_relay_active
                    try:
                        while frontend_relay_active:
                            try:
                                # Fetch from queue instead of reading from WebSocket directly (prevents deadlock)
                                frontend_msg = await asyncio.wait_for(screenshot_relay_queue.get(), timeout=1.0)
                                if frontend_msg.get("type") == "screenshot_response":
                                    await orch_ws.send_json(frontend_msg)
                                    log.info("[A2A Computer] Relayed screenshot_response from queue to computer agent")
                                elif frontend_msg.get("type") == "viewport_info":
                                    await orch_ws.send_json(frontend_msg)
                            except asyncio.TimeoutError:
                                continue
                            except Exception as e:
                                log.debug(f"[A2A Computer] Relay error: {e}")
                    except Exception as e:
                        log.debug(f"[A2A Computer] Relay stopped: {e}")
                
                relay_task = asyncio.create_task(frontend_to_agent_relay())

                # Listen for updates from computer agent
                try:
                    async for msg in orch_ws:
                        if websocket.client_state.value == 2: # DISCONNECTED
                            log.info("[A2A Computer] Client disconnected, stopping listener.")
                            break

                        if msg.type == aiohttp.WSMsgType.TEXT:
                            try:
                                event = json.loads(msg.data)
                                event_type = event.get("type", "")
                                text = event.get("text", "")
                                action_name = event.get("name", "")
                                agent_name = "Computer Agent"

                                # RELAY: Forward screenshot_request to the frontend
                                if event_type == "screenshot_request":
                                    log.info("[A2A Computer] Relaying screenshot_request to frontend")
                                    await websocket.send_json(event)
                                    continue
                                
                                # RELAY: Forward computer_action to the frontend
                                if event_type == "computer_action":
                                    log.info(f"[A2A Computer] Relaying computer_action: {event.get('action')}")
                                    await websocket.send_json(event)
                                    continue

                                display_text = text
                                if event_type == "action":
                                    display_text = f"Executing UI Action: {action_name}"
                                elif not text:
                                    display_text = "Processing..."
                                    
                                try:
                                    print(f"[A2A COMPUTER] >>> Type: {event_type:12} | Action: {action_name:15} | Content: {display_text[:100]}...")
                                    await websocket.send_json({
                                        "type": "task_progress",
                                        "text": display_text,
                                        "agent": agent_name,
                                        "event_type": event_type
                                    })
                                    if display_text:
                                        asyncio.create_task(broadcast_to_vibe(display_text, agent_name, event_type))
                                except Exception: break

                                # Narration Logic
                                narration_input = None
                                current_time = asyncio.get_event_loop().time()
                                last_time = last_stream_narrations.get(agent_name, 0)
                                
                                if event_type == "status" and text and len(text.strip()) > 10:
                                    if current_time - last_time > 10.0:
                                        last_stream_narrations[agent_name] = current_time
                                        narration_input = f"SYSTEM NEWS: The Computer Agent is executing steps. Briefly update the user: {text[:150]}"
                                elif event_type == "action":
                                    if current_time - last_time > 12.0:
                                        last_stream_narrations[agent_name] = current_time
                                        short_action = action_name.replace('_', ' ')
                                        narration_input = f"SYSTEM NEWS: The Computer Agent is performing a {short_action} action."
                                elif event_type == "complete":
                                    narration_input = "SYSTEM NEWS: The Computer Agent task is complete."
                                
                                if narration_input:
                                    await out_queue.put({"text": narration_input, "end_of_turn": False, "is_system": True})

                                if event_type == "complete":
                                    await websocket.send_json({ "type": "task_complete", "text": "Computer agent task complete!" })
                                    break

                            except Exception as e:
                                log.error(f"[A2A Computer] Event loop error: {e}")
                        elif msg.type in (aiohttp.WSMsgType.ERROR, aiohttp.WSMsgType.CLOSED):
                            break
                finally:
                    frontend_relay_active = False
                    relay_task.cancel()
                    try: await relay_task
                    except: pass
    except Exception as e:
        log.error(f"[A2A Computer] Global error: {e}")
        traceback.print_exc()

async def dispatch_to_storyteller_agent_ws(session, websocket, out_queue, query: str, project_path: str, last_stream_narrations: dict = None):
    """
    A2A Dispatch to Storyteller Agent: Send the user query to the backend via WebSocket
    and narrate progress back through the Gemini Live session.
    """
    if last_stream_narrations is None:
        last_stream_narrations = {}
    
    try:
        IS_DOCKER = os.getenv("IS_DOCKER", "false").lower() == "true"
        PORT = os.getenv("PORT", "8000") # Docker container port (usually 8080 or 8000) inside Cloud Run
        default_storyteller_url = f"ws://localhost:{PORT}/storyteller/ws/story" if IS_DOCKER else "ws://localhost:3005/ws/story"
        story_ws_url = os.getenv("STORYTELLER_AGENT_URL", default_storyteller_url)

        highlight_a2a_send(query, project_path, "STORYTELLER AGENT")
        
        # Notify frontend UI that it's starting
        await websocket.send_json({
            "type": "task_progress",
            "text": "Creative Storyteller is designing the narrative and generating assets (images via Nano Banana, videos via Veo, audio via TTS)...",
            "agent": "Creative Storyteller",
            "event_type": "status"
        })

        # Tell the user verbally
        narration_input = "SYSTEM NEWS: The Creative Storyteller agent has started working. It is generating a creative plan, then producing images with Nano Banana, videos with Veo, and audio narration. This may take a minute."
        await out_queue.put({
            "text": narration_input,
            "end_of_turn": False,
            "is_system": True
        })
        
        # Sync with VibeSidebar
        asyncio.create_task(broadcast_to_vibe("Creative Storyteller is starting...", "Creative Storyteller"))
        
        async with aiohttp.ClientSession() as http_session:
            async with http_session.ws_connect(story_ws_url) as orch_ws:
                # Send the query to Storyteller Agent
                await orch_ws.send_json({
                    "text": query, 
                    "projectPath": project_path,
                    "type": "prompt"
                })
                
                # Listen for updates from storyteller agent
                async for msg in orch_ws:
                    if websocket.client_state.value == 2: # DISCONNECTED
                        log.info("[A2A Storyteller] Client disconnected, stopping listener.")
                        break

                    if msg.type == aiohttp.WSMsgType.TEXT:
                        try:
                            event = json.loads(msg.data)
                            event_type = event.get("type", "")
                            text = event.get("text", "")
                            agent_name = event.get("agent", "Creative Storyteller")

                            if event_type == "status":
                                await websocket.send_json({
                                    "type": "task_progress",
                                    "text": text,
                                    "agent": agent_name,
                                    "event_type": event_type
                                })
                                asyncio.create_task(broadcast_to_vibe(text, agent_name, event_type))

                                current_time = asyncio.get_event_loop().time()
                                last_time = last_stream_narrations.get(agent_name, 0)
                                if current_time - last_time > 10.0:
                                    last_stream_narrations[agent_name] = current_time
                                    narration_input = f"SYSTEM NEWS: Storyteller Update: {text[:150]}"
                                    await out_queue.put({"text": narration_input, "end_of_turn": False, "is_system": True})

                            elif event_type == "story_result":
                                plan = event.get("plan", {})
                                image_b64 = event.get("imageB64")
                                audio_b64 = event.get("audioB64")
                                
                                await websocket.send_json({
                                    "type": "task_progress",
                                    "text": f"Cinematic Masterpiece Ready: {plan.get('title', 'Story')} (Multimodal assets saved to StoryExperience folder)",
                                    "agent": "Creative Storyteller",
                                    "event_type": "story_result"
                                })

                                asyncio.create_task(broadcast_to_vibe(
                                    f"Story Complete: {plan.get('title', 'Story')}", 
                                    "Creative Storyteller", 
                                    "story_result",
                                    imageData=image_b64,
                                    audioData=audio_b64
                                ))

                                # Trigger a project reload to show the new StoryExperience folder
                                asyncio.create_task(broadcast_to_vibe(
                                    "Refreshing project structure...",
                                    "System",
                                    "project_reload"
                                ))

                                # Persist story HTML via backend StorageService (fallback for GCS)
                                story_html = event.get("story")
                                if story_html and project_path:
                                    try:
                                        backend_url = os.environ.get("BACKEND_URL", "http://backend:3001")
                                        persist_url = f"{backend_url}/api/vibe/persist-story"
                                        async with aiohttp.ClientSession() as persist_session:
                                            async with persist_session.post(persist_url, json={
                                                "projectPath": project_path,
                                                "storyHtml": story_html,
                                                "filename": event.get("filename", "Story.html"),
                                                "assets": event.get("assets", [])
                                            }, headers={"x-agent-secret": "antigravity-local-agent"}, timeout=aiohttp.ClientTimeout(total=45)) as resp:
                                                if resp.status == 200:
                                                    log.info(f"[LiveAgent] ✅ Story persisted via backend StorageService")
                                                else:
                                                    log.warning(f"[LiveAgent] ⚠️ Backend persist-story returned {resp.status}")
                                    except Exception as pe:
                                        log.warning(f"[LiveAgent] ⚠️ Could not persist story via backend: {pe}")

                                await websocket.send_json({ "type": "task_complete", "text": "Story generation complete!" })
                                
                                plan_summary = ""
                                if plan:
                                    plan_summary = f" The story '{plan.get('title', '')}' has {plan.get('segment_count', '?')} segments, {plan.get('image_count', 0)} images, and {plan.get('video_count', 0)} videos."
                                
                                narration_input = f"SYSTEM NEWS: The Creative Storyteller has completed the story!{plan_summary} Tell the user it's ready to view!"
                                await out_queue.put({
                                    "text": narration_input,
                                    "end_of_turn": False,
                                    "is_system": True
                                })
                            
                            elif event_type == "asset_generated":
                                asset_type = event.get("asset_type", "Media")
                                filename = event.get("filename", "")
                                b64_data = event.get("b64", "")
                                
                                await websocket.send_json({
                                    "type": "task_progress",
                                    "text": f"Generated {asset_type} asset: {filename}",
                                    "agent": "Creative Storyteller",
                                    "event_type": "asset_generated"
                                })

                                # Quick project reload to make the file appear in the sidebar
                                asyncio.create_task(broadcast_to_vibe(
                                    f"New asset saved: {filename}",
                                    "Creative Storyteller",
                                    "project_reload"
                                ))

                                # Fallback persistence just in case the server's direct POST failed
                                if filename and b64_data and project_path:
                                    try:
                                        backend_url = os.environ.get("BACKEND_URL", "http://backend:3001")
                                        persist_url = f"{backend_url}/api/vibe/persist-story"
                                        async with aiohttp.ClientSession() as persist_session:
                                            async with persist_session.post(persist_url, json={
                                                "projectPath": project_path,
                                                "assets": [{"filename": filename, "b64": b64_data}]
                                            }, headers={"x-agent-secret": "antigravity-local-agent"}, timeout=aiohttp.ClientTimeout(total=45)) as resp:
                                                if resp.status == 200:
                                                    pass # Silent success
                                    except Exception as e:
                                        pass # Silent fail since it is a fallback
                                break
                                
                            elif event_type == "error":
                                await websocket.send_json({
                                    "type": "task_progress",
                                    "text": f"Error generating story: {text}",
                                    "agent": "Creative Storyteller",
                                    "event_type": "error"
                                })
                                
                                narration_input = "SYSTEM NEWS: The Creative Storyteller encountered an error while writing the story. Briefly apologize to the user."
                                await out_queue.put({
                                    "text": narration_input,
                                    "end_of_turn": False,
                                    "is_system": True
                                })
                                break
                        except RuntimeError as re:
                            if "Unexpected ASGI message" in str(re) or "websocket.close" in str(re):
                                pass  # UI client disconnected, ignore it so orchestrator can finish
                            else:
                                log.warning(f"[A2A Storyteller] Event loop RuntimeError: {re}")
                        except Exception as e:
                            log.error(f"[A2A Storyteller] Event loop error: {e}")
                    elif msg.type in (aiohttp.WSMsgType.ERROR, aiohttp.WSMsgType.CLOSED):
                        break
                    
    except Exception as e:
        log.error(f"[A2A Storyteller] Global dispatch error: {e}")
        traceback.print_exc()


