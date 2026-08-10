// Pure constants/functions with no server-only imports (no `db`), so
// client components can import display labels and formulas without
// pulling the Prisma/pg driver into the browser bundle. src/lib/
// mining.ts (server-only) imports and re-exports these for API routes.
import { MiningLevel } from "@/generated/prisma/enums";

// Mining v2 economy model — locked launch configuration.
export const ACTIVATION_PRICE_USDT = 1; // dashboard access only, grants zero hashrate

// Balances fundable for both the activation fee and hashrate purchases —
// no wallet-source restriction on either, matching doc 6.2's funding table
// (Game Reward USDT, Referral USDT, Deposited/Play USDT, Recycled USDT).
export const MINING_FUNDING_SOURCES = ["GAME_REWARD_USDT", "REFERRAL_USDT", "PLAY_USDT", "RECYCLED_USDT"] as const;
export const HASHRATE_PER_USDT = 25; // MH/s per USDT, fixed (was 22.5 pre-v2)
export const MIN_HASHRATE_PURCHASE_USDT = 5;
// Kept as HASHRATE_TERM_DAYS (not renamed) to minimize call-site churn —
// now 180 days (was 30). See MiningEconomicsConfig for the admin-editable
// live value; this is only the fallback/display default.
export const HASHRATE_TERM_DAYS = 180;

// Fallback/display default only — the real, admin-editable value is
// MiningEconomicsConfig.fleetCapacityMhs (src/lib/mining-settings.ts).
// Mining v2 sells the FULL reference fleet, no 10%-held-back reserve at
// the capacity-cap level anymore (that's what the old
// SELLABLE_CAPACITY_MHS=14,400 constant modeled) — grow this as more
// fleet capacity is notionally added, no redeploy needed. Kept in sync
// with the DB column's own @default in schema.prisma (see that field's
// doc-comment for why MiningEconomicsConfig.referenceMonthlyGrossUsdt
// and .minerPowerKw must scale proportionally whenever this does).
export const DEFAULT_FLEET_CAPACITY_MHS = 800_000;

// One physical ASIC rig's hashrate (Bitmain Antminer L9 class, Scrypt) —
// 16 GH/s. The admin-configurable fleet size (MiningEconomicsConfig.
// fleetCapacityMhs) is stored in MH/s (existing settlement math in
// src/lib/mining.ts keys off that raw figure and doesn't change), but
// every admin control and public-facing number expresses it as a whole
// rig count using this constant, per the product's own "1 ASIC Rig =
// 16 GH/s" framing.
export const MHS_PER_RIG = 16_000;

// Display names for MiningLevel — the doc's own package names. The enum
// keys (SPARK, DEEP_CORE, ...) stay as-is (renaming an enum value needs
// a migration and touches historical MiningContract rows); only the
// copy shown to users changes here.
export const RIG_DISPLAY_NAME: Record<MiningLevel, string> = {
  SPARK: "Launch",
  SCOUT: "Orbit",
  ROVER: "Lunar",
  LUNAR: "Mars",
  DEEP_CORE: "Galaxy",
  ORBITAL: "Nova",
};

// Thresholds match the new (mining v2) MINING_PACKAGES sizes below —
// were 4500/2250/1125/562.5/225 pre-v2.
export function levelForHashrate(mhs: number): MiningLevel {
  if (mhs >= 5_000) return MiningLevel.ORBITAL;
  if (mhs >= 2_500) return MiningLevel.DEEP_CORE;
  if (mhs >= 1_250) return MiningLevel.LUNAR;
  if (mhs >= 625) return MiningLevel.ROVER;
  if (mhs >= 250) return MiningLevel.SCOUT;
  return MiningLevel.SPARK;
}

// The six reference package sizes, in doc order — same names/prices as
// pre-v2, hashrate values scaled to the new 25 MH/s-per-USDT rate (was
// 22.5). priceUsdt is now explicit (previously only implied by
// mhs/HASHRATE_PER_USDT) since the dashboard's Output Chart needs it
// directly for the target-ROI projection.
export const MINING_PACKAGES: { level: MiningLevel; name: string; mhs: number; priceUsdt: number; hashrateLabel: string }[] = [
  { level: MiningLevel.SPARK, name: "Launch", mhs: 125, priceUsdt: 5, hashrateLabel: "125 MH/s" },
  { level: MiningLevel.SCOUT, name: "Orbit", mhs: 250, priceUsdt: 10, hashrateLabel: "250 MH/s" },
  { level: MiningLevel.ROVER, name: "Lunar", mhs: 625, priceUsdt: 25, hashrateLabel: "625 MH/s" },
  { level: MiningLevel.LUNAR, name: "Mars", mhs: 1_250, priceUsdt: 50, hashrateLabel: "1.25 GH/s" },
  { level: MiningLevel.DEEP_CORE, name: "Galaxy", mhs: 2_500, priceUsdt: 100, hashrateLabel: "2.50 GH/s" },
  { level: MiningLevel.ORBITAL, name: "Nova", mhs: 5_000, priceUsdt: 200, hashrateLabel: "5.00 GH/s" },
];

// A wallet's own total MH/s (stacked across every active contract, see
// levelForHashrate's own doc-comment) is only EVER >= the matched
// tier's reference threshold, never exactly equal in the common case —
// most obviously for ORBITAL/"Nova", the top tier with no next tier to
// graduate into: a wallet with 50,000 MH/s looks visually identical to
// one with exactly 5,000 MH/s, both just labeled "Nova", losing real
// information about how far past that tier's own reference size they
// actually are. Appending "+" whenever the wallet's real MH/s exceeds
// the matched tier's own reference mhs (not just for the top tier —
// the same gap exists at every tier whenever purchases don't land on
// an exact threshold) surfaces that without inventing a new tier name.
// Takes a plain `level: string`, not the branded MiningLevel enum — every
// call site receives this from an already-JSON-serialized API response
// (client components never see the real enum type, same reason every
// existing RIG_DISPLAY_NAME[level] lookup this replaces already cast to
// `keyof typeof RIG_DISPLAY_NAME`). Falls back to the raw level string if
// it's ever an unrecognized value, matching those call sites' own
// pre-existing `?? level` fallback.
export function levelDisplayNameWithPlus(level: string, mhs: number): string {
  const baseName = RIG_DISPLAY_NAME[level as MiningLevel] ?? level;
  const referenceMhs = MINING_PACKAGES.find((p) => p.level === level)?.mhs;
  return referenceMhs !== undefined && mhs > referenceMhs ? `${baseName}+` : baseName;
}

// LEGACY — the pre-v2 DOGE-native example rate (assumed a 50-ASIC fleet
// producing 5,250 net DOGE/day against 720,000 MH/s sellable capacity).
// The live model is USDT-native (see MiningEconomicsConfig in
// src/lib/mining-settings.ts: referenceMonthlyGrossUsdt, electricity
// rate, pool fee %, target ROI %) — this constant is referenced only by
// epochs settled before ECONOMICS_V2_CUTOFF_DATE, for historical rate-
// history chart continuity.
export const EXAMPLE_NET_DOGE_PER_MHS_DAY = 5_250 / 720_000;

// The day the +/-10%-around-the-example-rate DOGE-native formula went
// live. Any epoch settled before this used an older, unrelated formula
// (a shared-pool model where payout depended on how much hashrate every
// other wallet had active) — those numbers aren't comparable to the
// formula that follows it, so the "Actual vs Example Rate" chart only
// ever charts epochs from this date forward, up to ECONOMICS_V2_CUTOFF_DATE.
export const RATE_FORMULA_CUTOFF_DATE = new Date(Date.UTC(2026, 6, 23));

// The day the mining v2 economy model (USDT-native fleet economics, 25
// MH/s/USDT, 180-day contracts, target-ROI + Protection Reserve) went
// live, replacing the DOGE-native +/-10%-of-example-rate formula above.
// Epochs settled before this used that DOGE-native formula and aren't
// comparable to the new USDT-native fleet-economics rate.
export const ECONOMICS_V2_CUTOFF_DATE = new Date(Date.UTC(2026, 6, 29));
