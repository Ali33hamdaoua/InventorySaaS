import { z } from 'zod';

/**
 * Patch a financial report's user-entered revenue + labor lines. All fields
 * are optional — only the keys present in the body are updated. `notes`
 * accepts null to clear.
 *
 * Computed columns (food cost, expenses, profit, %) are NEVER accepted from
 * the client — the backend recomputes them on every read (DRAFT) or reads
 * them from the snapshot (LOCKED).
 */
export const updateFinancialReportSchema = z
  .object({
    sales: z.coerce.number().nonnegative().optional(),
    discounts: z.coerce.number().nonnegative().optional(),
    employeeMeals: z.coerce.number().nonnegative().optional(),
    tips: z.coerce.number().nonnegative().optional(),
    otherRevenue: z.coerce.number().nonnegative().optional(),
    laborCost: z.coerce.number().nonnegative().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
export type UpdateFinancialReportInput = z.infer<typeof updateFinancialReportSchema>;

export const financialReportQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
});
export type FinancialReportQueryInput = z.infer<typeof financialReportQuerySchema>;
