import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { lockWalletForBalanceChange, getLedgerBalance } from "@/lib/balances";
import { BalanceType } from "@/generated/prisma/enums";
import { ACTIVATION_PRICE_USDT, MINING_FUNDING_SOURCES } from "@/lib/mining-shared";
import { hasActivatedDashboard } from "@/lib/mining";

const bodySchema = z.object({
  source: z.enum(MINING_FUNDING_SOURCES).default("GAME_REWARD_USDT"),
});

// POST /api/mining/activate — v2 economy spec Part E/K, doc 6.1:
// "1 Game USDT activates the mining dashboard and virtual rig but does
// not include permanent hashrate." A one-time fee, decoupled from
// hashrate purchase (src/app/api/mining/purchase-power/route.ts) —
// this used to also grant free Starter-Rig hashrate directly, which
// contradicted that rule; fixed here.
// No wallet-source restriction — fundable from any of the same
// balances hashrate purchases already accept (MINING_FUNDING_SOURCES),
// not just Game Reward USDT.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { source } = parsed.data;

  // Cheap pre-check outside any lock, purely to fail fast for the
  // common case — the real, race-safe check happens again inside the
  // transaction below right before the debit.
  if (await hasActivatedDashboard(session.walletProfileId)) {
    return NextResponse.json({ error: "Mining dashboard already activated." }, { status: 409 });
  }

  // This route previously had no transaction at all — a single bare
  // ledgerEntry.create — which meant both the "already activated?"
  // check above and any balance check were fully unguarded: two
  // concurrent requests could both pass, both debit, and grant two
  // activations for one fee (or one activation for an unaffordable
  // balance). Now: lock first, then re-check both inside.
  const outcome = await db.$transaction(async (tx) => {
    await lockWalletForBalanceChange(tx, session.walletProfileId);

    if (await hasActivatedDashboard(session.walletProfileId, tx)) {
      return { kind: "already_activated" as const };
    }

    const available = await getLedgerBalance(tx, session.walletProfileId, source as BalanceType);
    if (available < ACTIVATION_PRICE_USDT) return { kind: "insufficient" as const };

    await tx.ledgerEntry.create({
      data: {
        walletProfileId: session.walletProfileId,
        balanceType: source as BalanceType,
        amount: -ACTIVATION_PRICE_USDT,
        reason: "rig_activation_fee",
      },
    });
    return { kind: "activated" as const };
  });

  if (outcome.kind === "already_activated") {
    return NextResponse.json({ error: "Mining dashboard already activated." }, { status: 409 });
  }
  if (outcome.kind === "insufficient") {
    return NextResponse.json({ error: "Not enough balance for that source." }, { status: 402 });
  }

  return NextResponse.json({ activated: true });
}
