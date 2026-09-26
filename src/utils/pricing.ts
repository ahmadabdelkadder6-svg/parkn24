// src/utils/pricing.ts

// ═══════════════════════════════════════════════════════════════
// 🛡️ الثوابت المالية لدرع الأمان والتقسيم الرقمي
// ═══════════════════════════════════════════════════════════════
export const SECURITY_SHIELD_FEE = 10;        // رسوم درع الأمان الكلية الثابتة (10 ج.م)
export const APP_SHIELD_SHARE = 5;            // نصيب التطبيق الثابت من الدرع (5 ج.م)
export const GARAGE_SHIELD_SHARE = 5;         // نصيب الجراج الثابت من الدرع (5 ج.م)

/**
 * ✅ حساب الساعات المحسوبة (من 1 إلى 60 دقيقة = ساعة، من 61 إلى 120 = ساعتان.. إلخ)
 */
export function calculateFullHours(elapsedSeconds: number): number {
  if (!elapsedSeconds || elapsedSeconds <= 0 || isNaN(elapsedSeconds)) return 0;
  return Math.ceil(elapsedSeconds / 3600);
}

/**
 * ✅ حساب التكلفة العادية لوقت الركن فقط
 */
export function calculateCost(elapsedSeconds: number, ratePerHour: number): number {
  if (!elapsedSeconds || elapsedSeconds <= 0 || !ratePerHour || ratePerHour <= 0) return 0;
  return calculateFullHours(elapsedSeconds) * ratePerHour;
}

/**
 * 🎁 حساب التكلفة مع عرض أول 30 دقيقة مجانية + درع الأمان VIP (10 ج.م)
 * - حتى 30 دقيقة (1800 ثانية):
 *    - بدون درع = 0 ج.م
 *    - مع درع VIP = 10 ج.م فقط (رسوم الحماية)
 * - من 31 دقيقة فصاعداً:
 *    - يحسب سعر الساعة + 10 ج.م درع (لو مفعل)
 */
export function calculateCostWithLoyalty(
  elapsedSeconds: number,
  ratePerHour: number,
  isFreeSession: boolean,
  isShieldActive: boolean = false
): {
  cost: number;
  timeCost: number;
  shieldCost: number;
  paidHours: number;
  totalHours: number;
  isFree: boolean;
  savedAmount: number;
} {
  const shieldFee = isShieldActive ? SECURITY_SHIELD_FEE : 0;

  if (!ratePerHour || ratePerHour <= 0 || !elapsedSeconds || elapsedSeconds <= 0) {
    return {
      cost: shieldFee,
      timeCost: 0,
      shieldCost: shieldFee,
      paidHours: 0,
      totalHours: 0,
      isFree: isFreeSession,
      savedAmount: 0,
    };
  }

  const standardHours = calculateFullHours(elapsedSeconds);
  const standardTimeCost = standardHours * ratePerHour;

  // إذا كانت الجلسة مستحقة للهدية ومدة الركن 30 دقيقة أو أقل
  if (isFreeSession && elapsedSeconds <= 1800) {
    return {
      cost: 0 + shieldFee, // إذا كان الدرع مفعل يدفع فقط 10ج رسوم الدرع
      timeCost: 0,
      shieldCost: shieldFee,
      paidHours: 0,
      totalHours: standardHours,
      isFree: true,
      savedAmount: standardTimeCost,
    };
  }

  // إذا تجاوزت الـ 30 دقيقة أو لم تكن الجلسة مجانية
  return {
    cost: standardTimeCost + shieldFee,
    timeCost: standardTimeCost,
    shieldCost: shieldFee,
    paidHours: standardHours,
    totalHours: standardHours,
    isFree: false,
    savedAmount: 0,
  };
}

/**
 * ⚖️ تقسيم أرباح الجلسة بين التطبيق والجراج (عمولة الوقت + 5ج الدرع)
 */
export function calculateSessionRevenueSplit(
  totalBill: number,
  isShieldActive: boolean = false,
  commissionRatePercent: number = 10
): {
  appShare: number;
  garageShare: number;
  shieldAppShare: number;
  shieldGarageShare: number;
} {
  const shieldApp = isShieldActive ? APP_SHIELD_SHARE : 0;         // 5 ج.م للتطبيق
  const shieldGarage = isShieldActive ? GARAGE_SHIELD_SHARE : 0;   // 5 ج.م للجراج

  // استخراج سعر وقت الركن فقط بدون الـ 10ج بتاعة الدرع
  const timeOnlyRevenue = isShieldActive ? Math.max(0, totalBill - SECURITY_SHIELD_FEE) : totalBill;

  // حساب عمولة وقت الركن
  const appTimeCommission = Math.round(((timeOnlyRevenue * commissionRatePercent) / 100) * 100) / 100;
  const garageTimeNet = Math.max(0, timeOnlyRevenue - appTimeCommission);

  return {
    appShare: appTimeCommission + shieldApp,
    garageShare: garageTimeNet + shieldGarage,
    shieldAppShare: shieldApp,
    shieldGarageShare: shieldGarage,
  };
}

/**
 * ✅ تنسيق الوقت اللحظي إلى (00:00:00)
 */
export function formatTime(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0 || isNaN(totalSeconds)) return '00:00:00';
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
  if (!elapsedSeconds || elapsedSeconds <= 0 || isNaN(elapsedSeconds)) {
    return { minutes: 59, seconds: 59 };
  }
  const secondsInCurrentHour = Math.floor(elapsedSeconds) % 3600;
  const remaining = 3600 - secondsInCurrentHour;
  if (remaining <= 0 || remaining >= 3600) {
    return { minutes: 59, seconds: 59 };
  }
  return {
    minutes: Math.floor(remaining / 60),
    seconds: remaining % 60,
  };
}