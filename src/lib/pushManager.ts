// src/lib/pushManager.ts

import { normalizePlate } from '../store';

// ─── Configuration ─────────────────────────────────────────────
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ─── Types ─────────────────────────────────────────────────────
interface PushResult {
  success: boolean;
  message: string;
  data?: unknown;
}

interface PushPayloadNotification {
  title: string;
  body: string;
  tag?: string;
  data?: Record<string, unknown>;
}

interface SendPushPayload {
  garageId: string;
  urgency?: 'high' | 'normal';
  ttl?: number;
  immediate: PushPayloadNotification;
  scheduled: (PushPayloadNotification & { sendAt: string }) | null;
}

// ─── Helpers ───────────────────────────────────────────────────
const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)));
};

const supabaseFetch = async (
  path: string,
  body: unknown,
  retries: number = 2
): Promise<PushResult> => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { success: false, message: 'إعدادات السيرفر ناقصة' };
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        return { success: true, message: 'تم بنجاح', data };
      }

      if (response.status >= 400 && response.status < 500) {
        return { success: false, message: `خطأ: ${response.status}` };
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (attempt === retries) {
        return { success: false, message: 'فشل الاتصال بالسيرفر' };
      }
    }

    // Exponential Backoff
    const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
    await new Promise((r) => setTimeout(r, delay));
  }

  return { success: false, message: 'انتهت المحاولات' };
};

// ─── Service Worker ────────────────────────────────────────────
export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
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

// ─── Subscribe ─────────────────────────────────────────────────
export const subscribeToPush = async (garageId: string): Promise<PushResult> => {
  try {
    if (!('PushManager' in window) || !('Notification' in window)) {
      return { success: false, message: 'المتصفح مش بيدعم الإشعارات' };
    }

    const registration = await registerServiceWorker();
    if (!registration) {
      return { success: false, message: 'فشل تسجيل Service Worker' };
    }

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      return { 
        success: false, 
        message: 'فعّل إشعارات المتصفح عشان الدرع يشتغل! 🔔' 
      };
    }

    let subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const exp = subscription.expirationTime;
      if (exp && Date.now() > exp) {
        await subscription.unsubscribe();
        subscription = null;
      }
    }

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const sub = subscription.toJSON();
    if (!sub.keys?.p256dh || !sub.keys?.auth) {
      return { success: false, message: 'مفاتيح الاشتراك ناقصة' };
    }

    const result = await supabaseFetch('save-push-subscription', {
      subscription: {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      },
      garageId,
      userAgent: navigator.userAgent,
      subscribedAt: new Date().toISOString(),
    });

    if (result.success) {
      return { success: true, message: 'تم تفعيل الدرع بنجاح! 🛡️' };
    }
    return result;
  } catch (err) {
    return { success: false, message: 'حدث خطأ غير متوقع' };
  }
};

// ─── Send Car Coming Push ──────────────────────────────────────
export const sendCarComingPush = async ({
  garageId,
  carPlate,
  estimatedMinutes,
  customerName,
  agreedPrice,
}: {
  garageId: string;
  carPlate: string;
  estimatedMinutes: number;
  customerName?: string;
  agreedPrice?: number;
}): Promise<PushResult> => {
  try {
    const plateFingerprint = normalizePlate(carPlate) || carPlate;

    const scheduledSendAt = new Date(
      Date.now() + Math.max(1, estimatedMinutes - 2) * 60 * 1000
    ).toISOString();

    const payload: SendPushPayload = {
      garageId,
      urgency: 'high',
      ttl: 0,
      immediate: {
        title: '🚨 سيارة في الطريق!',
        body: `🚗 ${carPlate} • استعد للاستقبال!`,
        tag: `incoming-${plateFingerprint}`,
        data: {
          type: 'incoming_car',
          carPlate,
          garageId,
          url: '/garage',
          customerName: customerName ?? null,
          agreedPrice: agreedPrice ?? null,
          estimatedMinutes,
        },
      },
      scheduled: estimatedMinutes > 2
        ? {
            title: '⏰ سيارة على وشك الوصول!',
            body: `🚗 ${carPlate} - باقي أقل من دقيقتين`,
            tag: `approaching-${plateFingerprint}`,
            data: { type: 'approaching_car', carPlate, garageId, url: '/garage' },
            sendAt: scheduledSendAt,
          }
        : null,
    };

    return await supabaseFetch('send-push-notification', payload);
  } catch (err) {
    return { success: false, message: 'فشل إرسال الإشعار' };
  }
};

// ─── Cancel Scheduled ──────────────────────────────────────────
export const cancelScheduledPush = async (
  garageId: string,
  carPlate: string
): Promise<PushResult> => {
  const plateFingerprint = normalizePlate(carPlate) || carPlate;
  return await supabaseFetch('cancel-scheduled-alert', {
    garageId,
    carPlate,
    tags: [`approaching-${plateFingerprint}`],
    cancelledAt: new Date().toISOString(),
  });
};

// ─── Unsubscribe ───────────────────────────────────────────────
export const unsubscribeFromPush = async (): Promise<PushResult> => {
  try {
    if (!('serviceWorker' in navigator)) {
      return { success: false, message: 'المتصفح مش بيدعم' };
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await supabaseFetch('save-push-subscription', {
        subscription: null,
        action: 'unsubscribe',
        endpoint: subscription.endpoint,
      });
      await subscription.unsubscribe();
      return { success: true, message: 'تم إلغاء الاشتراك' };
    }
    return { success: false, message: 'مفيش اشتراك نشط' };
  } catch {
    return { success: false, message: 'فشل إلغاء الاشتراك' };
  }
};

// ─── Check Status ──────────────────────────────────────────────
export const checkPushSubscriptionStatus = async () => {
  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  if (!isSupported) {
    return { isSubscribed: false, permission: 'denied' as const, isSupported: false };
  }

  const permission = Notification.permission;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return {
      isSubscribed: !!subscription,
      permission,
      isSupported,
      endpoint: subscription?.endpoint,
    };
  } catch {
    return { isSubscribed: false, permission, isSupported };
  }
};

export const refreshPushSubscriptionIfNeeded = async (garageId: string): Promise<void> => {
  if (!garageId) return;
  const status = await checkPushSubscriptionStatus();
  if (status.isSupported && status.permission === 'granted' && !status.isSubscribed) {
    await subscribeToPush(garageId);
  }
};
// ─── Shield Session (Server-Side Fake Alerts) ─────────────────
export const registerShieldSession = async (
  sessionId: string,
  parkingLat: number,
  parkingLng: number
): Promise<PushResult> => {
  return await supabaseFetch('shield-register', {
    action: 'register',
    sessionId,
    parkingLat,
    parkingLng,
  });
};

export const unregisterShieldSession = async (
  sessionId: string
): Promise<PushResult> => {
  return await supabaseFetch('shield-register', {
    action: 'unregister',
    sessionId,
  });
};