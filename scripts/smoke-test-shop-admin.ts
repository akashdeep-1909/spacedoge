// Verifies the Shop admin controls end to end:
//   1. Master ON/OFF switch (PlatformSettings.shopEnabled): default ON,
//      /api/settings/public reflects it, turning it OFF blocks new
//      purchases (403) and empties GET /api/shop/catalog, but
//      GET /api/shop/inventory for an existing owner is untouched.
//   2. Admin "+ Add Item" (POST /api/admin/shop): creates a new
//      ShopItemConfig with a real, distinct key; it's immediately
//      buyable by a player once the shop is back ON.
//
// Run via tsx (see scripts/smoke-test-shop-phase1.ts for why):
//   npx tsx scripts/smoke-test-shop-admin.ts
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
  // A throwaway admin — inserted directly into AdminUser rather than
  // needing a real ADMIN_ADDRESSES-listed private key, same idea as
  // this script signing in a throwaway PLAYER wallet below.
  const admin = await signIn();
  await db.adminUser.create({ data: { address: admin.address.toLowerCase(), addedByAddress: "smoke-test" } });

  const player = await signIn();

  try {
    // --- Baseline: shop is ON by default ---
    const { body: pub1 } = await player.req("/api/settings/public");
    log("Shop is ON by default", pub1.shopEnabled === true, `got ${pub1.shopEnabled}`);

    const { body: adminSettings1 } = await admin.req("/api/admin/settings");
    log("Admin settings also reports shopEnabled true", adminSettings1.shopEnabled === true);

    // --- Admin creates a brand-new catalog item ---
    const { res: createRes, body: created } = await admin.req("/api/admin/shop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "ROCKET_SHAPE",
        shapeKey: "WEDGE",
        colorHex: "#f4c15d",
        label: "Smoke Test Comet",
        description: "A throwaway item created by the admin smoke test.",
        priceUsdt: 0.42,
        entitlementType: "USES",
        usesGranted: 9,
      }),
    });
    log("Admin can create a new catalog item", createRes.ok, JSON.stringify(created));
    log("New item has a real distinct key", typeof created.row?.key === "string" && created.row.key.length > 0, created.row?.key);
    log("New item snapshots the chosen shape", created.row?.shapeKey === "WEDGE");
    log("New item defaults to enabled", created.row?.enabled === true);

    const { body: catalogAfterCreate } = await player.req("/api/shop/catalog");
    const foundNew = catalogAfterCreate.items.find((i: { id: string }) => i.id === created.row.id);
    log("The new item is immediately visible in the player catalog", !!foundNew);

    // Player buys the freshly-created item to prove it's really usable,
    // not just listed — needs Game Reward USDT first: deposit-demo for
    // Play USDT, then a real Champion Rush win converted PTS -> USDT
    // (same funding flow as scripts/smoke-test-shop-phase1.ts, see
    // that script's own comment on why the real duration wait matters).
    await player.req("/api/wallet/deposit-demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 100 }),
    });
    const { body: champMatch } = await player.req("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "CHAMPION_RUSH" }),
    });
    console.log(`Waiting ${champMatch.durationSec + 1}s for a real settlement window...`);
    await new Promise((r) => setTimeout(r, (champMatch.durationSec + 1) * 1000));
    await player.req(`/api/matches/${champMatch.matchId}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: 300, durationPlayedSec: champMatch.durationSec }),
    });
    const { body: balAfter } = await player.req("/api/wallet/balances");
    await player.req("/api/wallet/convert-pts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ptsAmount: balAfter.pts }),
    });

    const { res: buyNewRes } = await player.req("/api/shop/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopItemConfigId: created.row.id, source: "GAME_REWARD_USDT" }),
    });
    log("Player can buy the newly-created item", buyNewRes.ok);

    // --- Admin turns the whole shop OFF ---
    const { res: offRes } = await admin.req("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopEnabled: false }),
    });
    log("Admin can turn the shop off", offRes.ok);

    const { body: pub2 } = await player.req("/api/settings/public");
    log("Public settings now reports shopEnabled false", pub2.shopEnabled === false);

    const { body: catalogOff } = await player.req("/api/shop/catalog");
    log("Catalog is empty while off", catalogOff.items.length === 0 && catalogOff.shopEnabled === false, JSON.stringify(catalogOff));

    const { res: buyBlockedRes, body: buyBlockedBody } = await player.req("/api/shop/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopItemConfigId: created.row.id, source: "GAME_REWARD_USDT" }),
    });
    log("New purchases are blocked while off", buyBlockedRes.status === 403, JSON.stringify(buyBlockedBody));

    const { body: invWhileOff } = await player.req("/api/shop/inventory");
    const stillOwned = invWhileOff.items.find((i: { configKey: string }) => i.configKey === created.row.key);
    log("Already-owned items still show in inventory while off", !!stillOwned && stillOwned.isUsable === true);

    // --- Admin turns it back ON ---
    const { res: onRes } = await admin.req("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopEnabled: true }),
    });
    log("Admin can turn the shop back on", onRes.ok);

    const { body: catalogOn } = await player.req("/api/shop/catalog");
    log("Catalog is populated again once back on", catalogOn.items.length > 0 && catalogOn.shopEnabled === true);
  } finally {
    // Leave the platform default (ON) and this test's admin row clean
    // regardless of pass/fail, so re-running never accumulates state.
    await db.platformSettings.update({ where: { id: "singleton" }, data: { shopEnabled: true } }).catch(() => {});
    await db.adminUser.deleteMany({ where: { address: admin.address.toLowerCase() } });
  }

  console.log(failures ? "\nSHOP ADMIN SMOKE TEST: FAILURES ABOVE" : "\nSHOP ADMIN SMOKE TEST: ALL PASSED");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
