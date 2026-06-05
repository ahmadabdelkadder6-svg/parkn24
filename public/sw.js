const CACHE_NAME = 'parknow-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-96x96.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// ─── التثبيت ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 تم تخزين الملفات');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ─── التفعيل ────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('🗑️ حذف كاش قديم:', name);
            return caches.delete(name);
          })
      )
    )
  );
  self.clients.claim();
});

// ─── استراتيجية Network First مع Fallback للكاش ───────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.startsWith('chrome-extension')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone).catch(() => {});
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;

          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }

          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// ─── استقبال Push Notification ─────────────────────────────────────────────
self.addEventListener('push', (event) => {
  console.log('📲 Push received');

  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    try {
      data = {
        title: '🚨 تنبيه جديد',
        body: event.data ? event.data.text() : '',
      };
    } catch {
      data = {
        title: '🚨 تنبيه جديد',
        body: 'يوجد تنبيه جديد من التطبيق',
      };
    }
  }

  const title = data.title || '🚨 تنبيه جديد';
  const options = {
    body: data.body || 'يوجد تحديث جديد',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    image: data.image || undefined,

    // ✅ اهتزاز واضح
    vibrate: [500, 150, 500, 150, 700, 200, 900],

    // ✅ يخليه واضح ومايختفيش بسرعة
    requireInteraction: true,
    renotify: true,
    silent: false,

    tag: data.tag || 'parknow-alert',
    data: {
      url: data?.data?.url || '/',
      type: data?.data?.type || null,
      carPlate: data?.data?.carPlate || null,
      garageId: data?.data?.garageId || null,
      ...data?.data,
    },

    actions: [
      { action: 'open', title: '📱 فتح التطبيق' },
      { action: 'dismiss', title: '✕ إغلاق' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ─── الضغط على الإشعار ─────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = event.notification?.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ─── عند غلق الإشعار اختياري ───────────────────────────────────────────────
self.addEventListener('notificationclose', (event) => {
  console.log('🔕 Notification closed:', event.notification.tag);
});