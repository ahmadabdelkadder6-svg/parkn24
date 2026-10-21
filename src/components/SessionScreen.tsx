import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Car,
  Sparkles,
} from 'lucide-react';
// 🌟 استيراد getServerNow ودوال البصمة لضمان مطابقة العداد بالملي ثانية بين جميع الهواتف
import { useStore, normalizePlate, normalizePhone, getServerNow } from '../store';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

/* ─── 🎨 الألوان الرسمية الفاخرة لتطبيق Park'n 24 ─── */
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
  border: 'rgba(255, 255, 255, 0.08)',
};

// ⏰ حد الإنهاء التلقائي: 6 ساعات
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

// 🕐 تنسيق الثواني لصيغة (س:د:ث) — محلية بدل pricing
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
  const redirectedToSummaryRef = useRef(false);
  const redirectedToSessionRef = useRef(false);
  const activeSessionIdRef = useRef<string | null>(null);
  const realtimeChannelRef = useRef<any>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const summaryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoEndedRef = useRef(false);

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (summaryTimeoutRef.current) {
        clearTimeout(summaryTimeoutRef.current);
      }
    };
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

  // ✅ البحث عن الجلسة النشطة بالبصمة الموحدة
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

  // ✅ حساب وقت البداية مع Fallback بتوقيت السيرفر الموحد
  const activeStartMs = useMemo(() => {
    if (!activeSession) return 0;
    const ms = safeParseTime(activeSession.startTime);
    return ms > 0 ? ms : getServerNow();
  }, [activeSession]);

  // 📡 جلب البيانات في الخلفية
  useEffect(() => {
    fetchAll().catch((e) => console.error('Fetch error:', e));
  }, [fetchAll]);

  // Realtime
  useEffect(() => {
    if (!userPlate && !userPhone) return;
    let cancelled = false;

    const refetch = async () => {
      if (cancelled || !isMountedRef.current) return;
      try {
        await fetchAll();
      } catch (e) {
        console.error('❌ Realtime fetch error:', e);
      }
    };

    const channel = supabase.channel(`customer-session-live-${userPlate || userPhone}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions' },
        async (payload) => {
          const newRow = payload.new as any;
          const oldRow = payload.old as any;
          if (isMySessionRow(newRow) || isMySessionRow(oldRow)) {
            await refetch();
          }
        },
      )
      .subscribe();

    realtimeChannelRef.current = channel;
    pollingRef.current = setInterval(refetch, 4000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', refetch);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', refetch);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [userPlate, userPhone, fetchAll, isMySessionRow]);

  // ⏰ إنهاء تلقائي بعد 6 ساعات
  const handleAutoEnd = useCallback(async () => {
    if (autoEndedRef.current || !activeSession) return;
    autoEndedRef.current = true;

    try {
      await endSession(activeSession.id, 0, 'cash', 0);
      if (typeof acknowledgeSession === 'function') {
        acknowledgeSession(activeSession.id);
      }
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

  // ⏱️ عداد الثواني اللحظي + فحص الـ 6 ساعات
  useEffect(() => {
    if (!activeSession || activeStartMs <= 0) {
      setElapsed(0);
      return;
    }

    autoEndedRef.current = false;

    const calcElapsed = () => {
      const now = getServerNow();
      const diff = now - activeStartMs;
      return Math.max(0, Math.floor(diff / 1000));
    };

    const currentElapsed = calcElapsed();
    setElapsed(currentElapsed);

    // لو فتح التطبيق بعد 6 ساعات → إنهاء فوري
    if (currentElapsed >= AUTO_END_SECONDS) {
      handleAutoEnd();
      return;
    }

    const interval = setInterval(() => {
      if (!isMountedRef.current) return;
      const current = calcElapsed();
      setElapsed(current);

      // لو عدت 6 ساعات → إنهاء تلقائي
      if (current >= AUTO_END_SECONDS && !autoEndedRef.current) {
        clearInterval(interval);
        handleAutoEnd();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession, activeStartMs, handleAutoEnd]);

  useEffect(() => {
    if (!activeSession) {
      redirectedToSessionRef.current = false;
      return;
    }
    if (redirectedToSessionRef.current) return;
    redirectedToSessionRef.current = true;
    if (activeSession.garageId) {
      setSelectedGarageId(activeSession.garageId);
    }
  }, [activeSession, setSelectedGarageId]);

  // التحويل التلقائي عند انتهاء الجلسة
  useEffect(() => {
    if (activeSession) {
      redirectedToSummaryRef.current = false;
      return;
    }

    if (activeSessionIdRef.current) {
      const targetSession = sessions.find((s) => s.id === activeSessionIdRef.current);
      if (targetSession && targetSession.status === 'completed' && !redirectedToSummaryRef.current) {
        redirectedToSummaryRef.current = true;
        if (targetSession.garageId) setSelectedGarageId(targetSession.garageId);
        if (typeof acknowledgeSession === 'function') acknowledgeSession(targetSession.id);
        activeSessionIdRef.current = null;
        toast.success('تم إنهاء الجلسة ✅', { icon: '🏁', duration: 3000 });
        summaryTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) setScreen('summary');
        }, 400);
        return;
      }
    }

    if (lastCompletedSession && !redirectedToSummaryRef.current) {
      const isNotAcknowledged = acknowledgedSessionIds ? !acknowledgedSessionIds.has(lastCompletedSession.id) : true;
      if (isNotAcknowledged) {
        redirectedToSummaryRef.current = true;
        if (lastCompletedSession.garageId) setSelectedGarageId(lastCompletedSession.garageId);
        if (typeof acknowledgeSession === 'function') acknowledgeSession(lastCompletedSession.id);
        toast.success('تم إنهاء الجلسة بنجاح ✅', { icon: '🏁', duration: 3000 });
        summaryTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) setScreen('summary');
        }, 400);
      }
    }
  }, [activeSession, lastCompletedSession, sessions, setScreen, setSelectedGarageId, acknowledgedSessionIds, acknowledgeSession]);

  // شاشة الانتظار والمزامنة
  if (!activeSession) {
    return (
      <div className="h-full text-white flex flex-col items-center justify-center p-8 text-right" style={{ background: BRAND.navy }}>
        <div className="text-4xl mb-4 animate-bounce">⏳</div>
        <p className="text-slate-400 text-sm font-bold text-center mb-2">جاري مزامنة بيانات الجلسة...</p>
        <p className="text-slate-500 text-xs text-center mb-6">ستظهر بيانات العداد فور استلامها من السيرفر</p>
      </div>
    );
  }

  // ⏰ حساب الوقت المتبقي قبل الإنهاء التلقائي
  const remainingAutoEnd = Math.max(0, AUTO_END_SECONDS - elapsed);
  const autoEndHours = Math.floor(remainingAutoEnd / 3600);
  const autoEndMinutes = Math.floor((remainingAutoEnd % 3600) / 60);
  const showAutoEndWarning = remainingAutoEnd > 0 && remainingAutoEnd <= 30 * 60; // آخر 30 دقيقة

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full text-white flex flex-col items-center justify-center p-6 overflow-y-auto safe-top safe-bottom"
      style={{ background: BRAND.navy }}
    >
      {/* حلقة العداد الدائرية الكبيرة المتوهجة بالكامل */}
      <div
        className="w-44 h-44 rounded-full flex flex-col items-center justify-center border-2 mb-6 transition-shadow"
        style={{
          background: BRAND.navyLight,
          borderColor: BRAND.blue,
          boxShadow: '0 0 40px rgba(22, 86, 184, 0.25)',
        }}
      >
        <Clock size={24} style={{ color: BRAND.blue }} className="mb-1.5" />
        <div className="text-3xl font-black font-mono text-white leading-none">{formatTime(elapsed)}</div>
        <div className="text-[10px] font-bold mt-2" style={{ color: BRAND.slateMuted }}>مدة الركن الفعلية</div>
      </div>

      {/* ⏰ تحذير الإنهاء التلقائي (آخر 30 دقيقة) */}
      {showAutoEndWarning && (
        <div
          className="w-full rounded-2xl p-3 mb-4 text-center border animate-pulse"
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            borderColor: 'rgba(239, 68, 68, 0.4)',
          }}
        >
          <span className="text-xs font-black text-red-400">
            ⏰ سيتم إنهاء الجلسة تلقائياً بعد {autoEndMinutes} دقيقة
          </span>
        </div>
      )}

      {/* 💡 بانر إرشادي */}
      <div
        className="w-full rounded-2xl p-3.5 mb-4 text-center border"
        style={{
          background: 'rgba(255, 255, 255, 0.02)',
          borderColor: BRAND.border,
        }}
      >
        <div className="flex items-center justify-center gap-1.5 mb-1 font-black text-white" style={{ fontSize: '12px' }}>
          <Sparkles size={13} className="text-yellow-400 shrink-0 animate-pulse" />
          <span>خلّص مشوارك براحتك 🚗✨</span>
        </div>
        <p
          className="font-bold leading-relaxed mx-auto"
          style={{
            fontSize: '10px',
            color: BRAND.slateMuted,
            maxWidth: '280px'
          }}
        >
          وقت الركنة <span className="font-black text-white">محفوظ بالثانية</span> في الخلفية.
          أغلق التطبيق الآن وافتحه عند العودة للجراج لإنهاء الجلسة.
        </p>
      </div>

      {/* بيانات السيارة */}
      <div className="w-full mb-4">
        <div className="border p-4 rounded-2xl text-center" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
          <Car size={18} style={{ color: BRAND.blue }} className="mx-auto mb-1.5" />
          <div className="text-sm font-black text-white font-mono">{activeSession.carPlate || currentUser?.carPlate || '---'}</div>
          <div className="text-[9px] font-bold mt-1.5" style={{ color: BRAND.slateMuted }}>رقم سيارتك</div>
        </div>
      </div>

      {/* بيانات الجراج */}
      {garage && (
        <div className="border p-4 rounded-2xl w-full text-center mb-3" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
          <div className="text-[9px] font-bold mb-1" style={{ color: BRAND.slateMuted }}>الجراج الحالي</div>
          <div className="text-sm font-black" style={{ color: '#ffffff' }}>{garage.name}</div>
          {garage.location && (
            <div className="text-[10px] font-bold mt-1" style={{ color: BRAND.slateMuted }}>
              📍 {garage.location}
            </div>
          )}
        </div>
      )}

      <div className="w-full text-center mb-4">
        <span className="font-bold text-[9px]" style={{ color: BRAND.slateMuted }}>
          {activeSession.source === 'app' ? '📱 بدأت من التطبيق' : '🅿️ بدأت من الجراج'}
          {(activeSession as any).startedBy === 'garage' && ' (بواسطة السايس)'}
        </span>
      </div>

      {/* زر إنهاء الجلسة الفاخر — الزر الوحيد */}
      <button
        type="button"
        aria-label="إنهاء الجلسة الحالية"
        onClick={() => setScreen('summary')}
        className="w-full py-4 rounded-xl active:scale-[0.98] transition-all flex items-center justify-center border-0 text-white cursor-pointer font-black"
        style={{
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          boxShadow: '0 4px 14px rgba(220,38,38,0.25)',
        }}
      >
        <span className="text-center text-sm font-black" style={{ color: '#ffffff' }}>
          🚗 إنهاء الجلسة وطلوع من الجراج
        </span>
      </button>
    </motion.div>
  );
}