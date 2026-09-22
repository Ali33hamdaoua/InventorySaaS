import api from '@/lib/api';
import type {
  AccountingExpenseDto,
  AccountingSummaryDto,
  Paginated,
  PaymentMethod,
} from '@inventorymdb/shared';

export type AccountingExpense = AccountingExpenseDto;
export type AccountingSummary = AccountingSummaryDto;

export interface ListAccountingExpensesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  /** Dynamic category id (UUID) — the legacy enum filter was removed. */
  accountingCategoryId?: string;
  startDate?: string;
  endDate?: string;
  supplierId?: string;
  paymentMethod?: PaymentMethod;
  minAmount?: number;
  maxAmount?: number;
  branchId?: string;
}

/**
 * Payload for create/update. V2 manual-tax workflow: the client sends HT,
 * a single amount. The backend mirrors it into `totalAmount`.
 *
 * Category is now free-form: send `categoryName` (the backend `findOrCreate`s
 * a row in `accounting_categories` if no case-insensitive match exists). The
 * old enum-based `category` field is gone from the wire.
 */
export interface AccountingExpensePayload {
  branchId?: string;
  expenseDate: string;
  /** Deprecated — backend accepts it for legacy clients but the new UI
   *  never sends it. */
  transactionDate?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  /** Free-form category name. Backend normalizes (trim, case-insensitive
   *  dedup) and creates a row in `accounting_categories` on first use. */
  categoryName: string;
  description: string;
  referenceNumber?: string | null;
  paymentMethod?: PaymentMethod | null;
  amountBeforeTax: number;
  notes?: string | null;
  /** Per-row opt-in for the financial report. Defaults to false on the
   *  server when omitted. */
  includeInFinancialReports?: boolean;
}

export interface AccountingSummaryParams {
  startDate?: string;
  endDate?: string;
  month?: number;
  year?: number;
  branchId?: string;
}

export const accountingService = {
  list: (params?: ListAccountingExpensesParams) =>
    api
      .get<Paginated<AccountingExpense>>('/accounting/expenses', { params })
      .then((r) => r.data),

  get: (id: string) =>
    api.get<AccountingExpense>(`/accounting/expenses/${id}`).then((r) => r.data),

  summary: (params?: AccountingSummaryParams) =>
    api.get<AccountingSummary>('/accounting/summary', { params }).then((r) => r.data),

  create: (data: AccountingExpensePayload) =>
    api.post<AccountingExpense>('/accounting/expenses', data).then((r) => r.data),

  update: (id: string, data: Partial<AccountingExpensePayload>) =>
    api
      .patch<AccountingExpense>(`/accounting/expenses/${id}`, data)
      .then((r) => r.data),

  remove: (id: string) =>
    api.delete<{ success: true }>(`/accounting/expenses/${id}`).then((r) => r.data),
};
