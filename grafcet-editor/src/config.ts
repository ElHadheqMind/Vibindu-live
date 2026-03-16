export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
export const API_ROOT = API_BASE_URL.replace(/\/api$/, '');
export const AGENTS_BASE_URL = import.meta.env.VITE_AGENTS_BASE_URL || 'http://localhost:8000';
