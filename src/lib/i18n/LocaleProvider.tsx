"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import en from "@/lib/i18n/translations/en";
import zh from "@/lib/i18n/translations/zh";
import zhTW from "@/lib/i18n/translations/zh-TW";
import vi from "@/lib/i18n/translations/vi";
import fil from "@/lib/i18n/translations/fil";
import th from "@/lib/i18n/translations/th";
import id from "@/lib/i18n/translations/id";
import km from "@/lib/i18n/translations/km";
import ko from "@/lib/i18n/translations/ko";
import ru from "@/lib/i18n/translations/ru";
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "@/lib/i18n/locales";

const DICTIONARIES: Record<Locale, typeof en> = { en, zh, "zh-TW": zhTW, vi, fil, th, id, km, ko, ru };

// Every dot-path through the English dictionary, e.g. "nav.dashboard" —
// generated from the type itself so a typo in a t() call is a compile
// error, not a silent blank string at runtime.
type DotPath<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : DotPath<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type TranslationKey = DotPath<typeof en>;

function resolve(dict: Record<string, unknown>, path: string): string | undefined {
  let node: unknown = dict;
  for (const part of path.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

// No i18n routing — the locale is a client-side preference, not part
// of the URL (see locales.ts doc-comment). `initialLocale` comes from
// the cookie read server-side in the root layout (src/app/layout.tsx)
// so the very first server-rendered HTML already matches the user's
// last choice instead of flashing English first.
export function LocaleProvider({ children, initialLocale }: { children: ReactNode; initialLocale: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>): string => {
      const dict = DICTIONARIES[locale] ?? en;
      let str = resolve(dict, key) ?? resolve(en, key) ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replaceAll(`{{${k}}}`, String(v));
        }
      }
      return str;
    },
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}

export { DEFAULT_LOCALE };
