"use client";

import { useState } from "react";

// A single horizontal bar split into labeled segments — for compact
// part-to-whole composition (balance mix, payout breakdown) where a
// full chart library is overkill for one bar. 2px surface gaps
// separate segments per the mark spec; labels sit below rather than
// crammed inside, so nothing gets clipped on a narrow slice.
export function CompositionBar({
  segments,
  formatValue = (n) => n.toFixed(6),
}: {
  segments: { label: string; value: number; color: string }[];
  formatValue?: (n: number) => string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const [hovered, setHovered] = useState<number | null>(null);
  return (
    <div>
      <div className="flex h-6 gap-0.5 overflow-hidden rounded-full">
        {segments.map((s, i) => (
          <div
            key={s.label}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            title={`${s.label}: ${formatValue(s.value)}`}
            className="h-full transition-opacity"
            style={{
              width: `${Math.max((s.value / total) * 100, s.value > 0 ? 1.5 : 0)}%`,
              background: s.color,
              opacity: hovered === null || hovered === i ? 1 : 0.35,
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s, i) => (
          <div
            key={s.label}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className="flex items-center gap-1.5 text-[11px]"
            style={{ opacity: hovered === null || hovered === i ? 1 : 0.5 }}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="text-muted">{s.label}</span>
            <span className="font-bold tabular-nums text-foreground">
              {((s.value / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
