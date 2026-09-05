/**
 * ✅ حساب الساعات المحسوبة
 * أول دقيقة = ساعة، وكل دقيقة من ساعة جديدة = ساعة كاملة
 */
export function calculateFullHours(elapsedSeconds: number): number {
  if (elapsedSeconds <= 0) return 0;
  const totalMinutes = Math.ceil(elapsedSeconds / 60);
  if (totalMinutes <= 0) return 0;
  return Math.ceil(totalMinutes / 60);
}

/**
 * ✅ حساب التكلفة العادية بالمنطق القديم
 */
export function calculateCost(elapsedSeconds: number, ratePerHour: number): number {
  if (elapsedSeconds <= 0 || ratePerHour <= 0) return 0;
  const hours = calculateFullHours(elapsedSeconds);
  return hours * ratePerHour;
}

/**
 * 🎁 حساب التكلفة مع عرض أول ساعة مجانية (الهدية الترحيبية / الجلسة المجانية)
 * - لو الجلسة مجانية: أول ساعة (60 دقيقة = 3600 ثانية) = 0 ج.م
 * - بعد الساعة الأولى: يتم احتساب الوقت الإضافي المتبقي بالمنطق القديم بالكامل
 */
export function calculateCostWithLoyalty(
  elapsedSeconds: number,
  ratePerHour: number,
  isFreeSession: boolean,
  freeHoursLimit: number = 1 // 🎁 الحد الأقصى الافتراضي = ساعة واحدة
): {
  cost: number;
  freeHoursUsed: number;
  freeMinutesUsed: number;
  paidHours: number;
  totalHours: number;
  isFree: boolean;
  savedAmount: number;
} {
  if (ratePerHour <= 0 || elapsedSeconds <= 0) {
    return {
      cost: 0,
      freeHoursUsed: 0,
      freeMinutesUsed: 0,
      paidHours: 0,
      totalHours: 0,
      isFree: isFreeSession,
      savedAmount: 0,
    };
  }

  const totalHours = calculateFullHours(elapsedSeconds);
  const totalOriginalCost = calculateCost(elapsedSeconds, ratePerHour);

  if (!isFreeSession) {
    return {
      cost: totalOriginalCost,
      freeHoursUsed: 0,
      freeMinutesUsed: 0,
      paidHours: totalHours,
      totalHours,
      isFree: false,
      savedAmount: 0,
    };
  }

  // 🎁 حساب خصم الساعة المجانية (بحد أقصى 3600 ثانية لكل ساعة مجانية)
  const maxFreeSeconds = freeHoursLimit * 60 * 60; // 3600 ثانية لساعة واحدة
  const actualFreeSeconds = Math.min(elapsedSeconds, maxFreeSeconds);
  const freeMinutesUsed = Math.floor(actualFreeSeconds / 60);
  const freeHoursUsed = Math.min(freeHoursLimit, calculateFullHours(actualFreeSeconds));

  // 🕐 الحالة الأولى: مدة الركن ساعة أو أقل (مجانية 100%)
  if (elapsedSeconds <= maxFreeSeconds) {
    return {
      cost: 0,
      freeHoursUsed,
      freeMinutesUsed,
      paidHours: 0,
      totalHours,
      isFree: true,
      savedAmount: totalOriginalCost,
    };
  }

  // 🕐 الحالة الثانية: تجاوزت مدة الركن الساعة المجانية
  // يتم خصم أول 3600 ثانية واحتساب الباقي بالمنطق القديم
  const paidSeconds = elapsedSeconds - maxFreeSeconds;
  const paidHours = calculateFullHours(paidSeconds);
  const cost = calculateCost(paidSeconds, ratePerHour);
  const savedAmount = Math.max(0, totalOriginalCost - cost);

  return {
    cost,
    freeHoursUsed: freeHoursLimit,
    freeMinutesUsed: 60 * freeHoursLimit,
    paidHours,
    totalHours,
    isFree: true,
    savedAmount,
  };
}

/**
 * ✅ تنسيق الوقت إلى شكل (ساعات:دقائق:ثواني) 00:00:00
 */
export function formatTime(totalSeconds: number): string {
  if (totalSeconds <= 0) return '00:00:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * ✅ الوقت المتبقي حتى انتهاء الساعة الحالية
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