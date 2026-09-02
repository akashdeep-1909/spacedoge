"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useShopInventory, type OwnedShopItem } from "@/lib/hooks";
import { useLocale } from "@/lib/i18n/LocaleProvider";

// Coin Rush Shop (Phase 1: ROCKET_SHAPE only) — the "before enter in
// game, which product user have and what he want to use" screen. Only
// ever shows the wallet's OWNED, currently-usable inventory (never a
// buy flow — that's /dashboard/shop) and only ever passes back a
// walletShopItem id; POST /api/matches (src/lib/shop.ts
// consumeLoadoutSelections) is the one place that selection is ever
// actually validated/consumed, so a stale client snapshot here (item
// expired between opening this modal and tapping Start) degrades
// gracefully server-side rather than needing to be airtight here.
export function LoadoutSelectModal({
  open,
  onCancel,
  onStart,
  starting,
}: {
  open: boolean;
  onCancel: () => void;
  onStart: (shapeItemId: string | null) => void;
  starting: boolean;
}) {
  const { t } = useLocale();
  const { data, isLoading } = useShopInventory();
  const [selected, setSelected] = useState<string | null>(null);

  if (!open) return null;

  const shapes = (data?.items ?? []).filter((i): i is OwnedShopItem => i.category === "ROCKET_SHAPE" && i.isUsable);

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed inset-x-4 top-1/2 z-50 -translate-y-1/2 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-sm sm:-translate-x-1/2">
        <div className="game-panel hud-corner rounded-2xl border-gold/25 p-5">
          <h3 className="text-glow-gold text-lg font-black">{t("shop.loadoutModalTitle")}</h3>
          <p className="mt-1 text-xs text-muted">{t("shop.loadoutModalSubtitle")}</p>

          {isLoading ? (
            <p className="mt-4 text-sm text-muted">…</p>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={() => setSelected(null)}
                className={`rounded-xl border p-3 text-left text-sm transition ${
                  selected === null ? "border-gold/50 bg-gold-soft" : "border-line bg-panel-2 hover:border-gold/30"
                }`}
              >
                <span className="font-bold">{t("shop.loadoutNoneOption")}</span>
              </button>
              {shapes.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelected(item.id)}
                  className={`rounded-xl border p-3 text-left text-sm transition ${
                    selected === item.id ? "border-gold/50 bg-gold-soft" : "border-line bg-panel-2 hover:border-gold/30"
                  }`}
                >
                  <span className="font-bold">{item.label}</span>
                  <span className="ml-2 text-[11px] text-muted">
                    {item.usesRemaining !== null
                      ? t("shop.usesRemainingLabel", { uses: item.usesRemaining })
                      : item.expiresAt
                        ? t("shop.expiresLabel", { date: new Date(item.expiresAt).toLocaleDateString() })
                        : null}
                  </span>
                </button>
              ))}
              {shapes.length === 0 && (
                <p className="rounded-xl border border-line bg-panel-2 p-3 text-xs text-muted">
                  {t("shop.loadoutEmptyInventory")}{" "}
                  <Link href="/dashboard/shop" className="text-gold underline">
                    {t("shop.loadoutVisitShopLink")}
                  </Link>
                </p>
              )}
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <button
              onClick={onCancel}
              disabled={starting}
              className="btn-game-outline flex-1 rounded-full px-4 py-2 text-sm disabled:opacity-50"
            >
              {t("shop.loadoutCancelButton")}
            </button>
            <button
              onClick={() => onStart(selected)}
              disabled={starting}
              className="btn-game hud-corner flex-1 rounded-full px-4 py-2 text-sm disabled:opacity-50"
            >
              {starting ? t("play.startingButton") : t("shop.loadoutStartButton")}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
