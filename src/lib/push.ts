import webpush from "web-push";
import { db } from "@/lib/db";

// Server-side Web Push sender — see prisma/schema.prisma's
// PushSubscription doc comment for why this exists (this app has no
// other way to reach a player who isn't actively on the page). VAPID
// keys are dev-only defaults generated via `npx web-push generate-
// vapid-keys`; rotate for a real deployment.
let configured = false;
function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return; // push silently disabled if unconfigured
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", publicKey, privateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string; // where notificationclick should focus/open, see public/sw.js
}

// Sends to every subscription on file for this wallet (multiple
// devices/browsers) — best-effort, never throws into the caller. A
// 404/410 response means the browser's subscription is dead (data
// cleared, uninstalled, etc.) and is cleaned up on the spot rather than
// retried forever.
export async function sendPushToWallet(walletProfileId: string, payload: PushPayload): Promise<void> {
  ensureConfigured();
  if (!configured) return;

  const subs = await db.pushSubscription.findMany({ where: { walletProfileId } });
  if (subs.length === 0) return;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number } | null)?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
        // Any other failure (network blip, push service hiccup) is
        // swallowed — a missed notification is never worth failing the
        // real API action (invite/accept/decline) that triggered it.
      }
    })
  );
}
