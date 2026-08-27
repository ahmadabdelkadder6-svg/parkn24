import { motion } from 'framer-motion';
import {
  CheckCircle,
  Star,
  Home,
  Calculator,
  Wallet,
  AlertTriangle,
  Gift,
  Coins,
  Sparkles,
} from 'lucide-react';
import { useStore, pausePolling, calculateSessionPrice, calculateTierRefund, isEligibleForFreeFirstSession } from '../store';
import { useState, useMemo, useEffect, useRef } from 'react';
import { calculateFullHours, formatTime } from '../utils/pricing';
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
    fetchAll,
    acknowledgeSession,
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

  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'wallet'>('cash');
  const [rating, setRating] = useState(4);
  const [done, setDone] = useState(false);
  const [doneMethod, setDoneMethod] = useState('');
  const [doneTotalPrice, setDoneTotalPrice] = useState(0);
  const [remainingWallet, setRemainingWallet] = useState(0);

  const isEndingRef = useRef(false);
  const autoRedirectedRef = useRef(false);
  const realtimeChannelRef = useRef<any>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  const totalHours = calculateFullHours(durationSeconds);

  // 🎁 هل هذه الجلسة الأولى المجانية للعميل؟ (لا تطبق على الإضافات اليدوية)
  const isFirstFree = useMemo(() => {
    if (referenceSession?.source === 'manual') return false;
    if (referenceSession?.isFirstFreeSession !== undefined) {
      return referenceSession.isFirstFreeSession;
    }
    if (!currentUser?.carPlate && !currentUser?.phone) return false;
    return isEligibleForFreeFirstSession(sessions, currentUser.carPlate, currentUser.phone);
  }, [referenceSession, sessions, currentUser]);

  // 1. حساب السعر الأساسي الفعلي (قبل الكاش باك)
  const { totalPrice: basePrice } = useMemo(() => {
    return calculateSessionPrice(durationSeconds * 1000, sessionRate, isFirstFree);
  }, [durationSeconds, sessionRate, isFirstFree]);

  // 2. حساب كاش باك المحفظة (يطبق فقط عند اختيار المحفظة، للسيارات عبر التطبيق، ومن ثاني ركنة فصاعداً)
  const cashbackAmount = useMemo(() => {
    if (isFirstFree) return 0;
    if (referenceSession?.source === 'manual') return 0; 
    if (paymentMethod !== 'wallet') return 0; 
    return calculateTierRefund(basePrice);
  }, [isFirstFree, paymentMethod, basePrice, referenceSession]);

  // 3. السعر النهائي المطلوب دفعه فعلياً حسب طريقة الدفع
  const totalPrice = useMemo(() => {
    if (referenceSession?.status === 'completed' && referenceSession?.totalPrice != null) {
      return Number(referenceSession.totalPrice);
    }
    return Math.max(0, basePrice - cashbackAmount);
  }, [referenceSession, basePrice, cashbackAmount]);

  const walletBalance = currentUser?.wallet ?? 0;
  const canPayWallet = walletBalance >= totalPrice;

  const methods = [
    { id: 'cash' as const, label: 'نقدي كاش', icon: '💵' },
    { id: 'wallet' as const, label: 'خصم من المحفظة', icon: '👝' },
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

  const handleConfirm = async () => {
    if (paymentMethod === 'wallet') {
      if (!canPayWallet) { toast.error('رصيد المحفظة غير كافٍ'); return; }
      
      // 🚀 تم إلغاء deductWallet المحلية هنا منعاً باتاً للخصم المزدوج! الخصم يتم الآن بأمان تام داخل دالة endSession بالـ store
      const success = await safeEndSession('wallet', totalPrice);
      if (success) {
        toast.success('تم الخصم من المحفظة بنجاح! ✅');
        setDoneTotalPrice(totalPrice);
        setDoneMethod('wallet');
        setRemainingWallet(walletBalance - totalPrice);
        setDone(true);
      } else {
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
          {doneMethod === 'cash' || !doneMethod
            ? 'تم إنهاء الجلسة بنجاح'
            : 'تم الدفع بنجاح من المحفظة'}
        </p>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6 text-center w-full shadow-sm">
          <div className="text-4xl font-black text-slate-900 font-mono mb-1">
            {doneTotalPrice.toFixed(0)} ج.م
          </div>
          <div className="text-xs text-slate-400 mb-2">
            {totalHours} ساعة محسوبة × {sessionRate} ج.م
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
                : '💵 نقدي كاش'}
            </div>
          )}

          {isFirstFree && (
            <div className="mt-2 text-emerald-600 font-bold text-xs">
              🎁 هدية ترحيبية: أول ساعة مجاناً
            </div>
          )}

          {doneMethod === 'wallet' && (
            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-2">
              <span className="text-[10px] text-slate-500">الرصيد المتبقي: </span>
              <span className="text-sm font-black text-blue-600 font-mono">
                {remainingWallet.toFixed(0)} ج.م
              </span>
            </div>
          )}
        </div>

        <div className="mb-6 w-full text-center">
          <p className="text-xs text-slate-500 font-bold mb-2">قيّم تجربتك</p>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} onClick={() => setRating(s)} className="transition-all active:scale-90 bg-transparent border-none">
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
          onClick={() => {
            if (lastCompletedSession && acknowledgeSession) {
              acknowledgeSession(lastCompletedSession.id);
            }
            setSelectedGarageId(null);
            setScreen('list');
          }}
          className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-100 border-none cursor-pointer"
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
        <h2 className="text-2xl font-black text-center mb-2 text-slate-900">ملخص الفاتورة</h2>
        <p className="text-slate-500 text-sm text-center">
          {activeSession ? 'راجع التفاصيل وأكد طريقة الدفع' : 'تم إنهاء الجلسة'}
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

      {/* 🎁 لافتة إعلان الجلسة الأولى المجانية */}
      {isFirstFree && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-4 p-3.5 rounded-2xl flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 text-right"
        >
          <Gift size={20} className="text-emerald-600 shrink-0" />
          <div className="flex-1">
            <div className="font-black text-xs text-emerald-800">هدية ترحيبية: أول ساعة مجاناً! 🎁</div>
            <p className="text-[10px] text-emerald-600 font-bold mt-0.5">
              بما أنها ركنتك الأولى عبر التطبيق، فأول ساعة مجانية بالكامل وتُحاسب فقط عن الوقت الإضافي.
            </p>
          </div>
        </motion.div>
      )}

      {/* ✋ تنبيه السيارات اليدوية (لا مجاني ولا كاش باك) */}
      {referenceSession?.source === 'manual' && (
        <div className="mb-4 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-right text-amber-800 font-bold text-xs flex items-center gap-2">
          <span>⚠️ هذه الجلسة مضافة يدوياً من السايس، وبالتالي لا ينطبق عليها العرض الترحيبي أو الكاش باك.</span>
        </div>
      )}

      {/* 💰 شريط إعلان الكاش باك التراكمي */}
      {referenceSession?.source !== 'manual' && !isFirstFree && paymentMethod === 'wallet' && cashbackAmount > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-4 p-3.5 rounded-2xl flex items-center gap-2.5 bg-blue-50 border border-blue-200 text-right"
        >
          <Coins size={20} className="text-blue-600 shrink-0" />
          <div className="flex-1">
            <div className="font-black text-xs text-blue-800 flex items-center justify-between">
              <span>كاش باك المحفظة التراكمي ✨</span>
              <span className="font-mono text-emerald-600 font-black">-{cashbackAmount} ج.م</span>
            </div>
            <p className="text-[10px] text-blue-600 font-bold mt-0.5">
              تم تطبيق خصم الكاش باك الفوري لمبلغ الركنة بنجاح!
            </p>
          </div>
        </motion.div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4 shadow-sm">
        <div className="text-center mb-3">
          <div className="text-4xl font-black text-slate-900 font-mono mb-0.5">
            {totalPrice.toFixed(0)} ج.م
          </div>
          <div className="text-[10px] text-slate-400 font-bold">
            {isFirstFree && totalPrice === 0 ? 'ركنة مجانية بالكامل' : 'إجمالي الصافي المطلوب دفعه'}
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 border border-slate-100">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Calculator size={14} className="text-blue-600" />
            <span className="text-[10px] text-slate-500 font-bold">تفاصيل الفاتورة</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">مدة الركن الفعلي</span>
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

            {isFirstFree && (
              <div className="flex justify-between text-xs text-emerald-600 font-bold">
                <span>خصم أول ساعة ترحيبية مجاناً</span>
                <span className="font-mono">-{sessionRate} ج.م</span>
              </div>
            )}

            {referenceSession?.source !== 'manual' && !isFirstFree && paymentMethod === 'wallet' && cashbackAmount > 0 && (
              <div className="flex justify-between text-xs text-blue-600 font-bold">
                <span>خصم كاش باك المحفظة (الشرائح)</span>
                <span className="font-mono">-{cashbackAmount} ج.م</span>
              </div>
            )}

            {garage && sessionRate !== garage.basePrice && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-1.5 text-center">
                <p className="text-[9px] text-amber-600 font-bold">
                  💰 سعر خاص متفق عليه (بدل {garage.basePrice} ج.م/ساعة)
                </p>
              </div>
            )}

            <div className="border-t border-slate-200 pt-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-700 font-bold">الصافي المطلوب دفعه</span>
                <span className="font-black text-emerald-600 font-mono text-sm">
                  {totalPrice.toFixed(0)} ج.م
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
          <div className="mb-6">
            <h3 className="text-sm font-black text-slate-700 mb-3 text-right">اختر طريقة الدفع</h3>
            <div className="grid grid-cols-2 gap-3">
              {methods.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setPaymentMethod(m.id)}
                  className={`py-3 px-3 rounded-2xl border text-center transition-all relative flex flex-col items-center justify-center min-h-[110px] cursor-pointer ${
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
                        {walletBalance.toFixed(0)}ج
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
                  <p className="text-xs text-red-600 font-bold">رصيد المحفظة غير كافٍ</p>
                  <p className="text-[10px] text-red-400">
                    المطلوب: {totalPrice.toFixed(0)} ج.م | رصيدك: {walletBalance.toFixed(0)} ج.م
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
                    سيتم خصم {totalPrice.toFixed(0)} ج.م من رصيد محفظتك
                  </p>
                  <p className="text-[10px] text-blue-400">
                    الرصيد المتبقي بعد الخصم: {(walletBalance - totalPrice).toFixed(0)} ج.م
                  </p>
                </div>
              </motion.div>
            )}
          </div>

          <div className="mb-8">
            <h3 className="text-sm font-black text-slate-700 mb-3 text-right">قيّم تجربتك</h3>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => setRating(s)} className="transition-all active:scale-90 border-none bg-transparent cursor-pointer">
                  <Star
                    size={36}
                    className={s <= rating ? 'text-amber-400' : 'text-slate-200'}
                    fill={s <= rating ? 'currentColor' : 'none'}
                  />
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleConfirm}
            disabled={paymentMethod === 'wallet' && !canPayWallet}
            className={`w-full py-5 rounded-2xl font-black text-lg shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 text-white border-none cursor-pointer ${
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
                  خصم من المحفظة ({totalPrice.toFixed(0)} ج.م)
                </span>
              </>
            ) : (
              <>
                <CheckCircle size={20} className="text-white" />
                <span className="font-black text-white text-center" style={{ color: '#ffffff', fontWeight: 900, fontSize: '16px' }}>
                  تأكيد الدفع نقدي ({totalPrice.toFixed(0)} ج.م)
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
          className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-100 mt-4 border-none cursor-pointer"
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