import api from '@/lib/api';
import type { UserDto, UserRole } from '@inventorymdb/shared';

export type User = UserDto;

export interface ListUsersParams {
  search?: string;
  role?: UserRole;
  branchId?: string;
  isActive?: 'true' | 'false';
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  branchId?: string | null;
  isActive?: boolean;
}

export interface UpdateUserPayload {
  name?: string;
  email?: string;
  role?: UserRole;
  branchId?: string | null;
  isActive?: boolean;
}

export const usersService = {
  list: (params?: ListUsersParams) =>
    api.get<User[]>('/users', { params }).then((r) => r.data),

  get: (id: string) => api.get<User>(`/users/${id}`).then((r) => r.data),

  create: (data: CreateUserPayload) =>
    api.post<User>('/users', data).then((r) => r.data),

  update: (id: string, data: UpdateUserPayload) =>
    api.patch<User>(`/users/${id}`, data).then((r) => r.data),

  setStatus: (id: string, isActive: boolean) =>
    api.patch<User>(`/users/${id}/status`, { isActive }).then((r) => r.data),

  remove: (id: string) =>
    api.delete<{ success: true }>(`/users/${id}`).then((r) => r.data),
};
