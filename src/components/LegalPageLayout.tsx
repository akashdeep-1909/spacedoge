"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Mail, ArrowRight } from "lucide-react";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Reveal, Starfield } from "@/components/motionPrimitives";

// Deliberately NOT routed through the site's i18n system (unlike every
// other marketing page) — this is genuine legal/policy text, not UI
// chrome. Duplicating placeholder English into 9 other locale files as
// fake "translations" would misrepresent unreviewed legal boilerplate
// as reviewed, localized content, which is worse than just serving one
// canonical English version with the reference's own "needs legal
// counsel review before launch" notice left intact (see NOTICE below).

export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "subcard"; title: string; lines: string[] };

export interface LegalSection {
  id: string;
  num: string;
  navLabel: string;
  title: string;
  blocks: LegalBlock[];
}

export interface LegalHighlight {
  title: string;
  body: string;
}

export function LegalPageLayout({
  eyebrow,
  titlePrefix,
  titleHighlight,
  highlightColor,
  lead,
  summaryBody,
  highlights,
  notice,
  effectiveDate,
  contactEmail,
  sections,
  ctaHeading,
  ctaBody,
  ctaButtonLabel,
  ctaSecondaryHref = "/about-us",
  ctaSecondaryLabel = "Learn about Space DOGE",
}: {
  eyebrow: string;
  titlePrefix: string;
  titleHighlight: string;
  highlightColor: "gold" | "purple";
  lead: string;
  summaryBody: string;
  highlights: LegalHighlight[];
  notice: string;
  effectiveDate: string;
  contactEmail: string;
  sections: LegalSection[];
  ctaHeading: string;
  ctaBody: string;
  ctaButtonLabel: string;
  ctaSecondaryHref?: string;
  ctaSecondaryLabel?: string;
}) {
  const accent = highlightColor === "gold" ? "#ffb516" : "#a78bfa";

  return (
    <div className="ld-root flex min-h-full flex-1 flex-col overflow-x-hidden bg-background text-foreground">
      <SiteHeader />

      <main className="flex-1">
        {/* -------------------------------------------------------- Hero */}
        <section className="relative overflow-hidden border-b border-line">
          <div aria-hidden className="ld-aurora -z-10">
            <span style={{ left: "10%", top: "-20%", width: 420, height: 420, background: `${accent}22`, animation: "aurora-drift-1 16s ease-in-out infinite" }} />
            <span style={{ right: "6%", top: "0%", width: 380, height: 380, background: "rgba(34,225,147,0.1)", animation: "aurora-drift-2 20s ease-in-out infinite" }} />
          </div>
          <Starfield className="-z-10" />

          <div className="ld-container relative grid gap-[22px] py-9 sm:py-[56px] lg:grid-cols-[1.05fr_0.95fr]">
            <Reveal>
              <div className="ld-glass h-full p-7 sm:p-9">
                <span className="ld-eyebrow text-mint">{eyebrow}</span>
                <h1 className="text-glow-gold mt-2 text-[clamp(2rem,5vw,3.5rem)] font-extrabold leading-[1.02] tracking-[-0.03em]">
                  {titlePrefix} <span style={{ color: accent }}>{titleHighlight}</span>
                </h1>
                <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">{lead}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <a href="#content" className="btn-game hud-corner inline-flex items-center gap-1.5 text-sm">
                    Read the page
                    <ArrowRight size={15} className="shrink-0" />
                  </a>
                  <Link href="/" className="btn-game-outline hud-corner text-sm font-bold uppercase tracking-wide">
                    Back to homepage
                  </Link>
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.08}>
              <div className="ld-glass flex h-full flex-col gap-4 p-7 sm:p-8">
                <h3 className="text-lg font-black">Quick Summary</h3>
                <p className="text-sm leading-relaxed text-muted">{summaryBody}</p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {highlights.map((h) => (
                    <div key={h.title} className="rounded-[12px] border border-line bg-panel-2 p-3.5">
                      <strong className="block text-sm" style={{ color: accent }}>
                        {h.title}
                      </strong>
                      <span className="mt-1 block text-xs leading-relaxed text-muted">{h.body}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-[10px] border border-gold/25 bg-gold-soft px-3.5 py-3 text-xs leading-relaxed text-foreground">
                  {notice}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------- TOC + Article */}
        <section className="border-b border-line" id="content">
          <div className="ld-container grid gap-[22px] py-9 sm:py-[56px] lg:grid-cols-[280px_1fr] lg:items-start">
            <aside className="ld-glass lg:sticky lg:top-24 p-5">
              <h3 className="text-base font-black">On this page</h3>
              <p className="mt-1.5 text-xs text-muted">Jump to any section.</p>
              <nav aria-label="On this page" className="mt-3.5 grid gap-2">
                {sections.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="flex items-center gap-2.5 rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-xs text-foreground transition hover:translate-x-0.5 hover:border-gold/40 hover:text-gold"
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-gold/30 text-[10px] font-black text-gold">
                      {s.num}
                    </span>
                    {s.navLabel}
                  </a>
                ))}
              </nav>
            </aside>

            <article className="ld-glass p-5 sm:p-7">
              <div className="border-b border-line px-1 pb-5 text-xs text-muted">
                Effective date: <strong className="text-foreground">{effectiveDate}</strong> · Contact:{" "}
                <strong className="text-foreground">{contactEmail}</strong>
              </div>

              {sections.map((s) => (
                <section key={s.id} id={s.id} className="scroll-mt-24 border-b border-line px-1 py-6 last:border-b-0">
                  <div className="text-[11px] font-black uppercase tracking-[0.11em]" style={{ color: "#a78bfa" }}>
                    Section {s.num}
                  </div>
                  <h2 className="ld-h2 mt-1.5">{s.title}</h2>
                  <LegalBlocks blocks={s.blocks} />
                </section>
              ))}
            </article>
          </div>
        </section>

        {/* -------------------------------------------------------- CTA */}
        <section className="border-b border-line py-9 sm:py-[56px]">
          <div className="ld-container">
            <Reveal>
              <div className="ld-glass glow-gold flex flex-col gap-4 p-8 sm:p-10">
                <span className="ld-eyebrow text-mint">Need more help?</span>
                <h2 className="text-glow-gold ld-h2 max-w-2xl">{ctaHeading}</h2>
                <p className="max-w-2xl text-sm text-muted">{ctaBody}</p>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <a
                    href={`mailto:${contactEmail}`}
                    className="btn-game hud-corner inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm"
                  >
                    <Mail size={15} />
                    {ctaButtonLabel}
                  </a>
                  <Link href={ctaSecondaryHref} className="btn-game-outline rounded-full px-4 py-2 text-sm font-bold uppercase tracking-wide">
                    {ctaSecondaryLabel}
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

function LegalBlocks({ blocks }: { blocks: LegalBlock[] }): ReactNode {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === "p") {
          return (
            <p key={i} className="mt-3 text-sm leading-relaxed text-muted first:mt-3">
              {b.text}
            </p>
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={i} className="mt-3 flex flex-col gap-2 pl-1 text-sm leading-relaxed text-muted">
              {b.items.map((item, j) => (
                <li key={j} className="flex items-start gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                  {item}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <div key={i} className="mt-4 rounded-[12px] border border-line bg-panel-2 p-4">
            <strong className="mb-1.5 block text-sm text-mint">{b.title}</strong>
            {b.lines.map((line, j) => (
              <p key={j} className="text-xs leading-relaxed text-muted">
                {line}
              </p>
            ))}
          </div>
        );
      })}
    </>
  );
}
