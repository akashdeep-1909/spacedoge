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

  const links = [
    social.twitter && { href: social.twitter, label: "X (Twitter)", Icon: XIcon },
    social.telegram && { href: social.telegram, label: "Telegram", Icon: TelegramIcon },
    social.discord && { href: social.discord, label: "Discord", Icon: DiscordIcon },
    social.youtube && { href: social.youtube, label: "YouTube", Icon: YoutubeIcon },
    social.instagram && { href: social.instagram, label: "Instagram", Icon: InstagramIcon },
    social.facebook && { href: social.facebook, label: "Facebook", Icon: FacebookIcon },
    social.linkedin && { href: social.linkedin, label: "LinkedIn", Icon: LinkedInIcon },
    social.reddit && { href: social.reddit, label: "Reddit", Icon: RedditIcon },
    social.tiktok && { href: social.tiktok, label: "TikTok", Icon: TikTokIcon },
    social.medium && { href: social.medium, label: "Medium", Icon: MediumIcon },
  ].filter(Boolean) as { href: string; label: string; Icon: typeof XIcon }[];

  if (links.length === 0) return null;

  return (
    <div className="flex items-center gap-3">
      {links.map(({ href, label, Icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          title={label}
          className="text-muted transition hover:text-gold"
        >
          <Icon size={15} />
        </a>
      ))}
    </div>
  );
}
