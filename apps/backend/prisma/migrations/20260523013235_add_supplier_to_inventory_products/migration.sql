-- AlterTable
ALTER TABLE "inventory_products" ADD COLUMN     "supplierId" UUID;

-- CreateIndex
CREATE INDEX "inventory_products_supplierId_idx" ON "inventory_products"("supplierId");

-- AddForeignKey
ALTER TABLE "inventory_products" ADD CONSTRAINT "inventory_products_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
