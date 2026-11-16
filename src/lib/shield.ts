// src/lib/shield.ts
// ═══════════════════════════════════════════════════════════
// 🛡️ Car Shield Engine — Local-First + Server Cron Web Push
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
export const GEOFENCE_RADIUS = 250;
export const ALERT_DISTANCE = 250;
export const MIN_MOVEMENT_METERS = 80;
export const FALLBACK_INTERVAL_MS = 300_000;

// ─── 🧠 ثوابت السرعة والإنذار ───
// 2.0 م/ث = ~7.2 كم/س (أسرع من مشي العادي وقريب من سرعة الجري / حركة سيارة بطيئة)
export const CAR_SPEED_THRESHOLD = 2.0; 
export const CAR_GRACE_MS = 5_000; // 5 ثواني سماح قبل الانطلاق

// VAPID Public Key لتفعيل الـ Web Push
const VAPID_PUBLIC_KEY = 'BOuP_HFhSSjHMsjf4KZJYLaFTv3RdI20Ux3an5LriaTBUN0iGlW-38zYGvROp26k7jcqhC_XpUotxzLR1IjQTI4';

// تحويل مفتاح VAPID من Base64 إلى Uint8Array متوافق مع PushManager
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ─── بنك الإشعارات ───
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

// ─── Haversine لحساب المسافة بالـ الأمتار ───
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
// 📍 التحقق من إن العميل جوه الجراج
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
  // السرعة >= 2.0 م/ث (أسرع من مشي وقريب للجري / عربية بطيئة)
  if (speedMs !== null && speedMs >= CAR_SPEED_THRESHOLD) {
    return CAR_GRACE_MS;
  }
  return Infinity; // لو مشي بطيء جداً مش هيضرب الإنذار
}

// ═══════════════════════════════════════════════════════════
// 📝 تسجيل الدرع في السيرفر + إذن Web Push
// ═══════════════════════════════════════════════════════════
export async function registerShieldSession(params: {
  sessionId: string;
  phone: string;
  garageId: string;
  parkingLat: number;
  parkingLng: number;
}): Promise<string | null> {
  try {
    const { data: existing } = await supabase
      .from('shield_sessions')
      .select('id')
      .eq('session_id', params.sessionId)
      .is('ended_at', null)
      .maybeSingle();

    if (existing) {
      console.log('🛡️ Shield already registered:', existing.id);
      return existing.id;
    }

    let ep: string | null = null;
    let p256: string | null = null;
    let auth: string | null = null;

    try {
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }

      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();

        if (!sub) {
          try {
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });
            console.log('✅ Push subscription created successfully!');
          } catch (e) {
            console.warn('⚠️ Push subscribe failed:', e);
          }
        }

        if (sub) {
          const j = sub.toJSON();
          ep = j.endpoint || null;
          p256 = j.keys?.p256dh || null;
          auth = j.keys?.auth || null;
        }
      }
    } catch (err) {
      console.warn('ℹ️ Push notification setup skipped:', err);
    }

    const { data, error } = await supabase
      .from('shield_sessions')
      .insert({
        session_id: params.sessionId,
        phone: params.phone,
        garage_id: params.garageId,
        parking_lat: params.parkingLat,
        parking_lng: params.parkingLng,
        push_endpoint: ep,
        push_p256dh: p256,
        push_auth: auth,
        alert_count: 0,
        fake_tick: 0,
      })
      .select('id')
      .single();

    if (error) {
      console.error('❌ registerShieldSession error:', error);
      return null;
    }

    console.log('✅ Shield registered in DB:', data.id);
    return data.id;
  } catch (e) {
    console.error('❌ registerShieldSession exception:', e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// 🔔 الإشعارات الوهمية بتيجي من السيرفر (shield-cron) بس
// ═══════════════════════════════════════════════════════════
export function startFakeAlerts(): void {
  // الـ Cron شغال على السيرفر كل 5-30 دقيقة وبيبعت Web Push للموبايل
}

export function stopFakeAlerts(): void {
  // متوافقة مع الكود القديم
}

// ═══════════════════════════════════════════════════════════
// 📍 GPS Geofence الذكي
// ═══════════════════════════════════════════════════════════
let gpsWatchId: number | null = null;
let fallbackIntervalId: ReturnType<typeof setInterval> | null = null;
let lastSentLat = 0;
let lastSentLng = 0;
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
      if (dt > 1) speed = Math.max(speed, d / dt);
    }
    prevPos = { lat, lng, t: now };

    const distFromGarage = haversine(lat, lng, params.parkingLat, params.parkingLng);
    const distFromLastSent = haversine(lat, lng, lastSentLat, lastSentLng);

    // لو خرجت أبعد من 250 متر
    if (distFromGarage > ALERT_DISTANCE) {
      const gracePeriod = getGracePeriod(speed);

      if (gracePeriod !== Infinity) {
        if (!breachStartTime) {
          breachStartTime = now;
          console.log(`🚨 بداية خروج: ${Math.round(distFromGarage)}م @ ${Math.round(speed * 3.6)} كم/س`);
        }

        // بعد مرور 5 ثواني من الحركة أسرع من الجري / حركة سيارة بطيئة (≥ 7.2 كم/س)
        if (now - breachStartTime >= gracePeriod) {
          if (!isCurrentlyOutside) {
            isCurrentlyOutside = true;
            sendGPSToServer(params.sessionId, params.shieldId, lat, lng, true, speed).catch(() => {});
            lastSentLat = lat;
            lastSentLng = lng;
            params.onGeofenceBreach(distFromGarage);
          } else if (distFromLastSent > MIN_MOVEMENT_METERS) {
            sendGPSToServer(params.sessionId, params.shieldId, lat, lng, true, speed).catch(() => {});
            lastSentLat = lat;
            lastSentLng = lng;
          }
        }
      } else {
        if (breachStartTime) breachStartTime = null;
      }
    } else {
      if (!isCurrentlyOutside) {
        breachStartTime = null;
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
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
  );

  fallbackIntervalId = setInterval(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => handlePosition(
        pos.coords.latitude,
        pos.coords.longitude,
        pos.coords.speed,
      ),
      handleGPSError,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
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
    }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════
// 🔊 AudioContext المشترك
// ═══════════════════════════════════════════════════════════
let sharedAudioCtx: AudioContext | null = null;

export function initAudioContext(): void {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;

    if (!sharedAudioCtx) {
      sharedAudioCtx = new Ctx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
  } catch (e) {
    console.warn('AudioContext init failed:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// 🚨🔊 نظام الإنذار الشديد والعالي جداً
// ═══════════════════════════════════════════════════════════
let alarmAudioCtx: AudioContext | null = null;
let alarmOscillators: OscillatorNode[] = [];
let alarmVibrationInterval: ReturnType<typeof setInterval> | null = null;
let isAlarmActive = false;

export function triggerIntenseAlarm(): void {
  if (isAlarmActive) return;
  isAlarmActive = true;

  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (Ctx) {
      const ctx = sharedAudioCtx || new Ctx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      if (!sharedAudioCtx) sharedAudioCtx = ctx;
      alarmAudioCtx = ctx;

      const now = alarmAudioCtx.currentTime;

      // أسرع وأعلى سرينة طوارئ عالية جداً
      const osc1 = alarmAudioCtx.createOscillator();
      const gain1 = alarmAudioCtx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(1400, now);
      gain1.gain.setValueAtTime(1.0, now);
      osc1.connect(gain1);
      gain1.connect(alarmAudioCtx.destination);
      osc1.start();
      
      for (let i = 0; i < 600; i++) {
        osc1.frequency.setValueAtTime(1500, now + i * 0.4);
        osc1.frequency.linearRampToValueAtTime(700, now + i * 0.4 + 0.2);
      }

      const osc2 = alarmAudioCtx.createOscillator();
      const gain2 = alarmAudioCtx.createGain();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(2800, now);
      gain2.gain.setValueAtTime(0.8, now);
      osc2.connect(gain2);
      gain2.connect(alarmAudioCtx.destination);
      osc2.start();

      const osc3 = alarmAudioCtx.createOscillator();
      const gain3 = alarmAudioCtx.createGain();
      osc3.type = 'sawtooth';
      osc3.frequency.setValueAtTime(500, now);
      gain3.gain.setValueAtTime(1.0, now);
      osc3.connect(gain3);
      gain3.connect(alarmAudioCtx.destination);
      osc3.start();

      alarmOscillators = [osc1, osc2, osc3];
    }
  } catch (e) {
    console.warn('🔇 Alarm audio failed:', e);
  }

  if (navigator.vibrate) {
    const pattern = [1000, 100, 1000, 100, 1000, 100, 1000];
    navigator.vibrate(pattern);
    alarmVibrationInterval = setInterval(() => {
      if (isAlarmActive) navigator.vibrate(pattern);
    }, 2000);
  }
}

export function stopIntenseAlarm(): void {
  isAlarmActive = false;

  try {
    alarmOscillators.forEach((osc) => {
      try { osc.stop(); } catch { /* */ }
    });
    alarmOscillators = [];
    if (alarmAudioCtx) {
      if (alarmAudioCtx !== sharedAudioCtx) {
        alarmAudioCtx.close().catch(() => {});
      }
      alarmAudioCtx = null;
    }
  } catch { /* */ }

  if (alarmVibrationInterval) {
    clearInterval(alarmVibrationInterval);
    alarmVibrationInterval = null;
  }
  if (navigator.vibrate) navigator.vibrate(0);
}

export function isIntenseAlarmActive(): boolean {
  return isAlarmActive;
}

// ═══════════════════════════════════════════════════════════
// 🧹 تدمير الدرع
// ═══════════════════════════════════════════════════════════
export function destroyShield(): void {
  stopShieldGPS();
  stopIntenseAlarm();
  stopFakeAlerts();

  if (sharedAudioCtx) {
    try { sharedAudioCtx.close().catch(() => {}); } catch { /* */ }
    sharedAudioCtx = null;
  }

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

export { ALERT_POOL };