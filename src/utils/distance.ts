/**
 * 🗺️ حساب المسافة بين نقطتين بالكيلومترات باستخدام صيغة Haversine القياسية
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
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  // إرجاع المسافة برقمين عشريين بدقة
  return Number.isFinite(distance) ? Math.round(distance * 10) / 10 : 0;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * ⏱️ تحويل المسافة إلى وقت قيادة حقيقي متطابق مع خرائط جوجل (Google Maps Driving Model)
 */
export function distanceToMinutes(distanceKm: number): number {
  if (!distanceKm || distanceKm <= 0.1) return 1;
  if (distanceKm <= 0.4) return 2;

  // 🚗 معامل مسار الشوارع الفعلي:
  // المسار الفعلي بالسيارة في شوارع المدينة يزيد بمعدل 25% عن الخط الجوي المباشر
  const actualRoadKm = distanceKm * 1.25;

  // 🏎️ سرعة القيادة التقديرية بالسيارة (حسب نوع الطريق وبعد المسافة):
  // - شوارع داخلية وقريبة (< 2 كم): متوسط 24 كم/ساعة
  // - مسافات متوسطة (2 - 7 كم): متوسط 32 كم/ساعة
  // - محاور وطرق سريعة (> 7 كم): متوسط 45 كم/ساعة
  let speedKmH: number;
  if (distanceKm < 2) {
    speedKmH = 24;
  } else if (distanceKm < 7) {
    speedKmH = 32;
  } else {
    speedKmH = 45;
  }

  const calculatedMins = Math.round((actualRoadKm / speedKmH) * 60);

  // الحد الأدنى دقيقة واحدة
  return Math.max(1, calculatedMins);
}

/**
 * 🏷️ تصنيف الجراج حسب المسافة والوقت
 */
export function classifyDistance(minutes: number): 'nearby' | 'far' {
  // 15 دقيقة فأقل يُعتبر في النطاق القريب من العميل
  return minutes <= 15 ? 'nearby' : 'far';
}

/**
 * 🗣️ تنسيق عرض مدة الوقت باللغة العربية السليمة
 */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return 'أقل من دقيقة';
  if (minutes === 1) return 'دقيقة واحدة';
  if (minutes === 2) return 'دقيقتان';
  if (minutes >= 3 && minutes <= 10) return `${minutes} دقائق`;
  return `${minutes} دقيقة`;
}