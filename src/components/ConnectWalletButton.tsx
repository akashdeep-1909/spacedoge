"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useAuth, isUserRejectionError } from "@/lib/auth-context";
import { useSetNickname } from "@/lib/hooks";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { walletLog, errorDetails } from "@/lib/walletLog";
import { waitForInjectedProvider, metaMaskAppLink, AUTO_CONNECT_PARAM } from "@/lib/wagmi";

// A hard ceiling on how long one connect attempt is allowed to sit
// "busy" — mobile WalletConnect can leave connectAsync() permanently
// pending after an iOS bfcache resume (the underlying relay socket gets
// silently dropped while Safari is backgrounded and never delivers a
// resolution). auth-context.tsx's resume handler independently retries
// via reconnectAsync() and will flip isConnected on its own if that
// succeeds — this timeout exists only so the BUTTON itself can never
// get stuck if that recovery path also comes up empty.
//
// Was 30s — confirmed on a real device to be way too tight: a user who
// actually takes their time reading/approving inside MetaMask (or whose
// wallet app is slow to open) routinely blows past 30 seconds before
// MetaMask's own auto-redirect ever fires, so this timeout was firing
// FIRST and showing "Connection timed out" for a connection that was
// about to succeed — confirmed by the same flow working every time when
// the user manually switched back to Safari fast enough to beat this
// clock. This only needs to be long enough to eventually recover a
// truly-stuck case (the bfcache scenario above), not short enough to
// race an ordinary human decision + app-switch.
const CONNECT_TIMEOUT_MS = 120_000;

// "WebSocket connection failed for host: ..." is WalletConnect's own
// relay-connection error (thrown from deep inside @walletconnect/core,
// shared by every wallet path — nothing wallet-specific about it),
// surfaced verbatim by connectAsync() rejecting. It's a transient
// network hiccup connecting to WalletConnect's relay infrastructure —
// common on mobile data — not a sign that a given wallet app doesn't
// work. A short, bounded retry clears most of these without the user
// having to notice or tap Connect Wallet a second time themselves.
function isTransientRelayError(err: unknown): boolean {
  return err instanceof Error && /WebSocket connection failed/i.test(err.message);
}
async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// Click the identity pill to set/edit a nickname — shown in place of
// the wallet address in-game, in multiplayer match results, and on the
// weekly leaderboard (falls back to the shortened address wherever
// nothing's been set, exactly like before this existed).
function NicknameEditor({ address, nickname, onSaved }: { address: string; nickname: string | null | undefined; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(nickname ?? "");
  const [error, setError] = useState<string | null>(null);
  const setNickname = useSetNickname();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(nickname ?? "");
          setError(null);
          setEditing(true);
        }}
        title="Add or update your nickname"
        className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-mint/25 bg-mint-soft px-3 py-1.5 text-xs font-semibold text-mint transition hover:border-mint/50"
        style={{ animation: "pulse-glow-mint 2.4s ease-in-out infinite" }}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />
        {nickname || shortenAddress(address)}
        <span aria-hidden className="text-[10px] opacity-60">✏️</span>
      </button>
    );
  }

  async function save() {
    setError(null);
    try {
      await setNickname.mutateAsync(value.trim());
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save nickname");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder="Nickname"
          maxLength={24}
          disabled={setNickname.isPending}
          className="w-28 rounded-full border border-mint/40 bg-panel px-3 py-1.5 text-xs outline-none focus:border-mint"
        />
        <button
          onClick={save}
          disabled={setNickname.isPending}
          className="btn-game whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs disabled:opacity-50"
        >
          {setNickname.isPending ? "…" : "Save"}
        </button>
        <button
          onClick={() => setEditing(false)}
          disabled={setNickname.isPending}
          className="whitespace-nowrap rounded-full border border-line bg-panel px-2 py-1.5 text-xs text-muted hover:text-foreground"
        >
          ✕
        </button>
      </div>
      {error && <span className="max-w-56 text-right text-xs text-risk">{error}</span>}
    </div>
  );
}

// SIMPLE UX RULE (doc section 3.3 / 6): one wallet button handles
// connect, sign-in and identity. No username, no password, ever.
//
// Still one button, but now picks between two connectors under the
// hood (src/lib/wagmi.ts): injected() when window.ethereum exists —
// desktop extensions, or a wallet app's own in-app browser (MetaMask/
// Trust Wallet mobile both inject the same way) — and walletConnect()
// otherwise, which is the only way a REGULAR mobile browser tab
// (Safari/Chrome, no injected provider at all) can reach an external
// wallet app, via a QR code or deep link. If a user has multiple
// injected wallet extensions, which one answers window.ethereum is
// controlled by the extensions' own "set as default wallet" setting
// (MetaMask and Phantom both have this) — not a picker built into
// this app.
export function ConnectWalletButton() {
  const { t } = useLocale();
  const { address, isConnected } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const {
    session,
    status,
    error: authError,
    resuming,
    justAutoRecovered,
    signIn,
    signOut,
    refresh,
    markWalletAction,
    cancelSignIn,
  } = useAuth();
  const [connectFailure, setConnectFailure] = useState<string | null>(null);
  // Drives which CTA is PRIMARY below — null while still checking (up
  // to 1.5s, see waitForInjectedProvider), then true/false. Defaults to
  // showing the normal Connect Wallet button while null so there's no
  // flash of the wrong CTA on desktop (which resolves near-instantly
  // anyway). Checked once on mount, not just at click-time like
  // connectAndSignIn's own check below — this one decides page LAYOUT,
  // so it needs to run before the user acts, not during.
  const [injectedAvailable, setInjectedAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    waitForInjectedProvider().then((result) => {
      if (!cancelled) setInjectedAvailable(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  // Deliberately NOT useConnect()'s own isPending as the busy signal —
  // that reflects one specific connectAsync() promise, which can be
  // left permanently pending by an iOS bfcache resume (see
  // auth-context.tsx's resume-handling comment). This flag is always
  // bounded instead: set right before the attempt, and guaranteed to
  // clear via finally, an explicit reject, OR the timeout race below —
  // never left to hang on a promise that may simply never settle.
  const [attempting, setAttempting] = useState(false);
  // Bumped on every new attempt so a stale attempt's finally/catch
  // (e.g. one still waiting out the timeout from a prior tap) can't
  // clobber state set by a newer attempt or by the resume handler
  // having already gotten the wallet connected out-of-band.
  const attemptIdRef = useRef(0);

  // Connecting AND signing in as one action — the address/chainId
  // come straight off connectAsync's resolved result rather than the
  // useAccount() hook, which wouldn't have re-rendered with the new
  // value yet at this point in the same event handler.
  async function connectAndSignIn() {
    const myAttemptId = ++attemptIdRef.current;
    markWalletAction();
    setConnectFailure(null);
    // Bounded wait, not a synchronous check — see waitForInjectedProvider's
    // doc-comment. A real-device log showed this race actually losing:
    // reconnectAsync() finding "nothing authorized" instantly on every
    // retry even from INSIDE MetaMask's own in-app browser, consistent
    // with this app having fallen back to walletConnect() because
    // window.ethereum hadn't finished injecting at the exact moment of
    // the tap.
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
      // A newer attempt (or the resume handler's own reconnectAsync)
      // already took over — don't let this now-stale attempt also fire
      // signIn() a second time.
      if (attemptIdRef.current !== myAttemptId) {
        walletLog("connect attempt superseded, skipping signIn", { attemptId: myAttemptId });
        return;
      }
      await signIn(result.accounts[0], result.chainId);
    } catch (err) {
      walletLog("connect attempt failed", { attemptId: myAttemptId, ...errorDetails(err) });
      if (attemptIdRef.current === myAttemptId) {
        setConnectFailure(
          isTransientRelayError(err)
            ? "Couldn't reach the wallet network — check your connection and try again."
            : isUserRejectionError(err)
              ? "Connection request declined. If MetaMask showed a \"could not verify this site\" warning, that's expected for local testing — look past it for the actual connect request, then tap Connect Wallet again."
              : err instanceof Error
                ? err.message
                : "Failed to connect wallet."
        );
      }
    } finally {
      if (attemptIdRef.current === myAttemptId) setAttempting(false);
    }
  }

  // Fires the connect flow automatically the moment this page loads
  // via metaMaskAppLink()'s deep link (see AUTO_CONNECT_PARAM's
  // doc-comment) — without this, landing inside MetaMask's browser was
  // just an ordinary page load that connected nothing, leaving the
  // user staring at a page that looks identical to before they tapped
  // the link ("nothing happen no confirm, connect etc", confirmed
  // live). Strips the marker from the URL right away via replaceState
  // (not a Next.js navigation — this must NOT add a history entry or
  // trigger a server round-trip) so refreshing afterward doesn't loop.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(AUTO_CONNECT_PARAM)) return;
    url.searchParams.delete(AUTO_CONNECT_PARAM);
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    if (!session?.authenticated) connectAndSignIn();
    // Deliberately only depends on mount — this must fire exactly once
    // per real page load, not re-run as auth state resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = attempting || status === "signing" || status === "verifying" || resuming;

  // A real signed-in session takes priority over wagmi's live wallet
  // connection state — checked FIRST, before `!isConnected`. This used
  // to check `!isConnected` first, so a perfectly valid session (the
  // dashboard's own server-side check already confirmed it) still
  // showed "Connect Wallet" in the header the instant the wallet
  // extension wasn't actively connected — confusing on its own, and
  // actively wrong, since the dashboard content was rendering as if
  // logged in the whole time.
  if (session?.authenticated) {
    return (
      <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
        <NicknameEditor address={session.address!} nickname={session.nickname} onSaved={refresh} />
        {/* Below lg, MobileNav's own hamburger drawer (already open to
            every page link) carries its own Disconnect entry instead —
            the header on a real phone width doesn't have room for logo +
            language flag + hamburger + identity pill + this button too;
            they were silently overflowing past the right edge. */}
        <button
          onClick={signOut}
          className="btn-game-outline hidden whitespace-nowrap rounded-full px-3 py-1.5 text-xs lg:inline-flex"
        >
          {t("common.disconnect")}
        </button>
      </div>
    );
  }

  if (!isConnected) {
    const connectLabel = status === "signing"
      ? t("common.checkWallet")
      : status === "verifying"
        ? t("common.verifying")
        : attempting
          ? t("common.connecting")
          : resuming
            ? t("common.reconnecting")
            : t("common.connectWallet");

    return (
      <div className="flex flex-col items-end gap-1">
        {/* injectedAvailable === false only ever means "no MetaMask
            extension/app-browser detected" — on mobile that's exactly
            when WalletConnect's browser round-trip is unreliable (see
            metaMaskAppLink's doc-comment), so the deep link becomes
            the PRIMARY action there, demoting the normal button to a
            smaller fallback for people on a different wallet app. On
            desktop the same false reading means "no extension, but
            WalletConnect's QR code is the genuinely correct path" — a
            mobile app deep link is meaningless on desktop — so the
            normal button stays primary there via the lg: split below. */}
        {injectedAvailable === false ? (
          <>
            <a
              href={metaMaskAppLink()}
              className="btn-game hud-corner whitespace-nowrap rounded-full px-4 py-2 text-sm lg:hidden"
            >
              {t("common.openInMetaMaskPrimary")}
            </a>
            <button
              onClick={connectAndSignIn}
              disabled={busy}
              className="whitespace-nowrap text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-gold lg:hidden"
            >
              {t("common.connectOtherWallet")}
            </button>
            <button
              onClick={connectAndSignIn}
              disabled={busy}
              className="btn-game hud-corner hidden whitespace-nowrap rounded-full px-4 py-2 text-sm lg:inline-flex"
            >
              {connectLabel}
            </button>
          </>
        ) : (
          <button
            onClick={connectAndSignIn}
            disabled={busy}
            className="btn-game hud-corner whitespace-nowrap rounded-full px-4 py-2 text-sm"
          >
            {connectLabel}
          </button>
        )}

        <div className="flex max-w-56 flex-col items-end gap-1">
          {justAutoRecovered && (
            <span className="text-right text-xs text-mint">{t("common.autoRecoveredMessage")}</span>
          )}
          {connectFailure && <span className="text-right text-xs text-risk">{connectFailure}</span>}
        </div>
      </div>
    );
  }

  // Connected at the wallet-extension level but not yet SIWE-signed-in.
  // MetaMask keeps its own site permission independent of our app
  // session, so this state is reachable even right after signing out —
  // it always needs its own explicit way back to fully disconnected,
  // not just a path forward into Sign In.
  if (!session?.authenticated) {
    const busy = status === "signing" || status === "verifying";
    return (
      <div className="flex max-w-full flex-col items-end gap-1">
        <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
          <span className="whitespace-nowrap rounded-full border border-line bg-panel px-3 py-1.5 text-xs text-muted">
            {address && shortenAddress(address)}
          </span>
          <button
            onClick={() => signIn()}
            disabled={busy}
            className="btn-game whitespace-nowrap rounded-full px-4 py-2 text-sm"
          >
            {status === "signing" ? t("common.checkWallet") : status === "verifying" ? t("common.verifying") : t("common.signIn")}
          </button>
          {/* Deliberately NEVER disabled, unlike the Sign In button above
              — a stuck "signing"/"verifying" state (wallet-side request
              silently jammed/queued, no popup ever appearing) previously
              left the user with NO way to escape except waiting out the
              full 45s signMessageAsync timeout, since this button was
              disabled by the same `busy` flag. Disconnecting always tears
              down the connector, which naturally fails any pending
              request against it — signIn()'s own catch block handles
              that cleanly, so this is always a safe escape hatch. */}
          <button
            onClick={() => {
              cancelSignIn();
              disconnect();
            }}
            title="Disconnect this wallet"
            className="whitespace-nowrap rounded-full border border-line bg-panel px-2.5 py-1.5 text-xs text-muted transition hover:text-foreground"
          >
            ✕
          </button>
        </div>
        {authError && <span className="max-w-64 text-right text-xs text-risk">{authError}</span>}
      </div>
    );
  }

  // Unreachable in practice — the `session?.authenticated` branch
  // above already returns before this point, so `session` is always
  // falsy here. Kept only as a type-narrowing exhaustiveness fallback.
  return null;
}
