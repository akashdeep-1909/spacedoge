"use client";

import { LegalPageLayout, type LegalSection } from "@/components/LegalPageLayout";

const SECTIONS: LegalSection[] = [
  {
    id: "acceptance",
    num: "01",
    navLabel: "Acceptance of These Terms",
    title: "Acceptance of These Terms",
    blocks: [
      {
        type: "p",
        text: "These Terms of Service govern your access to and use of the Space DOGE website, gameplay interfaces, wallet-connected dashboards, referral features, mining pages and related services.",
      },
      { type: "p", text: "By accessing or using Space DOGE, you agree to be bound by these Terms. If you do not agree, you should not use the platform." },
      { type: "p", text: "If you are using Space DOGE on behalf of an organization, you represent that you have authority to bind that organization to these Terms." },
    ],
  },
  {
    id: "eligibility",
    num: "02",
    navLabel: "Eligibility and Jurisdiction",
    title: "Eligibility and Jurisdiction",
    blocks: [
      { type: "p", text: "You may use Space DOGE only if you are legally permitted to do so under the laws applicable to you. You are responsible for ensuring that your use of the platform is lawful in your location." },
      {
        type: "ul",
        items: [
          "You must be of legal age to enter into a binding agreement in your jurisdiction.",
          "You may not use the platform if you are located in a prohibited or restricted jurisdiction.",
          "Additional country, sanctions or compliance restrictions may apply at launch or over time.",
        ],
      },
      { type: "p", text: "Space DOGE may restrict or deny access where required by law, risk controls or internal policy." },
    ],
  },
  {
    id: "wallet",
    num: "03",
    navLabel: "Wallet-First Access",
    title: "Wallet-First Access",
    blocks: [
      { type: "p", text: "Space DOGE uses a wallet-first access model. You access certain features by connecting a compatible wallet rather than creating a conventional username-and-password account." },
      { type: "p", text: "You are solely responsible for the security of your wallet, private keys, seed phrases, devices and approvals. Space DOGE cannot recover assets if you lose control of your wallet or authorize malicious transactions." },
      {
        type: "ul",
        items: [
          "Never share your seed phrase or private key.",
          "Review all wallet prompts carefully before approving any transaction.",
          "Use only wallets, browser extensions and networks you trust.",
        ],
      },
    ],
  },
  {
    id: "services",
    num: "04",
    navLabel: "Description of Services",
    title: "Description of Services",
    blocks: [
      { type: "p", text: "Space DOGE may offer one or more of the following services:" },
      {
        type: "ul",
        items: [
          "Coin Rush or other skill-based game modes.",
          "Game reward balances and related settlement ledgers.",
          "Time-bound DOGE mining packages with allocated hashrate.",
          "Referral and community reward systems.",
          "Informational dashboards, proofs, records and partner pages.",
        ],
      },
      { type: "p", text: "Specific features, packages and availability may change over time. New products may be subject to additional terms or disclosures." },
    ],
  },
  {
    id: "gameplay",
    num: "05",
    navLabel: "Gameplay, Rewards and Referrals",
    title: "Gameplay, Rewards and Referrals",
    blocks: [
      { type: "p", text: "Gameplay rewards are determined according to the rules of the relevant game mode, including room type, scoring logic, rankings, anti-abuse controls and settlement criteria." },
      { type: "p", text: "Referral rewards, if offered, are based only on qualifying activity defined by Space DOGE and are not owed merely because a user connects a wallet or joins the platform." },
      {
        type: "ul",
        items: [
          "Game rewards may be delayed, adjusted or denied if cheating, exploitation, collusion or technical abuse is detected.",
          "Referral rewards may be reversed or withheld where activity is found to be fraudulent, self-referred, abusive or otherwise ineligible.",
          "Rules for demo rooms, paid rooms and tournament-style events may differ.",
        ],
      },
    ],
  },
  {
    id: "mining",
    num: "06",
    navLabel: "Mining Package Terms",
    title: "Mining Package Terms",
    blocks: [
      { type: "p", text: "Space DOGE may provide access to time-bound DOGE mining packages that represent an allocation of hashrate for a defined contract period. Unless expressly stated otherwise, users do not acquire ownership of physical ASIC machines." },
      { type: "p", text: "Mining rewards are variable and depend on factors such as accepted hashrate-hours, pool output, network difficulty, DOGE price, uptime, electricity charges, pool fees and service costs." },
      {
        type: "ul",
        items: [
          "A mining package fee is paid for access to a package and is generally not refundable merely because market conditions change.",
          "The allocated hashrate applies for the stated contract period only, subject to the package rules and available capacity.",
          "At contract expiry, the package ends unless a new package or renewal flow is offered.",
          "Any examples of daily or monthly DOGE are estimates only and not guaranteed outputs.",
        ],
      },
      {
        type: "subcard",
        title: "No guaranteed returns.",
        lines: ["Space DOGE does not promise fixed profit, fixed yield, guaranteed principal return or guaranteed mining output unless expressly stated in a separate written agreement approved by the company."],
      },
    ],
  },
  {
    id: "balances",
    num: "07",
    navLabel: "Deposits, Balances and Withdrawals",
    title: "Deposits, Balances, Conversions and Withdrawals",
    blocks: [
      { type: "p", text: "The platform may display different balances, such as deposited USDT, game reward balances, DOGE mining balances, referral balances or pending/available amounts. These balances may have different rules and should not be treated as identical." },
      {
        type: "ul",
        items: [
          "Deposits may be required to access certain paid game rooms or product features.",
          "Conversions between balances, if available, are subject to platform rules, pricing logic, fees and liquidity conditions.",
          "Withdrawals are subject to eligibility checks, minimum amounts, network conditions, fraud controls and operational availability.",
        ],
      },
      { type: "p", text: "Space DOGE may suspend or delay withdrawals where necessary to maintain system integrity, investigate suspicious conduct, perform reconciliations or respond to legal obligations." },
    ],
  },
  {
    id: "prohibited",
    num: "08",
    navLabel: "Prohibited Conduct",
    title: "Prohibited Conduct",
    blocks: [
      { type: "p", text: "You agree not to use Space DOGE in a way that harms the platform, other users or the integrity of the ecosystem." },
      {
        type: "ul",
        items: [
          "Cheating, botting, automation abuse or manipulation of gameplay outcomes.",
          "Creating multiple wallets or accounts to abuse rewards, referrals or package limits.",
          "Exploiting bugs, vulnerabilities or unintended platform behavior.",
          "Using the platform for unlawful, deceptive, abusive or sanctioned activity.",
          "Interfering with infrastructure, APIs, mining statistics, front-end interfaces or partner systems.",
        ],
      },
      { type: "p", text: "Space DOGE may investigate, suspend or permanently restrict access for suspected abuse." },
    ],
  },
  {
    id: "ip",
    num: "09",
    navLabel: "Intellectual Property",
    title: "Intellectual Property",
    blocks: [
      { type: "p", text: "The Space DOGE name, logos, visual designs, interfaces, copy, game assets, documentation, dashboards and related content are owned by or licensed to Space DOGE Technologies and are protected by applicable intellectual property laws." },
      { type: "p", text: "You may not copy, modify, distribute, reverse engineer, scrape or commercially exploit Space DOGE content except as permitted by law or by prior written consent." },
    ],
  },
  {
    id: "disclaimers",
    num: "10",
    navLabel: "Disclaimers",
    title: "Disclaimers",
    blocks: [
      { type: "p", text: "Space DOGE is provided on an \"as is\" and \"as available\" basis to the fullest extent permitted by law. The platform may experience outages, delays, data mismatches, third-party failures or interruptions." },
      {
        type: "ul",
        items: [
          "Mining rewards are variable and not guaranteed.",
          "Historical performance does not guarantee future results.",
          "Space DOGE does not provide investment, legal, tax or financial advice.",
          "Use of blockchain networks, tokens and external wallets involves risk.",
        ],
      },
    ],
  },
  {
    id: "liability",
    num: "11",
    navLabel: "Limitation of Liability",
    title: "Limitation of Liability",
    blocks: [
      { type: "p", text: "To the fullest extent permitted by law, Space DOGE Technologies and its affiliates, officers, employees, contractors and partners will not be liable for indirect, incidental, special, consequential or punitive damages arising from or related to your use of the platform." },
      { type: "p", text: "To the fullest extent permitted by law, total liability for any claim relating to the platform will not exceed the amount of fees you paid directly to Space DOGE for the specific service giving rise to the claim during the twelve months before the claim arose." },
    ],
  },
  {
    id: "termination",
    num: "12",
    navLabel: "Suspension, Termination and Changes",
    title: "Suspension, Termination and Changes",
    blocks: [
      { type: "p", text: "Space DOGE may suspend, restrict or terminate access to any part of the platform at any time where necessary for maintenance, security, fraud prevention, legal compliance or operational reasons." },
      { type: "p", text: "We may update these Terms from time to time. If we do, we will post the revised version and update the effective date. Continued use after the revised Terms become effective constitutes acceptance of the revised Terms." },
    ],
  },
  {
    id: "contact",
    num: "13",
    navLabel: "Contact and Governing Provisions",
    title: "Contact and Governing Provisions",
    blocks: [
      { type: "p", text: "Questions about these Terms can be directed to the Space DOGE legal contact below. Governing law, dispute resolution and company registration details should be completed and finalized before production launch." },
      {
        type: "subcard",
        title: "Legal contact",
        lines: ["Email: legal@spacedoge.games", "Company: Space DOGE Technologies", "Note: Insert governing law, company address and dispute-resolution clause after legal review."],
      },
    ],
  },
];

export function TermsOfServiceContent() {
  return (
    <LegalPageLayout
      eyebrow="Legal"
      titlePrefix="Read the"
      titleHighlight="Terms of Service"
      highlightColor="gold"
      lead="Understand the core rules that govern access to Space DOGE, including wallet use, gameplay, mining packages, rewards, referrals, withdrawals and platform conduct."
      summaryBody="This page helps Space DOGE users understand the key legal and privacy expectations of using a wallet-first GameFi and mining platform."
      highlights={[
        { title: "Wallet-first", body: "Access is based on a connected wallet rather than a conventional password account." },
        { title: "Variable rewards", body: "Mining outputs and some platform rewards are not fixed or guaranteed." },
        { title: "Separate balances", body: "Deposits, game rewards, mining rewards and referral balances may have different rules." },
        { title: "Review required", body: "This template should be reviewed by legal counsel before launch." },
      ]}
      notice="This page is a design and product-policy template for the Space DOGE website and should be reviewed by qualified counsel before public launch."
      effectiveDate="August 5, 2026"
      contactEmail="legal@spacedoge.games"
      sections={SECTIONS}
      ctaHeading="Questions about platform rules or legal language?"
      ctaBody="If you need help interpreting a section, or want to connect this template to a live legal-support flow, contact the Space DOGE team and finalize the policy with counsel before launch."
      ctaButtonLabel="Contact legal support"
    />
  );
}
