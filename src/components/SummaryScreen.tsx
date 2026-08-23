import { motion } from 'framer-motion';
import {
  CheckCircle,
  Star,
  Home,
  Calculator,
  Wallet,
  AlertTriangle,
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

const normalizePlate = (plate?: string): string => {
  if (!plate) return '';
  return plate
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶٧٨٩'.indexOf(d)))
    .replace(/\s+/g, ' ')
    .toUpperCase();
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
  } = useStore();

  const userPlate = normalizePlate(currentUser?.carPlate);
  const userPhone = currentUser?.phone || '';

  const isMySession = (s: any): boolean => {
    const samePlate = !!userPlate && normalizePlate(s.carPlate) === userPlate;
    const samePhone = !!userPhone && (s as any).customerPhone === userPhone;
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

  /* ── State ── */
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [rating, setRating] = useState(4);
  const [done, setDone] = useState(false);
  const [doneMethod, setDoneMethod] = useState('');
  const [doneTotalPrice, setDoneTotalPrice] = useState(0);
  const [remainingWallet, setRemainingWallet] = useState(0);

  const isEndingRef = useRef(false);
  const autoRedirectedRef = useRef(false);
  const realtimeChannelRef = useRef<any>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Realtime + Polling */
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
            const phone = r.customer_phone || r.customerPhone || '';
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

  /* الاكتشاف التلقائي: السايس أنهى الجلسة */
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

  /* Computed */
  const durationSeconds = referenceSession
    ? referenceSession.status === 'completed' && referenceSession.endTime
      ? Math.floor((toMs(referenceSession.endTime) - toMs(referenceSession.startTime)) / 1000)
      : Math.floor((Date.now() - toMs(referenceSession.startTime)) / 1000)
    : 0;

  const durationMinutes = Math.floor(durationSeconds / 60);
  const sessionRate = Number(referenceSession?.agreedPrice ?? garage?.basePrice ?? 0);
  const totalHours = calculateFullHours(durationSeconds);

  const totalPrice =
    referenceSession?.status === 'completed' &&
    referenceSession?.totalPrice != null &&
    Number(referenceSession.totalPrice) > 0
      ? Number(referenceSession.totalPrice)
      : calculateCost(durationSeconds, sessionRate);

  const walletBalance = currentUser?.wallet ?? 0;
  const canPayWallet = walletBalance >= totalPrice;

  /* ✅ طريقتين فقط للحريف */
  const methods = [
    { id: 'cash', label: 'نقدي كاش', icon: '💵' },
    { id: 'wallet', label: 'من رصيد المحفظة', icon: '👝' },
  ];

  /* safeEndSession */
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
      await endSession(activeSession.id, price, method);
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

  /* Handler */
  const handleConfirm = async () => {
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

    /* Cash */
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

  /* شاشة النجاح */
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
          {doneMethod === 'cash' || !doneMethod
            ? 'تم إنهاء الجلسة بنجاح'
            : 'تم الدفع بنجاح'}
        </p>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6 text-center w-full shadow-sm">
          <div className="text-4xl font-black text-slate-900 font-mono mb-1">
            {doneTotalPrice > 0 ? `${doneTotalPrice} ج.م` : `${totalPrice} ج.م`}
          </div>
          <div className="text-xs text-slate-400 mb-2">
            {totalHours} ساعة × {sessionRate} ج.م
          </div>
          {doneMethod && (
            <div
              className={`inline-block px-3 py-1 rounded-full text-[10px] font-black ${
                doneMethod === 'wallet'
                  ? 'bg-blue-100 text-blue-600'
                  : 'bg-emerald-100 text-emerald-600'
              }`}
            >
              {doneMethod === 'wallet'
                ? '👝 خصم من المحفظة'
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

        <div className="mb-6 w-full text-center">
          <p className="text-xs text-slate-500 font-bold mb-2">قيّم تجربتك</p>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} onClick={() => setRating(s)} className="transition-all active:scale-90">
                <Star
                  size={30}
                  className={s <= rating ? 'text-amber-400' : 'text-slate-200'}
                  fill={s <= rating ? 'currentColor' : 'none'}
                />
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => { setSelectedGarageId(null); setScreen('list'); }}
          className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-100"
        >
          <Home size={20} className="text-white" />
          <span className="font-black text-white text-center animate-fade-in" style={{ color: '#ffffff', fontWeight: 900, fontSize: '16px' }}>
            العودة للرئيسية
          </span>
        </button>
      </motion.div>
    );
  }

  /* الشاشة الرئيسية */
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

      {/* 📥 تم تصغير كارت التكلفة ليكون مدمجاً وأنيقاً */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4 shadow-sm">
        <div className="text-center mb-3">
          <div className="text-4xl font-black text-slate-900 font-mono mb-0.5">
            {totalPrice} ج.م
          </div>
          <div className="text-[10px] text-slate-400 font-bold">إجمالي التكلفة الحالية</div>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 border border-slate-100">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Calculator size={14} className="text-blue-600" />
            <span className="text-[10px] text-slate-500 font-bold">تفاصيل الحساب</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">مدة الركن</span>
              <span className="font-black text-slate-900 font-mono">{durationMinutes} دقيقة</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">الساعات المحسوبة</span>
              <span className="font-black text-blue-600 font-mono">{totalHours} ساعة</span>
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
                <span className="text-slate-700 font-bold">الإجمالي</span>
                <span className="font-black text-emerald-600 font-mono">
                  {totalHours} × {sessionRate} = {totalPrice} ج.م
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

      {/* ✅ طرق الدفع - نقدي أو محفظة فقط */}
      {activeSession && (
        <>
          <div className="mb-6">
            <h3 className="text-sm font-black text-slate-700 mb-3 text-right">طريقة الدفع</h3>
            <div className="grid grid-cols-2 gap-3">
              {methods.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setPaymentMethod(m.id)}
                  className={`p-4 rounded-2xl border text-center transition-all relative ${
                    paymentMethod === m.id
                      ? m.id === 'wallet'
                        ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400'
                        : 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-400'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}
                >
                  <div className="text-2xl mb-1">{m.icon}</div>
                  
                  {/* 🚀 تكبير وتوضيح كلمة "من رصيد المحفظة" */}
                  <div className="font-black text-slate-700" style={{ fontSize: m.id === 'wallet' ? '14px' : '13px' }}>
                    {m.label}
                  </div>

                  {/* 🚀 تكبير وتوضيح "رصيدك والمبلغ" بالخط العريض */}
                  {m.id === 'wallet' && (
                    <div
                      className="mt-2.5 font-bold flex flex-col items-center justify-center border-t border-blue-200/50 pt-1.5"
                      style={{ color: canPayWallet ? '#059669' : '#EF4444' }}
                    >
                      <span className="text-[10px] font-black text-slate-500">رصيدك الحالي</span>
                      <span className="font-mono mt-0.5" style={{ fontSize: '15px', fontWeight: 900 }}>
                        {walletBalance} ج.م
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

          <div className="mb-8">
            <h3 className="text-sm font-black text-slate-700 mb-3 text-right">قيّم تجربتك</h3>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => setRating(s)} className="transition-all active:scale-90">
                  <Star
                    size={36}
                    className={s <= rating ? 'text-amber-400' : 'text-slate-200'}
                    fill={s <= rating ? 'currentColor' : 'none'}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* ✅ زر تأكيد الدفع والإنهاء بالخط الأبيض العريض */}
          <button
            onClick={handleConfirm}
            disabled={paymentMethod === 'wallet' && !canPayWallet}
            className={`w-full py-5 rounded-2xl font-black text-lg shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 text-white ${
              paymentMethod === 'wallet' && !canPayWallet
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : paymentMethod === 'wallet'
                  ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'
                  : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100'
            }`}
          >
            {paymentMethod === 'wallet' ? (
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
          onClick={() => { setSelectedGarageId(null); setScreen('list'); }}
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