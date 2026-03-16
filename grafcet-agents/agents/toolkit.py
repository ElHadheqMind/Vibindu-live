# Collection of tools for agents to interact with the project and simulation backend.

import aiohttp
import json
import logging
import os
import aiofiles
from typing import Optional
from simulation_tool import RunSimulationTool
from stop_simulation_tool import StopSimulationTool
from base_tool import BaseTool

# ADK 2026: Import ToolContext for direct state management
try:
    from google.adk.tools import ToolContext
except ImportError:
    ToolContext = None  # Fallback for testing

logger = logging.getLogger(__name__)

# Backend URL - uses Docker service name in Docker, localhost for local dev
BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:3001" if os.getenv("IS_DOCKER", "false").lower() == "true" else "http://localhost:3001")
# Storage path - shared volume in Docker, empty for local dev
STORAGE_PATH = os.getenv("STORAGE_PATH", "")

# Orchestrator URL for broadcasting results back to the UI
ORCHESTRATOR_BROADCAST_URL = os.getenv("ORCHESTRATOR_BROADCAST_URL", "http://127.0.0.1:8000/api/broadcast")

class NavigateTool(BaseTool):
    def __init__(self, api_url: str = f"{BACKEND_URL}/api/simulation/navigate"):
        super().__init__(
            name="Navigate",
            description="Navigates to a specific file in the project (e.g. 'check default sfc in A1'). Returns the URL.",
        )
        self.api_url = api_url

    async def execute(self, project_path: str, mode_id: str = None, file_name: str = None) -> dict:
        """
        Navigates to a file.
        """
        logger.info(f"[{self.name}] Navigating to {file_name} in {mode_id} (Project: {project_path})")
        headers = {"x-agent-secret": "antigravity-local-agent"}
        async with aiohttp.ClientSession(headers=headers) as session:
            try:
                payload = {
                    "projectPath": project_path,
                    "modeId": mode_id,
                    "fileName": file_name
                }
                async with session.post(self.api_url, json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        return {
                            "success": True, 
                            "url": data.get("url"), 
                            "path": data.get("path"),
                            "message": f"Navigation successful. URL: {data.get('url')}"
                        }
                    else:
                        error_data = await response.json()
                        return {
                            "success": False, 
                            "error": error_data.get("error", "Navigation failed")
                        }
            except Exception as e:
                logger.error(f"[{self.name}] Navigation failed: {e}")
                return {"success": False, "error": str(e)}

class SfcCompilerTool(BaseTool):
    def __init__(self, api_url: str = f"{BACKEND_URL}/api/sfc/compile"):
        super().__init__(
            name="SfcCompiler",
            description="Compiles SFC DSL code into a GRAFCET diagram and returns errors if any.",
        )
        self.api_url = api_url

    async def execute(self, code: str, title: str = "Generated SFC") -> dict:
        """
        Compiles the given SFC DSL code.
        Returns a dict with 'success', 'error', 'details', and 'compiled_data' (if success).
        """
        logger.info(f"[{self.name}] Compiling SFC code...")
        logger.info(f"[{self.name}] Compiling SFC code...")
        headers = {"x-agent-secret": "antigravity-local-agent"}
        async with aiohttp.ClientSession(headers=headers) as session:
            try:
                payload = {"code": code, "title": title}
                async with session.post(self.api_url, json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        return {
                            "success": True,
                            "generatedSFC": data.get("generatedSFC"),
                            "conductSFC": data.get("conductSFC")
                        }
                    else:
                        error_data = await response.json()
                        return {
                            "success": False,
                            "error": error_data.get("error", "Unknown compilation error"),
                            "details": error_data.get("details", [])
                        }
            except Exception as e:
                logger.error(f"[{self.name}] Compilation failed: {e}")
                return {"success": False, "error": str(e)}

class SimulationConfigTool(BaseTool):
    def __init__(self, api_url: str = f"{BACKEND_URL}/api/simulation/save"):
        super().__init__(
            name="SimulationConfig",
            description="Saves the simulation configuration (variables, actions) to index.sim.",
        )
        self.api_url = api_url

    async def execute(self, project_path: str, variables: list, actions: list) -> dict:
        """
        Saves simulation configuration.
        """
        logger.info(f"[{self.name}] Saving simulation config for project: {project_path}")
        logger.info(f"[{self.name}] Saving simulation config for project: {project_path}")
        headers = {"x-agent-secret": "antigravity-local-agent"}
        async with aiohttp.ClientSession(headers=headers) as session:
            try:
                # Construct payload matching useSimulationStore structure
                simulation_data = {
                    "variables": variables,
                    "actions": actions
                }
                
                payload = {
                    "projectPath": project_path,
                    "simulation": simulation_data
                }
                
                async with session.post(self.api_url, json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        return {"success": True, "savedPath": data.get("savedPath")}
                    else:
                        error_data = await response.json()
                        return {
                            "success": False, 
                            "error": error_data.get("error", "Failed to save simulation")
                        }
            except Exception as e:
                logger.error(f"[{self.name}] Save failed: {e}")
                return {"success": False, "error": str(e)}

class SaveDiagramTool(BaseTool):
    def __init__(self, api_url: str = f"{BACKEND_URL}/api/files/save-diagram"):
        super().__init__(
            name="SaveDiagram",
            description="Saves a diagram (SFC/GSRSM) to the project.",
        )
        self.api_url = api_url

    async def execute(self, diagram_path: str, diagram: dict) -> dict:
        """
        Saves the diagram to the specified path.
        """
        logger.info(f"[{self.name}] Saving diagram to: {diagram_path}")
        async with aiohttp.ClientSession() as session:
            try:
                payload = {
                    "diagramPath": diagram_path,
                    "diagram": diagram
                }
                async with session.post(self.api_url, json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        # Broadcast project_reload to trigger frontend auto-refresh
                        try:
                            async with session.post(
                                "http://127.0.0.1:8000/api/broadcast",
                                json={"payload": {"type": "project_reload"}}
                            ) as broadcast_resp:
                                if broadcast_resp.status == 200:
                                    logger.info(f"[{self.name}] Broadcast project_reload sent")
                        except Exception as be:
                            logger.warning(f"[{self.name}] Broadcast failed (non-critical): {be}")
                        return {"success": True, "savedPath": data.get("savedPath")}
                    else:
                        error_data = await response.json()
                        return {
                            "success": False,
                            "error": error_data.get("error", "Failed to save diagram")
                        }
            except Exception as e:
                logger.error(f"[{self.name}] Save diagram failed: {e}")
                return {"success": False, "error": str(e)}

class CreateProjectTool(BaseTool):
    def __init__(self, api_url: str = f"{BACKEND_URL}/api/projects/create"):
        super().__init__(
            name="CreateProject",
            description="Creates a new project (Grafcet or Gsrsm).",
        )
        self.api_url = api_url

    async def execute(self, name: str, type: str = "grafcet", local_path: str = None) -> dict:
        """
        Creates a new project.
        """
        logger.info(f"[{self.name}] Creating project: {name} ({type})")
        headers = {"x-agent-secret": "antigravity-local-agent"}
        async with aiohttp.ClientSession(headers=headers) as session:
            try:
                payload = {
                    "name": name,
                    "type": type.lower(),
                    "localPath": local_path # Optional, backend handles defaults
                }
                async with session.post(self.api_url, json=payload) as response:
                    if response.status == 201:
                        data = await response.json()
                        return {"success": True, "project": data.get("project")}
                    else:
                        error_data = await response.json()
                        return {
                            "success": False, 
                            "error": error_data.get("error", "Failed to create project")
                        }
            except Exception as e:
                logger.error(f"[{self.name}] Create project failed: {e}")
                return {"success": False, "error": str(e)}

class CreateFileTool(BaseTool):
    def __init__(self, api_url: str = f"{BACKEND_URL}/api/files/create-file"):
        super().__init__(
            name="CreateFile",
            description="Creates a new file or folder.",
        )
        self.api_url = api_url

    async def execute(self, parent_path: str, file_name: str, file_type: str = "custom") -> dict:
        """
        Creates a new file.
        """
        logger.info(f"[{self.name}] Creating file: {file_name} in {parent_path}")
        headers = {"x-agent-secret": "antigravity-local-agent"}
        async with aiohttp.ClientSession(headers=headers) as session:
            try:
                payload = {
                    "parentPath": parent_path,
                    "fileName": file_name,
                    "fileType": file_type # grafcet, gsrsm, folder, custom
                }
                async with session.post(self.api_url, json=payload) as response:
                    if response.status == 201:
                        data = await response.json()
                        return {"success": True, "filePath": data.get("filePath")}
                    else:
                        error_data = await response.json()
                        return {
                            "success": False, 
                            "error": error_data.get("error", "Failed to create file")
                        }
            except Exception as e:
                logger.error(f"[{self.name}] Create file failed: {e}")
                return {"success": False, "error": str(e)}

class ListFilesTool(BaseTool):
    def __init__(self, api_url: str = f"{BACKEND_URL}/api/files/browse/"):
        super().__init__(
            name="ListFiles",
            description="Browse files in a directory.",
        )
        self.api_url_base = api_url

    async def execute(self, path_to_browse: str = "") -> dict:
        """
        Browses the file system.
        """
        logger.info(f"[{self.name}] Browsing path: {path_to_browse}")
        headers = {"x-agent-secret": "antigravity-local-agent"}
        async with aiohttp.ClientSession(headers=headers) as session:
            try:
                # Append path to URL
                url = f"{self.api_url_base}{path_to_browse}"
                async with session.get(url) as response:
                    if response.status == 200:
                        data = await response.json()
                        return {"success": True, "contents": data.get("contents"), "path": data.get("path")}
                    else:
                        # Try to read body just in case
                        try:
                             error_data = await response.json()
                             err = error_data.get("error", "Failed to browse")
                        except:
                             err = "Failed to browse"
                        
                        return {
                            "success": False, 
                            "error": err
                        }
            except Exception as e:
                logger.error(f"[{self.name}] Browse failed: {e}")
                return {"success": False, "error": str(e)}

class ActivateModeTool(BaseTool):
    def __init__(self, api_url: str = f"{BACKEND_URL}/api/files/create-folder"):
        super().__init__(
            name="ActivateMode",
            description="Creates the folder structure for a specific GSRSM mode.",
        )
        self.api_url = api_url

    async def execute(self, parent_path: str, mode_id: str) -> dict:
        """
        Creates the folder structure for a mode (e.g., modes/A1).
        """
        logger.info(f"[{self.name}] Activating mode {mode_id} in {parent_path}")
        headers = {"x-agent-secret": "antigravity-local-agent"}
        async with aiohttp.ClientSession(headers=headers) as session:
            try:
                # 1. Ensure 'modes' folder exists
                modes_payload = {
                    "parentPath": parent_path,
                    "folderName": "modes"
                }
                # We attempt to create it; if it exists (400), that's fine.
                async with session.post(self.api_url, json=modes_payload) as response:
                    if response.status not in [200, 201]:
                        err = await response.json()
                        if "already exists" not in str(err):
                             logger.warning(f"[{self.name}] Issue creating 'modes' folder: {err}")

                # 2. Create the specific mode folder
                mode_payload = {
                    "parentPath": f"{parent_path}/modes",
                    "folderName": mode_id
                }
                
                async with session.post(self.api_url, json=mode_payload) as response:
                    if response.status in [200, 201]:
                         data = await response.json()
                         return {"success": True, "path": data.get("folderPath")}
                    else:
                        error_data = await response.json()
                        # If it already exists, that's also a success for "Activation"
                        if "already exists" in str(error_data.get("error")):
                             return {"success": True, "path": f"{parent_path}/modes/{mode_id}", "note": "Mode setup already existed"}
                        
                        return {
                            "success": False, 
                            "error": error_data.get("error", "Failed to create mode folder")
                        }

            except Exception as e:
                logger.error(f"[{self.name}] Activate mode failed: {e}")
                return {"success": False, "error": str(e)}

class CreateVariablesListTool(BaseTool):
    def __init__(self, load_url: str = f"{BACKEND_URL}/api/simulation/load", save_url: str = f"{BACKEND_URL}/api/simulation/save"):
        super().__init__(
            name="CreateVariablesList",
            description="Saves or updates the variables list in index.sim.",
        )
        self.load_url = load_url
        self.save_url = save_url

    async def execute(self, project_path: str, variables: list) -> dict:
        logger.info(f"[{self.name}] Updating variables for project: {project_path}")
        headers = {"x-agent-secret": "antigravity-local-agent"}
        async with aiohttp.ClientSession(headers=headers) as session:
            try:
                # 1. Load existing config specific to the project
                current_actions = []
                payload_load = {"projectPath": project_path}
                
                async with session.post(self.load_url, json=payload_load) as response:
                    if response.status == 200:
                        data = await response.json()
                        sim = data.get("simulation")
                        if sim:
                            current_actions = sim.get("actions", [])
                
                # 2. Save with new variables and preserved actions
                payload_save = {
                    "projectPath": project_path,
                    "simulation": {
                        "variables": variables,
                        "actions": current_actions
                    }
                }
                
                async with session.post(self.save_url, json=payload_save) as response:
                    if response.status == 200:
                         return {"success": True}
                    else:
                         return {"success": False, "error": await response.text()}
                         
            except Exception as e:
                logger.error(f"[{self.name}] Failed: {e}")
                return {"success": False, "error": str(e)}

class CreateActionsListTool(BaseTool):
    def __init__(self, load_url: str = f"{BACKEND_URL}/api/simulation/load", save_url: str = f"{BACKEND_URL}/api/simulation/save"):
        super().__init__(
            name="CreateActionsList",
            description="Saves or updates the actions list in index.sim.",
        )
        self.load_url = load_url
        self.save_url = save_url

    async def execute(self, project_path: str, actions: list) -> dict:
        logger.info(f"[{self.name}] Updating actions for project: {project_path}")
        headers = {"x-agent-secret": "antigravity-local-agent"}
        async with aiohttp.ClientSession(headers=headers) as session:
            try:
                # 1. Load existing config
                current_variables = []
                payload_load = {"projectPath": project_path}
                
                async with session.post(self.load_url, json=payload_load) as response:
                    if response.status == 200:
                        data = await response.json()
                        sim = data.get("simulation")
                        if sim:
                            current_variables = sim.get("variables", [])
                
                # 2. Save with new actions and preserved variables
                payload_save = {
                    "projectPath": project_path,
                    "simulation": {
                        "variables": current_variables,
                        "actions": actions
                    }
                }
                
                async with session.post(self.save_url, json=payload_save) as response:
                    if response.status == 200:
                         return {"success": True}
                    else:
                         return {"success": False, "error": await response.text()}

            except Exception as e:
                logger.error(f"[{self.name}] Failed: {e}")
                return {"success": False, "error": str(e)}

class CreateSfcTool(BaseTool):
    def __init__(self, compile_url: str = f"{BACKEND_URL}/api/sfc/compile", save_url: str = f"{BACKEND_URL}/api/files/save-diagram"):
        super().__init__(
            name="CreateSfc",
            description="Generates, compiles, and saves an SFC diagram.",
        )
        self.compile_url = compile_url
        self.save_url = save_url

    async def execute(self, dsl_code: str, project_path: str, mode_id: str, sfc_name: str = "conduct") -> dict:
        logger.info(f"[{self.name}] Processing SFC for mode {mode_id}...")
        headers = {"x-agent-secret": "antigravity-local-agent"}
        async with aiohttp.ClientSession(headers=headers) as session:
            try:
                # 1. Compile
                compile_payload = {"code": dsl_code, "title": f"{mode_id} {sfc_name}"}
                async with session.post(self.compile_url, json=compile_payload) as response:
                    if response.status != 200:
                         return {"success": False, "error": f"Compilation failed: {await response.text()}"}
                    
                    data = await response.json()
                    generated_sfc = data.get("generatedSFC")
                    
                    if not generated_sfc:
                        return {"success": False, "error": "Compiler returned no SFC data"}

                # 2. Save
                # Construct path: {projectPath}/modes/{modeId}/{sfcName}.sfc (saved as JSON structure)
                # Note: The backend save-diagram route expects a relative path from storage root.
                # 'project_path' typically IS the relative path from storage root (or absolute? need to be careful).
                # Assuming project_path is what the file routes expect (relative to storage root, or properly handled).
                
                target_path = f"{project_path}/modes/{mode_id}/{sfc_name}.sfc"
                
                save_payload = {
                    "diagramPath": target_path,
                    "diagram": generated_sfc
                }
                
                async with session.post(self.save_url, json=save_payload) as response:
                    if response.status == 200:
                         save_data = await response.json()
                         # Broadcast project_reload to trigger frontend auto-refresh
                         try:
                             async with session.post(
                                 ORCHESTRATOR_BROADCAST_URL,
                                 json={"payload": {"type": "project_reload"}}
                             ) as broadcast_resp:
                                 if broadcast_resp.status == 200:
                                     logger.info(f"[{self.name}] Broadcast project_reload sent")
                         except Exception as be:
                             logger.warning(f"[{self.name}] Broadcast failed (non-critical): {be}")
                         return {"success": True, "path": save_data.get("savedPath")}
                    else:
                         return {"success": False, "error": f"Save failed: {await response.text()}"}

            except Exception as e:
                logger.error(f"[{self.name}] Failed: {e}")
                return {"success": False, "error": str(e)}



class ConfigureIOTool(BaseTool):
    def __init__(self, api_url: str = f"{BACKEND_URL}/api/simulation/save"):
        super().__init__(
            name="ConfigureIO",
            description="Configures both Variables and Actions for the simulation in one go.",
        )
        self.api_url = api_url

    async def execute(self, project_path: str, io_data: dict) -> dict:
        """
        Saves simulation configuration (variables + actions).
        
        io_data structure:
        { 
            "variables": [
                {
                    "name": "VarName", 
                    "type": "boolean|integer|float", 
                    "description": "desc"
                }
            ], 
            "actions": [
                {
                    "name": "ActName", 
                    "description": "desc", 
                    "qualifier": "N|S|R|L|D|P|SD|DS|SL", 
                    "condition": "ConditionExpr",
                    "duration": "5s|200ms"
                }
            ] 
        }
        """
        logger.info(f"[{self.name}] Configuring IO for project: {project_path}")
        headers = {"x-agent-secret": "antigravity-local-agent"}
        async with aiohttp.ClientSession(headers=headers) as session:
            try:
                variables = io_data.get("variables", [])
                actions = io_data.get("actions", [])
                
                payload = {
                    "projectPath": project_path,
                    "simulation": {
                        "variables": variables,
                        "actions": actions
                    }
                }
                
                async with session.post(self.api_url, json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        # Broadcast project_reload to trigger frontend auto-refresh
                        try:
                            async with session.post(
                                "http://127.0.0.1:8000/api/broadcast",
                                json={"payload": {"type": "project_reload"}}
                            ) as broadcast_resp:
                                if broadcast_resp.status == 200:
                                    logger.info(f"[{self.name}] Broadcast project_reload sent")
                        except Exception as be:
                            logger.warning(f"[{self.name}] Broadcast failed (non-critical): {be}")
                        return {"success": True, "savedPath": data.get("savedPath"), "count": {"vars": len(variables), "actions": len(actions)}}
                    else:
                        return {"success": False, "error": await response.text()}
            except Exception as e:
                logger.error(f"[{self.name}] Config IO failed: {e}")
                return {"success": False, "error": str(e)}

class UpdateGsrsmModesTool(BaseTool):
    """Updates the GSRSM modes and transitions in the project's .gsrsm file.

    ADK 2026 Pattern: Uses ToolContext.state for direct state management.
    Writes to: tool_context.state['gsrsm_data']
    """

    def __init__(self, api_url: str = f"{BACKEND_URL}/api/files/save-diagram"):
        super().__init__(
            name="UpdateGsrsmModes",
            description="Updates the GSRSM modes and transitions in the .gsrsm file.",
        )
        self.api_url = api_url

    async def update_gsrsm_modes(
        self,
        project_path: str,
        gsrsm_data: dict,
        tool_context: Optional["ToolContext"] = None  # ADK 2026: ToolContext for state
    ) -> dict:
        """Define GEMMA operating modes and transitions for a GRAFCET project.

        Creates or updates the GSRSM (GEMMA State Reference State Machine) configuration
        which defines the operating modes and transitions between them. Ensures a
        closed-loop architecture (A1 → F1 → D1 → A5 → A6 → A1).

        Args:
            project_path: Path to the project folder (e.g. "my_project").
            gsrsm_data: GSRSM configuration dictionary containing:
                - modes (list[dict]): List of mode definitions, each with:
                    - id (str): Mode identifier (e.g. "A1", "F1", "D1")
                    - name (str): Human-readable mode name
                    - description (str): Technical description for SFC engineer
                    - activated (bool): Whether mode is enabled (default: True)
                - transitions (list[dict]): List of transition definitions, each with:
                    - id (str): Transition identifier (e.g. "A1-F1")
                    - fromMode (str): Source mode ID
                    - toMode (str): Target mode ID
                    - condition (str): Logic expression using project variables
                    - activated (bool): Whether transition is enabled

        Returns:
            dict with keys:
                - success (bool): True if modes were updated
                - path (str): Path to the saved .gsrsm file
                - modesUpdated (int): Number of modes processed
                - transitionsUpdated (int): Number of transitions processed
                - error (str): Error message if failed
        """
        # Fallback to context state if LLM forgets project_path
        if not project_path and tool_context is not None:
            project_path = tool_context.state.get("project_path", "")

        logger.info(f"[{self.name}] Updating GSRSM modes for project: {project_path}")

        # Validate project_path
        if not project_path or project_path in ('default_project', 'None', 'null', ''):
            return {
                "success": False,
                "error": f"No valid project path provided (got: '{project_path}'). Please open a project first."
            }

        headers = {"x-agent-secret": "antigravity-local-agent"}

        STANDARD_MODES = {
            # A Modes
            "A1": {"category": "A", "default_name": "Automatic operation in Initial State"}, 
            "A2": {"category": "A", "default_name": "Functioning with requested Stop"}, 
            "A3": {"category": "A", "default_name": "Functioning with requested Stop (transient)"},
            "A4": {"category": "A", "default_name": "Obtained Stop"}, 
            "A5": {"category": "A", "default_name": "Preparation for return to operation"}, 
            "A6": {"category": "A", "default_name": "Test operation"}, 
            "A7": {"category": "A", "default_name": "Functioning in a determined state"},
            # D Modes
            "D1": {"category": "D", "default_name": "Emergency Stop"}, 
            "D2": {"category": "D", "default_name": "Diagnosis and/or treatment of failure"}, 
            "D3": {"category": "D", "default_name": "Production to refuse"},
            # F Modes
            "F1": {"category": "F", "default_name": "Normal Production"}, 
            "F2": {"category": "F", "default_name": "Preparation for production"}, 
            "F3": {"category": "F", "default_name": "Closing (shutdown)"},
            "F4": {"category": "F", "default_name": "Verification without order"}, 
            "F5": {"category": "F", "default_name": "Verification with order"}, 
            "F6": {"category": "F", "default_name": "Test Operation (controlled)"}
        }

        async with aiohttp.ClientSession(headers=headers) as session:
            try:
                # 1. LOAD EXISTING or CREATE BASE from STANDARD
                
                # Fetch file list to find the .gsrsm file
                browse_url = f"{BACKEND_URL}/api/files/browse/{project_path}"
                target_file_path = None
                
                async with session.get(browse_url) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        files = data.get("contents", [])
                        for f in files:
                            if f.get("name", "").endswith(".gsrsm"):
                                target_file_path = f.get("path")
                                break
                
                if not target_file_path:
                    # Create one if missing
                    create_url = f"{BACKEND_URL}/api/files/create-file"
                    payload = {
                        "parentPath": project_path,
                        "fileName": "project.gsrsm",
                        "fileType": "gsrsm"
                    }
                    async with session.post(create_url, json=payload) as resp:
                        if resp.status == 201:
                            d = await resp.json()
                            target_file_path = d.get("filePath")
                        else:
                            err_text = await resp.text()
                            logger.error(f"[{self.name}] Failed to create .gsrsm file at '{project_path}': {resp.status} - {err_text}")
                            return {"success": False, "error": f"Could not find or create .gsrsm file in '{project_path}'. Browse status: {resp.status}. Make sure the project exists and the backend is running."}

                # READ EXISTING CONTENT
                existing_project = None
                resolved_file_path = os.path.join(STORAGE_PATH, target_file_path) if STORAGE_PATH and target_file_path else target_file_path
                if resolved_file_path and os.path.exists(resolved_file_path):
                    try:
                        async with aiofiles.open(resolved_file_path, mode='r') as f:
                            content = await f.read()
                            existing_project = json.loads(content)
                    except Exception as e:
                        logger.warning(f"Could not read existing file: {e}")

                # If no existing project (or read failed), initialize with standard structure
                if not existing_project or "diagram" not in existing_project:
                    modes_list = []
                    for mid, info in STANDARD_MODES.items():
                        modes_list.append({
                            "id": mid,
                            "code": mid,
                            "title": info["default_name"],
                            "description": "",
                            "category": info["category"],
                            "position": {"x": 0, "y": 0},
                            "type": "normal",
                            "activated": False,
                            "size": {"width": 100, "height": 60}
                        })
                    
                    connections_list = [] 
                    
                    existing_project = {
                        "id": "agent-generated-project",
                        "name": "Gsrsm Project",
                        "diagram": {
                            "id": "agent-generated-diagram",
                            "modes": modes_list,
                            "connections": connections_list,
                            "version": "1.0",
                            "updatedAt": "now"
                        },
                        "createdAt": "now",
                        "updatedAt": "now"
                    }

                # 2. APPLY UPDATES
                current_modes = existing_project["diagram"].get("modes", [])
                current_connections = existing_project["diagram"].get("connections", [])
                
                def find_mode_idx(mid):
                    # First try exact ID match
                    for i, m in enumerate(current_modes):
                        if m.get("id") == mid:
                            logger.info(f"Matched mode {mid} by ID at index {i}")
                            return i
                    
                    # Fallback: try matching by code if mid looks like a code (e.g. "A1")
                    for i, m in enumerate(current_modes):
                        if m.get("code") == mid:
                            logger.info(f"Matched mode {mid} by Code {m.get('code')} at index {i}")
                            return i
                        
                    logger.warning(f"Mode {mid} not found in current modes: {[m.get('code') or m.get('id') for m in current_modes]}")
                    return -1

                # Update Modes
                updated_modes_count = 0
                for m_update in gsrsm_data.get("modes", []):
                    mid = m_update.get("id")
                    idx = find_mode_idx(mid)
                    
                    if idx != -1:
                        # Update existing
                        if "name" in m_update: current_modes[idx]["title"] = m_update["name"]
                        if "description" in m_update: current_modes[idx]["description"] = m_update["description"]
                        
                        # Handle activation state
                        # Default to True because if it's in the list, it's likely being selected/activated
                        is_active = m_update.get("activated", True)
                        
                        current_modes[idx]["activated"] = is_active
                        current_modes[idx]["type"] = "active" if is_active else "normal"
                        
                        if is_active:
                            updated_modes_count += 1
                            # FOLDER CREATION LOGIC ONLY IF ACTIVE
                            mode_code = current_modes[idx]['code']
                            mode_folder = os.path.join(STORAGE_PATH, project_path, "modes", mode_code) if STORAGE_PATH else f"{project_path}/modes/{mode_code}"
                            if not os.path.exists(mode_folder):
                                try:
                                    os.makedirs(mode_folder, exist_ok=True)
                                    # Start file - use default.sfc to match backend convention
                                    with open(os.path.join(mode_folder, "default.sfc"), 'w') as f:
                                        f.write(json.dumps({"id": str(__import__('uuid').uuid4()), "name": f"{mode_code} Default Grafcet", "elements": [], "version": "1.0"}, indent=2))
                                except Exception as e:
                                    logger.error(f"Failed to create mode folder: {e}")
                    else:
                        # Mode not found - Create it
                        new_mode = {
                            "id": m_update.get("id"),
                            "code": m_update.get("code") or m_update.get("id"), # Use ID as code if not provided
                            "title": m_update.get("name", ""),
                            "description": m_update.get("description", ""),
                            "category": m_update.get("category", "A"), # Default to A
                            "position": m_update.get("position", {"x": 0, "y": 0}),
                            "type": "active", # Default new ones to active if added via tool
                            "activated": True,
                            "size": {"width": 100, "height": 60}
                        }
                        # Check for explicitly provided deactivated state
                        if m_update.get("activated") is False:
                             new_mode["activated"] = False
                             new_mode["type"] = "normal"

                        current_modes.append(new_mode)
                        updated_modes_count += 1
                        
                        if new_mode["activated"]:
                            mode_folder = os.path.join(STORAGE_PATH, project_path, "modes", new_mode['code']) if STORAGE_PATH else f"{project_path}/modes/{new_mode['code']}"
                            if not os.path.exists(mode_folder):
                                try:
                                    os.makedirs(mode_folder, exist_ok=True)
                                    with open(os.path.join(mode_folder, "default.sfc"), 'w') as f:
                                        f.write(json.dumps({"id": str(__import__('uuid').uuid4()), "name": f"{new_mode['code']} Default Grafcet", "elements": [], "version": "1.0"}, indent=2))
                                except Exception as e:
                                    logger.error(f"Failed to create mode folder: {e}")

                # Update Connections (Transitions)
                for t_update in gsrsm_data.get("transitions", []):
                    cid = t_update.get("id", f"{t_update.get('fromMode')}-{t_update.get('toMode')}")
                    
                    # Find if connection exists
                    conn_idx = -1
                    for i, c in enumerate(current_connections):
                        if c.get("id") == cid or (c.get("fromMode") == t_update.get("fromMode") and c.get("toMode") == t_update.get("toMode")):
                            conn_idx = i
                            break
                    
                    if conn_idx != -1:
                        # Update existing connection
                        current_connections[conn_idx]["condition"] = t_update.get("condition", "")
                        if "activated" in t_update:
                            current_connections[conn_idx]["activated"] = t_update["activated"]
                    else:
                        # Create new connection
                        current_connections.append({
                            "id": cid,
                            "fromMode": t_update.get("fromMode"),
                            "toMode": t_update.get("toMode"),
                            "condition": t_update.get("condition", ""),
                            "activated": t_update.get("activated", False),
                            "points": [], 
                            "type": "transition"
                        })

                # write back updates
                existing_project["diagram"]["modes"] = current_modes
                existing_project["diagram"]["connections"] = current_connections

                diagram_payload = {
                    "diagramPath": target_file_path,
                    "diagram": existing_project
                }

                # 3. Save
                async with session.post(self.api_url, json=diagram_payload) as response:
                    if response.status == 200:
                        gsrsm_result = {
                            "modes": gsrsm_data.get("modes", []),
                            "transitions": gsrsm_data.get("transitions", [])
                        }

                        # ADK 2026: Write directly to ToolContext.state
                        if tool_context is not None:
                            tool_context.state["gsrsm_data"] = gsrsm_result
                            logger.info(f"[{self.name}] Wrote gsrsm_data to tool_context.state")

                        # Broadcast project_reload to trigger frontend auto-refresh
                        try:
                            async with session.post(
                                "http://127.0.0.1:8000/api/broadcast",
                                json={"payload": {"type": "project_reload"}}
                            ) as broadcast_resp:
                                if broadcast_resp.status == 200:
                                    logger.info(f"[{self.name}] Broadcast project_reload sent")
                        except Exception as be:
                            logger.warning(f"[{self.name}] Broadcast failed (non-critical): {be}")

                        return {
                            "success": True,
                            "path": target_file_path,
                            "updated_modes": updated_modes_count,
                            "modesUpdated": updated_modes_count,
                            "transitionsUpdated": len(gsrsm_data.get("transitions", [])),
                            "gsrsm_data": gsrsm_result
                        }
                    else:
                         return {"success": False, "error": f"Save failed: {await response.text()}"}

            except Exception as e:
                logger.error(f"[{self.name}] Failed: {e}")
                import traceback
                traceback.print_exc()
                return {"success": False, "error": str(e)}
