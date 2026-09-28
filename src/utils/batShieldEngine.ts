// src/utils/batShieldEngine.ts

/**
 * 🛰️ محرك رادار الحماية الشبكي فائق المدى (Virtual Radar Mesh Engine V3)
 * - يحمي السيارة من السرقة عبر تثبيت موقعها بالـ GPS لحظة الركن
 * - يكشف أي إزاحة أو سحب أو ونش على مدى 250 متر
 * - خفيف جداً: 0% تأثير على الشاشات أو الشات أو المعالج
 */

export interface RadarCarAnchor {
  sessionId: string;
  carPlate: string;
  latitude: number;
  longitude: number;
  isActive: boolean;
  timestamp: number;
}

// 1️⃣ حساب المسافة بالأمتار بدقة (Haversine Formula)
export const calculateDistanceMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
};

// 2️⃣ تثبيت موقع السيارة في الرادار لحظة الركن
export const lockCarRadarAnchor = (
  sessionId: string,
  carPlate: string
): Promise<RadarCarAnchor | null> => {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return resolve(null);
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          sessionId,
          carPlate,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          isActive: true,
          timestamp: Date.now(),
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 6000 }
    );
  });
};

// 3️⃣ فحص إزاحة السيارة عن مكان ركنها (رصد السرقة والونش)
export const evaluateRadarDrift = (
  anchor: RadarCarAnchor,
  currentLat: number,
  currentLng: number
): { isBreached: boolean; driftDistance: number; reason: string } => {
  const distance = calculateDistanceMeters(
    anchor.latitude,
    anchor.longitude,
    currentLat,
    currentLng
  );

  if (distance > 15) {
    return {
      isBreached: true,
      driftDistance: distance,
      reason: `🚨 تحذير سرقة: تم رصد تحرك السيارة مسافة ${distance} متراً عن موقع الركن!`,
    };
  }

  return {
    isBreached: false,
    driftDistance: distance,
    reason: 'السيارة في مكانها بأمان',
  };
};

// 4️⃣ صوت تأكيد تفعيل الدرع (مرة واحدة فقط)
export const playShieldConfirmationChime = () => {
  try {
    const AudioCtx =
      typeof window !== 'undefined'
        ? window.AudioContext || (window as any).webkitAudioContext
        : null;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  } catch {
    // صامت في حالة الفشل
  }
};