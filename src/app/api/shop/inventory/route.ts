import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

// GET /api/shop/inventory — the caller's own owned shop items, for
// "My Items" and the pre-match loadout picker. `isUsable` is computed
// here on read (active AND not expired AND uses remaining, if either
// applies) rather than relying solely on the stored `active` column —
// there's no cron/background job in this stack (confirmed elsewhere
// this session, e.g. src/lib/lobby.ts's own "lazy expiry" comment) to
// flip `active` false the instant a TIME_WINDOW item's expiresAt
// passes, so a stale `active: true` row would otherwise still look
// purchasable here for a wallet that hasn't touched the app since it
// expired. The stored `active` flag itself only gets updated lazily,
// at the point something actually tries to consume the item (match
// creation) — this read just tells the truth regardless of whether
// that lazy update has happened yet.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const items = await db.walletShopItem.findMany({
    where: { walletProfileId: session.walletProfileId },
    orderBy: { createdAt: "desc" },
    include: { shopItemConfig: { select: { label: true, key: true } } },
  });

  const now = new Date();
  return NextResponse.json({
    items: items.map((item) => {
      const notExpired = item.expiresAt === null || item.expiresAt > now;
      const hasUses = item.usesRemaining === null || item.usesRemaining > 0;
      return {
        id: item.id,
        label: item.shopItemConfig.label,
        configKey: item.shopItemConfig.key,
        category: item.category,
        entitlementType: item.entitlementType,
        shapeKey: item.shapeKey,
        colorHex: item.colorHex,
        speedMultBonus: item.speedMultBonus !== null ? Number(item.speedMultBonus) : null,
        livesBonus: item.livesBonus,
        magnetDurationBonusSec: item.magnetDurationBonusSec !== null ? Number(item.magnetDurationBonusSec) : null,
        magnetCooldownDeltaSec: item.magnetCooldownDeltaSec !== null ? Number(item.magnetCooldownDeltaSec) : null,
        fireExtraUses: item.fireExtraUses,
        fireDurationBonusSec: item.fireDurationBonusSec !== null ? Number(item.fireDurationBonusSec) : null,
        shieldDurationBonusSec: item.shieldDurationBonusSec !== null ? Number(item.shieldDurationBonusSec) : null,
        shieldCooldownDeltaSec: item.shieldCooldownDeltaSec !== null ? Number(item.shieldCooldownDeltaSec) : null,
        usesRemaining: item.usesRemaining,
        startsAt: item.startsAt,
        expiresAt: item.expiresAt,
        isUsable: item.active && notExpired && hasUses,
        createdAt: item.createdAt,
      };
    }),
  });
}
