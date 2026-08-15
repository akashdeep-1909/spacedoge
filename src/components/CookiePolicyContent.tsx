"use client";

import { LegalPageLayout, type LegalSection } from "@/components/LegalPageLayout";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const SECTIONS: LegalSection[] = [
  {
    id: "overview",
    num: "01",
    navLabel: "Overview",
    title: "Overview",
    blocks: [
      { type: "p", text: "This Cookie Policy explains how Space DOGE uses cookies and similar technologies on the Space DOGE website and related web interfaces." },
      { type: "p", text: "It should be read together with the Privacy Policy and any cookie-consent or preference tools that may be displayed on the website." },
    ],
  },
  {
    id: "what-are-cookies",
    num: "02",
    navLabel: "What Are Cookies?",
    title: "What Are Cookies?",
    blocks: [
      { type: "p", text: "Cookies are small text files placed on your device when you visit a website. Similar technologies may include pixels, tags, SDK-based storage, local storage and other identifiers that help a website recognize a browser or device." },
      { type: "p", text: "Cookies can be temporary, such as session cookies, or remain for a longer period, such as persistent cookies." },
    ],
  },
  {
    id: "how-we-use",
    num: "03",
    navLabel: "How Space DOGE Uses Cookies",
    title: "How Space DOGE Uses Cookies",
    blocks: [
      { type: "p", text: "Space DOGE may use cookies and related technologies for several purposes, including:" },
      {
        type: "ul",
        items: [
          "Keeping the website functioning properly.",
          "Remembering language or interface preferences.",
          "Supporting wallet-connection flows and session continuity.",
          "Understanding how users navigate the website.",
          "Improving performance, design and user experience.",
          "Helping detect fraud, misuse or security threats.",
        ],
      },
    ],
  },
  {
    id: "types",
    num: "04",
    navLabel: "Types of Cookies We May Use",
    title: "Types of Cookies We May Use",
    blocks: [
      {
        type: "subcard",
        title: "Essential cookies",
        lines: ["These help core site features work, such as page navigation, session handling, security features and core functionality. The website may not function correctly without them."],
      },
      {
        type: "subcard",
        title: "Preference cookies",
        lines: ["These remember choices such as language settings, interface preferences or other customized display options."],
      },
      {
        type: "subcard",
        title: "Analytics cookies",
        lines: ["These help us understand traffic, page engagement, performance and how users interact with our content so we can improve the website."],
      },
      {
        type: "subcard",
        title: "Security and anti-abuse cookies",
        lines: ["These support platform integrity, bot detection, suspicious-activity monitoring and general site protection."],
      },
      {
        type: "subcard",
        title: "Marketing or campaign cookies",
        lines: ["If enabled in the future, these may help measure campaign performance, referral attribution or engagement with promotional content. These should only be used in accordance with your applicable consent requirements."],
      },
    ],
  },
  {
    id: "third-party",
    num: "05",
    navLabel: "Third-Party Cookies and Services",
    title: "Third-Party Cookies and Services",
    blocks: [
      { type: "p", text: "Some cookies or similar technologies may be placed or supported by third-party service providers used by Space DOGE, such as analytics providers, embedded content tools, infrastructure vendors or advertising or campaign tools." },
      { type: "p", text: "These third parties may process data according to their own privacy practices. Before launch, your production policy should be aligned with the actual third-party tools used on the site." },
    ],
  },
  {
    id: "consent",
    num: "06",
    navLabel: "Consent and Cookie Preferences",
    title: "Consent and Cookie Preferences",
    blocks: [
      { type: "p", text: "Depending on your jurisdiction, we may request your consent before using certain non-essential cookies or similar technologies." },
      {
        type: "ul",
        items: [
          "Essential cookies may be active without an opt-in where permitted by law.",
          "Non-essential analytics, campaign or marketing cookies may require consent.",
          "Users should be able to review and update their cookie preferences where required.",
        ],
      },
      { type: "p", text: "If Space DOGE implements a cookie banner or preference center, that tool should work together with this policy." },
    ],
  },
  {
    id: "manage",
    num: "07",
    navLabel: "How to Manage Cookies",
    title: "How to Manage Cookies",
    blocks: [
      { type: "p", text: "You can generally control or disable cookies through your browser settings. Most browsers also allow you to delete existing cookies." },
      {
        type: "ul",
        items: [
          "You may block or delete cookies in your browser settings.",
          "You may use any cookie-preference controls provided on the Space DOGE website.",
          "Disabling certain cookies may affect how the website functions.",
        ],
      },
    ],
  },
  {
    id: "retention",
    num: "08",
    navLabel: "Cookie Duration",
    title: "Cookie Duration",
    blocks: [
      { type: "p", text: "Some cookies are session-based and expire when you close your browser. Others may remain on your device for a longer period depending on their purpose and configuration." },
      { type: "p", text: "Before launch, a production cookie table can be added to list exact cookie names, providers, purposes and durations." },
    ],
  },
  {
    id: "updates",
    num: "09",
    navLabel: "Changes to This Policy",
    title: "Changes to This Policy",
    blocks: [
      { type: "p", text: "We may update this Cookie Policy from time to time to reflect changes in the website, technology, legal requirements or third-party tools." },
      { type: "p", text: "When we update it, we will revise the effective date and post the updated version on the website." },
    ],
  },
  {
    id: "contact",
    num: "10",
    navLabel: "Contact Us",
    title: "Contact Us",
    blocks: [
      { type: "p", text: "If you have questions about this Cookie Policy or Space DOGE's use of cookies and similar technologies, you can contact us below." },
      {
        type: "subcard",
        title: "Cookie policy contact",
        lines: ["Email: privacy@spacedoge.games", "Company: GAMING SPACE LTD"],
      },
    ],
  },
];

export function CookiePolicyContent() {
  const { t } = useLocale();
  return (
    <LegalPageLayout
      eyebrow={t("cookiePolicy.eyebrow")}
      titlePrefix={t("legalPageLayout.readThePrefix")}
      titleHighlight={t("cookiePolicy.titleHighlight")}
      highlightColor="gold"
      lead={t("cookiePolicy.lead")}
      summaryBody={t("cookiePolicy.summaryBody")}
      highlights={[
        { title: t("cookiePolicy.highlight1Title"), body: t("cookiePolicy.highlight1Body") },
        { title: t("cookiePolicy.highlight2Title"), body: t("cookiePolicy.highlight2Body") },
        { title: t("cookiePolicy.highlight3Title"), body: t("cookiePolicy.highlight3Body") },
        { title: t("cookiePolicy.highlight4Title"), body: t("cookiePolicy.highlight4Body") },
      ]}
      sections={SECTIONS}
      ctaHeading={t("cookiePolicy.ctaHeading")}
      ctaBody={t("cookiePolicy.ctaBody")}
      ctaButtonLabel={t("cookiePolicy.ctaButtonLabel")}
      ctaSecondaryHref="/privacy-policy"
      ctaSecondaryLabel={t("cookiePolicy.ctaSecondaryLabel")}
    />
  );
}
