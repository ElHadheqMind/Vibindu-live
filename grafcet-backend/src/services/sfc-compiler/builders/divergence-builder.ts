
import { v4 as uuidv4 } from 'uuid';
import { DivergenceInput, ElementInput } from '../schemas.js';
import {
    DEFAULT_GATE_SIZE,
    DEFAULT_STEP_SIZE,
    GUIDED_DIVERGENCE_SPACING,
    OFFSET_TRANSITION_TO_GATE,
    GATE_TO_STEP_SPACING,
    OFFSET_TRANS_TO_GATE_OR,
    OFFSET_STEP_TO_TRANS_STANDARD,
    OFFSET_TRANS_TO_NEXT_STEP
} from '../core/constants.js';
import { CompilerContext } from './step-builder.js';
import { processSequence } from '../core/compiler.js';

type ProcessSequenceFn = typeof processSequence;

export function handleDivergence(
    ctx: CompilerContext,
    divergenceData: DivergenceInput,
    x: number,
    y: number,
    prevElementId: string,
    processSequence: ProcessSequenceFn
): { convergenceGateId: string, nextY: number, lastElementId: string, firstElementId: string } {

    const isAnd = divergenceData.divergenceType === 'AND';
    const branchCount = divergenceData.branches.length;

    let currentY = y;
    let sourceIdForGate = prevElementId;

    // Check if previous element is a step to determine context
    const prevElement = ctx.elements.find(e => e.id === prevElementId);
    const isStep = prevElement && prevElement.type === 'step';

    // Calculate Gate Y Position
    // The 'y' passed in includes the default spacing from the previous element's builder.
    // We need to back-calculate to remove that default spacing and apply the specific divergence spacing.

    let gateY = currentY;

    if (isAnd) {
        // AND Divergence: Transition -> Gate
        // Previous builder (Transition) added OFFSET_TRANS_TO_NEXT_STEP (47)
        // We want OFFSET_TRANSITION_TO_GATE (15)
        const correction = OFFSET_TRANSITION_TO_GATE - OFFSET_TRANS_TO_NEXT_STEP;
        gateY = currentY + correction;
    } else {
        // OR Divergence: Step -> Gate (Virtual/Small Bar)
        // Previous builder (Step) added OFFSET_STEP_TO_TRANS_STANDARD (47)
        // We want OFFSET_TRANS_TO_GATE_OR (20)
        const correction = OFFSET_TRANS_TO_GATE_OR - OFFSET_STEP_TO_TRANS_STANDARD;
        gateY = currentY + correction;
    }

    // Calculate branch X positions first to determine gate width dynamically
    const totalBranchWidth = (branchCount - 1) * GUIDED_DIVERGENCE_SPACING;
    const startBranchX = x - (totalBranchWidth / 2);

    // Calculate gate width based on actual branch spread
    const branchXPositions = Array.from({ length: branchCount }, (_, i) =>
        startBranchX + (i * GUIDED_DIVERGENCE_SPACING) + DEFAULT_STEP_SIZE.width / 2
    );
    const minTipX = Math.min(...branchXPositions);
    const maxTipX = Math.max(...branchXPositions);
    // Center alignment based on Step Width (assumed constant)
    const centerX = x + DEFAULT_STEP_SIZE.width / 2;

    const margin = 20;
    const gateLeft = Math.min(centerX, minTipX) - margin;
    const gateRight = Math.max(centerX, maxTipX) + margin;
    const gateWidth = gateRight - gateLeft;

    // 1. Add Divergence Gate
    const divergenceGateId = uuidv4();

    const divergenceGate = {
        id: divergenceGateId,
        type: divergenceData.divergenceType === 'AND' ? 'and-gate' as const : 'or-gate' as const,
        gateMode: 'divergence' as const,
        branchCount: branchCount,
        position: { x: gateLeft, y: gateY },
        size: { width: gateWidth, height: isAnd ? DEFAULT_GATE_SIZE.height : 0 }, // OR gate has 0 height locally
        selected: false
    };

    ctx.elements.push(divergenceGate);

    // 2. Connect Source (Transition or Step) -> Divergence Gate
    const sourceElement = ctx.elements.find(e => e.id === sourceIdForGate);
    const sourceBottomY = sourceElement
        ? sourceElement.position.y + (sourceElement.size?.height || 6)
        : currentY - 50; // Fallback

    ctx.elements.push({
        id: uuidv4(),
        type: 'connection',
        sourceId: sourceIdForGate,
        targetId: divergenceGateId,
        segments: [
            {
                id: uuidv4(),
                points: [
                    { x: x + 20, y: sourceBottomY },
                    { x: x + 20, y: gateY }
                ],
                orientation: 'vertical'
            }
        ],
        position: { x: 0, y: 0 },
        selected: false
    });

    // 3. Process Branches
    // Determine where branches start (Y position)
    let branchStartY = gateY;

    if (isAnd) {
        // AND: Gate -> Gap -> Step
        branchStartY = gateY + DEFAULT_GATE_SIZE.height + GATE_TO_STEP_SPACING;
    } else {
        // OR: Gate -> Gap -> Transition
        // We want the Transition to end up at the standard 'Transition Slot'
        // Standard Slot relative to Step was 'y' (87px).
        // Gate is at 'gateY' (~60px).
        // If we start branches at 'branchStartY', the first element (Transition) will be placed there?
        // Wait, ProcessSequence adds Step/Transition.
        // If Transition, it places it AT 'branchStartY' (lines 89 of compiler.ts).
        // So we want 'branchStartY' to be 'y' (87px).
        // Let's verify: y = Step(0) + 40 + 47 = 87.
        // So yes, branchStartY should be 'y'.
        branchStartY = y;
    }

    let maxBranchY = branchStartY;
    const branchEndIds: string[] = [];
    const branchFirstIds: string[] = [];

    divergenceData.branches.forEach((branchSeq: ElementInput[], index: number) => {
        const branchX = startBranchX + (index * GUIDED_DIVERGENCE_SPACING);

        // Process branch
        // Note: For OR, branch starts with Transition. compiler.ts will place it at branchStartY.
        // For AND, branch starts with Step. compiler.ts will place it at branchStartY.
        const result = processSequence(ctx, branchSeq, branchX, branchStartY, true);

        if (result.endY > maxBranchY) {
            maxBranchY = result.endY;
        }
        branchEndIds.push(result.lastElementId);
        branchFirstIds.push(result.firstElementId);

        // Connect Divergence Gate -> First Element of Branch
        if (result.firstElementId) {
            const firstElement = ctx.elements.find(e => e.id === result.firstElementId);
            const firstElementY = firstElement ? firstElement.position.y : branchStartY;

            ctx.elements.push({
                id: uuidv4(),
                type: 'connection',
                sourceId: divergenceGateId,
                targetId: result.firstElementId,
                segments: [
                    {
                        id: uuidv4(),
                        points: [
                            { x: branchX + 20, y: gateY + (isAnd ? DEFAULT_GATE_SIZE.height : 0) },
                            { x: branchX + 20, y: firstElementY }
                        ],
                        orientation: 'vertical'
                    }
                ],
                position: { x: 0, y: 0 },
                selected: false
            });
        }
    });


    // 4. Add Convergence Gate
    // Symmetrical spacing
    const convergenceYGap = isAnd ? GATE_TO_STEP_SPACING : (OFFSET_STEP_TO_TRANS_STANDARD - OFFSET_TRANS_TO_GATE_OR);
    // For OR: we ended with Step. We want Gate to be OFFSET_TRANS_TO_GATE_OR (20) below Step? 
    // OR standard: Step -> 20 -> Gate.
    // Yes.

    const convergenceY = maxBranchY + convergenceYGap;
    const convergenceGateId = uuidv4();

    const convergenceGate = {
        id: convergenceGateId,
        type: divergenceData.divergenceType === 'AND' ? 'and-gate' as const : 'or-gate' as const,
        gateMode: 'convergence' as const,
        branchCount: branchCount,
        position: { x: gateLeft, y: convergenceY },
        size: { width: gateWidth, height: isAnd ? DEFAULT_GATE_SIZE.height : 0 },
        selected: false
    };
    ctx.elements.push(convergenceGate);

    // 5. Connect Branch Ends -> Convergence Gate
    branchEndIds.forEach((endId, index) => {
        const branchX = startBranchX + (index * GUIDED_DIVERGENCE_SPACING);
        const endElement = ctx.elements.find(e => e.id === endId);
        const endElementBottomY = endElement
            ? endElement.position.y + (endElement.size?.height || 40)
            : maxBranchY;

        ctx.elements.push({
            id: uuidv4(),
            type: 'connection',
            sourceId: endId,
            targetId: convergenceGateId,
            segments: [
                {
                    id: uuidv4(),
                    points: [
                        { x: branchX + 20, y: endElementBottomY },
                        { x: branchX + 20, y: convergenceY }
                    ],
                    orientation: 'vertical'
                }
            ],
            position: { x: 0, y: 0 },
            selected: false
        });
    });

    // Return next position
    const lastElementId = convergenceGateId;

    // Gap after convergence
    // AND: Gate -> 15 -> Trans? (OFFSET_TRANSITION_TO_GATE inverted?)
    // Guided Mode AND Convergence: Gate -> 20 -> Transition.
    // OR: Gate -> 47 -> Step? (OFFSET_TRANS_TO_NEXT_STEP)
    // We'll use standard constants approximations.

    let nextY = convergenceY + (isAnd ? DEFAULT_GATE_SIZE.height : 0);

    if (isAnd) {
        // AND Convergence: Gate -> Trans. 
        // We want Trans at +25px? (Similar to Step->Trans spacing which is 25 for AND? or 20?)
        // Let's use OFFSET_TRANSITION_TO_GATE (15) for symmetry with top? 
        // Or OFFSET_STEP_TO_TRANS_COMPRESSED (25)?
        // Guided Mode uses 20px (line 1334 GuidedPositions).
        nextY += 20;
    } else {
        // OR Convergence: Gate -> Step.
        // Step should be at standard distance?
        // Step -> 20 -> Gate.
        // Gate -> 20 -> Step?
        // Or 47?
        nextY += OFFSET_TRANS_TO_NEXT_STEP;
    }

    return { convergenceGateId, nextY, lastElementId, firstElementId: divergenceGateId };
}
