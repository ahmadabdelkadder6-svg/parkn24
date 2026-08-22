import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Car,
  ArrowRight,
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

  // ✅ الفلترة والتحويل الأمني الذكي الخالي تماماً من التداخل
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

    // 3. التحويل من خارج التطبيق: إذا فتح العميل التطبيق وكانت جلسته قد انتهت للتو (أقل من 20 ثانية)
    if (lastCompletedSession && !redirectedToSummaryRef.current) {
      const endMs = safeParseTime(lastCompletedSession.endTime);
      const elapsedSinceEnd = Date.now() - endMs;
      const isNotAcknowledged = acknowledgedSessionIds ? !acknowledgedSessionIds.has(lastCompletedSession.id) : true;

      if (endMs > 0 && elapsedSinceEnd < 20000 && isNotAcknowledged) {
        redirectedToSummaryRef.current = true;
        
        if (lastCompletedSession.garageId) {
          setSelectedGarageId(lastCompletedSession.garageId);
        }
        
        if (typeof acknowledgeSession === 'function') {
          acknowledgeSession(lastCompletedSession.id);
        }
        
        toast.success('تم إنهاء الجلسة ✅', { icon: '🏁', duration: 3000 });
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
        >
          <ArrowRight size={16} /> العودة للقائمة
        </button>
      </div>
    );
  }

  const sessionRate = Number(activeSession.agreedPrice ?? garage?.basePrice ?? 0);
  const currentHours = calculateFullHours(elapsed);
  const currentCost = calculateCost(elapsed, sessionRate);
  const remainingInHour = getRemainingInCurrentHour(elapsed);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-white text-slate-900 flex flex-col items-center justify-center p-8 overflow-y-auto"
    >
      <motion.div
        animate={{
          boxShadow: [
            '0 0 0px rgba(59,130,246,0.15)',
            '0 0 60px rgba(59,130,246,0.2)',
            '0 0 0px rgba(59,130,246,0.15)',
          ],
        }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="w-48 h-48 bg-blue-50 rounded-full flex flex-col items-center justify-center border-4 border-blue-300 mb-6 shadow-lg shadow-blue-100"
      >
        <Clock size={28} className="text-blue-600 mb-1" />
        <div className="text-3xl font-black font-mono text-slate-900">{formatTime(elapsed)}</div>
        <div className="text-[10px] text-slate-500 font-bold mt-1">مدة الركن</div>
      </motion.div>

      <div className="w-full bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-2xl p-4 mb-4 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <div className="text-center">
            <div className="text-3xl font-black text-blue-600 font-mono">{currentHours}</div>
            <div className="text-[9px] text-slate-500 font-bold">ساعة محسوبة</div>
          </div>
          <div className="text-4xl font-black text-slate-400">=</div>
          <div className="text-center">
            <div className="text-3xl font-black text-emerald-600 font-mono">{currentCost}</div>
            <div className="text-[9px] text-slate-500 font-bold">ج.م إجمالي</div>
          </div>
        </div>
        <div className="bg-white/80 rounded-xl p-3 text-center border border-slate-100">
          <div className="text-[10px] text-slate-500 mb-1">الوقت المتبقي حتى الساعة التالية</div>
          <div className="text-lg font-black text-amber-500 font-mono">
            {String(remainingInHour.minutes).padStart(2, '0')}:{String(remainingInHour.seconds).padStart(2, '0')}
          </div>
          <div className="text-[9px] text-slate-400 mt-1">
            بعدها ستُحسب ساعة إضافية ({currentHours + 1} × {sessionRate} = {(currentHours + 1) * sessionRate} ج.م)
          </div>
        </div>
      </div>

      {sessionRate !== garage?.basePrice && garage && (
        <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-2 mb-4 text-center">
          <p className="text-[10px] text-amber-600 font-bold">💰 سعر خاص: {sessionRate} ج.م/ساعة (بدل {garage.basePrice} ج.م)</p>
        </div>
      )}

      <div className="w-full grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl text-center shadow-sm">
          <Car size={20} className="text-blue-600 mx-auto mb-2" />
          <div className="text-sm font-black text-slate-900">{activeSession.carPlate || currentUser?.carPlate}</div>
          <div className="text-[9px] text-slate-500 font-bold">رقم السيارة</div>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl text-center shadow-sm">
          <div className="font-black text-purple-600 mb-2" style={{ fontSize: 13, lineHeight: 1.1 }}>جنيه</div>
          <div className="text-sm font-black text-purple-600 font-mono">{sessionRate} ج.م</div>
          <div className="text-[9px] text-slate-500 font-bold">سعر الساعة</div>
        </div>
      </div>

      {garage && (
        <div className="bg-white border border-slate-200 p-4 rounded-2xl w-full text-center mb-6 shadow-sm">
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

      <button
        onClick={() => setScreen('summary')}
        className="w-full bg-red-600 hover:bg-red-700 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-red-100 active:scale-95 transition-all mb-3"
      >
        إنهاء الجلسة ({currentCost} ج.م)
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