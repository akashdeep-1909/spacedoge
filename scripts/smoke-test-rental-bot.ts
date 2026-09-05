// Verifies the Rental Bot shop category end to end:
//   1. Purchasing a RENTAL_BOT item works like any other category.
//   2. Solo/instant-play (POST /api/matches, PRACTICE mode included)
//      NEVER resolves/consumes a RENTAL_BOT selection — this is the
//      actual server-side enforcement of "Play with Friends only,"
//      not just a UI omission (LoadoutSelectModal never even offers
//      it, but this proves the server independently refuses it too).
//   3. Creating a real lobby, setting the Rental Bot via
//      PATCH /api/lobbies/[id]/rental-bot, then starting it (host
//      early-start, bots fill the rest) DOES resolve+consume it: a
//      real MatchLoadoutSelection row is written, usesRemaining
//      decrements by exactly 1, and both getResolvedLoadoutForMatch
//      and GET /api/matches/[id]/roster report rentalBot: true for
//      that participant.
//   4. Clearing the selection back to null before starting works, and
//      a lobby that starts with no Rental Bot selected never resolves
//      one (no audit row, no consumption).
//
// Run via tsx (no psql locally, same reasoning as every other
// scripts/smoke-test-*.ts in this repo):
//   npx tsx scripts/smoke-test-rental-bot.ts
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
  key: string;
  category: string;
  entitlementType: "USES" | "TIME_WINDOW";
  usesGranted: number | null;
  priceUsdt: number;
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

  // --- 1. Purchase a RENTAL_BOT item. ---
  const { body: catalogBody } = (await host.req("/api/shop/catalog")) as { body: { items: CatalogItem[] } };
  const rentalBotItem = catalogBody.items.find((i) => i.category === "RENTAL_BOT");
  log("Catalog has a seeded RENTAL_BOT item", !!rentalBotItem);
  if (!rentalBotItem) throw new Error("No RENTAL_BOT item in the seeded catalog — check src/lib/shop.ts SEED_DEFAULTS");

  const { res: purchaseRes, body: purchaseBody } = await host.req("/api/shop/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shopItemConfigId: rentalBotItem.id, source: "PLAY_USDT" }),
  });
  log("Purchase succeeds", purchaseRes.ok, JSON.stringify(purchaseBody));
  const walletShopItemId: string = purchaseBody.id;

  // --- 2. Solo (PRACTICE) never resolves/consumes RENTAL_BOT. ---
  const { body: soloMatch } = await host.req("/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "PRACTICE", loadout: { RENTAL_BOT: walletShopItemId } }),
  });
  log("Solo match's resolved loadout does NOT report rentalBot", soloMatch.loadout?.rentalBot !== true, JSON.stringify(soloMatch.loadout));
  const soloLoadoutRow = await db.matchLoadout.findFirst({ where: { matchId: soloMatch.matchId, walletProfileId: host.walletProfileId } });
  log("No MatchLoadout row was written for the solo match", !soloLoadoutRow);
  const itemAfterSolo = await db.walletShopItem.findUniqueOrThrow({ where: { id: walletShopItemId } });
  log("usesRemaining untouched after the solo attempt", itemAfterSolo.usesRemaining === rentalBotItem.usesGranted, `got ${itemAfterSolo.usesRemaining}`);

  // Settle the solo PRACTICE match right away — otherwise this wallet
  // stays "busy" (isWalletBusy/checkPaidEligibility) and can't create
  // the lobby below.
  await host.req(`/api/matches/${soloMatch.matchId}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score: 0, durationPlayedSec: 0 }),
  });

  // --- 3. Create a real lobby, set + clear + re-set the Rental Bot, then start it. ---
  const stakesConfig = await db.gameModeConfig.findFirst({
    where: { mode: { in: ["QUICK_RUSH", "EXPLORER_RUSH", "PRO_RUSH", "ELITE_RUSH", "CHAMPION_RUSH"] }, enabled: true },
  });
  if (!stakesConfig) throw new Error("No enabled paid stakes mode found to create a lobby with");
  const packageAmount = Number(stakesConfig.entryFeeUsdt);

  const { res: createRes, body: lobby } = await host.req("/api/lobbies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageAmount }),
  });
  log("Lobby creation succeeds", createRes.ok, JSON.stringify(lobby));
  const lobbyId: string = lobby.id;

  const { res: setRes, body: afterSet } = await host.req(`/api/lobbies/${lobbyId}/rental-bot`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletShopItemId }),
  });
  log("Setting the Rental Bot selection succeeds", setRes.ok, JSON.stringify(afterSet));
  log("Lobby reflects the selection back (myRentalBot)", afterSet.myRentalBot?.walletShopItemId === walletShopItemId);

  const { body: afterClear } = await host.req(`/api/lobbies/${lobbyId}/rental-bot`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletShopItemId: null }),
  });
  log("Clearing the selection back to null works", afterClear.myRentalBot === null);

  await host.req(`/api/lobbies/${lobbyId}/rental-bot`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletShopItemId }),
  });

  const { res: startRes, body: startedLobby } = await host.req(`/api/lobbies/${lobbyId}/start`, { method: "POST" });
  log("Lobby starts (host early-start, bots fill the rest)", startRes.ok, JSON.stringify(startedLobby));
  const matchId: string = startedLobby.finalMatchId;

  const loadoutRow = await db.matchLoadout.findFirst({
    where: { matchId, walletProfileId: host.walletProfileId },
    include: { selections: true },
  });
  log(
    "A real MatchLoadout + MatchLoadoutSelection(RENTAL_BOT) row was written",
    !!loadoutRow && loadoutRow.selections.some((s) => s.walletShopItemId === walletShopItemId && s.category === "RENTAL_BOT")
  );

  const itemAfterLobby = await db.walletShopItem.findUniqueOrThrow({ where: { id: walletShopItemId } });
  log(
    "usesRemaining decremented by exactly 1 once the lobby actually started",
    itemAfterLobby.usesRemaining === (rentalBotItem.usesGranted ?? 0) - 1,
    `got ${itemAfterLobby.usesRemaining}`
  );

  const reconstructed = await getResolvedLoadoutForMatch(matchId, host.walletProfileId);
  log("getResolvedLoadoutForMatch reports rentalBot: true", reconstructed.rentalBot === true, JSON.stringify(reconstructed));

  const { body: rosterBody } = await host.req(`/api/matches/${matchId}/roster`);
  log("GET /api/matches/[id]/roster also reports rentalBot: true", rosterBody.loadout?.rentalBot === true, JSON.stringify(rosterBody.loadout));

  // Submit results for the lobby match (only 1 human — the host — so
  // this alone settles it) — otherwise this wallet stays "busy" and
  // can't create the second lobby below.
  await host.req(`/api/matches/${matchId}/results`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score: 0, durationPlayedSec: 0 }),
  });

  // --- 4. A second lobby with NO Rental Bot selected resolves nothing. ---
  const { body: lobby2 } = await host.req("/api/lobbies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageAmount }),
  });
  const { body: started2 } = await host.req(`/api/lobbies/${lobby2.id}/start`, { method: "POST" });
  const reconstructed2 = await getResolvedLoadoutForMatch(started2.finalMatchId, host.walletProfileId);
  log("A lobby with no Rental Bot selected resolves rentalBot: false", reconstructed2.rentalBot === false);

  // Cleanup — throwaway synthetic wallet + everything it touched.
  for (const mid of [matchId, started2.finalMatchId, soloMatch.matchId]) {
    await db.matchLoadoutSelection.deleteMany({ where: { matchLoadout: { matchId: mid } } });
    await db.matchLoadout.deleteMany({ where: { matchId: mid } });
    await db.matchParticipant.deleteMany({ where: { matchId: mid } });
    await db.match.deleteMany({ where: { id: mid } });
  }
  await db.lobbyParticipant.deleteMany({ where: { lobby: { hostWalletProfileId: host.walletProfileId } } });
  await db.gameLobby.deleteMany({ where: { hostWalletProfileId: host.walletProfileId } });
  await db.walletShopItem.deleteMany({ where: { walletProfileId: host.walletProfileId } });
  await db.ledgerEntry.deleteMany({ where: { walletProfileId: host.walletProfileId } });
  await db.walletProfile.delete({ where: { id: host.walletProfileId } });
  await db.platformSettings.update({ where: { id: "singleton" }, data: { shopEnabled: shopEnabledBefore } });

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
