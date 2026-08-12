// Verifies GET /api/referrals/activity's reconstructed per-wallet
// mining-referral rows (src/app/api/referrals/activity/route.ts) match
// what settleEpochForDate actually carved out and credited — i.e. that
// reconstructing from MiningContractAllocation.electricityShareUsdt +
// dogeUsdtRate reproduces the real historical L1 commission exactly,
// not an approximation. Root-caused from a live bug report: a
// referrer saw several direct referrals stuck on "No reward paid yet"
// despite (per the user) having active hashrate, and separately asked
// for a per-referred-wallet breakdown the aggregated ledger entry
// can't provide on its own — see the route's own doc-comment.
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
  return (await db.query(sql, params)).rows;
}
async function scalar(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] ? Object.values(rows[0])[0] : null;
}

async function signIn(referralCode) {
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
    body: JSON.stringify({ message, signature, referralCode }),
  });
  await req("/api/auth/onboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ countryCode: "US", ageConfirmed: true, termsVersion: "v1" }),
  });
  return { address: address.toLowerCase(), req };
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

// A = referrer, B = referred (signs up using A's address as the referral code)
const A = await signIn();
const B = await signIn(A.address);

const referralRow = await scalar(`SELECT status FROM "Referral" r JOIN "WalletProfile" w ON w.id = r."referredProfileId" WHERE lower(w.address) = lower($1)`, [B.address]);
log("Referral edge created with PENDING status", referralRow === "PENDING", `status=${referralRow}`);

await B.req("/api/mining/simulate-reward-demo", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ amount: 100 }),
});
await B.req("/api/mining/activate", { method: "POST" });
const { body: purchase } = await B.req("/api/mining/purchase-power", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ amountUsdt: 10, source: "GAME_REWARD_USDT" }),
});
log("B's mining contract purchased", !!purchase.contractId, JSON.stringify(purchase));
const contractId = purchase.contractId;

// Backdate 6 hours into yesterday, same convention as the proration
// smoke test — gives yesterday's settlement a real eh>0 to carve from.
await q(`
  UPDATE "MiningContract"
  SET "startsAt" = (date_trunc('day', NOW() AT TIME ZONE 'UTC') - INTERVAL '1 day' + INTERVAL '18 hours'),
      "expiresAt" = (NOW() AT TIME ZONE 'UTC') + INTERVAL '179 days'
  WHERE id = $1
`, [contractId]);

// Trigger settlement of yesterday's epoch (lazy, same as every other
// page that reads mining data) via B's own proof endpoint.
await B.req("/api/mining/proof");

const alloc = await q(
  `SELECT "electricityShareUsdt", "dogeUsdtRate" FROM "MiningContractAllocation" WHERE "contractId" = $1`,
  [contractId]
);
log("Settlement created exactly one allocation row for B's contract", alloc.length === 1, `rows=${alloc.length}`);
if (alloc.length === 1) {
  // The stored electricityShareUsdt is already NET of the carve (see
  // mining.ts: results.push stores netElectricityShare, not the gross
  // share the carve was computed from) — A has no referrer of its own
  // here, so only L1 (5%) was carved from B's contract, i.e. stored =
  // gross * 0.95. Recover gross first, exactly like the route now does.
  const electricityShareUsdt = Number(alloc[0].electricityShareUsdt);
  const dogeUsdtRate = Number(alloc[0].dogeUsdtRate);
  const grossElectricityShareUsdt = electricityShareUsdt / 0.95;
  const expectedL1Doge = (grossElectricityShareUsdt * 0.05) / dogeUsdtRate;

  const ledgerL1 = Number(
    await scalar(
      `SELECT COALESCE(SUM(amount), 0) FROM "LedgerEntry" WHERE "walletProfileId" = (SELECT id FROM "WalletProfile" WHERE lower(address) = lower($1)) AND reason = 'mining_referral_l1'`,
      [A.address]
    )
  );
  log(
    "A's actual mining_referral_l1 ledger credit matches the expected 5% carve",
    Math.abs(ledgerL1 - expectedL1Doge) < 1e-8,
    `ledger=${ledgerL1} expected=${expectedL1Doge}`
  );

  const { body: activity } = await A.req("/api/referrals/activity");
  const row = (activity.miningRows ?? []).find((r) => r.referredAddress?.toLowerCase() === B.address);
  log("Reconstructed /api/referrals/activity row exists for B", !!row, JSON.stringify(row));
  if (row) {
    log("Reconstructed row is attributed level L1", row.level === "L1", `level=${row.level}`);
    log(
      "Reconstructed row's amountDoge matches the real ledger credit exactly",
      Math.abs(row.amountDoge - ledgerL1) < 1e-8,
      `row=${row.amountDoge} ledger=${ledgerL1}`
    );
  }

  const referralStatusAfter = await scalar(`SELECT status FROM "Referral" r JOIN "WalletProfile" w ON w.id = r."referredProfileId" WHERE lower(w.address) = lower($1)`, [B.address]);
  log("Referral edge flipped to QUALIFIED after the carve credited", referralStatusAfter === "QUALIFIED", `status=${referralStatusAfter}`);
}

console.log(process.exitCode ? "\nFAILED" : "\nAll checks passed.");
await db.end();
