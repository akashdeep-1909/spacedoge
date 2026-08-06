import { ReferralCapture } from "@/components/ReferralCapture";
import { LandingContent } from "@/components/LandingContent";
import { settleYesterdayIfNeeded, reconcileExpiredContracts } from "@/lib/mining";
import { getPlatformStats } from "@/lib/platformStats";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  // Real settled numbers from the most recent fully-elapsed day — not
  // a live/unsettled "today" estimate, doc 9.3's own rule against
  // showing an estimate as if it were confirmed applies here too.
  const epoch = await settleYesterdayIfNeeded();
  // Day-180 close-out, same lazy-trigger convention as settleYesterdayIfNeeded above.
  await reconcileExpiredContracts();

  const platformStats = await getPlatformStats();

  // Decimal (Prisma) fields aren't serializable across the server/client
  // boundary — convert to plain numbers/strings here before handing off
  // to the client component that renders the translated JSX.
  const mining = {
    epochDateLabel: new Date(epoch.epochDate).toLocaleDateString(),
    contractedHashrate: Number(epoch.contractedHashrate),
    observedHashrate: Number(epoch.observedHashrate),
    totalEffectiveMp: Number(epoch.totalEffectiveMp),
    netDistributableDoge: Number(epoch.netDistributableDoge),
  };

  return (
    <>
      <ReferralCapture code={ref} />
      <LandingContent mining={mining} platformStats={platformStats} />
    </>
  );
}
