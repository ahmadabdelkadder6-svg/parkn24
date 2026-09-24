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
  Shield,
} from 'lucide-react';
// 🌟 استيراد دوال البصمة والتوقيت الموحد من الـ store لضمان مطابقة اللوحات والأرقام بدقة 100%
import { useStore, normalizePlate, normalizePhone, getServerNow } from '../store';
import { calculateFullHours, calculateCost, formatTime } from '../utils/pricing';

/* ─── 🎨 الألوان الرسمية الفاخرة لتطبيق Park'n 24 ─── */
const BRAND = {
  blue: '#1656b8',       // الأزرق الرسمي
  blueDark: '#0f3d85',   // الكحلي الفخم
  blueLight: '#e8f0fe',  // الأزرق الفاتح جداً
  blueSoft: 'rgba(22, 86, 184, 0.12)', // كحلي زجاجي ناعم
  green: '#8cc63f',      // الأخضر الرسمي
  greenDark: '#6ea62a',  // أخضر داكن للخطوط
  greenLight: 'rgba(140, 198, 63, 0.12)', // خلفية خضراء ناعمة
  navy: '#0a1628',       // الكحلي الليلي الغامق
  navyLight: '#111e36',  // كحلي أفتح للبطاقات
  slate: '#64748b',      // الرمادي الهادئ
  slateMuted: '#94a3b8', // الرمادي الباهت
  border: 'rgba(255, 255, 255, 0.08)', // حدود زجاجية رفيعة
};

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
  const endTime = toMs(lastSession.endTime) || getServerNow();

  const elapsedSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
  const rate = Number(lastSession.agreedPrice ?? garage?.basePrice ?? 0);
  const totalMinutes = Math.floor(elapsedSeconds / 60);

  // 🛡️ التحقق من تفعيل درع الأمان الفضائي VIP (قراءة صارمة ومحصنة من قاعدة البيانات)
  const hasSecurityShield = lastSession.securityShieldActive === true || (lastSession as any).security_shield_active === true;
  const shieldFee = hasSecurityShield ? 10 : 0;

  // 🎁 [منطق الهدية الترحيبية]: أول 30 دقيقة مجانية (1800 ثانية)
  const isFirstFreeApplied = lastSession.isFirstFreeSession === true;
  
  const isFreeParking = isFirstFreeApplied && (
    lastSession.totalPrice === 0 ||
    lastSession.paymentMethod === 'free' ||
    (lastSession.totalPrice != null && lastSession.totalPrice <= shieldFee) ||
    (lastSession.totalPrice == null && elapsedSeconds <= 1800)
  );

  const hours = isFreeParking ? 0 : calculateFullHours(elapsedSeconds);

  // ⚡ موازنة الفاتورة الإعجازية: قراءة المدفوع الحقيقي من قاعدة البيانات
  const cost = lastSession.totalPrice != null ? Number(lastSession.totalPrice) : 0;

  // ⚡ التكلفة الصافية للركن = الإجمالي المدفوع - رسوم الدرع (إذا تفعل فقط)
  const parkingCost = isFreeParking ? 0 : Math.max(0, cost - shieldFee);

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
        return { label: 'سداد نقدي كاش', icon: '💵', color: BRAND.green, bg: BRAND.greenLight };
      case 'instapay':
        return { label: 'دفع عبر إنستاباي', icon: '📱', color: '#c084fc', bg: 'rgba(192, 132, 252, 0.12)' };
      case 'wallet':
        return { label: 'خصم من المحفظة', icon: '👝', color: '#60a5fa', bg: BRAND.blueSoft };
      case 'free':
        return { label: 'ركنة ترحيبية مجانية', icon: '🎁', color: BRAND.green, bg: BRAND.greenLight };
      case 'cashwallet':
        return { label: 'محفظة كاش إلكترونية', icon: '📲', color: '#fb923c', bg: 'rgba(251, 146, 60, 0.12)' };
      default:
        return { label: 'سداد نقدي كاش', icon: '💵', color: BRAND.green, bg: BRAND.greenLight };
    }
  };

  const paymentInfo = getPaymentInfo(
    isFreeParking && !hasSecurityShield ? 'free' : lastSession.paymentMethod
  );

  const sourceInfo =
    lastSession.source === 'app'
      ? { label: 'حجز تطبيق', color: '#60a5fa', bg: BRAND.blueSoft }
      : { label: 'ركن يدوي', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="w-full mb-5 text-right"
      style={{ direction: 'rtl' }}
    >
      {/* رأس البطاقة */}
      <div className="flex items-center justify-between mb-2.5 px-1">
        <h3 className="text-xs font-black flex items-center gap-1.5" style={{ color: BRAND.navy }}>
          <Receipt size={14} style={{ color: BRAND.blue }} />
          إيصال آخر جلسة ركن
        </h3>
        <span className="text-[10px] font-bold" style={{ color: BRAND.slate }}>
          {formatDateTime(endDate)}
        </span>
      </div>

      {/* البطاقة الرقمية الفاخرة */}
      <div 
        className="rounded-3xl p-4.5 text-white relative overflow-hidden border"
        style={{
          background: BRAND.navy,
          borderColor: BRAND.border,
          boxShadow: '0 8px 30px rgba(10, 22, 40, 0.12)',
        }}
      >
        {/* لمسة إضاءة ناعمة في الزاوية */}
        <div 
          className="absolute -top-12 -right-12 w-32 h-32 rounded-full pointer-events-none"
          style={{ background: `${BRAND.blue}18`, filter: 'blur(30px)' }} 
        />

        {/* الجراج ورقم السيارة والبصمة */}
        <div className="flex justify-between items-start mb-3.5 relative z-10">
          <div className="text-right">
            <div className="text-sm font-black text-white font-mono flex items-center gap-1">
              🚗 {lastSession.carPlate}
            </div>
            {garage && (
              <div className="flex items-center gap-1 mt-0.5" style={{ color: BRAND.slateMuted }}>
                <MapPin size={10} />
                <span className="text-[10px] font-bold">{garage.name}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 flex-wrap justify-end">
            <span
              className="text-[9px] px-2 py-0.5 rounded-lg font-black"
              style={{ background: sourceInfo.bg, color: sourceInfo.color }}
            >
              {sourceInfo.label}
            </span>

            {/* شارة درع الأمان الفضائي */}
            {hasSecurityShield && (
              <span 
                className="text-[9px] px-2 py-0.5 rounded-lg font-black flex items-center gap-1 border"
                style={{ 
                  background: 'rgba(56, 189, 248, 0.12)', 
                  color: '#38bdf8', 
                  borderColor: 'rgba(56, 189, 248, 0.3)' 
                }}
              >
                <Shield size={9} /> درع VIP (+10ج)
              </span>
            )}

            {isFirstFreeApplied && (
              <span 
                className="text-[9px] px-2 py-0.5 rounded-lg font-black flex items-center gap-1 border"
                style={{ 
                  background: BRAND.greenLight, 
                  color: BRAND.green, 
                  borderColor: `${BRAND.green}40` 
                }}
              >
                <Gift size={9} /> {isFreeParking ? 'هدية ترحيبية 🎁' : 'عرض 30 د'}
              </span>
            )}
          </div>
        </div>

        {/* المربع المالي الرئيسي للمبلغ */}
        <div
          className="rounded-2xl p-4 mb-3 text-center border relative z-10"
          style={{
            background: BRAND.navyLight,
            borderColor: BRAND.border,
          }}
        >
          <div className="text-[9px] font-bold mb-1 tracking-wider" style={{ color: BRAND.slateMuted }}>
            إجمالي المبلغ المحصل
          </div>

          <div className="flex items-baseline justify-center gap-1">
            <span
              className="font-mono text-4xl font-black leading-none"
              style={{
                color: isFreeParking && !hasSecurityShield ? BRAND.green : '#ffffff',
                letterSpacing: '-1px',
              }}
            >
              {cost.toFixed(0)}
            </span>
            <span
              className="text-sm font-black"
              style={{ color: isFreeParking && !hasSecurityShield ? BRAND.green : BRAND.slateMuted }}
            >
              ج.م
            </span>
          </div>

          {/* شارة التوفير أو تفصيل الدرع */}
          {isFreeParking && !hasSecurityShield ? (
            <div 
              className="mt-2.5 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9.5px] font-black border"
              style={{ background: BRAND.greenLight, color: BRAND.green, borderColor: `${BRAND.green}30` }}
            >
              <CheckCircle2 size={11} /> أول 30 دقيقة مجانية كهدية ترحيبية! 🎉
            </div>
          ) : hasSecurityShield ? (
            <div className="mt-1.5 text-[9px] font-bold text-sky-400">
              🛡️ شامل 10 ج.م درع الحماية الفضائية الذكية
            </div>
          ) : isFirstFreeApplied ? (
            <div className="mt-1.5 text-[9px] font-bold" style={{ color: BRAND.slateMuted }}>
              ⏰ انتهت أول 30 دقيقة وتم حساب الوقت الإضافي
            </div>
          ) : null}
        </div>

        {/* شبكة تفاصيل الوقت والساعات والسعر */}
        <div className="grid grid-cols-3 gap-2 mb-3 relative z-10">
          <div className="border rounded-xl p-2 text-center" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
            <Clock size={12} style={{ color: BRAND.blue }} className="mx-auto mb-1" />
            <div className="text-[11px] font-black text-white font-mono">
              {formatTime(elapsedSeconds)}
            </div>
            <div className="text-[8px] font-bold mt-0.5" style={{ color: BRAND.slateMuted }}>المدة الكلية</div>
          </div>
          <div className="border rounded-xl p-2 text-center" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
            <Timer size={12} style={{ color: '#c084fc' }} className="mx-auto mb-1" />
            <div className="text-[11px] font-black font-mono" style={{ color: '#c084fc' }}>
              {hours}
            </div>
            <div className="text-[8px] font-bold mt-0.5" style={{ color: BRAND.slateMuted }}>
              {isFreeParking ? 'مجانية (0س)' : 'ساعة محسوبة'}
            </div>
          </div>
          <div className="border rounded-xl p-2 text-center" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
            <DollarSign size={12} style={{ color: BRAND.green }} className="mx-auto mb-1" />
            <div className="text-[11px] font-black font-mono" style={{ color: BRAND.green }}>
              {rate}
            </div>
            <div className="text-[8px] font-bold mt-0.5" style={{ color: BRAND.slateMuted }}>ج.م/ساعة</div>
          </div>
        </div>

        {/* وقت الدخول والخروج */}
        <div className="border rounded-xl p-2.5 mb-3 space-y-1.5 relative z-10" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5" style={{ color: BRAND.slateMuted }}>
              <Calendar size={11} />
              <span className="text-[10px] font-bold">وقت الدخول:</span>
            </div>
            <span className="text-[10.5px] font-black text-emerald-400 font-mono">
              {formatTimeOnly(startDate)}
            </span>
          </div>

          <div className="border-t border-dashed" style={{ borderColor: BRAND.border }} />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5" style={{ color: BRAND.slateMuted }}>
              <Calendar size={11} />
              <span className="text-[10px] font-bold">وقت الخروج:</span>
            </div>
            <span className="text-[10.5px] font-black text-red-400 font-mono">
              {formatTimeOnly(endDate)}
            </span>
          </div>
        </div>

        {/* طريقة الدفع */}
        <div 
          className="border rounded-xl p-2.5 flex items-center justify-between relative z-10"
          style={{ background: paymentInfo.bg, borderColor: BRAND.border }}
        >
          <div className="flex items-center gap-1.5">
            <CreditCard size={13} style={{ color: paymentInfo.color }} />
            <span className="text-[10.5px] font-black" style={{ color: paymentInfo.color }}>
              {paymentInfo.label}
            </span>
          </div>
          <span className="text-base">{paymentInfo.icon}</span>
        </div>

        {/* التذييل التاريخي */}
        <div className="text-center relative z-10 mt-2.5">
          <span className="text-[9px] font-mono font-bold" style={{ color: BRAND.slateMuted }}>
            {formatDateTime(startDate)} • إجمالي المدة {totalMinutes} دقيقة
          </span>
        </div>
      </div>
    </motion.div>
  );
}