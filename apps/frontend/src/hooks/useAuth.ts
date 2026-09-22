import { useAuthStore } from '@/stores/auth.store';

export function useAuth() {
  return useAuthStore((s) => ({
    user: s.user,
    accessToken: s.accessToken,
    isAuthenticated: !!s.accessToken,
  }));
}
