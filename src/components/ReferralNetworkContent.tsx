"use client";

import { useState, type MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import {
  Users,
  Link2,
  Wallet,
  Share2,
  Coins,
  TrendingUp,
  ArrowRight,
  ChevronDown,
  GitBranch,
  ListChecks,
  Ban,
  Layers,
  ScrollText,
} from "lucide-react";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { Reveal, StatCounter, TiltCard, EASE, Starfield } from "@/components/motionPrimitives";
import { REFERRAL_L1_PCT, REFERRAL_L2_PCT } from "@/lib/game-config";

interface ReferralStats {
  totalRelationships: number;
  qualifiedRelationships: number;
  distributedUsdt: number;
}

const HERO_BADGES = [
  { Icon: TrendingUp, key: "referralNetwork.heroBadge1" as const, sub: "referralNetwork.heroBadge1Sub" as const },
  { Icon: GitBranch, key: "referralNetwork.heroBadge2" as const, sub: "referralNetwork.heroBadge2Sub" as const },
  { Icon: Layers, key: "referralNetwork.heroBadge3" as const, sub: "referralNetwork.heroBadge3Sub" as const },
  { Icon: Coins, key: "referralNetwork.heroBadge4" as const, sub: "referralNetwork.heroBadge4Sub" as const },
] as const;

const HOW_IT_WORKS_STEPS = [
  { n: "01", Icon: Wallet, color: "#5ea3ff", titleKey: "referralNetwork.step1Title" as const, bodyKey: "referralNetwork.step1Body" as const },
  { n: "02", Icon: Share2, color: "#a78bfa", titleKey: "referralNetwork.step2Title" as const, bodyKey: "referralNetwork.step2Body" as const },
  { n: "03", Icon: Users, color: "#22e193", titleKey: "referralNetwork.step3Title" as const, bodyKey: "referralNetwork.step3Body" as const },
  { n: "04", Icon: Coins, color: "#ffb516", titleKey: "referralNetwork.step4Title" as const, bodyKey: "referralNetwork.step4Body" as const },
  { n: "05", Icon: TrendingUp, color: "#22e193", titleKey: "referralNetwork.step5Title" as const, bodyKey: "referralNetwork.step5Body" as const },
] as const;

const TRUST_ITEMS = [
  { Icon: ListChecks, color: "#5ea3ff", titleKey: "referralNetwork.trust1Title" as const, bodyKey: "referralNetwork.trust1Body" as const },
  { Icon: Ban, color: "#ff6b5c", titleKey: "referralNetwork.trust2Title" as const, bodyKey: "referralNetwork.trust2Body" as const },
  { Icon: Layers, color: "#a78bfa", titleKey: "referralNetwork.trust3Title" as const, bodyKey: "referralNetwork.trust3Body" as const },
  { Icon: ScrollText, color: "#22e193", titleKey: "referralNetwork.trust4Title" as const, bodyKey: "referralNetwork.trust4Body" as const },
] as const;

const FAQ_KEYS = [
  { qKey: "referralNetwork.faq1Q" as const, aKey: "referralNetwork.faq1A" as const },
  { qKey: "referralNetwork.faq2Q" as const, aKey: "referralNetwork.faq2A" as const },
  { qKey: "referralNetwork.faq3Q" as const, aKey: "referralNetwork.faq3A" as const },
  { qKey: "referralNetwork.faq4Q" as const, aKey: "referralNetwork.faq4A" as const },
  { qKey: "referralNetwork.faq5Q" as const, aKey: "referralNetwork.faq5A" as const },
  { qKey: "referralNetwork.faq6Q" as const, aKey: "referralNetwork.faq6A" as const },
  { qKey: "referralNetwork.faq7Q" as const, aKey: "referralNetwork.faq7A" as const },
  { qKey: "referralNetwork.faq8Q" as const, aKey: "referralNetwork.faq8A" as const },
] as const;

// Real Rookie Rush ($1 entry, 4-player room) math — same constants the
// settlement code itself uses, not invented figures.
const EXAMPLE_ENTRY_USDT = 1;
const EXAMPLE_PLAYERS = 4;
const EXAMPLE_ROOM_VOLUME = EXAMPLE_ENTRY_USDT * EXAMPLE_PLAYERS;
const EXAMPLE_PLAYER_POOL = EXAMPLE_ROOM_VOLUME * 0.7;
const EXAMPLE_PLATFORM_FEE = EXAMPLE_ROOM_VOLUME * 0.3;
const EXAMPLE_L1 = EXAMPLE_PLATFORM_FEE * REFERRAL_L1_PCT;
const EXAMPLE_L2 = EXAMPLE_PLATFORM_FEE * REFERRAL_L2_PCT;

export function ReferralNetworkContent({ stats }: { stats: ReferralStats }) {
  const { t } = useLocale();
  const reduceMotion = useReducedMotion();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

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
            <span style={{ left: "8%", top: "-14%", width: 460, height: 460, background: "rgba(167,139,250,0.2)", animation: "aurora-drift-1 16s ease-in-out infinite" }} />
            <span style={{ right: "4%", top: "2%", width: 420, height: 420, background: "rgba(34,225,147,0.16)", animation: "aurora-drift-2 20s ease-in-out infinite" }} />
            <span style={{ left: "30%", bottom: "-18%", width: 440, height: 440, background: "rgba(255,181,22,0.12)", animation: "aurora-drift-3 18s ease-in-out infinite" }} />
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
                {t("referralNetwork.eyebrow")}
              </motion.span>
              <motion.h1
                initial={{ clipPath: "inset(0 100% 0 0)", opacity: 0 }}
                animate={{ clipPath: "inset(0 0% 0 0)", opacity: 1 }}
                transition={{ duration: reduceMotion ? 0.2 : 0.9, delay: 0.1, ease: EASE }}
                className="text-glow-gold text-balance text-[clamp(2.25rem,6vw,4.25rem)] font-extrabold leading-[0.98] tracking-[-0.03em] text-gold"
              >
                {t("referralNetwork.titleLine1")}
                <br />
                {t("referralNetwork.titleLine2")}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.25, ease: EASE }}
                className="max-w-[520px] text-[15px] leading-relaxed text-muted"
              >
                {t("referralNetwork.lead")}
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4, ease: EASE }}
                className="mt-1 flex flex-wrap items-center gap-3"
              >
                <Link href="/dashboard/refer" className="btn-game hud-corner group inline-flex items-center gap-1.5 text-sm">
                  {t("referralNetwork.linkButton")}
                  <ArrowRight size={15} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
                <a href="#how" className="btn-game-outline hud-corner text-sm font-bold uppercase tracking-wide">
                  {t("referralNetwork.howButton")}
                </a>
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
              <TiltCard glow="rgba(167,139,250,0.24)" className="p-6" style={{ borderColor: "rgba(167,139,250,0.4)" }}>
                <div className="flex items-center gap-2">
                  <GitBranch size={18} className="text-mint" />
                  <h3 className="text-sm font-black uppercase tracking-wide">{t("referralNetwork.liveCardTitle")}</h3>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-2xl">
                      <StatCounter value={stats.totalRelationships} />
                    </p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{t("referralNetwork.liveRelationships")}</p>
                  </div>
                  <div>
                    <p className="text-2xl">
                      <StatCounter value={stats.qualifiedRelationships} />
                    </p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{t("referralNetwork.liveQualified")}</p>
                  </div>
                </div>
                <div className="mt-5 rounded-[12px] border border-line bg-panel-2 p-4">
                  <p className="text-2xl">
                    <StatCounter value={stats.distributedUsdt} decimals={2} suffix=" USDT" />
                  </p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-mint">{t("referralNetwork.liveDistributed")}</p>
                </div>
                <div aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full" style={{ background: "radial-gradient(closest-side, rgba(167,139,250,0.28), transparent 75%)", animation: "float-coin 5s ease-in-out infinite" }} />
              </TiltCard>
            </motion.div>
          </div>
        </section>

        {/* --------------------------------------------- Two-level structure */}
        <section className="border-t border-line bg-panel/40" id="levels">
          <div className="ld-container py-9 sm:py-[72px]">
            <Reveal className="text-center">
              <span className="ld-eyebrow text-gold">{t("referralNetwork.levelsEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("referralNetwork.levelsHeading")}</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted">{t("referralNetwork.levelsBody")}</p>
            </Reveal>

            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              <Reveal delay={0.05}>
                <TiltCard glow="rgba(167,139,250,0.22)" className="h-full p-7" style={{ borderColor: "rgba(167,139,250,0.4)" }}>
                  <span className="rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide" style={{ background: "rgba(167,139,250,0.18)", color: "#a78bfa" }}>
                    {t("referralNetwork.level1Badge")}
                  </span>
                  <p className="mt-3 text-5xl font-black" style={{ color: "#a78bfa" }}>
                    {t("referralNetwork.level1Rate")}
                  </p>
                  <h3 className="mt-2 text-lg font-black">{t("referralNetwork.level1Title")}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{t("referralNetwork.level1Body")}</p>
                  <ul className="mt-4 flex flex-col gap-2 text-sm text-muted">
                    {(["referralNetwork.level1Bullet1", "referralNetwork.level1Bullet2", "referralNetwork.level1Bullet3", "referralNetwork.level1Bullet4"] as const).map((k) => (
                      <li key={k} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#a78bfa" }} />
                        {t(k)}
                      </li>
                    ))}
                  </ul>
                </TiltCard>
              </Reveal>

              <Reveal delay={0.1}>
                <TiltCard glow="rgba(34,225,147,0.22)" className="h-full p-7" style={{ borderColor: "rgba(34,225,147,0.4)" }}>
                  <span className="rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide" style={{ background: "rgba(34,225,147,0.18)", color: "#22e193" }}>
                    {t("referralNetwork.level2Badge")}
                  </span>
                  <p className="mt-3 text-5xl font-black text-mint">{t("referralNetwork.level2Rate")}</p>
                  <h3 className="mt-2 text-lg font-black">{t("referralNetwork.level2Title")}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{t("referralNetwork.level2Body")}</p>
                  <ul className="mt-4 flex flex-col gap-2 text-sm text-muted">
                    {(["referralNetwork.level2Bullet1", "referralNetwork.level2Bullet2", "referralNetwork.level2Bullet3", "referralNetwork.level2Bullet4"] as const).map((k) => (
                      <li key={k} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />
                        {t(k)}
                      </li>
                    ))}
                  </ul>
                </TiltCard>
              </Reveal>
            </div>

            <Reveal delay={0.12} className="mt-6">
              <p className="mx-auto max-w-2xl text-center text-xs leading-relaxed text-muted">{t("referralNetwork.fundingNote")}</p>
            </Reveal>
          </div>
        </section>

        {/* --------------------------------------------------- How It Works */}
        <section className="border-t border-line" id="how">
          <div className="ld-container py-9 text-center sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-mint">{t("referralNetwork.howEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("referralNetwork.howHeading")}</h2>
            </Reveal>

            <div className="relative mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
              <motion.div
                aria-hidden
                className="absolute left-0 right-0 top-1/2 hidden origin-left border-t border-dashed border-line lg:block"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true, margin: "-10% 0px" }}
                transition={{ duration: 1, ease: EASE }}
              />
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

        {/* -------------------------------------------------- Dashboard teaser */}
        <section className="relative overflow-hidden border-t border-line bg-panel/40" id="dashboard">
          <div className="ld-container py-9 sm:py-[72px]">
            <div className="grid items-center gap-8 lg:grid-cols-2">
              <Reveal>
                <span className="ld-eyebrow text-gold">{t("referralNetwork.dashboardEyebrow")}</span>
                <h2 className="ld-h2 mt-2">{t("referralNetwork.dashboardHeading")}</h2>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{t("referralNetwork.dashboardBody")}</p>
                <ul className="mt-4 flex flex-col gap-2 text-sm text-muted">
                  {(["referralNetwork.dashboardBullet1", "referralNetwork.dashboardBullet2", "referralNetwork.dashboardBullet3"] as const).map((k) => (
                    <li key={k} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                      {t(k)}
                    </li>
                  ))}
                </ul>
                <Link href="/dashboard/refer" className="ld-btn-flat btn-game group mt-6 inline-flex items-center gap-1.5 text-xs">
                  {t("referralNetwork.dashboardCta")}
                  <ArrowRight size={14} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
                <div className="mt-4 rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-xs">
                  <span className="font-bold text-muted">{t("referralNetwork.linkFormatLabel")}: </span>
                  <span className="font-mono text-gold">{t("referralNetwork.linkFormatExample")}</span>
                </div>
              </Reveal>

              <Reveal delay={0.1}>
                <div className="relative mx-auto flex h-[300px] w-full max-w-sm items-center justify-center overflow-hidden rounded-[18px] border border-line">
                  <div
                    aria-hidden
                    className="absolute inset-0"
                    style={{ background: "radial-gradient(circle at 50% 50%, rgba(167,139,250,0.2), transparent 70%), radial-gradient(circle at 20% 80%, rgba(34,225,147,0.14), transparent 60%)" }}
                  />
                  <div aria-hidden className="absolute h-[290px] w-[290px] rounded-full border border-dashed" style={{ borderColor: "rgba(34,225,147,0.26)", animation: "ld-orbit-spin 30s linear infinite" }} />
                  <div aria-hidden className="absolute h-[180px] w-[180px] rounded-full border border-dashed" style={{ borderColor: "rgba(167,139,250,0.3)", animation: "ld-orbit-spin-rev 22s linear infinite" }} />

                  {[
                    { angle: 0, radius: 90, color: "#a78bfa" },
                    { angle: 90, radius: 90, color: "#a78bfa" },
                    { angle: 180, radius: 90, color: "#a78bfa" },
                    { angle: 270, radius: 90, color: "#a78bfa" },
                  ].map((n, i) => (
                    <span
                      key={`l1-${i}`}
                      aria-hidden
                      className="absolute grid h-8 w-8 place-items-center rounded-full border text-[10px] font-black"
                      style={{
                        left: `calc(50% + ${n.radius * Math.cos((n.angle * Math.PI) / 180)}px - 16px)`,
                        top: `calc(50% + ${n.radius * Math.sin((n.angle * Math.PI) / 180)}px - 16px)`,
                        borderColor: n.color,
                        color: n.color,
                        background: "rgba(5,17,29,.94)",
                      }}
                    >
                      L1
                    </span>
                  ))}
                  {[45, 135, 225, 315].map((angle, i) => (
                    <span
                      key={`l2-${i}`}
                      aria-hidden
                      className="absolute grid h-7 w-7 place-items-center rounded-full border text-[9px] font-black text-mint"
                      style={{
                        left: `calc(50% + ${145 * Math.cos((angle * Math.PI) / 180)}px - 14px)`,
                        top: `calc(50% + ${145 * Math.sin((angle * Math.PI) / 180)}px - 14px)`,
                        borderColor: "#22e193",
                        background: "rgba(5,17,29,.94)",
                      }}
                    >
                      L2
                    </span>
                  ))}

                  <span className="relative grid h-14 w-14 place-items-center rounded-full border border-gold text-xs font-black text-gold" style={{ background: "rgba(5,17,29,.96)", animation: "float-coin 4s ease-in-out infinite" }}>
                    <Link2 size={20} />
                  </span>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- Reward math */}
        <section className="border-t border-line" id="math">
          <div className="ld-container py-9 sm:py-[72px]">
            <Reveal className="text-center">
              <span className="ld-eyebrow text-mint">{t("referralNetwork.mathEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("referralNetwork.mathHeading")}</h2>
            </Reveal>

            <Reveal delay={0.06} className="mt-8">
              <div className="ld-glass mx-auto max-w-2xl p-7">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-wide text-gold">{t("referralNetwork.mathPanelLabel")}</h3>
                  <span className="text-xs font-semibold text-muted">{t("referralNetwork.mathPanelSub")}</span>
                </div>
                <div className="mt-4 flex flex-col gap-2.5 text-sm">
                  <div className="flex items-center justify-between border-b border-line pb-2.5">
                    <span className="text-muted">{t("referralNetwork.mathRoomVolume")}</span>
                    <span className="font-bold text-foreground">{EXAMPLE_ROOM_VOLUME.toFixed(3)} USDT</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-line pb-2.5">
                    <span className="text-muted">{t("referralNetwork.mathPlayerPool")}</span>
                    <span className="font-bold text-mint">{EXAMPLE_PLAYER_POOL.toFixed(3)} USDT</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-line pb-2.5">
                    <span className="text-muted">{t("referralNetwork.mathPlatformFee")}</span>
                    <span className="font-bold text-gold">{EXAMPLE_PLATFORM_FEE.toFixed(3)} USDT</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between rounded-[10px] border border-line bg-panel-2 px-3 py-2.5">
                    <span className="font-bold text-foreground">{t("referralNetwork.mathL1")}</span>
                    <span className="font-black" style={{ color: "#a78bfa" }}>
                      {EXAMPLE_L1.toFixed(4)} USDT
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-[10px] border border-line bg-panel-2 px-3 py-2.5">
                    <span className="font-bold text-foreground">{t("referralNetwork.mathL2")}</span>
                    <span className="font-black text-mint">{EXAMPLE_L2.toFixed(4)} USDT</span>
                  </div>
                </div>
                <p className="mt-4 text-[11px] leading-relaxed text-muted/80">{t("referralNetwork.mathNote")}</p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ---------------------------------------------------------- Trust */}
        <section className="border-t border-line bg-panel/40" id="trust">
          <div className="ld-container py-9 text-center sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-gold">{t("referralNetwork.trustEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("referralNetwork.trustHeading")}</h2>
            </Reveal>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {TRUST_ITEMS.map((item, i) => (
                <Reveal key={item.titleKey} delay={i * 0.08}>
                  <motion.div whileHover={{ y: -3 }} className="ld-glass flex h-full flex-col items-center gap-3 p-6 text-center">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border" style={{ borderColor: item.color, color: item.color }}>
                      <item.Icon size={22} />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold">{t(item.titleKey)}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-muted">{t(item.bodyKey)}</p>
                    </div>
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
              <span className="ld-eyebrow text-mint">{t("referralNetwork.faqEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("referralNetwork.faqHeading")}</h2>
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
            <span style={{ left: "10%", top: "-30%", width: 420, height: 420, background: "rgba(167,139,250,0.14)", animation: "aurora-drift-1 14s ease-in-out infinite" }} />
            <span style={{ right: "8%", bottom: "-30%", width: 380, height: 380, background: "rgba(255,181,22,0.12)", animation: "aurora-drift-2 17s ease-in-out infinite" }} />
          </div>
          <div className="ld-container relative py-9 sm:py-[72px]">
            <Reveal>
              <div className="ld-glass glow-gold flex min-h-[200px] flex-col items-center justify-center gap-4 p-[42px] text-center">
                <span className="ld-eyebrow text-mint">{t("referralNetwork.ctaEyebrow")}</span>
                <h2 className="text-glow-gold ld-h2">{t("referralNetwork.ctaHeading")}</h2>
                <p className="max-w-xl text-sm text-muted">{t("referralNetwork.ctaBody")}</p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <ConnectWalletButton />
                  <Link href="/dashboard/refer" className="ld-btn-flat ld-btn-ghost rounded-full border bg-panel-2 px-4 text-xs font-bold uppercase tracking-wide">
                    {t("referralNetwork.linkButton")}
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
