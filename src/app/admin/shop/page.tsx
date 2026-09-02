"use client";

import { useState } from "react";
import {
  useAdminShopItems,
  useUpdateAdminShopItem,
  useCreateAdminShopItem,
  useAdminSettings,
  useUpdateAdminSettings,
  type AdminShopItemRow,
} from "@/lib/hooks";
import { ROCKET_SHAPES, type RocketShapeKey } from "@/lib/shop-shared";

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

// Coin Rush Shop catalog — ShopItemConfig, plus the platform-wide
// on/off switch (PlatformSettings.shopEnabled). No delete here (same
// scope boundary as the Game Modes editor: a real WalletShopItem
// purchase has a required FK to a catalog row, so deleting one that's
// already been sold would either fail outright or orphan someone's
// purchase — Disable already fully removes an item from the player-
// facing catalog with none of that risk). Category, entitlement type,
// and every effect column (shapeKey today, speedMultBonus/etc. once
// later phases add those categories) are immutable once created — a
// WalletShopItem purchase snapshots those verbatim at purchase time,
// so changing them here would silently redefine what was already sold
// without touching what was sold.
export default function AdminShopPage() {
  const { data, isLoading } = useAdminShopItems();
  const [showAdd, setShowAdd] = useState(false);

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
          live; the category/pricing-model/effect columns are fixed at creation so an edit here
          can never retroactively change what an already-sold item does.
        </p>
      </div>

      <ShopMasterSwitch />

      <section className="game-panel hud-corner rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gold">Catalog Items</p>
          <button onClick={() => setShowAdd((v) => !v)} className="btn-game-outline shrink-0 rounded-full px-4 py-1.5 text-xs">
            {showAdd ? "Cancel" : "+ Add Item"}
          </button>
        </div>

        {showAdd && <AddShopItemForm onDone={() => setShowAdd(false)} />}

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

// The "close the whole shop" switch (PlatformSettings.shopEnabled) —
// separate from any single item's own Enable/Disable. Turning this off
// hides the Shop nav link and storefront catalog and blocks new
// purchases; it deliberately does NOT touch anything already owned —
// inventory and the pre-match loadout picker keep working regardless,
// so closing the storefront never strands a paying customer's already-
// purchased cosmetics. See the schema doc-comment on
// PlatformSettings.shopEnabled for the same explanation.
function ShopMasterSwitch() {
  const { data: settings, isLoading } = useAdminSettings();
  const update = useUpdateAdminSettings();
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (!settings) return;
    setError(null);
    try {
      await update.mutateAsync({ shopEnabled: !settings.shopEnabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  const on = settings?.shopEnabled ?? true;

  return (
    <section className={`game-panel hud-corner rounded-2xl border-2 p-5 ${on ? "border-mint/30" : "border-risk/40"}`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gold">Shop Status</p>
          <p className="mt-1 text-sm">
            The whole shop is currently{" "}
            <span className={`font-bold ${on ? "text-mint" : "text-risk"}`}>{on ? "ON" : "OFF"}</span>.
          </p>
          <p className="mt-1 text-xs text-muted">
            OFF hides the Shop nav link and storefront and blocks new purchases for every player.
            Items players already own keep working in matches either way.
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={isLoading || update.isPending}
          className={`shrink-0 rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wide disabled:opacity-50 ${
            on ? "border border-risk/40 text-risk hover:bg-risk-soft" : "btn-game hud-corner"
          }`}
        >
          {update.isPending ? "Saving…" : on ? "Turn Off" : "Turn On"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-risk">{error}</p>}
    </section>
  );
}

const ROCKET_SHAPE_LABEL: Record<RocketShapeKey, string> = {
  VOYAGER: "Voyager — balanced",
  INTERCEPTOR: "Interceptor — long nose, swept wings",
  CRUISER: "Cruiser — short nose, wide wings",
};

function AddShopItemForm({ onDone }: { onDone: () => void }) {
  const create = useCreateAdminShopItem();
  const [shapeKey, setShapeKey] = useState<RocketShapeKey>("VOYAGER");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [priceUsdt, setPriceUsdt] = useState("1.00");
  const [entitlementType, setEntitlementType] = useState<"USES" | "TIME_WINDOW">("USES");
  const [usesGranted, setUsesGranted] = useState("20");
  const [termDays, setTermDays] = useState("7");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!label.trim() || !description.trim()) {
      setError("Label and description are required.");
      return;
    }
    try {
      await create.mutateAsync({
        shapeKey,
        label: label.trim(),
        description: description.trim(),
        priceUsdt: Number(priceUsdt) || 0,
        entitlementType,
        usesGranted: entitlementType === "USES" ? Number(usesGranted) || 0 : null,
        termDays: entitlementType === "TIME_WINDOW" ? Number(termDays) || 0 : null,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create item");
    }
  }

  return (
    <div className="mt-3 grid gap-2 rounded-xl border border-line bg-panel-2 p-3 sm:grid-cols-2">
      <Field label="Rocket shape" hint="the actual silhouette — a code-defined geometry, not editable here">
        <select value={shapeKey} onChange={(e) => setShapeKey(e.target.value as RocketShapeKey)} className={plainInputClass}>
          {ROCKET_SHAPES.map((s) => (
            <option key={s} value={s}>
              {ROCKET_SHAPE_LABEL[s]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Label" hint="shown to players, e.g. &quot;Comet Rocket&quot;">
        <input value={label} onChange={(e) => setLabel(e.target.value)} className={plainInputClass} />
      </Field>
      <Field label="Description" hint="shown to players in the shop">
        <input value={description} onChange={(e) => setDescription(e.target.value)} className={plainInputClass} />
      </Field>
      <Field label="Price (USDT)">
        <input type="number" min="0" step="0.01" value={priceUsdt} onChange={(e) => setPriceUsdt(e.target.value)} className={plainInputClass} />
      </Field>
      <Field label="Pricing model">
        <select
          value={entitlementType}
          onChange={(e) => setEntitlementType(e.target.value as "USES" | "TIME_WINDOW")}
          className={plainInputClass}
        >
          <option value="USES">Fixed number of matches</option>
          <option value="TIME_WINDOW">Time-limited pass (days)</option>
        </select>
      </Field>
      {entitlementType === "USES" ? (
        <Field label="Matches included">
          <input type="number" min="1" value={usesGranted} onChange={(e) => setUsesGranted(e.target.value)} className={plainInputClass} />
        </Field>
      ) : (
        <Field label="Pass length (days)">
          <input type="number" min="1" value={termDays} onChange={(e) => setTermDays(e.target.value)} className={plainInputClass} />
        </Field>
      )}
      <button onClick={submit} disabled={create.isPending} className="btn-game hud-corner rounded-full px-4 py-1.5 text-xs disabled:opacity-50 sm:col-span-2 sm:w-fit">
        {create.isPending ? "Creating…" : "Create Item"}
      </button>
      {error && <p className="text-xs text-risk sm:col-span-2">{error}</p>}
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
