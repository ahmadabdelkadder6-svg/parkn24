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
  Car,
  CheckCircle2
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
    if (hours > 0 && minutes > 0) return `${hours} س و ${minutes} د`;
    if (hours > 0) return `${hours} ساعة`;
    return `${minutes} دقيقة`;
  };

  const startDate = useMemo(() => new Date(startTime > 0 ? startTime : getServerNow()), [startTime]);
  const endDate = useMemo(() => new Date(endTime > 0 ? endTime : getServerNow()), [endTime]);

  const formatDateTime = useCallback((date: Date) => {
    if (!date || isNaN(date.getTime())) return '---';
    return date.toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
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
      ? { label: 'حجز ذكي عبر التطبيق', icon: <Zap size={10} />, color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.15)' }
      : { label: 'ركن يدوي', icon: <Car size={10} />, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' };
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
      {/* رأس القسم */}
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-black flex items-center gap-1.5" style={{ color: BRAND.navy }}>
          <Receipt size={16} style={{ color: BRAND.blue }} />
          إيصال آخر جلسة ركن
        </h3>
      </div>

      {/* البطاقة الرقمية الفاخرة (Premium Dark Receipt) */}
      <div
        className="rounded-[24px] p-5 text-white relative overflow-hidden border-2"
        style={{
          background: `linear-gradient(135deg, ${BRAND.navy} 0%, ${BRAND.navyLight} 100%)`,
          borderColor: `${BRAND.blue}30`,
          boxShadow: `0 12px 35px ${BRAND.navy}25`,
        }}
      >
        {/* لمسة إضاءة ناعمة في الزاوية */}
        <div
          className="absolute -top-16 -right-16 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${BRAND.blue}30 0%, transparent 70%)` }}
        />
        <div
          className="absolute -bottom-16 -left-16 w-40 h-40 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${BRAND.green}15 0%, transparent 70%)` }}
        />

        {/* الهيدر: بيانات السيارة والجراج */}
        <div className="flex justify-between items-start mb-5 relative z-10">
          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-400 mb-1.5 block">رقم المركبة</span>
            <div className="text-lg font-black text-white font-mono tracking-widest bg-white/10 inline-block px-3 py-1 rounded-xl border border-white/5">
              {lastSession.carPlate}
            </div>
          </div>
          
          <div className="text-left flex flex-col items-end gap-1.5">
            {isVip && (
              <span
                className="text-[10px] px-2.5 py-1 rounded-lg font-black flex items-center gap-1 shadow-md"
                style={{
                  background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`,
                  color: '#ffffff',
                }}
              >
                <Zap size={10} /> VIP
              </span>
            )}
            <span
              className="text-[9px] px-2 py-1 rounded-md font-bold flex items-center gap-1"
              style={{ background: sourceInfo.bg, color: sourceInfo.color }}
            >
              {sourceInfo.icon}
              {sourceInfo.label}
            </span>
          </div>
        </div>

        {/* الجراج والتاريخ */}
        {garage && (
          <div className="mb-4 relative z-10">
            <div className="flex items-center gap-1.5 mb-1 text-white">
              <MapPin size={14} className="text-blue-400" />
              <span className="text-sm font-black">{garage.name}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400 px-5">
              <Calendar size={11} />
              <span className="text-[11px] font-bold">{formatDateTime(startDate)}</span>
            </div>
          </div>
        )}

        {/* 🕐 المدة الكلية — بارزة ومضيئة */}
        <div
          className="rounded-2xl p-4 mb-4 text-center relative z-10 border border-white/5 shadow-inner"
          style={{ background: 'rgba(0,0,0,0.25)' }}
        >
          <span className="text-[11px] font-bold text-slate-400 mb-1 block">إجمالي مدة الركن</span>
          <div className="font-black text-3xl tracking-tight text-white flex items-center justify-center gap-2">
            <Clock size={22} className="text-blue-400" />
            {formatDuration()}
          </div>
        </div>

        {/* 🟢🔴 وقت الدخول والخروج (تصميم تذكرة) */}
        <div className="rounded-2xl p-4 mb-4 relative z-10 border border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-300">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <LogIn size={12} className="text-emerald-400" />
              </div>
              <span className="text-[11px] font-bold">وقت الدخول</span>
            </div>
            <span className="text-sm font-black text-emerald-400 font-mono tracking-wide">
              {formatTimeOnly(startDate)}
            </span>
          </div>

          <div className="border-t border-dashed border-white/10 my-3 relative">
            <div className="absolute -left-5 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#0a1628] rounded-full border border-white/5" />
            <div className="absolute -right-5 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#0a1628] rounded-full border border-white/5" />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-300">
              <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                <LogOut size={12} className="text-red-400" />
              </div>
              <span className="text-[11px] font-bold">وقت الخروج</span>
            </div>
            <span className="text-sm font-black text-red-400 font-mono tracking-wide">
              {formatTimeOnly(endDate)}
            </span>
          </div>
        </div>

        {/* ✅ VIP booking fee — شريط مدفوعات أنيق */}
        {isVip && (
          <div
            className="rounded-xl p-3 text-center relative z-10 border"
            style={{
              background: 'rgba(59, 130, 246, 0.1)', // blue-500/10
              borderColor: 'rgba(59, 130, 246, 0.2)', // blue-500/20
            }}
          >
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <CheckCircle2 size={14} className="text-blue-400" />
              <span className="text-xs font-black text-blue-400">
                رسوم الحجز مدفوعة ({BOOKING_FEE} ج.م)
              </span>
            </div>
            <span className="text-[10px] font-bold text-slate-400 block">
              تم الخصم تلقائياً من محفظتك لضمان الركنة
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
});

export default LastSessionCard;