// ✅ تم التحديث لـ v9 لإجبار المتصفح على استبدال الكاش والسيرفس ووركر فوراً
const CACHE_NAME    = 'parknow-v9'; 
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json'];

// ✅ منع تكرار نفس الإشعار خلال 2.5 ثانية
const recentNotifications = new Map();
const DEDUP_WINDOW_MS     = 2500;

// ─── 1. Install (تثبيت وتفعيل فوري) ──────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting(); // تخطي الانتظار والتفعيل الفوري لنسخة v9 المحدثة
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Service Worker Installed & Activated (v9)');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// ─── 2. Activate (السيطرة الفورية وحذف الكاش القديم) ─────────
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

// ─── 3. Message Listener (للتحديث عند الطلب) ──────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── 4. Fetch (التعامل مع الطلبات والكاش بذكاء) ───────────────
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

// ─── 5. Push (استقبال الإشعار الفوري وإيقاظ الهاتف بنمط إنذار) ───
self.addEventListener('push', (event) => {
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
      console.log('📨 Push Payload Received in SW:', payload);

      // استخراج البيانات الذكية القادمة من الـ Edge Function
      const notificationData = payload.immediate || payload.notification || payload;

      if (notificationData.title) title = notificationData.title;
      if (notificationData.body)  body  = notificationData.body;
      if (notificationData.tag)   tag   = notificationData.tag;

      if (payload.data || notificationData.data) {
        extraData = payload.data || notificationData.data;
        if (extraData.url) url = extraData.url;
        if (extraData.tag) tag = extraData.tag;
      }

      // تحليل رقم لوحة السيارة لعرضه كعنوان رئيسي صريح لعم حسن (السايس)
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
    console.error('❌ Push parse error in SW:', err);
  }

  // فلترة ومنع تكرار نفس الإشعار اللحظي لعدم استنزاف البطارية
  const dedupKey  = `${tag}-${title}`;
  const lastShown = recentNotifications.get(dedupKey);
  const now       = Date.now();

  if (lastShown && (now - lastShown) < DEDUP_WINDOW_MS) {
    return;
  }

  recentNotifications.set(dedupKey, now);

  // تنظيف ذاكرة التكرار المؤقتة تلقائياً
  for (const [k, t] of recentNotifications.entries()) {
    if (now - t > 30000) recentNotifications.delete(k);
  }

  // 🚨 [رنين واهتزاز مكالمة هاتفية طوارئ 12 ثانية]: تم ضبطه ليتجاوز قفل الشاشة ويهز الهاتف بعنف
  const options = {
    body,
    icon,
    badge,
    vibrate: [
      1000, 200, 1000, 200, 1000, 200, // رنة قوية أولى
      1200, 250, 1200, 250, 1200, 250, // رنة قوية ثانية
      1500, 300, 2000                  // رنة مستمرة أخيرة لإيقاظ الشاشة
    ],
    requireInteraction: true,          // ⚡ إجباري: يمنع الإشعار من الاختفاء التلقائي ويظل عالقاً على شاشة القفل
    tag: tag || 'valet-urgent-alarm',  // ⚡ تاغ منفصل لكل سيارة لعدم كتم الإشعارات المتتالية
    renotify: true,                    // ⚡ إجباري: يرن ويهتز حتى لو كان هناك تنبيه سابق مفتوح
    silent: false,
    timestamp: now,
    data: { url, ...extraData },
    actions: [
      { action: 'open',    title: '📂 فتح لوحة الجراج' },
      { action: 'dismiss', title: '✕ إغلاق التنبيه'   },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ─── 6. Notification Click (فتح الجراج وتنشيط شاشة السايس فورا) ───
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
        // إذا كان التطبيق مفتوحاً في الخلفية، نقوم بتنشيطه وتوجيهه لصفحة الجراج
        for (const client of clientList) {
          if ('focus' in client) {
            if (client.url.includes(targetUrl)) {
              return client.focus();
            } else if ('navigate' in client) {
              return client.navigate(targetUrl).then((c) => c.focus());
            }
          }
        }
        // إذا كان التطبيق مغلقاً تماماً، نفتحه في نافذة جديدة مباشرة
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

// ─── 7. Notification Close ────────────────────────────────────
self.addEventListener('notificationclose', (event) => {
  console.log('🔕 تم سحب أو إغلاق التنبيه:', event.notification.tag);
});