// src/components/SessionScreen.tsx
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  Car,
  ArrowRight,
  Gift,
  Sparkles,
  CreditCard,
  Shield,
  Zap,
  Lock,
  Compass,
  Radio,
  Locate,
  CheckCircle2,
} from 'lucide-react';
import { useStore, normalizePlate, normalizePhone, getServerNow } from '../store';
import {
  calculateCostWithLoyalty,
  formatTime,
  getRemainingInCurrentHour,
} from '../utils/pricing';
import { captureMagneticMass } from '../utils/batShieldEngine';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

/* ─── 🎨 الألوان الرسمية الفاخرة لتطبيق Park'n 24 ─── */
const BRAND = {
  blue: '#1656b8',
  blueDark: '#0f3d85',
  blueLight: '#e8f0fe',
  blueSoft: 'rgba(22, 86, 184, 0.08)',
  green: '#8cc63f',
  greenDark: '#6ea62a',
  greenLight: 'rgba(140, 198, 63, 0.12)',
  navy: '#0a1628',
  navyLight: '#111e36',
  slate: '#64748b',
  slateMuted: '#94a3b8',
  border: 'rgba(255, 255, 255, 0.08)',
};

const safeParseTime = (value: any): number => {
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

// حساب المسافة الدقيقة بين العميل والعربية بالمتر
const haversineDistMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export default function SessionScreen() {
  const {
    garages,
    sessions,
    setScreen,
    currentUser,
    fetchAll,
    setSelectedGarageId,
    acknowledgedSessionIds,
    acknowledgeSession,
    activateShield,
  } = useStore();

  const userPlate = normalizePlate(currentUser?.carPlate);
  const userPhone = currentUser?.phone ? normalizePhone(currentUser.phone) : '';

  const redirectedToSummaryRef = useRef(false);
  const redirectedToSessionRef = useRef(false);
  const activeSessionIdRef = useRef<string | null>(null);
  const realtimeChannelRef = useRef<any>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [elapsed, setElapsed] = useState(0);
  const [isActivatingShield, setIsActivatingShield] = useState(false);
  const [distanceToCar, setDistanceToCar] = useState<number | null>(null);

  const isMySessionRow = (row: any) => {
    if (!row) return false;
    const rowPlate = normalizePlate(row.car_plate || row.carPlate);
    const rowPhone = normalizePhone(row.customer_phone || row.customerPhone || '');
    return (
      (!!userPlate && rowPlate === userPlate) ||
      (!!userPhone && rowPhone === userPhone)
    );
  };

  // ✅ البحث عن الجلسة النشطة بالبصمة الموحدة
  const activeSession = useMemo(() => {
    return sessions
      .filter((s) => {
        if (!s || s.status !== 'active') return false;
        if (acknowledgedSessionIds?.has(s.id)) return false;
        const samePlateMatch = !!userPlate && normalizePlate(s.carPlate) === userPlate;
        const sPhone = (s as any).customerPhone ? normalizePhone((s as any).customerPhone) : '';
        const samePhoneMatch = Boolean(userPhone && sPhone === userPhone);
        return samePlateMatch || samePhoneMatch;
      })
      .sort((a, b) => safeParseTime(b.startTime) - safeParseTime(a.startTime))[0];
  }, [sessions, userPlate, userPhone, acknowledgedSessionIds]);

  const lastCompletedSession = useMemo(() => {
    return sessions
      .filter((s) => {
        if (!s || s.status !== 'completed') return false;
        const samePlateMatch = !!userPlate && normalizePlate(s.carPlate) === userPlate;
        const sPhone = (s as any).customerPhone ? normalizePhone((s as any).customerPhone) : '';
        const samePhoneMatch = Boolean(userPhone && sPhone === userPhone);
        return samePlateMatch || samePhoneMatch;
      })
      .sort((a, b) => safeParseTime(b.endTime) - safeParseTime(a.endTime))[0];
  }, [sessions, userPlate, userPhone]);

  const garage = garages?.find(
    (g) => g.id === (activeSession?.garageId ?? lastCompletedSession?.garageId),
  );

  useEffect(() => {
    if (activeSession?.id) {
      activeSessionIdRef.current = activeSession.id;
    }
  }, [activeSession?.id]);

  const activeStartMs = useMemo(() => {
    if (!activeSession) return 0;
    const ms = safeParseTime(activeSession.startTime);
    return ms > 0 ? ms : getServerNow();
  }, [activeSession?.id, activeSession?.startTime]);

  // 📡 جلب البيانات في الخلفية
  useEffect(() => {
    fetchAll().catch((e) => console.error('Fetch error:', e));
  }, [fetchAll]);

  // 🛰️ تتبع رادار المسافة المباشر بين العميل وموقع ركنة سيارته
  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    const carLat = activeSession?.shieldAnchorLat || garage?.lat;
    const carLng = activeSession?.shieldAnchorLng || garage?.lng;

    if (!carLat || !carLng) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const clientLat = pos.coords.latitude;
        const clientLng = pos.coords.longitude;
        const dist = Math.round(haversineDistMeters(clientLat, clientLng, carLat, carLng));
        setDistanceToCar(dist);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 8000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [activeSession?.shieldAnchorLat, activeSession?.shieldAnchorLng, garage?.lat, garage?.lng]);

  // Realtime
  useEffect(() => {
    if (!userPlate && !userPhone) return;
    let cancelled = false;

    const refetch = async () => {
      if (cancelled) return;
      try { await fetchAll(); } catch (e) { console.error('❌', e); }
    };

    const channel = supabase
      .channel(`customer-session-live-${userPlate || userPhone}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions' },
        async (payload) => {
          const newRow = payload.new as any;
          const oldRow = payload.old as any;
          if (isMySessionRow(newRow) || isMySessionRow(oldRow)) {
            await refetch();
          }
        },
      )
      .subscribe();

    realtimeChannelRef.current = channel;
    pollingRef.current = setInterval(refetch, 4000);

    return () => {
      cancelled = true;
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (realtimeChannelRef.current) supabase.removeChannel(realtimeChannelRef.current);
    };
  }, [userPlate, userPhone, fetchAll]);

  // ⏱️ عداد الثواني الموحد
  useEffect(() => {
    if (!activeSession || activeStartMs <= 0) {
      setElapsed(0);
      return;
    }

    const calcElapsed = () => {
      const now = getServerNow();
      const diff = now - activeStartMs;
      return Math.max(0, Math.floor(diff / 1000));
    };

    setElapsed(calcElapsed());
    const interval = setInterval(() => setElapsed(calcElapsed()), 1000);
    return () => clearInterval(interval);
  }, [activeSession?.id, activeStartMs]);

  // التحويل التلقائي عند انتهاء الجلسة
  useEffect(() => {
    if (activeSession) {
      redirectedToSummaryRef.current = false;
      return;
    }

    if (activeSessionIdRef.current) {
      const targetSession = sessions.find((s) => s.id === activeSessionIdRef.current);
      if (targetSession && targetSession.status === 'completed' && !redirectedToSummaryRef.current) {
        redirectedToSummaryRef.current = true;
        if (targetSession.garageId) setSelectedGarageId(targetSession.garageId);
        if (typeof acknowledgeSession === 'function') acknowledgeSession(targetSession.id);
        activeSessionIdRef.current = null;
        toast.success('تم إنهاء الجلسة بنجاح ✅', { icon: '🏁', duration: 3000 });
        setTimeout(() => { setScreen('summary'); }, 400);
        return;
      }
    }
  }, [activeSession, sessions, setScreen, setSelectedGarageId, acknowledgeSession]);

  const sessionRate = Number(activeSession?.agreedPrice ?? garage?.basePrice ?? 0);
  const isFirstFreeApplied = activeSession?.isFirstFreeSession === true;
  const isShieldActive = activeSession?.securityShieldActive === true;

  // الحسابات المالية اللحظية
  const { displayedCost, displayedHours, countdownLabel, countdownTime, isFreeNow } = useMemo(() => {
    const defaultCountdown = { minutes: 59, seconds: 59 };
    const loyaltyCalc = calculateCostWithLoyalty(elapsed, sessionRate, isFirstFreeApplied, isShieldActive);

    let countdownLabel = 'الوقت المتبقي حتى الساعة التالية';
    let countdownTime = getRemainingInCurrentHour ? getRemainingInCurrentHour(elapsed) : defaultCountdown;

    if (isFirstFreeApplied && elapsed <= 1800) {
      const freeTimeRemaining = Math.max(0, 1800 - elapsed);
      const minutes = Math.floor(freeTimeRemaining / 60);
      const seconds = freeTimeRemaining % 60;
      countdownLabel = 'ينتهي الركن المجاني الهدية خلال 🎁';
      countdownTime = { minutes, seconds };
    }

    return {
      displayedCost: loyaltyCalc.cost,
      displayedHours: loyaltyCalc.totalHours,
      countdownLabel,
      countdownTime,
      isFreeNow: loyaltyCalc.isFree,
    };
  }, [isFirstFreeApplied, elapsed, sessionRate, isShieldActive]);

  // 🛡️ تفعيل درع الأمان VIP
  const handleEnableShield = async () => {
    if (!activeSession || !garage) return;
    setIsActivatingShield(true);
    toast.loading('جاري الارتباط الفضائي وتأمين السيارة...', { id: 'shield_activation' });

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const clientLat = pos.coords.latitude;
        const clientLng = pos.coords.longitude;

        try {
          const magnetic = await captureMagneticMass();
          const result = await activateShield(
            activeSession.id,
            clientLat,
            clientLng,
            garage.lat,
            garage.lng,
            magnetic
          );

          if (!result.success) {
            if (result.reason === 'outside_geofence') {
              toast.error(
                `⛔ تفعيل الدرع غير مسموح!\nأنت على بعد ${result.distance}م من الجراج.\nيجب التواجد داخل الجراج (250م) لتفعيل الحماية.`,
                { id: 'shield_activation', duration: 7000 }
              );
            } else {
              toast.error('حدث خطأ أثناء فحص الحساسات، حاول ثانية.', { id: 'shield_activation' });
            }
            setIsActivatingShield(false);
            return;
          }

          toast.success('🛡️ تم تفعيل درع الأمان VIP وتأمين مكان السيارة بنجاح!', { id: 'shield_activation', duration: 5000 });
          await fetchAll();
        } catch {
          toast.error('تعذر رصد الموقع بدقة، يرجى المحاولة ثانية.', { id: 'shield_activation' });
        } finally {
          setIsActivatingShield(false);
        }
      },
      () => {
        toast.error('⚠️ يجب تفعيل إذن الموقع الجغرافي (GPS) لتأمين السيارة.', { id: 'shield_activation' });
        setIsActivatingShield(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  if (!activeSession) {
    return (
      <div className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-8 text-right" style={{ background: BRAND.navy }}>
        <div className="text-4xl mb-4 animate-bounce">⏳</div>
        <p className="text-slate-400 text-sm font-bold text-center mb-2">جاري مزامنة بيانات الجلسة...</p>
        <button
          onClick={() => setScreen('list')}
          className="bg-blue-600 text-white border-0 px-8 py-3.5 rounded-2xl font-black text-xs active:scale-95 transition-all flex items-center gap-2 cursor-pointer mt-4"
          style={{ background: BRAND.blue }}
        >
          <ArrowRight size={15} /> <span>العودة للقائمة الرئيسية</span>
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full text-white flex flex-col justify-between p-5 overflow-y-auto safe-top safe-bottom"
      style={{ background: BRAND.navy, direction: 'rtl' }}
    >
      {/* ═══ الجزء العلوي: هيدر السيارة والجراج ═══ */}
      <div className="pt-2 shrink-0">
        {/* شارة الهدية الترحيبية إن وجدت */}
        {isFirstFreeApplied && (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full border rounded-2xl p-2.5 mb-3 flex items-center justify-between"
            style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(217, 119, 6, 0.2) 100%)',
              borderColor: 'rgba(245,158,11,0.35)',
            }}
          >
            <div className="flex items-center gap-1.5 text-xs font-black text-amber-400">
              <Gift size={15} className="animate-bounce shrink-0" />
              <span>أول 30 دقيقة مجاناً كهدية ترحيبية 🎁</span>
            </div>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-400 text-slate-950">
              {isFreeNow ? 'نشطة' : 'انتهت'}
            </span>
          </motion.div>
        )}

        {/* كارت هوية الركنة والمربع الشطرنجي */}
        <div className="flex items-center justify-between bg-white/[0.03] border border-white/10 rounded-2xl p-3.5 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Car size={20} />
            </div>
            <div>
              <div className="text-sm font-black font-mono text-white tracking-wider">
                🚗 {activeSession.carPlate || currentUser?.carPlate || '---'}
              </div>
              <div className="text-[11px] font-bold text-slate-400 mt-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                {garage?.name || 'جراج معتمد'}
              </div>
            </div>
          </div>

          {/* مربع الركنة الشطرنجي المنظم */}
          {activeSession.slotId && (
            <div className="text-center px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/15">
              <span className="text-[9px] font-bold text-slate-400 block">مكان الركنة</span>
              <span className="text-base font-black font-mono text-sky-400">
                {activeSession.slotId}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ═══ الجزء الأوسط: عداد الـ Cockpit الرقمي المطور ═══ */}
      <div className="my-auto py-2 flex flex-col items-center">
        {/* شاسيه العداد الرقمي المتوهج */}
        <div 
          className="w-full relative rounded-3xl p-6 border text-center overflow-hidden transition-all shadow-2xl"
          style={{
            background: 'linear-gradient(180deg, rgba(17, 30, 54, 0.95) 0%, rgba(10, 22, 40, 0.98) 100%)',
            borderColor: isFreeNow ? BRAND.green : isShieldActive ? '#0ea5e9' : BRAND.blue,
            boxShadow: isFreeNow 
              ? '0 0 35px rgba(140, 198, 63, 0.2)' 
              : isShieldActive 
              ? '0 0 35px rgba(14, 165, 233, 0.22)' 
              : '0 0 35px rgba(22, 86, 184, 0.2)'
          }}
        >
          {/* الإشعاع الخلفي التفاعلي */}
          <div 
            className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full pointer-events-none opacity-20 blur-3xl"
            style={{ background: isFreeNow ? BRAND.green : isShieldActive ? '#0ea5e9' : BRAND.blue }}
          />

          <div className="flex items-center justify-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">
            <Clock size={14} style={{ color: isFreeNow ? BRAND.green : isShieldActive ? '#38bdf8' : BRAND.blue }} />
            <span>مدة الركن المباشرة</span>
          </div>

          {/* الأرقام الضخمة للعداد */}
          <div 
            className="text-5xl font-black font-mono tracking-tight text-white my-1 drop-shadow-md"
            style={{ letterSpacing: '2px' }}
          >
            {formatTime(elapsed)}
          </div>

          {/* شريط الحساب المالي والساعات */}
          <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-white/10">
            <div className="bg-white/[0.04] p-2.5 rounded-2xl border border-white/5">
              <span className="text-[10px] font-bold text-slate-400 block mb-0.5">الساعات المحتسبة</span>
              <span className="text-xl font-black font-mono text-white">
                {displayedHours} <span className="text-xs text-slate-400">ساعة</span>
              </span>
            </div>

            <div className="bg-white/[0.04] p-2.5 rounded-2xl border border-white/5">
              <span className="text-[10px] font-bold text-slate-400 block mb-0.5">المستحق حتى الآن</span>
              <span 
                className="text-xl font-black font-mono"
                style={{ color: isFreeNow ? BRAND.green : BRAND.green }}
              >
                {displayedCost} <span className="text-xs">ج.م</span>
              </span>
            </div>
          </div>

          {/* عداد تنازلي للساعة القادمة */}
          <div className="mt-3 text-[10px] font-bold text-slate-400 flex items-center justify-center gap-1">
            <span>{countdownLabel}:</span>
            <span className="font-mono font-black text-sky-400 text-xs">
              {String(countdownTime?.minutes ?? 0).padStart(2, '0')}:{String(countdownTime?.seconds ?? 0).padStart(2, '0')}
            </span>
          </div>
        </div>

        {/* 🛰️ ═══ رادار القرب الفضائي التفاعلي المباشر (Proximity Radar) ═══ */}
        <div 
          className="w-full mt-3 rounded-2xl p-3 border flex items-center justify-between relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.05) 0%, rgba(10, 22, 40, 0.7) 100%)',
            borderColor: 'rgba(14, 165, 233, 0.25)',
          }}
        >
          <div className="flex items-center gap-3">
            {/* أيقونة الرادار المتحركة مع موجات المسح الدائرية */}
            <div className="relative w-9 h-9 rounded-full bg-sky-950 border border-sky-500/40 flex items-center justify-center shrink-0">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
                className="absolute inset-0 rounded-full border-t border-sky-400"
              />
              <Radio size={16} className="text-sky-400 animate-pulse" />
            </div>

            <div className="text-right">
              <div className="text-[10px] font-black text-slate-400">رادار المسافة الفعلي</div>
              <div className="text-xs font-black text-white mt-0.5 flex items-center gap-1.5">
                {distanceToCar !== null ? (
                  distanceToCar <= 3 ? (
                    <span className="text-emerald-400 font-mono">🟢 بجوار سيارتك تماماً (0م)</span>
                  ) : distanceToCar <= 25 ? (
                    <span className="text-sky-400 font-mono">🅿️ متواجد داخل محيط الجراج ({distanceToCar}م)</span>
                  ) : (
                    <span className="text-slate-200 font-mono">📍 على بعد {distanceToCar} متر من السيارة</span>
                  )
                ) : (
                  <span className="text-slate-400 text-[10px] animate-pulse">جاري قياس المسافة الفضائية...</span>
                )}
              </div>
            </div>
          </div>

          <Compass size={16} className="text-sky-400/60 shrink-0" />
        </div>

        {/* 🛡️ ═══ بطاقة درع الأمان VIP الفاخرة والمبسطة ═══ */}
        {activeSession.source === 'app' && (
          <div 
            className="w-full mt-3 rounded-2xl p-4 border transition-all"
            style={{
              background: isShieldActive 
                ? 'linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(17, 30, 54, 0.9) 100%)' 
                : BRAND.navyLight,
              borderColor: isShieldActive ? '#0ea5e970' : BRAND.border,
            }}
          >
            <div className="flex justify-between items-center mb-2">
              <span 
                className="text-[9px] font-black px-2.5 py-1 rounded-full border flex items-center gap-1"
                style={{
                  background: isShieldActive ? '#0ea5e9' : 'rgba(255,255,255,0.05)',
                  borderColor: isShieldActive ? '#38bdf8' : BRAND.border,
                  color: isShieldActive ? '#ffffff' : BRAND.slateMuted,
                }}
              >
                <Zap size={10} className={isShieldActive ? 'animate-bounce' : ''} />
                {isShieldActive ? 'مفعّل ونشط 🔒' : 'إضافي اختياري'}
              </span>

              <div className="flex items-center gap-1.5">
                <span className="font-black text-sm" style={{ color: isShieldActive ? '#38bdf8' : '#ffffff' }}>
                  درع الأمان الفضائي VIP
                </span>
                <Shield size={16} className={isShieldActive ? 'text-sky-400 fill-sky-400/20' : 'text-slate-400'} />
              </div>
            </div>

            {/* جملة مبسطة واحترافية بدون تفاصيل تقنية معقدة */}
            <p className="text-[11px] font-semibold text-slate-300 leading-relaxed mb-3.5 text-right">
              {isShieldActive ? (
                <span>
                  🔒 <b className="text-sky-300">سيارتك تحت الحراسة اللحظية الآن.</b> يتم تأمين مكان الركنة برادار التتبع والـ GPS، وسينطلق إنذار الطوارئ للسايس وتُقفل البوابة فوراً عند أي تحرك غير مصرح به.
                </span>
              ) : (
                <span>
                  تأمين شامل وحراسة فورية لسيارتك أثناء غيابك بأحدث تقنيات الرصد والتتبع. تكلفة الخدمة ثابتة (10 ج.م) تُضاف للفاتورة النهائية.
                </span>
              )}
            </p>

            <AnimatePresence mode="wait">
              {!isShieldActive ? (
                <motion.button
                  key="activate-btn"
                  onClick={handleEnableShield}
                  disabled={isActivatingShield}
                  className="w-full py-3 rounded-xl font-black text-xs border-0 text-white flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #1d68dc 0%, #1656b8 100%)',
                    boxShadow: '0 4px 14px rgba(22, 86, 184, 0.3)',
                  }}
                >
                  {isActivatingShield ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      جاري تفعيل الحماية وتأمين الركنة...
                    </span>
                  ) : (
                    <>
                      <Shield size={14} />
                      <span>تفعيل درع الحماية وتأمين السيارة (+10 ج.م)</span>
                    </>
                  )}
                </motion.button>
              ) : (
                <div 
                  className="rounded-xl p-2.5 border text-center flex items-center justify-center gap-1.5"
                  style={{
                    background: 'rgba(14, 165, 233, 0.08)',
                    borderColor: '#0ea5e930',
                  }}
                >
                  <Lock size={12} className="text-sky-400" />
                  <span className="font-black text-[10.5px] text-sky-400">
                    الحماية مفعلة وثابتة طوال فترة تواجد السيارة داخل الجراج
                  </span>
                </div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ═══ الجزء السفلي: أزرار الإنهاء والعودة ═══ */}
      <div className="pt-2 shrink-0 space-y-2">
        <button
          onClick={() => setScreen('summary')}
          className="w-full py-3.5 rounded-2xl active:scale-[0.98] transition-all flex items-center justify-center border-0 text-white cursor-pointer font-black text-sm shadow-xl"
          style={{
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            boxShadow: '0 4px 16px rgba(220,38,38,0.3)',
          }}
        >
          {isFreeNow && !isShieldActive ? (
            <span>🚗 إنهاء الجلسة والدفع (مجاناً 🎁)</span>
          ) : (
            <span>🚗 إنهاء الجلسة وحساب الفاتورة ({displayedCost} ج.م)</span>
          )}
        </button>

        <button
          onClick={() => setScreen('list')}
          className="w-full py-2.5 rounded-xl border cursor-pointer bg-transparent text-xs font-bold text-slate-400"
          style={{ borderColor: BRAND.border }}
        >
          العودة للقائمة الرئيسية
        </button>
      </div>
    </motion.div>
  );
}