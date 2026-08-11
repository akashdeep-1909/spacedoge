"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { consumeWalletReturnPath } from "@/lib/walletReturnPath";

// See src/lib/walletReturnPath.ts's own doc-comment for the full "why"
// — this is the consuming half. Rendered once at the app root
// (app/providers.tsx) specifically so it runs on ANY page, including
// wherever a mobile wallet's return redirect strands the user (often a
// brand new tab showing the homepage, unconnected — see
// consumeWalletReturnPath's own doc-comment for why this deliberately
// doesn't wait for a successful reconnect/sign-in first). Re-checks on
// every real navigation (pathname change), not just once per app load,
// since the redirect-back can land at any point in the session.
export function WalletReturnPathRedirector() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Always consume (not just when redirecting) — a flag left over
    // from a connect attempt that never actually left this tab
    // shouldn't wrongly redirect some later, unrelated navigation once
    // it's finally read.
    const target = consumeWalletReturnPath();
    // Compares against the full path+search (not just usePathname()'s
    // bare pathname) since the original page could have had query
    // params (a referral link, a lobby invite token, etc.) worth
    // restoring too.
    const current = `${window.location.pathname}${window.location.search}`;
    if (target && target !== current) {
      router.replace(target);
    }
  }, [pathname, router]);

  return null;
}
