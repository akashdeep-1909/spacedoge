import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getShopItemConfigs } from "@/lib/shop";
import { getShopEnabled } from "@/lib/settings";

// GET /api/shop/catalog — every enabled shop item, for the Shop page
// and the pre-match loadout picker. Auth-gated (same as every other
// wallet-facing read in this app) even though the data itself isn't
// wallet-specific, simply because there's no public/logged-out shop
// browsing flow in this app.
//
// When an admin has switched the whole shop off (PlatformSettings.
// shopEnabled), this returns an empty catalog + shopEnabled:false
// rather than a 403 — same "return empty, let the client check"
// pattern GET /api/docs uses for docsMenuEnabled — so the Shop page
// can render a real "closed" state instead of an error, while GET
// /api/shop/inventory (a separate route, never gated by this) keeps
// working so already-owned items stay usable.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const shopEnabled = await getShopEnabled();
  if (!shopEnabled) {
    return NextResponse.json({ items: [], shopEnabled: false });
  }

  const configs = await getShopItemConfigs({ enabledOnly: true });
  return NextResponse.json({
    shopEnabled: true,
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
      colorHex: c.colorHex,
      speedMultBonus: c.speedMultBonus !== null ? Number(c.speedMultBonus) : null,
      livesBonus: c.livesBonus,
      magnetDurationBonusSec: c.magnetDurationBonusSec !== null ? Number(c.magnetDurationBonusSec) : null,
      magnetCooldownDeltaSec: c.magnetCooldownDeltaSec !== null ? Number(c.magnetCooldownDeltaSec) : null,
      fireExtraUses: c.fireExtraUses,
      fireDurationBonusSec: c.fireDurationBonusSec !== null ? Number(c.fireDurationBonusSec) : null,
      shieldDurationBonusSec: c.shieldDurationBonusSec !== null ? Number(c.shieldDurationBonusSec) : null,
      shieldCooldownDeltaSec: c.shieldCooldownDeltaSec !== null ? Number(c.shieldCooldownDeltaSec) : null,
    })),
  });
}
