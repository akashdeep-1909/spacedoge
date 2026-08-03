import { randomBytes } from "crypto";
import { toHex, type Hex } from "viem";
import { db } from "@/lib/db";
import { hashLeaf, buildTree, getProof, verifyProof, scaleBalance } from "@/lib/merkle";

function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function yesterdayUtc(): Date {
  return utcDayStart(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

const ZERO_ROOT = ("0x" + "0".repeat(64)) as Hex;

// Builds yesterday's deposit-reserve Merkle snapshot the first time
// anything asks for it — same lazy-trigger convention
// settleYesterdayIfNeeded() (src/lib/mining.ts) already uses for
// MiningEpoch: one immutable row per UTC day, cheap no-op once today's
// "yesterday" is already built. Called from both the public /pool page
// and the authenticated reserve-proof API route, so a snapshot exists
// regardless of which one a visitor happens to hit first.
export async function buildReserveSnapshotIfNeeded() {
  const snapshotDate = yesterdayUtc();
  const existing = await db.reserveSnapshot.findUnique({ where: { snapshotDate } });
  if (existing) return existing;

  // Every wallet's PLAY_USDT deposit balance, in one pass — only
  // PLAY_USDT represents actual deposited money (see BalanceType's own
  // comments in prisma/schema.prisma), same "reconstruct from the
  // ledger" convention getWalletBalances() (src/lib/balances.ts) uses
  // per-wallet, just grouped across every wallet at once here.
  const sums = await db.ledgerEntry.groupBy({
    by: ["walletProfileId"],
    where: { balanceType: "PLAY_USDT" },
    _sum: { amount: true },
  });

  const wallets = await db.walletProfile.findMany({
    where: { id: { in: sums.map((s) => s.walletProfileId) } },
    select: { id: true, address: true },
  });
  const addressById = new Map(wallets.map((w) => [w.id, w.address]));

  // Only wallets with a real, positive deposit balance get a leaf —
  // nothing to prove for a zero balance, and it keeps the tree from
  // growing with wallets that never funded anything.
  const entries = sums
    .map((s) => ({
      walletProfileId: s.walletProfileId,
      address: addressById.get(s.walletProfileId),
      balanceUsdt: Number(s._sum.amount ?? 0),
    }))
    .filter(
      (e): e is { walletProfileId: string; address: string; balanceUsdt: number } =>
        e.address != null && e.balanceUsdt > 0
    );

  if (entries.length === 0) {
    // Nothing to prove yet (no deposits at all) — still record an
    // honest, empty snapshot rather than silently having no row for
    // the day.
    return db.reserveSnapshot.create({
      data: { snapshotDate, merkleRoot: ZERO_ROOT, totalWallets: 0, totalDepositUsdt: 0 },
    });
  }

  const nonces = entries.map(() => toHex(randomBytes(32)));
  const leafHashes = entries.map((e, i) => hashLeaf(e.address, scaleBalance(e.balanceUsdt), nonces[i]));
  const tree = buildTree(leafHashes);

  // Defensive self-check — never publish a root that doesn't actually
  // verify against its own proofs. Runs the exact same verifyProof()
  // a user's browser will run later, so a bug here fails loudly now
  // instead of silently shipping a root nobody can actually verify.
  entries.forEach((_, i) => {
    const proof = getProof(tree.layers, i);
    if (!verifyProof(leafHashes[i], proof, tree.root)) {
      throw new Error(`buildReserveSnapshotIfNeeded: self-check failed for leaf ${i}`);
    }
  });

  const totalDepositUsdt = entries.reduce((sum, e) => sum + e.balanceUsdt, 0);

  return db.$transaction(async (tx) => {
    const snapshot = await tx.reserveSnapshot.create({
      data: { snapshotDate, merkleRoot: tree.root, totalWallets: entries.length, totalDepositUsdt },
    });
    await tx.reserveSnapshotLeaf.createMany({
      data: entries.map((e, i) => ({
        snapshotId: snapshot.id,
        walletProfileId: e.walletProfileId,
        balanceUsdt: e.balanceUsdt,
        nonce: nonces[i],
        leafHash: leafHashes[i],
        proof: getProof(tree.layers, i),
        leafIndex: i,
      })),
    });
    return snapshot;
  });
}

// Public summary for the /pool page — never includes any per-wallet
// data, just the aggregate the root was built from.
export async function getLatestReserveSnapshotSummary() {
  await buildReserveSnapshotIfNeeded();
  const snapshot = await db.reserveSnapshot.findFirst({ orderBy: { snapshotDate: "desc" } });
  if (!snapshot) return null;
  return {
    snapshotDateIso: snapshot.snapshotDate.toISOString(),
    merkleRoot: snapshot.merkleRoot,
    totalWallets: snapshot.totalWallets,
    totalDepositUsdt: Number(snapshot.totalDepositUsdt),
  };
}

// A single wallet's own proof — never touches any other wallet's leaf.
// Returns null if this wallet has no deposit balance in the latest
// snapshot (e.g. never deposited, or deposited after the snapshot was
// taken — it'll appear starting the next day's snapshot).
export async function getWalletReserveProof(walletProfileId: string) {
  await buildReserveSnapshotIfNeeded();
  const snapshot = await db.reserveSnapshot.findFirst({
    orderBy: { snapshotDate: "desc" },
    include: { leaves: { where: { walletProfileId } } },
  });
  if (!snapshot || snapshot.leaves.length === 0) return null;
  const leaf = snapshot.leaves[0];
  return {
    snapshotDateIso: snapshot.snapshotDate.toISOString(),
    merkleRoot: snapshot.merkleRoot,
    balanceUsdt: Number(leaf.balanceUsdt),
    nonce: leaf.nonce,
    proof: leaf.proof as string[],
    // Lets the client replay the exact left/right tree structure for
    // the "where in the tree" visualization (src/lib/merkle.ts
    // traceProof) — totalLeafCount is the snapshot-wide total, never
    // any other wallet's individual data.
    leafIndex: leaf.leafIndex,
    totalLeafCount: snapshot.totalWallets,
  };
}
