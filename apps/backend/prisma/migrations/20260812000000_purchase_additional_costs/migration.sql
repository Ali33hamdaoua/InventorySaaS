-- =====================================================================
-- Feature « Frais supplémentaires / Frais d'approvisionnement » (V1).
--
-- 1. Ajoute un nouveau membre à l'enum AccountingSourceType :
--    PURCHASE_ADDITIONAL_COST.
--    Non exclu par le filtre du rapport financier (`sourceType != PURCHASE`)
--    → sera automatiquement inclus dans le rapport en HT via la mécanique
--    LOT 2 (aucun code métier à écrire pour ça).
--
-- 2. Crée la table `purchase_additional_costs` : 1-to-N depuis Purchase.
--    Cascade FK sur suppression de la Purchase parente.
--
-- 3. Ajoute la FK `purchaseAdditionalCostId` (unique, nullable) à
--    `accounting_expenses` pour relier chaque mirror comptable à son
--    frais d'origine (comme on le fait déjà pour purchaseId / laborId /
--    repairId).
--
-- Aucun `PurchaseItem.unitPrice` / `Product.defaultCost` / WAC / Food Cost
-- n'est touché. Aucun schéma d'inventaire modifié.
-- =====================================================================

-- 1. Nouveau membre d'enum -----------------------------------------------
ALTER TYPE "AccountingSourceType"
  ADD VALUE IF NOT EXISTS 'PURCHASE_ADDITIONAL_COST';

-- 2. Table des frais supplémentaires -------------------------------------
CREATE TABLE "purchase_additional_costs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purchaseId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "costType" VARCHAR(40) NOT NULL,
    "description" VARCHAR(500),
    "accountingCategoryId" UUID NOT NULL,
    "amountBeforeTax" DECIMAL(14, 2) NOT NULL DEFAULT 0,
    "tpsAmount" DECIMAL(14, 2) NOT NULL DEFAULT 0,
    "tvqAmount" DECIMAL(14, 2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14, 2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "purchase_additional_costs_pkey" PRIMARY KEY ("id")
);

-- Indexes de recherche (respect du pattern des autres tables).
CREATE INDEX "purchase_additional_costs_purchaseId_idx"
  ON "purchase_additional_costs" ("purchaseId");
CREATE INDEX "purchase_additional_costs_branchId_idx"
  ON "purchase_additional_costs" ("branchId");
CREATE INDEX "purchase_additional_costs_accountingCategoryId_idx"
  ON "purchase_additional_costs" ("accountingCategoryId");

-- FKs.
ALTER TABLE "purchase_additional_costs"
  ADD CONSTRAINT "purchase_additional_costs_purchaseId_fkey"
  FOREIGN KEY ("purchaseId")
  REFERENCES "purchases" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "purchase_additional_costs"
  ADD CONSTRAINT "purchase_additional_costs_branchId_fkey"
  FOREIGN KEY ("branchId")
  REFERENCES "branches" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_additional_costs"
  ADD CONSTRAINT "purchase_additional_costs_accountingCategoryId_fkey"
  FOREIGN KEY ("accountingCategoryId")
  REFERENCES "accounting_categories" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Lien depuis AccountingExpense --------------------------------------
ALTER TABLE "accounting_expenses"
  ADD COLUMN "purchaseAdditionalCostId" UUID;

CREATE UNIQUE INDEX "accounting_expenses_purchaseAdditionalCostId_key"
  ON "accounting_expenses" ("purchaseAdditionalCostId");

ALTER TABLE "accounting_expenses"
  ADD CONSTRAINT "accounting_expenses_purchaseAdditionalCostId_fkey"
  FOREIGN KEY ("purchaseAdditionalCostId")
  REFERENCES "purchase_additional_costs" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
