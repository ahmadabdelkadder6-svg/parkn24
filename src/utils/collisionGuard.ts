// ============================================================
// 🛡️ Collision Guard - نظام منع التصادم البسيط والاحترافي
// ============================================================
// الفكرة: كل سيارة محمية ليها نقطة GPS
// لما سايس يحاول يركن سيارة جديدة → نحسب المسافة بينها
// وبين أقرب سيارة محمية → لو أقل من الحد الأدنى → نرفض
// ============================================================

export interface ProtectedCar {
  session_id: string;
  plate_number?: string;
  lat: number;
  lng: number;
  shield_active: boolean;
}

export interface CollisionResult {
  isCollision: boolean;
  nearestCar: ProtectedCar | null;
  distanceMeters: number;
  message: string;
}

// ──────────────────────────────────────────────
// 1️⃣ حساب المسافة بين نقطتين GPS (Haversine)
// ──────────────────────────────────────────────
export function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // نصف قطر الأرض بالمتر
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// ──────────────────────────────────────────────
// 2️⃣ فحص التصادم مع أقرب سيارة محمية
// ──────────────────────────────────────────────
export function checkCollision(
  newLat: number,
  newLng: number,
  protectedCars: ProtectedCar[],
  minDistanceMeters: number = 3.0 // 3 متر = طول سيارة + هامش أمان
): CollisionResult {

  // لو مفيش عربيات محمية → مفيش تصادم
  if (!protectedCars || protectedCars.length === 0) {
    return {
      isCollision: false,
      nearestCar: null,
      distanceMeters: Infinity,
      message: "✅ المكان فاضي، اركن براحتك",
    };
  }

  // لف على كل العربيات المحمية ودور على الأقرب
  let nearestCar: ProtectedCar | null = null;
  let shortestDistance = Infinity;

  for (const car of protectedCars) {
    // تجاهل العربيات اللي درعها مش شغال
    if (!car.shield_active) continue;

    const distance = calculateDistanceMeters(
      newLat,
      newLng,
      car.lat,
      car.lng
    );

    if (distance < shortestDistance) {
      shortestDistance = distance;
      nearestCar = car;
    }
  }

  // لو أقرب عربية أقرب من الحد الأدنى → تصادم!
  if (nearestCar && shortestDistance < minDistanceMeters) {
    return {
      isCollision: true,
      nearestCar,
      distanceMeters: Math.round(shortestDistance * 100) / 100,
      message: `🚫 ممنوع! في سيارة محمية على بُعد ${Math.round(shortestDistance)}م فقط${
        nearestCar.plate_number ? ` (${nearestCar.plate_number})` : ""
      }`,
    };
  }

  // مفيش تصادم
  return {
    isCollision: false,
    nearestCar,
    distanceMeters: Math.round(shortestDistance * 100) / 100,
    message: `✅ المكان آمن، أقرب سيارة على بُعد ${Math.round(shortestDistance)}م`,
  };
}

// ──────────────────────────────────────────────
// 3️⃣ فحص سريع (Boolean) - للتحقق اللحظي
// ──────────────────────────────────────────────
export function isSpotSafe(
  newLat: number,
  newLng: number,
  protectedCars: ProtectedCar[],
  minDistanceMeters: number = 3.0
): boolean {
  return !checkCollision(newLat, newLng, protectedCars, minDistanceMeters)
    .isCollision;
}