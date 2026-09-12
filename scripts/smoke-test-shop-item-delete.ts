// Verifies the new DELETE /api/admin/shop/[id] endpoint end to end —
// added because the admin shop page previously had no way to remove a
// catalog row at all, only Disable. See that route's own doc-comment
// for why delete is deliberately restricted to a never-purchased row:
//   1. A freshly-created, never-purchased item can be deleted outright.
//   2. GET /api/admin/shop reports purchaseCount per row (0 for the
//      never-bought item above).
//   3. Once a wallet buys an item, purchaseCount reflects it and
//      DELETE is rejected (409) with a clear reason — the row still
//      exists afterward, untouched.
//   4. Disable still works on that same purchased row (the one action
//      that remains available once there's real history).
//
// Run via tsx (see scripts/smoke-test-shop-phase1.ts for why):
//   npx tsx scripts/smoke-test-shop-item-delete.ts
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose ad-hoc JSON bodies, throwaway verification script
async function signIn(): Promise<{ address: string; req: (path: string, opts?: RequestInit) => Promise<{ res: Response; body: any }> }> {
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
  const admin = await signIn();
  await db.adminUser.create({ data: { address: admin.address.toLowerCase(), addedByAddress: "smoke-test" } });
  const player = await signIn();

  try {
    // --- 1. A never-purchased item deletes outright. ---
    const { body: neverBought } = await admin.req("/api/admin/shop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "ROCKET_SHAPE",
        shapeKey: "ORB",
        colorHex: "#123456",
        label: "Smoke Test Never Bought",
        description: "Deleted before anyone can buy it.",
        priceUsdt: 0.1,
        entitlementType: "USES",
        usesGranted: 1,
      }),
    });
    log("Created a never-purchased item", !!neverBought.row?.id);

    const { body: listBefore } = await admin.req("/api/admin/shop");
    const rowBefore = listBefore.rows.find((r: { id: string }) => r.id === neverBought.row.id);
    log("purchaseCount is 0 for the never-bought item", rowBefore?.purchaseCount === 0, JSON.stringify(rowBefore));

    const { res: deleteRes1 } = await admin.req(`/api/admin/shop/${neverBought.row.id}`, { method: "DELETE" });
    log("DELETE succeeds for a never-purchased item", deleteRes1.ok, `status ${deleteRes1.status}`);

    const { body: listAfterDelete } = await admin.req("/api/admin/shop");
    log("The deleted row is gone from the catalog list", !listAfterDelete.rows.some((r: { id: string }) => r.id === neverBought.row.id));

    // --- 2. An item WITH a purchase cannot be deleted. ---
    const { body: willBeBought } = await admin.req("/api/admin/shop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "ROCKET_SHAPE",
        shapeKey: "WEDGE",
        colorHex: "#abcdef",
        label: "Smoke Test Will Be Bought",
        description: "Purchased once, then delete must be blocked.",
        priceUsdt: 0.1,
        entitlementType: "USES",
        usesGranted: 5,
      }),
    });

    await player.req("/api/wallet/deposit-demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 100 }),
    });
    const { res: purchaseRes, body: purchase } = await player.req("/api/shop/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopItemConfigId: willBeBought.row.id, source: "PLAY_USDT" }),
    });
    log("Player successfully buys the item", purchaseRes.ok, JSON.stringify(purchase));

    const { body: listAfterPurchase } = await admin.req("/api/admin/shop");
    const rowAfterPurchase = listAfterPurchase.rows.find((r: { id: string }) => r.id === willBeBought.row.id);
    log("purchaseCount is now 1", rowAfterPurchase?.purchaseCount === 1, JSON.stringify(rowAfterPurchase));

    const { res: deleteRes2, body: deleteBody2 } = await admin.req(`/api/admin/shop/${willBeBought.row.id}`, { method: "DELETE" });
    log("DELETE is rejected (409) once an item has a purchase", deleteRes2.status === 409, JSON.stringify(deleteBody2));
    log("Rejection message explains why (Disable instead)", typeof deleteBody2.error === "string" && deleteBody2.error.includes("Disable"), deleteBody2.error);

    const { body: listStillThere } = await admin.req("/api/admin/shop");
    log("The purchased row still exists, untouched", listStillThere.rows.some((r: { id: string }) => r.id === willBeBought.row.id));

    // --- 3. Disable still works on that same row. ---
    const { res: disableRes, body: disableBody } = await admin.req(`/api/admin/shop/${willBeBought.row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    log("Disable still works on a row with purchase history", disableRes.ok && disableBody.row?.enabled === false, JSON.stringify(disableBody));

    // Cleanup: this row can't be hard-deleted (by design), so drop the
    // purchase and the config row directly via the DB, same as any
    // other smoke test's own throwaway cleanup.
    await db.walletShopItem.deleteMany({ where: { shopItemConfigId: willBeBought.row.id } });
    await db.shopItemConfig.deleteMany({ where: { id: willBeBought.row.id } });
  } finally {
    // Same convention as smoke-test-shop-admin.ts: the admin flag is
    // cleaned up explicitly (it's a real, meaningful row elsewhere in
    // the app); the throwaway player wallet itself is left, matching
    // that script's own precedent.
    await db.adminUser.deleteMany({ where: { address: admin.address.toLowerCase() } });
  }

  console.log(failures ? "\nSHOP ITEM DELETE SMOKE TEST: FAILURES ABOVE" : "\nSHOP ITEM DELETE SMOKE TEST: ALL PASSED");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
