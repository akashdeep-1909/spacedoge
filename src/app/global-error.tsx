"use client";

// Root-level error boundary (Next.js App Router convention: this file,
// exactly this name, catches anything that throws during rendering
// ANYWHERE in the tree, including layout.tsx itself, and is the one
// error boundary allowed to replace the whole <html> document since
// the real root layout may be what failed). Before this file existed,
// an uncaught render error had no fallback UI at all — the page just
// went blank, both in a normal browser tab and inside the Android
// WebView wrapper app, with nothing telling the user (or whoever's
// debugging it) that anything had gone wrong. Deliberately plain
// inline styles, no imports from the rest of the app (Tailwind classes,
// components, i18n) — those are exactly the kind of thing that could
// already be broken if this is rendering at all.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          textAlign: "center",
          background: "#0a0d12",
          color: "#f7fbff",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <p style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.04em" }}>SPACE DOGE</p>
        <p style={{ fontSize: 15, color: "#9aa5b1", maxWidth: 320 }}>
          Something went wrong loading this page. Your connection and wallet session are safe — just try again.
        </p>
        <button
          onClick={() => reset()}
          style={{
            marginTop: 8,
            padding: "10px 24px",
            borderRadius: 999,
            border: "none",
            background: "#ffb516",
            color: "#000",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Try Again
        </button>
        {error.digest && (
          <p style={{ marginTop: 16, fontSize: 11, color: "#5a6472" }}>Error ref: {error.digest}</p>
        )}
      </body>
    </html>
  );
}
