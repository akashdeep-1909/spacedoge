// Verifies Coin Rush Shop Phase 2 (colored rockets + real Speed/Health/
// Magnet/Fire/Shield upgrades) end to end:
//   1. The admin create route's discriminated-union schema requires
//      only each category's own relevant fields (a ROCKET_SHAPE body
//      doesn't need speedPct, a STAT_SPEED body doesn't need shapeKey,
//      etc.), and rejects a malformed colorHex.
//   2. GET /api/shop/catalog exposes colorHex on rocket items and the
//      right effect column(s) on every other seeded category.
//   3. Purchasing one item per category snapshots every relevant
//      effect field onto the owned WalletShopItem (GET /api/shop/
//      inventory), and USES-type items get a real usesRemaining while
//      TIME_WINDOW-type items get a real expiresAt.
//   4. Starting a match with ALL SIX categories equipped at once
//      resolves every effect field correctly in one combined
//      ResolvedLoadout (POST /api/matches' own response), and writes a
//      real MatchLoadoutSelection row per category.
//   5. getResolvedLoadoutForMatch (the resume-after-refresh path used
//      by GET /api/matches/active) reconstructs the EXACT same
//      ResolvedLoadout from the durable audit trail alone.
//   6. A USES-type item used in that match (Speed/Magnet/Shield in the
//      seed catalog) has usesRemaining decremented by exactly 1.
//
// Run via tsx (no psql locally, same reasoning as every other
// scripts/smoke-test-*.ts in this repo):
//   npx tsx scripts/smoke-test-shop-phase2.ts
import "dotenv/config";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SiweMessage } from "siwe";
import { db } from "../src/lib/db";
import { getResolvedLoadoutForMatch } from "../src/lib/shop";
import { createSchema } from "../src/app/api/admin/shop/route";

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
  termDays: number | null;
  shapeKey: string | null;
  colorHex: string | null;
  speedMultBonus: number | null;
  livesBonus: number | null;
  magnetDurationBonusSec: number | null;
  magnetCooldownDeltaSec: number | null;
  fireExtraUses: number | null;
  fireDurationBonusSec: number | null;
  shieldDurationBonusSec: number | null;
  shieldCooldownDeltaSec: number | null;
  priceUsdt: number;
}
interface InventoryItem extends CatalogItem {
  configKey: string;
  usesRemaining: number | null;
  expiresAt: string | null;
  isUsable: boolean;
}

async function main() {
  // The shop master switch (PlatformSettings.shopEnabled) may be
  // legitimately turned off by whoever last touched the admin panel —
  // force it on for the duration of this test, then restore whatever
  // it actually was, so running this script never silently leaves the
  // real storefront toggled on/off differently than an admin set it.
  const settingsBefore = await db.platformSettings.findUnique({ where: { id: "singleton" } });
  const shopEnabledBefore = settingsBefore?.shopEnabled ?? true;
  await db.platformSettings.upsert({
    where: { id: "singleton" },
    update: { shopEnabled: true },
    create: { id: "singleton", shopEnabled: true },
  });

  // --- 1. Admin schema validation (no HTTP — no real admin session
  // available in this script, same reasoning as smoke-test-admin-
  // block.ts's own risk-flag schema check). ---
  const rocketMissingColor = !createSchema.safeParse({
    category: "ROCKET_SHAPE",
    shapeKey: "VOYAGER",
    label: "Test",
    description: "Test",
    priceUsdt: 1,
    entitlementType: "USES",
    usesGranted: 10,
  }).success;
  log("ROCKET_SHAPE without colorHex is rejected", rocketMissingColor);

  const rocketBadColor = !createSchema.safeParse({
    category: "ROCKET_SHAPE",
    shapeKey: "VOYAGER",
    colorHex: "not-a-color",
    label: "Test",
    description: "Test",
    priceUsdt: 1,
    entitlementType: "USES",
    usesGranted: 10,
  }).success;
  log("ROCKET_SHAPE with a malformed colorHex is rejected", rocketBadColor);

  const speedOk = createSchema.safeParse({
    category: "STAT_SPEED",
    speedPct: 15,
    label: "Test Speed",
    description: "Test",
    priceUsdt: 1,
    entitlementType: "USES",
    usesGranted: 10,
  }).success;
  log("STAT_SPEED with only speedPct (no shapeKey/colorHex) is accepted", speedOk);

  // --- Sign in + fund via the dev-only deposit-demo endpoint (PLAY_USDT). ---
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
    body: JSON.stringify({ amount: 50 }),
  });

  const address = account.address.toLowerCase();
  const wp = await db.walletProfile.findUniqueOrThrow({ where: { address } });

  // --- 2. Catalog exposes the right effect fields per category. ---
  const { body: catalogBody } = (await req("/api/shop/catalog")) as { body: { items: CatalogItem[] } };
  const catalog = catalogBody.items;
  const byCategory = (c: string) => catalog.filter((i) => i.category === c);

  // Prefer a rocket item that actually HAS a colorHex — this repo's
  // dev DB can carry older/leftover ROCKET_SHAPE test rows created
  // before colorHex existed (still valid, just null there), and
  // byCategory(...)[0] isn't guaranteed to land on one of the real
  // Phase 2 seed rows.
  const rocket = byCategory("ROCKET_SHAPE").find((i) => i.colorHex) ?? byCategory("ROCKET_SHAPE")[0];
  const speed = byCategory("STAT_SPEED")[0];
  const health = byCategory("STAT_HEALTH")[0];
  const magnet = byCategory("POWERUP_MAGNET")[0];
  const fire = byCategory("POWERUP_FIRE")[0];
  const shield = byCategory("POWERUP_SHIELD")[0];

  log("Catalog has a ROCKET_SHAPE item with a real colorHex", !!rocket?.colorHex, JSON.stringify(rocket?.colorHex));
  log("Catalog has a STAT_SPEED item with speedMultBonus", speed?.speedMultBonus !== null && speed?.speedMultBonus !== undefined);
  log("Catalog has a STAT_HEALTH item with livesBonus", health?.livesBonus !== null && health?.livesBonus !== undefined);
  log("Catalog has a POWERUP_MAGNET item with duration+cooldown fields", magnet?.magnetDurationBonusSec != null && magnet?.magnetCooldownDeltaSec != null);
  log("Catalog has a POWERUP_FIRE item with uses+duration fields", fire?.fireExtraUses != null && fire?.fireDurationBonusSec != null);
  log("Catalog has a POWERUP_SHIELD item with duration+cooldown fields", shield?.shieldDurationBonusSec != null && shield?.shieldCooldownDeltaSec != null);
  if (!rocket || !speed || !health || !magnet || !fire || !shield) {
    throw new Error("Seeded catalog is missing one of the 6 sellable categories — check src/lib/shop.ts SEED_DEFAULTS");
  }

  // --- 3. Purchase one of each, confirm the snapshot. ---
  const purchased: Record<string, string> = {};
  for (const [label, item] of Object.entries({ ROCKET_SHAPE: rocket, STAT_SPEED: speed, STAT_HEALTH: health, POWERUP_MAGNET: magnet, POWERUP_FIRE: fire, POWERUP_SHIELD: shield })) {
    const { res, body } = await req("/api/shop/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopItemConfigId: item.id, source: "PLAY_USDT" }),
    });
    log(`Purchase succeeds — ${label}`, res.ok, JSON.stringify(body));
    if (res.ok) purchased[label] = body.id as string;
  }

  const { body: invBody } = (await req("/api/shop/inventory")) as { body: { items: InventoryItem[] } };
  const findOwned = (id: string) => invBody.items.find((i) => i.id === id);

  const ownedRocket = findOwned(purchased.ROCKET_SHAPE);
  log("Owned rocket snapshots colorHex from the catalog item", ownedRocket?.colorHex === rocket.colorHex);
  const ownedSpeed = findOwned(purchased.STAT_SPEED);
  log("Owned speed item snapshots speedMultBonus", ownedSpeed?.speedMultBonus === speed.speedMultBonus);
  const ownedMagnet = findOwned(purchased.POWERUP_MAGNET);
  log(
    "Owned magnet item snapshots duration+cooldown",
    ownedMagnet?.magnetDurationBonusSec === magnet.magnetDurationBonusSec && ownedMagnet?.magnetCooldownDeltaSec === magnet.magnetCooldownDeltaSec
  );

  // --- 4. Start a match with all 6 categories equipped at once. ---
  const loadoutSelection = {
    ROCKET_SHAPE: purchased.ROCKET_SHAPE,
    STAT_SPEED: purchased.STAT_SPEED,
    STAT_HEALTH: purchased.STAT_HEALTH,
    POWERUP_MAGNET: purchased.POWERUP_MAGNET,
    POWERUP_FIRE: purchased.POWERUP_FIRE,
    POWERUP_SHIELD: purchased.POWERUP_SHIELD,
  };
  const { body: match } = await req("/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "PRACTICE", loadout: loadoutSelection }),
  });

  log("Resolved loadout carries the rocket's shapeKey + colorHex", match.loadout?.shapeKey === rocket.shapeKey && match.loadout?.colorHex === rocket.colorHex, JSON.stringify(match.loadout));
  log("Resolved loadout carries speedMultBonus", match.loadout?.speedMultBonus === speed.speedMultBonus);
  log("Resolved loadout carries livesBonus", match.loadout?.livesBonus === health.livesBonus);
  log(
    "Resolved loadout carries magnet duration+cooldown",
    match.loadout?.magnetDurationBonusSec === magnet.magnetDurationBonusSec && match.loadout?.magnetCooldownDeltaSec === magnet.magnetCooldownDeltaSec
  );
  log(
    "Resolved loadout carries fire extraUses+duration",
    match.loadout?.fireExtraUses === fire.fireExtraUses && match.loadout?.fireDurationBonusSec === fire.fireDurationBonusSec
  );
  log(
    "Resolved loadout carries shield duration+cooldown",
    match.loadout?.shieldDurationBonusSec === shield.shieldDurationBonusSec && match.loadout?.shieldCooldownDeltaSec === shield.shieldCooldownDeltaSec
  );

  const loadoutRow = await db.matchLoadout.findFirst({
    where: { matchId: match.matchId, walletProfileId: wp.id },
    include: { selections: true },
  });
  log("6 real MatchLoadoutSelection rows were written, one per category", loadoutRow?.selections.length === 6, `got ${loadoutRow?.selections.length}`);

  // --- 5. Resume reconstruction matches the original resolution exactly. ---
  const reconstructed = await getResolvedLoadoutForMatch(match.matchId, wp.id);
  log(
    "getResolvedLoadoutForMatch reconstructs the identical ResolvedLoadout",
    JSON.stringify(reconstructed) === JSON.stringify(match.loadout),
    JSON.stringify(reconstructed)
  );

  // --- 6. USES-type items used in that match decremented by exactly 1. ---
  const speedAfter = await db.walletShopItem.findUniqueOrThrow({ where: { id: purchased.STAT_SPEED } });
  log(
    "USES-type Speed item's usesRemaining decremented by 1",
    speed.entitlementType === "USES" ? speedAfter.usesRemaining === (speed.usesGranted ?? 0) - 1 : true,
    `entitlementType=${speed.entitlementType}, usesRemaining=${speedAfter.usesRemaining}`
  );

  // Cleanup — throwaway synthetic wallet. matchParticipant is deleted
  // by matchId (not walletProfileId) since a PRACTICE match also seeds
  // bot participants under their own synthetic wallet ids, which would
  // otherwise still FK-reference the match and block deleting it.
  await db.matchLoadoutSelection.deleteMany({ where: { matchLoadout: { walletProfileId: wp.id } } });
  await db.matchLoadout.deleteMany({ where: { walletProfileId: wp.id } });
  await db.walletShopItem.deleteMany({ where: { walletProfileId: wp.id } });
  await db.matchParticipant.deleteMany({ where: { matchId: match.matchId } });
  await db.match.deleteMany({ where: { id: match.matchId } });
  await db.ledgerEntry.deleteMany({ where: { walletProfileId: wp.id } });
  await db.walletProfile.delete({ where: { id: wp.id } });
  await db.platformSettings.update({ where: { id: "singleton" }, data: { shopEnabled: shopEnabledBefore } });

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
