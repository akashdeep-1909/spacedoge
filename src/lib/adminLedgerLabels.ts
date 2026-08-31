// Plain-English labels for raw LedgerEntry.balanceType/reason values —
// admin-panel only, deliberately NOT the i18n-based balanceTypeLabel()
// in src/lib/balance-labels.ts (that one needs a `t()` from
// useLocale(), and the admin panel is plain English throughout, no
// i18n anywhere in it). Used specifically for the "Recent Ledger
// Entries" section on src/app/admin/users/[id]/page.tsx — confirmed
// live as a real gap: "use here same names of wallet and activities,
// don't use the keys." Deliberately NOT applied to the 5 exportable
// report types (deposits/withdrawals/matches/mining/transfers,
// src/lib/adminReports.ts) — those are meant for spreadsheet/
// accounting use via CSV/PDF export, where the raw enum value is
// exactly what an admin filtering/pivoting a spreadsheet wants, not a
// friendly label that might not round-trip cleanly. Recent Ledger
// Entries is a pure display-only audit view with no export button at
// all, where readability is the only concern.

const BALANCE_TYPE_LABEL: Record<string, string> = {
  PLAY_USDT: "Deposit USDT",
  GAME_REWARD_USDT: "Game Reward USDT",
  PTS: "PTS",
  PENDING_DOGE: "Pending DOGE",
  AVAILABLE_DOGE: "Available DOGE",
  RECYCLED_USDT: "Mining Earnings (USDT)",
  REFERRAL_USDT: "Referral USDT",
  PLATFORM_FEE_USDT: "Platform Treasury (USDT)",
  MINING_PROTECTION_RESERVE_USDT: "Mining Protection Reserve (USDT)",
};

const REASON_LABEL: Record<string, string> = {
  match_entry: "Match Entry Fee",
  match_entry_hold: "Match Entry Hold (Lobby)",
  match_entry_hold_release: "Match Entry Hold Released",
  match_settlement: "Match Reward",
  match_unused_prize_surplus: "Unused Prize Surplus",
  platform_fee: "Platform Fee",
  referral_l1: "Referral Commission — Direct (Game)",
  referral_l2: "Referral Commission — Indirect (Game)",
  mining_referral_l1: "Referral Commission — Direct (Mining)",
  mining_referral_l2: "Referral Commission — Indirect (Mining)",
  kol_referral_bonus: "Referral Bonus Rush Reward",
  rig_activation_fee: "Mining Rig Activation Fee",
  mining_power_purchase: "Hashrate Purchase",
  mining_epoch_allocation: "Daily Mining Payout",
  mining_reserve_variance_surplus: "Mining Reserve Surplus Sweep",
  mining_reserve_variance_draw: "Mining Reserve Draw",
  mining_contract_expiry_topup: "Mining Contract Expiry Top-Up",
  mining_reserve_contract_expiry_draw: "Mining Reserve Expiry Draw",
  mining_reserve_manual_seed: "Mining Reserve — Admin Top-Up",
  weekly_leaderboard_payout: "Weekly Leaderboard Payout",
  pts_to_gamereward_conversion: "PTS → Game Reward USDT Conversion",
  doge_to_usdt_conversion: "DOGE → USDT Conversion",
  withdrawal_requested: "Withdrawal Requested",
  admin_manual_credit: "Admin Manual Credit",
  balance_transfer: "Balance Conversion",
  wallet_transfer_sent: "Sent to Another Wallet",
  wallet_transfer_received: "Received from Another Wallet",
  demo_game_reward_simulated: "Simulated Game Reward (Demo)",
  demo_deposit_simulated: "Simulated Deposit (Demo)",
};

// Fallback for any reason code not yet in the map above (new code
// paths are added occasionally) — "some_new_reason" -> "Some New
// Reason", readable even without an explicit entry, rather than
// silently showing the raw snake_case key.
function humanize(key: string): string {
  return key
    .split("_")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export function ledgerBalanceTypeLabel(balanceType: string): string {
  return BALANCE_TYPE_LABEL[balanceType] ?? humanize(balanceType);
}

export function ledgerReasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? humanize(reason);
}
