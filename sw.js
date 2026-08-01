/* Minimal service worker — exists only so order-status notifications work
   reliably on mobile (Android Chrome requires a ServiceWorkerRegistration to
   call showNotification(); the plain `new Notification()` constructor isn't
   available there at all). No caching, no offline support — this app is
   fully online-only by design, so there's nothing else for this to do. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.focus();
      if (self.clients.openWindow) return self.clients.openWindow(e.notification.data?.url || "/tracking.html");
    })
  );
});
