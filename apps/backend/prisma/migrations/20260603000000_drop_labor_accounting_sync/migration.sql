-- =====================================================================
-- Reverse the LABOR → AccountingExpense sync from
-- `20260602000000_accounting_sync_labor_repair`. The client confirmed
-- Labor stays standalone — it must NOT show up in the Accounting view.
--
-- We deliberately keep the SCHEMA artifacts (`AccountingSourceType.LABOR`
-- enum value, `accounting_expenses.laborId` column + FK, `MAIN_DOEUVRE`
-- category, `LaborEntry.accountingExpense` back-relation) to avoid a
-- breaking enum/column drop on a Supabase prod. The application code no
-- longer writes through them — see labor.service.ts.
--
-- All we do here: purge any LABOR-sourced rows the previous version
-- already created, so the Accounting UI is clean from the next deploy.
-- =====================================================================

DELETE FROM "accounting_expenses" WHERE "sourceType" = 'LABOR';
