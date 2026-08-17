"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useAccount,
  useAccountEffect,
  useConfig,
  useReconnect,
  useSignMessage,
  useDisconnect,
} from "wagmi";
import { SiweMessage } from "siwe";
import { walletLog, errorDetails } from "@/lib/walletLog";
import {
  isStaleWalletConnectError,
  consumeWalletConnectAutoRecoveredFlag,
  recoverFromStaleWalletConnectSession,
} from "@/lib/walletConnectReset";
import { markWalletReturnPath } from "@/lib/walletReturnPath";
import { revokeInjectedPermissions } from "@/lib/wagmi";

// iOS Safari kills in-flight fetch() connections when a tab backgrounds
// — even briefly, which is exactly what happens mid-request during the
// app-switch-to-MetaMask-and-back dance this sign-in flow requires
// twice (once for connect, once for the signature). WebKit surfaces
// that as `TypeError: Load failed` (Chrome's equivalent wording is
// "Failed to fetch"), thrown from fetch() itself, not a bad HTTP
// status — confirmed via the wallet debug log on a real device: connect
// and signMessageAsync both genuinely succeeded, then the very next
// fetch (POST /api/auth/verify) died with exactly this error immediately
// after the signature app-switch's resume signal fired. `keepalive:
// true` is the browser-native fix for "let this request finish even if
// the page/tab is being backgrounded or unloaded" (originally built for
// sendBeacon-style analytics pings, applies just as well here); wrapping
// with a couple of retries on top covers whatever keepalive still misses.
function isNetworkFetchError(err: unknown): boolean {
  return err instanceof TypeError && /load failed|failed to fetch|network ?error/i.test(err.message);
}

// viem's UserRejectedRequestError (code 4001, per EIP-1193) is the
// wallet's OWN verbatim response — never something our code or a
// timeout synthesizes — so this only fires when MetaMask itself
// reported the request as declined. Its raw .message is still ugly to
// show as-is: "User rejected the request. Details: {\"code\":4001,...}
// Version: viem@2.55.2" (confirmed via a real-device screenshot). On a
// local IP specifically, MetaMask can't verify the site's identity (no
// real domain to check), which can show a "could not verify this site"
// warning ahead of the actual approve screen — easy to dismiss/reject
// by mistake. Swapped for one clear, actionable sentence either way.
export function isUserRejectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "UserRejectedRequestError") return true;
  const code = (err as { code?: unknown }).code;
  return code === 4001 || /user rejected/i.test(err.message);
}

// How long after a user-initiated wallet action (tapping Connect,
// signIn() starting) a following app-resume is still treated as
// "probably related to that" — see lastWalletActionAtRef in AuthProvider.
const RESUME_RELEVANCE_WINDOW_MS = 5 * 60_000;

async function fetchResilient(input: string, init: RequestInit, maxRetries = 2): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(input, { ...init, keepalive: true });
    } catch (err) {
      const willRetry = isNetworkFetchError(err) && attempt < maxRetries;
      walletLog("fetch failed", { url: input, attempt, willRetry, ...errorDetails(err) });
      if (!willRetry) throw err;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
}

export interface SessionInfo {
  authenticated: boolean;
  address?: string;
  chainId?: number;
  countryCode?: string | null;
  ageConfirmed?: boolean;
  termsVersion?: string | null;
  dogeAddress?: string | null;
  nickname?: string | null;
  requiresOnboarding?: boolean;
}

interface AuthContextValue {
  session: SessionInfo | null;
  status: "idle" | "signing" | "verifying" | "error";
  error: string | null;
  // True while recovering a connection after returning from a wallet
  // app (see the mobile-resume handler in AuthProvider below).
  resuming: boolean;
  // True for one render right after a page load that followed an
  // automatic WalletConnect corruption recovery — lets the UI explain
  // "we just fixed a stuck connection, please reconnect" instead of
  // silently looking like a plain failure.
  justAutoRecovered: boolean;
  // Optional overrides let the connect picker chain straight into
  // sign-in with the address/chainId `connectAsync` just resolved,
  // instead of waiting a render cycle for useAccount() to catch up —
  // reading the hook's own (possibly stale) state is only correct for
  // the standalone "Sign In" button on an already-connected wallet.
  signIn: (overrideAddress?: string, overrideChainId?: number) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  // Call the moment a wallet-connect attempt starts (before connectAsync
  // even runs) so the mobile-resume handler knows a following app-switch
  // is relevant — see lastWalletActionAtRef in AuthProvider.
  markWalletAction: () => void;
  // Escape hatch for a stuck "signing"/"verifying" state — resets status
  // immediately and invalidates any in-flight signIn() call.
  cancelSignIn: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { address, chainId, isConnected, connector, status: accountStatus } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const config = useConfig();
  const { reconnectAsync } = useReconnect();

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  // Set once, right after mount, if the PREVIOUS page load auto-recovered
  // from a corrupted WalletConnect session (see AUTO_RECOVERED_FLAG_KEY)
  // — read-once-then-cleared, so it only shows immediately after the
  // reload that caused it, never lingers across later navigation.
  const [justAutoRecovered, setJustAutoRecovered] = useState(false);
  useEffect(() => {
    if (consumeWalletConnectAutoRecoveredFlag()) setJustAutoRecovered(true);
  }, []);
  // True while the mobile-resume handler below is retrying
  // reconnectAsync() after coming back from a wallet app — surfaced so
  // ConnectWalletButton can show "Reconnecting…" instead of a plain
  // "Connect Wallet" button that looks like nothing is happening.
  const [resuming, setResuming] = useState(false);
  const resumeGenerationRef = useRef(0);
  // Timestamp of the last user-initiated wallet action (tapping Connect,
  // or signIn() starting) — the resume handler below only runs its
  // extended retry-with-backoff (and shows "Reconnecting…") within a
  // window of THIS, never on an ordinary tab-focus/app-switch that has
  // nothing to do with wallet connecting. Without this gate, every
  // routine tab switch (checking a notification, switching apps and
  // coming back to just browse) made the button flash "Reconnecting…"
  // for up to ~14s even though nothing was ever in flight — confirmed
  // in a real-device log showing resume events firing, and reconnectAsync
  // resolving to 0 connections, well before the user had tapped Connect
  // at all.
  //
  // Backed by sessionStorage, not just the in-memory ref — a real-device
  // log confirmed MetaMask's "return to dapp" redirect sometimes lands as
  // a genuine fresh navigation (pageshow with persisted:false), not a
  // bfcache resume of the same frozen tab. A fresh navigation means a
  // BRAND NEW AuthProvider instance whose in-memory ref would read 0,
  // making the very resume this gate exists for look "irrelevant" and
  // get skipped — exactly backwards. sessionStorage survives that reload
  // (same tab, cleared on tab close), so the marker isn't lost.
  const WALLET_ACTION_STORAGE_KEY = "SpaceDOGE_last_wallet_action_at";
  const lastWalletActionAtRef = useRef(0);
  if (lastWalletActionAtRef.current === 0 && typeof window !== "undefined") {
    try {
      lastWalletActionAtRef.current = Number(window.sessionStorage.getItem(WALLET_ACTION_STORAGE_KEY) ?? "0");
    } catch {
      // sessionStorage unavailable (private mode etc.) — falls back to in-memory-only tracking
    }
  }
  function markWalletActionRef() {
    const now = Date.now();
    lastWalletActionAtRef.current = now;
    try {
      window.sessionStorage.setItem(WALLET_ACTION_STORAGE_KEY, String(now));
    } catch {
      // non-fatal — see above
    }
    // See src/lib/walletReturnPath.ts's own doc-comment for the full
    // "why" — records WHERE this connect/sign-in attempt started, so
    // WalletReturnPathRedirector (rendered app-wide in providers.tsx)
    // can route the user back to it once any page mounts, regardless of
    // whether this attempt actually finishes reconnecting successfully.
    markWalletReturnPath();
  }

  const refresh = useCallback(async () => {
    const res = await fetchResilient("/api/auth/session", {});
    const data = (await res.json()) as SessionInfo;
    walletLog("session refresh", data);
    setSession(data);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Connector-level lifecycle logging — connect/disconnect with full
  // connector identity, plus account status/chain transitions as wagmi's
  // own Config store sees them (source of truth, not anything derived
  // locally). Requirement: "Log connector onConnect, onError, session
  // approval... and account-change events."
  useAccountEffect({
    onConnect(data) {
      walletLog("onConnect", {
        address: data.address,
        chainId: data.chainId,
        connectorId: data.connector?.id,
        connectorName: data.connector?.name,
        isReconnected: data.isReconnected,
      });
    },
    onDisconnect() {
      walletLog("onDisconnect");
    },
  });

  useEffect(() => {
    walletLog("account status changed", { accountStatus, address, chainId, connectorId: connector?.id });
  }, [accountStatus, address, chainId, connector?.id]);

  // WalletConnect-specific session diagnostics — topic, session_delete,
  // display_uri — pulled straight off the connector's own underlying
  // provider (only the walletConnect connector actually has these
  // events; injected() has no equivalent, hence the try/guard).
  //
  // getProvider() can itself be undefined/throw during a transitional
  // reconnecting state — same "connector object exists but isn't fully
  // hydrated yet" race documented in signIn()'s getChainId workaround
  // above. This effect runs unconditionally for every account-status
  // change, so an uncaught throw here previously crashed the WHOLE app
  // (React treats a synchronous throw inside a passive effect as fatal,
  // and Turbopack's Fast Refresh does a full page reload to recover) —
  // right in the middle of the connect/resume window, which could
  // easily have been DESTROYING the very connection attempt this
  // logging was added to diagnose. Every step here is now defensive:
  // nothing thrown out of this effect, ever.
  useEffect(() => {
    if (!connector || connector.type !== "walletConnect") return;
    if (typeof connector.getProvider !== "function") {
      walletLog("walletConnect diagnostics skipped — connector.getProvider not ready yet");
      return;
    }
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    connector
      .getProvider()
      .then((provider) => {
        if (cancelled) return;
        const p = provider as {
          session?: { topic?: string };
          on?: (event: string, cb: (...a: unknown[]) => void) => void;
          removeListener?: (event: string, cb: (...a: unknown[]) => void) => void;
        };
        walletLog("walletConnect session", { topic: p.session?.topic ?? null });
        const onSessionDelete = (...a: unknown[]) => walletLog("walletConnect session_delete", ...a);
        const onDisplayUri = (uri: unknown) => walletLog("walletConnect display_uri", uri);
        p.on?.("session_delete", onSessionDelete);
        p.on?.("display_uri", onDisplayUri);
        cleanup = () => {
          p.removeListener?.("session_delete", onSessionDelete);
          p.removeListener?.("display_uri", onDisplayUri);
        };
      })
      .catch((err) => walletLog("walletConnect diagnostics error (non-fatal)", errorDetails(err)));
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [connector]);

  // Mobile Safari + wallet-app resume handling. Returning from
  // MetaMask via the OS app-switcher restores the Safari tab from the
  // bfcache in most cases: pageshow fires with event.persisted === true,
  // React never remounts (same frozen JS heap, just paused), and any
  // promise that was in flight when the tab was backgrounded (the
  // connectAsync() call from ConnectWalletButton) may simply never
  // settle — the underlying WebSocket/relay connection can be silently
  // dropped while the tab is suspended, and iOS doesn't guarantee
  // delivering that resolution after resume. wagmi's own reconnectAsync()
  // re-checks every configured connector's actual current state (does
  // it have an authorized session right now?) independent of whatever
  // stale promise is still pending, which is what actually unblocks the
  // UI — isConnected flips true from THIS, not from the original
  // connectAsync() ever resolving.
  useEffect(() => {
    let lastHandledAt = 0;
    // A single reconnectAsync() call right at resume can lose the race
    // against WalletConnect's relay socket actually resyncing after the
    // tab was suspended — real-device logs show the FIRST several resume
    // attempts after returning from MetaMask resolving with zero
    // connections for OVER TWO MINUTES straight, only succeeding once
    // the user gave up and manually tapped Connect Wallet again. A
    // bounded retry-with-backoff (instead of one shot) gives the relay
    // more real chances to catch up before we give up — this can't fix
    // every case (iOS can suspend the socket for long enough that the
    // session settle message is truly lost, which no client-side retry
    // can recover), but it closes the gap for the borderline cases and,
    // via `resuming`, lets the button honestly say "Reconnecting…"
    // instead of silently looking identical to a cold "Connect Wallet"
    // state while this runs.
    const RETRY_DELAYS_MS = [0, 1200, 2500, 4000, 6000];

    async function handleResume(source: string, extra?: Record<string, unknown>) {
      const now = Date.now();
      // pageshow/focus/visibilitychange commonly fire within
      // milliseconds of each other for the same real-world event —
      // collapse them into a single reconnect attempt.
      if (now - lastHandledAt < 500) {
        walletLog("resume signal (debounced)", source, extra);
        return;
      }
      lastHandledAt = now;
      walletLog("resume signal", source, {
        ...extra,
        visibilityState: document.visibilityState,
        wagmiStatus: config.state.status,
        wagmiCurrentConnector: config.state.current,
      });

      // reconnectAsync() is for RESUMING an already-established session
      // after an app-switch — it has no business running while a BRAND
      // NEW connectAsync() (from ConnectWalletButton/useConnectAndSignIn)
      // is still awaiting approval in the wallet app. config.state.status
      // is "connecting" for exactly that window. Confirmed live as a real
      // bug, not just a redundant call: focus/visibilitychange fire
      // repeatedly during a mobile wallet round-trip (each app-switch
      // prompt, each return, etc.), so this loop was calling
      // reconnectAsync() dozens of times over the better part of a
      // minute while a Bitget Wallet connect request sat pending — and
      // the pending WalletConnect session proposal ultimately came back
      // rejected with "Connection request reset. Please try again.",
      // exactly the kind of reset a concurrent reconnectAsync() call
      // against the same pairing would cause. Skip entirely here; once
      // the fresh connect settles (success or failure), status moves off
      // "connecting" and a later resume signal is handled normally.
      if (config.state.status === "connecting") {
        walletLog("resume signal ignored — a fresh connect is already in flight", source);
        return;
      }

      // Only run the extended retry-with-backoff (and show
      // "Reconnecting…") when a wallet action actually happened
      // recently — tapping Connect or starting sign-in both mark this.
      // Otherwise this fires on every ordinary tab-focus/app-switch
      // completely unrelated to wallet connecting (confirmed on a real
      // device: resume events firing well before Connect was ever
      // tapped), which made the button falsely show "Reconnecting…" for
      // up to ~14s on totally routine app-switching.
      const isRelevant = now - lastWalletActionAtRef.current < RESUME_RELEVANCE_WINDOW_MS;
      if (!isRelevant) {
        try {
          const connections = await reconnectAsync();
          walletLog("reconnectAsync resolved (routine resume, no recent wallet action)", { count: connections.length });
        } catch (err) {
          walletLog("reconnectAsync error (routine resume)", errorDetails(err));
        }
        return;
      }

      const myGeneration = ++resumeGenerationRef.current;
      setResuming(true);
      try {
        for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
          if (myGeneration !== resumeGenerationRef.current) return; // a newer resume signal took over
          if (RETRY_DELAYS_MS[attempt] > 0) {
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
          }
          if (myGeneration !== resumeGenerationRef.current) return;
          try {
            const connections = await reconnectAsync();
            walletLog("reconnectAsync resolved", { attempt, count: connections.length });
            if (connections.length > 0) return;
          } catch (err) {
            walletLog("reconnectAsync error", { attempt, ...errorDetails(err) });
          }
        }
      } finally {
        if (myGeneration === resumeGenerationRef.current) setResuming(false);
      }
    }

    function onPageShow(e: PageTransitionEvent) {
      handleResume("pageshow", { persisted: e.persisted });
    }
    function onFocus() {
      handleResume("focus");
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") handleResume("visibilitychange");
    }

    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // config is stable for the component's lifetime (created once in
    // providers.tsx) — only reconnectAsync itself needs to be current.
  }, [reconnectAsync, config]);

  // Self-heals a specific class of WalletConnect SDK-internal corruption
  // that otherwise crashes the ENTIRE app with an uncaught runtime error
  // — confirmed on a real device: "No matching key. session topic
  // doesn't exist: <topic>" thrown from deep inside
  // @walletconnect/sign-client (nowhere near our own call stack, since
  // it fires from the SDK's own internal event listeners — no try/catch
  // in our code can intercept it). This happens after enough repeated
  // connect/disconnect/reconnect cycles leave the browser's local
  // WalletConnect keychain (indexedDB/localStorage, "wc@..." keys)
  // referencing a session topic the relay no longer recognizes. Since
  // this is a global uncaught error/rejection, not something raised
  // through any promise our own code awaits, the only place to catch it
  // is here. Detecting it and clearing just that storage (see
  // recoverFromStaleWalletConnectSession's own doc-comment — shared with
  // useConnectAndSignIn.ts's own catch block, which hits this same class
  // of corruption a different way) turns a dead crash screen into an
  // automatic reload onto a clean state. That shared function's own 10s
  // guard prevents a reload loop if the same error somehow recurs
  // immediately after reload (e.g. a genuinely broken relay) instead of
  // clearing it.
  useEffect(() => {
    function maybeRecover(message: string | null | undefined, source: string) {
      if (!isStaleWalletConnectError(message)) return;
      walletLog("stale WalletConnect session detected", { source, message });
      recoverFromStaleWalletConnectSession(source);
    }
    function onError(event: ErrorEvent) {
      maybeRecover(event.message, "error");
    }
    function onRejection(event: PromiseRejectionEvent) {
      const message = event.reason instanceof Error ? event.reason.message : String(event.reason);
      maybeRecover(message, "unhandledrejection");
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // Only invalidate the client-side session mirror when the wallet is
  // ACTIVELY connected to a DIFFERENT address than the signed-in
  // session — that's the real security-relevant case (doc's "session
  // expires... must be refreshed through a new signature" rule,
  // section 3.1, meant for switching accounts mid-session). Merely
  // having no wallet extension connected right now (locked, closed, or
  // just hasn't finished restoring on this page load) does NOT mean
  // the still-valid httpOnly session cookie became invalid — the
  // server is the actual authority on that (enforced in
  // dashboard/layout.tsx), not wagmi's live connection state. This
  // used to clear `session` on `!isConnected` too, which meant a
  // perfectly valid signed-in session got treated as logged-out the
  // instant the wallet extension wasn't connected, even though the
  // dashboard itself (gated by the real cookie) rendered fine —
  // exactly the "dashboard shows data but header says Connect Wallet"
  // bug this fixes.
  useEffect(() => {
    if (session?.authenticated && isConnected && address?.toLowerCase() !== session.address) {
      setSession(null);
    }
  }, [isConnected, address, session]);

  // Guards the auto-continue effect below — set at the start of every
  // signIn() call (explicit or automatic) so a failed/in-flight attempt
  // for a given address is never auto-retried in a loop. Doesn't gate
  // signIn() itself: an explicit retry (e.g. the user clicking Connect
  // Wallet again) always proceeds regardless of this.
  const attemptedAddressRef = useRef<string | null>(null);

  // A real mutex, not just the address-tracking ref above. The
  // auto-continue effect below and ConnectWalletButton's own explicit
  // `await signIn(...)` after connectAsync resolves are two entirely
  // separate call sites with no coordination between them — connectAsync
  // resolving updates wagmi's store, which can re-render AuthProvider
  // and fire the auto-continue effect in the same tick as
  // ConnectWalletButton's own code is about to call signIn() directly.
  // attemptedAddressRef alone doesn't stop this: the effect checks it
  // before calling signIn(), but ConnectWalletButton's explicit call
  // bypasses that check entirely, so nothing previously prevented both
  // call sites from invoking signIn() concurrently — two overlapping
  // signMessageAsync() calls, i.e. two real MetaMask signature prompts
  // stacked on each other, confirming one immediately surfacing the
  // next. Checked and set synchronously at the very top of signIn()
  // itself so it protects every caller uniformly, not just the ones
  // that remember to check first.
  const signInInFlightRef = useRef(false);
  // Bumped by cancelSignIn() (the Disconnect button's escape hatch, see
  // ConnectWalletButton.tsx) so a signIn() call that's already mid-flight
  // when the user bails out can't clobber the reset UI state once it
  // eventually settles (resolves OR rejects) — without this, disconnecting
  // during a stuck "signing" state could still leave `status` flipping
  // back to "error"/"idle" moments later from the abandoned call,
  // fighting with whatever the user does next.
  const signInGenerationRef = useRef(0);


  const signIn = useCallback(async (overrideAddress?: string, overrideChainId?: number) => {
    const signInAddress = overrideAddress ?? address;
    const signInChainId = overrideChainId ?? chainId;
    if (!signInAddress || !signInChainId) {
      setError("Connect a wallet first.");
      return;
    }
    if (signInInFlightRef.current) {
      walletLog("signIn skipped — already in flight", { address: signInAddress });
      return;
    }
    signInInFlightRef.current = true;
    const myGeneration = ++signInGenerationRef.current;
    const isCurrent = () => signInGenerationRef.current === myGeneration;
    attemptedAddressRef.current = signInAddress.toLowerCase();
    markWalletActionRef();
    setError(null);
    setStatus("signing");
    walletLog("signIn start", { address: signInAddress, chainId: signInChainId });
    try {
      const nonceRes = await fetchResilient(`/api/auth/nonce?address=${signInAddress}`, {});
      walletLog("nonce response", { ok: nonceRes.ok, status: nonceRes.status });
      if (!nonceRes.ok) throw new Error("Could not get a sign-in nonce.");
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      const siweMessage = new SiweMessage({
        domain: window.location.host,
        address: signInAddress,
        statement: "Sign in to Space DOGE. This request will not trigger a blockchain transaction or cost any gas fees.",
        uri: window.location.origin,
        version: "1",
        chainId: signInChainId,
        nonce,
      });
      const message = siweMessage.prepareMessage();

      // wagmi's isConnected can flip true a beat before its own internal
      // reconnect handshake has finished attaching a fully-live connector
      // reference to config.state.connections — signMessageAsync (via
      // wagmi's getConnectorClient) reads that same state, so calling it
      // in that gap throws "connection.connector.getChainId is not a
      // function" from a connector object that isn't fully hydrated yet.
      // An earlier version of this fix retried the WHOLE signMessageAsync
      // call after that error — but the error comes from wagmi's OWN
      // post-signature chain-match check, which can fail AFTER the
      // wallet has already genuinely signed. Retrying re-called
      // signMessageAsync, which re-prompted the wallet for a second real
      // signature — exactly the "confirmed once, asked to confirm again"
      // report. Waiting for the connector to actually be ready BEFORE
      // the one-and-only signMessageAsync call avoids ever hitting the
      // race in the first place, instead of reacting to it afterward.
      for (let waited = 0; waited < 3000; waited += 150) {
        const connection = config.state.connections.get(config.state.current ?? "");
        if (connection && typeof connection.connector.getChainId === "function") break;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      // Bounded the same way ConnectWalletButton.tsx bounds connectAsync
      // (CONNECT_TIMEOUT_MS) — without this, a signMessageAsync() whose
      // resolution gets silently dropped during the MetaMask app-switch
      // (the same iOS/WalletConnect relay drop documented throughout this
      // file) left `status` stuck at "signing" and signInInFlightRef stuck
      // at true FOREVER: the auto-continue effect refuses to retry while
      // status is "signing", and every explicit retry hit the in-flight
      // guard above and silently no-op'd. This is exactly the "connect to
      // MetaMask, come back, nothing happens" report — no error, no
      // prompt, just permanently stuck. A timeout here guarantees this
      // function always reaches its `finally` and clears the mutex, so a
      // dropped response leads to a visible, retry-able error instead of a
      // silent dead end.
      //
      // Was 45s — confirmed on a real device this was too aggressive for
      // the same reason CONNECT_TIMEOUT_MS was: a user who takes their
      // time approving the signature inside MetaMask before it
      // auto-redirects back routinely takes longer than that, so this
      // fired FIRST ("Wallet didn't respond...") for a signature that was
      // genuinely about to arrive — only reproduced when waiting for the
      // automatic redirect specifically, never when manually switching
      // back to Safari fast. Matches CONNECT_TIMEOUT_MS's new value so
      // neither step of the two-app-switch flow is the tighter clock.
      const signature = await Promise.race([
        signMessageAsync({ message }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Wallet didn't respond to the signature request in time. Please try again.")), 120_000);
        }),
      ]);
      walletLog("signMessageAsync resolved", { signatureLength: signature.length });

      if (!isCurrent()) {
        walletLog("signIn abandoned (cancelled mid-flight) — skipping verify", { address: signInAddress });
        return;
      }
      setStatus("verifying");
      const referralCode = window.localStorage.getItem("SpaceDOGE_ref") ?? undefined;
      const verifyRes = await fetchResilient("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature, referralCode }),
      });
      const verifyBody = await verifyRes.json().catch(() => ({}));
      walletLog("verify response", { ok: verifyRes.ok, status: verifyRes.status, body: verifyBody });
      if (!verifyRes.ok) {
        throw new Error(verifyBody.error ?? "Sign-in verification failed.");
      }

      await refresh();
      if (!isCurrent()) return;
      setStatus("idle");
      walletLog("signIn complete", { address: signInAddress });
      // No explicit "restore the pre-connect path" call here anymore —
      // WalletReturnPathRedirector (mounted app-wide) now handles that
      // unconditionally on every page mount, not gated behind signIn()
      // reaching this exact success point. See
      // src/lib/walletReturnPath.ts's own doc-comment for why: a new
      // tab's auto-reconnect routinely never gets this far at all.
    } catch (err) {
      // A failed signature/verification is an AUTH failure, not a wallet
      // CONNECTION failure — deliberately no disconnect() call here.
      // isConnected (wagmi's own state) is untouched, so the UI still
      // shows the connected address with a retry-able "Sign In" button
      // instead of falling back to "Connect Wallet" as if nothing were
      // connected at all.
      walletLog("signIn failed", errorDetails(err));
      if (!isCurrent()) {
        walletLog("signIn failure ignored (cancelled mid-flight)", { address: signInAddress });
        return;
      }
      setStatus("error");
      setError(
        isUserRejectionError(err)
          ? "Signature request declined. If MetaMask showed a \"could not verify this site\" warning, look past it for the actual message to approve, then tap Sign In again."
          : err instanceof Error
            ? err.message
            : "Sign-in failed."
      );
    } finally {
      signInInFlightRef.current = false;
    }
  }, [address, chainId, signMessageAsync, refresh, config]);

  // Auto-continues to sign-in whenever the wallet shows as connected
  // but there's no authenticated session for that address yet. Exists
  // for mobile WalletConnect: the wallet app's "return to dApp" redirect
  // is a fresh page load, not the same tab/JS context the Connect
  // Wallet button's connectAsync() → signIn() chain was running in — the
  // wallet itself ends up genuinely connected (wagmi restores that from
  // its own persisted storage on the new page load) but nothing was
  // left to actually continue on to the sign-in step, so the user was
  // stuck "connected" with no session and no further prompt. This
  // covers that gap regardless of what path led to "connected".
  useEffect(() => {
    if (!isConnected || !address || !chainId) return;
    if (session === null) return; // initial session check hasn't landed yet
    if (session.authenticated && session.address === address.toLowerCase()) return;
    if (status === "signing" || status === "verifying") return;
    if (attemptedAddressRef.current === address.toLowerCase()) return;
    signIn();
  }, [isConnected, address, chainId, session, status, signIn]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setSession(null);
    disconnect();
    // See revokeInjectedPermissions' own doc-comment (src/lib/wagmi.ts)
    // — without this, MetaMask keeps silently reusing whatever account
    // was originally authorized on the NEXT connect, ignoring whatever
    // account the user has since made active in the extension. Wallets
    // that don't support this method reject/throw here — expected,
    // swallowed; wagmi's own disconnect() above already ran regardless.
    try {
      await revokeInjectedPermissions();
    } catch {
      // Not supported by this wallet, or nothing to revoke — fine either way.
    }
    // A full reload (not just clearing React Query state client-side) —
    // per-page hooks (balances, mining stats, referral data, etc.) don't
    // re-key or refetch off `session` alone, so without this the
    // previous wallet's numbers stayed visible on screen after
    // disconnecting even though the session was gone underneath them.
    // Reloading also correctly re-triggers dashboard/layout.tsx's
    // server-side auth check if the user was sitting on a /dashboard/*
    // route, same as a real fresh page load would.
    window.location.reload();
  }, [disconnect]);

  const markWalletAction = useCallback(() => {
    markWalletActionRef();
  }, []);

  // The Disconnect button's escape hatch for a stuck "signing"/
  // "verifying" state — bumps signInGenerationRef so any in-flight
  // signIn() call becomes stale (its eventual resolution/rejection is
  // ignored, see isCurrent() checks above) and resets the UI state
  // immediately instead of waiting for that call's own timeout.
  const cancelSignIn = useCallback(() => {
    signInGenerationRef.current++;
    signInInFlightRef.current = false;
    setStatus("idle");
    setError(null);
    walletLog("signIn cancelled by user (disconnect)");
  }, []);

  return (
    <AuthContext.Provider
      value={{ session, status, error, resuming, justAutoRecovered, signIn, signOut, refresh, markWalletAction, cancelSignIn }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
