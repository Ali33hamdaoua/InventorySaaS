-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('ELECTRICITE', 'LOYER', 'INTERNET_TELEPHONE', 'ACHATS_FOURNISSEURS', 'EMBALLAGES', 'NETTOYAGE', 'MAINTENANCE', 'MARKETING', 'FRAIS_BANCAIRES', 'PLATEFORMES_LIVRAISON', 'AUTRES');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('VIREMENT', 'CARTE', 'ESPECES', 'CHEQUE', 'PRELEVEMENT', 'AUTRE');

-- CreateTable
CREATE TABLE "accounting_expenses" (
    "id" UUID NOT NULL,
    "expenseDate" DATE NOT NULL,
    "transactionDate" DATE,
    "supplierId" UUID,
    "supplierName" VARCHAR(150),
    "category" "ExpenseCategory" NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "referenceNumber" VARCHAR(80),
    "paymentMethod" "PaymentMethod",
    "amountBeforeTax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tpsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tvqAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" VARCHAR(1000),
    "isReconciled" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounting_expenses_expenseDate_idx" ON "accounting_expenses"("expenseDate");

-- CreateIndex
CREATE INDEX "accounting_expenses_category_idx" ON "accounting_expenses"("category");

-- CreateIndex
CREATE INDEX "accounting_expenses_supplierId_idx" ON "accounting_expenses"("supplierId");

-- CreateIndex
CREATE INDEX "accounting_expenses_isReconciled_idx" ON "accounting_expenses"("isReconciled");

-- CreateIndex
CREATE INDEX "accounting_expenses_deletedAt_idx" ON "accounting_expenses"("deletedAt");

-- AddForeignKey
ALTER TABLE "accounting_expenses" ADD CONSTRAINT "accounting_expenses_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
