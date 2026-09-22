-- =====================================================================
-- Accounting sync — Labor + Repair modules now auto-mirror into the
-- accounting_expenses table the same way Purchase already does. Each
-- LaborEntry / RepairEntry row owns exactly one AccountingExpense row
-- linked via laborId / repairId (1-to-1, NULL for MANUAL rows).
--
-- Cascade on delete so removing a LaborEntry / RepairEntry auto-cleans
-- the linked accounting row. The unique constraints prevent duplicate
-- mirrors on re-sync (Postgres treats multiple NULLs as distinct, so
-- MANUAL rows coexist freely).
-- =====================================================================

-- 1. Extend the source-type enum to cover the two new origins.
ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'LABOR';
ALTER TYPE "AccountingSourceType" ADD VALUE IF NOT EXISTS 'REPAIR';

-- 2. Extend ExpenseCategory with MAIN_DOEUVRE (used by every LABOR row).
--    Repairs reuse the existing MAINTENANCE category — no schema change.
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'MAIN_DOEUVRE';

-- 3. Add the nullable FK columns + unique indexes + FKs.
ALTER TABLE "accounting_expenses"
  ADD COLUMN IF NOT EXISTS "laborId"  UUID,
  ADD COLUMN IF NOT EXISTS "repairId" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "accounting_expenses_laborId_key"
  ON "accounting_expenses"("laborId");

CREATE UNIQUE INDEX IF NOT EXISTS "accounting_expenses_repairId_key"
  ON "accounting_expenses"("repairId");

ALTER TABLE "accounting_expenses"
  ADD CONSTRAINT "accounting_expenses_laborId_fkey"
  FOREIGN KEY ("laborId") REFERENCES "labor_entries"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "accounting_expenses"
  ADD CONSTRAINT "accounting_expenses_repairId_fkey"
  FOREIGN KEY ("repairId") REFERENCES "repair_entries"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
