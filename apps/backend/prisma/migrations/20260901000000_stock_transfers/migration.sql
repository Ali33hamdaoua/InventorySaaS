-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('COMPLETED', 'REVERSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'STOCK_TRANSFER';
ALTER TYPE "AuditAction" ADD VALUE 'REVERSE_TRANSFER';

-- AlterTable
ALTER TABLE "inventory_lines" ADD COLUMN     "transferInQuantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
ADD COLUMN     "transferOutQuantity" DECIMAL(14,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" UUID NOT NULL,
    "fromBranchId" UUID NOT NULL,
    "toBranchId" UUID NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'COMPLETED',
    "note" VARCHAR(500),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "reversedTransferId" UUID,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_items" (
    "id" UUID NOT NULL,
    "transferId" UUID NOT NULL,
    "sourceProductId" UUID NOT NULL,
    "targetProductId" UUID NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_transfers_fromBranchId_idx" ON "stock_transfers"("fromBranchId");

-- CreateIndex
CREATE INDEX "stock_transfers_toBranchId_idx" ON "stock_transfers"("toBranchId");

-- CreateIndex
CREATE INDEX "stock_transfers_createdAt_idx" ON "stock_transfers"("createdAt");

-- CreateIndex
CREATE INDEX "stock_transfer_items_transferId_idx" ON "stock_transfer_items"("transferId");

-- CreateIndex
CREATE INDEX "stock_transfer_items_sourceProductId_idx" ON "stock_transfer_items"("sourceProductId");

-- CreateIndex
CREATE INDEX "stock_transfer_items_targetProductId_idx" ON "stock_transfer_items"("targetProductId");

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_toBranchId_fkey" FOREIGN KEY ("toBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_reversedTransferId_fkey" FOREIGN KEY ("reversedTransferId") REFERENCES "stock_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_sourceProductId_fkey" FOREIGN KEY ("sourceProductId") REFERENCES "inventory_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_targetProductId_fkey" FOREIGN KEY ("targetProductId") REFERENCES "inventory_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

