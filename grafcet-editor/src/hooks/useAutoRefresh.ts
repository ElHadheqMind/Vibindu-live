import { useEffect, useRef, useCallback } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { useSimulationStore } from '../store/useSimulationStore';
import { useFileExplorerStore } from '../store/useFileExplorerStore';
import { useElementsStore } from '../store/useElementsStore';
import { useGsrsmFileStore } from '../store/useGsrsmFileStore';
import { useGsrsmStore } from '../store/useGsrsmStore';
import { useSocketStore } from '../store/useSocketStore';
import { ApiService } from '../services/apiService';

// Default refresh interval: 2 seconds for guaranteed updates
const DEFAULT_REFRESH_INTERVAL = 2000;

interface AutoRefreshOptions {
  interval?: number;
  enabled?: boolean;
  refreshIO?: boolean;
  refreshFileExplorer?: boolean;
  refreshDiagram?: boolean;
}

/**
 * Hook that automatically refreshes data from files at a specified interval.
 * Refreshes: IO (simulation), FileExplorer, and optionally the current diagram.
 */
export function useAutoRefresh(options: AutoRefreshOptions = {}) {
  const {
    interval = DEFAULT_REFRESH_INTERVAL,
    enabled = true,
    refreshIO = true,
    refreshFileExplorer = true,
    refreshDiagram = false, // Disabled by default to avoid overwriting user changes
  } = options;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRefreshRef = useRef<number>(0);

  // Get current project path from EITHER store (Grafcet or GSRSM)
  const currentProjectId = useProjectStore(state => state.currentProjectId);
  const projects = useProjectStore(state => state.projects);
  const grafcetProject = projects.find(p => p.id === currentProjectId);
  const gsrsmProject = useGsrsmStore(state => state.project);

  // Resolve the active project's localPath — check both stores
  const activeProjectPath = grafcetProject?.localPath || gsrsmProject?.localPath || null;

  // Refresh IO/Simulation data
  const refreshIOData = useCallback(async () => {
    if (!activeProjectPath) return;

    try {
      await useSimulationStore.getState().loadSimulation(activeProjectPath);
    } catch (error) {
      console.error('[AutoRefresh] Failed to refresh IO data:', error);
    }
  }, [activeProjectPath]);

  // Refresh File Explorer
  const refreshFileExplorerData = useCallback(async () => {
    if (!activeProjectPath) return;

    try {
      await useFileExplorerStore.getState().loadFileTree(activeProjectPath);
    } catch (error) {
      console.error('[AutoRefresh] Failed to refresh file explorer:', error);
    }
  }, [activeProjectPath]);

  // Refresh current diagram (SFC/GRAFCET/GRSM)
  const refreshDiagramData = useCallback(async () => {
    if (!activeProjectPath) return;

    const currentFilePath = useGsrsmFileStore.getState().currentFilePath;
    if (!currentFilePath) return;

    try {
      const result = await ApiService.loadDiagram({ diagramPath: currentFilePath });
      if (result.success && result.diagram) {
        // Update elements store with loaded diagram elements
        if ((result.diagram as any).elements) {
          useElementsStore.getState().loadElements((result.diagram as any).elements);
        }
      }
    } catch (error) {
      console.error('[AutoRefresh] Failed to refresh diagram:', error);
    }
  }, [activeProjectPath]);

  // Main refresh function
  const refresh = useCallback(async () => {
    const now = Date.now();

    // Prevent rapid refreshes (minimum 1 second between refreshes)
    if (now - lastRefreshRef.current < 1000) return;

    // Don't auto-refresh while a diagram is being restored/loaded
    // This prevents interference with initial page load
    const isLoadingDiagram = useGsrsmFileStore.getState().isLoadingDiagram;
    if (isLoadingDiagram) {
      console.debug('[AutoRefresh] Skipping refresh - diagram is loading');
      return;
    }

    lastRefreshRef.current = now;

    const promises: Promise<void>[] = [];

    if (refreshIO) {
      promises.push(refreshIOData());
    }

    if (refreshFileExplorer) {
      promises.push(refreshFileExplorerData());
    }

    if (refreshDiagram) {
      promises.push(refreshDiagramData());
    }

    await Promise.allSettled(promises);
  }, [refreshIO, refreshFileExplorer, refreshDiagram, refreshIOData, refreshFileExplorerData, refreshDiagramData]);

  // Set up event listeners, polling, and initial refresh
  useEffect(() => {
    if (!enabled || !activeProjectPath) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial refresh
    refresh();

    // 1. Set up polling interval as a failsafe
    intervalRef.current = setInterval(refresh, interval);

    // 2. Set up Socket.IO for immediate updates if the connection is alive
    const socketStore = useSocketStore.getState();
    socketStore.connect();

    const handleFileEvent = (data: any) => {
      console.log('[AutoRefresh] 🔄 Real-time file event received:', data);
      
      // Don't auto-refresh while a diagram is being saved
      // To prevent it overwriting just-saved work before the UI settles
      refresh();
    };

    socketStore.subscribe('file:changed', handleFileEvent);
    socketStore.subscribe('file:created', handleFileEvent);
    socketStore.subscribe('file:deleted', handleFileEvent);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      socketStore.unsubscribe('file:changed', handleFileEvent);
      socketStore.unsubscribe('file:created', handleFileEvent);
      socketStore.unsubscribe('file:deleted', handleFileEvent);
    };
  }, [enabled, interval, activeProjectPath, refresh]);

  // Return manual refresh function for on-demand refresh
  return { refresh };
}

