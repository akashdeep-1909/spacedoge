// Supported locales — the globe-icon switcher (src/components/
// LanguageSwitcher.tsx) lists these in this order. No URL routing
// (no /zh/... prefix on any route): the chosen locale is a client-side
// preference persisted in a cookie (src/lib/i18n/LocaleProvider.tsx),
// read on every render to pick which translation dictionary to use.
export const LOCALES = [
  "en",
  "zh",
  "zh-TW",
  "vi",
  "fil",
  "th",
  "id",
  "km",
  "ko",
  "ru",
] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, { native: string; english: string; flag: string }> = {
  en: { native: "English", english: "English", flag: "🇺🇸" },
  zh: { native: "简体中文", english: "Chinese (Simplified)", flag: "🇨🇳" },
  "zh-TW": { native: "繁體中文", english: "Chinese (Taiwan)", flag: "🇹🇼" },
  vi: { native: "Tiếng Việt", english: "Vietnamese", flag: "🇻🇳" },
  fil: { native: "Filipino", english: "Filipino (Philippines)", flag: "🇵🇭" },
  th: { native: "ไทย", english: "Thai", flag: "🇹🇭" },
  id: { native: "Bahasa Indonesia", english: "Indonesian", flag: "🇮🇩" },
  km: { native: "ខ្មែរ", english: "Khmer (Cambodian)", flag: "🇰🇭" },
  ko: { native: "한국어", english: "Korean", flag: "🇰🇷" },
  ru: { native: "Русский", english: "Russian", flag: "🇷🇺" },
};

export const LOCALE_COOKIE = "SpaceDOGE_locale";
