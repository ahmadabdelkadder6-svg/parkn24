// public/sw.js - Park'n 24 Service Worker v17 (Bulletproof - Full Logic Preserved)

const CACHE_NAME    = 'parkn24-v17';
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
      console.log('📦 Service Worker Installed (v17)');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('⚠️ cache.addAll partial fail (non-fatal):', err);
      });
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
      .then(() => {
        console.log('✅ Service Worker v17 activated & controlling clients');
      })
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

// ─── Helper: عرض إشعار بأمان بدون crash ───────────────────────
async function safeShowNotification(title, options) {
  try {
    await self.registration.showNotification(title || 'Park\'n 24', options);
    return true;
  } catch (err) {
    console.error('❌ showNotification failed, retrying minimal options:', err);
    try {
      await self.registration.showNotification(title || 'Park\'n 24', {
        body: (options && options.body) || 'تنبيه جديد من Park\'n 24',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        tag: (options && options.tag) || ('parkn24-fallback-' + Date.now()),
        data: (options && options.data) || { url: '/garage' },
        requireInteraction: true,
      });
      return true;
    } catch (err2) {
      console.error('❌ Even minimal notification failed:', err2);
      return false;
    }
  }
}

// ─── 5. Push ──────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  const pushWork = (async () => {
    let title     = 'Park\'n 24';
    let body      = '';
    let icon      = '/icons/icon-192x192.png';
    let badge     = '/icons/icon-192x192.png';
    let tag       = 'parkn24-default';
    let url       = '/garage';
    let extraData = {};

    try {
      if (event.data) {
        let payload = null;

        // 1) قراءة التنسيق كـ JSON
        try {
          payload = event.data.json();
        } catch (_) {
          // 2) تجربة قراءة النص ثم تحويله
          try {
            const txt = event.data.text();
            if (txt) {
              try {
                payload = JSON.parse(txt);
              } catch (__) {
                body = txt;
              }
            }
          } catch (___) {
            console.warn('⚠️ Could not read push data as text');
          }
        }

        if (payload) {
          console.log('📨 Push received in SW v17:', payload);

          if (payload.notification) {
            title = payload.notification.title || title;
            body  = payload.notification.body  || body;
            if (payload.notification.icon)  icon  = payload.notification.icon;
            if (payload.notification.badge) badge = payload.notification.badge;
            if (payload.notification.tag)   tag   = payload.notification.tag;
          }

          if (payload.title) title = payload.title;
          if (payload.body)  body  = payload.body;
          if (payload.icon)  icon  = payload.icon;
          if (payload.badge) badge = payload.badge;
          if (payload.tag)   tag   = payload.tag;
          if (payload.url)   url   = payload.url;

          if (payload.data) {
            extraData = { ...payload.data };
            if (payload.data.tag) tag = payload.data.tag;
            if (payload.data.url) url = payload.data.url;
            if (payload.data.type) extraData.type = payload.data.type;
          }

          let plate = '';
          if (typeof tag === 'string' && tag.startsWith('incoming-')) {
            plate = tag.replace('incoming-', '');
          } else if (payload.carPlate || payload.car_plate) {
            plate = payload.carPlate || payload.car_plate;
          } else if (payload.data?.carPlate || payload.data?.car_plate) {
            plate = payload.data.carPlate || payload.data.car_plate;
          }

          if (plate && typeof tag === 'string' && tag.startsWith('incoming-')) {
            title = '🚨 سيارة في الطريق إليك!';
            body  = `🚗 رقم السيارة: ${plate} • استعد للاستقبال!`;
          }
        }
      }
    } catch (err) {
      console.error('❌ Push parse error:', err);
    }

    if (!body) {
      body = 'في تحديث جديد من Park\'n 24';
    }

    const dedupKey  = tag || ('parkn24-' + title + '-' + body);
    const lastShown = recentNotifications.get(dedupKey);
    const now       = Date.now();

    if (lastShown && (now - lastShown) < DEDUP_WINDOW_MS) {
      console.log('🔁 Dedup skip:', dedupKey);
      return;
    }
    recentNotifications.set(dedupKey, now);

    for (const [k, t] of recentNotifications.entries()) {
      if (now - t > 30000) recentNotifications.delete(k);
    }

    // ═══════════════════════════════════════════════════════════
    // 🛡️ إشعارات الحماية والتنبيهات الأمنية
    // ═══════════════════════════════════════════════════════════
    const isShield = (typeof tag === 'string' && tag.startsWith('shield-'))
      || extraData.type === 'shield'
      || extraData.type === 'shield-warning';
    const isBreach = tag === 'shield-breach'
      || extraData.type === 'shield-breach'
      || extraData.type === 'breach';

    let options;

    if (isBreach) {
      // 🚨 تنبيه حركة - اهتزاز عنيف وتوجيه لـ /garage (الافتراضي الثابت)
      const breachTargetUrl = extraData.url || url || '/garage';
      options = {
        body: body || 'تنبيه حركة: السيارة اتحركت من مكان الركن! افتح التطبيق فوراً',
        icon,
        badge,
        vibrate: [
          1000, 200, 1000, 200, 1000, 200,
          1000, 200, 1000, 200, 1000, 200,
          1500, 400, 1500, 400, 1500,
        ],
        requireInteraction: true,
        tag: 'shield-breach',
        renotify: true,
        silent: false,
        timestamp: now,
        data: { url: breachTargetUrl, type: 'shield-breach', ...extraData },
        actions: [
          { action: 'open',    title: '🚨 افتح التطبيق فوراً' },
          { action: 'dismiss', title: '✅ أنا اللي سايق'       },
        ],
      };

      await safeShowNotification(title || '🚨 تنبيه حركة!', options);

      try {
        const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clientsList) {
          client.postMessage({
            type: 'SHIELD_BREACH_DETECTED',
            distance: extraData.distance,
            shieldId: extraData.shieldId,
          });
        }
      } catch (msgErr) {
        console.warn('⚠️ postMessage to clients failed:', msgErr);
      }
      return;
    }

    if (isShield) {
      const isWarning = (typeof tag === 'string' && tag.includes('warning'))
        || (typeof extraData.type === 'string' && extraData.type.includes('warning'));
      const shieldTargetUrl = extraData.url || url || '/garage';
      options = {
        body: body || 'تحديث من نظام المراقبة',
        icon,
        badge,
        vibrate: isWarning
          ? [500, 150, 500, 150, 800]
          : [200, 100, 200],
        requireInteraction: isWarning,
        tag,
        renotify: isWarning,
        silent: false,
        timestamp: now,
        data: { url: shieldTargetUrl, type: extraData.type || 'shield', ...extraData },
      };
    } else {
      // التنبيهات الافتراضية للجراج
      const defaultTargetUrl = url || extraData.url || '/garage';
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
        tag: tag || 'valet-urgent-alarm',
        renotify: true,
        silent: false,
        timestamp: now,
        data: { url: defaultTargetUrl, ...extraData },
        actions: [
          { action: 'open',    title: '🚗 فتح التطبيق فوراً' },
          { action: 'dismiss', title: '✕ إغلاق'             },
        ],
      };
    }

    await safeShowNotification(title, options);
  })();

  event.waitUntil(pushWork);
});

// ─── 6. Notification Click ────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};
  const isBreach  = notifData.type === 'shield-breach' || notifData.type === 'breach';

  // ✅ العميل داس "أنا اللي سايق" → ابعت للتطبيق يوقف التنبيه
  if (event.action === 'dismiss') {
    if (isBreach) {
      event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
          for (const client of list) {
            client.postMessage({ type: 'SHIELD_BREACH_DISMISSED' });
          }
        })
      );
    }
    return;
  }

  // 🎯 التوجيه الافتراضي الثابت: /garage (مفيش إجبار على /session)
  const targetUrl = notifData.url || '/garage';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            if (isBreach) {
              client.postMessage({
                type: 'SHIELD_BREACH_DETECTED',
                distance: notifData.distance,
                shieldId: notifData.shieldId,
              });
            }
            if ('navigate' in client) {
              try { client.navigate(targetUrl); } catch (_) {}
            }
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