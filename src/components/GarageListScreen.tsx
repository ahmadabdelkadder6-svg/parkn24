import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin,
  Star,
  Car,
  Search,
  Navigation,
  Clock,
  Locate,
  Filter,
  Plus,
  Receipt,
  MessageCircle,
  Zap,
  X,
} from 'lucide-react';
import { useStore, Garage, Session, IncomingCar } from '../store';
import {
  calculateDistance,
  distanceToMinutes,
  classifyDistance,
  formatDuration,
} from '../utils/distance';
import TopUpWalletModal from './TopUpWalletModal';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';

/* ─── Types ─── */
interface GarageWithDistance extends Garage {
  distance: number;
  minutes: number;
  classification: 'nearby' | 'far';
}

/* ─── Helpers ─── */
const normalizePlateForCompare = (plate?: string): string => {
  if (!plate) return '';
  return plate
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/\s+/g, ' ')
    .toUpperCase();
};

const safeParseTime = (value: unknown): number => {
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

/* ════════════════════════════════════════════════════════════
   ██  MAIN SCREEN
   ════════════════════════════════════════════════════════════ */
export default function GarageListScreen() {
  const {
    garages,
    setSelectedGarageId,
    setScreen,
    currentUser,
    sessions,
    incomingCars,
    offers,
    addIncomingCar,
    fetchAll,
  } = useStore();

  const [search, setSearch] = useState('');
  const [showNearbyOnly, setShowNearbyOnly] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>({
    lat: 30.0444,
    lng: 31.2357,
  });
  const [locationLoading, setLocationLoading] = useState(false);
  const [isBooking, setIsBooking] = useState(false);

  /* ── Refs ── */
  const autoNavigatedRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /* ── Derived state ── */
  const normalizedUserPlate = useMemo(
    () => normalizePlateForCompare(currentUser?.carPlate),
    [currentUser?.carPlate]
  );

  const hasCompletedSession = useMemo(() => {
    return sessions.some(
      (s: Session) =>
        normalizePlateForCompare(s.carPlate) === normalizedUserPlate &&
        s.status === 'completed'
    );
  }, [sessions, normalizedUserPlate]);

  /* ✅ البحث عن جلسة نشطة */
  const activeSession = useMemo(() => {
    if (!normalizedUserPlate && !currentUser?.phone) return undefined;

    return sessions
      .filter((s: Session & { customerPhone?: string }) => {
        if (s.status !== 'active') return false;
        const samePlate = normalizePlateForCompare(s.carPlate) === normalizedUserPlate;
        const samePhone = Boolean(currentUser?.phone && s.customerPhone === currentUser.phone);
        return samePlate || samePhone;
      })
      .sort((a, b) => safeParseTime(b.startTime) - safeParseTime(a.startTime))[0];
  }, [sessions, normalizedUserPlate, currentUser?.phone]);

  /* ✅ البحث عن حجز نشط قادم */
  const myIncomingCar = useMemo(() => {
    if (!normalizedUserPlate) return undefined;
    return incomingCars
      .filter(
        (c: IncomingCar) =>
          normalizePlateForCompare(c.carPlate) === normalizedUserPlate &&
          c.status === 'coming'
      )
      .sort((a, b) => safeParseTime(b.startTime || 0) - safeParseTime(a.startTime || 0))[0];
  }, [incomingCars, normalizedUserPlate]);

  /* ── Location ── */
  const getUserLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      toast.error('خدمة تحديد الموقع غير مدعومة في متصفحك');
      return;
    }

    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (!isMountedRef.current) return;
        setUserLocation({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocationLoading(false);
        toast.success('تم تحديث موقعك بنجاح 📍');
      },
      () => {
        if (!isMountedRef.current) return;
        setLocationLoading(false);
        toast.error('تعذر تحديد موقعك بدقة، استخدام الموقع الافتراضي');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    getUserLocation();
  }, [getUserLocation]);

  /* ─────────────────────────────────────────────
     ██  REALTIME + Polling
     ───────────────────────────────────────────── */
  useEffect(() => {
    if (!normalizedUserPlate) return;

    let isSubscribed = true;

    const refetch = async () => {
      if (!isSubscribed) return;
      try {
        await fetchAll();
      } catch (e) {
        console.error('❌ Realtime Fetch Error:', e);
      }
    };

    const isMyRow = (row: any): boolean => {
      if (!row) return false;
      const plate = normalizePlateForCompare(row.car_plate || row.carPlate);
      const phone = row.customer_phone || row.customerPhone || '';
      return (
        plate === normalizedUserPlate ||
        Boolean(currentUser?.phone && phone === currentUser.phone)
      );
    };

    const channel = supabase
      .channel(`customer-realtime-${normalizedUserPlate}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions' },
        (payload) => {
          if (isMyRow(payload.new) || isMyRow(payload.old)) {
            refetch();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incoming_cars' },
        (payload) => {
          if (isMyRow(payload.new) || isMyRow(payload.old)) {
            refetch();
          }
        }
      )
      .subscribe();

    const interval = setInterval(refetch, 7000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refetch();
    };

    const handleFocus = () => refetch();

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      supabase.removeChannel(channel);
    };
  }, [normalizedUserPlate, currentUser?.phone, fetchAll]);

  /* ─────────────────────────────────────────────
     ██  انتقال تلقائي لشاشة الجلسة (عند بدء جلسة جديدة)
     ───────────────────────────────────────────── */
  useEffect(() => {
    if (!activeSession) {
      autoNavigatedRef.current = null;
      return;
    }

    if (autoNavigatedRef.current === activeSession.id) return;
    autoNavigatedRef.current = activeSession.id;

    setSelectedGarageId(activeSession.garageId);
    setScreen('session');
    toast.success('بدأت جلسة الركن! ⏱️', { icon: '🚗', duration: 3000 });
  }, [activeSession, setSelectedGarageId, setScreen]);

  /* ── Garages with distance ── */
  const garagesWithDistance: GarageWithDistance[] = useMemo(() => {
    return garages
      .map((garage) => {
        const distance = calculateDistance(
          userLocation.lat,
          userLocation.lng,
          garage.lat,
          garage.lng
        );
        const minutes = distanceToMinutes(distance);
        return {
          ...garage,
          distance,
          minutes,
          classification: classifyDistance(minutes),
        };
      })
      .sort((a, b) => a.minutes - b.minutes);
  }, [garages, userLocation]);

  const filteredGarages = useMemo(() => {
    let filtered = garagesWithDistance;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (g) => g.name.toLowerCase().includes(q) || g.location.toLowerCase().includes(q)
      );
    }
    if (showNearbyOnly) {
      filtered = filtered.filter((g) => g.classification === 'nearby');
    }
    return filtered;
  }, [garagesWithDistance, search, showNearbyOnly]);

  const nearbyGarages = useMemo(
    () => filteredGarages.filter((g) => g.classification === 'nearby'),
    [filteredGarages]
  );
  const farGarages = useMemo(
    () => filteredGarages.filter((g) => g.classification === 'far'),
    [filteredGarages]
  );

  /* ── Booking handler ── */
  const handleDirectBooking = async (garage: GarageWithDistance) => {
    if (!currentUser) {
      toast.error('سجل بياناتك أولاً');
      return;
    }

    if (activeSession) {
      setSelectedGarageId(activeSession.garageId);
      setScreen('session');
      toast('لديك جلسة ركن نشطة بالفعل! 🚗', { icon: '⚡' });
      return;
    }

    if (myIncomingCar) {
      setSelectedGarageId(myIncomingCar.garageId);
      setScreen('navigation');
      toast('لديك حجز نشط بالفعل! 📍', { icon: '🚗' });
      return;
    }

    if (offers.some((o) => o.userId === currentUser.phone && o.status === 'pending')) {
      toast.error('لديك عرض معلق بالفعل');
      return;
    }

    if (garage.availableSpots <= 0) {
      toast.error('لا توجد أماكن متاحة حالياً');
      return;
    }

    try {
      setIsBooking(true);
      setSelectedGarageId(garage.id);
      await addIncomingCar({
        garageId: garage.id,
        carPlate: currentUser.carPlate,
        customerName: currentUser.name,
        customerPhone: currentUser.phone,
        agreedPrice: garage.basePrice,
        estimatedArrival: Math.max(3, garage.minutes),
      });

      toast.success(`تم الحجز في ${garage.name} بسعر ${garage.basePrice} ج.م/ساعة 🚗`);
      setScreen('navigation');
    } catch (e) {
      console.error(e);
      toast.error('حدث خطأ أثناء إتمام الحجز');
    } finally {
      setIsBooking(false);
    }
  };

  /* ── Render ── */
  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#EBF2FF', color: '#0A1628' }}>
      {/* ══════ HEADER ══════ */}
      <div className="px-4 pt-10 pb-3 shadow-sm z-10" style={{ background: '#ffffff' }}>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-xl font-black" style={{ color: '#0A1628' }}>
              أهلاً {currentUser?.name || 'بك'} 👋
            </h1>
            <p className="text-xs font-bold mt-0.5" style={{ color: '#7B8CA6' }}>
              ابحث عن أقرب مكان ركن لسيارتك
            </p>
          </div>
          <img
            src="/images/logo.png"
            alt="بركن"
            className="w-12 h-12 object-contain"
            style={{
              borderRadius: 16,
              boxShadow: '0 4px 20px rgba(0,102,255,0.15)',
              border: '2px solid #E0EAFF',
            }}
          />
        </div>

        {/* بطاقة المحفظة */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0066FF 0%, #4D00FF 100%)',
            borderRadius: 24,
            padding: '18px 18px',
            marginBottom: 12,
            boxShadow: '0 8px 32px rgba(0,102,255,0.25)',
            color: '#ffffff',
          }}
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-[10px] font-bold" style={{ opacity: 0.85 }}>
                  💳 المحفظة
                </div>
                <div className="font-black font-mono" style={{ fontSize: 26, lineHeight: 1.1 }}>
                  {currentUser?.wallet || 0}
                  <span className="text-xs font-bold" style={{ opacity: 0.8, marginRight: 4 }}>
                    ج.م
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowTopUp(true)}
                className="flex items-center gap-1 font-black active:scale-95 transition-transform"
                style={{
                  background: 'rgba(255,255,255,0.25)',
                  backdropFilter: 'blur(10px)',
                  borderRadius: 14,
                  padding: '8px 14px',
                  fontSize: 12,
                }}
              >
                <Plus size={14} /> شحن
              </button>
            </div>
            <div
              className="font-black tracking-wide"
              style={{
                background: 'rgba(255,255,255,0.15)',
                backdropFilter: 'blur(10px)',
                borderRadius: 14,
                padding: '8px 12px',
                fontSize: 12,
              }}
            >
              🚗 {currentUser?.carPlate || '---'}
            </div>
          </div>
        </div>

        {/* بانر الجلسة النشطة */}
        {activeSession && (
          <motion.button
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => {
              setSelectedGarageId(activeSession.garageId);
              setScreen('session');
            }}
            className="w-full mb-3 flex items-center justify-between active:scale-[0.98] transition-all text-right"
            style={{
              background: 'linear-gradient(135deg, #00CC66 0%, #00AA55 100%)',
              borderRadius: 20,
              padding: '14px 16px',
              color: '#ffffff',
              boxShadow: '0 8px 24px rgba(0,204,102,0.3)',
            }}
          >
            <div className="flex items-center gap-2">
              <motion.span
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="w-3 h-3 rounded-full bg-white block"
              />
              <span className="text-xs font-black">عرض الجلسة ←</span>
            </div>
            <div>
              <div className="text-sm font-black flex items-center gap-1 justify-end">
                <Zap size={15} /> جلسة ركن نشطة
              </div>
              <div className="text-[10px]" style={{ opacity: 0.85 }}>
                اضغط للمتابعة والتفاصيل
              </div>
            </div>
          </motion.button>
        )}

        {/* بانر السيارة في الطريق */}
        {!activeSession && myIncomingCar && (
          <motion.button
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => {
              setSelectedGarageId(myIncomingCar.garageId);
              setScreen('navigation');
            }}
            className="w-full mb-3 flex items-center justify-between active:scale-[0.98] transition-all text-right"
            style={{
              background: 'linear-gradient(135deg, #0099DD 0%, #0077BB 100%)',
              borderRadius: 20,
              padding: '14px 16px',
              color: '#ffffff',
              boxShadow: '0 8px 24px rgba(0,153,221,0.3)',
            }}
          >
            <div className="flex items-center gap-2">
              <motion.span
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="w-3 h-3 rounded-full bg-white block"
              />
              <span className="text-xs font-black">عرض التوجيه ←</span>
            </div>
            <div>
              <div className="text-sm font-black flex items-center gap-1 justify-end">
                <Navigation size={15} /> حجز نشط (في الطريق)
              </div>
              <div className="text-[10px]" style={{ opacity: 0.85 }}>
                اضغط لفتح الخريطة والتوجيه
              </div>
            </div>
          </motion.button>
        )}

        {/* شريط البحث والفلاتر */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute right-3.5 top-1/2 -translate-y-1/2"
              style={{ color: '#94a3b8' }}
            />
            <input
              className="w-full font-bold outline-none text-sm"
              style={{
                background: '#F0F4FF',
                border: '2px solid #D0DCFF',
                padding: '12px 38px 12px 34px',
                borderRadius: 16,
                color: '#0A1628',
              }}
              placeholder="ابحث عن جراج..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <button
            onClick={getUserLocation}
            disabled={locationLoading}
            className="active:scale-90 transition-all flex items-center justify-center"
            style={{
              background: locationLoading ? '#E2E8F0' : '#0066FF',
              color: locationLoading ? '#94a3b8' : '#fff',
              borderRadius: 16,
              padding: '0 14px',
              boxShadow: locationLoading ? 'none' : '0 4px 14px rgba(0,102,255,0.25)',
            }}
            title="تحديد موقعي"
          >
            <Locate size={18} className={locationLoading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => setShowNearbyOnly(!showNearbyOnly)}
            className="font-black text-xs active:scale-90 transition-all whitespace-nowrap flex items-center gap-1"
            style={{
              background: showNearbyOnly ? '#0066FF' : '#F0F4FF',
              color: showNearbyOnly ? '#fff' : '#64748b',
              borderRadius: 16,
              padding: '0 14px',
              border: showNearbyOnly ? 'none' : '2px solid #D0DCFF',
              boxShadow: showNearbyOnly ? '0 4px 14px rgba(0,102,255,0.25)' : 'none',
            }}
          >
            <Filter size={13} /> {showNearbyOnly ? 'الكل' : 'قريب'}
          </button>
        </div>
      </div>

      {/* ══════ CONTENT ══════ */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-8">
        {/* أزرار الوصول السريع */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {hasCompletedSession && (
            <button
              onClick={() => setScreen('lastSession')}
              className="flex items-center gap-2 active:scale-[0.97] transition-all text-right"
              style={{
                background: '#ffffff',
                border: '1.5px solid #D0DCFF',
                borderRadius: 16,
                padding: '10px 12px',
                boxShadow: '0 2px 8px rgba(0,102,255,0.04)',
              }}
            >
              <div style={{ background: '#0066FF', borderRadius: 10, padding: 6, color: '#fff' }}>
                <Receipt size={14} />
              </div>
              <div className="flex-1">
                <div className="font-black text-xs" style={{ color: '#0A1628' }}>
                  آخر جلسة
                </div>
                <div style={{ fontSize: 9, color: '#94a3b8' }}>عرض الإيصال</div>
              </div>
            </button>
          )}

          <button
            onClick={() => setScreen('chat')}
            className={`flex items-center gap-2 active:scale-[0.97] transition-all text-right ${
              !hasCompletedSession ? 'col-span-2' : ''
            }`}
            style={{
              background: '#ffffff',
              border: '1.5px solid #E0D6FF',
              borderRadius: 16,
              padding: '10px 12px',
              boxShadow: '0 2px 8px rgba(124,58,237,0.04)',
            }}
          >
            <div style={{ background: '#7C3AED', borderRadius: 10, padding: 6, color: '#fff' }}>
              <MessageCircle size={14} />
            </div>
            <div className="flex-1">
              <div className="font-black text-xs" style={{ color: '#0A1628' }}>
                تواصل معنا
              </div>
              <div style={{ fontSize: 9, color: '#94a3b8' }}>شكاوى واستفسارات</div>
            </div>
          </button>
        </div>

        {/* الجراجات القريبة */}
        {nearbyGarages.length > 0 && (
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3 justify-end">
              <span
                className="font-black"
                style={{
                  background: '#00CC66',
                  color: '#fff',
                  fontSize: 10,
                  padding: '2px 8px',
                  borderRadius: 20,
                }}
              >
                {nearbyGarages.length}
              </span>
              <h2 className="text-xs font-black flex items-center gap-1.5" style={{ color: '#00AA44' }}>
                أماكن قريبة منك <Navigation size={14} />
              </h2>
            </div>
            <div className="space-y-3">
              {nearbyGarages.map((garage, i) => (
                <GarageCard
                  key={garage.id}
                  garage={garage}
                  index={i}
                  onSelect={() => handleDirectBooking(garage)}
                  isNearby
                  isClosest={i === 0}
                  hasActiveSession={Boolean(activeSession)}
                  hasIncomingCar={Boolean(myIncomingCar)}
                  disabled={isBooking}
                />
              ))}
            </div>
          </div>
        )}

        {/* خيارات أخرى */}
        {farGarages.length > 0 && !showNearbyOnly && (
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3 justify-end">
              <span
                className="font-black"
                style={{
                  background: '#FF8800',
                  color: '#fff',
                  fontSize: 10,
                  padding: '2px 8px',
                  borderRadius: 20,
                }}
              >
                {farGarages.length}
              </span>
              <h2 className="text-xs font-black flex items-center gap-1.5" style={{ color: '#CC6600' }}>
                خيارات إضافية <Clock size={14} />
              </h2>
            </div>
            <div className="space-y-3">
              {farGarages.map((garage, i) => (
                <GarageCard
                  key={garage.id}
                  garage={garage}
                  index={i}
                  onSelect={() => handleDirectBooking(garage)}
                  isNearby={false}
                  isClosest={nearbyGarages.length === 0 && i === 0}
                  hasActiveSession={Boolean(activeSession)}
                  hasIncomingCar={Boolean(myIncomingCar)}
                  disabled={isBooking}
                />
              ))}
            </div>
          </div>
        )}

        {/* حالة عدم وجود نتائج */}
        {filteredGarages.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🔍</div>
            <p className="text-sm font-black" style={{ color: '#64748b' }}>
              لا توجد جراجات مطابقة للبحث
            </p>
            <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>
              جرب تغيير كلمة البحث أو إلغاء تصفية القريب
            </p>
          </div>
        )}
      </div>

      {/* نافذة شحن الرصيد */}
      <AnimatePresence>
        {showTopUp && <TopUpWalletModal onClose={() => setShowTopUp(false)} />}
      </AnimatePresence>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ██  GARAGE CARD COMPONENT
   ════════════════════════════════════════════════════════════ */
interface GarageCardProps {
  garage: GarageWithDistance;
  index: number;
  onSelect: () => void;
  isNearby: boolean;
  isClosest?: boolean;
  hasActiveSession?: boolean;
  hasIncomingCar?: boolean;
  disabled?: boolean;
}

function GarageCard({
  garage,
  index,
  onSelect,
  isNearby,
  isClosest,
  hasActiveSession,
  hasIncomingCar,
  disabled,
}: GarageCardProps) {
  const isBusy = hasActiveSession || hasIncomingCar;
  const isFull = garage.availableSpots === 0;

  const borderColor = isClosest && !isBusy ? '#0066FF' : isNearby ? '#00CC66' : '#D0DCFF';
  const glowColor = isClosest && !isBusy
    ? 'rgba(0,102,255,0.12)'
    : isNearby
    ? 'rgba(0,204,102,0.08)'
    : 'none';

  const btnBg = (() => {
    if (isFull) return '#E2E8F0';
    if (hasActiveSession) return 'linear-gradient(135deg, #00CC66 0%, #00AA55 100%)';
    if (hasIncomingCar) return 'linear-gradient(135deg, #0099DD 0%, #0077BB 100%)';
    if (isClosest) return 'linear-gradient(135deg, #0066FF 0%, #0044DD 100%)';
    if (isNearby) return 'linear-gradient(135deg, #00CC66 0%, #00AA55 100%)';
    return 'linear-gradient(135deg, #0066FF 0%, #4D00FF 100%)';
  })();

  const btnLabel = (() => {
    if (isFull) return 'ممتلئ - لا توجد أماكن';
    if (hasActiveSession) return '⚡ الانتقال للجلسة النشطة';
    if (hasIncomingCar) return '📍 الانتقال للحجز النشط';
    if (isClosest) return '🅿️ احجز في الأقرب إليك';
    if (isNearby) return '🅿️ احجز الآن - قريب منك';
    return '🅿️ احجز مكانك';
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={!disabled && !isFull ? onSelect : undefined}
      className={`transition-all text-right ${
        !isFull && !disabled ? 'active:scale-[0.98] cursor-pointer' : 'cursor-not-allowed opacity-90'
      }`}
      style={{
        background: '#ffffff',
        border: `2px solid ${borderColor}`,
        borderRadius: 20,
        padding: '16px',
        boxShadow: `0 4px 18px ${glowColor}, 0 2px 6px rgba(0,0,0,0.03)`,
      }}
    >
      <div className="flex justify-between items-center mb-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div
            className="flex items-center gap-1 font-black"
            style={{
              background: '#FF9500',
              color: '#fff',
              fontSize: 11,
              padding: '3px 8px',
              borderRadius: 10,
            }}
          >
            <Star size={11} fill="currentColor" />
            {garage.rating}
          </div>

          {isFull && (
            <span
              className="font-black"
              style={{ background: '#FF3333', color: '#fff', fontSize: 10, padding: '3px 8px', borderRadius: 10 }}
            >
              ممتلئ
            </span>
          )}

          {!isBusy && isClosest && !isFull && (
            <span
              className="font-black"
              style={{ background: '#0066FF', color: '#fff', fontSize: 10, padding: '3px 8px', borderRadius: 10 }}
            >
              📍 الأقرب
            </span>
          )}

          {!isBusy && !isClosest && isNearby && !isFull && (
            <span
              className="font-black"
              style={{ background: '#00CC66', color: '#fff', fontSize: 10, padding: '3px 8px', borderRadius: 10 }}
            >
              قريب
            </span>
          )}
        </div>

        <h3 className="text-base font-black" style={{ color: '#0A1628' }}>
          {garage.name}
        </h3>
      </div>

      <div className="flex items-center gap-1 justify-end mb-3" style={{ color: '#7B8CA6', fontSize: 11 }}>
        <span>{garage.location}</span>
        <MapPin size={12} />
      </div>

      <div className="flex items-center justify-between gap-2 mb-3.5">
        <div
          className="flex items-center gap-1.5 font-black"
          style={{
            background: isNearby ? '#00CC66' : '#FF8800',
            color: '#fff',
            borderRadius: 14,
            padding: '8px 12px',
            fontSize: 13,
          }}
        >
          <Navigation size={14} />
          <span className="font-mono">{formatDuration(garage.minutes)}</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Car size={15} style={{ color: '#0066FF' }} />
            <span className="font-black font-mono text-sm" style={{ color: '#0066FF' }}>
              {garage.availableSpots}
            </span>
            <span className="text-[10px]" style={{ color: '#7B8CA6' }}>
              شاغر
            </span>
          </div>
          <div style={{ width: 1.5, height: 16, background: '#E2E8F0' }} />
          <div className="flex items-center gap-1">
            <span className="font-black font-mono text-sm" style={{ color: '#00AA44' }}>
              {garage.basePrice}
            </span>
            <span className="text-[10px] font-bold" style={{ color: '#7B8CA6' }}>
              ج.م/س
            </span>
          </div>
        </div>
      </div>

      <button
        disabled={isFull || disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!isFull && !disabled) onSelect();
        }}
        className="w-full font-black flex items-center justify-center gap-2 active:scale-95 transition-all"
        style={{
          background: btnBg,
          color: isFull ? '#94a3b8' : '#ffffff',
          borderRadius: 14,
          padding: '13px 0',
          fontSize: 13,
        }}
      >
        <Car size={16} />
        {btnLabel}
      </button>
    </motion.div>
  );
}