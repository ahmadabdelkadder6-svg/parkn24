// ═══════════════════════════════════════════════════════════
// 🛡️ Car Shield Engine — Local-First (الموبايل يفكر لوحده)
// ═══════════════════════════════════════════════════════════

export type AlertType = 'warning' | 'resolved' | 'status' | 'report' | 'qrScan';

export interface FakeAlert {
  type: AlertType;
  title: string;
  body: string;
  icon: string;
}

export interface ShieldState {
  isActive: boolean;
  shieldCode: string | null;
  phone: string | null;
  garageId: string | null;
  parkingLat: number | null;
  parkingLng: number | null;
  learnedVibration: boolean;
}

// ─── ثوابت ───
export const SHIELD_COST = 7;
export const SHIELD_STORAGE_KEY = 'parkn24_shield';
export const GEOFENCE_RADIUS = 250;
export const GEOFENCE_GRACE_MS = 90_000; // 90 ثانية
export const VIBRATION_THRESHOLD = 15; // m/s²
export const VIBRATION_COUNT = 3;
export const VIBRATION_WINDOW = 5000; // 5 ثواني

// ─── بنك الإشعارات الوهمية ───
// warning(15%) + resolved(25%) + status(40%) + report(12%) + qrScan(8%) = 100%
const ALERT_POOL: FakeAlert[] = [
  // ⚠️ warning — 15%
  { type: 'warning', title: '⚠️ تنبيه أمني', body: 'تم رصد حركة غير مألوفة حول السيارة', icon: '⚠️' },
  { type: 'warning', title: '⚠️ تنبيه أمني', body: 'شخص يقترب من باب السائق', icon: '⚠️' },
  { type: 'warning', title: '⚠️ تنبيه أمني', body: 'تم لمس مقبض الباب الخلفي', icon: '⚠️' },

  // ✅ resolved — 25%
  { type: 'resolved', title: '✅ تم الحل', body: 'الحركة كانت عادية — كلو تمام', icon: '✅' },
  { type: 'resolved', title: '✅ تم الحل', body: 'كان شخص بيمر جنب العربية', icon: '✅' },
  { type: 'resolved', title: '✅ تم الحل', body: 'تنبيه كاذب — العربية سليمة', icon: '✅' },
  { type: 'resolved', title: '✅ تم الحل', body: 'عامل الجراج كان بيمر', icon: '✅' },
  { type: 'resolved', title: '✅ تم الحل', body: 'قط كان فوق الكابوت 😺', icon: '✅' },

  // 🛡️ status — 40%
  { type: 'status', title: '🛡️ الدرع نشط', body: 'السيارة محمية ومراقبة', icon: '🛡️' },
  { type: 'status', title: '🛡️ الدرع نشط', body: 'كل الحساسات شغالة', icon: '🛡️' },
  { type: 'status', title: '🔋 حالة النظام', body: 'البطارية مستقرة — الدرع يعمل بكفاءة', icon: '🔋' },
  { type: 'status', title: '📡 الاتصال', body: 'متصل بخادم المراقبة', icon: '📡' },
  { type: 'status', title: '🛡️ تحديث', body: 'تم تحديث بروتوكول الحماية', icon: '🛡️' },
  { type: 'status', title: '🌡️ الحرارة', body: 'درجة حرارة المحرك طبيعية', icon: '🌡️' },
  { type: 'status', title: '🔒 الأقفال', body: 'جميع الأبواب مقفلة', icon: '🔒' },
  { type: 'status', title: '📍 الموقع', body: 'السيارة في مكانها', icon: '📍' },

  // 📋 report — 12%
  { type: 'report', title: '📋 تقرير', body: 'لا توجد حوادث خلال الفترة الماضية', icon: '📋' },
  { type: 'report', title: '📋 تقرير', body: 'تم تسجيل 0 محاولات اقتحام', icon: '📋' },

  // 📱 qrScan — 8%
  { type: 'qrScan', title: '📱 مسح QR', body: 'شخص مسح كود الاستيكر — تم تسجيله', icon: '📱' },
  { type: 'qrScan', title: '📱 مسح QR', body: 'عامل الجراج تحقق من الاستيكر', icon: '📱' },
];

const ALERT_WEIGHTS: { type: AlertType; weight: number }[] = [
  { type: 'warning', weight: 15 },
  { type: 'resolved', weight: 25 },
  { type: 'status', weight: 40 },
  { type: 'report', weight: 12 },
  { type: 'qrScan', weight: 8 },
];

function pickRandomAlert(): FakeAlert {
  const roll = Math.random() * 100;
  let cumulative = 0;
  let selectedType: AlertType = 'status';
  for (const { type, weight } of ALERT_WEIGHTS) {
    cumulative += weight;
    if (roll < cumulative) { selectedType = type; break; }
  }
  const pool = ALERT_POOL.filter((a) => a.type === selectedType);
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Haversine (مستقلة عن الـ store — Local-First) ───
export function haversine(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ═══════════════════════════════════════════════════════════
// 📢 محرك الإشعارات الوهمية
// ═══════════════════════════════════════════════════════════
let fakeAlertTimers: ReturnType<typeof setTimeout>[] = [];

export function startFakeAlerts(
  onAlert: (alert: FakeAlert) => void,
  options?: {
    onWarningResolved?: (warning: FakeAlert, resolved: FakeAlert) => void;
  },
): void {
  stopFakeAlerts();

  // 35% صفر | 35% رسالة | 30% رسالتين
  const roll = Math.random() * 100;
  const alertCount = roll < 35 ? 0 : roll < 70 ? 1 : 2;
  if (alertCount === 0) return;

  const schedule = (delay: number) => {
    const t = setTimeout(() => {
      const alert = pickRandomAlert();
      onAlert(alert);

      // لو warning → resolved تلقائي بعد 30-90 ثانية
      if (alert.type === 'warning' && options?.onWarningResolved) {
        const resolveDelay = (30 + Math.random() * 60) * 1000;
        const rt = setTimeout(() => {
          const resolvedPool = ALERT_POOL.filter((a) => a.type === 'resolved');
          const resolved = resolvedPool[Math.floor(Math.random() * resolvedPool.length)];
          options.onWarningResolved!(alert, resolved);
        }, resolveDelay);
        fakeAlertTimers.push(rt);
      }
    }, delay);
    fakeAlertTimers.push(t);
  };

  // أول إشعار: 5-20 دقيقة
  const firstDelay = (5 + Math.random() * 15) * 60 * 1000;
  schedule(firstDelay);

  // تاني إشعار (لو موجود): 15-40 دقيقة بعد الأول
  if (alertCount === 2) {
    const secondDelay = firstDelay + (15 + Math.random() * 25) * 60 * 1000;
    schedule(secondDelay);
  }
}

export function stopFakeAlerts(): void {
  fakeAlertTimers.forEach(clearTimeout);
  fakeAlertTimers = [];
}

// ═══════════════════════════════════════════════════════════
// 📍 GPS Geofence (خفيف — ~3%/ساعة)
// ═══════════════════════════════════════════════════════════
let gpsWatchId: number | null = null;

export function startShieldGPS(params: {
  parkingLat: number;
  parkingLng: number;
  onGeofenceBreach: (distance: number) => void;
}): () => void {
  stopShieldGPS();
  if (!navigator.geolocation) return () => {};

  let breachStart: number | null = null;

  gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const dist = haversine(
        params.parkingLat, params.parkingLng,
        pos.coords.latitude, pos.coords.longitude,
      );
      if (dist > GEOFENCE_RADIUS) {
        if (!breachStart) breachStart = Date.now();
        if (Date.now() - breachStart >= GEOFENCE_GRACE_MS) {
          params.onGeofenceBreach(dist);
        }
      } else {
        breachStart = null; // رجع جوه الدائرة → إلغاء العد
      }
    },
    (err) => console.warn('Shield GPS:', err.message),
    { enableHighAccuracy: false, maximumAge: 25000, timeout: 30000 },
  );

  return () => stopShieldGPS();
}

export function stopShieldGPS(): void {
  if (gpsWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
}

// ═══════════════════════════════════════════════════════════
// 📳 تعلم الاهتزاز (Accelerometer)
// ═══════════════════════════════════════════════════════════
export function startVibrationDemo(onLearned: () => void): () => void {
  let learned = false;
  const timestamps: number[] = [];

  const handler = (e: DeviceMotionEvent) => {
    if (learned) return;
    const acc = e.accelerationIncludingGravity;
    if (!acc) return;
    const force = Math.sqrt((acc.x ?? 0) ** 2 + (acc.y ?? 0) ** 2 + (acc.z ?? 0) ** 2);
    if (force > VIBRATION_THRESHOLD) {
      const now = Date.now();
      timestamps.push(now);
      // احتفظ بالضربات في آخر 5 ثواني بس
      while (timestamps.length > 0 && now - timestamps[0] > VIBRATION_WINDOW) {
        timestamps.shift();
      }
      if (timestamps.length >= VIBRATION_COUNT) {
        learned = true;
        window.removeEventListener('devicemotion', handler);
        onLearned();
      }
    }
  };

  // iOS 13+ يحتاج إذن
  if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
    (DeviceMotionEvent as any)
      .requestPermission()
      .then((state: string) => {
        if (state === 'granted') window.addEventListener('devicemotion', handler);
        else { learned = true; onLearned(); }
      })
      .catch(() => { learned = true; onLearned(); });
  } else {
    window.addEventListener('devicemotion', handler);
  }

  return () => { learned = true; window.removeEventListener('devicemotion', handler); };
}


// ═══════════════════════════════════════════════════════════
// 🧹 تدمير الدرع بالكامل
// ═══════════════════════════════════════════════════════════
export function destroyShield(): void {
  stopFakeAlerts();
  stopShieldGPS();
  // الصوت والاهتزاز بيتوقفوا من ShieldOverlay عبر notifications.ts
  try { localStorage.removeItem(SHIELD_STORAGE_KEY); } catch { /* */ }
}

// ═══════════════════════════════════════════════════════════
// 💾 حفظ/تحميل حالة الدرع (localStorage)
// ═══════════════════════════════════════════════════════════
export function saveShieldState(state: ShieldState): void {
  try { localStorage.setItem(SHIELD_STORAGE_KEY, JSON.stringify(state)); } catch { /* */ }
}

export function loadShieldState(): ShieldState | null {
  try {
    const raw = localStorage.getItem(SHIELD_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ShieldState) : null;
  } catch { return null; }
}