"use client";

// Where to send the user back to once a connect/sign-in attempt that
// started on THIS path finally resolves, one way or another — see
// markWalletReturnPath's own doc-comment for why the WalletConnect
// redirect target itself can't be fixed directly (it's captured once,
// at app boot, and can't be re-read per-navigation), and
// WalletReturnPathRedirector.tsx (the consuming half, rendered app-wide
// in providers.tsx) for how this gets acted on.
//
// localStorage, NOT sessionStorage — confirmed live: when a mobile
// wallet's return redirect doesn't exactly match the tab the browser
// still has open, Safari/Chrome sometimes open a BRAND NEW tab instead
// of reusing/reloading the old one. A new tab gets its own empty
// sessionStorage (only survives reloads of the SAME tab, never a
// genuinely new one) — localStorage is shared across every tab of the
// same origin, so it survives that.
const KEY = "SpaceDOGE_wallet_return_path";

// Guards against ever acting on a leftover value from a long-abandoned
// attempt (user tapped Connect, never finished, came back a week later
// from a totally different link) — this is specifically "was this THE
// flow that's completing right now," not a general session timeout.
const RELEVANCE_WINDOW_MS = 10 * 60_000;

// Records WHERE a connect/sign-in attempt started, not just when.
// WalletConnect's own redirect.universal metadata (src/lib/wagmi.ts) is
// captured once — the first time the connector's provider is ever
// constructed, which wagmi's own reconnect-on-mount triggers
// automatically on the very first page load of this tab — and never
// updates again for the rest of the browser session. So a user who
// loads the app on one page, taps around client-side to a different
// page (no reload), then taps Connect, has the wallet redirecting back
// to that FIRST page, not the one they were actually using when they
// tapped Connect. This can't be fixed at the WalletConnect layer (the
// SDK simply doesn't re-read metadata after its first construction) —
// instead: remember the real starting point now, and
// WalletReturnPathRedirector routes the user back to it once any page
// mounts with this flag still set, wherever they land.
export function markWalletReturnPath() {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ path: `${window.location.pathname}${window.location.search}`, at: Date.now() })
    );
  } catch {
    // non-fatal — worst case the user just stays on whatever page they land on
  }
}

// Idempotent one-shot read: returns the stored path at most once per
// mark() call (null after that, or if nothing valid was ever stored),
// clearing the flag immediately so a later, unrelated navigation never
// redirects the user again. Deliberately does NOT require signIn() to
// have succeeded first — confirmed live as the actual gap in the
// previous, signIn()-success-gated version of this mechanism: a new
// tab's auto-reconnect routinely fails to fully restore the wallet
// connection (the original tab was asleep/backgrounded when the
// wallet's approval round-tripped back, so the WalletConnect session
// never finished settling there), meaning signIn() never even gets
// triggered — the old restoreWalletReturnPath() (called only from
// signIn()'s success path) then never ran at all, stranding the user
// on the wrong page. Worse, their next MANUAL Connect attempt — tapped
// from that wrong page — re-recorded the return path as THAT page,
// permanently overwriting the real original destination. Consuming
// this unconditionally, the moment any page mounts, fixes both: the
// user lands back on the right page even if they still need to tap
// Connect Wallet again there, and the flag can never be clobbered by a
// later attempt that started from the wrong place.
export function consumeWalletReturnPath(): string | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    window.localStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as { path?: unknown; at?: unknown };
    if (typeof parsed.path !== "string" || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > RELEVANCE_WINDOW_MS) return null;
    return parsed.path;
  } catch {
    return null;
  }
}
