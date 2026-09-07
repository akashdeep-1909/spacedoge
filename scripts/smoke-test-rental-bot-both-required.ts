// Verifies RENTAL_BOT's new "both compulsory" pricing model
// (ShopEntitlementType.USES_AND_TIME_WINDOW — a games cap AND a
// validity window together, expiring on whichever is hit first):
//   1. createShopItemSchema rejects a RENTAL_BOT submission missing
//      either usesGranted or termDays, and rejects any entitlementType
//      other than USES_AND_TIME_WINDOW for this category — admin has
//      no way to create a Rental Bot item with just one of the two.
//   2. A valid RENTAL_BOT submission (both fields) is accepted.
//   3. The seeded RENTAL_BOT_AUTOPILOT catalog row already carries
//      USES_AND_TIME_WINDOW with real usesGranted/termDays (proves the
//      one-time backfill in seedShopItemConfigsIfEmpty actually ran,
//      not just that new admin-created rows can use the new type).
//   4. Purchasing it sets BOTH usesRemaining AND expiresAt on the
//      owned WalletShopItem (not just one, unlike a plain USES or
//      TIME_WINDOW item).
//   5. "Whichever comes first" really works both directions, with zero
//      special-cased consumption logic: exhausting usesRemaining to 0
//      deactivates the item even though it isn't expired yet, AND
//      (separately, on a second purchase) an already-past expiresAt
//      deactivates the item even though usesRemaining is still
//      positive.
//
// Run via tsx (no psql locally, same reasoning as every other
// scripts/smoke-test-*.ts in this repo):
//   npx tsx scripts/smoke-test-rental-bot-both-required.ts
import "dotenv/config";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SiweMessage } from "siwe";
import { db } from "../src/lib/db";
import { createShopItemSchema } from "../src/lib/shopAdminSchema";

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

const baseRentalBotBody = { category: "RENTAL_BOT" as const, label: "Test Rental Bot", description: "test", priceUsdt: 1 };

async function main() {
  // --- 1. Admin schema rejects incomplete/wrong-type submissions. ---
  const missingBoth = createShopItemSchema.safeParse({ ...baseRentalBotBody, entitlementType: "USES_AND_TIME_WINDOW" });
  log("Rejects a RENTAL_BOT submission with neither usesGranted nor termDays", !missingBoth.success);

  const missingTermDays = createShopItemSchema.safeParse({ ...baseRentalBotBody, entitlementType: "USES_AND_TIME_WINDOW", usesGranted: 10 });
  log("Rejects a RENTAL_BOT submission missing termDays", !missingTermDays.success);

  const missingUsesGranted = createShopItemSchema.safeParse({ ...baseRentalBotBody, entitlementType: "USES_AND_TIME_WINDOW", termDays: 3 });
  log("Rejects a RENTAL_BOT submission missing usesGranted", !missingUsesGranted.success);

  const wrongType = createShopItemSchema.safeParse({ ...baseRentalBotBody, entitlementType: "USES", usesGranted: 10 });
  log("Rejects a RENTAL_BOT submission with entitlementType USES (not USES_AND_TIME_WINDOW)", !wrongType.success);

  // --- 2. A valid submission (both fields, right type) is accepted. ---
  const valid = createShopItemSchema.safeParse({
    ...baseRentalBotBody,
    entitlementType: "USES_AND_TIME_WINDOW",
    usesGranted: 10,
    termDays: 3,
  });
  log("Accepts a RENTAL_BOT submission with both usesGranted and termDays", valid.success);

  // --- 3. The seeded catalog row itself already migrated. ---
  const host = await makeClient();
  const { body: catalogBody } = (await host.req("/api/shop/catalog")) as {
    body: { items: { id: string; category: string; entitlementType: string; usesGranted: number | null; termDays: number | null }[] };
  };
  const rentalBotItem = catalogBody.items.find((i) => i.category === "RENTAL_BOT");
  log(
    "The seeded RENTAL_BOT_AUTOPILOT catalog row already carries USES_AND_TIME_WINDOW with real usesGranted/termDays",
    rentalBotItem?.entitlementType === "USES_AND_TIME_WINDOW" && !!rentalBotItem.usesGranted && !!rentalBotItem.termDays,
    JSON.stringify(rentalBotItem)
  );
  if (!rentalBotItem) throw new Error("No RENTAL_BOT item in the seeded catalog");

  // --- 4. Purchasing sets BOTH usesRemaining AND expiresAt. ---
  const { body: purchase } = await host.req("/api/shop/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shopItemConfigId: rentalBotItem.id, source: "PLAY_USDT" }),
  });
  log(
    "Purchase sets both usesRemaining and expiresAt on the owned item",
    purchase.usesRemaining === rentalBotItem.usesGranted && !!purchase.expiresAt,
    JSON.stringify({ usesRemaining: purchase.usesRemaining, expiresAt: purchase.expiresAt })
  );

  // --- 5a. Exhausting uses deactivates even though not yet expired. ---
  await db.walletShopItem.update({ where: { id: purchase.id }, data: { usesRemaining: 1 } });
  const fakeMatch1 = await db.match.create({
    data: { mode: "PRACTICE", entryFeeUsdt: 0, prizePoolUsdt: 0, platformFeeUsdt: 0, mapSeed: "smoke-test" },
  });
  await db.$transaction(async (tx) => {
    const { consumeLoadoutSelections } = await import("../src/lib/shop");
    // Direct call bypassing the RENTAL_BOT-only-in-lobby gate — this
    // check is purely about the uses/expiry mechanics, not the
    // separate Play-with-Friends-only rule (already covered by
    // scripts/smoke-test-rental-bot.ts).
    const { ShopItemCategory } = await import("../src/generated/prisma/enums");
    await consumeLoadoutSelections(
      tx,
      host.walletProfileId,
      fakeMatch1.id,
      { [ShopItemCategory.RENTAL_BOT]: purchase.id },
      { allowRentalBot: true }
    );
  });
  const afterExhausted = await db.walletShopItem.findUniqueOrThrow({ where: { id: purchase.id } });
  log(
    "Exhausting usesRemaining to 0 deactivates the item even though expiresAt is still in the future",
    afterExhausted.usesRemaining === 0 && afterExhausted.active === false && afterExhausted.expiresAt !== null && afterExhausted.expiresAt > new Date(),
    `usesRemaining=${afterExhausted.usesRemaining} active=${afterExhausted.active} expiresAt=${afterExhausted.expiresAt?.toISOString()}`
  );

  // --- 5b. A second purchase, expired but with uses left, also deactivates. ---
  const { body: purchase2 } = await host.req("/api/shop/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shopItemConfigId: rentalBotItem.id, source: "PLAY_USDT" }),
  });
  await db.walletShopItem.update({ where: { id: purchase2.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const fakeMatch2 = await db.match.create({
    data: { mode: "PRACTICE", entryFeeUsdt: 0, prizePoolUsdt: 0, platformFeeUsdt: 0, mapSeed: "smoke-test" },
  });
  await db.$transaction(async (tx) => {
    const { consumeLoadoutSelections } = await import("../src/lib/shop");
    const { ShopItemCategory } = await import("../src/generated/prisma/enums");
    await consumeLoadoutSelections(
      tx,
      host.walletProfileId,
      fakeMatch2.id,
      { [ShopItemCategory.RENTAL_BOT]: purchase2.id },
      { allowRentalBot: true }
    );
  });
  const afterExpired = await db.walletShopItem.findUniqueOrThrow({ where: { id: purchase2.id } });
  log(
    "A past expiresAt deactivates the item even though usesRemaining is still positive",
    afterExpired.active === false && (afterExpired.usesRemaining ?? 0) > 0,
    `usesRemaining=${afterExpired.usesRemaining} active=${afterExpired.active}`
  );

  // Cleanup — throwaway synthetic wallet + everything it touched.
  for (const mid of [fakeMatch1.id, fakeMatch2.id]) {
    await db.matchLoadoutSelection.deleteMany({ where: { matchLoadout: { matchId: mid } } });
    await db.matchLoadout.deleteMany({ where: { matchId: mid } });
    await db.match.deleteMany({ where: { id: mid } });
  }
  await db.walletShopItem.deleteMany({ where: { walletProfileId: host.walletProfileId } });
  await db.ledgerEntry.deleteMany({ where: { walletProfileId: host.walletProfileId } });
  await db.walletProfile.delete({ where: { id: host.walletProfileId } });

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
