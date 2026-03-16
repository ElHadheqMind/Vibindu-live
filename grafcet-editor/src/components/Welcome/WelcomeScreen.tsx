import React from 'react';
import styled, { keyframes } from 'styled-components';
import { FiPlus, FiFolder, FiClock, FiFile, FiFolderPlus, FiChevronRight, FiTrash2 } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../../store/useProjectStore';

import { usePopupStore } from '../../store/usePopupStore';
import { useCreateProjectModalStore } from '../../store/useCreateProjectModalStore';
import OpenProjectModal from '../UI/OpenProjectModal';
import { ApiService } from '../../services/apiService';

const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const WelcomeOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background-color: ${props => props.theme.background};
  z-index: 1000;
  padding: 0;
  overflow: hidden;
`;

const WelcomeContainer = styled.div`
  display: flex;
  width: 100%;
  height: 100%;
  animation: ${fadeIn} 0.3s ease-out;
`;

const Sidebar = styled.div`
  width: 280px;
  background-color: ${props => props.theme.surfaceAlt};
  border-right: 1px solid ${props => props.theme.border};
  padding: 40px 24px;
  display: flex;
  flex-direction: column;
  gap: 32px;
`;

const Logo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 20px;
  font-weight: 700;
  color: ${props => props.theme.primary};
  margin-bottom: 8px;
`;

const AppLogoImg = styled.img`
  height: 32px;
  width: auto;
  object-fit: contain;
  mix-blend-mode: multiply;
`;


const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SectionTitle = styled.h3`
  font-size: 11px;
  font-weight: 600;
  color: ${props => props.theme.textSecondary};
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0 0 8px 0;
`;

const ActionButton = styled.button<{ $primary?: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  background-color: ${props => props.$primary ? props.theme.primary : props.theme.surface};
  color: ${props => props.$primary ? 'white' : props.theme.text};
  border: 1px solid ${props => props.$primary ? 'transparent' : props.theme.border};
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;

  &:hover {
    transform: translateX(2px);
    background-color: ${props => props.$primary ? props.theme.primaryDark : props.theme.surfaceRaised};
    border-color: ${props => props.$primary ? 'transparent' : props.theme.primary};
  }

  svg {
    font-size: 16px;
    flex-shrink: 0;
  }
`;

const MainContent = styled.div`
  flex: 1;
  padding: 40px 60px;
  overflow-y: auto;
`;

const Header = styled.div`
  margin-bottom: 40px;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 700;
  margin: 0 0 12px 0;
  color: ${props => props.theme.text};
`;

const Subtitle = styled.p`
  font-size: 16px;
  color: ${props => props.theme.textSecondary};
  margin: 0;
  line-height: 1.5;
`;

const ContentSection = styled.div`
  margin-bottom: 48px;
`;

const ContentSectionTitle = styled.h2`
  font-size: 14px;
  font-weight: 600;
  color: ${props => props.theme.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  gap: 8px;

  svg {
    font-size: 16px;
  }
`;

const ItemsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Item = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background-color: ${props => props.theme.surface};
  border: 1px solid ${props => props.theme.border};
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background-color: ${props => props.theme.surfaceRaised};
    border-color: ${props => props.theme.primary};
    transform: translateX(4px);
  }
`;

const ItemIcon = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background-color: ${props => props.theme.primaryLight};
  color: ${props => props.theme.primary};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
`;

const ItemContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const ItemName = styled.div`
  font-weight: 500;
  font-size: 14px;
  color: ${props => props.theme.text};
  margin-bottom: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;


const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
  color: ${props => props.theme.textSecondary};
  background-color: ${props => props.theme.surfaceAlt}50;
  border: 1px dashed ${props => props.theme.border};
  border-radius: 8px;
`;

const EmptyStateIcon = styled.div`
  font-size: 48px;
  margin-bottom: 16px;
  color: ${props => props.theme.textTertiary};
`;

const EmptyStateText = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
`;

const DeleteButton = styled.button`
  background: none;
  border: none;
  color: ${props => props.theme.textSecondary};
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  opacity: 0;
  
  ${Item}:hover & {
    opacity: 1;
  }
  
  &:hover {
    background: ${props => props.theme.error || '#e53935'}20;
    color: ${props => props.theme.error || '#e53935'};
  }
  
  svg {
    font-size: 16px;
  }
`;

interface WelcomeScreenProps {
    onClose: () => void;
    onSelectEditor?: (editorType: 'grafcet' | 'gsrsm') => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onClose }) => {
    const navigate = useNavigate();
    const {
        projects,
        remoteProjects,
        fetchRemoteProjects,
        loadProject,
        setCurrentProject
    } = useProjectStore();
    const { openModal: openCreateProjectModal } = useCreateProjectModalStore();
    const [isOpenProjectModalOpen, setIsOpenProjectModalOpen] = React.useState(false);

    // Fetch remote projects on mount
    React.useEffect(() => {
        fetchRemoteProjects();
    }, [fetchRemoteProjects]);

    // Combined recent projects: Prioritize remote ones, then fall back to local ones not in remote
    const displayProjects = React.useMemo(() => {
        // Map remote projects to a similar format
        const remote = remoteProjects.map(p => ({
            id: p.path, // Use path as ID for remote-only
            name: p.name,
            localPath: p.path,
            updatedAt: p.lastModified,
            type: p.type,
            isRemote: true
        }));

        // Local projects that are NOT in remote (to avoid duplicates)
        const local = projects
            .filter(p => !remoteProjects.some(rp => rp.path === p.localPath))
            .map(p => ({
                id: p.id,
                name: p.name,
                localPath: p.localPath,
                updatedAt: p.updatedAt,
                type: p.diagrams ? 'grafcet' : 'gsrsm',
                isRemote: false
            }));

        return [...remote, ...local]
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .slice(0, 10);
    }, [projects, remoteProjects]);

    const handleCreateProject = () => {
        openCreateProjectModal('gsrsm');
    };

    const handleCreateFile = () => {
        openCreateProjectModal('grafcet');
    };

    const handleOpenProject = () => {
        setIsOpenProjectModalOpen(true);
    };

    const handleOpenFile = () => {
        usePopupStore.getState().showInfo(
            'Open File',
            'File browser feature coming soon! For now, please use the file explorer panel on the left.'
        );
    };

    const handleOpenProjectItem = async (projectItem: any) => {
        if (projectItem.isRemote) {
            // Load from server
            try {
                const response = await ApiService.loadProject({ projectPath: projectItem.localPath });
                if (response.success && response.project) {
                    const project = response.project;

                    const isGrafcet = (project as any).diagrams !== undefined || (project as any).type === 'grafcet';

                    if (isGrafcet) {
                        loadProject(project as any);
                        setCurrentProject(project.id);
                        if ((project as any).diagrams && (project as any).diagrams.length > 0) {
                            const projectPath = project.localPath;
                            // Navigate within SPA context to preserve auth state (no full reload)
                            navigate(`/welcome?project=${encodeURIComponent(projectPath || '')}`, { replace: true });
                        } else {
                            // Fallback if no diagrams or empty
                            onClose();
                            window.dispatchEvent(new CustomEvent('projectOpened', { detail: { editorType: 'grafcet' } }));
                        }
                    } else {
                        // GSRSM Project
                        // For GSRSM, the project IS the file usually (.gsrsm)
                        const filePath = project.localPath;
                        navigate(`/welcome?project=${encodeURIComponent(filePath || '')}`, { replace: true });
                    }
                }
            } catch (error) {
                console.error('Failed to load remote project:', error);
                usePopupStore.getState().showWarning('Load Error', 'Could not open the selected project.');
            }
        } else {
            // Already in store
            setCurrentProject(projectItem.id);
            const project = projects.find(p => p.id === projectItem.id);

            const isGrafcet = project && (project.diagrams !== undefined || (project as any).type === 'grafcet');

            if (isGrafcet && project.diagrams && project.diagrams.length > 0) {
                // Navigate within SPA context to preserve auth state (no full reload)
                navigate(`/welcome?project=${encodeURIComponent(project.localPath || '')}`, { replace: true });
            } else if (!isGrafcet && project) {
                navigate(`/welcome?project=${encodeURIComponent(project.localPath || '')}`, { replace: true });
            } else {
                // Fallback
                setCurrentProject(projectItem.id);
                onClose();
                window.dispatchEvent(new CustomEvent('projectOpened', { detail: { editorType: isGrafcet ? 'grafcet' : 'gsrsm' } }));
            }
        }
    };


    const handleDeleteProject = async (project: any, event: React.MouseEvent) => {
        event.stopPropagation(); // Prevent project opening

        usePopupStore.getState().showConfirm(
            'Delete Project',
            `Are you sure you want to delete the project "${project.name}"?\n\nThis action cannot be undone and will permanently delete all project files.`,
            [
                { label: 'Cancel', action: 'cancel', variant: 'secondary' },
                { label: 'Delete', action: 'delete', variant: 'danger' }
            ],
            async (action) => {
                if (action !== 'delete') return;

                try {
                    const response = await ApiService.deleteProject(project.localPath);

                    if (response.success) {
                        usePopupStore.getState().showSuccess(
                            'Project Deleted',
                            `Project "${project.name}" has been deleted successfully.`
                        );

                        // Refresh the project list
                        fetchRemoteProjects();
                    } else {
                        usePopupStore.getState().showWarning(
                            'Delete Failed',
                            response.error || 'Failed to delete the project.'
                        );
                    }
                } catch (error) {
                    usePopupStore.getState().showWarning(
                        'Error',
                        'Failed to communicate with the backend server.'
                    );
                }
            }
        );
    };

    return (
        <WelcomeOverlay>
            <WelcomeContainer>
                <Sidebar>
                    <div>
                        <Logo>
                            <AppLogoImg src="/logo.png" alt="VibIndu" />
                        </Logo>
                        <Subtitle style={{ fontSize: '12px', marginTop: '4px' }}>
                            Powered by Gemini 3
                        </Subtitle>
                    </div>

                    <Section>
                        <SectionTitle>Start</SectionTitle>
                        <ActionButton $primary onClick={handleCreateProject}>
                            <FiPlus />
                            <span>New Project</span>
                        </ActionButton>
                        <ActionButton onClick={handleCreateFile}>
                            <FiFile />
                            <span>New File</span>
                        </ActionButton>
                        <ActionButton onClick={handleOpenProject}>
                            <FiFolder />
                            <span>Open Project</span>
                        </ActionButton>
                        <ActionButton onClick={handleOpenFile}>
                            <FiFolderPlus />
                            <span>Open File</span>
                        </ActionButton>
                    </Section>
                </Sidebar>

                <MainContent>
                    <Header>
                        <Title>Welcome to VibIndu</Title>
                        <Subtitle>
                            Create professional GRAFCET and GSRSM diagrams with AI-powered assistance.
                            Get started by creating a new project or opening a recent one.
                        </Subtitle>
                    </Header>

                    <ContentSection>
                        <ContentSectionTitle>
                            <FiClock />
                            Recent Projects
                        </ContentSectionTitle>
                        {displayProjects.length > 0 ? (
                            <ItemsList>
                                {displayProjects.map(project => (
                                    <Item key={project.id} onClick={() => handleOpenProjectItem(project)}>
                                        <ItemIcon>
                                            <FiFolder />
                                        </ItemIcon>
                                        <ItemContent>
                                            <ItemName>{project.name}</ItemName>
                                        </ItemContent>
                                        <DeleteButton
                                            onClick={(e) => handleDeleteProject(project, e)}
                                            title="Delete project"
                                        >
                                            <FiTrash2 />
                                        </DeleteButton>
                                        <FiChevronRight style={{ color: 'var(--text-tertiary)', fontSize: '16px' }} />
                                    </Item>
                                ))}
                            </ItemsList>
                        ) : (
                            <EmptyState>
                                <EmptyStateIcon>
                                    <FiFolder />
                                </EmptyStateIcon>
                                <EmptyStateText>
                                    No recent projects.<br />
                                    Create your first project to get started!
                                </EmptyStateText>
                            </EmptyState>
                        )}
                    </ContentSection>
                </MainContent>
            </WelcomeContainer>

            <OpenProjectModal
                isOpen={isOpenProjectModalOpen}
                onClose={() => setIsOpenProjectModalOpen(false)}
            />
        </WelcomeOverlay>
    );
};

export default WelcomeScreen;
