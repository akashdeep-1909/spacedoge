export function BalanceCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "mint" | "gold";
}) {
  const valueColor =
    tone === "mint" ? "text-mint text-glow-mint" : tone === "gold" ? "text-gold text-glow-gold" : "text-foreground";
  return (
    <div className="game-panel hud-corner rounded-2xl p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</p>
      <p className={`stat-value mt-1.5 text-xl ${valueColor}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
