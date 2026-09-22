-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('FOOD', 'NON_FOOD');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "categoryType" "CategoryType" NOT NULL DEFAULT 'FOOD',
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "categories_categoryType_idx" ON "categories"("categoryType");

-- CreateIndex
CREATE INDEX "categories_isActive_idx" ON "categories"("isActive");
