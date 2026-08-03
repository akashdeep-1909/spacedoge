-- Simplify DepositTreasuryAddress to two states only (unassigned/
-- assigned) — the separate enabled/disabled flag added no real
-- capability the admin needed on top of add/delete.
ALTER TABLE "DepositTreasuryAddress" DROP COLUMN "enabled";
