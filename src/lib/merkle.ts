// Pure Merkle tree functions for the deposit proof-of-reserves feature
// (see prisma/schema.prisma's ReserveSnapshot/ReserveSnapshotLeaf doc-
// comments and src/lib/reserve-snapshot.ts for the full picture). No
// `db` import — safe to ship to the client bundle as-is, so the exact
// same verifyProof() the server uses to self-check a snapshot before
// publishing it is also what runs in a user's own browser
// (src/components/wallet/ReserveProofCard.tsx) to check their own
// leaf, with no server trust required for that final step.
import { keccak256, encodePacked, isAddress, type Hex } from "viem";

// One leaf = one wallet's PLAY_USDT deposit balance — the only
// BalanceType that represents actual deposited money (see that enum's
// own comments in prisma/schema.prisma). balanceScaled is the ledger
// sum x 1e8 (matching LedgerEntry.amount's own Decimal(24,8)
// precision) as a BigInt, never a float, so hashing is deterministic.
// nonce is a per-leaf random 32-byte hex salt (generated in
// src/lib/reserve-snapshot.ts) that keeps a small round balance from
// being brute-forced out of the public root/proof alone.
export function hashLeaf(address: string, balanceScaled: bigint, nonce: Hex): Hex {
  if (!isAddress(address)) throw new Error(`hashLeaf: invalid address ${address}`);
  return keccak256(encodePacked(["address", "uint256", "bytes32"], [address, balanceScaled, nonce]));
}

// Sorted-pair combine — the two children are hashed in ascending
// order before combining, same convention OpenZeppelin's MerkleProof
// library uses. This makes verification independent of left/right
// position, so a proof is just an ordered list of sibling hashes, no
// direction bits needed alongside it.
function combine(a: Hex, b: Hex): Hex {
  const [lo, hi] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
  return keccak256(encodePacked(["bytes32", "bytes32"], [lo, hi]));
}

export interface MerkleTree {
  root: Hex;
  layers: Hex[][]; // layers[0] = leaves, layers[last] = [root]
}

// Builds every layer bottom-up. An unpaired odd node at any layer is
// carried up unchanged (promoted as-is to the next layer) rather than
// duplicated — duplicating a lone node is a known weakness in naive
// Merkle implementations (it lets a proof be replayed for a forged
// "sibling" that's really just the same leaf again); carrying it up
// unpaired avoids that entirely.
export function buildTree(leaves: Hex[]): MerkleTree {
  if (leaves.length === 0) throw new Error("buildTree: at least one leaf required");
  const layers: Hex[][] = [leaves];
  let current = leaves;
  while (current.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push(i + 1 < current.length ? combine(current[i], current[i + 1]) : current[i]);
    }
    layers.push(next);
    current = next;
  }
  return { root: current[0], layers };
}

// Sibling-hash path from a leaf up to the root. No sibling is pushed
// at a level where the leaf's node was promoted unpaired (see
// buildTree above) — verifyProof below still lands on the right root
// either way, since combine() is only ever called where a real
// sibling exists.
export function getProof(layers: Hex[][], leafIndex: number): Hex[] {
  const proof: Hex[] = [];
  let index = leafIndex;
  for (let level = 0; level < layers.length - 1; level++) {
    const layer = layers[level];
    const isRightNode = index % 2 === 1;
    const siblingIndex = isRightNode ? index - 1 : index + 1;
    if (siblingIndex < layer.length) proof.push(layer[siblingIndex]);
    index = Math.floor(index / 2);
  }
  return proof;
}

// Recombines sorted pairs up the proof path and compares to root —
// the one function both the server (self-check right after building a
// snapshot, before publishing it) and the client (a user's own
// verification) run, so there's no second implementation to drift out
// of sync with this one.
export function verifyProof(leafHash: Hex, proof: Hex[], root: Hex): boolean {
  let computed = leafHash;
  for (const sibling of proof) computed = combine(computed, sibling);
  return computed.toLowerCase() === root.toLowerCase();
}

export interface TraceStep {
  level: number;
  currentHash: Hex;
  siblingHash: Hex;
  // Structural position only (which side of the pair this node was on
  // before the sorted-pair combine) — purely for drawing the path in
  // src/components/wallet/ReserveProofCard.tsx. Never affects the hash
  // itself; combine() always sorts regardless of this flag.
  currentIsLeft: boolean;
  resultHash: Hex;
}

// Same walk verifyProof() does, but stops to record every real combine
// step for the tree-position visualization
// (src/components/wallet/ReserveProofCard.tsx) — renders only this
// wallet's own path; the "sibling" at each step is shown as a generic
// hash, never attributed to any other wallet, since that's all this
// function (or the server) ever knows about it either.
//
// leafIndex/totalLeafCount let this replay the exact same left/right
// structure buildTree/getProof used, without needing the full tree
// (which would require every other wallet's data). A level only
// produces a visible step where getProof actually found a real
// sibling — an unpaired node promoted up unchanged (see buildTree's
// own doc-comment) produces no step here either, for the same reason
// verifyProof never calls combine() for it.
export function traceProof(
  leafHash: Hex,
  proof: Hex[],
  leafIndex: number,
  totalLeafCount: number
): { steps: TraceStep[]; computedRoot: Hex } {
  const steps: TraceStep[] = [];
  let computed = leafHash;
  let index = leafIndex;
  let layerSize = totalLeafCount;
  let proofCursor = 0;
  while (layerSize > 1) {
    const isRightNode = index % 2 === 1;
    const siblingIndex = isRightNode ? index - 1 : index + 1;
    if (siblingIndex < layerSize) {
      const siblingHash = proof[proofCursor++];
      const resultHash = combine(computed, siblingHash);
      steps.push({ level: steps.length, currentHash: computed, siblingHash, currentIsLeft: !isRightNode, resultHash });
      computed = resultHash;
    }
    index = Math.floor(index / 2);
    layerSize = Math.ceil(layerSize / 2);
  }
  return { steps, computedRoot: computed };
}

// Shared scale factor — LedgerEntry.amount is Decimal(24,8), so this
// is the largest power of 10 that precision supports. Both the
// snapshot builder and the API route that serves a proof back to its
// owner need this same constant to reproduce the same leaf hash.
export const RESERVE_BALANCE_SCALE = 100_000_000; // 1e8

export function scaleBalance(balanceUsdt: number): bigint {
  return BigInt(Math.round(balanceUsdt * RESERVE_BALANCE_SCALE));
}
