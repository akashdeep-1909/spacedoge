"use client";

import { useId } from "react";

// A small vector mining-rig chassis, scaling in GPU-slot count and glow
// speed with package tier (src/lib/mining-shared.ts's MINING_PACKAGES)
// — more slots and a faster pulse read as "more powerful rig." Built
// as SVG rather than text/ASCII art: it renders crisply on every
// device (no font/glyph-support risk) and can carry a real neon glow
// via an SVG filter, matching the rest of the app's "Neon Arcade" panel
// treatment instead of looking like a mocked-up terminal.
const RIG_TIERS: Record<string, { chips: number; colorClass: string; speedSec: number }> = {
  Launch: { chips: 2, colorClass: "text-mint", speedSec: 2.2 },
  Orbit: { chips: 3, colorClass: "text-mint", speedSec: 1.9 },
  Lunar: { chips: 4, colorClass: "text-gold", speedSec: 1.6 },
  Mars: { chips: 5, colorClass: "text-gold", speedSec: 1.4 },
  Galaxy: { chips: 6, colorClass: "text-risk", speedSec: 1.2 },
  Nova: { chips: 8, colorClass: "text-risk", speedSec: 1.0 },
};

const CARD_W = 30;
const CARD_H = 54;
const GAP = 6;
const PAD_X = 14;
const PAD_TOP = 16;
const PAD_BOTTOM = 16;
// A floor on the chassis frame's width, in viewBox units — without it,
// a low-chip-count tier (a narrower content block, same fixed height)
// gets a near-square viewBox that then scales up to a tall, stretched
// box once rendered at a fixed display width. Padding the frame out to
// this floor and centering the chip block inside it keeps every tier
// reading as the same wide chassis strip, just with fewer/more slots.
const MIN_WIDTH = 210;

export function RigIllustration({ level }: { level: string }) {
  const tier = RIG_TIERS[level] ?? RIG_TIERS.Launch;
  const { chips, colorClass, speedSec } = tier;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  const chipsBlockWidth = chips * CARD_W + (chips - 1) * GAP;
  const naturalWidth = PAD_X * 2 + chipsBlockWidth;
  const width = Math.max(naturalWidth, MIN_WIDTH);
  const startX = (width - chipsBlockWidth) / 2;
  const height = PAD_TOP + CARD_H + PAD_BOTTOM;
  const ventCount = Math.floor((width - 12) / 8);

  return (
    <div className={`mt-3 flex flex-col items-center gap-1.5 ${colorClass}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full max-w-[260px]"
        role="img"
        aria-label={`${level} mining rig — ${chips} GPU slots running`}
      >
        <defs>
          <filter id={`glow-${uid}`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id={`chassis-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1b1f26" />
            <stop offset="100%" stopColor="#0f1216" />
          </linearGradient>
        </defs>

        <rect
          x="1"
          y="1"
          width={width - 2}
          height={height - 2}
          rx="10"
          fill={`url(#chassis-${uid})`}
          stroke="currentColor"
          strokeOpacity="0.35"
        />

        {Array.from({ length: ventCount }).map((_, i) => (
          <line
            key={i}
            x1={8 + i * 8}
            y1={6}
            x2={8 + i * 8}
            y2={11}
            stroke="currentColor"
            strokeOpacity="0.25"
            strokeWidth="1.5"
          />
        ))}

        {Array.from({ length: chips }).map((_, i) => {
          const x = startX + i * (CARD_W + GAP);
          const y = PAD_TOP;
          const fanCx = x + CARD_W / 2;
          const fanCy = y + CARD_H * 0.36;
          const fanR = CARD_W * 0.28;
          const ledCy = y + CARD_H - 9;
          return (
            <g key={i}>
              <rect x={x} y={y} width={CARD_W} height={CARD_H} rx="4" fill="#0b0d11" stroke="currentColor" strokeOpacity="0.5" />

              {/* fan housing ring, fixed in place */}
              <circle cx={fanCx} cy={fanCy} r={fanR} fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.2" />

              {/* spinning blade set + hub */}
              <g style={{ transformOrigin: `${fanCx}px ${fanCy}px`, animation: `spin-slow ${3.5 + i * 0.4}s linear infinite` }}>
                {[0, 72, 144, 216, 288].map((angle) => (
                  <ellipse
                    key={angle}
                    cx={fanCx}
                    cy={fanCy - fanR * 0.52}
                    rx={fanR * 0.24}
                    ry={fanR * 0.52}
                    fill="currentColor"
                    fillOpacity="0.4"
                    transform={`rotate(${angle} ${fanCx} ${fanCy})`}
                  />
                ))}
                <circle cx={fanCx} cy={fanCy} r={fanR * 0.32} fill="currentColor" fillOpacity="0.7" />
              </g>

              <circle
                cx={fanCx}
                cy={ledCy}
                r="2.4"
                fill="#2dd4a7"
                filter={`url(#glow-${uid})`}
                style={{ animation: `led-pulse ${speedSec}s ease-in-out infinite`, animationDelay: `${i * 0.18}s` }}
              />
            </g>
          );
        })}

        <rect x={startX - 4} y={height - 7} width={chipsBlockWidth + 8} height="3" rx="1.5" fill="currentColor" fillOpacity="0.3" />
      </svg>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Running</p>
    </div>
  );
}
