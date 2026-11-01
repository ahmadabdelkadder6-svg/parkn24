// src/components/SessionScreen.tsx

import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Car,
  Sparkles,
  MapPin,
  Navigation,
  CheckCircle2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useStore, normalizePlate, normalizePhone, getServerNow } from '../store';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import ShieldOverlay from './ShieldOverlay';
import {
  getPendingArrival,
  clearPendingArrival,
  stopArrivalTracking,
} from '../utils/mapsNavigation';

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

/* ═══════════════════════════════════════════════════════════
   ⚡ LiveSessionTimer — متوسط الحجم ومتناسق
   ═══════════════════════════════════════════════════════════ */
const LiveSessionTimer = memo(function LiveSessionTimer({
  activeStartMs,
  onAutoEnd,
}: {
  activeStartMs: number;
  onAutoEnd: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const autoEndedRef = useRef(false);
  const onAutoEndRef = useRef(onAutoEnd);
  onAutoEndRef.current = onAutoEnd;

  useEffect(() => {
    if (activeStartMs <= 0) {
      setElapsed(0);
      return;
    }
    autoEndedRef.current = false;

    const calcElapsed = () =>
      Math.max(0, Math.floor((getServerNow() - activeStartMs) / 1000));

    const currentElapsed = calcElapsed();
    setElapsed(currentElapsed);
    if (currentElapsed >= AUTO_END_SECONDS) {
      if (!autoEndedRef.current) {
        autoEndedRef.current = true;
        onAutoEndRef.current();
      }
      return;
    }

    const interval = setInterval(() => {
      const current = calcElapsed();
      setElapsed(current);
      if (current >= AUTO_END_SECONDS && !autoEndedRef.current) {
        autoEndedRef.current = true;
        clearInterval(interval);
        onAutoEndRef.current();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeStartMs]);

  const remainingAutoEnd = Math.max(0, AUTO_END_SECONDS - elapsed);
  const autoEndMinutes = Math.floor((remainingAutoEnd % 3600) / 60);
  const showAutoEndWarning = remainingAutoEnd > 0 && remainingAutoEnd <= 30 * 60;

  return (
    <>
      <div className="relative mb-2">
        <div
          className="w-52 h-52 rounded-full flex flex-col items-center justify-center border-[3px] relative"
          style={{
            background: `
              radial-gradient(circle at 30% 30%, #16254a 0%, #0a1628 70%),
              radial-gradient(circle at 70% 70%, rgba(22,86,184,0.15) 0%, transparent 50%)
            `,
            borderColor: BRAND.blue,
            boxShadow: `
              0 10px 30px rgba(0,0,0,0.4),
              inset 0 0 25px rgba(0,0,0,0.5),
              inset 0 2px 0 rgba(255,255,255,0.08)
            `,
          }}
        >
          <div
            className="absolute inset-2.5 rounded-full border-2 opacity-25 pointer-events-none"
            style={{ borderColor: BRAND.green, borderStyle: 'dashed' }}
          />
          <div className="flex items-center gap-1 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: BRAND.green }} />
            <Clock size={22} style={{ color: BRAND.green }} />
          </div>
          <div
            className="text-[34px] font-black font-mono text-white leading-none tracking-wider dir-ltr"
            style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
          >
            {formatTime(elapsed)}
          </div>
          <div
            className="text-[10px] font-black mt-2.5 px-3 py-0.5 rounded-full"
            style={{
              background: 'rgba(10, 22, 40, 0.9)',
              color: BRAND.slateMuted,
              border: `1px solid ${BRAND.border}`,
              letterSpacing: '0.6px',
            }}
          >
            ⏱ مدة الركن
          </div>
        </div>
      </div>

      {showAutoEndWarning && (
        <div
          className="w-full max-w-md rounded-xl px-3 py-1.5 mb-2 text-center border-2"
          style={{
            background: 'linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(220,38,38,0.1) 100%)',
            borderColor: 'rgba(239, 68, 68, 0.5)',
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.15)',
          }}
        >
          <span className="text-[11px] font-black text-red-300 flex items-center justify-center gap-1.5">
            ⚠️ إنهاء تلقائي بعد {autoEndMinutes} دقيقة
          </span>
        </div>
      )}
    </>
  );
});

/* ═══════════════════════════════════════════════════════════
   📺 SessionScreen
   ═══════════════════════════════════════════════════════════ */
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
    deductWallet,
  } = useStore();

  const userPlate = normalizePlate(currentUser?.carPlate);
  const userPhone = currentUser?.phone ? normalizePhone(currentUser.phone) : '';

  const isMountedRef = useRef(true);
  const redirectedToListRef = useRef(false);
  const redirectedToSessionRef = useRef(false);
  const activeSessionIdRef = useRef<string | null>(null);
  const realtimeChannelRef = useRef<any>(null);
  const autoEndedRef = useRef(false);

  const [ending, setEnding] = useState(false);
  const [shieldResumed, setShieldResumed] = useState<boolean | null>(null);
  const [pendingArrival, setPendingArrival] = useState<any>(null);
  const [startingSession, setStartingSession] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;

    // 🔍 فحص حالة التوجه للجراج المعلقة في الـ Storage عند فتح الشاشة
    const pending = getPendingArrival();
    if (pending) {
      setPendingArrival(pending);
    }

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
    let latest: (typeof sessions)[number] | undefined;
    let maxStart = -1;
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      if (!s || s.status !== 'active') continue;
      if (acknowledgedSessionIds?.has(s.id)) continue;
      const samePlate = !!userPlate && normalizePlate(s.carPlate) === userPlate;
      const sPhone = (s as any).customerPhone ? normalizePhone((s as any).customerPhone) : '';
      const samePhone = Boolean(userPhone && sPhone === userPhone);
      if (!(samePlate || samePhone)) continue;
      const startMs = safeParseTime(s.startTime);
      if (startMs > maxStart) {
        maxStart = startMs;
        latest = s;
      }
    }
    return latest;
  }, [sessions, userPlate, userPhone, acknowledgedSessionIds]);

  const lastCompletedSession = useMemo(() => {
    let latest: (typeof sessions)[number] | undefined;
    let maxEnd = -1;
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      if (!s || s.status !== 'completed') continue;
      const samePlate = !!userPlate && normalizePlate(s.carPlate) === userPlate;
      const sPhone = (s as any).customerPhone ? normalizePhone((s as any).customerPhone) : '';
      const samePhone = Boolean(userPhone && sPhone === userPhone);
      if (!(samePlate || samePhone)) continue;
      const endMs = safeParseTime(s.endTime);
      if (endMs > maxEnd) {
        maxEnd = endMs;
        latest = s;
      }
    }
    return latest;
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

  // 🛡️ استرجاع حالة الدرع من الـ DB
  useEffect(() => {
    if (!activeSession?.id) {
      setShieldResumed(null);
      return;
    }

    let cancelled = false;

    const checkShield = async () => {
      try {
        const { data, error } = await supabase
          .from('shield_sessions')
          .select('session_id')
          .eq('session_id', activeSession.id)
          .is('ended_at', null)
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          console.warn('Shield check error:', error);
          setShieldResumed(false);
          return;
        }

        setShieldResumed(!!data);
      } catch (e) {
        if (!cancelled) {
          console.warn('Shield check failed:', e);
          setShieldResumed(false);
        }
      }
    };

    checkShield();
    return () => { cancelled = true; };
  }, [activeSession?.id]);

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

    const handleVisibility = () => { if (document.visibilityState === 'visible') refetch(); };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', refetch);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', refetch);
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [userPlate, userPhone, fetchAll, isMySessionRow]);

  const handleEndSession = useCallback(async () => {
    if (ending || !activeSession) return;
    setEnding(true);
    try {
      const elapsedSec = Math.floor((getServerNow() - activeStartMs) / 1000);
      await endSession(activeSession.id, Math.max(0, elapsedSec), 'cash', 0);

      await supabase.from('shield_sessions')
        .update({ ended_at: new Date().toISOString(), push_endpoint: null, push_p256dh: null, push_auth: null })
        .eq('session_id', activeSession.id).is('ended_at', null);

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

      await supabase.from('shield_sessions')
        .update({ ended_at: new Date().toISOString(), push_endpoint: null, push_p256dh: null, push_auth: null })
        .eq('session_id', activeSession.id).is('ended_at', null);

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

  // ✅ البدء المباشر للجلسة عند ضغط "وصلت للجراج وبدأ الركن"
  const handleConfirmArrivalAndStartSession = useCallback(async () => {
    if (!pendingArrival || startingSession) return;
    setStartingSession(true);
    try {
      stopArrivalTracking();
      clearPendingArrival();

      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('sessions')
        .insert({
          garage_id: pendingArrival.garageId || null,
          car_plate: userPlate || currentUser?.carPlate || '',
          customer_phone: userPhone || currentUser?.phone || '',
          start_time: nowIso,
          status: 'active',
        });

      if (error) {
        console.warn('⚠️ تعذر إنشاء الجلسة في السيرفر:', error);
      }

      toast.success('تم وصولك للجراج وبدأ الركن بنجاح! 🚗', { icon: '✅', duration: 4000 });
      await fetchAll();
      setPendingArrival(null);
    } catch (err: any) {
      toast.error('حدث خطأ أثناء بدء الجلسة');
      console.error(err);
    } finally {
      setStartingSession(false);
    }
  }, [pendingArrival, startingSession, userPlate, userPhone, currentUser, fetchAll]);

  const handleCancelPendingArrival = useCallback(() => {
    stopArrivalTracking();
    clearPendingArrival();
    setPendingArrival(null);
    setSelectedGarageId(null);
    setScreen('list');
  }, [setSelectedGarageId, setScreen]);

  useEffect(() => {
    if (!activeSession) { redirectedToSessionRef.current = false; return; }
    if (redirectedToSessionRef.current) return;
    redirectedToSessionRef.current = true;
    if (activeSession.garageId) setSelectedGarageId(activeSession.garageId);
  }, [activeSession, setSelectedGarageId]);

  // 🛡️ حماية من التوجيه المفاجئ للرئيسية لو في حالة توجه للجراج (pendingArrival)
  useEffect(() => {
    if (activeSession || pendingArrival) {
      redirectedToListRef.current = false;
      return;
    }

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
    } else if (!lastCompletedSession && !redirectedToListRef.current) {
      redirectedToListRef.current = true;
      if (isMountedRef.current) {
        setSelectedGarageId(null);
        setScreen('list');
      }
    }
  }, [activeSession, pendingArrival, lastCompletedSession, sessions, setScreen, setSelectedGarageId, acknowledgedSessionIds, acknowledgeSession]);

  // ═══════════════════════════════════════════════════════
  // 🟢 حالة 1: المستخدم في الطريق للوصول للجراج
  // ═══════════════════════════════════════════════════════
  if (!activeSession && pendingArrival) {
    return (
      <motion.div
        className="h-full flex flex-col justify-between bg-slate-950 text-white p-5 dir-rtl overflow-y-auto"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="space-y-6 mt-4 text-center">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center mx-auto border-2 relative animate-pulse"
            style={{
              background: 'rgba(22, 86, 184, 0.15)',
              borderColor: BRAND.blue,
              boxShadow: '0 0 30px rgba(22, 86, 184, 0.3)',
            }}
          >
            <Navigation size={44} style={{ color: BRAND.blue }} />
          </div>

          <div className="space-y-2">
            <span
              className="px-3.5 py-1 rounded-full text-xs font-black inline-flex items-center gap-1.5 border"
              style={{
                background: 'rgba(140, 198, 63, 0.15)',
                borderColor: 'rgba(140, 198, 63, 0.4)',
                color: BRAND.green,
              }}
            >
              <span className="w-2 h-2 rounded-full animate-ping" style={{ background: BRAND.green }} />
              📌 جاري التوجه إلى الجراج
            </span>

            <h2 className="text-2xl font-black text-white">{pendingArrival.garageName || 'الجراج المختار'}</h2>
            <p className="text-xs font-bold text-slate-400 max-w-xs mx-auto">
              الملاحة الصوتية شغالة عبر Google Maps، والرادار يراقب وصولك تلقائياً
            </p>
          </div>

          <div
            className="rounded-2xl p-4 text-right space-y-3 border"
            style={{
              background: `linear-gradient(135deg, ${BRAND.navyLight} 0%, rgba(17, 30, 54, 0.85) 100%)`,
              borderColor: BRAND.border,
            }}
          >
            <div className="flex items-start gap-3 text-slate-200 text-xs font-bold">
              <MapPin size={18} style={{ color: BRAND.blue }} className="shrink-0 mt-0.5" />
              <span>أول ما توصل الجراج، اضغط على الزر الأخضر بالأسفل لبدء حساب الوقت وتفعيل درع المراقبة.</span>
            </div>
            <div className="flex items-start gap-3 text-slate-200 text-xs font-bold">
              <ShieldCheck size={18} style={{ color: BRAND.green }} className="shrink-0 mt-0.5" />
              <span>الدرع هيراقب الحركة وسيارتك مركونة وهيحميك من أي تحرك غير مصرح به.</span>
            </div>
          </div>
        </div>

        <div className="space-y-3 my-4">
          <button
            type="button"
            onClick={handleConfirmArrivalAndStartSession}
            disabled={startingSession}
            className="w-full py-4 rounded-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 border-0 text-white font-black text-base cursor-pointer shadow-lg disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, ${BRAND.green} 0%, ${BRAND.greenDark} 100%)`,
              boxShadow: '0 8px 24px rgba(140, 198, 63, 0.35)',
            }}
          >
            <CheckCircle2 size={22} />
            <span>{startingSession ? '⏳ جاري بدء الركن...' : 'وصلت للجراج وبدأ الركن ✅'}</span>
          </button>

          <button
            type="button"
            onClick={handleCancelPendingArrival}
            className="w-full py-3 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-400 font-bold text-xs border border-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <XCircle size={15} />
            <span>إلغاء التوجه والعودة للرئيسية</span>
          </button>
        </div>
      </motion.div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // 🎨 حالة 2: جلسة ركن نشطة (الدرع + العداد)
  // ═══════════════════════════════════════════════════════
  if (!activeSession) return null;

  return (
    <motion.div
      className="h-full flex flex-col bg-slate-950 text-white overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      dir="rtl"
    >
      <div className="flex-1 flex flex-col items-center px-4 pt-3 pb-2 gap-2.5 overflow-y-auto">
        {/* بادج "جلسة نشطة" */}
        <div
          className="px-3.5 py-1 rounded-full flex items-center gap-2 border"
          style={{
            background: 'rgba(140, 198, 63, 0.12)',
            borderColor: 'rgba(140, 198, 63, 0.4)',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: BRAND.green, boxShadow: `0 0 8px ${BRAND.green}` }} />
          <span className="text-[10px] font-black tracking-wider" style={{ color: BRAND.green }}>
            جلسة ركن نشطة
          </span>
        </div>

        {/* 🛡️ الدرع */}
        {garage && shieldResumed !== null && (
          <div className="w-full max-w-md">
            <ShieldOverlay
              key={shieldResumed ? 'resumed' : 'fresh'}
              sessionId={activeSession.id}
              userId={currentUser?.id || ''}
              garageId={activeSession.garageId}
              parkingLat={(garage as any).lat ?? 30.0444}
              parkingLng={(garage as any).lng ?? 31.2357}
              userPhone={currentUser?.phone ?? null}
              onDeductWallet={deductWallet}
              onNavigateToWallet={() => setScreen('list')}
              autoResume={shieldResumed}
              onSessionEnd={handleEndSession}
            />
          </div>
        )}

        {/* ⚡ العداد — حجم متوسط ومتناسق */}
        <LiveSessionTimer
          activeStartMs={activeStartMs}
          onAutoEnd={handleAutoEnd}
        />

        {/* 💬 بطاقة الإرشاد */}
        <div
          className="w-full max-w-md rounded-xl px-3 py-2 text-center border"
          style={{
            background: `linear-gradient(135deg, ${BRAND.navyLight} 0%, rgba(17, 30, 54, 0.85) 100%)`,
            borderColor: BRAND.border,
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}
        >
          <div className="flex items-center justify-center gap-1.5 mb-0.5 font-black text-white text-[12px]">
            <Sparkles size={12} className="text-amber-400 shrink-0" />
            <span>خلّص مشوارك براحتك 🚗</span>
          </div>
          <p
            className="font-black leading-snug mx-auto text-[10px]"
            style={{ color: BRAND.slateMuted, maxWidth: '320px' }}
          >
            وقتك <span className="text-amber-300">محفوظ بالثانية</span> — اقفل التطبيق وافتحه عند الرجوع.
          </p>
        </div>
      </div>

      {/* 📋 القسم السفلي */}
      <div
        className="px-4 pt-3 pb-4 border-t shrink-0"
        style={{
          background: 'linear-gradient(180deg, transparent 0%, rgba(10, 22, 40, 0.6) 100%)',
          borderColor: BRAND.border,
        }}
      >
        <div className="w-full grid grid-cols-2 gap-2 mb-2.5">
          <div
            className="border rounded-xl p-2 text-center"
            style={{
              background: `linear-gradient(135deg, ${BRAND.navyLight} 0%, rgba(17, 30, 54, 0.5) 100%)`,
              borderColor: BRAND.border,
            }}
          >
            <div className="flex items-center justify-center gap-1 mb-1">
              <Car size={11} style={{ color: BRAND.blue }} />
              <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: BRAND.slateMuted }}>
                سيارتك
              </span>
            </div>
            <div
              className="text-[13px] font-black text-white font-mono tracking-widest py-1.5 px-1 rounded-md border"
              style={{
                background: 'rgba(10, 22, 40, 0.9)',
                borderColor: BRAND.border,
                letterSpacing: '2px',
              }}
            >
              {activeSession.carPlate || currentUser?.carPlate || '---'}
            </div>
          </div>

          {garage && (
            <div
              className="border rounded-xl p-2 text-center"
              style={{
                background: `linear-gradient(135deg, ${BRAND.navyLight} 0%, rgba(17, 30, 54, 0.5) 100%)`,
                borderColor: BRAND.border,
              }}
            >
              <div className="flex items-center justify-center gap-1 mb-1">
                <MapPin size={11} style={{ color: BRAND.green }} />
                <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: BRAND.slateMuted }}>
                  الجراج
                </span>
              </div>
              <div
                className="text-[11px] font-black text-white leading-tight py-1.5 px-1 rounded-md border truncate"
                style={{
                  background: 'rgba(10, 22, 40, 0.9)',
                  borderColor: BRAND.border,
                }}
                title={garage.name}
              >
                {garage.name}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label="إنهاء الجلسة الحالية"
          onClick={handleEndSession}
          disabled={ending}
          className="w-full py-3.5 rounded-2xl active:scale-[0.98] transition-all flex items-center justify-center border-0 text-white cursor-pointer font-black text-sm disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
            boxShadow: '0 8px 24px rgba(220, 38, 38, 0.45), inset 0 1px 0 rgba(255,255,255,0.15)',
            letterSpacing: '0.3px',
          }}
        >
          <span className="text-center font-black text-white">
            {ending ? '⏳ جاري إنهاء الجلسة...' : '🚗 إنهاء الجلسة والخروج'}
          </span>
        </button>
      </div>
    </motion.div>
  );
}