import type { Metadata } from "next";
import { InstallIosContent } from "@/components/InstallIosContent";

export const metadata: Metadata = {
  title: "Install Space DOGE on iPhone/iPad",
  description: "Add Space DOGE to your Home Screen in a few taps so it opens like a real app, no browser bar, straight from your iPhone or iPad.",
};

export default function InstallIosPage() {
  return <InstallIosContent />;
}
