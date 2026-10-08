// src/utils/notifications.ts

/**
 * 🌟 نظام التنبيهات الصوتية والإشعارات والاهتزاز لتطبيق Park'n 24
 * موفر فائق للبطارية ومتوافق بالكامل مع هواتف Android, iPhone والحواسيب
 */

let audioCtx: AudioContext | null = null;
let isAudioUnlocked = false;
let audioSuspendTimeout: ReturnType<typeof setTimeout> | null = null;

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

// 🔋 دالة ذكية لتعليق محرك الصوت بعد انتهاء النغمة لتوفير طاقة المعالج والبطارية
const scheduleAudioSuspend = () => {
  if (audioSuspendTimeout) clearTimeout(audioSuspendTimeout);
  audioSuspendTimeout = setTimeout(() => {
    if (audioCtx && audioCtx.state === 'running') {
      audioCtx.suspend().catch(() => {});
    }
  }, 3000);
};

// ─── 2. نغمات التنبيه (توليد إلكتروني نقي فائق القوة لاختراق الضوضاء) ──────
export const playUrgentSound = async () => {
  try {
    await unlockAudio();
    if (!audioCtx) return;

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const now = audioCtx.currentTime;

    // رفع الصوت لأقصى طاقة 100%
    const masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(1.0, now);
    masterGain.connect(audioCtx.destination);

    // 6 نبضات إنذار حادة وسريعة بنظام المولد المزدوج
    for (let i = 0; i < 6; i++) {
      const start = now + (i * 0.22);
      const duration = 0.19;

      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const noteGain = audioCtx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'square';

      // ترددات حادة وقوية لاختراق الضوضاء (1200Hz و 2400Hz)
      const freq = i % 2 === 0 ? 1200 : 2400;
      osc1.frequency.setValueAtTime(freq, start);
      osc2.frequency.setValueAtTime(freq * 1.2, start);

      noteGain.gain.setValueAtTime(1.0, start);
      noteGain.gain.exponentialRampToValueAtTime(0.01, start + duration);

      osc1.connect(noteGain);
      osc2.connect(noteGain);
      noteGain.connect(masterGain);

      osc1.start(start);
      osc2.start(start);

      // تنظيف العقد الصوتية فور انتهاء النبضة
      osc1.stop(start + duration + 0.02);
      osc2.stop(start + duration + 0.02);
    }

    scheduleAudioSuspend();
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
    osc.frequency.setValueAtTime(650, audioCtx.currentTime);
    osc.frequency.setValueAtTime(950, audioCtx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.8, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);

    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.38);

    scheduleAudioSuspend();
  } catch (err) {
    console.warn('⚠️ خطأ في تشغيل التنبيه:', err);
  }
};

// ─── 3. اهتزاز الهاتف ───────────────────────────────────────────────────
export const vibrateUrgent = () => {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([
        1000, 200, 1000, 200, 1000, 200, // رنة 1
        1200, 300, 1200                  // رنة 2 تأكيدية
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

    // دعم Promise و Callback للتوافق مع كل المتصفحات
    return new Promise((resolve) => {
      try {
        const promise = Notification.requestPermission((permission) => {
          resolve(permission === 'granted');
        });
        if (promise) {
          promise.then((permission) => resolve(permission === 'granted')).catch(() => resolve(false));
        }
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
};

// ─── 5. إظهار الإشعار في شريط التنبيهات ───────────────────────────────────
export const sendLocalNotification = async (
  title: string,
  body: string,
  tag = 'valet-urgent-alarm',
  url = '/garage'
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
      vibrate: [1000, 300, 1000, 300, 1200],
      data: { url },
    };

    // إرسال عبر Service Worker (متوافق مع هواتف أندرويد و PWA)
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
    `incoming-${carPlate}`,
    '/garage'
  );
};

export const notifyNewOffer = (carPlate: string, price: number) => {
  playNormalAlert();
  vibrateDevice([400, 150, 400]);
  sendLocalNotification(
    '💰 عرض سعر جديد!',
    `🚗 السيارة ${carPlate} - عرضت: ${price} ج.م/ساعة`,
    `offer-${carPlate}`,
    '/garage'
  );
};