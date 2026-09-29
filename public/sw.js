// public/sw.js
// 🛡️ Park'n 24 Shield v15 - تنبيهات متواصلة عالية الإلحاح لا تتوقف حتى تأكيد الأمان

const CACHE_NAME    = 'parkn24-shield-v15'; 
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json'];

const recentNotifications = new Map();
const DEDUP_WINDOW_MS     = 3000;

// 🚨 خريطة المؤقتات النشطة للإنذارات المتكررة (لكل سيارة مؤقت مستقل)
const activeTheftAlarms = new Map();

// 🧼 دالة تطهير لوحات السيارات للمطابقة الآمنة
function cleanPlateForCompare(plate) {
  if (!plate) return '';
  return String(plate)
    .replace(/[\s_\-]/g, '')
    .replace(/[\u064B-\u065F\u0670\u0654\u0655\u0653]/g, '')
    .replace(/ة/g, 'ه')
    .replace(/[ىی]/g, 'ي')
    .replace(/[أإآ]/g, 'ا')
    .toLowerCase()
    .trim();
}

// ─── 1. Install ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 SW v15 Installed - Ultra Persistent Shield');
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

// ─── 🛑 استقبال أمر إيقاف الإنذار من التطبيق (كتم/تأكيد أمان) ──────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'STOP_THEFT_ALARM') {
    const rawPlate = event.data?.carPlate;
    const cleanTarget = cleanPlateForCompare(rawPlate);
    console.log('🛑 SW received STOP command for:', rawPlate);

    // 1. إيقاف جميع مؤقتات التكرار المطابقة
    for (const [key, timerId] of activeTheftAlarms.entries()) {
      const cleanKey = cleanPlateForCompare(key);
      if (!cleanTarget || cleanKey === cleanTarget) {
        clearTimeout(timerId);
        activeTheftAlarms.delete(key);
        console.log('✅ Timer cleared for:', key);
      }
    }

    // 2. إغلاق جميع الإشعارات المرئية للسيارة المستهدفة
    self.registration.getNotifications().then((notifications) => {
      notifications.forEach((n) => {
        const notifPlate = cleanPlateForCompare(n.data?.carPlate || '');
        const isTheftTag = n.tag && (
          n.tag.includes('theft') || 
          n.tag.includes('emergency') || 
          n.tag.includes('alarm') ||
          n.tag.includes('repeat')
        );
        if (isTheftTag && (!cleanTarget || notifPlate === cleanTarget)) {
          n.close();
        }
      });
    });
  }
});

// ─── 🔄 مُجدول التكرار المزعج (كل 8 ثوان × 40 مرة = 5 دقائق) ────────────────────────
function scheduleTheftRepeat(carPlate, repeatCount = 0) {
  const maxRepeats = 40; 
  const REPEAT_INTERVAL_MS = 8000; // 8 ثواني بين كل تنبيه للحفاظ على الإلحاح

  if (repeatCount >= maxRepeats) {
    activeTheftAlarms.delete(carPlate);
    console.log('⏹️ Max repeats reached for:', carPlate);
    return;
  }

  const timerId = setTimeout(() => {
    if (!activeTheftAlarms.has(carPlate)) {
      console.log('🛑 Alarm was stopped externally for:', carPlate);
      return;
    }

    const count = repeatCount + 1;
    const repeatTitle = `🚨 إنذار سرقة نشط! (${count}/${maxRepeats})`;
    const repeatBody = `🚗 السيارة: ${carPlate} • السيارة في خطر شديد! اضغط لفتح التطبيق فوراً لتأمينها!`;
    const uniqueTag = `theft-repeat-${carPlate}-${count}`;

    const options = {
      body: repeatBody,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      vibrate: [2000, 300, 2000, 300, 2000, 300, 3000],
      requireInteraction: true, // لا يختفي إلا بالضغط
      tag: uniqueTag, // كل تنبيه فريد ليظهر كتنبيه جديد على شاشة القفل
      renotify: true,
      silent: false,
      timestamp: Date.now(),
      data: { url: '/', type: 'theft_breach', carPlate },
      actions: [
        { action: 'open', title: '🚨 فحص السيارة فوراً' },
        { action: 'dismiss', title: '✕ فتح للتأكيد' },
      ],
    };

    self.registration.showNotification(repeatTitle, options).then(() => {
      // جدولة التنبيه التالي فور نجاح عرض هذا التنبيه
      scheduleTheftRepeat(carPlate, count);
    }).catch(() => {
      scheduleTheftRepeat(carPlate, count);
    });

  }, REPEAT_INTERVAL_MS);

  activeTheftAlarms.set(carPlate, timerId);
}

// ─── 4. Push Handler (استقبال إنذار السرقة من السيرفر) ─────────────
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
        title = '🚨 إنذار سرقة عاجل لمركبتك!';
        body  = body || '⚠️ تم رصد حركة غير مصرح بها للسيارة، افتح التطبيق فوراً!';
        tag   = `theft-emergency-${Date.now()}`;
      }
    }
  } catch (err) {
    console.error('❌ Push parse error:', err);
  }

  // منع تكرار الإشعارات العادية فقط (ليس السرقة)
  if (!isTheftAlert) {
    const dedupKey  = tag;
    const lastShown = recentNotifications.get(dedupKey);
    const now       = Date.now();
    if (lastShown && (now - lastShown) < DEDUP_WINDOW_MS) return;
    recentNotifications.set(dedupKey, now);
  }

  const vibrationPattern = isTheftAlert
    ? [2000, 300, 2000, 300, 2000, 300, 3000]
    : [1000, 300, 1000, 300, 1000];

  const actionButtons = isTheftAlert
    ? [
        { action: 'open', title: '🚨 فحص السيارة فوراً' },
        { action: 'dismiss', title: '✕ فتح للتأكيد' },
      ]
    : [
        { action: 'open', title: '🚗 فتح التطبيق' },
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
      // 🚨 إطلاق سلسلة الإنذارات المتكررة المزعجة إذا كان تنبيه سرقة
      if (isTheftAlert && carPlate) {
        if (activeTheftAlarms.has(carPlate)) {
          clearTimeout(activeTheftAlarms.get(carPlate));
        }
        console.log('🚨 Starting persistent theft alarm for:', carPlate);
        scheduleTheftRepeat(carPlate, 0);
      }
    })
  );
});

// ─── 5. Notification Click (فتح التطبيق تلقائياً) ──────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const plate = event.notification.data?.carPlate || '';
  
  // 🛑 إيقاف مؤقت التكرار فور ضغط المستخدم على الإشعار
  if (plate) {
    const cleanTarget = cleanPlateForCompare(plate);
    for (const [key, timerId] of activeTheftAlarms.entries()) {
      const cleanKey = cleanPlateForCompare(key);
      if (cleanKey === cleanTarget) {
        clearTimeout(timerId);
        activeTheftAlarms.delete(key);
      }
    }
    
    // إغلاق كل الإشعارات المرئية لنفس السيارة
    self.registration.getNotifications().then((notifications) => {
      notifications.forEach((n) => {
        const notifPlate = cleanPlateForCompare(n.data?.carPlate || '');
        if (notifPlate === cleanTarget) {
          n.close();
        }
      });
    });
  }

  if (event.action === 'dismiss') {
    // "dismiss" في حالة السرقة يعني "فتح للتأكيد" وليس إغلاق فعلي
    if (event.notification.data?.type !== 'theft_breach') return;
  }

  let targetUrl = event.notification.data?.url || '/';
  if (event.notification.data?.type === 'theft_breach' || event.notification.tag?.includes('theft')) {
    targetUrl = `/?breach=true&carPlate=${encodeURIComponent(plate)}`;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            if ('navigate' in client) {
              return client.navigate(targetUrl).then(() => client.focus());
            }
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
  // لا نوقف المؤقت هنا لضمان استمرار الإلحاح حتى تأكيد الأمان الفعلي
});