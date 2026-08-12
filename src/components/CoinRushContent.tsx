"use client";

import { type MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import {
  Rocket,
  Target,
  Users,
  Clock3,
  Trophy,
  Flame,
  Magnet,
  ShieldCheck,
  Zap,
  Coins,
  ArrowRight,
  Wallet,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { GatedLink } from "@/components/GatedLink";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { Reveal, TiltCard, EASE, Starfield } from "@/components/motionPrimitives";
import { GAME_MODE_CONFIG, DIFFICULTY_BY_MODE, RANK_TIER_SHARE_RANGE } from "@/lib/game-config";

interface PlatformStats {
  walletCount: number;
  matchCount: number;
  activeMinerCount: number;
  totalHashrateGhs: number;
  lifetimeDogeDistributed: number;
}

const HERO_BADGES = [
  { Icon: ShieldCheck, key: "coinRush.heroBadge1" as const, sub: "coinRush.heroBadge1Sub" as const },
  { Icon: Coins, key: "coinRush.heroBadge2" as const, sub: "coinRush.heroBadge2Sub" as const },
  { Icon: Users, key: "coinRush.heroBadge3" as const, sub: "coinRush.heroBadge3Sub" as const },
  { Icon: Trophy, key: "coinRush.heroBadge4" as const, sub: "coinRush.heroBadge4Sub" as const },
  { Icon: UserPlus, key: "coinRush.heroBadge5" as const, sub: "coinRush.heroBadge5Sub" as const },
] as const;

const HOW_TO_PLAY_STEPS = [
  { n: "01", Icon: Wallet, color: "#5ea3ff", titleKey: "coinRush.step1Title" as const, bodyKey: "coinRush.step1Body" as const },
  { n: "02", Icon: Rocket, color: "#a78bfa", titleKey: "coinRush.step2Title" as const, bodyKey: "coinRush.step2Body" as const },
  { n: "03", Icon: Target, color: "#22e193", titleKey: "coinRush.step3Title" as const, bodyKey: "coinRush.step3Body" as const },
  { n: "04", Icon: Trophy, color: "#ffb516", titleKey: "coinRush.step4Title" as const, bodyKey: "coinRush.step4Body" as const },
] as const;

const ARENA_BULLETS = [
  "coinRush.arenaBullet1" as const,
  "coinRush.arenaBullet2" as const,
  "coinRush.arenaBullet3" as const,
  "coinRush.arenaBullet4" as const,
  "coinRush.arenaBullet5" as const,
];

// Real tier data pulled straight from the source of truth used by
// match settlement (src/lib/game-config.ts) — every price, duration
// and difficulty label here is the actual value the game uses, not a
// copy that can drift out of sync.
const PAID_TIER_MODES = ["QUICK_RUSH", "EXPLORER_RUSH", "PRO_RUSH", "ELITE_RUSH", "CHAMPION_RUSH"] as const;
const TIER_COLORS: Record<(typeof PAID_TIER_MODES)[number], string> = {
  QUICK_RUSH: "#5ea3ff",
  EXPLORER_RUSH: "#22e193",
  PRO_RUSH: "#ffb516",
  ELITE_RUSH: "#ff8a5c",
  CHAMPION_RUSH: "#a78bfa",
};

const POWER_UPS = [
  { Icon: Magnet, color: "#5ea3ff", nameKey: "coinRush.powerUpMagnet" as const, bodyKey: "coinRush.powerUpMagnetBody" as const },
  { Icon: ShieldCheck, color: "#22e193", nameKey: "coinRush.powerUpShield" as const, bodyKey: "coinRush.powerUpShieldBody" as const },
  { Icon: Zap, color: "#ffb516", nameKey: "coinRush.powerUpBoost" as const, bodyKey: "coinRush.powerUpBoostBody" as const },
  { Icon: Flame, color: "#ff6b5c", nameKey: "coinRush.powerUpFire" as const, bodyKey: "coinRush.powerUpFireBody" as const },
] as const;

export function CoinRushContent({ platformStats }: { platformStats: PlatformStats }) {
  const { t } = useLocale();
  const reduceMotion = useReducedMotion();
  const practice = GAME_MODE_CONFIG.PRACTICE;

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
            <span style={{ left: "8%", top: "-14%", width: 460, height: 460, background: "rgba(167,139,250,0.2)", animation: "aurora-drift-1 16s ease-in-out infinite" }} />
            <span style={{ right: "4%", top: "2%", width: 420, height: 420, background: "rgba(94,163,255,0.16)", animation: "aurora-drift-2 20s ease-in-out infinite" }} />
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
                {t("coinRush.eyebrow")}
              </motion.span>
              <motion.h1
                initial={{ clipPath: "inset(0 100% 0 0)", opacity: 0 }}
                animate={{ clipPath: "inset(0 0% 0 0)", opacity: 1 }}
                transition={{ duration: reduceMotion ? 0.2 : 0.9, delay: 0.1, ease: EASE }}
                className="text-glow-gold text-balance text-[clamp(2.25rem,6vw,4.25rem)] font-extrabold leading-[0.98] tracking-[-0.03em] text-gold"
              >
                {t("coinRush.titleLine1")}
                <br />
                {t("coinRush.titleLine2")}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.25, ease: EASE }}
                className="max-w-[520px] text-[15px] leading-relaxed text-muted"
              >
                {t("coinRush.lead")}
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4, ease: EASE }}
                className="mt-1 flex flex-wrap items-center gap-3"
              >
                <GatedLink href="/dashboard/play" className="btn-game hud-corner group inline-flex items-center gap-1.5 text-sm">
                  {t("coinRush.playButton")}
                  <ArrowRight size={15} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                </GatedLink>
                <Link href="/how-it-works" className="btn-game-outline hud-corner text-sm font-bold uppercase tracking-wide">
                  {t("coinRush.howButton")}
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
              <div className="relative mx-auto aspect-square w-full max-w-[380px]">
                <div
                  aria-hidden
                  className="absolute inset-0 rounded-full"
                  style={{ background: "radial-gradient(closest-side, rgba(167,139,250,0.26), transparent 75%)" }}
                />
                <div
                  aria-hidden
                  className="absolute inset-[10%] rounded-full border border-dashed"
                  style={{ borderColor: "rgba(167,139,250,0.3)", animation: "ld-orbit-spin 38s linear infinite" }}
                />
                <div
                  aria-hidden
                  className="absolute inset-[22%] rounded-full border border-dashed"
                  style={{ borderColor: "rgba(255,181,22,0.24)", animation: "ld-orbit-spin-rev 50s linear infinite" }}
                />

                {/* Orbiting power-up badges — the same four power-ups and
                    colors listed in POWER_UPS below, not invented icons,
                    so this illustration reads as "this game" specifically. */}
                {POWER_UPS.map((p, i) => {
                  const angle = (i / POWER_UPS.length) * 2 * Math.PI - Math.PI / 2;
                  const radius = 44;
                  const x = 50 + radius * Math.cos(angle);
                  const y = 50 + radius * Math.sin(angle);
                  return (
                    <motion.span
                      key={p.nameKey}
                      className="absolute grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border"
                      style={{
                        left: `${x}%`,
                        top: `${y}%`,
                        background: "rgba(5,17,29,.92)",
                        borderColor: `${p.color}66`,
                        color: p.color,
                        boxShadow: `0 0 18px ${p.color}44`,
                      }}
                      animate={{ y: [0, -6, 0] }}
                      transition={{ duration: 3.5 + i * 0.3, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <p.Icon size={18} />
                    </motion.span>
                  );
                })}

                {/* Floating USDT orbs — what the rocket actually collects
                    in-match, scattered for texture. */}
                {[
                  { left: "20%", top: "18%", delay: 0 },
                  { left: "82%", top: "30%", delay: 0.6 },
                  { left: "16%", top: "78%", delay: 1.1 },
                ].map((o, i) => (
                  <motion.span
                    key={i}
                    aria-hidden
                    className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold"
                    style={{ left: o.left, top: o.top, boxShadow: "0 0 10px rgba(255,181,22,0.8)" }}
                    animate={{ opacity: [0.4, 1, 0.4], scale: [0.9, 1.15, 0.9] }}
                    transition={{ duration: 2.2, delay: o.delay, repeat: Infinity, ease: "easeInOut" }}
                  />
                ))}

                <div className="absolute inset-0 grid place-items-center">
                  <motion.span
                    className="relative grid h-24 w-24 place-items-center rounded-full border border-mint text-mint"
                    style={{ background: "rgba(5,17,29,.96)", boxShadow: "0 0 32px rgba(34,225,147,0.4)" }}
                    animate={{ rotate: [-6, 6, -6] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Rocket size={40} style={{ filter: "drop-shadow(0 0 10px rgba(34,225,147,0.6))" }} />
                  </motion.span>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* --------------------------------------------------- How To Play */}
        <section className="border-t border-line" id="how-to-play">
          <div className="ld-container py-9 text-center sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-gold">{t("coinRush.stepsEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("coinRush.stepsHeading")}</h2>
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
              {HOW_TO_PLAY_STEPS.map((s, i) => (
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

        {/* ------------------------------------------------ Arena preview */}
        <section className="relative overflow-hidden border-t border-line bg-panel/40" id="arena">
          <div className="ld-container py-9 sm:py-[72px]">
            <div className="grid items-center gap-8 lg:grid-cols-2">
              <Reveal>
                <span className="ld-eyebrow text-mint">{t("coinRush.arenaEyebrow")}</span>
                <h2 className="ld-h2 mt-2">{t("coinRush.arenaHeading")}</h2>
                <p className="mt-2 text-sm font-bold text-foreground">{t("coinRush.arenaLead")}</p>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{t("coinRush.arenaBody")}</p>
                <ul className="mt-4 flex flex-col gap-2 text-sm text-muted">
                  {ARENA_BULLETS.map((k) => (
                    <li key={k} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />
                      {t(k)}
                    </li>
                  ))}
                </ul>
                <GatedLink href="/dashboard/play" className="ld-btn-flat btn-game group mt-6 inline-flex items-center gap-1.5 text-xs">
                  {t("coinRush.arenaButton")}
                  <ArrowRight size={14} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                </GatedLink>
              </Reveal>

              <Reveal delay={0.1}>
                <div className="relative mx-auto flex h-[260px] w-full max-w-sm items-center justify-center overflow-hidden rounded-[18px] border border-line">
                  <div
                    aria-hidden
                    className="absolute inset-0"
                    style={{ background: "radial-gradient(circle at 50% 50%, rgba(167,139,250,0.2), transparent 70%), radial-gradient(circle at 20% 80%, rgba(34,225,147,0.14), transparent 60%)" }}
                  />
                  <div aria-hidden className="absolute h-[300px] w-[300px] rounded-full border border-dashed" style={{ borderColor: "rgba(167,139,250,0.28)", animation: "ld-orbit-spin 26s linear infinite" }} />
                  <div aria-hidden className="absolute h-[200px] w-[200px] rounded-full border border-dashed" style={{ borderColor: "rgba(94,163,255,0.28)", animation: "ld-orbit-spin-rev 19s linear infinite" }} />
                  <div aria-hidden className="absolute h-[120px] w-[120px] rounded-full border border-dashed" style={{ borderColor: "rgba(34,225,147,0.3)", animation: "ld-orbit-spin 13s linear infinite" }} />

                  {[
                    { Icon: Coins, color: "#ffb516", style: { top: "18%", left: "22%" }, delay: 0 },
                    { Icon: Coins, color: "#22e193", style: { top: "62%", left: "74%" }, delay: 0.4 },
                    { Icon: Coins, color: "#5ea3ff", style: { top: "72%", left: "26%" }, delay: 0.8 },
                    { Icon: Target, color: "#ff6b5c", style: { top: "24%", left: "70%" }, delay: 1.1 },
                  ].map((o, i) => (
                    <span
                      key={i}
                      aria-hidden
                      className="absolute grid h-7 w-7 place-items-center rounded-full"
                      style={{ ...o.style, background: `${o.color}22`, color: o.color, animation: `float-coin ${4 + o.delay}s ease-in-out ${o.delay}s infinite` }}
                    >
                      <o.Icon size={14} />
                    </span>
                  ))}

                  <Rocket size={44} className="relative text-gold" style={{ animation: "float-coin 3.5s ease-in-out infinite", filter: "drop-shadow(0 0 14px rgba(255,181,22,0.5))" }} />
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- Modes */}
        <section className="border-t border-line" id="modes">
          <div className="ld-container py-9 sm:py-[72px]">
            <Reveal className="text-center">
              <span className="ld-eyebrow text-gold">{t("coinRush.modesEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("coinRush.modesHeading")}</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted">{t("coinRush.modesBody")}</p>
            </Reveal>

            <Reveal delay={0.06} className="mt-8">
              <div className="ld-glass flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="ld-eyebrow text-mint">{t("coinRush.freePracticeLabel")}</span>
                  <h3 className="mt-1 text-xl font-black">{practice.label}</h3>
                  <p className="mt-1 max-w-md text-sm text-muted">{t("coinRush.demoBody")}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-muted">
                    <span className="rounded-full border border-line bg-panel-2 px-3 py-1">{t("coinRush.tierPlayers")}: {practice.players}</span>
                    <span className="rounded-full border border-line bg-panel-2 px-3 py-1">{t("coinRush.tierDuration")}: {practice.durationSec}s</span>
                    <span className="rounded-full border border-line bg-panel-2 px-3 py-1">{t("coinRush.tierDifficulty")}: {DIFFICULTY_BY_MODE.PRACTICE.difficultyLabel}</span>
                  </div>
                </div>
                <GatedLink href="/dashboard/play" className="btn-game-outline hud-corner shrink-0 text-xs font-bold uppercase tracking-wide">
                  {t("coinRush.demoCta")}
                </GatedLink>
              </div>
            </Reveal>

            <Reveal delay={0.1} className="mt-8">
              <span className="ld-eyebrow text-gold">{t("coinRush.stakeLevelsLabel")}</span>
              <p className="mt-1 text-xs text-muted">{t("coinRush.stakeLevelsSub")}</p>
            </Reveal>

            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {PAID_TIER_MODES.map((mode, i) => {
                const cfg = GAME_MODE_CONFIG[mode];
                const color = TIER_COLORS[mode];
                const difficulty = DIFFICULTY_BY_MODE[mode].difficultyLabel;
                // 1st place's own share of a match's reward pool is
                // randomized per match (computeRankTierTargetsPts in
                // game-config.ts draws rank 1 from RANK_TIER_SHARE_RANGE[1]
                // — 1,250-1,500 of a 2,800 PTS reference pool — while
                // rank 2/3 draw independently from their own ranges,
                // then all three are normalized to sum to the pool
                // exactly). Shown here as rank 1's own max share
                // (1500/2800 = 53.57%) of the reward pool — the
                // straightforward "best case for 1st place" figure.
                // Note this is rank 1's own draw ceiling, not the
                // absolute highest 1st place could ever land at after
                // normalization (that edge case — rank 1 drawing its
                // max while 2nd/3rd both draw their own mins — pushes
                // 1st's actual share to 60%; deliberately not shown
                // here to keep this one figure matching the plain
                // per-rank range table, not a compounded edge case).
                const rewardPoolUsdt = cfg.entryFeeUsdt * cfg.players * 0.7;
                const firstPlaceMaxUsdt = (rewardPoolUsdt * RANK_TIER_SHARE_RANGE[1][1]).toFixed(2);
                return (
                  <Reveal key={mode} delay={i * 0.06} y={20}>
                    <TiltCard glow={`${color}22`} className="flex h-full flex-col p-6" style={{ borderColor: `${color}55` }}>
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-black">{cfg.label}</h3>
                        <span className="rounded-full px-2.5 py-1 text-xs font-black" style={{ background: `${color}22`, color }}>
                          ${cfg.entryFeeUsdt}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-muted">
                        <span className="flex items-center gap-1 rounded-full border border-line bg-panel-2 px-2.5 py-1">
                          <Users size={11} /> {cfg.players}
                        </span>
                        <span className="flex items-center gap-1 rounded-full border border-line bg-panel-2 px-2.5 py-1">
                          <Clock3 size={11} /> {cfg.durationSec}s
                        </span>
                        <span className="rounded-full border border-line bg-panel-2 px-2.5 py-1">{difficulty}</span>
                      </div>
                      <p className="mt-3 text-xs text-muted">
                        {t("coinRush.tierFirstPlaceLabel")} <span className="font-bold text-gold">{firstPlaceMaxUsdt} USDT</span>
                      </p>
                      <GatedLink
                        href="/dashboard/play"
                        className="ld-btn-flat group mt-4 inline-flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wide text-black"
                        style={{ background: `linear-gradient(180deg, ${color}, ${color}cc)` }}
                      >
                        {t("coinRush.tierPlay")}
                        <ArrowRight size={13} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                      </GatedLink>
                    </TiltCard>
                  </Reveal>
                );
              })}
            </div>

            <Reveal delay={0.1} className="mt-6">
              <p className="text-center text-xs text-muted">{t("coinRush.fairRoomNote")}</p>
            </Reveal>
          </div>
        </section>

        {/* --------------------------------------------- Rewards & Power-ups */}
        <section className="border-t border-line bg-panel/40" id="rewards">
          <div className="ld-container py-9 sm:py-[72px]">
            <Reveal className="text-center">
              <span className="ld-eyebrow text-mint">{t("coinRush.rewardsEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("coinRush.rewardsHeading")}</h2>
            </Reveal>

            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              {/* Panel 1: Room reward structure */}
              <Reveal delay={0.05}>
                <div className="ld-glass flex h-full flex-col p-6">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={18} className="text-gold" />
                    <h3 className="text-sm font-black uppercase tracking-wide">{t("coinRush.poolPanelLabel")}</h3>
                  </div>
                  <p className="mt-3 text-3xl font-black text-gold">{t("coinRush.poolPercent")}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{t("coinRush.poolPercentBody")}</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-panel">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-gold to-mint"
                      initial={{ width: 0 }}
                      whileInView={{ width: "70%" }}
                      viewport={{ once: true }}
                      transition={{ duration: 1, ease: EASE }}
                    />
                  </div>
                  <div className="mt-4 flex flex-col gap-2.5 text-xs">
                    <div className="grid grid-cols-[92px_1fr] items-start gap-3 rounded-[10px] border border-line bg-panel-2 px-3 py-2">
                      <span className="whitespace-nowrap font-bold text-foreground">{t("coinRush.poolTop3")}</span>
                      <span className="text-muted">{t("coinRush.poolTop3Body")}</span>
                    </div>
                    <div className="grid grid-cols-[92px_1fr] items-start gap-3 rounded-[10px] border border-line bg-panel-2 px-3 py-2">
                      <span className="whitespace-nowrap font-bold text-foreground">{t("coinRush.pool4th")}</span>
                      <span className="text-muted">{t("coinRush.pool4thBody")}</span>
                    </div>
                    <div className="grid grid-cols-[92px_1fr] items-start gap-3 rounded-[10px] border border-line bg-panel-2 px-3 py-2">
                      <span className="whitespace-nowrap font-bold text-foreground">{t("coinRush.poolPlatform")}</span>
                      <span className="text-muted">{t("coinRush.poolPlatformBody")}</span>
                    </div>
                  </div>
                </div>
              </Reveal>

              {/* Panel 2: Weekly leaderboard */}
              <Reveal delay={0.1}>
                <div className="ld-glass flex h-full flex-col p-6">
                  <div className="flex items-center gap-2">
                    <Trophy size={18} className="text-mint" />
                    <h3 className="text-sm font-black uppercase tracking-wide">{t("coinRush.leaderboardPanelLabel")}</h3>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted">{t("coinRush.leaderboardBody")}</p>
                  <div className="mt-4 flex flex-col gap-2 text-xs">
                    {[
                      { rank: "1st", pct: "55%" },
                      { rank: "2nd", pct: "30%" },
                      { rank: "3rd", pct: "15%" },
                    ].map((r) => (
                      <div key={r.rank} className="flex items-center justify-between rounded-[10px] border border-line bg-panel-2 px-3 py-2">
                        <span className="font-bold text-foreground">{r.rank}</span>
                        <span className="font-black text-mint">{r.pct}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 flex-1 text-[11px] leading-relaxed text-muted/80">{t("coinRush.leaderboardNote")}</p>
                  <GatedLink href="/dashboard/leaderboard" className="ld-btn-flat btn-game-outline group mt-4 inline-flex items-center justify-center gap-1.5 text-xs">
                    {t("coinRush.leaderboardCta")}
                    <ArrowRight size={13} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                  </GatedLink>
                </div>
              </Reveal>

              {/* Panel 3: Power-ups */}
              <Reveal delay={0.15}>
                <div className="ld-glass flex h-full flex-col p-6">
                  <div className="flex items-center gap-2">
                    <Zap size={18} className="text-gold" />
                    <h3 className="text-sm font-black uppercase tracking-wide">{t("coinRush.powerUpsPanelLabel")}</h3>
                  </div>
                  <div className="mt-3 flex flex-1 flex-col gap-2.5">
                    {POWER_UPS.map((p) => (
                      <div key={p.nameKey} className="flex items-start gap-2.5 rounded-[10px] border border-line bg-panel-2 px-3 py-2.5">
                        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: `${p.color}22`, color: p.color }}>
                          <p.Icon size={14} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-foreground">{t(p.nameKey)}</p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{t(p.bodyKey)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- CTA */}
        <section className="relative overflow-hidden border-t border-line">
          <div aria-hidden className="ld-aurora">
            <span style={{ left: "10%", top: "-30%", width: 420, height: 420, background: "rgba(167,139,250,0.14)", animation: "aurora-drift-1 14s ease-in-out infinite" }} />
            <span style={{ right: "8%", bottom: "-30%", width: 380, height: 380, background: "rgba(255,181,22,0.12)", animation: "aurora-drift-2 17s ease-in-out infinite" }} />
          </div>
          <div className="ld-container relative py-9 sm:py-[72px]">
            <Reveal>
              <div className="ld-glass glow-gold flex min-h-[200px] flex-col items-center justify-center gap-4 p-[42px] text-center">
                <span className="ld-eyebrow text-mint">{t("coinRush.ctaEyebrow")}</span>
                <h2 className="text-glow-gold ld-h2">{t("coinRush.ctaHeading")}</h2>
                <p className="max-w-xl text-sm text-muted">{t("coinRush.ctaBody")}</p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <ConnectWalletButton />
                  <GatedLink href="/dashboard/play" className="ld-btn-flat ld-btn-ghost rounded-full border bg-panel-2 px-4 text-xs font-bold uppercase tracking-wide">
                    {t("coinRush.playButton")}
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
