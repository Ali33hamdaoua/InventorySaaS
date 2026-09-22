-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "cancelledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "purchases_cancelledAt_idx" ON "purchases"("cancelledAt");
