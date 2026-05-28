import { motion } from 'framer-motion';
import {
  Clock,
  Car,
  DollarSign,
  MapPin,
  CreditCard,
  Calendar,
  Timer,
  Receipt,
} from 'lucide-react';
import { useStore } from '../store';
import { calculateFullHours, calculateCost, formatTime } from '../utils/pricing';

export default function LastSessionCard() {
  const { sessions, garages, currentUser } = useStore();

  // ─── آخر جلسة مكتملة للمستخدم ──────────────────────────────────────────
  const lastSession = sessions
    .filter(
      (s) => s.carPlate === currentUser?.carPlate && s.status === 'completed'
    )
    .sort((a, b) => {
      const endA =
        typeof a.endTime === 'number'
          ? a.endTime
          : new Date(a.endTime || 0).getTime();
      const endB =
        typeof b.endTime === 'number'
          ? b.endTime
          : new Date(b.endTime || 0).getTime();
      return endB - endA;
    })[0];

  if (!lastSession) return null;

  const garage = garages.find((g) => g.id === lastSession.garageId);

  // ─── حسابات الجلسة ───────────────────────────────────────────────────────
  const startTime =
    typeof lastSession.startTime === 'number'
      ? lastSession.startTime
      : new Date(lastSession.startTime).getTime();

  const endTime =
    typeof lastSession.endTime === 'number'
      ? lastSession.endTime
      : new Date(lastSession.endTime || 0).getTime();

  const elapsedSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
  const rate = Number(lastSession.agreedPrice ?? garage?.basePrice ?? 0);
  const hours = calculateFullHours(elapsedSeconds);
  const totalMinutes = Math.floor(elapsedSeconds / 60);
  const cost =
    lastSession.totalPrice != null && Number(lastSession.totalPrice) > 0
      ? Number(lastSession.totalPrice)
      : calculateCost(elapsedSeconds, rate);

  // ─── تنسيق الوقت ─────────────────────────────────────────────────────────
  const startDate = new Date(startTime);
  const endDate = new Date(endTime);

  const formatDateTime = (date: Date) => {
    return date.toLocaleDateString('ar-EG', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTimeOnly = (date: Date) => {
    return date.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // ─── طريقة الدفع ─────────────────────────────────────────────────────────
  const getPaymentInfo = (method?: string) => {
    switch (method) {
      case 'cash':
        return { label: 'نقدي', icon: '💵', color: 'text-emerald-400', bg: 'bg-emerald-500/20' };
      case 'instapay':
        return { label: 'إنستاباي', icon: '📱', color: 'text-purple-400', bg: 'bg-purple-500/20' };
      case 'wallet':
        return { label: 'خصم من المحفظة', icon: '👝', color: 'text-blue-400', bg: 'bg-blue-500/20' };
      case 'cashwallet':
        return { label: 'تحويل محفظة كاش', icon: '📲', color: 'text-orange-400', bg: 'bg-orange-500/20' };
      default:
        return { label: 'غير محدد', icon: '💳', color: 'text-slate-400', bg: 'bg-slate-500/20' };
    }
  };

  const paymentInfo = getPaymentInfo(lastSession.paymentMethod);

  // ─── مصدر الجلسة ─────────────────────────────────────────────────────────
  const sourceInfo =
    lastSession.source === 'app'
      ? { label: 'تطبيق', color: 'text-blue-400', bg: 'bg-blue-500/20' }
      : { label: 'يدوي', color: 'text-amber-400', bg: 'bg-amber-500/20' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="w-full mb-6"
    >
      {/* العنوان */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] text-slate-600">
          {formatDateTime(endDate)}
        </span>
        <h3 className="text-sm font-black text-slate-300 flex items-center gap-2">
          آخر جلسة ركن
          <Receipt size={14} className="text-blue-400" />
        </h3>
      </div>

      {/* البطاقة الرئيسية */}
      <div className="bg-gradient-to-bl from-blue-950/40 to-slate-900 border border-blue-500/20 rounded-2xl p-5 shadow-lg shadow-blue-900/10">
        {/* الجراج ورقم السيارة */}
        <div className="flex justify-between items-start mb-4">
          <span
            className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${sourceInfo.bg} ${sourceInfo.color}`}
          >
            {sourceInfo.label}
          </span>
          <div className="text-right">
            <div className="text-base font-black text-white flex items-center gap-1.5 justify-end">
              🚗 {lastSession.carPlate}
            </div>
            {garage && (
              <div className="flex items-center gap-1 justify-end mt-1">
                <span className="text-[10px] text-slate-500">{garage.name}</span>
                <MapPin size={9} className="text-slate-600" />
              </div>
            )}
          </div>
        </div>

        {/* التكلفة الكبيرة */}
        <div className="bg-slate-950/60 rounded-2xl p-4 mb-4 text-center">
          <div className="text-[10px] text-slate-500 mb-1">إجمالي المستحق</div>
          <div className="text-4xl font-black text-emerald-400 font-mono">
            {cost.toFixed(0)}
            <span className="text-lg text-emerald-500 mr-1">ج.م</span>
          </div>
        </div>

        {/* تفاصيل الوقت */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-slate-950/40 rounded-xl p-3 text-center">
            <Clock size={14} className="text-blue-400 mx-auto mb-1" />
            <div className="text-sm font-black text-white font-mono">
              {formatTime(elapsedSeconds)}
            </div>
            <div className="text-[8px] text-slate-500 font-bold">المدة الفعلية</div>
          </div>
          <div className="bg-slate-950/40 rounded-xl p-3 text-center">
            <Timer size={14} className="text-purple-400 mx-auto mb-1" />
            <div className="text-sm font-black text-purple-400 font-mono">
              {hours}
            </div>
            <div className="text-[8px] text-slate-500 font-bold">ساعة محسوبة</div>
          </div>
          <div className="bg-slate-950/40 rounded-xl p-3 text-center">
            <DollarSign size={14} className="text-amber-400 mx-auto mb-1" />
            <div className="text-sm font-black text-amber-400 font-mono">
              {rate}
            </div>
            <div className="text-[8px] text-slate-500 font-bold">ج.م/ساعة</div>
          </div>
        </div>

        {/* وقت الدخول والخروج */}
        <div className="bg-slate-950/40 rounded-xl p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-emerald-400 font-mono">
              {formatTimeOnly(startDate)}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500 font-bold">وقت الدخول</span>
              <Calendar size={10} className="text-slate-600" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-red-400 font-mono">
              {formatTimeOnly(endDate)}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500 font-bold">وقت الخروج</span>
              <Calendar size={10} className="text-slate-600" />
            </div>
          </div>
        </div>

        {/* طريقة الدفع */}
        <div className={`${paymentInfo.bg} rounded-xl p-3 flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <CreditCard size={14} className={paymentInfo.color} />
            <span className={`text-xs font-black ${paymentInfo.color}`}>
              {paymentInfo.label}
            </span>
          </div>
          <div className="text-xl">{paymentInfo.icon}</div>
        </div>

        {/* سعر خاص */}
        {garage && rate !== garage.basePrice && (
          <div className="mt-3 bg-amber-600/10 border border-amber-500/20 rounded-xl p-2 text-center">
            <p className="text-[9px] text-amber-400 font-bold">
              💰 سعر خاص: {rate} ج.م/ساعة (بدل {garage.basePrice} ج.م)
            </p>
          </div>
        )}

        {/* تاريخ الجلسة */}
        <div className="mt-3 text-center">
          <span className="text-[9px] text-slate-600 font-mono">
            {formatDateTime(startDate)} • {totalMinutes} دقيقة إجمالي
          </span>
        </div>
      </div>
    </motion.div>
  );
}