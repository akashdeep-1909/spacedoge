"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { waitForInjectedProvider, type wagmiConfig } from "@/lib/wagmi";
import { isUserRejectionError, useAuth } from "@/lib/auth-context";
import { useVerifyDeposit, type VerifyDepositResult } from "@/lib/hooks";
import { OpenInWalletAppLink } from "@/components/OpenInWalletAppLink";
import { markPendingDepositReturn, clearPendingDepositReturn } from "@/lib/depositReturn";

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
}: {
  chainId: number;
  chainKey: string;
  chainLabel: string;
  treasuryAddress: string;
  tokenContract: string;
  tokenDecimals: number;
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
  const { writeContractAsync, reset } = useWriteContract();

  // The pending hash being verified — deliberately its OWN state, not
  // read straight off useWriteContract()'s own `data`. Confirmed live
  // root cause of "auto-verify (and even manually pasting the hash)
  // does nothing": on mobile, a real app-switch to the wallet and back
  // can reload this page (Safari/Chrome routinely do this for a
  // backgrounded tab, and some wallet deep-link return flows are a real
  // navigation, not just a foreground/background toggle) — that wipes
  // ALL in-memory React state, including whatever useWriteContract()
  // was holding, before this component ever gets a chance to verify the
  // transaction it just sent. Persisting the hash to localStorage the
  // MOMENT it's known (not after waiting for a receipt — the server's
  // own verify already does its own eth_getTransactionReceipt lookup,
  // it doesn't need this component to also confirm one first) and
  // restoring it on mount means verification survives that reload and
  // picks up exactly where it left off, instead of silently going
  // nowhere.
  const pendingKey = `spacedoge:pending-deposit:${chainKey}`;
  const [pendingTxHash, setPendingTxHash] = useState<`0x${string}` | null>(null);
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: pendingTxHash ?? undefined,
    confirmations: 1, // cosmetic "it landed" button label only — real crediting never waits on this, see below
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(pendingKey);
    if (stored && /^0x[a-f0-9]{64}$/i.test(stored)) {
      // Deliberately a mount-time effect, not a useState lazy
      // initializer that reads localStorage directly: this is a
      // "use client" component that still gets server-rendered for the
      // initial HTML (window/localStorage don't exist there), so a
      // lazy initializer would return a DIFFERENT value between the
      // server pass and the client's hydration pass — a real hydration
      // mismatch, since pendingTxHash being set-or-not changes what
      // actually renders (the AutoVerifyStatus block below). Starting
      // both passes at null, then syncing from localStorage once
      // mounted client-side, is the textbook-correct effect use case
      // (see react.dev/learn/you-might-not-need-an-effect's own
      // "Effects DO synchronize with external systems" section) —
      // eslint's react-hooks/set-state-in-effect rule flags this
      // pattern generically regardless of legitimacy.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingTxHash(stored as `0x${string}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only restore, deliberately not re-run if chainKey changes after mount (a new instance renders for a different chain anyway)
  }, []);

  function rememberPending(hash: `0x${string}`) {
    setPendingTxHash(hash);
    try {
      window.localStorage.setItem(pendingKey, hash);
    } catch {
      // Private browsing / storage disabled — verification still runs
      // for this page's own remaining lifetime, it just won't survive
      // a reload. Not worth failing the deposit over.
    }
  }

  function forgetPending() {
    try {
      window.localStorage.removeItem(pendingKey);
    } catch {
      // Same as above — nothing to clean up if it was never stored.
    }
  }

  // Self-verify the moment a hash is known (fresh from a send, or
  // restored from a reload above), instead of purely waiting on the
  // background cron watcher (src/lib/deposits.ts syncAllDeposits). That
  // watcher only scans FORWARD from the block it happened to be at on a
  // chain's first-ever sync cycle — a deposit that landed at/before that
  // exact moment (entirely possible for a chain an admin just added, see
  // the real incident this fixed) is permanently invisible to it. This
  // button already has the exact txHash in hand, so it can call the same
  // hash-based verify the manual "paste tx hash" flow uses
  // (verifyDepositByTxHash — looks up the transaction directly via
  // eth_getTransactionReceipt, no cursor involved) instead of hoping the
  // passive watcher eventually notices. Idempotent either way
  // (creditIfReady keys on txHash, "already settled — never re-credit"),
  // so this can safely run alongside the cron with no double-credit risk.
  //
  // Retried on "not_found"/"rpc_error" specifically (confirmed live root
  // cause of deposits silently requiring the manual "paste tx hash" box
  // even after using this button): the server verifies via ITS OWN
  // configured RPC node (DepositChainConfig.rpcUrl / a free public
  // fallback — see resolveRpcUrl in deposits.ts), a completely different
  // node from whatever the user's own wallet/dapp provider used to
  // report the receipt here. That server-side node routinely lags a few
  // seconds behind — a single verify attempt fired the instant this hash
  // is known can easily race ahead of it and come back "not found" even
  // though the transaction is real and already mined. Every other status
  // (credited, pending, or a genuine terminal failure like failed_tx /
  // sent_from_different_wallet) is definitive and NOT retried.
  const verifyDeposit = useVerifyDeposit();
  const verifiedTxHash = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_AUTO_VERIFY_RETRIES = 6; // ~2 minutes total across the backoff below — generous for a slow free RPC node to catch up
  const [autoVerifyGaveUp, setAutoVerifyGaveUp] = useState(false);

  useEffect(() => {
    if (!pendingTxHash) return;
    if (verifiedTxHash.current !== pendingTxHash) {
      verifiedTxHash.current = pendingTxHash;
      retryCountRef.current = 0;
      setAutoVerifyGaveUp(false);
      verifyDeposit.mutate({ txHash: pendingTxHash, chainKey, source: "auto" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately excludes verifyDeposit (a new mutation object identity every render would otherwise re-fire this)
  }, [pendingTxHash, chainKey]);

  useEffect(() => {
    if (!pendingTxHash || verifiedTxHash.current !== pendingTxHash) return;
    const result = verifyDeposit.data;
    if (!result) return; // no result yet — nothing to act on
    if (!("error" in result)) {
      // credited or pending — a real, matched deposit is on record
      // either way, so this hash no longer needs to survive a reload.
      forgetPending();
      return;
    }
    if (result.status !== "not_found" && result.status !== "rpc_error") {
      forgetPending(); // a genuine terminal failure — retrying won't change it
      return;
    }
    if (retryCountRef.current >= MAX_AUTO_VERIFY_RETRIES) {
      setAutoVerifyGaveUp(true);
      return; // keep it persisted — the manual box (or a future page load) can still pick this hash back up
    }
    retryCountRef.current += 1;
    // 5s, 8s, 12s, 18s, 27s, 40s — gives a slow public RPC node
    // increasing room to catch up without hammering it every tick.
    const delayMs = 5000 * Math.pow(1.5, retryCountRef.current - 1);
    retryTimerRef.current = setTimeout(() => {
      verifyDeposit.mutate({ txHash: pendingTxHash, chainKey, source: "auto" });
    }, delayMs);
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- verifyDeposit.data is the real trigger; verifyDeposit itself is a stable-enough mutate ref for this purpose
  }, [verifyDeposit.data, pendingTxHash, chainKey]);

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
    // See src/lib/depositReturn.ts's own doc-comment for the full "why"
    // — set BEFORE either wallet-prompting step below (network switch
    // or the transfer itself), since either one can be what triggers a
    // mobile app-switch that redirects back to the bare homepage
    // instead of this page. Cleared in the finally block below only —
    // if we reach that normally (no page reload happened in between),
    // we're demonstrably still on this same page and don't need it.
    markPendingDepositReturn();
    try {
      if (connectedChainId !== chainId) {
        setStep("switching");
        await switchToChainWithRetry();
      }
      setStep("sending");
      // Deliberately no watchAsset ("add token to wallet") step here
      // anymore — it was a SEPARATE wallet prompt before the real
      // transfer one, and on mobile each wallet prompt is its own full
      // app-switch round trip. Two prompts meant two round trips
      // (confirmed live as "very inconvenient": add-token screen, back
      // to spacedoge, back to the wallet again for the actual confirm).
      // It was already purely cosmetic (nicer "10 USDT" vs "10 Unknown"
      // on the confirm screen) — not worth doubling the app-switch cost
      // of every single deposit for.
      //
      // 120s, not 60 — same reasoning as ConnectWalletButton.tsx's
      // CONNECT_TIMEOUT_MS: a user actually reading and approving a real
      // transfer inside their wallet app can easily take longer than 60
      // seconds, especially on mobile with an app-switch round trip.
      const hash = await withTimeout(
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
      // Persisted immediately — not after also waiting for a receipt —
      // specifically so a mobile app-switch-triggered reload right after
      // this point (before this component would otherwise have gotten a
      // chance to see its own receipt land) still has the hash saved to
      // resume verifying on the next mount. See rememberPending's own
      // call site (the mount-restore effect above) for the full reasoning.
      rememberPending(hash);
    } catch (err) {
      setError(explainError(err));
    } finally {
      setStep("idle");
      clearPendingDepositReturn();
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
      return 'Transaction declined. If your wallet showed a "could not verify this site" warning, look past it for the actual transaction to approve, then try again.';
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
        <div className="mt-3 flex flex-col items-start gap-1.5">
          <button
            onClick={reconnect}
            disabled={reconnecting}
            className="btn-game rounded-full px-4 py-2 text-sm disabled:opacity-50"
          >
            {reconnecting ? "Reconnecting…" : "Reconnect Wallet to Deposit"}
          </button>
          <OpenInWalletAppLink />
        </div>
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
      {pendingTxHash && (
        <AutoVerifyStatus result={verifyDeposit.data} isPending={verifyDeposit.isPending} gaveUp={autoVerifyGaveUp} txHash={pendingTxHash} />
      )}
    </div>
  );
}

// Surfaces what the auto-verify-on-receipt effect above is actually
// doing — previously nothing here rendered verifyDeposit's result or
// error at all, so a failed/retrying attempt (see that effect's own
// doc-comment on the "not_found"/"rpc_error" race with the server's own,
// often-laggier RPC node) was completely invisible: the user just saw a
// generic "Sent" message forever, with no way to tell a slow-but-fine
// confirmation apart from a silently-abandoned one.
function AutoVerifyStatus({
  result,
  isPending,
  gaveUp,
  txHash,
}: {
  result: VerifyDepositResult | undefined;
  isPending: boolean;
  gaveUp: boolean;
  txHash: `0x${string}` | undefined;
}) {
  const short = txHash ? `${txHash.slice(0, 10)}…` : "";

  if (!result || isPending) {
    return (
      <p className="mt-2 text-xs text-mint">
        Sent — tx {short}. Confirming with our server…
      </p>
    );
  }
  if (!("error" in result)) {
    return result.status === "credited" ? (
      <p className="mt-2 text-xs text-mint">✅ Credited — ${result.amount.toFixed(2)} added to your balance.</p>
    ) : (
      <p className="mt-2 text-xs text-gold">
        ⏳ Found on-chain — {result.confirmations}/{result.minConfirmations} confirmations, tracked below.
      </p>
    );
  }
  if (result.status === "not_found" || result.status === "rpc_error") {
    if (gaveUp) {
      return (
        <p className="mt-2 text-xs text-risk">
          Still not confirmed after several tries (a slow RPC node, most likely — your transaction is
          real, this is just our server catching up). Paste tx {short} into the box below to check
          again.
        </p>
      );
    }
    return (
      <p className="mt-2 text-xs text-mint">
        Sent — tx {short}. Confirming with our server… (this can take up to ~2 minutes on a busy network)
      </p>
    );
  }
  // Any other status is a genuine terminal outcome — retrying won't
  // change it, so show it plainly instead of a generic "confirming".
  return (
    <p className="mt-2 text-xs text-risk">
      {result.error}
    </p>
  );
}
