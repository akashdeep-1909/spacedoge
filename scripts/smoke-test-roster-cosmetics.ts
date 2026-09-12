// Verifies GET /api/matches/[id]/roster now exposes each participant's
// own equipped ROCKET_SHAPE cosmetic to every OTHER viewer — reported
// directly: "only the rocket owner shows his rocket, rocket not show
// to others." Root cause: the roster endpoint only ever returned
// identity (isBot/isYou/label), never the seat's own shapeKey/colorHex,
// so CoinRushArena's opponent-ship rendering (which drives every
// non-you ship locally, including a real friend's own seat) had no
// cosmetic data to draw with — every non-you ship always rendered the
// default look, no matter what its real owner had actually bought.
//
//   1. Host equips a rocket skin, friend does NOT equip one.
//   2. From the FRIEND's own point of view, GET /api/matches/[id]/
//      roster reports the host's real shapeKey/colorHex on the host's
//      seat.
//   3. From the HOST's own point of view, the same route reports null
//      shapeKey/colorHex on the friend's seat (nothing equipped) and
//      null on every bot-filled seat (bots never have one).
//
// Run via tsx (no psql locally, same reasoning as every other
// scripts/smoke-test-*.ts in this repo):
//   npx tsx scripts/smoke-test-roster-cosmetics.ts
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

async function main() {
  const host = await makeClient();
  const friend = await makeClient();

  const { body: catalogBody } = (await host.req("/api/shop/catalog")) as {
    body: { items: { id: string; category: string }[] };
  };
  const rocketItem = catalogBody.items.find((i) => i.category === "ROCKET_SHAPE");
  if (!rocketItem) throw new Error("No ROCKET_SHAPE item in the seeded catalog");

  const { body: rocketPurchase } = await host.req("/api/shop/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shopItemConfigId: rocketItem.id, source: "PLAY_USDT" }),
  });
  log("Host's rocket purchase succeeds", !!rocketPurchase.id && !!rocketPurchase.shapeKey);

  const stakesConfig = await db.gameModeConfig.findFirst({
    where: { mode: { in: ["QUICK_RUSH", "EXPLORER_RUSH", "PRO_RUSH", "ELITE_RUSH", "CHAMPION_RUSH"] }, enabled: true },
  });
  if (!stakesConfig) throw new Error("No enabled paid stakes mode found to create a lobby with");
  const packageAmount = Number(stakesConfig.entryFeeUsdt);

  const { body: lobby } = await host.req("/api/lobbies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageAmount }),
  });
  await host.req(`/api/lobbies/${lobby.id}/loadout`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category: "ROCKET_SHAPE", walletShopItemId: rocketPurchase.id }),
  });

  const { body: linkBody } = await host.req(`/api/lobbies/${lobby.id}/invite-link`, { method: "POST" });
  await friend.req(`/api/invite-links/${linkBody.token}/join`, { method: "POST" });

  const { body: startedLobby } = await host.req(`/api/lobbies/${lobby.id}/start`, { method: "POST" });
  const matchId: string = startedLobby.finalMatchId;
  log("Lobby starts", !!matchId, JSON.stringify(startedLobby));

  // --- From the FRIEND's own point of view. ---
  const { body: rosterFromFriend } = await friend.req(`/api/matches/${matchId}/roster`);
  const hostSeatFromFriend = rosterFromFriend.seats.find((s: { isYou: boolean; isBot: boolean }) => !s.isYou && !s.isBot);
  log(
    "The FRIEND's own roster call reports the HOST's real shapeKey/colorHex",
    hostSeatFromFriend?.shapeKey === rocketPurchase.shapeKey && hostSeatFromFriend?.colorHex === rocketPurchase.colorHex,
    JSON.stringify(hostSeatFromFriend)
  );

  // --- From the HOST's own point of view. ---
  const { body: rosterFromHost } = await host.req(`/api/matches/${matchId}/roster`);
  const friendSeatFromHost = rosterFromHost.seats.find((s: { isYou: boolean; isBot: boolean }) => !s.isYou && !s.isBot);
  const botSeatsFromHost = rosterFromHost.seats.filter((s: { isBot: boolean }) => s.isBot);
  log(
    "The HOST's own roster call reports null shapeKey/colorHex for the friend (nothing equipped)",
    friendSeatFromHost?.shapeKey === null && friendSeatFromHost?.colorHex === null,
    JSON.stringify(friendSeatFromHost)
  );
  log(
    "Every bot-filled seat reports null shapeKey/colorHex",
    botSeatsFromHost.length > 0 && botSeatsFromHost.every((s: { shapeKey: null; colorHex: null }) => s.shapeKey === null && s.colorHex === null),
    JSON.stringify(botSeatsFromHost)
  );
  const ownSeatFromHost = rosterFromHost.seats.find((s: { isYou: boolean }) => s.isYou);
  log(
    "The HOST's own seat, from their own roster call, reports their own real shapeKey/colorHex",
    ownSeatFromHost?.shapeKey === rocketPurchase.shapeKey && ownSeatFromHost?.colorHex === rocketPurchase.colorHex,
    JSON.stringify(ownSeatFromHost)
  );

  // Settle both humans so neither wallet is left "busy".
  for (const client of [host, friend]) {
    await client.req(`/api/matches/${matchId}/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: 0, durationPlayedSec: 0 }),
    });
  }

  // Cleanup — throwaway synthetic wallets + everything they touched.
  await db.matchLoadoutSelection.deleteMany({ where: { matchLoadout: { matchId } } });
  await db.matchLoadout.deleteMany({ where: { matchId } });
  await db.matchParticipant.deleteMany({ where: { matchId } });
  await db.match.deleteMany({ where: { id: matchId } });
  await db.lobbyParticipantSelection.deleteMany({ where: { lobbyParticipant: { lobby: { hostWalletProfileId: host.walletProfileId } } } });
  await db.lobbyParticipant.deleteMany({ where: { lobby: { hostWalletProfileId: host.walletProfileId } } });
  await db.gameLobby.deleteMany({ where: { hostWalletProfileId: host.walletProfileId } });
  for (const client of [host, friend]) {
    await db.walletShopItem.deleteMany({ where: { walletProfileId: client.walletProfileId } });
    await db.ledgerEntry.deleteMany({ where: { walletProfileId: client.walletProfileId } });
    await db.walletProfile.delete({ where: { id: client.walletProfileId } });
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
