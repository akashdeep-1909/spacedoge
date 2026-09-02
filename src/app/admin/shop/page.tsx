"use client";

import { useState } from "react";
import { useAdminShopItems, useUpdateAdminShopItem, type AdminShopItemRow } from "@/lib/hooks";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

const plainInputClass = "w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm";

// Coin Rush Shop catalog — ShopItemConfig. No add/delete here (same
// scope boundary as the Game Modes editor: the seeded row set is fixed
// in code, see src/lib/shop.ts's SEED_DEFAULTS doc-comment; only the
// commercial/presentation knobs are runtime-editable). Category,
// entitlement type, and every effect column (shapeKey today,
// speedMultBonus/etc. once later phases add those categories) are
// immutable here — a WalletShopItem purchase snapshots those verbatim
// at purchase time, so changing them here would silently redefine
// what was already sold without touching what was sold.
export default function AdminShopPage() {
  const { data, isLoading } = useAdminShopItems();

  const byCategory = new Map<string, AdminShopItemRow[]>();
  for (const row of data?.rows ?? []) {
    const list = byCategory.get(row.category) ?? [];
    list.push(row);
    byCategory.set(row.category, list);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-black uppercase tracking-wide">Shop</h1>
        <p className="mt-1 text-sm text-muted">
          Coin Rush Shop catalog. Right now this is cosmetic rocket skins only (Phase 1) — sold
          either for a fixed number of matches or a time-limited pass (3/7-day), never affecting
          gameplay or collision size. Label, description, price, and enabled state are editable
          live; the category/pricing-model/effect columns are fixed in code and shown read-only
          so an edit here can never retroactively change what an already-sold item does.
        </p>
      </div>

      <section className="game-panel hud-corner rounded-2xl p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gold">Catalog Items</p>
        <div className="mt-4 flex flex-col gap-4">
          {isLoading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : !data?.rows.length ? (
            <p className="text-sm text-muted">No shop items yet.</p>
          ) : (
            [...byCategory.entries()].map(([category, rows]) => (
              <div key={category}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{category}</p>
                <div className="mt-2 flex flex-col gap-3">
                  {rows.map((row) => (
                    <ShopItemRow key={row.id} row={row} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function ShopItemRow({ row }: { row: AdminShopItemRow }) {
  const update = useUpdateAdminShopItem();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(row.label);
  const [description, setDescription] = useState(row.description);
  const [priceUsdt, setPriceUsdt] = useState(String(row.priceUsdt));
  const [error, setError] = useState<string | null>(null);

  const pricingSummary =
    row.entitlementType === "USES" ? `${row.usesGranted ?? 0} matches` : `${row.termDays ?? 0}-day pass`;

  async function toggleEnabled() {
    setError(null);
    try {
      await update.mutateAsync({ id: row.id, enabled: !row.enabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function saveEdit() {
    setError(null);
    try {
      await update.mutateAsync({
        id: row.id,
        label: label.trim(),
        description: description.trim(),
        priceUsdt: Number(priceUsdt) || 0,
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  return (
    <div className="rounded-xl border border-line bg-panel-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {row.label}
            <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">{row.key}</span>
            {!row.enabled && (
              <span className="rounded-full border border-risk/40 bg-risk-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-risk">
                Disabled
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted">{row.description}</p>
          <p className="mt-1 text-xs text-muted">
            ${row.priceUsdt.toFixed(2)} · {pricingSummary}
            {row.shapeKey && <> · shape: {row.shapeKey}</>}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button onClick={() => setEditing((v) => !v)} className="rounded-full border border-line px-3 py-1 text-[11px] text-muted hover:text-foreground">
            {editing ? "Cancel" : "Edit"}
          </button>
          <button
            onClick={toggleEnabled}
            disabled={update.isPending}
            className="rounded-full border border-line px-3 py-1 text-[11px] text-muted hover:text-foreground disabled:opacity-50"
          >
            {row.enabled ? "Disable" : "Enable"}
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
          <Field label="Label">
            <input value={label} onChange={(e) => setLabel(e.target.value)} className={plainInputClass} />
          </Field>
          <Field label="Price (USDT)">
            <input type="number" min="0" step="0.01" value={priceUsdt} onChange={(e) => setPriceUsdt(e.target.value)} className={plainInputClass} />
          </Field>
          <Field label="Description" hint="shown to players in the shop">
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={plainInputClass} />
          </Field>
          <button onClick={saveEdit} disabled={update.isPending} className="btn-game-outline rounded-full px-4 py-1.5 text-xs disabled:opacity-50 sm:col-span-2 sm:w-fit">
            {update.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-risk">{error}</p>}
    </div>
  );
}
