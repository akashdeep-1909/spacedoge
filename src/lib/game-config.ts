import { GameMode } from "@/generated/prisma/enums";

// v3 economy: exactly four paid players per room. Room allocation
// formula (identical for every paid tier):
//   T = 4 x E         total room entries
//   P = 0.70 T        player prize pool (top 3, proportional to score)
//   O = 0.30 T        platform fee — treasury's gross cut, credited in
//                      full to the platform treasury wallet at match
//                      entry, MINUS whatever referral commission (L1
//                      5% + L2 2% *of O itself*, see
//                      src/lib/referrals.ts) is actually paid out on
//                      that same entry. Mining is no longer funded out
//                      of game entries (was 10%).
export const GAME_MODE_CONFIG: Record<
  GameMode,
  {
    entryFeeUsdt: number;
    players: number;
    durationSec: number;
    label: string;
    paid: boolean;
  }
> = {
  PRACTICE: { entryFeeUsdt: 0, players: 4, durationSec: 60, label: "Demo", paid: false },
  // Enum key kept as QUICK_RUSH (pre-v2 name) — its 1 USDT entry fee
  // already matched "Rookie Rush" exactly, so only the label/split
  // changed here, not the stored enum value. See schema.prisma.
  QUICK_RUSH: { entryFeeUsdt: 1, players: 4, durationSec: 60, label: "Rookie Rush", paid: true },
  EXPLORER_RUSH: { entryFeeUsdt: 2, players: 4, durationSec: 60, label: "Explorer Rush", paid: true },
  PRO_RUSH: { entryFeeUsdt: 5, players: 4, durationSec: 90, label: "Pro Rush", paid: true },
  ELITE_RUSH: { entryFeeUsdt: 10, players: 4, durationSec: 90, label: "Elite Rush", paid: true },
  CHAMPION_RUSH: { entryFeeUsdt: 25, players: 4, durationSec: 90, label: "Champion Rush", paid: true },
  // Pre-v2 free-ticket modes — the v2 spec doesn't mention them (not
  // contradicted), left running under the old prefunded-pool model.
  SPONSORED_DROP: { entryFeeUsdt: 0, players: 4, durationSec: 60, label: "Sponsored Drop", paid: false },
  FORGE_CUP: { entryFeeUsdt: 0, players: 4, durationSec: 90, label: "Weekly Forge Cup", paid: false },
  // KOL referral gift — free entry, exactly 3 lifetime plays per
  // referred wallet, shared 300-PTS cap. See src/lib/referrals.ts.
  KOL_REFERRAL_BONUS: { entryFeeUsdt: 0, players: 4, durationSec: 60, label: "Referral Bonus Rush", paid: false },
};

export const PREFUNDED_POOL_USDT: Partial<Record<GameMode, number>> = {
  SPONSORED_DROP: 10,
  FORGE_CUP: 30,
};

export const SPONSORED_DROP_COOLDOWN_HOURS = 24;
export const FORGE_CUP_COOLDOWN_DAYS = 7;

// v3 economy: two-level referral, carved out of the platform fee (O =
// 0.30T above) and paid at match entry, not settlement — see
// src/lib/referrals.ts. Both are percentages of platformFeeUsdt itself
// (O), not of T — e.g. on a $1 entry, O = $1.20, so L1 = 5% x $1.20 =
// $0.06, not 5% x $4.
export const REFERRAL_L1_PCT = 0.05;
export const REFERRAL_L2_PCT = 0.02;

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

export function computeRoomEconomics(mode: GameMode) {
  const cfg = GAME_MODE_CONFIG[mode];
  const prefundedPool = PREFUNDED_POOL_USDT[mode];
  if (prefundedPool !== undefined) {
    return {
      ...cfg,
      grossEntries: 0,
      platformFeeUsdt: 0,
      miningReserveUsdt: 0,
      referralReserveUsdt: 0,
      prizePoolUsdt: prefundedPool,
    };
  }
  const T = cfg.entryFeeUsdt * cfg.players;
  const prizePoolUsdt = round6(T * 0.7);
  const platformFeeUsdt = round6(T * 0.3);
  const miningReserveUsdt = 0;
  // Informational upper bound only (both referral levels exist) — the
  // actual amount paid depends on whether the entering player's
  // referral edge(s) exist, resolved at entry time by
  // distributeEntryFeeToTreasuryAndReferrals(), not here.
  const referralReserveUsdt = round6(platformFeeUsdt * (REFERRAL_L1_PCT + REFERRAL_L2_PCT));
  return { ...cfg, grossEntries: T, prizePoolUsdt, platformFeeUsdt, miningReserveUsdt, referralReserveUsdt };
}

// Rank-tiered split, used only by the weekly leaderboard (src/lib/
// leaderboard.ts) — a top-20-across-the-week aggregate ranking the v2
// economy spec doesn't address, kept on its pre-v2 model. Single-room
// settlement uses flatRateReward() below instead, per spec.
export const PRIZE_SPLIT: Record<number, number> = { 1: 0.55, 2: 0.3, 3: 0.15 };

export function prizeForRank(prizePoolUsdt: number, rank: number): number {
  const pct = PRIZE_SPLIT[rank] ?? 0;
  return Math.round(prizePoolUsdt * pct * 1e6) / 1e6;
}

// v3 economy: flat conversion rate — 1000 PTS = 1 USDT, always, for
// everyone, so a player's own score has a fixed, predictable dollar
// value instead of depending on what the other 3 players in that
// specific room happened to score. Rank 4 is still excluded (XP/
// leaderboard only, no Game USDT).
//
// That flat rate is NOT paid unconditionally, though — it's capped at
// that match's own prize pool (funded by entry fees), same self-funding
// guarantee the old proportional-to-pool formula had. In the ordinary
// case (pool comfortably covers what the top 3 earned at the flat
// rate) everyone gets their exact flat-rate value. Only if the top
// 3's combined flat-rate value would exceed the pool does everyone
// get scaled down proportionally to their score share — the platform
// can never pay out more than that match's entries actually funded.
export const PTS_TO_USDT_RATE = 1 / 1000; // 1000 PTS = $1
export const MIN_PTS_CONVERSION = 100; // $0.10 floor — small enough to feel usable, above dust

export function flatRateReward(prizePoolUsdt: number, myScore: number, top3Scores: number[]): number {
  const myFlatValue = myScore * PTS_TO_USDT_RATE;
  const totalFlatValue = top3Scores.reduce((sum, s) => sum + s * PTS_TO_USDT_RATE, 0);
  if (totalFlatValue <= 0) return 0;
  const scale = totalFlatValue <= prizePoolUsdt ? 1 : prizePoolUsdt / totalFlatValue;
  return Math.round(myFlatValue * scale * 1e8) / 1e8; // internal precision to 8dp per doc 3.5; ledger stores exact amount
}

// Deterministic PRNG (mulberry32) seeded from the match's mapSeed so
// bot scores are reproducible and NOT settable by the client — a
// lightweight stand-in for the real-time server-authoritative bot AI
// described in doc section 18.1. This is a known simplification: the
// human player's score is still client-reported in this build and
// is NOT yet cryptographically/anti-cheat validated. Production must
// replace this with the real-time server (Colyseus/WebSocket rooms,
// doc section 16.1) running authoritative physics for every entity.
export function seededRandom(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function random() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------
// Per-mode difficulty + visual theme (Coin Rush Arena, src/components/
// game/CoinRushArena.tsx). Gameplay used to be identical across every
// mode — only entry fee/duration differed. This ramps hazard density,
// hazard speed, and lives in step with entry fee (Practice easiest,
// Champion Rush hardest) and gives each mode its own color palette so
// modes read as visually distinct, not just differently labeled.
// EXPLORER_RUSH keeps the exact original hand-tuned values (see the
// "tuned up from an earlier pass" comment in CoinRushArena.tsx) so the
// one mode that was actually playtested doesn't regress — Practice eases
// down from there, Pro/Elite/Champion ramp up from there.
//
// CAP: total hazard count (hunterCount+dasherCount+mineCount) never
// exceeds 14 across any tier. That number isn't arbitrary — the
// component's own history (see CoinRushArena.tsx) already tried a
// 14-hazard/3-life/1.2s-invuln field once and rejected it as "dense
// enough that even careful play burned all 3 lives almost immediately."
// A first pass here went to 18 hazards + 3 lives for Champion Rush,
// which regressed straight back into that exact instant-death trap.
// Every paid tier below now also keeps 4 starting lives (only Practice
// gets a bonus 5th) — losing lives, not just points, is what ends a
// match early, so that axis stays fixed and difficulty differentiates
// mainly through hazard speed, item scarcity, and carry-loss-per-hit
// instead of "how fast can this kill you."
//
// The two free/promo modes (activity-gated, not fee-tiered) are pinned
// to an existing paid tier's curve rather than inventing a bespoke one:
// Sponsored Drop (daily-activity reward) rides Explorer's moderate
// tier, Weekly Forge Cup (the marquee weekly event) rides Champion's
// hardest tier.
// ---------------------------------------------------------------------
export interface ModeDifficulty {
  hunterCount: number;
  dasherCount: number;
  mineCount: number;
  itemCount: number;
  startLives: number;
  hazardSpeedBase: number; // hazard speed multiplier at match start
  hazardSpeedRampMax: number; // extra multiplier phased in by match end
  hitInvulnSec: number;
  carryPenaltyMult: number; // multiplies the base hunter/dasher/mine carry loss on hit
  playerSpeedMult: number;
  difficultyLabel: "Easy" | "Beginner" | "Moderate" | "Hard" | "Very Hard" | "Extreme";
}

// playerSpeedMult never drops below 1.0 for any paid tier — Explorer's
// own proven-safe margin (hunters at 90-120 vs player at 150, i.e. the
// player is comfortably faster than any hunter at match start) is what
// keeps a match survivable in the opening seconds before a player can
// even start kiting. A first pass here slowed the player down on top of
// speeding hazards up for the harder tiers, which shrank that margin to
// almost nothing right at match start (measured: hunters at up to 138
// vs a 144 player) — exactly when a player has the least room to react.
// Only Practice gets a speed bonus (an easy-mode perk); every paid tier
// keeps the player at full speed and differentiates difficulty through
// hazard count/speed/invuln/penalty instead.
export const DIFFICULTY_BY_MODE: Record<GameMode, ModeDifficulty> = {
  PRACTICE: { hunterCount: 2, dasherCount: 1, mineCount: 2, itemCount: 34, startLives: 5, hazardSpeedBase: 0.8, hazardSpeedRampMax: 0.3, hitInvulnSec: 2.0, carryPenaltyMult: 0.6, playerSpeedMult: 1.1, difficultyLabel: "Easy" },
  QUICK_RUSH: { hunterCount: 3, dasherCount: 2, mineCount: 3, itemCount: 32, startLives: 4, hazardSpeedBase: 0.9, hazardSpeedRampMax: 0.4, hitInvulnSec: 1.8, carryPenaltyMult: 0.85, playerSpeedMult: 1.05, difficultyLabel: "Beginner" },
  EXPLORER_RUSH: { hunterCount: 4, dasherCount: 2, mineCount: 4, itemCount: 30, startLives: 4, hazardSpeedBase: 1, hazardSpeedRampMax: 0.55, hitInvulnSec: 1.6, carryPenaltyMult: 1, playerSpeedMult: 1, difficultyLabel: "Moderate" },
  PRO_RUSH: { hunterCount: 4, dasherCount: 3, mineCount: 4, itemCount: 28, startLives: 4, hazardSpeedBase: 1, hazardSpeedRampMax: 0.55, hitInvulnSec: 1.55, carryPenaltyMult: 1.1, playerSpeedMult: 1, difficultyLabel: "Hard" },
  ELITE_RUSH: { hunterCount: 5, dasherCount: 3, mineCount: 5, itemCount: 26, startLives: 4, hazardSpeedBase: 1.03, hazardSpeedRampMax: 0.58, hitInvulnSec: 1.5, carryPenaltyMult: 1.2, playerSpeedMult: 1, difficultyLabel: "Very Hard" },
  CHAMPION_RUSH: { hunterCount: 5, dasherCount: 4, mineCount: 5, itemCount: 24, startLives: 4, hazardSpeedBase: 1.06, hazardSpeedRampMax: 0.62, hitInvulnSec: 1.45, carryPenaltyMult: 1.35, playerSpeedMult: 1, difficultyLabel: "Extreme" },
  SPONSORED_DROP: { hunterCount: 4, dasherCount: 2, mineCount: 4, itemCount: 30, startLives: 4, hazardSpeedBase: 1, hazardSpeedRampMax: 0.55, hitInvulnSec: 1.6, carryPenaltyMult: 1, playerSpeedMult: 1, difficultyLabel: "Moderate" },
  FORGE_CUP: { hunterCount: 5, dasherCount: 4, mineCount: 5, itemCount: 24, startLives: 4, hazardSpeedBase: 1.06, hazardSpeedRampMax: 0.62, hitInvulnSec: 1.45, carryPenaltyMult: 1.35, playerSpeedMult: 1, difficultyLabel: "Extreme" },
  // Same easy curve as Practice — the human's reward is capped and
  // rank-independent regardless of how well they play, so there's no
  // reason to make this one hard.
  KOL_REFERRAL_BONUS: { hunterCount: 2, dasherCount: 1, mineCount: 2, itemCount: 34, startLives: 5, hazardSpeedBase: 0.8, hazardSpeedRampMax: 0.3, hitInvulnSec: 2.0, carryPenaltyMult: 0.6, playerSpeedMult: 1.1, difficultyLabel: "Easy" },
};

export interface ModeTheme {
  bgTop: string; bgMid: string; bgBottom: string; // canvas background gradient, top to bottom
  accent: string; // vault-open glow, HUD rank accent, mode-card accent
  shipColor: string; // "you" ship color
  modalGlow: string; // tint for the full-screen match overlay behind the arena
}

export const THEME_BY_MODE: Record<GameMode, ModeTheme> = {
  PRACTICE: { bgTop: "#062017", bgMid: "#0e3a28", bgBottom: "#020806", accent: "#4dffb8", shipColor: "#4dffb8", modalGlow: "rgba(77,255,184,.3)" },
  QUICK_RUSH: { bgTop: "#040c16", bgMid: "#0a1c33", bgBottom: "#02060c", accent: "#3cc4ff", shipColor: "#3cc4ff", modalGlow: "rgba(60,196,255,.28)" },
  // Original hand-tuned visuals, unchanged — the canonical look every
  // other mode's palette is designed to diverge from.
  EXPLORER_RUSH: { bgTop: "#050a10", bgMid: "#07121b", bgBottom: "#030507", accent: "#77f2c7", shipColor: "#33f2a4", modalGlow: "rgba(119,242,199,.22)" },
  PRO_RUSH: { bgTop: "#0a0616", bgMid: "#190a32", bgBottom: "#05030a", accent: "#c084fc", shipColor: "#c084fc", modalGlow: "rgba(192,132,252,.3)" },
  ELITE_RUSH: { bgTop: "#150505", bgMid: "#2c0808", bgBottom: "#0a0202", accent: "#ff8a5c", shipColor: "#ff8a5c", modalGlow: "rgba(255,138,92,.3)" },
  CHAMPION_RUSH: { bgTop: "#130d02", bgMid: "#291c04", bgBottom: "#080601", accent: "#f4c15d", shipColor: "#f4c15d", modalGlow: "rgba(244,193,93,.32)" },
  SPONSORED_DROP: { bgTop: "#150418", bgMid: "#2b0a34", bgBottom: "#08020c", accent: "#ff4fd8", shipColor: "#ff4fd8", modalGlow: "rgba(255,79,216,.28)" },
  FORGE_CUP: { bgTop: "#04121a", bgMid: "#082738", bgBottom: "#02080c", accent: "#7ad8ff", shipColor: "#7ad8ff", modalGlow: "rgba(122,216,255,.3)" },
  // Gold/mint "gift" palette — visually distinct from Practice's green
  // so it reads as its own promotional thing, not just Practice again.
  KOL_REFERRAL_BONUS: { bgTop: "#1a1204", bgMid: "#332405", bgBottom: "#0a0702", accent: "#f4c15d", shipColor: "#4dffb8", modalGlow: "rgba(244,193,93,.3)" },
};

// ---------------------------------------------------------------------
// Anti-cheat score-plausibility ceiling — src/app/api/matches/[id]/
// settle/route.ts (instant play) and src/app/api/matches/[id]/results/
// route.ts (lobby play) both call this instead of each hardcoding their
// own flat per-second constant (they used to, and had to be kept "in
// sync by eye" — the exact drift this centralizes away). A flat ceiling
// stopped being safe once difficulty (and therefore real achievable
// score) started varying by mode above: an easier mode's extra items
// and lighter hit penalty legitimately let a real player collect faster
// than a harder mode's flat cap assumed, which is what zeroed out a
// genuine score as "outside plausible range." Scaled by itemCount
// (more coins on screen -> less travel time between pickups -> higher
// real collection rate) and carryPenaltyMult (a lighter hit penalty
// keeps more of what was collected). EXPLORER_RUSH's own numbers reduce
// this to exactly the original flat 6/sec constant, so the one mode
// this was actually tuned against doesn't regress. Still generous, not
// tuned against real play data, same as the constant it replaces.
const BASE_MAX_SCORE_PER_SECOND = 6; // bronze(1)/silver(3)/gold(10) mix, at EXPLORER_RUSH's baseline tuning
export function maxPlausibleScorePerSecond(mode: GameMode): number {
  const diff = DIFFICULTY_BY_MODE[mode] ?? DIFFICULTY_BY_MODE.EXPLORER_RUSH;
  const baseline = DIFFICULTY_BY_MODE.EXPLORER_RUSH;
  return (BASE_MAX_SCORE_PER_SECOND * (diff.itemCount / baseline.itemCount)) / diff.carryPenaltyMult;
}

export function maxPlausibleScore(mode: GameMode, durationPlayedSec: number): number {
  return Math.max(1, durationPlayedSec) * maxPlausibleScorePerSecond(mode);
}

export function botScore(mapSeed: string, botIndex: number, durationSec: number): number {
  const rand = seededRandom(`${mapSeed}:bot:${botIndex}`);
  // Bots collect roughly 1 low-value item every ~1.5-3s at a modest pace.
  const itemsPerSec = 0.35 + rand() * 0.35;
  const avgValue = 2 + rand() * 3; // bronze/silver mix
  return Math.round(durationSec * itemsPerSec * avgValue);
}

// ---------------------------------------------------------------------
// Match-result ranking + reward — used by src/app/api/matches/[id]/
// settle/route.ts (instant play) and .../results/route.ts (lobby play)
// for actual match settlement. flatRateReward/PRIZE_SPLIT above are
// untouched and still used by the separate weekly leaderboard aggregate
// (src/lib/leaderboard.ts) — a different, pre-v2 model this doesn't
// replace.
//
// Two rules, per product spec:
//
// 1. Bot anti-farming rule — generalized across every human/bot mix a
//    room can have (1-4 real humans, bots filling whatever seats are
//    left, see rankBotMatch()'s own doc-comment for the exact per-mix
//    breakdown). Exactly one bot — the single weakest one — ever
//    competes against humans on real score; every OTHER bot is
//    guaranteed above all humans regardless of its score, so a human
//    (or humans) can never farm a top rank purely by being better than
//    a bot that was never actually in contention. The one bot that
//    DOES compete is decided by actual score, never a coin flip — an
//    earlier version randomized who got 3rd vs 4th in the 1-human case
//    regardless of score, which produced results like a 0-point human
//    ranking above a 73-point bot — confusing and clearly wrong once
//    seen in practice. A full room of 4 real humans has no bots at all
//    and ranks purely by score, exactly as before this rule existed.
//
// 2. Rank-tiered randomized reward — the previous formula paid roughly
//    "your score, converted to PTS, capped by the pool" (still true for
//    the weekly leaderboard, untouched). This model pays a target
//    amount per rank (1st/2nd/3rd), independent of how high that rank's
//    actual gameplay score was: reward = target PTS; bonus PTS =
//    whatever top-up was needed to reach it (0 if gameplay already met
//    or exceeded the target — a high score still displays as the match
//    score, it just can't inflate the economic reward past the tier's
//    target). The target itself is RANDOMIZED within a per-rank range
//    every match, not a fixed split — "everytime 1300,900,600 fixed not
//    good make it random." Each rank draws independently within its own
//    range (1st 1,250-1,500 / 2nd 600-900 / 3rd 400-600 PTS, expressed
//    below as fractions of a 2,800 PTS reference pool so they scale to
//    any entry-fee tier), then all three draws are normalized to sum to
//    exactly the reward pool — so the total distributed is always
//    exactly the pool regardless of which random values landed, same
//    "never exceed the reward pool" guarantee the old fixed split had,
//    just with real match-to-match variety now (see
//    computeRankTierTargetsPts()). Seeded from the match's own mapSeed —
//    same fairness/reproducibility convention as every other random
//    draw in this file (bot scores, hazard layout, rankBotMatch's
//    3rd/4th coin flip) — never client-influenceable. Rank 4 always
//    gets 0.
// ---------------------------------------------------------------------

export interface RankTierTargets { 1: number; 2: number; 3: number }

const RANK_TIER_SHARE_RANGE: Record<1 | 2 | 3, [number, number]> = {
  1: [1250 / 2800, 1500 / 2800],
  2: [600 / 2800, 900 / 2800],
  3: [400 / 2800, 600 / 2800],
};

export function computeRankTierTargetsPts(prizePoolUsdt: number, mapSeed: string): RankTierTargets {
  const poolPts = Math.round(prizePoolUsdt * 1000);
  const rand = seededRandom(`${mapSeed}:rewardShares`);
  const raw: RankTierTargets = {
    1: RANK_TIER_SHARE_RANGE[1][0] + rand() * (RANK_TIER_SHARE_RANGE[1][1] - RANK_TIER_SHARE_RANGE[1][0]),
    2: RANK_TIER_SHARE_RANGE[2][0] + rand() * (RANK_TIER_SHARE_RANGE[2][1] - RANK_TIER_SHARE_RANGE[2][0]),
    3: RANK_TIER_SHARE_RANGE[3][0] + rand() * (RANK_TIER_SHARE_RANGE[3][1] - RANK_TIER_SHARE_RANGE[3][0]),
  };
  const rawTotal = raw[1] + raw[2] + raw[3];
  const rank1 = Math.round(poolPts * (raw[1] / rawTotal));
  const rank2 = Math.round(poolPts * (raw[2] / rawTotal));
  // Rank 3 absorbs whatever rounding (and normalization) left over, so
  // rank1+rank2+rank3 always equals poolPts exactly — never more, never
  // less. Spec section 8's "total payouts above reward pool" is
  // structurally impossible here, not just checked after the fact.
  const rank3 = poolPts - rank1 - rank2;
  return { 1: rank1, 2: rank2, 3: rank3 };
}

export interface PoolSummary {
  totalUsdt: number;
  totalPts: number;
  platformFeeUsdt: number;
  platformFeePts: number;
  rewardPoolUsdt: number;
  rewardPoolPts: number;
}

// Section 7 "Pool Summary" numbers, shared by both settle/route.ts and
// results/route.ts so the two routes' API responses read identically to
// the match-result reveal UI (src/components/game/MatchResultReveal.tsx).
export function computePoolSummary(entryFeeUsdt: number, platformFeeUsdt: number, prizePoolUsdt: number): PoolSummary {
  const totalUsdt = entryFeeUsdt * 4;
  return {
    totalUsdt,
    totalPts: Math.round(totalUsdt * 1000),
    platformFeeUsdt,
    platformFeePts: Math.round(platformFeeUsdt * 1000),
    rewardPoolUsdt: prizePoolUsdt,
    rewardPoolPts: Math.round(prizePoolUsdt * 1000),
  };
}

export interface RankTierResult {
  rank: number;
  targetPts: number; // this rank's fixed share of the reward pool (0 for rank 4+)
  gameplayPts: number; // raw in-game score — stored/shown separately, never itself the reward
  bonusPts: number; // top-up needed to reach targetPts (0 if gameplay already met/exceeded it)
  rewardPts: number; // final economic reward — always exactly targetPts for ranks 1-3, 0 for 4+
  rewardUsdt: number;
}

export function rankTierResult(rank: number, gameplayScore: number, targets: RankTierTargets): RankTierResult {
  let targetPts = 0;
  if (rank === 1 || rank === 2 || rank === 3) targetPts = targets[rank];
  const bonusPts = Math.max(0, targetPts - gameplayScore);
  return { rank, targetPts, gameplayPts: gameplayScore, bonusPts, rewardPts: targetPts, rewardUsdt: targetPts / 1000 };
}

// Rule 1 above, generalized to every human/bot mix this app's fixed
// 4-seat rooms can produce (1-3 humans + bots filling the rest — a
// full room of 4 humans has no bots at all and needs no special
// handling). Exactly one bot — the single WEAKEST one — ever competes
// against humans on real score; every OTHER bot is guaranteed to rank
// above all humans, no matter its score. With only one bot total,
// there's no "other bot" to be weakest relative to, so that lone bot
// is instead fully guaranteed (rank 1) and the humans competing for
// the remaining ranks aren't sharing a seat with it at all — with 3
// real humans already filling the other seats, the competition that
// actually matters is entirely among them regardless of where the
// filler bot lands.
//
//   3 bots + 1 human — top 2 bots guaranteed; human vs weakest bot for 3rd/4th.
//   2 bots + 2 humans — top 1 bot guaranteed; 2 humans + weakest bot for 2nd-4th.
//   1 bot  + 3 humans — that bot guaranteed rank 1; 3 humans rank 2nd-4th by score alone.
//   0 bots + 4 humans — everyone ranks by score, no bot mechanic at all.
//
// Only needs isBot/score from each participant; returns the same
// objects with a `rank` field attached (unsorted — callers that need
// leaderboard order should sort the result by .rank).
export function rankBotMatch<T extends { isBot: boolean; score: number }>(
  participants: T[],
  mapSeed: string
): (T & { rank: number })[] {
  const humans = participants.filter((p) => !p.isBot);
  const bots = [...participants.filter((p) => p.isBot)].sort((a, b) => b.score - a.score);
  if (bots.length === 0) {
    return [...participants].sort((a, b) => b.score - a.score).map((p, i) => ({ ...p, rank: i + 1 }));
  }

  const contestingBot = bots.length >= 2 ? bots[bots.length - 1] : null;
  const guaranteedBots = contestingBot ? bots.slice(0, -1) : bots;

  // A bot guaranteed above every human regardless of score could still
  // display a LOWER "Collected" number than a human it outranks — reads
  // as an obviously rigged result to a real player ("I collected more
  // than that bot, why did it place above me?"). Bump any guaranteed
  // bot's displayed score just past the best human's whenever it
  // wouldn't otherwise clear it, deterministically (seeded off mapSeed,
  // so it's reproducible and never arbitrary) — this only changes what
  // gets shown/stored as that bot's score; the reward itself is driven
  // entirely by rank + the tier target (rankTierResult), never by this
  // number. Re-sorted after bumping so the guaranteed bots' own relative
  // order still matches their (possibly bumped) scores.
  const bestHumanScore = humans.length ? Math.max(...humans.map((h) => h.score)) : 0;
  const bumpRand = seededRandom(`${mapSeed}:botScoreBump`);
  const bumpedGuaranteed = guaranteedBots.map((b) => {
    const score = b.score <= bestHumanScore ? bestHumanScore + Math.round(8 + bumpRand() * 25) : b.score;
    return { ...b, score };
  });
  bumpedGuaranteed.sort((a, b) => b.score - a.score);
  const ranked: (T & { rank: number })[] = bumpedGuaranteed.map((b, i) => ({ ...b, rank: i + 1 }));

  const contestants = contestingBot ? [...humans, contestingBot] : humans;
  // Tie-break deterministically (seeded) rather than by array order —
  // same convention as every other random draw in this file — rather
  // than letting insertion order silently decide ties.
  const tieRand = seededRandom(`${mapSeed}:botRankTie`);
  const contestRanked = [...contestants]
    .sort((a, b) => b.score - a.score || (tieRand() < 0.5 ? -1 : 1))
    .map((p, i) => ({ ...p, rank: guaranteedBots.length + 1 + i }));

  return [...ranked, ...contestRanked];
}

// GameMode.KOL_REFERRAL_BONUS variant of rankBotMatch above: this mode
// is ALWAYS exactly 1 human + 3 bots (never mixed with real
// multiplayer, never any other seat count), and unlike the ordinary
// anti-farming rule — where the single weakest bot still "contests"
// the human on real score, so a human COULD out-score it — here the
// human must never outrank any bot, full stop. Every bot is guaranteed
// above the human unconditionally, no contesting bot at all. Reuses
// rankBotMatch's seeded score-bump technique (a different seed string
// so the two mechanics never correlate) purely for ranking/display;
// this mode's actual reward is computed independently of rank (see
// settle/route.ts) — a human can still earn their own capped reward
// while placing last.
export function rankKolBonusMatch<T extends { isBot: boolean; score: number }>(
  participants: T[],
  mapSeed: string
): (T & { rank: number })[] {
  const humans = participants.filter((p) => !p.isBot);
  const bots = participants.filter((p) => p.isBot);
  const bestHumanScore = humans.length ? Math.max(...humans.map((h) => h.score)) : 0;

  const bumpRand = seededRandom(`${mapSeed}:kolBotScoreBump`);
  const bumped = bots
    .map((b) => ({
      ...b,
      score: b.score <= bestHumanScore ? bestHumanScore + Math.round(8 + bumpRand() * 25) : b.score,
    }))
    .sort((a, b) => b.score - a.score);
  const ranked: (T & { rank: number })[] = bumped.map((b, i) => ({ ...b, rank: i + 1 }));

  const tieRand = seededRandom(`${mapSeed}:kolRankTie`);
  const humanRanked = [...humans]
    .sort((a, b) => b.score - a.score || (tieRand() < 0.5 ? -1 : 1))
    .map((p, i) => ({ ...p, rank: bumped.length + 1 + i }));

  return [...ranked, ...humanRanked];
}

// Bot display names — a 100-name pool shared by the live arena (src/
// components/game/CoinRushArena.tsx) and the match-results screen (src/
// app/api/matches/[id]/settle+results/route.ts via MatchResultReveal),
// replacing both the old fixed 3-name set (always "@Nova/@Rusty/@Comet",
// every single match) and the fake 0x-address display in results. Which
// names a match's bots get is a seeded shuffle of this pool, keyed by
// that match's own mapSeed — deterministic and reproducible (same
// fairness convention as every other random draw in this file), but a
// completely different draw for a different match, so bot identities
// feel varied and non-repetitive over time instead of the same 3 names
// forever.
export const BOT_NAME_POOL: string[] = [
  "Nova", "Rusty", "Comet", "Blaze", "Orbit", "Nebula", "Photon", "Quasar", "Vortex", "Ember",
  "Frost", "Titan", "Zephyr", "Cosmo", "Flare", "Drift", "Pulse", "Rogue", "Onyx", "Shadow",
  "Raven", "Falcon", "Viper", "Ghost", "Storm", "Aurora", "Eclipse", "Meteor", "Solstice", "Lunar",
  "Astra", "Pixel", "Byte", "Vector", "Cipher", "Static", "Turbo", "Volt", "Circuit", "Rocket",
  "Nomad", "Wraith", "Havoc", "Fury", "Glitch", "Warden", "Sable", "Cinder", "Talon", "Jaguar",
  "Kestrel", "Sparrow", "Hunter", "Ranger", "Scout", "Sentinel", "Phantom", "Specter", "Wisp", "Flicker",
  "Spark", "Bolt", "Thunder", "Cyclone", "Tempest", "Blizzard", "Avalanche", "Tundra", "Glacier", "Magma",
  "Crater", "Asteroid", "Satellite", "Rover", "Voyager", "Pioneer", "Horizon", "Zenith", "Apex", "Summit",
  "Ridge", "Canyon", "Mirage", "Oasis", "Dune", "Wanderer", "Drifter", "Renegade", "Maverick", "Outlaw",
  "Bandit", "Marauder", "Corsair", "Buccaneer", "Privateer", "Raider", "Vanguard", "Paladin", "Crusader", "Phoenix",
];

// Seeded Fisher-Yates shuffle of BOT_NAME_POOL, keyed by mapSeed — the
// first `count` names are guaranteed distinct within that match (no two
// bots in the same room ever get the same name), and the whole draw is
// reproducible from the map seed alone, never client-settable.
export function pickBotNames(mapSeed: string, count: number): string[] {
  const rand = seededRandom(`${mapSeed}:botNames`);
  const pool = [...BOT_NAME_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export function shortenWalletAddress(address: string): string {
  return address.length > 10 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}
