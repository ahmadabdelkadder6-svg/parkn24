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
  QrCode,
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

// 🎨 الألوان الرسمية الموحدة لتطبيق Park'n 24 (مريحة للعين وفخمة)
const BRAND = {
  blue: '#1656b8',       // الأزرق الرسمي للوجو
  blueDark: '#0f3d85',   // كحلي داكن للنصوص والعناوين
  green: '#8cc63f',      // الأخضر الرسمي للوجو
  greenDark: '#6ea62a',  // أخضر داكن للقراءة
  bg: '#f4f7fc',         // خلفية التطبيق (رمادي هادئ جداً مريح للعين)
  card: '#ffffff',       // كروت بيضاء نظيفة
  slate: '#475569',      // لون النصوص الجانبية
  border: '#e2e8f0',     // حدود رفيعة جداً هادئة
};

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

// أيقونات المناطق هادئة وبسيطة
const AREA_ICONS: Record<string, string> = {
  'وسط البلد': '🏢',
  'مصر الجديدة': '🏰',
  'مدينة نصر': '🏙️',
  'المعادي': '🌳',
  'المهندسين': '🛍️',
  'الدقي': '🎓',
  'التجمع الخامس': '💎',
  'مناطق أخرى': '📍',
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
    walletTopUps,
  } = useStore();

  const [search, setSearch] = useState('');
  const [showNearbyOnly, setShowNearbyOnly] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false); // 📲 حالة عرض نافذة الباركود المكبرة
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
    return () => { isMountedRef.current = false; };
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
        if (currentUser.hasUsedFreeSession) { setIsAbuseDetected(true); return; }
        if (cleanUserPhone) {
          const { data: userDb } = await supabase.from('users').select('has_used_free_session').eq('phone', cleanUserPhone).maybeSingle();
          if (userDb?.has_used_free_session === true) { setIsAbuseDetected(true); return; }
        }
        const { data: sessionDb } = await supabase.from('sessions').select('id').eq('is_first_free_session', true).or(`car_plate.eq.${cleanPlate}${cleanUserPhone ? `,customer_phone.eq.${cleanUserPhone}` : ''}`).limit(1);
        if (sessionDb && sessionDb.length > 0) { setIsAbuseDetected(true); } else { setIsAbuseDetected(false); }
      } catch (err) { console.error('Error verifying welcome gift eligibility:', err); }
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
    return sessions.some((s: Session) => normalizePlate(s.carPlate) === normalizedUserPlate && s.status === 'completed');
  }, [sessions, normalizedUserPlate, activeSession]);

  const myIncomingCar = useMemo(() => {
    if (!normalizedUserPlate) return undefined;
    return incomingCars
      .filter((c: IncomingCar) => normalizePlate(c.carPlate) === normalizedUserPlate && c.status === 'coming')
      .sort((a, b) => safeParseTime(b.startTime || 0) - safeParseTime(a.startTime || 0))[0];
  }, [incomingCars, normalizedUserPlate]);

  const myTopUps = useMemo(() => {
    if (!cleanUserPhone || !walletTopUps) return [];
    return walletTopUps.filter((w) => w.userPhone === cleanUserPhone).sort((a, b) => b.timestamp - a.timestamp).slice(0, 3);
  }, [walletTopUps, cleanUserPhone]);

  const pendingTopUpsCount = useMemo(() => {
    return myTopUps.filter((w) => w.status === 'pending').length;
  }, [myTopUps]);

  const getUserLocation = useCallback(() => {
    if (!('geolocation' in navigator)) { toast.error('خدمة تحديد الموقع غير مدعومة في متصفحك'); return; }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { if (!isMountedRef.current) return; setUserLocation({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocationLoading(false); },
      () => { if (!isMountedRef.current) return; setLocationLoading(false); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  useEffect(() => { getUserLocation(); }, [getUserLocation]);

  useEffect(() => {
    if (!normalizedUserPlate) return;
    let isSubscribed = true;
    const refetch = async () => { if (!isSubscribed) return; try { await fetchAll(); } catch (e) { console.error('Realtime Fetch Error:', e); } };
    const isMyRow = (row: any): boolean => {
      if (!row) return false;
      const plate = normalizePlate(row.car_plate || row.carPlate);
      const phone = (row.customer_phone || row.customerPhone || '').replace(/[^\d+]/g, '');
      return plate === normalizedUserPlate || Boolean(cleanUserPhone && phone === cleanUserPhone);
    };
    const channel = supabase.channel(`customer-realtime-${normalizedUserPlate}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, (payload) => { if (isMyRow(payload.new) || isMyRow(payload.old)) refetch(); })
      .subscribe();
    const interval = setInterval(refetch, 10000);
    const handleVisibility = () => { if (document.visibilityState === 'visible') refetch(); };
    const handleFocus = () => refetch();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    return () => { isSubscribed = false; clearInterval(interval); document.removeEventListener('visibilitychange', handleVisibility); window.removeEventListener('focus', handleFocus); supabase.removeChannel(channel); };
  }, [normalizedUserPlate, cleanUserPhone, fetchAll]);

  useEffect(() => {
    if (!activeSession) { autoNavigatedRef.current = null; return; }
    if (autoNavigatedRef.current === activeSession.id) return;
    autoNavigatedRef.current = activeSession.id;
    setSelectedGarageId(activeSession.garageId);
    setScreen('session');
    toast.success('بدأت جلسة الركن! ⏱️', { icon: '🚗', duration: 3000 });
  }, [activeSession, setSelectedGarageId, setScreen]);

  const garagesWithDistance: GarageWithDistance[] = useMemo(() => {
    return garages.filter((g) => g.isActive !== false).map((garage) => {
      const distance = calculateDistance(userLocation.lat, userLocation.lng, garage.lat, garage.lng);
      const minutes = distanceToMinutes(distance);
      return { ...garage, distance, minutes, classification: classifyDistance(minutes) };
    }).sort((a, b) => a.minutes - b.minutes);
  }, [garages, userLocation]);

  const filteredGarages = useMemo(() => {
    let filtered = garagesWithDistance;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((g) => g.name.toLowerCase().includes(q) || g.location.toLowerCase().includes(q) || (g.area || '').toLowerCase().includes(q));
    }
    if (showNearbyOnly) { filtered = filtered.filter((g) => g.classification === 'nearby'); }
    return filtered;
  }, [garagesWithDistance, search, showNearbyOnly]);

  const areaGroups = useMemo(() => {
    const groups: Record<string, GarageWithDistance[]> = {};
    filteredGarages.forEach(g => { const zone = (g as any).area || 'مناطق أخرى'; if (!groups[zone]) groups[zone] = []; groups[zone].push(g); });
    return Object.keys(groups).map(name => ({
      name, garages: groups[name],
      totalCapacity: groups[name].reduce((sum, g) => sum + (g.capacity || 0), 0),
    })).sort((a, b) => { if (a.name === 'مناطق أخرى') return 1; if (b.name === 'مناطق أخرى') return -1; return a.name.localeCompare(b.name, 'ar'); });
  }, [filteredGarages]);

  useEffect(() => { if (search.trim() && areaGroups.length > 0) setExpandedArea(areaGroups[0].name); }, [search, areaGroups]);

  const handleDirectBooking = async (garage: GarageWithDistance) => {
    if (!currentUser) { toast.error('سجل بياناتك أولاً'); return; }
    if (activeSession) { setSelectedGarageId(activeSession.garageId); setScreen('session'); return; }
    if (myIncomingCar) { setSelectedGarageId(myIncomingCar.garageId); setScreen('navigation'); return; }
    if (offers.some((o) => o.userId === currentUser.phone && o.status === 'pending')) { toast.error('لديك عرض معلق بالفعل'); return; }
    if (garage.availableSpots <= 0) { toast.error('لا توجد أماكن متاحة حالياً'); return; }
    const userWallet = currentUser.wallet || 0;
    if (garage.payment_mode === 'wallet' && userWallet <= 0 && !isEligibleForFreeSession) { toast.error('عذراً، هذا الجراج يقبل الدفع بالمحفظة فقط. يرجى شحن محفظتك للمتابعة.'); setShowTopUp(true); return; }
    try {
      setIsBooking(true); setSelectedGarageId(garage.id);
      await addIncomingCar({ garageId: garage.id, carPlate: currentUser.carPlate, customerName: currentUser.name, customerPhone: currentUser.phone, agreedPrice: garage.basePrice, estimatedArrival: Math.max(3, garage.minutes) });
      toast.success(`تم الحجز بنجاح 🚗`);
      setScreen('navigation');
    } catch (e) { console.error(e); toast.error('حدث خطأ أثناء إتمام الحجز'); } finally { setIsBooking(false); }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: BRAND.bg, color: BRAND.blueDark }}>

      {/* ═══ HEADER ═══ */}
      <div className="px-5 pt-10 pb-4 z-10" style={{ background: BRAND.card, borderBottom: `1px solid ${BRAND.border}` }}>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-lg font-black" style={{ color: BRAND.blueDark }}>
              أهلاً {currentUser?.name || 'بك'} 👋
            </h1>
            <p className="text-xs font-semibold mt-0.5" style={{ color: BRAND.slate }}>
              اركن وادفع بضغطة واحدة.. بدون لفة وبدون فكة 🚗
            </p>
          </div>
          <span className="font-black text-xl" style={{ color: BRAND.blue }}>
            بركن <span style={{ color: BRAND.green }}>24</span>
          </span>
        </div>

        {/* 💳 بطاقة المحفظة المبسطة والراقية جداً */}
        <div
          style={{
            background: BRAND.blue,
            borderRadius: 18,
            padding: '16px',
            marginBottom: 12,
            boxShadow: '0 4px 16px rgba(22,86,184,0.12)',
            color: '#ffffff',
          }}
        >
          <div className="flex justify-between items-center">
            <div>
              <span className="text-[10px] font-bold opacity-80 block mb-1">💳 رصيد محفظتك الحالي</span>
              <div className="font-black font-mono flex items-baseline gap-1" style={{ fontSize: 28 }}>
                {currentUser?.wallet || 0}
                <span className="text-xs font-bold opacity-70">ج.م</span>
              </div>
            </div>

            <div className="flex gap-2">
              {myTopUps.length > 0 && (
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="p-2.5 rounded-xl transition-all relative border border-white/20 bg-white/10 text-white cursor-pointer"
                >
                  <History size={16} />
                  {pendingTopUpsCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400" />
                  )}
                </button>
              )}

              <button
                onClick={() => setShowTopUp(true)}
                className="flex items-center gap-1 font-black active:scale-95 transition-all text-xs cursor-pointer border-0"
                style={{ background: '#ffffff', color: BRAND.blue, borderRadius: 10, padding: '8px 14px' }}
              >
                <Plus size={13} strokeWidth={3} />
                <span>شحن رصيد</span>
              </button>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
            <span className="text-[10px] font-bold opacity-80">🚙 رقم السيارة:</span>
            <span className="font-mono font-black text-xs bg-white/15 px-3 py-1 rounded-lg">
              {currentUser?.carPlate || '---'}
            </span>
          </div>
        </div>

        {/* سجل الشحن المبسط */}
        <AnimatePresence>
          {showHistory && myTopUps.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-3 overflow-hidden border-b pb-3"
              style={{ borderColor: BRAND.border }}
            >
              <div className="flex justify-between items-center mb-2.5">
                <span className="text-[11px] font-black" style={{ color: BRAND.slate }}>سجل الشحن الأخير:</span>
                <button onClick={() => setShowHistory(false)} className="border-0 bg-transparent cursor-pointer" style={{ color: BRAND.slate }}><X size={14} /></button>
              </div>
              <div className="space-y-1.5">
                {myTopUps.map((topUp) => (
                  <div key={topUp.id} className="flex justify-between items-center text-xs p-2 rounded-lg bg-slate-50 border" style={{ borderColor: BRAND.border }}>
                    <span className="font-bold">{topUp.amount} ج.م</span>
                    <span className="font-bold opacity-75">{topUp.status === 'pending' ? '⏳ معلق' : topUp.status === 'approved' ? '✅ تم' : '❌ مرفوض'}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* بانر الهدية الترحيبية الهادئ */}
        {isEligibleForFreeSession && !activeSession && !myIncomingCar && (
          <div
            className="mb-3 p-3 rounded-16 flex items-center gap-2.5"
            style={{ background: BRAND.green + '15', border: `1px solid ${BRAND.green}40` }}
          >
            <Gift size={16} style={{ color: BRAND.greenDark }} />
            <div className="text-right">
              <span className="text-[11px] font-black block" style={{ color: BRAND.greenDark }}>هدية ترحيبية نشطة لزيارتك الأولى! 🎉</span>
              <span className="text-[10px] font-medium" style={{ color: BRAND.slate }}>ركنتك الأولى معنا تمنحك أول 30 دقيقة مجانية بالكامل.</span>
            </div>
          </div>
        )}

        {/* الجلسة النشطة */}
        {activeSession && (
          <button
            onClick={() => { setSelectedGarageId(activeSession.garageId); setScreen('session'); }}
            className="w-full mb-3 flex items-center justify-between px-4 py-3 rounded-16 border-0 text-white cursor-pointer active:scale-98 transition-all"
            style={{ background: BRAND.greenDark }}
          >
            <span className="text-xs font-black">عرض التفاصيل ←</span>
            <span className="text-xs font-black flex items-center gap-1">🚙 لديك جلسة ركن نشطة الآن</span>
          </button>
        )}

        {/* حجز نشط في الطريق */}
        {!activeSession && myIncomingCar && (
          <button
            onClick={() => { setSelectedGarageId(myIncomingCar.garageId); setScreen('navigation'); }}
            className="w-full mb-3 flex items-center justify-between px-4 py-3 rounded-16 border-0 text-white cursor-pointer active:scale-98 transition-all"
            style={{ background: BRAND.blue }}
          >
            <span className="text-xs font-black">فتح الخريطة التوجيهية ←</span>
            <span className="text-xs font-black flex items-center gap-1">📍 حجز نشط (في الطريق)</span>
          </button>
        )}

        {/* شريط البحث الموحد المريح للعين */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: BRAND.slate }} />
            <input
              className="w-full outline-none text-xs font-bold"
              style={{
                background: BRAND.bg,
                border: `1px solid ${BRAND.border}`,
                padding: '10px 32px 10px 12px',
                borderRadius: 12,
                color: BRAND.blueDark,
              }}
              placeholder="ابحث باسم الجراج أو المنطقة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            onClick={getUserLocation}
            disabled={locationLoading}
            className="flex items-center justify-center border-0 cursor-pointer"
            style={{
              background: BRAND.blue,
              color: '#fff',
              borderRadius: 12,
              width: 38,
              height: 38,
            }}
          >
            <Locate size={16} className={locationLoading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => setShowNearbyOnly(!showNearbyOnly)}
            className="text-xs font-black px-3 rounded-12 border cursor-pointer"
            style={{
              background: showNearbyOnly ? BRAND.blue : BRAND.card,
              color: showNearbyOnly ? '#fff' : BRAND.slate,
              borderColor: BRAND.border,
            }}
          >
            {showNearbyOnly ? 'عرض الكل' : 'القريب فقط'}
          </button>
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-8">

        {/* أزرار المساعدة والباركود */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          {hasCompletedSession && (
            <button
              onClick={() => setScreen('lastSession')}
              className="flex items-center justify-center gap-2 py-2.5 rounded-12 border cursor-pointer text-xs font-bold"
              style={{ background: BRAND.card, borderColor: BRAND.border, color: BRAND.blueDark }}
            >
              <Receipt size={14} />
              <span>إيصال آخر ركنة</span>
            </button>
          )}

          <button
            onClick={() => setScreen('chat')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-12 border cursor-pointer text-xs font-bold ${!hasCompletedSession ? 'col-span-2' : ''}`}
            style={{ background: BRAND.card, borderColor: BRAND.border, color: BRAND.blueDark }}
          >
            <MessageCircle size={14} />
            <span>الدعم والشكاوى</span>
          </button>
        </div>

        {/* 📲 كارت الباركود الذكي لمشاركة التطبيق والتعرف السريع */}
        <div 
          onClick={() => setShowQrModal(true)}
          className="mb-4 border rounded-2xl p-3 flex items-center justify-between text-right cursor-pointer active:scale-[0.98] transition-all"
          style={{ 
            background: BRAND.card, 
            borderColor: BRAND.border,
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
          }}
        >
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 p-1 rounded-xl bg-white border flex items-center justify-center shrink-0 shadow-sm"
              style={{ borderColor: BRAND.blue }}
            >
              <img 
                src="/app-qr.png" 
                alt="كود بركن 24" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  // Fallback بسيط في حال عدم رفع الصورة بعد
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>

            <div className="text-right">
              <span className="text-[9px] font-black px-2 py-0.5 rounded text-white inline-block mb-0.5" style={{ background: BRAND.blue }}>
                📲 كود بركن 24
              </span>
              <h4 className="text-xs font-black" style={{ color: BRAND.blueDark }}>
                باركود المسح والتعرف السريع
              </h4>
              <p className="text-[10px] font-bold mt-0.5" style={{ color: BRAND.slate }}>
                اضغط لتكبير الكود لمسحه عند الوصول للساس ✨
              </p>
            </div>
          </div>
          <QrCode size={18} style={{ color: BRAND.blue }} className="shrink-0" />
        </div>

        {/* ═══ القائمة والأكورديون النظيف المبسط جداً ═══ */}
        {areaGroups.length > 0 ? (
          <div className="space-y-2.5">
            {areaGroups.map((group) => {
              const isExpanded = expandedArea === group.name;
              const totalAvailableSpots = group.garages.reduce((sum, g) => sum + (g.availableSpots || 0), 0);

              return (
                <div
                  key={group.name}
                  style={{
                    background: BRAND.card,
                    borderRadius: 14,
                    border: `1px solid ${BRAND.border}`,
                    overflow: 'hidden',
                  }}
                >
                  {/* شريط المنطقة */}
                  <button
                    onClick={() => setExpandedArea(isExpanded ? null : group.name)}
                    className="w-full p-4 flex items-center justify-between text-right bg-transparent border-none cursor-pointer outline-none"
                  >
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-black font-mono px-2 py-1 rounded bg-slate-100" style={{ color: BRAND.slate }}>
                        {group.garages.length}
                      </span>
                      <ChevronDown size={16} style={{ color: BRAND.slate, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    </div>

                    <div className="text-right">
                      <span className="font-black text-sm block" style={{ color: BRAND.blueDark }}>
                        {AREA_ICONS[group.name] || '📍'} {group.name}
                      </span>
                      <span className="text-[10px] font-bold block mt-0.5" style={{ color: totalAvailableSpots > 0 ? BRAND.greenDark : BRAND.slate }}>
                        {totalAvailableSpots > 0 ? `🚗 متاح حالياً ${totalAvailableSpots} ركنة شاغرة` : '❌ ممتلئ بالكامل حالياً'}
                      </span>
                    </div>
                  </button>

                  {/* قائمة الجراجات تحت المنطقة عند الفتح */}
                  {isExpanded && (
                    <div style={{ background: BRAND.bg, padding: '10px', borderTop: `1px solid ${BRAND.border}` }} className="space-y-2">
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
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 text-slate-400">
            <p className="text-sm font-bold">لا توجد نتائج مطابقة للبحث</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showTopUp && <TopUpWalletModal onClose={() => setShowTopUp(false)} />}
      </AnimatePresence>

      {/* 📲 نافذة تكبير الباركود المسموح بمسحها من كاميرا السايس */}
      <AnimatePresence>
        {showQrModal && (
          <div 
            className="fixed inset-0 z-[9999] flex items-center justify-center p-5"
            style={{ background: 'rgba(10,22,40,0.75)', backdropFilter: 'blur(6px)' }}
            onClick={() => setShowQrModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              className="rounded-3xl p-6 text-center max-w-xs w-full shadow-2xl relative"
              style={{ background: BRAND.card }}
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setShowQrModal(false)}
                className="absolute top-4 left-4 text-slate-400 font-black text-sm border-0 bg-transparent cursor-pointer"
              >
                ✕
              </button>

              <h3 className="text-sm font-black mb-1" style={{ color: BRAND.blueDark }}>
                📲 باركود بركن 24
              </h3>
              <p className="text-[10px] font-bold mb-4" style={{ color: BRAND.slate }}>
                امسح الكود عبر كاميرا الموبايل لفتح التطبيق
              </p>

              <div className="w-48 h-48 mx-auto p-2 bg-white rounded-2xl border-2 shadow-inner flex items-center justify-center mb-4" style={{ borderColor: BRAND.border }}>
                <img 
                  src="/app-qr.png" 
                  alt="QR Code" 
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    // رسالة بديلة توضيحية في حال عدم توفر الصورة
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>

              <button
                onClick={() => setShowQrModal(false)}
                className="w-full py-3 rounded-xl font-black text-xs text-white border-0 cursor-pointer active:scale-95 transition-all"
                style={{ background: BRAND.blue }}
              >
                إغلاق
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <WelcomeGiftModal />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ██  WELCOME GIFT MODAL (MINIMALIST)
   ════════════════════════════════════════════════════════════ */
function WelcomeGiftModal() {
  const [show, setShow] = useState(false);
  const currentUser = useStore((s) => s.currentUser);

  useEffect(() => {
    const hasGiftFlag = localStorage.getItem('showWelcomeGift');
    if (hasGiftFlag === 'true' && currentUser && !currentUser.hasUsedFreeSession) { setShow(true); }
    else { localStorage.removeItem('showWelcomeGift'); setShow(false); }
  }, [currentUser]);

  const handleClose = () => { localStorage.removeItem('showWelcomeGift'); setShow(false); };

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-5" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }} onClick={handleClose}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="p-6 max-w-sm w-full text-center relative"
            style={{ background: BRAND.card, borderRadius: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: BRAND.green + '20' }}>
              <Gift size={24} style={{ color: BRAND.greenDark }} />
            </div>

            <h3 className="text-lg font-black mb-1" style={{ color: BRAND.blueDark }}>🎁 ركنتك الأولى مجانية!</h3>
            <p className="text-xs font-bold leading-relaxed mb-4" style={{ color: BRAND.slate }}>
              نورت عائلة <span style={{ color: BRAND.blue }}>Park'n 24</span>. استمتع بخصم كامل على أول 30 دقيقة من ركنتك الأولى معنا كهدية ترحيبية.
            </p>

            <button
              onClick={handleClose}
              className="w-full py-3 rounded-12 font-black border-0 cursor-pointer text-white text-xs"
              style={{ background: BRAND.blue }}
            >
              جاهز للبدء 🚀
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* ════════════════════════════════════════════════════════════
   ██  GARAGE CARD (CLEAN & SIMPLE)
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
    if (isFull) return BRAND.border;
    if (isBusy) return BRAND.green;
    return BRAND.blue;
  })();

  const btnLabel = (() => {
    if (isFull) return 'ممتلئ';
    if (hasActiveSession) return 'الجلسة النشطة ⚡';
    if (hasIncomingCar) return 'الحجز النشط 📍';
    return 'احجز الآن';
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      onClick={!disabled && !isFull ? onSelect : undefined}
      className="p-3 text-right"
      style={{
        background: BRAND.card,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 14,
        cursor: isFull ? 'not-allowed' : 'pointer',
      }}
    >
      {/* سطر الاسم + التقييم + طريقة الدفع */}
      <div className="flex justify-between items-center mb-1">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="flex items-center gap-0.5 text-[10px] font-black px-1.5 py-0.5 rounded" style={{ background: '#fef3c7', color: '#b45309' }}>
            <Star size={8} fill="currentColor" /> {garage.rating}
          </span>

          {/* 💰 طريقة الدفع واضحة من الخارج */}
          {garage.payment_mode === 'cash' && (
            <span className="text-[9px] font-black px-2 py-0.5 rounded" style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
              💵 نقدي
            </span>
          )}
          {garage.payment_mode === 'wallet' && (
            <span className="text-[9px] font-black px-2 py-0.5 rounded" style={{ background: '#f0f5ff', color: BRAND.blue, border: `1px solid ${BRAND.border}` }}>
              👝 محفظة
            </span>
          )}
          {garage.payment_mode === 'both' && (
            <span className="text-[9px] font-black px-2 py-0.5 rounded" style={{ background: '#f0fdf4', color: BRAND.greenDark, border: `1px solid #bbf7d0` }}>
              💵👝 نقدي ومحفظة
            </span>
          )}
        </div>
        <h4 className="text-xs font-black" style={{ color: BRAND.blueDark }}>{garage.name}</h4>
      </div>

      {/* الموقع */}
      <div className="flex items-center gap-1 justify-end text-[10px] mb-2" style={{ color: BRAND.slate }}>
        <span>{garage.location}</span>
        <MapPin size={10} />
      </div>

      {/* البيانات: الوقت + الشاغر + السعر */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: BRAND.border }}>
        <div className="flex items-center gap-1 text-[10px] font-bold" style={{ color: BRAND.slate }}>
          <Navigation size={10} className="rotate-45" />
          <span>{formatDuration(garage.minutes)}</span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <span className="font-mono font-black" style={{ color: BRAND.blue }}>{garage.availableSpots}</span>
            <span className="text-[10px] font-semibold" style={{ color: BRAND.slate }}>شاغر</span>
          </div>
          <div className="flex items-center gap-0.5">
            <span className="font-mono font-black" style={{ color: BRAND.greenDark }}>{garage.basePrice}</span>
            <span className="text-[10px] font-semibold" style={{ color: BRAND.slate }}>ج.م/س</span>
          </div>
        </div>
      </div>

      {/* زر الحجز */}
      <button
        disabled={isFull || disabled}
        className="w-full border-0 font-black py-2.5 rounded-10 mt-3 text-xs text-white cursor-pointer"
        style={{ background: btnBg }}
      >
        {btnLabel}
      </button>
    </motion.div>
  );
});