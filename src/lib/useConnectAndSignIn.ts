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

  async function connectAndSignIn() {
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
      setConnectFailure(
        injectedAvailable
          ? "No wallet extension found."
          : "No wallet extension found, and mobile wallet connect isn't configured yet — open this page inside your wallet app's own browser instead."
      );
      return;
    }

    setAttempting(true);
    try {
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
            : isUserRejectionError(err)
              ? "Connection request declined. If your wallet showed a \"could not verify this site\" warning, look past it for the actual connect request, then tap Connect Wallet again."
              : err instanceof Error
                ? err.message
                : "Failed to connect wallet."
        );
      }
    } finally {
      if (attemptIdRef.current === myAttemptId) setAttempting(false);
    }
  }

  return { connectAndSignIn, attempting, connectFailure, setConnectFailure };
}
