-- CreateEnum
CREATE TYPE "AccountingSourceType" AS ENUM ('MANUAL', 'PURCHASE_ITEM');

-- AlterTable
ALTER TABLE "accounting_expenses"
  ADD COLUMN "sourceType" "AccountingSourceType" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "purchaseId" UUID,
  ADD COLUMN "purchaseItemId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "accounting_expenses_purchaseItemId_key"
  ON "accounting_expenses"("purchaseItemId");

-- CreateIndex
CREATE INDEX "accounting_expenses_sourceType_idx"
  ON "accounting_expenses"("sourceType");

-- CreateIndex
CREATE INDEX "accounting_expenses_purchaseId_idx"
  ON "accounting_expenses"("purchaseId");

-- AddForeignKey
ALTER TABLE "accounting_expenses"
  ADD CONSTRAINT "accounting_expenses_purchaseId_fkey"
  FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_expenses"
  ADD CONSTRAINT "accounting_expenses_purchaseItemId_fkey"
  FOREIGN KEY ("purchaseItemId") REFERENCES "purchase_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
