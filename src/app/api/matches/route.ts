import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { GameMode, BalanceType } from "@/generated/prisma/enums";
import { getGameModeConfig, computeRoomEconomicsFromConfig, checkPromoEligibility } from "@/lib/gameModes";
import { getWalletBalances } from "@/lib/balances";
import { distributeEntryFeeToTreasuryAndReferrals, checkKolBonusEligibility } from "@/lib/referrals";

const bodySchema = z.object({
  mode: z.enum([
    "PRACTICE",
    "QUICK_RUSH",
    "EXPLORER_RUSH",
    "PRO_RUSH",
    "ELITE_RUSH",
    "CHAMPION_RUSH",
    "SPONSORED_DROP",
    "FORGE_CUP",
    "KOL_REFERRAL_BONUS",
  ]),
});

// POST /api/matches
// Reserves entry, creates the room and its bot participants. Doc
// section 6.4: status starts RESERVED then flips to IN_MATCH once the
// client confirms the canvas has mounted.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const walletProfile = await db.walletProfile.findUnique({ where: { id: session.walletProfileId } });
  if (!walletProfile) return NextResponse.json({ error: "Wallet profile not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid mode" }, { status: 400 });

  const mode = parsed.data.mode as GameMode;
  const modeCfg = await getGameModeConfig(mode);
  if (!modeCfg.enabled) return NextResponse.json({ error: "This mode isn't available right now." }, { status: 403 });

  const econ = computeRoomEconomicsFromConfig({
    entryFeeUsdt: Number(modeCfg.entryFeeUsdt),
    durationSec: modeCfg.durationSec,
    prefundedPoolUsdt: modeCfg.prefundedPoolUsdt !== null ? Number(modeCfg.prefundedPoolUsdt) : null,
  });

  // Doc section 20.3: age + country declaration required before paid play.
  if (mode !== GameMode.PRACTICE && (!walletProfile.ageConfirmed || !walletProfile.countryCode)) {
    return NextResponse.json({ error: "Complete onboarding before paid play." }, { status: 403 });
  }

  // KOL referral gift — gated entirely by checkKolBonusEligibility()
  // (a lifetime 3-play / 300-PTS cap, not the windowed checkPromoEligibility/
  // cooldown mechanism below), plus a mode-scoped "no 2nd concurrent
  // play" guard: unlike lobby-created matches, instant-play matches
  // have no general one-active-match-at-a-time check, and this mode
  // introduces a cross-match cumulative cap that a double-settle race
  // (2 open KOL_REFERRAL_BONUS matches settled concurrently) could
  // otherwise blow past.
  if (mode === GameMode.KOL_REFERRAL_BONUS) {
    const kol = await checkKolBonusEligibility(walletProfile.id);
    if (!kol.eligible) {
      return NextResponse.json({ error: "No referral bonus plays remaining." }, { status: 403 });
    }
    const openMatch = await db.match.findFirst({
      where: {
        mode: GameMode.KOL_REFERRAL_BONUS,
        status: "IN_MATCH",
        participants: { some: { walletProfileId: walletProfile.id, isBot: false } },
      },
    });
    if (openMatch) {
      return NextResponse.json({ error: "Finish your current free play first." }, { status: 409 });
    }
  }

  if (econ.entryFeeUsdt > 0) {
    const balances = await getWalletBalances(session.walletProfileId);
    if (balances.playUsdt < econ.entryFeeUsdt) {
      return NextResponse.json({ error: "Not enough Deposit USDT." }, { status: 402 });
    }
  }

  // Activity-eligibility gate (admin-configured, e.g. Sponsored Drop
  // needs 20+ plays in the last 24h) — checked independently of, and
  // in addition to, the re-entry cooldown below. See src/lib/gameModes.ts.
  const eligibility = await checkPromoEligibility(walletProfile.id, modeCfg);
  if (!eligibility.eligible) {
    return NextResponse.json(
      {
        error: `This mode unlocks after ${eligibility.playsNeeded} matches played in the qualifying window, you're at ${eligibility.playsInWindow}.`,
      },
      { status: 403 }
    );
  }

  if (modeCfg.cooldownHours) {
    const recent = await db.matchParticipant.findFirst({
      where: {
        walletProfileId: walletProfile.id,
        isBot: false,
        match: { mode, createdAt: { gte: new Date(Date.now() - modeCfg.cooldownHours * 60 * 60 * 1000) } },
      },
    });
    if (recent) {
      return NextResponse.json(
        { error: "You've already entered this free ticket mode, try again later." },
        { status: 429 }
      );
    }
  }

  const mapSeed = randomUUID();

  const match = await db.$transaction(async (tx) => {
    const created = await tx.match.create({
      data: {
        mode,
        entryFeeUsdt: econ.entryFeeUsdt,
        prizePoolUsdt: econ.prizePoolUsdt,
        platformFeeUsdt: econ.platformFeeUsdt,
        miningReserveUsdt: econ.miningReserveUsdt,
        referralReserveUsdt: econ.referralReserveUsdt,
        status: "IN_MATCH",
        mapSeed,
        startedAt: new Date(),
        durationSec: econ.durationSec,
      },
    });

    await tx.matchParticipant.create({
      data: { matchId: created.id, walletProfileId: walletProfile.id, isBot: false },
    });

    // Disclosed bots fill the remaining seats — doc section 5.3:
    // "Bots may fill early rooms only if clearly disclosed and
    // technically unable to receive or remove player rewards." Bots
    // never get a walletProfileId with real balances; they're purely
    // scored rows for ranking.
    for (let i = 1; i < econ.players; i++) {
      const botProfile = await tx.walletProfile.upsert({
        where: { address: `bot:${mapSeed}:${i}` },
        update: {},
        create: { address: `bot:${mapSeed}:${i}`, chainId: 0, ageConfirmed: true },
      });
      await tx.matchParticipant.create({
        data: { matchId: created.id, walletProfileId: botProfile.id, isBot: true },
      });
    }

    if (econ.entryFeeUsdt > 0) {
      await tx.ledgerEntry.create({
        data: {
          walletProfileId: walletProfile.id,
          balanceType: BalanceType.PLAY_USDT,
          amount: -econ.entryFeeUsdt,
          reason: "match_entry",
          refType: "Match",
          refId: created.id,
        },
      });

      // v3 economy: the 30% platform fee (minus any referral commission
      // it funds) is credited for real on every paid entry, win or
      // lose — not deferred to settlement. See src/lib/referrals.ts.
      await distributeEntryFeeToTreasuryAndReferrals(tx, {
        humans: [{ referredWalletProfileId: walletProfile.id }],
        platformFeeUsdt: econ.platformFeeUsdt,
        matchId: created.id,
      });
    }

    return created;
  });

  return NextResponse.json({
    matchId: match.id,
    mapSeed: match.mapSeed,
    mode,
    durationSec: econ.durationSec,
    entryFeeUsdt: econ.entryFeeUsdt,
    prizePoolUsdt: econ.prizePoolUsdt,
    players: econ.players,
  });
}
