-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "contactName" VARCHAR(150),
ADD COLUMN     "notes" VARCHAR(1000);

-- CreateIndex
CREATE INDEX "suppliers_isActive_idx" ON "suppliers"("isActive");
