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
 * ✅ حساب التكلفة مع الجلسة الأولى المجانية (المنطق الجديد)
 * - الجلسة الأولى مجانية بالكامل لأول ساعة فقط (3600 ثانية).
 * - بعد الساعة الأولى: يُحسب الوقت الإضافي بمنطق كسر الساعة بساعة كاملة.
 */
export function calculateCostWithFirstFree(
  elapsedSeconds: number,
  ratePerHour: number,
  isFirstFree: boolean
): { cost: number; freeHoursUsed: number; paidHours: number; totalHours: number } {
  if (ratePerHour <= 0 || elapsedSeconds <= 0) {
    return { cost: 0, freeHoursUsed: 0, paidHours: 0, totalHours: 0 };
  }

  const totalHours = calculateFullHours(elapsedSeconds);

  // إذا لم تكن الجلسة الأولى المجانية، يحسب الحساب العادي مباشرة
  if (!isFirstFree) {
    const cost = calculateCost(elapsedSeconds, ratePerHour);
    return { cost, freeHoursUsed: 0, paidHours: totalHours, totalHours };
  }

  const oneHourSeconds = 1 * 60 * 60; // 3600 ثانية (ساعة واحدة مجانية)

  // إذا كانت المدة داخل الساعة الأولى المجانية
  if (elapsedSeconds <= oneHourSeconds) {
    return { cost: 0, freeHoursUsed: 1, paidHours: 0, totalHours };
  }

  // إذا تجاوزت المدة الساعة الأولى المجانية: نحسب الساعات الإضافية كسر الساعة بساعة
  const paidSeconds = elapsedSeconds - oneHourSeconds;
  const paidHours = calculateFullHours(paidSeconds);
  const cost = paidHours * ratePerHour;

  return { cost, freeHoursUsed: 1, paidHours, totalHours };
}

/**
 * ✅ دالة توافقية تراجعية (Wrapper) لتفادي أي خطأ في الملفات التي تستدعي الدالة القديمة
 * تقوم بتحويل حساب الساعتين القديم إلى "ساعة مجانية واحدة" بالمنطق الجديد تلقائياً
 */
export function calculateCostWithLoyalty(
  elapsedSeconds: number,
  ratePerHour: number,
  isFreeSession: boolean,
): { cost: number; freeHoursUsed: number; paidHours: number; totalHours: number; isFree: boolean } {
  const result = calculateCostWithFirstFree(elapsedSeconds, ratePerHour, isFreeSession);
  return {
    ...result,
    isFree: isFreeSession
  };
}

/**
 * 🔄 حساب قيمة الاسترداد التراكمي (كاش باك المحفظة) بناءً على الشرائح المطلوبة:
 * - 100 إلى 199 ج.م 👈 3%
 * - 200 إلى 499 ج.م 👈 5%
 * - 500 إلى 999 ج.م 👈 7%
 * - 1000 ج.م فأكثر 👈 10%
 * - أقل من 100 ج.م لا يوجد استرداد
 */
export function calculateTierRefund(amount: number): number {
  if (amount >= 1000) return Math.round((amount * 0.10) * 100) / 100;
  if (amount >= 500) return Math.round((amount * 0.07) * 100) / 100;
  if (amount >= 200) return Math.round((amount * 0.05) * 100) / 100;
  if (amount >= 100) return Math.round((amount * 0.03) * 100) / 100;
  return 0;
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