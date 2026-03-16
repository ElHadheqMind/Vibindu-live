# Agent swarm definitions using the ADK framework.
# Configures agent roles, models, and reasoning levels.
"""
This module contains ONLY agent definitions.
Tools and workflows are imported from separate modules.

STATE MANAGEMENT:
All agents share state through ADK's InvocationContext. Key state fields:
- project_path: Path to the project folder
- spec_content: Specification text (from PDF or spec.md)
- io_data: Variables and actions (set by SpecAnalyst)
- gsrsm_data: Modes and transitions (set by GsrsmEngineer)
- sfc_files: List of generated SFC files
- validation_results: Simulation results
"""

# Load environment variables FIRST
import os
from dotenv import load_dotenv
load_dotenv()

import logging
from typing import List, Dict, Any, Optional

from google.adk.agents import SequentialAgent, ParallelAgent
from google.adk.agents.llm_agent import LlmAgent
from google.adk.planners import BuiltInPlanner
from google.genai.types import ThinkingConfig

logger = logging.getLogger(__name__)

# Model and thinking configuration
# Architected to exploit the advanced reasoning and precision of the Gemini 3.1 model.
DEFAULT_MODEL = "gemini-3.1-pro-preview"
DEFAULT_THINKING_LEVEL = "medium"

# ============================================================================
# THINKING PLANNER - Enables real-time streaming of model thoughts
# ============================================================================
# This planner configures the model to output its reasoning process,
# allowing the UI to show what the agent is "thinking" in real-time.
# For Gemini 3, we use thinking_level instead of thinking_budget
thinking_planner = BuiltInPlanner(
    thinking_config=ThinkingConfig(
        include_thoughts=True,   # Stream model's internal reasoning
        thinking_level=DEFAULT_THINKING_LEVEL,  # Gemini 3: minimal, low, medium, high
    )
)

# ============================================================================
# IMPORTS
# ============================================================================
from prompts import (
    SPEC_ANALYST_INSTRUCTION,
    GSRSM_ENGINEER_INSTRUCTION,
    SIMULATION_AGENT_INSTRUCTION,
    MODE_SFC_INSTRUCTION_TEMPLATE,
    ORCHESTRATOR_INSTRUCTION
)
from sfc_programmer import ModeContext, CONDUCT_SFC_INSTRUCTION

# Import state management
from grafcet_state import (
    GrafcetState,
    IOData,
    GsrsmData,
    SFCFile,
    ModeContext as StateModeContext,
    STATE_KEY_PROJECT_PATH,
    STATE_KEY_SPEC_CONTENT,
    STATE_KEY_IO_DATA,
    STATE_KEY_GSRSM_DATA,
    STATE_KEY_SFC_FILES,
    STATE_KEY_VALIDATION_RESULTS,
    state_to_context,
    context_to_state
)

# Import tool instances from toolkit_exports
from toolkit_exports import (
    project_io_tool,
    update_gsrsm_tool,
    compile_save_tool,
    run_simulation_tool,
    get_sfc_content_tool,
    get_toolkit,
    get_all_tools
)


# ============================================================================
# REGISTER MODE AGENTS TOOL
# ============================================================================
# ADK 2026: ToolContext is passed at runtime by the ADK framework
# We don't need to import it - just use the tool_context parameter directly

class RegisterModeAgentsTool:
    """
    Tool for ConductSFCAgent to register mode agents in the parallel agent.

    Called after conduct.sfc is generated, this tool:
    1. Reads the modes from GSRSM data (from parameters or shared state via ToolContext)
    2. Creates a specialized LlmAgent for each mode
    3. Populates modes_parallel_agent.sub_agents

    ADK 2026 Pattern: Uses ToolContext.state for direct state management.
    Reads from: tool_context.state['io_data'], tool_context.state['gsrsm_data'], tool_context.state['project_path']
    """

    name = "RegisterModeAgents"
    description = "Creates and registers mode SFC agents for parallel execution. Call this after generating conduct.sfc."

    async def register_mode_agents(
        self,
        modes: List[Dict[str, Any]],
        spec_context: str = "",
        project_path: str = "",
        io_data: Optional[Dict[str, Any]] = None,
        gsrsm_data: Optional[Dict[str, Any]] = None,
        tool_context=None  # ADK 2026: ToolContext for state (Any type to avoid import issues)
    ) -> Dict[str, Any]:
        """
        Creates mode SFC agents and registers them in modes_parallel_agent.

        Args:
            modes: List of mode dictionaries from GSRSM data. Each mode should have:
                   - id: Mode ID (e.g., "A1", "F1", "D1")
                   - name: Human-readable name
                   - description: Technical description for SFC generation
            spec_context: Content from spec.md for IO context (legacy)
            project_path: Project folder path (from state)
            io_data: IO configuration from SpecAnalyst (from state)
            gsrsm_data: GSRSM modes/transitions from GsrsmEngineer (from state)
            tool_context: ADK 2026 ToolContext for reading/writing state directly

        Returns:
            Dictionary with registration status and agent count
        """
        global modes_parallel_agent

        # ADK 2026: Read from ToolContext.state if parameters not provided
        if tool_context is not None:
            if io_data is None and "io_data" in tool_context.state:
                io_data = tool_context.state["io_data"]
                logger.info("[RegisterModeAgents] Read io_data from tool_context.state")
            if gsrsm_data is None and "gsrsm_data" in tool_context.state:
                gsrsm_data = tool_context.state["gsrsm_data"]
                logger.info("[RegisterModeAgents] Read gsrsm_data from tool_context.state")
            if not project_path and "project_path" in tool_context.state:
                project_path = tool_context.state["project_path"]
                logger.info("[RegisterModeAgents] Read project_path from tool_context.state")

        # Clear existing agents
        modes_parallel_agent.sub_agents.clear()

        registered_agents = []

        # Build IO context text for agent prompts
        io_context_text = ""
        if io_data:
            vars_list = io_data.get("variables", [])
            actions_list = io_data.get("actions", [])

            vars_text = "\n".join([
                f"- {v.get('name', 'VAR')} ({v.get('type', 'boolean')}): {v.get('description', '')}"
                for v in vars_list
            ])
            actions_text = "\n".join([
                f"- {a.get('name', 'ACTION')}: {a.get('description', '')}"
                for a in actions_list
            ])
            io_context_text = f"## AVAILABLE VARIABLES\n{vars_text}\n\n## AVAILABLE ACTIONS\n{actions_text}"

        # Combine spec_context with io_context_text
        full_context = spec_context
        if io_context_text:
            full_context = f"{full_context}\n\n{io_context_text}" if full_context else io_context_text

        for i, mode in enumerate(modes):
            mode_id = mode.get("id") or mode.get("code", f"M{i+1}")
            mode_name = mode.get("name") or mode.get("title", f"Mode {i+1}")
            mode_description = mode.get("description", "")

            # Create the mode agent with full context from state
            agent = create_mode_sfc_agent(
                mode_id=mode_id,
                mode_name=mode_name,
                mode_description=mode_description,
                spec_context=full_context,
                io_context=io_data,  # Pass io_data for structured access
                project_path=project_path
            )

            modes_parallel_agent.sub_agents.append(agent)
            registered_agents.append({
                "mode_id": mode_id,
                "mode_name": mode_name,
                "agent_name": agent.name,
                "has_io_context": io_data is not None,
                "has_gsrsm_context": gsrsm_data is not None
            })

            logger.info(f"[RegisterModeAgents] Created agent for mode {mode_id} (io_data={io_data is not None})")

        logger.info(f"[RegisterModeAgents] Registered {len(registered_agents)} mode agents with state context")

        return {
            "success": True,
            "registered_count": len(registered_agents),
            "agents": registered_agents,
            "has_io_data": io_data is not None,
            "has_gsrsm_data": gsrsm_data is not None,
            "project_path": project_path,
            "message": f"Successfully registered {len(registered_agents)} mode SFC agents with state context"
        }


_register_mode_agents_tool = RegisterModeAgentsTool()

# ============================================================================
# LLM AGENT DEFINITIONS - All agents defined here with output_key for state sharing
# ============================================================================
# Using LlmAgent with output_key enables SequentialAgent to pass data between agents
# via the shared InvocationContext state.
#
# Architecture:
# ┌─────────────────────────────────────────────────────────────────────────┐
# │  SFCPipeline (SequentialAgent)                                          │
# │  ├── SpecAnalyst → output_key="io_data"                                │
# │  ├── GsrsmEngineer → output_key="gsrsm_data"                           │
# │  ├── SFCProgramming (SequentialAgent)                                  │
# │  │   ├── ConductSFCAgent → output_key="conduct_result"                 │
# │  │   └── ModesSFCParallel (ParallelAgent) → all modes in parallel      │
# │  │       ├── ModeA1Agent → output_key="mode_a1_result"                 │
# │  │       ├── ModeF1Agent → output_key="mode_f1_result"                 │
# │  │       └── ... (one agent per GSRSM mode)                            │
# │  └── SimulationAgent → output_key="validation_result"                  │
# └─────────────────────────────────────────────────────────────────────────┘

# 1. Spec Analyst Agent - with thinking planner for real-time streaming
spec_analyst = LlmAgent(
    name="SpecAnalyst",
    model=DEFAULT_MODEL,
    description="Extracts IO configuration (variables and actions) from specification documents.",
    output_key="io_data",
    instruction=SPEC_ANALYST_INSTRUCTION,
    tools=[project_io_tool.extract_io_config],
    planner=thinking_planner,  # Enable thought streaming
)

# 2. GSRSM Engineer Agent - with thinking planner for real-time streaming
gsrsm_engineer = LlmAgent(
    name="GsrsmEngineer",
    model=DEFAULT_MODEL,
    description="Designs GEMMA/GSRSM operating modes and transitions based on IEC 60848 standard.",
    output_key="gsrsm_data",
    instruction=GSRSM_ENGINEER_INSTRUCTION,
    tools=[update_gsrsm_tool.update_gsrsm_modes],
    planner=thinking_planner,  # Enable thought streaming
)

# 3. Conduct SFC Agent (Top-Level Mode Orchestrator)
# Generates the master Conduct SFC that orchestrates all mode transitions
# Also registers mode agents for parallel execution
# OUTPUT: Stores result in state["conduct_result"]

# Extended instruction for ConductSFCAgent that includes RegisterModeAgents
CONDUCT_SFC_EXTENDED_INSTRUCTION = CONDUCT_SFC_INSTRUCTION + """

## ⚠️ CRITICAL: YOU MUST MAKE TWO TOOL CALLS ⚠️

Your job is NOT complete until you have made BOTH tool calls:
1. `compile_and_save_sfc` - to save the Conduct SFC
2. `register_mode_agents` - to create agents for each mode

**If you only call compile_and_save_sfc, the mode SFCs will NOT be generated!**

## STATE YOU RECEIVE
You receive the following from the conversation context:
- **Project Path**: Look for "Project Path:" in the conversation - this is the EXACT path to use in tool calls
- **io_data**: Variables and actions from SpecAnalyst (pass to RegisterModeAgents)
- **gsrsm_data**: GSRSM modes and transitions (use to build modes list)

## WORKFLOW (BOTH STEPS REQUIRED)

### Step 1: Generate and Save Conduct SFC
Call `compile_and_save_sfc` with:
- `sfc_code`: Your generated GrafScript DSL code
- `mode_id`: "" (EMPTY STRING - this saves conduct.sfc at project root, NOT in modes folder!)
- `project_path`: The exact path from "Project Path:" in the conversation
- `sfc_name`: "conduct"

### Step 2: Register Mode Agents (REQUIRED - DO NOT SKIP!)
IMMEDIATELY after Step 1 succeeds, call `register_mode_agents` with:
- `modes`: List of ALL activated modes from GSRSM data, each with:
  - `id`: Mode ID (e.g., "A1", "F1", "D1", "A5", "A6")
  - `name`: Human-readable name
  - `description`: Technical description for SFC generation
- `project_path`: SAME path you used in Step 1
- `io_data`: The io_data from the conversation (variables and actions)
- `gsrsm_data`: The gsrsm_data from the conversation

### Example Step 2 Call:
```json
{
  "modes": [
    {"id": "A1", "name": "Initial Stop", "description": "System initialization and safe stop state"},
    {"id": "F1", "name": "Production", "description": "Normal production cycle with sensor detection and sorting"},
    {"id": "D1", "name": "Emergency Stop", "description": "Emergency shutdown - disable all actuators"},
    {"id": "A5", "name": "Preparation for Restart", "description": "Reset sequence before returning to normal operation"},
    {"id": "A6", "name": "Return to Initial", "description": "Return all components to initial positions"}
  ],
  "project_path": "users/agent/MyProject",
  "io_data": {"variables": [...], "actions": [...]},
  "gsrsm_data": {"modes": [...], "transitions": [...]}
}
```

## ⚠️ REMINDER: YOUR JOB IS NOT DONE UNTIL YOU CALL BOTH TOOLS!
- After compile_and_save_sfc succeeds → IMMEDIATELY call register_mode_agents
- Include ALL activated modes (A1, F1, D1, A5, A6, etc.)
- This enables the parallel mode SFC generation
"""

# 3. Conduct SFC Agent - with thinking planner for real-time streaming
conduct_sfc_agent = LlmAgent(
    name="ConductSFCAgent",
    model=DEFAULT_MODEL,
    description="Generates the master Conduct SFC and registers mode agents for parallel execution.",
    output_key="conduct_result",
    instruction=CONDUCT_SFC_EXTENDED_INSTRUCTION,
    tools=[compile_save_tool.compile_and_save_sfc, _register_mode_agents_tool.register_mode_agents],
    planner=thinking_planner,  # Enable thought streaming
)

# 4. Simulation Agent - with thinking planner for real-time streaming
# Has access to GetSFCContent (to fetch SFC code) and RunSimulation (to execute simulation)
# ADK 2026: Also has get_sfc_from_state to retrieve SFC content directly from state
simulation_agent = LlmAgent(
    name="SimulationAgent",
    model=DEFAULT_MODEL,
    description="Validates generated SFC files through simulation for logic correctness and safety compliance.",
    output_key="validation_result",
    instruction=SIMULATION_AGENT_INSTRUCTION,
    tools=[
        get_sfc_content_tool.get_sfc_content,
        get_sfc_content_tool.get_sfc_from_state,  # ADK 2026: Get SFC from state
        run_simulation_tool.run_simulation
    ],
    planner=thinking_planner,  # Enable thought streaming
)


# ============================================================================
# MODE SFC AGENT FACTORY
# ============================================================================
# Uses MODE_SFC_INSTRUCTION_TEMPLATE from prompts.py
# Each mode agent receives context from shared state (io_data, gsrsm_data, project_path)


def create_mode_sfc_agent(
    mode_id: str,
    mode_name: str,
    mode_description: str = "",
    spec_context: str = "",
    io_context: Optional[Dict[str, Any]] = None,
    project_path: str = ""
) -> LlmAgent:
    """
    Factory function to create a specialized Mode SFC agent.

    The agent instruction is built with context from shared state:
    - io_data: Variables and actions (for transition conditions and step actions)
    - gsrsm_data: GSRSM modes and transitions (for mode context)
    - project_path: Project folder path (for tool calls)

    Args:
        mode_id: GSRSM mode ID (A1, F1, D1, etc.)
        mode_name: Human-readable mode name
        mode_description: Technical description of what this mode does (from GSRSM)
        spec_context: Text context from spec.md or IO data
        io_context: Optional IO context with variables and actions dict
        project_path: Project folder path from state

    Returns:
        LlmAgent configured for this specific mode with full state context
    """
    # Use mode_description in the template, fallback to mode_name if empty
    description_text = mode_description if mode_description else f"{mode_name} mode operations"

    instruction = MODE_SFC_INSTRUCTION_TEMPLATE.format(
        mode_id=mode_id,
        description=description_text
    )

    # Add project path context for tool calls
    if project_path:
        instruction += f"\n\n## PROJECT PATH\nUse this path in your tool calls: `{project_path}`"

    # Add spec context if available (from spec.md or combined IO text)
    if spec_context:
        instruction += f"\n\n## SPECIFICATION CONTEXT\n{spec_context}"

    # Add IO context if available (structured dict format)
    # Note: This may be redundant if spec_context already includes IO info,
    # but ensures structured access for the agent
    if io_context and not spec_context:
        vars_text = "\n".join([
            f"- {v.get('name', 'VAR')} ({v.get('type', 'boolean')}): {v.get('description', '')}"
            for v in io_context.get('variables', [])
        ])
        actions_text = "\n".join([
            f"- {a.get('name', 'ACTION')}: {a.get('description', '')}"
            for a in io_context.get('actions', [])
        ])
        instruction += f"\n\n## AVAILABLE VARIABLES\n{vars_text}\n\n## AVAILABLE ACTIONS\n{actions_text}"

    return LlmAgent(
        name=f"ModeSFC_{mode_id}",
        model=DEFAULT_MODEL,
        description=f"Generates SFC code for GSRSM mode {mode_id}: {mode_name}",
        output_key=f"mode_{mode_id.lower()}_result",
        instruction=instruction,
        tools=[compile_save_tool.compile_and_save_sfc],
        planner=thinking_planner,  # Enable thought streaming
    )


def create_modes_parallel_agent(
    modes: List[ModeContext],
    io_context: Optional[Dict[str, Any]] = None
) -> ParallelAgent:
    """
    Creates a ParallelAgent containing one Mode SFC agent per GSRSM mode.
    All mode SFCs are generated in parallel after the Conduct SFC.

    Args:
        modes: List of ModeContext objects from GSRSM data
        io_context: Optional IO context with variables and actions

    Returns:
        ParallelAgent that runs all mode SFC agents concurrently
    """
    mode_agents = []
    for mode in modes:
        agent = create_mode_sfc_agent(
            mode_id=mode.mode_id,
            mode_name=mode.name,
            io_context=io_context
        )
        mode_agents.append(agent)

    return ParallelAgent(
        name="ModesSFCParallel",
        description="Executes all mode SFC agents in parallel for concurrent code generation.",
        sub_agents=mode_agents
    )


# Default empty ModesSFCParallel agent (always exists, populated dynamically)
modes_parallel_agent = ParallelAgent(
    name="ModesSFCParallel",
    description="Executes all mode SFC agents in parallel for concurrent code generation. Modes are added dynamically based on GSRSM data.",
    sub_agents=[]
)


# ============================================================================
# ADK WORKFLOW AGENTS - Using SequentialAgent and ParallelAgent
# ============================================================================
#
# The SFC generation flow with dynamic mode agent registration:
#
# ┌─────────────────────────────────────────────────────────────────────────┐
# │  SFC Generation Flow                                                    │
# │                                                                         │
# │  Step 1: ConductSFCAgent                                                │
# │          → Generates conduct.sfc (mode orchestrator)                    │
# │          → Calls RegisterModeAgents tool to populate modes_parallel     │
# │          → output_key="conduct_result"                                  │
# │                                                                         │
# │  Step 2: ModesSFCParallel (ParallelAgent) - POPULATED BY CONDUCT        │
# │          → sub_agents populated by RegisterModeAgents tool              │
# │          → All mode SFC agents run in parallel                          │
# │          ├── ModeSFC_A1 → output_key="mode_a1_result"                   │
# │          ├── ModeSFC_F1 → output_key="mode_f1_result"                   │
# │          ├── ModeSFC_D1 → output_key="mode_d1_result"                   │
# │          └── ... (one per activated GSRSM mode)                         │
# │                                                                         │
# └─────────────────────────────────────────────────────────────────────────┘
#
# The full pipeline (including IO and GSRSM):
#
# ┌─────────────────────────────────────────────────────────────────────────┐
# │  Orchestrator Sub-Agents                                                │
# │                                                                         │
# │  1. SpecAnalyst → output_key="io_data"                                  │
# │  2. GsrsmEngineer → output_key="gsrsm_data"                             │
# │  3. ConductSFCAgent → generates conduct.sfc + registers mode agents     │
# │  4. ModesSFCParallel → executes all mode agents in parallel             │
# │  5. SimulationAgent → output_key="validation_result"                    │
# │                                                                         │
# └─────────────────────────────────────────────────────────────────────────┘


def create_sfc_generation_pipeline(
    modes: List[ModeContext],
    io_context: Optional[Dict[str, Any]] = None
) -> SequentialAgent:
    """
    Creates the SFC generation pipeline: Conduct SFC → Parallel Mode SFCs.

    Args:
        modes: List of ModeContext objects from GSRSM data
        io_context: Optional IO context with variables and actions

    Returns:
        SequentialAgent that generates all SFC files
    """
    modes_parallel = create_modes_parallel_agent(modes, io_context)

    return SequentialAgent(
        name="SFCGenerationPipeline",
        description="Sequential pipeline: Conduct SFC first, then all mode SFCs in parallel.",
        sub_agents=[conduct_sfc_agent, modes_parallel]
    )


def create_full_automation_pipeline(
    modes: List[ModeContext],
    io_context: Optional[Dict[str, Any]] = None
) -> SequentialAgent:
    """
    Creates the complete automation pipeline:
    SpecAnalyst → GsrsmEngineer → SFC Generation

    Note: Simulation is NOT included in the build pipeline.
    Use SimulationAgent explicitly when the user requests simulation.

    Args:
        modes: List of ModeContext objects from GSRSM data
        io_context: Optional IO context with variables and actions

    Returns:
        SequentialAgent for the complete pipeline
    """
    sfc_pipeline = create_sfc_generation_pipeline(modes, io_context)

    return SequentialAgent(
        name="FullAutomationPipeline",
        description="Complete automation pipeline: IO extraction → GSRSM design → SFC generation.",
        sub_agents=[spec_analyst, gsrsm_engineer, sfc_pipeline]
    )



def create_orchestrator(
    modes: Optional[List[ModeContext]] = None,
    io_context: Optional[Dict[str, Any]] = None,
    include_simulation: bool = False
) -> LlmAgent:
    """
    Creates the ThinkingForge orchestrator with all sub-agents.

    The orchestrator is an LlmAgent that can delegate to:
    - SpecAnalyst (LlmAgent) - for IO extraction
    - GsrsmEngineer (LlmAgent) - for GSRSM design
    - SFCGenerationPipeline (SequentialAgent) - for ALL SFC generation
      - Contains ConductSFCAgent + ModesSFCParallel (ParallelAgent)
    - SimulationAgent (LlmAgent) - for validation (only if explicitly requested)

    Args:
        modes: Optional list of ModeContext objects. If provided, creates
               the full SFC generation pipeline with parallel mode agents.
        io_context: Optional IO context with variables and actions.
        include_simulation: If True, include SimulationAgent in the orchestrator.
                           Default is False (simulation only when user requests it).

    Returns:
        LlmAgent orchestrator configured with appropriate sub_agents
    """
    # Build sub_agents list
    sub_agents_list = [spec_analyst, gsrsm_engineer]

    # If modes are provided, create the full SFC generation pipeline
    if modes and len(modes) > 0:
        sfc_pipeline = create_sfc_generation_pipeline(modes, io_context)
        sub_agents_list.append(sfc_pipeline)
    else:
        # No modes yet - just include the conduct_sfc_agent
        # (ModesSFCParallel will be added when modes are known)
        sub_agents_list.append(conduct_sfc_agent)

    # Only include simulation agent if explicitly requested
    if include_simulation:
        sub_agents_list.append(simulation_agent)

    return LlmAgent(
        name="ThinkingForge",
        model=DEFAULT_MODEL,
        description="Main orchestrator for GRAFCET automation. Routes tasks to specialized agents.",
        instruction=ORCHESTRATOR_INSTRUCTION,
        sub_agents=sub_agents_list,
        planner=thinking_planner,  # Enable thought streaming
    )


# Default orchestrator - created lazily to avoid parent conflicts
# IMPORTANT: Don't create at module load - the modes_parallel_agent parent would be set
# and subsequent calls to create_configured_swarm would fail with "already has parent"
_default_orchestrator = None

def _get_default_orchestrator():
    """Lazily creates the default orchestrator on first access."""
    global _default_orchestrator
    if _default_orchestrator is None:
        # Create a fresh ParallelAgent for the default orchestrator
        default_modes_parallel = ParallelAgent(
            name="ModesSFCParallel",
            description="Executes all mode SFC agents in parallel for concurrent code generation.",
            sub_agents=[]
        )
        _default_orchestrator = LlmAgent(
            name="ThinkingForge",
            model=DEFAULT_MODEL,
            description="Main orchestrator for GRAFCET automation. Routes tasks to specialized agents.",
            instruction=ORCHESTRATOR_INSTRUCTION,
            sub_agents=[spec_analyst, gsrsm_engineer, conduct_sfc_agent, default_modes_parallel, simulation_agent],
            planner=thinking_planner,
        )
    return _default_orchestrator


# ============================================================================
# DYNAMIC CONFIGURATION FACTORY
# ============================================================================

def create_thinking_planner_with_level(thinking_level: str) -> BuiltInPlanner:
    """
    Creates a BuiltInPlanner with the specified thinking level.

    Gemini 3 thinking levels:
    - gemini-3-pro-preview: low, high
    - gemini-3.1-flash-lite-preview: minimal, low, medium, high
    """
    return BuiltInPlanner(
        thinking_config=ThinkingConfig(
            include_thoughts=True,
            thinking_level=thinking_level,
        )
    )


def create_configured_swarm(model: str = DEFAULT_MODEL, thinking_level: str = DEFAULT_THINKING_LEVEL) -> LlmAgent:
    """
    Creates a fully configured orchestrator with the specified model and thinking level.

    This allows runtime configuration from the frontend:
    - model: gemini-3.1-pro-preview or gemini-3.1-flash-lite-preview
    - thinking_level: minimal (Flash only), low, medium (Flash only), high

    Returns:
        LlmAgent orchestrator configured with the specified parameters
    """
    # Validate thinking level for the model
    if model == "gemini-3-pro-preview" and thinking_level in ["minimal", "medium"]:
        thinking_level = "low"  # Pro only supports low and high

    custom_planner = create_thinking_planner_with_level(thinking_level)

    # Create agents with custom model and planner
    custom_spec_analyst = LlmAgent(
        name="SpecAnalyst",
        model=model,
        description="Extracts IO configuration (variables and actions) from specification documents.",
        output_key="io_data",
        instruction=SPEC_ANALYST_INSTRUCTION,
        tools=[project_io_tool.extract_io_config],
        planner=custom_planner,
    )

    custom_gsrsm_engineer = LlmAgent(
        name="GsrsmEngineer",
        model=model,
        description="Designs GEMMA/GSRSM operating modes and transitions based on IEC 60848 standard.",
        output_key="gsrsm_data",
        instruction=GSRSM_ENGINEER_INSTRUCTION,
        tools=[update_gsrsm_tool.update_gsrsm_modes],
        planner=custom_planner,
    )

    custom_conduct_sfc_agent = LlmAgent(
        name="ConductSFCAgent",
        model=model,
        description="Generates the master Conduct SFC and registers mode agents for parallel execution.",
        output_key="conduct_result",
        instruction=CONDUCT_SFC_EXTENDED_INSTRUCTION,
        tools=[compile_save_tool.compile_and_save_sfc, _register_mode_agents_tool.register_mode_agents],
        planner=custom_planner,
    )

    custom_simulation_agent = LlmAgent(
        name="SimulationAgent",
        model=model,
        description="Validates generated SFC files through simulation for logic correctness and safety compliance.",
        output_key="validation_result",
        instruction=SIMULATION_AGENT_INSTRUCTION,
        tools=[get_sfc_content_tool.get_sfc_content, get_sfc_content_tool.get_sfc_from_state, run_simulation_tool.run_simulation],
        planner=custom_planner,
    )

    # Create a NEW ParallelAgent instance for this swarm (avoid parent conflict)
    # Each swarm needs its own modes_parallel_agent to avoid "already has parent" error
    custom_modes_parallel_agent = ParallelAgent(
        name="ModesSFCParallel",
        description="Executes all mode SFC agents in parallel for concurrent code generation.",
        sub_agents=[]
    )

    # Update the global reference so RegisterModeAgentsTool can populate it
    global modes_parallel_agent
    modes_parallel_agent = custom_modes_parallel_agent

    custom_orchestrator = LlmAgent(
        name="ThinkingForge",
        model=model,
        description="Main orchestrator for GRAFCET automation. Routes tasks to specialized agents.",
        instruction=ORCHESTRATOR_INSTRUCTION,
        sub_agents=[custom_spec_analyst, custom_gsrsm_engineer, custom_conduct_sfc_agent, custom_modes_parallel_agent, custom_simulation_agent],
        planner=custom_planner,
    )

    logger.info(f"[ADK] Created configured swarm: model={model}, thinking_level={thinking_level}")
    return custom_orchestrator


# ============================================================================
# EXPORT FUNCTIONS
# ============================================================================

def get_swarm():
    """Returns the default orchestrator agent (without mode-specific pipeline)."""
    return _get_default_orchestrator()


def get_configured_swarm(model: str = None, thinking_level: str = None) -> LlmAgent:
    """
    Returns a configured orchestrator with the specified model and thinking level.

    If no parameters provided, returns the default orchestrator.
    """
    if model is None and thinking_level is None:
        return _get_default_orchestrator()
    return create_configured_swarm(
        model=model or DEFAULT_MODEL,
        thinking_level=thinking_level or DEFAULT_THINKING_LEVEL
    )


def get_orchestrator(modes: Optional[List[ModeContext]] = None, io_context: Optional[Dict[str, Any]] = None):
    """
    Returns the orchestrator with optional SFC generation pipeline.

    When modes are provided, the orchestrator includes:
    - SFCGenerationPipeline (SequentialAgent containing:
      - ConductSFCAgent
      - ModesSFCParallel (ParallelAgent with one agent per mode)

    The LLM can use transfer_to_agent to delegate to any sub-agent.
    """
    if modes:
        return create_orchestrator(modes, io_context)
    return _get_default_orchestrator()


def get_spec_analyst():
    """Returns the SpecAnalyst agent."""
    return spec_analyst


def get_gsrsm_engineer():
    """Returns the GsrsmEngineer agent."""
    return gsrsm_engineer


def get_conduct_sfc_agent():
    """Returns the ConductSFCAgent."""
    return conduct_sfc_agent


def get_simulation_agent():
    """Returns the SimulationAgent."""
    return simulation_agent


def get_sfc_generation_pipeline(modes: List[ModeContext], io_context: Optional[Dict[str, Any]] = None):
    """Returns a configured SFC generation pipeline (SequentialAgent)."""
    return create_sfc_generation_pipeline(modes, io_context)


def get_modes_parallel_agent(modes: List[ModeContext], io_context: Optional[Dict[str, Any]] = None):
    """Returns the parallel agent for mode SFC generation."""
    return create_modes_parallel_agent(modes, io_context)


def get_full_pipeline(modes: List[ModeContext], io_context: Optional[Dict[str, Any]] = None):
    """Returns the complete automation pipeline (SequentialAgent)."""
    return create_full_automation_pipeline(modes, io_context)
