import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { BalanceType } from "@/generated/prisma/enums";

const bodySchema = z.object({
  amount: z.number().positive().max(1000),
});

// POST /api/wallet/deposit-demo
//
// ⚠️ DEV-ONLY — SIMULATED, NOT A REAL DEPOSIT.
// The real deposit path (src/lib/deposits.ts) watches on-chain transfers
// to a real treasury address per configured chain and credits Play USDT
// only once a real, sufficiently-confirmed transfer is seen — see
// /dashboard/deposit and /api/wallet/deposit-address. This endpoint
// exists purely so the rest of the product (play → win → activate rig
// → mine) can be tested and demoed without a real on-chain transfer
// every time, same purpose as /api/mining/simulate-reward-demo for
// Game Reward USDT — it's what every smoke-test script in scripts/
// uses to fund a test wallet's Play USDT. Blocked server-side in
// production, not just unreachable from the UI (no component calls it
// today either) — real Play USDT must only ever come from a real,
// verified on-chain deposit.
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
      balanceType: BalanceType.PLAY_USDT,
      amount: parsed.data.amount,
      reason: "demo_deposit_simulated",
    },
  });

  return NextResponse.json({ ok: true, simulated: true });
}
