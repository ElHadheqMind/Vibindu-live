import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { GrafcetProject, GrafcetDiagram } from '../models/types';
import { ApiService } from '../services/apiService';
import { useSaveStatusStore } from './useSaveStatusStore';
import { useAutoSaveStore } from './useAutoSaveStore';

interface ProjectState {
  projects: GrafcetProject[];
  currentProjectId: string | null;
  currentDiagramId: string | null;

  // Internal state
  _saveTimeout?: any;

  // Actions
  requestAutoSave: (elements: import('../models/types').GrafcetElement[]) => Promise<void>;

  // Project actions
  createProject: (name: string) => GrafcetProject;
  loadProject: (project: GrafcetProject) => Promise<void>;
  updateProject: (projectId: string, updates: Partial<GrafcetProject>) => void;
  deleteProject: (projectId: string) => void;
  setCurrentProject: (projectId: string) => Promise<void>;
  closeProject: () => void;

  // Diagram actions
  createDiagram: (projectId: string, name: string) => GrafcetDiagram;
  updateDiagram: (diagramId: string, updates: Partial<GrafcetDiagram>) => void;
  deleteDiagram: (diagramId: string) => void;
  setCurrentDiagram: (diagramId: string) => void;

  // Export/Import
  exportProject: (projectId: string) => string;
  importProject: (jsonData: string) => GrafcetProject;
  saveProject: (projectId: string) => Promise<boolean>;

  // Sync
  syncToLocalStorage: () => void;

  // Remote projects
  remoteProjects: Array<{
    name: string;
    path: string;
    type: 'grafcet' | 'gsrsm';
    lastModified: string;
  }>;
  fetchRemoteProjects: () => Promise<void>;

  // Getters
  getCurrentProject: () => GrafcetProject | null;
  getCurrentDiagram: () => GrafcetDiagram | null;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],
      currentProjectId: null,
      currentDiagramId: null,
      remoteProjects: [],
      _saveTimeout: undefined,

      requestAutoSave: async (elements) => {
        const { currentProjectId, currentDiagramId } = get();
        if (!currentProjectId || !currentDiagramId) return;

        // 1. Update the store immediately with the new elements
        // This ensures if we switch diagrams/projects, we have the latest state in memory
        const timestamp = new Date().toISOString();
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === currentProjectId
              ? {
                ...project,
                diagrams: (project.diagrams || []).map((diagram) =>
                  diagram.id === currentDiagramId
                    ? { ...diagram, elements: elements, updatedAt: timestamp }
                    : diagram
                ),
                updatedAt: timestamp,
              }
              : project
          ),
        }));

        // 2. Trigger debounce save
        useAutoSaveStore.getState().setSaving();

        const state = get();
        if (state._saveTimeout) {
          clearTimeout(state._saveTimeout);
        }

        const timeout = setTimeout(async () => {
          try {
            const success = await get().saveProject(currentProjectId);
            if (success) {
              useAutoSaveStore.getState().setSaved();
            } else {
              useAutoSaveStore.getState().setError('Auto-save failed');
            }
          } catch (error) {
            console.error('Auto-save error:', error);
            useAutoSaveStore.getState().setError('Auto-save error');
          }
        }, 500); // 500ms debounce for "pro" responsiveness

        set({ _saveTimeout: timeout });
      },

      fetchRemoteProjects: async () => {
        try {
          const response = await ApiService.listProjects('');
          if (response.success && response.projects) {
            set({ remoteProjects: response.projects });
          }
        } catch (error) {
          console.error('Failed to fetch remote projects:', error);
        }
      },

      // Project actions
      createProject: (name: string) => {
        const timestamp = new Date().toISOString();
        const newProject: GrafcetProject = {
          id: uuidv4(),
          name,
          diagrams: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        console.debug('🆕 Creating new project:', name, newProject.id);

        set((state) => {
          const newState = {
            projects: [...state.projects, newProject],
            currentProjectId: newProject.id,
            currentDiagramId: null,
          };

          return newState;
        });

        // Mark as dirty - new project needs to be saved
        useSaveStatusStore.getState().markDirty();

        return newProject;
      },

      loadProject: async (project: GrafcetProject) => {
        console.debug('📂 Loading project into store:', project.name, project.id);

        set((state) => {
          // Ensure the project has its localPath if it was passed in the project object
          const updatedProject = { ...project };

          const newState = {
            projects: [...state.projects.filter(p => p.id !== updatedProject.id), updatedProject],
            currentProjectId: updatedProject.id,
            currentDiagramId: (updatedProject.diagrams && updatedProject.diagrams.length > 0) ? updatedProject.diagrams[0].id : null,
          };

          return newState;
        });

        // Load simulation data if present
        // Import simulation store (this is fine, it's a one-time import)
        const { useSimulationStore } = await import('./useSimulationStore');

        // Load simulation data based on project configuration
        if (project.localPath) {
          console.debug('📊 Loading simulation for project from path:', project.localPath);
          await useSimulationStore.getState().loadSimulation(project.localPath);
        } else if (project.simulation) {
          console.debug('📊 Loading simulation from embedded data');
          useSimulationStore.getState().loadData(project.simulation);
        } else {
          console.debug('📊 No simulation data found, clearing store');
          useSimulationStore.getState().clearAll();
        }

        // Load Vibe Chat conversations for this project
        // Use setProjectPath instead of loadConversations for proper protection
        if (project.localPath) {
          console.debug('💬 Loading Vibe Chat conversations for project:', project.localPath);
          const { useVibeChatStore } = await import('./useVibeChatStore');
          await useVibeChatStore.getState().setProjectPath(project.localPath);
        }

        // Final safety check to ensure we have a valid currentProjectId/currentDiagramId
        set((state) => {
          const projectInState = state.projects.find(p => p.id === project.id);
          const firstDiagramId = (projectInState?.diagrams && projectInState.diagrams.length > 0)
            ? projectInState.diagrams[0].id
            : null;

          return {
            currentProjectId: project.id,
            currentDiagramId: firstDiagramId
          };
        });

        // Clear save status - freshly loaded
        useSaveStatusStore.getState().reset();
      },

      updateProject: (projectId: string, updates: Partial<GrafcetProject>) => {
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === projectId
              ? { ...project, ...updates, updatedAt: new Date().toISOString() }
              : project
          ),
        }));

        // Mark as dirty - user needs to save explicitly
        useSaveStatusStore.getState().markDirty();
      },

      deleteProject: (projectId: string) => {
        set((state) => ({
          projects: state.projects.filter((project) => project.id !== projectId),
          currentProjectId: state.currentProjectId === projectId ? null : state.currentProjectId,
          currentDiagramId: state.currentProjectId === projectId ? null : state.currentDiagramId,
        }));
      },

      setCurrentProject: async (projectId: string) => {
        console.debug('🎯 Setting current project:', projectId);
        const project = get().projects.find((p) => p.id === projectId);
        if (!project) {
          console.warn('⚠️ Project not found:', projectId);
          return;
        }

        set({
          currentProjectId: projectId,
          currentDiagramId: (project.diagrams && project.diagrams.length > 0) ? project.diagrams[0].id : null,
        });

        // Load simulation data when switching projects
        const { useSimulationStore } = await import('./useSimulationStore');
        if (project.localPath) {
          console.debug('📊 Loading simulation for switched project:', project.localPath);
          await useSimulationStore.getState().loadSimulation(project.localPath);
        } else if (project.simulation) {
          console.debug('📊 Loading embedded simulation for switched project');
          useSimulationStore.getState().loadData(project.simulation);
        } else {
          console.debug('📊 Clearing simulation for project without data');
          useSimulationStore.getState().clearAll();
        }

        // Load Vibe Chat conversations when switching projects
        // Use setProjectPath instead of loadConversations for proper protection
        if (project.localPath) {
          console.debug('💬 Loading Vibe Chat conversations for switched project:', project.localPath);
          const { useVibeChatStore } = await import('./useVibeChatStore');
          await useVibeChatStore.getState().setProjectPath(project.localPath);
        }

        // Reset save status when switching projects
        useSaveStatusStore.getState().reset();
      },

      closeProject: () => {
        console.debug('🚪 Closing current project');
        set({
          currentProjectId: null,
          currentDiagramId: null,
        });

        // Clear simulation data
        import('./useSimulationStore').then(({ useSimulationStore }) => {
          useSimulationStore.getState().clearAll();
        });

        // Reset save status
        useSaveStatusStore.getState().reset();
      },

      // Diagram actions
      createDiagram: (projectId: string, name: string) => {
        const timestamp = new Date().toISOString();
        const newDiagram: GrafcetDiagram = {
          id: uuidv4(),
          name,
          elements: [],
          version: '1.0',
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === projectId
              ? {
                ...project,
                diagrams: [...(project.diagrams || []), newDiagram],
                updatedAt: timestamp,
              }
              : project
          ),
          currentDiagramId: newDiagram.id,
        }));

        // Mark as dirty - new diagram needs to be saved
        useSaveStatusStore.getState().markDirty();

        return newDiagram;
      },

      updateDiagram: (diagramId: string, updates: Partial<GrafcetDiagram>) => {
        const timestamp = new Date().toISOString();

        set((state) => ({
          projects: state.projects.map((project) => ({
            ...project,
            diagrams: (project.diagrams || []).map((diagram) =>
              diagram.id === diagramId
                ? { ...diagram, ...updates, updatedAt: timestamp }
                : diagram
            ),
            updatedAt: (project.diagrams || []).some((d) => d.id === diagramId) ? timestamp : project.updatedAt,
          })),
        }));

        // Mark as dirty - user needs to save explicitly
        useSaveStatusStore.getState().markDirty();
      },

      deleteDiagram: (diagramId: string) => {
        set((state) => {
          const timestamp = new Date().toISOString();

          return {
            projects: state.projects.map((project) => ({
              ...project,
              diagrams: (project.diagrams || []).filter((diagram) => diagram.id !== diagramId),
              updatedAt: (project.diagrams || []).some((d) => d.id === diagramId) ? timestamp : project.updatedAt,
            })),
            currentDiagramId: state.currentDiagramId === diagramId ? null : state.currentDiagramId,
          };
        });

        // Mark as dirty
        useSaveStatusStore.getState().markDirty();
      },

      setCurrentDiagram: (diagramId: string) => {
        console.debug('📊 Setting current diagram:', diagramId);
        set({ currentDiagramId: diagramId });
      },

      // Export/Import
      exportProject: (projectId: string) => {
        const project = get().projects.find((p) => p.id === projectId);
        if (!project) return '';

        return JSON.stringify(project, null, 2);
      },

      importProject: (jsonData: string) => {
        try {
          const project = JSON.parse(jsonData) as GrafcetProject;
          get().loadProject(project);
          return project;
        } catch (error) {
          console.error('Failed to import project:', error);
          throw new Error('Invalid project data');
        }
      },

      saveProject: async (projectId: string) => {
        try {
          const project = get().projects.find((p) => p.id === projectId);
          if (!project) {
            console.error('Project not found');
            return false;
          }

          if (!project.localPath) {
            console.warn('Cannot save project: No local path specified.');
            // We might want to trigger a "Save As" flow here in the future
            return false;
          }

          useSaveStatusStore.getState().startSaving();

          // Inject current simulation data if saving current project
          let projectToSave = { ...project };

          // NOTE: Simulation data is now saved to a separate index.sim file
          // We no longer inject it here to avoid duplication and state issues

          const response = await ApiService.saveProject({
            project: projectToSave,
            type: (projectToSave as any).diagram ? 'gsrsm' : 'grafcet'
          });

          if (response.success) {
            useSaveStatusStore.getState().saveDone();
            console.log('✅ Project saved successfully:', project.name);
            return true;
          } else {
            useSaveStatusStore.getState().saveError('Failed to save project');
            return false;
          }
        } catch (error) {
          console.error('Failed to save project:', error);
          useSaveStatusStore.getState().saveError('Save failed');
          return false;
        }
      },

      // Sync to localStorage
      syncToLocalStorage: () => {
        // No-op - removed local storage sync
      },

      // Getters
      getCurrentProject: () => {
        const { projects, currentProjectId } = get();
        return projects.find((p) => p.id === currentProjectId) || null;
      },

      getCurrentDiagram: () => {
        const currentProject = get().getCurrentProject();
        if (!currentProject) return null;

        const { currentDiagramId } = get();
        return currentProject.diagrams?.find((d) => d.id === currentDiagramId) || null;
      },
    }),
    {
      name: 'grafcet-project-store',
      partialize: (state) => ({
        projects: state.projects.map(project => ({
          ...project,
          diagrams: project.diagrams?.map(diagram => ({
            ...diagram,
            elements: [] // Elements too large for localStorage, reload from file
          }))
        })),
        currentProjectId: state.currentProjectId,
        currentDiagramId: state.currentDiagramId,
        // remoteProjects: omitted from localStorage to ensure fresh fetch
      }),
      onRehydrateStorage: () => (state) => {
        // After store is rehydrated from localStorage, load simulation and vibe chat data
        if (state?.currentProjectId) {
          const project = state.projects.find(p => p.id === state.currentProjectId);
          if (project?.localPath) {
            console.log('[ProjectStore] 🔄 Rehydrated - loading simulation data for:', project.localPath);
            import('./useSimulationStore').then(({ useSimulationStore }) => {
              useSimulationStore.getState().loadSimulation(project.localPath!);
            });

            console.log('[ProjectStore] 🔄 Rehydrated - loading Vibe Chat data for:', project.localPath);
            import('./useVibeChatStore').then(({ useVibeChatStore }) => {
              // Use setProjectPath instead of loadConversations for proper protection
              useVibeChatStore.getState().setProjectPath(project.localPath!);
            });
          }
        }
      },
    }
  )
);
