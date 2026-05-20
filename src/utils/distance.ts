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
 * تحويل المسافة إلى وقت تقريبي بالدقائق
 * نفترض متوسط سرعة 30 كم/ساعة في المدينة
 */
export function distanceToMinutes(distanceKm: number): number {
  const avgSpeedKmPerHour = 25; // سرعة متوسطة في المدينة مع الزحام
  const hours = distanceKm / avgSpeedKmPerHour;
  return Math.ceil(hours * 60);
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
