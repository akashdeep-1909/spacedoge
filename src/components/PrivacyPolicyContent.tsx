"use client";

import { LegalPageLayout, type LegalSection } from "@/components/LegalPageLayout";

const SECTIONS: LegalSection[] = [
  {
    id: "overview",
    num: "01",
    navLabel: "Overview",
    title: "Overview",
    blocks: [
      { type: "p", text: "This Privacy Policy explains how Space DOGE Technologies collects, uses, shares and protects information when you access the Space DOGE website, wallet-connected dashboards, gameplay interfaces, mining pages, referral tools and related services." },
      { type: "p", text: "Because Space DOGE is a wallet-first ecosystem, the types of information we collect may differ from those collected by conventional email-and-password web platforms." },
    ],
  },
  {
    id: "collect",
    num: "02",
    navLabel: "Information We Collect",
    title: "Information We Collect",
    blocks: [
      { type: "p", text: "We may collect or process the following categories of information:" },
      {
        type: "ul",
        items: [
          "Wallet information, such as your public wallet address, chain/network identifiers and wallet connection metadata.",
          "Blockchain and transaction information, including deposits, withdrawals, conversions, reward settlements and contract-related transaction records.",
          "Gameplay information, such as room participation, rankings, points, anti-abuse signals and reward outcomes.",
          "Mining and platform data, such as selected packages, contract periods, estimated and settled outputs, deductions, device/browser data and interaction logs.",
          "Communications and form submissions, such as partnership, support or legal inquiries you voluntarily send to us.",
        ],
      },
    ],
  },
  {
    id: "cookies",
    num: "03",
    navLabel: "Cookies, Local Storage and Analytics",
    title: "Cookies, Local Storage and Analytics",
    blocks: [
      { type: "p", text: "Space DOGE may use cookies, browser local storage, pixels or similar technologies to maintain sessions, remember preferences, measure performance, protect the platform and understand how users interact with the website." },
      {
        type: "ul",
        items: [
          "Essential technologies help the site function properly.",
          "Security and anti-abuse tools help protect the platform.",
          "Analytics tools help us improve usability and diagnose issues.",
        ],
      },
      { type: "p", text: "At production launch, you may wish to add a dedicated cookie banner or cookie-management preference layer depending on your jurisdiction." },
    ],
  },
  {
    id: "use",
    num: "04",
    navLabel: "How We Use Information",
    title: "How We Use Information",
    blocks: [
      { type: "p", text: "We use information we collect to operate, maintain and improve the Space DOGE ecosystem." },
      {
        type: "ul",
        items: [
          "To provide wallet-based access and platform functionality.",
          "To validate gameplay, settle rewards and prevent abuse.",
          "To administer mining packages, reward reports, conversions and withdrawals.",
          "To communicate with users who submit inquiries or support requests.",
          "To analyze platform usage, improve features and monitor security.",
          "To comply with legal obligations and enforce our policies.",
        ],
      },
    ],
  },
  {
    id: "share",
    num: "05",
    navLabel: "How We Share Information",
    title: "How We Share Information",
    blocks: [
      { type: "p", text: "We may share information with trusted service providers and counterparties that help us operate the platform, subject to appropriate confidentiality, security and contractual controls." },
      {
        type: "ul",
        items: [
          "Infrastructure providers, hosting vendors and analytics tools.",
          "Wallet-connect or blockchain-integration services.",
          "Mining, pool-data or settlement-related providers where applicable.",
          "Professional advisers, auditors or legal counsel.",
          "Governmental, regulatory or law-enforcement bodies when required by law.",
        ],
      },
      { type: "p", text: "We do not treat your private keys or seed phrases as information we should ever collect. You should never send them to us." },
    ],
  },
  {
    id: "public",
    num: "06",
    navLabel: "Public Blockchain Data",
    title: "Public Blockchain Data",
    blocks: [
      { type: "p", text: "Blockchains are public or semi-public ledgers. If you use a wallet or complete a transaction involving the Space DOGE ecosystem, related on-chain information may be visible to other parties and cannot generally be deleted or reversed by Space DOGE." },
      { type: "p", text: "This may include wallet addresses, transaction hashes, token transfers, smart-contract interactions and timestamps." },
    ],
  },
  {
    id: "legal-basis",
    num: "07",
    navLabel: "Legal Bases and Compliance",
    title: "Legal Bases and Compliance",
    blocks: [
      { type: "p", text: "Depending on the jurisdiction in which the platform is offered, Space DOGE may process information based on one or more legal grounds, such as contract performance, legitimate interests, legal obligations or your consent where required." },
      { type: "p", text: "Before production launch, this section should be finalized to reflect the actual jurisdictions targeted and the applicable privacy-law requirements." },
    ],
  },
  {
    id: "retention",
    num: "08",
    navLabel: "Data Retention",
    title: "Data Retention",
    blocks: [
      { type: "p", text: "We retain information for as long as reasonably necessary to operate the platform, maintain security, support accounting and reporting, respond to legal obligations, resolve disputes and enforce our agreements." },
      { type: "p", text: "Retention periods may vary depending on the type of data, the feature involved and the legal or operational need." },
    ],
  },
  {
    id: "security",
    num: "09",
    navLabel: "Security",
    title: "Security",
    blocks: [
      { type: "p", text: "Space DOGE uses reasonable administrative, technical and organizational measures designed to protect information from unauthorized access, loss, misuse or alteration." },
      { type: "p", text: "However, no internet-based system or blockchain interaction is completely risk-free. You are also responsible for maintaining the security of your devices, wallet software and credentials." },
    ],
  },
  {
    id: "rights",
    num: "10",
    navLabel: "Your Privacy Rights",
    title: "Your Privacy Rights",
    blocks: [
      { type: "p", text: "Depending on your jurisdiction, you may have rights relating to your personal information, including rights to request access, correction, deletion, restriction, objection or data portability where applicable." },
      { type: "p", text: "Some information, especially public blockchain data, may not be erasable by Space DOGE because it exists on decentralized or third-party infrastructure." },
      {
        type: "subcard",
        title: "Submitting a request",
        lines: ["Privacy-related requests can be sent to privacy@spacedoge.games. Identity verification may be required before action is taken."],
      },
    ],
  },
  {
    id: "children",
    num: "11",
    navLabel: "Children and Sensitive Information",
    title: "Children and Sensitive Information",
    blocks: [
      { type: "p", text: "Space DOGE is not intended for children who are not legally permitted to use the platform. We do not intentionally market the platform to children." },
      { type: "p", text: "Please do not submit sensitive personal information unless specifically requested through a secure and approved workflow." },
    ],
  },
  {
    id: "changes",
    num: "12",
    navLabel: "Changes to This Policy",
    title: "Changes to This Policy",
    blocks: [
      { type: "p", text: "We may update this Privacy Policy from time to time to reflect changes in our products, operations, partners, technology or legal obligations." },
      { type: "p", text: "If we make material changes, we will update the effective date and post the revised version on the platform." },
    ],
  },
  {
    id: "contact",
    num: "13",
    navLabel: "Contact Information",
    title: "Contact Information",
    blocks: [
      { type: "p", text: "Questions or requests related to privacy can be sent to the Space DOGE privacy contact below. Company registration details, addresses and jurisdiction-specific privacy disclosures should be finalized before launch." },
      {
        type: "subcard",
        title: "Privacy contact",
        lines: ["Email: privacy@spacedoge.games", "Company: Space DOGE Technologies", "Note: Insert the final legal entity name, address and jurisdiction-specific disclosures before production deployment."],
      },
    ],
  },
];

export function PrivacyPolicyContent() {
  return (
    <LegalPageLayout
      eyebrow="Privacy"
      titlePrefix="Read the"
      titleHighlight="Privacy Policy"
      highlightColor="purple"
      lead="Learn what information Space DOGE may collect, how it may be used, how public blockchain data works, and what users should expect from a wallet-first platform."
      summaryBody="This page helps Space DOGE users understand the key legal and privacy expectations of using a wallet-first GameFi and mining platform."
      highlights={[
        { title: "Wallet data", body: "We may process public wallet addresses and wallet-connection data." },
        { title: "On-chain visibility", body: "Blockchain activity may be visible publicly and may not be erasable." },
        { title: "Operational use", body: "Data helps us operate gameplay, mining, security and withdrawals." },
        { title: "Counsel review", body: "This privacy template should be reviewed before public launch." },
      ]}
      notice="This page is a design and product-policy template for the Space DOGE website and should be reviewed by qualified counsel before public launch."
      effectiveDate="August 5, 2026"
      contactEmail="privacy@spacedoge.games"
      sections={SECTIONS}
      ctaHeading="Need privacy-related support or compliance review?"
      ctaBody="Use this page as a polished website-ready template, then review and refine it with legal and privacy counsel before publishing the Space DOGE platform."
      ctaButtonLabel="Contact privacy support"
    />
  );
}
