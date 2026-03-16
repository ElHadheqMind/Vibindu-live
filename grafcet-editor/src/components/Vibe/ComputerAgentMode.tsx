import React, { useState, useEffect, useRef, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { X, Send, Monitor, Loader2 } from 'lucide-react';
import html2canvas from 'html2canvas';

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const slideUp = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

const pulsate = keyframes`
  0% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(1); opacity: 0.8; }
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
  max-width: 600px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  animation: ${slideUp} 0.4s ease;
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
    color: #38bdf8;
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
  min-height: 200px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: relative;
  overflow: hidden;
`;

const StatusText = styled.div`
  color: #e2e8f0;
  font-size: 0.95rem;
  line-height: 1.6;
`;

const ActionBadge = styled.div`
  align-self: flex-start;
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  padding: 4px 12px;
  border-radius: 100px;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 1px solid rgba(56, 189, 248, 0.3);
  animation: ${pulsate} 2s infinite ease-in-out;
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
  background: rgba(30, 41, 59, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
`;

interface ComputerAgentModeProps {
    onClose: () => void;
}

export const ComputerAgentMode: React.FC<ComputerAgentModeProps> = ({ onClose }) => {
    const [prompt, setPrompt] = useState('');
    const [status, setStatus] = useState('Idle. Ready for a command.');
    const [currentAction, setCurrentAction] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const overlayRef = useRef<HTMLDivElement>(null);

    // ── Screenshot capture: captures the REAL page behind the overlay ──────
    const captureScreenshot = useCallback(async (ws: WebSocket, maxWidth = 1280, maxHeight = 800, quality = 0.8) => {
        try {
            // Hide the overlay temporarily so we capture the actual app
            const overlay = overlayRef.current;
            if (overlay) overlay.style.display = 'none';

            // Small delay to let the DOM repaint
            await new Promise(r => setTimeout(r, 100));

            const fullCanvas = await html2canvas(document.body, {
                useCORS: true,
                scale: 1,
                logging: false,
            });

            // Restore overlay
            if (overlay) overlay.style.display = '';

            // Resize if needed
            let width = fullCanvas.width;
            let height = fullCanvas.height;
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width = Math.floor(width * ratio);
                height = Math.floor(height * ratio);
            }

            const resizedCanvas = document.createElement('canvas');
            resizedCanvas.width = width;
            resizedCanvas.height = height;
            const ctx = resizedCanvas.getContext('2d');
            if (ctx) ctx.drawImage(fullCanvas, 0, 0, width, height);

            const dataUrl = resizedCanvas.toDataURL('image/png', quality);
            const b64 = dataUrl.split(',')[1];

            // Send back to server
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'screenshot_response',
                    data: b64,
                    width,
                    height,
                }));
                console.log(`[ComputerAgent] Screenshot sent: ${width}x${height}, ${b64.length} chars`);
            }
        } catch (err) {
            console.error('[ComputerAgent] Screenshot capture failed:', err);
            // Restore overlay on error
            const overlay = overlayRef.current;
            if (overlay) overlay.style.display = '';
        }
    }, []);

    // ── Execute a computer action on the DOM ──────────────────────────────
    const executeAction = useCallback((action: string, args: any) => {
        console.log(`[ComputerAgent] Executing action: ${action}`, args);

        if (action === 'click' || action === 'move') {
            // Coordinates are 0-1000 normalized — convert to viewport pixels
            const x = (args.x / 1000) * window.innerWidth;
            const y = (args.y / 1000) * window.innerHeight;

            // Temporarily ignore agent overlays using visibility
            const caOverlay = document.getElementById('computer-agent-overlay');
            const laOverlay = document.getElementById('live-agent-overlay');
            const caOriginal = caOverlay ? caOverlay.style.visibility : '';
            const laOriginal = laOverlay ? laOverlay.style.visibility : '';
            
            if (caOverlay) caOverlay.style.visibility = 'hidden';
            if (laOverlay) laOverlay.style.visibility = 'hidden';
            
            let el = document.elementFromPoint(x, y);

            // Fallback: If elementFromPoint returns the body, root, or overlay, try finding by bounds
            if (!el || el === document.body || el.id === 'root' || el.id?.includes('overlay')) {
                console.log('[ComputerAgent] elementFromPoint failed or returned root, using bounds fallback for', x, y);
                const allElements = Array.from(document.querySelectorAll('*'));
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
                // Always dispatch move/hover events first
                const pointerover = new PointerEvent('pointerover', { view: window, bubbles: true, cancelable: true, clientX: x, clientY: y });
                const mouseover = new MouseEvent('mouseover', { view: window, bubbles: true, cancelable: true, clientX: x, clientY: y });
                const mousemove = new MouseEvent('mousemove', { view: window, bubbles: true, cancelable: true, clientX: x, clientY: y });
                el.dispatchEvent(pointerover);
                el.dispatchEvent(mouseover);
                el.dispatchEvent(mousemove);

                if (action === 'click') {
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
                    console.log(`[ComputerAgent] Clicked element at (${x}, ${y}):`, el.tagName);
                }
            }
        } else if (action === 'key_type') {
            // Type text into the currently focused element
            const activeEl = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
            if (activeEl && ('value' in activeEl)) {
                activeEl.value += args.text || '';
                activeEl.dispatchEvent(new Event('input', { bubbles: true }));
                console.log(`[ComputerAgent] Typed: "${args.text}"`);
            }
        } else if (action === 'key_press') {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: args.text || '' }));
        } else if (action === 'scroll') {
            const amount = (args.amount || 3) * 100;
            window.scrollBy(0, args.direction === 'up' ? -amount : amount);
        } else if (action === 'navigate') {
            if (args.url) window.location.href = args.url;
        }
    }, []);

    useEffect(() => {
        const agentsBaseUrl = import.meta.env.VITE_AGENTS_BASE_URL || `http://${window.location.hostname}:8000`;
        const wsUrl = agentsBaseUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/computer/ws/computer-use';
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('[ComputerAgent] WS connected');
            // Send viewport info immediately
            ws.send(JSON.stringify({
                type: 'viewport_info',
                width: window.innerWidth,
                height: window.innerHeight,
            }));
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);

            if (msg.type === 'screenshot_request') {
                // Backend is asking for a screenshot of the current page
                console.log('[ComputerAgent] Screenshot requested by backend');
                captureScreenshot(ws, msg.maxWidth, msg.maxHeight, msg.quality);
            } else if (msg.type === 'computer_action') {
                // Backend wants us to perform a click/type/scroll on the DOM
                executeAction(msg.action, msg);
            } else if (msg.type === 'status') {
                setStatus(msg.text);
            } else if (msg.type === 'action') {
                setCurrentAction(`${msg.name}(${JSON.stringify(msg.args)})`);
            } else if (msg.type === 'complete') {
                setStatus(`✅ Task complete: ${msg.text}`);
                setCurrentAction(null);
                setIsProcessing(false);
            } else if (msg.type === 'info') {
                setStatus(msg.text);
            }
        };

        ws.onclose = () => {
            console.log('[ComputerAgent] WS closed');
        };

        return () => {
            ws.close();
        };
    }, [captureScreenshot, executeAction]);

    const handleSend = () => {
        if (!prompt.trim() || !wsRef.current) return;

        setIsProcessing(true);
        setStatus('Sending task to agent...');
        wsRef.current.send(JSON.stringify({ type: 'prompt', text: prompt }));
        setPrompt('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isProcessing) {
            handleSend();
        }
    };

    return (
        <Overlay ref={overlayRef} id="computer-agent-overlay">
            <Container>
                <Header>
                    <Title>
                        <Monitor size={24} color="#38bdf8" />
                        Computer <span>Use</span> Agent
                    </Title>
                    <CloseBtn onClick={onClose}>
                        <X size={20} />
                    </CloseBtn>
                </Header>

                <DisplayArea>
                    {isProcessing && !currentAction && (
                        <LoadingOverlay>
                            <Loader2 className="animate-spin" size={32} color="#38bdf8" />
                        </LoadingOverlay>
                    )}

                    <StatusText>{status}</StatusText>

                    {currentAction && (
                        <ActionBadge>
                            Active: {currentAction}
                        </ActionBadge>
                    )}

                    {!isProcessing && !currentAction && status.includes('✅') && (
                        <div style={{ color: '#10b981', fontSize: '0.8rem', marginTop: 'auto' }}>
                            Execution finished successfully.
                        </div>
                    )}
                </DisplayArea>

                <InputWrapper>
                    <Input
                        placeholder="Type a command (e.g., 'Create a new GSRSM mode')"
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
                    This agent sees your screen and performs UI actions on your behalf.
                </div>
            </Container>
        </Overlay>
    );
};

export default ComputerAgentMode;
