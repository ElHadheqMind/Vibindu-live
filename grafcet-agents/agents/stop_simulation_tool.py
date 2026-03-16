import aiohttp
import logging
import os
from base_tool import BaseTool

logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:3001" if os.getenv("IS_DOCKER", "false").lower() == "true" else "http://localhost:3001")

class StopSimulationTool(BaseTool):
    """Stops the currently running simulation and closes the simulation panel."""

    def __init__(self, api_base: str = f"{BACKEND_URL}/api/simulation"):
        super().__init__(
            name="StopSimulation",
            description="Stops the currently running simulation and closes the simulation panel.",
        )
        self.api_base = api_base

    async def execute(self, project_path: str = "", **kwargs) -> dict:
        """Stop the currently running simulation and close the simulation panel.

        Sends a stop command to the simulation backend, halting execution and
        closing the simulation UI panel. Safe to call even if no simulation is running.

        Args:
            project_path: Project path (optional, for orchestrator compatibility).

        Returns:
            dict with keys:
                - success (bool): True if simulation was stopped
                - message (str): Status message
                - error (str): Error message if failed
        """
        logger.info(f"[{self.name}] Stopping simulation...")
        
        headers = {"x-agent-secret": "antigravity-local-agent"}
        
        async with aiohttp.ClientSession(headers=headers) as session:
            try:
                async with session.post(f"{self.api_base}/stop") as response:
                    if response.status == 200:
                        data = await response.json()
                        
                        logger.info(f"[{self.name}] Simulation stopped successfully")
                        
                        return {
                            "success": True, 
                            "message": data.get("message", "Simulation stopped and panel closed")
                        }
                    else:
                        error_text = await response.text()
                        logger.error(f"[{self.name}] Backend failure: {error_text}")
                        return {
                            "success": False, 
                            "error": f"Failed to stop simulation: {error_text}"
                        }
            except Exception as e:
                logger.error(f"[{self.name}] Request failed: {e}")
                return {"success": False, "error": str(e)}

