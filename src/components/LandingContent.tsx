"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Shield,
  FileText,
  Gamepad2,
  Zap,
  Wallet,
  Coins,
  Users,
  ChevronDown,
  Rocket,
  ArrowRight,
} from "lucide-react";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { EnterDashboard } from "@/components/EnterDashboard";
import { InfoTooltip } from "@/components/InfoTooltip";
import { SocialLinks } from "@/components/SocialLinks";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { TranslationKey } from "@/lib/i18n/LocaleProvider";

interface MiningStats {
  epochDateLabel: string;
  contractedHashrate: number;
  observedHashrate: number;
  totalEffectiveMp: number;
  netDistributableDoge: number;
}

const NAV_LINKS = [
  { href: "#how-it-works", key: "landing.navHowItWorks" as const },
  { href: "#coin-rush", key: "landing.navCoinRush" as const },
  { href: "#doge-mining", key: "landing.navDogeMining" as const },
  { href: "/pool", key: "landing.navProofOfHash" as const },
  { href: "#referral-network", key: "landing.navReferralNetwork" as const },
  { href: "#faq", key: "landing.navFaq" as const },
] as const;

const HERO_BADGES = [
  { Icon: Shield, key: "landing.heroBadgeWallet" as const },
  { Icon: FileText, key: "landing.heroBadgeAuditable" as const },
  { Icon: Zap, key: "landing.heroBadgeMining" as const },
] as const;

const JOURNEY_STEPS = [
  { n: "01", Icon: Wallet, tone: "mint", titleKey: "landing.journey1Title" as const, bodyKey: "landing.journey1Body" as const },
  { n: "02", Icon: Gamepad2, tone: "purple", titleKey: "landing.journey2Title" as const, bodyKey: "landing.journey2Body" as const },
  { n: "03", Icon: Coins, tone: "mint", titleKey: "landing.journey3Title" as const, bodyKey: "landing.journey3Body" as const },
  { n: "04", Icon: Zap, tone: "gold", titleKey: "landing.journey4Title" as const, bodyKey: "landing.journey4Body" as const },
] as const;

const TRANSPARENCY_BADGES = [
  { Icon: Shield, titleKey: "landing.transparency1Title" as const, bodyKey: "landing.transparency1Body" as const },
  { Icon: FileText, titleKey: "landing.transparency2Title" as const, bodyKey: "landing.transparency2Body" as const },
  { Icon: Gamepad2, titleKey: "landing.transparency3Title" as const, bodyKey: "landing.transparency3Body" as const },
  { Icon: Zap, titleKey: "landing.transparency4Title" as const, bodyKey: "landing.transparency4Body" as const },
] as const;

const REFERRAL_BADGES = [
  { Icon: Users, titleKey: "landing.referral1Title" as const, bodyKey: "landing.referral1Body" as const },
  { Icon: Users, titleKey: "landing.referral2Title" as const, bodyKey: "landing.referral2Body" as const },
  { Icon: FileText, titleKey: "landing.referral3Title" as const, bodyKey: "landing.referral3Body" as const },
] as const;

const FAQ_KEYS = [
  { qKey: "landing.faq1Q" as const, aKey: "landing.faq1A" as const },
  { qKey: "landing.faq2Q" as const, aKey: "landing.faq2A" as const },
  { qKey: "landing.faq3Q" as const, aKey: "landing.faq3A" as const },
  { qKey: "landing.faq4Q" as const, aKey: "landing.faq4A" as const },
  { qKey: "landing.faq5Q" as const, aKey: "landing.faq5A" as const },
  { qKey: "landing.faq6Q" as const, aKey: "landing.faq6A" as const },
] as const;

// Footer link columns. `href: null` entries have no real destination
// yet (no standalone page exists for them today) — rendered as
// visually-present but inert text rather than a live link, so nothing
// 404s. Anything that already maps to a real route/section uses that.
const FOOTER_COLUMNS: { headingKey: TranslationKey; links: { labelKey: TranslationKey; href: string | null }[] }[] = [
  {
    headingKey: "landing.footerEcosystemHeading",
    links: [
      { labelKey: "landing.navCoinRush", href: "#coin-rush" },
      { labelKey: "landing.navDogeMining", href: "#doge-mining" },
      { labelKey: "landing.navProofOfHash", href: "/pool" },
      { labelKey: "landing.navReferralNetwork", href: "#referral-network" },
    ],
  },
  {
    headingKey: "landing.footerResourcesHeading",
    links: [
      { labelKey: "landing.navHowItWorks", href: "#how-it-works" },
      { labelKey: "landing.footerMissionControl", href: null },
      { labelKey: "landing.footerDailyRewards", href: null },
      { labelKey: "landing.footerDocumentation", href: null },
      { labelKey: "landing.footerBlog", href: null },
    ],
  },
  {
    headingKey: "landing.footerCompanyHeading",
    links: [
      { labelKey: "landing.footerAboutUs", href: null },
      { labelKey: "landing.footerCareers", href: null },
      { labelKey: "landing.footerPartners", href: null },
      { labelKey: "landing.footerMediaKit", href: null },
      { labelKey: "landing.footerContactUs", href: null },
    ],
  },
  {
    headingKey: "landing.footerLegalHeading",
    links: [
      { labelKey: "landing.footerTerms", href: null },
      { labelKey: "landing.footerPrivacy", href: null },
      { labelKey: "landing.footerRisk", href: null },
      { labelKey: "landing.footerRefund", href: null },
      { labelKey: "landing.footerCookie", href: null },
    ],
  },
];

export function LandingContent({ mining }: { mining: MiningStats }) {
  const { t } = useLocale();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="flex min-h-full flex-1 flex-col overflow-x-hidden bg-background text-foreground">
      {/* ---------------------------------------------------------- Header */}
      <header id="top" className="sticky top-0 z-20 border-b border-gold/15 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="#" className="flex shrink-0 items-center gap-3">
            <Image src="/SpaceDOGE-icon.png" alt="SPACE DOGE" width={48} height={48} priority className="shrink-0 rounded-full" />
            <div className="hidden min-w-0 sm:block">
              <h1 className="text-sm font-black uppercase tracking-widest">{t("landing.brandName")}</h1>
              <p className="text-[11px] text-muted">{t("landing.tagline")}</p>
            </div>
          </Link>
          <nav className="hidden items-center gap-5 text-xs font-semibold uppercase tracking-wide text-muted lg:flex">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="transition hover:text-gold">
                {t(l.key)}
              </a>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher />
            <ConnectWalletButton />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* -------------------------------------------------------- Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(60% 50% at 50% 0%, rgba(201,162,39,0.22) 0%, transparent 65%), radial-gradient(45% 40% at 80% 20%, rgba(45,212,167,0.16) 0%, transparent 70%), radial-gradient(35% 35% at 10% 80%, rgba(45,212,167,0.10) 0%, transparent 70%)",
            }}
          />
          <div aria-hidden className="pointer-events-none absolute inset-0 select-none overflow-hidden">
            <span className="absolute left-[6%] top-[18%] text-4xl sm:text-5xl" style={{ animation: "float-coin 3.4s ease-in-out infinite" }}>🪙</span>
            <span className="absolute right-[2%] top-[30%] text-3xl sm:right-[8%] sm:top-[24%] sm:text-4xl" style={{ animation: "float-coin-alt 2.9s ease-in-out infinite", animationDelay: "0.4s" }}>🪙</span>
            <span className="absolute left-[14%] bottom-[16%] text-3xl sm:text-4xl" style={{ animation: "float-coin 3.1s ease-in-out infinite", animationDelay: "1.1s" }}>💎</span>
            <span className="absolute right-[14%] bottom-[20%] text-4xl sm:text-5xl" style={{ animation: "float-coin-alt 3.7s ease-in-out infinite", animationDelay: "0.7s" }}>🪙</span>
            <span className="absolute left-[4%] top-[6%] text-xl sm:left-[26%] sm:top-[10%] sm:text-2xl" style={{ animation: "twinkle 2.2s ease-in-out infinite", animationDelay: "0.2s" }}>✨</span>
            <span className="absolute right-[3%] top-[4%] text-lg sm:right-[24%] sm:top-[14%] sm:text-xl" style={{ animation: "twinkle 1.8s ease-in-out infinite", animationDelay: "0.9s" }}>✨</span>
            <span className="absolute left-[9%] top-[52%] text-lg sm:text-xl" style={{ animation: "twinkle 2.5s ease-in-out infinite", animationDelay: "1.4s" }}>✨</span>
            <span className="absolute right-[9%] top-[48%] text-xl sm:text-2xl" style={{ animation: "twinkle 2s ease-in-out infinite", animationDelay: "0.5s" }}>🚀</span>
            <span className="absolute left-[3%] bottom-[36%] text-2xl sm:text-3xl opacity-80" style={{ animation: "spin-slow 12s linear infinite" }}>🌕</span>
          </div>

          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-2">
            <div className="flex flex-col items-start gap-5 text-left">
              <span className="text-xs font-black uppercase tracking-[0.25em] text-mint">{t("landing.heroEyebrow")}</span>
              <h2 className="text-glow-gold text-balance text-4xl font-black leading-[1.1] tracking-tight sm:text-5xl">
                {t("landing.heroTitle")}
              </h2>
              <p className="max-w-xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
                {t("landing.heroSubtitle")}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                {/* Not a second ConnectWalletButton instance on purpose —
                    the header above is `sticky top-0` (always on screen
                    regardless of scroll position), so a second live copy
                    of that same stateful component here was pure
                    duplication, and a harmful one: once a connection was
                    actually in progress, BOTH instances rendered their
                    own full address-pill/Check-Wallet/disconnect row
                    simultaneously, overflowing narrow mobile viewports
                    (confirmed live). This just scrolls up to the one real
                    button instead. */}
                <a href="#top" className="btn-game hud-corner rounded-full px-4 py-2 text-sm">
                  {t("common.connectWallet")}
                </a>
                <a href="#coin-rush" className="btn-game-outline hud-corner rounded-full px-4 py-2 text-sm font-bold uppercase tracking-wide">
                  {t("landing.exploreEcosystemButton")}
                </a>
              </div>
              <EnterDashboard />
              <a
                href="#faq"
                className="rounded-full border border-line bg-panel px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted transition hover:border-gold/40 hover:text-gold"
              >
                {t("landing.joinWaitlistButton")}
              </a>
              <div className="mt-2 flex flex-wrap gap-2">
                {HERO_BADGES.map(({ Icon, key }) => (
                  <span
                    key={key}
                    className="flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1.5 text-[11px] font-semibold text-muted"
                  >
                    <Icon size={13} className="shrink-0 text-mint" />
                    {t(key)}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative mx-auto hidden aspect-square w-full max-w-md items-center justify-center lg:flex">
              <div
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{ background: "radial-gradient(closest-side, rgba(201,162,39,0.25), transparent 75%)" }}
              />
              <Image
                src="/SpaceDOGE-icon.png"
                alt="Space DOGE"
                width={360}
                height={360}
                priority
                className="relative shrink-0 drop-shadow-2xl"
                style={{ animation: "float-coin 6s ease-in-out infinite" }}
              />
            </div>
          </div>
        </section>

        {/* ---------------------------------------- Coin Rush / DOGE Mining */}
        <section className="border-t border-line bg-panel/40" id="coin-rush">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
            <span className="text-xs font-black uppercase tracking-[0.25em] text-mint">{t("landing.ecosystemEyebrow")}</span>
            <h3 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{t("landing.ecosystemHeading")}</h3>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="game-panel hud-corner rounded-2xl border-l-4 p-7" style={{ borderLeftColor: "#a78bfa" }}>
                <span
                  className="grid h-11 w-11 place-items-center rounded-xl text-xl"
                  style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}
                >
                  <Gamepad2 size={22} />
                </span>
                <h4 className="mt-4 text-lg font-black uppercase tracking-wide">{t("landing.coinRushLabel")}</h4>
                <p className="mt-1 text-sm text-muted">{t("landing.coinRushTagline")}</p>
                <ul className="mt-4 flex flex-col gap-2 text-sm text-muted">
                  {(["landing.coinRushBullet1", "landing.coinRushBullet2", "landing.coinRushBullet3", "landing.coinRushBullet4", "landing.coinRushBullet5"] as const).map((k) => (
                    <li key={k} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#a78bfa" }} />
                      {t(k)}
                    </li>
                  ))}
                </ul>
                <a
                  href="#how-it-works"
                  className="mt-6 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-black uppercase tracking-wide text-black"
                  style={{ background: "#a78bfa" }}
                >
                  {t("landing.playCoinRushButton")} <ArrowRight size={14} />
                </a>
              </div>

              <div id="doge-mining" className="game-panel hud-corner rounded-2xl border-l-4 border-mint/60 p-7">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-mint-soft text-mint">
                  <Zap size={22} />
                </span>
                <h4 className="mt-4 text-lg font-black uppercase tracking-wide">{t("landing.dogeMiningLabel")}</h4>
                <p className="mt-1 text-sm text-muted">{t("landing.dogeMiningTagline")}</p>
                <ul className="mt-4 flex flex-col gap-2 text-sm text-muted">
                  {(["landing.dogeMiningBullet1", "landing.dogeMiningBullet2", "landing.dogeMiningBullet3", "landing.dogeMiningBullet4", "landing.dogeMiningBullet5"] as const).map((k) => (
                    <li key={k} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />
                      {t(k)}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 flex items-end justify-between gap-4">
                  <a href="#how-it-works" className="btn-game inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs">
                    {t("landing.exploreDogeMiningButton")} <ArrowRight size={14} />
                  </a>
                  <Image
                    src="/dogemine-badge.png"
                    alt=""
                    width={72}
                    height={72}
                    className="hidden shrink-0 rounded-xl opacity-90 sm:block"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ Your Journey */}
        <section className="border-t border-line" id="how-it-works">
          <div className="mx-auto max-w-7xl px-5 py-16 text-center sm:px-8">
            <span className="text-xs font-black uppercase tracking-[0.25em] text-gold">{t("landing.journeyEyebrow")}</span>
            <h3 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{t("landing.journeyHeading")}</h3>

            <div className="relative mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div aria-hidden className="absolute left-0 right-0 top-9 hidden border-t border-dashed border-line lg:block" />
              {JOURNEY_STEPS.map((s) => (
                <div key={s.n} className="relative flex flex-col items-center gap-3 px-2">
                  <span
                    className={`relative grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 bg-background text-lg font-black ${
                      s.tone === "mint" ? "border-mint text-mint" : s.tone === "gold" ? "border-gold text-gold" : "border-[#a78bfa]"
                    }`}
                    style={s.tone === "purple" ? { color: "#a78bfa" } : undefined}
                  >
                    <s.Icon size={24} />
                  </span>
                  <span className="text-xs font-black text-muted">{s.n}</span>
                  <h4 className="text-sm font-bold">{t(s.titleKey)}</h4>
                  <p className="text-xs leading-relaxed text-muted">{t(s.bodyKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ Transparency */}
        <section className="border-t border-line bg-panel/40">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
            <span className="text-xs font-black uppercase tracking-[0.25em] text-mint">{t("landing.transparencyEyebrow")}</span>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {TRANSPARENCY_BADGES.map((b) => (
                <div key={b.titleKey} className="game-panel hud-corner rounded-2xl border-mint/15 p-6">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-mint-soft text-mint">
                    <b.Icon size={19} />
                  </span>
                  <h4 className="mt-3 text-sm font-bold">{t(b.titleKey)}</h4>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">{t(b.bodyKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------- Referral Network */}
        <section className="border-t border-line" id="referral-network">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
            <span className="text-xs font-black uppercase tracking-[0.25em]" style={{ color: "#a78bfa" }}>
              {t("landing.referralEyebrow")}
            </span>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {REFERRAL_BADGES.map((b) => (
                <div key={b.titleKey} className="game-panel hud-corner rounded-2xl p-6" style={{ borderColor: "rgba(167,139,250,0.2)" }}>
                  <span className="grid h-10 w-10 place-items-center rounded-lg" style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>
                    <b.Icon size={19} />
                  </span>
                  <h4 className="mt-3 text-sm font-bold">{t(b.titleKey)}</h4>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">{t(b.bodyKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------ Proof of Hash (real data) */}
        <section className="border-t border-line bg-panel/40" id="proof-of-hash">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
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
                <p className="stat-value mt-1.5 text-xl">{mining.totalEffectiveMp.toLocaleString()}</p>
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

        {/* -------------------------------------------------------- FAQ */}
        <section className="border-t border-line" id="faq">
          <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8">
            <span className="text-xs font-black uppercase tracking-[0.25em] text-gold">{t("landing.faqEyebrow")}</span>
            <div className="mt-6 grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
              <div className="flex flex-col gap-2">
                {FAQ_KEYS.map((f, i) => {
                  const open = openFaq === i;
                  return (
                    <div key={f.qKey} className="game-panel hud-corner rounded-xl">
                      <button
                        onClick={() => setOpenFaq(open ? null : i)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-semibold"
                        aria-expanded={open}
                      >
                        {t(f.qKey)}
                        <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
                      </button>
                      {open && <p className="px-4 pb-4 text-sm leading-relaxed text-muted">{t(f.aKey)}</p>}
                    </div>
                  );
                })}
              </div>

              <div className="game-panel hud-corner flex flex-col items-center gap-4 rounded-2xl p-7 text-center">
                <span className="text-5xl">🐕‍🦺</span>
                <p className="text-sm font-bold">{t("landing.faqMoreQuestionsHeading")}</p>
                <p className="text-xs text-muted">{t("landing.faqMoreQuestionsBody")}</p>
                <a
                  href="mailto:support@spacedoge.games"
                  className="btn-game-outline rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wide"
                >
                  {t("landing.faqViewAllButton")}
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- Final CTA */}
        <section className="border-t border-line bg-panel/40">
          <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8">
            <div className="game-panel hud-corner glow-gold flex flex-col items-center gap-5 rounded-2xl p-10 text-center">
              <Rocket size={36} className="text-gold" style={{ animation: "float-coin 3s ease-in-out infinite" }} />
              <h3 className="text-glow-gold text-2xl font-black tracking-tight sm:text-3xl">{t("landing.finalCtaHeading")}</h3>
              <p className="max-w-xl text-sm text-muted">{t("landing.finalCtaBody")}</p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <ConnectWalletButton />
                <a href="#faq" className="rounded-full border border-line bg-panel px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted hover:border-gold/40 hover:text-gold">
                  {t("landing.joinWaitlistButton")}
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* -------------------------------------------------------- Footer */}
      <footer className="border-t border-line px-5 py-12 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-10">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2.5">
                <Image src="/SpaceDOGE-icon.png" alt="SPACE DOGE" width={36} height={36} className="rounded-full" />
                <div>
                  <p className="text-xs font-black uppercase tracking-widest">{t("landing.brandName")}</p>
                  <p className="text-[10px] text-muted">{t("landing.tagline")}</p>
                </div>
              </div>
              <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted">{t("landing.footerBrandBlurb")}</p>
            </div>
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.headingKey}>
                <h5 className="text-[11px] font-black uppercase tracking-widest text-gold">{t(col.headingKey)}</h5>
                <ul className="mt-3 flex flex-col gap-2 text-xs text-muted">
                  {col.links.map((l) =>
                    l.href ? (
                      <li key={l.labelKey}>
                        <a href={l.href} className="transition hover:text-gold">
                          {t(l.labelKey)}
                        </a>
                      </li>
                    ) : (
                      <li key={l.labelKey} className="opacity-60">
                        {t(l.labelKey)}
                      </li>
                    )
                  )}
                </ul>
              </div>
            ))}
            <div>
              <h5 className="text-[11px] font-black uppercase tracking-widest text-gold">{t("landing.footerCommunityHeading")}</h5>
              <div className="mt-3">
                <SocialLinks />
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 border-t border-line pt-6 text-center text-[11px] text-muted">
            <div className="flex items-center gap-1.5">
              <span>{t("common.disclaimer")}</span>
              <InfoTooltip text={t("landing.disclaimerTooltip")} />
            </div>
            <p>{t("landing.footerCopyright")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
