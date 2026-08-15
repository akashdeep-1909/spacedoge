"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, FileText } from "lucide-react";
import { useSiteDocs } from "@/lib/hooks";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { EASE } from "@/components/motionPrimitives";

// The desktop "Docs" dropdown — a hover-triggered nav item (matching
// the rest of SiteHeader's nav interaction) that only renders once
// there's actually at least one enabled document to show; an admin
// turning the menu on with nothing uploaded yet just means this stays
// absent, same "hidden until configured" convention as the footer's
// Android badge. Each entry opens its file in a new tab rather than
// forcing a download — PDFs render inline (see
// src/app/api/docs/[id]/download/route.ts), other types fall back to
// the browser's own download handling.
export function DocsDesktopDropdown() {
  const { t } = useLocale();
  const { data } = useSiteDocs();
  const [open, setOpen] = useState(false);
  const docs = data?.docs ?? [];

  if (docs.length === 0) return null;

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className={`relative flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-2 transition-colors ${
          open ? "text-foreground" : "text-muted hover:text-foreground"
        }`}
      >
        {t("landing.navDocs")}
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: EASE }}
            className="ld-glass absolute left-0 top-full z-30 mt-1 min-w-[200px] origin-top-left p-1.5 normal-case shadow-2xl"
          >
            {docs.map((doc) => (
              <a
                key={doc.id}
                href={`/api/docs/${doc.id}/download`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-muted transition hover:bg-panel-2 hover:text-gold"
              >
                <FileText size={14} className="shrink-0" aria-hidden />
                <span className="truncate">{doc.title}</span>
                <span className="ml-auto shrink-0 text-[10px] uppercase text-muted/70">{doc.fileExt}</span>
              </a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// The mobile drawer's equivalent — no hover in a touch UI, so every
// doc just renders as its own row under a small "Docs" heading,
// alongside the rest of SiteHeader's mobile nav list.
export function DocsMobileList({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useLocale();
  const { data } = useSiteDocs();
  const docs = data?.docs ?? [];

  if (docs.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <p className="px-3 pt-2 text-[10px] font-black uppercase tracking-widest text-muted/70">{t("landing.navDocs")}</p>
      {docs.map((doc) => (
        <a
          key={doc.id}
          href={`/api/docs/${doc.id}/download`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-muted transition hover:bg-panel-2 hover:text-gold"
        >
          <FileText size={14} className="shrink-0" aria-hidden />
          <span className="truncate normal-case">{doc.title}</span>
        </a>
      ))}
    </div>
  );
}
