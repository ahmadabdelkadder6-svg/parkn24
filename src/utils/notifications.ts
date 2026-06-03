// src/utils/notifications.ts

/**
 * ✅ نظام التنبيهات الصوتية والاهتزاز
 */

// ─── تشغيل صوت التنبيه ────────────────────────────────────────────────────
let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
};

// ✅ صوت تنبيه قوي (بدون ملف صوتي - بيتولّد برمجياً)
export const playAlertSound = (repeat = 3) => {
  try {
    const ctx = getAudioContext();
    
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
      oscillator.stop(ctx.currentTime + delay + duration);
    };

    // ✅ 3 نغمات صاعدة (زي رنة تليفون)
    for (let i = 0; i < repeat; i++) {
      const baseDelay = i * 0.8;
      playBeep(baseDelay, 800, 0.15);
      playBeep(baseDelay + 0.2, 1000, 0.15);
      playBeep(baseDelay + 0.4, 1200, 0.2);
    }
  } catch (err) {
    console.warn('⚠️ لا يمكن تشغيل الصوت:', err);
  }
};

// ✅ صوت تنبيه عاجل (أقوى)
export const playUrgentSound = () => {
  try {
    const ctx = getAudioContext();
    
    for (let i = 0; i < 5; i++) {
      const delay = i * 0.4;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sawtooth';
      // تتأرجح بين نغمتين
      osc.frequency.value = i % 2 === 0 ? 1000 : 1400;
      
      gain.gain.setValueAtTime(0.6, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        ctx.currentTime + delay + 0.3
      );
      
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.35);
    }
  } catch (err) {
    console.warn('⚠️ لا يمكن تشغيل الصوت:', err);
  }
};

// ─── اهتزاز الجهاز ────────────────────────────────────────────────────────
export const vibrateDevice = (pattern?: number[]) => {
  try {
    if ('vibrate' in navigator) {
      // ✅ نمط اهتزاز قوي: اهتزاز - توقف - اهتزاز - توقف - اهتزاز
      const defaultPattern = [
        300, 100, 300, 100, 500, 200,
        300, 100, 300, 100, 500,
      ];
      navigator.vibrate(pattern || defaultPattern);
      return true;
    }
    return false;
  } catch (err) {
    console.warn('⚠️ الاهتزاز غير مدعوم:', err);
    return false;
  }
};

// ✅ اهتزاز عاجل (أطول وأقوى)
export const vibrateUrgent = () => {
  return vibrateDevice([
    500, 100, 500, 100, 500, 200,
    500, 100, 500, 100, 500, 200,
    800, 200, 800,
  ]);
};

// ─── إيقاف الاهتزاز ──────────────────────────────────────────────────────
export const stopVibration = () => {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(0);
    }
  } catch {}
};

// ─── تنبيه كامل (صوت + اهتزاز) ──────────────────────────────────────────
export const fireFullAlert = () => {
  playUrgentSound();
  vibrateUrgent();
};

// ─── تنبيه عادي ──────────────────────────────────────────────────────────
export const fireNormalAlert = () => {
  playAlertSound(2);
  vibrateDevice();
};

// ─── Push Notification ────────────────────────────────────────────────────

// ✅ طلب إذن الإشعارات
export const requestNotificationPermission = async (): Promise<boolean> => {
  try {
    if (!('Notification' in window)) {
      console.warn('⚠️ الإشعارات غير مدعومة');
      return false;
    }

    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (err) {
    console.error('❌ خطأ في طلب الإذن:', err);
    return false;
  }
};

// ✅ إرسال إشعار محلي
export const sendLocalNotification = (
  title: string,
  body: string,
  options?: {
    tag?: string;
    requireInteraction?: boolean;
    vibrate?: number[];
    icon?: string;
  }
) => {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const notification = new Notification(title, {
      body,
      icon: options?.icon || '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      tag: options?.tag || 'parknow-alert',
      requireInteraction: options?.requireInteraction ?? true,
      vibrate: options?.vibrate || [300, 100, 300, 100, 500],
      silent: false,
    });

    // ✅ لما يضغط على الإشعار - يفتح التطبيق
    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    // ✅ إغلاق تلقائي بعد 30 ثانية
    setTimeout(() => notification.close(), 30000);

    return notification;
  } catch (err) {
    console.error('❌ خطأ في إرسال الإشعار:', err);
  }
};

// ✅ إشعار سيارة قادمة
export const notifyIncomingCar = (
  carPlate: string,
  customerName?: string,
  agreedPrice?: number
) => {
  // 1) صوت + اهتزاز فوري
  fireFullAlert();

  // 2) Push Notification
  const body = [
    `🚗 ${carPlate}`,
    customerName ? `👤 ${customerName}` : '',
    agreedPrice ? `💰 ${agreedPrice} ج.م/ساعة` : '',
    '📍 اضغط للتفاصيل',
  ]
    .filter(Boolean)
    .join('\n');

  sendLocalNotification('🚨 سيارة في الطريق!', body, {
    tag: `incoming-${carPlate}`,
    requireInteraction: true,
    vibrate: [500, 100, 500, 100, 500, 200, 800],
  });

  // 3) تكرار الصوت بعد 5 ثواني لو ما فتحش
  const repeatTimer = setTimeout(() => {
    if (document.hidden) {
      playUrgentSound();
      vibrateUrgent();
    }
  }, 5000);

  // 4) تكرار تاني بعد 15 ثانية
  const repeatTimer2 = setTimeout(() => {
    if (document.hidden) {
      playAlertSound(2);
      vibrateDevice();
      sendLocalNotification('⏰ سيارة لسه في الطريق!', `🚗 ${carPlate} - محتاجة تأكيد`, {
        tag: `incoming-reminder-${carPlate}`,
        requireInteraction: true,
      });
    }
  }, 15000);

  return () => {
    clearTimeout(repeatTimer);
    clearTimeout(repeatTimer2);
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