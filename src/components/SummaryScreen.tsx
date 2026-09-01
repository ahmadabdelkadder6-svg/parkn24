import { motion } from 'framer-motion';
import {
  CheckCircle,
  Home,
  Calculator,
  Wallet,
  AlertTriangle,
  Gift,
} from 'lucide-react';
import { useStore, pausePolling } from '../store';
import { useState, useMemo, useEffect, useRef } from 'react';
import { calculateFullHours, calculateCost, formatTime } from '../utils/pricing';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';

const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

// 🧬 [بصمة اللوحة العبقرية]: توحيد شامل ومقاوم للتلاعب بمطابقة تامة مع الـ Store
const normalizePlate = (plate?: string): string => {
  if (!plate) return '';
  
  let cleaned = plate.trim();
  
  // 1. تحويل الأرقام العربية الشرقية والفارسية إلى أرقام إنجليزية موحدة
  cleaned = cleaned
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶٧٨٩'.indexOf(d)));
  
  // 2. توحيد الحروف العربية المتشابهة والهمزات
  const charMap: Record<string, string> = {
    'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ء': 'ا',
    'ة': 'ت',
    'ى': 'ي', 'ئ': 'ي',
    'ؤ': 'و',
    'پ': 'ب', 'چ': 'ج', 'ژ': 'ز', 'گ': 'ك', 'ڤ': 'ف',
    'ک': 'ك', 'ی': 'ي',
  };
  cleaned = cleaned.replace(/./g, (char) => charMap[char] || char);
  
  // 3. حذف الحروف الإنجليزية والرموز والمسافات (حروف عربية وأرقام فقط)
  cleaned = cleaned.replace(/[^0-9\u0600-\u06FF]/g, '');
  
  return cleaned;
};

export default function SummaryScreen() {
  const {
    garages,
    selectedGarageId,
    sessions,
    endSession,
    setScreen,
    setSelectedGarageId,
    currentUser,
    deductWallet,
    fetchAll,
    acknowledgeSession,
  } = useStore();

  const userPlate = normalizePlate(currentUser?.carPlate);
  const userPhone = currentUser?.phone ? currentUser.phone.replace(/[^\d+]/g, '') : '';

  const redirectedToSummaryRef = useRef(false);
  const redirectedToSessionRef = useRef(false);
  const activeSessionIdRef = useRef<string | null>(null);
  const realtimeChannelRef = useRef<any>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [done, setDone] = useState(false);
  const [doneMethod, setDoneMethod] = useState('');
  const [doneTotalPrice, setDoneTotalPrice] = useState(0);
  const [remainingWallet, setRemainingWallet] = useState(0);

  const isEndingRef = useRef(false);
  const autoRedirectedRef = useRef(false);

  const isMySession = (s: any): boolean => {
    const samePlate = !!userPlate && normalizePlate(s.carPlate) === userPlate;
    const sPhone = s.customerPhone ? s.customerPhone.replace(/[^\d+]/g, '') : '';
    const samePhone = !!userPhone && sPhone === userPhone;
    return samePlate || samePhone;
  };

  const activeSession = useMemo(() => {
    return sessions
      .filter((s) => s.status === 'active' && isMySession(s))
      .sort((a, b) => toMs(b.startTime) - toMs(a.startTime))[0];
  }, [sessions, userPlate, userPhone]);

  const lastCompletedSession = useMemo(() => {
    return sessions
      .filter((s) => s.status === 'completed' && isMySession(s))
      .sort((a, b) => toMs(b.endTime) - toMs(a.endTime))[0];
  }, [sessions, userPlate, userPhone]);

  const referenceSession = activeSession ?? lastCompletedSession;

  const garage =
    garages.find((g) => g.id === selectedGarageId) ??
    garages.find((g) => g.id === referenceSession?.garageId);

  useEffect(() => {
    if (!userPlate && !userPhone) return;
    if (done) return;

    let cancelled = false;

    const refetch = async () => {
      if (cancelled || done) return;
      try { await fetchAll(); } catch (e) { console.error('❌', e); }
    };

    refetch();

    const channel = supabase
      .channel(`summary-live-${userPlate || userPhone}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions' },
        async (payload) => {
          const newRow = payload.new as any;
          const oldRow = payload.old as any;

          const myRow = (r: any) => {
            if (!r) return false;
            const plate = normalizePlate(r.car_plate || r.carPlate);
            const phone = (r.customer_phone || r.customerPhone || '').replace(/[^\d+]/g, '');
            return (
              (!!userPlate && plate === userPlate) ||
              (!!userPhone && phone === userPhone)
            );
          };

          if (myRow(newRow) || myRow(oldRow)) {
            await refetch();
          }
        },
      )
      .subscribe();

    realtimeChannelRef.current = channel;
    pollingRef.current = setInterval(refetch, 4000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', refetch);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', refetch);
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [userPlate, userPhone, fetchAll, done]);

  useEffect(() => {
    if (done) return;
    if (autoRedirectedRef.current) return;
    if (activeSession) return;
    if (!lastCompletedSession) return;

    const endMs = toMs(lastCompletedSession.endTime);
    if (!endMs) return;

    const timeSinceEnd = Date.now() - endMs;
    if (timeSinceEnd > 10 * 60 * 1000) return;

    autoRedirectedRef.current = true;

    const price =
      lastCompletedSession.totalPrice != null && Number(lastCompletedSession.totalPrice) > 0
        ? Number(lastCompletedSession.totalPrice)
        : 0;

    const method = lastCompletedSession.paymentMethod ?? 'cash';

    setDoneTotalPrice(price);
    setDoneMethod(method);
    setRemainingWallet(currentUser?.wallet ?? 0);

    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }

    toast.success('تم إنهاء الجلسة بنجاح ✅', { icon: '🏁', duration: 3000 });
    setTimeout(() => setDone(true), 300);
  }, [
    done,
    activeSession?.id,
    lastCompletedSession?.id,
    lastCompletedSession?.endTime,
    lastCompletedSession?.totalPrice,
    lastCompletedSession?.paymentMethod,
    currentUser?.wallet,
  ]);

  const durationSeconds = referenceSession
    ? referenceSession.status === 'completed' && referenceSession.endTime
      ? Math.floor((toMs(referenceSession.endTime) - toMs(referenceSession.startTime)) / 1000)
      : Math.floor((Date.now() - toMs(referenceSession.startTime)) / 1000)
    : 0;

  const durationMinutes = Math.floor(durationSeconds / 60);
  const sessionRate = Number(referenceSession?.agreedPrice ?? garage?.basePrice ?? 0);

  const isFirstFreeApplied = useMemo(() => {
    return referenceSession?.isFirstFreeSession === true;
  }, [referenceSession]);

  const freeSeconds = useMemo(() => {
    if (!isFirstFreeApplied) return 0;
    return Math.min(durationSeconds, 3600); 
  }, [isFirstFreeApplied, durationSeconds]);

  const freeMinutesApplied = Math.floor(freeSeconds / 60);
  const billableSeconds = Math.max(0, durationSeconds - freeSeconds);
  const billableHours = calculateFullHours(billableSeconds);

  const originalPrice = useMemo(() => {
    return calculateCost(durationSeconds, sessionRate);
  }, [durationSeconds, sessionRate]);

  const rawPrice = useMemo(() => {
    if (
      referenceSession?.status === 'completed' &&
      referenceSession?.totalPrice != null &&
      Number(referenceSession.totalPrice) > 0
    ) {
      return Number(referenceSession.totalPrice);
    }
    return calculateCost(billableSeconds, sessionRate);
  }, [referenceSession, billableSeconds, sessionRate]);

  const totalPrice = rawPrice;
  const discountAmount = isFirstFreeApplied ? Math.max(0, originalPrice - totalPrice) : 0;

  const walletBalance = currentUser?.wallet ?? 0;
  const canPayWallet = walletBalance >= totalPrice;

  const methods = [
    { id: 'cash', label: 'نقدي كاش', icon: '💵' },
    { id: 'wallet', label: 'خصم من المحفظة', icon: '👝' },
  ];

  const safeEndSession = async (method: string, price: number): Promise<boolean> => {
    if (isEndingRef.current) return false;

    if (!activeSession || activeSession.status !== 'active') {
      const freshState = useStore.getState();
      const freshCompleted = freshState.sessions
        .filter((s) => s.status === 'completed' && isMySession(s))
        .sort((a, b) => toMs(b.endTime) - toMs(a.endTime))[0];

      const actualPrice =
        freshCompleted?.totalPrice != null && Number(freshCompleted.totalPrice) > 0
          ? Number(freshCompleted.totalPrice)
          : price;
      const actualMethod = freshCompleted?.paymentMethod ?? method;

      setDoneTotalPrice(actualPrice);
      setDoneMethod(actualMethod);
      setRemainingWallet(currentUser?.wallet ?? 0);
      setDone(true);
      return true;
    }

    isEndingRef.current = true;
    pausePolling(15000);

    try {
      await endSession(activeSession.id, price, method, freeMinutesApplied);
      return true;
    } catch (err) {
      console.error('❌ endSession error:', err);
      await fetchAll();

      const check = useStore.getState().sessions.find((s) => s.id === activeSession.id);
      if (!check || check.status === 'completed') {
        const actualPrice = check?.totalPrice != null ? Number(check.totalPrice) : price;
        const actualMethod = check?.paymentMethod ?? method;
        setDoneTotalPrice(actualPrice);
        setDoneMethod(actualMethod);
        setRemainingWallet(currentUser?.wallet ?? 0);
        setDone(true);
        return true;
      }
      return false;
    } finally {
      setTimeout(() => { isEndingRef.current = false; }, 3000);
    }
  };

  const handleConfirm = async () => {
    // 🛡️ معالجة الفاتورة الصفرية المجانية فوراً وبضغطة واحدة
    if (totalPrice === 0) {
      const success = await safeEndSession('free', 0);
      if (success) {
        toast.success('تمت الركنة المجانية بنجاح! 🥳🎁');
        setDoneTotalPrice(0);
        setDoneMethod('free');
        setRemainingWallet(walletBalance);
        setDone(true);
      } else {
        toast.error('حدث خطأ، حاول مرة أخرى');
      }
      return;
    }

    if (paymentMethod === 'wallet') {
      if (!canPayWallet) { toast.error('رصيد المحفظة غير كافي'); return; }
      const newBalance = walletBalance - totalPrice;
      deductWallet(totalPrice);
      const success = await safeEndSession('wallet', totalPrice);
      if (success) {
        toast.success('تم الخصم من المحفظة بنجاح! ✅');
        setDoneTotalPrice(totalPrice);
        setDoneMethod('wallet');
        setRemainingWallet(newBalance);
        setDone(true);
      } else {
        deductWallet(-totalPrice);
        toast.error('حدث خطأ، حاول مرة أخرى');
      }
      return;
    }

    const success = await safeEndSession('cash', totalPrice);
    if (success) {
      toast.success('تم إنهاء الجلسة بنجاح!');
      setDoneTotalPrice(totalPrice);
      setDoneMethod('cash');
      setRemainingWallet(walletBalance);
      setDone(true);
    } else {
      toast.error('حدث خطأ، حاول مرة أخرى');
    }
  };

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="h-full bg-white text-slate-900 flex flex-col items-center justify-center p-8"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', bounce: 0.5 }}
        >
          <CheckCircle size={80} className="text-emerald-500 mb-6" />
        </motion.div>
        <h2 className="text-3xl font-black text-emerald-600 mb-2">شكراً لك!</h2>
        <p className="text-slate-500 text-sm mb-2 text-center">
          {doneMethod === 'free'
            ? 'تمت الركنة المجانية الترحيبية بنجاح 🎁'
            : doneMethod === 'cash' || !doneMethod
            ? 'تم إنهاء الجلسة بنجاح'
            : 'تم الدفع بنجاح'}
        </p>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6 text-center w-full shadow-sm">
          <div className="text-4xl font-black text-slate-900 font-mono mb-1">
            {doneTotalPrice > 0 ? `${doneTotalPrice} ج.م` : `0 ج.م`}
          </div>
          <div className="text-xs text-slate-400 mb-2">
            {isFirstFreeApplied ? (
              <span>
                (تم ركن {durationMinutes} دقيقة منها أول ساعة مجانية 🎁)
              </span>
            ) : (
              <span>{billableHours} ساعة × {sessionRate} ج.م</span>
            )}
          </div>

          {isFirstFreeApplied && discountAmount > 0 && (
            <div className="inline-block px-3 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-600 mb-2">
              🎁 وفرت {discountAmount} ج.م من العرض الترحيبي!
            </div>
          )}

          {doneMethod && (
            <div
              className={`inline-block px-3 py-1 rounded-full text-[10px] font-black block w-fit mx-auto ${
                doneMethod === 'wallet'
                  ? 'bg-blue-100 text-blue-600'
                  : doneMethod === 'free'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-emerald-100 text-emerald-600'
              }`}
            >
              {doneMethod === 'wallet'
                ? '👝 خصم من المحفظة'
                : doneMethod === 'free'
                ? '🎁 ركن مجاني ترحيبي'
                : '💵 نقدي'}
            </div>
          )}

          {doneMethod === 'wallet' && (
            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-2">
              <span className="text-[10px] text-slate-500">الرصيد المتبقي: </span>
              <span className="text-sm font-black text-blue-600 font-mono">
                {remainingWallet} ج.م
              </span>
            </div>
          )}
        </div>

        <button
          onClick={() => {
            if (lastCompletedSession && acknowledgeSession) {
              acknowledgeSession(lastCompletedSession.id);
            }
            setSelectedGarageId(null);
            setScreen('list');
          }}
          className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-100"
        >
          <Home size={20} className="text-white" />
          <span className="font-black text-white text-center" style={{ color: '#ffffff', fontWeight: 900, fontSize: '16px' }}>
            العودة للرئيسية
          </span>
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-white text-slate-900 p-6 overflow-y-auto"
    >
      <div className="pt-10 mb-6">
        <h2 className="text-2xl font-black text-center mb-2 text-slate-900">ملخص الجلسة</h2>
        <p className="text-slate-500 text-sm text-center">
          {activeSession ? 'راجع التفاصيل وأكد الدفع' : 'تم إنهاء الجلسة'}
        </p>
      </div>

      {!activeSession && lastCompletedSession && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 flex items-center gap-2"
        >
          <CheckCircle size={16} className="text-emerald-500 shrink-0" />
          <p className="text-xs text-emerald-700 font-bold">
            ✅ تم إنهاء الجلسة وتحصيل المبلغ من الجراج
          </p>
        </motion.div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4 shadow-sm">
        <div className="text-center mb-3">
          {isFirstFreeApplied && discountAmount > 0 ? (
            <>
              <div className="text-lg font-bold text-slate-400 font-mono line-through mb-0.5">
                {originalPrice} ج.م
              </div>
              <div className="text-4xl font-black text-emerald-600 font-mono mb-0.5">
                {totalPrice} ج.م
              </div>
              <div className="inline-block px-3.5 py-1.5 rounded-full text-[10px] font-black bg-gradient-to-r from-yellow-400 to-orange-500 text-white mb-2 shadow-sm flex items-center justify-center gap-1.5 w-fit mx-auto">
                <Gift size={12} className="text-white" />
                <span>تم تطبيق عرض أول ساعة مجانية بالكامل! 🎉 (وفرت -{discountAmount} ج)</span>
              </div>
            </>
          ) : isFirstFreeApplied && totalPrice === 0 ? (
            <>
              <div className="text-4xl font-black text-emerald-600 font-mono mb-0.5">
                0 ج.م
              </div>
              <div className="inline-block px-3.5 py-1.5 rounded-full text-[10px] font-black bg-gradient-to-r from-yellow-400 to-orange-500 text-white mb-2 shadow-sm flex items-center justify-center gap-1.5 w-fit mx-auto">
                <Gift size={12} className="text-white" />
                <span>ركنتك الأولى مجانية بالكامل! (أقل من ساعة 🎁)</span>
              </div>
            </>
          ) : (
            <div className="text-4xl font-black text-slate-900 font-mono mb-0.5">
              {totalPrice} ج.م
            </div>
          )}
          <div className="text-[10px] text-slate-400 font-bold">إجمالي التكلفة الحالية</div>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 border border-slate-100">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Calculator size={14} className="text-blue-600" />
            <span className="text-[10px] text-slate-500 font-bold">تفاصيل الحساب الفعلي</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">مدة الركن الكلية</span>
              <span className="font-black text-slate-900 font-mono">{durationMinutes} دقيقة</span>
            </div>

            {isFirstFreeApplied && (
              <div className="flex justify-between text-xs text-emerald-600 font-bold">
                <span className="flex items-center gap-1">🎁 خصم الهدية الترحيبية</span>
                <span className="font-mono">-{freeMinutesApplied} دقيقة (ساعة كاملة)</span>
              </div>
            )}

            <div className="flex justify-between text-xs">
              <span className="text-slate-500">الساعات المحتسبة للدفع</span>
              <span className="font-black text-blue-600 font-mono">
                {isFirstFreeApplied ? billableHours : calculateFullHours(durationSeconds)} ساعة
              </span>
            </div>

            <div className="flex justify-between text-xs">
              <span className="text-slate-500">سعر الساعة</span>
              <span className="font-black text-purple-600 font-mono">{sessionRate} ج.م</span>
            </div>

            {garage && sessionRate !== garage.basePrice && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-1.5 text-center">
                <p className="text-[9px] text-amber-600 font-bold">
                  💰 سعر خاص متفق عليه (بدل {garage.basePrice} ج.م/ساعة)
                </p>
              </div>
            )}

            <div className="border-t border-slate-200 pt-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-700 font-bold">الإجمالي المطلوب سداده</span>
                <span className="font-black text-emerald-600 font-mono">
                  {totalPrice} j.m
                </span>
              </div>
            </div>
          </div>
        </div>

        {!activeSession && lastCompletedSession?.paymentMethod && (
          <div className="text-center mt-2">
            <span
              className={`inline-block px-3 py-1 rounded-full text-[10px] font-black ${
                lastCompletedSession.paymentMethod === 'wallet'
                  ? 'bg-blue-100 text-blue-600'
                  : 'bg-emerald-100 text-emerald-600'
              }`}
            >
              {lastCompletedSession.paymentMethod === 'wallet'
                ? '👝 محفظة'
                : '💵 نقدي'}
            </span>
          </div>
        )}
      </div>

      {activeSession && (
        <>
          {totalPrice > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-black text-slate-700 mb-3 text-right">طريقة الدفع</h3>
              <div className="grid grid-cols-2 gap-3">
                {methods.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setPaymentMethod(m.id)}
                    className={`py-3 px-3 rounded-2xl border text-center transition-all relative flex flex-col items-center justify-center min-h-[110px] ${
                      paymentMethod === m.id
                        ? m.id === 'wallet'
                          ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400'
                          : 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-400'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    <div className="text-2xl mb-1">{m.icon}</div>
                    <div className="font-black text-slate-800 leading-tight" style={{ fontSize: '15px', fontWeight: 900 }}>
                      {m.label}
                    </div>
                    {m.id === 'wallet' && (
                      <div
                        className="mt-1.5 font-bold flex items-center justify-center gap-1 border-t border-blue-200/50 pt-1.5 w-full"
                        style={{ color: canPayWallet ? '#059669' : '#EF4444' }}
                      >
                        <span className="text-[10px] font-black text-slate-500">رصيدك:</span>
                        <span className="font-mono" style={{ fontSize: '15px', fontWeight: 900 }}>
                          {walletBalance}ج
                        </span>
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {paymentMethod === 'wallet' && !canPayWallet && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2"
                >
                  <AlertTriangle size={18} className="text-red-500 shrink-0" />
                  <div>
                    <p className="text-xs text-red-600 font-bold">رصيد المحفظة غير كافي</p>
                    <p className="text-[10px] text-red-400">
                      المطلوب: {totalPrice} ج.م | رصيدك: {walletBalance} ج.م
                    </p>
                  </div>
                </motion.div>
              )}

              {paymentMethod === 'wallet' && canPayWallet && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-2"
                >
                  <Wallet size={18} className="text-blue-600 shrink-0" />
                  <div>
                    <p className="text-xs text-blue-600 font-bold">
                      سيتم خصم {totalPrice} ج.م من رصيدك تلقائياً
                  </p>
                    <p className="text-[10px] text-blue-400">
                      الرصيد بعد الخصم: {walletBalance - totalPrice} ج.م
                  </p>
                  </div>
                </motion.div>
              )}
            </div>
          )}

          {/* 🌟 زر التأكيد المرن: يدعم الحجز المجاني الصفر بضغطة واحدة مباشرة */}
          <button
            onClick={handleConfirm}
            disabled={totalPrice > 0 && paymentMethod === 'wallet' && !canPayWallet}
            className={`w-full py-5 rounded-2xl font-black text-lg shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 text-white ${
              totalPrice === 0
                ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-100'
                : paymentMethod === 'wallet' && !canPayWallet
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : paymentMethod === 'wallet'
                  ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'
                  : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100'
            }`}
          >
            {totalPrice === 0 ? (
              <>
                <Gift size={20} className="text-white animate-pulse" />
                <span className="font-black text-white text-center" style={{ color: '#ffffff', fontWeight: 900, fontSize: '16px' }}>
                  تأكيد إنهاء الجلسة مجاناً 🎁
                </span>
              </>
            ) : paymentMethod === 'wallet' ? (
              <>
                <Wallet size={20} className="text-white" />
                <span className="font-black text-white text-center" style={{ color: '#ffffff', fontWeight: 900, fontSize: '16px' }}>
                  خصم من المحفظة ({totalPrice} ج.م)
                </span>
              </>
            ) : (
              <>
                <CheckCircle size={20} className="text-white" />
                <span className="font-black text-white text-center" style={{ color: '#ffffff', fontWeight: 900, fontSize: '16px' }}>
                  تأكيد الدفع نقدي ({totalPrice} ج.م)
                </span>
              </>
            )}
          </button>
        </>
      )}

      {!activeSession && (
        <button
          onClick={() => {
            if (lastCompletedSession && acknowledgeSession) {
              acknowledgeSession(lastCompletedSession.id);
            }
            setSelectedGarageId(null);
            setScreen('list');
          }}
          className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-100 mt-4"
        >
          <Home size={20} className="text-white" />
          <span className="font-black text-white text-center" style={{ color: '#ffffff', fontWeight: 900, fontSize: '16px' }}>
            العودة للرئيسية
          </span>
        </button>
      )}
    </motion.div>
  );
}