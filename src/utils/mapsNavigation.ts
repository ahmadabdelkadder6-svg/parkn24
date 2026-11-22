// src/utils/mapsNavigation.ts
import { sendLocalNotification, playNormalAlert, vibrateDevice } from './notifications';

let activeWatchId: number | null = null;
let arrivalTimeoutId: ReturnType<typeof setTimeout> | null = null;

// 🎯 قائمة الكلمات المفتاحية الاستثنائية للمعالم الحيوية
const FAMOUS_LANDMARKS_REGEX = /(مول|mall|مستشف[يى]|hospital|مرور|بواب[ةه]|gate|التجمع|تراخيص)/i;

/**
 * 🗺️ رابط ملاحة هجين وذكي:
 * 1. لو المكان فيه كلمة من المعالم الحيوية (مول، مستشفى، مرور، بوابة، التجمع، تراخيص) -> يدمج الاسم مع الإحداثيات لضبط البوابة والمسار.
 * 2. لو مكان عادي -> يلتزم بالإحداثيات الصافية 100% (GPS) بدون أي نصوص لمنع انحراف المسار.
 */
export const buildGoogleMapsUrl = (
  lat: number,
  lng: number,
  name: string = '',
  location: string = ''
): string => {
  const safeLat = Number(lat);
  const safeLng = Number(lng);

  // حماية من الأرقام غير الصالحة
  if (isNaN(safeLat) || isNaN(safeLng) || safeLat === 0 || safeLng === 0) {
    return 'https://www.google.com/maps';
  }

  const baseUrl = 'https://www.google.com/maps/dir/?api=1';
  const destinationCoords = `&destination=${safeLat},${safeLng}`;
  const travelMode = '&travelmode=driving';

  // 🔍 فحص هل الاسم أو المنطقة يحتوي على أحد المعالم الاستثنائية
  const isFamousLandmark =
    FAMOUS_LANDMARKS_REGEX.test(name || '') ||
    FAMOUS_LANDMARKS_REGEX.test(location || '');

  // 1. إذا كان معلماً شهيراً مستثنى -> استخراج الاسم وتجهيزه لجوجل ماب
  if (isFamousLandmark) {
    const cleanName = (name || '')
      .replace(/ساحة انتظار|جراج ركني|ساحة ركني|جراج|ساحة|موقف|بارك|parking|garage|VIP/gi, '')
      .replace(/[()[\]{}#*?]/g, ' ')
      .trim();

    const cleanLoc = (location || '')
      .replace(/محافظة القاهرة|محافظة الجيزة|القاهرة|الجيزة|مصر/gi, '')
      .replace(/[()[\]{}#*?]/g, ' ')
      .trim();

    const famousPlace = [cleanName, cleanLoc]
      .filter(Boolean)
      .join(' - ')
      .replace(/\s+/g, ' ')
      .trim();

    // لو الاسم المنظف صالح وفيه معلم واضح
    if (famousPlace && famousPlace.length >= 3) {
      const placeLabel = encodeURIComponent(` (${famousPlace})`);
      return `${baseUrl}${destinationCoords}${placeLabel}${travelMode}`;
    }
  }

  // 2. للوضع الافتراضي وأي جراج عادي -> إحداثيات GPS صافية 100% بدون أي إضافات
  return `${baseUrl}${destinationCoords}${travelMode}`;
};

/**
 * 🗺️ فتح خرائط جوجل الخارجية مباشرة (للاستخدام السريع)
 */
export const openGoogleMapsNavigation = (
  lat: number,
  lng: number,
  name: string = '',
  location: string = ''
): void => {
  const url = buildGoogleMapsUrl(lat, lng, name, location);
  window.open(url, '_blank', 'noopener,noreferrer');
};

/**
 * 🗺️ فتح خرائط جوجل الخارجية للملاحة الحية
 * مع تفعيل مراقبة GPS الذكية في الخلفية لتنبيه السائق عند الاقتراب 50 متر من الجراج
 */
export const openMapsWithSmartArrival = (
  garageLat: number,
  garageLng: number,
  garageName: string,
  garageIdOrCallback?: string | (() => void),
  onArrivedCallback?: () => void,
  location?: string
) => {
  let garageId = '';
  let finalCallback = onArrivedCallback;

  if (typeof garageIdOrCallback === 'function') {
    finalCallback = garageIdOrCallback;
  } else if (typeof garageIdOrCallback === 'string') {
    garageId = garageIdOrCallback;
  }

  // 💾 0. حفظ حالة التوجه للجراج في localStorage لضمان بقاء المستخدم في شاشة الجلسة عند فتح الإشعار
  try {
    localStorage.setItem(
      'parkn24_pending_arrival',
      JSON.stringify({
        garageLat,
        garageLng,
        garageName,
        garageId: garageId || '',
        timestamp: Date.now(),
      })
    );
  } catch (e) {
    console.warn('⚠️ تعذر حفظ حالة التوجه للجراج:', e);
  }

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

          if (finalCallback) {
            finalCallback();
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

  // 4. فتح خرائط جوجل الخارجية بالنظام الهجين الذكي
  const googleMapsUrl = buildGoogleMapsUrl(garageLat, garageLng, garageName, location);
  window.open(googleMapsUrl, '_blank', 'noopener,noreferrer');
};

/**
 * 🧹 مسح حالة التوجه عند بدء الركن أو إلغاء الجلسة
 */
export const clearPendingArrival = () => {
  try {
    localStorage.removeItem('parkn24_pending_arrival');
  } catch {}
};

/**
 * 🔍 جلب حالة التوجه الحالية من الـ Storage
 */
export const getPendingArrival = () => {
  try {
    const item = localStorage.getItem('parkn24_pending_arrival');
    if (!item) return null;
    const parsed = JSON.parse(item);
    // صلاحية التوجه 3 ساعات فقط
    if (Date.now() - parsed.timestamp > 3 * 60 * 60 * 1000) {
      clearPendingArrival();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
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