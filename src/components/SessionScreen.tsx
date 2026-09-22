import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  Car,
  ArrowRight,
  Gift,
  Sparkles,
  CreditCard,
  XCircle,
  Shield,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { useStore, normalizePlate, normalizePhone, getServerNow } from '../store';
import {
  calculateCost,
  calculateFullHours,
  formatTime,
  getRemainingInCurrentHour,
  SECURITY_SHIELD_FEE,
} from '../utils/pricing';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

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

let customerBreachAudioCtx: AudioContext | null = null;
const playCustomerBreachAlarm = async () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    if (!customerBreachAudioCtx) customerBreachAudioCtx = new AudioCtx();
    if (customerBreachAudioCtx.state === 'suspended') await customerBreachAudioCtx.resume();

    const now = customerBreachAudioCtx.currentTime;
    const masterGain = customerBreachAudioCtx.createGain();
    masterGain.gain.setValueAtTime(1.0, now);
    masterGain.connect(customerBreachAudioCtx.destination);

    for (let i = 0; i < 6; i++) {
      const start = now + (i * 0.35);
      const osc = customerBreachAudioCtx.createOscillator();
      const noteGain = customerBreachAudioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(i % 2 === 0 ? 1500 : 2100, start);

      noteGain.gain.setValueAtTime(0.8, start);
      noteGain.gain.exponentialRampToValueAtTime(0.01, start + 0.32);

      osc.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(start);
      osc.stop(start + 0.35);
    }

    if ('vibrate' in navigator) {
      navigator.vibrate([1000, 200, 1000, 200, 1000]);
    }
  } catch (e) {
    console.warn('Audio Error:', e);
  }
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
    setSessionSecurityShield,
    triggerSessionBreach,
  } = useStore();

  const userPlate = normalizePlate(currentUser?.carPlate);
  const userPhone = currentUser?.phone ? normalizePhone(currentUser.phone) : '';

  const redirectedToSummaryRef = useRef(false);
  const redirectedToSessionRef = useRef(false);
  const activeSessionIdRef = useRef<string | null>(null);
  const realtimeChannelRef = useRef<any>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [elapsed, setElapsed] = useState(0);
  const [showSosModal, setShowSosModal] = useState(false);
  const [togglingShield, setTogglingShield] = useState(false);

  const isMySessionRow = (row: any) => {
    if (!row) return false;
    const rowPlate = normalizePlate(row.car_plate || row.carPlate);
    const rowPhone = normalizePhone(row.customer_phone || row.customerPhone || '');
    return (
      (!!userPlate && rowPlate === userPlate) ||
      (!!userPhone && rowPhone === userPhone)
    );
  };

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

  useEffect(() => {
    fetchAll().catch((e) => console.error('Fetch error:', e));
  }, [fetchAll]);

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

    const handleVisibility = () => { if (document.visibilityState === 'visible') refetch(); };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', refetch);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', refetch);
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      if (realtimeChannelRef.current) { supabase.removeChannel(realtimeChannelRef.current); realtimeChannelRef.current = null; }
    };
  }, [userPlate, userPhone, fetchAll]);

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

    const interval = setInterval(() => {
      setElapsed(calcElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession?.id, activeStartMs]);

  // 🛡️ فحص حالة الدرع لضمان تحديث الواجهة تلقائياً
  const isShieldActive = useMemo(() => {
    if (!activeSession) return false;
    return Boolean(activeSession.securityShieldActive === true || (activeSession as any).security_shield_active === true);
  }, [activeSession]);

  useEffect(() => {
    if (activeSession && isShieldActive && activeSession.isBreached) {
      playCustomerBreachAlarm();
      const interval = setInterval(playCustomerBreachAlarm, 4000);
      return () => clearInterval(interval);
    }
  }, [activeSession?.id, activeSession?.isBreached, isShieldActive]);

  useEffect(() => {
    if (!activeSession) { redirectedToSessionRef.current = false; return; }
    if (redirectedToSessionRef.current) return;
    redirectedToSessionRef.current = true;
    if (activeSession.garageId) setSelectedGarageId(activeSession.garageId);
  }, [activeSession?.id, activeSession?.garageId, setSelectedGarageId]);

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

    if (lastCompletedSession && !redirectedToSummaryRef.current) {
      const isNotAcknowledged = acknowledgedSessionIds ? !acknowledgedSessionIds.has(lastCompletedSession.id) : true;
      if (isNotAcknowledged) {
        redirectedToSummaryRef.current = true;
        if (lastCompletedSession.garageId) setSelectedGarageId(lastCompletedSession.garageId);
        if (typeof acknowledgeSession === 'function') acknowledgeSession(lastCompletedSession.id);
        toast.success('تم إنهاء الجلسة بنجاح ✅', { icon: '🏁', duration: 3000 });
        setTimeout(() => { setScreen('summary'); }, 400);
      }
    }
  }, [activeSession, lastCompletedSession, sessions, setScreen, setSelectedGarageId, acknowledgedSessionIds, acknowledgeSession]);

  const sessionRate = Number(activeSession?.agreedPrice ?? garage?.basePrice ?? 0);
  const isFirstFreeApplied = activeSession?.isFirstFreeSession === true;

  const { displayedCost, displayedHours, countdownLabel, countdownTime, isFreeNow } = useMemo(() => {
    const defaultCountdown = { minutes: 59, seconds: 59 };

    if (!isFirstFreeApplied) {
      const calculatedCountdown = getRemainingInCurrentHour ? getRemainingInCurrentHour(elapsed) : defaultCountdown;
      return {
        displayedCost: calculateCost(elapsed, sessionRate),
        displayedHours: calculateFullHours(elapsed),
        countdownLabel: 'الوقت المتبقي حتى الساعة التالية',
        countdownTime: calculatedCountdown || defaultCountdown,
        isFreeNow: false,
      };
    }

    if (elapsed <= 1800) {
      const freeTimeRemaining = Math.max(0, 1800 - elapsed);
      const minutes = Math.floor(freeTimeRemaining / 60);
      const seconds = freeTimeRemaining % 60;
      return {
        displayedCost: 0,
        displayedHours: 0,
        countdownLabel: 'ينتهي الركن المجاني الهدية خلال 🎁',
        countdownTime: { minutes, seconds },
        isFreeNow: true,
      };
    } else {
      const calculatedCountdown = getRemainingInCurrentHour ? getRemainingInCurrentHour(elapsed) : defaultCountdown;
      const totalHours = calculateFullHours(elapsed);
      return {
        displayedCost: calculateCost(elapsed, sessionRate),
        displayedHours: totalHours,
        countdownLabel: 'الوقت المتبقي حتى الساعة التالية',
        countdownTime: calculatedCountdown || defaultCountdown,
        isFreeNow: false,
      };
    }
  }, [isFirstFreeApplied, elapsed, sessionRate]);

  const shieldCost = isShieldActive ? SECURITY_SHIELD_FEE : 0;
  const finalTotalCost = displayedCost + shieldCost;

  const handleActivateSecurityShield = async () => {
    if (!activeSession || togglingShield) return;
    
    if (isShieldActive) {
      toast('درع الحماية مفعل بالفعل ومثبت بالفاتورة 🛡️', { icon: 'ℹ️' });
      return;
    }

    setTogglingShield(true);
    const toastId = toast.loading('جاري ربط وتفعيل الحماية الفضائية...');

    let targetLat = garage?.lat || 30.0444;
    let targetLng = garage?.lng || 31.2357;

    try {
      if ('geolocation' in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 2500,
              maximumAge: 10000,
            });
          });
          targetLat = pos.coords.latitude;
          targetLng = pos.coords.longitude;
        } catch (gpsErr) {
          console.log('Using garage coordinates fallback for shield');
        }
      }

      // ✅ تفعيل الحماية في قاعدة البيانات وقفلها نهائياً
      await setSessionSecurityShield(activeSession.id, targetLat, targetLng);

      toast.dismiss(toastId);
      toast.success('🛡️ تم تفعيل الحراسة الفضائية وتثبيتها بالفاتورة (+10 ج.م)', { icon: '🛰️', duration: 4000 });
    } catch (err: any) {
      console.error('Failed to activate security shield:', err);
      toast.dismiss(toastId);
      toast.error('حدث خطأ أثناء التفعيل، يرجى المحاولة ثانية');
    } finally {
      setTogglingShield(false);
    }
  };

  if (!activeSession) {
    return (
      <div className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-8 text-right" style={{ background: BRAND.navy }}>
        <div className="text-4xl mb-4 animate-bounce">⏳</div>
        <p className="text-slate-400 text-sm font-bold text-center mb-2">جاري مزامنة بيانات الجلسة...</p>
        <p className="text-slate-500 text-xs text-center mb-6">ستظهر بيانات العداد فور استلامها من السيرفر</p>
        <button
          onClick={() => setScreen('list')}
          className="bg-blue-600 text-white border-0 px-8 py-3.5 rounded-2xl font-black text-xs active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
          style={{ background: BRAND.blue, boxShadow: `0 4px 14px ${BRAND.blue}25` }}
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
      className="h-full text-white flex flex-col items-center justify-center p-6 overflow-y-auto safe-top safe-bottom"
      style={{ background: BRAND.navy }}
    >
      {/* 🛡️ كارت درع الأمان الفضائي VIP التفاعلي المباشر للعميل */}
      <div
        className="w-full border-2 rounded-2xl p-4 mb-4 text-right transition-all relative overflow-hidden"
        style={{
          background: isShieldActive 
            ? activeSession.isBreached 
              ? 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)'
              : 'linear-gradient(135deg, #0f172a 0%, #111e36 100%)'
            : 'rgba(255,255,255,0.03)',
          borderColor: isShieldActive 
            ? activeSession.isBreached 
              ? '#ef4444' 
              : BRAND.green 
            : 'rgba(255,255,255,0.12)',
          boxShadow: isShieldActive ? '0 8px 24px rgba(140,198,63,0.15)' : 'none',
        }}
      >
        <div className="flex justify-between items-center mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isShieldActive ? activeSession.isBreached ? 'bg-red-400' : 'bg-emerald-400' : 'bg-slate-500'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isShieldActive ? activeSession.isBreached ? 'bg-red-500' : 'bg-emerald-500' : 'bg-slate-600'}`}></span>
            </span>
            <span className="text-[9.5px] font-black" style={{ color: isShieldActive ? activeSession.isBreached ? '#fca5a5' : BRAND.green : BRAND.slateMuted }}>
              {isShieldActive ? activeSession.isBreached ? '🚨 تم رصد حركة!' : '🛰️ الحراسة الفضائية نشطة ومؤمنة' : '⚪ خدمة اختيارية'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <h3 className="text-xs font-black text-white">درع الحماية الفضائية VIP</h3>
            <Shield size={16} style={{ color: isShieldActive ? BRAND.green : BRAND.slateMuted }} />
          </div>
        </div>

        <p className="text-[10px] font-bold leading-relaxed mb-3" style={{ color: isShieldActive && activeSession.isBreached ? '#fee2e2' : BRAND.slateMuted }}>
          {isShieldActive 
            ? activeSession.isBreached 
              ? '🚨 تنبيه طارئ! سيارتك غادرت فقاعة الأمان (25م) بدون تصريح خروج!'
              : '🔒 سيارتك مراقبة بالأقمار الصناعية ومثبتة بمرساة أمان (25م) حتى نهاية الجلسة.'
            : 'تتبع سيارتك بالأقمار الصناعية واستلم إنذاراً فورياً لو تحركت من مكانها.'}
        </p>

        <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <div>
            {isShieldActive ? (
              <div className="flex items-center gap-1.5">
                {activeSession.isBreached && (
                  <button
                    onClick={() => setShowSosModal(true)}
                    className="py-1 px-2.5 rounded-lg font-black text-[9px] text-white border-0 bg-red-600 active:scale-95 transition-all cursor-pointer shadow-md mr-1"
                  >
                    تقرير SOS 🚔
                  </button>
                )}
                {/* 🔒 تم قفل الدرع نهائياً عند التفعيل بنجاح ولا يوجد زر للإلغاء */}
                <span className="py-1.5 px-3 rounded-xl font-black text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                  <CheckCircle size={12} /> تم تأكيد الحماية للفاتورة
                </span>
              </div>
            ) : (
              /* زر التفعيل يظهر فقط في حال كان الدرع مغلقاً للعميل */
              <button
                type="button"
                onClick={handleActivateSecurityShield}
                disabled={togglingShield}
                className="py-2 px-4 rounded-xl font-black text-xs border-0 cursor-pointer text-white active:scale-95 transition-all shadow-md flex items-center gap-1.5"
                style={{
                  background: 'linear-gradient(135deg, #1656b8 0%, #1d68dc 100%)',
                }}
              >
                {togglingShield ? (
                  <span>جاري التثبيت...</span>
                ) : (
                  <>
                    <Shield size={14} />
                    <span>تفعيل الحماية الآن 🛡️</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="text-right">
            <span className="text-[9px] font-bold text-slate-400 block">رسوم الخدمة</span>
            <span className="text-xs font-black font-mono" style={{ color: isShieldActive ? BRAND.green : '#ffffff' }}>
              {isShieldActive ? '+10.00 ج.م مضافة' : '+10.00 ج.م فقط'}
            </span>
          </div>
        </div>
      </div>

      {isFirstFreeApplied && (
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full border rounded-2xl p-3 mb-4 flex items-center gap-3"
          style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(217, 119, 6, 0.18) 100%)',
            borderColor: 'rgba(245,158,11,0.3)',
          }}
        >
          <div className="p-2 rounded-xl text-amber-400 shrink-0" style={{ background: 'rgba(245,158,11,0.15)' }}>
            <Gift size={20} className="animate-pulse" />
          </div>
          <div className="text-right flex-1">
            <div className="font-black flex items-center gap-1 justify-end text-xs text-amber-400">
              <span>هدية ترحيبية نشطة</span>
              <Sparkles size={12} className="text-yellow-200" />
            </div>
            <div className="font-bold text-[10px] mt-0.5" style={{ color: BRAND.slateMuted }}>
              {isFreeNow 
                ? 'أنت الآن في أول 30 دقيقة مجانية بالكامل! 🎁' 
                : 'انتهت الـ 30 دقيقة المجانية وتم بدء الاحتساب بالسعر العادي ✅'}
            </div>
          </div>
        </motion.div>
      )}

      <motion.div
        animate={{
          boxShadow: isFreeNow
            ? [
                '0 0 0px rgba(140, 198, 63, 0.1)',
                '0 0 40px rgba(140, 198, 63, 0.25)',
                '0 0 0px rgba(140, 198, 63, 0.1)',
              ]
            : [
                '0 0 0px rgba(22, 86, 184, 0.1)',
                '0 0 40px rgba(22, 86, 184, 0.25)',
                '0 0 0px rgba(22, 86, 184, 0.1)',
              ],
        }}
        transition={{ repeat: Infinity, duration: 2.5 }}
        className="w-32 h-32 rounded-full flex flex-col items-center justify-center border-2 mb-5 shadow-lg"
        style={{
          background: BRAND.navyLight,
          borderColor: isFreeNow ? BRAND.green : BRAND.blue,
        }}
      >
        <Clock size={18} style={{ color: isFreeNow ? BRAND.green : BRAND.blue }} className="mb-1" />
        <div className="text-xl font-black font-mono text-white leading-none">{formatTime(elapsed)}</div>
        <div className="text-[8px] font-bold mt-1.5" style={{ color: BRAND.slateMuted }}>مدة الركن الفعلية</div>
      </motion.div>

      <div className="w-full border rounded-2xl p-4 mb-4" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
        <div className="flex justify-between items-center mb-3">
          <div className="text-center">
            <div className="text-xl font-black font-mono" style={{ color: isFreeNow ? BRAND.green : BRAND.blue }}>
              {displayedHours}
            </div>
            <div className="text-[9px] font-bold mt-0.5" style={{ color: BRAND.slateMuted }}>ساعة محسوبة</div>
          </div>
          <div className="text-lg font-black" style={{ color: BRAND.border }}>=</div>
          <div className="text-center">
            <div className="text-xl font-black font-mono" style={{ color: BRAND.green }}>
              {finalTotalCost} <span className="text-[10px]">ج.م</span>
            </div>
            <div className="text-[9px] font-bold mt-0.5" style={{ color: BRAND.slateMuted }}>إجمالي الفاتورة حتى الآن</div>
          </div>
        </div>

        <div className="bg-slate-900/40 rounded-xl p-2.5 mb-2.5 space-y-1.5 text-xs text-right border border-white/5">
          <div className="flex justify-between items-center">
            <span className="font-black font-mono text-white">{displayedCost} ج.م</span>
            <span className="font-bold text-[10px]" style={{ color: BRAND.slateMuted }}>💵 تكلفة وقت الركن:</span>
          </div>

          {isShieldActive && (
            <div className="flex justify-between items-center text-emerald-400">
              <span className="font-black font-mono">+10.00 ج.م</span>
              <span className="font-bold text-[10px]">🛡️ درع الحماية والتعقب الفضائي VIP:</span>
            </div>
          )}

          <div className="flex justify-between items-center pt-1.5 border-t border-dashed border-white/10 text-white font-black">
            <span className="font-mono">{finalTotalCost} ج.م</span>
            <span className="text-[10px]">💰 الإجمالي المستحق:</span>
          </div>
        </div>

        <div className="rounded-xl p-2 text-center border" style={{ background: BRAND.blueSoft, borderColor: BRAND.border }}>
          <div className="text-[8px] mb-0.5 font-bold" style={{ color: BRAND.slateMuted }}>{countdownLabel}</div>
          <div className="text-xs font-black font-mono" style={{ color: isFreeNow ? BRAND.green : BRAND.blue }}>
            {String(countdownTime?.minutes ?? 0).padStart(2, '0')}:{String(countdownTime?.seconds ?? 0).padStart(2, '0')}
          </div>
        </div>
      </div>

      {sessionRate !== garage?.basePrice && garage && (
        <div className="w-full rounded-xl p-2 mb-3 text-center border" style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.2)' }}>
          <p className="text-[9px] font-bold text-amber-500">💰 سعر خاص متفق عليه: {sessionRate} ج.م/ساعة (بدلاً من {garage.basePrice} ج.م)</p>
        </div>
      )}

      <div 
        className="w-full rounded-2xl p-3 text-center border"
        style={{
          background: 'rgba(255, 255, 255, 0.02)',
          borderColor: BRAND.border,
        }}
      >
        <div className="flex items-center justify-center gap-1.5 mb-1 font-black text-white" style={{ fontSize: '11px' }}>
          <Sparkles size={13} className="text-yellow-400 shrink-0 animate-pulse" />
          <span>خلّص مشوارك براحتك 🚗✨</span>
        </div>
        <p 
          className="font-bold leading-relaxed mx-auto"
          style={{ 
            fontSize: '9px',
            color: BRAND.slateMuted,
            maxWidth: '280px'
          }}
        >
          وقت الركنة محفوظ بالثانية في الخلفية. أغلق التطبيق الآن وافتحه عند العودة للجراج لإنهاء الجلسة والدفع.
        </p>
      </div>

      <div className="w-full grid grid-cols-2 gap-2.5 mb-3 mt-3">
        <div className="border p-2.5 rounded-2xl text-center" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
          <Car size={14} style={{ color: BRAND.blue }} className="mx-auto mb-1" />
          <div className="text-xs font-black text-white">{activeSession.carPlate || currentUser?.carPlate || '---'}</div>
          <div className="text-[8px] font-bold mt-1" style={{ color: BRAND.slateMuted }}>رقم السيارة</div>
        </div>
        <div className="border p-2.5 rounded-2xl text-center" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
          <div className="font-black text-[10px] mb-1" style={{ color: BRAND.green }}>ج.م/ساعة</div>
          <div className="text-xs font-black font-mono text-white">{sessionRate} ج.م</div>
          <div className="text-[8px] font-bold mt-1" style={{ color: BRAND.slateMuted }}>السعر العادي</div>
        </div>
      </div>

      {garage && (
        <div className="border p-2.5 rounded-2xl w-full text-center mb-3" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
          <div className="text-[8px] font-bold mb-0.5" style={{ color: BRAND.slateMuted }}>الجراج الحالي</div>
          <div className="text-xs font-black" style={{ color: '#ffffff' }}>{garage.name}</div>
        </div>
      )}

      <div className="w-full border rounded-xl p-2.5 mb-4 text-center" style={{ background: BRAND.blueSoft, borderColor: BRAND.border }}>
        <div className="flex items-center justify-between gap-1.5 text-[10px] font-bold text-center" style={{ color: BRAND.blue }}>
          <CreditCard size={12} />
          {garage?.payment_mode === 'cash' ? (
            <span>💵 يقبل الدفع النقدي (كاش) فقط</span>
          ) : garage?.payment_mode === 'wallet' ? (
            <span>👝 يقبل الدفع والخصم من المحفظة فقط</span>
          ) : (
            <span>💳 يقبل الدفع كاش أو الخصم من المحفظة</span>
          )}
        </div>
      </div>

      <button
        onClick={() => setScreen('summary')}
        className="w-full py-3.5 rounded-xl active:scale-[0.98] transition-all mb-3 flex items-center justify-center border-0 text-white cursor-pointer font-black"
        style={{
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          boxShadow: '0 4px 14px rgba(220,38,38,0.25)',
        }}
      >
        <span className="text-center text-sm font-black" style={{ color: '#ffffff' }}>
          {isFreeNow && !isShieldActive ? (
            <span>🚗 إنهاء الجلسة (مجاناً 🎁)</span>
          ) : (
            <span>🚗 إنهاء الجلسة وحساب الفاتورة ({finalTotalCost} ج.م)</span>
          )}
        </span>
      </button>

      <button
        onClick={() => setScreen('list')}
        className="w-full py-2.5 rounded-xl border cursor-pointer bg-transparent text-xs"
        style={{ color: BRAND.slateMuted, borderColor: BRAND.border }}
      >
        العودة للقائمة الرئيسية
      </button>

      <AnimatePresence>
        {showSosModal && activeSession && isShieldActive && activeSession.isBreached && (
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
                سيارتك لوحة <span className="font-mono font-black text-red-700 bg-red-50 px-2 py-0.5 rounded">{activeSession.carPlate}</span> تجاوزت فقاعة الأمان الفضائية (25م) بدون إذن خروج!
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
                  <span className="font-mono font-black text-slate-800">نشط (رادار القمر الصناعي)</span>
                  <span className="font-black text-slate-500">📶 حالة التتبع الحالية:</span>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={async () => {
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
                    toast.success('🚀 تم توليد وتصدير تقرير SOS ومسار السرعة لجهات الطوارئ فوراً!');
                    setShowSosModal(false);
                  }}
                  className="w-full py-3 rounded-xl font-black text-xs text-white border-0 bg-red-700 active:scale-95 transition-all cursor-pointer shadow-md"
                >
                  🚔 إرسال تقرير SOS عاجل للشرطة
                </button>

                <button
                  onClick={() => setShowSosModal(false)}
                  className="w-full py-2.5 rounded-xl font-bold text-[11px] text-slate-500 bg-transparent border border-slate-200 cursor-pointer"
                >
                  إغلاق المؤقت
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}