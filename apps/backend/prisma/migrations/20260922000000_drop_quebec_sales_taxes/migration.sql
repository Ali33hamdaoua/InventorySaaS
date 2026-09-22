-- Drop the Quebec sales tax columns (TPS 5% / TVQ 9.975%).
--
-- The product moved from Quebec to Morocco, where these taxes do not apply.
-- Rather than re-parameterising the rates, tax handling was removed entirely:
-- every amount is now a single figure and `totalAmount` mirrors the pre-tax
-- column it was derived from.
--
-- Any existing tax amounts are folded back into the total first, so a row's
-- `totalAmount` stays consistent with the column that remains.

UPDATE "purchases" SET "totalAmount" = "subtotalHT";
ALTER TABLE "purchases" DROP COLUMN "tpsAmount", DROP COLUMN "tvqAmount";

UPDATE "purchase_additional_costs" SET "totalAmount" = "amountBeforeTax";
ALTER TABLE "purchase_additional_costs" DROP COLUMN "tpsAmount", DROP COLUMN "tvqAmount";

UPDATE "accounting_expenses" SET "totalAmount" = "amountBeforeTax";
ALTER TABLE "accounting_expenses" DROP COLUMN "tpsAmount", DROP COLUMN "tvqAmount";

UPDATE "repair_entries" SET "totalAmount" = "amountBeforeTax";
ALTER TABLE "repair_entries" DROP COLUMN "tpsAmount", DROP COLUMN "tvqAmount";
