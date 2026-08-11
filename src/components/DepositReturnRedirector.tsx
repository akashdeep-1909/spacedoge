"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { consumePendingDepositReturn } from "@/lib/depositReturn";

const DEPOSIT_PATH = "/dashboard/deposit";

// See src/lib/depositReturn.ts's own doc-comment for the full "why" —
// this is the consuming half. Rendered once at the app root
// (app/providers.tsx) specifically so it runs on ANY page, including
// the homepage a wallet app-switch's own return redirect can strand
// the user on after confirming a deposit from a regular mobile browser
// tab. Re-checks on every real navigation (pathname change), not just
// once per app load, since the redirect-back can land at any point in
// the session, not necessarily on first paint.
export function DepositReturnRedirector() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Always consume (not just when redirecting) — a flag left over
    // from a deposit attempt that never actually left this tab (see
    // clearPendingDepositReturn's own call site) shouldn't wrongly
    // redirect some later, unrelated navigation once it's finally
    // read.
    const shouldReturn = consumePendingDepositReturn();
    if (shouldReturn && pathname !== DEPOSIT_PATH) {
      router.replace(DEPOSIT_PATH);
    }
  }, [pathname, router]);

  return null;
}
