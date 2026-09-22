import api from '@/lib/api';
import type { BranchDto } from '@inventorymdb/shared';

export type Branch = BranchDto;

export interface BranchPayload {
  name: string;
  slug: string;
  address?: string | null;
  isActive?: boolean;
}

export const branchesService = {
  list: (params?: { includeInactive?: boolean; includeStats?: boolean }) =>
    api
      .get<Branch[]>('/branches', {
        params: {
          includeInactive: params?.includeInactive ? 'true' : undefined,
          includeStats: params?.includeStats ? 'true' : undefined,
        },
      })
      .then((r) => r.data),

  get: (id: string) => api.get<Branch>(`/branches/${id}`).then((r) => r.data),

  create: (data: BranchPayload) =>
    api.post<Branch>('/branches', data).then((r) => r.data),

  update: (id: string, data: Partial<BranchPayload>) =>
    api.patch<Branch>(`/branches/${id}`, data).then((r) => r.data),

  activate: (id: string) =>
    api.patch<Branch>(`/branches/${id}/activate`).then((r) => r.data),

  deactivate: (id: string) =>
    api.patch<Branch>(`/branches/${id}/deactivate`).then((r) => r.data),
};
