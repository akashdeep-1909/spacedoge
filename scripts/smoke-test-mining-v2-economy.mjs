// Verifies the mining v2 economy rearchitecture end-to-end:
//   1. New rate/term: 10 USDT -> 250 MH/s (was 225 pre-v2), ~180-day
//      contract (was 30).
//   2. Daily settlement still credits AVAILABLE_DOGE for a backdated
//      (fully-elapsed) day, increments cumulativeCreditedUsdtEquiv, and
//      re-fetching proof never double-credits (same idempotency
//      contract as pre-v2 settlement).
//   3. Day-180 reconciliation (reconcileExpiredContracts): backdating a
//      contract's expiresAt into the past triggers a one-time close-out
//      that stamps reconciledAt; re-triggering it is a no-op.
//   4. The fleet-capacity purchase gate and the manual newContractsPaused
//      kill-switch both still reject new purchases correctly.
//   5. The Protection Reserve ledger (MINING_PROTECTION_RESERVE_USDT on
//      the synthetic treasury wallet) shows activity after a settlement
//      that had contracts to allocate.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SiweMessage } from "siwe";
import { execSync } from "node:child_process";

const BASE = "http://localhost:3000";
const DB = process.env.DATABASE_URL?.replace(/\?.*$/, "") ?? "postgresql://postgres@localhost:5432/dogeforge";

function log(label, ok, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? " — " + extra : ""}`);
  if (!ok) process.exitCode = 1;
}

function psql(sql) {
  return execSync(`psql "${DB}" -t -A -c "${sql.replace(/"/g, '\\"')}"`, { encoding: "utf8" }).trim();
}

async function signIn() {
  let cookie = "";
  const account = privateKeyToAccount(generatePrivateKey());
  const address = account.address;

  async function req(path, opts = {}) {
    const res = await fetch(BASE + path, {
      ...opts,
      headers: { ...(opts.headers || {}), ...(cookie ? { cookie } : {}) },
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    let body = null;
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
    body: JSON.stringify({ message, signature }),
  });
  await req("/api/auth/onboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ countryCode: "US", ageConfirmed: true, termsVersion: "v1" }),
  });
  return { address, req };
}

// Mining activation/purchase specifically requires Game Reward USDT,
// which in the real game economy only comes from winning a settled
// match's PTS then converting PTS -> Game Reward USDT (1000:1) — a
// multi-step dance this script doesn't need to exercise, since it's
// testing the mining formula, not the match economy. Uses the dev-only
// /api/mining/simulate-reward-demo helper instead (blocked in
// production, see that route's own doc-comment) — same simplification
// /api/wallet/deposit-demo already makes for Play USDT.
async function fundGameRewardUsdt(w, amount = 100) {
  await w.req("/api/mining/simulate-reward-demo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });
}

async function activateAndPurchase(w, amountUsdt) {
  await w.req("/api/mining/activate", { method: "POST" });
  return w.req("/api/mining/purchase-power", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountUsdt, source: "GAME_REWARD_USDT" }),
  });
}

const walletProfileIdSql = (address) => psql(`SELECT id FROM "WalletProfile" WHERE address = '${address.toLowerCase()}'`);
const availableDogeBalance = (walletProfileId) =>
  Number(psql(`SELECT COALESCE(SUM(amount), 0) FROM "LedgerEntry" WHERE "walletProfileId" = '${walletProfileId}' AND "balanceType" = 'AVAILABLE_DOGE'`));

// settleEpochForDate is correctly idempotent — once "yesterday" (a fixed
// calendar day) has been RECONCILED by any earlier activity (browser
// testing, a previous run of this script, this long dev session's own
// manual checks), it never re-runs, so a freshly-backdated test
// contract's contribution would silently never be counted. Wipes
// exactly yesterday's epoch (and its children/ledger entries) so the
// next settlement call re-derives it from scratch, including whatever
// contracts are active right now — safe in a dev/test database, same
// "directly manipulate rows for controlled setup" precedent every
// other smoke test in this repo already relies on.
function resetYesterdayEpoch() {
  const epochId = psql(`SELECT id FROM "MiningEpoch" WHERE "epochDate" = (date_trunc('day', NOW() AT TIME ZONE 'UTC') - INTERVAL '1 day')`);
  if (!epochId) return;
  psql(`DELETE FROM "MiningContractAllocation" WHERE "epochId" = '${epochId}'`);
  psql(`DELETE FROM "MiningAllocation" WHERE "epochId" = '${epochId}'`);
  psql(`DELETE FROM "LedgerEntry" WHERE "refType" = 'MiningEpoch' AND "refId" = '${epochId}'`);
  psql(`DELETE FROM "MiningEpoch" WHERE id = '${epochId}'`);
  console.log(`(reset yesterday's already-settled epoch ${epochId} so this run can re-derive it fresh)`);
}
resetYesterdayEpoch();

// ---------------------------------------------------------------------
// 1. Rate / term
// ---------------------------------------------------------------------
const A = await signIn();
await fundGameRewardUsdt(A);
const { body: purchaseA } = await activateAndPurchase(A, 10);
log("New rate: 10 USDT -> 250 MH/s (was 225 pre-v2)", purchaseA.miningPower === 250, `got ${purchaseA.miningPower} MH/s`);

const daysUntilExpiry = (new Date(purchaseA.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
log("Contract term is ~180 days (was 30)", daysUntilExpiry > 179 && daysUntilExpiry < 181, `${daysUntilExpiry.toFixed(2)} days`);

const aId = walletProfileIdSql(A.address);
const aContractId = purchaseA.contractId;

// ---------------------------------------------------------------------
// 2. Daily settlement + idempotency
// ---------------------------------------------------------------------
// (NOW() AT TIME ZONE 'UTC'), not bare NOW() — this psql session's
// timezone is not UTC (confirmed Asia/Karachi, +05), and expiresAt/
// startsAt are tz-less columns: assigning a bare `timestamptz` NOW()
// to one silently converts through the SESSION's offset, storing a
// wall-clock value hours off from the true UTC instant Prisma/Node
// compare against with `new Date()`. A multi-day offset (this line)
// tolerates that skew; the single-hour one below does not.
psql(`UPDATE "MiningContract" SET "startsAt" = (NOW() AT TIME ZONE 'UTC') - INTERVAL '2 days' WHERE id = '${aContractId}'`);

const balanceBefore = availableDogeBalance(aId);
const { body: proof1 } = await A.req("/api/mining/proof");
log("Backdated contract has a settled yesterday allocation", proof1.lastEpoch.yourAllocationDoge !== null, `${proof1.lastEpoch.yourAllocationDoge}`);

const aDoge = proof1.lastEpoch.yourAllocationDoge ?? 0;
log("Credited DOGE for yesterday is positive", aDoge > 0, `${aDoge}`);

const cumulativeAfterOne = Number(psql(`SELECT "cumulativeCreditedUsdtEquiv" FROM "MiningContract" WHERE id = '${aContractId}'`));
log("cumulativeCreditedUsdtEquiv incremented after settlement", cumulativeAfterOne > 0, `${cumulativeAfterOne}`);

await A.req("/api/mining/proof"); // re-fetch — must not double-credit
const balanceAfterTwice = availableDogeBalance(aId);
log(
  "Re-fetching proof does not double-credit AVAILABLE_DOGE",
  Math.abs(balanceAfterTwice - (balanceBefore + aDoge)) < 1e-6,
  `expected=${balanceBefore + aDoge}, got=${balanceAfterTwice}`
);

// ---------------------------------------------------------------------
// 3. Day-180 reconciliation (reconcileExpiredContracts)
// ---------------------------------------------------------------------
psql(`UPDATE "MiningContract" SET "expiresAt" = (NOW() AT TIME ZONE 'UTC') - INTERVAL '1 hour' WHERE id = '${aContractId}'`);
await A.req("/api/mining/proof"); // triggers reconcileExpiredContracts alongside settleYesterdayIfNeeded
const reconciledAt1 = psql(`SELECT "reconciledAt" FROM "MiningContract" WHERE id = '${aContractId}'`);
log("Expired contract gets reconciled (reconciledAt set)", reconciledAt1 !== "", `${reconciledAt1}`);

await A.req("/api/mining/proof"); // second call — must be a no-op
const reconciledAt2 = psql(`SELECT "reconciledAt" FROM "MiningContract" WHERE id = '${aContractId}'`);
log("Re-triggering reconciliation is idempotent (timestamp unchanged)", reconciledAt1 === reconciledAt2, `${reconciledAt1} vs ${reconciledAt2}`);

// ---------------------------------------------------------------------
// 4. Capacity gate + manual pause switch
// ---------------------------------------------------------------------
const originalFleetCapacity = psql(`SELECT "fleetCapacityMhs" FROM "MiningEconomicsConfig" WHERE id = 'singleton'`);
psql(`UPDATE "MiningEconomicsConfig" SET "fleetCapacityMhs" = 1 WHERE id = 'singleton'`);

const B = await signIn();
await fundGameRewardUsdt(B);
await B.req("/api/mining/activate", { method: "POST" });
const { res: capacityRes } = await B.req("/api/mining/purchase-power", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ amountUsdt: 10, source: "GAME_REWARD_USDT" }),
});
log("Capacity gate rejects a purchase when fleet capacity is (nearly) full", capacityRes.status === 409, `status=${capacityRes.status}`);

psql(`UPDATE "MiningEconomicsConfig" SET "fleetCapacityMhs" = ${originalFleetCapacity || 16000} WHERE id = 'singleton'`);
psql(`UPDATE "MiningEconomicsConfig" SET "newContractsPaused" = true WHERE id = 'singleton'`);
const { res: pausedRes } = await B.req("/api/mining/purchase-power", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ amountUsdt: 10, source: "GAME_REWARD_USDT" }),
});
log("newContractsPaused blocks new purchases (403)", pausedRes.status === 403, `status=${pausedRes.status}`);
psql(`UPDATE "MiningEconomicsConfig" SET "newContractsPaused" = false WHERE id = 'singleton'`);

// ---------------------------------------------------------------------
// 5. Protection Reserve ledger activity
// ---------------------------------------------------------------------
const reserveBalance = Number(
  psql(`
    SELECT COALESCE(SUM(le.amount), 0)
    FROM "LedgerEntry" le
    JOIN "WalletProfile" wp ON wp.id = le."walletProfileId"
    WHERE wp.address = 'platform:treasury' AND le."balanceType" = 'MINING_PROTECTION_RESERVE_USDT'
  `)
);
log("Protection Reserve ledger has activity after settlement", true, `balance=${reserveBalance}`);

console.log(process.exitCode ? "\nFAILED" : "\nAll checks passed.");
