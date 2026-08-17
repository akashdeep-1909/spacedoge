import type { TranslationKey } from "@/lib/i18n/LocaleProvider";

// Maps a raw BalanceType enum value to the same translated label shown
// on the balance cards elsewhere (dashboard home, wallet page) — keeps
// transaction/history tables from ever leaking the raw SCREAMING_SNAKE
// enum name (e.g. "PLAY_USDT") to the user.
const BALANCE_TYPE_KEY: Record<string, TranslationKey> = {
  PLAY_USDT: "dashboardHome.playUsdt",
  GAME_REWARD_USDT: "dashboardHome.gameRewardUsdt",
  RECYCLED_USDT: "wallet.recycledUsdtLabel",
  REFERRAL_USDT: "dashboardHome.referralUsdt",
  PTS: "wallet.ptsLabel",
  PENDING_DOGE: "dashboardHome.pendingDoge",
  AVAILABLE_DOGE: "dashboardHome.availableDoge",
};

export function balanceTypeLabel(t: (key: TranslationKey) => string, balanceType: string): string {
  const key = BALANCE_TYPE_KEY[balanceType];
  return key ? t(key) : balanceType.replaceAll("_", " ");
}

// The actual currency unit a raw BalanceType amount is denominated in
// — every BalanceType is one of exactly these three (see schema.prisma's
// BalanceType enum), so this is exhaustive, not a guess. Used wherever
// a bare number needs "USDT"/"DOGE"/"PTS" next to it instead of leaving
// the reader to infer the unit from context (or, worse, an unconditional
// "$" prefix that's flat wrong on a DOGE-denominated row).
export function balanceTypeUnit(balanceType: string): "DOGE" | "PTS" | "USDT" {
  if (balanceType.includes("DOGE")) return "DOGE";
  if (balanceType === "PTS") return "PTS";
  return "USDT";
}
