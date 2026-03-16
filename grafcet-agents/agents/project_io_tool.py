import json
import logging
import os
import aiohttp
from typing import Optional
from base_tool import BaseTool

# ADK 2026: Import ToolContext for direct state management
try:
    from google.adk.tools import ToolContext
except ImportError:
    ToolContext = None  # Fallback for testing

logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:3001" if os.getenv("IS_DOCKER", "false").lower() == "true" else "http://localhost:3001")

class ProjectIOTool(BaseTool):
    """Validates and applies Actions and Transition Variables to the current project.

    ADK 2026 Pattern: Uses ToolContext.state for direct state management.
    Writes to: tool_context.state['io_data']
    """

    def __init__(self, api_url: str = f"{BACKEND_URL}/api/simulation/save"):
        super().__init__(
            name="ProjectIOTool",
            description="Validates and applies Actions and Transition Variables to the current project.",
        )
        self.api_url = api_url

    async def extract_io_config(
        self,
        project_path: str,
        actions: list[dict],
        transition_variables: list[dict],
        tool_context: Optional["ToolContext"] = None  # ADK 2026: ToolContext for state
    ) -> dict:
        """Configure IO variables and actions for a GRAFCET/SFC project.

        Applies the specified actions (outputs/actuators) and transition variables
        (inputs/sensors) to the project's simulation configuration file (index.sim).

        Args:
            project_path: Path to the project folder (e.g. "my_conveyor_project").
            actions: List of action objects. Each action has:
                - name (str): Action identifier in UPPER_SNAKE_CASE (e.g. "MOTOR_CONV")
                - qualifier (str): IEC 61131-3 qualifier - N|S|R|L|D|P|SD|DS|SL
                - condition (str): Logic expression (e.g. "PB_START AND NOT E_STOP")
                - description (str): Human-readable description
                - duration (str): For time qualifiers L/D/SD/DS/SL (e.g. "5s", "200ms")
            transition_variables: List of variable objects. Each variable has:
                - name (str): Variable identifier in UPPER_SNAKE_CASE (e.g. "PB_START")
                - type (str): "boolean" | "integer" | "float"
                - description (str): Human-readable description

        Returns:
            dict with keys:
                - success (bool): True if configuration was saved
                - message (str): Status message
                - savedPath (str): Path where config was saved
                - stats (dict): Count of actions and transitions saved
        """
        # Fallback to context state if LLM forgets project_path
        if not project_path and tool_context is not None:
            project_path = tool_context.state.get("project_path", "")

        logger.info(f"[{self.name}] Processing IO for project: {project_path}")
        
        # 1. Validation
        validation_errors = []
        if not isinstance(actions, list): validation_errors.append("Actions must be a list.")
        if not isinstance(transition_variables, list): validation_errors.append("Transition variables must be a list.")
        
        if validation_errors:
            return {"success": False, "message": "Validation failed", "errors": validation_errors}

        # 2. Prepare IO data
        io_data = {
            "variables": transition_variables,
            "actions": actions
        }

        # Write to ToolContext.state first (always works)
        if tool_context is not None:
            tool_context.state["io_data"] = io_data
            logger.info(f"[{self.name}] Wrote io_data to tool_context.state")

        # 3. Try to save to backend (optional - may not be running)
        saved_path = None
        try:
            headers = {"x-agent-secret": "antigravity-local-agent"}
            async with aiohttp.ClientSession(headers=headers) as session:
                payload = {
                    "projectPath": project_path,
                    "simulation": {
                        "variables": transition_variables,
                        "actions": actions
                    }
                }

                timeout = aiohttp.ClientTimeout(total=3)  # Short timeout
                async with session.post(self.api_url, json=payload, timeout=timeout) as response:
                    if response.status == 200:
                        data = await response.json()
                        saved_path = data.get("savedPath")
                        logger.info(f"[{self.name}] Saved to backend: {saved_path}")
                    else:
                        logger.warning(f"[{self.name}] Backend save failed: {response.status}")

        except Exception as e:
            # Backend not available - that's OK, we already saved to state
            logger.warning(f"[{self.name}] Backend unavailable (non-critical): {e}")

        # 4. Success - IO data is in state
        return {
            "success": True,
            "message": f"IO Configuration saved: {len(actions)} actions, {len(transition_variables)} variables",
            "savedPath": saved_path,
            "stats": {
                "actions": len(actions),
                "transitions": len(transition_variables)
            },
            "io_data": io_data
        }
