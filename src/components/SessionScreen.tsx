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
  AlertTriangle,
  Locate,
  Navigation,
  Compass,
} from 'lucide-react';
// 🌟 استيراد getServerNow ودوال البصمة لضمان مطابقة العداد بالملي ثانية بين جميع الهواتف
import { useStore, normalizePlate, normalizePhone, getServerNow } from '../store';
import {
  calculateFullHours,
  calculateCost,
  formatTime,
  getRemainingInCurrentHour,
} from '../utils/pricing';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

/* ─── 🎨 الألوان الرسمية الفاخرة لتطبيق Park'n 24 ─── */
const BRAND = {
  blue: '#1656b8',       // الأزرق الرسمي
  blueDark: '#0f3d85',   // الكحلي الفخم
  blueLight: '#e8f0fe',  // الأزرق الفاتح جداً
  blueSoft: 'rgba(22, 86, 184, 0.08)', // كحلي زجاجي ناعم
  green: '#8cc63f',      // الأخضر الرسمي
  greenDark: '#6ea62a',  // أخضر داكن للخطوط
  greenLight: 'rgba(140, 198, 63, 0.12)', // خلفية خضراء ناعمة
  navy: '#0a1628',       // الكحلي الليلي الغامق للواجهة
  navyLight: '#111e36',  // كحلي أفتح للبطاقات والـ overlays
  slate: '#64748b',      // الرمادي الهادئ
  slateMuted: '#94a3b8', // الرمادي الباهت
  border: 'rgba(255, 255, 255, 0.08)', // حدود زجاجية رفيعة
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

// 🔊 نظام صوت إنذار الاختراق اللحظي لهاتف العميل
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

    // 6 صفارات إنذار متتالية حادة جداً لاختراق الهدوء وتنبيه العميل
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
    // 🛡️ استدعاء دوال الحماية من الـ Store
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
  const [showSosModal, setShowSosModal] = useState(false); // نافذة طوارئ الشرطة
  const [togglingShield, setTogglingShield] = useState(false); // مؤشر تحميل تفعيل الدرع

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

  // ✅ حساب وقت البداية مع Fallback بتوقيت السيرفر الموحد
  const activeStartMs = useMemo(() => {
    if (!activeSession) return 0;
    const ms = safeParseTime(activeSession.startTime);
    return ms > 0 ? ms : getServerNow();
  }, [activeSession?.id, activeSession?.startTime]);

  // 📡 جلب البيانات في الخلفية
  useEffect(() => {
    fetchAll().catch((e) => console.error('Fetch error:', e));
  }, [fetchAll]);

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

  // ⏱️ عداد الثواني اللحظي الموحد مع سيرفر قاعدة البيانات
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

  // 🚨 [مراقبة أمنية] لو السيارة مخترقة وصوت الإنذار يعمل
  useEffect(() => {
    if (activeSession && activeSession.isBreached) {
      playCustomerBreachAlarm();
      const interval = setInterval(playCustomerBreachAlarm, 4000);
      return () => clearInterval(interval);
    }
  }, [activeSession?.id, activeSession?.isBreached]);

  useEffect(() => {
    if (!activeSession) { redirectedToSessionRef.current = false; return; }
    if (redirectedToSessionRef.current) return;
    redirectedToSessionRef.current = true;
    if (activeSession.garageId) setSelectedGarageId(activeSession.garageId);
  }, [activeSession?.id, activeSession?.garageId, setSelectedGarageId]);

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

  // 🎁 الحسابات التفاعلية لـ (30 دقيقة مجانية)
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

  // 🛡️ حاسب قيمة درع الأمان المدفوعة (+10 ج.م ثابتة في الفاتورة والتكلفة اللحظية)
  const shieldCost = activeSession?.securityShieldActive ? 10 : 0;
  const finalTotalCost = displayedCost + shieldCost;

  // 🛡️ تفعيل أو إلغاء تفعيل درع الأمان مقابل 10 ج.م ثابتة بمرونة تامة
  const handleToggleSecurityShield = async () => {
    if (!activeSession || togglingShield) return;
    setTogglingShield(true);

    const nextState = !activeSession.securityShieldActive;

    try {
      if (nextState) {
        // تفعيل الدرع: الحصول على موقع GPS وتثبيت المرساة
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            await setSessionSecurityShield(
              activeSession.id,
              pos.coords.latitude,
              pos.coords.longitude
            );
            toast.success('🛡️ تم تفعيل درع الأمان الفضائي بنجاح! (+10 ج.م ثابتة)', { icon: '🛰️', duration: 4000 });
            setTogglingShield(false);
          },
          async () => {
            // Fallback لبيانات الجراج في حال تعذر الـ GPS
            const lat = garage?.lat || 30.0444;
            const lng = garage?.lng || 31.2357;
            await setSessionSecurityShield(activeSession.id, lat, lng);
            toast.success('🛡️ تم تفعيل درع الأمان استناداً لموقع الجراج! (+10 ج.م ثابتة)', { icon: '🛰️', duration: 4000 });
            setTogglingShield(false);
          },
          { enableHighAccuracy: true, timeout: 6000 }
        );
      } else {
        // إلغاء تفعيل الدرع
        await supabase
          .from('sessions')
          .update({ security_shield_active: false, is_breached: false })
          .eq('id', activeSession.id);

        useStore.setState((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === activeSession.id
              ? { ...s, securityShieldActive: false, isBreached: false }
              : s
          ),
        }));

        toast('تم إلغاء تفعيل درع الأمان وحذف رسوم الخدمة 🔓', { icon: '🔓', duration: 3000 });
        setTogglingShield(false);
      }
    } catch (e) {
      console.error(e);
      toast.error('عذراً، فشل تعديل حالة درع الأمان حالياً.');
      setTogglingShield(false);
    }
  };

  // شاشة الانتظار والمزامنة
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
      {/* 🛡️ كارت درع الأمان الفضائي المدفوع VIP (+10 ج.م ثابتة) */}
      <div
        className="w-full border rounded-2xl p-4 mb-4 text-right transition-all relative overflow-hidden"
        style={{
          background: activeSession.isBreached
            ? 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)'
            : activeSession.securityShieldActive 
              ? 'linear-gradient(135deg, #111827 0%, #0f172a 100%)'
              : 'rgba(255,255,255,0.02)',
          borderColor: activeSession.isBreached 
            ? '#ef4444' 
            : activeSession.securityShieldActive 
              ? BRAND.blue 
              : BRAND.border,
          boxShadow: activeSession.securityShieldActive ? '0 6px 20px rgba(22,86,184,0.15)' : 'none',
        }}
      >
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${activeSession.isBreached ? 'bg-red-400' : activeSession.securityShieldActive ? 'bg-sky-400' : 'bg-slate-500'}`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${activeSession.isBreached ? 'bg-red-500' : activeSession.securityShieldActive ? 'bg-sky-500' : 'bg-slate-600'}`}></span>
            </span>
            <span className="text-[10px] font-black" style={{ color: activeSession.isBreached ? '#fca5a5' : activeSession.securityShieldActive ? '#38bdf8' : BRAND.slateMuted }}>
              {activeSession.isBreached ? '🚨 تم الاختراق!' : activeSession.securityShieldActive ? '🛰️ درع الأمان نشط' : '🔓 الحماية غير نشطة'}
            </span>
          </div>

          <Shield size={18} style={{ color: activeSession.isBreached ? '#ef4444' : activeSession.securityShieldActive ? BRAND.green : BRAND.slateMuted }} />
        </div>

        <h3 className="text-xs font-black mb-1 text-white">درع الحماية والتعقب الفضائي VIP 🛡️</h3>
        <p className="text-[10px] font-bold leading-relaxed mb-3" style={{ color: activeSession.isBreached ? '#fee2e2' : BRAND.slateMuted }}>
          {activeSession.isBreached 
            ? 'تنبيه عاجل! السيارة غادرت فقاعة الأمان الجغرافية (25م) بدون تصريح!'
            : 'قفل رقمي ذكي يراقب سيارتك على مدار الثانية عبر الأقمار الصناعية ويرسل إنذاراً فورياً لو تحركت.'}
        </p>

        <div className="flex items-center justify-between border-t pt-3 mt-2" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex gap-2">
            {activeSession.isBreached && (
              <button
                onClick={() => setShowSosModal(true)}
                className="py-1.5 px-3 rounded-xl font-black text-[9px] text-white border-0 bg-red-600 active:scale-95 transition-all cursor-pointer shadow-md"
              >
                فتح تقرير SOS 🚔
              </button>
            )}

            <button
              onClick={handleToggleSecurityShield}
              disabled={togglingShield}
              className="py-1.5 px-3.5 rounded-xl font-black text-[10px] border-0 cursor-pointer text-white active:scale-95 transition-all shadow-md"
              style={{
                background: activeSession.securityShieldActive ? '#ef4444' : BRAND.blue,
              }}
            >
              {togglingShield ? 'جاري التعديل...' : activeSession.securityShieldActive ? 'تعطيل الحماية 🔓' : 'تفعيل الخدمة 🛡️'}
            </button>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-black text-white block">تكلفة الخدمة الثابتة</span>
            <span className="text-[11px] font-black font-mono" style={{ color: BRAND.green }}>+10.00 ج.م فقط</span>
          </div>
        </div>
      </div>

      {/* 🎁 شارة مميزة علوية ترحيبية في العداد إذا كانت الجلسة مجانية */}
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

      {/* حلقة العداد الدائرية الكبيرة المتوهجة بالكامل */}
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

      {/* كارت الحساب التفاعلي مع تفصيل الـ 10 ج.م للدرع */}
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
            <div className="text-[9px] font-bold mt-0.5" style={{ color: BRAND.slateMuted }}>إجمالي الفاتورة المستحقة</div>
          </div>
        </div>

        {/* تفصيل الفاتورة الشفاف */}
        <div className="bg-slate-900/40 rounded-xl p-2.5 mb-2.5 space-y-1.5 text-xs text-right border border-white/5">
          <div className="flex justify-between items-center">
            <span className="font-black font-mono text-white">{displayedCost} ج.م</span>
            <span className="font-bold text-[10px]" style={{ color: BRAND.slateMuted }}>💵 تكلفة ركن الوقت:</span>
          </div>

          {activeSession.securityShieldActive && (
            <div className="flex justify-between items-center text-emerald-400">
              <span className="font-black font-mono">+10 ج.م</span>
              <span className="font-bold text-[10px]">🛡️ درع الحماية الفضائية VIP:</span>
            </div>
          )}

          <div className="flex justify-between items-center pt-1.5 border-t border-dashed border-white/10 text-white font-black">
            <span className="font-mono">{finalTotalCost} ج.م</span>
            <span className="text-[10px]">💰 الإجمالي المستحق:</span>
          </div>
        </div>

        {/* عداد التنازل الديناميكي */}
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

      {/* 💡 بانر إرشادي متناسق ومدمج ومريح للشاشة 💡 */}
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
          وقت الركنة محفظ بالثانية في الخلفية. أغلق التطبيق الآن وافتحه عند العودة للجراج لإنهاء الجلسة والدفع.
        </p>
      </div>

      {/* بيانات السيارة والسعر */}
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

      {/* شريط توضيح الدفع المتاح في الجراج */}
      <div className="w-full border rounded-xl p-2.5 mb-4 text-center" style={{ background: BRAND.blueSoft, borderColor: BRAND.border }}>
        <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold" style={{ color: BRAND.blue }}>
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

      {/* زر إنهاء الجلسة الفاخر */}
      <button
        onClick={() => setScreen('summary')}
        className="w-full py-3.5 rounded-xl active:scale-[0.98] transition-all mb-3 flex items-center justify-center border-0 text-white cursor-pointer font-black"
        style={{
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          boxShadow: '0 4px 14px rgba(220,38,38,0.25)',
        }}
      >
        <span className="text-center text-sm font-black" style={{ color: '#ffffff' }}>
          {isFreeNow && !activeSession.securityShieldActive ? (
            <span>🚗 إنهاء الجلسة (مجاناً 🎁)</span>
          ) : (
            <span>🚗 إنهاء الجلسة وحساب الفاتورة ({finalTotalCost} ج.م)</span>
          )}
        </span>
      </button>

      {/* زر العودة الصامت */}
      <button
        onClick={() => setScreen('list')}
        className="w-full py-2.5 rounded-xl border cursor-pointer bg-transparent text-xs"
        style={{ color: BRAND.slateMuted, borderColor: BRAND.border }}
      >
        العودة للقائمة الرئيسية
      </button>

      {/* 🚔 [نافذة تقرير الطوارئ SOS لكسر فقاعة الأمان الجغرافية للعميل] */}
      <AnimatePresence>
        {showSosModal && activeSession && activeSession.isBreached && (
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
                سيارتك لوحة <span className="font-mono font-black text-red-700 bg-red-50 px-2 py-0.5 rounded">{activeSession.carPlate}</span> تجاوزت فقاعة الأمان الفضائية (25م) بدون إذان خروج!
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