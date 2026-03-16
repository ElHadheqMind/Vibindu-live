import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { GrafcetProject } from '../models/types';
import Canvas from './Canvas/Canvas';
import GsrsmEditor from './Gsrsm/GsrsmEditor';
import TopMenu from './Menu/TopMenu';
import StatusBar from './Menu/StatusBar';

import FileExplorer from './FileExplorer/FileExplorer';
import MiniMap from './Canvas/MiniMap';
import WelcomeScreen from './Welcome/WelcomeScreen';
import PopupManager from './UI/PopupManager';
import Toast from './UI/Toast';
import CreateProjectModal from './UI/CreateProjectModal';
import { useProjectStore } from '../store/useProjectStore';
import {
  restoreApplicationState,
  updateAppState,
  syncAppState,
  validatePersistedState
} from '../utils/stateRestoration';
import { useGsrsmStore } from '../store/useGsrsmStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useLanguage } from '../context/LanguageContext';
import '../utils/stateRestoration';
import { ApiService } from '../services/apiService';

import { useGsrsmFileStore } from '../store/useGsrsmFileStore';
import { useCreateProjectModalStore } from '../store/useCreateProjectModalStore';
import { useEditorStore } from '../store/useEditorStore';
import ActionPropertiesModal from './Modals/ActionPropertiesModal';
import TransitionPropertiesModal from './Modals/TransitionPropertiesModal';
import SimulationPanel from './Simulation/SimulationPanel';
import { useSimulationStore } from '../store/useSimulationStore';
import { useFileExplorerStore } from '../store/useFileExplorerStore';
import VibeSidebar from './VibeSidebar';
import MarkdownViewer from './Editors/MarkdownViewer';
import MediaViewer, { isImageFile, isVideoFile } from './Editors/MediaViewer';
import HtmlViewer from './Editors/HtmlViewer';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

const AppContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  margin: 0;
  padding: 0;
  background-color: ${props => props.theme.background};
  color: ${props => props.theme.text};
`;

const EditorLayout = styled.div`
  flex: 1;
  position: relative;
  overflow: hidden;
  width: 100%;
  padding: 0;
  margin: 0;
  display: flex;
`;

const SidebarContainer = styled.div<{ $isVisible: boolean }>`
  width: ${props => props.$isVisible ? '240px' : '0'};
  min-width: ${props => props.$isVisible ? '240px' : '0'};
  background-color: ${props => props.theme.surface};
  border-right: ${props => props.$isVisible ? `1px solid ${props.theme.border}` : 'none'};
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s ease, min-width 0.2s ease;
  z-index: 50;
`;

const EditorContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const MainContent = styled.div`
  flex: 1;
  position: relative;
  overflow: hidden;
`;

// Editor mode type
type EditorType = 'grafcet' | 'gsrsm';

// Type for location state
interface LocationState {
  editorType?: 'grafcet' | 'gsrsm';
  projectCreated?: boolean;
  projectOpened?: boolean;
  switchFromGsrsm?: boolean;
  switchFromGrafcet?: boolean;
  projectClosed?: boolean;
  forceWelcome?: boolean;
}

const MainApp: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Helper to get project path from URL (supports both path and legacy query param)
  const getProjectPath = () => {
    const queryParam = searchParams.get('project');
    if (queryParam) return queryParam;

    // If path is not a reserved route or root, treat as project path
    const path = location.pathname;
    if (path === '/' || path === '/welcome') return null;

    // Remove leading slash and decode
    return decodeURIComponent(path.substring(1));
  };

  const projectParam = getProjectPath();

  const stageRef = useRef<any>(null);
  const { t } = useLanguage();
  const { isOpen: isCreateProjectModalOpen, closeModal: closeCreateProjectModal } = useCreateProjectModalStore();
  const { editingActionId, setEditingActionId, editingTransitionId, setEditingTransitionId } = useEditorStore();

  const state = location.state as LocationState | null;
  const isFromProjectAction = state?.editorType && (state?.projectCreated || state?.projectOpened);

  const [isInitialized, setIsInitialized] = useState(false);
  // Show welcome if on /welcome OR on / with no project (avoids needing a redirect)
  const [showWelcome, setShowWelcome] = useState(
    // Show welcome if: on /welcome WITH NO project param, or on / with no project param
    // If there's a project param, we're loading a specific project — don't show welcome
    !projectParam && (location.pathname === '/welcome' || location.pathname === '/')
  );
  const [editorType, setEditorType] = useState<EditorType>('grafcet');
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [vibeSidebarOpen, setVibeSidebarOpen] = useState(false);
  const [basePath, setBasePath] = useState<string>('');
  const [openedMarkdownFile, setOpenedMarkdownFile] = useState<string | null>(null);
  const [openedMediaFile, setOpenedMediaFile] = useState<string | null>(null);
  const [openedHtmlFile, setOpenedHtmlFile] = useState<string | null>(null);

  useEffect(() => {
    const fetchBasePath = async () => {
      try {
        const response = await ApiService.getDrives();
        if (response.success && response.drives && response.drives.length > 0) {
          setBasePath(response.drives[0].path);
          console.debug('📂 Base path loaded:', response.drives[0].path);
        }
      } catch (error) {
        console.error('Failed to load base path:', error);
      }
    };
    fetchBasePath();
  }, []);

  const toRelativePath = (absolutePath: string): string => {
    if (!basePath || !absolutePath) return absolutePath;

    const normalize = (p: string) => {
      let n = p.replace(/\\/g, '/');
      if (n.match(/^[a-zA-Z]:/)) n = n[0].toLowerCase() + n.slice(1);
      return n;
    };

    const normalizedBase = normalize(basePath);
    const normalizedPath = normalize(absolutePath);

    if (normalizedPath.startsWith(normalizedBase)) {
      let relative = normalizedPath.substring(normalizedBase.length);
      if (relative.startsWith('/')) relative = relative.substring(1);
      return relative;
    }
    return absolutePath;
  };

  const toAbsolutePath = (relativePath: string): string => {
    if (!basePath || !relativePath) return relativePath;

    // If it's already absolute (contains drive letter or starts with /)
    if (relativePath.match(/^[a-zA-Z]:/) || relativePath.startsWith('/') || relativePath.startsWith('\\')) {
      return relativePath.replace(/\\/g, '/');
    }

    const normalizedBase = basePath.replace(/\\/g, '/').replace(/\/$/, '');
    const normalizedRelative = relativePath.replace(/\\/g, '/').replace(/^\//, '');

    return `${normalizedBase}/${normalizedRelative}`;
  };

  useKeyboardShortcuts();

  // Auto-refresh IO, FileExplorer every 5 seconds when a project is open
  useAutoRefresh({
    interval: 5000,
    enabled: true,
    refreshIO: true,
    refreshFileExplorer: true,
    refreshDiagram: false, // Don't auto-refresh diagram to avoid overwriting user edits
  });

  const currentProjectId = useProjectStore(st => st.currentProjectId);
  const gsrsmProject = useGsrsmStore(st => st.project);

  // Track if diagram restoration has been attempted (to avoid duplicate calls)
  const diagramRestorationAttempted = useRef(false);

  // Core initialization effect - runs ONCE on mount, does NOT depend on basePath
  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.debug('🚀 Initializing MainApp core...');
        validatePersistedState();

        // Initialize WebSocket listeners for file explorer
        useFileExplorerStore.getState().initializeListeners();

        if (isFromProjectAction && state.editorType) {
          setEditorType(state.editorType);
          setShowWelcome(false);
          updateAppState({
            editorType: state.editorType,
            showWelcome: false,
            currentProjectId: useProjectStore.getState().currentProjectId,
            currentDiagramId: useProjectStore.getState().currentDiagramId,
          });
        } else {
          const projectParam = getProjectPath();
          if (projectParam) {
            setShowWelcome(false);
            setEditorType(projectParam.endsWith('.gsrsm') ? 'gsrsm' : 'grafcet');
            updateAppState({
              showWelcome: false,
              editorType: projectParam.endsWith('.gsrsm') ? 'gsrsm' : 'grafcet',
            });
          } else if (location.pathname === '/welcome') {
            setShowWelcome(true);
          } else {
            // No project in URL, restore from localStorage
            const restoredState = restoreApplicationState();
            setEditorType(restoredState.editorType);
            setShowWelcome(restoredState.showWelcome);

            // CRITICAL FIX: Restore diagram from backend immediately if we have a stored file path
            // This does NOT require basePath - it uses the absolute path stored in the store
            const storedFilePath = useGsrsmFileStore.getState().currentFilePath;
            if (storedFilePath && !restoredState.showWelcome && !diagramRestorationAttempted.current) {
              console.debug('🔄 [MainApp] Browser refresh detected - restoring diagram from backend:', storedFilePath);
              diagramRestorationAttempted.current = true;

              // Use the new restoration function that reloads from backend
              const restored = await useGsrsmFileStore.getState().restoreCurrentDiagram();
              if (restored) {
                console.log('✅ [MainApp] Diagram restored successfully on refresh');
              } else {
                console.warn('⚠️ [MainApp] Diagram restoration failed - showing welcome screen');
                // File no longer exists (stale path cleared in store) — show welcome
                setShowWelcome(true);
                diagramRestorationAttempted.current = false;
              }
            } else {
              // Handle project-based restoration (legacy)
              const currentProjId = useProjectStore.getState().currentProjectId;
              const currentProject = useProjectStore.getState().getCurrentProject();
              if (currentProjId && currentProject?.localPath && !restoredState.showWelcome) {
                console.debug('📂 Reloading project:', currentProject.name);
                const result = await ApiService.loadProject({ projectPath: currentProject.localPath });
                if (result.success && result.project) {
                  const loadedProject = result.project as GrafcetProject;
                  loadedProject.localPath = currentProject.localPath;
                  await useProjectStore.getState().loadProject(loadedProject);
                }
              }
            }
          }
        }
        setIsInitialized(true);
      } catch (error) {
        console.error('❌ Initialization failed:', error);
        setIsInitialized(true);
      }
    };
    initializeApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFromProjectAction, state]);

  // Separate effect to handle basePath-dependent operations (URL sync, file explorer)
  useEffect(() => {
    if (!basePath || !isInitialized) return;

    const syncWithBasePath = async () => {
      const storedFilePath = useGsrsmFileStore.getState().currentFilePath;
      const projectParam = getProjectPath();

      // If we have a stored file path but diagram restoration failed earlier, retry now
      if (storedFilePath && !diagramRestorationAttempted.current) {
        console.debug('🔄 [MainApp] Retrying diagram restoration with basePath:', storedFilePath);
        diagramRestorationAttempted.current = true;
        await useGsrsmFileStore.getState().restoreCurrentDiagram();
      }

      // Sync URL with stored file path if needed
      if (storedFilePath && !showWelcome) {
        const relativePath = toRelativePath(storedFilePath);
        if (projectParam !== relativePath) {
          console.debug('🔗 [MainApp] Syncing URL with stored file path:', relativePath);
          navigate('/' + relativePath, { replace: true });
        }
      }
    };

    syncWithBasePath();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath, isInitialized]);

  // Handle URL project parameter/path changes smoothly
  useEffect(() => {
    const projectParam = getProjectPath();

    if (projectParam && isInitialized && basePath) {
      console.debug('🔗 URL project path changed:', projectParam);
      // Use force: false to prevent redundant reloads from URL sync
      handleFileSelect(projectParam, false);
    }
  }, [location.pathname, searchParams.get('project'), isInitialized, basePath]);


  useEffect(() => {
    if (isInitialized) {
      syncAppState(editorType, showWelcome);

      // Sync URL with welcome state
      if (showWelcome && location.pathname !== '/welcome') {
        const projectParam = getProjectPath();
        if (!projectParam) {
          navigate('/welcome', { replace: true });
        }
      } else if (!showWelcome && location.pathname === '/welcome') {
        navigate('/', { replace: true });
      }
    }
  }, [isInitialized, editorType, showWelcome, currentProjectId, gsrsmProject, location.pathname]);

  useEffect(() => {
    const s = location.state as LocationState | null;
    if (s?.editorType) {
      if (s.switchFromGsrsm || s.switchFromGrafcet || s.projectCreated || s.projectOpened) {
        setEditorType(s.editorType);
        window.history.replaceState({}, document.title);
      }
    }
    if (s?.projectClosed || s?.forceWelcome) {
      setShowWelcome(true);
      setEditorType('grafcet');
      updateAppState({ showWelcome: true, editorType: 'grafcet', currentProjectId: null });
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleWelcomeClose = () => {
    setShowWelcome(false);
    updateAppState({ showWelcome: false });
    if (location.pathname === '/welcome') {
      window.history.replaceState({}, '', '/');
    }
  };

  const handleEditorSelect = (type: EditorType) => {
    setEditorType(type);
    setShowWelcome(false);
    updateAppState({ editorType: type, showWelcome: false });
  };

  const handleFileSelect = async (filePath: string, force: boolean = false) => {
    console.debug(`📂 handleFileSelect called for: ${filePath} (force=${force}, basePath=${basePath})`);

    if (!filePath) {
      console.warn('❌ handleFileSelect aborted: No filePath');
      return;
    }

    // We strictly require basePath to be loaded before we can reliably resolve paths
    if (!basePath) {
      console.warn('❌ handleFileSelect aborted: No basePath set yet');
      return;
    }

    // Normalize paths for reliable comparison
    const normalize = (p: string) => p.replace(/\\/g, '/').toLowerCase();
    const absolutePath = toAbsolutePath(filePath).replace(/\\/g, '/');
    const normalizedTarget = normalize(absolutePath);

    // Sync to File Explorer Store
    useFileExplorerStore.getState().setSelected(absolutePath);

    // Auto-expand parents
    const parts = absolutePath.split('/');
    if (parts.length > 1) {
      let currentPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!part && i === 0) { currentPath = '/'; continue; }
        currentPath += (currentPath && !currentPath.endsWith('/') ? '/' : '') + part;
        useFileExplorerStore.getState().setExpanded(currentPath, true);
      }
    }

    // Update URL smoothly (preserving readable slashes)
    const relativePath = toRelativePath(absolutePath).replace(/\\/g, '/');
    const currentProjectParam = getProjectPath();

    if (currentProjectParam !== relativePath) {
      console.debug('🚗 Updating URL to match selected file:', relativePath);
      // Use navigate to update the path
      navigate('/' + relativePath, { replace: true });
    }

    // Determine if path is a file (has recognized extension) or a project directory
    const lowerPath = absolutePath.toLowerCase();
    const isMarkdownFile = lowerPath.endsWith('.md');
    const isMedia = isImageFile(absolutePath) || isVideoFile(absolutePath);
    const isFile = lowerPath.endsWith('.sfc') || lowerPath.endsWith('.gsrsm') || lowerPath.endsWith('.json');

    // Handle markdown files - open in viewer
    if (isMarkdownFile) {
      setOpenedMarkdownFile(absolutePath);
      setOpenedMediaFile(null);
      setOpenedHtmlFile(null);
      setShowWelcome(false);
      return;
    }

    // Handle HTML files - open in viewer
    if (lowerPath.endsWith('.html')) {
      setOpenedHtmlFile(absolutePath);
      setOpenedMarkdownFile(null);
      setOpenedMediaFile(null);
      setShowWelcome(false);
      return;
    }

    // Handle media files - open in viewer
    if (isMedia) {
      setOpenedMediaFile(absolutePath);
      setOpenedMarkdownFile(null);
      setOpenedHtmlFile(null);
      setShowWelcome(false);
      return;
    }

    // Close viewers if opening other file types
    if (openedMarkdownFile) {
      setOpenedMarkdownFile(null);
    }
    if (openedMediaFile) {
      setOpenedMediaFile(null);
    }
    if (openedHtmlFile) {
      setOpenedHtmlFile(null);
    }

    if (isFile) {
      // Load file if it's not already the current one OR if forced
      const currentPathInStore = useGsrsmFileStore.getState().currentFilePath;
      const isAlreadyLoaded = currentPathInStore && normalize(currentPathInStore) === normalizedTarget;

      if (force || !isAlreadyLoaded) {
        console.debug(`📥 Loading file (force=${force}, alreadyLoaded=${!!isAlreadyLoaded}):`, absolutePath);
        setShowWelcome(false);
        const isGsrsm = absolutePath.endsWith('.gsrsm');
        const targetType = isGsrsm ? 'gsrsm' : 'grafcet';

        if (editorType !== targetType) {
          setEditorType(targetType);
          updateAppState({ editorType: targetType, showWelcome: false });
        }

        await useGsrsmFileStore.getState().loadFile(absolutePath);
      } else {
        console.debug('⏭️ File already loaded, skipping redundant load:', absolutePath);
        // Still dismiss welcome screen if it's open
        if (showWelcome) setShowWelcome(false);
      }
    } else {
      // Path is a project directory - load via project API
      const currentGrafcetProject = useProjectStore.getState().getCurrentProject();
      const currentGsrsmProject = useGsrsmStore.getState().project;
      const currentLoadedPath = currentGrafcetProject?.localPath || currentGsrsmProject?.localPath || '';
      const isAlreadyLoaded = currentLoadedPath && normalize(currentLoadedPath) === normalizedTarget;

      if (force || !isAlreadyLoaded) {
        console.debug(`📥 Loading project directory (force=${force}, alreadyLoaded=${!!isAlreadyLoaded}):`, absolutePath);
        setShowWelcome(false);
        try {
          const response = await ApiService.loadProject({ projectPath: absolutePath });
          if (response.success && response.project) {
            const project = response.project;
            const isGrafcet = (project as any).diagrams !== undefined;

            if (isGrafcet) {
              const grafcetProject = project as GrafcetProject;
              if (!grafcetProject.localPath) grafcetProject.localPath = absolutePath;
              await useProjectStore.getState().loadProject(grafcetProject);
              if (editorType !== 'grafcet') {
                setEditorType('grafcet');
                updateAppState({ editorType: 'grafcet', showWelcome: false });
              }
            } else {
              const gsrsmProj = project as any;
              if (!gsrsmProj.localPath) gsrsmProj.localPath = absolutePath;
              useGsrsmStore.getState().loadProject(gsrsmProj);
              if (editorType !== 'gsrsm') {
                setEditorType('gsrsm');
                updateAppState({ editorType: 'gsrsm', showWelcome: false });
              }
            }
          } else {
            console.error('❌ Failed to load project directory:', response.error);
          }
        } catch (error) {
          console.error('❌ Error loading project directory:', error);
        }
      } else {
        console.debug('⏭️ Project already loaded, skipping redundant load:', absolutePath);
        // Still dismiss welcome screen if it's open
        if (showWelcome) setShowWelcome(false);
      }
    }
  };

  if (!isInitialized) {
    return (
      <AppContainer>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#1976d2' }}>
          {t('COMMON.LOADING')}
        </div>
      </AppContainer>
    );
  }

  return (
    <AppContainer>
      <TopMenu
        stageRef={stageRef}
        onToggleVibe={() => setVibeSidebarOpen(!vibeSidebarOpen)}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
        showAI={!showWelcome}
      />
      <EditorLayout>
        <SidebarContainer $isVisible={sidebarVisible && !showWelcome}>
          <FileExplorer onFileSelect={handleFileSelect} />
        </SidebarContainer>
        <EditorContainer>
          <MainContent>
            {openedMarkdownFile ? (
              <MarkdownViewer
                filePath={openedMarkdownFile}
                onClose={() => setOpenedMarkdownFile(null)}
              />
            ) : openedMediaFile ? (
              <MediaViewer
                filePath={openedMediaFile}
                onClose={() => setOpenedMediaFile(null)}
              />
            ) : openedHtmlFile ? (
              <HtmlViewer 
                filePath={openedHtmlFile}
                onClose={() => setOpenedHtmlFile(null)}
              />
            ) : editorType === 'grafcet' ? (
              <>
                <Canvas ref={stageRef} />
                {useSimulationStore.getState().showSimulationPanel && <SimulationPanel />}

                <MiniMap
                  canvasWidth={window.innerWidth - (sidebarVisible ? 288 : 48)}
                  canvasHeight={window.innerHeight - 156}
                  stageRef={stageRef}
                />
              </>
            ) : (
              <GsrsmEditor />
            )}
            <StatusBar />
            {showWelcome && <WelcomeScreen onClose={handleWelcomeClose} onSelectEditor={handleEditorSelect} />}
          </MainContent>
        </EditorContainer>
        {!showWelcome && <VibeSidebar isOpen={vibeSidebarOpen} onClose={() => setVibeSidebarOpen(false)} />}
      </EditorLayout>
      <PopupManager />
      <Toast />
      <CreateProjectModal isOpen={isCreateProjectModalOpen} onClose={closeCreateProjectModal} />
      {editingActionId && <ActionPropertiesModal actionId={editingActionId} onClose={() => setEditingActionId(null)} />}
      {editingTransitionId && <TransitionPropertiesModal transitionId={editingTransitionId} onClose={() => setEditingTransitionId(null)} />}
    </AppContainer>
  );
};

export default MainApp;
