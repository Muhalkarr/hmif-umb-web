/**
 * PRTS Service Worker – Web Push Notifications
 *
 * Menangani:
 * 1. push event   → tampilkan notifikasi dari server
 * 2. notificationclick → fokus/buka tab yang relevan
 * 3. install & activate → caching offline minimal
 */

const CACHE_NAME = 'prts-sw-v1';
const OFFLINE_ASSETS = ['/'];

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS))
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

// ─── Push event ──────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {
    title: 'PRTS Notification',
    body: 'Ada pembaruan baru untuk Anda.',
    icon: '/assets/images/prts-icon.png',
    badge: '/assets/images/prts-badge.png',
    url: '/'
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    vibrate: [200, 100, 200],
    tag: data.tag || 'prts-notification',
    renotify: Boolean(data.tag),
    data: { url: data.url || '/' },
    actions: data.actions || []
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ─── Notification click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Fokus ke tab yang sudah ada jika URL sama
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if (targetUrl !== '/') client.navigate(targetUrl);
          return;
        }
      }
      // Buka tab baru
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
