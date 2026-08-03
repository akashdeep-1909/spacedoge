// Same "simple geometric marks, no external icon library" convention
// as CoinIcons.tsx / SocialIcons.tsx — replaces the raw emoji
// previously used for each game mode's icon (🧭⚡🚀💎🌟👑🎁🏆) with a
// consistent set of filled SVG marks in a circular badge, matching how
// coin/chain icons already look next to each other on the
// withdraw/deposit pages.
function Badge({ size = 40, accentColor, children }: { size?: number; accentColor?: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        ...(accentColor
          ? { borderColor: `${accentColor}40`, background: `${accentColor}1f`, color: accentColor }
          : {}),
      }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border ${accentColor ? "" : "border-gold/25 bg-gold-soft text-gold"}`}
    >
      {children}
    </span>
  );
}

function Glyph({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0">
      {children}
    </svg>
  );
}

export function CompassIcon({ size = 22 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M15.2 8.8 11 11l-2.2 4.2L13 13l2.2-4.2z" />
      <circle cx="12" cy="12" r="1" />
    </Glyph>
  );
}

export function BoltIcon({ size = 22 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </Glyph>
  );
}

export function RocketIcon({ size = 22 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M12 2.5c2.7 2.1 4.3 5.3 4.3 8.8 0 1.6-.3 3.1-1 4.5l1.7 1.7c.4.4.4 1 0 1.4l-.4.4c-.4.4-1 .4-1.4 0l-1.5-1.5c-.5.2-1.1.3-1.7.3s-1.2-.1-1.7-.3l-1.5 1.5c-.4.4-1 .4-1.4 0l-.4-.4c-.4-.4-.4-1 0-1.4l1.7-1.7c-.6-1.4-1-2.9-1-4.5 0-3.5 1.6-6.7 4.3-8.8z" />
      <circle cx="12" cy="10.8" r="1.5" fill="var(--panel-2)" />
      <path d="M8.3 15.5c-1.2.3-2.1 1.2-2.5 2.4l-.6 1.8 1.9-.4c1.3-.3 2.3-1.2 2.7-2.5z" />
      <path d="M15.7 15.5c1.2.3 2.1 1.2 2.5 2.4l.6 1.8-1.9-.4c-1.3-.3-2.3-1.2-2.7-2.5z" />
    </Glyph>
  );
}

export function GemIcon({ size = 22 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M7 5h10l3.5 5L12 20.5 3.5 10 7 5z" fillOpacity="0.35" />
      <path d="M7 5h10l3.5 5-2 .01H5.5L3.5 10 7 5z" />
      <path d="M9.3 10 12 20.5 14.7 10z" fillOpacity="0.6" />
    </Glyph>
  );
}

export function StarIcon({ size = 22 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M12 3 14.23 8.93 20.56 9.22 15.61 13.17 17.29 19.28 12 15.8 6.71 19.28 8.39 13.17 3.44 9.22 9.77 8.93 Z" />
    </Glyph>
  );
}

export function CrownIcon({ size = 22 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M4 9.5 8 12l4-6.5 4 6.5 4-2.5-1.4 8.5H5.4L4 9.5z" />
      <rect x="5" y="18" width="14" height="2.2" rx="0.6" />
    </Glyph>
  );
}

export function GiftIcon({ size = 22 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <rect x="4" y="10" width="16" height="10" rx="1" />
      <rect x="4" y="7" width="16" height="3.5" rx="0.8" />
      <rect x="10.7" y="7" width="2.6" height="13" fill="var(--panel-2)" />
      <path d="M11 7c-3-.2-4.5-1.6-4.5-3A2 2 0 0 1 9 2c1.8 0 3 2 3 5z" />
      <path d="M13 7c3-.2 4.5-1.6 4.5-3A2 2 0 0 0 15 2c-1.8 0-3 2-3 5z" />
    </Glyph>
  );
}

export function TrophyIcon({ size = 22 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M7 4h10v6a5 5 0 0 1-10 0V4z" />
      <path d="M7 5.5H4a3 3 0 0 0 3 4.7z" />
      <path d="M17 5.5h3a3 3 0 0 1-3 4.7z" />
      <rect x="10.8" y="14.5" width="2.4" height="3.5" />
      <rect x="7.5" y="18.5" width="9" height="2" rx="0.6" />
    </Glyph>
  );
}

export type GameModeIconKey =
  | "compass"
  | "bolt"
  | "rocket"
  | "gem"
  | "star"
  | "crown"
  | "gift"
  | "trophy";

const ICON_COMPONENTS: Record<GameModeIconKey, (props: { size?: number }) => React.JSX.Element> = {
  compass: CompassIcon,
  bolt: BoltIcon,
  rocket: RocketIcon,
  gem: GemIcon,
  star: StarIcon,
  crown: CrownIcon,
  gift: GiftIcon,
  trophy: TrophyIcon,
};

export function GameModeIcon({
  icon,
  size = 22,
  badgeSize = 40,
  accentColor,
}: {
  icon: GameModeIconKey;
  size?: number;
  badgeSize?: number;
  accentColor?: string;
}) {
  const Icon = ICON_COMPONENTS[icon];
  return (
    <Badge size={badgeSize} accentColor={accentColor}>
      <Icon size={size} />
    </Badge>
  );
}
