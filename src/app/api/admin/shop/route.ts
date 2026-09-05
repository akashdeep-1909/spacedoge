import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { getShopItemConfigs } from "@/lib/shop";
import { createShopItemSchema, SHOP_ITEM_KEY_PREFIX } from "@/lib/shopAdminSchema";
import { ShopItemCategory, ShopEntitlementType } from "@/generated/prisma/enums";

// GET /api/admin/shop — every shop catalog item, enabled or not (unlike
// the player-facing GET /api/shop/catalog, which only returns enabled
// rows). Same split as GET /api/admin/settings/game-modes vs
// GET /api/game-modes. Every effect column is included regardless of
// category (null for whichever ones don't apply) so the admin list can
// render a live preview + plain-English effect summary per row without
// a second round trip.
export async function GET() {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const rows = await getShopItemConfigs();
  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      key: r.key,
      category: r.category,
      label: r.label,
      description: r.description,
      priceUsdt: Number(r.priceUsdt),
      entitlementType: r.entitlementType,
      usesGranted: r.usesGranted,
      termDays: r.termDays,
      shapeKey: r.shapeKey,
      colorHex: r.colorHex,
      speedMultBonus: r.speedMultBonus !== null ? Number(r.speedMultBonus) : null,
      livesBonus: r.livesBonus,
      magnetDurationBonusSec: r.magnetDurationBonusSec !== null ? Number(r.magnetDurationBonusSec) : null,
      magnetCooldownDeltaSec: r.magnetCooldownDeltaSec !== null ? Number(r.magnetCooldownDeltaSec) : null,
      fireExtraUses: r.fireExtraUses,
      fireDurationBonusSec: r.fireDurationBonusSec !== null ? Number(r.fireDurationBonusSec) : null,
      shieldDurationBonusSec: r.shieldDurationBonusSec !== null ? Number(r.shieldDurationBonusSec) : null,
      shieldCooldownDeltaSec: r.shieldCooldownDeltaSec !== null ? Number(r.shieldCooldownDeltaSec) : null,
      enabled: r.enabled,
      sortOrder: r.sortOrder,
    })),
  });
}

// POST /api/admin/shop — creates a new catalog item using
// createShopItemSchema (src/lib/shopAdminSchema.ts — see that file's
// own doc-comment for the full validation shape and why it isn't
// defined inline here).
//
// No delete endpoint exists — same "disable, never delete" rule as
// GameModeConfig, since a real WalletShopItem purchase has a required
// FK to this row; Disable in the admin UI already fully removes it
// from the player-facing catalog (GET /api/shop/catalog only returns
// enabled rows) without breaking anyone who already owns one. Every
// effect column is immutable once created (see PATCH /api/admin/shop/
// [id]'s own doc-comment) for the same reason.
function slugifyKey(prefix: string, label: string): string {
  const slug = label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  // A short random suffix, not a naming collision retry loop — `key`
  // only needs to be unique, never human-parsed, and this keeps
  // creation a single round trip even if two items share a label.
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}_${slug || "ITEM"}_${suffix}`;
}

export async function POST(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const parsed = createShopItemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const body = parsed.data;

  await getShopItemConfigs(); // ensure the seed row set exists before computing sortOrder below
  const sortOrder = await db.shopItemConfig.count();

  const shared = {
    key: slugifyKey(SHOP_ITEM_KEY_PREFIX[body.category], body.label),
    category: body.category as ShopItemCategory,
    label: body.label,
    description: body.description,
    priceUsdt: body.priceUsdt,
    entitlementType: body.entitlementType as ShopEntitlementType,
    usesGranted: body.entitlementType === "USES" ? body.usesGranted! : null,
    termDays: body.entitlementType === "TIME_WINDOW" ? body.termDays! : null,
    sortOrder,
  };

  let effectFields: Record<string, unknown>;
  switch (body.category) {
    case "ROCKET_SHAPE":
      effectFields = { shapeKey: body.shapeKey, colorHex: body.colorHex };
      break;
    case "STAT_SPEED":
      effectFields = { speedMultBonus: body.speedPct / 100 };
      break;
    case "STAT_HEALTH":
      effectFields = { livesBonus: body.livesBonus };
      break;
    case "POWERUP_MAGNET":
      effectFields = {
        magnetDurationBonusSec: body.magnetDurationBonusSec,
        magnetCooldownDeltaSec: -body.magnetCooldownReductionSec,
      };
      break;
    case "POWERUP_FIRE":
      effectFields = { fireExtraUses: body.fireExtraUses, fireDurationBonusSec: body.fireDurationBonusSec };
      break;
    case "POWERUP_SHIELD":
      effectFields = { shieldDurationBonusSec: body.shieldDurationBonusSec, shieldCooldownDeltaSec: -body.shieldCooldownReductionSec };
      break;
    case "RENTAL_BOT":
      // No effect columns at all — a pure boolean capability.
      effectFields = {};
      break;
  }

  const created = await db.shopItemConfig.create({ data: { ...shared, ...effectFields } });

  return NextResponse.json({
    row: {
      id: created.id,
      key: created.key,
      category: created.category,
      label: created.label,
      description: created.description,
      priceUsdt: Number(created.priceUsdt),
      entitlementType: created.entitlementType,
      usesGranted: created.usesGranted,
      termDays: created.termDays,
      shapeKey: created.shapeKey,
      colorHex: created.colorHex,
      speedMultBonus: created.speedMultBonus !== null ? Number(created.speedMultBonus) : null,
      livesBonus: created.livesBonus,
      magnetDurationBonusSec: created.magnetDurationBonusSec !== null ? Number(created.magnetDurationBonusSec) : null,
      magnetCooldownDeltaSec: created.magnetCooldownDeltaSec !== null ? Number(created.magnetCooldownDeltaSec) : null,
      fireExtraUses: created.fireExtraUses,
      fireDurationBonusSec: created.fireDurationBonusSec !== null ? Number(created.fireDurationBonusSec) : null,
      shieldDurationBonusSec: created.shieldDurationBonusSec !== null ? Number(created.shieldDurationBonusSec) : null,
      shieldCooldownDeltaSec: created.shieldCooldownDeltaSec !== null ? Number(created.shieldCooldownDeltaSec) : null,
      enabled: created.enabled,
      sortOrder: created.sortOrder,
    },
  });
}
