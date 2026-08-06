"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export interface SuccessModalRow {
  label: string;
  value: string;
}

// Shared confirmation popup for "you just spent money and got X" flows
// (mining rig activation, hashrate purchase, ...) — one component so
// every such confirmation looks and behaves identically instead of each
// call site inventing its own feedback pattern. Dark "Neon Arcade" HUD
// styling (game-panel/hud-corner/btn-game) to match the rest of the
// dashboard, unlike the light-themed ShareSheet bottom sheet.
export function SuccessModal({
  title,
  body,
  rows,
  onClose,
}: {
  title: string;
  body?: string;
  rows?: SuccessModalRow[];
  onClose: () => void;
}) {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  function close() {
    setVisible(false);
    setTimeout(onClose, 150);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-150 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={close}
      />
      <div
        className={`game-panel hud-corner relative w-full max-w-sm rounded-2xl p-6 text-center transition-all duration-150 ${
          visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
        }`}
      >
        <button
          onClick={close}
          aria-label={t("common.closeButton")}
          className="absolute right-3 top-3 text-muted transition hover:text-foreground"
        >
          <X size={18} />
        </button>
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-mint-soft text-mint">
          <CheckCircle2 size={30} />
        </div>
        <h3 className="mt-4 text-lg font-bold">{title}</h3>
        {body && <p className="mt-1.5 text-sm text-muted">{body}</p>}
        {rows && rows.length > 0 && (
          <div className="mt-4 flex flex-col gap-2 text-left">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm">
                <span className="text-muted">{r.label}</span>
                <span className="font-bold">{r.value}</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={close} className="btn-game hud-corner mt-5 w-full rounded-full py-2.5 text-sm">
          {t("common.okButton")}
        </button>
      </div>
    </div>
  );
}
