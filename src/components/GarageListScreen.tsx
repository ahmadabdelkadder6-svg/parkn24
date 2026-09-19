import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
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
  ChevronDown,
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

/* ════════════════════════════════════════════════════════════
   🎨 PARK'N 24 BRAND DESIGN SYSTEM
   ════════════════════════════════════════════════════════════ */
const BRAND = {
  blue: '#1656b8',
  blueDark: '#0f4a9e',
  blueLight: '#e8f0fe',
  blueSoft: '#f0f5ff',
  green: '#8cc63f',
  greenDark: '#6fa832',
  greenLight: '#f2fae6',
  navy: '#0a1628',
  slate: '#64748b',
  slateMuted: '#94a3b8',
  border: '#dce5f4',
  borderActive: '#b8ccee',
  card: '#ffffff',
  bg: '#f4f7fc',
  surface: '#f8fafe',
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

const AREA_THEMES: Record<string, { icon: string; gradient: string; solid: string; light: string; border: string }> = {
  'وسط البلد':      { icon: '🏢', gradient: `linear-gradient(135deg, ${BRAND.blue}, #3b7dd8)`, solid: BRAND.blue, light: BRAND.blueLight, border: BRAND.borderActive },
  'مصر الجديدة':    { icon: '🏰', gradient: 'linear-gradient(135deg, #e85d6f, #c0392b)', solid: '#c0392b', light: '#fdf2f2', border: '#f5c6cb' },
  'مدينة نصر':     { icon: '🏙️', gradient: 'linear-gradient(135deg, #7c5cbf, #5b3e9e)', solid: '#6c47b8', light: '#f3effb', border: '#d4c4f0' },
  'المعادي':       { icon: '🌳', gradient: `linear-gradient(135deg, ${BRAND.green}, ${BRAND.greenDark})`, solid: BRAND.greenDark, light: BRAND.greenLight, border: '#c8e6a0' },
  'المهندسين':     { icon: '🛍️', gradient: 'linear-gradient(135deg, #e8a030, #d48920)', solid: '#d48920', light: '#fef8ec', border: '#f5dfa8' },
  'الدقي':         { icon: '🎓', gradient: `linear-gradient(135deg, #2e8bc0, ${BRAND.blue})`, solid: '#2e8bc0', light: '#edf6fc', border: '#a8d4ee' },
  'التجمع الخامس': { icon: '💎', gradient: 'linear-gradient(135deg, #20a4b4, #177e8a)', solid: '#1a909e', light: '#e8f8f9', border: '#a0dce4' },
  'مناطق أخرى':    { icon: '📍', gradient: 'linear-gradient(135deg, #7b8ca6, #5a6b80)', solid: '#6b7d95', light: '#f0f3f7', border: '#c8d0dc' },
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
      (p) => { if (!isMountedRef.current) return; setUserLocation({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocationLoading(false); toast.success('تم تحديد موقعك بنجاح 📍'); },
      () => { if (!isMountedRef.current) return; setLocationLoading(false); toast.error('تعذر تحديد موقعك بدقة، استخدام الموقع الافتراضي'); },
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
      name, theme: getAreaTheme(name), garages: groups[name],
      totalCapacity: groups[name].reduce((sum, g) => sum + (g.capacity || 0), 0),
    })).sort((a, b) => { if (a.name === 'مناطق أخرى') return 1; if (b.name === 'مناطق أخرى') return -1; return a.name.localeCompare(b.name, 'ar'); });
  }, [filteredGarages]);

  useEffect(() => { if (search.trim() && areaGroups.length > 0) setExpandedArea(areaGroups[0].name); }, [search, areaGroups]);

  const handleDirectBooking = async (garage: GarageWithDistance) => {
    if (!currentUser) { toast.error('سجل بياناتك أولاً'); return; }
    if (activeSession) { setSelectedGarageId(activeSession.garageId); setScreen('session'); toast('لديك جلسة ركن نشطة بالفعل! 🚗', { icon: '⚡' }); return; }
    if (myIncomingCar) { setSelectedGarageId(myIncomingCar.garageId); setScreen('navigation'); toast('لديك حجز نشط بالفعل! 📍', { icon: '🚗' }); return; }
    if (offers.some((o) => o.userId === currentUser.phone && o.status === 'pending')) { toast.error('لديك عرض معلق بالفعل'); return; }
    if (garage.availableSpots <= 0) { toast.error('لا توجد أماكن متاحة حالياً'); return; }
    const userWallet = currentUser.wallet || 0;
    if (garage.payment_mode === 'wallet' && userWallet <= 0 && !isEligibleForFreeSession) { toast.error('عذراً، هذا الجراج يقبل الدفع بالمحفظة فقط. يرجى شحن محفظتك للمتابعة.'); setShowTopUp(true); return; }
    try {
      setIsBooking(true); setSelectedGarageId(garage.id);
      await addIncomingCar({ garageId: garage.id, carPlate: currentUser.carPlate, customerName: currentUser.name, customerPhone: currentUser.phone, agreedPrice: garage.basePrice, estimatedArrival: Math.max(3, garage.minutes) });
      toast.success(`تم الحجز في ${garage.name} بسعر ${garage.basePrice} ج.م/ساعة 🚗`);
      setScreen('navigation');
    } catch (e) { console.error(e); toast.error('حدث خطأ أثناء إتمام الحجز'); } finally { setIsBooking(false); }
  };

  /* ════════════════════════════════════════════════════════════
     🎨 PREMIUM UI RENDER
     ════════════════════════════════════════════════════════════ */
  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: BRAND.bg, color: BRAND.navy }}>

      {/* ═══════════════ HEADER ═══════════════ */}
      <div className="px-4 pt-10 pb-3 z-10" style={{ background: BRAND.card, boxShadow: '0 1px 12px rgba(22,86,184,0.06)' }}>

        {/* الترحيب واللوجو */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-xl font-black" style={{ color: BRAND.navy }}>
              أهلاً {currentUser?.name || 'بك'} 👋
            </h1>
            <p className="text-xs font-bold mt-0.5" style={{ color: BRAND.slateMuted }}>
              ابحث عن أقرب مكان ركن لسيارتك
            </p>
          </div>
          <img
            src="/images/logo.png"
            alt="بركن"
            className="w-12 h-12 object-contain"
            style={{
              borderRadius: 16,
              boxShadow: `0 4px 16px ${BRAND.blue}18`,
              border: `2px solid ${BRAND.blueLight}`,
            }}
          />
        </div>

        {/* ═══ بطاقة المحفظة الفاخرة ═══ */}
        <div
          style={{
            background: `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueDark} 50%, #0d3d85 100%)`,
            borderRadius: 22,
            padding: '16px',
            marginBottom: 12,
            boxShadow: `0 8px 28px ${BRAND.blue}35`,
            color: '#ffffff',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* زخرفة ضوئية */}
          <div style={{ position: 'absolute', top: '-40%', left: '-15%', width: 110, height: 110, background: 'rgba(255,255,255,0.1)', borderRadius: '50%', filter: 'blur(30px)' }} />
          <div style={{ position: 'absolute', bottom: '-30%', right: '-10%', width: 90, height: 90, background: `${BRAND.green}25`, borderRadius: '50%', filter: 'blur(25px)' }} />

          <div className="flex justify-between items-center relative z-10 mb-3">
            <div>
              <div className="text-[9px] font-black tracking-widest flex items-center gap-1" style={{ opacity: 0.85 }}>
                <span>💳 رصيد محفظتك</span>
                <span className="w-1.5 h-1.5 rounded-full animate-ping" style={{ background: BRAND.green }} />
              </div>
              <div className="font-black font-mono flex items-baseline gap-1" style={{ fontSize: 24, lineHeight: 1.1, textShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                {currentUser?.wallet || 0}
                <span className="text-[10px] font-bold" style={{ opacity: 0.9 }}>ج.م</span>
              </div>
            </div>

            <div className="flex gap-2 items-center">
              {myTopUps.length > 0 && (
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="flex items-center justify-center p-2.5 rounded-xl transition-all relative"
                  style={{ background: showHistory ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)', color: '#ffffff', border: '1.5px solid rgba(255,255,255,0.2)' }}
                  title="سجل العمليات"
                >
                  <History size={16} />
                  {pendingTopUpsCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 rounded-full font-black text-[9px] flex items-center justify-center animate-bounce" style={{ background: '#f59e0b', color: BRAND.navy }}>
                      {pendingTopUpsCount}
                    </span>
                  )}
                </button>
              )}

              <button
                onClick={() => setShowTopUp(true)}
                className="flex items-center gap-1 font-black active:scale-95 transition-all"
                style={{ background: '#ffffff', color: BRAND.blue, borderRadius: 12, padding: '8px 14px', fontSize: 12, boxShadow: '0 4px 14px rgba(255,255,255,0.25)' }}
              >
                <Plus size={14} strokeWidth={3} />
                <span>اشحن الآن</span>
              </button>
            </div>
          </div>

          {/* قسم النصيحة السفلي */}
          <div className="pt-2.5 border-t border-white/15 flex items-center justify-between gap-2 relative z-10">
            {(!currentUser?.wallet || currentUser.wallet < 30) ? (
              <button
                onClick={() => setShowTopUp(true)}
                className="flex-1 text-right flex items-center gap-1.5 active:scale-95 transition-all px-2.5 py-1.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 shadow-sm" style={{ background: '#f59e0b' }}>
                  <Zap size={11} className="fill-slate-950 text-slate-950" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="font-black text-[11px] truncate" style={{ color: '#fcd34d' }}>ادفع نقدي او اشحن محفظتك ووفر وقتك ✨</div>
                  <div className="font-bold text-[9px] truncate" style={{ color: 'rgba(255,255,255,0.75)' }}>خروج فوري بضغطة زر بدون فكة ⚡</div>
                </div>
              </button>
            ) : (
              <div className="flex-1 text-right flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 shadow-sm" style={{ background: BRAND.green }}>
                  <CheckCircle2 size={11} style={{ color: BRAND.navy }} className="animate-pulse" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="font-black text-[11px] truncate" style={{ color: BRAND.green }}>رصيدك ممتاز ومؤمن! 💎</div>
                  <div className="font-bold text-[9px] truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>جاهز للركن والخروج الذكي فوراً</div>
                </div>
              </div>
            )}

            {/* لوحة السيارة */}
            <div style={{ background: '#ffffff', border: `2px solid ${BRAND.navy}`, borderRadius: 8, boxShadow: '0 4px 10px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 95, flexShrink: 0 }}>
              <div className="flex items-center justify-between px-1.5" style={{ height: 5, background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.blueDark})` }}>
                <span style={{ fontSize: 4, color: '#fff', fontWeight: 900 }}>EGYPT</span>
                <span style={{ fontSize: 4, color: '#fff', fontWeight: 900 }}>مصر</span>
              </div>
              <div className="py-0.5 px-2 text-center font-black flex items-center justify-center gap-1" style={{ color: BRAND.navy, fontSize: 11, letterSpacing: '0.5px' }}>
                <span>🇪🇬</span>
                <span className="font-mono">{currentUser?.carPlate || '---'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ سجل شحن المحفظة ═══ */}
        <AnimatePresence>
          {showHistory && myTopUps.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-3 overflow-hidden"
              style={{ background: BRAND.card, border: `2px solid ${BRAND.border}`, borderRadius: 20, padding: 14, boxShadow: `0 4px 12px ${BRAND.blue}08` }}
            >
              <div className="flex justify-between items-center mb-2.5 pb-2" style={{ borderBottom: `1.5px solid ${BRAND.blueSoft}` }}>
                <button onClick={() => setShowHistory(false)} className="hover:opacity-70 transition-opacity" style={{ color: BRAND.slateMuted }}><X size={16} /></button>
                <h3 className="font-black text-xs flex items-center gap-1.5" style={{ color: BRAND.navy }}>سجل شحن محفظتي <History size={13} style={{ color: BRAND.blue }} /></h3>
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
                        background: isPending ? '#fffbf0' : isApproved ? BRAND.greenLight : BRAND.blueSoft,
                        borderColor: isPending ? '#fde68a' : isApproved ? '#a7d87a' : BRAND.border,
                      }}
                    >
                      <div className="text-left">
                        <div className="font-black font-mono text-sm" style={{ color: isApproved ? BRAND.greenDark : isPending ? '#b8860b' : BRAND.slate }}>{topUp.amount} ج.م</div>
                        <div className="text-[9px] font-mono mt-0.5" style={{ color: BRAND.slateMuted }}>كود: {topUp.transactionId || topUp.id.substring(0, 8).toUpperCase()}</div>
                      </div>
                      <div className="text-right flex items-center gap-2">
                        <div>
                          <div className="font-black text-[10px]" style={{ color: BRAND.navy }}>{topUp.method === 'instapay' ? '📱 إنستاباي' : '📲 محفظة كاش'}</div>
                          <div className="text-[9px] font-bold mt-0.5" style={{ color: BRAND.slateMuted }}>{new Date(topUp.timestamp).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                        <div className="shrink-0">
                          {isPending ? (
                            <span className="font-black text-[9px] px-2 py-1 rounded-lg flex items-center gap-0.5 animate-pulse" style={{ background: '#fef3c7', color: '#92400e' }}>⏳ معلق</span>
                          ) : isApproved ? (
                            <span className="font-black text-[9px] px-2 py-1 rounded-lg flex items-center gap-0.5" style={{ background: BRAND.greenLight, color: BRAND.greenDark }}><CheckCircle2 size={10} /> تم</span>
                          ) : (
                            <span className="font-black text-[9px] px-2 py-1 rounded-lg flex items-center gap-0.5" style={{ background: '#fef2f2', color: '#b91c1c' }}><XCircle size={10} /> مرفوض</span>
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

        {/* ═══ بانر الهدية الترحيبية ═══ */}
        {isEligibleForFreeSession && !activeSession && !myIncomingCar && (
          <motion.div
            initial={{ opacity: 0, y: -15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full mb-3 overflow-hidden relative"
            style={{
              background: BRAND.card,
              borderRadius: 22,
              padding: 16,
              boxShadow: `0 8px 24px ${BRAND.blue}08`,
              border: '2px solid #fce7e9',
            }}
          >
            <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full filter blur-xl" style={{ background: 'rgba(252,165,165,0.15)' }} />
            <div className="absolute -bottom-10 -left-10 w-24 h-24 rounded-full filter blur-xl" style={{ background: 'rgba(253,230,138,0.15)' }} />
            <div className="flex items-center gap-3.5 relative z-10">
              <motion.div
                animate={{ rotate: [0, -5, 5, 0], scale: [1, 1.03, 1] }}
                transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, #FFEDD5, #FEE2E2)', border: '1.5px solid #FCA5A5' }}
              >
                <Gift size={22} className="text-red-500" />
              </motion.div>
              <div className="flex-1 text-right">
                <div className="flex items-center gap-1.5 justify-end mb-1">
                  <span className="font-bold text-[11px]" style={{ color: BRAND.navy }}>نورت عائلتنا الجديدة! 🎉</span>
                  <span className="font-black text-[9px] px-2.5 py-0.5 rounded-full leading-none shrink-0" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309' }}>🎁 هدية ترحيبية</span>
                </div>
                <h4 className="font-black leading-tight" style={{ fontSize: 13.5, color: BRAND.navy }}>
                  أول ركنة لك معنا <span className="text-red-500 font-black">مجانية بالكامل! 🎁</span>
                </h4>
                <p className="font-bold leading-normal mt-1" style={{ fontSize: 10, color: BRAND.slate }}>
                  احجز الآن من التطبيق واستمتع بـ <span className="font-black" style={{ color: BRAND.greenDark }}>أول 30 دقيقة مجاناً 100%</span> كهدية ترحيبية مميزة لك في أول زيارة 🎈
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══ بانر الجلسة النشطة ═══ */}
        {activeSession && (
          <motion.button
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => { setSelectedGarageId(activeSession.garageId); setScreen('session'); }}
            className="w-full mb-3 flex items-center justify-between active:scale-[0.98] transition-all text-right"
            style={{
              background: `linear-gradient(135deg, ${BRAND.green}, ${BRAND.greenDark})`,
              borderRadius: 20, padding: '14px 16px', color: '#ffffff',
              boxShadow: `0 8px 24px ${BRAND.green}40`,
              border: 'none', cursor: 'pointer',
            }}
          >
            <div className="flex items-center gap-2">
              <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, duration: 1.5 }} className="w-3 h-3 rounded-full bg-white block" />
              <span className="text-xs font-black" style={{ color: '#ffffff' }}>عرض الجلسة ←</span>
            </div>
            <div>
              <div className="text-sm font-black flex items-center gap-1 justify-end" style={{ color: '#ffffff' }}><Zap size={15} /> جلسة ركن نشطة</div>
              <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.85)' }}>اضغط للمتابعة والتفاصيل</div>
            </div>
          </motion.button>
        )}

        {/* ═══ بانر الحجز النشط ═══ */}
        {!activeSession && myIncomingCar && (
          <motion.button
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => { setSelectedGarageId(myIncomingCar.garageId); setScreen('navigation'); }}
            className="w-full mb-3 flex items-center justify-between active:scale-[0.98] transition-all text-right"
            style={{
              background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`,
              borderRadius: 20, padding: '14px 16px', color: '#ffffff',
              boxShadow: `0 8px 24px ${BRAND.blue}40`,
              border: 'none', cursor: 'pointer',
            }}
          >
            <div className="flex items-center gap-2">
              <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, duration: 1.5 }} className="w-3 h-3 rounded-full bg-white block" />
              <span className="text-xs font-black" style={{ color: '#ffffff' }}>عرض التوجيه ←</span>
            </div>
            <div>
              <div className="text-sm font-black flex items-center gap-1 justify-end" style={{ color: '#ffffff' }}><Navigation size={15} /> حجز نشط (في الطريق)</div>
              <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.85)' }}>اضغط لفتح الخريطة والتوجيه</div>
            </div>
          </motion.button>
        )}

        {/* ═══ شريط البحث والفلاتر ═══ */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: BRAND.slateMuted }} />
            <input
              className="w-full font-bold outline-none text-sm"
              style={{
                background: BRAND.blueSoft,
                border: `2px solid ${BRAND.border}`,
                padding: '12px 38px 12px 34px',
                borderRadius: 16,
                color: BRAND.navy,
              }}
              placeholder="ابحث باسم الجراج أو المنطقة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: BRAND.slateMuted }}><X size={16} /></button>
            )}
          </div>

          <button
            onClick={getUserLocation}
            disabled={locationLoading}
            className="active:scale-95 transition-all flex items-center justify-center"
            style={{
              background: locationLoading ? BRAND.border : BRAND.blue,
              color: locationLoading ? BRAND.slateMuted : '#fff',
              borderRadius: 16, padding: '0 14px',
              boxShadow: locationLoading ? 'none' : `0 4px 14px ${BRAND.blue}30`,
            }}
            title="تحديد موقعي"
          >
            <Locate size={18} className={locationLoading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => setShowNearbyOnly(!showNearbyOnly)}
            className="font-black text-xs active:scale-95 transition-all whitespace-nowrap flex items-center gap-1"
            style={{
              background: showNearbyOnly ? BRAND.blue : BRAND.blueSoft,
              color: showNearbyOnly ? '#fff' : BRAND.slate,
              borderRadius: 16, padding: '0 14px',
              border: showNearbyOnly ? 'none' : `2px solid ${BRAND.border}`,
              boxShadow: showNearbyOnly ? `0 4px 14px ${BRAND.blue}30` : 'none',
            }}
          >
            <Filter size={13} /> {showNearbyOnly ? 'الكل' : 'قريب'}
          </button>
        </div>
      </div>

      {/* ═══════════════ CONTENT ═══════════════ */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-8">

        {/* أزرار سريعة */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {hasCompletedSession && (
            <button
              onClick={() => setScreen('lastSession')}
              className="flex items-center gap-2 active:scale-[0.97] transition-all text-right"
              style={{ background: BRAND.card, border: `1.5px solid ${BRAND.border}`, borderRadius: 16, padding: '10px 12px', boxShadow: `0 2px 8px ${BRAND.blue}06` }}
            >
              <div style={{ background: BRAND.blue, borderRadius: 10, padding: 6, color: '#fff' }}><Receipt size={14} /></div>
              <div className="flex-1">
                <div className="font-black text-xs" style={{ color: BRAND.navy }}>آخر جلسة</div>
                <div style={{ fontSize: 9, color: BRAND.slateMuted }}>عرض الإيصال</div>
              </div>
            </button>
          )}

          <button
            onClick={() => setScreen('chat')}
            className={`flex items-center gap-2 active:scale-[0.97] transition-all text-right ${!hasCompletedSession ? 'col-span-2' : ''}`}
            style={{ background: BRAND.card, border: '1.5px solid #e0d6ff', borderRadius: 16, padding: '10px 12px', boxShadow: '0 2px 8px rgba(124,58,237,0.04)' }}
          >
            <div style={{ background: '#7c3aed', borderRadius: 10, padding: 6, color: '#fff' }}><MessageCircle size={14} /></div>
            <div className="flex-1">
              <div className="font-black text-xs" style={{ color: BRAND.navy }}>تواصل معنا</div>
              <div style={{ fontSize: 9, color: BRAND.slateMuted }}>شكاوى واستفسارات</div>
            </div>
          </button>
        </div>

        {/* ═══ أكورديون المناطق ═══ */}
        {areaGroups.length > 0 ? (
          <div className="space-y-3.5">
            {areaGroups.map((group, groupIdx) => {
              const isExpanded = expandedArea === group.name;
              const totalAvailableSpots = group.garages.reduce((sum, g) => sum + (g.availableSpots || 0), 0);
              const occupancyPercentage = group.totalCapacity > 0
                ? Math.min(100, Math.round((totalAvailableSpots / group.totalCapacity) * 100))
                : 0;

              return (
                <motion.div
                  key={group.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: groupIdx * 0.05, type: 'spring', damping: 22 }}
                  className="overflow-hidden"
                  style={{
                    background: BRAND.card,
                    borderRadius: 22,
                    border: `2px solid ${isExpanded ? group.theme.solid : BRAND.border}`,
                    boxShadow: isExpanded
                      ? `0 12px 28px ${group.theme.solid}15, 0 3px 10px rgba(0,0,0,0.03)`
                      : '0 2px 8px rgba(0,0,0,0.03)',
                    transition: 'border-color 0.4s, box-shadow 0.4s',
                  }}
                >
                  {/* رأس بطاقة المنطقة */}
                  <button
                    onClick={() => setExpandedArea(isExpanded ? null : group.name)}
                    className="w-full p-4 flex items-center justify-between text-right bg-transparent border-none cursor-pointer outline-none active:scale-[0.99] transition-transform"
                  >
                    <div className="flex items-center gap-2.5 shrink-0">
                      <div
                        className="flex flex-col items-center justify-center rounded-2xl"
                        style={{
                          background: isExpanded ? group.theme.gradient : group.theme.light,
                          padding: '6px 10px', minWidth: 44,
                          boxShadow: isExpanded ? `0 4px 12px ${group.theme.solid}40` : 'none',
                          transition: 'all 0.3s',
                        }}
                      >
                        <span className="font-black font-mono leading-none" style={{ fontSize: 17, color: isExpanded ? '#ffffff' : group.theme.solid, textShadow: isExpanded ? '0 1px 2px rgba(0,0,0,0.15)' : 'none' }}>
                          {group.garages.length}
                        </span>
                        <span className="font-black" style={{ fontSize: 8, color: isExpanded ? 'rgba(255,255,255,0.85)' : group.theme.solid, marginTop: 2 }}>جراج</span>
                      </div>

                      <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ type: 'spring', damping: 15 }}
                        className="rounded-full flex items-center justify-center"
                        style={{
                          background: isExpanded ? group.theme.solid : BRAND.blueSoft,
                          width: 32, height: 32,
                          boxShadow: isExpanded ? `0 3px 10px ${group.theme.solid}35` : 'none',
                        }}
                      >
                        <ChevronDown size={18} strokeWidth={3} style={{ color: isExpanded ? '#ffffff' : BRAND.slate }} />
                      </motion.div>
                    </div>

                    <div className="flex items-center gap-3 flex-1 justify-end">
                      <div className="text-right flex-1">
                        <div className="flex items-center gap-2 justify-end mb-1">
                          <h3 className="font-black leading-none" style={{ fontSize: 16, color: isExpanded ? group.theme.solid : BRAND.navy, transition: 'color 0.3s' }}>
                            {group.name}
                          </h3>
                        </div>

                        <div className="flex items-center gap-2 justify-end mt-1.5">
                          <div className="flex items-center gap-1">
                            <span className="font-black font-mono" style={{ fontSize: 13, color: totalAvailableSpots > 0 ? BRAND.greenDark : '#dc2626' }}>
                              {totalAvailableSpots}
                            </span>
                            <span className="text-[11px] font-black" style={{ color: BRAND.navy }}>ركنة شاغرة متاحة حالياً 🚗</span>
                          </div>
                        </div>

                        <div className="mt-1.5 relative overflow-hidden" style={{ height: 4, background: BRAND.blueSoft, borderRadius: 4, width: '100%' }}>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${occupancyPercentage}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 + groupIdx * 0.05 }}
                            style={{
                              height: '100%', borderRadius: 4,
                              background: totalAvailableSpots > 0
                                ? `linear-gradient(90deg, ${BRAND.green}, ${BRAND.greenDark})`
                                : 'linear-gradient(90deg, #ef4444, #dc2626)',
                              boxShadow: totalAvailableSpots > 0
                                ? `0 0 8px ${BRAND.green}50`
                                : '0 0 8px rgba(239,68,68,0.4)',
                            }}
                          />
                        </div>
                      </div>

                      <div
                        className="rounded-2xl flex items-center justify-center shrink-0"
                        style={{
                          background: isExpanded ? group.theme.gradient : group.theme.light,
                          width: 52, height: 52, fontSize: 26,
                          boxShadow: isExpanded
                            ? `0 6px 16px ${group.theme.solid}40, inset 0 2px 4px rgba(255,255,255,0.2)`
                            : `0 2px 8px ${group.theme.solid}15`,
                          border: `2px solid ${isExpanded ? '#ffffff' : group.theme.border}`,
                          transition: 'all 0.3s',
                        }}
                      >
                        <span style={{ filter: isExpanded ? 'brightness(1.2)' : 'none' }}>{group.theme.icon}</span>
                      </div>
                    </div>
                  </button>

                  {/* محتوى المنطقة المنسدل */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: 'spring', damping: 26, stiffness: 200 }}
                        style={{
                          borderTop: `1.5px dashed ${group.theme.border}`,
                          background: `linear-gradient(180deg, ${group.theme.light}55 0%, ${BRAND.surface} 100%)`,
                          padding: '14px 12px 16px',
                        }}
                      >
                        <div className="space-y-3">
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
            <p className="text-sm font-black" style={{ color: BRAND.slate }}>لا توجد جراجات مطابقة للبحث</p>
            <p className="text-xs mt-1" style={{ color: BRAND.slateMuted }}>جرب تغيير كلمة البحث أو إلغاء تصفية القريب</p>
          </div>
        )}
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
    if (hasGiftFlag === 'true' && currentUser && !currentUser.hasUsedFreeSession) { setShow(true); }
    else { localStorage.removeItem('showWelcomeGift'); setShow(false); }
  }, [currentUser]);

  const handleClose = () => { localStorage.removeItem('showWelcomeGift'); setShow(false); };

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 backdrop-blur-sm z-[999] flex items-center justify-center p-5" style={{ background: 'rgba(10,22,40,0.7)' }} onClick={handleClose}>
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 40 }}
            className="rounded-[2rem] p-7 max-w-sm w-full text-center relative overflow-hidden"
            style={{ background: BRAND.card, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full filter blur-xl" style={{ background: 'rgba(252,165,165,0.12)' }} />
            <div className="absolute -bottom-10 -left-10 w-28 h-28 rounded-full filter blur-xl" style={{ background: 'rgba(253,230,138,0.12)' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full filter blur-2xl" style={{ background: `${BRAND.blueLight}60` }} />

            <button onClick={handleClose} className="absolute top-4 left-4 transition-colors z-10" style={{ color: BRAND.slateMuted }}><X size={20} /></button>

            <motion.div
              animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg relative z-10"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', boxShadow: '0 8px 24px rgba(239,68,68,0.25)' }}
            >
              <Gift size={36} className="text-white" />
            </motion.div>

            <h3 className="text-2xl font-black mb-2 relative z-10" style={{ color: BRAND.navy }}>🎉 أهلاً وسهلاً!</h3>
            <p className="text-sm mb-5 leading-relaxed relative z-10 font-bold" style={{ color: BRAND.slate }}>
              نورتنا في عائلة <span className="font-black" style={{ color: BRAND.blue }}>Park'n 24</span> وحبينا نفرحك بهدية حلوة 🌟
            </p>

            <div className="relative z-10 mb-6" style={{ background: 'linear-gradient(135deg, #FFF7ED, #FEF3C7, #FFEDD5)', borderRadius: 20, padding: '18px 16px', border: '2px solid #fcd34d' }}>
              <div className="flex items-center justify-center gap-2 mb-2">
                <Sparkles size={18} className="animate-pulse" style={{ color: '#d97706' }} />
                <span className="font-black" style={{ fontSize: 18, color: '#92400e' }}>أول 30 دقيقة ركنة مجاناً!</span>
                <Sparkles size={18} className="animate-pulse" style={{ color: '#d97706' }} />
              </div>
              <p className="font-bold text-xs leading-relaxed" style={{ color: '#b45309' }}>احجز ركنتك الأولى من التطبيق وهنركنلك أول 30 دقيقة ببلاش تماماً 🚗✨</p>
            </div>

            <button
              onClick={handleClose}
              className="w-full font-black py-4 rounded-2xl text-sm active:scale-95 transition-all shadow-lg relative z-10"
              style={{
                background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`,
                color: '#ffffff', fontWeight: 950, fontSize: 15,
                boxShadow: `0 6px 20px ${BRAND.blue}35`,
                textShadow: '0 1px 2px rgba(0,0,0,0.15)',
                border: 'none', cursor: 'pointer',
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
   ██  GARAGE CARD — PREMIUM DESIGN
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

  const borderColor = isClosest && !isBusy ? BRAND.blue : isNearby ? BRAND.green : BRAND.border;
  const glowColor = isClosest && !isBusy ? `${BRAND.blue}10` : isNearby ? `${BRAND.green}08` : 'transparent';

  const btnBg = (() => {
    if (isFull) return BRAND.border;
    if (hasActiveSession) return `linear-gradient(135deg, ${BRAND.green}, ${BRAND.greenDark})`;
    if (hasIncomingCar) return `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`;
    if (isClosest) return `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`;
    if (isNearby) return `linear-gradient(135deg, ${BRAND.green}, ${BRAND.greenDark})`;
    return `linear-gradient(135deg, ${BRAND.blue}, #3b7dd8)`;
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
      transition={{ delay: index * 0.04 }}
      onClick={!disabled && !isFull ? onSelect : undefined}
      className={`transition-all text-right ${!isFull && !disabled ? 'active:scale-[0.99] cursor-pointer' : 'cursor-not-allowed opacity-95'}`}
      style={{
        background: BRAND.card,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 18,
        padding: '12px 14px',
        boxShadow: `0 3px 12px ${glowColor}, 0 1px 3px rgba(0,0,0,0.02)`,
      }}
    >
      {/* الصف العلوي: الاسم + البادجات */}
      <div className="flex justify-between items-center mb-1.5">
        <div className="flex items-center gap-1 flex-wrap">
          <div className="flex items-center gap-0.5 font-black text-white" style={{ background: '#f59e0b', fontSize: 10, padding: '2px 6px', borderRadius: 8 }}>
            <Star size={9} fill="currentColor" />
            {garage.rating}
          </div>

          {garage.payment_mode === 'cash' && (
            <span style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontSize: 9.5, padding: '2.5px 7px', borderRadius: 8, fontWeight: 900 }}>💵 نقدي فقط</span>
          )}
          {garage.payment_mode === 'wallet' && (
            <span style={{ background: '#faf5ff', color: '#7e22ce', border: '1px solid #e9d5ff', fontSize: 9.5, padding: '2.5px 7px', borderRadius: 8, fontWeight: 900 }}>👝 محفظة فقط</span>
          )}
          {isFull && (
            <span style={{ background: '#ef4444', color: '#ffffff', fontSize: 10, padding: '3px 8px', borderRadius: 10, fontWeight: 950, textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>ممتلئ</span>
          )}
          {!isBusy && isClosest && !isFull && (
            <span style={{ background: BRAND.blue, color: '#ffffff', fontWeight: 900, fontSize: 9.5, padding: '2.5px 7px', borderRadius: 8, boxShadow: `0 2px 6px ${BRAND.blue}40` }}>📍 الأقرب</span>
          )}
          {!isBusy && !isClosest && isNearby && !isFull && (
            <span style={{ background: BRAND.green, color: '#ffffff', fontSize: 10, padding: '3px 8px', borderRadius: 10, fontWeight: 950, textShadow: '0 1px 2px rgba(0,0,0,0.15)' }}>قريب</span>
          )}
        </div>
        <h3 className="text-sm font-black" style={{ color: BRAND.navy, lineHeight: 1.2 }}>{garage.name}</h3>
      </div>

      {/* الموقع */}
      <div className="flex items-center gap-1 justify-end mb-2" style={{ fontSize: 10, color: BRAND.slateMuted }}>
        <span className="truncate max-w-[180px]">{garage.location}</span>
        <MapPin size={10} className="shrink-0" />
      </div>

      {/* المسافة + الأماكن + السعر */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-1 shadow-sm shrink-0" style={{
          background: isNearby ? `linear-gradient(135deg, ${BRAND.green}, ${BRAND.greenDark})` : `linear-gradient(135deg, #6c47b8, #5b3e9e)`,
          borderRadius: 10, padding: '5px 10px', fontSize: 11, color: '#ffffff',
        }}>
          <Navigation size={12} className="rotate-45" style={{ color: '#ffffff' }} />
          <span className="font-mono tracking-wider" style={{ color: '#ffffff', fontWeight: 900 }}>{formatDuration(garage.minutes)}</span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1 shrink-0">
            <Car size={14} style={{ color: BRAND.blue }} />
            <span className="font-black font-mono text-sm" style={{ color: BRAND.blue }}>{garage.availableSpots}</span>
            <span className="text-[9px] font-bold" style={{ color: BRAND.slate }}>شاغر</span>
          </div>
          <div style={{ width: 1.5, height: 12, background: BRAND.border }} />
          <div className="flex items-center gap-1 shrink-0">
            <span className="font-black font-mono text-sm" style={{ color: BRAND.greenDark }}>{garage.basePrice}</span>
            <span className="text-[9px] font-bold" style={{ color: BRAND.slate }}>ج.م/س</span>
          </div>
        </div>
      </div>

      {/* زر الحجز */}
      <button
        disabled={isFull || disabled}
        onClick={(e) => { e.stopPropagation(); if (!isFull && !disabled) onSelect(); }}
        className="w-full font-black flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
        style={{
          background: btnBg,
          color: isFull ? BRAND.slateMuted : '#ffffff',
          borderRadius: 12, padding: '9px 0', fontSize: 12,
          border: 'none', cursor: isFull ? 'not-allowed' : 'pointer',
          boxShadow: isFull ? 'none' : `0 4px 12px ${BRAND.blue}20`,
        }}
      >
        <Car size={14} />
        <span>{btnLabel}</span>
      </button>
    </motion.div>
  );
});