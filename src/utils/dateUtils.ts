// src/utils/dateUtils.ts

/**
 * ✅ التاريخ المحلي الصحيح - بيراعي timezone مصر
 */

// ─── الحصول على تاريخ اليوم المحلي ────────────────────────────────────────
export const getLocalToday = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ─── الحصول على تاريخ أمس المحلي ──────────────────────────────────────────
export const getLocalYesterday = (): string => {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ─── بداية اليوم المحلي بالـ timestamp ────────────────────────────────────
export const getLocalDayStartMs = (dateStr: string): number => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
};

// ─── نهاية اليوم المحلي بالـ timestamp ────────────────────────────────────
export const getLocalDayEndMs = (dateStr: string): number => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
};

// ─── تحويل timestamp لتاريخ محلي YYYY-MM-DD ──────────────────────────────
export const timestampToLocalDate = (timestamp: number | string): string => {
  const ts = typeof timestamp === 'number' 
    ? timestamp 
    : new Date(timestamp).getTime();
  
  if (!ts || isNaN(ts)) return '';
  
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ─── تحويل timestamp لوقت محلي HH:MM ──────────────────────────────────────
export const timestampToLocalTime = (timestamp: number | string): string => {
  const ts = typeof timestamp === 'number' 
    ? timestamp 
    : new Date(timestamp).getTime();
  
  if (!ts || isNaN(ts)) return '';
  
  const date = new Date(ts);
  return date.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

// ─── فحص هل الـ timestamp يقع في يوم معين ─────────────────────────────────
export const isTimestampInLocalDay = (
  timestamp: number | string,
  dateStr: string
): boolean => {
  const ts = typeof timestamp === 'number' 
    ? timestamp 
    : new Date(timestamp).getTime();
  
  if (!ts || isNaN(ts) || !dateStr) return false;

  const dayStart = getLocalDayStartMs(dateStr);
  const dayEnd = getLocalDayEndMs(dateStr);

  return ts >= dayStart && ts <= dayEnd;
};

// ─── فحص هل الـ timestamp يقع بين تاريخين ─────────────────────────────────
export const isTimestampInRange = (
  timestamp: number | string,
  fromDate?: string,
  toDate?: string
): boolean => {
  const ts = typeof timestamp === 'number' 
    ? timestamp 
    : new Date(timestamp).getTime();
  
  if (!ts || isNaN(ts)) return false;

  if (fromDate) {
    const fromStart = getLocalDayStartMs(fromDate);
    if (ts < fromStart) return false;
  }

  if (toDate) {
    const toEnd = getLocalDayEndMs(toDate);
    if (ts > toEnd) return false;
  }

  return true;
};

// ─── حساب تاريخ قبل X أيام ────────────────────────────────────────────────
export const getLocalDaysAgo = (days: number): string => {
  const now = new Date();
  now.setDate(now.getDate() - days);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ─── تنسيق التاريخ بالعربي ────────────────────────────────────────────────
export const formatLocalDateArabic = (dateStr: string): string => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

// ─── استخراج الـ timestamp الآمن من الجلسة ──────────────────────────────────
export const getSafeTimestamp = (value?: number | string): number | null => {
  if (!value) return null;
  if (typeof value === 'number') return value;
  const parsed = new Date(value).getTime();
  return isNaN(parsed) ? null : parsed;
};