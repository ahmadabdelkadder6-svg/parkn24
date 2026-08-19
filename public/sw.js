// ✅ رقم الـ version
const CACHE_NAME    = 'parknow-v4'; // ✅ غيرنا v3 → v4
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json'];

// ✅ تتبع آخر إشعار اتعرض (dedup في الـ memory)
// بيتمسح لما الـ SW يتوقف - مش مشكلة
const recentNotifications = new Map(); // tag → timestamp
const DEDUP_WINDOW_MS     = 5000;      // 5 ثواني

// ─── Install ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 SW installed v4');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// ─── Activate ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => n !== CACHE_NAME)
            .map((n) => {
              console.log('🗑️ حذف كاش قديم:', n);
              return caches.delete(n);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET')                        return;
  if (event.request.url.startsWith('chrome-extension'))      return;
  if (event.request.url.includes('supabase.co'))             return;

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

// ─── Push ─────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let title     = '🚨 ParkNow';
  let body      = 'لديك إشعار جديد';
  const icon    = '/icons/icon-192x192.png';
  const badge   = '/icons/icon-96x96.png';
  let tag       = 'parknow-push';
  let url       = '/';
  let extraData = {};

  // ─── قراءة الـ Payload ──────────────────────────────────
  try {
    if (event.data) {
      const payload = event.data.json();
      console.log('📨 Push received:', payload);

      if (payload.notification) {
        title = payload.notification.title || title;
        body  = payload.notification.body  || body;
      }

      if (payload.data) {
        extraData = payload.data;
        tag       = payload.data.tag || tag;
        url       = payload.data.url || '/';

        if (payload.data.bookingId) {
          url = `/booking/${payload.data.bookingId}`;
        }
        if (payload.data.type === 'new_booking') {
          url = `/garage/bookings/${payload.data.bookingId}`;
        }
      }

      // Flat payload support
      if (!payload.notification && !payload.data) {
        title = payload.title || title;
        body  = payload.body  || body;
        if (payload.bookingId) {
          url       = `/booking/${payload.bookingId}`;
          extraData = payload;
        }
      }
    }
  } catch (err) {
    console.error('❌ Push parse error:', err);
  }

  // ✅ Deduplication: منع نفس الإشعار يتعرض مرتين في 5 ثواني
  const dedupKey       = tag; // الـ tag هو مفتاح التكرار
  const lastShown      = recentNotifications.get(dedupKey);
  const now            = Date.now();

  if (lastShown && (now - lastShown) < DEDUP_WINDOW_MS) {
    console.warn(
      `⚠️ Duplicate push ignored: tag="${tag}" shown ${now - lastShown}ms ago`
    );
    return; // ✅ تجاهل الإشعار المكرر
  }

  // ✅ سجل وقت العرض
  recentNotifications.set(dedupKey, now);

  // ✅ نظف الـ Map من القديم عشان مايكبرش
  for (const [k, t] of recentNotifications.entries()) {
    if (now - t > 60_000) recentNotifications.delete(k); // أقدم من دقيقة
  }

  // ─── إعدادات الإشعار ────────────────────────────────────
  const options = {
    body,
    icon,
    badge,
    vibrate:             [500, 100, 500, 100, 500, 200, 800],
    requireInteraction:  true,
    tag,
    // ✅ renotify: true بس لو الإشعار مختلف فعلاً
    // بعد الـ dedup check، أي إشعار وصل هنا هو جديد
    renotify:            true,
    timestamp:           now,
    data: { url, ...extraData },
    actions: [
      { action: 'open',    title: '📱 فتح التطبيق' },
      { action: 'dismiss', title: '❌ تجاهل'        },
    ],
  };

  console.log('🔔 Showing notification:', { title, tag, url });

  event.waitUntil(
    // ✅ شوف لو في إشعار قديم بنفس الـ tag قبل العرض
    self.registration.getNotifications({ tag }).then((existing) => {
      // ✅ لو في إشعار موجود بنفس الـ tag وجاءنا نفس الـ body، تجاهل
      if (existing.length > 0 && existing[0].body === body) {
        console.warn(`⚠️ Same notification already shown for tag: ${tag}`);
        return; // تجاهل - نفس المحتوى بالظبط
      }

      // ✅ عرض الإشعار
      return self.registration.showNotification(title, options);
    })
  );
});

// ─── Notification Click ───────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    console.log('🔕 Dismissed:', event.notification.tag);
    return;
  }

  const targetUrl = event.notification.data?.url || '/';
  console.log('👆 Notification clicked → navigating to:', targetUrl);

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // ✅ لو التطبيق مفتوح على نفس الـ URL
        for (const client of clientList) {
          if (client.url === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }

        // ✅ لو التطبيق مفتوح على URL تاني
        for (const client of clientList) {
          if (
            client.url.includes(self.location.origin) &&
            'focus' in client
          ) {
            client.focus();
            return client.navigate(targetUrl);
          }
        }

        // ✅ لو التطبيق مغلق - افتحه
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

// ─── Notification Close ───────────────────────────────────────
self.addEventListener('notificationclose', (event) => {
  console.log('🔕 Notification closed without click:', event.notification.tag);
});

// ─── Background Sync ──────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-bookings') {
    console.log('🔄 Background sync');
  }
});