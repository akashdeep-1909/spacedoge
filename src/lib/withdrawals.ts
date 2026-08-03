// Real minimum-withdrawal figures (one per coin) are admin-editable at
// runtime — see src/lib/settings.ts (getMinUsdtWithdrawal/
// getMinDogeWithdrawal, backed by PlatformSettings) and
// /admin/settings. USDT withdrawals only ever come from Recycled USDT
// (cashed-out DOGE) or Referral USDT — Play USDT funds game entries
// only and Game Reward USDT/PTS are locked to mining spend, so neither
// is a withdrawal source. The DOGE withdrawal chain instead debits
// AVAILABLE_DOGE directly, no source picker needed (see /api/wallet/
// withdraw and the withdraw page).
//
// Which chains/coins are actually offered, their address-format regex,
// and their explorer link are now admin-configurable via
// WithdrawChainConfig (src/lib/settings.ts getWithdrawChainConfigs) —
// this file just validates a given address against a chain's
// configured regex, it no longer hardcodes the chain list itself.

// Basic format sanity check on the user-entered destination address —
// not a checksum/on-chain-existence check (an admin still reviews
// every withdrawal by hand before broadcasting), just enough to catch
// an obviously wrong paste (wrong chain's address format, truncated
// copy, stray whitespace) before it becomes a manual-review problem.
export function isValidAddressForRegex(address: string, addressRegex: string): boolean {
  const trimmed = address.trim();
  try {
    return new RegExp(addressRegex).test(trimmed);
  } catch {
    return false; // a malformed admin-entered regex fails closed, never lets an unvalidated address through
  }
}
