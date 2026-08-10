"use client";

import {
  XIcon,
  TelegramIcon,
  DiscordIcon,
  YoutubeIcon,
  InstagramIcon,
  FacebookIcon,
  LinkedInIcon,
  RedditIcon,
  TikTokIcon,
  MediumIcon,
} from "@/components/icons/SocialIcons";
import { usePublicSettings } from "@/lib/hooks";

// Reads admin-configured links from /admin/settings (src/lib/settings.ts
// getSocialLinks) — renders nothing at all when none are set, rather
// than a row of dead/placeholder icons. Icons are the same hand-drawn
// marks ShareSheet.tsx uses for its share targets (imported from the
// shared components/icons/SocialIcons.tsx), not generic lucide
// stand-ins, so the same platform reads the same mark everywhere.
export function SocialLinks() {
  const { data } = usePublicSettings();
  const social = data?.social;
  if (!social) return null;

  // Each platform's own real-world brand color — X, TikTok and Medium
  // don't have a colorful mark (their actual logo is a plain black/
  // white glyph), so those three stay white to match their real
  // brand rather than being forced into an invented accent color.
  const links = [
    social.twitter && { href: social.twitter, label: "X (Twitter)", Icon: XIcon, color: "#ffffff" },
    social.telegram && { href: social.telegram, label: "Telegram", Icon: TelegramIcon, color: "#26A5E4" },
    social.discord && { href: social.discord, label: "Discord", Icon: DiscordIcon, color: "#5865F2" },
    social.youtube && { href: social.youtube, label: "YouTube", Icon: YoutubeIcon, color: "#FF0000" },
    social.instagram && { href: social.instagram, label: "Instagram", Icon: InstagramIcon, color: "#E1306C" },
    social.facebook && { href: social.facebook, label: "Facebook", Icon: FacebookIcon, color: "#1877F2" },
    social.linkedin && { href: social.linkedin, label: "LinkedIn", Icon: LinkedInIcon, color: "#0A66C2" },
    social.reddit && { href: social.reddit, label: "Reddit", Icon: RedditIcon, color: "#FF4500" },
    social.tiktok && { href: social.tiktok, label: "TikTok", Icon: TikTokIcon, color: "#ffffff" },
    social.medium && { href: social.medium, label: "Medium", Icon: MediumIcon, color: "#ffffff" },
  ].filter(Boolean) as { href: string; label: string; Icon: typeof XIcon; color: string }[];

  if (links.length === 0) return null;

  return (
    <div className="flex items-center gap-4">
      {links.map(({ href, label, Icon, color }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          title={label}
          className="grid h-6 w-6 shrink-0 place-items-center opacity-80 transition hover:opacity-100 hover:scale-110"
          style={{ color }}
        >
          <Icon size={22} />
        </a>
      ))}
    </div>
  );
}
