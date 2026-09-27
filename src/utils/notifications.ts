// src/utils/notifications.ts

/**
 * 🌟 نظام التنبيهات الصوتية والإشعارات والاهتزاز لتطبيق Park'n 24
 * متوافق بالكامل مع هواتف Android, iPhone والحواسيب
 * مدمج مع درع الأمان VIP وصفارة الطوارئ 2600Hz
 */

let audioCtx: AudioContext | null = null;
let isAudioUnlocked = false;

// ─── 1. فك قفل محرك الصوت من أول لمسة على الشاشة ─────────────────────────
export const unlockAudio = async () => {
  if (isAudioUnlocked && audioCtx && audioCtx.state === 'running') return;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    // تشغيل نبضة صامتة لتفعيل الصوت في المتصفح
    const buffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(0);

    isAudioUnlocked = true;
  } catch (e) {
    console.warn('⚠️ تعذر تفعيل محرك الصوت:', e);
  }
};

// فك القفل تلقائياً مع أول لمسة للمستخدم
if (typeof window !== 'undefined') {
  const unlockEvents = ['touchstart', 'touchend', 'mousedown', 'keydown', 'click'];
  const onFirstGesture = () => {
    unlockAudio();
    unlockEvents.forEach(evt => document.removeEventListener(evt, onFirstGesture));
  };
  unlockEvents.forEach(evt => document.addEventListener(evt, onFirstGesture, { passive: true }));
}

// ─── 2. نغمات التنبيه (توليد إلكتروني نقي بدون ملفات خارجية) ──────────────
export const playUrgentSound = async () => {
  try {
    await unlockAudio();
    if (!audioCtx) return;

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    // نغمة طوارئ ثنائية التردد (5 نبضات متتابعة)
    for (let i = 0; i < 5; i++) {
      const delay = i * 0.22;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(i % 2 === 0 ? 880 : 1320, audioCtx.currentTime + delay);

      gain.gain.setValueAtTime(0.7, audioCtx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + delay + 0.18);

      osc.start(audioCtx.currentTime + delay);
      osc.stop(audioCtx.currentTime + delay + 0.2);
    }
  } catch (err) {
    console.warn('⚠️ خطأ في تشغيل صوت الإنذار:', err);
  }
};

export const playNormalAlert = async () => {
  try {
    await unlockAudio();
    if (!audioCtx) return;

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.setValueAtTime(900, audioCtx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);

    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.38);
  } catch (err) {
    console.warn('⚠️ خطأ في تشغيل التنبيه:', err);
  }
};

// 🛡️ نغمة تفعيل درع الأمان VIP الفاخرة (نغمة تأكيد تكنولوجية متصاعدة)
export const playShieldActivationSound = async () => {
  try {
    await unlockAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    const notes = [523.25, 659.25, 783.99, 1046.50]; // نغمات موسيقية تأكيدية
    notes.forEach((freq, index) => {
      if (!audioCtx) return;
      const delay = index * 0.08;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);

      gain.gain.setValueAtTime(0.4, audioCtx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + 0.15);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(audioCtx.currentTime + delay);
      osc.stop(audioCtx.currentTime + delay + 0.16);
    });
  } catch (e) {
    console.warn('⚠️ خطأ في صوت تفعيل الدرع:', e);
  }
};

// 🚨 صفارة إنذار اختراق الدرع الحادة (2600Hz Sawtooth Alarm)
export const playShieldBreachSiren = async () => {
  try {
    await unlockAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    for (let i = 0; i < 8; i++) {
      const delay = i * 0.18;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(i % 2 === 0 ? 2600 : 1300, audioCtx.currentTime + delay);

      gain.gain.setValueAtTime(0.8, audioCtx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + delay + 0.15);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(audioCtx.currentTime + delay);
      osc.stop(audioCtx.currentTime + delay + 0.17);
    }
  } catch (e) {
    console.warn('⚠️ خطأ في صفارة الاختراق:', e);
  }
};

// ─── 3. اهتزاز الهاتف ───────────────────────────────────────────────────
export const vibrateUrgent = () => {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([
        800, 200, 800, 200, 800, 200, // رنة 1
        1000, 300, 1000               // رنة 2
      ]);
      return true;
    }
  } catch {}
  return false;
};

export const vibrateDevice = (pattern: number[] = [500, 150, 500]) => {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
      return true;
    }
  } catch {}
  return false;
};

export const stopVibration = () => {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(0);
    }
  } catch {}
};

// ─── 4. طلب إذن الإشعارات ───────────────────────────────────────────────
export const requestNotificationPermission = async (): Promise<boolean> => {
  try {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;

    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
};

// ─── 5. إظهار الإشعار في شريط التنبيهات ───────────────────────────────────
export const sendLocalNotification = async (
  title: string,
  body: string,
  tag = 'valet-urgent-alarm'
) => {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const options: NotificationOptions = {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      tag,
      requireInteraction: true,
      renotify: true,
      vibrate: [800, 200, 800, 200, 1000],
      data: { url: '/garage' },
    };

    // إرسال عبر Service Worker (متوافق مع أندرويد)
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          await reg.showNotification(title, options);
          return;
        }
      } catch {}
    }

    // Fallback للحواسيب
    new Notification(title, options);
  } catch (err) {
    console.warn('⚠️ تعذر إظهار الإشعار في النظام:', err);
  }
};

// ─── 6. التنبيهات المجمعة المباشرة ──────────────────────────────────────
export const notifyIncomingCar = (carPlate: string) => {
  playUrgentSound();
  vibrateUrgent();
  sendLocalNotification(
    '🚨 سيارة في الطريق إليك!',
    `🚗 رقم اللوحة: ${carPlate} • استعد للاستقبال فوراً!`,
    `incoming-${carPlate}`
  );
};

export const notifyNewOffer = (carPlate: string, price: number) => {
  playNormalAlert();
  vibrateDevice([400, 150, 400]);
  sendLocalNotification(
    '💰 عرض سعر جديد!',
    `🚗 السيارة ${carPlate} - عرضت: ${price} ج.م/ساعة`,
    `offer-${carPlate}`
  );
};

// 🛡️ تنبيه تفعيل درع الأمان VIP بنجاح
export const notifyShieldActivated = (carPlate: string) => {
  playShieldActivationSound();
  vibrateDevice([100, 50, 100]);
  sendLocalNotification(
    '🛡️ تم تفعيل درع الأمان VIP بنجاح',
    `🚗 سيارتك [${carPlate}] تحت حماية الرادار الفيزيائي والمغناطيسي والسياج الجغرافي.`,
    `shield-${carPlate}`
  );
};

// 🚨 بروتوكول إنذار الاختراق والسرقة اللحظي
export const notifyShieldBreach = (carPlate: string, reason: string) => {
  playShieldBreachSiren();
  vibrateUrgent();
  sendLocalNotification(
    '🚨 إنذار أمني: تحرك أو محاولة سرقة!',
    `🚗 السيارة [${carPlate}]: ${reason}`,
    `breach-${carPlate}`
  );
};

// ⚠️ تنبيه اقتراب السيارة من حدود سياج الجراج 250م
export const notifyGeofenceWarning = (carPlate: string, distanceMeters: number) => {
  playNormalAlert();
  vibrateDevice([300, 100, 300]);
  sendLocalNotification(
    '⚠️ تنبيه السياج الجغرافي',
    `🚗 السيارة [${carPlate}] على بُعد ${distanceMeters}م من حدود الجراج.`,
    `geofence-${carPlate}`
  );
};