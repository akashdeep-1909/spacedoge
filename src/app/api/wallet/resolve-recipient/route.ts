import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

// GET /api/wallet/resolve-recipient?address=0x... — looks up a
// recipient's nickname (if any) before a user commits to a wallet-to-
// wallet transfer, so the confirm step can show "Sending to alice" (or
// the shortened address) instead of asking someone to trust a raw
// address string they just typed. Read-only, doesn't move anything.
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const address = request.nextUrl.searchParams.get("address")?.trim().toLowerCase() ?? "";
  if (!EVM_ADDRESS_REGEX.test(address)) {
    return NextResponse.json({ error: "Not a valid wallet address." }, { status: 400 });
  }
  if (address === session.address) {
    return NextResponse.json({ error: "You can't send to your own wallet." }, { status: 400 });
  }

  const recipient = await db.walletProfile.findUnique({
    where: { address },
    select: { address: true, nickname: true },
  });
  if (!recipient) {
    return NextResponse.json({ error: "No Space DOGE account found for that address." }, { status: 404 });
  }

  return NextResponse.json({ address: recipient.address, nickname: recipient.nickname });
}
