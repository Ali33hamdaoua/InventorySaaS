import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserRole } from '@inventorymdb/shared';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  branchId: string | null;
  branch: { id: string; name: string; slug: string } | null;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  setSession: (token: string, user: AuthUser) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      setSession: (accessToken, user) => set({ accessToken, user }),
      logout: () => set({ accessToken: null, user: null }),
      isAuthenticated: () => !!get().accessToken,
    }),
    { name: 'inventorymdb-auth' },
  ),
);
