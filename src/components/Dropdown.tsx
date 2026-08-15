"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";

// A plain <select> pops up the browser/OS's own native picker on
// mobile — a plain white system list that clashes with the rest of
// the dark theme and can't be restyled with CSS. This renders the
// whole thing ourselves so it looks like the rest of the app on every
// device. `label` accepts any ReactNode (not just string) so callers
// can prefix an icon before the text — e.g. withdraw/deposit chain
// pickers showing a coin/chain logo badge next to the network name.
export function Dropdown<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-line bg-panel-2 px-3 py-2 text-left text-sm"
      >
        <span className="truncate">{selected?.label ?? t("dropdown.selectPlaceholder")}</span>
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="game-panel absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-line p-1"
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition ${
                o.value === value ? "bg-mint-soft text-mint" : "hover:bg-panel-2"
              }`}
            >
              <span className="w-4 shrink-0">{o.value === value && "✓"}</span>
              <span className="truncate">{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
