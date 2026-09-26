// src/utils/notifications.ts

/**
 * 🌟 نظام التنبيهات الصوتية والإشعارات والاهتزاز لتطبيق Park'n 24
 * متوافق بالكامل مع هواتف Android, iPhone والحواسيب
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

// 🚨 أقصى وأقوى صوت إنذار أمني لكسر الدرع وحركة السيارة
export const playSecurityBreachAlarm = async () => {
  try {
    await unlockAudio();
    if (!audioCtx) return;

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    const masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(1.0, now);
    masterGain.connect(audioCtx.destination);

    // 8 نبضات إنذار طوارئ حادة وفائقة التردد (1400Hz و 2600Hz)
    for (let i = 0; i < 8; i++) {
      const start = now + (i * 0.22);
      const duration = 0.20;

      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const noteGain = audioCtx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'square';

      const freq = i % 2 === 0 ? 1400 : 2600;
      osc1.frequency.setValueAtTime(freq, start);
      osc2.frequency.setValueAtTime(freq * 1.25, start);

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
  } catch (err) {
    console.warn('⚠️ خطأ في تشغيل صوت إنذار الطوارئ:', err);
  }
};

// 🔊 صوت قدوم سيارة في الطريق للسايس
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

      gain.gain.setValueAtTime(0.8, audioCtx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + delay + 0.18);

      osc.start(audioCtx.currentTime + delay);
      osc.stop(audioCtx.currentTime + delay + 0.2);
    }
  } catch (err) {
    console.warn('⚠️ خطأ في تشغيل صوت التنبيه:', err);
  }
};

// 🔔 تنبيه عادي للعروض والتحديثات
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

// ─── 3. أنماط اهتزاز الهاتف ─────────────────────────────────────────────

// 📳 اهتزاز الطوارئ والسرقة الشديد
export const vibrateBreach = () => {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([
        1500, 100, 1500, 100, 1500, 100, // رنات قوية متتالية
        2000, 150, 2000                  // رنة ختامية
      ]);
      return true;
    }
  } catch {}
  return false;
};

// 📳 اهتزاز قدوم سيارة للسايس
export const vibrateUrgent = () => {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([
        800, 200, 800, 200, 800, 200,
        1000, 300, 1000
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

    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          await reg.showNotification(title, options);
          return;
        }
      } catch {}
    }

    new Notification(title, options);
  } catch (err) {
    console.warn('⚠️ تعذر إظهار الإشعار في النظام:', err);
  }
};

// ─── 6. دوال التنبيهات المجمعة المباشرة ──────────────────────────────────

// 🚨 إنذار اختراق درع الأمان وسرقة السيارة
export const notifySecurityBreach = (carPlate: string, slotId?: string, reason?: string) => {
  playSecurityBreachAlarm();
  vibrateBreach();

  const slotText = slotId ? ` بالمربع [${slotId}]` : '';
  const reasonText = reason ? ` • ${reason}` : ' • استعد لإيقاف البوابة فوراً!';

  sendLocalNotification(
    `🚨 إنذار سرقة: تحرك سيارة${slotText}!`,
    `🚗 لوحة السيارة: ${carPlate}${reasonText}`,
    `breach-${carPlate}-${Date.now()}`
  );
};

// 🚗 تنبيه قدوم سيارة للسايس
export const notifyIncomingCar = (carPlate: string) => {
  playUrgentSound();
  vibrateUrgent();
  sendLocalNotification(
    '🚨 سيارة في الطريق إليك!',
    `🚗 رقم اللوحة: ${carPlate} • استعد للاستقبال فوراً!`,
    `incoming-${carPlate}`
  );
};

// 💰 تنبيه عرض سعر جديد
export const notifyNewOffer = (carPlate: string, price: number) => {
  playNormalAlert();
  vibrateDevice([400, 150, 400]);
  sendLocalNotification(
    '💰 عرض سعر جديد!',
    `🚗 السيارة ${carPlate} - عرضت: ${price} ج.م/ساعة`,
    `offer-${carPlate}`
  );
};