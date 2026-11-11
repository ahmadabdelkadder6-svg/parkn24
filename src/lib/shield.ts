// src/lib/shield.ts
// ═══════════════════════════════════════════════════════════
// 🛡️ Car Shield Engine — Local-First
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
  shieldId?: string | null;
}

// ─── ثوابت ───
export const SHIELD_COST = 7;
export const SHIELD_STORAGE_KEY = 'parkn24_shield';
export const GEOFENCE_RADIUS = 250;          // ✅ للتفعيل: العميل يقدر يفعّل الدرع على بعد 250م
export const ALERT_DISTANCE = 200;           // ✅ للإنذار: الإنذار يطلع لما السيارة تخرج برة 200م
export const MIN_MOVEMENT_METERS = 80;
export const FALLBACK_INTERVAL_MS = 300_000;

// ─── 🧠 ثوابت السرعة الذكية ───
export const CAR_SPEED_THRESHOLD = 0.8;     // 0.8 م/ث ≈ 3 كم/س (سيارة بطيئة)
export const CAR_GRACE_MS = 2_000;          // 2 ثانية بس

// ─── بنك الإشعارات الوهمية ───
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
// 📍 التحقق من إن العميل جوه الجراج (للتفعيل)
// يستخدم GEOFENCE_RADIUS = 250م
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
// 🧠 حساب الـ Grace Period
// ═══════════════════════════════════════════════════════════
function getGracePeriod(speedMs: number | null): number {
  if (speedMs !== null && speedMs >= CAR_SPEED_THRESHOLD) {
    return CAR_GRACE_MS;
  }
  return Infinity;
}

// ═══════════════════════════════════════════════════════════
// 📍 GPS Geofence الذكي (للإنذار)
// يستخدم ALERT_DISTANCE = 200م
// ═══════════════════════════════════════════════════════════
let gpsWatchId: number | null = null;
let fallbackIntervalId: ReturnType<typeof setInterval> | null = null;
let lastSentLat = 0;
let lastSentLng = 0;
let lastSentAt = 0;
let breachStartTime: number | null = null;
let isCurrentlyOutside = false;
let prevPos: { lat: number; lng: number; t: number } | null = null;

export function startShieldGPS(params: {
  sessionId: string;
  shieldId?: string;
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
  prevPos = null;
  let consecutiveErrors = 0;

  const handlePosition = (lat: number, lng: number, rawSpeed: number | null) => {
    consecutiveErrors = 0;
    const now = Date.now();

    let speed = (rawSpeed && rawSpeed > 0) ? rawSpeed : 0;
    if (prevPos) {
      const d = haversine(prevPos.lat, prevPos.lng, lat, lng);
      const dt = (now - prevPos.t) / 1000;
      if (dt > 2) speed = Math.max(speed, d / dt);
    }
    prevPos = { lat, lng, t: now };

    const distFromGarage = haversine(lat, lng, params.parkingLat, params.parkingLng);
    const distFromLastSent = haversine(lat, lng, lastSentLat, lastSentLng);

    // ✅ ALERT_DISTANCE = 200م للإنذار (مش GEOFENCE_RADIUS)
    if (distFromGarage > ALERT_DISTANCE) {
      const gracePeriod = getGracePeriod(speed);

      if (gracePeriod !== Infinity) {
        // 🚗 سيارة — نبدأ العد
        if (!breachStartTime) {
          breachStartTime = now;
          console.log(`🚨 بداية خروج: ${Math.round(distFromGarage)}م @ ${Math.round(speed * 3.6)} كم/س`);
        }

        if (now - breachStartTime >= gracePeriod) {
          if (!isCurrentlyOutside) {
            isCurrentlyOutside = true;
            sendGPSToServer(params.sessionId, params.shieldId, lat, lng, true, speed).catch(() => {});
            lastSentLat = lat;
            lastSentLng = lng;
            lastSentAt = now;
            params.onGeofenceBreach(distFromGarage);
          } else if (distFromLastSent > MIN_MOVEMENT_METERS) {
            sendGPSToServer(params.sessionId, params.shieldId, lat, lng, true, speed).catch(() => {});
            lastSentLat = lat;
            lastSentLng = lng;
            lastSentAt = now;
          }
        }
      } else {
        // 🚶 مشي — صفّر العدّاد
        if (breachStartTime) {
          breachStartTime = null;
        }
      }
    } else {
      // جوه 200م — صفّر العدّاد بس لو الإنذار لسه ما طلعش
      if (!isCurrentlyOutside) {
        breachStartTime = null;
      }
      // ⚠️ لو الإنذار شغال (isCurrentlyOutside = true)، مش نعمل حاجة
      // الإنذار بيقف بس لما المستخدم يدوس الزر
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
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
  );

  fallbackIntervalId = setInterval(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => handlePosition(
        pos.coords.latitude,
        pos.coords.longitude,
        pos.coords.speed,
      ),
      handleGPSError,
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 },
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
  prevPos = null;
}

// ─── إرسال GPS للسيرفر ───
async function sendGPSToServer(
  sessionId: string,
  shieldId: string | undefined,
  lat: number,
  lng: number,
  isOutside: boolean,
  speed?: number | null,
): Promise<void> {
  const speedMs = (speed !== undefined && speed !== null && speed >= 0) ? speed : 0;
  const speedKmh = Math.round(speedMs * 3.6);

  await supabase
    .from('shield_sessions')
    .update({
      last_lat: lat,
      last_lng: lng,
      last_gps_at: new Date().toISOString(),
      client_outside: isOutside,
      last_speed: speedKmh,
    })
    .eq('session_id', sessionId)
    .is('ended_at', null);

  if (shieldId) {
    await supabase.from('shield_locations').insert({
      shield_id: shieldId,
      lat,
      lng,
      speed_kmh: speedKmh,
    });
  }
}

// ═══════════════════════════════════════════════════════════
// 🧹 تدمير الدرع
// ═══════════════════════════════════════════════════════════
export function destroyShield(): void {
  stopShieldGPS();
  try { localStorage.removeItem(SHIELD_STORAGE_KEY); } catch { /* */ }
}

// ═══════════════════════════════════════════════════════════
// 💾 حفظ/تحميل حالة الدرع
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
// 🔧 Exports قديمة
// ═══════════════════════════════════════════════════════════
export function startFakeAlerts(): void { /* moved to server cron */ }
export function stopFakeAlerts(): void { /* moved to server cron */ }
export { ALERT_POOL };