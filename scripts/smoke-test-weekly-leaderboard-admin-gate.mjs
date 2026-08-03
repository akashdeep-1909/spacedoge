// Verifies the weekly leaderboard reward is admin-gated (default OFF):
//   1. Fresh settings default to disabled/no pool.
//   2. With rewards disabled, /api/leaderboard reports rewardsEnabled:
//      false, poolUsdt: 0, and every standing's rewardUsdt is 0 — the
//      ranking itself still comes back (not empty), just no reward.
//   3. An admin can enable it + set a pool amount via PATCH
//      /api/admin/settings.
//   4. With it enabled, /api/leaderboard reports rewardsEnabled: true
//      and the configured poolUsdt.
//   5. Cleanup: settings restored to their original values.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SiweMessage } from "siwe";
import { execSync } from "node:child_process";

const BASE = "http://localhost:3000";
const DB = process.env.DATABASE_URL?.replace(/\?.*$/, "") ?? "postgresql://postgres@localhost:5432/dogeforge";

function log(label, ok, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? " — " + extra : ""}`);
  if (!ok) process.exitCode = 1;
}

function psql(sql) {
  return execSync(`psql "${DB}" -t -A -c "${sql.replace(/"/g, '\\"')}"`, { encoding: "utf8" }).trim();
}

async function signIn() {
  const account = privateKeyToAccount(generatePrivateKey());
  const address = account.address;
  const nonceRes = await fetch(`${BASE}/api/auth/nonce?address=${address}`);
  const { nonce } = await nonceRes.json();
  const siweMessage = new SiweMessage({
    domain: "localhost:3000",
    address,
    statement: "Sign in to Space DOGE. This request will not trigger a blockchain transaction or cost any gas fees.",
    uri: BASE,
    version: "1",
    chainId: 11155111,
    nonce,
  });
  const message = siweMessage.prepareMessage();
  const signature = await account.signMessage({ message });
  const verifyRes = await fetch(`${BASE}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  if (!verifyRes.ok) throw new Error(`sign-in failed: ${await verifyRes.text()}`);
  const cookie = verifyRes.headers.get("set-cookie").split(";")[0];
  return { address, cookie };
}

async function adminSignIn() {
  const { address, cookie } = await signIn();
  psql(`INSERT INTO "AdminUser" (id, "address", "createdAt") VALUES ('smoketest_admin_${Date.now()}', '${address.toLowerCase()}', now());`);
  return { address, cookie };
}

async function getAdminSettings(cookie) {
  const res = await fetch(`${BASE}/api/admin/settings`, { headers: { cookie } });
  return res.json();
}

async function patchAdminSettings(cookie, body) {
  const res = await fetch(`${BASE}/api/admin/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, json: await res.json() };
}

async function getLeaderboard(cookie) {
  const res = await fetch(`${BASE}/api/leaderboard`, { headers: { cookie } });
  return res.json();
}

let adminWalletAddress = null;
try {
  const { cookie: adminCookie, address: adminAddr } = await adminSignIn();
  adminWalletAddress = adminAddr;
  const viewer = await signIn();

  // Snapshot original settings so we can restore them at the end —
  // this is a shared singleton row, not throwaway test data.
  const original = await getAdminSettings(adminCookie);

  // Force a known starting state: disabled, no pool — matches the
  // migration's DEFAULT, but a prior manual admin change could've left
  // it configured, so set it explicitly rather than assuming.
  const resetResult = await patchAdminSettings(adminCookie, { weeklyLeaderboardEnabled: false, weeklyLeaderboardPoolUsdt: null });
  log("admin can reset weekly leaderboard to disabled/no-pool", resetResult.ok);

  const settingsAfterReset = await getAdminSettings(adminCookie);
  log("settings reflect disabled", settingsAfterReset.weeklyLeaderboardEnabled === false);
  log("settings reflect no pool", settingsAfterReset.weeklyLeaderboardPoolUsdt === null);

  const boardDisabled = await getLeaderboard(viewer.cookie);
  log("leaderboard reports rewardsEnabled: false when unconfigured", boardDisabled.rewardsEnabled === false, JSON.stringify(boardDisabled.rewardsEnabled));
  log("leaderboard reports poolUsdt: 0 when unconfigured", boardDisabled.poolUsdt === 0, JSON.stringify(boardDisabled.poolUsdt));
  log(
    "current week standings still come back (ranking not suppressed)",
    Array.isArray(boardDisabled.currentWeek.standings),
    `${boardDisabled.currentWeek.standings.length} rows`
  );
  const anyNonzeroRewardDisabled = boardDisabled.currentWeek.standings.some((s) => s.rewardUsdt !== 0);
  log("every standing shows $0 reward while disabled", !anyNonzeroRewardDisabled);

  // Now enable it with a real pool.
  const enableResult = await patchAdminSettings(adminCookie, { weeklyLeaderboardEnabled: true, weeklyLeaderboardPoolUsdt: 25 });
  log("admin can enable + set a pool amount", enableResult.ok, JSON.stringify(enableResult.json));

  const boardEnabled = await getLeaderboard(viewer.cookie);
  log("leaderboard reports rewardsEnabled: true once configured", boardEnabled.rewardsEnabled === true);
  log("leaderboard reports the configured poolUsdt", boardEnabled.poolUsdt === 25, JSON.stringify(boardEnabled.poolUsdt));

  // Restore whatever was there before this test ran.
  const restoreResult = await patchAdminSettings(adminCookie, {
    weeklyLeaderboardEnabled: original.weeklyLeaderboardEnabled,
    weeklyLeaderboardPoolUsdt: original.weeklyLeaderboardPoolUsdt,
  });
  log("original settings restored", restoreResult.ok);
} finally {
  if (adminWalletAddress) {
    psql(`DELETE FROM "AdminUser" WHERE "address"='${adminWalletAddress.toLowerCase()}';`);
  }
  console.log("Cleanup done (settings restored, test wallets left in place — harmless throwaway data).");
}

process.exit(process.exitCode ?? 0);
