import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  GsrsmMode,
  GsrsmProject,
  GsrsmCategory,
  GsrsmModeType,
  Point,
  ContextMenuOption,
  GsrsmConnectionState,
} from '../models/types';
import {
  createGsrsmMode,
  createGsrsmProject,
  STANDARD_MODES_DEFINITIONS,
} from '../models/GsrsmElements';
import { STANDARD_CONNECTION_IDS } from '../models/GsrsmConnections';
import { ApiService } from '../services/apiService';
import { useAutoSaveStore } from './useAutoSaveStore';

interface GsrsmState {
  // Project state
  project: GsrsmProject | null;

  // Selection state
  selectedModeIds: string[];

  // Canvas state
  scale: number;
  offset: Point;

  // Context menu
  contextMenuPosition: Point | null;
  contextMenuOptions: ContextMenuOption[];

  // Internal state
  _saveTimeout?: any;

  // Actions - Project
  createProject: (name: string) => GsrsmProject;
  loadProject: (project: GsrsmProject) => void;
  updateProject: (updates: Partial<GsrsmProject>) => void;
  saveProject: () => Promise<boolean>;
  closeProject: () => void;
  ensureStandardModes: () => void;

  // Actions - Modes
  addMode: (
    code: string,
    title: string,
    description: string,
    category: GsrsmCategory,
    position: Point,
    type?: GsrsmModeType
  ) => GsrsmMode;
  updateMode: (id: string, updates: Partial<GsrsmMode>) => void;
  updateConnection: (id: string, updates: Partial<GsrsmConnectionState>) => void;
  removeMode: (id: string) => void;
  selectMode: (id: string) => void;
  selectModes: (ids: string[]) => void;
  deselectAllModes: () => void;
  highlightMode: (id: string) => void;
  activateMode: (id: string) => void;
  deactivateMode: (id: string, deleteFolder?: boolean) => Promise<void>;

  // Canvas actions
  setScale: (scale: number) => void;
  setOffset: (offset: Point) => void;
  panCanvas: (delta: Point) => void;
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;

  // Context menu actions
  showContextMenu: (position: Point, options: ContextMenuOption[]) => void;
  hideContextMenu: () => void;

  // Getters
  getModeById: (id: string) => GsrsmMode | undefined;
  getModesByCategory: (category: GsrsmCategory) => GsrsmMode[];

  // Helper functions
  screenToCanvas: (point: Point) => Point;
  canvasToScreen: (point: Point) => Point;
}

export const useGsrsmStore = create<GsrsmState>()(
  persist(
    (set, get) => ({
      // Initial state
      project: null,
      selectedModeIds: [],

      // Canvas state
      scale: 1,
      offset: { x: 0, y: 0 },

      // Context menu (not persisted)
      contextMenuPosition: null,
      contextMenuOptions: [],

      // Project actions
      createProject: (name: string) => {
        const newProject = createGsrsmProject(name);
        set({ project: newProject });
        return newProject;
      },

      ensureStandardModes: () => {
        const { project } = get();
        if (!project) return;

        // Guard: if project has no diagram property, initialize it
        if (!project.diagram) {
          const now = new Date().toISOString();
          set((state) => ({
            project: state.project ? {
              ...state.project,
              diagram: {
                id: 'diagram-default',
                name: state.project.name || 'GSRSM',
                modes: [],
                connections: [],
                version: '1.0',
                createdAt: now,
                updatedAt: now
              }
            } : null
          }));
        }

        // Re-read after potential initialization
        const updatedProject = get().project;
        if (!updatedProject?.diagram) return;

        const currentModes = updatedProject.diagram.modes || [];
        const missingModes = STANDARD_MODES_DEFINITIONS.filter(
          def => !currentModes.some(m => m.code === def.code)
        );

        let modesUpdated = false;
        let updatedModes = [...currentModes];

        if (missingModes.length > 0) {
          const newModes = missingModes.map(m =>
            createGsrsmMode(
              m.code,
              m.code,
              '',
              m.category as GsrsmCategory,
              { x: 0, y: 0 }
            )
          );
          updatedModes = [...updatedModes, ...newModes];
          modesUpdated = true;
        }

        // Ensure standard connections
        const currentConnections = updatedProject.diagram.connections || [];
        const missingConnections = STANDARD_CONNECTION_IDS.filter(
          id => !currentConnections.some(c => c.id === id)
        );

        let connectionsUpdated = false;
        let updatedConnections = [...currentConnections];

        if (missingConnections.length > 0) {
          const newConnections = missingConnections.map(id => ({
            id,
            activated: false,
            condition: ''
          }));
          updatedConnections = [...updatedConnections, ...newConnections];
          connectionsUpdated = true;
        }

        if (modesUpdated || connectionsUpdated) {
          set((state) => ({
            project: state.project ? {
              ...state.project,
              diagram: {
                ...(state.project.diagram || {}),
                modes: updatedModes,
                connections: updatedConnections
              }
            } : null
          }));

          get().saveProject();
        }
      },

      loadProject: (project: GsrsmProject) => {
        // Ensure project has a diagram property before storing
        const now = new Date().toISOString();
        const safeProject = {
          ...project,
          diagram: project.diagram || {
            id: 'diagram-default',
            name: project.name || 'GSRSM',
            modes: [],
            connections: [],
            version: '1.0',
            createdAt: now,
            updatedAt: now
          }
        };
        set({ project: safeProject });
        get().ensureStandardModes();
        // NOTE: IO/simulation data is loaded centrally by useAutoRefresh hook
      },

      updateProject: (updates: Partial<GsrsmProject>) => {
        set((state) => ({
          project: state.project ? { ...state.project, ...updates } : null,
        }));

        // Auto-save to file system after updating project
        const { project } = get();
        if (project && project.localPath) {
          // Debounce the save operation to avoid excessive saves
          const state = get();
          if (state._saveTimeout) {
            clearTimeout(state._saveTimeout);
          }
          state._saveTimeout = setTimeout(async () => {
            try {
              useAutoSaveStore.getState().setSaving();
              const success = await get().saveProject();
              if (success) {
                useAutoSaveStore.getState().setSaved();
              } else {
                useAutoSaveStore.getState().setError('Failed to save project');
              }
            } catch (error) {
              console.error('Auto-save failed:', error);
              useAutoSaveStore.getState().setError('Auto-save failed');
            }
          }, 500); // Save after 500ms of inactivity
        }
      },

      saveProject: async () => {
        try {
          const { project } = get();
          if (!project) {
            console.error('No project to save');
            return false;
          }

          const response = await ApiService.saveProject({
            project,
            type: 'gsrsm'
          });

          return response.success;
        } catch (error) {
          console.error('Failed to save Gsrsm project:', error);
          return false;
        }
      },

      closeProject: () => {
        set({
          project: null,
          selectedModeIds: [],
          scale: 1,
          offset: { x: 0, y: 0 },
          contextMenuPosition: null,
          contextMenuOptions: [],
        });
      },

      // Mode actions
      addMode: (code, title, description, category, position, type = 'normal') => {
        const newMode = createGsrsmMode(code, title, description, category, position, type);

        set((state) => ({
          project: state.project
            ? {
              ...state.project,
              diagram: {
                ...state.project.diagram,
                modes: [...state.project.diagram.modes, newMode],
                updatedAt: new Date().toISOString(),
              },
            }
            : null,
        }));

        // Auto-save to file system after adding mode
        const { project } = get();
        if (project && project.localPath) {
          // Debounce the save operation to avoid excessive saves
          const state = get();
          if (state._saveTimeout) {
            clearTimeout(state._saveTimeout);
          }
          state._saveTimeout = setTimeout(async () => {
            try {
              useAutoSaveStore.getState().setSaving();
              const success = await get().saveProject();
              if (success) {
                useAutoSaveStore.getState().setSaved();
              } else {
                useAutoSaveStore.getState().setError('Failed to save project');
              }
            } catch (error) {
              console.error('Auto-save failed:', error);
              useAutoSaveStore.getState().setError('Auto-save failed');
            }
          }, 500); // Save after 500ms of inactivity
        }

        return newMode;
      },

      updateMode: (id, updates) => {
        set((state) => ({
          project: state.project
            ? {
              ...state.project,
              diagram: {
                ...state.project.diagram,
                modes: state.project.diagram.modes.map((mode) =>
                  mode.id === id ? { ...mode, ...updates } : mode
                ),
                updatedAt: new Date().toISOString(),
              },
            }
            : null,
        }));

        // Auto-save to file system after updating mode
        const { project } = get();
        if (project && project.localPath) {
          // Debounce the save operation to avoid excessive saves
          const state = get();
          if (state._saveTimeout) {
            clearTimeout(state._saveTimeout);
          }
          state._saveTimeout = setTimeout(async () => {
            try {
              useAutoSaveStore.getState().setSaving();
              const success = await get().saveProject();
              if (success) {
                useAutoSaveStore.getState().setSaved();
              } else {
                useAutoSaveStore.getState().setError('Failed to save project');
              }
            } catch (error) {
              console.error('Auto-save failed:', error);
              useAutoSaveStore.getState().setError('Auto-save failed');
            }
          }, 500); // Save after 500ms of inactivity
        }
      },

      updateConnection: (id, updates) => {
        set((state) => {
          if (!state.project) return { project: null };

          const currentConnections = state.project.diagram.connections || [];
          const existingIndex = currentConnections.findIndex(c => c.id === id);

          let newConnections;
          if (existingIndex === -1) {
            // New connection state - must provide defaults for required fields
            newConnections = [...currentConnections, {
              id,
              activated: false, // Default if not provided
              condition: '',    // Default empty string
              ...updates
            }];
          } else {
            // Update existing
            newConnections = [...currentConnections];
            newConnections[existingIndex] = { ...newConnections[existingIndex], ...updates };
          }

          return {
            project: {
              ...state.project,
              diagram: {
                ...state.project.diagram,
                connections: newConnections,
                updatedAt: new Date().toISOString(),
              },
            }
          };
        });

        // Auto-save to file system after updating connection
        const { project } = get();
        if (project && project.localPath) {
          const state = get();
          if (state._saveTimeout) {
            clearTimeout(state._saveTimeout);
          }
          state._saveTimeout = setTimeout(async () => {
            // Reuse existing save logic
            try {
              useAutoSaveStore.getState().setSaving();
              const success = await get().saveProject();
              if (success) {
                useAutoSaveStore.getState().setSaved();
              } else {
                useAutoSaveStore.getState().setError('Failed to save project');
              }
            } catch (error) {
              console.error('Auto-save failed:', error);
              useAutoSaveStore.getState().setError('Auto-save failed');
            }
          }, 500);
        }
      },

      removeMode: (id) => {
        set((state) => {
          if (!state.project) return { project: null };

          // Remove the mode
          const updatedModes = state.project.diagram.modes.filter((mode) => mode.id !== id);

          return {
            project: {
              ...state.project,
              diagram: {
                ...state.project.diagram,
                modes: updatedModes,
                updatedAt: new Date().toISOString(),
              },
            },
            // Also deselect if it was selected
            selectedModeIds: state.selectedModeIds.filter((modeId) => modeId !== id),
          };
        });

        // Auto-save to file system after removing mode
        const { project } = get();
        if (project && project.localPath) {
          // Debounce the save operation to avoid excessive saves
          const state = get();
          if (state._saveTimeout) {
            clearTimeout(state._saveTimeout);
          }
          state._saveTimeout = setTimeout(async () => {
            try {
              useAutoSaveStore.getState().setSaving();
              const success = await get().saveProject();
              if (success) {
                useAutoSaveStore.getState().setSaved();
              } else {
                useAutoSaveStore.getState().setError('Failed to save project');
              }
            } catch (error) {
              console.error('Auto-save failed:', error);
              useAutoSaveStore.getState().setError('Auto-save failed');
            }
          }, 500); // Save after 500ms of inactivity
        }
      },

      selectMode: (id) => {
        set({ selectedModeIds: [id] });
      },

      selectModes: (ids) => {
        set({
          selectedModeIds: ids,
        });
      },

      deselectAllModes: () => {
        set({ selectedModeIds: [] });
      },

      highlightMode: (id) => {
        const { getModeById, updateMode } = get();
        const mode = getModeById(id);

        if (mode) {
          // Reset all modes to normal first
          get().project?.diagram.modes.forEach((m) => {
            if (m.type === 'highlighted' && m.id !== id) {
              updateMode(m.id, { type: 'normal' });
            }
          });

          // Then highlight the selected mode
          updateMode(id, { type: 'highlighted' });
        }
      },

      activateMode: async (id) => {
        const { getModeById, updateMode, saveProject, project } = get();
        const mode = getModeById(id);

        if (mode && project) {
          // Toggle behavior - if the mode is already active, deactivate it, otherwise activate it
          if (mode.type === 'active') {
            // Deactivating mode - check if folder has content and show popup if needed
            await get().deactivateMode(id);
          } else {
            // Activating mode - create folder, create GRAFCET file, and update state
            try {
              // If project has no localPath, we cannot create folders on the server
              if (!project.localPath) {
                console.warn('Cannot activate mode: Project has no local path. Save the project first.');
                updateMode(id, { type: 'active', activated: true }); // Still update UI state
                return;
              }

              // Create folder for the activated mode
              const createResult = await ApiService.createFolder(`${project.localPath}/modes`, mode.code);

              if (!createResult.success && !createResult.error?.includes('already exists')) {
                console.error('Failed to create mode folder:', createResult.error);
                // Continue anyway - folder might already exist
              }

              // Create GRAFCET file for this mode automatically
              const grafcetResult = await ApiService.createModeGrafcet({
                projectPath: project.localPath!,
                modeCode: mode.code
              });

              if (grafcetResult.success) {
                console.log(`Created GRAFCET file for mode ${mode.code}:`, grafcetResult.filePath);
              } else {
                console.warn('Failed to create mode GRAFCET (may already exist):', grafcetResult.error);
              }

              // Update mode state to active
              updateMode(id, { type: 'active', activated: true });

              // Automatically save the project when a mode is activated
              setTimeout(() => {
                saveProject().catch(error => {
                  console.error('Failed to auto-save project after mode activation:', error);
                });
              }, 100); // Small delay to ensure state is updated
            } catch (error) {
              console.error('Error activating mode:', error);
            }
          }
        }
      },

      deactivateMode: async (id, deleteFolder = false) => {
        const { getModeById, updateMode, saveProject, project } = get();
        const mode = getModeById(id);

        if (mode && mode.type === 'active' && project) {
          // If deleteFolder is true, call the API to remove it
          if (deleteFolder && project.localPath) {
            try {
              const response = await ApiService.deleteModeFolder(project.localPath, mode.code);
              if (response.success) {
                console.log(`Successfully deleted folder for mode ${mode.code}`);
              } else {
                console.warn(`Failed to delete folder for mode ${mode.code}:`, response.error);
              }
            } catch (error) {
              console.error(`Error deleting folder for mode ${mode.code}:`, error);
            }
          }

          // Simply deactivate mode
          updateMode(id, { type: 'normal', activated: false });

          // Automatically save the project when a mode is deactivated
          setTimeout(() => {
            saveProject().catch(error => {
              console.error('Failed to auto-save project after mode deactivation:', error);
            });
          }, 1000); // Small delay to ensure state is updated
        }
      },

      // Getters
      getModeById: (id) => {
        return get().project?.diagram.modes.find((mode) => mode.id === id);
      },

      getModesByCategory: (category) => {
        return get().project?.diagram.modes.filter((mode) => mode.category === category) || [];
      },

      // Canvas actions
      setScale: (scale: number) => set({ scale: Math.max(0.1, Math.min(5, scale)) }),

      setOffset: (offset: Point) => set({ offset }),

      panCanvas: (delta: Point) => set((state) => ({
        offset: {
          x: state.offset.x + delta.x,
          y: state.offset.y + delta.y,
        },
      })),

      resetView: () => set({ scale: 1, offset: { x: 0, y: 0 } }),

      zoomIn: () => set((state) => ({ scale: Math.min(5, state.scale * 1.2) })),

      zoomOut: () => set((state) => ({ scale: Math.max(0.1, state.scale / 1.2) })),

      // Context menu actions
      showContextMenu: (position: Point, options: ContextMenuOption[]) =>
        set({ contextMenuPosition: position, contextMenuOptions: options }),

      hideContextMenu: () => set({ contextMenuPosition: null, contextMenuOptions: [] }),

      // Helper functions
      screenToCanvas: (point: Point) => {
        const { scale, offset } = get();
        return {
          x: (point.x - offset.x) / scale,
          y: (point.y - offset.y) / scale,
        };
      },

      canvasToScreen: (point: Point) => {
        const { scale, offset } = get();
        return {
          x: point.x * scale + offset.x,
          y: point.y * scale + offset.y,
        };
      },
    }),
    {
      name: 'grafcet-Gsrsm-state',
      partialize: (state) => ({
        project: state.project,
        scale: state.scale,
        offset: state.offset,
      }),
      // NOTE: IO/simulation data is loaded centrally by useAutoRefresh hook on mount
    }
  )
);
