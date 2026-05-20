/**
 * حساب عدد الساعات الكاملة
 * من أول دقيقة = ساعة كاملة
 * دخول ساعة جديدة = ساعة إضافية كاملة
 */
export function calculateFullHours(elapsedSeconds: number): number {
  if (elapsedSeconds <= 0) return 0;
  
  const elapsedMinutes = Math.ceil(elapsedSeconds / 60);
  
  // من أول دقيقة = ساعة كاملة
  // كل 60 دقيقة إضافية = ساعة إضافية
  const hours = Math.ceil(elapsedMinutes / 60);
  
  return Math.max(1, hours); // الحد الأدنى ساعة واحدة
}

/**
 * حساب التكلفة بناءً على الساعات الكاملة
 */
export function calculateCost(elapsedSeconds: number, pricePerHour: number): number {
  const hours = calculateFullHours(elapsedSeconds);
  return hours * pricePerHour;
}

/**
 * تنسيق الوقت للعرض
 */
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * حساب الوقت المتبقي في الساعة الحالية
 */
export function getRemainingInCurrentHour(elapsedSeconds: number): { minutes: number; seconds: number } {
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const currentHourMinutes = elapsedMinutes % 60;
  const remainingMinutes = 60 - currentHourMinutes - 1;
  const remainingSeconds = 60 - (elapsedSeconds % 60);
  
  if (remainingSeconds === 60) {
    return { minutes: remainingMinutes + 1, seconds: 0 };
  }
  
  return { minutes: remainingMinutes, seconds: remainingSeconds };
}
