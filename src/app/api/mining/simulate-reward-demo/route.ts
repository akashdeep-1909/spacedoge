import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { BalanceType } from "@/generated/prisma/enums";

const bodySchema = z.object({
  amount: z.number().positive().max(1000),
});

// ⚠️ DEV-ONLY — SIMULATED, NOT A REAL WIN.
// Mining rig activation specifically requires Game Reward USDT (never
// Play USDT — doc 8.1's "activation cannot be paid directly from Play
// USDT" rule), which normally only comes from actually winning a
// settled match. This exists purely so the mining flow can be tested
// without playing a full skill-based match each time, same purpose as
// /api/wallet/deposit-demo for Play USDT. Blocked server-side in
// production, not just hidden client-side — real Game Reward USDT
// must only ever come from real match settlement.
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production." }, { status: 403 });
  }

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  await db.ledgerEntry.create({
    data: {
      walletProfileId: session.walletProfileId,
      balanceType: BalanceType.GAME_REWARD_USDT,
      amount: parsed.data.amount,
      reason: "demo_game_reward_simulated",
    },
  });

  return NextResponse.json({ ok: true, simulated: true });
}
