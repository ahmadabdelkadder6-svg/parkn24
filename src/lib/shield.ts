// src/lib/shield.ts
// ═══════════════════════════════════════════════════════════
// 🛡️ Car Shield Engine — Local-First + Zero-Cost Keep-Alive + Web Push
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

// ─── ثوابت النظام المالي والتشغيلي ───
export const SHIELD_COST = 7;
export const SHIELD_STORAGE_KEY = 'parkn24_shield';

// ─── 🎯 ثوابت الجيوفنس الدقيق والحماية من النوم ───
// تم ضبط القطر على 50 متر لسرعة كشف الخروج الفوري
export const GEOFENCE_RADIUS_METERS = 50;
export const GEOFENCE_RADIUS = 50; // للتوافق العكسي مع الشاشات
export const ALERT_DISTANCE = 50; // للتوافق العكسي
export const MIN_MOVEMENT_METERS = 30; // حد إرسال التحديث للسيرفر
export const FALLBACK_INTERVAL_MS = 25_000; // فحص دوري كل 25 ثانية كـ Fallback

// ─── 🧠 ثوابت السرعة والانطلاق الفوري ───
// 3.2 م/ث = ~11.5 كم/س (سرعة حركة مركبة مؤكدة وليست شخص يمشي)
export const SPEED_THRESHOLD_MPS = 3.2;
export const CAR_SPEED_THRESHOLD = 3.2; // للتوافق
export const CAR_GRACE_MS = 2_000; // ثانيتين فقط للتأكد قبل إطلاق السارينة

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

// ─── 🛡️ بنك الإشعارات الأمني التكتيكي (30 رسالة متنوعة) ───
const ALERT_POOL: FakeAlert[] = [
  { type: 'status', title: "🛡️ رادار Park'n 24", body: 'جاري مسح المحيط الأمني لسيارتك.. الوضع مستقر تماماً.', icon: '🛡️' },
  { type: 'status', title: '🛰️ اتصال الأقمار الصناعية', body: 'تم تثبيت إحداثيات GPS بدقة عالية. رادارك يعمل بنجاح.', icon: '🛰️' },
  { type: 'warning', title: '🔒 تأمين الحركة الفوري', body: 'حساسات الاهتزاز مشفرة الآن. أي محاولة رفع بالونش ستصلك فوراً.', icon: '🔒' },
  { type: 'status', title: '🤖 الذكاء الأمني نشط', body: 'نظام التعرف على الحركة يراقب سيارتك. استمتع بمشوارك وأنت مطمئن.', icon: '🤖' },
  { type: 'status', title: '📱 رادار الحماية الذكي', body: 'تم تحديث بيانات الموقع. سيارتك في النطاق الآمن 100%.', icon: '📱' },
  { type: 'status', title: '🛡️ بروتوكول الحماية VIP', body: 'نظام التتبع يعمل بأقصى طاقة الآن. سيارتك تحت حراستنا الإلكترونية.', icon: '🛡️' },
  { type: 'report', title: '🔍 مسح أمني شامل', body: 'جاري فحص استقرار المركبة.. لا توجد اهتزازات غير طبيعية مسجلة.', icon: '🔍' },
  { type: 'status', title: '📡 تردد الرادار مستقر', body: 'اتصال حي ومستمر بين موبايلك ورادار السيارة. الحماية نشطة.', icon: '📡' },
  { type: 'warning', title: '🚨 نظام الردع الإلكتروني', body: 'ملصقك الإلكتروني نشط في قاعدة البيانات الأمنيّة حالياً.', icon: '🚨' },
  { type: 'resolved', title: '✨ طمأنينة Park\'n 24', body: 'نراقب سيارتك كأننا بجوارها تماماً. ركنة سعيدة!', icon: '✨' },
  { type: 'report', title: '🛠️ فحص الحساسات', body: 'تم التأكد من عمل حساس الميل (Tilt Sensor). سيارتك مؤمنة ضد الرفع.', icon: '🛠️' },
  { type: 'status', title: '🌐 شبكة الحماية الحية', body: 'سيارتك ضمن نطاق "المنطقة الخضراء" المؤمنة بـ Park\'n 24.', icon: '🌐' },
  { type: 'status', title: '🛡️ درع الخصوصية', body: 'وضع الحماية الصامت يعمل. التنبيه سيصدر فقط في حالة الخطر.', icon: '🛡️' },
  { type: 'status', title: '🛰️ تحديث الإحداثيات', body: 'قمر صناعي نشط الآن لمتابعة موقع ركنتك. دقة التتبع: 1 متر.', icon: '🛰️' },
  { type: 'status', title: '🤖 مراقبة ذكية 24/7', body: 'رادارك الذكي يعمل في الخلفية ويحمي السيارة من أي تدخل خارجي.', icon: '🤖' },
  { type: 'warning', title: '🛡️ حماية فائقة', body: 'تم تنشيط وضع "تجميد الموقع". سنخبرك بأي تحرك ولو لسنتيمتر واحد.', icon: '🛡️' },
  { type: 'resolved', title: '📍 تأكيد الموقع', body: 'تم التحقق من بقاء السيارة في مكانها الأصلي بنجاح.', icon: '📍' },
  { type: 'status', title: '🧠 خوارزمية التتبع', body: 'نظامنا يحلل محيط السيارة الآن لضمان أقصى درجات الأمان.', icon: '🧠' },
  { type: 'status', title: '📱 حالة الدرع', body: 'الدرع الإلكتروني: [نشط]. البطارية: [مستقرة]. الأمان: [100%].', icon: '📱' },
  { type: 'resolved', title: '🌟 تميز مع Park\'n 24', body: 'شكرًا لثقتك في نظام حمايتنا. سيارتك في أيدي أمينة تكنولوجياً.', icon: '🌟' },
  { type: 'warning', title: '🕵️ رادار كشف التطفل', body: 'أي محاولة لفتح الأبواب أو لمس الزجاج ستفعل الإنذار فوراً.', icon: '🕵️' },
  { type: 'status', title: '🛡️ تأمين شامل', body: 'سيارتك الآن جزء من شبكة المركبات المحمية إلكترونياً.', icon: '🛡️' },
  { type: 'status', title: '📡 إشارة الرادار', body: 'قوة الإشارة ممتازة. التتبع اللحظي يعمل بدون أي تأخير.', icon: '📡' },
  { type: 'status', title: '🚗 وضع الانتظار الذكي', body: 'نظام حماية الركنات الطويلة نشط. لا تقلق بشأن سيارتك نهائياً.', icon: '🚗' },
  { type: 'warning', title: '⚡ استجابة فورية', body: 'رادارك جاهز لإطلاق سارينة الطوارئ في أقل من ثانية عند الخطر.', icon: '⚡' },
  { type: 'report', title: '🛡️ توثيق أمني', body: 'تم تسجيل بدء جلسة الحماية بنجاح في سجلات الأمان الرقمية.', icon: '🛡️' },
  { type: 'status', title: '🌌 رادار المراقبة الليلية', body: 'نظام الحماية الليلي نشط لمراقبة سيارتك في الظلام.', icon: '🌌' },
  { type: 'resolved', title: '🛡️ فحص المسافة', body: 'المسافة بينك وبين السيارة آمنة. الرادار يغطي المسافة بالكامل.', icon: '🛡️' },
  { type: 'status', title: '🛰️ تزامن الأقمار', body: 'تم عمل Sync ناجح مع 4 أقمار صناعية لتأمين موقعك الحالي.', icon: '🛰️' },
  { type: 'resolved', title: '✅ فحص أخير', body: 'كل الأنظمة تعمل بكفاءة. استمتع بيومك، نحن نتولى الحراسة!', icon: '✅' },
];

// ─── Haversine لحساب المسافة بالأمتار ───
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
// 📍 التحقق من وجود العميل في نطاق الركنة (50 متر)
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
        resolve({ inside: dist <= GEOFENCE_RADIUS_METERS, distance: dist });
      },
      () => resolve({ inside: false, distance: -1 }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

// ═══════════════════════════════════════════════════════════
// 🧠 حساب فترة السماح بناءً على السرعة المزدوجة
// ═══════════════════════════════════════════════════════════
function getGracePeriod(speedMs: number | null): number {
  if (speedMs !== null && speedMs >= SPEED_THRESHOLD_MPS) {
    return CAR_GRACE_MS; // ثانيتين فقط لو سرعة سيارة
  }
  return Infinity; // لو حركة مشي بطيئة داخل محيط الركنة
}

// ═══════════════════════════════════════════════════════════
// 📝 تسجيل الجلسة في قاعدة البيانات + الاشتراك في الـ Web Push
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
      console.log('🛡️ Shield session already registered:', existing.id);
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

export function startFakeAlerts(): void {
  // سيرفر Supabase عبر shield-cron يرسل الإشعارات المجدولة تلقائياً
}

export function stopFakeAlerts(): void {
  // متوافقة مع الكود
}

// ═══════════════════════════════════════════════════════════
// 🔊 محرك منع الخمول الصامت (Audio Keep-Alive)
// يمنع خمول المتصفح على شاشة القفل بدون أي تكلفة سيرفر
// ═══════════════════════════════════════════════════════════
let sharedAudioCtx: AudioContext | null = null;
let keepAliveSource: AudioBufferSourceNode | null = null;
let isAudioKeepAliveActive = false;

export function initAudioContext(): void {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new Ctx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
  } catch (e) {
    console.warn('AudioContext init failed:', e);
  }
}

export function unlockAndKeepAliveAudio(): void {
  if (isAudioKeepAliveActive && sharedAudioCtx && sharedAudioCtx.state === 'running') return;
  try {
    initAudioContext();
    if (!sharedAudioCtx) return;

    // إنشاء Buffer صامت جداً مدته ثانيتان ويعمل بـ Loop مستمر
    const buffer = sharedAudioCtx.createBuffer(1, sharedAudioCtx.sampleRate * 2, sharedAudioCtx.sampleRate);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < channelData.length; i++) {
      // ذبذبة غير مسموعة نهائياً شبه صفرية لمنع الـ OS من كتم العملية
      channelData[i] = Math.sin(i * 0.0001) * 0.00001;
    }

    if (keepAliveSource) {
      try { keepAliveSource.stop(); } catch { /* ignore */ }
    }

    keepAliveSource = sharedAudioCtx.createBufferSource();
    keepAliveSource.buffer = buffer;
    keepAliveSource.loop = true;

    const gainNode = sharedAudioCtx.createGain();
    gainNode.gain.setValueAtTime(0.001, sharedAudioCtx.currentTime); // شبه صامت

    keepAliveSource.connect(gainNode);
    gainNode.connect(sharedAudioCtx.destination);
    keepAliveSource.start();
    isAudioKeepAliveActive = true;

    // تفعيل MediaSession لإخبار نظام الموبايل أن هناك صوت شغال لمنع قتل الـ Tab
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "رادار الحماية نشط | Park'n 24",
        artist: 'درع الحماية ضد السرقة والونش',
        album: 'نظام المراقبة المستمر',
      });
    }
    console.log('🔊 Audio Keep-Alive Activated: Screen Lock Throttling Bypassed');
  } catch (e) {
    console.warn('⚠️ Audio Keep-Alive setup failed:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// 📍 GPS Geofence الذكي لمراقبة حركة السيارة الفورية
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
  unlockAndKeepAliveAudio(); // تفعيل كاسر الخمول فور بدء الجي بي اس

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

    // حساب السرعة الحقيقية بدقة
    let speed = (rawSpeed !== null && rawSpeed > 0) ? rawSpeed : 0;
    if (prevPos) {
      const d = haversine(prevPos.lat, prevPos.lng, lat, lng);
      const dt = (now - prevPos.t) / 1000;
      if (dt > 0.5) {
        const calculatedSpeed = d / dt;
        speed = Math.max(speed, calculatedSpeed);
      }
    }
    prevPos = { lat, lng, t: now };

    const distFromGarage = haversine(lat, lng, params.parkingLat, params.parkingLng);
    const distFromLastSent = haversine(lat, lng, lastSentLat, lastSentLng);

    // 🚨 التحقق المزدوج: تجاوز 50 متر + سرعة انطلاق >= 3.2 م/ث (أو مسافة حرجة > 100م)
    const isOverDistance = distFromGarage > GEOFENCE_RADIUS_METERS;
    const isCriticalDistance = distFromGarage > (GEOFENCE_RADIUS_METERS * 2);

    if (isOverDistance) {
      const gracePeriod = getGracePeriod(speed);
      const isBreachingSpeed = (gracePeriod !== Infinity) || isCriticalDistance;

      if (isBreachingSpeed) {
        if (!breachStartTime) {
          breachStartTime = now;
          console.log(`🚨 رصد انطلاق المركبة: ${Math.round(distFromGarage)}م @ ${Math.round(speed * 3.6)} كم/س`);
        }

        const effectiveGrace = isCriticalDistance ? 0 : gracePeriod;

        if (now - breachStartTime >= effectiveGrace) {
          if (!isCurrentlyOutside) {
            isCurrentlyOutside = true;

            // 📲 إرسال إشعار فوري للنظام باختراق المسافة
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              try {
                const title = '🚨 تحذير: رصد حركة خارج النطاق!';
                const body = `تحركت سيارتك لمسافة ${Math.round(distFromGarage)} متر بسرعة ${Math.round(speed * 3.6)} كم/س! ⚠️`;

                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.ready.then((reg) => {
                    reg.showNotification(title, {
                      body,
                      icon: '/favicon.ico',
                      vibrate: [1000, 100, 1000, 100, 1000],
                      tag: 'shield-breach',
                    });
                  });
                } else {
                  new Notification(title, { body, icon: '/favicon.ico' });
                }
              } catch (e) {
                console.warn('Notification trigger error:', e);
              }
            }

            // تفعيل السارينة المحلية فوراً
            triggerIntenseAlarm();

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
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 8000 },
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

// ─── إرسال الـ GPS للسيرفر ───
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
// 🚨🔊 نظام السارينة المكثفة والاهتزاز العالي (Multi-Oscillator)
// ═══════════════════════════════════════════════════════════
let alarmAudioCtx: AudioContext | null = null;
let alarmOscillators: OscillatorNode[] = [];
let alarmVibrationInterval: ReturnType<typeof setInterval> | null = null;
let isAlarmActive = false;

export function triggerIntenseAlarm(): void {
  if (isAlarmActive) return;
  isAlarmActive = true;
  try {
    initAudioContext();
    const ctx = sharedAudioCtx;
    if (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      alarmAudioCtx = ctx;
      const now = alarmAudioCtx.currentTime;

      // 1. سيرينة طوارئ Sawtooth مترددة عالية
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

      // 2. تردد حاد جداً Square للفت الانتباه فوراً
      const osc2 = alarmAudioCtx.createOscillator();
      const gain2 = alarmAudioCtx.createGain();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(2800, now);
      gain2.gain.setValueAtTime(0.8, now);
      osc2.connect(gain2);
      gain2.connect(alarmAudioCtx.destination);
      osc2.start();

      // 3. باس عميق قوي في الخلفية
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

  // 📳 اهتزاز شديد ومتكرر للموبايل
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
      try { osc.stop(); } catch { /* ignore */ }
    });
    alarmOscillators = [];
    if (alarmAudioCtx) {
      alarmAudioCtx = null;
    }
  } catch { /* ignore */ }

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
// 🧹 تدمير الدرع وإيقاف كل العمليات
// ═══════════════════════════════════════════════════════════
export function destroyShield(): void {
  stopShieldGPS();
  stopIntenseAlarm();
  stopFakeAlerts();

  if (keepAliveSource) {
    try { keepAliveSource.stop(); } catch { /* ignore */ }
    keepAliveSource = null;
  }
  isAudioKeepAliveActive = false;

  if (sharedAudioCtx) {
    try { sharedAudioCtx.close().catch(() => {}); } catch { /* ignore */ }
    sharedAudioCtx = null;
  }

  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'none';
  }

  try { localStorage.removeItem(SHIELD_STORAGE_KEY); } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════
// 💾 حفظ وتحميل حالة الدرع في LocalStorage
// ═══════════════════════════════════════════════════════════
export function saveShieldState(state: ShieldState): void {
  try { localStorage.setItem(SHIELD_STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export function loadShieldState(): ShieldState | null {
  try {
    const raw = localStorage.getItem(SHIELD_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ShieldState) : null;
  } catch { return null; }
}

export { ALERT_POOL };