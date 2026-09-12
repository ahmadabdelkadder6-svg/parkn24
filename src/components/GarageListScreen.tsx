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
  TrendingUp,
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

// 🎨 نظام ألوان احترافي عالمي - Premium International Design System
const AREA_THEMES: Record<string, { icon: string; gradient: string; solid: string; light: string; border: string; accent: string; }> = {
  'وسط البلد':      { icon: '🏢', gradient: 'linear-gradient(135deg, #1E40AF, #3B82F6)', solid: '#2563EB', light: '#EFF6FF', border: '#BFDBFE', accent: '#1E3A8A' },
  'مصر الجديدة':    { icon: '🏰', gradient: 'linear-gradient(135deg, #DC2626, #EF4444)', solid: '#DC2626', light: '#FEF2F2', border: '#FECACA', accent: '#991B1B' },
  'مدينة نصر':     { icon: '🏙️', gradient: 'linear-gradient(135deg, #6D28D9, #8B5CF6)', solid: '#7C3AED', light: '#F5F3FF', border: '#DDD6FE', accent: '#5B21B6' },
  'المعادي':       { icon: '🌳', gradient: 'linear-gradient(135deg, #059669, #10B981)', solid: '#059669', light: '#ECFDF5', border: '#A7F3D0', accent: '#047857' },
  'المهندسين':     { icon: '🛍️', gradient: 'linear-gradient(135deg, #EA580C, #F97316)', solid: '#EA580C', light: '#FFF7ED', border: '#FED7AA', accent: '#C2410C' },
  'الدقي':         { icon: '🎓', gradient: 'linear-gradient(135deg, #0284C7, #0EA5E9)', solid: '#0284C7', light: '#F0F9FF', border: '#BAE6FD', accent: '#075985' },
  'التجمع الخامس': { icon: '💎', gradient: 'linear-gradient(135deg, #0891B2, #06B6D4)', solid: '#0891B2', light: '#ECFEFF', border: '#A5F3FC', accent: '#155E75' },
  'مناطق أخرى':    { icon: '📍', gradient: 'linear-gradient(135deg, #475569, #64748B)', solid: '#475569', light: '#F8FAFC', border: '#CBD5E1', accent: '#334155' },
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
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#F5F7FA', color: '#0A1628' }}>
      
      {/* ═══════════════════════════════════════════════
          🎨 HEADER — Premium International Style
          ═══════════════════════════════════════════════ */}
      <div 
        className="relative z-10"
        style={{ 
          background: 'linear-gradient(180deg, #0A1628 0%, #1E293B 100%)',
          paddingTop: 44,
          paddingBottom: 20,
          borderBottomLeftRadius: 28,
          borderBottomRightRadius: 28,
          boxShadow: '0 4px 20px rgba(10, 22, 40, 0.15)',
        }}
      >
        {/* شريط علوي: تحية + شعار */}
        <div className="flex justify-between items-center px-5 mb-5">
          <div className="flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: 1 }}>
                GOOD DAY
              </span>
              <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <h1 className="text-lg font-black text-white leading-tight">
              {currentUser?.name || 'مرحباً بك'} 👋
            </h1>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScreen('chat')}
              className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform relative"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <MessageCircle size={17} className="text-white" />
            </button>
            <img
              src="/images/logo.png"
              alt="بركن"
              className="w-11 h-11 object-contain"
              style={{
                borderRadius: 14,
                background: '#fff',
                padding: 3,
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              }}
            />
          </div>
        </div>

        {/* ═══ بطاقة المحفظة الاحترافية (Premium Wallet Card) ═══ */}
        <div className="px-5">
          <div
            style={{
              background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFF 100%)',
              borderRadius: 24,
              padding: '18px 20px',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(0,0,0,0.05)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* عناصر تصميمية خلفية */}
            <div style={{ 
              position: 'absolute', 
              top: -30, 
              right: -30, 
              width: 120, 
              height: 120, 
              background: 'radial-gradient(circle, rgba(0,102,255,0.06) 0%, transparent 70%)', 
              borderRadius: '50%',
            }} />
            
            {/* رأس البطاقة */}
            <div className="flex justify-between items-start mb-4 relative z-10">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Wallet size={11} style={{ color: '#64748B' }} />
                  <span className="text-[9px] font-black" style={{ color: '#64748B', letterSpacing: 1.5 }}>
                    WALLET BALANCE
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-black font-mono" style={{ fontSize: 28, color: '#0A1628', lineHeight: 1 }}>
                    {walletBalance.toLocaleString()}
                  </span>
                  <span className="text-xs font-black" style={{ color: '#64748B' }}>ج.م</span>
                </div>
              </div>

              {/* لوحة السيارة (Egyptian Plate) */}
              <div style={{ 
                background: '#ffffff', 
                border: '2px solid #0A1628', 
                borderRadius: 8, 
                boxShadow: '0 3px 8px rgba(0,0,0,0.15)', 
                overflow: 'hidden', 
                minWidth: 92,
              }}>
                <div style={{ 
                  height: 6, 
                  background: 'linear-gradient(90deg, #DC2626 0%, #FFFFFF 33%, #FFFFFF 66%, #000 100%)',
                }} />
                <div className="py-1 px-2 text-center font-black font-mono flex items-center justify-center gap-1" style={{ color: '#0A1628', fontSize: 11 }}>
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
                  background: 'linear-gradient(135deg, #0066FF 0%, #0044DD 100%)', 
                  color: '#fff', 
                  borderRadius: 14, 
                  padding: '11px 0', 
                  fontSize: 12,
                  boxShadow: '0 6px 16px rgba(0,102,255,0.3)',
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
                    background: showHistory ? '#0A1628' : '#F1F5F9', 
                    color: showHistory ? '#fff' : '#0A1628', 
                    borderRadius: 14,
                    border: '1.5px solid ' + (showHistory ? '#0A1628' : '#E2E8F0'),
                  }}
                  title="سجل العمليات"
                >
                  <History size={16} />
                  {pendingTopUpsCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 text-slate-950 font-black text-[8px] flex items-center justify-center border-2 border-white">
                      {pendingTopUpsCount}
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* شريط الحالة السفلي */}
            <div className="mt-3.5 pt-3 border-t flex items-center justify-between gap-2" style={{ borderColor: '#EEF2F7' }}>
              {isLowBalance ? (
                <div className="flex items-center gap-1.5 flex-1">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: '#FEF3C7' }}>
                    <Zap size={11} className="text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-[10.5px] text-amber-700 truncate">اشحن الآن ووفر وقتك</div>
                    <div className="font-bold text-[9px] text-slate-500 truncate">خروج فوري بدون فكة ⚡</div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 flex-1">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: '#D1FAE5' }}>
                    <Shield size={11} className="text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-[10.5px] text-emerald-700 truncate">رصيدك آمن ومحمي</div>
                    <div className="font-bold text-[9px] text-slate-500 truncate">جاهز للخروج الفوري</div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: '#F1F5F9' }}>
                <TrendingUp size={10} className="text-blue-600" />
                <span className="text-[9px] font-black text-blue-700">نشط</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          📜 CONTENT — Scrollable Area
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
                style={{ background: '#ffffff', border: '1.5px solid #E2E8F0', borderRadius: 20, padding: 14 }}
              >
                <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-slate-100">
                  <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-slate-600">
                    <X size={16} />
                  </button>
                  <h3 className="font-black text-xs flex items-center gap-1.5 text-slate-800">
                    سجل الشحن الأخير <History size={13} className="text-blue-600" />
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
                          background: isPending ? '#FFFBEB' : isApproved ? '#F0FDF4' : '#F8FAFC', 
                          border: '1px solid ' + (isPending ? '#FDE68A' : isApproved ? '#BBF7D0' : '#E2E8F0'),
                        }}
                      >
                        <div className="text-left">
                          <div className="font-black font-mono text-sm" style={{ color: isApproved ? '#059669' : isPending ? '#D97706' : '#64748B' }}>
                            {topUp.amount} ج.م
                          </div>
                          <div className="text-[9px] text-slate-400 font-mono mt-0.5">
                            #{topUp.transactionId || topUp.id.substring(0, 8).toUpperCase()}
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-2">
                          <div>
                            <div className="font-black text-[10px]" style={{ color: '#0A1628' }}>
                              {topUp.method === 'instapay' ? '📱 إنستاباي' : '📲 محفظة كاش'}
                            </div>
                            <div className="text-[9px] font-bold text-slate-400 mt-0.5">
                              {new Date(topUp.timestamp).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          <div className="shrink-0">
                            {isPending ? (
                              <span className="font-black text-[9px] px-2 py-1 rounded-lg bg-amber-100 text-amber-800">⏳ معلق</span>
                            ) : isApproved ? (
                              <span className="font-black text-[9px] px-2 py-1 rounded-lg bg-emerald-100 text-emerald-800 flex items-center gap-0.5">
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

          {/* 🎁 بانر ترحيبي احترافي */}
          {isEligibleForFreeSession && !activeSession && !myIncomingCar && (
            <motion.div 
              initial={{ opacity: 0, y: -15 }} 
              animate={{ opacity: 1, y: 0 }} 
              className="w-full mb-3 overflow-hidden relative" 
              style={{ 
                background: 'linear-gradient(135deg, #FFF7ED 0%, #FFFBEB 100%)',
                borderRadius: 20, 
                padding: 16, 
                border: '1.5px solid #FDE68A',
                boxShadow: '0 6px 18px rgba(251, 191, 36, 0.12)',
              }}
            >
              <div className="absolute -top-8 -right-8 w-20 h-20 bg-amber-200/40 rounded-full filter blur-xl" />
              <div className="flex items-center gap-3 relative z-10">
                <motion.div 
                  animate={{ rotate: [0, -5, 5, 0] }} 
                  transition={{ repeat: Infinity, duration: 3 }} 
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" 
                  style={{ 
                    background: 'linear-gradient(135deg, #F59E0B 0%, #DC2626 100%)',
                    boxShadow: '0 6px 14px rgba(245, 158, 11, 0.4)',
                  }}
                >
                  <Gift size={22} className="text-white" />
                </motion.div>
                <div className="flex-1 text-right">
                  <div className="flex items-center gap-1.5 justify-end mb-0.5">
                    <span className="font-black text-[8px] px-2 py-0.5 rounded-full" style={{ background: '#DC2626', color: '#fff' }}>
                      🎁 هدية ترحيبية
                    </span>
                  </div>
                  <h4 className="font-black text-slate-900 leading-tight text-[13px]">
                    أول ركنة <span className="text-red-600">مجانية بالكامل!</span>
                  </h4>
                  <p className="text-slate-600 font-bold text-[10px] mt-0.5">
                    استمتع بـ <span className="text-emerald-600 font-black">30 دقيقة مجانية</span> في أول زيارة
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
                background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                borderRadius: 20, 
                padding: '14px 16px', 
                color: '#fff', 
                boxShadow: '0 8px 20px rgba(5, 150, 105, 0.3)',
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
                background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                borderRadius: 20, 
                padding: '14px 16px', 
                color: '#fff', 
                boxShadow: '0 8px 20px rgba(2, 132, 199, 0.3)',
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

          {/* ═══ شريط البحث والفلاتر الاحترافي ═══ */}
          <div className="mb-4">
            <div className="flex gap-2 mb-2.5">
              <div className="relative flex-1">
                <Search size={17} className="absolute right-4 top-1/2 -translate-y-1/2" style={{ color: '#94A3B8' }} />
                <input
                  className="w-full font-bold outline-none text-sm"
                  style={{ 
                    background: '#ffffff',
                    border: '1.5px solid #E2E8F0',
                    padding: '13px 42px 13px 34px', 
                    borderRadius: 16, 
                    color: '#0A1628',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                  }}
                  placeholder="ابحث عن جراج أو منطقة..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X size={16} />
                  </button>
                )}
              </div>

              <button 
                onClick={getUserLocation} 
                disabled={locationLoading} 
                className="active:scale-95 transition-all flex items-center justify-center" 
                style={{ 
                  background: locationLoading ? '#F1F5F9' : '#0A1628',
                  color: locationLoading ? '#94A3B8' : '#fff', 
                  borderRadius: 16, 
                  width: 48,
                  boxShadow: locationLoading ? 'none' : '0 4px 12px rgba(10, 22, 40, 0.15)',
                }} 
                title="تحديد موقعي"
              >
                <Locate size={17} className={locationLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* أزرار الفلاتر السريعة */}
            <div className="flex gap-2">
              <button 
                onClick={() => setShowNearbyOnly(!showNearbyOnly)} 
                className="font-black text-[11px] active:scale-95 transition-all flex items-center gap-1.5" 
                style={{ 
                  background: showNearbyOnly ? '#0066FF' : '#ffffff',
                  color: showNearbyOnly ? '#fff' : '#475569', 
                  borderRadius: 12, 
                  padding: '8px 14px', 
                  border: '1.5px solid ' + (showNearbyOnly ? '#0066FF' : '#E2E8F0'),
                  boxShadow: showNearbyOnly ? '0 4px 10px rgba(0,102,255,0.2)' : '0 2px 4px rgba(0,0,0,0.02)',
                }}
              >
                <Filter size={12} /> {showNearbyOnly ? 'إظهار الكل' : 'الأقرب فقط'}
              </button>

              {hasCompletedSession && (
                <button 
                  onClick={() => setScreen('lastSession')} 
                  className="font-black text-[11px] active:scale-95 transition-all flex items-center gap-1.5" 
                  style={{ 
                    background: '#ffffff', 
                    color: '#475569', 
                    borderRadius: 12, 
                    padding: '8px 14px', 
                    border: '1.5px solid #E2E8F0',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                  }}
                >
                  <Receipt size={12} /> آخر إيصال
                </button>
              )}

              <div className="flex-1" />

              <div className="flex items-center gap-1 text-[10px] font-black text-slate-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>{filteredGarages.length} جراج متاح</span>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════
              🗺️ مجموعات المناطق (Premium Accordion)
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
                      background: '#ffffff',
                      borderRadius: 20,
                      border: '1.5px solid ' + (isExpanded ? group.theme.solid : '#E8EEF7'),
                      boxShadow: isExpanded
                        ? `0 10px 24px ${group.theme.solid}15, 0 2px 6px rgba(0,0,0,0.03)`
                        : '0 2px 8px rgba(0,0,0,0.03)',
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
                            background: isExpanded ? group.theme.gradient : group.theme.light,
                            padding: '5px 9px',
                            minWidth: 40,
                            borderRadius: 12,
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
                            background: isExpanded ? group.theme.solid : '#F1F5F9',
                            width: 28,
                            height: 28,
                          }}
                        >
                          <ChevronDown 
                            size={16} 
                            strokeWidth={3} 
                            style={{ color: isExpanded ? '#fff' : '#64748B' }} 
                          />
                        </motion.div>
                      </div>

                      {/* اليمين: الاسم والمعلومات */}
                      <div className="flex items-center gap-2.5 flex-1 justify-end">
                        <div className="text-right flex-1">
                          <div className="flex items-center gap-1.5 justify-end mb-1">
                            <h3 
                              className="font-black leading-none" 
                              style={{ 
                                fontSize: 15, 
                                color: isExpanded ? group.theme.accent : '#0A1628',
                              }}
                            >
                              {group.name}
                            </h3>
                          </div>

                          {/* عدد الأماكن المتاحة */}
                          <div className="flex items-center gap-1.5 justify-end mb-1.5">
                            <span className="text-[10px] font-bold text-slate-600">
                              مكان متاح
                            </span>
                            <span 
                              className="font-black font-mono text-[13px]" 
                              style={{ color: totalAvailableSpots > 0 ? '#059669' : '#DC2626' }}
                            >
                              {totalAvailableSpots}
                            </span>
                            <div 
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ 
                                background: totalAvailableSpots > 0 ? '#10B981' : '#EF4444',
                                boxShadow: '0 0 6px ' + (totalAvailableSpots > 0 ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)'),
                              }}
                            />
                          </div>

                          {/* شريط التقدم */}
                          <div 
                            className="relative overflow-hidden" 
                            style={{ 
                              height: 3.5, 
                              background: '#F1F5F9',
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
                                  ? 'linear-gradient(90deg, #10B981, #059669)'
                                  : 'linear-gradient(90deg, #EF4444, #DC2626)',
                              }}
                            />
                          </div>
                        </div>

                        {/* أيقونة المنطقة */}
                        <div
                          className="rounded-2xl flex items-center justify-center shrink-0"
                          style={{
                            background: isExpanded ? group.theme.gradient : group.theme.light,
                            width: 48,
                            height: 48,
                            fontSize: 22,
                            boxShadow: isExpanded 
                              ? `0 6px 14px ${group.theme.solid}40`
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
                            background: group.theme.light + '30',
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
              <p className="text-sm font-black text-slate-600">لا توجد نتائج</p>
              <p className="text-xs mt-1 text-slate-400">جرّب كلمة بحث مختلفة</p>
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
            style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }} 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute -top-10 -right-10 w-28 h-28 bg-rose-100/60 rounded-full filter blur-xl" />
            <div className="absolute -bottom-10 -left-10 w-28 h-28 bg-amber-100/50 rounded-full filter blur-xl" />

            <button onClick={handleClose} className="absolute top-4 left-4 text-slate-300 hover:text-slate-500 transition-colors z-10">
              <X size={20} />
            </button>

            <motion.div 
              animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.05, 1] }} 
              transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }} 
              className="w-20 h-20 bg-gradient-to-br from-amber-400 to-rose-500 rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg shadow-rose-200/50 relative z-10"
            >
              <Gift size={36} className="text-white" />
            </motion.div>

            <h3 className="text-2xl font-black text-slate-900 mb-2 relative z-10">🎉 أهلاً وسهلاً!</h3>
            <p className="text-slate-600 text-sm mb-5 leading-relaxed relative z-10 font-bold">
              نورتنا في عائلة <span className="font-black text-blue-600">Park'n 24</span> وحبينا نفرحك بهدية حلوة 🌟
            </p>

            <div className="relative z-10 mb-6" style={{ background: 'linear-gradient(135deg, #FFF7ED 0%, #FEF3C7 100%)', borderRadius: 20, padding: 18, border: '2px solid #FCD34D' }}>
              <div className="flex items-center justify-center gap-2 mb-2">
                <Sparkles size={18} className="text-amber-500 animate-pulse" />
                <span className="font-black text-amber-700 text-lg">أول 30 دقيقة مجاناً!</span>
                <Sparkles size={18} className="text-amber-500 animate-pulse" />
              </div>
              <p className="text-amber-600 font-bold text-xs">احجز ركنتك الأولى واستمتع بأول 30 دقيقة ببلاش 🚗✨</p>
            </div>

            <button 
              onClick={handleClose} 
              className="w-full font-black py-4 rounded-2xl text-sm active:scale-95 transition-all relative z-10" 
              style={{ 
                background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)', 
                color: '#fff', 
                fontSize: 15, 
                boxShadow: '0 6px 20px rgba(37,99,235,0.3)',
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
   ██  GARAGE CARD — Premium International Style
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
    if (hasActiveSession) return 'linear-gradient(135deg, #059669 0%, #047857 100%)';
    if (hasIncomingCar) return 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)';
    if (isClosest) return 'linear-gradient(135deg, #0066FF 0%, #0044DD 100%)';
    if (isNearby) return 'linear-gradient(135deg, #059669 0%, #047857 100%)';
    return 'linear-gradient(135deg, #0A1628 0%, #1E293B 100%)';
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
        background: '#ffffff',
        border: '1.5px solid ' + (isClosest && !isBusy ? '#0066FF40' : isNearby ? '#05966930' : '#E2E8F0'),
        borderRadius: 16,
        padding: 12,
        boxShadow: isClosest && !isBusy 
          ? '0 4px 12px rgba(0,102,255,0.08)' 
          : '0 2px 6px rgba(0,0,0,0.03)',
      }}
    >
      {/* ═══ Header ═══ */}
      <div className="flex justify-between items-start mb-2">
        {/* اليسار: الشارات */}
        <div className="flex items-center gap-1 flex-wrap">
          <div className="flex items-center gap-0.5 font-black text-white" style={{ background: '#F59E0B', fontSize: 9.5, padding: '2px 6px', borderRadius: 6 }}>
            <Star size={8} fill="currentColor" />
            {garage.rating}
          </div>

          {garage.payment_mode === 'cash' && (
            <span style={{ background: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA', fontSize: 9, padding: '2px 6px', borderRadius: 6, fontWeight: 900 }}>
              💵 نقدي
            </span>
          )}

          {garage.payment_mode === 'wallet' && (
            <span style={{ background: '#F5F3FF', color: '#6D28D9', border: '1px solid #DDD6FE', fontSize: 9, padding: '2px 6px', borderRadius: 6, fontWeight: 900 }}>
              👝 محفظة
            </span>
          )}

          {isFull && (
            <span style={{ background: '#DC2626', color: '#fff', fontSize: 9, padding: '2px 6px', borderRadius: 6, fontWeight: 900 }}>
              ممتلئ
            </span>
          )}

          {!isBusy && isClosest && !isFull && (
            <span style={{ background: '#0066FF', color: '#fff', fontSize: 9, padding: '2px 6px', borderRadius: 6, fontWeight: 900 }}>
              📍 الأقرب
            </span>
          )}
        </div>

        {/* اليمين: اسم الجراج */}
        <h3 className="text-[13.5px] font-black text-slate-900 text-right" style={{ lineHeight: 1.3 }}>
          {garage.name}
        </h3>
      </div>

      {/* ═══ Location ═══ */}
      <div className="flex items-center gap-1 justify-end mb-2.5 text-slate-500" style={{ fontSize: 10 }}>
        <span className="truncate max-w-[200px] font-bold">{garage.location}</span>
        <MapPin size={10} className="shrink-0" />
      </div>

      {/* ═══ Info Row ═══ */}
      <div className="flex items-center justify-between gap-2 mb-2.5 py-2 px-2.5 rounded-xl" style={{ background: '#F8FAFC', border: '1px solid #F1F5F9' }}>
        {/* Duration */}
        <div className="flex items-center gap-1">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: isNearby ? '#D1FAE5' : '#E0E7FF' }}>
            <Navigation size={11} className="rotate-45" style={{ color: isNearby ? '#059669' : '#4F46E5' }} />
          </div>
          <span className="font-black font-mono text-[11px]" style={{ color: isNearby ? '#059669' : '#4F46E5' }}>
            {formatDuration(garage.minutes)}
          </span>
        </div>

        <div style={{ width: 1, height: 20, background: '#E2E8F0' }} />

        {/* Available spots */}
        <div className="flex items-center gap-1">
          <Car size={13} style={{ color: '#0066FF' }} />
          <span className="font-black font-mono text-[13px] text-blue-600">{garage.availableSpots}</span>
          <span className="text-[9px] font-bold text-slate-500">شاغر</span>
        </div>

        <div style={{ width: 1, height: 20, background: '#E2E8F0' }} />

        {/* Price */}
        <div className="flex items-center gap-1">
          <span className="font-black font-mono text-[13px] text-emerald-600">{garage.basePrice}</span>
          <span className="text-[9px] font-bold text-slate-500">ج.م/س</span>
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
          color: isFull ? '#94A3B8' : '#fff', 
          borderRadius: 12, 
          padding: '10px 0', 
          fontSize: 12, 
          border: 'none', 
          cursor: isFull ? 'not-allowed' : 'pointer',
          boxShadow: !isFull ? '0 4px 10px rgba(0,0,0,0.08)' : 'none',
        }}
      >
        <Car size={13} />
        <span>{btnLabel}</span>
      </button>
    </motion.div>
  );
});