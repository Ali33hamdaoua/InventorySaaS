import api from '@/lib/api';
import type { FinancialReportDto } from '@inventorymdb/shared';

export type FinancialReport = FinancialReportDto;

export interface GetFinancialReportParams {
  branchId?: string;
  month: number;
  year: number;
}

export interface UpdateFinancialReportPayload {
  sales?: number;
  discounts?: number;
  employeeMeals?: number;
  tips?: number;
  otherRevenue?: number;
  laborCost?: number;
  notes?: string | null;
}

export const financialReportsService = {
  /** Get-or-create the monthly report for (branchId, month, year). */
  get: (params: GetFinancialReportParams) =>
    api
      .get<FinancialReport>('/financial-reports', { params })
      .then((r) => r.data),

  getById: (id: string) =>
    api.get<FinancialReport>(`/financial-reports/${id}`).then((r) => r.data),

  update: (id: string, data: UpdateFinancialReportPayload) =>
    api.patch<FinancialReport>(`/financial-reports/${id}`, data).then((r) => r.data),

  lock: (id: string) =>
    api.post<FinancialReport>(`/financial-reports/${id}/lock`).then((r) => r.data),

  unlock: (id: string) =>
    api.post<FinancialReport>(`/financial-reports/${id}/unlock`).then((r) => r.data),
};
