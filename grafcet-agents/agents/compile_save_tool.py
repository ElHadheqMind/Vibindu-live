import aiohttp
import logging
import os
import json
import aiofiles
from typing import Optional
from base_tool import BaseTool

# ADK 2026: Import ToolContext for direct state management
try:
    from google.adk.tools import ToolContext
except ImportError:
    ToolContext = None  # Fallback for testing

logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:3001" if os.getenv("IS_DOCKER", "false").lower() == "true" else "http://localhost:3001")
STORAGE_PATH = os.getenv("STORAGE_PATH", "")

class CompileAndSaveSFCTool(BaseTool):
    """Compiles SFC DSL code and saves it as a JSON diagram file.

    ADK 2026 Pattern: Uses ToolContext.state for direct state management.
    Appends to: tool_context.state['sfc_files']
    """

    def __init__(
        self,
        compile_url: str = f"{BACKEND_URL}/api/sfc/compile",
        save_url: str = f"{BACKEND_URL}/api/files/save-diagram"
    ):
        super().__init__(
            name="CompileAndSaveSFC",
            description="Compiles SFC DSL code and saves it as a JSON diagram if successful.",
        )
        self.compile_url = compile_url
        self.save_url = save_url

    async def compile_and_save_sfc(
        self,
        sfc_code: str,
        mode_id: str,
        project_path: str,
        sfc_name: str,
        tool_context: Optional["ToolContext"] = None  # ADK 2026: ToolContext for state
    ) -> dict:
        """Compile SFC DSL code and save the resulting diagram to a file.

        Takes SFC DSL source code, compiles it to a GRAFCET diagram JSON structure,
        and saves it to the appropriate location based on the mode_id.

        Args:
            sfc_code: The SFC DSL source code as a string. Must follow SFC DSL syntax:
                - Start with: SFC "Title"
                - Define steps: Step 0 (Initial), Step 1, Step 2, etc.
                - Define transitions: Transition T0 "condition"
                - Use Divergence AND/OR for parallel/alternative paths
            mode_id: GSRSM mode identifier (e.g. "A1", "F1", "D1").
                - If provided: saves to {project_path}/modes/{mode_id}/{sfc_name}.sfc
                - If empty: saves to {project_path}/{sfc_name}.sfc
            project_path: Path to the project folder (e.g. "my_project").
            sfc_name: Name for the output file (without extension, e.g. "default").

        Returns:
            dict with keys:
                - success (bool): True if compilation and save succeeded
                - path (str): Full path where the file was saved
                - message (str): Status message
                - error (str): Error message if failed
        """
        # Fallback to context state if LLM forgets project_path
        if not project_path and tool_context is not None:
            project_path = tool_context.state.get("project_path", "")

        # Construct path based on mode_id
        if mode_id:
            target_dir = f"{project_path}/modes/{mode_id}"
        else:
            target_dir = project_path
            
        logger.info(f"[{self.name}] Compiling SFC: {sfc_name} for Mode: {mode_id} in {target_dir}")
        
        headers = {"x-agent-secret": "antigravity-local-agent"}
        
        async with aiohttp.ClientSession(headers=headers) as session:
            try:
                # 1. Compile
                compile_payload = {"code": sfc_code, "title": sfc_name}
                
                async with session.post(self.compile_url, json=compile_payload) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        return {
                            "success": False, 
                            "error": f"Compilation failed for '{sfc_name}': {error_text}"
                        }
                    
                    data = await response.json()
                    generated_sfc = data.get("generatedSFC")
                    
                    if not generated_sfc:
                        return {
                            "success": False, 
                            "error": f"Compiler returned no SFC data for '{sfc_name}'"
                        }

                # 2. Save via Backend API (works with Cloud Run GCS driver)
                target_filename = f"{sfc_name}.sfc" if not sfc_name.endswith(".sfc") else sfc_name
                
                # Use forward slash for the relative GCS path
                relative_target_dir = target_dir.replace("\\", "/")
                diagram_path = f"{relative_target_dir}/{target_filename}"
                
                try:
                    save_payload = {
                        "diagramPath": diagram_path,
                        "diagram": generated_sfc
                    }
                    async with session.post(self.save_url, json=save_payload) as save_resp:
                        if save_resp.status != 200:
                            save_err = await save_resp.text()
                            raise Exception(f"Backend API save failed: {save_err}")
                            
                        save_data = await save_resp.json()
                        if not save_data.get("success"):
                            raise Exception(save_data.get("error", "Unknown backend error"))
                            
                        full_target_path = save_data.get("savedPath", diagram_path)

                    logger.info(f"[{self.name}] Saved successfully via API to {diagram_path}")

                    # SFC file metadata for state tracking
                    # ADK 2026: Store BOTH metadata AND sfc_code for SimulationAgent access
                    sfc_file = {
                        "name": target_filename,
                        "mode_id": mode_id or "",
                        "path": full_target_path,
                        "success": True,
                        "sfc_code": sfc_code,  # Original DSL code
                        "sfc_content": generated_sfc  # Compiled JSON diagram
                    }

                    # ADK 2026: Append to ToolContext.state['sfc_files']
                    if tool_context is not None:
                        if "sfc_files" not in tool_context.state:
                            tool_context.state["sfc_files"] = []
                        tool_context.state["sfc_files"].append(sfc_file)
                        logger.info(f"[{self.name}] Appended sfc_file to tool_context.state['sfc_files']")

                    # Broadcast sfc_generated to trigger frontend image generation and chat update
                    try:
                        async with session.post(
                            "http://127.0.0.1:8000/api/broadcast",
                            json={"payload": {
                                "type": "sfc_generated",
                                "sfc_file": sfc_file
                            }}
                        ) as broadcast_resp:
                            if broadcast_resp.status == 200:
                                logger.info(f"[{self.name}] Broadcast sfc_generated sent")
                    except Exception as be:
                        logger.warning(f"[{self.name}] Broadcast failed (non-critical): {be}")

                    return {
                        "success": True,
                        "path": full_target_path,
                        "message": f"Successfully compiled and saved {sfc_name}",
                        "sfc_file": sfc_file
                    }
                except Exception as e:
                    sfc_file = {
                        "name": f"{sfc_name}.sfc",
                        "mode_id": mode_id or "",
                        "path": "",
                        "success": False
                    }
                    # ADK 2026: Track failures too
                    if tool_context is not None:
                        if "sfc_files" not in tool_context.state:
                            tool_context.state["sfc_files"] = []
                        tool_context.state["sfc_files"].append(sfc_file)

                    return {
                        "success": False,
                        "error": f"Local save failed: {str(e)}",
                        "sfc_file": sfc_file
                    }

            except Exception as e:
                logger.error(f"[{self.name}] Failed: {e}")
                sfc_file = {
                    "name": f"{sfc_name}.sfc",
                    "mode_id": mode_id or "",
                    "path": "",
                    "success": False
                }
                return {
                    "success": False,
                    "error": str(e),
                    "sfc_file": sfc_file
                }
