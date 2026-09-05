import { SHOP_CATEGORY_META, type ShopItemCategory } from "@/lib/shop-shared";

// The non-rocket counterpart to RocketPreview (same file, same
// component) — a glowing icon tile for every stat/power-up category,
// reusing the exact symbol + color each power-up already renders as
// in a live match (see SHOP_CATEGORY_META's own doc-comment). Same
// size contract as RocketPreview (a `size`-square box) so both drop
// into the same grid cell shape on the admin live-preview and every
// player-facing catalog/inventory card — deliberately a plain styled
// div, not a canvas, since there's no animation here (unlike the
// rocket's idle flame flicker) and CSS glow reads identically.
export function ShopItemIcon({ category, size = 84 }: { category: ShopItemCategory | string; size?: number }) {
  const meta = SHOP_CATEGORY_META[category as ShopItemCategory] ?? SHOP_CATEGORY_META.EXTRA_TIME;
  return (
    <div
      role="img"
      aria-label={meta.label}
      style={{
        width: size,
        height: size,
        display: "grid",
        placeItems: "center",
        borderRadius: "50%",
        fontSize: size * 0.42,
        background: `${meta.color}1f`,
        border: `1px solid ${meta.color}55`,
        boxShadow: `0 0 ${size * 0.25}px ${meta.color}55`,
      }}
    >
      <span aria-hidden>{meta.icon}</span>
    </div>
  );
}
