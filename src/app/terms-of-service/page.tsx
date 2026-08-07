import type { Metadata } from "next";
import { TermsOfServiceContent } from "@/components/TermsOfServiceContent";

export const metadata: Metadata = {
  title: "Terms of Service — Space DOGE",
  description: "Understand the core rules that govern access to Space DOGE, including wallet use, gameplay, mining packages, rewards, referrals, withdrawals and platform conduct.",
};

export default function TermsOfServicePage() {
  return <TermsOfServiceContent />;
}
