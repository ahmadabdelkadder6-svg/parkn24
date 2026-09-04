// ─── VAPID Public Key ───────────────────────────────────────────
const VAPID_PUBLIC_KEY =
  'BOuP_HFhSSjHMsjf4KZJYLaFTv3RdI20Ux3an5LriaTBUN0iGlW-38zYGvROp26k7jcqhC_XpUotxzLR1IjQTI4';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ─── Types ──────────────────────────────────────────────────────
interface PushPayloadNotification {
  title: string;
  body:  string;
  tag?:  string;
  icon?: string;
  badge?: string;
  vibrate?: number[];
  requireInteraction?: boolean;
  silent?: boolean;
  actions?: Array<{ action: string; title: string; icon?: string }>;
  data?: Record<string, unknown>;
}

interface SendPushPayload {
  garageId:  string;
  urgency?:  'high' | 'normal';
  ttl?:      number;
  immediate: PushPayloadNotification;
  scheduled: (PushPayloadNotification & { sendAt: string }) | null;
}

// ⏳ خريطة حفظ مؤقتات الإلغاء (Grace Period Timers)
const pendingPushTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }

    await navigator.serviceWorker.ready;
    return registration;
  } catch (err) {
    console.error('❌ فشل تسجيل Service Worker:', err);
    return null;
  }
};

// ─── الاشتراك في Push Notifications ────────────────────────────
export const subscribeToPush = async (garageId: string): Promise<boolean> => {
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
      console.warn('❌ تم رفض إذن الإشعارات من السايس');
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

    const result = await supabaseFetch('save-push-subscription', {
      subscription: {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys.p256dh,
          auth:   sub.keys.auth,
        },
      },
      garageId,
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

// ─── إرسال التنبيه الفعلي بعد انتهاء فترة الـ 30 ثانية ───────────
const executeCarComingPush = async ({
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
    const immediateTag = `incoming-${carPlate}`;
    const scheduledTag = `approaching-${carPlate}`;

    // حساب موعد تنبيه الاقتراب (قبل الوصول بدقيقتين)
    const scheduledSendAt = new Date(
      Date.now() + Math.max(1, estimatedMinutes - 2) * 60 * 1000
    ).toISOString();

    const alarmVibrationPattern = [1000, 200, 1000, 200, 1000, 200, 1500, 300, 2000];

    const payload: SendPushPayload = {
      garageId,
      urgency: 'high',
      ttl: 0,

      immediate: {
        title: '🚨 سيارة في الطريق إليك الآن!',
        body:  `🚗 رقم السيارة: ${carPlate} • استعد للاستقبال فوراً!`,
        tag:   immediateTag,
        icon:  '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        vibrate: alarmVibrationPattern,
        requireInteraction: true,
        silent: false,
        actions: [
          { action: 'open_garage', title: '📂 فتح لوحة الجراج' }
        ],
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
              title:  '⏰ سيارة على وشك الوصول للجراج!',
              body:   `🚗 السيارة ${carPlate} - باقي أقل من دقيقتين للوصول! ⏰`,
              tag:    scheduledTag,
              icon:   '/icons/icon-192x192.png',
              badge:  '/icons/badge-72x72.png',
              vibrate: alarmVibrationPattern,
              requireInteraction: true,
              silent: false,
              actions: [
                { action: 'open_garage', title: '📂 عرض اللوحة النشطة' }
              ],
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
    console.error('❌ خطأ في إرسال التنبيه الفعلي:', err);
    return false;
  }
};

// ─── إرسال تنبيه "سيارة في الطريق" بعد مهلة 30 ثانية للإلغاء ────────
export const sendCarComingPush = async ({
  garageId,
  carPlate,
  estimatedMinutes,
  customerName,
  agreedPrice,
  delaySeconds = 30, // ⏳ تأخير 30 ثانية افتراضياً لإتاحة مهلة التراجع
}: {
  garageId:         string;
  carPlate:         string;
  estimatedMinutes: number;
  customerName?:    string;
  agreedPrice?:     number;
  delaySeconds?:    number;
}): Promise<boolean> => {
  // إلغاء أي مؤقت سابق لنفس اللوحة إن وُجد
  if (pendingPushTimers.has(carPlate)) {
    clearTimeout(pendingPushTimers.get(carPlate)!);
    pendingPushTimers.delete(carPlate);
  }

  // إذا تم طلب الإرسال المباشر بدون تأخير
  if (delaySeconds <= 0) {
    return executeCarComingPush({ garageId, carPlate, estimatedMinutes, customerName, agreedPrice });
  }

  // 🛡️ بدء عداد الـ 30 ثانية: يتم الإرسال فقط إذا لم يقم العميل بالإلغاء
  return new Promise((resolve) => {
    const timer = setTimeout(async () => {
      pendingPushTimers.delete(carPlate);
      const success = await executeCarComingPush({
        garageId,
        carPlate,
        estimatedMinutes,
        customerName,
        agreedPrice,
      });
      resolve(success);
    }, delaySeconds * 1000);

    pendingPushTimers.set(carPlate, timer);
  });
};

// ─── إلغاء التنبيه فوراً عند تراجع العميل أو السايس في الـ 30 ثانية ──
export const cancelScheduledPush = async (
  garageId: string,
  carPlate: string
): Promise<boolean> => {
  try {
    // 1️⃣ إيقاف مؤقت الـ 30 ثانية المحلي فوراً (فلن يصل الإشعار للسايس نهائياً)
    if (pendingPushTimers.has(carPlate)) {
      clearTimeout(pendingPushTimers.get(carPlate)!);
      pendingPushTimers.delete(carPlate);
      console.log(`🛑 تم إلغاء إشعار ${carPlate} خلال مهلة الـ 30 ثانية`);
    }

    // 2️⃣ إلغاء التنبيه المجدول على السيرفر (تنبيه الدقيقتين)
    const result = await supabaseFetch('cancel-scheduled-alert', {
      garageId,
      carPlate,
      tags:        [`incoming-${carPlate}`, `approaching-${carPlate}`],
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

export const refreshPushSubscriptionIfNeeded = async (garageId: string): Promise<void> => {
  if (!garageId) return;
  const status = await checkPushSubscriptionStatus();
  if (status.isSupported && status.permission === 'granted') {
    await subscribeToPush(garageId);
  }
};