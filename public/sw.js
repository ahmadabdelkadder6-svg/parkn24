// public/sw.js

// ✅ تحديث رقم الإصدار لـ v12 للسيطرة الفورية
const CACHE_NAME    = 'parkn24-shield-v12'; 
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json'];

const recentNotifications = new Map();
const DEDUP_WINDOW_MS     = 3000;

// 📋 سجل مؤقتات تكرار إشعارات السرقة
const activeTheftAlarms = new Map();

// ─── 1. Install ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
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
          names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── 3. Fetch ─────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.startsWith('chrome-extension')) return;
  if (event.request.url.includes('supabase.co')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') return caches.match('/index.html');
          return new Response('Offline', { status: 503 });
        })
      )
  );
});

// ─── 🛑 استقبال أمر إيقاف الإنذار فوراً من التطبيق ──────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'STOP_THEFT_ALARM') {
    const plate = event.data?.carPlate;

    // 1. مسح وإلغاء جميع مؤقتات التكرار فوراً
    for (const [key, timerId] of activeTheftAlarms.entries()) {
      if (!plate || key === plate) {
        clearTimeout(timerId);
        activeTheftAlarms.delete(key);
      }
    }

    // 2. إغلاق ومسح جميع إشعارات السرقة من شاشة القفل فوراً
    self.registration.getNotifications().then((notifications) => {
      notifications.forEach((n) => {
        if (n.tag && (n.tag.includes('theft') || n.tag.includes('emergency') || n.tag.includes('alarm'))) {
          n.close();
        }
      });
    });
  }
});

// ─── 🔄 دالة تكرار الإشعار ────────────────────────────────────
function scheduleTheftRepeat(title, body, carPlate, repeatCount = 0) {
  const maxRepeats = 20;
  if (repeatCount >= maxRepeats) {
    activeTheftAlarms.delete(carPlate);
    return;
  }

  const timerId = setTimeout(() => {
    // التحقق من أن الإنذار لا يزال مطلوباً
    if (!activeTheftAlarms.has(carPlate)) return;

    const count = repeatCount + 1;
    const repeatTitle = `🚨 إنذار سرقة متكرر (${count}/${maxRepeats})!`;
    const repeatBody = `🚗 ${carPlate} • السيارة لا تزال في خطر! افتح التطبيق فوراً!`;
    const uniqueTag = `theft-repeat-${carPlate}-${Date.now()}`;

    const options = {
      body: repeatBody,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      vibrate: [2000, 200, 2000, 200, 2000, 200, 3000],
      requireInteraction: true,
      tag: uniqueTag,
      renotify: true,
      silent: false,
      timestamp: Date.now(),
      data: { url: '/', type: 'theft_breach', carPlate },
      actions: [
        { action: 'open', title: '🚨 فحص السيارة فوراً' },
        { action: 'dismiss', title: '✕ إيقاف الإنذار' },
      ],
    };

    self.registration.showNotification(repeatTitle, options);

    scheduleTheftRepeat(title, body, carPlate, count);
  }, 15000);

  activeTheftAlarms.set(carPlate, timerId);
}

// ─── 4. Push ──────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let title     = '🚨 تنبيه عاجل من Park\'n 24';
  let body      = '🚗 يوجد تحديث جديد بخصوص حجزك أو سيارتك!';
  const icon    = '/icons/icon-192x192.png';
  const badge   = '/icons/icon-192x192.png';
  let tag       = 'valet-urgent-alarm';
  let url       = '/';
  let extraData = {};
  let isTheftAlert = false;
  let carPlate = '';

  try {
    if (event.data) {
      const payload = event.data.json();

      if (payload.notification) {
        title = payload.notification.title || title;
        body  = payload.notification.body  || body;
      }

      if (payload.data) {
        extraData = payload.data;
        tag       = payload.data.tag || payload.tag || tag;
        url       = payload.data.url || '/';
        carPlate  = payload.data.carPlate || payload.data.car_plate || '';
        if (payload.data.type === 'theft_breach') isTheftAlert = true;
      }

      if (!payload.notification && !payload.data) {
        title = payload.title || title;
        body  = payload.body  || body;
        tag   = payload.tag   || tag;
        carPlate = payload.carPlate || payload.car_plate || '';
        if (payload.type === 'theft_breach') isTheftAlert = true;
      }

      if (tag && (tag.startsWith('theft-alarm-') || tag.startsWith('theft-emergency-') || tag.startsWith('theft-repeat-'))) {
        isTheftAlert = true;
      }

      if (isTheftAlert) {
        title = payload.title || '🚨 إنذار سرقة عاجل لمركبتك!';
        body  = payload.body  || '⚠️ تم رصد حركة غير مصرح بها للسيارة، افتح التطبيق فوراً!';
        tag   = `theft-emergency-${Date.now()}`;
      } else {
        let plate = '';
        if (typeof tag === 'string' && tag.startsWith('incoming-')) {
          plate = tag.replace('incoming-', '');
        } else if (carPlate) {
          plate = carPlate;
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

  if (!isTheftAlert) {
    const dedupKey  = tag;
    const lastShown = recentNotifications.get(dedupKey);
    const now       = Date.now();

    if (lastShown && (now - lastShown) < DEDUP_WINDOW_MS) return;
    recentNotifications.set(dedupKey, now);

    for (const [k, t] of recentNotifications.entries()) {
      if (now - t > 30000) recentNotifications.delete(k);
    }
  }

  const vibrationPattern = isTheftAlert
    ? [2000, 200, 2000, 200, 2000, 200, 3000]
    : [1000, 300, 1000, 300, 1000, 300, 1000, 300, 1000, 300, 1000, 300, 1200, 400, 1200];

  const actionButtons = isTheftAlert
    ? [
        { action: 'open', title: '🚨 فحص السيارة فوراً' },
        { action: 'dismiss', title: '✕ إيقاف الإنذار' },
      ]
    : [
        { action: 'open', title: '🚗 فتح التطبيق فوراً' },
        { action: 'dismiss', title: '✕ إغلاق' },
      ];

  const options = {
    body, icon, badge,
    vibrate: vibrationPattern,
    requireInteraction: true,
    tag,
    renotify: true,
    silent: false,
    timestamp: Date.now(),
    data: { url, ...extraData, carPlate },
    actions: actionButtons,
  };

  event.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      if (isTheftAlert && carPlate) {
        if (activeTheftAlarms.has(carPlate)) {
          clearTimeout(activeTheftAlarms.get(carPlate));
        }
        scheduleTheftRepeat(title, body, carPlate, 0);
      }
    })
  );
});

// ─── 5. Notification Click ────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const plate = event.notification.data?.carPlate || '';
  if (plate && activeTheftAlarms.has(plate)) {
    clearTimeout(activeTheftAlarms.get(plate));
    activeTheftAlarms.delete(plate);
  }

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});

// ─── 6. Notification Close ────────────────────────────────────
self.addEventListener('notificationclose', (event) => {
  const plate = event.notification.data?.carPlate || '';
  if (plate && activeTheftAlarms.has(plate)) {
    clearTimeout(activeTheftAlarms.get(plate));
    activeTheftAlarms.delete(plate);
  }
});