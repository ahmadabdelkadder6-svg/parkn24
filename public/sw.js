// ✅ Version - v11 إصلاح parse إشعارات الدرع
const CACHE_NAME    = 'parkn24-v11';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json'];

const recentNotifications = new Map();
const DEDUP_WINDOW_MS     = 3000;

// ─── 1. Message Listener ──────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── 2. Install ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Service Worker Installed (v11)');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// ─── 3. Activate ──────────────────────────────────────────────
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

// ─── 4. Fetch ─────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET')                   return;
  if (event.request.url.startsWith('chrome-extension')) return;
  if (event.request.url.includes('supabase.co'))        return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
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

// ─── 5. Push ──────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let title     = 'Park\'n 24';
  let body      = '';
  let icon      = '/icons/icon-192x192.png';
  let badge     = '/icons/icon-192x192.png';
  let tag       = 'parkn24-default';
  let url       = '/';
  let extraData = {};

  try {
    if (event.data) {
      const payload = event.data.json();
      console.log('📨 Push received in SW:', payload);

      // ═══ إصلاح: خد title/body من أي مكان في الـ payload ═══
      // 1. من payload.notification (FCM format)
      if (payload.notification) {
        title = payload.notification.title || title;
        body  = payload.notification.body  || body;
      }

      // 2. من الـ root (web-push format — ده اللي الـ cron بيبعته)
      if (payload.title) title = payload.title;
      if (payload.body)  body  = payload.body;
      if (payload.icon)  icon  = payload.icon;
      if (payload.badge) badge = payload.badge;
      if (payload.tag)   tag   = payload.tag;
      if (payload.url)   url   = payload.url;

      // 3. من payload.data
      if (payload.data) {
        extraData = payload.data;
        if (payload.data.tag) tag = payload.data.tag;
        if (payload.data.url) url = payload.data.url;
        if (payload.data.type) extraData.type = payload.data.type;
      }

      // استخلاص رقم اللوحة للجراج
      let plate = '';
      if (typeof tag === 'string' && tag.startsWith('incoming-')) {
        plate = tag.replace('incoming-', '');
      } else if (payload.carPlate || payload.car_plate) {
        plate = payload.carPlate || payload.car_plate;
      } else if (payload.data?.carPlate || payload.data?.car_plate) {
        plate = payload.data.carPlate || payload.data.car_plate;
      }

      if (plate && tag.startsWith('incoming-')) {
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

  if (lastShown && (now - lastShown) < DEDUP_WINDOW_MS) return;
  recentNotifications.set(dedupKey, now);

  for (const [k, t] of recentNotifications.entries()) {
    if (now - t > 30000) recentNotifications.delete(k);
  }

  // ═══════════════════════════════════════════════════════════
  // 🛡️ إشعارات الدرع
  // ═══════════════════════════════════════════════════════════
  const isShield = tag.startsWith('shield-');
  const isBreach = tag === 'shield-breach' || extraData.type === 'shield-breach';

  let options;

  if (isBreach) {
    options = {
      body: body || 'السيارة خرجت من نطاق الجراج! افتح التطبيق فوراً',
      icon,
      badge,
      vibrate: [
        1000, 200, 1000, 200, 1000, 200,
        1000, 200, 1000, 200, 1000, 200,
        1500, 500, 1500,
      ],
      requireInteraction: true,
      tag: 'shield-breach',
      renotify: true,
      silent: false,
      timestamp: now,
      data: { url: '/session', type: 'breach', ...extraData },
      actions: [
        { action: 'open',    title: '🚨 افتح التطبيق فوراً' },
        { action: 'dismiss', title: '✅ أنا اللي سايق'       },
      ],
    };
  } else if (isShield) {
    const isWarning = tag.includes('warning') || extraData.type?.includes('warning');
    options = {
      body: body || 'تحديث من درع الحماية',
      icon,
      badge,
      vibrate: isWarning
        ? [400, 150, 400, 150, 600]
        : [150, 100, 150],
      requireInteraction: isWarning,
      tag,
      renotify: isWarning,
      silent: false,
      timestamp: now,
      data: { url: '/session', type: 'shield', ...extraData },
    };
  } else {
    options = {
      body: body || '🚗 تقترب سيارة جديدة من الجراج الآن، استعد!',
      icon,
      badge,
      vibrate: [
        1000, 300, 1000, 300, 1000, 300,
        1000, 300, 1000, 300, 1000, 300,
        1200, 400, 1200,
      ],
      requireInteraction: true,
      tag: 'valet-urgent-alarm',
      renotify: true,
      silent: false,
      timestamp: now,
      data: { url, ...extraData },
      actions: [
        { action: 'open',    title: '🚗 فتح التطبيق فوراً' },
        { action: 'dismiss', title: '✕ إغلاق'             },
      ],
    };
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ─── 6. Notification Click ────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    if (event.notification.data?.type === 'breach') {
      event.waitUntil(
        clients.matchAll({ type: 'window' }).then((list) => {
          for (const client of list) {
            client.postMessage({ type: 'SHIELD_BREACH_DISMISSED' });
          }
        })
      );
    }
    return;
  }

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            if (targetUrl && 'navigate' in client) client.navigate(targetUrl);
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});

// ─── 7. Notification Close ────────────────────────────────────
self.addEventListener('notificationclose', (event) => {
  console.log('🔕 تم إغلاق الإشعار:', event.notification.tag);
});