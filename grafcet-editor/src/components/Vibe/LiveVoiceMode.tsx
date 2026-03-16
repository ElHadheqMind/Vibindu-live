import React, { useState, useEffect, useRef, useCallback } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { Mic, MicOff, Square, RadioReceiver, Volume2, User, Bot, Loader2 } from 'lucide-react';

// Light Theme Colors (matching app theme)
const THEME = {
    bg: '#ffffff',
    bgSecondary: '#f8f9fa',
    border: '#e0e0e0',
    text: '#212121',
    textSecondary: '#666666',
    primary: '#1976d2',
    primaryHover: '#1565c0',
    accent: '#ff6b35',
    success: '#4caf50',
    error: '#f44336'
};

// --- Animations ---

const pulseSubtle = keyframes`
  0% { transform: scale(1); opacity: 0.8; box-shadow: 0 0 0 0 rgba(25, 118, 210, 0.4); }
  50% { transform: scale(1.02); opacity: 1; }
  100% { transform: scale(1); opacity: 0.8; box-shadow: 0 0 0 10px rgba(25, 118, 210, 0); }
`;

const pulseActive = keyframes`
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 107, 53, 0.7); }
  50% { transform: scale(1.05); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 20px rgba(255, 107, 53, 0); }
`;

const waveAnimation = keyframes`
  0% { transform: scaleY(0.5); opacity: 0.5; }
  50% { transform: scaleY(1.5); opacity: 1; }
  100% { transform: scaleY(0.5); opacity: 0.5; }
`;

// --- Styled Components ---

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  background-color: ${THEME.bg};
  padding: 20px;
  position: relative;
`;

const CanvasContainer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
  opacity: 0.1;
`;

const OrbContainer = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 40px;
  z-index: 10;
  height: 200px;
  width: 200px;
`;

interface OrbProps {
    $state: 'idle' | 'listening' | 'speaking' | 'thinking';
}

const getOrbStyles = (state: string) => {
    switch (state) {
        case 'listening':
            return css`
        background: radial-gradient(circle at 30% 30%, #ff8a65, ${THEME.accent});
        animation: ${pulseActive} 1.5s infinite ease-in-out;
        box-shadow: 0 10px 30px rgba(255, 107, 53, 0.3);
      `;
        case 'speaking':
            return css`
        background: radial-gradient(circle at 30% 30%, #4dd0e1, #00acc1);
        animation: ${pulseActive} 1s infinite ease-in-out;
        box-shadow: 0 10px 30px rgba(0, 172, 193, 0.3);
      `;
        case 'thinking':
            return css`
        background: radial-gradient(circle at 30% 30%, #ba68c8, #8e24aa);
        animation: ${pulseActive} 2s infinite ease-in-out;
        box-shadow: 0 10px 30px rgba(142, 36, 170, 0.3);
        opacity: 0.8;
      `;
        default:
            return css`
        background: radial-gradient(circle at 30% 30%, #64b5f6, ${THEME.primary});
        animation: ${pulseSubtle} 3s infinite ease-in-out;
        box-shadow: 0 10px 20px rgba(25, 118, 210, 0.2);
      `;
    }
};

const Orb = styled.div<OrbProps>`
  width: 120px;
  height: 120px;
  border-radius: 50%;
  transition: all 0.5s ease;
  ${props => getOrbStyles(props.$state)}
`;

const StatusTextContainer = styled.div`
  text-align: center;
  z-index: 10;
  height: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
`;

const StatusTitle = styled.h3<{ $state: string }>`
  font-size: 1.2rem;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: ${props => {
        switch (props.$state) {
            case 'listening': return THEME.accent;
            case 'speaking': return '#00acc1';
            case 'thinking': return '#8e24aa';
            default: return THEME.primary;
        }
    }};
  transition: color 0.3s ease;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const StatusSubtitle = styled.p`
  font-size: 0.9rem;
  color: ${THEME.textSecondary};
  margin: 0;
  max-width: 280px;
  text-align: center;
  min-height: 44px; /* Maintain height for 2 lines */
`;

const ControlsContainer = styled.div`
  display: flex;
  gap: 16px;
  margin-top: auto;
  margin-bottom: 20px;
  z-index: 10;
`;

const ActionButton = styled.button<{ $primary?: boolean, $danger?: boolean }>`
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  color: white;
  
  background-color: ${props =>
        props.$danger ? THEME.error :
            props.$primary ? THEME.primary :
                THEME.bgSecondary
    };
  
  color: ${props =>
        props.$danger || props.$primary ? 'white' : THEME.text
    };

  border: ${props => !props.$primary && !props.$danger ?\`1px solid \${THEME.border}\` : 'none'};
  
  box-shadow: ${props =>
        props.$danger ? '0 4px 12px rgba(244, 67, 54, 0.3)' :
            props.$primary ? '0 4px 12px rgba(25, 118, 210, 0.3)' :
                '0 2px 5px rgba(0, 0, 0, 0.05)'
    };

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    background-color: ${props =>
        props.$danger ? '#d32f2f' :
            props.$primary ? THEME.primaryHover :
                '#e0e0e0'
    };
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const VisualizerBars = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 40px;
  margin-top: 20px;
`;

const Bar = styled.div<{ $delay: number; $active: boolean }>`
  width: 4px;
  height: 100%;
  background-color: ${THEME.primary};
  border-radius: 2px;
  transform: scaleY(0.2);
  transition: transform 0.2s ease;
  ${props => props.$active && css\`
    animation: \${waveAnimation} 1.2s infinite ease-in-out;
    animation-delay: \${props.$delay}s;
  \`}
`;


// --- Types ---

type AppState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface LiveVoiceModeProps {
    onSendMessage: (text: string) => void;
    isThinking: boolean;
    agentResponseText: string;
    onClose: () => void;
}

// --- Main Component ---

export const LiveVoiceMode: React.FC<LiveVoiceModeProps> = ({
    onSendMessage,
    isThinking,
    agentResponseText,
    onClose
}) => {
    const [appState, setAppState] = useState<AppState>('idle');
    const [transcript, setTranscript] = useState('');
    const [errorText, setErrorText] = useState('');

    const recognitionRef = useRef<any>(null);
    const synthesisRef = useRef<SpeechSynthesis | null>(null);
    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

    // Audio visualization simulation
    const [audioLevel, setAudioLevel] = useState<number>(0);
    const animationFrameRef = useRef<number>();

    useEffect(() => {
        // Initialize Speech Recognition
        // @ts-ignore
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.lang = 'en-US';

            recognitionRef.current.onstart = () => {
                setAppState('listening');
                setTranscript('');
                setErrorText('');
                simulateAudioLevel(true);
            };

            recognitionRef.current.onresult = (event: any) => {
                let currentTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    currentTranscript += event.results[i][0].transcript;
                }
                setTranscript(currentTranscript);
            };

            recognitionRef.current.onerror = (event: any) => {
                console.error("Speech recognition error", event.error);
                if (event.error !== 'no-speech') {
                    setErrorText(\`Microphone error: \${event.error}\`);
        }
        setAppState('idle');
        simulateAudioLevel(false);
      };

      recognitionRef.current.onend = () => {
        simulateAudioLevel(false);
        // We only change from listening if we aren't moving to thinking
        setAppState(prev => prev === 'listening' ? 'idle' : prev);
      };
    } else {
      setErrorText("Speech recognition not supported in this browser. Please use Chrome or Edge.");
    }

    // Initialize Speech Synthesis
    if ('speechSynthesis' in window) {
      synthesisRef.current = window.speechSynthesis;
    }

    return () => {
      // Cleanup
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (synthesisRef.current) {
        synthesisRef.current.cancel();
      }
      simulateAudioLevel(false);
    };
  }, []);

  // Sync props to state transitions
  useEffect(() => {
    if (isThinking) {
      setAppState('thinking');
      // Ensure we stop listening if thinking starts
      if (recognitionRef.current) recognitionRef.current.stop();
    } else if (agentResponseText && appState === 'thinking') {
      // Transition from thinking to speaking when we get text
      speakText(agentResponseText);
    }
  }, [isThinking, agentResponseText]);

  // Handle playing TTS
  const speakText = useCallback((text: string) => {
    if (!synthesisRef.current) return;
    
    // Clean markdown from text before speaking
    const plainText = text
      .replace(/\\*\\*/g, '') // remove bold
      .replace(/\\*/g, '') // remove italic
      .replace(/#/g, '') // remove headers
      .replace(/\`\`\`[\\s\\S]*?\`\`\`/g, 'Code block omitted for brevity.') // replace code blocks
      .replace(/\`.*?\`/g, ''); // remove inline code

    if (!plainText.trim()) {
        setAppState('idle');
        return;
    }

    // Cancel any ongoing speech
    synthesisRef.current.cancel();

    utteranceRef.current = new SpeechSynthesisUtterance(plainText);
    
    // Try to find a good English voice
    const voices = synthesisRef.current.getVoices();
    // Prefer Google voices or Microsoft natural voices if available
    const preferredVoice = voices.find(v => 
      (v.name.includes('Google') || v.name.includes('Natural')) && 
      v.lang.startsWith('en')
    ) || voices.find(v => v.lang.startsWith('en'));
    
    if (preferredVoice) {
      utteranceRef.current.voice = preferredVoice;
    }
    
    utteranceRef.current.rate = 1.0;
    utteranceRef.current.pitch = 1.0;

    utteranceRef.current.onstart = () => {
      setAppState('speaking');
      simulateAudioLevel(true);
    };

    utteranceRef.current.onend = () => {
      setAppState('idle');
      simulateAudioLevel(false);
    };

    utteranceRef.current.onerror = (e) => {
      console.error("Speech synthesis error", e);
      setAppState('idle');
      simulateAudioLevel(false);
    };

    synthesisRef.current.speak(utteranceRef.current);
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) return;

    if (appState === 'listening') {
      // Stop and send
      recognitionRef.current.stop();
      if (transcript.trim()) {
        onSendMessage(transcript);
        setAppState('thinking');
      } else {
        setAppState('idle');
      }
    } else {
      // Start listening
      if (appState === 'speaking' && synthesisRef.current) {
        synthesisRef.current.cancel(); // Interrupt agent
      }
      try {
        setTranscript('');
        recognitionRef.current.start();
      } catch (e) {
        console.error("Could not start recognition", e);
      }
    }
  };
  
  const handleStopAll = () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (synthesisRef.current) synthesisRef.current.cancel();
      setAppState('idle');
  };

  // Fun visualizer effect
  const simulateAudioLevel = (active: boolean) => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (!active) {
      setAudioLevel(0);
      return;
    }

    const updateLevel = () => {
      // Random level between 20 and 100 for visual effect
      setAudioLevel(Math.random() * 80 + 20);
      animationFrameRef.current = requestAnimationFrame(() => {
        setTimeout(updateLevel, 100); // 10fps update
      });
    };
    
    updateLevel();
  };

  // Load voices on mount for better availability
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
  }, []);


  const getStatusContent = () => {
    switch (appState) {
      case 'idle':
        return {
          title: 'Ready',
          icon: <RadioReceiver size={20} />,
          subtitle: errorText || 'Tap the microphone to start speaking'
        };
      case 'listening':
        return {
          title: 'Listening...',
          icon: <User size={20} />,
          subtitle: transcript || 'I am listening...'
        };
      case 'thinking':
        return {
          title: 'Thinking...',
          icon: <Loader2 size={20} className="animate-spin" />,
          subtitle: transcript ? \`"\${transcript}"\` : 'Processing request...'
        };
      case 'speaking':
        return {
          title: 'VibIndu',
          icon: <Bot size={20} />,
          subtitle: 'Speaking response...'
        };
    }
  };

  const status = getStatusContent();
  const isAudioActive = appState === 'listening' || appState === 'speaking';

  return (
    <Container>
      
      <OrbContainer>
        <Orb $state={appState} />
      </OrbContainer>

      <StatusTextContainer>
        <StatusTitle $state={appState}>
          {status.icon} {status.title}
        </StatusTitle>
        <StatusSubtitle>
          {status.subtitle}
        </StatusSubtitle>
      </StatusTextContainer>

      {/* Visualizer */}
      <VisualizerBars>
        {[...Array(6)].map((_, i) => (
          <Bar key={i} $delay={i * 0.1} $active={isAudioActive} style={{ 
              transform: isAudioActive ? undefined : \`scaleY(\${0.2 + (audioLevel / 200) * (Math.random() + 0.5)})\` 
           }} />
        ))}
      </VisualizerBars>

      <ControlsContainer>
          {appState !== 'idle' && (
              <ActionButton 
                onClick={handleStopAll}
                title="Interrupt / Stop"
              >
                  <Square size={20} fill="currentColor" />
              </ActionButton>
          )}

        <ActionButton 
          $primary={appState === 'idle'} 
          $danger={appState === 'listening'}
          onClick={toggleListening}
          title={appState === 'listening' ? "Stop recording" : "Hold to talk"}
        >
          {appState === 'listening' ? <MicOff size={24} /> : <Mic size={24} />}
        </ActionButton>

      </ControlsContainer>

    </Container>
  );
};

export default LiveVoiceMode;
