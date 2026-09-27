// src/utils/distanceTracker.ts

/**
 * 📏 متتبع المسافة الحقيقية بين العميل والسيارة
 * - يظهر فقط بعد تفعيل الدرع
 * - يطلب إذن الموقع تلقائياً
 * - جنب العربية = 0 متر
 * - يتحدث كل 3 ثوانٍ
 */

export interface DistanceReading {
  meters: number;
  displayText: string;
  proximity: 'next-to' | 'nearby' | 'walking' | 'far' | 'out-of-range';
  timestamp: number;
}

// ═══════════════════════════════════════════════════════
// دالة هافرسين
// ═══════════════════════════════════════════════════════
const haversine = (
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ═══════════════════════════════════════════════════════
// 1️⃣ طلب إذن الموقع من المستخدم
// ═══════════════════════════════════════════════════════
export const requestLocationPermission = async (): Promise<boolean> => {
  try {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return false;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),   // المستخدم وافق
        () => resolve(false),  // المستخدم رفض
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  } catch {
    return false;
  }
};

// ═══════════════════════════════════════════════════════
// 2️⃣ الحصول على موقع العميل الحالي
// ═══════════════════════════════════════════════════════
export const getCurrentLocation = (): Promise<{ lat: number; lng: number } | null> => {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
};

// ═══════════════════════════════════════════════════════
// 3️⃣ حساب المسافة الحقيقية وتصنيفها
// ═══════════════════════════════════════════════════════
export const calculateRealDistance = (
  clientLat: number,
  clientLng: number,
  carLat: number,
  carLng: number
): DistanceReading => {
  const rawMeters = haversine(clientLat, clientLng, carLat, carLng);

  // تصحيح: لو أقل من 2 متر = جنب العربية = 0
  const meters = rawMeters < 2 ? 0 : Math.round(rawMeters);

  let proximity: DistanceReading['proximity'];
  let displayText: string;

  if (meters === 0) {
    proximity = 'next-to';
    displayText = '🚗 جنب العربية';
  } else if (meters <= 15) {
    proximity = 'nearby';
    displayText = `${meters}م 🚶`;
  } else if (meters <= 100) {
    proximity = 'walking';
    displayText = `${meters}م 🚶‍♂️`;
  } else if (meters <= 250) {
    proximity = 'far';
    displayText = `${meters}م 📍`;
  } else {
    proximity = 'out-of-range';
    displayText = `${meters}م ⚠️ خارج النطاق`;
  }

  return {
    meters,
    displayText,
    proximity,
    timestamp: Date.now(),
  };
};

// ═══════════════════════════════════════════════════════
// 4️⃣ Hook جاهز للربط بالشاشة (يحدث كل 3 ثوانٍ)
// ═══════════════════════════════════════════════════════
export const startDistanceTracking = (
  carLat: number,
  carLng: number,
  onUpdate: (reading: DistanceReading) => void,
  intervalMs: number = 3000
): (() => void) => {
  let intervalId: any = null;

  const tick = async () => {
    const location = await getCurrentLocation();
    if (!location) return;

    const reading = calculateRealDistance(
      location.lat, location.lng,
      carLat, carLng
    );

    onUpdate(reading);
  };

  // أول قراءة فورية
  tick();

  // ثم كل 3 ثوانٍ
  intervalId = setInterval(tick, intervalMs);

  // إرجاع دالة الإيقاف
  return () => {
    if (intervalId) clearInterval(intervalId);
  };
};