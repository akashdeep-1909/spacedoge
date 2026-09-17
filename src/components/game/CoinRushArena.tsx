"use client";

import { useEffect, useRef, useState, useCallback, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { seededRandom, DIFFICULTY_BY_MODE, THEME_BY_MODE, pickBotNames, botScore } from "@/lib/game-config";
import type { GameMode } from "@/generated/prisma/enums";
import { reportLiveMatchState } from "@/lib/hooks";
import type { LiveShipSample } from "@/lib/liveMatchStateTypes";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import {
  playMagnetSound,
  playShieldSound,
  playBoostSound,
  playFireSound,
  playZapSound,
  playHitSound,
  playShieldBlockSound,
  updateEngineSound,
  stopEngineSound,
} from "@/lib/gameSound";
import { drawRocketShip } from "@/lib/rocketShape";
import type { ResolvedLoadout } from "@/lib/shop-shared";

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
  // True for a ship that mirrors a real opponent's own client via
  // polled live-state instead of running local bot AI — see the
  // update() branch below and src/lib/liveMatchState.ts. True for
  // every real (non-bot) opponent seat during active play AND
  // spectate now, not spectate-only (see the `liveOpponents` prop's
  // own doc-comment for why). oppSlot is that opponent's real
  // MatchParticipant.slotNumber (the key live-state is reported/polled
  // under), or null for "you" and for true local bots.
  externallyDriven: boolean;
  oppSlot: number | null;
  // True for an actual AI-filled seat, false for a real human (you or
  // any other real participant) — distinct from externallyDriven,
  // which now tracks isBot's own negation almost exactly (every real
  // opponent seat is externally driven, active play or spectate); the
  // two only ever diverge for "you", which is never externallyDriven
  // even when isBot is false. Kept as its own field because it's what
  // hitShip() actually needs: a genuine bot's local sim is purely
  // cosmetic and should never actually go inactive (see hitShip's own
  // doc-comment), but a real friend's ship shouldn't get that same
  // immortality just because it's also locally rendered here. Always true for
  // every non-you ship in solo/instant play (no `opponents` prop at
  // all — every seat there really is a bot).
  isBot: boolean;
  // Coin Rush Shop (ROCKET_SHAPE category) — null for every bot/
  // opponent ship and for "you" with nothing equipped, which both
  // render as the default ROCKET silhouette. Purely cosmetic — see
  // drawRocket's own doc-comment for the fairness constraint this is
  // built to respect (collision radius never varies by shape).
  shapeKey: string | null;
  // Per-ship fire cooldown — see the bullet-spawning loop's own
  // doc-comment for why this moved from a single g.fireShotCd (which
  // only ever let "you" actually shoot) to one of these per ship.
  fireShotCd: number;
  // Filler-bot-only power-up cooldowns — see the "Filler bot power-up
  // instincts" heuristic below for why these exist as their own
  // per-ship fields rather than reusing g.shieldCd/magnetCd/boostCd
  // (those are "you"'s own purchased-loadout-tied budget, never
  // meaningful for an NPC seat). Unused (stay 0) for "you" and for a
  // real friend's own ship.
  shieldCd: number;
  magnetCd: number;
  boostCd: number;
  fireCd: number;
  // Total-uses budgets for the same trio, filler-bot only — confirmed
  // live as a real ask ("make it show more real, on/off 2-3 times the
  // whole game" instead of what read as almost continuously glowing):
  // with only a cooldown gating each one, a bot sitting in a
  // hazard-dense area re-triggered Shield/Magnet/Fire again the moment
  // each came off cooldown, near-back-to-back for the whole match. A
  // small fixed budget (see the heuristic's own doc-comment for the
  // exact numbers) makes each activation read as a distinct, occasional
  // event — same "genuinely smarter, not a free unlimited resource"
  // reasoning as everywhere else bots get tuned in this file — and
  // leaves them exposed most of the match, which is also most of what
  // brought hit frequency back up to something that doesn't look
  // invincible.
  shieldUsesLeft: number;
  magnetUsesLeft: number;
  fireUsesLeft: number;
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
// A genuine AI-filled seat (isBot true, never a real friend's ghost)
// gets this many EXTRA lives on top of the mode's own startLives — real
// mortality (hitShip no longer floors a bot's lives at 1, see its own
// doc-comment), but a hazard-dense map over a full 60-90s match will
// still land several hits on 3+ locally-simulated ships over that much
// time even with solid avoidance, and losing the whole match early via
// allShipsDown (every ship, bots included, out of lives) reads far
// worse than the "bots never die" bug this was meant to fix — confirmed
// live: a real run with unattended "you" input (no dodging at all) hit
// allShipsDown around 18s into a 60s match without this buffer. This
// keeps total elimination genuinely possible ("slowly die... also," if
// hit enough) while keeping it rare during ordinary play, especially
// while a human is still actively racing.
//
// Deliberately NEVER applied to a Rental-Bot-driven "you" ship (see the
// "you" ship's own lives field below) — confirmed live as a real bug
// the OTHER direction from what an earlier pass here assumed: a player
// who never bought STAT_HEALTH was still getting +6 lives "for free"
// the moment they equipped a Rental Bot, which is exactly the kind of
// unpurchased stat boost this shop is built to never hand out. "You"
// only ever gets more lives than the mode's own startLives through an
// actually-purchased STAT_HEALTH item (loadout.livesBonus), Rental Bot
// or not — same rule a manually-played human follows. The Rental Bot's
// own survivability improvement instead comes from genuinely smarter
// play (see the rentalBotActive-specific targeting/banking/hazard-
// alert tuning inside the bot-AI branch below), not a free stat.
const BOT_LIVES_BONUS = 6;
// The reporting side (an actively-playing human's own client). The
// polling side (useLiveMatchState's refetchInterval) is deliberately
// set faster than this, not equal to it — see that hook's own
// doc-comment for why. Lowered from 0.35 to 0.2 — confirmed live as a
// real ask ("friends not using autopilot see laggy movement from
// friends who are"): a bot's own steering can change direction far
// more abruptly frame-to-frame than a human's smoother drag-based
// input, so the SAME sample interval that looked fine interpolating a
// human's gentler path produced a visibly bigger jump — and therefore
// a jankier lerp — between two consecutive bot samples. More frequent,
// smaller-delta samples is the direct fix; the lerp window itself
// (see liveBuffers' own doc-comment) already adapts to whatever the
// real gap between samples turns out to be, so this isn't relied on to
// be exact.
const LIVE_REPORT_INTERVAL_SEC = 0.2;

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
  matchId,
  spectate = false,
  liveOpponents,
  loadout,
}: {
  mapSeed: string;
  durationSec: number;
  // Resuming a match already in progress (e.g. after a page reload —
  // see GET /api/matches/active) starts the clock partway through
  // instead of at 0, so the remaining time on screen matches what the
  // server already considers elapsed.
  startElapsedSec?: number;
  // died: true whenever the human's own ship ran out of lives before
  // this run ended (whether the match kept going for others after
  // that, or ended at the same moment via allShipsDown) — see finish()
  // for how it's derived and why it skips straight to reporting the
  // result with no overlay/pause in that case. Lets a lobby-match
  // caller skip its own post-finish "spectate the others live" view
  // for a player who already died instead of only ever watching their
  // own empty ship sit parked at 0 lives.
  onComplete: (result: { score: number; durationPlayedSec: number; died: boolean }) => void;
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
  // seeded bot-pool name for every seat as before. slotNumber is each
  // seat's real MatchParticipant.slotNumber — needed to key into
  // liveOpponents (both during active play and spectate now — see
  // that prop's own doc-comment); unused otherwise. shapeKey/colorHex are
  // that seat's own equipped ROCKET_SHAPE cosmetic (null if nothing
  // equipped, or for a bot) — confirmed live as a real gap: without
  // these, every non-you ship always rendered the default look
  // regardless of what its real owner actually bought, so only the
  // viewer's own rocket ever reflected their purchase.
  opponents?: { isBot: boolean; label: string; slotNumber: number | null; shapeKey: string | null; colorHex: string | null }[];
  // The real Match id — present whenever this is a lobby multiplayer
  // match (never for solo/instant-play, which has no one to report to
  // or spectate). While actively playing (spectate false) a real human
  // ship fire-and-forget reports its own live position here every
  // ~350ms; see the reporting branch in update() below.
  matchId?: string;
  // True only for the post-finish "watch the others live" view (see
  // the lobby page's waitingForOthers render). Ship 0 ("you") never
  // takes input and stays parked in that view. Any of ships 1-3 that
  // correspond to a real (non-bot) opponent are driven by
  // liveOpponents instead of local bot AI regardless of spectate —
  // see that prop's own doc-comment. Bots need no live data — they're
  // already deterministic from the shared mapSeed, so every viewer
  // reproduces them locally and identically with no sync needed.
  spectate?: boolean;
  // Polled snapshot (see useLiveMatchState) of every OTHER real
  // player's own latest reported position/carry/lives/shield/magnet/
  // fire, keyed by their MatchParticipant.slotNumber. Confirmed wanted
  // live: previously only read while spectate was true, so two real
  // friends actively racing each other each saw the OTHER'S ship
  // driven by a local bot-AI guess, not the other player's actual
  // moves — could never see a friend's real shield/fire in real time
  // during active play, only after someone finished and switched to
  // spectating. The lobby page now polls this during active play too
  // (see its own doc-comment on the hook call), so every real
  // opponent's ship — active play or spectate — reflects their actual
  // reported state. A ship whose slot has no sample yet (the sub-
  // second gap right after the match starts, before its owner's first
  // report lands) just holds still at spawn until one arrives, rather
  // than falling back to a local guess that would only ever diverge
  // from the truth once real data exists.
  liveOpponents?: Record<number, LiveShipSample>;
  // Coin Rush Shop — resolved SERVER-SIDE by POST /api/matches (echoed
  // straight back in its own response, see src/lib/shop.ts
  // consumeLoadoutSelections' ResolvedLoadout, mirrored client-safe in
  // shop-shared.ts) and passed through unchanged; this component never
  // re-derives or trusts a client-side guess about what's equipped.
  // shapeKey/colorHex are purely cosmetic (see drawRocket's own
  // doc-comment for the fairness constraint — collision radius never
  // varies); every other field is a real, server-validated gameplay
  // bonus applied at the exact spots noted on each one below.
  loadout?: ResolvedLoadout;
}) {
  const { t } = useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Same ref-mirror pattern as onCompleteRef/liveOpponentsRef above —
  // the canvas nameplate label (drawn inside the setup effect's own
  // closure below, which intentionally does NOT depend on `t`: adding
  // it would re-run the whole match setup, resetting an in-progress
  // run, every time this even re-renders) still needs the CURRENT
  // translation function, not whatever it captured once at mount, in
  // case the player switches language mid-match.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  // Polled every ~350ms (see useLiveMatchState) — mirrored into a ref,
  // not read directly from the prop, so the setup effect below (whose
  // closure drives the whole game loop) doesn't need this in its
  // dependency array. Depending on it directly would re-run the entire
  // match setup on every single poll tick.
  const liveOpponentsRef = useRef(liveOpponents);
  useEffect(() => {
    liveOpponentsRef.current = liveOpponents;
  }, [liveOpponents]);

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
    // Matches the "you" ship's own initial lives right below (spectate
    // mode never shows full health for a parked ship, see that
    // doc-comment) — this is only what's on screen for the brief
    // window before the first real update() tick, but it should still
    // match rather than visibly jump right after mount. Deliberately
    // NOT bumped for a Rental Bot — see BOT_LIVES_BONUS's own
    // doc-comment for why "you" only ever gets more lives than the
    // mode's base through an actually-purchased STAT_HEALTH item.
    lives: spectate ? 0 : diff.startLives + (loadout?.livesBonus ?? 0),
    youBanked: 0,
    youCarry: 0,
    board: [] as { name: string; color: string; isYou: boolean; carry: number; banked: number }[],
  });
  // Confirmed live as a real bug: the lobby page's showGame ->
  // waitingForOthers transition (see skipCountdown's own doc-comment
  // right below) genuinely unmounts this whole component while your
  // own finish() -> onComplete -> submitResults round trip is in
  // flight (the parent renders an unrelated CoinRushArena-less spinner
  // screen for that beat — see LobbyPage's "submitted &&
  // !waitingForOthers && !result" branch), so a hardcoded `false` here
  // meant the freshly-remounted spectate instance always forgot the
  // match had already hit TIME'S UP moments earlier: it flashed back
  // into full live gameplay plus the "spectating, waiting for other
  // racers" banner, then re-discovered g.time <= 0 a beat later and
  // showed TIME'S UP a second time — reading exactly like the match
  // paused and restarted right after it had already ended. Same fix
  // as skipCountdown, and for the same reason: if the real,
  // server-authoritative match clock (startElapsedSec vs durationSec)
  // already says time's up by the moment THIS instance mounts, there's
  // nothing left to play — start already-ended instead of replaying a
  // beat of gameplay that's just going to immediately re-end anyway.
  const [ended, setEnded] = useState(startElapsedSec >= durationSec);
  // Spectate mode skips the countdown entirely — confirmed live as a
  // real bug ("the game ends and suddenly restarts"): the lobby page's
  // showGame -> waitingForOthers transition genuinely mounts a fresh
  // CoinRushArena instance (a different JSX branch, not a same-instance
  // prop change), so the plain `3` default below replayed a full
  // "3, 2, 1, Go" pre-match countdown for a race that's already well
  // underway — jarring and easy to misread as the whole match having
  // restarted from scratch. There's no "start" to count down to here;
  // the match is already running elsewhere, this view is only ever
  // watching it.
  //
  // Also skipped whenever startElapsedSec already covers the whole
  // match (a resumed/refreshed solo match well past its own duration —
  // e.g. a settle request that failed silently and left the page stuck
  // on "TIME'S UP", then got refreshed) — same reasoning as spectate:
  // replaying a fresh countdown (ships back at spawn, a brand-new "3,
  // 2, 1, Go") for a match that's already over reads exactly like the
  // whole thing restarting, right before it immediately re-hits
  // g.time <= 0 anyway.
  const skipCountdown = spectate || startElapsedSec >= durationSec;
  const [countdown, setCountdown] = useState<number | "GO" | null>(skipCountdown ? null : 3);
  // Read by the setup effect below (which can't safely list `countdown`
  // itself as a dependency — that would re-run the whole effect, tearing
  // down and rebuilding the match, every time the countdown ticks) to
  // decide a freshly-built `g`'s own initial `running` value. Defense in
  // depth: only the countdown effect (a SEPARATE effect, dependent only
  // on skipCountdown) is normally responsible for ever setting
  // g.running = true, once per mount. Confirmed live as a real, severe
  // bug: if the setup effect ever re-runs on an ALREADY-mounted instance
  // for any reason OTHER than the one legitimate case that also changes
  // skipCountdown (the play->spectate transition) — e.g., an unrelated
  // prop like `startElapsedSec` recomputing from an unexpected lobby
  // refetch mid-match — the countdown effect has no reason to re-run
  // (its own dependency, skipCountdown, is unchanged), so nothing EVER
  // sets the freshly-rebuilt g.running back to true: the match freezes
  // completely and permanently, ships motionless, mission clock frozen,
  // not even reaching "TIME'S UP" — confirmed live by directly
  // inspecting gRef.current.running (stuck false) and the mission clock
  // (provably not advancing over several real seconds) after forcing
  // exactly this kind of mid-match re-run. Seeding a fresh g as already
  // running whenever the countdown has already completed once before
  // (never true on a GENUINE first mount, always true after the first
  // completed countdown) closes that regardless of what triggers the
  // re-run, on top of removing the specific trigger this was chasing
  // (see useLobby's own refetchOnWindowFocus doc-comment).
  const countdownAlreadyDoneRef = useRef(skipCountdown);
  useEffect(() => {
    if (countdown === null) countdownAlreadyDoneRef.current = true;
  }, [countdown]);

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
    // Fire has no cooldown to recharge — it's 1 use for the whole match
    // by default (POWERUP_FIRE shop purchases add more via
    // loadout.fireExtraUses), gated on this counter instead of a Cd
    // timer.
    fireUsesRemaining: number;
    // Damage feedback for the human ship, both decaying to 0 every
    // frame in update() — set to 1 in hitShip() the instant a real hit
    // (not shield-blocked) lands. youHitFlash tints the rocket red in
    // drawRocket(); shakeMag briefly jolts the whole camera in draw().
    // Scoped to "you" specifically (not every ship) since this is
    // player-facing feedback, not a generic hazard-hit effect.
    youHitFlash: number;
    shakeMag: number;
    last: number;
    raf: number;
    // Live-position sync (see the `spectate`/`matchId` props above and
    // `liveOpponents`'s own doc-comment — active play now, not just
    // spectating). liveReportCd: seconds until the next self-report
    // while actively playing. liveBuffers: per-opponent (keyed by real
    // slotNumber) last-two-samples buffer, used to lerp smooth motion
    // between polls instead of snapping every tick. lerpMs is that
    // interpolation's duration, adaptive rather than a flat assumed
    // ~350ms — confirmed live as a real cause of "laggy/stuttery"
    // opponent movement on a real deployed server (as opposed to
    // localhost, where round trips are near-instant): a fixed 350ms
    // window means any poll that actually takes longer than that
    // (real network latency/jitter, not just localhost's near-zero
    // round trip) leaves the ship completely frozen at its last known
    // spot for the overrun, then snapping to lerp again once the next
    // sample finally lands — a repeating freeze/catch-up pattern that
    // reads as lag even though each individual position is correct.
    // Stretching (or shrinking) the lerp window to match how long the
    // PREVIOUS gap between samples actually took keeps motion
    // continuous regardless of real poll timing, at the cost of being
    // one sample-interval behind on how fast a sudden latency change
    // is reflected — the right trade for smoothness over precision on
    // a purely cosmetic sync.
    liveReportCd: number;
    liveBuffers: Map<number, { from: LiveShipSample; to: LiveShipSample; toReceivedAt: number; lerpMs: number }>;
    // True once a final alive:false report has actually gone out for
    // this ship — see the reporting block below's own doc-comment for
    // why this exists (without it, a real death is never reported at
    // all, only ever inferred by silence).
    deathReported: boolean;
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
        // colorHex is a Coin Rush Shop cosmetic purchase (ROCKET_SHAPE
        // category) — falls back to the mode's own theme color exactly
        // as before whenever nothing's equipped.
        color: loadout?.colorHex ?? theme.shipColor, name: youName, isYou: true,
        // Spectating: you already finished your own run, so "your" ship
        // never plays — parked and excluded from every hazard/item/bank
        // interaction below via the same `active` flag a dead ship uses.
        // STAT_HEALTH (livesBonus) and STAT_SPEED (speedMultBonus) are
        // the only two REAL gameplay-affecting shop purchases applied
        // here — both permanent for the whole match, distinct from the
        // Boost button's own temporary multiplier applied in update().
        //
        // lives is 0 in spectate mode, never the full startLives —
        // confirmed live as a real bug ("full health, doesn't decrease
        // after the bot is dead"): a parked ship is inactive from the
        // moment it's built and never takes another hit for the rest of
        // spectating (hitShip() no-ops on !active), so whatever this
        // starts at is what "YOUR ROCKET" shows for the entire spectate
        // screen. It used to start full regardless of how your actual
        // run ended, which reads as "health never went down" even after
        // you'd genuinely died — 0 correctly reflects "your run is
        // over," matching the already-correct `active: false` right
        // next to it.
        //
        // Deliberately NOT bumped by BOT_LIVES_BONUS for a Rental Bot —
        // see that constant's own doc-comment. "You" only ever gets
        // more lives than the mode's base through an actually-purchased
        // STAT_HEALTH item, exactly like a manually-played human;
        // equipping a Rental Bot alone grants nothing extra here.
        lives: spectate ? 0 : diff.startLives + (loadout?.livesBonus ?? 0), carry: 0, banked: 0, active: !spectate, invuln: 0, knockback: 0,
        speed: 150 * diff.playerSpeedMult * (1 + (loadout?.speedMultBonus ?? 0)) * DPR, magnet: 0, shield: 0, boost: 0, fire: 0,
        externallyDriven: false, oppSlot: null, isBot: false,
        shapeKey: loadout?.shapeKey ?? null, fireShotCd: 0, shieldCd: 0, magnetCd: 0, boostCd: 0, fireCd: 0,
        shieldUsesLeft: 0, magnetUsesLeft: 0, fireUsesLeft: 0,
      },
      ...botNames.map((name, i) => {
        const opp = opponents?.[i];
        // A real friend's ship hands its movement over to polled live
        // data (see liveOpponents' own doc-comment — the lobby page now
        // polls this during active play too, not just post-finish
        // spectate, so every player sees every other real player's
        // actual actions instead of a local guess). Computed purely
        // from the roster, not from whether a live sample has actually
        // arrived yet: the update loop below already leaves an
        // externally-driven ship parked at spawn for the sub-second gap
        // before its first sample lands (see s.externallyDriven's own
        // handling), which is far less disruptive than baking in
        // whatever liveOpponents happened to be on this one render. A
        // genuine filler bot (isBot true) is never externally driven —
        // it's already deterministic from the shared mapSeed, so local
        // AI reproduces it identically on every viewer with no sync
        // needed at all.
        const externallyDriven = !!opp && !opp.isBot && opp.slotNumber != null;
        // opp is only ever absent in solo/instant play, where every
        // seat really is a bot — see isBot's own doc-comment above.
        const isBot = opp ? opp.isBot : true;
        return {
          x: (W / 4) * (i + 1), y: 170 * DPR, r: 13 * DPR, vx: 0, vy: 0, angle: -Math.PI / 2,
          // A real friend's own purchased rocket color/shape, when they
          // have one equipped — same fallback chain "you" uses (theme
          // color / null shape) when nothing's equipped or the seat is
          // a bot. Confirmed live as a real gap: this used to always be
          // the flat BOT_COLORS palette with no shape at all for every
          // non-you ship, so a real opponent's own bought cosmetics
          // never showed up on anyone else's screen.
          color: opp?.colorHex ?? BOT_COLORS[i], name: opp?.label ?? `@${name}`, isYou: false,
          lives: diff.startLives + (isBot ? BOT_LIVES_BONUS : 0), carry: 0, banked: 0, active: true, invuln: 0, knockback: 0,
          speed: (95 + rand() * 20) * DPR, magnet: 0, shield: 0, boost: 0, fire: 0,
          externallyDriven, oppSlot: externallyDriven ? opp!.slotNumber : null, isBot,
          shapeKey: opp?.shapeKey ?? null, fireShotCd: 0,
          // Staggered random starting cooldowns (filler bots only ever
          // read these — see their own doc-comment on ShipEntity) so
          // 2-3 bots on the same field don't all react to a hazard in
          // perfect lockstep the first time one gets close.
          shieldCd: rand() * 8, magnetCd: rand() * 8, boostCd: rand() * 6, fireCd: rand() * 10,
          shieldUsesLeft: 3, magnetUsesLeft: 2, fireUsesLeft: 2,
        };
      }),
    ];

    // How many REAL humans (not filler bots) are actually in this
    // match — "you" plus any opponent seat whose own isBot is false. In
    // solo/instant play `opponents` is entirely absent, so this is
    // always 1. Server settlement (rankBotMatch, src/lib/game-config.ts)
    // now only ever guarantees a bot a rank at all when this is <= 1 —
    // real multiplayer (2+ humans) ranks purely by score, bots included
    // — so every bit of the "guaranteed bot" foreshadowing logic below
    // must be gated the same way, or the live leaderboard keeps
    // bait-and-switching a rank that the server no longer actually
    // guarantees.
    const realHumanCount = 1 + (opponents?.filter((o) => !o.isBot).length ?? 0);

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
    // rather than leaving a coin-flip mismatch on the table. Only
    // actually consulted (see displayRankedBoard) when realHumanCount
    // <= 1 — harmless to always compute.
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
      const dsh: DasherEntity = { x: p.x, y: p.y, r: 10.5 * DPR, state: "aim" as const, timer: 1.2 + rand() * 1.3, vx: 0, vy: 0, dirX: 0, dirY: 1 };
      aimDasher(dsh, ships);
      return dsh;
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
      // Starts frozen UNLESS the countdown has already genuinely
      // completed once before (countdownAlreadyDoneRef, see its own
      // doc-comment above) — the normal case is still "false," flipped
      // to true once the pre-match "3, 2, 1, Go" countdown effect below
      // finishes for the first time. update() bails out immediately
      // while this is false (see its own doc-comment), so the loop
      // keeps rendering the static starting scene (ships, hazards, HUD)
      // every frame without anything actually moving or the mission
      // clock ticking down — a real pause, not a cosmetic overlay on
      // top of a game that's already secretly running. But if THIS
      // effect re-runs on an already-past-its-countdown instance (see
      // countdownAlreadyDoneRef's own doc-comment for the real bug this
      // closes), the countdown effect has no reason to fire again, so
      // nothing else would ever flip a freshly-built g back to running
      // — starting it already-running here instead is what stops that
      // from being a permanent freeze.
      running: countdownAlreadyDoneRef.current,
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
      fireUsesRemaining: 1 + (loadout?.fireExtraUses ?? 0),
      youHitFlash: 0,
      shakeMag: 0,
      last: performance.now(),
      raf: 0,
      liveReportCd: 0,
      liveBuffers: new Map(),
      deathReported: false,
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
    // Locks a dasher's telegraphed dash direction ONCE, at the moment
    // it starts (or restarts) aiming — at the nearest ship right then,
    // never updated again until it actually dashes. Confirmed live as
    // the real cause behind "bots getting hit constantly, can't dodge
    // dashers": the aim direction used to be recomputed EVERY frame for
    // the entire ~1.2-2.5s telegraph (inline in the aim-state branch
    // below), continuously re-locking onto whichever ship was currently
    // closest — so a bot (or a human) that steered clear of the
    // telegraphed line just caused the dasher to instantly re-aim at
    // its new position, making the "dodge the line you can see" premise
    // the whole mechanic (and its own avoidance code, which leans away
    // from dsh.dirX/dirY) depends on physically impossible: there was
    // never a fixed line to actually finish dodging. A telegraph that
    // commits once and holds is what every other similar mechanic in
    // this genre already does, and what the aim-line rendering (see
    // draw()'s own "aim" branch) already visually implies to a player
    // even though the direction underneath kept moving anyway.
    function aimDasher(dsh: DasherEntity, ships: ShipEntity[]) {
      let target: ShipEntity | null = null, bestD = Infinity;
      for (const s of ships) {
        if (!s.active) continue;
        const d = dist(dsh, s);
        if (d < bestD) { bestD = d; target = s; }
      }
      if (target) {
        const dx = target.x - dsh.x, dy = target.y - dsh.y, len = Math.hypot(dx, dy) || 1;
        dsh.dirX = dx / len; dsh.dirY = dy / len;
      }
    }
    // Bot hazard-avoidance "panic" curve — 0 far away, ramping up to 1
    // right at the hazard, quadratically (not linearly) so the last
    // stretch before actually touching something bends much harder
    // than the early, gentle lean-away does. See its call sites in the
    // bot-AI movement branch below.
    function panic(d: number, radius: number) {
      const t = Math.max(0, (radius - d) / radius);
      return t * t;
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
        if (s.isYou) playShieldBlockSound();
        return false;
      }
      if (s.invuln > 0) return false;
      // Every ship — bots included — takes a real hit now. Bots used to
      // be clamped so their lives could never actually reach 0 (their
      // real reward score is computed server-side from the map seed,
      // botScore/botScoreForSlot, completely decoupled from this local
      // visual sim either way — see this component's own top
      // doc-comment), but that made a bot visibly shrug off hit after
      // hit with zero consequence, which read as fake/broken rather
      // than competitive — confirmed live as a real ask to remove.
      // allShipsDown below already handles every ship (bots included)
      // going inactive gracefully (ends the local sim early without
      // shrinking the reported play duration), so nothing else needed
      // to change to support bots actually dying. The AI's own hazard
      // avoidance (the bot-driven branch in the ships loop below) was
      // tuned up specifically so this stays rare in practice while a
      // human/Rental Bot is still racing — real mortality, not just
      // better luck.
      s.lives -= 1;
      s.invuln = hitInvulnSec;
      if (s.isYou) {
        playHitSound();
        g.youHitFlash = 1;
        g.shakeMag = 1;
      }
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
        // A real opponent's ship (spectate mode, or a real friend's
        // seat during active play — see isBot's own doc-comment) shows
        // its true carry — no reason to run the bot bait-and-switch-
        // foreshadowing logic below on a live human's honestly-reported
        // number. realHumanCount >= 2 means genuine multiplayer, where
        // the server no longer guarantees any bot a rank at all (see
        // rankBotMatch) — every bot's own true carry shows there too,
        // or the live leaderboard would keep foreshadowing an outcome
        // the actual settlement can no longer produce.
        if (s.isYou || s.externallyDriven || !s.isBot || realHumanCount >= 2 || i - 1 === contestBotIndex) return s;
        if (s.carry > you.carry * 1.15) return s;
        const bumpedCarry = Math.ceil(you.carry * 1.25) + 10;
        // Confirmed live: once the human dies, you.carry never changes
        // again (a dead ship neither moves nor collects), so a bump
        // computed purely from it freezes solid for the rest of the
        // match — even though this bot itself is still actively racing
        // and genuinely picking things up the whole time (bots can no
        // longer die at all, see hitShip()). Math.max against the bot's
        // own real, still-growing s.carry lets the displayed number
        // keep climbing from real activity the moment it organically
        // overtakes the bump anchor, instead of looking stuck — the
        // "always shows at least bump" guarantee this mechanic exists
        // for is unaffected, since real growth can only ever push the
        // shown number higher, never lower.
        return { ...s, carry: Math.max(s.carry, bumpedCarry) };
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
      g.youHitFlash = Math.max(0, g.youHitFlash - dt * 2.5);
      g.shakeMag = Math.max(0, g.shakeMag - dt * 4);

      const you = g.ships[0];
      // Every ship, not just "you" — confirmed live as a real bug (and
      // the actual cause behind "bots now keep shield/fire on the whole
      // game"): this used to only ever decay "you"'s own values, so the
      // new filler-bot power-up heuristic below (which sets s.shield/
      // s.fire on a genuine bot) had nothing that ever counted them
      // back down again — one activation just stayed on permanently
      // for the rest of the match. An externally-driven real friend's
      // ship gets these overwritten from its own polled sample later in
      // the ships loop regardless, so decaying them here first doesn't
      // fight that.
      for (const s of g.ships) {
        s.magnet = Math.max(0, s.magnet - dt);
        s.shield = Math.max(0, s.shield - dt);
        s.boost = Math.max(0, s.boost - dt);
        s.fire = Math.max(0, s.fire - dt);
      }

      // Live-position reporting — an actively-racing human fire-and-
      // forget reports its own ship's position/carry/lives every ~350ms
      // so every other real participant can see this run live, whether
      // they're still actively racing themselves or have already
      // finished and are watching (see the externallyDriven branch
      // below and src/lib/liveMatchState.ts). Never fires in spectate
      // mode itself (you.active is already false there) or for solo/instant-play
      // (matchId is never passed).
      //
      // Confirmed live as a real bug: this used to be flatly gated on
      // you.active, which means the exact FRAME a ship dies, reporting
      // stopped completely — the very last sample anyone ever received
      // still said alive:true, since dying and reporting happen in the
      // same tick and the death always wins the race. Every spectator
      // was left watching a ship that had actually finished sit frozen
      // in place, forever "alive," with no way to ever learn otherwise
      // (a real participant's death is an EVENT, never inferable from
      // silence — unlike a bot, which has no live-state at all and is
      // driven by the purely local, always-continues AI instead). Now
      // the moment you.active flips false, one final report goes out
      // immediately (bypassing the normal throttle) with alive:false,
      // and deathReported latches so it's sent exactly once, not every
      // frame for the rest of the match.
      if (matchId && (you.active || !g.deathReported)) {
        g.liveReportCd -= dt;
        if (!you.active || g.liveReportCd <= 0) {
          g.liveReportCd = LIVE_REPORT_INTERVAL_SEC;
          if (!you.active) g.deathReported = true;
          reportLiveMatchState(matchId, {
            xFrac: clamp(you.x / g.W, 0, 1),
            yFrac: clamp((you.y - TOP_MARGIN) / (g.H - TOP_MARGIN - BOTTOM_MARGIN), 0, 1),
            carry: Math.floor(you.carry),
            banked: Math.floor(you.banked),
            lives: Math.max(0, you.lives),
            alive: you.active,
            shield: you.shield > 0,
            magnet: you.magnet > 0,
            fire: you.fire > 0,
          });
        }
      }

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
      // Rental Bot (Coin Rush Shop, RENTAL_BOT category — Play-with-
      // Friends lobby matches only, see src/lib/shop.ts
      // consumeLoadoutSelections' own allowRentalBot gate) — "you"
      // falls through into the exact same local-bot-AI branch below
      // that already drives ships 1-3, reusing its coin-seeking +
      // hazard-avoidance logic untouched rather than needing a second
      // implementation. See the power-up heuristics further down
      // (after this loop) for the rest of "the bot plays for you."
      const rentalBotActive = !!loadout?.rentalBot;
      for (const s of g.ships) {
        s.invuln = Math.max(0, s.invuln - dt);
        s.knockback = Math.max(0, s.knockback - dt);
        if (!s.active) continue; // out of lives — done for the match, no respawn
        // A real opponent's live channel takes a few real seconds to
        // produce its first sample — their OWN client's pre-match
        // countdown has to finish before they report anything at all
        // (see the reporting block's own g.running gate above), plus
        // one report/poll round trip after that. Confirmed live as a
        // real regression once externallyDriven stopped being
        // spectate-only: that ship sat frozen at spawn for those first
        // few seconds instead of moving at all, which reads as broken
        // — worse than the old always-local-bot-AI behavior it
        // replaced. Buffering the sample here (rather than inside the
        // branch below) lets `hasLiveSample` gate on whether one has
        // actually arrived yet: falls through to the exact same local
        // bot AI that used to drive this ship as a bridge for that gap,
        // then switches over the instant real data exists — same
        // pattern as a bot's local sim, just temporary.
        const hasLiveSample = s.externallyDriven && (() => {
          const sample = s.oppSlot != null ? liveOpponentsRef.current?.[s.oppSlot] : undefined;
          const buf = g.liveBuffers.get(s.oppSlot!);
          if (sample && (!buf || sample.updatedAt > buf.to.updatedAt)) {
            const now = performance.now();
            // See lerpMs's own doc-comment on liveBuffers: match the
            // interpolation window to how long this gap between
            // samples actually took, clamped so one unusually fast or
            // slow poll can't make motion snap instantly or crawl for
            // several seconds.
            const lerpMs = buf ? Math.min(1500, Math.max(150, now - buf.toReceivedAt)) : LIVE_REPORT_INTERVAL_SEC * 1000;
            g.liveBuffers.set(s.oppSlot!, { from: buf?.to ?? sample, to: sample, toReceivedAt: now, lerpMs });
          }
          return g.liveBuffers.has(s.oppSlot!);
        })();
        let ax = 0, ay = 0;
        if (s.isYou && !rentalBotActive) {
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
        } else if (hasLiveSample) {
          // Real opponent — active play or spectate — driven by polled
          // live-state instead of local AI, now that a first sample has
          // actually arrived (see hasLiveSample's own doc-comment for
          // the bridge case above this). Lerp between the last 2
          // buffered samples over the poll interval so motion doesn't
          // snap every ~350ms; carry/banked/lives/alive are just
          // numbers on a HUD card, so those snap straight to the latest
          // known sample rather than being interpolated too.
          const b = g.liveBuffers.get(s.oppSlot!)!;
          const t = Math.min(1, (performance.now() - b.toReceivedAt) / b.lerpMs);
          const xFrac = b.from.xFrac + (b.to.xFrac - b.from.xFrac) * t;
          const yFrac = b.from.yFrac + (b.to.yFrac - b.from.yFrac) * t;
          const nx = clamp(xFrac * g.W, s.r, g.W - s.r);
          const ny = clamp(TOP_MARGIN + yFrac * (g.H - TOP_MARGIN - BOTTOM_MARGIN), TOP_MARGIN + s.r, g.H - BOTTOM_MARGIN - s.r);
          if (Math.hypot(nx - s.x, ny - s.y) > 1 * DPR) s.angle = Math.atan2(ny - s.y, nx - s.x);
          s.x = nx; s.y = ny;
          s.carry = b.to.carry;
          s.banked = b.to.banked;
          s.lives = b.to.lives;
          s.active = b.to.alive;
          // Just on/off, snapped straight to the latest sample like
          // carry/banked/lives above — confirmed live as a real gap
          // ("can't see the other user's bot firing and using
          // shield"): draw()'s own glow-ring below now reads these
          // for every ship, not just "you", so a real opponent's
          // actual Shield/Magnet/Fire state (reported by their own
          // client) is finally visible here too, not just to them.
          s.shield = b.to.shield ? 1 : 0;
          s.magnet = b.to.magnet ? 1 : 0;
          s.fire = b.to.fire ? 1 : 0;
          // Position/stats are set directly above (not integrated from
          // vx/vy) — skip the generic velocity-based clamp and the local
          // bank-zone check below, both of which would fight the polled
          // truth for this ship.
          continue;
        } else {
          // Reached by a genuine filler bot, OR a real friend whose
          // live channel hasn't produced a sample yet (see
          // hasLiveSample's own doc-comment — this is that bridge).
          // s.isYou is only reachable in this branch at all when
          // rentalBotActive is true (the other branch above handles a
          // manually-played "you"), so it uniquely picks out the
          // Rental-Bot-driven ship here — never a filler bot or a real
          // friend. Deliberately more disciplined than the flat filler-
          // bot thresholds below: banks sooner (locks in points instead
          // of risking a big carry to one hit) — real skill, not a
          // stat, is the actual fix for "the bot looks fake, killed
          // many times" now that BOT_LIVES_BONUS no longer applies here
          // (see that constant's own doc-comment) — filler bots'
          // thresholds are untouched.
          //
          // Both branches now require g.bankZone.open — confirmed live
          // as the actual cause of bots "just circling in place" and
          // "sitting in the upper portion with no coins to collect":
          // the vault sits right at the top of the play area (see
          // bankZone's own homeY) and is only open ~40% of the time
          // (bz.open cycles on an 8.4s period). The unconditional heavy-
          // carry branch used to send a bot there the INSTANT carry
          // crossed the threshold regardless of whether it could
          // actually bank yet, so a bot that arrived mid-closed-phase
          // just parked there tracking the vault's own slow side-to-
          // side drift (bz.x's sine wave) for however long was left of
          // the ~5s closed window — reading exactly like aimless
          // circling near the top, ignoring every coin elsewhere on the
          // map the whole time. Gating on open means a bot only ever
          // commits to the vault once it can actually use it; the rest
          // of the time it keeps doing the thing an attentive player
          // would — collecting — and reacts the instant the vault opens
          // (this recomputes every frame, so that's a same-frame
          // reaction, not a delayed one).
          const wantBank = g.bankZone.open && (
            s.isYou
              ? s.carry >= 35 || (s.carry >= 12 && dist(s, g.bankZone) < 240 * DPR)
              : s.carry >= 55 || (s.carry >= 20 && dist(s, g.bankZone) < 220 * DPR)
          );
          let tx = s.x, ty = s.y;
          if (wantBank) { tx = g.bankZone.x; ty = g.bankZone.y; }
          else if (s.isYou) {
            // Value-aware, not just nearest — the same edge an
            // attentive player has over grabbing whatever's physically
            // closest (a gold coin two steps further beats a bronze one
            // step away). Hazard avoidance below still bends the actual
            // path around anything dangerous regardless of which item
            // this picks.
            //
            // dogecore carries it.value === 0 (it's a pickup that grants
            // "you" a 6s 2x multiplier on whatever's collected next, see
            // the pickup loop's own g.dogeCoreT/mult logic — never a
            // coin amount itself), so scoring it by raw value would make
            // a "smarter" bot ignore the single most valuable pickup on
            // the field entirely. scoreValue substitutes a deliberately
            // high heuristic stand-in (above even "cash") only for
            // ranking which item to head toward — never touches the
            // real value actually credited on pickup.
            let best: ItemEntity | null = null, bestScore = -Infinity;
            for (const it of g.items) {
              const scoreValue = it.kind === "dogecore" ? 18 : it.value;
              const score = scoreValue / (dist(s, it) + 30 * DPR);
              if (score > bestScore) { bestScore = score; best = it; }
            }
            if (best) { tx = best.x; ty = best.y; }
          } else {
            let best: ItemEntity | null = null, bestD = Infinity;
            for (const it of g.items) { const d = dist(s, it); if (d < bestD) { bestD = d; best = it; } }
            if (best) { tx = best.x; ty = best.y; }
          }
          // Bot hazard avoidance — dashers (the fast-charging triangles)
          // get their own, larger-radius term (charging fast covers
          // ground quickly, so a bot needs to start reacting well before
          // one is actually close) plus an explicit lean AWAY from a
          // still-aiming dasher's own telegraphed dash direction — the
          // same aim-line the player themselves can see rendered (see
          // the "aim" branch in draw()), so a bot dodging it "blind"
          // would be less alert than a player who can just look at the
          // warning line. Radii and weight bumped further (confirmed
          // live as a real ask, alongside removing bot immortality in
          // hitShip() above): a bot that can now actually die needs to
          // be meaningfully better at not getting hit in the first
          // place, not just luckier — reacting earlier (bigger radii)
          // and committing harder once something IS close (the extra
          // near((radius - d) / radius)^2 panic term below, on top of
          // the existing linear term, so the last stretch right before
          // a hazard is genuinely close bends much harder than the
          // early, gentle lean-away does) rather than only a flat
          // proportional push the whole time.
          //
          // hazardAlertMult only widens s.isYou's own radii (a Rental
          // Bot notices a hazard a little sooner than a filler bot or
          // an average player would, same "genuinely smarter, not
          // stat-boosted" reasoning as the targeting/banking above) —
          // 1 everywhere else, so a filler bot's own avoidance is
          // completely unchanged.
          const hazardAlertMult = s.isYou ? 1.2 : 1;
          let avoidX = 0, avoidY = 0;
          for (const h of g.hunters) {
            const dx = s.x - h.x, dy = s.y - h.y, d = Math.hypot(dx, dy) || 1;
            const R = 135 * DPR * hazardAlertMult;
            if (d < R) { const push = (R - d) + panic(d, R) * R * 1.6; avoidX += (dx / d) * push; avoidY += (dy / d) * push; }
          }
          for (const m of g.mines) {
            const dx = s.x - m.x, dy = s.y - m.y, d = Math.hypot(dx, dy) || 1;
            const R = 100 * DPR * hazardAlertMult;
            if (d < R) { const push = (R - d) + panic(d, R) * R * 1.6; avoidX += (dx / d) * push; avoidY += (dy / d) * push; }
          }
          for (const dsh of g.dashers) {
            const ddx = s.x - dsh.x, ddy = s.y - dsh.y, dd = Math.hypot(ddx, ddy) || 1;
            const R = 165 * DPR * hazardAlertMult;
            if (dd < R) { const push = (R - dd) + panic(dd, R) * R * 1.6; avoidX += (ddx / dd) * push; avoidY += (ddy / dd) * push; }
            // Already aiming at someone and about to charge — step OFF
            // that telegraphed line specifically (perpendicular to
            // dirX/dirY), not just away from the dasher's current
            // position or straight back along the line it's about to
            // charge down. Retreating straight back (the old
            // -dsh.dirX/-dsh.dirY push) barely helps against a dash at
            // 430*DPR — over 4x a bot's own top speed — since the dash
            // covers the retreat distance again almost instantly;
            // stepping sideways is the only geometrically real dodge
            // against something that much faster in a straight line.
            // Side is picked from the ship's own current position
            // relative to the line (not random) so it doesn't flip
            // back and forth frame to frame while just off-line.
            const aimR = 260 * DPR * hazardAlertMult;
            if (dsh.state === "aim" && dd < aimR) {
              const perpX = -dsh.dirY, perpY = dsh.dirX;
              const side = ddx * perpX + ddy * perpY >= 0 ? 1 : -1;
              avoidX += perpX * side * (aimR - dd) * 0.9;
              avoidY += perpY * side * (aimR - dd) * 0.9;
            }
          }
          const dx = (tx - s.x) + avoidX * 2.8, dy = (ty - s.y) + avoidY * 2.8;
          const d = Math.hypot(dx, dy) || 1;
          ax = dx / d; ay = dy / d;
          const mag = Math.hypot(ax, ay) || 1;
          // Turns faster than before (dt*7.5 → dt*9.5) — reacting
          // earlier only helps if the ship can actually commit to the
          // new heading quickly enough to matter.
          s.vx += ((ax / mag) * s.speed - s.vx) * Math.min(1, dt * 9.5);
          s.vy += ((ay / mag) * s.speed - s.vy) * Math.min(1, dt * 9.5);
          if (Math.hypot(s.vx, s.vy) > 10 * DPR) s.angle = Math.atan2(s.vy, s.vx);
        }
        s.x = clamp(s.x + s.vx * dt, s.r, g.W - s.r);
        s.y = clamp(s.y + s.vy * dt, TOP_MARGIN + s.r, g.H - BOTTOM_MARGIN - s.r);
        if (g.bankZone.open && dist(s, g.bankZone) < g.bankZone.r + s.r) bankShip(s);
      }

      // Rental Bot power-up heuristics — the manual power-up buttons
      // only ever fire on a human's own click, so a fully bot-driven
      // "you" would otherwise never use Magnet/Shield/Boost/Fire at
      // all even if the player has them equipped. Mirrors the exact
      // same duration/cooldown math useMagnet/useShield/useOverclock/
      // useFire themselves use (including any purchased duration-
      // bonus/cooldown-reduction from loadout) — inlined here directly
      // rather than calling those closures, since update() already has
      // everything it needs via `g` and `you`. Simple, cheap-to-reason-
      // about triggers, not a lookahead planner: Shield when a hazard
      // is close and off cooldown; Magnet whenever off cooldown (its
      // own 90*DPR pull radius already makes it a no-downside pickup);
      // Boost when the coast is clear; Fire once several hazards
      // cluster nearby.
      if (rentalBotActive && you.active) {
        let nearestHazardD = Infinity;
        let hazardsWithin150 = 0;
        for (const h of g.hunters) { const d = dist(you, h); nearestHazardD = Math.min(nearestHazardD, d); if (d < 150 * DPR) hazardsWithin150++; }
        for (const m of g.mines) { const d = dist(you, m); nearestHazardD = Math.min(nearestHazardD, d); if (d < 150 * DPR) hazardsWithin150++; }
        for (const dsh of g.dashers) { const d = dist(you, dsh); nearestHazardD = Math.min(nearestHazardD, d); if (d < 150 * DPR) hazardsWithin150++; }

        if (you.shield <= 0 && g.shieldCd <= 0 && nearestHazardD < 90 * DPR) {
          you.shield = 4 + (loadout?.shieldDurationBonusSec ?? 0);
          g.shieldCd = Math.max(2, 16 + (loadout?.shieldCooldownDeltaSec ?? 0));
          playShieldSound();
        }
        if (you.magnet <= 0 && g.magnetCd <= 0) {
          you.magnet = 5 + (loadout?.magnetDurationBonusSec ?? 0);
          g.magnetCd = Math.max(2, 14 + (loadout?.magnetCooldownDeltaSec ?? 0));
          playMagnetSound();
        }
        if (you.boost <= 0 && g.boostCd <= 0 && nearestHazardD > 150 * DPR) {
          you.boost = 2.5;
          g.boostCd = 10;
          playBoostSound();
        }
        if (g.fireUsesRemaining > 0 && you.fire <= 0 && hazardsWithin150 >= 2) {
          you.fire = 10 + (loadout?.fireDurationBonusSec ?? 0);
          g.fireUsesRemaining -= 1;
          playFireSound();
        }
      }

      // Filler-bot power-up instincts — same triggers as the Rental
      // Bot heuristic just above (Shield when a hazard's about to
      // connect, Magnet on cooldown, Boost when clear, Fire when
      // hazards cluster), applied to every genuine AI-filled seat.
      // Confirmed live as a real gap behind "bots get hit constantly":
      // a filler bot had zero defensive tools beyond steering — no
      // Shield, ever, regardless of how close a hazard got — while a
      // hunter's own top speed (see its construction above) can exceed
      // a bot's, and only gets faster as the match clock runs down
      // (speedFactor's ramp), making eventual contact a matter of time
      // no amount of pathing alone can prevent once a fast roll catches
      // one.
      //
      // Shield/Magnet/Fire are capped by shieldUsesLeft/magnetUsesLeft/
      // fireUsesLeft (see their own doc-comment) on top of the cooldown
      // — confirmed live as a real ask ("make it look more real — on/
      // off 2-3 times the whole game"): a cooldown alone let a bot
      // sitting in a hazard-dense area re-trigger the instant it came
      // off cooldown, near-back-to-back for the whole match, reading as
      // permanently lit up rather than a distinct, occasional move.
      // Boost has no such budget — it has no glow-ring tell (see draw()'s
      // own condition) and was never part of that complaint. Fire's own
      // cooldown is also stretched out (25s vs the "you" heuristic's
      // implicit ~10s reuse gap) for the same reason, on top of its cap.
      // Per-ship cooldowns/budgets (see ShipEntity's own doc-comment) —
      // deliberately silent (no play*Sound() calls): those are meant to
      // read as feedback for the human's OWN actions, not fire for
      // every bot on the field independently.
      for (const s of g.ships) {
        if (!s.isBot || !s.active) continue;
        s.shieldCd = Math.max(0, s.shieldCd - dt);
        s.magnetCd = Math.max(0, s.magnetCd - dt);
        s.boostCd = Math.max(0, s.boostCd - dt);
        s.fireCd = Math.max(0, s.fireCd - dt);

        let nearestHazardD = Infinity;
        let hazardsWithin150 = 0;
        for (const h of g.hunters) { const d = dist(s, h); nearestHazardD = Math.min(nearestHazardD, d); if (d < 150 * DPR) hazardsWithin150++; }
        for (const m of g.mines) { const d = dist(s, m); nearestHazardD = Math.min(nearestHazardD, d); if (d < 150 * DPR) hazardsWithin150++; }
        for (const dsh of g.dashers) { const d = dist(s, dsh); nearestHazardD = Math.min(nearestHazardD, d); if (d < 150 * DPR) hazardsWithin150++; }

        if (s.shield <= 0 && s.shieldCd <= 0 && s.shieldUsesLeft > 0 && nearestHazardD < 90 * DPR) {
          s.shield = 4;
          s.shieldCd = 20;
          s.shieldUsesLeft -= 1;
        }
        if (s.magnet <= 0 && s.magnetCd <= 0 && s.magnetUsesLeft > 0) {
          s.magnet = 5;
          s.magnetCd = 25;
          s.magnetUsesLeft -= 1;
        }
        if (s.boost <= 0 && s.boostCd <= 0 && nearestHazardD > 150 * DPR) {
          s.boost = 2.5;
          s.boostCd = 10;
        }
        if (s.fire <= 0 && s.fireCd <= 0 && s.fireUsesLeft > 0 && hazardsWithin150 >= 2) {
          s.fire = 6;
          s.fireCd = 25;
          s.fireUsesLeft -= 1;
        }
      }

      // Rocket engine hum — pitch/volume ramp with the human ship's own
      // current speed relative to its max possible speed (Boost raises
      // that ceiling, so the same raw vx/vy reads as "slower" while
      // boosted rather than pinning the engine note at max the instant
      // Boost is used). Silent (idle hum only) once the ship is out of
      // lives — nothing to accelerate anymore.
      if (you.active) {
        const maxSpeed = you.speed * (you.boost > 0 ? 1.6 : 1);
        const youSpeedFrac = maxSpeed > 0 ? Math.hypot(you.vx, you.vy) / maxSpeed : 0;
        updateEngineSound(youSpeedFrac);
      } else {
        updateEngineSound(0);
      }

      // Magnet pull (an addition beyond the prototype, kept from the
      // earlier build) — pulls nearby coins toward the human ship. Gated
      // on you.active so a magnet still counting down at the moment of
      // death doesn't keep dragging coins toward a dead ship's last
      // position for the rest of its duration.
      if (you.active && you.magnet > 0) {
        for (const it of g.items) {
          const d = dist(you, it);
          if (d < 90 * DPR) {
            const dx = you.x - it.x, dy = you.y - it.y, len = Math.hypot(dx, dy) || 1;
            it.x += (dx / len) * 170 * DPR * dt;
            it.y += (dy / len) * 170 * DPR * dt;
          }
        }
      }

      // Fire (limited uses per match for "you", see useFire()) — for its
      // whole 10s window the rocket auto-fires a 3-bullet burst every
      // ~0.16s from its nose, aimed the direction it's currently facing.
      // A bullet that touches a hunter/dasher/mine destroys it outright,
      // at zero cost to whichever ship fired it (no life lost, no carry
      // penalty, hitShip() is never called for these). "Destroyed" means
      // the same thing it already does everywhere else in this file
      // when a hazard lands a hit — relocated to a fresh random point
      // via randPointInPlay(), same as a normal hit's own clean-up — so
      // the field's hazard count never actually drops; they're gone
      // from right here for a moment, then back in play somewhere else,
      // same as they always were.
      //
      // Every active ship, not just "you" — confirmed live as a real
      // gap ("can't see other users/rental bots firing"): this used to
      // check `you.fire` and a single g.fireShotCd, so a bot's or a
      // real opponent's own s.fire (already correctly synced/set by
      // then — see the externallyDriven and rental-bot-heuristic code)
      // lit up the glow ring but never actually fired anything, on
      // ANY viewer's screen including the ship's own owner. Cooldown is
      // now per-ship (ShipEntity.fireShotCd) since a single shared
      // timer would make every firing ship burst in lockstep. Gated on
      // s.active — without it, a fire burst still counting down at the
      // moment a ship dies kept auto-firing bullets from its last
      // position for the rest of its 10s window (confirmed live: the
      // rocket dies but fire keeps bursting).
      for (const s of g.ships) {
        s.fireShotCd = Math.max(0, s.fireShotCd - dt);
        if (!s.active || s.fire <= 0 || s.fireShotCd > 0) continue;
        s.fireShotCd = 0.16;
        for (const da of [-0.18, 0, 0.18]) {
          const a = s.angle + da;
          g.bullets.push({
            x: s.x + Math.cos(a) * s.r,
            y: s.y + Math.sin(a) * s.r,
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
            playZapSound();
          }
        }
        for (const dsh of g.dashers) {
          if (consumed) break;
          if (dist(b, dsh) < dsh.r + 5 * DPR) {
            addParticles(dsh.x, dsh.y, "#ff7a3c", 20);
            const p = randPointInPlay(); dsh.x = p.x; dsh.y = p.y;
            dsh.state = "aim"; dsh.timer = 1.1 + g.rand() * 1.3;
            aimDasher(dsh, g.ships);
            consumed = true;
            playZapSound();
          }
        }
        for (const m of g.mines) {
          if (consumed) break;
          if (dist(b, m) < m.r + 5 * DPR) {
            addParticles(m.x, m.y, "#ff7a3c", 20);
            const p = randPointInPlay(); m.x = p.x; m.y = p.y;
            m.vx = (g.rand() - 0.5) * 56 * DPR; m.vy = (g.rand() - 0.5) * 56 * DPR;
            consumed = true;
            playZapSound();
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
          // A spectated real opponent's carry already comes verbatim
          // from their own polled report — a local pickup here would
          // double-count on top of that.
          if (!s.active || s.externallyDriven) continue;
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
        // Checks every ship against this hazard's CURRENT position
        // before relocating it — confirmed live as a real bug: the old
        // `break` on the first hit relocated the hazard immediately, so
        // two ships genuinely overlapping the same point (a common,
        // reported case — everyone spawns/banks at the same spots) only
        // ever had the FIRST one in ship order actually take the hit;
        // the second, equally exposed ship took nothing, purely because
        // of array position, not anything about either ship. Relocating
        // once after checking everyone (not per-ship) keeps a single
        // hazard's own "it moves away once it lands a hit" behavior
        // exactly as before for the ordinary one-ship case.
        let anyContact = false;
        for (const s of g.ships) {
          // A spectated real opponent's lives/carry already come
          // verbatim from their own polled report — this local hazard
          // field isn't synced with theirs, so it must never independently
          // apply its own hit to their ship (see Phase 6 scope notes).
          if (!s.active || s.externallyDriven) continue;
          if (dist(s, h) < s.r + h.r + 2 * DPR) {
            hitShip(s, hunterCarryPenalty, (s.x - h.x) * 1.1, (s.y - h.y) * 1.1, "#ff6767");
            anyContact = true;
          }
        }
        if (anyContact) { const p = randPointInPlay(); h.x = p.x; h.y = p.y; }
      }

      for (const dsh of g.dashers) {
        if (dsh.state === "aim") {
          // dirX/dirY are locked once, the moment this aim phase
          // started (see aimDasher's own doc-comment) — deliberately
          // NOT recomputed here every frame anymore.
          dsh.timer -= dt;
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
          // See the hunters loop's identical fix above — checks every
          // ship before relocating/resetting to "aim", instead of
          // `break`-ing after the first one and leaving a second ship
          // standing in the exact same spot untouched.
          let anyContact = false;
          for (const s of g.ships) {
            if (!s.active || s.externallyDriven) continue; // see the hunters loop's identical guard above
            if (dist(s, dsh) < s.r + dsh.r + 2 * DPR) {
              hitShip(s, dasherCarryPenalty, dsh.vx * 0.12, dsh.vy * 0.12, "#d8ecff");
              anyContact = true;
            }
          }
          if (anyContact) {
            const p = randPointInPlay(); dsh.x = p.x; dsh.y = p.y;
            dsh.state = "aim"; dsh.timer = 1.1 + g.rand() * 1.3;
            aimDasher(dsh, g.ships);
          }
          if (dsh.timer <= 0) {
            dsh.state = "aim"; dsh.timer = 1.1 + g.rand() * 1.3;
            aimDasher(dsh, g.ships);
          }
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
        // See the hunters loop's identical fix above.
        let anyContact = false;
        for (const s of g.ships) {
          if (!s.active || s.externallyDriven) continue; // see the hunters loop's identical guard above
          if (dist(s, m) < s.r + m.r + 1 * DPR) {
            hitShip(s, mineCarryPenalty, (s.x - m.x) * 1.6, (s.y - m.y) * 1.6, "#f4c15d");
            anyContact = true;
          }
        }
        if (anyContact) {
          addParticles(m.x, m.y, "#f4c15d", 20);
          const p = randPointInPlay(); m.x = p.x; m.y = p.y;
          m.vx = (g.rand() - 0.5) * 56 * DPR; m.vy = (g.rand() - 0.5) * 56 * DPR;
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
      // Otherwise the engine hum freezes at whatever pitch/volume it
      // last had (update() bails out immediately above once !g.running,
      // so nothing ever calls updateEngineSound(0) again) instead of
      // fading out — audible during the "Time's Up" pause this function
      // triggers below.
      stopEngineSound();
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
      // A human who ran out of lives already has the "You Died,
      // waiting for the match to end" pill up (see hud.lives <= 0's
      // own banner below) for however long the rest of the match takes
      // — showing that exact same message a second time, as a
      // full-screen overlay, right before handing off to the lobby
      // page's own waiting/spectate UI added nothing but an extra beat
      // that read as the match doing something (restarting, ending,
      // restarting again). Skip the overlay/pause entirely for that
      // case and report the result immediately; a player who actually
      // survived to a real "Time's Up" still gets the pause + overlay,
      // since that one IS new information worth a beat on screen.
      const died = you.lives <= 0;
      if (died) {
        onCompleteRef.current({ score: finalScore, durationPlayedSec, died });
        return;
      }
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
        onCompleteRef.current({ score: finalScore, durationPlayedSec, died });
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
    // shapeKey selects a purely cosmetic silhouette (Coin Rush Shop,
    // ROCKET_SHAPE items) — one of 6 genuinely distinct hand-drawn
    // shapes (rocket/saucer/orb/wedge/comet/fighter, see
    // src/lib/rocketShape.ts), each with its own path, but `r` (and
    // therefore `scale`) is untouched by shape choice: collision
    // radius stays byte-identical across every shape, so a cosmetic
    // purchase can never be a disguised pay-to-win hitbox change. Bots
    // and any "you" ship with no shape equipped fall through to the
    // default ROCKET silhouette.
    function drawRocket(x: number, y: number, angle: number, color: string, r: number, shapeKey?: string | null) {
      // Path math lives in src/lib/rocketShape.ts now, shared verbatim
      // with the Shop's live preview (RocketPreview.tsx) — see that
      // module's own doc-comment for why: the shop must never visually
      // drift from what actually renders in a real match.
      drawRocketShip(ctx!, { x, y, angle, color, r, shapeKey, dpr: DPR });
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

      // Camera shake — a brief, decaying random jolt on the whole scene
      // the instant a real hit lands (g.shakeMag, set in hitShip()),
      // separate from the red damage-flash overlay below (this is the
      // "impact" read, that one is the "you're hurt" read). Applied
      // before anything else is drawn this frame so every layer (bg,
      // stars, hazards, ships, HUD-adjacent canvas text) shakes together
      // rather than the ship visibly detaching from its own background.
      ctx!.save();
      if (g.shakeMag > 0.001) {
        ctx!.translate((Math.random() - 0.5) * 9 * DPR * g.shakeMag, (Math.random() - 0.5) * 9 * DPR * g.shakeMag);
      }

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
        // Red damage halo directly around your own rocket — the
        // screen-wide vignette in draw()'s own closing block is the big
        // "you got hit" read, this is the localized one on the ship
        // itself specifically, per direct request ("show effect on
        // rocket"). Drawn behind drawRocket() so the ship sprite still
        // reads clearly on top of it.
        if (s.isYou && g.youHitFlash > 0.001) {
          ctx!.save();
          ctx!.globalAlpha = g.youHitFlash * 0.55;
          const halo = ctx!.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 2.4);
          halo.addColorStop(0, "rgba(255,60,60,.9)");
          halo.addColorStop(1, "rgba(255,60,60,0)");
          ctx!.fillStyle = halo;
          ctx!.beginPath();
          ctx!.arc(s.x, s.y, s.r * 2.4, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.restore();
        }
        drawRocket(s.x, s.y, s.angle, s.color, s.r, s.shapeKey);
        ctx!.shadowBlur = 0;
        ctx!.fillStyle = s.color;
        ctx!.font = `700 ${8 * DPR}px Inter, Arial`;
        ctx!.textAlign = "center";
        // Same key the leaderboard HUD already uses for this exact
        // label (t("gameArena.youLeaderboardLabel")) — this canvas
        // nameplate above your own ship was left hardcoded to the raw
        // English "YOU" even after that one got translated, so a
        // non-English player saw the leaderboard sidebar correctly
        // translated but their own in-flight ship still labeled "YOU".
        ctx!.fillText(s.isYou ? tRef.current("gameArena.youLeaderboardLabel") : s.name, s.x, s.y - 18 * DPR);
        // No longer isYou-only — confirmed live as a real gap ("can't
        // see the other user's bot firing and using shield"): a real
        // opponent's own Shield/Magnet/Fire state now arrives here too
        // (externally-driven ships get it from polled live-state, see
        // that block's own doc-comment above), so every ship draws the
        // same glow it already would for "you". Filler bots are
        // unaffected — their own shield/magnet/fire never leave 0,
        // since only a real human (rental-bot-driven or manual) ever
        // sets them in the first place.
        if (s.shield > 0 || s.magnet > 0 || s.fire > 0) {
          ctx!.save();
          ctx!.strokeStyle = s.shield > 0 ? "#33f2a4" : s.magnet > 0 ? "#ff4fd8" : "#ff8a3d";
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
      ctx!.restore(); // matches the shake save() at the top of this function

      // Red damage vignette — a full-canvas flash the instant a real
      // hit lands (g.youHitFlash, set in hitShip(), decaying every
      // frame in update()), stacked on top of the existing per-ship
      // invuln flicker rather than replacing it: the flicker says "you
      // can't be hit again yet," this says "that one just connected."
      // Drawn outside the shake save/restore above so the flash itself
      // never visibly jitters with the camera.
      if (g.youHitFlash > 0.001) {
        ctx!.fillStyle = `rgba(255,30,30,${g.youHitFlash * 0.22})`;
        ctx!.fillRect(0, 0, g.W, g.H);
      }
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
      // Belt-and-suspenders alongside finish()'s own call — covers
      // leaving/closing the page mid-match, when finish() never runs at
      // all (g.running is still true, so its own early-return there
      // would otherwise skip teardown entirely).
      stopEngineSound();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  // Individual loadout fields, not the whole `loadout` object — a
  // parent that re-creates the loadout object on every render (even
  // with identical content) must never re-trigger this whole effect,
  // which tears down and rebuilds the entire match state; only an
  // actual VALUE change should ever do that, and every one of these is
  // resolved once at match creation and never changes mid-match in
  // practice. magnetDurationBonusSec/magnetCooldownDeltaSec/
  // shieldDurationBonusSec/shieldCooldownDeltaSec/fireDurationBonusSec
  // are read both here (the Rental Bot's own power-up heuristics
  // inside update()) and fresh inside the manual useMagnet/useShield/
  // useFire closures themselves (which aren't affected by this
  // dependency array at all, being outside this effect) — listed here
  // too now that update() also reads them directly.
  }, [
    mapSeed,
    durationSec,
    startElapsedSec,
    spawnItem,
    youName,
    diff,
    theme,
    opponents,
    matchId,
    spectate,
    loadout?.shapeKey,
    loadout?.colorHex,
    loadout?.speedMultBonus,
    loadout?.livesBonus,
    loadout?.fireExtraUses,
    loadout?.rentalBot,
    loadout?.magnetDurationBonusSec,
    loadout?.magnetCooldownDeltaSec,
    loadout?.shieldDurationBonusSec,
    loadout?.shieldCooldownDeltaSec,
    loadout?.fireDurationBonusSec,
  ]);

  // Pre-match "3, 2, 1, Go" — purely a local visual pause layered in
  // front of the setup effect above; it never touches match timing.
  // The server-authoritative clock (match.startedAt/durationSec) is
  // already running from the moment the match was created, well
  // before this component even mounts — startElapsedSec (see prop
  // doc-comment) already accounts for real elapsed time correctly, so
  // freezing g.running here for ~3s just means the countdown itself
  // eats a few seconds of the player's own effective run, exactly like
  // a countdown in any other real-time competitive game. This effect
  // only ever runs once per actual match: every new match is a
  // genuinely fresh mount of this component (mapSeed never changes on
  // an already-mounted instance — see the callers), so the initial
  // `useState(3)` above is the only "reset" this ever needs; the
  // timers below just advance it from there, all inside setTimeout
  // callbacks rather than the effect body itself.
  //
  // skipCountdown (see its own doc-comment above) is the one exception,
  // and the one dependency this effect actually needs: there's no
  // "start" to count down to when you're only watching a race that's
  // already underway, or resuming/refreshing one that's already fully
  // elapsed — skip straight to running (countdown's own initial state
  // above is already null in that case, matching this immediately).
  useEffect(() => {
    if (skipCountdown) {
      const gNow = gRef.current;
      if (gNow) gNow.running = true;
      return;
    }
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
  }, [skipCountdown]);

  // Base 5s duration / 14s cooldown — a POWERUP_MAGNET shop purchase
  // (loadout.magnetDurationBonusSec/magnetCooldownDeltaSec) extends the
  // first and shortens the second. Cooldown is floored at 2s so a
  // stacked reduction can never get close to "no real cooldown at all."
  const useMagnet = () => {
    const g = gRef.current;
    if (!g || !g.running || !g.ships[0].active || g.magnetCd > 0) return;
    g.ships[0].magnet = 5 + (loadout?.magnetDurationBonusSec ?? 0);
    g.magnetCd = Math.max(2, 14 + (loadout?.magnetCooldownDeltaSec ?? 0));
    playMagnetSound();
  };
  // Base 4s duration / 16s cooldown — same bonus pattern as Magnet
  // above, via POWERUP_SHIELD's own effect fields.
  const useShield = () => {
    const g = gRef.current;
    if (!g || !g.running || !g.ships[0].active || g.shieldCd > 0) return;
    g.ships[0].shield = 4 + (loadout?.shieldDurationBonusSec ?? 0);
    g.shieldCd = Math.max(2, 16 + (loadout?.shieldCooldownDeltaSec ?? 0));
    playShieldSound();
  };
  const useOverclock = () => {
    const g = gRef.current;
    if (!g || !g.running || !g.ships[0].active || g.boostCd > 0) return;
    g.ships[0].boost = 2.5;
    g.boostCd = 10;
    playBoostSound();
  };
  // Base 1 use per match, base 10s window each time — a POWERUP_FIRE
  // shop purchase (loadout.fireExtraUses/fireDurationBonusSec) grants
  // more uses and/or a longer window per use. fireUsesRemaining never
  // recharges mid-match (unlike the Cd timers above), it's just a
  // bigger fixed budget.
  const useFire = () => {
    const g = gRef.current;
    if (!g || !g.running || !g.ships[0].active || g.fireUsesRemaining <= 0) return;
    g.ships[0].fire = 10 + (loadout?.fireDurationBonusSec ?? 0);
    g.fireUsesRemaining -= 1;
    playFireSound();
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
            {t("gameArena.title")}
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
              aria-label={t("gameArena.toggleJoystickAria")}
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
              {hud.vaultOpen ? t("gameArena.vaultOpenLabel") : t("gameArena.vaultLockedLabel")}
            </span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5 }}>
          <StatCard accent="#89c7ff" label={t("gameArena.missionTimeLabel")} value={String(hud.time)} />
          <StatCard accent="#f4c15d" label={t("gameArena.prizePoolLabel")} value={`$${prizePoolUsdt.toFixed(2)}`} sub={t("gameArena.usdtPoolSub")} />
          <StatCard
            accent={theme.accent}
            label={t("gameArena.yourRankLabel")}
            value={`#${hud.rank}`}
            sub={t("gameArena.ptsCollectedSub", { count: hud.youBanked + hud.youCarry })}
          />
          <StatCard
            accent="#ff6767"
            label={t("gameArena.yourRocketLabel")}
            value={youName}
            // total must track the same value added to "you"'s own
            // starting lives above — a purchased STAT_HEALTH bonus,
            // nothing from Rental Bot itself (see BOT_LIVES_BONUS's own
            // doc-comment).
            sub={<LifeBar lives={hud.lives} total={diff.startLives + (loadout?.livesBonus ?? 0)} />}
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
          <span>{t("gameArena.liveLeaderboardLabel")}</span>
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
                  #{idx + 1} {s.isYou ? t("gameArena.youLeaderboardLabel") : s.name}
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
                <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", whiteSpace: "nowrap" }}>{t("gameArena.ptsCarryValue", { count: s.carry })}</span>
                <span style={{ marginLeft: 4, fontSize: 7, fontWeight: 600, color: "#a9bccb", textTransform: "uppercase", letterSpacing: ".01em" }}>{t("gameArena.carryingLabel")}</span>
                <span style={{ display: "block", fontSize: 7.5, color: "#a9bccb", letterSpacing: ".01em", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {t("gameArena.bankedLine", { count: s.banked })}
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
            {countdown === "GO" ? t("gameArena.goLabel") : countdown}
          </p>
        </div>
      )}

      {ended && (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          style={{ background: "rgba(2,5,9,.55)", backdropFilter: "blur(2px)" }}
        >
          <div className="text-center">
            {/* Only ever reached by a run that's genuinely still alive
                when the real mission clock hits 0 — finish() now
                reports a dead run's result immediately, with no pause
                or overlay (see its own doc-comment), so "TIME'S UP" is
                never shown to a player who already saw "You Died". */}
            <p className="text-4xl font-black uppercase tracking-wide" style={{ color: "#89c7ff" }}>{t("gameArena.timesUp")}</p>
            <p className="mt-2 animate-pulse text-xs uppercase tracking-widest text-muted">
              {spectate ? t("gameArena.finalizingMatch") : t("gameArena.finalizingRun")}
            </p>
          </div>
        </div>
      )}

      {/* Non-blocking status while the human is out but the match (and
          the other, still-live ships) keeps running toward the real
          clock-based end — a light banner instead of the full-screen
          "ended" treatment above, since the race itself hasn't finished. */}
      {!ended && !spectate && hud.lives <= 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-[236px] z-20 flex justify-center">
          <div className="rounded-full border border-risk/40 bg-black/70 px-4 py-1.5 text-xs font-black uppercase tracking-wide text-risk backdrop-blur">
            {t("gameArena.youDied")}
          </div>
        </div>
      )}

      {/* Spectate mode — "your" ship never plays (see the ships[0]
          construction above), so it can't ever trip the "You Died"
          banner; this replaces it with an honest description of what's
          actually on screen. */}
      {!ended && spectate && (
        <div className="pointer-events-none absolute inset-x-0 top-[236px] z-20 flex justify-center">
          <div className="rounded-full border border-mint/40 bg-black/70 px-4 py-1.5 text-xs font-black uppercase tracking-wide text-mint backdrop-blur">
            {t("gameArena.spectatingBanner")}
          </div>
        </div>
      )}

      {!ended && !spectate && hud.lives > 0 && (
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
              <span aria-hidden>🧲</span> {t("gameArena.magButton")}
            </button>
            <button
              onClick={useOverclock}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-wide shadow-lg transition active:scale-95"
              style={{
                background: "linear-gradient(180deg, rgba(245,158,11,.22), rgba(245,158,11,.08))",
                border: "1px solid rgba(245,158,11,.5)", color: "#ffe8c9", backdropFilter: "blur(12px)",
              }}
            >
              <span aria-hidden>⚡</span> {t("gameArena.boostButton")}
            </button>
            <button
              onClick={useShield}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-wide shadow-lg transition active:scale-95"
              style={{
                background: "linear-gradient(180deg, rgba(119,242,199,.22), rgba(119,242,199,.08))",
                border: "1px solid rgba(119,242,199,.5)", color: "#d3fff0", backdropFilter: "blur(12px)",
              }}
            >
              <span aria-hidden>🛡</span> {t("gameArena.shieldButton")}
            </button>
            <button
              onClick={useFire}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-wide shadow-lg transition active:scale-95"
              style={{
                background: "linear-gradient(180deg, rgba(255,122,60,.22), rgba(255,122,60,.08))",
                border: "1px solid rgba(255,122,60,.5)", color: "#ffdcc9", backdropFilter: "blur(12px)",
              }}
            >
              <span aria-hidden>🔥</span> {t("gameArena.fireButton")}
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
