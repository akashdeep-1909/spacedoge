import { LEGACY_SHAPE_ALIAS, ROCKET_SHAPES, type RocketShapeKey } from "@/lib/shop-shared";

// Blends a base hull color toward the ship's chosen accent color by
// `amount` (0 = pure base, 1 = pure tint) — used below so a rocket's
// color purchase reads clearly across the WHOLE hull, not just a small
// accent (confirmed too subtle to tell two colors apart at a glance
// when this only tinted a cockpit dot). Silently falls back to the
// base color for a malformed hex (e.g. mid-typing in the admin color
// picker) rather than throwing — this runs every animation frame, so
// it must never crash the canvas.
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

// Same idea as blendHex but returns an rgba() string with explicit
// alpha — used by shapes (Comet's tail, Saucer's under-glow) that need
// a translucent fill rather than a flat blended color.
function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 0xff, g = (v >> 8) & 0xff, b = v & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
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

// shapeKey can be: one of the 6 real shapes (ROCKET_SHAPES), one of
// the 3 legacy Phase 1 keys (LEGACY_SHAPE_ALIAS — real WalletShopItem
// rows already sold under the old model), or null/unrecognized (every
// bot ship, and "you" with nothing equipped) — all three cases must
// resolve to a real drawable shape, never a crash or a blank ship.
function resolveShapeKey(shapeKey: string | null | undefined): RocketShapeKey {
  if (shapeKey && (ROCKET_SHAPES as readonly string[]).includes(shapeKey)) return shapeKey as RocketShapeKey;
  if (shapeKey && LEGACY_SHAPE_ALIAS[shapeKey]) return LEGACY_SHAPE_ALIAS[shapeKey];
  return "ROCKET";
}

interface ShapeDrawParams {
  scale: number;
  dpr: number;
  color: string;
  flameLen: number;
}
type ShapeDrawer = (ctx: CanvasRenderingContext2D, p: ShapeDrawParams) => void;

// A single rear-facing engine jet, shared by the shapes that actually
// have one rear engine (Rocket, Wedge) — Fighter draws two of these
// itself (one per boom); Saucer/Orb/Comet have their own bespoke
// thrust visuals (an under-glow ring, twin side puffs, and a long
// wispy tail respectively) since none of them read as "one jet out the
// back" the way a rocket does.
function drawJetFlame(ctx: CanvasRenderingContext2D, p: ShapeDrawParams, lenMult: number, halfWidth: number) {
  const { scale, dpr, flameLen } = p;
  const len = flameLen * lenMult;
  const fg = ctx.createLinearGradient(-12 * scale * dpr, 0, -len, 0);
  fg.addColorStop(0, "rgba(244,193,93,0)");
  fg.addColorStop(0.45, "rgba(244,193,93,.95)");
  fg.addColorStop(1, "rgba(137,199,255,.85)");
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(-12 * scale * dpr, -halfWidth * scale * dpr);
  ctx.lineTo(-len, 0);
  ctx.lineTo(-12 * scale * dpr, halfWidth * scale * dpr);
  ctx.closePath();
  ctx.fill();
}

// --- ROCKET — the classic silhouette. Identical path math to the
// original (pre-Phase-2) ship, since it already reads well and is
// this feature's own "no shape equipped" default look — kept
// byte-for-byte so nothing changes for a bot or an unequipped "you". ---
function drawRocket(ctx: CanvasRenderingContext2D, p: ShapeDrawParams) {
  const { scale, dpr, color } = p;
  drawJetFlame(ctx, p, 1, 4);
  ctx.fillStyle = blendHex("#aeb8c5", color, 0.4);
  ctx.beginPath();
  ctx.moveTo(-7 * scale * dpr, -5 * scale * dpr);
  ctx.lineTo(-14 * scale * dpr, -10 * scale * dpr);
  ctx.lineTo(-11 * scale * dpr, -2 * scale * dpr);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-7 * scale * dpr, 5 * scale * dpr);
  ctx.lineTo(-14 * scale * dpr, 10 * scale * dpr);
  ctx.lineTo(-11 * scale * dpr, 2 * scale * dpr);
  ctx.closePath();
  ctx.fill();
  const body = ctx.createLinearGradient(0, -8 * scale * dpr, 0, 8 * scale * dpr);
  body.addColorStop(0, blendHex("#ffffff", color, 0.25));
  body.addColorStop(0.45, blendHex("#d8e1eb", color, 0.3));
  body.addColorStop(1, blendHex("#7f8b99", color, 0.35));
  ctx.fillStyle = body;
  const noseX = 15 * scale * dpr;
  ctx.beginPath();
  ctx.moveTo(noseX, 0);
  ctx.quadraticCurveTo(6 * scale * dpr, -8 * scale * dpr, -9 * scale * dpr, -6 * scale * dpr);
  ctx.lineTo(-12 * scale * dpr, 0);
  ctx.lineTo(-9 * scale * dpr, 6 * scale * dpr);
  ctx.quadraticCurveTo(6 * scale * dpr, 8 * scale * dpr, noseX, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(noseX, 0);
  ctx.quadraticCurveTo(10 * scale * dpr, -4 * scale * dpr, 8 * scale * dpr, -5 * scale * dpr);
  ctx.quadraticCurveTo(12 * scale * dpr, -2 * scale * dpr, noseX, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(4 * scale * dpr, 0, 2.7 * scale * dpr, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.9)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

// --- SAUCER — a UFO seen from above: a near-circular disc (NOT a
// stretched horizontal ellipse — every ship in this game rotates to
// face its travel direction, so an elongated disc would read as a
// thin sliver whenever it's pointed anywhere but sideways; a saucer
// doesn't "point" the way a rocket's nose does, so its body stays
// close to a circle at any rotation, with just the dome/rim-light ring
// offset toward the front to hint direction) with a dome, rim lights,
// and a soft under-glow instead of a rear jet (a saucer glides, it
// doesn't have one engine pointing backward). ---
function drawSaucer(ctx: CanvasRenderingContext2D, p: ShapeDrawParams) {
  const { scale, dpr, color } = p;
  const glowR = 10 * scale * dpr;
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
  glow.addColorStop(0, hexWithAlpha(color, 0.5));
  glow.addColorStop(1, hexWithAlpha(color, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, glowR, 0, Math.PI * 2);
  ctx.fill();

  const body = ctx.createLinearGradient(0, -6 * scale * dpr, 0, 6 * scale * dpr);
  body.addColorStop(0, blendHex("#e7ecf1", color, 0.3));
  body.addColorStop(0.5, blendHex("#aeb8c5", color, 0.35));
  body.addColorStop(1, blendHex("#6d7684", color, 0.4));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, 8.5 * scale * dpr, 7 * scale * dpr, 0, 0, Math.PI * 2);
  ctx.fill();

  // Dome offset toward the nose (+x) so the disc still reads as
  // "facing" its travel direction without needing to stretch the
  // whole body that way.
  const dome = ctx.createRadialGradient(2 * scale * dpr, -2 * scale * dpr, 0, 2 * scale * dpr, -1 * scale * dpr, 4.5 * scale * dpr);
  dome.addColorStop(0, blendHex("#ffffff", color, 0.15));
  dome.addColorStop(1, blendHex("#c7cfd8", color, 0.35));
  ctx.fillStyle = dome;
  ctx.beginPath();
  ctx.arc(2 * scale * dpr, -1 * scale * dpr, 4.5 * scale * dpr, 0, Math.PI * 2);
  ctx.fill();

  // Rim lights all the way around the disc's edge.
  ctx.fillStyle = color;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 7.5 * scale * dpr, Math.sin(a) * 6.2 * scale * dpr, 0.9 * scale * dpr, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- ORB — a small glowing drone: a core sphere, a halo ring, twin
// side thruster puffs (not one rear jet — an orb reads as hovering,
// nudged along by small stabilizers on either side). ---
function drawOrb(ctx: CanvasRenderingContext2D, p: ShapeDrawParams) {
  const { scale, dpr, color, flameLen } = p;
  for (const side of [-1, 1]) {
    const len = flameLen * 0.45;
    const cy = side * 4 * scale * dpr;
    const fg = ctx.createLinearGradient(-6 * scale * dpr, cy, -6 * scale * dpr - len, cy);
    fg.addColorStop(0, "rgba(244,193,93,0)");
    fg.addColorStop(1, "rgba(244,193,93,.85)");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.ellipse(-6 * scale * dpr - len / 2, cy, len / 2, 1.5 * scale * dpr, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = hexWithAlpha(color, 0.55);
  ctx.lineWidth = 1.2 * dpr;
  ctx.beginPath();
  ctx.ellipse(0, 0, 9 * scale * dpr, 4 * scale * dpr, 0, 0, Math.PI * 2);
  ctx.stroke();

  const body = ctx.createRadialGradient(-2 * scale * dpr, -2 * scale * dpr, scale * dpr, 0, 0, 8 * scale * dpr);
  body.addColorStop(0, blendHex("#ffffff", color, 0.15));
  body.addColorStop(0.6, blendHex("#c7cfd8", color, 0.4));
  body.addColorStop(1, blendHex("#6d7684", color, 0.5));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, 7 * scale * dpr, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(2 * scale * dpr, 0, 2.2 * scale * dpr, 0, Math.PI * 2);
  ctx.fill();
}

// --- WEDGE — a stealth interceptor: flat, angular, all straight
// edges (no curves anywhere), a central spine ridge, a narrow slit
// cockpit instead of a round dot. ---
function drawWedge(ctx: CanvasRenderingContext2D, p: ShapeDrawParams) {
  const { scale, dpr, color } = p;
  drawJetFlame(ctx, p, 0.85, 3);

  ctx.fillStyle = blendHex("#aeb8c5", color, 0.4);
  ctx.beginPath();
  ctx.moveTo(-6 * scale * dpr, -3 * scale * dpr);
  ctx.lineTo(-13 * scale * dpr, -9 * scale * dpr);
  ctx.lineTo(-9 * scale * dpr, -2 * scale * dpr);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-6 * scale * dpr, 3 * scale * dpr);
  ctx.lineTo(-13 * scale * dpr, 9 * scale * dpr);
  ctx.lineTo(-9 * scale * dpr, 2 * scale * dpr);
  ctx.closePath();
  ctx.fill();

  const body = ctx.createLinearGradient(0, -6 * scale * dpr, 0, 6 * scale * dpr);
  body.addColorStop(0, blendHex("#ffffff", color, 0.3));
  body.addColorStop(0.5, blendHex("#c7cfd8", color, 0.35));
  body.addColorStop(1, blendHex("#6d7684", color, 0.4));
  ctx.fillStyle = body;
  const noseX = 17 * scale * dpr;
  ctx.beginPath();
  ctx.moveTo(noseX, 0);
  ctx.lineTo(2 * scale * dpr, -6 * scale * dpr);
  ctx.lineTo(-10 * scale * dpr, -4 * scale * dpr);
  ctx.lineTo(-10 * scale * dpr, 4 * scale * dpr);
  ctx.lineTo(2 * scale * dpr, 6 * scale * dpr);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = blendHex("#2a2f38", color, 0.15);
  ctx.lineWidth = dpr;
  ctx.beginPath();
  ctx.moveTo(noseX, 0);
  ctx.lineTo(-10 * scale * dpr, 0);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(6 * scale * dpr, -1.5 * scale * dpr);
  ctx.lineTo(2 * scale * dpr, -1.5 * scale * dpr);
  ctx.lineTo(2 * scale * dpr, 1.5 * scale * dpr);
  ctx.lineTo(6 * scale * dpr, 1.5 * scale * dpr);
  ctx.closePath();
  ctx.fill();
}

// --- COMET — a small round nucleus trailing a long, wispy, layered
// tail (most of a comet's silhouette IS the tail, not the head). ---
function drawComet(ctx: CanvasRenderingContext2D, p: ShapeDrawParams) {
  const { scale, dpr, color, flameLen } = p;
  const tailLen = flameLen * 2.2;
  for (let i = 0; i < 3; i++) {
    const layerLen = tailLen * (1 - i * 0.28);
    const halfWidth = (5 - i * 1.3) * scale * dpr;
    ctx.fillStyle = hexWithAlpha(color, 0.5 - i * 0.13);
    ctx.beginPath();
    ctx.moveTo(-4 * scale * dpr, -halfWidth);
    ctx.lineTo(-layerLen, 0);
    ctx.lineTo(-4 * scale * dpr, halfWidth);
    ctx.closePath();
    ctx.fill();
  }
  const body = ctx.createRadialGradient(1 * scale * dpr, -1 * scale * dpr, 0.5 * scale * dpr, 0, 0, 6 * scale * dpr);
  body.addColorStop(0, blendHex("#ffffff", color, 0.1));
  body.addColorStop(0.6, blendHex("#e7ecf1", color, 0.35));
  body.addColorStop(1, blendHex("#aeb8c5", color, 0.5));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(2 * scale * dpr, 0, 5.5 * scale * dpr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(4 * scale * dpr, 0, 1.8 * scale * dpr, 0, Math.PI * 2);
  ctx.fill();
}

// --- FIGHTER — twin-boom: two parallel hull pods joined by a central
// wing spar, each boom with its own tail fin and its own engine jet. ---
function drawFighter(ctx: CanvasRenderingContext2D, p: ShapeDrawParams) {
  const { scale, dpr, color } = p;
  const boomOffset = 6 * scale * dpr;

  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(0, side * boomOffset);
    drawJetFlame(ctx, p, 0.8, 2.2);
    ctx.restore();
  }

  ctx.fillStyle = blendHex("#8b93a0", color, 0.3);
  ctx.beginPath();
  ctx.moveTo(2 * scale * dpr, -boomOffset);
  ctx.lineTo(6 * scale * dpr, 0);
  ctx.lineTo(2 * scale * dpr, boomOffset);
  ctx.lineTo(-4 * scale * dpr, boomOffset * 0.6);
  ctx.lineTo(-4 * scale * dpr, -boomOffset * 0.6);
  ctx.closePath();
  ctx.fill();

  for (const side of [-1, 1]) {
    const cy = side * boomOffset;
    const body = ctx.createLinearGradient(0, cy - 3 * scale * dpr, 0, cy + 3 * scale * dpr);
    body.addColorStop(0, blendHex("#ffffff", color, 0.25));
    body.addColorStop(0.5, blendHex("#d8e1eb", color, 0.3));
    body.addColorStop(1, blendHex("#7f8b99", color, 0.35));
    ctx.fillStyle = body;
    const noseX = 13 * scale * dpr;
    ctx.beginPath();
    ctx.moveTo(noseX, cy);
    ctx.quadraticCurveTo(4 * scale * dpr, cy - 3.5 * scale * dpr, -9 * scale * dpr, cy - 3 * scale * dpr);
    ctx.lineTo(-11 * scale * dpr, cy);
    ctx.lineTo(-9 * scale * dpr, cy + 3 * scale * dpr);
    ctx.quadraticCurveTo(4 * scale * dpr, cy + 3.5 * scale * dpr, noseX, cy);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = blendHex("#aeb8c5", color, 0.4);
    ctx.beginPath();
    ctx.moveTo(-9 * scale * dpr, cy - 2 * scale * dpr * side);
    ctx.lineTo(-13 * scale * dpr, cy + side * 5 * scale * dpr);
    ctx.lineTo(-11 * scale * dpr, cy);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(2 * scale * dpr, 0, 2 * scale * dpr, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.9)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

const SHAPE_DRAWERS: Record<RocketShapeKey, ShapeDrawer> = {
  ROCKET: drawRocket,
  SAUCER: drawSaucer,
  ORB: drawOrb,
  WEDGE: drawWedge,
  COMET: drawComet,
  FIGHTER: drawFighter,
};

// The exact ship draw call CoinRushArena uses for every ship in a live
// match, factored out so the Shop's live preview (components/game/
// RocketPreview.tsx) can never visually drift from what actually
// renders in-game — same path math, same shape lookup, just
// parameterized by dpr instead of closing over a per-effect local.
// Collision radius (r) is passed straight through untouched into the
// shared `scale` factor every shape draws from — cosmetics never
// resize the hitbox, only these cosmetic paths scale.
export function drawRocketShip(ctx: CanvasRenderingContext2D, opts: DrawRocketShipOptions) {
  const { x, y, angle, color, r, dpr } = opts;
  const key = resolveShapeKey(opts.shapeKey);
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
  const flameLen = opts.flameLen ?? (12 + 8 + Math.random() * 8) * scale * dpr;
  SHAPE_DRAWERS[key](ctx, { scale, dpr, color, flameLen });
  ctx.restore();
}
