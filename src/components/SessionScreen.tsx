import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Car,
  Sparkles,
  MapPin,
  Wallet,
} from 'lucide-react';
import { useStore, normalizePlate, normalizePhone, getServerNow } from '../store';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import ShieldOverlay from './ShieldOverlay';

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
const MIN_WALLET_BALANCE = 10; // 💰 الحد الأدنى للرصيد

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
   ⚡ LiveSessionTimer — المكوّن الوحيد اللي بيتحدث كل ثانية
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
      {/* ⏰ العداد الدائري */}
      <div className="relative mb-5">
        <div
          className="w-60 h-60 sm:w-64 sm:h-64 rounded-full flex flex-col items-center justify-center border-[3px] relative"
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
            className="absolute inset-3 rounded-full border-2 opacity-25 pointer-events-none"
            style={{ borderColor: BRAND.green, borderStyle: 'dashed' }}
          />

          <div className="flex items-center gap-1.5 mb-2">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: BRAND.green }}
            />
            <Clock size={26} style={{ color: BRAND.green }} />
          </div>

          <div
            className="text-[42px] sm:text-[46px] font-black font-mono text-white leading-none tracking-wider dir-ltr"
            style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
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
    </>
  );
});

/* ═══════════════════════════════════════════════════════════
   💰 LowBalanceScreen — شاشة الرصيد الناقص
   ═══════════════════════════════════════════════════════════ */
const LowBalanceScreen = memo(function LowBalanceScreen({
  currentBalance,
  onNavigateToWallet,
}: {
  currentBalance: number;
  onNavigateToWallet: () => void;
}) {
  return (
    <div
      className="h-full text-white flex flex-col items-center justify-center p-8 dir-rtl"
      style={{
        background: `
          radial-gradient(ellipse at top, #1a1a2e 0%, #0a1628 60%),
          radial-gradient(ellipse at bottom, rgba(239,68,68,0.08) 0%, transparent 60%)
        `,
      }}
    >
      <style>{`
        @keyframes shimmerBtn {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(239,68,68,0.15); }
          50% { box-shadow: 0 0 40px rgba(239,68,68,0.3); }
        }
      `}</style>

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 15 }}
        className="text-center max-w-sm"
      >
        {/* أيقونة المحفظة */}
        <div
          className="w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.05) 100%)',
            border: '2px solid rgba(239,68,68,0.3)',
            animation: 'pulseGlow 2s ease-in-out infinite',
          }}
        >
          <Wallet size={40} className="text-red-400" />
        </div>

        <h2 className="text-xl font-black text-white mb-2">رصيدك مش كافي</h2>
        <p className="text-slate-400 text-sm font-bold mb-3 leading-relaxed">
          رصيدك الحالي في المحفظة
        </p>

        {/* الرصيد الحالي */}
        <div
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full mb-5"
          style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
          }}
        >
          <span className="font-mono font-black text-2xl text-red-400">
            {currentBalance.toFixed(0)}
          </span>
          <span className="text-red-400/70 font-bold text-sm">ج.م</span>
        </div>

        <div
          className="w-full rounded-2xl p-4 mb-6 border"
          style={{
            background: 'rgba(245, 158, 11, 0.08)',
            borderColor: 'rgba(245, 158, 11, 0.25)',
          }}
        >
          <p className="text-amber-300 text-xs font-black mb-1.5">
            ⚠️ الحد الأدنى للاستخدام: {MIN_WALLET_BALANCE} ج.م
          </p>
          <p className="text-slate-400 text-[11px] font-bold leading-relaxed">
            اشحن محفظتك الأول لتقدر تستخدم الدرع وتدفع الجلسات بسهولة.
            جلستك الحالية هتفضل محفوظة.
          </p>
        </div>

        {/* زرار الشحن */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onNavigateToWallet}
          className="w-full py-4 rounded-2xl text-white font-black text-base relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #1656b8 0%, #0f3d85 100%)',
            boxShadow: '0 8px 24px rgba(22,86,184,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
          }}
        >
          <div
            className="absolute inset-0 opacity-20"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
              animation: 'shimmerBtn 2s infinite',
            }}
          />
          <span className="relative z-10 flex items-center justify-center gap-2">
            💳 اشحن المحفظة الآن
          </span>
        </motion.button>

        <p className="text-slate-500 text-[10px] font-bold mt-4">
          الجلسة هتفضل شغالة — اشحن وارجع كمّل
        </p>
      </motion.div>
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════
   📺 SessionScreen — الشاشة الرئيسية
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

  // ═══════════════════════════════
  // 💰 شرط الرصيد — لو أقل من 10 ج → شاشة الشحن
  // (يتفعّل بس لو في جلسة شغالة من التطبيق — مش من السايس)
  // ═══════════════════════════════
  const userWallet = currentUser?.wallet ?? 0;
  const shouldBlockForLowBalance = useMemo(() => {
    if (!activeSession) return false;
    // الجلسات من السايس (مش من التطبيق) مش بتتأثر بالرصيد
    if (activeSession.source !== 'app') return false;
    return userWallet < MIN_WALLET_BALANCE;
  }, [activeSession, userWallet]);

  if (shouldBlockForLowBalance) {
    return (
      <LowBalanceScreen
        currentBalance={userWallet}
        onNavigateToWallet={() => setScreen('list')}
      />
    );
  }

  if (!activeSession) {
    return (
      <div className="h-full text-white flex flex-col items-center justify-center p-8 text-right dir-rtl" style={{ background: BRAND.navy }}>
        <div className="text-5xl mb-4 animate-bounce">⏳</div>
        <p className="text-slate-200 text-base font-black text-center mb-2">جاري مزامنة بيانات الجلسة...</p>
        <p className="text-slate-400 text-xs font-black text-center mb-6">ستظهر بيانات العداد فور استلامها من السيرفر</p>
      </div>
    );
  }

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
          🎯 القسم العلوي — الدرع + العداد
          ═══════════════════════════════ */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 pt-6 pb-3">

        {/* بادج "جلسة نشطة" */}
        <div
          className="mb-4 px-4 py-1.5 rounded-full flex items-center gap-2 border"
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

        {/* 🛡️ الدرع — فوق العداد مباشرة */}
        {activeSession && garage && (
          <ShieldOverlay
            sessionId={activeSession.id}
            garageId={activeSession.garageId}
            garageLat={(garage as any).lat}
            garageLng={(garage as any).lng}
            walletBalance={userWallet}
            onDeductWallet={deductWallet}
            onNavigateToWallet={() => setScreen('list')}
          />
        )}

        {/* ⚡ العداد */}
        <LiveSessionTimer
          activeStartMs={activeStartMs}
          onAutoEnd={handleAutoEnd}
        />

        {/* 💬 بطاقة الإرشاد */}
        <div
          className="w-full max-w-md rounded-2xl px-4 py-3 text-center border"
          style={{
            background: `linear-gradient(135deg, ${BRAND.navyLight} 0%, rgba(17, 30, 54, 0.85) 100%)`,
            borderColor: BRAND.border,
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
          📋 القسم السفلي — معلومات + زر
          ═══════════════════════════════ */}
      <div
        className="px-5 pt-4 pb-5 border-t"
        style={{
          background: 'linear-gradient(180deg, transparent 0%, rgba(10, 22, 40, 0.6) 100%)',
          borderColor: BRAND.border,
        }}
      >
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