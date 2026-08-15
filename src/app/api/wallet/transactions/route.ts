import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { shortenWalletAddress } from "@/lib/game-config";
import { BALANCE_TRANSFER_REASON, TRANSFER_REF_TYPE, USER_TRANSFER_SENT_REASON, USER_TRANSFER_RECEIVED_REASON } from "@/lib/transfers";
import en from "@/lib/i18n/translations/en";

// Sourced directly from the EN translations object (a plain data
// module, safe to import server-side) instead of a hand-duplicated
// table — a second hardcoded copy of these names previously drifted
// out of sync with the real display names (e.g. still said "Play USDT"
// and "Recycled USDT" here after the balance cards elsewhere had
// already been renamed to "Deposit USDT" and "Mining Earnings"),
// producing "Transfer: Recycled USDT → Play USDT" rows next to balance
// cards showing the new names. This endpoint has never been localized
// (every REASON_LABEL below is English-only too), so EN is the correct
// single source of truth to read from, not a full i18n rewire.
const BALANCE_TYPE_SHORT: Record<string, string> = {
  PLAY_USDT: en.dashboardHome.playUsdt,
  GAME_REWARD_USDT: en.dashboardHome.gameRewardUsdt,
  RECYCLED_USDT: en.wallet.recycledUsdtLabel,
  REFERRAL_USDT: en.dashboardHome.referralUsdt,
  PTS: en.wallet.ptsLabel,
  PENDING_DOGE: en.dashboardHome.pendingDoge,
  AVAILABLE_DOGE: en.dashboardHome.availableDoge,
};
function balanceTypeShort(balanceType: string): string {
  return BALANCE_TYPE_SHORT[balanceType] ?? balanceType.replaceAll("_", " ");
}

// One human label per ledger `reason` code — every real transaction
// type this platform has today.
const REASON_LABEL: Record<string, string> = {
  admin_manual_credit: "Admin Adjustment",
  balance_transfer: "Balance Transfer",
  bep20_usdt_deposit: "Deposit (BEP20 USDT)",
  bep20_usdt_deposit_manual: "Deposit (BEP20 USDT, manual)",
  demo_deposit_simulated: "Deposit (dev simulated)",
  demo_game_reward_simulated: "Game Reward Credit (dev simulated)",
  doge_to_usdt_conversion: "DOGE → USDT Conversion",
  match_entry: "Match Entry Fee",
  match_entry_hold: "Match Entry (Reserved)",
  match_entry_hold_release: "Match Entry Refunded",
  match_settlement: "Match Reward (PTS)",
  match_unused_prize_surplus: "Unused Prize Pool (Treasury)",
  mining_epoch_allocation: "Mining Payout",
  mining_power_purchase: "Hashrate Purchase",
  platform_fee: "Platform Fee",
  pts_to_gamereward_conversion: "PTS → USDT Conversion",
  referral_l1: "Referral Commission (L1)",
  referral_l2: "Referral Commission (L2)",
  rig_activation: "Mining Activation Fee",
  rig_activation_fee: "Mining Activation Fee",
  weekly_leaderboard_payout: "Weekly Leaderboard Prize",
  withdrawal_demo_simulated: "Withdrawal",
  withdrawal_requested: "Withdrawal Requested",
  // Fallback labels only — both normally get replaced by the combined
  // row built below. Only shown if a pair somehow ends up incomplete
  // (e.g. a manual DB edit), so this transaction isn't silently dropped.
  wallet_transfer_sent: "Sent to User",
  wallet_transfer_received: "Received from User",
};

// GET /api/wallet/transactions — every ledger entry for this wallet in
// one chronological feed, across every balance type, with a human
// label. The tabbed /dashboard/history view slices this same ledger by
// category; this is the same source of truth shown as one unified feed
// instead, for "what happened to my money, in order."
//
// Two kinds of ledger pair get collapsed into ONE row here instead of
// showing as separate credit/debit lines — see src/lib/transfers.ts's
// TRANSFER_REF_TYPE doc-comment for why both share that refType:
//   - Same-wallet moveBalance() — BOTH rows of the pair belong to this
//     wallet (in `entries` already), so they're grouped by refId
//     directly and shown as "Play USDT → Recycled USDT".
//   - Cross-wallet sendToWallet() — only ONE row of the pair belongs to
//     this wallet (the other is the counterparty's, never fetched here
//     at all — showing a stranger's unrelated ledger row would be a
//     real privacy leak). The counterparty's identity instead comes
//     from the InternalTransfer row itself, looked up by refId, shown
//     as "Sent to alice" / "Received from 0x1234...5678".
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const entries = await db.ledgerEntry.findMany({
    where: { walletProfileId: session.walletProfileId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const crossWalletRefIds = [
    ...new Set(
      entries
        .filter(
          (e) =>
            e.refType === TRANSFER_REF_TYPE &&
            (e.reason === USER_TRANSFER_SENT_REASON || e.reason === USER_TRANSFER_RECEIVED_REASON) &&
            e.refId
        )
        .map((e) => e.refId!)
    ),
  ];
  const internalTransfers = crossWalletRefIds.length
    ? await db.internalTransfer.findMany({
        where: { id: { in: crossWalletRefIds } },
        include: {
          fromWalletProfile: { select: { address: true, nickname: true } },
          toWalletProfile: { select: { address: true, nickname: true } },
        },
      })
    : [];
  const transferById = new Map(internalTransfers.map((t) => [t.id, t]));

  const rows: { id: string; label: string; balanceType: string; amount: number; createdAt: Date; reason: string }[] = [];
  const emittedSameWalletRefIds = new Set<string>();

  for (const e of entries) {
    if (e.refType === TRANSFER_REF_TYPE && e.reason === BALANCE_TRANSFER_REASON && e.refId) {
      if (emittedSameWalletRefIds.has(e.refId)) continue; // this pair's row was already emitted
      const pair = entries.filter((x) => x.refId === e.refId && x.reason === BALANCE_TRANSFER_REASON);
      const debit = pair.find((x) => Number(x.amount) < 0);
      const credit = pair.find((x) => Number(x.amount) > 0);
      if (debit && credit) {
        emittedSameWalletRefIds.add(e.refId);
        rows.push({
          id: e.refId,
          label: `Transfer: ${balanceTypeShort(debit.balanceType)} → ${balanceTypeShort(credit.balanceType)}`,
          balanceType: credit.balanceType,
          amount: Number(credit.amount),
          createdAt: e.createdAt,
          reason: BALANCE_TRANSFER_REASON,
        });
        continue;
      }
      // Unpaired (shouldn't happen) — fall through to the default row below.
    }

    if (
      e.refType === TRANSFER_REF_TYPE &&
      (e.reason === USER_TRANSFER_SENT_REASON || e.reason === USER_TRANSFER_RECEIVED_REASON) &&
      e.refId
    ) {
      const transfer = transferById.get(e.refId);
      if (transfer) {
        const isSender = e.reason === USER_TRANSFER_SENT_REASON;
        const counterparty = isSender ? transfer.toWalletProfile : transfer.fromWalletProfile;
        const counterpartyLabel = counterparty.nickname || shortenWalletAddress(counterparty.address);
        rows.push({
          id: e.id,
          label: isSender ? `Sent to ${counterpartyLabel}` : `Received from ${counterpartyLabel}`,
          balanceType: e.balanceType,
          amount: Number(e.amount),
          createdAt: e.createdAt,
          reason: e.reason,
        });
        continue;
      }
      // Referenced InternalTransfer row missing (shouldn't happen) — fall through.
    }

    rows.push({
      id: e.id,
      label: REASON_LABEL[e.reason] ?? e.reason,
      balanceType: e.balanceType,
      amount: Number(e.amount),
      createdAt: e.createdAt,
      reason: e.reason,
    });
  }

  return NextResponse.json({ rows });
}
