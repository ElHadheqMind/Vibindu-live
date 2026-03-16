"""
Storyteller Agent Server — FastAPI
Exposes the StoryProjectteller as an HTTP API on port 3005.
"""

import os
import asyncio
import base64
import logging
import json
from fastapi import FastAPI, HTTPException, WebSocket
from pydantic import BaseModel
from typing import Optional
from pathlib import Path
from dotenv import load_dotenv

# Import the refactored agent
from story_projectteller_agent import StoryProjectteller

# Load environment variables
env_file = Path(__file__).parent / ".env"
if not env_file.exists():
    env_file = Path(__file__).parent.parent / ".env"
load_dotenv(env_file, override=True)

log = logging.getLogger("storyteller_server")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Storyteller Agent Server", version="2.0.0")

# Agent instance
api_key = os.environ.get("GEMINI_API_KEY")
if api_key:
    log.info(f"Server Startup: GEMINI_API_KEY present ({api_key[:5]}...{api_key[-5:]})")
else:
    log.error("Server Startup: GEMINI_API_KEY IS MISSING!")

agent = StoryProjectteller()


class StoryRequest(BaseModel):
    prompt: Optional[str] = None
    spec_content: Optional[str] = None
    projectPath: Optional[str] = None


@app.post("/storytell")
async def create_story(req: StoryRequest):
    log.info(f"Request received — prompt='{(req.prompt or '')[:60]}' projectPath={req.projectPath}")
    try:
        base_dir = os.path.dirname(__file__)
        spec_path = os.path.abspath(os.path.join(base_dir, "..", "..", "test_project", "spec.md"))

        spec_content = req.spec_content
        if not spec_content:
            spec_content = "Default simple spec: An automated conveyor belt sorting system."

            # Try to find spec.md from various paths (more robustly)
            candidate_paths = []
            if req.projectPath:
                # 1. Directly in project path
                candidate_paths.append(os.path.join(req.projectPath, "spec.md"))
                # 2. In project path / data (some structures use this)
                candidate_paths.append(os.path.join(req.projectPath, "data", "spec.md"))
                # 3. In parent of project path (if we are inside a subfolder like StoryExperience)
                candidate_paths.append(os.path.abspath(os.path.join(req.projectPath, "..", "spec.md")))
                # 4. Relative to server base (legacy/local)
                candidate_paths.append(os.path.abspath(os.path.join(base_dir, "..", "..", req.projectPath, "spec.md")))
            
            # 5. Global test project default
            candidate_paths.append(spec_path)

            log.info(f"Searching for spec.md in: {candidate_paths}")

            for path in candidate_paths:
                if os.path.exists(path):
                    try:
                        with open(path, "r", encoding="utf-8") as f:
                            spec_content = f.read()
                        log.info(f"SUCCESS: Loaded spec.md from: {path}")
                        break
                    except Exception as e:
                        log.warning(f"Could not read spec at {path}: {e}")
            else:
                log.warning(f"No spec.md found in {len(candidate_paths)} candidates, using default.")

        if req.prompt:
            spec_content = f"CONTEXT SPECIFICATION:\n{spec_content}\n\nUSER PROMPT:\n{req.prompt}"

        # Determine output directory
        target_output_dir = base_dir
        if req.projectPath:
            if not os.path.isabs(req.projectPath):
                target_output_dir = os.path.abspath(os.path.join(base_dir, "..", "..", req.projectPath))
            else:
                target_output_dir = req.projectPath

        log.info(f"Output directory: {target_output_dir}")

        # Run the storyteller pipeline
        result = await agent.tell_story(spec_content, output_dir=target_output_dir)

        # Build response
        final_filename = result.get("filename", "StoryExperience/Story.html")
        final_path = os.path.join(target_output_dir, final_filename)

        return {
            "success": True,
            "message": f"Story generated: {final_path}",
            "data": {
                "story": result.get("story"),
                "filename": final_filename,
                "path": final_path,
                "audioB64": result.get("audioB64"),
                "imageB64": result.get("imageB64"),
                "audioReady": result.get("audioB64") is not None,
                "imageReady": result.get("imageB64") is not None,
                "plan": result.get("plan"),
            }
        }
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        log.error(f"Storyteller server error:\n{error_trace}")
        return {"success": False, "error": str(e), "trace": error_trace}


@app.websocket("/ws/story")
async def ws_story(websocket: WebSocket):
    await websocket.accept()
    
    # Import the module to set the active websocket
    import story_projectteller_agent as spa
    spa.active_websocket = websocket
    
    try:
        data = await websocket.receive_text()
        msg = json.loads(data)
        
        if msg.get("type") == "prompt":
            prompt = msg.get("text", "")
            project_path = msg.get("projectPath") or msg.get("project_path") or ""
            
            base_dir = os.path.dirname(__file__)
            spec_path = os.path.abspath(os.path.join(base_dir, "..", "..", "test_project", "spec.md"))

            spec_content = "Default simple spec: An automated conveyor belt sorting system."

            candidate_paths = []
            if project_path:
                candidate_paths.append(os.path.join(project_path, "spec.md"))
                candidate_paths.append(os.path.join(project_path, "data", "spec.md"))
                candidate_paths.append(os.path.abspath(os.path.join(project_path, "..", "spec.md")))
                candidate_paths.append(os.path.abspath(os.path.join(base_dir, "..", "..", project_path, "spec.md")))
            
            candidate_paths.append(spec_path)

            for path in candidate_paths:
                if os.path.exists(path):
                    try:
                        with open(path, "r", encoding="utf-8") as f:
                            spec_content = f.read()
                        break
                    except Exception:
                        pass
            
            if prompt:
                spec_content = f"CONTEXT SPECIFICATION:\n{spec_content}\n\nUSER PROMPT:\n{prompt}"

            target_output_dir = base_dir
            if project_path:
                if not os.path.isabs(project_path):
                    target_output_dir = os.path.abspath(os.path.join(base_dir, "..", "..", project_path))
                else:
                    target_output_dir = project_path

            try:
                backend_url = os.environ.get("BACKEND_URL", "http://backend:3001")
                persist_url = f"{backend_url}/api/vibe/persist-story"
                
                async def handle_asset(asset_type: str, asset_filename: str, b64_data: str):
                    log.info(f"[WS] Asset generated: {asset_type} - {asset_filename}")
                    try:
                        import aiohttp
                        async with aiohttp.ClientSession() as persist_session:
                            async with persist_session.post(persist_url, json={
                                "projectPath": project_path,
                                "assets": [{"filename": asset_filename, "b64": b64_data}]
                            }, headers={"x-agent-secret": "antigravity-local-agent"}, timeout=aiohttp.ClientTimeout(total=45)) as resp:
                                if resp.status == 200:
                                    log.info(f"[WS] ✅ Asset persisted via backend StorageService: {asset_filename}")
                                else:
                                    log.warning(f"[WS] ⚠️ Backend persist-story returned {resp.status} for asset {asset_filename}")
                    except Exception as pe:
                        log.warning(f"[WS] ⚠️ Could not persist asset '{asset_filename}' via backend: {pe}")

                    # Broadcast the asset immediately to the live agent over WebSocket
                    try:
                        await websocket.send_json({
                            "type": "asset_generated",
                            "agent": "Creative Storyteller",
                            "asset_type": asset_type,
                            "filename": asset_filename,
                            "b64": b64_data
                        })
                    except RuntimeError as re:
                        log.warning(f"[WS] ⚠️ Cannot send asset_generated, websocket closed: {re}")
                    except Exception as e:
                        log.warning(f"[WS] ⚠️ Unexpected error sending asset_generated: {e}")

                result = await agent.tell_story(
                    spec_content, 
                    output_dir=target_output_dir, 
                    on_asset_generated=handle_asset
                )
                
                # Persist story through backend's StorageService (handles GCS + local)
                backend_url = os.environ.get("BACKEND_URL", "http://backend:3001")
                persist_url = f"{backend_url}/api/vibe/persist-story"
                try:
                    import aiohttp
                    async with aiohttp.ClientSession() as session:
                        async with session.post(persist_url, json={
                            "projectPath": project_path,
                            "storyHtml": result.get("story", ""),
                            "filename": result.get("filename", "Story.html"),
                            "assets": result.get("assets", [])
                        }, headers={"x-agent-secret": "antigravity-local-agent"}, timeout=aiohttp.ClientTimeout(total=45)) as resp:
                            if resp.status == 200:
                                persist_result = await resp.json()
                                log.info(f"[WS] ✅ Story persisted via backend StorageService: {persist_result.get('savedPath')}")
                            else:
                                log.warning(f"[WS] ⚠️ Backend persist-story returned {resp.status}")
                except Exception as pe:
                    log.warning(f"[WS] ⚠️ Could not persist story via backend (file already on disk): {pe}")

                try:
                    await websocket.send_json({
                        "type": "story_result",
                        "agent": "Creative Storyteller",
                        "plan": result.get("plan"),
                        "story": result.get("story"),
                        "imageB64": result.get("imageB64"),
                        "audioB64": result.get("audioB64"),
                        "filename": result.get("filename")
                    })
                except RuntimeError as re:
                    log.warning(f"[WS] ⚠️ Cannot send story_result, websocket closed: {re}")
            except Exception as e:
                import traceback
                log.error(traceback.format_exc())
                await websocket.send_json({
                    "type": "error",
                    "agent": "Creative Storyteller",
                    "text": str(e)
                })
    except Exception as e:
        log.error(f"WebSocket error: {e}")
    finally:
        spa.active_websocket = None
        try:
            await websocket.close()
        except Exception:
            pass


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0", "models": {
        "text": "gemini-3.1-flash-lite-preview",
        "image": "imagen-4.0 (Nano Banana)",
        "video": "veo-3.0-fast",
        "audio": "gemini-2.5-flash-tts"
    }}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3005)
