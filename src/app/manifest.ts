import type { MetadataRoute } from "next";

// Lets "Add to Home Screen" (Android's own install prompt, and the
// baseline every browser reads even where there's no prompt, like iOS
// Safari) launch the site full-screen with a real name/icon instead of
// just bookmarking the current URL with a generic globe icon — see
// src/app/install-ios/page.tsx for the iOS side of this (Safari has no
// install prompt at all, so that page walks a user through the manual
// Share -> Add to Home Screen steps by hand).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Space DOGE",
    short_name: "Space DOGE",
    description: "Play the Rush. Power the Hash. Claim DOGE.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0d12",
    theme_color: "#0a0d12",
    icons: [
      { src: "/icon.png", sizes: "256x256", type: "image/png" },
      { src: "/apple-icon.png", sizes: "256x256", type: "image/png", purpose: "maskable" },
    ],
  };
}
