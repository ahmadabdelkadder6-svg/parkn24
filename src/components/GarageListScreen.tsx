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
  History,
  CheckCircle2,
  XCircle,
  Gift,
  Sparkles,
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
    acknowledgedSessionIds,
    walletTopUps, // 🚀 جلب طلبات شحن المحفظة من الستور لتتبعها تلقائياً
  } = useStore();

  const [search, setSearch] = useState('');
  const [showNearbyOnly, setShowNearbyOnly] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [showHistory, setShowHistory] = useState(false); // 🚀 للتحكم في فتح وغلق سجل العمليات
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

  /* 🎁 التحقق مما إذا كان العميل يستحق عرض الساعة المجانية الترحيبية */
  const isEligibleForFreeSession = useMemo(() => {
    return currentUser && !currentUser.hasUsedFreeSession;
  }, [currentUser]);

  /* ✅ البحث عن جلسة نشطة واستبعاد أي جلسة تم إقرار إغلاقها مسبقاً */
  const activeSession = useMemo(() => {
    if (!normalizedUserPlate && !currentUser?.phone) return undefined;

    return sessions
      .filter((s: Session & { customerPhone?: string }) => {
        if (s.status !== 'active') return false;
        if (acknowledgedSessionIds?.has(s.id)) return false;
        const samePlate = normalizePlateForCompare(s.carPlate) === normalizedUserPlate;
        const samePhone = Boolean(currentUser?.phone && s.customerPhone === currentUser.phone);
        return samePlate || samePhone;
      })
      .sort((a, b) => safeParseTime(b.startTime) - safeParseTime(a.startTime))[0];
  }, [sessions, normalizedUserPlate, currentUser?.phone, acknowledgedSessionIds]);

  /* ✅ حجب الجلسات المنتهية القديمة لمنع تكرار شاشة النهاية */
  const hasCompletedSession = useMemo(() => {
    if (activeSession) return false;
    return sessions.some(
      (s: Session) =>
        normalizePlateForCompare(s.carPlate) === normalizedUserPlate &&
        s.status === 'completed'
    );
  }, [sessions, normalizedUserPlate, activeSession]);

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

  /* 🚀 فلترة عمليات شحن المحفظة الخاصة بالعميل الحالي وتصنيفها */
  const myTopUps = useMemo(() => {
    if (!currentUser?.phone || !walletTopUps) return [];
    return walletTopUps
      .filter((w) => w.userPhone === currentUser.phone)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 3); // 🚀 عرض أحدث 3 عمليات شحن فقط لتخفيف واجهة العميل وتسريع الأداء تماماً
  }, [walletTopUps, currentUser?.phone]);

  const pendingTopUpsCount = useMemo(() => {
    return myTopUps.filter((w) => w.status === 'pending').length;
  }, [myTopUps]);

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

  /* ── Realtime + Polling ── */
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
        { event: '*', schema: 'public', table: 'sessions', filter: `car_plate=eq.${normalizedUserPlate}` },
        (payload) => {
          if (isMyRow(payload.new) || isMyRow(payload.old)) {
            refetch();
          }
        }
      )
      .subscribe();

    const interval = setInterval(refetch, 1500); // 🚀 تسريع الفحص اللحظي لفتح العداد فوراً

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

  /* ── انتقال تلقائي لشاشة الجلسة ── */
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
      .filter((g) => g.isActive !== false) // 🚀 استبعاد الجراجات المعطلة من الظهور للعميل
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

        {/* 💳 بطاقة المحفظة الذكية المدمجة والفاخرة (مع التحكم التفاعلي بالجميل التحفيزية بالداخل) */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0055FF 0%, #3B00E3 50%, #8A00FF 100%)',
            borderRadius: 22,
            padding: '16px',
            marginBottom: 12,
            boxShadow: '0 8px 24px rgba(59, 0, 227, 0.28)',
            color: '#ffffff',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* تأثيرات الإضاءة الخلفية الفاخرة للكارت */}
          <div
            style={{
              position: 'absolute',
              top: '-40%',
              left: '-15%',
              width: '110px',
              height: '110px',
              background: 'rgba(255,255,255,0.15)',
              borderRadius: '50%',
              filter: 'blur(25px)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '-30%',
              right: '-10%',
              width: '90px',
              height: '90px',
              background: 'rgba(0,204,102,0.2)',
              borderRadius: '50%',
              filter: 'blur(22px)',
            }}
          />

          {/* الجزء العلوي: الرصيد وأزرار الشحن */}
          <div className="flex justify-between items-center relative z-10 mb-3">
            <div>
              <div
                className="text-[9px] font-black tracking-widest flex items-center gap-1"
                style={{ opacity: 0.85 }}
              >
                <span>💳 رصيد محفظتك</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              </div>
              <div
                className="font-black font-mono flex items-baseline gap-1"
                style={{
                  fontSize: 24,
                  lineHeight: 1.1,
                  textShadow: '0 2px 8px rgba(0,0,0,0.15)',
                }}
              >
                {currentUser?.wallet || 0}
                <span className="text-[10px] font-bold" style={{ opacity: 0.9 }}>
                  ج.م
                </span>
              </div>
            </div>

            {/* أزرار المحفظة */}
            <div className="flex gap-2 items-center">
              {myTopUps.length > 0 && (
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="flex items-center justify-center p-2.5 rounded-xl transition-all relative"
                  style={{
                    background: showHistory ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)',
                    color: '#ffffff',
                    border: '1.5px solid rgba(255,255,255,0.25)',
                  }}
                  title="سجل العمليات"
                >
                  <History size={16} />
                  {pendingTopUpsCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 rounded-full bg-amber-400 text-slate-950 font-black text-[9px] flex items-center justify-center animate-bounce">
                      {pendingTopUpsCount}
                    </span>
                  )}
                </button>
              )}

              {/* زر الشحن المدمج والأنيق */}
              <button
                onClick={() => setShowTopUp(true)}
                className="flex items-center gap-1 font-black active:scale-95 transition-all"
                style={{
                  background: '#ffffff',
                  color: '#0055FF',
                  borderRadius: 12,
                  padding: '8px 14px',
                  fontSize: 12,
                  boxShadow: '0 4px 14px rgba(255,255,255,0.3)',
                }}
              >
                <Plus size={14} strokeWidth={3} />
                <span>اشحن الآن</span>
              </button>
            </div>
          </div>

          {/* 🌟 الجزء السفلي المدمج: الجملة التحفيزية التفاعلية ورقم اللوحة الترخيصية */}
          <div className="pt-2.5 border-t border-white/20 flex items-center justify-between gap-2 relative z-10">
            
            {/* التحقق اللحظي التفاعلي من الرصيد وعرض البانر المناسب */}
            {(!currentUser?.wallet || currentUser.wallet < 30) ? (
              /* رصيد ضعيف < 30 جنيه ⬅️ تظهر الجملة الذهبية التحفيزية للشحن فوراً */
              <button
                onClick={() => setShowTopUp(true)}
                className="flex-1 text-right flex items-center gap-1.5 bg-white/10 hover:bg-white/20 active:scale-95 transition-all px-2.5 py-1.5 rounded-xl border border-white/15"
              >
                <div className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center shrink-0 shadow-sm">
                  <Zap size={11} className="fill-slate-950 text-slate-950" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="font-black text-[11px] text-amber-300 truncate">
                    اشحن محفظتك ووفر وقتك ✨
                  </div>
                  <div className="font-bold text-[9px] text-white/85 truncate">
                    خروج فوري بضغطة زر بدون فكة ⚡
                  </div>
                </div>
              </button>
            ) : (
              /* رصيد كافٍ ومؤمن >= 30 جنيه ⬅️ تختفي الجملة التحفيزية ويظهر بادج أمان أخضر فاخر */
              <div className="flex-1 text-right flex items-center gap-1.5 bg-white/5 px-2.5 py-1.5 rounded-xl border border-white/10">
                <div className="w-5 h-5 rounded-full bg-emerald-400 flex items-center justify-center shrink-0 shadow-sm">
                  <CheckCircle2 size={11} className="text-slate-950 animate-pulse" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="font-black text-[11px] text-emerald-300 truncate">
                    رصيدك ممتاز ومؤمن! 💎
                  </div>
                  <div className="font-bold text-[9px] text-white/80 truncate">
                    جاهز للركن والخروج الذكي فوراً
                  </div>
                </div>
              </div>
            )}

            {/* 🚗 لوحة السيارة المعدنية */}
            <div
              style={{
                background: '#ffffff',
                border: '2px solid #1E293B',
                borderRadius: 8,
                boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                minWidth: '95px',
                flexShrink: 0,
              }}
            >
              <div 
                className="flex items-center justify-between px-1.5"
                style={{ height: '5px', background: 'linear-gradient(90deg, #0066FF, #0055DD)' }}
              >
                <span style={{ fontSize: '4px', color: '#fff', fontWeight: 900 }}>EGYPT</span>
                <span style={{ fontSize: '4px', color: '#fff', fontWeight: 900 }}>مصر</span>
              </div>
              
              <div 
                className="py-0.5 px-2 text-center font-black flex items-center justify-center gap-1"
                style={{ color: '#0F172A', fontSize: '11px', letterSpacing: '0.5px' }}
              >
                <span>🇪🇬</span>
                <span className="font-mono">{currentUser?.carPlate || '---'}</span>
              </div>
            </div>

          </div>
        </div>

        {/* 🚀 سجل طلبات شحن المحفظة */}
        <AnimatePresence>
          {showHistory && myTopUps.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-3 overflow-hidden"
              style={{
                background: '#ffffff',
                border: '2px solid #D0DCFF',
                borderRadius: 20,
                padding: '14px',
                boxShadow: '0 4px 12px rgba(0,102,255,0.05)',
              }}
            >
              <div className="flex justify-between items-center mb-2.5 pb-2" style={{ borderBottom: '1.5px solid #F0F4FF' }}>
                <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={16} />
                </button>
                <h3 className="font-black text-xs flex items-center gap-1.5 text-slate-800">
                  سجل شحن محفظتي <History size={13} className="text-blue-600" />
                </h3>
              </div>

              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                {myTopUps.map((topUp) => {
                  const isPending = topUp.status === 'pending';
                  const isApproved = topUp.status === 'approved';
                  return (
                    <div
                      key={topUp.id}
                      className="flex justify-between items-center p-2.5 rounded-xl border"
                      style={{
                        background: isPending ? '#FFFBF0' : isApproved ? '#F0FFF5' : '#F8FAFF',
                        borderColor: isPending ? '#FFEAA7' : isApproved ? '#B8E994' : '#E2E8F0',
                      }}
                    >
                      <div className="text-left">
                        <div className="font-black font-mono text-sm" style={{ color: isApproved ? '#2E7D32' : isPending ? '#D4AF37' : '#64748B' }}>
                          {topUp.amount} ج.م
                        </div>
                        <div className="text-[9px] text-slate-400 font-mono mt-0.5">
                          كود: {topUp.transactionId || topUp.id.substring(0, 8).toUpperCase()}
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

                        {/* شارات الحالة */}
                        <div className="shrink-0">
                          {isPending ? (
                            <span className="font-black text-[9px] px-2 py-1 rounded-lg bg-amber-100 text-amber-800 flex items-center gap-0.5 animate-pulse">
                              ⏳ معلق
                            </span>
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

        {/* 🎁 بانر ترحيبي بسيط ومبهج باللون الأبيض واللمسات الملونة المشرقة */}
        {isEligibleForFreeSession && !activeSession && !myIncomingCar && (
          <motion.div
            initial={{ opacity: 0, y: -15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full mb-3 overflow-hidden relative"
            style={{
              background: '#ffffff', // خلفية بيضاء ناصعة ونظيفة
              borderRadius: 22,
              padding: '16px',
              boxShadow: '0 10px 25px rgba(0, 102, 255, 0.05), 0 2px 6px rgba(0,0,0,0.02)',
              border: '2px solid #FFF1F2', // إطار باستيل وردي مبهج وناعم للغاية
            }}
          >
            {/* إضاءات باستيل خلفية ناعمة جداً لتعطي عمقاً مبهجاً */}
            <div className="absolute -top-10 -right-10 w-24 h-24 bg-rose-100/50 rounded-full filter blur-xl" />
            <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-amber-100/40 rounded-full filter blur-xl" />

            <div className="flex items-center gap-3.5 relative z-10">
              
              {/* أيقونة هدية مبهجة بخلفية ملونة مشمشية/وردية ناعمة */}
              <motion.div
                animate={{ rotate: [0, -5, 5, 0], scale: [1, 1.03, 1] }}
                transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #FFEDD5 0%, #FEE2E2 100%)', // تدرج هادئ ولطيف
                  border: '1.5px solid #FCA5A5',
                }}
              >
                <Gift size={22} className="text-red-500" />
              </motion.div>

              {/* نصوص منسقة ومرتبة بخطوط داكنة واضحة على الخلفية البيضاء */}
              <div className="flex-1 text-right">
                
                {/* شارة علوية لطيفة بلون أصفر هادئ */}
                <div className="flex items-center gap-1.5 justify-end mb-1">
                  <span className="font-bold text-slate-800 text-[11px]">نورت عائلتنا الجديدة! 🎉</span>
                  <span 
                    className="font-black text-[9px] px-2.5 py-0.5 rounded-full leading-none shrink-0"
                    style={{
                      background: '#FFFBEB',
                      border: '1px solid #FDE68A',
                      color: '#D97706',
                    }}
                  >
                    🎁 هدية ترحيبية
                  </span>
                </div>
                
                {/* العنوان الأساسي المبهج والواضح باللون الأحمر المشرق */}
                <h4 
                  className="font-black text-slate-900 leading-tight" 
                  style={{ fontSize: '13.5px' }}
                >
                  أول ركنة لك معنا <span className="text-red-500 font-black">مجانية بالكامل! 🕐</span>
                </h4>
                
                {/* النص الداعم اللطيف */}
                <p className="text-slate-500 font-bold leading-normal mt-1" style={{ fontSize: '10px' }}>
                  احجز الآن من التطبيق واستمتع بـ <span className="text-emerald-600 font-black">أول ساعة مجاناً 100%</span> كهدية ترحيبية مميزة لك في أول زيارة 🎈
                </p>

              </div>
            </div>
          </motion.div>
        )}
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
            className="active:scale-95 transition-all flex items-center justify-center"
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
            className="font-black text-xs active:scale-95 transition-all whitespace-nowrap flex items-center gap-1"
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
              boxShadow: '0 2px 8px rgba(124, 58, 237, 0.04)',
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
                  background: '#7C3AED',
                  color: '#fff',
                  fontSize: 10,
                  padding: '2px 8px',
                  borderRadius: 20,
                }}
              >
                {farGarages.length}
              </span>
              <h2 className="text-xs font-black flex items-center gap-1.5" style={{ color: '#5B21B6' }}>
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

      {/* 🎁 [جديد]: نافذة منبثقة ترحيبية بالهدية تعمل آلياً فور تسجيل حساب جديد */}
      <WelcomeGiftModal />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ██  WELCOME GIFT MODAL COMPONENT (مؤمن ومحمي بالكامل 🔒)
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
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[999] flex items-center justify-center p-5"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 40 }}
            className="bg-white rounded-[2rem] p-7 max-w-sm w-full text-center relative overflow-hidden"
            style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* إضاءات باستيل خلفية ناعمة */}
            <div className="absolute -top-10 -right-10 w-28 h-28 bg-rose-100/60 rounded-full filter blur-xl" />
            <div className="absolute -bottom-10 -left-10 w-28 h-28 bg-amber-100/50 rounded-full filter blur-xl" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-blue-50/40 rounded-full filter blur-2xl" />

            <button onClick={handleClose} className="absolute top-4 left-4 text-slate-300 hover:text-slate-500 transition-colors z-10">
              <X size={20} />
            </button>

            {/* أيقونة الهدية المبهجة */}
            <motion.div
              animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
              className="w-20 h-20 bg-gradient-to-br from-amber-400 to-rose-500 rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg shadow-rose-200/50 relative z-10"
            >
              <Gift size={36} className="text-white" />
            </motion.div>

            {/* العنوان المبهج */}
            <h3 className="text-2xl font-black text-slate-900 mb-2 relative z-10">
              🎉 أهلاً وسهلاً!
            </h3>
            
            <p className="text-slate-600 text-sm mb-5 leading-relaxed relative z-10 font-bold">
              نورتنا في عائلة <span className="font-black text-blue-600">Park'n 24</span> وحبينا نفرحك بهدية حلوة 🌟
            </p>

            {/* بوكس الهدية بتصميم مبهج ومشرق */}
            <div className="relative z-10 mb-6" style={{ background: 'linear-gradient(135deg, #FFF7ED 0%, #FEF3C7 50%, #FFEDD5 100%)', borderRadius: 20, padding: '18px 16px', border: '2px solid #FCD34D' }}>
              <div className="flex items-center justify-center gap-2 mb-2">
                <Sparkles size={18} className="text-amber-500 animate-pulse" />
                <span className="font-black text-amber-700" style={{ fontSize: 18 }}>أول ساعة ركنة مجاناً!</span>
                <Sparkles size={18} className="text-amber-500 animate-pulse" />
              </div>
              <p className="text-amber-600 font-bold text-xs leading-relaxed">
                احجز ركنتك الأولى من التطبيق وهنركنلك أول ساعة ببلاش تماماً 🚗✨
              </p>
            </div>

            <button
              onClick={handleClose}
              className="w-full font-black py-4 rounded-2xl text-sm active:scale-95 transition-all shadow-lg relative z-10"
              style={{ 
                background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)', 
                color: '#ffffff',
                fontWeight: 950,
                fontSize: 15,
                boxShadow: '0 6px 20px rgba(37,99,235,0.3)',
                textShadow: '0 1px 2px rgba(0,0,0,0.15)'
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
   ██  GARAGE CARD COMPONENT (تصميم بريميوم مدمج ومريح للقيادة 🚗)
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
    ? 'rgba(0,102,255,0.08)'
    : isNearby
    ? 'rgba(0,204,102,0.05)'
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
    if (hasActiveSession) return '⚡ الجلسة النشطة';
    if (hasIncomingCar) return '📍 الحجز النشط';
    if (isClosest) return 'احجز في الأقرب إليك';
    if (isNearby) return 'احجز الآن - قريب';
    return 'احجز مكانك';
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      onClick={!disabled && !isFull ? onSelect : undefined}
      className={`transition-all text-right ${
        !isFull && !disabled ? 'active:scale-[0.99] cursor-pointer' : 'cursor-not-allowed opacity-95'
      }`}
      style={{
        background: '#ffffff',
        border: `1.5px solid ${borderColor}`,
        borderRadius: 18,
        padding: '12px 14px', // ⚡ تقليل الحواف لتصغير حجم الكارت الكلي واكتساب مساحة
        boxShadow: `0 4px 14px ${glowColor}, 0 2px 4px rgba(0,0,0,0.02)`,
      }}
    >
      {/* السطر العلوي: التقييم + الاسم والشارات */}
      <div className="flex justify-between items-center mb-1.5">
        
        {/* شارات الحالة والتقييم بحجم أصغر وأكثر تناسقاً */}
        <div className="flex items-center gap-1 flex-wrap">
          <div
            className="flex items-center gap-0.5 font-black text-white"
            style={{
              background: '#FF9500',
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 8,
            }}
          >
            <Star size={9} fill="currentColor" />
            {garage.rating}
          </div>

          {isFull && (
            <span
              style={{ 
                background: '#FF3333', 
                color: '#ffffff', 
                fontSize: 10, 
                padding: '3px 8px', 
                borderRadius: 10,
                fontWeight: 950,
                textShadow: '0 1px 2px rgba(0,0,0,0.2)'
              }}
            >
              ممتلئ
            </span>
          )}

{!isBusy && isClosest && !isFull && (
  <span
    style={{ 
      background: '#0066FF', 
      color: '#ffffff',     // ⚡ خط أبيض صريح 100%
      fontWeight: 900,      // ⚡ سمك عريض جداً
      fontSize: 9.5, 
      padding: '2.5px 7px', 
      borderRadius: 8,
      boxShadow: '0 2px 6px rgba(0, 102, 255, 0.35)' // لمعة زرقاء خفيفة تبرز اللون الأبيض
    }}
  >
    📍 الأقرب
  </span>
)}
          {!isBusy && !isClosest && isNearby && !isFull && (
            <span
              style={{ 
                background: '#00CC66', 
                color: '#ffffff', 
                fontSize: 10, 
                padding: '3px 8px', 
                borderRadius: 10,
                fontWeight: 950,
                textShadow: '0 1px 2px rgba(0,0,0,0.2)'
              }}
            >
              قريب
            </span>
          )}
        </div>

        {/* اسم الجراج بخط واضح وعريض للرؤية السريعة */}
        <h3 className="text-sm font-black text-slate-900" style={{ lineHeight: 1.2 }}>
          {garage.name}
        </h3>
      </div>

      {/* الموقع الجغرافي بحجم مدمج */}
      <div className="flex items-center gap-1 justify-end mb-2 text-slate-400" style={{ fontSize: 10 }}>
        <span className="truncate max-w-[180px]">{garage.location}</span>
        <MapPin size={10} className="shrink-0" />
      </div>

      {/* السطر الحركي (وقت الوصول + الأماكن الفاضية والسعر) */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        
{/* 🕐 بوكس وقت الوصول باللون الأبيض الناصع الفاخر */}
<div
  className="flex items-center gap-1 shadow-sm shrink-0"
  style={{
    background: isNearby
      ? 'linear-gradient(135deg, #00CC66, #00AA55)'
      : 'linear-gradient(135deg, #7C3AED, #5B21B6)',
    borderRadius: 10,
    padding: '5px 10px',
    fontSize: 11,
    color: '#ffffff', // ⚡ فرض اللون الأبيض على البوكس ككل
  }}
>
  <Navigation size={12} className="rotate-45" style={{ color: '#ffffff' }} />
  <span 
    className="font-mono tracking-wider" 
    style={{ 
      color: '#ffffff', // ⚡ خط الدقائق باللون الأبيض الناصع
      fontWeight: 900,  // ⚡ خط عريض جداً (مغلظ) لسهولة القراءة السريعة
    }}
  >
    {formatDuration(garage.minutes)}
  </span>
</div>

        {/* الأماكن المتاحة والسعر */}
        <div className="flex items-center gap-2.5">
          {/* الأماكن الشاغرة */}
          <div className="flex items-center gap-1 shrink-0">
            <Car size={14} style={{ color: '#0066FF' }} />
            <span className="font-black font-mono text-sm text-blue-600">
              {garage.availableSpots}
            </span>
            <span className="text-[9px] font-bold text-slate-500">شاغر</span>
          </div>
          
          <div style={{ width: 1.5, height: 12, background: '#E2E8F0' }} />
          
          {/* السعر */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="font-black font-mono text-sm text-emerald-600">
              {garage.basePrice}
            </span>
            <span className="text-[9px] font-bold text-slate-500">ج.م/س</span>
          </div>
        </div>

      </div>

      {/* زر الحجز: تم جعله مدمجاً وأنيقاً لتوفير المساحة الرأسية */}
      <button
        disabled={isFull || disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!isFull && !disabled) onSelect();
        }}
        className="w-full font-black flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
        style={{
          background: btnBg,
          color: isFull ? '#94a3b8' : '#ffffff',
          borderRadius: 12,
          padding: '9px 0', // ⚡ تقليص حجم الزر الرأسي ليكون مدمجاً
          fontSize: 12,
          border: 'none',
          cursor: 'pointer'
        }}
      >
        <Car size={14} />
        <span>{btnLabel}</span>
      </button>
    </motion.div>
  );
}