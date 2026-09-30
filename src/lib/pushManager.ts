// src/lib/pushManager.ts

import { normalizePlate, normalizePhone } from '../store';

// ─── VAPID & Supabase Configuration ─────────────────────────────
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
  garageId?:      string | null;
  customerPhone?: string | null;
  urgency?:       'high' | 'normal';
  ttl?:           number;
  immediate:      PushPayloadNotification;
  scheduled:      (PushPayloadNotification & { sendAt: string }) | null;
}

// ─── Helper: تحويل VAPID Key ────────────────────────────────────
const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
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

    await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
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

// ─── الدالة المركزية لتسجيل اشتراك الـ Push ──────────────────────
async function registerPushEndpoint(meta: { garageId?: string; customerPhone?: string; sessionId?: string; carPlate?: string }): Promise<boolean> {
  try {
    if (!('PushManager' in window)) return false;
    const registration = await registerServiceWorker();
    if (!registration) return false;

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') return false;

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
    if (!sub.keys?.p256dh || !sub.keys?.auth) return false;

    const cleanPhone = meta.customerPhone ? normalizePhone(meta.customerPhone) : null;
    const cleanPlate = meta.carPlate ? normalizePlate(meta.carPlate) : null;

    const result = await supabaseFetch('save-push-subscription', {
      subscription: {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      },
      garageId: meta.garageId || null,
      customerPhone: cleanPhone,
      sessionId: meta.sessionId || null,
      carPlate: cleanPlate,
      isNew,
      userAgent: navigator.userAgent,
      subscribedAt: new Date().toISOString(),
    });

    return result.ok;
  } catch (err) {
    console.error('❌ خطأ في registerPushEndpoint:', err);
    return false;
  }
}

// 🛡️ اشتراك هاتف السايس / الجراج
export const subscribeToPush = async (garageId: string): Promise<boolean> => {
  return registerPushEndpoint({ garageId });
};

// 🛡️ اشتراك هاتف العميل عند تفعيل الدرع لضمان وصول التنبيه الخارجي
export const subscribeCustomerPush = async (customerPhone: string, sessionId?: string, carPlate?: string): Promise<boolean> => {
  return registerPushEndpoint({ customerPhone, sessionId, carPlate });
};

// ─── 🚗 1. إرسال تنبيه "سيارة في الطريق" بأعلى أولوية طوارئ للسايس ───
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

// ─── 🚨 2. إرسال إنذار سرقة عاجل بالتوازي (للسايس والعميل معاً) ─────────────
export const sendTheftAlertPush = async ({
  garageId,
  customerPhone,
  carPlate,
  reason,
  sessionId,
}: {
  garageId?:      string;
  customerPhone?: string;
  carPlate:       string;
  reason?:        string;
  sessionId?:     string;
}): Promise<boolean> => {
  try {
    const plateFingerprint = normalizePlate(carPlate) || carPlate;
    const tag = `theft-alarm-${plateFingerprint}-${Date.now()}`;
    const cleanPhone = customerPhone ? normalizePhone(customerPhone) : null;

    // 🔗 رابط التوجيه الذكي المباشر لشاشة الإنذار
    const deepLinkUrl = `/?breach=true&carPlate=${encodeURIComponent(carPlate)}`;

    const payload = {
      garageId:      garageId || null,
      customerPhone: cleanPhone,
      carPlate:      carPlate,
      sessionId:     sessionId || null,
      urgency:       'high',
      ttl:           0, // تسليم فوري

      immediate: {
        title: '🚨 إنذار سرقة عاجل لمركبتك!',
        body:  `🚗 السيارة ${carPlate} • ${reason || 'تم رصد حركة وسحب غير مصرح به!'}`,
        tag,
        data: {
          type:       'theft_breach',
          carPlate,
          garageId:   garageId || null,
          url:        deepLinkUrl, // يفتح شاشة الإنذار مباشرة
          breachTime: new Date().toISOString(),
          tag,
        },
      },
      scheduled: null,
    };

    const tasks: Promise<any>[] = [];
    if (cleanPhone) {
      tasks.push(supabaseFetch('send-push-notification', { ...payload, garageId: null, customerPhone: cleanPhone }));
    }
    if (garageId) {
      tasks.push(supabaseFetch('send-push-notification', { ...payload, customerPhone: null, garageId }));
    }

    await Promise.all(tasks);
    return true;
  } catch (err) {
    console.error('❌ خطأ في sendTheftAlertPush:', err);
    return false;
  }
};

// ─── 🛡️ 3. إرسال إشعار تأكيد تفعيل درع الأمان ────────────────────────
export const sendShieldActivatedPush = async ({
  garageId,
  carPlate,
}: {
  garageId: string;
  carPlate: string;
}): Promise<boolean> => {
  try {
    const plateFingerprint = normalizePlate(carPlate) || carPlate;
    const tag = `shield-on-${plateFingerprint}`;

    const payload: SendPushPayload = {
      garageId,
      urgency: 'normal',
      ttl: 300,

      immediate: {
        title: '🛡️ تم تفعيل درع الرادار للمركبة',
        body:  `🚗 السيارة ${carPlate} مؤمنة ومسجلة في رادار الحماية (+10 ج)`,
        tag,
        data: {
          type:     'shield_activated',
          carPlate,
          garageId,
          url:      '/garage',
        },
      },
      scheduled: null,
    };

    const result = await supabaseFetch('send-push-notification', payload);
    return result.ok;
  } catch (err) {
    console.error('❌ خطأ في sendShieldActivatedPush:', err);
    return false;
  }
};

// ─── 4. إلغاء التنبيه المجدول ──────────────────────────────────────
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

// ─── 5. إلغاء الاشتراك ─────────────────────────────────────────────
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
  } catch {
    return false;
  }
};

// ─── 6. التحقق من حالة الاشتراك وتجديده ───────────────────────────
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

// ─── 🛑 7. إيقاف تكرار إنذار السرقة (عند تأكيد الأمان) ─────────
export const stopTheftAlarmRepeat = async ({
  carPlate,
}: {
  carPlate: string;
}): Promise<boolean> => {
  try {
    const result = await supabaseFetch('cancel-scheduled-alert', {
      carPlate,
      tags: [`theft-emergency`, `theft-repeat`],
      action: 'stop_repeat',
      cancelledAt: new Date().toISOString(),
    });
    return result.ok;
  } catch {
    return false;
  }
};