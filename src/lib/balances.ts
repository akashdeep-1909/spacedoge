import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { BalanceType, GameMode, MatchStatus } from "@/generated/prisma/enums";

// ---------------------------------------------------------------------
// Balance-check locking — every endpoint that debits a balance after
// checking "is there enough?" needs to serialize concurrent attempts,
// or two requests can both read the same pre-debit balance and both
// pass (confirmed exploitable: N parallel withdraw requests against a
// small balance all succeed under Postgres's default READ COMMITTED
// isolation, since a plain SELECT/aggregate takes no lock). Postgres
// advisory locks solve this without a schema change or an app-wide
// isolation-level bump: pg_advisory_xact_lock is a core builtin,
// transaction-scoped (always releases on COMMIT/ROLLBACK, so there's
// no unlock path to get wrong), and safe under PgBouncer transaction
// pooling (the session-scoped pg_advisory_lock variant would NOT be).
//
// Two lock classes (the first argument) so a per-wallet key can never
// collide with a fixed global key — hashtext() only has the int4
// keyspace, so collisions are possible within one class, but that only
// ever causes false contention, never a correctness failure.
//
// Ordering rule, to avoid a deadlock if a transaction ever needs more
// than one lock (today only mining/purchase-power's fleet-capacity
// check does): acquire the global class before any wallet class, then
// wallets in ascending walletProfileId. Only ever lock a wallet you're
// about to DEBIT after an availability check — never a credit-only
// wallet (an unconditional ledger credit has nothing to race against).
export const LOCK_CLASS_WALLET = 1;
export const LOCK_CLASS_GLOBAL = 2;

// MUST be the first statement inside the $transaction, before any
// balance read that transaction depends on — pg_advisory_xact_lock
// only does anything inside a transaction; called outside one, it's a
// silent no-op (the implicit single-statement transaction commits, and
// releases the lock, immediately).
export async function lockWalletForBalanceChange(tx: Prisma.TransactionClient, walletProfileId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_catalog.pg_advisory_xact_lock(${LOCK_CLASS_WALLET}, pg_catalog.hashtext(${walletProfileId}))`;
}

// Non-blocking variant, for the one endpoint where queuing behind a
// held lock is worse than just failing fast (withdraw — the exact
// shape the original race was: N parallel requests against one
// wallet). Returns false immediately instead of waiting if another
// balance-changing transaction already holds this wallet's lock, so
// the caller can return a "try again" response rather than tying up a
// pooled connection for the duration of Prisma's transaction timeout.
export async function tryLockWalletForBalanceChange(tx: Prisma.TransactionClient, walletProfileId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ pg_try_advisory_xact_lock: boolean }[]>`SELECT pg_catalog.pg_try_advisory_xact_lock(${LOCK_CLASS_WALLET}, pg_catalog.hashtext(${walletProfileId}))`;
  return rows[0]?.pg_try_advisory_xact_lock ?? false;
}

// For the one shared, non-per-wallet resource in the money path:
// mining/purchase-power's fleet-capacity check. Constant key (2, 1) —
// no hashtext needed, and it can never alias a per-wallet key since
// it's a different lock class.
export async function lockGlobalFleetCapacity(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_catalog.pg_advisory_xact_lock(${LOCK_CLASS_GLOBAL}, 1)`;
}

// Narrow single-balance-type reader for availability checks inside a
// locked transaction — deliberately not getWalletBalances() below,
// which fires two extra queries (mining contracts, lifetime match
// history) that are irrelevant to any one balance check and would only
// lengthen the critical section for no reason.
export async function getLedgerBalance(
  client: Prisma.TransactionClient | typeof db,
  walletProfileId: string,
  balanceType: BalanceType
): Promise<number> {
  const sum = await client.ledgerEntry.aggregate({
    where: { walletProfileId, balanceType },
    _sum: { amount: true },
  });
  return Number(sum._sum.amount ?? 0);
}

export interface WalletBalances {
  playUsdt: number;
  gameRewardUsdt: number;
  pts: number;
  pendingDoge: number;
  availableDoge: number;
  recycledUsdt: number;
  referralUsdt: number;
  activeMiningPower: number;
  lifetimePaidPts: number;
}

// Reconstructs every balance from the append-only ledger — doc section
// 11.3: "No administrator can directly edit a displayed balance."
// Mining Power is NOT a ledger balance (it's a non-transferable service
// entitlement, doc section 11.1), so it's summed from active contracts.
export async function getWalletBalances(walletProfileId: string): Promise<WalletBalances> {
  const [sums, activeContracts, paidScore] = await Promise.all([
    db.ledgerEntry.groupBy({
      by: ["balanceType"],
      where: { walletProfileId },
      _sum: { amount: true },
    }),
    db.miningContract.aggregate({
      where: { walletProfileId, active: true, expiresAt: { gt: new Date() } },
      _sum: { miningPower: true },
    }),
    // Lifetime PTS ever earned across every *paid* match (mode !=
    // PRACTICE — that mode is explicitly XP-only). This is raw score
    // summed straight from match history, never decreases, and is
    // separate from the spendable `pts` ledger balance below (which
    // DOES decrease as PTS gets manually converted) — shown purely as
    // a "how much have I earned in total, ever" stat.
    db.matchParticipant.aggregate({
      where: {
        walletProfileId,
        isBot: false,
        match: {
          mode: { not: GameMode.PRACTICE },
          status: { in: [MatchStatus.SETTLED_WIN, MatchStatus.SETTLED_LOSS] },
        },
      },
      _sum: { score: true },
    }),
  ]);

  const byType = Object.fromEntries(
    sums.map((row) => [row.balanceType, Number(row._sum.amount ?? 0)])
  ) as Record<BalanceType, number>;

  return {
    playUsdt: byType.PLAY_USDT ?? 0,
    gameRewardUsdt: byType.GAME_REWARD_USDT ?? 0,
    pts: byType.PTS ?? 0,
    pendingDoge: byType.PENDING_DOGE ?? 0,
    availableDoge: byType.AVAILABLE_DOGE ?? 0,
    recycledUsdt: byType.RECYCLED_USDT ?? 0,
    referralUsdt: byType.REFERRAL_USDT ?? 0,
    activeMiningPower: Number(activeContracts._sum.miningPower ?? 0),
    lifetimePaidPts: paidScore._sum.score ?? 0,
  };
}
