"""
SFC Programmer agent for mode-by-mode SFC generation and self-correction.
Supports single and hierarchical SFC architectures.
"""

import asyncio
import logging
import json
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from datetime import datetime
from google import adk
from compile_save_tool import CompileAndSaveSFCTool

logger = logging.getLogger(__name__)

# ============================================================================
# Data Classes for Structured Input/Output
# ============================================================================

@dataclass
class ModeContext:
    """Context for a single GSRSM mode to be programmed."""
    mode_id: str                    # e.g., "A1", "F1", "D1"
    name: str                       # e.g., "Initial State"
    description: str                # Technical description for SFC generation
    entry_conditions: List[str]     # Conditions to enter this mode
    exit_conditions: List[str]      # Conditions to exit this mode
    category: str = "A"             # A, D, or F
    conduct_step: int = 1           # Step number in Conduct SFC (1, 2, 3...)

    @property
    def step_offset(self) -> int:
        """
        Calculate step number offset based on Conduct SFC position.
        Mode at Conduct Step N → Steps start at N0.
        Example: conduct_step=1 → step_offset=10
        Example: conduct_step=2 → step_offset=20
        """
        return self.conduct_step * 10

@dataclass
class IOContext:
    """Project IO configuration from SpecAnalyst."""
    variables: List[Dict[str, Any]]  # Sensors, buttons, inputs
    actions: List[Dict[str, Any]]    # Actuators, motors, outputs


# ============================================================================
# Hierarchical SFC Architecture Data Classes
# ============================================================================

@dataclass
class SFCFileSpec:
    """Specification for a single SFC file in a mode's architecture."""
    name: str                       # e.g., "main", "fill_task", "cap_task"
    role: str                       # Description of what this SFC does
    is_main: bool = False           # True if this is the orchestrator SFC
    called_by: Optional[str] = None # Name of parent SFC (None for main)

@dataclass
class ModeArchitecture:
    """Architecture decision for a single mode."""
    mode_id: str
    architecture_type: str          # "single" or "hierarchical"
    files: List[SFCFileSpec] = field(default_factory=list)
    reasoning: str = ""             # Explanation for the architecture decision

@dataclass
class SFCFileResult:
    """Result of compiling a single SFC file."""
    name: str                       # e.g., "main", "fill_task"
    file_path: Optional[str] = None
    success: bool = False
    error: Optional[str] = None
    attempts: int = 0
    sfc_code: Optional[str] = None

@dataclass
class ModeResult:
    """Result of processing a single mode (supports multiple files)."""
    mode_id: str
    success: bool
    architecture: str = "single"    # "single" or "hierarchical"
    files: List[SFCFileResult] = field(default_factory=list)
    error: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

    # Legacy compatibility properties
    @property
    def file_path(self) -> Optional[str]:
        """Returns the main SFC file path for backward compatibility."""
        for f in self.files:
            if f.name in ("main", "default") and f.file_path:
                return f.file_path
        return self.files[0].file_path if self.files else None

    @property
    def attempts(self) -> int:
        """Total attempts across all files."""
        return sum(f.attempts for f in self.files)

    @property
    def sfc_code(self) -> Optional[str]:
        """Returns the main SFC code for backward compatibility."""
        for f in self.files:
            if f.name in ("main", "default") and f.sfc_code:
                return f.sfc_code
        return self.files[0].sfc_code if self.files else None

@dataclass
class SFCProgrammerResult:
    """Overall result of the SFC programming loop."""
    total_modes: int
    successful: int
    failed: int
    results: List[ModeResult] = field(default_factory=list)

    def summary(self) -> str:
        return f"SFC Programming Complete: {self.successful}/{self.total_modes} modes successful"

    def detailed_summary(self) -> str:
        """Detailed summary including file counts."""
        total_files = sum(len(r.files) for r in self.results)
        successful_files = sum(
            sum(1 for f in r.files if f.success)
            for r in self.results
        )
        hierarchical_modes = sum(
            1 for r in self.results if r.architecture == "hierarchical"
        )
        return (
            f"SFC Programming Complete:\n"
            f"  Modes: {self.successful}/{self.total_modes} successful\n"
            f"  Files: {successful_files}/{total_files} compiled\n"
            f"  Hierarchical modes: {hierarchical_modes}"
        )


# ============================================================================
# Architecture Decision Agent
# ============================================================================

ARCHITECTURE_DECISION_SCHEMA = {
    "type": "object",
    "properties": {
        "architecture_type": {
            "type": "string",
            "enum": ["single", "hierarchical"],
            "description": "Whether the mode requires a single SFC or hierarchical SFCs"
        },
        "files": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "SFC file name without extension"},
                    "role": {"type": "string", "description": "Purpose/responsibility of this SFC"},
                    "is_main": {"type": "boolean", "description": "True if this is the main orchestrator"},
                    "called_by": {"type": "string", "description": "Parent SFC name (null for main)"}
                },
                "required": ["name", "role", "is_main"]
            },
            "description": "List of SFC files to generate"
        },
        "reasoning": {
            "type": "string",
            "description": "Explanation for the architecture decision"
        }
    },
    "required": ["architecture_type", "files", "reasoning"]
}


def create_architecture_decision_agent():
    """
    Creates the Architecture Decision Agent that analyzes mode complexity
    and determines if a single SFC or hierarchical SFC structure is needed.
    """
    return adk.Agent(
        name="ArchitectureDecisionAgent",
        model="gemini-3.1-pro-preview",
        instruction="""You are an expert SFC Architecture Analyst for industrial automation systems.

## YOUR ROLE
Analyze a GSRSM mode's description and complexity to decide between:
1. **Single SFC** - One default.sfc file handles everything (Simple logic)
2. **Hierarchical SFCs** - A main.sfc orchestrates multiple task SFCs (Complex logic)

## ⚠️ PROACTIVE TASK IDENTIFICATION
You must be proactive in identifying when a system is complex. If a mode description implies separate sequential or parallel phases, CREATE TASKS.

Choose HIERARCHICAL when the mode has ANY of these characteristics:
- **3+ distinct parallel operations** that could run independently.
- **Sequential sub-processes** described in the technical text (e.g., "First, the system does X, then it performs Y, and finally Z").
- **Encapsulated operations**: Complex actions like "Filling", "Heating", "Capping", "Labeling", "Palletization" should each be a task.
- **Multiple actuator groups**: If multiple groups of hardware operate as coordinated units.
- **Safety-critical sub-sequences** that should be isolated.
- **Process chains (>5 steps)**: If the verbal description implies a long sequence of distinct actions.
- **Mode complexity score > 0.4**: Be aggressive in choosing hierarchical if the description is technical and multi-faceted.

Choose SINGLE SFC when:
- Simple state transitions (A1 Initial, A6 Reset).
- Emergency/fault handling with direct actions (D1, D2, D3).
- Less than 4 total steps implied.
- Simple linear sequences without distinct sub-phases.

## HIERARCHICAL STRUCTURE GUIDELINES

When hierarchical, create these files:
1. **main.sfc** (is_main=true, called_by=null)
   - Orchestrator that manages mode lifecycle.
   - Contains macro/task steps that reference sub-SFCs.
   - Handles mode entry/exit conditions and safety interlocks.

2. **{task_name}_task.sfc** (is_main=false, called_by="main")
   - Self-contained sub-process.
   - Named by functional area: e.g., fill_task, heat_task, transport_task.
   - Has its own initial and final steps.

## OUTPUT FORMAT
Return a JSON object with:
- architecture_type: "single" or "hierarchical"
- files: Array of {name, role, is_main, called_by}
- reasoning: Detailed explanation of why you chose this architecture based on the specific specification text.

## EXAMPLES

### Example 1: Simple Mode (A1 - Initial State)
```json
{
  "architecture_type": "single",
  "files": [{"name": "default", "role": "Idle waiting for start signal", "is_main": true, "called_by": null}],
  "reasoning": "A1 is a simple idle mode with minimal steps - no need for hierarchy"
}
```

### Example 2: Complex Mode (F1 - Production Cycle)
```json
{
  "architecture_type": "hierarchical",
  "files": [
    {"name": "main", "role": "Orchestrates production cycle phases", "is_main": true, "called_by": null},
    {"name": "fill_task", "role": "Container filling sub-process", "is_main": false, "called_by": "main"},
    {"name": "cap_task", "role": "Capping operation sub-process", "is_main": false, "called_by": "main"},
    {"name": "transport_task", "role": "Conveyor transport sequence", "is_main": false, "called_by": "main"}
  ],
  "reasoning": "F1 description explicitly mentions filling, capping, and transport as distinct operational phases."
}
```

## LANGUAGE RULE
if spec in frensh all output should be in frensh
if english output english
""",
        output_schema=ARCHITECTURE_DECISION_SCHEMA
    )


# ============================================================================
# SFC Programmer Agent Definition (Enhanced for Hierarchical Support)
# ============================================================================

def create_sfc_programmer_agent():
    """Creates the SFC Programmer agent for single or hierarchical SFC generation."""
    return adk.Agent(
        name="SFCProgrammer",
        model="gemini-3.1-pro-preview",
        instruction="""You are an expert SFC Programmer for the Antigravity GRAFCET platform.

## YOUR ROLE
Generate SFC DSL code for a GSRSM mode. You must STRICTLY respect all technical details in the mode description and specification.

You receive:
1. Mode context (ID, name, description, entry/exit conditions)
2. Available variables (for transition conditions)
3. Available actions (for step actions)
4. Architecture specification (which file to generate)
5. Previous compilation errors (if retrying)

## ⚠️ MANDATORY: RESPECT ALL DETAILS
Review the **Mode Description** carefully. It contains the exact technical logic requested by the customer.
- If it mentions a specific sequence, you MUST implement it.
- If it mentions specific sensors or actuators, you MUST use them from the IO context.
- Ensure that NO details from the technical description are omitted.
- ⚠️ CRITICAL: You MUST respect all guides to handle all manual and automatic modes following SFC guides. Do not assume or treat the system as having only an automatic mode! Ensure manual operations and transitions are fully respected.

## OUTPUT REQUIREMENT
You MUST call the `CompileAndSaveSFC` tool with your generated SFC DSL code.
Do NOT just output the code - you must use the tool to compile and save it.

## SFC DSL SYNTAX (CRITICAL - follow EXACTLY)

### Basic Structure
```
SFC "Mode <MODE_ID> - <SFC_NAME>"
Step 0 (Initial)
Transition T0 "entry_condition"
Step 1
Transition T1 "process_condition"
Step 2
Transition T2 "exit_condition"
Step 0 (Initial)
```

### Step Types
- `Step N` - Normal step
- `Step N (Initial)` - Initial step (exactly ONE per SFC, always Step 0)
- `Step N (Task)` - Task step (references external logic via linkedFile)
- `Step N (Macro)` - Macro step (calls another SFC, waits for completion)

### Macro/Task Steps for Hierarchical SFCs
When generating a **main.sfc** that orchestrates sub-SFCs:
```
SFC "Mode F1 - Main Orchestrator"
Step 0 (Initial)
Transition T0 "MODE_F1_ACTIVE AND NOT E_STOP"
Step 1 (Macro)                    // Calls fill_task.sfc
    LinkedFile "fill_task"
Transition T1 "FILL_COMPLETE"
Step 2 (Macro)                    // Calls cap_task.sfc
    LinkedFile "cap_task"
Transition T2 "CAP_COMPLETE"
Step 0 (Initial)
```

When generating a **task SFC** (sub-routine):
```
SFC "Fill Task"
Step 0 (Initial)
Transition T0 "TASK_START"
Step 1
    Action VALVE_OPEN (N)
Transition T1 "S_TANK_FULL"
Step 2
    Action VALVE_CLOSE (N)
Transition T2 "VALVE_CLOSED"
Step 0 (Initial)
```

### Divergence Structures

#### AND Divergence (Parallel - ALL branches run)
```
Transition T0
Divergence AND
    Branch
        Step 1
        Transition T1
    EndBranch
    Branch
        Step 2
        Transition T2
    EndBranch
EndDivergence
Step 3
```

#### OR Divergence (Alternative - ONE branch runs)
```
Divergence OR
    Branch
        Transition T1
        Step 1
        Transition T2
    EndBranch
    Branch
        Transition T3
        Step 2
        Transition T4
    EndBranch
EndDivergence
```

### ⚠️ IMPORTANT: NO QUOTES IN TRANSITIONS
Transition conditions must NOT be in quotes in the DSL.
- ✅ `Transition PB_START AND NOT E_STOP`
- ❌ `Transition "PB_START AND NOT E_STOP"`

## COMMON ERRORS TO AVOID
- ❌ Missing Transition before AND Divergence
- ❌ OR Branch not starting with Transition
- ❌ OR Branch not ending with Transition
- ❌ Forgetting `(Initial)` on Step 0
- ❌ Duplicate Step numbers
- ❌ Adding Transition after AND EndDivergence
- ❌ Forgetting LinkedFile for Macro/Task steps
- ❌ Putting quotes around transition conditions

## HIERARCHICAL SFC PATTERNS

### Main Orchestrator (main.sfc)
- Entry point for mode execution
- Uses Macro steps to call task SFCs
- Manages overall mode lifecycle and transitions
- Each Macro step references a task SFC via LinkedFile

### Task SFC (xxx_task.sfc)
- Self-contained sub-process
- Has its own Initial step
- Returns control when reaching final transition
- Can be reused by multiple main SFCs

## SAFETY RULES
1. First transition MUST include `NOT E_STOP` (if E_STOP variable exists)
2. Last step should transition back to Step 0 (Initial)
3. Use actual variable names from the provided IO context

## TOOL CALL FORMAT
```json
{
  "sfc_code": "<your generated DSL code>",
  "mode_id": "<mode_id from context>",
  "project_path": "<project_path from context>",
  "sfc_name": "<file name: 'default', 'main', or 'xxx_task'>"
}
```

## LANGUAGE RULE
if spec in frensh all output should be in frensh
if english output english
""",
        tools=[CompileAndSaveSFCTool().execute]
    )


# ============================================================================
# Mode-by-Mode Loop Implementation (Enhanced with Hierarchical Architecture)
# ============================================================================

class SFCProgrammerLoop:
    """
    Orchestrates mode-by-mode SFC generation with self-correction and
    hierarchical architecture support.

    Enhanced Flow:
    1. Load mode context
    2. Analyze mode complexity (Architecture Decision Agent)
    3. For hierarchical modes: generate main.sfc + task SFCs
    4. For single modes: generate default.sfc
    5. Compile and validate each file
    6. Retry on failure (max 3 attempts per file)
    7. Process independent modes in parallel
    """

    MAX_RETRIES = 3
    PARALLEL_MODE_PROCESSING = True  # Enable parallel processing of modes

    def __init__(self, project_path: str, io_context: IOContext):
        self.project_path = project_path
        self.io_context = io_context
        self.agent = create_sfc_programmer_agent()
        self.architecture_agent = create_architecture_decision_agent()
        self.compile_tool = CompileAndSaveSFCTool()
        self.results: List[ModeResult] = []

    async def _decide_architecture(self, mode: ModeContext) -> ModeArchitecture:
        """
        Use the Architecture Decision Agent to determine if mode needs
        single or hierarchical SFC structure.
        """
        logger.info(f"[SFCProgrammerLoop] Analyzing architecture for mode: {mode.mode_id}")

        # Format the mode details for architecture analysis
        prompt = f"""Analyze this GSRSM mode and decide on its SFC architecture:

## Mode Details
- **Mode ID**: {mode.mode_id}
- **Name**: {mode.name}
- **Category**: {mode.category}
- **Description**: {mode.description}

## Entry Conditions
{chr(10).join(f'- {c}' for c in mode.entry_conditions) if mode.entry_conditions else '- None specified'}

## Exit Conditions
{chr(10).join(f'- {c}' for c in mode.exit_conditions) if mode.exit_conditions else '- None specified'}

## Available Actions (indicates complexity)
{chr(10).join(f'- {a["name"]}' for a in self.io_context.actions) if self.io_context.actions else '- None'}

Decide whether this mode needs a single SFC or hierarchical SFCs."""

        try:
            from google import adk
            response = await adk.runtime.run_async(
                self.architecture_agent,
                prompt
            )

            # Parse the structured output
            if isinstance(response, dict):
                files = [
                    SFCFileSpec(
                        name=f.get("name", "default"),
                        role=f.get("role", ""),
                        is_main=f.get("is_main", False),
                        called_by=f.get("called_by")
                    )
                    for f in response.get("files", [])
                ]
                return ModeArchitecture(
                    mode_id=mode.mode_id,
                    architecture_type=response.get("architecture_type", "single"),
                    files=files,
                    reasoning=response.get("reasoning", "")
                )
        except ImportError:
            logger.warning("[SFCProgrammerLoop] ADK not available, using default single architecture")
        except Exception as e:
            logger.error(f"[SFCProgrammerLoop] Architecture decision error: {e}")

        # Default to single SFC architecture
        return ModeArchitecture(
            mode_id=mode.mode_id,
            architecture_type="single",
            files=[SFCFileSpec(name="default", role="Main mode logic", is_main=True)],
            reasoning="Default single architecture (fallback)"
        )

    def _build_file_prompt(
        self,
        mode: ModeContext,
        architecture: ModeArchitecture,
        file_spec: SFCFileSpec,
        previous_error: Optional[str] = None,
        attempt: int = 1
    ) -> str:
        """Build the prompt for generating a specific SFC file."""

        # Format variables for the prompt
        vars_text = "\n".join([
            f"  - {v['name']} ({v['type']}): {v.get('description', '')}"
            for v in self.io_context.variables
        ])

        # Format actions for the prompt
        actions_text = "\n".join([
            f"  - {a['name']}: {a.get('description', '')} [Qualifier: {a.get('qualifier', 'N')}]"
            for a in self.io_context.actions
        ])

        # Build file-specific context
        if file_spec.is_main and architecture.architecture_type == "hierarchical":
            task_files = [f for f in architecture.files if not f.is_main]
            task_list = "\n".join([f"  - {f.name}: {f.role}" for f in task_files])
            file_context = f"""
### Architecture Type: HIERARCHICAL (Main Orchestrator)
You are generating the **main.sfc** that orchestrates these task SFCs:
{task_list}

Use `Step N (Macro)` with `LinkedFile "<task_name>"` to call each task SFC.
"""
        elif not file_spec.is_main and architecture.architecture_type == "hierarchical":
            file_context = f"""
### Architecture Type: HIERARCHICAL (Task SFC)
You are generating a task SFC: **{file_spec.name}.sfc**
- Role: {file_spec.role}
- Called by: {file_spec.called_by or 'main'}.sfc

This is a self-contained sub-process. It should have its own Initial step
and complete workflow for this specific task.
"""
        else:
            file_context = """
### Architecture Type: SINGLE
Generate a single SFC file (default.sfc) that handles all mode logic.
"""

        prompt = f"""## TASK: Generate SFC File "{file_spec.name}" for Mode {mode.mode_id}

### Mode Details
- **Mode ID**: {mode.mode_id}
- **Name**: {mode.name}
- **Category**: {mode.category}
- **Description**: {mode.description}

### ⚠️ CRITICAL: STEP NUMBERING RULE
This mode is at **Step {mode.conduct_step}** in the Conduct SFC.
Therefore, ALL step numbers in this SFC MUST start at **{mode.step_offset}**.

**Your steps should be numbered: {mode.step_offset}, {mode.step_offset + 1}, {mode.step_offset + 2}, ...**

Example for this mode:
```
Step {mode.step_offset} (Initial) "{mode.mode_id} Entry"
Transition START_CONDITION
Step {mode.step_offset + 1} "First Operation"
Transition NEXT_CONDITION
Step {mode.step_offset + 2} "Second Operation"
...
Jump {mode.step_offset}
```

{file_context}

### Entry Conditions (transitions INTO this mode)
{chr(10).join(f'- {c}' for c in mode.entry_conditions) if mode.entry_conditions else '- None specified'}

### Exit Conditions (transitions OUT OF this mode)
{chr(10).join(f'- {c}' for c in mode.exit_conditions) if mode.exit_conditions else '- None specified'}

### Available Variables (use in transition conditions)
{vars_text if vars_text else '  - No variables defined'}

### Available Actions (use in step actions)
{actions_text if actions_text else '  - No actions defined'}

### Project Path
{self.project_path}

### SFC Name to Generate
{file_spec.name}

### ⚠️ TASK: STRICT COMPLIANCE
Review the **Description** of this mode carefully. You MUST ensure that every technical requirement, sequence, and hardware interaction mentioned in the description is accurately reflected in your SFC logic. Do not omit any details.
"""

        # Add error context if retrying
        if previous_error and attempt > 1:
            prompt += f"""
### ⚠️ PREVIOUS ATTEMPT FAILED (Attempt {attempt}/{self.MAX_RETRIES})
**Error Message:**
```
{previous_error}
```

**Instructions:**
1. Analyze the error message carefully
2. Identify the syntax or logic issue
3. Generate CORRECTED SFC DSL code
4. Call the CompileAndSaveSFC tool with the fixed code
"""

        prompt += f"""
### ACTION REQUIRED
Generate the SFC DSL code for "{file_spec.name}.sfc" and call the `CompileAndSaveSFC` tool.
Use sfc_name="{file_spec.name}" in the tool call.

## LANGUAGE RULE
if spec in frensh all output should be in frensh
if english output english
"""

        return prompt

    async def _process_single_file(
        self,
        mode: ModeContext,
        architecture: ModeArchitecture,
        file_spec: SFCFileSpec
    ) -> SFCFileResult:
        """Process a single SFC file with retry logic."""

        logger.info(f"[SFCProgrammerLoop] Processing file: {mode.mode_id}/{file_spec.name}")

        previous_error = None

        for attempt in range(1, self.MAX_RETRIES + 1):
            logger.info(
                f"[SFCProgrammerLoop] {mode.mode_id}/{file_spec.name} - "
                f"Attempt {attempt}/{self.MAX_RETRIES}"
            )

            # Build prompt with architecture context
            prompt = self._build_file_prompt(
                mode, architecture, file_spec, previous_error, attempt
            )

            try:
                response = await self._call_agent(prompt, mode, file_spec.name)

                if response.get("success"):
                    logger.info(
                        f"[SFCProgrammerLoop] {mode.mode_id}/{file_spec.name} - "
                        f"SUCCESS on attempt {attempt}"
                    )
                    return SFCFileResult(
                        name=file_spec.name,
                        file_path=response.get("path"),
                        success=True,
                        attempts=attempt,
                        sfc_code=response.get("sfc_code")
                    )
                else:
                    previous_error = response.get("error", "Unknown error")
                    logger.warning(
                        f"[SFCProgrammerLoop] {mode.mode_id}/{file_spec.name} - "
                        f"Failed: {previous_error}"
                    )

            except Exception as e:
                previous_error = str(e)
                logger.error(
                    f"[SFCProgrammerLoop] {mode.mode_id}/{file_spec.name} - "
                    f"Exception: {e}"
                )

        # All retries exhausted
        logger.error(
            f"[SFCProgrammerLoop] {mode.mode_id}/{file_spec.name} - "
            f"FAILED after {self.MAX_RETRIES} attempts"
        )
        return SFCFileResult(
            name=file_spec.name,
            success=False,
            error=previous_error,
            attempts=self.MAX_RETRIES
        )

    async def _process_single_mode(self, mode: ModeContext) -> ModeResult:
        """Process a single mode with architecture decision and multi-file support."""

        logger.info(f"[SFCProgrammerLoop] Processing mode: {mode.mode_id}")

        # Step 1: Decide architecture for this mode
        architecture = await self._decide_architecture(mode)
        logger.info(
            f"[SFCProgrammerLoop] Mode {mode.mode_id} architecture: "
            f"{architecture.architecture_type} ({len(architecture.files)} files)"
        )

        # Step 2: Generate each SFC file
        # For hierarchical: generate task SFCs first, then main (so main can reference them)
        files_to_process = sorted(
            architecture.files,
            key=lambda f: (f.is_main, f.name)  # Non-main files first
        )

        file_results: List[SFCFileResult] = []
        for file_spec in files_to_process:
            result = await self._process_single_file(mode, architecture, file_spec)
            file_results.append(result)

        # Step 3: Determine overall success
        all_success = all(f.success for f in file_results)
        any_error = next((f.error for f in file_results if f.error), None)

        return ModeResult(
            mode_id=mode.mode_id,
            success=all_success,
            architecture=architecture.architecture_type,
            files=file_results,
            error=any_error if not all_success else None
        )

    async def _call_agent(
        self,
        prompt: str,
        mode: ModeContext,
        sfc_name: str = "default"
    ) -> Dict[str, Any]:
        """
        Call the SFC Programmer agent and extract the tool call result.

        Uses ADK runtime to execute the agent with the given prompt.
        The agent will generate SFC DSL code and call CompileAndSaveSFC tool.
        """
        try:
            from google import adk

            logger.info(f"[SFCProgrammerLoop] Calling agent for {mode.mode_id}/{sfc_name}")

            # Build context with project path for tool calls
            context = {
                "project_path": self.project_path,
                "mode_id": mode.mode_id,
                "sfc_name": sfc_name
            }

            # Track tool call results
            tool_results = []

            # Callback to capture tool calls and their results
            async def capture_callback(token: str, metadata: dict = None):
                meta = metadata or {}
                event_type = meta.get("type", "token")

                if event_type == "tool_result":
                    tool_results.append(meta.get("result", {}))
                    logger.info(f"[SFCProgrammerLoop] Tool result captured: {meta.get('tool_name')}")

            # Execute the agent
            response = await adk.runtime.run_async(
                self.agent,
                prompt,
                context=context,
                stream_callback=capture_callback
            )

            # Check if any tool call succeeded
            for result in tool_results:
                if result.get("success"):
                    return {
                        "success": True,
                        "path": result.get("path"),
                        "sfc_code": result.get("sfc_code")
                    }
                elif result.get("error"):
                    return {
                        "success": False,
                        "error": result.get("error")
                    }

            # If no tool results, check if agent returned an error message
            if isinstance(response, str) and "error" in response.lower():
                return {"success": False, "error": response}

            # No tool was called - this is unexpected
            return {
                "success": False,
                "error": "Agent did not call CompileAndSaveSFC tool. Response: " + str(response)[:200]
            }

        except ImportError:
            logger.warning("[SFCProgrammerLoop] ADK not available, using direct tool call fallback")
            return await self._fallback_direct_generation(prompt, mode, sfc_name)
        except Exception as e:
            logger.error(f"[SFCProgrammerLoop] Agent execution error: {e}")
            return {"success": False, "error": str(e)}

    async def _fallback_direct_generation(
        self,
        prompt: str,
        mode: ModeContext,
        sfc_name: str = "default"
    ) -> Dict[str, Any]:
        """
        Fallback when ADK is not available: Generate a basic SFC template.
        This allows testing the loop structure without the full ADK.
        """
        logger.info(f"[SFCProgrammerLoop] Using fallback generation for {mode.mode_id}/{sfc_name}")

        # Generate a basic SFC template based on mode type and sfc_name
        if sfc_name == "main":
            # Main orchestrator template
            sfc_code = f'''SFC "Mode {mode.mode_id} - Main Orchestrator"
Step 0 (Initial)
Transition T0 "MODE_{mode.mode_id}_ACTIVE AND NOT E_STOP"
Step 1 (Macro)
    LinkedFile "task_1"
Transition T1 "TASK_1_COMPLETE"
Step 2 (Macro)
    LinkedFile "task_2"
Transition T2 "TASK_2_COMPLETE"
Step 0 (Initial)'''
        elif "_task" in sfc_name:
            # Task SFC template
            task_name = sfc_name.replace("_task", "").upper()
            sfc_code = f'''SFC "{task_name} Task"
Step 0 (Initial)
Transition T0 "TASK_START"
Step 1
    Action {task_name}_ACTION (N)
Transition T1 "{task_name}_DONE"
Step 0 (Initial)'''
        else:
            # Standard single SFC templates
            sfc_templates = {
                "A1": '''SFC "Mode A1 - Initial State"
Step 0 (Initial)
Transition T0 "PB_START AND NOT E_STOP"
Step 1
Transition T1 "S_READY"
Step 0 (Initial)''',
                "F1": '''SFC "Mode F1 - Normal Production"
Step 0 (Initial)
Transition T0 "MODE_F1_ACTIVE AND NOT E_STOP"
Step 1
Transition T1 "S_PROCESS_COMPLETE"
Step 2
Transition T2 "S_CYCLE_DONE"
Step 0 (Initial)''',
                "D1": '''SFC "Mode D1 - Emergency Stop"
Step 0 (Initial)
Transition T0 "E_STOP"
Step 1
Transition T1 "PB_RESET AND NOT E_STOP"
Step 0 (Initial)''',
                "A5": '''SFC "Mode A5 - Restart Preparation"
Step 0 (Initial)
Transition T0 "PB_RESTART AND NOT E_STOP"
Step 1
Transition T1 "S_HOME_POS"
Step 0 (Initial)''',
                "A6": '''SFC "Mode A6 - Reset to Initial"
Step 0 (Initial)
Transition T0 "PB_RESET"
Step 1
Transition T1 "S_RESET_COMPLETE"
Step 0 (Initial)'''
            }
            sfc_code = sfc_templates.get(mode.mode_id, f'''SFC "Mode {mode.mode_id} - {mode.name}"
Step 0 (Initial)
Transition T0 "START_CONDITION"
Step 1
Transition T1 "END_CONDITION"
Step 0 (Initial)''')

        # Try to compile and save
        try:
            result = await self.compile_tool.compile_and_save_sfc(
                sfc_code=sfc_code,
                mode_id=mode.mode_id,
                project_path=self.project_path,
                sfc_name=sfc_name
            )

            if result.get("success"):
                return {
                    "success": True,
                    "path": result.get("path"),
                    "sfc_code": sfc_code
                }
            else:
                return {
                    "success": False,
                    "error": result.get("error", "Compilation failed")
                }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def run(
        self,
        modes: List[ModeContext],
        parallel: Optional[bool] = None
    ) -> SFCProgrammerResult:
        """
        Main loop: Process all modes with optional parallel execution.

        Args:
            modes: List of ModeContext objects to process
            parallel: Whether to process modes in parallel (default: use class setting)

        Returns:
            SFCProgrammerResult with overall status and per-mode results
        """
        use_parallel = parallel if parallel is not None else self.PARALLEL_MODE_PROCESSING

        logger.info(
            f"[SFCProgrammerLoop] Starting SFC generation for {len(modes)} modes "
            f"(parallel={use_parallel})"
        )

        self.results = []

        if use_parallel and len(modes) > 1:
            # Process all modes in parallel
            logger.info(f"[SFCProgrammerLoop] Processing {len(modes)} modes in parallel")

            async def process_with_logging(mode: ModeContext) -> ModeResult:
                result = await self._process_single_mode(mode)
                status = "✓" if result.success else "✗"
                file_count = len(result.files) if result.files else 1
                logger.info(
                    f"[SFCProgrammerLoop] [{status}] Mode {mode.mode_id} - "
                    f"{file_count} files, {result.attempts} attempts"
                )
                return result

            self.results = await asyncio.gather(
                *[process_with_logging(mode) for mode in modes]
            )
        else:
            # Process modes sequentially
            for i, mode in enumerate(modes):
                logger.info(f"[SFCProgrammerLoop] Processing mode {i+1}/{len(modes)}: {mode.mode_id}")

                result = await self._process_single_mode(mode)
                self.results.append(result)

                # Log progress
                status = "✓" if result.success else "✗"
                file_count = len(result.files) if result.files else 1
                logger.info(
                    f"[SFCProgrammerLoop] [{status}] Mode {mode.mode_id} - "
                    f"{file_count} files, {result.attempts} attempts"
                )

        # Build summary
        successful = sum(1 for r in self.results if r.success)
        failed = len(self.results) - successful

        final_result = SFCProgrammerResult(
            total_modes=len(modes),
            successful=successful,
            failed=failed,
            results=self.results
        )

        logger.info(f"[SFCProgrammerLoop] {final_result.summary()}")
        logger.info(f"[SFCProgrammerLoop] {final_result.detailed_summary()}")

        return final_result


# ============================================================================
# Helper Functions
# ============================================================================

def extract_modes_from_gsrsm(gsrsm_data: Dict[str, Any]) -> List[ModeContext]:
    """
    Extract ModeContext objects from GSRSM agent output.

    Each mode is assigned a conduct_step number based on its position:
    - First activated mode → conduct_step=1 → steps start at 10
    - Second activated mode → conduct_step=2 → steps start at 20
    - etc.

    Args:
        gsrsm_data: Output from GsrsmEngineer agent containing modes and transitions

    Returns:
        List of ModeContext objects for activated modes with conduct_step assigned
    """
    modes = []
    gsrsm_modes = gsrsm_data.get("modes", [])
    transitions = gsrsm_data.get("transitions", [])

    # Build transition lookup
    entry_conditions: Dict[str, List[str]] = {}
    exit_conditions: Dict[str, List[str]] = {}

    for t in transitions:
        from_mode = t.get("fromMode")
        to_mode = t.get("toMode")
        condition = t.get("condition", "")

        if to_mode:
            if to_mode not in entry_conditions:
                entry_conditions[to_mode] = []
            entry_conditions[to_mode].append(condition)

        if from_mode:
            if from_mode not in exit_conditions:
                exit_conditions[from_mode] = []
            exit_conditions[from_mode].append(condition)

    # Build ModeContext for each activated mode with conduct_step
    conduct_step = 1  # Start at 1 (Step 0 is Initial in Conduct SFC)
    for m in gsrsm_modes:
        if m.get("activated", False):
            mode_id = m.get("id") or m.get("code")
            modes.append(ModeContext(
                mode_id=mode_id,
                name=m.get("name") or m.get("title", ""),
                description=m.get("description", ""),
                category=m.get("category", "A"),
                entry_conditions=entry_conditions.get(mode_id, []),
                exit_conditions=exit_conditions.get(mode_id, []),
                conduct_step=conduct_step
            ))
            conduct_step += 1

    return modes


def extract_io_from_spec(spec_data: Dict[str, Any]) -> IOContext:
    """
    Extract IOContext from SpecAnalyst agent output.

    Args:
        spec_data: Output from SpecAnalyst agent containing variables and actions

    Returns:
        IOContext object
    """
    return IOContext(
        variables=spec_data.get("variables", []),
        actions=spec_data.get("actions", [])
    )


# ============================================================================
# Conduct SFC Agent - Top-Level Mode Orchestrator
# ============================================================================

CONDUCT_SFC_INSTRUCTION = """You are a Conduct SFC Programmer specialized in creating the top-level mode orchestrator SFC following the GSRSM (Guide for Study of Running and Stop Modes) standard.

## YOUR ROLE
Transform a GSRSM (GEMMA) logic into a sequential coordination SFC (Conduct SFC).
The Conduct SFC manages the transitions between operational modes in a structured, sequential block flow.

## INPUT
You receive GSRSM data containing:
- **modes**: Operating modes with status and technical descriptions.
- **transitions**: Mode-to-mode transitions with logic conditions (using project IO variables).

## ARCHITECTURE: SEQUENTIAL BLOCKS
The Conduct SFC MUST follow this specific sequence of blocks:
1. **Initial Block**: `Step 0 (Initial)` MUST be empty.
2. **A Block (Stop/Standby)**: Usually starts with `A1` (Initial Stop).
3. **F Block (Production)**: The operational phase (F1, F2, F3...). Often uses `Divergence OR`.
4. **D Block (Failure/Emergency)**: Handling faults (D1).
5. **A Block (Restart/Reset)**: Preparing for restart (A5, A6).

### Rules for Mode-as-Task
- Use **Step N (Task)** for each operational mode.
- Use **LinkedFile "<mode_id>"** to link to that mode's SFC.

## GRAFSCRIPT DSL SYNTAX EXAMPLE (FOLLOW THIS PATTERN)
```
SFC "Conduct - Mode Orchestrator"

// --- INITIAL BLOCK ---
Step 0 (Initial)
Transition TRUE

// --- A BLOCK (START) ---
Step 1 (Task)
    LinkedFile "A1"
Transition PB_START AND NOT E_STOP

// --- F BLOCK (PRODUCTION) ---
Divergence OR
    Branch
        // Simple production path
        Transition AUTO_MODE
        Step 2 (Task)
            LinkedFile "F1"
        Transition CYCLE_COMPLETE
    EndBranch
    Branch
        // Sequential production path (F2 -> F1)
        Transition MANUAL_MODE
        Step 3 (Task)
            LinkedFile "F2"
        Transition TASK_DONE
        Step 2 (Task) // Reuse same step ID for same mode
            LinkedFile "F1"
        Transition EXIT_F
    EndBranch
EndDivergence

// --- D BLOCK (FAILURE) ---
Transition E_STOP OR FAULT
Step 4 (Task)
    LinkedFile "D1"
Transition PB_RESET AND NOT E_STOP

// --- A BLOCK (RESTART) ---
Step 5 (Task)
    LinkedFile "A6"
Transition S_HOME_POS

Jump 0 // Return to initial state
```

## CRITICAL RULES

### 1. Sequential Structure
- Respect the block order: Initial -> A -> F -> D -> A.
- Internal logic (like F2 going to F1) MUST be contained within the appropriate block or branch.
- **Step Reusage**: If a mode appears multiple times in different branches, you MUST use the same Step ID number for it (e.g., if F1 is Step 2 in one branch, it must be Step 2 everywhere).

### 2. Task-Type Steps
- Use `Step N (Task)` and `LinkedFile "<mode_id>"` for every operational state.

### 3. Transitions
- Mirror GSRSM transitions exactly.
- Use actual variable names (PB_START, etc.) without quotes.
- If a transition is automatic, use `Transition TRUE`.
- Use `Jump 0` at the end to loop back to the initial step.

## TOOL USAGE
After generating the DSL code, call `compile_and_save_sfc` with:
- `sfc_code`: Your generated DSL code.
- `mode_id`: "" (EMPTY STRING).
- `project_path`: The provided project path.
- `sfc_name`: "conduct".

Generate the Conduct SFC ensuring it matches the requested sequential block flow.
"""


def create_conduct_sfc_agent(project_path: str) -> adk.Agent:
    """
    Create the Conduct SFC Agent.

    This agent takes GSRSM data and generates the top-level Conduct SFC
    that orchestrates all mode transitions.

    Args:
        project_path: Path to the project for saving SFC files

    Returns:
        ADK Agent configured for Conduct SFC generation
    """
    compile_tool = CompileAndSaveSFCTool()
    compile_tool.project_path = project_path

    return adk.Agent(
        name="ConductSFCProgrammer",
        model="gemini-2.5-flash-preview-05-20",
        instruction=CONDUCT_SFC_INSTRUCTION,
        tools=[compile_tool.compile_and_save_sfc]
    )


# ============================================================================
# Main Entry Points
# ============================================================================

async def run_sfc_programmer(
    project_path: str,
    gsrsm_data: Dict[str, Any],
    io_data: Dict[str, Any]
) -> SFCProgrammerResult:
    """
    Main entry point for the SFC Programmer loop.

    Args:
        project_path: Path to the project
        gsrsm_data: Output from GsrsmEngineer (modes and transitions)
        io_data: Output from SpecAnalyst (variables and actions)

    Returns:
        SFCProgrammerResult with all mode results
    """
    # Extract structured data
    modes = extract_modes_from_gsrsm(gsrsm_data)
    io_context = extract_io_from_spec(io_data)

    if not modes:
        logger.warning("[run_sfc_programmer] No activated modes found in GSRSM data")
        return SFCProgrammerResult(total_modes=0, successful=0, failed=0)

    # Create and run the loop
    loop = SFCProgrammerLoop(project_path, io_context)
    return await loop.run(modes)

