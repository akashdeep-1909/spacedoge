"use client";

import { useState, type MouseEvent as ReactMouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
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
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { WaitlistModal } from "@/components/WaitlistModal";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { Reveal, TiltCard, EASE, Starfield } from "@/components/motionPrimitives";

interface MiningStats {
  epochDateLabel: string;
  contractedHashrate: number;
  observedHashrate: number;
  totalEffectiveMp: number;
  netDistributableDoge: number;
}

interface PlatformStats {
  walletCount: number;
  matchCount: number;
  activeMinerCount: number;
  totalHashrateGhs: number;
  lifetimeDogeDistributed: number;
}

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

export function LandingContent({ mining, platformStats }: { mining: MiningStats; platformStats: PlatformStats }) {
  const { t } = useLocale();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [waitlistSource, setWaitlistSource] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  // Mouse-parallax on the hero mascot — a couple of degrees of tilt
  // toward the cursor, nothing that fights readability of the text
  // beside it.
  const heroTiltX = useMotionValue(0);
  const heroTiltY = useMotionValue(0);
  const heroSpringX = useSpring(heroTiltX, { stiffness: 60, damping: 18 });
  const heroSpringY = useSpring(heroTiltY, { stiffness: 60, damping: 18 });
  function handleHeroMouseMove(e: ReactMouseEvent<HTMLDivElement>) {
    if (reduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    heroTiltX.set(py * 10);
    heroTiltY.set(px * -10);
  }
  function handleHeroMouseLeave() {
    heroTiltX.set(0);
    heroTiltY.set(0);
  }

  return (
    <div className="ld-root flex min-h-full flex-1 flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex-1">
        {/* -------------------------------------------------------- Hero */}
        <section className="relative overflow-hidden" onMouseMove={handleHeroMouseMove} onMouseLeave={handleHeroMouseLeave}>
          <div aria-hidden className="ld-aurora -z-10">
            <span
              style={{ left: "8%", top: "-10%", width: 480, height: 480, background: "rgba(201,162,39,0.25)", animation: "aurora-drift-1 16s ease-in-out infinite" }}
            />
            <span
              style={{ right: "4%", top: "6%", width: 420, height: 420, background: "rgba(34,225,147,0.18)", animation: "aurora-drift-2 20s ease-in-out infinite" }}
            />
            <span
              style={{ left: "30%", bottom: "-16%", width: 460, height: 460, background: "rgba(167,139,250,0.14)", animation: "aurora-drift-3 18s ease-in-out infinite" }}
            />
          </div>
          <Starfield className="-z-10" />
          <div aria-hidden className="pointer-events-none absolute inset-0 select-none overflow-hidden">
            <span className="absolute left-[6%] top-[18%] text-4xl sm:text-5xl" style={{ animation: "float-coin 3.4s ease-in-out infinite" }}>🪙</span>
            <span className="absolute right-[2%] top-[30%] text-3xl sm:right-[8%] sm:top-[24%] sm:text-4xl" style={{ animation: "float-coin-alt 2.9s ease-in-out infinite", animationDelay: "0.4s" }}>🪙</span>
            <span className="absolute left-[14%] bottom-[16%] text-3xl sm:text-4xl" style={{ animation: "float-coin 3.1s ease-in-out infinite", animationDelay: "1.1s" }}>💎</span>
            <span className="absolute right-[14%] bottom-[20%] text-4xl sm:text-5xl" style={{ animation: "float-coin-alt 3.7s ease-in-out infinite", animationDelay: "0.7s" }}>🪙</span>
            <span className="absolute right-[9%] top-[48%] text-xl sm:text-2xl" style={{ animation: "twinkle 2s ease-in-out infinite", animationDelay: "0.5s" }}>🚀</span>
            <span className="absolute left-[3%] bottom-[36%] text-2xl sm:text-3xl opacity-80" style={{ animation: "spin-slow 12s linear infinite" }}>🌕</span>
          </div>

          <div className="ld-container relative grid items-center gap-[26px] py-9 sm:py-[72px] lg:min-h-[680px] lg:grid-cols-2">
            <div className="flex flex-col items-start gap-4 text-left sm:gap-5">
              <motion.span
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="ld-eyebrow text-mint"
              >
                {t("landing.heroEyebrow")}
              </motion.span>
              <motion.h2
                initial={{ clipPath: "inset(0 100% 0 0)", opacity: 0 }}
                animate={{ clipPath: "inset(0 0% 0 0)", opacity: 1 }}
                transition={{ duration: reduceMotion ? 0.2 : 0.9, delay: 0.1, ease: EASE }}
                className="text-glow-gold text-balance max-w-[600px] text-[clamp(1.875rem,4vw,3.25rem)] font-extrabold leading-[1.08] tracking-[-0.03em]"
              >
                {t("landing.heroTitle")}
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.35, ease: EASE }}
                className="max-w-[560px] text-pretty text-[15px] leading-relaxed text-muted"
              >
                {t("landing.heroSubtitle")}
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.45, ease: EASE }}
                className="mt-[14px] mb-[4px] flex flex-wrap items-center gap-[12px]"
              >
                {/* No standalone Connect Wallet CTA here — the header
                    above is `sticky top-0` (always on screen regardless
                    of scroll position) and already has one. A second
                    live ConnectWalletButton instance here was pure
                    duplication, and a harmful one: once a connection was
                    actually in progress, BOTH instances rendered their
                    own full address-pill/Check-Wallet/disconnect row
                    simultaneously, overflowing narrow mobile viewports
                    (confirmed live). */}
                <a
                  href="#coin-rush"
                  className="btn-game hud-corner text-sm font-bold uppercase tracking-wide"
                >
                  {t("landing.exploreEcosystemButton")}
                </a>
              </motion.div>
              <EnterDashboard />
              <motion.div
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.6 } } }}
                className="mt-3 flex flex-wrap gap-[8px]"
              >
                {HERO_BADGES.map(({ Icon, key }) => (
                  <motion.span
                    key={key}
                    variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                    transition={{ duration: 0.4, ease: EASE }}
                    className="flex items-center gap-[6px] rounded-[10px] border border-line bg-panel px-[10px] py-[7px] text-[12px] font-semibold text-muted"
                  >
                    <Icon size={14} className="shrink-0 text-gold" />
                    {t(key)}
                  </motion.span>
                ))}
              </motion.div>
            </div>

            <div className="relative mx-auto hidden aspect-square w-full max-w-[560px] items-center justify-center lg:flex">
              <div
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{ background: "radial-gradient(closest-side, rgba(201,162,39,0.25), transparent 75%)" }}
              />
              <div
                aria-hidden
                className="absolute inset-[6%] rounded-full border border-dashed"
                style={{ borderColor: "rgba(255,181,22,0.25)", animation: "ld-orbit-spin 40s linear infinite" }}
              />
              <div
                aria-hidden
                className="absolute inset-[14%] rounded-full border border-dashed"
                style={{ borderColor: "rgba(34,225,147,0.2)", animation: "ld-orbit-spin-rev 55s linear infinite" }}
              />
              <motion.div style={{ rotateX: heroSpringX, rotateY: heroSpringY, transformPerspective: 1000 }}>
                <Image
                  src="/SpaceDOGE-icon.png"
                  alt="Space DOGE"
                  width={360}
                  height={360}
                  priority
                  className="relative shrink-0 drop-shadow-2xl"
                  style={{ animation: "float-coin 6s ease-in-out infinite" }}
                />
              </motion.div>

              {/* Live proof-of-hash chip — real data (same numbers as the
                  Proof of Hash section below), not a decorative fake stat. */}
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, delay: 1, ease: EASE }}
                className="ld-glass absolute -bottom-2 inset-x-4 mx-auto flex w-fit max-w-[92%] items-center justify-center gap-2 px-4 py-2.5 text-center text-xs font-bold"
                style={{ animation: "float-coin-alt 5s ease-in-out infinite" }}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mint" style={{ animation: "led-pulse 1.6s ease-in-out infinite" }} />
                <span className="text-mint">{mining.netDistributableDoge.toFixed(2)} DOGE</span>
                <span className="text-muted">{t("landing.netOutputSettled")}</span>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------- Coin Rush / DOGE Mining */}
        <section className="border-t border-line bg-panel/40" id="coin-rush">
          <div className="ld-container py-9 sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-mint">{t("landing.ecosystemEyebrow")}</span>
              <h3 className="ld-h2 mt-2">{t("landing.ecosystemHeading")}</h3>
            </Reveal>

            <div className="mt-[28px] grid gap-[22px] lg:grid-cols-2" style={{ perspective: 1200 }}>
              <Reveal delay={0.05}>
                <TiltCard glow="rgba(167,139,250,0.22)" className="h-full p-8" style={{ borderColor: "rgba(168,92,255,0.46)" }}>
                  <span
                    className="grid h-11 w-11 place-items-center rounded-xl text-xl"
                    style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}
                  >
                    <Gamepad2 size={22} />
                  </span>
                  <h4 className="ld-h3 mt-4 uppercase tracking-wide">{t("landing.coinRushLabel")}</h4>
                  <p className="mt-1 text-sm text-muted">{t("landing.coinRushTagline")}</p>
                  <ul className="mt-4 flex flex-col gap-2 text-sm text-muted">
                    {(["landing.coinRushBullet1", "landing.coinRushBullet2", "landing.coinRushBullet3", "landing.coinRushBullet4", "landing.coinRushBullet5"] as const).map((k) => (
                      <li key={k} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#a78bfa" }} />
                        {t(k)}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/coin-rush"
                    className="ld-btn-flat group mt-6 inline-flex items-center gap-1.5 uppercase text-black shadow-[0_4px_12px_rgba(0,0,0,0.25)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.3)]"
                    style={{ background: "linear-gradient(180deg, #b898fc, #9b6ef0)" }}
                  >
                    {t("landing.playCoinRushButton")}
                    <ArrowRight size={14} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                  </Link>
                </TiltCard>
              </Reveal>

              <Reveal delay={0.12}>
                <TiltCard id="doge-mining" glow="rgba(34,225,147,0.22)" className="h-full p-8" style={{ borderColor: "rgba(34,225,147,0.38)" }}>
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-mint-soft text-mint">
                    <Zap size={22} />
                  </span>
                  <h4 className="ld-h3 mt-4 uppercase tracking-wide">{t("landing.dogeMiningLabel")}</h4>
                  <p className="mt-1 text-sm text-muted">{t("landing.dogeMiningTagline")}</p>
                  <ul className="mt-4 flex flex-col gap-2 text-sm text-muted">
                    {(["landing.dogeMiningBullet1", "landing.dogeMiningBullet2", "landing.dogeMiningBullet3", "landing.dogeMiningBullet4", "landing.dogeMiningBullet5"] as const).map((k) => (
                      <li key={k} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />
                        {t(k)}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/doge-mining"
                    className="ld-btn-flat group mt-6 inline-flex items-center gap-1.5 uppercase text-black shadow-[0_4px_12px_rgba(0,0,0,0.25)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.3)]"
                    style={{ background: "linear-gradient(180deg, #4eeead, #1fb87e)" }}
                  >
                    {t("landing.exploreDogeMiningButton")}
                    <ArrowRight size={14} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                  </Link>
                </TiltCard>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ Your Journey */}
        <section className="border-t border-line" id="how-it-works">
          <div className="ld-container py-9 text-center sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-gold">{t("landing.journeyEyebrow")}</span>
              <h3 className="ld-h2 mt-2">{t("landing.journeyHeading")}</h3>
            </Reveal>

            <div className="relative mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <motion.div
                aria-hidden
                className="absolute left-0 right-0 top-11 hidden origin-left border-t border-dashed border-line lg:block"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true, margin: "-10% 0px" }}
                transition={{ duration: 1, ease: EASE }}
              />
              {JOURNEY_STEPS.map((s, i) => (
                <Reveal key={s.n} delay={i * 0.1} y={20}>
                  <div className="relative flex flex-col items-center gap-3 px-2">
                    <motion.span
                      whileHover={{ scale: 1.06 }}
                      className={`relative grid h-[92px] w-[92px] shrink-0 place-items-center rounded-full border-2 bg-background text-lg font-black ${
                        s.tone === "mint" ? "border-mint text-mint" : s.tone === "gold" ? "border-gold text-gold" : "border-[#a78bfa]"
                      }`}
                      style={s.tone === "purple" ? { color: "#a78bfa" } : undefined}
                    >
                      <s.Icon size={30} />
                    </motion.span>
                    <span className="text-2xl font-black text-muted">{s.n}</span>
                    <h4 className="text-base font-bold">{t(s.titleKey)}</h4>
                    <p className="text-sm leading-relaxed text-muted">{t(s.bodyKey)}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ Transparency */}
        <section className="border-t border-line bg-panel/40">
          <div className="ld-container py-9 sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-mint">{t("landing.transparencyEyebrow")}</span>
            </Reveal>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {TRANSPARENCY_BADGES.map((b, i) => (
                <Reveal key={b.titleKey} delay={i * 0.08}>
                  <motion.div
                    whileHover={{ y: -4 }}
                    className="ld-glass h-full p-6 transition-shadow duration-300 hover:shadow-[0_0_40px_rgba(34,225,147,0.12)]"
                    style={{ borderColor: "rgba(34,225,147,0.15)" }}
                  >
                    <span className="grid h-[54px] w-[54px] place-items-center rounded-[14px] bg-mint-soft text-mint">
                      <b.Icon size={19} />
                    </span>
                    <h4 className="mt-3 text-sm font-bold">{t(b.titleKey)}</h4>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">{t(b.bodyKey)}</p>
                  </motion.div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------- Referral Network */}
        <section className="border-t border-line" id="referral-network">
          <div className="ld-container py-9 sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow" style={{ color: "#a78bfa" }}>
                {t("landing.referralEyebrow")}
              </span>
            </Reveal>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {REFERRAL_BADGES.map((b, i) => (
                <Reveal key={b.titleKey} delay={i * 0.08}>
                  <motion.div
                    whileHover={{ y: -4 }}
                    className="ld-glass h-full p-[28px] transition-shadow duration-300 hover:shadow-[0_0_40px_rgba(167,139,250,0.12)]"
                    style={{ borderColor: "rgba(167,139,250,0.2)" }}
                  >
                    <span className="grid h-[54px] w-[54px] place-items-center rounded-[14px]" style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>
                      <b.Icon size={22} />
                    </span>
                    <h4 className="mt-3 text-sm font-bold">{t(b.titleKey)}</h4>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">{t(b.bodyKey)}</p>
                  </motion.div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- FAQ */}
        <section className="border-t border-line" id="faq">
          <div className="ld-container py-9 sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-gold">{t("landing.faqEyebrow")}</span>
            </Reveal>
            <div className="mt-6 grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
              <div className="flex flex-col gap-2">
                {FAQ_KEYS.map((f, i) => {
                  const open = openFaq === i;
                  return (
                    <Reveal key={f.qKey} delay={i * 0.05} y={16}>
                      <div className="ld-glass overflow-hidden">
                        <button
                          onClick={() => setOpenFaq(open ? null : i)}
                          className="flex w-full items-center justify-between gap-3 px-[18px] py-[15px] text-left text-sm font-semibold"
                          aria-expanded={open}
                        >
                          {t(f.qKey)}
                          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25, ease: EASE }} className="shrink-0 text-muted">
                            <ChevronDown size={16} />
                          </motion.span>
                        </button>
                        <div className={`ld-faq-panel ${open ? "open" : ""}`} aria-hidden={!open}>
                          <div>
                            <p className="px-[18px] pb-4 text-sm leading-relaxed text-muted">{t(f.aKey)}</p>
                          </div>
                        </div>
                      </div>
                    </Reveal>
                  );
                })}
              </div>

              <Reveal delay={0.2}>
                <div className="ld-glass flex min-h-[280px] flex-col items-center justify-center gap-4 p-[30px] text-center">
                  <span className="text-5xl" style={{ animation: "float-coin 3.6s ease-in-out infinite" }}>🐕‍🦺</span>
                  <p className="text-sm font-bold">{t("landing.faqMoreQuestionsHeading")}</p>
                  <p className="text-xs text-muted">{t("landing.faqMoreQuestionsBody")}</p>
                  <a
                    href="mailto:support@spacedoge.games"
                    className="btn-game-outline text-xs font-bold uppercase tracking-wide"
                  >
                    {t("landing.faqViewAllButton")}
                  </a>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- Final CTA */}
        <section className="relative overflow-hidden border-t border-line bg-panel/40">
          <div aria-hidden className="ld-aurora">
            <span style={{ left: "10%", top: "-30%", width: 420, height: 420, background: "rgba(255,181,22,0.16)", animation: "aurora-drift-1 14s ease-in-out infinite" }} />
            <span style={{ right: "8%", bottom: "-30%", width: 380, height: 380, background: "rgba(34,225,147,0.12)", animation: "aurora-drift-2 17s ease-in-out infinite" }} />
          </div>
          <div className="ld-container relative py-9 sm:py-[72px]">
            <Reveal>
              <div className="ld-glass glow-gold flex min-h-[220px] flex-col items-center justify-center gap-5 p-[42px] text-center">
                <motion.div
                  animate={{ y: [0, -8, 0], rotate: [0, -4, 4, 0] }}
                  transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Rocket size={36} className="text-gold" />
                </motion.div>
                <h3 className="text-glow-gold ld-h2">{t("landing.finalCtaHeading")}</h3>
                <p className="max-w-xl text-sm text-muted">{t("landing.finalCtaBody")}</p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <ConnectWalletButton />
                  <button
                    type="button"
                    onClick={() => setWaitlistSource("landing_final_cta")}
                    className="ld-btn-flat ld-btn-ghost group inline-flex items-center gap-1.5 border bg-panel-2 text-xs font-bold uppercase tracking-wide"
                  >
                    {t("landing.joinWaitlistButton")}
                    <ArrowRight size={13} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                  </button>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {waitlistSource && <WaitlistModal source={waitlistSource} onClose={() => setWaitlistSource(null)} />}

      <SiteFooter />
    </div>
  );
}
