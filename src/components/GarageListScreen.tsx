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

/* ─── 🎨 نظام الألوان الاحترافي المريح للعين ─── */
const THEME = {
  // خلفيات
  bgMain: '#F8FAFC',        // الخلفية الرئيسية - رمادي فاتح جداً
  bgCard: '#FFFFFF',        // البطاقات
  bgSubtle: '#F1F5F9',      // خلفيات فرعية
  bgInput: '#F1F5F9',       // خلفية حقول الإدخال
  
  // النصوص
  textPrimary: '#0F172A',   // العناوين الأساسية - Slate 900
  textSecondary: '#475569', // النصوص الثانوية - Slate 600
  textMuted: '#94A3B8',     // نصوص خفيفة - Slate 400
  
  // ألوان أساسية
  primary: '#1E40AF',       // Royal Blue - اللون الرئيسي
  primaryDark: '#1E3A8A',   // Blue 900
  primaryLight: '#DBEAFE',  // Blue 100
  
  // حالات نشطة
  success: '#0F766E',       // Teal 700 - نجاح
  successLight: '#CCFBF1',  // Teal 100
  
  // تحفيز/تنبيه
  warning: '#B45309',       // Amber 700
  warningLight: '#FEF3C7',  // Amber 100
  
  // خطر (لطيف)
  danger: '#B91C1C',        // Red 700
  dangerLight: '#FEE2E2',   // Red 100
  
  // حدود
  border: '#E2E8F0',        // Slate 200
  borderStrong: '#CBD5E1',  // Slate 300
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

  const normalizedUserPlate = useMemo(
    () => normalizePlateForCompare(currentUser?.carPlate),
    [currentUser?.carPlate]
  );

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

  useEffect(() => {
    if (!normalizedUserPlate) return;
    let isSubscribed = true;

    const refetch = async () => {
      if (!isSubscribed) return;
      try {
        await fetchAll();
      } catch (e) {
        console.error('❌', e);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' },
        (payload) => { if (isMyRow(payload.new) || isMyRow(payload.old)) refetch(); }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incoming_cars' },
        (payload) => { if (isMyRow(payload.new) || isMyRow(payload.old)) refetch(); }
      )
      .subscribe();

    const interval = setInterval(refetch, 7000);
    const handleVisibility = () => { if (document.visibilityState === 'visible') refetch(); };
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

  const garagesWithDistance: GarageWithDistance[] = useMemo(() => {
    return garages
      .map((garage) => {
        const distance = calculateDistance(
          userLocation.lat, userLocation.lng,
          garage.lat, garage.lng
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

  const handleDirectBooking = async (garage: GarageWithDistance) => {
    if (!currentUser) { toast.error('سجل بياناتك أولاً'); return; }
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
    <div className="h-full flex flex-col overflow-hidden" style={{ background: THEME.bgMain, color: THEME.textPrimary }}>
      {/* ══════ HEADER ══════ */}
      <div className="px-4 pt-10 pb-3 z-10" style={{ background: THEME.bgCard, borderBottom: `1px solid ${THEME.border}` }}>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-xl font-black" style={{ color: THEME.textPrimary }}>
              أهلاً {currentUser?.name || 'بك'} 👋
            </h1>
            <p className="text-xs font-bold mt-0.5" style={{ color: THEME.textSecondary }}>
              ابحث عن أقرب مكان ركن لسيارتك
            </p>
          </div>
          <img
            src="/images/logo.png"
            alt="بركن"
            className="w-12 h-12 object-contain"
            style={{
              borderRadius: 14,
              boxShadow: '0 2px 12px rgba(30, 64, 175, 0.12)',
              border: `2px solid ${THEME.primaryLight}`,
            }}
          />
        </div>

        {/* 💳 بطاقة المحفظة - أزرق ملكي راقٍ ومريح */}
        <div
          style={{
            background: `linear-gradient(135deg, ${THEME.primary} 0%, ${THEME.primaryDark} 100%)`,
            borderRadius: 20,
            padding: '18px 18px',
            marginBottom: 12,
            boxShadow: '0 6px 20px rgba(30, 64, 175, 0.25)',
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
                  background: 'rgba(255,255,255,0.22)',
                  backdropFilter: 'blur(10px)',
                  borderRadius: 12,
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
                borderRadius: 12,
                padding: '8px 12px',
                fontSize: 12,
              }}
            >
              🚗 {currentUser?.carPlate || '---'}
            </div>
          </div>
        </div>

        {/* 🟢 بانر الجلسة النشطة - Teal مريح للعين */}
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
              background: `linear-gradient(135deg, ${THEME.success} 0%, #115E59 100%)`,
              borderRadius: 18,
              padding: '14px 16px',
              color: '#ffffff',
              boxShadow: '0 6px 18px rgba(15, 118, 110, 0.25)',
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

        {/* 🟠 بانر الخريطة والتوجيه - كهرماني دافئ مريح */}
        {!activeSession && myIncomingCar && (
          <motion.button
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setSelectedGarageId(myIncomingCar.garageId);
              setScreen('navigation');
            }}
            className="w-full mb-4 flex flex-col gap-2 text-right relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${THEME.warning} 0%, #92400E 100%)`,
              borderRadius: 20,
              padding: '16px 18px',
              color: '#ffffff',
              boxShadow: '0 8px 22px rgba(180, 83, 9, 0.28)',
            }}
          >
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 relative">
                <Navigation size={22} className="animate-bounce" />
                <span className="absolute inline-flex h-full w-full rounded-full bg-white/30 animate-ping opacity-70" />
              </span>
            </div>

            <div className="pl-12">
              <div className="text-sm font-black flex items-center gap-1.5 justify-end">
                🚀 اضغط هنا لتشغيل الخريطة فوراً!
              </div>
              <p className="text-[11px] font-bold mt-1 leading-relaxed opacity-95">
                ابدأ التوجيه الآن لتفادي الازدحام وتأمين مكانك المخصص قبل الإلغاء 🗺️
              </p>
              <div className="mt-2 inline-flex items-center gap-1 text-[9px] font-black bg-white/25 px-2.5 py-1 rounded-full">
                ⏱️ يوفر عليك 7 دقائق بحثاً عن ركنة
              </div>
            </div>
          </motion.button>
        )}

        {/* 🔍 شريط البحث والفلاتر */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute right-3.5 top-1/2 -translate-y-1/2"
              style={{ color: THEME.textMuted }}
            />
            <input
              className="w-full font-bold outline-none text-sm"
              style={{
                background: THEME.bgInput,
                border: `2px solid ${THEME.border}`,
                padding: '12px 38px 12px 34px',
                borderRadius: 14,
                color: THEME.textPrimary,
              }}
              placeholder="ابحث عن جراج..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 hover:opacity-70"
                style={{ color: THEME.textMuted }}
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
              background: locationLoading ? THEME.bgSubtle : THEME.primary,
              color: locationLoading ? THEME.textMuted : '#fff',
              borderRadius: 14,
              padding: '0 14px',
              boxShadow: locationLoading ? 'none' : '0 3px 10px rgba(30, 64, 175, 0.22)',
            }}
          >
            <Locate size={18} className={locationLoading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => setShowNearbyOnly(!showNearbyOnly)}
            className="font-black text-xs active:scale-90 transition-all whitespace-nowrap flex items-center gap-1"
            style={{
              background: showNearbyOnly ? THEME.primary : THEME.bgSubtle,
              color: showNearbyOnly ? '#fff' : THEME.textSecondary,
              borderRadius: 14,
              padding: '0 14px',
              border: showNearbyOnly ? 'none' : `2px solid ${THEME.border}`,
              boxShadow: showNearbyOnly ? '0 3px 10px rgba(30, 64, 175, 0.22)' : 'none',
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
                background: THEME.bgCard,
                border: `1.5px solid ${THEME.border}`,
                borderRadius: 14,
                padding: '10px 12px',
                boxShadow: '0 1px 4px rgba(15, 23, 42, 0.04)',
              }}
            >
              <div style={{ background: THEME.primary, borderRadius: 10, padding: 6, color: '#fff' }}>
                <Receipt size={14} />
              </div>
              <div className="flex-1">
                <div className="font-black text-xs" style={{ color: THEME.textPrimary }}>
                  آخر جلسة
                </div>
                <div style={{ fontSize: 9, color: THEME.textMuted }}>عرض الإيصال</div>
              </div>
            </button>
          )}

          <button
            onClick={() => setScreen('chat')}
            className={`flex items-center gap-2 active:scale-[0.97] transition-all text-right ${
              !hasCompletedSession ? 'col-span-2' : ''
            }`}
            style={{
              background: THEME.bgCard,
              border: `1.5px solid ${THEME.border}`,
              borderRadius: 14,
              padding: '10px 12px',
              boxShadow: '0 1px 4px rgba(15, 23, 42, 0.04)',
            }}
          >
            <div style={{ background: THEME.success, borderRadius: 10, padding: 6, color: '#fff' }}>
              <MessageCircle size={14} />
            </div>
            <div className="flex-1">
              <div className="font-black text-xs" style={{ color: THEME.textPrimary }}>
                تواصل معنا
              </div>
              <div style={{ fontSize: 9, color: THEME.textMuted }}>شكاوى واستفسارات</div>
            </div>
          </button>
        </div>

        {nearbyGarages.length > 0 && (
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3 justify-end">
              <span
                className="font-black text-[10px] text-white px-2 py-0.5 rounded-full"
                style={{ background: THEME.success }}
              >
                {nearbyGarages.length}
              </span>
              <h2 className="text-xs font-black flex items-center gap-1.5" style={{ color: THEME.success }}>
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

        {farGarages.length > 0 && !showNearbyOnly && (
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3 justify-end">
              <span
                className="font-black text-[10px] text-white px-2 py-0.5 rounded-full"
                style={{ background: THEME.warning }}
              >
                {farGarages.length}
              </span>
              <h2 className="text-xs font-black flex items-center gap-1.5" style={{ color: THEME.warning }}>
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
   ██  GARAGE CARD COMPONENT (بألوان احترافية مريحة)
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

  const borderColor = isClosest && !isBusy 
    ? THEME.primary 
    : isNearby 
    ? THEME.success 
    : THEME.border;

  const btnBg = (() => {
    if (isFull) return THEME.bgSubtle;
    if (hasActiveSession) return `linear-gradient(135deg, ${THEME.success} 0%, #115E59 100%)`;
    if (hasIncomingCar) return `linear-gradient(135deg, ${THEME.warning} 0%, #92400E 100%)`;
    if (isClosest) return `linear-gradient(135deg, ${THEME.primary} 0%, ${THEME.primaryDark} 100%)`;
    if (isNearby) return `linear-gradient(135deg, ${THEME.success} 0%, #115E59 100%)`;
    return `linear-gradient(135deg, ${THEME.primary} 0%, ${THEME.primaryDark} 100%)`;
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
        background: THEME.bgCard,
        border: `2px solid ${borderColor}`,
        borderRadius: 18,
        padding: '16px',
        boxShadow: '0 2px 10px rgba(15, 23, 42, 0.05)',
      }}
    >
      <div className="flex justify-between items-center mb-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div
            className="flex items-center gap-1 font-black text-white text-[11px] px-2 py-0.5 rounded-lg"
            style={{ background: THEME.warning }}
          >
            <Star size={11} fill="currentColor" />
            {garage.rating}
          </div>

          {isFull && (
            <span
              className="font-black text-white text-[10px] px-2 py-0.5 rounded-lg"
              style={{ background: THEME.danger }}
            >
              ممتلئ
            </span>
          )}
          {!isBusy && isClosest && !isFull && (
            <span
              className="font-black text-white text-[10px] px-2 py-0.5 rounded-lg"
              style={{ background: THEME.primary }}
            >
              📍 الأقرب
            </span>
          )}
          {!isBusy && !isClosest && isNearby && !isFull && (
            <span
              className="font-black text-white text-[10px] px-2 py-0.5 rounded-lg"
              style={{ background: THEME.success }}
            >
              قريب
            </span>
          )}
        </div>

        <h3 className="text-base font-black" style={{ color: THEME.textPrimary }}>
          {garage.name}
        </h3>
      </div>

      <div className="flex items-center gap-1 justify-end mb-3" style={{ color: THEME.textSecondary, fontSize: 11 }}>
        <span>{garage.location}</span>
        <MapPin size={12} />
      </div>

      <div className="flex items-center justify-between gap-2 mb-3.5">
        <div
          className="flex items-center gap-1.5 font-black text-white text-[13px] rounded-lg px-3 py-2"
          style={{ background: isNearby ? THEME.success : THEME.warning }}
        >
          <Navigation size={14} />
          <span className="font-mono">{formatDuration(garage.minutes)}</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Car size={15} style={{ color: THEME.primary }} />
            <span className="font-black font-mono text-sm" style={{ color: THEME.primary }}>
              {garage.availableSpots}
            </span>
            <span className="text-[10px]" style={{ color: THEME.textSecondary }}>شاغر</span>
          </div>
          <div style={{ width: 1.5, height: 16, background: THEME.border }} />
          <div className="flex items-center gap-1">
            <span className="font-black font-mono text-sm" style={{ color: THEME.success }}>
              {garage.basePrice}
            </span>
            <span className="text-[10px] font-bold" style={{ color: THEME.textSecondary }}>ج.م/س</span>
          </div>
        </div>
      </div>

      <button
        disabled={isFull || disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!isFull && !disabled) onSelect();
        }}
        className="w-full font-black flex items-center justify-center gap-2 active:scale-95 transition-all text-xs py-3.5 rounded-xl"
        style={{
          background: btnBg,
          color: isFull ? THEME.textMuted : '#ffffff',
          boxShadow: isFull ? 'none' : '0 3px 10px rgba(30, 64, 175, 0.18)',
        }}
      >
        <Car size={16} />
        {btnLabel}
      </button>
    </motion.div>
  );
}