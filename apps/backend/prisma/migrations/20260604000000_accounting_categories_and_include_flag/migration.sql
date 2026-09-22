-- =====================================================================
-- Dynamic accounting categories + per-expense include-in-reports flag.
--
--   1. Create `accounting_categories` (free-form, user-extensible).
--   2. Seed the 12 legacy enum values so every existing row has a
--      target in the new table.
--   3. Add `accountingCategoryId` (nullable for the duration of the
--      backfill — the application treats it as required from now on).
--   4. Backfill every existing AccountingExpense to point at the
--      seeded category corresponding to its legacy enum value.
--   5. Add `includeInFinancialReports BOOLEAN DEFAULT FALSE`.
--      Repairs auto-synced previously: set them to TRUE so they keep
--      showing up in the financial report by default (the user can
--      toggle off per-row if they want).
--
-- We deliberately KEEP the legacy `category` enum column and column data
-- on accounting_expenses for now — rollback safety. A future migration
-- can drop it once the application has been live without it for a cycle.
-- =====================================================================

-- 1. Table
CREATE TABLE "accounting_categories" (
  "id"        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"      VARCHAR(120) NOT NULL,
  "isActive"  BOOLEAN      NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "accounting_categories_name_key" ON "accounting_categories"("name");

-- 2. Seed legacy enum values. French labels match the existing UI
-- (EXPENSE_CATEGORY_LABEL in @inventorymdb/shared).
INSERT INTO "accounting_categories" ("name") VALUES
  ('Électricité'),
  ('Loyer'),
  ('Internet / Téléphone'),
  ('Achats fournisseurs'),
  ('Emballages'),
  ('Nettoyage'),
  ('Maintenance'),
  ('Marketing'),
  ('Frais bancaires'),
  ('Plateformes livraison'),
  ('Main-d''œuvre'),
  ('Autres');

-- 3. Add nullable FK column.
ALTER TABLE "accounting_expenses"
  ADD COLUMN "accountingCategoryId" UUID;

ALTER TABLE "accounting_expenses"
  ADD CONSTRAINT "accounting_expenses_accountingCategoryId_fkey"
  FOREIGN KEY ("accountingCategoryId") REFERENCES "accounting_categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "accounting_expenses_accountingCategoryId_idx"
  ON "accounting_expenses"("accountingCategoryId");

-- 4. Backfill: map every legacy enum value to its seeded category name.
UPDATE "accounting_expenses" e
SET "accountingCategoryId" = c.id
FROM "accounting_categories" c
WHERE
  (e."category" = 'ELECTRICITE'           AND c.name = 'Électricité')
  OR (e."category" = 'LOYER'              AND c.name = 'Loyer')
  OR (e."category" = 'INTERNET_TELEPHONE' AND c.name = 'Internet / Téléphone')
  OR (e."category" = 'ACHATS_FOURNISSEURS' AND c.name = 'Achats fournisseurs')
  OR (e."category" = 'EMBALLAGES'         AND c.name = 'Emballages')
  OR (e."category" = 'NETTOYAGE'          AND c.name = 'Nettoyage')
  OR (e."category" = 'MAINTENANCE'        AND c.name = 'Maintenance')
  OR (e."category" = 'MARKETING'          AND c.name = 'Marketing')
  OR (e."category" = 'FRAIS_BANCAIRES'    AND c.name = 'Frais bancaires')
  OR (e."category" = 'PLATEFORMES_LIVRAISON' AND c.name = 'Plateformes livraison')
  OR (e."category" = 'MAIN_DOEUVRE'       AND c.name = 'Main-d''œuvre')
  OR (e."category" = 'AUTRES'             AND c.name = 'Autres');

-- 5. Include-in-financial-reports flag.
ALTER TABLE "accounting_expenses"
  ADD COLUMN "includeInFinancialReports" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX "accounting_expenses_includeInFinancialReports_idx"
  ON "accounting_expenses"("includeInFinancialReports");

-- Existing REPAIR-sourced rows: keep them in the report by default. They
-- were already counted via the previous "all categories except A/M" rule,
-- so flipping them ON preserves the historical behaviour.
UPDATE "accounting_expenses"
SET "includeInFinancialReports" = TRUE
WHERE "sourceType" = 'REPAIR';
