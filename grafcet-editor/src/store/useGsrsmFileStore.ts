import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { GrafcetDiagram } from '../models/types';
import { ApiService } from '../services/apiService';
import { useSaveStatusStore } from './useSaveStatusStore';
import { useElementsStore } from './useElementsStore';
import { useAutoSaveStore } from './useAutoSaveStore';

interface GsrsmFileState {
  // Current file state
  currentFilePath: string | null;
  currentDiagram: GrafcetDiagram | null;

  // Loading state for refresh handling
  isLoadingDiagram: boolean;
  diagramLoadError: string | null;

  // Internal
  _saveTimeout?: any;

  // Actions
  loadFile: (filePath: string) => Promise<boolean>;
  saveCurrentFile: () => Promise<boolean>;
  requestAutoSave: () => Promise<void>;
  updateCurrentDiagram: (updates: Partial<GrafcetDiagram>) => void;
  setCurrentFile: (filePath: string, diagram: GrafcetDiagram) => void;
  clearCurrentFile: () => void;

  // Refresh restoration action
  restoreCurrentDiagram: () => Promise<boolean>;
}

export const useGsrsmFileStore = create<GsrsmFileState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentFilePath: null,
      currentDiagram: null,
      isLoadingDiagram: false,
      diagramLoadError: null,

      // Load a file from the file system
      loadFile: async (filePath: string) => {
        try {
          console.group(`📂 [GsrsmFileStore] Loading file: ${filePath}`);

          // 1. Save current file if dirty
          const saveStatus = useSaveStatusStore.getState();
          if (get().currentFilePath && saveStatus.isDirty) {
            console.log('📝 Saving current file before switching...');
            const saved = await get().saveCurrentFile();
            if (!saved) {
              console.error('❌ Failed to save current file before switching. Proceeding anyway...');
            }
          }

          // 2. Reset save status for new file
          useSaveStatusStore.getState().reset();

          // 3. CLEAR STATE to ensure isolation
          const { clearElements, loadElements } = useElementsStore.getState();
          clearElements(true); // Silent clear

          // 4. Update current path immediately
          console.log('🔄 Setting currentFilePath to:', filePath);
          set({
            currentFilePath: filePath,
            currentDiagram: null // Temporary null while loading
          });

          // 5. Load the new file
          console.log('📡 Calling ApiService.loadDiagram...');
          const response = await ApiService.loadDiagram({ diagramPath: filePath });

          if (response.success && response.diagram) {
            if (filePath.endsWith('.gsrsm')) {
              // Special handling for Gsrsm files - they contain the entire project structure
              console.log('📦 Loading Gsrsm project structure...');
              const project = response.diagram as any;

              // Update Gsrsm store
              const GsrsmStore = (await import('./useGsrsmStore')).useGsrsmStore;
              GsrsmStore.getState().loadProject(project);

              // Sync with file store diagram view
              if (project.diagram) {
                set({ currentDiagram: project.diagram });
              }

              console.log('✅ Gsrsm project loaded successfully:', filePath);
              console.groupEnd();
              return true;
            } else {
              // Standard SFC handling
              const diagram = response.diagram as unknown as GrafcetDiagram;

              // 6. Update store with new diagram
              console.log('📊 Updating store with new diagram...');
              set({ currentDiagram: diagram });

              // 7. Load elements into the elements store
              if (diagram.elements) {
                console.log(`🧩 Loading ${diagram.elements.length} elements...`);
                loadElements(diagram.elements);
              }

              console.log('✅ File loaded successfully:', filePath);
              console.groupEnd();
              return true;
            }
          } else {
            console.error('❌ Failed to load diagram:', response.error);
            set({ currentFilePath: null });
            console.groupEnd();
            return false;
          }
        } catch (error) {
          console.error('❌ Error loading file:', error);
          set({ currentFilePath: null });
          console.groupEnd();
          return false;
        }
      },



      // Save the current file to the file system (explicit save)
      saveCurrentFile: async () => {
        try {
          const { currentFilePath, currentDiagram } = get();

          if (!currentFilePath || !currentDiagram) {
            console.warn('No current file to save');
            return false;
          }

          // Get current elements from the elements store
          const elements = useElementsStore.getState().elements;
          const diagramToSave = {
            ...currentDiagram,
            elements,
            updatedAt: new Date().toISOString()
          };

          useSaveStatusStore.getState().startSaving();

          const response = await ApiService.saveDiagram({
            diagramPath: currentFilePath,
            diagram: diagramToSave as unknown as Record<string, unknown>
          });

          if (response.success) {
            // Update the stored diagram with the saved version
            set({ currentDiagram: diagramToSave });
            useSaveStatusStore.getState().saveDone();
            console.log('✅ File saved successfully:', currentFilePath);
            return true;
          } else {
            console.error('Failed to save diagram:', response.error);
            useSaveStatusStore.getState().saveError(response.error || 'Save failed');
            return false;
          }
        } catch (error) {
          console.error('Error saving current file:', error);
          useSaveStatusStore.getState().saveError('Save failed');
          return false;
        }
      },

      requestAutoSave: async () => {
        const { currentFilePath } = get();
        if (!currentFilePath) return;

        // Trigger debounce save
        useAutoSaveStore.getState().setSaving();

        const state = get();
        if (state._saveTimeout) {
          clearTimeout(state._saveTimeout);
        }

        const timeout = setTimeout(async () => {
          try {
            const success = await get().saveCurrentFile();
            if (success) {
              useAutoSaveStore.getState().setSaved();
            } else {
              useAutoSaveStore.getState().setError('Auto-save failed');
            }
          } catch (error) {
            console.error('Auto-save error:', error);
            useAutoSaveStore.getState().setError('Auto-save error');
          }
        }, 500); // 500ms debounce

        set({ _saveTimeout: timeout });
      },

      // Update the current diagram (marks as dirty, no auto-save)
      updateCurrentDiagram: (updates: Partial<GrafcetDiagram>) => {
        const { currentDiagram } = get();
        if (!currentDiagram) return;

        const updatedDiagram = { ...currentDiagram, ...updates };
        set({ currentDiagram: updatedDiagram });

        // Mark as dirty - user needs to save explicitly
        useSaveStatusStore.getState().markDirty();
      },

      // Set current file without loading from file system (for new files)
      setCurrentFile: (filePath: string, diagram: GrafcetDiagram) => {
        // Reset save status
        useSaveStatusStore.getState().reset();

        // Clear editor (SILENTLY to avoid syncing empty state)
        const { clearElements, loadElements } = useElementsStore.getState();
        clearElements(true);

        // Set new file
        set({
          currentFilePath: filePath,
          currentDiagram: diagram
        });

        // Load provided elements
        if (diagram.elements) {
          loadElements(diagram.elements);
        }
      },

      // Clear current file state
      clearCurrentFile: () => {
        useSaveStatusStore.getState().reset();

        set({
          currentFilePath: null,
          currentDiagram: null,
          isLoadingDiagram: false,
          diagramLoadError: null
        });

        // Clear elements store - Silent clear
        useElementsStore.getState().clearElements(true);
      },

      /**
       * Restore the current diagram from backend after browser refresh.
       * This function is called during app initialization when we have a persisted
       * filePath but no diagram data (because diagram is not persisted).
       *
       * Returns true if restoration was successful, false otherwise.
       */
      restoreCurrentDiagram: async () => {
        const { currentFilePath, currentDiagram, isLoadingDiagram } = get();

        // If already loading or no file path, skip
        if (isLoadingDiagram) {
          console.log('🔄 [GsrsmFileStore] Already loading diagram, skipping restore');
          return false;
        }

        if (!currentFilePath) {
          console.log('📭 [GsrsmFileStore] No file path to restore');
          return false;
        }

        // If diagram is already loaded with elements, skip restore
        if (currentDiagram && currentDiagram.elements && currentDiagram.elements.length > 0) {
          console.log('✅ [GsrsmFileStore] Diagram already loaded with elements, skipping restore');
          return true;
        }

        // Check if elements store already has elements (might have been restored from separate persistence)
        const elementsInStore = useElementsStore.getState().elements;
        if (elementsInStore.length > 0) {
          console.log('✅ [GsrsmFileStore] Elements already in store, skipping backend restore');
          return true;
        }

        console.log(`🔄 [GsrsmFileStore] Restoring diagram from: ${currentFilePath}`);
        set({ isLoadingDiagram: true, diagramLoadError: null });

        try {
          const response = await ApiService.loadDiagram({ diagramPath: currentFilePath });

          if (response.success && response.diagram) {
            if (currentFilePath.endsWith('.gsrsm')) {
              // GSRSM file handling
              const project = response.diagram as any;
              const GsrsmStore = (await import('./useGsrsmStore')).useGsrsmStore;
              GsrsmStore.getState().loadProject(project);

              if (project.diagram) {
                set({
                  currentDiagram: project.diagram,
                  isLoadingDiagram: false,
                  diagramLoadError: null
                });
              }
              console.log('✅ [GsrsmFileStore] GSRSM project restored successfully');
              return true;
            } else {
              // Standard SFC handling
              const diagram = response.diagram as unknown as GrafcetDiagram;
              set({
                currentDiagram: diagram,
                isLoadingDiagram: false,
                diagramLoadError: null
              });

              if (diagram.elements) {
                console.log(`🧩 [GsrsmFileStore] Restored ${diagram.elements.length} elements`);
                useElementsStore.getState().loadElements(diagram.elements);
              }

              console.log('✅ [GsrsmFileStore] SFC diagram restored successfully');
              return true;
            }
          } else {
            const error = response.error || 'Failed to load diagram from backend';
            console.error('❌ [GsrsmFileStore] Restore failed:', error);
            // Clear the stale file path so we don't keep retrying a non-existent file
            set({
              currentFilePath: null,
              isLoadingDiagram: false,
              diagramLoadError: error
            });
            return false;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('❌ [GsrsmFileStore] Restore error:', errorMessage);
          // Clear the stale file path so it doesn't cause repeated failures
          set({
            currentFilePath: null,
            isLoadingDiagram: false,
            diagramLoadError: errorMessage
          });
          return false;
        }
      }
    }),
    {
      name: 'Gsrsm-file-store',
      partialize: (state) => ({
        // Only persist the file path - elements reload from Flydrive
        currentFilePath: state.currentFilePath
      }),
      onRehydrateStorage: () => (state) => {
        // Log when store is rehydrated for debugging
        if (state?.currentFilePath) {
          console.log('[GsrsmFileStore] 🔄 Rehydrated with file path:', state.currentFilePath);
        }
      }
    }
  )
);
