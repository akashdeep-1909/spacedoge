"use client";

import Image from "next/image";
import Link from "next/link";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { EnterDashboard } from "@/components/EnterDashboard";
import { InfoTooltip } from "@/components/InfoTooltip";
import { SocialLinks } from "@/components/SocialLinks";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLocale } from "@/lib/i18n/LocaleProvider";

interface MiningStats {
  epochDateLabel: string;
  contractedHashrate: number;
  observedHashrate: number;
  totalEffectiveMp: number;
  netDistributableDoge: number;
}

const STEP_KEYS = [
  { n: "01", titleKey: "landing.step1Title", bodyKey: "landing.step1Body" },
  { n: "02", titleKey: "landing.step2Title", bodyKey: "landing.step2Body" },
  { n: "03", titleKey: "landing.step3Title", bodyKey: "landing.step3Body" },
] as const;

const FEATURE_KEYS = [
  { labelKey: "landing.builtWalletTitle", bodyKey: "landing.builtWalletBody" },
  { labelKey: "landing.builtLedgerTitle", bodyKey: "landing.builtLedgerBody" },
  { labelKey: "landing.builtSettledTitle", bodyKey: "landing.builtSettledBody" },
] as const;

export function LandingContent({ mining }: { mining: MiningStats }) {
  const { t } = useLocale();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-gold/15 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <Image
              src="/SpaceDOGE-icon.png"
              alt="SPACE DOGE"
              width={56}
              height={56}
              priority
              className="shrink-0"
            />
            <div className="min-w-0">
              <h1 className="text-sm font-black uppercase tracking-widest">SPACE DOGE</h1>
              <p className="hidden text-[11px] text-muted sm:block">{t("landing.tagline")}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher />
            <ConnectWalletButton />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(60% 50% at 50% 0%, rgba(201,162,39,0.22) 0%, transparent 65%), radial-gradient(45% 40% at 80% 20%, rgba(45,212,167,0.16) 0%, transparent 70%), radial-gradient(35% 35% at 10% 80%, rgba(45,212,167,0.10) 0%, transparent 70%)",
            }}
          />

          {/* Animated illustration — floating coins, gems and sparkles
              framing the headline. Pure CSS/emoji, no image assets. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 select-none overflow-hidden">
            <span className="absolute left-[6%] top-[18%] text-4xl sm:text-5xl" style={{ animation: "float-coin 3.4s ease-in-out infinite" }}>🪙</span>
            <span className="absolute right-[2%] top-[30%] text-3xl sm:right-[8%] sm:top-[24%] sm:text-4xl" style={{ animation: "float-coin-alt 2.9s ease-in-out infinite", animationDelay: "0.4s" }}>🪙</span>
            <span className="absolute left-[14%] bottom-[16%] text-3xl sm:text-4xl" style={{ animation: "float-coin 3.1s ease-in-out infinite", animationDelay: "1.1s" }}>💎</span>
            <span className="absolute right-[14%] bottom-[20%] text-4xl sm:text-5xl" style={{ animation: "float-coin-alt 3.7s ease-in-out infinite", animationDelay: "0.7s" }}>🪙</span>
            <span className="absolute left-[4%] top-[6%] text-xl sm:left-[26%] sm:top-[10%] sm:text-2xl" style={{ animation: "twinkle 2.2s ease-in-out infinite", animationDelay: "0.2s" }}>✨</span>
            <span className="absolute right-[3%] top-[4%] text-lg sm:right-[24%] sm:top-[14%] sm:text-xl" style={{ animation: "twinkle 1.8s ease-in-out infinite", animationDelay: "0.9s" }}>✨</span>
            <span className="absolute left-[9%] top-[52%] text-lg sm:text-xl" style={{ animation: "twinkle 2.5s ease-in-out infinite", animationDelay: "1.4s" }}>✨</span>
            <span className="absolute right-[9%] top-[48%] text-xl sm:text-2xl" style={{ animation: "twinkle 2s ease-in-out infinite", animationDelay: "0.5s" }}>⚡</span>
            <span className="absolute left-[3%] bottom-[36%] text-2xl sm:text-3xl opacity-80" style={{ animation: "spin-slow 12s linear infinite" }}>⛏️</span>
          </div>

          <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 px-5 py-20 text-center sm:px-8 sm:py-28">
            <span
              className="rounded-full border border-mint/35 bg-mint-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-mint"
              style={{ animation: "pulse-glow-mint 2.6s ease-in-out infinite" }}
            >
              {t("landing.walletOnlyBadge")}
            </span>
            <h2 className="text-glow-gold text-balance text-4xl font-black leading-[1.1] tracking-tight sm:text-6xl">
              {t("landing.heroTitle")}
            </h2>
            <p className="max-w-xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
              {t("landing.heroSubtitle")}
            </p>
            <div className="mt-2 flex flex-col items-center gap-2">
              <ConnectWalletButton />
              <EnterDashboard />
            </div>
          </div>
        </section>

        {/* Live mining proof — doc section 15.1: "establish trust before deposit" */}
        <section className="border-t border-line bg-panel/40">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.2em] text-gold">
                ⚡ {t("landing.outputHeading")} — {mining.epochDateLabel}
                <InfoTooltip text={t("landing.miningProofTooltip")} />
              </h3>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="game-panel hud-corner rounded-2xl p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("landing.contractedHashrate")}</p>
                <p className="stat-value mt-1.5 text-xl">
                  {mining.contractedHashrate.toFixed(2)} <span className="text-sm text-muted">GH/s</span>
                </p>
              </div>
              <div className="game-panel hud-corner rounded-2xl p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("landing.observed")}</p>
                <p className="stat-value mt-1.5 text-xl">
                  {mining.observedHashrate.toFixed(2)} <span className="text-sm text-muted">GH/s</span>
                </p>
              </div>
              <div className="game-panel hud-corner rounded-2xl p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("landing.effectiveMhHours")}</p>
                <p className="stat-value mt-1.5 text-xl">
                  {mining.totalEffectiveMp.toLocaleString()}
                </p>
              </div>
              <div className="game-panel hud-corner glow-mint rounded-2xl border-mint/25 p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-mint">{t("landing.netOutputSettled")}</p>
                <p className="stat-value text-glow-mint mt-1.5 text-xl text-mint">
                  {mining.netDistributableDoge.toFixed(4)} <span className="text-sm">DOGE</span>
                </p>
              </div>
            </div>
            <Link href="/pool" className="mt-4 inline-block text-xs font-bold uppercase tracking-wide text-gold hover:underline">
              {t("landing.poolLinkLabel")}
            </Link>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-line bg-panel/40">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gold">▸ {t("landing.howItWorksHeading")}</h3>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {STEP_KEYS.map((s) => (
                <div key={s.n} className="game-panel hud-corner rounded-2xl p-6">
                  <span className="text-glow-gold text-2xl font-black text-gold">{s.n}</span>
                  <h4 className="mt-3 text-base font-bold">{t(s.titleKey)}</h4>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{t(s.bodyKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trust / feature row */}
        <section className="border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-mint">✓ {t("landing.builtHeading")}</h3>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {FEATURE_KEYS.map((f) => (
                <div key={f.labelKey} className="game-panel hud-corner rounded-2xl border-mint/15 p-6">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-mint" style={{ boxShadow: "0 0 10px rgba(45,212,167,0.8)" }} />
                    <p className="text-sm font-bold">{t(f.labelKey)}</p>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{t(f.bodyKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="flex flex-col items-center justify-center gap-2 border-t border-line px-5 py-6 text-center text-[11px] text-muted sm:px-8">
        <SocialLinks />
        <div className="flex items-center gap-1.5">
          <span>{t("common.disclaimer")}</span>
          <InfoTooltip text={t("landing.disclaimerTooltip")} />
        </div>
      </footer>
    </div>
  );
}
