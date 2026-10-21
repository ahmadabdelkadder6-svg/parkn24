import React, { useMemo, useState } from 'react';
import { Clock, DollarSign, MapPin, Timer, Receipt, ArrowRight, Copy, Check, Zap } from 'lucide-react';
import { useStore, normalizePlate, normalizePhone, BOOKING_FEE } from '../store';
import { calculateFullHours, calculateCost, formatTime } from '../utils/pricing';

const BRAND = {
  blue: '#1656b8',
  blueDark: '#0f3d85',
  blueLight: '#e8f0fe',
  blueSoft: '#f0f5ff',
  green: '#8cc63f',
  greenDark: '#6ea62a',
  greenLight: '#f2fae6',
  navy: '#0a1628',
  navyLight: '#111e36',
  slate: '#475569',
  slateMuted: '#94a3b8',
  border: '#e2e8f0',
  card: '#ffffff',
  bg: '#f4f7fc',
};

/* ─── Helper: توحيد تحويل الوقت (حماية من NaN) ─── */
const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

interface LastSessionScreenProps {
  onBack: () => void;
}

export default function LastSessionScreen({ onBack }: LastSessionScreenProps) {
  const { sessions, garages, currentUser, acknowledgeSession } = useStore();
  const [copied, setCopied] = useState(false);

  const userPlate = normalizePlate(currentUser?.carPlate);
  const userPhone = currentUser?.phone ? normalizePhone(currentUser.phone) : '';

  /* ✅ البحث عن آخر جلسة مكتملة من sessions array مباشرة
       (مش من lastSession في الـ store لأنه ممكن يكون null) */
  const lastSession = useMemo(() => {
    if (!userPlate && !userPhone) return null;
    return sessions
      .filter((s) => {
        if (!s || s.status !== 'completed') return false;
        const samePlate = !!userPlate && normalizePlate(s.carPlate) === userPlate;
        const sPhone = (s as any).customerPhone
          ? normalizePhone((s as any).customerPhone)
          : '';
        const samePhone = Boolean(userPhone && sPhone === userPhone);
        return samePlate || samePhone;
      })
      .sort((a, b) => toMs(b.endTime) - toMs(a.endTime))[0] || null;
  }, [sessions, userPlate, userPhone]);

  const garage = useMemo(
    () => (lastSession ? garages.find((g) => g.id === lastSession.garageId) : null),
    [garages, lastSession?.garageId],
  );

  const isVip = useMemo(() => {
    if (!garage) return false;
    return (
      garage.garageType === 'vip' ||
      (garage as any).is_vip === true ||
      garage.type === 'partner'
    );
  }, [garage]);

  if (!lastSession) {
    return (
      <div
        dir="rtl"
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: BRAND.bg }}
      >
        <div
          className="max-w-md w-full rounded-3xl p-8 text-center"
          style={{ background: BRAND.card, border: `1px solid ${BRAND.border}` }}
        >
          <Receipt className="w-16 h-16 mx-auto mb-4" style={{ color: BRAND.slateMuted }} />
          <h2 className="text-2xl font-bold mb-2" style={{ color: BRAND.navy }}>
            لا توجد جلسة سابقة
          </h2>
          <p className="text-base mb-6" style={{ color: BRAND.slate }}>
            لم تقم بأي جلسة ركن حتى الآن
          </p>
          <button
            onClick={onBack}
            className="w-full py-4 rounded-2xl font-bold text-white text-lg transition-all active:scale-95"
            style={{ background: BRAND.blue }}
          >
            العودة للرئيسية
          </button>
        </div>
      </div>
    );
  }

  /* ✅ استخدام startTime / endTime (مش entryTime / exitTime)
     مع حماية كاملة من NaN */
  const startMs = toMs(lastSession.startTime);
  const endMs = toMs(lastSession.endTime) || (startMs > 0 ? Date.now() : 0);
  const durationMs = Math.max(0, endMs - startMs);
  const durationSeconds = Math.max(0, Math.floor(durationMs / 1000));

  const fullHours = calculateFullHours(durationSeconds) || 0;
  const rate = Number(lastSession.agreedPrice ?? garage?.basePrice ?? 0) || 0;
  const rawCost = calculateCost(durationSeconds, rate) || 0;

  const cost =
    lastSession.totalPrice != null
      ? Number(lastSession.totalPrice) || 0
      : rawCost;

  const entryTime = new Date(startMs > 0 ? startMs : Date.now());
  const exitTime = new Date(endMs > 0 ? endMs : Date.now());

  const formatDateTime = (date: Date) => {
    if (!date || isNaN(date.getTime())) return '---';
    return date.toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const paymentInfo = useMemo(() => {
    const method = (lastSession as any).paymentMethod || 'cash';
    switch (method) {
      case 'instapay':
        return {
          label: '💳 إنستا باي',
          color: BRAND.blue,
          bg: BRAND.blueLight,
          note: 'تم الدفع عبر إنستا باي',
        };
      case 'wallet':
        return {
          label: '👛 محفظة Park\'n',
          color: BRAND.green,
          bg: BRAND.greenLight,
          note: 'تم الخصم من محفظتك',
        };
      case 'cash':
      default:
        return {
          label: '💵 كاش',
          color: BRAND.slate,
          bg: '#f1f5f9',
          note: 'دفعت كاش للجراج',
        };
    }
  }, [(lastSession as any).paymentMethod]);

  const copySessionDetails = async () => {
    const text = `
🅿️ إيصال Park'n 24
━━━━━━━━━━━━━━━
الجراج: ${garage?.name || 'غير محدد'}
المنطقة: ${garage?.area || '-'}
السيارة: ${lastSession.carPlate || '-'}

الدخول: ${formatDateTime(entryTime)}
الخروج: ${formatDateTime(exitTime)}
المدة: ${formatTime(durationSeconds)}
الساعات المحسوبة: ${fullHours}
السعر/الساعة: ${rate} ج.م
التكلفة: ${cost} ج.م
${isVip ? `رسوم حجز VIP: ${BOOKING_FEE} ج.م (من المحفظة)` : ''}
طريقة الدفع: ${paymentInfo.label}
━━━━━━━━━━━━━━━
شكراً لاستخدامك Park'n 24 🙏
    `.trim();

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Copy failed', e);
    }
  };

  const handleBack = () => {
    if (lastSession.id) {
      acknowledgeSession(lastSession.id);
    }
    onBack();
  };

  return (
    <div dir="rtl" className="min-h-screen pb-10" style={{ background: BRAND.bg }}>
      {/* Header */}
      <div
        className="px-5 pt-6 pb-10 relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${BRAND.navy} 0%, ${BRAND.navyLight} 100%)`,
        }}
      >
        <div className="relative z-10 text-center">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-3"
            style={{
              background: 'rgba(140, 198, 63, 0.15)',
              border: '2px solid rgba(140, 198, 63, 0.4)',
            }}
          >
            <Check className="w-8 h-8" style={{ color: BRAND.green }} strokeWidth={3} />
          </div>
          <h1 className="text-2xl font-black text-white mb-1">تمت الجلسة بنجاح</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>
            شكراً لاستخدامك Park'n 24 🙏
          </p>
        </div>
      </div>

      {/* Main content */}
      <div className="px-5 -mt-6 relative z-10 space-y-4 max-w-md mx-auto">
        {/* Garage card */}
        {garage && (
          <div
            className="rounded-3xl p-5 shadow-lg"
            style={{ background: BRAND.card, border: `1px solid ${BRAND.border}` }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: BRAND.blueLight }}
              >
                <MapPin className="w-6 h-6" style={{ color: BRAND.blue }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-bold text-lg" style={{ color: BRAND.navy }}>
                    {garage.name}
                  </h3>
                  {isVip && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{
                        background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`,
                        color: '#fff',
                      }}
                    >
                      <Zap className="w-3 h-3" />
                      VIP
                    </span>
                  )}
                </div>
                <p className="text-sm" style={{ color: BRAND.slate }}>
                  {garage.area}
                </p>
                {lastSession.carPlate ? (
                  <p className="text-xs mt-1" style={{ color: BRAND.slateMuted }}>
                    السيارة: {lastSession.carPlate}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* Duration big display */}
        <div
          className="rounded-3xl p-6 text-center shadow-lg"
          style={{
            background: `linear-gradient(135deg, ${BRAND.blueSoft} 0%, #fff 100%)`,
            border: `1px solid ${BRAND.border}`,
          }}
        >
          <div className="flex items-center justify-center gap-2 mb-2">
            <Clock className="w-5 h-5" style={{ color: BRAND.blue }} />
            <span className="text-sm font-semibold" style={{ color: BRAND.slate }}>
              مدة الركن الإجمالية
            </span>
          </div>
          <div
            className="text-5xl font-black tabular-nums tracking-tight"
            style={{ color: BRAND.blue }}
          >
            {formatTime(durationSeconds)}
          </div>
        </div>

        {/* 3-stats grid */}
        <div className="grid grid-cols-3 gap-3">
          <div
            className="rounded-2xl p-4 text-center"
            style={{ background: BRAND.card, border: `1px solid ${BRAND.border}` }}
          >
            <Timer className="w-5 h-5 mx-auto mb-1" style={{ color: BRAND.slate }} />
            <div className="text-xs mb-1" style={{ color: BRAND.slateMuted }}>
              الساعات
            </div>
            <div className="text-xl font-black" style={{ color: BRAND.navy }}>
              {fullHours}
            </div>
          </div>

          <div
            className="rounded-2xl p-4 text-center"
            style={{ background: BRAND.card, border: `1px solid ${BRAND.border}` }}
          >
            <DollarSign className="w-5 h-5 mx-auto mb-1" style={{ color: BRAND.slate }} />
            <div className="text-xs mb-1" style={{ color: BRAND.slateMuted }}>
              السعر/ساعة
            </div>
            <div className="text-xl font-black" style={{ color: BRAND.navy }}>
              {rate}
            </div>
          </div>

          <div
            className="rounded-2xl p-4 text-center"
            style={{ background: BRAND.greenLight, border: `1px solid ${BRAND.green}40` }}
          >
            <Receipt className="w-5 h-5 mx-auto mb-1" style={{ color: BRAND.greenDark }} />
            <div className="text-xs mb-1" style={{ color: BRAND.greenDark }}>
              التكلفة
            </div>
            <div className="text-xl font-black" style={{ color: BRAND.greenDark }}>
              {cost}
            </div>
          </div>
        </div>

        {/* Entry/Exit times */}
        <div
          className="rounded-3xl p-5 shadow-sm"
          style={{ background: BRAND.card, border: `1px solid ${BRAND.border}` }}
        >
          <div
            className="flex items-center justify-between pb-3 border-b"
            style={{ borderColor: BRAND.border }}
          >
            <div>
              <div className="text-xs mb-0.5" style={{ color: BRAND.slateMuted }}>
                وقت الدخول
              </div>
              <div className="text-sm font-bold" style={{ color: BRAND.navy }}>
                {formatDateTime(entryTime)}
              </div>
            </div>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: BRAND.blueLight }}
            >
              <ArrowRight
                className="w-4 h-4 rotate-180"
                style={{ color: BRAND.blue }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-3">
            <div>
              <div className="text-xs mb-0.5" style={{ color: BRAND.slateMuted }}>
                وقت الخروج
              </div>
              <div className="text-sm font-bold" style={{ color: BRAND.navy }}>
                {formatDateTime(exitTime)}
              </div>
            </div>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: BRAND.greenLight }}
            >
              <Check
                className="w-4 h-4"
                style={{ color: BRAND.greenDark }}
                strokeWidth={3}
              />
            </div>
          </div>
        </div>

        {/* Payment method */}
        <div
          className="rounded-2xl p-4"
          style={{
            background: paymentInfo.bg,
            border: `1px solid ${paymentInfo.color}30`,
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div
                className="text-xs mb-1"
                style={{ color: paymentInfo.color, opacity: 0.8 }}
              >
                طريقة الدفع
              </div>
              <div className="text-base font-bold" style={{ color: paymentInfo.color }}>
                {paymentInfo.label}
              </div>
              <div
                className="text-xs mt-1"
                style={{ color: paymentInfo.color, opacity: 0.75 }}
              >
                {paymentInfo.note}
              </div>
            </div>
            <div className="text-left">
              <div
                className="text-xs mb-0.5"
                style={{ color: paymentInfo.color, opacity: 0.8 }}
              >
                المبلغ المدفوع للجراج
              </div>
              <div className="text-2xl font-black" style={{ color: paymentInfo.color }}>
                {cost} <span className="text-sm">ج.م</span>
              </div>
            </div>
          </div>
        </div>

        {/* ✅ VIP booking fee — بسيط ومختصر */}
        {isVip && (
          <div
            className="rounded-2xl p-4 border text-center"
            style={{ background: BRAND.blueLight, borderColor: BRAND.blue + '30' }}
          >
            <div className="flex items-center justify-center gap-2 mb-1">
              <Zap size={16} style={{ color: BRAND.blue }} />
              <span className="font-black text-sm" style={{ color: BRAND.blueDark }}>
                تم خصم {BOOKING_FEE} ج.م رسوم الحجز
              </span>
            </div>
            <span className="text-[10px] font-bold" style={{ color: BRAND.slate }}>
              تم الخصم تلقائياً من محفظتك عند الوصول للجراج
            </span>
          </div>
        )}

        {/* Session ID */}
        {lastSession.id && (
          <div className="text-center">
            <div className="text-[10px]" style={{ color: BRAND.slateMuted }}>
              رقم الجلسة: {lastSession.id.slice(0, 8).toUpperCase()}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-3 pt-2">
          <button
            onClick={copySessionDetails}
            className="w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-95 flex items-center justify-center gap-2"
            style={{
              background: copied ? BRAND.greenLight : BRAND.card,
              border: `2px solid ${copied ? BRAND.green : BRAND.border}`,
              color: copied ? BRAND.greenDark : BRAND.navy,
            }}
          >
            {copied ? (
              <>
                <Check className="w-5 h-5" strokeWidth={3} />
                تم النسخ
              </>
            ) : (
              <>
                <Copy className="w-5 h-5" />
                نسخ تفاصيل الإيصال
              </>
            )}
          </button>

          <button
            onClick={handleBack}
            className="w-full py-4 rounded-2xl font-bold text-white text-lg transition-all active:scale-95"
            style={{
              background: `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueDark} 100%)`,
              boxShadow: `0 10px 30px -10px ${BRAND.blue}80`,
            }}
          >
            العودة للرئيسية
          </button>
        </div>
      </div>
    </div>
  );
}