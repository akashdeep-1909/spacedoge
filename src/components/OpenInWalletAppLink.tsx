"use client";

import { metaMaskAppLink } from "@/lib/wagmi";
import { useLocale } from "@/lib/i18n/LocaleProvider";

// Secondary path alongside the main Connect Wallet button, shown only
// below `lg` (a real wallet browser extension exists at that width,
// so this is mobile-only) — see metaMaskAppLink's doc-comment for why
// this exists instead of just making WalletConnect faster/more
// reliable, which isn't achievable from in-app code alone.
export function OpenInWalletAppLink() {
  const { t } = useLocale();
  return (
    <a
      href={metaMaskAppLink()}
      className="whitespace-nowrap text-right text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-gold lg:hidden"
    >
      {t("common.openInMetaMask")}
    </a>
  );
}
