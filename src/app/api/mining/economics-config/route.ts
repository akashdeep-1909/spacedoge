import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getMiningEconomicsConfig } from "@/lib/mining-settings";

// GET /api/mining/economics-config — the doc's own disclosed reference-
// fleet numbers (fleet capacity, reference gross income, power draw,
// electricity rate, pool fee %, target ROI %). Session-gated like every
// other /api/mining/* route, not admin-only — these are numbers the
// dashboard shows to every user (Output Chart projections, tooltips),
// not an internal admin control surface.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const config = await getMiningEconomicsConfig();
  return NextResponse.json({
    fleetCapacityMhs: Number(config.fleetCapacityMhs),
    referenceMonthlyGrossUsdt: Number(config.referenceMonthlyGrossUsdt),
    minerPowerKw: Number(config.minerPowerKw),
    electricityRateUsdtPerKwh: Number(config.electricityRateUsdtPerKwh),
    poolFeePct: Number(config.poolFeePct),
    targetRoiPct: Number(config.targetRoiPct),
  });
}
