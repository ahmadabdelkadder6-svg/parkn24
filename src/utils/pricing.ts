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
 * 🔄 الحصول على نسبة شريحة الكاش باك المستحقة بناءً على المجموع التراكمي
 */
export function getCashbackPercentage(totalAccumulatedAmount: number): number {
  if (totalAccumulatedAmount >= 1000) return 0.10; // 10%
  if (totalAccumulatedAmount >= 500) return 0.07;  // 7%
  if (totalAccumulatedAmount >= 200) return 0.05;  // 5%
  if (totalAccumulatedAmount >= 100) return 0.03;  // 3%
  return 0;
}

/**
 * 🔄 حساب قيمة الاسترداد التراكمي الفعلي للجلسة الحالية (كاش باك المحفظة)
 * يدعم الاستدعاء الأحادي (لمطابقة الكود القديم) والتراكمي التجميعي اللحظي
 */
export function calculateTierRefund(
  currentSessionPrice: number,
  allSessions: any[] = [],
  carPlate: string = '',
  customerPhone: string = ''
): number {
  if (currentSessionPrice <= 0) return 0;

  // إذا لم يتم تمرير الجلسات (Fallback)، يحسب بناءً على قيمة الفاتورة الحالية فقط
  if (!allSessions || allSessions.length === 0) {
    const percent = getCashbackPercentage(currentSessionPrice);
    return Math.round((currentSessionPrice * percent) * 100) / 100;
  }

  const normalized = (carPlate || '').trim().toUpperCase();

  // جمع إجمالي إنفاق العميل الفعلي السابق من المحفظة فقط
  const pastWalletTotal = allSessions
    .filter((s) => {
      if (s.status !== 'completed' || s.paymentMethod !== 'wallet') return false;
      const plateMatch = normalized && s.carPlate && s.carPlate.trim().toUpperCase() === normalized;
      const phoneMatch = customerPhone && s.customerPhone === customerPhone;
      return plateMatch || phoneMatch;
    })
    .reduce((sum, s) => sum + (s.totalPrice || 0), 0);

  // حساب الشريحة بناءً على المبلغ التأهيلي (الإنفاق السابق + تكلفة الركنة الحالية)
  const qualifyingAmount = Math.max(currentSessionPrice, pastWalletTotal + currentSessionPrice);
  const percent = getCashbackPercentage(qualifyingAmount);

  return Math.round((currentSessionPrice * percent) * 100) / 100;
}

/**
 * 📊 حساب إجمالي الكاش باك التراكمي الذي استرده الحريف بنجاح في محفظته عبر التاريخ
 */
export function calculateUserTotalEarnedCashback(
  allSessions: any[],
  carPlate: string = '',
  customerPhone: string = ''
): number {
  if (!allSessions || allSessions.length === 0) return 0;
  const normalized = (carPlate || '').trim().toUpperCase();

  return allSessions
    .filter((s) => {
      const plateMatch = normalized && s.carPlate && s.carPlate.trim().toUpperCase() === normalized;
      const phoneMatch = customerPhone && s.customerPhone === customerPhone;
      return (plateMatch || phoneMatch) && s.status === 'completed';
    })
    .reduce((sum, s) => sum + Number(s.refundAmount || 0), 0);
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