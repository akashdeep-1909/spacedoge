import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getWalletBalances } from "@/lib/balances";
import { BalanceType } from "@/generated/prisma/enums";
import { PTS_TO_USDT_RATE, MIN_PTS_CONVERSION } from "@/lib/game-config";

const bodySchema = z.object({
  ptsAmount: z.number().positive(),
});

// POST /api/wallet/convert-pts — manual, user-initiated PTS -> Game
// Reward USDT conversion at the fixed 1000:1 rate (v3 economy). Unlike
// the DOGE/USDT convert route, there's no external rate to quote/re-
// check — the rate is a fixed platform constant, so this executes
// directly instead of a separate quote-then-confirm step.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { ptsAmount } = parsed.data;

  if (ptsAmount < MIN_PTS_CONVERSION) {
    return NextResponse.json(
      { error: `Minimum conversion is ${MIN_PTS_CONVERSION} PTS.` },
      { status: 400 }
    );
  }

  const balances = await getWalletBalances(session.walletProfileId);
  if (balances.pts < ptsAmount) {
    return NextResponse.json({ error: "Not enough PTS." }, { status: 402 });
  }

  const usdtAmount = Math.round(ptsAmount * PTS_TO_USDT_RATE * 1e8) / 1e8;

  await db.$transaction(async (tx) => {
    await tx.ledgerEntry.create({
      data: {
        walletProfileId: session.walletProfileId,
        balanceType: BalanceType.PTS,
        amount: -ptsAmount,
        reason: "pts_to_gamereward_conversion",
      },
    });
    await tx.ledgerEntry.create({
      data: {
        walletProfileId: session.walletProfileId,
        balanceType: BalanceType.GAME_REWARD_USDT,
        amount: usdtAmount,
        reason: "pts_to_gamereward_conversion",
      },
    });
  });

  return NextResponse.json({ ptsAmount, usdtAmount, rate: PTS_TO_USDT_RATE });
}
