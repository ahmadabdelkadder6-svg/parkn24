// public/sw.js

// ✅ رقم الـ Version - تم التحديث لـ v9 لإجبار المتصفحات على تحديث السيرفس ووركر والإنذارات فوراً
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
      console.log('📦 Service Worker Installed (v9) - Security Engine Active');
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
  let isBreach  = false;

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
        if (payload.data.type === 'security_breach' || payload.data.isBreached) {
          isBreach = true;
        }
      }

      // دعم Flat Payload
      if (!payload.notification && !payload.data) {
        title = payload.title || title;
        body  = payload.body  || body;
        tag   = payload.tag   || tag;
        if (payload.type === 'security_breach' || payload.isBreached) {
          isBreach = true;
        }
      }

      // 🚨 تخصيص فوري لرسائل واهتزاز اختراق درع الأمان VIP للشطرنج والخفاش
      if (isBreach) {
        const carPlate = extraData.carPlate || payload.carPlate || '---';
        const slotId = extraData.slotId || payload.slotId || '';
        const breachReason = extraData.breachReason || payload.breachReason || 'حركة مريبة بالركنة';
        const slotText = slotId ? ` بالمربع [${slotId}]` : '';

        title = `🚨🚨 إنذار سرقة: تحرك سيارة${slotText}!`;
        body  = `🚗 السيارة [${carPlate}] غادرت موقعها! • ${breachReason}`;
        tag   = `breach-${carPlate}-${Date.now()}`; // وسم فريد لإطلاق رنين متكرر ومتتالٍ
        url   = '/session';
      } else {
        // استخلاص رقم اللوحة لوارد الجراج العادي
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
    }
  } catch (err) {
    console.error('❌ Push parse error:', err);
  }

  // منع التكرار اللحظي (فقط للإشعارات العادية، ونستثني إشعارات السرقة لتكرار الرنين)
  const now = Date.now();
  if (!isBreach) {
    const dedupKey  = tag;
    const lastShown = recentNotifications.get(dedupKey);

    if (lastShown && (now - lastShown) < DEDUP_WINDOW_MS) {
      return;
    }

    recentNotifications.set(dedupKey, now);

    for (const [k, t] of recentNotifications.entries()) {
      if (now - t > 30000) recentNotifications.delete(k);
    }
  }

  // 🚨 [تخصيص اهتزاز زلزالي خارق للسرقة / واهتزاز مكالمة عادي لوارد السيارات]
  const vibratePattern = isBreach
    ? [
        2000, 100, 2000, 100, 2000, 100, // رنات عنيفة طويلة واهتزاز متواصل لمنع النوم أو التغاضي
        3000, 100, 3000, 100, 3000, 100,
        4000, 200, 4000
      ]
    : [
        1000, 300, 1000, 300, 1000, 300, // الرنة الأولى لوارد السيارات
        1000, 300, 1000, 300, 1000, 300, 
        1200, 400, 1200                  
      ];

  const options = {
    body,
    icon,
    badge,
    vibrate: vibratePattern,
    requireInteraction: true,           // يظل معروضاً على شاشة القفل ولا يختفي تلقائياً حتى يفتحه السايس/العميل يدوياً
    tag: isBreach ? `urgent-breach-${Date.now()}` : 'valet-urgent-alarm', // وسم فريد لإطلاق إشعار مستقل لكل ثانية سرقة
    renotify: true,                    // تفعيل الصوت والاهتزاز بالقوة الكاملة حتى لو كان هناك إشعار سابق معلق
    silent: false,
    timestamp: now,
    data: { url, ...extraData },
    actions: isBreach 
      ? [
          { action: 'open',    title: '🔒 افتح تفاصيل الاختراق' },
          { action: 'dismiss', title: 'إلغاء التنبيه' }
        ]
      : [
          { action: 'open',    title: '🚗 فتح التطبيق فوراً' },
          { action: 'dismiss', title: '✕ إغلاق'             },
        ],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ─── 5. Notification Click (فتح لوحة الجراج أو شاشة العداد مباشرة) ──────────
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
        // البحث عن تبويب مفتوح للتطبيق لتنشيطه
        for (const client of clientList) {
          if ('focus' in client) {
            client.postMessage({ type: 'NAVIGATE', url: targetUrl });
            return client.focus();
          }
        }
        // لو التطبيق مقفول بالكامل، افتحه في تبويب جديد
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