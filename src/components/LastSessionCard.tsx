import { useMemo, memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  MapPin,
  Calendar,
  Receipt,
  Zap,
  LogIn,
  LogOut,
} from 'lucide-react';
// 🌟 استيراد دوال البصمة والتوقيت الموحد من الـ store
import { useStore, normalizePlate, normalizePhone, getServerNow, BOOKING_FEE } from '../store';

/* ─── 🎨 الألوان الرسمية الفاخرة لتطبيق Park'n 24 ─── */
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

  const garage = lastSession
    ? garages.find((g) => g.id === lastSession.garageId)
    : null;

  // ✅ كشف نوع الجراج (VIP أم عادي)
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
    if (hours > 0 && minutes > 0) return `${hours} ساعة و ${minutes} دقيقة`;
    if (hours > 0) return `${hours} ساعة`;
    return `${minutes} دقيقة`;
  };

  const startDate = useMemo(() => new Date(startTime > 0 ? startTime : getServerNow()), [startTime]);
  const endDate = useMemo(() => new Date(endTime > 0 ? endTime : getServerNow()), [endTime]);

  const formatDateTime = useCallback((date: Date) => {
    if (!date || isNaN(date.getTime())) return '---';
    return date.toLocaleDateString('ar-EG', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
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
      ? { label: 'حجز تطبيق', color: '#60a5fa', bg: BRAND.blueSoft }
      : { label: 'ركن يدوي', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' };
  }, [lastSession?.source]);

  if (!lastSession) return null;

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

        {/* الجراج ورقم السيارة */}
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
            {isVip && (
              <span
                className="text-[9px] px-2 py-0.5 rounded-lg font-black flex items-center gap-0.5"
                style={{
                  background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`,
                  color: '#ffffff',
                }}
              >
                <Zap size={9} /> VIP
              </span>
            )}
            <span
              className="text-[9px] px-2 py-0.5 rounded-lg font-black"
              style={{ background: sourceInfo.bg, color: sourceInfo.color }}
            >
              {sourceInfo.label}
            </span>
          </div>
        </div>

        {/* 🕐 المدة الكلية — البطاقة الرئيسية */}
        <div
          className="rounded-2xl p-4 mb-3 text-center border relative z-10"
          style={{
            background: BRAND.navyLight,
            borderColor: BRAND.border,
          }}
        >
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Clock size={12} style={{ color: BRAND.blue }} />
            <span className="text-[9px] font-bold tracking-wider" style={{ color: BRAND.slateMuted }}>
              إجمالي مدة الركن
            </span>
          </div>

          <div className="font-black text-3xl text-white leading-none">
            {formatDuration()}
          </div>
        </div>

        {/* 🟢🔴 وقت الدخول والخروج */}
        <div className="border rounded-xl p-2.5 mb-3 space-y-2 relative z-10" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5" style={{ color: BRAND.slateMuted }}>
              <LogIn size={11} className="text-emerald-400" />
              <span className="text-[10px] font-bold">وقت الدخول:</span>
            </div>
            <span className="text-xs font-black text-emerald-400 font-mono">
              {formatTimeOnly(startDate)}
            </span>
          </div>

          <div className="border-t border-dashed" style={{ borderColor: BRAND.border }} />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5" style={{ color: BRAND.slateMuted }}>
              <LogOut size={11} className="text-red-400" />
              <span className="text-[10px] font-bold">وقت الخروج:</span>
            </div>
            <span className="text-xs font-black text-red-400 font-mono">
              {formatTimeOnly(endDate)}
            </span>
          </div>
        </div>

        {/* ✅ VIP booking fee — بسيط ومختصر */}
        {isVip && (
          <div
            className="border rounded-xl p-2.5 text-center relative z-10"
            style={{
              background: BRAND.blueSoft,
              borderColor: `${BRAND.blue}30`,
            }}
          >
            <div className="flex items-center justify-center gap-1.5 mb-0.5">
              <Zap size={12} style={{ color: '#60a5fa' }} />
              <span className="text-[10px] font-black" style={{ color: '#60a5fa' }}>
                تم خصم {BOOKING_FEE} ج.م رسوم الحجز
              </span>
            </div>
            <span className="text-[8px] font-bold" style={{ color: BRAND.slateMuted }}>
              تم الخصم تلقائياً من محفظتك عند الوصول للجراج
            </span>
          </div>
        )}

        {/* التذييل التاريخي */}
        <div className="mt-2.5 text-center relative z-10">
          <span className="text-[9px] font-mono font-bold flex items-center justify-center gap-1" style={{ color: BRAND.slateMuted }}>
            <Calendar size={9} />
            {formatDateTime(startDate)}
          </span>
        </div>
      </div>
    </motion.div>
  );
});

export default LastSessionCard;