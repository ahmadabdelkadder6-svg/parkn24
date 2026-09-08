/**
 * ✅ حساب الساعات المحسوبة (من 1 إلى 60 دقيقة = ساعة، من 61 إلى 120 = ساعتان.. إلخ)
 */
export function calculateFullHours(elapsedSeconds: number): number {
  if (elapsedSeconds <= 0) return 0;
  return Math.ceil(elapsedSeconds / 3600);
}

/**
 * ✅ حساب التكلفة العادية
 */
export function calculateCost(elapsedSeconds: number, ratePerHour: number): number {
  if (elapsedSeconds <= 0 || ratePerHour <= 0) return 0;
  return calculateFullHours(elapsedSeconds) * ratePerHour;
}

/**
 * 🎁 حساب التكلفة مع عرض أول 30 دقيقة مجانية
 * - حتى 30 دقيقة (1800 ثانية) = 0 ج.م
 * - من 31 إلى 60 دقيقة = ساعة واحدة (سعر الساعة)
 * - من 61 فصاعداً = ساعتان وما فوق
 */
export function calculateCostWithLoyalty(
  elapsedSeconds: number,
  ratePerHour: number,
  isFreeSession: boolean
): {
  cost: number;
  paidHours: number;
  totalHours: number;
  isFree: boolean;
  savedAmount: number;
} {
  if (ratePerHour <= 0 || elapsedSeconds <= 0) {
    return { cost: 0, paidHours: 0, totalHours: 0, isFree: isFreeSession, savedAmount: 0 };
  }

  const standardHours = calculateFullHours(elapsedSeconds);
  const standardCost = standardHours * ratePerHour;

  // إذا كانت الجلسة مستحقة للهدية ومدة الركن 30 دقيقة أو أقل
  if (isFreeSession && elapsedSeconds <= 1800) {
    return {
      cost: 0,
      paidHours: 0,
      totalHours: standardHours,
      isFree: true,
      savedAmount: standardCost,
    };
  }

  // إذا تجاوزت الـ 30 دقيقة أو لم تكن مجانية
  return {
    cost: standardCost,
    paidHours: standardHours,
    totalHours: standardHours,
    isFree: false,
    savedAmount: 0,
  };
}

/**
 * ✅ تنسيق الوقت اللحظي إلى (00:00:00)
 */
export function formatTime(totalSeconds: number): string {
  if (totalSeconds <= 0) return '00:00:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * ✅ حساب الوقت المتبقي لانتهاء الساعة الحالية
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