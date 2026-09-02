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
// GET /api/game-modes.
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
      enabled: r.enabled,
      sortOrder: r.sortOrder,
    })),
  });
}

// POST /api/admin/shop — creates a new catalog item. Phase 1 scope
// only: category is always ROCKET_SHAPE (the only category with real
// effect columns wired up so far — see src/lib/shop.ts's own doc-
// comment on SEED_DEFAULTS) and shapeKey must be one of the actual
// coded geometries in src/lib/shop-shared.ts's ROCKET_SHAPE_GEOMETRY —
// an admin can list a new SKU/price/pricing-model combo for an
// existing look, but can't invent a new silhouette from this form
// (that's a code change, not a data one). No delete endpoint exists —
// same "disable, never delete" rule as GameModeConfig, since a real
// WalletShopItem purchase has a required FK to this row; Disable in
// the admin UI already fully removes it from the player-facing
// catalog (GET /api/shop/catalog only returns enabled rows) without
// breaking anyone who already owns one.
const createSchema = z
  .object({
    shapeKey: z.enum(ROCKET_SHAPES),
    label: z.string().trim().min(1),
    description: z.string().trim().min(1),
    priceUsdt: z.number().positive(),
    entitlementType: z.enum(["USES", "TIME_WINDOW"]),
    usesGranted: z.number().int().positive().nullable().optional(),
    termDays: z.number().int().positive().nullable().optional(),
  })
  .refine((v) => (v.entitlementType === "USES" ? !!v.usesGranted : true), {
    message: "usesGranted is required for a USES-type item",
    path: ["usesGranted"],
  })
  .refine((v) => (v.entitlementType === "TIME_WINDOW" ? !!v.termDays : true), {
    message: "termDays is required for a TIME_WINDOW-type item",
    path: ["termDays"],
  });

function slugifyKey(label: string): string {
  const slug = label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  // A short random suffix, not a naming collision retry loop — `key`
  // only needs to be unique, never human-parsed, and this keeps
  // creation a single round trip even if two items share a label.
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ROCKET_${slug || "ITEM"}_${suffix}`;
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

  const created = await db.shopItemConfig.create({
    data: {
      key: slugifyKey(body.label),
      category: ShopItemCategory.ROCKET_SHAPE,
      label: body.label,
      description: body.description,
      priceUsdt: body.priceUsdt,
      entitlementType: body.entitlementType as ShopEntitlementType,
      usesGranted: body.entitlementType === "USES" ? body.usesGranted! : null,
      termDays: body.entitlementType === "TIME_WINDOW" ? body.termDays! : null,
      shapeKey: body.shapeKey,
      sortOrder,
    },
  });

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
      enabled: created.enabled,
      sortOrder: created.sortOrder,
    },
  });
}
