"use client";

import { useEffect, useRef } from "react";
import { drawRocketShip } from "@/lib/rocketShape";

// Live-animated "what you actually get" preview for a shop card —
// draws the exact same path math CoinRushArena uses for the "you" ship
// in a real match (see src/lib/rocketShape.ts's own doc-comment), just
// pointed straight up with its own idle flame flicker instead of the
// game's movement angle. A cheap per-card requestAnimationFrame loop;
// there are only ever a handful of catalog/inventory cards on screen
// at once, so this is nowhere near the cost of the actual game canvas.
export function RocketPreview({
  shapeKey,
  size = 84,
  color = "#f4c15d",
}: {
  shapeKey: string | null;
  size?: number;
  color?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    let alive = true;
    let raf = 0;
    function frame() {
      if (!alive || !ctx) return;
      ctx.clearRect(0, 0, canvas!.width, canvas!.height);
      drawRocketShip(ctx, {
        x: canvas!.width / 2,
        y: canvas!.height / 2 + size * 0.09 * dpr,
        angle: -Math.PI / 2,
        color,
        // Sized relative to the canvas (not a fixed px value) so the
        // ship reads clearly at any card size and the shape-defining
        // proportions (nose length, wing spread) are actually visible
        // instead of shrinking to a barely-distinguishable dot.
        r: size * 0.24 * dpr,
        shapeKey,
        dpr,
      });
      raf = requestAnimationFrame(frame);
    }
    frame();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [shapeKey, size, color]);

  return <canvas ref={canvasRef} style={{ width: size, height: size, display: "block" }} aria-hidden="true" />;
}
