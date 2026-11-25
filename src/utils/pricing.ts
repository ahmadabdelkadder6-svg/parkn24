// src/utils/pricing.ts
/**
 * ⏱️ الثوابت الزمنية لحساب الركنات
 */
export const SECONDS_IN_HOUR = 3600;
export const FREE_SESSION_SECONDS = 1800; // 30 دقيقة مجانية (1800 ثانية)

export interface LoyaltyCostResult {
  cost: number;
  paidHours: number;
  totalHours: number;
  isFree: boolean;
  savedAmount: number;
  rateValid?: boolean;
}

function toSafePositiveNumber(val: unknown): number {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return num;
}

function roundMoney(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100) / 100;
}

/**
 * ✅ حساب الساعات المحسوبة (من 1 إلى 60 دقيقة = ساعة، من 61 إلى 120 = ساعتان.. إلخ)
 */
export function calculateFullHours(elapsedSeconds: number): number {
  const safeVal = toSafePositiveNumber(elapsedSeconds);
  if (safeVal <= 0) return 0;
  const safeSeconds = Math.floor(safeVal);
  if (safeSeconds <= 0) return 0;
  return Math.ceil(safeSeconds / SECONDS_IN_HOUR);
}

/**
 * ✅ حساب التكلفة العادية
 */
export function calculateCost(elapsedSeconds: number, ratePerHour: number): number {
  const safeRate = toSafePositiveNumber(ratePerHour);
  if (safeRate <= 0) return 0;

  const hours = calculateFullHours(elapsedSeconds);
  if (hours <= 0) return 0;

  return roundMoney(hours * safeRate);
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
  isFreeSession: boolean = false
): LoyaltyCostResult {
  const safeRate = toSafePositiveNumber(ratePerHour);
  const safeElapsed = toSafePositiveNumber(elapsedSeconds);
  const freeFlag = Boolean(isFreeSession);

  if (safeRate <= 0 || safeElapsed <= 0) {
    return {
      cost: 0,
      paidHours: 0,
      totalHours: 0,
      isFree: freeFlag,
      savedAmount: 0,
      rateValid: safeRate > 0,
    };
  }

  const safeSeconds = Math.floor(safeElapsed);
  if (safeSeconds <= 0) {
    return {
      cost: 0,
      paidHours: 0,
      totalHours: 0,
      isFree: freeFlag,
      savedAmount: 0,
      rateValid: true,
    };
  }

  const standardHours = calculateFullHours(safeSeconds);
  const standardCost = roundMoney(standardHours * safeRate);

  // إذا كانت الجلسة مستحقة للهدية ومدة الركن 30 دقيقة أو أقل (<= 1800 ثانية)
  if (freeFlag && safeSeconds <= FREE_SESSION_SECONDS) {
    return {
      cost: 0,
      paidHours: 0,
      totalHours: standardHours,
      isFree: true,
      savedAmount: standardCost,
      rateValid: true,
    };
  }

  // إذا تجاوزت الـ 30 دقيقة أو لم تكن الجلسة مشمولة بالهدية
  return {
    cost: standardCost,
    paidHours: standardHours,
    totalHours: standardHours,
    isFree: false,
    savedAmount: 0,
    rateValid: true,
  };
}

/**
 * ✅ تنسيق الوقت اللحظي إلى (00:00:00)
 */
export function formatTime(totalSeconds: number): string {
  const safeVal = toSafePositiveNumber(totalSeconds);
  if (safeVal <= 0) return '00:00:00';
  const total = Math.floor(safeVal);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * ✅ حساب الوقت المتبقي لانتهاء الساعة الحالية
 */
export function getRemainingInCurrentHour(elapsedSeconds: number): { minutes: number; seconds: number } {
  const safeVal = toSafePositiveNumber(elapsedSeconds);
  if (safeVal <= 0) {
    return { minutes: 59, seconds: 59 };
  }
  const safeSeconds = Math.floor(safeVal);
  if (safeSeconds <= 0) {
    return { minutes: 59, seconds: 59 };
  }
// src/utils/pricing.ts
/**
 * ⏱️ الثوابت الزمنية لحساب الركنات
 */
export const SECONDS_IN_HOUR = 3600;
export const FREE_SESSION_SECONDS = 1800; // 30 دقيقة مجانية (1800 ثانية)

export interface LoyaltyCostResult {
  cost: number;
  paidHours: number;
  totalHours: number;
  isFree: boolean;
  savedAmount: number;
  rateValid?: boolean;
}

function toSafePositiveNumber(val: unknown): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) && val > 0 ? val : 0;
  }
  if (typeof val === 'string') {
    const normalized = val
      .trim()
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    const num = Number(normalized);
    return Number.isFinite(num) && num > 0 ? num : 0;
  }
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return num;
}

function roundMoney(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100) / 100;
}

/**
 * ✅ حساب الساعات المحسوبة (من 1 إلى 60 دقيقة = ساعة، من 61 إلى 120 = ساعتان.. إلخ)
 */
export function calculateFullHours(elapsedSeconds: number): number {
  const safeVal = toSafePositiveNumber(elapsedSeconds);
  if (safeVal <= 0) return 0;
  const safeSeconds = Math.floor(safeVal);
  if (safeSeconds <= 0) return 0;
  return Math.ceil(safeSeconds / SECONDS_IN_HOUR);
}

/**
 * ✅ حساب التكلفة العادية
 */
export function calculateCost(elapsedSeconds: number, ratePerHour: number): number {
  const safeRate = toSafePositiveNumber(ratePerHour);
  if (safeRate <= 0) return 0;
  const hours = calculateFullHours(elapsedSeconds);
  if (hours <= 0) return 0;
  return roundMoney(hours * safeRate);
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
  isFreeSession: boolean = false
): LoyaltyCostResult {
  const safeRate = toSafePositiveNumber(ratePerHour);
  const safeElapsed = toSafePositiveNumber(elapsedSeconds);
  const freeFlag = Boolean(isFreeSession);

  if (safeRate <= 0) {
    return {
      cost: 0,
      paidHours: 0,
      totalHours: 0,
      isFree: freeFlag,
      savedAmount: 0,
      rateValid: false,
    };
  }

  const safeSeconds = Math.floor(safeElapsed);
  if (safeSeconds <= 0) {
    return {
      cost: 0,
      paidHours: 0,
      totalHours: freeFlag ? 1 : 0,
      isFree: freeFlag,
      savedAmount: freeFlag ? roundMoney(safeRate) : 0,
      rateValid: true,
    };
  }

  const standardHours = calculateFullHours(safeSeconds);
  const standardCost = roundMoney(standardHours * safeRate);

  // إذا كانت الجلسة مستحقة للهدية ومدة الركن 30 دقيقة أو أقل (<= 1800 ثانية)
  if (freeFlag && safeSeconds <= FREE_SESSION_SECONDS) {
    return {
      cost: 0,
      paidHours: 0,
      totalHours: standardHours,
      isFree: true,
      savedAmount: standardCost,
      rateValid: true,
    };
  }

  // إذا تجاوزت الـ 30 دقيقة أو لم تكن الجلسة مشمولة بالهدية
  return {
    cost: standardCost,
    paidHours: standardHours,
    totalHours: standardHours,
    isFree: false,
    savedAmount: 0,
    rateValid: true,
  };
}

/**
 * ✅ تنسيق الوقت اللحظي إلى (00:00:00)
 */
export function formatTime(totalSeconds: number): string {
  const safeVal = toSafePositiveNumber(totalSeconds);
  if (safeVal <= 0) return '00:00:00';
  const total = Math.floor(safeVal);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * ✅ حساب الوقت المتبقي لانتهاء الساعة الحالية
 */
export function getRemainingInCurrentHour(elapsedSeconds: number): { minutes: number; seconds: number } {
  const safeVal = toSafePositiveNumber(elapsedSeconds);
  if (safeVal <= 0) {
    return { minutes: 59, seconds: 59 };
  }
  const safeSeconds = Math.floor(safeVal);
  if (safeSeconds <= 0) {
    return { minutes: 59, seconds: 59 };
  }
  const secondsInCurrentHour = safeSeconds % SECONDS_IN_HOUR;
  if (secondsInCurrentHour === 0) {
    return { minutes: 0, seconds: 0 };
  }
  const remaining = SECONDS_IN_HOUR - secondsInCurrentHour;
  return {
    minutes: Math.floor(remaining / 60),
    seconds: remaining % 60,
  };
}
  const secondsInCurrentHour = safeSeconds % SECONDS_IN_HOUR;
  if (secondsInCurrentHour === 0) {
    return { minutes: 0, seconds: 0 };
  }

  const remaining = SECONDS_IN_HOUR - secondsInCurrentHour;
  return {
    minutes: Math.floor(remaining / 60),
    seconds: remaining % 60,
  };
}