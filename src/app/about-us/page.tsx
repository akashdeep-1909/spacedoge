import type { Metadata } from "next";
import { AboutUsContent } from "@/components/AboutUsContent";

export const metadata: Metadata = {
  title: "About Us — Space DOGE",
  description: "Space DOGE Technologies' mission, story, transparent GameFi model and DOGE mining ecosystem.",
};

export default function AboutUsPage() {
  return <AboutUsContent />;
}
