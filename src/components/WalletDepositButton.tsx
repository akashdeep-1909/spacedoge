"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useSwitchChain, useWriteContract, useWaitForTransactionReceipt, useWatchAsset } from "wagmi";
import { parseUnits } from "viem";
import { waitForInjectedProvider, type wagmiConfig } from "@/lib/wagmi";
import { isUserRejectionError, useAuth } from "@/lib/auth-context";
import { useVerifyDeposit } from "@/lib/hooks";

// Wraps a wallet-prompting promise (network switch, transaction confirm)
// with a hard ceiling — without this, a wallet that never shows/responds
// to the prompt (a dropped mobile app-switch, a jammed request queue —
// the same failure mode documented at length in auth-context.tsx's
// signMessageAsync fix) leaves wagmi's own isPending/isSwitching flags
// stuck true FOREVER, since those reflect ONE specific promise that
// simply never settles. Both the amount input and the Deposit button are
// disabled while busy, with no cancel button here (unlike
// ConnectWalletButton's Disconnect escape hatch) — so a stuck isPending
// left the user with literally no way out except reloading the page.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

// wagmi's hooks are strongly typed against the exact chain-id union
// registered in wagmiConfig.chains (see src/lib/wagmi.ts), not a plain
// number — this component's `chainId` prop comes from a DB value
// (DepositChainConfig.evmChainId), so it's cast to that union at the
// two wagmi call sites below. Safe because the caller only renders
// this component when DEPOSIT_CAPABLE_EVM_CHAIN_IDS.has(evmChainId) is
// true (see the deposit page), i.e. the id is already known-registered
// by the time it gets here — Set.has() just doesn't narrow TS types.
type RegisteredChainId = (typeof wagmiConfig)["chains"][number]["id"];

// Minimal ERC20 fragment — only the one function this flow calls.
const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// Real on-chain transfer initiated from inside the app: enter an
// amount, confirm in your wallet, done — no manual copy/paste of the
// address into a separate wallet app. This still results in a real
// signed ERC20 transfer broadcast from the user's own connected
// wallet; the existing background watcher (src/lib/deposits.ts) picks
// it up and credits the Deposit Balance the same way it would for a deposit
// sent any other way — this button doesn't create a shortcut around
// that pipeline, it just triggers the same kind of transaction the
// user would otherwise have sent manually. Chain-agnostic across any
// EVM chain a DepositChainConfig row points at (see /admin/settings)
// — the caller passes which one.
export function WalletDepositButton({
  chainId,
  chainKey,
  chainLabel,
  treasuryAddress,
  tokenContract,
  tokenDecimals,
  minConfirmations,
}: {
  chainId: number;
  chainKey: string;
  chainLabel: string;
  treasuryAddress: string;
  tokenContract: string;
  tokenDecimals: number;
  minConfirmations: number;
}) {
  const { chainId: connectedChainId, isConnected } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { markWalletAction } = useAuth();
  // Own bounded busy state, deliberately NOT useConnect()'s own
  // isPending — same reasoning as ConnectWalletButton.tsx's own
  // `attempting` vs isPending: isPending reflects ONE specific
  // connectAsync() promise, which a dropped mobile app-switch can leave
  // permanently pending, wedging this button's disabled state forever
  // even after the timeout below gives up on that promise.
  const [reconnecting, setReconnecting] = useState(false);
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, data: txHash, reset } = useWriteContract();
  const { watchAssetAsync } = useWatchAsset();
  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    confirmations: 1, // just for "it landed" UI feedback — real crediting still waits for minConfirmations via the watcher
  });

  // Self-verify the moment this button's own transaction lands, instead
  // of purely waiting on the background cron watcher (src/lib/deposits.ts
  // syncAllDeposits). That watcher only scans FORWARD from the block it
  // happened to be at on a chain's first-ever sync cycle — a deposit
  // that landed at/before that exact moment (entirely possible for a
  // chain an admin just added, see the real incident this fixed) is
  // permanently invisible to it. This button already has the exact
  // txHash in hand right after sending, so it can call the same
  // hash-based verify the manual "paste tx hash" flow uses
  // (verifyDepositByTxHash — looks up the transaction directly via
  // eth_getTransactionReceipt, no cursor involved) instead of hoping the
  // passive watcher eventually notices. Idempotent either way
  // (creditIfReady keys on txHash, "already settled — never re-credit"),
  // so this can safely run alongside the cron with no double-credit risk.
  const verifyDeposit = useVerifyDeposit();
  const verifiedTxHash = useRef<string | null>(null);
  useEffect(() => {
    if (!receipt || !txHash || verifiedTxHash.current === txHash) return;
    verifiedTxHash.current = txHash;
    verifyDeposit.mutate({ txHash, chainKey });
  }, [receipt, txHash, chainKey, verifyDeposit]);

  const [amount, setAmount] = useState("10");
  const [error, setError] = useState<string | null>(null);
  // Own bounded busy state, deliberately NOT wagmi's isSwitching/isPending
  // (same reasoning as ConnectWalletButton's `attempting` vs useConnect's
  // isPending) — those reflect ONE specific promise each, which a stuck
  // wallet (no response, ever) leaves permanently true. This is always
  // guaranteed to clear via the timeout below or the try/finally.
  const [step, setStep] = useState<"idle" | "switching" | "sending">("idle");

  // A valid signed-in session (shown as "connected" in the header) is
  // not the same thing as wagmi having a LIVE wallet connection in
  // THIS browser tab right now — sending a real transaction needs the
  // latter specifically, and it can be missing even right after a
  // page reload while the session cookie is still perfectly valid.
  // Re-establish just the wagmi connection here (no new SIWE signature
  // — the user is already signed in) rather than showing a dead-end
  // "connect your wallet" message that contradicts the header.
  async function reconnect() {
    setError(null);
    // Tells auth-context.tsx's mobile-resume handler this app-switch is
    // wallet-related — without this, a WalletConnect app-switch
    // triggered from THIS button (rather than the main header Connect
    // button) fell outside the "was this recent enough to be relevant"
    // window, so returning from the wallet app only got a single bare
    // reconnectAsync() attempt instead of the same bounded
    // retry-with-backoff (and honest "Reconnecting…" state) every other
    // wallet-connect path already gets. See markWalletActionRef's own
    // doc-comment in auth-context.tsx.
    markWalletAction();
    // Same connector-selection rule as ConnectWalletButton.tsx — this
    // used to hardcode connectors[0] (always injected() by array order
    // in wagmi.ts), which silently tried to use an injected provider
    // that doesn't exist on a plain mobile browser tab, instead of
    // falling back to walletConnect() the way the main Connect button
    // already correctly does.
    const injectedAvailable = await waitForInjectedProvider();
    const targetConnector = injectedAvailable
      ? connectors.find((c) => c.type === "injected")
      : connectors.find((c) => c.type === "walletConnect");
    if (!targetConnector) {
      setError(injectedAvailable ? "No wallet extension found." : "Mobile wallet connect isn't configured.");
      return;
    }
    setReconnecting(true);
    try {
      // Bounded the same way ConnectWalletButton.tsx bounds its own
      // connectAsync() call (CONNECT_TIMEOUT_MS there, also 120s for the
      // same reason — a real device confirmed 30s routinely fires before
      // a user who takes their time approving in the wallet app ever
      // gets MetaMask's own auto-redirect back) — without this, a
      // dropped mobile app-switch left wagmi's own isPending stuck true
      // forever, since it reflects one specific promise that may simply
      // never settle, wedging this button permanently disabled with no
      // escape.
      await withTimeout(
        connectAsync({ connector: targetConnector }),
        120_000,
        "Wallet didn't respond in time. Please try again."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reconnect wallet.");
    } finally {
      setReconnecting(false);
    }
  }

  async function deposit() {
    setError(null);
    reset();
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    try {
      if (connectedChainId !== chainId) {
        setStep("switching");
        await switchToChainWithRetry();
      }
      // Best-effort only — most wallets have no cached metadata for an
      // arbitrary ERC20 contract, so without this the confirmation
      // screen shows "Sending 10 Unknown" instead of "10 USDT" (real,
      // observed MetaMask behavior on this exact flow). Never blocks
      // the actual transfer: an unsupported wallet, a dismissed
      // "add token?" prompt, or any other failure here is silently
      // swallowed and the deposit proceeds exactly as before.
      try {
        await watchAssetAsync({
          type: "ERC20",
          options: { address: tokenContract as `0x${string}`, decimals: tokenDecimals, symbol: "USDT" },
        });
      } catch {
        // Ignore — purely cosmetic, the transfer below is unaffected.
      }
      setStep("sending");
      // 120s, not 60 — same reasoning as ConnectWalletButton.tsx's
      // CONNECT_TIMEOUT_MS: a user actually reading and approving a real
      // transfer inside their wallet app can easily take longer than 60
      // seconds, especially on mobile with an app-switch round trip.
      await withTimeout(
        writeContractAsync({
          chainId: chainId as RegisteredChainId,
          address: tokenContract as `0x${string}`,
          abi: ERC20_TRANSFER_ABI,
          functionName: "transfer",
          args: [treasuryAddress as `0x${string}`, parseUnits(amount, tokenDecimals)],
        }),
        120_000,
        "Wallet didn't respond to the transaction request in time. Please try again."
      );
    } catch (err) {
      setError(explainError(err));
    } finally {
      setStep("idle");
    }
  }

  // EIP-1193 error 4901 ("Chain Disconnected") is a known MetaMask
  // quirk — the extension's own internal chain-state cache briefly
  // desyncs during a network switch (different from 4902 "chain not
  // added", which wagmi's connector already auto-handles by calling
  // wallet_addEthereumChain). It's transient by nature: retrying once
  // after a short delay resolves it in practice far more often than
  // surfacing it straight to the user as a dead end.
  async function switchToChainWithRetry() {
    const TIMEOUT_MSG = "Wallet didn't respond to the network switch request in time. Please try again.";
    try {
      await withTimeout(switchChainAsync({ chainId: chainId as RegisteredChainId }), 60_000, TIMEOUT_MSG);
    } catch (err) {
      if (!isChainDisconnectedError(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 800));
      await withTimeout(switchChainAsync({ chainId: chainId as RegisteredChainId }), 60_000, TIMEOUT_MSG);
    }
  }

  function isChainDisconnectedError(err: unknown): boolean {
    let e: unknown = err;
    for (let i = 0; i < 5 && e; i++) {
      if (typeof e === "object" && "code" in e && (e as { code?: number }).code === 4901) return true;
      e = typeof e === "object" && e && "cause" in e ? (e as { cause?: unknown }).cause : undefined;
    }
    return false;
  }

  function explainError(err: unknown): string {
    if (isChainDisconnectedError(err)) {
      return `Your wallet reported it isn't connected to ${chainLabel}. Open your wallet, switch networks manually, then try again.`;
    }
    // Some wallets (Phantom in particular) have much more limited EVM
    // network support than MetaMask and reject an unfamiliar chain
    // outright, in their own native UI, rather than adding it — no
    // retry fixes that, it needs a different wallet or a manual
    // settings change on the user's end.
    const message = err instanceof Error ? err.message : "";
    if (/unsupported network|does not currently support|does not support this chain/i.test(message)) {
      return `Your wallet doesn't support ${chainLabel}. If you're using Phantom, switch to MetaMask for this deposit (or in Phantom, turn off Settings → Default App Wallet and set it to "Always Ask"), then try again.`;
    }
    if (isUserRejectionError(err)) {
      return 'Transaction declined. If your wallet showed a "could not verify this site" warning, that\'s expected for local/unverified testing — look past it for the actual transaction to approve, then try again.';
    }
    return err instanceof Error ? err.message : "Transaction failed or was rejected.";
  }

  // `step` (our own bounded state, cleared via finally/timeout) drives
  // disabling, not wagmi's raw isSwitching/isPending — see withTimeout's
  // doc-comment for why those can get stuck true forever. isConfirming
  // is different and deliberately still used as-is: it only starts once
  // a transaction has ALREADY been broadcast (real hash in hand), so
  // it's tracking genuine on-chain confirmation time, not a wallet
  // prompt that could silently never resolve.
  const busy = step !== "idle" || isConfirming;

  return (
    <div className="rounded-xl border border-line bg-panel-2 p-3">
      <p className="text-xs font-bold uppercase tracking-widest text-mint">⚡ Deposit From Wallet</p>
      <p className="mt-1 text-xs text-muted">
        Sends a real {chainLabel} USDT transfer from your connected wallet — your wallet will ask
        you to confirm it, same as sending from any app.
      </p>
      {!isConnected ? (
        <button
          onClick={reconnect}
          disabled={reconnecting}
          className="btn-game mt-3 rounded-full px-4 py-2 text-sm disabled:opacity-50"
        >
          {reconnecting ? "Reconnecting…" : "Reconnect Wallet to Deposit"}
        </button>
      ) : (
        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-line bg-panel px-3 py-2 pl-6 text-sm"
            />
          </div>
          <button
            onClick={deposit}
            disabled={busy}
            className="btn-game shrink-0 rounded-full px-4 py-2 text-sm disabled:opacity-50"
          >
            {step === "switching"
              ? "Switch network…"
              : step === "sending"
                ? "Check wallet…"
                : isConfirming
                  ? "Confirming…"
                  : `Deposit $${amount || "0"}`}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-risk">{error}</p>}
      {receipt && (
        <p className="mt-2 text-xs text-mint">
          Sent — tx {txHash?.slice(0, 10)}…. Credited automatically after {minConfirmations}{" "}
          confirmations, tracked below.
        </p>
      )}
    </div>
  );
}
