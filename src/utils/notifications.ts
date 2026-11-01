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

// ─── 2. نغمات التنبيه (سيرين حاد متعدد الطبقات — أقصى قوة) ──────────────
export const playUrgentSound = async () => {
  try {
    await unlockAudio();
    if (!audioCtx) return;

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const now = audioCtx.currentTime;

    // ماستر جين بأقصى حجم 100%
    const masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(1.0, now);
    masterGain.connect(audioCtx.destination);

    // طبقة 1: 8 نبضات square+sawtooth حادة (880 ↔ 1100 ↔ 1320)
    const freqs = [880, 1100, 880, 1100, 1320, 1100, 880, 1320];
    for (let i = 0; i < freqs.length; i++) {
      const start = now + i * 0.18;
      const duration = 0.16;

      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const noteGain = audioCtx.createGain();

      osc1.type = 'square';
      osc2.type = 'sawtooth';

      osc1.frequency.setValueAtTime(freqs[i], start);
      osc2.frequency.setValueAtTime(freqs[i] * 1.5, start); // هارموني أعلى لاختراق الضوضاء

      noteGain.gain.setValueAtTime(1.0, start);
      noteGain.gain.exponentialRampToValueAtTime(0.01, start + duration);

      osc1.connect(noteGain);
      osc2.connect(noteGain);
      noteGain.connect(masterGain);

      osc1.start(start);
      osc2.start(start);
      osc1.stop(start + duration + 0.02);
      osc2.stop(start + duration + 0.02);
    }

    // طبقة 2: صافرة مستمرة قصيرة فوق النبضات (piercing siren sweep)
    const sirenOsc = audioCtx.createOscillator();
    const sirenGain = audioCtx.createGain();
    sirenOsc.type = 'square';
    sirenOsc.frequency.setValueAtTime(900, now);
    sirenOsc.frequency.linearRampToValueAtTime(1600, now + 0.7);
    sirenOsc.frequency.linearRampToValueAtTime(900, now + 1.4);
    sirenGain.gain.setValueAtTime(0.45, now);
    sirenGain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);
    sirenOsc.connect(sirenGain);
    sirenGain.connect(masterGain);
    sirenOsc.start(now);
    sirenOsc.stop(now + 1.52);

    // طبقة 3: تكرار سريع بعد 1.6 ثانية (موجة تانية)
    const now2 = now + 1.6;
    const freqs2 = [880, 1100, 880, 1320];
    for (let i = 0; i < freqs2.length; i++) {
      const start = now2 + i * 0.2;
      const duration = 0.18;

      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const noteGain = audioCtx.createGain();

      osc1.type = 'square';
      osc2.type = 'square';

      osc1.frequency.setValueAtTime(freqs2[i], start);
      osc2.frequency.setValueAtTime(freqs2[i] * 2, start); // أوكتاف أعلى

      noteGain.gain.setValueAtTime(1.0, start);
      noteGain.gain.exponentialRampToValueAtTime(0.01, start + duration);

      osc1.connect(noteGain);
      osc2.connect(noteGain);
      noteGain.connect(masterGain);

      osc1.start(start);
      osc2.start(start);
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

// ─── 3. اهتزاز الهاتف (رشقات طويلة وقوية) ──────────────────────────────
export const vibrateUrgent = () => {
  try {
    if ('vibrate' in navigator) {
      // رشقات طويلة متتالية — أقوى من النمط العادي
      navigator.vibrate([
        500, 200, 500, 200, 500, 200, // ثلاث رشقات متوسطة
        800, 300, 800, 300,           // رشقتين طويلتين
        500, 200, 500, 200, 500,      // ثلاث رشقات ختامية
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
  url = '/'
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
    '/'
  );
};

export const notifyNewOffer = (carPlate: string, price: number) => {
  playNormalAlert();
  vibrateDevice([400, 150, 400]);
  sendLocalNotification(
    '💰 عرض سعر جديد!',
    `🚗 السيارة ${carPlate} - عرضت: ${price} ج.م/ساعة`,
    `offer-${carPlate}`,
    '/'
  );
};