import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getShopItemConfigs } from "@/lib/shop";

// GET /api/shop/catalog — every enabled shop item, for the Shop page
// and the pre-match loadout picker. Auth-gated (same as every other
// wallet-facing read in this app) even though the data itself isn't
// wallet-specific, simply because there's no public/logged-out shop
// browsing flow in this app.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const configs = await getShopItemConfigs({ enabledOnly: true });
  return NextResponse.json({
    items: configs.map((c) => ({
      id: c.id,
      key: c.key,
      category: c.category,
      label: c.label,
      description: c.description,
      priceUsdt: Number(c.priceUsdt),
      entitlementType: c.entitlementType,
      usesGranted: c.usesGranted,
      termDays: c.termDays,
      shapeKey: c.shapeKey,
    })),
  });
}
