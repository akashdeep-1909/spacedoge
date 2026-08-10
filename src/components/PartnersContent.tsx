"use client";

import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import {
  Handshake,
  Target,
  Network,
  ShieldCheck,
  Code2,
  Gamepad2,
  Pickaxe,
  Wallet2,
  Users,
  Building2,
  Rocket,
  TrendingUp,
  ListChecks,
  Mail,
  Send,
  ArrowRight,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { Reveal, TiltCard, EASE, Starfield } from "@/components/motionPrimitives";
import { usePublicSettings } from "@/lib/hooks";

const HERO_BADGES = [
  { Icon: Handshake, key: "partners.heroBadge1" as const, sub: "partners.heroBadge1Sub" as const },
  { Icon: ShieldCheck, key: "partners.heroBadge2" as const, sub: "partners.heroBadge2Sub" as const },
  { Icon: Code2, key: "partners.heroBadge3" as const, sub: "partners.heroBadge3Sub" as const },
  { Icon: TrendingUp, key: "partners.heroBadge4" as const, sub: "partners.heroBadge4Sub" as const },
] as const;

const BENEFITS = [
  { Icon: Target, color: "#a78bfa", titleKey: "partners.benefit1Title" as const, bodyKey: "partners.benefit1Body" as const },
  { Icon: Network, color: "#22e193", titleKey: "partners.benefit2Title" as const, bodyKey: "partners.benefit2Body" as const },
  { Icon: ShieldCheck, color: "#ffb516", titleKey: "partners.benefit3Title" as const, bodyKey: "partners.benefit3Body" as const },
  { Icon: Code2, color: "#5ea3ff", titleKey: "partners.benefit4Title" as const, bodyKey: "partners.benefit4Body" as const },
] as const;

const OPPORTUNITIES = [
  {
    Icon: Gamepad2,
    color: "#a78bfa",
    titleKey: "partners.opp1Title" as const,
    bodyKey: "partners.opp1Body" as const,
    bulletKeys: ["partners.opp1Bullet1", "partners.opp1Bullet2", "partners.opp1Bullet3", "partners.opp1Bullet4"] as const,
  },
  {
    Icon: Pickaxe,
    color: "#5ea3ff",
    titleKey: "partners.opp2Title" as const,
    bodyKey: "partners.opp2Body" as const,
    bulletKeys: ["partners.opp2Bullet1", "partners.opp2Bullet2", "partners.opp2Bullet3", "partners.opp2Bullet4"] as const,
  },
  {
    Icon: Wallet2,
    color: "#22e193",
    titleKey: "partners.opp3Title" as const,
    bodyKey: "partners.opp3Body" as const,
    bulletKeys: ["partners.opp3Bullet1", "partners.opp3Bullet2", "partners.opp3Bullet3", "partners.opp3Bullet4"] as const,
  },
  {
    Icon: Users,
    color: "#ffb516",
    titleKey: "partners.opp4Title" as const,
    bodyKey: "partners.opp4Body" as const,
    bulletKeys: ["partners.opp4Bullet1", "partners.opp4Bullet2", "partners.opp4Bullet3", "partners.opp4Bullet4"] as const,
  },
  {
    Icon: Building2,
    color: "#ff8a45",
    titleKey: "partners.opp5Title" as const,
    bodyKey: "partners.opp5Body" as const,
    bulletKeys: ["partners.opp5Bullet1", "partners.opp5Bullet2", "partners.opp5Bullet3", "partners.opp5Bullet4"] as const,
  },
  {
    Icon: Rocket,
    color: "#ff6b5c",
    titleKey: "partners.opp6Title" as const,
    bodyKey: "partners.opp6Body" as const,
    bulletKeys: ["partners.opp6Bullet1", "partners.opp6Bullet2", "partners.opp6Bullet3", "partners.opp6Bullet4"] as const,
  },
] as const;

const MODELS = [
  { titleKey: "partners.model1Title" as const, bodyKey: "partners.model1Body" as const, color: "#a78bfa" },
  { titleKey: "partners.model2Title" as const, bodyKey: "partners.model2Body" as const, color: "#22e193" },
  { titleKey: "partners.model3Title" as const, bodyKey: "partners.model3Body" as const, color: "#ffb516" },
  { titleKey: "partners.model4Title" as const, bodyKey: "partners.model4Body" as const, color: "#5ea3ff" },
] as const;

const PROCESS_STEPS = [
  { n: "01", titleKey: "partners.process1Title" as const, bodyKey: "partners.process1Body" as const, color: "#a78bfa" },
  { n: "02", titleKey: "partners.process2Title" as const, bodyKey: "partners.process2Body" as const, color: "#5ea3ff" },
  { n: "03", titleKey: "partners.process3Title" as const, bodyKey: "partners.process3Body" as const, color: "#22e193" },
  { n: "04", titleKey: "partners.process4Title" as const, bodyKey: "partners.process4Body" as const, color: "#ffb516" },
  { n: "05", titleKey: "partners.process5Title" as const, bodyKey: "partners.process5Body" as const, color: "#ff8a45" },
] as const;

const STANDARDS = [
  { Icon: CheckCircle2, color: "#22e193", titleKey: "partners.standard1Title" as const, bodyKey: "partners.standard1Body" as const },
  { Icon: ListChecks, color: "#a78bfa", titleKey: "partners.standard2Title" as const, bodyKey: "partners.standard2Body" as const },
  { Icon: ShieldCheck, color: "#ffb516", titleKey: "partners.standard3Title" as const, bodyKey: "partners.standard3Body" as const },
] as const;

const FAQ_KEYS = [
  { qKey: "partners.faq1Q" as const, aKey: "partners.faq1A" as const },
  { qKey: "partners.faq2Q" as const, aKey: "partners.faq2A" as const },
  { qKey: "partners.faq3Q" as const, aKey: "partners.faq3A" as const },
  { qKey: "partners.faq4Q" as const, aKey: "partners.faq4A" as const },
  { qKey: "partners.faq5Q" as const, aKey: "partners.faq5A" as const },
  { qKey: "partners.faq6Q" as const, aKey: "partners.faq6A" as const },
] as const;

export function PartnersContent() {
  const { t } = useLocale();
  const reduceMotion = useReducedMotion();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const { data: settings } = usePublicSettings();
  const telegramUrl = settings?.social?.telegram;

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
                {t("partners.eyebrow")}
              </motion.span>
              <motion.h1
                initial={{ clipPath: "inset(0 100% 0 0)", opacity: 0 }}
                animate={{ clipPath: "inset(0 0% 0 0)", opacity: 1 }}
                transition={{ duration: reduceMotion ? 0.2 : 0.9, delay: 0.1, ease: EASE }}
                className="text-glow-gold text-balance text-[clamp(2.25rem,6vw,4.25rem)] font-extrabold leading-[0.98] tracking-[-0.03em] text-gold"
              >
                {t("partners.titleLine1")}
                <br />
                <span style={{ color: "#a78bfa" }}>{t("partners.titleLine2")}</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.25, ease: EASE }}
                className="max-w-[520px] text-[15px] leading-relaxed text-muted"
              >
                {t("partners.lead")}
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4, ease: EASE }}
                className="mt-1 flex flex-wrap items-center gap-3"
              >
                <a href="#inquiry" className="btn-game hud-corner group inline-flex items-center gap-1.5 text-sm">
                  {t("partners.becomePartnerButton")}
                  <ArrowRight size={15} className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                </a>
                <a href="#opportunities" className="btn-game-outline hud-corner text-sm font-bold uppercase tracking-wide">
                  {t("partners.exploreButton")}
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
                  <Network size={18} className="text-mint" />
                  <h3 className="text-sm font-black uppercase tracking-wide">{t("partners.liveCardTitle")}</h3>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">{t("partners.liveCardBody")}</p>
                <ul className="mt-4 flex flex-col gap-2.5 text-sm">
                  {(["partners.liveCardBullet1", "partners.liveCardBullet2", "partners.liveCardBullet3", "partners.liveCardBullet4"] as const).map((k) => (
                    <li key={k} className="flex items-center gap-2.5 rounded-[10px] border border-line bg-panel-2 px-3 py-2.5">
                      <CheckCircle2 size={15} className="shrink-0 text-mint" />
                      <span className="text-foreground">{t(k)}</span>
                    </li>
                  ))}
                </ul>
                <div aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full" style={{ background: "radial-gradient(closest-side, rgba(167,139,250,0.28), transparent 75%)", animation: "float-coin 5s ease-in-out infinite" }} />
              </TiltCard>
            </motion.div>
          </div>
        </section>

        {/* ------------------------------------------------------ Benefits */}
        <section className="border-t border-line bg-panel/40" id="benefits">
          <div className="ld-container py-9 text-center sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-gold">{t("partners.benefitsEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("partners.benefitsHeading")}</h2>
            </Reveal>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {BENEFITS.map((b, i) => (
                <Reveal key={b.titleKey} delay={i * 0.08}>
                  <TiltCard glow={`${b.color}22`} className="h-full p-6 text-left" style={{ borderColor: `${b.color}55` }}>
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border" style={{ borderColor: b.color, color: b.color }}>
                      <b.Icon size={22} />
                    </span>
                    <h3 className="mt-4 text-base font-black">{t(b.titleKey)}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{t(b.bodyKey)}</p>
                  </TiltCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- Opportunities */}
        <section className="border-t border-line" id="opportunities">
          <div className="ld-container py-9 sm:py-[72px]">
            <Reveal className="text-center">
              <span className="ld-eyebrow text-mint">{t("partners.opportunitiesEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("partners.opportunitiesHeading")}</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted">{t("partners.opportunitiesNote")}</p>
            </Reveal>

            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {OPPORTUNITIES.map((op, i) => (
                <Reveal key={op.titleKey} delay={i * 0.06}>
                  <TiltCard glow={`${op.color}22`} className="h-full p-6 text-left" style={{ borderColor: `${op.color}55` }}>
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border" style={{ borderColor: op.color, color: op.color }}>
                      <op.Icon size={22} />
                    </span>
                    <h3 className="mt-4 text-base font-black">{t(op.titleKey)}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{t(op.bodyKey)}</p>
                    <ul className="mt-4 flex flex-col gap-2 text-xs text-muted">
                      {op.bulletKeys.map((k) => (
                        <li key={k} className="flex items-start gap-2">
                          <span className="mt-1 h-1 w-1 shrink-0 rounded-full" style={{ background: op.color }} />
                          {t(k)}
                        </li>
                      ))}
                    </ul>
                  </TiltCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- Collab models */}
        <section className="border-t border-line bg-panel/40" id="models">
          <div className="ld-container py-9 text-center sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-gold">{t("partners.modelsEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("partners.modelsHeading")}</h2>
            </Reveal>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {MODELS.map((m, i) => (
                <Reveal key={m.titleKey} delay={i * 0.08}>
                  <div className="ld-glass h-full p-6 text-left">
                    <h3 className="text-base font-black" style={{ color: m.color }}>
                      {t(m.titleKey)}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{t(m.bodyKey)}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- Process */}
        <section className="border-t border-line" id="process">
          <div className="ld-container py-9 text-center sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-mint">{t("partners.processEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("partners.processHeading")}</h2>
            </Reveal>

            <div className="relative mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
              <motion.div
                aria-hidden
                className="absolute left-0 right-0 top-[38px] hidden origin-left border-t border-dashed border-line lg:block"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true, margin: "-10% 0px" }}
                transition={{ duration: 1, ease: EASE }}
              />
              {PROCESS_STEPS.map((s, i) => (
                <Reveal key={s.n} delay={i * 0.08} y={20}>
                  <div className="relative flex h-full flex-col items-center text-center">
                    <div
                      className="relative z-10 grid h-[76px] w-[76px] place-items-center rounded-full border-2 bg-background text-lg font-black"
                      style={{ borderColor: s.color, color: s.color }}
                    >
                      {s.n}
                    </div>
                    <h3 className="mt-4 text-sm font-black">{t(s.titleKey)}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">{t(s.bodyKey)}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ Standards */}
        <section className="border-t border-line bg-panel/40" id="standards">
          <div className="ld-container py-9 text-center sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-gold">{t("partners.standardsEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("partners.standardsHeading")}</h2>
            </Reveal>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {STANDARDS.map((s, i) => (
                <Reveal key={s.titleKey} delay={i * 0.08}>
                  <motion.div whileHover={{ y: -3 }} className="ld-glass flex h-full flex-col items-center gap-3 p-6 text-center">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border" style={{ borderColor: s.color, color: s.color }}>
                      <s.Icon size={22} />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold">{t(s.titleKey)}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-muted">{t(s.bodyKey)}</p>
                    </div>
                  </motion.div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- Contact */}
        <section className="border-t border-line" id="inquiry">
          <div className="ld-container py-9 sm:py-[72px]">
            <div className="grid items-start gap-8 lg:grid-cols-2">
              <Reveal>
                <span className="ld-eyebrow text-mint">{t("partners.contactEyebrow")}</span>
                <h2 className="ld-h2 mt-2">{t("partners.contactHeading")}</h2>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{t("partners.contactBody")}</p>
                <p className="mt-4 text-[11px] leading-relaxed text-muted/70">{t("partners.contactNote")}</p>
              </Reveal>

              <Reveal delay={0.1}>
                <div className="ld-glass flex flex-col gap-3 p-6">
                  <a
                    href={`mailto:${t("partners.contactEmailValue")}`}
                    className="flex items-center gap-3 rounded-[12px] border border-line bg-panel-2 p-4 transition hover:border-gold/40"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-gold text-gold">
                      <Mail size={18} />
                    </span>
                    <span>
                      <span className="block text-sm font-bold">{t("partners.contactEmailLabel")}</span>
                      <span className="block text-xs text-muted">{t("partners.contactEmailValue")}</span>
                    </span>
                  </a>

                  {telegramUrl && (
                    <a
                      href={telegramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-[12px] border border-line bg-panel-2 p-4 transition hover:border-mint/40"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-mint text-mint">
                        <Send size={18} />
                      </span>
                      <span>
                        <span className="block text-sm font-bold">{t("partners.contactTelegramLabel")}</span>
                        <span className="block text-xs text-muted">{telegramUrl.replace(/^https?:\/\//, "")}</span>
                      </span>
                    </a>
                  )}
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- FAQ */}
        <section className="border-t border-line bg-panel/40" id="faq">
          <div className="ld-container py-9 sm:py-[72px]">
            <Reveal>
              <span className="ld-eyebrow text-gold">{t("partners.faqEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("partners.faqHeading")}</h2>
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
        <section className="relative overflow-hidden border-t border-line">
          <div aria-hidden className="ld-aurora">
            <span style={{ left: "10%", top: "-30%", width: 420, height: 420, background: "rgba(167,139,250,0.14)", animation: "aurora-drift-1 14s ease-in-out infinite" }} />
            <span style={{ right: "8%", bottom: "-30%", width: 380, height: 380, background: "rgba(255,181,22,0.12)", animation: "aurora-drift-2 17s ease-in-out infinite" }} />
          </div>
          <div className="ld-container relative py-9 sm:py-[72px]">
            <Reveal>
              <div className="ld-glass glow-gold flex min-h-[200px] flex-col items-center justify-center gap-4 p-[42px] text-center">
                <span className="ld-eyebrow text-mint">{t("partners.ctaEyebrow")}</span>
                <h2 className="text-glow-gold ld-h2">{t("partners.ctaHeading")}</h2>
                <p className="max-w-xl text-sm text-muted">{t("partners.ctaBody")}</p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <a href="#inquiry" className="btn-game hud-corner inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm">
                    {t("partners.becomePartnerButton")}
                  </a>
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
