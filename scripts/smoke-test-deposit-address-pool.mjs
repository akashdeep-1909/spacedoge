// Verifies the stateless deposit-address split end-to-end:
//   1. With exactly 1 pool address, EVERY wallet sees that same one.
//   2. Adding a 2nd address splits wallets across both (not everyone on
//      the same one anymore) — verified across enough wallets that a
//      false pass by chance is negligible.
//   3. The SAME wallet, asked again with the pool unchanged, gets the
//      SAME address back (stable for a fixed pool size).
//   4. Removing the 2nd address reshuffles everyone back onto the 1
//      remaining address.
//   5. Removing the last address leaves the chain with an empty pool —
//      every wallet gets `address: null`, not a stale cached value.
// Uses a temporary, isolated test chain (own chainKey/pool) so this
// never touches the real BEP20/Ethereum chains or their real users —
// cleaned up at the end regardless of pass/fail.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SiweMessage } from "siwe";
import { execSync } from "node:child_process";

const BASE = "http://localhost:3000";
const DB = process.env.DATABASE_URL?.replace(/\?.*$/, "") ?? "postgresql://postgres@localhost:5432/dogeforge";
const CHAIN_KEY = "SMK" + Date.now().toString(36).toUpperCase(); // chainKey is capped at 20 chars
const ADDR_1 = "0x1111111111111111111111111111111111111111";
const ADDR_2 = "0x2222222222222222222222222222222222222222";

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

async function getDepositAddress(cookie) {
  const res = await fetch(`${BASE}/api/wallet/deposit-address`, { headers: { cookie } });
  if (!res.ok) throw new Error(`deposit-address failed: ${await res.text()}`);
  const body = await res.json();
  return body.chains.find((c) => c.chainKey === CHAIN_KEY)?.address ?? null;
}

// Need an admin session too, to create/edit the test chain's pool. We
// don't have a real admin's private key, so temporarily grant a
// throwaway wallet admin access, sign in as it, and revoke the grant in
// the finally block below either way.
async function adminSignIn() {
  const { address, cookie } = await signIn();
  psql(`INSERT INTO "AdminUser" (id, "address", "createdAt") VALUES ('smoketest_admin_${Date.now()}', '${address.toLowerCase()}', now());`);
  return { address, cookie };
}

let chainId = null;
let adminWalletAddress = null;

try {
  const { cookie: adminCookie, address: adminAddr } = await adminSignIn();
  adminWalletAddress = adminAddr;

  // Create an isolated test chain with exactly 1 starting address.
  const createRes = await fetch(`${BASE}/api/admin/settings/deposit-chains`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: adminCookie },
    body: JSON.stringify({
      chainKey: CHAIN_KEY,
      label: "Smoke Test Chain",
      kind: "EVM",
      addresses: [ADDR_1],
      tokenContract: "0x3333333333333333333333333333333333333333",
      tokenDecimals: 18,
      minConfirmations: 15,
    }),
  });
  const created = await createRes.json();
  log("admin can create a chain with a 1-address starting pool", createRes.ok, createRes.ok ? "" : JSON.stringify(created));
  chainId = created.row?.id;

  // 1. With 1 address, every wallet (however many) sees that same one.
  const wallets = await Promise.all(Array.from({ length: 12 }, () => signIn()));
  const addressesWithOne = await Promise.all(wallets.map((w) => getDepositAddress(w.cookie)));
  log(
    "every wallet gets the single pool address when there's only one",
    addressesWithOne.every((a) => a === ADDR_1),
    JSON.stringify(addressesWithOne)
  );

  // 2. Add a 2nd address — the SAME wallets should now split across
  // both, not all stay on ADDR_1. With 12 independent wallets the odds
  // of a real 50/50 split hash landing all 12 on one bucket by chance
  // is (1/2)^11 ≈ 0.05%, negligible for a smoke test.
  await fetch(`${BASE}/api/admin/settings/deposit-chains/${chainId}/addresses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: adminCookie },
    body: JSON.stringify({ addresses: [ADDR_2] }),
  });
  const addressesWithTwo = await Promise.all(wallets.map((w) => getDepositAddress(w.cookie)));
  const distinctWithTwo = new Set(addressesWithTwo);
  log(
    "adding a 2nd address splits wallets across both",
    distinctWithTwo.has(ADDR_1) && distinctWithTwo.has(ADDR_2) && distinctWithTwo.size === 2,
    JSON.stringify(addressesWithTwo)
  );

  // 3. Same wallet, pool unchanged, gets the SAME address again (stable
  // for a fixed pool size, not re-rolled every request).
  const repeat = await getDepositAddress(wallets[0].cookie);
  log("a wallet's address is stable across repeat requests (pool unchanged)", repeat === addressesWithTwo[0], `${repeat} vs ${addressesWithTwo[0]}`);

  // 4. Remove the 2nd address — everyone reshuffles back onto the 1
  // remaining address, including wallets that were on ADDR_2 before.
  const addr2Id = psql(`SELECT id FROM "DepositTreasuryAddress" WHERE "chainConfigId"='${chainId}' AND address='${ADDR_2}';`);
  await fetch(`${BASE}/api/admin/settings/deposit-chains/${chainId}/addresses/${addr2Id}`, { method: "DELETE", headers: { cookie: adminCookie } });
  const addressesAfterRemoval = await Promise.all(wallets.map((w) => getDepositAddress(w.cookie)));
  log(
    "removing the 2nd address reshuffles everyone back onto the 1 remaining address",
    addressesAfterRemoval.every((a) => a === ADDR_1),
    JSON.stringify(addressesAfterRemoval)
  );

  // 5. Remove the last address — an empty pool means null, not a stale
  // cached value from before.
  const addr1Id = psql(`SELECT id FROM "DepositTreasuryAddress" WHERE "chainConfigId"='${chainId}' AND address='${ADDR_1}';`);
  await fetch(`${BASE}/api/admin/settings/deposit-chains/${chainId}/addresses/${addr1Id}`, { method: "DELETE", headers: { cookie: adminCookie } });
  const addressAfterEmpty = await getDepositAddress(wallets[0].cookie);
  log("an empty pool returns null, not a stale address", addressAfterEmpty === null, String(addressAfterEmpty));
} finally {
  // Cleanup — always runs, pass or fail, so a failed assertion never
  // leaves smoke-test junk in a real database.
  if (chainId) {
    psql(`DELETE FROM "DepositTreasuryAddress" WHERE "chainConfigId"='${chainId}';`);
    psql(`DELETE FROM "DepositWatcherCursor" WHERE chain='${CHAIN_KEY}';`);
    psql(`DELETE FROM "DepositChainConfig" WHERE id='${chainId}';`);
  }
  if (adminWalletAddress) {
    psql(`DELETE FROM "AdminUser" WHERE "address"='${adminWalletAddress.toLowerCase()}';`);
  }
  console.log("Cleanup done.");
}

process.exit(process.exitCode ?? 0);
