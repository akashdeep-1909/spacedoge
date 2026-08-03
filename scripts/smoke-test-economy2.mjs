// E2E test of the second economy phase: referrals, DOGE→USDT
// conversion, and simulated withdrawal. Same real-signature pattern as
// scripts/smoke-test.mjs — two throwaway wallets (referrer + referred)
// with genuine SIWE signatures, no mocks.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SiweMessage } from "siwe";

const BASE = "http://localhost:3000";
let failed = false;

function log(label, ok, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? " — " + extra : ""}`);
  if (!ok) failed = true;
}

function makeClient() {
  let cookie = "";
  return async function req(path, opts = {}) {
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
  };
}

async function signIn(req, { referralCode, account } = {}) {
  account = account ?? privateKeyToAccount(generatePrivateKey());
  const address = account.address;
  const { body: nb } = await req(`/api/auth/nonce?address=${address}`);
  const siwe = new SiweMessage({
    domain: "localhost:3000",
    address,
    statement: "Sign in to Space DOGE. This request will not trigger a blockchain transaction or cost any gas fees.",
    uri: BASE,
    version: "1",
    chainId: 11155111,
    nonce: nb.nonce,
  });
  const message = siwe.prepareMessage();
  const signature = await account.signMessage({ message });
  const { res } = await req("/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature, referralCode }),
  });
  return { address, ok: res.ok };
}

async function onboardAndDeposit(req, usdt) {
  await req("/api/auth/onboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ countryCode: "US", ageConfirmed: true }),
  });
  await req("/api/wallet/deposit-demo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: usdt }),
  });
}

async function playAndWin(req) {
  const { body: m } = await req("/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "QUICK_RUSH" }),
  });
  const { body: settled } = await req(`/api/matches/${m.matchId}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score: 280, durationPlayedSec: 55 }),
  });
  return settled;
}

// --- Referrer wallet ---
const reqA = makeClient();
const referrer = await signIn(reqA);
log("Referrer signed in", referrer.ok);
await onboardAndDeposit(reqA, 5);

// --- Referred wallet, attributed to the referrer via ?ref= ---
const reqB = makeClient();
const referred = await signIn(reqB, { referralCode: referrer.address });
log("Referred wallet signed in with referralCode", referred.ok);
await onboardAndDeposit(reqB, 20);

const { body: refCheck0 } = await reqB("/api/referrals");
log(
  "Referred wallet shows referredBy immediately after first connect",
  refCheck0.referredBy?.referrerAddress?.toLowerCase() === referrer.address.toLowerCase() &&
    refCheck0.referredBy?.status === "PENDING",
  JSON.stringify(refCheck0.referredBy)
);

// Play 5 settled paid QUICK_RUSH matches (doc 13.2 qualification bar).
let lastSettle;
for (let i = 0; i < 5; i++) {
  lastSettle = await playAndWin(reqB);
}
log("5th settled match rewarded", lastSettle.rewardUsdt > 0, JSON.stringify(lastSettle));

const { body: refAfterGames } = await reqB("/api/referrals");
log(
  "Still PENDING after 5 games but before rig activation",
  refAfterGames.referredBy?.status === "PENDING",
  JSON.stringify(refAfterGames.referredBy)
);

// Activate Starter Rig — the qualification bar's last condition.
const { res: actRes } = await reqB("/api/mining/activate", { method: "POST" });
log("Referred wallet activated Starter Rig", actRes.ok);

const { body: refAfterActivate } = await reqB("/api/referrals");
log(
  "Referred wallet's own referral flips to REWARDED after activation",
  refAfterActivate.referredBy?.status === "REWARDED",
  JSON.stringify(refAfterActivate.referredBy)
);

const { body: balB } = await reqB("/api/wallet/balances");
log(
  "Referred wallet has 100 (Starter) + 50 (referral bonus) = 150 active MP",
  balB.activeMiningPower === 150,
  JSON.stringify(balB)
);

const { body: refA } = await reqA("/api/referrals");
const myReferral = refA.referrals.find((r) => r.address.toLowerCase() === referred.address.toLowerCase());
log(
  "Referrer sees the referral as REWARDED with 5 bonus MP (5% of 100)",
  myReferral?.status === "REWARDED" && myReferral?.bonusMpReferrer === 5,
  JSON.stringify(myReferral)
);

const { body: balA } = await reqA("/api/wallet/balances");
log("Referrer's active MP includes the 5 bonus MP", balA.activeMiningPower === 5, JSON.stringify(balA));

// --- Convert: get an Available DOGE balance via the mining proof endpoint, then convert some ---
await reqB("/api/mining/proof"); // triggers ensureAllocationForWallet -> credits Available DOGE
const { body: balBeforeConvert } = await reqB("/api/wallet/balances");
log("Referred wallet has Available DOGE from mining allocation", balBeforeConvert.availableDoge > 0, JSON.stringify(balBeforeConvert));

const convertAmount = Math.min(5, Math.floor(balBeforeConvert.availableDoge));
if (convertAmount >= 5) {
  const { res: quoteRes, body: quote } = await reqB(`/api/wallet/convert?dogeAmount=${convertAmount}`);
  log("GET convert quote", quoteRes.ok && quote.isSimulated === true, JSON.stringify(quote));

  const { res: convRes, body: convBody } = await reqB("/api/wallet/convert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dogeAmount: convertAmount }),
  });
  log("POST convert executes", convRes.ok, JSON.stringify(convBody));

  const { body: balAfterConvert } = await reqB("/api/wallet/balances");
  log(
    "Available DOGE debited by converted amount",
    Math.abs(balAfterConvert.availableDoge - (balBeforeConvert.availableDoge - convertAmount)) < 1e-9,
    JSON.stringify(balAfterConvert)
  );
  log(
    "Recycled USDT credited with quoted finalUsdt",
    Math.abs(balAfterConvert.recycledUsdt - convBody.finalUsdt) < 1e-9,
    JSON.stringify(balAfterConvert)
  );

  // Below-minimum conversion should be rejected.
  const { res: tooSmallRes } = await reqB("/api/wallet/convert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dogeAmount: 1 }),
  });
  log("Conversion below minimum (1 DOGE) is rejected", tooSmallRes.status === 400);

  // --- Withdraw from Game Reward USDT (plenty of balance from the 5 wins) ---
  const { body: balBeforeWithdraw } = await reqB("/api/wallet/balances");
  const { res: wdRes, body: wdBody } = await reqB("/api/wallet/withdraw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "GAME_REWARD_USDT", amount: 5 }),
  });
  log("Withdraw from Game Reward USDT succeeds", wdRes.ok && wdBody.isSimulated === true, JSON.stringify(wdBody));

  const { body: balAfterWithdraw } = await reqB("/api/wallet/balances");
  log(
    "Game Reward USDT debited by withdrawal amount",
    Math.abs(balAfterWithdraw.gameRewardUsdt - (balBeforeWithdraw.gameRewardUsdt - 5)) < 1e-9,
    JSON.stringify(balAfterWithdraw)
  );
} else {
  log("Skipping convert/withdraw — insufficient simulated Available DOGE this run", false, JSON.stringify(balBeforeConvert));
}

// Withdrawal below minimum is rejected.
const { res: wdTooSmall } = await reqB("/api/wallet/withdraw", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ source: "GAME_REWARD_USDT", amount: 1 }),
});
log("Withdrawal below minimum ($5) is rejected", wdTooSmall.status === 400);

// Self-referral must never be attributed, even if a wallet passes its
// own address as referralCode on its own genuine first sign-in.
const reqD = makeClient();
const selfAccount = privateKeyToAccount(generatePrivateKey());
const selfSignIn = await signIn(reqD, { account: selfAccount, referralCode: selfAccount.address });
log("Self-referral sign-in still succeeds", selfSignIn.ok);
const { body: selfCheck } = await reqD("/api/referrals");
log(
  "Self-referral is never attributed",
  selfCheck.referredBy === null,
  JSON.stringify(selfCheck.referredBy)
);

console.log(failed ? "\nSome checks FAILED." : "\nAll checks passed.");
process.exitCode = failed ? 1 : 0;
