
import { sfcCompiler } from '../src/services/sfcCompiler';

const runTest = () => {
    console.log("Starting Layout Verification...");

    // 1. Test AND Divergence (Compressed Spacing)
    const codeAND = `
SFC "Test AND"
Step 0 (Initial)
Transition T0
Divergence AND
    Branch
        Step 1
    EndBranch
    Branch
        Step 2
    EndBranch
EndDivergence
Step 3
`;
    console.log("\nCompiling AND Divergence...");
    const resAND = sfcCompiler.compile(codeAND, "Test AND");

    if (!(resAND as any).success) {
        console.error("AND Compilation Failed:", (resAND as any).error);
        process.exit(1);
    }

    const elsAND = (resAND as any).generatedSFC.elements;
    const getY = (type: string, name?: string | number) => {
        const el = elsAND.find((e: any) => {
            if (e.type !== type) return false;
            if (type === 'step') return e.number === name;
            if (type === 'transition') return e.condition === name;
            return true;
        });
        return el ? Math.round(el.position.y) : 'N/A';
    };

    const s0_y = getY('step', 0);
    const s0_x = elsAND.find((e: any) => e.type === 'step' && e.number === 0)?.position.x;
    const t0_y = getY('transition', 'T0');
    const gate_y = elsAND.find((e: any) => e.type === 'and-gate' && e.gateMode === 'divergence')?.position.y;
    const s1_y = getY('step', 1);
    const s1_x = elsAND.find((e: any) => e.type === 'step' && e.number === 1)?.position.x;
    const s2_x = elsAND.find((e: any) => e.type === 'step' && e.number === 2)?.position.x;

    console.log(`Step 0 Y: ${s0_y} (Expected: 0)`);
    console.log(`Step 0 X: ${s0_x} (Expected: 114)`);
    console.log(`Trans T0 Y: ${t0_y} (Expected: 65) [0+40+25]`);
    console.log(`Gate Y: ${Math.round(gate_y)} (Expected: 86) [65+6+15]`);
    console.log(`Step 1 Y: ${s1_y} (Expected: 140) [86+8+46]`);
    console.log(`Step 1 X: ${s1_x} (Expected: -86) [114 - (400/2)]`);
    console.log(`Step 2 X: ${s2_x} (Expected: 314) [-86 + 400]`);

    const horizontalCorrect = s1_x === -86 && s2_x === 314;
    const verticalCorrect = s0_y === 0 && t0_y === 65 && Math.round(gate_y) === 86 && s1_y === 140;

    if (verticalCorrect && horizontalCorrect) {
        console.log("✅ AND Divergence Layout Verified (Vertical & Horizontal)!");
    } else {
        if (!verticalCorrect) console.error("❌ AND Divergence Vertical Layout Mismatch!");
        if (!horizontalCorrect) console.error("❌ AND Divergence Horizontal Layout Mismatch!");
    }

    // 2. Test OR Divergence (Compact Spacing)
    const codeOR = `
SFC "Test OR"
Step 10 (Initial)
Divergence OR
    Branch
        Transition T10
        Step 11
        Transition T11
    EndBranch
    Branch
        Transition T12
        Step 12
        Transition T13
    EndBranch
EndDivergence
Step 13
`;
    console.log("\nCompiling OR Divergence...");
    const resOR = sfcCompiler.compile(codeOR, "Test OR");

    if (!(resOR as any).success) {
        console.error("OR Compilation Failed:", (resOR as any).error);
        process.exit(1);
    }

    const elsOR = (resOR as any).generatedSFC.elements;
    const getY_OR = (type: string, name?: string | number) => {
        const el = elsOR.find((e: any) => {
            if (e.type !== type) return false;
            if (type === 'step') return e.number === name;
            if (type === 'transition') return e.condition === name;
            return true;
        });
        return el ? Math.round(el.position.y) : 'N/A';
    };

    const s10_y = getY_OR('step', 10);
    const gateOR_y = elsOR.find((e: any) => e.type === 'or-gate' && e.gateMode === 'divergence')?.position.y;
    const t10_y = getY_OR('transition', 'T10');
    const s11_y = getY_OR('step', 11);

    console.log(`Step 10 Y: ${s10_y} (Expected: 0)`);
    console.log(`Gate Y: ${Math.round(gateOR_y)} (Expected: 60) [0+40+20]`);
    console.log(`Trans T10 Y: ${t10_y} (Expected: 87) [0+40+47]`); // Standard spacing used for OR branch start
    console.log(`Step 11 Y: ${s11_y} (Expected: 140) [87+6+47]`);

    if (s10_y === 0 && Math.round(gateOR_y) === 60 && t10_y === 87 && s11_y === 140) {
        console.log("✅ OR Divergence Layout Verified!");
    } else {
        console.error("❌ OR Divergence Layout Mismatch!");
    }
};

runTest();
