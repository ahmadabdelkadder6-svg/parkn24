// src/utils/geofenceEngine.ts

/**
 * 🏗️ محرك السياج الجغرافي (Geofence Engine)
 * الدرع يعمل فقط داخل نطاق 250 متر من مركز الجراج
 * لو السيارة أو العميل خرج عن النطاق = إنذار فوري
 */

export interface GarageLocation {
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number; // 250 متر افتراضياً
}

export interface GeofenceStatus {
  isInside: boolean;
  distanceFromCenter: number;
  distanceFromEdge: number;
  zone: 'safe' | 'warning' | 'breach';
  message: string;
}

// ═══════════════════════════════════════════════════════
// دالة هافرسين (نفس المستخدمة في باقي المحركات)
// ═══════════════════════════════════════════════════════
const haversine = (
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ═══════════════════════════════════════════════════════
// 1️⃣ فحص هل النقطة داخل سياج الجراج؟
// ═══════════════════════════════════════════════════════
export const checkGeofence = (
  pointLat: number,
  pointLng: number,
  garage: GarageLocation
): GeofenceStatus => {
  const distanceFromCenter = haversine(
    pointLat, pointLng,
    garage.lat, garage.lng
  );

  const distanceFromEdge = distanceFromCenter - garage.radiusMeters;

  // المنطقة الآمنة: داخل 200م (80% من السياج)
  if (distanceFromCenter <= garage.radiusMeters * 0.8) {
    return {
      isInside: true,
      distanceFromCenter: Math.round(distanceFromCenter),
      distanceFromEdge: Math.round(Math.abs(distanceFromEdge)),
      zone: 'safe',
      message: `✅ داخل الجراج (${Math.round(distanceFromCenter)}م من المركز)`,
    };
  }

  // منطقة التحذير: بين 200م و 250م
  if (distanceFromCenter <= garage.radiusMeters) {
    return {
      isInside: true,
      distanceFromCenter: Math.round(distanceFromCenter),
      distanceFromEdge: Math.round(Math.abs(distanceFromEdge)),
      zone: 'warning',
      message: `⚠️ تقترب من حدود الجراج! (${Math.round(distanceFromCenter)}م)`,
    };
  }

  // خارج السياج: أكثر من 250م
  return {
    isInside: false,
    distanceFromCenter: Math.round(distanceFromCenter),
    distanceFromEdge: Math.round(distanceFromEdge),
    zone: 'breach',
    message: `🚨 خارج نطاق الجراج بـ ${Math.round(distanceFromEdge)}م!`,
  };
};

// ═══════════════════════════════════════════════════════
// 2️⃣ هل مسموح تفعيل الدرع في هذا الموقع؟
// ═══════════════════════════════════════════════════════
export const canActivateShield = (
  carLat: number,
  carLng: number,
  garage: GarageLocation
): { allowed: boolean; reason: string } => {
  const status = checkGeofence(carLat, carLng, garage);

  if (!status.isInside) {
    return {
      allowed: false,
      reason: `🚫 لا يمكن تفعيل الدرع خارج الجراج. السيارة تبعد ${status.distanceFromCenter}م عن المركز`,
    };
  }

  return {
    allowed: true,
    reason: status.message,
  };
};

// ═══════════════════════════════════════════════════════
// 3️⃣ فحص مزدوج (العميل + السيارة) داخل السياج
// ═══════════════════════════════════════════════════════
export const checkDualGeofence = (
  clientLat: number,
  clientLng: number,
  carLat: number,
  carLng: number,
  garage: GarageLocation
): {
  clientStatus: GeofenceStatus;
  carStatus: GeofenceStatus;
  bothInside: boolean;
  alert: string | null;
} => {
  const clientStatus = checkGeofence(clientLat, clientLng, garage);
  const carStatus = checkGeofence(carLat, carLng, garage);

  const bothInside = clientStatus.isInside && carStatus.isInside;

  let alert: string | null = null;

  if (!carStatus.isInside) {
    alert = `🚨 السيارة خرجت من الجراج بـ ${carStatus.distanceFromEdge}م!`;
  } else if (!clientStatus.isInside && carStatus.isInside) {
    // العميل خرج لكن السيارة لسه جوه = طبيعي (العميل في الكافيه مثلاً)
    // لا نطلق إنذار هنا، الدرع شغال على السيارة
    alert = null;
  }

  return { clientStatus, carStatus, bothInside, alert };
};