-- =====================================================================
-- Hide the legacy "Autres" accounting category from the dropdown / filter
-- pickers per client request — the bucket was too generic and grouped
-- unrelated expenses together. The row stays in the DB so any historical
-- expense still references a valid FK and still displays "Autres" in the
-- accounting table.
--
-- The application reads `isActive = true` on every category query
-- (`accountingCategoriesService.findAll`), so flipping the flag here
-- removes the entry from every dropdown in one shot.
-- =====================================================================

UPDATE "accounting_categories"
SET "isActive" = FALSE,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE LOWER("name") = 'autres';
