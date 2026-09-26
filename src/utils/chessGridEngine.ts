// src/utils/chessGridEngine.ts

export interface ChessSlot {
  slotId: string;       // مثل A1, A2, B3
  row: string;
  col: number;
  lat: number;
  lng: number;
}

export const haversineDistanceMeters = (
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * توليد كود مربع الشطرنج التلقائي بناءً على إحداثيات الجراج
 */
export const assignChessSlot = (
  carIndex: number,
  garageLat: number,
  garageLng: number
): ChessSlot => {
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const rowIndex = Math.floor(carIndex / 10) % rows.length;
  const colIndex = (carIndex % 10) + 1;
  const row = rows[rowIndex];

  // إزاحة جغرافية ميكرو (5 متر لكل خانة)
  const latOffset = (rowIndex * 0.000045);
  const lngOffset = (colIndex * 0.000045);

  return {
    slotId: `${row}${colIndex}`,
    row,
    col: colIndex,
    lat: garageLat + latOffset,
    lng: garageLng + lngOffset,
  };
};

/**
 * فحص التصادم المكاني (هل المربع محجوز لعربية درع نشطة؟)
 */
export const checkChessCollision = (
  sessions: any[],
  targetLat: number,
  targetLng: number,
  thresholdMeters: number = 4
): any | null => {
  return sessions.find((s) => {
    if (s.status !== 'active' || !s.securityShieldActive) return false;
    const lat = s.anchorLat || s.shieldAnchorLat;
    const lng = s.anchorLng || s.shieldAnchorLng;
    if (!lat || !lng) return false;

    const dist = haversineDistanceMeters(targetLat, targetLng, lat, lng);
    return dist <= thresholdMeters;
  }) || null;
};