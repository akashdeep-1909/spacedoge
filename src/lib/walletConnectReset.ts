import { walletLog, errorDetails } from "@/lib/walletLog";

// WalletConnect's own SDK persists pairing/session/keychain state under
// keys and IndexedDB databases literally prefixed "wc@" (confirmed
// against the actual bundled source, not guessed) — separate from
// anything this app stores itself (SpaceDOGE_* keys, the httpOnly
// session cookie). After enough repeated connect/disconnect/reload
// cycles that local state can end up referencing a pairing/topic the
// relay no longer recognizes — surfacing as an uncaught "No matching
// key. session topic doesn't exist: ..." thrown from deep inside
// @walletconnect/sign-client (confirmed via a real-device crash report),
// or an "onRelayMessage" error with no useful message. This wipes only
// that WalletConnect-specific state and reloads, which is the standard
// fix for that class of SDK-internal corruption — never touches the
// actual httpOnly session cookie, so a real sign-in isn't lost.
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
// that mean "local session/keychain state is stale/corrupt" — none of
// these are recoverable by retrying, only by clearing the storage above.
export function isStaleWalletConnectError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /no matching key\.?\s*session topic doesn't exist|onrelaymessage|pairing topic doesn't exist|no matching key\.?\s*pairing/i.test(
    message
  );
}
