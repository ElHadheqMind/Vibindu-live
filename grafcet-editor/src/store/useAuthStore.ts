import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { API_BASE_URL } from '../config';

interface User {
  id: string;
  username?: string;
  email: string;
  name?: string;
  avatar?: string;
  vibeAccess?: boolean; // Access to Vibe Agent (granted by admin)
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (username: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, username: string) => Promise<void>;
  googleLogin: (credential: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const API_URL = `${API_BASE_URL}/auth`;

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      user: null,
      token: null,
      isLoading: false,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: username, password }) // Backend accepts identifier as email/username
          });

          const data = await response.json();

          if (!data.success) {
            throw new Error(data.error || 'Login failed');
          }

          const user = extractUser(data.user);

          set({
            isAuthenticated: true,
            user,
            token: data.token,
            isLoading: false,
          });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'An error occurred',
          });
        }
      },

      register: async (email: string, password: string, name: string, username: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name })
          });

          const data = await response.json();

          if (!data.success) {
            throw new Error(data.error || 'Registration failed');
          }

          // Automatically login after registration
          const state = useAuthStore.getState();
          await state.login(email, password);

        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Registration error',
          });
          throw error;
        }
      },

      googleLogin: async (token: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`${API_URL}/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: token })
          });

          const data = await response.json();

          if (!data.success) {
            throw new Error(data.error || 'Google Login failed');
          }

          const user = extractUser(data.user);

          set({
            isAuthenticated: true,
            user,
            token: data.token,
            isLoading: false,
          });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Google Login error',
          });
        }
      },

      logout: () => {
        set({
          isAuthenticated: false,
          user: null,
          token: null
        });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'grafcet-editor-auth',
    }
  )
);

function extractUser(backendUser: any): User {
  return {
    id: backendUser.id,
    username: backendUser.username,
    email: backendUser.email,
    name: backendUser.name,
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(backendUser.name || backendUser.email)}&background=random&color=fff`,
    vibeAccess: backendUser.vibeAccess || false
  };
}
