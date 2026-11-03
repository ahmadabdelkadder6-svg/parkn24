// src/lib/pushManager.ts - Bulletproof Push & Shield Subscription Manager

import { supabase } from './supabase';
import { normalizePlate } from '../store';

// ─── Configuration ─────────────────────────────────────────────
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

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

/**
 * استخراج رقم الهاتف ومعرف الجراج من جميع مصادر التخزين المتاحة
 */
const getStoredUserCredentials = (): { phone: string; garageId: string } => {
  let phone = '';
  let garageId = '';

  try {
    const cu = JSON.parse(localStorage.getItem('currentUser') || '{}');
    if (cu.phone) phone = cu.phone;
    if (cu.garageId || cu.garage_id) garageId = cu.garageId || cu.garage_id;

    if (!phone || !garageId) {
      const pu = JSON.parse(localStorage.getItem('parkn24_user') || '{}');
      if (!phone && pu.phone) phone = pu.phone;
      if (!garageId && (pu.garageId || pu.garage_id)) garageId = pu.garageId || pu.garage_id;
    }

    if (!phone) phone = localStorage.getItem('parkn24_phone') || '';
    if (!garageId) garageId = localStorage.getItem('parkn24_garage_id') || '';

    if (!garageId) {
      const pa = JSON.parse(localStorage.getItem('parkn24_pending_arrival') || '{}');
      if (pa.garageId || pa.garage_id) garageId = pa.garageId || pa.garage_id;
    }
  } catch (err) {
    console.warn('⚠️ Error reading local storage credentials:', err);
  }

  return { phone, garageId };
};

/**
 * دالة طلب السيرفر المحصنة الرسمية باستخدام Supabase SDK المباشر لتفادي 401
 */
const supabaseFetch = async (path: string, body: unknown): Promise<PushResult> => {
  try {
    const { data, error } = await supabase.functions.invoke(path, {
      body,
    });

    if (error) {
      console.warn(`[PushManager] Edge function '${path}' error:`, error);
      return { success: false, message: error.message || 'خطأ في السيرفر' };
    }

    return { success: true, message: 'تم بنجاح', data };
  } catch (err: any) {
    console.error(`[PushManager] Exception calling '${path}':`, err);
    return { success: false, message: err.message || 'فشل الاتصال بالسيرفر' };
  }
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
export const subscribeToPush = async (garageId?: string, userPhone?: string): Promise<PushResult> => {
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
        message: 'فعّل إشعارات المتصفح عشان الحماية تشتغل! 🔔' 
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

    const creds = getStoredUserCredentials();
    const phone = userPhone || creds.phone;
    const targetGarageId = garageId || creds.garageId;

    const result = await supabaseFetch('save-push-subscription', {
      subscription: {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      },
      garageId: targetGarageId,
      phone,
      userAgent: navigator.userAgent,
      subscribedAt: new Date().toISOString(),
    });

    if (result.success) {
      return { success: true, message: 'تم تفعيل الحماية بنجاح! 🛡️', data: { subscription: sub } };
    }
    return result;
  } catch (err) {
    console.error('❌ Exception in subscribeToPush:', err);
    return { success: false, message: 'حدث خطأ غير متوقع في الاشتراك' };
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

// ─── Shield Session (Server-Side Fake Alerts & Geofence Cron) ─
export const registerShieldSession = async (
  sessionId: string,
  parkingLat: number,
  parkingLng: number,
  userPhone?: string,
  garageId?: string
): Promise<PushResult> => {
  const creds = getStoredUserCredentials();
  const phone = userPhone || creds.phone;

  try {
    // امسح أي درع قديم لنفس الرقم (عدا الجلسة الحالية)
    await supabase
      .from('shield_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('phone', phone)
      .is('ended_at', null)
      .neq('session_id', sessionId);

    // حدّث الـ GPS للجلسة الحالية
    await supabase
      .from('shield_sessions')
      .update({
        last_gps_at: new Date().toISOString(),
        last_lat: parkingLat,
        last_lng: parkingLng,
      })
      .eq('session_id', sessionId)
      .is('ended_at', null);

    console.log('✅ Shield session synced');
    return { success: true, message: 'تم مزامنة الدرع' };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
};

export const unregisterShieldSession = async (
  sessionId: string
): Promise<PushResult> => {
  return await supabaseFetch('shield-register', {
    action: 'unregister',
    sessionId,
    session_id: sessionId,
  });
};