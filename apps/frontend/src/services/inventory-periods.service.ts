import api from '@/lib/api';
import type { InventoryPeriodDto, InventoryDashboardSummary, PeriodStatus } from '@inventorymdb/shared';

export type InventoryPeriod = InventoryPeriodDto;

export interface BootstrapPeriodPayload {
  branchId?: string;
  month?: number;
  year?: number;
}

export interface ClosePeriodPayload {
  salesRevenue?: number | null;
  closingDate?: string;
}

export const inventoryPeriodsService = {
  list: (params?: { status?: PeriodStatus; branchId?: string }) =>
    api.get<InventoryPeriod[]>('/inventory-periods', { params }).then((r) => r.data),

  get: (id: string) => api.get<InventoryPeriod>(`/inventory-periods/${id}`).then((r) => r.data),

  current: (branchId?: string) =>
    api
      .get<InventoryPeriod | null>('/inventory-periods/current', { params: { branchId } })
      .then((r) => r.data),

  summary: (branchId?: string) =>
    api
      .get<InventoryDashboardSummary>('/inventory-periods/summary', { params: { branchId } })
      .then((r) => r.data),

  /**
   * One-shot init of the first inventory period for the branch. The backend
   * rejects this with 409 if any period already exists — after that the
   * close() flow auto-creates each month.
   */
  bootstrap: (data: BootstrapPeriodPayload) =>
    api.post<InventoryPeriod>('/inventory-periods/bootstrap', data).then((r) => r.data),

  close: (id: string, data: ClosePeriodPayload) =>
    api.post<InventoryPeriod>(`/inventory-periods/${id}/close`, data).then((r) => r.data),

  /**
   * Réouvre une période CLOSED. Owner/Admin uniquement (backend 403 sinon).
   * Renvoie la période avec status=OPEN + un éventuel warning si un rapport
   * financier LOCKED est lié au même mois.
   *
   * Aucune donnée n'est perdue : lignes, quantités, notes sont conservées.
   * Le snapshot InventoryReport reste figé jusqu'à la prochaine clôture.
   */
  reopen: (id: string) =>
    api
      .post<{
        period: InventoryPeriod;
        lockedReportWarning: { id: string; message: string } | null;
      }>(`/inventory-periods/${id}/reopen`)
      .then((r) => r.data),
};
