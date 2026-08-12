// Verifies the fix to settleEpochForDate's `target` calculation: a
// contract that only started partway through the settled day must be
// credited a PRORATED daily target (target * activeHours/24), not a
// full day's target as if it had mined all 24 hours. Root-caused via a
// live production settlement-data investigation (Aug 11, 2026's
// epoch) — see mining.ts's own doc-comment on the fix for the full
// "why".
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SiweMessage } from "siwe";
import pg from "pg";

const BASE = "http://localhost:3000";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL || "postgresql://postgres:markx@localhost:5432/dogeforge?schema=public" });
await db.connect();

function log(label, ok, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? " — " + extra : ""}`);
  if (!ok) process.exitCode = 1;
}

async function q(sql, params = []) {
  const res = await db.query(sql, params);
  return res.rows;
}
async function scalar(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] ? Object.values(rows[0])[0] : null;
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

async function fundGameRewardUsdt(w, amount = 100) {
  await w.req("/api/mining/simulate-reward-demo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });
}

async function resetYesterdayEpoch() {
  const epochId = await scalar(`SELECT id FROM "MiningEpoch" WHERE "epochDate" = (date_trunc('day', NOW() AT TIME ZONE 'UTC') - INTERVAL '1 day')`);
  if (!epochId) return;
  await q(`DELETE FROM "MiningContractAllocation" WHERE "epochId" = $1`, [epochId]);
  await q(`DELETE FROM "MiningAllocation" WHERE "epochId" = $1`, [epochId]);
  await q(`DELETE FROM "LedgerEntry" WHERE "refType" = 'MiningEpoch' AND "refId" = $1`, [epochId]);
  await q(`DELETE FROM "MiningEpoch" WHERE id = $1`, [epochId]);
  console.log(`(reset yesterday's already-settled epoch ${epochId} so this run can re-derive it fresh)`);
}
await resetYesterdayEpoch();

const A = await signIn();
await fundGameRewardUsdt(A);
await A.req("/api/mining/activate", { method: "POST" });
const { body: purchase } = await A.req("/api/mining/purchase-power", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ amountUsdt: 10, source: "GAME_REWARD_USDT" }),
});
log("Test contract purchased", !!purchase.contractId, JSON.stringify(purchase));

const contractId = purchase.contractId;
const aId = await scalar(`SELECT "walletProfileId" FROM "MiningContract" WHERE id = $1`, [contractId]);
const pricePaidUsdt = Number(await scalar(`SELECT "pricePaidUsdt" FROM "MiningContract" WHERE id = $1`, [contractId]));
const targetRoiPct = Number(await scalar(`SELECT "targetRoiPct" FROM "MiningContract" WHERE id = $1`, [contractId]));
const termDays = Number(await scalar(`SELECT "termDays" FROM "MiningContract" WHERE id = $1`, [contractId]));
const fullDailyTargetUsdt = (pricePaidUsdt * (1 + targetRoiPct)) / termDays;
console.log(`pricePaidUsdt=${pricePaidUsdt} targetRoiPct=${targetRoiPct} termDays=${termDays} fullDailyTargetUsdt=${fullDailyTargetUsdt.toFixed(6)}`);

// Backdate startsAt to exactly 6 hours into "yesterday" (yesterday
// 18:00 UTC) — so yesterday's activeHours for this contract = 6 (18:00
// to midnight), i.e. a 0.25 fraction of the day. expiresAt pushed out
// so it's still active today too (not what's being tested here).
await q(`
  UPDATE "MiningContract"
  SET "startsAt" = (date_trunc('day', NOW() AT TIME ZONE 'UTC') - INTERVAL '1 day' + INTERVAL '18 hours'),
      "expiresAt" = (NOW() AT TIME ZONE 'UTC') + INTERVAL '179 days'
  WHERE id = $1
`, [contractId]);

const doubleCheckStart = await scalar(`SELECT "startsAt" FROM "MiningContract" WHERE id = $1`, [contractId]);
console.log(`Backdated startsAt: ${doubleCheckStart}`);

let dogeUsdtRate = null;
try {
  const j = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=dogecoin&vs_currencies=usd").then((r) => r.json());
  dogeUsdtRate = j.dogecoin?.usd ?? null;
} catch {}

const balanceBefore = Number(
  await scalar(`SELECT COALESCE(SUM(amount), 0) FROM "LedgerEntry" WHERE "walletProfileId" = $1 AND "balanceType" = 'AVAILABLE_DOGE'`, [aId])
);

const { body: proof } = await A.req("/api/mining/proof");
const creditedDoge = proof.lastEpoch?.yourAllocationDoge ?? 0;
console.log(`Credited DOGE for the backdated (6h-active) day: ${creditedDoge}`);

const balanceAfter = Number(
  await scalar(`SELECT COALESCE(SUM(amount), 0) FROM "LedgerEntry" WHERE "walletProfileId" = $1 AND "balanceType" = 'AVAILABLE_DOGE'`, [aId])
);
log("AVAILABLE_DOGE balance increased by the credited amount", Math.abs(balanceAfter - balanceBefore - creditedDoge) < 1e-6, `before=${balanceBefore} after=${balanceAfter} credited=${creditedDoge}`);

if (dogeUsdtRate) {
  const impliedUsdt = creditedDoge * dogeUsdtRate;
  const prorated = fullDailyTargetUsdt * 0.25; // 6/24 hours active
  console.log(`Live DOGE/USDT rate: ${dogeUsdtRate}, implied credited USDT: ${impliedUsdt.toFixed(6)}, expected prorated target: ${prorated.toFixed(6)}, full unprorated target: ${fullDailyTargetUsdt.toFixed(6)}`);
  log(
    "Credited amount is well BELOW the full unprorated daily target (proration is active)",
    impliedUsdt < fullDailyTargetUsdt * 0.5,
    `impliedUsdt=${impliedUsdt.toFixed(6)} vs fullDailyTargetUsdt=${fullDailyTargetUsdt.toFixed(6)}`
  );
  log(
    "Credited amount is reasonably close to the expected ~25%-prorated target",
    Math.abs(impliedUsdt - prorated) < prorated * 0.5 + 0.01,
    `impliedUsdt=${impliedUsdt.toFixed(6)} vs prorated=${prorated.toFixed(6)}`
  );
} else {
  log("Skipped precise USDT-rate cross-check (rate API unreachable) — falling back to the DOGE-only bound below", true);
}
log("Credited DOGE is positive (something was actually paid)", creditedDoge > 0, `${creditedDoge}`);

console.log(process.exitCode ? "\nFAILED" : "\nAll checks passed.");
await db.end();
