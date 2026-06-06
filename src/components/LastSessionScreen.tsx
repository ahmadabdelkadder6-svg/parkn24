import { useMemo, useCallback } from 'react';
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
import { shallow } from 'zustand/shallow';
import { calculateFullHours, calculateCost, formatTime } from '../utils/pricing';
import toast from 'react-hot-toast';

// ✅ ثابت خارج الكومبوننت - مش بيتعمل من جديد في كل render
const getPaymentInfo = (method?: string) => {
  switch (method) {
    case 'cash':
      return {
        label: 'نقدي',
        icon: '💵',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/20',
        border: 'border-emerald-500/30',
      };
    case 'instapay':
      return {
        label: 'إنستاباي',
        icon: '📱',
        color: 'text-purple-400',
        bg: 'bg-purple-500/20',
        border: 'border-purple-500/30',
      };
    case 'wallet':
      return {
        label: 'خصم من المحفظة',
        icon: '👝',
        color: 'text-blue-400',
        bg: 'bg-blue-500/20',
        border: 'border-blue-500/30',
      };
    case 'cashwallet':
      return {
        label: 'تحويل محفظة كاش',
        icon: '📲',
        color: 'text-orange-400',
        bg: 'bg-orange-500/20',
        border: 'border-orange-500/30',
      };
    default:
      return {
        label: 'غير محدد',
        icon: '💳',
        color: 'text-slate-400',
        bg: 'bg-slate-500/20',
        border: 'border-slate-500/30',
      };
  }
};

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

export default function LastSessionScreen() {
  const { sessions, garages, currentUser, setScreen } = useStore(
    (s) => ({
      sessions: s.sessions,
      garages: s.garages,
      currentUser: s.currentUser,
      setScreen: s.setScreen,
    }),
    shallow
  );

  // ✅ useMemo لكل الحسابات
  const lastSession = useMemo(() => {
    if (!currentUser?.carPlate) return null;
    return (
      sessions
        .filter(
          (s) =>
            s.carPlate === currentUser.carPlate &&
            s.status === 'completed'
        )
        .sort((a, b) => {
          const endA = typeof a.endTime === 'number' ? a.endTime : 0;
          const endB = typeof b.endTime === 'number' ? b.endTime : 0;
          return endB - endA;
        })[0] ?? null
    );
  }, [sessions, currentUser?.carPlate]);

  const garage = useMemo(
    () =>
      lastSession
        ? (garages.find((g) => g.id === lastSession.garageId) ?? null)
        : null,
    [garages, lastSession?.garageId]
  );

  const sessionData = useMemo(() => {
    if (!lastSession) return null;

    const startTime =
      typeof lastSession.startTime === 'number'
        ? lastSession.startTime
        : new Date(lastSession.startTime).getTime();

    const endTime =
      typeof lastSession.endTime === 'number'
        ? lastSession.endTime
        : new Date(lastSession.endTime ?? 0).getTime();

    const elapsedSeconds = Math.max(
      0,
      Math.floor((endTime - startTime) / 1000)
    );
    const rate = Number(lastSession.agreedPrice ?? garage?.basePrice ?? 0);
    const hours = calculateFullHours(elapsedSeconds);
    const totalMinutes = Math.floor(elapsedSeconds / 60);
    const cost =
      lastSession.totalPrice != null && Number(lastSession.totalPrice) > 0
        ? Number(lastSession.totalPrice)
        : calculateCost(elapsedSeconds, rate);

    return {
      startTime,
      endTime,
      elapsedSeconds,
      rate,
      hours,
      totalMinutes,
      cost,
      startDate: new Date(startTime),
      endDate: new Date(endTime),
    };
  }, [lastSession, garage?.basePrice]);

  const paymentInfo = useMemo(
    () => getPaymentInfo(lastSession?.paymentMethod),
    [lastSession?.paymentMethod]
  );

  const sourceInfo = useMemo(
    () =>
      lastSession?.source === 'app'
        ? { label: 'عبر التطبيق', color: 'text-blue-400', bg: 'bg-blue-500/20' }
        : { label: 'إضافة يدوية', color: 'text-amber-400', bg: 'bg-amber-500/20' },
    [lastSession?.source]
  );

  const copySessionDetails = useCallback(async () => {
    if (!lastSession || !sessionData) return;

    const details = `🧾 تفاصيل جلسة الركن
━━━━━━━━━━━━━━━━━━
🚗 رقم السيارة: ${lastSession.carPlate}
🅿️ الجراج: ${garage?.name ?? 'غير محدد'}
📍 الموقع: ${garage?.location ?? 'غير محدد'}
━━━━━━━━━━━━━━━━━━
📅 التاريخ: ${formatDateTime(sessionData.startDate)}
⏰ وقت الدخول: ${formatTimeOnly(sessionData.startDate)}
⏰ وقت الخروج: ${formatTimeOnly(sessionData.endDate)}
⏱️ المدة: ${sessionData.totalMinutes} دقيقة (${sessionData.hours} ساعة محسوبة)
━━━━━━━━━━━━━━━━━━
💰 سعر الساعة: ${sessionData.rate} ج.م
💵 الإجمالي: ${sessionData.cost} ج.م
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
  }, [lastSession, garage, sessionData, paymentInfo.label, sourceInfo.label]);

  // ✅ شاشة لا توجد جلسات
  if (!lastSession || !sessionData) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-8"
      >
        <div className="text-5xl mb-4" aria-hidden="true">📭</div>
        <p className="text-lg font-black text-white mb-2">
          لا توجد جلسات سابقة
        </p>
        <p className="text-xs text-slate-400 text-center mb-6">
          ابدأ ركن سيارتك وستظهر تفاصيل الجلسة هنا
        </p>
        <button
          type="button"
          onClick={() => setScreen('list')}
          aria-label="العودة لقائمة الجراجات"
          className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black text-sm active:scale-95 transition-all flex items-center gap-2"
        >
          <ArrowRight size={16} aria-hidden="true" />
          العودة للقائمة
        </button>
      </motion.div>
    );
  }

  const { startDate, endDate, elapsedSeconds, rate, hours, totalMinutes, cost } =
    sessionData;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-slate-950 text-white flex flex-col safe-top safe-bottom"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-12 pb-3 shrink-0">
        <button
          type="button"
          onClick={() => setScreen('list')}
          aria-label="العودة للقائمة"
          className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 active:scale-90 transition-all"
        >
          <ArrowRight size={18} aria-hidden="true" />
        </button>

        <h2 className="text-sm font-black flex items-center gap-2">
          <Receipt size={16} className="text-blue-400" aria-hidden="true" />
          تفاصيل آخر جلسة
        </h2>

        <button
          type="button"
          onClick={copySessionDetails}
          aria-label="نسخ تفاصيل الجلسة"
          className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 active:scale-90 transition-all"
        >
          <Copy size={18} className="text-blue-400" aria-hidden="true" />
        </button>
      </div>

      {/* المحتوى */}
      <div className="flex-1 px-4 pb-4 overflow-y-auto space-y-4">
        {/* التاريخ */}
        <div className="text-center">
          <time
            dateTime={startDate.toISOString()}
            className="text-xs text-slate-500 bg-slate-900 px-3 py-1 rounded-full border border-slate-800"
          >
            📅 {formatDateTime(startDate)}
          </time>
        </div>

        {/* رقم السيارة والجراج */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex justify-between items-center mb-3">
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-bold ${sourceInfo.bg} ${sourceInfo.color}`}
            >
              {sourceInfo.label}
            </span>
            <div
              className="text-lg font-black text-white"
              aria-label={`رقم السيارة ${lastSession.carPlate}`}
            >
              🚗 {lastSession.carPlate}
            </div>
          </div>

          {garage && (
            <div className="bg-slate-950 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-slate-400">
                <MapPin size={12} aria-hidden="true" />
                <span className="text-xs">{garage.location}</span>
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
          role="region"
          aria-label={`إجمالي المستحق ${cost.toFixed(0)} جنيه`}
        >
          <div className="text-xs text-slate-500 mb-2">إجمالي المستحق</div>
          <div className="text-5xl font-black text-emerald-400 font-mono mb-1">
            {cost.toFixed(0)}
          </div>
          <div className="text-sm text-emerald-500 font-bold">جنيه مصري</div>
          <div className="text-xs text-slate-600 mt-2">
            {hours} ساعة × {rate} ج.م = {cost.toFixed(0)} ج.م
          </div>
        </motion.div>

        {/* تفاصيل الوقت */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
            <Clock size={16} className="text-blue-400 mx-auto mb-1.5" aria-hidden="true" />
            <div className="text-sm font-black text-white font-mono">
              {formatTime(elapsedSeconds)}
            </div>
            <div className="text-xs text-slate-500 font-bold mt-0.5">
              المدة الفعلية
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
            <Timer size={16} className="text-purple-400 mx-auto mb-1.5" aria-hidden="true" />
            <div className="text-sm font-black text-purple-400 font-mono">
              {hours}
            </div>
            <div className="text-xs text-slate-500 font-bold mt-0.5">
              ساعة محسوبة
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
            <DollarSign size={16} className="text-amber-400 mx-auto mb-1.5" aria-hidden="true" />
            <div className="text-sm font-black text-amber-400 font-mono">
              {rate}
            </div>
            <div className="text-xs text-slate-500 font-bold mt-0.5">
              ج.م/ساعة
            </div>
          </div>
        </div>

        {/* وقت الدخول والخروج */}
        <div
          className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3"
          role="region"
          aria-label="أوقات الدخول والخروج"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
              <time
                dateTime={startDate.toISOString()}
                className="text-sm font-black text-emerald-400 font-mono"
              >
                {formatTimeOnly(startDate)}
              </time>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-bold">وقت الدخول</span>
              <Calendar size={12} className="text-slate-600" aria-hidden="true" />
            </div>
          </div>

          <div className="border-r-2 border-dashed border-slate-800 mr-[3px] h-4" aria-hidden="true" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500" aria-hidden="true" />
              <time
                dateTime={endDate.toISOString()}
                className="text-sm font-black text-red-400 font-mono"
              >
                {formatTimeOnly(endDate)}
              </time>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-bold">وقت الخروج</span>
              <Calendar size={12} className="text-slate-600" aria-hidden="true" />
            </div>
          </div>

          <div className="bg-slate-950 rounded-xl p-2 text-center mt-2">
            <span className="text-xs text-slate-500">
              إجمالي المدة:{' '}
              <span className="text-white font-black font-mono">
                {totalMinutes} دقيقة
              </span>
            </span>
          </div>
        </div>

        {/* طريقة الدفع */}
        <div
          className={`${paymentInfo.bg} border ${paymentInfo.border} rounded-2xl p-4`}
          role="region"
          aria-label={`طريقة الدفع: ${paymentInfo.label}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">
                {paymentInfo.icon}
              </span>
              <span className={`text-sm font-black ${paymentInfo.color}`}>
                {cost.toFixed(0)} ج.م
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-black ${paymentInfo.color}`}>
                {paymentInfo.label}
              </span>
              <CreditCard size={16} className={paymentInfo.color} aria-hidden="true" />
            </div>
          </div>
        </div>

        {/* سعر خاص */}
        {garage && rate !== garage.basePrice && (
          <div
            className="bg-amber-600/10 border border-amber-500/20 rounded-xl p-3 text-center"
            role="note"
          >
            <p className="text-xs text-amber-400 font-bold">
              💰 تم تطبيق سعر خاص: {rate} ج.م/ساعة بدلاً من {garage.basePrice} ج.م/ساعة
            </p>
          </div>
        )}

        {/* رقم الجلسة */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 text-center">
          <span className="text-xs text-slate-600 font-mono">
            رقم الجلسة: {lastSession.id.slice(0, 8)}...
          </span>
        </div>

        {/* زر نسخ */}
        <button
          type="button"
          onClick={copySessionDetails}
          aria-label="نسخ تفاصيل الجلسة كاملة"
          className="w-full bg-blue-600/20 border border-blue-500/20 text-blue-400 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <Copy size={16} aria-hidden="true" />
          نسخ تفاصيل الجلسة
        </button>

        {/* زر العودة */}
        <button
          type="button"
          onClick={() => setScreen('list')}
          aria-label="العودة لقائمة الجراجات"
          className="w-full bg-slate-900 border border-slate-800 text-white py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <ArrowRight size={16} aria-hidden="true" />
          العودة للقائمة
        </button>
      </div>
    </motion.div>
  );
}