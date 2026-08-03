-- v2 economy spec Part F: rename STARTER rig to SPARK (same tier,
-- new name), and widen miningPower from Int "MP" to Decimal MH/s
-- (the 22.5 MH/s-per-USDT rate produces fractional values, e.g.
-- 5 USDT = 112.5 MH/s).
ALTER TYPE "MiningLevel" RENAME VALUE 'STARTER' TO 'SPARK';
ALTER TABLE "MiningContract" ALTER COLUMN "miningPower" TYPE DECIMAL(18,4);
