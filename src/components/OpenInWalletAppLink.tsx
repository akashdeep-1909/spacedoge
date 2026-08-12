"use client";

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
  return (
    <a
      href={metaMaskAppLink()}
      className="whitespace-nowrap text-right text-xs font-semibold text-gold/80 underline decoration-dotted underline-offset-2 hover:text-gold lg:hidden"
    >
      {t("common.openInMetaMask")}
    </a>
  );
}
