import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Car,
  DollarSign,
  Timer,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { useStore } from '../store';
import {
  calculateFullHours,
  calculateCost,
  formatTime,
  getRemainingInCurrentHour,
} from '../utils/pricing';
import toast from 'react-hot-toast';

const WAIT_TIME_MINUTES = 5;

export default function SessionScreen() {
  const {
    garages,
    selectedGarageId,
    sessions,
    setScreen,
    incomingCars,
    currentUser,
    addSession,
    removeIncomingCar,
    updateGarage,
    cancelOffer,
    offers,
    setSelectedGarageId,
  } = useStore();

  // ✅ البحث عن الجلسة النشطة
  const activeSession = sessions.find(
    (s) => s.carPlate === currentUser?.carPlate && s.status === 'active'
  );

  // ✅ السيارة الواصلة من الـ store
  const myArrivedCar = incomingCars.find(
    (c) => c.carPlate === currentUser?.carPlate && c.status === 'arrived'
  );

  // ✅ fallback من localStorage بعد refresh
  const fallbackArrivedCar = useMemo(() => {
    if (!currentUser?.carPlate) return null;
    try {
      const raw = localStorage.getItem(`arrival_${currentUser.carPlate}`);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, [currentUser?.carPlate]);

  // ✅ العربية الفعلية المستخدمة
  const effectiveArrivedCar = myArrivedCar || fallbackArrivedCar;

  // ✅ تحديد الجراج
  const garageId =
    activeSession?.garageId ||
    effectiveArrivedCar?.garageId ||
    selectedGarageId;

  const garage = garages.find((g) => g.id === garageId);

  // ✅ تحديث selectedGarageId تلقائياً
  useEffect(() => {
    const nextGarageId =
      activeSession?.garageId || effectiveArrivedCar?.garageId || null;

    if (nextGarageId && nextGarageId !== selectedGarageId) {
      setSelectedGarageId(nextGarageId);
    }
  }, [
    activeSession?.id,
    activeSession?.garageId,
    effectiveArrivedCar?.id,
    effectiveArrivedCar?.garageId,
    selectedGarageId,
    setSelectedGarageId,
  ]);

  const [waitingTimeLeft, setWaitingTimeLeft] = useState(WAIT_TIME_MINUTES * 60);
  const [sessionStarted, setSessionStarted] = useState(!!activeSession);
  const [elapsed, setElapsed] = useState(0);
  const [isLoading, setIsLoading] = useState(
    !activeSession && !effectiveArrivedCar
  );

  const startSessionCalledRef = useRef(false);

  // ✅ لو الجراج بدأ الجلسة
  useEffect(() => {
    if (activeSession) {
      setSessionStarted(true);
      setIsLoading(false);
    }
  }, [activeSession?.id]);

  // ✅ لو بيانات العربية وصلت
  useEffect(() => {
    if (effectiveArrivedCar) {
      setIsLoading(false);
    }
  }, [effectiveArrivedCar?.id, effectiveArrivedCar?.arrivedTime]);

  // ✅ أوقف التحميل بعد 3 ثواني
  useEffect(() => {
    const timeout = setTimeout(() => setIsLoading(false), 3000);
    return () => clearTimeout(timeout);
  }, []);

  // ✅ لما الجلسة تبدأ امسح الـ fallback
  useEffect(() => {
    if (activeSession && currentUser?.carPlate) {
      localStorage.removeItem(`arrival_${currentUser.carPlate}`);
    }
  }, [activeSession?.id, currentUser?.carPlate]);

  // ✅ عداد فترة الانتظار - يعتمد على arrivedTime الحقيقي
  useEffect(() => {
    if (!effectiveArrivedCar || sessionStarted || activeSession) return;

    const arrivedTime = effectiveArrivedCar.arrivedTime || Date.now();

    const calculateRemaining = () => {
      const elapsedSinceArrival = Math.floor(
        (Date.now() - arrivedTime) / 1000
      );
      return Math.max(0, WAIT_TIME_MINUTES * 60 - elapsedSinceArrival);
    };

    const remaining = calculateRemaining();
    setWaitingTimeLeft(remaining);

    if (remaining <= 0) {
      startSession();
      return;
    }

    const interval = setInterval(() => {
      const newRemaining = calculateRemaining();
      setWaitingTimeLeft(newRemaining);

      if (newRemaining <= 0) {
        clearInterval(interval);
        startSession();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [
    effectiveArrivedCar?.id,
    effectiveArrivedCar?.arrivedTime,
    sessionStarted,
    activeSession?.id,
  ]);

  // ✅ بدء الجلسة تلقائياً
  const startSession = () => {
    if (startSessionCalledRef.current) return;
    if (!currentUser || !garage) return;

    const existingActive = sessions.find(
      (s) => s.carPlate === currentUser.carPlate && s.status === 'active'
    );

    if (!existingActive) {
      startSessionCalledRef.current = true;

      const agreedPrice =
        effectiveArrivedCar?.agreedPrice ?? garage.basePrice;

      addSession({
        garageId: garage.id,
        carPlate: currentUser.carPlate,
        startTime: Date.now(),
        status: 'active',
        source: 'app',
        agreedPrice,
      });

      updateGarage(garage.id, {
        availableSpots: Math.max(0, garage.availableSpots - 1),
      });
    }

    // ✅ حذف العربية الواصلة
    if (effectiveArrivedCar?.id) {
      removeIncomingCar(effectiveArrivedCar.id);
    }

    // ✅ مسح الـ localStorage
    if (currentUser?.carPlate) {
      localStorage.removeItem(`arrival_${currentUser.carPlate}`);
    }

    const relatedOffer = offers.find(
      (o) =>
        o.userId === currentUser.phone &&
        (o.status === 'pending' || o.status === 'accepted')
    );
    if (relatedOffer) cancelOffer(relatedOffer.id);

    setSessionStarted(true);
    toast.success('بدأ حساب وقت الركن! ⏱️');
  };

  // ✅ عداد الجلسة النشطة
  useEffect(() => {
    const session =
      activeSession ||
      (sessionStarted
        ? sessions.find(
            (s) =>
              s.carPlate === currentUser?.carPlate && s.status === 'active'
          )
        : null);

    if (!session) return;

    const startTime =
      typeof session.startTime === 'number'
        ? session.startTime
        : new Date(session.startTime).getTime();

    setSessionStarted(true);
    setElapsed(Math.floor((Date.now() - startTime) / 1000));

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [
    activeSession?.id,
    sessionStarted,
    sessions.length,
    currentUser?.carPlate,
  ]);

  // ✅ شاشة التحميل
  if (!garage && !activeSession) {
    if (isLoading) {
      return (
        <div className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-8">
          <div className="text-4xl mb-4 animate-bounce">⏳</div>
          <p className="text-slate-400 text-sm font-bold text-center">
            جاري تحميل بيانات الجلسة...
          </p>
        </div>
      );
    }

    return (
      <div className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-8">
        <div className="text-4xl mb-4">🔍</div>
        <p className="text-slate-400 text-sm font-bold text-center mb-6">
          لا توجد جلسة نشطة حالياً
        </p>
        <button
          onClick={() => setScreen('list')}
          className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black text-sm active:scale-95 transition-all"
        >
          العودة للقائمة
        </button>
      </div>
    );
  }

  // ✅ السعر المستخدم
  const sessionRate = Number(
    activeSession?.agreedPrice ??
      effectiveArrivedCar?.agreedPrice ??
      garage?.basePrice ??
      0
  );

  const currentHours = calculateFullHours(elapsed);
  const currentCost = calculateCost(elapsed, sessionRate);
  const remainingInHour = getRemainingInCurrentHour(elapsed);

  const handleEnd = () => {
    setScreen('summary');
  };

  // ✅ شاشة الانتظار
  if (!sessionStarted && effectiveArrivedCar && garage) {
    const waitMins = Math.floor(waitingTimeLeft / 60);
    const waitSecs = waitingTimeLeft % 60;

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-8"
      >
        <motion.div className="relative mb-8">
          <svg className="w-48 h-48 transform -rotate-90">
            <circle
              cx="96"
              cy="96"
              r="88"
              fill="none"
              stroke="#1e293b"
              strokeWidth="8"
            />
            <motion.circle
              cx="96"
              cy="96"
              r="88"
              fill="none"
              stroke="url(#gradient)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={553}
              strokeDashoffset={
                553 * (1 - waitingTimeLeft / (WAIT_TIME_MINUTES * 60))
              }
              transition={{ duration: 0.5 }}
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Timer size={32} className="text-cyan-400 mb-2" />
            <div className="text-4xl font-black font-mono text-white">
              {String(waitMins).padStart(2, '0')}:
              {String(waitSecs).padStart(2, '0')}
            </div>
            <div className="text-[10px] text-slate-500 font-bold mt-1">
              حتى بدء الحساب
            </div>
          </div>
        </motion.div>

        <h2 className="text-2xl font-black mb-2 text-center text-cyan-400">
          أهلاً بك في الجراج! 👋
        </h2>
        <p className="text-slate-400 text-sm text-center mb-6">
          سيبدأ حساب وقت الركن تلقائياً بعد {WAIT_TIME_MINUTES} دقائق
        </p>

        <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-6">
          <div className="flex justify-between items-center mb-3">
            <span className="text-lg font-black text-white">{garage.name}</span>
            <span className="text-xs text-slate-500">الجراج</span>
          </div>

          <div className="flex justify-between items-center mb-3">
            <span className="text-lg font-black text-blue-400 font-mono">
              {currentUser?.carPlate}
            </span>
            <span className="text-xs text-slate-500">رقم السيارة</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-lg font-black text-emerald-400 font-mono">
              {effectiveArrivedCar.agreedPrice} ج.م/ساعة
            </span>
            <span className="text-xs text-slate-500">السعر المتفق</span>
          </div>

          {effectiveArrivedCar.agreedPrice !== garage.basePrice && (
            <div className="mt-2 bg-amber-600/10 border border-amber-500/20 rounded-xl p-2 text-center">
              <p className="text-[10px] text-amber-400 font-bold">
                💰 سعر خاص متفق عليه (السعر الأساسي: {garage.basePrice} ج.م)
              </p>
            </div>
          )}
        </div>

        <div className="bg-amber-600/20 border border-amber-500/30 rounded-2xl p-4 text-center w-full mb-4">
          <AlertCircle size={20} className="text-amber-400 mx-auto mb-2" />
          <p className="text-xs text-amber-300 font-bold">
            💡 من أول دقيقة تُحسب ساعة كاملة
          </p>
          <p className="text-[10px] text-amber-400/70 mt-1">
            كل ساعة جديدة تُحسب ساعة إضافية كاملة
          </p>
        </div>

        <div className="bg-emerald-600/20 border border-emerald-500/30 rounded-2xl p-4 text-center w-full mb-4">
          <CheckCircle size={24} className="text-emerald-400 mx-auto mb-2" />
          <p className="text-xs text-emerald-300 font-bold">
            فترة السماح مجانية - استرح قبل بدء الحساب
          </p>
        </div>
      </motion.div>
    );
  }

  // ✅ شاشة الجلسة النشطة
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-8"
    >
      <motion.div
        animate={{
          boxShadow: [
            '0 0 0px rgba(59,130,246,0.3)',
            '0 0 60px rgba(59,130,246,0.3)',
            '0 0 0px rgba(59,130,246,0.3)',
          ],
        }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="w-48 h-48 bg-slate-900 rounded-full flex flex-col items-center justify-center border-4 border-blue-600/40 mb-6"
      >
        <Clock size={28} className="text-blue-400 mb-1" />
        <div className="text-3xl font-black font-mono text-white">
          {formatTime(elapsed)}
        </div>
        <div className="text-[10px] text-slate-500 font-bold mt-1">
          مدة الركن
        </div>
      </motion.div>

      <div className="w-full bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-2xl p-4 mb-4">
        <div className="flex justify-between items-center mb-3">
          <div className="text-center">
            <div className="text-3xl font-black text-blue-400 font-mono">
              {currentHours}
            </div>
            <div className="text-[9px] text-slate-400 font-bold">
              ساعة محسوبة
            </div>
          </div>
          <div className="text-4xl font-black text-white">=</div>
          <div className="text-center">
            <div className="text-3xl font-black text-emerald-400 font-mono">
              {currentCost}
            </div>
            <div className="text-[9px] text-slate-400 font-bold">
              ج.م إجمالي
            </div>
          </div>
        </div>

        <div className="bg-slate-950/50 rounded-xl p-3 text-center">
          <div className="text-[10px] text-slate-500 mb-1">
            الوقت المتبقي حتى الساعة التالية
          </div>
          <div className="text-lg font-black text-amber-400 font-mono">
            {String(remainingInHour.minutes).padStart(2, '0')}:
            {String(remainingInHour.seconds).padStart(2, '0')}
          </div>
          <div className="text-[9px] text-slate-600 mt-1">
            بعدها ستُحسب ساعة إضافية ({currentHours + 1} × {sessionRate} ={' '}
            {(currentHours + 1) * sessionRate} ج.م)
          </div>
        </div>
      </div>

      {sessionRate !== garage?.basePrice && garage && (
        <div className="w-full bg-amber-600/10 border border-amber-500/20 rounded-xl p-2 mb-4 text-center">
          <p className="text-[10px] text-amber-400 font-bold">
            💰 سعر خاص: {sessionRate} ج.م/ساعة (بدل {garage.basePrice} ج.م)
          </p>
        </div>
      )}

      <div className="w-full grid grid-cols-2 gap-3 mb-6">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center">
          <Car size={20} className="text-blue-400 mx-auto mb-2" />
          <div className="text-sm font-black text-white">
            {currentUser?.carPlate}
          </div>
          <div className="text-[9px] text-slate-500 font-bold">
            رقم السيارة
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center">
          <DollarSign size={20} className="text-purple-400 mx-auto mb-2" />
          <div className="text-sm font-black text-purple-400 font-mono">
            {sessionRate} ج.م
          </div>
          <div className="text-[9px] text-slate-500 font-bold">
            سعر الساعة
          </div>
        </div>
      </div>

      {garage && (
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl w-full text-center mb-6">
          <div className="text-xs text-slate-500 font-bold mb-1">الجراج</div>
          <div className="text-lg font-black text-white">{garage.name}</div>
        </div>
      )}

      <button
        onClick={handleEnd}
        className="w-full bg-red-600 hover:bg-red-700 text-white py-5 rounded-2xl font-black text-lg shadow-xl active:scale-95 transition-all mb-3"
      >
        إنهاء الجلسة ({currentCost} ج.م)
      </button>
    </motion.div>
  );
}