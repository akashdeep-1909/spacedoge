import { ROCKET_SHAPE_GEOMETRY, type RocketShapeKey } from "@/lib/shop-shared";

// Blends a base hull color toward the ship's chosen accent color by
// `amount` (0 = pure base, 1 = pure tint) — used below so a rocket's
// color purchase reads clearly across the WHOLE hull, not just the
// glow + a small cockpit dot (which is all `color` affected before
// this existed, confirmed too subtle to tell two colors apart at a
// glance). Silently falls back to the base color for a malformed hex
// (e.g. mid-typing in the admin color picker) rather than throwing —
// this runs every animation frame, so it must never crash the canvas.
function blendHex(base: string, tint: string, amount: number): string {
  const b = /^#([0-9a-f]{6})$/i.exec(base);
  const t = /^#([0-9a-f]{6})$/i.exec(tint);
  if (!b || !t) return base;
  const bv = parseInt(b[1], 16);
  const tv = parseInt(t[1], 16);
  const mix = (shift: number) => {
    const bc = (bv >> shift) & 0xff;
    const tc = (tv >> shift) & 0xff;
    return Math.round(bc + (tc - bc) * amount);
  };
  const r = mix(16), g = mix(8), bl = mix(0);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

export interface DrawRocketShipOptions {
  x: number;
  y: number;
  angle: number;
  color: string;
  r: number;
  shapeKey?: string | null;
  dpr: number;
  // Static previews (the Shop's RocketPreview) pass a fixed value so
  // the flame doesn't visibly jump on every re-render; live match play
  // (CoinRushArena) leaves this unset to get the per-frame flicker —
  // see each call site's own comment for why.
  flameLen?: number;
}

// The exact ship draw call CoinRushArena uses for every ship in a live
// match, factored out so the Shop's live preview (components/game/
// RocketPreview.tsx) can never visually drift from what actually
// renders in-game — same path math, same shape-geometry lookup, just
// parameterized by dpr instead of closing over a per-effect local.
// Collision radius (r) is passed straight through untouched here too,
// same invariant CoinRushArena's own drawRocket doc-comment states:
// cosmetics never resize the hitbox, only these cosmetic paths scale.
export function drawRocketShip(ctx: CanvasRenderingContext2D, opts: DrawRocketShipOptions) {
  const { x, y, angle, color, r, shapeKey, dpr } = opts;
  const geo = ROCKET_SHAPE_GEOMETRY[(shapeKey as RocketShapeKey) ?? "VOYAGER"] ?? ROCKET_SHAPE_GEOMETRY.VOYAGER;
  const scale = r / (11.5 * dpr);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.shadowBlur = 18 * dpr;
  ctx.shadowColor = color;
  // Purely cosmetic per-frame flicker — deliberately Math.random(), not
  // a seeded rand(): in CoinRushArena this runs every draw() call for
  // every ship, and burning through the seeded stream that fast would
  // desync item/hazard respawn positions from the fairness-critical
  // map seed (doc 5.3 — every competitor must see the same layout).
  const flameLen = opts.flameLen ?? (12 + 8 + Math.random() * 8) * geo.flameLenMult * scale * dpr;
  const fg = ctx.createLinearGradient(-12 * scale * dpr, 0, -flameLen, 0);
  fg.addColorStop(0, "rgba(244,193,93,0)");
  fg.addColorStop(0.45, "rgba(244,193,93,.95)");
  fg.addColorStop(1, "rgba(137,199,255,.85)");
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(-12 * scale * dpr, -4 * scale * dpr);
  ctx.lineTo(-flameLen, 0);
  ctx.lineTo(-12 * scale * dpr, 4 * scale * dpr);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = blendHex("#aeb8c5", color, 0.4);
  ctx.beginPath();
  ctx.moveTo(-7 * scale * dpr, -5 * geo.bodyWidth * scale * dpr);
  ctx.lineTo(-14 * geo.wingLen * scale * dpr, -10 * geo.wingSpread * scale * dpr);
  ctx.lineTo(-11 * scale * dpr, -2 * geo.bodyWidth * scale * dpr);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-7 * scale * dpr, 5 * geo.bodyWidth * scale * dpr);
  ctx.lineTo(-14 * geo.wingLen * scale * dpr, 10 * geo.wingSpread * scale * dpr);
  ctx.lineTo(-11 * scale * dpr, 2 * geo.bodyWidth * scale * dpr);
  ctx.closePath();
  ctx.fill();
  // Blended toward the ship's own color (not just the original fixed
  // white->gray chrome) so a color purchase is obviously visible on
  // the whole hull at a glance, not just the glow + cockpit dot.
  const body = ctx.createLinearGradient(0, -8 * geo.bodyWidth * scale * dpr, 0, 8 * geo.bodyWidth * scale * dpr);
  body.addColorStop(0, blendHex("#ffffff", color, 0.25));
  body.addColorStop(0.45, blendHex("#d8e1eb", color, 0.3));
  body.addColorStop(1, blendHex("#7f8b99", color, 0.35));
  ctx.fillStyle = body;
  const noseX = 15 * geo.noseLen * scale * dpr;
  ctx.beginPath();
  ctx.moveTo(noseX, 0);
  ctx.quadraticCurveTo(6 * scale * dpr, -8 * geo.bodyWidth * scale * dpr, -9 * scale * dpr, -6 * geo.bodyWidth * scale * dpr);
  ctx.lineTo(-12 * scale * dpr, 0);
  ctx.lineTo(-9 * scale * dpr, 6 * geo.bodyWidth * scale * dpr);
  ctx.quadraticCurveTo(6 * scale * dpr, 8 * geo.bodyWidth * scale * dpr, noseX, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(noseX, 0);
  ctx.quadraticCurveTo(10 * scale * dpr, -4 * geo.bodyWidth * scale * dpr, 8 * scale * dpr, -5 * geo.bodyWidth * scale * dpr);
  ctx.quadraticCurveTo(12 * scale * dpr, -2 * geo.bodyWidth * scale * dpr, noseX, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(4 * scale * dpr, 0, 2.7 * scale * dpr, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.9)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}
