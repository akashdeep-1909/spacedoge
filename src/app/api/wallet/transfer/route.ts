import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { moveBalance, isTransferableBalanceType, TransferError } from "@/lib/transfers";

const bodySchema = z.object({
  fromBalanceType: z.string(),
  toBalanceType: z.string(),
  amount: z.number().positive(),
});

// POST /api/wallet/transfer — moves USDT between two of the caller's
// own balance buckets (Play/Recycled/Referral). No counterparty, no
// blockchain transaction, instant — same as any other internal
// conversion this app already does. See src/lib/transfers.ts for
// exactly which balances are eligible and the Play-USDT-receive-only
// rule.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { fromBalanceType, toBalanceType, amount } = parsed.data;

  if (!isTransferableBalanceType(fromBalanceType) || !isTransferableBalanceType(toBalanceType)) {
    return NextResponse.json({ error: "This balance type can't be transferred." }, { status: 400 });
  }

  try {
    const transfer = await moveBalance({
      walletProfileId: session.walletProfileId,
      fromBalanceType,
      toBalanceType,
      amount,
    });
    return NextResponse.json({ transfer });
  } catch (err) {
    if (err instanceof TransferError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
