"use client";

import Image from "next/image";
import Link from "next/link";
import { InfoTooltip } from "@/components/InfoTooltip";
import { AndroidIcon, DeviceDuoIcon } from "@/components/icons/PlatformIcons";
import { SocialLinks } from "@/components/SocialLinks";
import { usePublicSettings } from "@/lib/hooks";
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
  const { data: publicSettings } = usePublicSettings();

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

        {/* Android is a direct-download APK (no Play Store listing, see
            src/app/api/admin/apk/route.ts) — hidden entirely until an
            admin has actually uploaded a build, so this never links to
            a dead 404. iOS has no installable file at all (Safari has
            no install prompt), so that badge always links to a real
            page walking through the manual Share -> Add to Home Screen
            steps instead of a download.
            The Android mark is the real, CC-BY-licensed Android robot
            (see PlatformIcons.tsx) — Google explicitly permits reusing
            it to indicate Android compatibility. The iOS side uses a
            generic device glyph rather than Apple's logo: Apple doesn't
            license its mark the way Google does, and this app has no
            App Store listing, so an Apple mark here would misuse a
            trademark and imply a listing that doesn't exist. Neither
            badge reuses the real "Get it on Google Play" / "Download on
            the App Store" artwork, for the same reason. */}
        <div className="flex flex-wrap items-center justify-center gap-3 border-t border-line pt-6">
          {publicSettings?.androidApk && (
            <a
              href="/api/download-apk"
              download
              className="hud-corner group flex items-center gap-2.5 rounded-xl border border-line bg-[#0a0d12] px-4 py-2 transition hover:border-mint/60"
            >
              <span className="shrink-0 text-mint">
                <AndroidIcon size={22} />
              </span>
              <span className="flex flex-col items-start leading-tight">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted">{t("landing.footerAndroidBadgeEyebrow")}</span>
                <span className="text-sm font-black text-foreground">{t("landing.footerAndroidBadge")}</span>
              </span>
            </a>
          )}
          <Link
            href="/install-ios"
            className="hud-corner group flex items-center gap-2.5 rounded-xl border border-line bg-[#0a0d12] px-4 py-2 transition hover:border-gold/60"
          >
            <span className="shrink-0 text-gold">
              <DeviceDuoIcon size={22} />
            </span>
            <span className="flex flex-col items-start leading-tight">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted">{t("landing.footerIosBadgeEyebrow")}</span>
              <span className="text-sm font-black text-foreground">{t("landing.footerIosBadge")}</span>
            </span>
          </Link>
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
