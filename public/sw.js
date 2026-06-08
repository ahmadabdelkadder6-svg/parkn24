// ✅ رقم الـ version اتغير - بيجبر الـ SW يتحدث
const CACHE_NAME = 'parknow-v3'; // ✅ غيرنا v2 → v3

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// ─── التثبيت ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 تم تخزين الملفات');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// ─── التفعيل ──────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('🗑️ حذف كاش قديم:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// ─── Fetch ────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.startsWith('chrome-extension')) return;
  if (event.request.url.includes('supabase.co')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// ─── Push Notifications ──────────────────────────────────────
self.addEventListener('push', (event) => {
  
  // ✅ قيم افتراضية شاملة
  let title = '🚨 ParkNow';
  let body = 'لديك إشعار جديد';
  let icon = '/icons/icon-192x192.png';
  let badge = '/icons/icon-96x96.png';
  let tag = 'parknow-push';
  let url = '/';         // ✅ الصفحة اللي تفتح عند الضغط
  let extraData = {};    // ✅ بيانات إضافية من السيرفر

  // ✅ محاولة قراءة البيانات من الـ push event
  try {
    if (event.data) {
      const payload = event.data.json();
      console.log('📨 Push payload وصل:', payload);

      // ✅ قراءة من notification object (لو السيرفر أرسله)
      if (payload.notification) {
        title = payload.notification.title || title;
        body  = payload.notification.body  || body;
        icon  = payload.notification.icon  || icon;
      }

      // ✅ قراءة من data object (بيانات إضافية من السيرفر)
      if (payload.data) {
        extraData          = payload.data;
        tag                = payload.data.tag       || tag;
        url                = payload.data.url       || '/';
        // ✅ لو فيه bookingId، وجه لصفحة الحجز
        if (payload.data.bookingId) {
          url = `/booking/${payload.data.bookingId}`;
        }
        // ✅ لو نوع الإشعار حجز جديد للجراج
        if (payload.data.type === 'new_booking') {
          url = `/garage/bookings/${payload.data.bookingId}`;
        }
      }

      // ✅ دعم الـ payload المسطح (بدون notification/data objects)
      // لو السيرفر أرسل: { title, body, bookingId }
      if (!payload.notification && !payload.data) {
        title = payload.title || title;
        body  = payload.body  || body;
        if (payload.bookingId) {
          url = `/booking/${payload.bookingId}`;
          extraData = payload;
        }
      }
    }
  } catch (error) {
    console.error('❌ خطأ في قراءة push data:', error);
  }

  // ✅ إعدادات الإشعار الكاملة
  const options = {
    body,
    icon,
    badge,
    
    // ✅ الاهتزاز: 3 نبضات قوية لتنبيه صاحب الجراج
    vibrate: [500, 100, 500, 100, 500, 200, 800],
    
    // ✅ يبقى الإشعار ظاهراً حتى يتفاعل المستخدم
    requireInteraction: true,
    
    // ✅ tag لمنع تكرار الإشعارات نفسها
    tag,
    
    // ✅ لو جاء إشعار جديد بنفس الـ tag، يحل محل القديم
    renotify: true,
    
    // ✅ الوقت الحالي
    timestamp: Date.now(),
    
    // ✅ البيانات - مهمة جداً لـ notificationclick
    data: {
      url,
      ...extraData,
    },

    // ✅ أزرار الإشعار
    actions: [
      { action: 'open',    title: '📱 فتح التطبيق' },
      { action: 'dismiss', title: '❌ تجاهل'        },
    ],
  };

  console.log('🔔 عرض إشعار:', title, options);

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ─── عند الضغط على الإشعار ───────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // ✅ لو ضغط تجاهل، لا تفعل شيئاً
  if (event.action === 'dismiss') return;

  // ✅ استخراج الـ URL من بيانات الإشعار
  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/';

  console.log('👆 ضغط على إشعار - التوجه إلى:', targetUrl);

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        
        // ✅ ابحث لو التطبيق مفتوح على نفس الـ URL
        for (const client of clientList) {
          if (client.url === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }

        // ✅ لو التطبيق مفتوح على URL تاني، وجهه للصفحة المطلوبة
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            // ✅ أرسل رسالة للتطبيق عشان يتنقل للصفحة المطلوبة
            return client.navigate(targetUrl);
          }
        }

        // ✅ لو التطبيق مغلق تماماً - افتحه على الصفحة المطلوبة
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

// ─── عند إغلاق الإشعار بدون ضغط ─────────────────────────────
self.addEventListener('notificationclose', (event) => {
  // ✅ يمكن استخدامها لتتبع analytics
  console.log('🔕 أغلق الإشعار بدون ضغط:', event.notification.tag);
  
  // ✅ اختياري: أرسل للسيرفر إن الإشعار تم رؤيته لكن تم تجاهله
  // fetch('/api/notifications/dismissed', {
  //   method: 'POST',
  //   body: JSON.stringify({ tag: event.notification.tag }),
  // });
});

// ─── Background Sync (اختياري - للمستقبل) ────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-bookings') {
    console.log('🔄 Background sync للحجوزات');
    // event.waitUntil(syncBookings());
  }
});