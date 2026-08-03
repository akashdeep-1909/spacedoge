"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { playBoxOpenSound, playCoinSound } from "@/lib/rewardSound";

export interface MatchParticipantResult {
  rank: number;
  isBot: boolean;
  isYou: boolean;
  displayAddress: string;
  gameplayPts: number;
  bonusPts: number;
  rewardPts: number;
  rewardUsdt: number;
}

export interface MatchPoolSummary {
  totalUsdt: number;
  totalPts: number;
  platformFeeUsdt: number;
  platformFeePts: number;
  rewardPoolUsdt: number;
  rewardPoolPts: number;
}

const RANK_MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
const RANK_ACCENT: Record<number, string> = { 1: "#f4c15d", 2: "#c9d4e0", 3: "#e0a45c", 4: "#7a8a9a" };

// Rank 1 gets the full sequence at full size; ranks 2/3 repeat the same
// sequence smaller and faster ("a smaller reward animation" per spec).
// Rank 4 never gets a box at all.
const STAGE_MS: Record<1 | 2 | 3, { appear: number; shake: number; glow: number; open: number; count: number; hold: number }> = {
  1: { appear: 450, shake: 550, glow: 450, open: 550, count: 1200, hold: 550 },
  2: { appear: 320, shake: 400, glow: 320, open: 400, count: 900, hold: 400 },
  3: { appear: 300, shake: 350, glow: 280, open: 350, count: 800, hold: 350 },
};

function useCountUp(active: boolean, from: number, to: number, durationMs: number, onTick: () => void) {
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let lastBucket = -1;
    const start = performance.now();
    function step(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (to - from) * eased));
      const bucket = Math.floor(t * 6);
      if (bucket !== lastBucket) {
        lastBucket = bucket;
        onTick();
      }
      if (t < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, from, to, durationMs]);
  return value;
}

function RewardBoxStage({
  rank,
  participant,
  onDone,
}: {
  rank: 1 | 2 | 3;
  participant: MatchParticipantResult;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<"appear" | "shake" | "glow" | "open" | "count" | "hold">("appear");
  const timers = STAGE_MS[rank];
  const size = rank === 1 ? 132 : rank === 2 ? 100 : 82;
  const accent = RANK_ACCENT[rank];
  const particleCount = rank === 1 ? 14 : rank === 2 ? 10 : 7;

  useEffect(() => {
    const marks = [
      timers.appear,
      timers.appear + timers.shake,
      timers.appear + timers.shake + timers.glow,
      timers.appear + timers.shake + timers.glow + timers.open,
      timers.appear + timers.shake + timers.glow + timers.open + timers.count,
      timers.appear + timers.shake + timers.glow + timers.open + timers.count + timers.hold,
    ];
    const t1 = setTimeout(() => setPhase("shake"), marks[0]);
    const t2 = setTimeout(() => setPhase("glow"), marks[1]);
    const t3 = setTimeout(() => {
      setPhase("open");
      playBoxOpenSound();
    }, marks[2]);
    const t4 = setTimeout(() => setPhase("count"), marks[3]);
    const t5 = setTimeout(() => setPhase("hold"), marks[4]);
    const t6 = setTimeout(onDone, marks[5]);
    return () => [t1, t2, t3, t4, t5, t6].forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rank]);

  const counting = phase === "count" || phase === "hold";
  const displayValue = useCountUp(counting, participant.gameplayPts, participant.rewardPts, timers.count, playCoinSound);
  const opened = phase === "open" || phase === "count" || phase === "hold";

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <p className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: accent }}>
        {RANK_MEDAL[rank]} Rank {rank} Reward
      </p>
      <div className="relative flex items-center justify-center" style={{ width: size * 2, height: size * 1.7 }}>
        <div
          style={{
            position: "absolute",
            width: size * 1.6,
            height: size * 1.6,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${accent}55, transparent 70%)`,
            opacity: phase === "appear" ? 0 : 1,
            transition: "opacity .3s",
          }}
          className={phase === "glow" || opened ? "mrr-glow-pulse" : ""}
        />
        {opened && (
          <div
            className="mrr-burst"
            style={{
              position: "absolute",
              width: size * 2,
              height: size * 2,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${accent}99, transparent 60%)`,
            }}
          />
        )}
        {opened &&
          Array.from({ length: particleCount }).map((_, i) => {
            const angle = (Math.PI * 2 * i) / particleCount;
            const dist = size * (0.7 + (i % 3) * 0.15);
            const dx = Math.cos(angle) * dist;
            const dy = Math.sin(angle) * dist - 40;
            return (
              <span
                key={i}
                className="mrr-particle"
                style={{
                  ["--dx" as string]: `${dx}px`,
                  ["--dy" as string]: `${dy}px`,
                  background: accent,
                  animationDelay: `${i * 16}ms`,
                }}
              />
            );
          })}
        <div
          className={phase === "shake" ? "mrr-box mrr-shake" : phase === "appear" ? "mrr-box mrr-appear" : "mrr-box"}
          style={{ width: size, height: size * 0.8 }}
        >
          <div
            className="mrr-box-body"
            style={{ borderColor: accent, boxShadow: `0 0 ${size * 0.3}px ${accent}66` }}
          >
            {!opened && <span style={{ fontSize: size * 0.32 }}>🎁</span>}
            <div
              className={opened ? "mrr-box-lid mrr-box-lid-open" : "mrr-box-lid"}
              style={{ borderColor: accent, background: `linear-gradient(180deg, ${accent}, ${accent}aa)` }}
            />
          </div>
        </div>
      </div>

      <div className="text-center">
        <p className="text-[11px] uppercase tracking-widest text-muted">{participant.isYou ? "You" : participant.displayAddress}</p>
        {/* Hidden until the box actually opens, then flies up out of
            where the box sits and settles into place — reads as the
            number itself being what came out of the box, not a static
            label that happened to appear underneath it. */}
        <div className={opened ? "mrr-number-flow" : "opacity-0"}>
          <p className="mt-0.5 text-4xl font-black tabular-nums" style={{ color: accent }}>
            {displayValue.toLocaleString()} <span className="text-lg">PTS</span>
          </p>
          {counting && participant.bonusPts > 0 && (
            <p className="mt-0.5 text-sm font-bold text-mint">+{participant.bonusPts.toLocaleString()} bonus</p>
          )}
        </div>
      </div>
    </div>
  );
}

function LeaderboardRow({
  p,
  highlighted,
  revealed,
}: {
  p: MatchParticipantResult;
  highlighted: boolean;
  revealed: boolean;
}) {
  const accent = RANK_ACCENT[p.rank] ?? "#7a8a9a";
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-left transition ${
        p.isYou ? "bg-[rgba(137,199,255,.07)]" : "bg-white/[.02]"
      }`}
      style={{
        borderColor: highlighted ? accent : undefined,
        boxShadow: highlighted ? `0 0 14px ${accent}55` : undefined,
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-5 shrink-0 text-center text-base leading-none">{RANK_MEDAL[p.rank] ?? p.rank}</span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-xs font-bold">
            {p.isYou ? "YOU" : p.displayAddress}
            {p.rank === 4 && (
              <span className="shrink-0 rounded-full border border-risk/40 bg-risk/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-risk">
                Loss
              </span>
            )}
          </p>
          <p className={`text-[10px] ${p.rank === 4 ? "font-bold text-foreground" : "text-muted"}`}>
            Collected {p.gameplayPts.toLocaleString()} PTS
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        {p.rank === 4 || revealed ? (
          <>
            <p className="text-sm font-black tabular-nums" style={{ color: p.rewardPts > 0 ? accent : undefined }}>
              {p.rewardPts.toLocaleString()} PTS
            </p>
            {p.rank === 4 ? (
              <p className="text-[9px] text-muted">to wallet</p>
            ) : (
              p.bonusPts > 0 && <p className="text-[10px] text-mint">+{p.bonusPts.toLocaleString()} bonus</p>
            )}
          </>
        ) : (
          <p className="animate-pulse text-xs text-muted">revealing…</p>
        )}
      </div>
    </div>
  );
}

// Sequenced match-result reveal: full 4-player leaderboard first, then a
// big animated reward-box reveal for ranks 1/2/3 in turn (rank 4 never
// gets one — its 0 PTS is just shown directly), ending on the settled
// leaderboard. Purely presentational — every number here comes from the
// settle/results API response (already credited server-side, exactly
// once); replaying or skipping this animation can never re-trigger a
// credit, it only changes what's shown on screen.
export function MatchResultReveal({
  participants,
  modeLabel,
  onPlayAgain,
  dashboardHref = "/dashboard",
}: {
  participants: MatchParticipantResult[];
  modeLabel: string;
  onPlayAgain: () => void;
  dashboardHref?: string;
}) {
  const sorted = useMemo(() => [...participants].sort((a, b) => a.rank - b.rank), [participants]);
  const [stage, setStage] = useState<"intro" | 1 | 2 | 3 | "summary">("intro");
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set([4]));

  useEffect(() => {
    if (stage !== "intro") return;
    const t = setTimeout(() => setStage(1), 900);
    return () => clearTimeout(t);
  }, [stage]);

  function completeStage(rank: 1 | 2 | 3, next: 1 | 2 | 3 | "summary") {
    setRevealed((prev) => new Set(prev).add(rank));
    setStage(next);
  }

  function skip() {
    setRevealed(new Set([1, 2, 3, 4]));
    setStage("summary");
  }

  const rank1 = sorted.find((p) => p.rank === 1);
  const rank2 = sorted.find((p) => p.rank === 2);
  const rank3 = sorted.find((p) => p.rank === 3);

  return (
    <div className="game-panel hud-corner glow-gold mx-auto max-w-sm rounded-2xl p-5 text-center">
      <style>{MRR_STYLES}</style>

      <div className="flex items-center justify-between">
        <h2 className="text-glow-gold text-lg font-black uppercase tracking-wide">Match Results</h2>
        {stage !== "summary" && (
          <button onClick={skip} className="text-[10px] uppercase tracking-widest text-muted underline">
            Skip
          </button>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted">{modeLabel}</p>

      <div className="mt-3 flex flex-col gap-1.5">
        {sorted.map((p) => (
          <LeaderboardRow key={p.rank} p={p} highlighted={stage === p.rank} revealed={revealed.has(p.rank)} />
        ))}
      </div>

      {stage === 1 && rank1 && <RewardBoxStage rank={1} participant={rank1} onDone={() => completeStage(1, 2)} />}
      {stage === 2 && rank2 && <RewardBoxStage rank={2} participant={rank2} onDone={() => completeStage(2, 3)} />}
      {stage === 3 && rank3 && <RewardBoxStage rank={3} participant={rank3} onDone={() => completeStage(3, "summary")} />}

      {stage === "summary" && (
        <>
          <div className="mt-4 flex gap-2">
            <button onClick={onPlayAgain} className="btn-game hud-corner flex-1 rounded-full px-4 py-2 text-sm">
              Play Again
            </button>
            <Link href={dashboardHref} className="btn-game-outline flex-1 rounded-full px-4 py-2 text-center text-sm">
              Dashboard
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

const MRR_STYLES = `
.mrr-box { position: relative; }
.mrr-box.mrr-appear { animation: mrr-appear 380ms ease-out; }
.mrr-box.mrr-shake { animation: mrr-shake 500ms ease-in-out; }
.mrr-box-body {
  position: relative; width: 100%; height: 100%; border-radius: 14px;
  background: linear-gradient(180deg, rgba(20,26,36,.95), rgba(8,12,18,.98));
  border: 2px solid; display: flex; align-items: center; justify-content: center;
}
.mrr-box-lid {
  position: absolute; left: -2px; right: -2px; top: -16%; height: 36%;
  border-radius: 10px 10px 4px 4px; border: 2px solid; transform-origin: 50% 100%;
}
.mrr-box-lid-open { animation: mrr-lid-open 500ms ease-in forwards; }
.mrr-burst { animation: mrr-burst 500ms ease-out forwards; }
.mrr-glow-pulse { animation: mrr-glow-pulse 900ms ease-in-out infinite; }
.mrr-particle {
  position: absolute; width: 6px; height: 6px; border-radius: 50%;
  left: 50%; top: 50%; margin: -3px; box-shadow: 0 0 8px currentColor;
  animation: mrr-particle-fly 900ms ease-out forwards;
}
.mrr-number-flow { animation: mrr-number-flow 520ms cubic-bezier(.22,1.4,.36,1) both; }
@keyframes mrr-number-flow {
  0% { opacity: 0; transform: translateY(-58px) scale(.35); }
  65% { opacity: 1; transform: translateY(4px) scale(1.06); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes mrr-appear { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: scale(1); } }
@keyframes mrr-shake {
  0%, 100% { transform: translateX(0) rotate(0); }
  20% { transform: translateX(-6px) rotate(-3deg); }
  40% { transform: translateX(6px) rotate(3deg); }
  60% { transform: translateX(-4px) rotate(-2deg); }
  80% { transform: translateX(4px) rotate(2deg); }
}
@keyframes mrr-glow-pulse { 0%, 100% { opacity: .6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.15); } }
@keyframes mrr-burst { from { opacity: 1; transform: scale(.3); } to { opacity: 0; transform: scale(1.7); } }
@keyframes mrr-lid-open { from { transform: translateY(0) rotate(0); } to { transform: translateY(-170%) rotate(-40deg); } }
@keyframes mrr-particle-fly {
  0% { opacity: 1; transform: translate(0,0) scale(1); }
  100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(.3); }
}
`;
