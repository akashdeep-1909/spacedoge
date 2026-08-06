"use client";

import { useState, type MouseEvent as ReactMouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import {
  Wallet,
  Gamepad2,
  Coins,
  Pickaxe,
  Zap,
  LineChart,
  ArrowLeftRight,
  Shield,
  FileText,
  Scale,
  Users,
  ArrowRight,
} from "lucide-react";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { Reveal, StatCounter, TiltCard, EASE, Starfield } from "@/components/motionPrimitives";

interface PlatformStats {
  walletCount: number;
  matchCount: number;
  activeMinerCount: number;
  totalHashrateGhs: number;
  lifetimeDogeDistributed: number;
}

const HERO_BADGES = [
  { Icon: Shield, key: "howItWorks.heroBadge1" as const },
  { Icon: FileText, key: "howItWorks.heroBadge2" as const },
  { Icon: Zap, key: "howItWorks.heroBadge3" as const },
  { Icon: Scale, key: "howItWorks.heroBadge4" as const },
] as const;

const JOURNEY_STEPS = [
  { n: "01", Icon: Wallet, color: "#5ea3ff", titleKey: "howItWorks.step1Title" as const, bodyKey: "howItWorks.step1Body" as const },
  { n: "02", Icon: Gamepad2, color: "#a78bfa", titleKey: "howItWorks.step2Title" as const, bodyKey: "howItWorks.step2Body" as const },
  { n: "03", Icon: Pickaxe, color: "#22e193", titleKey: "howItWorks.step3Title" as const, bodyKey: "howItWorks.step3Body" as const },
  { n: "04", Icon: LineChart, color: "#ffb516", titleKey: "howItWorks.step4Title" as const, bodyKey: "howItWorks.step4Body" as const },
] as const;

const BENEFITS = [
  { Icon: Gamepad2, color: "#5ea3ff", titleKey: "howItWorks.benefit1Title" as const, bodyKey: "howItWorks.benefit1Body" as const },
  { Icon: Pickaxe, color: "#22e193", titleKey: "howItWorks.benefit2Title" as const, bodyKey: "howItWorks.benefit2Body" as const },
  { Icon: Coins, color: "#ffb516", titleKey: "howItWorks.benefit3Title" as const, bodyKey: "howItWorks.benefit3Body" as const },
  { Icon: ArrowLeftRight, color: "#5ea3ff", titleKey: "howItWorks.benefit4Title" as const, bodyKey: "howItWorks.benefit4Body" as const },
] as const;

// The interactive "Detailed Flow" tab panel — every href is a real
// route in this app (dashboard sub-pages), not a placeholder link.
// Step 1 scrolls up to the header's own ConnectWalletButton instead of
// linking anywhere, same pattern the homepage hero uses.
const FLOW_STEPS = [
  {
    Icon: Wallet,
    titleKey: "howItWorks.flow1Title" as const,
    bodyKey: "howItWorks.flow1Body" as const,
    chipKeys: ["howItWorks.flow1Chip1", "howItWorks.flow1Chip2", "howItWorks.flow1Chip3"] as const,
    actionKey: "howItWorks.flow1Action" as const,
    href: "#top",
  },
  {
    Icon: Gamepad2,
    titleKey: "howItWorks.flow2Title" as const,
    bodyKey: "howItWorks.flow2Body" as const,
    chipKeys: ["howItWorks.flow2Chip1", "howItWorks.flow2Chip2", "howItWorks.flow2Chip3"] as const,
    actionKey: "howItWorks.flow2Action" as const,
    href: "/dashboard/play",
  },
  {
    Icon: Coins,
    titleKey: "howItWorks.flow3Title" as const,
    bodyKey: "howItWorks.flow3Body" as const,
    chipKeys: ["howItWorks.flow3Chip1", "howItWorks.flow3Chip2", "howItWorks.flow3Chip3"] as const,
    actionKey: "howItWorks.flow3Action" as const,
    href: "/dashboard/leaderboard",
  },
  {
    Icon: Pickaxe,
    titleKey: "howItWorks.flow4Title" as const,
    bodyKey: "howItWorks.flow4Body" as const,
    chipKeys: ["howItWorks.flow4Chip1", "howItWorks.flow4Chip2", "howItWorks.flow4Chip3"] as const,
    actionKey: "howItWorks.flow4Action" as const,
    href: "/dashboard/mining",
  },
  {
    Icon: Zap,
    titleKey: "howItWorks.flow5Title" as const,
    bodyKey: "howItWorks.flow5Body" as const,
    chipKeys: ["howItWorks.flow5Chip1", "howItWorks.flow5Chip2", "howItWorks.flow5Chip3"] as const,
    actionKey: "howItWorks.flow5Action" as const,
    href: "/dashboard/mining",
  },
  {
    Icon: LineChart,
    titleKey: "howItWorks.flow6Title" as const,
    bodyKey: "howItWorks.flow6Body" as const,
    chipKeys: ["howItWorks.flow6Chip1", "howItWorks.flow6Chip2", "howItWorks.flow6Chip3"] as const,
    actionKey: "howItWorks.flow6Action" as const,
    href: "/dashboard",
  },
  {
    Icon: ArrowLeftRight,
    titleKey: "howItWorks.flow7Title" as const,
    bodyKey: "howItWorks.flow7Body" as const,
    chipKeys: ["howItWorks.flow7Chip1", "howItWorks.flow7Chip2", "howItWorks.flow7Chip3"] as const,
    actionKey: "howItWorks.flow7Action" as const,
    href: "/dashboard/withdraw",
  },
] as const;

const WHY_ITEMS = [
  { Icon: FileText, color: "#a78bfa", titleKey: "howItWorks.why1Title" as const, bodyKey: "howItWorks.why1Body" as const },
  { Icon: Zap, color: "#22e193", titleKey: "howItWorks.why2Title" as const, bodyKey: "howItWorks.why2Body" as const },
  { Icon: Scale, color: "#ffb516", titleKey: "howItWorks.why3Title" as const, bodyKey: "howItWorks.why3Body" as const },
  { Icon: Users, color: "#22e193", titleKey: "howItWorks.why4Title" as const, bodyKey: "howItWorks.why4Body" as const },
] as const;

export function HowItWorksContent({ platformStats }: { platformStats: PlatformStats }) {
  const { t } = useLocale();
  const [activeFlow, setActiveFlow] = useState(0);
  const reduceMotion = useReducedMotion();
  const flow = FLOW_STEPS[activeFlow];

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
    <div className="ld-root flex min-h-full flex-1 flex-col overflow-x-hidden bg-background text-foreground">
      <SiteHeader />

      <main className="flex-1">
        {/* -------------------------------------------------------- Hero */}
        <section className="relative overflow-hidden" onMouseMove={handleHeroMouseMove} onMouseLeave={handleHeroMouseLeave}>
          <div aria-hidden className="ld-aurora -z-10">
            <span style={{ left: "6%", top: "-12%", width: 460, height: 460, background: "rgba(94,163,255,0.2)", animation: "aurora-drift-1 16s ease-in-out infinite" }} />
            <span style={{ right: "6%", top: "4%", width: 420, height: 420, background: "rgba(167,139,250,0.16)", animation: "aurora-drift-2 20s ease-in-out infinite" }} />
            <span style={{ left: "28%", bottom: "-18%", width: 440, height: 440, background: "rgba(34,225,147,0.12)", animation: "aurora-drift-3 18s ease-in-out infinite" }} />
          </div>
          <Starfield className="-z-10" />

          <div className="ld-container relative grid items-center gap-[26px] py-9 sm:py-[72px] lg:min-h-[560px] lg:grid-cols-[0.9fr_1.1fr]">
            <div className="flex flex-col items-start gap-4 text-left sm:gap-5">
              <motion.span
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="ld-eyebrow text-mint"
              >
                {t("howItWorks.eyebrow")}
              </motion.span>
              <motion.h1
                initial={{ clipPath: "inset(0 100% 0 0)", opacity: 0 }}
                animate={{ clipPath: "inset(0 0% 0 0)", opacity: 1 }}
                transition={{ duration: reduceMotion ? 0.2 : 0.9, delay: 0.1, ease: EASE }}
                className="text-glow-gold text-balance text-[clamp(2.25rem,6vw,4.25rem)] font-extrabold leading-[0.98] tracking-[-0.03em] text-gold"
              >
                {t("howItWorks.title")}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.25, ease: EASE }}
                className="text-lg font-bold text-foreground"
              >
                {t("howItWorks.lead")}
              </motion.p>
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.32, ease: EASE }}
                className="max-w-[520px] text-[15px] leading-relaxed text-muted"
              >
                {t("howItWorks.sub")}
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4, ease: EASE }}
                className="mt-1 flex flex-wrap items-center gap-3"
              >
                <Link href="/#coin-rush" className="btn-game hud-corner text-sm font-bold uppercase tracking-wide">
                  {t("landing.exploreEcosystemButton")}
                </Link>
              </motion.div>

              <motion.div
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: 0.07, delayChildren: 0.55 } } }}
                className="mt-2 flex flex-wrap gap-[8px]"
              >
                {HERO_BADGES.map(({ Icon, key }) => (
                  <motion.span
                    key={key}
                    variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                    className="flex items-center gap-[6px] rounded-[10px] border border-line bg-panel px-[10px] py-[7px] text-[12px] font-semibold text-muted"
                  >
                    <Icon size={14} className="shrink-0 text-gold" />
                    {t(key)}
                  </motion.span>
                ))}
              </motion.div>
            </div>

            <div className="relative mx-auto hidden aspect-square w-full max-w-[440px] items-center justify-center lg:flex">
              <div aria-hidden className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(closest-side, rgba(94,163,255,0.22), transparent 75%)" }} />
              <div aria-hidden className="absolute inset-[8%] rounded-full border border-dashed" style={{ borderColor: "rgba(94,163,255,0.25)", animation: "ld-orbit-spin 40s linear infinite" }} />
              <div aria-hidden className="absolute inset-[16%] rounded-full border border-dashed" style={{ borderColor: "rgba(167,139,250,0.2)", animation: "ld-orbit-spin-rev 55s linear infinite" }} />
              <motion.div style={{ rotateX: heroSpringX, rotateY: heroSpringY, transformPerspective: 1000 }}>
                <Image
                  src="/SpaceDOGE-icon.png"
                  alt="Space DOGE"
                  width={300}
                  height={300}
                  priority
                  className="relative shrink-0 drop-shadow-2xl"
                  style={{ animation: "float-coin 6s ease-in-out infinite" }}
                />
              </motion.div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ Your Journey */}
        <section className="border-t border-line" id="journey">
          <div className="ld-container py-9 text-center sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-gold">{t("howItWorks.journeyEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("howItWorks.journeyHeading")}</h2>
            </Reveal>

            <div className="relative mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <motion.div
                aria-hidden
                className="absolute left-0 right-0 top-1/2 hidden origin-left border-t border-dashed border-line lg:block"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true, margin: "-10% 0px" }}
                transition={{ duration: 1, ease: EASE }}
              />
              {JOURNEY_STEPS.map((s, i) => (
                <Reveal key={s.n} delay={i * 0.1} y={20}>
                  <TiltCard glow={`${s.color}22`} className="relative h-full p-6 text-left" style={{ borderColor: `${s.color}55` }}>
                    <div
                      className="grid h-9 w-9 place-items-center rounded-full border text-xs font-black"
                      style={{ borderColor: s.color, color: s.color }}
                    >
                      {s.n}
                    </div>
                    <s.Icon size={30} className="mt-4" style={{ color: s.color, filter: `drop-shadow(0 0 10px ${s.color}66)` }} />
                    <h3 className="mt-3 text-lg font-black">{t(s.titleKey)}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{t(s.bodyKey)}</p>
                  </TiltCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ Bridge */}
        <section className="relative overflow-hidden border-t border-line bg-panel/40" id="bridge">
          <div className="ld-container py-9 sm:py-[72px]">
            <div className="grid items-end gap-8 lg:grid-cols-2">
              <Reveal>
                <span className="ld-eyebrow text-mint">{t("howItWorks.bridgeEyebrow")}</span>
                <h2 className="ld-h2 mt-2">{t("howItWorks.bridgeHeading")}</h2>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">{t("howItWorks.bridgeBody")}</p>
              </Reveal>

              <Reveal delay={0.1}>
                <div className="relative mx-auto flex h-[180px] w-full max-w-sm items-center justify-center overflow-hidden rounded-[18px] border border-line">
                  <div
                    aria-hidden
                    className="absolute inset-0"
                    style={{ background: "radial-gradient(circle at 50% 50%, rgba(167,139,250,0.22), transparent 70%), radial-gradient(circle at 20% 80%, rgba(34,225,147,0.14), transparent 60%)" }}
                  />
                  <div aria-hidden className="absolute h-[220px] w-[220px] rounded-full border border-dashed" style={{ borderColor: "rgba(167,139,250,0.3)", animation: "ld-orbit-spin 30s linear infinite" }} />
                  <div aria-hidden className="absolute h-[140px] w-[140px] rounded-full border border-dashed" style={{ borderColor: "rgba(34,225,147,0.3)", animation: "ld-orbit-spin-rev 22s linear infinite" }} />
                  <Coins size={40} className="relative text-gold" style={{ animation: "float-coin 4s ease-in-out infinite" }} />
                </div>
              </Reveal>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {BENEFITS.map((b, i) => (
                <Reveal key={b.titleKey} delay={i * 0.08}>
                  <motion.div whileHover={{ y: -4 }} className="ld-glass h-full p-6 transition-shadow duration-300" style={{ borderColor: `${b.color}33` }}>
                    <span className="grid h-11 w-11 place-items-center rounded-[12px]" style={{ background: `${b.color}22`, color: b.color }}>
                      <b.Icon size={20} />
                    </span>
                    <h3 className="mt-3 text-sm font-bold">{t(b.titleKey)}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">{t(b.bodyKey)}</p>
                  </motion.div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- Detailed flow */}
        <section className="border-t border-line" id="flow">
          <div className="ld-container py-9 sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-gold">{t("howItWorks.flowEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("howItWorks.flowHeading")}</h2>
            </Reveal>

            <Reveal delay={0.1} className="mt-8">
              <div className="ld-glass grid overflow-hidden lg:grid-cols-[260px_1fr]">
                <div className="flex gap-1 overflow-x-auto border-b border-line p-2 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r lg:p-3">
                  <h3 className="hidden px-2 pb-2 text-[11px] font-black uppercase tracking-widest text-mint lg:block">
                    {t("howItWorks.flowTabsLabel")}
                  </h3>
                  {FLOW_STEPS.map((step, i) => {
                    const active = i === activeFlow;
                    return (
                      <button
                        key={step.titleKey}
                        type="button"
                        onClick={() => setActiveFlow(i)}
                        className={`relative flex shrink-0 items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide transition-colors lg:shrink lg:w-full ${
                          active ? "text-gold" : "text-muted hover:text-foreground"
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="flow-tab-active"
                            className="absolute inset-0 -z-10 rounded-[10px] bg-gold-soft"
                            transition={{ type: "spring", stiffness: 420, damping: 34 }}
                          />
                        )}
                        <span
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] ${
                            active ? "border-gold text-gold" : "border-line text-muted"
                          }`}
                        >
                          {i + 1}
                        </span>
                        <span className="whitespace-nowrap">{t(step.titleKey)}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="relative min-h-[320px] overflow-hidden p-6 sm:p-8">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeFlow}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.3, ease: EASE }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-gold text-gold">
                          <flow.Icon size={18} />
                        </span>
                        <h3 className="text-2xl font-black">{t(flow.titleKey)}</h3>
                      </div>
                      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">{t(flow.bodyKey)}</p>

                      <div className="mt-5 flex flex-wrap gap-2.5">
                        {flow.chipKeys.map((ck) => (
                          <span key={ck} className="rounded-[9px] border border-line bg-panel-2 px-3 py-2 text-xs font-semibold text-muted">
                            {t(ck)}
                          </span>
                        ))}
                      </div>

                      <Link href={flow.href} className="ld-btn-flat btn-game group mt-6 inline-flex items-center gap-1.5 text-xs">
                        {t(flow.actionKey)}
                        <ArrowRight size={14} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                      </Link>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ---------------------------------------------------------- Why */}
        <section className="border-t border-line bg-panel/40" id="why">
          <div className="ld-container py-9 text-center sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-mint">{t("howItWorks.whyEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("howItWorks.whyHeading")}</h2>
            </Reveal>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {WHY_ITEMS.map((w, i) => (
                <Reveal key={w.titleKey} delay={i * 0.08}>
                  <motion.div whileHover={{ y: -3 }} className="ld-glass flex h-full items-center gap-4 p-5 text-left">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border" style={{ borderColor: w.color, color: w.color }}>
                      <w.Icon size={22} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold">{t(w.titleKey)}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-muted">{t(w.bodyKey)}</p>
                    </div>
                  </motion.div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ Metrics */}
        <section className="border-t border-line" id="metrics">
          <div className="ld-container py-9 text-center sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-gold">{t("howItWorks.metricsEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("howItWorks.metricsHeading")}</h2>
            </Reveal>

            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { Icon: Users, value: platformStats.walletCount, label: t("landing.statsWallets"), color: "#5ea3ff" },
                { Icon: Gamepad2, value: platformStats.matchCount, label: t("landing.statsMatches"), color: "#a78bfa" },
                { Icon: Pickaxe, value: platformStats.activeMinerCount, label: t("landing.statsMiners"), color: "#22e193" },
                { Icon: Coins, value: platformStats.lifetimeDogeDistributed, label: t("landing.statsLifetimeDoge"), color: "#ffb516", decimals: 2, suffix: " DOGE" },
              ].map((m) => (
                <Reveal key={m.label}>
                  <div className="ld-glass h-full p-6">
                    <m.Icon size={20} className="mx-auto" style={{ color: m.color }} />
                    <p className="mt-2 text-2xl">
                      <StatCounter value={m.value} decimals={m.decimals} suffix={m.suffix} />
                    </p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{m.label}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- CTA */}
        <section className="relative overflow-hidden border-t border-line bg-panel/40">
          <div aria-hidden className="ld-aurora">
            <span style={{ left: "10%", top: "-30%", width: 420, height: 420, background: "rgba(94,163,255,0.14)", animation: "aurora-drift-1 14s ease-in-out infinite" }} />
            <span style={{ right: "8%", bottom: "-30%", width: 380, height: 380, background: "rgba(255,181,22,0.12)", animation: "aurora-drift-2 17s ease-in-out infinite" }} />
          </div>
          <div className="ld-container relative py-9 sm:py-[72px]">
            <Reveal>
              <div className="ld-glass glow-gold flex min-h-[200px] flex-col items-center justify-center gap-4 p-[42px] text-center">
                <span className="ld-eyebrow text-mint">{t("howItWorks.ctaEyebrow")}</span>
                <h2 className="text-glow-gold ld-h2">{t("howItWorks.ctaHeading")}</h2>
                <p className="max-w-xl text-sm text-muted">{t("howItWorks.ctaBody")}</p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <ConnectWalletButton />
                  <Link href="/#faq" className="ld-btn-flat ld-btn-ghost rounded-full border bg-panel-2 px-4 text-xs font-bold uppercase tracking-wide">
                    {t("landing.joinWaitlistButton")}
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
