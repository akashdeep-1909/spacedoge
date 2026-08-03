// Verifies the v2 mining rework: activation grants zero hashrate
// (dashboard access only), purchase-power enforces the 5 USDT minimum
// and uses the fixed 22.5 MH/s-per-USDT rate, and the epoch/allocation
// pipeline still works with the new Decimal miningPower column.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SiweMessage } from "siwe";

const BASE = "http://localhost:3000";
let cookie = "";

function log(label, ok, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? " — " + extra : ""}`);
  if (!ok) process.exitCode = 1;
}

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

const account = privateKeyToAccount(generatePrivateKey());
const address = account.address;
console.log("Test wallet:", address);

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

// Need Game Reward USDT — win a Champion Rush match for a big reward.
await req("/api/wallet/deposit-demo", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ amount: 100 }),
});
const { body: match } = await req("/api/matches", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "CHAMPION_RUSH" }),
});
await req(`/api/matches/${match.matchId}/settle`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ score: 500, durationPlayedSec: 90 }),
});

const { body: proofBefore } = await req("/api/mining/proof");
log("Not activated before activation call", proofBefore.activated === false);
log("hasContract false before any purchase", proofBefore.hasContract === false);

// Purchase power BEFORE activation should be rejected.
const { res: earlyPurchaseRes } = await req("/api/mining/purchase-power", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ amountUsdt: 5, source: "GAME_REWARD_USDT" }),
});
log("Purchase rejected before activation", earlyPurchaseRes.status === 403);

// Activate.
const { res: activateRes } = await req("/api/mining/activate", { method: "POST" });
log("Activation succeeds", activateRes.ok);

const { body: proofAfterActivate } = await req("/api/mining/proof");
log("Activated after activation call", proofAfterActivate.activated === true);
log("Still zero hashrate right after activation (dashboard-only)", proofAfterActivate.hasContract === false);

// Purchase below minimum should be rejected.
const { res: tooSmallRes } = await req("/api/mining/purchase-power", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ amountUsdt: 2, source: "GAME_REWARD_USDT" }),
});
log("Purchase below 5 USDT minimum rejected", tooSmallRes.status === 400);

// Purchase 5 USDT -> 112.5 MH/s, level SPARK.
const { body: purchase5 } = await req("/api/mining/purchase-power", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ amountUsdt: 5, source: "GAME_REWARD_USDT" }),
});
log("5 USDT -> 112.5 MH/s", purchase5.miningPower === 112.5, `got ${purchase5.miningPower}`);
log("5 USDT -> SPARK level", purchase5.level === "SPARK", `got ${purchase5.level}`);

// Purchase another 10 USDT from a different source -> stacks to 337.5 MH/s total, SCOUT level shown in proof.
const { body: purchase10 } = await req("/api/mining/purchase-power", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ amountUsdt: 10, source: "PLAY_USDT" }),
});
log("10 USDT -> 225 MH/s", purchase10.miningPower === 225, `got ${purchase10.miningPower}`);

const { body: proofFinal } = await req("/api/mining/proof");
log("Total stacked hashrate = 337.5 MH/s", proofFinal.miningPower === 337.5, `got ${proofFinal.miningPower}`);
log("Aggregated level reflects total (SCOUT, >=225)", proofFinal.level === "SCOUT", `got ${proofFinal.level}`);
log("hasContract true now", proofFinal.hasContract === true);
log("Epoch allocation present (isSimulated)", proofFinal.isSimulated === true);
log("lastEpoch totalEffectiveMp is a number", typeof proofFinal.lastEpoch.totalEffectiveMp === "number");

const { body: balances } = await req("/api/wallet/balances");
log("activeMiningPower balance matches proof", balances.activeMiningPower === 337.5, `got ${balances.activeMiningPower}`);

console.log(process.exitCode ? "\nFAILED" : "\nAll checks passed.");
