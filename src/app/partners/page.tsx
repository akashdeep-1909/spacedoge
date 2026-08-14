import type { Metadata } from "next";
import { PartnersContent } from "@/components/PartnersContent";

export const metadata: Metadata = {
  title: "Partners - Space DOGE",
  description: "Partner with Space DOGE across gaming, mining infrastructure, wallets, exchanges, communities and regional growth.",
};

export default function PartnersPage() {
  return <PartnersContent />;
}
