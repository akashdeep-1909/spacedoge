import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { BalanceType, DepositStatus, DepositSource } from "@/generated/prisma/enums";
import { getDepositChainConfigs, getDepositChainConfig } from "@/lib/settings";
import type { DepositChainConfig, DepositTreasuryAddress } from "@/generated/prisma/client";

// Deterministic bucket for a given key (a wallet's id) into one of
// `bucketCount` slots — same key always maps to the same bucket for a
// given bucketCount, and a SHA-256-derived value spreads keys evenly
// across buckets (no need for cryptographic strength here, just a
// stable, well-distributed hash). Used to split users across a chain's
// address pool: with 1 address everyone lands in bucket 0; with 2,
// roughly half land in each; with 3, roughly a third each; and so on —
// changing bucketCount (adding/removing a pool address) reshuffles the
// split automatically, no persisted assignment needed.
function stableBucket(key: string, bucketCount: number): number {
  const digest = createHash("sha256").update(key).digest();
  return digest.readUInt32BE(0) % bucketCount;
}

// This wallet's deposit address for this chain, right now — computed
// fresh every call, not persisted. Deliberately stateless: crediting a
// deposit never depended on which pool address the funds land on in
// the first place (src/lib/deposits.ts's creditIfReady matches by the
// SENDER's address against WalletProfile), so which address a wallet
// is CURRENTLY pointed at is free to change whenever the pool's size
// changes — the watcher (getAddressesToWatch below) keeps scanning
// every address ever added regardless of whether it's anyone's current
// pick, so a deposit sent to a wallet's PREVIOUS address (from before a
// reshuffle) still gets picked up and credited correctly.
//
// Returns null only when the chain has zero pool addresses configured
// at all — the caller shows "ask an admin to add a deposit address"
// rather than pretending one exists.
export async function getDepositAddressForWallet(
  walletProfileId: string,
  chainConfigId: string
): Promise<DepositTreasuryAddress | null> {
  const addresses = await db.depositTreasuryAddress.findMany({
    where: { chainConfigId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (addresses.length === 0) return null;
  return addresses[stableBucket(walletProfileId, addresses.length)];
}

// Multi-chain on-chain deposit watching. Two independent kinds:
//
// - EVM chains (BEP20 today, any other EVM chain an admin adds via
//   /admin/settings): the platform's treasury address is a normal
//   wallet address, incoming transfers are found read-only via each
//   chain's own JSON-RPC node (eth_getLogs for ERC20 Transfer events),
//   never touching that wallet's private key. Attribution needs no
//   memo/reference code: every user already proved ownership of their
//   EVM address via SIWE to log in, so we match a transfer's `from`
//   address straight against WalletProfile.address.
//
// - TRON chains (TRC20): polled via TronGrid's public REST API instead
//   of raw RPC (Tron isn't EVM — different address format, different
//   node API entirely). IMPORTANT LIMITATION: this app only ever
//   proves EVM-address ownership at login (SIWE) — there is no
//   "connect your Tron wallet" step — so a Tron deposit's `from`
//   address can never match an existing WalletProfile. Every TRC20
//   deposit therefore lands UNMATCHED and needs an admin's manual
//   assign (src/app/api/admin/deposits/[id]/assign), same fallback
//   path an EVM deposit from an unrecognized sender already uses
//   today. Real self-service Tron auto-crediting needs a separate
//   Tron-wallet-linking feature (TronLink connect + signature proof),
//   not just this watcher.
//
// A deposit from an address with no matching profile is recorded as
// UNMATCHED (visible for support/reconciliation) but never credited.

// keccak256("Transfer(address,address,uint256)") — identical across
// every ERC20/BEP20 token, not specific to the USDT contract.
const TRANSFER_TOPIC0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
// Most free public EVM RPC nodes cap eth_getLogs at a small block
// range per call (confirmed empirically against 1RPC.io: 50 blocks).
// Stay under that with margin — applies to whichever RPC a given
// DepositChainConfig row points at.
const MAX_BLOCK_RANGE = 40;
// Cap on how many block-range chunks one sync call will walk through
// per chain, so a long-down watcher catches up gradually across
// several polls instead of one call blocking for a very long backlog.
const MAX_CHUNKS_PER_SYNC = 20;

let rpcId = 0;
const RPC_TIMEOUT_MS = 10_000;

async function evmRpcCallOnce<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: ++rpcId }),
    cache: "no-store",
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`RPC error: ${body.error.message}`);
  return body.result as T;
}

// Free public RPC nodes, several per chain id — used as fallbacks
// alongside (not instead of) a DepositChainConfig row's own `rpcUrl`.
// Previously this was ONE hardcoded URL per chain: fine as long as that
// single node stayed up, but confirmed live to fail for extended
// stretches (rate limiting, an outage) with no fallback at all, turning
// a real, already-mined deposit into a repeating "couldn't reach the
// blockchain" for however long that one node was down. Falls back to an
// empty list for any chain id not in this map — callers must then
// either have a configured rpcUrl or skip the cycle, never silently
// guess.
const DEFAULT_EVM_RPC_URLS: Record<number, string[]> = {
  1: ["https://1rpc.io/eth", "https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com"], // Ethereum mainnet
  56: ["https://1rpc.io/bnb", "https://bsc-rpc.publicnode.com", "https://bsc-dataseed.binance.org"], // BSC
  137: ["https://1rpc.io/matic", "https://polygon-rpc.com", "https://polygon-bor-rpc.publicnode.com"], // Polygon
};

// All URLs worth trying for this chain, in priority order: the admin's
// own configured node first (if set — presumably the most trustworthy/
// dedicated one), then every known free public fallback for that EVM
// chain id. Returns [] (not undefined) when there's genuinely nothing
// to try, so callers can treat "not configured" and "configured but
// every URL is currently down" as the two distinct cases they are.
function resolveRpcUrls(config: DepositChainConfig): string[] {
  const fallbacks = config.evmChainId ? DEFAULT_EVM_RPC_URLS[config.evmChainId] ?? [] : [];
  return config.rpcUrl ? [config.rpcUrl, ...fallbacks] : fallbacks;
}

// Free public RPC nodes blip — and sometimes go down or rate-limit for
// extended stretches — often enough in practice that retrying the SAME
// node twice isn't enough: confirmed live, a real, already-mined
// transaction repeatedly came back "rpc_error" for minutes on end
// because the one configured/defaulted node was unreachable, even
// though the transaction was fine and any other node (or a block
// explorer) could see it immediately. Trying every configured/fallback
// URL for this chain (see resolveRpcUrls below) before giving up — and
// only THEN doing one more full pass after a short delay for a blip
// that hits all of them at once — turns "one flaky free node" from a
// hard failure into a non-event. Every failure (including the final
// one) is logged with the real underlying error and which URL it hit —
// callers still only see a generic status, but this is what makes a
// report like "verify says unreachable" diagnosable server-side instead
// of a dead end.
async function evmRpcCall<T>(rpcUrls: string[], method: string, params: unknown[]): Promise<T> {
  let lastErr: unknown;
  for (const url of rpcUrls) {
    try {
      return await evmRpcCallOnce<T>(url, method, params);
    } catch (err) {
      lastErr = err;
      console.error(`[deposits] RPC call failed on ${url}: ${method}`, err);
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  for (const url of rpcUrls) {
    try {
      return await evmRpcCallOnce<T>(url, method, params);
    } catch (err) {
      lastErr = err;
      console.error(`[deposits] RPC retry failed on ${url}: ${method}`, err);
    }
  }
  throw lastErr;
}

// Converts a raw hex wei-style integer (e.g. "0x1158e460913d00000")
// to a decimal number at the given token precision, preserving exact
// digits via string arithmetic before the final parse — a direct
// BigInt->Number cast would silently lose precision for large amounts
// (raw 18-decimal integers routinely exceed Number's safe integer range).
function hexAmountToDecimal(hex: string, decimals: number): number {
  const raw = BigInt(hex);
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = (raw % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
  return Number(frac ? `${whole}.${frac}` : `${whole}`);
}

// Last 20 bytes of a 32-byte topic is the address it encodes.
function topicToAddress(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

interface TransferLog {
  topics: string[];
  data: string;
  transactionHash: string;
  blockNumber: string;
}

// Module-level throttle so a burst of dashboard page loads (each of
// which lazily triggers a sync) can't hammer free RPC/API endpoints. A
// real cron hitting /api/wallet/deposit-watch bypasses this by calling
// syncAllDeposits({ force: true }).
let lastSyncedAt = 0;
const MIN_SYNC_INTERVAL_MS = 20_000;

export async function syncAllDeposits(opts: { force?: boolean } = {}): Promise<void> {
  if (!opts.force && Date.now() - lastSyncedAt < MIN_SYNC_INTERVAL_MS) return;
  lastSyncedAt = Date.now();

  const configs = await getDepositChainConfigs({ enabledOnly: true });
  // Promise.allSettled — one chain's RPC/API outage shouldn't stop the
  // others from syncing this cycle.
  await Promise.allSettled(
    configs.map((config) => (config.kind === "TRON" ? syncTronChain(config) : syncEvmChain(config)))
  );
}

// Every address the watcher must keep scanning for a chain — every row
// in the pool, assigned or not. Watching an unassigned one is harmless
// (creditIfReady matches by the SENDER's address against WalletProfile,
// not by which pool address received it, so nothing credits until a
// real matching wallet actually deposits there anyway).
async function getAddressesToWatch(chainConfigId: string): Promise<Set<string>> {
  const rows = await db.depositTreasuryAddress.findMany({
    where: { chainConfigId },
    select: { address: true },
  });
  return new Set(rows.map((r) => r.address.toLowerCase()));
}

async function syncEvmChain(config: DepositChainConfig): Promise<void> {
  const rpcUrls = resolveRpcUrls(config);
  if (rpcUrls.length === 0) {
    console.error(`[deposits] No RPC URL configured or defaulted for chain ${config.chainKey} (evmChainId=${config.evmChainId}) — set one in /admin/settings.`);
    return;
  }
  const tokenContract = config.tokenContract.toLowerCase();
  const watchedAddresses = await getAddressesToWatch(config.id);
  if (watchedAddresses.size === 0) return; // no pool addresses configured yet — nothing to watch

  let latestBlock: number;
  try {
    const latestHex = await evmRpcCall<string>(rpcUrls, "eth_blockNumber", []);
    latestBlock = parseInt(latestHex, 16);
  } catch {
    return; // every configured/fallback RPC unreachable this cycle — try again on the next poll
  }

  // Re-check every still-PENDING deposit on this chain against the
  // current chain head BEFORE the forward-only scan below — a PENDING
  // row's confirmations count is a snapshot from whenever it was first
  // recorded (either by this same forward scan, or by a user's own
  // verify-by-hash call), and the forward scan never revisits a block
  // range once it's moved past it. Without this, a deposit that landed
  // with fewer than minConfirmations at that moment would sit PENDING
  // forever with a stale count — confirmed live as exactly the "stuck
  // on pending, never credits" report — even though the chain keeps
  // confirming it every block. This is what actually clears it,
  // independent of whether the depositing user's browser tab is even
  // still open to keep polling client-side.
  await recheckPendingEvmDeposits(config, rpcUrls, latestBlock);

  const cursor = await db.depositWatcherCursor.findUnique({ where: { chain: config.chainKey } });
  if (!cursor) {
    // First run: nothing to catch up on yet (chain was just
    // configured) — start watching forward from now, not a
    // multi-million-block backfill from genesis.
    await db.depositWatcherCursor.create({
      data: { chain: config.chainKey, lastBlock: BigInt(latestBlock) },
    });
    return;
  }

  let fromBlock = Number(cursor.lastBlock) + 1;
  if (fromBlock > latestBlock) return; // nothing new yet

  let chunks = 0;
  let scannedTo = Number(cursor.lastBlock);
  while (fromBlock <= latestBlock && chunks < MAX_CHUNKS_PER_SYNC) {
    const toBlock = Math.min(fromBlock + MAX_BLOCK_RANGE - 1, latestBlock);
    try {
      // Deliberately no `to`-address topic filter here (unlike the
      // single-treasury-address version this replaced) — with a POOL of
      // addresses, one per user, filtering server-side per address would
      // mean one eth_getLogs call PER ASSIGNED USER per poll cycle,
      // which scales with user count instead of with chain activity and
      // would blow through a free RPC's rate limit almost immediately
      // once there are more than a handful of users. Fetching every
      // Transfer of this token in the block range once, then matching
      // `to` against the watched-address set in JS below, keeps this at
      // exactly one RPC call per chain per poll regardless of pool size
      // — the tradeoff is a busier token can return more log rows per
      // call, bounded by MAX_BLOCK_RANGE same as before.
      const logs = await evmRpcCall<TransferLog[]>(rpcUrls, "eth_getLogs", [
        {
          address: tokenContract,
          topics: [TRANSFER_TOPIC0],
          fromBlock: `0x${fromBlock.toString(16)}`,
          toBlock: `0x${toBlock.toString(16)}`,
        },
      ]);
      for (const log of logs) {
        const to = topicToAddress(log.topics[2]);
        if (!watchedAddresses.has(to)) continue;
        const from = topicToAddress(log.topics[1]);
        const blockNumber = parseInt(log.blockNumber, 16);
        const confirmations = Math.max(0, latestBlock - blockNumber + 1);
        const amount = hexAmountToDecimal(log.data, config.tokenDecimals);
        await creditIfReady({
          chainKey: config.chainKey,
          txHash: log.transactionHash,
          from,
          treasury: to,
          amount,
          confirmations,
          minConfirmations: config.minConfirmations,
          source: DepositSource.WATCHER,
        });
      }
      scannedTo = toBlock;
    } catch {
      break; // stop this sync; unscanned range stays unscanned for the next poll (cursor only advances past what succeeded)
    }
    fromBlock = toBlock + 1;
    chunks++;
  }

  if (scannedTo > Number(cursor.lastBlock)) {
    await db.depositWatcherCursor.update({
      where: { chain: config.chainKey },
      data: { lastBlock: BigInt(scannedTo) },
    });
  }
}

// See the call site in syncEvmChain above for the full "why". One
// eth_getTransactionReceipt per still-PENDING row on this chain, each
// cycle, feeding an up-to-date confirmations count back through the
// exact same creditIfReady() crediting logic the forward scan uses —
// PENDING rows are expected to be few and short-lived (they only exist
// between "found, not yet confirmed enough" and "confirmed", typically
// well under a minute), so this stays cheap even on a free RPC node.
async function recheckPendingEvmDeposits(config: DepositChainConfig, rpcUrls: string[], latestBlock: number): Promise<void> {
  const pending = await db.onchainDeposit.findMany({
    where: { chain: config.chainKey, status: DepositStatus.PENDING },
  });
  if (pending.length === 0) return;

  interface TransactionReceipt {
    status: string;
    blockNumber: string;
  }

  for (const dep of pending) {
    try {
      const receipt = await evmRpcCall<TransactionReceipt | null>(rpcUrls, "eth_getTransactionReceipt", [dep.txHash]);
      if (!receipt || receipt.status === "0x0") continue; // not mined (shouldn't happen for an already-recorded row) or reverted since — leave it for a human to look at, don't touch its status here
      const blockNumber = parseInt(receipt.blockNumber, 16);
      const confirmations = Math.max(0, latestBlock - blockNumber + 1);
      if (confirmations <= dep.confirmations) continue; // no new information yet this cycle
      await creditIfReady({
        chainKey: config.chainKey,
        txHash: dep.txHash,
        from: dep.fromAddress,
        treasury: dep.toAddress,
        amount: Number(dep.amount),
        confirmations,
        minConfirmations: config.minConfirmations,
        source: DepositSource.WATCHER,
      });
    } catch (err) {
      // One stuck row's lookup failing shouldn't stop the rest from
      // being rechecked this cycle — it just stays PENDING and gets
      // tried again next poll, same as any other RPC hiccup here.
      console.error(`[deposits] recheck failed for pending deposit ${dep.txHash}`, err);
    }
  }
}

interface TronGridTrc20Transfer {
  transaction_id: string;
  token_info: { address: string; decimals: number; symbol: string };
  from: string;
  to: string;
  type: string;
  value: string;
  block_timestamp: number;
}

function tronGridHeaders(): HeadersInit {
  const apiKey = process.env.TRONGRID_API_KEY;
  return apiKey ? { "TRON-PRO-API-KEY": apiKey } : {};
}

// TronGrid's own API returns each transfer with everything needed
// (amount, decimals, timestamp) — no manual log-decoding or block
// cursor required like the EVM path, and it reports finality directly
// rather than a confirmation count, so "confirmed" IS the crediting
// gate for Tron (config.minConfirmations doesn't apply here).
//
// Unlike the EVM watcher above, this genuinely needs one call PER
// watched address — TronGrid's endpoint is scoped to a single account,
// there's no "any of these addresses" equivalent to eth_getLogs's
// contract-wide scan. That scales with pool size rather than chain
// activity, same tradeoff the EVM path deliberately avoids — acceptable
// here specifically because Tron deposits are already manual-assign-
// only (see this file's top-of-file note: no linked-Tron-wallet means
// nothing here ever self-credits), so pool sizes are expected to stay
// modest. If Tron pools grow large enough to strain TronGrid's rate
// limit, that's the point to revisit this.
async function syncTronChain(config: DepositChainConfig): Promise<void> {
  const watchedAddresses = await getAddressesToWatch(config.id);
  if (watchedAddresses.size === 0) return;
  await Promise.allSettled([...watchedAddresses].map((address) => syncTronAddress(config, address)));
}

async function syncTronAddress(config: DepositChainConfig, address: string): Promise<void> {
  let transfers: TronGridTrc20Transfer[];
  try {
    const res = await fetch(
      `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20?limit=50&only_to=true&contract_address=${config.tokenContract}`,
      { headers: tronGridHeaders(), cache: "no-store" }
    );
    if (!res.ok) return;
    const body = await res.json();
    transfers = body.data ?? [];
  } catch {
    return; // TronGrid unreachable this cycle — try again on the next poll
  }

  for (const t of transfers) {
    if (t.type !== "Transfer") continue;
    const decimals = t.token_info?.decimals ?? config.tokenDecimals;
    const amount = Number(t.value) / 10 ** decimals;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    // TronGrid's `only_confirmed` filter isn't reliable across API
    // versions — every returned transfer from this endpoint is already
    // on a finalized block in practice, so treat presence here as
    // confirmed (mirrors TronGrid's own documented behavior for this
    // endpoint) rather than gating on a separate confirmations count.
    await creditIfReady({
      chainKey: config.chainKey,
      txHash: t.transaction_id,
      from: t.from,
      treasury: address,
      amount,
      confirmations: 1,
      minConfirmations: 1,
      source: DepositSource.WATCHER,
    });
  }
}

// Returns the resulting OnchainDeposit row (existing scanning-loop
// callers don't need it, but verifyDepositByTxHash below does — it's
// the same crediting logic run against a single user-submitted hash
// instead of a scanned range, and needs to report back what happened).
async function creditIfReady(input: {
  chainKey: string;
  txHash: string;
  from: string;
  treasury: string;
  amount: number;
  confirmations: number;
  minConfirmations: number;
  // How this row was first discovered — see DepositSource's own
  // doc-comment in schema.prisma. Only ever written on the row's FIRST
  // creation (below), never on an update: it records how the deposit
  // was first noticed, not who most recently re-checked it. A watcher
  // scan and a user's own verify-by-hash call can both legitimately
  // race to find the same brand-new transaction — whichever wins the
  // upsert's `create` branch is what actually happened first, and that's
  // the answer worth keeping.
  source: DepositSource;
}) {
  const { chainKey, txHash, from, treasury, amount, confirmations, minConfirmations, source } = input;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return db.$transaction(async (trx) => {
    const existing = await trx.onchainDeposit.findUnique({ where: { txHash } });
    if (existing?.status === DepositStatus.CREDITED) return existing; // already settled — never re-credit

    const walletProfile = await trx.walletProfile.findUnique({ where: { address: from.toLowerCase() } });
    const shouldCredit = confirmations >= minConfirmations && Boolean(walletProfile);
    const status = shouldCredit
      ? DepositStatus.CREDITED
      : walletProfile
      ? DepositStatus.PENDING
      : DepositStatus.UNMATCHED;

    const deposit = await trx.onchainDeposit.upsert({
      where: { txHash },
      create: {
        chain: chainKey,
        txHash,
        fromAddress: from,
        toAddress: treasury,
        amount,
        confirmations,
        status,
        source,
        walletProfileId: walletProfile?.id,
      },
      update: {
        confirmations,
        status,
        walletProfileId: walletProfile?.id ?? existing?.walletProfileId,
        creditedAt: shouldCredit ? new Date() : undefined,
      },
    });

    if (shouldCredit) {
      await trx.ledgerEntry.create({
        data: {
          walletProfileId: walletProfile!.id,
          balanceType: BalanceType.PLAY_USDT,
          amount,
          reason: `${chainKey.toLowerCase()}_usdt_deposit`,
          refType: "OnchainDeposit",
          refId: deposit.id,
        },
      });
    }

    return deposit;
  });
}

export type VerifyDepositResult =
  | { status: "not_configured" }
  | { status: "invalid_hash" }
  | { status: "rpc_error" }
  | { status: "not_found" } // not mined yet (or a typo'd hash) — receipt doesn't exist on-chain
  | { status: "failed_tx" } // mined but reverted — never a real transfer
  | { status: "no_matching_transfer" } // mined, but no matching USDT Transfer to our treasury in this tx
  | { status: "sent_from_different_wallet" } // real transfer, but `from` doesn't match any account (or a different one than the caller)
  | { status: "tron_needs_manual_review" } // real Tron transfer found — can't self-verify without a linked Tron wallet, needs an admin
  | {
      status: "credited" | "pending";
      amount: number;
      confirmations: number;
      minConfirmations: number;
    };

// The manual, on-demand counterpart to syncAllDeposits' background
// scan for a single chain: looks up exactly one transaction by hash
// (EVM: eth_getTransactionReceipt; Tron: TronGrid's transaction-info
// endpoint) and runs it through the same creditIfReady() crediting
// logic, so a user who sent a real deposit doesn't have to wait for
// the next lazy poll.
//
// `source` distinguishes the two real UI callers of this same function
// (see /api/wallet/deposit-verify's own request body) — WalletDepositButton's
// automatic post-send lookup (AUTO_VERIFY, no one pasted anything) versus
// the dashboard's own "Already sent it?" box (MANUAL_VERIFY, the user
// typed/pasted the hash themselves). Recorded on the resulting
// OnchainDeposit row so /admin/deposits can show which is which.
export async function verifyDepositByTxHash(
  txHash: string,
  callerWalletProfileId: string,
  chainKey: string,
  source: typeof DepositSource.AUTO_VERIFY | typeof DepositSource.MANUAL_VERIFY
): Promise<VerifyDepositResult> {
  const config = await getDepositChainConfig(chainKey);
  if (!config || !config.enabled) return { status: "not_configured" };

  if (config.kind === "TRON") return verifyTronDeposit(txHash, config, source);
  return verifyEvmDeposit(txHash, config, callerWalletProfileId, source);
}

async function verifyEvmDeposit(
  txHash: string,
  config: DepositChainConfig,
  callerWalletProfileId: string,
  source: typeof DepositSource.AUTO_VERIFY | typeof DepositSource.MANUAL_VERIFY
): Promise<VerifyDepositResult> {
  const hash = txHash.trim().toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(hash)) return { status: "invalid_hash" };

  const rpcUrls = resolveRpcUrls(config);
  if (rpcUrls.length === 0) return { status: "rpc_error" };
  const tokenContract = config.tokenContract.toLowerCase();
  const watchedAddresses = await getAddressesToWatch(config.id);

  interface TransactionReceipt {
    status: string;
    blockNumber: string;
    logs: (TransferLog & { address: string })[];
  }

  let receipt: TransactionReceipt | null;
  let latestBlock: number;
  try {
    [receipt, latestBlock] = await Promise.all([
      evmRpcCall<TransactionReceipt | null>(rpcUrls, "eth_getTransactionReceipt", [hash]),
      evmRpcCall<string>(rpcUrls, "eth_blockNumber", []).then((hex) => parseInt(hex, 16)),
    ]);
  } catch {
    return { status: "rpc_error" };
  }

  if (!receipt) return { status: "not_found" };
  if (receipt.status === "0x0") return { status: "failed_tx" };

  const log = receipt.logs.find(
    (l) =>
      l.address?.toLowerCase() === tokenContract &&
      l.topics[0]?.toLowerCase() === TRANSFER_TOPIC0 &&
      watchedAddresses.has(topicToAddress(l.topics[2]))
  );
  if (!log) return { status: "no_matching_transfer" };

  const to = topicToAddress(log.topics[2]);
  const from = topicToAddress(log.topics[1]);
  const blockNumber = parseInt(log.blockNumber, 16);
  const confirmations = Math.max(0, latestBlock - blockNumber + 1);
  const amount = hexAmountToDecimal(log.data, config.tokenDecimals);

  const deposit = await creditIfReady({
    chainKey: config.chainKey,
    txHash: hash,
    from,
    treasury: to,
    amount,
    confirmations,
    minConfirmations: config.minConfirmations,
    source,
  });
  if (!deposit) return { status: "no_matching_transfer" }; // amount parsed as 0/invalid — treat like no real transfer

  if (!deposit.walletProfileId || deposit.walletProfileId !== callerWalletProfileId) {
    return { status: "sent_from_different_wallet" };
  }

  return {
    status: deposit.status === DepositStatus.CREDITED ? "credited" : "pending",
    amount: Number(deposit.amount),
    confirmations: deposit.confirmations,
    minConfirmations: config.minConfirmations,
  };
}

// Tron transactions can be looked up and their real on-chain transfer
// confirmed, but — per this file's top-of-file note — never
// self-attributed to the calling user without a linked Tron wallet, so
// this always ends in either a not-found/no-match status or
// "tron_needs_manual_review" (never "credited"/"pending" directly to
// the caller). It still runs the transfer through creditIfReady() so a
// real, matching deposit is recorded and visible to admins immediately
// rather than waiting for the next background poll.
async function verifyTronDeposit(
  txHash: string,
  config: DepositChainConfig,
  source: typeof DepositSource.AUTO_VERIFY | typeof DepositSource.MANUAL_VERIFY
): Promise<VerifyDepositResult> {
  const hash = txHash.trim();
  if (!/^[a-fA-F0-9]{64}$/.test(hash)) return { status: "invalid_hash" };

  const watchedAddresses = [...(await getAddressesToWatch(config.id))];
  if (watchedAddresses.length === 0) return { status: "no_matching_transfer" };

  let info: { contractRet?: string } | null;
  let transfer: TronGridTrc20Transfer | undefined;
  let treasury: string | undefined;
  try {
    // Same "one call per watched address" constraint as syncTronAddress
    // above — TronGrid's transfers endpoint is scoped to a single
    // account, so finding which of our pool addresses (if any) this tx
    // hash paid means checking each one for a match.
    const [infoRes, ...transfersResList] = await Promise.all([
      fetch(`https://api.trongrid.io/wallet/gettransactioninfobyid`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...tronGridHeaders() },
        body: JSON.stringify({ value: hash }),
        cache: "no-store",
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      }),
      ...watchedAddresses.map((address) =>
        fetch(
          `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20?limit=50&only_to=true&contract_address=${config.tokenContract}`,
          { headers: tronGridHeaders(), cache: "no-store", signal: AbortSignal.timeout(RPC_TIMEOUT_MS) }
        )
      ),
    ]);
    if (!infoRes.ok) {
      console.error(`[deposits] TronGrid verify HTTP error: info=${infoRes.status}`);
      return { status: "rpc_error" };
    }
    info = await infoRes.json();
    for (let i = 0; i < transfersResList.length; i++) {
      const res = transfersResList[i];
      if (!res.ok) continue; // one address's lookup failing shouldn't sink checking the rest
      const body = await res.json();
      const found = (body.data ?? []).find((t: TronGridTrc20Transfer) => t.transaction_id === hash);
      if (found) {
        transfer = found;
        treasury = watchedAddresses[i];
        break;
      }
    }
  } catch (err) {
    console.error("[deposits] TronGrid verify failed", err);
    return { status: "rpc_error" };
  }

  if (!info || Object.keys(info).length === 0) return { status: "not_found" };
  if (!transfer || !treasury) return { status: "no_matching_transfer" };

  const decimals = transfer.token_info?.decimals ?? config.tokenDecimals;
  const amount = Number(transfer.value) / 10 ** decimals;

  const deposit = await creditIfReady({
    chainKey: config.chainKey,
    txHash: hash,
    from: transfer.from,
    treasury,
    amount,
    confirmations: 1,
    minConfirmations: 1,
    source,
  });
  if (!deposit) return { status: "no_matching_transfer" };

  return { status: "tron_needs_manual_review" };
}

// Admin-only manual override for UNMATCHED/PENDING deposits — e.g. a
// user deposited from an exchange withdrawal address (or any Tron
// deposit, per this file's top-of-file note) that doesn't match their
// login wallet's SIWE address, so automatic matching in creditIfReady()
// above never fires. Same idempotency guarantee: a deposit already
// CREDITED is rejected outright, never re-credited.
export async function manuallyCreditDeposit(depositId: string, walletProfileId: string) {
  return db.$transaction(async (trx) => {
    const deposit = await trx.onchainDeposit.findUnique({ where: { id: depositId } });
    if (!deposit) throw new Error("Deposit not found");
    if (deposit.status === DepositStatus.CREDITED) throw new Error("Deposit already credited");

    const walletProfile = await trx.walletProfile.findUnique({ where: { id: walletProfileId } });
    if (!walletProfile) throw new Error("Wallet profile not found");

    const updated = await trx.onchainDeposit.update({
      where: { id: depositId },
      data: {
        walletProfileId,
        status: DepositStatus.CREDITED,
        creditedAt: new Date(),
        // Deliberately overwrites whatever source was already on the
        // row (unlike creditIfReady's create-only write above) — see
        // DepositSource's own doc-comment: an admin having to manually
        // resolve this one is the fact worth recording here, regardless
        // of how it was originally noticed (e.g. the watcher saw it but
        // it sat UNMATCHED until an admin stepped in).
        source: DepositSource.ADMIN_ASSIGN,
      },
    });

    await trx.ledgerEntry.create({
      data: {
        walletProfileId,
        balanceType: BalanceType.PLAY_USDT,
        amount: deposit.amount,
        reason: `${deposit.chain.toLowerCase()}_usdt_deposit_manual`,
        refType: "OnchainDeposit",
        refId: deposit.id,
      },
    });

    return updated;
  });
}
