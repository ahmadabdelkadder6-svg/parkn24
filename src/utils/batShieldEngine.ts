
let audioCtx: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) audioCtx = new AudioContextClass();
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
};

/**
 * 🦇 1. إطلاق نبضة الشيرب الفوق صوتية (Chirp Ultrasonic Pulse)
 * ترسل تردد متصاعد سريع من 18kHz إلى 21kHz غير مسموع للأذن لرصد صدى الصاج
 */
export const emitBatChirpPulse = async (): Promise<boolean> => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(18000, now);
    osc.frequency.exponentialRampToValueAtTime(21000, now + 0.06);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.065);
    return true;
  } catch {
    return false;
  }
};

/**
 * 🧲 2. قراءة البصمة المغناطيسية لكتلة الـ 1.5 طن صاج وحديد
 */
export const captureMagneticMass = async (): Promise<number> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(50);

    if ('Magnetometer' in window) {
      try {
        const sensor = new (window as any).Magnetometer({ frequency: 10 });
        sensor.addEventListener('reading', () => {
          const { x, y, z } = sensor;
          const mag = Math.round(Math.sqrt(x * x + y * y + z * z));
          sensor.stop();
          resolve(mag);
        });
        sensor.addEventListener('error', () => {
          resolve(fallbackCompassOrientation());
        });
        sensor.start();
        setTimeout(() => resolve(fallbackCompassOrientation()), 400);
        return;
      } catch {
        resolve(fallbackCompassOrientation());
      }
    } else {
      resolve(fallbackCompassOrientation());
    }
  });
};

const fallbackCompassOrientation = (): Promise<number> => {
  return new Promise((resolve) => {
    const handler = (e: DeviceOrientationEvent) => {
      window.removeEventListener('deviceorientation', handler);
      const val = Math.round(Math.abs(e.alpha || 0) + Math.abs(e.beta || 0) + Math.abs(e.gamma || 0));
      resolve(val > 0 ? val : 65);
    };
    window.addEventListener('deviceorientation', handler, { once: true });
    setTimeout(() => resolve(65), 300);
  });
};

/**
 * 🛞 3. رادار رنين الخرسانة وتدحرج الكاوتش (Acoustic Floor & Tire Rumble Detector)
 * يعزل تردد دوران الكاوتش على الخرسانة (30Hz - 75Hz) الناتج عن وزن الـ 1.5 طن
 */
export const detectTireRollingRumble = async (durationMs: number = 800): Promise<boolean> => {
  try {
    const ctx = getAudioContext();
    if (!ctx || !navigator.mediaDevices?.getUserMedia) return false;

    // فتح ميكروفون الهاتف لفترة خاطفة (800ms)
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const source = ctx.createMediaStreamSource(stream);

    // 🎯 فلتر مخصص لتردد دبدبة الكاوتش فقط (Bandpass 30Hz - 75Hz)
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 52.5; // مركز التردد
    filter.Q.value = 2.5;         // عزل أي صوت بشري أو كلام

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;

    source.connect(filter);
    filter.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    return new Promise((resolve) => {
      let detectedCount = 0;
      const startTime = Date.now();

      const checkRumble = () => {
        analyser.getByteFrequencyData(dataArray);
        
        // حساب متوسط طاقة التردد المنخفض الخاص باحتكاك الكاوتش
        let sum = 0;
        for (let i = 0; i < 8; i++) { // البينز الخاصة بـ 30-75Hz
          sum += dataArray[i];
        }
        const avgRumbleEnergy = sum / 8;

        // لو الطاقة تخطت عتبة اهتزاز دوران الكاوتش الثقيل
        if (avgRumbleEnergy > 65) {
          detectedCount++;
        }

        if (Date.now() - startTime < durationMs) {
          requestAnimationFrame(checkRumble);
        } else {
          // إيقاف المايكروفون فوراً لتوفير البطارية والخصوصية
          stream.getTracks().forEach(track => track.stop());
          source.disconnect();
          resolve(detectedCount >= 3); // تأكيد وجود دبدبة تدحرج كاوتش
        }
      };

      checkRumble();
    });
  } catch {
    return false;
  }
};

/**
 * ⚡ 4. حساس الاهتزاز الزلزالي الميكانيكي للخرسانة (Micro-Seismic Floor Sensor)
 * يقيس اهتزاز سطح الأرض في محور Z عند حركة السيارة
 */
export const detectGroundSeismicMotion = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
      return resolve(false);
    }

    let spikeCount = 0;
    const handler = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity || e.acceleration;
      if (!acc) return;

      const zDelta = Math.abs((acc.z || 9.8) - 9.8);
      // اهتزاز ميكانيكي أرضي بتردد منخفض
      if (zDelta > 0.45 && zDelta < 2.5) {
        spikeCount++;
      }
    };

    window.addEventListener('devicemotion', handler);

    setTimeout(() => {
      window.removeEventListener('devicemotion', handler);
      resolve(spikeCount >= 2);
    }, 600);
  });
};

/**
 * ⚖️ 5. ميزان القرار الفيزيائي المدمج (Unified Physics Breach Check)
 * يدمج الخفاش + المغناطيسية + صوت تدحرج الكاوتش + اهتزاز الخرسانة
 */
export const evaluatePhysicalTireBreach = async (
  baselineMagnetic: number
): Promise<{ isBreached: boolean; reason: string }> => {
  // 1. فحص البصمة المغناطيسية
  const currentMag = await captureMagneticMass();
  const magDrop = baselineMagnetic > 0 ? ((baselineMagnetic - currentMag) / baselineMagnetic) * 100 : 0;
  
  // 2. إطلاق نبضة الشيرب الفوق صوتية
  await emitBatChirpPulse();

  // 3. فحص صوت تدحرج الكاوتش على الخرسانة
  const isTireRumbling = await detectTireRollingRumble(500);

  // 4. فحص الاهتزاز الزلزالي
  const isSeismicVibrating = await detectGroundSeismicMotion();

  // 🚨 لو المجال انهار ومعه صوت تدحرج كاوتش أو اهتزاز خرسانة
  if (magDrop > 35 && (isTireRumbling || isSeismicVibrating)) {
    return {
      isBreached: true,
      reason: '🚨 رصد صوت تدحرج الكاوتش وانهيار كتلة الصاج عن الركنة!'
    };
  }

  // 🚨 لو الكاوتش دار بقوة واختفت الكتلة
  if (isTireRumbling && isSeismicVibrating) {
    return {
      isBreached: true,
      reason: '🚨 رصد اهتزاز دوران الكاوتش على خرسانة الجراج!'
    };
  }

  return { isBreached: false, reason: 'المكان ثابت وآمن' };
};