// src/lib/pushManager.ts
import { normalizePlate, normalizePhone } from '../store';

// ─── VAPID & Supabase Configuration ─────────────────────────────
const VAPID_PUBLIC_KEY =
  'BOuP_HFhSSjHMsjf4KZJYLaFTv3RdI20Ux3an5LriaTBUN0iGlW-38zYGvROp26k7jcqhC_XpUotxzLR1IjQTI4';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ─── ذاكرة إدارة تكرار إشعارات الطوارئ كل 3 ثوانٍ ────────────────────
const activeBreachIntervals = new Map<string, ReturnType<typeof setInterval>>();

// ─── Types ──────────────────────────────────────────────────────
interface PushPayloadNotification {
  title: string;
  body:  string;
  tag?:  string;
  data?: Record<string, unknown>;
}

interface SendPushPayload {
  garageId?:  string;
  userPhone?: string;
  carPlate?:  string;
  urgency?:   'high' | 'normal';
  ttl?:       number;
  immediate:  PushPayloadNotification;
  scheduled:  (PushPayloadNotification & { sendAt: string }) | null;
}

// ─── Helper: تحويل VAPID Key ────────────────────────────────────
const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)));
};

// ─── Helper: Supabase Fetch مع Retry سريع ────────────────────────
const supabaseFetch = async (
  path:    string,
  body:    unknown,
  retries: number = 2
): Promise<{ ok: boolean; data?: unknown; error?: string }> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        return { ok: true, data };
      }

      if (response.status >= 400 && response.status < 500) {
        const error = await response.text();
        console.error(`❌ [${path}] Client error ${response.status}:`, error);
        return { ok: false, error };
      }

      console.warn(`⚠️ [${path}] Server error ${response.status}, attempt ${attempt + 1}`);
    } catch (err) {
      console.warn(`⚠️ [${path}] Network error, attempt ${attempt + 1}:`, err);
      if (attempt === retries) {
        return { ok: false, error: String(err) };
      }
    }

    await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
  }

  return { ok: false, error: 'Max retries exceeded' };
};

// ─── تسجيل Service Worker ───────────────────────────────────────
export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!('serviceWorker' in navigator)) {
    console.warn('❌ Service Worker غير مدعوم');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });

    await navigator.serviceWorker.ready;
    return registration;
  } catch (err) {
    console.error('❌ فشل تسجيل Service Worker:', err);
    return null;
  }
};

// ─── الاشتراك في Push Notifications (يدعم السايس والعميل) ────────
export const subscribeToPush = async (
  target: string | { garageId?: string; userPhone?: string; carPlate?: string }
): Promise<boolean> => {
  try {
    if (!('PushManager' in window)) {
      console.warn('❌ Push غير مدعوم في هذا المتصفح');
      return false;
    }

    const registration = await registerServiceWorker();
    if (!registration) return false;

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      console.warn('❌ تم رفض إذن الإشعارات');
      return false;
    }

    let subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      try {
        const exp = subscription.expirationTime;
        if (exp && Date.now() > exp) {
          await subscription.unsubscribe();
          subscription = null;
        }
      } catch {}
    }

    let isNew = false;
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      isNew = true;
    }

    const sub = subscription.toJSON();
    if (!sub.keys?.p256dh || !sub.keys?.auth) {
      console.error('❌ مفاتيح الـ subscription ناقصة');
      return false;
    }

    const garageId = typeof target === 'string' ? target : target.garageId;
    const userPhone = typeof target === 'object' ? normalizePhone(target.userPhone) : undefined;
    const carPlate = typeof target === 'object' ? normalizePlate(target.carPlate) : undefined;

    const result = await supabaseFetch('save-push-subscription', {
      subscription: {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys.p256dh,
          auth:   sub.keys.auth,
        },
      },
      garageId:  garageId  || null,
      userPhone: userPhone || null,
      carPlate:  carPlate  || null,
      isNew,
      userAgent: navigator.userAgent,
      subscribedAt: new Date().toISOString(),
    });

    return result.ok;
  } catch (err) {
    console.error('❌ خطأ في subscribeToPush:', err);
    return false;
  }
};

// ─── إرسال تنبيه "سيارة في الطريق" بأعلى أولوية طوارئ للسايس ──────
export const sendCarComingPush = async ({
  garageId,
  carPlate,
  estimatedMinutes,
  customerName,
  agreedPrice,
}: {
  garageId:         string;
  carPlate:         string;
  estimatedMinutes: number;
  customerName?:    string;
  agreedPrice?:     number;
}): Promise<boolean> => {
  try {
    const plateFingerprint = normalizePlate(carPlate) || carPlate;
    const immediateTag = `incoming-${plateFingerprint}`;
    const scheduledTag = `approaching-${plateFingerprint}`;

    const scheduledSendAt = new Date(
      Date.now() + Math.max(1, estimatedMinutes - 2) * 60 * 1000
    ).toISOString();

    const payload: SendPushPayload = {
      garageId,
      urgency: 'high',
      ttl: 0,

      immediate: {
        title: '🚨 سيارة في الطريق إليك!',
        body:  `🚗 رقم السيارة: ${carPlate} • استعد للاستقبال!`,
        tag:   immediateTag,
        data: {
          type:             'incoming_car',
          carPlate,
          garageId,
          url:              '/garage',
          customerName:     customerName ?? null,
          agreedPrice:      agreedPrice  ?? null,
          estimatedMinutes,
          sentAt:           new Date().toISOString(),
        },
      },

      scheduled:
        estimatedMinutes > 2
          ? {
              title:  '⏰ سيارة على وشك الوصول!',
              body:   `🚗 ${carPlate} - باقي أقل من دقيقتين ⏰`,
              tag:    scheduledTag,
              data: {
                type:     'approaching_car',
                carPlate,
                garageId,
                url:      '/garage',
              },
              sendAt: scheduledSendAt,
            }
          : null,
    };

    const result = await supabaseFetch('send-push-notification', payload);
    return result.ok;
  } catch (err) {
    console.error('❌ خطأ في sendCarComingPush:', err);
    return false;
  }
};

// ─── 🚨 إرسال إشعار طوارئ باختراق درع الأمان (شامل الشطرنج وحساس الصاج) ──────
export const sendSecurityBreachPush = async ({
  garageId,
  carPlate,
  distanceMeters,
  customerPhone,
  slotId,
  breachReason,
}: {
  garageId:        string;
  carPlate:        string;
  distanceMeters?: number;
  customerPhone?:  string;
  slotId?:         string;
  breachReason?:   string;
}): Promise<boolean> => {
  try {
    const plateFingerprint = normalizePlate(carPlate) || carPlate;
    const cleanPhone = customerPhone ? normalizePhone(customerPhone) : undefined;
    
    // ⚡ إضافة Timestamp متغير للـ Tag لإجبار الهاتف على تشغيل نغمة واهتزاز جديد في كل مرة
    const breachTag = `breach-${plateFingerprint}-${Date.now()}`;

    const slotInfo = slotId ? ` بالمربع [${slotId}]` : '';
    const reasonText = breachReason ? `\n⚠️ السبب: ${breachReason}` : ` غادرت فقاعة الأمان (${distanceMeters ? distanceMeters + 'م' : '15م'}) بدون إذن خروج!`;

    const payload: SendPushPayload = {
      garageId,
      userPhone: cleanPhone,
      carPlate:  plateFingerprint,
      urgency:   'high',
      ttl: 0, // إرسال لحظي فوري بدون أي تأخير

      immediate: {
        title: `🚨 إنذار طوارئ: تحرك سيارة${slotInfo}!`,
        body:  `🚗 السيارة لوحة [${carPlate}] تحركت الآن!${reasonText}`,
        tag:   breachTag,
        data: {
          type:           'security_breach',
          carPlate,
          garageId,
          slotId:         slotId ?? null,
          breachReason:   breachReason ?? null,
          url:            '/session',
          customerPhone:  cleanPhone ?? null,
          distanceMeters: distanceMeters ?? null,
          isBreached:     true,
          sentAt:         new Date().toISOString(),
        },
      },
      scheduled: null,
    };

    const result = await supabaseFetch('send-push-notification', payload);
    return result.ok;
  } catch (err) {
    console.error('❌ خطأ في sendSecurityBreachPush:', err);
    return false;
  }
};

// ─── 🔁 تشغيل حلقة تكرار إشعارات الطوارئ كل 3 ثوانٍ للعميل والسايس ────────
export const startSecurityBreachLoop = ({
  garageId,
  carPlate,
  distanceMeters,
  customerPhone,
  slotId,
  breachReason,
  intervalMs = 3000,
}: {
  garageId:        string;
  carPlate:        string;
  distanceMeters?: number;
  customerPhone?:  string;
  slotId?:         string;
  breachReason?:   string;
  intervalMs?:     number;
}) => {
  const plateKey = normalizePlate(carPlate) || carPlate;

  if (activeBreachIntervals.has(plateKey)) return;

  // 1️⃣ إرسال فوري للنبضة الأولى
  sendSecurityBreachPush({ garageId, carPlate, distanceMeters, customerPhone, slotId, breachReason });

  // 2️⃣ تكرار الإرسال كل 3 ثوانٍ
  const intervalId = setInterval(() => {
    sendSecurityBreachPush({ garageId, carPlate, distanceMeters, customerPhone, slotId, breachReason });
  }, intervalMs);

  activeBreachIntervals.set(plateKey, intervalId);
};

// ─── 🛑 إيقاف حلقة تكرار إشعارات الطوارئ فور إلغاء الإنذار أو السداد ───────
export const stopSecurityBreachLoop = (carPlate: string) => {
  const plateKey = normalizePlate(carPlate) || carPlate;
  const intervalId = activeBreachIntervals.get(plateKey);
  if (intervalId) {
    clearInterval(intervalId);
    activeBreachIntervals.delete(plateKey);
  }
};

// ─── إلغاء التنبيه المجدول ──────────────────────────────────────
export const cancelScheduledPush = async (
  garageId: string,
  carPlate: string
): Promise<boolean> => {
  try {
    const plateFingerprint = normalizePlate(carPlate) || carPlate;
    const result = await supabaseFetch('cancel-scheduled-alert', {
      garageId,
      carPlate,
      tags:        [`approaching-${plateFingerprint}`],
      cancelledAt: new Date().toISOString(),
    });
    return result.ok;
  } catch (err) {
    console.error('❌ خطأ في cancelScheduledPush:', err);
    return false;
  }
};

// ─── إلغاء الاشتراك ─────────────────────────────────────────────
export const unsubscribeFromPush = async (): Promise<boolean> => {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await supabaseFetch('save-push-subscription', {
        subscription: null,
        garageId:     null,
        action:       'unsubscribe',
        endpoint:     subscription.endpoint,
      });

      await subscription.unsubscribe();
      return true;
    }
    return false;
  } catch (err) {
    return false;
  }
};

// ─── التحقق من حالة الاشتراك وتجديده ───────────────────────────
export const checkPushSubscriptionStatus = async () => {
  const isSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!isSupported) return { isSubscribed: false, permission: 'denied', isSupported: false };

  const permission = Notification.permission;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return { isSubscribed: false, permission, isSupported };

    return {
      isSubscribed: true,
      permission,
      isSupported,
      endpoint: subscription.endpoint,
    };
  } catch {
    return { isSubscribed: false, permission, isSupported };
  }
};

export const refreshPushSubscriptionIfNeeded = async (
  target: string | { garageId?: string; userPhone?: string; carPlate?: string }
): Promise<void> => {
  if (!target) return;
  const status = await checkPushSubscriptionStatus();
  if (status.isSupported && status.permission === 'granted') {
    await subscribeToPush(target);
  }
};