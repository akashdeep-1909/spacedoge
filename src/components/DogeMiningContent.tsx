"use client";

import { useState, type MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import {
  Zap,
  Wallet,
  ShieldCheck,
  Cpu,
  Clock3,
  Coins,
  TrendingUp,
  Plug,
  Database,
  ArrowRight,
  Users,
  ChevronDown,
  Server,
} from "lucide-react";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { Reveal, StatCounter, TiltCard, EASE, Starfield } from "@/components/motionPrimitives";
import { MINING_PACKAGES, HASHRATE_TERM_DAYS, HASHRATE_PER_USDT } from "@/lib/mining-shared";

interface PlatformStats {
  walletCount: number;
  matchCount: number;
  activeMinerCount: number;
  totalHashrateGhs: number;
  lifetimeDogeDistributed: number;
}

interface Economics {
  fleetCapacityMhs: number;
  referenceMonthlyGrossUsdt: number;
  minerPowerKw: number;
  electricityRateUsdtPerKwh: number;
  poolFeePct: number;
  targetRoiPct: number;
}

const HERO_BADGES = [
  { Icon: Server, key: "dogeMining.heroBadge1" as const, sub: "dogeMining.heroBadge1Sub" as const },
  { Icon: Clock3, key: "dogeMining.heroBadge2" as const, sub: "dogeMining.heroBadge2Sub" as const },
  { Icon: Zap, key: "dogeMining.heroBadge3" as const, sub: "dogeMining.heroBadge3Sub" as const },
  { Icon: ShieldCheck, key: "dogeMining.heroBadge4" as const, sub: "dogeMining.heroBadge4Sub" as const },
] as const;

const HOW_IT_WORKS_STEPS = [
  { n: "01", Icon: Zap, color: "#5ea3ff", titleKey: "dogeMining.step1Title" as const, bodyKey: "dogeMining.step1Body" as const },
  { n: "02", Icon: Wallet, color: "#a78bfa", titleKey: "dogeMining.step2Title" as const, bodyKey: "dogeMining.step2Body" as const },
  { n: "03", Icon: Server, color: "#22e193", titleKey: "dogeMining.step3Title" as const, bodyKey: "dogeMining.step3Body" as const },
  { n: "04", Icon: Cpu, color: "#ffb516", titleKey: "dogeMining.step4Title" as const, bodyKey: "dogeMining.step4Body" as const },
  { n: "05", Icon: ShieldCheck, color: "#22e193", titleKey: "dogeMining.step5Title" as const, bodyKey: "dogeMining.step5Body" as const },
  { n: "06", Icon: Coins, color: "#ffb516", titleKey: "dogeMining.step6Title" as const, bodyKey: "dogeMining.step6Body" as const },
] as const;

const PACKAGE_COLORS: Record<string, string> = {
  Launch: "#22e193",
  Orbit: "#5ea3ff",
  Lunar: "#a78bfa",
  Mars: "#ff8a5c",
  Galaxy: "#ffb516",
  Nova: "#ff6b5c",
};

const FAQ_KEYS = [
  { qKey: "dogeMining.faq1Q" as const, aKey: "dogeMining.faq1A" as const },
  { qKey: "dogeMining.faq2Q" as const, aKey: "dogeMining.faq2A" as const },
  { qKey: "dogeMining.faq3Q" as const, aKey: "dogeMining.faq3A" as const },
  { qKey: "dogeMining.faq4Q" as const, aKey: "dogeMining.faq4A" as const },
  { qKey: "dogeMining.faq5Q" as const, aKey: "dogeMining.faq5A" as const },
  { qKey: "dogeMining.faq6Q" as const, aKey: "dogeMining.faq6A" as const },
  { qKey: "dogeMining.faq7Q" as const, aKey: "dogeMining.faq7A" as const },
  { qKey: "dogeMining.faq8Q" as const, aKey: "dogeMining.faq8A" as const },
] as const;

export function DogeMiningContent({
  platformStats,
  economics,
  reserveBalanceUsdt,
}: {
  platformStats: PlatformStats;
  economics: Economics;
  reserveBalanceUsdt: number;
}) {
  const { t } = useLocale();
  const reduceMotion = useReducedMotion();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const fleetCapacityGhs = economics.fleetCapacityMhs / 1000;

  const heroTiltX = useMotionValue(0);
  const heroTiltY = useMotionValue(0);
  const heroSpringX = useSpring(heroTiltX, { stiffness: 60, damping: 18 });
  const heroSpringY = useSpring(heroTiltY, { stiffness: 60, damping: 18 });
  function handleHeroMouseMove(e: ReactMouseEvent<HTMLDivElement>) {
    if (reduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    heroTiltX.set(py * 6);
    heroTiltY.set(px * -6);
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
        <section className="relative overflow-hidden">
          <div aria-hidden className="ld-aurora -z-10">
            <span style={{ left: "8%", top: "-14%", width: 460, height: 460, background: "rgba(34,225,147,0.2)", animation: "aurora-drift-1 16s ease-in-out infinite" }} />
            <span style={{ right: "4%", top: "2%", width: 420, height: 420, background: "rgba(255,181,22,0.16)", animation: "aurora-drift-2 20s ease-in-out infinite" }} />
            <span style={{ left: "30%", bottom: "-18%", width: 440, height: 440, background: "rgba(94,163,255,0.12)", animation: "aurora-drift-3 18s ease-in-out infinite" }} />
          </div>
          <Starfield className="-z-10" />

          <div className="ld-container relative grid items-center gap-[26px] py-9 sm:py-[72px] lg:min-h-[560px] lg:grid-cols-[1.05fr_0.95fr]">
            <div className="flex flex-col items-start gap-4 text-left sm:gap-5">
              <motion.span
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="ld-eyebrow text-mint"
              >
                {t("dogeMining.eyebrow")}
              </motion.span>
              <motion.h1
                initial={{ clipPath: "inset(0 100% 0 0)", opacity: 0 }}
                animate={{ clipPath: "inset(0 0% 0 0)", opacity: 1 }}
                transition={{ duration: reduceMotion ? 0.2 : 0.9, delay: 0.1, ease: EASE }}
                className="text-glow-gold text-balance text-[clamp(2.25rem,6vw,4.25rem)] font-extrabold leading-[0.98] tracking-[-0.03em] text-gold"
              >
                {t("dogeMining.titleLine1")}
                <br />
                {t("dogeMining.titleLine2")}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.25, ease: EASE }}
                className="max-w-[520px] text-[15px] leading-relaxed text-muted"
              >
                {t("dogeMining.lead")}
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4, ease: EASE }}
                className="mt-1 flex flex-wrap items-center gap-3"
              >
                <a href="#packages" className="btn-game hud-corner group inline-flex items-center gap-1.5 text-sm">
                  {t("dogeMining.packagesButton")}
                  <ArrowRight size={15} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                </a>
                <Link href="/dashboard/mining" className="btn-game-outline hud-corner text-sm font-bold uppercase tracking-wide">
                  {t("dogeMining.dashboardButton")}
                </Link>
              </motion.div>

              <motion.div
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: 0.07, delayChildren: 0.55 } } }}
                className="mt-2 flex flex-wrap gap-[8px]"
              >
                {HERO_BADGES.map(({ Icon, key, sub }) => (
                  <motion.span
                    key={key}
                    variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                    className="flex flex-col gap-0.5 rounded-[10px] border border-line bg-panel px-[10px] py-[7px]"
                  >
                    <span className="flex items-center gap-[6px] text-[12px] font-semibold text-muted">
                      <Icon size={14} className="shrink-0 text-gold" />
                      {t(key)}
                    </span>
                    <span className="pl-[20px] text-[10px] text-muted/70">{t(sub)}</span>
                  </motion.span>
                ))}
              </motion.div>
            </div>

            <motion.div
              onMouseMove={handleHeroMouseMove}
              onMouseLeave={handleHeroMouseLeave}
              style={{ rotateX: heroSpringX, rotateY: heroSpringY, transformPerspective: 1200 }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3, ease: EASE }}
            >
              <TiltCard glow="rgba(34,225,147,0.24)" className="p-6" style={{ borderColor: "rgba(34,225,147,0.4)" }}>
                <div className="flex items-center gap-2">
                  <Cpu size={18} className="text-mint" />
                  <h3 className="text-sm font-black uppercase tracking-wide">{t("dogeMining.overviewCardTitle")}</h3>
                </div>
                <div className="mt-4 flex flex-col gap-2.5 text-xs">
                  <div className="flex items-center justify-between rounded-[10px] border border-line bg-panel-2 px-3 py-2.5">
                    <span className="text-muted">{t("dogeMining.overviewFleet")}</span>
                    <span className="font-black text-foreground">{fleetCapacityGhs.toFixed(0)} GH/s</span>
                  </div>
                  <div className="flex items-center justify-between rounded-[10px] border border-line bg-panel-2 px-3 py-2.5">
                    <span className="text-muted">{t("dogeMining.overviewPower")}</span>
                    <span className="font-black text-foreground">{economics.minerPowerKw.toFixed(2)} kW</span>
                  </div>
                  <div className="flex items-center justify-between rounded-[10px] border border-line bg-panel-2 px-3 py-2.5">
                    <span className="text-muted">{t("dogeMining.overviewTerm")}</span>
                    <span className="font-black text-foreground">{HASHRATE_TERM_DAYS} days</span>
                  </div>
                  <div className="flex items-center justify-between rounded-[10px] border border-line bg-panel-2 px-3 py-2.5">
                    <span className="text-muted">{t("dogeMining.overviewRate")}</span>
                    <span className="font-black text-foreground">{HASHRATE_PER_USDT} MH/s / USDT</span>
                  </div>
                  <div className="flex items-center justify-between rounded-[10px] border border-line bg-panel-2 px-3 py-2.5">
                    <span className="text-muted">{t("dogeMining.overviewSettlement")}</span>
                    <span className="font-black text-gold">{t("dogeMining.overviewSettlementValue")}</span>
                  </div>
                </div>
                <div aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full" style={{ background: "radial-gradient(closest-side, rgba(34,225,147,0.28), transparent 75%)", animation: "float-coin 5s ease-in-out infinite" }} />
              </TiltCard>
            </motion.div>
          </div>
        </section>

        {/* --------------------------------------------------- How It Works */}
        <section className="border-t border-line" id="how">
          <div className="ld-container py-9 text-center sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-gold">{t("dogeMining.stepsEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("dogeMining.stepsHeading")}</h2>
            </Reveal>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {HOW_IT_WORKS_STEPS.map((s, i) => (
                <Reveal key={s.n} delay={i * 0.08} y={20}>
                  <TiltCard glow={`${s.color}22`} className="relative h-full p-6 text-left" style={{ borderColor: `${s.color}55` }}>
                    <div
                      className="grid h-9 w-9 place-items-center rounded-full border text-xs font-black"
                      style={{ borderColor: s.color, color: s.color }}
                    >
                      {s.n}
                    </div>
                    <s.Icon size={28} className="mt-4" style={{ color: s.color, filter: `drop-shadow(0 0 10px ${s.color}66)` }} />
                    <h3 className="mt-3 text-base font-black">{t(s.titleKey)}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{t(s.bodyKey)}</p>
                  </TiltCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ Packages */}
        <section className="border-t border-line bg-panel/40" id="packages">
          <div className="ld-container py-9 sm:py-[72px]">
            <Reveal className="text-center">
              <span className="ld-eyebrow text-mint">{t("dogeMining.packagesEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("dogeMining.packagesHeading")}</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted">{t("dogeMining.packagesBody")}</p>
            </Reveal>

            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {MINING_PACKAGES.map((pkg, i) => {
                const color = PACKAGE_COLORS[pkg.name] ?? "#5ea3ff";
                const sharePct = (pkg.mhs / economics.fleetCapacityMhs) * 100;
                return (
                  <Reveal key={pkg.level} delay={i * 0.06} y={20}>
                    <TiltCard glow={`${color}22`} className="flex h-full flex-col p-6" style={{ borderColor: `${color}55` }}>
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-black">{pkg.name}</h3>
                        <span className="rounded-full px-2.5 py-1 text-xs font-black" style={{ background: `${color}22`, color }}>
                          ${pkg.priceUsdt}
                        </span>
                      </div>
                      <p className="mt-3 text-2xl font-black text-foreground">{pkg.hashrateLabel}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-muted">
                        <span className="rounded-full border border-line bg-panel-2 px-2.5 py-1">
                          {t("dogeMining.packageShareLabel")}: {sharePct < 1 ? sharePct.toFixed(3) : sharePct.toFixed(2)}%
                        </span>
                        <span className="rounded-full border border-line bg-panel-2 px-2.5 py-1">{t("dogeMining.packageTermLabel")}</span>
                      </div>
                      <Link
                        href="/dashboard/mining"
                        className="ld-btn-flat group mt-5 inline-flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wide text-black"
                        style={{ background: `linear-gradient(180deg, ${color}, ${color}cc)` }}
                      >
                        {t("dogeMining.packageCta")}
                        <ArrowRight size={13} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                      </Link>
                    </TiltCard>
                  </Reveal>
                );
              })}
            </div>

            <Reveal delay={0.1} className="mt-6">
              <p className="text-center text-xs text-muted">{t("dogeMining.packagesNote")}</p>
            </Reveal>
          </div>
        </section>

        {/* --------------------------------------------------- Reward math */}
        <section className="border-t border-line" id="rewards">
          <div className="ld-container py-9 sm:py-[72px]">
            <Reveal className="text-center">
              <span className="ld-eyebrow text-gold">{t("dogeMining.rewardsEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("dogeMining.rewardsHeading")}</h2>
            </Reveal>

            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              {/* Panel 1: today's model inputs */}
              <Reveal delay={0.05}>
                <div className="ld-glass flex h-full flex-col p-6">
                  <div className="flex items-center gap-2">
                    <Plug size={18} className="text-gold" />
                    <h3 className="text-sm font-black uppercase tracking-wide">{t("dogeMining.inputsPanelLabel")}</h3>
                  </div>
                  <div className="mt-4 flex flex-1 flex-col gap-2.5 text-xs">
                    <div className="flex items-center justify-between rounded-[10px] border border-line bg-panel-2 px-3 py-2.5">
                      <span className="text-muted">{t("dogeMining.inputsGross")}</span>
                      <span className="font-black text-foreground">{economics.referenceMonthlyGrossUsdt.toFixed(2)} USDT</span>
                    </div>
                    <div className="flex items-center justify-between rounded-[10px] border border-line bg-panel-2 px-3 py-2.5">
                      <span className="text-muted">{t("dogeMining.inputsPower")}</span>
                      <span className="font-black text-foreground">{economics.minerPowerKw.toFixed(2)} kW</span>
                    </div>
                    <div className="flex items-center justify-between rounded-[10px] border border-line bg-panel-2 px-3 py-2.5">
                      <span className="text-muted">{t("dogeMining.inputsElectricity")}</span>
                      <span className="font-black text-foreground">{economics.electricityRateUsdtPerKwh.toFixed(4)} USDT/kWh</span>
                    </div>
                    <div className="flex items-center justify-between rounded-[10px] border border-line bg-panel-2 px-3 py-2.5">
                      <span className="text-muted">{t("dogeMining.inputsPoolFee")}</span>
                      <span className="font-black text-foreground">{(economics.poolFeePct * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                  <p className="mt-4 text-[11px] leading-relaxed text-muted/80">{t("dogeMining.inputsNote")}</p>
                </div>
              </Reveal>

              {/* Panel 2: guaranteed target ROI */}
              <Reveal delay={0.1}>
                <div className="ld-glass flex h-full flex-col p-6">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={18} className="text-mint" />
                    <h3 className="text-sm font-black uppercase tracking-wide">{t("dogeMining.targetPanelLabel")}</h3>
                  </div>
                  <p className="mt-3 text-3xl font-black text-mint">+{(economics.targetRoiPct * 100).toFixed(0)}%</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-panel">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-mint to-gold"
                      initial={{ width: 0 }}
                      whileInView={{ width: "100%" }}
                      viewport={{ once: true }}
                      transition={{ duration: 1, ease: EASE }}
                    />
                  </div>
                  <p className="mt-4 flex-1 text-xs leading-relaxed text-muted">
                    {t("dogeMining.targetRoiBody", { pct: (economics.targetRoiPct * 100).toFixed(0) })}
                  </p>
                </div>
              </Reveal>

              {/* Panel 3: protection reserve */}
              <Reveal delay={0.15}>
                <div className="ld-glass flex h-full flex-col p-6">
                  <div className="flex items-center gap-2">
                    <Database size={18} className="text-gold" />
                    <h3 className="text-sm font-black uppercase tracking-wide">{t("dogeMining.reservePanelLabel")}</h3>
                  </div>
                  <p className="mt-3 text-2xl font-black text-gold">
                    <StatCounter value={reserveBalanceUsdt} decimals={2} suffix=" USDT" />
                  </p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{t("dogeMining.reserveBalanceLabel")}</p>
                  <p className="mt-4 flex-1 text-xs leading-relaxed text-muted">{t("dogeMining.reserveBody")}</p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------- Pool explorer */}
        <section className="relative overflow-hidden border-t border-line bg-panel/40" id="pool">
          <div className="ld-container py-9 sm:py-[72px]">
            <div className="grid items-center gap-8 lg:grid-cols-2">
              <Reveal>
                <span className="ld-eyebrow text-mint">{t("dogeMining.poolEyebrow")}</span>
                <h2 className="ld-h2 mt-2">{t("dogeMining.poolHeading")}</h2>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{t("dogeMining.poolBody")}</p>
                <Link href="/pool" className="ld-btn-flat btn-game group mt-6 inline-flex items-center gap-1.5 text-xs">
                  {t("dogeMining.poolCta")}
                  <ArrowRight size={14} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
              </Reveal>

              <Reveal delay={0.1}>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { Icon: Cpu, value: platformStats.totalHashrateGhs, decimals: 2, suffix: " GH/s", label: t("dogeMining.poolActiveHashrate"), color: "#5ea3ff" },
                    { Icon: Users, value: platformStats.activeMinerCount, decimals: 0, suffix: "", label: t("dogeMining.poolActiveMiners"), color: "#a78bfa" },
                    { Icon: Coins, value: platformStats.lifetimeDogeDistributed, decimals: 2, suffix: " DOGE", label: t("dogeMining.poolLifetimeDoge"), color: "#ffb516" },
                    { Icon: TrendingUp, value: economics.poolFeePct * 100, decimals: 1, suffix: "%", label: t("dogeMining.poolFeeStat"), color: "#22e193" },
                  ].map((m) => (
                    <div key={m.label} className="ld-glass p-5 text-center">
                      <m.Icon size={18} className="mx-auto" style={{ color: m.color }} />
                      <p className="mt-2 text-xl">
                        <StatCounter value={m.value} decimals={m.decimals} suffix={m.suffix} />
                      </p>
                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{m.label}</p>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- FAQ */}
        <section className="border-t border-line" id="faq">
          <div className="ld-container py-9 sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-gold">{t("dogeMining.faqEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("dogeMining.faqHeading")}</h2>
            </Reveal>

            <div className="mt-6 grid gap-2 lg:grid-cols-2">
              {FAQ_KEYS.map((f, i) => {
                const open = openFaq === i;
                return (
                  <Reveal key={f.qKey} delay={i * 0.04} y={16}>
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
          </div>
        </section>

        {/* -------------------------------------------------------- CTA */}
        <section className="relative overflow-hidden border-t border-line bg-panel/40">
          <div aria-hidden className="ld-aurora">
            <span style={{ left: "10%", top: "-30%", width: 420, height: 420, background: "rgba(34,225,147,0.14)", animation: "aurora-drift-1 14s ease-in-out infinite" }} />
            <span style={{ right: "8%", bottom: "-30%", width: 380, height: 380, background: "rgba(255,181,22,0.12)", animation: "aurora-drift-2 17s ease-in-out infinite" }} />
          </div>
          <div className="ld-container relative py-9 sm:py-[72px]">
            <Reveal>
              <div className="ld-glass glow-gold flex min-h-[200px] flex-col items-center justify-center gap-4 p-[42px] text-center">
                <span className="ld-eyebrow text-mint">{t("dogeMining.ctaEyebrow")}</span>
                <h2 className="text-glow-gold ld-h2">{t("dogeMining.ctaHeading")}</h2>
                <p className="max-w-xl text-sm text-muted">{t("dogeMining.ctaBody")}</p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <ConnectWalletButton />
                  <Link href="/dashboard/mining" className="ld-btn-flat ld-btn-ghost rounded-full border bg-panel-2 px-4 text-xs font-bold uppercase tracking-wide">
                    {t("dogeMining.dashboardButton")}
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
