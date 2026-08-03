// Real end-to-end test of the SIWE auth flow + full economic loop.
// Uses a throwaway keypair to produce an ACTUAL ECDSA signature over a
// real SIWE message, so this exercises real cryptographic verification
// server-side, not a mocked session.
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

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);
const address = account.address;
console.log("Test wallet:", address);

// 1. Nonce
const { res: nonceRes, body: nonceBody } = await req(`/api/auth/nonce?address=${address}`);
log("GET /api/auth/nonce", nonceRes.ok && !!nonceBody.nonce);

// 2. Build + sign a real SIWE message — constructed via the same
// `siwe` library the app uses, so the format is guaranteed compliant.
const siweMessage = new SiweMessage({
  domain: "localhost:3000",
  address,
  statement: "Sign in to Space DOGE. This request will not trigger a blockchain transaction or cost any gas fees.",
  uri: BASE,
  version: "1",
  chainId: 11155111,
  nonce: nonceBody.nonce,
});
const message = siweMessage.prepareMessage();

const signature = await account.signMessage({ message });

// 3. Verify
const { res: verifyRes, body: verifyBody } = await req("/api/auth/verify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message, signature }),
});
log("POST /api/auth/verify", verifyRes.ok, JSON.stringify(verifyBody));

// 4. Session check
const { body: sessionBody } = await req("/api/auth/session");
log("GET /api/auth/session authenticated", sessionBody.authenticated === true);
log("requiresOnboarding is true before onboarding", sessionBody.requiresOnboarding === true);

// 5. Onboard
const { res: onboardRes } = await req("/api/auth/onboard", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ countryCode: "US", ageConfirmed: true }),
});
log("POST /api/auth/onboard", onboardRes.ok);

// 6. Balances start at zero
const { body: bal0 } = await req("/api/wallet/balances");
log("Initial Play USDT is 0", bal0.playUsdt === 0, JSON.stringify(bal0));

// 7. Simulated deposit
const { res: depRes } = await req("/api/wallet/deposit-demo", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ amount: 20 }),
});
log("POST /api/wallet/deposit-demo", depRes.ok);

const { body: bal1 } = await req("/api/wallet/balances");
log("Play USDT is 20 after deposit", bal1.playUsdt === 20, JSON.stringify(bal1));

// 8. Start a Quick Rush match (costs 1 Play USDT)
const { res: matchRes, body: matchBody } = await req("/api/matches", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "QUICK_RUSH" }),
});
log("POST /api/matches (QUICK_RUSH)", matchRes.ok, JSON.stringify(matchBody));

const { body: bal2 } = await req("/api/wallet/balances");
log("Play USDT debited by entry fee", bal2.playUsdt === 19, JSON.stringify(bal2));

// 9. Settle with a high score to guarantee rank #1
const { res: settleRes, body: settleBody } = await req(
  `/api/matches/${matchBody.matchId}/settle`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score: 280, durationPlayedSec: 55 }),
  }
);
log("POST /api/matches/:id/settle", settleRes.ok, JSON.stringify(settleBody));
log("Rank #1 with reward > 0", settleBody.rank === 1 && settleBody.rewardUsdt > 0, JSON.stringify(settleBody));

// 10. Idempotent re-settle
const { body: settleAgain } = await req(`/api/matches/${matchBody.matchId}/settle`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ score: 999, durationPlayedSec: 45 }),
});
log(
  "Re-settling is idempotent (ignores new score)",
  settleAgain.alreadySettled === true && settleAgain.rewardUsdt === settleBody.rewardUsdt,
  JSON.stringify(settleAgain)
);

const { body: bal3 } = await req("/api/wallet/balances");
log(
  "Game Reward USDT credited from match win",
  bal3.gameRewardUsdt === settleBody.rewardUsdt,
  JSON.stringify(bal3)
);

// 11. Activate mining rig (needs >= 1 Game Reward USDT)
if (bal3.gameRewardUsdt >= 1) {
  const { res: actRes, body: actBody } = await req("/api/mining/activate", { method: "POST" });
  log("POST /api/mining/activate", actRes.ok, JSON.stringify(actBody));

  const { body: bal4 } = await req("/api/wallet/balances");
  log("Active Mining Power is 100 after activation", bal4.activeMiningPower === 100, JSON.stringify(bal4));
  log(
    "Game Reward USDT debited by 1 for activation",
    Math.abs(bal4.gameRewardUsdt - (bal3.gameRewardUsdt - 1)) < 1e-9,
    JSON.stringify(bal4)
  );

  // 12. Mining proof + simulated allocation
  const { res: proofRes, body: proofBody } = await req("/api/mining/proof");
  log("GET /api/mining/proof", proofRes.ok && proofBody.hasContract === true, JSON.stringify(proofBody));
  log("Proof is explicitly marked simulated", proofBody.isSimulated === true);
  log(
    "Today's epoch produced a DOGE allocation for this wallet",
    proofBody.lastEpoch?.yourAllocationDoge > 0,
    JSON.stringify(proofBody.lastEpoch)
  );

  const { body: bal5 } = await req("/api/wallet/balances");
  log(
    "Available DOGE credited from mining allocation",
    bal5.availableDoge > 0,
    JSON.stringify(bal5)
  );
} else {
  log("Skipping mining activation — insufficient Game Reward USDT", false, JSON.stringify(bal3));
}

// 13. Practice mode never touches Play/Reward USDT
const { body: bal5 } = await req("/api/wallet/balances");
const { body: practiceMatch } = await req("/api/matches", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "PRACTICE" }),
});
await req(`/api/matches/${practiceMatch.matchId}/settle`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ score: 50, durationPlayedSec: 45 }),
});
const { body: bal6 } = await req("/api/wallet/balances");
log(
  "Practice mode leaves Play/Reward USDT unchanged",
  bal6.playUsdt === bal5.playUsdt && bal6.gameRewardUsdt === bal5.gameRewardUsdt,
  `before=${JSON.stringify(bal5)} after=${JSON.stringify(bal6)}`
);

// 14. Logout clears the session
await req("/api/auth/logout", { method: "POST" });
const { body: sessionAfterLogout } = await req("/api/auth/session");
log("Session cleared after logout", sessionAfterLogout.authenticated === false);

console.log("\nDone.");
