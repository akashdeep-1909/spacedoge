"use client";

import { useState } from "react";
import {
  useAdminShopItems,
  useUpdateAdminShopItem,
  useCreateAdminShopItem,
  useAdminSettings,
  useUpdateAdminSettings,
  type AdminShopItemRow,
  type CreateShopItemInput,
} from "@/lib/hooks";
import { ROCKET_SHAPES, SELLABLE_SHOP_CATEGORIES, SHOP_CATEGORY_META, describeShopItemEffectPlainEnglish, type RocketShapeKey, type ShopItemCategory } from "@/lib/shop-shared";
import { RocketPreview } from "@/components/game/RocketPreview";
import { ShopItemIcon } from "@/components/game/ShopItemIcon";

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
// and every effect column are immutable once created — a
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
          Coin Rush Shop catalog. Rocket skins (shape + color) are purely cosmetic — never affect
          gameplay or collision size. Speed/Health/Magnet/Fire/Shield items are real upgrades to
          mechanics every player already has for free in every match (see each category&apos;s own
          fields below) — a Magnet/Shield/Fire upgrade extends its duration/uses and shortens its
          cooldown; Speed/Health are permanent whole-match bonuses. Label, description, price,
          validity/matches included, and enabled state are all editable live — a purchase already
          snapshots its own copy of these at purchase time, so changing them here only ever affects
          a NEW purchase. Category, pricing model (matches-vs-days), and every true effect
          column (shape, color, speed %, etc.) are fixed at creation and can never be edited after.
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
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
                  {SHOP_CATEGORY_META[category as ShopItemCategory]?.label ?? category}
                </p>
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
  ROCKET: "Rocket — classic nose-and-wings silhouette",
  SAUCER: "Saucer — flying-disc UFO, no rear jet",
  ORB: "Orb — small glowing drone sphere",
  WEDGE: "Wedge — flat angular stealth fighter",
  COMET: "Comet — round head, long wispy tail",
  FIGHTER: "Fighter — twin-boom, twin engines",
};

const DEFAULT_COLOR = "#f4c15d";

// One small sub-form per category, all sharing the common fields
// (label/description/price/pricing-model) their parent renders around
// them — each returns just its own effect fields via onChange so the
// parent can spread them into the create payload without knowing their
// shape. Also renders the live preview (RocketPreview for a rocket,
// ShopItemIcon for everything else) so the admin sees exactly what a
// player will see before creating the item.
function AddShopItemForm({ onDone }: { onDone: () => void }) {
  const create = useCreateAdminShopItem();
  const [category, setCategory] = useState<(typeof SELLABLE_SHOP_CATEGORIES)[number]>("ROCKET_SHAPE");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [priceUsdt, setPriceUsdt] = useState("1.00");
  const [entitlementType, setEntitlementType] = useState<"USES" | "TIME_WINDOW">("USES");
  const [usesGranted, setUsesGranted] = useState("20");
  const [termDays, setTermDays] = useState("7");
  const [error, setError] = useState<string | null>(null);

  // Category-specific fields — only the ones relevant to the currently
  // selected category are ever read on submit.
  const [shapeKey, setShapeKey] = useState<RocketShapeKey>("ROCKET");
  const [colorHex, setColorHex] = useState(DEFAULT_COLOR);
  const [speedPct, setSpeedPct] = useState("10");
  const [livesBonus, setLivesBonus] = useState("1");
  const [magnetDurationBonusSec, setMagnetDurationBonusSec] = useState("2.5");
  const [magnetCooldownReductionSec, setMagnetCooldownReductionSec] = useState("4");
  const [fireExtraUses, setFireExtraUses] = useState("1");
  const [fireDurationBonusSec, setFireDurationBonusSec] = useState("3");
  const [shieldDurationBonusSec, setShieldDurationBonusSec] = useState("2");
  const [shieldCooldownReductionSec, setShieldCooldownReductionSec] = useState("5");

  const effectPreview = describeShopItemEffectPlainEnglish({
    category,
    speedMultBonus: category === "STAT_SPEED" ? Number(speedPct) / 100 : null,
    livesBonus: category === "STAT_HEALTH" ? Number(livesBonus) : null,
    magnetDurationBonusSec: category === "POWERUP_MAGNET" ? Number(magnetDurationBonusSec) : null,
    magnetCooldownDeltaSec: category === "POWERUP_MAGNET" ? -Number(magnetCooldownReductionSec) : null,
    fireExtraUses: category === "POWERUP_FIRE" ? Number(fireExtraUses) : null,
    fireDurationBonusSec: category === "POWERUP_FIRE" ? Number(fireDurationBonusSec) : null,
    shieldDurationBonusSec: category === "POWERUP_SHIELD" ? Number(shieldDurationBonusSec) : null,
    shieldCooldownDeltaSec: category === "POWERUP_SHIELD" ? -Number(shieldCooldownReductionSec) : null,
  });

  async function submit() {
    setError(null);
    if (!label.trim() || !description.trim()) {
      setError("Label and description are required.");
      return;
    }
    const common = {
      label: label.trim(),
      description: description.trim(),
      priceUsdt: Number(priceUsdt) || 0,
      entitlementType,
      usesGranted: entitlementType === "USES" ? Number(usesGranted) || 0 : null,
      termDays: entitlementType === "TIME_WINDOW" ? Number(termDays) || 0 : null,
    };
    const input: CreateShopItemInput =
      category === "ROCKET_SHAPE"
        ? { ...common, category, shapeKey, colorHex }
        : category === "STAT_SPEED"
          ? { ...common, category, speedPct: Number(speedPct) || 0 }
          : category === "STAT_HEALTH"
            ? { ...common, category, livesBonus: Number(livesBonus) || 0 }
            : category === "POWERUP_MAGNET"
              ? {
                  ...common,
                  category,
                  magnetDurationBonusSec: Number(magnetDurationBonusSec) || 0,
                  magnetCooldownReductionSec: Number(magnetCooldownReductionSec) || 0,
                }
              : category === "POWERUP_FIRE"
                ? { ...common, category, fireExtraUses: Number(fireExtraUses) || 0, fireDurationBonusSec: Number(fireDurationBonusSec) || 0 }
                : {
                    ...common,
                    category,
                    shieldDurationBonusSec: Number(shieldDurationBonusSec) || 0,
                    shieldCooldownReductionSec: Number(shieldCooldownReductionSec) || 0,
                  };
    try {
      await create.mutateAsync(input);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create item");
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-line bg-panel-2 p-3 sm:flex-row">
      <div className="flex shrink-0 flex-col items-center gap-2 sm:w-28">
        {category === "ROCKET_SHAPE" ? (
          <RocketPreview shapeKey={shapeKey} color={colorHex} size={88} />
        ) : (
          <ShopItemIcon category={category} size={88} />
        )}
        <p className="text-center text-[10px] text-muted">Live preview</p>
      </div>

      <div className="grid flex-1 gap-2 sm:grid-cols-2">
        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value as (typeof SELLABLE_SHOP_CATEGORIES)[number])} className={plainInputClass}>
            {SELLABLE_SHOP_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {SHOP_CATEGORY_META[c].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Label" hint='shown to players, e.g. "Comet Rocket"'>
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

        {category === "ROCKET_SHAPE" && (
          <>
            <Field label="Rocket shape" hint="the actual silhouette — a code-defined geometry, not editable here">
              <select value={shapeKey} onChange={(e) => setShapeKey(e.target.value as RocketShapeKey)} className={plainInputClass}>
                {ROCKET_SHAPES.map((s) => (
                  <option key={s} value={s}>
                    {ROCKET_SHAPE_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Color">
              <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-panel-2" />
            </Field>
          </>
        )}
        {category === "STAT_SPEED" && (
          <Field label="Top speed bonus (%)" hint="permanent for the whole match, e.g. 10 = +10%">
            <input type="number" min="1" max="200" value={speedPct} onChange={(e) => setSpeedPct(e.target.value)} className={plainInputClass} />
          </Field>
        )}
        {category === "STAT_HEALTH" && (
          <Field label="Extra starting lives">
            <input type="number" min="1" max="10" value={livesBonus} onChange={(e) => setLivesBonus(e.target.value)} className={plainInputClass} />
          </Field>
        )}
        {category === "POWERUP_MAGNET" && (
          <>
            <Field label="Extra duration (seconds)" hint="added to the base 5s Magnet duration">
              <input type="number" min="0" step="0.5" value={magnetDurationBonusSec} onChange={(e) => setMagnetDurationBonusSec(e.target.value)} className={plainInputClass} />
            </Field>
            <Field label="Cooldown reduction (seconds)" hint="shortens the base 14s Magnet cooldown">
              <input type="number" min="0" step="0.5" value={magnetCooldownReductionSec} onChange={(e) => setMagnetCooldownReductionSec(e.target.value)} className={plainInputClass} />
            </Field>
          </>
        )}
        {category === "POWERUP_FIRE" && (
          <>
            <Field label="Extra uses" hint="added to the base 1 use per match">
              <input type="number" min="0" value={fireExtraUses} onChange={(e) => setFireExtraUses(e.target.value)} className={plainInputClass} />
            </Field>
            <Field label="Extra duration (seconds)" hint="added to the base 10s Fire window, per use">
              <input type="number" min="0" step="0.5" value={fireDurationBonusSec} onChange={(e) => setFireDurationBonusSec(e.target.value)} className={plainInputClass} />
            </Field>
          </>
        )}
        {category === "POWERUP_SHIELD" && (
          <>
            <Field label="Extra duration (seconds)" hint="added to the base 4s Shield duration">
              <input type="number" min="0" step="0.5" value={shieldDurationBonusSec} onChange={(e) => setShieldDurationBonusSec(e.target.value)} className={plainInputClass} />
            </Field>
            <Field label="Cooldown reduction (seconds)" hint="shortens the base 16s Shield cooldown">
              <input type="number" min="0" step="0.5" value={shieldCooldownReductionSec} onChange={(e) => setShieldCooldownReductionSec(e.target.value)} className={plainInputClass} />
            </Field>
          </>
        )}

        {effectPreview && (
          <p className="sm:col-span-2 rounded-lg border border-gold/25 bg-gold-soft px-3 py-2 text-xs font-semibold text-gold">
            Effect: {effectPreview}
          </p>
        )}

        <button onClick={submit} disabled={create.isPending} className="btn-game hud-corner rounded-full px-4 py-1.5 text-xs disabled:opacity-50 sm:col-span-2 sm:w-fit">
          {create.isPending ? "Creating…" : "Create Item"}
        </button>
        {error && <p className="text-xs text-risk sm:col-span-2">{error}</p>}
      </div>
    </div>
  );
}

function ShopItemRow({ row }: { row: AdminShopItemRow }) {
  const update = useUpdateAdminShopItem();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(row.label);
  const [description, setDescription] = useState(row.description);
  const [priceUsdt, setPriceUsdt] = useState(String(row.priceUsdt));
  // Validity (days, TIME_WINDOW items) / matches included (USES items)
  // — editable per-item like price, see the PATCH route's own
  // doc-comment for why this is safe (a purchase already snapshots the
  // number it got at purchase time, so this only ever affects what a
  // NEW purchase gets). entitlementType itself stays fixed, so only
  // whichever one of these two actually applies to this row is shown.
  const [usesGranted, setUsesGranted] = useState(String(row.usesGranted ?? ""));
  const [termDays, setTermDays] = useState(String(row.termDays ?? ""));
  const [error, setError] = useState<string | null>(null);

  const pricingSummary =
    row.entitlementType === "USES" ? `${row.usesGranted ?? 0} matches` : `${row.termDays ?? 0}-day pass`;
  const effectSummary = describeShopItemEffectPlainEnglish(row);

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
        ...(row.entitlementType === "USES" ? { usesGranted: Number(usesGranted) || 0 } : { termDays: Number(termDays) || 0 }),
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  return (
    <div className="flex gap-3 rounded-xl border border-line bg-panel-2 p-3">
      <div className="shrink-0">
        {row.category === "ROCKET_SHAPE" ? (
          <RocketPreview shapeKey={row.shapeKey} color={row.colorHex ?? DEFAULT_COLOR} size={56} />
        ) : (
          <ShopItemIcon category={row.category} size={56} />
        )}
      </div>
      <div className="min-w-0 flex-1">
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
            {effectSummary && <p className="mt-1 text-xs font-semibold text-gold">{effectSummary}</p>}
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
            {row.entitlementType === "USES" ? (
              <Field label="Matches included">
                <input type="number" min="1" value={usesGranted} onChange={(e) => setUsesGranted(e.target.value)} className={plainInputClass} />
              </Field>
            ) : (
              <Field label="Validity (days)">
                <input type="number" min="1" value={termDays} onChange={(e) => setTermDays(e.target.value)} className={plainInputClass} />
              </Field>
            )}
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
    </div>
  );
}
