import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { BalanceType, GameMode, ReferralStatus } from "@/generated/prisma/enums";
import { REFERRAL_L1_PCT, REFERRAL_L2_PCT } from "@/lib/game-config";
import { getPlatformTreasuryWalletProfileId } from "@/lib/treasury";

export { REFERRAL_L1_PCT, REFERRAL_L2_PCT };

function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

// Doc section 4.4: "the referral relationship must exist before the
// referred player enters the match" — attribution is written when the
// invited wallet first connects, never retroactively. The caller must
// only invoke this for a WalletProfile that was just created.
export async function applyReferralCode(walletProfileId: string, referrerAddress: string) {
  const address = referrerAddress.trim().toLowerCase();
  const referrer = await db.walletProfile.findUnique({ where: { address } });
  if (!referrer || referrer.id === walletProfileId) return; // unknown code or self-referral

  try {
    await db.referral.create({
      data: { referrerProfileId: referrer.id, referredProfileId: walletProfileId },
    });
  } catch (err: unknown) {
    // referredProfileId is @unique — one referral per wallet, ever. A
    // duplicate attempt here is expected (e.g. a retried request), not
    // an error worth surfacing.
    const code = (err as { code?: string } | null)?.code;
    if (code !== "P2002") throw err;
  }
}

// v3 economy: called from within the match-CREATION transaction — from
// src/app/api/matches/route.ts for instant play (always exactly 1
// human), and from src/lib/lobby.ts finalizeLobby() for multiplayer
// rooms (1-4 humans) — immediately after the entry-fee debit(s), not
// at settlement, and not conditioned on winning. Referral commission is
// carved OUT OF the platform's own 30% fee (not on top of it, and not
// a cut of T), so it's owed the instant the entry fee is paid.
//
// Multiplayer rooms (v3 multiplayer): the room's platformFeeUsdt is
// computed exactly once per room, regardless of human count — never
// once per invited human, which would multiply the platform fee. Each
// human's OWN referral tree earns commission off an EQUAL SHARE of
// that one fee (feeBasePerHuman = platformFeeUsdt / humans.length):
//   L1 = 0.05 x feeBasePerHuman   (that human's direct referrer)
//   L2 = 0.02 x feeBasePerHuman   (referrer's own referrer, if one exists)
// With exactly 1 human (the instant-play case), feeBasePerHuman ===
// platformFeeUsdt, so this reduces to byte-for-byte the same math as
// before the multiplayer feature existed — same code path, not a
// parallel one, which is what guarantees the one-human calculation can
// never silently drift from what multiplayer rooms do.
//
// No qualification gate — whatever edge(s) exist at that moment get
// paid. Whatever's left of platformFeeUsdt after every human's L1/L2 is
// credited to the platform treasury wallet ONCE, so the 30% fee is
// always fully accounted for — never lost, never double-paid.
export async function distributeEntryFeeToTreasuryAndReferrals(
  tx: Prisma.TransactionClient,
  params: { humans: { referredWalletProfileId: string }[]; platformFeeUsdt: number; matchId: string }
) {
  const { humans, platformFeeUsdt, matchId } = params;
  if (humans.length === 0) return;

  const feeBasePerHuman = round8(platformFeeUsdt / humans.length);
  let paidOut = 0;

  for (const { referredWalletProfileId } of humans) {
    const l1 = await tx.referral.findUnique({ where: { referredProfileId: referredWalletProfileId } });
    if (!l1) continue;

    const l1Amount = round8(feeBasePerHuman * REFERRAL_L1_PCT);
    if (l1Amount > 0) {
      await tx.ledgerEntry.create({
        data: {
          walletProfileId: l1.referrerProfileId,
          balanceType: BalanceType.REFERRAL_USDT,
          amount: l1Amount,
          reason: "referral_l1",
          refType: "Match",
          refId: matchId,
        },
      });
      paidOut += l1Amount;
    }
    if (l1.status === ReferralStatus.PENDING) {
      await tx.referral.update({
        where: { id: l1.id },
        data: { status: ReferralStatus.QUALIFIED, qualifiedAt: new Date() },
      });
    }

    // Level 2 — the direct referrer's own referrer, one hop up. Only
    // two levels are ever supported: we don't walk further.
    const l2 = await tx.referral.findUnique({ where: { referredProfileId: l1.referrerProfileId } });
    if (l2) {
      const l2Amount = round8(feeBasePerHuman * REFERRAL_L2_PCT);
      if (l2Amount > 0) {
        await tx.ledgerEntry.create({
          data: {
            walletProfileId: l2.referrerProfileId,
            balanceType: BalanceType.REFERRAL_USDT,
            amount: l2Amount,
            reason: "referral_l2",
            refType: "Match",
            refId: matchId,
          },
        });
        paidOut += l2Amount;
      }
    }
  }

  const treasuryNet = round8(platformFeeUsdt - paidOut);
  if (treasuryNet > 0) {
    const treasuryWalletProfileId = await getPlatformTreasuryWalletProfileId(tx);
    await tx.ledgerEntry.create({
      data: {
        walletProfileId: treasuryWalletProfileId,
        balanceType: BalanceType.PLATFORM_FEE_USDT,
        amount: treasuryNet,
        reason: "platform_fee",
        refType: "Match",
        refId: matchId,
      },
    });
  }
}

// Mining v2 economy — recurring DAILY referral reward (not a one-time
// purchase bonus): every day a referred wallet's hashrate contract is
// active, 7% of THAT CONTRACT'S OWN daily electricity-cost deduction is
// carved out — 5% to the direct (L1) referrer, 2% to the extended (L2)
// referrer — converted to DOGE and credited to AVAILABLE_DOGE, same
// asset the contract itself earns. Same product split as the
// match-entry referral system above (that one settles in USDT, this
// one in DOGE, deliberately different ledgers), but the trigger here is
// recurring settlement activity, not a single purchase event — mirrors
// how the match-entry version is "carved out of an existing cost" (the
// platform fee there, the electricity-cost deduction here) rather than
// paid on top as new value.
//
// Called from src/lib/mining.ts settleEpochForDate(), once per relevant
// wallet PER DAY, inside that function's own settlement transaction —
// see MiningReferralCarve's doc-comment for how each contract's share
// of the carve is computed before this is called.
export interface MiningReferralLookup {
  l1ReferralId: string;
  l1ReferrerProfileId: string;
  l1Status: ReferralStatus;
  l2ReferrerProfileId: string | null;
}

// Batch-fetches L1 (direct) and L2 (one hop up) referral edges for a
// set of wallets in exactly two queries, regardless of how many
// contracts/wallets are being settled that day — the settlement loop
// this feeds runs once per contract, so a per-contract query here would
// scale with fleet size instead of staying flat.
export async function batchLookupMiningReferrals(walletProfileIds: string[]): Promise<Map<string, MiningReferralLookup>> {
  const uniqueIds = [...new Set(walletProfileIds)];
  if (uniqueIds.length === 0) return new Map();

  const l1Rows = await db.referral.findMany({ where: { referredProfileId: { in: uniqueIds } } });
  const l1ReferrerIds = [...new Set(l1Rows.map((r) => r.referrerProfileId))];
  const l2Rows = l1ReferrerIds.length > 0 ? await db.referral.findMany({ where: { referredProfileId: { in: l1ReferrerIds } } }) : [];
  const l2ByReferredId = new Map(l2Rows.map((r) => [r.referredProfileId, r]));

  const result = new Map<string, MiningReferralLookup>();
  for (const l1 of l1Rows) {
    const l2 = l2ByReferredId.get(l1.referrerProfileId);
    result.set(l1.referredProfileId, {
      l1ReferralId: l1.id,
      l1ReferrerProfileId: l1.referrerProfileId,
      l1Status: l1.status,
      l2ReferrerProfileId: l2?.referrerProfileId ?? null,
    });
  }
  return result;
}

// Credits one day's aggregated mining-referral DOGE for one (wallet,
// level) pair — called once per wallet per level from within
// settleEpochForDate's own transaction, after every contract's own
// carve for that day has been summed. Idempotent the same way the rest
// of that transaction is: guarded by refType+refId+walletProfileId+
// reason, so a re-run of an already-settled epoch (defense-in-depth;
// settleEpochForDate itself already early-returns on that case) can
// never double-credit.
export async function creditMiningReferralDoge(
  tx: Prisma.TransactionClient,
  params: { walletProfileId: string; level: 1 | 2; amountDoge: number; epochId: string; qualifyReferralId?: string }
) {
  const { walletProfileId, level, amountDoge, epochId, qualifyReferralId } = params;
  if (amountDoge <= 0) return;
  const reason = level === 1 ? "mining_referral_l1" : "mining_referral_l2";

  const already = await tx.ledgerEntry.findFirst({ where: { refType: "MiningEpoch", refId: epochId, walletProfileId, reason } });
  if (!already) {
    await tx.ledgerEntry.create({
      data: {
        walletProfileId,
        balanceType: BalanceType.AVAILABLE_DOGE,
        amount: round8(amountDoge),
        reason,
        refType: "MiningEpoch",
        refId: epochId,
      },
    });
  }

  if (level === 1 && qualifyReferralId) {
    const referral = await tx.referral.findUnique({ where: { id: qualifyReferralId } });
    if (referral?.status === ReferralStatus.PENDING) {
      await tx.referral.update({ where: { id: qualifyReferralId }, data: { status: ReferralStatus.QUALIFIED, qualifiedAt: new Date() } });
    }
  }
}

export const KOL_BONUS_LIFETIME_PLAYS = 3;
export const KOL_BONUS_PTS_CAP = 300; // 0.3 USDT at the fixed 1000 PTS : 1 USDT rate

export interface KolBonusEligibility {
  eligible: boolean; // isKolReferred && playsRemaining > 0
  isKolReferred: boolean;
  playsUsed: number; // 0-3, counts matches CREATED (a started-then-abandoned play still burns a chance)
  playsRemaining: number; // KOL_BONUS_LIFETIME_PLAYS - playsUsed, clamped >= 0
  ptsEarnedSoFar: number;
  ptsCapRemaining: number; // KOL_BONUS_PTS_CAP - ptsEarnedSoFar, clamped >= 0
}

// KOL referral gift (GameMode.KOL_REFERRAL_BONUS): a wallet only
// qualifies if its OWN referrer (the one-hop Referral edge, never
// walked further) is admin-flagged isKol. Everything here is derived
// live from existing tables — no separate mutable counter — matching
// this app's "reconstruct from append-only history" convention used
// everywhere else (balances, activation status, etc.).
//
// Takes an optional transaction client so the settle route
// (src/app/api/matches/[id]/settle/route.ts) can read this INSIDE its
// own transaction for a consistent view of "PTS earned so far" when
// clamping this play's reward against the shared cap.
export async function checkKolBonusEligibility(
  walletProfileId: string,
  client: Prisma.TransactionClient | typeof db = db
): Promise<KolBonusEligibility> {
  const referral = await client.referral.findUnique({
    where: { referredProfileId: walletProfileId },
    include: { referrer: { select: { isKol: true } } },
  });
  const isKolReferred = !!referral?.referrer.isKol;
  if (!isKolReferred) {
    return { eligible: false, isKolReferred: false, playsUsed: 0, playsRemaining: 0, ptsEarnedSoFar: 0, ptsCapRemaining: 0 };
  }

  const [playsUsed, ptsSum] = await Promise.all([
    client.matchParticipant.count({
      where: { walletProfileId, isBot: false, match: { mode: GameMode.KOL_REFERRAL_BONUS } },
    }),
    client.ledgerEntry.aggregate({
      where: { walletProfileId, balanceType: BalanceType.PTS, reason: "kol_referral_bonus" },
      _sum: { amount: true },
    }),
  ]);

  const ptsEarnedSoFar = Math.max(0, Number(ptsSum._sum.amount ?? 0));
  const playsRemaining = Math.max(0, KOL_BONUS_LIFETIME_PLAYS - playsUsed);
  const ptsCapRemaining = Math.max(0, KOL_BONUS_PTS_CAP - ptsEarnedSoFar);

  return {
    eligible: playsRemaining > 0,
    isKolReferred: true,
    playsUsed,
    playsRemaining,
    ptsEarnedSoFar,
    ptsCapRemaining,
  };
}
