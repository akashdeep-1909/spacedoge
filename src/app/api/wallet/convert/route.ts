import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getWalletBalances } from "@/lib/balances";
import { BalanceType } from "@/generated/prisma/enums";
import { getDogeUsdtQuote, MIN_DOGE_CONVERSION } from "@/lib/conversion";

const bodySchema = z.object({
  dogeAmount: z.number().positive(),
});

// GET /api/wallet/convert — a fresh, time-limited quote (doc section
// 12.1 steps 10-11). Client shows this before the user confirms.
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const dogeAmount = Number(request.nextUrl.searchParams.get("dogeAmount") ?? "0");
  if (!Number.isFinite(dogeAmount) || dogeAmount <= 0) {
    return NextResponse.json({ error: "Invalid dogeAmount" }, { status: 400 });
  }

  return NextResponse.json(await getDogeUsdtQuote(dogeAmount));
}

// POST /api/wallet/convert — executes the conversion (doc section 12.1
// steps 12-13). The rate is re-quoted server-side, never trusted from
// the client, so a stale/tampered client quote can't be replayed.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { dogeAmount } = parsed.data;

  if (dogeAmount < MIN_DOGE_CONVERSION) {
    return NextResponse.json(
      { error: `Minimum conversion is ${MIN_DOGE_CONVERSION} DOGE.` },
      { status: 400 }
    );
  }

  const balances = await getWalletBalances(session.walletProfileId);
  if (balances.availableDoge < dogeAmount) {
    return NextResponse.json({ error: "Not enough Available DOGE." }, { status: 402 });
  }

  const quote = await getDogeUsdtQuote(dogeAmount);

  await db.$transaction(async (tx) => {
    await tx.ledgerEntry.create({
      data: {
        walletProfileId: session.walletProfileId,
        balanceType: BalanceType.AVAILABLE_DOGE,
        amount: -dogeAmount,
        reason: "doge_to_usdt_conversion",
      },
    });
    await tx.ledgerEntry.create({
      data: {
        walletProfileId: session.walletProfileId,
        balanceType: BalanceType.RECYCLED_USDT,
        amount: quote.finalUsdt,
        reason: "doge_to_usdt_conversion",
      },
    });
  });

  return NextResponse.json(quote);
}
