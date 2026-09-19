"use client";

import { useEffect, useRef, useState } from "react";

// A single unconfirmed tap on a match's own "Quit" button used to
// instantly forfeit (submits a hardcoded 0 score, no undo) — sitting
// in the top-right corner of the fullscreen mobile game view, exactly
// where a thumb naturally rests/reaches during frantic two-handed
// portrait play. Confirmed live as a real, costly accident: a player
// doing well (rank #2, ~537 real PTS, 1 second of mission time left)
// ended up scored a flat 0/LOSS on both their own screen and the
// match results — the only code path that produces that exact shape
// (banked points, which a hit can never touch, gone along with carry)
// is this button's hardcoded quit payload, not any in-game mechanic.
//
// Arms on the first tap (shows a distinct "tap again" label for a few
// seconds, styled as an active warning) and only actually quits on a
// second, deliberate tap within that window; not tapping again lets
// it silently re-arm to the normal label, the same "hold to delete"
// pattern used elsewhere for irreversible actions.
export function QuitMatchButton({ onQuit, label, confirmLabel }: { onQuit: () => void; label: string; confirmLabel: string }) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  function handleClick() {
    if (armed) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setArmed(false);
      onQuit();
      return;
    }
    setArmed(true);
    timerRef.current = setTimeout(() => setArmed(false), 3000);
  }

  return (
    <button
      onClick={handleClick}
      className={`absolute right-3 top-3 z-10 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide backdrop-blur transition ${
        armed
          ? "border-risk/60 bg-risk-soft text-risk"
          : "border-white/20 bg-black/50 text-white/70 hover:border-risk/40 hover:text-risk"
      }`}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
