import type { Metadata } from "next";
import { PrivacyPolicyContent } from "@/components/PrivacyPolicyContent";

export const metadata: Metadata = {
  title: "Privacy Policy - Space DOGE",
  description: "Learn what information Space DOGE may collect, how it may be used, how public blockchain data works, and what users should expect from a wallet-first platform.",
};

export default function PrivacyPolicyPage() {
  return <PrivacyPolicyContent />;
}
