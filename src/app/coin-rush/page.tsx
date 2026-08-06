import type { Metadata } from "next";
import { CoinRushContent } from "@/components/CoinRushContent";
import { getPlatformStats } from "@/lib/platformStats";

export const metadata: Metadata = {
  title: "Coin Rush — Space DOGE",
  description: "Race in four-player rocket arenas, collect USDT Orbs and compete for server-settled Game USDT rewards in Coin Rush.",
};

export default async function CoinRushPage() {
  const platformStats = await getPlatformStats();

  return <CoinRushContent platformStats={platformStats} />;
}
