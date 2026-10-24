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
} from 'lucide-react';
import { useStore, normalizePlate, normalizePhone, getServerNow, BOOKING_FEE } from '../store';

const BRAND = {
  blue: '#1656b8',
  blueDark: '#0f3d85',
  blueLight: '#e8f0fe',
  blueSoft: 'rgba(22, 86, 184, 0.12)',
  green: '#8cc63f',
  greenDark: '#6ea62a',
  greenLight: 'rgba(140, 198, 63, 0.12)',
  navy: '#0a1628',
  navyLight: '#111e36',
  slate: '#64748b',
  slateMuted: '#94a3b8',
  border: 'rgba(255, 255, 255, 0.08)',
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
    if (hours > 0 && minutes > 0) return `${hours} س و ${minutes} د`;
    if (hours > 0) return `${hours} ساعة`;
    return `${minutes} دقيقة`;
  };

  const startDate = useMemo(() => new Date(startTime > 0 ? startTime : getServerNow()), [startTime]);
  const endDate = useMemo(() => new Date(endTime > 0 ? endTime : getServerNow()), [endTime]);

  const formatDateShort = useCallback((date: Date) => {
    if (!date || isNaN(date.getTime())) return '---';
    return date.toLocaleDateString('ar-EG', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
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
      ? { label: 'عبر التطبيق', icon: <Zap size={9} />, color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.15)' }
      : { label: 'ركن يدوي', icon: <Car size={9} />, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' };
  }, [lastSession?.source]);

  // رقم إيصال وهمي من الـ ID (آخر 6 أحرف)
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
      {/* رأس القسم */}
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-black flex items-center gap-1.5" style={{ color: BRAND.navy }}>
          <Receipt size={16} style={{ color: BRAND.blue }} />
          إيصال آخر جلسة ركن
        </h3>
        <span
          className="text-[9px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 font-mono"
          style={{
            background: BRAND.blueSoft,
            color: BRAND.blue,
            letterSpacing: '1px',
          }}
        >
          <Hash size={9} />
          {receiptNumber}
        </span>
      </div>

      {/* ═══════════════════════════════════
          🎫 بطاقة الإيصال الاحترافية
          ═══════════════════════════════════ */}
      <div
        className="rounded-[20px] relative overflow-hidden border"
        style={{
          background: `linear-gradient(145deg, ${BRAND.navyLight} 0%, ${BRAND.navy} 100%)`,
          borderColor: BRAND.border,
          boxShadow: '0 10px 30px rgba(10, 22, 40, 0.25), 0 2px 6px rgba(0,0,0,0.1)',
        }}
      >
        {/* إضاءة ركنية خفيفة */}
        <div
          className="absolute -top-20 -right-20 w-56 h-56 rounded-full pointer-events-none opacity-40"
          style={{ background: `radial-gradient(circle, ${BRAND.blue}25 0%, transparent 65%)` }}
        />
        <div
          className="absolute -bottom-20 -left-20 w-48 h-48 rounded-full pointer-events-none opacity-30"
          style={{ background: `radial-gradient(circle, ${BRAND.green}20 0%, transparent 65%)` }}
        />

        {/* ═══ الجزء العلوي: رقم السيارة + VIP ═══ */}
        <div className="relative z-10 p-4 pb-3">
          <div className="flex justify-between items-center">
            {/* رقم السيارة */}
            <div className="flex items-center gap-2">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: 'rgba(22, 86, 184, 0.2)',
                  border: `1px solid ${BRAND.blue}40`,
                }}
              >
                <Car size={16} className="text-blue-400" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: BRAND.slateMuted, letterSpacing: '1px' }}>
                  رقم المركبة
                </span>
                <span
                  className="text-base font-black text-white font-mono"
                  style={{ letterSpacing: '2.5px' }}
                >
                  {lastSession.carPlate}
                </span>
              </div>
            </div>

            {/* الشارات */}
            <div className="flex flex-col items-end gap-1">
              {isVip && (
                <span
                  className="text-[9px] px-2 py-1 rounded-lg font-black flex items-center gap-1 shadow-sm"
                  style={{
                    background: `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueDark} 100%)`,
                    color: '#ffffff',
                    boxShadow: '0 2px 8px rgba(22,86,184,0.3)',
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

        {/* ═══ خط فاصل منقط (effect تذكرة) ═══ */}
        <div className="relative px-4">
          <div className="border-t-2 border-dashed" style={{ borderColor: 'rgba(255,255,255,0.08)' }} />
          <div
            className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full"
            style={{ background: BRAND.navy, border: `1px solid ${BRAND.border}` }}
          />
          <div
            className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full"
            style={{ background: BRAND.navy, border: `1px solid ${BRAND.border}` }}
          />
        </div>

        {/* ═══ الجزء الأوسط: الجراج + التاريخ ═══ */}
        {garage && (
          <div className="relative z-10 px-4 py-3">
            <div className="flex items-start gap-2">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                style={{
                  background: 'rgba(140, 198, 63, 0.15)',
                  border: `1px solid ${BRAND.green}40`,
                }}
              >
                <MapPin size={16} className="text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[9px] font-black uppercase tracking-wider block" style={{ color: BRAND.slateMuted, letterSpacing: '1px' }}>
                  الجراج
                </span>
                <span className="text-sm font-black text-white block truncate">
                  {garage.name}
                </span>
                <span className="text-[10px] font-black block mt-0.5" style={{ color: BRAND.slateMuted }}>
                  📅 {formatDateShort(startDate)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ═══ خط فاصل منقط ═══ */}
        <div className="relative px-4">
          <div className="border-t-2 border-dashed" style={{ borderColor: 'rgba(255,255,255,0.08)' }} />
          <div
            className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full"
            style={{ background: BRAND.navy, border: `1px solid ${BRAND.border}` }}
          />
          <div
            className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full"
            style={{ background: BRAND.navy, border: `1px solid ${BRAND.border}` }}
          />
        </div>

        {/* ═══ المدة الكلية — البطل ═══ */}
        <div className="relative z-10 px-4 py-4">
          <div
            className="rounded-2xl p-4 text-center relative overflow-hidden border"
            style={{
              background: `linear-gradient(135deg, rgba(22,86,184,0.15) 0%, rgba(22,86,184,0.05) 100%)`,
              borderColor: `${BRAND.blue}30`,
            }}
          >
            <div className="flex items-center justify-center gap-1.5 mb-1.5">
              <Clock size={14} className="text-blue-400" />
              <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: BRAND.slateMuted, letterSpacing: '1.5px' }}>
                إجمالي مدة الركن
              </span>
            </div>
            <div
              className="font-black text-[28px] text-white leading-none"
              style={{ letterSpacing: '-0.5px', textShadow: '0 2px 6px rgba(0,0,0,0.3)' }}
            >
              {formatDuration()}
            </div>
          </div>
        </div>

        {/* ═══ وقت الدخول + الخروج (grid متوازي) ═══ */}
        <div className="relative z-10 px-4 pb-4">
          <div className="grid grid-cols-2 gap-2.5">
            {/* الدخول */}
            <div
              className="rounded-xl p-3 text-center border"
              style={{
                background: 'rgba(16, 185, 129, 0.08)',
                borderColor: 'rgba(16, 185, 129, 0.2)',
              }}
            >
              <div className="flex items-center justify-center gap-1 mb-1.5">
                <LogIn size={11} className="text-emerald-400" />
                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400">
                  الدخول
                </span>
              </div>
              <span
                className="text-base font-black text-emerald-300 font-mono block"
                style={{ letterSpacing: '1px' }}
              >
                {formatTimeOnly(startDate)}
              </span>
            </div>

            {/* الخروج */}
            <div
              className="rounded-xl p-3 text-center border"
              style={{
                background: 'rgba(239, 68, 68, 0.08)',
                borderColor: 'rgba(239, 68, 68, 0.2)',
              }}
            >
              <div className="flex items-center justify-center gap-1 mb-1.5">
                <LogOut size={11} className="text-red-400" />
                <span className="text-[9px] font-black uppercase tracking-wider text-red-400">
                  الخروج
                </span>
              </div>
              <span
                className="text-base font-black text-red-300 font-mono block"
                style={{ letterSpacing: '1px' }}
              >
                {formatTimeOnly(endDate)}
              </span>
            </div>
          </div>
        </div>

        {/* ═══ VIP: رسوم الحجز (ثابت في الأسفل) ═══ */}
        {isVip && (
          <>
            <div className="relative px-4">
              <div className="border-t-2 border-dashed" style={{ borderColor: 'rgba(255,255,255,0.08)' }} />
              <div
                className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full"
                style={{ background: BRAND.navy, border: `1px solid ${BRAND.border}` }}
              />
              <div
                className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full"
                style={{ background: BRAND.navy, border: `1px solid ${BRAND.border}` }}
              />
            </div>

            <div
              className="relative z-10 px-4 py-3 flex items-center justify-between"
              style={{ background: 'rgba(22, 86, 184, 0.08)' }}
            >
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-blue-400 shrink-0" />
                <span className="text-[11px] font-black text-blue-300">
                  رسوم الحجز مدفوعة
                </span>
              </div>
              <span
                className="text-xs font-black text-white font-mono px-2 py-0.5 rounded-md"
                style={{ background: 'rgba(22, 86, 184, 0.25)' }}
              >
                {BOOKING_FEE} ج.م ✓
              </span>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
});

export default LastSessionCard;