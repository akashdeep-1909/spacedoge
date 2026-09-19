"use client";

// Recharts tooltip content: value leads (bold, high contrast), the
// series/date follows as secondary text — per the dataviz skill's
// "values lead, labels follow" rule. Supports one or several series
// per point (multi-series charts pass one entry per line/area).
export function ChartTooltip({
  active,
  payload,
  label,
  unit,
  color,
  formatValue,
  formatLabel,
}: {
  active?: boolean;
  payload?: { value: number; name?: string; color?: string }[];
  label?: string;
  unit: string;
  color?: string;
  formatValue: (n: number) => string;
  formatLabel?: (label: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    // max-w-[200px] + flex-wrap below — with no width constraint at
    // all, this tooltip just grew to fit its longest line ("0.0054
    // DOGE/MH/s/day · Reference Rate") on one row, which needs more
    // horizontal room than a real phone's chart width has. Recharts'
    // own edge-clamping (the default `allowEscapeViewBox: {x:false}`)
    // can only reposition the tooltip within the chart's own bounding
    // box — it can't shrink unwrapped content, so once that content
    // was wider than the whole chart, there was no valid position
    // left of clipping through the right edge regardless of which
    // point was hovered. Confirmed live as "detail hides on hover"
    // (the Reference Rate line was cut off, not just tight). Wrapping
    // the value+unit and the "· name" suffix onto separate flex items
    // lets long entries break onto their own line instead.
    <div className="game-panel max-w-[200px] rounded-lg border border-line px-3 py-2 text-xs shadow-xl">
      <p className="text-muted">{label !== undefined && formatLabel ? formatLabel(label) : label}</p>
      {payload.map((p, i) => (
        <p key={i} className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-bold text-foreground">
          <span className="inline-flex shrink-0 items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 shrink-0 rounded-full" style={{ background: p.color ?? color }} />
            {formatValue(p.value)}
            {unit ? ` ${unit}` : ""}
          </span>
          {payload.length > 1 && p.name && <span className="font-normal text-muted">· {p.name}</span>}
        </p>
      ))}
    </div>
  );
}
