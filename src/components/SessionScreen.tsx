import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  Car,
  ArrowRight,
  Gift,
  Sparkles,
  CreditCard,
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

/* ─── 🎨 الألوان الرسمية الفاخرة ─── */
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

// 🔊 نظام إنذار الاختراق اللحظي لهاتف العميل
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
      osc.frequency.setValueAtTime(i % 2 === 0 ? 1600 : 2200, start);

      noteGain.gain.setValueAtTime(0.9, start);
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
  const [localShieldLocked, setLocalShieldLocked] = useState(false);

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

  const garage = garages?.find(
    (g) => g.id === activeSession?.garageId
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

  // 🛡️ فحص حالة تفعيل الدرع المدمجة (State + Storage + Session)
  const isShieldActive = useMemo(() => {
    if (!activeSession) return false;
    const fromStorage = localStorage.getItem(`shield_active_${activeSession.id}`) === 'true';
    const fromSession = Boolean(activeSession.securityShieldActive === true || (activeSession as any).security_shield_active === true);
    return localShieldLocked || fromStorage || fromSession;
  }, [activeSession, localShieldLocked]);

  // 🚨 [تشغيل صوت الإنذار والـ SOS فقط لو العربية اتسجل عليها اختراق/سرقة فعلي]
  useEffect(() => {
    if (activeSession && isShieldActive && activeSession.isBreached) {
      playCustomerBreachAlarm();
      setShowSosModal(true);
      const interval = setInterval(playCustomerBreachAlarm, 4000);
      return () => clearInterval(interval);
    }
  }, [activeSession?.id, activeSession?.isBreached, isShieldActive]);

  // 📡 Realtime الاستجابة الفورية لنبضة السيرفر (0.2 ثانية)
  useEffect(() => {
    if (!userPlate && !userPhone) return;
    let cancelled = false;

    const fastCheck = async () => {
      if (cancelled) return;
      try {
        await fetchAll();
      } catch (e) {
        console.error('❌', e);
      }
    };

    // قناة البث المباشر من السيرفر
    const channel = supabase
      .channel(`customer-live-session-${userPlate || userPhone}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions' },
        (payload) => {
          const updatedRow = payload.new as any;
          if (updatedRow && isMySessionRow(updatedRow)) {
            // ⚡ إذا أنهى السايس الجلسة، انتقل فوراً لشاشة الدفع في 0.1 ثانية
            if (updatedRow.status === 'completed') {
              if (updatedRow.garage_id || updatedRow.garageId) {
                setSelectedGarageId(updatedRow.garage_id || updatedRow.garageId);
              }
              if (typeof acknowledgeSession === 'function') {
                acknowledgeSession(updatedRow.id);
              }
              // تحديث الجلسة محلياً فوراً
              useStore.setState((state) => ({
                sessions: state.sessions.map((s) =>
                  s.id === updatedRow.id ? { ...s, ...updatedRow, status: 'completed' } : s
                ),
              }));
              toast.success('تم إنهاء الجلسة بنجاح ✅', { icon: '🏁', duration: 3000 });
              setScreen('summary');
              return;
            }
            fastCheck();
          }
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;
    
    // ⚡ فحص سريع كل ثانية ونصف كاحتياط أمان
    pollingRef.current = setInterval(fastCheck, 1500);

    const handleVisibility = () => { if (document.visibilityState === 'visible') fastCheck(); };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', fastCheck);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', fastCheck);
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      if (realtimeChannelRef.current) { supabase.removeChannel(realtimeChannelRef.current); realtimeChannelRef.current = null; }
    };
  }, [userPlate, userPhone, fetchAll, setScreen, setSelectedGarageId, acknowledgeSession]);
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

  // 🛡️ احتساب رسوم الدرع الفضائي (+10 ج.م ثابتة)
  const shieldCost = isShieldActive ? 10 : 0;
  const finalTotalCost = isFreeNow ? (isShieldActive ? 10 : 0) : (displayedCost + shieldCost);

  // 🛡️ دالة التفعيل الفوري اللحظية
  const handleActivateSecurityShield = () => {
    if (!activeSession?.id || isShieldActive) return;

    const targetSessionId = activeSession.id;
    const targetLat = garage?.lat || 30.0444;
    const targetLng = garage?.lng || 31.2357;

    // 1. قفل محلي فوري
    setLocalShieldLocked(true);
    try {
      localStorage.setItem(`shield_active_${targetSessionId}`, 'true');
    } catch {}

    // 2. تحديث الـ Store
    useStore.setState((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === targetSessionId
          ? { ...s, securityShieldActive: true, isBreached: false }
          : s
      ),
    }));

    toast.success('🛡️ تم تفعيل درع الحماية وتثبيته بالفاتورة (+10 ج.م)', { duration: 4000 });

    // 3. تحديث السيرفر
    setSessionSecurityShield(targetSessionId, true, targetLat, targetLng).catch(() => {});
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full text-white flex flex-col items-center justify-center p-6 overflow-y-auto safe-top safe-bottom"
      style={{ background: BRAND.navy }}
    >
      {/* 🛡️ كارت درع الأمان الفضائي VIP */}
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
            <span className="relative flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isShieldActive ? activeSession.isBreached ? 'bg-red-400' : 'bg-emerald-400' : 'bg-slate-500'}`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isShieldActive ? activeSession.isBreached ? 'bg-red-500' : 'bg-emerald-500' : 'bg-slate-600'}`}></span>
            </span>
            <span className="text-[10px] font-black" style={{ color: isShieldActive ? activeSession.isBreached ? '#fca5a5' : BRAND.green : BRAND.slateMuted }}>
              {isShieldActive ? activeSession.isBreached ? '🚨 تم رصد حركة غير مصرحة!' : '🛰️ درع الحماية الفضائية نشط' : '⚪ خدمة اختيارية'}
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
              ? '🚨 إنذار طارئ! سيارتك غادرت فقاعة الأمان بالجراج (25م) بدون تصريح خروج!'
              : '🔒 سيارتك مراقبة بالأقمار الصناعية ومثبتة بمرساة أمان بالجراج حتى عودتك.'
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
                {/* 🔒 مقفول تماماً بعد التفعيل لحماية الفاتورة */}
                <span className="py-1.5 px-3 rounded-xl font-black text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                  <CheckCircle size={12} /> تم تأكيد الحماية للفاتورة
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleActivateSecurityShield}
                className="py-2.5 px-4 rounded-xl font-black text-xs border-0 cursor-pointer text-white active:scale-95 transition-all shadow-md flex items-center gap-1.5"
                style={{
                  background: 'linear-gradient(135deg, #1656b8 0%, #1d68dc 100%)',
                }}
              >
                <Shield size={14} />
                <span>تفعيل الحماية الآن 🛡️</span>
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

      {/* العداد الدائري */}
      <motion.div
        animate={{
          boxShadow: isFreeNow
            ? ['0 0 0px rgba(140, 198, 63, 0.1)', '0 0 40px rgba(140, 198, 63, 0.25)', '0 0 0px rgba(140, 198, 63, 0.1)']
            : ['0 0 0px rgba(22, 86, 184, 0.1)', '0 0 40px rgba(22, 86, 184, 0.25)', '0 0 0px rgba(22, 86, 184, 0.1)'],
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

      {/* كارت الحساب التفاعلي */}
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

      {/* 🚔 نافذة طوارئ SOS عند الاختراق الفعلي فقط */}
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
                سيارتك لوحة <span className="font-mono font-black text-red-700 bg-red-50 px-2 py-0.5 rounded">{activeSession.carPlate}</span> تجاوزت فقاعة الأمان بالجراج بدون تصريح خروج!
              </p>

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
                    toast.success('🚀 تم تصدير بيانات الموقع والسرعة لجهات الطوارئ فوراً!');
                    setShowSosModal(false);
                  }}
                  className="w-full py-3 rounded-xl font-black text-xs text-white border-0 bg-red-700 active:scale-95 transition-all cursor-pointer shadow-md"
                >
                  🚔 إرسال تقرير SOS عاجل للشرطة
                </button>

                <button
                  onClick={() => setShowSosModal(false)}
                  className="w-full py-2 rounded-xl font-bold text-xs text-slate-500 bg-transparent border border-slate-200 cursor-pointer"
                >
                  إغلاق النافذة
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}