-- DropIndex (unique constraint @@unique([branchId, sku]))
DROP INDEX IF EXISTS "inventory_products_branchId_sku_key";

-- AlterTable
ALTER TABLE "inventory_products" DROP COLUMN IF EXISTS "sku";
