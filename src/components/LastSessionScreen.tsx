import { motion } from 'framer-motion';
import {
  Clock,
  DollarSign,
  MapPin,
  Calendar,
  Timer,
  Receipt,
  ArrowRight,
  Copy,
  Gift,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
// 🌟 استيراد دوال البصمة والتوقيت الموحد من الـ store لضمان مطابقة البيانات بدقة 100%
import { useStore, normalizePlate, normalizePhone, getServerNow } from '../store';
import { calculateFullHours, calculateCost, formatTime } from '../utils/pricing';
import toast from 'react-hot-toast';
import { useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';

/* ─── 🎨 الألوان الرسمية الفاخرة لتطبيق Park'n 24 ─── */
const BRAND = {
  blue: '#1656b8',       // الأزرق الرسمي
  blueDark: '#0f3d85',   // الكحلي الفخم
  blueLight: '#e8f0fe',  // الأزرق الفاتح جداً
  blueSoft: 'rgba(22, 86, 184, 0.08)', // كحلي زجاجي ناعم
  green: '#8cc63f',      // الأخضر الرسمي
  greenDark: '#6ea62a',  // أخضر داكن للخطوط
  greenLight: 'rgba(140, 198, 63, 0.12)', // خلفية خضراء ناعمة
  navy: '#0a1628',       // الكحلي الليلي الغامق
  navyLight: '#111e36',  // كحلي أفتح للبطاقات
  slate: '#64748b',      // الرمادي الهادئ
  slateMuted: '#94a3b8', // الرمادي الباهت
  border: 'rgba(255, 255, 255, 0.08)', // حدود زجاجية رفيعة
};

/* ─── Helper: توحيد تحويل الوقت من أي مصدر ─── */
const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

/* ════════════════════════════════════════════════════════════
   ██  LAST SESSION SCREEN
   ════════════════════════════════════════════════════════════ */
export default function LastSessionScreen() {
  const { sessions, garages, currentUser, setScreen, fetchAll } = useStore();

  const userPlate = normalizePlate(currentUser?.carPlate);
  const userPhone = currentUser?.phone ? normalizePhone(currentUser.phone) : '';

  /* ✅ البحث بـ carPlate أو customerPhone بالبصمة الموحدة */
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

  const garage = lastSession
    ? garages.find((g) => g.id === lastSession.garageId)
    : null;

  /* ── Ref ── */
  const realtimeChannelRef = useRef<any>(null);

  /* ─────────────────────────────────────────────
     ██  REALTIME
     ───────────────────────────────────────────── */
  useEffect(() => {
    if (!userPlate && !userPhone) return;

    fetchAll();

    const garageId = lastSession?.garageId ?? null;

    const isMySessionPayload = (row: any) => {
      if (!row) return false;
      const plate = normalizePlate(row.car_plate || row.carPlate);
      const phone = normalizePhone(row.customer_phone || row.customerPhone || '');
      return (
        (!!userPlate && plate === userPlate) ||
        (!!userPhone && phone === userPhone)
      );
    };

    const channel = supabase
      .channel(`last-session-${userPlate || userPhone}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sessions',
          ...(garageId ? { filter: `garage_id=eq.${garageId}` } : {}),
        },
        async (payload) => {
          const row = payload.new as any;
          if (isMySessionPayload(row)) {
            await fetchAll();
          }
        },
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      realtimeChannelRef.current = null;
    };
  }, [userPlate, userPhone, fetchAll, lastSession?.garageId]);

  /* ─── لا توجد جلسات ─── */
  if (!lastSession) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-full flex flex-col items-center justify-center p-8 text-right safe-top safe-bottom"
        style={{ background: BRAND.navy, color: '#ffffff' }}
      >
        <div className="text-4xl mb-3">📭</div>
        <p className="text-base font-black mb-1" style={{ color: '#ffffff' }}>لا توجد جلسات سابقة</p>
        <p className="text-xs text-center mb-6 font-bold" style={{ color: BRAND.slateMuted }}>
          ابدأ ركن سيارتك وستظهر تفاصيل وإيصال الجلسة هنا
        </p>
        <button
          onClick={() => setScreen('list')}
          className="border-0 text-white px-8 py-3.5 rounded-2xl font-black text-xs active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
          style={{ background: BRAND.blue, boxShadow: `0 4px 14px ${BRAND.blue}25` }}
        >
          <ArrowRight size={15} />
          العودة للقائمة الرئيسية
        </button>
      </motion.div>
    );
  }

  /* ── Computed ── */
  const startTime = toMs(lastSession.startTime);
  const endTime = toMs(lastSession.endTime) || getServerNow();

  const elapsedSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
  const rate = Number(lastSession.agreedPrice ?? garage?.basePrice ?? 0);
  const totalMinutes = Math.floor(elapsedSeconds / 60);

  // 🎁 [منطق الهدية]: التحقق مما إذا كانت الجلسة مجانية
  const isFirstFreeApplied = lastSession.isFirstFreeSession === true;
  
  const isFree = isFirstFreeApplied && (
    lastSession.totalPrice === 0 ||
    lastSession.paymentMethod === 'free' ||
    (lastSession.totalPrice == null && elapsedSeconds <= 1800)
  );

  const billableHours = isFree ? 0 : calculateFullHours(elapsedSeconds);
  const rawCost = calculateCost(elapsedSeconds, rate);

  const cost =
    lastSession.totalPrice != null
      ? Number(lastSession.totalPrice)
      : (isFree ? 0 : rawCost);

  const savedAmount = isFree ? rawCost : 0;

  const startDate = new Date(startTime);
  const endDate = new Date(endTime);

  /* ── Formatters ── */
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
    });

  const getPaymentInfo = (method?: string) => {
    switch (method) {
      case 'cash':
        return {
          label: 'سداد نقدي كاش', icon: '💵',
          color: BRAND.green,
          bg: BRAND.greenLight,
        };
      case 'instapay':
        return {
          label: 'دفع عبر إنستاباي', icon: '📱',
          color: '#c084fc',
          bg: 'rgba(192, 132, 252, 0.12)',
        };
      case 'wallet':
        return {
          label: 'خصم من المحفظة', icon: '👝',
          color: '#60a5fa',
          bg: 'rgba(96, 165, 250, 0.12)',
        };
      case 'free':
        return {
          label: 'ركن مجاني ترحيبي', icon: '🎁',
          color: BRAND.green,
          bg: BRAND.greenLight,
        };
      case 'cashwallet':
        return {
          label: 'محفظة كاش إلكترونية', icon: '📲',
          color: '#fb923c',
          bg: 'rgba(251, 146, 60, 0.12)',
        };
      default:
        return {
          label: 'سداد نقدي كاش', icon: '💵',
          color: BRAND.green,
          bg: BRAND.greenLight,
        };
    }
  };

  const paymentInfo = getPaymentInfo(isFree ? 'free' : lastSession.paymentMethod);

  const sourceInfo =
    lastSession.source === 'app'
      ? { label: 'حجز التطبيق', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.12)' }
      : { label: 'ركنة يدوية', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' };

  /* ── نسخ التفاصيل ── */
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
⏱️ المدة الكلية: ${totalMinutes} دقيقة
${isFree ? `🎁 هدية ترحيبية: ركن مجاني بالكامل (أول 30 دقيقة - وفرت ${savedAmount.toFixed(0)} ج.م)\n` : `⏱️ الساعات المحسوبة: ${billableHours} ساعة\n`}━━━━━━━━━━━━━━━━━━
💰 سعر الساعة: ${rate} ج.م
💵 الإجمالي المدفوع: ${cost.toFixed(0)} ج.م
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
      className="h-full flex flex-col safe-top safe-bottom text-right"
      style={{ background: BRAND.navy, color: '#ffffff' }}
    >
      {/* ══ Header ══ */}
      <div className="flex items-center justify-between px-4 pt-12 pb-3 shrink-0">
        <button
          onClick={() => setScreen('list')}
          className="p-2.5 rounded-xl border cursor-pointer bg-white/5 active:scale-90 transition-all text-slate-300"
          style={{ borderColor: BRAND.border }}
        >
          <ArrowRight size={18} />
        </button>
        <h2 className="text-xs font-black flex items-center gap-1.5" style={{ color: '#ffffff' }}>
          <Receipt size={16} style={{ color: BRAND.blue }} />
          تفاصيل وإيصال آخر جلسة
        </h2>
        <button
          onClick={copySessionDetails}
          className="p-2.5 rounded-xl border cursor-pointer bg-white/5 active:scale-90 transition-all"
          style={{ borderColor: BRAND.border }}
        >
          <Copy size={16} style={{ color: BRAND.blue }} />
        </button>
      </div>

      {/* ══ Content ══ */}
      <div className="flex-1 px-4 pb-4 overflow-y-auto space-y-3">

        {/* التاريخ */}
        <div className="text-center">
          <span className="text-[10px] border px-3 py-1 rounded-full font-bold inline-block" style={{ background: BRAND.navyLight, borderColor: BRAND.border, color: BRAND.slateMuted }}>
            📅 {formatDateTime(startDate)}
          </span>
        </div>

        {/* رقم السيارة والجراج */}
        <div className="border rounded-2xl p-3.5 space-y-2.5" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
          <div className="flex justify-between items-center">
            <span
              className="text-[9px] px-2.5 py-1 rounded-lg font-black"
              style={{ background: sourceInfo.bg, color: sourceInfo.color }}
            >
              {sourceInfo.label}
            </span>
            <div className="text-base font-black text-white font-mono">
              🚗 {lastSession.carPlate}
            </div>
          </div>
          {garage && (
            <div className="rounded-xl p-2.5 flex items-center justify-between border" style={{ background: BRAND.navy, borderColor: BRAND.border }}>
              <div className="flex items-center gap-1 text-[10px]" style={{ color: BRAND.slateMuted }}>
                <MapPin size={11} />
                <span className="font-bold">{garage.location}</span>
              </div>
              <span className="text-xs font-black text-white">{garage.name}</span>
            </div>
          )}
        </div>

        {/* 💳 بطاقة الإيصال المالي الفاخرة (Apple / Revolut Style) */}
        <div
          className="border rounded-3xl p-5 text-center relative overflow-hidden"
          style={{
            background: BRAND.navyLight,
            borderColor: isFree ? BRAND.green + '40' : BRAND.border,
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          }}
        >
          {/* عنوان الكارت */}
          <div className="text-[10px] font-bold mb-1 tracking-wider" style={{ color: BRAND.slateMuted }}>
            إجمالي المبلغ المدفوع
          </div>

          {/* الرقم الرئيسي للمدفوع */}
          <div className="flex items-baseline justify-center gap-1.5 my-2">
            <span
              className="font-mono text-5xl font-black leading-none"
              style={{
                color: isFree ? BRAND.green : '#ffffff',
                letterSpacing: '-1px',
              }}
            >
              {cost.toFixed(0)}
            </span>
            <span
              className="text-base font-black"
              style={{ color: isFree ? BRAND.green : BRAND.slateMuted }}
            >
              ج.م
            </span>
          </div>

          {/* شارة طريقة السداد الأنيقة */}
          <div className="mt-2.5 mb-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-[11px] font-bold"
            style={{
              background: paymentInfo.bg,
              borderColor: BRAND.border,
              color: paymentInfo.color,
            }}
          >
            <span>{paymentInfo.icon}</span>
            <span>{isFree ? 'ركن مجاني ترحيبي 🎁' : `تم السداد: ${paymentInfo.label}`}</span>
          </div>

          {/* سطر توضيحي للحساب */}
          <div className="text-[10px] font-bold mt-2" style={{ color: BRAND.slateMuted }}>
            {isFree ? (
              <span style={{ color: BRAND.green }}>
                (تم تطبيق الهدية الترحيبية: ركن {totalMinutes} دقيقة مجاناً وفرت {savedAmount.toFixed(0)} ج.م 🎁)
              </span>
            ) : isFirstFreeApplied ? (
              <span className="text-amber-400">
                (انتهت أول 30 دقيقة مجانية: تم احتساب {billableHours} ساعة = {cost.toFixed(0)} ج.م)
              </span>
            ) : (
              <span>
                {billableHours} ساعة × {rate} ج.م = {cost.toFixed(0)} ج.م
              </span>
            )}
          </div>
        </div>

        {/* تفاصيل الوقت بالأعمدة الثلاثية */}
        <div className="grid grid-cols-3 gap-2">
          <div className="border rounded-2xl p-3 text-center" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
            <Clock size={14} style={{ color: BRAND.blue }} className="mx-auto mb-1" />
            <div className="text-xs font-black text-white font-mono">
              {formatTime(elapsedSeconds)}
            </div>
            <div className="text-[8px] font-bold mt-0.5" style={{ color: BRAND.slateMuted }}>
              المدة الكلية
            </div>
          </div>
          <div className="border rounded-2xl p-3 text-center" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
            <Timer size={14} style={{ color: '#c084fc' }} className="mx-auto mb-1" />
            <div className="text-xs font-black font-mono" style={{ color: '#c084fc' }}>
              {billableHours}
            </div>
            <div className="text-[8px] font-bold mt-0.5" style={{ color: BRAND.slateMuted }}>
              {isFree ? 'مجانية (0س)' : 'ساعات محسوبة'}
            </div>
          </div>
          <div className="border rounded-2xl p-3 text-center" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
            <DollarSign size={14} style={{ color: BRAND.green }} className="mx-auto mb-1" />
            <div className="text-xs font-black font-mono" style={{ color: BRAND.green }}>
              {rate}
            </div>
            <div className="text-[8px] font-bold mt-0.5" style={{ color: BRAND.slateMuted }}>
              سعر الساعة
            </div>
          </div>
        </div>

        {/* وقت الدخول والخروج */}
        <div className="border rounded-2xl p-3.5 space-y-2.5" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-xs font-black font-mono text-emerald-400">
                {formatTimeOnly(startDate)}
              </span>
            </div>
            <span className="text-[10px] font-bold" style={{ color: BRAND.slateMuted }}>وقت الدخول</span>
          </div>

          <div className="border-t border-dashed" style={{ borderColor: BRAND.border }} />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              <span className="text-xs font-black font-mono text-red-400">
                {formatTimeOnly(endDate)}
              </span>
            </div>
            <span className="text-[10px] font-bold" style={{ color: BRAND.slateMuted }}>وقت الخروج</span>
          </div>

          <div className="rounded-xl p-2 text-center border" style={{ background: BRAND.navy, borderColor: BRAND.border }}>
            <span className="text-[10px] font-bold" style={{ color: BRAND.slateMuted }}>
              إجمالي وقت الركن:{' '}
              <span className="text-white font-black font-mono">
                {totalMinutes} دقيقة
              </span>
            </span>
          </div>
        </div>

        {/* سعر خاص إن وجد */}
        {garage && rate !== garage.basePrice && (
          <div className="border rounded-xl p-2.5 text-center" style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.2)' }}>
            <p className="text-[9.5px] font-bold text-amber-400">
              💰 تم تطبيق سعر خاص: {rate} ج.م/ساعة بدلاً من {garage.basePrice} ج.م
            </p>
          </div>
        )}

        {/* رقم المعاملة المرجعي */}
        <div className="text-center py-1">
          <span className="text-[8.5px] font-mono" style={{ color: BRAND.slateMuted }}>
            رقم الجلسة: {lastSession.id.slice(0, 12)}...
          </span>
        </div>

        {/* أزرار الإجراءات */}
        <div className="space-y-2 pt-1">
          <button
            onClick={copySessionDetails}
            className="w-full border-0 py-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer text-white active:scale-[0.98] transition-all"
            style={{ background: BRAND.blue, boxShadow: `0 4px 14px ${BRAND.blue}25` }}
          >
            <Copy size={14} />
            نسخ إيصال الجلسة
          </button>

          <button
            onClick={() => setScreen('list')}
            className="w-full border py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer bg-transparent active:scale-[0.98] transition-all"
            style={{ color: BRAND.slateMuted, borderColor: BRAND.border }}
          >
            <ArrowRight size={14} />
            العودة للرئيسية
          </button>
        </div>

      </div>
    </motion.div>
  );
}