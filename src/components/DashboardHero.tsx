import type { CSSProperties } from "react";
import Image from "next/image";

// Floating coins and sparkles drift on staggered loops behind the
// banner, matching the Neon Arcade treatment used across the dashboard.
const FLOATERS: { icon: string; className: string; style: CSSProperties }[] = [
  { icon: "🪙", className: "left-[6%] top-[18%] text-3xl", style: { animation: "float-coin 3.2s ease-in-out infinite" } },
  { icon: "🪙", className: "right-[10%] top-[22%] text-2xl", style: { animation: "float-coin-alt 2.7s ease-in-out infinite", animationDelay: "0.3s" } },
  { icon: "✨", className: "left-[22%] bottom-[18%] text-xl", style: { animation: "twinkle 2.1s ease-in-out infinite", animationDelay: "0.5s" } },
  { icon: "✨", className: "right-[6%] bottom-[30%] text-lg", style: { animation: "twinkle 2.6s ease-in-out infinite", animationDelay: "1.1s" } },
];

export function DashboardHero() {
  return (
    <div className="game-panel hud-corner glow-gold relative overflow-hidden rounded-2xl p-6 sm:p-8">
      {FLOATERS.map((f, i) => (
        <span
          key={i}
          aria-hidden
          className={`pointer-events-none absolute select-none ${f.className}`}
          style={f.style}
        >
          {f.icon}
        </span>
      ))}

      <div className="relative flex items-center gap-4">
        <div className="h-16 w-24 shrink-0 sm:h-20 sm:w-28">
          <Image
            src="/dogemine-banner.png"
            alt="SPACE DOGE, mine real DOGE from verified game wins"
            width={1536}
            height={1024}
            priority
            className="h-full w-full object-contain"
          />
        </div>
        <div>
          <h2 className="text-glow-gold text-lg font-black uppercase tracking-wide sm:text-2xl">
            Play. Mine. Earn.
          </h2>
          <p className="mt-1 text-xs text-muted sm:text-sm">
            Every coin collected in Coin Rush can become real Scrypt Mining Power.
          </p>
        </div>
      </div>
    </div>
  );
}
