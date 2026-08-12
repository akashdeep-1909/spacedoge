"use client";

import { useEffect, useState } from "react";
import { walletAppLink, type WalletAppLinkKey } from "@/lib/wagmi";
import { useLocale, type TranslationKey } from "@/lib/i18n/LocaleProvider";

const WALLETS: { key: WalletAppLinkKey; labelKey: TranslationKey }[] = [
  { key: "metamask", labelKey: "common.openInMetaMask" },
  { key: "trust", labelKey: "common.openInTrustWallet" },
  { key: "okx", labelKey: "common.openInOkxWallet" },
  { key: "bitget", labelKey: "common.openInBitgetWallet" },
];

// Secondary path alongside the main Connect Wallet button, shown only
// below `lg` (a real wallet browser extension exists at that width,
// so this is mobile-only) — see walletAppLink's own doc-comment
// (src/lib/wagmi.ts) for why this exists instead of just making
// WalletConnect faster/more reliable, which isn't achievable from
// in-app code alone. Not the default/forced path (that would exclude
// every wallet not listed here) — just now actually reachable from
// the very first connect prompt for anyone who wants the smoother,
// zero-redirect route, covering the wallets most commonly reported.
export function OpenInWalletAppLink() {
  const { t } = useLocale();
  // Starts at each wallet's own SSR-safe bare fallback (see
  // walletAppLink's own doc-comment) on BOTH the server render and the
  // client's FIRST hydration pass — confirmed live as a real hydration
  // mismatch otherwise: walletAppLink() reads window.location, which
  // doesn't exist during SSR, so computing it directly during render
  // produced two different `href` values between the server and client
  // passes the moment this component started rendering on the
  // (server-rendered) homepage via ConnectWalletButton. Synced to the
  // real, current-page links once mounted client-side — same "effect
  // syncs a value from an external, browser-only system" pattern
  // already used elsewhere in this codebase (e.g. WalletDepositButton.tsx's
  // own pendingTxHash restore effect).
  // Deliberately a flat static object, NOT a useState(() => ...) lazy
  // initializer that calls walletAppLink() up front — that function
  // itself branches on `typeof window`, so a lazy initializer would
  // still compute the REAL, page-specific link the moment it runs on
  // the client's first (post-SSR, pre-hydration-compare) render, since
  // window already exists there — reproducing the exact mismatch this
  // whole effect-based approach exists to avoid, just moved one layer
  // deeper. This literal must match walletAppLink()'s own `typeof
  // window === "undefined"` fallback branch exactly for every key.
  const [hrefs, setHrefs] = useState<Record<WalletAppLinkKey, string>>({
    metamask: "https://metamask.app.link",
    trust: "https://trustwallet.com",
    okx: "https://www.okx.com/web3",
    bitget: "https://web3.bitget.com",
  });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see this component's own doc-comment above: avoiding the real SSR/hydration mismatch this sync fixes outweighs the generically-flagged pattern, matching this codebase's established exception convention (see WalletDepositButton.tsx's identical justification)
    setHrefs(Object.fromEntries(WALLETS.map((w) => [w.key, walletAppLink(w.key)])) as Record<WalletAppLinkKey, string>);
  }, []);

  return (
    <div className="flex flex-col items-end gap-1 lg:hidden">
      <span className="text-right text-[11px] text-muted">{t("common.openInWalletBrowserLabel")}</span>
      <div className="flex flex-wrap justify-end gap-x-2.5 gap-y-1">
        {WALLETS.map((w) => (
          <a
            key={w.key}
            href={hrefs[w.key]}
            className="whitespace-nowrap text-right text-xs font-semibold text-gold/80 underline decoration-dotted underline-offset-2 hover:text-gold"
          >
            {t(w.labelKey)}
          </a>
        ))}
      </div>
    </div>
  );
}
