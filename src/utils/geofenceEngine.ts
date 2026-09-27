// src/utils/geofenceEngine.ts

/**
 * 🏗️ محرك السياج الجغرافي الشامل (Unified Geofence Engine)
 * - الدرع يعمل فقط داخل نطاق 250 متر من مركز الجراج
 * - فحص مزدوج للعميل والسيارة
 * - تحديد السايس المسؤول وعزل الإنذارات الكاذبة
 */

export const GEOFENCE_LIMIT_METERS = 250;

export interface GarageLocation {
  name?: string;
  lat: number;
  lng: number;
  radiusMeters?: number; // 250 متر افتراضياً
}

export interface GeofenceStatus {
  isInside: boolean;
  distanceFromCenter: number;
  distanceFromEdge: number;
  zone: 'safe' | 'warning' | 'breach';
  message: string;
}

// ═══════════════════════════════════════════════════════
// 📐 دالة هافرسين لحساب المسافة الدقيقة بالمتر (مدمجة وسريعة)
// ═══════════════════════════════════════════════════════
export const haversineDistanceMeters = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
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
  const radius = garage.radiusMeters || GEOFENCE_LIMIT_METERS;
  const distanceFromCenter = haversineDistanceMeters(
    pointLat,
    pointLng,
    garage.lat,
    garage.lng
  );

  const distanceFromEdge = distanceFromCenter - radius;

  // المنطقة الآمنة: داخل 200م (80% من السياج)
  if (distanceFromCenter <= radius * 0.8) {
    return {
      isInside: true,
      distanceFromCenter: Math.round(distanceFromCenter),
      distanceFromEdge: Math.round(Math.abs(distanceFromEdge)),
      zone: 'safe',
      message: `✅ داخل الجراج (${Math.round(distanceFromCenter)}م من المركز)`,
    };
  }

  // منطقة التحذير: بين 200م و 250م
  if (distanceFromCenter <= radius) {
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
// 3️⃣ التحقق من شرط تفعيل الدرع بالأرقام المباشرة
// ═══════════════════════════════════════════════════════
export const verifyShieldActivationDistance = (
  clientLat: number,
  clientLng: number,
  garageLat: number,
  garageLng: number
): { canActivate: boolean; distanceMeters: number; errorMsg?: string } => {
  const dist = Math.round(haversineDistanceMeters(clientLat, clientLng, garageLat, garageLng));
  
  if (dist > GEOFENCE_LIMIT_METERS) {
    return {
      canActivate: false,
      distanceMeters: dist,
      errorMsg: `أنت على بعد ${dist}م من الجراج. يجب التواجد داخل نطاق الجراج (${GEOFENCE_LIMIT_METERS}م) لتفعيل درع الأمان.`
    };
  }

  return { canActivate: true, distanceMeters: dist };
};

// ═══════════════════════════════════════════════════════
// 4️⃣ فحص مزدوج (العميل + السيارة) داخل السياج
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
    // العميل في الكافيه والسيارة في الجراج = آمن
    alert = null;
  }

  return { clientStatus, carStatus, bothInside, alert };
};

// ═══════════════════════════════════════════════════════
// 5️⃣ تحديد السايس النشط المسؤول حالياً
// ═══════════════════════════════════════════════════════
export const resolveActiveResponsibleValet = (
  valetLocations: Array<{
    valetNumber: number;
    valetName: string;
    status: 'inside' | 'outside' | 'offline' | 'inactive';
    distance: number | null;
  }>
): { valetName: string; valetNumber: number } | null => {
  const activeValet = (valetLocations || []).find(v => v && v.status === 'inside');
  if (activeValet) {
    return { valetName: activeValet.valetName, valetNumber: activeValet.valetNumber };
  }
  return null;
};

// ═══════════════════════════════════════════════════════
// 6️⃣ فلتر حركة ومغادرة المربع (Breach Confidence)
// ═══════════════════════════════════════════════════════
export const evaluateBreachConfidence = (
  distanceFromAnchor: number,
  speedKmh: number = 0,
  isValetPresentInSlot: boolean = false
): { isBreached: boolean; reason: string } => {
  if (isValetPresentInSlot && distanceFromAnchor > 12) {
    return { isBreached: true, reason: 'تم رصد فراغ مكان الركنة ومرور السايس بنقطة الدرع' };
  }

  if (distanceFromAnchor > 20) {
    return { isBreached: true, reason: `السيارة غادرت مكان الركنة بمسافة ${Math.round(distanceFromAnchor)}م` };
  }

  return { isBreached: false, reason: 'الموقع مستقر وآمن' };
};