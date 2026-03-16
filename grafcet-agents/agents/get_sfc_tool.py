"""
GetSFCContentTool - Retrieves SFC file content for simulation

This tool reads SFC files from the file system and returns their content
so the simulation agent can understand the SFC structure before running simulation.
"""

import aiohttp
import aiofiles
import json
import os
import logging
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

class GetSFCContentTool(BaseTool):
    """Retrieves SFC file content from the file system or backend.

    ADK 2026 Pattern: Uses ToolContext.state for direct state management.
    Reads from: tool_context.state['sfc_files'], tool_context.state['project_path']
    """

    def __init__(self, api_base: str = f"{BACKEND_URL}/api"):
        super().__init__(
            name="GetSFCContent",
            description="Retrieves SFC file content (JSON diagram) for a specific mode and file. Use this to get the SFC structure before running simulation.",
        )
        self.api_base = api_base

    async def get_sfc_content(
        self,
        project_path: str,
        mode_id: str = "",
        file_name: str = "default.sfc",
        tool_context: Optional["ToolContext"] = None,
        **kwargs
    ) -> dict:
        """Get SFC file content from the file system.

        Args:
            project_path: Path to the project folder (e.g. "users/agent/ColorSorting").
            mode_id: GSRSM mode folder name (e.g. "A1", "F1", "D1"). Empty for root files like conduct.sfc.
            file_name: Name of the SFC file (default: "default.sfc").
            tool_context: ADK ToolContext for state access.

        Returns:
            dict with keys:
                - success (bool): True if file was loaded
                - sfc_content (dict): The SFC diagram JSON content
                - file_path (str): Full path to the file
                - mode_id (str): The mode ID
                - mode_name (str): Human-readable mode name
                - project_name (str): Project name extracted from path
                - steps (list): List of steps in the SFC
                - transitions (list): List of transitions in the SFC
                - error (str): Error message if failed
        """
        # Extract project name from path
        project_name = project_path.rstrip("/\\").split("/")[-1].split("\\")[-1] if project_path else "Unknown"
        
        # Map mode_id to mode_name
        mode_names = {
            "A1": "Initial Stop",
            "A5": "Restart Preparation",
            "A6": "Reset/Initialization",
            "D1": "Emergency Stop",
            "F1": "Normal Production",
            "F2": "Manual Mode",
            "F3": "Test Mode",
            "": "Conduct"
        }
        mode_name = mode_names.get(mode_id, mode_id or "Root")
        
        logger.info(f"[{self.name}] Getting SFC content for project '{project_name}', mode '{mode_id}' ({mode_name}), file '{file_name}'")

        # Construct file path
        if mode_id:
            file_path = os.path.join(project_path, "modes", mode_id, file_name)
        else:
            file_path = os.path.join(project_path, file_name)
        
        # Normalize path
        file_path = file_path.replace("\\", "/")
        
        logger.info(f"[{self.name}] Looking for file at: {file_path}")

        # Try to read from local file system first
        try:
            # Check multiple possible base paths
            possible_paths = [
                file_path,
                os.path.join("users", file_path),
                os.path.join("..", "users", file_path),
            ]
            # Add STORAGE_PATH-based path for Docker
            if STORAGE_PATH:
                possible_paths.insert(0, os.path.join(STORAGE_PATH, file_path))
            
            sfc_content = None
            actual_path = None
            
            for path in possible_paths:
                normalized_path = path.replace("\\", "/")
                if os.path.exists(normalized_path):
                    async with aiofiles.open(normalized_path, 'r', encoding='utf-8') as f:
                        content = await f.read()
                        sfc_content = json.loads(content)
                        actual_path = normalized_path
                        logger.info(f"[{self.name}] Found file at: {actual_path}")
                        break
            
            if sfc_content:
                # Extract steps and transitions from the SFC
                elements = sfc_content.get("elements", [])
                steps = [e for e in elements if e.get("type") == "step"]
                transitions = [e for e in elements if e.get("type") == "transition"]
                
                # Build summary
                step_summary = []
                for step in steps:
                    step_info = {
                        "id": step.get("id"),
                        "label": step.get("label", ""),
                        "stepType": step.get("stepType", "normal"),
                        "actions": step.get("actions", [])
                    }
                    step_summary.append(step_info)
                
                transition_summary = []
                for trans in transitions:
                    trans_info = {
                        "id": trans.get("id"),
                        "label": trans.get("label", ""),
                        "condition": trans.get("condition", "")
                    }
                    transition_summary.append(trans_info)
                
                result = {
                    "success": True,
                    "project_name": project_name,
                    "mode_id": mode_id,
                    "mode_name": mode_name,
                    "file_name": file_name,
                    "file_path": actual_path,
                    "sfc_content": sfc_content,
                    "sfc_name": sfc_content.get("name", "Unknown SFC"),
                    "step_count": len(steps),
                    "transition_count": len(transitions),
                    "steps": step_summary,
                    "transitions": transition_summary
                }
                
                logger.info(f"[{self.name}] Successfully loaded SFC with {len(steps)} steps and {len(transitions)} transitions")
                return result
            
        except json.JSONDecodeError as e:
            logger.error(f"[{self.name}] Invalid JSON in SFC file: {e}")
            return {
                "success": False,
                "error": f"Invalid JSON in SFC file: {str(e)}",
                "project_name": project_name,
                "mode_id": mode_id,
                "mode_name": mode_name,
                "file_path": file_path
            }
        except Exception as e:
            logger.warning(f"[{self.name}] Local file read failed: {e}")

        # Fallback: Try to get from backend API
        try:
            headers = {"x-agent-secret": "antigravity-local-agent"}
            
            async with aiohttp.ClientSession(headers=headers) as session:
                # Use the load-diagram endpoint
                payload = {"path": file_path}
                
                async with session.post(f"{self.api_base}/files/load-diagram", json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        if data.get("success"):
                            sfc_content = data.get("diagram", {})
                            elements = sfc_content.get("elements", [])
                            steps = [e for e in elements if e.get("type") == "step"]
                            transitions = [e for e in elements if e.get("type") == "transition"]
                            
                            result = {
                                "success": True,
                                "project_name": project_name,
                                "mode_id": mode_id,
                                "mode_name": mode_name,
                                "file_name": file_name,
                                "file_path": file_path,
                                "sfc_content": sfc_content,
                                "sfc_name": sfc_content.get("name", "Unknown SFC"),
                                "step_count": len(steps),
                                "transition_count": len(transitions),
                                "steps": [{"id": s.get("id"), "label": s.get("label", ""), "stepType": s.get("stepType", "normal")} for s in steps],
                                "transitions": [{"id": t.get("id"), "label": t.get("label", ""), "condition": t.get("condition", "")} for t in transitions]
                            }
                            
                            logger.info(f"[{self.name}] Loaded SFC from backend API")
                            return result
                    
                    error_text = await response.text()
                    logger.error(f"[{self.name}] Backend API failed: {error_text}")
                    
        except Exception as e:
            logger.error(f"[{self.name}] Backend API request failed: {e}")

        # File not found
        return {
            "success": False,
            "error": f"SFC file not found: {file_path}",
            "project_name": project_name,
            "mode_id": mode_id,
            "mode_name": mode_name,
            "file_path": file_path,
            "suggestion": "Make sure the project has been built and SFC files have been generated."
        }

    def get_sfc_from_state(
        self,
        sfc_name: str,
        mode_id: str = "",
        tool_context: Optional["ToolContext"] = None,
        **kwargs
    ) -> dict:
        """Get SFC content directly from tool_context.state['sfc_files'].

        ADK 2026 Pattern: Retrieves SFC from shared state instead of filesystem.
        Use this when SFC was just generated and is already in state.

        Args:
            sfc_name: Name of the SFC file (e.g. "default.sfc", "conduct.sfc").
            mode_id: GSRSM mode ID (e.g. "A1", "F1"). Empty for conduct.sfc.
            tool_context: ADK ToolContext for state access.

        Returns:
            dict with keys:
                - success (bool): True if SFC found in state
                - sfc_code (str): Original DSL code
                - sfc_content (dict): Compiled JSON diagram
                - mode_id (str): Mode ID
                - file_name (str): File name
                - path (str): File path where saved
        """
        if tool_context is None:
            return {
                "success": False,
                "error": "tool_context is required to read from state",
                "sfc_name": sfc_name,
                "mode_id": mode_id
            }

        sfc_files = tool_context.state.get("sfc_files", [])

        if not sfc_files:
            return {
                "success": False,
                "error": "No SFC files found in state. Generate SFCs first.",
                "sfc_name": sfc_name,
                "mode_id": mode_id
            }

        # Normalize sfc_name
        if not sfc_name.endswith(".sfc"):
            sfc_name = f"{sfc_name}.sfc"

        # Search for matching SFC by name and mode_id
        for sfc_file in sfc_files:
            file_name = sfc_file.get("name", "")
            file_mode_id = sfc_file.get("mode_id", "")

            # Match by name and mode_id (both must match)
            if file_name == sfc_name and file_mode_id == mode_id:
                logger.info(f"[{self.name}] Found SFC in state: {sfc_name} (mode={mode_id})")
                return {
                    "success": True,
                    "sfc_name": sfc_name,
                    "mode_id": mode_id,
                    "path": sfc_file.get("path", ""),
                    "sfc_code": sfc_file.get("sfc_code", ""),
                    "sfc_content": sfc_file.get("sfc_content", {}),
                    "source": "state"
                }

        # Not found in state
        available_sfcs = [
            f"{f.get('name', 'unknown')} (mode={f.get('mode_id', '')})"
            for f in sfc_files
        ]
        return {
            "success": False,
            "error": f"SFC '{sfc_name}' with mode_id='{mode_id}' not found in state",
            "sfc_name": sfc_name,
            "mode_id": mode_id,
            "available_sfcs": available_sfcs,
            "suggestion": "Check mode_id and sfc_name match exactly."
        }

