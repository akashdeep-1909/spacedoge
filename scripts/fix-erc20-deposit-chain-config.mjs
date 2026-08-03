// One-off fix for the ERC20 (Ethereum) DepositChainConfig row, created
// before evmChainId/tokenDecimals were both required to be correct:
//   - evmChainId was never set (null), so WalletDepositButton never
//     rendered for it (src/app/dashboard/deposit/page.tsx's
//     canDepositFromWallet requires a non-null evmChainId that's also
//     registered in DEPOSIT_CAPABLE_EVM_CHAIN_IDS — mainnet.id=1 already
//     is, via src/lib/wagmi.ts).
//   - tokenDecimals was 18, copied from the BEP20 row — but Ethereum
//     mainnet's real USDT contract (0xdAC17F958D2ee523a2206206994597C13D831ec7,
//     already the configured tokenContract here) famously uses 6
//     decimals, not the ERC20-typical 18 (Binance-peg BEP20 USDT is a
//     SEPARATE contract that genuinely does use 18 — the two aren't
//     interchangeable). Left at 18, a real deposit's raw on-chain amount
//     would have been divided by 10^18 instead of 10^6 — under-crediting
//     by a factor of 10^12. No real ERC20 deposits have been recorded
//     yet (confirmed via psql before running this), so this is a
//     pre-launch config fix, not a correction to a live miscredit.
// Applied through the real admin PATCH endpoint (not a raw SQL UPDATE)
// so it goes through the same validation the admin UI does. Requires a
// temporary admin grant for a throwaway wallet (cleaned up after),
// exactly like the deposit-address-pool smoke test.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SiweMessage } from "siwe";
import { execSync } from "node:child_process";

const BASE = "http://localhost:3000";
const DB = process.env.DATABASE_URL?.replace(/\?.*$/, "") ?? "postgresql://postgres@localhost:5432/dogeforge";

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

let adminWalletAddress = null;
try {
  const { address, cookie } = await signIn();
  adminWalletAddress = address;
  psql(`INSERT INTO "AdminUser" (id, "address", "createdAt") VALUES ('fixscript_admin_${Date.now()}', '${address.toLowerCase()}', now());`);

  const chainId = psql(`SELECT id FROM "DepositChainConfig" WHERE "chainKey"='ERC20';`);
  if (!chainId) throw new Error("No ERC20 DepositChainConfig row found.");

  const preexisting = psql(`SELECT count(*) FROM "OnchainDeposit" WHERE chain='ERC20';`);
  console.log(`Existing ERC20 deposit records: ${preexisting} (should be 0 — this fix assumes no live deposits used the wrong decimals yet)`);

  const res = await fetch(`${BASE}/api/admin/settings/deposit-chains/${chainId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ evmChainId: 1, tokenDecimals: 6 }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`PATCH failed: ${JSON.stringify(body)}`);
  console.log("Updated ERC20 chain config:", JSON.stringify(body.row, null, 2));
} finally {
  if (adminWalletAddress) {
    psql(`DELETE FROM "AdminUser" WHERE "address"='${adminWalletAddress.toLowerCase()}';`);
  }
}
