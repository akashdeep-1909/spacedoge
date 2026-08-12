"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/locales";

const PANEL_WIDTH = 224; // matches w-56 below
const MARGIN = 8;

const DEFAULT_TRIGGER_CLASS =
  "flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-gold/40 hover:text-foreground";

// Globe icon in the header — click to open a single-column dropdown of
// all supported locales, one line per row (flag + native name only — no
// English gloss, which just duplicated the native name for entries like
// "English").
//
// `className`/`icon` let this same component also be dropped in as a
// full-width ROW inside another menu (MobileNav's dashboard hamburger,
// SiteHeader's mobile dropdown) instead of only ever rendering as its
// own standalone header pill — both callers pass a menu-row style and
// a leading icon; the default (no props) keeps the original compact
// pill for direct header placement.
//
// The backdrop + panel are portaled to document.body rather than
// rendered inline, same as src/components/MobileNav.tsx and for the
// same reason: nesting a floating menu inside the header keeps it
// inside the header's own stacking context, so it can visually clash
// with sibling header elements (the wallet chip, the mobile-nav
// toggle) no matter how high its own z-index goes. Portaling — plus a
// full-screen backdrop — makes it a true top-layer overlay instead.
export function LanguageSwitcher({ className, icon }: { className?: string; icon?: ReactNode } = {}) {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function place() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Clamp so the panel always keeps a margin on both edges instead
      // of running off-screen when the button sits near the viewport
      // edge — same fix MobileNav needed for the same reason.
      const idealRight = window.innerWidth - rect.right;
      const maxRight = Math.max(MARGIN, window.innerWidth - PANEL_WIDTH - MARGIN);
      const right = Math.min(idealRight, maxRight);
      setAnchor({ top: rect.bottom + 6, right });
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t("common.language")}
        aria-label={t("common.language")}
        aria-expanded={open}
        className={className ?? DEFAULT_TRIGGER_CLASS}
      >
        {icon}
        <span aria-hidden className="shrink-0 text-base leading-none">{LOCALE_LABELS[locale].flag}</span>
        {/* Without an icon (the default standalone pill) the native
            name only earns its space at sm+; inside a full-width menu
            row (icon passed) there's always room, and flex-1 pushes
            the chevron to the row's trailing edge. */}
        <span className={icon ? "flex-1 truncate text-left normal-case" : "hidden sm:inline"}>{LOCALE_LABELS[locale].native}</span>
        <ChevronDown size={12} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open &&
        anchor &&
        createPortal(
          <>
            <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <div className="fixed z-50" style={{ top: anchor.top, right: anchor.right, width: PANEL_WIDTH }}>
              <div role="listbox" className="game-panel rounded-lg border border-line p-1 shadow-2xl">
                {LOCALES.map((code) => {
                  const active = code === locale;
                  return (
                    <button
                      key={code}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        setLocale(code);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition ${
                        active ? "bg-mint-soft text-mint" : "hover:bg-panel-2"
                      }`}
                    >
                      <span aria-hidden className="text-base leading-none">{LOCALE_LABELS[code].flag}</span>
                      <span className="flex-1 truncate">{LOCALE_LABELS[code].native}</span>
                      {active && <Check size={14} className="shrink-0" strokeWidth={2.5} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
