"use client";

import { useEffect, useRef, useState } from "react";

// Plain <input type=number value={n} onChange={...Number(e.target.value)}>
// can never be cleared with backspace — an empty string coerces to 0,
// which immediately redraws as the literal digit "0" instead of a
// blank field. Keeping the field's own text separate from the numeric
// value fixes that, and lets typing a too-large number clamp straight
// down to whatever's actually available instead of just erroring.
export function AmountField({
  value,
  max,
  min = 0,
  step,
  onChange,
}: {
  value: number;
  max: number;
  min?: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(() => String(value));
  // Tracks the last value *this component* emitted via onChange, so an
  // external change to `value` (e.g. a parent syncing in a
  // server-loaded default after mount — confirmed live: the withdraw
  // page's minimum-withdrawal amount silently updated internally but
  // the input kept showing the old default) can be told apart from an
  // echo of the user's own typing, and only the former resyncs `text`.
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (value !== lastEmitted.current) {
      setText(String(value));
      lastEmitted.current = value;
    }
  }, [value]);

  function commit(raw: string) {
    setText(raw);
    if (raw.trim() === "") {
      lastEmitted.current = 0;
      onChange(0);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    const clamped = Math.min(parsed, max);
    if (clamped !== parsed) setText(String(clamped));
    lastEmitted.current = clamped;
    onChange(clamped);
  }

  return (
    <input
      type="number"
      inputMode="decimal"
      min={min}
      step={step}
      value={text}
      onChange={(e) => commit(e.target.value)}
      className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm"
    />
  );
}
