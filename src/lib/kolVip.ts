import { db } from "@/lib/db";
import { BalanceType, MatchStatus } from "@/generated/prisma/enums";
import { getKolVipEnabled } from "@/lib/settings";
import { HASHRATE_TERM_DAYS, HASHRATE_PER_USDT, levelForHashrate } from "@/lib/mining-shared";

function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}
function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

// A referred wallet counts as "qualified" for the monthly tally once it
// plays this many paid matches that month AND has activated mining at
// least once (lifetime — "started the launch mining," not necessarily
// within that same month). Both conditions required.
const MIN_QUALIFYING_MATCHES = 5;

// Of the platform's 30% fee on every match entry, 7% already funds the
// ordinary L1 (5%) + L2 (2%) referral commission (src/lib/game-config.ts
// REFERRAL_L1_PCT/REFERRAL_L2_PCT, src/lib/referrals.ts). VIP tiers are
// funded from a flat, separate slice of the KOL's downline's real
// entry-fee revenue — NOT computed as "whatever the ordinary commission
// happens to leave over" (that would be ~27.9%, since the 7% is taken
// from the 30% fee, not from total revenue) — a fixed, easy-to-audit
// 23% (30% − 7%) of downline revenue, confirmed with the user rather
// than assumed.
const VIP_FUNDING_PCT = 0.23;

// ---------------------------------------------------------------------
// Month bounds — same shape as src/lib/leaderboard.ts's currentWeekBounds/
// previousWeekBounds, just calendar-month instead of Monday-start-week.
// ---------------------------------------------------------------------

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function currentMonthBounds(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { periodMonth: monthKey(start), start, end };
}

export function previousMonthBounds(now = new Date()) {
  const { start: currentStart } = currentMonthBounds(now);
  const start = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() - 1, 1));
  return { periodMonth: monthKey(start), start, end: currentStart };
}

// ---------------------------------------------------------------------
// Downline graph — direct (L1) + indirect (L2), reusing the exact
// Referral edges GET /api/referrals already reads. Single-wallet lookup
// (2 queries) — fine for the live, per-request "my own progress" path;
// the monthly batch below loads the WHOLE graph once instead, see
// buildDirectMap().
// ---------------------------------------------------------------------

export async function getDownlineIds(walletProfileId: string): Promise<{ direct: string[]; indirect: string[] }> {
  const direct = await db.referral.findMany({
    where: { referrerProfileId: walletProfileId },
    select: { referredProfileId: true },
  });
  const directIds = direct.map((r) => r.referredProfileId);
  const indirect = directIds.length
    ? await db.referral.findMany({ where: { referrerProfileId: { in: directIds } }, select: { referredProfileId: true } })
    : [];
  return { direct: directIds, indirect: indirect.map((r) => r.referredProfileId) };
}

// Every Referral edge, loaded once — batch-evaluation only. A wallet
// can only ever be referredProfileId once (that column is @unique), so
// this graph is guaranteed acyclic; no visited-set needed when walking
// direct -> indirect.
async function buildDirectMap(): Promise<Map<string, string[]>> {
  const rows = await db.referral.findMany({ select: { referrerProfileId: true, referredProfileId: true } });
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.referrerProfileId) ?? [];
    list.push(r.referredProfileId);
    map.set(r.referrerProfileId, list);
  }
  return map;
}

// ---------------------------------------------------------------------
// "Qualified" = played >= MIN_QUALIFYING_MATCHES paid (non-Practice)
// matches that month AND has ever activated mining. One pass for the
// whole platform, reused for every candidate KOL in the batch — same
// "compute once, reuse per KOL" reasoning as the profit map below,
// since re-querying per KOL would be N times the same underlying data.
// ---------------------------------------------------------------------

async function loadQualifiedWalletIds(monthStart: Date, monthEnd: Date): Promise<Set<string>> {
  const counts = await db.matchParticipant.groupBy({
    by: ["walletProfileId"],
    where: {
      isBot: false,
      walletProfile: { isDemo: false },
      match: { entryFeeUsdt: { gt: 0 }, createdAt: { gte: monthStart, lt: monthEnd } },
    },
    _count: { _all: true },
  });
  const playedEnough = counts.filter((c) => c._count._all >= MIN_QUALIFYING_MATCHES).map((c) => c.walletProfileId);
  if (playedEnough.length === 0) return new Set();

  // "Started the launch mining" is a lifetime check (once activated,
  // always counts from then on), not something that has to happen
  // again within the same month — same db.ledgerEntry "rig_activation_fee"
  // lookup hasActivatedDashboard() (src/lib/mining.ts) uses for one
  // wallet at a time, batched here for the whole candidate set at once.
  const activated = await db.ledgerEntry.findMany({
    where: { walletProfileId: { in: playedEnough }, reason: "rig_activation_fee" },
    select: { walletProfileId: true },
    distinct: ["walletProfileId"],
  });
  return new Set(activated.map((a) => a.walletProfileId));
}

const SETTLED_STATUSES: MatchStatus[] = [MatchStatus.SETTLED_WIN, MatchStatus.SETTLED_LOSS, MatchStatus.SETTLED];

// Per-wallet share of real entry-fee REVENUE that month ("revenue from
// referral users") — the actual entries collected (not profit after
// rewards/commission — VIP funding is a flat % of gross revenue, see
// VIP_FUNDING_PCT above), prorated per real human for multiplayer rooms
// (equal share, same "feeBasePerHuman" idea
// distributeEntryFeeToTreasuryAndReferrals already uses), excluding
// demo-wallet matches. Computed once for the whole month and reused for
// every candidate KOL's downline sum, not recomputed per KOL.
async function loadRevenueByWallet(monthStart: Date, monthEnd: Date): Promise<Map<string, number>> {
  const demoMatchIds = new Set(
    (
      await db.matchParticipant.findMany({
        where: { isBot: false, walletProfile: { isDemo: true } },
        select: { matchId: true },
      })
    ).map((p) => p.matchId)
  );

  const matches = await db.match.findMany({
    where: {
      status: { in: SETTLED_STATUSES },
      entryFeeUsdt: { gt: 0 },
      OR: [{ endedAt: { gte: monthStart, lt: monthEnd } }, { endedAt: null, createdAt: { gte: monthStart, lt: monthEnd } }],
    },
    include: {
      participants: { where: { isBot: false }, select: { walletProfileId: true } },
      lobby: { select: { id: true } },
    },
  });
  const qualifying = matches.filter((m) => !demoMatchIds.has(m.id));
  const instantMatchIds = qualifying.filter((m) => !m.lobby).map((m) => m.id);
  const lobbyIds = qualifying.filter((m) => m.lobby).map((m) => m.lobby!.id);

  const [instantEntryAgg, lobbyEntryAgg] = await Promise.all([
    db.ledgerEntry.groupBy({
      by: ["refId"],
      where: { reason: "match_entry", refType: "Match", refId: { in: instantMatchIds } },
      _sum: { amount: true },
    }),
    db.ledgerEntry.groupBy({
      by: ["refId"],
      where: { reason: { in: ["match_entry_hold", "match_entry_hold_release"] }, refType: "GameLobby", refId: { in: lobbyIds } },
      _sum: { amount: true },
    }),
  ]);
  const instantEntriesByMatchId = new Map(instantEntryAgg.map((r) => [r.refId, Math.abs(Number(r._sum.amount ?? 0))]));
  const lobbyEntriesByLobbyId = new Map(lobbyEntryAgg.map((r) => [r.refId, Math.abs(Number(r._sum.amount ?? 0))]));

  const revenueByWallet = new Map<string, number>();
  for (const m of qualifying) {
    const humanCount = m.participants.length;
    if (humanCount === 0) continue;
    const entriesUsdt = m.lobby ? (lobbyEntriesByLobbyId.get(m.lobby.id) ?? 0) : (instantEntriesByMatchId.get(m.id) ?? 0);
    const perHumanShare = entriesUsdt / humanCount;
    for (const p of m.participants) {
      revenueByWallet.set(p.walletProfileId, (revenueByWallet.get(p.walletProfileId) ?? 0) + perHumanShare);
    }
  }
  return revenueByWallet;
}

function sumFor(ids: string[], byWallet: Map<string, number>): number {
  return ids.reduce((sum, id) => sum + (byWallet.get(id) ?? 0), 0);
}

// ---------------------------------------------------------------------
// Tiers — lazily seeded from the official VIP1-VIP10 table (20/10/1%
// through 200/100/10%, each level +20 direct/+10 indirect/+1%), same
// lazy-seed-on-first-read convention as src/lib/shop.ts's
// seedShopItemConfigsIfEmpty()/getShopItemConfigs(). Nothing changes
// behaviorally once seeded until an admin actually edits/adds a row via
// /admin/kol-vip.
// ---------------------------------------------------------------------

const SEED_TIER_COUNT = 10;
const SEED_TIERS = Array.from({ length: SEED_TIER_COUNT }, (_, i) => {
  const n = i + 1;
  return {
    key: `VIP${n}`,
    label: `VIP ${n}`,
    minDirectReferrals: n * 20,
    minIndirectReferrals: n * 10,
    bonusPct: n * 0.01,
    sortOrder: i,
  };
});

async function seedKolVipTiersIfEmpty() {
  const count = await db.kolVipTier.count();
  if (count > 0) return;
  try {
    await db.kolVipTier.createMany({ data: SEED_TIERS });
  } catch {
    // Lost a seed race — fine, another concurrent request already created these.
  }
}

// Every tier, enabled or not — for the admin editor.
export async function getAllKolVipTiers() {
  await seedKolVipTiersIfEmpty();
  return db.kolVipTier.findMany({ orderBy: [{ minDirectReferrals: "asc" }, { createdAt: "asc" }] });
}

export interface TierLike {
  id: string;
  minDirectReferrals: number;
  minIndirectReferrals: number;
  bonusPct: number;
}

// Tiers must already be sorted ascending by minDirectReferrals — this
// walks them in order and keeps the LAST one that satisfies BOTH
// thresholds, i.e. the highest tier actually qualified for. A KOL gets
// exactly one tier's bonus (the highest), never stacked across tiers.
export function highestQualifyingTier<T extends TierLike>(tiers: T[], directCount: number, indirectCount: number): T | null {
  let best: T | null = null;
  for (const t of tiers) {
    if (directCount >= t.minDirectReferrals && indirectCount >= t.minIndirectReferrals) best = t;
  }
  return best;
}

export async function getSortedEnabledTiers() {
  await seedKolVipTiersIfEmpty();
  const rows = await db.kolVipTier.findMany({ where: { enabled: true }, orderBy: { minDirectReferrals: "asc" } });
  return rows.map((r) => ({ ...r, bonusPct: Number(r.bonusPct) }));
}

// ---------------------------------------------------------------------
// Live (current, in-progress month) progress — for the player-facing
// "this month so far" view. Read-only, single wallet, no writes — the
// monthly batch below is the only thing that ever pays anything out.
// ---------------------------------------------------------------------

export interface LiveKolVipProgress {
  qualifiedDirectCount: number;
  qualifiedIndirectCount: number;
  currentTierLabel: string | null;
  nextTierLabel: string | null;
}

export async function getLiveMonthProgress(walletProfileId: string): Promise<LiveKolVipProgress> {
  const { start, end } = currentMonthBounds();
  const [{ direct, indirect }, qualifiedIds, tiers] = await Promise.all([
    getDownlineIds(walletProfileId),
    loadQualifiedWalletIds(start, end),
    getSortedEnabledTiers(),
  ]);
  const qualifiedDirectCount = direct.filter((id) => qualifiedIds.has(id)).length;
  const qualifiedIndirectCount = indirect.filter((id) => qualifiedIds.has(id)).length;
  const current = highestQualifyingTier(tiers, qualifiedDirectCount, qualifiedIndirectCount);
  const next = tiers.find(
    (t) => (!current || t.minDirectReferrals > current.minDirectReferrals) && t.id !== current?.id
  );
  return {
    qualifiedDirectCount,
    qualifiedIndirectCount,
    currentTierLabel: current?.label ?? null,
    nextTierLabel: next?.label ?? null,
  };
}

// ---------------------------------------------------------------------
// Monthly batch — the only thing that ever writes a KolVipPayout.
// Lazily triggered from GET /api/referrals for whichever month just
// completed (see that route's own comment), guarded by KolVipMonthlyRun
// so a concurrent second trigger for the same month is a no-op. No cron
// in this stack — same trick src/lib/leaderboard.ts's ensureWeekFinalized
// already uses, just claimed via its own row instead of relying on a
// single findUnique-then-create target (one month produces MANY payout
// rows, not one).
//
// This ONLY PROPOSES payouts (status: PENDING) — it never credits
// GAME_REWARD_USDT or grants a bonus MiningContract itself. An admin
// must review the full detail and explicitly approveKolVipPayout() (or
// rejectKolVipPayout()) below before anything is actually paid — see
// PENDING/APPROVED/REJECTED on KolVipPayoutStatus in schema.prisma.
//
// Commission model: vipFundingBaseUsdt = downlineRevenueUsdt (the
// KOL's own direct+indirect network's real entry-fee revenue that
// month) x VIP_FUNDING_PCT (23%); totalCommissionUsdt =
// vipFundingBaseUsdt x tier.bonusPct; split exactly 50/50 into
// bonusUsdt (Game Reward USDT, on approval) and hashrateConversionUsdt
// (converted to bonus mining hashrate at HASHRATE_PER_USDT, on
// approval). Same split for every tier.
//
// Tier "demotion" is inherent, not a separate step: every month is
// re-evaluated completely from scratch off THAT month's own qualified
// counts, with no memory of any previous month's tier. A KOL who was
// VIP10 last month but only clears VIP3's thresholds this month simply
// gets VIP3 this month — nothing to separately detect or roll back.
// ---------------------------------------------------------------------

export async function ensureMonthFinalized(periodMonth: string) {
  let claimed;
  try {
    claimed = await db.kolVipMonthlyRun.create({ data: { periodMonth, kolsEvaluated: 0, kolsRewarded: 0 } });
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code !== "P2002") throw err;
    return db.kolVipMonthlyRun.findUniqueOrThrow({ where: { periodMonth } });
  }

  // Off => leave the claim at kolsEvaluated: 0 and never retry this
  // month, even if the system is turned back on before it becomes
  // "previous" again next cycle — see PlatformSettings.kolVipEnabled's
  // own doc-comment for why this is the intended behavior.
  if (!(await getKolVipEnabled())) return claimed;

  const monthStart = new Date(`${periodMonth}-01T00:00:00.000Z`);
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));

  const [directMap, qualifiedIds, revenueByWallet, tiers] = await Promise.all([
    buildDirectMap(),
    loadQualifiedWalletIds(monthStart, monthEnd),
    loadRevenueByWallet(monthStart, monthEnd),
    getSortedEnabledTiers(),
  ]);

  let kolsEvaluated = 0;
  let kolsRewarded = 0;

  for (const kolId of directMap.keys()) {
    kolsEvaluated++;
    const direct = directMap.get(kolId) ?? [];
    const indirectSet = new Set<string>();
    for (const d of direct) for (const g of directMap.get(d) ?? []) indirectSet.add(g);
    const indirect = [...indirectSet];

    const qualifiedDirectCount = direct.filter((id) => qualifiedIds.has(id)).length;
    const qualifiedIndirectCount = indirect.filter((id) => qualifiedIds.has(id)).length;
    const tier = highestQualifyingTier(tiers, qualifiedDirectCount, qualifiedIndirectCount);
    if (!tier) continue;

    const downlineIds = [...new Set([...direct, ...indirect])];
    const downlineRevenueUsdt = Math.max(0, sumFor(downlineIds, revenueByWallet));
    const vipFundingBaseUsdt = round8(downlineRevenueUsdt * VIP_FUNDING_PCT);
    const totalCommissionUsdt = round8(vipFundingBaseUsdt * tier.bonusPct);
    const bonusUsdt = round8(totalCommissionUsdt / 2);
    const hashrateConversionUsdt = round8(totalCommissionUsdt - bonusUsdt); // remainder, not a second /2, so rounding never loses a fraction of a cent
    const bonusHashrateMhs = round4(hashrateConversionUsdt * HASHRATE_PER_USDT);

    await db.kolVipPayout.create({
      data: {
        walletProfileId: kolId,
        periodMonth,
        kolVipTierId: tier.id,
        qualifiedDirectCount,
        qualifiedIndirectCount,
        downlineRevenueUsdt,
        vipFundingBaseUsdt,
        totalCommissionUsdt,
        bonusUsdt,
        hashrateConversionUsdt,
        bonusHashrateMhs,
        // status defaults to PENDING — see this function's own doc-comment.
      },
    });
    kolsRewarded++;
  }

  return db.kolVipMonthlyRun.update({ where: { periodMonth }, data: { kolsEvaluated, kolsRewarded } });
}

// ---------------------------------------------------------------------
// Admin review — the only two places a PENDING KolVipPayout ever
// changes state, and the only place GAME_REWARD_USDT is credited or a
// bonus MiningContract is created for a KOL VIP bonus.
// ---------------------------------------------------------------------

export async function approveKolVipPayout(payoutId: string, adminAddress: string) {
  return db.$transaction(async (tx) => {
    const payout = await tx.kolVipPayout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new Error("Payout not found");
    if (payout.status !== "PENDING") throw new Error(`Payout is already ${payout.status.toLowerCase()}`);

    const bonusUsdt = Number(payout.bonusUsdt);
    const bonusHashrateMhs = Number(payout.bonusHashrateMhs);

    let miningContractId: string | null = null;
    if (bonusHashrateMhs > 0) {
      const startsAt = new Date();
      const expiresAt = new Date(startsAt.getTime() + HASHRATE_TERM_DAYS * 24 * 60 * 60 * 1000);
      const contract = await tx.miningContract.create({
        data: {
          walletProfileId: payout.walletProfileId,
          level: levelForHashrate(bonusHashrateMhs),
          miningPower: bonusHashrateMhs,
          termDays: HASHRATE_TERM_DAYS,
          pricePaidUsdt: 0,
          startsAt,
          expiresAt,
        },
      });
      miningContractId = contract.id;
    }
    if (bonusUsdt > 0) {
      await tx.ledgerEntry.create({
        data: {
          walletProfileId: payout.walletProfileId,
          balanceType: BalanceType.GAME_REWARD_USDT,
          amount: bonusUsdt,
          reason: "kol_vip_bonus",
          refType: "KolVipPayout",
          refId: payout.id,
          note: `KOL VIP ${payout.periodMonth}`,
          adminActorAddress: adminAddress,
        },
      });
    }

    return tx.kolVipPayout.update({
      where: { id: payoutId },
      data: { status: "APPROVED", reviewedByAddress: adminAddress, reviewedAt: new Date(), miningContractId },
    });
  });
}

export async function rejectKolVipPayout(payoutId: string, adminAddress: string, reason: string) {
  const payout = await db.kolVipPayout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new Error("Payout not found");
  if (payout.status !== "PENDING") throw new Error(`Payout is already ${payout.status.toLowerCase()}`);

  return db.kolVipPayout.update({
    where: { id: payoutId },
    data: { status: "REJECTED", reviewedByAddress: adminAddress, reviewedAt: new Date(), rejectedReason: reason },
  });
}
