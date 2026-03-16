import os
import sys
import json
import logging
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import traceback
from google import genai
from google.genai import types

# Import the right tools based on environment
IS_DOCKER = os.environ.get("IS_DOCKER", "false").lower() == "true"

if IS_DOCKER:
    from frontend_relay_tools import FrontendRelayTools
else:
    from computer_use_tools import ComputerUseTools

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("computer_agent_server")

app = FastAPI(title="VibIndu Computer Use Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dynamic URL configuration — NO hardcoded URLs
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
AGENT_HOST = os.environ.get("COMPUTER_AGENT_HOST", "localhost")
AGENT_PORT = int(os.environ.get("COMPUTER_AGENT_PORT", "3004"))

# Engineering Prompt — dynamic, no hardcoded URLs
COMPUTER_USE_PROMPT = f"""You are the Computer Use Agent for VibIndu. 
Your goal is to interact with the CURRENT SCREEN visible in the user's browser.
- The user's application is already open in their browser. You see exactly what they see.
- Do NOT try to open a new browser or navigate to a URL unless specifically asked.
- Focus exclusively on the Grafcet/GSRSM Editor interface that is currently visible.
- Use mouse clicks and keyboard input to interact with the visible UI elements.
- After each action, you will receive an updated screenshot showing the result.
Work precisely on the currently visible screen."""

AGENT_CARD = {
    "name": "VibIndu Computer Use Agent",
    "description": "Agent that controls the browser UI to perform engineering tasks on the Grafcet platform.",
    "url": f"http://{AGENT_HOST}:{AGENT_PORT}",
    "version": "1.0.0",
    "capabilities": {
        "computer_use": True,
        "visual_interaction": True
    },
    "skills": [
        {
            "id": "os_automation",
            "name": "UI Automation",
            "description": "Controlling mouse and keyboard based on visual feedback from the user's browser.",
            "tags": ["automation", "gui", "computer-use"],
        }
    ]
}

@app.get("/.well-known/agent.json")
async def agent_card():
    return AGENT_CARD

@app.get("/")
async def root():
    return {
        "agent": "VibIndu Computer Use Agent",
        "status": "ready",
        "mode": "frontend_relay" if IS_DOCKER else "native_pyautogui",
        "endpoint": "/ws/computer-use"
    }

@app.websocket("/ws/computer-use")
async def ws_computer_use(websocket: WebSocket):
    await websocket.accept()
    if websocket.client_state.value != 1:  # CONNECTED
        log.error("WebSocket accept failed or already closed")
        return
        
    log.info(f"New WebSocket connection for Computer Use (mode: {'relay' if IS_DOCKER else 'native'})")
    
    # Create the right tools depending on environment
    if IS_DOCKER:
        tools = FrontendRelayTools(websocket=websocket)
    else:
        tools = ComputerUseTools()
    
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    MODEL = os.environ.get("COMPUTER_USE_MODEL", "gemini-2.5-computer-use-preview-10-2025")
    
    # Queue for incoming prompts — the receive loop puts prompts here,
    # and the execution loop picks them up.
    prompt_queue = asyncio.Queue()
    stop_event = asyncio.Event()
    
    async def receive_loop():
        """Continuously receive WebSocket messages. Routes screenshot_response 
        to the tools and prompt messages to the execution queue."""
        try:
            while not stop_event.is_set():
                try:
                    data = await websocket.receive_text()
                except (WebSocketDisconnect, RuntimeError):
                    log.info("WebSocket disconnected")
                    stop_event.set()
                    break
                    
                msg = json.loads(data)
                msg_type = msg.get("type", "")
                
                if msg_type == "prompt":
                    await prompt_queue.put(msg)
                    
                elif msg_type == "screenshot_response":
                    # Route to FrontendRelayTools — unblocks tools.screenshot()
                    if IS_DOCKER and isinstance(tools, FrontendRelayTools):
                        screenshot_b64 = msg.get("data", "")
                        if screenshot_b64:
                            tools.receive_screenshot(screenshot_b64)
                        if msg.get("width") and msg.get("height"):
                            tools.update_screen_size(msg["width"], msg["height"])
                            
                elif msg_type == "viewport_info":
                    if IS_DOCKER and isinstance(tools, FrontendRelayTools):
                        tools.update_screen_size(msg.get("width", 1280), msg.get("height", 800))
        except Exception as e:
            log.error(f"Receive loop error: {e}")
            stop_event.set()
    
    async def execution_loop():
        """Pick prompts from queue and execute them."""
        try:
            while not stop_event.is_set():
                try:
                    msg = await asyncio.wait_for(prompt_queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue
                
                user_prompt = msg.get("text", "")
                full_prompt = f"{COMPUTER_USE_PROMPT}\n\nTask: {user_prompt}"
                await safe_send_json(websocket, {"type": "info", "text": f"Starting task: {user_prompt}"})
                await execute_computer_use_loop(full_prompt, websocket, client, (MODEL, tools))
        except Exception as e:
            log.error(f"Execution loop error: {e}")
    
    try:
        # Run BOTH loops concurrently — this is the key fix.
        # receive_loop handles screenshot_response while execute_computer_use_loop runs.
        await asyncio.gather(receive_loop(), execution_loop())
    except Exception as e:
        log.error(f"WS unexpected error: {e}")
        traceback.print_exc()
    finally:
        try:
            if websocket.client_state.value < 2: 
                await websocket.close()
        except Exception:
            pass
        log.info("WebSocket connection closed")

async def safe_send_json(websocket: WebSocket, data: dict):
    """Send JSON only if the websocket is still connected. Returns True if successful."""
    try:
        if websocket.client_state.value == 1:  # CONNECTED
            await websocket.send_json(data)
            return True
    except Exception as e:
        log.debug(f"Failed to send JSON: {e}")
    return False

async def execute_computer_use_loop(prompt, websocket, client, config):
    model_id, tools = config
    
    import base64
    def base64_decode(s): return base64.b64decode(s)

    # Get initial screenshot — required to start
    screenshot = await tools.screenshot()
    if not screenshot:
        log.warning("No screenshot available — cannot start computer use loop")
        await safe_send_json(websocket, {"type": "complete", "text": "No screenshot available. The frontend must send screenshots for the computer agent to work."})
        return

    # Detect mime type based on magic bytes
    screenshot_bytes = base64_decode(screenshot)
    mime_type = 'image/jpeg' if screenshot_bytes.startswith(b'\xff\xd8') else 'image/png'

    contents = [
        types.Content(
            role="user",
            parts=[
                types.Part(text=prompt),
                types.Part.from_bytes(data=screenshot_bytes, mime_type=mime_type)
            ]
        )
    ]
    
    gen_config = types.GenerateContentConfig(
        tools=[types.Tool(computer_use=types.ComputerUse(environment=types.Environment.ENVIRONMENT_BROWSER))]
    )

    for i in range(15): 
        response = await client.aio.models.generate_content(
            model=model_id,
            contents=contents,
            config=gen_config,
        )
        
        if not response.candidates:
            log.warning(f"Step {i+1}: Model returned no candidates (image may be too small or blocked). Stopping.")
            await safe_send_json(websocket, {"type": "complete", "text": "Model could not process the screenshot. Please ensure the frontend is sending screenshots."})
            break
        
        candidate = response.candidates[0]
        contents.append(candidate.content)
        
        # Log thought to UI
        thought = ""
        if candidate.content and candidate.content.parts:
            thought = " ".join([p.text for p in candidate.content.parts if p.text])
        
        if thought:
            if not await safe_send_json(websocket, {"type": "status", "text": thought}):
                log.info("Client disconnected, stopping execution loop")
                return
            
        function_calls = []
        if candidate.content and candidate.content.parts:
            function_calls = [p.function_call for p in candidate.content.parts if p.function_call]
        if not function_calls:
            await safe_send_json(websocket, {"type": "complete", "text": thought})
            break
            
        for fc in function_calls:
            log.info(f"Model Tool Call: {fc.name} with {fc.args}")
            if not await safe_send_json(websocket, {"type": "action", "name": fc.name, "args": fc.args}):
                log.info("Client disconnected during tool call, stopping")
                return
            
            # Execute — same action handlers for both native and relay
            result = f"Error: function {fc.name} not implemented"
            
            if fc.name == "click":
                result = await tools.mouse_control("click", fc.args.get("x"), fc.args.get("y"))
            elif fc.name == "type":
                result = await tools.keyboard_control("type", fc.args.get("text"))
            elif fc.name == "move":
                result = await tools.mouse_control("move", fc.args.get("x"), fc.args.get("y"))
            elif fc.name == "key":
                result = await tools.keyboard_control("press", fc.args.get("key"))
            elif fc.name == "navigate":
                url = fc.args.get("url", FRONTEND_URL)
                log.info(f"Navigation requested to {url}")
                if IS_DOCKER:
                    # In Docker/Cloud Run, tell the frontend to navigate
                    await safe_send_json(websocket, {
                        "type": "computer_action",
                        "action": "navigate",
                        "url": url
                    })
                    await asyncio.sleep(1)
                    result = f"Navigation to {url} requested via frontend"
                else:
                    # Native mode — use keyboard to navigate
                    await tools.keyboard_control("hotkey", "ctrl,l")
                    await asyncio.sleep(0.5)
                    await tools.keyboard_control("type", url)
                    await asyncio.sleep(0.2)
                    result = await tools.keyboard_control("press", "enter")
            elif fc.name == "wait":
                result = await tools.wait(fc.args.get("ms", 1000))
            
            # LEGACY / MODEL VARIATIONS
            elif fc.name == "click_at":
                result = await tools.mouse_control("click", fc.args.get("x"), fc.args.get("y"))
            elif fc.name == "type_text_at":
                await tools.mouse_control("click", fc.args.get("x"), fc.args.get("y"))
                result = await tools.keyboard_control("type", fc.args.get("text"))
                if fc.args.get("press_enter"):
                    await tools.keyboard_control("press", "enter")
            elif fc.name == "scroll_at":
                direction = fc.args.get("direction", "down")
                if IS_DOCKER and hasattr(tools, 'scroll'):
                    result = await tools.scroll(direction)
                else:
                    result = await tools.keyboard_control("press", "page_down" if direction == "down" else "page_up")
            elif fc.name == "open_web_browser":
                # Don't actually open a browser — it's already open in the user's tab
                result = "Browser is already open. The user's application is visible."
            
            log.info(f"Tool execution result: {result}")
            
            new_screenshot = await tools.screenshot()
            
            response_parts = [
                types.Part(
                    function_response=types.FunctionResponse(
                        name=fc.name,
                        id=fc.id,
                        response={"result": result, "url": FRONTEND_URL}
                    )
                )
            ]
            # Only include screenshot if we actually got one
            if new_screenshot:
                new_screenshot_bytes = base64.b64decode(new_screenshot)
                new_mime_type = 'image/jpeg' if new_screenshot_bytes.startswith(b'\xff\xd8') else 'image/png'
                response_parts.append(
                    types.Part.from_bytes(
                        data=new_screenshot_bytes,
                        mime_type=new_mime_type
                    )
                )
            
            contents.append(
                types.Content(role="user", parts=response_parts)
            )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=AGENT_PORT)
