import { randomUUID } from "node:crypto";
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
// Shared refType both same-wallet moveBalance() and cross-wallet
// sendToWallet() below tag their paired LedgerEntry rows with — how
// /api/wallet/transactions groups a debit+credit pair back into one
// "Transfer" row instead of showing them as two separate lines. Same
// refId on both rows of a pair; a fresh one per transfer (randomUUID(),
// not either entry's own id) so grouping logic doesn't need to special-
// case "the second row points at the first."
export const TRANSFER_REF_TYPE = "Transfer";

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

    const refId = randomUUID();
    await tx.ledgerEntry.create({
      data: {
        walletProfileId,
        balanceType: fromBalanceType,
        amount: -amount,
        reason: BALANCE_TRANSFER_REASON,
        refType: TRANSFER_REF_TYPE,
        refId,
      },
    });
    await tx.ledgerEntry.create({
      data: {
        walletProfileId,
        balanceType: toBalanceType,
        amount,
        reason: BALANCE_TRANSFER_REASON,
        refType: TRANSFER_REF_TYPE,
        refId,
      },
    });

    return { fromBalanceType, toBalanceType, amount };
  });
}

// Balance types a user can send to a DIFFERENT wallet — deliberately a
// narrower list than TRANSFERABLE_BALANCE_TYPES above (which governs
// same-wallet moves only). PLAY_USDT is excluded on purpose: it's
// schema-documented as "funds gameplay only," and letting it move
// between accounts would let it be used to farm sign-up-style
// incentives across throwaway wallets without ever actually being
// played. RECYCLED_USDT/REFERRAL_USDT are already the two balances the
// withdraw flow treats as real, cashable money — this feature is
// scoped to "send your withdrawable balance to another user," not a
// new, broader money-movement channel.
export const TRANSFERABLE_TO_OTHER_USER = [BalanceType.RECYCLED_USDT, BalanceType.REFERRAL_USDT] as const;
export type TransferableToOtherUserBalanceType = (typeof TRANSFERABLE_TO_OTHER_USER)[number];

export function isTransferableToOtherUserBalanceType(value: string): value is TransferableToOtherUserBalanceType {
  return (TRANSFERABLE_TO_OTHER_USER as readonly string[]).includes(value);
}

export const USER_TRANSFER_SENT_REASON = "wallet_transfer_sent";
export const USER_TRANSFER_RECEIVED_REASON = "wallet_transfer_received";

// Sends balance to a DIFFERENT wallet — unlike moveBalance above, this
// gets a real InternalTransfer row (see schema.prisma's doc-comment on
// that model for why: a genuine counterparty across two different
// users is exactly the case the "reconstruct from the ledger alone"
// convention doesn't cover well, and admin needs an efficient way to
// see who sent what to whom). The two LedgerEntry rows still do the
// actual balance movement and are what every balance query already
// sums — this row is metadata alongside them, not a replacement.
export async function sendToWallet(input: {
  fromWalletProfileId: string;
  toAddress: string;
  balanceType: TransferableToOtherUserBalanceType;
  amount: number;
  note?: string;
}) {
  const { fromWalletProfileId, amount, balanceType, note } = input;
  const toAddress = input.toAddress.trim().toLowerCase();

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new TransferError("Enter a valid amount.");
  }

  const recipient = await db.walletProfile.findUnique({ where: { address: toAddress } });
  if (!recipient) {
    throw new TransferError("No Space DOGE account found for that address.");
  }
  if (recipient.id === fromWalletProfileId) {
    throw new TransferError("You can't send to your own wallet.");
  }

  return db.$transaction(async (tx) => {
    const sum = await tx.ledgerEntry.aggregate({
      where: { walletProfileId: fromWalletProfileId, balanceType },
      _sum: { amount: true },
    });
    const available = Number(sum._sum.amount ?? 0);
    if (amount > available) {
      throw new TransferError("Insufficient balance.");
    }

    const transfer = await tx.internalTransfer.create({
      data: {
        fromWalletProfileId,
        toWalletProfileId: recipient.id,
        balanceType,
        amount,
        note: note?.trim() || null,
      },
    });

    await tx.ledgerEntry.create({
      data: {
        walletProfileId: fromWalletProfileId,
        balanceType,
        amount: -amount,
        reason: USER_TRANSFER_SENT_REASON,
        refType: TRANSFER_REF_TYPE,
        refId: transfer.id,
      },
    });
    await tx.ledgerEntry.create({
      data: {
        walletProfileId: recipient.id,
        balanceType,
        amount,
        reason: USER_TRANSFER_RECEIVED_REASON,
        refType: TRANSFER_REF_TYPE,
        refId: transfer.id,
      },
    });

    return { transfer, recipientAddress: recipient.address, recipientNickname: recipient.nickname };
  });
}
