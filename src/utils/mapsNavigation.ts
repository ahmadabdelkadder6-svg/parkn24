// src/utils/mapsNavigation.ts

import { sendLocalNotification, playNormalAlert, vibrateDevice } from './notifications';

let activeWatchId: number | null = null;
let arrivalTimeoutId: ReturnType<typeof setTimeout> | null = null;

/**
 * 🗺️ فتح خرائط جوجل مع تفعيل نظام التذكير الذكي ومراقبة الوصول (50 متر)
 */
export const openMapsWithSmartArrival = (
  garageLat: number,
  garageLng: number,
  garageName: string,
  onArrivedCallback?: () => void
) => {
  // 1️⃣ إظهار إشعار ثابت فوراً في شريط الإشعارات يسهّل الرجوع بزرار واحد
  sendLocalNotification(
    `📌 جاري التوجه إلى: ${garageName}`,
    '🚗 اضغط هنا لبدء الجلسة فوراً عند الوصول',
    'garage-arrival-reminder',
    '/'
  );

  // إيقاف أي متابعة سابقة لو كانت شغال
  stopArrivalTracking();

  // 2️⃣ بدء تتبع موقع العميل في الخلفية للبدء بالتنبيه العالي فور الوصول (50 متر)
  if ('geolocation' in navigator) {
    activeWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;

        // حساب المسافة بالمتر بين العميل والجراج
        const distMeters = calculateDistanceMeters(userLat, userLng, garageLat, garageLng);

        // 🎯 أول ما المسافة تقل عن 50 متر من باب الجراج
        if (distMeters <= 50) {
          // أ) تشغيل نغمة واهتزاز عالي
          playNormalAlert();
          vibrateDevice([500, 200, 500, 200, 800]);

          // ب) إرسال إشعار الوصول العاجل
          sendLocalNotification(
            '🎉 وصلت الجراج!',
            '🚗 اضغط هنا لبدء الجلسة وتفعيل حماية السيارة فوراً',
            'garage-arrived-auto',
            '/'
          );

          // ج) تنفي المباشر لو التطبيق كان مفتوح
          if (onArrivedCallback) {
            onArrivedCallback();
          }

          // د) إيقاف التتبع فوراً لتوفير البطارية
          stopArrivalTracking();
        }
      },
      (err) => console.warn('⚠️ خطأ في تتبع الوصول للجراج:', err),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      }
    );

    // 🔋 إيقاف التتبع تلقائياً بعد 45 دقيقة تجنباً لاستنزاف البطارية لو العميل كنسل المشوار
    arrivalTimeoutId = setTimeout(() => {
      stopArrivalTracking();
    }, 45 * 60 * 1000);
  }

  // 3️⃣ فتح خرائط جوجل للتوجيه الصوتي الكامل
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${garageLat},${garageLng}&travelmode=driving`;
  window.open(googleMapsUrl, '_blank');
};

/**
 * دالة إيقاف التتبع الذكي
 */
export const stopArrivalTracking = () => {
  if (activeWatchId !== null && 'geolocation' in navigator) {
    navigator.geolocation.clearWatch(activeWatchId);
    activeWatchId = null;
  }
  if (arrivalTimeoutId) {
    clearTimeout(arrivalTimeoutId);
    arrivalTimeoutId = null;
  }
};

/**
 * 📐 دالة حساب المسافة بالمتر بين نقطتين (Haversine Formula)
 */
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // نصف قطر الأرض بالمتر
  const dLat = (lat1 - lat2) * (Math.PI / 180);
  const dLon = (lon1 - lon2) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}