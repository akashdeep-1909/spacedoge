// Same "simple, safe geometric marks, no external icon library"
// convention as components/icons/SocialIcons.tsx and ShareSheet.tsx —
// a fixed brand-color circular badge with the coin's real currency
// symbol/initial, not a hand-typed copy of each project's actual
// multi-color logo artwork. Colors are the real brand colors (Tether
// green, Dogecoin gold, Binance yellow, Tron red) so they still read
// as "that coin" at a glance even at 18-20px.
function Badge({ bg, fg = "#fff", children, size = 18 }: { bg: string; fg?: string; children: React.ReactNode; size?: number }) {
  return (
    <span
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.6 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none"
    >
      {children}
    </span>
  );
}

export function UsdtIcon({ size = 18 }: { size?: number }) {
  return (
    <Badge bg="#26A17B" size={size}>
      ₮
    </Badge>
  );
}

export function DogeIcon({ size = 18 }: { size?: number }) {
  return (
    <Badge bg="#C2A633" size={size}>
      Ð
    </Badge>
  );
}

// The real BNB coin mark: a gold circle containing two "chevron"
// frames (top and bottom — each a diamond outline pinched shut at its
// inner point, drawn as one big diamond minus a smaller one via
// evenodd fill) plus three small solid diamonds through the middle
// (left/center/right). A prior version of this icon used 5 solid
// diamonds in a plus arrangement, which doesn't actually match the
// real logo (confirmed against the reference image) — this traces the
// real proportions instead.
export function Bep20Icon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <circle cx="12" cy="12" r="11" fill="#F0B90B" />
      <path
        fill="#fff"
        fillRule="evenodd"
        d="M12,3.2 L16.4,7.6 L12,12 L7.6,7.6 Z M12,7.6 L14.2,9.8 L12,12 L9.8,9.8 Z"
      />
      <path
        fill="#fff"
        fillRule="evenodd"
        d="M12,20.8 L16.4,16.4 L12,12 L7.6,16.4 Z M12,16.4 L14.2,14.2 L12,12 L9.8,14.2 Z"
      />
      <path
        fill="#fff"
        d="M7.6,9.8 L9.8,12 L7.6,14.2 L5.4,12 Z M12,9.8 L14.2,12 L12,14.2 L9.8,12 Z M16.4,9.8 L18.6,12 L16.4,14.2 L14.2,12 Z"
      />
    </svg>
  );
}

export function Trc20Icon({ size = 18 }: { size?: number }) {
  return (
    <Badge bg="#EF0027" size={size}>
      T
    </Badge>
  );
}

export function EthIcon({ size = 18 }: { size?: number }) {
  return (
    <Badge bg="#627EEA" size={size}>
      Ξ
    </Badge>
  );
}

export function PolygonIcon({ size = 18 }: { size?: number }) {
  return (
    <Badge bg="#8247E5" size={size}>
      P
    </Badge>
  );
}

export function GenericChainIcon({ letter, size = 18 }: { letter: string; size?: number }) {
  return (
    <Badge bg="#6b7280" size={size}>
      {letter.slice(0, 1).toUpperCase()}
    </Badge>
  );
}

const COIN_ICON: Record<string, (size?: number) => React.ReactNode> = {
  USDT: (size) => <UsdtIcon size={size} />,
  DOGE: (size) => <DogeIcon size={size} />,
};

export function coinIcon(coinSymbol: string, size?: number) {
  return COIN_ICON[coinSymbol]?.(size) ?? <GenericChainIcon letter={coinSymbol} size={size} />;
}

const CHAIN_ICON: Record<string, (size?: number) => React.ReactNode> = {
  BEP20: (size) => <Bep20Icon size={size} />,
  TRC20: (size) => <Trc20Icon size={size} />,
  // The live chainKey for Ethereum deposits/withdrawals is "ERC20"
  // (DepositChainConfig.chainKey, e.g. "Ethereum (ERC20)"), not "ETH"
  // — "ETH" was never actually used anywhere, so this fell through to
  // GenericChainIcon's plain gray "E" badge instead of the real
  // purple Ethereum mark. Both keys map to the same icon in case
  // "ETH" is ever used directly (e.g. a future native-ETH withdrawal
  // chain, as opposed to the ERC20 USDT deposit chain).
  ETH: (size) => <EthIcon size={size} />,
  ERC20: (size) => <EthIcon size={size} />,
  POLYGON: (size) => <PolygonIcon size={size} />,
  DOGE: (size) => <DogeIcon size={size} />,
};

// Falls back to a generic gray badge with the chain key's first
// letter — keeps working for any chain an admin adds later that
// doesn't have a dedicated icon here yet.
export function chainIcon(chainKey: string, size?: number) {
  return CHAIN_ICON[chainKey]?.(size) ?? <GenericChainIcon letter={chainKey} size={size} />;
}
