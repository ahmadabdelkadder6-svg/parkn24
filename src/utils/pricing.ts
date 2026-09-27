/**
 * ⏱️ محرك حسابات الوقت والتكلفة المحدث + طبقة درع الأمان VIP (10 ج.م)
 */

// 🛡️ الثوابت المالية لدرع الأمان VIP
export const SHIELD_VIP_FEE = 10;          // إجمالي رسوم الدرع (10 جنيه)
export const SHIELD_APP_SHARE = 5;         // نصيب التطبيق (5 جنيه)
export const SHIELD_GARAGE_SHARE = 5;      // نصيب الجراج (5 جنيه)

/**
 * ✅ حساب الساعات المحسوبة (من 1 إلى 60 دقيقة = ساعة، من 61 إلى 120 = ساعتان.. إلخ)
 */
export function calculateFullHours(elapsedSeconds: number): number {
  if (!elapsedSeconds || elapsedSeconds <= 0 || isNaN(elapsedSeconds)) return 0;
  return Math.ceil(elapsedSeconds / 3600);
}

/**
 * ✅ حساب التكلفة العادية
 */
export function calculateCost(elapsedSeconds: number, ratePerHour: number): number {
  if (!elapsedSeconds || elapsedSeconds <= 0 || !ratePerHour || ratePerHour <= 0) return 0;
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
  if (!ratePerHour || ratePerHour <= 0 || !elapsedSeconds || elapsedSeconds <= 0) {
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
 * 🛡️✨ دالة احترافية شاملة لحساب التكلفة النهائية مع درع الأمان VIP
 * تدمج الركنة + الهدية الترحيبية + رسوم الـ 10 جنيه الخاصة بالدرع
 */
export function calculateTotalCostWithShield(
  elapsedSeconds: number,
  ratePerHour: number,
  isFreeSession: boolean = false,
  isShieldActive: boolean = false
): {
  totalCost: number;          // الإجمالي النهائي المطلوب دفعه
  parkingCost: number;        // تكلفة الركن فقط (بعد خصم الهدية إن وجدت)
  shieldFee: number;          // رسوم الدرع (10ج لو فعال أو 0)
  appShieldShare: number;     // نصيب التطبيق من الدرع (5ج)
  garageShieldShare: number;  // نصيب الجراج من الدرع (5ج)
  paidHours: number;
  totalHours: number;
  isFree: boolean;
  savedAmount: number;
} {
  // 1. حساب تكلفة الركن الأساسية باستخدام المعادلة الأصلية
  const basePricing = calculateCostWithLoyalty(elapsedSeconds, ratePerHour, isFreeSession);
  
  // 2. حساب رسوم الدرع الذكي VIP
  const shieldFee = isShieldActive ? SHIELD_VIP_FEE : 0;
  const appShieldShare = isShieldActive ? SHIELD_APP_SHARE : 0;
  const garageShieldShare = isShieldActive ? SHIELD_GARAGE_SHARE : 0;

  // 3. الإجمالي النهائي (سعر الركنة + 10 جنيه تأمين الدرع)
  const totalCost = basePricing.cost + shieldFee;

  return {
    totalCost,
    parkingCost: basePricing.cost,
    shieldFee,
    appShieldShare,
    garageShieldShare,
    paidHours: basePricing.paidHours,
    totalHours: basePricing.totalHours,
    isFree: basePricing.isFree,
    savedAmount: basePricing.savedAmount,
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