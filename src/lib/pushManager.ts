// ─── VAPID Public Key ─────────────────────────────────────────────────────────
const VAPID_PUBLIC_KEY =
  'BOuP_HFhSSjHMsjf4KZJYLaFTv3RdI20Ux3an5LriaTBUN0iGlW-38zYGvROp26k7jcqhC_XpUotxzLR1IjQTI4';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ─── تحويل VAPID Key ──────────────────────────────────────────────────────────
const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)));
};

// ─── تسجيل Service Worker ─────────────────────────────────────────────────────
export const registerServiceWorker =
  async (): Promise<ServiceWorkerRegistration | null> => {
    if (!('serviceWorker' in navigator)) {
      console.warn('❌ Service Worker غير مدعوم في هذا المتصفح');
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });

      console.log('✅ Service Worker registered:', registration.scope);

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              console.log('🔄 نسخة جديدة من التطبيق متاحة');
            }
          });
        }
      });

      return registration;
    } catch (err) {
      console.error('❌ فشل تسجيل Service Worker:', err);
      return null;
    }
  };

// ─── الاشتراك في Push Notifications ──────────────────────────────────────────
// ✅ كل جهاز يتسجل للجراج الواحد بتاعه بس
export const subscribeToPush = async (
  garageId: string
): Promise<boolean> => {
  try {
    if (!('PushManager' in window)) {
      console.warn('❌ Push Notifications غير مدعومة');
      return false;
    }

    const registration = await registerServiceWorker();
    if (!registration) return false;

    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('❌ المستخدم رفض إذن الإشعارات');
      return false;
    }

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      console.log('✅ Push subscription created');
    } else {
      console.log('✅ Push subscription already exists');
    }

    const sub = subscription.toJSON();

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/save-push-subscription`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          subscription: {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.keys?.p256dh,
              auth: sub.keys?.auth,
            },
          },
          garageId,
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('❌ فشل حفظ الـ subscription:', err);
      return false;
    }

    console.log('✅ Push subscription saved for garage:', garageId);
    return true;
  } catch (err) {
    console.error('❌ خطأ في الاشتراك في Push:', err);
    return false;
  }
};

// ─── إرسال تنبيه "سيارة في الطريق" ──────────────────────────────────────────
// ✅ يتبعت بعد انتهاء فترة الإلغاء (من NavigationScreen)
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
}): Promise<void> => {
  try {
    const bodyParts: string[] = [`🚗 ${carPlate}`];
    if (agreedPrice) bodyParts.push(`💰 ${agreedPrice} ج.م/ساعة`);

    const payload = {
      garageId,

      // ✅ تنبيه 1: فوري
      immediate: {
        title: '🚨 سيارة في الطريق!',
        body: bodyParts.join(' | '),
        tag: `incoming-${carPlate}-${Date.now()}`,
        data: {
          type: 'incoming_car',
          carPlate,
          garageId,
          url: '/',
        },
      },

      // ✅ تنبيه 2: مجدول قبل الوصول بدقيقتين
      // لو estimatedMinutes = 0 (عند الوصول) → مش بنجدول تنبيه ثاني
      scheduled:
        estimatedMinutes > 2
          ? {
              title: '⏰ سيارة على وشك الوصول!',
              body: `🚗 ${carPlate} - باقي أقل من دقيقتين ⏰`,
              tag: `approaching-${carPlate}-${Date.now()}`,
              data: {
                type: 'approaching_car',
                carPlate,
                garageId,
                url: '/',
              },
              sendAt: new Date(
                Date.now() + (estimatedMinutes - 2) * 60 * 1000
              ).toISOString(),
            }
          : null,
    };

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/send-push-notification`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('❌ فشل إرسال Push:', err);
      return;
    }

    console.log('✅ Push notification sent for:', carPlate);
  } catch (err) {
    console.error('❌ خطأ في إرسال Push:', err);
  }
};

// ─── ✅ إلغاء التنبيه المجدول (لما العميل يلغي الحجز) ────────────────────────
export const cancelScheduledPush = async (
  garageId: string,
  carPlate: string
): Promise<void> => {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/cancel-scheduled-alert`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ garageId, carPlate }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('❌ فشل إلغاء التنبيه المجدول:', err);
      return;
    }

    console.log('✅ Scheduled alert cancelled for:', carPlate);
  } catch (err) {
    console.error('❌ خطأ في إلغاء التنبيه المجدول:', err);
  }
};

// ─── إلغاء الاشتراك (اختياري) ────────────────────────────────────────────────
export const unsubscribeFromPush = async (): Promise<boolean> => {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      console.log('✅ تم إلغاء الاشتراك في Push');
      return true;
    }

    return false;
  } catch (err) {
    console.error('❌ خطأ في إلغاء الاشتراك:', err);
    return false;
  }
};

// ─── التحقق من حالة الاشتراك ─────────────────────────────────────────────────
export const checkPushSubscriptionStatus = async (): Promise<{
  isSubscribed: boolean;
  permission: NotificationPermission;
  isSupported: boolean;
}> => {
  const isSupported =
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  if (!isSupported) {
    return { isSubscribed: false, permission: 'denied', isSupported: false };
  }

  const permission = Notification.permission;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    return {
      isSubscribed: !!subscription,
      permission,
      isSupported,
    };
  } catch {
    return { isSubscribed: false, permission, isSupported };
  }
};