import type { Metadata } from "next";
import { HowItWorksContent } from "@/components/HowItWorksContent";
import { getPlatformStats } from "@/lib/platformStats";

export const metadata: Metadata = {
  title: "How Space DOGE Works",
  description: "Learn how Space DOGE connects wallet-first gameplay, Game USDT rewards and transparent DOGE mining missions.",
};

export default async function HowItWorksPage() {
  const platformStats = await getPlatformStats();

  return <HowItWorksContent platformStats={platformStats} />;
}
