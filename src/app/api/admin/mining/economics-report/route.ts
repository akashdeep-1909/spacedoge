import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { BalanceType } from "@/generated/prisma/enums";
import { TREASURY_ADDRESS } from "@/lib/treasury";
import { getMiningEconomicsConfig, getMiningProtectionReserveBalanceUsdt } from "@/lib/mining-settings";

// GET /api/admin/mining/economics-report?days=30 — doc section 13's
// platform-side revenue breakdown. Purely derived from existing ledger
// and contract data, read-only — this reports on money that already
// moved via settleEpochForDate/purchase-power, it never posts anything
// itself.
//
// "Maintenance reserve" and "hardware-recovery and expansion reserve"
// are collapsed into one residual bucket here (hardwareRecoveryReserveUsdt)
// — the doc states these as a given worked-example split without a
// formula for dividing between them, and since this report is
// informational only (it doesn't move real ledger money), inventing an
// arbitrary split ratio wasn't worth the false precision.
export async function GET(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const daysParam = request.nextUrl.searchParams.get("days");
  const days = daysParam ? Math.max(1, Number(daysParam)) : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const treasury = await db.walletProfile.findUnique({ where: { address: TREASURY_ADDRESS } });
  const treasuryId = treasury?.id;

  const [packageSales, positiveDeductions, contractAllocs, config, reserveBalanceUsdt] = await Promise.all([
    db.miningContract.aggregate({ where: { createdAt: { gte: since } }, _sum: { pricePaidUsdt: true } }),
    treasuryId
      ? db.ledgerEntry.aggregate({
          where: { walletProfileId: treasuryId, balanceType: BalanceType.MINING_PROTECTION_RESERVE_USDT, reason: "mining_reserve_variance_surplus", createdAt: { gte: since } },
          _sum: { amount: true },
        })
      : Promise.resolve({ _sum: { amount: null } }),
    db.miningContractAllocation.aggregate({ where: { createdAt: { gte: since } }, _sum: { electricityShareUsdt: true } }),
    getMiningEconomicsConfig(),
    getMiningProtectionReserveBalanceUsdt(),
  ]);

  const packageSalesRevenueUsdt = Number(packageSales._sum.pricePaidUsdt ?? 0);
  const serviceVarianceSurplusUsdt = Number(positiveDeductions._sum.amount ?? 0);
  const totalMiningRevenueUsdt = packageSalesRevenueUsdt + serviceVarianceSurplusUsdt;

  // Hosting/cooling cost at the platform-internal rate — re-derived from
  // the already-computed user-facing electricityShareUsdt total by
  // scaling with the ratio of the two configured rates, since both
  // scale identically with the same avgActiveMhs/fleetCapacityMhs*hours
  // term (see settleEpochForDate).
  const totalElectricityShareUsdt = Number(contractAllocs._sum.electricityShareUsdt ?? 0);
  const userRate = Number(config.electricityRateUsdtPerKwh);
  const hostingRate = Number(config.hostingElectricityRateUsdtPerKwh);
  const hostingCoolingCostUsdt = userRate > 0 ? totalElectricityShareUsdt * (hostingRate / userRate) : 0;

  const platformProfitAllocationUsdt = totalMiningRevenueUsdt * Number(config.platformProfitAllocationPct);
  const hardwareRecoveryReserveUsdt = Math.max(0, totalMiningRevenueUsdt - hostingCoolingCostUsdt - platformProfitAllocationUsdt);

  return NextResponse.json({
    days,
    packageSalesRevenueUsdt,
    serviceVarianceSurplusUsdt,
    totalMiningRevenueUsdt,
    hostingCoolingCostUsdt,
    platformProfitAllocationUsdt,
    hardwareRecoveryReserveUsdt,
    reserveBalanceUsdt,
  });
}
