"use client";

import Image from "next/image";
import Link from "next/link";
import { InfoTooltip } from "@/components/InfoTooltip";
import { SocialLinks } from "@/components/SocialLinks";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { TranslationKey } from "@/lib/i18n/LocaleProvider";

// Footer link columns. `href: null` entries have no real destination
// yet (no standalone page exists for them today) — rendered as
// visually-present but inert text rather than a live link, so nothing
// 404s. Anything that already maps to a real route/section uses that.
// Every hash href is an absolute "/#section" path so it resolves
// correctly from any public page this footer is rendered on, not just
// from "/" itself.
const FOOTER_COLUMNS: { headingKey: TranslationKey; links: { labelKey: TranslationKey; href: string | null }[] }[] = [
  {
    headingKey: "landing.footerEcosystemHeading",
    links: [
      { labelKey: "landing.navCoinRush", href: "/coin-rush" },
      { labelKey: "landing.navDogeMining", href: "/doge-mining" },
      { labelKey: "landing.navProofOfHash", href: "/pool" },
      { labelKey: "landing.navReferralNetwork", href: "/referral-network" },
    ],
  },
  {
    headingKey: "landing.footerResourcesHeading",
    links: [{ labelKey: "landing.navHowItWorks", href: "/how-it-works" }],
  },
  {
    headingKey: "landing.footerCompanyHeading",
    links: [
      { labelKey: "landing.footerAboutUs", href: "/about-us" },
      { labelKey: "landing.footerPartners", href: "/partners" },
    ],
  },
  {
    headingKey: "landing.footerLegalHeading",
    links: [
      { labelKey: "landing.footerTerms", href: "/terms-of-service" },
      { labelKey: "landing.footerPrivacy", href: "/privacy-policy" },
      { labelKey: "landing.footerCookie", href: "/cookie-policy" },
    ],
  },
];

// Shared footer for every public page — see SiteHeader.tsx's doc-comment
// for why this is a standalone component instead of duplicated JSX.
export function SiteFooter() {
  const { t } = useLocale();

  return (
    <footer className="border-t border-line py-[46px]">
      <div className="ld-container flex flex-col gap-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <Image src="/SpaceDOGE-icon.png" alt="SPACE DOGE" width={36} height={36} className="rounded-full" />
              <div>
                <p className="text-xs font-black uppercase tracking-widest">{t("landing.brandName")}</p>
                <p className="text-[10px] text-muted">{t("landing.tagline")}</p>
              </div>
            </div>
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted">{t("landing.footerBrandBlurb")}</p>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.headingKey}>
              <h5 className="text-[11px] font-black uppercase tracking-widest text-gold">{t(col.headingKey)}</h5>
              <ul className="mt-3 flex flex-col gap-2 text-xs text-muted">
                {col.links.map((l) =>
                  l.href ? (
                    <li key={l.labelKey}>
                      <Link href={l.href} className="transition hover:text-gold">
                        {t(l.labelKey)}
                      </Link>
                    </li>
                  ) : (
                    <li key={l.labelKey} className="opacity-60">
                      {t(l.labelKey)}
                    </li>
                  )
                )}
              </ul>
            </div>
          ))}
          <div>
            <h5 className="text-[11px] font-black uppercase tracking-widest text-gold">{t("landing.footerCommunityHeading")}</h5>
            <div className="mt-3">
              <SocialLinks />
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 border-t border-line pt-6 text-center text-[11px] text-muted">
          <div className="flex items-center gap-1.5">
            <span>{t("common.disclaimer")}</span>
            <InfoTooltip text={t("landing.disclaimerTooltip")} />
          </div>
          <p>{t("landing.footerCopyright")}</p>
        </div>
      </div>
    </footer>
  );
}
