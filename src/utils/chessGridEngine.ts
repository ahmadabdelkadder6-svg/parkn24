// src/utils/chessGridEngine.ts

export interface ChessSlot {
  slotId: string;       // مثل A1, A2, B3
  row: string;
  col: number;
}

/**
 * ✅ تعيين مربع شطرنج تلقائي تتابعي ومنظم للسيارات بكل سلاسة وبدون تعقيد
 */
export const assignChessSlot = (carIndex: number): ChessSlot => {
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const rowIndex = Math.floor(carIndex / 10) % rows.length;
  const colIndex = (carIndex % 10) + 1;
  const row = rows[rowIndex];

  return {
    slotId: `${row}${colIndex}`,
    row,
    col: colIndex,
  };
};

/**
 * 🛰️ دالة حساب المسافات الجغرافية بالمتر (Haversine Formula)
 * ضرورية جداً لنظام تتبع الـ GPS وفلاتر منع الإنذارات الكاذبة في الخلفية
 */
export const haversineDistanceMeters = (
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number => {
  const R = 6371000; // نصف قطر الأرض بالمتر
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * 🧹 تم الاستغناء نهائياً عن فحص التصادم المكاني القديم (checkChessCollision)
 * لتسريع وضمان عمل أزرار التحصيل والوصول دون تجميد أو تعليق في الواقع العملي.
 */