// ✅ رقم الـ Version - تم التحديث لـ v8 لإجبار المتصفحات على تحديث السيرفس ووركر فوراً
const CACHE_NAME    = 'parknow-v8'; 
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json'];

// ✅ منع تكرار نفس الإشعار خلال 3 ثوانٍ
const recentNotifications = new Map();
const DEDUP_WINDOW_MS     = 3000;

// ─── 1. Install ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting(); // تفعيل فوري بدون انتظار
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Service Worker Installed (v8)');
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
            .map((n) => {
              console.log('🗑️ حذف الكاش القديم:', n);
              return caches.delete(n);
            })
        )
      )
      .then(() => self.clients.claim()) // السيطرة الفورية على كل التبويبات المفتوحة
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

// ─── 4. Push (استقبال الإشعار الفوري وإيقاظ الهاتف بنمط رنين قوي) ─────────
self.addEventListener('push', (event) => {
  let title     = '🚨 سيارة في الطريق إليك!';
  let body      = '🚗 تقترب سيارة جديدة من الجراج الآن، استعد!';
  const icon    = '/icons/icon-192x192.png';
  const badge   = '/icons/icon-192x192.png';
  let tag       = 'incoming-alert';
  let url       = '/';
  let extraData = {};

  try {
    if (event.data) {
      const payload = event.data.json();
      console.log('📨 Push received in SW:', payload);

      if (payload.notification) {
        title = payload.notification.title || title;
        body  = payload.notification.body  || body;
      }

      if (payload.data) {
        extraData = payload.data;
        tag       = payload.data.tag || payload.tag || tag;
        url       = payload.data.url || '/';
      }

      // دعم Flat Payload
      if (!payload.notification && !payload.data) {
        title = payload.title || title;
        body  = payload.body  || body;
        tag   = payload.tag   || tag;
      }

      // استخلاص رقم اللوحة وعرضه بوضوح
      let plate = '';
      if (typeof tag === 'string' && tag.startsWith('incoming-')) {
        plate = tag.replace('incoming-', '');
      } else if (payload.carPlate || payload.car_plate) {
        plate = payload.carPlate || payload.car_plate;
      } else if (payload.data && (payload.data.carPlate || payload.data.car_plate)) {
        plate = payload.data.carPlate || payload.data.car_plate;
      }

      if (plate) {
        title = '🚨 سيارة في الطريق إليك!';
        body  = `🚗 رقم السيارة: ${plate} • استعد للاستقبال!`;
      }
    }
  } catch (err) {
    console.error('❌ Push parse error:', err);
  }

  // منع التكرار اللحظي
  const dedupKey  = tag;
  const lastShown = recentNotifications.get(dedupKey);
  const now       = Date.now();

  if (lastShown && (now - lastShown) < DEDUP_WINDOW_MS) {
    return;
  }

  recentNotifications.set(dedupKey, now);

  for (const [k, t] of recentNotifications.entries()) {
    if (now - t > 30000) recentNotifications.delete(k);
  }

  // 🚨 [نمط رنين مكالمة الهاتف العنيف]: اهتزاز متواصل 10 ثوانٍ لإيقاظ السايس في الشارع
  const options = {
    body,
    icon,
    badge,
    vibrate: [
      1000, 300, 1000, 300, 1000, 300, // الرنة الأولى
      1000, 300, 1000, 300, 1000, 300, // الرنة الثانية
      1200, 400, 1200                  // رنة تأكيدية أخيرة
    ],
    requireInteraction: true,           // يظل معروضاً على شاشة القفل ولا يختفي حتى يفتحه السايس
    tag: 'valet-urgent-alarm',         // تاغ موحد لإيقاظ الشاشة
    renotify: true,                    // يرن ويهتز حتى لو كان هناك إشعار سابق
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

// ─── 5. Notification Click (فتح لوحة الجراج مباشرة) ──────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = event.notification.data?.url || '/';

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

// ─── 6. Notification Close ────────────────────────────────────
self.addEventListener('notificationclose', (event) => {
  console.log('🔕 تم إغلاق الإشعار:', event.notification.tag);
});