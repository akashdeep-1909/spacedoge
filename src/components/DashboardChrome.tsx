"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { MobileNav } from "@/components/MobileNav";
import { BottomTabBar } from "@/components/BottomTabBar";
import { InfoTooltip } from "@/components/InfoTooltip";
import { SocialLinks } from "@/components/SocialLinks";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const NAV_LINKS = [
  { href: "/dashboard", key: "nav.dashboard" as const },
  { href: "/dashboard/play", key: "nav.play" as const },
  { href: "/dashboard/mining", key: "nav.miningRig" as const },
  { href: "/dashboard/wallet", key: "nav.wallet" as const },
  { href: "/dashboard/deposit", key: "nav.deposit" as const },
  { href: "/dashboard/convert", key: "nav.convert" as const },
  { href: "/dashboard/transfer", key: "nav.transfer" as const },
  { href: "/dashboard/withdraw", key: "nav.withdraw" as const },
  { href: "/dashboard/refer", key: "nav.refer" as const },
  { href: "/dashboard/history", key: "nav.history" as const },
  { href: "/dashboard/leaderboard", key: "nav.leaderboard" as const },
  { href: "/pool", key: "nav.pool" as const },
];

export function DashboardChrome({ children }: { children: ReactNode }) {
  const { t } = useLocale();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background pb-16 text-foreground lg:pb-0">
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-gold/15 bg-background/90 px-4 py-4 backdrop-blur sm:px-6">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-3">
          <Image
            src="/SpaceDOGE-icon.png"
            alt="SPACE DOGE"
            width={52}
            height={52}
            priority
            className="shrink-0"
          />
          <div className="hidden lg:block">
            <h1 className="text-sm font-black uppercase tracking-widest">SPACE DOGE</h1>
            <p className="text-[11px] text-muted">{t("landing.tagline")}</p>
          </div>
        </Link>
        <nav className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-full border border-line bg-panel p-1 text-xs font-semibold lg:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="shrink-0 rounded-full px-2.5 py-1.5 uppercase text-muted transition hover:bg-panel-2 hover:text-gold"
            >
              {t(l.key)}
            </Link>
          ))}
        </nav>
        {/* min-w-0 + overflow-x-auto is a safety net, not the primary
            fix — content here is sized to fit a real phone screen on its
            own now, but if it ever doesn't again, this scrolls instead
            of silently clipping past the viewport edge (which is what
            was actually happening: Disconnect getting cut off entirely,
            invisible, rather than reachable another way). */}
        <div className="flex min-w-0 shrink items-center gap-2 overflow-x-auto">
          <LanguageSwitcher />
          <MobileNav />
          <ConnectWalletButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>

      <footer className="flex flex-col items-center justify-center gap-2 border-t border-line px-6 py-4 text-center text-[11px] text-muted">
        <SocialLinks />
        <div className="flex items-center gap-1.5">
          <span>{t("common.disclaimer")}</span>
          <InfoTooltip text={t("footer.disclaimerTooltip")} />
        </div>
      </footer>

      <BottomTabBar />
    </div>
  );
}
