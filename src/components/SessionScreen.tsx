import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  Car,
  ArrowRight,
  Gift,
  Sparkles,
  Wallet,
  CheckCircle,
  HelpCircle,
  MessageCircle,
} from 'lucide-react';
import { useStore, validatePlate, ParkingSession, Garage } from '../store';
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

// 🛡️ [إصلاح #1]: بصمة اللوحة الموحدة الصارمة الخالية من أي تلاعب أو حروف إنجليزية
const normalizePlate = (plate?: string): string => {
  if (!plate) return '';
  let cleaned = plate.trim();

  // رفض تام للحروف الإنجليزية
  if (/[a-zA-Z]/.test(cleaned)) return '';

  // تحويل الأرقام العربية والفارسية إلى أرقام موحدة
  cleaned = cleaned
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶٧٨٩'.indexOf(d)));

  // توحيد الحروف المتشابهة
  const charMap: Record<string, string> = {
    'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ء': 'ا',
    'ة': 'ت',
    'ى': 'ي', 'ئ': 'ي',
    'ؤ': 'و',
    'پ': 'ب', 'چ': 'ج', 'ژ': 'ز', 'گ': 'ك', 'ڤ': 'ف',
    'ک': 'ك', 'ی': 'ي',
  };
  cleaned = cleaned.replace(/./g, (char) => charMap[char] || char);

  // حذف الرموز والمسافات
  cleaned = cleaned.replace(/[^0-9\u0600-\u06FF]/g, '');

  return cleaned;
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
    endSession,
  } = useStore();

  const userPlate = normalizePlate(currentUser?.carPlate);
  const userPhone = currentUser?.phone ? currentUser.phone.replace(/[^\d+]/g, '') : '';

  const redirectedToSummaryRef = useRef(false);
  const redirectedToSessionRef = useRef(false);
  const activeSessionIdRef = useRef<string | null>(null);
  const realtimeChannelRef = useRef<any>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isEndingSession, setIsEndingSession] = useState(false);

  const [elapsed, setElapsed] = useState(0);

  const isMySessionRow = (row: any) => {
    if (!row) return false;
    const rowPlate = normalizePlate(row.car_plate || row.carPlate);
    const rowPhone = row.customer_phone || row.customerPhone || '';
    const cleanRowPhone = typeof rowPhone === 'string' ? rowPhone.replace(/[^\d+]/g, '') : '';
    return (
      (!!userPlate && rowPlate === userPlate) ||
      (!!userPhone && cleanRowPhone === userPhone)
    );
  };

  // ✅ البحث عن الجلسة النشطة بأعلى معايير الأمان وتطابق تام للبصمة
  const activeSession = useMemo(() => {
    return (sessions as ParkingSession[])
      .filter((s) => {
        if (!s || s.status !== 'active') return false;
        if (acknowledgedSessionIds?.has(s.id)) return false;
        const samePlateMatch = !!userPlate && normalizePlate(s.carPlate) === userPlate;
        const sPhone = (s as any).customerPhone ? (s as any).customerPhone.replace(/[^\d+]/g, '') : '';
        const samePhoneMatch = !!userPhone && sPhone === userPhone;
        return samePlateMatch || samePhoneMatch;
      })
      .sort((a, b) => safeParseTime(b.startTime) - safeParseTime(a.startTime))[0];
  }, [sessions, userPlate, userPhone, acknowledgedSessionIds]);

  const lastCompletedSession = useMemo(() => {
    return (sessions as ParkingSession[])
      .filter((s) => {
        if (!s || s.status !== 'completed') return false;
        const samePlateMatch = !!userPlate && normalizePlate(s.carPlate) === userPlate;
        const sPhone = (s as any).customerPhone ? (s as any).customerPhone.replace(/[^\d+]/g, '') : '';
        const samePhoneMatch = !!userPhone && sPhone === userPhone;
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

  // حساب وقت البداية
  const activeStartMs = useMemo(() => {
    if (!activeSession) return 0;
    const ms = safeParseTime(activeSession.startTime);
    return ms > 0 ? ms : Date.now();
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
      .channel(`customer-session-live-${userPlate || userPhone}-${Date.now()}`)
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
    pollingRef.current = setInterval(refetch, 5000); // ⚡ 5000ms آمنة من الـ Rate Limit

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

  // عداد الثواني اللحظي
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

  // التحويل التلقائي عند انتهاء الجلسة من السايس أو الدفع الذاتي
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
        toast.success('تم إنهاء الجلسة وحساب التكلفة ✅', { icon: '🏁', duration: 3000 });
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

  // الحسابات التفاعلية مع حماية كاملة من الـ Undefined
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

    if (elapsed <= 3600) {
      const freeTimeRemaining = Math.max(0, 3600 - elapsed);
      const minutes = Math.floor(freeTimeRemaining / 60);
      const seconds = freeTimeRemaining % 60;
      return {
        displayedCost: 0,
        displayedHours: 0,
        countdownLabel: 'الوقت المتبقي لانتهاء الساعة المجانية الهدية 🎁',
        countdownTime: { minutes, seconds },
        isFreeNow: true,
      };
    } else {
      const billableSeconds = Math.max(0, elapsed - 3600);
      const calculatedCountdown = getRemainingInCurrentHour ? getRemainingInCurrentHour(billableSeconds) : defaultCountdown;
      return {
        displayedCost: calculateCost(billableSeconds, sessionRate),
        displayedHours: calculateFullHours(billableSeconds),
        countdownLabel: 'الوقت المتبقي حتى الساعة التالية الخاضعة للدفع',
        countdownTime: calculatedCountdown || defaultCountdown,
        isFreeNow: false,
      };
    }
  }, [isFirstFreeApplied, elapsed, sessionRate]);

  // 🛡️ [إصلاح #2]: معالجة إنهاء الجلسة والدفع الذاتي من العميل
  const handleClientEndSession = async () => {
    if (!activeSession || isEndingSession) return;

    const walletBalance = currentUser?.wallet || 0;

    // 1. إذا كان رصيد المحفظة كافٍ → العميل يدفع ذاتياً ويخرج فوراً
    if (walletBalance >= displayedCost) {
      try {
        setIsEndingSession(true);
        const freeMinutes = isFirstFreeApplied ? 60 : 0;
        await endSession(activeSession.id, displayedCost, 'wallet', freeMinutes);
      } catch (err) {
        toast.error('حدث خطأ أثناء الدفع، حاول مرة أخرى');
      } finally {
        setIsEndingSession(false);
      }
    } 
    // 2. إذا كان الرصيد غير كافٍ → نمنع العميل من الخروج الوهمي ونوجهه للسايس للدفع نقداً
    else {
      toast(
        `💵 رصيدك الحالي (${walletBalance} ج.م) لا يكفي لدفع التكلفة (${displayedCost} ج.م).\nبرجاء التوجه لسايس الجراج لإنهاء الجلسة والدفع نقداً كاش.`,
        {
          duration: 8000,
          icon: '⚠️',
          style: {
            background: '#FFF9E6',
            color: '#D4AF37',
            fontWeight: 'bold',
            border: '1.5px solid #FFEAA7',
          }
        }
      );
    }
  };

  // إذا لم تكن هناك جلسة نشطة
  if (!activeSession) {
    return (
      <div className="h-full bg-white text-slate-900 flex flex-col items-center justify-center p-8">
        <div className="text-4xl mb-4 animate-bounce">⏳</div>
        <p className="text-slate-500 text-sm font-bold text-center mb-2">جاري مزامنة بيانات الجلسة...</p>
        <p className="text-slate-400 text-xs text-center mb-4">ستظهر بيانات العداد فور استلامها</p>
        <button
          onClick={() => setScreen('list')}
          className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black text-sm active:scale-95 transition-all flex items-center gap-2 shadow-md"
        >
          <ArrowRight size={16} /> <span>العودة للقائمة</span>
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-white text-slate-900 flex flex-col items-center justify-center p-6 overflow-y-auto text-right"
    >
      {/* شارة الساعة المجانية */}
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
            <div className="font-black text-white flex items-center gap-1.5 justify-end" style={{ fontSize: 13 }}>
              <span>هدية ترحيبية نشطة</span>
              <Sparkles size={13} className="text-yellow-200" />
            </div>
            <div className="text-white/90 font-bold" style={{ fontSize: 10 }}>
              {isFreeNow 
                ? 'أنت الآن في الساعة الأولى المجانية بالكامل! 🎁' 
                : 'انتهت الساعة المجانية وتم بدء الاحتساب بدقة بالغة ✅'}
            </div>
          </div>
        </motion.div>
      )}

      {/* العداد الدائري */}
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

      {/* كارت حساب التكلفة */}
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

        {/* مؤقت الساعة التالية */}
        <div className="bg-white/80 rounded-xl p-3 text-center border border-slate-100">
          <div className="text-[9px] text-slate-500 mb-1 font-bold">{countdownLabel}</div>
          <div className={`text-lg font-black font-mono ${isFreeNow ? 'text-amber-500' : 'text-blue-500'}`}>
            {String(countdownTime?.minutes ?? 0).padStart(2, '0')}:{String(countdownTime?.seconds ?? 0).padStart(2, '0')}
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

      {/* المحفظة الذكية للعميل */}
      <div className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl mb-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2">
          <Wallet size={16} className="text-blue-600" />
          <span className="font-black font-mono text-sm text-slate-800">{currentUser?.wallet || 0} ج.م</span>
        </div>
        <div className="text-right">
          <div className="font-black text-xs text-slate-700">💳 رصيد محفظتك</div>
          <p className="text-[9px] text-slate-400 font-bold mt-0.5">الدفع الآلي السريع بلمسة واحدة</p>
        </div>
      </div>

      {/* بيانات السيارة والسعر */}
      <div className="w-full grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl text-center shadow-sm">
          <Car size={20} className="text-blue-600 mx-auto mb-2" />
          <div className="text-sm font-black text-slate-900">{activeSession.carPlate || currentUser?.carPlate || '---'}</div>
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
          <div className="text-xs text-slate-500 font-bold mb-1">الجراج الحالي</div>
          <div className="text-md font-black text-slate-900">{garage.name}</div>
        </div>
      )}

      {/* شريط معلومات الجلسة */}
      <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 mb-4 text-center">
        <p className="text-[10px] text-slate-400 font-bold">
          {activeSession.source === 'app' ? '📱 بدأت من حجز التطبيق' : '🅿️ بدأت يدوياً من مدخل الجراج'}
          {(activeSession as any).startedBy === 'garage' && ' (بواسطة السايس)'}
        </p>
      </div>

      {/* 🛡️ [إصلاح #2]: زر إنهاء الجلسة الآمن والمتوافق مع السداد الذاتي أو الدفع كاش */}
      <button
        onClick={handleClientEndSession}
        disabled={isEndingSession}
        className="w-full py-4.5 rounded-2xl active:scale-95 transition-all mb-3 flex items-center justify-center gap-2 shadow-xl"
        style={{
          background: 'linear-gradient(135deg, #00CC66 0%, #00AA55 100%)', // أخضر مبهج يشجع على الدفع الذاتي
          boxShadow: '0 8px 24px rgba(0, 204, 102, 0.3)',
          border: 'none',
          cursor: 'pointer'
        }}
      >
        <span className="font-black text-white text-center" style={{ color: '#ffffff', fontWeight: 900, fontSize: '16px' }}>
          {isFreeNow ? (
            <span>🚗 مغادرة الجراج والإنهاء (مجاناً 🎁)</span>
          ) : (
            <span>🚗 سداد {displayedCost} ج.م وخروج ذكي ⚡</span>
          )}
        </span>
      </button>

      <button
        onClick={() => setScreen('list')}
        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-2xl font-bold text-sm active:scale-95 transition-all border border-slate-200"
      >
        العودة لشاشة البحث
      </button>
    </motion.div>
  );
}