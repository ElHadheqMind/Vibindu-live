import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { FiLogOut, FiUser, FiFolder } from 'react-icons/fi';
import { useProjectStore } from '../../store/useProjectStore';
import { useGsrsmStore } from '../../store/useGsrsmStore';
import { useElementsStore } from '../../store/useElementsStore';
import { useEditorStore } from '../../store/useEditorStore';
import { useHistoryStore } from '../../store/useHistoryStore';
import { usePopupStore } from '../../store/usePopupStore';
import { useCreateProjectModalStore } from '../../store/useCreateProjectModalStore';
import { useGsrsmFileStore } from '../../store/useGsrsmFileStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useLanguage } from '../../context/LanguageContext';
import { exportProjectToJson, exportDiagramToJson, exportProjectToZip } from '../../utils/fileSystem';
import { exportToPng } from '../../utils/exportUtils';
import SimulationModal from '../Simulation/SimulationModal';
import { useSimulationStore } from '../../store/useSimulationStore';


const MenuContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: ${props => props.theme.surface};
  border-bottom: 1px solid ${props => props.theme.border};
  padding: 0;
  height: 48px; 
  user-select: none;
  z-index: 2000;
  position: relative;
`;

const LeftSection = styled.div`
  display: flex;
  align-items: center;
  height: 100%;
  padding-right: 16px;
`;

const RightSection = styled.div`
  display: flex;
  align-items: center;
  height: 100%;
  padding-right: 16px;
`;

const CenterSection = styled.div`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  pointer-events: none; // Let clicks pass through if needed, though usually just text
`;

const Logo = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: ${props => props.theme.primary};
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  pointer-events: auto;

`;

const AppLogoImg = styled.img`
  height: 24px;
  width: auto;
  object-fit: contain;
  mix-blend-mode: multiply;
`;


const MenuItem = styled.div<{ $isActive?: boolean }>`
  padding: 0 12px;
  display: flex;
  align-items: center;
  height: 100%;
  cursor: pointer;
  position: relative;
  color: ${props => props.theme.text};
  background-color: ${props => props.$isActive ? props.theme.surfaceAlt : 'transparent'};
  transition: all ${props => props.theme.transition.fast};
  font-weight: ${props => props.$isActive ? '500' : '400'};
  font-size: 13px;

  &:hover {
    background-color: ${props => props.theme.surfaceAlt};
  }

  &:active {
    background-color: ${props => props.theme.primary}20;
  }

  ${props => props.$isActive && `
    &::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-bottom: 4px solid ${props.theme.primary};
    }
  `}
`;

const MenuGroup = styled.div`
  display: flex;
  position: relative;
  height: 100%;
`;

const MenuDropdown = styled.div<{ $isOpen: boolean }>`
  position: absolute;
  top: 100%;
  left: 0;
  background-color: ${props => props.theme.menuBackground};
  border: 1px solid ${props => props.theme.border};
  border-top: none;
  border-radius: 0 0 6px 6px;
  box-shadow: 0 6px 16px ${props => props.theme.shadow};
  z-index: 10001; 
  min-width: 180px;
  overflow: hidden;
  opacity: ${props => (props.$isOpen ? 1 : 0)};
  visibility: ${props => (props.$isOpen ? 'visible' : 'hidden')};
  transform: ${props => (props.$isOpen ? 'translateY(0)' : 'translateY(-8px)')};
  transition: opacity ${props => props.theme.transition.normal},
              transform ${props => props.theme.transition.normal},
              visibility ${props => props.theme.transition.normal};
`;

const DropdownItem = styled.div<{ disabled?: boolean }>`
  padding: 10px 16px;
  cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
  color: ${props => props.theme.text};
  transition: all ${props => props.theme.transition.fast};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  &:hover {
    background-color: ${(props) => (props.disabled ? 'transparent' : props.theme.menuHover)};
    color: ${(props) => (props.disabled ? props.theme.text : props.theme.primary)};
  }

  &:active {
    background-color: ${(props) => (props.disabled ? 'transparent' : `${props.theme.primary}20`)};
  }

  &:not(:last-child) {
    border-bottom: 1px solid ${props => props.theme.divider};
  }
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: transparent;
  color: ${props => props.theme.text};
  border: none;
  border-radius: 4px;
  padding: 8px;
  cursor: pointer;
  font-size: 14px;
  gap: 6px;
  transition: all ${props => props.theme.transition.fast};
  position: relative;

  &:hover {
    background-color: ${props => props.theme.surfaceAlt};
  }

  &:active {
    transform: ${props => props.theme.scale.active};
  }

  &:focus {
    outline: none;
  }
`;

const UserDropdown = styled(MenuDropdown)`
  left: auto;
  right: 0;
  border-radius: 6px;
  border-top: 1px solid ${props => props.theme.border};
`;

const Divider = styled.div`
  height: 1px;
  background-color: ${props => props.theme.divider};
  margin: 5px 0;
`;

const VerticalDivider = styled.div`
  height: 24px;
  width: 1px;
  background-color: ${props => props.theme.border};
  margin: 0 8px;
`;

const Shortcut = styled.span`
  float: right;
  color: ${props => props.theme.textSecondary};
  font-size: 12px;
  margin-left: 20px;
`;

interface TopMenuProps {
  stageRef: React.RefObject<any>;
  onToggleVibe?: () => void;
  sidebarVisible?: boolean;
  onToggleSidebar?: () => void;
  showAI?: boolean;
}

const TopMenu: React.FC<TopMenuProps> = ({ stageRef, onToggleVibe, sidebarVisible, onToggleSidebar, showAI = true }) => {
  const navigate = useNavigate();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const { isSimulationModalOpen, setSimulationModalOpen } = useSimulationStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Auth & Language
  const { user, logout } = useAuthStore();
  const { language, setLanguage } = useLanguage();

  // Get state from stores
  const {
    currentProjectId,
    getCurrentProject,
    getCurrentDiagram,
    createDiagram,
    importProject,
  } = useProjectStore();

  const { project: gsrsmProject } = useGsrsmStore();
  const { elements } = useElementsStore();

  const {
    zoomIn,
    zoomOut,
    resetView,
    toggleSnapToGrid,
    snapToGrid,
  } = useEditorStore();

  const { canUndo, canRedo, undo, redo } = useHistoryStore();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
      }
    };

    if (openMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscapeKey);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [openMenu]);

  // Toggle menu open/close
  const toggleMenu = (menu: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    setOpenMenu(openMenu === menu ? null : menu);
  };

  // Close all menus
  const closeMenus = () => {
    setOpenMenu(null);
  };

  // --- Handlers ---

  const getActiveDiagram = () => {
    return getCurrentDiagram() || useGsrsmFileStore.getState().currentDiagram;
  };

  const handleNewProject = () => { closeMenus(); useCreateProjectModalStore.getState().openModal(); };
  const handleOpenProject = () => { closeMenus(); navigate('/open-project'); };
  const handleNewDiagram = () => {
    closeMenus();
    if (!currentProjectId) {
      usePopupStore.getState().showWarning('No Project Selected', 'Please create or select a project first.');
      return;
    }
    usePopupStore.getState().showPrompt(
      'New Diagram', 'Enter diagram name:',
      (name) => { if (name && name.trim()) createDiagram(currentProjectId, name.trim()); },
      'New Diagram', 'Enter diagram name'
    );
  };

  const handleSave = async () => {
    let success = true;
    let savedSomething = false;
    try {
      const gsrsmFileStore = useGsrsmFileStore.getState();
      if (gsrsmFileStore.currentFilePath) {
        const fileSuccess = await gsrsmFileStore.saveCurrentFile();
        success = success && fileSuccess;
        savedSomething = true;
      }
      const gsrsmStore = useGsrsmStore.getState();
      if (gsrsmStore.project) {
        const gsrsmSuccess = await gsrsmStore.saveProject();
        success = success && gsrsmSuccess;
        savedSomething = true;
      }
      const projectStore = useProjectStore.getState();
      const currentProject = projectStore.getCurrentProject();
      if (currentProject) {
        const projectSuccess = await projectStore.saveProject(currentProject.id);
        success = success && projectSuccess;
        savedSomething = true;
      }
      if (!savedSomething) {
        usePopupStore.getState().showWarning('No Selection', 'No project or diagram selected to save.');
        return;
      }
      if (success) {
        usePopupStore.getState().showSuccess('Save Successful', 'All changes have been saved to the file system.');
      } else {
        usePopupStore.getState().showWarning('Save Failed', 'Failed to save some files.');
      }
    } catch (error) {
      console.error('Manual save failed:', error);
      usePopupStore.getState().showWarning('Save Error', 'An error occurred while saving the project.');
    }
    closeMenus();
  };

  const handleCloseProject = () => {
    closeMenus();
    useProjectStore.getState().closeProject();
    useGsrsmStore.getState().closeProject();
    useGsrsmFileStore.getState().clearCurrentFile(); // Clear single file state
    useProjectStore.setState({ projects: [], currentProjectId: null, currentDiagramId: null });
    useGsrsmStore.setState({ project: null, selectedModeIds: [], scale: 1, offset: { x: 0, y: 0 }, contextMenuPosition: null, contextMenuOptions: [] });
    useElementsStore.getState().clearElements();
    try {
      localStorage.setItem('grafcet-app-state', JSON.stringify({ editorType: 'grafcet', showWelcome: true, currentProjectId: null, currentDiagramId: null }));
      // Clear persistence keys that track CURRENT state, but keep project history ('grafcet-editor-projects')
      // so the "Open Project" list works.
      ['grafcet-project-state', 'grafcet-Gsrsm-state', 'grafcet-elements-state', 'grafcet-history-state', 'grafcet-editor-state',
        'grafcet-editor-current-project', 'grafcet-editor-current-diagram',
        'grafcet-files-panel-expanded-projects', 'grafcet-files-panel-expanded-folders', 'grafcet-files-panel-project-contents', 'grafcet-files-panel-folder-contents',
        'gsrsm-file-store' // IMPORTANT: Clear the file store persistence to prevent auto-loading
      ].forEach(key => localStorage.removeItem(key));
    } catch (e) { console.error(e); }

    // Force a hard reload to the /welcome path to clear any ?file= query parameters
    // This prevents the "Close Project -> Auto Open Again" loop
    window.location.href = '/welcome';
  };

  const handleExportProject = () => {
    const p = getCurrentProject();
    if (!p) return usePopupStore.getState().showWarning('No Project Selected', 'No project selected.');
    exportProjectToJson(p);
    closeMenus();
  };

  const handleExportDiagram = () => {
    const d = getCurrentDiagram();
    if (!d) return usePopupStore.getState().showWarning('No Diagram Selected', 'No diagram selected.');
    exportDiagramToJson(d);
    closeMenus();
  };



  const handleExportProjectZip = async () => {
    const p = getCurrentProject();
    if (!p) return usePopupStore.getState().showWarning('No Project Selected', 'No project selected.');
    await exportProjectToZip(p);
    closeMenus();
  };

  const handleImportProject = () => { fileInputRef.current?.click(); closeMenus(); };
  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'json') {
        const p = await importProject(file as unknown as string);
        usePopupStore.getState().showSuccess('Import Successful', `Project "${p.name}" imported.`);
      } else {
        usePopupStore.getState().showWarning('Unsupported Format', 'Please import a .json file.');
      }
    } catch (e) { usePopupStore.getState().showWarning('Import Failed', `Failed: ${e}`); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Edit
  const handleUndo = () => { undo(); closeMenus(); };
  const handleRedo = () => { redo(); closeMenus(); };
  const handleDelete = () => { useElementsStore.getState().deleteSelectedElements(); closeMenus(); };

  // View
  const handleZoomIn = () => { zoomIn(); closeMenus(); };
  const handleZoomOut = () => { zoomOut(); closeMenus(); };
  const handleResetView = () => { resetView(); closeMenus(); };
  const handleToggleGrid = () => { toggleSnapToGrid(); closeMenus(); };

  // Tools
  const handleExportToPng = () => {
    const d = getActiveDiagram();
    if (!d || !stageRef.current) return usePopupStore.getState().showWarning('Error', 'No diagram or canvas ready.');
    const selectedIds = useElementsStore.getState().selectedElementIds;
    exportToPng(stageRef, d, {
      hideGrid: true,
      exportSelectedOnly: selectedIds.length > 0
    });
    closeMenus();
  };
  const handleExportToPdf = () => {
    const d = getActiveDiagram();
    if (!d || !stageRef.current) return usePopupStore.getState().showWarning('Error', 'No diagram or canvas ready.');
    const selectedIds = useElementsStore.getState().selectedElementIds;
    import('../../utils/exportUtils').then(({ exportToPdf }) => exportToPdf(stageRef, d, {
      hideGrid: true,
      exportSelectedOnly: selectedIds.length > 0
    }));
    closeMenus();
  };
  const handleValidate = () => {
    const hasInitial = elements.some(e => e.type === 'step' && 'stepType' in e && (e as any).stepType === 'initial');
    if (!hasInitial) usePopupStore.getState().showWarning('Validation Failed', 'Diagram must have initial step.');
    else usePopupStore.getState().showSuccess('Validation Successful', 'Diagram is valid.');
    closeMenus();
  };

  // Help
  const handleAbout = () => { usePopupStore.getState().showInfo('About', 'GRAFCET Editor v1.0'); closeMenus(); };
  const handleUserGuide = () => { window.open('https://example.com/guide', '_blank'); closeMenus(); };
  const handleResetApp = () => { closeMenus(); navigate('/reset-app'); };

  return (
    <>
      <MenuContainer ref={menuRef}>
        <LeftSection>
          <MenuGroup>
            <MenuItem $isActive={openMenu === 'file'} onClick={(e) => toggleMenu('file', e)}>File</MenuItem>
            <MenuDropdown $isOpen={openMenu === 'file'}>
              <DropdownItem onClick={handleNewProject}>New Project</DropdownItem>
              <DropdownItem onClick={handleOpenProject}>Open Project</DropdownItem>
              <DropdownItem onClick={handleNewDiagram} disabled={!currentProjectId}>New Diagram</DropdownItem>
              <Divider />
              <DropdownItem onClick={handleSave} disabled={!currentProjectId}>Save <Shortcut>Ctrl+S</Shortcut></DropdownItem>
              <Divider />
              <DropdownItem onClick={handleExportProject} disabled={!currentProjectId}>Export Project (JSON)</DropdownItem>
              <DropdownItem onClick={handleExportDiagram} disabled={!getCurrentDiagram()}>Export Diagram (JSON)</DropdownItem>
              <Divider />
              <DropdownItem onClick={handleImportProject}>Import Project</DropdownItem>
              <Divider />
              <DropdownItem onClick={handleCloseProject} disabled={!currentProjectId && !gsrsmProject}>Close Project</DropdownItem>
            </MenuDropdown>
          </MenuGroup>

          <MenuGroup>
            <MenuItem $isActive={openMenu === 'edit'} onClick={(e) => toggleMenu('edit', e)}>Edit</MenuItem>
            <MenuDropdown $isOpen={openMenu === 'edit'}>
              <DropdownItem onClick={handleUndo} disabled={!canUndo()}>Undo <Shortcut>Ctrl+Z</Shortcut></DropdownItem>
              <DropdownItem onClick={handleRedo} disabled={!canRedo()}>Redo <Shortcut>Ctrl+Y</Shortcut></DropdownItem>
              <Divider />
              <DropdownItem onClick={handleDelete}>Delete <Shortcut>Del</Shortcut></DropdownItem>
            </MenuDropdown>
          </MenuGroup>

          <MenuGroup>
            <MenuItem $isActive={openMenu === 'view'} onClick={(e) => toggleMenu('view', e)}>View</MenuItem>
            <MenuDropdown $isOpen={openMenu === 'view'}>
              <DropdownItem onClick={handleZoomIn}>Zoom In <Shortcut>Ctrl++</Shortcut></DropdownItem>
              <DropdownItem onClick={handleZoomOut}>Zoom Out <Shortcut>Ctrl+-</Shortcut></DropdownItem>
              <DropdownItem onClick={handleResetView}>Reset View <Shortcut>Ctrl+0</Shortcut></DropdownItem>
              <Divider />
              {onToggleSidebar && (
                <DropdownItem onClick={() => { onToggleSidebar(); closeMenus(); }}>
                  {sidebarVisible ? 'Hide Sidebar' : 'Show Sidebar'}
                </DropdownItem>
              )}
              <DropdownItem onClick={handleToggleGrid}>{snapToGrid ? 'Hide Grid' : 'Show Grid'}</DropdownItem>
            </MenuDropdown>
          </MenuGroup>

          <MenuGroup>
            <MenuItem $isActive={openMenu === 'tools'} onClick={(e) => toggleMenu('tools', e)}>Tools</MenuItem>
            <MenuDropdown $isOpen={openMenu === 'tools'}>
              <DropdownItem onClick={handleExportToPng}>Export to PNG</DropdownItem>
              <DropdownItem onClick={handleExportToPdf}>Export to PDF</DropdownItem>
              <Divider />
              <DropdownItem onClick={handleValidate}>Validate GRAFCET</DropdownItem>
            </MenuDropdown>
          </MenuGroup>

          <MenuGroup>
            <MenuItem $isActive={openMenu === 'io'} onClick={(e) => toggleMenu('io', e)}>IO</MenuItem>
            <MenuDropdown $isOpen={openMenu === 'io'}>
              <DropdownItem onClick={() => { setSimulationModalOpen(true); closeMenus(); }}>
                Definitions...
              </DropdownItem>
            </MenuDropdown>
          </MenuGroup>

          <MenuGroup>
            <MenuItem $isActive={openMenu === 'simulation'} onClick={(e) => toggleMenu('simulation', e)}>Simulation</MenuItem>
            <MenuDropdown $isOpen={openMenu === 'simulation'}>
              <DropdownItem onClick={() => { useSimulationStore.getState().toggleSimulationPanel(); closeMenus(); }}>
                {useSimulationStore.getState().showSimulationPanel ? 'Hide Panel' : 'Show Panel'}
              </DropdownItem>
            </MenuDropdown>
          </MenuGroup>

          <MenuGroup>
            <MenuItem $isActive={openMenu === 'help'} onClick={(e) => toggleMenu('help', e)}>Help</MenuItem>
            <MenuDropdown $isOpen={openMenu === 'help'}>
              <DropdownItem onClick={handleAbout}>About</DropdownItem>
              <DropdownItem onClick={handleResetApp}>Reset App</DropdownItem>
            </MenuDropdown>
          </MenuGroup>
        </LeftSection>

        <CenterSection>
          <Logo>
            <AppLogoImg src="/logo.png" alt="VibIndu" />
          </Logo>
        </CenterSection>

        <RightSection>
          {showAI && (
            <ActionButton onClick={onToggleVibe} style={{ color: '#00d4ff', fontWeight: 600 }}>
              <span style={{ fontSize: '1.2rem' }}>⚛️</span>
              <span>AI</span>
            </ActionButton>
          )}

          <VerticalDivider />

          <ActionButton onClick={() => setLanguage(language === 'fr' ? 'en' : 'fr')}>
            <span>{language === 'fr' ? 'EN' : 'FR'}</span>
          </ActionButton>

          <VerticalDivider />

          <MenuGroup>
            <ActionButton onClick={(e) => toggleMenu('user', e)}>
              <FiUser />
              <span>{user?.name || 'User'}</span>
            </ActionButton>
            <UserDropdown $isOpen={openMenu === 'user'}>
              <DropdownItem style={{ pointerEvents: 'none', opacity: 0.7 }}>
                <FiUser />
                <span>{user?.email || 'user@example.com'}</span>
              </DropdownItem>
              <DropdownItem onClick={handleResetApp}>
                <FiFolder />
                <span>Reset App</span>
              </DropdownItem>
              <DropdownItem onClick={() => { logout(); closeMenus(); }}>
                <FiLogOut />
                <span>Sign Out</span>
              </DropdownItem>
            </UserDropdown>
          </MenuGroup>
        </RightSection>
      </MenuContainer>

      <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".json,.zip" onChange={handleFileSelected} />
      <SimulationModal isOpen={isSimulationModalOpen} onClose={() => setSimulationModalOpen(false)} />
    </>
  );
};

export default TopMenu;
