import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Car,
  DollarSign,
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

  // ✅ البحث عن الجلسة النشطة للمستخدم الحالي
  const activeSession = sessions.find(
    (s) => s.carPlate === currentUser?.carPlate && s.status === 'active'
  );

  const garage = garages.find((g) => g.id === activeSession?.garageId);

  // ✅ عداد الجلسة النشطة
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!activeSession) return;

    const startTime =
      typeof activeSession.startTime === 'number'
        ? activeSession.startTime
        : new Date(activeSession.startTime).getTime();

    setElapsed(Math.floor((Date.now() - startTime) / 1000));

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession?.id]);

  // ✅ شاشة التحميل أو لا توجد جلسة
  if (!activeSession) {
    return (
      <div className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-8">
        <div className="text-4xl mb-4 animate-bounce">⏳</div>
        <p className="text-slate-400 text-sm font-bold text-center mb-6">
          جاري تحميل بيانات الجلسة...
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
  const sessionRate = Number(activeSession?.agreedPrice ?? garage?.basePrice ?? 0);

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