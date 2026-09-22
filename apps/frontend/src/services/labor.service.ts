import api from '@/lib/api';
import type { LaborEntryDto, LaborSummaryDto } from '@inventorymdb/shared';

export type LaborEntry = LaborEntryDto;
export type LaborSummary = LaborSummaryDto;

export interface ListLaborParams {
  branchId?: string;
  month?: number;
  year?: number;
}

export interface LaborEntryPayload {
  branchId?: string;
  date: string;
  employeeName: string;
  role?: string | null;
  hours: number;
  hourlyRate: number;
  notes?: string | null;
}

export const laborService = {
  list: (params?: ListLaborParams) =>
    api.get<LaborEntry[]>('/labor', { params }).then((r) => r.data),

  summary: (params: { month: number; year: number; branchId?: string }) =>
    api.get<LaborSummary>('/labor/summary', { params }).then((r) => r.data),

  get: (id: string) => api.get<LaborEntry>(`/labor/${id}`).then((r) => r.data),

  create: (data: LaborEntryPayload) =>
    api.post<LaborEntry>('/labor', data).then((r) => r.data),

  update: (id: string, data: Partial<LaborEntryPayload>) =>
    api.patch<LaborEntry>(`/labor/${id}`, data).then((r) => r.data),

  remove: (id: string) =>
    api.delete<{ success: true }>(`/labor/${id}`).then((r) => r.data),
};
