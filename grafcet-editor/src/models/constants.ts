// Default sizes for elements
export const DEFAULT_STEP_SIZE = { width: 40, height: 40 }; // Reduced from 60x60
export const DEFAULT_TRANSITION_SIZE = { width: 40, height: 6 }; // Increased from 30 for better label spacing
export const DEFAULT_ACTION_BLOCK_SIZE = { width: 120, height: 40 }; // Increased from 80 to prevent text wrapping
export const DEFAULT_GATE_SIZE = { width: 40, height: 8 }; // Reduced from 60x10

// Spacing between elements in guided mode
export const GUIDED_STEP_SPACING_VERTICAL = 140; // Normal vertical spacing
export const GUIDED_STEP_SPACING_HORIZONTAL = 400; // Updated to 400
export const GUIDED_DIVERGENCE_SPACING = 400; // Updated to 400

// Divergence-aware spacing: when divergence is between step and transition
// Double the distance and place divergence gate in the middle
export const OFFSET_STEP_TO_DIVERGENCE_GATE = 87; // Gate goes in the middle
export const OFFSET_DIVERGENCE_DOUBLED = 174; // 2 × standard step-to-transition offset

// Number of divergence branches
export const GUIDED_DIVERGENCE_BRANCHES = 6; // Increased to support more branches in divergence

// GSRSM (Guide for the Study of Run and Stop Modes) specific constants
export const Gsrsm_BASE_UNIT_H = 50; // Base unit H for GSRSM dimensions (reduced from 60)
export const Gsrsm_MODE_SIZE = { width: 120, height: 70 }; // Default size for GSRSM mode boxes (reduced)
// Specific sizes for A modes based on H unit
export const Gsrsm_A1_SIZE = { width: 3 * Gsrsm_BASE_UNIT_H, height: Gsrsm_BASE_UNIT_H }; // A1: 3H×H with double-line
export const Gsrsm_A6_SIZE = { width: 3 * Gsrsm_BASE_UNIT_H, height: Gsrsm_BASE_UNIT_H }; // A6: 3H×H
export const Gsrsm_A7_SIZE = { width: 2.5 * Gsrsm_BASE_UNIT_H, height: Gsrsm_BASE_UNIT_H }; // A7: width = 2.5 × height (increased width)
export const Gsrsm_A4_SIZE = { width: 2 * Gsrsm_BASE_UNIT_H, height: Gsrsm_BASE_UNIT_H }; // A4: 2H×H
export const Gsrsm_A5_SIZE = { width: 3 * Gsrsm_BASE_UNIT_H, height: 2 * Gsrsm_BASE_UNIT_H }; // A5: doubled size (3H×2H)
export const Gsrsm_A2_SIZE = { width: 1.5 * Gsrsm_BASE_UNIT_H, height: 2 * Gsrsm_BASE_UNIT_H }; // A2: 1.5H×2H (tripled width, same height as A5)
export const Gsrsm_A3_SIZE = { width: 1.2 * Gsrsm_BASE_UNIT_H, height: 1.5 * Gsrsm_BASE_UNIT_H }; // A3: 1.2H×1.5H (increased width, height between H and A2's height)

// Specific sizes for D modes based on H unit
export const Gsrsm_D1_SIZE = { width: 3.5 * Gsrsm_BASE_UNIT_H, height: Gsrsm_BASE_UNIT_H }; // D1: 3.5H×H (extended width to span from A5/A6 to D3)
export const Gsrsm_D2_SIZE = { width: 2.1 * Gsrsm_BASE_UNIT_H, height: 1.4 * Gsrsm_BASE_UNIT_H }; // D2: width reduced to 2.1H, height 1.4H
export const Gsrsm_D3_SIZE = { width: 2.7 * Gsrsm_BASE_UNIT_H, height: 1.4 * Gsrsm_BASE_UNIT_H }; // D3: width reduced to 2.7H (from 3.0H), same height as D2

// Specific sizes for F modes based on H unit
export const Gsrsm_F1_SIZE = { width: 4.32 * Gsrsm_BASE_UNIT_H, height: 3.42 * Gsrsm_BASE_UNIT_H }; // F1: reduced by 10% (4.8*0.9=4.32, 3.8*0.9=3.42)
export const Gsrsm_F2_SIZE = { width: 1.4 * Gsrsm_BASE_UNIT_H, height: 1.8 * Gsrsm_BASE_UNIT_H }; // F2: reduced from 1.6H to 1.4H
export const Gsrsm_F3_SIZE = { width: 1.4 * Gsrsm_BASE_UNIT_H, height: 1.8 * Gsrsm_BASE_UNIT_H }; // F3: reduced from 1.6H to 1.4H
export const Gsrsm_F4_SIZE = { width: 1.8 * Gsrsm_BASE_UNIT_H, height: 1.6 * Gsrsm_BASE_UNIT_H }; // F4: height slightly increased (1.4 to 1.6)
export const Gsrsm_F5_SIZE = { width: 1.8 * Gsrsm_BASE_UNIT_H, height: 4.2 * Gsrsm_BASE_UNIT_H }; // F5: unchanged
export const Gsrsm_F6_SIZE = { width: 1.8 * Gsrsm_BASE_UNIT_H, height: 3.0 * Gsrsm_BASE_UNIT_H }; // F6: height slightly increased (2.6 to 3.0)

export const Gsrsm_HEADER_HEIGHT = 30; // Height of the GSRSM section headers
export const Gsrsm_SECTION_PADDING = 12; // Padding inside GSRSM sections (reduced from 15)
export const Gsrsm_SECTION_MARGIN = 8; // Margin between GSRSM sections (reduced from 10)
export const Gsrsm_CANVAS_PADDING = 35; // Padding around the entire GSRSM canvas (reduced from 40)
export const Gsrsm_CONNECTION_OFFSET = 10; // Offset for connection points
export const Gsrsm_SECTION_TITLE_FONT_SIZE = 11; // Font size for section titles (reduced from 12)
export const Gsrsm_MODE_TITLE_FONT_SIZE = 9; // Font size for mode titles (reduced from 10)
export const Gsrsm_MODE_CODE_FONT_SIZE = 10; // Font size for mode codes (reduced from 11)
export const Gsrsm_CONDITION_FONT_SIZE = 8; // Font size for connection conditions (reduced from 9)
export const Gsrsm_HEADER_CIRCLE_RADIUS = 10; // Radius for the circle in section headers
export const Gsrsm_TITLE_FONT_SIZE = 20; // Font size for GSRSM title
export const Gsrsm_SUBTITLE_FONT_SIZE = 12; // Font size for GSRSM subtitle
export const Gsrsm_PRODUCTION_DASH = [10, 5]; // Dash pattern for production area
export const Gsrsm_VERTICAL_SPACING = 16; // Vertical spacing between tiers (reduced from 20)

// Fixed canvas dimensions for GSRSM diagram to ensure consistent layout regardless of browser zoom
export const Gsrsm_FIXED_CANVAS_WIDTH = 1400; // Fixed width for GSRSM canvas (significantly increased from right)
export const Gsrsm_FIXED_CANVAS_HEIGHT = 692; // Fixed height for GSRSM canvas (reduced for A section 5% decrease)
