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
import { useStore, ParkingSession, Garage } from '../store';
import { calculateFullHours, calculateCost, formatTime } from '../utils/pricing';
import toast from 'react-hot-toast';
import { useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';

/* ─── Helper: توحيد تحويل الوقت ─── */
const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

/* ─── Helper: [إصلاح #1] بصمة اللوحة الموحدة الصارمة ─── */
const normalizePlate = (plate?: string): string => {
  if (!plate) return '';
  let cleaned = plate.trim();

  // رفض الحروف الإنجليزية
  if (/[a-zA-Z]/.test(cleaned)) return '';

  // تحويل الأرقام العربية والفارسية
  cleaned = cleaned
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶٧٨٩'.indexOf(d)));

  // توحيد الحروف المتشابهة
  const charMap: Record<string, string> = {
    'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ء': 'ا',
    'ة': 'ت',
    'ى': 'ي', 'ئ': 'ي',
    'ؤ': 'و',
    'پ': 'ب', 'چ': 'ج', 'ژ': 'ز', 'گ': 'ك', 'ڤ': 'ف',
    'ک': 'ك', 'ی': 'ي',
  };
  cleaned = cleaned.replace(/./g, (char) => charMap[char] || char);
  cleaned = cleaned.replace(/[^0-9\u0600-\u06FF]/g, '');

  return cleaned;
};

/* ════════════════════════════════════════════════════════════
   ██  LAST SESSION SCREEN
   ════════════════════════════════════════════════════════════ */
export default function LastSessionScreen() {
  const { sessions, garages, currentUser, setScreen, fetchAll } = useStore();

  const userPlate = normalizePlate(currentUser?.carPlate);
  const userPhone = currentUser?.phone ? currentUser.phone.replace(/[^\d+]/g, '') : '';

  /* ✅ [إصلاح #1]: البحث المطابق تماماً لبصمة اللوحة ورقم الهاتف */
  const lastSession = useMemo(() => {
    return (sessions as ParkingSession[])
      .filter((s) => {
        if (!s || s.status !== 'completed') return false;
        const samePlateMatch = !!userPlate && normalizePlate(s.carPlate) === userPlate;
        const sPhone = (s as any).customerPhone ? (s as any).customerPhone.replace(/[^\d+]/g, '') : '';
        const samePhoneMatch = !!userPhone && sPhone === userPhone;
        return samePlateMatch || samePhoneMatch;
      })
      .sort((a, b) => toMs(b.endTime) - toMs(a.endTime))[0];
  }, [sessions, userPlate, userPhone]);

  const garage = lastSession
    ? (garages as Garage[]).find((g) => g.id === lastSession.garageId)
    : null;

  /* ── Ref ── */
  const realtimeChannelRef = useRef<any>(null);

  /* ─────────────────────────────────────────────
     ██  REALTIME الموثوق
     ───────────────────────────────────────────── */
  useEffect(() => {
    if (!userPlate && !userPhone) return;

    fetchAll().catch((e) => console.error('Fetch error:', e));

    const channel = supabase
      .channel(`last-session-live-${userPlate || userPhone}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sessions',
        },
        async (payload) => {
          const row = payload.new as any;
          if (!row) {
            await fetchAll();
            return;
          }

          const plate = normalizePlate(row.car_plate || row.carPlate);
          const phone = (row.customer_phone || row.customerPhone || '').replace(/[^\d+]/g, '');
          const isMySession =
            (!!userPlate && plate === userPlate) ||
            (!!userPhone && phone === userPhone);

          if (isMySession) {
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
  }, [userPlate, userPhone, fetchAll]);

  /* ─── حالة عدم وجود جلسات ─── */
  if (!lastSession) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-8 text-right"
      >
        <div className="text-5xl mb-4">📭</div>
        <p className="text-lg font-black text-white mb-2">لا توجد جلسات سابقة</p>
        <p className="text-xs text-slate-500 text-center mb-6">
          ابدأ ركن سيارتك وستظهر تفاصيل وإيصال الجلسة هنا فور انتهائها
        </p>
        <button
          onClick={() => setScreen('list')}
          className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black text-sm active:scale-95 transition-all flex items-center gap-2 shadow-lg"
        >
          <ArrowRight size={16} />
          العودة للرئيسية
        </button>
      </motion.div>
    );
  }

  /* ── Computed ── */
  const startTime = toMs(lastSession.startTime);
  const endTime = toMs(lastSession.endTime);

  const elapsedSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
  const rate = Number(lastSession.agreedPrice ?? garage?.basePrice ?? 0);
  const totalMinutes = Math.floor(elapsedSeconds / 60);

  // 🎁 منطق الهدية الترحيبية
  const isFirstFreeApplied = lastSession.isFirstFreeSession === true;
  const freeMinutesApplied = lastSession.freeMinutesApplied ?? (isFirstFreeApplied ? Math.min(60, totalMinutes) : 0);

  const billableSeconds = Math.max(0, elapsedSeconds - (freeMinutesApplied * 60));
  const billableHours = calculateFullHours(billableSeconds);

  /* ✅ [إصلاح #3]: قراءة السعر المسجل بدقة حتى لو كان 0 ج.م */
  const cost =
    lastSession.totalPrice != null
      ? Number(lastSession.totalPrice)
      : calculateCost(billableSeconds, rate);

  // حساب كم وفر العميل
  const savedAmount = useMemo(() => {
    if (!isFirstFreeApplied) return 0;
    const originalCost = calculateCost(elapsedSeconds, rate);
    return Math.max(0, originalCost - cost);
  }, [isFirstFreeApplied, elapsedSeconds, rate, cost]);

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

  /* ✅ [إصلاح #2]: دعم طريقة الدفع المجانية 'free' بالكامل */
  const getPaymentInfo = (method?: string) => {
    switch (method) {
      case 'free':
        return {
          label: 'ركن مجاني ترحيبي', icon: '🎁',
          color: 'text-amber-400',
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30',
        };
      case 'cash':
        return {
          label: 'نقدي كاش للسايس', icon: '💵',
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
        };
      case 'wallet':
        return {
          label: 'خصم من المحفظة', icon: '👝',
          color: 'text-blue-400',
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/30',
        };
      case 'instapay':
        return {
          label: 'إرسال إنستاباي', icon: '📱',
          color: 'text-purple-400',
          bg: 'bg-purple-500/10',
          border: 'border-purple-500/30',
        };
      case 'cashwallet':
        return {
          label: 'تحويل محفظة كاش', icon: '📲',
          color: 'text-orange-400',
          bg: 'bg-orange-500/10',
          border: 'border-orange-500/30',
        };
      default:
        return {
          label: cost === 0 && isFirstFreeApplied ? 'ركن مجاني ترحيبي' : 'نقدي كاش',
          icon: cost === 0 && isFirstFreeApplied ? '🎁' : '💵',
          color: cost === 0 && isFirstFreeApplied ? 'text-amber-400' : 'text-emerald-400',
          bg: cost === 0 && isFirstFreeApplied ? 'bg-amber-500/10' : 'bg-emerald-500/10',
          border: cost === 0 && isFirstFreeApplied ? 'border-amber-500/30' : 'border-emerald-500/30',
        };
    }
  };

  const paymentInfo = getPaymentInfo(lastSession.paymentMethod);

  const sourceInfo =
    lastSession.source === 'app'
      ? { label: 'حجز التطبيق', color: 'text-blue-400', bg: 'bg-blue-500/20' }
      : { label: 'مدخل الجراج', color: 'text-amber-400', bg: 'bg-amber-500/20' };

  /* ── نسخ التفاصيل ── */
  const copySessionDetails = async () => {
    const details = `🧾 تفاصيل إيصال الركن
━━━━━━━━━━━━━━━━━━
🚗 رقم السيارة: ${lastSession.carPlate}
🅿️ الجراج: ${garage?.name || 'غير محدد'}
📍 الموقع: ${garage?.location || 'غير محدد'}
━━━━━━━━━━━━━━━━━━
📅 التاريخ: ${formatDateTime(startDate)}
⏰ وقت الدخول: ${formatTimeOnly(startDate)}
⏰ وقت الخروج: ${formatTimeOnly(endDate)}
⏱️ المدة الفعلية: ${totalMinutes} دقيقة
${isFirstFreeApplied ? `🎁 عرض ترحيبي: خصم أول ساعة مجاناً (-${savedAmount.toFixed(0)} ج.م)\n` : ''}⏱️ الساعات المحسوبة للدفع: ${billableHours} ساعة
━━━━━━━━━━━━━━━━━━
💰 سعر الساعة: ${rate} ج.م
💵 الإجمالي المدفوع: ${cost.toFixed(0)} ج.م
💳 طريقة السداد: ${paymentInfo.label}
📋 نوع الحجز: ${sourceInfo.label}`;

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
      toast.success('تم نسخ تفاصيل الإيصال 📋');
    } catch {
      toast.error('فشل النسخ');
    }
  };

  /* ─────────────────────────────────────────────
     ██  RENDER
     ───────────────────────────────────────────── */
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-slate-950 text-white flex flex-col safe-top safe-bottom text-right"
    >
      {/* ══ Header ══ */}
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
          title="نسخ الإيصال"
        >
          <Copy size={18} className="text-blue-400" />
        </button>
      </div>

      {/* ══ Content ══ */}
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

        {/* ✅ التكلفة الإجمالية - بطاقة فخمة */}
        <div
          className="relative overflow-hidden rounded-3xl p-6 text-center"
          style={{
            background: 'linear-gradient(145deg, #0C1222 0%, #0A0F1E 50%, #0D1527 100%)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div
            className="relative z-10 mx-auto mb-3"
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #D4AF37 0%, #F5D060 50%, #D4AF37 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(212,175,55,0.3)',
            }}
          >
            <span style={{ fontSize: 20 }}>💰</span>
          </div>

          <div
            className="relative z-10 mb-4"
            style={{
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: '1px',
              background: 'linear-gradient(135deg, #FFFFFF 0%, #D4AF37 50%, #FFFFFF 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            إجمالي المدفوع
          </div>

          <div className="relative z-10 flex flex-col items-center justify-center mb-4">
            <div className="flex items-end justify-center gap-2 mb-2">
              <span
                className="font-mono"
                style={{
                  fontSize: 56,
                  fontWeight: 900,
                  lineHeight: 1,
                  color: '#FFFFFF',
                  letterSpacing: '-2px',
                }}
              >
                {cost.toFixed(0)}
              </span>
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: '#D4AF37',
                  marginBottom: 6,
                }}
              >
                ج.م
              </span>
            </div>

            {/* شارة طريقة السداد */}
            <div 
              className={`mt-1.5 inline-flex items-center gap-2 px-4 py-2 rounded-2xl border ${paymentInfo.bg} ${paymentInfo.border} shadow-lg mb-2`}
            >
              <span className="text-xl leading-none">{paymentInfo.icon}</span>
              <span 
                className={`font-black ${paymentInfo.color}`} 
                style={{ fontSize: '13px', fontWeight: 900 }}
              >
                تم السداد: {paymentInfo.label}
              </span>
            </div>

            {/* شارة الهدية */}
            {isFirstFreeApplied && savedAmount > 0 && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-xl text-white text-[11px] font-black shadow-md border border-white/20"
              >
                <Gift size={13} />
                <span>تم تطبيق عرض أول ساعة مجاناً! (وفرت -{savedAmount.toFixed(0)} ج.م) 🎉</span>
              </motion.div>
            )}
          </div>

          <div className="relative z-10 text-[10px] text-slate-400">
            {isFirstFreeApplied ? (
              <span>
                المدة المحسوبة: {billableHours} ساعة (تم خصم {freeMinutesApplied} دقيقة كهدية 🎁)
              </span>
            ) : (
              <span>
                {calculateFullHours(elapsedSeconds)} ساعة × {rate} ج.م = {cost.toFixed(0)} ج.م
              </span>
            )}
          </div>
        </div>

        {/* تفاصيل الوقت */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
            <Clock size={16} className="text-blue-400 mx-auto mb-1.5" />
            <div className="text-sm font-black text-white font-mono">
              {formatTime(elapsedSeconds)}
            </div>
            <div className="text-[8px] text-slate-500 font-bold mt-0.5">
              المدة الكلية
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
            <Timer size={16} className="text-purple-400 mx-auto mb-1.5" />
            <div className="text-sm font-black text-purple-400 font-mono">
              {isFirstFreeApplied ? billableHours : calculateFullHours(elapsedSeconds)}
            </div>
            <div className="text-[8px] text-slate-500 font-bold mt-0.5">
              {isFirstFreeApplied ? 'ساعات الدفع' : 'ساعة محسوبة'}
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

        {/* زر نسخ الإيصال */}
        <button
          onClick={copySessionDetails}
          className="w-full bg-blue-600/20 border border-blue-500/20 text-blue-400 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <Copy size={16} />
          نسخ تفاصيل الإيصال
        </button>

        {/* زر العودة */}
        <button
          onClick={() => setScreen('list')}
          className="w-full bg-slate-900 border border-slate-800 text-white py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <ArrowRight size={16} />
          العودة للقائمة الرئيسية
        </button>
      </div>
    </motion.div>
  );
}