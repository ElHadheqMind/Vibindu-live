"""
SaveSpecTool - Saves analyzed specification as a well-structured Markdown file.

This tool is used by SpecAnalyst to save the project specification (spec.md).
The spec.md serves as the project's context document containing:
1. All information extracted from the PDF
2. Image descriptions (text descriptions of diagrams/figures)
3. IO configuration summary
4. Process flow and requirements
"""

import logging
import os
import aiohttp
from typing import List, Optional
from base_tool import BaseTool

logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:3001" if os.getenv("IS_DOCKER", "false").lower() == "true" else "http://localhost:3001") # Defined BACKEND_URL using os.getenv

class SaveSpecTool(BaseTool):
    """
    Saves the analyzed specification as spec.md in the project directory.

    This file becomes the project's context/specification document.
    Images are described in text format (not saved as files).
    """

    def __init__(self, api_url: str = f"{BACKEND_URL}/api/simulation/save-spec"): # Modified api_url to use BACKEND_URL
        super().__init__(
            name="SaveSpecTool",
            description="Saves the analyzed specification as a Markdown file (spec.md) in the project.",
        )
        self.api_url = api_url

    async def execute(
        self,
        project_path: str,
        spec_content: str
    ) -> dict:
        """
        Saves the specification Markdown content to spec.md file.

        Args:
            project_path (str): The path to the project directory.
            spec_content (str): The complete Markdown content for the specification.
                Should include:
                - Title and summary
                - Process description
                - Image/diagram descriptions (as text)
                - IO variables and actions summary
                - Safety requirements
                - Timing and sequence information

        Returns:
            dict: Result with success status and saved file path.
        """
        logger.info(f"[{self.name}] Saving spec for project: {project_path}")

        # Validate required fields
        if not project_path:
            return {"success": False, "message": "project_path is required"}
        if not spec_content:
            return {"success": False, "message": "spec_content is required"}

        # Send to backend API
        try:
            headers = {"x-agent-secret": "antigravity-local-agent"}
            async with aiohttp.ClientSession(headers=headers) as session:
                payload = {
                    "projectPath": project_path,
                    "specContent": spec_content
                }

                timeout = aiohttp.ClientTimeout(total=10)
                async with session.post(self.api_url, json=payload, timeout=timeout) as response:
                    if response.status == 200:
                        data = await response.json()
                        return {
                            "success": True,
                            "message": "Specification saved to spec.md",
                            "savedPath": data.get("savedPath")
                        }
                    else:
                        error_text = await response.text()
                        return {"success": False, "message": "Backend Save Failed", "error": error_text}

        except Exception as e:
            logger.error(f"[{self.name}] Execution failed: {e}")
            return {"success": False, "message": "Internal Tool Error", "error": str(e)}

