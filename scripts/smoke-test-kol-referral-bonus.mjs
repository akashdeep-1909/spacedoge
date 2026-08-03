// Verifies the KOL referral free-play bonus end-to-end:
//   1. A wallet referred through a KOL-flagged referrer's link gets
//      exactly 3 lifetime KOL_REFERRAL_BONUS plays, shared 300-PTS
//      (0.3 USDT) cap across all 3.
//   2. The reward is score-based and clamps to whatever's left of the
//      cap (not per-play, cumulative across all 3 plays).
//   3. Every bot always outscores the human in this mode (rank 4,
//      never higher) via rankKolBonusMatch, independent of the reward.
//   4. A 4th play attempt is rejected once the 3 plays are used.
//   5. The mode-scoped busy-check rejects a 2nd concurrent open play.
//   6. A wallet with no KOL referrer (or referred by a non-KOL) gets
//      zero eligibility.
//   7. The KOL's own ordinary L1 referral commission still fires
//      normally on the referred wallet's PAID matches — proves no
//      accidental coupling with the new isKol flag / bonus mode.
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
    body: JSON.stringify({ message, signature, ...(referralCode ? { referralCode } : {}) }),
  });
  await req("/api/auth/onboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ countryCode: "US", ageConfirmed: true }),
  });
  return { address, req };
}

function walletProfileId(address) {
  return psql(`SELECT id FROM "WalletProfile" WHERE address = '${address.toLowerCase()}'`);
}

function ptsBalance(wpId) {
  return Number(psql(`SELECT COALESCE(SUM(amount), 0) FROM "LedgerEntry" WHERE "walletProfileId" = '${wpId}' AND "balanceType" = 'PTS'`));
}

function referralUsdtBalance(wpId) {
  return Number(psql(`SELECT COALESCE(SUM(amount), 0) FROM "LedgerEntry" WHERE "walletProfileId" = '${wpId}' AND "balanceType" = 'REFERRAL_USDT'`));
}

async function playKolBonus(w, score) {
  const { body: created, res: createRes } = await w.req("/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "KOL_REFERRAL_BONUS" }),
  });
  if (!createRes.ok) return { createRes, created, settled: null, settleRes: null };
  const { body: settled, res: settleRes } = await w.req(`/api/matches/${created.matchId}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score, durationPlayedSec: 60 }),
  });
  return { createRes, created, settled, settleRes };
}

async function main() {
  console.log("--- KOL referral free-play bonus smoke test ---");

  // 1. Mint the KOL, flag it directly (no API path other than the
  //    admin route, which needs an admin session this script doesn't
  //    want to bootstrap) — same "direct DB manipulation for controlled
  //    setup" precedent every other smoke test in this repo relies on.
  const K = await signIn();
  psql(`UPDATE "WalletProfile" SET "isKol" = true WHERE id = '${walletProfileId(K.address)}'`);

  // 2. R is referred through K's link on its genuine first connect.
  const R = await signIn(K.address);

  // 3. N is a control wallet with no KOL referrer at all.
  const N = await signIn();

  // 4. Eligibility surfaced via GET /api/game-modes.
  const { body: modesR } = await R.req("/api/game-modes");
  log(
    "R starts with 3 plays / 300 PTS cap eligible",
    modesR.kolBonus?.eligible === true && modesR.kolBonus?.playsRemaining === 3 && modesR.kolBonus?.ptsCapRemaining === 300,
    JSON.stringify(modesR.kolBonus)
  );

  const { body: modesN } = await N.req("/api/game-modes");
  log("N (no KOL referrer) has zero eligibility", modesN.kolBonus?.eligible === false, JSON.stringify(modesN.kolBonus));

  // 5. Play 1: score 500 deliberately exceeds the 300-PTS cap on its
  //    own — proves clamping, and proves every bot outscores the human.
  const play1 = await playKolBonus(R, 500);
  log("Play 1 settles ok", play1.settleRes?.ok === true, JSON.stringify(play1.settled));
  log("Play 1 reward clamps to exactly 300 PTS ($0.30)", play1.settled?.rewardUsdt === 0.3, `got ${play1.settled?.rewardUsdt}`);
  log("Play 1: human ranks last (4)", play1.settled?.rank === 4, `got rank ${play1.settled?.rank}`);
  const bots1 = (play1.settled?.participants ?? []).filter((p) => p.isBot);
  const you1 = (play1.settled?.participants ?? []).find((p) => p.isYou);
  log(
    "Play 1: every bot outscores the human",
    bots1.length === 3 && bots1.every((b) => b.gameplayPts > (you1?.gameplayPts ?? Infinity)),
    JSON.stringify({ bots: bots1.map((b) => b.gameplayPts), you: you1?.gameplayPts })
  );

  // 6. Plays 2 & 3: cap already exhausted, so reward is 0 regardless of
  //    score, but the human still always ranks last.
  const play2 = await playKolBonus(R, 50);
  log("Play 2 reward is 0 (cap already used)", play2.settled?.rewardUsdt === 0, `got ${play2.settled?.rewardUsdt}`);
  log("Play 2: human ranks last (4)", play2.settled?.rank === 4, `got rank ${play2.settled?.rank}`);

  const play3 = await playKolBonus(R, 50);
  log("Play 3 reward is 0 (cap already used)", play3.settled?.rewardUsdt === 0, `got ${play3.settled?.rewardUsdt}`);
  log("Play 3: human ranks last (4)", play3.settled?.rank === 4, `got rank ${play3.settled?.rank}`);

  // 7. Play 4 attempt: all 3 lifetime chances used — must be rejected.
  const play4 = await playKolBonus(R, 10);
  log("Play 4 attempt rejected (403)", play4.createRes.status === 403, `got ${play4.createRes.status}`);

  // 8. Re-check eligibility now reads exhausted.
  const { body: modesRAfter } = await R.req("/api/game-modes");
  log("R's eligibility now exhausted", modesRAfter.kolBonus?.eligible === false, JSON.stringify(modesRAfter.kolBonus));

  // 9. Cumulative PTS credited across all 3 plays is exactly 300, never
  //    more (proves the shared-budget clamp, not a per-play 300 cap).
  log("R's total PTS credited is exactly 300", ptsBalance(walletProfileId(R.address)) === 300, `got ${ptsBalance(walletProfileId(R.address))}`);

  // 10. Concurrency guard: a fresh KOL-referred wallet opens 2 plays
  //     back-to-back without settling the first — the 2nd creation
  //     must be rejected (409), closing the double-settle race the cap
  //     would otherwise be vulnerable to.
  const R2 = await signIn(K.address);
  const { res: openRes } = await R2.req("/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "KOL_REFERRAL_BONUS" }),
  });
  log("R2's first play creates ok", openRes.ok === true, `got ${openRes.status}`);
  const { res: secondOpenRes } = await R2.req("/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "KOL_REFERRAL_BONUS" }),
  });
  log("R2's 2nd concurrent play rejected (409)", secondOpenRes.status === 409, `got ${secondOpenRes.status}`);

  // 11. Regression: K's ordinary L1 referral commission still fires
  //     normally on R's PAID matches — proves no accidental coupling
  //     between isKol / the bonus mode and the pre-existing commission
  //     code path.
  await R.req("/api/wallet/deposit-demo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 5 }),
  });
  const kBefore = referralUsdtBalance(walletProfileId(K.address));
  const { body: paidCreated } = await R.req("/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "QUICK_RUSH" }),
  });
  await R.req(`/api/matches/${paidCreated.matchId}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score: 30, durationPlayedSec: 60 }),
  });
  const kAfter = referralUsdtBalance(walletProfileId(K.address));
  log("K's L1 referral commission still credits on R's paid match", kAfter > kBefore, `before=${kBefore} after=${kAfter}`);

  console.log(process.exitCode ? "\n❌ SOME CHECKS FAILED" : "\n✅ ALL CHECKS PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
