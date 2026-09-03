"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

// Split the same way the player dashboard's own nav is split
// (src/components/DashboardChrome.tsx's PRIMARY_NAV_LINKS +
// src/components/DesktopMoreNav.tsx) — a handful of always-visible
// pages plus everything else in a "More" dropdown. The admin pill had
// grown to 13 links + "Back to app," which no longer fit a real
// laptop-width window and wrapped onto 2-3 lines. Plain English
// throughout (no i18n anywhere in /admin/**, per this app's own
// convention) and no player-facing toggles to filter by — an admin
// always sees every page regardless of any shopEnabled/kolVipEnabled
// switch.
const PRIMARY_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/deposits", label: "Deposits" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/withdrawals", label: "Withdrawals" },
  { href: "/admin/mining", label: "Mining" },
];

const MORE_LINKS = [
  { href: "/admin/transfers", label: "Transfers" },
  { href: "/admin/lobbies", label: "Lobbies" },
  { href: "/admin/game-profit", label: "Game Profit" },
  { href: "/admin/mining-profit", label: "Mining Profit" },
  { href: "/admin/waitlist", label: "Waitlist" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/shop", label: "Shop" },
  { href: "/admin/kol-vip", label: "KOL VIP" },
  { href: "/admin/settings", label: "Settings" },
];

const linkClass = (active: boolean) =>
  `shrink-0 rounded-full px-2.5 py-1.5 text-xs font-semibold uppercase transition hover:bg-panel-2 hover:text-gold ${
    active ? "bg-gold-soft text-gold" : "text-muted"
  }`;

export function AdminNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

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
      const PANEL_WIDTH = 208;
      const MARGIN = 8;
      const idealLeft = rect.left;
      const maxLeft = Math.max(MARGIN, window.innerWidth - PANEL_WIDTH - MARGIN);
      setAnchor({ top: rect.bottom + 8, left: Math.min(idealLeft, maxLeft) });
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  const isMoreActive = MORE_LINKS.some((l) => l.href === pathname);

  return (
    <nav className="flex items-center gap-1 rounded-full border border-line bg-panel p-1 text-xs font-semibold">
      {PRIMARY_LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={linkClass(pathname === l.href)}>
          {l.label}
        </Link>
      ))}

      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "More"}
        aria-expanded={open}
        className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold uppercase transition hover:bg-panel-2 hover:text-gold ${
          isMoreActive ? "bg-gold-soft text-gold" : "text-muted"
        }`}
      >
        More
        <ChevronDown size={13} strokeWidth={2.5} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open &&
        anchor &&
        createPortal(
          <>
            <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <div className="fixed z-50 w-52" style={{ top: anchor.top, left: anchor.left }}>
              <nav className="game-panel flex flex-col gap-1 rounded-2xl p-2 shadow-2xl">
                {MORE_LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className={`rounded-xl px-3 py-2.5 text-sm font-bold uppercase leading-tight tracking-wide transition ${
                      pathname === l.href ? "bg-gold-soft text-gold" : "text-muted hover:bg-panel-2 hover:text-gold"
                    }`}
                  >
                    {l.label}
                  </Link>
                ))}
              </nav>
            </div>
          </>,
          document.body
        )}
    </nav>
  );
}
