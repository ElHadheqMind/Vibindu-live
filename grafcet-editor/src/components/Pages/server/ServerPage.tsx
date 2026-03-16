import React, { useState, useRef } from 'react';
import styled from 'styled-components';
import { useProjectStore } from '../../../store/useProjectStore';
import { useElementsStore } from '../../../store/useElementsStore';
import { ApiService } from '../../../services/apiService';
import { API_BASE_URL } from '../../../config';
import { v4 as uuidv4 } from 'uuid';
import Konva from 'konva';
import { exportToPng, exportToPdf, getDiagramImage } from '../../../utils/exportUtils';
import Canvas from '../../Canvas/Canvas';

// Import official element components
import SaveDiagramModal from '../../UI/SaveDiagramModal';

const Container = styled.div`
  display: flex;
  height: calc(100vh - 40px);
  background: ${({ theme }) => theme.background};
  padding: 20px;
  gap: 20px;
`;

const Sidebar = styled.div`
  width: 450px;
  background: ${({ theme }) => theme.surface};
  display: flex;
  flex-direction: column;
  padding: 24px;
  gap: 16px;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.08);
  height: 100%;
  box-sizing: border-box;
  flex-shrink: 0;
`;

const PreviewArea = styled.div`
  flex: 1;
  background: ${({ theme }) => theme.surface};
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const PreviewHeader = styled.div`
  padding: 16px 20px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: ${({ theme }) => theme.surfaceAlt};
`;

const PreviewTitle = styled.h2`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.text};
`;

const PreviewContent = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: #f0f2f5;
  overflow: auto;
`;

const PreviewImage = styled.img`
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  box-shadow: 0 12px 40px rgba(0,0,0,0.15);
  border-radius: 8px;
  background: white;
  border: 1px solid ${({ theme }) => theme.border};
`;

const Title = styled.h1`
  color: ${({ theme }) => theme.text};
  font-size: 22px;
  margin: 0;
  font-weight: 600;
`;

const EditorArea = styled.textarea`
  flex: 1;
  background: ${({ theme }) => theme.background};
  color: ${({ theme }) => theme.text};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 16px;
  font-family: 'Consolas', 'Monaco', monospace;
  resize: none;
  font-size: 13px;
  line-height: 1.6;
  
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.primary};
  }
`;

const ButtonGroup = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' | 'outline' }>`
  background: ${({ theme, $variant }) =>
        $variant === 'secondary' ? theme.surfaceAlt :
            $variant === 'outline' ? 'transparent' : theme.primary};
  color: ${({ theme, $variant }) =>
        $variant === 'secondary' ? theme.text :
            $variant === 'outline' ? theme.primary : 'white'};
  border: ${({ theme, $variant }) =>
        $variant === 'outline' ? `1px solid ${theme.primary}` : 'none'};
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  
  &:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }
  
  &:disabled {
    background: ${({ theme }) => theme.border};
    cursor: not-allowed;
    transform: none;
  }
`;

const InfoBox = styled.div`
  background: ${({ theme }) => theme.surfaceAlt};
  color: ${({ theme }) => theme.text};
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 12px;
  border-left: 4px solid ${({ theme }) => theme.primary};
`;

const DEFAULT_CODE = `SFC "Official Complex Demo"

Step 0 (Initial) "Power ON"
Transition Start

Step 1 (Task) "Initialize"
    Action "Step Action"
Transition Ready

Divergence AND
    Branch
        Step 2 "Parallel 1"
            Action "Pulse Action" (Type=Normal)
        Transition T2
        Step 3 "Sync A"
    EndBranch
    Branch
        Step 4 (Macro) "Parallel 2"
            Action "Timed Macro" (Type=Temporal, Condition="5s")
        Transition T4
        Step 5 "Sync B"
    EndBranch
EndDivergence

Transition WaitSync

Step 6 "Decide"
Divergence OR
    Branch
        Transition Mode_A
        Step 7 "Path A"
            Action "Delayed Activation" (Type=Delayed, Condition="2s")
        Transition End_A
    EndBranch
    Branch
        Transition Mode_B
        Step 8 "Path B"
            Action "Limited Operation" (Type=Limited, Condition="3s")
        Transition End_B
    EndBranch
EndDivergence

Step 9 "Finished"
Transition Reset
Jump 0`;

const ServerPage: React.FC = () => {
    const [code, setCode] = useState(DEFAULT_CODE);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [diagramImageUrl, setDiagramImageUrl] = useState<string | null>(null);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [lastCompiledDiagram, setLastCompiledDiagram] = useState<any>(null);

    const stageRef = useRef<Konva.Stage>(null);
    const { loadElements } = useElementsStore();
    const { currentProjectId, projects } = useProjectStore();
    const currentProject = currentProjectId ? projects.find(p => p.id === currentProjectId) : null;

    const handleGenerate = async () => {
        setLoading(true);
        setError(null);
        setSuccess(null);
        setDiagramImageUrl(null);

        try {
            const response = await fetch(`${API_BASE_URL}/sfc/compile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });

            const data = await response.json();

            if (response.ok && data.success && data.generatedSFC) {
                // 1. Load into official store (CACHE)
                loadElements(data.generatedSFC.elements);
                setLastCompiledDiagram(data.generatedSFC);

                const nameMatch = code.match(/SFC\s+"([^"]+)"/);
                const name = nameMatch ? nameMatch[1] : 'Generated SFC';

                // 2. Save officially to project
                await performAutoSave(data.generatedSFC, name);

                // 3. Trigger Official Export Preview
                // Wait for React to render the official elements in our hidden stage
                setTimeout(async () => {
                    if (stageRef.current) {
                        try {
                            const imageUrl = await getDiagramImage(stageRef.current, {
                                cropToContent: true,
                                whiteBackground: true
                            });
                            setDiagramImageUrl(imageUrl);
                            setSuccess(`Diagram "${name}" generated and exported using official editor tools.`);
                        } catch (imgErr) {
                            console.error('Export failed:', imgErr);
                        }
                    }
                }, 500);
            } else {
                // Display the specific error message provided by the backend
                setError(data.error || 'Compilation failed');
            }
        } catch (err) {
            // Only show this if the network request itself fails (e.g. server down)
            console.error('Network Error:', err);
            setError('Backend server not reachable');
        } finally {
            setLoading(false);
        }
    };

    const performAutoSave = async (diagram: any, name: string) => {
        if (!currentProject) return;
        try {
            const projectPath = (currentProject as any).localPath || (currentProject as any).path;
            const fileName = `${name.trim().replace(/[^a-zA-Z0-9]/g, '_')}.sfc`;
            const savePath = `${projectPath}/${fileName}`;

            await ApiService.saveDiagram({
                diagramPath: savePath,
                diagram: { ...diagram, name, id: uuidv4(), updatedAt: new Date().toISOString() },
            });
        } catch (e) {
            console.error('Auto-save failed:', e);
        }
    };

    const handleManualSave = async (folderPath: string, name: string) => {
        if (!lastCompiledDiagram) return;

        const fileName = name.endsWith('.sfc') ? name : `${name}.sfc`;
        const savePath = `${folderPath}/${fileName}`;

        const result = await ApiService.saveDiagram({
            diagramPath: savePath,
            diagram: {
                ...lastCompiledDiagram,
                name,
                id: uuidv4(),
                updatedAt: new Date().toISOString()
            },
        });

        if (result.success) {
            setSuccess(`Diagram successfully saved as "${name}" in ${folderPath}`);
        } else {
            throw new Error(result.error || 'Failed to save');
        }
    };

    const handleExportPng = () => {
        if (!stageRef.current) return;
        const nameMatch = code.match(/SFC\s+"([^"]+)"/);
        const name = nameMatch ? nameMatch[1] : 'export';
        exportToPng(stageRef as any, { name } as any, { cropToContent: true, whiteBackground: true });
    };

    const handleExportPdf = () => {
        if (!stageRef.current) return;
        const nameMatch = code.match(/SFC\s+"([^"]+)"/);
        const name = nameMatch ? nameMatch[1] : 'export';
        exportToPdf(stageRef as any, { name } as any, { cropToContent: true, whiteBackground: true });
    };

    return (
        <Container>
            <Sidebar>
                <Title>⚡ SFC Official Compiler</Title>
                <InfoBox>
                    Generates and exports diagrams using the <strong>Official Editor Components</strong> and tools.
                </InfoBox>

                <EditorArea
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    spellCheck={false}
                />

                <Button onClick={handleGenerate} disabled={loading}>
                    {loading ? 'Compiling...' : '🚀 Generate & Export'}
                </Button>

                {lastCompiledDiagram && (
                    <Button $variant="secondary" onClick={() => setIsSaveModalOpen(true)}>
                        💾 Save Diagram As...
                    </Button>
                )}

                {diagramImageUrl && (
                    <ButtonGroup>
                        <Button $variant="outline" onClick={handleExportPng}>🖼️ PNG</Button>
                        <Button $variant="outline" onClick={handleExportPdf}>📄 PDF</Button>
                    </ButtonGroup>
                )}

                {success && <div style={{ color: '#52c41a', fontSize: '13px' }}>{success}</div>}
                {error && <div style={{ color: '#ff4d4f', fontSize: '13px' }}>{error}</div>}
            </Sidebar>

            <PreviewArea>
                <PreviewHeader>
                    <PreviewTitle>Official Editor Export Preview</PreviewTitle>
                </PreviewHeader>
                <PreviewContent>
                    {diagramImageUrl ? (
                        <PreviewImage src={diagramImageUrl} alt="Official Preview" />
                    ) : (
                        <div style={{ opacity: 0.3, textAlign: 'center' }}>
                            <div style={{ fontSize: '48px' }}>📋</div>
                            <div>Preview will be generated using official renderer.</div>
                        </div>
                    )}
                </PreviewContent>
            </PreviewArea>

            {/* CRITICAL: Hidden stage that uses the ACTUAL editor components */}
            <div style={{ position: 'absolute', left: '-10000px', top: '-10000px', pointerEvents: 'none', width: '3000px', height: '3000px' }}>
                <Canvas ref={stageRef as any} />
            </div>

            <SaveDiagramModal
                isOpen={isSaveModalOpen}
                onClose={() => setIsSaveModalOpen(false)}
                onSave={handleManualSave}
                defaultName={code.match(/SFC\s+"([^"]+)"/)?.[1] || 'MyDiagram'}
            />
        </Container>
    );
};

export default ServerPage;
