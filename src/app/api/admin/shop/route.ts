import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin";
import { db } from "@/lib/db";
import { getShopItemConfigs } from "@/lib/shop";
import { ROCKET_SHAPES } from "@/lib/shop-shared";
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

// POST /api/admin/shop — creates a new catalog item, one variant per
// sellable category (a discriminated union on `category` — each
// variant only requires the fields that category actually uses, same
// spirit as GameModeConfig's own per-mode admin form). Common to every
// variant: label/description/price/pricing-model, validated by the
// same usesGranted/termDays refine every category shares.
//
// magnetCooldownReductionSec/shieldCooldownReductionSec are admin-
// facing POSITIVE numbers ("shorten the cooldown by this many
// seconds") — negated below into the actual stored
// magnetCooldownDeltaSec/shieldCooldownDeltaSec columns (negative =
// shorter cooldown, per those columns' own doc-comment in
// schema.prisma) so an admin never has to type a negative number to
// mean "better."
//
// No delete endpoint exists — same "disable, never delete" rule as
// GameModeConfig, since a real WalletShopItem purchase has a required
// FK to this row; Disable in the admin UI already fully removes it
// from the player-facing catalog (GET /api/shop/catalog only returns
// enabled rows) without breaking anyone who already owns one. Every
// effect column is immutable once created (see PATCH /api/admin/shop/
// [id]'s own doc-comment) for the same reason.
const baseFields = {
  label: z.string().trim().min(1),
  description: z.string().trim().min(1),
  priceUsdt: z.number().positive(),
  entitlementType: z.enum(["USES", "TIME_WINDOW"]),
  usesGranted: z.number().int().positive().nullable().optional(),
  termDays: z.number().int().positive().nullable().optional(),
};

// Exported so scripts/smoke-test-shop-phase2.ts can assert each
// category's own required-fields shape directly, the same way this
// route enforces it, without needing a real admin session cookie.
export const createSchema = z
  .discriminatedUnion("category", [
    z.object({
      category: z.literal("ROCKET_SHAPE"),
      shapeKey: z.enum(ROCKET_SHAPES),
      colorHex: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "colorHex must be a 6-digit hex color, e.g. #f4c15d"),
      ...baseFields,
    }),
    z.object({
      category: z.literal("STAT_SPEED"),
      // A whole-number percent (e.g. 10 => +10% top speed) — stored as
      // the fraction speedMultBonus expects (0.10).
      speedPct: z.number().positive().max(200),
      ...baseFields,
    }),
    z.object({
      category: z.literal("STAT_HEALTH"),
      livesBonus: z.number().int().positive().max(10),
      ...baseFields,
    }),
    z.object({
      category: z.literal("POWERUP_MAGNET"),
      magnetDurationBonusSec: z.number().min(0).max(60),
      magnetCooldownReductionSec: z.number().min(0).max(30),
      ...baseFields,
    }),
    z.object({
      category: z.literal("POWERUP_FIRE"),
      fireExtraUses: z.number().int().min(0).max(10),
      fireDurationBonusSec: z.number().min(0).max(60),
      ...baseFields,
    }),
    z.object({
      category: z.literal("POWERUP_SHIELD"),
      shieldDurationBonusSec: z.number().min(0).max(60),
      shieldCooldownReductionSec: z.number().min(0).max(30),
      ...baseFields,
    }),
  ])
  .refine((v) => (v.entitlementType === "USES" ? !!v.usesGranted : true), {
    message: "usesGranted is required for a USES-type item",
    path: ["usesGranted"],
  })
  .refine((v) => (v.entitlementType === "TIME_WINDOW" ? !!v.termDays : true), {
    message: "termDays is required for a TIME_WINDOW-type item",
    path: ["termDays"],
  });

const KEY_PREFIX: Record<z.infer<typeof createSchema>["category"], string> = {
  ROCKET_SHAPE: "ROCKET",
  STAT_SPEED: "SPEED",
  STAT_HEALTH: "HEALTH",
  POWERUP_MAGNET: "MAGNET",
  POWERUP_FIRE: "FIRE",
  POWERUP_SHIELD: "SHIELD",
};

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

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const body = parsed.data;

  await getShopItemConfigs(); // ensure the seed row set exists before computing sortOrder below
  const sortOrder = await db.shopItemConfig.count();

  const shared = {
    key: slugifyKey(KEY_PREFIX[body.category], body.label),
    category: body.category as ShopItemCategory,
    label: body.label,
    description: body.description,
    priceUsdt: body.priceUsdt,
    entitlementType: body.entitlementType as ShopEntitlementType,
    usesGranted: body.entitlementType === "USES" ? body.usesGranted! : null,
    termDays: body.entitlementType === "TIME_WINDOW" ? body.termDays! : null,
    sortOrder,
  };

  const effectFields =
    body.category === "ROCKET_SHAPE"
      ? { shapeKey: body.shapeKey, colorHex: body.colorHex }
      : body.category === "STAT_SPEED"
        ? { speedMultBonus: body.speedPct / 100 }
        : body.category === "STAT_HEALTH"
          ? { livesBonus: body.livesBonus }
          : body.category === "POWERUP_MAGNET"
            ? {
                magnetDurationBonusSec: body.magnetDurationBonusSec,
                magnetCooldownDeltaSec: -body.magnetCooldownReductionSec,
              }
            : body.category === "POWERUP_FIRE"
              ? { fireExtraUses: body.fireExtraUses, fireDurationBonusSec: body.fireDurationBonusSec }
              : { shieldDurationBonusSec: body.shieldDurationBonusSec, shieldCooldownDeltaSec: -body.shieldCooldownReductionSec };

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
