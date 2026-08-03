import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { getMiningEconomicsConfig, updateMiningEconomicsConfig } from "@/lib/mining-settings";

// GET /api/admin/mining/economics — every MiningEconomicsConfig field,
// as plain numbers (Decimal isn't serializable across the route
// boundary the way the client fetches it).
export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const config = await getMiningEconomicsConfig();
  return NextResponse.json({
    fleetCapacityMhs: Number(config.fleetCapacityMhs),
    referenceMonthlyGrossUsdt: Number(config.referenceMonthlyGrossUsdt),
    minerPowerKw: Number(config.minerPowerKw),
    electricityRateUsdtPerKwh: Number(config.electricityRateUsdtPerKwh),
    hostingElectricityRateUsdtPerKwh: Number(config.hostingElectricityRateUsdtPerKwh),
    poolFeePct: Number(config.poolFeePct),
    targetRoiPct: Number(config.targetRoiPct),
    dailyVarianceBandPct: Number(config.dailyVarianceBandPct),
    platformProfitAllocationPct: Number(config.platformProfitAllocationPct),
    profitabilityThresholdUsdt: Number(config.profitabilityThresholdUsdt),
    reserveLowBalanceThresholdUsdt: config.reserveLowBalanceThresholdUsdt !== null ? Number(config.reserveLowBalanceThresholdUsdt) : null,
    newContractsPaused: config.newContractsPaused,
    updatedAt: config.updatedAt,
    updatedByAddress: config.updatedByAddress,
  });
}

// Every numeric field is optional (partial update) — omitted fields are
// left untouched, same convention as PATCH /api/admin/settings.
// reserveLowBalanceThresholdUsdt is additionally nullable (null clears
// the warning threshold back to "no warning shown").
const bodySchema = z.object({
  fleetCapacityMhs: z.number().positive().optional(),
  referenceMonthlyGrossUsdt: z.number().positive().optional(),
  minerPowerKw: z.number().positive().optional(),
  electricityRateUsdtPerKwh: z.number().nonnegative().optional(),
  hostingElectricityRateUsdtPerKwh: z.number().nonnegative().optional(),
  poolFeePct: z.number().min(0).max(1).optional(),
  targetRoiPct: z.number().min(0).max(1).optional(),
  dailyVarianceBandPct: z.number().min(0).max(1).optional(),
  platformProfitAllocationPct: z.number().min(0).max(1).optional(),
  profitabilityThresholdUsdt: z.number().positive().optional(),
  reserveLowBalanceThresholdUsdt: z.number().nonnegative().nullable().optional(),
  newContractsPaused: z.boolean().optional(),
});

export async function PATCH(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const updated = await updateMiningEconomicsConfig(parsed.data, session.address.toLowerCase());
  return NextResponse.json({ ok: true, updatedAt: updated.updatedAt });
}
