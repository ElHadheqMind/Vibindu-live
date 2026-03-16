"""
Simulation agent for sequential SFC testing and logic validation.
Ensures safety compliance and provides detailed issue feedback.
"""

import asyncio
import logging
import json
import os
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Set, Tuple
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)


# ============================================================================
# Enums and Data Classes
# ============================================================================

class IssueType(Enum):
    """Types of validation issues."""
    MISSING_ESTOP = "missing_estop"
    UNREACHABLE_STEP = "unreachable_step"
    DEAD_END_TRANSITION = "dead_end_transition"
    INVALID_CONDITION = "invalid_condition"
    MISSING_RETURN_PATH = "missing_return_path"
    UNDEFINED_VARIABLE = "undefined_variable"
    UNDEFINED_ACTION = "undefined_action"
    INCORRECT_SEQUENCING = "incorrect_sequencing"
    SAFETY_VIOLATION = "safety_violation"


class IssueSeverity(Enum):
    """Severity levels for issues."""
    ERROR = "error"      # Must fix - blocks deployment
    WARNING = "warning"  # Should fix - potential runtime issue
    INFO = "info"        # Suggestion - best practice


@dataclass
class ValidationIssue:
    """A single validation issue found in SFC analysis."""
    issue_type: IssueType
    severity: IssueSeverity
    message: str
    element_id: Optional[str] = None  # ID of the problematic element
    element_name: Optional[str] = None
    suggested_fix: Optional[str] = None  # DSL snippet to fix the issue
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.issue_type.value,
            "severity": self.severity.value,
            "message": self.message,
            "elementId": self.element_id,
            "elementName": self.element_name,
            "suggestedFix": self.suggested_fix
        }


@dataclass
class SimulationTrace:
    """Trace of a simulation step execution."""
    step_number: int
    active_steps: List[str]
    fired_transitions: List[str]
    active_actions: List[str]
    variables_state: Dict[str, Any]
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "stepNumber": self.step_number,
            "activeSteps": self.active_steps,
            "firedTransitions": self.fired_transitions,
            "activeActions": self.active_actions,
            "variablesState": self.variables_state,
            "timestamp": self.timestamp
        }


@dataclass
class SFCTestResult:
    """Result of testing a single mode's SFC."""
    mode_id: str
    mode_name: str
    status: str  # "PASS" or "FAIL"
    issues: List[ValidationIssue] = field(default_factory=list)
    simulation_trace: List[SimulationTrace] = field(default_factory=list)
    execution_time_ms: float = 0.0
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    
    @property
    def passed(self) -> bool:
        return self.status == "PASS"
    
    @property
    def error_count(self) -> int:
        return sum(1 for i in self.issues if i.severity == IssueSeverity.ERROR)
    
    @property
    def warning_count(self) -> int:
        return sum(1 for i in self.issues if i.severity == IssueSeverity.WARNING)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "modeId": self.mode_id,
            "modeName": self.mode_name,
            "status": self.status,
            "issues": [i.to_dict() for i in self.issues],
            "simulationTrace": [t.to_dict() for t in self.simulation_trace],
            "executionTimeMs": self.execution_time_ms,
            "errorCount": self.error_count,
            "warningCount": self.warning_count,
            "timestamp": self.timestamp
        }


@dataclass
class SimulationAgentResult:
    """Overall result of the simulation agent validation."""
    total_modes: int
    passed: int
    failed: int
    results: List[SFCTestResult] = field(default_factory=list)
    
    def summary(self) -> str:
        return f"Simulation Complete: {self.passed}/{self.total_modes} modes passed"
    
    @property
    def all_passed(self) -> bool:
        return self.passed == self.total_modes
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "totalModes": self.total_modes,
            "passed": self.passed,
            "failed": self.failed,
            "allPassed": self.all_passed,
            "summary": self.summary(),
            "results": [r.to_dict() for r in self.results]
        }


# ============================================================================
# SFC Analyzer - Static Analysis of SFC Structure
# ============================================================================

class SFCAnalyzer:
    """
    Analyzes SFC JSON structure for logic issues without running full simulation.
    Performs static analysis to detect:
    - Unreachable steps
    - Dead-end transitions
    - Missing E-Stop conditions
    - Invalid transition conditions
    - Missing return paths to initial state
    """

    def __init__(self, available_variables: List[str], available_actions: List[str]):
        """
        Initialize analyzer with available IO context.

        Args:
            available_variables: List of variable names from SpecAnalyst
            available_actions: List of action names from SpecAnalyst
        """
        self.available_variables = set(available_variables)
        self.available_actions = set(available_actions)

    def analyze(self, sfc_json: Dict[str, Any], mode_id: str) -> List[ValidationIssue]:
        """
        Perform static analysis on SFC JSON structure.

        Args:
            sfc_json: Parsed SFC JSON from compiled file
            mode_id: The mode being analyzed (e.g., "A1", "D1")

        Returns:
            List of ValidationIssue objects
        """
        issues: List[ValidationIssue] = []
        elements = sfc_json.get("elements", [])

        # Build element maps
        steps = [e for e in elements if e.get("type") == "step"]
        transitions = [e for e in elements if e.get("type") == "transition"]
        connections = [e for e in elements if e.get("type") == "connection"]

        # Create connection graph
        connections_from: Dict[str, List[str]] = {}  # source -> [targets]
        connections_to: Dict[str, List[str]] = {}    # target -> [sources]

        for conn in connections:
            src = conn.get("sourceId", "")
            tgt = conn.get("targetId", "")
            if src:
                connections_from.setdefault(src, []).append(tgt)
            if tgt:
                connections_to.setdefault(tgt, []).append(src)

        # 1. Check for initial step
        initial_steps = [s for s in steps if s.get("isInitial", False)]
        if not initial_steps:
            issues.append(ValidationIssue(
                issue_type=IssueType.INCORRECT_SEQUENCING,
                severity=IssueSeverity.ERROR,
                message="No initial step found. SFC must have at least one initial step.",
                suggested_fix="Add 'initial' keyword to the first step: STEP S0 initial \"Start\""
            ))

        # 2. Check for unreachable steps (not reachable from initial)
        reachable = self._find_reachable_steps(initial_steps, connections_from, steps, transitions)
        for step in steps:
            step_id = step.get("id", "")
            step_name = step.get("label", step_id)
            if step_id not in reachable and not step.get("isInitial", False):
                issues.append(ValidationIssue(
                    issue_type=IssueType.UNREACHABLE_STEP,
                    severity=IssueSeverity.ERROR,
                    message=f"Step '{step_name}' is unreachable from initial state.",
                    element_id=step_id,
                    element_name=step_name,
                    suggested_fix=f"Add a transition path from an active step to '{step_name}'"
                ))

        # 3. Check for dead-end steps (no outgoing transitions)
        issues.extend(self._check_dead_ends(steps, transitions, connections_from, connections_to))

        # 4. Check for E-Stop condition (especially important for D1 mode)
        if mode_id == "D1":
            issues.extend(self._check_estop_handling(transitions, steps))

        # 5. Check for undefined variables in conditions
        issues.extend(self._check_undefined_variables(transitions))

        # 6. Check for undefined actions in steps
        issues.extend(self._check_undefined_actions(steps))

        # 7. Check for return path to initial (GEMMA loop requirement)
        if initial_steps:
            has_return = self._check_return_path(initial_steps[0], steps, connections_to)
            if not has_return:
                issues.append(ValidationIssue(
                    issue_type=IssueType.MISSING_RETURN_PATH,
                    severity=IssueSeverity.WARNING,
                    message="No return path to initial step. GEMMA modes should form a closed loop.",
                    suggested_fix="Add a transition from the final step back to the initial step"
                ))

        return issues

    def _find_reachable_steps(
        self,
        initial_steps: List[Dict],
        connections_from: Dict[str, List[str]],
        steps: List[Dict],
        transitions: List[Dict]
    ) -> Set[str]:
        """BFS to find all steps reachable from initial steps."""
        reachable: Set[str] = set()
        step_ids = {s.get("id") for s in steps}
        transition_ids = {t.get("id") for t in transitions}

        queue = [s.get("id") for s in initial_steps]
        visited: Set[str] = set()

        while queue:
            current = queue.pop(0)
            if current in visited:
                continue
            visited.add(current)

            if current in step_ids:
                reachable.add(current)

            # Follow connections
            for target in connections_from.get(current, []):
                if target not in visited:
                    queue.append(target)

        return reachable

    def _check_dead_ends(
        self,
        steps: List[Dict],
        transitions: List[Dict],
        connections_from: Dict[str, List[str]],
        connections_to: Dict[str, List[str]]
    ) -> List[ValidationIssue]:
        """Check for steps with no outgoing transitions (dead ends)."""
        issues = []
        transition_ids = {t.get("id") for t in transitions}

        for step in steps:
            step_id = step.get("id", "")
            step_name = step.get("label", step_id)

            # Get outgoing connections from this step
            outgoing = connections_from.get(step_id, [])

            # Check if any outgoing connection leads to a transition
            has_outgoing_transition = any(t in transition_ids for t in outgoing)

            if not has_outgoing_transition:
                # Check if this is a "final" step type (acceptable dead end)
                step_type = step.get("stepType", "")
                if step_type not in ["final", "enclosing"]:
                    issues.append(ValidationIssue(
                        issue_type=IssueType.DEAD_END_TRANSITION,
                        severity=IssueSeverity.WARNING,
                        message=f"Step '{step_name}' has no outgoing transitions (dead end).",
                        element_id=step_id,
                        element_name=step_name,
                        suggested_fix=f"Add a transition after step '{step_name}' to continue the sequence"
                    ))

        return issues

    def _check_estop_handling(
        self,
        transitions: List[Dict],
        steps: List[Dict]
    ) -> List[ValidationIssue]:
        """Check for E-Stop condition handling in D1 (Emergency) mode."""
        issues = []

        # Look for E-Stop related conditions
        estop_keywords = ["estop", "e_stop", "emergency", "stop", "arret", "urgence"]
        has_estop = False

        for trans in transitions:
            condition = str(trans.get("condition", "")).lower()
            if any(kw in condition for kw in estop_keywords):
                has_estop = True
                break

        if not has_estop:
            issues.append(ValidationIssue(
                issue_type=IssueType.MISSING_ESTOP,
                severity=IssueSeverity.ERROR,
                message="D1 (Emergency) mode must have E-Stop condition handling.",
                suggested_fix="Add E-Stop variable check: TRANSITION T0 \"EStop OR Emergency\""
            ))

        return issues

    def _check_undefined_variables(self, transitions: List[Dict]) -> List[ValidationIssue]:
        """Check for variables used in conditions that are not defined."""
        issues = []

        for trans in transitions:
            condition = trans.get("condition", "")
            if not condition:
                continue

            # Extract variable names from condition (simple parsing)
            import re
            tokens = re.findall(r'[A-Za-z_][A-Za-z0-9_]*', condition)

            # Filter out keywords and operators
            keywords = {"AND", "OR", "NOT", "TRUE", "FALSE", "true", "false", "T", "X"}

            for token in tokens:
                if token.upper() not in keywords and token not in self.available_variables:
                    # Check if it's a timer reference (T.T0, etc.)
                    if not token.startswith("T") or len(token) < 2:
                        issues.append(ValidationIssue(
                            issue_type=IssueType.UNDEFINED_VARIABLE,
                            severity=IssueSeverity.WARNING,
                            message=f"Variable '{token}' in condition is not defined.",
                            element_id=trans.get("id"),
                            element_name=trans.get("label", trans.get("id")),
                            suggested_fix=f"Define variable '{token}' in project IO"
                        ))

        return issues

    def _check_undefined_actions(self, steps: List[Dict]) -> List[ValidationIssue]:
        """Check for actions used in steps that are not defined."""
        issues = []

        for step in steps:
            actions = step.get("actions", [])
            step_id = step.get("id", "")
            step_name = step.get("label", step_id)

            for action in actions:
                action_var = action.get("variable", "")
                if action_var and action_var not in self.available_actions:
                    issues.append(ValidationIssue(
                        issue_type=IssueType.UNDEFINED_ACTION,
                        severity=IssueSeverity.WARNING,
                        message=f"Action '{action_var}' in step '{step_name}' is not defined.",
                        element_id=step_id,
                        element_name=step_name,
                        suggested_fix=f"Define action '{action_var}' in project IO"
                    ))

        return issues

    def _check_return_path(
        self,
        initial_step: Dict,
        steps: List[Dict],
        connections_to: Dict[str, List[str]]
    ) -> bool:
        """Check if there's a path back to the initial step."""
        initial_id = initial_step.get("id", "")
        incoming = connections_to.get(initial_id, [])
        return len(incoming) > 0


# ============================================================================
# Simulation Agent Loop - Sequential Mode Testing
# ============================================================================

class SimulationAgentLoop:
    """
    Main loop for sequential SFC testing and validation.
    Tests each mode's SFC file individually before testing complete system.
    """

    def __init__(
        self,
        project_path: str,
        io_context: Dict[str, Any],
        gsrsm_context: Dict[str, Any],
        api_base: str = None
    ):
        """
        Initialize the simulation agent loop.

        Args:
            project_path: Path to the project root
            io_context: Variables and actions from SpecAnalyst
            gsrsm_context: Modes and transitions from GsrsmEngineer
            api_base: Base URL for simulation API
        """
        self.project_path = project_path
        self.io_context = io_context
        self.gsrsm_context = gsrsm_context
        self.api_base = api_base or os.getenv("BACKEND_URL", "http://backend:3001" if os.getenv("IS_DOCKER", "false").lower() == "true" else "http://localhost:3001") + "/api/simulation"

        # Extract available variables and actions
        self.available_variables = self._extract_variable_names()
        self.available_actions = self._extract_action_names()

        # Create analyzer
        self.analyzer = SFCAnalyzer(self.available_variables, self.available_actions)

    def _extract_variable_names(self) -> List[str]:
        """Extract variable names from IO context."""
        variables = self.io_context.get("variables", [])
        return [v.get("name", "") for v in variables if v.get("name")]

    def _extract_action_names(self) -> List[str]:
        """Extract action names from IO context."""
        actions = self.io_context.get("actions", [])
        return [a.get("name", "") for a in actions if a.get("name")]

    def _get_modes_to_test(self) -> List[Dict[str, Any]]:
        """Get list of modes to test from GSRSM context."""
        modes = self.gsrsm_context.get("modes", [])
        # Only test activated modes
        return [m for m in modes if m.get("isActivated", False)]

    def _load_sfc_file(self, mode_id: str) -> Optional[Dict[str, Any]]:
        """
        Load SFC JSON file for a mode.

        Args:
            mode_id: The mode ID (e.g., "A1", "F1")

        Returns:
            Parsed SFC JSON or None if file not found
        """
        file_path = os.path.join(
            self.project_path, "modes", mode_id, "default.sfc"
        )

        # Resolve against STORAGE_PATH for Docker
        storage_path = os.getenv("STORAGE_PATH", "")
        if storage_path:
            file_path = os.path.join(storage_path, file_path)

        try:
            if os.path.exists(file_path):
                with open(file_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            else:
                logger.warning(f"[SimulationAgent] SFC file not found: {file_path}")
                return None
        except Exception as e:
            logger.error(f"[SimulationAgent] Error loading SFC file: {e}")
            return None

    async def run(self) -> SimulationAgentResult:
        """
        Run sequential testing on all modes.

        Returns:
            SimulationAgentResult with all test results
        """
        modes = self._get_modes_to_test()
        results: List[SFCTestResult] = []

        logger.info(f"[SimulationAgent] Starting validation of {len(modes)} modes")

        for mode in modes:
            mode_id = mode.get("id", "")
            mode_name = mode.get("name", mode_id)

            logger.info(f"[SimulationAgent] Testing mode: {mode_id} ({mode_name})")

            result = await self._test_single_mode(mode_id, mode_name, mode)
            results.append(result)

            if result.passed:
                logger.info(f"[SimulationAgent] ✓ Mode {mode_id} PASSED")
            else:
                logger.warning(
                    f"[SimulationAgent] ✗ Mode {mode_id} FAILED "
                    f"({result.error_count} errors, {result.warning_count} warnings)"
                )

        # Calculate summary
        passed = sum(1 for r in results if r.passed)
        failed = len(results) - passed

        return SimulationAgentResult(
            total_modes=len(modes),
            passed=passed,
            failed=failed,
            results=results
        )

    async def _test_single_mode(
        self,
        mode_id: str,
        mode_name: str,
        mode_context: Dict[str, Any]
    ) -> SFCTestResult:
        """
        Test a single mode's SFC file.

        Args:
            mode_id: The mode ID
            mode_name: The mode name
            mode_context: Full mode context from GSRSM

        Returns:
            SFCTestResult with issues and simulation trace
        """
        start_time = datetime.now()
        issues: List[ValidationIssue] = []
        traces: List[SimulationTrace] = []

        # 1. Load SFC file
        sfc_json = self._load_sfc_file(mode_id)

        if sfc_json is None:
            issues.append(ValidationIssue(
                issue_type=IssueType.INCORRECT_SEQUENCING,
                severity=IssueSeverity.ERROR,
                message=f"SFC file not found for mode {mode_id}",
                suggested_fix="Run SFC Programmer to generate the mode's SFC file"
            ))
            return SFCTestResult(
                mode_id=mode_id,
                mode_name=mode_name,
                status="FAIL",
                issues=issues,
                execution_time_ms=(datetime.now() - start_time).total_seconds() * 1000
            )

        # 2. Run static analysis
        static_issues = self.analyzer.analyze(sfc_json, mode_id)
        issues.extend(static_issues)

        # 3. Run simulation scenarios
        sim_issues, sim_traces = await self._run_simulation_scenarios(
            mode_id, mode_name, sfc_json, mode_context
        )
        issues.extend(sim_issues)
        traces.extend(sim_traces)

        # 4. Determine pass/fail status
        has_errors = any(i.severity == IssueSeverity.ERROR for i in issues)
        status = "FAIL" if has_errors else "PASS"

        execution_time = (datetime.now() - start_time).total_seconds() * 1000

        return SFCTestResult(
            mode_id=mode_id,
            mode_name=mode_name,
            status=status,
            issues=issues,
            simulation_trace=traces,
            execution_time_ms=execution_time
        )

    async def _run_simulation_scenarios(
        self,
        mode_id: str,
        mode_name: str,
        sfc_json: Dict[str, Any],
        mode_context: Dict[str, Any]
    ) -> Tuple[List[ValidationIssue], List[SimulationTrace]]:
        """
        Run simulation scenarios for a mode.

        Args:
            mode_id: The mode ID
            mode_name: The mode name
            sfc_json: Parsed SFC JSON
            mode_context: Mode context with entry/exit conditions

        Returns:
            Tuple of (issues found, simulation traces)
        """
        issues: List[ValidationIssue] = []
        traces: List[SimulationTrace] = []

        try:
            import aiohttp
            headers = {"x-agent-secret": "antigravity-local-agent"}

            # Build test scenarios based on mode type
            scenarios = self._build_mode_scenarios(mode_id, mode_context)

            if not scenarios:
                logger.info(f"[SimulationAgent] No scenarios defined for {mode_id}, using default")
                scenarios = [{"name": "Default", "variables": {}, "transitions": {}}]

            async with aiohttp.ClientSession(headers=headers) as session:
                # Initialize simulation state
                elements = sfc_json.get("elements", [])
                initial_steps = [
                    e.get("id") for e in elements
                    if e.get("type") == "step" and e.get("isInitial", False)
                ]

                if not initial_steps:
                    issues.append(ValidationIssue(
                        issue_type=IssueType.INCORRECT_SEQUENCING,
                        severity=IssueSeverity.ERROR,
                        message="Cannot simulate: no initial step found"
                    ))
                    return issues, traces

                state = {
                    "activeSteps": initial_steps,
                    "variables": {},
                    "stepActivationTimes": {}
                }

                # Record initial state
                traces.append(SimulationTrace(
                    step_number=0,
                    active_steps=initial_steps,
                    fired_transitions=[],
                    active_actions=[],
                    variables_state={}
                ))

                # Run each scenario step
                for i, scenario in enumerate(scenarios):
                    inputs = {
                        "transitions": scenario.get("transitions", {}),
                        "variables": scenario.get("variables", {})
                    }

                    # Call simulation step API
                    payload = {
                        "diagram": sfc_json,
                        "state": state,
                        "inputs": inputs
                    }

                    try:
                        async with session.post(
                            f"{self.api_base}/step",
                            json=payload
                        ) as response:
                            if response.status == 200:
                                data = await response.json()

                                if data.get("success"):
                                    new_state = data.get("state", {})
                                    actions = data.get("actions", [])

                                    # Update state
                                    state = new_state

                                    # Record trace
                                    traces.append(SimulationTrace(
                                        step_number=i + 1,
                                        active_steps=new_state.get("activeSteps", []),
                                        fired_transitions=[],
                                        active_actions=[a.get("variable", "") for a in actions],
                                        variables_state=new_state.get("variables", {})
                                    ))
                            else:
                                logger.warning(
                                    f"[SimulationAgent] Step API failed: {await response.text()}"
                                )
                    except Exception as e:
                        logger.error(f"[SimulationAgent] Simulation step error: {e}")

                # Check if simulation reached a valid end state
                if len(traces) > 1:
                    final_trace = traces[-1]
                    if not final_trace.active_steps:
                        issues.append(ValidationIssue(
                            issue_type=IssueType.DEAD_END_TRANSITION,
                            severity=IssueSeverity.WARNING,
                            message="Simulation ended with no active steps",
                            suggested_fix="Check transition conditions allow progression"
                        ))

        except ImportError:
            logger.warning("[SimulationAgent] aiohttp not available, skipping simulation")
        except Exception as e:
            logger.error(f"[SimulationAgent] Simulation error: {e}")
            issues.append(ValidationIssue(
                issue_type=IssueType.SAFETY_VIOLATION,
                severity=IssueSeverity.WARNING,
                message=f"Simulation failed: {str(e)}"
            ))

        return issues, traces

    def _build_mode_scenarios(
        self,
        mode_id: str,
        mode_context: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Build test scenarios based on mode type.

        Args:
            mode_id: The mode ID (A1, F1, D1, etc.)
            mode_context: Mode context with entry/exit conditions

        Returns:
            List of scenario dictionaries
        """
        scenarios = []
        category = mode_id[0] if mode_id else "A"

        if category == "A":
            # Production modes - test normal progression
            scenarios = [
                {"name": "Start", "variables": {}, "transitions": {}},
                {"name": "Process", "variables": {"Start": True}, "transitions": {}},
                {"name": "Complete", "variables": {"Start": False}, "transitions": {}}
            ]
        elif category == "D":
            # Stop/Emergency modes - test E-Stop handling
            scenarios = [
                {"name": "Emergency Triggered", "variables": {"EStop": True}, "transitions": {}},
                {"name": "Emergency Handling", "variables": {"EStop": True}, "transitions": {}},
                {"name": "Emergency Clear", "variables": {"EStop": False}, "transitions": {}}
            ]
        elif category == "F":
            # Failure modes - test failure handling
            scenarios = [
                {"name": "Failure Detected", "variables": {"Fault": True}, "transitions": {}},
                {"name": "Failure Response", "variables": {"Fault": True}, "transitions": {}},
                {"name": "Failure Clear", "variables": {"Fault": False}, "transitions": {}}
            ]
        else:
            # Default scenarios
            scenarios = [
                {"name": "Step 1", "variables": {}, "transitions": {}},
                {"name": "Step 2", "variables": {}, "transitions": {}},
                {"name": "Step 3", "variables": {}, "transitions": {}}
            ]

        return scenarios


# ============================================================================
# Feedback Generator - Actionable Corrections
# ============================================================================

class FeedbackGenerator:
    """
    Generates actionable feedback for SFC corrections based on validation issues.
    """

    @staticmethod
    def generate_feedback(result: SFCTestResult) -> str:
        """
        Generate human-readable feedback for a test result.

        Args:
            result: SFCTestResult to generate feedback for

        Returns:
            Formatted feedback string
        """
        if result.passed:
            return f"✓ Mode {result.mode_id} ({result.mode_name}) passed validation."

        lines = [
            f"✗ Mode {result.mode_id} ({result.mode_name}) FAILED validation:",
            f"  Errors: {result.error_count}, Warnings: {result.warning_count}",
            ""
        ]

        # Group issues by type
        for issue in result.issues:
            severity_icon = "❌" if issue.severity == IssueSeverity.ERROR else "⚠️"
            lines.append(f"  {severity_icon} [{issue.issue_type.value}] {issue.message}")

            if issue.element_name:
                lines.append(f"     Element: {issue.element_name}")

            if issue.suggested_fix:
                lines.append(f"     Fix: {issue.suggested_fix}")

            lines.append("")

        return "\n".join(lines)

    @staticmethod
    def generate_dsl_corrections(result: SFCTestResult) -> List[str]:
        """
        Generate DSL code snippets for corrections.

        Args:
            result: SFCTestResult with issues

        Returns:
            List of DSL correction snippets
        """
        corrections = []

        for issue in result.issues:
            if issue.suggested_fix and issue.severity == IssueSeverity.ERROR:
                corrections.append(f"// Fix for: {issue.message}")
                corrections.append(issue.suggested_fix)
                corrections.append("")

        return corrections


# ============================================================================
# Main Entry Point
# ============================================================================

async def run_simulation_validation(
    project_path: str,
    gsrsm_data: Dict[str, Any],
    io_data: Dict[str, Any]
) -> SimulationAgentResult:
    """
    Main entry point for the Simulation Agent.

    This function runs after the SFCProgrammer Loop completes.
    It validates all generated SFC files for correctness and safety.

    Args:
        project_path: Path to the project root
        gsrsm_data: Output from GsrsmEngineer (modes and transitions)
        io_data: Output from SpecAnalyst (variables and actions)

    Returns:
        SimulationAgentResult with all validation results
    """
    logger.info(f"[SimulationAgent] Starting validation for project: {project_path}")

    # Create and run the simulation loop
    loop = SimulationAgentLoop(
        project_path=project_path,
        io_context=io_data,
        gsrsm_context=gsrsm_data
    )

    result = await loop.run()

    # Generate feedback for each failed mode
    for test_result in result.results:
        if not test_result.passed:
            feedback = FeedbackGenerator.generate_feedback(test_result)
            logger.info(f"\n{feedback}")

    # Log summary
    if result.all_passed:
        logger.info(f"[SimulationAgent] ✓ All {result.total_modes} modes passed validation!")
    else:
        logger.warning(
            f"[SimulationAgent] ✗ Validation complete: "
            f"{result.passed}/{result.total_modes} passed, {result.failed} failed"
        )

    return result


def get_validation_summary(result: SimulationAgentResult) -> str:
    """
    Get a formatted summary of validation results.

    Args:
        result: SimulationAgentResult to summarize

    Returns:
        Formatted summary string
    """
    lines = [
        "=" * 60,
        "SIMULATION VALIDATION SUMMARY",
        "=" * 60,
        f"Total Modes Tested: {result.total_modes}",
        f"Passed: {result.passed}",
        f"Failed: {result.failed}",
        ""
    ]

    for test_result in result.results:
        status_icon = "✓" if test_result.passed else "✗"
        lines.append(
            f"  {status_icon} {test_result.mode_id}: {test_result.status} "
            f"({test_result.error_count}E/{test_result.warning_count}W)"
        )

    lines.append("")
    lines.append("=" * 60)

    return "\n".join(lines)
