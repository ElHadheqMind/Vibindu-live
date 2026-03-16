import aiohttp
import logging
import os
from typing import Optional, List, Dict, Any
from base_tool import BaseTool

# ADK 2026: Import ToolContext for direct state management
try:
    from google.adk.tools import ToolContext
except ImportError:
    ToolContext = None  # Fallback for testing

logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:3001" if os.getenv("IS_DOCKER", "false").lower() == "true" else "http://localhost:3001")

class RunSimulationTool(BaseTool):
    """Launches a real simulation for a specific SFC file with step-by-step execution.

    ADK 2026 Pattern: Uses ToolContext.state for direct state management.
    Appends to: tool_context.state['validation_results']
    Reads from: tool_context.state['sfc_files'], tool_context.state['project_path']
    """

    def __init__(self, api_base: str = f"{BACKEND_URL}/api/simulation"):
        super().__init__(
            name="RunSimulation",
            description="Launches a real simulation for a specific SFC file with step-by-step execution. Supports scenario-based testing with variable manipulation.",
        )
        self.api_base = api_base
        self.broadcast_url = "http://127.0.0.1:8000/api/broadcast"

    async def run_simulation(
        self,
        project_path: str,
        mode_id: str = "",
        mode_name: str = "",
        file_name: str = "default.sfc",
        steps: int = 50,
        delay_ms: int = 2000,
        scenarios: Optional[List[Dict[str, Any]]] = None,
        auto_stop: bool = True,
        tool_context: Optional["ToolContext"] = None,  # ADK 2026: ToolContext for state
        **kwargs
    ) -> dict:
        """Run a simulation on an SFC file to validate logic and test scenarios.

        Opens the specified SFC file, launches the simulation engine, runs test
        scenarios (if provided), and optionally auto-stops when complete.

        Args:
            project_path: Path to the project folder (e.g. "my_project").
            mode_id: GSRSM mode folder name (e.g. "A1", "F1", "D1"). Empty for root files.
            mode_name: Human-readable mode name (e.g. "Initial Stop", "Normal Production").
            file_name: Name of the SFC file to simulate (default: "default.sfc").
            steps: Number of simulation steps to run (default: 50). Ignored if scenarios provided.
            delay_ms: Delay between steps in ms (legacy, backend uses fixed delays).
            scenarios: List of test scenarios. Each scenario has:
                - name (str): Scenario description (e.g. "ColorSorting - A1 (Initial Stop): Normal Start")
                - variables (dict): Variable values to set (e.g. {"T0": true, "E_STOP": false})
                - duration_ms (int, optional): How long to run this scenario
            auto_stop: If True, automatically stops simulation when complete (default: True).

        Returns:
            dict with keys:
                - success (bool): True if simulation started successfully
                - message (str): Status message
                - filePath (str): Path to the opened file
                - url (str): URL for the file in the editor
                - initialActiveSteps (list): Steps active at simulation start
                - totalScenarios (int): Number of scenarios run (if applicable)
        """
        # Extract project name from project_path (last folder name)
        project_name = project_path.rstrip("/\\").split("/")[-1].split("\\")[-1] if project_path else "Unknown"

        logger.info(f"[{self.name}] Starting simulation for project '{project_name}', mode '{mode_id}' ({mode_name or 'N/A'}), file '{file_name}'")
        
        if scenarios:
            logger.info(f"[{self.name}] Running with {len(scenarios)} scenarios (Step 3)")
        
        headers = {"x-agent-secret": "antigravity-local-agent"}
        
        async with aiohttp.ClientSession(headers=headers) as session:
            # Step 1: Call /navigate to get the URL and file path
            navigate_url = None
            file_path = None
            try:
                nav_payload = {
                    "projectPath": project_path,
                    "modeId": mode_id,
                    "fileName": file_name
                }
                
                async with session.post(f"{self.api_base}/navigate", json=nav_payload) as nav_response:
                    if nav_response.status == 200:
                        nav_data = await nav_response.json()
                        if nav_data.get("success"):
                            navigate_url = nav_data.get("url")
                            file_path = nav_data.get("path")
                            logger.info(f"[{self.name}] Navigate URL: {navigate_url}")
                    else:
                        logger.warning(f"[{self.name}] Navigate failed: {await nav_response.text()}")
            except Exception as e:
                logger.warning(f"[{self.name}] Navigate request failed: {e}")
            
            # Step 2: Broadcast open_file to frontend via orchestrator's /api/broadcast
            if navigate_url and file_path:
                try:
                    broadcast_payload = {
                        "payload": {
                            "type": "open_file",
                            "filePath": file_path,
                            "url": navigate_url
                        }
                    }
                    async with session.post(self.broadcast_url, json=broadcast_payload) as broadcast_resp:
                        if broadcast_resp.status == 200:
                            logger.info(f"[{self.name}] Broadcast open_file sent successfully")
                        else:
                            logger.warning(f"[{self.name}] Broadcast failed: {await broadcast_resp.text()}")
                except Exception as e:
                    logger.warning(f"[{self.name}] Broadcast failed: {e}")
            
            # Step 3: Call /scenario or /launch depending on scenarios
            try:
                if scenarios:
                    # Step 3: Use /scenario endpoint for scenario-based testing
                    # The /scenario endpoint now handles: navigate -> launch -> run scenarios
                    scenario_payload = {
                        "projectPath": project_path,
                        "modeId": mode_id,
                        "fileName": file_name,
                        "scenarios": scenarios,
                        "autoStop": auto_stop
                    }

                    logger.info(f"[{self.name}] Calling /scenario endpoint with {len(scenarios)} scenarios")
                    
                    async with session.post(f"{self.api_base}/scenario", json=scenario_payload) as response:
                        if response.status == 200:
                            data = await response.json()

                            logger.info(f"[{self.name}] Scenario simulation started successfully")
                            logger.info(f"[{self.name}] Initial active steps: {data.get('initialActiveSteps')}")

                            validation_result = {
                                "status": "PASS",
                                "project_name": project_name,
                                "sfc_file": file_name,
                                "mode_id": mode_id,
                                "mode_name": mode_name or mode_id,
                                "issues": [],
                                "steps_visited": data.get("initialActiveSteps", []),
                                "execution_time_ms": 0
                            }

                            # ADK 2026: Write to ToolContext.state
                            self._append_validation_result(tool_context, validation_result)

                            return {
                                "success": True,
                                "message": data.get("message", "Scenario simulation started"),
                                "project_name": project_name,
                                "mode_name": mode_name or mode_id,
                                "filePath": data.get("filePath"),
                                "url": navigate_url,
                                "initialActiveSteps": data.get("initialActiveSteps"),
                                "totalScenarios": data.get("totalScenarios"),
                                "validation_result": validation_result
                            }
                        else:
                            error_text = await response.text()
                            logger.error(f"[{self.name}] Scenario endpoint failed: {error_text}")

                            validation_result = {
                                "status": "FAIL",
                                "project_name": project_name,
                                "sfc_file": file_name,
                                "mode_id": mode_id,
                                "mode_name": mode_name or mode_id,
                                "issues": [{"severity": "error", "issue_type": "simulation_error", "message": error_text}],
                                "steps_visited": [],
                                "execution_time_ms": 0
                            }
                            self._append_validation_result(tool_context, validation_result)

                            return {
                                "success": False,
                                "error": f"Scenario simulation failed: {error_text}",
                                "validation_result": validation_result
                            }
                else:
                    # Original behavior: Use /launch endpoint
                    launch_payload = {
                        "projectPath": project_path,
                        "modeId": mode_id,
                        "fileName": file_name,
                        "steps": steps,
                        "delayMs": delay_ms,
                        "autoStop": auto_stop
                    }

                    async with session.post(f"{self.api_base}/launch", json=launch_payload) as response:
                        if response.status == 200:
                            data = await response.json()

                            logger.info(f"[{self.name}] Simulation launched successfully")
                            logger.info(f"[{self.name}] Initial active steps: {data.get('initialActiveSteps')}")

                            validation_result = {
                                "status": "PASS",
                                "project_name": project_name,
                                "sfc_file": file_name,
                                "mode_id": mode_id,
                                "mode_name": mode_name or mode_id,
                                "issues": [],
                                "steps_visited": data.get("initialActiveSteps", []),
                                "execution_time_ms": 0
                            }

                            # ADK 2026: Write to ToolContext.state
                            self._append_validation_result(tool_context, validation_result)

                            return {
                                "success": True,
                                "message": data.get("message", "Simulation launched"),
                                "project_name": project_name,
                                "mode_name": mode_name or mode_id,
                                "filePath": data.get("filePath"),
                                "url": navigate_url,
                                "initialActiveSteps": data.get("initialActiveSteps"),
                                "totalSteps": data.get("totalSteps"),
                                "validation_result": validation_result
                            }
                        else:
                            error_text = await response.text()
                            logger.error(f"[{self.name}] Backend failure: {error_text}")

                            validation_result = {
                                "status": "FAIL",
                                "project_name": project_name,
                                "sfc_file": file_name,
                                "mode_id": mode_id,
                                "mode_name": mode_name or mode_id,
                                "issues": [{"severity": "error", "issue_type": "simulation_error", "message": error_text}],
                                "steps_visited": [],
                                "execution_time_ms": 0
                            }
                            self._append_validation_result(tool_context, validation_result)

                            return {
                                "success": False,
                                "error": f"Backend simulation failed: {error_text}",
                                "validation_result": validation_result
                            }
            except Exception as e:
                logger.error(f"[{self.name}] Request failed: {e}")

                validation_result = {
                    "status": "FAIL",
                    "project_name": project_name,
                    "sfc_file": file_name,
                    "mode_id": mode_id,
                    "mode_name": mode_name or mode_id,
                    "issues": [{"severity": "error", "issue_type": "exception", "message": str(e)}],
                    "steps_visited": [],
                    "execution_time_ms": 0
                }
                self._append_validation_result(tool_context, validation_result)

                return {
                    "success": False,
                    "error": str(e),
                    "validation_result": validation_result
                }

    def _append_validation_result(self, tool_context, validation_result: dict):
        """ADK 2026: Helper to append validation result to state."""
        if tool_context is not None:
            if "validation_results" not in tool_context.state:
                tool_context.state["validation_results"] = []
            tool_context.state["validation_results"].append(validation_result)
            logger.info(f"[{self.name}] Appended validation_result to tool_context.state['validation_results']")


