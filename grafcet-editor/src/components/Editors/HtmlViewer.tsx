import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { FiX, FiCode, FiRefreshCw, FiExternalLink } from 'react-icons/fi';
import { ApiService } from '../../services/apiService';

interface HtmlViewerProps {
  filePath: string;
  onClose: () => void;
}

const ViewerContainer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: ${props => props.theme.surface};
  display: flex;
  flex-direction: column;
  z-index: 100;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background-color: ${props => props.theme.surfaceAlt};
  border-bottom: 1px solid ${props => props.theme.border};
`;

const TitleSection = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: ${props => props.theme.text};
  font-weight: 500;
  
  svg {
    color: ${props => props.theme.primary};
  }
`;

const FileName = styled.span`
  font-size: 14px;
`;

const FilePath = styled.span`
  font-size: 11px;
  color: ${props => props.theme.textSecondary};
  margin-left: 8px;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 8px;
`;

const IconButton = styled.button`
  background: none;
  border: none;
  color: ${props => props.theme.textSecondary};
  cursor: pointer;
  padding: 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  
  &:hover {
    background-color: ${props => props.theme.surfaceRaised};
    color: ${props => props.theme.text};
  }
  
  svg {
    font-size: 16px;
  }
`;

const Content = styled.div`
  flex: 1;
  background-color: white;
  overflow: hidden;
`;

const StyledIframe = styled.iframe`
  width: 100%;
  height: 100%;
  border: none;
`;

const LoadingState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: ${props => props.theme.textSecondary};
  font-size: 14px;
`;

const ErrorState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: ${props => props.theme.error};
  text-align: center;
  gap: 12px;
`;

const HtmlViewer: React.FC<HtmlViewerProps> = ({ filePath, onClose }) => {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fileName = filePath.split(/[/\\]/).pop() || 'Unknown';
  
  const loadFile = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await ApiService.readTextFile(filePath);
      if (response.success && response.content !== undefined) {
        setContent(response.content);
      } else {
        setError(response.error || 'Failed to load file');
      }
    } catch (err) {
      setError('Failed to load file');
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    loadFile();
  }, [filePath]);

  const handleOpenExternal = () => {
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };
  
  return (
    <ViewerContainer>
      <Header>
        <TitleSection>
          <FiCode />
          <FileName>{fileName}</FileName>
          <FilePath>{filePath}</FilePath>
        </TitleSection>
        <HeaderActions>
          <IconButton onClick={handleOpenExternal} title="Open in new tab">
            <FiExternalLink />
          </IconButton>
          <IconButton onClick={loadFile} title="Refresh">
            <FiRefreshCw />
          </IconButton>
          <IconButton onClick={onClose} title="Close">
            <FiX />
          </IconButton>
        </HeaderActions>
      </Header>
      <Content>
        {isLoading ? (
          <LoadingState>Loading...</LoadingState>
        ) : error ? (
          <ErrorState>
            <span>{error}</span>
            <IconButton onClick={loadFile}>
              <FiRefreshCw /> Retry
            </IconButton>
          </ErrorState>
        ) : (
          <StyledIframe 
            title={fileName}
            srcDoc={content}
            sandbox="allow-scripts"
          />
        )}
      </Content>
    </ViewerContainer>
  );
};

export default HtmlViewer;
