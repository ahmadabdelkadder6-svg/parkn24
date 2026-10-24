import { useMemo, memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  MapPin,
  Receipt,
  Zap,
  LogIn,
  LogOut,
  Car,
  CheckCircle2,
  Hash,
  Calendar,
} from 'lucide-react';
import { useStore, normalizePlate, normalizePhone, getServerNow, BOOKING_FEE } from '../store';

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
};

const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const LastSessionCard = memo(function LastSessionCard() {
  const { sessions, garages, currentUser } = useStore();

  const userPlate = normalizePlate(currentUser?.carPlate);
  const userPhone = currentUser?.phone ? normalizePhone(currentUser.phone) : '';

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

  const isVip = useMemo(() => {
    if (!garage) return false;
    return garage.garageType === 'vip' || (garage as any).is_vip === true || garage.type === 'partner';
  }, [garage]);

  const startTime = toMs(lastSession?.startTime);
  const endTime = toMs(lastSession?.endTime) || (lastSession ? getServerNow() : 0);

  const elapsedSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
  const totalMinutes = Math.floor(elapsedSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const formatDuration = (): string => {
    if (hours > 0 && minutes > 0) return `${hours} س ${minutes} د`;
    if (hours > 0) return `${hours} ساعة`;
    return `${minutes} دقيقة`;
  };

  const startDate = useMemo(() => new Date(startTime > 0 ? startTime : getServerNow()), [startTime]);
  const endDate = useMemo(() => new Date(endTime > 0 ? endTime : getServerNow()), [endTime]);

  const formatDateShort = useCallback((date: Date) => {
    if (!date || isNaN(date.getTime())) return '---';
    return date.toLocaleDateString('ar-EG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }, []);

  const formatTimeOnly = useCallback((date: Date) => {
    if (!date || isNaN(date.getTime())) return '--:--';
    return date.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  const sourceInfo = useMemo(() => {
    return lastSession?.source === 'app'
      ? { label: 'عبر التطبيق', icon: <Zap size={10} />, color: BRAND.blue, bg: BRAND.blueSoft }
      : { label: 'ركن يدوي', icon: <Car size={10} />, color: '#b45309', bg: 'rgba(245, 158, 11, 0.1)' };
  }, [lastSession?.source]);

  const receiptNumber = useMemo(() => {
    if (!lastSession?.id) return '000000';
    const idStr = String(lastSession.id).replace(/[^a-zA-Z0-9]/g, '');
    return idStr.slice(-6).toUpperCase().padStart(6, '0');
  }, [lastSession?.id]);

  if (!lastSession) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="w-full mb-5 text-right"
      style={{ direction: 'rtl' }}
    >
      {/* ═══ عنوان القسم ═══ */}
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-black flex items-center gap-1.5" style={{ color: BRAND.ink }}>
          <Receipt size={16} style={{ color: BRAND.blue }} />
          إيصال آخر جلسة ركن
        </h3>
        <span
          className="text-[10px] font-black text-white px-2.5 py-1 rounded-full flex items-center gap-1"
          style={{
            background: `linear-gradient(135deg, ${BRAND.green} 0%, ${BRAND.greenDark} 100%)`,
            boxShadow: '0 2px 8px rgba(140, 198, 63, 0.35)',
          }}
        >
          <CheckCircle2 size={11} />
          مكتملة
        </span>
      </div>

      {/* ═══════════════════════════════════
          🎫 الإيصال الفاخر
          ═══════════════════════════════════ */}
      <div
        className="rounded-[22px] relative overflow-hidden"
        style={{
          background: BRAND.paper,
          boxShadow:
            '0 10px 40px rgba(22, 86, 184, 0.12), 0 4px 12px rgba(10, 22, 40, 0.06), 0 0 0 1px rgba(22, 86, 184, 0.08)',
        }}
      >
        {/* ═══ شريط علوي أزرق (brand header) ═══ */}
        <div
          className="relative px-4 py-3.5 flex items-center justify-between"
          style={{
            background: `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueDark} 100%)`,
          }}
        >
          {/* إضاءة زخرفية خفيفة */}
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              background: `radial-gradient(circle at 20% 50%, ${BRAND.green}30 0%, transparent 50%)`,
            }}
          />

          <div className="relative flex items-center gap-2">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{
                background: 'rgba(255, 255, 255, 0.18)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                backdropFilter: 'blur(4px)',
              }}
            >
              <Receipt size={18} className="text-white" />
            </div>
            <div className="flex flex-col items-start">
              <span className="text-[9px] font-black text-white/70 uppercase" style={{ letterSpacing: '1.5px' }}>
                Park'n 24
              </span>
              <span className="text-xs font-black text-white">
                إيصال ركن رسمي
              </span>
            </div>
          </div>

          {/* رقم الإيصال */}
          <div
            className="relative flex items-center gap-1 px-2.5 py-1.5 rounded-lg"
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
            }}
          >
            <Hash size={10} className="text-white/80" />
            <span
              className="text-[11px] font-black text-white font-mono"
              style={{ letterSpacing: '1.5px' }}
            >
              {receiptNumber}
            </span>
          </div>
        </div>

        {/* ═══ شريط أخضر رفيع (brand accent) ═══ */}
        <div
          className="h-1 w-full"
          style={{
            background: `linear-gradient(90deg, ${BRAND.green} 0%, ${BRAND.greenDark} 50%, ${BRAND.green} 100%)`,
          }}
        />

        {/* ═══ الجسم الأبيض ═══ */}
        <div style={{ background: BRAND.cream }}>
          {/* القسم 1: السيارة + المصدر */}
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueDark} 100%)`,
                    boxShadow: '0 4px 12px rgba(22, 86, 184, 0.25)',
                  }}
                >
                  <Car size={20} className="text-white" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span
                    className="text-[9px] font-black uppercase"
                    style={{ color: BRAND.inkSoft, letterSpacing: '1.2px' }}
                  >
                    رقم المركبة
                  </span>
                  <span
                    className="text-base font-black font-mono truncate"
                    style={{ color: BRAND.ink, letterSpacing: '2px' }}
                  >
                    {lastSession.carPlate}
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1 shrink-0">
                {isVip && (
                  <span
                    className="text-[9px] px-2 py-1 rounded-md font-black text-white flex items-center gap-1"
                    style={{
                      background: `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueDark} 100%)`,
                      boxShadow: '0 2px 6px rgba(22, 86, 184, 0.3)',
                    }}
                  >
                    <Zap size={9} fill="currentColor" /> VIP
                  </span>
                )}
                <span
                  className="text-[9px] px-2 py-0.5 rounded-md font-black flex items-center gap-1"
                  style={{ background: sourceInfo.bg, color: sourceInfo.color }}
                >
                  {sourceInfo.icon}
                  {sourceInfo.label}
                </span>
              </div>
            </div>
          </div>

          {/* ═══ فاصل منقّط (ticket) ═══ */}
          <div className="relative px-5">
            <div
              className="border-t-2 border-dashed"
              style={{ borderColor: BRAND.divider }}
            />
            <div
              className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full"
              style={{ background: BRAND.paper }}
            />
            <div
              className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full"
              style={{ background: BRAND.paper }}
            />
          </div>

          {/* القسم 2: الجراج + التاريخ */}
          {garage && (
            <div className="px-4 py-3">
              <div className="flex items-start gap-2.5">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${BRAND.green} 0%, ${BRAND.greenDark} 100%)`,
                    boxShadow: '0 4px 12px rgba(140, 198, 63, 0.3)',
                  }}
                >
                  <MapPin size={20} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <span
                    className="text-[9px] font-black uppercase block"
                    style={{ color: BRAND.inkSoft, letterSpacing: '1.2px' }}
                  >
                    مكان الركن
                  </span>
                  <span className="text-sm font-black block truncate" style={{ color: BRAND.ink }}>
                    {garage.name}
                  </span>
                  <div className="flex items-center gap-1 mt-1">
                    <Calendar size={10} style={{ color: BRAND.inkSoft }} />
                    <span className="text-[10px] font-bold" style={{ color: BRAND.inkMuted }}>
                      {formatDateShort(startDate)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ فاصل منقّط ═══ */}
          <div className="relative px-5">
            <div
              className="border-t-2 border-dashed"
              style={{ borderColor: BRAND.divider }}
            />
            <div
              className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full"
              style={{ background: BRAND.paper }}
            />
            <div
              className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full"
              style={{ background: BRAND.paper }}
            />
          </div>

          {/* ═══ المدة الكلية (البطل) ═══ */}
          <div className="px-4 py-4">
            <div
              className="rounded-2xl p-4 text-center relative overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueDark} 100%)`,
                boxShadow: '0 6px 20px rgba(22, 86, 184, 0.25)',
              }}
            >
              {/* إضاءة ركنية */}
              <div
                className="absolute -top-10 -left-10 w-32 h-32 rounded-full pointer-events-none opacity-40"
                style={{ background: `radial-gradient(circle, ${BRAND.green}40 0%, transparent 70%)` }}
              />
              <div
                className="absolute -bottom-10 -right-10 w-32 h-32 rounded-full pointer-events-none opacity-30"
                style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%)' }}
              />

              <div className="relative flex items-center justify-center gap-1.5 mb-2">
                <Clock size={14} className="text-white/80" />
                <span
                  className="text-[10px] font-black uppercase text-white/80"
                  style={{ letterSpacing: '1.8px' }}
                >
                  إجمالي مدة الركن
                </span>
              </div>
              <div
                className="relative font-black text-[30px] text-white leading-none"
                style={{
                  letterSpacing: '-0.5px',
                  textShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }}
              >
                {formatDuration()}
              </div>
            </div>
          </div>

          {/* ═══ وقت الدخول + الخروج ═══ */}
          <div className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-2.5">
              {/* الدخول */}
              <div
                className="rounded-xl p-3 text-center border"
                style={{
                  background: BRAND.paper,
                  borderColor: 'rgba(140, 198, 63, 0.25)',
                  boxShadow: '0 2px 6px rgba(140, 198, 63, 0.08)',
                }}
              >
                <div className="flex items-center justify-center gap-1 mb-1.5">
                  <div
                    className="w-5 h-5 rounded-md flex items-center justify-center"
                    style={{ background: BRAND.greenLight }}
                  >
                    <LogIn size={11} style={{ color: BRAND.greenDark }} />
                  </div>
                  <span
                    className="text-[9px] font-black uppercase"
                    style={{ color: BRAND.greenDark, letterSpacing: '1px' }}
                  >
                    الدخول
                  </span>
                </div>
                <span
                  className="text-base font-black font-mono block"
                  style={{ color: BRAND.ink, letterSpacing: '1.5px' }}
                >
                  {formatTimeOnly(startDate)}
                </span>
              </div>

              {/* الخروج */}
              <div
                className="rounded-xl p-3 text-center border"
                style={{
                  background: BRAND.paper,
                  borderColor: 'rgba(22, 86, 184, 0.2)',
                  boxShadow: '0 2px 6px rgba(22, 86, 184, 0.08)',
                }}
              >
                <div className="flex items-center justify-center gap-1 mb-1.5">
                  <div
                    className="w-5 h-5 rounded-md flex items-center justify-center"
                    style={{ background: BRAND.blueSoft }}
                  >
                    <LogOut size={11} style={{ color: BRAND.blue }} />
                  </div>
                  <span
                    className="text-[9px] font-black uppercase"
                    style={{ color: BRAND.blue, letterSpacing: '1px' }}
                  >
                    الخروج
                  </span>
                </div>
                <span
                  className="text-base font-black font-mono block"
                  style={{ color: BRAND.ink, letterSpacing: '1.5px' }}
                >
                  {formatTimeOnly(endDate)}
                </span>
              </div>
            </div>
          </div>

          {/* ═══ VIP: شريط رسوم الحجز ═══ */}
          {isVip && (
            <>
              <div className="relative px-5">
                <div
                  className="border-t-2 border-dashed"
                  style={{ borderColor: BRAND.divider }}
                />
                <div
                  className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full"
                  style={{ background: BRAND.paper }}
                />
                <div
                  className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full"
                  style={{ background: BRAND.paper }}
                />
              </div>

              <div
                className="px-4 py-3 flex items-center justify-between"
                style={{
                  background: `linear-gradient(90deg, ${BRAND.blueSoft} 0%, ${BRAND.greenLight} 100%)`,
                }}
              >
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={15} style={{ color: BRAND.green }} />
                  <span className="text-[12px] font-black" style={{ color: BRAND.ink }}>
                    رسوم الحجز مدفوعة
                  </span>
                </div>
                <span
                  className="text-sm font-black text-white font-mono px-2.5 py-1 rounded-md"
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

          {/* ═══ Footer برندينج ═══ */}
          <div
            className="px-4 py-2.5 flex items-center justify-center gap-1.5 border-t"
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
              className="text-[9px] font-black uppercase"
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
    </motion.div>
  );
});

export default LastSessionCard;