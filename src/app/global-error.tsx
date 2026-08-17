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
// inline styles, no imports of components/Tailwind from the rest of
// the app — those are exactly the kind of thing that could already be
// broken if this is rendering at all.
//
// Still shown in the user's chosen language, though — NOT by importing
// LocaleProvider/useLocale (same reasoning as above: the very thing
// that just crashed could be that provider itself, or something it
// depends on, and this boundary needs to render even then). Instead
// this reads the locale cookie directly via the browser's own
// document.cookie — a plain built-in, nothing app-specific to break —
// and looks the copy up from a small table duplicated right here
// rather than importing src/lib/i18n/translations/*.ts (pulling in the
// whole dictionary module graph reintroduces exactly the "could
// already be broken" risk this file exists to route around). Confirmed
// live as a real gap: "why this errors are not translated" — this was
// hardcoded English only, on both this screen and (separately) some
// coin-rush gameplay strings, see CoinRushArena.tsx's own fixes for
// the latter.
const LOCALE_COOKIE = "SpaceDOGE_locale"; // must match src/lib/i18n/locales.ts's LOCALE_COOKIE

const COPY: Record<string, { body: string; button: string; errorRef: string }> = {
  en: {
    body: "Something went wrong loading this page. Your connection and wallet session are safe — just try again.",
    button: "Try Again",
    errorRef: "Error ref",
  },
  zh: {
    body: "加载此页面时出错。您的连接和钱包会话是安全的——请重试。",
    button: "重试",
    errorRef: "错误编号",
  },
  "zh-TW": {
    body: "載入此頁面時發生錯誤。您的連線與錢包工作階段是安全的——請重試。",
    button: "重試",
    errorRef: "錯誤編號",
  },
  vi: {
    body: "Đã xảy ra lỗi khi tải trang này. Kết nối và phiên ví của bạn vẫn an toàn — vui lòng thử lại.",
    button: "Thử lại",
    errorRef: "Mã lỗi",
  },
  fil: {
    body: "May problema sa pag-load ng pahinang ito. Ligtas pa rin ang iyong koneksyon at wallet session — subukan muli.",
    button: "Subukang Muli",
    errorRef: "Error ref",
  },
  th: {
    body: "เกิดข้อผิดพลาดขณะโหลดหน้านี้ การเชื่อมต่อและเซสชันกระเป๋าเงินของคุณยังปลอดภัย — โปรดลองอีกครั้ง",
    button: "ลองอีกครั้ง",
    errorRef: "รหัสข้อผิดพลาด",
  },
  id: {
    body: "Terjadi kesalahan saat memuat halaman ini. Koneksi dan sesi dompet Anda tetap aman — silakan coba lagi.",
    button: "Coba Lagi",
    errorRef: "Kode error",
  },
  km: {
    body: "មានបញ្ហាកើតឡើងពេលផ្ទុកទំព័រនេះ។ ការតភ្ជាប់ និងសម័យកាបូបរបស់អ្នកមានសុវត្ថិភាព — សូមព្យាយាមម្តងទៀត។",
    button: "ព្យាយាមម្តងទៀត",
    errorRef: "លេខកូដកំហុស",
  },
  ko: {
    body: "이 페이지를 로드하는 중 문제가 발생했습니다. 연결 및 지갑 세션은 안전합니다 — 다시 시도해 주세요.",
    button: "다시 시도",
    errorRef: "오류 참조",
  },
  ru: {
    body: "Не удалось загрузить страницу. Ваше соединение и сессия кошелька в безопасности — просто попробуйте снова.",
    button: "Повторить",
    errorRef: "Код ошибки",
  },
};

function readLocaleCopy() {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`));
    const raw = match ? decodeURIComponent(match[1]) : "";
    return COPY[raw] ?? COPY.en;
  } catch {
    return COPY.en;
  }
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const copy = readLocaleCopy();
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
        <p style={{ fontSize: 15, color: "#9aa5b1", maxWidth: 320 }}>{copy.body}</p>
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
          {copy.button}
        </button>
        {error.digest && (
          <p style={{ marginTop: 16, fontSize: 11, color: "#5a6472" }}>
            {copy.errorRef}: {error.digest}
          </p>
        )}
      </body>
    </html>
  );
}
