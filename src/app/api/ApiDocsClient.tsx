"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

// Renders Swagger UI via its plain static bundle (swagger-ui-dist,
// vendored into public/swagger-ui/) instead of the swagger-ui-react
// wrapper — that wrapper's internal Models/Schemas panel
// (ModelCollapse) still uses a deprecated React class lifecycle
// method, which trips React 19 Strict Mode's dev warning and shows as
// a full error overlay on every page load. The static bundle is what
// swagger-ui-react itself wraps under the hood; it needs no React
// integration at all for a read-only doc viewer, so this sidesteps
// the whole warning category rather than papering over one instance.
export default function ApiDocsClient() {
  const [bundleLoaded, setBundleLoaded] = useState(false);
  const [presetLoaded, setPresetLoaded] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (!bundleLoaded || !presetLoaded || initialized.current) return;
    initialized.current = true;

    interface SwaggerUIBundleFn {
      (config: Record<string, unknown>): void;
      presets: { apis: unknown };
      plugins: { DownloadUrl: unknown };
    }
    const w = window as unknown as { SwaggerUIBundle: SwaggerUIBundleFn; SwaggerUIStandalonePreset: unknown };

    w.SwaggerUIBundle({
      // Admin-gated route, not the old public/openapi.json static file
      // — see src/app/api/openapi/route.ts. This page itself is gated
      // server-side below; this fetch needs its own gate too, since a
      // client-side page check alone doesn't stop someone from just
      // requesting the spec URL directly.
      url: "/api/openapi",
      dom_id: "#swagger-ui",
      presets: [w.SwaggerUIBundle.presets.apis, w.SwaggerUIStandalonePreset],
      plugins: [w.SwaggerUIBundle.plugins.DownloadUrl],
      layout: "StandaloneLayout",
    });
  }, [bundleLoaded, presetLoaded]);

  return (
    <>
      <link rel="stylesheet" href="/swagger-ui/swagger-ui.css" />
      <div id="swagger-ui" style={{ background: "#fff", color: "#3b4151", minHeight: "100vh" }} />
      <Script src="/swagger-ui/swagger-ui-bundle.js" strategy="afterInteractive" onLoad={() => setBundleLoaded(true)} />
      <Script src="/swagger-ui/swagger-ui-standalone-preset.js" strategy="afterInteractive" onLoad={() => setPresetLoaded(true)} />
    </>
  );
}
