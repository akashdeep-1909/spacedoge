// Verifies the v2 two-level referral rewrite: A refers B, B refers C.
// When C settles a paid win, B should get 5% of C's reward (L1) and A
// should get 2% (L2) — both as REFERRAL_USDT, paid instantly, no
// qualification gate.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SiweMessage } from "siwe";

const BASE = "http://localhost:3000";

function log(label, ok, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? " — " + extra : ""}`);
  if (!ok) process.exitCode = 1;
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
  return { address, req };
}

// A (no referrer) -> B (referred by A) -> C (referred by B)
const A = await signIn(undefined);
console.log("A:", A.address);
const B = await signIn(A.address);
console.log("B (referred by A):", B.address);
const C = await signIn(B.address);
console.log("C (referred by B):", C.address);

await C.req("/api/wallet/deposit-demo", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ amount: 50 }),
});

const { body: aBalancesBefore } = await A.req("/api/wallet/balances");
const { body: bBalancesBefore } = await B.req("/api/wallet/balances");

// C plays and wins Rookie Rush (QUICK_RUSH, $1 entry).
const { body: match } = await C.req("/api/matches", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "QUICK_RUSH" }),
});
const { body: settled } = await C.req(`/api/matches/${match.matchId}/settle`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ score: 300, durationPlayedSec: 60 }),
});
log("C settled with a reward", settled.rewardUsdt > 0, `reward=${settled.rewardUsdt}, rank=${settled.rank}`);

const { body: aBalancesAfter } = await A.req("/api/wallet/balances");
const { body: bBalancesAfter } = await B.req("/api/wallet/balances");

const bGain = bBalancesAfter.referralUsdt - bBalancesBefore.referralUsdt;
const aGain = aBalancesAfter.referralUsdt - aBalancesBefore.referralUsdt;
const expectedB = Math.round(settled.rewardUsdt * 0.05 * 1e8) / 1e8;
const expectedA = Math.round(settled.rewardUsdt * 0.02 * 1e8) / 1e8;

log("B (L1, direct) gained ~5% of C's reward", Math.abs(bGain - expectedB) < 1e-6, `got ${bGain}, expected ${expectedB}`);
log("A (L2, indirect) gained ~2% of C's reward", Math.abs(aGain - expectedA) < 1e-6, `got ${aGain}, expected ${expectedA}`);

// Referrals API shape check.
const { body: bReferrals } = await B.req("/api/referrals");
log("B's referredBy is A", bReferrals.referredBy?.referrerAddress?.toLowerCase() === A.address.toLowerCase());
log("B's direct list includes C", bReferrals.direct?.some((r) => r.address.toLowerCase() === C.address.toLowerCase()));

const { body: aReferrals } = await A.req("/api/referrals");
log("A's direct list includes B", aReferrals.direct?.some((r) => r.address.toLowerCase() === B.address.toLowerCase()));
log("A's indirect list includes C", aReferrals.indirect?.some((r) => r.address.toLowerCase() === C.address.toLowerCase()));
log("A's totalEarnedL2Usdt > 0", aReferrals.totalEarnedL2Usdt > 0, `${aReferrals.totalEarnedL2Usdt}`);
log("B's totalEarnedL1Usdt > 0", bReferrals.totalEarnedL1Usdt > 0, `${bReferrals.totalEarnedL1Usdt}`);

console.log(process.exitCode ? "\nFAILED" : "\nAll checks passed.");
