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
} from 'lucide-react';
import { useStore } from '../store';
import { calculateFullHours, calculateCost, formatTime } from '../utils/pricing';

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

export default function LastSessionCard() {
  const { sessions, garages, currentUser } = useStore();

  const userPlate = normalizePlate(currentUser?.carPlate);
  const userPhone = currentUser?.phone || '';

  // ✅ البحث الدقيق برقم اللوحة أو رقم الهاتف
  const lastSession = useMemo(() => {
    if (!userPlate && !userPhone) return null;
    return sessions
      .filter(
        (s) =>
          s.status === 'completed' &&
          (
            (!!userPlate && normalizePlate(s.carPlate) === userPlate) ||
            (!!userPhone && (s as any).customerPhone === userPhone)
          )
      )
      .sort((a, b) => toMs(b.endTime) - toMs(a.endTime))[0];
  }, [sessions, userPlate, userPhone]);

  if (!lastSession) return null;

  const garage = garages.find((g) => g.id === lastSession.garageId);

  const startTime = toMs(lastSession.startTime);
  const endTime = toMs(lastSession.endTime);

  const elapsedSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
  const rate = Number(lastSession.agreedPrice ?? garage?.basePrice ?? 0);
  const totalMinutes = Math.floor(elapsedSeconds / 60);

  // 🎁 [منطق الهدية]: قراءة أهلية الجلسة والدقائق المخصومة
  const isFirstFreeApplied = lastSession.isFirstFreeSession === true;
  const freeMinutesApplied = (lastSession as any).freeMinutesApplied ?? (isFirstFreeApplied ? Math.min(totalMinutes, 60) : 0);

  const billableSeconds = Math.max(0, elapsedSeconds - (freeMinutesApplied * 60));
  const hours = calculateFullHours(isFirstFreeApplied ? billableSeconds : elapsedSeconds);

  const rawCost = calculateCost(elapsedSeconds, rate);
  const cost =
    lastSession.totalPrice != null && Number(lastSession.totalPrice) > 0
      ? Number(lastSession.totalPrice)
      : calculateCost(billableSeconds, rate);

  const savedAmount = isFirstFreeApplied ? Math.max(0, rawCost - cost) : 0;

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
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${sourceInfo.bg} ${sourceInfo.color}`}
            >
              {sourceInfo.label}
            </span>
            {isFirstFreeApplied && (
              <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-400 flex items-center gap-1">
                <Gift size={9} /> ساعة مجانية
              </span>
            )}
          </div>
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
        <div
          className="rounded-3xl p-5 mb-4 text-center border border-white/10 shadow-2xl"
          style={{
            background: 'linear-gradient(135deg, rgba(15,23,42,0.96) 0%, rgba(2,6,23,0.98) 100%)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
          }}
        >
          <div
            className="mb-3 font-black text-white"
            style={{
              fontSize: 24,
              fontWeight: 900,
              letterSpacing: '0.5px',
              textShadow: '0 2px 10px rgba(255,255,255,0.08)',
            }}
          >
            إجمالي المستحق
          </div>

          <div className="flex items-end justify-center gap-2">
            <span
              className="font-mono"
              style={{
                fontSize: 56,
                fontWeight: 900,
                lineHeight: 1,
                color: '#FFFFFF',
                textShadow: '0 0 18px rgba(255,255,255,0.15)',
              }}
            >
              {cost.toFixed(0)}
            </span>

            <span
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: '#FFFFFF',
                marginBottom: 6,
              }}
            >
              ج.م
            </span>
          </div>

          {/* 🎁 شارة التوفير إذا طُبق العرض */}
          {isFirstFreeApplied && savedAmount > 0 && (
            <div className="mt-2.5 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-black">
              <Gift size={11} /> وفرت {savedAmount.toFixed(0)} ج.م من العرض الترحيبي!
            </div>
          )}

          <div
            className="mt-3 mx-auto"
            style={{
              width: 100,
              height: 4,
              borderRadius: 999,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)',
              opacity: 0.9,
            }}
          />
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
            <div className="text-[8px] text-slate-500 font-bold">
              {isFirstFreeApplied ? 'ساعات الدفع' : 'ساعة محسوبة'}
            </div>
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