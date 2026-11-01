// src/utils/mapsNavigation.ts
import { sendLocalNotification, playNormalAlert, vibrateDevice } from './notifications';

let activeWatchId: number | null = null;
let arrivalTimeoutId: ReturnType<typeof setTimeout> | null = null;

/**
 * 🗺️ فتح خرائط جوجل الخارجية للملاحة الصوتية الحية
 * مع تفعيل مراقبة GPS الذكية في الخلفية لتنبيه السائق عند الاقتراب 50 متر من الجراج
 */
export const openMapsWithSmartArrival = (
  garageLat: number,
  garageLng: number,
  garageName: string,
  onArrivedCallback?: () => void
) => {
  // 1. إظهار إشعار ثابت للمستخدم يسهل عليه العودة لشاشة الجلسة في أي وقت
  sendLocalNotification(
    `📌 جاري التوجه إلى: ${garageName}`,
    '🚗 اضغط هنا للعودة لشاشة الجلسة وبدء الركن',
    'garage-arrival-reminder',
    '/session'
  );

  // 2. إيقاف أي تتبع سابق
  stopArrivalTracking();

  // 3. بدء مراقبة موقع السيارة بالنسبة للجراج Target
  if ('geolocation' in navigator) {
    activeWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        const distMeters = calculateDistanceMeters(userLat, userLng, garageLat, garageLng);

        // عند الاقتراب لمسافة 50 متر أو أقل من الجراج
        if (distMeters <= 50) {
          playNormalAlert();
          vibrateDevice([500, 200, 500, 200, 800]);
          
          sendLocalNotification(
            '🎉 وصلت الجراج!',
            '🚗 اضغط هنا لبدء الجلسة وتفعيل حماية السيارة فوراً (وصلت للجراج وبدأ الركن)',
            'garage-arrived-auto',
            '/session' // توجيه مباشر لشاشة الجلسة
          );

          if (onArrivedCallback) {
            onArrivedCallback();
          }

          stopArrivalTracking();
        }
      },
      (err) => {
        console.warn('⚠️ تعذر مراقبة GPS أثناء الملاحة الخارجية:', err);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      }
    );

    // إيقاف التتبع تلقائياً بعد 45 دقيقة للحفاظ على البطارية
    arrivalTimeoutId = setTimeout(() => {
      stopArrivalTracking();
    }, 45 * 60 * 1000);
  }

  // 4. فتح خرائط جوجل الخارجية بنمط Driving Navigation Voice
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${garageLat},${garageLng}&travelmode=driving`;
  window.open(googleMapsUrl, '_blank');
};

/**
 * 🛑 إيقاف تتبع الوصول للجراج
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
 * 📐 دالة حساب المسافة بالمتر بين نقطتين جغرافيين (Haversine Formula)
 */
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // نصف قطر الأرض بالمتر
  const dLat = ((lat1 - lat2) * Math.PI) / 180;
  const dLon = ((lon1 - lon2) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}