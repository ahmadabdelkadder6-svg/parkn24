import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Car,
  Sparkles,
} from 'lucide-react';
import { useStore, normalizePlate, normalizePhone, getServerNow } from '../store';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const BRAND = {
  blue: '#1656b8',
  blueDark: '#0f3d85',
  blueLight: '#e8f0fe',
  blueSoft: 'rgba(22, 86, 184, 0.08)',
  green: '#8cc63f',
  greenDark: '#6ea62a',
  greenLight: 'rgba(140, 198, 63, 0.12)',
  navy: '#0a1628',
  navyLight: '#111e36',
  slate: '#64748b',
  slateMuted: '#94a3b8',
  border: 'rgba(255, 255, 255, 0.12)',
};

const AUTO_END_SECONDS = 6 * 60 * 60;

const safeParseTime = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'string') {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : 0;
  }
  if (typeof value === 'number') {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  return 0;
};

const formatTime = (seconds: number): string => {
  if (!seconds || seconds < 0) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export default function SessionScreen() {
  const {
    garages,
    sessions,
    setScreen,
    currentUser,
    fetchAll,
    setSelectedGarageId,
    acknowledgedSessionIds,
    acknowledgeSession,
    endSession,
  } = useStore();

  const userPlate = normalizePlate(currentUser?.carPlate);
  const userPhone = currentUser?.phone ? normalizePhone(currentUser.phone) : '';

  const isMountedRef = useRef(true);
  const redirectedToListRef = useRef(false);
  const redirectedToSessionRef = useRef(false);
  const activeSessionIdRef = useRef<string | null>(null);
  const realtimeChannelRef = useRef<any>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoEndedRef = useRef(false);

  const [elapsed, setElapsed] = useState(0);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const isMySessionRow = useCallback((row: any) => {
    if (!row) return false;
    const rowPlate = normalizePlate(row.car_plate || row.carPlate);
    const rowPhone = normalizePhone(row.customer_phone || row.customerPhone || '');
    return (
      (!!userPlate && rowPlate === userPlate) ||
      (!!userPhone && rowPhone === userPhone)
    );
  }, [userPlate, userPhone]);

  const activeSession = useMemo(() => {
    return sessions
      .filter((s) => {
        if (!s || s.status !== 'active') return false;
        if (acknowledgedSessionIds?.has(s.id)) return false;
        const samePlateMatch = !!userPlate && normalizePlate(s.carPlate) === userPlate;
        const sPhone = (s as any).customerPhone ? normalizePhone((s as any).customerPhone) : '';
        const samePhoneMatch = Boolean(userPhone && sPhone === userPhone);
        return samePlateMatch || samePhoneMatch;
      })
      .sort((a, b) => safeParseTime(b.startTime) - safeParseTime(a.startTime))[0];
  }, [sessions, userPlate, userPhone, acknowledgedSessionIds]);

  const lastCompletedSession = useMemo(() => {
    return sessions
      .filter((s) => {
        if (!s || s.status !== 'completed') return false;
        const samePlateMatch = !!userPlate && normalizePlate(s.carPlate) === userPlate;
        const sPhone = (s as any).customerPhone ? normalizePhone((s as any).customerPhone) : '';
        const samePhoneMatch = Boolean(userPhone && sPhone === userPhone);
        return samePlateMatch || samePhoneMatch;
      })
      .sort((a, b) => safeParseTime(b.endTime) - safeParseTime(a.endTime))[0];
  }, [sessions, userPlate, userPhone]);

  const garage = garages?.find(
    (g) => g.id === (activeSession?.garageId ?? lastCompletedSession?.garageId),
  );

  useEffect(() => {
    if (activeSession?.id) {
      activeSessionIdRef.current = activeSession.id;
    }
  }, [activeSession?.id]);

  const activeStartMs = useMemo(() => {
    if (!activeSession) return 0;
    const ms = safeParseTime(activeSession.startTime);
    return ms > 0 ? ms : getServerNow();
  }, [activeSession]);

  useEffect(() => {
    fetchAll().catch((e) => console.error('Fetch error:', e));
  }, [fetchAll]);

  useEffect(() => {
    if (!userPlate && !userPhone) return;
    let cancelled = false;

    const refetch = async () => {
      if (cancelled || !isMountedRef.current) return;
      try { await fetchAll(); } catch (e) { console.error('❌ Realtime fetch error:', e); }
    };

    const channel = supabase.channel(`customer-session-live-${userPlate || userPhone}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, async (payload) => {
        const newRow = payload.new as any;
        const oldRow = payload.old as any;
        if (isMySessionRow(newRow) || isMySessionRow(oldRow)) await refetch();
      })
      .subscribe();

    realtimeChannelRef.current = channel;
    pollingRef.current = setInterval(refetch, 4000);

    const handleVisibility = () => { if (document.visibilityState === 'visible') refetch(); };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', refetch);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', refetch);
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      if (realtimeChannelRef.current) { supabase.removeChannel(realtimeChannelRef.current); realtimeChannelRef.current = null; }
    };
  }, [userPlate, userPhone, fetchAll, isMySessionRow]);

  // ✅ إنهاء الجلسة يدوياً → الرئيسية مباشرة
  const handleEndSession = useCallback(async () => {
    if (ending || !activeSession) return;
    setEnding(true);
    try {
      const elapsedSec = Math.floor((getServerNow() - activeStartMs) / 1000);
      await endSession(activeSession.id, Math.max(0, elapsedSec), 'cash', 0);
      if (typeof acknowledgeSession === 'function') acknowledgeSession(activeSession.id);
      toast.success('تم إنهاء الجلسة ✅', { icon: '🏁', duration: 3000 });
      if (isMountedRef.current) {
        setSelectedGarageId(null);
        setScreen('list');
      }
    } catch (e: any) {
      toast.error(e?.message || 'فشل إنهاء الجلسة');
    } finally {
      setEnding(false);
    }
  }, [ending, activeSession, activeStartMs, endSession, acknowledgeSession, setSelectedGarageId, setScreen]);

  const handleAutoEnd = useCallback(async () => {
    if (autoEndedRef.current || !activeSession) return;
    autoEndedRef.current = true;
    try {
      await endSession(activeSession.id, AUTO_END_SECONDS, 'cash', 0);
      if (typeof acknowledgeSession === 'function') acknowledgeSession(activeSession.id);
      toast.success('تم إنهاء الجلسة تلقائياً (6 ساعات) ⏰', { duration: 5000 });
      if (isMountedRef.current) {
        setSelectedGarageId(null);
        setScreen('list');
      }
    } catch (err) {
      console.error('Auto-end error:', err);
      autoEndedRef.current = false;
    }
  }, [activeSession, endSession, acknowledgeSession, setSelectedGarageId, setScreen]);

  useEffect(() => {
    if (!activeSession || activeStartMs <= 0) { setElapsed(0); return; }
    autoEndedRef.current = false;

    const calcElapsed = () => {
      const now = getServerNow();
      return Math.max(0, Math.floor((now - activeStartMs) / 1000));
    };

    const currentElapsed = calcElapsed();
    setElapsed(currentElapsed);
    if (currentElapsed >= AUTO_END_SECONDS) { handleAutoEnd(); return; }

    const interval = setInterval(() => {
      if (!isMountedRef.current) return;
      const current = calcElapsed();
      setElapsed(current);
      if (current >= AUTO_END_SECONDS && !autoEndedRef.current) {
        clearInterval(interval);
        handleAutoEnd();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession, activeStartMs, handleAutoEnd]);

  useEffect(() => {
    if (!activeSession) { redirectedToSessionRef.current = false; return; }
    if (redirectedToSessionRef.current) return;
    redirectedToSessionRef.current = true;
    if (activeSession.garageId) setSelectedGarageId(activeSession.garageId);
  }, [activeSession, setSelectedGarageId]);

  // ✅ التحويل التلقائي عند انتهاء الجلسة → الرئيسية مباشرة (بدون ملخص)
  useEffect(() => {
    if (activeSession) { redirectedToListRef.current = false; return; }

    if (activeSessionIdRef.current) {
      const targetSession = sessions.find((s) => s.id === activeSessionIdRef.current);
      if (targetSession && targetSession.status === 'completed' && !redirectedToListRef.current) {
        redirectedToListRef.current = true;
        if (typeof acknowledgeSession === 'function') acknowledgeSession(targetSession.id);
        activeSessionIdRef.current = null;
        toast.success('تم إنهاء الجلسة ✅', { icon: '🏁', duration: 3000 });
        if (isMountedRef.current) {
          setSelectedGarageId(null);
          setScreen('list');
        }
        return;
      }
    }

    if (lastCompletedSession && !redirectedToListRef.current) {
      const isNotAcknowledged = acknowledgedSessionIds ? !acknowledgedSessionIds.has(lastCompletedSession.id) : true;
      if (isNotAcknowledged) {
        redirectedToListRef.current = true;
        if (typeof acknowledgeSession === 'function') acknowledgeSession(lastCompletedSession.id);
        toast.success('تم إنهاء الجلسة بنجاح ✅', { icon: '🏁', duration: 3000 });
        if (isMountedRef.current) {
          setSelectedGarageId(null);
          setScreen('list');
        }
      }
    }
  }, [activeSession, lastCompletedSession, sessions, setScreen, setSelectedGarageId, acknowledgedSessionIds, acknowledgeSession]);

  if (!activeSession) {
    return (
      <div className="h-full text-white flex flex-col items-center justify-center p-8 text-right dir-rtl" style={{ background: BRAND.navy }}>
        <div className="text-5xl mb-4 animate-bounce">⏳</div>
        <p className="text-slate-300 text-base sm:text-lg font-black text-center mb-2">جاري مزامنة بيانات الجلسة...</p>
        <p className="text-slate-400 text-xs sm:text-sm font-bold text-center mb-6">ستظهر بيانات العداد فور استلامها من السيرفر</p>
      </div>
    );
  }

  const remainingAutoEnd = Math.max(0, AUTO_END_SECONDS - elapsed);
  const autoEndMinutes = Math.floor((remainingAutoEnd % 3600) / 60);
  const showAutoEndWarning = remainingAutoEnd > 0 && remainingAutoEnd <= 30 * 60;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full text-white flex flex-col items-center justify-center p-5 sm:p-6 overflow-y-auto safe-top safe-bottom dir-rtl"
      style={{ background: BRAND.navy }}
    >
      {/* ⏰ العداد الرقمي الكبير ⏰ */}
      <div
        className="w-52 h-52 sm:w-60 sm:h-60 rounded-full flex flex-col items-center justify-center border-4 mb-6 transition-all shadow-2xl relative"
        style={{
          background: 'radial-gradient(circle, #111e36 0%, #0a1628 100%)',
          borderColor: BRAND.blue,
          boxShadow: '0 0 45px rgba(22, 86, 184, 0.35)',
        }}
      >
        <Clock size={32} style={{ color: BRAND.green }} className="mb-2 animate-pulse" />
        <div className="text-4xl sm:text-5xl font-black font-mono text-white leading-none tracking-wider dir-ltr">
          {formatTime(elapsed)}
        </div>
        <div className="text-xs sm:text-sm font-black mt-3 px-3.5 py-1 rounded-full bg-slate-800/90 text-slate-200 border border-slate-700 shadow-sm">
          مدة الركن الفعلية
        </div>
      </div>

      {showAutoEndWarning && (
        <div
          className="w-full rounded-2xl p-4 mb-4 text-center border-2 animate-pulse shadow-md"
          style={{ background: 'rgba(239, 68, 68, 0.2)', borderColor: 'rgba(239, 68, 68, 0.6)' }}
        >
          <span className="text-sm sm:text-base font-black text-red-300 flex items-center justify-center gap-2">
            ⏰ سيتم إنهاء الجلسة تلقائياً بعد {autoEndMinutes} دقيقة
          </span>
        </div>
      )}

      {/* 🚗 بطاقة التوضيح للعميل 🚗 */}
      <div
        className="w-full rounded-2xl p-4 mb-4 text-center border-2 shadow-sm"
        style={{ background: BRAND.navyLight, borderColor: BRAND.border }}
      >
        <div className="flex items-center justify-center gap-2 mb-1.5 font-black text-white text-base sm:text-lg">
          <Sparkles size={18} className="text-amber-400 shrink-0 animate-pulse" />
          <span>خلّص مشوارك براحتك 🚗✨</span>
        </div>
        <p className="font-extrabold leading-relaxed mx-auto text-xs sm:text-sm text-slate-300" style={{ maxWidth: '340px' }}>
          وقت الركنة <span className="font-black text-amber-300 underline">محفوظ بالثانية</span> في الخلفية.
          أغلق التطبيق الآن وافتحه عند العودة للجراج لإنهاء الجلسة.
        </p>
      </div>

      {/* 🚘 رقم السيارة 🚘 */}
      <div className="w-full mb-4">
        <div className="border-2 p-4 sm:p-5 rounded-2xl text-center shadow-sm" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
          <Car size={24} style={{ color: BRAND.blue }} className="mx-auto mb-2" />
          <div className="text-xl sm:text-2xl font-black text-white font-mono tracking-widest bg-slate-900/80 py-2 px-4 rounded-xl border border-slate-700 inline-block min-w-[160px]">
            {activeSession.carPlate || currentUser?.carPlate || '---'}
          </div>
          <div className="text-xs sm:text-sm font-extrabold mt-2 text-slate-400">رقم سيارتك</div>
        </div>
      </div>

      {/* 📍 اسم ومكان الجراج 📍 */}
      {garage && (
        <div className="border-2 p-4 sm:p-5 rounded-2xl w-full text-center mb-4 shadow-sm" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
          <div className="text-xs sm:text-sm font-extrabold mb-1 text-slate-400">الجراج الحالي</div>
          <div className="text-lg sm:text-xl font-black text-white">{garage.name}</div>
          {garage.location && (
            <div className="text-xs sm:text-sm font-bold mt-2 text-slate-300 flex items-center justify-center gap-1">
              📍 <span>{garage.location}</span>
            </div>
          )}
        </div>
      )}

      {/* 📱 مصدر بدء الجلسة 📱 */}
      <div className="w-full text-center mb-5">
        <span className="font-extrabold text-xs sm:text-sm text-slate-300 bg-slate-900/60 px-4 py-1.5 rounded-full border border-slate-800 inline-block">
          {activeSession.source === 'app' ? '📱 بدأت من التطبيق' : '🅿️ بدأت من الجراج'}
          {(activeSession as any).startedBy === 'garage' && ' (بواسطة السايس)'}
        </span>
      </div>

      {/* 🔴 زر إنهاء الجلسة والعودة للرئيسية 🔴 */}
      <button
        type="button"
        aria-label="إنهاء الجلسة الحالية"
        onClick={handleEndSession}
        disabled={ending}
        className="w-full py-5 sm:py-6 rounded-2xl active:scale-[0.98] transition-all flex items-center justify-center border-2 border-red-500 text-white cursor-pointer font-black text-lg sm:text-xl disabled:opacity-50 shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          boxShadow: '0 8px 25px rgba(220, 38, 38, 0.4)',
        }}
      >
        <span className="text-center font-black text-white">
          {ending ? '⏳ جاري إنهاء الجلسة...' : '🚗 إنهاء الجلسة والخروج من الجراج'}
        </span>
      </button>
    </motion.div>
  );
}