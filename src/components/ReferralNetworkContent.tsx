"use client";

import { useState, type MouseEvent as ReactMouseEvent } from "react";
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
  Server,
  Cpu,
} from "lucide-react";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { GatedLink } from "@/components/GatedLink";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { Reveal, TiltCard, EASE, Starfield } from "@/components/motionPrimitives";
import { REFERRAL_L1_PCT, REFERRAL_L2_PCT, GAME_MODE_CONFIG } from "@/lib/game-config";
import { MINING_PACKAGES, HASHRATE_PER_USDT, MIN_HASHRATE_PURCHASE_USDT } from "@/lib/mining-shared";

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

const MINING_FLOW_STEPS = [
  { n: "01", Icon: Wallet, color: "#5ea3ff", titleKey: "referralNetwork.miningStep1Title" as const, bodyKey: "referralNetwork.miningStep1Body" as const },
  { n: "02", Icon: Share2, color: "#a78bfa", titleKey: "referralNetwork.miningStep2Title" as const, bodyKey: "referralNetwork.miningStep2Body" as const },
  { n: "03", Icon: Server, color: "#22e193", titleKey: "referralNetwork.miningStep3Title" as const, bodyKey: "referralNetwork.miningStep3Body" as const },
  { n: "04", Icon: Coins, color: "#ffb516", titleKey: "referralNetwork.miningStep4Title" as const, bodyKey: "referralNetwork.miningStep4Body" as const },
  { n: "05", Icon: TrendingUp, color: "#22e193", titleKey: "referralNetwork.miningStep5Title" as const, bodyKey: "referralNetwork.miningStep5Body" as const },
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
  { qKey: "referralNetwork.faq9Q" as const, aKey: "referralNetwork.faq9A" as const },
  { qKey: "referralNetwork.faq10Q" as const, aKey: "referralNetwork.faq10A" as const },
] as const;

// Every paid Coin Rush tier — picker below lets the Room Funding
// Example reflect any of them, not just a fixed Rookie Rush illustration.
const GAME_TIER_MODES = ["QUICK_RUSH", "EXPLORER_RUSH", "PRO_RUSH", "ELITE_RUSH", "CHAMPION_RUSH"] as const;
const GAME_TIER_COLORS: Record<(typeof GAME_TIER_MODES)[number], string> = {
  QUICK_RUSH: "#5ea3ff",
  EXPLORER_RUSH: "#22e193",
  PRO_RUSH: "#ffb516",
  ELITE_RUSH: "#ff8a5c",
  CHAMPION_RUSH: "#a78bfa",
};

// Default mining package for the picker below — Galaxy, a round mid-tier
// figure, not an invented number (see MINING_PACKAGES). Its daily
// electricity cost (the actual carve-out base) depends on the live
// fleet economics, computed in the component body.
const MINING_EXAMPLE_DEFAULT_INDEX = MINING_PACKAGES.findIndex((p) => p.name === "Galaxy");
const MINING_PACKAGE_COLORS: Record<string, string> = {
  Launch: "#22e193",
  Orbit: "#5ea3ff",
  Lunar: "#a78bfa",
  Mars: "#ff8a5c",
  Galaxy: "#ffb516",
  Nova: "#ff6b5c",
};

interface MiningEconomics {
  fleetCapacityMhs: number;
  minerPowerKw: number;
  electricityRateUsdtPerKwh: number;
}

export function ReferralNetworkContent({
  dogeUsdtRate,
  miningEconomics,
}: {
  dogeUsdtRate: number;
  miningEconomics: MiningEconomics;
}) {
  const { t } = useLocale();
  const reduceMotion = useReducedMotion();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Room Funding Example — picker across every real paid Coin Rush tier,
  // same 70/30 split and referral-cut formula settleEpochForDate itself
  // uses, not invented figures.
  const [gameTier, setGameTier] = useState<(typeof GAME_TIER_MODES)[number]>("QUICK_RUSH");
  const gameCfg = GAME_MODE_CONFIG[gameTier];
  const gameRoomVolume = gameCfg.entryFeeUsdt * gameCfg.players;
  const gamePlatformFee = gameRoomVolume * 0.3;
  const gameL1 = gamePlatformFee * REFERRAL_L1_PCT;
  const gameL2 = gamePlatformFee * REFERRAL_L2_PCT;

  // Mining Referral Example — package picker plus an optional custom
  // amount, same pattern (and same formula) as DogeMiningContent's own
  // Worked Example: this funded amount's share of the fleet times the
  // modeled daily electricity cost, 5%/2% of which is what
  // settleEpochForDate actually carves out to referrers every day.
  const [miningPackageIndex, setMiningPackageIndex] = useState(MINING_EXAMPLE_DEFAULT_INDEX);
  const [miningCustomAmount, setMiningCustomAmount] = useState("");
  const miningAmountUsdt = (() => {
    const custom = Number(miningCustomAmount);
    if (miningCustomAmount.trim() !== "" && Number.isFinite(custom) && custom >= MIN_HASHRATE_PURCHASE_USDT) return custom;
    return MINING_PACKAGES[miningPackageIndex].priceUsdt;
  })();
  const miningExampleMhs = miningAmountUsdt * HASHRATE_PER_USDT;
  const miningExampleShare = miningExampleMhs / miningEconomics.fleetCapacityMhs;
  const miningExampleDailyElectricityUsdt = miningExampleShare * miningEconomics.minerPowerKw * 24 * miningEconomics.electricityRateUsdtPerKwh;
  const miningExampleL1Doge = (miningExampleDailyElectricityUsdt * REFERRAL_L1_PCT) / dogeUsdtRate;
  const miningExampleL2Doge = (miningExampleDailyElectricityUsdt * REFERRAL_L2_PCT) / dogeUsdtRate;

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
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.32, ease: EASE }}
                className="max-w-[520px] rounded-[10px] border border-gold/25 bg-gold-soft px-3.5 py-3 text-xs leading-relaxed text-foreground"
              >
                {t("referralNetwork.dualLedgerNote")}
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4, ease: EASE }}
                className="mt-1 flex flex-wrap items-center gap-3"
              >
                <GatedLink href="/dashboard/refer" className="btn-game hud-corner group inline-flex items-center gap-1.5 text-sm">
                  {t("referralNetwork.linkButton")}
                  <ArrowRight size={15} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                </GatedLink>
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
              {/* Network illustration — frameless, transparent background
                  (no TiltCard/title wrapper), same skeleton as Coin
                  Rush's own hero illustration (rounded-full glow + two
                  dashed counter-rotating rings + percentage-positioned
                  orbiting badges + floating texture orbs + a pulsing
                  center) — proven not to hit the calc()-string hydration
                  mismatch an earlier version of this exact illustration
                  did, since every position here is a plain percentage
                  string (no arithmetic inside it to get normalized) with
                  centering handled by the static -translate-x/y-1/2
                  utility classes instead of a computed inline transform.
                  L1=purple (direct referrals, outer ring) / L2=mint
                  (extended network, inner ring) matches the convention
                  the Referral Dashboard section further down this page
                  already established. Every node is decorative — no
                  per-node data exists to show — but the one live count
                  chip keeps it grounded in a real number instead of
                  going fully abstract. */}
              <div className="relative mx-auto aspect-square w-full max-w-[380px]">
                <div
                  aria-hidden
                  className="absolute inset-0 rounded-full"
                  style={{ background: "radial-gradient(closest-side, rgba(167,139,250,0.26), transparent 75%)" }}
                />
                <div
                  aria-hidden
                  className="absolute inset-[8%] rounded-full border border-dashed"
                  style={{ borderColor: "rgba(167,139,250,0.3)", animation: "ld-orbit-spin 34s linear infinite" }}
                />
                <div
                  aria-hidden
                  className="absolute inset-[26%] rounded-full border border-dashed"
                  style={{ borderColor: "rgba(34,225,147,0.26)", animation: "ld-orbit-spin-rev 26s linear infinite" }}
                />

                {/* L1 — direct referrals, purple, outer ring */}
                {[0, 1, 2, 3].map((i) => {
                  const angle = (i / 4) * 2 * Math.PI - Math.PI / 2;
                  const radius = 39;
                  const x = 50 + radius * Math.cos(angle);
                  const y = 50 + radius * Math.sin(angle);
                  return (
                    <motion.span
                      key={`hero-l1-${i}`}
                      aria-hidden
                      className="absolute grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border"
                      style={{ left: `${x}%`, top: `${y}%`, background: "rgba(5,17,29,.92)", borderColor: "#a78bfa66", color: "#a78bfa", boxShadow: "0 0 18px rgba(167,139,250,0.28)" }}
                      animate={reduceMotion ? undefined : { y: [0, -6, 0] }}
                      transition={{ duration: 3.4 + i * 0.3, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Users size={18} />
                    </motion.span>
                  );
                })}

                {/* L2 — extended network, mint, inner ring, offset so
                    they interleave visually between the L1 nodes */}
                {[0, 1, 2].map((i) => {
                  const angle = (i / 3) * 2 * Math.PI - Math.PI / 2 + Math.PI / 3;
                  const radius = 20;
                  const x = 50 + radius * Math.cos(angle);
                  const y = 50 + radius * Math.sin(angle);
                  return (
                    <motion.span
                      key={`hero-l2-${i}`}
                      aria-hidden
                      className="absolute grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border"
                      style={{ left: `${x}%`, top: `${y}%`, background: "rgba(5,17,29,.92)", borderColor: "#22e19366", color: "#22e193", boxShadow: "0 0 14px rgba(34,225,147,0.26)" }}
                      animate={reduceMotion ? undefined : { y: [0, -5, 0] }}
                      transition={{ duration: 3 + i * 0.3, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
                    >
                      <Users size={14} />
                    </motion.span>
                  );
                })}

                {/* Floating gold orbs — pure texture, same flourish Coin
                    Rush's own hero uses. */}
                {[
                  { left: "16%", top: "22%", delay: 0 },
                  { left: "86%", top: "30%", delay: 0.6 },
                  { left: "12%", top: "76%", delay: 1.1 },
                  { left: "82%", top: "80%", delay: 1.6 },
                ].map((o, i) => (
                  <motion.span
                    key={i}
                    aria-hidden
                    className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold"
                    style={{ left: o.left, top: o.top, boxShadow: "0 0 10px rgba(255,181,22,0.8)" }}
                    animate={reduceMotion ? undefined : { opacity: [0.4, 1, 0.4], scale: [0.9, 1.15, 0.9] }}
                    transition={{ duration: 2.2, delay: o.delay, repeat: Infinity, ease: "easeInOut" }}
                  />
                ))}

                <div className="absolute inset-0 grid place-items-center">
                  <motion.span
                    className="relative grid h-20 w-20 place-items-center rounded-full border border-gold text-gold"
                    style={{ background: "rgba(5,17,29,.96)", boxShadow: "0 0 32px rgba(255,181,22,0.4)" }}
                    animate={reduceMotion ? undefined : { scale: [1, 1.06, 1] }}
                    transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Wallet size={30} style={{ filter: "drop-shadow(0 0 10px rgba(255,181,22,0.6))" }} />
                  </motion.span>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* --------------------------------------------------- Two Systems */}
        <section className="border-t border-line" id="systems">
          <div className="ld-container py-9 sm:py-[72px]">
            <Reveal className="text-center">
              <span className="ld-eyebrow text-gold">{t("referralNetwork.systemsEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("referralNetwork.systemsHeading")}</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted">{t("referralNetwork.systemsBody")}</p>
            </Reveal>

            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              <Reveal delay={0.05}>
                <TiltCard glow="rgba(34,225,147,0.22)" className="h-full p-7" style={{ borderColor: "rgba(34,225,147,0.4)" }}>
                  <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-mint text-mint" style={{ boxShadow: "0 0 24px rgba(34,225,147,0.4)" }}>
                      <Coins size={22} />
                    </span>
                    <div>
                      <h3 className="text-lg font-black">{t("referralNetwork.gameSystemTitle")}</h3>
                      <p className="text-xs text-muted">{t("referralNetwork.gameSystemSub")}</p>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-2.5">
                    <div className="rounded-[10px] border border-line bg-panel-2 p-3.5">
                      <span className="block text-[10px] font-black uppercase tracking-wide text-muted">{t("referralNetwork.sharedLevel1Label")}</span>
                      <span className="mt-1 block text-2xl font-black text-mint">{t("referralNetwork.level1Rate")}</span>
                    </div>
                    <div className="rounded-[10px] border border-line bg-panel-2 p-3.5">
                      <span className="block text-[10px] font-black uppercase tracking-wide text-muted">{t("referralNetwork.sharedLevel2Label")}</span>
                      <span className="mt-1 block text-2xl font-black text-mint">{t("referralNetwork.level2Rate")}</span>
                    </div>
                  </div>
                  <ul className="mt-4 flex flex-col gap-2 text-sm text-muted">
                    {(["referralNetwork.gameSystemBullet1", "referralNetwork.gameSystemBullet2", "referralNetwork.gameSystemBullet3", "referralNetwork.gameSystemBullet4"] as const).map((k) => (
                      <li key={k} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />
                        {t(k)}
                      </li>
                    ))}
                  </ul>
                  <span className="mt-5 inline-flex rounded-full bg-mint px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-black">
                    {t("referralNetwork.gameSystemPill")}
                  </span>
                </TiltCard>
              </Reveal>

              <Reveal delay={0.1}>
                <TiltCard glow="rgba(255,181,22,0.22)" className="h-full p-7" style={{ borderColor: "rgba(255,181,22,0.4)" }}>
                  <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-gold text-gold" style={{ boxShadow: "0 0 24px rgba(255,181,22,0.4)" }}>
                      <Cpu size={22} />
                    </span>
                    <div>
                      <h3 className="text-lg font-black">{t("referralNetwork.miningSystemTitle")}</h3>
                      <p className="text-xs text-muted">{t("referralNetwork.miningSystemSub")}</p>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-2.5">
                    <div className="rounded-[10px] border border-line bg-panel-2 p-3.5">
                      <span className="block text-[10px] font-black uppercase tracking-wide text-muted">{t("referralNetwork.sharedLevel1Label")}</span>
                      <span className="mt-1 block text-2xl font-black text-gold">{t("referralNetwork.level1Rate")}</span>
                    </div>
                    <div className="rounded-[10px] border border-line bg-panel-2 p-3.5">
                      <span className="block text-[10px] font-black uppercase tracking-wide text-muted">{t("referralNetwork.sharedLevel2Label")}</span>
                      <span className="mt-1 block text-2xl font-black text-gold">{t("referralNetwork.level2Rate")}</span>
                    </div>
                  </div>
                  <ul className="mt-4 flex flex-col gap-2 text-sm text-muted">
                    {(["referralNetwork.miningSystemBullet1", "referralNetwork.miningSystemBullet2", "referralNetwork.miningSystemBullet3", "referralNetwork.miningSystemBullet4"] as const).map((k) => (
                      <li key={k} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                        {t(k)}
                      </li>
                    ))}
                  </ul>
                  <span className="mt-5 inline-flex rounded-full bg-gold px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-black">
                    {t("referralNetwork.miningSystemPill")}
                  </span>
                </TiltCard>
              </Reveal>
            </div>
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

            <Reveal delay={0.04} className="mt-10 text-left">
              <span className="rounded-full bg-mint px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-black">
                {t("referralNetwork.flowGameLabel")}
              </span>
            </Reveal>
            <div className="relative mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
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

            <Reveal delay={0.04} className="mt-10 text-left">
              <span className="rounded-full bg-gold px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-black">
                {t("referralNetwork.flowMiningLabel")}
              </span>
            </Reveal>
            <div className="relative mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
              <motion.div
                aria-hidden
                className="absolute left-0 right-0 top-1/2 hidden origin-left border-t border-dashed border-line lg:block"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true, margin: "-10% 0px" }}
                transition={{ duration: 1, ease: EASE }}
              />
              {MINING_FLOW_STEPS.map((s, i) => (
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
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">
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
                <GatedLink href="/dashboard/refer" className="ld-btn-flat btn-game group mt-6 inline-flex items-center gap-1.5 text-xs">
                  {t("referralNetwork.dashboardCta")}
                  <ArrowRight size={14} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                </GatedLink>
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

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <Reveal delay={0.06}>
                <div className="ld-glass h-full p-7">
                  <h3 className="text-sm font-black uppercase tracking-wide text-mint">{t("referralNetwork.mathPanelLabel")}</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {GAME_TIER_MODES.map((mode) => {
                      const cfg = GAME_MODE_CONFIG[mode];
                      const color = GAME_TIER_COLORS[mode];
                      const active = gameTier === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setGameTier(mode)}
                          className="rounded-[10px] border px-3 py-2 text-left text-xs font-bold transition"
                          style={
                            active
                              ? { borderColor: color, background: `${color}22`, color }
                              : { borderColor: "var(--line)", color: "var(--muted)" }
                          }
                        >
                          <span className="block">{cfg.label}</span>
                          <span className="block font-normal opacity-80">${cfg.entryFeeUsdt}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex flex-col gap-2.5 text-sm">
                    <div className="flex items-center justify-between rounded-[10px] border border-line bg-panel-2 px-3 py-2.5">
                      <span className="font-bold text-foreground">{t("referralNetwork.mathL1")}</span>
                      <span className="font-black" style={{ color: "#a78bfa" }}>
                        {gameL1.toFixed(4)} USDT
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-[10px] border border-line bg-panel-2 px-3 py-2.5">
                      <span className="font-bold text-foreground">{t("referralNetwork.mathL2")}</span>
                      <span className="font-black text-mint">{gameL2.toFixed(4)} USDT</span>
                    </div>
                  </div>
                </div>
              </Reveal>

              <Reveal delay={0.1}>
                <div className="ld-glass h-full p-7">
                  <h3 className="text-sm font-black uppercase tracking-wide text-gold">{t("referralNetwork.miningMathPanelLabel")}</h3>
                  <p className="mt-1 text-xs text-muted">{t("referralNetwork.miningMathPackageLabel")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {MINING_PACKAGES.map((pkg, i) => {
                      const active = miningCustomAmount.trim() === "" && i === miningPackageIndex;
                      const color = MINING_PACKAGE_COLORS[pkg.name] ?? "#5ea3ff";
                      return (
                        <button
                          key={pkg.level}
                          type="button"
                          onClick={() => {
                            setMiningPackageIndex(i);
                            setMiningCustomAmount("");
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
                      value={miningCustomAmount}
                      onChange={(e) => setMiningCustomAmount(e.target.value)}
                      placeholder={`${MIN_HASHRATE_PURCHASE_USDT}+`}
                      className="rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-sm font-bold text-foreground outline-none focus:border-mint/60"
                    />
                  </label>
                  <div className="mt-4 flex flex-col gap-2.5 text-sm">
                    <div className="mt-1.5 flex items-center justify-between rounded-[10px] border border-line bg-panel-2 px-3 py-2.5">
                      <span className="font-bold text-foreground">{t("referralNetwork.miningMathL1")}</span>
                      <span className="font-black" style={{ color: "#a78bfa" }}>
                        {miningExampleL1Doge.toFixed(4)} DOGE / day
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-[10px] border border-line bg-panel-2 px-3 py-2.5">
                      <span className="font-bold text-foreground">{t("referralNetwork.miningMathL2")}</span>
                      <span className="font-black text-gold">{miningExampleL2Doge.toFixed(4)} DOGE / day</span>
                    </div>
                    <div className="flex items-center justify-between rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-xs">
                      <span className="text-muted">{t("referralNetwork.dogeUsdtRateUsedLabel")}</span>
                      <span className="font-bold text-foreground">{dogeUsdtRate.toFixed(5)}</span>
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>
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
                  <GatedLink href="/dashboard/refer" className="ld-btn-flat ld-btn-ghost rounded-full border bg-panel-2 px-4 text-xs font-bold uppercase tracking-wide">
                    {t("referralNetwork.linkButton")}
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
