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
  immediate: PushPayloadNotification;
  scheduled: (PushPayloadNotification & { sendAt: string }) | null;
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

// ─── Helper: Supabase Fetch مع Retry ────────────────────────────
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

    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }

  return { ok: false, error: 'Max retries exceeded' };
};

// ─── تسجيل Service Worker ───────────────────────────────────────
export const registerServiceWorker =
  async (): Promise<ServiceWorkerRegistration | null> => {
    if (!('serviceWorker' in navigator)) {
      console.warn('❌ Service Worker غير مدعوم');
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope:          '/',
        updateViaCache: 'none',
      });

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              console.log('🔄 نسخة جديدة متاحة');
            }
          });
        }
      });

      await navigator.serviceWorker.ready;
      return registration;

    } catch (err) {
      console.error('❌ فشل تسجيل Service Worker:', err);
      return null;
    }
  };

// ─── الاشتراك في Push Notifications ────────────────────────────
export const subscribeToPush = async (
  garageId: string
): Promise<boolean> => {
  try {
    if (!('PushManager' in window)) {
      console.warn('❌ Push غير مدعوم');
      return false;
    }

    const registration = await registerServiceWorker();
    if (!registration) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('❌ رفض إذن الإشعارات');
      return false;
    }

    // ─── التحقق من Subscription الموجودة ──────────────────
    let subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      try {
        const exp = subscription.expirationTime;
        if (exp && Date.now() > exp) {
          console.log('⚠️ Subscription منتهية، جاري التجديد...');
          await subscription.unsubscribe();
          subscription = null;
        }
      } catch {
        // بعض المتصفحات لا تدعم expirationTime
      }
    }

    let isNew = false;

    if (!subscription) {
      console.log('📝 إنشاء subscription جديدة...');
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      isNew = true;
    } else {
      console.log('✅ Subscription موجودة - سيتم تحديثها في DB');
      // ✅ حتى لو موجودة، نبعت للسيرفر عشان يعمل upsert
      // ده مهم لو غيرنا الجراج أو الـ endpoint اتغير
    }

    const sub = subscription.toJSON();

    if (!sub.keys?.p256dh || !sub.keys?.auth) {
      console.error('❌ مفاتيح الـ subscription ناقصة');
      return false;
    }

    // ✅ حفظ في Supabase دايماً (مش بس لو isNew)
    // السيرفر هيعمل upsert على (garage_id, endpoint)
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
      userAgent:    navigator.userAgent,
      subscribedAt: new Date().toISOString(),
    });

    if (!result.ok) {
      console.error('❌ فشل حفظ الـ subscription:', result.error);
      return false;
    }

    console.log(`✅ Subscription ${isNew ? 'created' : 'updated'} for garage:`, garageId);
    return true;

  } catch (err) {
    console.error('❌ خطأ في subscribeToPush:', err);
    return false;
  }
};

// ─── إرسال تنبيه "سيارة في الطريق" ────────────────────────────
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
    const bodyParts: string[] = [`🚗 ${carPlate}`];
    if (customerName)         bodyParts.push(`👤 ${customerName}`);
    if (agreedPrice)          bodyParts.push(`💰 ${agreedPrice} ج.م/ساعة`);
    if (estimatedMinutes > 0) bodyParts.push(`⏱️ ${estimatedMinutes} دقيقة`);

    // ✅ tag ثابت - مش بيتغير مع كل ضغطة
    // نفس العربية = نفس الـ tag = upsert بدل insert
    const immediateTag = `incoming-${carPlate}`;
    const scheduledTag = `approaching-${carPlate}`;

    const scheduledSendAt = new Date(
      Date.now() + (estimatedMinutes - 2) * 60 * 1000
    ).toISOString();

    const payload: SendPushPayload = {
      garageId,

      immediate: {
        title: '🚨 سيارة في الطريق!',
        body:  bodyParts.join(' | '),
        tag:   immediateTag,
        data: {
          type:             'incoming_car',
          carPlate,
          garageId,
          url:              '/garage/dashboard',
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
                url:      '/garage/dashboard',
              },
              sendAt: scheduledSendAt,
            }
          : null,
    };

    console.log('📤 إرسال Push | garage:', garageId, '| car:', carPlate, '| tag:', immediateTag);

    const result = await supabaseFetch('send-push-notification', payload);

    if (!result.ok) {
      console.error('❌ فشل إرسال Push:', result.error);
      return false;
    }

    console.log('✅ Push sent successfully for:', carPlate);
    return true;

  } catch (err) {
    console.error('❌ خطأ في sendCarComingPush:', err);
    return false;
  }
};

// ─── إلغاء التنبيه المجدول ──────────────────────────────────────
export const cancelScheduledPush = async (
  garageId: string,
  carPlate: string
): Promise<boolean> => {
  try {
    const result = await supabaseFetch('cancel-scheduled-alert', {
      garageId,
      carPlate,
      tags:        [`approaching-${carPlate}`], // ✅ محدد
      cancelledAt: new Date().toISOString(),
    });

    if (!result.ok) {
      console.error('❌ فشل إلغاء التنبيه:', result.error);
      return false;
    }

    console.log('✅ Scheduled alert cancelled for:', carPlate);
    return true;

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
      // ✅ أبلغ السيرفر قبل الإلغاء
      await supabaseFetch('save-push-subscription', {
        subscription: null,
        garageId:     null,
        action:       'unsubscribe',
        endpoint:     subscription.endpoint,
      });

      await subscription.unsubscribe();
      console.log('✅ تم إلغاء الاشتراك');
      return true;
    }

    console.log('ℹ️ لا يوجد subscription للإلغاء');
    return false;

  } catch (err) {
    console.error('❌ خطأ في unsubscribeFromPush:', err);
    return false;
  }
};

// ─── التحقق من حالة الاشتراك ────────────────────────────────────
export const checkPushSubscriptionStatus = async (): Promise<{
  isSubscribed: boolean;
  permission:   NotificationPermission;
  isSupported:  boolean;
  endpoint?:    string;
  isExpired?:   boolean;
}> => {
  const isSupported =
    'serviceWorker' in navigator &&
    'PushManager'   in window    &&
    'Notification'  in window;

  if (!isSupported) {
    return { isSubscribed: false, permission: 'denied', isSupported: false };
  }

  const permission = Notification.permission;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      return { isSubscribed: false, permission, isSupported };
    }

    const expirationTime = subscription.expirationTime;
    const isExpired      = expirationTime ? Date.now() > expirationTime : false;

    return {
      isSubscribed: true,
      permission,
      isSupported,
      endpoint:  subscription.endpoint,
      isExpired,
    };

  } catch {
    return { isSubscribed: false, permission, isSupported };
  }
};

// ─── تجديد الاشتراك تلقائياً ────────────────────────────────────
export const refreshPushSubscriptionIfNeeded = async (
  garageId: string
): Promise<void> => {
  const status = await checkPushSubscriptionStatus();

  if (!status.isSupported)             return;
  if (status.permission !== 'granted') return;

  // ✅ جدد لو منتهية أو مش موجودة
  if (!status.isSubscribed || status.isExpired) {
    console.log('🔄 تجديد Push subscription...');
    await subscribeToPush(garageId);
    return;
  }

  // ✅ حتى لو موجودة، تأكد إنها مسجلة في DB
  // مفيد بعد الـ app update أو لو DB اتمسح
  console.log('✅ Subscription سليمة:', status.endpoint?.substring(0, 50) + '...');
};