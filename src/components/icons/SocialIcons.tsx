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

// Same rounded-square + circle convention ShareSheet.tsx uses for its
// (fixed-white) Instagram mark, redrawn here in currentColor so it can
// live/hover-color like every other footer icon.
export function InstagramIcon({ size = 24 }: { size?: number }) {
  return (
    <IconBase size={size}>
      <rect x="4" y="4" width="16" height="16" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16.2" cy="7.8" r="1" fill="currentColor" />
    </IconBase>
  );
}

export function FacebookIcon({ size = 24 }: { size?: number }) {
  return (
    <IconBase size={size}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M13.5 20v-6.2h2.1l.3-2.4h-2.4V9.9c0-.7.2-1.2 1.2-1.2h1.3V6.6c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.1-3.2 3.3v1.9H8.8v2.4h2.1V20"
        fill="currentColor"
      />
    </IconBase>
  );
}

// "in" wordmark, same text-mark convention ShareSheet.tsx uses for
// letter-mark platforms — inherits currentColor instead of a fixed
// white so it matches the footer's hover behavior.
export function LinkedInIcon({ size = 24 }: { size?: number }) {
  return (
    <span style={{ fontSize: size * 0.64, lineHeight: 1 }} className="font-black">
      in
    </span>
  );
}

export function RedditIcon({ size = 24 }: { size?: number }) {
  return (
    <IconBase size={size}>
      <circle cx="12" cy="14" r="6" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="9.3" cy="14" r="1" fill="currentColor" />
      <circle cx="14.7" cy="14" r="1" fill="currentColor" />
      <path d="M9 17c.8.6 1.9.9 3 .9s2.2-.3 3-.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12 8V5m0 0h2.5M12 5a1.4 1.4 0 100-2.8 1.4 1.4 0 000 2.8z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18" cy="10.5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
    </IconBase>
  );
}

// Musical-note glyph — a simpler, less brand-specific stand-in for
// TikTok's own multi-layer note mark, same "geometric shape, not a
// hand-typed brand path" rule the rest of this file follows.
export function TikTokIcon({ size = 24 }: { size?: number }) {
  return (
    <IconBase size={size}>
      <path
        d="M14.5 4v9.8a3.3 3.3 0 11-2.4-3.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 4c.3 2.2 1.9 3.8 4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconBase>
  );
}

// Lowercase "m" wordmark — Medium's own real logo IS just its
// lowercase-m glyph, so a text-mark is the accurate representation
// here, not a simplification.
export function MediumIcon({ size = 24 }: { size?: number }) {
  return (
    <span style={{ fontSize: size * 0.72, lineHeight: 1 }} className="font-black">
      M
    </span>
  );
}
