// Verifies the new admin "Leaderboard Status" master switch
// (PlatformSettings.leaderboardEnabled) — distinct from the pre-
// existing weeklyLeaderboardEnabled, which only ever gated the reward
// payout, never the page's own visibility:
//   1. updatePlatformSettings persists leaderboardEnabled and
//      getLeaderboardEnabled() reflects it.
//   2. GET /api/settings/public (what nav components read to decide
//      whether to show the Leaderboard link at all) reflects it.
//   3. GET /api/leaderboard reflects it too, AND — critically — real
//      ranking data (currentWeek/lastWeek) keeps being computed and
//      returned regardless of the switch; only the page's own decision
//      to render it changes, never the underlying computation.
//   4. Flipping it back to ON restores both endpoints to reporting
//      true, and the original DB value is restored at the end either
//      way (via try/finally).
//
// Run via tsx (no psql locally, same reasoning as every other
// scripts/smoke-test-*.ts in this repo):
//   npx tsx scripts/smoke-test-leaderboard-toggle.ts
import "dotenv/config";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SiweMessage } from "siwe";
import { db } from "../src/lib/db";
import { updatePlatformSettings, getLeaderboardEnabled } from "../src/lib/settings";

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
  const address = account.address.toLowerCase();
  const wp = await db.walletProfile.findUniqueOrThrow({ where: { address } });
  return { address, req, walletProfileId: wp.id };
}

async function main() {
  const settingsBefore = await db.platformSettings.findUnique({ where: { id: "singleton" } });
  const leaderboardEnabledBefore = settingsBefore?.leaderboardEnabled ?? true;

  const player = await makeClient();

  try {
    // --- 1 & 2 & 3. Turn it OFF. ---
    await updatePlatformSettings({ leaderboardEnabled: false }, "smoke-test-admin");
    log("getLeaderboardEnabled() reports false after the update", (await getLeaderboardEnabled()) === false);

    const { body: publicSettingsOff } = await player.req("/api/settings/public");
    log("GET /api/settings/public reports leaderboardEnabled: false", publicSettingsOff.leaderboardEnabled === false);

    const { body: leaderboardOff } = await player.req("/api/leaderboard");
    log(
      "GET /api/leaderboard reports leaderboardEnabled: false while OFF, but still returns real ranking data",
      leaderboardOff.leaderboardEnabled === false && Array.isArray(leaderboardOff.currentWeek?.standings) && Array.isArray(leaderboardOff.lastWeek?.results),
      JSON.stringify({ leaderboardEnabled: leaderboardOff.leaderboardEnabled, hasCurrentWeek: !!leaderboardOff.currentWeek, hasLastWeek: !!leaderboardOff.lastWeek })
    );

    // --- 4. Turn it back ON. ---
    await updatePlatformSettings({ leaderboardEnabled: true }, "smoke-test-admin");
    log("getLeaderboardEnabled() reports true again after re-enabling", (await getLeaderboardEnabled()) === true);

    const { body: publicSettingsOn } = await player.req("/api/settings/public");
    log("GET /api/settings/public reports leaderboardEnabled: true again", publicSettingsOn.leaderboardEnabled === true);

    const { body: leaderboardOn } = await player.req("/api/leaderboard");
    log("GET /api/leaderboard reports leaderboardEnabled: true again", leaderboardOn.leaderboardEnabled === true);
  } finally {
    // Cleanup — restore the original value and remove the throwaway wallet.
    await db.platformSettings.update({ where: { id: "singleton" }, data: { leaderboardEnabled: leaderboardEnabledBefore } });
    await db.walletProfile.delete({ where: { id: player.walletProfileId } }).catch(() => {});
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
