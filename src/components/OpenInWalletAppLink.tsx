"use client";

import { useEffect, useState } from "react";
import { metaMaskAppLink } from "@/lib/wagmi";
import { useLocale } from "@/lib/i18n/LocaleProvider";

// Secondary path alongside the main Connect Wallet button, shown only
// below `lg` (a real wallet browser extension exists at that width,
// so this is mobile-only) — see metaMaskAppLink's doc-comment for why
// this exists instead of just making WalletConnect faster/more
// reliable, which isn't achievable from in-app code alone. Styled a
// step above a purely incidental footnote (gold instead of muted, a
// touch larger) now that it's the actual recommended fix for repeated
// "connect redirects to a new tab" reports — still clearly secondary
// to the main button (no background/border of its own), just no
// longer easy to miss.
export function OpenInWalletAppLink() {
  const { t } = useLocale();
  // Starts at metaMaskAppLink()'s own SSR-safe bare fallback
  // ("https://metamask.app.link", no page-specific dapp/return path
  // suffix) on BOTH the server render and the client's FIRST hydration
  // pass — confirmed live as a real hydration mismatch otherwise:
  // metaMaskAppLink() reads window.location, which doesn't exist
  // during SSR, so computing it directly during render produced two
  // different `href` values between the server and client passes the
  // moment this component started rendering on the (server-rendered)
  // homepage via ConnectWalletButton. Synced to the real, current-page
  // link once mounted client-side — same "effect syncs a value from an
  // external, browser-only system" pattern already used elsewhere in
  // this codebase (e.g. WalletDepositButton.tsx's own pendingTxHash
  // restore effect).
  const [href, setHref] = useState("https://metamask.app.link");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see this component's own doc-comment above: avoiding the real SSR/hydration mismatch this sync fixes outweighs the generically-flagged pattern, matching this codebase's established exception convention (see WalletDepositButton.tsx's identical justification)
    setHref(metaMaskAppLink());
  }, []);
  return (
    <a
      href={href}
      className="whitespace-nowrap text-right text-xs font-semibold text-gold/80 underline decoration-dotted underline-offset-2 hover:text-gold lg:hidden"
    >
      {t("common.openInMetaMask")}
    </a>
  );
}
