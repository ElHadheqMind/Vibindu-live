
import { v4 as uuidv4 } from 'uuid';
import { CompilerInput, ElementInput } from '../schemas.js';
import { addStep, CompilerContext } from '../builders/step-builder.js';
import { handleDivergence } from '../builders/divergence-builder.js';
import { closeGrafcet } from '../builders/connection-closer.js';
import {
    DEFAULT_TRANSITION_SIZE,
    OFFSET_TRANS_TO_NEXT_STEP,
    OFFSET_STEP_TO_TRANS_STANDARD,
    OFFSET_STEP_TO_TRANS_COMPRESSED,
    DEFAULT_STEP_SIZE,
    DEFAULT_ACTION_BLOCK_SIZE
} from '../core/constants.js';
import { validateSfcInput, formatValidationErrors } from '../validators/error-checker.js';

export function compileSfc(input: CompilerInput): any {
    // Validate input first
    const validation = validateSfcInput(input);
    if (!validation.isValid) {
        return {
            success: false,
            errors: validation.errors,
            message: formatValidationErrors(validation.errors)
        };
    }

    const ctx: CompilerContext = {
        elements: [],
        currentY: 0,
        nextTransitionNumber: 0
    };

    const START_X = 114;
    const START_Y = 0;

    ctx.currentY = START_Y;

    processSequence(ctx, input.sequence, START_X, START_Y);

    return {
        success: true,
        id: uuidv4(),
        name: "Generated SFC",
        elements: ctx.elements
    };
}

export function processSequence(
    ctx: CompilerContext,
    sequence: ElementInput[],
    x: number,
    startY: number,
    inDivergence: boolean = false
): { endY: number, lastElementId: string, firstElementId: string } {

    let lastElementId = '';
    let currentY = startY;
    let firstElementId = '';

    // Use for loop to allow lookahead
    for (let i = 0; i < sequence.length; i++) {
        const element = sequence[i];
        let currentElementId = '';

        if (element.type === 'step') {
            // Direct positioning - no slots
            ctx.currentY = currentY;

            const result = addStep(ctx, element, x);
            currentElementId = result.stepId;
            if (!firstElementId) firstElementId = currentElementId;

            if (lastElementId) {
                connectElements(ctx, lastElementId, currentElementId, x);
            }

            lastElementId = currentElementId;

            // Check for condensed requirement (Next is Transition, and Next+1 is AND Divergence)
            const next1 = sequence[i + 1];
            const next2 = sequence[i + 2];
            const isCompressed = next1?.type === 'transition' &&
                next2?.type === 'divergence' &&
                next2.divergenceType === 'AND';

            const offset = isCompressed ? OFFSET_STEP_TO_TRANS_COMPRESSED : OFFSET_STEP_TO_TRANS_STANDARD;

            // Move to potential transition position
            currentY += DEFAULT_STEP_SIZE.height + offset;
            ctx.currentY = currentY;

        } else if (element.type === 'transition') {
            // Direct positioning for transitions
            ctx.currentY = currentY;

            currentElementId = uuidv4();
            if (!firstElementId) firstElementId = currentElementId;

            ctx.elements.push({
                id: currentElementId,
                type: 'transition',
                condition: element.condition,
                number: element.number !== undefined ? element.number : ctx.nextTransitionNumber++,
                position: { x: x, y: currentY },
                size: DEFAULT_TRANSITION_SIZE,
                selected: false
            });

            if (lastElementId) {
                connectElements(ctx, lastElementId, currentElementId, x);
            }

            lastElementId = currentElementId;
            // Move to potential next step position
            // For standard flow: Transition -> Step (+47)
            // For AND Divergence: Transition -> Gate (+15). 
            // This is handled inside 'handleDivergence' (it back-calculates), 
            // so we can use standard spacing here as the "default assumption".
            currentY += DEFAULT_TRANSITION_SIZE.height + OFFSET_TRANS_TO_NEXT_STEP;
            ctx.currentY = currentY;

        } else if (element.type === 'jump') {
            if (!lastElementId) continue;

            const targetStep = ctx.elements.find(e =>
                e.type === 'step' && e.number.toString() === element.target.toString()
            );

            if (targetStep) {
                const lastEl = ctx.elements.find(e => e.id === lastElementId);
                const actualBottomY = lastEl ? lastEl.position.y + (lastEl.size?.height || 0) : currentY;

                closeGrafcet(ctx, lastElementId, x, actualBottomY, targetStep.id, targetStep.position.x, targetStep.position.y);
            }
            lastElementId = ''; // Break linkage

        } else if (element.type === 'divergence') {
            const result = handleDivergence(ctx, element, x, currentY, lastElementId, processSequence);

            if (!firstElementId && result.firstElementId) {
                firstElementId = result.firstElementId;
            }

            lastElementId = result.lastElementId;
            currentY = result.nextY;
            ctx.currentY = currentY;
        }
    }

    return { endY: currentY, lastElementId, firstElementId };
}

function connectElements(ctx: CompilerContext, sourceId: string, targetId: string, x: number) {
    const source = ctx.elements.find(e => e.id === sourceId);
    const target = ctx.elements.find(e => e.id === targetId);

    if (!source || !target) return;

    const sourceBottomY = source.position.y + (source.size?.height || 0);
    const targetTopY = target.position.y;

    ctx.elements.push({
        id: uuidv4(),
        type: 'connection',
        sourceId: sourceId,
        targetId: targetId,
        segments: [
            {
                id: uuidv4(),
                points: [
                    { x: x + 20, y: sourceBottomY },
                    { x: x + 20, y: targetTopY }
                ],
                orientation: 'vertical'
            }
        ],
        position: { x: 0, y: 0 },
        selected: false
    });
}
