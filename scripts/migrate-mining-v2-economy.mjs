// One-time data migration: converts every currently-ACTIVE MiningContract
// (active=true AND expiresAt > now — already-expired/completed contracts
// are deliberately left alone, not resurrected) onto the mining v2
// economy model's terms:
//   - miningPower recomputed at the new 25 MH/s-per-USDT rate (was 22.5)
//     — an upgrade, since the same USDT already paid now buys more hashrate
//   - termDays -> 180 (was 30), expiresAt recomputed from the contract's
//     ORIGINAL startsAt (not from today) — extends the existing contract
//     to the new term length rather than granting a windfall fresh 180
//     days from migration day
//   - targetRoiPct -> 0.10 (new field, the guaranteed-ROI target)
//   - level recomputed against the new package-size thresholds
//
// Historical MiningEpoch/MiningAllocation rows (already-settled days)
// are left untouched — only today-forward settlement uses the new
// mining v2 logic. cumulativeCreditedUsdtEquiv is left at its schema
// default (0): pre-migration DOGE credits under the old formula aren't
// retroactively folded into the new target-tracking, since there's no
// stored historical DOGE/USDT rate to value them in USDT (at most 30
// days of history per migrated contract, so the Day-180 comparator very
// slightly undercounts early contributions — acceptable, per the
// explicit "leave historical rows untouched" instruction this migration
// follows).
//
// Run with: node scripts/migrate-mining-v2-economy.mjs [--dry-run]
import { execSync } from "node:child_process";

const DB = process.env.DATABASE_URL?.replace(/\?.*$/, "") ?? "postgresql://postgres@localhost:5432/dogeforge";
const DRY_RUN = process.argv.includes("--dry-run");

function psql(sql) {
  return execSync(`psql "${DB}" -t -A -F"|" -c "${sql.replace(/"/g, '\\"')}"`, { encoding: "utf8" }).trim();
}

function psqlExec(sql) {
  execSync(`psql "${DB}" -c "${sql.replace(/"/g, '\\"')}"`, { encoding: "utf8", stdio: "inherit" });
}

console.log(`Mining v2 economy migration — ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
console.log(`Database: ${DB}\n`);

// 1. Seed the MiningEconomicsConfig singleton with doc defaults, if it
// doesn't exist yet — every column besides id/updatedAt already has a
// matching DB-level DEFAULT from the Prisma migration, so this only
// needs to supply the two that don't (id, updatedAt).
if (!DRY_RUN) {
  psqlExec(`INSERT INTO "MiningEconomicsConfig" (id, "updatedAt") VALUES ('singleton', (NOW() AT TIME ZONE 'UTC')) ON CONFLICT (id) DO NOTHING;`);
  console.log("✓ MiningEconomicsConfig singleton ensured.\n");
} else {
  console.log("(dry run) Would ensure MiningEconomicsConfig singleton exists.\n");
}

// 2. Preview: every contract this migration will touch, old vs. new values.
const preview = psql(`
  SELECT
    id,
    "miningPower" AS old_mining_power,
    ROUND("pricePaidUsdt" * 25, 4) AS new_mining_power,
    level AS old_level,
    CASE
      WHEN "pricePaidUsdt" * 25 >= 5000 THEN 'ORBITAL'
      WHEN "pricePaidUsdt" * 25 >= 2500 THEN 'DEEP_CORE'
      WHEN "pricePaidUsdt" * 25 >= 1250 THEN 'LUNAR'
      WHEN "pricePaidUsdt" * 25 >= 625 THEN 'ROVER'
      WHEN "pricePaidUsdt" * 25 >= 250 THEN 'SCOUT'
      ELSE 'SPARK'
    END AS new_level,
    "termDays" AS old_term_days,
    "expiresAt" AS old_expires_at,
    ("startsAt" + INTERVAL '180 days') AS new_expires_at
  FROM "MiningContract"
  WHERE active = true AND "expiresAt" > (NOW() AT TIME ZONE 'UTC')
  ORDER BY "createdAt" DESC;
`);

const rows = preview ? preview.split("\n").filter(Boolean) : [];
console.log(`Contracts to migrate: ${rows.length}`);
for (const row of rows.slice(0, 20)) {
  const [id, oldMp, newMp, oldLevel, newLevel, oldTerm, oldExp, newExp] = row.split("|");
  console.log(
    `  ${id}  ${oldMp} MH/s -> ${newMp} MH/s  |  ${oldLevel} -> ${newLevel}  |  ${oldTerm}d -> 180d  |  expires ${oldExp} -> ${newExp}`
  );
}
if (rows.length > 20) console.log(`  ... and ${rows.length - 20} more`);

if (rows.length === 0) {
  console.log("\nNothing to migrate. Done.");
  process.exit(0);
}

if (DRY_RUN) {
  console.log("\n(dry run) No rows were changed. Re-run without --dry-run to apply.");
  process.exit(0);
}

// 3. Apply — recompute miningPower/level/termDays/expiresAt/targetRoiPct
// for every currently-active, not-yet-expired contract in one statement.
psqlExec(`
  UPDATE "MiningContract"
  SET
    "miningPower" = ROUND("pricePaidUsdt" * 25, 4),
    "termDays" = 180,
    "expiresAt" = "startsAt" + INTERVAL '180 days',
    "targetRoiPct" = 0.10,
    "level" = (CASE
      WHEN "pricePaidUsdt" * 25 >= 5000 THEN 'ORBITAL'
      WHEN "pricePaidUsdt" * 25 >= 2500 THEN 'DEEP_CORE'
      WHEN "pricePaidUsdt" * 25 >= 1250 THEN 'LUNAR'
      WHEN "pricePaidUsdt" * 25 >= 625 THEN 'ROVER'
      WHEN "pricePaidUsdt" * 25 >= 250 THEN 'SCOUT'
      ELSE 'SPARK'
    END)::"MiningLevel"
  WHERE active = true AND "expiresAt" > (NOW() AT TIME ZONE 'UTC');
`);

console.log(`\n✓ Migrated ${rows.length} contract(s) to the mining v2 economy model.`);
console.log("Historical MiningEpoch/MiningAllocation rows were left untouched.");
