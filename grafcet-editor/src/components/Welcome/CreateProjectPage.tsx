import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { FiArrowLeft, FiCheck, FiAlertCircle } from 'react-icons/fi';
import { useProjectStore } from '../../store/useProjectStore';
import { useGsrsmStore } from '../../store/useGsrsmStore';
import { ApiService } from '../../services/apiService';
import { GrafcetProject, GsrsmProject } from '../../models/types';
import { usePopupStore } from '../../store/usePopupStore';

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

const PageContainer = styled.div`
  min-height: 100vh;
  width: 100%;
  background: linear-gradient(135deg, ${props => props.theme.background} 0%, ${props => props.theme.surfaceAlt} 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
`;

const CreateProjectContainer = styled.div`
  width: 500px;
  max-width: 95%;
  background-color: ${props => props.theme.surfaceRaised};
  border-radius: 16px;
  box-shadow: 0 20px 60px ${props => props.theme.shadow};
  overflow: hidden;
  animation: ${fadeIn} 0.6s cubic-bezier(0.16, 1, 0.3, 1);

  @media (max-width: 768px) {
    width: 100%;
    border-radius: 8px;
  }
`;

const Header = styled.div`
  background: linear-gradient(135deg, ${props => props.theme.primary} 0%, ${props => props.theme.primaryDark} 100%);
  color: white;
  padding: 32px;
  text-align: center;
  position: relative;

  @media (max-width: 480px) {
    padding: 24px;
  }
`;

const BackButton = styled.button`
  position: absolute;
  left: 24px;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 8px;
  padding: 8px;
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: translateY(-50%) scale(1.05);
  }

  svg {
    font-size: 20px;
  }
`;

const HeaderTitle = styled.h1`
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 8px 0;

  @media (max-width: 480px) {
    font-size: 24px;
  }
`;

const HeaderSubtitle = styled.p`
  font-size: 16px;
  opacity: 0.9;
  margin: 0;

  @media (max-width: 480px) {
    font-size: 14px;
  }
`;

const Content = styled.div`
  padding: 40px;

  @media (max-width: 768px) {
    padding: 30px;
  }

  @media (max-width: 480px) {
    padding: 20px;
  }
`;

const FormSection = styled.div`
  margin-bottom: 24px;
`;

const Label = styled.label`
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: ${props => props.theme.text};
  margin-bottom: 8px;
`;

const Input = styled.input`
  width: 100%;
  padding: 16px;
  border: 2px solid ${props => props.theme.border};
  border-radius: 8px;
  font-size: 16px;
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

const CreateButton = styled.button<{ disabled?: boolean }>`
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, ${props => props.theme.primary} 0%, ${props => props.theme.primaryDark} 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px ${props => props.theme.primary}40;
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  svg {
    font-size: 18px;
  }
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
  margin-bottom: 24px;

  svg {
    font-size: 16px;
  }
`;

const CreateProjectPage: React.FC = () => {
  const navigate = useNavigate();
  const { loadProject } = useProjectStore();
  const { loadProject: loadGsrsmProject } = useGsrsmStore();

  const [projectName, setProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [backendAvailable, setBackendAvailable] = useState(false);

  // Check backend availability on mount
  useEffect(() => {
    const checkBackend = async () => {
      const isAvailable = await ApiService.checkHealth();
      setBackendAvailable(isAvailable);
    };

    checkBackend();
  }, []);

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
      // Create unified project (supports both GRAFCET and GSRSM)
      const response = await ApiService.createProject({
        name: projectName.trim(),
        type: 'grafcet', // Default type, but project supports both
        localPath: '' // Backend will use default location
      });

      if (response.success && response.project) {
        // Load the created project
        loadProject(response.project as GrafcetProject);
        loadGsrsmProject(response.project as GsrsmProject);

        usePopupStore.getState().showSuccess(
          'Project Created',
          `Project "${projectName}" has been created successfully!`
        );

        // Navigate to the project path to auto-open it
        const projectPath = response.projectPath || (response.project as GrafcetProject).localPath;
        if (projectPath) {
          // Navigate within the React Router context to preserve auth state (no full reload)
          navigate(`/welcome?project=${encodeURIComponent(projectPath)}`, { replace: true });
        } else {
          // Fallback to basic navigation
          navigate('/welcome', {
            replace: true,
            state: {
              projectCreated: true,
              editorType: 'grafcet'
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
    if (e.key === 'Enter' && projectName.trim()) {
      handleCreateProject();
    }
  };

  return (
    <PageContainer>
      <CreateProjectContainer>
        <Header>
          <BackButton onClick={() => navigate('/')}>
            <FiArrowLeft />
          </BackButton>
          <HeaderTitle>Create New Project</HeaderTitle>
          <HeaderSubtitle>Enter a name for your project</HeaderSubtitle>
        </Header>

        <Content>
          <StatusIndicator $available={backendAvailable}>
            {backendAvailable ? (
              <>
                <FiCheck />
                Backend server is available
              </>
            ) : (
              <>
                <FiAlertCircle />
                Backend server is not available. Please start the backend server.
              </>
            )}
          </StatusIndicator>

          <FormSection>
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
          </FormSection>

          <CreateButton
            onClick={handleCreateProject}
            disabled={!projectName.trim() || isCreating || !backendAvailable}
          >
            {isCreating ? (
              <>Creating...</>
            ) : (
              <>
                <FiCheck />
                Create Project
              </>
            )}
          </CreateButton>
        </Content>
      </CreateProjectContainer>
    </PageContainer>
  );
};

export default CreateProjectPage;
