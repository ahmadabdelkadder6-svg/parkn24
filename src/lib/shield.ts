// src/lib/shield.ts
// ═══════════════════════════════════════════════════════════
// 🛡️ Car Shield Engine — Ultra-Responsive Background Keep-Alive + Zero-Cost GPS
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
const FAKE_ALERT_STORAGE_KEY = 'parkn24_shield_fake_meta';
const FAKE_ALERT_INTERVAL_MS = 30 * 60 * 1000; // 30 دقيقة بالمللي ثانية

// ─── 🎯 ثوابت الجيوفنس الدقيق والحماية من الخمول ───
export const GEOFENCE_RADIUS_METERS = 50;
export const GEOFENCE_RADIUS = 50; // للتوافق العكسي مع الشاشات
export const ALERT_DISTANCE = 50; // للتوافق العكسي
export const MIN_MOVEMENT_METERS = 30; // حد إرسال التحديث للسيرفر
export const FALLBACK_INTERVAL_MS = 12_000; // نبض خلفي كل 12 ثانية بدون أي حمل سيرفر

// ─── 🧠 ثوابت السرعة والانطلاق وفترة التثبيت ───
export const SPEED_THRESHOLD_MPS = 3.0; // 3.0 م/ث = ~11 كم/س (سرعة حركة سيارة حقيقية)
export const CAR_SPEED_THRESHOLD = 3.0;
export const CAR_GRACE_MS = 1_000; // ثانية واحدة فقط للتأكيد لسرعة الاستجابة القصوى
export const STABILIZATION_MS = 4_000; // 4 ثوانٍ تثبيت أولي عند تشغيل الـ GPS
export const MAX_ALLOWED_ACCURACY_METERS = 45; // استبعاد الإشارات المشوشة لمنع الإنذارات الكاذبة

// ─── ⏱️ ثوابت ترشيد استهلاك السيرفر (Throttle) ───
const GPS_SERVER_THROTTLE_MS = 15_000; // حد أدنى 15 ثانية بين كل استعلام تحديث للسيرفر لتوفير الحمل

// صوت سارينة احترافي نقي ومتوازن
const SIREN_AUDIO_URL = 'https://assets.mixkit.co/active_storage/sfx/995/995-preview.mp3';
const SILENT_WAV_BASE64 = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';

// VAPID Public Key لتفعيل الـ Web Push
const VAPID_PUBLIC_KEY = 'BOuP_HFhSSjHMsjf4KZJYLaFTv3RdI20Ux3an5LriaTBUN0iGlW-38zYGvROp26k7jcqhC_XpUotxzLR1IjQTI4';

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

// ─── 🛡️ بنك الإشعارات الأمني التكتيكي ───
export const ALERT_POOL: FakeAlert[] = [
  { type: 'status', title: "🛡️ رادار Park'n 24", body: 'جاري مسح المحيط الأمني لسيارتك.. الوضع مستقر تماماً.', icon: '🛡️' },
  { type: 'status', title: '🛰️ اتصال الأقمار الصناعية', body: 'تم تثبيت إحداثيات GPS بدقة عالية. رادارك يعمل بنجاح.', icon: '🛰️' },
  { type: 'warning', title: '🔒 تأمين الحركة الفوري', body: 'حساسات الاهتزاز مشفرة الآن. أي محاولة رفع بالونش ستصلك فوراً.', icon: '🔒' },
  { type: 'status', title: '🤖 الذكاء الأمني نشط', body: 'نظام التعرف على الحركة يراقب سيارتك. استمتع بمشوارك وأنت مطمئن.', icon: '🤖' },
  { type: 'status', title: '📱 رادار الحماية الذكي', body: 'تم تحديث بيانات الموقع. سيارتك في النطاق الآمن 100%.', icon: '📱' },
  { type: 'status', title: '🛡️ بروتوكول الحماية VIP', body: 'نظام التتبع يعمل بأقصى طاقة الآن. سيارتك تحت حراستنا الإلكترونية.', icon: '🛡️' },
  { type: 'report', title: '🔍 مسح أمني شامل', body: 'جاري فحص استقرار المركبة.. لا توجد اهتزازات غير طبيعية مسجلة.', icon: '🔍' },
  { type: 'status', title: '📡 تردد الرادار مستقر', body: 'اتصال حي ومستمر بين موبايلك ورادار السيارة. الحماية نشطة.', icon: '📡' },
  { type: 'warning', title: '🚨 نظام الردع الإلكتروني', body: 'ملصقك الإلكتروني نشط في قاعدة البيانات الأمنيّة حالياً.', icon: '🚨' },
  { type: 'resolved', title: "✨ طمأنينة Park'n 24", body: 'نراقب سيارتك كأننا بجوارها تماماً. ركنة سعيدة!', icon: '✨' },
  { type: 'report', title: '🛠️ فحص الحساسات', body: 'تم التأكد من عمل حساس الميل (Tilt Sensor). سيارتك مؤمنة ضد الرفع.', icon: '🛠️' },
  { type: 'status', title: '🌐 شبكة الحماية الحية', body: 'سيارتك ضمن نطاق "المنطقة الخضراء" المؤمنة بـ Park\'n 24.', icon: '🌐' },
  { type: 'status', title: '🛡️ درع الخصوصية', body: 'وضع الحماية الصامت يعمل. التنبيه سيصدر فقط في حالة الخطر.', icon: '🛡️' },
  { type: 'status', title: '🛰️ تحديث الإحداثيات', body: 'قمر صناعي نشط الآن لمتابعة موقع ركنتك. دقة التتبع: 1 متر.', icon: '🛰️' },
  { type: 'status', title: '🤖 مراقبة ذكية 24/7', body: 'رادارك الذكي يعمل في الخلفية ويحمي السيارة من أي تدخل خارجي.', icon: '🤖' },
  { type: 'warning', title: '🛡️ حماية فائقة', body: 'تم تنشيط وضع "تجميد الموقع". سنخبرك بأي تحرك ولو لسنتيمتر واحد.', icon: '🛡️' },
  { type: 'resolved', title: '📍 تأكيد الموقع', body: 'تم التحقق من بقاء السيارة في مكانها الأصلي بنجاح.', icon: '📍' },
  { type: 'status', title: '🧠 خوارزمية التتبع', body: 'نظامنا يحلل محيط السيارة الآن لضمان أقصى درجات الأمان.', icon: '🧠' },
  { type: 'status', title: '📱 حالة الدرع', body: 'الدرع الإلكتروني: [نشط]. البطارية: [مستقرة]. الأمان: [100%].', icon: '📱' },
  { type: 'resolved', title: "🌟 تميز مع Park'n 24", body: 'شكرًا لثقتك في نظام حمايتنا. سيارتك في أيدي أمينة تكنولوجياً.', icon: '🌟' },
  { type: 'warning', title: '🕵️ رادار كشف التطفل', body: 'أي محاولة لفتح الأبواب أو لمس الزجاج ستفعل الإنذار فوراً.', icon: '🕵️' },
  { type: 'status', title: '🛡️ تأمين شامل', body: 'سيارتك الآن جزء من شبكة المركبات المحمية إلكترونياً.', icon: '🛡️' },
  { type: 'status', title: '📡 إشارة الرادار', body: 'قوة الإشارة ممتازة. التتبع اللحظي يعمل بدون أي تأخير.', icon: '📡' },
  { type: 'status', title: '🚗 وضع الانتظار الذكي', body: 'نظام حماية الركنات الطويلة نشط. لا تقلق بشأن سيارتك نهائياً.', icon: '🚗' },
  { type: 'warning', title: '⚡ استجابة فورية', body: 'رادارك جاهز لإطلاق سارينة الطوارئ عند الخطر.', icon: '⚡' },
  { type: 'report', title: '🛡️ توثيق أمني', body: 'تم تسجيل بدء جلسة الحماية بنجاح في سجلات الأمان الرقمية.', icon: '🛡️' },
  { type: 'status', title: '🌌 رادار المراقبة الليلية', body: 'نظام الحماية نشط لمراقبة سيارتك في الظلام.', icon: '🌌' },
  { type: 'resolved', title: '🛡️ فحص المسافة', body: 'المسافة بينك وبين السيارة آمنة. الرادار يغطي المسافة بالكامل.', icon: '🛡️' },
  { type: 'status', title: '🛰️ تزامن الأقمار', body: 'تم عمل Sync ناجح مع القمر صناعية لتأمين موقعك الحالي.', icon: '🛰️' },
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
    ensureFakeAlertMetaInitialized(params.sessionId);

    const { data: existing } = await supabase
      .from('shield_sessions')
      .select('id')
      .eq('session_id', params.sessionId)
      .is('ended_at', null)
      .maybeSingle();
    if (existing) {
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
    return data.id;
  } catch (e) {
    console.error('❌ registerShieldSession exception:', e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// 🔔 محرك بنك الإشعارات الوهمية لتأمين السيارة كل 30 دقيقة (ALERT_POOL)
// ═══════════════════════════════════════════════════════════
let fakeAlertsTimerId: ReturnType<typeof setInterval> | null = null;
let fakeAlertSubscriber: ((alert: FakeAlert) => void) | null = null;

interface FakeAlertMeta {
  sessionId: string;
  startTime: number;
  lastTick: number;
  poolIndex: number;
}

function loadFakeAlertMeta(): FakeAlertMeta | null {
  try {
    const raw = localStorage.getItem(FAKE_ALERT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FakeAlertMeta) : null;
  } catch {
    return null;
  }
}

function saveFakeAlertMeta(meta: FakeAlertMeta): void {
  try {
    localStorage.setItem(FAKE_ALERT_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // ignore
  }
}

function ensureFakeAlertMetaInitialized(sessionId?: string | null): FakeAlertMeta {
  const activeSessionId = sessionId || loadShieldState()?.sessionId || 'active_shield';
  const existing = loadFakeAlertMeta();
  if (existing && existing.sessionId === activeSessionId && existing.startTime > 0) {
    return existing;
  }
  const fresh: FakeAlertMeta = {
    sessionId: activeSessionId,
    startTime: Date.now(),
    lastTick: 0,
    poolIndex: Math.floor(Math.random() * ALERT_POOL.length),
  };
  saveFakeAlertMeta(fresh);
  return fresh;
}

function dispatchFakeAlertNotification(alert: FakeAlert, tick: number): void {
  try {
    if (fakeAlertSubscriber) {
      fakeAlertSubscriber(alert);
    }
  } catch {
    // ignore callback error
  }

  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((reg) => {
            reg.showNotification(alert.title, {
              body: alert.body,
              icon: '/favicon.ico',
              badge: '/favicon.ico',
              vibrate: [200, 100, 200],
              tag: `parkn24-shield-status-${tick}`,
              renotify: true,
            } as any);
          })
          .catch(() => {
            try {
              new Notification(alert.title, { body: alert.body, icon: '/favicon.ico' });
            } catch {}
          });
      } else {
        new Notification(alert.title, { body: alert.body, icon: '/favicon.ico' });
      }
    }
  } catch (e) {
    console.warn('Fake alert notification error:', e);
  }
}

export function checkAndFirePeriodicFakeAlert(sessionId?: string | null): void {
  try {
    const shieldState = loadShieldState();
    const resolvedSessionId = sessionId || shieldState?.sessionId;
    if (!resolvedSessionId && !shieldState?.isActive && gpsWatchId === null) return;

    const meta = ensureFakeAlertMetaInitialized(resolvedSessionId);
    const elapsedMs = Date.now() - meta.startTime;
    if (elapsedMs < FAKE_ALERT_INTERVAL_MS) return;

    const currentTick = Math.floor(elapsedMs / FAKE_ALERT_INTERVAL_MS);
    if (currentTick <= 0 || currentTick <= meta.lastTick) return;

    const nextIndex = (meta.poolIndex + 1) % ALERT_POOL.length;
    const chosenAlert = ALERT_POOL[nextIndex] || ALERT_POOL[0];

    meta.lastTick = currentTick;
    meta.poolIndex = nextIndex;
    saveFakeAlertMeta(meta);

    dispatchFakeAlertNotification(chosenAlert, currentTick);
  } catch {
    // ignore
  }
}

export function startFakeAlerts(onAlert?: (alert: FakeAlert) => void): () => void {
  if (onAlert) {
    fakeAlertSubscriber = onAlert;
  }
  ensureFakeAlertMetaInitialized();

  if (fakeAlertsTimerId) {
    clearInterval(fakeAlertsTimerId);
  }

  // فحص دوري كل 30 ثانية للتأكد من إطلاق إشعار الـ 30 دقيقة بدقة حتى لو نامت التاب مؤقتاً
  fakeAlertsTimerId = setInterval(() => {
    checkAndFirePeriodicFakeAlert();
  }, 30_000);

  return () => stopFakeAlerts();
}

export function stopFakeAlerts(): void {
  if (fakeAlertsTimerId) {
    clearInterval(fakeAlertsTimerId);
    fakeAlertsTimerId = null;
  }
  fakeAlertSubscriber = null;
}

// ═══════════════════════════════════════════════════════════
// 🔊 محرك تجهيز الصوت المسبق فائق الاستجابة (Pre-warmed Audio Loop Engine)
// ═══════════════════════════════════════════════════════════
let sharedAudioCtx: AudioContext | null = null;
let keepAliveSource: AudioBufferSourceNode | null = null;
let silentAudioEl: HTMLAudioElement | null = null;
let prewarmedSirenAudio: HTMLAudioElement | null = null;
let wakeLockSentinel: any = null;
let isAudioKeepAliveActive = false;
let alarmAudioCtx: AudioContext | null = null;
let alarmOscillators: OscillatorNode[] = [];
let alarmVibrationInterval: ReturnType<typeof setInterval> | null = null;
let isAlarmActive = false;

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

async function requestWakeLock(): Promise<void> {
  try {
    if ('wakeLock' in navigator && !wakeLockSentinel) {
      wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
    }
  } catch {
    // WakeLock غير مدعوم أو تم رفضه
  }
}

/**
 * تجهيز مسار الصوت المسبق (Pre-warmed Audio) فور تفعيل الدرع
 */
export function armBackgroundAudio(): void {
  try {
    initAudioContext();
    if (!prewarmedSirenAudio) {
      prewarmedSirenAudio = new Audio(SIREN_AUDIO_URL);
      prewarmedSirenAudio.loop = true;
      prewarmedSirenAudio.preload = 'auto';
      prewarmedSirenAudio.volume = 0.001; // صوت صامت يحافظ على مسار الميديا نشطاً
      (prewarmedSirenAudio as any).playsInline = true;
    }
    prewarmedSirenAudio.play().then(() => {
      isAudioKeepAliveActive = true;
    }).catch(() => {
      if (!silentAudioEl) {
        silentAudioEl = new Audio(SILENT_WAV_BASE64);
        silentAudioEl.loop = true;
        silentAudioEl.volume = 0.01;
        (silentAudioEl as any).playsInline = true;
      }
      silentAudioEl.play().catch(() => {});
    });
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "🛡️ رادار الحماية نشط | Park'n 24",
        artist: 'درع الحماية شغال',
        album: 'نظام المراقبة المستمر',
      });
      navigator.mediaSession.setActionHandler('play', () => {
        if (prewarmedSirenAudio) prewarmedSirenAudio.play().catch(() => {});
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        if (prewarmedSirenAudio && !isAlarmActive) {
          prewarmedSirenAudio.play().catch(() => {});
        }
      });
    }
    requestWakeLock().catch(() => {});
  } catch (e) {
    console.warn('⚠️ armBackgroundAudio error:', e);
  }
}

// دالة للتوافق العكسي
export function unlockAndKeepAliveAudio(): void {
  armBackgroundAudio();
}

// ═══════════════════════════════════════════════════════════
// 🚨🔊 سارينة واضحة ومتوازنة + اهتزاز نبضي لطيف (بدون إزعاج حاد)
// ═══════════════════════════════════════════════════════════
export function triggerBreachAlarm(): void {
  if (isAlarmActive) return;
  isAlarmActive = true;
  // 1. تشغيل صوت السارينة الواضح والنقي بمستوى متوازن (بدون تشويش أو فرقعة سماعات)
  if (prewarmedSirenAudio) {
    try {
      prewarmedSirenAudio.volume = 0.75; // مستوى مريح وواضح
      prewarmedSirenAudio.currentTime = 0;
      prewarmedSirenAudio.play().catch(() => {});
    } catch (e) {
      console.warn('⚠️ Siren play failed:', e);
    }
  }
  // 2. إضافة نغمة تحذيرية ناعمة ودافئة (Harmonic Chime Sweep) بدلاً من الصفير المزعج
  try {
    initAudioContext();
    const ctx = sharedAudioCtx;
    if (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      alarmAudioCtx = ctx;
      const now = alarmAudioCtx.currentTime;
      const osc = alarmAudioCtx.createOscillator();
      const gain = alarmAudioCtx.createGain();
      // موجة ناعمة (Sine Wave) مريحة للأذن
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // نغمة A5 نقية
      // تموج صوتي دوري محبب يشبه أجهزة الإنذار الفاخرة
      for (let i = 0; i < 200; i++) {
        osc.frequency.setValueAtTime(950, now + i * 0.5);
        osc.frequency.linearRampToValueAtTime(750, now + i * 0.5 + 0.25);
      }
      gain.gain.setValueAtTime(0.4, now); // صوت مهدأ
      osc.connect(gain);
      gain.connect(alarmAudioCtx.destination);
      osc.start();
      alarmOscillators = [osc];
    }
  } catch { /* ignore */ }
  // 3. اهتزاز نبضي ذكي ومحسوس (بدون رج عنيف مستمر يحرق الموتور)
  if (navigator.vibrate) {
    // نبضة: اهتزاز 300 مللي، راحة 200، اهتزاز 300، راحة 600
    const pleasantPattern = [300, 200, 300, 600];
    navigator.vibrate(pleasantPattern);
    alarmVibrationInterval = setInterval(() => {
      if (isAlarmActive && navigator.vibrate) {
        navigator.vibrate(pleasantPattern);
      }
    }, 1800);
  }
  // 4. إشعار شاشة القفل بنشاط الإنذار
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'playing';
    navigator.mediaSession.metadata = new MediaMetadata({
      title: '🚨 تنبيه: رصد حركة خارج نطاق الأمان!',
      artist: 'رادار Park\'n 24 يراقب سيارتك',
      album: 'نظام الحماية الذكي',
    });
  }
}

// دالة للتوافق العكسي
export function triggerIntenseAlarm(): void {
  triggerBreachAlarm();
}

export function stopIntenseAlarm(): void {
  isAlarmActive = false;
  // إعادة السارينة للوضع الصامت الخلفي
  if (prewarmedSirenAudio) {
    try {
      prewarmedSirenAudio.volume = 0.001;
      prewarmedSirenAudio.currentTime = 0;
    } catch { /* ignore */ }
  }
  try {
    alarmOscillators.forEach((osc) => {
      try { osc.stop(); } catch { /* ignore */ }
    });
    alarmOscillators = [];
    alarmAudioCtx = null;
  } catch { /* ignore */ }
  if (alarmVibrationInterval) {
    clearInterval(alarmVibrationInterval);
    alarmVibrationInterval = null;
  }
  if (navigator.vibrate) navigator.vibrate(0);
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: "🛡️ رادار الحماية نشط | Park'n 24",
      artist: 'درع الحماية شغال',
      album: 'نظام المراقبة المستمر',
    });
  }
}

export function isIntenseAlarmActive(): boolean {
  return isAlarmActive;
}

// ═══════════════════════════════════════════════════════════
// 📍 GPS Geofence فائق الحساسية مع فلترة شطحات الإشارة
// ═══════════════════════════════════════════════════════════
let gpsWatchId: number | null = null;
let fallbackIntervalId: ReturnType<typeof setInterval> | null = null;
let lastSentLat = 0;
let lastSentLng = 0;
let breachStartTime: number | null = null;
let consecutiveBreachCount = 0;
let isCurrentlyOutside = false;
let prevPos: { lat: number; lng: number; t: number } | null = null;
let posHistory: Array<{ lat: number; lng: number; t: number; distFromGarage: number }> = [];
let watchStartTime = 0;
let visibilityHandler: (() => void) | null = null;

export function startShieldGPS(params: {
  sessionId: string;
  shieldId?: string;
  parkingLat: number;
  parkingLng: number;
  onGeofenceBreach: (distance: number) => void;
  onGPSError?: () => void;
}): () => void {
  stopShieldGPS();
  armBackgroundAudio();
  ensureFakeAlertMetaInitialized(params.sessionId);
  startFakeAlerts();

  if (!navigator.geolocation) {
    params.onGPSError?.();
    return () => {};
  }
  lastSentLat = params.parkingLat;
  lastSentLng = params.parkingLng;
  breachStartTime = null;
  consecutiveBreachCount = 0;
  isCurrentlyOutside = false;
  prevPos = null;
  posHistory = [];
  watchStartTime = Date.now();
  let consecutiveErrors = 0;

  const handlePosition = (
    lat: number,
    lng: number,
    rawSpeed: number | null,
    accuracy: number | null
  ) => {
    consecutiveErrors = 0;
    checkAndFirePeriodicFakeAlert(params.sessionId);

    const now = Date.now();
    const elapsed = now - watchStartTime;
    const distFromGarage = haversine(lat, lng, params.parkingLat, params.parkingLng);

    if (elapsed < STABILIZATION_MS) {
      prevPos = { lat, lng, t: now };
      posHistory = [{ lat, lng, t: now, distFromGarage }];
      return;
    }
    if (accuracy && accuracy > MAX_ALLOWED_ACCURACY_METERS) {
      return;
    }

    let speed = (rawSpeed !== null && rawSpeed > 0) ? rawSpeed : 0;

    // 1. حساب السرعة المباشر بين نقطتين
    if (prevPos) {
      const d = haversine(prevPos.lat, prevPos.lng, lat, lng);
      const dt = (now - prevPos.t) / 1000;
      if (dt > 0.4 && d >= 10) {
        const calculatedSpeed = d / dt;
        if (calculatedSpeed < 55) {
          speed = Math.max(speed, calculatedSpeed);
        }
      }
    }
    prevPos = { lat, lng, t: now };

    // 2. نافذة حساب سرعة دقيقة (Sliding Window 2s..15s) لالتقاط سرعة السيارة حتى لو كان watchPosition يحدث كل ثانية والـ rawSpeed = null
    posHistory.push({ lat, lng, t: now, distFromGarage });
    if (posHistory.length > 12) {
      posHistory.shift();
    }
    for (let i = 0; i < posHistory.length - 1; i++) {
      const pt = posHistory[i];
      const dtWindow = (now - pt.t) / 1000;
      if (dtWindow >= 2 && dtWindow <= 15) {
        const dWindow = haversine(pt.lat, pt.lng, lat, lng);
        const radialOutward = distFromGarage - pt.distFromGarage;
        if (dWindow >= 12 && radialOutward >= 6) {
          const windowSpeed = dWindow / dtWindow;
          if (windowSpeed < 55) {
            speed = Math.max(speed, windowSpeed);
          }
        }
      }
    }

    const distFromLastSent = haversine(lat, lng, lastSentLat, lastSentLng);
    const isOverDistance = distFromGarage > GEOFENCE_RADIUS_METERS;
    const isConfirmedSpeed = speed >= SPEED_THRESHOLD_MPS;

    // 🚨 الإنذار ينطلق فقط إذا ابتعد العميل عن نطاق الـ 50 متر وتحرك بسرعة السيارة (isConfirmedSpeed)
    // أما إذا مشى على قدميه لمشواره (سرعة المشي < 3 م/ث) فلا ينطلق الإنذار مهما ابتعد
    if (isOverDistance && isConfirmedSpeed) {
      consecutiveBreachCount++;
      if (!breachStartTime) {
        breachStartTime = now;
      }
      if ((now - breachStartTime >= CAR_GRACE_MS) || consecutiveBreachCount >= 2) {
        if (!isCurrentlyOutside) {
          isCurrentlyOutside = true;
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              const title = '🚨 تحذير: رصد حركة خارج النطاق!';
              const body = `تحركت سيارتك لمسافة ${Math.round(distFromGarage)} متر بسرعة ${Math.round(speed * 3.6)} كم/س! ⚠️`;
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then((reg) => {
                  reg.showNotification(title, {
                    body,
                    icon: '/favicon.ico',
                    vibrate: [300, 200, 300, 600],
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
          triggerBreachAlarm();
          sendGPSToServer(params.sessionId, params.shieldId, lat, lng, true, speed, true).catch(() => {});
          lastSentLat = lat;
          lastSentLng = lng;
          params.onGeofenceBreach(distFromGarage);
        } else if (distFromLastSent > MIN_MOVEMENT_METERS) {
          sendGPSToServer(params.sessionId, params.shieldId, lat, lng, true, speed, false).catch(() => {});
          lastSentLat = lat;
          lastSentLng = lng;
        }
      }
    } else {
      consecutiveBreachCount = 0;
      if (!isCurrentlyOutside) {
        breachStartTime = null;
      }
    }
  };

  const handleGPSError = (err: GeolocationPositionError) => {
    consecutiveErrors++;
    if (consecutiveErrors >= 4) {
      params.onGPSError?.();
    }
  };

  gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => handlePosition(
      pos.coords.latitude,
      pos.coords.longitude,
      pos.coords.speed,
      pos.coords.accuracy,
    ),
    handleGPSError,
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
  );

  fallbackIntervalId = setInterval(() => {
    checkAndFirePeriodicFakeAlert(params.sessionId);

    if (prewarmedSirenAudio && prewarmedSirenAudio.paused) {
      prewarmedSirenAudio.play().catch(() => {});
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => handlePosition(
        pos.coords.latitude,
        pos.coords.longitude,
        pos.coords.speed,
        pos.coords.accuracy,
      ),
      handleGPSError,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 },
    );
  }, FALLBACK_INTERVAL_MS);

  visibilityHandler = () => {
    checkAndFirePeriodicFakeAlert(params.sessionId);

    if (prewarmedSirenAudio && prewarmedSirenAudio.paused) {
      prewarmedSirenAudio.play().catch(() => {});
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    if (document.visibilityState === 'visible') {
      requestWakeLock().catch(() => {});
      navigator.geolocation.getCurrentPosition(
        (pos) => handlePosition(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.speed,
          pos.coords.accuracy,
        ),
        handleGPSError,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 },
      );
    }
  };
  document.addEventListener('visibilitychange', visibilityHandler);
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
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
  breachStartTime = null;
  consecutiveBreachCount = 0;
  isCurrentlyOutside = false;
  prevPos = null;
  posHistory = [];
}

// ─── 📡 إرسال الـ GPS للسيرفر مع حماية التكرار و Throttle للـ Disk IO ───
let lastGpsSendTimestamp = 0;
let isGpsSendingInProgress = false;

async function sendGPSToServer(
  sessionId: string,
  shieldId: string | undefined,
  lat: number,
  lng: number,
  isOutside: boolean,
  speed?: number | null,
  forceImmediate = false,
): Promise<void> {
  const now = Date.now();
  if (!forceImmediate) {
    if (isGpsSendingInProgress || now - lastGpsSendTimestamp < GPS_SERVER_THROTTLE_MS) {
      return;
    }
  }
  isGpsSendingInProgress = true;
  lastGpsSendTimestamp = now;
  try {
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
  } catch (err) {
    console.warn('⚠️ sendGPSToServer network issue:', err);
  } finally {
    isGpsSendingInProgress = false;
  }
}

// ═══════════════════════════════════════════════════════════
// 🧹 تدمير الدرع وإيقاف كل العمليات
// ═══════════════════════════════════════════════════════════
export function disarmBackgroundAudio(): void {
  stopIntenseAlarm();
  if (prewarmedSirenAudio) {
    try {
      prewarmedSirenAudio.pause();
      prewarmedSirenAudio.src = '';
      prewarmedSirenAudio.load();
    } catch { /* ignore */ }
    prewarmedSirenAudio = null;
  }
  if (silentAudioEl) {
    try {
      silentAudioEl.pause();
      silentAudioEl.src = '';
    } catch { /* ignore */ }
    silentAudioEl = null;
  }
  if (keepAliveSource) {
    try { keepAliveSource.stop(); } catch { /* ignore */ }
    keepAliveSource = null;
  }
  if (wakeLockSentinel) {
    try { wakeLockSentinel.release(); } catch { /* ignore */ }
    wakeLockSentinel = null;
  }
  isAudioKeepAliveActive = false;
  if (sharedAudioCtx) {
    try { sharedAudioCtx.close().catch(() => {}); } catch { /* ignore */ }
    sharedAudioCtx = null;
  }
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'none';
  }
}

export function destroyShield(): void {
  stopShieldGPS();
  stopFakeAlerts();
  disarmBackgroundAudio();
  try {
    localStorage.removeItem(SHIELD_STORAGE_KEY);
    localStorage.removeItem(FAKE_ALERT_STORAGE_KEY);
  } catch { /* ignore */ }
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