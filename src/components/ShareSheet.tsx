"use client";

import { useEffect, useState, type ReactNode } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { TelegramIcon as SharedTelegramIcon, DiscordIcon as SharedDiscordIcon } from "@/components/icons/SocialIcons";

// Simple, safe geometric icon marks (no external icon library) — kept
// deliberately minimal (rects/circles/polygons/short paths) rather than
// hand-typed multi-curve brand path data, which is easy to get subtly
// wrong. Text-mark platforms (Facebook, X, LinkedIn, Pinterest, Reddit)
// use their real wordmark letter, same as most native share sheets do.
// Telegram/Discord live in components/icons/SocialIcons.tsx (currentColor,
// sizeable) so the footer's SocialLinks renders the identical mark —
// wrapped here in a fixed white 24px span since every icon in this grid
// sits on a solid colored circle needing a fixed white glyph, not an
// inherited/hoverable color.
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden>
      {children}
    </svg>
  );
}
const WhatsAppIcon = () => (
  <Icon>
    <path
      d="M6 21l1.3-3.7A8 8 0 1112 20a7.9 7.9 0 01-4.2-1.2L6 21z"
      stroke="white"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M9 10.5c0 3 2.5 5.5 5.5 5.5.6 0 1-.5.9-1.1l-.2-1a.7.7 0 00-.7-.6l-1.3.2a4 4 0 01-2.7-2.7l.2-1.3a.7.7 0 00-.6-.7l-1-.2c-.6-.1-1.1.3-1.1.9z"
      fill="white"
    />
  </Icon>
);
const TelegramIcon = () => (
  <span className="text-white">
    <SharedTelegramIcon size={24} />
  </span>
);
const DiscordIcon = () => (
  <span className="text-white">
    <SharedDiscordIcon size={24} />
  </span>
);
const InstagramIcon = () => (
  <Icon>
    <rect x="4" y="4" width="16" height="16" rx="5" stroke="white" strokeWidth="1.6" />
    <circle cx="12" cy="12" r="3.5" stroke="white" strokeWidth="1.6" />
    <circle cx="16.2" cy="7.8" r="1" fill="white" />
  </Icon>
);
const EmailIcon = () => (
  <Icon>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke="white" strokeWidth="1.6" />
    <path d="M4 7l8 6 8-6" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </Icon>
);
const LinkIcon = () => (
  <Icon>
    <rect x="3" y="9" width="9" height="6" rx="3" transform="rotate(-45 7.5 12)" stroke="white" strokeWidth="1.6" />
    <rect x="12" y="9" width="9" height="6" rx="3" transform="rotate(-45 16.5 12)" stroke="white" strokeWidth="1.6" />
  </Icon>
);

interface ShareTarget {
  label: string;
  bg: string;
  content: ReactNode;
  href?: string;
  copyFallback?: boolean; // platforms with no web share intent — copy + hint instead
}

function targets(link: string, message: string): ShareTarget[] {
  const encodedLink = encodeURIComponent(link);
  const encodedMsg = encodeURIComponent(message);
  return [
    { label: "Facebook", bg: "bg-[#1877F2]", content: "f", href: `https://www.facebook.com/sharer/sharer.php?u=${encodedLink}` },
    { label: "X", bg: "bg-black", content: "𝕏", href: `https://twitter.com/intent/tweet?text=${encodedMsg}&url=${encodedLink}` },
    { label: "LinkedIn", bg: "bg-[#0A66C2]", content: "in", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedLink}` },
    {
      label: "WhatsApp",
      bg: "bg-[#25D366]",
      content: <WhatsAppIcon />,
      href: `https://wa.me/?text=${encodeURIComponent(`${message} ${link}`)}`,
    },
    {
      label: "Telegram",
      bg: "bg-[#26A5E4]",
      content: <TelegramIcon />,
      href: `https://t.me/share/url?url=${encodedLink}&text=${encodedMsg}`,
    },
    { label: "Reddit", bg: "bg-[#FF4500]", content: "R", href: `https://www.reddit.com/submit?url=${encodedLink}&title=${encodedMsg}` },
    { label: "Pinterest", bg: "bg-[#E60023]", content: "P", href: `https://pinterest.com/pin/create/button/?url=${encodedLink}&description=${encodedMsg}` },
    { label: "Discord", bg: "bg-[#5865F2]", content: <DiscordIcon />, copyFallback: true },
    {
      label: "Instagram",
      bg: "bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#4f5bd5]",
      content: <InstagramIcon />,
      copyFallback: true,
    },
    {
      label: "Email",
      bg: "bg-slate-500",
      content: <EmailIcon />,
      href: `mailto:?subject=${encodeURIComponent("Join me on Space DOGE")}&body=${encodeURIComponent(`${message} ${link}`)}`,
    },
  ];
}

export function ShareSheet({
  link,
  message,
  onClose,
}: {
  link: string;
  message: string;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  function close() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  async function handleClick(t: ShareTarget) {
    if (t.copyFallback) {
      const ok = await copyToClipboard(link);
      setHint(ok ? `Link copied, paste it in ${t.label}.` : `Couldn't copy automatically: ${link}`);
      if (ok) setTimeout(close, 900);
      return;
    }
    window.open(t.href, "_blank", "noopener,noreferrer");
    close();
  }

  async function copyLink() {
    const ok = await copyToClipboard(link);
    setHint(ok ? "Link copied." : `Couldn't copy automatically: ${link}`);
    if (ok) setTimeout(close, 700);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={close}
      />
      <div
        className={`relative w-full rounded-t-3xl bg-white p-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] text-slate-900 shadow-2xl transition-transform duration-200 sm:max-w-md sm:rounded-3xl sm:pb-5 ${
          visible ? "translate-y-0" : "translate-y-full sm:translate-y-6 sm:opacity-0"
        }`}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300 sm:hidden" />
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Share your referral link</h3>
          <button
            onClick={close}
            aria-label="Close"
            className="rounded-full p-1 text-slate-400 transition hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-x-2 gap-y-4">
          {targets(link, message).map((t) => (
            <button
              key={t.label}
              onClick={() => handleClick(t)}
              className="flex flex-col items-center gap-1.5 rounded-xl p-1 text-center transition hover:bg-slate-100"
            >
              <span
                className={`grid h-14 w-14 place-items-center rounded-full text-xl font-bold text-white shadow-md ${t.bg}`}
              >
                {t.content}
              </span>
              <span className="text-[11px] text-slate-600">{t.label}</span>
            </button>
          ))}
          <button
            onClick={copyLink}
            className="flex flex-col items-center gap-1.5 rounded-xl p-1 text-center transition hover:bg-slate-100"
          >
            <span className="grid h-14 w-14 place-items-center rounded-full bg-slate-700 shadow-md">
              <LinkIcon />
            </span>
            <span className="text-[11px] text-slate-600">Copy Link</span>
          </button>
        </div>

        {hint && <p className="mt-4 text-center text-xs font-medium text-emerald-600">{hint}</p>}
      </div>
    </div>
  );
}
