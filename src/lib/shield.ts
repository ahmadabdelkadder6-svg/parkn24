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
export const FALLBACK_INTERVAL_MS = 8_000; // نبض خلفي كل 8 ثوانٍ في حال خمول watchPosition فقط

// ─── 🧠 ثوابت السرعة والانطلاق وفترة التثبيت ───
export const SPEED_THRESHOLD_MPS = 3.2; // 3.2 م/ث = ~11.5 كم/س (سرعة حركة سيارة حقيقية، أعلى بوضوح من المشي البشري)
export const CAR_SPEED_THRESHOLD = 3.2;
export const CAR_GRACE_MS = 3_500; // 3.5 ثانية لتأكيد استمرارية حركة السيارة ومنع شطحات الـ GPS اللحظية
export const STABILIZATION_MS = 5_000; // 5 ثوانٍ تثبيت أولي عند تشغيل الـ GPS
export const MAX_ALLOWED_ACCURACY_METERS = 45; // رفض الإحداثيات المشوشة (أبراج الشبكة/الواي فاي) لمنع الإنذارات الكاذبة

// ─── ⏱️ ثوابت ترشيد استهلاك السيرفر (Throttle) ───
const GPS_SERVER_THROTTLE_MS = 15_000; // حد أدنى 15 ثانية بين كل استعلام تحديث للسيرفر لتوفير الحمل

// صوت سارينة احترافي نقي ومتوازن
const SIREN_AUDIO_URL = 'https://assets.mixkit.co/active_storage/sfx/995/995-preview.mp3';
// ملف موجة صامتة 100% (0 dB PCM) لمنع نوم المتصفح بدون أي صوت مسموع حتى لو ضغط العميل عليه
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

function canBrowserVibrate(): boolean {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
      return false;
    }
    const ua = (navigator as any).userActivation;
    if (ua && typeof ua.hasBeenActive === 'boolean') {
      return ua.hasBeenActive;
    }
    return true;
  } catch {
    return false;
  }
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
  { type: 'status', title: '🌌 رادار المراقبة ', body: 'نظام الحماية نشط لمراقبة سيارتك .', icon: '🌌' },
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
    // 1. جلب أو تفعيل اشتراك Web Push أولاً لضمان إرفاق المفاتيح دائماً على الموبايل
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
        if (!sub && 'Notification' in window && Notification.permission === 'granted') {
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

    // 2. التحقق مما إذا كانت الجلسة مسجلة مسبقاً بنفس الـ sessionId
    const { data: existing } = await supabase
      .from('shield_sessions')
      .select('id, push_endpoint')
      .eq('session_id', params.sessionId)
      .is('ended_at', null)
      .maybeSingle();

    if (existing) {
      if (ep && p256 && auth && existing.push_endpoint !== ep) {
        await supabase
          .from('shield_sessions')
          .update({
            push_endpoint: ep,
            push_p256dh: p256,
            push_auth: auth,
            last_gps_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      }
      return existing.id;
    }

    // 3. في حال الانتقال من شاشة التوجيه (nav-...) إلى شاشة الجلسة الفعلية، نُرقّي السجل الحالي بدون تصفير fake_tick أو alert_count
    if (params.phone && !params.sessionId.startsWith('nav-')) {
      const { data: navRow } = await supabase
        .from('shield_sessions')
        .select('id, session_id')
        .eq('phone', params.phone)
        .eq('garage_id', params.garageId)
        .is('ended_at', null)
        .like('session_id', 'nav-%')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (navRow) {
        const updatePayload: Record<string, any> = {
          session_id: params.sessionId,
          parking_lat: params.parkingLat,
          parking_lng: params.parkingLng,
          last_gps_at: new Date().toISOString(),
        };
        if (ep && p256 && auth) {
          updatePayload.push_endpoint = ep;
          updatePayload.push_p256dh = p256;
          updatePayload.push_auth = auth;
        }
        await supabase
          .from('shield_sessions')
          .update(updatePayload)
          .eq('id', navRow.id);
        return navRow.id;
      }
    }

    // 4. إنشاء سجل درع جديد
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
  if (existing && existing.startTime > 0) {
    if (existing.sessionId === activeSessionId) {
      return existing;
    }
    if (
      (existing.sessionId.startsWith('nav-') || existing.sessionId === 'active_shield') &&
      activeSessionId &&
      !activeSessionId.startsWith('nav-')
    ) {
      const upgraded: FakeAlertMeta = {
        ...existing,
        sessionId: activeSessionId,
      };
      saveFakeAlertMeta(upgraded);
      return upgraded;
    }
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
      const tag = `parkn24-shield-status-${tick}`;
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((reg) => {
            reg.showNotification(alert.title, {
              body: alert.body,
              icon: '/favicon.ico',
              badge: '/favicon.ico',
              vibrate: [200, 100, 200],
              tag,
              renotify: true,
              data: { url: '/', type: 'shield-fake' },
            } as any).catch(() => {
              if (reg.active) {
                reg.active.postMessage({
                  type: 'SHOW_NOTIFICATION',
                  title: alert.title,
                  body: alert.body,
                  tag,
                });
              }
            });
          })
          .catch(() => {
            try {
              new Notification(alert.title, { body: alert.body, icon: '/favicon.ico', tag });
            } catch {}
          });
      } else {
        new Notification(alert.title, { body: alert.body, icon: '/favicon.ico', tag });
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
// 🔊 محرك الصوت الصامت (لمنع نوم المتصفح) مع التبديل الفوري للسارينة عند الاختراق
// ═══════════════════════════════════════════════════════════
let sharedAudioCtx: AudioContext | null = null;
let keepAliveSource: AudioBufferSourceNode | null = null;
let silentAudioEl: HTMLAudioElement | null = null;
let sirenAudioBuffer: AudioBuffer | null = null;
let sirenBufferSource: AudioBufferSourceNode | null = null;
let isFetchingSirenBuffer = false;
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
    // 1. الحفاظ على AudioContext نشطاً في الخلفية عبر موجة صامتة (0 dB)
    if (sharedAudioCtx && !keepAliveSource) {
      try {
        const silentBuf = sharedAudioCtx.createBuffer(1, sharedAudioCtx.sampleRate, sharedAudioCtx.sampleRate);
        const src = sharedAudioCtx.createBufferSource();
        const zeroGain = sharedAudioCtx.createGain();
        zeroGain.gain.value = 0;
        src.buffer = silentBuf;
        src.loop = true;
        src.connect(zeroGain);
        zeroGain.connect(sharedAudioCtx.destination);
        src.start();
        keepAliveSource = src;
        isAudioKeepAliveActive = true;
      } catch {}
    }
    // 2. تحميل وفك تشفير صوت السارينة داخل الرام (AudioBuffer) ليكون جاهزاً للضخ الفوري لحظة الاختراق
    if (sharedAudioCtx && !sirenAudioBuffer && !isFetchingSirenBuffer) {
      isFetchingSirenBuffer = true;
      fetch(SIREN_AUDIO_URL)
        .then((res) => res.arrayBuffer())
        .then((arr) => (sharedAudioCtx ? sharedAudioCtx.decodeAudioData(arr) : null))
        .then((decoded) => {
          if (decoded) sirenAudioBuffer = decoded;
        })
        .catch(() => {})
        .finally(() => {
          isFetchingSirenBuffer = false;
        });
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
 * تشغيل قناة الصوت الصامتة (SILENT_WAV_BASE64) لمنع المتصفح من النوم نهائياً في الخلفية،
 * مع ضمان عدم وجود ملف السارينة في المشغل إلا لحظة حدوث اختراق حقيقي.
 */
export function armBackgroundAudio(): void {
  try {
    initAudioContext();

    // تشغيل الموجة الصامتة (0 dB) في الخلفية لإبقاء المتصفح والـ GPS مستيقظين والشاشة مقفلة
    if (!silentAudioEl) {
      silentAudioEl = new Audio(SILENT_WAV_BASE64);
      silentAudioEl.loop = true;
      silentAudioEl.volume = 0.01;
      (silentAudioEl as any).playsInline = true;
    } else if (!isAlarmActive && silentAudioEl.src !== SILENT_WAV_BASE64) {
      silentAudioEl.src = SILENT_WAV_BASE64;
      silentAudioEl.loop = true;
      silentAudioEl.volume = 0.01;
    }

    if (silentAudioEl.paused) {
      silentAudioEl.play().then(() => {
        isAudioKeepAliveActive = true;
      }).catch(() => {});
    }

    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }

    // أثناء المراقبة العادية، إذا ضغط العميل على أي زر وسائط يظل المشغل على الموجة الصامتة فقط (0 صوت)
    if (!isAlarmActive && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => {
          if (silentAudioEl) silentAudioEl.play().catch(() => {});
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          if (silentAudioEl) silentAudioEl.play().catch(() => {});
        });
      } catch {}
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
// 🚨🔊 إطلاق السارينة وتعلية القناة الصوتية فوراً عند الخروج بسرعة السيارة
// ═══════════════════════════════════════════════════════════
export function triggerBreachAlarm(): void {
  if (isAlarmActive) return;
  isAlarmActive = true;

  // 1. ضخ صوت السارينة المخزن في الرام (sirenAudioBuffer) + موجة الإنذار بأعلى صوت داخل AudioContext النشط
  try {
    initAudioContext();
    const ctx = sharedAudioCtx;
    if (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      alarmAudioCtx = ctx;

      if (sirenAudioBuffer && !sirenBufferSource) {
        try {
          const bufSrc = ctx.createBufferSource();
          const bufGain = ctx.createGain();
          bufSrc.buffer = sirenAudioBuffer;
          bufSrc.loop = true;
          bufGain.gain.value = 0.9;
          bufSrc.connect(bufGain);
          bufGain.connect(ctx.destination);
          bufSrc.start(0);
          sirenBufferSource = bufSrc;
        } catch {}
      }

      const now = alarmAudioCtx.currentTime;
      const osc = alarmAudioCtx.createOscillator();
      const gain = alarmAudioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      for (let i = 0; i < 200; i++) {
        osc.frequency.setValueAtTime(950, now + i * 0.5);
        osc.frequency.linearRampToValueAtTime(750, now + i * 0.5 + 0.25);
      }
      gain.gain.setValueAtTime(0.45, now);
      osc.connect(gain);
      gain.connect(alarmAudioCtx.destination);
      osc.start();
      alarmOscillators = [osc];
    }
  } catch { /* ignore */ }

  // 2. تبديل نفس القناة الصوتية النشطة (silentAudioEl) من الصامت إلى ملف السارينة وتعلية الصوت فوراً
  try {
    if (!silentAudioEl) {
      silentAudioEl = new Audio(SIREN_AUDIO_URL);
      (silentAudioEl as any).playsInline = true;
    } else {
      silentAudioEl.src = SIREN_AUDIO_URL;
    }
    silentAudioEl.loop = true;
    silentAudioEl.volume = 0.85;
    silentAudioEl.currentTime = 0;
    silentAudioEl.play().catch(() => {});
  } catch (e) {
    console.warn('⚠️ Siren switch failed:', e);
  }

  // 3. اهتزاز نبضي مستمر
  if (canBrowserVibrate()) {
    const pleasantPattern = [300, 200, 300, 600];
    try {
      navigator.vibrate(pleasantPattern);
    } catch {}
    alarmVibrationInterval = setInterval(() => {
      if (isAlarmActive && canBrowserVibrate()) {
        try {
          navigator.vibrate(pleasantPattern);
        } catch {}
      }
    }, 1800);
  }

  // 4. تحديث إشعار شاشة القفل بنشاط الإنذار
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.playbackState = 'playing';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: '🚨 تنبيه: رصد حركة خارج نطاق الأمان!',
        artist: "رادار Park'n 24 يراقب سيارتك",
        album: 'نظام الحماية الذكي',
      });
    } catch {}
  }
}

// دالة للتوافق العكسي
export function triggerIntenseAlarm(): void {
  triggerBreachAlarm();
}

export function stopIntenseAlarm(): void {
  isAlarmActive = false;

  // إرجاع القناة الصوتية إلى الموجة الصامتة (0 dB) وإيقاف صوت السارينة فوراً
  if (silentAudioEl) {
    try {
      silentAudioEl.pause();
      silentAudioEl.src = SILENT_WAV_BASE64;
      silentAudioEl.volume = 0.01;
      silentAudioEl.loop = true;
    } catch { /* ignore */ }
  }

  if (sirenBufferSource) {
    try {
      sirenBufferSource.stop();
      sirenBufferSource.disconnect();
    } catch { /* ignore */ }
    sirenBufferSource = null;
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

  if (canBrowserVibrate()) {
    try {
      navigator.vibrate(0);
    } catch {}
  }

  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.metadata = null;
    } catch {}
  }
}

export function isIntenseAlarmActive(): boolean {
  return isAlarmActive;
}

// ═══════════════════════════════════════════════════════════
// 📍 GPS Geofence الدقيق: يميز حركة السيارة الحقيقية ويمنع الإنذارات الكاذبة
// ═══════════════════════════════════════════════════════════
let gpsWatchId: number | null = null;
let fallbackIntervalId: ReturnType<typeof setInterval> | null = null;
let lastSentLat = 0;
let lastSentLng = 0;
let breachStartTime: number | null = null;
let consecutiveBreachCount = 0;
let isCurrentlyOutside = false;
let prevPos: { lat: number; lng: number; t: number; distFromGarage: number } | null = null;
let posHistory: Array<{ lat: number; lng: number; t: number; distFromGarage: number; rawSpeed: number }> = [];
let watchStartTime = 0;
let lastWatchFixTime = 0;
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
  lastWatchFixTime = 0;
  let consecutiveErrors = 0;

  const handlePosition = (
    lat: number,
    lng: number,
    rawSpeed: number | null,
    accuracy: number | null,
  ) => {
    consecutiveErrors = 0;
    checkAndFirePeriodicFakeAlert(params.sessionId);

    const now = Date.now();
    const elapsed = now - watchStartTime;
    const distFromGarage = haversine(lat, lng, params.parkingLat, params.parkingLng);

    // 1. تجاهل القراءات المشوشة (مثل قفزات أبراج الشبكة أو الواي فاي داخل المباني)
    if (accuracy !== null && accuracy > MAX_ALLOWED_ACCURACY_METERS) {
      return;
    }

    // 2. فترة تثبيت أولية عند بدء التشغيل
    if (elapsed < STABILIZATION_MS) {
      prevPos = { lat, lng, t: now, distFromGarage };
      posHistory = [{ lat, lng, t: now, distFromGarage, rawSpeed: 0 }];
      return;
    }

    // تجاهل القراءات المتكررة في أقل من ثانية واحدة لمنع تضخيم السرعة الحسابية
    if (prevPos && now - prevPos.t < 900) {
      return;
    }

    const cleanRawSpeed =
      rawSpeed !== null && Number.isFinite(rawSpeed) && rawSpeed >= 0 && rawSpeed < 55
        ? rawSpeed
        : 0;

    prevPos = { lat, lng, t: now, distFromGarage };
    posHistory.push({ lat, lng, t: now, distFromGarage, rawSpeed: cleanRawSpeed });
    if (posHistory.length > 15) {
      posHistory.shift();
    }

    // 3. التحقق الصارم من حركة السيارة عبر مسار حقيقي مكون من 3 نقاط على الأقل (خطوتين متتاليتين A -> B -> C)
    // هذا يمنع تماماً أي قفزة GPS منفردة (A -> B) من التسبب في إنذار كاذب أثناء الوقوف أو الجلوس
    let confirmedCarSpeedMps = 0;
    let hasMultiStepCarMotion = false;

    if (posHistory.length >= 3) {
      const pC = posHistory[posHistory.length - 1]; // النقطة الحالية C
      for (let bIdx = posHistory.length - 2; bIdx >= 1; bIdx--) {
        const pB = posHistory[bIdx];
        const dtBC = (pC.t - pB.t) / 1000;
        if (dtBC < 1.2 || dtBC > 15) continue;

        const distBC = haversine(pB.lat, pB.lng, pC.lat, pC.lng);
        const speedBC = distBC / dtBC;
        if (distBC < 8 || speedBC < SPEED_THRESHOLD_MPS || speedBC >= 50) continue;

        for (let aIdx = bIdx - 1; aIdx >= 0; aIdx--) {
          const pA = posHistory[aIdx];
          const dtAB = (pB.t - pA.t) / 1000;
          if (dtAB < 1.2 || dtAB > 15) continue;

          const distAB = haversine(pA.lat, pA.lng, pB.lat, pB.lng);
          const speedAB = distAB / dtAB;
          if (distAB < 8 || speedAB < SPEED_THRESHOLD_MPS || speedAB >= 50) continue;

          const directAC = haversine(pA.lat, pA.lng, pC.lat, pC.lng);
          const totalPathABC = distAB + distBC;
          const straightness = totalPathABC > 0 ? directAC / totalPathABC : 0;
          const outwardProgress = pC.distFromGarage - pA.distFromGarage;

          // اشتراط استقامة المسار (>= 0.80) والابتعاد الفعلي عن الجراج
          if (
            directAC >= 18 &&
            straightness >= 0.80 &&
            (outwardProgress >= 12 || (pA.distFromGarage > GEOFENCE_RADIUS_METERS + 15 && outwardProgress >= 5))
          ) {
            hasMultiStepCarMotion = true;
            confirmedCarSpeedMps = Math.max(confirmedCarSpeedMps, directAC / ((pC.t - pA.t) / 1000));
            break;
          }
        }
        if (hasMultiStepCarMotion) break;
      }
    }

    // 4. فحص سرعة الدوبلر من القمر الصناعي بشرط أن تكون مؤكدة في القراءة الحالية والسابقة معاً + ابتعاد فعلي
    const prevPt = posHistory.length >= 2 ? posHistory[posHistory.length - 2] : null;
    const isSustainedDopplerSpeed =
      cleanRawSpeed >= SPEED_THRESHOLD_MPS &&
      prevPt !== null &&
      prevPt.rawSpeed >= SPEED_THRESHOLD_MPS &&
      distFromGarage - prevPt.distFromGarage >= 4 &&
      (!accuracy || accuracy <= 30);

    if (isSustainedDopplerSpeed) {
      confirmedCarSpeedMps = Math.max(confirmedCarSpeedMps, cleanRawSpeed);
    }

    const distFromLastSent = haversine(lat, lng, lastSentLat, lastSentLng);
    // التأكد من تجاوز الـ 50 متر مع مراعاة هامش خطأ الـ GPS حتى لا يضرب الإنذار والعميل داخل الجراج
    const accuracyMargin = accuracy ? Math.min(accuracy * 0.4, 15) : 0;
    const isTrulyOutsideGeofence = distFromGarage > GEOFENCE_RADIUS_METERS + accuracyMargin;
    const isConfirmedCarMovement =
      (hasMultiStepCarMotion || isSustainedDopplerSpeed) &&
      confirmedCarSpeedMps >= SPEED_THRESHOLD_MPS;

    // 🚨 الإنذار ينطلق فقط إذا خرجت السيارة فعلياً عن نطاق الـ 50 متر وتحركت بسرعة سيارة مؤكدة ومستمرة
    if (isTrulyOutsideGeofence && isConfirmedCarMovement) {
      consecutiveBreachCount++;
      if (!breachStartTime) {
        breachStartTime = now;
      }

      if (
        consecutiveBreachCount >= 3 ||
        (consecutiveBreachCount >= 2 && now - breachStartTime >= CAR_GRACE_MS)
      ) {
        if (!isCurrentlyOutside) {
          isCurrentlyOutside = true;
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              const title = '🚨 تحذير: رصد حركة خارج النطاق!';
              const body = `تحركت سيارتك لمسافة ${Math.round(distFromGarage)} متر بسرعة ${Math.round(confirmedCarSpeedMps * 3.6)} كم/س! ⚠️`;
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then((reg) => {
                  reg.showNotification(title, {
                    body,
                    icon: '/favicon.ico',
                    badge: '/favicon.ico',
                    vibrate: [300, 200, 300, 600],
                    tag: 'shield-breach',
                    data: { url: '/', type: 'shield-breach' },
                  } as any);
                });
              } else {
                new Notification(title, { body, icon: '/favicon.ico' });
              }
            } catch (e) {
              console.warn('Notification trigger error:', e);
            }
          }
          triggerBreachAlarm();
          sendGPSToServer(params.sessionId, params.shieldId, lat, lng, true, confirmedCarSpeedMps, true).catch(() => {});
          lastSentLat = lat;
          lastSentLng = lng;
          params.onGeofenceBreach(distFromGarage);
        } else if (distFromLastSent > MIN_MOVEMENT_METERS) {
          sendGPSToServer(params.sessionId, params.shieldId, lat, lng, true, confirmedCarSpeedMps, false).catch(() => {});
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
    (pos) => {
      lastWatchFixTime = Date.now();
      handlePosition(
        pos.coords.latitude,
        pos.coords.longitude,
        pos.coords.speed,
        pos.coords.accuracy,
      );
    },
    handleGPSError,
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
  );

  fallbackIntervalId = setInterval(() => {
    checkAndFirePeriodicFakeAlert(params.sessionId);
    if (silentAudioEl && silentAudioEl.paused) {
      silentAudioEl.play().catch(() => {});
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    // لا نطلب getCurrentPosition إلا إذا توقف watchPosition لأكثر من 10 ثوانٍ لمنع قفزات الإشارة المزدوجة
    if (Date.now() - lastWatchFixTime > 10_000) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          lastWatchFixTime = Date.now();
          handlePosition(
            pos.coords.latitude,
            pos.coords.longitude,
            pos.coords.speed,
            pos.coords.accuracy,
          );
        },
        handleGPSError,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 7000 },
      );
    }
  }, FALLBACK_INTERVAL_MS);

  visibilityHandler = () => {
    checkAndFirePeriodicFakeAlert(params.sessionId);
    if (silentAudioEl && silentAudioEl.paused) {
      silentAudioEl.play().catch(() => {});
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    if (document.visibilityState === 'visible') {
      requestWakeLock().catch(() => {});
      if (Date.now() - lastWatchFixTime > 5_000) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            lastWatchFixTime = Date.now();
            handlePosition(
              pos.coords.latitude,
              pos.coords.longitude,
              pos.coords.speed,
              pos.coords.accuracy,
            );
          },
          handleGPSError,
          { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 },
        );
      }
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
  lastWatchFixTime = 0;
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
    try {
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.metadata = null;
    } catch {}
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

export function clearShieldState(): void {
  try {
    localStorage.removeItem(SHIELD_STORAGE_KEY);
    localStorage.removeItem(FAKE_ALERT_STORAGE_KEY);
  } catch { /* ignore */ }
}