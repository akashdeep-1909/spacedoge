"use client";

import { useEffect, useState } from "react";
import { getWalletLogHistory, subscribeWalletLog, clearWalletLogHistory, type WalletLogEntry } from "@/lib/walletLog";

const ENABLE_KEY = "SpaceDOGE_walletdebug";

function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

// Visit the site once with ?walletdebug=1 to turn this on — the flag is
// saved to localStorage (not sessionStorage) specifically because the
// MetaMask app-switch-and-back redirect isn't always a same-tab resume:
// when the redirect target doesn't match the tab Safari still has open
// (see src/lib/wagmi.ts's WalletConnect metadata doc-comment), Safari
// opens a genuinely NEW tab instead — which starts with its own empty
// sessionStorage. A sessionStorage-backed flag would silently turn the
// whole overlay off in exactly that tab, hiding the one failure mode
// this exists to diagnose. localStorage is shared across every tab of
// the same origin, so the panel stays on wherever the user ends up. The
// log buffer itself (src/lib/walletLog.ts) stays sessionStorage-backed
// on purpose — it's meant to show "what happened in the tab I'm looking
// at right now," which starts fresh from that tab's own mount either way.
export function WalletDebugOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [entries, setEntries] = useState<WalletLogEntry[]>([]);
  const [minimized, setMinimized] = useState(false);

  // Deliberately setState directly in this effect (not a lazy useState
  // initializer) — reading sessionStorage/URL params in an initializer
  // would evaluate window on the CLIENT's first render (before
  // hydration reconciles) while the server always renders null for
  // this component, which is exactly the server/client hydration
  // mismatch class of bug fixed in providers.tsx. Setting it here,
  // after the server-matching `false`/`[]` initial render has already
  // committed, only ever triggers an ordinary post-hydration re-render.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("walletdebug") === "1") {
      window.localStorage.setItem(ENABLE_KEY, "1");
    }
    if (params.get("walletdebug") === "0") {
      window.localStorage.removeItem(ENABLE_KEY);
    }
    setEnabled(window.localStorage.getItem(ENABLE_KEY) === "1");
    setEntries(getWalletLogHistory());
    return subscribeWalletLog(setEntries);
  }, []);

  if (!enabled) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[999] max-h-[45vh] overflow-y-auto border-t-2 border-gold bg-black/95 font-mono text-[10px] text-mint"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-gold/30 bg-black px-2 py-1">
        <span className="font-bold text-gold">wallet debug ({entries.length})</span>
        <div className="flex gap-2">
          <button onClick={() => setMinimized((v) => !v)} className="rounded border border-line px-2 py-0.5 text-muted">
            {minimized ? "expand" : "collapse"}
          </button>
          <button
            onClick={() => clearWalletLogHistory()}
            className="rounded border border-line px-2 py-0.5 text-muted"
          >
            clear
          </button>
          <button
            onClick={() => {
              window.localStorage.removeItem(ENABLE_KEY);
              setEnabled(false);
            }}
            className="rounded border border-risk px-2 py-0.5 text-risk"
          >
            hide
          </button>
        </div>
      </div>
      {!minimized && (
        <div className="space-y-1 p-2">
          {entries.length === 0 && <p className="text-muted">No wallet log entries yet.</p>}
          {entries
            .slice()
            .reverse()
            .map((entry, i) => (
              <div key={i} className="border-b border-line/30 pb-1">
                <span className="text-muted">{entry.time.slice(11, 23)} </span>
                {entry.args.map((a, j) => (
                  <span key={j}> {formatArg(a)}</span>
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
