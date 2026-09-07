// Verifies that turning the Shop OFF (PlatformSettings.shopEnabled)
// stops anything already owned from being used in a match, not just
// blocking new purchases:
//   1. Purchase a ROCKET_SHAPE item and a RENTAL_BOT item while the
//      shop is enabled.
//   2. Flip shopEnabled to false.
//   3. A solo match's loadout selection for the owned rocket is
//      silently dropped (server-side, in consumeLoadoutSelections) —
//      no MatchLoadout row, item untouched (usesRemaining/active
//      unchanged).
//   4. A lobby match's RENTAL_BOT selection is silently dropped the
//      same way — proves this isn't a category-specific check, the
//      shopEnabled gate sits above every category.
//   5. Flip shopEnabled back to true — the SAME still-owned rocket item
//      now resolves correctly in a fresh solo match, proving nothing
//      was expired/consumed while the shop was closed.
//
// Run via tsx (no psql locally, same reasoning as every other
// scripts/smoke-test-*.ts in this repo):
//   npx tsx scripts/smoke-test-shop-closed-loadout.ts
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

async function setShopEnabled(on: boolean) {
  await db.platformSettings.upsert({
    where: { id: "singleton" },
    update: { shopEnabled: on },
    create: { id: "singleton", shopEnabled: on },
  });
}

async function main() {
  const settingsBefore = await db.platformSettings.findUnique({ where: { id: "singleton" } });
  const shopEnabledBefore = settingsBefore?.shopEnabled ?? true;
  await setShopEnabled(true);

  const host = await makeClient();

  // --- 1. Purchase while the shop is open. ---
  const { body: catalogBody } = (await host.req("/api/shop/catalog")) as { body: { items: CatalogItem[] } };
  const rocketItem = catalogBody.items.find((i) => i.category === "ROCKET_SHAPE");
  const rentalBotItem = catalogBody.items.find((i) => i.category === "RENTAL_BOT");
  log("Catalog has a seeded ROCKET_SHAPE and RENTAL_BOT item", !!rocketItem && !!rentalBotItem);
  if (!rocketItem || !rentalBotItem) throw new Error("Missing seed catalog items — check src/lib/shop.ts");

  const { body: rocketPurchase } = await host.req("/api/shop/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shopItemConfigId: rocketItem.id, source: "PLAY_USDT" }),
  });
  const { body: rentalBotPurchase } = await host.req("/api/shop/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shopItemConfigId: rentalBotItem.id, source: "PLAY_USDT" }),
  });
  log("Both purchases succeed while the shop is open", !!rocketPurchase.id && !!rentalBotPurchase.id);
  const rocketShopItemId: string = rocketPurchase.id;
  const rentalBotShopItemId: string = rentalBotPurchase.id;

  // --- 2. Close the shop. ---
  await setShopEnabled(false);
  const { body: catalogClosed } = await host.req("/api/shop/catalog");
  log("Catalog reports shopEnabled: false", catalogClosed.shopEnabled === false);
  const { body: inventoryStillLists } = await host.req("/api/shop/inventory");
  log(
    "Inventory still lists both owned items while closed (nothing hidden/expired)",
    (inventoryStillLists.items ?? []).some((i: { id: string }) => i.id === rocketShopItemId) &&
      (inventoryStillLists.items ?? []).some((i: { id: string }) => i.id === rentalBotShopItemId)
  );

  // --- 3. A solo match's loadout selection is silently dropped. ---
  const { body: soloMatch } = await host.req("/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "PRACTICE", loadout: { ROCKET_SHAPE: rocketShopItemId } }),
  });
  log("Solo match's resolved loadout does NOT report the shapeKey while shop is closed", soloMatch.loadout?.shapeKey == null, JSON.stringify(soloMatch.loadout));
  const soloLoadoutRow = await db.matchLoadout.findFirst({ where: { matchId: soloMatch.matchId, walletProfileId: host.walletProfileId } });
  log("No MatchLoadout row was written for the solo match while shop is closed", !soloLoadoutRow);
  const rocketItemAfterSolo = await db.walletShopItem.findUniqueOrThrow({ where: { id: rocketShopItemId } });
  log("Rocket item untouched (still active) after the closed-shop solo attempt", rocketItemAfterSolo.active === true);

  await host.req(`/api/matches/${soloMatch.matchId}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score: 0, durationPlayedSec: 0 }),
  });

  // --- 4. A lobby's RENTAL_BOT selection is silently dropped too — the
  // shopEnabled gate sits above consumeLoadoutSelections generically,
  // not per-category. ---
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
  const { res: setRes } = await host.req(`/api/lobbies/${lobby.id}/rental-bot`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletShopItemId: rentalBotShopItemId }),
  });
  log("Setting the Rental Bot selection still succeeds while shop is closed (validated at select-time, not gated on shopEnabled)", setRes.ok);

  // RENTAL_BOT_MIN_HUMANS (src/lib/game-config.ts) requires at least 3
  // real humans in the room before a Rental Bot selection is even
  // allowed to start the lobby — unrelated to this test's own concern,
  // so bring in 2 throwaway friends purely to clear that bar.
  const { body: linkBody } = await host.req(`/api/lobbies/${lobby.id}/invite-link`, { method: "POST" });
  const friend1 = await makeClient();
  const friend2 = await makeClient();
  await friend1.req(`/api/invite-links/${linkBody.token}/join`, { method: "POST" });
  await friend2.req(`/api/invite-links/${linkBody.token}/join`, { method: "POST" });

  const { body: startedLobby } = await host.req(`/api/lobbies/${lobby.id}/start`, { method: "POST" });
  const lobbyMatchId: string = startedLobby.finalMatchId;
  log("Lobby starts once enough real friends have joined", !!lobbyMatchId, JSON.stringify(startedLobby));

  const lobbyLoadoutRow = await db.matchLoadout.findFirst({ where: { matchId: lobbyMatchId, walletProfileId: host.walletProfileId } });
  log("No MatchLoadout row was written for the lobby match while shop is closed", !lobbyLoadoutRow);
  const rentalBotItemAfterLobby = await db.walletShopItem.findUniqueOrThrow({ where: { id: rentalBotShopItemId } });
  log(
    "Rental Bot item's usesRemaining untouched after the closed-shop lobby match",
    rentalBotItemAfterLobby.usesRemaining === rentalBotItem.usesGranted,
    `got ${rentalBotItemAfterLobby.usesRemaining}`
  );

  for (const client of [host, friend1, friend2]) {
    await client.req(`/api/matches/${lobbyMatchId}/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: 0, durationPlayedSec: 0 }),
    });
  }

  // --- 5. Re-open the shop — the SAME still-owned rocket now resolves
  // normally, proving nothing was consumed/expired while closed. ---
  await setShopEnabled(true);
  const { body: soloMatch2 } = await host.req("/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "PRACTICE", loadout: { ROCKET_SHAPE: rocketShopItemId } }),
  });
  log(
    "The same rocket item resolves normally again once the shop reopens",
    !!soloMatch2.loadout?.shapeKey,
    JSON.stringify(soloMatch2.loadout)
  );
  await host.req(`/api/matches/${soloMatch2.matchId}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score: 0, durationPlayedSec: 0 }),
  });

  // Cleanup — throwaway synthetic wallet + everything it touched.
  for (const mid of [soloMatch.matchId, lobbyMatchId, soloMatch2.matchId]) {
    await db.matchLoadoutSelection.deleteMany({ where: { matchLoadout: { matchId: mid } } });
    await db.matchLoadout.deleteMany({ where: { matchId: mid } });
    await db.matchParticipant.deleteMany({ where: { matchId: mid } });
    await db.match.deleteMany({ where: { id: mid } });
  }
  await db.lobbyParticipant.deleteMany({ where: { lobby: { hostWalletProfileId: host.walletProfileId } } });
  await db.gameLobby.deleteMany({ where: { hostWalletProfileId: host.walletProfileId } });
  for (const client of [host, friend1, friend2]) {
    await db.walletShopItem.deleteMany({ where: { walletProfileId: client.walletProfileId } });
    await db.ledgerEntry.deleteMany({ where: { walletProfileId: client.walletProfileId } });
    await db.walletProfile.delete({ where: { id: client.walletProfileId } });
  }
  await setShopEnabled(shopEnabledBefore);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
