import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Car,
  ArrowRight,
  Gift,
  Sparkles,
} from 'lucide-react';
import { useStore } from '../store';
import {
  calculateFullHours,
  calculateCost,
  formatTime,
  getRemainingInCurrentHour,
} from '../utils/pricing';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const safeParseTime = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'string') {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : 0;
  }
  if (typeof value === 'number') {
    if (value < 1_000_000_000_000) return value * 1000;
    return value;
  }
  return 0;
};

const normalizePlate = (plate?: string): string => {
  if (!plate) return '';
  return plate
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶٧٨٩'.indexOf(d)))
    .replace(/\s+/g, ' ')
    .toUpperCase();
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
  const userPhone = currentUser?.phone || '';

  const redirectedToSummaryRef = useRef(false);
  const redirectedToSessionRef = useRef(false);
  const activeSessionIdRef = useRef<string | null>(null); // ✅ مرجع لتتبع مُعرف الجلسة النشطة حالياً
  const realtimeChannelRef = useRef<any>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(true);

  const isMySessionRow = (row: any) => {
    if (!row) return false;
    const rowPlate = normalizePlate(row.car_plate || row.carPlate);
    const rowPhone = row.customer_phone || row.customerPhone || '';
    return (
      (!!userPlate && rowPlate === userPlate) ||
      (!!userPhone && rowPhone === userPhone)
    );
  };

  const activeSession = useMemo(() => {
    return sessions
      .filter((s) => {
        if (s.status !== 'active') return false;
        if (acknowledgedSessionIds?.has(s.id)) return false; // أمان: حجب أي جلسة مؤكدة ومغلقة سابقاً
        const samePlateMatch = !!userPlate && normalizePlate(s.carPlate) === userPlate;
        const samePhoneMatch = !!userPhone && (s as any).customerPhone === userPhone;
        return samePlateMatch || samePhoneMatch;
      })
      .sort((a, b) => safeParseTime(b.startTime) - safeParseTime(a.startTime))[0];
  }, [sessions, userPlate, userPhone, acknowledgedSessionIds]);

  const lastCompletedSession = useMemo(() => {
    return sessions
      .filter((s) => {
        if (s.status !== 'completed') return false;
        const samePlateMatch = !!userPlate && normalizePlate(s.carPlate) === userPlate;
        const samePhoneMatch = !!userPhone && (s as any).customerPhone === userPhone;
        return samePlateMatch || samePhoneMatch;
      })
      .sort((a, b) => safeParseTime(b.endTime) - safeParseTime(a.endTime))[0];
  }, [sessions, userPlate, userPhone]);

  const garage = garages.find(
    (g) => g.id === (activeSession?.garageId ?? lastCompletedSession?.garageId),
  );

  // ✅ تتبع وتسجيل مُعرف الجلسة النشطة الحالية باستمرار
  useEffect(() => {
    if (activeSession?.id) {
      activeSessionIdRef.current = activeSession.id;
    }
  }, [activeSession?.id]);

  // حساب startTime للجلسة النشطة
  const activeStartMs = useMemo(() => {
    if (!activeSession) return 0;
    const ms = safeParseTime(activeSession.startTime);
    if (ms <= 0) return Date.now();
    return ms;
  }, [activeSession?.id, activeSession?.startTime]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try { await fetchAll(); } finally { if (mounted) setLoading(false); }
    };
    init();
    return () => { mounted = false; };
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

  // العداد
  useEffect(() => {
    if (!activeSession || activeStartMs <= 0) {
      setElapsed(0);
      return;
    }

    const calcElapsed = () => {
      const now = Date.now();
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

  // ✅ الفلترة والتحويل الأمني الذكي الخالي تماماً من التداخل (Acknowledge Lock 🔒)
  useEffect(() => {
    // 1. إذا وجدنا جلسة نشطة قيد التشغيل، نلغي أي توجيه فوري ونبقى في العداد
    if (activeSession) {
      redirectedToSummaryRef.current = false;
      return;
    }

    // 2. التحويل التفاعلي: إذا انتهت الجلسة النشطة التي كنا نراقبها بالتو
    if (activeSessionIdRef.current) {
      const targetSession = sessions.find(s => s.id === activeSessionIdRef.current);
      
      if (targetSession && targetSession.status === 'completed' && !redirectedToSummaryRef.current) {
        redirectedToSummaryRef.current = true;
        
        if (targetSession.garageId) {
          setSelectedGarageId(targetSession.garageId);
        }
        
        // إغلاق الجلسة المؤكدة آلياً
        if (typeof acknowledgeSession === 'function') {
          acknowledgeSession(targetSession.id);
        }
        
        activeSessionIdRef.current = null;
        toast.success('تم إنهاء الجلسة ✅', { icon: '🏁', duration: 3000 });
        setTimeout(() => { setScreen('summary'); }, 400);
        return;
      }
    }

    // 3. التحويل من خارج التطبيق: توجيه آمن 100% بناءً على عدم إقرار الفاتورة مسبقاً (بدلاً من فرق التوقيت)
    if (lastCompletedSession && !redirectedToSummaryRef.current) {
      const isNotAcknowledged = acknowledgedSessionIds ? !acknowledgedSessionIds.has(lastCompletedSession.id) : true;

      if (isNotAcknowledged) {
        redirectedToSummaryRef.current = true;
        
        if (lastCompletedSession.garageId) {
          setSelectedGarageId(lastCompletedSession.garageId);
        }
        
        if (typeof acknowledgeSession === 'function') {
          acknowledgeSession(lastCompletedSession.id);
        }
        
        toast.success('تم إنهاء الجلسة بنجاح ✅', { icon: '🏁', duration: 3000 });
        setTimeout(() => { setScreen('summary'); }, 400);
      }
    }
  }, [activeSession, lastCompletedSession, sessions, setScreen, setSelectedGarageId, acknowledgedSessionIds, acknowledgeSession]);

  if (loading) {
    return (
      <div className="h-full bg-white text-slate-900 flex flex-col items-center justify-center p-8">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
        <p className="text-slate-500 text-sm font-bold text-center">جاري تحميل بيانات الجلسة...</p>
      </div>
    );
  }

  if (!activeSession) {
    return (
      <div className="h-full bg-white text-slate-900 flex flex-col items-center justify-center p-8">
        <div className="text-4xl mb-4 animate-bounce">⏳</div>
        <p className="text-slate-500 text-sm font-bold text-center mb-2">لا توجد جلسة ركن نشطة حالياً</p>
        <p className="text-slate-400 text-xs text-center mb-4">إذا بدأ السايس الجلسة ستظهر هنا تلقائياً</p>
        <button
          onClick={() => setScreen('list')}
          className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black text-sm active:scale-95 transition-all flex items-center gap-2"
          style={{ color: '#ffffff', fontWeight: 900 }}
        >
          <ArrowRight size={16} /> <span style={{ color: '#ffffff', fontWeight: 900 }}>العودة للقائمة</span>
        </button>
      </div>
    );
  }

  const sessionRate = Number(activeSession.agreedPrice ?? garage?.basePrice ?? 0);

  // 🎁 [منطق الهدية التفاعلي]:
  const isFirstFreeApplied = activeSession.isFirstFreeSession === true;

  // دمج الحسابات التفاعلية للهدية والوقت للدفع
  const { displayedCost, displayedHours, countdownLabel, countdownTime, isFreeNow } = useMemo(() => {
    if (!isFirstFreeApplied) {
      return {
        displayedCost: calculateCost(elapsed, sessionRate),
        displayedHours: calculateFullHours(elapsed),
        countdownLabel: 'الوقت المتبقي حتى الساعة التالية',
        countdownTime: getRemainingInCurrentHour(elapsed),
        isFreeNow: false
      };
    }

    // 🕐 إذا كانت الجلسة تستحق أول ساعة مجانية
    if (elapsed <= 3600) {
      // العميل ما زال داخل الساعة المجانية الهدية (الـ 60 دقيقة الأولى)
      const freeTimeRemaining = 3600 - elapsed;
      const minutes = Math.floor(freeTimeRemaining / 60);
      const seconds = freeTimeRemaining % 60;
      return {
        displayedCost: 0,
        displayedHours: 0,
        countdownLabel: 'الوقت المتبقي لانتهاء الساعة المجانية الهدية 🎁',
        countdownTime: { minutes, seconds },
        isFreeNow: true
      };
    } else {
      // تجاوز الساعة المجانية → نبدأ الاحتساب من الدقيقة 61 بالمنطق القديم بالكامل
      const billableSeconds = elapsed - 3600;
      return {
        displayedCost: calculateCost(billableSeconds, sessionRate),
        displayedHours: calculateFullHours(billableSeconds),
        countdownLabel: 'الوقت المتبقي حتى الساعة التالية الخاضعة للدفع',
        countdownTime: getRemainingInCurrentHour(billableSeconds),
        isFreeNow: false
      };
    }
  }, [isFirstFreeApplied, elapsed, sessionRate]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-white text-slate-900 flex flex-col items-center justify-center p-6 overflow-y-auto animate-fade-in"
    >
      {/* 🎁 شارة مميزة علوية ترحيبية في العداد إذا كانت الجلسة مجانية */}
      {isFirstFreeApplied && (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 rounded-2xl p-3.5 mb-5 shadow-md border-2 border-white flex items-center gap-3"
        >
          <div className="bg-white/20 p-2.5 rounded-xl text-white">
            <Gift size={22} className="animate-pulse" />
          </div>
          <div className="text-right flex-1">
            <div className="font-black text-white flex items-center gap-1.5" style={{ fontSize: 13 }}>
              <span>هدية ترحيبية نشطة</span>
              <Sparkles size={13} className="text-yellow-200" />
            </div>
            <div className="text-white/90 font-bold" style={{ fontSize: 10 }}>
              {isFreeNow 
                ? 'أنت الآن في الساعة الأولى المجانية بالكامل! 🎁' 
                : 'انتهت الساعة المجانية وتم بدء الاحتساب المخفض بدقة ✅'}
            </div>
          </div>
        </motion.div>
      )}

      {/* حلقة العداد الدائرية مع تكييف الألوان */}
      <motion.div
        animate={{
          boxShadow: isFreeNow
            ? [
                '0 0 0px rgba(245,158,11,0.15)',
                '0 0 60px rgba(245,158,11,0.3)',
                '0 0 0px rgba(245,158,11,0.15)',
              ]
            : [
                '0 0 0px rgba(59,130,246,0.15)',
                '0 0 60px rgba(59,130,246,0.2)',
                '0 0 0px rgba(59,130,246,0.15)',
              ],
        }}
        transition={{ repeat: Infinity, duration: 2 }}
        className={`w-44 h-44 rounded-full flex flex-col items-center justify-center border-4 mb-5 shadow-lg ${
          isFreeNow 
            ? 'bg-amber-50 border-amber-300 shadow-amber-100' 
            : 'bg-blue-50 border-blue-300 shadow-blue-100'
        }`}
      >
        <Clock size={24} className={isFreeNow ? 'text-amber-500 mb-1' : 'text-blue-600 mb-1'} />
        <div className="text-2xl font-black font-mono text-slate-900">{formatTime(elapsed)}</div>
        <div className="text-[9px] text-slate-500 font-bold mt-1">مدة الركن الفعلية</div>
      </motion.div>

      {/* كارت الحساب التفاعلي مع الهدية والعداد */}
      <div className="w-full bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-2xl p-4 mb-4 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <div className="text-center">
            <div className={`text-3xl font-black font-mono ${isFreeNow ? 'text-amber-500' : 'text-blue-600'}`}>
              {displayedHours}
            </div>
            <div className="text-[9px] text-slate-500 font-bold">ساعة محسوبة</div>
          </div>
          <div className="text-3xl font-black text-slate-300">=</div>
          <div className="text-center">
            <div className={`text-3xl font-black font-mono ${isFreeNow ? 'text-emerald-500 animate-pulse' : 'text-emerald-600'}`}>
              {displayedCost} <span className="text-xs">ج.م</span>
            </div>
            <div className="text-[9px] text-slate-500 font-bold">إجمالي الحساب حتى الآن</div>
          </div>
        </div>

        {/* عداد التنازل الديناميكي للساعة الحالية / للهدية */}
        <div className="bg-white/80 rounded-xl p-3 text-center border border-slate-100">
          <div className="text-[9px] text-slate-500 mb-1 font-bold">{countdownLabel}</div>
          <div className={`text-lg font-black font-mono ${isFreeNow ? 'text-amber-500' : 'text-blue-500'}`}>
            {String(countdownTime.minutes).padStart(2, '0')}:{String(countdownTime.seconds).padStart(2, '0')}
          </div>
          <div className="text-[9px] text-slate-400 mt-1">
            {isFreeNow ? (
              <span>استمتع بالركن المجاني دون أي رسوم إضافية 🥳</span>
            ) : (
              <span>
                بعدها ستُحسب ساعة إضافية ({displayedHours + 1} × {sessionRate} = {(displayedHours + 1) * sessionRate} ج.م)
              </span>
            )}
          </div>
        </div>
      </div>

      {sessionRate !== garage?.basePrice && garage && (
        <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-2 mb-4 text-center">
          <p className="text-[10px] text-amber-600 font-bold">💰 سعر خاص متفق عليه: {sessionRate} ج.م/ساعة (بدل {garage.basePrice} ج.م)</p>
        </div>
      )}

      {/* بيانات السيارة والسعر */}
      <div className="w-full grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl text-center shadow-sm">
          <Car size={20} className="text-blue-600 mx-auto mb-2" />
          <div className="text-sm font-black text-slate-900">{activeSession.carPlate || currentUser?.carPlate}</div>
          <div className="text-[9px] text-slate-500 font-bold">رقم السيارة</div>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl text-center shadow-sm">
          <div className="font-black text-purple-600 mb-2" style={{ fontSize: 13, lineHeight: 1.1 }}>جنيه</div>
          <div className="text-sm font-black text-purple-600 font-mono">{sessionRate} ج.م</div>
          <div className="text-[9px] text-slate-500 font-bold">سعر الساعة العادي</div>
        </div>
      </div>

      {garage && (
        <div className="bg-white border border-slate-200 p-4 rounded-2xl w-full text-center mb-4 shadow-sm">
          <div className="text-xs text-slate-500 font-bold mb-1">الجراج</div>
          <div className="text-lg font-black text-slate-900">{garage.name}</div>
        </div>
      )}

      <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 mb-4 text-center">
        <p className="text-[10px] text-slate-400 font-bold">
          {activeSession.source === 'app' ? '📱 بدأت من التطبيق' : '🅿️ بدأت من الجراج'}
          {(activeSession as any).startedBy === 'garage' && ' (بواسطة السايس)'}
        </p>
      </div>

      <div className="w-full bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-center">
        <p className="text-[10px] text-blue-600 font-bold">💡 سيتم تحديد طريقة الدفع عند إنهاء الجلسة</p>
      </div>

      {/* ✅ زر إنهاء الجلسة المعدل بالكامل لعرض السعر الحقيقي بدقة */}
      <button
        onClick={() => setScreen('summary')}
        className="w-full py-5 rounded-2xl active:scale-95 transition-all mb-3 flex items-center justify-center gap-2 shadow-xl"
        style={{
          background: 'linear-gradient(135deg, #FF3333 0%, #CC0000 100%)',
          boxShadow: '0 8px 24px rgba(255, 51, 51, 0.35)',
          border: 'none',
          cursor: 'pointer'
        }}
      >
        <span className="font-black text-white text-center" style={{ color: '#ffffff', fontWeight: 900, fontSize: '17px' }}>
          {isFreeNow ? (
            <span>🚗 إنهاء الجلسة (مجاناً 🎁)</span>
          ) : (
            <span>🚗 إنهاء الجلسة ({displayedCost} ج.م)</span>
          )}
        </span>
      </button>

      <button
        onClick={() => setScreen('list')}
        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-2xl font-bold text-sm active:scale-95 transition-all"
      >
        العودة للقائمة
      </button>
    </motion.div>
  );
}