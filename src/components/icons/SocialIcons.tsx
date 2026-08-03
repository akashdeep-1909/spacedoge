import type { ReactNode } from "react";

// Same "simple geometric marks, no external icon library" approach as
// ShareSheet.tsx (Telegram/Discord originated there) — shared here so
// the referral ShareSheet and the footer's SocialLinks render the
// exact same marks instead of two hand-drawn versions drifting apart.
// currentColor (not a hardcoded fill) so callers can size/color these
// like any other inline icon (lucide included).
function IconBase({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden>
      {children}
    </svg>
  );
}

// Text-mark, not a path — same convention ShareSheet uses for
// letter-mark platforms (Facebook "f", LinkedIn "in", X's own wordmark
// glyph) rather than hand-typing brand path data.
export function XIcon({ size = 24 }: { size?: number }) {
  return (
    <span style={{ fontSize: size * 0.7, lineHeight: 1 }} className="font-bold">
      𝕏
    </span>
  );
}

export function TelegramIcon({ size = 24 }: { size?: number }) {
  return (
    <IconBase size={size}>
      <path
        d="M21 4L3 11.5l6 2M21 4l-3 16-6-4.5M21 4l-9 8.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </IconBase>
  );
}

export function DiscordIcon({ size = 24 }: { size?: number }) {
  return (
    <IconBase size={size}>
      <rect x="4" y="8" width="16" height="9" rx="4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="9" cy="12.5" r="1.2" fill="currentColor" />
      <circle cx="15" cy="12.5" r="1.2" fill="currentColor" />
      <path d="M8 8l1-3h6l1 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </IconBase>
  );
}

// No YouTube mark existed anywhere in the app yet — drawn to match the
// same minimal rect/circle/path style as the icons above (rounded
// rect + a solid play triangle), not a hand-typed copy of the real
// multi-curve YouTube logo.
export function YoutubeIcon({ size = 24 }: { size?: number }) {
  return (
    <IconBase size={size}>
      <rect x="3" y="6" width="18" height="12" rx="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 9l6 3-6 3V9z" fill="currentColor" />
    </IconBase>
  );
}
