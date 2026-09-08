/**
 * حساب المسافة بين نقطتين بالكيلومترات باستخدام صيغة Haversine
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // نصف قطر الأرض بالكيلومترات
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * تحويل المسافة إلى وقت تقريبي واقعي بالدقائق
 * يراعي: التفاف الشوارع والملفات (U-Turns) + زحام وإشارات المدينة
 */
export function distanceToMinutes(distanceKm: number): number {
  if (distanceKm <= 0) return 2;

  // 1️⃣ معامل التفاف الشوارع: مسار الشارع الفعلي أطول بنسبة 35% إلى 40% من الخط المستقيم
  const actualRoadDistanceKm = distanceKm * 1.38;

  // 2️⃣ سرعة القيادة الواقعية داخل شوارع المدينة مع الإشارات والتهدئة (18 كم/ساعة)
  const realisticCitySpeedKmH = 18;

  const hours = actualRoadDistanceKm / realisticCitySpeedKmH;
  const estimatedMinutes = Math.round(hours * 60);

  // نضمن ألا يقل الوقت عن دقيقتين
  return Math.max(2, estimatedMinutes);
}

/**
 * تصنيف الجراج حسب المسافة
 */
export function classifyDistance(minutes: number): 'nearby' | 'far' {
  if (minutes <= 17) return 'nearby';
  return 'far';
}

/**
 * تنسيق الوقت للعرض
 */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return 'أقل من دقيقة';
  if (minutes === 1) return 'دقيقة واحدة';
  if (minutes === 2) return 'دقيقتان';
  if (minutes <= 10) return `${minutes} دقائق`;
  return `${minutes} دقيقة`;
}