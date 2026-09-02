import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { getShopItemConfigs } from "@/lib/shop";

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
