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
 * تحويل المسافة إلى وقت تقريبي متوازن مع خرائط جوجل
 */
export function distanceToMinutes(distanceKm: number): number {
  if (distanceKm <= 0.3) return 2;

  // 1️⃣ معامل دوران طبيعي 20% فقط
  const roadDistanceKm = distanceKm * 1.2;

  // 2️⃣ سرعة ديناميكية متوازنة:
  // في الشوارع القريبة نحسب 26 كم/ساعة، وفي المسافات الأكبر 34 كم/ساعة لوجود محاور وطرق رئيسية
  const speedKmH = distanceKm < 3 ? 26 : 34;

  const minutes = Math.round((roadDistanceKm / speedKmH) * 60);

  // الحد الأدنى دقيقتين
  return Math.max(2, minutes);
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