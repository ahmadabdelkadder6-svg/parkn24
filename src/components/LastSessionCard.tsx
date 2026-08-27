import { motion } from 'framer-motion';
import {
  Clock,
  DollarSign,
  MapPin,
  CreditCard,
  Calendar,
  Timer,
  Receipt,
  Gift,
  Coins,
} from 'lucide-react';
import { useStore, calculateSessionPrice } from '../store';
import { formatTime } from '../utils/pricing';

/* ─── Helper: توحيد تحويل الوقت بأمان ─── */
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

  const userPlate = (currentUser?.carPlate ?? '').trim().toUpperCase();

  /* ✅ البحث عن آخر جلسة مكتملة برقم اللوحة أو الهاتف */
  const lastSession = sessions
    .filter(
      (s) =>
        s.status === 'completed' &&
        ((userPlate && s.carPlate.trim().toUpperCase() === userPlate) ||
          (currentUser?.phone && (s as any).customerPhone === currentUser.phone))
    )
    .sort((a, b) => toMs(b.endTime) - toMs(a.endTime))[0];

  if (!lastSession) return null;

  const garage = garages.find((g) => g.id === lastSession.garageId);

  const startTime = toMs(lastSession.startTime);
  const endTime = toMs(lastSession.endTime);
  const durationMs = Math.max(0, endTime - startTime);

  const elapsedSeconds = Math.floor(durationMs / 1000);
  const totalMinutes = Math.floor(elapsedSeconds / 60);
  const rate = Number(lastSession.agreedPrice ?? garage?.basePrice ?? 0);
  const isFirstFree = lastSession.isFirstFreeSession ?? false;
  const refundAmount = Number(lastSession.refundAmount ?? 0);

  // 🎯 حساب السعر بالمنطق الموحد
  const { totalPrice: calcPrice } = calculateSessionPrice(durationMs, rate, isFirstFree);
  const billedHours = Math.max(1, Math.ceil(elapsedSeconds / 3600));
  const baseCost = isFirstFree ? calcPrice : billedHours * rate;
  const finalCost =
    lastSession.totalPrice != null
      ? Number(lastSession.totalPrice)
      : Math.max(0, baseCost - refundAmount);

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
      {/* العنوان العلوي */}
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-[10px] text-slate-500 font-mono">
          {formatDateTime(endDate)}
        </span>
        <h3 className="text-sm font-black text-slate-200 flex items-center gap-2">
          آخر جلسة ركن
          <Receipt size={14} className="text-blue-400" />
        </h3>
      </div>

      {/* البطاقة الرئيسية */}
      <div className="bg-gradient-to-bl from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl shadow-black/40 relative overflow-hidden">
        
        {/* شريط الإشعارات الخاصة (جلسة أولى مجانية أو كاش باك) */}
        {isFirstFree && (
          <div className="mb-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-1.5 flex items-center justify-between text-emerald-400 text-[10px] font-bold">
            <span className="flex items-center gap-1.5">
              <Gift size={13} /> هدية ترحيبية: أول ساعة مجاناً
            </span>
            <span>0 ج.م</span>
          </div>
        )}

        {refundAmount > 0 && (
          <div className="mb-3 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-1.5 flex items-center justify-between text-blue-400 text-[10px] font-bold">
            <span className="flex items-center gap-1.5">
              <Coins size={13} /> تم تطبيق كاش باك المحفظة
            </span>
            <span>- {refundAmount} ج.م</span>
          </div>
        )}

        {/* الجراج ورقم السيارة */}
        <div className="flex justify-between items-start mb-4">
          <span
            className={`text-[9px] px-2.5 py-0.5 rounded-full font-bold ${sourceInfo.bg} ${sourceInfo.color}`}
          >
            {sourceInfo.label}
          </span>
          <div className="text-right">
            <div className="text-base font-black text-white flex items-center gap-1.5 justify-end">
              🚗 {lastSession.carPlate}
            </div>
            {garage && (
              <div className="flex items-center gap-1 justify-end mt-1">
                <span className="text-[10px] text-slate-400">{garage.name}</span>
                <MapPin size={10} className="text-slate-500" />
              </div>
            )}
          </div>
        </div>

        {/* التكلفة الإجمالية - تصميم فاخر ومميز */}
        <div
          className="rounded-2xl p-4 mb-4 text-center border border-white/5 shadow-inner"
          style={{
            background: 'linear-gradient(135deg, rgba(15,23,42,0.8) 0%, rgba(2,6,23,0.9) 100%)',
          }}
        >
          <div className="text-[11px] font-bold text-slate-400 mb-1">
            {isFirstFree ? 'المبلغ المطلوب بعد الخصم' : 'إجمالي المستحق'}
          </div>

          <div className="flex items-end justify-center gap-2">
            <span
              className="font-mono"
              style={{
                fontSize: 48,
                fontWeight: 900,
                lineHeight: 1,
                color: isFirstFree && finalCost === 0 ? '#34D399' : '#FFFFFF',
                textShadow: '0 0 20px rgba(255,255,255,0.1)',
              }}
            >
              {finalCost.toFixed(0)}
            </span>

            <span
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: isFirstFree && finalCost === 0 ? '#34D399' : '#D4AF37',
                marginBottom: 4,
              }}
            >
              ج.م
            </span>
          </div>

          {/* تفصيل صغير لو في كاش باك أو جلسة مجانية */}
          {(refundAmount > 0 || (isFirstFree && baseCost > 0)) && (
            <div className="text-[9px] text-slate-500 mt-1.5 font-mono">
              الأصلي: {baseCost} ج.م • الخصم: {isFirstFree ? baseCost - finalCost : refundAmount} ج.م
            </div>
          )}
        </div>

        {/* تفاصيل الوقت والساعات */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-2.5 text-center">
            <Clock size={13} className="text-blue-400 mx-auto mb-1" />
            <div className="text-xs font-black text-white font-mono">
              {formatTime(elapsedSeconds)}
            </div>
            <div className="text-[8px] text-slate-500 font-bold mt-0.5">المدة الفعلية</div>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-2.5 text-center">
            <Timer size={13} className="text-purple-400 mx-auto mb-1" />
            <div className="text-xs font-black text-purple-400 font-mono">
              {billedHours}
            </div>
            <div className="text-[8px] text-slate-500 font-bold mt-0.5">ساعة محسوبة</div>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-2.5 text-center">
            <DollarSign size={13} className="text-amber-400 mx-auto mb-1" />
            <div className="text-xs font-black text-amber-400 font-mono">
              {rate}
            </div>
            <div className="text-[8px] text-slate-500 font-bold mt-0.5">ج.م/ساعة</div>
          </div>
        </div>

        {/* أوقات الدخول والخروج */}
        <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-3 mb-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-emerald-400 font-mono">
              {formatTimeOnly(startDate)}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500 font-bold">وقت الدخول</span>
              <Calendar size={11} className="text-slate-600" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-red-400 font-mono">
              {formatTimeOnly(endDate)}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500 font-bold">وقت الخروج</span>
              <Calendar size={11} className="text-slate-600" />
            </div>
          </div>
        </div>

        {/* طريقة السداد */}
        <div className={`${paymentInfo.bg} border border-slate-800/40 rounded-xl p-2.5 flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <CreditCard size={13} className={paymentInfo.color} />
            <span className={`text-[11px] font-black ${paymentInfo.color}`}>
              تم السداد: {paymentInfo.label}
            </span>
          </div>
          <div className="text-base">{paymentInfo.icon}</div>
        </div>

        {/* سعر خاص إن وجد */}
        {garage && rate !== garage.basePrice && (
          <div className="mt-2 bg-amber-600/10 border border-amber-500/20 rounded-xl p-1.5 text-center">
            <p className="text-[8px] text-amber-400 font-bold">
              💰 تم تطبيق سعر خاص: {rate} ج.م/ساعة (بدل {garage.basePrice} ج.م)
            </p>
          </div>
        )}

        {/* الفوتر الصغير */}
        <div className="mt-3 text-center">
          <span className="text-[9px] text-slate-600 font-mono">
            {formatDateTime(startDate)} • {totalMinutes} دقيقة إجمالي
          </span>
        </div>
      </div>
    </motion.div>
  );
}