import api from '@/lib/api';
import type { RepairEntryDto, RepairStatus, RepairSummaryDto } from '@inventorymdb/shared';

export type RepairEntry = RepairEntryDto;
export type RepairSummary = RepairSummaryDto;
export type { RepairStatus };

export interface ListRepairsParams {
  branchId?: string;
  month?: number;
  year?: number;
  status?: RepairStatus;
}

export interface RepairEntryPayload {
  branchId?: string;
  date: string;
  title: string;
  equipment?: string | null;
  vendorName?: string | null;
  amountBeforeTax: number;
  tpsAmount: number;
  tvqAmount: number;
  status?: RepairStatus;
  notes?: string | null;
}

export const repairsService = {
  list: (params?: ListRepairsParams) =>
    api.get<RepairEntry[]>('/repairs', { params }).then((r) => r.data),

  summary: (params: { month: number; year: number; branchId?: string }) =>
    api.get<RepairSummary>('/repairs/summary', { params }).then((r) => r.data),

  get: (id: string) => api.get<RepairEntry>(`/repairs/${id}`).then((r) => r.data),

  create: (data: RepairEntryPayload) =>
    api.post<RepairEntry>('/repairs', data).then((r) => r.data),

  update: (id: string, data: Partial<RepairEntryPayload>) =>
    api.patch<RepairEntry>(`/repairs/${id}`, data).then((r) => r.data),

  remove: (id: string) =>
    api.delete<{ success: true }>(`/repairs/${id}`).then((r) => r.data),
};
