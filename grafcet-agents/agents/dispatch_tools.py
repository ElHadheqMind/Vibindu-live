import aiohttp
import json
import asyncio
import logging
import os

log = logging.getLogger("dispatch_tools")

IS_DOCKER = os.getenv("IS_DOCKER", "false").lower() == "true"
PORT = os.getenv("PORT", "8000")

# Orchestrator URL for broadcasting (internal or cross-boundary)
# Inside Docker reaching Host: host.docker.internal
# On Host reaching Docker: localhost
ORCHESTRATOR_URL = os.getenv("ORCHESTRATOR_URL", f"http://localhost:{PORT}" if IS_DOCKER else "http://localhost:3002")
COMPUTER_AGENT_URL = os.getenv("COMPUTER_AGENT_URL", f"ws://localhost:{PORT}/computer/ws/computer-use" if IS_DOCKER else "ws://localhost:3004/ws/computer-use")
STORYTELLER_URL = os.getenv("STORYTELLER_URL", f"http://localhost:{PORT}/storyteller/storytell" if IS_DOCKER else "http://localhost:3005/storytell")

async def broadcast_to_vibe(text: str, agent: str = "System", event_type: str = "status", **kwargs):
    """Notify the Orchestrator's broadcast endpoint so the frontend sidebar can sync."""
    try:
        async with aiohttp.ClientSession() as session:
            payload = {
                "type": "status" if event_type == "status" else event_type,
                "text": text,
                "agent": agent
            }
            payload.update(kwargs)
            async with session.post(f"{ORCHESTRATOR_URL}/api/broadcast", json={"payload": payload}) as resp:
                if resp.status != 200:
                    pass # Silently fail if orchestrator not ready
    except Exception:
        pass

class DispatchTools:
    """Tools to dispatch tasks to specialized A2A agents (Computer Use, Storyteller)."""
    
    async def dispatch_to_computer_agent(self, query: str, **kwargs) -> str:
        """
        Dispatches a visual UI automation task to the Computer Use Agent.
        Use this when the user wants to interact with the browser/editor UI (clicks, typing, navigation).
        """
        url = COMPUTER_AGENT_URL
        agent_name = "Computer Agent"
        
        # Initial status
        await broadcast_to_vibe("Computer Agent is taking control of the browser...", agent_name)
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.ws_connect(url) as ws:
                    await ws.send_json({"type": "prompt", "text": query})
                    
                    final_text = "Task timed out"
                    async for msg in ws:
                        if msg.type == aiohttp.WSMsgType.TEXT:
                            data = json.loads(msg.data)
                            msg_type = data.get("type")
                            text = data.get("text", "")
                            
                            if msg_type == "complete":
                                final_text = f"✅ Computer Agent Task Complete: {text}"
                                await broadcast_to_vibe(final_text, agent_name)
                                return final_text
                            elif msg_type == "error":
                                final_text = f"❌ Computer Agent Error: {data.get('message', 'Unknown error')}"
                                await broadcast_to_vibe(final_text, agent_name, "error")
                                return final_text
                            elif msg_type == "status" or msg_type == "action":
                                # Relay progress to Vibe Sidebar
                                display_text = text if msg_type == "status" else f"Executing: {data.get('name', 'action')}"
                                await broadcast_to_vibe(display_text, agent_name, msg_type)
            
            return "Computer Agent Dispatched"
        except Exception as e:
            err_msg = f"Failed to dispatch to Computer Agent: {e}"
            await broadcast_to_vibe(err_msg, agent_name, "error")
            return err_msg

    async def dispatch_to_storyteller(self, prompt: str, project_path: str = "", **kwargs) -> str:
        """
        Dispatches a creative storytelling task to the Storyteller Agent.
        Generates cinematic narratives, images, and videos of the automation system.
        """
        agent_name = "Creative Storyteller"
        url = STORYTELLER_URL
        
        await broadcast_to_vibe("Creative Storyteller is designing the narrative...", agent_name)
        
        payload = {
            "prompt": prompt,
            "projectPath": project_path
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        data = result.get("data", {})
                        if result.get("success") and data.get("story"):
                            plan = data.get("plan", {})
                            msg = f"✨ Cinematic Story Ready: {plan.get('title', 'Story')}"
                            
                            # Broadcast result with multimedia
                            await broadcast_to_vibe(
                                msg, 
                                agent_name, 
                                "story_result",
                                imageData=data.get("imageB64"),
                                audioData=data.get("audioB64")
                            )
                            return msg
                        else:
                            err = result.get("error", "Unknown error")
                            await broadcast_to_vibe(f"Storyteller error: {err}", agent_name, "error")
                            return f"Storyteller failed: {err}"
                    else:
                        return f"Storyteller API error: HTTP {resp.status}"
        except Exception as e:
            return f"Storyteller dispatch error: {e}"

dispatch_tools = DispatchTools()
