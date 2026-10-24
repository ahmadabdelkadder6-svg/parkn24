import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Car,
  Sparkles,
  MapPin,
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
        <p className="text-slate-200 text-base font-black text-center mb-2">جاري مزامنة بيانات الجلسة...</p>
        <p className="text-slate-400 text-xs font-black text-center mb-6">ستظهر بيانات العداد فور استلامها من السيرفر</p>
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
      className="h-full text-white flex flex-col safe-top safe-bottom dir-rtl overflow-hidden"
      style={{
        background: `
          radial-gradient(ellipse at top, ${BRAND.navyLight} 0%, ${BRAND.navy} 60%),
          radial-gradient(ellipse at bottom, rgba(22,86,184,0.08) 0%, transparent 60%)
        `,
      }}
    >
      {/* ═══════════════════════════════
          🎯 القسم العلوي — العداد الكبير
          ═══════════════════════════════ */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 pt-6 pb-3">

        {/* 📱 بادج "جلسة نشطة" فوق العداد */}
        <div
          className="mb-5 px-4 py-1.5 rounded-full flex items-center gap-2 border"
          style={{
            background: 'rgba(140, 198, 63, 0.12)',
            borderColor: 'rgba(140, 198, 63, 0.4)',
          }}
        >
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: BRAND.green, boxShadow: `0 0 8px ${BRAND.green}` }} />
          <span className="text-[11px] font-black tracking-wider" style={{ color: BRAND.green }}>
            جلسة ركن نشطة
          </span>
        </div>

        {/* ⏰ العداد الدائري الكبير */}
        <div className="relative mb-5">
          {/* حلقة خارجية متوهجة */}
          <div
            className="absolute inset-0 rounded-full animate-pulse pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${BRAND.blue}40 0%, transparent 70%)`,
              transform: 'scale(1.15)',
              filter: 'blur(8px)',
            }}
          />

          <div
            className="w-60 h-60 sm:w-64 sm:h-64 rounded-full flex flex-col items-center justify-center border-[3px] relative"
            style={{
              background: 'radial-gradient(circle at 30% 30%, #16254a 0%, #0a1628 70%)',
              borderColor: BRAND.blue,
              boxShadow: `0 0 50px rgba(22, 86, 184, 0.5), inset 0 0 30px rgba(0,0,0,0.5)`,
            }}
          >
            {/* حلقة داخلية */}
            <div
              className="absolute inset-3 rounded-full border opacity-30"
              style={{ borderColor: BRAND.green, borderStyle: 'dashed' }}
            />

            <Clock size={28} style={{ color: BRAND.green }} className="mb-2" />

            <div
              className="text-[42px] sm:text-[46px] font-black font-mono text-white leading-none tracking-wider dir-ltr"
              style={{ textShadow: '0 2px 12px rgba(22,86,184,0.6)' }}
            >
              {formatTime(elapsed)}
            </div>

            <div
              className="text-[10px] font-black mt-3 px-3.5 py-1 rounded-full"
              style={{
                background: 'rgba(10, 22, 40, 0.9)',
                color: BRAND.slateMuted,
                border: `1px solid ${BRAND.border}`,
                letterSpacing: '0.8px',
              }}
            >
              ⏱ مدة الركن الفعلية
            </div>
          </div>
        </div>

        {/* 🚨 تنبيه الإنهاء التلقائي */}
        {showAutoEndWarning && (
          <div
            className="w-full max-w-md rounded-xl px-3.5 py-2.5 mb-3 text-center border-2"
            style={{
              background: 'linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(220,38,38,0.1) 100%)',
              borderColor: 'rgba(239, 68, 68, 0.5)',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.15)',
            }}
          >
            <span className="text-xs font-black text-red-300 flex items-center justify-center gap-1.5">
              ⚠️ سيتم إنهاء الجلسة تلقائياً بعد {autoEndMinutes} دقيقة
            </span>
          </div>
        )}

        {/* 💬 بطاقة الإرشاد */}
        <div
          className="w-full max-w-md rounded-2xl px-4 py-3 text-center border"
          style={{
            background: `linear-gradient(135deg, ${BRAND.navyLight} 0%, rgba(17, 30, 54, 0.6) 100%)`,
            borderColor: BRAND.border,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}
        >
          <div className="flex items-center justify-center gap-2 mb-1.5 font-black text-white text-[14px]">
            <Sparkles size={15} className="text-amber-400 shrink-0" />
            <span>خلّص مشوارك براحتك 🚗</span>
          </div>
          <p
            className="font-black leading-snug mx-auto text-[11px]"
            style={{ color: BRAND.slateMuted, maxWidth: '320px' }}
          >
            وقت الركنة <span className="font-black text-amber-300">محفوظ بالثانية</span> في الخلفية — اقفل التطبيق وافتحه عند الرجوع.
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════
          📋 القسم السفلي — المعلومات والزر
          ═══════════════════════════════ */}
      <div
        className="px-5 pt-4 pb-5 border-t"
        style={{
          background: 'linear-gradient(180deg, transparent 0%, rgba(10, 22, 40, 0.6) 100%)',
          borderColor: BRAND.border,
        }}
      >
        {/* 🚘 رقم السيارة + 📍 الجراج */}
        <div className="w-full grid grid-cols-2 gap-3 mb-3">
          {/* السيارة */}
          <div
            className="border rounded-2xl p-3 text-center"
            style={{
              background: `linear-gradient(135deg, ${BRAND.navyLight} 0%, rgba(17, 30, 54, 0.5) 100%)`,
              borderColor: BRAND.border,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            <div className="flex items-center justify-center gap-1.5 mb-2">
              <Car size={14} style={{ color: BRAND.blue }} />
              <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: BRAND.slateMuted }}>
                سيارتك
              </span>
            </div>
            <div
              className="text-base font-black text-white font-mono tracking-widest py-2 px-2 rounded-lg border"
              style={{
                background: 'rgba(10, 22, 40, 0.9)',
                borderColor: BRAND.border,
                letterSpacing: '2px',
              }}
            >
              {activeSession.carPlate || currentUser?.carPlate || '---'}
            </div>
          </div>

          {/* الجراج */}
          {garage && (
            <div
              className="border rounded-2xl p-3 text-center"
              style={{
                background: `linear-gradient(135deg, ${BRAND.navyLight} 0%, rgba(17, 30, 54, 0.5) 100%)`,
                borderColor: BRAND.border,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <MapPin size={14} style={{ color: BRAND.green }} />
                <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: BRAND.slateMuted }}>
                  الجراج
                </span>
              </div>
              <div
                className="text-[13px] font-black text-white leading-tight py-2 px-1 rounded-lg border truncate"
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

        {/* 📍 موقع الجراج + 📱 مصدر الجلسة (سطر واحد) */}
        <div className="w-full flex items-center justify-center gap-2 mb-4 flex-wrap">
          {garage?.location && (
            <span
              className="font-black text-[11px] px-3 py-1 rounded-full inline-flex items-center gap-1 border"
              style={{
                background: 'rgba(17, 30, 54, 0.6)',
                color: BRAND.slateMuted,
                borderColor: BRAND.border,
              }}
            >
              📍 {garage.location}
            </span>
          )}
          <span
            className="font-black text-[11px] px-3 py-1 rounded-full inline-flex items-center gap-1 border"
            style={{
              background: 'rgba(10, 22, 40, 0.7)',
              color: BRAND.slateMuted,
              borderColor: BRAND.border,
            }}
          >
            {activeSession.source === 'app' ? '📱 من التطبيق' : '🅿️ من الجراج'}
            {(activeSession as any).startedBy === 'garage' && ' • السايس'}
          </span>
        </div>

        {/* 🔴 زر إنهاء الجلسة */}
        <button
          type="button"
          aria-label="إنهاء الجلسة الحالية"
          onClick={handleEndSession}
          disabled={ending}
          className="w-full py-4 rounded-2xl active:scale-[0.98] transition-all flex items-center justify-center border-0 text-white cursor-pointer font-black text-sm sm:text-base disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
            boxShadow: '0 8px 24px rgba(220, 38, 38, 0.45), inset 0 1px 0 rgba(255,255,255,0.15)',
            letterSpacing: '0.3px',
          }}
        >
          <span className="text-center font-black text-white">
            {ending ? '⏳ جاري إنهاء الجلسة...' : '🚗 إنهاء الجلسة والخروج من الجراج'}
          </span>
        </button>
      </div>
    </motion.div>
  );
}