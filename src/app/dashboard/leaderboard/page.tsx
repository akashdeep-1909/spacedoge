"use client";

import { OnboardingGate } from "@/components/OnboardingGate";
import { PaginationControls } from "@/components/PaginationControls";
import { usePagination } from "@/lib/usePagination";
import { useAuth } from "@/lib/auth-context";
import { useLeaderboard, type LeaderboardStanding } from "@/lib/hooks";
import { useLocale } from "@/lib/i18n/LocaleProvider";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function shorten(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function LeaderboardPage() {
  return (
    <OnboardingGate>
      <LeaderboardContent />
    </OnboardingGate>
  );
}

function LeaderboardContent() {
  const { t } = useLocale();
  const { session } = useAuth();
  const { data, isLoading } = useLeaderboard();
  const myAddress = session?.address?.toLowerCase();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-glow-gold text-2xl font-black uppercase tracking-wide">🏆 {t("leaderboard.weeklyLeaderboardTitle")}</h2>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">{t("mining.loadingLabel")}</p>
      ) : (
        <>
          <section>
            <div className="mb-3">
              <h3 className="text-xs font-black uppercase tracking-[0.15em] text-mint">
                ● {t("leaderboard.liveThisWeekLabel")} · {data && fmtDate(data.currentWeek.weekStart)} –{" "}
                {data && fmtDate(data.currentWeek.weekEnd)}
              </h3>
            </div>
            <StandingsTable rows={data?.currentWeek.standings ?? []} myAddress={myAddress} showReward={false} />
          </section>

          <section>
            <div className="mb-3">
              <h3 className="text-xs font-black uppercase tracking-[0.15em] text-gold">
                ✓ {t("leaderboard.lastWeekPaidOutLabel")} · {data && fmtDate(data.lastWeek.weekStart)} –{" "}
                {data && fmtDate(data.lastWeek.weekEnd)}
              </h3>
            </div>
            <StandingsTable rows={data?.lastWeek.results ?? []} myAddress={myAddress} showReward />
          </section>
        </>
      )}
    </div>
  );
}

function StandingsTable({
  rows,
  myAddress,
  showReward,
}: {
  rows: LeaderboardStanding[];
  myAddress: string | undefined;
  showReward: boolean;
}) {
  const { t } = useLocale();
  const { pageItems, page, pageCount, setPage, start, pageSize, total } = usePagination(rows);

  if (rows.length === 0) {
    return <p className="text-sm text-muted">{t("leaderboard.noRankedMatchesYet")}</p>;
  }
  return (
    <div>
      <div className="game-panel hud-corner overflow-x-auto rounded-2xl">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gold/15 text-left text-[10px] uppercase tracking-widest text-gold">
            <th className="px-4 py-2.5 font-bold">{t("play.rankLabel")}</th>
            <th className="px-4 py-2.5 font-bold">{t("refer.walletColumn")}</th>
            <th className="px-4 py-2.5 text-right font-bold">{t("play.scoreLabel")}</th>
            {showReward && <th className="px-4 py-2.5 text-right font-bold">{t("history.rewardColumn")}</th>}
          </tr>
        </thead>
        <tbody>
          {pageItems.map((r) => {
            const mine = myAddress && r.address.toLowerCase() === myAddress;
            return (
              <tr
                key={r.walletProfileId}
                className={`border-b border-line last:border-0 ${mine ? "bg-mint-soft" : "hover:bg-panel-2"}`}
                style={mine ? { boxShadow: "inset 0 0 0 1px rgba(45,212,167,0.35)" } : undefined}
              >
                <td className="stat-value px-4 py-2.5">
                  {r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : `#${r.rank}`}
                </td>
                <td className={`px-4 py-2.5 text-xs ${r.nickname ? "" : "font-mono"} ${mine ? "font-bold text-mint" : ""}`}>
                  {r.nickname || shorten(r.address)} {mine && t("leaderboard.youSuffix")}
                </td>
                <td className="stat-value px-4 py-2.5 text-right">{r.score}</td>
                {showReward && (
                  <td className="stat-value text-glow-mint px-4 py-2.5 text-right text-mint">
                    ${r.rewardUsdt.toFixed(2)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <PaginationControls page={page} pageCount={pageCount} start={start} pageSize={pageSize} total={total} onChange={setPage} />
    </div>
  );
}
