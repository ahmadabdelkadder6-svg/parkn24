// public/sw.js
const CACHE_NAME    = 'parkn24-shield-v25'; 
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json'];
const activeTheftAlarms = new Map();

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.url.includes('supabase.co')) return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then((c) => c || caches.match('/index.html')))
  );
});

// إيقاف الإنذار فوراً عند ضغط العميل على تأكيد الأمان
self.addEventListener('message', (event) => {
  if (event.data?.type === 'STOP_THEFT_ALARM') {
    activeTheftAlarms.forEach((timerId) => clearTimeout(timerId));
    activeTheftAlarms.clear();
    self.registration.getNotifications().then((notifications) => {
      notifications.forEach((n) => {
        if (n.tag && (n.tag.includes('theft') || n.tag.includes('alarm'))) n.close();
      });
    });
  }
});

// تكرار الإنذار كل 8 ثواني على شاشة القفل حتى يفتح العميل
function scheduleTheftRepeat(carPlate, repeatCount = 0) {
  if (repeatCount >= 30) return;
  const timerId = setTimeout(() => {
    if (!activeTheftAlarms.has(carPlate)) return;
    const count = repeatCount + 1;
    self.registration.showNotification(`🚨 إنذار سرقة نشط! (${count}/30)`, {
      body: `🚗 السيارة: ${carPlate} • السيارة في خطر! اضغط لفتح التطبيق وتأمينها!`,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      vibrate: [2000, 300, 2000, 300, 2000, 300, 3000],
      requireInteraction: true,
      tag: `theft-repeat-${carPlate}-${count}`,
      renotify: true,
      data: { url: `/?breach=true&carPlate=${encodeURIComponent(carPlate)}`, type: 'theft_breach', carPlate },
    }).then(() => scheduleTheftRepeat(carPlate, count));
  }, 8000);
  activeTheftAlarms.set(carPlate, timerId);
}

// استقبال إشعار السيرفر وتشغيل السارينة المتكررة
self.addEventListener('push', (event) => {
  let title = '🚨 إنذار سرقة عاجل لمركبتك!';
  let body = '⚠️ تم رصد حركة غير مصرح بها لسيارتك، افتح التطبيق فوراً!';
  let carPlate = '';
  let isTheft = false;

  try {
    if (event.data) {
      const payload = event.data.json();
      title = payload.notification?.title || payload.title || title;
      body = payload.notification?.body || payload.body || body;
      const data = payload.data || payload;
      carPlate = data.carPlate || data.car_plate || '';
      if (data.type === 'theft_breach' || (payload.tag && payload.tag.includes('theft'))) isTheft = true;
    }
  } catch {}

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      vibrate: [2000, 300, 2000, 300, 2000, 300, 3000],
      requireInteraction: true,
      tag: `theft-alarm-${carPlate || Date.now()}`,
      renotify: true,
      data: { url: `/?breach=true&carPlate=${encodeURIComponent(carPlate)}`, type: 'theft_breach', carPlate },
    }).then(() => {
      if (isTheft && carPlate) {
        activeTheftAlarms.set(carPlate, null);
        scheduleTheftRepeat(carPlate, 0);
      }
    })
  );
});

// عند ضغط العميل على الإشعار: يفتح التطبيق مباشرة على شاشة الإنذار الحمراء
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  activeTheftAlarms.forEach((t) => clearTimeout(t));
  activeTheftAlarms.clear();

  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) return client.navigate(targetUrl).then(() => client.focus());
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});