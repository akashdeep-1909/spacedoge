"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useLocale } from "@/lib/i18n/LocaleProvider";

// Client-side QR generation (no third-party image API) — the deposit
// address never leaves the browser just to render a scannable code.
export function DepositQrCode({ value, size = 160 }: { value: string; size?: number }) {
  const { t } = useLocale();
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1, color: { dark: "#0b1220", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        className="grid shrink-0 place-items-center rounded-xl bg-white/5 text-[10px] text-muted"
        style={{ width: size, height: size }}
      >
        {t("depositQrCode.generatingLabel")}
      </div>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element -- a locally-generated data: URL, not a remote image next/image would need to optimize
  return <img src={dataUrl} alt={t("depositQrCode.qrCodeAlt")} width={size} height={size} className="shrink-0 rounded-xl" />;
}
