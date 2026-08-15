"use client";

import Image from "next/image";
import { Compass, Share, SquarePlus, Check } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Reveal, TiltCard, Starfield } from "@/components/motionPrimitives";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { TranslationKey } from "@/lib/i18n/LocaleProvider";

const STEPS: { n: string; Icon: typeof Compass; color: string; titleKey: TranslationKey; bodyKey: TranslationKey; step: 1 | 2 | 3 | 4 }[] = [
  { n: "01", Icon: Compass, color: "#5ea3ff", titleKey: "installIos.step1Title", bodyKey: "installIos.step1Body", step: 1 },
  { n: "02", Icon: Share, color: "#a78bfa", titleKey: "installIos.step2Title", bodyKey: "installIos.step2Body", step: 2 },
  { n: "03", Icon: SquarePlus, color: "#22e193", titleKey: "installIos.step3Title", bodyKey: "installIos.step3Body", step: 3 },
  { n: "04", Icon: Check, color: "#ffb516", titleKey: "installIos.step4Title", bodyKey: "installIos.step4Body", step: 4 },
];

// The browser chrome here (status bar, Safari toolbar, share sheet) is a
// schematic, on-brand illustration — NOT a real Apple screenshot, since
// reproducing Apple's exact UI pixel-for-pixel would misrepresent an
// illustration as an official capture. The page content underneath it,
// though, is a real screenshot of spacedoge.games itself (see
// public/install-ios/homepage-preview.png), so a user recognizes what
// they'll actually be looking at rather than a generic mockup. Good
// enough to show WHERE to tap at each step: the Share icon lights up at
// step 2, the share-sheet's "Add to Home Screen" row lights up at step
// 3, and the confirm button appears at step 4.
function PhoneMockup({ step }: { step: 1 | 2 | 3 | 4 }) {
  const { t } = useLocale();
  return (
    <div className="relative mx-auto aspect-[9/17] w-full max-w-[168px] overflow-hidden rounded-[26px] border-2 border-line bg-[#06101a] shadow-2xl">
      <div className="h-5 bg-[#06101a]" />
      <div className="flex items-center gap-1.5 border-b border-line/60 bg-[#0d1720] px-2 py-1.5">
        <Compass size={10} className="shrink-0 text-muted" aria-hidden />
        <div className="flex-1 truncate rounded bg-panel-2 px-1.5 py-0.5 text-center text-[6.5px] text-muted">spacedoge.games</div>
      </div>
      <div className="relative h-[52%] overflow-hidden bg-[#06101a]">
        <Image
          src="/install-ios/homepage-preview.png"
          alt=""
          fill
          sizes="220px"
          className="object-cover object-top"
          aria-hidden
        />
      </div>
      <div className="flex items-center justify-around border-t border-line/60 bg-[#0d1720] px-1.5 py-2">
        <span className="h-2 w-2 rounded-sm border border-muted/40" aria-hidden />
        <span
          className={`grid place-items-center rounded-full p-1 transition ${step === 2 ? "bg-gold ring-2 ring-gold/50" : ""}`}
        >
          <Share size={11} className={step === 2 ? "text-black" : "text-muted"} aria-hidden />
        </span>
        <span className="h-2 w-2.5 rounded-sm border border-muted/40" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full border border-muted/40" aria-hidden />
      </div>
      {(step === 3 || step === 4) && (
        <div className="absolute inset-x-0 bottom-0 rounded-t-xl border-t border-line bg-[#0d1720] p-1.5">
          <div
            className={`flex items-center gap-1.5 rounded-lg px-1.5 py-1 ${step === 3 ? "bg-gold/20 ring-1 ring-gold" : ""}`}
          >
            <SquarePlus size={11} className="shrink-0 text-mint" aria-hidden />
            <span className="truncate text-[6.5px] text-foreground">{t("installIos.addToHomeScreenLabel")}</span>
          </div>
          {step === 4 && (
            <div className="mt-1 flex justify-end">
              <span className="rounded-full bg-gold px-2 py-0.5 text-[6.5px] font-bold text-black">{t("installIos.addConfirmLabel")}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function InstallIosContent() {
  const { t } = useLocale();

  return (
    <div className="ld-root flex min-h-full flex-1 flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-line">
          <div aria-hidden className="ld-aurora -z-10">
            <span style={{ left: "10%", top: "-20%", width: 420, height: 420, background: "rgba(94,163,255,0.14)" }} />
            <span style={{ right: "6%", top: "0%", width: 380, height: 380, background: "rgba(34,225,147,0.1)" }} />
          </div>
          <Starfield className="-z-10" />

          <div className="ld-container relative py-9 text-center sm:py-[64px]">
            <Reveal>
              <span className="ld-eyebrow text-mint">{t("installIos.eyebrow")}</span>
              <h1 className="text-glow-gold mt-2 text-[clamp(1.8rem,5vw,3rem)] font-extrabold leading-[1.05] tracking-[-0.02em]">
                {t("installIos.heroTitle")}
              </h1>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted sm:text-base">{t("installIos.heroBody")}</p>
            </Reveal>
          </div>
        </section>

        <section className="border-b border-line">
          <div className="ld-container py-9 sm:py-[64px]">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <Reveal key={s.n} delay={i * 0.1} y={20}>
                  <TiltCard glow={`${s.color}22`} className="flex h-full flex-col items-center p-5 text-center" style={{ borderColor: `${s.color}55` }}>
                    <div
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-black"
                      style={{ borderColor: s.color, color: s.color }}
                    >
                      {s.n}
                    </div>
                    <div className="mt-4 w-full">
                      <PhoneMockup step={s.step} />
                    </div>
                    <s.Icon size={22} className="mt-4" style={{ color: s.color, filter: `drop-shadow(0 0 8px ${s.color}66)` }} aria-hidden />
                    <h3 className="mt-2.5 text-base font-black">{t(s.titleKey)}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">{t(s.bodyKey)}</p>
                  </TiltCard>
                </Reveal>
              ))}
            </div>

            <Reveal delay={0.1} className="mt-8">
              <p className="mx-auto max-w-xl text-center text-xs leading-relaxed text-muted">{t("installIos.safariOnlyNote")}</p>
            </Reveal>
          </div>
        </section>

        <section className="border-b border-line bg-panel/40">
          <div className="ld-container py-9 text-center sm:py-[56px]">
            <Reveal>
              <span className="ld-eyebrow text-gold">{t("installIos.doneEyebrow")}</span>
              <h2 className="ld-h2 mt-2">{t("installIos.doneHeading")}</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">{t("installIos.doneBody")}</p>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
