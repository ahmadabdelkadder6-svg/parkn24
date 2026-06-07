import { motion } from 'framer-motion';
import {
  Clock,
  DollarSign,
  MapPin,
  CreditCard,
  Calendar,
  Timer,
  Receipt,
  ArrowRight,
  Copy,
} from 'lucide-react';
import { useStore } from '../store';
import { calculateFullHours, calculateCost, formatTime } from '../utils/pricing';
import toast from 'react-hot-toast';

export default function LastSessionScreen() {
  const { sessions, garages, currentUser, setScreen } = useStore();

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

  const garage = lastSession
    ? garages.find((g) => g.id === lastSession.garageId)
    : null;

  if (!lastSession) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-8"
      >
        <div className="text-5xl mb-4">📭</div>
        <p className="text-lg font-black text-white mb-2">لا توجد جلسات سابقة</p>
        <p className="text-xs text-slate-500 text-center mb-6">
          ابدأ ركن سيارتك وستظهر تفاصيل الجلسة هنا
        </p>
        <button
          onClick={() => setScreen('list')}
          className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black text-sm active:scale-95 transition-all flex items-center gap-2"
        >
          <ArrowRight size={16} />
          العودة للقائمة
        </button>
      </motion.div>
    );
  }

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

  const startDate = new Date(startTime);
  const endDate = new Date(endTime);

  const formatDateTime = (date: Date) =>
    date.toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  const formatTimeOnly = (date: Date) =>
    date.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  const getPaymentInfo = (method?: string) => {
    switch (method) {
      case 'cash':
        return { label: 'نقدي', icon: '💵', color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/30' };
      case 'instapay':
        return { label: 'إنستاباي', icon: '📱', color: 'text-purple-400', bg: 'bg-purple-500/20', border: 'border-purple-500/30' };
      case 'wallet':
        return { label: 'خصم من المحفظة', icon: '👝', color: 'text-blue-400', bg: 'bg-blue-500/20', border: 'border-blue-500/30' };
      case 'cashwallet':
        return { label: 'تحويل محفظة كاش', icon: '📲', color: 'text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/30' };
      default:
        return { label: 'غير محدد', icon: '💳', color: 'text-slate-400', bg: 'bg-slate-500/20', border: 'border-slate-500/30' };
    }
  };

  const paymentInfo = getPaymentInfo(lastSession.paymentMethod);

  const sourceInfo =
    lastSession.source === 'app'
      ? { label: 'عبر التطبيق', color: 'text-blue-400', bg: 'bg-blue-500/20' }
      : { label: 'إضافة يدوية', color: 'text-amber-400', bg: 'bg-amber-500/20' };

  const copySessionDetails = async () => {
    const details = `🧾 تفاصيل جلسة الركن
━━━━━━━━━━━━━━━━━━
🚗 رقم السيارة: ${lastSession.carPlate}
🅿️ الجراج: ${garage?.name || 'غير محدد'}
📍 الموقع: ${garage?.location || 'غير محدد'}
━━━━━━━━━━━━━━━━━━
📅 التاريخ: ${formatDateTime(startDate)}
⏰ وقت الدخول: ${formatTimeOnly(startDate)}
⏰ وقت الخروج: ${formatTimeOnly(endDate)}
⏱️ المدة: ${totalMinutes} دقيقة (${hours} ساعة محسوبة)
━━━━━━━━━━━━━━━━━━
💰 سعر الساعة: ${rate} ج.م
💵 الإجمالي: ${cost} ج.م
💳 طريقة الدفع: ${paymentInfo.label}
📋 نوع الجلسة: ${sourceInfo.label}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(details);
      } else {
        const el = document.createElement('textarea');
        el.value = details;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      toast.success('تم نسخ تفاصيل الجلسة 📋');
    } catch {
      toast.error('فشل النسخ');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-slate-950 text-white flex flex-col safe-top safe-bottom"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-12 pb-3 shrink-0">
        <button
          onClick={() => setScreen('list')}
          className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 active:scale-90 transition-all"
        >
          <ArrowRight size={18} />
        </button>
        <h2 className="text-sm font-black flex items-center gap-2">
          <Receipt size={16} className="text-blue-400" />
          تفاصيل آخر جلسة
        </h2>
        <button
          onClick={copySessionDetails}
          className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 active:scale-90 transition-all"
        >
          <Copy size={18} className="text-blue-400" />
        </button>
      </div>

      {/* المحتوى */}
      <div className="flex-1 px-4 pb-4 overflow-y-auto space-y-4">
        {/* التاريخ */}
        <div className="text-center">
          <span className="text-[10px] text-slate-500 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
            📅 {formatDateTime(startDate)}
          </span>
        </div>

        {/* رقم السيارة والجراج */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex justify-between items-center mb-3">
            <span
              className={`text-[9px] px-2.5 py-1 rounded-full font-bold ${sourceInfo.bg} ${sourceInfo.color}`}
            >
              {sourceInfo.label}
            </span>
            <div className="text-lg font-black text-white">
              🚗 {lastSession.carPlate}
            </div>
          </div>
          {garage && (
            <div className="bg-slate-950 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-slate-500">
                <MapPin size={12} />
                <span className="text-[10px]">{garage.location}</span>
              </div>
              <span className="text-sm font-black text-white">{garage.name}</span>
            </div>
          )}
        </div>

        {/* التكلفة الإجمالية */}
        <motion.div
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          className="bg-gradient-to-bl from-emerald-950/50 to-slate-900 border border-emerald-500/30 rounded-2xl p-6 text-center"
        >
          <div className="text-[10px] text-slate-500 mb-2">إجمالي المستحق</div>
          <div className="text-5xl font-black text-emerald-400 font-mono mb-1">
            {cost.toFixed(0)}
          </div>
          <div className="text-sm text-emerald-500 font-bold">جنيه مصري</div>
          <div className="text-[9px] text-slate-600 mt-2">
            {hours} ساعة × {rate} ج.م = {cost.toFixed(0)} ج.م
          </div>
        </motion.div>

        {/* تفاصيل الوقت */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
            <Clock size={16} className="text-blue-400 mx-auto mb-1.5" />
            <div className="text-sm font-black text-white font-mono">
              {formatTime(elapsedSeconds)}
            </div>
            <div className="text-[8px] text-slate-500 font-bold mt-0.5">
              المدة الفعلية
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
            <Timer size={16} className="text-purple-400 mx-auto mb-1.5" />
            <div className="text-sm font-black text-purple-400 font-mono">
              {hours}
            </div>
            <div className="text-[8px] text-slate-500 font-bold mt-0.5">
              ساعة محسوبة
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
            <DollarSign size={16} className="text-amber-400 mx-auto mb-1.5" />
            <div className="text-sm font-black text-amber-400 font-mono">
              {rate}
            </div>
            <div className="text-[8px] text-slate-500 font-bold mt-0.5">
              ج.م/ساعة
            </div>
          </div>
        </div>

        {/* وقت الدخول والخروج */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-sm font-black text-emerald-400 font-mono">
                {formatTimeOnly(startDate)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 font-bold">وقت الدخول</span>
              <Calendar size={12} className="text-slate-600" />
            </div>
          </div>

          <div className="border-r-2 border-dashed border-slate-800 mr-[3px] h-4" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-sm font-black text-red-400 font-mono">
                {formatTimeOnly(endDate)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 font-bold">وقت الخروج</span>
              <Calendar size={12} className="text-slate-600" />
            </div>
          </div>

          <div className="bg-slate-950 rounded-xl p-2 text-center mt-2">
            <span className="text-[10px] text-slate-500">
              إجمالي المدة:{' '}
              <span className="text-white font-black font-mono">
                {totalMinutes} دقيقة
              </span>
            </span>
          </div>
        </div>

        {/* طريقة الدفع */}
        <div className={`${paymentInfo.bg} border ${paymentInfo.border} rounded-2xl p-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{paymentInfo.icon}</span>
              <span className={`text-sm font-black ${paymentInfo.color}`}>
                {cost.toFixed(0)} ج.م
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-black ${paymentInfo.color}`}>
                {paymentInfo.label}
              </span>
              <CreditCard size={16} className={paymentInfo.color} />
            </div>
          </div>
        </div>

        {/* سعر خاص */}
        {garage && rate !== garage.basePrice && (
          <div className="bg-amber-600/10 border border-amber-500/20 rounded-xl p-3 text-center">
            <p className="text-[10px] text-amber-400 font-bold">
              💰 تم تطبيق سعر خاص: {rate} ج.م/ساعة بدلاً من {garage.basePrice} ج.م/ساعة
            </p>
          </div>
        )}

        {/* رقم الجلسة */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 text-center">
          <span className="text-[9px] text-slate-600 font-mono">
            رقم الجلسة: {lastSession.id.slice(0, 8)}...
          </span>
        </div>

        {/* زر نسخ */}
        <button
          onClick={copySessionDetails}
          className="w-full bg-blue-600/20 border border-blue-500/20 text-blue-400 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <Copy size={16} />
          نسخ تفاصيل الجلسة
        </button>

        {/* زر العودة */}
        <button
          onClick={() => setScreen('list')}
          className="w-full bg-slate-900 border border-slate-800 text-white py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <ArrowRight size={16} />
          العودة للقائمة
        </button>
      </div>
    </motion.div>
  );
}