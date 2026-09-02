// src/utils/notifications.ts

/**
 * ✅ نظام التنبيهات الصوتية والاهتزاز الفائق للسايس
 */

// ─── تشغيل صوت التنبيه (Web Audio API) ──────────────────────────────────
let audioContext: AudioContext | null = null;

const getAudioContext = async (): Promise<AudioContext | null> => {
  try {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;
      audioContext = new AudioCtx();
    }
    // إيقاظ الصوت إذا كان المتصفح وضعه في وضع السكون
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    return audioContext;
  } catch (e) {
    console.warn('⚠️ تعذر تشغيل محرك الصوت:', e);
    return null;
  }
};

// ✅ صوت تنبيه عادي (نغمات صاعدة)
export const playAlertSound = async (repeat = 3) => {
  try {
    const ctx = await getAudioContext();
    if (!ctx) return;

    const playBeep = (delay: number, frequency: number, duration: number) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = 'square';
      oscillator.frequency.value = frequency;

      gainNode.gain.setValueAtTime(0.5, ctx.currentTime + delay);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        ctx.currentTime + delay + duration
      );

      oscillator.start(ctx.currentTime + delay);
      oscillator.stop(ctx.currentTime + delay + duration + 0.05);
    };

    for (let i = 0; i < repeat; i++) {
      const baseDelay = i * 0.7;
      playBeep(baseDelay, 800, 0.15);
      playBeep(baseDelay + 0.2, 1000, 0.15);
      playBeep(baseDelay + 0.4, 1200, 0.2);
    }
  } catch (err) {
    console.warn('⚠️ خطأ في تشغيل الصوت:', err);
  }
};

// ✅ صوت تنبيه عاجل قوي جداً (طوارئ وصول سيارة)
export const playUrgentSound = async () => {
  try {
    const ctx = await getAudioContext();
    if (!ctx) return;

    for (let i = 0; i < 6; i++) {
      const delay = i * 0.35;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sawtooth';
      osc.frequency.value = i % 2 === 0 ? 1000 : 1500;

      gain.gain.setValueAtTime(0.6, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        ctx.currentTime + delay + 0.25
      );

      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.3);
    }
  } catch (err) {
    console.warn('⚠️ خطأ في تشغيل صوت الطوارئ:', err);
  }
};

// ─── اهتزاز الجهاز (Vibration API) ─────────────────────────────────────────
export const vibrateDevice = (pattern?: number[]) => {
  try {
    if ('vibrate' in navigator) {
      const defaultPattern = [500, 150, 500, 150, 700];
      navigator.vibrate(pattern || defaultPattern);
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

// ✅ اهتزاز عاجل (نمط رنين مكالمة الهاتف)
export const vibrateUrgent = () => {
  return vibrateDevice([
    1000, 300, 1000, 300, 1000, 300, // رنة 1
    1000, 300, 1000, 300, 1000, 300  // رنة 2
  ]);
};

// ─── إيقاف الاهتزاز ───────────────────────────────────────────────────────
export const stopVibration = () => {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(0);
    }
  } catch {}
};

// ─── تنبيه كامل (صوت + اهتزاز) ───────────────────────────────────────────
export const fireFullAlert = () => {
  playUrgentSound();
  vibrateUrgent();
};

export const fireNormalAlert = () => {
  playAlertSound(2);
  vibrateDevice();
};

// ─── طلب إذن الإشعارات ────────────────────────────────────────────────────
export const requestNotificationPermission = async (): Promise<boolean> => {
  try {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch {
    return false;
  }
};

// ─── إرسال إشعار محلي آمن متوافق مع هواتف أندرويد وChrome ────────────────
export const sendLocalNotification = async (
  title: string,
  body: string,
  options?: {
    tag?: string;
    requireInteraction?: boolean;
    vibrate?: number[];
    icon?: string;
    data?: Record<string, unknown>;
  }
) => {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const notificationOptions: NotificationOptions = {
      body,
      icon: options?.icon || '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      tag: options?.tag || 'valet-urgent-alarm',
      requireInteraction: options?.requireInteraction ?? true,
      renotify: true,
      vibrate: options?.vibrate || [1000, 300, 1000, 300, 1000, 300],
      data: options?.data || { url: '/garage' },
    };

    // 🛡️ [الحل الجذري لهواتف أندرويد]: استخدام ServiceWorkerRegistration لإظهار الإشعار بدون خطأ
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          await reg.showNotification(title, notificationOptions);
          return;
        }
      } catch (e) {
        console.warn('ServiceWorker notification fallback to window Notification:', e);
      }
    }

    // Fallback للأجهزة المكتبية القديمة
    const n = new Notification(title, notificationOptions);
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (err) {
    console.error('❌ فشل إرسال الإشعار المحلي:', err);
  }
};

// ✅ إشعار سيارة قادمة للجراج
export const notifyIncomingCar = (
  carPlate: string,
  customerName?: string,
  agreedPrice?: number
) => {
  // 1. تشغيل الصوت والاهتزاز اللحظي
  fireFullAlert();

  // 2. إرسال الإشعار لشاشة الهاتف
  const body = `🚗 لوحة السيارة: ${carPlate} • استعد للاستقبال فوراً!`;

  sendLocalNotification('🚨 سيارة في الطريق إليك!', body, {
    tag: `incoming-${carPlate}`,
    requireInteraction: true,
    vibrate: [1000, 300, 1000, 300, 1000, 300],
    data: { url: '/garage', carPlate },
  });

  // 3. رنة تذكيرية إضافية بعد 6 ثوانٍ لو السايس لم يفتح الشاشة
  const repeatTimer = setTimeout(() => {
    if (document.hidden) {
      playUrgentSound();
      vibrateUrgent();
    }
  }, 6000);

  return () => {
    clearTimeout(repeatTimer);
  };
};

// ✅ إشعار عرض سعر جديد
export const notifyNewOffer = (carPlate: string, price: number) => {
  fireNormalAlert();
  sendLocalNotification('💰 عرض سعر جديد!', `🚗 ${carPlate} - ${price} ج.م/ساعة`, {
    tag: `offer-${carPlate}`,
    requireInteraction: true,
  });
};