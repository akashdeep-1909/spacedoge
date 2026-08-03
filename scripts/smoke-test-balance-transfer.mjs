// Verifies the same-wallet balance transfer feature end-to-end (moves
// USDT between one wallet's own Play/Recycled/Referral buckets, no
// counterparty involved):
//   1. Wallet is funded with RECYCLED_USDT, moves some into PLAY_USDT.
//   2. Recycled balance decreases, Play balance increases, both by
//      exactly the moved amount (same wallet, two ledger rows).
//   3. RECYCLED_USDT <-> REFERRAL_USDT works in both directions.
//   4. PLAY_USDT can also be a source (all 3 buckets move freely).
//   5. Sending more than the available balance is rejected.
//   6. Choosing the same balance as both source and destination is rejected.
//   7. A non-transferable balance type (GAME_REWARD_USDT) is rejected
//      by the API even if attempted directly.
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

async function signInAs(account) {
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

async function signIn() {
  return signInAs(privateKeyToAccount(generatePrivateKey()));
}

async function adminSignIn() {
  const { address, cookie } = await signIn();
  psql(`INSERT INTO "AdminUser" (id, "address", "createdAt") VALUES ('smoketest_admin_${Date.now()}', '${address.toLowerCase()}', now());`);
  return { address, cookie };
}

async function getBalances(cookie) {
  const res = await fetch(`${BASE}/api/wallet/balances`, { headers: { cookie } });
  return res.json();
}

async function moveBalance(cookie, body) {
  const res = await fetch(`${BASE}/api/wallet/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { ok: res.ok, status: res.status, json };
}

let adminWalletAddress = null;
try {
  const { cookie: adminCookie, address: adminAddr } = await adminSignIn();
  adminWalletAddress = adminAddr;

  const wallet = await signIn();
  const walletId = psql(`SELECT id FROM "WalletProfile" WHERE address='${wallet.address.toLowerCase()}';`);

  // Fund the wallet with 20 RECYCLED_USDT via the real admin credit endpoint.
  const creditRes = await fetch(`${BASE}/api/admin/users/${walletId}/credit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: adminCookie },
    body: JSON.stringify({ balanceType: "RECYCLED_USDT", amount: 20, note: "smoke test funding" }),
  });
  log("admin can fund wallet with RECYCLED_USDT", creditRes.ok);

  const before1 = await getBalances(wallet.cookie);

  // 1 & 2. Move 7 RECYCLED_USDT into PLAY_USDT.
  const moveResult = await moveBalance(wallet.cookie, { fromBalanceType: "RECYCLED_USDT", toBalanceType: "PLAY_USDT", amount: 7 });
  log("wallet can move RECYCLED_USDT into PLAY_USDT", moveResult.ok, JSON.stringify(moveResult.json));

  const after1 = await getBalances(wallet.cookie);
  log("recycledUsdt decreased by exactly the moved amount", Math.abs(before1.recycledUsdt - after1.recycledUsdt - 7) < 1e-9, `${before1.recycledUsdt} -> ${after1.recycledUsdt}`);
  log("playUsdt increased by exactly the moved amount", Math.abs(after1.playUsdt - before1.playUsdt - 7) < 1e-9, `${before1.playUsdt} -> ${after1.playUsdt}`);

  // 3. RECYCLED_USDT <-> REFERRAL_USDT both directions.
  const toReferral = await moveBalance(wallet.cookie, { fromBalanceType: "RECYCLED_USDT", toBalanceType: "REFERRAL_USDT", amount: 5 });
  log("RECYCLED_USDT -> REFERRAL_USDT works", toReferral.ok, JSON.stringify(toReferral.json));
  const after2 = await getBalances(wallet.cookie);
  log("referralUsdt increased by exactly the moved amount", Math.abs(after2.referralUsdt - after1.referralUsdt - 5) < 1e-9, `${after1.referralUsdt} -> ${after2.referralUsdt}`);

  const backFromReferral = await moveBalance(wallet.cookie, { fromBalanceType: "REFERRAL_USDT", toBalanceType: "RECYCLED_USDT", amount: 2 });
  log("REFERRAL_USDT -> RECYCLED_USDT works (both directions free)", backFromReferral.ok, JSON.stringify(backFromReferral.json));

  // 4. PLAY_USDT can also be a source.
  const beforePlay = await getBalances(wallet.cookie);
  const fromPlay = await moveBalance(wallet.cookie, { fromBalanceType: "PLAY_USDT", toBalanceType: "RECYCLED_USDT", amount: 1 });
  log("PLAY_USDT works as a source balance", fromPlay.ok, JSON.stringify(fromPlay.json));
  const afterPlay = await getBalances(wallet.cookie);
  log("playUsdt decreased by exactly the moved amount", Math.abs(beforePlay.playUsdt - afterPlay.playUsdt - 1) < 1e-9, `${beforePlay.playUsdt} -> ${afterPlay.playUsdt}`);

  // 5. Over-balance rejected.
  const overResult = await moveBalance(wallet.cookie, { fromBalanceType: "RECYCLED_USDT", toBalanceType: "REFERRAL_USDT", amount: 100000 });
  log("moving more than available balance is rejected", !overResult.ok && overResult.status === 400);

  // 6. Same source and destination rejected.
  const sameResult = await moveBalance(wallet.cookie, { fromBalanceType: "RECYCLED_USDT", toBalanceType: "RECYCLED_USDT", amount: 1 });
  log("choosing the same balance for source and destination is rejected", !sameResult.ok && sameResult.status === 400);

  // 7. Non-transferable balance type rejected outright by the API.
  const gameRewardResult = await moveBalance(wallet.cookie, { fromBalanceType: "GAME_REWARD_USDT", toBalanceType: "PLAY_USDT", amount: 1 });
  log("GAME_REWARD_USDT is rejected as a transferable balance type", !gameRewardResult.ok && gameRewardResult.status === 400);
} finally {
  if (adminWalletAddress) {
    psql(`DELETE FROM "AdminUser" WHERE "address"='${adminWalletAddress.toLowerCase()}';`);
  }
  console.log("Cleanup done (test wallet/ledger entries left in place — harmless throwaway data, same as other smoke tests).");
}

process.exit(process.exitCode ?? 0);
