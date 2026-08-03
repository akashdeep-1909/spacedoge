import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

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
};

// GET /api/wallet/transactions — every ledger entry for this wallet in
// one chronological feed, across every balance type, with a human
// label. The tabbed /dashboard/history view slices this same ledger by
// category; this is the same source of truth shown as one unified feed
// instead, for "what happened to my money, in order."
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const entries = await db.ledgerEntry.findMany({
    where: { walletProfileId: session.walletProfileId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    rows: entries.map((e) => ({
      id: e.id,
      label: REASON_LABEL[e.reason] ?? e.reason,
      balanceType: e.balanceType,
      amount: Number(e.amount),
      createdAt: e.createdAt,
    })),
  });
}
