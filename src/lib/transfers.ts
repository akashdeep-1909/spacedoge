import { db } from "@/lib/db";
import { BalanceType } from "@/generated/prisma/enums";

// Only a subset of BalanceType can move between a wallet's own buckets.
// Deliberately excludes:
//   - GAME_REWARD_USDT: locked to game-economy spending (mining
//     activation/hashrate), meant to be earned by winning — letting it
//     move into a withdrawable bucket would defeat that lock.
//   - PTS: an intermediate, not-yet-converted match score — same
//     "earned by playing" reasoning as above.
//   - PENDING_DOGE / AVAILABLE_DOGE: DOGE-denominated, not USDT.
//   - PLATFORM_FEE_USDT / MINING_PROTECTION_RESERVE_USDT: platform-
//     internal balances on the synthetic treasury profile, never a
//     real user's to move.
export const TRANSFERABLE_BALANCE_TYPES = [
  BalanceType.PLAY_USDT,
  BalanceType.RECYCLED_USDT,
  BalanceType.REFERRAL_USDT,
] as const;
export type TransferableBalanceType = (typeof TRANSFERABLE_BALANCE_TYPES)[number];

export function isTransferableBalanceType(value: string): value is TransferableBalanceType {
  return (TRANSFERABLE_BALANCE_TYPES as readonly string[]).includes(value);
}

export class TransferError extends Error {}

export const BALANCE_TRANSFER_REASON = "balance_transfer";

// Moves a balance between two of the caller's own buckets — two
// LedgerEntry rows (debit source, credit destination) sharing one
// reason, in one transaction. Same reconstruct-from-the-ledger
// convention every other same-wallet conversion in this app already
// follows (see convert/convert-pts): no dedicated tracking table,
// no counterparty, just ordinary signed ledger rows.
export async function moveBalance(input: {
  walletProfileId: string;
  fromBalanceType: TransferableBalanceType;
  toBalanceType: TransferableBalanceType;
  amount: number;
}) {
  const { walletProfileId, fromBalanceType, toBalanceType, amount } = input;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new TransferError("Enter a valid amount.");
  }
  if (fromBalanceType === toBalanceType) {
    throw new TransferError("Choose two different balances.");
  }

  return db.$transaction(async (tx) => {
    const sum = await tx.ledgerEntry.aggregate({
      where: { walletProfileId, balanceType: fromBalanceType },
      _sum: { amount: true },
    });
    const available = Number(sum._sum.amount ?? 0);
    if (amount > available) {
      throw new TransferError("Insufficient balance.");
    }

    await tx.ledgerEntry.create({
      data: {
        walletProfileId,
        balanceType: fromBalanceType,
        amount: -amount,
        reason: BALANCE_TRANSFER_REASON,
      },
    });
    await tx.ledgerEntry.create({
      data: {
        walletProfileId,
        balanceType: toBalanceType,
        amount,
        reason: BALANCE_TRANSFER_REASON,
      },
    });

    return { fromBalanceType, toBalanceType, amount };
  });
}
