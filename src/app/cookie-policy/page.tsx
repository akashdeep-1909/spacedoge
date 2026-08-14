import type { Metadata } from "next";
import { CookiePolicyContent } from "@/components/CookiePolicyContent";

export const metadata: Metadata = {
  title: "Cookie Policy - Space DOGE",
  description: "Understand how Space DOGE may use cookies and similar technologies to support site functionality, analytics, security and user preferences.",
};

export default function CookiePolicyPage() {
  return <CookiePolicyContent />;
}
