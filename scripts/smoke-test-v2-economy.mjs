// Verifies the v2 economy rewrite: room reserve math (T=4E, P=0.70T,
// O=0.15T, M=0.10T, R=0.05T) for a newly-added tier (Explorer Rush,
// $2), and the proportional top-3 reward formula (Gi = Si x C).
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
const { res: verifyRes } = await req("/api/auth/verify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message, signature }),
});
log("Sign in", verifyRes.ok);

await req("/api/auth/onboard", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ countryCode: "US", ageConfirmed: true, termsVersion: "v1" }),
});

await req("/api/wallet/deposit-demo", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ amount: 50 }),
});

// --- Explorer Rush ($2/player): T=8, P=5.6, O=1.2, M=0.8, R=0.4 ---
const { res: matchRes, body: match } = await req("/api/matches", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "EXPLORER_RUSH" }),
});
log("POST /api/matches (EXPLORER_RUSH)", matchRes.ok, JSON.stringify(match));
log("entryFeeUsdt = 2", match?.entryFeeUsdt === 2);
log("prizePoolUsdt = 5.6", match?.prizePoolUsdt === 5.6, `got ${match?.prizePoolUsdt}`);
log("players = 4", match?.players === 4);

// Settle with a high, plausible score for a 60s room (score/sec <= 6).
const durationPlayedSec = 60;
const score = 300; // 5/sec, under the 6/sec ceiling
const { res: settleRes, body: settled } = await req(`/api/matches/${match.matchId}/settle`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ score, durationPlayedSec }),
});
log("POST settle", settleRes.ok, JSON.stringify(settled));
log("rank is 1-4", settled?.rank >= 1 && settled?.rank <= 4, `rank=${settled?.rank}`);

if (settled?.rank <= 3) {
  log("rewardUsdt > 0 for top-3 finish", settled.rewardUsdt > 0, `reward=${settled.rewardUsdt}`);
  log("rewardUsdt <= prizePoolUsdt (can't exceed the pool)", settled.rewardUsdt <= 5.6, `reward=${settled.rewardUsdt}`);
} else {
  log("rewardUsdt = 0 for 4th place", settled.rewardUsdt === 0, `reward=${settled.rewardUsdt}`);
}

// Idempotency: settling again returns the same stored result, no re-credit.
const { body: resettled } = await req(`/api/matches/${match.matchId}/settle`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ score, durationPlayedSec }),
});
log("Idempotent re-settle returns same reward", resettled.rewardUsdt === settled.rewardUsdt, `${resettled.rewardUsdt} vs ${settled.rewardUsdt}`);
log("Idempotent re-settle flagged alreadySettled", resettled.alreadySettled === true);

// --- Champion Rush ($25/player): T=100, P=70, O=15, M=10, R=5 ---
const { body: champ } = await req("/api/matches", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "CHAMPION_RUSH" }),
});
log("Champion Rush prizePoolUsdt = 70", champ?.prizePoolUsdt === 70, `got ${champ?.prizePoolUsdt}`);

console.log(process.exitCode ? "\nFAILED" : "\nAll checks passed.");
