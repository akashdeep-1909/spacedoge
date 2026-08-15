"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useLocale } from "@/lib/i18n/LocaleProvider";

// The rest of the dashboard's page list, beyond DashboardChrome's own
// small always-visible PRIMARY_NAV_LINKS — see that file's own
// doc-comment for why this split exists (the old single 12-item pill
// had no room left for all of them on a real laptop-width window and
// silently clipped the trailing items).
const MORE_LINKS = [
  { href: "/dashboard/convert", key: "nav.convert" as const },
  { href: "/dashboard/transfer", key: "nav.transfer" as const },
  { href: "/dashboard/withdraw", key: "nav.withdraw" as const },
  { href: "/dashboard/refer", key: "nav.refer" as const },
  { href: "/dashboard/history", key: "nav.history" as const },
  { href: "/dashboard/leaderboard", key: "nav.leaderboard" as const },
  { href: "/pool", key: "nav.pool" as const },
];

// Same portal + backdrop + clamped-position approach as MobileNav (see
// that file's own doc-comment for why the dropdown is portaled to
// document.body rather than rendered inline: a positioned descendant
// inside the header's own stacking context would paint above the
// header's un-stacked content, but never above content further down
// the page without escaping that context entirely).
export function DesktopMoreNav() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

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
      const PANEL_WIDTH = 224;
      const MARGIN = 8;
      const idealLeft = rect.left;
      const maxLeft = Math.max(MARGIN, window.innerWidth - PANEL_WIDTH - MARGIN);
      const left = Math.min(idealLeft, maxLeft);
      setAnchor({ top: rect.bottom + 8, left });
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  const isMoreActive = MORE_LINKS.some((l) => l.href === pathname);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? t("common.closeButton") : t("nav.more")}
        aria-expanded={open}
        className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold uppercase transition hover:bg-panel-2 hover:text-gold ${
          isMoreActive ? "bg-gold-soft text-gold" : "text-muted"
        }`}
      >
        {t("nav.more")}
        <ChevronDown size={13} strokeWidth={2.5} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open &&
        anchor &&
        createPortal(
          <>
            <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <div className="fixed z-50 w-56" style={{ top: anchor.top, left: anchor.left }}>
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
                    {t(l.key)}
                  </Link>
                ))}
              </nav>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
