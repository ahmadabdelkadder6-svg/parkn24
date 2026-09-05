// ✅ تم التحديث لـ v12 لمنع تكرار الرنين وتحديث السيرفس ووركر فوراً
const CACHE_NAME    = 'parknow-v12'; 
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json'];

// ✅ منع تكرار نفس الإشعار لنفس السيارة خلال 30 ثانية
const recentNotifications = new Map();
const DEDUP_WINDOW_MS     = 30000;

// ─── 1. Install ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Service Worker Installed & Activated (v12)');
      return cache.addAll(STATIC_ASSETS);
    })
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

// ─── 3. Message Listener ──────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── 4. Fetch ─────────────────────────────────────────────────
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

// ─── 5. Push (استقبال الإشعار لمرة واحدة فقط وبدون تكرار) ──────
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
      console.log('📨 Push received in SW v12:', payload);

      const notificationData = payload.immediate || payload.notification || payload;

      if (notificationData.title) title = notificationData.title;
      if (notificationData.body)  body  = notificationData.body;
      if (notificationData.tag)   tag   = notificationData.tag;

      if (payload.data || notificationData.data) {
        extraData = payload.data || notificationData.data;
        tag       = extraData.tag || tag;
        url       = extraData.url || '/garage';
      }

      // استخلاص رقم اللوحة وعرضه بوضوح
      let plate = '';
      if (typeof tag === 'string' && tag.startsWith('incoming-')) {
        plate = tag.replace('incoming-', '');
      } else if (typeof tag === 'string' && tag.startsWith('approaching-')) {
        plate = tag.replace('approaching-', '');
      } else if (payload.carPlate || payload.car_plate) {
        plate = payload.carPlate || payload.car_plate;
      } else if (extraData.carPlate || extraData.car_plate) {
        plate = extraData.carPlate || extraData.car_plate;
      }

      if (plate) {
        tag = `car-alert-${plate}`; // ربط التاج باللوحة لمنع تكرار نفس السيارة
        if (typeof title === 'string' && !title.includes(plate)) {
          title = '🚨 سيارة في الطريق إليك!';
          body  = `🚗 رقم السيارة: ${plate} • استعد للاستقبال!`;
        }
      }
    }
  } catch (err) {
    console.error('❌ Push parse error:', err);
  }

  // 🛡️ فحص التكرار: منع تكرار الرنين لنفس السيارة خلال 30 ثانية
  const dedupKey  = tag;
  const lastShown = recentNotifications.get(dedupKey);
  const now       = Date.now();

  if (lastShown && (now - lastShown) < DEDUP_WINDOW_MS) {
    console.log('🛑 تم تجاهل إشعار مكرر لنفس السيارة في SW:', dedupKey);
    return;
  }

  recentNotifications.set(dedupKey, now);

  // تنظيف الذاكرة
  for (const [k, t] of recentNotifications.entries()) {
    if (now - t > 60000) recentNotifications.delete(k);
  }

  // 🚨 [رنين واهتزاز مكالمة هاتفية]: يهتز مرة واحدة فقط للسيارة
  const options = {
    body,
    icon,
    badge,
    vibrate: [
      1000, 300, 1000, 300, 1000, 300, 
      1000, 300, 1000, 300, 
      1500, 400, 2000                  
    ],
    requireInteraction: true,  // يظل معروضاً على شاشة القفل حتى يفتحه السايس
    tag: tag,                  // ✅ التعديل الأول: استخدام التاج الخاص بالسيارة
    renotify: false,           // ✅ التعديل الثاني: منع إعادة الرنين إذا كان الإشعار مفتوحاً مسبقاً
    silent: false,
    timestamp: now,
    data: { url, ...extraData },
    actions: [
      { action: 'open',    title: '🚗 فتح التطبيق فوراً' },
      { action: 'dismiss', title: '✕ إغلاق'             },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ─── 6. Notification Click ────────────────────────────────────
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
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

// ─── 7. Notification Close ────────────────────────────────────
self.addEventListener('notificationclose', (event) => {
  console.log('🔕 تم إغلاق الإشعار:', event.notification.tag);
});