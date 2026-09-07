// Verifies a Rental-Bot-equipped lobby whose wait window runs out
// while still under-crewed gets CANCELLED, not silently auto-started
// with AI filling the gap — the passive-expiry half of "only works
// with real friends" (the manual "Start with Random Players" action
// was already hard-blocked; this closes the same loophole reached by
// just waiting the timer out instead). A normal lobby with NO Rental
// Bot equipped must keep auto-starting with AI fill on expiry exactly
// as before — this is a real behavior fork, not a blanket change.
//
//   1. Host equips a Rental Bot, invites 1 friend (humanCount=2, below
//      RENTAL_BOT_MIN_HUMANS=3), then the lobby's own expiresAt is
//      pushed into the past (simulating the real wait window running
//      out — no test should actually sleep 5 minutes).
//   2. GET /api/lobbies/[id] (the same lazy-expiry self-heal a real
//      polling waiting-room page hits) sees it past expiry and must
//      CANCEL it: status CANCELLED, cancelReason
//      RENTAL_BOT_NOT_ENOUGH_FRIENDS, both joined humans' entry-fee
//      holds released, and the Rental Bot item completely untouched
//      (not consumed, still active).
//   3. A second lobby with the same under-crewed 2-human state but NO
//      Rental Bot equipped, expired the same way, still auto-starts
//      with AI filling the other 2 seats — unchanged regression check.
//
// Run via tsx (no psql locally, same reasoning as every other
// scripts/smoke-test-*.ts in this repo):
//   npx tsx scripts/smoke-test-lobby-rental-bot-timeout.ts
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

function expire(lobbyId: string) {
  return db.gameLobby.update({ where: { id: lobbyId }, data: { expiresAt: new Date(Date.now() - 1000) } });
}

async function main() {
  const settingsBefore = await db.platformSettings.findUnique({ where: { id: "singleton" } });
  const shopEnabledBefore = settingsBefore?.shopEnabled ?? true;
  await db.platformSettings.upsert({
    where: { id: "singleton" },
    update: { shopEnabled: true },
    create: { id: "singleton", shopEnabled: true },
  });

  const stakesConfig = await db.gameModeConfig.findFirst({
    where: { mode: { in: ["QUICK_RUSH", "EXPLORER_RUSH", "PRO_RUSH", "ELITE_RUSH", "CHAMPION_RUSH"] }, enabled: true },
  });
  if (!stakesConfig) throw new Error("No enabled paid stakes mode found to create a lobby with");
  const packageAmount = Number(stakesConfig.entryFeeUsdt);

  // --- 1. Under-crewed lobby WITH a Rental Bot equipped. ---
  const host = await makeClient();
  const friend = await makeClient();

  const { body: catalogBody } = (await host.req("/api/shop/catalog")) as { body: { items: { id: string; category: string }[] } };
  const rentalBotItem = catalogBody.items.find((i) => i.category === "RENTAL_BOT");
  if (!rentalBotItem) throw new Error("No RENTAL_BOT item in the seeded catalog");
  const { body: purchase } = await host.req("/api/shop/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shopItemConfigId: rentalBotItem.id, source: "PLAY_USDT" }),
  });

  const { body: lobby } = await host.req("/api/lobbies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageAmount }),
  });
  await host.req(`/api/lobbies/${lobby.id}/rental-bot`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletShopItemId: purchase.id }),
  });
  const { body: linkBody } = await host.req(`/api/lobbies/${lobby.id}/invite-link`, { method: "POST" });
  const { res: joinRes } = await friend.req(`/api/invite-links/${linkBody.token}/join`, { method: "POST" });
  log("Friend joins — humanCount is now 2, below RENTAL_BOT_MIN_HUMANS", joinRes.ok);

  await expire(lobby.id);
  const { body: afterExpiry } = await host.req(`/api/lobbies/${lobby.id}`);
  log(
    "Under-crewed Rental Bot lobby is CANCELLED (not auto-started) once its timer runs out",
    afterExpiry.status === "CANCELLED" && afterExpiry.cancelReason === "RENTAL_BOT_NOT_ENOUGH_FRIENDS",
    JSON.stringify({ status: afterExpiry.status, cancelReason: afterExpiry.cancelReason })
  );

  const hostHoldReleased = await db.ledgerEntry.findFirst({
    where: { walletProfileId: host.walletProfileId, refId: lobby.id, reason: "match_entry_hold_release" },
  });
  const friendHoldReleased = await db.ledgerEntry.findFirst({
    where: { walletProfileId: friend.walletProfileId, refId: lobby.id, reason: "match_entry_hold_release" },
  });
  log("Both joined humans' entry-fee holds were released", !!hostHoldReleased && !!friendHoldReleased);

  const itemAfterCancel = await db.walletShopItem.findUniqueOrThrow({ where: { id: purchase.id } });
  log(
    "The Rental Bot item is completely untouched (not consumed, still active)",
    itemAfterCancel.active === true && itemAfterCancel.usesRemaining === purchase.usesRemaining,
    `active=${itemAfterCancel.active} usesRemaining=${itemAfterCancel.usesRemaining} (originally ${purchase.usesRemaining})`
  );
  const cancelledLobbyRow = await db.gameLobby.findUniqueOrThrow({ where: { id: lobby.id } });
  log("No match was ever created for the cancelled lobby", cancelledLobbyRow.finalMatchId === null);

  // --- 2. Same under-crewed shape, but NO Rental Bot equipped — must
  // still auto-start with AI fill on expiry exactly as before. ---
  const host2 = await makeClient();
  const friend2 = await makeClient();
  const { body: lobby2 } = await host2.req("/api/lobbies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageAmount }),
  });
  const { body: linkBody2 } = await host2.req(`/api/lobbies/${lobby2.id}/invite-link`, { method: "POST" });
  await friend2.req(`/api/invite-links/${linkBody2.token}/join`, { method: "POST" });

  await expire(lobby2.id);
  const { body: afterExpiry2 } = await host2.req(`/api/lobbies/${lobby2.id}`);
  log(
    "A normal (no Rental Bot) under-crewed lobby still auto-starts with AI fill on expiry — unchanged",
    afterExpiry2.status === "STARTED" && !!afterExpiry2.finalMatchId,
    JSON.stringify({ status: afterExpiry2.status, finalMatchId: afterExpiry2.finalMatchId })
  );

  // Cleanup — throwaway synthetic wallets + everything they touched.
  for (const client of [host, friend, host2, friend2]) {
    const parts = await db.matchParticipant.findMany({ where: { walletProfileId: client.walletProfileId }, select: { matchId: true } });
    for (const p of parts) {
      await db.matchLoadoutSelection.deleteMany({ where: { matchLoadout: { matchId: p.matchId } } });
      await db.matchLoadout.deleteMany({ where: { matchId: p.matchId } });
      await db.matchParticipant.deleteMany({ where: { matchId: p.matchId } });
      await db.match.deleteMany({ where: { id: p.matchId } });
    }
    await db.lobbyParticipant.deleteMany({ where: { lobby: { hostWalletProfileId: client.walletProfileId } } });
    await db.gameLobby.deleteMany({ where: { hostWalletProfileId: client.walletProfileId } });
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
