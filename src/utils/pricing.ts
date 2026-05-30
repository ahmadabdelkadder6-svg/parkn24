/**
 * حساب عدد الساعات الكاملة
 * من أول دقيقة = ساعة كاملة
 * دخول ساعة جديدة = ساعة إضافية كاملة
 */
export function calculateFullHours(elapsedSeconds: number): number {
  if (elapsedSeconds <= 0) return 0;
  const elapsedMinutes = Math.ceil(elapsedSeconds / 60);
  const hours = Math.ceil(elapsedMinutes / 60);
  return Math.max(1, hours);
}

/**
 * حساب التكلفة بناءً على الساعات الكاملة
 */
export function calculateCost(
  elapsedSeconds: number,
  pricePerHour: number
): number {
  if (elapsedSeconds <= 0) return 0;
  if (pricePerHour <= 0) return 0;
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
export function getRemainingInCurrentHour(elapsedSeconds: number): {
  minutes: number;
  seconds: number;
} {
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const currentHourMinutes = elapsedMinutes % 60;
  const remainingMinutes = 60 - currentHourMinutes - 1;
  const remainingSeconds = 60 - (elapsedSeconds % 60);

  if (remainingSeconds === 60) {
    return { minutes: remainingMinutes + 1, seconds: 0 };
  }

  return { minutes: remainingMinutes, seconds: remainingSeconds };
}

/**
 * ✅ تحويل timestamp لـ UTC ISO string صح
 * بيحل مشكلة الـ timezone
 */
export function toUTCISOString(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

/**
 * ✅ تحويل ISO string من Supabase لـ timestamp محلي صح
 */
export function fromSupabaseTime(isoString: string | null | undefined): number {
  if (!isoString) return 0;
  try {
    const parsed = new Date(isoString).getTime();
    if (isNaN(parsed) || parsed <= 0) return 0;
    return parsed;
  } catch {
    return 0;
  }
}

/**
 * ✅ حساب الـ elapsed بين وقتين من Supabase بشكل صح
 */
export function calcElapsedSeconds(
  startTimeMs: number,
  endTimeMs?: number
): number {
  const end = endTimeMs && endTimeMs > 0 ? endTimeMs : Date.now();
  const elapsed = Math.floor((end - startTimeMs) / 1000);
  return Math.max(0, elapsed);
}