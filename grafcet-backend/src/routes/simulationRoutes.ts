import express from 'express';
import path from 'path';
import { getStorageService } from '../services/storageService.js';
import { FileSystemService } from '../services/fileSystemService.js';
import { SimulationService } from '../services/simulationService.js';
import { NavigateService } from '../services/navigateService.js';
import { ScenarioRunner } from '../services/scenarioRunner.js';

const router = express.Router();
const storage = getStorageService();

// Agent broadcast URL (Python orchestrator forwards to WebSocket clients)
const AGENT_BROADCAST_URL = 'http://127.0.0.1:3002/api/broadcast';

/**
 * Broadcast a message to connected frontend clients via the orchestrator
 */
async function broadcast(type: string, data: any = {}): Promise<void> {
    try {
        const payload = { type, ...data };
        console.log(`[SimulationRoutes] 📡 Broadcasting: ${type}`);

        const response = await fetch(AGENT_BROADCAST_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payload })
        });

        if (!response.ok) {
            console.error(`[SimulationRoutes] ❌ Broadcast failed: ${response.statusText}`);
        }
    } catch (e) {
        console.error(`[SimulationRoutes] ❌ Broadcast error:`, e);
    }
}


/**
 * POST /api/simulation/init
 * Initializes the simulation state for a given diagram.
 */
router.post('/init', async (req, res) => {
    try {
        const { diagram } = req.body;

        if (!diagram) {
            return res.status(400).json({
                success: false,
                error: 'Diagram is required'
            });
        }

        const initialState = SimulationService.init(diagram);

        res.json({
            success: true,
            state: initialState
        });
    } catch (error) {
        console.error('Error initializing simulation:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * POST /api/simulation/navigate
 * Resolves a file path and returns a frontend-compatible URL for navigation.
 */
router.post('/navigate', async (req, res) => {
    try {
        const { projectPath, modeId, fileName } = req.body;

        if (!projectPath) {
            return res.status(400).json({
                success: false,
                error: 'Project path is required'
            });
        }

        const result = await NavigateService.resolveNavigationPath(projectPath, modeId, fileName);

        if (result.success) {
            res.json(result);
        } else {
            res.status(404).json(result);
        }
    } catch (error) {
        console.error('Error in navigation:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * POST /api/simulation/step
 * Executes one simulation step.
 */
router.post('/step', async (req, res) => {
    try {
        const { diagram, state, inputs } = req.body;

        if (!diagram || !state) {
            return res.status(400).json({
                success: false,
                error: 'Diagram and State are required'
            });
        }

        const safeInputs = inputs || { transitions: {}, variables: {} };
        const globalActions = (diagram as any).simulation?.actions || [];
        const result = SimulationService.executeStep(diagram, state, safeInputs, globalActions);

        res.json({
            success: true,
            state: result.state,
            actions: result.actions
        });

    } catch (error) {
        console.error('Error stepping simulation:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});


/**
 * POST /api/simulation/save
 * Save simulation configuration to a JSON file named 'index.sim' in the project directory
 */
router.post('/save', async (req, res) => {
    try {
        const { projectPath, simulation } = req.body;
        console.log(`[SimulationRoutes] /save called with projectPath: "${projectPath}"`);

        if (!projectPath) {
            return res.status(400).json({
                success: false,
                error: 'Project path is required'
            });
        }

        if (!simulation) {
            return res.status(400).json({
                success: false,
                error: 'Simulation data is required'
            });
        }

        // Validate project path exists
        console.log(`[SimulationRoutes] Validating path: "${projectPath}"`);
        const isValidPath = await FileSystemService.validatePath(projectPath);
        console.log(`[SimulationRoutes] Path validation result: ${isValidPath}`);
        if (!isValidPath) {
            console.error(`[SimulationRoutes] Path not found: "${projectPath}"`);
            return res.status(404).json({
                success: false,
                error: 'Project path not found'
            });
        }

        const relativePath = storage.getRelativePath(projectPath);
        const simFilePath = path.join(relativePath, 'index.sim').replace(/\\/g, '/');

        // Add timestamp
        const dataToSave = {
            ...simulation,
            updatedAt: new Date().toISOString()
        };

        // Write file
        await storage.writeJson(simFilePath, dataToSave);

        // Broadcast to frontend to reload simulation data
        broadcast('sim_io_updated', {
            projectPath,
            variables: dataToSave.variables || [],
            actions: dataToSave.actions || []
        });

        res.json({
            success: true,
            savedPath: storage.getAbsolutePath(simFilePath)
        });
    } catch (error) {
        console.error('Error saving simulation:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * POST /api/simulation/load
 * Load simulation configuration from 'index.sim' in the project directory
 */
router.post('/load', async (req, res) => {
    try {
        const { projectPath } = req.body;

        console.log(`[SimulationRoutes] /load called with projectPath: "${projectPath}"`);

        if (!projectPath) {
            return res.status(400).json({
                success: false,
                error: 'Project path is required'
            });
        }

        const relativePath = storage.getRelativePath(projectPath);
        const simFilePath = path.join(relativePath, 'index.sim').replace(/\\/g, '/');
        console.log(`[SimulationRoutes] Resolved simFilePath: "${simFilePath}"`);

        // Check if file exists
        if (!await storage.exists(simFilePath)) {
            // Create default simulation file for existing projects
            const timestamp = new Date().toISOString();
            const defaultSimulation = {
                variables: [],
                actions: [],
                createdAt: timestamp,
                updatedAt: timestamp
            };

            try {
                await storage.writeJson(simFilePath, defaultSimulation);
                console.log(`[SimulationRoutes] Created default index.sim for project: ${projectPath}`);
            } catch (createError) {
                console.error(`[SimulationRoutes] Failed to create default index.sim:`, createError);
            }

            return res.json({
                success: true,
                simulation: defaultSimulation
            });
        }

        // Read file
        const simulation = await storage.readJson(simFilePath);
        console.log(`[SimulationRoutes] Loaded simulation:`, {
            variableCount: simulation?.variables?.length || 0,
            actionCount: simulation?.actions?.length || 0
        });

        res.json({
            success: true,
            simulation
        });
    } catch (error) {
        console.error('Error loading simulation:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * POST /api/simulation/sequence
 * Executes a sequence of scenarios and returns results for each.
 * Supports loading diagram from file path via Service.
 */
router.post('/sequence', async (req, res) => {
    try {
        const { diagram: providedDiagram, scenarios, filePath, projectPath, modeId, fileName } = req.body;

        if (!scenarios || !Array.isArray(scenarios)) {
            return res.status(400).json({
                success: false,
                error: 'Scenarios array is required'
            });
        }

        // 1. Try to run from file path using the new Service method
        let finalPath = filePath;
        if (!finalPath && projectPath && fileName) {
            // Construct absolute path based on whether modeId is present
            if (modeId) {
                finalPath = path.join(projectPath, 'modes', modeId, fileName).replace(/\\/g, '/');
            } else {
                // If modeId is empty/missing, assume file is in project root (e.g. conduct.sfc)
                finalPath = path.join(projectPath, fileName).replace(/\\/g, '/');
            }
        }

        if (finalPath) {
            try {
                const { results, loadedFilePath } = await SimulationService.runSequenceFromFile(finalPath, scenarios);

                // Use NavigateService to get the correct relative URL for local/agent usage
                let relativeUrlPath = filePath; // Default fallback

                if (projectPath) {
                    // Try to resolve using our centralized service
                    const navResult = await NavigateService.resolveNavigationPath(projectPath, modeId, fileName || path.basename(loadedFilePath));
                    if (navResult.success && navResult.url) {
                        // Extract the path from the URL directly (remove leading slash)
                        // URL format: http://localhost:3000/path/to/file
                        const urlObj = new URL(navResult.url);
                        const pathFromUrl = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
                        relativeUrlPath = decodeURIComponent(pathFromUrl) || relativeUrlPath;
                    }
                }

                // Broadcast to frontend (orchestrated by backend, not Python agent)
                // Use absolute file path for reliable loading
                // await broadcast('open_file', { filePath: loadedFilePath }); // Redundant - handled by tool
                await broadcast('sim_panel_open');
                await broadcast('sim_start');

                return res.json({
                    success: true,
                    results,
                    loadedFilePath, // Physical path (for debug)
                    loadedRelativePath: relativeUrlPath   // Dynamic Relative Link (for Agent/Frontend)
                });

            } catch (error: any) {
                return res.status(404).json({ success: false, error: error.message });
            }
        }

        // 2. Fallback: Use provided diagram
        if (!providedDiagram) {
            return res.status(400).json({
                success: false,
                error: 'Diagram is required (either provided directly or via valid file path)'
            });
        }

        // Initialize from initial steps
        let state = SimulationService.init(providedDiagram);
        const results: { name: string; activeSteps: string[]; activeActions: string[] }[] = [];

        // Execute all scenarios instantly
        for (let i = 0; i < scenarios.length; i++) {
            const scenario = scenarios[i];

            const inputs = {
                transitions: scenario.transitions || {},
                variables: scenario.variables || {}
            };

            const result = SimulationService.executeStep(providedDiagram, state, inputs);
            state = result.state;

            // Extract action names
            const actionNames = result.actions.map(a => a.variable);

            results.push({
                name: scenario.name || 'Unnamed',
                activeSteps: state.activeSteps,
                activeActions: actionNames
            });
        }

        res.json({
            success: true,
            results
        });

    } catch (error: any) {
        console.error('Error executing simulation sequence:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message || String(error)
        });
    }
});

/**
 * POST /api/simulation/stream
 * Streams simulation sequence from file path with delays.
 * Uses Server-Sent Events (SSE) for real-time updates.
 */
router.post('/stream', async (req, res) => {
    try {
        const { filePath, projectPath, modeId, fileName, scenarios, delayMs = 2000 } = req.body;

        let finalPath = filePath;

        // Resolve path if relative components are provided
        if (!finalPath && projectPath && modeId && fileName) {
            // Standard structure: {projectPath}/modes/{modeId}/{fileName}
            finalPath = path.join(projectPath, 'modes', modeId, fileName);
            console.log(`[Simulation] Resolved relative path: ${finalPath}`);
        }

        if (!finalPath) {
            return res.status(400).json({
                success: false,
                error: 'filePath or (projectPath, modeId, fileName) is required'
            });
        }

        // Set up SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const sendEvent = (type: string, data: any) => {
            res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
        };

        // Helper to wait
        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        // 1. Load the SFC file
        sendEvent('status', { message: `Loading SFC file: ${path.basename(finalPath)}`, filePath: finalPath });

        const fs = await import('fs/promises');
        let diagram;
        try {
            const fileContent = await fs.readFile(finalPath, 'utf-8');
            diagram = JSON.parse(fileContent);
        } catch (fileError: any) {
            console.error(`[Simulation] Failed to load file ${finalPath}:`, fileError);
            sendEvent('error', { message: `Failed to load file: ${fileError.message}` });
            res.end();
            return;
        }

        // 2. Tell frontend to open this file
        sendEvent('open_file', { filePath: finalPath });
        await sleep(500); // Small wait for frontend to load

        // 3. Send panel open command
        sendEvent('sim_panel_open', { message: 'Opening simulation panel...' });
        await sleep(delayMs);

        // 4. Initialize simulation
        sendEvent('sim_start', { message: 'Starting simulation...' });
        let state = SimulationService.init(diagram);
        await sleep(delayMs);

        // 4. Send initial state
        sendEvent('sim_step', {
            name: 'Initial State',
            stepNumber: 0,
            totalSteps: (scenarios?.length || 0) + 1,
            activeSteps: state.activeSteps,
            activeActions: []
        });
        await sleep(delayMs);

        // 5. Execute each scenario
        const scenarioList = scenarios || [];
        for (let i = 0; i < scenarioList.length; i++) {
            const scenario = scenarioList[i];
            const inputs = {
                transitions: scenario.transitions || {},
                variables: scenario.variables || {}
            };

            const globalActions = (diagram as any).simulation?.actions || [];
            const result = SimulationService.executeStep(diagram, state, inputs, globalActions);
            state = result.state;
            const actionNames = result.actions.map((a: any) => a.variable);

            sendEvent('sim_step', {
                name: scenario.name || `Scenario ${i + 1}`,
                stepNumber: i + 1,
                totalSteps: scenarioList.length + 1,
                activeSteps: state.activeSteps,
                activeActions: actionNames
            });
            await sleep(delayMs);
        }

        // 6. Complete
        sendEvent('sim_complete', { message: 'Simulation complete!' });
        res.end();

    } catch (error) {
        console.error('Error in simulation stream:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Internal error' })}\n\n`);
        res.end();
    }
});

/**
 * POST /api/simulation/launch
 * Launches a real simulation from file with step-by-step execution.
 * Broadcasts updates to frontend via the agent orchestrator.
 * This is the proper way to run simulations as it uses SimulationService.
 */
router.post('/launch', async (req, res) => {
    try {
        const {
            projectPath,
            modeId,
            fileName = 'default.sfc',
            steps = 50,
            delayMs = 2000,
            autoStop = false
        } = req.body;

        if (!projectPath) {
            return res.status(400).json({
                success: false,
                error: 'projectPath is required'
            });
        }

        // 1. Construct file path
        let finalPath: string;
        if (modeId) {
            finalPath = path.join(projectPath, 'modes', modeId, fileName).replace(/\\/g, '/');
        } else {
            finalPath = path.join(projectPath, fileName).replace(/\\/g, '/');
        }

        console.log(`[Launch] Starting simulation for: ${finalPath}`);

        // 2. Load the SFC file
        const fs = await import('fs/promises');
        let diagram;
        try {
            const fileContent = await fs.readFile(finalPath, 'utf-8');
            diagram = JSON.parse(fileContent);

            // Handle elements vs steps mismatch
            if (!diagram.elements && diagram.steps) {
                diagram.elements = [...diagram.steps, ...(diagram.transitions || [])];
            }
        } catch (fileError: any) {
            console.error(`[Launch] Failed to load file:`, fileError);
            return res.status(404).json({
                success: false,
                error: `Failed to load file: ${fileError.message}`
            });
        }

        // 3. Broadcast: Open simulation panel (open_file is now handled by the simulation tool)
        await broadcast('sim_panel_open');
        await new Promise(r => setTimeout(r, 500));

        // 5. Initialize simulation state
        console.log('[Launch] Initializing simulation state...');
        let state = SimulationService.init(diagram);

        // 6. Broadcast: Start simulation
        await broadcast('sim_start');

        // 7. Broadcast initial state (step 0)
        await broadcast('sim_step', {
            stepNumber: 0,
            activeSteps: state.activeSteps,
            name: 'Initial State',
            totalSteps: steps
        });

        // 8. Respond immediately - the simulation runs async
        res.json({
            success: true,
            message: 'Simulation launched successfully',
            filePath: finalPath,
            initialActiveSteps: state.activeSteps,
            totalSteps: steps
        });

        // 9. Run simulation loop in background (non-blocking)
        (async () => {
            try {
                for (let i = 1; i <= steps; i++) {
                    console.log(`[Launch] Step ${i}/${steps}`);

                    // Define inputs (can be extended to accept scenario inputs)
                    const inputs = {
                        transitions: {} as Record<string, boolean>,
                        variables: {} as Record<string, any>
                    };

                    // Execute step
                    const globalActions = (diagram as any).simulation?.actions || [];
                    const result = SimulationService.executeStep(diagram, state, inputs, globalActions);
                    state = result.state;

                    // Broadcast step update
                    await broadcast('sim_step', {
                        stepNumber: i,
                        activeSteps: state.activeSteps,
                        name: `Step ${i}`,
                        totalSteps: steps,
                        variables: state.variables,
                        actions: result.actions
                    });

                    if (result.actions.length > 0) {
                        console.log(`[Launch] Actions:`, result.actions);
                    }

                    await new Promise(r => setTimeout(r, delayMs));
                }

                console.log('[Launch] Simulation complete!');
                await broadcast('sim_complete');

                if (autoStop) {
                    console.log('[Launch] Auto-stopping simulation...');
                    await new Promise(r => setTimeout(r, 1000)); // Small wait after complete
                    await broadcast('sim_stop', { message: 'Simulation auto-stopped' });
                    await new Promise(r => setTimeout(r, 300));
                    await broadcast('sim_panel_close', { message: 'Closing simulation panel auto' });
                }
            } catch (loopError) {
                console.error('[Launch] Simulation loop error:', loopError);
                await broadcast('sim_error', { message: 'Simulation loop failed' });
            }
        })();

    } catch (error) {
        console.error('[Launch] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * POST /api/simulation/scenario
 * Step 3: Runs simulation scenarios with variable manipulation.
 * Uses actual SimulationService logic via ScenarioRunner.
 * Broadcasts updates to frontend via the agent orchestrator.
 */
router.post('/scenario', async (req, res) => {
    try {
        const {
            projectPath,
            modeId,
            fileName = 'default.sfc',
            scenarios = [],
            autoStop = false
        } = req.body;

        // Hardcoded delays removed/reduced as requested to prevent timeouts
        const navigateDelayMs = 0;
        const launchDelayMs = 0;
        const delayMs = 1000; // Keep a small delay between steps for visual clarity, but reduced from 2000

        if (!projectPath) {
            return res.status(400).json({
                success: false,
                error: 'projectPath is required'
            });
        }

        if (!scenarios || !Array.isArray(scenarios) || scenarios.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'scenarios array is required and must not be empty'
            });
        }

        // 1. Construct file path
        let finalPath: string;
        if (modeId) {
            finalPath = path.join(projectPath, 'modes', modeId, fileName).replace(/\\/g, '/');
        } else {
            finalPath = path.join(projectPath, fileName).replace(/\\/g, '/');
        }

        console.log(`[Scenario] Starting scenario simulation for: ${finalPath}`);
        console.log(`[Scenario] Number of scenarios: ${scenarios.length}`);

        // 2. Load the SFC file
        const fs = await import('fs/promises');
        let diagram;
        try {
            const fileContent = await fs.readFile(finalPath, 'utf-8');
            diagram = JSON.parse(fileContent);

            // Handle elements vs steps mismatch
            if (!diagram.elements && diagram.steps) {
                diagram.elements = [...diagram.steps, ...(diagram.transitions || [])];
            }
        } catch (fileError: any) {
            console.error(`[Scenario] Failed to load file:`, fileError);
            return res.status(404).json({
                success: false,
                error: `Failed to load file: ${fileError.message}`
            });
        }

        // 2.5 VALIDATE: Extract all transition conditions from diagram
        const transitions = diagram.elements?.filter((el: any) => el.type === 'transition') || [];
        const validConditions = new Set<string>();

        transitions.forEach((trans: any) => {
            if (trans.condition) {
                // Add the raw condition string
                validConditions.add(trans.condition);
                // Parse compound conditions using regex to find all valid identifiers
                // This handles "AND", "OR", ".", "+", "*", "!", "NOT" and parentheses correctly
                const identifiers = trans.condition.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];

                identifiers.forEach((ident: string) => {
                    // Filter out keywords (case-insensitive)
                    const upper = ident.toUpperCase();
                    if (!['AND', 'OR', 'NOT', 'TRUE', 'FALSE'].includes(upper)) {
                        validConditions.add(ident);
                    }
                });
            }
        });

        console.log(`[Scenario] Valid transition conditions in SFC:`, Array.from(validConditions));

        // Validate all scenario variables exist in diagram
        const invalidVariables: { scenario: string; variable: string }[] = [];
        for (const scenario of scenarios) {
            if (scenario.variables) {
                for (const varName of Object.keys(scenario.variables)) {
                    if (!validConditions.has(varName)) {
                        invalidVariables.push({
                            scenario: scenario.name || 'Unnamed',
                            variable: varName
                        });
                    }
                }
            }
        }

        if (invalidVariables.length > 0) {
            // Log warning but don't block — user may be testing with custom/future variables
            console.warn(`[Scenario] ⚠️ Some variables not found in SFC transitions (proceeding anyway):`, invalidVariables);
            console.warn(`[Scenario] Valid conditions:`, Array.from(validConditions));
        }

        // 3. NAVIGATE: Broadcast to open the file in frontend
        // Redundant - handled by tool before calling this endpoint
        // const navResult = await NavigateService.resolveNavigationPath(projectPath, modeId, fileName);
        // await broadcast('open_file', {
        //     filePath: finalPath,
        //     url: navResult.url
        // });
        // await new Promise(r => setTimeout(r, navigateDelayMs));

        // 4. Broadcast: Open simulation panel and start
        console.log(`[Scenario] Step 2: Launch simulation (delay ${launchDelayMs}ms)`);
        await broadcast('sim_panel_open');
        await new Promise(r => setTimeout(r, 300));
        await broadcast('sim_start');
        await new Promise(r => setTimeout(r, launchDelayMs));

        // 5. Initialize and broadcast initial state
        const initialState = SimulationService.init(diagram);
        await broadcast('sim_step', {
            stepNumber: 0,
            name: 'Initial State',
            activeSteps: initialState.activeSteps,
            totalSteps: scenarios.length + 1,
            variablesApplied: {}
        });

        // 6. Respond immediately - scenario execution runs async
        res.json({
            success: true,
            message: 'Scenario simulation started',
            filePath: finalPath,
            initialActiveSteps: initialState.activeSteps,
            totalScenarios: scenarios.length,
            validConditions: Array.from(validConditions)
        });

        // 7. Run scenarios in background (non-blocking)
        (async () => {
            try {
                let state = initialState;

                for (let i = 0; i < scenarios.length; i++) {
                    const scenario = scenarios[i];
                    console.log(`[Scenario] Running scenario ${i + 1}/${scenarios.length}: "${scenario.name}"`);
                    console.log(`[Scenario] Variables:`, scenario.variables);

                    // Build inputs from scenario
                    const inputs = {
                        transitions: scenario.transitions || {},
                        variables: scenario.variables || {}
                    };

                    // Execute step using actual SimulationService logic
                    const result = SimulationService.executeStep(diagram, state, inputs);
                    state = result.state;

                    // Extract action names
                    const actionNames = result.actions.map(a => a.variable);

                    console.log(`[Scenario] Result - Active steps:`, state.activeSteps);
                    console.log(`[Scenario] Result - Actions:`, actionNames);

                    // Broadcast step update
                    await broadcast('sim_step', {
                        stepNumber: i + 1,
                        name: scenario.name || `Scenario ${i + 1}`,
                        activeSteps: state.activeSteps,
                        activeActions: actionNames,
                        totalSteps: scenarios.length + 1,
                        variablesApplied: scenario.variables || {},
                        actions: result.actions
                    });

                    await new Promise(r => setTimeout(r, delayMs));
                }

                console.log('[Scenario] All scenarios complete!');
                await broadcast('sim_complete', {
                    message: 'Scenario simulation complete',
                    totalScenarios: scenarios.length
                });

                if (autoStop) {
                    console.log('[Scenario] Auto-stopping simulation...');
                    await new Promise(r => setTimeout(r, 1000)); // Small wait after complete
                    await broadcast('sim_stop', { message: 'Simulation auto-stopped' });
                    await new Promise(r => setTimeout(r, 300));
                    await broadcast('sim_panel_close', { message: 'Closing simulation panel auto' });
                }

            } catch (loopError) {
                console.error('[Scenario] Simulation loop error:', loopError);
                await broadcast('sim_error', { message: 'Scenario simulation failed' });
            }
        })();

    } catch (error) {
        console.error('[Scenario] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * POST /api/simulation/save-spec
 * Saves the analyzed specification as a Markdown file (spec.md) in the project directory.
 * Called by SpecAnalyst agent after analyzing a PDF document.
 *
 * The spec.md serves as the project's context/specification document.
 * Images from the PDF are described in text (not saved as files).
 */
router.post('/save-spec', async (req, res) => {
    try {
        const { projectPath, specContent } = req.body;

        if (!projectPath) {
            return res.status(400).json({
                success: false,
                error: 'Project path is required'
            });
        }

        if (!specContent) {
            return res.status(400).json({
                success: false,
                error: 'Spec content is required'
            });
        }

        // Validate project path exists
        const isValidPath = await FileSystemService.validatePath(projectPath);
        if (!isValidPath) {
            return res.status(404).json({
                success: false,
                error: 'Project path not found'
            });
        }

        const relativePath = storage.getRelativePath(projectPath);
        const specFilePath = path.join(relativePath, 'spec.md').replace(/\\/g, '/');

        // Write the Markdown file
        await storage.writeFile(specFilePath, specContent);
        console.log(`[SimulationRoutes] Saved spec.md to: ${specFilePath}`);

        // Broadcast to frontend
        broadcast('spec_saved', {
            projectPath,
            specPath: storage.getAbsolutePath(specFilePath)
        });

        res.json({
            success: true,
            savedPath: storage.getAbsolutePath(specFilePath)
        });
    } catch (error) {
        console.error('Error saving spec:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * POST /api/simulation/stop
 * Stops the running simulation and closes the simulation panel.
 * Broadcasts updates to frontend via the agent orchestrator.
 */
router.post('/stop', async (req, res) => {
    try {
        console.log('[Stop] Stopping simulation...');

        // Broadcast: Stop simulation
        await broadcast('sim_stop', {
            message: 'Simulation stopped'
        });

        // Small delay to ensure stop message is processed
        await new Promise(r => setTimeout(r, 300));

        // Broadcast: Close simulation panel
        await broadcast('sim_panel_close', {
            message: 'Closing simulation panel'
        });

        res.json({
            success: true,
            message: 'Simulation stopped and panel closed'
        });

        console.log('[Stop] Simulation stopped successfully');
    } catch (error) {
        console.error('[Stop] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

export default router;

