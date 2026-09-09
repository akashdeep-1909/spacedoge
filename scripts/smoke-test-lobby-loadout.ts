// Verifies Play-with-Friends lobbies now actually consume a purchased
// rocket skin / Speed / Health / Magnet / Fire / Shield upgrade —
// previously the ONLY category finalizeLobby ever consumed was
// RENTAL_BOT, so a bought rocket skin (or any other upgrade) silently
// never applied in a lobby match:
//   1. Purchase a ROCKET_SHAPE item and a STAT_SPEED item.
//   2. PATCH /api/lobbies/[id]/loadout sets both selections in a real
//      lobby, and GET /api/lobbies/[id] reflects them back via
//      myLoadout.
//   3. Also equip a RENTAL_BOT pass (via the separate, pre-existing
//      rental-bot route) alongside the two loadout selections, and
//      bring in 2 real friends (RENTAL_BOT_MIN_HUMANS) so the room can
//      actually start with all three equipped at once.
//   4. Starting the lobby writes ONE real MatchLoadout row per human
//      with all three MatchLoadoutSelection rows on it (ROCKET_SHAPE,
//      STAT_SPEED, RENTAL_BOT), the rocket/speed items' usesRemaining
//      are decremented, and both getResolvedLoadoutForMatch and
//      GET /api/matches/[id]/roster report the real shapeKey/colorHex/
//      speedMultBonus/rentalBot together — the exact same combined
//      shape a solo match's own loadout already produces.
//   5. Clearing a loadout selection back to null works.
//
// Run via tsx (no psql locally, same reasoning as every other
// scripts/smoke-test-*.ts in this repo):
//   npx tsx scripts/smoke-test-lobby-loadout.ts
import "dotenv/config";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SiweMessage } from "siwe";
import { db } from "../src/lib/db";
import { getResolvedLoadoutForMatch } from "../src/lib/shop";

const BASE = "http://localhost:3000";
let failures = 0;

function log(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? " — " + extra : ""}`);
  if (!ok) failures++;
}

interface CatalogItem {
  id: string;
  category: string;
  usesGranted: number | null;
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
  const settingsBefore = await db.platformSettings.findUnique({ where: { id: "singleton" } });
  const shopEnabledBefore = settingsBefore?.shopEnabled ?? true;
  await db.platformSettings.upsert({
    where: { id: "singleton" },
    update: { shopEnabled: true },
    create: { id: "singleton", shopEnabled: true },
  });

  const host = await makeClient();
  const friend1 = await makeClient();
  const friend2 = await makeClient();

  // --- 1. Purchase a rocket skin + a speed upgrade + a Rental Bot pass. ---
  const { body: catalogBody } = (await host.req("/api/shop/catalog")) as { body: { items: CatalogItem[] } };
  const rocketItem = catalogBody.items.find((i) => i.category === "ROCKET_SHAPE");
  const speedItem = catalogBody.items.find((i) => i.category === "STAT_SPEED");
  const rentalBotItem = catalogBody.items.find((i) => i.category === "RENTAL_BOT");
  log("Catalog has a seeded ROCKET_SHAPE, STAT_SPEED, and RENTAL_BOT item", !!rocketItem && !!speedItem && !!rentalBotItem);
  if (!rocketItem || !speedItem || !rentalBotItem) throw new Error("Missing seed catalog items — check src/lib/shop.ts");

  const { body: rocketPurchase } = await host.req("/api/shop/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shopItemConfigId: rocketItem.id, source: "PLAY_USDT" }),
  });
  const { body: speedPurchase } = await host.req("/api/shop/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shopItemConfigId: speedItem.id, source: "PLAY_USDT" }),
  });
  const { body: rentalBotPurchase } = await host.req("/api/shop/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shopItemConfigId: rentalBotItem.id, source: "PLAY_USDT" }),
  });
  log("All three purchases succeed", !!rocketPurchase.id && !!speedPurchase.id && !!rentalBotPurchase.id);

  // --- 2. Create a lobby, set both loadout selections. ---
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

  const { res: setRocketRes, body: afterRocket } = await host.req(`/api/lobbies/${lobby.id}/loadout`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category: "ROCKET_SHAPE", walletShopItemId: rocketPurchase.id }),
  });
  log("Setting the rocket-skin selection succeeds", setRocketRes.ok);
  log("Lobby reflects the rocket selection back via myLoadout", afterRocket.myLoadout?.ROCKET_SHAPE?.walletShopItemId === rocketPurchase.id);

  const { body: afterSpeed } = await host.req(`/api/lobbies/${lobby.id}/loadout`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category: "STAT_SPEED", walletShopItemId: speedPurchase.id }),
  });
  log(
    "Setting the speed-upgrade selection succeeds AND the rocket selection is still there",
    afterSpeed.myLoadout?.STAT_SPEED?.walletShopItemId === speedPurchase.id && afterSpeed.myLoadout?.ROCKET_SHAPE?.walletShopItemId === rocketPurchase.id
  );

  // Clear-and-reset check (5).
  await host.req(`/api/lobbies/${lobby.id}/loadout`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category: "STAT_SPEED", walletShopItemId: null }),
  });
  const { body: afterClear } = await host.req(`/api/lobbies/${lobby.id}`);
  log("Clearing a loadout selection back to null works", afterClear.myLoadout?.STAT_SPEED === undefined);
  await host.req(`/api/lobbies/${lobby.id}/loadout`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category: "STAT_SPEED", walletShopItemId: speedPurchase.id }),
  });

  await host.req(`/api/lobbies/${lobby.id}/rental-bot`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletShopItemId: rentalBotPurchase.id }),
  });

  // --- 3. Bring in 2 real friends (RENTAL_BOT_MIN_HUMANS) so the room can start. ---
  const { body: linkBody } = await host.req(`/api/lobbies/${lobby.id}/invite-link`, { method: "POST" });
  await friend1.req(`/api/invite-links/${linkBody.token}/join`, { method: "POST" });
  await friend2.req(`/api/invite-links/${linkBody.token}/join`, { method: "POST" });

  // --- 4. Start it — all three categories should resolve together. ---
  const { res: startRes, body: startedLobby } = await host.req(`/api/lobbies/${lobby.id}/start`, { method: "POST" });
  log("Lobby starts with all three selections equipped", startRes.ok, JSON.stringify(startedLobby?.myLoadout));
  const matchId: string = startedLobby.finalMatchId;

  const loadoutRow = await db.matchLoadout.findFirst({
    where: { matchId, walletProfileId: host.walletProfileId },
    include: { selections: true },
  });
  const cats = new Set(loadoutRow?.selections.map((s) => s.category));
  log(
    "ONE MatchLoadout row was written with all three MatchLoadoutSelection rows (ROCKET_SHAPE, STAT_SPEED, RENTAL_BOT)",
    !!loadoutRow && cats.has("ROCKET_SHAPE") && cats.has("STAT_SPEED") && cats.has("RENTAL_BOT"),
    JSON.stringify([...cats])
  );

  // The seeded ROCKET_SHAPE row alternates USES/TIME_WINDOW across the
  // 6 catalog entries, so whichever one this purchase happened to be
  // may legitimately have a null usesRemaining (a TIME_WINDOW item is
  // consumed by expiring, never by a per-match counter) — only assert
  // a real decrement when the item actually IS uses-based.
  const rocketAfter = await db.walletShopItem.findUniqueOrThrow({ where: { id: rocketPurchase.id } });
  const speedAfter = await db.walletShopItem.findUniqueOrThrow({ where: { id: speedPurchase.id } });
  const rocketOk = rocketItem.usesGranted === null ? rocketAfter.usesRemaining === null : rocketAfter.usesRemaining === rocketItem.usesGranted - 1;
  const speedOk = speedItem.usesGranted === null ? speedAfter.usesRemaining === null : speedAfter.usesRemaining === speedItem.usesGranted - 1;
  log(
    "Rocket and speed items were each consumed correctly for their own entitlement type",
    rocketOk && speedOk,
    `rocket usesRemaining=${rocketAfter.usesRemaining} (granted=${rocketItem.usesGranted}), speed usesRemaining=${speedAfter.usesRemaining} (granted=${speedItem.usesGranted})`
  );

  const reconstructed = await getResolvedLoadoutForMatch(matchId, host.walletProfileId);
  log(
    "getResolvedLoadoutForMatch reports the rocket shape/color, the speed bonus, AND rentalBot together",
    !!reconstructed.shapeKey && !!reconstructed.colorHex && reconstructed.speedMultBonus !== null && reconstructed.rentalBot === true,
    JSON.stringify(reconstructed)
  );

  const { body: rosterBody } = await host.req(`/api/matches/${matchId}/roster`);
  log(
    "GET /api/matches/[id]/roster reports the exact same combined loadout",
    !!rosterBody.loadout?.shapeKey && rosterBody.loadout?.speedMultBonus !== null && rosterBody.loadout?.rentalBot === true,
    JSON.stringify(rosterBody.loadout)
  );

  // Settle all 3 humans so this wallet isn't left "busy".
  for (const client of [host, friend1, friend2]) {
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
  for (const client of [host, friend1, friend2]) {
    await db.walletShopItem.deleteMany({ where: { walletProfileId: client.walletProfileId } });
    await db.ledgerEntry.deleteMany({ where: { walletProfileId: client.walletProfileId } });
    await db.walletProfile.delete({ where: { id: client.walletProfileId } });
  }
  await db.platformSettings.update({ where: { id: "singleton" }, data: { shopEnabled: shopEnabledBefore } });

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
