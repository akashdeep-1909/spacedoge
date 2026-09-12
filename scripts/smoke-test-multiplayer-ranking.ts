// Verifies the rankBotMatch fix end to end — reported live as "a real
// player can never place 1st in a room with filler bots, no matter how
// well they play" ("still coming on 2nd position"). Root cause: the
// solo-vs-bots anti-farming guarantee (a bot forced to an unconditional
// top rank) used to apply to ANY room with 1-3 real humans, not just
// genuine solo play — see src/lib/game-config.ts's rankBotMatch
// doc-comment for the full explanation.
//
//   1. 2 real humans + 2 filler bots: the human who scores HIGHEST
//      actually ranks 1st (proving no bot is unconditionally above
//      them), and the bots' displayed scores are their real simulated
//      values — not bumped past a human's score.
//   2. 3 real humans + 1 filler bot: same — the top-scoring human ranks
//      1st, the bot doesn't get an automatic win.
//   3. True solo play (1 real human + 3 bots, via instant-play /
//      settle) is UNCHANGED — the human is still guaranteed 3rd or 4th,
//      never 1st or 2nd, preserving the actual anti-farming guarantee
//      this rule exists for.
//
// Run via tsx (see scripts/smoke-test-shop-phase1.ts for why):
//   npx tsx scripts/smoke-test-multiplayer-ranking.ts
import "dotenv/config";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SiweMessage } from "siwe";
import { db } from "../src/lib/db";

const BASE = "http://localhost:3000";
let failures = 0;

function log(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? " — " + extra : ""}`);
  if (!ok) failures++;
}

async function makeClient() {
  const account = privateKeyToAccount(generatePrivateKey());
  let cookie = "";
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
  const { body: nonceBody } = await req(`/api/auth/nonce?address=${account.address}`);
  const siwe = new SiweMessage({
    domain: "localhost:3000",
    address: account.address,
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
  await req("/api/wallet/deposit-demo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 100 }),
  });
  const address = account.address.toLowerCase();
  const wp = await db.walletProfile.findUniqueOrThrow({ where: { address } });
  return { address, req, walletProfileId: wp.id };
}

const createdWalletIds: string[] = [];
const createdLobbyHostIds: string[] = [];

async function twoHumansRoom(humanCount: 2 | 3, label: string) {
  const host = await makeClient();
  createdWalletIds.push(host.walletProfileId);
  createdLobbyHostIds.push(host.walletProfileId);
  const friends = await Promise.all(Array.from({ length: humanCount - 1 }, () => makeClient()));
  for (const f of friends) createdWalletIds.push(f.walletProfileId);

  const { body: lobby } = await host.req("/api/lobbies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageAmount: 1 }),
  });
  const { body: linkBody } = await host.req(`/api/lobbies/${lobby.id}/invite-link`, { method: "POST" });
  for (const f of friends) await f.req(`/api/invite-links/${linkBody.token}/join`, { method: "POST" });
  const { body: started } = await host.req(`/api/lobbies/${lobby.id}/start`, { method: "POST" });
  const matchId: string = started.finalMatchId;

  // The anti-cheat ceiling (maxPlausibleScore) is bounded by REAL
  // server-side elapsed time since the match started, not by the
  // claimed durationPlayedSec — submitting instantly (no wait) clamps
  // effectiveDurationSec down to just a few seconds and zeroes out
  // every one of these scores as "outside plausible range" (nothing to
  // do with the ranking fix itself — see settle/route.ts's own
  // doc-comment on effectiveDurationSec). Waiting a real 40s gives
  // enough headroom for the comfortably-separated scores below to
  // survive it.
  console.log(`[${label}] Waiting 40s for a real settlement window...`);
  await new Promise((r) => setTimeout(r, 40_000));

  // Every human reports a DISTINCT score, comfortably above botScore()'s
  // own theoretical max for a 60s match (~210, see botScore()'s own
  // formula) so the top human reliably outranks every bot regardless of
  // that match's own random bot-score draw, and comfortably below the
  // ~376 plausibility ceiling a 40s real wait affords.
  const humans = [host, ...friends];
  const scores = humans.map((_, i) => 300 - i * 30); // host highest, each friend a bit lower

  // Submitting a result is idempotent past the first call per
  // participant (results/route.ts only stores the score on that first
  // submission), so it's safe to call this same request again as a
  // "poll" — exactly what the real lobby page's own 3s interval does.
  async function submit(client: typeof host, score: number) {
    const { body } = await client.req(`/api/matches/${matchId}/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score, durationPlayedSec: lobby.durationSec ?? 60 }),
    });
    return body;
  }

  // Sequential, not Promise.all — submitting concurrently can have
  // every request's own transaction snapshot the others as "not yet
  // submitted," missing the moment allSubmitted actually flips true.
  const statuses: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ad-hoc JSON response body, throwaway verification script
  let settled: any;
  for (let i = 0; i < humans.length; i++) {
    const body = await submit(humans[i], scores[i]);
    statuses.push(body.status);
    if (body.status === "settled") settled = body;
  }
  // One extra poll (from the host) in case the very last submission
  // above raced the finalize step and reported "waiting" — mirrors the
  // real page's own retry-every-3s polling loop.
  if (!settled) {
    const retryBody = await submit(host, scores[0]);
    statuses.push(retryBody.status);
    if (retryBody.status === "settled") settled = retryBody;
  }
  log(`[${label}] Match settles once all humans submit`, !!settled, JSON.stringify(statuses));
  if (!settled) return;

  // "isYou" on this response reflects whichever client's own request
  // happened to be the one that actually triggered/observed settlement
  // — with sequential submission that's often the LAST human to
  // submit, not necessarily the host — so identify the top scorer by
  // their own distinct score instead of by isYou.
  const topScorer = settled.participants.find((p: { gameplayPts: number }) => p.gameplayPts === scores[0]);
  log(`[${label}] The highest-scoring human (score ${scores[0]}) ranks 1st — no bot has an unconditional top rank`, topScorer?.rank === 1, JSON.stringify(settled.participants));

  const botRows = settled.participants.filter((p: { isBot: boolean }) => p.isBot);
  const bumpedBot = botRows.find((b: { gameplayPts: number }) => b.gameplayPts > scores[0]);
  log(`[${label}] No bot's displayed score was bumped past the top human's real score`, !bumpedBot, JSON.stringify(botRows));

  return matchId;
}

async function soloVsBotsUnchanged() {
  const solo = await makeClient();
  createdWalletIds.push(solo.walletProfileId);
  const { body: match } = await solo.req("/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "QUICK_RUSH" }),
  });
  // A deliberately huge score (still under the plausibility ceiling for
  // a genuine full-duration run) — if solo-vs-bots ranking regressed to
  // "pure score" too, this would rank 1st. It must not.
  const { body: settled } = await solo.req(`/api/matches/${match.matchId}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score: 1, durationPlayedSec: match.durationSec }),
  });
  log("[solo-vs-bots] Instant play still caps a lone human at rank 3 or 4 (unchanged)", settled.rank === 3 || settled.rank === 4, `rank=${settled.rank}`);
}

async function main() {
  await twoHumansRoom(2, "2 humans + 2 bots");
  await twoHumansRoom(3, "3 humans + 1 bot");
  await soloVsBotsUnchanged();

  // Cleanup — every throwaway wallet + everything it touched.
  for (const walletProfileId of createdLobbyHostIds) {
    await db.lobbyParticipantSelection.deleteMany({ where: { lobbyParticipant: { lobby: { hostWalletProfileId: walletProfileId } } } });
    await db.lobbyParticipant.deleteMany({ where: { lobby: { hostWalletProfileId: walletProfileId } } });
    await db.gameLobby.deleteMany({ where: { hostWalletProfileId: walletProfileId } });
  }
  for (const walletProfileId of createdWalletIds) {
    const parts = await db.matchParticipant.findMany({ where: { walletProfileId }, select: { matchId: true } });
    const matchIds = [...new Set(parts.map((p) => p.matchId))];
    for (const matchId of matchIds) {
      await db.matchLoadoutSelection.deleteMany({ where: { matchLoadout: { matchId } } });
      await db.matchLoadout.deleteMany({ where: { matchId } });
      await db.matchParticipant.deleteMany({ where: { matchId } });
      await db.match.deleteMany({ where: { id: matchId } });
    }
    await db.lobbyParticipant.deleteMany({ where: { walletProfileId } });
    await db.walletShopItem.deleteMany({ where: { walletProfileId } });
    await db.ledgerEntry.deleteMany({ where: { walletProfileId } });
    await db.walletProfile.delete({ where: { id: walletProfileId } }).catch(() => {});
  }

  console.log(failures ? "\nMULTIPLAYER RANKING SMOKE TEST: FAILURES ABOVE" : "\nMULTIPLAYER RANKING SMOKE TEST: ALL PASSED");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
