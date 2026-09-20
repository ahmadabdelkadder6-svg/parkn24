import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Car, Clock, LogOut, Plus, CheckCircle, XCircle, Settings,
  Minus, Save, MapPin, Edit3, Navigation, Phone, CarFront, FileText,
  CalendarDays, Undo2, Shield, HardHat, Users, Percent, Building2, Gift,
  Search, X, CreditCard, MapPinOff, Locate, AlertTriangle, Wifi, WifiOff, Eye,
} from 'lucide-react';
import { useStore, pausePolling, normalizePlate, getServerNow } from '../store';
import { supabase } from '../lib/supabase';
import { calculateFullHours, calculateCost } from '../utils/pricing';
import toast from 'react-hot-toast';
import { subscribeToPush } from '../lib/pushManager';

const UNDO_TIMEOUT_SECONDS = 30;
const GEOFENCE_RADIUS_METERS = 250;

// ⏱️ إعدادات التزامن الذكي للخلفية
const VALET_PING_INTERVAL_MS = 8000;
const VALET_LIVE_THRESHOLD_MS = 25000;
const VALET_BACKGROUND_GRACE_MS = 10 * 60 * 1000;

/* ─── 🎨 الألوان الرسمية الفاخرة لتطبيق Park'n 24 ─── */
const BRAND = {
  blue: '#1656b8',       // الأزرق الرسمي للوجو
  blueDark: '#0f3d85',   // الكحلي الفخم
  blueLight: '#e8f0fe',  // الأزرق الفاتح جداً
  blueSoft: '#f0f5ff',   // خلفية ناعمة مريحة
  green: '#8cc63f',      // الأخضر الرسمي للوجو
  greenDark: '#6ea62a',  // أخضر داكن للخطوط والنصوص
  greenLight: '#f2fae6', // خلفية خضراء ناعمة
  navy: '#0a1628',       // الكحلي الليلي الغامق
  slate: '#475569',      // الرمادي الهادئ
  slateMuted: '#94a3b8', // الرمادي الباهت
  border: '#e2e8f0',     // الحدود الرمادية الناعمة
  card: '#ffffff',       // الكروت البيضاء النظيفة
  bg: '#f4f7fc',         // الخلفية العامة المريحة
};

interface UndoableSession {
  sessionId: string;
  localId: string;
  carPlate: string;
  price: number;
  addedAt: number;
}

interface DailyStat {
  garage_id: string;
  stat_date: string;
  total_sessions: number;
  manual_sessions: number;
  app_sessions: number;
  total_revenue: number;
  cash_revenue: number;
  instapay_revenue: number;
  wallet_revenue: number;
  cashwallet_revenue: number;
  confirmed_revenue: number;
  pending_revenue: number;
}

// ==========================================
// 🌍 نظام السياج الجغرافي الذكي (GEOFENCE ENGINE)
// ==========================================

interface GeofenceState {
  status: 'loading' | 'inside' | 'outside' | 'denied' | 'error' | 'no_garage_coords';
  distance: number | null;
  accuracy: number | null;
  lastCheck: number;
  errorMessage?: string;
}

const extractGarageCoords = (garage: any): { lat: number; lng: number } | null => {
  if (!garage) return null;
  const lat = parseFloat(garage.latitude ?? garage.lat ?? garage.location_lat);
  const lng = parseFloat(garage.longitude ?? garage.lng ?? garage.location_lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
    return { lat, lng };
  }
  return null;
};

const haversineDistance = (
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const useValetGeofence = (
  enabled: boolean,
  garageCoords: { lat: number; lng: number } | null,
  radiusMeters: number = GEOFENCE_RADIUS_METERS
): GeofenceState => {
  const [state, setState] = useState<GeofenceState>({
    status: 'loading',
    distance: null,
    accuracy: null,
    lastCheck: 0,
  });

  const watchIdRef = useRef<number | null>(null);
  const lastValidInsideTsRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'inside', distance: 0, accuracy: null, lastCheck: Date.now() });
      return;
    }

    if (!garageCoords) {
      setState({
        status: 'no_garage_coords',
        distance: null,
        accuracy: null,
        lastCheck: Date.now(),
        errorMessage: 'لم يتم تسجيل إحداثيات الجراج على الخريطة'
      });
      return;
    }

    if (!('geolocation' in navigator)) {
      setState({
        status: 'error',
        distance: null,
        accuracy: null,
        lastCheck: Date.now(),
        errorMessage: 'خاصية الـ GPS غير مدعومة على هذا الجهاز'
      });
      return;
    }

    const handleSuccess = (position: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = position.coords;
      const dist = haversineDistance(latitude, longitude, garageCoords.lat, garageCoords.lng);
      const isInside = dist <= radiusMeters;
      const now = Date.now();

      if (isInside) {
        lastValidInsideTsRef.current = now;
      }

      setState({
        status: isInside ? 'inside' : 'outside',
        distance: Math.round(dist),
        accuracy: Math.round(accuracy),
        lastCheck: now,
      });
    };

    const handleError = (error: GeolocationPositionError) => {
      const now = Date.now();
      const timeSinceLastInside = now - lastValidInsideTsRef.current;

      if (error.code === error.PERMISSION_DENIED) {
        setState({
          status: 'denied',
          distance: null,
          accuracy: null,
          lastCheck: now,
          errorMessage: 'يجب تفعيل إذن الموقع للتمكن من العمل',
        });
        return;
      }

      if (lastValidInsideTsRef.current > 0 && timeSinceLastInside < 25000) {
        return;
      }

      let errorMsg = 'تعذر تحديد موقعك الحالي';
      if (error.code === error.POSITION_UNAVAILABLE) {
        errorMsg = 'يرجى التأكد من تشغيل الـ GPS بالهاتف';
      } else if (error.code === error.TIMEOUT) {
        errorMsg = 'ضعف في إشارة الـ GPS، جاري إعادة المحاولة تلقائياً...';
      }

      setState({
        status: 'error',
        distance: null,
        accuracy: null,
        lastCheck: now,
        errorMessage: errorMsg,
      });
    };

    const stableOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 4000,
    };

    watchIdRef.current = navigator.geolocation.watchPosition(handleSuccess, handleError, stableOptions);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled, garageCoords?.lat, garageCoords?.lng, radiusMeters]);

  return state;
};

interface ValetLocationInfo {
  valetNumber: number;
  valetName: string;
  isActive: boolean;
  status: 'inside' | 'outside' | 'offline' | 'inactive';
  distance: number | null;
  lastSeen: number | null;
  isBackground?: boolean;
}

const useOwnerValetLocations = (
  enabled: boolean,
  garageId?: string,
  garage?: any
): ValetLocationInfo[] => {
  const [locations, setLocations] = useState<ValetLocationInfo[]>([]);

  const fetchLocations = useCallback(async () => {
    if (!enabled || !garageId || !garage) return;
    try {
      const { data, error } = await supabase
        .from('valet_locations')
        .select('*')
        .eq('garage_id', garageId);

      if (error) return;

      const now = Date.now();
      const valets: ValetLocationInfo[] = [
        { valetNumber: 1, valetName: String(garage.valetName1 || 'سايس 1'), isActive: garage.valet1Active ?? false, status: 'offline', distance: null, lastSeen: null },
        { valetNumber: 2, valetName: String(garage.valetName2 || 'سايس 2'), isActive: garage.valet2Active ?? false, status: 'offline', distance: null, lastSeen: null },
        { valetNumber: 3, valetName: String(garage.valetName3 || 'سايس 3'), isActive: garage.valet3Active ?? false, status: 'offline', distance: null, lastSeen: null },
      ].filter(v => v.valetName && String(v.valetName).trim());

      valets.forEach(v => {
        if (!v.isActive) {
          v.status = 'inactive';
          return;
        }

        const record = data?.find((d: any) => Number(d.valet_number) === v.valetNumber);
        if (!record || !record.updated_at) {
          v.status = 'offline';
          return;
        }

        const lastSeenMs = new Date(record.updated_at).getTime();
        const diff = now - lastSeenMs;

        if (diff <= VALET_LIVE_THRESHOLD_MS) {
          v.status = record.is_inside ? 'inside' : 'outside';
          v.distance = record.distance;
          v.lastSeen = lastSeenMs;
          v.isBackground = false;
        } else if (diff <= VALET_BACKGROUND_GRACE_MS && record.is_inside) {
          v.status = 'inside';
          v.distance = record.distance;
          v.lastSeen = lastSeenMs;
          v.isBackground = true;
        } else {
          v.status = 'offline';
          v.distance = record.distance;
          v.lastSeen = lastSeenMs;
          v.isBackground = false;
        }
      });

      setLocations(valets);
    } catch {}
  }, [enabled, garageId, garage]);

  useEffect(() => {
    if (!enabled || !garageId) return;

    fetchLocations();
    const interval = setInterval(fetchLocations, 10000);

    const channel = supabase
      .channel(`valet-locations-channel-${garageId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'valet_locations', filter: `garage_id=eq.${garageId}` }, () => {
        fetchLocations();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [enabled, garageId, fetchLocations]);

  return locations;
};

const ValetGeofenceBlockScreen = memo(function ValetGeofenceBlockScreen({
  geofenceState,
  garageName,
  valetName,
  distance,
  onRetry,
}: {
  geofenceState: GeofenceState;
  garageName: string;
  valetName: string;
  distance: number | null;
  onRetry: () => void;
}) {
  const isDenied = geofenceState.status === 'denied';
  const isOutside = geofenceState.status === 'outside';
  const isNoCoords = geofenceState.status === 'no_garage_coords';
  const isLoading = geofenceState.status === 'loading';

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-6" style={{ background: BRAND.navy }}>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }} className="mx-auto mb-6 w-16 h-16 flex items-center justify-center">
            <Locate size={48} style={{ color: BRAND.blue }} />
          </motion.div>
          <h2 className="font-black text-white text-base mb-2">جاري تأكيد موقعك الجغرافي...</h2>
          <p className="font-bold text-xs" style={{ color: BRAND.slateMuted, lineHeight: 1.8 }}>
            يرجى الموافقة على إذن الموقع لفتح الشاشة
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-5" style={{ background: 'linear-gradient(180deg, #111827 0%, #0a1628 100%)' }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-sm w-full">
        <div className="relative mx-auto mb-5 w-20 h-24 flex items-center justify-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: BRAND.blueSoft, border: `1.5px solid ${isOutside ? BRAND.green : '#ef4444'}` }}>
            {isDenied ? <MapPinOff size={32} style={{ color: '#ef4444' }} /> : isOutside ? <AlertTriangle size={32} style={{ color: BRAND.green }} /> : <WifiOff size={32} style={{ color: '#ef4444' }} />}
          </div>
        </div>

        <h2 className="font-black text-lg text-white mb-2">
          {isDenied ? '📍 تفعيل الموقع إجباري' : isOutside ? '🚫 خارج نطاق الجراج' : isNoCoords ? '⚠️ إعدادات الموقع ناقصة' : '⚠️ تعذر تحديد موقعك'}
        </h2>
        <p className="font-semibold text-xs mb-5" style={{ color: BRAND.slateMuted, lineHeight: 1.8 }}>
          {isDenied ? (
            <>
              لا يمكنك العمل بدون تفعيل GPS.<br />
              <span style={{ color: BRAND.green }}>افتح إعدادات المتصفح واضغط "سماح للموقع".</span>
            </>
          ) : isOutside ? (
            <>
              أنت خارج نطاق جراج <span className="font-black" style={{ color: BRAND.blueLight }}>{garageName}</span>.<br />
              يجب التواجد داخل مقر الجراج لمتابعة العمل واستلام السيارات.
            </>
          ) : (
            geofenceState.errorMessage || 'تأكد من تشغيل الـ GPS بالهاتف والمحاولة مجدداً.'
          )}
        </p>

        {isOutside && distance != null && (
          <div 
            className="mb-5 mx-auto p-3 rounded-xl text-center" 
            style={{ 
              background: BRAND.blueSoft, 
              border: `1px solid ${BRAND.border}`, 
              maxWidth: 200 
            }}
          >
            <div className="font-black font-mono text-2xl" style={{ color: BRAND.blue, lineHeight: 1.1 }}>
              {distance} <span style={{ fontSize: 12, fontWeight: 900 }}>متر</span>
            </div>
            <div className="text-[10px] font-black mt-1" style={{ color: BRAND.slate }}>
              📍 مسافتك الحالية عن الجراج
            </div>
          </div>
        )}

        <div className="space-y-2.5 max-w-[260px] mx-auto">
          <button onClick={onRetry} className="w-full font-black flex items-center justify-center gap-2 active:scale-95 py-3 rounded-xl text-white border-0 cursor-pointer text-xs" style={{ background: BRAND.blue, boxShadow: `0 4px 12px ${BRAND.blue}25` }}>
            <Locate size={16} /> تحديث موقعي الآن
          </button>
          
          <button onClick={() => { localStorage.removeItem('garageRole'); localStorage.removeItem('valetNumber'); localStorage.removeItem('valetName'); useStore.getState().setCurrentGarageId(null); }} className="w-full font-black py-2.5 rounded-xl border cursor-pointer bg-transparent text-xs" style={{ color: BRAND.slateMuted, borderColor: BRAND.border }}>
            تسجيل خروج
          </button>
        </div>
      </motion.div>
    </div>
  );
});

const OwnerValetLocationBanner = memo(function OwnerValetLocationBanner({
  valetLocations,
}: {
  valetLocations: ValetLocationInfo[];
}) {
  if (valetLocations.length === 0) return null;

  const getStatusDisplay = (v: ValetLocationInfo) => {
    switch (v.status) {
      case 'inside':
        return { 
          icon: '🟢', 
          label: v.isBackground ? 'متواجد (في الخلفية)' : 'متواجد', 
          color: BRAND.greenDark, 
          bg: BRAND.greenLight, 
          border: '#c8e6a0' 
        };
      case 'outside':
        return { 
          icon: '🔴', 
          label: `بعيد (${v.distance ?? '?'}م)`, 
          color: '#c53030', 
          bg: '#fff5f5', 
          border: '#fbcfe8' 
        };
      case 'offline':
        return { 
          icon: '⚪', 
          label: 'غير متصل', 
          color: BRAND.slate, 
          bg: BRAND.bg, 
          border: BRAND.border 
        };
      case 'inactive':
        return { 
          icon: '⏸️', 
          label: 'معطّل', 
          color: BRAND.slateMuted, 
          bg: BRAND.bg, 
          border: BRAND.border 
        };
    }
  };

  return (
    <div className="mb-4" style={{ background: BRAND.card, borderRadius: 18, padding: '12px 14px', border: `1px solid ${BRAND.border}`, boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b" style={{ borderColor: BRAND.border }}>
        <span className="font-bold text-[9px]" style={{ color: BRAND.slateMuted }}>تتبع ذكي GPS</span>
        <div className="flex items-center gap-1">
          <MapPin size={13} style={{ color: BRAND.blue }} />
          <span className="font-black text-xs" style={{ color: BRAND.navy }}>حالة تواجد السياس</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {valetLocations.map((v) => {
          const cfg = getStatusDisplay(v);
          return (
            <div key={v.valetNumber} className="text-center p-2 rounded-xl border" style={{ background: cfg.bg, borderColor: cfg.border }}>
              <div className="flex items-center justify-center gap-1">
                <span className="text-xs">{cfg.icon}</span>
                <span className="font-black text-[10px] text-slate-800 truncate">{v.valetName}</span>
              </div>
              <div className="font-black font-mono mt-0.5" style={{ fontSize: 9, color: cfg.color }}>
                {cfg.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ==========================================
// أدوات مساعدة
// ==========================================

const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'string') {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : 0;
  }
  if (typeof value === 'number') {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  return 0;
};

const formatElapsed = (totalSeconds: number): string => {
  if (totalSeconds < 0) totalSeconds = 0;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}س ${m}د ${s}ث`;
  if (m > 0) return `${m}د ${s}ث`;
  return `${s}ث`;
};

const getLocalToday = (): string => {
  const n = new Date(getServerNow());
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

const timestampToLocalDate = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatLocalDateArabic = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ar-EG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
};

const normalizeSearchPlate = (plate?: string): string => normalizePlate(plate);

interface ActiveSessionCardProps {
  session: any;
  basePrice: number;
  undoableSession?: UndoableSession;
  onEndSession: (id: string, carPlate: string, cost: number, hours: number, minutes: number, source: 'app' | 'manual', agreedPrice?: number) => void;
  onUndo: (un: UndoableSession) => void;
  getUndoRemainingSeconds: (addedAt: number) => number;
}

const ActiveSessionCard = memo(function ActiveSessionCard({
  session: s,
  basePrice,
  undoableSession: un,
  onEndSession,
  onUndo,
  getUndoRemainingSeconds,
}: ActiveSessionCardProps) {
  const [, setLocalTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setLocalTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const st = toMs(s.startTime);
  const el = st > 0 ? Math.max(0, Math.floor((getServerNow() - st) / 1000)) : 0;
  const mins = Math.floor(el / 60);

  const isFreeApplied = s.isFirstFreeSession === true;
  const isFreeNow = isFreeApplied && el <= 1800;
  
  const hrs = isFreeNow ? 0 : calculateFullHours(el);
  const rate = Number(s.agreedPrice ?? basePrice);
  const cost = isFreeNow ? 0 : calculateCost(el, rate);

  const isM = s.source === 'manual';

  return (
    <div 
      style={{ 
        background: isM ? BRAND.card : BRAND.blueSoft, 
        border: `1px solid ${isM ? BRAND.border : BRAND.blueLight}`, 
        borderRadius: 16, 
        padding: '12px 14px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
      }}
      className="mb-2"
    >
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <motion.span animate={{ scale: [1, 1.25, 1] }} transition={{ repeat: Infinity, duration: 1.5 }} className="rounded-full shrink-0" style={{ width: 8, height: 8, background: isM ? '#f59e0b' : BRAND.green }} />
          <span className="font-bold text-slate-500 font-mono" style={{ fontSize: 11 }}>{formatElapsed(el)} • {hrs}س</span>
          <span className="font-black text-white shrink-0 text-[8px] px-2 py-0.5 rounded" style={{ background: isM ? '#f59e0b' : BRAND.blue }}>{isM ? 'يدوي' : 'تطبيق'}</span>
          
          {isFreeApplied && (
            <span className="font-black flex items-center gap-0.5 shrink-0 text-[8px] px-2 py-0.5 rounded" style={{ background: BRAND.greenLight, color: BRAND.greenDark, border: `1px solid ${BRAND.green}40` }}>
              <Gift size={10} /> {isFreeNow ? 'هدية ترحيبية نشطة 🎁' : 'انتهت الهدية الترحيبية'}
            </span>
          )}
        </div>
        <div className="font-black text-slate-900 text-sm">🚗 {s.carPlate}</div>
      </div>

      <div className="flex justify-between items-center border-t pt-2 mt-2" style={{ borderColor: BRAND.border }}>
        <div className="flex items-center gap-1.5">
          <button 
            onClick={() => onEndSession(s.id, s.carPlate, cost, hrs, mins, s.source, s.agreedPrice)} 
            className="active:scale-[0.98] transition-all flex items-center justify-center font-black text-white border-0 py-2 px-4 rounded-xl cursor-pointer text-xs"
            style={{ 
              background: '#dc2626', 
            }}
          >
            إنهاء وتحصيل
          </button>
          {un && (
            <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} onClick={() => onUndo(un)} className="font-black flex items-center gap-1 active:scale-95 text-white border-0 py-2 px-3 rounded-xl text-[10px] cursor-pointer" style={{ background: '#f59e0b' }}>
              <Undo2 size={12} /> ({getUndoRemainingSeconds(un.addedAt)}ث)
            </motion.button>
          )}
        </div>

        <div className="font-black text-left" style={{ fontSize: isFreeNow ? 11 : 14, color: isFreeNow ? '#f59e0b' : BRAND.greenDark }}>
          {isFreeNow ? (
            <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-[10px]" style={{ background: BRAND.greenLight, border: `1px solid ${BRAND.green}30` }}>
              🎁 مجاناً (0ج)
            </span>
          ) : (
            <span className="font-mono text-sm font-black">{cost} ج.م</span>
          )}
        </div>
      </div>
    </div>
  );
});

// ==========================================
// المكون الرئيسي: DASHBOARD
// ==========================================

export default function GarageDashboard() {
  const {
    garages, currentGarageId, setCurrentGarageId, sessions, addSession, endSession,
    removeSession, offers, updateOffer, cancelOffer, updateGarage, incomingCars,
    removeIncomingCar, fetchAll, confirmRevenue, assignSessionToValet, adjustGarageSpots,
    getMyOwnedGarages,
  } = useStore();

  const [garageRole] = useState<'owner' | 'valet'>(
    () => (localStorage.getItem('garageRole') as 'owner' | 'valet') || 'owner',
  );

  const [ownerValetView, setOwnerValetView] = useState(false);

  const isRealValet = garageRole === 'valet';
  const isOwner = garageRole === 'owner' && !ownerValetView;
  const isValet = isRealValet || ownerValetView;

  const valetNumber = ownerValetView
    ? 'owner'
    : localStorage.getItem('valetNumber') || '';

  const garage = garages.find(g => g.id === currentGarageId);
  const garageCoords = useMemo(() => extractGarageCoords(garage), [garage]);

  const garageSessions = useMemo(
    () => sessions.filter(s => s.garageId === currentGarageId),
    [sessions, currentGarageId]
  );
  const currentValetNameLocal = ownerValetView ? '' : (localStorage.getItem('valetName') || '');

  const currentValetName = ownerValetView
    ? 'المالك'
    : valetNumber === '1' ? garage?.valetName1 :
      valetNumber === '2' ? garage?.valetName2 :
      valetNumber === '3' ? garage?.valetName3 :
      '';

  const myValetNames = useMemo(() => {
    const names = new Set<string>();
    if (ownerValetView) {
      names.add('المالك');
      names.add('المالك (معاينة)');
      return names;
    }
    if (currentValetNameLocal) names.add(String(currentValetNameLocal).trim());
    if (currentValetName) names.add(String(currentValetName).trim());
    if (valetNumber) {
      names.add(`سايس ${valetNumber}`);
      names.add(`valet ${valetNumber}`);
    }
    return names;
  }, [currentValetNameLocal, currentValetName, valetNumber, ownerValetView]);

  const garageValetNames = useMemo(() => {
    if (!garage) return [];
    return [
      String(garage.valetName1 || '').trim(),
      String(garage.valetName2 || '').trim(),
      String(garage.valetName3 || '').trim(),
      'سايس 1', 'سايس 2', 'سايس 3'
    ].filter(Boolean);
  }, [garage]);

  const geofenceState = useValetGeofence(isRealValet, garageCoords, GEOFENCE_RADIUS_METERS);

  const reportLocation = useCallback(async (isInside: boolean, distance: number | null) => {
    if (!isRealValet || !currentGarageId || !valetNumber) return;
    try {
      await supabase.from('valet_locations').upsert(
        {
          garage_id: currentGarageId,
          valet_number: parseInt(valetNumber),
          is_inside: isInside,
          distance: distance,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'garage_id,valet_number' }
      );
    } catch {}
  }, [isRealValet, currentGarageId, valetNumber]);

  useEffect(() => {
    if (!isRealValet || geofenceState.status === 'loading') return;
    const isInside = geofenceState.status === 'inside';
    reportLocation(isInside, geofenceState.distance);

    const interval = setInterval(() => {
      reportLocation(isInside, geofenceState.distance);
    }, VALET_PING_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isRealValet, geofenceState.status, geofenceState.distance, reportLocation]);

  useEffect(() => {
    if (!isRealValet) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (geofenceState.status === 'inside') {
          reportLocation(true, geofenceState.distance);
        }
      } else if (document.visibilityState === 'visible') {
        if (garageCoords) {
          navigator.geolocation?.getCurrentPosition((pos) => {
            const dist = haversineDistance(pos.coords.latitude, pos.coords.longitude, garageCoords.lat, garageCoords.lng);
            reportLocation(dist <= GEOFENCE_RADIUS_METERS, Math.round(dist));
          }, () => {}, { enableHighAccuracy: true, timeout: 5000 });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isRealValet, geofenceState.status, geofenceState.distance, garageCoords, reportLocation]);

  const valetLocations = useOwnerValetLocations(isOwner, currentGarageId, garage);

  const isValetBlocked = isRealValet && geofenceState.status !== 'inside';

  const handleGeofenceRetry = useCallback(() => {
    window.location.reload();
  }, []);

  const activeSessions = useMemo(() => {
    return garageSessions.filter(s => {
      if (s.status !== 'active') return false;
      const st = toMs(s.startTime);
      if (st <= 0) return false;
      const elapsedMs = getServerNow() - st;
      if (elapsedMs >= 24 * 60 * 60 * 1000) return false;
      return true;
    });
  }, [garageSessions]);

  const valetActiveSessions = useMemo(() => {
    if (!isValet) return activeSessions;
    if (ownerValetView) return activeSessions; 

    const isActive =
      valetNumber === '1' ? garage?.valet1Active :
      valetNumber === '2' ? garage?.valet2Active :
      valetNumber === '3' ? garage?.valet3Active : false;
    if (!isActive) return [];

    return activeSessions;
  }, [activeSessions, isValet, valetNumber, garage, ownerValetView]);

  const completedSessions = useMemo(
    () => garageSessions.filter(s => s.status === 'completed'),
    [garageSessions]
  );
  const garageOffers = useMemo(
    () => offers.filter(o => o.garageId === currentGarageId && o.status === 'pending'),
    [offers, currentGarageId]
  );
  const carsOnTheWay = useMemo(
    () => incomingCars.filter(c => c.garageId === currentGarageId && c.status === 'coming'),
    [incomingCars, currentGarageId]
  );

  const processedCarsRef = useRef<Set<string>>(new Set());
  const isEndingSessionRef = useRef(false);
  const prevIncomingIdsRef = useRef<Set<string>>(new Set());
  const prevOfferIdsRef = useRef<Set<string>>(new Set());
  const approachAlertedRef = useRef<Set<string>>(new Set());

  const [undoableSessions, setUndoableSessions] = useState<UndoableSession[]>([]);
  const [newCarPlate, setNewCarPlate] = useState('');
  const [newCarPrice, setNewCarPrice] = useState(garage?.basePrice || 15);
  const [showAddCar, setShowAddCar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  const [editPrice, setEditPrice] = useState(garage?.basePrice || 15);
  const [editSpots, setEditSpots] = useState(garage?.availableSpots || 0);
  const [editCapacity, setEditCapacity] = useState(garage?.capacity || 50);
  const [editPaymentMode, setEditPaymentMode] = useState<'cash' | 'wallet' | 'both'>(
    (garage?.payment_mode as 'cash' | 'wallet' | 'both') || 'both'
  );
  const [editValet1Name, setEditValet1Name] = useState(garage?.valetName1 || '');
  const [editValet1Pass, setEditValet1Pass] = useState(garage?.valetPassword1 || '');
  const [editValet2Name, setEditValet2Name] = useState(garage?.valetName2 || '');
  const [editValet2Pass, setEditValet2Pass] = useState(garage?.valetPassword2 || '');
  const [editValet3Name, setEditValet3Name] = useState(garage?.valetName3 || '');
  const [editValet3Pass, setEditValet3Pass] = useState(garage?.valetPassword3 || '');
  
  const [logDateFrom, setLogDateFrom] = useState(() => getLocalToday());
  const [logDateTo, setLogDateTo] = useState(() => getLocalToday());
  const [logPaymentFilter, setLogPaymentFilter] = useState<string>('all');
  
  const [confirmSession, setConfirmSession] = useState<{
    id: string; carPlate: string; cost: number; hours: number;
    minutes: number; source: 'app' | 'manual'; agreedPrice?: number;
  } | null>(null);
  
  const [confirmPaymentMethod, setConfirmPaymentMethod] = useState<string>('cash');
  
  const [valetEditSpots, setValetEditSpots] = useState(false);
  const [selectedValetFilter, setSelectedValetFilter] = useState<string | null>(null);
  const [plateSearch, setPlateSearch] = useState('');

  const [showSwitcher, setShowSwitcher] = useState(false);
  const myGarages = useMemo(() => {
    if (!garage) return [];
    return getMyOwnedGarages(garage.ownerPhone || garage.phone || '');
  }, [getMyOwnedGarages, garage]);

  useEffect(() => {
    if (!isRealValet || !currentGarageId) return;
    const currentValet = currentValetNameLocal || currentValetName || `سايس ${valetNumber}`;
    if (!currentValet) return;

    const unassignedCompletedSessions = sessions.filter(s => {
      if (s.garageId !== currentGarageId) return false;
      if (s.status !== 'completed') return false;
      if (s.source !== 'app') return false;
      
      const isToday = timestampToLocalDate(toMs(s.endTime || s.startTime)) === getLocalToday();
      const ab = String((s as any).addedBy || '').trim();
      return isToday && !ab;
    });

    unassignedCompletedSessions.forEach(s => {
      assignSessionToValet(s.id, currentValet);
    });
  }, [sessions, isRealValet, currentGarageId, currentValetNameLocal, currentValetName, valetNumber, assignSessionToValet]);

  const filteredValetActiveSessions = useMemo(() => {
    if (!plateSearch.trim()) return valetActiveSessions;
    const query = normalizeSearchPlate(plateSearch);
    return valetActiveSessions.filter(s => {
      const plate = normalizeSearchPlate(s.carPlate);
      return plate.includes(query);
    });
  }, [valetActiveSessions, plateSearch]);

  const fetchGarageDailyStats = useCallback(async () => {
    // جلب الإحصائيات في الخلفية
  }, []);

  useEffect(() => {
    if (!currentGarageId) return;
    const channel = supabase
      .channel(`garage-realtime-${currentGarageId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `garage_id=eq.${currentGarageId}` }, async () => { await fetchAll(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incoming_cars', filter: `garage_id=eq.${currentGarageId}` }, async () => { await fetchAll(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offers', filter: `garage_id=eq.${currentGarageId}` }, async () => { await fetchAll(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentGarageId, fetchAll]);

  useEffect(() => {
    if (!currentGarageId) return;
    try {
      subscribeToPush(currentGarageId);
    } catch {}
  }, [currentGarageId]);

  const getSessionRevenue = useCallback((s: any) => {
    if (s.totalPrice != null) return Number(s.totalPrice);
    if (s.endTime && s.startTime) {
      const elSeconds = Math.max(0, Math.floor((toMs(s.endTime) - toMs(s.startTime)) / 1000));
      const r = Number(s.agreedPrice ?? garage?.basePrice ?? 0);
      const isFreeNow = s.isFirstFreeSession === true && elSeconds <= 1800;
      return isFreeNow ? 0 : calculateCost(elSeconds, r);
    }
    return 0;
  }, [garage?.basePrice]);

  const getSessionCommission = useCallback((s: any) => {
    if (s.source !== 'app') return 0;
    const rev = getSessionRevenue(s);
    if (rev <= 0) return 0;
    const rate = garage?.commissionRate ?? 10;
    return Math.round((rev * rate / 100) * 100) / 100;
  }, [getSessionRevenue, garage?.commissionRate]);

  const getSessionNetRevenue = useCallback((s: any) => {
    const rev = getSessionRevenue(s);
    if (s.source !== 'app') return rev;
    const comm = getSessionCommission(s);
    return Math.round((rev - comm) * 100) / 100;
  }, [getSessionRevenue, getSessionCommission]);

  const getActiveCost = useCallback((s: any) => {
    const st = toMs(s.startTime);
    const el = st > 0 ? Math.max(0, Math.floor((getServerNow() - st) / 1000)) : 0;
    const r = Number(s.agreedPrice ?? garage?.basePrice ?? 0);
    if (el <= 0 || r <= 0) return 0;

    const isFreeNow = s.isFirstFreeSession === true && el <= 1800;
    return isFreeNow ? 0 : calculateCost(el, r);
  }, [garage?.basePrice]);

  const filteredCompleted = useMemo(() => {
    if (isRealValet) {
      const isActive =
        valetNumber === '1' ? garage?.valet1Active :
        valetNumber === '2' ? garage?.valet2Active :
        valetNumber === '3' ? garage?.valet3Active : false;
      if (!isActive) return [];
    }

    const today = new Date(getServerNow());
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;

    const boundaryFrom = logDateFrom ? new Date(`${logDateFrom}T00:00:00`).getTime() : 0;
    const boundaryTo = logDateTo ? new Date(`${logDateTo}T23:59:59.999`).getTime() : 0;

    return completedSessions.filter(s => {
      if (s.endTime) {
        const endMs = toMs(s.endTime);
        if (isValet) { 
          const isToday = endMs >= todayStart && endMs <= todayEnd;
          if (!isToday) return false; 
        } else { 
          if (boundaryFrom && endMs < boundaryFrom) return false; 
          if (boundaryTo && endMs > boundaryTo) return false; 
        }
      }
      
      if (logPaymentFilter !== 'all' && s.paymentMethod !== logPaymentFilter) return false;
      
      const addedBy = String((s as any).addedBy || '').trim();
      
      if (isValet && !ownerValetView) {
        const isMine = addedBy && myValetNames.has(addedBy);
        const isUnassignedApp = !addedBy && s.source === 'app';
        if (!isMine && !isUnassignedApp) return false;
      }      
      
      if (isOwner && selectedValetFilter) { 
        if (addedBy !== selectedValetFilter) return false; 
      }
      
      return true;
    });
  }, [completedSessions, logDateFrom, logDateTo, logPaymentFilter, isValet, isRealValet, isOwner, ownerValetView, myValetNames, selectedValetFilter, valetNumber, garage]);

  const filteredStats = useMemo(() => {
    const c = filteredCompleted.filter(s => s.revenueConfirmed);
    const u = filteredCompleted.filter(s => !s.revenueConfirmed);
    const activeC = c.filter(s => !(s as any).settled);

    const cash = c.filter(s => s.paymentMethod === 'cash').reduce((a, s) => a + getSessionRevenue(s), 0);
    const instapay = c.filter(s => s.paymentMethod === 'instapay').reduce((a, s) => a + getSessionRevenue(s), 0);
    const wallet = c.filter(s => s.paymentMethod === 'wallet').reduce((a, s) => a + getSessionRevenue(s), 0);
    const cashwallet = c.filter(s => s.paymentMethod === 'cashwallet').reduce((a, sumSession) => a + getSessionRevenue(sumSession), 0);
    
    const manual = c.filter(s => s.source === 'manual');
    const app = c.filter(s => s.source === 'app');
    
    const totalCommission = c.reduce((a, s) => a + getSessionCommission(s), 0);
    const totalNet = c.reduce((a, s) => a + getSessionNetRevenue(s), 0);
    const confirmedTotal = cash + instapay + wallet + cashwallet;

    const activeWallet = activeC.filter(s => s.paymentMethod === 'wallet').reduce((a, s) => a + getSessionRevenue(s), 0);
    const activeCommission = activeC.reduce((a, s) => a + getSessionCommission(s), 0);

    return {
      cash, instapay, wallet, cashwallet,
      total: confirmedTotal,
      manualCount: manual.length, appCount: app.length,
      manualTotal: manual.reduce((a, s) => a + getSessionRevenue(s), 0),
      appTotal: app.reduce((a, s) => a + getSessionRevenue(s), 0),
      pendingRevenue: u.reduce((a, s) => a + getSessionRevenue(s), 0),
      pendingCount: u.length,
      totalCommission, totalNet,
      activeWallet, activeCommission,
    };
  }, [filteredCompleted, getSessionRevenue, getSessionCommission, getSessionNetRevenue]);

  const topCardConfirmedRevenue = useMemo(() => filteredStats.total, [filteredStats]);

  const valetReport = useMemo(() => {
    if (!garage || !isOwner || !currentGarageId) return [];
    const garageValets = [
      { name: String(garage.valetName1 || '').trim(), defaultName: 'سايس 1', color: BRAND.blue, icon: '🅿️1' },
      { name: String(garage.valetName2 || '').trim(), defaultName: 'سايس 2', color: '#7c3aed', icon: '🅿️2' },
      { name: String(garage.valetName3 || '').trim(), defaultName: 'سايس 3', color: '#f59e0b', icon: '🅿️3' },
    ].filter(v => v.name);
    
    const ownerGarageCompleted = completedSessions.filter((s) => {
      if (s.garageId !== currentGarageId) return false;
      if (s.endTime) {
        const d = timestampToLocalDate(toMs(s.endTime));
        if (logDateFrom && d < logDateFrom) return false;
        if (logDateTo && d > logDateTo) return false;
      }
      if (logPaymentFilter !== 'all' && s.paymentMethod !== logPaymentFilter) return false;
      return true;
    });
    
    return garageValets.map((v) => {
      const vs = ownerGarageCompleted.filter((s) => {
        const addedBy = String((s as any).addedBy || '').trim();
        return addedBy === v.name || addedBy === v.defaultName;
      });
      const confirmed = vs.filter((s) => s.revenueConfirmed);
      const ac = confirmed.filter((s) => s.source === 'app');
      const mc = confirmed.filter((s) => s.source === 'manual');
      return {
        name: v.name, color: v.color, icon: v.icon, count: vs.length,
        appCount: ac.length, manualCount: mc.length,
        appTotal: ac.reduce((a, s) => a + getSessionRevenue(s), 0),
        manualTotal: mc.reduce((a, s) => a + getSessionRevenue(s), 0),
        total: confirmed.reduce((a, s) => a + getSessionRevenue(s), 0),
      };
    }).filter((v) => v.count > 0);
  }, [garage, isOwner, currentGarageId, completedSessions, logDateFrom, logDateTo, logPaymentFilter, getSessionRevenue]);

  const handleUndoSession = useCallback((un: UndoableSession) => {
    if (!garage) return;
    removeSession(un.sessionId);
    if (un.localId !== un.sessionId) removeSession(un.localId);
    const cs = useStore.getState().sessions;
    const ms = cs.find(s => s.carPlate === un.carPlate && s.source === 'manual' && s.status === 'active' && Math.abs(toMs(s.startTime) - un.addedAt) < 5000);
    if (ms) removeSession(ms.id);
    setUndoableSessions(p => p.filter(u => u.sessionId !== un.sessionId && u.localId !== un.localId));
    toast('تم إلغاء ' + un.carPlate + ' ↩️', { icon: '🔙' });
  }, [garage, removeSession]);

  const getUndoRemainingSeconds = useCallback((addedAt: number) => Math.max(0, UNDO_TIMEOUT_SECONDS - Math.floor((getServerNow() - addedAt) / 1000)), []);

  const [undoTick, setUndoTick] = useState(0);
  useEffect(() => {
    if (undoableSessions.length === 0) return;
    const i = setInterval(() => setUndoTick(t => t + 1), 5000);
    return () => clearInterval(i);
  }, [undoableSessions.length]);

  useEffect(() => {
    setUndoableSessions(p =>
      p.filter(u => Math.floor((getServerNow() - u.addedAt) / 1000) < UNDO_TIMEOUT_SECONDS)
        .map(u => {
          const e = sessions.find(s => s.id === u.sessionId);
          if (!e) { const n = sessions.find(s => s.carPlate === u.carPlate && s.source === 'manual' && s.status === 'active' && Math.abs(toMs(s.startTime) - u.addedAt) < 5000); if (n) return { ...u, sessionId: n.id }; }
          return u;
        }),
    );
  }, [undoTick, sessions]);

  // 🛡️ حظر السايس الحقيقي فقط
  if (isValetBlocked && garage) {
    return (
      <ValetGeofenceBlockScreen
        geofenceState={geofenceState}
        garageName={garage.name}
        valetName={currentValetName || currentValetNameLocal || `سايس ${valetNumber}`}
        distance={geofenceState.distance}
        onRetry={handleGeofenceRetry}
      />
    );
  }

  if (!garage) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6" style={{ background: BRAND.bg, color: BRAND.navy }}>
        <div style={{ background: BRAND.card, borderRadius: 28, padding: 32, textAlign: 'center', maxWidth: 360, width: '100%', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', border: `1px solid ${BRAND.border}` }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>⏳</div>
          <h2 className="font-black text-base" style={{ color: BRAND.navy, marginBottom: 8 }}>جاري تحميل البيانات</h2>
          <p className="font-bold text-xs" style={{ color: BRAND.slateMuted, lineHeight: 1.8 }}>انتظر لحظة...</p>
        </div>
      </div>
    );
  }

  const handleAddCar = async () => {
    if (!newCarPlate.trim()) { toast.error('أدخل رقم السيارة'); return; }
    const cp = newCarPlate.trim(); 
    const pr = newCarPrice; 
    const at = getServerNow();
    const startTimeISO = new Date(at).toISOString();
    
    const sid = await addSession({ 
      garageId: garage.id, 
      carPlate: cp, 
      startTime: startTimeISO, 
      status: 'active', 
      source: 'manual', 
      agreedPrice: pr, 
      addedBy: isValet ? (currentValetNameLocal || currentValetName || `سايس ${valetNumber}`) : '' 
    } as any);
    
    const fid = sid || `fallback-${at}`;
    setUndoableSessions(p => [...p, { sessionId: fid, localId: fid, carPlate: cp, price: pr, addedAt: at }]);
    toast.success(`تم إضافة السيارة بسعر ${pr} ج.م/ساعة`);
    setNewCarPlate(''); 
    setNewCarPrice(garage.basePrice); 
    setShowAddCar(false);
  };

  const openConfirmPayment = (sid: string, cp: string, cost: number, hrs: number, minutes: number, source: 'app' | 'manual', ap?: number) => {
    const sessionObj = activeSessions.find(s => s.id === sid);
    const isFreeApplied = sessionObj?.isFirstFreeSession === true;
    
    const st = sessionObj ? toMs(sessionObj.startTime) : 0;
    const el = st > 0 ? Math.max(0, Math.floor((getServerNow() - st) / 1000)) : 0;
    
    const isFreeNow = isFreeApplied && el <= 1800;
    const finalCost = isFreeNow ? 0 : (cost > 0 ? cost : getActiveCost(sessionObj));

    setConfirmSession({ 
      id: sid, 
      carPlate: cp, 
      cost: finalCost, 
      hours: isFreeNow ? 0 : hrs, 
      minutes, 
      source, 
      agreedPrice: ap 
    });

    setConfirmPaymentMethod('cash');
  };

  const handleConfirmPayment = async () => {
    if (!confirmSession || isEndingSessionRef.current) return;
    isEndingSessionRef.current = true;
    
    pausePolling(2000);
    
    try {
      const sc = { ...confirmSession }; 
      const sd = useStore.getState().sessions.find(s => s.id === sc.id);
      
      const pc = (isValet || sc.source === 'manual') ? 'cash' : (confirmPaymentMethod || 'cash');
      
      let freeMinutesApplied = 0;
      if (sd?.isFirstFreeSession === true) {
        const elapsedSeconds = Math.floor((getServerNow() - toMs(sd.startTime)) / 1000);
        if (elapsedSeconds <= 1800) {
          freeMinutesApplied = Math.floor(elapsedSeconds / 60);
        }
      }

      const currentValet = isValet 
        ? (currentValetNameLocal || currentValetName || `سايس ${valetNumber}`).trim() 
        : 'المالك';

      setConfirmSession(null);
      setUndoableSessions(p => p.filter(u => u.sessionId !== sc.id && u.localId !== sc.id));
      
      await endSession(sc.id, sc.cost, pc, freeMinutesApplied, currentValet);
      await fetchGarageDailyStats();
      
      const paymentText = pc === 'cash' ? 'نقداً (كاش)' : 'من المحفظة الرقمية';
      toast.success(`تم تحصيل ${sc.cost} ج.م ${paymentText} بنجاح بواسطة ${currentValet} ✅`);
    } catch (err: any) {
      console.error('Payment Error:', err);
      toast.error(err.message || 'فشلت عملية التحصيل، برجاء المحاولة مجدداً.');
    } finally { 
      pausePolling(0);
      setTimeout(() => { isEndingSessionRef.current = false; }, 800); 
    }
  };

  const handleSaveSettings = () => {
    updateGarage(garage.id, {
      basePrice: editPrice, 
      availableSpots: Math.min(editSpots, editCapacity), 
      capacity: editCapacity,
      payment_mode: editPaymentMode,
      valetName1: String(editValet1Name || '').trim(), valetPassword1: String(editValet1Pass || '').trim(),
      valetName2: String(editValet2Name || '').trim(), valetPassword2: String(editValet2Pass || '').trim(),
      valetName3: String(editValet3Name || '').trim(), valetPassword3: String(editValet3Pass || '').trim(),
    });
    toast.success('تم تحديث الإعدادات ⚡'); 
    setShowSettings(false);
  };

  const openSettings = () => {
    setEditPrice(garage.basePrice); 
    setEditSpots(garage.availableSpots); 
    setEditCapacity(garage.capacity);
    setEditPaymentMode((garage.payment_mode as 'cash' | 'wallet' | 'both') || 'both');
    setEditValet1Name(garage.valetName1 || ''); setEditValet1Pass(garage.valetPassword1 || '');
    setEditValet2Name(garage.valetName2 || ''); setEditValet2Pass(garage.valetPassword2 || '');
    setEditValet3Name(garage.valetName3 || ''); setEditValet3Pass(garage.valetPassword3 || '');
    setShowSettings(true);
  };

  const handleCarArrived = async (car: any) => {
    const carId: string = car.id; 
    const carPlate: string = car.carPlate;
    if (processedCarsRef.current.has(carId)) return;
    processedCarsRef.current.add(carId);
    
    pausePolling(2000);
    
    try {
      const np = normalizePlate(carPlate);
      const existing = useStore.getState().sessions.find(s => normalizePlate(s.carPlate) === np && s.status === 'active');
      if (existing) { 
        await removeIncomingCar(carId); 
        toast('الجلسة شغالة بالفعل ✅', { icon: '🚗' }); 
        return; 
      }
      
      const ro = offers.find(o => normalizePlate(o.carPlate) === np && (o.status === 'pending' || o.status === 'accepted'));
      if (ro) cancelOffer(ro.id);

      const startTimeISO = new Date(getServerNow()).toISOString();

      await addSession({ 
        garageId: garage.id, 
        carPlate: np, 
        startTime: startTimeISO, 
        status: 'active', 
        source: 'app', 
        agreedPrice: car.agreedPrice, 
        customerPhone: car.customerPhone, 
        customerName: car.customerName, 
        startedBy: 'garage', 
        incomingCarId: carId, 
        addedBy: isValet ? (currentValetNameLocal || currentValetName || `سايس ${valetNumber}`) : '' 
      } as any);
      
      await removeIncomingCar(carId);
      await supabase.from('incoming_cars').delete().eq('car_plate', np).eq('garage_id', garage.id);
      toast.success(`بدأ حساب ${carPlate} 🚗`);
    } catch (e) { 
      processedCarsRef.current.delete(carId); 
      toast.error('حدث خطأ، حاول مرة أخرى'); 
    } finally {
      pausePolling(0);
    }
  };

  const calculateRemainingTime = (st: number | string, em: number) =>
    Math.max(0, em - Math.floor((getServerNow() - toMs(st)) / 60000));

  return (
    <div className="h-full overflow-y-auto" style={{ background: BRAND.bg, color: BRAND.navy, padding: 16 }}>

      {/* Header */}
      <div className="flex justify-between items-center mb-5 pt-14">
        <div className="flex gap-2 items-center">
          <button 
            onClick={() => {
              if (ownerValetView) {
                setOwnerValetView(false);
                toast.success('عدت لشاشة المالك 🛡️', { icon: '↩️' });
                return;
              }
              localStorage.removeItem('garageRole'); 
              localStorage.removeItem('valetNumber'); 
              localStorage.removeItem('valetName'); 
              setCurrentGarageId(null); 
            }} 
            className="active:scale-90 border-0 cursor-pointer p-3 rounded-2xl flex items-center justify-center" 
            style={{ 
              background: ownerValetView ? BRAND.blueSoft : BRAND.card, 
              border: `1px solid ${ownerValetView ? BRAND.blue : BRAND.border}` 
            }}
          >
            {ownerValetView 
              ? <Undo2 size={18} style={{ color: BRAND.blue }} /> 
              : <LogOut size={18} style={{ color: BRAND.slate }} />}
          </button>

          {isOwner && myGarages.length > 1 && (
            <button
              onClick={() => setShowSwitcher(true)}
              className="active:scale-95 font-black flex items-center gap-1.5 border-0 text-white py-2 px-3 rounded-xl text-xs cursor-pointer"
              style={{
                background: BRAND.blue,
                boxShadow: `0 4px 12px ${BRAND.blue}20`
              }}
            >
              <Building2 size={13} />
              <span>جراجاتي ({myGarages.length})</span>
            </button>
          )}

          {/* 🟢 زر تفعيل وضع السايس للمالك */}
          {isOwner && (
            <button
              onClick={() => {
                setOwnerValetView(true);
                toast.success('دخلت شاشة السايس 🅿️', { icon: '👁️' });
              }}
              className="active:scale-95 font-black flex items-center gap-1.5 border-0 text-white py-2 px-3 rounded-xl text-xs cursor-pointer"
              style={{
                background: BRAND.navy,
              }}
            >
              <HardHat size={13} />
              <span>شاشة السايس</span>
            </button>
          )}
        </div>

        <div className="text-right flex-1 mr-3">
          <h2 className="font-black text-base" style={{ color: BRAND.navy }}>{garage.name}</h2>
          <div className="flex items-center gap-1.5 justify-end mt-1">
            <span className="font-bold flex items-center gap-1 text-[9px] px-2 py-0.5 rounded text-white" style={{ background: isOwner ? BRAND.blue : '#f59e0b' }}>
              {isOwner ? <><Shield size={9} /> مالك</> : <><HardHat size={9} /> <span>{ownerValetView ? 'المالك (معاينة)' : `سايس ${valetNumber}`}</span> {currentValetName && !ownerValetView && <span> - {currentValetName}</span>}</>}
            </span>
            <p className="flex items-center gap-1 text-[10px] text-slate-400 font-bold"><MapPin size={10} /> {garage.location}</p>
          </div>
        </div>
        {isOwner && <button onClick={openSettings} className="active:scale-90 border-0 p-3 rounded-2xl text-white cursor-pointer" style={{ background: BRAND.blue }}><Settings size={18} /></button>}
        {isValet && <div style={{ width: 44 }} />}
      </div>

      {/* 🟢 شريط تنبيه المعاينة للمالك */}
      {ownerValetView && (
        <motion.div 
          initial={{ opacity: 0, y: -8 }} 
          animate={{ opacity: 1, y: 0 }}
          onClick={() => {
            setOwnerValetView(false);
            toast.success('عدت لشاشة المالك 🛡️', { icon: '↩️' });
          }}
          className="mb-4 flex items-center justify-between p-2.5 px-3 rounded-xl cursor-pointer border"
          style={{ 
            background: '#fffbeb', 
            borderColor: '#fde68a',
          }}
        >
          <span className="font-black text-white text-[9px] px-2.5 py-1 rounded animate-pulse" 
            style={{ 
              background: '#b45309', 
            }}>
            الرجوع للمالك ↩️
          </span>
          <div className="flex items-center gap-1.5 flex-1 justify-end mr-2">
            <span className="font-black text-xs" style={{ color: '#92400e' }}>
              وضع معاينة السايس نشط (العمليات تسجل باسم المالك)
            </span>
            <Eye size={14} style={{ color: '#b45309' }} className="shrink-0" />
          </div>
        </motion.div>
      )}

      {/* 👑 بانر حالة السياس للمالك */}
      {isOwner && <OwnerValetLocationBanner valetLocations={valetLocations} />}

      {/* Settings Modal */}
      {isOwner && showSettings && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,22,40,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => setShowSettings(false)}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-3xl p-6 bg-white" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <button onClick={() => setShowSettings(false)} className="text-slate-400 text-lg border-0 bg-transparent cursor-pointer">✕</button>
              <h3 className="font-black flex items-center gap-1.5 text-sm" style={{ color: BRAND.navy }}><Settings size={16} style={{ color: BRAND.blue }} /> إعدادات الجراج</h3>
            </div>
            
            <div className="mb-5">
              <label className="font-black block text-right mb-1.5 text-[10px]" style={{ color: BRAND.slate }}>💰 سعر الساعة</label>
              <div className="border rounded-xl p-3" style={{ background: BRAND.bg, borderColor: BRAND.border }}>
                <div className="flex items-center justify-between gap-3">
                  <button onClick={() => setEditPrice(p => Math.max(5, p - 5))} className="active:scale-90 border-0 rounded-lg text-white font-black w-10 h-10 flex items-center justify-center cursor-pointer" style={{ background: '#ef4444' }}><Minus size={16} /></button>
                  <div className="text-center flex-1"><input type="number" value={editPrice} onChange={e => setEditPrice(Math.max(1, parseInt(e.target.value) || 0))} className="bg-transparent text-center w-full outline-none font-mono font-black text-3xl border-0" style={{ color: BRAND.navy }} /><div className="font-bold text-[9px]" style={{ color: BRAND.slateMuted }}>ج.م / ساعة</div></div>
                  <button onClick={() => setEditPrice(p => p + 5)} className="active:scale-90 border-0 rounded-lg text-white font-black w-10 h-10 flex items-center justify-center cursor-pointer" style={{ background: BRAND.greenDark }}><Plus size={16} /></button>
                </div>
              </div>
            </div>

            <div className="mb-5">
              <label className="font-black block text-right mb-1.5 text-[10px]" style={{ color: BRAND.slate }}>🚗 الأماكن المتاحة</label>
              <div className="border rounded-xl p-3" style={{ background: BRAND.bg, borderColor: BRAND.border }}>
                <div className="flex items-center justify-between gap-3">
                  <button onClick={() => setEditSpots(s => Math.max(0, s - 1))} className="active:scale-90 border-0 rounded-lg text-white font-black w-10 h-10 flex items-center justify-center cursor-pointer" style={{ background: '#ef4444' }}><Minus size={16} /></button>
                  <div className="text-center flex-1"><input type="number" value={editSpots} onChange={e => setEditSpots(Math.max(0, Math.min(editCapacity, parseInt(e.target.value) || 0)))} className="bg-transparent text-center w-full outline-none font-mono font-black text-3xl border-0" style={{ color: BRAND.blue }} /><div className="font-bold text-[9px]" style={{ color: BRAND.slateMuted }}>من {editCapacity} مكان</div></div>
                  <button onClick={() => setEditSpots(s => Math.min(editCapacity, s + 1))} className="active:scale-90 border-0 rounded-lg text-white font-black w-10 h-10 flex items-center justify-center cursor-pointer" style={{ background: BRAND.greenDark }}><Plus size={16} /></button>
                </div>
              </div>
            </div>

            <div className="mb-5">
              <label className="font-black block text-right mb-1.5 text-[10px]" style={{ color: BRAND.slate }}>🏢 السعة الكلية</label>
              <div className="border rounded-xl p-3" style={{ background: BRAND.bg, borderColor: BRAND.border }}>
                <div className="flex items-center justify-between gap-3">
                  <button onClick={() => setEditCapacity(c => Math.max(editSpots, c - 10))} className="active:scale-90 border rounded-lg text-slate-600 font-black w-9 h-9 flex items-center justify-center cursor-pointer bg-white" style={{ borderColor: BRAND.border }}><Minus size={14} /></button>
                  <div className="text-center flex-1"><input type="number" value={editCapacity} onChange={e => setEditCapacity(Math.max(editSpots, parseInt(e.target.value) || editSpots))} className="bg-transparent text-center w-full outline-none font-mono font-black text-xl border-0" style={{ color: BRAND.navy }} /></div>
                  <button onClick={() => setEditCapacity(c => c + 10)} className="active:scale-90 border rounded-lg text-slate-600 font-black w-9 h-9 flex items-center justify-center cursor-pointer bg-white" style={{ borderColor: BRAND.border }}><Plus size={14} /></button>
                </div>
              </div>
            </div>

            <div className="mb-5">
              <label className="font-black block text-right mb-1.5 text-[10px]" style={{ color: BRAND.slate }}>💳 طرق الدفع المقبولة في جراجك</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setEditPaymentMode('cash')}
                  className="p-2 py-3 rounded-xl font-black flex flex-col items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer border"
                  style={{
                    background: editPaymentMode === 'cash' ? '#fff7ed' : BRAND.bg,
                    borderColor: editPaymentMode === 'cash' ? '#f97316' : BRAND.border,
                    color: editPaymentMode === 'cash' ? '#c2410c' : BRAND.slate,
                  }}
                >
                  <span className="text-base">💵</span>
                  <span className="text-[9px] font-black">نقدي فقط</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditPaymentMode('wallet')}
                  className="p-2 py-3 rounded-xl font-black flex flex-col items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer border"
                  style={{
                    background: editPaymentMode === 'wallet' ? BRAND.blueSoft : BRAND.bg,
                    borderColor: editPaymentMode === 'wallet' ? BRAND.blue : BRAND.border,
                    color: editPaymentMode === 'wallet' ? BRAND.blue : BRAND.slate,
                  }}
                >
                  <span className="text-base">👝</span>
                  <span className="text-[9px] font-black">محفظة فقط</span>
                </button>
                
                <button
                  type="button"
                  onClick={() => setEditPaymentMode('both')}
                  className="p-2 py-3 rounded-xl font-black flex flex-col items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer border"
                  style={{
                    background: editPaymentMode === 'both' ? BRAND.greenLight : BRAND.bg,
                    borderColor: editPaymentMode === 'both' ? BRAND.green : BRAND.border,
                    color: editPaymentMode === 'both' ? BRAND.greenDark : BRAND.slate,
                  }}
                >
                  <span className="text-base">💵👝</span>
                  <span className="text-[9px] font-black">الاثنين معاً</span>
                </button>
              </div>
            </div>

            <div className="mb-5">
              <label className="font-black block text-right mb-1.5 text-[10px]" style={{ color: BRAND.slate }}>🅿️ إدارة السياس</label>
              <div className="border rounded-xl p-3 space-y-3" style={{ background: BRAND.bg, borderColor: BRAND.border }}>
                {[
                  { n: 1, name: editValet1Name, setName: setEditValet1Name, pass: editValet1Pass, setPass: setEditValet1Pass, color: BRAND.blue, active: (garage as any).valet1Active, activeKey: 'valet1Active' as const },
                  { n: 2, name: editValet2Name, setName: setEditValet2Name, pass: editValet2Pass, setPass: setEditValet2Pass, color: '#7c3aed', active: (garage as any).valet2Active, activeKey: 'valet2Active' as const },
                  { n: 3, name: editValet3Name, setName: setEditValet3Name, pass: editValet3Pass, setPass: setEditValet3Pass, color: '#f59e0b', active: (garage as any).valet3Active, activeKey: 'valet3Active' as const },
                ].map((v, i) => (
                  <div key={i} className={i < 2 ? 'pb-3 border-b border-dashed' : ''} style={{ borderColor: BRAND.border }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-[9px]" style={{ color: !(v.name || v.pass) ? BRAND.slateMuted : v.active ? BRAND.greenDark : '#ef4444' }}>{!(v.name || v.pass) ? '⚪ غير مُعد' : v.active ? '🟢 مفعّل' : '🔴 معطّل'}</span>
                      <div className="flex items-center gap-1.5">
                        {(v.name || v.pass) && (<button onClick={(e) => { e.stopPropagation(); updateGarage(garage.id, { [v.activeKey]: !v.active } as any); }} className="font-black text-[8px] py-0.5 px-2 rounded cursor-pointer border-0 text-white" style={{ background: v.active ? '#ef4444' : BRAND.greenDark }}>{v.active ? 'تعطيل' : 'تفعيل'}</button>)}
                        <span className="font-black text-[10px]" style={{ color: BRAND.navy }}>🅿️ سايس {v.n}</span>
                      </div>
                    </div>
                    <input type="text" value={v.name} onChange={e => v.setName(e.target.value)} className="w-full text-right outline-none font-bold mb-1.5 text-xs p-2 rounded-lg border border-slate-200" placeholder={`اسم سايس ${v.n}`} />
                    <input type="text" value={v.pass} onChange={e => v.setPass(e.target.value)} className="w-full text-center outline-none font-mono font-black text-sm p-2 rounded-lg border border-slate-200" placeholder={`كلمة مرور سايس ${v.n}`} />
                  </div>
                ))}
              </div>
            </div>
            <button onClick={handleSaveSettings} className="w-full font-black flex items-center justify-center gap-2 active:scale-95 py-3 rounded-xl text-white border-0 cursor-pointer text-xs" style={{ background: BRAND.blue }}><Save size={16} /> حفظ التغييرات</button>
          </motion.div>
        </motion.div>
      )}

      {/* Confirm Payment Modal */}
      {confirmSession && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 flex items-end justify-center p-4" style={{ background: 'rgba(10,22,40,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => setConfirmSession(null)}>
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} transition={{ type: 'spring', damping: 25 }} className="w-full max-w-sm rounded-t-[28px] p-6 bg-white" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1.5 rounded-full bg-slate-200 mx-auto mb-4" />
            <h3 className="font-black text-center mb-1 text-sm" style={{ color: BRAND.navy }}>تأكيد تحصيل السداد</h3>
            
            <div className="mb-4 border rounded-xl p-3.5 bg-slate-50" style={{ borderColor: BRAND.border }}>
              <div className="flex justify-between items-center mb-3">
                <span className="font-bold text-[9px] px-2 py-0.5 rounded text-white" style={{ background: confirmSession.source === 'manual' ? '#f59e0b' : BRAND.blue }}>{confirmSession.source === 'manual' ? 'يدوي' : 'تطبيق'}</span>
                <div className="font-black text-base text-slate-900">🚗 {confirmSession.carPlate}</div>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center bg-white p-2.5 rounded-lg border" style={{ borderColor: BRAND.border }}>
                  <div className="text-[10px] text-slate-400 font-bold">المدة</div>
                  <div className="font-black font-mono text-sm mt-0.5 text-slate-800">{confirmSession.minutes} دقيقة</div>
                </div>
                
                <div className="text-center bg-white p-2.5 rounded-lg border" style={{ borderColor: BRAND.border }}>
                  <div className="text-[10px] text-slate-400 font-bold">المستحق</div>
                  <div className="font-black font-mono text-xl mt-0.5" style={{ color: confirmSession.cost === 0 ? '#f59e0b' : BRAND.greenDark }}>
                    {confirmSession.cost} <span className="text-[10px]">ج.م</span>
                  </div>
                </div>
              </div>
              
              {confirmSession.cost === 0 && (
                <div className="mt-2.5 text-center p-1.5 rounded-lg text-emerald-800 font-bold text-[10px] flex items-center justify-center gap-1" style={{ background: BRAND.greenLight }}>
                  <Gift size={12} /> أول 30 دقيقة مجانية كهدية ترحيبية 🎁
                </div>
              )}
            </div>

            <div className="mb-5">
              <h4 className="font-black mb-2 text-right text-[10px]" style={{ color: BRAND.slate }}>طريقة التحصيل</h4>

              {isValet || confirmSession.source === 'manual' ? (
                <div className="text-center p-3 rounded-xl border" style={{ background: BRAND.greenLight, borderColor: BRAND.green }}>
                  <div className="font-black text-xs" style={{ color: BRAND.greenDark }}>💵 سداد نقدي (كاش يداً بيد)</div>
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setConfirmPaymentMethod('cash')}
                    className="w-full p-2.5 rounded-xl flex items-center justify-between font-black border cursor-pointer"
                    style={{
                      background: confirmPaymentMethod === 'cash' ? '#fff7ed' : BRAND.bg,
                      borderColor: confirmPaymentMethod === 'cash' ? '#f97316' : BRAND.border,
                      color: confirmPaymentMethod === 'cash' ? '#c2410c' : BRAND.slate
                    }}
                  >
                    <span className="text-xs">💵 سداد نقدي (كاش)</span>
                    {confirmPaymentMethod === 'cash' && <span className="text-[9px] px-2 py-0.5 rounded text-white bg-orange-600">✓ محدد</span>}
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmPaymentMethod('wallet')}
                    className="w-full p-2.5 rounded-xl flex items-center justify-between font-black border cursor-pointer"
                    style={{
                      background: confirmPaymentMethod === 'wallet' ? BRAND.blueSoft : BRAND.bg,
                      borderColor: confirmPaymentMethod === 'wallet' ? BRAND.blue : BRAND.border,
                      color: confirmPaymentMethod === 'wallet' ? BRAND.blue : BRAND.slate
                    }}
                  >
                    <span className="text-xs">👝 خصم من المحفظة</span>
                    {confirmPaymentMethod === 'wallet' && <span className="text-[9px] px-2 py-0.5 rounded text-white bg-blue-600">✓ محدد</span>}
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button 
                onClick={handleConfirmPayment} 
                className="flex-1 font-black flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs text-white border-0 cursor-pointer" 
                style={{ 
                  background: BRAND.greenDark,
                }}
              >
                <CheckCircle size={16} /> تأكيد واستلام ({confirmSession.cost} ج.م)
              </button>
              <button onClick={() => setConfirmSession(null)} className="py-3 px-4 rounded-xl border bg-white cursor-pointer" style={{ borderColor: BRAND.border, color: BRAND.slate }}>إلغاء</button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Stats Cards */}
      <div className={`grid ${isOwner ? 'grid-cols-3' : 'grid-cols-2'} gap-2.5 mb-5`}>
        {isOwner ? (
          <>
            <div className="text-center p-3 rounded-xl border bg-white" style={{ borderColor: BRAND.border }}>
              <div className="text-[10px] font-bold text-slate-400 mb-0.5">مؤكد اليوم</div>
              <div className="font-black font-mono text-base" style={{ color: BRAND.greenDark }}>
                {topCardConfirmedRevenue.toFixed(0)} <span className="text-[9px] font-bold text-slate-400">ج</span>
              </div>
            </div>

            <div onClick={openSettings} className="text-center p-3 rounded-xl border bg-white cursor-pointer active:scale-95" style={{ borderColor: BRAND.border }}>
              <div className="text-[10px] font-bold text-slate-400 mb-0.5 flex items-center justify-center gap-1">
                <Car size={10} style={{ color: BRAND.blue }} /> شاغر
              </div>
              <div className="font-black font-mono text-base" style={{ color: BRAND.blue }}>
                {garage.availableSpots}
              </div>
            </div>

            <div onClick={openSettings} className="text-center p-3 rounded-xl border bg-white cursor-pointer active:scale-95" style={{ borderColor: BRAND.border }}>
              <div className="text-[10px] font-bold text-slate-400 mb-0.5">سعر/ساعة</div>
              <div className="font-black font-mono text-base text-slate-800">
                {garage.basePrice} <span className="text-[9px] font-bold text-slate-400">ج</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="text-center p-3 rounded-xl border bg-white" style={{ borderColor: BRAND.border }}>
              <div className="text-[10px] font-bold text-slate-400 mb-0.5">جلساتي النشطة</div>
              <div className="font-black font-mono text-lg" style={{ color: BRAND.blue }}>
                {valetActiveSessions.length}
              </div>
            </div>

            <div className="text-center p-3 rounded-xl border bg-white" style={{ borderColor: BRAND.border }}>
              <div className="text-[10px] font-bold text-slate-400 mb-0.5">شاغر</div>
              <div className="font-black font-mono text-lg" style={{ color: BRAND.greenDark }}>
                {garage.availableSpots}
              </div>
            </div>
          </>
        )}
      </div>

      {/* السايس فقط */}
      {isValet && (
        <>
          {/* سيارات في الطريق */}
          {carsOnTheWay.length > 0 && (
            <div className="mb-5">
              <h3 className="font-black mb-2 text-right text-xs" style={{ color: BRAND.blue }}>
                سيارات في الطريق ({carsOnTheWay.length})
              </h3>
              <div className="space-y-2">
                {carsOnTheWay.map(car => {
                  const rem = calculateRemainingTime(car.startTime, car.estimatedArrival);
                  return (
                    <motion.div 
                      key={car.id} 
                      initial={{ opacity: 0, x: 20 }} 
                      animate={{ opacity: 1, x: 0 }} 
                      className="p-3.5 rounded-xl border bg-white"
                      style={{ borderColor: BRAND.blue }}
                    >
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-black font-mono text-[10px] px-2 py-0.5 rounded text-white" style={{ background: rem <= 2 ? '#f59e0b' : BRAND.blue }}>
                          {rem > 0 ? `${rem} دقيقة` : 'وصل تقريباً ⏰'}
                        </span>
                        <div className="font-black text-sm text-slate-900">
                          🚗 {car.carPlate}
                        </div>
                      </div>

                      <button 
                        onClick={() => handleCarArrived(car)} 
                        className="w-full font-black flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-white border-0 cursor-pointer text-xs" 
                        style={{ background: BRAND.greenDark }}
                      >
                        <CheckCircle size={14} /> وصلت وبدء الحساب
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {garageOffers.length > 0 && (
            <div className="mb-5">
              <h3 className="font-black mb-2 text-right text-xs" style={{ color: '#f59e0b' }}>عروض أسعار معلقة ({garageOffers.length})</h3>
              <div className="space-y-2">
                {garageOffers.map(o => (
                  <motion.div key={o.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="p-3 border rounded-xl bg-white" style={{ borderColor: '#fed7aa' }}>
                    <div className="flex justify-between items-center mb-2"><div className="font-black font-mono text-base text-slate-800">{o.offeredPrice} ج.م</div><div className="font-black text-xs">🚗 {o.carPlate}</div></div>
                    <div className="flex gap-2">
                      <button onClick={() => { updateOffer(o.id, 'accepted'); toast.success('تم القبول'); }} className="flex-1 font-black py-2 rounded-lg text-white text-xs border-0 cursor-pointer" style={{ background: BRAND.greenDark }}><CheckCircle size={14} /> قبول</button>
                      <button onClick={() => { updateOffer(o.id, 'rejected'); toast.error('تم الرفض'); }} className="flex-1 font-black py-2 rounded-lg text-white text-xs border-0 cursor-pointer" style={{ background: '#dc2626' }}><XCircle size={14} /> رفض</button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-5">
            {!showAddCar ? (
              <button onClick={() => setShowAddCar(true)} disabled={garage.availableSpots <= 0} className="w-full font-black flex items-center justify-center gap-2 py-3.5 rounded-xl text-white border-0 cursor-pointer text-xs" style={{ background: garage.availableSpots > 0 ? BRAND.blue : BRAND.border, color: garage.availableSpots > 0 ? '#fff' : BRAND.slateMuted }}><Plus size={16} /> {garage.availableSpots > 0 ? 'إضافة سيارة جديدة' : 'لا توجد أماكن'}</button>
            ) : (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 p-4 border rounded-2xl bg-white" style={{ borderColor: BRAND.blue }}>
                <input className="w-full font-bold text-right outline-none text-xs p-2.5 rounded-lg border border-slate-200" placeholder="رقم لوحة السيارة" value={newCarPlate} onChange={e => setNewCarPlate(e.target.value)} />
                <div>
                  <label className="font-bold block text-right mb-1 text-[10px]" style={{ color: BRAND.slate }}>💰 سعر الساعة</label>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setNewCarPrice(p => Math.max(5, p - 5))} className="w-8 h-8 rounded-lg text-white font-black flex items-center justify-center border-0 cursor-pointer" style={{ background: '#ef4444' }}><Minus size={14} /></button>
                    <input type="number" value={newCarPrice} onChange={e => setNewCarPrice(Math.max(1, parseInt(e.target.value) || 1))} className="flex-1 text-center font-black outline-none font-mono text-base p-1 rounded border border-slate-200" />
                    <button onClick={() => setNewCarPrice(p => p + 5)} className="w-8 h-8 rounded-lg text-white font-black flex items-center justify-center border-0 cursor-pointer" style={{ background: BRAND.greenDark }}><Plus size={14} /></button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddCar} className="flex-1 font-black py-2 rounded-lg text-white text-xs border-0 cursor-pointer" style={{ background: BRAND.greenDark }}>إضافة ({newCarPrice} ج.م/ساعة)</button>
                  <button onClick={() => { setShowAddCar(false); setNewCarPlate(''); setNewCarPrice(garage.basePrice); }} className="flex-1 font-black py-2 rounded-lg text-slate-600 text-xs border bg-white cursor-pointer" style={{ borderColor: BRAND.border }}>إلغاء</button>
                </div>
              </motion.div>
            )}
          </div>

          <div className="mb-5">
            <h3 className="font-black mb-3 text-right text-xs" style={{ color: BRAND.navy }}>الجلسات النشطة ({valetActiveSessions.length})</h3>

            {valetActiveSessions.length > 0 && (
              <div className="mb-3 relative">
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: BRAND.slateMuted }} />
                <input
                  type="text"
                  value={plateSearch}
                  onChange={(e) => setPlateSearch(e.target.value)}
                  placeholder="ابحث برقم اللوحة..."
                  className="w-full font-bold text-right outline-none text-xs py-2 px-8 rounded-xl border border-slate-200"
                />
              </div>
            )}

            <div className="space-y-2">
              {filteredValetActiveSessions.length === 0 ? (
                <div className="text-center py-6 border-2 border-dashed rounded-xl text-xs font-bold" style={{ borderColor: BRAND.border, color: BRAND.slateMuted }}>
                  {plateSearch ? `🔍 لا توجد نتائج للبحث "${plateSearch}"` : 'لا توجد جلسات نشطة'}
                </div>
              ) : (
                filteredValetActiveSessions.map(s => {
                  const un = undoableSessions.find(u => u.sessionId === s.id || u.localId === s.id);
                  return (
                    <ActiveSessionCard
                      key={s.id}
                      session={s}
                      basePrice={garage.basePrice}
                      undoableSession={un}
                      onEndSession={openConfirmPayment}
                      onUndo={handleUndoSession}
                      getUndoRemainingSeconds={getUndoRemainingSeconds}
                    />
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {/* Owner info bar */}
      {isOwner && (
        <div className="mb-4 flex items-center justify-between p-3 border rounded-xl bg-white" style={{ borderColor: BRAND.border }}>
          <button onClick={openSettings} className="font-bold flex items-center gap-1 text-[10px] border-0 bg-transparent cursor-pointer" style={{ color: BRAND.blue }}><Settings size={12} /> تعديل</button>
          <div className="flex items-center gap-2.5 text-[10px] text-slate-500 font-bold">
            <span>السعر: <b className="font-mono text-slate-800">{garage.basePrice}ج</b></span>
            <span>·</span>
            <span>عمولة: <b className="font-mono text-slate-800">{garage.commissionRate ?? 10}%</b></span>
            <span>·</span>
            <span>متاح: <b className="font-mono" style={{ color: BRAND.blue }}>{garage.availableSpots}/{garage.capacity}</b></span>
          </div>
        </div>
      )}

      {/* Valet info bar */}
      {isValet && (
        <div className="mb-4 p-3 border rounded-xl bg-white" style={{ borderColor: BRAND.border }}>
          <div className="flex items-center justify-between">
            <span className="font-black text-xs flex items-center gap-1" style={{ color: BRAND.navy }}><HardHat size={14} style={{ color: '#f59e0b' }} />{ownerValetView ? 'المالك (معاينة)' : (currentValetName || `سايس ${valetNumber}`)}</span>
            <div className="flex items-center gap-3">
              <div className="text-right"><div className="text-[8px] text-slate-400">السعر/ساعة</div><div className="font-black font-mono text-xs">{garage.basePrice} ج</div></div>
              <div style={{ width: 1, height: 16, background: BRAND.border }} />
              <div className="text-right"><div className="text-[8px] text-slate-400">الشاغر</div><div className="font-black font-mono text-xs" style={{ color: BRAND.blue }}>{garage.availableSpots}/{garage.capacity}</div></div>
              <button onClick={() => setValetEditSpots(!valetEditSpots)} className="border-0 bg-transparent cursor-pointer" style={{ color: BRAND.blue }}><Edit3 size={12} /></button>
            </div>
          </div>
          {valetEditSpots && (
            <div className="mt-3 pt-3 border-t flex items-center justify-between gap-2" style={{ borderColor: BRAND.border }}>
              <button onClick={async () => { if (garage.availableSpots <= 0) return; await adjustGarageSpots(garage.id, -1); }} disabled={garage.availableSpots <= 0} className="w-8 h-8 rounded text-white bg-red-600 border-0 cursor-pointer">-</button>
              <span className="font-mono font-black text-sm">{garage.availableSpots} مكان</span>
              <button onClick={async () => { if (garage.availableSpots >= garage.capacity) return; await adjustGarageSpots(garage.id, 1); }} disabled={garage.availableSpots >= garage.capacity} className="w-8 h-8 rounded text-white bg-emerald-600 border-0 cursor-pointer">+</button>
            </div>
          )}
        </div>
      )}

      {/* سجل العمليات */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="font-bold text-[9px] px-2 py-0.5 rounded bg-slate-200" style={{ color: BRAND.slate }}>{filteredCompleted.length} عملية اليوم</span>
          <h3 className="font-black text-xs" style={{ color: BRAND.navy }}>{isValet ? 'سجل عملياتي اليوم' : 'سجل العمليات'}</h3>
        </div>

        {isOwner && (
          <div className="mb-3 p-3 border rounded-xl bg-white" style={{ borderColor: BRAND.border }}>
            <div className="flex items-center gap-1.5 mb-2">
              <input type="date" value={logDateFrom} onChange={e => setLogDateFrom(e.target.value)} className="flex-1 font-bold outline-none text-center text-[10px] p-1.5 rounded border border-slate-200" style={{ color: BRAND.blue }} />
              <span className="text-slate-400 text-xs">←</span>
              <input type="date" value={logDateTo} onChange={e => setLogDateTo(e.target.value)} className="flex-1 font-bold outline-none text-center text-[10px] p-1.5 rounded border border-slate-200" style={{ color: BRAND.blue }} />
            </div>

<div className="flex gap-1 mb-2">
  <button onClick={() => { setLogDateFrom(getLocalToday()); setLogDateTo(getLocalToday()); }} className="flex-1 font-black py-1 rounded text-[9px] border-0 text-white cursor-pointer" style={{ background: BRAND.blue }}>📅 اليوم</button>
  <button onClick={() => { const d = new Date(getServerNow()); const firstDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; setLogDateFrom(firstDay); setLogDateTo(getLocalToday()); }} className="flex-1 font-bold py-1 rounded text-[9px] border bg-white cursor-pointer" style={{ borderColor: BRAND.border }}>📅 الشهر كامل</button>
</div>

            <div className="flex gap-1">
              {[{ id: 'all', label: 'الكل' }, { id: 'cash', label: 'نقدي' }, { id: 'wallet', label: 'محفظة' }].map(f => (
                <button key={f.id} onClick={() => setLogPaymentFilter(f.id)} className="flex-1 font-black py-1 rounded text-[9px] cursor-pointer border" style={{ background: logPaymentFilter === f.id ? BRAND.blue : BRAND.bg, color: logPaymentFilter === f.id ? '#fff' : BRAND.slate, borderColor: BRAND.border }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {filteredCompleted.length > 0 && (
          <>
            {filteredStats.pendingCount > 0 && (
              <div className="mb-3 p-2.5 rounded-xl border flex items-center justify-between" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
                <span className="font-mono font-black text-sm text-amber-700">{filteredStats.pendingRevenue.toFixed(0)} ج.م</span>
                <span className="font-black text-xs text-amber-900">⏳ عمليات معلقة للتأكيد ({filteredStats.pendingCount})</span>
              </div>
            )}

            {isOwner && (
              <>
                <div className="mb-3 p-3 text-center border rounded-xl bg-white" style={{ borderColor: BRAND.border }}>
                  <div className="text-[9px] font-bold text-slate-400">إجمالي الإيراد المؤكد</div>
                  <div className="font-black font-mono text-xl mt-0.5" style={{ color: BRAND.greenDark }}>
                    {filteredStats.total.toFixed(0)} <span className="text-[10px]">ج.م</span>
                  </div>
                </div>

                {/* 📊 بانر العمولة وصافي الأرباح مع كارت تسوية الحساب المالي */}
                {filteredStats.totalCommission > 0 && (
                  <div className="space-y-2 mb-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-center transition-all" style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 16, padding: '8px 10px' }}>
                        <div className="font-bold mb-0.5" style={{ fontSize: 9, color: BRAND.slate }}>عمولة التطبيق</div>
                        <div className="font-black font-mono leading-none" style={{ fontSize: 16, color: '#f59e0b' }}>
                          {filteredStats.totalCommission.toFixed(0)} <span style={{ fontSize: 9 }}>ج.م</span>
                        </div>
                      </div>

                      <div className="text-center transition-all" style={{ background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 16, padding: '8px 10px' }}>
                        <div className="font-bold mb-0.5" style={{ fontSize: 9, color: BRAND.slate }}>صافي أرباحك</div>
                        <div className="font-black font-mono leading-none" style={{ fontSize: 16, color: BRAND.greenDark }}>
                          {filteredStats.totalNet.toFixed(0)} <span style={{ fontSize: 9 }}>ج.m</span>
                        </div>
                      </div>
                    </div>

                    {/* ⚖️ كارت تسوية الحساب المالي مع التطبيق */}
                    {(() => {
                      const settlement = filteredStats.activeWallet - filteredStats.activeCommission;
                      const isGarageOwed = settlement > 0;
                      const absSettlement = Math.abs(settlement).toFixed(0);

                      if (settlement === 0 && filteredStats.activeWallet === 0 && filteredStats.activeCommission === 0) return null;

                      return (
                        <div 
                          className="text-center transition-all p-3.5 border rounded-xl" 
                          style={{ 
                            background: settlement === 0 ? BRAND.blueSoft : isGarageOwed ? BRAND.greenLight : '#fff5f5', 
                            borderColor: settlement === 0 ? BRAND.blue : isGarageOwed ? BRAND.green : '#fca5a5' 
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <div className="font-black font-mono text-base" style={{ color: settlement === 0 ? BRAND.blue : isGarageOwed ? BRAND.greenDark : '#c53030' }}>
                              {absSettlement} ج.م
                            </div>
                            <div className="text-right">
                              <div className="font-black text-xs" style={{ color: BRAND.navy }}>
                                {settlement === 0 ? '⚖️ الحساب متزن تماماً' : isGarageOwed ? '🟢 مستحق لك طرف التطبيق' : '🔴 مستحق عليك للتطبيق'}
                              </div>
                              <div className="font-bold text-[9px] mt-0.5" style={{ color: BRAND.slate }}>
                                {isGarageOwed ? 'مبالغ المحفظة المستلمة أكبر من العمولة' : 'عمولة التطبيق أكبر من تحصيلات المحفظة'}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {valetReport.length > 0 && (
                  <div className="mb-3 space-y-1.5">
                    <h4 className="font-black text-[10px] text-right" style={{ color: BRAND.slate }}>تقرير السياس</h4>
                    {valetReport.map((v, i) => (
                      <div key={i} onClick={() => setSelectedValetFilter(selectedValetFilter === v.name ? null : v.name)} className="p-2.5 border rounded-xl bg-white flex justify-between items-center cursor-pointer" style={{ borderColor: selectedValetFilter === v.name ? BRAND.blue : BRAND.border }}>
                        <span className="font-mono font-black text-xs" style={{ color: BRAND.blue }}>{v.total.toFixed(0)} ج.م</span>
                        <span className="font-bold text-xs text-slate-800">👤 {v.name} ({v.count} سيارة)</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            
            {isValet && (
              <div className="mb-3 flex items-center justify-between p-2.5 rounded-xl border bg-white" style={{ borderColor: BRAND.border }}>
                <span className="font-mono font-black text-base" style={{ color: BRAND.blue }}>{filteredCompleted.length}</span>
                <span className="font-black text-xs" style={{ color: BRAND.navy }}>📊 عملياتي اليوم</span>
              </div>
            )}
          </>
        )}

        <div className="space-y-1.5">
          {filteredCompleted.slice(0, 30).map(session => {
            const isM = session.source === 'manual';
            const et = session.endTime ? toMs(session.endTime) : null;
            const time = et ? new Date(et) : null;
            const rev = getSessionRevenue(session);
            const isC = session.revenueConfirmed;
            const isSettled = (session as any).settled === true;
            const rawAddedBy = String((session as any).addedBy || '').trim();
            const addedBy = garageValetNames.includes(rawAddedBy) ? rawAddedBy : '';
            return (
              <div key={session.id} className="p-2.5 border rounded-xl bg-white" style={{ borderColor: BRAND.border, opacity: isSettled ? 0.75 : 1 }}>
                <div className="flex justify-between items-center mb-1 gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(isOwner || !isC) && (
                      <span className="font-mono font-black text-xs" style={{ color: isSettled ? BRAND.slateMuted : rev === 0 && session.isFirstFreeSession ? BRAND.greenDark : BRAND.navy }}>
                        {rev === 0 && session.isFirstFreeSession ? '🎁 مجانية' : `${rev.toFixed(0)} ج`}
                      </span>
                    )}
                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded text-white" style={{ background: isSettled ? BRAND.slateMuted : isM ? '#f59e0b' : BRAND.blue }}>
                      {isSettled ? '🔒 مقفلة' : isM ? 'يدوي' : 'تطبيق'}
                    </span>
                    {!isSettled && !isC ? (
                      <button 
                        onClick={async () => { 
                          const currentValet = isValet ? (currentValetNameLocal || currentValetName || `سايس ${valetNumber}`) : '';
                          if (currentValet) await assignSessionToValet(session.id, currentValet);
                          await confirmRevenue(session.id, currentValet); 
                          await fetchGarageDailyStats(); 
                          toast.success('تأكيد ✅'); 
                        }} 
                        className="text-[8px] font-black px-2 py-0.5 rounded border-0 text-white cursor-pointer"
                        style={{ background: '#f59e0b' }}
                      >
                        ⏳ تأكيد
                      </button>
                    ) : !isSettled ? (
                      <span className="text-[8px] font-black" style={{ color: BRAND.greenDark }}>✅ مؤكد</span>
                    ) : null}
                  </div>
                  <div className="font-black text-xs text-slate-900">🚗 {session.carPlate}</div>
                </div>

                <div className="flex justify-between items-center text-[9px] text-slate-400 font-bold border-t pt-1 mt-1" style={{ borderColor: BRAND.border }}>
                  {/* 👤 عرض من المسؤول عن الجلسة */}
                  <span style={{ color: BRAND.slate }}>
                    👤 بواسطة: <b style={{ color: BRAND.navy }}>{session.addedBy || 'المالك'}</b>
                  </span>
                  
                  {time && <span className="font-mono">{time.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })} · {time.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}</span>}
                </div>

                <div className="flex items-center justify-start mt-1">
                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded text-white" style={{ background: isSettled ? BRAND.slateMuted : session.paymentMethod === 'cash' ? BRAND.greenDark : session.paymentMethod === 'wallet' ? BRAND.blue : '#fb923c' }}>
                    {session.paymentMethod === 'cash' ? '💵 نقدي كاش' : session.paymentMethod === 'wallet' ? '👝 محفظة' : '📱 تحويل'}
                  </span>
                </div>
              </div>
            );

          })}
          {filteredCompleted.length === 0 && (
            <div className="text-center py-6 border-2 border-dashed rounded-xl text-xs font-bold" style={{ borderColor: BRAND.border, color: BRAND.slateMuted }}>
              {isValet ? 'لا توجد عمليات لك اليوم' : 'لا توجد عمليات'}
            </div>
          )}
        </div>
      </div>

      {/* Switcher Modal */}
      <AnimatePresence>
        {showSwitcher && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] flex items-end justify-center p-4" style={{ background: 'rgba(10,22,40,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => setShowSwitcher(false)}>
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25 }} className="w-full max-w-sm bg-white rounded-t-[28px] p-6 text-right" onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1.5 rounded-full bg-slate-200 mx-auto mb-4" />
              
              <div className="flex justify-between items-center mb-4 pb-2 border-b" style={{ borderColor: BRAND.border }}>
                <button onClick={() => setShowSwitcher(false)} className="text-slate-400 text-lg border-0 bg-transparent cursor-pointer">✕</button>
                <h3 className="font-black flex items-center gap-1.5 text-xs" style={{ color: BRAND.navy }}>
                  <span>اختر الجراج للإدارة</span>
                  <Building2 size={16} style={{ color: BRAND.blue }} />
                </h3>
              </div>

              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                {myGarages.map((g) => {
                  const isActive = g.id === currentGarageId;
                  return (
                    <button key={g.id} onClick={() => { setCurrentGarageId(g.id); setShowSwitcher(false); toast.success(`تم الانتقال لـ ${g.name} ⚡`); fetchAll(); }} className="w-full p-3 rounded-xl text-right transition-all flex justify-between items-center border cursor-pointer" style={{ background: isActive ? BRAND.blueSoft : '#ffffff', borderColor: isActive ? BRAND.blue : BRAND.border }}>
                      <div className="text-center font-mono font-black text-xs" style={{ color: isActive ? BRAND.blue : BRAND.slateMuted }}>
                        <div>{g.availableSpots}</div>
                        <div className="text-[8px]">شاغر</div>
                      </div>
                      <div className="text-right flex-1 mr-3">
                        <div className="font-black text-xs" style={{ color: BRAND.navy }}>🅿️ {g.name}</div>
                        <div className="text-[9px] text-slate-400 mt-0.5">{g.location}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}