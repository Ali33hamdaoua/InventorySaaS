-- CreateEnum
CREATE TYPE "RepairStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE');

-- CreateTable
CREATE TABLE "labor_entries" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "employeeName" VARCHAR(150) NOT NULL,
    "role" VARCHAR(100),
    "hours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "hourlyRate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "labor_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "labor_entries_branchId_idx" ON "labor_entries"("branchId");
CREATE INDEX "labor_entries_date_idx" ON "labor_entries"("date");

-- AddForeignKey
ALTER TABLE "labor_entries"
  ADD CONSTRAINT "labor_entries_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "repair_entries" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "equipment" VARCHAR(150),
    "vendorName" VARCHAR(150),
    "amountBeforeTax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tpsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tvqAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "RepairStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repair_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repair_entries_branchId_idx" ON "repair_entries"("branchId");
CREATE INDEX "repair_entries_date_idx" ON "repair_entries"("date");
CREATE INDEX "repair_entries_status_idx" ON "repair_entries"("status");

-- AddForeignKey
ALTER TABLE "repair_entries"
  ADD CONSTRAINT "repair_entries_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
