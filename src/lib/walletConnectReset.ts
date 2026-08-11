import { walletLog, errorDetails } from "@/lib/walletLog";

// WalletConnect's own SDK persists pairing/session/keychain state under
// keys and IndexedDB databases literally prefixed "wc@" (confirmed
// against the actual bundled source, not guessed) — separate from
// anything this app stores itself (SpaceDOGE_* keys, the httpOnly
// session cookie). After enough repeated connect/disconnect/reload
// cycles — or a connect attempt that gets ABANDONED partway through
// (see recoverFromStaleWalletConnectSession's own doc-comment for the
// real-device "new tab" case that's the most common trigger) — that
// local state can end up referencing a pairing/topic/session the relay
// no longer recognizes, or one that never finished its handshake and so
// is missing fields later code assumes exist. This wipes only that
// WalletConnect-specific state and reloads, which is the standard fix
// for that class of SDK-internal corruption — never touches the actual
// httpOnly session cookie, so a real sign-in isn't lost.
export async function resetWalletConnectStorage() {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("wc@")) window.localStorage.removeItem(key);
    }
  } catch (err) {
    walletLog("resetWalletConnectStorage localStorage error (non-fatal)", errorDetails(err));
  }
  try {
    if ("indexedDB" in window && typeof indexedDB.databases === "function") {
      const dbs = await indexedDB.databases();
      await Promise.all(
        dbs
          .filter((db) => db.name?.startsWith("wc@"))
          .map(
            (db) =>
              new Promise<void>((resolve) => {
                const req = indexedDB.deleteDatabase(db.name!);
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
                req.onblocked = () => resolve();
              })
          )
      );
    }
  } catch (err) {
    walletLog("resetWalletConnectStorage indexedDB error (non-fatal)", errorDetails(err));
  }
  walletLog("resetWalletConnectStorage complete, reloading");
  window.location.reload();
}

// Matches the handful of known-fatal WalletConnect SDK error signatures
// that mean "local session/keychain state is stale/corrupt/incomplete" —
// none of these are recoverable by retrying, only by clearing the
// storage above. The last alternative (namespace.methods.includes /
// this.namespace) is what a NEW tab hits when it tries to reuse a
// WalletConnect session that was only ever PARTIALLY established in a
// different, abandoned tab — confirmed live: a user redirected to
// MetaMask and back landing in a fresh tab (see
// recoverFromStaleWalletConnectSession's own doc-comment) got "An
// unknown RPC error occurred. Details: undefined is not an object
// (evaluating 'this.namespace.methods.includes')" the moment they
// tapped Connect Wallet there — the shared IndexedDB session record has
// no `namespaces` yet because the original tab's handshake never
// finished, and viem's WalletConnect connector assumes it always does.
export function isStaleWalletConnectError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /no matching key\.?\s*session topic doesn't exist|onrelaymessage|pairing topic doesn't exist|no matching key\.?\s*pairing|(?:this\.)?namespace(?:s)?\.methods\.includes|undefined is not an object.*this\.namespace/i.test(
    message
  );
}

// Read-once-then-cleared flag telling the NEXT page load "the page you
// were just on auto-recovered from a corrupted WalletConnect session" —
// see recoverFromStaleWalletConnectSession below for the write side.
// Consumed by auth-context.tsx's mount effect to surface
// justAutoRecovered, so the recovery is visible instead of looking like
// a silent, unexplained "why did my Connect Wallet button just reset"
// reload.
const AUTO_RECOVERED_FLAG_KEY = "SpaceDOGE_wc_autorecovered";

export function consumeWalletConnectAutoRecoveredFlag(): boolean {
  try {
    if (window.sessionStorage.getItem(AUTO_RECOVERED_FLAG_KEY) !== "1") return false;
    window.sessionStorage.removeItem(AUTO_RECOVERED_FLAG_KEY);
    return true;
  } catch {
    return false;
  }
}

// Throttles recoverFromStaleWalletConnectSession below — without this,
// a genuinely broken relay (storage clearing can't fix that) recurring
// immediately after every reload would loop forever instead of settling
// into a normal, retry-able error state.
const AUTO_RESET_GUARD_KEY = "SpaceDOGE_wc_autoreset_at";
const AUTO_RESET_GUARD_MS = 10_000;

function shouldAutoReset(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(AUTO_RESET_GUARD_KEY) ?? "0");
    return Date.now() - last > AUTO_RESET_GUARD_MS;
  } catch {
    return true;
  }
}

function markAutoReset() {
  try {
    window.sessionStorage.setItem(AUTO_RESET_GUARD_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable (private mode etc.) — fine to skip the guard
  }
}

// The single entry point for recovering from a detected stale/corrupt
// WalletConnect session — marks the "just auto-recovered" flag, then
// clears storage and reloads (resetWalletConnectStorage above). Two
// real call sites share this:
//
// 1. auth-context.tsx's global window error/unhandledrejection
//    listener — for corruption that surfaces as an uncaught error deep
//    inside the SDK's own event handling, nowhere near any promise our
//    code awaits.
// 2. useConnectAndSignIn.ts's own connectAsync() catch block — for the
//    "new tab reuses a half-finished session" case this file's
//    isStaleWalletConnectError doc-comment describes: confirmed live,
//    a user redirected to MetaMask and back landed in a FRESH tab
//    (Safari opening a new tab instead of resuming the old one — the
//    same real-device behavior documented throughout auth-context.tsx),
//    tapped Connect Wallet there, and hit this error as a normal
//    rejected promise from connectAsync() — caught by our own try/catch,
//    so it never reaches the global listener at all. Without this
//    second call site, that click just showed the raw SDK error message
//    forever: retrying only replayed the exact same corrupted read,
//    since nothing ever cleared the storage causing it.
//
// Both call sites share the same 10s throttle (shouldAutoReset above)
// so they can never double-trigger a reload loop between them.
export function recoverFromStaleWalletConnectSession(source: string) {
  if (!shouldAutoReset()) {
    walletLog("stale WalletConnect error seen again within 10s — not auto-resetting again", { source });
    return;
  }
  markAutoReset();
  walletLog("stale WalletConnect session detected — clearing storage and reloading", { source });
  try {
    window.sessionStorage.setItem(AUTO_RECOVERED_FLAG_KEY, "1");
  } catch {
    // non-fatal — worst case the post-reload message just doesn't show
  }
  resetWalletConnectStorage();
}
