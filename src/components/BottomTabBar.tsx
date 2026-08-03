"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Gamepad2, Pickaxe, Wallet, Trophy, UserPlus } from "lucide-react";
import { useLocale } from "@/lib/i18n/LocaleProvider";

// H5-app-style bottom tab bar — the primary nav for the 6 most used
// destinations on phones AND tablets (anything under the `lg` desktop
// breakpoint, not just phone-sized viewports). Everything else
// (Deposit, Convert, Withdraw, History) stays reachable via the
// header's hamburger menu, or from the Wallet page's own quick links.
const TABS = [
  { href: "/dashboard", key: "nav.dashboard" as const, Icon: Home },
  { href: "/dashboard/play", key: "nav.play" as const, Icon: Gamepad2 },
  { href: "/dashboard/mining", key: "nav.miningRig" as const, Icon: Pickaxe },
  { href: "/dashboard/wallet", key: "nav.wallet" as const, Icon: Wallet },
  { href: "/dashboard/leaderboard", key: "nav.leaderboard" as const, Icon: Trophy },
  { href: "/dashboard/refer", key: "nav.refer" as const, Icon: UserPlus },
];

export function BottomTabBar() {
  const { t } = useLocale();
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/15 bg-background/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-6">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="relative flex flex-col items-center gap-1 py-2.5"
            >
              {active && (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-gold" style={{ boxShadow: "0 0 8px rgba(201,162,39,0.8)" }} />
              )}
              <tab.Icon
                size={20}
                strokeWidth={active ? 2.4 : 2}
                className={active ? "text-gold" : "text-muted"}
                style={active ? { filter: "drop-shadow(0 0 5px rgba(201,162,39,0.7))" } : undefined}
              />
              {/* min-h reserves 2 lines' worth of height for every tab
                  up front — longer translations (Vietnamese, Filipino,
                  Khmer, etc.) wrap onto a 2nd line instead of forcing
                  just that one tab taller than its neighbors, which was
                  breaking the bar's alignment across languages. */}
              <span
                className={`flex min-h-[2.15em] items-start justify-center text-center text-[9px] font-bold uppercase leading-[1.15] tracking-wide ${active ? "text-gold" : "text-muted"}`}
              >
                {t(tab.key)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
