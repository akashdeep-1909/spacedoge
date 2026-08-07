import type { Metadata } from "next";
import { DogeMiningContent } from "@/components/DogeMiningContent";
import { getPlatformStats } from "@/lib/platformStats";
import { getMiningEconomicsConfig, getMiningProtectionReserveBalanceUsdt } from "@/lib/mining-settings";
import { fetchDogeUsdtRate } from "@/lib/conversion";

export const metadata: Metadata = {
  title: "DOGE Mining — Space DOGE",
  description: "Activate once, fund a 180-day hashrate contract and earn a guaranteed target DOGE reward every day, smoothed by the Protection Reserve.",
};

export default async function DogeMiningPage() {
  const [platformStats, economicsConfig, reserveBalanceUsdt, dogeUsdtRate] = await Promise.all([
    getPlatformStats(),
    getMiningEconomicsConfig(),
    getMiningProtectionReserveBalanceUsdt(),
    fetchDogeUsdtRate(),
  ]);

  // Prisma Decimal isn't serializable across the server/client boundary
  // (same convention as src/app/pool/page.tsx) — convert to plain
  // numbers before handing off.
  const economics = {
    fleetCapacityMhs: Number(economicsConfig.fleetCapacityMhs),
    referenceMonthlyGrossUsdt: Number(economicsConfig.referenceMonthlyGrossUsdt),
    minerPowerKw: Number(economicsConfig.minerPowerKw),
    electricityRateUsdtPerKwh: Number(economicsConfig.electricityRateUsdtPerKwh),
    poolFeePct: Number(economicsConfig.poolFeePct),
    targetRoiPct: Number(economicsConfig.targetRoiPct),
  };

  return <DogeMiningContent platformStats={platformStats} economics={economics} reserveBalanceUsdt={reserveBalanceUsdt} dogeUsdtRate={dogeUsdtRate} />;
}
