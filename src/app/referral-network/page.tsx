import type { Metadata } from "next";
import { ReferralNetworkContent } from "@/components/ReferralNetworkContent";
import { fetchDogeUsdtRate } from "@/lib/conversion";
import { getMiningEconomicsConfig } from "@/lib/mining-settings";

export const metadata: Metadata = {
  title: "Referral Network — Space DOGE",
  description: "Invite players and earn a transparent, instantly-credited commission whenever a referred wallet enters a paid Coin Rush match or has an active mining contract.",
};

export default async function ReferralNetworkPage() {
  const [dogeUsdtRate, economicsConfig] = await Promise.all([fetchDogeUsdtRate(), getMiningEconomicsConfig()]);

  // Prisma Decimal isn't serializable across the server/client boundary
  // (same convention as src/app/doge-mining/page.tsx) — convert to
  // plain numbers before handing off.
  const miningEconomics = {
    fleetCapacityMhs: Number(economicsConfig.fleetCapacityMhs),
    minerPowerKw: Number(economicsConfig.minerPowerKw),
    electricityRateUsdtPerKwh: Number(economicsConfig.electricityRateUsdtPerKwh),
  };

  return <ReferralNetworkContent dogeUsdtRate={dogeUsdtRate} miningEconomics={miningEconomics} />;
}
