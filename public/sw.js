// ✅ رقم الـ Version - تم التحديث لـ v9 لإجبار المتصفحات على التحديث الفوري
const CACHE_NAME    = 'parknow-v9'; 
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json'];

// ✅ منع تكرار نفس الإشعار خلال 3 ثوانٍ
const recentNotifications = new Map();
const DEDUP_WINDOW_MS     = 3000;

// ─── 1. Install ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting(); // تفعيل فوري بدون انتظار
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Service Worker Installed (v9)');
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

// ─── 4. Push (استقبال الإشعار وإيقاظ الهاتف حتى لو كان مقفولاً) ─────────
self.addEventListener('push', (event) => {
  let title     = '🚨 تنبيه من بركن 24';
  let body      = 'لديك تحديث جديد بخصوص ركنتك';
  const icon    = '/icons/icon-192x192.png';
  const badge   = '/icons/icon-192x192.png';
  let tag       = 'valet-urgent-alarm';
  let url       = '/';
  let extraData = {};
  let isBreach  = false;

  try {
    if (event.data) {
      const payload = event.data.json();
      console.log('📨 Push received in SW:', payload);

      const notificationData = payload.data || payload.immediate?.data || {};
      extraData = notificationData;
      url = notificationData.url || payload.url || '/';

      // 🚨 1. هل الإشعار خاص باختراق درع الأمان / السرقة؟
      if (
        notificationData.type === 'security_breach' ||
        (payload.tag && payload.tag.startsWith('breach-')) ||
        (payload.immediate?.tag && payload.immediate.tag.startsWith('breach-'))
      ) {
        isBreach = true;
        title = payload.immediate?.title || payload.title || '🚨 تحذير أمني: تم رصد تحرك سيارة!';
        body  = payload.immediate?.body  || payload.body  || `🚗 سيارتك تجاوزت فقاعة الأمان بالجراج بدون تصريح!`;
        tag   = `breach-${Date.now()}`;
      } 
      // 🚗 2. هل الإشعار خاص بسيارة قادمة في الطريق؟
      else if (notificationData.type === 'incoming_car' || (payload.tag && payload.tag.startsWith('incoming-'))) {
        const plate = notificationData.carPlate || payload.carPlate || '';
        title = '🚨 سيارة في الطريق إليك!';
        body  = plate ? `🚗 رقم السيارة: ${plate} • استعد للاستقبال!` : 'تقترب سيارة جديدة من الجراج الآن، استعد!';
        tag   = `incoming-${plate || Date.now()}`;
      }
      // ⏰ 3. إشعار عادي / اقتراب
      else {
        title = payload.notification?.title || payload.immediate?.title || payload.title || title;
        body  = payload.notification?.body  || payload.immediate?.body  || payload.body  || body;
        tag   = payload.tag || payload.immediate?.tag || tag;
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

  // 📳 نمط الاهتزاز (اهتزاز طوارئ أطول لو سرقة، ونمط رنين لو وصول سيارة)
  const vibrationPattern = isBreach
    ? [1500, 100, 1500, 100, 1500, 100, 2000, 150, 2000] // سرينة طوارئ واختراق
    : [1000, 300, 1000, 300, 1000, 300, 1000, 300, 1200, 400, 1200]; // وصول سيارة

  const options = {
    body,
    icon,
    badge,
    vibrate: vibrationPattern,
    requireInteraction: true,  // يظل معروضاً على شاشة القفل ولا يختفي حتى يفتحه المستخدم
    tag: tag,
    renotify: true,           // يرن ويهتز حتى لو كان هناك إشعار سابق
    silent: false,
    timestamp: now,
    data: { url, ...extraData },
    actions: [
      { action: 'open',    title: isBreach ? '🚨 فتح تقرير SOS' : '🚗 فتح التطبيق فوراً' },
      { action: 'dismiss', title: '✕ إغلاق' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ─── 5. Notification Click (فتح الصفحة المناسبة عند الضغط) ──────────
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