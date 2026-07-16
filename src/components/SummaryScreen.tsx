import { motion } from 'framer-motion';
import {
  CheckCircle,
  Star,
  Home,
  Calculator,
  Copy,
  ExternalLink,
  ArrowRight,
  ShieldCheck,
  Lock,
  Wallet,
  Phone,
  AlertTriangle,
} from 'lucide-react';
import { useStore, pausePolling } from '../store';
import { useState, useMemo, useEffect, useRef } from 'react';
import { calculateFullHours, calculateCost } from '../utils/pricing';
import toast from 'react-hot-toast';

const INSTAPAY_USERNAME = 'ahmed.ali858104';
const INSTAPAY_LINK = `https://ipn.eg/S/${INSTAPAY_USERNAME}/instapay/9fp24n`;
const CASH_WALLET_NUMBER = '01229858104';

function generateConfirmCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

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
  } = useStore();

  const garage = garages.find((g) => g.id === selectedGarageId);
  const userPlate = (currentUser?.carPlate ?? '').trim().toUpperCase();

  const activeSession = sessions.find(
    (s) =>
      s.carPlate.trim().toUpperCase() === userPlate &&
      s.status === 'active'
  );

  const lastCompletedSession = sessions
    .filter(
      (s) =>
        s.carPlate.trim().toUpperCase() === userPlate &&
        s.status === 'completed'
    )
    .sort((a, b) => {
      const endA = typeof a.endTime === 'number' ? a.endTime : 0;
      const endB = typeof b.endTime === 'number' ? b.endTime : 0;
      return endB - endA;
    })[0];

  const referenceSession = activeSession ?? lastCompletedSession;

  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [rating, setRating] = useState(4);
  const [done, setDone] = useState(false);
  const [doneMethod, setDoneMethod] = useState('');
  const [doneTotalPrice, setDoneTotalPrice] = useState(0);
  const [remainingWallet, setRemainingWallet] = useState(0);
  const isEndingRef = useRef(false);

  const [instapayStep, setInstapayStep] = useState<'select' | 'info' | 'confirm'>('select');
  const instapayCode = useMemo(() => generateConfirmCode(), []);
  const [instapayEnteredCode, setInstapayEnteredCode] = useState('');
  const [instapayCodeError, setInstapayCodeError] = useState(false);

  const [cashWalletStep, setCashWalletStep] = useState<'select' | 'info' | 'confirm'>('select');
  const cashWalletCode = useMemo(() => generateConfirmCode(), []);
  const [cashWalletEnteredCode, setCashWalletEnteredCode] = useState('');
  const [cashWalletCodeError, setCashWalletCodeError] = useState(false);

  useEffect(() => {
    if (done) return;
    if (!lastCompletedSession) return;
    if (activeSession) return;

    const endTime =
      typeof lastCompletedSession.endTime === 'number'
        ? lastCompletedSession.endTime
        : 0;
    const timeSinceEnd = Date.now() - endTime;

    if (
      endTime > 0 &&
      timeSinceEnd < 60000 &&
      lastCompletedSession.totalPrice != null &&
      lastCompletedSession.totalPrice > 0
    ) {
      setDoneTotalPrice(Number(lastCompletedSession.totalPrice));
      setDoneMethod(lastCompletedSession.paymentMethod ?? 'cash');
      setRemainingWallet(currentUser?.wallet ?? 0);
      setDone(true);
    }
  }, [
    lastCompletedSession?.id,
    lastCompletedSession?.totalPrice,
    activeSession,
    done,
  ]);

  if (!garage) return null;

  const durationSeconds = referenceSession
    ? referenceSession.status === 'completed' && referenceSession.endTime
      ? Math.floor(
          ((typeof referenceSession.endTime === 'number'
            ? referenceSession.endTime
            : new Date(referenceSession.endTime).getTime()) -
            referenceSession.startTime) /
            1000
        )
      : Math.floor((Date.now() - referenceSession.startTime) / 1000)
    : 0;

  const durationMinutes = Math.floor(durationSeconds / 60);
  const sessionRate = Number(referenceSession?.agreedPrice ?? garage.basePrice);
  const totalHours = calculateFullHours(durationSeconds);

  const totalPrice =
    referenceSession?.status === 'completed' &&
    referenceSession?.totalPrice != null &&
    referenceSession.totalPrice > 0
      ? Number(referenceSession.totalPrice)
      : calculateCost(durationSeconds, sessionRate);

  const walletBalance = currentUser?.wallet ?? 0;
  const canPayWallet = walletBalance >= totalPrice;

  const methods = [
    { id: 'cash', label: 'نقدي', icon: '💵' },
    { id: 'instapay', label: 'إنستاباي', icon: '📱' },
    { id: 'wallet', label: 'المحفظة', icon: '👝' },
    { id: 'cashwallet', label: 'تحويل محفظة كاش', icon: '📲' },
  ];

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`تم نسخ ${label}`),
      () => toast.error('فشل النسخ')
    );
  };

  const safeEndSession = async (
    method: string,
    price: number
  ): Promise<boolean> => {
    if (isEndingRef.current) return false;
    if (!activeSession) return false;
    if (activeSession.status !== 'active') return false;

    isEndingRef.current = true;
    pausePolling(15000);

    try {
      await endSession(activeSession.id, price, method);
      return true;
    } catch (err) {
      console.error('❌ خطأ في endSession:', err);
      return false;
    } finally {
      setTimeout(() => {
        isEndingRef.current = false;
      }, 3000);
    }
  };

  const handleConfirm = async () => {
    if (paymentMethod === 'instapay') {
      setInstapayStep('info');
      return;
    }
    if (paymentMethod === 'cashwallet') {
      setCashWalletStep('info');
      return;
    }

    if (paymentMethod === 'wallet') {
      if (!canPayWallet) {
        toast.error('رصيد المحفظة غير كافي');
        return;
      }
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

    const success = await safeEndSession(paymentMethod, totalPrice);
    if (success) {
      toast.success('تم إنهاء الجلسة بنجاح!');
      setDoneTotalPrice(totalPrice);
      setDoneMethod(paymentMethod);
      setRemainingWallet(walletBalance);
      setDone(true);
    } else {
      toast.error('حدث خطأ، حاول مرة أخرى');
    }
  };

  const handleInstapayConfirm = async () => {
    if (instapayEnteredCode !== instapayCode) {
      setInstapayCodeError(true);
      toast.error('كود التأكيد غير صحيح');
      return;
    }
    const success = await safeEndSession('instapay', totalPrice);
    if (success) {
      toast.success('تم تأكيد السداد عبر إنستاباي بنجاح! ✅');
      setDoneTotalPrice(totalPrice);
      setDoneMethod('instapay');
      setRemainingWallet(walletBalance);
      setDone(true);
    } else {
      toast.error('حدث خطأ، حاول مرة أخرى');
    }
  };

  const handleCashWalletConfirm = async () => {
    if (cashWalletEnteredCode !== cashWalletCode) {
      setCashWalletCodeError(true);
      toast.error('كود التأكيد غير صحيح');
      return;
    }
    const success = await safeEndSession('cashwallet', totalPrice);
    if (success) {
      toast.success('تم تأكيد السداد عبر تحويل محفظة كاش ✅');
      setDoneTotalPrice(totalPrice);
      setDoneMethod('cashwallet');
      setRemainingWallet(walletBalance);
      setDone(true);
    } else {
      toast.error('حدث خطأ، حاول مرة أخرى');
    }
  };

  // ========== شاشة النجاح ==========
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
        <p className="text-slate-500 text-sm mb-2 text-center">تم الدفع بنجاح</p>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6 text-center w-full shadow-sm">
          <div className="text-4xl font-black text-slate-900 font-mono mb-1">
            {doneTotalPrice} ج.م
          </div>
          <div className="text-xs text-slate-400 mb-2">
            {totalHours} ساعة × {sessionRate} ج.م
          </div>
          <div
            className={`inline-block px-3 py-1 rounded-full text-[10px] font-black ${
              doneMethod === 'instapay'
                ? 'bg-purple-100 text-purple-600'
                : doneMethod === 'wallet'
                ? 'bg-blue-100 text-blue-600'
                : doneMethod === 'cashwallet'
                ? 'bg-orange-100 text-orange-600'
                : 'bg-emerald-100 text-emerald-600'
            }`}
          >
            {doneMethod === 'instapay'
              ? '📱 إنستاباي'
              : doneMethod === 'wallet'
              ? '👝 خصم من المحفظة'
              : doneMethod === 'cashwallet'
              ? '📲 تحويل محفظة كاش'
              : '💵 نقدي'}
          </div>

          {doneMethod === 'wallet' && (
            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-2">
              <span className="text-[10px] text-slate-500">
                الرصيد المتبقي:{' '}
              </span>
              <span className="text-sm font-black text-blue-600 font-mono">
                {remainingWallet} ج.م
              </span>
            </div>
          )}
        </div>
        <button
          onClick={() => {
            setSelectedGarageId(null);
            setScreen('list');
          }}
          className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-100"
        >
          <Home size={20} /> العودة للرئيسية
        </button>
      </motion.div>
    );
  }

  // ========== شاشة تأكيد كود (مشتركة) ==========
  const renderConfirmCodeScreen = (
    title: string,
    code: string,
    enteredCode: string,
    setEnteredCode: (v: string) => void,
    codeError: boolean,
    setCodeError: (v: boolean) => void,
    onConfirm: () => void,
    onBack: () => void,
    color: string
  ) => (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="h-full bg-white text-slate-900 p-6 overflow-y-auto"
    >
      <div className="pt-10 mb-4">
        <button
          onClick={onBack}
          className="bg-slate-100 p-2 rounded-xl border border-slate-200 mb-4 flex items-center gap-2 text-xs text-slate-500"
        >
          <ArrowRight size={16} /> رجوع
        </button>
        <h2 className="text-xl font-black text-center mb-1 text-slate-900">{title}</h2>
        <p className="text-slate-500 text-xs text-center">
          أدخل كود التأكيد لإنهاء عملية الدفع
        </p>
      </div>
      <div className="bg-white border border-slate-200 rounded-[2rem] p-6 mb-6 shadow-sm">
        <div className="text-center mb-6">
          <ShieldCheck
            size={40}
            className={`text-${color}-500 mx-auto mb-3`}
          />
          <p className="text-xs text-slate-500 mb-3">كود التأكيد الخاص بك</p>
          <div
            className={`bg-${color}-50 border-2 border-dashed border-${color}-300 rounded-2xl p-4 mb-4`}
          >
            <div
              className={`text-4xl font-black text-${color}-600 font-mono tracking-[0.3em]`}
            >
              {code}
            </div>
          </div>
          <button
            onClick={() => copyToClipboard(code, 'كود التأكيد')}
            className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 mx-auto active:scale-95 transition-all border border-slate-200"
          >
            <Copy size={14} /> نسخ الكود
          </button>
        </div>
        <div className="border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-500 mb-3 text-right">
            أدخل كود التأكيد بعد إتمام التحويل
          </p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={enteredCode}
            onChange={(e) => {
              setEnteredCode(e.target.value.replace(/\D/g, ''));
              setCodeError(false);
            }}
            placeholder="أدخل الكود المكون من 6 أرقام"
            className={`w-full bg-gray-50 p-4 rounded-2xl text-center text-2xl font-black font-mono tracking-[0.3em] outline-none border-2 transition-all ${
              codeError
                ? 'border-red-400 text-red-500'
                : enteredCode.length === 6
                ? `border-${color}-400 text-${color}-600`
                : 'border-slate-200 text-slate-900'
            }`}
          />
          {codeError && (
            <p className="text-red-500 text-xs text-center mt-2 font-bold">
              ❌ كود التأكيد غير صحيح
            </p>
          )}
        </div>
      </div>
      <div
        className={`bg-${color}-50 border border-${color}-200 rounded-2xl p-4 mb-6 flex items-center justify-between`}
      >
        <span className={`text-2xl font-black text-${color}-600 font-mono`}>
          {totalPrice} ج.م
        </span>
        <span className="text-xs text-slate-500">المبلغ المحول</span>
      </div>
      <button
        onClick={onConfirm}
        disabled={enteredCode.length !== 6}
        className={`w-full py-5 rounded-2xl font-black text-lg shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 ${
          enteredCode.length === 6
            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
        }`}
      >
        <Lock size={20} /> تأكيد السداد وإنهاء الركن
      </button>
    </motion.div>
  );

  // ========== شاشة كود تأكيد إنستاباي ==========
  if (paymentMethod === 'instapay' && instapayStep === 'confirm') {
    return renderConfirmCodeScreen(
      'تأكيد سداد إنستاباي',
      instapayCode,
      instapayEnteredCode,
      setInstapayEnteredCode,
      instapayCodeError,
      setInstapayCodeError,
      handleInstapayConfirm,
      () => setInstapayStep('info'),
      'purple'
    );
  }

  // ========== شاشة كود تأكيد محفظة كاش ==========
  if (paymentMethod === 'cashwallet' && cashWalletStep === 'confirm') {
    return renderConfirmCodeScreen(
      'تأكيد تحويل محفظة كاش',
      cashWalletCode,
      cashWalletEnteredCode,
      setCashWalletEnteredCode,
      cashWalletCodeError,
      setCashWalletCodeError,
      handleCashWalletConfirm,
      () => setCashWalletStep('info'),
      'orange'
    );
  }

  // ========== شاشة بيانات إنستاباي ==========
  if (paymentMethod === 'instapay' && instapayStep === 'info') {
    return (
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="h-full bg-white text-slate-900 p-6 overflow-y-auto"
      >
        <div className="pt-10 mb-4">
          <button
            onClick={() => {
              setPaymentMethod('cash');
              setInstapayStep('select');
            }}
            className="bg-slate-100 p-2 rounded-xl border border-slate-200 mb-4 flex items-center gap-2 text-xs text-slate-500"
          >
            <ArrowRight size={16} /> رجوع لطرق الدفع
          </button>
          <h2 className="text-xl font-black text-center mb-1 text-slate-900">
            الدفع عبر إنستاباي
          </h2>
          <p className="text-slate-500 text-xs text-center">
            قم بتحويل المبلغ ثم أكد السداد
          </p>
        </div>

        <div className="bg-gradient-to-br from-purple-100 to-indigo-50 border border-purple-200 rounded-[2rem] p-6 mb-5 text-center">
          <p className="text-xs text-purple-600 font-bold mb-2">
            المبلغ المطلوب تحويله
          </p>
          <div className="text-5xl font-black text-slate-900 font-mono mb-1">
            {totalPrice}
          </div>
          <div className="text-sm text-purple-600 font-bold">جنيه مصري</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[2rem] p-5 mb-5 shadow-sm">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="bg-purple-600 p-2 rounded-xl">
              <span className="text-xl">📱</span>
            </div>
            <h3 className="text-sm font-black text-slate-900">بيانات التحويل</h3>
          </div>

          <div className="bg-gray-50 border border-slate-200 rounded-2xl p-4 mb-3">
            <div className="text-[10px] text-slate-500 font-bold mb-2 text-right">
              رابط الدفع المباشر
            </div>
            <a
              href={INSTAPAY_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg mb-2"
            >
              <ExternalLink size={16} /> اضغط هنا لإرسال نقود
            </a>
            <div className="flex items-center justify-between bg-white rounded-xl p-2 border border-slate-200">
              <button
                onClick={() =>
                  copyToClipboard(INSTAPAY_LINK, 'رابط إنستاباي')
                }
                className="text-blue-600 active:scale-90 transition-all"
              >
                <Copy size={16} />
              </button>
              <div
                className="text-[9px] text-slate-500 font-mono truncate flex-1 text-right mr-2"
                dir="ltr"
              >
                {INSTAPAY_LINK}
              </div>
            </div>
          </div>

          <div className="bg-gray-50 border border-slate-200 rounded-2xl p-4 mb-3">
            <div className="flex items-center justify-between mb-1">
              <button
                onClick={() =>
                  copyToClipboard(
                    `${INSTAPAY_USERNAME}@instapay`,
                    'حساب إنستاباي'
                  )
                }
                className="text-blue-600 active:scale-90 transition-all"
              >
                <Copy size={14} />
              </button>
              <div className="text-[10px] text-slate-500 font-bold">
                إرسال نقود إلى
              </div>
            </div>
            <div
              className="text-lg font-black text-purple-600 font-mono text-center"
              dir="ltr"
            >
              {INSTAPAY_USERNAME}@instapay
            </div>
          </div>

          <div className="text-center mt-3">
            <div className="inline-flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-full border border-slate-200">
              <span className="text-[10px] text-slate-500">Powered by</span>
              <span className="text-xs font-black text-purple-600">
                InstaPay
              </span>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-5">
          <h4 className="text-xs font-black text-slate-700 mb-3 text-right">
            خطوات الدفع:
          </h4>
          <div className="space-y-3">
            {[
              'اضغط على رابط الدفع أو انسخ حساب إنستاباي',
              `قم بتحويل ${totalPrice} ج.م عبر تطبيق البنك`,
              'بعد التحويل، اضغط "تم التحويل" وأدخل كود التأكيد',
            ].map((t, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0">
                  {i + 1}
                </div>
                <p className="text-xs text-slate-500">{t}</p>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => setInstapayStep('confirm')}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-purple-100 active:scale-95 transition-all flex items-center justify-center gap-3 mb-4"
        >
          <CheckCircle size={22} /> تم التحويل - أدخل كود التأكيد
        </button>
      </motion.div>
    );
  }

  // ========== شاشة بيانات تحويل محفظة كاش ==========
  if (paymentMethod === 'cashwallet' && cashWalletStep === 'info') {
    return (
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="h-full bg-white text-slate-900 p-6 overflow-y-auto"
      >
        <div className="pt-10 mb-4">
          <button
            onClick={() => {
              setPaymentMethod('cash');
              setCashWalletStep('select');
            }}
            className="bg-slate-100 p-2 rounded-xl border border-slate-200 mb-4 flex items-center gap-2 text-xs text-slate-500"
          >
            <ArrowRight size={16} /> رجوع لطرق الدفع
          </button>
          <h2 className="text-xl font-black text-center mb-1 text-slate-900">
            تحويل محفظة كاش
          </h2>
          <p className="text-slate-500 text-xs text-center">
            قم بتحويل المبلغ على الرقم التالي
          </p>
        </div>

        <div className="bg-gradient-to-br from-orange-100 to-amber-50 border border-orange-200 rounded-[2rem] p-6 mb-5 text-center">
          <p className="text-xs text-orange-600 font-bold mb-2">
            المبلغ المطلوب تحويله
          </p>
          <div className="text-5xl font-black text-slate-900 font-mono mb-1">
            {totalPrice}
          </div>
          <div className="text-sm text-orange-600 font-bold">جنيه مصري</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[2rem] p-5 mb-5 shadow-sm">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="bg-orange-600 p-2 rounded-xl">
              <span className="text-xl">📲</span>
            </div>
            <h3 className="text-sm font-black text-slate-900">رقم التحويل</h3>
          </div>

          <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-5 mb-4 text-center">
            <div className="text-[10px] text-slate-500 font-bold mb-2">
              حوّل على الرقم التالي
            </div>
            <div
              className="text-3xl font-black text-orange-600 font-mono tracking-wider mb-3"
              dir="ltr"
            >
              {CASH_WALLET_NUMBER}
            </div>
            <button
              onClick={() =>
                copyToClipboard(CASH_WALLET_NUMBER, 'رقم التحويل')
              }
              className="bg-orange-100 text-orange-600 px-5 py-2 rounded-xl text-xs font-black flex items-center gap-2 mx-auto active:scale-95 transition-all border border-orange-200"
            >
              <Copy size={14} /> نسخ الرقم
            </button>
          </div>

          <a
            href={`tel:${CASH_WALLET_NUMBER}`}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all border border-slate-200"
          >
            <Phone size={16} /> اتصل بالرقم
          </a>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-5">
          <h4 className="text-xs font-black text-slate-700 mb-3 text-right">
            خطوات التحويل:
          </h4>
          <div className="space-y-3">
            {[
              `انسخ الرقم ${CASH_WALLET_NUMBER}`,
              `افتح تطبيق المحفظة (فودافون كاش / أورانج كاش / اتصالات كاش / WE Pay)`,
              `حوّل المبلغ ${totalPrice} ج.م على الرقم`,
              'بعد التحويل، اضغط "تم التحويل" وأدخل كود التأكيد',
            ].map((t, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 bg-orange-600 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0">
                  {i + 1}
                </div>
                <p className="text-xs text-slate-500">{t}</p>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => setCashWalletStep('confirm')}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-orange-100 active:scale-95 transition-all flex items-center justify-center gap-3 mb-4"
        >
          <CheckCircle size={22} /> تم التحويل - أدخل كود التأكيد
        </button>
      </motion.div>
    );
  }

  // ========== الشاشة الرئيسية ==========
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-white text-slate-900 p-6 overflow-y-auto"
    >
      <div className="pt-10 mb-6">
        <h2 className="text-2xl font-black text-center mb-2 text-slate-900">ملخص الجلسة</h2>
        <p className="text-slate-500 text-sm text-center">
          راجع التفاصيل وأكد الدفع
        </p>
      </div>

      {/* Summary */}
      <div className="bg-white border border-slate-200 rounded-[2rem] p-6 mb-6 shadow-sm">
        <div className="text-center mb-6">
          <div className="text-5xl font-black text-slate-900 font-mono mb-1">
            {totalPrice} ج.م
          </div>
          <div className="text-xs text-slate-400 font-bold">إجمالي التكلفة</div>
        </div>
        <div className="bg-gray-50 rounded-2xl p-4 mb-4 border border-slate-100">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Calculator size={16} className="text-blue-600" />
            <span className="text-xs text-slate-500 font-bold">
              تفاصيل الحساب
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-slate-500">مدة الركن</span>
              <span className="text-sm font-black text-slate-900 font-mono">
                {durationMinutes} دقيقة
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-500">الساعات المحسوبة</span>
              <span className="text-sm font-black text-blue-600 font-mono">
                {totalHours} ساعة
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-500">سعر الساعة</span>
              <span className="text-sm font-black text-purple-600 font-mono">
                {sessionRate} ج.م
              </span>
            </div>
            {sessionRate !== garage.basePrice && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2 text-center">
                <p className="text-[10px] text-amber-600 font-bold">
                  💰 سعر خاص متفق عليه (بدل {garage.basePrice} ج.م/ساعة)
                </p>
              </div>
            )}
            <div className="border-t border-slate-200 pt-2">
              <div className="flex justify-between">
                <span className="text-sm text-slate-700 font-bold">
                  الإجمالي
                </span>
                <span className="text-lg font-black text-emerald-600 font-mono">
                  {totalHours} × {sessionRate} = {totalPrice} ج.م
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="mb-6">
        <h3 className="text-sm font-black text-slate-700 mb-3 text-right">
          طريقة الدفع
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {methods.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setPaymentMethod(m.id);
                setInstapayStep('select');
                setCashWalletStep('select');
              }}
              className={`p-4 rounded-2xl border text-center transition-all relative ${
                paymentMethod === m.id
                  ? m.id === 'instapay'
                    ? 'bg-purple-50 border-purple-400 ring-1 ring-purple-400'
                    : m.id === 'cashwallet'
                    ? 'bg-orange-50 border-orange-400 ring-1 ring-orange-400'
                    : m.id === 'wallet'
                    ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400'
                    : 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-400'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
            >
              <div className="text-2xl mb-1">{m.icon}</div>
              <div className="text-xs font-black text-slate-700">{m.label}</div>
              {m.id === 'wallet' && (
                <div
                  className={`text-[9px] mt-1 font-mono font-bold ${
                    canPayWallet ? 'text-emerald-600' : 'text-red-500'
                  }`}
                >
                  رصيدك: {walletBalance} ج.م
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
              <p className="text-xs text-red-600 font-bold">
                رصيد المحفظة غير كافي
              </p>
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

      {/* Rating */}
      <div className="mb-8">
        <h3 className="text-sm font-black text-slate-700 mb-3 text-right">
          قيّم تجربتك
        </h3>
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              onClick={() => setRating(s)}
              className="transition-all active:scale-90"
            >
              <Star
                size={36}
                className={s <= rating ? 'text-amber-400' : 'text-slate-200'}
                fill={s <= rating ? 'currentColor' : 'none'}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Confirm Button */}
      <button
        onClick={handleConfirm}
        disabled={paymentMethod === 'wallet' && !canPayWallet}
        className={`w-full py-5 rounded-2xl font-black text-lg shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 text-white ${
          paymentMethod === 'wallet' && !canPayWallet
            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
            : paymentMethod === 'instapay'
            ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-100'
            : paymentMethod === 'cashwallet'
            ? 'bg-orange-600 hover:bg-orange-700 shadow-orange-100'
            : paymentMethod === 'wallet'
            ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'
            : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100'
        }`}
      >
        {paymentMethod === 'instapay' ? (
          <>
            <ExternalLink size={20} /> متابعة الدفع عبر إنستاباي
          </>
        ) : paymentMethod === 'cashwallet' ? (
          <>
            <ExternalLink size={20} /> متابعة تحويل محفظة كاش
          </>
        ) : paymentMethod === 'wallet' ? (
          <>
            <Wallet size={20} /> خصم من المحفظة ({totalPrice} ج.م)
          </>
        ) : (
          <>
            <CheckCircle size={20} /> تأكيد الدفع ({totalPrice} ج.م)
          </>
        )}
      </button>
    </motion.div>
  );
}