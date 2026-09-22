-- =====================================================================
-- V2 : Ventilation du Real Cost en Food / Paper / Cleaning
--
-- Règle métier (confirmée client) :
--   realCost = foodCost + paperCost + cleaningCost
--
-- Mapping enum CategoryType → bucket :
--   FOOD      → foodCost
--   PAPIERS   → paperCost
--   NETTOYAGE → cleaningCost
--   NON_FOOD  → paperCost (fallback temporaire — sera reclassifié par
--               l'admin via l'UI Catégories)
--
-- Stratégie de backfill (rapports historiques) :
--   - foodCost = realCost (préserve la chronologie financière)
--   - paperCost = 0
--   - cleaningCost = 0
--   Les périodes déjà clôturées NE sont PAS recalculées : ce serait
--   réécrire l'histoire. La séparation kicks in à la prochaine
--   clôture / réconciliation seulement.
-- =====================================================================

-- 1. InventoryReport — colonnes de ventilation.
ALTER TABLE "inventory_reports"
  ADD COLUMN "foodCost"     DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "paperCost"    DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "cleaningCost" DECIMAL(14, 2) NOT NULL DEFAULT 0;

-- Backfill : on copie le realCost historique dans foodCost. C'est
-- techniquement faux pour les ~10-12 % NON_FOOD, mais c'est volontaire :
-- garder un foodCost stable pour les rapports déjà émis prime sur la
-- précision rétroactive.
UPDATE "inventory_reports" SET "foodCost" = "realCost";

-- 2. FinancialReport — colonnes snapshot pour Paper / Cleaning.
-- snapshotFoodCost existe déjà ; on garde sa sémantique : à partir de
-- maintenant elle ne couvre QUE la part Food (les rapports LOCKED
-- antérieurs gardent l'ancienne sémantique = realCost total, gérée par
-- une compat layer côté serializer).
ALTER TABLE "financial_reports"
  ADD COLUMN "snapshotPaperCost"    DECIMAL(14, 2),
  ADD COLUMN "snapshotCleaningCost" DECIMAL(14, 2);
