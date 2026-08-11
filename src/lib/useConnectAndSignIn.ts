"use client";

import { useRef, useState } from "react";
import { useAccount, useConnect } from "wagmi";
import { useAuth, isUserRejectionError } from "@/lib/auth-context";
import { walletLog, errorDetails } from "@/lib/walletLog";
import { waitForInjectedProvider } from "@/lib/wagmi";

// Extracted out of ConnectWalletButton so any other CTA that links to a
// gated /dashboard/* route (marketing page "Play"/"Dashboard" buttons,
// see GatedLink.tsx) can trigger the exact same connect+SIWE flow
// instead of just navigating and bouncing an unconnected visitor off
// dashboard/layout.tsx's server-side redirect. Every timing/retry
// quirk documented here was found on a real device — kept byte-for-byte
// the same as the original ConnectWalletButton implementation.
const CONNECT_TIMEOUT_MS = 120_000;

function isTransientRelayError(err: unknown): boolean {
  return err instanceof Error && /WebSocket connection failed/i.test(err.message);
}

function isAlreadyConnectedError(err: unknown): boolean {
  return err instanceof Error && (err.name === "ConnectorAlreadyConnectedError" || /already connected/i.test(err.message));
}

// MetaMask (and most injected wallets) allow at most one pending
// wallet_requestPermissions/eth_requestAccounts request per origin —
// this is what a SECOND connect attempt collides with while an earlier
// prompt is still sitting open and un-acted-on (e.g. the user tapped
// Connect Wallet, didn't notice the popup, and clicked it again). viem
// surfaces this as ResourceUnavailableRpcError, code -32002. Unlike a
// genuine failure, the fix here isn't "try again" (that repeats the
// exact same collision) — it's "go find the prompt that's already
// open," which is different enough from every other failure message
// below to need its own copy.
function isRequestAlreadyPendingError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: unknown }).code;
  return code === -32002 || /already pending|already processing/i.test(err.message);
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useConnectAndSignIn() {
  const { address, chainId } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { signIn, markWalletAction } = useAuth();
  const [connectFailure, setConnectFailure] = useState<string | null>(null);
  const [attempting, setAttempting] = useState(false);
  const attemptIdRef = useRef(0);
  // Synchronous re-entrancy guard, set at the very top of the function
  // before any `await`. `attempting` (React state) can't do this job on
  // its own: it only flips true after waitForInjectedProvider's own
  // await (up to 1.5s), leaving a real window where the Connect button
  // isn't disabled yet and an impatient extra click/tap fires a second,
  // fully concurrent connectAndSignIn() — two overlapping connectAsync()
  // calls hitting the wallet's single-flight-per-origin request queue at
  // once, the same class of "already pending" collision documented on
  // isRequestAlreadyPendingError below, just from a different source.
  const inFlightRef = useRef(false);

  async function connectAndSignIn() {
    if (inFlightRef.current) {
      walletLog("connectAndSignIn skipped — already in flight");
      return;
    }
    inFlightRef.current = true;
    const myAttemptId = ++attemptIdRef.current;
    markWalletAction();
    setConnectFailure(null);
    const injectedAvailable = await waitForInjectedProvider();
    const targetConnector = injectedAvailable
      ? connectors.find((c) => c.type === "injected")
      : connectors.find((c) => c.type === "walletConnect");

    walletLog("connect attempt", {
      injectedAvailable,
      connectorId: targetConnector?.id,
      connectorName: targetConnector?.name,
      attemptId: myAttemptId,
    });

    if (!targetConnector) {
      inFlightRef.current = false;
      setConnectFailure(
        injectedAvailable
          ? "No wallet extension found."
          : "No wallet extension found, and mobile wallet connect isn't configured yet — open this page inside your wallet app's own browser instead."
      );
      return;
    }

    setAttempting(true);
    try {
      // No manual wallet_requestPermissions call here — the injected()
      // connector (src/lib/wagmi.ts) already does that internally via
      // its default shimDisconnect: true, as its own first step inside
      // connectAsync() below. A duplicate call used to live here; see
      // wagmi.ts's note at the old requestFreshInjectedAccounts site for
      // why it was removed (it raced the connector's own internal call
      // for MetaMask's single-flight-per-origin request slot, which is
      // what made connecting need "2-3 tries" to actually go through).
      let result;
      const MAX_RELAY_RETRIES = 2;
      for (let relayAttempt = 0; ; relayAttempt++) {
        try {
          result = await Promise.race([
            connectAsync({ connector: targetConnector }),
            new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error("Connection timed out. Please try again.")), CONNECT_TIMEOUT_MS);
            }),
          ]);
          break;
        } catch (err) {
          const willRetry = isTransientRelayError(err) && relayAttempt < MAX_RELAY_RETRIES;
          walletLog("connectAsync attempt failed", { relayAttempt, willRetry, ...errorDetails(err) });
          if (!willRetry) throw err;
          await delay(600 * (relayAttempt + 1));
        }
      }
      walletLog("connectAsync resolved", { accounts: result.accounts, chainId: result.chainId, attemptId: myAttemptId });
      if (attemptIdRef.current !== myAttemptId) {
        walletLog("connect attempt superseded, skipping signIn", { attemptId: myAttemptId });
        return;
      }
      await signIn(result.accounts[0], result.chainId);
    } catch (err) {
      walletLog("connect attempt failed", { attemptId: myAttemptId, ...errorDetails(err) });
      if (isAlreadyConnectedError(err) && address && chainId != null) {
        walletLog("connector already connected, signing in directly", { attemptId: myAttemptId, address, chainId });
        if (attemptIdRef.current === myAttemptId) await signIn(address, chainId);
      } else if (attemptIdRef.current === myAttemptId) {
        setConnectFailure(
          isTransientRelayError(err)
            ? "Couldn't reach the wallet network — check your connection and try again."
            : isRequestAlreadyPendingError(err)
              ? "Your wallet already has a connection request open — open the extension (or your wallet app) and approve or dismiss it, then tap Connect Wallet again."
              : isUserRejectionError(err)
                ? "Connection request declined. If your wallet showed a \"could not verify this site\" warning, look past it for the actual connect request, then tap Connect Wallet again."
                : err instanceof Error
                  ? err.message
                  : "Failed to connect wallet."
        );
      }
    } finally {
      inFlightRef.current = false;
      if (attemptIdRef.current === myAttemptId) setAttempting(false);
    }
  }

  return { connectAndSignIn, attempting, connectFailure, setConnectFailure };
}
