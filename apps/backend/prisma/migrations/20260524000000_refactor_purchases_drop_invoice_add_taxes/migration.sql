-- =====================================================================
-- Purchases refactor (2026-05-24)
--   - Drop `invoiceNumber` (no more external reference field)
--   - Drop `cancelledAt` + its index (no more validated/cancelled status)
--   - Add `subtotalHT`, `tpsAmount`, `tvqAmount` (Quebec tax breakdown)
--   - `totalAmount` keeps its meaning but now = subtotalHT + tpsAmount + tvqAmount
-- =====================================================================
-- Safe because the client wiped all transactional data in the previous
-- priority — there are zero purchase rows to migrate.
-- =====================================================================

ALTER TABLE "purchases" DROP COLUMN "invoiceNumber";

DROP INDEX IF EXISTS "purchases_cancelledAt_idx";
ALTER TABLE "purchases" DROP COLUMN "cancelledAt";

ALTER TABLE "purchases"
    ADD COLUMN "subtotalHT" DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN "tpsAmount"  DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN "tvqAmount"  DECIMAL(14, 2) NOT NULL DEFAULT 0;
