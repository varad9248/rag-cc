import { create } from 'zustand';

interface AuthState {
  token: string | null;
  setToken: (token: string) => void;
  logout: () => void;
  initAuth: () => void; // Safely load token on client mount
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  setToken: (token: string) => {
    localStorage.setItem('token', token);
    set({ token });
  },
  logout: () => {
    localStorage.removeItem('token');
    set({ token: null });
  },
  initAuth: () => {
    const token = localStorage.getItem('token');
    if (token) set({ token });
  }
}));