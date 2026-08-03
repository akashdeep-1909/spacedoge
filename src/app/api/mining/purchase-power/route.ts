import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getWalletBalances } from "@/lib/balances";
import { BalanceType } from "@/generated/prisma/enums";
import {
  HASHRATE_PER_USDT,
  MIN_HASHRATE_PURCHASE_USDT,
  HASHRATE_TERM_DAYS,
  levelForHashrate,
  hasActivatedDashboard,
  totalActiveSoldMhs,
  getFleetCapacityMhs,
} from "@/lib/mining";
import { MINING_FUNDING_SOURCES } from "@/lib/mining-shared";
import { getMiningEconomicsConfig } from "@/lib/mining-settings";

const bodySchema = z.object({
  amountUsdt: z.number().min(MIN_HASHRATE_PURCHASE_USDT),
  source: z.enum(MINING_FUNDING_SOURCES).default("GAME_REWARD_USDT"),
});

// POST /api/mining/purchase-power — mining v2 economy model.
// H(MH/s) = U x 25, 5 USDT minimum, fixed 180-day term (was 22.5 MH/s
// and 30 days pre-v2). Requires the dashboard to be activated first
// (doc 6.1 step sequence). Funding sources match doc 6.2's table: Game
// Reward USDT, Referral USDT, Deposited USDT (Play USDT), and converted
// Mined DOGE (Recycled USDT).
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Minimum hashrate purchase is ${MIN_HASHRATE_PURCHASE_USDT} USDT.` },
      { status: 400 }
    );
  }
  const { amountUsdt, source } = parsed.data;

  if (!(await hasActivatedDashboard(session.walletProfileId))) {
    return NextResponse.json({ error: "Activate the mining dashboard first (1 Game USDT)." }, { status: 403 });
  }

  const config = await getMiningEconomicsConfig();
  if (config.newContractsPaused) {
    return NextResponse.json(
      { error: "New mining contracts are temporarily paused. Existing contracts are unaffected." },
      { status: 403 }
    );
  }

  const balances = await getWalletBalances(session.walletProfileId);
  const available =
    source === "GAME_REWARD_USDT"
      ? balances.gameRewardUsdt
      : source === "REFERRAL_USDT"
      ? balances.referralUsdt
      : source === "PLAY_USDT"
      ? balances.playUsdt
      : balances.recycledUsdt;
  if (available < amountUsdt) {
    return NextResponse.json({ error: "Not enough balance for that source." }, { status: 402 });
  }

  const hashrateMhs = Math.round(amountUsdt * HASHRATE_PER_USDT * 1e4) / 1e4;

  // Doc "Development acceptance criteria": "Hashrate may not be sold
  // when available verified capacity is insufficient." Fleet capacity
  // is now admin-configurable (MiningEconomicsConfig.fleetCapacityMhs,
  // default 16,000 — "one L9," fully sellable) instead of the old
  // static SELLABLE_CAPACITY_MHS=14,400 constant.
  const [alreadySold, fleetCapacityMhs] = await Promise.all([totalActiveSoldMhs(), getFleetCapacityMhs()]);
  if (alreadySold + hashrateMhs > fleetCapacityMhs) {
    return NextResponse.json(
      { error: "Not enough verified mining capacity available for that purchase right now." },
      { status: 409 }
    );
  }

  const startsAt = new Date();
  const expiresAt = new Date(startsAt.getTime() + HASHRATE_TERM_DAYS * 24 * 60 * 60 * 1000);

  const contract = await db.$transaction(async (tx) => {
    await tx.ledgerEntry.create({
      data: {
        walletProfileId: session.walletProfileId,
        balanceType: source as BalanceType,
        amount: -amountUsdt,
        reason: "mining_power_purchase",
      },
    });
    return tx.miningContract.create({
      data: {
        walletProfileId: session.walletProfileId,
        level: levelForHashrate(hashrateMhs),
        miningPower: hashrateMhs,
        termDays: HASHRATE_TERM_DAYS,
        pricePaidUsdt: amountUsdt,
        startsAt,
        expiresAt,
        // Snapshotted at purchase time — a later admin change to the
        // platform default never retroactively changes this contract's
        // own promised ROI (see MiningContract.targetRoiPct doc-comment).
        targetRoiPct: Number(config.targetRoiPct),
      },
    });
  });

  return NextResponse.json({
    contractId: contract.id,
    level: contract.level,
    miningPower: Number(contract.miningPower),
    expiresAt: contract.expiresAt,
  });
}
