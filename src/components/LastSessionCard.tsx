import { useMemo } from 'react';
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
  Gift,
  CheckCircle2,
} from 'lucide-react';
// 🌟 استيراد دوال البصمة الموحدة من الـ store لضمان مطابقة اللوحات والأرقام بدقة 100%
import { useStore, normalizePlate, normalizePhone } from '../store';
import { calculateFullHours, calculateCost, formatTime } from '../utils/pricing';

const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function LastSessionCard() {
  const { sessions, garages, currentUser } = useStore();

  const userPlate = normalizePlate(currentUser?.carPlate);
  const userPhone = currentUser?.phone ? normalizePhone(currentUser.phone) : '';

  // ✅ البحث الدقيق برقم اللوحة الموحد أو رقم الهاتف الموحد
  const lastSession = useMemo(() => {
    if (!userPlate && !userPhone) return null;
    return sessions
      .filter((s) => {
        if (!s || s.status !== 'completed') return false;
        const samePlate = !!userPlate && normalizePlate(s.carPlate) === userPlate;
        const sPhone = (s as any).customerPhone ? normalizePhone((s as any).customerPhone) : '';
        const samePhone = Boolean(userPhone && sPhone === userPhone);
        return samePlate || samePhone;
      })
      .sort((a, b) => toMs(b.endTime) - toMs(a.endTime))[0];
  }, [sessions, userPlate, userPhone]);

  if (!lastSession) return null;

  const garage = garages.find((g) => g.id === lastSession.garageId);

  const startTime = toMs(lastSession.startTime);
  const endTime = toMs(lastSession.endTime);

  const elapsedSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
  const rate = Number(lastSession.agreedPrice ?? garage?.basePrice ?? 0);
  const totalMinutes = Math.floor(elapsedSeconds / 60);

  // 🎁 [منطق الهدية الترحيبية]: أول 30 دقيقة مجانية (1800 ثانية)
  const isFirstFreeApplied = lastSession.isFirstFreeSession === true;
  
  const isFree = isFirstFreeApplied && (
    lastSession.totalPrice === 0 ||
    lastSession.paymentMethod === 'free' ||
    (lastSession.totalPrice == null && elapsedSeconds <= 1800)
  );

  const hours = isFree ? 0 : calculateFullHours(elapsedSeconds);
  const rawCost = calculateCost(elapsedSeconds, rate);
  
  const cost =
    lastSession.totalPrice != null
      ? Number(lastSession.totalPrice)
      : (isFree ? 0 : rawCost);

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

  const getPaymentInfo = (method?: string) => {
    switch (method) {
      case 'cash':
        return { label: 'سداد نقدي كاش', icon: '💵', color: 'text-emerald-400', bg: 'bg-emerald-500/20' };
      case 'instapay':
        return { label: 'دفع عبر إنستاباي', icon: '📱', color: 'text-purple-400', bg: 'bg-purple-500/20' };
      case 'wallet':
        return { label: 'خصم من المحفظة', icon: '👝', color: 'text-blue-400', bg: 'bg-blue-500/20' };
      case 'free':
        return { label: 'ركنة ترحيبية مجانية', icon: '🎁', color: 'text-amber-400', bg: 'bg-amber-500/20' };
      case 'cashwallet':
        return { label: 'محفظة كاش إلكترونية', icon: '📲', color: 'text-orange-400', bg: 'bg-orange-500/20' };
      default:
        return { label: 'سداد نقدي كاش', icon: '💵', color: 'text-emerald-400', bg: 'bg-emerald-500/20' };
    }
  };

  const paymentInfo = getPaymentInfo(isFree ? 'free' : lastSession.paymentMethod);

  const sourceInfo =
    lastSession.source === 'app'
      ? { label: 'حجز تطبيق', color: 'text-blue-400', bg: 'bg-blue-500/20' }
      : { label: 'ركن يدوي', color: 'text-amber-400', bg: 'bg-amber-500/20' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="w-full mb-6"
    >
      {/* العنوان */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] text-slate-500 font-bold">
          {formatDateTime(endDate)}
        </span>
        <h3 className="text-sm font-black text-slate-700 flex items-center gap-2">
          إيصال آخر جلسة ركن
          <Receipt size={15} className="text-blue-600" />
        </h3>
      </div>

      {/* البطاقة الرئيسية */}
      <div className="bg-gradient-to-bl from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-5 shadow-2xl text-white relative overflow-hidden">
        
        {/* لمسة إضاءة علوية */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-blue-600/10 rounded-full filter blur-3xl pointer-events-none" />

        {/* الجراج ورقم السيارة */}
        <div className="flex justify-between items-start mb-4 relative z-10">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`text-[9.5px] px-2.5 py-1 rounded-xl font-black ${sourceInfo.bg} ${sourceInfo.color}`}
            >
              {sourceInfo.label}
            </span>
            {isFirstFreeApplied && (
              <span className="text-[9.5px] px-2.5 py-1 rounded-xl font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                <Gift size={10} /> {isFree ? 'هدية ترحيبية 🎁' : 'عرض 30 دقيقة'}
              </span>
            )}
          </div>
          <div className="text-right">
            <div className="text-base font-black text-white flex items-center gap-1.5 justify-end">
              🚗 {lastSession.carPlate}
            </div>
            {garage && (
              <div className="flex items-center gap-1 justify-end mt-1 text-slate-400">
                <span className="text-[11px] font-bold">{garage.name}</span>
                <MapPin size={11} className="text-slate-500" />
              </div>
            )}
          </div>
        </div>

        {/* التكلفة الكبيرة */}
        <div
          className="rounded-2xl p-5 mb-4 text-center border border-white/10 relative z-10"
          style={{
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
            boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.1)',
          }}
        >
          <div className="mb-2 font-bold text-slate-400 text-xs">
            إجمالي المبلغ المحصل
          </div>

          <div className="flex items-baseline justify-center gap-1.5">
            <span
              className="font-mono"
              style={{
                fontSize: 48,
                fontWeight: 900,
                lineHeight: 1,
                color: isFree ? '#10B981' : '#FFFFFF',
              }}
            >
              {cost.toFixed(0)}
            </span>

            <span
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: isFree ? '#10B981' : '#94A3B8',
              }}
            >
              ج.م
            </span>
          </div>

          {/* 🎁 شارة التوفير إذا طُبق العرض */}
          {isFree ? (
            <div className="mt-3 inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10.5px] font-black">
              <CheckCircle2 size={12} /> أول 30 دقيقة مجانية كهدية ترحيبية! 🎉
            </div>
          ) : isFirstFreeApplied ? (
            <div className="mt-2 text-slate-400 text-[10px] font-bold">
              ⏰ تم انتهاء أول 30 دقيقة مجانية وتم حساب الوقت الإضافي
            </div>
          ) : null}
        </div>

        {/* تفاصيل الوقت */}
        <div className="grid grid-cols-3 gap-2 mb-4 relative z-10">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-2.5 text-center">
            <Clock size={15} className="text-blue-400 mx-auto mb-1" />
            <div className="text-xs font-black text-white font-mono">
              {formatTime(elapsedSeconds)}
            </div>
            <div className="text-[9px] text-slate-400 font-bold mt-0.5">المدة الكلية</div>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-2.5 text-center">
            <Timer size={15} className="text-purple-400 mx-auto mb-1" />
            <div className="text-xs font-black text-purple-300 font-mono">
              {hours}
            </div>
            <div className="text-[9px] text-slate-400 font-bold mt-0.5">
              {isFree ? 'مجانية (0س)' : 'ساعة محسوبة'}
            </div>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-2.5 text-center">
            <DollarSign size={15} className="text-amber-400 mx-auto mb-1" />
            <div className="text-xs font-black text-amber-300 font-mono">
              {rate}
            </div>
            <div className="text-[9px] text-slate-400 font-bold mt-0.5">ج.م/ساعة</div>
          </div>
        </div>

        {/* وقت الدخول والخروج */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 mb-4 space-y-2 relative z-10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-emerald-400 font-mono">
              {formatTimeOnly(startDate)}
            </span>
            <div className="flex items-center gap-1.5 text-slate-400">
              <span className="text-[11px] font-bold">وقت الدخول</span>
              <Calendar size={12} />
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
            <span className="text-xs font-black text-rose-400 font-mono">
              {formatTimeOnly(endDate)}
            </span>
            <div className="flex items-center gap-1.5 text-slate-400">
              <span className="text-[11px] font-bold">وقت الخروج</span>
              <Calendar size={12} />
            </div>
          </div>
        </div>

        {/* طريقة الدفع */}
        <div className={`${paymentInfo.bg} border border-white/5 rounded-2xl p-3 flex items-center justify-between relative z-10`}>
          <div className="flex items-center gap-2">
            <CreditCard size={16} className={paymentInfo.color} />
            <span className={`text-xs font-black ${paymentInfo.color}`}>
              {paymentInfo.label}
            </span>
          </div>
          <div className="text-2xl">{paymentInfo.icon}</div>
        </div>

        {/* تاريخ الجلسة */}
        <div className="mt-3 text-center relative z-10">
          <span className="text-[10px] text-slate-500 font-mono font-bold">
            {formatDateTime(startDate)} • إجمالي المدة {totalMinutes} دقيقة
          </span>
        </div>
      </div>
    </motion.div>
  );
}