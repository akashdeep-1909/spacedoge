-- fleetCapacityMhs was raised 16,000 -> 800,000 MH/s (2026-08-06, live
-- admin edit) as real sold hashrate grew, without proportionally
-- scaling referenceMonthlyGrossUsdt or minerPowerKw — both of which are
-- "total for the full reference fleet" figures multiplied by
-- (avgActiveMhs/fleetCapacityMhs) in the settlement math (src/lib/mining.ts).
-- Leaving them at their original "one 16,000 MH/s L9" values silently
-- cut modeled organic mining output to 1/50th of its real rate, while
-- MiningContract's guaranteed-target formula (pricePaidUsdt *
-- (1+targetRoiPct) / termDays) is fleet-size-independent and was
-- unaffected — leaving the Protection Reserve absorbing nearly the
-- entire guaranteed payout for every active contract every day.
--
-- This restores the original real-world $/MH/s and kW/MH/s rates by
-- scaling both proportionally to the same 800,000/16,000 = 50x factor
-- fleetCapacityMhs already grew by, and does the same for
-- profitabilityThresholdUsdt (a paired floor under referenceMonthlyGrossUsdt).
-- fleetCapacityMhs's own default is included for completeness even
-- though the live row is already 800,000 — only the column DEFAULT
-- (for any future fresh row) was still 16,000.

ALTER TABLE "MiningEconomicsConfig" ALTER COLUMN "fleetCapacityMhs" SET DEFAULT 800000;
ALTER TABLE "MiningEconomicsConfig" ALTER COLUMN "referenceMonthlyGrossUsdt" SET DEFAULT 11421.50;
ALTER TABLE "MiningEconomicsConfig" ALTER COLUMN "minerPowerKw" SET DEFAULT 168;
ALTER TABLE "MiningEconomicsConfig" ALTER COLUMN "profitabilityThresholdUsdt" SET DEFAULT 10923.50;

UPDATE "MiningEconomicsConfig"
SET "referenceMonthlyGrossUsdt" = 11421.50,
    "minerPowerKw" = 168,
    "profitabilityThresholdUsdt" = 10923.50,
    "updatedByAddress" = 'migration:20260810000000_fix_mining_economics_fleet_scale'
WHERE id = 'singleton';
