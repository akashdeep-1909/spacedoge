import { db } from "@/lib/db";
import { GameMode } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { REFERRAL_L1_PCT, REFERRAL_L2_PCT } from "@/lib/game-config";

// Admin-editable game mode parameters — DB-backed, lazily seeded from
// the exact values src/lib/game-config.ts's GAME_MODE_CONFIG/
// PREFUNDED_POOL_USDT/cooldown constants used to hardcode, so nothing
// changes behaviorally until an admin actually edits a row. Same
// convention as src/lib/settings.ts's seedWithdrawChainsIfEmpty() →
// getWithdrawChainConfigs().
const PLAYERS = 4;

const SEED_DEFAULTS: Record<
  GameMode,
  {
    label: string;
    description: string;
    entryFeeUsdt: number;
    durationSec: number;
    prefundedPoolUsdt: number | null;
    cooldownHours: number | null;
    eligibilityWindowHours: number | null;
    eligibilityMinPlays: number | null;
    sortOrder: number;
  }
> = {
  PRACTICE: {
    label: "Demo",
    description: "A 60-second practice round, zero risk, sharpen your reflexes before playing for real stakes.",
    entryFeeUsdt: 0,
    durationSec: 60,
    prefundedPoolUsdt: null,
    cooldownHours: null,
    eligibilityWindowHours: null,
    eligibilityMinPlays: null,
    sortOrder: 0,
  },
  QUICK_RUSH: {
    label: "Rookie Rush",
    description: "A 60-second round with a light hazard field and full lives to spare, the ideal starting point for your first real match.",
    entryFeeUsdt: 1,
    durationSec: 60,
    prefundedPoolUsdt: null,
    cooldownHours: null,
    eligibilityWindowHours: null,
    eligibilityMinPlays: null,
    sortOrder: 1,
  },
  EXPLORER_RUSH: {
    label: "Explorer Rush",
    description: "60 seconds against a denser hazard field, the natural next step once dodging becomes second nature.",
    entryFeeUsdt: 2,
    durationSec: 60,
    prefundedPoolUsdt: null,
    cooldownHours: null,
    eligibilityWindowHours: null,
    eligibilityMinPlays: null,
    sortOrder: 2,
  },
  PRO_RUSH: {
    label: "Pro Rush",
    description: "A longer 90-second round with sharper competition and a heavier hazard field, for players ready to push their score further.",
    entryFeeUsdt: 5,
    durationSec: 90,
    prefundedPoolUsdt: null,
    cooldownHours: null,
    eligibilityWindowHours: null,
    eligibilityMinPlays: null,
    sortOrder: 3,
  },
  ELITE_RUSH: {
    label: "Elite Rush",
    description: "90 seconds of high-stakes play against a near-maximum hazard field, for confident players chasing a bigger prize pool.",
    entryFeeUsdt: 10,
    durationSec: 90,
    prefundedPoolUsdt: null,
    cooldownHours: null,
    eligibilityWindowHours: null,
    eligibilityMinPlays: null,
    sortOrder: 4,
  },
  CHAMPION_RUSH: {
    label: "Champion Rush",
    description: "90 seconds against the densest hazard field on the ladder, competing for the biggest prize pool, Coin Rush's top tier.",
    entryFeeUsdt: 25,
    durationSec: 90,
    prefundedPoolUsdt: null,
    cooldownHours: null,
    eligibilityWindowHours: null,
    eligibilityMinPlays: null,
    sortOrder: 5,
  },
  // Activity-gated: only a wallet that's played eligibilityMinPlays
  // matches (any mode) within eligibilityWindowHours even sees this
  // mode. "played 20 times in the last 24 hours" → minPlays 20.
  SPONSORED_DROP: {
    label: "Sponsored Drop",
    description: "A free 60-second round backed by a $10 sponsored prize pool, unlocks after 20 matches in 24 hours, one entry per day.",
    entryFeeUsdt: 0,
    durationSec: 60,
    prefundedPoolUsdt: 10,
    cooldownHours: 24,
    eligibilityWindowHours: 24,
    eligibilityMinPlays: 20,
    sortOrder: 6,
  },
  // "more than 25 times in the last week" → the literal qualifying
  // minimum is 26 (25 does not qualify, 26 does).
  FORGE_CUP: {
    label: "Weekly Forge Cup",
    description: "A free 90-second round backed by a $30 sponsored prize pool for the platform's most active players, one entry per week.",
    entryFeeUsdt: 0,
    durationSec: 90,
    prefundedPoolUsdt: 30,
    cooldownHours: 24 * 7,
    eligibilityWindowHours: 24 * 7,
    eligibilityMinPlays: 26,
    sortOrder: 7,
  },
  // Gated entirely by checkKolBonusEligibility() (src/lib/
  // referrals.ts) — a lifetime 3-play / 300-PTS-cap check, not the
  // windowed cooldown/eligibility mechanism every other row here uses,
  // so those fields stay null (they'd never fit "exactly 3 plays ever").
  KOL_REFERRAL_BONUS: {
    label: "Referral Bonus Rush",
    description: "A one-time referral gift, 3 free 60-second plays worth up to $0.30 combined, unlocked once by your referrer.",
    entryFeeUsdt: 0,
    durationSec: 60,
    prefundedPoolUsdt: null,
    cooldownHours: null,
    eligibilityWindowHours: null,
    eligibilityMinPlays: null,
    sortOrder: 8,
  },
};

async function seedGameModeConfigsIfEmpty() {
  const count = await db.gameModeConfig.count();
  if (count > 0) return;
  try {
    await db.gameModeConfig.createMany({
      data: (Object.entries(SEED_DEFAULTS) as [GameMode, (typeof SEED_DEFAULTS)[GameMode]][]).map(
        ([mode, cfg]) => ({ mode, ...cfg })
      ),
    });
  } catch {
    // Lost a seed race — fine, another concurrent request already created these.
  }
}

export async function getGameModeConfigs(opts: { enabledOnly?: boolean } = {}) {
  await seedGameModeConfigsIfEmpty();
  return db.gameModeConfig.findMany({
    where: opts.enabledOnly ? { enabled: true } : undefined,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function getGameModeConfig(mode: GameMode) {
  await seedGameModeConfigsIfEmpty();
  const cfg = await db.gameModeConfig.findUnique({ where: { mode } });
  // Defensive fallback — should be unreachable once seeded, but never
  // let a missing row silently break match creation.
  if (cfg) return cfg;
  const fallback = SEED_DEFAULTS[mode];
  return {
    id: "",
    mode,
    enabled: true,
    ...fallback,
    entryFeeUsdt: fallback.entryFeeUsdt as unknown as Prisma.Decimal,
    prefundedPoolUsdt: fallback.prefundedPoolUsdt as unknown as Prisma.Decimal | null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

// Same room-allocation math src/lib/game-config.ts's computeRoomEconomics
// always used (T = entryFee x 4, 70% prize pool / 30% platform fee),
// just resolved from a DB-backed config object instead of the static
// GAME_MODE_CONFIG lookup, so an admin-edited fee/pool takes effect
// immediately at the next match/lobby created.
export function computeRoomEconomicsFromConfig(cfg: {
  entryFeeUsdt: number;
  durationSec: number;
  prefundedPoolUsdt: number | null;
}) {
  if (cfg.prefundedPoolUsdt !== null) {
    return {
      players: PLAYERS,
      durationSec: cfg.durationSec,
      entryFeeUsdt: cfg.entryFeeUsdt,
      grossEntries: 0,
      platformFeeUsdt: 0,
      miningReserveUsdt: 0,
      referralReserveUsdt: 0,
      prizePoolUsdt: cfg.prefundedPoolUsdt,
    };
  }
  const T = cfg.entryFeeUsdt * PLAYERS;
  const prizePoolUsdt = round6(T * 0.7);
  const platformFeeUsdt = round6(T * 0.3);
  const referralReserveUsdt = round6(platformFeeUsdt * (REFERRAL_L1_PCT + REFERRAL_L2_PCT));
  return {
    players: PLAYERS,
    durationSec: cfg.durationSec,
    entryFeeUsdt: cfg.entryFeeUsdt,
    grossEntries: T,
    prizePoolUsdt,
    platformFeeUsdt,
    miningReserveUsdt: 0,
    referralReserveUsdt,
  };
}

// Re-entry cooldown status for a promo mode (SPONSORED_DROP/FORGE_CUP's
// "one entry per wallet per 24h/week") — same query POST /api/matches
// already uses to actually block a re-entry, surfaced here too so the
// Play page can show a disabled "Played" button instead of the wallet
// only finding out after tapping Play and hitting a 429.
export interface ModeCooldownStatus {
  onCooldown: boolean;
  nextEligibleAt: string | null;
}

export async function checkModeCooldown(
  walletProfileId: string,
  mode: GameMode,
  cfg: { cooldownHours: number | null }
): Promise<ModeCooldownStatus> {
  if (!cfg.cooldownHours) return { onCooldown: false, nextEligibleAt: null };
  const since = new Date(Date.now() - cfg.cooldownHours * 60 * 60 * 1000);
  const recent = await db.matchParticipant.findFirst({
    where: { walletProfileId, isBot: false, match: { mode, createdAt: { gte: since } } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!recent) return { onCooldown: false, nextEligibleAt: null };
  return { onCooldown: true, nextEligibleAt: new Date(recent.createdAt.getTime() + cfg.cooldownHours * 60 * 60 * 1000).toISOString() };
}

export interface PromoEligibility {
  eligible: boolean;
  playsInWindow: number;
  playsNeeded: number;
}

// Activity gate for SPONSORED_DROP/FORGE_CUP (and any future mode an
// admin configures the same way) — a wallet must have played at least
// eligibilityMinPlays matches (any mode, real participant rows only)
// within the last eligibilityWindowHours. Null on either field means
// "no gate" — always eligible, which is every stakes/free mode today.
export async function checkPromoEligibility(
  walletProfileId: string,
  cfg: { eligibilityWindowHours: number | null; eligibilityMinPlays: number | null }
): Promise<PromoEligibility> {
  if (!cfg.eligibilityWindowHours || !cfg.eligibilityMinPlays) {
    return { eligible: true, playsInWindow: 0, playsNeeded: 0 };
  }
  const since = new Date(Date.now() - cfg.eligibilityWindowHours * 60 * 60 * 1000);
  const playsInWindow = await db.matchParticipant.count({
    where: { walletProfileId, isBot: false, createdAt: { gte: since } },
  });
  return { eligible: playsInWindow >= cfg.eligibilityMinPlays, playsInWindow, playsNeeded: cfg.eligibilityMinPlays };
}
