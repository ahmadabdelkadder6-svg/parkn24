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
  Coins,
} from 'lucide-react';
import { useStore, calculateSessionPrice, calculateTierRefund } from '../store';
import { formatTime } from '../utils/pricing';
import toast from 'react-hot-toast';
import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

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
   ██  LAST SESSION SCREEN (تفاصيل آخر جلسة)
   ════════════════════════════════════════════════════════════ */
export default function LastSessionScreen() {
  const { sessions, garages, currentUser, setScreen, fetchAll } = useStore();

  const userPlate = (currentUser?.carPlate ?? '').trim().toUpperCase();

  /* ✅ البحث بـ carPlate أو customerPhone لآخر جلسة مكتملة */
  const lastSession = sessions
    .filter(
      (s) =>
        s.status === 'completed' &&
        (s.carPlate.trim().toUpperCase() === userPlate ||
          (s as any).customerPhone === currentUser?.phone),
    )
    .sort((a, b) => toMs(b.endTime) - toMs(a.endTime))[0];

  const garage = lastSession
    ? garages.find((g) => g.id === lastSession.garageId)
    : null;

  /* ── Ref ── */
  const realtimeChannelRef = useRef<any>(null);

  /* ─────────────────────────────────────────────
     ██  REALTIME
     ───────────────────────────────────────────── */
  useEffect(() => {
    if (!userPlate && !currentUser?.phone) return;

    fetchAll();

    const garageId = lastSession?.garageId ?? null;

    const channel = supabase
      .channel(`last-session-${userPlate || currentUser?.phone}`)
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
          if (!row) {
            await fetchAll();
            return;
          }

          const plate = (row.car_plate ?? '').trim().toUpperCase();
          const phone = row.customer_phone ?? '';
          const isMySession =
            plate === userPlate ||
            (currentUser?.phone && phone === currentUser.phone);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPlate, currentUser?.phone]);

  /* ─── لا توجد جلسات ─── */
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

  /* ── الحسابات والبيانات اللحظية للجلسة المحددة ── */
  const startTime = toMs(lastSession.startTime);
  const endTime = toMs(lastSession.endTime);
  const durationMs = endTime - startTime;
  
  const elapsedSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const totalMinutes = Math.floor(elapsedSeconds / 60);
  
  const rate = Number(lastSession.agreedPrice ?? garage?.basePrice ?? 0);
  const isFirstFree = lastSession.isFirstFreeSession ?? false;
  
  // استخدام دالة الحساب الموحدة من الـ store لضمان مطابقة العداد للفواتير
  const { totalPrice: originalCalculatedPrice, freeHours, chargeableHours } = calculateSessionPrice(
    durationMs,
    rate,
    isFirstFree
  );

  // السعر الأساسي المستحق قبل تطبيق الكاش باك (مستحق الركنة)
  const baseCost = isFirstFree ? originalCalculatedPrice : Math.max(rate, Math.ceil(elapsedSeconds / 3600) * rate);

  // قيمة الكاش باك المسترجعة فعلياً
  const refundAmount = Number(lastSession.refundAmount ?? 0);

  // إجمالي السعر النهائي المدفوع بعد الخصم
  const finalCost = lastSession.totalPrice != null ? Number(lastSession.totalPrice) : Math.max(0, baseCost - refundAmount);

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
      second: '2-digit',
    });

  const getPaymentInfo = (method?: string) => {
    switch (method) {
      case 'cash':
        return {
          label: 'نقدي كاش', icon: '💵',
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
        };
      case 'instapay':
        return {
          label: 'إرسال إنستاباي', icon: '📱',
          color: 'text-purple-400',
          bg: 'bg-purple-500/10',
          border: 'border-purple-500/30',
        };
      case 'wallet':
        return {
          label: 'خصم من المحفظة', icon: '👝',
          color: 'text-blue-400',
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/30',
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
          label: 'غير محدد', icon: '💳',
          color: 'text-slate-400',
          bg: 'bg-slate-500/10',
          border: 'border-slate-500/30',
        };
    }
  };

  const paymentInfo = getPaymentInfo(lastSession.paymentMethod);

  const sourceInfo =
    lastSession.source === 'app'
      ? { label: 'عبر التطبيق', color: 'text-blue-400', bg: 'bg-blue-500/20' }
      : { label: 'إضافة يدوية', color: 'text-amber-400', bg: 'bg-amber-500/20' };

  /* ── نسخ التفاصيل لتسهيل إرسالها للعميل ── */
  const copySessionDetails = async () => {
    const details = `🧾 تفاصيل فاتورة الركنة
━━━━━━━━━━━━━━━━━━
🚗 رقم السيارة: ${lastSession.carPlate}
🅿️ الجراج: ${garage?.name || 'غير محدد'}
📍 الموقع: ${garage?.location || 'غير محدد'}
━━━━━━━━━━━━━━━━━━
📅 التاريخ: ${formatDateTime(startDate)}
⏰ وقت الدخول: ${formatTimeOnly(startDate)}
⏰ وقت الخروج: ${formatTimeOnly(endDate)}
⏱️ المدة الفعلية: ${totalMinutes} دقيقة
━━━━━━━━━━━━━━━━━━
💰 سعر الساعة الأساسي: ${rate} ج.م
${isFirstFree ? '🎁 شارة ترحيبية: الجلسة الأولى مجانية (أول ساعة مجاناً)\n' : ''}${refundAmount > 0 ? `🔄 كاش باك مسترد للمحفظة: -${refundAmount} ج.م\n` : ''}💵 الإجمالي المدفوع: ${finalCost} ج.م
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

  /* ─────────────────────────────────────────────
     ██  RENDER
     ───────────────────────────────────────────── */
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-slate-950 text-white flex flex-col safe-top safe-bottom"
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
          فاتورة آخر ركنة
        </h2>
        <button
          onClick={copySessionDetails}
          className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 active:scale-90 transition-all"
        >
          <Copy size={18} className="text-blue-400" />
        </button>
      </div>

      {/* ══ Content ══ */}
      <div className="flex-1 px-4 pb-4 overflow-y-auto space-y-4">

        {/* التاريخ والوقت اليومي */}
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

        {/* ✅ شاشة الفاتورة الإجمالية - Premium Edition (متوافقة بالكامل مع النظام الترحيبي والكاش باك) */}
        <div
          className="relative overflow-hidden rounded-3xl p-6 text-center"
          style={{
            background: 'linear-gradient(145deg, #0C1222 0%, #0A0F1E 50%, #0D1527 100%)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {/* لمسات الضوء الخلفية */}
          <div
            className="absolute -top-20 -right-20"
            style={{
              width: 200,
              height: 200,
              borderRadius: '50%',
              background: isFirstFree
                ? 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)' // لون أخضر للجلسة المجانية
                : 'radial-gradient(circle, rgba(212,175,55,0.08) 0%, transparent 70%)',
              filter: 'blur(30px)',
            }}
          />

          {/* أيقونة الحالة (هدية للجلسة الأولى / عملة للكاش باك التراكمي) */}
          <div
            className="relative z-10 mx-auto mb-3"
            style={{
              width: 46,
              height: 46,
              borderRadius: '50%',
              background: isFirstFree 
                ? 'linear-gradient(135deg, #10B981 0%, #34D399 100%)'
                : 'linear-gradient(135deg, #D4AF37 0%, #F5D060 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isFirstFree
                ? '0 4px 20px rgba(16,185,129,0.3)'
                : '0 4px 20px rgba(212,175,55,0.3)',
            }}
          >
            {isFirstFree ? <Gift size={20} className="text-white" /> : <Coins size={20} className="text-white" />}
          </div>

          {/* عنوان الفاتورة */}
          <div
            className="relative z-10 mb-2"
            style={{
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: '1px',
              background: isFirstFree
                ? 'linear-gradient(135deg, #FFFFFF 0%, #34D399 100%)'
                : 'linear-gradient(135deg, #FFFFFF 0%, #D4AF37 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {isFirstFree ? 'هدية ترحيبية: جلسة مجانية' : 'إجمالي الحساب الصافي'}
          </div>

          {/* تفصيل الحساب بالخطوط الصغيرة لتوضيح كيفية الخصم والجمع */}
          <div className="relative z-10 text-[11px] text-slate-400 space-y-1 my-3 bg-slate-950/60 p-3 rounded-2xl border border-slate-900">
            <div className="flex justify-between">
              <span>تكلفة الركنة الفعلية:</span>
              <span className="font-mono text-white">{baseCost} ج.م</span>
            </div>
            
            {isFirstFree && (
              <div className="flex justify-between text-emerald-400">
                <span>خصم أول ساعة مجانية:</span>
                <span className="font-bold">- {baseCost - finalCost} ج.م</span>
              </div>
            )}

            {refundAmount > 0 && (
              <div className="flex justify-between text-blue-400">
                <span>خصم كاش باك المحفظة (الشرائح):</span>
                <span className="font-bold">- {refundAmount} ج.م</span>
              </div>
            )}
          </div>

          {/* الرقم الرئيسي والنهائي المدفوع */}
          <div className="relative z-10 flex flex-col items-center justify-center mb-4">
            <div className="flex items-end justify-center gap-3 mb-2">
              <span
                className="font-mono"
                style={{
                  fontSize: 64,
                  fontWeight: 900,
                  lineHeight: 1,
                  color: '#FFFFFF',
                  textShadow: '0 0 30px rgba(255,255,255,0.15), 0 4px 12px rgba(0,0,0,0.3)',
                  letterSpacing: '-2px',
                }}
              >
                {finalCost.toFixed(0)}
              </span>
              <span
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: isFirstFree ? '#34D399' : '#D4AF37',
                  marginBottom: 8,
                  textShadow: '0 0 10px rgba(212,175,55,0.3)',
                }}
              >
                ج.م
              </span>
            </div>

            {/* شارة السداد بالخط الملون العريض والواضح جداً */}
            <div 
              className={`mt-1 inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl border-2 ${paymentInfo.bg} ${paymentInfo.border} shadow-lg`}
              style={{ backdropFilter: 'blur(8px)' }}
            >
              <span className="text-2xl leading-none">{paymentInfo.icon}</span>
              <span 
                className={`font-black tracking-wider ${paymentInfo.color}`} 
                style={{ 
                  fontWeight: 900, 
                  fontSize: '14px',
                  textShadow: '0 1px 3px rgba(0,0,0,0.3)'
                }}
              >
                تم السداد: {paymentInfo.label}
              </span>
            </div>
          </div>

          {/* سطر توضيحي لحساب الساعات */}
          <div className="relative z-10 text-[10px] text-slate-500 mb-2 font-mono">
            مدة الحساب: {Math.max(1, Math.ceil(elapsedSeconds / 3600))} ساعة × {rate} ج.م
          </div>
        </div>

        {/* تفاصيل الوقت والعدادات السفلية */}
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
              {Math.max(1, Math.ceil(elapsedSeconds / 3600))}
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

        {/* تفاصيل أوقات الدخول والخروج الفعلي */}
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

        {/* تنبيه خاص بالسعر المتغير أو العروض الترويجية */}
        {garage && rate !== garage.basePrice && (
          <div className="bg-amber-600/10 border border-amber-500/20 rounded-xl p-3 text-center">
            <p className="text-[10px] text-amber-400 font-bold">
              💰 تم تطبيق سعر خاص: {rate} ج.م/ساعة بدلاً من {garage.basePrice} ج.م/ساعة
            </p>
          </div>
        )}

        {/* رقم الفاتورة والعملية للتأكيد */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 text-center">
          <span className="text-[9px] text-slate-600 font-mono">
            رقم الفاتورة المرجعي: {lastSession.id.slice(0, 8)}...
          </span>
        </div>

        {/* زر نسخ الفاتورة */}
        <button
          onClick={copySessionDetails}
          className="w-full bg-blue-600/20 border border-blue-500/20 text-blue-400 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <Copy size={16} />
          نسخ تفاصيل الفاتورة
        </button>

        {/* زر العودة للقائمة */}
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