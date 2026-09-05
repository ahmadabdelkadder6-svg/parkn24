// ✅ إصدار v12 المانع للتكرار الصامت والنهائي
const CACHE_NAME    = 'parknow-v12'; 
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json'];

// ─── 1. Install ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

// ─── 2. Activate ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => n !== CACHE_NAME)
            .map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim()) 
  );
});

// ─── 3. Fetch ─────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET')                   return;
  if (event.request.url.startsWith('chrome-extension')) return;
  if (event.request.url.includes('supabase.co'))        return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        })
      )
  );
});

// ─── 4. Push (استقبال الإشعار ودمج النسخ المكررة في رنة واحدة) ──
self.addEventListener('push', (event) => {
  let title     = '🚨 سيارة في الطريق إليك!';
  let body      = '🚗 تقترب سيارة جديدة من الجراج الآن، استعد!';
  const icon    = '/icons/icon-192x192.png';
  const badge   = '/icons/badge-72x72.png';
  let tag       = 'incoming-alert';
  let url       = '/garage';
  let extraData = {};

  try {
    if (event.data) {
      const payload = event.data.json();
      const notificationData = payload.immediate || payload.notification || payload;

      if (notificationData.title) title = notificationData.title;
      if (notificationData.body)  body  = notificationData.body;
      if (notificationData.tag)   tag   = notificationData.tag;

      if (payload.data || notificationData.data) {
        extraData = payload.data || notificationData.data;
        if (extraData.url) url = extraData.url;
        if (extraData.tag) tag = extraData.tag;
      }

      // استخراج اللوحة وربط التاج بها لمنع تكرار نفس السيارة
      let plate = '';
      if (typeof tag === 'string' && tag.startsWith('incoming-')) {
        plate = tag.replace('incoming-', '');
      } else if (typeof tag === 'string' && tag.startsWith('approaching-')) {
        plate = tag.replace('approaching-', '');
      } else if (extraData.carPlate || extraData.car_plate || payload.carPlate) {
        plate = extraData.carPlate || extraData.car_plate || payload.carPlate;
      }

      if (plate) {
        tag = `incoming-${plate}`;
        if (typeof title === 'string' && !title.includes(plate)) {
          title = '🚨 سيارة في الطريق إليك!';
          body  = `🚗 رقم السيارة: ${plate} • استعد للاستقبال!`;
        }
      }
    }
  } catch (err) {
    console.error('❌ Push parse error:', err);
  }

  // 🛡️ الدمج التلقائي: إذا وصلت 30 إشارة لنفس السيارة في نفس اللحظة، يرن الهاتف مرة واحدة فقط
  const options = {
    body,
    icon,
    badge,
    vibrate: [1000, 200, 1000, 200, 1000, 200, 1200, 250, 1200, 250, 1500, 300, 2000],
    requireInteraction: true,
    tag: tag,          // 👈 ربط الإشعار باللوحة
    renotify: false,   // 👈 حاسم: يمنع إعادة الاهتزاز والرنين إذا كان الإشعار معروضاً بالفعل
    silent: false,
    timestamp: Date.now(),
    data: { url, ...extraData },
    actions: [
      { action: 'open',    title: '📂 فتح لوحة الجراج' },
      { action: 'dismiss', title: '✕ إغلاق'           },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ─── 5. Notification Click ────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = event.notification.data?.url || '/garage';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            if (client.url.includes(targetUrl)) {
              return client.focus();
            } else if ('navigate' in client) {
              return client.navigate(targetUrl).then((c) => c.focus());
            }
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

self.addEventListener('notificationclose', (event) => {
  console.log('🔕 تم إغلاق الإشعار:', event.notification.tag);
});