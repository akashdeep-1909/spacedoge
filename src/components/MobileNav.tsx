"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Gamepad2,
  Pickaxe,
  Wallet,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpRight,
  Send,
  UserPlus,
  History,
  Trophy,
  Globe,
  Menu,
  X,
  LogOut,
  Languages,
} from "lucide-react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useAuth } from "@/lib/auth-context";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const LINKS = [
  { href: "/dashboard", key: "nav.dashboard" as const, Icon: Home },
  { href: "/dashboard/play", key: "nav.play" as const, Icon: Gamepad2 },
  { href: "/dashboard/mining", key: "nav.miningRig" as const, Icon: Pickaxe },
  { href: "/dashboard/wallet", key: "nav.wallet" as const, Icon: Wallet },
  { href: "/dashboard/deposit", key: "nav.deposit" as const, Icon: ArrowDownToLine },
  { href: "/dashboard/convert", key: "nav.convert" as const, Icon: ArrowLeftRight },
  { href: "/dashboard/transfer", key: "nav.transfer" as const, Icon: Send },
  { href: "/dashboard/withdraw", key: "nav.withdraw" as const, Icon: ArrowUpRight },
  { href: "/dashboard/refer", key: "nav.refer" as const, Icon: UserPlus },
  { href: "/dashboard/history", key: "nav.history" as const, Icon: History },
  { href: "/dashboard/leaderboard", key: "nav.leaderboard" as const, Icon: Trophy },
  { href: "/pool", key: "nav.pool" as const, Icon: Globe },
];

// The desktop <nav> in the dashboard header is `hidden lg:flex` — below
// that breakpoint (phones AND tablets) there is no other way to reach
// the full page list but this one; the bottom tab bar only covers the
// 6 most-used destinations. This is the only full nav below `lg`, not
// a supplementary one.
//
// The backdrop + dropdown are portaled to document.body rather than
// rendered inline. Nesting a `position: fixed` overlay inside the
// header keeps it inside the header's own stacking context (the header
// has a z-index, so it forms one) — within that context the header's
// own un-stacked content (z-index: auto) paints BEHIND any positioned
// descendant, so the overlay would visually cover the header's own
// logo/buttons no matter how high the header's z-index goes. Portaling
// escapes that entirely.
export function MobileNav() {
  const { t } = useLocale();
  const { session, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  // Close the menu on navigation — adjusted during render (React's
  // recommended pattern for "reset state when a prop changes") rather
  // than in an effect, so there's no extra render pass just to close it.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function place() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Right-aligning strictly to the button (right: windowWidth -
      // rect.right) pushes the fixed w-56 (224px) panel's LEFT edge
      // negative — off-screen — whenever the button sits left of
      // center on a narrow viewport, which it does here (it's the
      // first of three items in the header's right-hand cluster).
      // Clamp so the panel always keeps an 8px margin on both edges.
      const PANEL_WIDTH = 224;
      const MARGIN = 8;
      const idealRight = window.innerWidth - rect.right;
      const maxRight = Math.max(MARGIN, window.innerWidth - PANEL_WIDTH - MARGIN);
      const right = Math.min(idealRight, maxRight);
      setAnchor({ top: rect.bottom + 8, right });
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="btn-game-outline hud-corner grid h-9 w-9 place-items-center rounded-lg text-base"
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      {open &&
        anchor &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <div
              className="fixed z-50 w-56"
              style={{ top: anchor.top, right: anchor.right }}
            >
              <nav className="game-panel flex flex-col gap-1 rounded-2xl p-2 shadow-2xl">
                {LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold uppercase leading-tight tracking-wide transition ${
                      pathname === l.href
                        ? "bg-gold-soft text-gold"
                        : "text-muted hover:bg-panel-2 hover:text-gold"
                    }`}
                  >
                    <l.Icon size={17} strokeWidth={2} className="shrink-0" />
                    <span className="min-w-0">{t(l.key)}</span>
                  </Link>
                ))}
                {/* Language lives here instead of as its own header pill
                    — the header row at phone/tablet widths only had
                    room for so much (logo + language flag + this
                    hamburger + the wallet chip), and the flag pill was
                    the one item with no fixed relationship to "using
                    the app" the way the nav links or the wallet chip
                    do. One less item competing for space up top. */}
                <div className="my-1 border-t border-line" />
                <LanguageSwitcher
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-bold uppercase leading-tight tracking-wide text-muted transition hover:bg-panel-2 hover:text-gold"
                  icon={<Languages size={17} strokeWidth={2} className="shrink-0" />}
                />
                {session?.authenticated && (
                  <>
                    <div className="my-1 border-t border-line" />
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        signOut();
                      }}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-bold uppercase tracking-wide text-risk transition hover:bg-panel-2"
                    >
                      <LogOut size={17} strokeWidth={2} className="shrink-0" />
                      {t("common.disconnect")}
                    </button>
                  </>
                )}
              </nav>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
