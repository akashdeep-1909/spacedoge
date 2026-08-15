"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence, useScroll } from "framer-motion";
import { Menu, X, Languages } from "lucide-react";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { NAV_LINKS } from "@/lib/siteNav";
import { EASE } from "@/components/motionPrimitives";

// Shared header for every public (pre-wallet-connect) page — scroll
// progress bar, sticky/blurred nav with a sliding hover-pill, and an
// animated mobile menu. Used by both LandingContent.tsx (/) and
// HowItWorksContent.tsx (/how-it-works) so the two pages share one
// nav implementation instead of two copies drifting apart.
export function SiteHeader() {
  const { t } = useLocale();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [hoveredNav, setHoveredNav] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const { scrollYProgress } = useScroll();

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      {/* Whole-page scroll progress — thin gradient bar above everything. */}
      <motion.div
        aria-hidden
        className="fixed inset-x-0 top-0 z-50 h-[3px] origin-left bg-gradient-to-r from-mint via-gold to-[#a78bfa]"
        style={{ scaleX: scrollYProgress }}
      />

      <header
        id="top"
        className={`sticky top-0 z-40 border-b backdrop-blur-md transition-colors duration-300 ${
          scrolled ? "border-line bg-background/95 shadow-[0_10px_30px_rgba(0,0,0,0.35)]" : "border-transparent bg-background/60"
        }`}
      >
        <div className="ld-container relative flex min-h-[76px] items-center gap-3 py-3 sm:gap-6">
          <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2.5 sm:gap-3">
            <Image src="/SpaceDOGE-icon.png" alt="SPACE DOGE" width={44} height={44} priority className="h-9 w-9 shrink-0 rounded-full sm:h-12 sm:w-12" />
            <div className="hidden min-w-0 lg:block">
              <h1 className="text-sm font-black uppercase tracking-widest">{t("landing.brandName")}</h1>
              <p className="text-[11px] text-muted">{t("landing.tagline")}</p>
            </div>
          </Link>

          <nav
            className="relative hidden items-center gap-1 text-xs font-semibold uppercase tracking-wide lg:flex"
            onMouseLeave={() => setHoveredNav(null)}
          >
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onMouseEnter={() => setHoveredNav(l.href)}
                className={`relative whitespace-nowrap rounded-full px-3 py-2 transition-colors ${
                  hoveredNav === l.href ? "text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {hoveredNav === l.href && (
                  <motion.span
                    layoutId="nav-hover-pill"
                    className="absolute inset-0 -z-10 rounded-full bg-panel-2"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  />
                )}
                {t(l.key)}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2">
            {/* Below lg (same breakpoint the hamburger button below
                appears at), Language moves into the mobile dropdown
                instead — one less item crowding the header row on a
                phone/tablet width alongside the wallet chip. */}
            <div className="hidden lg:block">
              <LanguageSwitcher />
            </div>
            <ConnectWalletButton />
            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label={mobileNavOpen ? t("nav.closeMenu") : t("nav.openMenu")}
              aria-expanded={mobileNavOpen}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-line bg-panel text-foreground transition hover:border-gold/40 lg:hidden"
            >
              {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>

          <AnimatePresence>
            {mobileNavOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.18, ease: EASE }}
                className="absolute inset-x-3 top-full z-30 mt-2 origin-top lg:hidden"
              >
                <motion.nav
                  className="ld-glass flex flex-col gap-1 p-2 shadow-2xl"
                  initial="hidden"
                  animate="show"
                  variants={{ show: { transition: { staggerChildren: 0.035 } } }}
                >
                  {NAV_LINKS.map((l) => (
                    <motion.div key={l.href} variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}>
                      <Link
                        href={l.href}
                        onClick={() => setMobileNavOpen(false)}
                        className="block rounded-xl px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-muted transition hover:bg-panel-2 hover:text-gold"
                      >
                        {t(l.key)}
                      </Link>
                    </motion.div>
                  ))}
                  <div className="my-1 border-t border-line" />
                  <LanguageSwitcher
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-muted transition hover:bg-panel-2 hover:text-gold"
                    icon={<Languages size={16} strokeWidth={2} className="shrink-0" />}
                  />
                </motion.nav>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>
    </>
  );
}
