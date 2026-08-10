import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Car,
  DollarSign,
  ArrowRight,
  Gift,
} from 'lucide-react';
import { useStore } from '../store';
import {
  calculateFullHours,
  calculateCost,
  calculateCostWithLoyalty,
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
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/\s+/g, ' ')
    .toUpperCase();
};

export default function SessionScreen() {
  const {
    garages, sessions, setScreen, currentUser, fetchAll,
    setSelectedGarageId, loyaltyStatus,
  } = useStore();

  const userPlate = normalizePlate(currentUser?.carPlate);
  const userPhone = currentUser?.phone || '';

  const redirectedToSummaryRef = useRef(false);
  const redirectedToSessionRef = useRef(false);
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
        const samePlateMatch = !!userPlate && normalizePlate(s.carPlate) === userPlate;
        const samePhoneMatch = !!userPhone && (s as any).customerPhone === userPhone;
        return samePlateMatch || samePhoneMatch;
      })
      .sort((a, b) => safeParseTime(b.startTime) - safeParseTime(a.startTime))[0];
  }, [sessions, userPlate, userPhone]);

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

  const activeStartMs = useMemo(() => {
    if (!activeSession) return 0;
    const ms = safeParseTime(activeSession.startTime);
    if (ms <= 0) return Date.now();
    return ms;
  }, [activeSession?.id, activeSession?.startTime]);

  // ✅ هل الجلسة دي مجانية؟
  const isFreeSession = activeSession?.isFreeSession ?? loyaltyStatus?.isNextFree ?? false;

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' },
        async (payload) => {
          if (isMySessionRow(payload.new) || isMySessionRow(payload.old)) await refetch();
        })
      .subscribe();

    realtimeChannelRef.current = channel;
    pollingRef.current = setInterval(refetch, 4000);

    const handleVisibility = () => { if (document.visibilityState === 'visible') refetch(); };
    const handleFocus = () => refetch();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      if (realtimeChannelRef.current) { supabase.removeChannel(realtimeChannelRef.current); realtimeChannelRef.current = null; }
    };
  }, [userPlate, userPhone, fetchAll]);

  useEffect(() => {
    if (!activeSession || activeStartMs <= 0) { setElapsed(0); return; }
    const calcElapsed = () => Math.max(0, Math.floor((Date.now() - activeStartMs) / 1000));
    setElapsed(calcElapsed());
    const interval = setInterval(() => { setElapsed(calcElapsed()); }, 1000);
    return () => clearInterval(interval);
  }, [activeSession?.id, activeStartMs]);

  useEffect(() => {
    if (!activeSession) { redirectedToSessionRef.current = false; return; }
    if (redirectedToSessionRef.current) return;
    redirectedToSessionRef.current = true;
    if (activeSession.garageId) setSelectedGarageId(activeSession.garageId);
  }, [activeSession?.id, activeSession?.garageId, setSelectedGarageId]);

  useEffect(() => {
    if (activeSession) { redirectedToSummaryRef.current = false; return; }
    if (!lastCompletedSession || redirectedToSummaryRef.current) return;
    const endMs = safeParseTime(lastCompletedSession.endTime);
    if (!endMs || Date.now() - endMs >= 2 * 60 * 1000) return;
    redirectedToSummaryRef.current = true;
    if (lastCompletedSession.garageId) setSelectedGarageId(lastCompletedSession.garageId);
    toast.success('تم إنهاء الجلسة ✅', { icon: '🏁', duration: 3000 });
    setTimeout(() => { setScreen('summary'); }, 400);
  }, [activeSession?.id, lastCompletedSession?.id, lastCompletedSession?.endTime, lastCompletedSession?.garageId, setScreen, setSelectedGarageId]);

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

  // ✅ حساب التكلفة مع الولاء
  const loyaltyCalc = calculateCostWithLoyalty(elapsed, sessionRate, isFreeSession);
  const currentCost = loyaltyCalc.cost;
  const currentHours = loyaltyCalc.totalHours;
  const freeHoursUsed = loyaltyCalc.freeHoursUsed;
  const paidHours = loyaltyCalc.paidHours;
  const remainingInHour = getRemainingInCurrentHour(elapsed);

  // ✅ حساب الوقت المجاني المتبقي
  const freeSecondsTotal = 2 * 60 * 60;
  const freeSecondsRemaining = isFreeSession ? Math.max(0, freeSecondsTotal - elapsed) : 0;
  const freeMinutesRemaining = Math.floor(freeSecondsRemaining / 60);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-white text-slate-900 flex flex-col items-center justify-center p-8 overflow-y-auto"
    >
      {/* ✅ بانر الركنة المجانية */}
      {isFreeSession && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full mb-4"
          style={{
            background: elapsed <= freeSecondsTotal
              ? 'linear-gradient(135deg, #D4AF37, #F5D060)'
              : 'linear-gradient(135deg, #EF4444, #DC2626)',
            borderRadius: 20,
            padding: '16px 18px',
            boxShadow: '0 4px 20px rgba(212,175,55,0.3)',
          }}
        >
          <div className="flex items-center gap-3">
            <Gift size={24} style={{ color: '#0F172A' }} />
            <div className="flex-1">
              <div className="font-black" style={{ fontSize: 15, color: '#0F172A' }}>
                {elapsed <= freeSecondsTotal ? '🎉 ركنة مجانية!' : '⏰ انتهت الفترة المجانية'}
              </div>
              <div className="font-bold" style={{ fontSize: 11, color: '#1E293B' }}>
                {elapsed <= freeSecondsTotal
                  ? `باقي ${freeMinutesRemaining} دقيقة مجانية من أصل 120 دقيقة`
                  : `الحساب بدأ - ${paidHours} ساعة × ${sessionRate} = ${currentCost} ج.م`}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* عداد الوقت */}
      <motion.div
        animate={{
          boxShadow: [
            '0 0 0px rgba(59,130,246,0.15)',
            '0 0 60px rgba(59,130,246,0.2)',
            '0 0 0px rgba(59,130,246,0.15)',
          ],
        }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="w-48 h-48 rounded-full flex flex-col items-center justify-center border-4 mb-6 shadow-lg"
        style={{
          background: isFreeSession && elapsed <= freeSecondsTotal ? '#FFFBEB' : '#EFF6FF',
          borderColor: isFreeSession && elapsed <= freeSecondsTotal ? '#D4AF37' : '#93C5FD',
        }}
      >
        <Clock size={28} className={isFreeSession && elapsed <= freeSecondsTotal ? 'text-yellow-600 mb-1' : 'text-blue-600 mb-1'} />
        <div className="text-3xl font-black font-mono text-slate-900">{formatTime(elapsed)}</div>
        <div className="text-[10px] text-slate-500 font-bold mt-1">
          {isFreeSession && elapsed <= freeSecondsTotal ? 'مدة الركن (مجانية)' : 'مدة الركن'}
        </div>
      </motion.div>

      {/* بطاقة التكلفة */}
      <div className="w-full bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-2xl p-4 mb-4 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <div className="text-center">
            <div className="text-3xl font-black text-blue-600 font-mono">{currentHours}</div>
            <div className="text-[9px] text-slate-500 font-bold">ساعة إجمالي</div>
          </div>
          <div className="text-4xl font-black text-slate-400">=</div>
          <div className="text-center">
            <div className="text-3xl font-black font-mono" style={{ color: isFreeSession && currentCost === 0 ? '#D4AF37' : '#059669' }}>
              {currentCost === 0 && isFreeSession ? 'مجاني' : currentCost}
            </div>
            <div className="text-[9px] text-slate-500 font-bold">
              {currentCost === 0 && isFreeSession ? '🎁' : 'ج.م إجمالي'}
            </div>
          </div>
        </div>

        {isFreeSession && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-2 text-center mb-2">
            <div className="text-[10px] text-yellow-700 font-bold">
              🎁 {freeHoursUsed > 0 ? `${freeHoursUsed} ساعة مجانية مستخدمة` : 'الفترة المجانية سارية'}
              {paidHours > 0 && ` + ${paidHours} ساعة مدفوعة`}
            </div>
          </div>
        )}

        <div className="bg-white/80 rounded-xl p-3 text-center border border-slate-100">
          <div className="text-[10px] text-slate-500 mb-1">الوقت المتبقي حتى الساعة التالية</div>
          <div className="text-lg font-black text-amber-500 font-mono">
            {String(remainingInHour.minutes).padStart(2, '0')}:{String(remainingInHour.seconds).padStart(2, '0')}
          </div>
        </div>
      </div>

      {/* تنبيه سعر خاص */}
      {sessionRate !== garage?.basePrice && garage && (
        <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-2 mb-4 text-center">
          <p className="text-[10px] text-amber-600 font-bold">💰 سعر خاص: {sessionRate} ج.م/ساعة (بدل {garage.basePrice} ج.م)</p>
        </div>
      )}

      {/* معلومات السيارة والسعر */}
      <div className="w-full grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl text-center shadow-sm">
          <Car size={20} className="text-blue-600 mx-auto mb-2" />
          <div className="text-sm font-black text-slate-900">{activeSession.carPlate || currentUser?.carPlate}</div>
          <div className="text-[9px] text-slate-500 font-bold">رقم السيارة</div>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl text-center shadow-sm">
          <DollarSign size={20} className="text-purple-600 mx-auto mb-2" />
          <div className="text-sm font-black text-purple-600 font-mono">{sessionRate} ج.م</div>
          <div className="text-[9px] text-slate-500 font-bold">سعر الساعة</div>
        </div>
      </div>

      {/* اسم الجراج */}
      {garage && (
        <div className="bg-white border border-slate-200 p-4 rounded-2xl w-full text-center mb-6 shadow-sm">
          <div className="text-xs text-slate-500 font-bold mb-1">الجراج</div>
          <div className="text-lg font-black text-slate-900">{garage.name}</div>
        </div>
      )}

      {/* مصدر الجلسة */}
      <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 mb-4 text-center">
        <p className="text-[10px] text-slate-400 font-bold">
          {activeSession.source === 'app' ? '📱 بدأت من التطبيق' : '🅿️ بدأت من الجراج'}
          {(activeSession as any).startedBy === 'garage' && ' (بواسطة السايس)'}
        </p>
      </div>

      {/* عداد الولاء */}
      {loyaltyStatus && !isFreeSession && (
        <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 12, height: 12, borderRadius: '50%',
                    background: i <= loyaltyStatus.paidSessions ? '#00CC66' : '#E2E8F0',
                    border: '1px solid #CBD5E1',
                  }}
                />
              ))}
            </div>
            <div className="text-[10px] text-slate-500 font-bold">
              🅿️ {loyaltyStatus.paidSessions}/5 - باقي {loyaltyStatus.remainingForFree} للمجانية
            </div>
          </div>
        </div>
      )}

      {/* ملاحظة الدفع */}
      <div className="w-full bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-center">
        <p className="text-[10px] text-blue-600 font-bold">
          {isFreeSession && currentCost === 0
            ? '🎁 هذه الركنة مجانية بالكامل (حتى الآن)'
            : '💡 سيتم تحديد طريقة الدفع عند إنهاء الجلسة'}
        </p>
      </div>

      {/* زر إنهاء الجلسة */}
      <button
        onClick={() => setScreen('summary')}
        className="w-full py-5 rounded-2xl font-black text-lg shadow-xl active:scale-95 transition-all mb-3"
        style={{
          background: isFreeSession && currentCost === 0
            ? 'linear-gradient(135deg, #D4AF37, #F5D060)'
            : 'linear-gradient(135deg, #DC2626, #B91C1C)',
          color: isFreeSession && currentCost === 0 ? '#0F172A' : '#fff',
        }}
      >
        {isFreeSession && currentCost === 0
          ? '🎁 إنهاء الركنة المجانية'
          : `إنهاء الجلسة (${currentCost} ج.م)`}
      </button>

      {/* زر الرجوع */}
      <button
        onClick={() => setScreen('list')}
        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-2xl font-bold text-sm active:scale-95 transition-all"
      >
        العودة للقائمة
      </button>
    </motion.div>
  );
}