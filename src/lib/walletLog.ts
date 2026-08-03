// Shared by auth-context.tsx and ConnectWalletButton.tsx — was two
// copy-pasted implementations, split out so there's exactly one log
// buffer for WalletDebugOverlay.tsx to read from (a per-file console
// wrapper couldn't feed a shared on-screen panel).
//
// The on-screen panel exists because the hardest bug in this flow only
// reproduces on a real phone after an app-switch to MetaMask and back —
// nowhere near a Mac's Safari remote inspector. sessionStorage persists
// this buffer across that redirect (a real navigation, not just a
// backgrounded tab), so whatever happened is still readable afterward.

export interface WalletLogEntry {
  time: string;
  args: unknown[];
}

const HISTORY_KEY = "SpaceDOGE_walletlog_history";
const MAX_ENTRIES = 200;

type Listener = (entries: WalletLogEntry[]) => void;
const listeners = new Set<Listener>();

function readHistory(): WalletLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as WalletLogEntry[]) : [];
  } catch {
    return [];
  }
}

function writeHistory(entries: WalletLogEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // sessionStorage full/unavailable — logging is diagnostic only, never fatal.
  }
}

export function walletLog(...args: unknown[]) {
  console.log("[wallet]", ...args);
  const entries = [...readHistory(), { time: new Date().toISOString(), args }].slice(-MAX_ENTRIES);
  writeHistory(entries);
  for (const listener of listeners) listener(entries);
}

export function getWalletLogHistory(): WalletLogEntry[] {
  return readHistory();
}

export function clearWalletLogHistory() {
  writeHistory([]);
  for (const listener of listeners) listener([]);
}

export function subscribeWalletLog(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function errorDetails(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, cause: err.cause, stack: err.stack };
  }
  return { raw: err };
}
