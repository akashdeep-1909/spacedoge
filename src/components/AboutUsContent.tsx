"use client";

import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import {
  Rocket,
  Eye,
  Wallet,
  Gauge,
  Clock,
  Gamepad2,
  Award,
  Zap,
  Coins,
  RefreshCw,
  Scale,
  SlidersHorizontal,
  Users,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { Reveal, TiltCard, EASE, Starfield } from "@/components/motionPrimitives";

const HERO_BADGES = [
  { Icon: Wallet, key: "aboutUs.heroBadge1" as const, sub: "aboutUs.heroBadge1Sub" as const },
  { Icon: Gauge, key: "aboutUs.heroBadge2" as const, sub: "aboutUs.heroBadge2Sub" as const },
  { Icon: ShieldCheck, key: "aboutUs.heroBadge3" as const, sub: "aboutUs.heroBadge3Sub" as const },
  { Icon: Clock, key: "aboutUs.heroBadge4" as const, sub: "aboutUs.heroBadge4Sub" as const },
] as const;

const JOURNEY = [
  { Icon: Gamepad2, color: "#a78bfa", key: "aboutUs.flow1Title" as const },
  { Icon: Award, color: "#22e193", key: "aboutUs.flow2Title" as const },
  { Icon: Zap, color: "#ffb516", key: "aboutUs.flow3Title" as const },
  { Icon: Coins, color: "#5ea3ff", key: "aboutUs.flow4Title" as const },
  { Icon: RefreshCw, color: "#ff8a45", key: "aboutUs.flow5Title" as const },
] as const;

const FLOW_STEPS = [
  { Icon: Gamepad2, color: "#a78bfa", titleKey: "aboutUs.flow1Title" as const, bodyKey: "aboutUs.flow1Body" as const },
  { Icon: Award, color: "#22e193", titleKey: "aboutUs.flow2Title" as const, bodyKey: "aboutUs.flow2Body" as const },
  { Icon: Zap, color: "#ffb516", titleKey: "aboutUs.flow3Title" as const, bodyKey: "aboutUs.flow3Body" as const },
  { Icon: Coins, color: "#5ea3ff", titleKey: "aboutUs.flow4Title" as const, bodyKey: "aboutUs.flow4Body" as const },
  { Icon: RefreshCw, color: "#ff8a45", titleKey: "aboutUs.flow5Title" as const, bodyKey: "aboutUs.flow5Body" as const },
] as const;

const VALUES = [
  { Icon: Eye, color: "#a78bfa", titleKey: "aboutUs.value1Title" as const, bodyKey: "aboutUs.value1Body" as const },
  { Icon: Scale, color: "#22e193", titleKey: "aboutUs.value2Title" as const, bodyKey: "aboutUs.value2Body" as const },
  { Icon: SlidersHorizontal, color: "#ffb516", titleKey: "aboutUs.value3Title" as const, bodyKey: "aboutUs.value3Body" as const },
  { Icon: Users, color: "#5ea3ff", titleKey: "aboutUs.value4Title" as const, bodyKey: "aboutUs.value4Body" as const },
] as const;

const COMMITMENTS = [
  { titleKey: "aboutUs.commitment1Title" as const, bodyKey: "aboutUs.commitment1Body" as const, color: "#22e193" },
  { titleKey: "aboutUs.commitment2Title" as const, bodyKey: "aboutUs.commitment2Body" as const, color: "#a78bfa" },
  { titleKey: "aboutUs.commitment3Title" as const, bodyKey: "aboutUs.commitment3Body" as const, color: "#ffb516" },
] as const;

const STORY_POINTS = [
  { n: "1", titleKey: "aboutUs.storyPoint1Title" as const, bodyKey: "aboutUs.storyPoint1Body" as const },
  { n: "2", titleKey: "aboutUs.storyPoint2Title" as const, bodyKey: "aboutUs.storyPoint2Body" as const },
  { n: "3", titleKey: "aboutUs.storyPoint3Title" as const, bodyKey: "aboutUs.storyPoint3Body" as const },
] as const;

const ROADMAP_PHASES = [
  {
    tabKey: "aboutUs.roadmapTabNow" as const,
    milestones: [
      { titleKey: "aboutUs.roadmapNow1Title" as const, bodyKey: "aboutUs.roadmapNow1Body" as const },
      { titleKey: "aboutUs.roadmapNow2Title" as const, bodyKey: "aboutUs.roadmapNow2Body" as const },
      { titleKey: "aboutUs.roadmapNow3Title" as const, bodyKey: "aboutUs.roadmapNow3Body" as const },
    ],
  },
  {
    tabKey: "aboutUs.roadmapTabNext" as const,
    milestones: [
      { titleKey: "aboutUs.roadmapNext1Title" as const, bodyKey: "aboutUs.roadmapNext1Body" as const },
      { titleKey: "aboutUs.roadmapNext2Title" as const, bodyKey: "aboutUs.roadmapNext2Body" as const },
      { titleKey: "aboutUs.roadmapNext3Title" as const, bodyKey: "aboutUs.roadmapNext3Body" as const },
    ],
  },
  {
    tabKey: "aboutUs.roadmapTabLater" as const,
    milestones: [
      { titleKey: "aboutUs.roadmapLater1Title" as const, bodyKey: "aboutUs.roadmapLater1Body" as const },
      { titleKey: "aboutUs.roadmapLater2Title" as const, bodyKey: "aboutUs.roadmapLater2Body" as const },
      { titleKey: "aboutUs.roadmapLater3Title" as const, bodyKey: "aboutUs.roadmapLater3Body" as const },
    ],
  },
] as const;

export function AboutUsContent() {
  const { t } = useLocale();
  const reduceMotion = useReducedMotion();
  const [activePhase, setActivePhase] = useState(0);

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
            <span style={{ left: "8%", top: "-14%", width: 460, height: 460, background: "rgba(255,181,22,0.16)", animation: "aurora-drift-1 16s ease-in-out infinite" }} />
            <span style={{ right: "4%", top: "2%", width: 420, height: 420, background: "rgba(167,139,250,0.2)", animation: "aurora-drift-2 20s ease-in-out infinite" }} />
            <span style={{ left: "30%", bottom: "-18%", width: 440, height: 440, background: "rgba(34,225,147,0.12)", animation: "aurora-drift-3 18s ease-in-out infinite" }} />
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
                {t("aboutUs.eyebrow")}
              </motion.span>
              <motion.h1
                initial={{ clipPath: "inset(0 100% 0 0)", opacity: 0 }}
                animate={{ clipPath: "inset(0 0% 0 0)", opacity: 1 }}
                transition={{ duration: reduceMotion ? 0.2 : 0.9, delay: 0.1, ease: EASE }}
                className="text-glow-gold text-balance text-[clamp(2rem,5.4vw,3.75rem)] font-extrabold leading-[1.02] tracking-[-0.03em] text-gold"
              >
                {t("aboutUs.titleLine1")} <span style={{ color: "#ffb516" }}>{t("aboutUs.titleHighlight1")}</span> {t("aboutUs.titleMid")}{" "}
                <span style={{ color: "#a78bfa" }}>{t("aboutUs.titleHighlight2")}</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.25, ease: EASE }}
                className="max-w-[520px] text-[15px] leading-relaxed text-muted"
              >
                {t("aboutUs.lead")}
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4, ease: EASE }}
                className="mt-1 flex flex-wrap items-center gap-3"
              >
                <Link href="/how-it-works" className="btn-game hud-corner group inline-flex items-center gap-1.5 text-sm">
                  {t("aboutUs.exploreButton")}
                  <ArrowRight size={15} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
                <ConnectWalletButton />
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
              <TiltCard glow="rgba(255,181,22,0.24)" className="p-6" style={{ borderColor: "rgba(255,181,22,0.4)" }}>
                <div className="flex items-center gap-2">
                  <Rocket size={18} className="text-gold" />
                  <h3 className="text-sm font-black uppercase tracking-wide">{t("aboutUs.liveCardTitle")}</h3>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">{t("aboutUs.liveCardBody")}</p>
                <div className="mt-5 flex flex-col gap-2.5">
                  {JOURNEY.map((step, i) => (
                    <div key={step.key} className="flex items-center gap-2.5 rounded-[10px] border border-line bg-panel-2 px-3 py-2.5">
                      <span
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[10px] font-black"
                        style={{ borderColor: step.color, color: step.color }}
                      >
                        {i + 1}
                      </span>
                      <step.Icon size={15} style={{ color: step.color }} className="shrink-0" />
                      <span className="text-xs font-semibold text-foreground">{t(step.key)}</span>
                    </div>
                  ))}
                </div>
                <div aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full" style={{ background: "radial-gradient(closest-side, rgba(255,181,22,0.28), transparent 75%)", animation: "float-coin 5s ease-in-out infinite" }} />
              </TiltCard>
            </motion.div>
          </div>
        </section>

        {/* ----------------------------------------------- Mission / Vision */}
        <section className="border-t border-line bg-panel/40" id="mission">
          <div className="ld-container py-9 sm:py-[72px]">
            <Reveal className="text-center">
              <span className="ld-eyebrow text-gold">{t("aboutUs.missionEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("aboutUs.missionHeading")}</h2>
            </Reveal>

            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              <Reveal delay={0.05}>
                <TiltCard glow="rgba(167,139,250,0.22)" className="h-full p-7" style={{ borderColor: "rgba(167,139,250,0.4)" }}>
                  <span className="grid h-14 w-14 place-items-center rounded-[16px] border" style={{ borderColor: "#a78bfa", color: "#a78bfa" }}>
                    <Rocket size={26} />
                  </span>
                  <h3 className="mt-4 text-lg font-black">{t("aboutUs.missionTitle")}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{t("aboutUs.missionBody1")}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{t("aboutUs.missionBody2")}</p>
                </TiltCard>
              </Reveal>

              <Reveal delay={0.1}>
                <TiltCard glow="rgba(34,225,147,0.22)" className="h-full p-7" style={{ borderColor: "rgba(34,225,147,0.4)" }}>
                  <span className="grid h-14 w-14 place-items-center rounded-[16px] border border-mint text-mint">
                    <Eye size={26} />
                  </span>
                  <h3 className="mt-4 text-lg font-black">{t("aboutUs.visionTitle")}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{t("aboutUs.visionBody1")}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{t("aboutUs.visionBody2")}</p>
                </TiltCard>
              </Reveal>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- Story */}
        <section className="border-t border-line" id="story">
          <div className="ld-container py-9 sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-mint">{t("aboutUs.storyEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("aboutUs.storyHeading")}</h2>
            </Reveal>

            <Reveal delay={0.08} className="mt-8">
              <div className="ld-glass p-7">
                <h3 className="text-lg font-black">{t("aboutUs.storyTitle")}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{t("aboutUs.storyBody1")}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{t("aboutUs.storyBody2")}</p>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {STORY_POINTS.map((p) => (
                    <div key={p.n} className="flex items-start gap-3 rounded-[12px] border border-line bg-panel-2 p-4">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-gold text-xs font-black text-gold">
                        {p.n}
                      </span>
                      <div>
                        <h4 className="text-sm font-bold">{t(p.titleKey)}</h4>
                        <p className="mt-1 text-xs leading-relaxed text-muted">{t(p.bodyKey)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* --------------------------------------------------- Ecosystem flow */}
        <section className="border-t border-line bg-panel/40" id="ecosystem">
          <div className="ld-container py-9 text-center sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-gold">{t("aboutUs.flowEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("aboutUs.flowHeading")}</h2>
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
              {FLOW_STEPS.map((s, i) => (
                <Reveal key={s.titleKey} delay={i * 0.08} y={20}>
                  <TiltCard glow={`${s.color}22`} className="relative h-full p-6 text-left" style={{ borderColor: `${s.color}55` }}>
                    <s.Icon size={26} style={{ color: s.color, filter: `drop-shadow(0 0 10px ${s.color}66)` }} />
                    <h3 className="mt-3 text-sm font-black">{t(s.titleKey)}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">{t(s.bodyKey)}</p>
                  </TiltCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- Values */}
        <section className="border-t border-line" id="values">
          <div className="ld-container py-9 text-center sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-mint">{t("aboutUs.valuesEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("aboutUs.valuesHeading")}</h2>
            </Reveal>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {VALUES.map((v, i) => (
                <Reveal key={v.titleKey} delay={i * 0.08}>
                  <TiltCard glow={`${v.color}22`} className="h-full p-6 text-left" style={{ borderColor: `${v.color}55` }}>
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border" style={{ borderColor: v.color, color: v.color }}>
                      <v.Icon size={22} />
                    </span>
                    <h3 className="mt-4 text-base font-black">{t(v.titleKey)}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{t(v.bodyKey)}</p>
                  </TiltCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- Commitments */}
        <section className="border-t border-line bg-panel/40" id="commitments">
          <div className="ld-container py-9 text-center sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-gold">{t("aboutUs.commitmentsEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("aboutUs.commitmentsHeading")}</h2>
            </Reveal>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {COMMITMENTS.map((c, i) => (
                <Reveal key={c.titleKey} delay={i * 0.08}>
                  <div className="ld-glass h-full p-6 text-left">
                    <h3 className="text-base font-black" style={{ color: c.color }}>
                      {t(c.titleKey)}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{t(c.bodyKey)}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- Team */}
        <section className="border-t border-line" id="team">
          <div className="ld-container py-9 text-center sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-mint">{t("aboutUs.teamEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("aboutUs.teamHeading")}</h2>
            </Reveal>

            <Reveal delay={0.08} className="mt-8">
              <div className="ld-glass glow-gold mx-auto max-w-3xl p-8">
                <p className="text-sm leading-relaxed text-foreground">{t("aboutUs.teamBody1")}</p>
                <p className="mt-3 text-sm leading-relaxed text-muted">{t("aboutUs.teamBody2")}</p>
                <p className="mt-3 text-sm leading-relaxed text-muted">{t("aboutUs.teamBody3")}</p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* -------------------------------------------------------- Roadmap */}
        <section className="border-t border-line bg-panel/40" id="roadmap">
          <div className="ld-container py-9 text-center sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-gold">{t("aboutUs.roadmapEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("aboutUs.roadmapHeading")}</h2>
            </Reveal>

            <Reveal delay={0.06} className="mt-8">
              <div className="flex flex-wrap items-center justify-center gap-2">
                {ROADMAP_PHASES.map((phase, i) => (
                  <button
                    key={phase.tabKey}
                    onClick={() => setActivePhase(i)}
                    className={activePhase === i ? "btn-game hud-corner rounded-full px-4 py-1.5 text-xs" : "btn-game-outline rounded-full px-4 py-1.5 text-xs"}
                  >
                    {t(phase.tabKey)}
                  </button>
                ))}
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                {ROADMAP_PHASES[activePhase].milestones.map((m) => (
                  <div key={m.titleKey} className="ld-glass h-full p-6 text-left">
                    <h3 className="text-sm font-black text-gold">{t(m.titleKey)}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">{t(m.bodyKey)}</p>
                  </div>
                ))}
              </div>

              <p className="mx-auto mt-5 max-w-2xl text-center text-[11px] leading-relaxed text-muted/70">{t("aboutUs.roadmapNote")}</p>
            </Reveal>
          </div>
        </section>

        {/* -------------------------------------------------------- CTA */}
        <section className="relative overflow-hidden border-t border-line">
          <div aria-hidden className="ld-aurora">
            <span style={{ left: "10%", top: "-30%", width: 420, height: 420, background: "rgba(255,181,22,0.14)", animation: "aurora-drift-1 14s ease-in-out infinite" }} />
            <span style={{ right: "8%", bottom: "-30%", width: 380, height: 380, background: "rgba(167,139,250,0.12)", animation: "aurora-drift-2 17s ease-in-out infinite" }} />
          </div>
          <div className="ld-container relative py-9 sm:py-[72px]">
            <Reveal>
              <div className="ld-glass glow-gold flex min-h-[200px] flex-col items-center justify-center gap-4 p-[42px] text-center">
                <span className="ld-eyebrow text-mint">{t("aboutUs.ctaEyebrow")}</span>
                <h2 className="text-glow-gold ld-h2">{t("aboutUs.ctaHeading")}</h2>
                <p className="max-w-xl text-sm text-muted">{t("aboutUs.ctaBody")}</p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Link href="/how-it-works" className="btn-game hud-corner inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm">
                    {t("aboutUs.exploreButton")}
                  </Link>
                  <ConnectWalletButton />
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
