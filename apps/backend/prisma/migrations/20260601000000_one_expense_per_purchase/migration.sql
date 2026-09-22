-- 1. Wipe per-item auto-generated rows. They'll be re-created as one row per
--    Purchase by the new sync helper next time the Purchase is saved.
DELETE FROM "accounting_expenses" WHERE "sourceType" = 'PURCHASE_ITEM';

-- 2. Rename the enum value so the code reads cleanly (was per-item, now per-purchase).
ALTER TYPE "AccountingSourceType" RENAME VALUE 'PURCHASE_ITEM' TO 'PURCHASE';

-- 3. Drop the link to PurchaseItem entirely.
ALTER TABLE "accounting_expenses" DROP CONSTRAINT IF EXISTS "accounting_expenses_purchaseItemId_fkey";
DROP INDEX IF EXISTS "accounting_expenses_purchaseItemId_key";
ALTER TABLE "accounting_expenses" DROP COLUMN IF EXISTS "purchaseItemId";

-- 4. purchaseId is now the unique key for auto-generated rows.
--    Postgres treats multiple NULLs as distinct, so MANUAL rows (purchaseId IS
--    NULL) coexist freely.
CREATE UNIQUE INDEX "accounting_expenses_purchaseId_key"
  ON "accounting_expenses"("purchaseId");
