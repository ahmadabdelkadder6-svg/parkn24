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

/* ─── 🎨 لوحة الألوان الناعمة والراقية ─── */
const SOFT_THEME = {
  bgMain: '#F4F7FC',         // خلفية التطبيق - رمادي مزرق ناعم جداً مريح للعين
  bgCard: '#FFFFFF',         // خلفية البطاقات البيضاء النقية
  textDark: '#0F172A',       // نصوص أساسية - Slate داكن هادئ
  textMuted: '#64748B',      // نصوص ثانوية - Slate متوسط النعومة
  borderSoft: '#E2E8F0',     // حدود فائقة النعومة
  
  // تدرجات ناعمة مريحة للعين
  primaryGrad: 'linear-gradient(135deg, #3B82F6 0%, #4F46E5 100%)',   // تدرج المحفظة الناعم
  successGrad: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',   // تدرج النجاح الأخضر اللطيف
  accentGrad: 'linear-gradient(135deg, #FF9F43 0%, #FF5252 100%)',    // تدرج برتقالي ناعم دافئ لـ "الأقرب"
};

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
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶٧٨٩'.indexOf(d)))
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

  /* ✅ التحقق من وجود جلسة منتهية وتجاهلها إذا وجدنا جلسة نشطة قيد التشغيل حالياً */
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

  const hasCompletedSession = useMemo(() => {
    if (activeSession) return false;
    return sessions.some(
      (s: Session) =>
        normalizePlateForCompare(s.carPlate) === normalizedUserPlate &&
        s.status === 'completed'
    );
  }, [sessions, normalizedUserPlate, activeSession]);

  /* ✅ البحث عن حجز نشط قادم للسيارة */
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
      },
      () => {
        if (!isMountedRef.current) return;
        setLocationLoading(false);
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
     ██  انتقال تلقائي لشاشة الجلسة النشطة
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

      toast.success('تم تأمين مكانك بنجاح! جاهز للانطلاق؟ 🚀', { duration: 4000 });
      setScreen('navigation');
    } catch (e) {
      console.error(e);
      toast.error('حدث خطأ أثناء إتمام الحجز');
    } finally {
      setIsBooking(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden text-right" style={{ background: SOFT_THEME.bgMain, color: SOFT_THEME.textDark }}>
      {/* ══════ HEADER ══════ */}
      <div className="px-4 pt-11 pb-3 shadow-sm z-10" style={{ background: SOFT_THEME.bgCard, borderBottom: `1px solid ${SOFT_THEME.borderSoft}` }}>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-xl font-black" style={{ color: SOFT_THEME.textDark }}>
              أهلاً {currentUser?.name || 'بك'} 👋
            </h1>
            <p className="text-xs font-bold mt-0.5" style={{ color: SOFT_THEME.textMuted }}>
              ابحث عن أقرب مكان ركن لسيارتك
            </p>
          </div>
          <img
            src="/images/logo.png"
            alt="بركن"
            className="w-12 h-12 object-contain"
            style={{
              borderRadius: 16,
              boxShadow: '0 4px 16px rgba(59, 130, 246, 0.12)',
              border: `2px solid ${SOFT_THEME.borderSoft}`,
            }}
          />
        </div>

        {/* بطاقة المحفظة الانسيابية والناعمة للغاية */}
        <div
          style={{
            background: SOFT_THEME.primaryGrad,
            borderRadius: 24,
            padding: '20px 18px',
            marginBottom: 12,
            boxShadow: '0 8px 24px rgba(59, 130, 246, 0.22)',
            color: '#ffffff',
          }}
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-[10px] font-bold" style={{ opacity: 0.8 }}>
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
                  background: 'rgba(255,255,255,0.22)',
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

        {/* بانر الجلسة النشطة الأخضر اللطيف */}
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
              background: SOFT_THEME.successGrad,
              borderRadius: 20,
              padding: '14px 16px',
              color: '#ffffff',
              boxShadow: '0 8px 24px rgba(16, 185, 129, 0.22)',
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

        {/* شريط البحث والفلاتر */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute right-3.5 top-1/2 -translate-y-1/2"
              style={{ color: '#94A3B8' }}
            />
            <input
              className="w-full font-bold outline-none text-sm"
              style={{
                background: '#F1F5F9',
                border: `2px solid ${SOFT_THEME.borderSoft}`,
                padding: '12px 38px 12px 34px',
                borderRadius: 16,
                color: SOFT_THEME.textDark,
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
              background: locationLoading ? '#E2E8F0' : '#3B82F6',
              color: locationLoading ? '#94A3B8' : '#fff',
              borderRadius: 16,
              padding: '0 14px',
              boxShadow: locationLoading ? 'none' : '0 4px 14px rgba(59, 130, 246, 0.22)',
            }}
          >
            <Locate size={18} className={locationLoading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => setShowNearbyOnly(!showNearbyOnly)}
            className="font-black text-xs active:scale-90 transition-all whitespace-nowrap flex items-center gap-1"
            style={{
              background: showNearbyOnly ? '#3B82F6' : '#F1F5F9',
              color: showNearbyOnly ? '#fff' : '#64748B',
              borderRadius: 16,
              padding: '0 14px',
              border: showNearbyOnly ? 'none' : `2px solid ${SOFT_THEME.borderSoft}`,
              boxShadow: showNearbyOnly ? '0 4px 14px rgba(59, 130, 246, 0.22)' : 'none',
            }}
          >
            <Filter size={13} /> {showNearbyOnly ? 'الكل' : 'قريب'}
          </button>
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-8">
        <div className="grid grid-cols-2 gap-2 mb-4">
          {hasCompletedSession && (
            <button
              onClick={() => setScreen('lastSession')}
              className="flex items-center gap-2 active:scale-[0.97] transition-all text-right"
              style={{
                background: SOFT_THEME.bgCard,
                border: `1.5px solid ${SOFT_THEME.borderSoft}`,
                borderRadius: 16,
                padding: '10px 12px',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
              }}
            >
              <div style={{ background: '#3B82F6', borderRadius: 10, padding: 6, color: '#fff' }}>
                <Receipt size={14} />
              </div>
              <div className="flex-1">
                <div className="font-black text-xs" style={{ color: SOFT_THEME.textDark }}>
                  آخر جلسة
                </div>
                <div style={{ fontSize: 9, color: '#94A3B8' }}>عرض الإيصال</div>
              </div>
            </button>
          )}

          <button
            onClick={() => setScreen('chat')}
            className={`flex items-center gap-2 active:scale-[0.97] transition-all text-right ${
              !hasCompletedSession ? 'col-span-2' : ''
            }`}
            style={{
              background: SOFT_THEME.bgCard,
              border: `1.5px solid ${SOFT_THEME.borderSoft}`,
              borderRadius: 16,
              padding: '10px 12px',
              boxShadow: '0 2px 8px rgba(124, 58, 237, 0.03)',
            }}
          >
            <div style={{ background: '#7C3AED', borderRadius: 10, padding: 6, color: '#fff' }}>
              <MessageCircle size={14} />
            </div>
            <div className="flex-1">
              <div className="font-black text-xs" style={{ color: SOFT_THEME.textDark }}>
                تواصل معنا
              </div>
              <div style={{ fontSize: 9, color: '#94A3B8' }}>شكاوى واستفسارات</div>
            </div>
          </button>
        </div>

        {/* أماكن قريبة */}
        {nearbyGarages.length > 0 && (
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3 justify-end">
              <span className="font-black text-[10px] bg-[#10B981] text-white px-2.5 py-0.5 rounded-full">
                {nearbyGarages.length}
              </span>
              <h2 className="text-xs font-black flex items-center gap-1.5" style={{ color: '#059669' }}>
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

        {/* خيارات إضافية */}
        {farGarages.length > 0 && !showNearbyOnly && (
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3 justify-end">
              <span className="font-black text-[10px] bg-[#64748B] text-white px-2.5 py-0.5 rounded-full">
                {farGarages.length}
              </span>
              <h2 className="text-xs font-black flex items-center gap-1.5" style={{ color: '#475569' }}>
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
      </div>

      <AnimatePresence>
        {showTopUp && <TopUpWalletModal onClose={() => setShowTopUp(false)} />}
      </AnimatePresence>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ██  GARAGE CARD COMPONENT (تصميم فائق النعومة والجمال)
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

  // إطار انسيابي ناعم للجراج الأقرب أو الحالات النشطة
  const borderColor = isClosest && !isBusy 
    ? '#3B82F6' 
    : isNearby 
    ? '#10B981' 
    : SOFT_THEME.borderSoft;

  const glowColor = isClosest && !isBusy 
    ? 'rgba(59, 130, 246, 0.08)' 
    : isNearby 
    ? 'rgba(16, 185, 129, 0.05)' 
    : 'none';

  const btnBg = (() => {
    if (isFull) return '#E2E8F0';
    if (hasActiveSession) return SOFT_THEME.successGrad;
    if (hasIncomingCar) return 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)';
    if (isClosest) return SOFT_THEME.primaryGrad;
    if (isNearby) return SOFT_THEME.successGrad;
    return SOFT_THEME.primaryGrad;
  })();

  const btnLabel = (() => {
    if (isFull) return 'ممتلئ - لا توجد أماكن';
    if (hasActiveSession) return '⚡ الانتقال للجلسة النشطة';
    if (hasIncomingCar) return '📍 الانتقال للتوجيه والخرائط';
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
        background: SOFT_THEME.bgCard,
        border: `2px solid ${borderColor}`,
        borderRadius: 24, // زوايا دائرية فائقة النعومة
        padding: '18px 16px',
        boxShadow: `0 8px 24px ${glowColor}, 0 2px 8px rgba(15, 23, 42, 0.03)`,
      }}
    >
      <div className="flex justify-between items-center mb-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1 font-black bg-[#FF9F43] text-white text-[11px] px-2.5 py-0.5 rounded-lg">
            <Star size={11} fill="currentColor" />
            {garage.rating}
          </div>

          {isFull && <span className="font-black bg-[#FF5252] text-white text-[10px] px-2.5 py-0.5 rounded-lg">ممتلئ</span>}
          {!isBusy && isClosest && !isFull && <span className="font-black bg-[#3B82F6] text-white text-[10px] px-2.5 py-0.5 rounded-lg">📍 الأقرب</span>}
          {!isBusy && !isClosest && isNearby && !isFull && <span className="font-black bg-[#10B981] text-white text-[10px] px-2.5 py-0.5 rounded-lg">قريب</span>}
        </div>

        <h3 className="text-base font-black" style={{ color: SOFT_THEME.textDark }}>
          {garage.name}
        </h3>
      </div>

      <div className="flex items-center gap-1 justify-end mb-3" style={{ color: SOFT_THEME.textMuted, fontSize: 11 }}>
        <span>{garage.location}</span>
        <MapPin size={12} />
      </div>

      <div className="flex items-center justify-between gap-2 mb-3.5">
        <div 
          className="flex items-center gap-1.5 font-black text-white text-[13px] rounded-xl px-3 py-2" 
          style={{ background: isNearby ? '#10B981' : '#64748B' }}
        >
          <Navigation size={14} />
          <span className="font-mono">{formatDuration(garage.minutes)}</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Car size={15} style={{ color: '#3B82F6' }} />
            <span className="font-black font-mono text-sm" style={{ color: '#3B82F6' }}>{garage.availableSpots}</span>
            <span className="text-[10px]" style={{ color: SOFT_THEME.textMuted }}>شاغر</span>
          </div>
          <div style={{ width: 1.5, height: 16, background: SOFT_THEME.borderSoft }} />
          <div className="flex items-center gap-1">
            <span className="font-black font-mono text-sm" style={{ color: '#10B981' }}>{garage.basePrice}</span>
            <span className="text-[10px] font-bold" style={{ color: SOFT_THEME.textMuted }}>ج.م/س</span>
          </div>
        </div>
      </div>

      <button
        disabled={isFull || disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!isFull && !disabled) onSelect();
        }}
        className="w-full font-black flex items-center justify-center gap-2 active:scale-95 transition-all text-xs py-3.5 rounded-xl shadow-sm"
        style={{
          background: btnBg,
          color: isFull ? '#94A3B8' : '#ffffff',
          boxShadow: isFull ? 'none' : '0 4px 12px rgba(59, 130, 246, 0.15)',
        }}
      >
        <Car size={16} />
        {btnLabel}
      </button>
    </motion.div>
  );
}