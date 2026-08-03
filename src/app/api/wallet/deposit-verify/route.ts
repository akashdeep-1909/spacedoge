import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { verifyDepositByTxHash } from "@/lib/deposits";

const bodySchema = z.object({ txHash: z.string().min(1), chainKey: z.string().min(1) });

const MESSAGE: Record<string, string> = {
  invalid_hash: "That doesn't look like a transaction hash.",
  not_configured: "That deposit chain isn't configured yet — please check back soon.",
  rpc_error: "Couldn't reach the blockchain right now — try again in a minute.",
  not_found: "We couldn't find that transaction yet. If you just sent it, wait a bit for it to be mined/confirmed and try again.",
  failed_tx: "That transaction failed on-chain (reverted) — no funds were transferred.",
  no_matching_transfer: "That transaction doesn't contain a USDT transfer to our treasury address on this chain. Double-check the hash, the chain you selected, and that you sent the right asset.",
  sent_from_different_wallet:
    "That transaction wasn't sent from your connected wallet, so it can't be auto-credited. If you sent it from an exchange or a different wallet, contact support with this transaction hash.",
  tron_needs_manual_review:
    "Found it on-chain — it's a real transfer to our treasury address. Tron deposits can't self-credit yet (we don't have a way to link a Tron wallet to your account), so an admin will review and credit it manually. It won't appear in Recent Deposits below until that happens — contact support with this transaction hash if it's been a while.",
};

// POST /api/wallet/deposit-verify — the user-facing, on-demand
// counterpart to the background watcher: paste a tx hash, get an
// immediate on-chain lookup and (if it's a real, matching, sufficiently
// confirmed transfer from your own wallet) an instant credit, instead
// of waiting for the next lazy poll. `chainKey` selects which
// configured deposit chain to check the hash against.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const result = await verifyDepositByTxHash(parsed.data.txHash, session.walletProfileId, parsed.data.chainKey);

  if (result.status === "credited" || result.status === "pending") {
    return NextResponse.json(result);
  }

  return NextResponse.json({ status: result.status, error: MESSAGE[result.status] }, { status: 200 });
}
