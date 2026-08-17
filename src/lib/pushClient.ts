"use client";

// Client-side half of Web Push — registers public/sw.js, requests
// notification permission, and hands the resulting subscription to
// POST /api/push/subscribe. See src/lib/push.ts for the server side.

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const bytes = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i);
  return bytes.buffer;
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return sub !== null;
}

// A CODE, not a display string — this file has no access to the i18n
// context (it's a plain client lib, not a component, and is only ever
// awaited from one, see NotificationsPrompt.tsx), so it used to return
// raw hardcoded English sentences that got rendered as-is regardless of
// locale. The caller (which DOES have `t()`) maps this to a translated
// message — same data/UI split as balance-labels.ts's balanceTypeLabel.
export type PushErrorCode =
  | "unsupported"
  | "not_configured"
  | "permission_denied"
  | "permission_not_granted"
  | "save_failed"
  | "enable_failed";

export async function enablePushNotifications(): Promise<{ ok: boolean; error?: PushErrorCode }> {
  if (!isPushSupported()) {
    return { ok: false, error: "unsupported" };
  }
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return { ok: false, error: "not_configured" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: permission === "denied" ? "permission_denied" : "permission_not_granted" };
  }

  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    const subJson = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }),
    });
    if (!res.ok) return { ok: false, error: "save_failed" };
    return { ok: true };
  } catch {
    return { ok: false, error: "enable_failed" };
  }
}

export async function disablePushNotifications(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {});
}
