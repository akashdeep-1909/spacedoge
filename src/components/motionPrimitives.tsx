"use client";

import { useEffect, useRef, useState, type ReactNode, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";

// Shared animation primitives for every public marketing page
// (LandingContent.tsx, HowItWorksContent.tsx, ...) — one definition so
// the "interactive feel" (scroll reveals, tilt cards, count-up stats)
// stays consistent site-wide instead of drifting per page.

export const EASE = [0.16, 1, 0.3, 1] as const;

// Fixed positions (not Math.random()) — this renders on the server for
// the initial HTML too, and a random value there would never match
// what the client re-generates on hydration, throwing a hydration
// mismatch. A hand-picked scatter reads just as organic. Shared by
// every hero that wants a twinkling starfield background.
export const STARFIELD = [
  { left: "4%", top: "12%", size: 2, delay: 0 },
  { left: "12%", top: "68%", size: 1, delay: 0.6 },
  { left: "18%", top: "34%", size: 2, delay: 1.4 },
  { left: "26%", top: "82%", size: 1, delay: 0.3 },
  { left: "33%", top: "8%", size: 1, delay: 1.9 },
  { left: "41%", top: "58%", size: 2, delay: 0.9 },
  { left: "52%", top: "22%", size: 1, delay: 1.2 },
  { left: "61%", top: "76%", size: 2, delay: 0.2 },
  { left: "68%", top: "14%", size: 1, delay: 1.6 },
  { left: "74%", top: "48%", size: 2, delay: 0.5 },
  { left: "82%", top: "88%", size: 1, delay: 1.1 },
  { left: "88%", top: "30%", size: 2, delay: 0.8 },
  { left: "93%", top: "62%", size: 1, delay: 1.7 },
  { left: "8%", top: "44%", size: 1, delay: 2.1 },
  { left: "57%", top: "92%", size: 1, delay: 0.4 },
] as const;

// Reusable twinkling starfield layer — pass a className to control
// stacking/position (e.g. "-z-10" to sit behind an aurora backdrop).
export function Starfield({ className }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 select-none overflow-hidden ${className ?? ""}`}>
      {STARFIELD.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            animation: `ld-twinkle-star ${2.4 + s.delay}s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

// Scroll-triggered fade+rise — the one animation primitive reused for
// nearly every section on a public page, so scrolling down keeps
// revealing content instead of it all being visible (and static) on load.
export function Reveal({
  children,
  className,
  delay = 0,
  y = 26,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

// Counts up from 0 to `value` once it scrolls into view. Pure
// requestAnimationFrame — no dependency needed for a single numeric
// tween tied to IntersectionObserver.
export function StatCounter({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const startedRef = useRef(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduceMotion) {
      setDisplay(value);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || startedRef.current) return;
        startedRef.current = true;
        const duration = 1100;
        const start = performance.now();
        function tick(now: number) {
          const progress = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(value * eased);
          if (progress < 1) requestAnimationFrame(tick);
          else setDisplay(value);
        }
        requestAnimationFrame(tick);
        observer.disconnect();
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, reduceMotion]);

  return (
    <span ref={ref} className="stat-value tabular-nums">
      {decimals > 0
        ? display.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : Math.round(display).toLocaleString()}
      {suffix}
    </span>
  );
}

// A glass card that tilts toward the cursor (subtle 3D) and shows a
// soft spotlight that tracks the pointer.
export function TiltCard({
  children,
  className,
  glow,
  style,
  id,
}: {
  children: ReactNode;
  className?: string;
  glow: string;
  style?: CSSProperties;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 220, damping: 22 });
  const springY = useSpring(rotateY, { stiffness: 220, damping: 22 });
  const [spot, setSpot] = useState({ x: 50, y: 50 });
  const [hovering, setHovering] = useState(false);
  const reduceMotion = useReducedMotion();

  function handleMouseMove(e: ReactMouseEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    setSpot({ x: px * 100, y: py * 100 });
    if (reduceMotion) return;
    rotateY.set((px - 0.5) * 8);
    rotateX.set((0.5 - py) * 8);
  }
  function handleMouseLeave() {
    setHovering(false);
    rotateX.set(0);
    rotateY.set(0);
  }

  return (
    <motion.div
      id={id}
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX: springX, rotateY: springY, transformPerspective: 1200, ...style }}
      className={`ld-glass relative overflow-hidden transition-shadow duration-300 ${className ?? ""}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: hovering ? 1 : 0,
          background: `radial-gradient(360px circle at ${spot.x}% ${spot.y}%, ${glow}, transparent 70%)`,
        }}
      />
      {children}
    </motion.div>
  );
}
