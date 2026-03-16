import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { useAutoSaveStore } from './useAutoSaveStore';
import { API_BASE_URL } from '../config';

// API base URL for VibIndu chat endpoints
const API_BASE = `${API_BASE_URL}/vibe`;

// Helper to get headers with auth token (matching apiService.ts pattern)
const getAuthHeaders = (): HeadersInit => {
    try {
        const storageItem = localStorage.getItem('grafcet-editor-auth');
        if (storageItem) {
            const { state } = JSON.parse(storageItem);
            const token = state?.token;
            if (token) {
                return {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                };
            }
        }
    } catch (e) {
        console.warn('[VibeChatStore] Error accessing auth token:', e);
    }

    return {
        'Content-Type': 'application/json',
    };
};

/**
 * Message interface matching VibInduSidebar
 */
export interface VibeChatMessage {
    id: string;
    text: string;
    isUser: boolean;
    agent?: string;
    timestamp: string;
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

/**
 * Conversation interface
 */
export interface VibeChatConversation {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: VibeChatMessage[];
    metadata: {
        model: string;
        mode: string;
        thinkingLevel: number;
    };
}

interface VibeChatState {
    // Conversation data
    conversations: VibeChatConversation[];
    activeConversationId: string | null;

    // Current project path for persistence
    currentProjectPath: string | null;

    // Internal
    _saveTimeout?: ReturnType<typeof setTimeout>;
    _isLoaded: boolean;
    _isSaving: boolean;  // Track if a save is in progress
    _pendingSave: boolean;  // Track if there are unsaved changes
    _isLoading: boolean;  // Track if conversations are being loaded
    _pendingMessages: Omit<VibeChatMessage, 'id' | 'timestamp'>[];  // Queue for messages during load

    // Actions
    setProjectPath: (path: string | null) => Promise<void>;
    createConversation: (metadata?: Partial<VibeChatConversation['metadata']>) => string;
    deleteConversation: (conversationId: string) => void;
    setActiveConversation: (conversationId: string | null) => void;
    addMessage: (message: Omit<VibeChatMessage, 'id' | 'timestamp'>) => void;
    updateLastMessage: (text: string) => void;
    appendToAgentMessage: (text: string, agent: string) => void;
    clearCurrentConversation: () => void;
    updateConversationTitle: (conversationId: string, title: string) => void;
    updateConversationMetadata: (conversationId: string, metadata: Partial<VibeChatConversation['metadata']>) => void;

    // Persistence
    loadConversations: (projectPath: string) => Promise<void>;
    saveConversations: () => Promise<void>;
    requestAutoSave: () => void;

    // Getters
    getActiveConversation: () => VibeChatConversation | null;
    getActiveMessages: () => VibeChatMessage[];
}

export const useVibeChatStore = create<VibeChatState>((set, get) => ({
    conversations: [],
    activeConversationId: null,
    currentProjectPath: null,
    _saveTimeout: undefined,
    _isLoaded: false,
    _isSaving: false,
    _pendingSave: false,
    _isLoading: false,  // Flag to prevent concurrent loads/adds
    _pendingMessages: [],  // Queue for messages during load

    setProjectPath: async (path) => {
        const currentPath = get().currentProjectPath;
        const isLoaded = get()._isLoaded;
        const isLoading = get()._isLoading;
        const pendingSave = get()._pendingSave;
        const saveTimeout = get()._saveTimeout;
        const conversationsCount = get().conversations.length;
        const activeConvMessages = get().getActiveMessages().length;

        console.log('[VibeChatStore] setProjectPath called:', {
            requestedPath: path,
            currentPath,
            isLoaded,
            isLoading,
            pendingSave,
            conversationsCount,
            activeConvMessages
        });

        // SAFETY: If already loading, don't trigger another load
        if (isLoading) {
            console.log('[VibeChatStore] setProjectPath: Already loading, skipping');
            return;
        }

        // CRITICAL: If path is the same, NEVER reload - just skip
        // This prevents losing messages when useEffect re-runs
        if (path === currentPath) {
            console.log('[VibeChatStore] setProjectPath: Same path, skipping');
            return;
        }

        // Path is different - we need to switch projects
        if (path) {
            // CRITICAL FIX: Flush any pending saves BEFORE loading new conversations
            // This prevents data loss when switching panels/projects while messages are being added
            if (pendingSave || saveTimeout) {
                console.log('[VibeChatStore] setProjectPath: Flushing pending saves before loading...');
                // Clear the debounce timeout
                if (saveTimeout) {
                    clearTimeout(saveTimeout);
                    set({ _saveTimeout: undefined });
                }
                // Force immediate save of current state
                await get().saveConversations();
            }

            console.log('[VibeChatStore] setProjectPath: loading conversations for', path);
            set({ currentProjectPath: path, _isLoaded: false });
            await get().loadConversations(path);
        } else {
            set({ currentProjectPath: null, _isLoaded: false });
        }
    },

    createConversation: (metadata) => {
        const id = uuidv4();
        const now = new Date().toISOString();
        const newConversation: VibeChatConversation = {
            id,
            title: 'New Chat',
            createdAt: now,
            updatedAt: now,
            messages: [],
            metadata: {
                model: metadata?.model || 'gemini-3.1-pro-preview',
                mode: metadata?.mode || 'fast',
                thinkingLevel: metadata?.thinkingLevel || 2,
            }
        };

        set((state) => ({
            conversations: [newConversation, ...state.conversations],
            activeConversationId: id
        }));

        get().requestAutoSave();
        return id;
    },

    deleteConversation: (conversationId) => {
        set((state) => {
            const newConversations = state.conversations.filter(c => c.id !== conversationId);
            const newActiveId = state.activeConversationId === conversationId
                ? (newConversations.length > 0 ? newConversations[0].id : null)
                : state.activeConversationId;

            return {
                conversations: newConversations,
                activeConversationId: newActiveId
            };
        });

        get().requestAutoSave();
    },

    setActiveConversation: (conversationId) => {
        set({ activeConversationId: conversationId });
    },

    addMessage: (message) => {
        const state = get();
        const { activeConversationId, conversations, createConversation, currentProjectPath, _isLoading } = state;

        console.log('[VibeChatStore] 📝 addMessage called:', {
            isUser: message.isUser,
            textPreview: message.text?.slice(0, 50),
            activeConversationId,
            conversationsCount: conversations.length,
            currentProjectPath,
            isLoading: _isLoading
        });

        // CRITICAL FIX: If we're currently loading, queue the message instead of adding directly
        // This prevents race conditions where load overwrites messages
        if (_isLoading) {
            console.log('[VibeChatStore] ⏳ Loading in progress, queuing message');
            set((s) => ({
                _pendingMessages: [...(s._pendingMessages || []), message]
            }));
            return;
        }

        // Auto-create conversation if none exists
        let targetConversationId = activeConversationId;
        if (!targetConversationId || !conversations.find(c => c.id === activeConversationId)) {
            console.log('[VibeChatStore] Creating new conversation (none active)');
            targetConversationId = createConversation();
        }

        const newMessage: VibeChatMessage = {
            ...message,
            id: uuidv4(),
            timestamp: new Date().toISOString()
        };

        set((s) => ({
            conversations: s.conversations.map(conv => {
                if (conv.id === targetConversationId) {
                    // Auto-generate title from first user message
                    let title = conv.title;
                    if (conv.messages.length === 0 && message.isUser && message.text) {
                        title = message.text.slice(0, 50) + (message.text.length > 50 ? '...' : '');
                    }

                    return {
                        ...conv,
                        title,
                        messages: [...conv.messages, newMessage],
                        updatedAt: new Date().toISOString()
                    };
                }
                return conv;
            }),
            _pendingSave: true  // Mark that there are unsaved changes
        }));

        console.log('[VibeChatStore] Message added, triggering auto-save');
        get().requestAutoSave();
    },

    updateLastMessage: (text) => {
        const { activeConversationId } = get();
        if (!activeConversationId) return;

        set((state) => ({
            conversations: state.conversations.map(conv => {
                if (conv.id === activeConversationId && conv.messages.length > 0) {
                    const messages = [...conv.messages];
                    const lastIndex = messages.length - 1;
                    messages[lastIndex] = {
                        ...messages[lastIndex],
                        text: messages[lastIndex].text + text
                    };
                    return { ...conv, messages, updatedAt: new Date().toISOString() };
                }
                return conv;
            })
        }));

        // Debounced auto-save for streaming updates
        get().requestAutoSave();
    },

    // Append streaming text to existing agent message OR create new one
    appendToAgentMessage: (text: string, agent: string) => {
        const { activeConversationId } = get();
        if (!activeConversationId) return;

        set((state) => ({
            conversations: state.conversations.map(conv => {
                if (conv.id === activeConversationId) {
                    const messages = [...conv.messages];
                    const lastMsg = messages[messages.length - 1];

                    // Check if last message is from same agent (append to it)
                    if (lastMsg && !lastMsg.isUser && lastMsg.agent === agent) {
                        messages[messages.length - 1] = {
                            ...lastMsg,
                            text: lastMsg.text + text
                        };
                    } else {
                        // New agent or first message - create new message
                        messages.push({
                            id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            text,
                            isUser: false,
                            agent,
                            timestamp: new Date().toISOString()
                        });
                    }
                    return { ...conv, messages, updatedAt: new Date().toISOString() };
                }
                return conv;
            })
        }));

        // Debounced auto-save
        get().requestAutoSave();
    },

    clearCurrentConversation: () => {
        const { activeConversationId } = get();
        if (!activeConversationId) return;

        set((state) => ({
            conversations: state.conversations.map(conv => {
                if (conv.id === activeConversationId) {
                    return {
                        ...conv,
                        messages: [],
                        title: 'New Chat',
                        updatedAt: new Date().toISOString()
                    };
                }
                return conv;
            })
        }));

        get().requestAutoSave();
    },

    updateConversationTitle: (conversationId, title) => {
        set((state) => ({
            conversations: state.conversations.map(conv =>
                conv.id === conversationId
                    ? { ...conv, title, updatedAt: new Date().toISOString() }
                    : conv
            )
        }));

        get().requestAutoSave();
    },

    updateConversationMetadata: (conversationId, metadata) => {
        set((state) => ({
            conversations: state.conversations.map(conv =>
                conv.id === conversationId
                    ? {
                        ...conv,
                        metadata: { ...conv.metadata, ...metadata },
                        updatedAt: new Date().toISOString()
                    }
                    : conv
            )
        }));

        get().requestAutoSave();
    },

    // Persistence methods
    loadConversations: async (projectPath) => {
        if (!projectPath) {
            console.warn('[VibeChatStore] Cannot load: no project path');
            return;
        }

        const currentConvCount = get().conversations.length;
        const currentMsgCount = get().getActiveMessages().length;
        console.log('[VibeChatStore] 📂 loadConversations called:', {
            projectPath,
            currentConvCount,
            currentMsgCount,
            willOverwrite: currentConvCount > 0 || currentMsgCount > 0
        });

        // Set loading flag to queue any incoming messages
        set({ _isLoading: true });

        try {
            console.log('[VibeChatStore] 📂 Fetching conversations from server...');

            const response = await fetch(`${API_BASE}/load`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ projectPath })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[VibeChatStore] Load failed with status:', response.status, errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json();

            if (result.success && result.data) {
                console.log('[VibeChatStore] ✅ Loaded', result.data.conversations?.length || 0, 'conversations');
                console.log('[VibeChatStore] Active conversation ID:', result.data.activeConversationId);
                set({
                    conversations: result.data.conversations || [],
                    activeConversationId: result.data.activeConversationId || null,
                    currentProjectPath: projectPath,
                    _isLoaded: true,
                    _isLoading: false  // Clear loading flag
                });
            } else {
                console.log('[VibeChatStore] No conversations file found, starting fresh');
                set({
                    conversations: [],
                    activeConversationId: null,
                    currentProjectPath: projectPath,
                    _isLoaded: true,
                    _isLoading: false  // Clear loading flag
                });
            }

            // CRITICAL: Process any messages that were queued during loading
            const pendingMessages = get()._pendingMessages || [];
            if (pendingMessages.length > 0) {
                console.log(`[VibeChatStore] 📬 Processing ${pendingMessages.length} queued messages after load`);
                // Clear pending messages first
                set({ _pendingMessages: [] });
                // Add each queued message
                for (const msg of pendingMessages) {
                    get().addMessage(msg);
                }
            }
        } catch (error) {
            console.error('[VibeChatStore] ❌ Failed to load conversations:', error);
            set({ _isLoaded: true, currentProjectPath: projectPath, _isLoading: false });

            // Still process pending messages on error
            const pendingMessages = get()._pendingMessages || [];
            if (pendingMessages.length > 0) {
                console.log(`[VibeChatStore] 📬 Processing ${pendingMessages.length} queued messages after load error`);
                set({ _pendingMessages: [] });
                for (const msg of pendingMessages) {
                    get().addMessage(msg);
                }
            }
        }
    },

    saveConversations: async () => {
        const { currentProjectPath, conversations, activeConversationId, _isSaving } = get();

        // Prevent concurrent saves
        if (_isSaving) {
            console.log('[VibeChatStore] Save already in progress, skipping');
            return;
        }

        if (!currentProjectPath) {
            console.warn('[VibeChatStore] Cannot save: no project path set');
            return;
        }

        if (conversations.length === 0) {
            console.log('[VibeChatStore] No conversations to save, skipping');
            set({ _pendingSave: false });
            return;
        }

        // Mark save in progress
        set({ _isSaving: true });

        try {
            console.log('[VibeChatStore] 💾 Saving', conversations.length, 'conversations to:', currentProjectPath);
            console.log('[VibeChatStore] Active conversation ID:', activeConversationId);
            console.log('[VibeChatStore] First conversation messages:', conversations[0]?.messages?.length || 0);

            const response = await fetch(`${API_BASE}/save`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    projectPath: currentProjectPath,
                    conversations,
                    activeConversationId
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[VibeChatStore] Save failed with status:', response.status, errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json();
            if (result.success) {
                console.log('[VibeChatStore] ✅ Conversations saved successfully to:', result.savedPath);
                set({ _pendingSave: false });  // Clear pending flag on successful save
            } else {
                console.error('[VibeChatStore] Save returned success=false:', result);
            }
        } catch (error) {
            console.error('[VibeChatStore] ❌ Failed to save conversations:', error);
        } finally {
            set({ _isSaving: false });  // Always clear saving flag
        }
    },

    requestAutoSave: () => {
        const state = get();

        // Clear existing timeout
        if (state._saveTimeout) {
            clearTimeout(state._saveTimeout);
        }

        // Mark pending save and set saving status in UI
        set({ _pendingSave: true });
        useAutoSaveStore.getState().setSaving();

        // Debounced save after 500ms of inactivity
        const timeout = setTimeout(async () => {
            try {
                await get().saveConversations();
                useAutoSaveStore.getState().setSaved();
            } catch (error) {
                console.error('[VibeChatStore] Auto-save error:', error);
                useAutoSaveStore.getState().setError('Auto-save failed');
            }
        }, 500);

        set({ _saveTimeout: timeout });
    },

    // Getters
    getActiveConversation: () => {
        const { conversations, activeConversationId } = get();
        return conversations.find(c => c.id === activeConversationId) || null;
    },

    getActiveMessages: () => {
        const conversation = get().getActiveConversation();
        return conversation?.messages || [];
    }
}));
