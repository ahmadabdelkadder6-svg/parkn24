const CACHE_NAME = 'parknow-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// التثبيت
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 تم تخزين الملفات');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// التفعيل
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
    })
  );
  self.clients.claim();
});

// استراتيجية Network First مع Fallback للكاش
self.addEventListener('fetch', (event) => {
  // تجاهل الطلبات غير GET
  if (event.request.method !== 'GET') return;

  // تجاهل طلبات chrome-extension
  if (event.request.url.startsWith('chrome-extension')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // لو النت شغال، خزن النسخة الجديدة
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // لو النت مش شغال، جيب من الكاش
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // لو مش موجود في الكاش، رجع الصفحة الرئيسية
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});