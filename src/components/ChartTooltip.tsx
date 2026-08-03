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
    <div className="game-panel rounded-lg border border-line px-3 py-2 text-xs shadow-xl">
      <p className="text-muted">{label !== undefined && formatLabel ? formatLabel(label) : label}</p>
      {payload.map((p, i) => (
        <p key={i} className="mt-0.5 flex items-center gap-1.5 font-bold text-foreground">
          <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: p.color ?? color }} />
          {formatValue(p.value)}
          {unit ? ` ${unit}` : ""}
          {payload.length > 1 && p.name && <span className="font-normal text-muted">· {p.name}</span>}
        </p>
      ))}
    </div>
  );
}
