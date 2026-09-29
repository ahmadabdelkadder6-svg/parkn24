import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Car,
  ArrowRight,
  Gift,
  Sparkles,
  CreditCard,
  XCircle,
  Shield,
  CheckCircle2,
} from 'lucide-react';
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
  blue: '#38bdf8',
  blueDark: '#0f3d85',   
  blueLight: '#e8f0fe',  
  blueSoft: 'rgba(56, 189, 248, 0.08)', 
  green: '#4ade80',
  greenDark: '#4ade80',  
  greenLight: 'rgba(74, 222, 128, 0.12)', 
  navy: '#0a1628',       
  navyLight: '#111e36',  
  slate: '#94a3b8',      
  slateMuted: '#cbd5e1',
  border: 'rgba(255, 255, 255, 0.1)', 
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
      pollingRef.current = setInterval(refetch, 15000);

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

  useEffect(() => {
    if (!activeSession) { redirectedToSessionRef.current = false; return; }
    if (redirectedToSessionRef.current) return;
    redirectedToSessionRef.current = true;
    if (activeSession.garageId) setSelectedGarageId(activeSession.garageId);
  }, [activeSession?.id, activeSession?.garageId, setSelectedGarageId]);

  // ✅ الـ useEffect المعدّل - تنظيف المؤقتات ومنع التعليق
  useEffect(() => {
    if (activeSession) {
      redirectedToSummaryRef.current = false;
      return;
    }

    if (activeSessionIdRef.current && !redirectedToSummaryRef.current) {
      const targetSession = sessions.find((s) => s.id === activeSessionIdRef.current);
      if (targetSession && targetSession.status === 'completed') {
        redirectedToSummaryRef.current = true;

        // 1. تنظيف المؤقتات والـ Listeners فوراً لمنع تجمد الشاشة
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        if (realtimeChannelRef.current) {
          supabase.removeChannel(realtimeChannelRef.current);
          realtimeChannelRef.current = null;
        }

        // 2. تسجيل أن الجلسة تم استلامها وتأكيدها فوراً
        if (typeof acknowledgeSession === 'function') {
          acknowledgeSession(targetSession.id);
        }
        if (targetSession.garageId) {
          setSelectedGarageId(targetSession.garageId);
        }

        activeSessionIdRef.current = null;
        toast.success('تم إنهاء الجلسة واستلام الإيصال ✅', { icon: '🧾', duration: 2500 });

        // 3. انتقال سريع ونظيف بدون setTimeout
        setScreen('summary');
        return;
      }
    }

    if (lastCompletedSession && !redirectedToSummaryRef.current) {
      const isNotAcknowledged = acknowledgedSessionIds ? !acknowledgedSessionIds.has(lastCompletedSession.id) : true;
      if (isNotAcknowledged) {
        redirectedToSummaryRef.current = true;

        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        if (realtimeChannelRef.current) {
          supabase.removeChannel(realtimeChannelRef.current);
          realtimeChannelRef.current = null;
        }

        if (typeof acknowledgeSession === 'function') {
          acknowledgeSession(lastCompletedSession.id);
        }
        if (lastCompletedSession.garageId) {
          setSelectedGarageId(lastCompletedSession.garageId);
        }

        setScreen('summary');
      }
    }
  }, [activeSession, lastCompletedSession, sessions, setScreen, setSelectedGarageId, acknowledgedSessionIds, acknowledgeSession]);

  const sessionRate = Number(activeSession?.agreedPrice ?? garage?.basePrice ?? 0);
  const isFirstFreeApplied = activeSession?.isFirstFreeSession === true;

  const handleToggleShield = async () => {
    if (!activeSession || isActivatingShield) return;
    setIsActivatingShield(true);
    const loadingToast = toast.loading('جاري تفعيل درع حماية السيارة بالرادار...');

    try {
      if ('Notification' in window && Notification.permission !== 'granted') {
        await Notification.requestPermission();
      }

      const { error } = await supabase
        .from('sessions')
        .update({ shield_enabled: true, shield_price: 10 })
        .eq('id', activeSession.id);

      if (error) throw error;

      const updatedSessions = sessions.map((s) =>
        s.id === activeSession.id
          ? { ...s, shieldEnabled: true, shieldPrice: 10 }
          : s
      );
      useStore.setState({ sessions: updatedSessions });

      toast.dismiss(loadingToast);
      toast.success('🛡️ تم تفعيل درع حماية السيارة من السرقة! (+10 ج على الفاتورة)', {
        duration: 4500,
      });

      await fetchAll();
    } catch (e: any) {
      toast.dismiss(loadingToast);
      toast.error('تعذر تفعيل الدرع حالياً، تأكد من اتصالك بالإنترنت');
    } finally {
      setIsActivatingShield(false);
    }
  };

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

  const isShieldActive = activeSession?.shieldEnabled === true;
  const finalTotalAmount = displayedCost + (isShieldActive ? 10 : 0);

  if (!activeSession) {
    return (
      <div className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-8 text-right" style={{ background: BRAND.navy }}>
        <div className="text-4xl mb-4 animate-bounce">⏳</div>
        <p className="text-slate-400 text-sm font-bold text-center mb-2">جاري مزامنة بيانات الجلسة...</p>
        <button
          onClick={() => setScreen('list')}
          className="bg-blue-600 text-white border-0 px-8 py-3.5 rounded-2xl font-black text-xs active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
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
      className="h-full text-white flex flex-col items-center overflow-y-auto px-4 pt-14 pb-6 text-right"
      style={{ background: BRAND.navy }}
    >
      {isFirstFreeApplied && (
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full border rounded-xl p-2 mb-2 flex items-center gap-2 shrink-0"
          style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.14) 100%)',
            borderColor: 'rgba(245,158,11,0.25)',
          }}
        >
          <Gift size={16} className="text-amber-400 animate-pulse shrink-0" />
          <div className="text-right flex-1">
            <div className="font-black text-[10px] text-amber-400">هدية ترحيبية نشطة 🎉</div>
            <div className="font-bold text-[9px] mt-0.5" style={{ color: BRAND.slateMuted }}>
              {isFreeNow ? 'أنت الآن في أول 30 دقيقة مجانية بالكامل! 🎁' : 'انتهت الـ 30 دقيقة المجانية وبدأ الاحتساب العادي'}
            </div>
          </div>
        </motion.div>
      )}

      <motion.div
        animate={{
          boxShadow: isFreeNow
            ? ['0 0 0px rgba(74, 222, 128, 0.15)', '0 0 35px rgba(74, 222, 128, 0.45)', '0 0 0px rgba(74, 222, 128, 0.15)']
            : ['0 0 0px rgba(56, 189, 248, 0.15)', '0 0 35px rgba(56, 189, 248, 0.45)', '0 0 0px rgba(56, 189, 248, 0.15)'],
        }}
        transition={{ repeat: Infinity, duration: 2.5 }}
        className="w-32 h-32 rounded-full flex flex-col items-center justify-center border-2 mb-4 shadow-xl shrink-0"
        style={{
          background: BRAND.navyLight,
          borderColor: isFreeNow ? BRAND.green : BRAND.blue,
        }}
      >
        <Clock size={18} style={{ color: isFreeNow ? BRAND.green : BRAND.blue }} className="mb-0.5 animate-pulse" />
        <div className="text-2xl font-black font-mono text-white leading-none tracking-wider">{formatTime(elapsed)}</div>
        <div className="text-[8px] font-black mt-1" style={{ color: BRAND.slateMuted, letterSpacing: '0.5px' }}>مدة الركن الفعلية</div>
      </motion.div>

      <div className="w-full border rounded-xl p-3 mb-2 shrink-0" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
        <div className="flex justify-between items-center mb-2 px-1">
          <div className="text-center">
            <div className="text-2xl font-black font-mono text-white">{displayedHours}</div>
            <div className="text-[8.5px] font-black" style={{ color: BRAND.slateMuted }}>ساعة محسوبة</div>
          </div>
          <div className="text-sm font-black text-slate-500">=</div>
          <div className="text-center">
            <div className="text-2xl font-black font-mono" style={{ color: BRAND.green }}>
              {displayedCost} <span className="text-[10px] font-black">ج.م</span>
            </div>
            <div className="text-[8.5px] font-black" style={{ color: BRAND.slateMuted }}>حساب الركنة حتى الآن</div>
          </div>
        </div>

        <div className="rounded-lg p-2 text-center border bg-blue-950/20" style={{ borderColor: BRAND.border }}>
          <div className="text-[8.5px] font-black" style={{ color: BRAND.slateMuted }}>{countdownLabel}</div>
          <div className="text-xs font-black font-mono" style={{ color: isFreeNow ? BRAND.green : BRAND.blue }}>
            {String(countdownTime?.minutes ?? 0).padStart(2, '0')}:{String(countdownTime?.seconds ?? 0).padStart(2, '0')}
          </div>
        </div>
      </div>

      {sessionRate !== garage?.basePrice && garage && (
        <div className="w-full rounded-lg p-1.5 mb-2 text-center border shrink-0" style={{ background: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245,158,11,0.15)' }}>
          <p className="text-[8.5px] font-bold text-amber-500">💰 سعر خاص متفق عليه: {sessionRate} ج.م/ساعة (بدلاً من {garage.basePrice} ج.م)</p>
        </div>
      )}

      <div className="w-full mb-2 shrink-0">
        {!isShieldActive ? (
          <motion.div
            initial={{ scale: 0.98 }}
            animate={{ scale: 1 }}
            className="w-full border rounded-xl p-2.5 text-right relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(22, 86, 184, 0.12) 0%, rgba(15, 61, 133, 0.2) 100%)',
              borderColor: 'rgba(56, 189, 248, 0.25)',
              boxShadow: '0 4px 15px rgba(22, 86, 184, 0.1)',
            }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="bg-sky-500/20 text-sky-300 text-[8.5px] font-black px-2 py-0.5 rounded-full border border-sky-400/25">
                +10 ج فقط
              </span>
              <div className="flex items-center gap-1 font-black text-[11px] text-white">
                <span>درع حماية السيارة من السرقة</span>
                <Shield size={13} className="text-sky-400" />
              </div>
            </div>

            <p className="text-[8.5px] font-semibold text-slate-300 leading-relaxed mb-2">
              رادار يراقب سيارتك لحظياً (مدى 250م) ويطلق إنذاراً فورياً لك وللسايس عند أي سحب أو ونش.
            </p>

            <button
              onClick={handleToggleShield}
              disabled={isActivatingShield}
              className="w-full py-2 rounded-lg font-black text-[10px] text-white flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition-all border-0"
              style={{
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              }}
            >
              <Shield size={12} />
              <span>{isActivatingShield ? 'جاري التفعيل...' : 'تأمين سيارتي بالرادار الآن 🛡️ (+10 ج)'}</span>
            </button>
          </motion.div>
        ) : (
          <div
            className="w-full border rounded-xl p-2 text-right flex items-center justify-between"
            style={{
              background: 'rgba(2, 132, 199, 0.1)',
              borderColor: '#0284c7',
            }}
          >
            <span className="text-[8px] font-black bg-sky-500 text-white px-2 py-0.5 rounded">
              +10 ج بالفاتورة
            </span>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="font-black text-[10px] text-sky-300 flex items-center justify-end gap-1">
                  <span>درع الرادار نشط ويؤمن سيارتك</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
                </div>
                <div className="text-[8px] font-bold text-slate-400 mt-0.5">
                  حراسة مشددة وإنذار مزدوج متصل بالسايس 🛰️
                </div>
              </div>
              <Shield size={18} className="text-sky-400 shrink-0" />
            </div>
          </div>
        )}
      </div>

      <div 
        className="w-full rounded-xl p-2 mb-2 text-center border shrink-0"
        style={{
          background: 'rgba(255, 255, 255, 0.01)',
          borderColor: BRAND.border,
        }}
      >
        <div className="flex items-center justify-center gap-1 font-black text-white text-[10px]">
          <Sparkles size={11} className="text-yellow-400 shrink-0 animate-pulse" />
          <span>خلّص مشوارك براحتك 🚗✨</span>
        </div>
        <p className="font-bold leading-relaxed text-[8.5px] mt-0.5" style={{ color: BRAND.slateMuted }}>
          وقت الركنة <span className="font-black text-white">محفوظ بالثانية</span> في الخلفية. أغلق التطبيق الآن وافتحه عند العودة للجراج.
        </p>
      </div>

      <div className="w-full grid grid-cols-2 gap-2 mb-2 shrink-0">
        <div className="border p-2 rounded-xl text-center" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
          <Car size={13} style={{ color: BRAND.blue }} className="mx-auto mb-0.5" />
          <div className="text-[12px] font-black text-white font-mono tracking-wide">{activeSession.carPlate || currentUser?.carPlate || '---'}</div>
          <div className="text-[8px] font-black mt-0.5" style={{ color: BRAND.slateMuted }}>رقم السيارة</div>
        </div>
        <div className="border p-2 rounded-xl text-center" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
          <div className="font-black text-[9px] mb-0.5" style={{ color: BRAND.green }}>ج.م/ساعة</div>
          <div className="text-[12px] font-black font-mono text-white">{sessionRate} ج.م</div>
          <div className="text-[8px] font-black mt-0.5" style={{ color: BRAND.slateMuted }}>السعر العادي</div>
        </div>
      </div>

      {garage && (
        <div className="w-full border border-white/5 p-2 rounded-xl text-center bg-white/5 flex justify-between items-center text-[10px] mb-2 shrink-0">
          <span style={{ color: BRAND.slateMuted }}>{garage.name} 🅿️</span>
          <span style={{ color: BRAND.slateMuted }}>
            {activeSession.source === 'app' ? '📱 حجز تطبيق' : '🅿️ حجز جراج'}
            {(activeSession as any).startedBy === 'garage' && ' (سايس)'}
          </span>
        </div>
      )}

      <div className="w-full border rounded-lg p-1.5 mb-3 text-center shrink-0" style={{ background: BRAND.blueSoft, borderColor: BRAND.border }}>
        <div className="flex items-center justify-center gap-1 text-[9.5px] font-bold" style={{ color: BRAND.blue }}>
          <CreditCard size={11} />
          {garage?.payment_mode === 'cash' ? (
            <span>💵 يقبل كاش فقط</span>
          ) : garage?.payment_mode === 'wallet' ? (
            <span>👝 يقبل محفظة فقط</span>
          ) : (
            <span>💳 يقبل كاش أو محفظة</span>
          )}
        </div>
      </div>

      <button
        onClick={() => setScreen('summary')}
        className="w-full py-3.5 rounded-xl active:scale-[0.98] transition-all mb-2 flex items-center justify-center border-0 text-white cursor-pointer font-black shrink-0"
        style={{
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          boxShadow: '0 4px 14px rgba(220,38,38,0.25)',
        }}
      >
        <span className="text-center text-xs font-black text-white" style={{ color: '#ffffff' }}>
          {isFreeNow && !isShieldActive ? (
            <span>🚗 إنهاء الجلسة (مجاناً 🎁)</span>
          ) : (
            <span>
              🚗 إنهاء الجلسة وحساب التكلفة ({finalTotalAmount} ج.م)
              {isShieldActive && <span className="text-[10px] opacity-90"> (شامل الدرع 🛡️)</span>}
            </span>
          )}
        </span>
      </button>

      <button
        onClick={() => setScreen('list')}
        className="w-full py-2 rounded-xl border cursor-pointer bg-transparent text-[11px] shrink-0"
        style={{ color: BRAND.slateMuted, borderColor: BRAND.border }}
      >
        العودة للقائمة الرئيسية
      </button>
    </motion.div>
  );
}