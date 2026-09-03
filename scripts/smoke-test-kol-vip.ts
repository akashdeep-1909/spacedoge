// Verifies the KOL VIP Tiers monthly evaluation end to end (the
// official VIP1-VIP10 commission-split model: qualified = >=5 paid
// matches that month AND mining ever activated; commission = tier
// bonusPct x downline revenue, split exactly 50/50 USDT/hashrate):
//   1. Admin can create a tier and turn the master switch on.
//   2. A KOL with 3 direct + 1 (of 2) indirect referrals who actually
//      qualify (>=5 paid matches last month + activated mining)
//      unlocks VIP1 (2 direct / 1 indirect thresholds), and the
//      commission math is exactly what a hand computation predicts.
//   3. The 50/50 split is actually paid: half credited (GAME_REWARD_USDT
//      ledger entry), half granted as a new $0 MiningContract at the
//      platform's standard HASHRATE_PER_USDT rate.
//   4. GET /api/referrals reflects the payout for that KOL.
//   5. Re-running the same month's evaluation is a no-op (idempotent).
//   6. With the master switch OFF, a different month's evaluation
//      claims the month but creates zero payouts even though the same
//      thresholds are met.
//
// A real month can't be waited out in a test, so this inserts
// backdated Match/MatchParticipant/LedgerEntry rows directly (via the
// app's own Prisma client) into the real previous and second-previous
// calendar months, then calls the real ensureMonthFinalized() for each
// — run via tsx, same reasoning as scripts/smoke-test-shop-phase1.ts
// (no psql in this local dev env):
//   npx tsx scripts/smoke-test-kol-vip.ts
import "dotenv/config";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SiweMessage } from "siwe";
import { db } from "../src/lib/db";
import { previousMonthBounds, ensureMonthFinalized } from "../src/lib/kolVip";
import { BalanceType, MatchStatus } from "../src/generated/prisma/enums";

const BASE = "http://localhost:3000";
let failures = 0;

function log(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? " — " + extra : ""}`);
  if (!ok) failures++;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose ad-hoc JSON bodies, throwaway verification script
async function signIn(referralCode?: string): Promise<{ address: string; req: (path: string, opts?: RequestInit) => Promise<{ res: Response; body: any }> }> {
  let cookie = "";
  const account = privateKeyToAccount(generatePrivateKey());
  const address = account.address;

  async function req(path: string, opts: RequestInit = {}) {
    const res = await fetch(BASE + path, {
      ...opts,
      headers: { ...((opts.headers as Record<string, string>) || {}), ...(cookie ? { cookie } : {}) },
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any = null;
    try {
      body = await res.json();
    } catch {}
    return { res, body };
  }

  const { body: nonceBody } = await req(`/api/auth/nonce?address=${address}`);
  const siwe = new SiweMessage({
    domain: "localhost:3000",
    address,
    statement: "Sign in to Space DOGE. This request will not trigger a blockchain transaction or cost any gas fees.",
    uri: BASE,
    version: "1",
    chainId: 11155111,
    nonce: nonceBody.nonce,
  });
  const message = siwe.prepareMessage();
  const signature = await account.signMessage({ message });
  await req("/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature, ...(referralCode ? { referralCode } : {}) }),
  });
  await req("/api/auth/onboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ countryCode: "US", ageConfirmed: true, termsVersion: "v1" }),
  });
  return { address, req };
}

// Inserts one backdated paid match for a wallet: a real entry-fee
// ledger debit + a settled match + a losing participant row, dated
// inside that month. profitUsdt for it ends up exactly entryFeeUsdt
// (distributedUsdt: 0, no referral commission rows), so the downline
// profit sum is trivial to hand-verify.
async function insertMatch(walletProfileId: string, at: Date, entryFeeUsdt: number) {
  const match = await db.match.create({
    data: {
      mode: "QUICK_RUSH",
      entryFeeUsdt,
      prizePoolUsdt: 0,
      platformFeeUsdt: 0,
      status: MatchStatus.SETTLED_LOSS,
      mapSeed: `kolvip-smoke-${Math.random()}`,
      createdAt: at,
      endedAt: at,
    },
  });
  await db.matchParticipant.create({
    data: { matchId: match.id, walletProfileId, isBot: false, score: 0, rewardUsdt: 0 },
  });
  await db.ledgerEntry.create({
    data: {
      walletProfileId,
      balanceType: BalanceType.PLAY_USDT,
      amount: -entryFeeUsdt,
      reason: "match_entry",
      refType: "Match",
      refId: match.id,
      createdAt: at,
    },
  });
  return match;
}

// 5 qualifying matches ($1 each, $0 reward => $1 profit each) dated
// inside the given month, matching MIN_QUALIFYING_MATCHES in
// src/lib/kolVip.ts. Returns the total profit contributed ($5).
const MATCHES_PER_QUALIFYING_WALLET = 5;
async function insertQualifyingActivity(walletProfileId: string, monthStart: Date) {
  for (let i = 0; i < MATCHES_PER_QUALIFYING_WALLET; i++) {
    await insertMatch(walletProfileId, new Date(monthStart.getTime() + (i + 1) * 60 * 60 * 1000), 1);
  }
  return MATCHES_PER_QUALIFYING_WALLET; // $1 profit x 5 matches
}

// "Started the launch mining" — a lifetime rig_activation_fee ledger
// row is all hasActivatedDashboard()/loadQualifiedWalletIds check for,
// see src/lib/mining.ts and src/lib/kolVip.ts.
async function activateMining(walletProfileId: string) {
  await db.ledgerEntry.create({
    data: { walletProfileId, balanceType: BalanceType.GAME_REWARD_USDT, amount: -1, reason: "rig_activation_fee" },
  });
}

async function main() {
  // A throwaway admin — inserted directly, same shortcut
  // scripts/smoke-test-shop-admin.ts already uses.
  const admin = await signIn();
  await db.adminUser.create({ data: { address: admin.address.toLowerCase(), addedByAddress: "smoke-test" } });

  const kol = await signIn();
  const d1 = await signIn(kol.address);
  const d2 = await signIn(kol.address);
  const d3 = await signIn(kol.address);
  const i1 = await signIn(d1.address);
  await signIn(d1.address); // a 2nd indirect referral who deliberately never plays a match — tests that mere referral existence isn't enough to count as "qualified"

  const kolWp = await db.walletProfile.findUniqueOrThrow({ where: { address: kol.address.toLowerCase() } });
  const d1Wp = await db.walletProfile.findUniqueOrThrow({ where: { address: d1.address.toLowerCase() } });
  const d2Wp = await db.walletProfile.findUniqueOrThrow({ where: { address: d2.address.toLowerCase() } });
  const d3Wp = await db.walletProfile.findUniqueOrThrow({ where: { address: d3.address.toLowerCase() } });
  const i1Wp = await db.walletProfile.findUniqueOrThrow({ where: { address: i1.address.toLowerCase() } });

  // ensureMonthFinalized is a real, permanent, once-ever claim per
  // calendar month (by design — see its own doc-comment) — re-running
  // this script within the same real month would otherwise just hit
  // the earlier run's already-claimed row and evaluate nothing new.
  // Clearing this run's own target months' claims first makes the
  // script safely re-runnable regardless of DB history, without
  // weakening what's actually being verified (the pipeline itself is
  // still exercised end to end, from a real, freshly-claimed month).
  const lastMonth = previousMonthBounds();
  const twoMonthsAgoStartForCleanup = new Date(Date.UTC(lastMonth.start.getUTCFullYear(), lastMonth.start.getUTCMonth() - 1, 1));
  const twoMonthsAgoKeyForCleanup = `${twoMonthsAgoStartForCleanup.getUTCFullYear()}-${String(twoMonthsAgoStartForCleanup.getUTCMonth() + 1).padStart(2, "0")}`;
  const targetMonths = [lastMonth.periodMonth, twoMonthsAgoKeyForCleanup];
  // A payout row from an earlier run of THIS script (a different
  // leftover KOL who also qualifies) would otherwise collide with the
  // batch's own create() the moment the claim above is cleared —
  // something that can never happen in real production (there the
  // claim is never deleted, so a month's payouts are only ever written
  // once, period). Resetting a target month back to "never evaluated"
  // means clearing its payouts too, not just its claim marker.
  const stalePayouts = await db.kolVipPayout.findMany({ where: { periodMonth: { in: targetMonths } } });
  for (const p of stalePayouts) {
    if (p.miningContractId) await db.miningContract.delete({ where: { id: p.miningContractId } }).catch(() => {});
  }
  await db.ledgerEntry.deleteMany({ where: { reason: "kol_vip_bonus" } });
  await db.kolVipPayout.deleteMany({ where: { periodMonth: { in: targetMonths } } });
  await db.kolVipMonthlyRun.deleteMany({ where: { periodMonth: { in: targetMonths } } });

  try {
    // --- Admin sets up VIP1 and turns the system on ---
    const { res: tierRes, body: tierBody } = await admin.req("/api/admin/kol-vip/tiers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "VIP1 Smoke", minDirectReferrals: 2, minIndirectReferrals: 1, bonusPct: 0.01 }),
    });
    log("Admin can create a tier", tierRes.ok, JSON.stringify(tierBody));

    const { res: onRes } = await admin.req("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kolVipEnabled: true }),
    });
    log("Admin can turn KOL VIP on", onRes.ok);

    // --- Backdate qualifying activity into last month for D1, D2, D3, I1 (not I2) ---
    // Each needs >=5 paid matches that month AND a lifetime mining
    // activation — D1/D2/D3/I1 get both; I2 gets neither, proving mere
    // referral existence isn't enough.
    let downlineProfitExpected = 0;
    for (const wp of [d1Wp, d2Wp, d3Wp, i1Wp]) {
      downlineProfitExpected += await insertQualifyingActivity(wp.id, lastMonth.start);
      await activateMining(wp.id);
    }
    log("Test setup: downline profit should be $20 (4 wallets x 5 matches x $1)", downlineProfitExpected === 20);

    // --- Run the real monthly evaluation for that exact month ---
    const run1 = await ensureMonthFinalized(lastMonth.periodMonth);
    log("Evaluation ran for at least this one KOL", run1.kolsEvaluated >= 1, `evaluated=${run1.kolsEvaluated}`);
    // >= 1, not === 1: this shared local dev DB accumulates real
    // wallets/referrals/backdated activity across every run of this
    // script (each run's throwaway KOL is never deleted), so a leftover
    // KOL from an earlier run can genuinely re-qualify against this
    // run's freshly-created low-threshold tier too — that's correct
    // evaluation behavior, not a bug. The per-KOL assertions below
    // verify THIS run's specific KOL precisely; that's the real check.
    log("At least our KOL was rewarded", run1.kolsRewarded >= 1, `rewarded=${run1.kolsRewarded}`);

    const payout = await db.kolVipPayout.findUnique({
      where: { walletProfileId_periodMonth: { walletProfileId: kolWp.id, periodMonth: lastMonth.periodMonth } },
      include: { kolVipTier: true },
    });
    log("A KolVipPayout row was written for the KOL", !!payout);
    log("Picked the VIP1 tier", payout?.kolVipTier.label === "VIP1 Smoke");
    log("qualifiedDirectCount is 3", payout?.qualifiedDirectCount === 3, `got ${payout?.qualifiedDirectCount}`);
    log("qualifiedIndirectCount is 1 (I2 never played)", payout?.qualifiedIndirectCount === 1, `got ${payout?.qualifiedIndirectCount}`);
    log(
      "downlineProfitUsdt is exactly 20 (4 wallets x 5 matches x $1 profit each)",
      Number(payout?.downlineProfitUsdt) === 20,
      `got ${payout?.downlineProfitUsdt}`
    );
    log(
      "totalCommissionUsdt is exactly 0.20 (1% of 20)",
      Number(payout?.totalCommissionUsdt) === 0.2,
      `got ${payout?.totalCommissionUsdt}`
    );
    log("bonusUsdt is exactly 0.10 (half of 0.20)", Number(payout?.bonusUsdt) === 0.1, `got ${payout?.bonusUsdt}`);
    log(
      "hashrateConversionUsdt is exactly 0.10 (the other half)",
      Number(payout?.hashrateConversionUsdt) === 0.1,
      `got ${payout?.hashrateConversionUsdt}`
    );
    log(
      "bonusHashrateMhs is exactly 2.5 (0.10 USDT x HASHRATE_PER_USDT=25)",
      Number(payout?.bonusHashrateMhs) === 2.5,
      `got ${payout?.bonusHashrateMhs}`
    );

    const ledgerCredit = await db.ledgerEntry.findFirst({
      where: { walletProfileId: kolWp.id, reason: "kol_vip_bonus" },
    });
    log(
      "A GAME_REWARD_USDT ledger credit was recorded",
      !!ledgerCredit && ledgerCredit.balanceType === "GAME_REWARD_USDT" && Number(ledgerCredit.amount) === 0.1
    );

    const bonusContract = payout?.miningContractId
      ? await db.miningContract.findUnique({ where: { id: payout.miningContractId } })
      : null;
    log(
      "A $0 bonus MiningContract was granted to the KOL",
      !!bonusContract && bonusContract.walletProfileId === kolWp.id && Number(bonusContract.pricePaidUsdt) === 0 && Number(bonusContract.miningPower) === 2.5
    );

    // --- GET /api/referrals reflects it ---
    const { body: referralsBody } = await kol.req("/api/referrals");
    log("GET /api/referrals shows kolVip.enabled true", referralsBody.kolVip?.enabled === true);
    log(
      "GET /api/referrals shows last month's payout",
      referralsBody.kolVip?.lastPayout?.periodMonth === lastMonth.periodMonth &&
        referralsBody.kolVip?.lastPayout?.bonusUsdt === 0.1,
      JSON.stringify(referralsBody.kolVip?.lastPayout)
    );

    // --- Idempotency: re-running the same month must not double-pay ---
    const run2 = await ensureMonthFinalized(lastMonth.periodMonth);
    log("Re-running the same month is a no-op (same counts)", run2.kolsEvaluated === run1.kolsEvaluated && run2.kolsRewarded === run1.kolsRewarded);
    const payoutCount = await db.kolVipPayout.count({
      where: { walletProfileId: kolWp.id, periodMonth: lastMonth.periodMonth },
    });
    log("Still exactly 1 payout row for that KOL/month", payoutCount === 1, `count=${payoutCount}`);

    // --- OFF path: a different (2-months-ago) month, same thresholds met, system OFF ---
    const { res: offRes } = await admin.req("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kolVipEnabled: false }),
    });
    log("Admin can turn KOL VIP back off", offRes.ok);

    const twoMonthsAgoStart = new Date(Date.UTC(lastMonth.start.getUTCFullYear(), lastMonth.start.getUTCMonth() - 1, 1));
    const twoMonthsAgoKey = `${twoMonthsAgoStart.getUTCFullYear()}-${String(twoMonthsAgoStart.getUTCMonth() + 1).padStart(2, "0")}`;
    // Mining is already activated (lifetime, from the ON section above)
    // — only need fresh qualifying match activity in this new month.
    for (const wp of [d1Wp, d2Wp, d3Wp, i1Wp]) {
      await insertQualifyingActivity(wp.id, twoMonthsAgoStart);
    }

    const runOff = await ensureMonthFinalized(twoMonthsAgoKey);
    log("OFF: the month is still claimed (evaluated=0)", runOff.kolsEvaluated === 0, `evaluated=${runOff.kolsEvaluated}`);
    log("OFF: nobody was rewarded", runOff.kolsRewarded === 0);
    const offPayout = await db.kolVipPayout.findUnique({
      where: { walletProfileId_periodMonth: { walletProfileId: kolWp.id, periodMonth: twoMonthsAgoKey } },
    });
    log("OFF: no payout row was created even though thresholds were met", !offPayout);
  } finally {
    await db.adminUser.deleteMany({ where: { address: admin.address.toLowerCase() } });
    await db.platformSettings.update({ where: { id: "singleton" }, data: { kolVipEnabled: false } }).catch(() => {});
  }

  console.log(failures ? "\nKOL VIP SMOKE TEST: FAILURES ABOVE" : "\nKOL VIP SMOKE TEST: ALL PASSED");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
