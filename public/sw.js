// Minimal Web Push service worker — no offline caching, no asset
// interception, just the two events push notifications need. Kept
// deliberately separate from any future PWA/offline work so this
// stays easy to reason about.

self.addEventListener("push", (event) => {
  let data = { title: "Space DOGE", body: "", url: "/dashboard/play" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // non-JSON payload — fall back to the defaults above
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/notification-icon.png",
      badge: "/notification-icon.png",
      data: { url: data.url },
    })
  );
});

// Clicking the notification focuses an already-open tab on that URL if
// one exists, otherwise opens a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard/play";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
