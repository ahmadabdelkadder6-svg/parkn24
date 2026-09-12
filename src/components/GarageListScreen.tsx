import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin,
  Star,
  Car,
  Search,
  Navigation,
  Locate,
  Filter,
  Plus,
  Receipt,
  MessageCircle,
  Zap,
  X,
  History,
  CheckCircle2,
  XCircle,
  Gift,
  Sparkles,
  ChevronDown,
  Wallet,
  Shield,
} from 'lucide-react';
import { useStore, Garage, ParkingSession as Session, IncomingCar, normalizePlate, normalizePhone } from '../store';
import {
  calculateDistance,
  distanceToMinutes,
  classifyDistance,
  formatDuration,
} from '../utils/distance';
import TopUpWalletModal from './TopUpWalletModal';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';

interface GarageWithDistance extends Garage {
  distance: number;
  minutes: number;
  classification: 'nearby' | 'far';
}

interface GarageCardProps {
  garage: GarageWithDistance;
  index: number;
  onSelect: () => void;
  isNearby: boolean;
  isClosest: boolean;
  hasActiveSession: boolean;
  hasIncomingCar: boolean;
  disabled: boolean;
}

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
   🎨 نظام الألوان الرسمي - مستوحى من شعار Park'n 24
   ════════════════════════════════════════════════════════════ */
const BRAND = {
  // الألوان الأساسية للشعار
  primary: '#1E3A8A',      // أزرق ملكي عميق (Deep Royal Blue)
  primaryLight: '#3B5FCF', // أزرق فاتح
  secondary: '#6D28D9',    // بنفسجي ملكي
  secondaryLight: '#8B5CF6', // بنفسجي فاتح
  accent: '#F59E0B',       // ذهبي (للتميز)
  
  // خلفيات
  bg: '#F8FAFF',           // خلفية عامة (أبيض مزرق ناعم)
  bgSoft: '#EEF2FF',       // خلفية ثانوية
  card: '#FFFFFF',         // بطاقات
  
  // نصوص
  text: '#1E1B4B',         // نص أساسي (بنفسجي داكن جداً)
  textSoft: '#6366F1',     // نص ثانوي
  textMuted: '#94A3B8',    // نص خافت
  
  // حدود
  border: '#E0E7FF',       // حدود فاتحة
  borderSoft: '#EEF2FF',
  
  // Gradient الأساسي (من الشعار)
  gradient: 'linear-gradient(135deg, #1E3A8A 0%, #6D28D9 100%)',
  gradientSoft: 'linear-gradient(135deg, #3B5FCF 0%, #8B5CF6 100%)',
  gradientLight: 'linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 100%)',
};

// 🗺️ ألوان المناطق - متناسقة مع هوية الشعار
const AREA_THEMES: Record<string, { icon: string; solid: string; light: string; border: string; }> = {
  'وسط البلد':      { icon: '🏢', solid: '#1E3A8A', light: '#EEF2FF', border: '#C7D2FE' },
  'مصر الجديدة':    { icon: '🏰', solid: '#6D28D9', light: '#F5F3FF', border: '#DDD6FE' },
  'مدينة نصر':     { icon: '🏙️', solid: '#7C3AED', light: '#FAF5FF', border: '#E9D5FF' },
  'المعادي':       { icon: '🌳', solid: '#4F46E5', light: '#EEF2FF', border: '#C7D2FE' },
  'المهندسين':     { icon: '🛍️', solid: '#5B21B6', light: '#F5F3FF', border: '#DDD6FE' },
  'الدقي':         { icon: '🎓', solid: '#3730A3', light: '#EEF2FF', border: '#C7D2FE' },
  'التجمع الخامس': { icon: '💎', solid: '#8B5CF6', light: '#FAF5FF', border: '#E9D5FF' },
  'مناطق أخرى':    { icon: '📍', solid: '#6366F1', light: '#EEF2FF', border: '#C7D2FE' },
};

const getAreaTheme = (name: string) => AREA_THEMES[name] || AREA_THEMES['مناطق أخرى'];

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
    acknowledgedSessionIds,
    walletTopUps,
  } = useStore();

  const [search, setSearch] = useState('');
  const [showNearbyOnly, setShowNearbyOnly] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>({
    lat: 30.0444,
    lng: 31.2357,
  });
  const [locationLoading, setLocationLoading] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [isAbuseDetected, setIsAbuseDetected] = useState(false);
  const [expandedArea, setExpandedArea] = useState<string | null>(null);

  const autoNavigatedRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const normalizedUserPlate = useMemo(
    () => normalizePlate(currentUser?.carPlate),
    [currentUser?.carPlate]
  );

  const cleanUserPhone = useMemo(
    () => currentUser?.phone ? normalizePhone(currentUser.phone) : '',
    [currentUser?.phone]
  );

  useEffect(() => {
    if (!currentUser) return;
    
    const checkAbuseHistory = async () => {
      try {
        const cleanPlate = normalizePlate(currentUser.carPlate);
        if (!cleanPlate && !cleanUserPhone) return;

        if (currentUser.hasUsedFreeSession) {
          setIsAbuseDetected(true);
          return;
        }

        if (cleanUserPhone) {
          const { data: userDb } = await supabase
            .from('users')
            .select('has_used_free_session')
            .eq('phone', cleanUserPhone)
            .maybeSingle();

          if (userDb?.has_used_free_session === true) {
            setIsAbuseDetected(true);
            return;
          }
        }

        const { data: sessionDb } = await supabase
          .from('sessions')
          .select('id')
          .eq('is_first_free_session', true)
          .or(`car_plate.eq.${cleanPlate}${cleanUserPhone ? `,customer_phone.eq.${cleanUserPhone}` : ''}`)
          .limit(1);

        if (sessionDb && sessionDb.length > 0) {
          setIsAbuseDetected(true);
        } else {
          setIsAbuseDetected(false);
        }
      } catch (err) {
        console.error('Error verifying welcome gift eligibility:', err);
      }
    };

    checkAbuseHistory();
  }, [currentUser, sessions, cleanUserPhone]);

  const isEligibleForFreeSession = useMemo(() => {
    return currentUser && !currentUser.hasUsedFreeSession && !isAbuseDetected;
  }, [currentUser, isAbuseDetected]);

  const activeSession = useMemo(() => {
    if (!normalizedUserPlate && !cleanUserPhone) return undefined;

    return sessions
      .filter((s: Session & { customerPhone?: string }) => {
        if (s.status !== 'active') return false;
        if (acknowledgedSessionIds?.has(s.id)) return false;
        const samePlate = normalizePlate(s.carPlate) === normalizedUserPlate;
        const sPhoneClean = s.customerPhone ? normalizePhone(s.customerPhone) : '';
        const samePhone = Boolean(cleanUserPhone && sPhoneClean === cleanUserPhone);
        return samePlate || samePhone;
      })
      .sort((a, b) => safeParseTime(b.startTime) - safeParseTime(a.startTime))[0];
  }, [sessions, normalizedUserPlate, cleanUserPhone, acknowledgedSessionIds]);

  const hasCompletedSession = useMemo(() => {
    if (activeSession) return false;
    return sessions.some(
      (s: Session) =>
        normalizePlate(s.carPlate) === normalizedUserPlate &&
        s.status === 'completed'
    );
  }, [sessions, normalizedUserPlate, activeSession]);

  const myIncomingCar = useMemo(() => {
    if (!normalizedUserPlate) return undefined;
    return incomingCars
      .filter(
        (c: IncomingCar) =>
          normalizePlate(c.carPlate) === normalizedUserPlate &&
          c.status === 'coming'
      )
      .sort((a, b) => safeParseTime(b.startTime || 0) - safeParseTime(a.startTime || 0))[0];
  }, [incomingCars, normalizedUserPlate]);

  const myTopUps = useMemo(() => {
    if (!cleanUserPhone || !walletTopUps) return [];
    return walletTopUps
      .filter((w) => w.userPhone === cleanUserPhone)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 3); 
  }, [walletTopUps, cleanUserPhone]);

  const pendingTopUpsCount = useMemo(() => {
    return myTopUps.filter((w) => w.status === 'pending').length;
  }, [myTopUps]);

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
        toast.success('تم تحديد موقعك بنجاح 📍');
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

  useEffect(() => {
    if (!normalizedUserPlate) return;

    let isSubscribed = true;

    const refetch = async () => {
      if (!isSubscribed) return;
      try {
        await fetchAll();
      } catch (e) {
        console.error('Realtime Fetch Error:', e);
      }
    };

    const isMyRow = (row: any): boolean => {
      if (!row) return false;
      const plate = normalizePlate(row.car_plate || row.carPlate);
      const phone = (row.customer_phone || row.customerPhone || '').replace(/[^\d+]/g, '');
      return (
        plate === normalizedUserPlate ||
        Boolean(cleanUserPhone && phone === cleanUserPhone)
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
      .subscribe();

    const interval = setInterval(refetch, 10000); 

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
  }, [normalizedUserPlate, cleanUserPhone, fetchAll]);

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
      .filter((g) => g.isActive !== false) 
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
        (g) => g.name.toLowerCase().includes(q) || g.location.toLowerCase().includes(q) || (g.area || '').toLowerCase().includes(q)
      );
    }
    if (showNearbyOnly) {
      filtered = filtered.filter((g) => g.classification === 'nearby');
    }
    return filtered;
  }, [garagesWithDistance, search, showNearbyOnly]);

  const areaGroups = useMemo(() => {
    const groups: Record<string, GarageWithDistance[]> = {};
    
    filteredGarages.forEach(g => {
      const zone = (g as any).area || 'مناطق أخرى';
      if (!groups[zone]) groups[zone] = [];
      groups[zone].push(g);
    });

    return Object.keys(groups).map(name => ({
      name,
      theme: getAreaTheme(name),
      garages: groups[name],
      totalCapacity: groups[name].reduce((sum, g) => sum + (g.capacity || 0), 0),
    })).sort((a, b) => {
      if (a.name === 'مناطق أخرى') return 1;
      if (b.name === 'مناطق أخرى') return -1;
      return a.name.localeCompare(b.name, 'ar');
    });
  }, [filteredGarages]);

  useEffect(() => {
    if (search.trim() && areaGroups.length > 0) {
      setExpandedArea(areaGroups[0].name);
    }
  }, [search, areaGroups]);

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

    const userWallet = currentUser.wallet || 0;
    if (garage.payment_mode === 'wallet' && userWallet <= 0 && !isEligibleForFreeSession) {
      toast.error('عذراً، هذا الجراج يقبل الدفع بالمحفظة فقط. يرجى شحن محفظتك للمتابعة.');
      setShowTopUp(true); 
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

  const walletBalance = currentUser?.wallet || 0;
  const isLowBalance = walletBalance < 30;

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: BRAND.bg, color: BRAND.text }}>
      
      {/* ═══════════════════════════════════════════════
          🎨 HEADER — بألوان الشعار (Brand Gradient)
          ═══════════════════════════════════════════════ */}
      <div 
        className="relative z-10"
        style={{ 
          background: BRAND.gradient,
          paddingTop: 44,
          paddingBottom: 22,
          borderBottomLeftRadius: 26,
          borderBottomRightRadius: 26,
          boxShadow: '0 6px 20px rgba(30, 58, 138, 0.2)',
        }}
      >
        {/* عناصر زخرفية خفيفة */}
        <div style={{ 
          position: 'absolute', 
          top: -40, 
          right: -40, 
          width: 160, 
          height: 160, 
          background: 'radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%)',
          borderRadius: '50%',
        }} />
        <div style={{ 
          position: 'absolute', 
          bottom: -30, 
          left: -30, 
          width: 120, 
          height: 120, 
          background: 'radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%)',
          borderRadius: '50%',
        }} />

        {/* شريط علوي: اللوجو + الاسم */}
        <div className="flex justify-between items-center px-5 mb-5 relative z-10">
          <div className="flex-1">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-1 h-1 rounded-full" style={{ background: BRAND.accent }} />
              <span className="text-[9.5px] font-black" style={{ color: 'rgba(255,255,255,0.7)', letterSpacing: 1.5 }}>
                WELCOME BACK
              </span>
            </div>
            <h1 className="text-lg font-black text-white leading-tight">
              {currentUser?.name || 'مرحباً بك'} 👋
            </h1>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScreen('chat')}
              className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"
              style={{ 
                background: 'rgba(255,255,255,0.15)', 
                border: '1px solid rgba(255,255,255,0.2)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <MessageCircle size={17} className="text-white" />
            </button>
            <div
              className="w-11 h-11 flex items-center justify-center overflow-hidden"
              style={{
                borderRadius: 14,
                background: '#fff',
                padding: 3,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}
            >
              <img
                src="/images/logo.png"
                alt="بركن"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>

        {/* ═══ بطاقة المحفظة الاحترافية ═══ */}
        <div className="px-5 relative z-10">
          <div
            style={{
              background: BRAND.card,
              borderRadius: 22,
              padding: '18px 20px',
              boxShadow: '0 10px 30px rgba(30, 58, 138, 0.15), 0 2px 6px rgba(0,0,0,0.04)',
              position: 'relative',
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.5)',
            }}
          >
            {/* عنصر تصميمي خلفي */}
            <div style={{ 
              position: 'absolute', 
              top: -30, 
              right: -30, 
              width: 100, 
              height: 100, 
              background: `radial-gradient(circle, ${BRAND.secondary}08 0%, transparent 70%)`, 
              borderRadius: '50%',
            }} />
            
            {/* رأس البطاقة */}
            <div className="flex justify-between items-start mb-4 relative z-10">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Wallet size={11} style={{ color: BRAND.textSoft }} />
                  <span className="text-[9px] font-black" style={{ color: BRAND.textSoft, letterSpacing: 1.5 }}>
                    رصيد المحفظة
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span 
                    className="font-black font-mono" 
                    style={{ 
                      fontSize: 28, 
                      background: BRAND.gradient,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      lineHeight: 1,
                    }}
                  >
                    {walletBalance.toLocaleString()}
                  </span>
                  <span className="text-xs font-black" style={{ color: BRAND.textSoft }}>ج.م</span>
                </div>
              </div>

              {/* لوحة السيارة */}
              <div style={{ 
                background: '#ffffff', 
                border: '2px solid ' + BRAND.text, 
                borderRadius: 8, 
                boxShadow: '0 3px 8px rgba(30, 27, 75, 0.2)', 
                overflow: 'hidden', 
                minWidth: 92,
              }}>
                <div style={{ 
                  height: 6, 
                  background: BRAND.gradient,
                }} />
                <div className="py-1 px-2 text-center font-black font-mono flex items-center justify-center gap-1" style={{ color: BRAND.text, fontSize: 11 }}>
                  <span>🇪🇬</span>
                  <span>{currentUser?.carPlate || '---'}</span>
                </div>
              </div>
            </div>

            {/* أزرار العمليات */}
            <div className="flex gap-2 relative z-10">
              <button
                onClick={() => setShowTopUp(true)}
                className="flex-1 flex items-center justify-center gap-1.5 font-black active:scale-[0.98] transition-all"
                style={{ 
                  background: BRAND.gradient,
                  color: '#fff', 
                  borderRadius: 13, 
                  padding: '11px 0', 
                  fontSize: 12,
                  boxShadow: `0 6px 16px ${BRAND.primary}40`,
                }}
              >
                <Plus size={14} strokeWidth={3} />
                <span>شحن المحفظة</span>
              </button>

              {myTopUps.length > 0 && (
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="flex items-center justify-center px-3.5 active:scale-95 transition-all relative"
                  style={{ 
                    background: showHistory ? BRAND.text : BRAND.bgSoft, 
                    color: showHistory ? '#fff' : BRAND.text, 
                    borderRadius: 13,
                    border: '1.5px solid ' + (showHistory ? BRAND.text : BRAND.border),
                  }}
                  title="سجل العمليات"
                >
                  <History size={16} />
                  {pendingTopUpsCount > 0 && (
                    <span 
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full font-black text-[8px] flex items-center justify-center border-2 border-white"
                      style={{ background: BRAND.accent, color: BRAND.text }}
                    >
                      {pendingTopUpsCount}
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* شريط الحالة السفلي */}
            <div className="mt-3.5 pt-3 border-t flex items-center justify-between gap-2" style={{ borderColor: BRAND.borderSoft }}>
              {isLowBalance ? (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <div 
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" 
                    style={{ background: `${BRAND.accent}20` }}
                  >
                    <Zap size={11} style={{ color: BRAND.accent }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-[10.5px] truncate" style={{ color: BRAND.accent }}>
                      اشحن الآن ووفر وقتك
                    </div>
                    <div className="font-bold text-[9px] truncate" style={{ color: BRAND.textMuted }}>
                      خروج فوري بدون فكة ⚡
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <div 
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" 
                    style={{ background: `${BRAND.primary}15` }}
                  >
                    <Shield size={11} style={{ color: BRAND.primary }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-[10.5px] truncate" style={{ color: BRAND.primary }}>
                      رصيدك آمن ومحمي
                    </div>
                    <div className="font-bold text-[9px] truncate" style={{ color: BRAND.textMuted }}>
                      جاهز للخروج الفوري
                    </div>
                  </div>
                </div>
              )}

              <div 
                className="flex items-center gap-1 px-2 py-1 rounded-lg shrink-0" 
                style={{ background: BRAND.gradientLight }}
              >
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: BRAND.primary }} />
                <span className="text-[9px] font-black" style={{ color: BRAND.primary }}>نشط</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          📜 CONTENT
          ═══════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-8">
          
          {/* سجل شحن المحفظة */}
          <AnimatePresence>
            {showHistory && myTopUps.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, height: 0, marginBottom: 0 }} 
                animate={{ opacity: 1, height: 'auto', marginBottom: 12 }} 
                exit={{ opacity: 0, height: 0, marginBottom: 0 }} 
                className="overflow-hidden" 
                style={{ 
                  background: BRAND.card, 
                  border: '1.5px solid ' + BRAND.border, 
                  borderRadius: 18, 
                  padding: 14,
                  boxShadow: '0 4px 12px rgba(30, 58, 138, 0.05)',
                }}
              >
                <div className="flex justify-between items-center mb-2.5 pb-2 border-b" style={{ borderColor: BRAND.borderSoft }}>
                  <button onClick={() => setShowHistory(false)} style={{ color: BRAND.textMuted }}>
                    <X size={16} />
                  </button>
                  <h3 className="font-black text-xs flex items-center gap-1.5" style={{ color: BRAND.text }}>
                    سجل الشحن الأخير <History size={13} style={{ color: BRAND.primary }} />
                  </h3>
                </div>
                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                  {myTopUps.map((topUp) => {
                    const isPending = topUp.status === 'pending';
                    const isApproved = topUp.status === 'approved';
                    return (
                      <div 
                        key={topUp.id} 
                        className="flex justify-between items-center p-2.5 rounded-xl" 
                        style={{ 
                          background: isPending ? '#FFFBEB' : isApproved ? BRAND.bgSoft : BRAND.bg, 
                          border: '1px solid ' + (isPending ? '#FDE68A' : isApproved ? BRAND.border : BRAND.borderSoft),
                        }}
                      >
                        <div className="text-left">
                          <div 
                            className="font-black font-mono text-sm" 
                            style={{ color: isApproved ? BRAND.primary : isPending ? '#D97706' : BRAND.textMuted }}
                          >
                            {topUp.amount} ج.م
                          </div>
                          <div className="text-[9px] font-mono mt-0.5" style={{ color: BRAND.textMuted }}>
                            #{topUp.transactionId || topUp.id.substring(0, 8).toUpperCase()}
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-2">
                          <div>
                            <div className="font-black text-[10px]" style={{ color: BRAND.text }}>
                              {topUp.method === 'instapay' ? '📱 إنستاباي' : '📲 محفظة كاش'}
                            </div>
                            <div className="text-[9px] font-bold mt-0.5" style={{ color: BRAND.textMuted }}>
                              {new Date(topUp.timestamp).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          <div className="shrink-0">
                            {isPending ? (
                              <span className="font-black text-[9px] px-2 py-1 rounded-lg bg-amber-100 text-amber-800">⏳ معلق</span>
                            ) : isApproved ? (
                              <span 
                                className="font-black text-[9px] px-2 py-1 rounded-lg flex items-center gap-0.5"
                                style={{ background: BRAND.bgSoft, color: BRAND.primary }}
                              >
                                <CheckCircle2 size={10} /> تم
                              </span>
                            ) : (
                              <span className="font-black text-[9px] px-2 py-1 rounded-lg bg-rose-100 text-rose-800 flex items-center gap-0.5">
                                <XCircle size={10} /> مرفوض
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 🎁 بانر ترحيبي */}
          {isEligibleForFreeSession && !activeSession && !myIncomingCar && (
            <motion.div 
              initial={{ opacity: 0, y: -15 }} 
              animate={{ opacity: 1, y: 0 }} 
              className="w-full mb-3 overflow-hidden relative" 
              style={{ 
                background: `linear-gradient(135deg, ${BRAND.accent}15 0%, ${BRAND.secondary}10 100%)`,
                borderRadius: 18, 
                padding: 14, 
                border: `1.5px solid ${BRAND.accent}40`,
              }}
            >
              <div className="absolute -top-8 -right-8 w-20 h-20 rounded-full filter blur-xl" style={{ background: `${BRAND.accent}30` }} />
              <div className="flex items-center gap-3 relative z-10">
                <motion.div 
                  animate={{ rotate: [0, -5, 5, 0] }} 
                  transition={{ repeat: Infinity, duration: 3 }} 
                  className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" 
                  style={{ 
                    background: `linear-gradient(135deg, ${BRAND.accent} 0%, ${BRAND.secondary} 100%)`,
                    boxShadow: `0 6px 14px ${BRAND.accent}40`,
                  }}
                >
                  <Gift size={20} className="text-white" />
                </motion.div>
                <div className="flex-1 text-right">
                  <div className="flex items-center gap-1.5 justify-end mb-0.5">
                    <span 
                      className="font-black text-[8px] px-2 py-0.5 rounded-full text-white"
                      style={{ background: BRAND.accent }}
                    >
                      🎁 هدية ترحيبية
                    </span>
                  </div>
                  <h4 className="font-black leading-tight text-[13px]" style={{ color: BRAND.text }}>
                    أول ركنة <span style={{ color: BRAND.accent }}>مجانية بالكامل!</span>
                  </h4>
                  <p className="font-bold text-[10px] mt-0.5" style={{ color: BRAND.textSoft }}>
                    استمتع بـ <span className="font-black" style={{ color: BRAND.primary }}>30 دقيقة مجانية</span>
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* بطاقة الجلسة النشطة */}
          {activeSession && (
            <motion.button 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }} 
              onClick={() => { setSelectedGarageId(activeSession.garageId); setScreen('session'); }} 
              className="w-full mb-3 flex items-center justify-between active:scale-[0.98] transition-all text-right relative overflow-hidden" 
              style={{ 
                background: BRAND.gradient,
                borderRadius: 18, 
                padding: '13px 16px', 
                color: '#fff', 
                boxShadow: `0 8px 20px ${BRAND.primary}40`,
              }}
            >
              <div className="absolute -top-10 -left-10 w-24 h-24 bg-white/10 rounded-full blur-xl" />
              <div className="flex items-center gap-2 relative z-10">
                <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, duration: 1.5 }} className="w-2.5 h-2.5 rounded-full bg-white block" />
                <span className="text-xs font-black">عرض ←</span>
              </div>
              <div className="relative z-10">
                <div className="text-sm font-black flex items-center gap-1 justify-end">
                  <Zap size={15} /> جلسة ركن نشطة
                </div>
                <div className="text-[10px] opacity-90">اضغط للمتابعة</div>
              </div>
            </motion.button>
          )}

          {/* بطاقة الحجز النشط */}
          {!activeSession && myIncomingCar && (
            <motion.button 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }} 
              onClick={() => { setSelectedGarageId(myIncomingCar.garageId); setScreen('navigation'); }} 
              className="w-full mb-3 flex items-center justify-between active:scale-[0.98] transition-all text-right relative overflow-hidden" 
              style={{ 
                background: BRAND.gradientSoft,
                borderRadius: 18, 
                padding: '13px 16px', 
                color: '#fff', 
                boxShadow: `0 8px 20px ${BRAND.secondary}40`,
              }}
            >
              <div className="absolute -top-10 -left-10 w-24 h-24 bg-white/10 rounded-full blur-xl" />
              <div className="flex items-center gap-2 relative z-10">
                <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, duration: 1.5 }} className="w-2.5 h-2.5 rounded-full bg-white block" />
                <span className="text-xs font-black">توجيه ←</span>
              </div>
              <div className="relative z-10">
                <div className="text-sm font-black flex items-center gap-1 justify-end">
                  <Navigation size={15} /> حجز في الطريق
                </div>
                <div className="text-[10px] opacity-90">اضغط لفتح الخريطة</div>
              </div>
            </motion.button>
          )}

          {/* ═══ شريط البحث ═══ */}
          <div className="mb-4">
            <div className="flex gap-2 mb-2.5">
              <div className="relative flex-1">
                <Search size={17} className="absolute right-4 top-1/2 -translate-y-1/2" style={{ color: BRAND.textMuted }} />
                <input
                  className="w-full font-bold outline-none text-sm"
                  style={{ 
                    background: BRAND.card,
                    border: '1.5px solid ' + BRAND.border,
                    padding: '13px 42px 13px 34px', 
                    borderRadius: 14, 
                    color: BRAND.text,
                    boxShadow: '0 2px 8px rgba(30, 58, 138, 0.04)',
                  }}
                  placeholder="ابحث عن جراج أو منطقة..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: BRAND.textMuted }}>
                    <X size={16} />
                  </button>
                )}
              </div>

              <button 
                onClick={getUserLocation} 
                disabled={locationLoading} 
                className="active:scale-95 transition-all flex items-center justify-center" 
                style={{ 
                  background: locationLoading ? BRAND.bgSoft : BRAND.gradient,
                  color: '#fff', 
                  borderRadius: 14, 
                  width: 48,
                  boxShadow: locationLoading ? 'none' : `0 4px 12px ${BRAND.primary}30`,
                }} 
                title="تحديد موقعي"
              >
                <Locate size={17} className={locationLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* أزرار الفلاتر */}
            <div className="flex gap-2 items-center">
              <button 
                onClick={() => setShowNearbyOnly(!showNearbyOnly)} 
                className="font-black text-[11px] active:scale-95 transition-all flex items-center gap-1.5" 
                style={{ 
                  background: showNearbyOnly ? BRAND.gradient : BRAND.card,
                  color: showNearbyOnly ? '#fff' : BRAND.textSoft, 
                  borderRadius: 11, 
                  padding: '8px 13px', 
                  border: '1.5px solid ' + (showNearbyOnly ? 'transparent' : BRAND.border),
                  boxShadow: showNearbyOnly ? `0 4px 10px ${BRAND.primary}25` : '0 2px 4px rgba(0,0,0,0.02)',
                }}
              >
                <Filter size={12} /> {showNearbyOnly ? 'إظهار الكل' : 'الأقرب فقط'}
              </button>

              {hasCompletedSession && (
                <button 
                  onClick={() => setScreen('lastSession')} 
                  className="font-black text-[11px] active:scale-95 transition-all flex items-center gap-1.5" 
                  style={{ 
                    background: BRAND.card, 
                    color: BRAND.textSoft, 
                    borderRadius: 11, 
                    padding: '8px 13px', 
                    border: '1.5px solid ' + BRAND.border,
                  }}
                >
                  <Receipt size={12} /> آخر إيصال
                </button>
              )}

              <div className="flex-1" />

              <div className="flex items-center gap-1 text-[10px] font-black" style={{ color: BRAND.textSoft }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: BRAND.primary }} />
                <span>{filteredGarages.length} جراج متاح</span>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════
              🗺️ مجموعات المناطق
              ═══════════════════════════════════════════════ */}
          {areaGroups.length > 0 ? (
            <div className="space-y-3">
              {areaGroups.map((group, groupIdx) => {
                const isExpanded = expandedArea === group.name;
                const totalAvailableSpots = group.garages.reduce((sum, g) => sum + (g.availableSpots || 0), 0);
                const occupancyPercentage = group.totalCapacity > 0 
                  ? Math.min(100, Math.round((totalAvailableSpots / group.totalCapacity) * 100))
                  : 0;

                return (
                  <motion.div
                    key={group.name}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: groupIdx * 0.04, type: 'spring', damping: 24 }}
                    className="overflow-hidden"
                    style={{
                      background: BRAND.card,
                      borderRadius: 18,
                      border: '1.5px solid ' + (isExpanded ? group.theme.solid : BRAND.border),
                      boxShadow: isExpanded
                        ? `0 8px 20px ${group.theme.solid}15`
                        : '0 2px 6px rgba(30, 58, 138, 0.04)',
                      transition: 'border-color 0.3s, box-shadow 0.3s',
                    }}
                  >
                    {/* ═══ Header ═══ */}
                    <button
                      onClick={() => setExpandedArea(isExpanded ? null : group.name)}
                      className="w-full p-3.5 flex items-center justify-between text-right bg-transparent border-none cursor-pointer outline-none active:scale-[0.995] transition-transform"
                    >
                      {/* اليسار: عداد + سهم */}
                      <div className="flex items-center gap-2.5 shrink-0">
                        <div
                          className="flex flex-col items-center justify-center"
                          style={{
                            background: isExpanded ? group.theme.solid : group.theme.light,
                            padding: '5px 9px',
                            minWidth: 40,
                            borderRadius: 11,
                            border: '1px solid ' + (isExpanded ? 'transparent' : group.theme.border),
                          }}
                        >
                          <span 
                            className="font-black font-mono leading-none" 
                            style={{ 
                              fontSize: 15, 
                              color: isExpanded ? '#fff' : group.theme.solid,
                            }}
                          >
                            {group.garages.length}
                          </span>
                          <span 
                            className="font-black leading-none mt-0.5" 
                            style={{ 
                              fontSize: 7.5, 
                              color: isExpanded ? 'rgba(255,255,255,0.85)' : group.theme.solid,
                              letterSpacing: 0.5,
                            }}
                          >
                            جراج
                          </span>
                        </div>

                        <motion.div
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ type: 'spring', damping: 15 }}
                          className="rounded-full flex items-center justify-center"
                          style={{
                            background: isExpanded ? group.theme.solid : BRAND.bgSoft,
                            width: 28,
                            height: 28,
                          }}
                        >
                          <ChevronDown 
                            size={16} 
                            strokeWidth={3} 
                            style={{ color: isExpanded ? '#fff' : group.theme.solid }} 
                          />
                        </motion.div>
                      </div>

                      {/* اليمين: الاسم والمعلومات */}
                      <div className="flex items-center gap-2.5 flex-1 justify-end">
                        <div className="text-right flex-1">
                          <h3 
                            className="font-black leading-none mb-1.5" 
                            style={{ 
                              fontSize: 15, 
                              color: isExpanded ? group.theme.solid : BRAND.text,
                            }}
                          >
                            {group.name}
                          </h3>

                          {/* عدد الأماكن المتاحة */}
                          <div className="flex items-center gap-1.5 justify-end mb-1.5">
                            <span className="text-[10px] font-bold" style={{ color: BRAND.textSoft }}>
                              مكان متاح
                            </span>
                            <span 
                              className="font-black font-mono text-[13px]" 
                              style={{ color: totalAvailableSpots > 0 ? BRAND.primary : '#DC2626' }}
                            >
                              {totalAvailableSpots}
                            </span>
                            <div 
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ 
                                background: totalAvailableSpots > 0 ? BRAND.primary : '#DC2626',
                                boxShadow: `0 0 6px ${totalAvailableSpots > 0 ? BRAND.primary : '#DC2626'}80`,
                              }}
                            />
                          </div>

                          {/* شريط التقدم */}
                          <div 
                            className="relative overflow-hidden" 
                            style={{ 
                              height: 3.5, 
                              background: BRAND.bgSoft,
                              borderRadius: 4,
                            }}
                          >
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${occupancyPercentage}%` }}
                              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 + groupIdx * 0.04 }}
                              style={{
                                height: '100%',
                                borderRadius: 4,
                                background: totalAvailableSpots > 0
                                  ? BRAND.gradient
                                  : 'linear-gradient(90deg, #EF4444, #DC2626)',
                              }}
                            />
                          </div>
                        </div>

                        {/* أيقونة المنطقة */}
                        <div
                          className="rounded-2xl flex items-center justify-center shrink-0"
                          style={{
                            background: isExpanded ? group.theme.solid : group.theme.light,
                            width: 46,
                            height: 46,
                            fontSize: 22,
                            boxShadow: isExpanded 
                              ? `0 5px 12px ${group.theme.solid}40`
                              : 'none',
                            border: '1.5px solid ' + (isExpanded ? 'transparent' : group.theme.border),
                          }}
                        >
                          <span>{group.theme.icon}</span>
                        </div>
                      </div>
                    </button>

                    {/* ═══ Content ═══ */}
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ type: 'spring', damping: 26, stiffness: 200 }}
                          style={{
                            borderTop: '1px dashed ' + group.theme.border,
                            background: `linear-gradient(180deg, ${group.theme.light}40 0%, transparent 100%)`,
                            padding: '12px 10px 14px',
                          }}
                        >
                          <div className="space-y-2.5">
                            {group.garages.map((garage, i) => (
                              <GarageCard
                                key={garage.id}
                                garage={garage}
                                index={i}
                                onSelect={() => handleDirectBooking(garage)}
                                isNearby={garage.classification === 'nearby'}
                                isClosest={i === 0 && garage.classification === 'nearby'}
                                hasActiveSession={Boolean(activeSession)}
                                hasIncomingCar={Boolean(myIncomingCar)}
                                disabled={isBooking}
                              />
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="text-5xl mb-3">🔍</div>
              <p className="text-sm font-black" style={{ color: BRAND.textSoft }}>لا توجد نتائج</p>
              <p className="text-xs mt-1" style={{ color: BRAND.textMuted }}>جرّب كلمة بحث مختلفة</p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showTopUp && <TopUpWalletModal onClose={() => setShowTopUp(false)} />}
      </AnimatePresence>

      <WelcomeGiftModal />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ██  WELCOME GIFT MODAL
   ════════════════════════════════════════════════════════════ */
function WelcomeGiftModal() {
  const [show, setShow] = useState(false);
  const currentUser = useStore((s) => s.currentUser);

  useEffect(() => {
    const hasGiftFlag = localStorage.getItem('showWelcomeGift');
    if (hasGiftFlag === 'true' && currentUser && !currentUser.hasUsedFreeSession) {
      setShow(true);
    } else {
      localStorage.removeItem('showWelcomeGift');
      setShow(false);
    }
  }, [currentUser]);

  const handleClose = () => {
    localStorage.removeItem('showWelcomeGift');
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[999] flex items-center justify-center p-5" onClick={handleClose}>
          <motion.div 
            initial={{ scale: 0.85, opacity: 0, y: 40 }} 
            animate={{ scale: 1, opacity: 1, y: 0 }} 
            exit={{ scale: 0.85, opacity: 0, y: 40 }} 
            className="bg-white rounded-[2rem] p-7 max-w-sm w-full text-center relative overflow-hidden" 
            style={{ boxShadow: '0 20px 60px rgba(30, 27, 75, 0.25)' }} 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full filter blur-xl" style={{ background: `${BRAND.secondary}30` }} />
            <div className="absolute -bottom-10 -left-10 w-28 h-28 rounded-full filter blur-xl" style={{ background: `${BRAND.accent}30` }} />

            <button onClick={handleClose} className="absolute top-4 left-4 transition-colors z-10" style={{ color: BRAND.textMuted }}>
              <X size={20} />
            </button>

            <motion.div 
              animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.05, 1] }} 
              transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }} 
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 relative z-10"
              style={{ 
                background: `linear-gradient(135deg, ${BRAND.accent} 0%, ${BRAND.secondary} 100%)`,
                boxShadow: `0 8px 24px ${BRAND.secondary}40`,
              }}
            >
              <Gift size={36} className="text-white" />
            </motion.div>

            <h3 className="text-2xl font-black mb-2 relative z-10" style={{ color: BRAND.text }}>🎉 أهلاً وسهلاً!</h3>
            <p className="text-sm mb-5 leading-relaxed relative z-10 font-bold" style={{ color: BRAND.textSoft }}>
              نورتنا في عائلة <span className="font-black" style={{ color: BRAND.primary }}>Park'n 24</span> وحبينا نفرحك بهدية حلوة 🌟
            </p>

            <div 
              className="relative z-10 mb-6" 
              style={{ 
                background: `linear-gradient(135deg, ${BRAND.accent}15 0%, ${BRAND.secondary}10 100%)`,
                borderRadius: 20, 
                padding: 18, 
                border: `2px solid ${BRAND.accent}50`,
              }}
            >
              <div className="flex items-center justify-center gap-2 mb-2">
                <Sparkles size={18} className="animate-pulse" style={{ color: BRAND.accent }} />
                <span className="font-black text-lg" style={{ color: BRAND.accent }}>أول 30 دقيقة مجاناً!</span>
                <Sparkles size={18} className="animate-pulse" style={{ color: BRAND.accent }} />
              </div>
              <p className="font-bold text-xs" style={{ color: BRAND.textSoft }}>
                احجز ركنتك الأولى واستمتع بأول 30 دقيقة ببلاش 🚗✨
              </p>
            </div>

            <button 
              onClick={handleClose} 
              className="w-full font-black py-4 rounded-2xl text-sm active:scale-95 transition-all relative z-10" 
              style={{ 
                background: BRAND.gradient,
                color: '#fff', 
                fontSize: 15, 
                boxShadow: `0 6px 20px ${BRAND.primary}40`,
              }}
            >
              يلا نبدأ! 🚀
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* ════════════════════════════════════════════════════════════
   ██  GARAGE CARD
   ════════════════════════════════════════════════════════════ */
const GarageCard = memo(function GarageCard({
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

  const btnBg = (() => {
    if (isFull) return '#E2E8F0';
    if (hasActiveSession) return BRAND.gradient;
    if (hasIncomingCar) return BRAND.gradientSoft;
    if (isClosest) return BRAND.gradient;
    if (isNearby) return BRAND.gradientSoft;
    return BRAND.gradient;
  })();

  const btnLabel = (() => {
    if (isFull) return 'ممتلئ';
    if (hasActiveSession) return '⚡ الجلسة النشطة';
    if (hasIncomingCar) return '📍 الحجز النشط';
    if (isClosest) return 'احجز الآن • الأقرب';
    if (isNearby) return 'احجز الآن';
    return 'احجز مكانك';
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      onClick={!disabled && !isFull ? onSelect : undefined}
      className={`text-right transition-all ${!isFull && !disabled ? 'active:scale-[0.98] cursor-pointer' : 'cursor-not-allowed opacity-95'}`}
      style={{
        background: BRAND.card,
        border: '1.5px solid ' + (isClosest && !isBusy ? BRAND.primary + '40' : isNearby ? BRAND.secondary + '30' : BRAND.border),
        borderRadius: 15,
        padding: 12,
        boxShadow: isClosest && !isBusy 
          ? `0 4px 12px ${BRAND.primary}12` 
          : '0 2px 6px rgba(30, 58, 138, 0.04)',
      }}
    >
      {/* ═══ Header ═══ */}
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-1 flex-wrap">
          <div 
            className="flex items-center gap-0.5 font-black text-white" 
            style={{ background: BRAND.accent, fontSize: 9.5, padding: '2px 6px', borderRadius: 6 }}
          >
            <Star size={8} fill="currentColor" />
            {garage.rating}
          </div>

          {garage.payment_mode === 'cash' && (
            <span 
              style={{ 
                background: '#FFF7ED', 
                color: '#C2410C', 
                border: '1px solid #FED7AA', 
                fontSize: 9, 
                padding: '2px 6px', 
                borderRadius: 6, 
                fontWeight: 900,
              }}
            >
              💵 نقدي
            </span>
          )}

          {garage.payment_mode === 'wallet' && (
            <span 
              style={{ 
                background: BRAND.bgSoft, 
                color: BRAND.secondary, 
                border: '1px solid ' + BRAND.border, 
                fontSize: 9, 
                padding: '2px 6px', 
                borderRadius: 6, 
                fontWeight: 900,
              }}
            >
              👝 محفظة
            </span>
          )}

          {isFull && (
            <span style={{ background: '#DC2626', color: '#fff', fontSize: 9, padding: '2px 6px', borderRadius: 6, fontWeight: 900 }}>
              ممتلئ
            </span>
          )}

          {!isBusy && isClosest && !isFull && (
            <span 
              style={{ 
                background: BRAND.primary, 
                color: '#fff', 
                fontSize: 9, 
                padding: '2px 6px', 
                borderRadius: 6, 
                fontWeight: 900,
                boxShadow: `0 2px 6px ${BRAND.primary}40`,
              }}
            >
              📍 الأقرب
            </span>
          )}
        </div>

        <h3 className="text-[13.5px] font-black text-right" style={{ lineHeight: 1.3, color: BRAND.text }}>
          {garage.name}
        </h3>
      </div>

      {/* ═══ Location ═══ */}
      <div className="flex items-center gap-1 justify-end mb-2.5" style={{ fontSize: 10, color: BRAND.textMuted }}>
        <span className="truncate max-w-[200px] font-bold">{garage.location}</span>
        <MapPin size={10} className="shrink-0" />
      </div>

      {/* ═══ Info Row ═══ */}
      <div 
        className="flex items-center justify-between gap-2 mb-2.5 py-2 px-2.5 rounded-xl" 
        style={{ background: BRAND.bg, border: '1px solid ' + BRAND.borderSoft }}
      >
        {/* Duration */}
        <div className="flex items-center gap-1">
          <div 
            className="w-6 h-6 rounded-lg flex items-center justify-center" 
            style={{ background: isNearby ? BRAND.gradientLight : BRAND.bgSoft }}
          >
            <Navigation size={11} className="rotate-45" style={{ color: isNearby ? BRAND.primary : BRAND.secondary }} />
          </div>
          <span className="font-black font-mono text-[11px]" style={{ color: isNearby ? BRAND.primary : BRAND.secondary }}>
            {formatDuration(garage.minutes)}
          </span>
        </div>

        <div style={{ width: 1, height: 20, background: BRAND.border }} />

        {/* Available spots */}
        <div className="flex items-center gap-1">
          <Car size={13} style={{ color: BRAND.primary }} />
          <span className="font-black font-mono text-[13px]" style={{ color: BRAND.primary }}>{garage.availableSpots}</span>
          <span className="text-[9px] font-bold" style={{ color: BRAND.textMuted }}>شاغر</span>
        </div>

        <div style={{ width: 1, height: 20, background: BRAND.border }} />

        {/* Price */}
        <div className="flex items-center gap-1">
          <span className="font-black font-mono text-[13px]" style={{ color: BRAND.secondary }}>{garage.basePrice}</span>
          <span className="text-[9px] font-bold" style={{ color: BRAND.textMuted }}>ج.م/س</span>
        </div>
      </div>

      {/* ═══ CTA Button ═══ */}
      <button
        disabled={isFull || disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!isFull && !disabled) onSelect();
        }}
        className="w-full font-black flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
        style={{ 
          background: btnBg, 
          color: isFull ? BRAND.textMuted : '#fff', 
          borderRadius: 11, 
          padding: '10px 0', 
          fontSize: 12, 
          border: 'none', 
          cursor: isFull ? 'not-allowed' : 'pointer',
          boxShadow: !isFull ? `0 4px 10px ${BRAND.primary}20` : 'none',
        }}
      >
        <Car size={13} />
        <span>{btnLabel}</span>
      </button>
    </motion.div>
  );
});