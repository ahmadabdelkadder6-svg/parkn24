/**
 * 🗺️ حساب المسافة الجوية الدقيقة بين نقطتين على سطح الأرض بالكيلومترات (صيغة Haversine القياسية)
 * تعيد الرقم العشري الخام بدقته الكاملة لتمكين شاشات العرض من حساب الأمتار بدقة فائقة
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  if (!lat1 || !lng1 || !lat2 || !lng2) return 0;
  if (lat1 === lat2 && lng1 === lng2) return 0;

  const R = 6371; // نصف قطر الأرض الدقيق والمطابق للمقاييس الدولية بالكيلومتر
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

  // إرجاع الرقم العشري الكامل والدقيق لمنع أي أخطاء في واجهة العميل عند حساب الأمتار
  return Number.isFinite(distance) ? distance : 0;
}

/**
 * ⏱️ تحويل المسافة إلى وقت تقريبي متوازن ومطابق لخرائط جوجل والشوارع الفعلية
 */
export function distanceToMinutes(distanceKm: number): number {
  if (!distanceKm || distanceKm <= 0) return 0;
  if (distanceKm <= 0.3) return 2; // الحد الأدنى للركنة القريبة جداً دقيقتان

  // 1️⃣ معامل الدوران والالتفاف الطبيعي للشوارع في مصر (20% زيادة عن الخط المستقيم)
  const roadDistanceKm = distanceKm * 1.2;

  // 2️⃣ سرعة القيادة الديناميكية المتوازنة داخل المدينة:
  // - في المسافات القريبة (< 3 كم) نحسب بمتوسط سرعة 26 كم/ساعة لوجود إشارات وشوارع داخلية فرعية
  // - في المسافات الكبيرة (> 3 كم) نحسب بمتوسط سرعة 34 كم/ساعة لوجود محاور وطرق رئيسية كبرى
  const speedKmH = distanceKm < 3 ? 26 : 34;

  const minutes = Math.round((roadDistanceKm / speedKmH) * 60);

  // الحد الأدنى دقيقتان لضمان عدم حدوث أي فروق سلبية
  return Math.max(2, minutes);
}

/**
 * 🏷️ تصنيف الجراج حسب مدة الوصول المتوقعة
 */
export function classifyDistance(minutes: number): 'nearby' | 'far' {
  // إذا كان الوقت المتوقع للوصول أقل من أو يساوي 17 دقيقة يعتبر قريباً
  if (minutes <= 17) return 'nearby';
  return 'far';
}

/**
 * 🗣️ تنسيق مدة الوقت باللغة العربية الفصحى السليمة لتظهر بشكل أنيق للعميل
 */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return 'أقل من دقيقة';
  if (minutes === 1) return 'دقيقة واحدة';
  if (minutes === 2) return 'دقيقتان';
  if (minutes >= 3 && minutes <= 10) return `${minutes} دقائق`;
  return `${minutes} دقيقة`;
}