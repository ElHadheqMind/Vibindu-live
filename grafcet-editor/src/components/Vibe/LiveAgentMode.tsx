import React, { useState, useEffect, useRef, useCallback } from 'react';
import html2canvas from 'html2canvas';
import styled, { keyframes } from 'styled-components';
import { Send, Paperclip, CheckCircle, Loader2, Mic } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Constants & State Color Map ─────────────────────────────────────────────

const STATE_COLORS = {
    idle: {
        orb: 'radial-gradient(circle at 35% 30%, #818cf8, #4f46e5, #312e81)',
        glow: 'rgba(99, 102, 241, 0.2)',
        ring: 'rgba(99, 102, 241, 0.2)',
        label: '#312e81',
        accent: '#6366f1'
    },
    listening: {
        orb: 'radial-gradient(circle at 35% 30%, #fbbf24, #f59e0b, #b45309)',
        glow: 'rgba(245, 158, 11, 0.25)',
        ring: 'rgba(245, 158, 11, 0.3)',
        label: '#b45309',
        accent: '#f59e0b'
    },
    thinking: {
        orb: 'radial-gradient(circle at 35% 30%, #c084fc, #a855f7, #6b21a8)',
        glow: 'rgba(168, 85, 247, 0.25)',
        ring: 'rgba(168, 85, 247, 0.25)',
        label: '#6b21a8',
        accent: '#a855f7'
    },
    speaking: {
        orb: 'radial-gradient(circle at 35% 30%, #67e8f9, #06b6d4, #0e7490)',
        glow: 'rgba(6, 182, 212, 0.25)',
        ring: 'rgba(6, 182, 212, 0.25)',
        label: '#0e7490',
        accent: '#06b6d4'
    },
    inactive: {
        orb: 'radial-gradient(circle at 35% 30%, #475569, #1e293b, #0f172a)',
        glow: 'rgba(71, 85, 105, 0.15)',
        ring: 'rgba(71, 85, 105, 0.15)',
        label: '#1e293b',
        accent: '#475569'
    },
    dispatching: {
        orb: 'radial-gradient(circle at 35% 30%, #fde68a, #fbbf24, #92400e)',
        glow: 'rgba(245, 158, 11, 0.3)',
        ring: 'rgba(245, 158, 11, 0.4)',
        label: '#92400e',
        accent: '#fbbf24'
    },
};

// ─── Legacy Animations (kept for simple cases) ───────────────────────────────

const noiseAnim = keyframes`
  0% { transform: translate(0, 0); }
  25% { transform: translate(-1px, 2px); }
  50% { transform: translate(1px, -1px); }
  75% { transform: translate(-2px, 1px); }
  100% { transform: translate(0, 0); }
`;

const shimmer = keyframes`
  0%, 100% { opacity: 0.6; filter: blur(0px); }
  50% { opacity: 1; filter: blur(1px); }
`;

// ─── Styled Components (Enhanced with Glassmorphism & Framer Motion) ─────────

const Overlay = styled(motion.div)`
  position: absolute;
  inset: 0;
  z-index: 100;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(32px) saturate(200%);
  -webkit-backdrop-filter: blur(32px) saturate(200%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
`;

const NoiseBg = styled.div`
  position: absolute;
  inset: -20px;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E");
  opacity: 0.04;
  pointer-events: none;
  animation: ${noiseAnim} 8s infinite linear;
`;

const GradientBg = styled(motion.div)<{ $state: string }>`
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at 50% 50%,
    ${props => (STATE_COLORS[props.$state as keyof typeof STATE_COLORS] || STATE_COLORS.idle).glow} 0%,
    transparent 70%
  );
  opacity: 0.4;
  pointer-events: none;
`;


const OrbScene = styled.div`
  position: relative;
  width: 300px;
  height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 40px;
`;

const Ring = styled(motion.div)<{ $state: string }>`
  position: absolute;
  border-radius: 50%;
  border: 1px solid ${props => (STATE_COLORS[props.$state as keyof typeof STATE_COLORS] || STATE_COLORS.idle).ring};
  pointer-events: none;
`;

const Particle = styled(motion.div)`
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(192, 132, 252, 0.7);
  filter: blur(1px);
  pointer-events: none;
`;

const OrbWrapper = styled(motion.div)`
  position: relative;
  z-index: 5;
`;

const Orb = styled(motion.div)<{ $state: string }>`
  width: 140px;
  height: 140px;
  border-radius: 50%;
  background: ${props => (STATE_COLORS[props.$state as keyof typeof STATE_COLORS] || STATE_COLORS.idle).orb};
  box-shadow: 
    0 0 60px ${props => (STATE_COLORS[props.$state as keyof typeof STATE_COLORS] || STATE_COLORS.idle).glow},
    inset 0 4px 12px rgba(255,255,255,0.3),
    inset 0 -8px 16px rgba(0,0,0,0.4);
  position: relative;
  overflow: hidden;
  
  &::before {
    content: '';
    position: absolute;
    top: 10%;
    left: 15%;
    width: 40%;
    height: 30%;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, transparent 80%);
    border-radius: 50%;
    filter: blur(6px);
  }
`;

const WaveCanvas = styled.canvas`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  z-index: 3;
  pointer-events: none;
`;

// Video UI components removed to prevent double circles.

const ContentContainer = styled(motion.div)`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 450px;
  z-index: 10;
`;

const StateLabel = styled(motion.div)<{ $state: string }>`
  color: ${props => (STATE_COLORS[props.$state as keyof typeof STATE_COLORS] || STATE_COLORS.idle).label};
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  margin-bottom: 12px;
  font-family: 'Inter', system-ui, sans-serif;
  text-shadow: 0 0 20px ${props => (STATE_COLORS[props.$state as keyof typeof STATE_COLORS] || STATE_COLORS.idle).glow};
  animation: ${shimmer} 3s infinite ease-in-out;
`;

const SubLabel = styled(motion.div)`
  color: rgba(0, 0, 0, 0.6);
  font-size: 0.95rem;
  line-height: 1.6;
  font-family: 'Inter', system-ui, sans-serif;
  min-height: 3rem;
  padding: 0 20px;
`;

const ControlArea = styled(motion.div)`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  margin-top: 48px;
`;

const GlassButton = styled(motion.button)<{ $primary?: boolean; $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 14px 32px;
  border-radius: 100px;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-family: 'Inter', system-ui, sans-serif;
  transition: border 0.3s ease;
  
  ${props => props.$primary ? `
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    color: #1c1917;
    box-shadow: 0 8px 32px rgba(245, 158, 11, 0.15);
    border: none;
    &:hover { border: none; }
  ` : `
    background: rgba(0, 0, 0, 0.05);
    color: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(0, 0, 0, 0.08);
    &:hover {
      background: rgba(0, 0, 0, 0.08);
      border: 1px solid rgba(0, 0, 0, 0.15);
      color: black;
    }
  `}

  ${props => props.$active && props.$primary && `
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    box-shadow: 0 8px 32px rgba(16, 185, 129, 0.2);
  `}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const HiddenInput = styled.input`
  display: none;
`;

// ─── Types ───────────────────────────────────────────────────────────────────

type AgentState = 'connecting' | 'inactive' | 'idle' | 'listening' | 'thinking' | 'speaking' | 'dispatching' | 'error';

interface LiveAgentModeProps {
    onDispatch: (finalQuery: string) => void;
    onClose: () => void;
    projectPath?: string;
}

// ─── Component Logic ──────────────────────────────────────────────────────────

export const LiveAgentMode: React.FC<LiveAgentModeProps> = ({ onDispatch, onClose, projectPath }) => {
    const [agentState, setAgentState] = useState<AgentState>('connecting');
    const agentStateRef = useRef<AgentState>('connecting');
    const [dispatchVisible, setDispatchVisible] = useState(false);
    const [lastModelTranscript, setLastModelTranscript] = useState('');
    const [readyForDispatch, setReadyForDispatch] = useState(false);
    const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
    const [isGeneratingSpec, setIsGeneratingSpec] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const finalQueryRef = useRef<string>('');

    useEffect(() => { agentStateRef.current = agentState; }, [agentState]);

    // Audio context & refs
    const audioCtxRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const animFrameRef = useRef<number>(0);
    const nextPlayTimeRef = useRef<number>(0);
    const isMicActiveRef = useRef<boolean>(false);

    // Video refs
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const frameTimerRef = useRef<any>(null);
    const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const isCapturingRef = useRef<boolean>(false);

    // Stability Refs
    const onDispatchRef = useRef(onDispatch);
    const onCloseRef = useRef(onClose);
    const readyForDispatchRef = useRef(readyForDispatch);
    const errorTimeoutRef = useRef<any>(null);

    useEffect(() => { onDispatchRef.current = onDispatch; }, [onDispatch]);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
    useEffect(() => { readyForDispatchRef.current = readyForDispatch; }, [readyForDispatch]);

    // ── Audio Playback ────────────────────────────────────────────────────────
    const playAudioChunk = useCallback((b64: string, sampleRate: number) => {
        try {
            const ctx = audioCtxRef.current || new AudioContext();
            if (!audioCtxRef.current) {
                audioCtxRef.current = ctx;
                nextPlayTimeRef.current = ctx.currentTime;
            }

            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const pcm16 = new Int16Array(bytes.buffer);
            const float32 = new Float32Array(pcm16.length);
            for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768;

            const buffer = ctx.createBuffer(1, float32.length, sampleRate);
            buffer.copyToChannel(float32, 0);

            const source = ctx.createBufferSource();
            source.buffer = buffer;

            // Connect to analyser for visual feedback
            if (analyserRef.current) {
                source.connect(analyserRef.current);
            }
            
            source.connect(ctx.destination);

            const startTime = Math.max(ctx.currentTime, nextPlayTimeRef.current);
            source.start(startTime);
            nextPlayTimeRef.current = startTime + buffer.duration;
        } catch (err) {
            console.error('[LiveAgent] Playback error:', err);
        }
    }, []);

    // ── Waveform Drawing ──────────────────────────────────────────────────────
    const drawWaveform = useCallback(() => {
        const draw = () => {
            animFrameRef.current = requestAnimationFrame(draw);
            const canvas = canvasRef.current;
            const analyser = analyserRef.current;
            if (!canvas || !analyser) return;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteTimeDomainData(dataArray);

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const cx = canvas.width / 2;
            const cy = canvas.height / 2;
            const radius = (canvas.width / 2) * 0.61;
            const stateColors = STATE_COLORS[agentStateRef.current === 'connecting' || agentStateRef.current === 'inactive' ? 'inactive' : agentStateRef.current as keyof typeof STATE_COLORS] || STATE_COLORS.idle;

            ctx.beginPath();
            for (let i = 0; i < dataArray.length; i++) {
                const amplitude = (dataArray[i] - 128) / 128;
                const angle = (i / dataArray.length) * Math.PI * 2;
                const r = radius + amplitude * 25;
                const x = cx + r * Math.cos(angle);
                const y = cy + r * Math.sin(angle);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.strokeStyle = stateColors.label + 'cc';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            
            // Subtle fill
            ctx.fillStyle = stateColors.label + '1a';
            ctx.fill();
        };
        draw();
    }, []);

    // ── File Handling ─────────────────────────────────────────────────────────
    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadedFileName(file.name);
        setIsGeneratingSpec(true);

        const agentsBaseUrl = import.meta.env.VITE_AGENTS_BASE_URL || `http://${window.location.hostname}:8000`;
        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64 = event.target?.result as string;

            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'file_upload',
                    name: file.name,
                    size: file.size,
                    mimeType: file.type,
                    data: base64
                }));
            }

            if (projectPath) {
                try {
                    await fetch(`${agentsBaseUrl}/api/spec/upload`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            file: { name: file.name, type: file.type, data: base64 },
                            projectPath
                        })
                    });
                } catch (err) {
                    console.error('[LiveAgent] Spec generation failed:', err);
                } finally {
                    setIsGeneratingSpec(false);
                }
            } else {
                setIsGeneratingSpec(false);
            }
        };
        reader.readAsDataURL(file);
    }, [projectPath]);

    // ── Screenshot Capture ───────────────────────────────────────────────────
    const handleCaptureScreenshot = useCallback(async () => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;
        const overlay = document.getElementById('live-agent-overlay');
        try {
            if (overlay) overlay.style.opacity = '0';
            const fullCanvas = await html2canvas(document.body, { useCORS: true, scale: 1, logging: false });
            const maxDim = 1280;
            let width = fullCanvas.width;
            let height = fullCanvas.height;
            if (width > maxDim || height > maxDim) {
                if (width > height) { height = (height / width) * maxDim; width = maxDim; }
                else { width = (width / height) * maxDim; height = maxDim; }
            }
            const resizedCanvas = document.createElement('canvas');
            resizedCanvas.width = width; resizedCanvas.height = height;
            const ctx = resizedCanvas.getContext('2d');
            if (ctx) ctx.drawImage(fullCanvas, 0, 0, width, height);
            const frameData = resizedCanvas.toDataURL('image/jpeg', 0.6);
            wsRef.current.send(JSON.stringify({ type: 'image', data: frameData.split(',')[1] }));
        } catch (err) { console.error('[LiveAgent] Screenshot failed:', err); }
        finally { if (overlay) overlay.style.opacity = '1'; }
    }, []);

    // ── WebSocket Connectivity ────────────────────────────────────────────────
    const connectWebSocket = useCallback(() => {
        const agentsBaseUrl = import.meta.env.VITE_AGENTS_BASE_URL || `http://${window.location.hostname}:8000`;
        const wsUrl = agentsBaseUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws/live-agent';
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('[LiveAgent] WS opened');
            if (projectPath) ws.send(JSON.stringify({ type: 'set_context', projectPath }));
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                
                // Clear any pending error timeout when we get a valid message
                if (errorTimeoutRef.current) {
                    clearTimeout(errorTimeoutRef.current);
                    errorTimeoutRef.current = null;
                }

                if (msg.type === 'session_ready') {
                    setAgentState('inactive');
                }
                else if (msg.type === 'audio_chunk') {
                    if (msg.endOfTurn) {
                        const cur = agentStateRef.current;
                        if (['speaking', 'listening', 'thinking'].includes(cur)) {
                            setAgentState('idle');
                            setDispatchVisible(readyForDispatchRef.current);
                        }
                    } else if (msg.data && isMicActiveRef.current) {
                        setAgentState('speaking');
                        playAudioChunk(msg.data, msg.sampleRate || 24000);
                    }
                }
                else if (msg.type === 'transcript') {
                    if (msg.role === 'model' && msg.final) {
                        setLastModelTranscript(msg.text || '');
                        setReadyForDispatch(true);
                        setDispatchVisible(true);
                    }
                    if (msg.role === 'user' && msg.text) {
                        finalQueryRef.current = msg.text;
                        setAgentState('thinking');
                    }
                }
                else if (msg.type === 'dispatched') {
                    const query = msg.query || finalQueryRef.current;
                    if (query) {
                        finalQueryRef.current = query;
                        setAgentState('dispatching');
                        setTimeout(() => { 
                            onDispatchRef.current(query); 
                            setAgentState('idle'); 
                        }, 500); // Reduced from 1200 for robustness
                    }
                }
                else if (msg.type === 'interrupted') setAgentState('idle');
                else if (msg.type === 'error') {
                    console.error('[LiveAgent] WS reported error:', msg.message);
                    setAgentState('error');
                }
                else if (msg.type === 'task_progress') {
                    setAgentState('thinking');
                    setLastModelTranscript(msg.text || `${msg.agent} working...`);
                }
                else if (msg.type === 'task_complete') {
                    setAgentState('dispatching');
                    setLastModelTranscript('Task completed! ✅');
                }
                else if (msg.type === 'capture_screenshot_now') handleCaptureScreenshot();
                // Computer Agent relay: backend asks for a screenshot of the page
                else if (msg.type === 'screenshot_request') {
                    console.log('[LiveAgent] Computer Agent requesting screenshot via relay');
                    (async () => {
                        try {
                            const overlay = document.getElementById('live-agent-overlay');
                            if (overlay) overlay.style.opacity = '0';
                            await new Promise(r => setTimeout(r, 100));
                            const fullCanvas = await html2canvas(document.body, { useCORS: true, scale: 1, logging: false });
                            if (overlay) overlay.style.opacity = '1';
                            const maxW = msg.maxWidth || 1280;
                            const maxH = msg.maxHeight || 800;
                            let w = fullCanvas.width, h = fullCanvas.height;
                            if (w > maxW || h > maxH) {
                                const ratio = Math.min(maxW / w, maxH / h);
                                w = Math.floor(w * ratio);
                                h = Math.floor(h * ratio);
                            }
                            const resized = document.createElement('canvas');
                            resized.width = w; resized.height = h;
                            const ctx = resized.getContext('2d');
                            if (ctx) ctx.drawImage(fullCanvas, 0, 0, w, h);
                            // Use JPEG to prevent message size from exceeding Starlette's 1MB WebSocket limit
                            const b64 = resized.toDataURL('image/jpeg', 0.6).split(',')[1];
                            if (wsRef.current?.readyState === WebSocket.OPEN) {
                                wsRef.current.send(JSON.stringify({ type: 'screenshot_response', data: b64, width: w, height: h }));
                                console.log(`[LiveAgent] Screenshot sent: ${w}x${h}`);
                            }
                        } catch (err) {
                            console.error('[LiveAgent] Screenshot capture for computer agent failed:', err);
                            const overlay = document.getElementById('live-agent-overlay');
                            if (overlay) overlay.style.opacity = '1';
                        }
                    })();
                }
                // Computer Agent relay: backend wants to perform a click/type/scroll 
                else if (msg.type === 'computer_action') {
                    console.log('[LiveAgent] Computer Agent action via relay:', msg.action);
                    if (msg.action === 'click' || msg.action === 'move') {
                        const x = (msg.x / 1000) * window.innerWidth;
                        const y = (msg.y / 1000) * window.innerHeight;

                        // Temporarily bypass any agent overlays using visibility (more reliable than pointerEvents for React portals)
                        const caOverlay = document.getElementById('computer-agent-overlay');
                        const laOverlay = document.getElementById('live-agent-overlay');
                        const caOriginal = caOverlay ? caOverlay.style.visibility : '';
                        const laOriginal = laOverlay ? laOverlay.style.visibility : '';
                        
                        if (caOverlay) caOverlay.style.visibility = 'hidden';
                        if (laOverlay) laOverlay.style.visibility = 'hidden';

                        let el = document.elementFromPoint(x, y);

                        // Fallback: If elementFromPoint returns the body, root, or overlay, try finding by bounds
                        if (!el || el === document.body || el.id === 'root' || el.id?.includes('overlay')) {
                            console.log('[LiveAgent] elementFromPoint failed or returned root, using bounds fallback for', x, y);
                            const allElements = Array.from(document.querySelectorAll('*'));
                            // Sort by z-index and DOM order (roughly reverse to get top-most first)
                            const reversed = allElements.reverse();
                            for (const node of reversed) {
                                if (node.id?.includes('agent-overlay')) continue;
                                const rect = node.getBoundingClientRect();
                                if (
                                    x >= rect.left && 
                                    x <= rect.right && 
                                    y >= rect.top && 
                                    y <= rect.bottom &&
                                    window.getComputedStyle(node).pointerEvents !== 'none' &&
                                    window.getComputedStyle(node).visibility !== 'hidden'
                                ) {
                                    el = node;
                                    break;
                                }
                            }
                        }

                        if (caOverlay) caOverlay.style.visibility = caOriginal;
                        if (laOverlay) laOverlay.style.visibility = laOriginal;

                        if (el) {
                            const pointerover = new PointerEvent('pointerover', { view: window, bubbles: true, cancelable: true, clientX: x, clientY: y });
                            const mouseover = new MouseEvent('mouseover', { view: window, bubbles: true, cancelable: true, clientX: x, clientY: y });
                            const mousemove = new MouseEvent('mousemove', { view: window, bubbles: true, cancelable: true, clientX: x, clientY: y });
                            el.dispatchEvent(pointerover);
                            el.dispatchEvent(mouseover);
                            el.dispatchEvent(mousemove);

                            if (msg.action === 'click') {
                                // Full event simulation with exact coordinates
                                const eventConfig = { 
                                    view: window, 
                                    bubbles: true, 
                                    cancelable: true, 
                                    clientX: x, 
                                    clientY: y,
                                    offsetX: x - el.getBoundingClientRect().left,
                                    offsetY: y - el.getBoundingClientRect().top,
                                    screenX: x,
                                    screenY: y,
                                    button: 0,
                                    buttons: 1
                                };
                                
                                const pointerdown = new PointerEvent('pointerdown', eventConfig);
                                const mousedown = new MouseEvent('mousedown', eventConfig);
                                const pointerup = new PointerEvent('pointerup', { ...eventConfig, buttons: 0 });
                                const mouseup = new MouseEvent('mouseup', { ...eventConfig, buttons: 0 });
                                const click = new MouseEvent('click', { ...eventConfig, buttons: 0 });
                                
                                el.dispatchEvent(pointerdown);
                                el.dispatchEvent(mousedown);
                                el.dispatchEvent(pointerup);
                                el.dispatchEvent(mouseup);
                                el.dispatchEvent(click);
                                
                                // Fallback to native click if available
                                let clickTarget: HTMLElement | null = el as HTMLElement;
                                while (clickTarget && typeof clickTarget.click !== 'function') {
                                    clickTarget = clickTarget.parentElement;
                                }
                                if (clickTarget && typeof clickTarget.click === 'function') {
                                    clickTarget.click();
                                }
                            }
                        }
                    } else if (msg.action === 'key_type') {
                        const el = document.activeElement as HTMLInputElement;
                        if (el && 'value' in el) {
                            el.value += msg.text || '';
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    } else if (msg.action === 'key_press') {
                        document.dispatchEvent(new KeyboardEvent('keydown', { key: msg.text || '' }));
                    } else if (msg.action === 'scroll') {
                        window.scrollBy(0, (msg.direction === 'up' ? -1 : 1) * (msg.amount || 3) * 100);
                    }
                }
            } catch (e) { console.error('[LiveAgent] WS parse error', e); }
        };

        ws.onerror = () => {
            console.warn('[LiveAgent] WS connection error, waiting to see if it stabilizes...');
            if (!errorTimeoutRef.current && agentStateRef.current === 'connecting') {
                errorTimeoutRef.current = setTimeout(() => {
                    setAgentState('error');
                }, 3000);
            } else if (agentStateRef.current !== 'connecting') {
                setAgentState('error');
            }
        };

        ws.onclose = () => {
            console.log('[LiveAgent] WS closed');
        };
    }, [playAudioChunk, projectPath, handleCaptureScreenshot]);

    // ── Capture and Send Video Frame (periodic) ───────────────────────────────
    const captureAndSendFrame = useCallback(() => {
        if (wsRef.current?.readyState !== WebSocket.OPEN || !videoRef.current || isCapturingRef.current) {
            frameTimerRef.current = setTimeout(captureAndSendFrame, 1000);
            return;
        }
        isCapturingRef.current = true;
        try {
            const video = videoRef.current;
            if (video.videoWidth === 0) return;
            if (!captureCanvasRef.current) captureCanvasRef.current = document.createElement('canvas');
            const canvas = captureCanvasRef.current;
            const maxDim = 1024;
            let width = video.videoWidth;
            let height = video.videoHeight;
            if (width > maxDim || height > maxDim) {
                if (width > height) { height = (height / width) * maxDim; width = maxDim; }
                else { width = (width / height) * maxDim; height = maxDim; }
            }
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(video, 0, 0, width, height);
                wsRef.current.send(JSON.stringify({ type: 'image', data: canvas.toDataURL('image/jpeg', 0.5).split(',')[1] }));
            }
        } catch (err) { console.warn('[LiveAgent] Frame capture failed:', err); }
        finally {
            isCapturingRef.current = false;
            frameTimerRef.current = setTimeout(captureAndSendFrame, 1000);
        }
    }, []);

    // ── Mic Capture ──────────────────────────────────────────────────────────
    const startCapture = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 16000 }
            });
            streamRef.current = stream;
            const audioCtx = new AudioContext({ sampleRate: 16000 });
            audioCtxRef.current = audioCtx;
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            analyserRef.current = analyser;
            source.connect(analyser);

            const processor = audioCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = processor;
            source.connect(processor);
            processor.connect(audioCtx.destination);

            processor.onaudioprocess = (e) => {
                if (wsRef.current?.readyState !== WebSocket.OPEN) return;
                const inputData = e.inputBuffer.getChannelData(0);
                const pcm16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) pcm16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
                const b64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
                wsRef.current.send(JSON.stringify({ type: 'audio', data: b64 }));
                setAgentState(prev => prev === 'idle' ? 'listening' : prev);
            };

            drawWaveform();
            isMicActiveRef.current = true;
        } catch (err: any) {
            console.error('[LiveAgent] Capture error:', err);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                alert('Microphone access denied.');
            }
            setAgentState('error');
        }
    }, [drawWaveform]);

    const handleDispatch = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'dispatch' }));
        } else {
            const query = finalQueryRef.current;
            if (query) {
                setAgentState('dispatching');
                setTimeout(() => { onDispatchRef.current(query); onCloseRef.current(); }, 800);
            }
        }
        setDispatchVisible(false);
    }, []);

    const cleanup = useCallback(() => {
        if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
        cancelAnimationFrame(animFrameRef.current);
        if (frameTimerRef.current) clearTimeout(frameTimerRef.current);
        if (wsRef.current) {
            if (wsRef.current.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: 'end' }));
            wsRef.current.close();
        }
        if (scriptProcessorRef.current) scriptProcessorRef.current.disconnect();
        if (audioCtxRef.current) audioCtxRef.current.close();
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    }, []);

    useEffect(() => {
        connectWebSocket();
        return () => cleanup();
    }, [connectWebSocket, cleanup]);

    const displayState = (agentState === 'connecting' || agentState === 'inactive') ? 'inactive' : agentState;

    return (
        <Overlay
            id="live-agent-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
        >
            <NoiseBg />
            <GradientBg
                $state={displayState}
                animate={{
                    scale: [1, 1.15, 1],
                    opacity: [0.35, 0.5, 0.35]
                }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* Close button removed as VibIndu is now the only view for the sidebar */}


            {/* Removed VideoContainer to prevent double circles in the UI as per user request */}

            <OrbScene>
                <AnimatePresence>
                    {[0, 1, 2].map(i => (
                        <Ring
                            key={i}
                            $state={displayState}
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{
                                scale: [0.8, 2.0 + i * 0.5],
                                opacity: [0.7, 0]
                            }}
                            transition={{
                                duration: 3.5,
                                delay: i * 1.1,
                                repeat: Infinity,
                                ease: "easeOut"
                            }}
                            style={{ width: 140, height: 140 }}
                        />
                    ))}
                </AnimatePresence>

                {agentState === 'thinking' && [0, 1, 2, 3, 4, 5].map(i => (
                    <Particle
                        key={i}
                        animate={{
                            rotate: 360,
                            x: [110, 125, 110],
                        }}
                        transition={{
                            rotate: { duration: 4 + i * 0.6, repeat: Infinity, ease: "linear" },
                            x: { duration: 2.5, repeat: Infinity, ease: "easeInOut" },
                            delay: i * 0.4
                        }}
                        style={{ left: '50%', top: '50%' }}
                    />
                ))}

                <AnimatePresence>
                    {agentState === 'speaking' && [0, 1, 2].map(i => (
                        <Ring
                            key={`voice-${i}`}
                            $state="speaking"
                            initial={{ scale: 1, opacity: 0 }}
                            animate={{
                                scale: [1, 2.5],
                                opacity: [0.5, 0]
                            }}
                            transition={{
                                duration: 1.5,
                                repeat: Infinity,
                                delay: i * 0.5,
                                ease: "easeOut"
                            }}
                            style={{ width: 140, height: 140 }}
                        />
                    ))}
                </AnimatePresence>

                <OrbWrapper
                    animate={{
                        scale: [1, 1.05, 1],
                    }}
                    transition={{
                        scale: { duration: 4, repeat: Infinity, ease: "easeInOut" }
                    }}
                >
                    <Orb 
                        $state={displayState}
                        animate={agentState === 'speaking' ? {
                            boxShadow: [
                                `0 0 60px ${STATE_COLORS.speaking.glow}`,
                                `0 0 100px ${STATE_COLORS.speaking.glow}`,
                                `0 0 60px ${STATE_COLORS.speaking.glow}`
                            ]
                        } : {}}
                    >
                        <WaveCanvas ref={canvasRef} />
                    </Orb>
                </OrbWrapper>
            </OrbScene>

            <ContentContainer>
                <StateLabel
                    $state={displayState}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                >
                    VIBINDU
                </StateLabel>

                <SubLabel>
                    VibIndu
                </SubLabel>

                <ControlArea>
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.5 }}
                        style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}
                    >
                        <GlassButton
                            $active={!!uploadedFileName}
                            onClick={() => !isGeneratingSpec && fileInputRef.current?.click()}
                            disabled={isGeneratingSpec}
                            whileHover={{ scale: 1.04, backgroundColor: 'rgba(255,255,255,0.08)' }}
                            whileTap={{ scale: 0.96 }}
                        >
                            {isGeneratingSpec ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : uploadedFileName ? (
                                <CheckCircle size={18} color="#10b981" />
                            ) : (
                                <Paperclip size={18} />
                            )}
                            {isGeneratingSpec ? 'Analyzing Spec...' : (uploadedFileName || 'Upload Spec (PDF)')}
                        </GlassButton>

                        <HiddenInput
                            type="file"
                            ref={fileInputRef}
                            accept="application/pdf,image/*"
                            onChange={handleFileChange}
                        />

                        {agentState === 'inactive' && (
                            <GlassButton
                                $primary
                                onClick={() => {
                                    wsRef.current?.send(JSON.stringify({ type: 'start_session' }));
                                    setAgentState('idle');
                                    startCapture();
                                }}
                                whileHover={{ 
                                    scale: 1.08, 
                                    boxShadow: '0 15px 45px rgba(245, 158, 11, 0.45)',
                                    filter: 'brightness(1.1)'
                                }}
                                whileTap={{ scale: 0.92 }}
                            >
                                <Mic size={22} />
                                Tap to Talk
                            </GlassButton>
                        )}
                    </motion.div>

                    <AnimatePresence>
                        {dispatchVisible && (
                            <GlassButton
                                $primary
                                initial={{ opacity: 0, scale: 0.8, y: 30 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.8, y: 30 }}
                                onClick={handleDispatch}
                                whileHover={{ scale: 1.08, filter: 'brightness(1.1)' }}
                                whileTap={{ scale: 0.92 }}
                            >
                                <Send size={20} />
                                Execute
                            </GlassButton>
                        )}
                    </AnimatePresence>
                </ControlArea>
            </ContentContainer>
        </Overlay>
    );
};

export default LiveAgentMode;
