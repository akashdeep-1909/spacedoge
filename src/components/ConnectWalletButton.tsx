"use client";

import { useEffect, useState } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { useAuth } from "@/lib/auth-context";
import { useSetNickname } from "@/lib/hooks";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { AUTO_CONNECT_PARAM } from "@/lib/wagmi";
import { useConnectAndSignIn } from "@/lib/useConnectAndSignIn";
import { OpenInWalletAppLink } from "@/components/OpenInWalletAppLink";

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
          className="btn-game btn-game-sm whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs disabled:opacity-50"
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
    cancelSignIn,
  } = useAuth();
  const { connectAndSignIn, cancelConnect, attempting, connectFailure } = useConnectAndSignIn();

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
        {/* One button everywhere, mobile included — it always opens the
            real wallet-choice flow (connectAndSignIn: injected() when
            already inside a wallet app's own browser, otherwise
            walletConnect()'s own modal, which lists every wallet the
            user can pick from). Previously this jumped mobile users
            straight into MetaMask's app via metaMaskAppLink() before
            they got a choice — confirmed unwanted: users on a different
            wallet were being forced through MetaMask's install/open
            flow instead of picking their own. */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={connectAndSignIn}
            disabled={busy}
            className="btn-game hud-corner whitespace-nowrap rounded-full px-4 py-2 text-sm"
          >
            {connectLabel}
          </button>
          {/* Escape hatch for a stuck "Connecting…" state — see
              cancelConnect's own doc-comment (useConnectAndSignIn.ts)
              for why this can take much longer in wall-clock time than
              the nominal 2-minute bound suggests (a wallet app's own
              native confirm overlay commonly pauses the underlying
              page's JS execution, including our timers, while it's on
              screen). Deliberately NEVER disabled, matching the exact
              same reasoning as the analogous Disconnect button below
              for a stuck sign-in state — a stuck connect previously had
              no way out at all except reloading the whole page. */}
          {attempting && (
            <button
              onClick={cancelConnect}
              title="Cancel and try again"
              className="whitespace-nowrap rounded-full border border-line bg-panel px-2.5 py-2 text-xs text-muted transition hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>

        {/* Deliberately secondary (small text link, mobile-only — see
            OpenInWalletAppLink's own doc-comment), not a replacement for
            the button above: this was previously only wired into
            WalletDepositButton.tsx, not here, even though this is
            actually the FIRST point a mobile user hits the WalletConnect
            app-switch-and-back round trip. Confirmed live as a real,
            repeated complaint: on a regular mobile browser tab (no
            injected provider), WalletConnect's own redirect can land the
            user back in a NEW tab instead of the same one — an OS/wallet-
            level constraint no app-side code can fully eliminate (see
            wagmi.ts's own doc-comment on buildWagmiConfig's `redirect`
            option). Landing inside MetaMask's OWN browser via this link
            instead sidesteps the round trip entirely — window.ethereum is
            injected directly into the SAME tab/view, so there's no
            app-switch and therefore nothing that could redirect back to
            the wrong place. Not the default/forced path (that would
            exclude every non-MetaMask wallet, the exact regression the
            comment above already documents) — just now actually
            reachable from the very first connect prompt for anyone who
            wants the smoother, zero-redirect route.  */}
        <OpenInWalletAppLink />

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
