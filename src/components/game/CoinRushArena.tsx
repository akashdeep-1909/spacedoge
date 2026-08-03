"use client";

import { useEffect, useRef, useState, useCallback, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { seededRandom, DIFFICULTY_BY_MODE, THEME_BY_MODE, pickBotNames, botScore } from "@/lib/game-config";
import type { GameMode } from "@/generated/prisma/enums";

// Coin Rush Arena — visuals ported from the "Orbital Extraction" 4-player
// prototype (rockets, USDT coins, a bank vault that cycles open/closed,
// Hunter/Dasher/Mine hazards, mission-control HUD, a live leaderboard).
// Damage model is deliberately NOT the prototype's hull-percentage —
// this uses 3 discrete lives instead: a hit costs exactly 1 life plus a
// small fixed chunk of carried points (never all of it), and losing all
// 3 lives ends the ship's run (for the human, that ends the match
// immediately — it's a loss, not a respawn-and-continue). A hazard
// still relocates elsewhere after landing a hit, and a brief post-hit
// invulnerability window stops one overlapping cluster of hazards from
// costing more than 1 life at once.
//
// NOT ported: the prototype's own local prize math (fixed 20% fee, fixed
// per-rank USDT payouts, fake wallet addresses) and its non-functional
// invite-link lobby. This app already has a real room-selection UI
// (/dashboard/play) and a real server-side settlement engine using the
// correct v2 economy formula (score-proportional payouts among the top
// 3). The Prize Pool figure shown here is the real pool for this match,
// passed in as a prop — never fabricated. This component only ever
// reports a raw score via onComplete(); the real reward is always
// computed server-side, never here.
//
// Fairness (doc 5.3): every item/hazard position below is derived from
// seededRandom(mapSeed) so the layout is reproducible from the seed a
// real backend would issue. Bot AI is local/visual only — the settle
// route recomputes bot scores server-side from the same seed rather than
// trusting client-reported bot behavior (see that route's "known gap"
// comment).

interface ItemEntity {
  x: number; y: number; r: number;
  kind: "bronze" | "silver" | "gold" | "dogecoin" | "cash" | "dogecore";
  value: number; rare: boolean; spin: number;
}
interface MineEntity { x: number; y: number; r: number; vx: number; vy: number; phase: number }
interface HunterEntity { x: number; y: number; r: number; vx: number; vy: number; speed: number; phase: number }
interface DasherEntity {
  x: number; y: number; r: number;
  state: "aim" | "dash";
  timer: number;
  vx: number; vy: number;
  dirX: number; dirY: number;
}
// Fire's actual projectile — a real bullet the rocket shoots and that
// travels/collides, not an invisible instant-kill radius around the
// ship (that's what the circle-ring status indicator alone used to be,
// and read as "aura," not "the rocket is firing").
interface BulletEntity { x: number; y: number; vx: number; vy: number; life: number }
interface ShipEntity {
  x: number; y: number; r: number; vx: number; vy: number; angle: number;
  color: string; name: string; isYou: boolean;
  lives: number; carry: number; banked: number;
  active: boolean; invuln: number; knockback: number;
  speed: number;
  magnet: number; shield: number; boost: number; fire: number;
}

const ITEM_STYLES: Record<ItemEntity["kind"], { r: number; value: number; rare: boolean; glyph: string }> = {
  bronze: { r: 7, value: 1, rare: false, glyph: "USDT" },
  silver: { r: 8, value: 3, rare: false, glyph: "USDT" },
  dogecoin: { r: 9, value: 5, rare: false, glyph: "Đ" },
  gold: { r: 10, value: 10, rare: true, glyph: "USDT" },
  cash: { r: 10, value: 15, rare: true, glyph: "$" },
  dogecore: { r: 12, value: 0, rare: true, glyph: "★" },
};

// Doc 5.1 covers coins/traps/boosts — this hazard set is an additional
// local-difficulty layer on top of that. A hit costs one life (of 4)
// plus a small fixed chunk of carried points — never all of it, so
// grinding out a run always feels like it's building toward something.
// A ship that loses all its lives is done for the match (for the human,
// that ends it immediately); there is no respawn.
//
// Tuned up from an earlier pass that ended matches in just a few
// seconds: that field (6 hunters/3 dashers/5 mines, 3 lives, a 1.2s
// invuln window) was dense enough that even careful play burned all 3
// lives almost immediately. More lives, more recovery time after a
// hit, a thinner hazard field, and a gentler late-match speed ramp
// below all push toward "skill determines how well you do," not
// "one bad patch of hazards ends the run before it starts."
// Base carry-loss-on-hit and invuln window at "Moderate" difficulty —
// scaled per mode below via ModeDifficulty.carryPenaltyMult/hitInvulnSec
// (src/lib/game-config.ts).
const BASE_HUNTER_CARRY_PENALTY = 5;
const BASE_DASHER_CARRY_PENALTY = 8;
const BASE_MINE_CARRY_PENALTY = 6;
const BOT_COLORS = ["#3cc4ff", "#4af4af", "#ff7a7a"];

function shortAddr(addr: string) {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

// 3-segment life bar — lit segments are lives remaining, dim segments
// are lives already lost. Shown instead of a raw number so "how much
// margin do I have left" reads at a glance.
function LifeBar({ lives, total }: { lives: number; total: number }) {
  return (
    <span style={{ display: "flex", justifyContent: "center", gap: 3, marginTop: 3 }}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          style={{
            width: 14, height: 5, borderRadius: 3,
            background: i < lives ? "#ff6767" : "rgba(255,255,255,.12)",
            boxShadow: i < lives ? "0 0 6px rgba(255,103,103,.7)" : "none",
          }}
        />
      ))}
    </span>
  );
}

// Mirrors the prototype's `.stat` card exactly: glass panel, small
// uppercase label, bold value with an optional sub-line, and a 2px
// accent bar along the bottom edge (its `.stat:after`).
function StatCard({ accent, label, value, sub, subColor }: { accent: string; label: string; value: string; sub?: ReactNode; subColor?: string }) {
  return (
    <div
      style={{
        position: "relative",
        padding: "7px 5px 9px",
        borderRadius: 11,
        textAlign: "center",
        background: "rgba(8,14,22,.82)",
        border: "1px solid rgba(255,255,255,.12)",
        backdropFilter: "blur(12px)",
      }}
    >
      <p style={{ fontSize: 8.5, letterSpacing: ".07em", textTransform: "uppercase", color: "#b7c4d3", fontWeight: 600, margin: "0 0 3px" }}>{label}</p>
      <p style={{ fontSize: 13, color: "#fff", lineHeight: 1.15, fontWeight: 800, margin: 0 }}>
        {value}
        {sub && (
          <small style={{ display: "block", marginTop: 3, fontSize: 9, letterSpacing: ".02em", color: subColor ?? "#a7c0d3", fontWeight: 700 }}>
            {sub}
          </small>
        )}
      </p>
      <div style={{ position: "absolute", left: 10, right: 10, bottom: 0, height: 2, borderRadius: 4, background: accent, opacity: 0.9 }} />
    </div>
  );
}

const JOYSTICK_BASE_R = 46; // px (CSS px, not canvas/DPR px)
const JOYSTICK_KNOB_R = 22;

// Fixed on-screen thumbstick — opt-in alternative to the default
// drag-anywhere-on-canvas steering (see joystickEnabled in
// CoinRushArena). onChange reports a direction vector whose length is
// how far the knob is tilted from center (0 = centered, 1 = maxed out),
// not just a boolean/unit vector — the game loop's existing
// deadzone-then-full-speed logic (same one keyboard input already
// drives) handles turning that into movement, so this component only
// has to own the drag/knob-position bookkeeping.
function Joystick({ onChange }: { onChange: (dx: number, dy: number, active: boolean) => void }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  function updateFromPoint(clientX: number, clientY: number) {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const rawX = clientX - cx;
    const rawY = clientY - cy;
    const dist = Math.hypot(rawX, rawY);
    const max = rect.width / 2;
    const clampedDist = Math.min(dist, max);
    const angle = Math.atan2(rawY, rawX);
    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;
    setKnob({ x: knobX, y: knobY });
    onChange(max > 0 ? knobX / max : 0, max > 0 ? knobY / max : 0, true);
  }

  function handlePointerDown(e: ReactPointerEvent) {
    e.preventDefault();
    pointerIdRef.current = e.pointerId;
    setDragging(true);
    updateFromPoint(e.clientX, e.clientY);
  }

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: PointerEvent) {
      if (e.pointerId !== pointerIdRef.current) return;
      updateFromPoint(e.clientX, e.clientY);
    }
    function onUp(e: PointerEvent) {
      if (e.pointerId !== pointerIdRef.current) return;
      pointerIdRef.current = null;
      setDragging(false);
      setKnob({ x: 0, y: 0 });
      onChange(0, 0, false);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  return (
    <div
      ref={baseRef}
      onPointerDown={handlePointerDown}
      className="pointer-events-auto absolute z-10 rounded-full"
      style={{
        left: 14, bottom: 14, width: JOYSTICK_BASE_R * 2, height: JOYSTICK_BASE_R * 2,
        background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.16)",
        backdropFilter: "blur(6px)", touchAction: "none",
      }}
    >
      <div
        className="absolute rounded-full"
        style={{
          width: JOYSTICK_KNOB_R * 2, height: JOYSTICK_KNOB_R * 2, left: "50%", top: "50%",
          transform: `translate(-50%, -50%) translate(${knob.x}px, ${knob.y}px)`,
          background: dragging ? "rgba(137,199,255,.35)" : "rgba(255,255,255,.2)",
          border: "1px solid rgba(255,255,255,.4)",
          transition: dragging ? "none" : "transform 120ms ease-out, background 120ms ease-out",
        }}
      />
    </div>
  );
}

export function CoinRushArena({
  mapSeed,
  durationSec,
  startElapsedSec = 0,
  onComplete,
  fullscreen = false,
  missionTitle,
  prizePoolUsdt,
  walletAddress,
  nickname,
  mode,
  opponents,
}: {
  mapSeed: string;
  durationSec: number;
  // Resuming a match already in progress (e.g. after a page reload —
  // see GET /api/matches/active) starts the clock partway through
  // instead of at 0, so the remaining time on screen matches what the
  // server already considers elapsed.
  startElapsedSec?: number;
  onComplete: (result: { score: number; durationPlayedSec: number }) => void;
  fullscreen?: boolean;
  missionTitle: string;
  prizePoolUsdt: number;
  walletAddress?: string;
  nickname?: string | null;
  mode: GameMode;
  // Real identity for the other 3 ships (e.g. from GET
  // /api/matches/[id]/roster on a "Play with Friends" lobby match),
  // ordered to match the ship slots below. Omitted entirely for
  // solo/instant-play (always vs bots), which falls back to the
  // seeded bot-pool name for every seat as before.
  opponents?: { isBot: boolean; label: string }[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const youName = nickname || (walletAddress ? shortAddr(walletAddress) : "YOU");
  const diff = DIFFICULTY_BY_MODE[mode] ?? DIFFICULTY_BY_MODE.EXPLORER_RUSH;
  const theme = THEME_BY_MODE[mode] ?? THEME_BY_MODE.EXPLORER_RUSH;

  // On-screen joystick — off by default (drag-anywhere-to-steer stays
  // the default control scheme), user's own persisted choice per
  // device. A ref mirror alongside the state so the game loop (a plain
  // closure inside the setup effect below, not itself reactive) can
  // read the live value every frame without that effect needing to
  // depend on — and therefore fully re-run/reset the match for — a
  // control-scheme toggle.
  const [joystickEnabled, setJoystickEnabled] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem("SpaceDOGE_joystick") === "1"
  );
  const joystickEnabledRef = useRef(joystickEnabled);
  const joystickInputRef = useRef({ active: false, dx: 0, dy: 0 });
  useEffect(() => {
    joystickEnabledRef.current = joystickEnabled;
    if (typeof window !== "undefined") window.localStorage.setItem("SpaceDOGE_joystick", joystickEnabled ? "1" : "0");
  }, [joystickEnabled]);

  const [hud, setHud] = useState({
    time: Math.max(0, durationSec - startElapsedSec),
    vaultOpen: true,
    rank: 4,
    lives: diff.startLives,
    youBanked: 0,
    youCarry: 0,
    board: [] as { name: string; color: string; isYou: boolean; carry: number; banked: number }[],
  });
  const [ended, setEnded] = useState(false);
  const [countdown, setCountdown] = useState<number | "GO" | null>(3);

  const gRef = useRef<{
    W: number; H: number; DPR: number;
    time: number; running: boolean; elapsed: number;
    rand: () => number;
    pointer: { x: number; y: number; active: boolean };
    keys: { up: boolean; down: boolean; left: boolean; right: boolean };
    ships: ShipEntity[];
    items: ItemEntity[];
    mines: MineEntity[];
    hunters: HunterEntity[];
    dashers: DasherEntity[];
    bullets: BulletEntity[];
    bankZone: { homeX: number; homeY: number; x: number; y: number; r: number; phase: number; open: boolean };
    particles: { x: number; y: number; vx: number; vy: number; life: number; color: string }[];
    floaters: { x: number; y: number; vy: number; life: number; text: string; color: string }[];
    dogeCoreT: number;
    boostCd: number; shieldCd: number; magnetCd: number;
    // Fire has no cooldown to recharge — it's a single use for the
    // whole match, gated by this flag instead of a Cd timer.
    fireUsed: boolean;
    // Time until the next burst goes out while fire is active — separate
    // from `fireUsed`, which just gates whether fire can be triggered at
    // all this match.
    fireShotCd: number;
    last: number;
    raf: number;
  } | null>(null);

  const spawnItem = useCallback((rand: () => number, W: number, H: number, dpr: number, topMargin: number, bottomMargin: number): ItemEntity => {
    const roll = rand();
    let kind: ItemEntity["kind"] = "bronze";
    if (roll > 0.45) kind = "silver";
    if (roll > 0.68) kind = "dogecoin";
    if (roll > 0.85) kind = "gold";
    if (roll > 0.93) kind = "cash";
    if (roll > 0.97) kind = "dogecore";
    const style = ITEM_STYLES[kind];
    const sideMargin = 24 * dpr;
    return {
      x: sideMargin + rand() * (W - sideMargin * 2),
      y: topMargin + rand() * (H - topMargin - bottomMargin),
      r: style.r * dpr,
      kind,
      value: style.value,
      rare: style.rare,
      spin: rand() * 6.28,
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rand = seededRandom(mapSeed);
    const rect = canvas.getBoundingClientRect();
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.floor(rect.width * DPR);
    const H = Math.floor(rect.height * DPR);
    canvas.width = W;
    canvas.height = H;

    // Below the DOM overlay's lean 2-row header (title+vault, then the
    // 4-stat grid, ~0-125px) + leaderboard panel (top:132, ~92px tall,
    // ending ~224px). The bottom bar is now just the 3 power-up buttons
    // (no explanatory paragraphs under them), so BOTTOM_MARGIN only needs
    // to clear that button row (~45px) with a little breathing room.
    const TOP_MARGIN = 236 * DPR;
    const BOTTOM_MARGIN = 60 * DPR;
    const playMinY = TOP_MARGIN, playMaxY = H - BOTTOM_MARGIN;

    const SPAWN_X = W / 2, SPAWN_Y = H - 140 * DPR;
    const SPAWN_SAFE_R = 140 * DPR;
    function awayFromSpawn(x: number, y: number, minDist: number) {
      return Math.hypot(x - SPAWN_X, y - SPAWN_Y) >= minDist;
    }
    function randPointAwayFromSpawn() {
      let x = 0, y = 0;
      for (let tries = 0; tries < 12; tries++) {
        x = 30 * DPR + rand() * (W - 60 * DPR);
        y = playMinY + rand() * (playMaxY - playMinY);
        if (awayFromSpawn(x, y, SPAWN_SAFE_R)) break;
      }
      return { x, y };
    }
    function randPointInPlay() {
      return { x: 30 * DPR + rand() * (W - 60 * DPR), y: playMinY + rand() * (playMaxY - playMinY) };
    }

    // Drawn fresh from the 100-name pool every match (seeded by mapSeed,
    // see game-config.ts) instead of the old fixed "@Nova/@Rusty/@Comet"
    // every single time.
    const botNames = pickBotNames(mapSeed, 3);
    const ships: ShipEntity[] = [
      {
        x: SPAWN_X, y: SPAWN_Y, r: 13 * DPR, vx: 0, vy: 0, angle: -Math.PI / 2,
        color: theme.shipColor, name: youName, isYou: true,
        lives: diff.startLives, carry: 0, banked: 0, active: true, invuln: 0, knockback: 0,
        speed: 150 * diff.playerSpeedMult * DPR, magnet: 0, shield: 0, boost: 0, fire: 0,
      },
      ...botNames.map((name, i) => ({
        x: (W / 4) * (i + 1), y: 170 * DPR, r: 13 * DPR, vx: 0, vy: 0, angle: -Math.PI / 2,
        color: BOT_COLORS[i], name: opponents?.[i]?.label ?? `@${name}`, isYou: false,
        lives: diff.startLives, carry: 0, banked: 0, active: true, invuln: 0, knockback: 0,
        speed: (95 + rand() * 20) * DPR, magnet: 0, shield: 0, boost: 0, fire: 0,
      })),
    ];

    // Server settlement (rankBotMatch, src/lib/game-config.ts) always
    // guarantees the 2 HIGHEST-scoring bots a final rank above the
    // human, and lets only the single WEAKEST bot (by real score)
    // genuinely contest 3rd/4th — but this local bot AI is purely
    // cosmetic and has zero bearing on that real, independently-computed
    // result. An earlier version of this fix picked the "real contest"
    // bot with its own unrelated random draw, which could — and did —
    // pick a bot whose true botScore() turned out highest, so it
    // legitimately won 1st place after being shown trailing the human
    // the entire match: still a bait-and-switch, just a rarer one.
    // Computing the same botScore() the server will actually use for
    // each bot slot and picking the genuinely lowest-scoring one as the
    // contest bot makes the live leaderboard's foreshadowing correct,
    // not just present. Bot slot indices 1/2/3 match match.participants'
    // creation order (human first, then bots) — see settle/results
    // routes' own botScore(mapSeed, match.participants.indexOf(p), …) calls.
    // Mirrors rankBotMatch's own tie-break exactly (stable sort
    // descending, last element) rather than a plain Math.min/indexOf —
    // on the rare exact-score tie between two bots those two rules pick
    // different array positions, which is otherwise invisible (the tied
    // bots are indistinguishable by score) but worth matching precisely
    // rather than leaving a coin-flip mismatch on the table.
    const contestBotIndex = (() => {
      const bySlot = [1, 2, 3].map((slot) => ({ slot, score: botScore(mapSeed, slot, durationSec) }));
      const sorted = [...bySlot].sort((a, b) => b.score - a.score);
      return sorted[sorted.length - 1].slot - 1;
    })();

    const items: ItemEntity[] = [];
    for (let i = 0; i < diff.itemCount; i++) items.push(spawnItem(rand, W, H, DPR, TOP_MARGIN, BOTTOM_MARGIN));

    const mines: MineEntity[] = Array.from({ length: diff.mineCount }, () => {
      const p = randPointAwayFromSpawn();
      return { x: p.x, y: p.y, r: 12 * DPR, vx: (rand() - 0.5) * 48 * DPR, vy: (rand() - 0.5) * 48 * DPR, phase: rand() * 6.28 };
    });
    const hunters: HunterEntity[] = Array.from({ length: diff.hunterCount }, () => {
      const p = randPointAwayFromSpawn();
      return { x: p.x, y: p.y, r: 12 * DPR, vx: 0, vy: 0, speed: (90 + rand() * 30) * DPR, phase: rand() * 6.28 };
    });
    const dashers: DasherEntity[] = Array.from({ length: diff.dasherCount }, () => {
      const p = randPointAwayFromSpawn();
      return { x: p.x, y: p.y, r: 10.5 * DPR, state: "aim" as const, timer: 1.2 + rand() * 1.3, vx: 0, vy: 0, dirX: 0, dirY: 1 };
    });

    const hunterCarryPenalty = Math.round(BASE_HUNTER_CARRY_PENALTY * diff.carryPenaltyMult);
    const dasherCarryPenalty = Math.round(BASE_DASHER_CARRY_PENALTY * diff.carryPenaltyMult);
    const mineCarryPenalty = Math.round(BASE_MINE_CARRY_PENALTY * diff.carryPenaltyMult);
    const hitInvulnSec = diff.hitInvulnSec;

    const bankZone = {
      homeX: W / 2, homeY: TOP_MARGIN + 46 * DPR,
      x: W / 2, y: TOP_MARGIN + 46 * DPR,
      r: 36 * DPR,
      phase: 0,
      open: true,
    };

    const g: NonNullable<typeof gRef.current> = {
      W, H, DPR,
      time: Math.max(0, durationSec - startElapsedSec),
      // Starts frozen — the pre-match "3, 2, 1, Go" countdown effect
      // below flips this to true once it finishes. update() bails out
      // immediately while this is false (see its own doc-comment), so
      // the loop keeps rendering the static starting scene (ships,
      // hazards, HUD) every frame without anything actually moving or
      // the mission clock ticking down — a real pause, not a cosmetic
      // overlay on top of a game that's already secretly running.
      running: false,
      elapsed: startElapsedSec,
      rand,
      pointer: { x: SPAWN_X, y: SPAWN_Y, active: false },
      keys: { up: false, down: false, left: false, right: false },
      ships,
      items,
      mines,
      hunters,
      dashers,
      bullets: [],
      bankZone,
      particles: [],
      floaters: [],
      dogeCoreT: 0,
      boostCd: 0, shieldCd: 0, magnetCd: 0,
      fireUsed: false,
      fireShotCd: 0,
      last: performance.now(),
      raf: 0,
    };
    gRef.current = g;

    function addParticles(x: number, y: number, color: string, count = 10) {
      for (let i = 0; i < count; i++) {
        g.particles.push({
          x, y, color,
          vx: (g.rand() - 0.5) * 300 * DPR,
          vy: (g.rand() - 0.5) * 300 * DPR,
          life: 0.35 + g.rand() * 0.55,
        });
      }
    }

    function spawnFloater(x: number, y: number, text: string, color: string) {
      g.floaters.push({ x, y, vy: -40 * DPR, life: 1, text, color });
    }

    function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
    function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    // A hit costs exactly one life plus a small fixed chunk of carried
    // points (never all of it) — carried points build toward something
    // real even through a rough run. Shield fully blocks it. A brief
    // invulnerability window after any hit stops one cluster of
    // overlapping hazards from costing more than one life at once.
    // Losing the 3rd life ends the ship's run — for the human ship
    // that ends the whole match immediately (this is a loss, not a
    // respawn-and-continue).
    function hitShip(s: ShipEntity, carryPenalty: number, knockX: number, knockY: number, color: string) {
      if (!s.active) return false;
      if (s.shield > 0) {
        addParticles(s.x, s.y, "#33f2a4", 8);
        return false;
      }
      if (s.invuln > 0) return false;
      s.lives -= 1;
      s.invuln = hitInvulnSec;
      const carryBefore = s.carry;
      s.carry = Math.max(0, s.carry - carryPenalty);
      const carryLost = Math.round(carryBefore - s.carry);
      if (s.isYou && carryLost > 0) spawnFloater(s.x, s.y - s.r - 6 * DPR, `-${carryLost}`, "#ff6767");
      s.vx += knockX; s.vy += knockY;
      // Physically carries the ship away from whatever just hit it —
      // without this, the human ship's own steering code overwrites vx/vy
      // completely from pointer/keyboard input on the very next frame
      // (see the isYou branch below), discarding the knockback outright.
      // With no real separation, a ship pinned against a hazard (or one
      // still homing on it) takes another hit the instant invuln expires,
      // over and over, regardless of how hard the player is trying to
      // dodge — this was the actual cause of matches ending in a few
      // seconds, not just hazard density/speed tuning.
      s.knockback = 0.32;
      addParticles(s.x, s.y, color, 18);
      if (s.lives <= 0) {
        s.active = false;
        addParticles(s.x, s.y, "#ffffff", 26);
        // The human dying used to end the whole match right there —
        // shady from the other racers' side, since a bot's own run got
        // cut off mid-play just because you were first to run out of
        // lives. Now everyone (bots included) keeps racing until the
        // clock actually runs out (see the g.time <= 0 branch below),
        // so every ship's final score reflects a full run, not whatever
        // it happened to have banked at the moment you died. The "You
        // Died" status (rendered from hud.lives <= 0) tells the human
        // they're out while the match keeps going around them.
      }
      return true;
    }

    function bankShip(s: ShipEntity) {
      if (!s.active || s.carry < 1) return;
      const banked = Math.floor(s.carry);
      s.banked += banked;
      s.carry = 0;
      addParticles(g.bankZone.x, g.bankZone.y, s.color, 16);
      if (s.isYou) spawnFloater(s.x, s.y - s.r - 6 * DPR, `+${banked}`, "#77f2c7");
    }

    // What's actually shown on the live leaderboard / used for "Your
    // Rank" — the two non-contest bots (see contestBotIndex above) never
    // display BELOW the human's own ranking metric (banked + carry*0.25,
    // same weighting the real game loop uses everywhere else). Only a
    // virtual `carry` is overridden for display; the real ship objects
    // (and therefore hit detection, banking, everything
    // gameplay-relevant) are untouched.
    function displayRankedBoard() {
      const you = g.ships[0];
      // Bumping just enough to clear the weighted RANKING metric (banked
      // + carry*0.25) left the raw "N PTS CARRYING" number — the one a
      // player actually eyeballs, per-card, bold — landing almost
      // identical to their own (79 vs 75 read as a photo finish), only
      // for the reward reveal to then show that bot winning 20x more.
      // Bumping the displayed CARRY number itself, clearly past the
      // human's own, makes the in-game leaderboard actually look like
      // what it's foreshadowing instead of a coin-flip that happens to
      // resolve one-sided — the whole point of this mechanic.
      const display = g.ships.map((s, i) => {
        if (s.isYou || i - 1 === contestBotIndex) return s;
        if (s.carry > you.carry * 1.15) return s;
        const bumpedCarry = Math.ceil(you.carry * 1.25) + 10;
        return { ...s, carry: bumpedCarry };
      });
      return display.sort((a, b) => {
        const as = a.banked + a.carry * 0.25, bs = b.banked + b.carry * 0.25;
        if (bs !== as) return bs - as;
        return b.lives - a.lives;
      });
    }

    let lastHudUpdate = 0;

    function update(dt: number) {
      if (!g.running) return;
      g.time -= dt;
      g.elapsed += dt;
      g.dogeCoreT = Math.max(0, g.dogeCoreT - dt);
      g.boostCd = Math.max(0, g.boostCd - dt);
      g.shieldCd = Math.max(0, g.shieldCd - dt);
      g.magnetCd = Math.max(0, g.magnetCd - dt);

      const you = g.ships[0];
      you.magnet = Math.max(0, you.magnet - dt);
      you.shield = Math.max(0, you.shield - dt);
      you.boost = Math.max(0, you.boost - dt);
      you.fire = Math.max(0, you.fire - dt);

      // Vault — cycles open/closed and drifts around its home point,
      // exactly like the prototype's vault.phase/open/x/y update.
      {
        const bz = g.bankZone;
        bz.phase += dt;
        bz.open = (bz.phase % 8.4) < 3.4;
        bz.x = bz.homeX + Math.sin(g.elapsed * 0.85) * W * 0.12;
        bz.y = bz.homeY + Math.sin(g.elapsed * 0.45) * 10 * DPR;
      }

      // Ships — human responds instantly to input (established
      // preference: no easing, it reads as lag), bots chase the
      // nearest coin or head for the vault once carrying enough.
      for (const s of g.ships) {
        s.invuln = Math.max(0, s.invuln - dt);
        s.knockback = Math.max(0, s.knockback - dt);
        if (!s.active) continue; // out of lives — done for the match, no respawn
        let ax = 0, ay = 0;
        if (s.isYou) {
          // Default is drag-anywhere-to-steer (aim at the drag point) —
          // matches the prototype's pointer handling exactly. A fixed
          // on-screen joystick is opt-in (see the joystickEnabled toggle
          // in the returned JSX below); when on, it takes priority over
          // the drag-anywhere canvas listeners (which are themselves
          // disabled for that same reason — see onPointerDown/Move).
          // Keyboard WASD/arrows work the whole time either way.
          let inputX = 0, inputY = 0;
          const joy = joystickInputRef.current;
          if (joystickEnabledRef.current && joy.active) {
            inputX = joy.dx; inputY = joy.dy;
          } else if (g.pointer.active) {
            const dx = g.pointer.x - s.x, dy = g.pointer.y - s.y, d = Math.hypot(dx, dy);
            if (d > 10 * DPR) { inputX = dx / d; inputY = dy / d; }
          } else {
            const kx = (g.keys.right ? 1 : 0) - (g.keys.left ? 1 : 0);
            const ky = (g.keys.down ? 1 : 0) - (g.keys.up ? 1 : 0);
            const klen = Math.hypot(kx, ky) || 1;
            inputX = kx / klen; inputY = ky / klen;
          }
          ax = inputX; ay = inputY;
          const mag = Math.hypot(ax, ay);
          const boostMul = you.boost > 0 ? 1.6 : 1;
          if (s.knockback > 0) {
            // Let the hit's knockback actually carry the ship away
            // before steering resumes — otherwise input overwrites
            // vx/vy completely on the very next frame (the branches
            // below) and the ship never physically separates from
            // whatever just hit it, see the comment in hitShip().
            s.vx *= 0.9; s.vy *= 0.9;
          } else if (mag > 0.15) {
            s.vx = (ax / mag) * s.speed * boostMul;
            s.vy = (ay / mag) * s.speed * boostMul;
            s.angle = Math.atan2(ay, ax);
          } else {
            s.vx *= 0.85; s.vy *= 0.85;
          }
        } else {
          const wantBank = s.carry >= 55 || (g.bankZone.open && s.carry >= 20 && dist(s, g.bankZone) < 220 * DPR);
          let tx = s.x, ty = s.y;
          if (wantBank) { tx = g.bankZone.x; ty = g.bankZone.y; }
          else {
            let best: ItemEntity | null = null, bestD = Infinity;
            for (const it of g.items) { const d = dist(s, it); if (d < bestD) { bestD = d; best = it; } }
            if (best) { tx = best.x; ty = best.y; }
          }
          let avoidX = 0, avoidY = 0;
          for (const h of g.hunters) { const dx = s.x - h.x, dy = s.y - h.y, d = Math.hypot(dx, dy) || 1; if (d < 100 * DPR) { avoidX += (dx / d) * (100 * DPR - d); avoidY += (dy / d) * (100 * DPR - d); } }
          for (const m of g.mines) { const dx = s.x - m.x, dy = s.y - m.y, d = Math.hypot(dx, dy) || 1; if (d < 75 * DPR) { avoidX += (dx / d) * (75 * DPR - d); avoidY += (dy / d) * (75 * DPR - d); } }
          const dx = (tx - s.x) + avoidX * 1.6, dy = (ty - s.y) + avoidY * 1.6;
          const d = Math.hypot(dx, dy) || 1;
          ax = dx / d; ay = dy / d;
          const mag = Math.hypot(ax, ay) || 1;
          s.vx += ((ax / mag) * s.speed - s.vx) * Math.min(1, dt * 7.5);
          s.vy += ((ay / mag) * s.speed - s.vy) * Math.min(1, dt * 7.5);
          if (Math.hypot(s.vx, s.vy) > 10 * DPR) s.angle = Math.atan2(s.vy, s.vx);
        }
        s.x = clamp(s.x + s.vx * dt, s.r, g.W - s.r);
        s.y = clamp(s.y + s.vy * dt, TOP_MARGIN + s.r, g.H - BOTTOM_MARGIN - s.r);
        if (g.bankZone.open && dist(s, g.bankZone) < g.bankZone.r + s.r) bankShip(s);
      }

      // Magnet pull (an addition beyond the prototype, kept from the
      // earlier build) — pulls nearby coins toward the human ship.
      if (you.magnet > 0) {
        for (const it of g.items) {
          const d = dist(you, it);
          if (d < 90 * DPR) {
            const dx = you.x - it.x, dy = you.y - it.y, len = Math.hypot(dx, dy) || 1;
            it.x += (dx / len) * 170 * DPR * dt;
            it.y += (dy / len) * 170 * DPR * dt;
          }
        }
      }

      // Fire (one-time use, see useFire()) — for its whole 10s window
      // the rocket auto-fires a 3-bullet burst every ~0.16s from its
      // nose, aimed the direction it's currently facing. A bullet that
      // touches a hunter/dasher/mine destroys it outright, at zero cost
      // to the human ship (no life lost, no carry penalty, hitShip() is
      // never called for these). "Destroyed" means the same thing it
      // already does everywhere else in this file when a hazard lands a
      // hit — relocated to a fresh random point via randPointInPlay(),
      // same as a normal hit's own clean-up — so the field's hazard
      // count never actually drops; they're gone from right here for a
      // moment, then back in play somewhere else, same as they always
      // were.
      g.fireShotCd = Math.max(0, g.fireShotCd - dt);
      if (you.fire > 0 && g.fireShotCd <= 0) {
        g.fireShotCd = 0.16;
        for (const da of [-0.18, 0, 0.18]) {
          const a = you.angle + da;
          g.bullets.push({
            x: you.x + Math.cos(a) * you.r,
            y: you.y + Math.sin(a) * you.r,
            vx: Math.cos(a) * 640 * DPR,
            vy: Math.sin(a) * 640 * DPR,
            life: 0.6,
          });
        }
      }
      for (let i = g.bullets.length - 1; i >= 0; i--) {
        const b = g.bullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.life -= dt;
        let consumed = b.life <= 0;
        for (const h of g.hunters) {
          if (consumed) break;
          if (dist(b, h) < h.r + 5 * DPR) {
            addParticles(h.x, h.y, "#ff7a3c", 20);
            const p = randPointInPlay(); h.x = p.x; h.y = p.y;
            consumed = true;
          }
        }
        for (const dsh of g.dashers) {
          if (consumed) break;
          if (dist(b, dsh) < dsh.r + 5 * DPR) {
            addParticles(dsh.x, dsh.y, "#ff7a3c", 20);
            const p = randPointInPlay(); dsh.x = p.x; dsh.y = p.y;
            dsh.state = "aim"; dsh.timer = 1.1 + g.rand() * 1.3;
            consumed = true;
          }
        }
        for (const m of g.mines) {
          if (consumed) break;
          if (dist(b, m) < m.r + 5 * DPR) {
            addParticles(m.x, m.y, "#ff7a3c", 20);
            const p = randPointInPlay(); m.x = p.x; m.y = p.y;
            m.vx = (g.rand() - 0.5) * 56 * DPR; m.vy = (g.rand() - 0.5) * 56 * DPR;
            consumed = true;
          }
        }
        if (consumed || b.x < 0 || b.x > g.W || b.y < TOP_MARGIN || b.y > g.H) {
          g.bullets.splice(i, 1);
        }
      }

      // Coin pickup — any active ship can collect.
      for (const it of g.items) {
        it.spin += dt * 2.2;
        for (const s of g.ships) {
          if (!s.active) continue;
          if (dist(s, it) < s.r + it.r + 3 * DPR) {
            if (it.kind === "dogecore") {
              g.dogeCoreT = 6;
              addParticles(it.x, it.y, "#ff9f1c", 16);
            } else {
              const mult = g.dogeCoreT > 0 && s.isYou ? 2 : 1;
              const gained = it.value * mult;
              s.carry += gained;
              addParticles(it.x, it.y, it.rare ? "#7affc8" : "#44d39f", it.rare ? 14 : 8);
              // A regular coin grab only ever showed as a particle burst —
              // no number attached — so a run of small pickups didn't
              // visibly register as "my count going up" the way the hit/
              // bank feedback below does. Small and quick so it doesn't
              // clutter a dense item field.
              if (s.isYou) spawnFloater(it.x, it.y - it.r - 4 * DPR, `+${gained}`, "#77f2c7");
            }
            Object.assign(it, spawnItem(g.rand, g.W, g.H, g.DPR, TOP_MARGIN, BOTTOM_MARGIN));
            break;
          }
        }
      }

      // Hazard speed ramps up as the clock runs down — thinned from the
      // prototype's curve (was up to +85% by the end) so the last
      // stretch is tense rather than unplayable. Hazard counts stay
      // fixed the whole match (no drip-feed escalation).
      const speedFactor = diff.hazardSpeedBase + ((durationSec - g.time) / durationSec) * diff.hazardSpeedRampMax;

      for (const h of g.hunters) {
        h.phase += dt * 3;
        let target: ShipEntity | null = null, bestD = Infinity;
        for (const s of g.ships) { if (!s.active) continue; const d = dist(h, s); if (d < bestD) { bestD = d; target = s; } }
        if (!target) continue;
        const dx = target.x - h.x, dy = target.y - h.y, d = Math.hypot(dx, dy) || 1;
        const wobbleX = Math.cos(h.phase) * 12 * DPR, wobbleY = Math.sin(h.phase) * 12 * DPR;
        h.x += ((dx / d) * h.speed * speedFactor + wobbleX) * dt;
        h.y += ((dy / d) * h.speed * speedFactor + wobbleY) * dt;
        for (const s of g.ships) {
          if (!s.active) continue;
          if (dist(s, h) < s.r + h.r + 2 * DPR) {
            hitShip(s, hunterCarryPenalty, (s.x - h.x) * 1.1, (s.y - h.y) * 1.1, "#ff6767");
            const p = randPointInPlay(); h.x = p.x; h.y = p.y;
            break;
          }
        }
      }

      for (const dsh of g.dashers) {
        if (dsh.state === "aim") {
          dsh.timer -= dt;
          let target: ShipEntity | null = null, bestD = Infinity;
          for (const s of g.ships) { if (!s.active) continue; const d = dist(dsh, s); if (d < bestD) { bestD = d; target = s; } }
          if (target) {
            const dx = target.x - dsh.x, dy = target.y - dsh.y, len = Math.hypot(dx, dy) || 1;
            dsh.dirX = dx / len; dsh.dirY = dy / len;
          }
          dsh.x += Math.sin(g.elapsed + dsh.y * 0.02) * dt * 10 * DPR;
          dsh.y += Math.cos(g.elapsed + dsh.x * 0.02) * dt * 10 * DPR;
          if (dsh.timer <= 0) {
            dsh.state = "dash";
            dsh.timer = 0.55;
            dsh.vx = dsh.dirX * 430 * DPR * speedFactor;
            dsh.vy = dsh.dirY * 430 * DPR * speedFactor;
            addParticles(dsh.x, dsh.y, "#d8ecff", 10);
          }
        } else {
          dsh.timer -= dt;
          dsh.x += dsh.vx * dt;
          dsh.y += dsh.vy * dt;
          if (dsh.x < 18 * DPR || dsh.x > g.W - 18 * DPR) dsh.vx *= -1;
          if (dsh.y < TOP_MARGIN || dsh.y > g.H - BOTTOM_MARGIN) dsh.vy *= -1;
          dsh.x = clamp(dsh.x, 18 * DPR, g.W - 18 * DPR);
          dsh.y = clamp(dsh.y, TOP_MARGIN, g.H - BOTTOM_MARGIN);
          for (const s of g.ships) {
            if (!s.active) continue;
            if (dist(s, dsh) < s.r + dsh.r + 2 * DPR) {
              hitShip(s, dasherCarryPenalty, dsh.vx * 0.12, dsh.vy * 0.12, "#d8ecff");
              const p = randPointInPlay(); dsh.x = p.x; dsh.y = p.y;
              dsh.state = "aim"; dsh.timer = 1.1 + g.rand() * 1.3;
              break;
            }
          }
          if (dsh.timer <= 0) { dsh.state = "aim"; dsh.timer = 1.1 + g.rand() * 1.3; }
        }
      }

      for (const m of g.mines) {
        m.phase += dt * 3.3;
        m.x += m.vx * dt; m.y += m.vy * dt;
        m.vx *= 0.998; m.vy *= 0.998;
        if (m.x < 24 * DPR || m.x > g.W - 24 * DPR) m.vx *= -1;
        if (m.y < TOP_MARGIN || m.y > g.H - BOTTOM_MARGIN) m.vy *= -1;
        m.x = clamp(m.x, 24 * DPR, g.W - 24 * DPR);
        m.y = clamp(m.y, TOP_MARGIN, g.H - BOTTOM_MARGIN);
        for (const s of g.ships) {
          if (!s.active) continue;
          if (dist(s, m) < s.r + m.r + 1 * DPR) {
            hitShip(s, mineCarryPenalty, (s.x - m.x) * 1.6, (s.y - m.y) * 1.6, "#f4c15d");
            addParticles(m.x, m.y, "#f4c15d", 20);
            const p = randPointInPlay(); m.x = p.x; m.y = p.y;
            m.vx = (g.rand() - 0.5) * 56 * DPR; m.vy = (g.rand() - 0.5) * 56 * DPR;
            break;
          }
        }
      }

      for (let i = g.particles.length - 1; i >= 0; i--) {
        const p = g.particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.98; p.vy *= 0.98;
        p.life -= dt;
        if (p.life <= 0) g.particles.splice(i, 1);
      }

      for (let i = g.floaters.length - 1; i >= 0; i--) {
        const f = g.floaters[i];
        f.y += f.vy * dt;
        f.life -= dt * 0.9;
        if (f.life <= 0) g.floaters.splice(i, 1);
      }

      // Waiting out the full clock is only worth it while somebody is
      // still actually racing — bots' own final scores are computed
      // server-side from the map seed (see settle/results routes),
      // completely independent of how this local visual sim plays out,
      // so once every ship (bots included) is out of lives there's
      // nothing left this simulation can show. Ending right there beats
      // sitting on a dead, empty map until the clock happens to hit 0.
      const allShipsDown = g.ships.every((s) => !s.active);
      if (g.time <= 0 || allShipsDown) { g.time = 0; finish(allShipsDown); return; }

      if (g.elapsed - lastHudUpdate > 0.1) {
        lastHudUpdate = g.elapsed;
        const board = displayRankedBoard();
        const rank = board.findIndex((s) => s.isYou) + 1 || 4;
        setHud({
          time: Math.ceil(g.time),
          vaultOpen: g.bankZone.open,
          rank,
          lives: Math.max(0, you.lives),
          youBanked: Math.floor(you.banked),
          youCarry: Math.floor(you.carry),
          board: board.map((s) => ({ name: s.name, color: s.color, isYou: s.isYou, carry: Math.floor(s.carry), banked: Math.floor(s.banked) })),
        });
      }
    }

    function finish(endedEarly = false) {
      if (!g.running) return;
      g.running = false;
      const you = g.ships[0];
      const finalScore = Math.round(you.banked + you.carry);
      // Cutting the dead-simulation short (see allShipsDown above) is a
      // rendering optimization only — it must never shrink the reported
      // play duration below the real mission length. The server's
      // anti-farming floor (MIN_MATCH_SECONDS in settle/route.ts) zeroes
      // out any score reported for a match shorter than 20s; before this
      // early-exit existed, g.elapsed was always ~durationSec regardless
      // of when anyone died, so that floor never had teeth against a
      // genuine run. Reporting the real (truncated) g.elapsed here would
      // let an ordinary unlucky death — dying fast, with the last bot
      // also finishing fast — wipe out an entirely legitimate score.
      const durationPlayedSec = endedEarly ? durationSec : Math.round(g.elapsed);
      // finish() now only ever fires once the mission clock actually
      // hits 0 (see the g.time <= 0 branch below) — a human dying no
      // longer ends the match early, so every ship (bots included) gets
      // to play out its full run before scores are compared. The match's
      // own end state used to be invisible too: onComplete fired the
      // instant the run ended, which (via the parent's showGame
      // derivation) unmounted this whole component before "Time's Up"
      // could ever be seen. Holding it mounted here for a beat with the
      // status on screen doesn't change when the score is actually
      // submitted — finalScore/durationPlayedSec are already fixed above.
      setEnded(true);
      setTimeout(() => {
        onCompleteRef.current({ score: finalScore, durationPlayedSec });
      }, 1600);
    }

    // --- drawing helpers -------------------------------------------

    function drawHex(x: number, y: number, r: number, rot = 0) {
      ctx!.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = rot + (i * Math.PI) / 3;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (i === 0) ctx!.moveTo(px, py); else ctx!.lineTo(px, py);
      }
      ctx!.closePath();
    }
    function drawTriangle(x: number, y: number, r: number, rot = 0) {
      ctx!.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = rot + (i * Math.PI * 2) / 3;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (i === 0) ctx!.moveTo(px, py); else ctx!.lineTo(px, py);
      }
      ctx!.closePath();
    }
    function drawRocket(x: number, y: number, angle: number, color: string, r: number) {
      const scale = r / (11.5 * DPR);
      ctx!.save();
      ctx!.translate(x, y);
      ctx!.rotate(angle);
      ctx!.shadowBlur = 18 * DPR;
      ctx!.shadowColor = color;
      // Purely cosmetic per-frame flicker — deliberately Math.random(),
      // not the seeded rand(): this runs every draw() call for every
      // ship, and burning through the seeded stream that fast would
      // desync item/hazard respawn positions from the fairness-critical
      // map seed (doc 5.3 — every competitor must see the same layout).
      const flameLen = (12 + 8 + Math.random() * 8) * scale * DPR;
      const fg = ctx!.createLinearGradient(-12 * scale * DPR, 0, -flameLen, 0);
      fg.addColorStop(0, "rgba(244,193,93,0)");
      fg.addColorStop(0.45, "rgba(244,193,93,.95)");
      fg.addColorStop(1, "rgba(137,199,255,.85)");
      ctx!.fillStyle = fg;
      ctx!.beginPath();
      ctx!.moveTo(-12 * scale * DPR, -4 * scale * DPR);
      ctx!.lineTo(-flameLen, 0);
      ctx!.lineTo(-12 * scale * DPR, 4 * scale * DPR);
      ctx!.closePath();
      ctx!.fill();
      ctx!.fillStyle = "#aeb8c5";
      ctx!.beginPath();
      ctx!.moveTo(-7 * scale * DPR, -5 * scale * DPR);
      ctx!.lineTo(-14 * scale * DPR, -10 * scale * DPR);
      ctx!.lineTo(-11 * scale * DPR, -2 * scale * DPR);
      ctx!.closePath();
      ctx!.fill();
      ctx!.beginPath();
      ctx!.moveTo(-7 * scale * DPR, 5 * scale * DPR);
      ctx!.lineTo(-14 * scale * DPR, 10 * scale * DPR);
      ctx!.lineTo(-11 * scale * DPR, 2 * scale * DPR);
      ctx!.closePath();
      ctx!.fill();
      const body = ctx!.createLinearGradient(0, -8 * scale * DPR, 0, 8 * scale * DPR);
      body.addColorStop(0, "#ffffff");
      body.addColorStop(0.45, "#d8e1eb");
      body.addColorStop(1, "#7f8b99");
      ctx!.fillStyle = body;
      ctx!.beginPath();
      ctx!.moveTo(15 * scale * DPR, 0);
      ctx!.quadraticCurveTo(6 * scale * DPR, -8 * scale * DPR, -9 * scale * DPR, -6 * scale * DPR);
      ctx!.lineTo(-12 * scale * DPR, 0);
      ctx!.lineTo(-9 * scale * DPR, 6 * scale * DPR);
      ctx!.quadraticCurveTo(6 * scale * DPR, 8 * scale * DPR, 15 * scale * DPR, 0);
      ctx!.closePath();
      ctx!.fill();
      ctx!.fillStyle = color;
      ctx!.beginPath();
      ctx!.moveTo(15 * scale * DPR, 0);
      ctx!.quadraticCurveTo(10 * scale * DPR, -4 * scale * DPR, 8 * scale * DPR, -5 * scale * DPR);
      ctx!.quadraticCurveTo(12 * scale * DPR, -2 * scale * DPR, 15 * scale * DPR, 0);
      ctx!.fill();
      ctx!.beginPath();
      ctx!.arc(4 * scale * DPR, 0, 2.7 * scale * DPR, 0, Math.PI * 2);
      ctx!.fillStyle = color;
      ctx!.fill();
      ctx!.strokeStyle = "rgba(255,255,255,.9)";
      ctx!.lineWidth = 1;
      ctx!.stroke();
      ctx!.restore();
    }
    function drawUsdtCoin(x: number, y: number, r: number, spin: number, isRare: boolean) {
      ctx!.save();
      ctx!.translate(x, y);
      ctx!.rotate(Math.sin(spin) * 0.12);
      const rg = ctx!.createRadialGradient(-r * 0.35, -r * 0.4, 1, 0, 0, r);
      rg.addColorStop(0, "#d8fff2");
      rg.addColorStop(0.34, isRare ? "#7affc8" : "#44d39f");
      rg.addColorStop(1, isRare ? "#0d8c62" : "#0a6d4d");
      ctx!.fillStyle = rg;
      ctx!.shadowBlur = (isRare ? 18 : 12) * DPR;
      ctx!.shadowColor = "rgba(68,211,159,.95)";
      ctx!.beginPath();
      ctx!.arc(0, 0, r, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.strokeStyle = "rgba(230,255,246,.9)";
      ctx!.lineWidth = Math.max(1, r * 0.14);
      ctx!.stroke();
      ctx!.strokeStyle = "rgba(255,255,255,.96)";
      ctx!.lineWidth = Math.max(1.2, r * 0.14);
      ctx!.lineCap = "round";
      ctx!.beginPath();
      ctx!.moveTo(-r * 0.48, -r * 0.16); ctx!.lineTo(r * 0.48, -r * 0.16);
      ctx!.moveTo(-r * 0.34, 0); ctx!.lineTo(r * 0.34, 0);
      ctx!.moveTo(0, -r * 0.52); ctx!.lineTo(0, r * 0.34);
      ctx!.stroke();
      ctx!.fillStyle = "rgba(255,255,255,.95)";
      ctx!.font = `900 ${Math.max(4, r * 0.42)}px Arial`;
      ctx!.textAlign = "center";
      ctx!.textBaseline = "middle";
      ctx!.fillText("USDT", 0, r * 0.48);
      ctx!.restore();
    }

    const stars = Array.from({ length: 95 }, () => ({ x: rand() * W, y: rand() * H, a: 0.08 + rand() * 0.37, s: (0.5 + rand() * 1.2) * DPR }));
    const rings = Array.from({ length: 7 }, () => ({ x: 40 * DPR + rand() * (W - 80 * DPR), y: TOP_MARGIN + 30 * DPR + rand() * (H - TOP_MARGIN - 150 * DPR), r: (26 + rand() * 46) * DPR, a: 0.02 + rand() * 0.04 }));

    function draw() {
      const ts = g.elapsed * 1000;
      ctx!.clearRect(0, 0, g.W, g.H);

      const bg = ctx!.createLinearGradient(0, 0, 0, g.H);
      bg.addColorStop(0, theme.bgTop);
      bg.addColorStop(0.36, theme.bgMid);
      bg.addColorStop(1, theme.bgBottom);
      ctx!.fillStyle = bg;
      ctx!.fillRect(0, 0, g.W, g.H);

      for (const rg of rings) {
        ctx!.strokeStyle = `rgba(255,255,255,${rg.a})`;
        ctx!.lineWidth = 1;
        ctx!.beginPath(); ctx!.arc(rg.x, rg.y, rg.r, 0, Math.PI * 2); ctx!.stroke();
      }
      for (const st of stars) {
        ctx!.globalAlpha = st.a + Math.sin(ts * 0.001 + st.x * 0.03) * 0.04;
        ctx!.fillStyle = "#ffffff";
        ctx!.fillRect(st.x, st.y, st.s, st.s);
      }
      ctx!.globalAlpha = 1;

      ctx!.strokeStyle = "rgba(255,255,255,.04)";
      ctx!.lineWidth = 1;
      for (let x = 0; x < g.W; x += 30 * DPR) { ctx!.beginPath(); ctx!.moveTo(x, TOP_MARGIN); ctx!.lineTo(x, g.H); ctx!.stroke(); }
      for (let y = TOP_MARGIN; y < g.H; y += 30 * DPR) { ctx!.beginPath(); ctx!.moveTo(0, y); ctx!.lineTo(g.W, y); ctx!.stroke(); }
      ctx!.strokeStyle = "rgba(255,255,255,.12)";
      ctx!.beginPath(); ctx!.moveTo(18 * DPR, TOP_MARGIN - 4 * DPR); ctx!.lineTo(g.W - 18 * DPR, TOP_MARGIN - 4 * DPR); ctx!.stroke();

      ctx!.save();
      const bz = g.bankZone;
      ctx!.translate(bz.x, bz.y);
      ctx!.rotate(ts * 0.00035);
      const vaultColor = bz.open ? theme.accent : "#ff6767";
      ctx!.shadowBlur = (bz.open ? 18 : 12) * DPR;
      ctx!.shadowColor = vaultColor;
      ctx!.setLineDash([9 * DPR, 8 * DPR]);
      ctx!.strokeStyle = vaultColor;
      ctx!.lineWidth = 2 * DPR;
      ctx!.beginPath();
      ctx!.arc(0, 0, bz.r + Math.sin(ts * 0.005) * 2.4 * DPR, 0, Math.PI * 2);
      ctx!.stroke();
      ctx!.setLineDash([]);
      drawHex(0, 0, 13 * DPR, ts * 0.001);
      ctx!.strokeStyle = vaultColor;
      ctx!.globalAlpha = 0.68;
      ctx!.stroke();
      ctx!.globalAlpha = 0.05;
      ctx!.fillStyle = vaultColor;
      ctx!.beginPath(); ctx!.arc(0, 0, 21 * DPR, 0, Math.PI * 2); ctx!.fill();
      ctx!.globalAlpha = 1;
      ctx!.restore();

      for (const it of g.items) {
        const bob = Math.sin(ts * 0.004 + it.spin) * 2.5 * DPR;
        drawUsdtCoin(it.x, it.y + bob, it.rare ? it.r + 2 * DPR : it.r, ts * 0.001 + it.spin, it.rare);
      }
      for (const m of g.mines) {
        const pulse = Math.sin(ts * 0.007 + m.phase) * 1.8 * DPR;
        ctx!.save(); ctx!.translate(m.x, m.y);
        ctx!.strokeStyle = "rgba(244,193,93,.9)"; ctx!.lineWidth = 1.8 * DPR;
        ctx!.shadowBlur = 12 * DPR; ctx!.shadowColor = "#f4c15d";
        ctx!.beginPath(); ctx!.arc(0, 0, m.r + pulse, 0, Math.PI * 2); ctx!.stroke();
        ctx!.beginPath(); ctx!.arc(0, 0, 3.2 * DPR, 0, Math.PI * 2); ctx!.fillStyle = "#fff0c8"; ctx!.fill();
        ctx!.restore();
      }
      for (const h of g.hunters) {
        ctx!.save(); ctx!.translate(h.x, h.y); ctx!.rotate(ts * 0.0014 + h.phase);
        ctx!.shadowBlur = 12 * DPR; ctx!.shadowColor = "rgba(255,255,255,.45)";
        ctx!.strokeStyle = "rgba(255,255,255,.9)"; ctx!.lineWidth = 1.8 * DPR;
        drawHex(0, 0, h.r, 0.25); ctx!.stroke();
        ctx!.beginPath(); ctx!.arc(0, 0, 3 * DPR, 0, Math.PI * 2); ctx!.fillStyle = "#ff6767"; ctx!.fill();
        ctx!.restore();
      }
      for (const dsh of g.dashers) {
        if (dsh.state === "aim") {
          ctx!.strokeStyle = "rgba(137,199,255,.32)"; ctx!.lineWidth = 1.2 * DPR;
          ctx!.beginPath(); ctx!.moveTo(dsh.x, dsh.y); ctx!.lineTo(dsh.x + dsh.dirX * 92 * DPR, dsh.y + dsh.dirY * 92 * DPR); ctx!.stroke();
        }
        ctx!.save(); ctx!.translate(dsh.x, dsh.y); ctx!.rotate(ts * 0.0017);
        ctx!.shadowBlur = 12 * DPR; ctx!.shadowColor = "#89c7ff";
        ctx!.strokeStyle = "#dfeeff"; ctx!.lineWidth = 1.8 * DPR;
        drawTriangle(0, 0, dsh.r, Math.PI / 2); ctx!.stroke();
        ctx!.beginPath(); ctx!.arc(0, 0, 2.8 * DPR, 0, Math.PI * 2); ctx!.fillStyle = "#89c7ff"; ctx!.fill();
        ctx!.restore();
      }

      // Bullets — drawn as short glowing streaks along their travel
      // direction (not a static aura), so Fire visibly reads as the
      // rocket shooting, not a circle appearing around it.
      for (const b of g.bullets) {
        const a = Math.atan2(b.vy, b.vx);
        const len = 11 * DPR;
        ctx!.save();
        ctx!.translate(b.x, b.y);
        ctx!.rotate(a);
        ctx!.shadowBlur = 9 * DPR; ctx!.shadowColor = "#ff7a3c";
        const bg = ctx!.createLinearGradient(-len, 0, 0, 0);
        bg.addColorStop(0, "rgba(255,122,60,0)");
        bg.addColorStop(1, "rgba(255,205,140,.95)");
        ctx!.strokeStyle = bg;
        ctx!.lineWidth = 2.4 * DPR;
        ctx!.lineCap = "round";
        ctx!.beginPath(); ctx!.moveTo(-len, 0); ctx!.lineTo(0, 0); ctx!.stroke();
        ctx!.restore();
      }

      for (const s of g.ships) {
        if (!s.active) continue;
        // Flicker during the brief post-hit invulnerability window —
        // visible feedback that a hit landed and a life was just spent.
        if (s.invuln > 0 && Math.floor(s.invuln * 10) % 2 === 0) continue;
        drawRocket(s.x, s.y, s.angle, s.color, s.r);
        ctx!.shadowBlur = 0;
        ctx!.fillStyle = s.color;
        ctx!.font = `700 ${8 * DPR}px Inter, Arial`;
        ctx!.textAlign = "center";
        ctx!.fillText(s.isYou ? "YOU" : s.name, s.x, s.y - 18 * DPR);
        if (s.isYou && (s.shield > 0 || s.magnet > 0)) {
          ctx!.save();
          ctx!.strokeStyle = s.shield > 0 ? "#33f2a4" : "#ff4fd8";
          ctx!.lineWidth = 2.5 * DPR;
          ctx!.shadowBlur = 10 * DPR; ctx!.shadowColor = ctx!.strokeStyle;
          ctx!.beginPath(); ctx!.arc(s.x, s.y, s.r + 8 * DPR, 0, Math.PI * 2); ctx!.stroke();
          ctx!.restore();
        }
      }

      for (const p of g.particles) {
        ctx!.globalAlpha = clamp(p.life * 1.4, 0, 1);
        ctx!.fillStyle = p.color;
        ctx!.fillRect(p.x, p.y, 3 * DPR, 3 * DPR);
      }
      ctx!.globalAlpha = 1;

      // "-N"/"+N" feedback for the human ship's own carry losing/gaining
      // points — a hit or a bank previously only showed a generic
      // particle burst, with no actual number attached to what changed.
      for (const f of g.floaters) {
        ctx!.globalAlpha = clamp(f.life, 0, 1);
        ctx!.fillStyle = f.color;
        ctx!.font = `800 ${13 * DPR}px Inter, Arial`;
        ctx!.textAlign = "center";
        ctx!.shadowBlur = 6 * DPR; ctx!.shadowColor = f.color;
        ctx!.fillText(f.text, f.x, f.y);
        ctx!.shadowBlur = 0;
      }
      ctx!.globalAlpha = 1;
    }

    function loop(now: number) {
      const dt = Math.min(0.033, (now - g.last) / 1000 || 0);
      g.last = now;
      update(dt);
      draw();
      g.raf = requestAnimationFrame(loop);
    }
    g.raf = requestAnimationFrame(loop);

    // Drag anywhere on the canvas to steer — matches the prototype's
    // canvas.addEventListener('pointerdown'/'pointermove') pattern: the
    // ship steers toward wherever the pointer currently is, not a fixed
    // joystick zone. Release anywhere (not just on the canvas) stops it,
    // same as the prototype's window-level pointerup.
    function setPointer(clientX: number, clientY: number) {
      const r = canvas!.getBoundingClientRect();
      g.pointer.x = (clientX - r.left) * DPR;
      g.pointer.y = (clientY - r.top) * DPR;
    }
    function onPointerDown(e: PointerEvent) {
      if (joystickEnabledRef.current) return; // joystick owns steering input instead
      g.pointer.active = true;
      setPointer(e.clientX, e.clientY);
    }
    function onPointerMove(e: PointerEvent) {
      if (g.pointer.active) setPointer(e.clientX, e.clientY);
    }
    function onPointerUp() { g.pointer.active = false; }
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    const MOVE_KEYS = new Set([
      "w", "a", "s", "d", "W", "A", "S", "D",
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    ]);
    function setKey(key: string, down: boolean) {
      switch (key) {
        case "w": case "W": case "ArrowUp": g.keys.up = down; break;
        case "s": case "S": case "ArrowDown": g.keys.down = down; break;
        case "a": case "A": case "ArrowLeft": g.keys.left = down; break;
        case "d": case "D": case "ArrowRight": g.keys.right = down; break;
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (!MOVE_KEYS.has(e.key)) return;
      e.preventDefault();
      setKey(e.key, true);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (!MOVE_KEYS.has(e.key)) return;
      setKey(e.key, false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      cancelAnimationFrame(g.raf);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [mapSeed, durationSec, startElapsedSec, spawnItem, youName, diff, theme, opponents]);

  // Pre-match "3, 2, 1, Go" — purely a local visual pause layered in
  // front of the setup effect above; it never touches match timing.
  // The server-authoritative clock (match.startedAt/durationSec) is
  // already running from the moment the match was created, well
  // before this component even mounts — startElapsedSec (see prop
  // doc-comment) already accounts for real elapsed time correctly, so
  // freezing g.running here for ~3s just means the countdown itself
  // eats a few seconds of the player's own effective run, exactly like
  // a countdown in any other real-time competitive game. This effect
  // only ever runs once: every new match is a genuinely fresh mount of
  // this component (mapSeed never changes on an already-mounted
  // instance — see the callers), so the initial `useState(3)` above is
  // the only "reset" this ever needs; the timers below just advance it
  // from there, all inside setTimeout callbacks rather than the effect
  // body itself.
  useEffect(() => {
    const timers = [
      setTimeout(() => setCountdown(2), 800),
      setTimeout(() => setCountdown(1), 1600),
      setTimeout(() => setCountdown("GO"), 2400),
      setTimeout(() => {
        setCountdown(null);
        const gNow = gRef.current;
        if (gNow) gNow.running = true;
      }, 3000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const useMagnet = () => {
    const g = gRef.current;
    if (!g || !g.running || !g.ships[0].active || g.magnetCd > 0) return;
    g.ships[0].magnet = 5;
    g.magnetCd = 14;
  };
  const useShield = () => {
    const g = gRef.current;
    if (!g || !g.running || !g.ships[0].active || g.shieldCd > 0) return;
    g.ships[0].shield = 4;
    g.shieldCd = 16;
  };
  const useOverclock = () => {
    const g = gRef.current;
    if (!g || !g.running || !g.ships[0].active || g.boostCd > 0) return;
    g.ships[0].boost = 2.5;
    g.boostCd = 10;
  };
  // One-time per match — fireUsed never resets, unlike the Cd timers
  // above which recharge and can be used again.
  const useFire = () => {
    const g = gRef.current;
    if (!g || !g.running || !g.ships[0].active || g.fireUsed) return;
    g.ships[0].fire = 10;
    g.fireUsed = true;
  };

  return (
    <div
      className={
        fullscreen
          ? "relative h-full w-full overflow-hidden bg-[#06101a] select-none"
          : "relative mx-auto aspect-[9/16] max-h-[80vh] w-full max-w-md overflow-hidden rounded-3xl border border-line bg-[#06101a] select-none"
      }
    >
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />

      {/* Topbar — title + vault status on one row, then the 4-stat grid.
          Deliberately lean: prize pool/objective info already lives in
          the stat grid below (Prize Pool card), so there's no separate
          explanatory paragraph repeating it — every real player only
          needs to glance at live numbers, not re-read rules every match. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10"
        style={{
          padding: "10px 10px 8px",
          background:
            "linear-gradient(180deg,rgba(2,5,9,.99) 0%,rgba(4,9,15,.96) 68%,rgba(4,9,15,.75) 84%,rgba(4,9,15,0) 100%)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: "#f7fbff" }}>
            Coin Rush Arena
            <small style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: ".03em", textTransform: "none", color: "#b7c4d3", marginTop: 2 }}>
              {missionTitle}
            </small>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {/* Joystick is opt-in — drag-anywhere stays the default
                control scheme, this just lets a player switch to a
                fixed on-screen thumbstick if they prefer it. Persisted
                per-device (localStorage), not part of match state. */}
            <button
              type="button"
              onClick={() => setJoystickEnabled((v) => !v)}
              className="pointer-events-auto"
              aria-pressed={joystickEnabled}
              aria-label="Toggle on-screen joystick"
              style={{
                padding: "5px 8px", borderRadius: 999, fontSize: 11, lineHeight: 1,
                border: `1px solid ${joystickEnabled ? "rgba(137,199,255,.5)" : "rgba(255,255,255,.14)"}`,
                background: joystickEnabled ? "rgba(137,199,255,.16)" : "rgba(255,255,255,.06)",
              }}
            >
              🕹️
            </button>
            <span
              style={{
                padding: "5px 11px", borderRadius: 999, fontSize: 9.5, fontWeight: 700,
                letterSpacing: ".06em", textTransform: "uppercase", border: "1px solid rgba(255,255,255,.12)",
                background: hud.vaultOpen ? "rgba(119,242,199,.08)" : "rgba(255,103,103,.08)",
                color: hud.vaultOpen ? "#77f2c7" : "#ff6767",
              }}
            >
              Vault {hud.vaultOpen ? "Open" : "Locked"}
            </span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5 }}>
          <StatCard accent="#89c7ff" label="Mission Time" value={String(hud.time)} />
          <StatCard accent="#f4c15d" label="Prize Pool" value={`$${prizePoolUsdt.toFixed(2)}`} sub="USDT pool" />
          <StatCard
            accent={theme.accent}
            label="Your Rank"
            value={`#${hud.rank}`}
            sub={`${hud.youBanked + hud.youCarry} PTS collected`}
          />
          <StatCard
            accent="#ff6767"
            label="Your Rocket"
            value={youName}
            sub={<LifeBar lives={hud.lives} total={diff.startLives} />}
          />
        </div>
      </div>

      {/* Live leaderboard panel — matches the prototype's .leaderboard: a
          4-across grid of chip + name + carry + banked PTS mini-cards. */}
      <div
        className="pointer-events-none absolute z-10"
        style={{
          left: 10, right: 10, top: 132,
          padding: "7px 7px 6px", borderRadius: 12,
          background: "rgba(7,12,18,.94)", border: "1px solid rgba(255,255,255,.10)", backdropFilter: "blur(12px)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, fontSize: 9.5, letterSpacing: ".05em", textTransform: "uppercase", color: "#b7c4d3", fontWeight: 600 }}>
          <span>Live Leaderboard</span>
          <b style={{ color: "#fff", fontWeight: 800 }}>{missionTitle}</b>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 5 }}>
          {hud.board.map((s, idx) => (
            <div
              key={s.name}
              style={{
                display: "grid", gridTemplateColumns: "10px minmax(0,1fr)", gap: 5, alignItems: "center",
                padding: 5, borderRadius: 9, minWidth: 0,
                background: s.isYou ? "rgba(137,199,255,.06)" : "rgba(255,255,255,.035)",
                boxShadow: s.isYou ? "0 0 0 1px rgba(137,199,255,.3) inset" : "none",
                border: s.isYou ? "1px solid rgba(137,199,255,.3)" : "1px solid rgba(255,255,255,.07)",
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, boxShadow: `0 0 8px ${s.color}` }} />
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: "block", fontSize: 9.5, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#fff" }}>
                  #{idx + 1} {s.isYou ? "YOU" : s.name}
                </strong>
              </div>
              {/* "Carry" (live, currently held, lost on a hit) is the
                  number that's actually moving up/down during play, so
                  it's the bold/prominent one — "Banked" (secured, only
                  changes on a vault run) used to be the bold number with
                  no label at all, which read as "my collected total"
                  and stayed at 0 the whole run unless you'd banked,
                  making real coin pickups look like they weren't
                  registering anywhere. */}
              <div style={{ gridColumn: "1 / -1", textAlign: "left", marginTop: 1 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", whiteSpace: "nowrap" }}>{s.carry} PTS</span>
                <span style={{ marginLeft: 4, fontSize: 7, fontWeight: 600, color: "#a9bccb", textTransform: "uppercase", letterSpacing: ".01em" }}>carrying</span>
                <span style={{ display: "block", fontSize: 7.5, color: "#a9bccb", letterSpacing: ".01em", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s.banked} PTS banked
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar — just the 4 power-up buttons, icon + label. No
          explanatory paragraph underneath: the labels already say what
          each one does, and dragging anywhere to steer is discoverable
          on first touch rather than needing a permanent caption. */}
      {countdown !== null && (
        <div
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
          style={{ background: "rgba(2,5,9,.45)" }}
        >
          <p
            key={String(countdown)}
            className="animate-pulse font-black tracking-wide"
            style={{
              fontSize: countdown === "GO" ? 72 : 96,
              color: countdown === "GO" ? "#33f2a4" : "#f7fbff",
              textShadow: `0 0 24px ${countdown === "GO" ? "#33f2a4" : "#89c7ff"}`,
            }}
          >
            {countdown === "GO" ? "GO!" : countdown}
          </p>
        </div>
      )}

      {ended && (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          style={{ background: "rgba(2,5,9,.55)", backdropFilter: "blur(2px)" }}
        >
          <div className="text-center">
            <p className="text-4xl font-black uppercase tracking-wide" style={{ color: "#89c7ff" }}>⏱ Time&apos;s Up</p>
            <p className="mt-2 animate-pulse text-xs uppercase tracking-widest text-muted">Finalizing your run…</p>
          </div>
        </div>
      )}

      {/* Non-blocking status while the human is out but the match (and
          the other, still-live ships) keeps running toward the real
          clock-based end — a light banner instead of the full-screen
          "ended" treatment above, since the race itself hasn't finished. */}
      {!ended && hud.lives <= 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-[236px] z-20 flex justify-center">
          <div className="rounded-full border border-risk/40 bg-black/70 px-4 py-1.5 text-xs font-black uppercase tracking-wide text-risk backdrop-blur">
            💀 You Died — waiting for the match to end
          </div>
        </div>
      )}

      {!ended && hud.lives > 0 && (
        <>
          <div className="pointer-events-auto absolute bottom-3 right-2.5 z-10 flex gap-1.5">
            <button
              onClick={useMagnet}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-wide shadow-lg transition active:scale-95"
              style={{
                background: "linear-gradient(180deg, rgba(192,132,252,.22), rgba(192,132,252,.08))",
                border: "1px solid rgba(192,132,252,.5)", color: "#f0e0ff", backdropFilter: "blur(12px)",
              }}
            >
              <span aria-hidden>🧲</span> Mag
            </button>
            <button
              onClick={useOverclock}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-wide shadow-lg transition active:scale-95"
              style={{
                background: "linear-gradient(180deg, rgba(245,158,11,.22), rgba(245,158,11,.08))",
                border: "1px solid rgba(245,158,11,.5)", color: "#ffe8c9", backdropFilter: "blur(12px)",
              }}
            >
              <span aria-hidden>⚡</span> Boost
            </button>
            <button
              onClick={useShield}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-wide shadow-lg transition active:scale-95"
              style={{
                background: "linear-gradient(180deg, rgba(119,242,199,.22), rgba(119,242,199,.08))",
                border: "1px solid rgba(119,242,199,.5)", color: "#d3fff0", backdropFilter: "blur(12px)",
              }}
            >
              <span aria-hidden>🛡</span> Shield
            </button>
            <button
              onClick={useFire}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-wide shadow-lg transition active:scale-95"
              style={{
                background: "linear-gradient(180deg, rgba(255,122,60,.22), rgba(255,122,60,.08))",
                border: "1px solid rgba(255,122,60,.5)", color: "#ffdcc9", backdropFilter: "blur(12px)",
              }}
            >
              <span aria-hidden>🔥</span> Fire
            </button>
          </div>
          {joystickEnabled && (
            <Joystick
              onChange={(dx, dy, active) => {
                joystickInputRef.current = { dx, dy, active };
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
