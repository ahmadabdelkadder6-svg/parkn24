/**
 * ✅ حساب الساعات المحسوبة (أول دقيقة تحسب ساعة كاملة)
 * تم تبسيطها رياضياً لتوفير دورات المعالج وسرعة الحساب
 */
export function calculateFullHours(elapsedSeconds: number): number {
  if (elapsedSeconds <= 0) return 0;
  return Math.ceil(elapsedSeconds / 3600);
}

/**
 * ✅ حساب التكلفة العادية بالمنطق الافتراضي للجراج
 */
export function calculateCost(elapsedSeconds: number, ratePerHour: number): number {
  if (elapsedSeconds <= 0 || ratePerHour <= 0) return 0;
  return calculateFullHours(elapsedSeconds) * ratePerHour;
}

/**
 * 🎁 حساب التكلفة الكلية والمقتطعة مع تطبيق عرض الساعة المجانية الترحيبية
 */
export function calculateCostWithLoyalty(
  elapsedSeconds: number,
  ratePerHour: number,
  isFreeSession: boolean,
  freeHoursLimit: number = 1
): {
  cost: number;
  freeHoursUsed: number;
  freeMinutesUsed: number;
  paidHours: number;
  totalHours: number;
  isFree: boolean;
  savedAmount: number;
} {
  const defaultResponse = {
    cost: 0,
    freeHoursUsed: 0,
    freeMinutesUsed: 0,
    paidHours: 0,
    totalHours: 0,
    isFree: isFreeSession,
    savedAmount: 0,
  };

  if (ratePerHour <= 0 || elapsedSeconds <= 0) {
    return defaultResponse;
  }

  const totalHours = calculateFullHours(elapsedSeconds);
  const totalOriginalCost = calculateCost(elapsedSeconds, ratePerHour);

  if (!isFreeSession) {
    return {
      ...defaultResponse,
      cost: totalOriginalCost,
      paidHours: totalHours,
      totalHours,
      isFree: false,
    };
  }

  const maxFreeSeconds = freeHoursLimit * 3600;
  const actualFreeSeconds = Math.min(elapsedSeconds, maxFreeSeconds);
  const freeMinutesUsed = Math.floor(actualFreeSeconds / 60);
  const freeHoursUsed = Math.min(freeHoursLimit, calculateFullHours(actualFreeSeconds));

  // إذا كانت مدة الركن تقع بالكامل داخل حدود الساعة المجانية
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

  // إذا تجاوزت مدة الركن حدود الساعة المجانية
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
 * ✅ تنسيق الوقت اللحظي إلى صيغة (ساعات:دقائق:ثواني) 00:00:00
 */
export function formatTime(totalSeconds: number): string {
  if (totalSeconds <= 0) return '00:00:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * ✅ حساب الوقت المتبقي لانتهاء الساعة الحالية وبدء الساعة التالية
 */
export function getRemainingInCurrentHour(elapsedSeconds: number): { minutes: number; seconds: number } {
  if (elapsedSeconds <= 0) return { minutes: 59, seconds: 59 };
  
  const secondsInCurrentHour = elapsedSeconds % 3600;
  const remaining = 3600 - secondsInCurrentHour;
  
  if (remaining <= 0 || remaining >= 3600) {
    return { minutes: 59, seconds: 59 };
  }
  
  return {
    minutes: Math.floor(remaining / 60),
    seconds: remaining % 60,
  };
}