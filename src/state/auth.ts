import { create } from 'zustand';
import { api, type User } from '../api/client';

type AuthState = {
  user: User | null;
  status: 'loading' | 'ready';
  refresh: () => Promise<void>;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
};

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'loading',
  refresh: async () => {
    try {
      const { user } = await api.me();
      set({ user, status: 'ready' });
    } catch {
      set({ user: null, status: 'ready' });
    }
  },
  setUser: (user) => set({ user }),
  logout: async () => {
    try { await api.logout(); } catch { /* ignore */ }
    set({ user: null });
  },
}));
