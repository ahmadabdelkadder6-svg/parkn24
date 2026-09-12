/**
 * حساب المسافة بين نقطتين بالكيلومترات (صيغة Haversine الدقيقة)
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  if (!lat1 || !lng1 || !lat2 || !lng2) return 0;
  if (lat1 === lat2 && lng1 === lng2) return 0;

  const R = 6371; // نصف قطر الأرض بالكيلومتر
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * 
    Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLng / 2) * 
    Math.sin(dLng / 2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Number.isFinite(distance) ? Math.round(distance * 10) / 10 : 0;
}

/**
 * تحويل المسافة إلى وقت متطابق مع واقع الشوارع المصرية
 */
export function distanceToMinutes(distanceKm: number): number {
  if (!distanceKm || distanceKm <= 0.2) return 2;

  // 🚗 معامل دوران الشوارع الواقعي في مصر (زيادة 25% عن الخط المستقيم)
  const actualRoadKm = distanceKm * 1.25;

  // ⏱️ سرعة القيادة الواقعية داخل شوارع القاهرة (متوسط 30 كم/ساعة شامل الإشارات والمهدئات)
  const averageSpeedKmH = 30;

  const minutes = Math.round((actualRoadKm / averageSpeedKmH) * 60);

  return Math.max(2, minutes);
}

/**
 * تصنيف الجراج حسب الوقت
 */
export function classifyDistance(minutes: number): 'nearby' | 'far' {
  return minutes <= 15 ? 'nearby' : 'far';
}

/**
 * تنسيق الوقت للعرض باللغة العربية
 */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return 'أقل من دقيقة';
  if (minutes === 1) return 'دقيقة واحدة';
  if (minutes === 2) return 'دقيقتان';
  if (minutes <= 10) return `${minutes} دقائق`;
  return `${minutes} دقيقة`;
}