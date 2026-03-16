
// Mirrored from frontend constants
export const DEFAULT_STEP_SIZE = { width: 40, height: 40 };
export const DEFAULT_TRANSITION_SIZE = { width: 40, height: 6 };
export const DEFAULT_ACTION_BLOCK_SIZE = { width: 120, height: 40 };
export const DEFAULT_GATE_SIZE = { width: 40, height: 8 };

export const GUIDED_STEP_SPACING_VERTICAL = 140;
export const GUIDED_STEP_SPACING_HORIZONTAL = 200;
export const GUIDED_DIVERGENCE_SPACING = 800;

// Offsets for "Guided Mode" look
// Standard Normal Step -> Transition (140px total vertical spacing: 40 + 47 + 6 + 47 = 140)
export const OFFSET_STEP_TO_TRANS_STANDARD = 47;

// Compressed Step -> Transition (used before AND Divergence)
// Matches Guided Mode Simple Divergence: Step -> 25px -> Transition
export const OFFSET_STEP_TO_TRANS_COMPRESSED = 25;
// Alias for clarity
export const OFFSET_STEP_TO_TRANSITION_AND = 25;

// Transition -> Next Step (Standard vertical flow)
export const OFFSET_TRANS_TO_NEXT_STEP = 47;

// Transition -> Divergence Gate
// Matches Guided Mode: Transition -> 15px -> Gate
export const OFFSET_TRANSITION_TO_GATE = 15;
// Alias for consistency
export const OFFSET_TRANS_TO_GATE_AND = 15;

// OR Divergence Spacing
export const OFFSET_TRANS_TO_GATE_OR = 20;

// Divergence-aware spacing: when divergence is between step and transition
// Gate goes in the middle
export const OFFSET_STEP_TO_DIVERGENCE_GATE = 86; // 40 (Step) + 25 (Gap) + 6 (Trans) + 15 (Gap) = 86
export const OFFSET_DIVERGENCE_DOUBLED = 174; // Unchanged for now, rarely used?

// Gate -> Branch Steps
// Gate Bottom (94) to Next Step (140) = 46px map
export const GATE_TO_STEP_SPACING = 46;
