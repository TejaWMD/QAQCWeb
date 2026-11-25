import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'pages-cache',
    networkTimeoutSeconds: 5,
  })
);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Handle incoming Web Push notifications even when QAQCWeb is closed
self.addEventListener('push', (event) => {
  const defaultIcon = new URL('pwa-192x192.png', self.registration.scope).href;

  let payload = {
    title: 'WMG Factory QC Web',
    body: 'New notification received',
    icon: defaultIcon,
    badge: defaultIcon,
    tag: `qaqc-alert-${Date.now()}`,
    data: { appId: 'qaqc', path: '/downtime' },
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  const incomingData =
    typeof payload.data === 'object' && payload.data ? payload.data : {};

  const notificationOptions = {
    body: String(payload.body || ''),
    icon: defaultIcon,
    badge: defaultIcon,
    tag: String(payload.tag || `qaqc-alert-${Date.now()}`),
    data: {
      ...incomingData,
      appId: 'qaqc',
    },
    vibrate: [250, 100, 250, 100, 250],
    requireInteraction: true,
    renotify: true,
    silent: false,
    actions: [
      { action: 'open', title: 'Open QAQC Web' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(
        String(payload.title || 'WMG Factory QC Web'),
        notificationOptions
      ),
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          for (const client of clientList) {
            client.postMessage({
              type: 'SW_NOTIFICATION_RECEIVED',
              tag: notificationOptions.tag,
              data: notificationOptions.data,
            });
          }
        }),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const notifData = event.notification.data || {};
  const rawPath = typeof notifData.path === 'string' ? notifData.path.trim() : '/downtime';
  const hashPath = rawPath.startsWith('/') ? `#${rawPath}` : `#/${rawPath}`;
  const targetUrl = new URL(hashPath, self.registration.scope).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.postMessage({
              type: 'QAQC_OPEN_PATH_FROM_NOTIFICATION',
              path: rawPath,
              data: notifData,
            });
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
