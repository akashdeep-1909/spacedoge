"use client";

// Mobile wallet app-switches don't always return to the exact page —
// or even the exact TAB — the user started from. Two real flows exist
// here:
//
// - MetaMask's own in-app browser: window.ethereum is injected directly
//   into the SAME tab, no cross-app redirect ever happens, so this
//   doesn't matter at all.
// - A regular mobile browser tab (Safari/Chrome) with no injected
//   provider: the walletConnect() connector deep-links OUT to the
//   wallet app, then the wallet redirects back in via a "universal
//   link" pointed at whatever URL was baked into its connection
//   metadata. That metadata is configured to the bare origin, not the
//   exact page (see src/lib/wagmi.ts's own doc-comment on
//   buildWagmiConfig's `redirect` option for the full reasoning — the
//   short version: WalletConnect's provider is constructed once, at
//   app boot, so window.location.href captured then is permanently
//   stale for an SPA that navigates client-side afterward). Confirmed
//   live: confirming a deposit this way lands the user back on the
//   HOMEPAGE, not /dashboard/deposit — stranding a real, sent
//   transaction with nothing watching it, since WalletDepositButton
//   (where all the auto-verify-on-mount logic lives) was never even
//   mounted on whatever page the user landed on.
//
// This is a tiny, generic "resume where I was" flag instead of trying
// to fix WalletConnect's own redirect target directly (not fixable per
// the constraint above): set right before ANY wallet prompt in the
// deposit flow that could trigger an app-switch (WalletDepositButton's
// own deposit()), consumed once by DepositReturnRedirector (rendered
// app-wide in app/providers.tsx, so it runs on literally any page
// including the homepage) the next time any page mounts.
//
// localStorage, NOT sessionStorage — confirmed live (matches
// auth-context.tsx's WALLET_RETURN_PATH_KEY, which hit this exact same
// problem first): when the wallet's return redirect doesn't exactly
// match the tab the browser still has open, Safari/Chrome sometimes
// open a BRAND NEW tab instead of reusing/reloading the old one. A new
// tab gets its own empty sessionStorage (that only survives reloads of
// the SAME tab, never a genuinely new one) — the flag this reads never
// arrives there, reproducing the exact bug this file exists to fix,
// just one layer up ("redirects to homepage in a new tab, still not on
// the deposit page"). localStorage is shared across every tab of the
// same origin, so it survives that.
const KEY = "spacedoge:return-to-deposit";

// Same spirit as auth-context.tsx's WALLET_RETURN_PATH_RELEVANCE_WINDOW_MS
// — localStorage never expires on its own, so without a relevance
// check, a flag left over from a deposit attempt the user abandoned
// (closed the tab mid-flow, came back a week later on an unrelated
// visit) would wrongly redirect that later, totally unrelated
// navigation straight to the deposit page.
const RELEVANCE_WINDOW_MS = 10 * 60_000;

export function markPendingDepositReturn() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ at: Date.now() }));
  } catch {
    // Private browsing / storage disabled — worst case, the user just
    // lands wherever the wallet's own redirect takes them, same as
    // before this existed.
  }
}

// Idempotent one-shot read: returns true at most once per mark() call,
// clearing the flag immediately so a later, unrelated navigation never
// redirects the user again.
export function consumePendingDepositReturn(): boolean {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return false;
    window.localStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as { at?: unknown };
    if (typeof parsed.at !== "number") return false;
    return Date.now() - parsed.at <= RELEVANCE_WINDOW_MS;
  } catch {
    return false;
  }
}

// Called from WalletDepositButton's own deposit() once it reaches its
// finally block WITHOUT the page having navigated away in the meantime
// — i.e. we're demonstrably still on the same page (an in-app-browser
// flow, or a desktop extension, neither of which ever redirects out),
// so the flag no longer serves any purpose and would otherwise linger
// until some later, unrelated navigation wrongly redirects the user
// back to the deposit page. If a redirect (same-tab OR a new tab) DID
// happen instead, this finally block simply never runs in that
// abandoned JS context, so the flag correctly survives for whichever
// page/tab loads next to consume.
export function clearPendingDepositReturn() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clean up if it was never stored.
  }
}
