// ═══════════════════════════════════════════════════════════
// 🛡️ Car Shield Engine — Local-First (الموبايل يفكر لوحده)
// الفلسفة: الحساب كله على الموبايل، السيرفر يتكلم بس وقت الحاجة
// ═══════════════════════════════════════════════════════════

import { supabase } from './supabase';

export type AlertType = 'warning' | 'resolved' | 'status' | 'report' | 'qrScan';

export interface FakeAlert {
  type: AlertType;
  title: string;
  body: string;
  icon: string;
}

export interface ShieldState {
  isActive: boolean;
  shieldCode: string | null;
  phone: string | null;
  garageId: string | null;
  parkingLat: number | null;
  parkingLng: number | null;
  sessionId: string | null;
}

// ─── ثوابت ───
export const SHIELD_COST = 7;
export const SHIELD_STORAGE_KEY = 'parkn24_shield';
export const GEOFENCE_RADIUS = 250;
export const MIN_MOVEMENT_METERS = 80;
export const FALLBACK_INTERVAL_MS = 300_000;

// ─── 🧠 ثوابت السرعة الذكية ───
export const CAR_SPEED_THRESHOLD = 5;       // 5 m/s = 18 كم/س
export const CAR_GRACE_MS = 30_000;         // سيارة: 30 ثانية → تنبيه

// ─── بنك الإشعارات الوهمية (تمويه) ───
const ALERT_POOL: FakeAlert[] = [
  { type: 'warning', title: '⚠️ تنبيه حركة', body: 'تم رصد حركة قريبة من مكان الركن', icon: '⚠️' },
  { type: 'warning', title: '⚠️ تنبيه حركة', body: 'حركة غير مألوفة حول السيارة', icon: '⚠️' },
  { type: 'warning', title: '⚠️ تنبيه حركة', body: 'اهتزاز خفيف في السيارة', icon: '⚠️' },
  { type: 'resolved', title: '✅ تم الحل', body: 'الحركة طبيعية — كلو تمام', icon: '✅' },
  { type: 'resolved', title: '✅ تم الحل', body: 'كان شخص بيمر جنب مكان الركن', icon: '✅' },
  { type: 'resolved', title: '✅ تم الحل', body: 'تنبيه عادي — العربية سليمة', icon: '✅' },
  { type: 'resolved', title: '✅ تم الحل', body: 'حركة عادية في المكان', icon: '✅' },
  { type: 'resolved', title: '✅ تم الحل', body: 'قط كان فوق الكابوت 😺', icon: '✅' },
  { type: 'status', title: '🛡️ الحماية نشطة', body: 'السيارة تحت المراقبة', icon: '🛡️' },
  { type: 'status', title: '🛡️ الحماية نشطة', body: 'كل الحساسات شغالة', icon: '🛡️' },
  { type: 'status', title: '🔋 حالة النظام', body: 'البطارية مستقرة — المراقبة تعمل بكفاءة', icon: '🔋' },
  { type: 'status', title: '📡 الاتصال', body: 'متصل بخادم المراقبة', icon: '📡' },
  { type: 'status', title: '🛡️ تحديث', body: 'تم تحديث بروتوكول المراقبة', icon: '🛡️' },
  { type: 'status', title: '🌡️ الحرارة', body: 'درجة حرارة المحرك طبيعية', icon: '🌡️' },
  { type: 'status', title: '🔒 الحالة', body: 'حالة السيارة مستقرة', icon: '🔒' },
  { type: 'status', title: '📍 الموقع', body: 'السيارة في مكانها', icon: '📍' },
  { type: 'report', title: '📋 تقرير', body: 'لا توجد ملاحظات خلال الفترة الماضية', icon: '📋' },
  { type: 'report', title: '📋 تقرير', body: 'تم تسجيل 0 ملاحظات غير طبيعية', icon: '📋' },
  { type: 'qrScan', title: '📱 تحقق', body: 'تم التحقق من كود السيارة', icon: '📱' },
  { type: 'qrScan', title: '📱 تحقق', body: 'تم التحقق من مكان الركن', icon: '📱' },
];

// ─── Haversine ───
export function haversine(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ═══════════════════════════════════════════════════════════
// 📍 التحقق من إن العميل جوه الجراج (قبل التفعيل)
// ═══════════════════════════════════════════════════════════
export async function checkUserInsideGarage(
  garageLat: number,
  garageLng: number,
): Promise<{ inside: boolean; distance: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ inside: false, distance: -1 });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = haversine(
          pos.coords.latitude, pos.coords.longitude,
          garageLat, garageLng,
        );
        resolve({ inside: dist <= GEOFENCE_RADIUS, distance: dist });
      },
      () => resolve({ inside: false, distance: -1 }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

// ═══════════════════════════════════════════════════════════
// 🧠 حساب الـ Grace Period بناءً على السرعة
// ═══════════════════════════════════════════════════════════
function getGracePeriod(speedMs: number | null): number {
  // 🚗 سيارة فقط (≥ 18 كم/س) → تنبيه بعد 30 ثانية
  if (speedMs !== null && speedMs >= CAR_SPEED_THRESHOLD) {
    return CAR_GRACE_MS;
  }
  // أي حاجة تانية (مشي، جري، سرعة مجهولة) → مفيش تنبيه
  return Infinity;
}

// ═══════════════════════════════════════════════════════════
// 📍 GPS Geofence الذكي — مع تمييز السرعة + مراقبة الـ GPS
// ═══════════════════════════════════════════════════════════
let gpsWatchId: number | null = null;
let fallbackIntervalId: ReturnType<typeof setInterval> | null = null;
let lastSentLat = 0;
let lastSentLng = 0;
let lastSentAt = 0;
let breachStartTime: number | null = null;
let isCurrentlyOutside = false;

export function startShieldGPS(params: {
  sessionId: string;
  parkingLat: number;
  parkingLng: number;
  onGeofenceBreach: (distance: number) => void;
  onGPSError?: () => void;
}): () => void {
  stopShieldGPS();
  if (!navigator.geolocation) {
    params.onGPSError?.();
    return () => {};
  }

  lastSentLat = params.parkingLat;
  lastSentLng = params.parkingLng;
  lastSentAt = 0;
  breachStartTime = null;
  isCurrentlyOutside = false;
  let consecutiveErrors = 0;

  const handlePosition = (lat: number, lng: number, speed: number | null) => {
    consecutiveErrors = 0;
    const distFromGarage = haversine(lat, lng, params.parkingLat, params.parkingLng);
    const distFromLastSent = haversine(lat, lng, lastSentLat, lastSentLng);
    const now = Date.now();

    if (distFromGarage > GEOFENCE_RADIUS) {
      if (!breachStartTime) {
        breachStartTime = now;
      }

      const gracePeriod = getGracePeriod(speed);

      if (now - breachStartTime >= gracePeriod) {
        if (!isCurrentlyOutside) {
          isCurrentlyOutside = true;
          sendGPSToServer(params.sessionId, lat, lng, true, speed);
          lastSentLat = lat;
          lastSentLng = lng;
          lastSentAt = now;
          params.onGeofenceBreach(distFromGarage);
        } else if (distFromLastSent > MIN_MOVEMENT_METERS) {
          sendGPSToServer(params.sessionId, lat, lng, true, speed);
          lastSentLat = lat;
          lastSentLng = lng;
          lastSentAt = now;
        }
      }
    } else {
      breachStartTime = null;

      if (isCurrentlyOutside) {
        isCurrentlyOutside = false;
        sendGPSToServer(params.sessionId, lat, lng, false, speed);
        lastSentLat = lat;
        lastSentLng = lng;
        lastSentAt = now;
      }
    }
  };

  const handleGPSError = (err: GeolocationPositionError) => {
    consecutiveErrors++;
    console.warn(`Shield GPS error (${consecutiveErrors}):`, err.message);
    if (consecutiveErrors >= 3) {
      params.onGPSError?.();
    }
  };

  gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => handlePosition(
      pos.coords.latitude,
      pos.coords.longitude,
      pos.coords.speed,
    ),
    handleGPSError,
    { enableHighAccuracy: false, maximumAge: 25000, timeout: 30000 },
  );

  fallbackIntervalId = setInterval(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => handlePosition(
        pos.coords.latitude,
        pos.coords.longitude,
        pos.coords.speed,
      ),
      handleGPSError,
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 20000 },
    );
  }, FALLBACK_INTERVAL_MS);

  return () => stopShieldGPS();
}

export function stopShieldGPS(): void {
  if (gpsWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
  if (fallbackIntervalId !== null) {
    clearInterval(fallbackIntervalId);
    fallbackIntervalId = null;
  }
  breachStartTime = null;
  isCurrentlyOutside = false;
}

// ─── إرسال GPS للسيرفر (بيبعث السرعة + is_outside_fence) ───
function sendGPSToServer(
  sessionId: string,
  lat: number,
  lng: number,
  isOutside: boolean,
  speed: number | null,
): void {
  supabase
    .from('shield_sessions')
    .update({
      last_lat: lat,
      last_lng: lng,
      last_gps_at: new Date().toISOString(),
      is_outside_fence: isOutside,
      last_speed: speed,
    })
    .eq('session_id', sessionId)
    .is('ended_at', null)
    .then(() => {})
    .catch(() => {});
}

// ═══════════════════════════════════════════════════════════
// 🧹 تدمير الدرع بالكامل
// ═══════════════════════════════════════════════════════════
export function destroyShield(): void {
  stopShieldGPS();
  try { localStorage.removeItem(SHIELD_STORAGE_KEY); } catch { /* */ }
}

// ═══════════════════════════════════════════════════════════
// 💾 حفظ/تحميل حالة الدرع (localStorage)
// ═══════════════════════════════════════════════════════════
export function saveShieldState(state: ShieldState): void {
  try { localStorage.setItem(SHIELD_STORAGE_KEY, JSON.stringify(state)); } catch { /* */ }
}

export function loadShieldState(): ShieldState | null {
  try {
    const raw = localStorage.getItem(SHIELD_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ShieldState) : null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════
// 🔧 Exports قديمة (deprecated)
// ═══════════════════════════════════════════════════════════
export function startFakeAlerts(): void { /* moved to server cron */ }
export function stopFakeAlerts(): void { /* moved to server cron */ }
export { ALERT_POOL };