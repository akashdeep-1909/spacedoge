import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { sendToWallet, isTransferableToOtherUserBalanceType, TransferError } from "@/lib/transfers";

const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

const bodySchema = z.object({
  toAddress: z.string().regex(EVM_ADDRESS_REGEX, "Not a valid wallet address."),
  balanceType: z.string(),
  amount: z.number().positive(),
  note: z.string().max(140).optional(),
});

// POST /api/wallet/transfer-to-user — sends Recycled/Referral USDT to a
// DIFFERENT wallet's same balance. See src/lib/transfers.ts's
// sendToWallet doc-comment for why this is scoped narrower than the
// same-wallet /api/wallet/transfer (no PLAY_USDT, real recipient
// required, no reversal once sent — same "irreversible the moment it's
// committed" rule every ledger action in this app already follows).
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { toAddress, balanceType, amount, note } = parsed.data;

  if (!isTransferableToOtherUserBalanceType(balanceType)) {
    return NextResponse.json({ error: "This balance type can't be sent to another user." }, { status: 400 });
  }

  try {
    const result = await sendToWallet({
      fromWalletProfileId: session.walletProfileId,
      toAddress,
      balanceType,
      amount,
      note,
    });
    return NextResponse.json({
      transferId: result.transfer.id,
      recipientAddress: result.recipientAddress,
      recipientNickname: result.recipientNickname,
      amount,
      balanceType,
    });
  } catch (err) {
    if (err instanceof TransferError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
