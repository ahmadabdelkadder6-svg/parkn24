// src/utils/commissionEngine.ts

/**
 * 💰 محرك العمولة والتسويات المالية (Commission & Settlement Engine)
 * 
 * القواعد:
 * - رسوم الخدمة = 10 جنيه ثابتة لكل جلسة محمية
 * - تقسيم مناصفة: 5 جنيه لصاحب التطبيق + 5 جنيه للجراج
 * - تُحسب فقط عند إتمام الجلسة بنجاح (لا تُخصم عند الإلغاء)
 * - التسويات تراكمية شهرية
 * - لا يلمس أي كود دفع أو تحصيل قديم
 */

export const SERVICE_FEE = 10;          // إجمالي رسوم الخدمة بالجنيه
export const APP_SHARE_PERCENT = 50;    // نسبة صاحب التطبيق
export const GARAGE_SHARE_PERCENT = 50; // نسبة الجراج

export interface CommissionBreakdown {
  totalFee: number;
  appShare: number;
  garageShare: number;
  currency: string;
}

export interface SettlementRecord {
  garageId: string;
  garageName: string;
  period: string;           // "2025-07" مثلاً
  totalSessions: number;
  totalRevenue: number;
  garageShare: number;
  appShare: number;
  status: 'pending' | 'settled' | 'disputed';
  settledAt?: string;
}

// ═══════════════════════════════════════════════════════
// 1️⃣ حساب عمولة الجلسة الواحدة
// ═══════════════════════════════════════════════════════
export const calculateSessionCommission = (
  customFee?: number
): CommissionBreakdown => {
  const totalFee = customFee ?? SERVICE_FEE;
  const appShare = Math.round((totalFee * APP_SHARE_PERCENT) / 100 * 100) / 100;
  const garageShare = Math.round((totalFee * GARAGE_SHARE_PERCENT) / 100 * 100) / 100;

  return {
    totalFee,
    appShare,
    garageShare,
    currency: 'EGP',
  };
};

// ═══════════════════════════════════════════════════════
// 2️⃣ حساب التسوية التراكمية لجراج معين
// ═══════════════════════════════════════════════════════
export const calculateGarageSettlement = (
  garageId: string,
  garageName: string,
  completedSessionsCount: number,
  period: string = getCurrentPeriod()
): SettlementRecord => {
  const commission = calculateSessionCommission();
  const totalRevenue = completedSessionsCount * commission.totalFee;

  return {
    garageId,
    garageName,
    period,
    totalSessions: completedSessionsCount,
    totalRevenue,
    garageShare: completedSessionsCount * commission.garageShare,
    appShare: completedSessionsCount * commission.appShare,
    status: 'pending',
  };
};

// ═══════════════════════════════════════════════════════
// 3️⃣ هل الجلسة مؤهلة لخصم العمولة؟
// ═══════════════════════════════════════════════════════
export const isSessionEligibleForCommission = (session: {
  is_shield_active?: boolean;
  status?: string;
  breach_reason?: string | null;
}): boolean => {
  // العمولة تُخصم فقط لو:
  // 1. الدرع كان مفعلاً
  // 2. الجلسة مكتملة (مش ملغية)
  // 3. مفيش اختراق (السرقة = لا عمولة = أولوية الأمان)
  return (
    session.is_shield_active === true &&
    session.status === 'completed' &&
    !session.breach_reason
  );
};

// ═══════════════════════════════════════════════════════
// 4️⃣ ملخص التسويات الشهرية (لوحة التحكم)
// ═══════════════════════════════════════════════════════
export const generateMonthlySummary = (
  settlements: SettlementRecord[]
): {
  totalSessions: number;
  totalRevenue: number;
  totalAppEarnings: number;
  totalGaragePayouts: number;
  pendingCount: number;
  settledCount: number;
} => {
  return settlements.reduce(
    (acc, s) => ({
      totalSessions: acc.totalSessions + s.totalSessions,
      totalRevenue: acc.totalRevenue + s.totalRevenue,
      totalAppEarnings: acc.totalAppEarnings + s.appShare,
      totalGaragePayouts: acc.totalGaragePayouts + s.garageShare,
      pendingCount: acc.pendingCount + (s.status === 'pending' ? 1 : 0),
      settledCount: acc.settledCount + (s.status === 'settled' ? 1 : 0),
    }),
    {
      totalSessions: 0,
      totalRevenue: 0,
      totalAppEarnings: 0,
      totalGaragePayouts: 0,
      pendingCount: 0,
      settledCount: 0,
    }
  );
};

// ═══════════════════════════════════════════════════════
// 5️⃣ دالة مساعدة: الشهر الحالي
// ═══════════════════════════════════════════════════════
function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}