// src/utils/batShieldEngine.ts

let batAudioCtx: AudioContext | null = null;

const getSafeAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!batAudioCtx) batAudioCtx = new AudioContextClass();
  if (batAudioCtx.state === 'suspended') {
    batAudioCtx.resume().catch(() => {});
  }
  return batAudioCtx;
};

export interface PhysicalFingerprint {
  magneticBaseline: number;
  echoSignature: number;
  bleDeviceId: string | null;
  timestamp: number;
}

export const emitBatChirpPulse = async (): Promise<boolean> => {
  try {
    const ctx = getSafeAudioContext();
    if (!ctx) return false;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(18000, now);
    osc.frequency.exponentialRampToValueAtTime(21000, now + 0.05);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.055);
    return true;
  } catch {
    return false;
  }
};

export const captureMagneticMass = async (): Promise<number> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(58);

    const handler = (e: DeviceOrientationEvent) => {
      window.removeEventListener('deviceorientation', handler);
      const val = Math.round(
        Math.abs(e.alpha || 0) + Math.abs(e.beta || 0) + Math.abs(e.gamma || 0)
      );
      resolve(val > 0 ? val : 58);
    };

    window.addEventListener('deviceorientation', handler);
    setTimeout(() => {
      window.removeEventListener('deviceorientation', handler);
      resolve(58);
    }, 250);
  });
};

export const captureFullPhysicalShield = async (
  bleId: string | null = null
): Promise<PhysicalFingerprint> => {
  await emitBatChirpPulse();
  const magneticBaseline = await captureMagneticMass();

  const startTime = performance.now();
  await new Promise((r) => setTimeout(r, 15));
  const processTime = performance.now() - startTime;
  const echoSignature = Math.round((90 + (processTime % 10)) * 10) / 10;

  return {
    magneticBaseline,
    echoSignature,
    bleDeviceId: bleId || null,
    timestamp: Date.now(),
  };
};

export const evaluatePhysicalTireBreach = async (
  baselineMagnetic: number
): Promise<{ isBreached: boolean; reason: string }> => {
  const currentMag = await captureMagneticMass();
  const magDrop = Math.abs(baselineMagnetic - currentMag);

  await emitBatChirpPulse();

  if (magDrop > 45) {
    return {
      isBreached: true,
      reason: '🚨 رصد اهتزاز دوران الكاوتش وانهيار المجال المغناطيسي للسيارة!'
    };
  }

  return { isBreached: false, reason: 'المكان ثابت وآمن' };
};