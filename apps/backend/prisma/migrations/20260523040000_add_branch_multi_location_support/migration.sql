-- =====================================================================
-- Multi-branch support: Joliette + Bishop
-- =====================================================================
-- Existing data is preserved and backfilled to the Joliette branch so
-- nothing is lost. NOT NULL constraints are added AFTER the backfill.
-- =====================================================================

-- 1. Branches table
CREATE TABLE "branches" (
    "id"        UUID         PRIMARY KEY,
    "name"      VARCHAR(120) NOT NULL,
    "slug"      VARCHAR(60)  NOT NULL,
    "address"   VARCHAR(255),
    "isActive"  BOOLEAN      NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "branches_slug_key" ON "branches"("slug");
CREATE INDEX "branches_isActive_idx" ON "branches"("isActive");

-- 2. Seed the two branches with deterministic UUIDs so the rest of the
--    migration (and any later one) can reference them safely.
INSERT INTO "branches" ("id", "name", "slug", "address", "isActive", "updatedAt")
VALUES
    ('11111111-1111-1111-1111-111111111111', 'Joliette', 'joliette',
     '123 rue Saint-Charles-Borromée Nord, Joliette (QC)', true, CURRENT_TIMESTAMP),
    ('22222222-2222-2222-2222-222222222222', 'Bishop',   'bishop',
     '1450 rue Bishop, Montréal (QC)', true, CURRENT_TIMESTAMP);

-- 3. Add nullable branchId on every branch-scoped table
ALTER TABLE "users"               ADD COLUMN "branchId" UUID;
ALTER TABLE "inventory_products"  ADD COLUMN "branchId" UUID;
ALTER TABLE "purchases"           ADD COLUMN "branchId" UUID;
ALTER TABLE "inventory_periods"   ADD COLUMN "branchId" UUID;
ALTER TABLE "accounting_expenses" ADD COLUMN "branchId" UUID;

-- 4. Backfill existing data to Joliette
UPDATE "inventory_products"  SET "branchId" = '11111111-1111-1111-1111-111111111111' WHERE "branchId" IS NULL;
UPDATE "purchases"           SET "branchId" = '11111111-1111-1111-1111-111111111111' WHERE "branchId" IS NULL;
UPDATE "inventory_periods"   SET "branchId" = '11111111-1111-1111-1111-111111111111' WHERE "branchId" IS NULL;
UPDATE "accounting_expenses" SET "branchId" = '11111111-1111-1111-1111-111111111111' WHERE "branchId" IS NULL;
-- Users left NULL on purpose: ADMIN/OWNER keep cross-branch access.
-- Managers will be assigned manually (or via seed).

-- 5. Enforce NOT NULL on operational tables (users stays nullable)
ALTER TABLE "inventory_products"  ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "purchases"           ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "inventory_periods"   ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "accounting_expenses" ALTER COLUMN "branchId" SET NOT NULL;

-- 6. Foreign keys
ALTER TABLE "users"
    ADD CONSTRAINT "users_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_products"
    ADD CONSTRAINT "inventory_products_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchases"
    ADD CONSTRAINT "purchases_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_periods"
    ADD CONSTRAINT "inventory_periods_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounting_expenses"
    ADD CONSTRAINT "accounting_expenses_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. Replace SKU uniqueness with branch-scoped uniqueness
ALTER TABLE "inventory_products" DROP CONSTRAINT IF EXISTS "inventory_products_sku_key";
DROP INDEX IF EXISTS "inventory_products_sku_key";
CREATE UNIQUE INDEX "inventory_products_branchId_sku_key"
    ON "inventory_products"("branchId", "sku");

-- 8. Replace period (year, month) uniqueness with branch-scoped uniqueness
ALTER TABLE "inventory_periods" DROP CONSTRAINT IF EXISTS "inventory_periods_year_month_key";
DROP INDEX IF EXISTS "inventory_periods_year_month_key";
CREATE UNIQUE INDEX "inventory_periods_branchId_year_month_key"
    ON "inventory_periods"("branchId", "year", "month");

-- 9. Supporting indexes
CREATE INDEX "users_branchId_idx"               ON "users"("branchId");
CREATE INDEX "inventory_products_branchId_idx"  ON "inventory_products"("branchId");
CREATE INDEX "purchases_branchId_idx"           ON "purchases"("branchId");
CREATE INDEX "inventory_periods_branchId_idx"   ON "inventory_periods"("branchId");
CREATE INDEX "accounting_expenses_branchId_idx" ON "accounting_expenses"("branchId");
