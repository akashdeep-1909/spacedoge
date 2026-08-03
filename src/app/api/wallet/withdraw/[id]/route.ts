import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getWithdrawChainConfig, resolveExplorerTxUrl } from "@/lib/settings";

// GET /api/wallet/withdraw/[id] — full detail for one of the caller's
// own withdrawals (the Coin/Network/Address/Amount/Fee/Hash page).
// Scoped to walletProfileId, same pattern as every other per-record
// wallet route — a withdrawal is never fetchable by anyone but the
// wallet that requested it.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const withdrawal = await db.withdrawal.findUnique({ where: { id } });
  if (!withdrawal || withdrawal.walletProfileId !== session.walletProfileId) {
    return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 });
  }

  const chainConfig = await getWithdrawChainConfig(withdrawal.chain);

  return NextResponse.json({
    id: withdrawal.id,
    source: withdrawal.balanceType,
    chain: withdrawal.chain,
    chainLabel: chainConfig?.label ?? withdrawal.chain,
    coinSymbol: chainConfig?.coinSymbol ?? "USDT",
    destinationAddress: withdrawal.destinationAddress,
    amount: Number(withdrawal.amount),
    networkFeeUsdt: withdrawal.networkFeeUsdt !== null ? Number(withdrawal.networkFeeUsdt) : null,
    status: withdrawal.status,
    txHash: withdrawal.txHash,
    explorerUrl:
      withdrawal.txHash && withdrawal.status === "COMPLETED"
        ? resolveExplorerTxUrl(withdrawal.chain, chainConfig?.explorerTxUrl, withdrawal.txHash)
        : null,
    createdAt: withdrawal.createdAt,
    completedAt: withdrawal.completedAt,
  });
}
