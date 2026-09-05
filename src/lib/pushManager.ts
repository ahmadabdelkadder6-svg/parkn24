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
  data?: Record<string, unknown>;
}

interface SendPushPayload {
  garageId:  string;
  urgency?:  'high' | 'normal';
  ttl?:      number;
  immediate: PushPayloadNotification;
  scheduled: (PushPayloadNotification & { sendAt: string }) | null;
}

// 🔒 قفل عام حديدي: منع تكرار الإشعار لنفس السيارة إطلاقاً
const sentPushCarKeys = new Set<string>();

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)));
};

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

export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!('serviceWorker' in navigator)) {
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

export const subscribeToPush = async (garageId: string): Promise<boolean> => {
  try {
    if (!('PushManager' in window)) {
      return false;
    }

    const registration = await registerServiceWorker();
    if (!registration) return false;

    let permission = Notification.permission;
    if (permission === 'default') {
      try {
        permission = await Notification.requestPermission();
      } catch (e) {}
    }

    if (permission !== 'granted') {
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

// ─── إرسال التنبيه لمرة واحدة فقط بدون أي تكرار ──────────────────
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
    const lockKey = `${garageId}_${carPlate.trim().toUpperCase()}`;

    // 🛡️ فحص القفل: إذا تم إرسال إشعار لهذه السيارة من قبل، نمنع الإرسال فوراً
    if (sentPushCarKeys.has(lockKey)) {
      console.log(`🛡️ [Push Blocked] تم منع تكرار الإشعار للسيارة: ${carPlate}`);
      return true;
    }

    // تفعيل القفل فوراً
    sentPushCarKeys.add(lockKey);

    const immediateTag = `incoming-${carPlate}`;
    const scheduledTag = `approaching-${carPlate}`;

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

    console.log(`🚀 [Push Sent ONCE] إرسال إشعار السيرفر للسيارة: ${carPlate}`);
    const result = await supabaseFetch('send-push-notification', payload);
    return result.ok;
  } catch (err) {
    console.error('❌ خطأ في sendCarComingPush:', err);
    return false;
  }
};

export const cancelScheduledPush = async (
  garageId: string,
  carPlate: string
): Promise<boolean> => {
  try {
    const lockKey = `${garageId}_${carPlate.trim().toUpperCase()}`;
    sentPushCarKeys.delete(lockKey);

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