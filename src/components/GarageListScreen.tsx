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
  Shield,
  Volume2,
  AlertTriangle,
  Compass,
  Activity,
  Copy,
} from 'lucide-react';
// 🌟 استيراد calculateDistanceMeters لحساب تباعد العميل عن المرساة
import { useStore, Garage, ParkingSession as Session, IncomingCar, normalizePlate, normalizePhone, getServerNow, calculateDistanceMeters } from '../store';
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
  bg: '#f8fafc',         // خلفية التطبيق (رمادي هادئ جداً مريح للعين)
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

// 🔊 نظام إنذار اختراق درع السيارة لهاتف العميل
let customerAudioCtx: AudioContext | null = null;
const playBreachAlarm = async () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    if (!customerAudioCtx) customerAudioCtx = new AudioCtx();
    if (customerAudioCtx.state === 'suspended') await customerAudioCtx.resume();
    
    const now = customerAudioCtx.currentTime;
    const masterGain = customerAudioCtx.createGain();
    masterGain.gain.setValueAtTime(1.0, now);
    masterGain.connect(customerAudioCtx.destination);
    
    for (let i = 0; i < 6; i++) {
      const start = now + (i * 0.35);
      const osc = customerAudioCtx.createOscillator();
      const gain = customerAudioCtx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(i % 2 === 0 ? 1600 : 2200, start);
      
      gain.gain.setValueAtTime(0.8, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.32);
      
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(start);
      osc.stop(start + 0.35);
    }
    
    if ('vibrate' in navigator) {
      navigator.vibrate([1000, 200, 1000, 200, 1000]);
    }
  } catch (e) {
    console.warn('Audio Context Error:', e);
  }
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
    triggerSessionBreach,
  } = useStore();

  const [search, setSearch] = useState('');
  const [showNearbyOnly, setShowNearbyOnly] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showSosModal, setShowSosModal] = useState(false); 
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

  const garage = garages?.find(
    (g) => g.id === activeSession?.garageId
  );

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

  // 🛡️ فحص حالة تفعيل الدرع الفضائي بدقة في الصفحة الرئيسية للعميل
  const isShieldActive = useMemo(() => {
    if (!activeSession) return false;
    return Boolean(
      activeSession.securityShieldActive === true ||
      (activeSession as any).security_shield_active === true
    );
  }, [activeSession]);

  // 📐 حساب المسافة الفعلية الحالية بين موقع العميل ومكان الركنة
  const distanceToCar = useMemo(() => {
    if (!activeSession || !userLocation.lat || !userLocation.lng) return null;
    const pLat = activeSession.parkedLat || garage?.lat;
    const pLng = activeSession.parkedLng || garage?.lng;
    if (!pLat || !pLng) return null;
    return calculateDistanceMeters(userLocation.lat, userLocation.lng, pLat, pLng);
  }, [activeSession, userLocation.lat, userLocation.lng, garage]);

  // 🎯 تحديد مستوى الخطر الجغرافي الفعلي لمنع الإزعاج الكاذب أثناء الاقتراب
  const isFarAway = useMemo(() => {
    if (!activeSession) return false;
    if (!isShieldActive || !activeSession.isBreached) return false;
    if (distanceToCar === null) return true; // تفعيل الحماية افتراضياً عند تعذر قراءة الـ GPS
    return distanceToCar > 25; // خطر حقيقي فقط خارج الـ 25 متر
  }, [activeSession, isShieldActive, distanceToCar]);

  // 🚨 [رصد فوري لحالة كسر الفقاعة وتشغيل الإنذار فقط إذا كان الدرع نشطاً وعاملاً والعميل بعيداً عن سيارته]
  useEffect(() => {
    if (activeSession && isShieldActive && activeSession.isBreached && isFarAway) {
      playBreachAlarm();
      setShowSosModal(true); // فتح شاشة الطوارئ والـ SOS تلقائياً للعميل
      const interval = setInterval(playBreachAlarm, 4000);
      return () => clearInterval(interval);
    }
  }, [activeSession?.isBreached, isShieldActive, isFarAway]);

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
        <div className="flex justify-between items-center mb-3">
          <div>
            <h1 className="text-base font-black" style={{ color: BRAND.blueDark }}>
              أهلاً {currentUser?.name || 'بك'} 👋
            </h1>
            <p className="text-[10px] font-bold mt-0.5" style={{ color: BRAND.slate }}>
              اركن وادفع بضغطة واحدة.. بدون لفة وبدون فكة 🚗
            </p>
          </div>
          <span className="font-black text-lg" style={{ color: BRAND.blue }}>
            بركن <span style={{ color: BRAND.green }}>24</span>
          </span>
        </div>

        {/* 💳 بطاقة المحفظة */}
        <div
          style={{
            background: BRAND.blue,
            borderRadius: 14,
            padding: '10px 14px',
            marginBottom: 8,
            boxShadow: '0 4px 12px rgba(22,86,184,0.12)',
            color: '#ffffff',
          }}
        >
          <div className="flex justify-between items-center">
            <div>
              <span className="text-[9px] font-black opacity-90 block mb-0.5">💳 رصيد محفظتك الحالي</span>
              <div className="font-black font-mono flex items-baseline gap-1" style={{ fontSize: 20 }}>
                {currentUser?.wallet || 0}
                <span className="text-[11px] font-black opacity-85">ج.م</span>
              </div>
            </div>

            <div className="flex gap-1.5">
              {myTopUps.length > 0 && (
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="p-2 rounded-lg transition-all relative border border-white/20 bg-white/10 text-white cursor-pointer"
                >
                  <History size={13} />
                  {pendingTopUpsCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
                  )}
                </button>
              )}

              <button
                onClick={() => setShowTopUp(true)}
                className="flex items-center gap-1 font-black active:scale-95 transition-all text-[11px] cursor-pointer border-0"
                style={{ background: '#ffffff', color: BRAND.blue, borderRadius: 8, padding: '6px 10px' }}
              >
                <Plus size={11} strokeWidth={3} />
                <span>شحن رصيد</span>
              </button>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-white/20 flex items-center justify-between">
            <span className="text-[11px] font-black text-white">🚙 رقم السيارة:</span>
            <span className="font-mono font-black text-sm bg-white text-[#1656b8] px-3 py-1 rounded-lg shadow-sm tracking-wider">
              {currentUser?.carPlate || '---'}
            </span>
          </div>
        </div>

        {/* 📲 كارت الباركود الذكي */}
        <div 
          onClick={() => setShowQrModal(true)}
          className="mb-3 border rounded-xl p-2 flex items-center justify-between text-right cursor-pointer active:scale-[0.98] transition-all"
          style={{ 
            background: BRAND.bg, 
            borderColor: BRAND.border,
            boxShadow: '0 2px 6px rgba(0,0,0,0.01)'
          }}
        >
          <div className="flex items-center gap-2">
            <div 
              className="w-10 h-10 p-0.5 rounded-lg bg-white border flex items-center justify-center shrink-0 shadow-sm"
              style={{ borderColor: BRAND.blue }}
            >
              <img 
                src="/app-qr.png" 
                alt="كود بركن 24" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>

            <div className="text-right">
              <span className="text-[8px] font-black px-1.5 py-0.5 rounded text-white inline-block mb-0.5" style={{ background: BRAND.blue }}>
                📲 شارك بركن 24
              </span>
              <h4 className="text-[11px] font-black" style={{ color: BRAND.blueDark }}>
                امسح الكود لفتح وتنزيل التطبيق
              </h4>
              <p className="text-[9px] font-black mt-0.5" style={{ color: BRAND.slate }}>
                شارك الكود مع زملائك ليركنوا أسرع! 🚀
              </p>
            </div>
          </div>
          <QrCode size={16} style={{ color: BRAND.blue }} className="shrink-0" />
        </div>

        {/* 🛡️ [كارت درع الأمان الفضائي الحصري للعميل - مصلح ومحمي ليظهر فقط عند التفعيل الفعلي والبعد عن السيارة] */}
        {activeSession && isShieldActive && (
          <div
            className="mb-3 border rounded-2xl p-3 flex flex-col gap-2 relative overflow-hidden"
            style={{
              background: (activeSession.isBreached && isFarAway) ? '#fff5f5' : 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              borderColor: (activeSession.isBreached && isFarAway) ? '#fca5a5' : BRAND.border,
              boxShadow: '0 4px 14px rgba(0,0,0,0.05)',
              color: '#ffffff',
            }}
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${(activeSession.isBreached && isFarAway) ? 'bg-red-500' : 'bg-emerald-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${(activeSession.isBreached && isFarAway) ? 'bg-red-600' : 'bg-emerald-500'}`}></span>
                </span>
                <span className="text-[10px] font-black opacity-90" style={{ color: (activeSession.isBreached && isFarAway) ? '#991b1b' : '#38bdf8' }}>
                  {(activeSession.isBreached && isFarAway) ? '🚨 تم الاختراق وصدمات الأمان تعمل!' : '🛰️ متصل بالأقمار الصناعية'}
                </span>
              </div>
              <Shield size={16} style={{ color: (activeSession.isBreached && isFarAway) ? '#ef4444' : BRAND.green }} />
            </div>

            <div className="flex justify-between items-center mt-1">
              <div className="text-right">
                <h4 className="text-xs font-black" style={{ color: (activeSession.isBreached && isFarAway) ? '#7f1d1d' : '#ffffff' }}>
                  درع الأمان الفضائي للسيارة {(activeSession.isBreached && isFarAway) ? '⚠️' : '🛡️'}
                </h4>
                <p className="text-[9px] font-bold mt-0.5" style={{ color: (activeSession.isBreached && isFarAway) ? '#b91c1c' : '#94a3b8' }}>
                  {(activeSession.isBreached && isFarAway) 
                    ? 'السيارة غادرت فقاعة الأمان الجغرافية (25م) بدون تصريح!' 
                    : 'فقاعة الأمان اللاسلكية نشطة حول السيارة وتحميها بالكامل.'}
                </p>
              </div>

              {(activeSession.isBreached && isFarAway) && (
                <button
                  onClick={() => setShowSosModal(true)}
                  className="py-1.5 px-3 rounded-xl font-black text-[9px] text-white border-0 bg-red-600 active:scale-95 transition-all cursor-pointer shadow-md"
                >
                  عرض تقرير SOS 🚔
                </button>
              )}
            </div>

            {activeSession.parkedLat && (
              <div className="mt-1 pt-2 border-t flex justify-between items-center text-[8px] font-black" style={{ borderColor: (activeSession.isBreached && isFarAway) ? '#fee2e2' : '#334155' }}>
                <span style={{ color: (activeSession.isBreached && isFarAway) ? '#991b1b' : '#94a3b8' }}>
                  📍 المرساة: ({activeSession.parkedLat.toFixed(4)}, {activeSession.parkedLng?.toFixed(4)})
                </span>
                <span style={{ color: (activeSession.isBreached && isFarAway) ? '#991b1b' : BRAND.green }}>
                  {(activeSession.isBreached && isFarAway) ? '⚠️ خارج النطاق الجغرافي' : '🔒 مثبت في الموقف'}
                </span>
              </div>
            )}
          </div>
        )}

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

        {/* أزرار المساعدة */}
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

        {/* ═══ القائمة والأكورديون ═══ */}
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

      {/* 📲 نافذة تكبير الباركود مع ميزة نسخ ومشاركة الرابط */}
      <AnimatePresence>
        {showQrModal && (
          <div 
            className="fixed inset-0 z-[999] flex items-center justify-center p-5"
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
              {/* زر الإغلاق */}
              <button 
                onClick={() => setShowQrModal(false)}
                className="absolute top-4 left-4 text-slate-400 font-black text-sm border-0 bg-transparent cursor-pointer"
              >
                ✕
              </button>

              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2"
                style={{ background: BRAND.green + '20' }}
              >
                <Gift size={20} style={{ color: BRAND.greenDark }} />
              </div>

              <h3 className="text-sm font-black mb-1" style={{ color: BRAND.blueDark }}>
                📲 شارك بركن 24 مع أصحابك
              </h3>

              <p className="text-[11px] font-bold mb-3 leading-relaxed" style={{ color: BRAND.slate }}>
                امسح الكود أو انسخ الرابط وشاركه مع أصحابك ليركنوا ويستمتعوا بـ <span className="font-black" style={{ color: BRAND.greenDark }}>أول 30 دقيقة مجاناً! 🎁🚀</span>
              </p>

              {/* إطار الباركود */}
              <div 
                className="w-44 h-44 mx-auto p-2 bg-white rounded-2xl border-2 shadow-inner flex items-center justify-center mb-3" 
                style={{ borderColor: BRAND.blue }}
              >
                <img 
                  src="/app-qr.png" 
                  alt="QR Code" 
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>

              {/* 🔗 زر نسخ ومشاركة رابط التطبيق */}
              <div className="space-y-2">
                <button
                  onClick={async () => {
                    const appUrl = window.location.origin;
                    try {
                      if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(appUrl);
                      } else {
                        const el = document.createElement('textarea');
                        el.value = appUrl;
                        document.body.appendChild(el);
                        el.select();
                        document.execCommand('copy');
                        document.body.removeChild(el);
                      }
                      toast.success('تم نسخ رابط التطبيق بنجاح! 📋🚀', { duration: 3000 });
                    } catch {
                      toast.error('تعذر نسخ الرابط');
                    }
                  }}
                  className="w-full py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all border-0 text-white shadow-sm"
                  style={{ background: BRAND.greenDark }}
                >
                  <Copy size={14} />
                  <span>نسخ رابط التطبيق 🔗</span>
                </button>

                <button
                  onClick={() => setShowQrModal(false)}
                  className="w-full py-2.5 rounded-xl font-bold text-xs text-slate-500 bg-slate-100 border border-slate-200 cursor-pointer active:scale-95 transition-all"
                >
                  إغلاق النافذة
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* 🚔 [نافذة إنذار الطوارئ وتقرير الشرطة SOS - للفقاعة الجغرافية وسرقة الصاج الحقيقية] */}
      <AnimatePresence>
        {showSosModal && activeSession && isShieldActive && activeSession.isBreached && isFarAway && (
          <div 
            className="fixed inset-0 z-[99999] flex items-center justify-center p-5"
            style={{ background: 'rgba(127,29,29,0.9)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowSosModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="rounded-3xl p-6 text-center max-w-sm w-full shadow-2xl relative bg-white text-slate-800"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-14 h-12 rounded-full flex items-center justify-center mx-auto mb-3 bg-red-100 animate-pulse">
                <AlertTriangle size={28} className="text-red-600" />
              </div>

              <h3 className="text-base font-black text-red-900 mb-1">🚨 تم رصد حركة غير مصرحة لسيارتك!</h3>
              <p className="text-xs font-bold text-slate-500 mb-4 leading-relaxed">
                سيارتك لوحة <span className="font-mono font-black text-red-700 bg-red-50 px-2 py-0.5 rounded">{activeSession.carPlate}</span> تجاوزت سياج الجراج الجغرافي (25م) بدون إذان خروج!
              </p>

              <div className="p-3.5 border rounded-2xl text-right space-y-2 mb-5 bg-slate-50 border-slate-200">
                <div className="flex justify-between items-center text-xs border-b pb-1.5 border-dashed border-slate-200">
                  <span className="font-mono font-black text-slate-800">
                    {new Date(safeParseTime(activeSession.startTime)).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="font-black text-slate-500">⏱️ وقت كسر الفقاعة:</span>
                </div>

                <div className="flex justify-between items-center text-xs border-b pb-1.5 border-dashed border-slate-200">
                  <span className="font-mono font-black text-red-600">~ 40 كم/ساعة</span>
                  <span className="font-black text-slate-500">🚗 السرعة المقدرة:</span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="font-mono font-black text-slate-800">نشط (رادار المشرف)</span>
                  <span className="font-black text-slate-500">📶 حالة التتبع الحالية:</span>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={async () => {
                    localStorage.removeItem(`breach_silenced_${activeSession.id}`);
                    await triggerSessionBreach(activeSession.id, false);
                    setShowSosModal(false);
                    toast.success('تم إلغاء الإنذار وتأكيد أمان الحركة بنجاح.');
                  }}
                  className="w-full py-3 rounded-xl font-black text-xs text-white border-0 bg-emerald-600 active:scale-95 transition-all cursor-pointer shadow-md"
                >
                  ✅ إلغاء الإنذار (حركة مصرحة مني)
                </button>

                <button
                  onClick={() => {
                    localStorage.setItem(`breach_silenced_${activeSession.id}`, 'true');
                    toast.success('🚀 تم كتم الصوت محلياً وتصدير بيانات الموقع والسرعة لجهات الطوارئ فوراً!');
                    setShowSosModal(false);
                  }}
                  className="w-full py-3 rounded-xl font-black text-xs text-white border-0 bg-red-700 active:scale-95 transition-all cursor-pointer shadow-md"
                >
                  🚔 إرسال تقرير SOS عاجل للشرطة
                </button>

                <button
                  onClick={() => {
                    localStorage.setItem(`breach_silenced_${activeSession.id}`, 'true');
                    setShowSosModal(false);
                    toast('تم كتم صوت الإنذار مؤقتاً 🔕');
                  }}
                  className="w-full py-2.5 rounded-xl font-bold text-[11px] text-slate-500 bg-transparent border border-slate-200 cursor-pointer"
                >
                  إغلاق المؤقت
                </button>
              </div>
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
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-5" style={{ background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' }} onClick={handleClose}>
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
      <div className="flex justify-between items-center mb-1">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="flex items-center gap-0.5 text-[10px] font-black px-1.5 py-0.5 rounded" style={{ background: '#fef3c7', color: '#b45309' }}>
            <Star size={8} fill="currentColor" /> {garage.rating}
          </span>

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

      <div className="flex items-center gap-1 justify-end text-[10px] mb-2" style={{ color: BRAND.slate }}>
        <span>{garage.location}</span>
        <MapPin size={10} />
      </div>

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