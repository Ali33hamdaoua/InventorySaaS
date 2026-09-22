-- =====================================================================
-- Packaging / Unit conversion — colonnes optionnelles sur
-- inventory_products.
--
-- Règle métier :
--   * `packagingName` = libellé UI (Carton / Box / Pack / Sac / Palette…)
--   * `packagingFactor` = combien d'unités de base contient 1 packaging
--   * Les deux vont ensemble (validation service). NULL = produit unitaire,
--     pas de conditionnement (comportement historique inchangé).
--
-- Invariant DB :
--   Toutes les colonnes `quantity` / `*Quantity` / `unitPrice` /
--   `defaultCost` restent exprimées en UNITÉ DE BASE. Aucune conversion
--   n'est faite à l'écriture ni à la lecture — la conversion est
--   strictement une couche UI (voir packages/shared/src/lib/packaging.ts).
--
-- Rétrocompat :
--   * Colonnes nullable → aucun impact sur les rows existantes
--   * `ADD COLUMN` avec DEFAULT NULL est instantané (metadata-only) sur
--     PostgreSQL 11+ → migration non-bloquante
--   * Aucun backfill nécessaire
-- =====================================================================

ALTER TABLE "inventory_products"
  ADD COLUMN "packagingName"   VARCHAR(40),
  ADD COLUMN "packagingFactor" DECIMAL(14, 4);

-- Garde-fou DB : un facteur non-null DOIT être strictement positif.
-- Un facteur ≤ 0 casserait toutes les conversions et pourrait diviser
-- par 0 dans le calcul du prix par unité. Cette contrainte protège même
-- si un service oublie de valider côté DTO.
ALTER TABLE "inventory_products"
  ADD CONSTRAINT "inventory_products_packaging_factor_positive"
  CHECK ("packagingFactor" IS NULL OR "packagingFactor" > 0);
