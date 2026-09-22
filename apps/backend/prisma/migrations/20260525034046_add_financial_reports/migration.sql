-- CreateEnum
CREATE TYPE "FinancialReportStatus" AS ENUM ('DRAFT', 'LOCKED');

-- CreateTable
CREATE TABLE "financial_reports" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "month" SMALLINT NOT NULL,
    "year" SMALLINT NOT NULL,
    "status" "FinancialReportStatus" NOT NULL DEFAULT 'DRAFT',
    "sales" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discounts" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employeeMeals" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tips" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherRevenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "laborCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "snapshotFoodCost" DECIMAL(14,2),
    "snapshotExpensesByCategory" JSONB,
    "snapshotTotalExpenses" DECIMAL(14,2),
    "snapshotGrossRevenue" DECIMAL(14,2),
    "snapshotNetRevenue" DECIMAL(14,2),
    "snapshotNetProfit" DECIMAL(14,2),
    "snapshotFoodCostPct" DECIMAL(7,4),
    "snapshotNetMarginPct" DECIMAL(7,4),
    "lockedAt" TIMESTAMP(3),
    "lockedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_reports_branchId_idx" ON "financial_reports"("branchId");

-- CreateIndex
CREATE INDEX "financial_reports_status_idx" ON "financial_reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "financial_reports_branchId_year_month_key" ON "financial_reports"("branchId", "year", "month");

-- AddForeignKey
ALTER TABLE "financial_reports" ADD CONSTRAINT "financial_reports_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_reports" ADD CONSTRAINT "financial_reports_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
