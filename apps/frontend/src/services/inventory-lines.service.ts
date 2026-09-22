import api from '@/lib/api';
import type { InventoryLineDto } from '@inventorymdb/shared';

export type InventoryLine = InventoryLineDto;

export interface UpsertLinePayload {
  productId: string;
  openingQuantity?: number;
  openingUnitCost?: number;
  closingQuantity?: number;
  closingUnitCost?: number;
}

export interface BulkLinesPayload {
  lines: UpsertLinePayload[];
}

export const inventoryLinesService = {
  listByPeriod: (periodId: string) =>
    api.get<InventoryLine[]>(`/inventory-periods/${periodId}/lines`).then((r) => r.data),

  upsertOne: (periodId: string, line: UpsertLinePayload) =>
    api.put<InventoryLine>(`/inventory-periods/${periodId}/lines`, line).then((r) => r.data),

  bulk: (periodId: string, payload: BulkLinesPayload) =>
    api
      .post<InventoryLine[]>(`/inventory-periods/${periodId}/lines/bulk`, payload)
      .then((r) => r.data),
};
