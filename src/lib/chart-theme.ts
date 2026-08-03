// Theme roles pulled from the app's own CSS custom properties (see
// globals.css) rather than a generic chart palette, so every chart
// reads as part of Space DOGE, not a bolted-on widget. The
// status->hue mapping is fixed and reused everywhere a status appears
// (badges, stat cards, charts): risk=red (needs attention/unmatched/
// pending-risk), gold=in-progress/pending, mint=good/credited/
// completed. Violet rounds out a 4th category when one is needed
// (e.g. fees). Shared by src/app/dashboard/mining/page.tsx and
// src/app/admin/page.tsx so both draw from one source of truth.
export const CHART = {
  mint: "#2dd4a7",
  mintSoft: "rgba(45,212,167,.12)",
  gold: "#c9a227",
  goldSoft: "rgba(201,162,39,.12)",
  risk: "#ef4444",
  riskSoft: "rgba(239,68,68,.12)",
  violet: "#8b7cf0",
  muted: "#9aa1ab",
  grid: "rgba(255,255,255,.08)",
  panel2: "#1b1f26",
} as const;
