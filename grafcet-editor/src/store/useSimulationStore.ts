import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { useProjectStore } from './useProjectStore';

export type VariableType = 'boolean' | 'integer' | 'float';

export interface SimulationVariable {
    id: string;
    name: string;
    type: VariableType;
    description?: string;
    value: boolean | number; // Dynamic value based on type
}

export interface SimulationAction {
    id: string;
    name: string;
    description?: string;
    qualifier?: string;
    condition?: string;
    duration?: string;
}

interface SimulationState {
    variables: SimulationVariable[];
    actions: SimulationAction[];

    // Internal
    _saveTimeout?: any;

    // Simulation State
    isSimulating: boolean;
    showSimulationPanel: boolean;
    activeStepIds: string[];
    activeTransitionIds: string[]; // For visualizing enabled/fired transitions
    activeActionIds: string[];
    variableValues: Record<string, number | boolean>;
    prevVariableValues: Record<string, number | boolean>; // For Edge Detection
    stepActivationTimes: Record<string, number>; // For Timers

    // Variable actions
    addVariable: (variable: Omit<SimulationVariable, "id" | "value">) => void;
    updateVariable: (id: string, updates: Partial<SimulationVariable>) => void;
    deleteVariable: (id: string) => void;
    getVariableByName: (name: string) => SimulationVariable | undefined;

    // Action actions
    addAction: (action: Omit<SimulationAction, "id">) => void;
    updateAction: (id: string, updates: Partial<SimulationAction>) => void;
    deleteAction: (id: string) => void;
    getActionByName: (name: string) => SimulationAction | undefined;

    // Simulation Control
    startSimulation: (initialStepIds: string[]) => void;
    stopSimulation: () => void;
    toggleSimulationPanel: () => void;
    updateVariableValue: (id: string, value: number | boolean) => void;
    updatePrevVariableValues: () => void; // Sync current -> prev
    setActiveSteps: (stepIds: string[]) => void;
    setStepActivationTimes: (times: Record<string, number>) => void;
    setActiveTransitions: (transitionIds: string[]) => void;
    setActiveActions: (actionIds: string[]) => void;
    setShowSimulationPanel: (isOpen: boolean) => void;

    // Clear all data (useful for project resets)
    clearAll: () => void;

    // Load full simulation data (for persistence)
    loadData: (data: { variables: SimulationVariable[]; actions: SimulationAction[] }) => void;

    // New actions for separate persistence
    loadSimulation: (projectPath: string) => Promise<void>;
    saveSimulation: () => Promise<void>;

    // Modal Control
    isSimulationModalOpen: boolean;
    setSimulationModalOpen: (isOpen: boolean) => void;
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
    variables: [],
    actions: [],
    isSimulating: false,
    showSimulationPanel: false,
    isSimulationModalOpen: false,
    activeStepIds: [],
    activeTransitionIds: [],
    activeActionIds: [],
    variableValues: {},
    prevVariableValues: {},
    stepActivationTimes: {},
    _saveTimeout: undefined,

    toggleSimulationPanel: () => set((state) => ({ showSimulationPanel: !state.showSimulationPanel })),
    setShowSimulationPanel: (isOpen) => set({ showSimulationPanel: isOpen }),
    setSimulationModalOpen: (isOpen) => set({ isSimulationModalOpen: isOpen }),

    addVariable: (variable) => {
        const id = uuidv4();
        const initialValue = variable.type === 'boolean' ? false : 0;

        set((state) => {
            const newState = {
                variables: [
                    ...state.variables,
                    {
                        ...variable,
                        id,
                        value: initialValue,
                    }
                ],
                // Initialize value in the lookup map
                variableValues: {
                    ...state.variableValues,
                    [id]: initialValue
                }
            };

            // Trigger auto-save
            if (state._saveTimeout) clearTimeout(state._saveTimeout);
            const timeout = setTimeout(() => {
                get().saveSimulation();
            }, 1000);

            return { ...newState, _saveTimeout: timeout };
        });
    },

    updateVariable: (id, updates) => set((state) => {
        const newState = {
            variables: state.variables.map((v) =>
                v.id === id ? { ...v, ...updates } : v
            )
        };

        // Trigger auto-save
        if (state._saveTimeout) clearTimeout(state._saveTimeout);
        const timeout = setTimeout(() => {
            get().saveSimulation();
        }, 1000);
        return { ...newState, _saveTimeout: timeout };
    }),

    deleteVariable: (id) => set((state) => {
        const { [id]: removed, ...remainingValues } = state.variableValues;
        const newState = {
            variables: state.variables.filter((v) => v.id !== id),
            variableValues: remainingValues
        };

        // Trigger auto-save
        if (state._saveTimeout) clearTimeout(state._saveTimeout);
        const timeout = setTimeout(() => {
            get().saveSimulation();
        }, 1000);
        return { ...newState, _saveTimeout: timeout };
    }),

    getVariableByName: (name) => {
        return get().variables.find((v) => v.name === name);
    },

    addAction: (action) => set((state) => {
        const newState = {
            actions: [
                ...state.actions,
                {
                    ...action,
                    id: uuidv4(),
                }
            ]
        };

        // Trigger auto-save
        if (state._saveTimeout) clearTimeout(state._saveTimeout);
        const timeout = setTimeout(() => {
            get().saveSimulation();
        }, 1000);
        return { ...newState, _saveTimeout: timeout };
    }),

    updateAction: (id, updates) => set((state) => {
        const newState = {
            actions: state.actions.map((a) =>
                a.id === id ? { ...a, ...updates } : a
            )
        };

        // Trigger auto-save
        if (state._saveTimeout) clearTimeout(state._saveTimeout);
        const timeout = setTimeout(() => {
            get().saveSimulation();
        }, 1000);
        return { ...newState, _saveTimeout: timeout };
    }),

    deleteAction: (id) => set((state) => {
        const newState = {
            actions: state.actions.filter((a) => a.id !== id)
        };

        // Trigger auto-save
        if (state._saveTimeout) clearTimeout(state._saveTimeout);
        const timeout = setTimeout(() => {
            get().saveSimulation();
        }, 1000);
        return { ...newState, _saveTimeout: timeout };
    }),

    getActionByName: (name) => {
        return get().actions.find((a) => a.name === name);
    },

    // Simulation Control
    startSimulation: (initialStepIds) => set({
        isSimulating: true,
        activeStepIds: initialStepIds,
        activeActionIds: [], // Will be calculated by service
        stepActivationTimes: initialStepIds.reduce((acc, id) => ({ ...acc, [id]: Date.now() }), {}),
        prevVariableValues: {} // Reset prev values
    }),

    stopSimulation: () => set({
        isSimulating: false,
        activeStepIds: [],
        activeActionIds: [],
        stepActivationTimes: {},
        prevVariableValues: {}
    }),

    updateVariableValue: (id, value) => set((state) => {
        const newState = {
            variableValues: {
                ...state.variableValues,
                [id]: value
            },
            // Also update the variable definition for persistence
            variables: state.variables.map(v =>
                v.id === id ? { ...v, value } : v
            )
        };

        // Trigger auto-save ONLY if not simulating (user editing initial values)
        // Or if simulating, we might want to save state? Usually not.
        // Let's assume user wants to save initial values when not running.
        if (!state.isSimulating) {
            if (state._saveTimeout) clearTimeout(state._saveTimeout);
            const timeout = setTimeout(() => {
                get().saveSimulation();
            }, 1000);
            return { ...newState, _saveTimeout: timeout };
        }

        return newState;
    }),

    setActiveSteps: (stepIds) => set({ activeStepIds: stepIds }),

    setStepActivationTimes: (times) => set({ stepActivationTimes: times }),

    updatePrevVariableValues: () => set((state) => ({ prevVariableValues: { ...state.variableValues } })),

    setActiveTransitions: (transitionIds) => set({ activeTransitionIds: transitionIds }),

    setActiveActions: (actionIds) => set({ activeActionIds: actionIds }),

    clearAll: () => set({
        variables: [],
        actions: [],
        variableValues: {},
        activeStepIds: [],
        activeActionIds: [],
        isSimulating: false
    }),

    loadData: (data) => {
        console.log('📥 loadData called with:', data);

        // Normalize and ensure IDs for variables
        const normalizedVariables: SimulationVariable[] = (data.variables || []).map((v: any) => {
            // Normalize type (handle "Boolean" → "boolean", etc.)
            let normalizedType: VariableType = 'boolean';
            if (v.type) {
                const lowerType = String(v.type).toLowerCase();
                if (lowerType === 'boolean' || lowerType === 'integer' || lowerType === 'float') {
                    normalizedType = lowerType as VariableType;
                }
            }

            // Ensure id exists
            const id = v.id || uuidv4();

            // Ensure value exists with proper default
            let value: boolean | number = v.value;
            if (value === undefined || value === null) {
                value = normalizedType === 'boolean' ? false : 0;
            }

            return {
                id,
                name: v.name || 'Unnamed Variable',
                type: normalizedType,
                description: v.description,
                value
            };
        });

        // Normalize and ensure IDs for actions
        const normalizedActions: SimulationAction[] = (data.actions || []).map((a: any) => {
            return {
                id: a.id || uuidv4(),
                name: a.name || 'Unnamed Action',
                description: a.description,
                qualifier: a.qualifier,
                condition: a.condition,
                duration: a.duration
            };
        });

        // Reconstruct variable values map
        const values: Record<string, number | boolean> = {};
        normalizedVariables.forEach(v => {
            values[v.id] = v.value;
        });

        console.log('📝 Setting simulation store state:', {
            variableCount: normalizedVariables.length,
            actionCount: normalizedActions.length
        });

        set({
            variables: normalizedVariables,
            actions: normalizedActions,
            variableValues: values
        });

        console.log('✅ loadData completed, store now has:', {
            variables: get().variables,
            actions: get().actions
        });
    },

    saveSimulation: async () => {
        // Get project path from EITHER store (Grafcet or GSRSM)
        let projectPath: string | null = null;

        const grafcetProject = useProjectStore.getState().getCurrentProject();
        if (grafcetProject?.localPath) {
            projectPath = grafcetProject.localPath;
        }

        // Fallback: check GSRSM store
        if (!projectPath) {
            try {
                const { useGsrsmStore } = await import('./useGsrsmStore');
                const gsrsmProject = useGsrsmStore.getState().project;
                if (gsrsmProject?.localPath) {
                    projectPath = gsrsmProject.localPath;
                }
            } catch (e) {
                // Ignore import errors
            }
        }

        if (!projectPath) {
            console.warn('⚠️ Cannot save simulation: No active project with localPath');
            return;
        }

        const { variables, actions } = get();
        console.log('💾 Saving simulation configuration...', {
            projectPath,
            variableCount: variables.length,
            actionCount: actions.length
        });

        try {
            const { ApiService } = await import('../services/apiService');
            const result = await ApiService.saveSimulation(projectPath, { variables, actions });

            if (result.success) {
                console.log('✅ Simulation configuration saved to:', result.savedPath);
            } else {
                console.error('❌ Failed to save simulation configuration:', result.error);
            }
        } catch (error) {
            console.error('❌ Failed to save simulation configuration (exception):', error);
        }
    },

    loadSimulation: async (projectPath) => {
        console.log('🔄 loadSimulation called with projectPath:', projectPath);
        try {
            const { ApiService } = await import('../services/apiService');
            console.log('📡 Calling ApiService.loadSimulation...');
            const result = await ApiService.loadSimulation(projectPath);
            console.log('📡 ApiService.loadSimulation result:', result);

            if (result.success && result.simulation) {
                const hasData = (result.simulation.variables?.length > 0) || (result.simulation.actions?.length > 0);
                console.log('📊 Simulation data received:', {
                    variableCount: result.simulation.variables?.length || 0,
                    actionCount: result.simulation.actions?.length || 0,
                    hasData,
                    variables: result.simulation.variables,
                    actions: result.simulation.actions
                });

                // Only update store if we received data, or if store is empty
                // This prevents overwriting user data with empty data from a stale/wrong path
                const currentState = get();
                const storeHasData = currentState.variables.length > 0 || currentState.actions.length > 0;

                if (hasData || !storeHasData) {
                    get().loadData(result.simulation);
                    console.log('✅ Simulation configuration loaded into store');
                } else {
                    console.log('⏭️ Skipping load - received empty data but store has data');
                }

                console.log('🔍 Current store state:', {
                    variables: get().variables,
                    actions: get().actions
                });
            } else {
                console.warn('⚠️ Load failed or no simulation object returned:', result.error);
                // DON'T clear - keep existing data on failure
            }
        } catch (error) {
            console.error('❌ Failed to load simulation configuration', error);
            // DON'T clear - keep existing data on error
        }
    }
}));
