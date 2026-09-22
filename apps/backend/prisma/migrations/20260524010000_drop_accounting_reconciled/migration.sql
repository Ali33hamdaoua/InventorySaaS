-- =====================================================================
-- Accounting refactor: drop `isReconciled` (2026-05-24)
-- The client doesn't manage bank reconciliation inside the application —
-- they leave that to their accountant. The column and its index are
-- removed; taxes (TPS/TVQ/total) keep their existing columns since they
-- are auto-computed server-side via the shared `calculateTaxes()` helper.
-- =====================================================================

DROP INDEX IF EXISTS "accounting_expenses_isReconciled_idx";
ALTER TABLE "accounting_expenses" DROP COLUMN IF EXISTS "isReconciled";
