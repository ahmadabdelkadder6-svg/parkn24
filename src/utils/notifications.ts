// src/utils/notifications.ts

/**
 * 🌟 نظام التنبيهات الصوتية والإشعارات والاهتزاز لتطبيق Park'n 24
 * متوافق بالكامل مع هواتف Android, iPhone والحواسيب
 * مدمج به نظام صافرات إنذار درع الأمان ومكافحة السرقة 🛡️
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

// ─── 2. نغمات التنبيه والإنذار (توليد إلكتروني نقي) ─────────────────────────

// 🚨 صافرة إنذار السرقة واختراق درع الأمان (نغمات شرطة متصاعدة حادة لاختراق الضوضاء)
export const playTheftSirenSound = async () => {
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

    // صافرة إنذار مكررة لـ 6 دورات سريعة
    for (let i = 0; i < 6; i++) {
      const start = now + (i * 0.35);
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sawtooth';
      // تردد يتصاعد من 900Hz إلى 2400Hz في كل دورة
      osc.frequency.setValueAtTime(900, start);
      osc.frequency.linearRampToValueAtTime(2400, start + 0.3);

      gain.gain.setValueAtTime(0.8, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.32);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(start);
      osc.stop(start + 0.34);
    }
  } catch (err) {
    console.warn('⚠️ خطأ في تشغيل صافرة الإنذار:', err);
  }
};

// 🛡️ نغمة تأكيد تفعيل درع الرادار بنجاح
export const playShieldArmedSound = async () => {
  try {
    await unlockAudio();
    if (!audioCtx) return;

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  } catch (err) {
    console.warn('⚠️ خطأ في تشغيل صوت التأكيد:', err);
  }
};

// نغمة طوارئ سيارة في الطريق
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

// نغمة تنبيه عادية
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

// ─── 6. التنبيهات المجمعة المباشرة ──────────────────────────────────────

// 🚨 إنذار سرقة السيارة أو تحريكها
export const notifyTheftBreach = (carPlate: string, reason: string) => {
  playTheftSirenSound();
  vibrateDevice([1000, 200, 1000, 200, 1500]);
  sendLocalNotification(
    '🚨 إنذار سرقة عاجل لمركبتك!',
    `🚗 السيارة ${carPlate} • ${reason}`,
    `theft-${carPlate}`
  );
};

// 🛡️ إشعار تأكيد تفعيل درع الأمان بالرادار
export const notifyShieldActivated = (carPlate: string) => {
  playShieldArmedSound();
  vibrateDevice([150, 80, 150]);
  sendLocalNotification(
    '🛡️ تم تفعيل درع الأمان بالرادار',
    `🚗 السيارة ${carPlate} مؤمنة الآن على مدى 250 متراً`,
    `shield-${carPlate}`
  );
};

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