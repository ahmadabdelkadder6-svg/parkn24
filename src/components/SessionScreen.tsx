import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Car,
  DollarSign,
  ArrowRight,
} from 'lucide-react';
import { useStore } from '../store';
import {
  calculateFullHours,
  calculateCost,
  formatTime,
  getRemainingInCurrentHour,
} from '../utils/pricing';

export default function SessionScreen() {
  const {
    garages,
    sessions,
    setScreen,
    currentUser,
  } = useStore();

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

  const garage = garages.find(
    (g) =>
      g.id ===
      (activeSession?.garageId ?? lastCompletedSession?.garageId)
  );

  const [elapsed, setElapsed] = useState(0);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!activeSession) return;

    const startTime =
      typeof activeSession.startTime === 'number'
        ? activeSession.startTime
        : new Date(activeSession.startTime).getTime();

    setElapsed(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));

    const interval = setInterval(() => {
      setElapsed(
        Math.max(0, Math.floor((Date.now() - startTime) / 1000))
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession?.id, activeSession?.startTime]);

  useEffect(() => {
    if (activeSession) {
      redirectedRef.current = false;
      return;
    }

    if (!lastCompletedSession || redirectedRef.current) return;

    const endTime =
      typeof lastCompletedSession.endTime === 'number'
        ? lastCompletedSession.endTime
        : 0;

    const timeSinceEnd = Date.now() - endTime;

    if (endTime > 0 && timeSinceEnd < 60000) {
      redirectedRef.current = true;
      setScreen('summary');
    }
  }, [
    activeSession?.id,
    lastCompletedSession?.id,
    lastCompletedSession?.endTime,
    setScreen,
  ]);

  // شاشة لا توجد جلسة نشطة
  if (!activeSession) {
    return (
      <div className="h-full bg-white text-slate-900 flex flex-col items-center justify-center p-8">
        <div className="text-4xl mb-4 animate-bounce">⏳</div>
        <p className="text-slate-500 text-sm font-bold text-center mb-2">
          لا توجد جلسة ركن نشطة حالياً
        </p>
        <p className="text-slate-400 text-xs text-center mb-6">
          ابحث عن جراج وابدأ الركن
        </p>
        <button
          onClick={() => setScreen('list')}
          className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black text-sm active:scale-95 transition-all flex items-center gap-2"
        >
          <ArrowRight size={16} />
          العودة للقائمة
        </button>
      </div>
    );
  }

  const sessionRate = Number(
    activeSession.agreedPrice ?? garage?.basePrice ?? 0
  );
  const currentHours = calculateFullHours(elapsed);
  const currentCost = calculateCost(elapsed, sessionRate);
  const remainingInHour = getRemainingInCurrentHour(elapsed);

  const handleEnd = () => {
    setScreen('summary');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-white text-slate-900 flex flex-col items-center justify-center p-8"
    >
      {/* عداد الوقت الدائري */}
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
        <div className="text-3xl font-black font-mono text-slate-900">
          {formatTime(elapsed)}
        </div>
        <div className="text-[10px] text-slate-500 font-bold mt-1">
          مدة الركن
        </div>
      </motion.div>

      {/* بطاقة التكلفة */}
      <div className="w-full bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-2xl p-4 mb-4 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <div className="text-center">
            <div className="text-3xl font-black text-blue-600 font-mono">
              {currentHours}
            </div>
            <div className="text-[9px] text-slate-500 font-bold">
              ساعة محسوبة
            </div>
          </div>
          <div className="text-4xl font-black text-slate-400">=</div>
          <div className="text-center">
            <div className="text-3xl font-black text-emerald-600 font-mono">
              {currentCost}
            </div>
            <div className="text-[9px] text-slate-500 font-bold">
              ج.م إجمالي
            </div>
          </div>
        </div>

        {/* العد التنازلي للساعة التالية */}
        <div className="bg-white/80 rounded-xl p-3 text-center border border-slate-100">
          <div className="text-[10px] text-slate-500 mb-1">
            الوقت المتبقي حتى الساعة التالية
          </div>
          <div className="text-lg font-black text-amber-500 font-mono">
            {String(remainingInHour.minutes).padStart(2, '0')}:
            {String(remainingInHour.seconds).padStart(2, '0')}
          </div>
          <div className="text-[9px] text-slate-400 mt-1">
            بعدها ستُحسب ساعة إضافية ({currentHours + 1} × {sessionRate} ={' '}
            {(currentHours + 1) * sessionRate} ج.م)
          </div>
        </div>
      </div>

      {/* تنبيه سعر خاص */}
      {sessionRate !== garage?.basePrice && garage && (
        <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-2 mb-4 text-center">
          <p className="text-[10px] text-amber-600 font-bold">
            💰 سعر خاص: {sessionRate} ج.م/ساعة (بدل {garage.basePrice}{' '}
            ج.م)
          </p>
        </div>
      )}

      {/* معلومات السيارة والسعر */}
      <div className="w-full grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl text-center shadow-sm">
          <Car size={20} className="text-blue-600 mx-auto mb-2" />
          <div className="text-sm font-black text-slate-900">
            {currentUser?.carPlate}
          </div>
          <div className="text-[9px] text-slate-500 font-bold">
            رقم السيارة
          </div>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl text-center shadow-sm">
          <DollarSign size={20} className="text-purple-600 mx-auto mb-2" />
          <div className="text-sm font-black text-purple-600 font-mono">
            {sessionRate} ج.م
          </div>
          <div className="text-[9px] text-slate-500 font-bold">
            سعر الساعة
          </div>
        </div>
      </div>

      {/* اسم الجراج */}
      {garage && (
        <div className="bg-white border border-slate-200 p-4 rounded-2xl w-full text-center mb-6 shadow-sm">
          <div className="text-xs text-slate-500 font-bold mb-1">الجراج</div>
          <div className="text-lg font-black text-slate-900">{garage.name}</div>
        </div>
      )}

      {/* ملاحظة الدفع */}
      <div className="w-full bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-center">
        <p className="text-[10px] text-blue-600 font-bold">
          💡 سيتم تحديد طريقة الدفع عند إنهاء الجلسة
        </p>
      </div>

      {/* زر إنهاء الجلسة */}
      <button
        onClick={handleEnd}
        className="w-full bg-red-600 hover:bg-red-700 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-red-100 active:scale-95 transition-all mb-3"
      >
        إنهاء الجلسة ({currentCost} ج.م)
      </button>
    </motion.div>
  );
}