// Verifies the deposit proof-of-reserves Merkle tree end-to-end:
//   1. Wallets with a known PLAY_USDT deposit balance get included in
//      the latest ReserveSnapshot with the correct balance.
//   2. Each wallet's own GET /api/wallet/reserve-proof only ever
//      returns ITS OWN leaf/proof — never anyone else's.
//   3. That leaf/proof independently re-verifies (using a standalone
//      re-implementation of the hashing/combine algorithm, not the
//      app's own src/lib/merkle.ts, so this is a genuine second
//      opinion) against the published merkleRoot.
//   4. Every test wallet's own proof verifies against the SAME root —
//      confirms they're all really part of one consistent tree.
//   5. A tampered proof FAILS verification (proves the check isn't a
//      no-op that would pass regardless).
//   6. A wallet with zero deposit balance gets a 404, not a leaf.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { keccak256, encodePacked, toHex } from "viem";
import { SiweMessage } from "siwe";
import { execSync } from "node:child_process";

const BASE = "http://localhost:3000";
const DB = process.env.DATABASE_URL?.replace(/\?.*$/, "") ?? "postgresql://postgres@localhost:5432/dogeforge";
const SCALE = 100_000_000; // 1e8, mirrors src/lib/merkle.ts RESERVE_BALANCE_SCALE

function log(label, ok, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? " — " + extra : ""}`);
  if (!ok) process.exitCode = 1;
}

function psql(sql) {
  return execSync(`psql "${DB}" -t -A -c "${sql.replace(/"/g, '\\"')}"`, { encoding: "utf8" }).trim();
}

// --- Standalone re-implementation of src/lib/merkle.ts's algorithm,
// deliberately not importing that file — this is meant to be a real
// second opinion, not a test that just re-runs the same code. ---
function combine(a, b) {
  const [lo, hi] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
  return keccak256(encodePacked(["bytes32", "bytes32"], [lo, hi]));
}
function hashLeaf(address, balanceScaled, nonce) {
  return keccak256(encodePacked(["address", "uint256", "bytes32"], [address, balanceScaled, nonce]));
}
function verifyProof(leafHash, proof, root) {
  let computed = leafHash;
  for (const sibling of proof) computed = combine(computed, sibling);
  return computed.toLowerCase() === root.toLowerCase();
}
// Standalone re-implementation of traceProof (src/lib/merkle.ts) — the
// "where in the tree" walk the wallet page's Verify button draws.
// Independently confirms leafIndex/totalLeafCount are consistent with
// the proof array by replaying the exact same left/right promotion
// rule buildTree used, then checking the result still lands on root.
function traceProofRoot(leafHash, proof, leafIndex, totalLeafCount) {
  let computed = leafHash;
  let index = leafIndex;
  let layerSize = totalLeafCount;
  let cursor = 0;
  while (layerSize > 1) {
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;
    if (siblingIndex < layerSize) {
      computed = combine(computed, proof[cursor++]);
    }
    index = Math.floor(index / 2);
    layerSize = Math.ceil(layerSize / 2);
  }
  return { root: computed, consumedAllProofEntries: cursor === proof.length };
}

async function signIn() {
  let cookie = "";
  const account = privateKeyToAccount(generatePrivateKey());
  const address = account.address;

  async function req(path, opts = {}) {
    const res = await fetch(BASE + path, {
      ...opts,
      headers: { ...(opts.headers || {}), ...(cookie ? { cookie } : {}) },
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    let body = null;
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
  return { address: address.toLowerCase(), req };
}

function walletProfileId(address) {
  return psql(`SELECT id FROM "WalletProfile" WHERE address = '${address}'`);
}

function creditPlayUsdt(walletProfileId, amount) {
  psql(
    `INSERT INTO "LedgerEntry" (id, "walletProfileId", "balanceType", amount, reason, "refType", "refId", "createdAt") ` +
      `VALUES ('test-merkle-${crypto.randomUUID()}', '${walletProfileId}', 'PLAY_USDT', ${amount}, 'test_credit_reserve_merkle', 'Manual', 'test', now())`
  );
}

function yesterdayUtcIso() {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

async function main() {
  // Clear yesterday's snapshot (if any) so a fresh build picks up our
  // new test wallets — otherwise an already-built snapshot from
  // earlier today would never be regenerated (by design — see
  // buildReserveSnapshotIfNeeded's lazy-trigger doc-comment).
  const snapshotDate = yesterdayUtcIso();
  const existingSnapshotId = psql(`SELECT id FROM "ReserveSnapshot" WHERE "snapshotDate" = '${snapshotDate}'`);
  if (existingSnapshotId) {
    psql(`DELETE FROM "ReserveSnapshotLeaf" WHERE "snapshotId" = '${existingSnapshotId}'`);
    psql(`DELETE FROM "ReserveSnapshot" WHERE id = '${existingSnapshotId}'`);
  }

  // Three wallets with known deposit balances, one with zero.
  const walletA = await signIn();
  const walletB = await signIn();
  const walletC = await signIn();
  const walletZero = await signIn();

  const idA = walletProfileId(walletA.address);
  const idB = walletProfileId(walletB.address);
  const idC = walletProfileId(walletC.address);
  const idZero = walletProfileId(walletZero.address);

  creditPlayUsdt(idA, 12.5);
  creditPlayUsdt(idB, 7.25);
  creditPlayUsdt(idC, 100);
  // walletZero gets no PLAY_USDT credit at all.

  const testWallets = [
    { label: "A", wallet: walletA, expectedBalance: 12.5 },
    { label: "B", wallet: walletB, expectedBalance: 7.25 },
    { label: "C", wallet: walletC, expectedBalance: 100 },
  ];

  const proofs = [];
  for (const { label, wallet, expectedBalance } of testWallets) {
    const { res, body } = await wallet.req("/api/wallet/reserve-proof");
    log(`Wallet ${label}: GET reserve-proof returns 200`, res.status === 200, `status=${res.status}`);
    log(
      `Wallet ${label}: returned balance matches credited amount`,
      Math.abs(body.balanceUsdt - expectedBalance) < 1e-6,
      `expected ${expectedBalance}, got ${body.balanceUsdt}`
    );
    log(`Wallet ${label}: response includes own address`, body.address === wallet.address);
    proofs.push({ label, body });
  }

  // Every test wallet's proof should point to the exact same root —
  // they're all leaves of the one snapshot built just now.
  const roots = new Set(proofs.map((p) => p.body.merkleRoot));
  log("All test wallets share the same published merkleRoot", roots.size === 1, `roots=${[...roots].join(",")}`);

  // Independent re-verification — standalone hashLeaf/verifyProof
  // above, not src/lib/merkle.ts.
  for (const { label, body } of proofs) {
    const balanceScaled = BigInt(Math.round(body.balanceUsdt * SCALE));
    const leafHash = hashLeaf(body.address, balanceScaled, body.nonce);
    const ok = verifyProof(leafHash, body.proof, body.merkleRoot);
    log(`Wallet ${label}: independently re-verified proof against published root`, ok);
  }

  // leafIndex/totalLeafCount — the tree-position data the wallet page's
  // "where in the tree" visualization draws from.
  const indices = proofs.map((p) => p.body.leafIndex);
  log(
    "All test wallets have distinct, in-range leafIndex values",
    new Set(indices).size === indices.length &&
      indices.every((i) => i >= 0 && i < proofs[0].body.totalLeafCount)
  );
  for (const { label, body } of proofs) {
    const balanceScaled = BigInt(Math.round(body.balanceUsdt * SCALE));
    const leafHash = hashLeaf(body.address, balanceScaled, body.nonce);
    const { root: tracedRoot, consumedAllProofEntries } = traceProofRoot(
      leafHash,
      body.proof,
      body.leafIndex,
      body.totalLeafCount
    );
    log(
      `Wallet ${label}: traceProof (tree-position walk) lands on the published root`,
      tracedRoot.toLowerCase() === body.merkleRoot.toLowerCase() && consumedAllProofEntries
    );
  }

  // Negative test — tamper with one proof entry, must fail.
  const sample = proofs[0].body;
  const tamperedProof = sample.proof.length > 0 ? [...sample.proof] : [toHex(new Uint8Array(32))];
  if (sample.proof.length > 0) {
    const flipped = tamperedProof[0].slice(0, -1) + (tamperedProof[0].slice(-1) === "0" ? "1" : "0");
    tamperedProof[0] = flipped;
  }
  const tamperedLeaf = hashLeaf(sample.address, BigInt(Math.round(sample.balanceUsdt * SCALE)), sample.nonce);
  const tamperedOk = verifyProof(tamperedLeaf, tamperedProof, sample.merkleRoot);
  log("Tampered proof correctly FAILS verification", tamperedOk === false);

  // A wallet with zero deposit balance is not in the tree at all.
  const { res: zeroRes } = await walletZero.req("/api/wallet/reserve-proof");
  log("Wallet with no deposit gets 404 (not included in the tree)", zeroRes.status === 404, `status=${zeroRes.status}`);

  // DB cross-check: the snapshot row's own merkleRoot matches what
  // every proof endpoint returned.
  const dbRoot = psql(`SELECT "merkleRoot" FROM "ReserveSnapshot" WHERE "snapshotDate" = '${snapshotDate}'`);
  log("DB ReserveSnapshot.merkleRoot matches API-returned root", dbRoot === sample.merkleRoot);

  // --- Cleanup ---
  const snapshotId = psql(`SELECT id FROM "ReserveSnapshot" WHERE "snapshotDate" = '${snapshotDate}'`);
  if (snapshotId) {
    psql(`DELETE FROM "ReserveSnapshotLeaf" WHERE "snapshotId" = '${snapshotId}'`);
    psql(`DELETE FROM "ReserveSnapshot" WHERE id = '${snapshotId}'`);
  }
  for (const id of [idA, idB, idC, idZero]) {
    psql(`DELETE FROM "LedgerEntry" WHERE "walletProfileId" = '${id}'`);
    psql(`DELETE FROM "WalletProfile" WHERE id = '${id}'`);
  }
  console.log("Cleanup complete — test wallets, ledger entries, and the test-influenced snapshot removed.");

  if (process.exitCode === 1) {
    console.log("\n❌ SMOKE TEST FAILED");
  } else {
    console.log("\n✅ ALL CHECKS PASSED");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
