// Service worker — FCM not used. Browser Notification API handles D-1 alerts.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
