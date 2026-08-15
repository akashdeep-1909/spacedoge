import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getWalletBalances } from "@/lib/balances";
import { isValidAddressForRegex } from "@/lib/withdrawals";
import { getMinUsdtWithdrawal, getMinDogeWithdrawal, getWithdrawChainConfig } from "@/lib/settings";
import { BalanceType } from "@/generated/prisma/enums";

const bodySchema = z.object({
  // Required only for USDT-coin chains (a DOGE chain has exactly one
  // valid source and this is ignored/overridden server-side — see
  // below). Optional here so a DOGE withdrawal request doesn't need to
  // send a meaningless value.
  source: z.enum(["RECYCLED_USDT", "REFERRAL_USDT", "GAME_REWARD_USDT"]).optional(),
  amount: z.number().positive(),
  destinationAddress: z.string().min(1),
  chain: z.string().min(1),
});

// POST /api/wallet/withdraw — creates a real Withdrawal record, PENDING
// until an admin actually broadcasts the on-chain transaction and
// records its hash (see /api/admin/withdrawals/[id]/complete). The
// ledger debit happens immediately on request — funds are reserved the
// moment you ask, not only once the transaction is sent.
//
// Which chains are offered and which coin each one sends is
// admin-configurable (WithdrawChainConfig, see src/lib/settings.ts) —
// this route looks up the selected chain to find its coin, then:
//   - USDT chains: debit whichever of Recycled/Referral/Game Reward
//     USDT the client selected as `source` — Play USDT is still the
//     one exception, it funds gameplay/mining spend only and is never
//     withdrawable. Game Reward USDT is withdrawable directly (subject
//     to the same admin-configured minimum every USDT withdrawal uses,
//     see getMinUsdtWithdrawal below) as well as still spendable on
//     mining activation/hashrate — it isn't locked to one path anymore.
//   - The DOGE chain: always debits AVAILABLE_DOGE — there's no
//     picker, `source` is ignored entirely for this coin.
//
// The destination is a user-entered address (not necessarily the
// connected wallet) and chain — an admin reviews and sends the real
// on-chain transfer by hand, so this only sanity-checks the address's
// format for the selected chain (via its configured regex), not its
// on-chain validity.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { amount, chain } = parsed.data;
  const destinationAddress = parsed.data.destinationAddress.trim();

  const chainConfig = await getWithdrawChainConfig(chain);
  if (!chainConfig || !chainConfig.enabled) {
    return NextResponse.json({ error: "That withdrawal chain isn't available." }, { status: 400 });
  }

  const isDoge = chainConfig.coinSymbol === "DOGE";
  let source: "RECYCLED_USDT" | "REFERRAL_USDT" | "GAME_REWARD_USDT" | "AVAILABLE_DOGE";
  if (isDoge) {
    source = "AVAILABLE_DOGE";
  } else {
    if (!parsed.data.source) {
      return NextResponse.json({ error: "Choose a source balance." }, { status: 400 });
    }
    source = parsed.data.source;
  }

  const minWithdrawal = isDoge ? await getMinDogeWithdrawal() : await getMinUsdtWithdrawal();
  if (amount < minWithdrawal) {
    return NextResponse.json(
      { error: `Minimum withdrawal is ${isDoge ? `${minWithdrawal} DOGE` : `$${minWithdrawal}`}.` },
      { status: 400 }
    );
  }

  if (!isValidAddressForRegex(destinationAddress, chainConfig.addressRegex)) {
    return NextResponse.json({ error: `That doesn't look like a valid ${chainConfig.label} address.` }, { status: 400 });
  }

  const balances = await getWalletBalances(session.walletProfileId);
  const available =
    source === "RECYCLED_USDT"
      ? balances.recycledUsdt
      : source === "REFERRAL_USDT"
        ? balances.referralUsdt
        : source === "GAME_REWARD_USDT"
          ? balances.gameRewardUsdt
          : balances.availableDoge;
  if (available < amount) {
    return NextResponse.json({ error: "Not enough balance for that withdrawal." }, { status: 402 });
  }

  const withdrawal = await db.$transaction(async (tx) => {
    const created = await tx.withdrawal.create({
      data: {
        walletProfileId: session.walletProfileId,
        balanceType: source as BalanceType,
        chain,
        destinationAddress,
        amount,
        status: "PENDING",
      },
    });
    await tx.ledgerEntry.create({
      data: {
        walletProfileId: session.walletProfileId,
        balanceType: source as BalanceType,
        amount: -amount,
        reason: "withdrawal_requested",
        refType: "Withdrawal",
        refId: created.id,
      },
    });
    return created;
  });

  return NextResponse.json({
    id: withdrawal.id,
    source,
    amount,
    status: withdrawal.status,
    destination: withdrawal.destinationAddress,
    chain: withdrawal.chain,
  });
}
