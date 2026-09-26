
import { haversineDistanceMeters } from './chessGridEngine';

export const GEOFENCE_LIMIT_METERS = 250;

/**
 * 1️⃣ التحقق من شرط تفعيل الدرع (هل العميل داخل الـ 250م من الجراج؟)
 */
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

/**
 * 2️⃣ تحديد السايس النشط المسؤول حالياً (المتصل والفاتح داخل الـ 250م)
 */
export const resolveActiveResponsibleValet = (
  valetLocations: Array<{
    valetNumber: number;
    valetName: string;
    status: 'inside' | 'outside' | 'offline' | 'inactive';
    distance: number | null;
  }>
): { valetName: string; valetNumber: number } | null => {
  // البحث عن أول سايس حالته متواجد داخل الجراج (inside)
  const activeValet = valetLocations.find(v => v.status === 'inside');
  if (activeValet) {
    return { valetName: activeValet.valetName, valetNumber: activeValet.valetNumber };
  }
  return null; // إذا لم يوجد سايس داخل الجراج ⬅️ تحول المسؤولية للإدارة/المالك
};

/**
 * 3️⃣ فلتر دوبلر والسرعة (Doppler Velocity Filter)
 * عزل حركة الشارع الطبيعية وتأكيد سرقة العربية
 */
export const evaluateBreachConfidence = (
  distanceFromAnchor: number,
  speedKmh: number = 0,
  isValetPresentInSlot: boolean = false
): { isBreached: boolean; reason: string } => {
  // 1. لو السايس مرّ في قلب المربع والمكان فاضي
  if (isValetPresentInSlot && distanceFromAnchor > 12) {
    return { isBreached: true, reason: 'تم رصد فراغ مربع الركنة ومرور السايس بنقطة الدرع' };
  }

  // 2. لو العربية اتحركت بسرعة وابتعدت عن الركنة لأكثر من 20 متر
  if (distanceFromAnchor > 20) {
    return { isBreached: true, reason: `السيارة غادرت المربع بمسافة ${Math.round(distanceFromAnchor)}م` };
  }

  return { isBreached: false, reason: 'الموقع مستقر وآمن' };
};