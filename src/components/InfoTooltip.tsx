"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const TOOLTIP_WIDTH = 256; // px, matches w-64
const VIEWPORT_MARGIN = 8;
const GAP_ABOVE_TRIGGER = 10;

// A small "ⓘ" trigger that reveals fine-print/disclaimer text on
// hover or focus. Portaled straight to document.body (position:
// fixed, computed from the trigger's real screen position) instead of
// an absolutely-positioned sibling — any ancestor with `overflow:
// hidden` or a `clip-path` (this app's own `.hud-corner` class being
// the exact case that broke it) silently clips a plain absolute
// child, which is why a portal is the actual industry-standard fix
// (Radix, Floating UI, MUI tooltips all portal for this reason), not
// just a nice-to-have. Also clamps horizontally to the viewport and
// keeps the pointer arrow aimed at the trigger even when the box
// itself had to shift to avoid spilling off-screen.
export function InfoTooltip({ text, className = "" }: { text: string; className?: string }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; arrowLeft: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function place() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const idealLeft = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(idealLeft, window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN));
    const triggerCenterX = rect.left + rect.width / 2;
    const arrowLeft = Math.max(12, Math.min(TOOLTIP_WIDTH - 12, triggerCenterX - left));
    setCoords({ top: rect.top - GAP_ABOVE_TRIGGER, left, arrowLeft });
  }

  function show() {
    place();
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t("infoTooltip.moreInfoAria")}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
        className="text-muted transition hover:text-gold focus:text-gold focus:outline-none"
      >
        <Info size={13} />
      </button>
      {open &&
        coords &&
        createPortal(
          <span
            role="tooltip"
            style={{ top: coords.top, left: coords.left, transform: "translateY(-100%)" }}
            className="pointer-events-none fixed z-[100] w-64 rounded-lg border border-line bg-panel-2 p-3 text-[11.5px] font-normal normal-case leading-relaxed tracking-normal text-foreground shadow-2xl"
          >
            {text}
            <span
              style={{ left: coords.arrowLeft }}
              className="absolute top-full -mt-[5px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-b border-r border-line bg-panel-2"
            />
          </span>,
          document.body
        )}
    </span>
  );
}
