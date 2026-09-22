import api from '@/lib/api';
import type { UserRole } from '@inventorymdb/shared';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    branchId: string | null;
    branch: { id: string; name: string; slug: string } | null;
  };
}

export const authService = {
  login: (payload: LoginPayload) => api.post<LoginResponse>('/auth/login', payload).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
};
