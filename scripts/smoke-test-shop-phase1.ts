// Verifies the Coin Rush Shop Phase 1 (cosmetic rocket shapes) pipeline
// end to end:
//   1. Purchase debits the chosen funding source and creates a
//      WalletShopItem snapshotting the config's price/effect fields.
//   2. GET /api/shop/inventory reflects the purchase, isUsable true.
//   3. Starting a match with that item selected as ROCKET_SHAPE
//      resolves shapeKey server-side and echoes it in the response.
//   4. A real MatchLoadout + MatchLoadoutSelection audit row exists,
//      pointing at the exact WalletShopItem purchased.
//   5. A USES-type item's usesRemaining decrements by exactly 1 and
//      flips active=false once exhausted.
//   6. An unowned/foreign item id is silently dropped (no shape
//      equipped, match still creates) rather than erroring the request.
//
// Run via tsx (not plain node) so @/lib/db's tsconfig path alias
// resolves and the app's own Prisma client can be used directly —
// there's no psql available in this local dev environment, unlike the
// production/staging boxes the other scripts/smoke-test-*.mjs scripts
// assume:
//   npx tsx scripts/smoke-test-shop-phase1.ts
import "dotenv/config";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SiweMessage } from "siwe";
import { db } from "../src/lib/db";

const BASE = "http://localhost:3000";
let failures = 0;

// Minimal shapes for the two list endpoints this script actually reads
// fields off of — just enough to give the .find() callbacks below a
// real parameter type instead of an implicit any.
interface CatalogItem {
  id: string;
  key: string;
  entitlementType: "USES" | "TIME_WINDOW";
  usesGranted: number | null;
  termDays: number | null;
  shapeKey: string | null;
  priceUsdt: number;
}
interface InventoryItem {
  id: string;
  configKey: string;
  usesRemaining: number | null;
  isUsable: boolean;
  shapeKey: string | null;
}

function log(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? " — " + extra : ""}`);
  if (!ok) failures++;
}

async function signIn() {
  let cookie = "";
  const account = privateKeyToAccount(generatePrivateKey());
  const address = account.address;

  async function req(path: string, opts: RequestInit = {}) {
    const res = await fetch(BASE + path, {
      ...opts,
      headers: { ...((opts.headers as Record<string, string>) || {}), ...(cookie ? { cookie } : {}) },
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    // Loose shape for ad-hoc JSON response bodies in this throwaway
    // verification script — not worth hand-typing every API response.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any = null;
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
    body: JSON.stringify({ message, signature }),
  });
  await req("/api/auth/onboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ countryCode: "US", ageConfirmed: true, termsVersion: "v1" }),
  });
  return { address, req };
}

async function main() {
  const w = await signIn();
  console.log("Test wallet:", w.address);

  const wp = await db.walletProfile.findUnique({ where: { address: w.address.toLowerCase() } });
  if (!wp) throw new Error("WalletProfile not found after sign-in");

  // Earn Game Reward USDT: needs Play USDT to enter a paid mode first
  // (dev-only deposit-demo), then a real win converted PTS -> USDT.
  // The settle anti-cheat ceiling (src/lib/game-config.ts
  // maxPlausibleScore) clamps the effective duration to actual
  // server-side wall-clock elapsed since match start (plus a small
  // grace window) — NOT the claimed durationPlayedSec — specifically
  // to stop "claim a huge duration to inflate the plausibility
  // ceiling" (see settle/route.ts's own doc-comment). So this really
  // does need to wait out the mode's real duration before settling,
  // same as an actual player would.
  await w.req("/api/wallet/deposit-demo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 100 }),
  });
  const { body: fundMatch } = await w.req("/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "CHAMPION_RUSH" }),
  });
  console.log(`Waiting ${fundMatch.durationSec + 1}s for the funding match's real duration to elapse...`);
  await new Promise((r) => setTimeout(r, (fundMatch.durationSec + 1) * 1000));
  const { body: settleBody } = await w.req(`/api/matches/${fundMatch.matchId}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Comfortably under maxPlausibleScore(CHAMPION_RUSH, durationSec) so
    // it isn't itself flagged — this test is about the Shop, not about
    // re-proving the ceiling math.
    body: JSON.stringify({ score: 300, durationPlayedSec: fundMatch.durationSec }),
  });
  log("Funding match settles for a real (non-zero) reward", !settleBody.blockedReason && settleBody.rewardUsdt > 0, JSON.stringify(settleBody));

  const { body: balAfterSettle } = await w.req("/api/wallet/balances");
  const { res: convertRes, body: convertBody } = await w.req("/api/wallet/convert-pts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ptsAmount: balAfterSettle.pts }),
  });
  log("PTS -> Game Reward USDT conversion succeeds", convertRes.ok, JSON.stringify(convertBody));

  const { body: catalog } = (await w.req("/api/shop/catalog")) as { body: { items: CatalogItem[] } };
  log("Catalog returns seeded ROCKET_SHAPE items", (catalog?.items ?? []).length > 0, `count=${catalog?.items?.length}`);

  const usesItem = catalog.items.find((i) => i.entitlementType === "USES");
  const timeItem = catalog.items.find((i) => i.entitlementType === "TIME_WINDOW");
  log("Seed has a USES-type item", !!usesItem);
  log("Seed has a TIME_WINDOW-type item", !!timeItem);
  // Everything past this point assumes the seed actually has one — the
  // two log() calls above are what actually reports it missing; this
  // just gives TS a non-null value to keep working with.
  if (!usesItem) throw new Error("No USES-type shop item in the seeded catalog");

  // --- Purchase the USES-type item ---
  const { res: purchaseRes, body: purchaseBody } = await w.req("/api/shop/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shopItemConfigId: usesItem.id, source: "GAME_REWARD_USDT" }),
  });
  log("Purchase succeeds", purchaseRes.ok, JSON.stringify(purchaseBody));

  const debit = await db.ledgerEntry.findFirst({
    where: { walletProfileId: wp.id, reason: "shop_item_purchase", refId: usesItem.id },
  });
  log("A negative GAME_REWARD_USDT ledger debit was recorded", !!debit && Number(debit.amount) === -usesItem.priceUsdt, JSON.stringify(debit));

  const { body: inv1 } = (await w.req("/api/shop/inventory")) as { body: { items: InventoryItem[] } };
  const owned = inv1.items.find((i) => i.configKey === usesItem.key);
  log("Inventory shows the purchased item", !!owned);
  log(
    "usesRemaining matches the config's usesGranted",
    owned?.usesRemaining === usesItem.usesGranted,
    `got ${owned?.usesRemaining}, expected ${usesItem.usesGranted}`
  );
  log("isUsable is true right after purchase", owned?.isUsable === true);
  log("shapeKey snapshotted from config", owned?.shapeKey === usesItem.shapeKey);
  if (!owned) throw new Error("Purchased item didn't show up in inventory");

  // --- Start a free PRACTICE match with that shape equipped ---
  const { body: match1 } = await w.req("/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "PRACTICE", loadout: { ROCKET_SHAPE: owned.id } }),
  });
  log(
    "Match creation echoes the resolved shapeKey",
    match1.loadout?.shapeKey === usesItem.shapeKey,
    JSON.stringify(match1.loadout)
  );

  const loadoutRow = await db.matchLoadout.findFirst({
    where: { matchId: match1.matchId, walletProfileId: wp.id },
    include: { selections: true },
  });
  log(
    "A real MatchLoadout + MatchLoadoutSelection row was written",
    !!loadoutRow && loadoutRow.selections.some((s) => s.walletShopItemId === owned.id && s.category === "ROCKET_SHAPE"),
    JSON.stringify(loadoutRow)
  );

  const usesAfter1 = await db.walletShopItem.findUnique({ where: { id: owned.id } });
  const usesGranted = usesItem.usesGranted ?? 0; // USES-type seed items always set this; see SEED_DEFAULTS
  log(
    "usesRemaining decremented by exactly 1",
    usesAfter1?.usesRemaining === usesGranted - 1,
    `got ${usesAfter1?.usesRemaining}, expected ${usesGranted - 1}`
  );
  log("Still active with uses left", usesAfter1?.active === true);

  // --- Foreign/unowned item id should be silently dropped, not error the match ---
  const { res: match2Res, body: match2 } = await w.req("/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "PRACTICE", loadout: { ROCKET_SHAPE: "not-a-real-id" } }),
  });
  log("Match still creates with an invalid loadout selection", match2Res.ok);
  log("No shape resolved for the invalid selection", match2.loadout?.shapeKey === null, JSON.stringify(match2.loadout));

  // --- Drain remaining uses, confirm it flips inactive at 0 ---
  let usesLeft = usesAfter1!.usesRemaining!;
  let lastMatchId: string | null = null;
  while (usesLeft > 0) {
    const { body: m } = await w.req("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "PRACTICE", loadout: { ROCKET_SHAPE: owned.id } }),
    });
    lastMatchId = m.matchId;
    usesLeft--;
  }
  const finalRow = await db.walletShopItem.findUnique({ where: { id: owned.id } });
  log("usesRemaining reaches exactly 0", finalRow?.usesRemaining === 0, `got ${finalRow?.usesRemaining}`);
  log("active flips false once exhausted", finalRow?.active === false);

  const lastLoadout = await db.matchLoadout.findFirst({
    where: { matchId: lastMatchId! },
    include: { selections: true },
  });
  log(
    "The final (uses-exhausting) match still recorded a loadout selection",
    !!lastLoadout && lastLoadout.selections.length === 1
  );

  // One more attempt after exhaustion — should silently drop, not error.
  const { res: exhaustedRes, body: exhaustedMatch } = await w.req("/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "PRACTICE", loadout: { ROCKET_SHAPE: owned.id } }),
  });
  log("Match still creates after item is exhausted", exhaustedRes.ok);
  log("No shape resolved once exhausted", exhaustedMatch.loadout?.shapeKey === null, JSON.stringify(exhaustedMatch.loadout));

  const { body: inv2 } = (await w.req("/api/shop/inventory")) as { body: { items: InventoryItem[] } };
  const ownedAfterExhaust = inv2.items.find((i) => i.id === owned.id);
  log("Inventory now reports isUsable false for the exhausted item", ownedAfterExhaust?.isUsable === false);

  console.log(failures ? "\nSHOP PHASE 1 SMOKE TEST: FAILURES ABOVE" : "\nSHOP PHASE 1 SMOKE TEST: ALL PASSED");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
