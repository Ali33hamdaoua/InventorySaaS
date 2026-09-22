import api from '@/lib/api';
import type { Paginated, PurchaseDto, PurchaseSummaryDto } from '@inventorymdb/shared';

export type Purchase = PurchaseDto;
export type PurchaseSummary = PurchaseSummaryDto;

export interface ListPurchasesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  supplierId?: string;
  startDate?: string; // ISO yyyy-mm-dd
  endDate?: string;
  periodId?: string;
  includeItems?: 'true' | 'false';
  branchId?: string;
}

export interface PurchaseItemPayload {
  productId: string;
  quantity: number;
  unitPrice: number;
}

/** Frais supplémentaire d'approvisionnement (essence, livraison, péage…).
 *  N'affecte AUCUN prix produit ni le WAC — géré séparément comme dépense
 *  comptable HT dans le rapport financier. */
export interface PurchaseAdditionalCostPayload {
  costType: string; // ESSENCE / LIVRAISON / PEAGE / TRANSPORT / MANUTENTION / CHAINE_DU_FROID / DOUANE / AUTRE
  description?: string;
  accountingCategoryId: string;
  amountBeforeTax: number;
  tpsAmount: number;
  tvqAmount: number;
}

export interface PurchasePayload {
  branchId?: string;
  supplierId: string;
  purchaseDate: string; // ISO yyyy-mm-dd
  note?: string | null;
  items: PurchaseItemPayload[];
  /** Manual entry — backend sums HT + TPS + TVQ, no rate enforcement. */
  tpsAmount: number;
  tvqAmount: number;
  /** Frais supplémentaires optionnels. `undefined` = ne rien changer,
   *  `[]` = effacer tous les frais existants. */
  additionalCosts?: PurchaseAdditionalCostPayload[];
}

export const purchasesService = {
  list: (params?: ListPurchasesParams) =>
    api.get<Paginated<Purchase>>('/purchases', { params }).then((r) => r.data),

  get: (id: string) => api.get<Purchase>(`/purchases/${id}`).then((r) => r.data),

  summary: (params?: { periodId?: string; month?: number; year?: number; branchId?: string }) =>
    api.get<PurchaseSummary>('/purchases/summary', { params }).then((r) => r.data),

  create: (data: PurchasePayload) =>
    api.post<Purchase>('/purchases', data).then((r) => r.data),

  update: (id: string, data: Partial<PurchasePayload>) =>
    api.patch<Purchase>(`/purchases/${id}`, data).then((r) => r.data),

  remove: (id: string) =>
    api.delete<{ success: true }>(`/purchases/${id}`).then((r) => r.data),
};
