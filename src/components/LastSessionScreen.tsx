import React, { useMemo, useState } from 'react';
import {
  Clock,
  MapPin,
  Receipt,
  Copy,
  Check,
  Zap,
  LogIn,
  LogOut,
  Home,
  Car,
  Calendar,
  CheckCircle2,
  Hash,
  ShieldCheck,
} from 'lucide-react';
import { useStore, normalizePlate, normalizePhone, BOOKING_FEE } from '../store';

const BRAND = {
  blue: '#1656b8',
  blueDark: '#0f3d85',
  blueLight: '#e8f0fe',
  blueSoft: 'rgba(22, 86, 184, 0.08)',
  green: '#8cc63f',
  greenDark: '#6ea62a',
  greenLight: 'rgba(140, 198, 63, 0.12)',
  navy: '#0a1628',
  cream: '#fafbfc',
  paper: '#ffffff',
  ink: '#1a2744',
  inkMuted: '#64748b',
  inkSoft: '#94a3b8',
  divider: 'rgba(22, 86, 184, 0.12)',
  bg: '#f4f7fc',
};

/* ─── Helper: توحيد تحويل الوقت ─── */
const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDuration = (seconds: number): string => {
  if (!seconds || seconds < 0) return '0 دقيقة';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h} ساعة ${m} دقيقة`;
  if (h > 0) return `${h} ساعة`;
  return `${m} دقيقة`;
};

export default function LastSessionScreen() {
  const { sessions, garages, currentUser, acknowledgeSession, setScreen, setSelectedGarageId } = useStore();
  const [copied, setCopied] = useState(false);

  const userPlate = normalizePlate(currentUser?.carPlate);
  const userPhone = currentUser?.phone ? normalizePhone(currentUser.phone) : '';

  /* ⚡ البحث عن آخر جلسة مكتملة في لفة واحدة بدون Filter أو Sort (حماية الـ RAM والبطارية) */
  const lastSession = useMemo(() => {
    if (!userPlate && !userPhone) return null;

    let latest: (typeof sessions)[number] | null = null;
    let maxEndTime = -1;

    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      if (!s || s.status !== 'completed') continue;

      const samePlate = !!userPlate && normalizePlate(s.carPlate) === userPlate;
      const sPhone = (s as any).customerPhone ? normalizePhone((s as any).customerPhone) : '';
      const samePhone = Boolean(userPhone && sPhone === userPhone);

      if (samePlate || samePhone) {
        const endMs = toMs(s.endTime);
        if (endMs > maxEndTime) {
          maxEndTime = endMs;
          latest = s;
        }
      }
    }

    return latest;
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

  /* 🛡️ تكلفة الدرع (لو تم تفعيله في الجلسة دي) */
  const shieldCost = useMemo(() => {
    if (!lastSession) return 0;
    return Number((lastSession as any).shieldCost || (lastSession as any).shield_cost || 0);
  }, [lastSession]);

  /* رقم إيصال فاخر */
  const receiptNumber = useMemo(() => {
    if (!lastSession?.id) return '000000';
    const idStr = String(lastSession.id).replace(/[^a-zA-Z0-9]/g, '');
    return idStr.slice(-6).toUpperCase().padStart(6, '0');
  }, [lastSession?.id]);

  const handleBack = () => {
    if (lastSession?.id && acknowledgeSession) {
      acknowledgeSession(lastSession.id);
    }
    setSelectedGarageId(null);
    setScreen('list');
  };

  /* ═══════════ EMPTY STATE ═══════════ */
  if (!lastSession) {
    return (
      <div
        dir="rtl"
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: BRAND.bg }}
      >
        <div
          className="max-w-md w-full rounded-3xl p-8 text-center"
          style={{
            background: BRAND.paper,
            boxShadow: '0 10px 40px rgba(22, 86, 184, 0.08), 0 0 0 1px rgba(22, 86, 184, 0.06)',
          }}
        >
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{
              background: `linear-gradient(135deg, ${BRAND.blueSoft} 0%, ${BRAND.greenLight} 100%)`,
            }}
          >
            <Receipt className="w-10 h-10" style={{ color: BRAND.blue }} />
          </div>
          <h2 className="text-2xl font-black mb-2" style={{ color: BRAND.ink }}>
            لا توجد جلسة سابقة
          </h2>
          <p className="text-sm font-bold mb-6" style={{ color: BRAND.inkMuted }}>
            لم تقم بأي جلسة ركن حتى الآن
          </p>
          <button
            onClick={handleBack}
            className="w-full py-4 rounded-2xl font-black text-white text-base transition-all active:scale-95 border-0 cursor-pointer flex items-center justify-center gap-2"
            style={{
              background: `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueDark} 100%)`,
              boxShadow: '0 6px 20px rgba(22, 86, 184, 0.3)',
            }}
          >
            <Home size={18} />
            العودة للرئيسية
          </button>
        </div>
      </div>
    );
  }

  const startMs = toMs(lastSession.startTime);
  const endMs = toMs(lastSession.endTime) || (startMs > 0 ? Date.now() : 0);
  const durationSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));

  const entryTime = new Date(startMs > 0 ? startMs : Date.now());
  const exitTime = new Date(endMs > 0 ? endMs : Date.now());

  const formatDateFull = (date: Date) => {
    if (!date || isNaN(date.getTime())) return '---';
    return date.toLocaleDateString('ar-EG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  };

  const formatTimeOnly = (date: Date) => {
    if (!date || isNaN(date.getTime())) return '--:--';
    return date.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const copySessionDetails = async () => {
    const text = `
🅿️ إيصال Park'n 24
━━━━━━━━━━━━━━━
رقم الإيصال: #${receiptNumber}

الجراج: ${garage?.name || 'غير محدد'}
المنطقة: ${garage?.area || '-'}
السيارة: ${lastSession.carPlate || '-'}

الدخول: ${formatDateFull(entryTime)} - ${formatTimeOnly(entryTime)}
الخروج: ${formatDateFull(exitTime)} - ${formatTimeOnly(exitTime)}
المدة: ${formatDuration(durationSeconds)}
${isVip ? `\nرسوم حجز VIP: ${BOOKING_FEE} ج.م (من المحفظة)` : ''}${shieldCost > 0 ? `\n🛡️ درع حماية السيارة: ${shieldCost} ج.م (من المحفظة)` : ''}
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

  return (
    <div dir="rtl" className="min-h-screen pb-8" style={{ background: BRAND.bg }}>
      {/* ═══════════════════════════════════
          🎨 HEADER برندي فاخر (مُصغّر)
          ═══════════════════════════════════ */}
      <div
        className="relative overflow-hidden px-5 pt-5 pb-12"
        style={{
          background: `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueDark} 100%)`,
        }}
      >
        {/* إضاءة زخرفية ثابتة */}
        <div
          className="absolute top-0 left-0 w-64 h-64 rounded-full pointer-events-none opacity-25"
          style={{
            background: `radial-gradient(circle, ${BRAND.green} 0%, transparent 60%)`,
            transform: 'translate(-30%, -40%)',
          }}
        />
        <div
          className="absolute bottom-0 right-0 w-48 h-48 rounded-full pointer-events-none opacity-15"
          style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.4) 0%, transparent 60%)',
            transform: 'translate(30%, 40%)',
          }}
        />

        <div className="relative z-10 text-center">
          {/* ختم المكتملة */}
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-2"
            style={{
              background: `linear-gradient(135deg, ${BRAND.green} 0%, ${BRAND.greenDark} 100%)`,
              boxShadow: '0 8px 24px rgba(140, 198, 63, 0.4), 0 0 0 4px rgba(140, 198, 63, 0.15)',
            }}
          >
            <Check className="w-8 h-8 text-white" strokeWidth={3.5} />
          </div>

          <h1 className="text-xl font-black text-white mb-0.5">
            تمت الجلسة بنجاح
          </h1>
          <p className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.75)' }}>
            شكراً لاستخدامك Park'n 24 🙏
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════════
          🎫 الإيصال الرئيسي
          ═══════════════════════════════════ */}
      <div className="px-4 -mt-8 relative z-10 max-w-md mx-auto">
        <div
          className="rounded-[22px] relative overflow-hidden"
          style={{
            background: BRAND.paper,
            boxShadow:
              '0 20px 50px rgba(22, 86, 184, 0.15), 0 4px 12px rgba(10, 22, 40, 0.08), 0 0 0 1px rgba(22, 86, 184, 0.06)',
          }}
        >
          {/* ═══ شريط علوي أزرق ═══ */}
          <div
            className="relative px-4 py-3.5 flex items-center justify-between"
            style={{
              background: `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueDark} 100%)`,
            }}
          >
            <div
              className="absolute inset-0 opacity-30 pointer-events-none"
              style={{
                background: `radial-gradient(circle at 20% 50%, ${BRAND.green}40 0%, transparent 50%)`,
              }}
            />

            <div className="relative flex items-center gap-2">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: 'rgba(255, 255, 255, 0.18)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                }}
              >
                <Receipt size={20} className="text-white" />
              </div>
              <div className="flex flex-col items-start">
                <span
                  className="text-[9px] font-black text-white/70 uppercase"
                  style={{ letterSpacing: '1.5px' }}
                >
                  Park'n 24
                </span>
                <span className="text-sm font-black text-white">
                  إيصال ركن رسمي
                </span>
              </div>
            </div>

            <div
              className="relative flex items-center gap-1 px-2.5 py-1.5 rounded-lg"
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
              }}
            >
              <Hash size={11} className="text-white/80" />
              <span
                className="text-xs font-black text-white font-mono"
                style={{ letterSpacing: '1.5px' }}
              >
                {receiptNumber}
              </span>
            </div>
          </div>

          {/* شريط أخضر رفيع */}
          <div
            className="h-1 w-full"
            style={{
              background: `linear-gradient(90deg, ${BRAND.green} 0%, ${BRAND.greenDark} 50%, ${BRAND.green} 100%)`,
            }}
          />

          {/* ═══ جسم الإيصال ═══ */}
          <div style={{ background: BRAND.cream }}>
            {/* القسم 1: السيارة + VIP */}
            <div className="px-5 pt-4 pb-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueDark} 100%)`,
                      boxShadow: '0 4px 12px rgba(22, 86, 184, 0.25)',
                    }}
                  >
                    <Car size={22} className="text-white" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span
                      className="text-[10px] font-black uppercase"
                      style={{ color: BRAND.inkSoft, letterSpacing: '1.2px' }}
                    >
                      رقم المركبة
                    </span>
                    <span
                      className="text-lg font-black font-mono truncate"
                      style={{ color: BRAND.ink, letterSpacing: '2px' }}
                    >
                      {lastSession.carPlate || '---'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {shieldCost > 0 && (
                    <span
                      className="text-[10px] px-2.5 py-1.5 rounded-lg font-black text-white flex items-center gap-1"
                      style={{
                        background: `linear-gradient(135deg, ${BRAND.green} 0%, ${BRAND.greenDark} 100%)`,
                        boxShadow: '0 2px 8px rgba(140, 198, 63, 0.3)',
                      }}
                    >
                      <ShieldCheck size={11} /> محمية
                    </span>
                  )}
                  {isVip && (
                    <span
                      className="text-[10px] px-2.5 py-1.5 rounded-lg font-black text-white flex items-center gap-1"
                      style={{
                        background: `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueDark} 100%)`,
                        boxShadow: '0 2px 8px rgba(22, 86, 184, 0.3)',
                      }}
                    >
                      <Zap size={11} fill="currentColor" /> VIP
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* فاصل منقّط */}
            <div className="relative px-5">
              <div
                className="border-t-2 border-dashed"
                style={{ borderColor: BRAND.divider }}
              />
              <div
                className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full"
                style={{ background: BRAND.bg }}
              />
              <div
                className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full"
                style={{ background: BRAND.bg }}
              />
            </div>

            {/* القسم 2: الجراج + التاريخ */}
            {garage && (
              <div className="px-5 py-3">
                <div className="flex items-start gap-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${BRAND.green} 0%, ${BRAND.greenDark} 100%)`,
                      boxShadow: '0 4px 12px rgba(140, 198, 63, 0.3)',
                    }}
                  >
                    <MapPin size={22} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span
                      className="text-[10px] font-black uppercase block"
                      style={{ color: BRAND.inkSoft, letterSpacing: '1.2px' }}
                    >
                      مكان الركن
                    </span>
                    <span
                      className="text-base font-black block truncate"
                      style={{ color: BRAND.ink }}
                    >
                      {garage.name}
                    </span>
                    {garage.area && (
                      <span
                        className="text-xs font-bold block mt-0.5"
                        style={{ color: BRAND.inkMuted }}
                      >
                        {garage.area}
                      </span>
                    )}
                    <div className="flex items-center gap-1 mt-1">
                      <Calendar size={11} style={{ color: BRAND.inkSoft }} />
                      <span
                        className="text-[11px] font-bold"
                        style={{ color: BRAND.inkMuted }}
                      >
                        {formatDateFull(entryTime)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* فاصل منقّط */}
            <div className="relative px-5">
              <div
                className="border-t-2 border-dashed"
                style={{ borderColor: BRAND.divider }}
              />
              <div
                className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full"
                style={{ background: BRAND.bg }}
              />
              <div
                className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full"
                style={{ background: BRAND.bg }}
              />
            </div>

            {/* ═══ المدة الكلية — البطل (مُصغّر) ═══ */}
            <div className="px-4 py-3">
              <div
                className="rounded-xl p-3 text-center relative overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueDark} 100%)`,
                  boxShadow: '0 6px 18px rgba(22, 86, 184, 0.28)',
                }}
              >
                <div
                  className="absolute -top-8 -left-8 w-28 h-28 rounded-full pointer-events-none opacity-35"
                  style={{
                    background: `radial-gradient(circle, ${BRAND.green}50 0%, transparent 70%)`,
                  }}
                />
                <div
                  className="absolute -bottom-8 -right-8 w-28 h-28 rounded-full pointer-events-none opacity-20"
                  style={{
                    background: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)',
                  }}
                />

                <div className="relative flex items-center justify-center gap-1.5 mb-1">
                  <Clock size={13} className="text-white/85" />
                  <span
                    className="text-[10px] font-black uppercase text-white/85"
                    style={{ letterSpacing: '1.5px' }}
                  >
                    إجمالي مدة الركن
                  </span>
                </div>
                <div
                  className="relative font-black text-[26px] text-white leading-none"
                  style={{
                    letterSpacing: '-0.5px',
                    textShadow: '0 2px 8px rgba(0,0,0,0.25)',
                  }}
                >
                  {formatDuration(durationSeconds)}
                </div>
              </div>
            </div>

            {/* ═══ الدخول + الخروج (مُصغّر) ═══ */}
            <div className="px-4 pb-4">
              <div className="grid grid-cols-2 gap-2">
                {/* الدخول */}
                <div
                  className="rounded-lg p-2.5 text-center border"
                  style={{
                    background: BRAND.paper,
                    borderColor: 'rgba(140, 198, 63, 0.3)',
                    boxShadow: '0 1px 4px rgba(140, 198, 63, 0.08)',
                  }}
                >
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <LogIn size={11} style={{ color: BRAND.greenDark }} />
                    <span
                      className="text-[9px] font-black uppercase"
                      style={{ color: BRAND.greenDark, letterSpacing: '0.8px' }}
                    >
                      الدخول
                    </span>
                  </div>
                  <span
                    className="text-base font-black font-mono block"
                    style={{ color: BRAND.ink, letterSpacing: '1px' }}
                  >
                    {formatTimeOnly(entryTime)}
                  </span>
                </div>

                {/* الخروج */}
                <div
                  className="rounded-lg p-2.5 text-center border"
                  style={{
                    background: BRAND.paper,
                    borderColor: 'rgba(22, 86, 184, 0.25)',
                    boxShadow: '0 1px 4px rgba(22, 86, 184, 0.08)',
                  }}
                >
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <LogOut size={11} style={{ color: BRAND.blue }} />
                    <span
                      className="text-[9px] font-black uppercase"
                      style={{ color: BRAND.blue, letterSpacing: '0.8px' }}
                    >
                      الخروج
                    </span>
                  </div>
                  <span
                    className="text-base font-black font-mono block"
                    style={{ color: BRAND.ink, letterSpacing: '1px' }}
                  >
                    {formatTimeOnly(exitTime)}
                  </span>
                </div>
              </div>
            </div>

            {/* ═══ VIP: رسوم الحجز ═══ */}
            {isVip && (
              <>
                <div className="relative px-5">
                  <div
                    className="border-t-2 border-dashed"
                    style={{ borderColor: BRAND.divider }}
                  />
                  <div
                    className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full"
                    style={{ background: BRAND.bg }}
                  />
                  <div
                    className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full"
                    style={{ background: BRAND.bg }}
                  />
                </div>

                <div
                  className="px-5 py-3 flex items-center justify-between"
                  style={{
                    background: `linear-gradient(90deg, ${BRAND.blueSoft} 0%, ${BRAND.greenLight} 100%)`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} style={{ color: BRAND.green }} />
                    <span className="text-xs font-black" style={{ color: BRAND.ink }}>
                      رسوم الحجز مدفوعة
                    </span>
                  </div>
                  <span
                    className="text-sm font-black text-white font-mono px-3 py-1 rounded-md"
                    style={{
                      background: `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueDark} 100%)`,
                      boxShadow: '0 2px 6px rgba(22, 86, 184, 0.3)',
                    }}
                  >
                    {BOOKING_FEE} ج.م
                  </span>
                </div>
              </>
            )}

            {/* ═══ 🛡️ درع حماية السيارة ═══ */}
            {shieldCost > 0 && (
              <>
                <div className="relative px-5">
                  <div
                    className="border-t-2 border-dashed"
                    style={{ borderColor: BRAND.divider }}
                  />
                  <div
                    className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full"
                    style={{ background: BRAND.bg }}
                  />
                  <div
                    className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full"
                    style={{ background: BRAND.bg }}
                  />
                </div>

                <div
                  className="px-5 py-3 flex items-center justify-between"
                  style={{
                    background: `linear-gradient(90deg, rgba(140, 198, 63, 0.08) 0%, rgba(140, 198, 63, 0.18) 100%)`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} style={{ color: BRAND.green }} />
                    <div className="flex flex-col">
                      <span className="text-xs font-black" style={{ color: BRAND.ink }}>
                        درع حماية السيارة
                      </span>
                      <span className="text-[9px] font-bold" style={{ color: BRAND.inkMuted }}>
                        تم تفعيله طوال مدة الركن
                      </span>
                    </div>
                  </div>
                  <span
                    className="text-sm font-black text-white font-mono px-3 py-1 rounded-md"
                    style={{
                      background: `linear-gradient(135deg, ${BRAND.green} 0%, ${BRAND.greenDark} 100%)`,
                      boxShadow: '0 2px 6px rgba(140, 198, 63, 0.3)',
                    }}
                  >
                    {shieldCost} ج.م
                  </span>
                </div>
              </>
            )}

            {/* ═══ 💰 الإجمالي (لو فيه رسوم) ═══ */}
            {(isVip || shieldCost > 0) && (
              <>
                <div className="relative px-5">
                  <div
                    className="border-t-2 border-dashed"
                    style={{ borderColor: BRAND.divider }}
                  />
                  <div
                    className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full"
                    style={{ background: BRAND.bg }}
                  />
                  <div
                    className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full"
                    style={{ background: BRAND.bg }}
                  />
                </div>

                <div
                  className="px-5 py-3 flex items-center justify-between"
                  style={{
                    background: `linear-gradient(135deg, ${BRAND.navy} 0%, #1a2744 100%)`,
                  }}
                >
                  <span className="text-xs font-black text-white/80 uppercase tracking-wider">
                    الإجمالي المخصوم
                  </span>
                  <span className="text-lg font-black font-mono text-white">
                    {(isVip ? BOOKING_FEE : 0) + shieldCost} ج.م
                  </span>
                </div>
              </>
            )}

            {/* ═══ Footer برندينج ═══ */}
            <div
              className="px-5 py-2.5 flex items-center justify-center gap-2 border-t"
              style={{
                background: BRAND.paper,
                borderColor: BRAND.divider,
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: BRAND.green }}
              />
              <span
                className="text-[10px] font-black uppercase"
                style={{ color: BRAND.inkSoft, letterSpacing: '1.5px' }}
              >
                Park'n 24 — اركن بسرعة وريّح بالك
              </span>
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: BRAND.blue }}
              />
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════
            🎯 الأزرار الاحترافية
            ═══════════════════════════════════ */}
        <div className="space-y-2.5 pt-4">
          {/* زر النسخ */}
          <button
            onClick={copySessionDetails}
            className="w-full py-3.5 rounded-2xl font-black text-base transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            style={{
              background: copied
                ? `linear-gradient(135deg, ${BRAND.green} 0%, ${BRAND.greenDark} 100%)`
                : BRAND.paper,
              border: copied ? 'none' : `2px solid ${BRAND.divider}`,
              color: copied ? '#ffffff' : BRAND.ink,
              boxShadow: copied
                ? '0 6px 20px rgba(140, 198, 63, 0.35)'
                : '0 2px 8px rgba(22, 86, 184, 0.08)',
            }}
          >
            {copied ? (
              <>
                <Check className="w-5 h-5" strokeWidth={3} />
                تم نسخ الإيصال بنجاح
              </>
            ) : (
              <>
                <Copy className="w-5 h-5" />
                نسخ تفاصيل الإيصال
              </>
            )}
          </button>

          {/* زر العودة الرئيسي */}
          <button
            onClick={handleBack}
            className="w-full py-3.5 rounded-2xl font-black text-white text-base transition-all active:scale-95 border-0 cursor-pointer flex items-center justify-center gap-2"
            style={{
              background: `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueDark} 100%)`,
              boxShadow: '0 8px 24px rgba(22, 86, 184, 0.35)',
            }}
          >
            <Home size={20} />
            العودة للصفحة الرئيسية
          </button>
        </div>
      </div>
    </div>
  );
}