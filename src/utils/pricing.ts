// src/utils/pricing.ts

/**
 * ⏱️ الثوابت الزمنية لحساب الركنات
 */
export const SECONDS_IN_HOUR = 3600;
export const FREE_SESSION_SECONDS = 1800; // 30 دقيقة مجانية (1800 ثانية)

/**
 * ✅ حساب الساعات المحسوبة (من 1 إلى 60 دقيقة = ساعة، من 61 إلى 120 = ساعتان.. إلخ)
 */
export function calculateFullHours(elapsedSeconds: number): number {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;
  const safeSeconds = Math.floor(elapsedSeconds);
  return Math.ceil(safeSeconds / SECONDS_IN_HOUR);
}

/**
 * ✅ حساب التكلفة العادية
 */
export function calculateCost(elapsedSeconds: number, ratePerHour: number): number {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;
  if (!Number.isFinite(ratePerHour) || ratePerHour <= 0) return 0;
  
  const hours = calculateFullHours(elapsedSeconds);
  return Math.round(hours * ratePerHour);
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
  if (!Number.isFinite(ratePerHour) || ratePerHour <= 0 || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return { cost: 0, paidHours: 0, totalHours: 0, isFree: isFreeSession, savedAmount: 0 };
  }

  const safeSeconds = Math.floor(elapsedSeconds);
  const standardHours = calculateFullHours(safeSeconds);
  const standardCost = Math.round(standardHours * ratePerHour);

  // إذا كانت الجلسة مستحقة للهدية ومدة الركن 30 دقيقة أو أقل (<= 1800 ثانية)
  if (isFreeSession && safeSeconds <= FREE_SESSION_SECONDS) {
    return {
      cost: 0,
      paidHours: 0,
      totalHours: standardHours,
      isFree: true,
      savedAmount: standardCost,
    };
  }

  // إذا تجاوزت الـ 30 دقيقة أو لم تكن الجلسة مشمولة بالهدية
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
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '00:00:00';
  const total = Math.floor(totalSeconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * ✅ حساب الوقت المتبقي لانتهاء الساعة الحالية
 */
export function getRemainingInCurrentHour(elapsedSeconds: number): { minutes: number; seconds: number } {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return { minutes: 59, seconds: 59 };
  }
  const safeSeconds = Math.floor(elapsedSeconds);
  const secondsInCurrentHour = safeSeconds % SECONDS_IN_HOUR;
  const remaining = SECONDS_IN_HOUR - secondsInCurrentHour;
  
  if (remaining <= 0 || remaining >= SECONDS_IN_HOUR) {
    return { minutes: 59, seconds: 59 };
  }
  
  return {
    minutes: Math.floor(remaining / 60),
    seconds: remaining % 60,
  };
}