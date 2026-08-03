import { db } from "@/lib/db";
import type { Prisma, MiningEconomicsConfig } from "@/generated/prisma/client";
import { TREASURY_ADDRESS } from "@/lib/treasury";
import { DEFAULT_FLEET_CAPACITY_MHS } from "@/lib/mining-shared";

const CONFIG_ID = "singleton";

// Lazily creates the one-row config table on first read — same
// find-then-create-with-race-guard pattern as getPlatformSettings
// (src/lib/settings.ts). Unlike PlatformSettings' all-nullable-columns
// convention, every field here has a real DB-level @default (the doc's
// own reference numbers), so a fresh row is immediately usable with no
// "DB override else hardcoded const" branching needed at the read site.
export async function getMiningEconomicsConfig(): Promise<MiningEconomicsConfig> {
  const existing = await db.miningEconomicsConfig.findUnique({ where: { id: CONFIG_ID } });
  if (existing) return existing;
  try {
    return await db.miningEconomicsConfig.create({ data: { id: CONFIG_ID } });
  } catch {
    return db.miningEconomicsConfig.findUniqueOrThrow({ where: { id: CONFIG_ID } });
  }
}

export async function updateMiningEconomicsConfig(
  data: Partial<{
    fleetCapacityMhs: number;
    referenceMonthlyGrossUsdt: number;
    minerPowerKw: number;
    electricityRateUsdtPerKwh: number;
    hostingElectricityRateUsdtPerKwh: number;
    poolFeePct: number;
    targetRoiPct: number;
    dailyVarianceBandPct: number;
    platformProfitAllocationPct: number;
    profitabilityThresholdUsdt: number;
    reserveLowBalanceThresholdUsdt: number | null;
    newContractsPaused: boolean;
  }>,
  updatedByAddress: string
): Promise<MiningEconomicsConfig> {
  await getMiningEconomicsConfig(); // ensure the row exists before updating
  return db.miningEconomicsConfig.update({
    where: { id: CONFIG_ID },
    data: { ...data, updatedByAddress },
  });
}

// src/lib/mining.ts's settlement math still needs a plain number even
// once fleetCapacityMhs is DB-backed — this is the direct replacement
// for the old static SELLABLE_CAPACITY_MHS re-export.
export async function getFleetCapacityMhs(): Promise<number> {
  const config = await getMiningEconomicsConfig();
  return Number(config.fleetCapacityMhs) || DEFAULT_FLEET_CAPACITY_MHS;
}

// Accepts either the plain `db` client (an ordinary read, e.g. an admin
// GET route) or a `Prisma.TransactionClient` (a read INSIDE
// settleEpochForDate's transaction, to know how much the reserve can
// actually cover before applying a draw) — same query shape either way.
// Returns 0 (never funded yet) rather than upserting the treasury
// WalletProfile on a mere balance read; only the actual credit/debit
// call sites (inside a real $transaction) create it via
// getPlatformTreasuryWalletProfileId.
export async function getMiningProtectionReserveBalanceUsdt(
  client: Prisma.TransactionClient | typeof db = db
): Promise<number> {
  const treasury = await client.walletProfile.findUnique({ where: { address: TREASURY_ADDRESS } });
  if (!treasury) return 0;
  const sum = await client.ledgerEntry.aggregate({
    where: { walletProfileId: treasury.id, balanceType: "MINING_PROTECTION_RESERVE_USDT" },
    _sum: { amount: true },
  });
  return Number(sum._sum.amount ?? 0);
}

export interface MiningHealthStatus {
  belowProfitabilityThreshold: boolean;
  reserveLow: boolean;
  reserveBalanceUsdt: number;
  referenceMonthlyGrossUsdt: number;
  profitabilityThresholdUsdt: number;
  newContractsPaused: boolean;
}

// Admin-visible alert data (doc section 11's profitability floor +
// reserve-health check) — deliberately informational only, nothing here
// automatically blocks a purchase except the manual newContractsPaused
// switch itself (checked directly by purchase-power, not derived here).
export async function getMiningHealthStatus(): Promise<MiningHealthStatus> {
  const config = await getMiningEconomicsConfig();
  const reserveBalanceUsdt = await getMiningProtectionReserveBalanceUsdt();
  const referenceMonthlyGrossUsdt = Number(config.referenceMonthlyGrossUsdt);
  const profitabilityThresholdUsdt = Number(config.profitabilityThresholdUsdt);
  const lowThreshold = config.reserveLowBalanceThresholdUsdt !== null ? Number(config.reserveLowBalanceThresholdUsdt) : null;
  return {
    belowProfitabilityThreshold: referenceMonthlyGrossUsdt < profitabilityThresholdUsdt,
    reserveLow: lowThreshold !== null && reserveBalanceUsdt < lowThreshold,
    reserveBalanceUsdt,
    referenceMonthlyGrossUsdt,
    profitabilityThresholdUsdt,
    newContractsPaused: config.newContractsPaused,
  };
}
