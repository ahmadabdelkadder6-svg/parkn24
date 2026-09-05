// ✅ تم التحديث لـ v10 لإلغاء الحظر وإجبار المتصفح على تنشيط الخدمة فوراً
const CACHE_NAME    = 'parknow-v10'; 
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json'];

// ─── 1. Install (تثبيت فوري) ──────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Service Worker Installed & Activated (v10)');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// ─── 2. Activate (تنظيف وحذف الكاش القديم تماماً) ─────────
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

// ─── 3. Message Listener ──────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── 4. Fetch ───────────────────────────────────────────────
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

// ─── 5. Push (استقبال آمن ومتوافق 100% مع متطلبات المتصفحات لتفادي الحظر) ───
self.addEventListener('push', (event) => {
  // قيم افتراضية آمنة
  let title     = '🚨 سيارة في الطريق إليك الآن!';
  let body      = '🚗 تقترب سيارة جديدة من الجراج، استعد للاستقبال!';
  const icon    = '/icons/icon-192x192.png';
  const badge   = '/icons/badge-72x72.png';
  let tag       = 'valet-urgent-alarm';
  let url       = '/garage';
  let extraData = {};

  try {
    if (event.data) {
      const payload = event.data.json();
      console.log('📨 Push Payload received in v10:', payload);

      const notificationData = payload.immediate || payload.notification || payload;

      if (notificationData.title) title = notificationData.title;
      if (notificationData.body)  body  = notificationData.body;
      if (notificationData.tag)   tag   = notificationData.tag;

      if (payload.data || notificationData.data) {
        extraData = payload.data || notificationData.data;
        if (extraData.url) url = extraData.url;
        if (extraData.tag) tag = extraData.tag;
      }

      let plate = '';
      if (typeof tag === 'string' && tag.startsWith('incoming-')) {
        plate = tag.replace('incoming-', '');
      } else if (typeof tag === 'string' && tag.startsWith('approaching-')) {
        plate = tag.replace('approaching-', '');
      } else if (extraData.carPlate || extraData.car_plate || payload.carPlate) {
        plate = extraData.carPlate || extraData.car_plate || payload.carPlate;
      }

      if (plate) {
        if (tag.startsWith('approaching-')) {
          title = '⏰ سيارة على وشك الوصول للجراج!';
          body  = `🚗 السيارة ${plate} - باقي أقل من دقيقتين للوصول! ⏰`;
        } else {
          title = '🚨 سيارة في الطريق إليك الآن!';
          body  = `🚗 رقم السيارة: ${plate} • استعد للاستقبال فوراً!`;
        }
      }
    }
  } catch (err) {
    console.error('❌ Push JSON Parse Error:', err);
  }

  // 🚨 [الرنين والاهتزاز القوي المتوافق]: تم إزالة الـ Deduplication الصامت التزاماً بقوانين المتصفحات الصارمة
  const options = {
    body,
    icon,
    badge,
    vibrate: [1000, 200, 1000, 200, 1000, 200, 1200, 250, 1200, 250, 1500, 300, 2000],
    requireInteraction: true,          // حاسم: يمنع اختفاء التنبيه حتى يضغط عليه السايس
    tag: tag || 'valet-urgent-alarm',  // تاغ فريد لكل عربية
    renotify: true,                    // يرن حتى لو كان هناك إشعار سابق مفتوح
    silent: false,
    timestamp: Date.now(),
    data: { url, ...extraData },
    actions: [
      { action: 'open',    title: '📂 فتح لوحة الجراج' },
      { action: 'dismiss', title: '✕ إغلاق'           },
    ],
  };

  // إرسال الإشعار قسرياً للمتصفح لمنع حظر الخدمة
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ─── 6. Notification Click (تنشيط شاشة الموبايل فوراً) ──────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients
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
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});