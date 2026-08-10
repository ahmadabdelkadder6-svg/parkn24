/**
 * ✅ حساب الساعات المحسوبة
 * أول دقيقة = ساعة، كل دقيقة جديدة من ساعة جديدة = ساعة كاملة
 */
export function calculateFullHours(elapsedSeconds: number): number {
  if (elapsedSeconds <= 0) return 0;
  const totalMinutes = Math.ceil(elapsedSeconds / 60);
  if (totalMinutes <= 0) return 0;
  return Math.ceil(totalMinutes / 60);
}

/**
 * ✅ حساب التكلفة العادية
 */
export function calculateCost(elapsedSeconds: number, ratePerHour: number): number {
  if (elapsedSeconds <= 0 || ratePerHour <= 0) return 0;
  const hours = calculateFullHours(elapsedSeconds);
  return hours * ratePerHour;
}

/**
 * ✅ حساب التكلفة مع ركنة مجانية (برنامج الولاء)
 * - لو الركنة مجانية: أول 2 ساعة = 0 ج.م
 * - بعد الساعتين: الحساب العادي يبدأ من الصفر
 */
export function calculateCostWithLoyalty(
  elapsedSeconds: number,
  ratePerHour: number,
  isFreeSession: boolean,
): { cost: number; freeHoursUsed: number; paidHours: number; totalHours: number; isFree: boolean } {
  if (ratePerHour <= 0 || elapsedSeconds <= 0) {
    return { cost: 0, freeHoursUsed: 0, paidHours: 0, totalHours: 0, isFree: isFreeSession };
  }

  const totalHours = calculateFullHours(elapsedSeconds);

  if (!isFreeSession) {
    const cost = calculateCost(elapsedSeconds, ratePerHour);
    return { cost, freeHoursUsed: 0, paidHours: totalHours, totalHours, isFree: false };
  }

  // ✅ ركنة مجانية - أول 2 ساعة مجانية
  const freeSeconds = 2 * 60 * 60; // 7200 ثانية
  const freeHoursUsed = Math.min(2, calculateFullHours(Math.min(elapsedSeconds, freeSeconds)));

  if (elapsedSeconds <= freeSeconds) {
    return { cost: 0, freeHoursUsed, paidHours: 0, totalHours, isFree: true };
  }

  // ✅ تجاوز الساعتين
  const paidSeconds = elapsedSeconds - freeSeconds;
  const paidHours = calculateFullHours(paidSeconds);
  const cost = calculateCost(paidSeconds, ratePerHour);

  return { cost, freeHoursUsed: 2, paidHours, totalHours, isFree: true };
}

/**
 * ✅ تنسيق الوقت (ساعات:دقائق:ثواني)
 */
export function formatTime(totalSeconds: number): string {
  if (totalSeconds <= 0) return '00:00:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * ✅ الوقت المتبقي حتى الساعة التالية
 */
export function getRemainingInCurrentHour(elapsedSeconds: number): { minutes: number; seconds: number } {
  if (elapsedSeconds <= 0) return { minutes: 59, seconds: 59 };
  const secondsInCurrentHour = elapsedSeconds % 3600;
  const remaining = 3600 - secondsInCurrentHour;
  if (remaining <= 0 || remaining >= 3600) return { minutes: 59, seconds: 59 };
  return {
    minutes: Math.floor(remaining / 60),
    seconds: remaining % 60,
  };
}