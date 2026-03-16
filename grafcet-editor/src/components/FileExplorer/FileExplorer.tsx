import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import {
    FiChevronRight,
    FiFolder,
    FiFile,
    FiPlus,
    FiRefreshCw,
    FiFileText,
    FiGitBranch,
    FiEdit2,
    FiTrash2,
    FiCopy,
    FiClipboard
} from 'react-icons/fi';
import { useProjectStore } from '../../store/useProjectStore';
import { useGsrsmStore } from '../../store/useGsrsmStore';
import { usePopupStore } from '../../store/usePopupStore';
import { useFileExplorerStore } from '../../store/useFileExplorerStore';
import { useLanguage } from '../../context/LanguageContext';
import { ApiService } from '../../services/apiService';
import NewFileDialog from '../UI/NewFileDialog';


interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'folder';
    children?: FileNode[];
    isExpanded?: boolean;
}

const ExplorerContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: ${props => props.theme.surface};
  color: ${props => props.theme.text};
  font-size: 13px;
  user-select: none;
`;

const ExplorerHeader = styled.div`
  padding: 8px 12px;
  background-color: ${props => props.theme.surfaceAlt};
  border-bottom: 1px solid ${props => props.theme.border};
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${props => props.theme.textSecondary};
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid ${props => props.theme.border};
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 4px;
`;

const IconButton = styled.button<{ $spinning?: boolean }>`
  background: none;
  border: none;
  color: ${props => props.theme.textSecondary};
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.15s ease;

  &:hover {
    background-color: ${props => props.theme.surfaceRaised};
    color: ${props => props.theme.text};
  }

  svg {
    font-size: 14px;
    ${props => props.$spinning && `
      animation: spin 1s linear infinite;
    `}
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

const TreeContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0;

  &::-webkit-scrollbar {
    width: 10px;
  }

  &::-webkit-scrollbar-track {
    background: ${props => props.theme.surface};
  }

  &::-webkit-scrollbar-thumb {
    background: ${props => props.theme.border};
    border-radius: 5px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: ${props => props.theme.textTertiary};
  }
`;

const TreeItem = styled.div<{ $depth: number; $isSelected?: boolean }>`
  display: flex;
  align-items: center;
  padding: 4px 8px 4px ${props => 8 + props.$depth * 16}px;
  cursor: pointer;
  background-color: ${props => props.$isSelected ? props.theme.primaryLight + '40' : 'transparent'};
  color: ${props => props.$isSelected ? props.theme.primary : props.theme.text};
  transition: background-color 0.15s ease;

  &:hover {
    background-color: ${props => props.$isSelected ? props.theme.primaryLight + '40' : props.theme.surfaceAlt};
  }
`;

const ChevronIcon = styled.div<{ $isExpanded: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-right: 2px;
  color: ${props => props.theme.textSecondary};
  transition: transform 0.15s ease;
  transform: rotate(${props => props.$isExpanded ? '90deg' : '0deg'});

  svg {
    font-size: 12px;
  }
`;

const FileIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-right: 6px;
  color: ${props => props.theme.textSecondary};

  svg {
    font-size: 14px;
  }
`;

const FileName = styled.span`
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const EmptyState = styled.div`
  padding: 20px;
  text-align: center;
  color: ${props => props.theme.textTertiary};
  font-size: 12px;
`;

const ContextMenuContainer = styled.div<{ $x: number; $y: number }>`
  position: fixed;
  top: ${props => props.$y}px;
  left: ${props => props.$x}px;
  background-color: ${props => props.theme.surfaceRaised};
  border: 1px solid ${props => props.theme.border};
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  min-width: 160px;
  padding: 4px 0;
`;

const ContextMenuItem = styled.div<{ $disabled?: boolean }>`
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: ${props => props.$disabled ? 'not-allowed' : 'pointer'};
  opacity: ${props => props.$disabled ? 0.5 : 1};
  font-size: 13px;
  color: ${props => props.theme.text};
  gap: 8px;

  &:hover {
    background-color: ${props => props.$disabled ? 'transparent' : props.theme.primaryLight + '20'};
  }

  svg {
    font-size: 14px;
    color: ${props => props.theme.textSecondary};
  }
`;

const RenameInput = styled.input`
  background-color: ${props => props.theme.surfaceRaised};
  border: 1px solid ${props => props.theme.primary};
  color: ${props => props.theme.text};
  padding: 2px 4px;
  font-size: 13px;
  border-radius: 2px;
  width: 100%;
  outline: none;
`;

interface FileExplorerProps {
    onFileSelect?: (filePath: string) => void;
}

const FileExplorer: React.FC<FileExplorerProps> = ({ onFileSelect }) => {
    const [showNewFileDialog, setShowNewFileDialog] = useState(false);
    const [newFileParentPath, setNewFileParentPath] = useState('');
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileNode | null }>({ x: 0, y: 0, node: null });
    const [renameNode, setRenameNode] = useState<{ path: string; name: string } | null>(null);
    const [clipboard, setClipboard] = useState<{ path: string; type: 'file' | 'folder' } | null>(null);

    const { getCurrentProject: getGrafcetProject } = useProjectStore();
    const { project: gsrsmProject } = useGsrsmStore();
    const { showPopup, showError, showConfirm } = usePopupStore();
    const { t } = useLanguage();

    // Use the new FileExplorerStore for persistence
    const {
        fileTreeCache,
        selectedPath,
        isLoading,
        loadFileTree,
        toggleExpanded,
        setSelected
    } = useFileExplorerStore();

    const currentProject = getGrafcetProject() || gsrsmProject;

    // Load file tree on mount and when project changes
    useEffect(() => {
        const targetPath = currentProject?.localPath || '';
        loadFileTree(targetPath);
    }, [currentProject?.localPath]);

    // Toggle folder expansion using the store
    const handleToggleFolder = (path: string) => {
        toggleExpanded(path);
    };

    // Handle file/folder click
    const handleItemClick = (node: FileNode) => {
        if (node.type === 'folder') {
            handleToggleFolder(node.path);
        } else {
            setSelected(node.path);

            // Logic to open correct editor based on extension
            if (node.name.endsWith('.sfc')) {
                if (onFileSelect) {
                    onFileSelect(node.path);
                }
            } else if (node.name.endsWith('.gsrsm')) {
                if (onFileSelect) {
                    onFileSelect(node.path);
                }
            } else if (onFileSelect) {
                onFileSelect(node.path);
            }
        }
    };

    // Handle new file
    const handleNewFile = () => {
        if (currentProject?.localPath) {
            setNewFileParentPath(currentProject.localPath);
            setShowNewFileDialog(true);
        } else {
            showPopup('info', 'No Project', 'Please open a project first.');
        }
    };

    // Handle refresh - just reload the tree, preserve expanded state
    const handleRefresh = () => {
        const targetPath = currentProject?.localPath || '';
        loadFileTree(targetPath);
    };

    // Context menu handlers
    const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, node });
    };

    const closeContextMenu = () => {
        setContextMenu({ ...contextMenu, node: null });
    };

    const handleBackgroundContextMenu = (e: React.MouseEvent) => {
        if (e.defaultPrevented) return;
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, node: { name: 'root', path: currentProject?.localPath || '', type: 'folder' } as FileNode });
    };

    const handleDelete = (node: FileNode) => {
        showConfirm(
            'Delete Item',
            `Are you sure you want to delete ${node.name}? This action cannot be undone.`,
            [
                { label: 'Cancel', action: 'cancel', variant: 'secondary' },
                { label: 'Delete', action: 'delete', variant: 'danger' }
            ],
            async (action) => {
                if (action === 'delete') {
                    try {
                        const data = await ApiService.deleteItem(node.path);
                        if (data.success) {
                            handleRefresh();
                        } else {
                            showError('Delete Failed', data.error || 'Could not delete item');
                        }
                    } catch (error) {
                        console.error('Error deleting item:', error);
                        showError('Delete Failed', 'An unexpected error occurred');
                    }
                }
            }
        );
        closeContextMenu();
    };

    const startRename = (node: FileNode) => {
        setRenameNode({ path: node.path, name: node.name });
        closeContextMenu();
    };

    const handleRename = async (newName: string) => {
        if (!renameNode || !newName || newName === renameNode.name) {
            setRenameNode(null);
            return;
        }

        try {
            const data = await ApiService.renameItem(renameNode.path, newName);
            if (data.success) {
                setRenameNode(null);
                handleRefresh();
            } else {
                showError('Rename Failed', data.error || 'Could not rename item');
            }
        } catch (error) {
            console.error('Error renaming item:', error);
            showError('Rename Failed', 'An unexpected error occurred');
        }
    };

    const handleCopy = (node: FileNode) => {
        setClipboard({ path: node.path, type: node.type });
        closeContextMenu();
    };

    const handlePaste = async (targetNode: FileNode) => {
        if (!clipboard) return;

        const targetParentPath = targetNode.type === 'folder' ? targetNode.path : targetNode.path.split(/[/\\]/).slice(0, -1).join('/');

        try {
            const data = await ApiService.copyItem(clipboard.path, targetParentPath);
            if (data.success) {
                handleRefresh();
            } else {
                showError('Paste Failed', data.error || 'Could not paste item');
            }
        } catch (error) {
            console.error('Error pasting item:', error);
            showError('Paste Failed', 'An unexpected error occurred');
        }
        closeContextMenu();
    };

    useEffect(() => {
        const handleClickOutside = () => closeContextMenu();
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    // Render tree recursively using cached tree with expanded state applied
    const renderTree = (nodes: FileNode[], depth: number = 0): React.ReactNode => {
        // Filter nodes to hide inactive GSRSM mode folders
        const filteredNodes = nodes.filter(node => {
            // Check if this node is inside a "modes" folder (approximate check based on path)
            const isInsideModes = node.path.includes('/modes/') || node.path.includes('\\modes\\');
            const isGsrsmMode = /^[AFD][1-7]$/.test(node.name);

            if (isInsideModes && isGsrsmMode && gsrsmProject) {
                const activatedModes = gsrsmProject.diagram.modes
                    .filter(m => m.type === 'active')
                    .map(m => m.code);

                return activatedModes.includes(node.name);
            }
            // Hide simulation files and vibe-chat.json/vibindu-chat.json
            if (node.name.endsWith('.sim') || node.name === 'simulation.json' || node.name === 'vibe-chat.json' || node.name === 'vibindu-chat.json') {
                return false;
            }
            return true;
        });

        return filteredNodes.map((node) => (
            <React.Fragment key={node.path}>
                <TreeItem
                    $depth={depth}
                    $isSelected={selectedPath === node.path}
                    onClick={() => handleItemClick(node)}
                    onContextMenu={(e) => handleContextMenu(e, node)}
                >
                    {node.type === 'folder' ? (
                        <>
                            <ChevronIcon $isExpanded={node.isExpanded || false}>
                                <FiChevronRight />
                            </ChevronIcon>
                            <FileIcon>
                                <FiFolder />
                            </FileIcon>
                        </>
                    ) : (
                        <>
                            <ChevronIcon $isExpanded={false} style={{ opacity: 0 }}>
                                <FiChevronRight />
                            </ChevronIcon>
                            <FileIcon>
                                {node.name.endsWith('.sfc') ? (
                                    <FiFileText style={{ color: '#2196f3' }} />
                                ) : node.name.endsWith('.gsrsm') ? (
                                    <FiGitBranch style={{ color: '#4caf50' }} />
                                ) : node.name.endsWith('.md') ? (
                                    <FiFileText style={{ color: '#9c27b0' }} />
                                ) : (
                                    <FiFile />
                                )}
                            </FileIcon>
                        </>
                    )}
                    {renameNode?.path === node.path ? (
                        <RenameInput
                            autoFocus
                            defaultValue={node.name}
                            onBlur={(e) => handleRename(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRename(e.currentTarget.value);
                                if (e.key === 'Escape') setRenameNode(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <FileName>{node.name === 'Story.html' ? 'Story' : node.name}</FileName>
                    )}
                </TreeItem>
                {node.type === 'folder' && node.isExpanded && node.children && (
                    renderTree(node.children, depth + 1)
                )}
            </React.Fragment>
        ));
    };

    return (
        <ExplorerContainer>
            <ExplorerHeader>
                {currentProject ? currentProject.name : 'FLYDRIVE STORAGE'}
                <HeaderActions>
                    <IconButton onClick={handleNewFile} title={t('COMMON.NEW_FILE')}>
                        <FiPlus />
                    </IconButton>
                    <IconButton onClick={handleRefresh} title={t('COMMON.REFRESH')} $spinning={isLoading}>
                        <FiRefreshCw />
                    </IconButton>
                </HeaderActions>
            </ExplorerHeader>

            <TreeContainer onContextMenu={handleBackgroundContextMenu}>
                {fileTreeCache.length === 0 && !isLoading ? (
                    <EmptyState>
                        {currentProject ? t('COMMON.NO_FILES') : 'Storage is empty'}
                        {!currentProject && <><br />Start by creating a new file or folder</>}
                    </EmptyState>
                ) : (
                    renderTree(fileTreeCache)
                )}
            </TreeContainer>

            <NewFileDialog
                isOpen={showNewFileDialog}
                parentPath={newFileParentPath}
                onClose={() => setShowNewFileDialog(false)}
                onFileCreated={(filePath, type) => {
                    setShowNewFileDialog(false);
                    handleRefresh();
                    // Automatically select and open the new file if it's not a folder
                    if (type !== 'folder') {
                        setSelected(filePath);
                        if (onFileSelect) {
                            onFileSelect(filePath);
                        }
                    }
                }}
            />

            {contextMenu.node && (
                <ContextMenuContainer $x={contextMenu.x} $y={contextMenu.y}>
                    {contextMenu.node.name !== 'root' ? (
                        <>
                            <ContextMenuItem onClick={() => startRename(contextMenu.node!)}>
                                <FiEdit2 /> Rename
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => handleCopy(contextMenu.node!)}>
                                <FiCopy /> Copy
                            </ContextMenuItem>
                            <ContextMenuItem
                                $disabled={!clipboard}
                                onClick={() => clipboard && contextMenu.node && handlePaste(contextMenu.node)}
                            >
                                <FiClipboard /> Paste
                            </ContextMenuItem>
                            <ContextMenuItem
                                style={{ color: '#ff4d4f' }}
                                onClick={() => handleDelete(contextMenu.node!)}
                            >
                                <FiTrash2 style={{ color: '#ff4d4f' }} /> Delete
                            </ContextMenuItem>
                        </>
                    ) : (
                        <>
                            <ContextMenuItem onClick={() => {
                                setNewFileParentPath(contextMenu.node!.path);
                                setShowNewFileDialog(true);
                                closeContextMenu();
                            }}>
                                <FiPlus /> New File
                            </ContextMenuItem>
                            <ContextMenuItem
                                $disabled={!clipboard}
                                onClick={() => clipboard && contextMenu.node && handlePaste(contextMenu.node)}
                            >
                                <FiClipboard /> Paste
                            </ContextMenuItem>
                        </>
                    )}
                </ContextMenuContainer>
            )}
        </ExplorerContainer>
    );
};

export default FileExplorer;
