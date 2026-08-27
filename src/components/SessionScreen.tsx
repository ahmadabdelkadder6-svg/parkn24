import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Car,
  ArrowRight,
  Gift,
  Sparkles,
} from 'lucide-react';
import { useStore, isEligibleForFreeFirstSession } from '../store';
import {
  calculateFullHours,
  calculateCostWithFirstFree,
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
  const activeSessionIdRef = useRef<string | null>(null);
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
        if (acknowledgedSessionIds?.has(s.id)) return false;
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

  // 🎁 التحقق مما إذا كانت هذه الجلسة هي الأولى المجانية للعميل (أمان صارم: تُعطل فوراً للسيارات المضافة يدوياً)
  const isFirstFree = useMemo(() => {
    if (activeSession?.source === 'manual') return false; // 🛑 أمان مغلق: العربيات اليدوي لا مجاني لها نهائياً
    if (activeSession?.isFirstFreeSession !== undefined) {
      return activeSession.isFirstFreeSession;
    }
    if (!currentUser?.carPlate && !currentUser?.phone) return false;
    return isEligibleForFreeFirstSession(sessions, currentUser.carPlate, currentUser.phone);
  }, [activeSession, sessions, currentUser]);

  useEffect(() => {
    if (activeSession?.id) {
      activeSessionIdRef.current = activeSession.id;
    }
  }, [activeSession?.id]);

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

  // عداد الثواني المستمر
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

  useEffect(() => {
    if (activeSession) {
      redirectedToSummaryRef.current = false;
      return;
    }

    if (activeSessionIdRef.current) {
      const targetSession = sessions.find(s => s.id === activeSessionIdRef.current);
      
      if (targetSession && targetSession.status === 'completed' && !redirectedToSummaryRef.current) {
        redirectedToSummaryRef.current = true;
        
        if (targetSession.garageId) {
          setSelectedGarageId(targetSession.garageId);
        }
        
        if (typeof acknowledgeSession === 'function') {
          acknowledgeSession(targetSession.id);
        }
        
        activeSessionIdRef.current = null;
        toast.success('تم إنهاء الجلسة ✅', { icon: '🏁', duration: 3000 });
        setTimeout(() => { setScreen('summary'); }, 400);
        return;
      }
    }

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
          className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black text-sm active:scale-95 transition-all flex items-center gap-2 border-none cursor-pointer"
          style={{ color: '#ffffff', fontWeight: 900 }}
        >
          <ArrowRight size={16} /> <span style={{ color: '#ffffff', fontWeight: 900 }}>العودة للقائمة</span>
        </button>
      </div>
    );
  }

  const sessionRate = Number(activeSession.agreedPrice ?? garage?.basePrice ?? 0);
  
  // 🎯 حساب التكلفة والساعات بدقة
  const { cost: currentCost, freeHoursUsed, paidHours, totalHours: currentHours } = calculateCostWithFirstFree(
    elapsed,
    sessionRate,
    isFirstFree
  );

  const remainingInHour = getRemainingInCurrentHour(elapsed);
  const isInsideFreeHour = isFirstFree && elapsed <= 3600;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-white text-slate-900 flex flex-col items-center justify-center p-6 overflow-y-auto"
    >
      {/* 🎁 شارة إعلان الجلسة الأولى المجانية اللحظية */}
      {isFirstFree && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full mb-4 p-3 rounded-2xl flex items-center justify-between border border-emerald-200 text-right"
          style={{
            background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
            boxShadow: '0 4px 14px rgba(16,185,129,0.12)'
          }}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono font-black text-xs text-emerald-800 bg-white/80 px-2.5 py-1 rounded-xl border border-emerald-300">
              {isInsideFreeHour ? 'مجاناً الآن' : 'ساعة أولى مجانية'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="font-black text-xs text-emerald-900 flex items-center gap-1 justify-end">
                <span>هدية ترحيبية</span>
                <Sparkles size={13} className="text-emerald-600" />
              </div>
              <p className="text-[10px] text-emerald-700 font-bold">أول ساعة مجانية بالكامل</p>
            </div>
            <div className="bg-emerald-500 text-white p-2 rounded-xl">
              <Gift size={16} />
            </div>
          </div>
        </motion.div>
      )}

      {/* العداد الدائري المركزي */}
      <motion.div
        animate={{
          boxShadow: isInsideFreeHour
            ? [
                '0 0 0px rgba(16,185,129,0.15)',
                '0 0 50px rgba(16,185,129,0.25)',
                '0 0 0px rgba(16,185,129,0.15)',
              ]
            : [
                '0 0 0px rgba(59,130,246,0.15)',
                '0 0 50px rgba(59,130,246,0.2)',
                '0 0 0px rgba(59,130,246,0.15)',
              ],
        }}
        transition={{ repeat: Infinity, duration: 2 }}
        className={`w-44 h-44 rounded-full flex flex-col items-center justify-center border-4 mb-5 shadow-lg ${
          isInsideFreeHour ? 'bg-emerald-50 border-emerald-400 shadow-emerald-100' : 'bg-blue-50 border-blue-300 shadow-blue-100'
        }`}
      >
        <Clock size={26} className={isInsideFreeHour ? 'text-emerald-600 mb-1' : 'text-blue-600 mb-1'} />
        <div className="text-3xl font-black font-mono text-slate-900">{formatTime(elapsed)}</div>
        <div className="text-[10px] text-slate-500 font-bold mt-1">
          {isInsideFreeHour ? 'مدة الركن (مجاني 🎁)' : 'مدة الركن الفعلية'}
        </div>
      </motion.div>

      {/* بوكس الحساب والساعات */}
      <div 
        className="w-full rounded-2xl p-4 mb-4 shadow-sm border"
        style={{
          background: isInsideFreeHour 
            ? 'linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)' 
            : 'linear-gradient(135deg, #EFF6FF 0%, #F5F3FF 100%)',
          borderColor: isInsideFreeHour ? '#A7F3D0' : '#BFDBFE'
        }}
      >
        <div className="flex justify-between items-center mb-3">
          <div className="text-center">
            <div className="text-3xl font-black font-mono text-blue-600">{currentHours}</div>
            <div className="text-[9px] text-slate-500 font-bold">
              {isFirstFree && paidHours > 0 ? `${freeHoursUsed} مجانية + ${paidHours} مدفوعة` : 'ساعة محسوبة'}
            </div>
          </div>
          <div className="text-4xl font-black text-slate-300">=</div>
          <div className="text-center">
            <div className={`text-3xl font-black font-mono ${isInsideFreeHour ? 'text-emerald-600' : 'text-slate-900'}`}>
              {currentCost.toFixed(0)}
            </div>
            <div className="text-[9px] text-slate-500 font-bold">
              {isInsideFreeHour ? 'ج.م (مجاناً 🎁)' : 'ج.م إجمالي حتى الآن'}
            </div>
          </div>
        </div>

        {/* الوقت المتبقي في الساعة الحالية */}
        <div className="bg-white/90 rounded-xl p-3 text-center border border-slate-200/60 shadow-sm">
          <div className="text-[10px] text-slate-500 font-bold mb-1">
            {isInsideFreeHour ? 'الوقت المتبقي في ساعتك المجانية' : 'الوقت المتبقي حتى الساعة التالية'}
          </div>
          <div className={`text-lg font-black font-mono ${isInsideFreeHour ? 'text-emerald-600' : 'text-amber-500'}`}>
            {String(remainingInHour.minutes).padStart(2, '0')}:{String(remainingInHour.seconds).padStart(2, '0')}
          </div>
          <div className="text-[9px] text-slate-400 mt-1">
            {isInsideFreeHour 
              ? `بعد انتهاء الساعة المجانية ستُحسب كل ساعة بـ ${sessionRate} ج.م`
              : `بعدها ستُحسب ساعة إضافية (+${sessionRate} ج.م)`}
          </div>
        </div>
      </div>

      {sessionRate !== garage?.basePrice && garage && (
        <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-2 mb-4 text-center">
          <p className="text-[10px] text-amber-600 font-bold">💰 سعر خاص: {sessionRate} ج.م/ساعة (بدل {garage.basePrice} ج.م)</p>
        </div>
      )}

      {/* بيانات السيارة والسعر */}
      <div className="w-full grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white border border-slate-200 p-3.5 rounded-2xl text-center shadow-sm">
          <Car size={18} className="text-blue-600 mx-auto mb-1.5" />
          <div className="text-sm font-black text-slate-900">{activeSession.carPlate || currentUser?.carPlate}</div>
          <div className="text-[9px] text-slate-500 font-bold">رقم السيارة</div>
        </div>
        <div className="bg-white border border-slate-200 p-3.5 rounded-2xl text-center shadow-sm">
          <div className="text-xs font-black text-purple-600 mb-1">ج.م/ساعة</div>
          <div className="text-sm font-black text-purple-600 font-mono">{sessionRate} ج.م</div>
          <div className="text-[9px] text-slate-500 font-bold">سعر الساعة</div>
        </div>
      </div>

      {garage && (
        <div className="bg-white border border-slate-200 p-3.5 rounded-2xl w-full text-center mb-4 shadow-sm">
          <div className="text-[10px] text-slate-500 font-bold mb-0.5">الجراج الحالي</div>
          <div className="text-base font-black text-slate-900">{garage.name}</div>
        </div>
      )}

      <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 mb-3 text-center">
        <p className="text-[10px] text-slate-500 font-bold">
          {activeSession.source === 'app' ? '📱 بدأت من التطبيق' : '🅿️ بدأت من الجراج'}
          {(activeSession as any).startedBy === 'garage' && ' (بواسطة السايس)'}
        </p>
      </div>

      {activeSession.source === 'manual' ? (
        <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-2.5 mb-4 text-center">
          <p className="text-[10px] text-amber-700 font-bold">
            ⚠️ ركنة مضافة يدوياً: الحساب عادي من أول ساعة وبدون كاش باك.
          </p>
        </div>
      ) : (
        <div className="w-full bg-blue-50 border border-blue-200 rounded-xl p-2.5 mb-4 text-center">
          <p className="text-[10px] text-blue-700 font-bold">
            💡 يمكنك اختيار الدفع نقداً أو من المحفظة للحصول على كاش باك عند إنهاء الجلسة
          </p>
        </div>
      )}

      {/* زر إنهاء الجلسة */}
      <button
        onClick={() => setScreen('summary')}
        className="w-full py-4 rounded-2xl active:scale-95 transition-all mb-2.5 flex items-center justify-center gap-2 shadow-xl border-none cursor-pointer"
        style={{
          background: 'linear-gradient(135deg, #FF3333 0%, #CC0000 100%)',
          boxShadow: '0 8px 24px rgba(255, 51, 51, 0.3)',
        }}
      >
        <span className="font-black text-white text-center" style={{ color: '#ffffff', fontWeight: 900, fontSize: '16px' }}>
          🚗 إنهاء الجلسة ({currentCost === 0 ? '0 ج.م - مجاناً' : `${currentCost.toFixed(0)} ج.م`})
        </span>
      </button>

      <button
        onClick={() => setScreen('list')}
        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-2xl font-bold text-sm active:scale-95 transition-all border-none cursor-pointer"
      >
        العودة للقائمة
      </button>
    </motion.div>
  );
}