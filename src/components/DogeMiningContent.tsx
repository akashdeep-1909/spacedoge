"use client";

import { useState, type MouseEvent as ReactMouseEvent } from "react";
import Image from "next/image";
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
  Database,
  ArrowRight,
  ChevronDown,
  Server,
  Share2,
  Gift,
  Calculator,
} from "lucide-react";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { GatedLink } from "@/components/GatedLink";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { Reveal, StatCounter, TiltCard, EASE, Starfield } from "@/components/motionPrimitives";
import { MINING_PACKAGES, HASHRATE_TERM_DAYS, HASHRATE_PER_USDT, MIN_HASHRATE_PURCHASE_USDT, MHS_PER_RIG } from "@/lib/mining-shared";
import { REFERRAL_L1_PCT, REFERRAL_L2_PCT } from "@/lib/game-config";

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

const HERO_QUICK_STEPS = [
  { Icon: Zap, color: "#5ea3ff", titleKey: "dogeMining.step1Title" as const },
  { Icon: Wallet, color: "#a78bfa", titleKey: "dogeMining.step2Title" as const },
  { Icon: Cpu, color: "#ffb516", titleKey: "dogeMining.step4Title" as const },
  { Icon: Coins, color: "#22e193", titleKey: "dogeMining.step6Title" as const },
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
  { qKey: "dogeMining.faq3Q" as const, aKey: "dogeMining.faq3A" as const },
  { qKey: "dogeMining.faq4Q" as const, aKey: "dogeMining.faq4A" as const },
  { qKey: "dogeMining.faq5Q" as const, aKey: "dogeMining.faq5A" as const },
  { qKey: "dogeMining.faq6Q" as const, aKey: "dogeMining.faq6A" as const },
  { qKey: "dogeMining.faq7Q" as const, aKey: "dogeMining.faq7A" as const },
  { qKey: "dogeMining.faq8Q" as const, aKey: "dogeMining.faq8A" as const },
  { qKey: "dogeMining.faq9Q" as const, aKey: "dogeMining.faq9A" as const },
  { qKey: "dogeMining.faq10Q" as const, aKey: "dogeMining.faq10A" as const },
] as const;

const REFERRAL_FLOW_STEPS = [
  { n: "01", Icon: Wallet, color: "#5ea3ff", titleKey: "dogeMining.referralStep1Title" as const, bodyKey: "dogeMining.referralStep1Body" as const },
  { n: "02", Icon: Share2, color: "#a78bfa", titleKey: "dogeMining.referralStep2Title" as const, bodyKey: "dogeMining.referralStep2Body" as const },
  { n: "03", Icon: Server, color: "#22e193", titleKey: "dogeMining.referralStep3Title" as const, bodyKey: "dogeMining.referralStep3Body" as const },
  { n: "04", Icon: Gift, color: "#ffb516", titleKey: "dogeMining.referralStep4Title" as const, bodyKey: "dogeMining.referralStep4Body" as const },
  { n: "05", Icon: TrendingUp, color: "#22e193", titleKey: "dogeMining.referralStep5Title" as const, bodyKey: "dogeMining.referralStep5Body" as const },
] as const;

const REFERRAL_RULE_KEYS = [
  "dogeMining.referralRule1" as const,
  "dogeMining.referralRule2" as const,
  "dogeMining.referralRule3" as const,
  "dogeMining.referralRule4" as const,
];

// Worked example defaults to the real Galaxy package — a round mid-tier
// figure, not an invented number (see MINING_PACKAGES) — but the picker
// below lets it reflect any package/custom amount a referred wallet
// might actually fund, same as the Reward Calculator's own picker.
const REFERRAL_EXAMPLE_DEFAULT_INDEX = MINING_PACKAGES.findIndex((p) => p.name === "Galaxy");

export function DogeMiningContent({
  platformStats,
  economics,
  reserveBalanceUsdt,
  dogeUsdtRate,
}: {
  platformStats: PlatformStats;
  economics: Economics;
  reserveBalanceUsdt: number;
  dogeUsdtRate: number;
}) {
  const { t } = useLocale();
  const reduceMotion = useReducedMotion();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Reward calculator — package picker plus an optional custom amount
  // that overrides it. Formulas mirror the real settlement math in
  // src/lib/mining.ts (settleEpochForDate) at full fleet utilization
  // (variance = 1), the same "reference day" assumption the static
  // Reward Math panel above already uses — not an invented formula.
  const [calcPackageIndex, setCalcPackageIndex] = useState(2); // Lunar — a representative mid-tier default
  const [calcCustomAmount, setCalcCustomAmount] = useState("");
  const calcAmountUsdt = (() => {
    const custom = Number(calcCustomAmount);
    if (calcCustomAmount.trim() !== "" && Number.isFinite(custom) && custom >= MIN_HASHRATE_PURCHASE_USDT) return custom;
    return MINING_PACKAGES[calcPackageIndex].priceUsdt;
  })();
  const calcHashrateMhs = calcAmountUsdt * HASHRATE_PER_USDT;
  // calcShare (share of the WHOLE platform's sold capacity) is what the
  // dollar-figure formulas below must keep using — it's the correct
  // basis for "what fraction of the fleet's total reference income is
  // mine." calcShareOfRig (share of a single 16,000 MH/s rig) is
  // display-only, for the "Share of fleet" stat specifically — kept
  // deliberately separate so that stat can express "relative to one
  // rig" without also inflating Modeled Gross/Electricity/Pool Fee by
  // however many rigs' worth fleetCapacityMhs has grown to (the same
  // kind of understated/overstated-income bug already found and fixed
  // once in this file — see MiningEconomicsConfig's schema comments).
  const calcShare = calcHashrateMhs / economics.fleetCapacityMhs;
  const calcShareOfRig = calcHashrateMhs / MHS_PER_RIG;
  const calcDailyGross = calcShare * (economics.referenceMonthlyGrossUsdt / 30);
  const calcDailyElectricity = calcShare * economics.minerPowerKw * 24 * economics.electricityRateUsdtPerKwh;
  const calcDailyPoolFee = calcDailyGross * economics.poolFeePct;
  const calcDailyTarget = (calcAmountUsdt * (1 + economics.targetRoiPct)) / HASHRATE_TERM_DAYS;
  const calcTermTotalTarget = calcAmountUsdt * (1 + economics.targetRoiPct);

  // Mining referral worked example — package picker plus an optional
  // custom amount, same pattern as the Reward Calculator above. Shows
  // that PACKAGE's own daily electricity-cost deduction (same formula as
  // calcDailyElectricity above), 5%/2% of which is what
  // settleEpochForDate actually carves out to referrers every day this
  // contract stays active.
  const [referralExamplePackageIndex, setReferralExamplePackageIndex] = useState(REFERRAL_EXAMPLE_DEFAULT_INDEX);
  const [referralExampleCustomAmount, setReferralExampleCustomAmount] = useState("");
  const referralExampleAmountUsdt = (() => {
    const custom = Number(referralExampleCustomAmount);
    if (referralExampleCustomAmount.trim() !== "" && Number.isFinite(custom) && custom >= MIN_HASHRATE_PURCHASE_USDT) return custom;
    return MINING_PACKAGES[referralExamplePackageIndex].priceUsdt;
  })();
  const referralExampleMhs = referralExampleAmountUsdt * HASHRATE_PER_USDT;
  const referralExampleShare = referralExampleMhs / economics.fleetCapacityMhs;
  const referralExampleDailyElectricityUsdt = referralExampleShare * economics.minerPowerKw * 24 * economics.electricityRateUsdtPerKwh;
  const referralExampleL1Doge = (referralExampleDailyElectricityUsdt * REFERRAL_L1_PCT) / dogeUsdtRate;
  const referralExampleL2Doge = (referralExampleDailyElectricityUsdt * REFERRAL_L2_PCT) / dogeUsdtRate;

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
    <div className="ld-root flex min-h-full flex-1 flex-col bg-background text-foreground">
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
                <GatedLink href="/dashboard/mining" className="btn-game-outline hud-corner text-sm font-bold uppercase tracking-wide">
                  {t("dogeMining.dashboardButton")}
                </GatedLink>
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
                <div
                  aria-hidden
                  className="pointer-events-none absolute right-4 top-4 h-14 w-14 overflow-hidden rounded-full border-2 border-gold/60 shadow-[0_0_20px_rgba(255,181,22,0.35)]"
                  style={{ animation: "float-coin 5s ease-in-out infinite" }}
                >
                  <Image src="/dogemine-badge.png" alt="" width={112} height={112} className="h-full w-full object-cover" />
                </div>
                <div className="flex items-center gap-2 pr-16">
                  <Cpu size={18} className="text-mint" />
                  <h3 className="text-sm font-black uppercase tracking-wide">{t("dogeMining.stepsEyebrow")}</h3>
                </div>
                <div className="mt-4 flex flex-col gap-2.5 text-xs">
                  {HERO_QUICK_STEPS.map((s, i) => (
                    <div key={s.titleKey} className="flex items-center gap-3 rounded-[10px] border border-line bg-panel-2 px-3 py-2.5">
                      <span
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] font-black"
                        style={{ background: `${s.color}22`, color: s.color }}
                      >
                        {i + 1}
                      </span>
                      <s.Icon size={14} className="shrink-0 text-muted" />
                      <span className="font-bold text-foreground">{t(s.titleKey)}</span>
                    </div>
                  ))}
                </div>
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
                // Share of ONE rig (16,000 MH/s), matching the Reward
                // Calculator's own calcShareOfRig below — display-only,
                // deliberately not economics.fleetCapacityMhs (the
                // platform-wide total), same reasoning as calcShareOfRig's
                // own doc-comment.
                const sharePct = (pkg.mhs / MHS_PER_RIG) * 100;
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
                      <GatedLink
                        href="/dashboard/mining"
                        className="ld-btn-flat group mt-5 inline-flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wide text-black"
                        style={{ background: `linear-gradient(180deg, ${color}, ${color}cc)` }}
                      >
                        {t("dogeMining.packageCta")}
                        <ArrowRight size={13} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                      </GatedLink>
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

            <div className="mx-auto mt-8 grid max-w-3xl gap-6 sm:grid-cols-2">
              {/* Panel 1: guaranteed target ROI */}
              <Reveal delay={0.05}>
                <TiltCard glow="rgba(34,225,147,0.24)" className="flex h-full flex-col p-7" style={{ borderColor: "rgba(34,225,147,0.4)" }}>
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-mint-soft text-mint">
                      <TrendingUp size={18} />
                    </span>
                    <h3 className="text-sm font-black uppercase tracking-wide">{t("dogeMining.targetPanelLabel")}</h3>
                  </div>
                  <p className="text-glow-gold mt-4 text-4xl font-black text-mint">+{(economics.targetRoiPct * 100).toFixed(0)}%</p>
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
                </TiltCard>
              </Reveal>

              {/* Panel 2: protection reserve */}
              <Reveal delay={0.1}>
                <TiltCard glow="rgba(255,181,22,0.24)" className="flex h-full flex-col p-7" style={{ borderColor: "rgba(255,181,22,0.4)" }}>
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-gold-soft text-gold">
                      <Database size={18} />
                    </span>
                    <h3 className="text-sm font-black uppercase tracking-wide">{t("dogeMining.reservePanelLabel")}</h3>
                  </div>
                  <p className="text-glow-gold mt-4 text-3xl font-black text-gold">
                    <StatCounter value={reserveBalanceUsdt} decimals={2} suffix=" USDT" />
                  </p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{t("dogeMining.reserveBalanceLabel")}</p>
                  <p className="mt-4 flex-1 text-xs leading-relaxed text-muted">{t("dogeMining.reserveBody")}</p>
                </TiltCard>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ Reward calculator */}
        <section className="border-t border-line bg-panel/40" id="calculator">
          <div className="ld-container py-9 sm:py-[72px]">
            <Reveal className="text-center">
              <span className="ld-eyebrow text-mint">{t("dogeMining.calculatorEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("dogeMining.calculatorHeading")}</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted">{t("dogeMining.calculatorBody")}</p>
            </Reveal>

            <Reveal delay={0.08} className="mt-8">
              <div className="ld-glass grid gap-6 p-6 sm:p-8 lg:grid-cols-[0.85fr_1.15fr]">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <Calculator size={18} className="text-mint" />
                    <h3 className="text-sm font-black uppercase tracking-wide">{t("dogeMining.calculatorPackageLabel")}</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {MINING_PACKAGES.map((pkg, i) => {
                      const active = calcCustomAmount.trim() === "" && i === calcPackageIndex;
                      const color = PACKAGE_COLORS[pkg.name] ?? "#5ea3ff";
                      return (
                        <button
                          key={pkg.level}
                          type="button"
                          onClick={() => {
                            setCalcPackageIndex(i);
                            setCalcCustomAmount("");
                          }}
                          className="rounded-[10px] border px-3 py-2 text-left text-xs font-bold transition"
                          style={
                            active
                              ? { borderColor: color, background: `${color}22`, color }
                              : { borderColor: "var(--line)", color: "var(--muted)" }
                          }
                        >
                          <span className="block">{pkg.name}</span>
                          <span className="block font-normal opacity-80">${pkg.priceUsdt}</span>
                        </button>
                      );
                    })}
                  </div>

                  <label className="mt-2 flex flex-col gap-1.5 text-xs font-semibold text-muted">
                    {t("dogeMining.calculatorCustomLabel")}
                    <input
                      type="number"
                      min={MIN_HASHRATE_PURCHASE_USDT}
                      step="any"
                      value={calcCustomAmount}
                      onChange={(e) => setCalcCustomAmount(e.target.value)}
                      placeholder={`${MIN_HASHRATE_PURCHASE_USDT}+`}
                      className="rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-sm font-bold text-foreground outline-none focus:border-mint/60"
                    />
                  </label>

                  <div className="flex items-center justify-between rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-xs">
                    <span className="text-muted">{t("dogeMining.calculatorShareLabel")}</span>
                    <span className="font-black text-foreground">{calcShareOfRig < 0.001 ? (calcShareOfRig * 100).toFixed(4) : (calcShareOfRig * 100).toFixed(2)}%</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5 text-xs">
                  {[
                    { label: t("dogeMining.calculatorGrossLabel"), value: calcDailyGross, color: "text-foreground" },
                    { label: t("dogeMining.calculatorElectricityLabel"), value: -calcDailyElectricity, color: "text-[#ff8a5c]" },
                    { label: t("dogeMining.calculatorPoolFeeLabel"), value: -calcDailyPoolFee, color: "text-[#ff8a5c]" },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between rounded-[10px] border border-line bg-panel-2 px-3 py-2.5">
                      <span className="text-muted">{row.label}</span>
                      <span className="flex flex-col items-end">
                        <span className={`font-black ${row.color}`}>
                          {row.value < 0 ? "-" : ""}
                          {Math.abs(row.value / dogeUsdtRate).toFixed(2)} DOGE
                        </span>
                        <span className="text-[10px] text-muted">
                          ≈ {row.value < 0 ? "-" : ""}${Math.abs(row.value).toFixed(4)} USDT
                        </span>
                      </span>
                    </div>
                  ))}
                  <div className="mt-1 flex items-center justify-between rounded-[10px] border border-mint/40 bg-mint/10 px-3 py-3">
                    <span className="text-xs font-semibold text-muted">{t("dogeMining.calculatorTargetLabel")}</span>
                    <span className="flex flex-col items-end">
                      <span className="text-lg font-black text-mint">{(calcDailyTarget / dogeUsdtRate).toFixed(2)} DOGE</span>
                      <span className="text-[10px] text-muted">≈ ${calcDailyTarget.toFixed(4)} USDT</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-[10px] border border-gold/40 bg-gold-soft px-3 py-3">
                    <span className="text-xs font-semibold text-muted">{t("dogeMining.calculatorTermTotalLabel")}</span>
                    <span className="flex flex-col items-end">
                      <span className="text-lg font-black text-gold">{(calcTermTotalTarget / dogeUsdtRate).toFixed(2)} DOGE</span>
                      <span className="text-[10px] text-muted">≈ ${calcTermTotalTarget.toFixed(2)} USDT</span>
                    </span>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------- Mining referral rewards */}
        <section className="border-t border-line" id="mining-referrals">
          <div className="ld-container py-9 sm:py-[72px]">
            <Reveal className="text-center">
              <span className="ld-eyebrow text-gold">{t("dogeMining.referralRewardsEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("dogeMining.referralRewardsHeading")}</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted">
                {t("dogeMining.referralCommissionPrefix")}
                <strong className="font-black text-foreground">{t("dogeMining.referralCommissionBoldPhrase")}</strong>
                {t("dogeMining.referralCommissionMiddle")}
                <strong className="font-black text-gold">DOGE</strong>
                {t("dogeMining.referralCommissionSuffix")}
              </p>
            </Reveal>

            {/* Summary card */}
            <Reveal delay={0.06} className="mt-8">
              <div className="ld-glass grid grid-cols-2 gap-3 p-5 sm:p-6">
                {[
                  { label: t("dogeMining.referralSummaryDirectLabel"), value: t("dogeMining.referralSummaryDirectValue"), color: "text-mint" },
                  { label: t("dogeMining.referralSummaryIndirectLabel"), value: t("dogeMining.referralSummaryIndirectValue"), color: "text-gold" },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <p className={`text-xl font-black ${s.color} sm:text-2xl`}>{s.value}</p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{s.label}</p>
                  </div>
                ))}
              </div>
            </Reveal>

            {/* 5-node flow */}
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
              {REFERRAL_FLOW_STEPS.map((s, i) => (
                <Reveal key={s.n} delay={i * 0.06} y={20}>
                  <TiltCard glow={`${s.color}22`} className="relative h-full p-5 text-left" style={{ borderColor: `${s.color}55` }}>
                    <div
                      className="grid h-8 w-8 place-items-center rounded-full border text-xs font-black"
                      style={{ borderColor: s.color, color: s.color }}
                    >
                      {s.n}
                    </div>
                    <s.Icon size={22} className="mt-3" style={{ color: s.color, filter: `drop-shadow(0 0 10px ${s.color}66)` }} />
                    <h3 className="mt-2.5 text-sm font-black">{t(s.titleKey)}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted">
                      {s.n === "04" ? (
                        <>
                          {t("dogeMining.referralCommissionPrefix")}
                          <strong className="font-black text-foreground">{t("dogeMining.referralCommissionBoldPhrase")}</strong>
                          {t("dogeMining.referralCommissionMiddle")}
                          <strong className="font-black text-gold">DOGE</strong>
                          {t("dogeMining.referralCommissionSuffix")}
                        </>
                      ) : (
                        t(s.bodyKey)
                      )}
                    </p>
                  </TiltCard>
                </Reveal>
              ))}
            </div>

            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              {/* Qualification rules */}
              <Reveal delay={0.05}>
                <div className="ld-glass flex h-full flex-col p-6">
                  <h3 className="text-sm font-black uppercase tracking-wide">{t("dogeMining.referralRulesTitle")}</h3>
                  <ul className="mt-4 flex flex-col gap-2.5 text-xs leading-relaxed text-muted">
                    {REFERRAL_RULE_KEYS.map((key) => (
                      <li key={key} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" />
                        {t(key)}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>

              {/* Worked example */}
              <Reveal delay={0.1}>
                <div className="ld-glass flex h-full flex-col p-6">
                  <h3 className="text-sm font-black uppercase tracking-wide">{t("dogeMining.referralExampleTitle")}</h3>
                  <p className="mt-1 text-[11px] text-muted">{t("dogeMining.referralExamplePackageLabel")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {MINING_PACKAGES.map((pkg, i) => {
                      const active = referralExampleCustomAmount.trim() === "" && i === referralExamplePackageIndex;
                      const color = PACKAGE_COLORS[pkg.name] ?? "#5ea3ff";
                      return (
                        <button
                          key={pkg.level}
                          type="button"
                          onClick={() => {
                            setReferralExamplePackageIndex(i);
                            setReferralExampleCustomAmount("");
                          }}
                          className="rounded-[10px] border px-3 py-2 text-left text-xs font-bold transition"
                          style={
                            active
                              ? { borderColor: color, background: `${color}22`, color }
                              : { borderColor: "var(--line)", color: "var(--muted)" }
                          }
                        >
                          <span className="block">{pkg.name}</span>
                          <span className="block font-normal opacity-80">${pkg.priceUsdt}</span>
                        </button>
                      );
                    })}
                  </div>
                  <label className="mt-2 flex flex-col gap-1.5 text-xs font-semibold text-muted">
                    {t("dogeMining.calculatorCustomLabel")}
                    <input
                      type="number"
                      min={MIN_HASHRATE_PURCHASE_USDT}
                      step="any"
                      value={referralExampleCustomAmount}
                      onChange={(e) => setReferralExampleCustomAmount(e.target.value)}
                      placeholder={`${MIN_HASHRATE_PURCHASE_USDT}+`}
                      className="rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-sm font-bold text-foreground outline-none focus:border-mint/60"
                    />
                  </label>

                  <div className="mt-4 flex flex-col gap-2.5 text-xs">
                    <div className="flex items-center justify-between rounded-[10px] border border-mint/40 bg-mint/10 px-3 py-2.5">
                      <span className="text-muted">{t("dogeMining.referralExampleL1Label")}</span>
                      <span className="font-black text-mint">{referralExampleL1Doge.toFixed(4)} DOGE / day</span>
                    </div>
                    <div className="flex items-center justify-between rounded-[10px] border border-gold/40 bg-gold-soft px-3 py-2.5">
                      <span className="text-muted">{t("dogeMining.referralExampleL2Label")}</span>
                      <span className="font-black text-gold">{referralExampleL2Doge.toFixed(4)} DOGE / day</span>
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>

            <Reveal delay={0.1} className="mt-8 flex justify-center">
              <Link href="/referral-network" className="ld-btn-flat btn-game group inline-flex items-center gap-1.5 text-xs">
                {t("dogeMining.referralCta")}
                <ArrowRight size={14} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            </Reveal>
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
                <div className="relative mx-auto aspect-square w-full max-w-[340px]">
                  <div
                    aria-hidden
                    className="absolute inset-0 rounded-full"
                    style={{ background: "radial-gradient(closest-side, rgba(255,181,22,0.22), transparent 75%)" }}
                  />
                  <div
                    aria-hidden
                    className="absolute inset-[8%] rounded-full border border-dashed"
                    style={{ borderColor: "rgba(255,181,22,0.28)", animation: "ld-orbit-spin 36s linear infinite" }}
                  />
                  <div
                    aria-hidden
                    className="absolute inset-[18%] rounded-full border border-dashed"
                    style={{ borderColor: "rgba(34,225,147,0.22)", animation: "ld-orbit-spin-rev 48s linear infinite" }}
                  />
                  <div className="absolute inset-0 grid place-items-center">
                    <Image
                      src="/dogemine-badge.png"
                      alt={t("dogeMining.poolBadgeAlt")}
                      width={220}
                      height={220}
                      className="relative shrink-0 rounded-full drop-shadow-2xl"
                      style={{ animation: "float-coin 6s ease-in-out infinite" }}
                    />
                  </div>
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.3, ease: EASE }}
                    className="ld-glass absolute -bottom-2 inset-x-4 mx-auto flex w-fit max-w-[92%] items-center justify-center gap-2 px-4 py-2.5 text-center text-xs font-bold"
                    style={{ animation: "float-coin-alt 5s ease-in-out infinite" }}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mint" style={{ animation: "led-pulse 1.6s ease-in-out infinite" }} />
                    <span className="text-mint">
                      <StatCounter value={platformStats.totalHashrateGhs} decimals={2} suffix=" GH/s" />
                    </span>
                    <span className="text-muted">{t("dogeMining.poolActiveHashrate")}</span>
                  </motion.div>
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

            <div className="mt-6 flex flex-col gap-2 lg:flex-row lg:items-start lg:gap-4">
              {[0, 1].map((col) => (
                <div key={col} className="flex flex-1 flex-col gap-2">
                  {FAQ_KEYS.filter((_, i) => i % 2 === col).map((f) => {
                    const i = FAQ_KEYS.indexOf(f);
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
              ))}
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
                  <GatedLink href="/dashboard/mining" className="ld-btn-flat ld-btn-ghost rounded-full border bg-panel-2 px-4 text-xs font-bold uppercase tracking-wide">
                    {t("dogeMining.dashboardButton")}
                  </GatedLink>
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
