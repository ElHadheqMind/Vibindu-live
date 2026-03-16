# ============================================================================
# TOOLKIT EXPORTS - Tool instances and toolkit getter functions
# ============================================================================
"""
This module contains all tool instances and toolkit getter functions.
Extracted from adk_swarm.py for cleaner separation of concerns.
"""

import logging
from typing import Dict, Any, Callable

# Tool imports
from project_io_tool import ProjectIOTool
from toolkit import UpdateGsrsmModesTool
from compile_save_tool import CompileAndSaveSFCTool
from simulation_tool import RunSimulationTool
from get_sfc_tool import GetSFCContentTool
from dispatch_tools import dispatch_tools

# Legacy/Additional Tools (for Assistant agent)
from toolkit import (
    NavigateTool, SfcCompilerTool, SimulationConfigTool,
    SaveDiagramTool, CreateProjectTool, CreateFileTool,
    ListFilesTool, ActivateModeTool, ConfigureIOTool, CreateSfcTool
)
from stop_simulation_tool import StopSimulationTool

logger = logging.getLogger(__name__)

# ============================================================================
# TOOL INSTANCES - Singleton instances for each tool
# ============================================================================

# Core 4 Tools (one per agent) + GetSFCContent for simulation
project_io_tool = ProjectIOTool()
update_gsrsm_tool = UpdateGsrsmModesTool()
compile_save_tool = CompileAndSaveSFCTool()
run_simulation_tool = RunSimulationTool()
get_sfc_content_tool = GetSFCContentTool()

# A2A Dispatch Tools
dispatch_to_computer_tool = dispatch_tools.dispatch_to_computer_agent
dispatch_to_storyteller_tool = dispatch_tools.dispatch_to_storyteller

# Legacy tools (for Assistant agent only)
navigate_tool = NavigateTool()
sfc_compiler_tool = SfcCompilerTool()
simulation_config_tool = SimulationConfigTool()
save_diagram_tool = SaveDiagramTool()
create_project_tool = CreateProjectTool()
create_file_tool = CreateFileTool()
list_files_tool = ListFilesTool()
activate_mode_tool = ActivateModeTool()
configure_io_tool = ConfigureIOTool()
create_sfc_tool = CreateSfcTool()
stop_simulation_tool = StopSimulationTool()


# ============================================================================
# TOOLKIT FUNCTIONS
# ============================================================================

def get_toolkit() -> Dict[str, Callable]:
    """
    Returns ONLY the 4 core tested tools.
    These are the tools exposed to the orchestrator's /tools/execute endpoint.

    Tool Assignment:
    - ProjectIOTool       → SpecAnalyst (configure variables & actions)
    - UpdateGsrsmModesTool → GsrsmEngineer (define GEMMA modes)
    - CompileAndSaveSFCTool → SFCEngineer (compile & save SFC code)
    - RunSimulationTool    → SimulationAgent (run simulations)
    """
    return {
        "ProjectIOTool": project_io_tool.execute,
        "update_gsrsm": update_gsrsm_tool.execute,
        "CompileAndSaveSFC": compile_save_tool.execute,
        "GetSFCContent": get_sfc_content_tool.get_sfc_content,
        "RunSimulation": run_simulation_tool.execute,
        "dispatch_to_computer_agent": dispatch_to_computer_tool,
        "dispatch_to_storyteller": dispatch_to_storyteller_tool,
    }


def get_all_tools() -> Dict[str, Callable]:
    """
    Returns ALL tools including legacy ones.
    Used by the Assistant agent (disabled for now).

    WARNING: These tools are NOT all tested. Use with caution.
    """
    return {
        # Core 5 (tested)
        "ProjectIOTool": project_io_tool.execute,
        "update_gsrsm": update_gsrsm_tool.execute,
        "CompileAndSaveSFC": compile_save_tool.execute,
        "GetSFCContent": get_sfc_content_tool.get_sfc_content,
        "RunSimulation": run_simulation_tool.execute,
        # Legacy (not fully tested - for Assistant only)
        "navigate": navigate_tool.execute,
        "compile_sfc": sfc_compiler_tool.execute,
        "save_config": simulation_config_tool.execute,
        "save_diagram": save_diagram_tool.execute,
        "create_project": create_project_tool.execute,
        "create_file": create_file_tool.execute,
        "list_files": list_files_tool.execute,
        "activate_mode": activate_mode_tool.execute,
        "configure_io": configure_io_tool.execute,
        "create_sfc": create_sfc_tool.execute,
        "StopSimulation": stop_simulation_tool.execute,
    }


def get_extended_toolkit(program_all_modes: Callable, validate_all_modes: Callable) -> Dict[str, Callable]:
    """
    Extended toolkit including SFC programming and validation.
    
    Args:
        program_all_modes: Async function to program all modes
        validate_all_modes: Async function to validate all modes
    """
    base_toolkit = get_toolkit()
    base_toolkit["program_all_modes"] = program_all_modes
    base_toolkit["validate_all_modes"] = validate_all_modes
    return base_toolkit

