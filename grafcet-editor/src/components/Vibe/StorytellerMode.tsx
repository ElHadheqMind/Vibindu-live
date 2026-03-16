import React, { useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { X, Send, BookOpen, Loader2, Play, Maximize2 } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const slideUp = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

const Overlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1100;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  animation: ${fadeIn} 0.3s ease;
  padding: 40px;
`;

const Container = styled.div`
  width: 100%;
  max-width: 700px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  animation: ${slideUp} 0.4s ease;
  max-height: 90vh;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`;

const Title = styled.h2`
  color: #f8fafc;
  font-size: 1.5rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;

  span {
    color: #8b5cf6;
  }
`;

const CloseBtn = styled.button`
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #94a3b8;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }
`;

const DisplayArea = styled.div`
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 24px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: relative;
  overflow-y: auto;
  min-height: 300px;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
  }
`;

const SuccessMessage = styled.div`
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.2);
  color: #4ade80;
  padding: 12px;
  border-radius: 12px;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
`;

const CinematicCard = styled.div`
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 16px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  animation: ${slideUp} 0.5s ease-out;
`;

const ViewStoryBtn = styled.button`
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
  color: white;
  border: none;
  padding: 14px 28px;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.3s ease;
  box-shadow: 0 10px 20px rgba(139, 92, 246, 0.3);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 15px 30px rgba(139, 92, 246, 0.5);
    filter: brightness(1.1);
  }
`;

const InputWrapper = styled.div`
  display: flex;
  gap: 12px;
  background: white;
  padding: 8px 16px;
  border-radius: 100px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
`;

const Input = styled.input`
  flex: 1;
  border: none;
  outline: none;
  font-size: 1rem;
  padding: 12px 0;
  color: #1e293b;

  &::placeholder {
    color: #94a3b8;
  }
`;

const SendBtn = styled.button`
  background: #0f172a;
  color: white;
  border: none;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: scale(1.05);
    background: #1e293b;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const LoadingOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(30, 41, 59, 0.6);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  z-index: 10;
  border-radius: 16px;
`;

const LoadingText = styled.div`
  color: #38bdf8;
  font-weight: 600;
  font-size: 1.1rem;
`;

interface StorytellerModeProps {
    onClose: () => void;
    projectPath?: string;
}

export const StorytellerMode: React.FC<StorytellerModeProps> = ({ onClose, projectPath }) => {
    const { token } = useAuthStore();
    const [prompt, setPrompt] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [resultData, setResultData] = useState<any>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [audioReady, setAudioReady] = useState(false);
    const [imageReady, setImageReady] = useState(false);
    const [videoReady, setVideoReady] = useState(false);
    const [planInfo, setPlanInfo] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSend = async () => {
        if (!prompt.trim()) return;

        setIsProcessing(true);
        setError(null);
        setResultData(null);
        setMessage(null);
        setAudioReady(false);
        setImageReady(false);
        setVideoReady(false);
        setPlanInfo(null);

        try {
            const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:3001/api`;
            const response = await fetch(`${apiBaseUrl}/vibe/storytell`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    prompt: prompt,
                    projectPath: projectPath
                })
            });

            const result = await response.json();

            if (result.success && result.data) {
                setResultData(result.data);
                setMessage(result.message || 'Story generated!');
                setAudioReady(result.data.audioReady || false);
                setImageReady(result.data.imageReady || false);
                setVideoReady(result.data.plan?.video_count > 0 || false);
                setPlanInfo(result.data.plan || null);
            } else {
                setError(result.error || 'Failed to generate story');
            }
        } catch (err: any) {
            setError(err.message || 'Network error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleOpenStory = () => {
        if (!resultData?.path) return;
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:3001/api`;
        const apiRoot = apiBaseUrl.replace(/\/api$/, '');
        const url = `${apiRoot}/api/vibe/story-asset?projectPath=${encodeURIComponent(projectPath || '')}&assetPath=StoryExperience/Story.html`;
        window.open(url, '_blank');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isProcessing) {
            handleSend();
        }
    };

    return (
        <Overlay>
            <Container>
                <Header>
                    <Title>
                        <BookOpen size={24} color="#a78bfa" />
                        Creative <span>Storyteller</span>
                    </Title>
                    <CloseBtn onClick={onClose}>
                        <X size={20} />
                    </CloseBtn>
                </Header>

                <DisplayArea>
                    {isProcessing && (
                        <LoadingOverlay>
                            <Loader2 className="animate-spin" size={48} color="#a78bfa" />
                            <LoadingText>Crafting your narrative...</LoadingText>
                        </LoadingOverlay>
                    )}

                    {!resultData && !isProcessing && !error && (
                        <div style={{ color: '#94a3b8', textAlign: 'center', marginTop: 'auto', marginBottom: 'auto' }}>
                            <BookOpen size={64} style={{ opacity: 0.2, marginBottom: '16px' }} />
                            <p>Enter a topic or project part to hear its story.</p>
                        </div>
                    )}

                    {error && (
                        <div style={{ color: '#ef4444', textAlign: 'center', padding: '20px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px', marginBottom: '20px' }}>
                            <p>❌ {error}</p>
                        </div>
                    )}

                    {message && !isProcessing && (
                         <SuccessMessage>
                             <Play size={16} />
                             {message}
                         </SuccessMessage>
                    )}

                    {resultData && !isProcessing && (
                        <CinematicCard>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ background: 'rgba(139, 92, 246, 0.2)', padding: '12px', borderRadius: '12px' }}>
                                    <BookOpen size={24} color="#a78bfa" />
                                </div>
                                <div>
                                    <h4 style={{ margin: 0, color: 'white' }}>Cinematic Masterpiece Ready</h4>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                                        Multimodal assets saved to StoryExperience folder
                                    </p>
                                </div>
                            </div>

                            <div style={{ width: '100%', height: '400px', background: '#000', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <iframe 
                                    src={`${(import.meta.env.VITE_API_BASE_URL || "http://" + window.location.hostname + ":3001/api").replace(/\/api$/, '')}/api/vibe/story-asset?projectPath=${encodeURIComponent(projectPath || '')}&assetPath=StoryExperience/Story.html`}
                                    style={{ width: '100%', height: '100%', border: 'none' }}
                                    title="Story Experience"
                                />
                            </div>

                            {planInfo && (
                                <div style={{ background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.15)', padding: '12px 16px', borderRadius: '10px', fontSize: '0.82rem', color: '#c4b5fd' }}>
                                    <strong>{planInfo.title}</strong> — {planInfo.segment_count} segments
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '8px', fontSize: '0.82rem' }}>
                                <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                                    <div style={{ color: audioReady ? '#4ade80' : '#64748b' }}>🔊 Audio {audioReady ? 'Ready' : 'N/A'}</div>
                                </div>
                                <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                                    <div style={{ color: imageReady ? '#4ade80' : '#64748b' }}>🖼️ Images {imageReady ? `(${planInfo?.image_count || '?'})` : 'N/A'}</div>
                                </div>
                                <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                                    <div style={{ color: videoReady ? '#4ade80' : '#64748b' }}>🎬 Videos {videoReady ? `(${planInfo?.video_count || '?'})` : 'N/A'}</div>
                                </div>
                            </div>

                            <ViewStoryBtn onClick={handleOpenStory}>
                                <Maximize2 size={18} />
                                Open Full Story in Browser
                            </ViewStoryBtn>

                            <p style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'center', margin: 0 }}>
                                Find all assets in the <b>StoryExperience</b> folder in your project directory.
                            </p>
                        </CinematicCard>
                    )}
                </DisplayArea>

                <InputWrapper>
                    <Input
                        placeholder="What should the story be about? (e.g., 'The safety interlock system')"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isProcessing}
                    />
                    <SendBtn onClick={handleSend} disabled={isProcessing || !prompt.trim()}>
                        {isProcessing ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                    </SendBtn>
                </InputWrapper>

                <div style={{ color: '#64748b', fontSize: '0.8rem', textAlign: 'center' }}>
                    This agent generates multimodal descriptions with cinematic audio and AI imagery.
                </div>
            </Container>
        </Overlay>
    );
};

export default StorytellerMode;
