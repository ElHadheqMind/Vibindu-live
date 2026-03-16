import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { API_ROOT } from '../config';

interface SocketState {
    socket: Socket | null;
    isConnected: boolean;

    // Actions
    connect: () => void;
    disconnect: () => void;
    subscribe: (event: string, callback: (data: any) => void) => void;
    unsubscribe: (event: string, callback?: (data: any) => void) => void;
}

// Create a single socket instance outside the store to avoid multiple connections
let socketInstance: Socket | null = null;

export const useSocketStore = create<SocketState>((set, get) => ({
    socket: null,
    isConnected: false,

    connect: () => {
        if (socketInstance?.connected) return;

        // Connect to the backend URL
        // Adjust URL if your backend runs on a different port/host in different environments
        const backendUrl = API_ROOT;

        console.log('🔌 Connecting to WebSocket:', backendUrl);

        socketInstance = io(backendUrl, {
            transports: ['websocket', 'polling'], // Try websocket first
            withCredentials: true,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        socketInstance.on('connect', () => {
            console.log('✅ WebSocket connected:', socketInstance?.id);
            set({ isConnected: true, socket: socketInstance });
        });

        socketInstance.on('disconnect', (reason) => {
            console.log('❌ WebSocket disconnected:', reason);
            set({ isConnected: false });
        });

        socketInstance.on('connect_error', (err) => {
            console.error('⚠️ WebSocket connection error:', err);
        });

        set({ socket: socketInstance });
    },

    disconnect: () => {
        if (socketInstance) {
            socketInstance.disconnect();
            socketInstance = null;
            set({ isConnected: false, socket: null });
        }
    },

    subscribe: (event, callback) => {
        if (!socketInstance) {
            // Auto-connect if trying to subscribe
            get().connect();
        }
        // We need to wait for socketInstance to be defined if connect() was just called
        // But since connect() sets socketInstance synchronously (even if connection is async), it should be fine.

        if (socketInstance) {
            socketInstance.on(event, callback);
        }
    },

    unsubscribe: (event, callback) => {
        if (socketInstance) {
            if (callback) {
                socketInstance.off(event, callback);
            } else {
                socketInstance.off(event);
            }
        }
    }
}));
