import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { FiX, FiSend, FiPaperclip, FiPlus, FiClock, FiChevronLeft, FiChevronDown, FiTrash2 } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useProjectStore } from '../store/useProjectStore';
import { useSimulationStore } from '../store/useSimulationStore';
import { useGsrsmFileStore } from '../store/useGsrsmFileStore';
import { useGsrsmStore } from '../store/useGsrsmStore';
import { useFileExplorerStore } from '../store/useFileExplorerStore';
import { useVibeChatStore } from '../store/useVibeChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { ApiService } from '../services/apiService';
import { StreamingText } from './StreamingText';
import SfcThumbnailRenderer from './Vibe/SfcThumbnailRenderer';
import { LiveAgentMode } from './Vibe/LiveAgentMode';
import { ComputerAgentMode } from './Vibe/ComputerAgentMode';
import { StorytellerMode } from './Vibe/StorytellerMode';
import { API_BASE_URL, AGENTS_BASE_URL } from '../config';

// Light Theme Colors (matching app theme)
const THEME = {
  bg: '#ffffff',
  bgSecondary: '#f8f9fa',
  border: '#e0e0e0',
  text: '#212121',
  textSecondary: '#757575',
  primary: '#1976d2',
  primaryHover: '#1565c0',
  accent: '#ff6b35',
  success: '#4caf50',
  inputBg: '#f5f5f5',
  inputFocus: '#e3f2fd'
};

// Min and max width constraints for the sidebar
const MIN_SIDEBAR_WIDTH = 320;
const MAX_SIDEBAR_WIDTH = 800;
const DEFAULT_SIDEBAR_WIDTH = 420;

const SidebarContainer = styled.div<{ $isOpen: boolean; $width: number; $isResizing: boolean }>`
  width: ${props => props.$isOpen ? `${props.$width}px` : '0px'};
  min-width: ${props => props.$isOpen ? `${MIN_SIDEBAR_WIDTH}px` : '0px'};
  max-width: ${MAX_SIDEBAR_WIDTH}px;
  background-color: ${THEME.bg};
  border-left: 1px solid ${THEME.border};
  display: flex;
  flex-direction: column;
  transition: ${props => props.$isResizing ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'};
  height: 100%;
  position: relative;
  flex-shrink: 0;
  z-index: 1000;
  overflow: hidden;
  box-shadow: ${props => props.$isOpen ? '-5px 0 15px rgba(0,0,0,0.1)' : 'none'};
`;

const ResizeHandle = styled.div<{ $isResizing: boolean }>`
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  background: ${props => props.$isResizing ? THEME.primary : 'transparent'};
  transition: background 0.2s ease;
  z-index: 1001;

  &:hover {
    background: ${THEME.primary};
  }

  &::after {
    content: '';
    position: absolute;
    left: 2px;
    top: 50%;
    transform: translateY(-50%);
    width: 2px;
    height: 40px;
    background: ${props => props.$isResizing ? 'white' : THEME.border};
    border-radius: 1px;
    opacity: ${props => props.$isResizing ? 1 : 0};
    transition: opacity 0.2s ease;
  }

  &:hover::after {
    opacity: 1;
    background: white;
  }
`;

const Header = styled.div`
  padding: 12px 16px;
  border-bottom: 1px solid ${THEME.border};
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: ${THEME.bg};
  flex-shrink: 0;
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const HeaderButton = styled.button`
  background: none;
  border: none;
  color: ${THEME.textSecondary};
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;

  &:hover {
    background-color: ${THEME.bgSecondary};
    color: ${THEME.text};
  }
`;

const StatusDot = styled.div<{ $status: 'connecting' | 'connected' | 'error' | 'disconnected' }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: ${props => {
    switch (props.$status) {
      case 'connected': return THEME.success;
      case 'connecting': return '#ffaa00';
      case 'error': return '#ff4444';
      default: return THEME.textSecondary;
    }
  }};
  box-shadow: ${props => props.$status === 'connected' ? `0 0 8px ${THEME.success}` : 'none'};
`;

const HeaderTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: ${THEME.text};
  font-weight: 600;
  font-size: 0.9rem;
`;

const Content = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: 0; 
  background-color: ${THEME.bg};
  min-height: 0;
`;

const ChatContentWrapper = styled.div`
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

const ChatContent = styled.div`
  display: flex;
  flex-direction: column;
  padding: 20px;
  gap: 15px;
  min-height: 0;
  overflow-y: scroll;
  flex: 1;

  /* Custom scrollbar styling */
  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: ${THEME.border};
    border-radius: 4px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: ${THEME.textSecondary};
  }
`;

const ScrollToBottomButton = styled.button<{ $visible: boolean }>`
  position: absolute;
  bottom: 12px;
  right: 20px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: ${THEME.primary};
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  opacity: ${props => props.$visible ? 1 : 0};
  visibility: ${props => props.$visible ? 'visible' : 'hidden'};
  transform: ${props => props.$visible ? 'translateY(0)' : 'translateY(10px)'};
  transition: opacity 0.2s ease, visibility 0.2s ease, transform 0.2s ease;
  z-index: 10;

  &:hover {
    background: ${THEME.primaryHover};
    transform: translateY(-2px);
  }
`;

const Footer = styled.div`
  padding: 16px 20px;
  border-top: 1px solid ${THEME.border};
  background-color: ${THEME.bg};
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const TextInputContainer = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background-color: ${THEME.inputBg};
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid ${THEME.border};

  &:focus-within {
    border-color: ${THEME.primary};
    background-color: ${THEME.inputFocus};
  }
`;

const StyledInput = styled.textarea`
  flex: 1;
  background: transparent;
  border: none;
  color: ${THEME.text};
  outline: none;
  font-family: inherit;
  font-size: 0.95rem;
  resize: none;
  height: 63px;
  max-height: 63px;
  overflow-y: scroll;
  line-height: 1.4;

  &::placeholder {
    color: ${THEME.textSecondary};
  }

  /* Custom scrollbar styling */
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: ${THEME.border};
    border-radius: 3px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: ${THEME.textSecondary};
  }
`;

const IconButton = styled.button`
  background: none;
  border: none;
  color: ${THEME.textSecondary};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border-radius: 4px;
  
  &:hover {
    color: ${THEME.primary};
    background-color: rgba(0,123,255,0.1);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SendButton = styled.button`
  background-color: ${THEME.primary};
  color: white;
  border: none;
  border-radius: 6px;
  padding: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
  min-width: 32px;
  min-height: 32px;

  &:hover {
     background-color: ${THEME.primaryHover};
  }

  &:disabled {
    background-color: ${THEME.border};
    cursor: not-allowed;
  }
`;

const SettingsRow = styled.div`
  display: flex;
  gap: 12px;
`;

const SettingGroup = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;



const Select = styled.select`
  background-color: ${THEME.inputBg};
  color: ${THEME.text};
  border: 1px solid ${THEME.border};
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.85rem;
  font-family: inherit;
  cursor: pointer;
  outline: none;

  &:hover {
    border-color: ${THEME.primary};
  }

  &:focus {
    border-color: ${THEME.primary};
    background-color: ${THEME.inputFocus};
  }

  option {
    background-color: ${THEME.inputBg};
    color: ${THEME.text};
  }
`;

// Quick Start Suggestions for VibIndu Agent Testing
const QuickStartContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  align-items: center;
  justify-content: center;
  height: 100%;
`;

const QuickStartTitle = styled.h3`
  color: ${THEME.text};
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
`;

const QuickStartSubtitle = styled.p`
  color: ${THEME.textSecondary};
  font-size: 0.85rem;
  margin: 0;
  text-align: center;
`;

const QuickStartButton = styled.button`
  background: linear-gradient(135deg, rgba(0, 123, 255, 0.15), rgba(0, 212, 255, 0.15));
  border: 1px solid ${THEME.primary};
  color: ${THEME.text};
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  width: 100%;
  max-width: 320px;
  text-align: left;
  transition: all 0.2s;

  &:hover {
    background: linear-gradient(135deg, rgba(0, 123, 255, 0.25), rgba(0, 212, 255, 0.25));
    border-color: ${THEME.accent};
  }
`;

const QuickStartButtonTitle = styled.div`
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 4px;
`;

const QuickStartButtonDesc = styled.div`
  font-size: 0.75rem;
  color: ${THEME.textSecondary};
`;

// Render Actions Section - Prominent buttons for image/video generation
const RenderActionsSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed ${THEME.border};
  width: 100%;
  max-width: 280px;
`;

const RenderSectionTitle = styled.div`
  font-size: 0.75rem;
  font-weight: 600;
  color: ${THEME.textSecondary};
  text-align: center;
  margin-bottom: 2px;
`;

const RenderButtonsRow = styled.div`
  display: flex;
  gap: 8px;
  width: 100%;
`;

const RenderButton = styled.button<{ $variant: 'image' | 'video'; $isLoading?: boolean }>`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 10px 8px;
  border-radius: 8px;
  cursor: ${props => props.$isLoading ? 'wait' : 'pointer'};
  transition: all 0.3s ease;
  border: 1px solid transparent;

  ${props => props.$variant === 'image' ? `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    box-shadow: 0 2px 10px rgba(102, 126, 234, 0.3);

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
  ` : `
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    color: white;
    box-shadow: 0 2px 10px rgba(245, 87, 108, 0.3);

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(245, 87, 108, 0.4);
    }
  `}

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }
`;

const RenderButtonIcon = styled.div`
  font-size: 1.3rem;
  line-height: 1;
`;

const RenderButtonLabel = styled.div`
  font-size: 0.75rem;
  font-weight: 600;
  text-align: center;
`;

const RenderButtonSubtext = styled.div`
  font-size: 0.6rem;
  opacity: 0.9;
  text-align: center;
`;

const RenderStatusBadge = styled.div<{ $status: 'idle' | 'loading' | 'success' | 'error' }>`
  font-size: 0.75rem;
  padding: 4px 10px;
  border-radius: 12px;
  text-align: center;

  ${props => {
    switch (props.$status) {
      case 'loading':
        return `background: rgba(255, 193, 7, 0.2); color: #ffc107;`;
      case 'success':
        return `background: rgba(76, 175, 80, 0.2); color: #4caf50;`;
      case 'error':
        return `background: rgba(244, 67, 54, 0.2); color: #f44336;`;
      default:
        return `display: none;`;
    }
  }}
`;

// Image/Video preview styles for chat messages
const ImagePreviewContainer = styled.div`
  margin-top: 12px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid ${THEME.border};
  background: #000;
`;

const PreviewImage = styled.img`
  width: 100%;
  max-height: 300px;
  object-fit: contain;
  display: block;
  cursor: pointer;
  transition: transform 0.2s ease;

  &:hover {
    transform: scale(1.02);
  }
`;

const PreviewVideo = styled.video`
  width: 100%;
  max-height: 300px;
  display: block;
  border-radius: 8px;
`;

const ImageActions = styled.div`
  display: flex;
  gap: 8px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.8);
  border-top: 1px solid ${THEME.border};
`;

const ImageActionButton = styled.button`
  flex: 1;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition: all 0.2s ease;

  &.primary {
    background: ${THEME.primary};
    color: white;
    &:hover { background: ${THEME.primaryHover}; }
  }

  &.secondary {
    background: rgba(255, 255, 255, 0.1);
    color: white;
    &:hover { background: rgba(255, 255, 255, 0.2); }
  }
`;

// Default VibIndu agent test prompt
const DEFAULT_VIBE_PROMPT = `Build the complete automation project from the uploaded specification:

1. Extract I/O Configuration - Identify all inputs (sensors, buttons, switches) and outputs (motors, valves, indicators) with their addresses and descriptions
2. Design GSRSM Modes - Create the operating modes structure following IEC 61131-3 GEMMA standard (Initial Stop, Production, Emergency, etc.)
3. Generate Conduct SFC - Build the main coordination chart that manages transitions between all operating modes
4. Generate Mode SFCs - Create individual Sequential Function Charts for each operating mode with proper steps, transitions and actions

if spec in frensh all output should be in frensh
if english output english`;

// Default simulation prompt - simulates A1 mode by default
const DEFAULT_SIMULATION_PROMPT = `Run simulation on the SFC file to validate its behavior.

**Simulation Target:**
- Mode ID: A1 (or empty for root-level files like conduct.sfc)
- File Name: default.sfc

**Instructions:**
1. First, navigate to the SFC file to open it in the editor
2. Launch the simulation with test scenarios
3. Use these test scenarios:
   - "Initial State Check": Verify initial step is active
   - "Normal Start": Set PB_START=true, E_STOP=false
   - "Emergency Stop Test": Set E_STOP=true to verify safety response

**Expected Behavior:**
- Simulation should start from the initial step
- Transitions should fire when conditions are met
- Actions should activate/deactivate based on step states

Report the simulation results including:
- Steps visited during simulation
- Actions that were activated
- Any issues or warnings detected

if spec in frensh all output should be in frensh
if english output english`;

const QUICK_ACTIONS = [
  {
    title: "🚀 Build Full Project",
    desc: "Upload a spec PDF and auto-generate IO, GSRSM, and SFCs",
    prompt: DEFAULT_VIBE_PROMPT
  },
  {
    title: "📊 Extract I/O Only",
    desc: "Analyze spec and extract inputs/outputs configuration",
    prompt: "Extract all I/O configuration from the specification: sensors, buttons, motors, valves, and indicators.\\n\\nif spec in frensh all output should be in frensh\\nif english output english"
  },
  {
    title: "🔄 Design GSRSM Modes",
    desc: "Create operating modes following IEC 61131-3 GEMMA",
    prompt: "Design GSRSM modes for this automation system: Initial Stop (A1), Restart Prep (A5), Reset (A6), Emergency Stop (D1), Normal Production (F1).\\n\\nif spec in frensh all output should be in frensh\\nif english output english"
  },
  {
    title: "▶️ Simulate SFC",
    desc: "Run simulation on A1/default.sfc to validate behavior",
    prompt: DEFAULT_SIMULATION_PROMPT
  }
];

const MessageBubble = styled.div<{ $isUser: boolean }>`
  background-color: ${props => props.$isUser ? 'rgba(25, 118, 210, 0.12)' : THEME.bgSecondary};
  color: ${THEME.text};
  padding: 12px 16px;
  border-radius: 12px;
  border-bottom-right-radius: ${props => props.$isUser ? '2px' : '12px'};
  border-bottom-left-radius: ${props => props.$isUser ? '12px' : '2px'};
  align-self: ${props => props.$isUser ? 'flex-end' : 'flex-start'};
  font-size: 0.9rem;
  line-height: 1.5;
  border: 1px solid ${props => props.$isUser ? 'rgba(25, 118, 210, 0.3)' : THEME.border};
  max-width: 90%;
  box-shadow: none;
  animation: none;
`;

// Agent configuration with display names, icons, and colors
const getAgentConfig = () => {
  return {
    displayName: 'VibIndu',
    icon: '🤖',
    color: '#1976d2',
    bgColor: 'rgba(25, 118, 210, 0.12)'
  };
};

const AgentBadge = styled.div<{ $color: string; $bgColor: string }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: ${props => props.$color};
  background: ${props => props.$bgColor};
  padding: 4px 10px;
  border-radius: 12px;
  margin-bottom: 6px;
  font-weight: 600;
  letter-spacing: 0.3px;
  border: 1px solid ${props => props.$color}25;
  animation: none;
`;

const AgentIcon = styled.span`
  font-size: 0.85rem;
`;

const ThinkingBubble = styled(MessageBubble)`
  background: linear-gradient(135deg, rgba(138, 43, 226, 0.1), rgba(75, 0, 130, 0.08));
  border-left: 3px solid #8a2be2;
  font-style: italic;
  animation: pulse 2s ease-in-out infinite;

  @keyframes pulse {
    0%, 100% { opacity: 0.8; }
    50% { opacity: 1; }
  }
`;

const TaskBubble = styled(MessageBubble)`
  background: linear-gradient(135deg, rgba(255, 107, 53, 0.1), rgba(25, 118, 210, 0.1));
  border-left: 3px solid ${THEME.accent};
  font-weight: 600;
`;

const AnalystBubble = styled(MessageBubble)`
  background: linear-gradient(135deg, rgba(255, 105, 180, 0.1), rgba(255, 20, 147, 0.08));
  border-left: 3px solid #ff1493;
  font-weight: 500;
`;

const ToolBubble = styled(MessageBubble)`
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.1), rgba(56, 142, 60, 0.08));
  border-left: 3px solid ${THEME.success};
  font-weight: 500;
`;

const ToolCallBubble = styled(MessageBubble)`
  background: linear-gradient(135deg, rgba(255, 165, 0, 0.1), rgba(255, 140, 0, 0.08));
  border-left: 3px solid #ff8c00;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.82rem;
`;

const ToolResultBubble = styled(MessageBubble)`
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.1), rgba(56, 142, 60, 0.08));
  border-left: 3px solid #4caf50;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.82rem;
`;

const ToolDetailLabel = styled.span`
  display: block;
  font-size: 0.7rem;
  color: ${THEME.textSecondary};
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
`;

const ToolDetailPre = styled.pre`
  margin: 4px 0 0;
  padding: 6px 8px;
  background: rgba(0,0,0,0.05);
  border-radius: 4px;
  font-size: 0.78rem;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  color: ${THEME.text};
  max-height: 120px;
  overflow-y: auto;
  border: 1px solid ${THEME.border};
`;

// History Panel Components
const HistoryPanel = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: ${THEME.bg};
`;

const HistoryHeader = styled.div`
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid ${THEME.border};
  gap: 12px;
`;

const BackButton = styled.button`
  background: none;
  border: none;
  color: ${THEME.primary};
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;

  &:hover {
    background-color: rgba(25, 118, 210, 0.1);
  }
`;

const HistoryTitle = styled.h3`
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: ${THEME.text};
`;

const HistoryList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 12px;
`;

const HistoryItem = styled.div<{ $isActive: boolean }>`
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 8px;
  background-color: ${props => props.$isActive ? 'rgba(25, 118, 210, 0.1)' : THEME.bgSecondary};
  border: 1px solid ${props => props.$isActive ? THEME.primary : THEME.border};
  transition: all 0.2s ease;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;

  &:hover {
    background-color: rgba(25, 118, 210, 0.08);
    border-color: ${THEME.primary};
  }
`;

const HistoryItemContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const HistoryItemTitle = styled.div`
  font-weight: 500;
  font-size: 0.9rem;
  color: ${THEME.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const HistoryItemDate = styled.div`
  font-size: 0.75rem;
  color: ${THEME.textSecondary};
  margin-top: 4px;
`;

const HistoryItemDelete = styled.button`
  background: none;
  border: none;
  color: ${THEME.textSecondary};
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  opacity: 0.6;
  transition: all 0.2s ease;
  flex-shrink: 0;

  &:hover {
    opacity: 1;
    color: #f44336;
    background-color: rgba(244, 67, 54, 0.1);
  }
`;

const EmptyHistory = styled.div`
  text-align: center;
  padding: 40px 20px;
  color: ${THEME.textSecondary};
  font-size: 0.9rem;
`;

// Real-time sync event type
export interface RealtimeSyncEvent {
  type: 'project_reload' | 'files_changed';
  filePath?: string;
  message?: string;
}

// Hook for triggering real-time synchronization across the app
const useRealtimeSync = () => {
  const refreshIO = useSimulationStore((state: any) => state.loadSimulation);
  const refreshFileTree = useFileExplorerStore((state: any) => state.loadFileTree);
  const restoreDiagram = useGsrsmFileStore((state: any) => state.restoreCurrentDiagram);

  const triggerSync = async (event: RealtimeSyncEvent) => {
    console.log('[RealtimeSync] 🔄 Sync triggered:', event.type);

    // Get project path from store
    const projectPath = useProjectStore.getState().getCurrentProject()?.localPath
      || useGsrsmStore.getState().project?.localPath;

    if (projectPath) {
      // Refresh file explorer
      await refreshFileTree(projectPath);
    }

    if (event.type === 'project_reload') {
      // Full reload: IO and Diagram content
      if (projectPath) {
        await refreshIO(projectPath);
      }
      await restoreDiagram();
    }
  };

  return { triggerSync };
};

interface VibeSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

// Local Message type for WebSocket compatibility (used during streaming before persistence)
interface Message {
  text: string;
  isUser: boolean;
  agent?: string;
  isThinking?: boolean;
  isTask?: boolean;
  task?: string;
  isTool?: boolean;
  tool?: string;
  isToolCall?: boolean;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  isToolResult?: boolean;
  toolResult?: Record<string, unknown>;
  // Render results (image/video/audio)
  imageData?: string;  // Base64 encoded image data
  videoUrl?: string;   // Video URL for playback
  audioData?: string;  // Base64 encoded audio data
}

// Shared markdown components for consistent styling
const markdownComponents = {
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isInline = !className;
    return isInline ? (
      <code style={{ background: 'rgba(0,0,0,0.06)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.9em', color: '#212121' }}>{children}</code>
    ) : (
      <pre style={{ background: '#f5f5f5', padding: '12px', borderRadius: '8px', overflow: 'auto', fontSize: '0.85em', margin: '8px 0', border: '1px solid #e0e0e0', color: '#212121' }}>
        <code>{children}</code>
      </pre>
    );
  },
  p: ({ children }: { children?: React.ReactNode }) => <p style={{ margin: '4px 0', color: '#212121' }}>{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul style={{ margin: '4px 0', paddingLeft: '20px', color: '#212121' }}>{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol style={{ margin: '4px 0', paddingLeft: '20px', color: '#212121' }}>{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li style={{ margin: '2px 0' }}>{children}</li>,
  h1: ({ children }: { children?: React.ReactNode }) => <h1 style={{ fontSize: '1.3em', margin: '8px 0 4px', fontWeight: 600, color: '#212121' }}>{children}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 style={{ fontSize: '1.2em', margin: '8px 0 4px', fontWeight: 600, color: '#212121' }}>{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 style={{ fontSize: '1.1em', margin: '6px 0 4px', fontWeight: 600, color: '#212121' }}>{children}</h3>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
  em: ({ children }: { children?: React.ReactNode }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
  table: ({ children }: { children?: React.ReactNode }) => (
    <table style={{ borderCollapse: 'collapse', width: '100%', margin: '8px 0', fontSize: '0.85em', border: '1px solid #e0e0e0', borderRadius: '6px', overflow: 'hidden' }}>{children}</table>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => <thead style={{ backgroundColor: '#f5f5f5', fontWeight: 600 }}>{children}</thead>,
  tbody: ({ children }: { children?: React.ReactNode }) => <tbody>{children}</tbody>,
  tr: ({ children }: { children?: React.ReactNode }) => <tr style={{ borderBottom: '1px solid #e0e0e0' }}>{children}</tr>,
  th: ({ children }: { children?: React.ReactNode }) => <th style={{ padding: '8px 12px', textAlign: 'left' as const, borderRight: '1px solid #e0e0e0', color: '#212121', fontWeight: 600 }}>{children}</th>,
  td: ({ children }: { children?: React.ReactNode }) => <td style={{ padding: '6px 12px', borderRight: '1px solid #e0e0e0', color: '#212121' }}>{children}</td>,
};

const VibeSidebar: React.FC<VibeSidebarProps> = ({ isOpen, onClose }) => {
  const currentGrafcetProject = useProjectStore(state => state.projects.find(p => p.id === state.currentProjectId) || null);
  const currentGsrsmProject = useGsrsmStore(state => state.project);
  // Resolve project path from whichever store has the active project
  const currentProject = currentGrafcetProject?.localPath ? currentGrafcetProject : currentGsrsmProject?.localPath ? currentGsrsmProject : currentGrafcetProject;

  // Check if user has Vibe Agent access
  // In dev environment, grant access to all users; in prod, check vibeAccess flag
  const user = useAuthStore(state => state.user);
  const isProdEnv = import.meta.env.VITE_ENVIRONMENT === 'prod';
  const hasVibeAccess = !isProdEnv || user?.vibeAccess === true;

  // Demo access request state
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);
  const [requestStatus, setRequestStatus] = useState<'idle' | 'success' | 'already_requested' | 'error'>('idle');
  const [requestMessage, setRequestMessage] = useState('');

  // Vibe Chat Store state
  const {
    activeConversationId,
    addMessage,
    createConversation,
    getActiveMessages,
    setProjectPath,
    conversations,
    setActiveConversation,
    deleteConversation,
    saveConversations,
    appendToAgentMessage
  } = useVibeChatStore();

  // WebSocket and Real-time sync
  const { triggerSync } = useRealtimeSync();

  // Get messages from store (persisted)
  const storedMessages = getActiveMessages();

  // Local streaming messages (for real-time WebSocket updates before persistence)
  const [streamingMessages, setStreamingMessages] = useState<Message[]>([]);

  // Track IDs of messages that have been "seen" (should not stream word-by-word)
  // Messages loaded from history are marked as seen immediately
  const seenMessageIdsRef = useRef<Set<string>>(new Set());

  // Mark existing messages as "seen" on initial load or conversation switch
  useEffect(() => {
    // On conversation switch, mark ALL existing messages as seen (history shouldn't stream)
    const newSeen = new Set<string>();
    storedMessages.forEach(m => newSeen.add(m.id));
    seenMessageIdsRef.current = newSeen;
  }, [activeConversationId]); // Reset when conversation changes

  // Messages come directly from store (persisted)
  // Streaming messages are only used for "thinking" indicators
  const messages: (Message & { shouldStream?: boolean })[] = [
    ...storedMessages.map(m => {
      return {
        id: m.id,
        text: m.text,
        isUser: m.isUser,
        agent: m.agent,
        isThinking: m.isThinking,
        isTask: m.isTask,
        task: m.task,
        isTool: m.isTool,
        tool: m.tool,
        isToolCall: m.isToolCall,
        toolName: m.toolName,
        toolParams: m.toolParams,
        isToolResult: m.isToolResult,
        toolResult: m.toolResult,
        imageData: (m as any).imageData,
        videoUrl: (m as any).videoUrl,
        audioData: (m as any).audioData,
        // No word-by-word streaming needed - messages stream directly from store
        shouldStream: false
      };
    }),
    // Thinking messages (temporary, not persisted) - shown during agent thinking
    ...streamingMessages.filter(m => m.isThinking).map(m => ({ ...m, shouldStream: false }))
  ];

  // Mark new messages as "seen" after they start rendering (so they don't re-stream on re-render)
  useEffect(() => {
    storedMessages.forEach(m => {
      if (!seenMessageIdsRef.current.has(m.id)) {
        // Delay marking as seen to allow streaming to start
        setTimeout(() => {
          seenMessageIdsRef.current.add(m.id);
        }, 100);
      }
    });
  }, [storedMessages]);

  const [inputValue, setInputValue] = useState("");
  const [isLiveModeActive, setIsLiveModeActive] = useState(true);
  const [isComputerModeActive, setIsComputerModeActive] = useState(false); // Disabled
  const [isStorytellerModeActive, setIsStorytellerModeActive] = useState(false); // Disabled

  const handleSendFromLive = (query: string) => {
    // A2A: The Live Agent dispatches to Orchestrator server-to-server.
    // We rely on the backend to broadcast status updates back to this sidebar.
    if (!query.trim()) return;
    if (!activeConversationId) createConversation();
    addMessage({ text: `🎙️ [Voice → A2A] ${query}`, isUser: true });
    saveConversations().catch(err => console.error('[VibeSidebar] Failed to save live dispatch:', err));
  };
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error' | 'disconnected'>('disconnected');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  // Default: gemini-3.1-flash-lite-preview with thinking level "low"
  const [selectedModel, setSelectedModel] = useState('gemini-3.1-flash-lite-preview');
  const [thinkingLevel, setThinkingLevel] = useState<string>('low');
  const [showHistory, setShowHistory] = useState(false);

  // Available thinking levels per model
  // gemini-3.1-pro-preview: low, medium, high
  // gemini-3-pro-preview: low, high (cannot disable thinking)
  // gemini-3.1-flash-lite-preview: minimal, low, medium, high
  const getThinkingLevels = (model: string) => {
    if (model === 'gemini-3.1-pro-preview') {
      return [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' }
      ];
    } else if (model === 'gemini-3-pro-preview') {
      return [
        { value: 'low', label: 'Low' },
        { value: 'high', label: 'High' }
      ];
    } else {
      // gemini-3.1-flash-lite-preview
      return [
        { value: 'minimal', label: 'Minimal (Fastest)' },
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' }
      ];
    }
  };

  // Reset thinking level when model changes
  const handleModelChange = (newModel: string) => {
    setSelectedModel(newModel);
    // Set appropriate default thinking level for the model
    if (newModel === 'gemini-3-pro-preview') {
      // Pro defaults to low (cannot be minimal)
      if (thinkingLevel === 'minimal' || thinkingLevel === 'medium') {
        setThinkingLevel('low');
      }
    } else if (newModel === 'gemini-3.1-pro-preview') {
      // 3.1 Pro supports medium
      if (thinkingLevel === 'minimal') {
        setThinkingLevel('low');
      }
    }
    // Flash Lite supports all levels, no need to change
  };

  // Render state
  const [isRendering, setIsRendering] = useState(false);
  const [renderStatus, setRenderStatus] = useState<string>('');

  // Production generation limit (very simple)
  const MAX_GENERATIONS = 3;
  const isProd = import.meta.env.VITE_ENVIRONMENT === 'prod';
  const [generationCount, setGenerationCount] = useState(0);
  const generationsLeft = MAX_GENERATIONS - generationCount;
  const isLimitReached = isProd && generationCount >= MAX_GENERATIONS;

  // Resize state
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [pendingSfcRenders, setPendingSfcRenders] = useState<any[]>([]); // Track SFCs that need rendering
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);
  const navigate = useNavigate();



  // Handle resize drag
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !resizeRef.current) return;

      // Calculate new width (dragging left increases width since sidebar is on right)
      const deltaX = resizeRef.current.startX - e.clientX;
      const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, resizeRef.current.startWidth + deltaX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        resizeRef.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = {
      startX: e.clientX,
      startWidth: sidebarWidth
    };
  };

  // Sync project path to VibeChatStore when project changes
  // NOTE: Only run when localPath actually changes, not on every render
  const projectLocalPath = currentProject?.localPath;
  useEffect(() => {
    console.log('[VibeSidebar] Project path sync effect:', {
      localPath: projectLocalPath,
      hasLocalPath: !!projectLocalPath
    });
    if (projectLocalPath) {
      setProjectPath(projectLocalPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectLocalPath]); // Only depend on the path value, not the function

  // Auto-scroll to bottom only if user hasn't scrolled up
  useEffect(() => {
    if (!userHasScrolledUp) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingMessages, userHasScrolledUp]);

  // Handle scroll events to track user position
  const handleChatScroll = () => {
    const container = chatContentRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const threshold = 100; // pixels from bottom to consider "at bottom"

    const isNearBottom = distanceFromBottom < threshold;
    setShowScrollToBottom(!isNearBottom);
    setUserHasScrolledUp(!isNearBottom);
  };

  // Scroll to bottom handler
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setUserHasScrolledUp(false);
    setShowScrollToBottom(false);
  };

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      console.log('Connecting to WebSocket...');
      setConnectionStatus('connecting');

      // Use dynamic URL from config with protocol switching for production (WSS)
      const wsUrl = AGENTS_BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws/vibe';
      console.log(`[VibeSidebar] Connecting to WebSocket at ${wsUrl}`);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnectionStatus('connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Helper to persist message to store (for long-term storage)
          const persistMessage = (msg: Omit<Message, 'id' | 'timestamp'>) => {
            addMessage(msg);
          };

          // DEBUG: Log all incoming WebSocket messages to trace what's being received
          console.log(`[VibeSidebar] 📨 WS Message: type=${data.type}, agent=${data.agent}, text=${data.text?.substring?.(0, 100) || 'N/A'}`);

          // Handle different message types for enhanced visualization
          /* DISABLED: Thinking messages are not synchronized and cause layout shifts
          if (data.type === 'thinking') {
            console.log(`[VibeSidebar] 🧠 THINKING from ${data.agent}: ${data.text?.substring?.(0, 100)}`);

            // Stream thinking content - append to existing thinking message or create new
            setStreamingMessages(prev => {
              const lastMsg = prev[prev.length - 1];
              // Append to existing thinking message from same agent
              if (lastMsg && lastMsg.isThinking && lastMsg.agent === data.agent) {
                const newMessages = [...prev];
                newMessages[prev.length - 1] = {
                  ...lastMsg,
                  text: lastMsg.text + data.text
                };
                return newMessages;
              } else {
                // New thinking message
                return [...prev, { text: data.text, isUser: false, agent: data.agent, isThinking: true }];
              }
            });
          } else */ if (data.type === 'task') {
            // Show identified task (persisted)
            persistMessage({
              text: data.text,
              isUser: false,
              agent: data.agent,
              isTask: true,
              task: data.task
            });
          } else if (data.type === 'tool') {
            // Show tool usage (legacy, persisted)
            persistMessage({
              text: data.text,
              isUser: false,
              agent: data.agent,
              isTool: true,
              tool: data.tool
            });
          } else if (data.type === 'tool_call') {
            // Tool calls are internal - don't display them in the UI
            // The agent's text response will explain what was done
            console.log(`[VibeSidebar] 🔧 Tool call (hidden): ${data.tool_name}`, data.tool_params);
          } else if (data.type === 'tool_result') {
            // Tool results are internal - don't display them in the UI
            // The agent's text response will explain the outcome
            console.log(`[VibeSidebar] ✅ Tool result (hidden): ${data.tool_name}`, data.tool_result);
          } else if (data.type === 'status' || data.type === 'result') {
            // Status and results are persisted
            persistMessage({ text: data.text, isUser: false, agent: data.agent });
          } else if (data.type === 'action') {
            // Computer Agent actions - show as status with specific icon/prefix
            persistMessage({ 
              text: `🖱️ ${data.text || 'Executing UI action...'}`, 
              isUser: false, 
              agent: data.agent || 'Computer Agent' 
            });
          } else if (data.type === 'story_result') {
            // Storyteller results - include image and audio
            persistMessage({ 
              text: data.text || '✨ Cinematic Story Complete!', 
              isUser: false, 
              agent: data.agent || 'Creative Storyteller',
              imageData: data.imageData,
              audioData: data.audioData
            });
          } else if (data.type === 'token' || data.type === 'stream' || data.type === 'text') {
            // STREAM DIRECTLY TO STORE - display AND save in one step
            // This ensures messages are persisted even if reload happens
            const agentName = data.agent || 'Assistant';
            const text = data.text || '';

            if (text) {
              // Append to store (creates new message or appends to existing for same agent)
              appendToAgentMessage(text, agentName);
            }
          } else if (data.type === 'stream_complete' || data.type === 'response_complete') {
            // Stream is complete - force save to ensure persistence
            console.log(`[VibeSidebar] ✅ Stream complete - saving conversation`);
            saveConversations().catch(err => {
              console.error('[VibeSidebar] Failed to save on stream complete:', err);
            });
          } else if (data.type === 'status') {
            console.log(`[VibeSidebar] 📢 ${data.message || 'Status update'}`);
          } else if (data.type === 'open_file') {
            // Navigate to the file being simulated
            console.group(`[VibeSidebar] 📨 Received open_file event`);
            console.log(`📂 Target Path: ${data.filePath}`);
            console.log(`🔗 Target URL: ${data.url || 'Not provided'}`);

            try {
              // If a URL is provided by the backend (from NavigateService), use it for proper navigation
              if (data.url) {
                console.log(`[VibeSidebar] 🔗 Navigating via URL: ${data.url}`);
                // Extract the file parameter and update smoothly via React Router
                try {
                  const urlObj = new URL(data.url);
                  // Extract path from pathname (remove leading slash)
                  const pathParam = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;

                  if (pathParam && pathParam !== 'welcome' && pathParam !== '') {
                    console.log(`[VibeSidebar] 🔄 Navigating to path: ${pathParam}`);
                    // Use React Router's navigate hook for smooth navigation
                    navigate('/' + pathParam, { replace: true });
                  } else {
                    console.warn('[VibeSidebar] ⚠️ No valid path found in URL, falling back to direct load');
                    useGsrsmFileStore.getState().loadFile(data.filePath);
                  }
                  // End of url processing
                } catch (urlError) {
                  console.error('[VibeSidebar] ❌ Error parsing URL:', urlError);
                  useGsrsmFileStore.getState().loadFile(data.filePath);
                }
              } else if (data.filePath) {
              } else if (data.filePath) {
                // Fallback: Load file directly via store
                let absolutePath = data.filePath;

                // If the path is relative (no drive letter and doesn't start with /), construct absolute from current project
                if (!absolutePath.match(/^[a-zA-Z]:/) && !absolutePath.startsWith('/')) {
                  const projectPath = currentProject?.localPath;
                  if (projectPath) {
                    absolutePath = `${projectPath.replace(/\\/g, '/')}/${absolutePath}`;
                    console.log(`[VibeSidebar] 📂 Converted to absolute path: ${absolutePath}`);
                  }
                }

                console.log(`[VibeSidebar] 📥 calling loadFile (direct) for: ${absolutePath}`);
                useGsrsmFileStore.getState().loadFile(absolutePath);
              }
            } catch (err) {
              console.error('[VibeSidebar] ❌ Error handling open_file:', err);
            }
            console.groupEnd();
          } else if (data.type === 'sim_panel_open') {
            // Open panel WITHOUT starting simulation yet
            console.log('[VibeSidebar] 📋 Opening simulation panel (not simulating yet)...');
            const simStore = useSimulationStore.getState();
            if (!simStore.showSimulationPanel) {
              simStore.toggleSimulationPanel();
            }
          } else if (data.type === 'sim_start') {
            // NOW start simulation
            console.log('[VibeSidebar] ▶️ Starting simulation mode...');
            const simStore = useSimulationStore.getState();
            if (!simStore.isSimulating) {
              simStore.startSimulation([]);
            }
            console.log('[VibeSidebar] isSimulating:', useSimulationStore.getState().isSimulating);
          } else if (data.type === 'sim_step') {
            // Simulation step - update active steps AND variable values
            console.log(`[VibeSidebar] 🎯 Step ${data.stepNumber || '?'}/${data.totalSteps || '?'}: ${data.name}`);
            console.log(`[VibeSidebar] 🎯 activeSteps:`, data.activeSteps);
            console.log(`[VibeSidebar] 🎯 variablesApplied:`, data.variablesApplied);

            const simStore = useSimulationStore.getState();
            simStore.setActiveSteps(data.activeSteps || []);

            // Sync variable toggle values from scenario to panel
            if (data.variablesApplied && typeof data.variablesApplied === 'object') {
              for (const [varName, varValue] of Object.entries(data.variablesApplied)) {
                const variable = simStore.getVariableByName(varName);
                if (variable) {
                  console.log(`[VibeSidebar] 🔄 Updating ${varName} = ${varValue}`);
                  simStore.updateVariableValue(variable.id, varValue as boolean | number);
                }
              }
            }

            console.log(`[VibeSidebar] 🎯 Store activeStepIds now:`, useSimulationStore.getState().activeStepIds);
          } else if (data.type === 'sim_io_updated') {
            // Agent or backend saved IO - reload simulation data
            console.log('[VibeSidebar] 📦 IO Updated - reloading simulation data');
            const project = useProjectStore.getState().getCurrentProject();
            if (project?.localPath) {
              useSimulationStore.getState().loadSimulation(project.localPath);
            }
            triggerSync({
              type: data.type as 'project_reload' | 'files_changed',
              filePath: data.filePath,
              message: data.message,
            } as RealtimeSyncEvent);
          } else if (data.type === 'sfc_generated') {
            // Agent generated an SFC - queue it for thumbnail rendering
            console.log('[VibeSidebar] 🎨 SFC Generated - queuing for thumbnail rendering', data.sfc_file.name);
            setPendingSfcRenders(prev => [...prev, data.sfc_file]);
          } else if (data.type === 'agent_response') {
            // ADK run complete - clear thinking indicators and force final save
            console.log('[VibeSidebar] 📨 Agent response (ADK complete) - forcing final save');

            // Clear thinking messages
            setStreamingMessages([]);

            // Force save to ensure all streamed content is persisted
            saveConversations().then(() => {
              console.log(`[VibeSidebar] ✅ Final save complete`);
            }).catch((err) => {
              console.error(`[VibeSidebar] ❌ Failed to save:`, err);
            });
          } else if (data.type === 'sim_complete') {
            // Simulation complete
            console.log('[VibeSidebar] ✅ Simulation complete!');
          } else if (data.type === 'sim_stop') {
            // Stop simulation
            console.log('[VibeSidebar] ⏹️ Stopping simulation...');
            useSimulationStore.getState().stopSimulation();
          } else if (data.type === 'project_reload' || data.type === 'files_changed') {
            // Signal to refresh file explorer, IO, and diagram
            console.log(`[VibeSidebar] 🔄 Received ${data.type} - triggering sync`);
            triggerSync({
              type: data.type as 'project_reload' | 'files_changed',
              filePath: data.filePath,
              message: data.message
            });
          } else if (data.type === 'sim_panel_close') {
            // Close simulation panel
            console.log('[VibeSidebar] 🚪 Closing simulation panel...');
            useSimulationStore.getState().setShowSimulationPanel(false);
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = (_error) => {
        console.error('WebSocket error occurred');
        setConnectionStatus('error');
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.reason);
        setConnectionStatus('disconnected');
        // Try to reconnect after 3 seconds
        reconnectTimeout = setTimeout(connect, 3000);
      };

      setSocket(ws);
    };

    connect();

    return () => {
      if (ws) {
        ws.onclose = null; // Prevent reconnect on unmount
        ws.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, []);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAttachedFile(file);

    if (file.type === 'application/pdf') {
      addMessage({
        text: `📎 Attached: ${file.name} (PDF, ${(file.size / 1024).toFixed(2)} KB)`,
        isUser: true
      });
    } else if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      try {
        const text = await file.text();
        setInputValue(prev => prev ? `${prev}\n\n${text}` : text);
        addMessage({
          text: `📎 Loaded text from: ${file.name}`,
          isUser: true
        });
      } catch (error) {
        addMessage({
          text: `❌ Error reading file: ${file.name}`,
          isUser: false,
          agent: "Error"
        });
      }
    } else {
      addMessage({
        text: `⚠️ Unsupported file type. Please upload PDF or TXT files.`,
        isUser: false,
        agent: "System"
      });
      setAttachedFile(null);
    }
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  // Handle render actions (Nano Banana image, Veo 3 video)
  const handleRenderAction = async (actionType: 'image' | 'video') => {
    if (!currentProject?.localPath) {
      alert('Please open a project first');
      return;
    }

    setIsRendering(true);
    setRenderStatus(actionType === 'image' ? '🎨 Generating system image...' : (actionType === 'video' ? '🎬 Starting video generation...' : '📚 Generating story...'));

    // Add status message to chat
    if (actionType === 'image') {
      addMessage({ text: '🖼️ Generating system diagram from spec.md using Nano Banana Pro...', isUser: false, agent: 'Renderer' });
    } else if (actionType === 'video') {
      addMessage({ text: '🎬 Starting system animation with Veo 3.1...', isUser: false, agent: 'Renderer' });
    } else {
      addMessage({ text: '📚 Generating a multimodal story. This includes audio narration and images, so it may take a minute...', isUser: false, agent: 'Creative Storyteller' });
    }

    try {
      if (actionType === 'image') {
        const result = await ApiService.generateSystemImage(currentProject.localPath);
        if (result.success && result.imageBase64) {
          addMessage({
            text: `✅ **System Visualization Generated!**\n\n🎨 Your automation system has been rendered as a photorealistic 3D image.`,
            isUser: false,
            agent: 'Renderer',
            imageData: result.imageBase64
          } as any);
          setRenderStatus('✅ Image generated!');
        } else {
          addMessage({ text: `❌ Image generation failed: ${result.error}`, isUser: false, agent: 'Renderer' });
          setRenderStatus('❌ Failed');
        }
        setIsRendering(false);
      } else if (actionType === 'video') {
        const result = await ApiService.generateSystemVideo(currentProject.localPath);
        if (result.success && result.operationName) {
          addMessage({
            text: `⏳ **Video Generation Started**\n\nVeo 3.1 is creating an animation of your system. This may take 1-3 minutes...`,
            isUser: false,
            agent: 'Renderer'
          });
          setRenderStatus('⏳ Video generating...');

          let attempts = 0;
          const maxAttempts = 60;
          const pollInterval = setInterval(async () => {
            attempts++;
            const status = await ApiService.checkVideoStatus(result.operationName!);

            if (status.status === 'complete' && status.videoPath) {
              clearInterval(pollInterval);
              const downloadResult = await ApiService.downloadVideo(status.videoPath, currentProject.localPath!);
              if (downloadResult.success && downloadResult.videoBase64) {
                addMessage({
                  text: `✅ **System Animation Complete!**\n\n🎬 Your automation workflow has been animated.`,
                  isUser: false,
                  agent: 'Renderer',
                  videoUrl: `data:video/mp4;base64,${downloadResult.videoBase64}`
                } as any);
                setRenderStatus('✅ Video complete!');
              } else {
                addMessage({ text: `✅ **Video Generated!**\n\n🎬 Your system animation is ready.`, isUser: false, agent: 'Renderer' });
                setRenderStatus('✅ Video complete!');
              }
              setIsRendering(false);
            } else if (status.status === 'error' || attempts >= maxAttempts) {
              clearInterval(pollInterval);
              addMessage({
                text: `❌ Video generation ${attempts >= maxAttempts ? 'timed out' : 'failed'}: ${status.error || 'Unknown error'}`,
                isUser: false,
                agent: 'Renderer'
              });
              setRenderStatus('❌ Failed');
              setIsRendering(false);
            } else {
              setRenderStatus(`⏳ Video generating... (${attempts * 5}s)`);
            }
          }, 5000);
        } else {
          addMessage({ text: `❌ Video generation failed: ${result.error}`, isUser: false, agent: 'Renderer' });
          setRenderStatus('❌ Failed');
          setIsRendering(false);
        }
      }
    } catch (error: any) {
      addMessage({ text: `❌ Error: ${error.message}`, isUser: false, agent: 'Renderer' });
      setRenderStatus('❌ Error');
      setIsRendering(false);
    }
  };

  // Handle demo access request
  const handleRequestAccess = async () => {
    if (!user?.email) return;

    setIsRequestingAccess(true);
    try {
      const response = await fetch(`${API_BASE_URL}/demo-access/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          name: user.name || user.username
        })
      });

      const data = await response.json();

      if (data.success) {
        if (data.alreadyRequested) {
          setRequestStatus('already_requested');
          setRequestMessage(data.message);
        } else {
          setRequestStatus('success');
          setRequestMessage(data.message);
        }
        // Close sidebar after a short delay
        setTimeout(() => {
          onClose();
        }, 2500);
      } else {
        setRequestStatus('error');
        setRequestMessage(data.error || 'Failed to submit request');
      }
    } catch (error) {
      console.error('Error requesting access:', error);
      setRequestStatus('error');
      setRequestMessage('Network error. Please try again.');
    } finally {
      setIsRequestingAccess(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() && !attachedFile) return;

    // Block if production limit reached
    if (isLimitReached) return;

    // Increment generation count in production
    if (isProd) {
      setGenerationCount(prev => prev + 1);
    }

    // Ensure we have an active conversation (create one if needed)
    if (!activeConversationId) {
      createConversation();
    }

    // Add user message to store (persisted)
    addMessage({ text: inputValue, isUser: true });

    // IMMEDIATELY save to disk (don't wait for debounce)
    saveConversations().catch((err) => {
      console.error('[VibeSidebar] Failed to save user message:', err);
    });

    // Clear any streaming messages from previous exchanges
    setStreamingMessages([]);

    // Prepare payload - include conversationId for session continuity
    // Gemini 3 models use thinkingLevel parameter:
    // - gemini-3-pro-preview: low, high
    // - gemini-3.1-flash-lite-preview: minimal, low, medium, high
    const payload: any = {
      text: inputValue,
      model: selectedModel,
      thinking_level: thinkingLevel,  // String: minimal, low, medium, high
      projectPath: currentProject?.localPath,
      conversationId: activeConversationId  // Enable multi-turn conversation with agent
    };

    if (attachedFile) {
      try {
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(attachedFile);
        });

        payload.file = {
          name: attachedFile.name,
          type: attachedFile.type,
          data: base64Data
        };
      } catch (err) {
        console.error("File read error:", err);
        addMessage({ text: "Error reading file attachment.", isUser: false, agent: "System" });
        return;
      }
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    } else {
      addMessage({ text: "Error: Agent backend not connected.", isUser: false, agent: "Error" });
    }

    setInputValue("");
    setAttachedFile(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLimitReached) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleNewChat = () => {
    // Create a new conversation in the store
    createConversation();
    // Clear streaming messages
    setStreamingMessages([]);
    setInputValue("");
  };

  // Format date for history display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  // Handle selecting a conversation from history
  const handleSelectConversation = (conversationId: string) => {
    setActiveConversation(conversationId);
    // Clear streaming messages
    setStreamingMessages([]);
    setShowHistory(false);
  };

  // Handle deleting a conversation
  const handleDeleteConversation = (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    if (window.confirm('Delete this conversation?')) {
      deleteConversation(conversationId);
    }
  };

  return (
    <>
      <SidebarContainer $isOpen={isOpen} $width={sidebarWidth} $isResizing={isResizing}>
        <ResizeHandle
          $isResizing={isResizing}
          onMouseDown={handleResizeStart}
          title="Drag to resize"
        />
        {!hasVibeAccess ? (
          // No Access - Request Demo Screen
          <>
            <Header>
              <HeaderTitle>🤖 VibIndu Agent</HeaderTitle>
              <HeaderActions>
                <HeaderButton onClick={onClose} title="Close">
                  <FiX size={18} />
                </HeaderButton>
              </HeaderActions>
            </Header>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              padding: '40px 24px',
              textAlign: 'center',
              background: `linear-gradient(135deg, ${THEME.bgSecondary} 0%, #e3f2fd 50%, #fff3e0 100%)`
            }}>
              {/* Animated Lock Icon with Glow */}
              <div style={{
                fontSize: '4.5rem',
                marginBottom: '24px',
                filter: 'drop-shadow(0 4px 12px rgba(255, 152, 0, 0.4))',
                animation: 'pulse 2s infinite'
              }}>
                🔐
              </div>
              <style>{`
              @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
              }
            `}</style>

              <h2 style={{
                margin: '0 0 8px',
                color: THEME.text,
                fontSize: '1.6rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #1976d2, #ff6b35)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                Unlock the Power of VibIndu AI
              </h2>

              <p style={{
                color: THEME.textSecondary,
                marginBottom: '16px',
                fontSize: '1rem',
                fontWeight: 500
              }}>
                Transform your automation workflow
              </p>

              {/* Feature highlights */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                marginBottom: '28px',
                width: '100%',
                maxWidth: '320px'
              }}>
                {[
                  { icon: '⚡', text: 'Generate SFC diagrams from specs in seconds' },
                  { icon: '🎯', text: 'Auto-extract I/O configurations from PDFs' },
                  { icon: '🔧', text: 'Build complete GSRSM operating modes' },
                  { icon: '🤖', text: 'Powered by Google Gemini 3 AI' }
                ].map((item, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: 'rgba(255,255,255,0.8)',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                    fontSize: '0.9rem',
                    color: THEME.text,
                    textAlign: 'left'
                  }}>
                    <span style={{ fontSize: '1.3rem' }}>{item.icon}</span>
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>

              {/* Status message */}
              {requestStatus !== 'idle' && (
                <div style={{
                  padding: '12px 20px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  backgroundColor: requestStatus === 'error' ? '#ffebee' : '#e8f5e9',
                  color: requestStatus === 'error' ? '#c62828' : '#2e7d32',
                  fontWeight: 500,
                  fontSize: '0.95rem'
                }}>
                  {requestStatus === 'success' && '✅ '}
                  {requestStatus === 'already_requested' && '📬 '}
                  {requestStatus === 'error' && '❌ '}
                  {requestMessage}
                </div>
              )}

              {/* Request button */}
              {requestStatus === 'idle' && (
                <button
                  onClick={handleRequestAccess}
                  disabled={isRequestingAccess}
                  style={{
                    background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
                    color: 'white',
                    padding: '14px 36px',
                    borderRadius: '12px',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '1.05rem',
                    cursor: isRequestingAccess ? 'wait' : 'pointer',
                    boxShadow: '0 4px 16px rgba(25, 118, 210, 0.35)',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    opacity: isRequestingAccess ? 0.7 : 1
                  }}
                  onMouseOver={(e) => {
                    if (!isRequestingAccess) {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 6px 20px rgba(25, 118, 210, 0.45)';
                    }
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(25, 118, 210, 0.35)';
                  }}
                >
                  {isRequestingAccess ? (
                    <>⏳ Sending Request...</>
                  ) : (
                    <>🚀 Request Early Access</>
                  )}
                </button>
              )}

              <p style={{
                color: THEME.textSecondary,
                marginTop: '24px',
                fontSize: '0.82rem',
                lineHeight: 1.5
              }}>
                {user?.email ? (
                  <>Logged in as <strong style={{ color: THEME.primary }}>{user.email}</strong></>
                ) : (
                  <>Already have access? Try logging out and back in.</>
                )}
              </p>
            </div>
          </>
        ) : showHistory ? (
          // History Panel
          <HistoryPanel>
            <HistoryHeader>
              <BackButton onClick={() => setShowHistory(false)} title="Back to chat">
                <FiChevronLeft size={20} />
              </BackButton>
              <HistoryTitle>Chat History</HistoryTitle>
            </HistoryHeader>
            <HistoryList>
              {conversations.length === 0 ? (
                <EmptyHistory>
                  <FiClock size={32} style={{ marginBottom: 12, opacity: 0.5 }} />
                  <div>No conversation history yet</div>
                  <div style={{ fontSize: '0.8rem', marginTop: 4 }}>Start a new chat to begin</div>
                </EmptyHistory>
              ) : (
                conversations.map(conv => (
                  <HistoryItem
                    key={conv.id}
                    $isActive={conv.id === activeConversationId}
                    onClick={() => handleSelectConversation(conv.id)}
                  >
                    <HistoryItemContent>
                      <HistoryItemTitle>{conv.title || 'Untitled Chat'}</HistoryItemTitle>
                      <HistoryItemDate>
                        {conv.messages.length} message{conv.messages.length !== 1 ? 's' : ''} • {formatDate(conv.updatedAt)}
                      </HistoryItemDate>
                    </HistoryItemContent>
                    <HistoryItemDelete
                      onClick={(e) => handleDeleteConversation(e, conv.id)}
                      title="Delete conversation"
                    >
                      <FiTrash2 size={14} />
                    </HistoryItemDelete>
                  </HistoryItem>
                ))
              )}
            </HistoryList>
          </HistoryPanel>
        ) : (
          // Chat Panel
          <>
            <Header>
              <HeaderTitle>
                <StatusDot $status={connectionStatus} title={`Status: ${connectionStatus}`} />
                VibIndu Live Agent
              </HeaderTitle>
              <HeaderActions>
                <HeaderButton onClick={handleNewChat} title="New Chat">
                  <FiPlus size={20} />
                </HeaderButton>
                <HeaderButton onClick={() => setShowHistory(true)} title="History">
                  <FiClock size={18} />
                </HeaderButton>
                <HeaderButton onClick={onClose} title="Close">
                  <FiX size={18} />
                </HeaderButton>
              </HeaderActions>
            </Header>

            <Content>
              <ChatContentWrapper>
                <ChatContent ref={chatContentRef} onScroll={handleChatScroll}>
                  {messages.length === 0 ? (
                    /* Quick Start UI when no messages */
                    <QuickStartContainer>
                      <QuickStartTitle>🤖 VibIndu Agent Ready</QuickStartTitle>
                      <QuickStartSubtitle>
                        Upload a specification PDF and select an action below, or type your own request.
                      </QuickStartSubtitle>
                      {QUICK_ACTIONS.map((action, idx) => (
                        <QuickStartButton
                          key={idx}
                          onClick={() => {
                            // Normal prompt actions
                            setInputValue(action.prompt);
                            // Also prompt user to attach a file if needed
                            if (idx === 0 && !attachedFile) {
                              fileInputRef.current?.click();
                            }
                          }}
                        >
                          <QuickStartButtonTitle>{action.title}</QuickStartButtonTitle>
                          <QuickStartButtonDesc>{action.desc}</QuickStartButtonDesc>
                        </QuickStartButton>
                      ))}

                      {/* Render Actions - Prominent separate section */}
                      <RenderActionsSection>
                        <RenderSectionTitle>🎨 Visualization Tools</RenderSectionTitle>
                        <RenderButtonsRow>
                          <RenderButton
                            $variant="image"
                            $isLoading={isRendering}
                            disabled={isRendering}
                            onClick={() => handleRenderAction('image')}
                            title="Generate a photorealistic 3D render of your automation system"
                          >
                            <RenderButtonIcon>🖼️</RenderButtonIcon>
                            <RenderButtonLabel>Generate Image</RenderButtonLabel>
                            <RenderButtonSubtext>Nano Banana Pro</RenderButtonSubtext>
                          </RenderButton>
                          <RenderButton
                            $variant="video"
                            $isLoading={isRendering}
                            disabled={isRendering}
                            onClick={() => handleRenderAction('video')}
                            title="Create an animated video showing your system in operation"
                          >
                            <RenderButtonIcon>🎬</RenderButtonIcon>
                            <RenderButtonLabel>Animate System</RenderButtonLabel>
                            <RenderButtonSubtext>Veo 3.1</RenderButtonSubtext>
                          </RenderButton>
                        </RenderButtonsRow>
                        {renderStatus && (
                          <RenderStatusBadge
                            $status={renderStatus.includes('✅') ? 'success' : renderStatus.includes('❌') ? 'error' : isRendering ? 'loading' : 'idle'}
                          >
                            {renderStatus}
                          </RenderStatusBadge>
                        )}
                      </RenderActionsSection>
                    </QuickStartContainer>
                  ) : (
                    /* Normal message display */
                    messages.map((msg, idx) => {
                      // Choose appropriate bubble component
                      let BubbleComponent: typeof MessageBubble = MessageBubble;
                      if (msg.isThinking) BubbleComponent = ThinkingBubble;
                      else if (msg.isTask) BubbleComponent = TaskBubble;
                      else if (msg.isToolCall) BubbleComponent = ToolCallBubble;
                      else if (msg.isToolResult) BubbleComponent = ToolResultBubble;
                      else if (msg.isTool) BubbleComponent = ToolBubble;
                      else if (msg.agent === 'SpecAnalyst') BubbleComponent = AnalystBubble;

                      // Get agent styling config
                      const agentConfig = msg.isUser ? null : getAgentConfig();
                      const msgKey = (msg as any).id || `msg-${idx}`;

                      return (
                        <div key={msgKey} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.isUser ? 'flex-end' : 'flex-start' }}>
                          {!msg.isUser && agentConfig && (
                            <AgentBadge $color={agentConfig.color} $bgColor={agentConfig.bgColor}>
                              <AgentIcon>{agentConfig.icon}</AgentIcon>
                              {agentConfig.displayName}
                            </AgentBadge>
                          )}
                          <BubbleComponent $isUser={msg.isUser}>
                            {msg.isToolCall && msg.toolName && (
                              <>
                                <ToolDetailLabel>🔧 {msg.toolName}</ToolDetailLabel>
                                {msg.toolParams && Object.keys(msg.toolParams).length > 0 && (
                                  <ToolDetailPre>{JSON.stringify(msg.toolParams, null, 2)}</ToolDetailPre>
                                )}
                              </>
                            )}
                            {msg.isToolResult && msg.toolName && (
                              <>
                                <ToolDetailLabel>{(msg.toolResult as Record<string, unknown>)?.success ? '✅' : '❌'} {msg.toolName}</ToolDetailLabel>
                                {msg.toolResult && Object.keys(msg.toolResult).length > 0 && (
                                  <ToolDetailPre>{JSON.stringify(msg.toolResult, null, 2)}</ToolDetailPre>
                                )}
                              </>
                            )}
                            {!msg.isToolCall && !msg.isToolResult && (
                              msg.shouldStream ? (
                                <StreamingText
                                  text={msg.text}
                                  enabled={true}
                                  wordsPerTick={4}
                                  tickInterval={25}
                                  components={markdownComponents}
                                />
                              ) : (
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={markdownComponents}
                                >
                                  {msg.text}
                                </ReactMarkdown>
                              )
                            )}
                            {/* Image Preview */}
                            {msg.imageData && (
                              <ImagePreviewContainer>
                                <PreviewImage
                                  src={`data:image/png;base64,${msg.imageData}`}
                                  alt="Generated System Visualization"
                                  onClick={() => {
                                    // Open image in new tab for full view
                                    const win = window.open();
                                    if (win) {
                                      win.document.write(`
                                    <html><head><title>System Visualization</title></head>
                                    <body style="margin:0;background:#000;display:flex;justify-content:center;align-items:center;min-height:100vh;">
                                      <img src="data:image/png;base64,${msg.imageData}" style="max-width:100%;max-height:100vh;object-fit:contain;"/>
                                    </body></html>
                                  `);
                                    }
                                  }}
                                />
                                <ImageActions>
                                  <ImageActionButton
                                    className="primary"
                                    onClick={() => {
                                      // Download image
                                      const link = document.createElement('a');
                                      link.href = `data:image/png;base64,${msg.imageData}`;
                                      link.download = `system_visualization_${Date.now()}.png`;
                                      link.click();
                                    }}
                                  >
                                    ⬇️ Download
                                  </ImageActionButton>
                                  <ImageActionButton
                                    className="secondary"
                                    onClick={() => {
                                      const win = window.open();
                                      if (win) {
                                        win.document.write(`
                                      <html><head><title>System Visualization</title></head>
                                      <body style="margin:0;background:#000;display:flex;justify-content:center;align-items:center;min-height:100vh;">
                                        <img src="data:image/png;base64,${msg.imageData}" style="max-width:100%;max-height:100vh;object-fit:contain;"/>
                                      </body></html>
                                    `);
                                      }
                                    }}
                                  >
                                    🔍 Full View
                                  </ImageActionButton>
                                </ImageActions>
                              </ImagePreviewContainer>
                            )}
                            {/* Video Preview */}
                            {msg.videoUrl && (
                              <ImagePreviewContainer>
                                <PreviewVideo controls autoPlay={false}>
                                  <source src={msg.videoUrl} type="video/mp4" />
                                  Your browser does not support video playback.
                                </PreviewVideo>
                              </ImagePreviewContainer>
                            )}
                            {/* Audio Preview */}
                            {msg.audioData && (
                              <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(0,0,0,0.04)', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#212121', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span>🔊</span> Cinematic Narration
                                </div>
                                <audio controls src={`data:audio/mp3;base64,${msg.audioData}`} style={{ width: '100%', height: '36px' }} />
                              </div>
                            )}
                          </BubbleComponent>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </ChatContent>
                <ScrollToBottomButton
                  $visible={showScrollToBottom}
                  onClick={scrollToBottom}
                  title="Scroll to bottom"
                >
                  <FiChevronDown size={20} />
                </ScrollToBottomButton>
              </ChatContentWrapper>

              <Footer>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />

                {/* Production limit message */}
                {isProd && (
                  <div style={{
                    padding: '8px 12px',
                    marginBottom: '8px',
                    backgroundColor: isLimitReached ? '#ffebee' : '#e3f2fd',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    textAlign: 'center',
                    color: isLimitReached ? '#c62828' : '#1565c0'
                  }}>
                    {isLimitReached
                      ? '🚫 Generation limit reached (3/3)'
                      : `⚡ ${generationsLeft} generation${generationsLeft !== 1 ? 's' : ''} left`}
                  </div>
                )}

                {/* TEXT INPUT FIRST - Main element like Antigravity */}
                <TextInputContainer>
                  <IconButton title="Attach PDF or text file" onClick={handleAttachClick} disabled={isLimitReached}>
                    <FiPaperclip size={18} />
                  </IconButton>
                  <StyledInput
                    placeholder={isLimitReached ? "Generation limit reached" : (attachedFile ? "Describe what to build from the spec..." : "Upload a spec PDF to start, or speak to VibIndu...")}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={3}
                    disabled={isLimitReached}
                  />
                  <IconButton
                    title="🎙️ Live Voice Mode – Speak to VibIndu"
                    onClick={() => setIsLiveModeActive(true)}
                    style={{
                      background: isLiveModeActive ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' : 'rgba(79, 70, 229, 0.1)',
                      color: isLiveModeActive ? 'white' : '#4f46e5',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      fontSize: '1.2rem',
                      lineHeight: 1,
                      border: '1px solid rgba(79, 70, 229, 0.2)',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                    }}
                  >
                    🎙️
                  </IconButton>
                  {/* Computer Use and Storyteller temporarily disabled for Live Agent Challenge focus */}
                  {/* 
                  <IconButton ... />
                  <IconButton ... />
                  */}
                  <SendButton onClick={handleSendMessage} disabled={!inputValue.trim() || isLimitReached}>
                    <FiSend size={16} />
                  </SendButton>
                </TextInputContainer>

                {/* SETTINGS BELOW TEXT INPUT - Model + Thinking Level */}
                <SettingsRow>
                  <SettingGroup>
                    <Select value={selectedModel} onChange={(e) => handleModelChange(e.target.value)}>
                      <option value="gemini-3.1-flash-lite-preview">⚡ Gemini 3.1 Flash Lite</option>
                      <option value="gemini-3-pro-preview">💎 Gemini 3 Pro</option>
                      <option value="gemini-3.1-pro-preview">💎 Gemini 3.1 Pro (Preview)</option>
                    </Select>
                  </SettingGroup>
                  <SettingGroup>
                    <Select value={thinkingLevel} onChange={(e) => setThinkingLevel(e.target.value)}>
                      {getThinkingLevels(selectedModel).map(level => (
                        <option key={level.value} value={level.value}>{level.label}</option>
                      ))}
                    </Select>
                  </SettingGroup>
                </SettingsRow>
              </Footer>
            </Content>
          </>
        )}
        {/* Hidden SFC Thumbnail Renderers */}
        {pendingSfcRenders.map((sfc, idx) => (
          <SfcThumbnailRenderer
            key={`${sfc.name}-${idx}`}
            diagram={sfc.sfc_content}
            onRendered={(imageData) => {
              console.log(`[VibeSidebar] ✅ SFC Thumbnail rendered for ${sfc.name}`);
              // Add message to chat with the image
              addMessage({
                text: `✅ **SFC Generated: ${sfc.name}**\n\nMode: **${sfc.mode_id || 'Global'}**\nPath: \`${sfc.path}\``,
                isUser: false,
                agent: 'SFC Programmer',
                imageData: imageData.split(',')[1] // Just the base64 part
              } as any);

              // Remove from pending
              setPendingSfcRenders(prev => prev.filter(item => item !== sfc));
            }}
          />
        ))}

        {/* Live Agent Mode – integrated voice overlay within sidebar */}
        {isLiveModeActive && (
          <LiveAgentMode
            onDispatch={(query) => {
              handleSendFromLive(query);
            }}
            onClose={() => setIsLiveModeActive(false)}
            projectPath={currentProject?.localPath}
          />
        )}

        {isComputerModeActive && (
          <ComputerAgentMode
            onClose={() => setIsComputerModeActive(false)}
          />
        )}

        {isStorytellerModeActive && (
          <StorytellerMode
            onClose={() => setIsStorytellerModeActive(false)}
            projectPath={currentProject?.localPath}
          />
        )}

      </SidebarContainer>
    </>
  );
};

export default VibeSidebar;
