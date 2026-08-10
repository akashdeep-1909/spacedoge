"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { WalletBalances } from "@/lib/balances";

export function useBalances() {
  return useQuery({
    queryKey: ["balances"],
    queryFn: async (): Promise<WalletBalances> => {
      const res = await fetch("/api/wallet/balances");
      if (!res.ok) throw new Error("Failed to load balances");
      return res.json();
    },
    refetchInterval: 15_000,
  });
}

// GET /api/wallet/reserve-proof — the caller's own leaf/proof from the
// latest deposit reserve snapshot (src/lib/reserve-snapshot.ts). A 404
// means this wallet has no deposit balance in the latest snapshot yet
// (never deposited, or deposited after the snapshot was taken) — a
// normal, expected state, not an error, so it resolves to null rather
// than throwing.
export interface WalletReserveProof {
  snapshotDateIso: string;
  merkleRoot: string;
  balanceUsdt: number;
  nonce: string;
  proof: string[];
  address: string;
  leafIndex: number;
  totalLeafCount: number;
}

export function useReserveProof() {
  return useQuery({
    queryKey: ["wallet", "reserve-proof"],
    queryFn: async (): Promise<WalletReserveProof | null> => {
      const res = await fetch("/api/wallet/reserve-proof");
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load reserve proof");
      return res.json();
    },
  });
}

// Self-set display name (src/app/api/wallet/nickname/route.ts) — shown
// in place of the wallet address in-game, in multiplayer match results,
// and on the weekly leaderboard. Caller is responsible for also calling
// useAuth()'s refresh() on success, since the nickname lives on the
// session mirror (auth-context.tsx), not the react-query cache.
export function useSetNickname() {
  return useMutation({
    mutationFn: async (nickname: string): Promise<{ ok: true; nickname: string | null }> => {
      const res = await fetch("/api/wallet/nickname", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update nickname");
      return body;
    },
  });
}

export function useSimulateGameReward() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (amount: number) => {
      const res = await fetch("/api/mining/simulate-reward-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["balances"] }),
  });
}

export interface DepositChainInfo {
  chainKey: string;
  label: string;
  kind: "EVM" | "TRON";
  // This wallet's own address for this chain — computed by splitting
  // all users across the chain's address pool (see
  // getDepositAddressForWallet in src/lib/deposits.ts). Null only if
  // the admin hasn't added any pool address for this chain yet.
  address: string | null;
  tokenContract: string;
  tokenDecimals: number;
  minConfirmations: number;
  evmChainId: number | null;
}

export interface DepositAddressInfo {
  chains: DepositChainInfo[];
  sendFromAddress: string;
}

export function useDepositAddress() {
  return useQuery({
    queryKey: ["deposit-address"],
    queryFn: async (): Promise<DepositAddressInfo> => {
      const res = await fetch("/api/wallet/deposit-address");
      if (!res.ok) throw new Error("Failed to load deposit address");
      return res.json();
    },
  });
}

export interface OnchainDepositRow {
  id: string;
  chain: string;
  txHash: string;
  amount: number;
  confirmations: number;
  status: "UNMATCHED" | "PENDING" | "CREDITED";
  createdAt: string;
  creditedAt: string | null;
}

export type VerifyDepositResult =
  | { status: "credited" | "pending"; amount: number; confirmations: number; minConfirmations: number }
  | {
      status:
        | "invalid_hash"
        | "not_configured"
        | "rpc_error"
        | "not_found"
        | "failed_tx"
        | "no_matching_transfer"
        | "sent_from_different_wallet"
        | "tron_needs_manual_review";
      error: string;
    };

// Unlike most mutations here, a non-"credited" result (not found yet,
// wrong sender, etc.) is a normal outcome to show the user inline, not
// a thrown error — the API always responds 200 with a `status` field,
// so this never throws for those cases, only for actual network/auth
// failures.
export function useVerifyDeposit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { txHash: string; chainKey: string }): Promise<VerifyDepositResult> => {
      const res = await fetch("/api/wallet/deposit-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Verification failed");
      return res.json();
    },
    onSuccess: (result) => {
      if (result.status === "credited") {
        queryClient.invalidateQueries({ queryKey: ["balances"] });
      }
      queryClient.invalidateQueries({ queryKey: ["deposits"] });
    },
  });
}

export function useMyDeposits() {
  return useQuery({
    queryKey: ["deposits"],
    queryFn: async (): Promise<{ rows: OnchainDepositRow[] }> => {
      const res = await fetch("/api/wallet/deposits");
      if (!res.ok) throw new Error("Failed to load deposits");
      return res.json();
    },
    refetchInterval: 15_000,
  });
}

export interface MiningProof {
  activated: boolean;
  hasContract: boolean;
  level?: string;
  miningPower?: number;
  expiresAt?: string;
  contractedHashrateGhs: number;
  observedHashrate24hGhs: number;
  observedHashrate7dGhs: number;
  acceptedShares: number;
  rejectedSharePct: number;
  uptime24hPct: number;
  uptime7dPct: number;
  estimatedTodayDoge: number;
  // Un-prorated — the full-day total if today's guaranteed target rate
  // holds for the whole day, not scaled down by how much of today has
  // elapsed like estimatedTodayDoge is. See TodayDogeEstimate in
  // src/lib/mining.ts.
  projectedFullDayDoge: number;
  lastEpoch: {
    epochDate: string;
    grossOutputDoge: number;
    poolProviderFeesDoge: number;
    maintenanceCostDoge: number;
    reserveContributionDoge: number;
    netDistributableDoge: number;
    totalEffectiveMp: number;
    yourAllocationDoge: number | null;
    yourGrossOutputDoge: number;
    yourPoolFeesDoge: number;
    yourElectricityDoge: number;
    yourReserveDrawDoge: number;
  } | null;
  roiSummary: MiningRoiSummary;
  isSimulated: true;
}

// Doc section 8's dual ROI display — "Mining Package ROI" (package
// price only) vs. "Total First-Cycle Result" (package + activation
// fee). Both are profit percentages (e.g. +10 means 10% profit), not
// total-return-including-principal.
export interface MiningRoiSummary {
  totalPricePaidUsdt: number;
  activationFeeUsdt: number;
  totalCumulativeCreditedUsdtEquiv: number;
  packageRoiPct: number;
  totalFirstCycleRoiPct: number;
  guaranteedRoiPct: number;
  onTrackPct: number | null;
  hasMaturedContract: boolean;
}

export function useMiningProof() {
  return useQuery({
    queryKey: ["mining-proof"],
    queryFn: async (): Promise<MiningProof> => {
      const res = await fetch("/api/mining/proof");
      if (!res.ok) throw new Error("Failed to load mining proof");
      return res.json();
    },
    refetchInterval: 30_000,
  });
}

export function useActivateRig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { source: FundingSource }) => {
      const res = await fetch("/api/mining/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Activation failed");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balances"] });
      queryClient.invalidateQueries({ queryKey: ["mining-proof"] });
    },
  });
}

export function usePurchasePower() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { amountUsdt: number; source: FundingSource }) => {
      const res = await fetch("/api/mining/purchase-power", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Purchase failed");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balances"] });
      queryClient.invalidateQueries({ queryKey: ["mining-proof"] });
    },
  });
}

export interface ConversionQuote {
  dogeAmount: number;
  rate: number;
  feePct: number;
  feeUsdt: number;
  finalUsdt: number;
  isSimulated: false;
  expiresAt: string;
}

export function useConvertQuote(dogeAmount: number) {
  return useQuery({
    queryKey: ["convert-quote", dogeAmount],
    queryFn: async (): Promise<ConversionQuote> => {
      const res = await fetch(`/api/wallet/convert?dogeAmount=${dogeAmount}`);
      if (!res.ok) throw new Error("Failed to get a quote");
      return res.json();
    },
    enabled: dogeAmount > 0,
    refetchInterval: 30_000,
  });
}

export function useConvert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dogeAmount: number): Promise<ConversionQuote> => {
      const res = await fetch("/api/wallet/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dogeAmount }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Conversion failed");
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["balances"] }),
  });
}

// PTS -> Game Reward USDT at the fixed 1000:1 rate — no external rate
// to quote, so unlike DOGE conversion this executes directly rather
// than a separate quote-then-confirm step.
export function usePtsConvert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ptsAmount: number): Promise<{ ptsAmount: number; usdtAmount: number; rate: number }> => {
      const res = await fetch("/api/wallet/convert-pts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ptsAmount }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Conversion failed");
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["balances"] }),
  });
}

// Everything a purchase (mining activation/hashrate, future game-feature
// spends) can draw from.
export type FundingSource = "PLAY_USDT" | "GAME_REWARD_USDT" | "RECYCLED_USDT" | "REFERRAL_USDT";

// Recycled USDT (cashed-out DOGE) and Referral USDT are the two
// withdrawable USDT sources — Play USDT funds gameplay only, and Game
// Reward USDT is locked to game-economy spending (mining activation/
// hashrate). The cash-out path for a match win is Game Reward USDT ->
// mining hashrate -> DOGE output -> convert to Recycled USDT ->
// withdraw, matching the app's own "Play, Mine, Earn" loop. The DOGE
// chain instead always debits AVAILABLE_DOGE directly (see
// /api/wallet/withdraw) — `source` is only meaningful/required for
// USDT-coin chains.
export type WithdrawSource = "RECYCLED_USDT" | "REFERRAL_USDT";
// Which chains exist is now admin-configurable (WithdrawChainConfig) —
// this is just whichever chainKey the user picked from the dynamic
// list returned by usePublicSettings().withdrawChains.
export type WithdrawChain = string;

export function useWithdraw() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      source?: WithdrawSource;
      amount: number;
      destinationAddress: string;
      chain: WithdrawChain;
    }) => {
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Withdrawal failed");
      return body as {
        id: string;
        source: WithdrawSource | "AVAILABLE_DOGE";
        amount: number;
        status: "PENDING";
        destination: string;
        chain: WithdrawChain;
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balances"] });
      queryClient.invalidateQueries({ queryKey: ["history", "withdrawals"] });
    },
  });
}

export interface ReferralEdge {
  id: string;
  address: string;
  status: string;
  createdAt: string;
}

export interface ReferralInfo {
  myAddress: string;
  referredBy: { status: string; referrerAddress: string } | null;
  l1PctOfPlatformFee: number;
  l2PctOfPlatformFee: number;
  totalEarnedL1Usdt: number;
  totalEarnedL2Usdt: number;
  miningL1Pct: number;
  miningL2Pct: number;
  totalEarnedL1Doge: number;
  totalEarnedL2Doge: number;
  direct: ReferralEdge[];
  indirect: ReferralEdge[];
}

export function useReferrals() {
  return useQuery({
    queryKey: ["referrals"],
    queryFn: async (): Promise<ReferralInfo> => {
      const res = await fetch("/api/referrals");
      if (!res.ok) throw new Error("Failed to load referrals");
      return res.json();
    },
  });
}

export interface ReferralActivityRow {
  id: string;
  createdAt: string;
  level: "L1" | "L2";
  amount: number;
  mode: string | null;
  referredAddress: string | null;
  referredNickname: string | null;
  won: boolean | null;
}

// Mining referral commission is a daily (day, level) rollup, not a
// per-match event — see /api/referrals/activity's own doc-comment for
// why there's no referredAddress/mode/won here the way the USDT rows
// above have.
export interface MiningReferralActivityRow {
  id: string;
  createdAt: string;
  level: "L1" | "L2";
  amountDoge: number;
}

// The per-event detail behind the Refer page's aggregate Level 1/2
// totals — every individual commission credit, which match earned it,
// and whether the referred wallet won or lost that match.
export function useReferralActivity() {
  return useQuery({
    queryKey: ["referral-activity"],
    queryFn: async (): Promise<{ rows: ReferralActivityRow[]; miningRows: MiningReferralActivityRow[] }> => {
      const res = await fetch("/api/referrals/activity");
      if (!res.ok) throw new Error("Failed to load referral activity");
      return res.json();
    },
  });
}

export interface GameHistoryRow {
  matchId: string;
  mode: string;
  status: string;
  score: number;
  rank: number | null;
  rewardUsdt: number;
  rewardPts: number;
  bonusPts: number;
  createdAt: string;
  endedAt: string | null;
}

export interface WalletTransaction {
  id: string;
  label: string;
  balanceType: string;
  amount: number;
  createdAt: string;
}

export function useTransactions() {
  return useQuery({
    queryKey: ["wallet-transactions"],
    queryFn: async (): Promise<{ rows: WalletTransaction[] }> => {
      const res = await fetch("/api/wallet/transactions");
      if (!res.ok) throw new Error("Failed to load transactions");
      return res.json();
    },
  });
}

export function useGameHistory() {
  return useQuery({
    queryKey: ["history", "game"],
    queryFn: async (): Promise<{ rows: GameHistoryRow[] }> => {
      const res = await fetch("/api/history?tab=game");
      if (!res.ok) throw new Error("Failed to load game history");
      return res.json();
    },
  });
}

export interface MiningHistoryContract {
  id: string;
  level: string;
  miningPower: number;
  termDays: number;
  pricePaidUsdt: number;
  source: string;
  startsAt: string;
  expiresAt: string;
  createdAt: string;
}
export interface MiningHistoryAllocation {
  id: string;
  epochDate: string;
  effectiveMp: number;
  dogeAllocated: number;
  createdAt: string;
}

export function useMiningHistory() {
  return useQuery({
    queryKey: ["history", "mining"],
    queryFn: async (): Promise<{ contracts: MiningHistoryContract[]; allocations: MiningHistoryAllocation[] }> => {
      const res = await fetch("/api/history?tab=mining");
      if (!res.ok) throw new Error("Failed to load mining history");
      return res.json();
    },
  });
}

export interface MiningRateHistoryPoint {
  epochDate: string;
  actualDogePerMhsDay: number | null;
}

export function useMiningRateHistory() {
  return useQuery({
    queryKey: ["mining", "rate-history"],
    queryFn: async (): Promise<{
      rows: MiningRateHistoryPoint[];
      exampleDogePerMhsDay: number;
      liveToday: { epochDate: string; rate: number };
    }> => {
      const res = await fetch("/api/mining/rate-history");
      if (!res.ok) throw new Error("Failed to load mining rate history");
      return res.json();
    },
  });
}

// The doc's own disclosed reference-fleet numbers (mining v2 economy
// model) — rarely changes, so a longer staleTime than the live
// proof/rate-history polling above.
export interface MiningEconomicsConfigPublic {
  fleetCapacityMhs: number;
  referenceMonthlyGrossUsdt: number;
  minerPowerKw: number;
  electricityRateUsdtPerKwh: number;
  poolFeePct: number;
  targetRoiPct: number;
}

export function useMiningEconomicsConfig() {
  return useQuery({
    queryKey: ["mining", "economics-config"],
    queryFn: async (): Promise<MiningEconomicsConfigPublic> => {
      const res = await fetch("/api/mining/economics-config");
      if (!res.ok) throw new Error("Failed to load mining economics config");
      return res.json();
    },
    staleTime: 60_000,
  });
}

export interface ConversionHistoryRow {
  id: string;
  balanceType: string;
  amount: number;
  createdAt: string;
}

export function useConversionHistory() {
  return useQuery({
    queryKey: ["history", "conversion"],
    queryFn: async (): Promise<{ rows: ConversionHistoryRow[] }> => {
      const res = await fetch("/api/history?tab=conversion");
      if (!res.ok) throw new Error("Failed to load conversion history");
      return res.json();
    },
  });
}

export interface WithdrawalHistoryRow {
  id: string;
  source: string;
  chain: string;
  amount: number;
  status: "PENDING" | "COMPLETED";
  txHash: string | null;
  createdAt: string;
}

export function useWithdrawalHistory() {
  return useQuery({
    queryKey: ["history", "withdrawals"],
    queryFn: async (): Promise<{ rows: WithdrawalHistoryRow[] }> => {
      const res = await fetch("/api/history?tab=withdrawals");
      if (!res.ok) throw new Error("Failed to load withdrawal history");
      return res.json();
    },
  });
}

export interface WithdrawalDetail {
  id: string;
  source: string;
  chain: string;
  chainLabel: string;
  coinSymbol: "USDT" | "DOGE";
  destinationAddress: string;
  amount: number;
  networkFeeUsdt: number | null;
  status: "PENDING" | "COMPLETED";
  txHash: string | null;
  explorerUrl: string | null;
  createdAt: string;
  completedAt: string | null;
}

export function useWithdrawalDetail(id: string) {
  return useQuery({
    queryKey: ["withdrawal", id],
    queryFn: async (): Promise<WithdrawalDetail> => {
      const res = await fetch(`/api/wallet/withdraw/${id}`);
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Failed to load withdrawal");
      return res.json();
    },
    enabled: !!id,
  });
}

// --- Admin ---------------------------------------------------------

export interface AdminDepositSeriesPoint {
  date: string;
  unmatched: number;
  pending: number;
  credited: number;
}
export interface AdminWithdrawalSeriesPoint {
  date: string;
  requested: number;
  completed: number;
}
export interface AdminRecentDeposit {
  id: string;
  chain: string;
  amount: number;
  status: "UNMATCHED" | "PENDING" | "CREDITED";
  fromAddress: string;
  walletAddress: string | null;
  createdAt: string;
}
export interface AdminRecentWithdrawal {
  id: string;
  amount: number;
  networkFeeUsdt: number | null;
  status: "PENDING" | "COMPLETED";
  address: string;
  createdAt: string;
  completedAt: string | null;
}

export interface AdminOverview {
  range: number;
  walletCount: number;
  newWallets: number;
  matchCount: number;
  activeLobbyCount: number;
  matchUnusedPrizeSurplusUsdt: number;
  balances: {
    playUsdt: number;
    gameRewardUsdt: number;
    pts: number;
    pendingDoge: number;
    availableDoge: number;
    recycledUsdt: number;
    referralUsdt: number;
    treasuryUsdt: number;
  };
  availableUsdt: number;
  deposits: {
    totals: {
      unmatched: { count: number; amount: number };
      pending: { count: number; amount: number };
      credited: { count: number; amount: number };
    };
    series: AdminDepositSeriesPoint[];
    recent: AdminRecentDeposit[];
  };
  withdrawals: {
    totals: {
      pending: { count: number; amount: number };
      completed: { count: number; amount: number };
    };
    feesCollected: number;
    series: AdminWithdrawalSeriesPoint[];
    recent: AdminRecentWithdrawal[];
  };
  mining: {
    activeMiningPower: number;
    activeContracts: number;
    reserveBalanceUsdt: number;
    latestEpoch: {
      epochDate: string;
      netDistributableDoge: number;
      totalEffectiveMp: number;
      isSimulated: boolean;
    } | null;
  };
}

export function useAdminOverview(days: number = 30) {
  return useQuery({
    queryKey: ["admin", "overview", days],
    queryFn: async (): Promise<AdminOverview> => {
      const res = await fetch(`/api/admin/overview?days=${days}`);
      if (!res.ok) throw new Error("Failed to load admin overview");
      return res.json();
    },
    refetchInterval: 20_000,
  });
}

export interface AdminDepositRow {
  id: string;
  chain: string;
  txHash: string;
  explorerUrl: string | null;
  fromAddress: string;
  amount: number;
  confirmations: number;
  status: "UNMATCHED" | "PENDING" | "CREDITED";
  walletAddress: string | null;
  createdAt: string;
  creditedAt: string | null;
}

export function useAdminDeposits(status?: string, txHash?: string) {
  return useQuery({
    queryKey: ["admin", "deposits", status ?? "all", txHash ?? ""],
    queryFn: async (): Promise<{ rows: AdminDepositRow[] }> => {
      const params = new URLSearchParams();
      if (txHash) params.set("txHash", txHash);
      else if (status) params.set("status", status);
      const qs = params.toString();
      const res = await fetch(`/api/admin/deposits${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to load deposits");
      return res.json();
    },
    // A tx-hash search is a one-off lookup, not a live dashboard — don't
    // keep polling it every 20s like the default status-filtered view.
    refetchInterval: txHash ? false : 20_000,
  });
}

export interface AdminTransferRow {
  id: string;
  fromAddress: string;
  fromNickname: string | null;
  toAddress: string;
  toNickname: string | null;
  balanceType: string;
  amount: number;
  note: string | null;
  createdAt: string;
}

export function useAdminTransfers(q?: string) {
  return useQuery({
    queryKey: ["admin", "transfers", q ?? ""],
    queryFn: async (): Promise<{ rows: AdminTransferRow[] }> => {
      const qs = q ? `?q=${encodeURIComponent(q)}` : "";
      const res = await fetch(`/api/admin/transfers${qs}`);
      if (!res.ok) throw new Error("Failed to load transfers");
      return res.json();
    },
  });
}

export function useAssignDeposit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ depositId, address }: { depositId: string; address: string }) => {
      const res = await fetch(`/api/admin/deposits/${depositId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Assign failed");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "deposits"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
  });
}

export interface AdminUserRow {
  id: string;
  address: string;
  isBot: boolean;
  riskFlag: string | null;
  isKol: boolean;
  createdAt: string;
  referredByAddress: string | null;
  balances: WalletBalances;
}

export function useAdminUsers(query: string, includeBots = false) {
  return useQuery({
    queryKey: ["admin", "users", query, includeBots],
    queryFn: async (): Promise<{ rows: AdminUserRow[]; totalUserCount: number }> => {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (includeBots) params.set("includeBots", "true");
      const qs = params.toString();
      const res = await fetch(`/api/admin/users${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to load users");
      return res.json();
    },
  });
}

export interface AdminWaitlistRow {
  id: string;
  email: string;
  source: string | null;
  createdAt: string;
}

export function useAdminWaitlist(query: string) {
  return useQuery({
    queryKey: ["admin", "waitlist", query],
    queryFn: async (): Promise<{ rows: AdminWaitlistRow[]; totalCount: number }> => {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      const qs = params.toString();
      const res = await fetch(`/api/admin/waitlist${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to load waitlist");
      return res.json();
    },
  });
}

export function useCreditUserBalance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      balanceType,
      amount,
      note,
    }: {
      id: string;
      balanceType: string;
      amount: number;
      note?: string;
    }) => {
      const res = await fetch(`/api/admin/users/${id}/credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balanceType, amount, note }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to credit balance");
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export function useSetRiskFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, riskFlag }: { id: string; riskFlag: "review" | "blocked" | null }) => {
      const res = await fetch(`/api/admin/users/${id}/risk-flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riskFlag }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update risk flag");
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export function useSetKol() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isKol }: { id: string; isKol: boolean }) => {
      const res = await fetch(`/api/admin/users/${id}/kol`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isKol }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update KOL flag");
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

// Admin override for who a wallet's referrer is — see
// src/app/api/admin/users/[id]/referrer/route.ts's own doc-comment for
// why this exists alongside the normal ?ref=-link flow. Pass
// referrerAddress: null to clear an existing referral outright.
export function useSetReferrer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, referrerAddress }: { id: string; referrerAddress: string | null }) => {
      const res = await fetch(`/api/admin/users/${id}/referrer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referrerAddress }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update referrer");
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export interface AdminWithdrawalRow {
  id: string;
  address: string;
  balanceType: string;
  chain: string;
  destinationAddress: string;
  amount: number;
  networkFeeUsdt: number | null;
  status: "PENDING" | "COMPLETED";
  txHash: string | null;
  explorerUrl: string | null;
  createdAt: string;
  completedAt: string | null;
}

export function useAdminWithdrawals() {
  return useQuery({
    queryKey: ["admin", "withdrawals"],
    queryFn: async (): Promise<{ rows: AdminWithdrawalRow[] }> => {
      const res = await fetch("/api/admin/withdrawals");
      if (!res.ok) throw new Error("Failed to load withdrawals");
      return res.json();
    },
  });
}

export function useAdminCompleteWithdrawal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, txHash, networkFeeUsdt }: { id: string; txHash: string; networkFeeUsdt?: number }) => {
      const res = await fetch(`/api/admin/withdrawals/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash, networkFeeUsdt }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to complete withdrawal");
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "withdrawals"] }),
  });
}

export function useAdminSetWithdrawalFee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, networkFeeUsdt }: { id: string; networkFeeUsdt: number }) => {
      const res = await fetch(`/api/admin/withdrawals/${id}/fee`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ networkFeeUsdt }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to set fee");
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "withdrawals"] }),
  });
}

export interface LeaderboardStanding {
  walletProfileId: string;
  address: string;
  nickname?: string | null;
  rank: number;
  score: number;
  rewardUsdt: number;
}
export interface LeaderboardInfo {
  poolUsdt: number;
  rewardsEnabled: boolean;
  currentWeek: { weekStart: string; weekEnd: string; standings: LeaderboardStanding[] };
  lastWeek: { weekStart: string; weekEnd: string; poolUsdt: number; results: LeaderboardStanding[] };
}

export function useLeaderboard() {
  return useQuery({
    queryKey: ["leaderboard"],
    queryFn: async (): Promise<LeaderboardInfo> => {
      const res = await fetch("/api/leaderboard");
      if (!res.ok) throw new Error("Failed to load leaderboard");
      return res.json();
    },
    refetchInterval: 30_000,
  });
}

// ---------------------------------------------------------------------
// Platform settings — /admin/settings and the public subset it exposes
// ---------------------------------------------------------------------

export interface PublicWithdrawChain {
  chainKey: string;
  label: string;
  coinSymbol: "USDT" | "DOGE";
  addressRegex: string;
}

export interface PublicSettings {
  minUsdtWithdrawal: number;
  minDogeWithdrawal: number;
  social: {
    twitter: string | null;
    telegram: string | null;
    discord: string | null;
    youtube: string | null;
    instagram: string | null;
    facebook: string | null;
    linkedin: string | null;
    reddit: string | null;
    tiktok: string | null;
    medium: string | null;
  };
  withdrawChains: PublicWithdrawChain[];
}

export function usePublicSettings() {
  return useQuery({
    queryKey: ["settings", "public"],
    queryFn: async (): Promise<PublicSettings> => {
      const res = await fetch("/api/settings/public");
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
    staleTime: 60_000,
  });
}

export interface AdminPlatformSettings {
  minUsdtWithdrawal: number | null;
  minDogeWithdrawal: number | null;
  twitterUrl: string | null;
  telegramUrl: string | null;
  discordUrl: string | null;
  youtubeUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  linkedinUrl: string | null;
  redditUrl: string | null;
  tiktokUrl: string | null;
  mediumUrl: string | null;
  walletConnectProjectId: string | null;
  weeklyLeaderboardEnabled: boolean;
  weeklyLeaderboardPoolUsdt: number | null;
  updatedAt: string;
  updatedByAddress: string | null;
  defaults: { minUsdtWithdrawal: number; minDogeWithdrawal: number };
}

export function useAdminSettings() {
  return useQuery({
    queryKey: ["admin", "settings"],
    queryFn: async (): Promise<AdminPlatformSettings> => {
      const res = await fetch("/api/admin/settings");
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
  });
}

export function useUpdateAdminSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<AdminPlatformSettings, "updatedAt" | "updatedByAddress" | "defaults">>) => {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      queryClient.invalidateQueries({ queryKey: ["settings", "public"] });
    },
  });
}

// ---------------------------------------------------------------------
// Deposit chains (admin CRUD) — src/app/api/admin/settings/deposit-chains
// ---------------------------------------------------------------------

// One address from a chain's pool — users are split across every
// address in the pool by a stateless hash (see getDepositAddressForWallet
// in src/lib/deposits.ts), not a persisted per-user assignment.
export interface AdminDepositAddressRow {
  id: string;
  address: string;
  sortOrder: number;
  createdAt: string;
}

export interface AdminDepositChainRow {
  id: string;
  chainKey: string;
  label: string;
  kind: "EVM" | "TRON";
  addresses: AdminDepositAddressRow[];
  tokenContract: string;
  tokenDecimals: number;
  minConfirmations: number;
  rpcUrl: string | null;
  explorerTxUrl: string | null;
  evmChainId: number | null;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export function useAdminDepositChains() {
  return useQuery({
    queryKey: ["admin", "settings", "deposit-chains"],
    queryFn: async (): Promise<{ rows: AdminDepositChainRow[] }> => {
      const res = await fetch("/api/admin/settings/deposit-chains");
      if (!res.ok) throw new Error("Failed to load deposit chains");
      return res.json();
    },
  });
}

export function useAddDepositChain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      chainKey: string;
      label: string;
      kind: "EVM" | "TRON";
      addresses: string[];
      tokenContract: string;
      tokenDecimals: number;
      minConfirmations: number;
      rpcUrl?: string | null;
      explorerTxUrl?: string | null;
      evmChainId?: number | null;
    }) => {
      const res = await fetch("/api/admin/settings/deposit-chains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to add chain");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings", "deposit-chains"] });
      queryClient.invalidateQueries({ queryKey: ["deposit-address"] });
    },
  });
}

export function useUpdateDepositChain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: { id: string } & Partial<
      Pick<AdminDepositChainRow, "label" | "tokenContract" | "tokenDecimals" | "minConfirmations" | "rpcUrl" | "explorerTxUrl" | "evmChainId" | "enabled">
    >) => {
      const res = await fetch(`/api/admin/settings/deposit-chains/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update chain");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings", "deposit-chains"] });
      queryClient.invalidateQueries({ queryKey: ["deposit-address"] });
    },
  });
}

export function useDeleteDepositChain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/settings/deposit-chains/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete chain");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings", "deposit-chains"] });
      queryClient.invalidateQueries({ queryKey: ["deposit-address"] });
    },
  });
}

// Grows a chain's deposit address pool — see AdminDepositAddressRow.
export function useAddDepositAddresses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ chainId, addresses }: { chainId: string; addresses: string[] }) => {
      const res = await fetch(`/api/admin/settings/deposit-chains/${chainId}/addresses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to add addresses");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings", "deposit-chains"] });
      queryClient.invalidateQueries({ queryKey: ["deposit-address"] });
    },
  });
}

export function useDeleteDepositAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ chainId, addressId }: { chainId: string; addressId: string }) => {
      const res = await fetch(`/api/admin/settings/deposit-chains/${chainId}/addresses/${addressId}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete address");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings", "deposit-chains"] });
      queryClient.invalidateQueries({ queryKey: ["deposit-address"] });
    },
  });
}

// ---------------------------------------------------------------------
// Withdrawal chains (admin CRUD) — src/app/api/admin/settings/withdraw-chains
// ---------------------------------------------------------------------

export interface AdminWithdrawChainRow {
  id: string;
  chainKey: string;
  label: string;
  coinSymbol: "USDT" | "DOGE";
  addressRegex: string;
  explorerTxUrl: string | null;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export function useAdminWithdrawChains() {
  return useQuery({
    queryKey: ["admin", "settings", "withdraw-chains"],
    queryFn: async (): Promise<{ rows: AdminWithdrawChainRow[] }> => {
      const res = await fetch("/api/admin/settings/withdraw-chains");
      if (!res.ok) throw new Error("Failed to load withdrawal chains");
      return res.json();
    },
  });
}

export function useAddWithdrawChain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      chainKey: string;
      label: string;
      coinSymbol: "USDT" | "DOGE";
      addressRegex: string;
      explorerTxUrl?: string | null;
    }) => {
      const res = await fetch("/api/admin/settings/withdraw-chains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to add chain");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings", "withdraw-chains"] });
      queryClient.invalidateQueries({ queryKey: ["settings", "public"] });
    },
  });
}

export function useUpdateWithdrawChain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<Omit<AdminWithdrawChainRow, "id" | "chainKey" | "coinSymbol" | "createdAt" | "updatedAt">>) => {
      const res = await fetch(`/api/admin/settings/withdraw-chains/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update chain");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings", "withdraw-chains"] });
      queryClient.invalidateQueries({ queryKey: ["settings", "public"] });
    },
  });
}

export function useDeleteWithdrawChain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/settings/withdraw-chains/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete chain");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings", "withdraw-chains"] });
      queryClient.invalidateQueries({ queryKey: ["settings", "public"] });
    },
  });
}

// ---------------------------------------------------------------------
// Mining v2 economy — admin (src/app/admin/mining/page.tsx)
// ---------------------------------------------------------------------

export interface AdminMiningEconomicsConfig {
  fleetCapacityMhs: number;
  referenceMonthlyGrossUsdt: number;
  minerPowerKw: number;
  electricityRateUsdtPerKwh: number;
  hostingElectricityRateUsdtPerKwh: number;
  poolFeePct: number;
  targetRoiPct: number;
  dailyVarianceBandPct: number;
  platformProfitAllocationPct: number;
  profitabilityThresholdUsdt: number;
  reserveLowBalanceThresholdUsdt: number | null;
  newContractsPaused: boolean;
  updatedAt: string;
  updatedByAddress: string | null;
}

export function useAdminMiningEconomics() {
  return useQuery({
    queryKey: ["admin", "mining", "economics"],
    queryFn: async (): Promise<AdminMiningEconomicsConfig> => {
      const res = await fetch("/api/admin/mining/economics");
      if (!res.ok) throw new Error("Failed to load mining economics config");
      return res.json();
    },
  });
}

export function useUpdateMiningEconomics() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<AdminMiningEconomicsConfig, "updatedAt" | "updatedByAddress">>) => {
      const res = await fetch("/api/admin/mining/economics", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update mining economics");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "mining", "economics"] });
      queryClient.invalidateQueries({ queryKey: ["mining", "economics-config"] });
    },
  });
}

export function useAdminMiningReserve() {
  return useQuery({
    queryKey: ["admin", "mining", "reserve"],
    queryFn: async (): Promise<{ balanceUsdt: number }> => {
      const res = await fetch("/api/admin/mining/reserve");
      if (!res.ok) throw new Error("Failed to load mining reserve balance");
      return res.json();
    },
  });
}

export function useTopUpMiningReserve() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { amountUsdt: number; note?: string }) => {
      const res = await fetch("/api/admin/mining/reserve/top-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to top up reserve");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "mining", "reserve"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
  });
}

export interface AdminMiningContractRow {
  id: string;
  walletAddress: string;
  walletNickname: string | null;
  level: string;
  miningPower: number;
  termDays: number;
  pricePaidUsdt: number;
  targetRoiPct: number;
  cumulativeCreditedUsdtEquiv: number;
  active: boolean;
  startsAt: string;
  expiresAt: string;
  reconciledAt: string | null;
  finalShortfallUsdt: number | null;
  createdAt: string;
}

export function useAdminMiningContracts() {
  return useQuery({
    queryKey: ["admin", "mining", "contracts"],
    queryFn: async (): Promise<{ rows: AdminMiningContractRow[] }> => {
      const res = await fetch("/api/admin/mining/contracts");
      if (!res.ok) throw new Error("Failed to load mining contracts");
      return res.json();
    },
  });
}

export interface AdminMiningEconomicsReport {
  days: number;
  packageSalesRevenueUsdt: number;
  serviceVarianceSurplusUsdt: number;
  totalMiningRevenueUsdt: number;
  hostingCoolingCostUsdt: number;
  platformProfitAllocationUsdt: number;
  hardwareRecoveryReserveUsdt: number;
  reserveBalanceUsdt: number;
}

export function useAdminMiningEconomicsReport(days: number = 30) {
  return useQuery({
    queryKey: ["admin", "mining", "economics-report", days],
    queryFn: async (): Promise<AdminMiningEconomicsReport> => {
      const res = await fetch(`/api/admin/mining/economics-report?days=${days}`);
      if (!res.ok) throw new Error("Failed to load mining economics report");
      return res.json();
    },
  });
}

export interface AdminAllowlistRow {
  id: string | null; // null for env-sourced rows — see /api/admin/settings/admins
  address: string;
  source: "env" | "db";
  createdAt: string | null;
  addedByAddress: string | null;
}

export function useAdminUserList() {
  return useQuery({
    queryKey: ["admin", "settings", "admins"],
    queryFn: async (): Promise<{ rows: AdminAllowlistRow[]; you: string }> => {
      const res = await fetch("/api/admin/settings/admins");
      if (!res.ok) throw new Error("Failed to load admins");
      return res.json();
    },
  });
}

export function useAddAdminUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (address: string) => {
      const res = await fetch("/api/admin/settings/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to add admin");
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "settings", "admins"] }),
  });
}

export function useRemoveAdminUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/settings/admins/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to remove admin");
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "settings", "admins"] }),
  });
}

// ---------------------------------------------------------------------
// Multiplayer lobbies ("Play with Friends") — this app has no
// WebSocket/push infra (see src/lib/lobby.ts), so live-ness comes from
// short-interval polling, same pattern useAdminOverview above already
// uses at a slower cadence. useLobby polls fast (2.5s) since a
// countdown and other players joining need to feel responsive.
// ---------------------------------------------------------------------

export interface LobbySlot {
  slotNumber: number;
  state: "EMPTY" | "HUMAN";
  address?: string;
  nickname?: string | null;
  isHost?: boolean;
  joinSource?: string;
}

export interface LobbyState {
  id: string;
  roomCode: string;
  status: "WAITING" | "FULL" | "FILLING_AI" | "STARTING" | "STARTED" | "CANCELLED" | "EXPIRED";
  mode: string;
  modeLabel: string;
  entryFeeUsdt: number;
  durationSec: number;
  nominalRoomPoolUsdt: number;
  host: { address: string };
  isHost: boolean;
  slots: LobbySlot[];
  humanCount: number;
  maxPlayers: number;
  hasInviteLink: boolean;
  pendingInvitations: { id: string; recipientAddress: string; recipientNickname?: string | null; expiresAt: string }[];
  expiresAt: string;
  startedAt: string | null;
  finalMatchId: string | null;
  serverTime: string;
}

export function useLobby(lobbyId: string | null) {
  return useQuery({
    queryKey: ["lobby", lobbyId],
    queryFn: async (): Promise<LobbyState> => {
      const res = await fetch(`/api/lobbies/${lobbyId}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load lobby");
      return body;
    },
    enabled: !!lobbyId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "STARTED" || status === "CANCELLED" || status === "EXPIRED" ? false : 2_500;
    },
  });
}

export function useCreateLobby() {
  return useMutation({
    mutationFn: async (packageAmount: number): Promise<LobbyState> => {
      const res = await fetch("/api/lobbies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageAmount }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create lobby");
      return body;
    },
  });
}

export function useInviteToLobby(lobbyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (recipientAddress: string) => {
      const res = await fetch(`/api/lobbies/${lobbyId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientAddress }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to send invitation");
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lobby", lobbyId] }),
  });
}

export function useStartLobby(lobbyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<LobbyState> => {
      const res = await fetch(`/api/lobbies/${lobbyId}/start`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to start match");
      return body;
    },
    onSuccess: (data) => queryClient.setQueryData(["lobby", lobbyId], data),
  });
}

export function useCancelLobby(lobbyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<LobbyState> => {
      const res = await fetch(`/api/lobbies/${lobbyId}/cancel`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to cancel lobby");
      return body;
    },
    onSuccess: (data) => queryClient.setQueryData(["lobby", lobbyId], data),
  });
}

export function useGenerateInviteLink(lobbyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ token: string }> => {
      const res = await fetch(`/api/lobbies/${lobbyId}/invite-link`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to generate invite link");
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lobby", lobbyId] }),
  });
}

export function useDisableInviteLink(lobbyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/lobbies/${lobbyId}/invite-link`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to disable invite link");
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lobby", lobbyId] }),
  });
}

export interface InvitationRow {
  id: string;
  lobbyId: string;
  roomCode: string;
  otherAddress: string;
  modeLabel: string;
  entryFeeUsdt: number;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export function useMyInvitations() {
  return useQuery({
    queryKey: ["invitations"],
    queryFn: async (): Promise<{ incoming: InvitationRow[]; sent: InvitationRow[] }> => {
      const res = await fetch("/api/invitations");
      if (!res.ok) throw new Error("Failed to load invitations");
      return res.json();
    },
    refetchInterval: 4_000,
  });
}

export function useAcceptInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string): Promise<LobbyState> => {
      const res = await fetch(`/api/invitations/${invitationId}/accept`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to accept invitation");
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invitations"] }),
  });
}

export function useDeclineInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await fetch(`/api/invitations/${invitationId}/decline`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to decline invitation");
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invitations"] }),
  });
}

export interface MatchRosterSeat {
  slotNumber: number | null;
  isBot: boolean;
  isYou: boolean;
  label: string;
}

export function useMatchRoster(matchId: string | null | undefined) {
  return useQuery({
    queryKey: ["match-roster", matchId],
    queryFn: async (): Promise<{ seats: MatchRosterSeat[] }> => {
      const res = await fetch(`/api/matches/${matchId}/roster`);
      if (!res.ok) throw new Error("Failed to load match roster");
      return res.json();
    },
    enabled: !!matchId,
    staleTime: Infinity,
  });
}

export function useSubmitMatchResults() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { matchId: string; score: number; durationPlayedSec: number }) => {
      const res = await fetch(`/api/matches/${params.matchId}/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: params.score, durationPlayedSec: params.durationPlayedSec }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to submit results");
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["balances"] }),
  });
}

export interface AdminLobbyRow {
  id: string;
  roomCode: string;
  status: string;
  modeLabel: string;
  entryFeeUsdt: number;
  hostAddress: string;
  humanCount: number;
  expiresAt: string;
  startedAt: string | null;
  finalMatchId: string | null;
  createdAt: string;
}

export function useAdminLobbies(status?: string) {
  return useQuery({
    queryKey: ["admin", "lobbies", status ?? "all"],
    queryFn: async (): Promise<{ counts: Record<string, number>; rows: AdminLobbyRow[] }> => {
      const qs = status ? `?status=${status}` : "";
      const res = await fetch(`/api/admin/lobbies${qs}`);
      if (!res.ok) throw new Error("Failed to load lobbies");
      return res.json();
    },
    refetchInterval: 5_000,
  });
}

export interface GameModeRow {
  mode: string;
  label: string;
  description: string;
  entryFeeUsdt: number;
  durationSec: number;
  prefundedPoolUsdt: number | null;
  badge: string;
  eligibility: { eligible: boolean; playsInWindow: number; playsNeeded: number } | null;
  cooldown: { onCooldown: boolean; nextEligibleAt: string | null } | null;
}

export interface KolBonusRow {
  eligible: boolean;
  playsRemaining: number;
  ptsCapRemaining: number;
}

export function useGameModes() {
  return useQuery({
    queryKey: ["game-modes"],
    queryFn: async (): Promise<{ modes: GameModeRow[]; kolBonus: KolBonusRow }> => {
      const res = await fetch("/api/game-modes");
      if (!res.ok) throw new Error("Failed to load game modes");
      return res.json();
    },
    staleTime: 30_000,
  });
}

export type ActiveMatchInfo =
  | { type: "none" }
  | { type: "lobby"; lobbyId: string }
  | {
      type: "match";
      matchId: string;
      mapSeed: string;
      mode: string;
      modeLabel: string;
      durationSec: number;
      prizePoolUsdt: number;
      players: number;
      startedAt: string;
    };

// Backs the "Resume Game" banner on the Play page — checked on mount
// so a player who reloads mid-match or with an open "Play with
// Friends" lobby gets a way back in, instead of only discovering
// they're blocked via a 409 on their next attempt to start something
// new. See GET /api/matches/active.
export function useActiveMatch() {
  return useQuery({
    queryKey: ["active-match"],
    queryFn: async (): Promise<ActiveMatchInfo> => {
      const res = await fetch("/api/matches/active");
      if (!res.ok) throw new Error("Failed to check active match");
      return res.json();
    },
    staleTime: 10_000,
  });
}

export interface AdminGameModeRow {
  id: string;
  mode: string;
  label: string;
  description: string;
  entryFeeUsdt: number;
  durationSec: number;
  enabled: boolean;
  prefundedPoolUsdt: number | null;
  cooldownHours: number | null;
  eligibilityWindowHours: number | null;
  eligibilityMinPlays: number | null;
  sortOrder: number;
}

export function useAdminGameModes() {
  return useQuery({
    queryKey: ["admin", "game-modes"],
    queryFn: async (): Promise<{ rows: AdminGameModeRow[] }> => {
      const res = await fetch("/api/admin/settings/game-modes");
      if (!res.ok) throw new Error("Failed to load game modes");
      return res.json();
    },
  });
}

export function useUpdateGameModeConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<AdminGameModeRow> & { id: string }) => {
      const res = await fetch(`/api/admin/settings/game-modes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update game mode");
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "game-modes"] }),
  });
}

export interface RecentPlayerRow {
  address: string;
  nickname?: string | null;
  gamesTogether: number;
  lastPlayedAt: string;
}

export function useRecentPlayers() {
  return useQuery({
    queryKey: ["players", "recent"],
    queryFn: async (): Promise<{ players: RecentPlayerRow[] }> => {
      const res = await fetch("/api/players/recent");
      if (!res.ok) throw new Error("Failed to load recent players");
      return res.json();
    },
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------
// Balance transfer — src/app/api/wallet/transfer (moves USDT between
// the caller's own Play/Recycled/Referral buckets, no counterparty)
// ---------------------------------------------------------------------

// Kept as a plain string union here (not imported from src/lib/transfers.ts,
// which is server-only and pulls in the Prisma/pg driver) — must stay
// byte-identical to TRANSFERABLE_BALANCE_TYPES there.
export type TransferableBalanceType = "PLAY_USDT" | "RECYCLED_USDT" | "REFERRAL_USDT";

export function useSendTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { fromBalanceType: TransferableBalanceType; toBalanceType: TransferableBalanceType; amount: number }) => {
      const res = await fetch("/api/wallet/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Transfer failed");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balances"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
    },
  });
}

// ---------------------------------------------------------------------
// User-to-user transfer — src/app/api/wallet/resolve-recipient +
// transfer-to-user (sends Recycled/Referral USDT to a DIFFERENT
// wallet's account, unlike useSendTransfer above)
// ---------------------------------------------------------------------

// Kept as a plain string union, same reasoning as TransferableBalanceType
// above — must stay byte-identical to TRANSFERABLE_TO_OTHER_USER in
// src/lib/transfers.ts.
export type TransferableToOtherUserBalanceType = "RECYCLED_USDT" | "REFERRAL_USDT";

export interface ResolvedRecipient {
  address: string;
  nickname: string | null;
}

// A lookup, not a useQuery — deliberately only runs when the user
// explicitly asks (typing an address alone shouldn't trigger requests
// on every keystroke), same "action, not passive fetch" reasoning as
// useVerifyDeposit.
export function useResolveRecipient() {
  return useMutation({
    mutationFn: async (address: string): Promise<ResolvedRecipient> => {
      const res = await fetch(`/api/wallet/resolve-recipient?address=${encodeURIComponent(address)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not find that wallet.");
      return body;
    },
  });
}

export function useSendToUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { toAddress: string; balanceType: TransferableToOtherUserBalanceType; amount: number; note?: string }) => {
      const res = await fetch("/api/wallet/transfer-to-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Transfer failed");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balances"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
    },
  });
}
