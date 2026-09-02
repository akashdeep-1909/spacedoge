import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { lockWalletForBalanceChange, getLedgerBalance } from "@/lib/balances";
import { BalanceType } from "@/generated/prisma/enums";
import { MINING_FUNDING_SOURCES } from "@/lib/mining-shared";
import { getShopItemConfig, pickEffectFields } from "@/lib/shop";

const bodySchema = z.object({
  shopItemConfigId: z.string().min(1),
  // Same funding-source allowlist mining hashrate purchases already
  // use (src/app/api/mining/purchase-power/route.ts) — confirmed as
  // the intended reuse in the shop plan, no new balance-source
  // restriction for gameplay/cosmetic shop items.
  source: z.enum(MINING_FUNDING_SOURCES).default("GAME_REWARD_USDT"),
});

// POST /api/shop/purchase — buys one Coin Rush Shop item (Phase 1:
// cosmetic rocket shapes only; later phases add STAT_SPEED/POWERUP_*/
// EXTRA_TIME catalog entries with zero changes needed here, since the
// effect-field snapshot below already copies every column regardless
// of category). Modeled tightly on src/app/api/mining/purchase-power/
// route.ts: single locked transaction, balance re-checked inside the
// lock, a real ledger debit, then a durable owned-item row.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { shopItemConfigId, source } = parsed.data;

  const cfg = await getShopItemConfig(shopItemConfigId);
  if (!cfg || !cfg.enabled) return NextResponse.json({ error: "That item isn't available." }, { status: 404 });

  const priceUsdt = Number(cfg.priceUsdt);
  const now = new Date();
  const startsAt = cfg.entitlementType === "TIME_WINDOW" ? now : null;
  const expiresAt =
    cfg.entitlementType === "TIME_WINDOW" && cfg.termDays
      ? new Date(now.getTime() + cfg.termDays * 24 * 60 * 60 * 1000)
      : null;
  const usesRemaining = cfg.entitlementType === "USES" ? cfg.usesGranted : null;

  // Single lock — unlike mining's purchase-power route, there's no
  // shared scarce resource here (no fleet-capacity-style global cap on
  // shop items), so only the wallet's own balance needs guarding — see
  // lockWalletForBalanceChange's own ordering-rule doc-comment in
  // src/lib/balances.ts for why a global lock would need to come
  // first if one were ever needed here too.
  const outcome = await db.$transaction(async (tx) => {
    await lockWalletForBalanceChange(tx, session.walletProfileId);

    const available = await getLedgerBalance(tx, session.walletProfileId, source as BalanceType);
    if (available < priceUsdt) return { kind: "insufficient" as const };

    await tx.ledgerEntry.create({
      data: {
        walletProfileId: session.walletProfileId,
        balanceType: source as BalanceType,
        amount: -priceUsdt,
        reason: "shop_item_purchase",
        refType: "ShopItemConfig",
        refId: cfg.id,
      },
    });

    const item = await tx.walletShopItem.create({
      data: {
        walletProfileId: session.walletProfileId,
        shopItemConfigId: cfg.id,
        category: cfg.category,
        entitlementType: cfg.entitlementType,
        pricePaidUsdt: priceUsdt,
        usesRemaining,
        startsAt,
        expiresAt,
        // Snapshotted at purchase time — a later admin catalog edit
        // never retroactively changes what this wallet already
        // bought, same discipline MiningContract.pricePaidUsdt/
        // targetRoiPct already uses.
        ...pickEffectFields(cfg),
      },
    });
    return { kind: "purchased" as const, item };
  });

  if (outcome.kind === "insufficient") {
    return NextResponse.json({ error: "Not enough balance for that source." }, { status: 402 });
  }

  return NextResponse.json({
    id: outcome.item.id,
    category: outcome.item.category,
    shapeKey: outcome.item.shapeKey,
    entitlementType: outcome.item.entitlementType,
    usesRemaining: outcome.item.usesRemaining,
    expiresAt: outcome.item.expiresAt,
  });
}
