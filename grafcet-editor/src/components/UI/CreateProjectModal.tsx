import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { FiX, FiCheck, FiAlertCircle } from 'react-icons/fi';
import { useProjectStore } from '../../store/useProjectStore';
import { useGsrsmStore } from '../../store/useGsrsmStore';
import { useGsrsmFileStore } from '../../store/useGsrsmFileStore';
import { useElementsStore } from '../../store/useElementsStore';
import { ApiService } from '../../services/apiService';
import { GrafcetProject, GsrsmProject, GrafcetDiagram } from '../../models/types';
import { usePopupStore } from '../../store/usePopupStore';
import { useCreateProjectModalStore } from '../../store/useCreateProjectModalStore';

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease-out;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

const ModalContainer = styled.div`
  background-color: ${props => props.theme.surfaceRaised};
  border-radius: 12px;
  box-shadow: 0 20px 60px ${props => props.theme.shadow};
  width: 500px;
  max-width: 90vw;
  overflow: hidden;
  animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const ModalHeader = styled.div`
  background: linear-gradient(135deg, ${props => props.theme.primary} 0%, ${props => props.theme.primaryDark} 100%);
  color: white;
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const ModalTitle = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 600;
`;

const CloseButton = styled.button`
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
`;

const ModalContent = styled.div`
  padding: 24px;
`;

const StatusIndicator = styled.div<{ $available: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  background-color: ${props => props.$available ? props.theme.success + '20' : props.theme.error + '20'};
  color: ${props => props.$available ? props.theme.success : props.theme.error};
  font-size: 14px;
  margin-bottom: 20px;

  svg {
    font-size: 16px;
  }
`;

const FormGroup = styled.div`
  margin-bottom: 20px;
`;

const Label = styled.label`
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: ${props => props.theme.text};
  margin-bottom: 8px;
`;

const Input = styled.input`
  width: 100%;
  padding: 12px;
  border: 2px solid ${props => props.theme.border};
  border-radius: 8px;
  font-size: 14px;
  background-color: ${props => props.theme.surface};
  color: ${props => props.theme.text};
  transition: all 0.2s ease;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.primary};
    box-shadow: 0 0 0 3px ${props => props.theme.primary}20;
  }

  &::placeholder {
    color: ${props => props.theme.textTertiary};
  }
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid ${props => props.theme.border};
`;

const Button = styled.button<{ $primary?: boolean }>`
  padding: 10px 20px;
  background-color: ${props => props.$primary ? props.theme.primary : 'transparent'};
  color: ${props => props.$primary ? 'white' : props.theme.text};
  border: ${props => props.$primary ? 'none' : `1px solid ${props.theme.border}`};
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 8px;

  &:hover:not(:disabled) {
    background-color: ${props => props.$primary ? props.theme.primaryDark : props.theme.surfaceAlt};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  svg {
    font-size: 16px;
  }
`;

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { loadProject } = useProjectStore();
  const { loadProject: loadGsrsmProject } = useGsrsmStore();
  const { initialType } = useCreateProjectModalStore(); // Get initial type from store

  const [projectName, setProjectName] = useState('');
  const [projectType, setProjectType] = useState<'grafcet' | 'gsrsm'>('gsrsm'); // Default to gsrsm (Full Project)
  const [isCreating, setIsCreating] = useState(false);
  const [backendAvailable, setBackendAvailable] = useState(false);

  // Check backend availability when modal opens and set initial type
  useEffect(() => {
    if (isOpen) {
      const checkBackend = async () => {
        const isAvailable = await ApiService.checkHealth();
        setBackendAvailable(isAvailable);
      };
      checkBackend();
      setProjectName(''); // Reset project name when modal opens
      if (initialType) {
        setProjectType(initialType);
      }
    }
  }, [isOpen, initialType]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      usePopupStore.getState().showWarning(
        'Missing Information',
        'Please enter a project name.'
      );
      return;
    }

    if (!backendAvailable) {
      usePopupStore.getState().showWarning(
        'Backend Unavailable',
        'The backend server is not available. Please ensure it is running.'
      );
      return;
    }

    setIsCreating(true);

    try {
      // Create project with selected type
      const response = await ApiService.createProject({
        name: projectName.trim(),
        type: projectType,
        localPath: '' // Backend will use default location
      });

      if (response.success && response.project && response.projectPath) {
        // Load the created project into the appropriate store based on type
        if (projectType === 'grafcet') {
          loadProject(response.project as GrafcetProject);

          // Set the current file path for auto-save functionality
          // The SFC file is at projectPath/projectName.sfc
          const sfcFilePath = `${response.projectPath}/${projectName.trim()}.sfc`;
          const grafcetProject = response.project as GrafcetProject;

          // Get the first diagram (should be the main one)
          const mainDiagram = grafcetProject.diagrams?.[0];
          if (mainDiagram) {
            // Set the current file in the GsrsmFileStore for auto-save
            useGsrsmFileStore.getState().setCurrentFile(sfcFilePath, mainDiagram as GrafcetDiagram);
            // Also load elements into ElementsStore
            useElementsStore.getState().loadElements(mainDiagram.elements || []);
          }
        } else if (projectType === 'gsrsm') {
          loadGsrsmProject(response.project as GsrsmProject);

          // Also add to project store's list for recent projects view, 
          // but safely as useProjectStore is now robust against missing diagrams
          loadProject(response.project as GrafcetProject);

          // For GSRSM, set the conduct.sfc file as current for auto-save
          const conductFilePath = `${response.projectPath}/conduct.sfc`;
          const conductDiagram: GrafcetDiagram = {
            id: 'conduct',
            name: 'Conduct GRAFCET',
            elements: [],
            version: '1.0',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          useGsrsmFileStore.getState().setCurrentFile(conductFilePath, conductDiagram);
          useElementsStore.getState().loadElements([]);
        }

        // Close modal and immediately navigate into the project
        onClose();

        // Navigate to the project path to auto-open it
        // Use navigate() instead of window.location.href to stay within SPA (preserve auth state, no full reload)
        const projectPath = response.projectPath || (response.project as GrafcetProject).localPath;
        if (projectPath) {
          // Navigate to /welcome with the project path as query param
          navigate(`/welcome?project=${encodeURIComponent(projectPath)}`, { replace: true });
        } else {
          // Fallback to basic navigation
          navigate('/welcome', {
            replace: true,
            state: {
              projectCreated: true,
              editorType: projectType
            }
          });
        }
      } else {
        usePopupStore.getState().showWarning(
          'Creation Failed',
          response.error || 'Failed to create project'
        );
      }
    } catch (error) {
      console.error('Error creating project:', error);
      usePopupStore.getState().showWarning(
        'Error',
        'An unexpected error occurred while creating the project.'
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && projectName.trim() && !isCreating && backendAvailable) {
      handleCreateProject();
    }
  };

  if (!isOpen) return null;

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContainer onClick={e => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Create New Project</ModalTitle>
          <CloseButton onClick={onClose}>
            <FiX />
          </CloseButton>
        </ModalHeader>

        <ModalContent>
          <StatusIndicator $available={backendAvailable}>
            {backendAvailable ? (
              <>
                <FiCheck />
                Backend server is available
              </>
            ) : (
              <>
                <FiAlertCircle />
                Backend server is not available
              </>
            )}
          </StatusIndicator>

          <FormGroup>
            <Label>Project Type</Label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <Button
                type="button"
                onClick={() => setProjectType('gsrsm')}
                $primary={projectType === 'gsrsm'}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Full Project (GSRSM)
              </Button>
              <Button
                type="button"
                onClick={() => setProjectType('grafcet')}
                $primary={projectType === 'grafcet'}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Single File (GRAFCET)
              </Button>
            </div>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="projectName">Project Name</Label>
            <Input
              id="projectName"
              type="text"
              placeholder="Enter your project name..."
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyPress={handleKeyPress}
              autoFocus
            />
          </FormGroup>
        </ModalContent>

        <ModalActions>
          <Button onClick={onClose}>
            Cancel
          </Button>
          <Button
            $primary
            onClick={handleCreateProject}
            disabled={!projectName.trim() || isCreating || !backendAvailable}
          >
            {isCreating ? (
              <>Creating...</>
            ) : (
              <>
                <FiCheck />
                Create {projectType === 'gsrsm' ? 'Project' : 'File'}
              </>
            )}
          </Button>
        </ModalActions>
      </ModalContainer>
    </ModalOverlay>
  );
};

export default CreateProjectModal;
