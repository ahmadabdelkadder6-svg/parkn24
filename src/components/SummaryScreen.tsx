import { motion } from 'framer-motion';
import { CheckCircle, Home, Clock, LogIn, LogOut } from 'lucide-react';
import { useStore, normalizePlate, normalizePhone, getServerNow } from '../store';
import { useMemo, useEffect, useRef, useCallback } from 'react';

const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

// 🕐 تنسيق الوقت بالعربي (ساعة:دقيقة ص/م)
const formatTime = (ms: number): string => {
  if (!ms) return '--:--';
  const date = new Date(ms);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? 'م' : 'ص';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, '0');
  return `${displayHours}:${displayMinutes} ${period}`;
};

// 📅 تنسيق التاريخ
const formatDate = (ms: number): string => {
  if (!ms) return '';
  const date = new Date(ms);
  return date.toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
};

export default function SummaryScreen() {
  const {
    sessions,
    setScreen,
    setSelectedGarageId,
    currentUser,
    acknowledgeSession,
  } = useStore();

  const userPlate = normalizePlate(currentUser?.carPlate);
  const userPhone = currentUser?.phone ? normalizePhone(currentUser.phone) : '';

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isMySession = useCallback((s: any): boolean => {
    if (!s) return false;
    const samePlate = !!userPlate && normalizePlate(s.carPlate) === userPlate;
    const sPhone = s.customerPhone ? normalizePhone(s.customerPhone) : '';
    const samePhone = Boolean(userPhone && sPhone === userPhone);
    return samePlate || samePhone;
  }, [userPlate, userPhone]);

  // 🎯 نجيب أحدث جلسة (نشطة أو منتهية)
  const activeSession = useMemo(() => {
    return sessions
      .filter((s) => s && s.status === 'active' && isMySession(s))
      .sort((a, b) => toMs(b.startTime) - toMs(a.startTime))[0];
  }, [sessions, isMySession]);

  const lastCompletedSession = useMemo(() => {
    return sessions
      .filter((s) => s && s.status === 'completed' && isMySession(s))
      .sort((a, b) => toMs(b.endTime) - toMs(a.endTime))[0];
  }, [sessions, isMySession]);

  const referenceSession = activeSession ?? lastCompletedSession;

  // ⏱️ حساب الأوقات
  const startMs = toMs(referenceSession?.startTime);
  const endMs = referenceSession?.status === 'completed'
    ? toMs(referenceSession?.endTime)
    : getServerNow();

  const durationSeconds = startMs ? Math.max(0, Math.floor((endMs - startMs) / 1000)) : 0;
  const durationHours = Math.floor(durationSeconds / 3600);
  const durationMinutes = Math.floor((durationSeconds % 3600) / 60);

  const formatDuration = (): string => {
    if (durationHours > 0 && durationMinutes > 0) {
      return `${durationHours} ساعة و ${durationMinutes} دقيقة`;
    }
    if (durationHours > 0) {
      return `${durationHours} ساعة`;
    }
    return `${durationMinutes} دقيقة`;
  };

  const handleGoHome = () => {
    if (lastCompletedSession && acknowledgeSession) {
      acknowledgeSession(lastCompletedSession.id);
    }
    setSelectedGarageId(null);
    setScreen('list');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-white text-slate-900 p-6 overflow-y-auto flex flex-col"
      style={{ direction: 'rtl' }}
    >
      {/* ══════════ العنوان ══════════ */}
      <div className="pt-10 mb-6 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', bounce: 0.5 }}
          className="inline-block mb-3"
        >
          <CheckCircle size={64} className="text-emerald-500 mx-auto" />
        </motion.div>
        <h2 className="text-2xl font-black text-slate-900 mb-1">ملخص الجلسة</h2>
        <p className="text-slate-500 text-sm">
          {activeSession ? 'الجلسة جارية الآن' : 'تم إنهاء الجلسة بنجاح'}
        </p>
      </div>

      {/* ══════════ بطاقة الأوقات ══════════ */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-5 mb-4 shadow-sm">
        {/* التاريخ */}
        {startMs > 0 && (
          <div className="text-center mb-4 pb-3 border-b border-blue-200">
            <span className="text-xs font-bold text-slate-600">
              {formatDate(startMs)}
            </span>
          </div>
        )}

        {/* الدخول */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <LogIn size={18} className="text-emerald-600" />
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold text-slate-500">وقت الدخول</div>
              <div className="text-xs font-black text-slate-900">دخلت الجراج</div>
            </div>
          </div>
          <div className="text-xl font-black font-mono text-emerald-600">
            {formatTime(startMs)}
          </div>
        </div>

        {/* الخروج */}
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-blue-200">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <LogOut size={18} className="text-red-600" />
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold text-slate-500">وقت الخروج</div>
              <div className="text-xs font-black text-slate-900">
                {activeSession ? 'لسه الوقت ماشي' : 'خرجت من الجراج'}
              </div>
            </div>
          </div>
          <div className="text-xl font-black font-mono text-red-600">
            {activeSession ? '--:--' : formatTime(endMs)}
          </div>
        </div>

        {/* المدة الكلية */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Clock size={18} className="text-blue-600" />
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold text-slate-500">المدة الكلية</div>
              <div className="text-xs font-black text-slate-900">مدة الركن</div>
            </div>
          </div>
          <div className="text-base font-black text-blue-600">
            {formatDuration()}
          </div>
        </div>
      </div>

      {/* ══════════ زر العودة للرئيسية ══════════ */}
      <div className="mt-auto pt-4">
        <button
          type="button"
          onClick={handleGoHome}
          className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-200 border-0 cursor-pointer"
        >
          <Home size={20} className="text-white" />
          <span style={{ color: '#ffffff', fontWeight: 900 }}>
            العودة للرئيسية
          </span>
        </button>
      </div>
    </motion.div>
  );
}