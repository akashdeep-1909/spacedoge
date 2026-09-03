// Verifies the KOL VIP Tiers monthly evaluation end to end:
//   1. Admin can create a tier and turn the master switch on.
//   2. A KOL with 3 direct + 1 (of 2) indirect referrals who actually
//      played a paid match last month qualifies for VIP1 (2 direct /
//      1 indirect thresholds), gets the highest (only) qualifying
//      tier, and the USDT + hashrate bases are exactly what a hand
//      computation predicts.
//   3. The bonus is actually credited (GAME_REWARD_USDT ledger entry)
//      and actually granted (a new $0 MiningContract).
//   4. GET /api/referrals reflects the payout for that KOL.
//   5. Re-running the same month's evaluation is a no-op (idempotent).
//   6. With the master switch OFF, a different month's evaluation
//      claims the month but creates zero payouts even though the same
//      thresholds are met.
//
// A real month can't be waited out in a test, so this inserts
// backdated Match/MatchParticipant/LedgerEntry/MiningContract rows
// directly (via the app's own Prisma client) into the real previous
// and second-previous calendar months, then calls the real
// ensureMonthFinalized() for each — run via tsx, same reasoning as
// scripts/smoke-test-shop-phase1.ts (no psql in this local dev env):
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

// Inserts one backdated "qualified" paid match for a wallet: a real
// entry-fee ledger debit + a settled match + a losing participant row,
// dated inside [start, start+1day). profitUsdt for it ends up exactly
// entryFeeUsdt (distributedUsdt: 0, no referral commission rows), so
// the downline profit sum is trivial to hand-verify.
async function insertQualifyingMatch(walletProfileId: string, at: Date, entryFeeUsdt: number) {
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

async function insertMiningContract(walletProfileId: string, miningPowerMhs: number, monthStart: Date, monthEnd: Date) {
  return db.miningContract.create({
    data: {
      walletProfileId,
      level: "SPARK",
      miningPower: miningPowerMhs,
      termDays: 30,
      pricePaidUsdt: 1,
      startsAt: monthStart,
      expiresAt: new Date(monthEnd.getTime() + 1), // safely overlaps the whole window
    },
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
    const lastMonth = previousMonthBounds();
    const at = new Date(lastMonth.start.getTime() + 24 * 60 * 60 * 1000); // day 2 of that month
    await insertQualifyingMatch(d1Wp.id, at, 1);
    await insertQualifyingMatch(d2Wp.id, at, 1);
    await insertQualifyingMatch(d3Wp.id, at, 1);
    await insertQualifyingMatch(i1Wp.id, at, 1);
    await insertMiningContract(d1Wp.id, 100, lastMonth.start, lastMonth.end);
    await insertMiningContract(d2Wp.id, 50, lastMonth.start, lastMonth.end);

    // --- Run the real monthly evaluation for that exact month ---
    const run1 = await ensureMonthFinalized(lastMonth.periodMonth);
    log("Evaluation ran for at least this one KOL", run1.kolsEvaluated >= 1, `evaluated=${run1.kolsEvaluated}`);
    log("Exactly 1 KOL was rewarded (only ours qualifies)", run1.kolsRewarded === 1, `rewarded=${run1.kolsRewarded}`);

    const payout = await db.kolVipPayout.findUnique({
      where: { walletProfileId_periodMonth: { walletProfileId: kolWp.id, periodMonth: lastMonth.periodMonth } },
      include: { kolVipTier: true },
    });
    log("A KolVipPayout row was written for the KOL", !!payout);
    log("Picked the VIP1 tier", payout?.kolVipTier.label === "VIP1 Smoke");
    log("qualifiedDirectCount is 3", payout?.qualifiedDirectCount === 3, `got ${payout?.qualifiedDirectCount}`);
    log("qualifiedIndirectCount is 1 (I2 never played)", payout?.qualifiedIndirectCount === 1, `got ${payout?.qualifiedIndirectCount}`);
    log(
      "downlineProfitUsdt is exactly 4 (4 matches x $1 profit each)",
      Number(payout?.downlineProfitUsdt) === 4,
      `got ${payout?.downlineProfitUsdt}`
    );
    log(
      "downlineHashrateMhs is exactly 150 (100 + 50)",
      Number(payout?.downlineHashrateMhs) === 150,
      `got ${payout?.downlineHashrateMhs}`
    );
    log("bonusUsdt is exactly 0.04 (1% of 4)", Number(payout?.bonusUsdt) === 0.04, `got ${payout?.bonusUsdt}`);
    log("bonusHashrateMhs is exactly 1.5 (1% of 150)", Number(payout?.bonusHashrateMhs) === 1.5, `got ${payout?.bonusHashrateMhs}`);

    const ledgerCredit = await db.ledgerEntry.findFirst({
      where: { walletProfileId: kolWp.id, reason: "kol_vip_bonus" },
    });
    log(
      "A GAME_REWARD_USDT ledger credit was recorded",
      !!ledgerCredit && ledgerCredit.balanceType === "GAME_REWARD_USDT" && Number(ledgerCredit.amount) === 0.04
    );

    const bonusContract = payout?.miningContractId
      ? await db.miningContract.findUnique({ where: { id: payout.miningContractId } })
      : null;
    log(
      "A $0 bonus MiningContract was granted to the KOL",
      !!bonusContract && bonusContract.walletProfileId === kolWp.id && Number(bonusContract.pricePaidUsdt) === 0 && Number(bonusContract.miningPower) === 1.5
    );

    // --- GET /api/referrals reflects it ---
    const { body: referralsBody } = await kol.req("/api/referrals");
    log("GET /api/referrals shows kolVip.enabled true", referralsBody.kolVip?.enabled === true);
    log(
      "GET /api/referrals shows last month's payout",
      referralsBody.kolVip?.lastPayout?.periodMonth === lastMonth.periodMonth &&
        referralsBody.kolVip?.lastPayout?.bonusUsdt === 0.04,
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
    const at2 = new Date(twoMonthsAgoStart.getTime() + 24 * 60 * 60 * 1000);
    await insertQualifyingMatch(d1Wp.id, at2, 1);
    await insertQualifyingMatch(d2Wp.id, at2, 1);
    await insertQualifyingMatch(d3Wp.id, at2, 1);
    await insertQualifyingMatch(i1Wp.id, at2, 1);

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
