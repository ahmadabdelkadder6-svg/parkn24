// src/components/SessionScreen.tsx
// ═══════════════════════════════════════════════════════════
// 🛡️ Tactical Radar Session Screen (Zero-Latency & Accurate Coordinates)
// ═══════════════════════════════════════════════════════════
import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Car,
  MapPin,
  AlertTriangle,
  Radio,
  Navigation,
  LogOut,
  VolumeX,
} from 'lucide-react';
import { useStore, normalizePlate, normalizePhone, getServerNow } from '../store';
import { supabase } from '../lib/supabase';
import { buildGoogleMapsUrl } from '../utils/mapsNavigation';
import toast from 'react-hot-toast';
import {
  armBackgroundAudio,
  startShieldGPS,
  stopShieldGPS,
  triggerBreachAlarm,
  stopIntenseAlarm,
  destroyShield,
  registerShieldSession,
} from '../lib/shield';

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

const AUTO_END_SECONDS = 6 * 60 * 60; // 6 ساعات كحد أقصى

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
   🛰️ TacticalRadarScope (رادار الحماية التكتيكي - إحداثيات حية دقيقة)
   ═══════════════════════════════════════════════════════════ */
const TacticalRadarScope = memo(function TacticalRadarScope({
  carPlate,
  isShieldActive,
  displayLat,
  displayLng,
}: {
  carPlate: string;
  isShieldActive: boolean;
  displayLat: number;
  displayLng: number;
}) {
  const formattedLat = displayLat ? `LAT ${displayLat.toFixed(4)}°` : 'GPS LOCKING...';
  const formattedLng = displayLng ? `LNG ${displayLng.toFixed(4)}°` : 'CALIBRATING...';

  return (
    <div
      className={`relative w-64 h-64 my-1 flex items-center justify-center rounded-full transition-all duration-700 ${
        isShieldActive
          ? 'bg-slate-950/80 shadow-[0_0_35px_rgba(22,86,184,0.35)_inset]'
          : 'bg-slate-950/90 shadow-[0_0_25px_rgba(239,68,68,0.2)_inset]'
      }`}
    >
      {/* 1. حلقات المدى الجغرافي */}
      <div className={`absolute inset-0 rounded-full border ${isShieldActive ? 'border-sky-500/20' : 'border-red-900/30'}`} />
      <div className={`absolute inset-6 rounded-full border ${isShieldActive ? 'border-sky-400/25' : 'border-slate-800/40'}`} />
      <div className={`absolute inset-14 rounded-full border border-dashed ${isShieldActive ? 'border-emerald-500/40 animate-pulse' : 'border-red-500/20'}`} />
      <div className={`absolute inset-22 rounded-full border ${isShieldActive ? 'border-sky-400/20' : 'border-slate-800/30'}`} />
      
      {/* 2. خطوط الشبكة المتقاطعة (Crosshairs) */}
      <div className={`absolute inset-x-0 top-1/2 h-[1px] pointer-events-none ${isShieldActive ? 'bg-sky-500/25' : 'bg-red-500/15'}`} />
      <div className={`absolute inset-y-0 left-1/2 w-[1px] pointer-events-none ${isShieldActive ? 'bg-sky-500/25' : 'bg-red-500/15'}`} />
      
      {/* 3. شعاع المسح الراداري الدوار + نبض الأمان */}
      {isShieldActive ? (
        <>
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background:
                'conic-gradient(from 0deg, rgba(140, 198, 63, 0.45) 0deg, rgba(22, 86, 184, 0.15) 45deg, transparent 90deg, transparent 360deg)',
              animation: 'radar-spin 3.2s linear infinite',
            }}
          />
          <div
            className="absolute w-20 h-20 rounded-full border border-emerald-400/50 pointer-events-none"
            style={{ animation: 'radar-wave 2.4s cubic-bezier(0, 0.2, 0.8, 1) infinite' }}
          />
        </>
      ) : (
        <div className="absolute inset-4 rounded-full border border-red-500/10 pointer-events-none flex items-center justify-center">
          <div className="w-full h-[1px] bg-red-500/20 -rotate-45" />
        </div>
      )}

      {/* 4. نقطة الهدف: العربية في المركز */}
      <div className="relative z-10 flex flex-col items-center justify-center">
        <div className="relative flex items-center justify-center">
          <div
            className={`w-12 h-12 rounded-full border-2 flex items-center justify-center shadow-lg transition-all ${
              isShieldActive
                ? 'bg-slate-900/90 border-emerald-400 shadow-[0_0_15px_#8cc63f]'
                : 'bg-slate-900/90 border-red-500/60 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
            }`}
          >
            {isShieldActive ? (
              <Car size={22} className="text-emerald-400" />
            ) : (
              <AlertTriangle size={20} className="text-red-400 animate-pulse" />
            )}
          </div>
          {isShieldActive ? (
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500" />
            </span>
          ) : (
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500/80" />
            </span>
          )}
        </div>

        {/* بادج حالة القفل وتأمين النطاق */}
        <div
          className={`mt-2 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border shadow-md ${
            isShieldActive
              ? 'bg-slate-900/95 border-emerald-500/50'
              : 'bg-slate-900/95 border-red-500/40'
          }`}
        >
          <Radio size={10} className={isShieldActive ? 'text-emerald-400 animate-pulse' : 'text-red-400'} />
          <span
            className={`text-[9px] font-black tracking-widest font-mono uppercase ${
              isShieldActive ? 'text-emerald-300' : 'text-red-400'
            }`}
          >
            {isShieldActive ? 'GPS LOCK: 50M SECURE' : 'RADAR: OFF (NO SHIELD)'}
          </span>
        </div>
      </div>

      {/* 5. علامات المدى التكتيكية الحقيقية */}
      <div className={`absolute top-2 font-mono text-[8px] font-bold tracking-widest ${isShieldActive ? 'text-sky-400/80' : 'text-slate-600'}`}>
        {formattedLat}
      </div>
      <div className={`absolute bottom-2 font-mono text-[8px] font-bold tracking-widest ${isShieldActive ? 'text-sky-400/80' : 'text-red-400/70'}`}>
        {isShieldActive ? 'RANGE: 50m GEO-FENCE' : 'PROTECTION DISABLED'}
      </div>
      <div className={`absolute right-2 font-mono text-[8px] font-bold ${isShieldActive ? 'text-emerald-400/80' : 'text-red-500/60'}`}>
        {isShieldActive ? '[LIVE]' : '[OFF]'}
      </div>
      <div className={`absolute left-2 font-mono text-[8px] font-bold ${isShieldActive ? 'text-sky-400/80' : 'text-slate-600'}`}>
        {formattedLng}
      </div>
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════
   ⚡ LiveSessionTimer
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
      <div
        className="flex items-center justify-between w-full max-w-xs px-4 py-2 rounded-2xl border mb-1"
        style={{
          background: 'linear-gradient(135deg, rgba(10, 22, 40, 0.95) 0%, rgba(19, 36, 61, 0.9) 100%)',
          borderColor: 'rgba(22, 86, 184, 0.4)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}
      >
        <div className="flex items-center gap-1.5">
          <Clock size={16} className="text-emerald-400 animate-pulse" />
          <span className="text-[11px] font-black text-slate-300">مدة الركن:</span>
        </div>
        <div
          className="text-[22px] font-black font-mono text-white tracking-widest dir-ltr"
          style={{ textShadow: '0 0 10px rgba(140, 198, 63, 0.5)' }}
        >
          {formatTime(elapsed)}
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
  } = useStore();

  const userPlate = normalizePlate(currentUser?.carPlate);
  const userPhone = currentUser?.phone ? normalizePhone(currentUser.phone) : '';
  const isMountedRef = useRef(true);
  const lastFetchTimeRef = useRef<number>(0);
  const autoEndedRef = useRef(false);
  const [ending, setEnding] = useState(false);
  const [endedSessionId, setEndedSessionId] = useState<string | null>(null);
  const [showBreach, setShowBreach] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const throttledFetchAll = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchTimeRef.current < 3500) {
      return;
    }
    lastFetchTimeRef.current = now;
    if (!isMountedRef.current) return;
    try {
      await fetchAll();
    } catch (e) {
      console.error('❌ Throttled fetch error:', e);
    }
  }, [fetchAll]);

  const isMySessionRow = useCallback((row: any) => {
    if (!row) return false;
    const rowPlate = normalizePlate(row.car_plate || row.carPlate);
    const rowPhone = normalizePhone(row.customer_phone || row.customerPhone || '');
    return (
      (!!userPlate && rowPlate === userPlate) ||
      (!!userPhone && rowPhone === userPhone)
    );
  }, [userPlate, userPhone]);

  // استخراج الجلسة النشطة بدقة مع استبعاد أي جلسة تم إنهاؤها محلياً فوراً
  const activeSession = useMemo(() => {
    let latest: (typeof sessions)[number] | undefined;
    let maxStart = -1;
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      if (!s || s.status !== 'active') continue;
      if (endedSessionId === s.id) continue;
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
  }, [sessions, userPlate, userPhone, acknowledgedSessionIds, endedSessionId]);

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

  const garage = useMemo(() => {
    const targetGarageId = activeSession?.garageId ?? lastCompletedSession?.garageId;
    return garages?.find((g) => g.id === targetGarageId);
  }, [garages, activeSession?.garageId, lastCompletedSession?.garageId]);

  const activeStartMs = useMemo(() => {
    if (!activeSession) return 0;
    const ms = safeParseTime(activeSession.startTime);
    return ms > 0 ? ms : getServerNow();
  }, [activeSession]);

  useEffect(() => {
    throttledFetchAll();
  }, [throttledFetchAll]);

  // Realtime Listener
  useEffect(() => {
    if (!userPlate && !userPhone) return;
    let isSubscribed = true;
    const channelName = `session-live-${userPlate || userPhone}-${Math.random().toString(36).substring(2, 7)}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, (payload) => {
        if (!isSubscribed) return;
        const newRow = payload.new as any;
        const oldRow = payload.old as any;
        if (isMySessionRow(newRow) || isMySessionRow(oldRow)) {
          throttledFetchAll();
        }
      })
      .subscribe();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        throttledFetchAll();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      isSubscribed = false;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      supabase.removeChannel(channel);
    };
  }, [userPlate, userPhone, throttledFetchAll, isMySessionRow]);

  // ═══════════════════════════════════════════════════════════
  // 📍 استخراج إحداثيات الجراج الحقيقية الصارمة (منع الرمي في التحرير نهائياً)
  // ═══════════════════════════════════════════════════════════
  const isShieldPurchased = (activeSession?.shieldCost ?? 0) > 0;
  const shieldSessionId = activeSession?.id;
  const garageId = garage?.id;

  const accurateLat = useMemo(() => {
    const lat = (activeSession as any)?.parking_lat ?? (activeSession as any)?.parkingLat ?? garage?.latitude ?? (garage as any)?.lat;
    return lat ? Number(lat) : 0;
  }, [activeSession, garage]);

  const accurateLng = useMemo(() => {
    const lng = (activeSession as any)?.parking_lng ?? (activeSession as any)?.parkingLng ?? garage?.longitude ?? (garage as any)?.lng;
    return lng ? Number(lng) : 0;
  }, [activeSession, garage]);

  // 🔊 تجهيز مسار الصوت التلقائي فور لمس الشاشة
  useEffect(() => {
    if (!isShieldPurchased) return;
    armBackgroundAudio();

    const primeGesture = () => {
      armBackgroundAudio();
      window.removeEventListener('click', primeGesture);
      window.removeEventListener('touchstart', primeGesture);
    };

    window.addEventListener('click', primeGesture, { once: true, passive: true });
    window.addEventListener('touchstart', primeGesture, { once: true, passive: true });

    return () => {
      window.removeEventListener('click', primeGesture);
      window.removeEventListener('touchstart', primeGesture);
    };
  }, [isShieldPurchased]);

  // 🛡️ تشغيل رادار الـ GPS فقط عند توفر إحداثيات حقيقية صحيحة
  useEffect(() => {
    if (!shieldSessionId || !garageId || !isShieldPurchased) return;
    if (!accurateLat || !accurateLng) return; // منع البدء بإحداثيات صفرية لتفادي أخطاء المسافة

    armBackgroundAudio();
    let cancelled = false;

    registerShieldSession({
      sessionId: shieldSessionId,
      phone: (activeSession as any)?.customerPhone || userPhone || '',
      garageId: garageId,
      parkingLat: accurateLat,
      parkingLng: accurateLng,
    }).then((shieldId) => {
      if (cancelled || !shieldId) return;
      startShieldGPS({
        sessionId: shieldSessionId,
        shieldId,
        parkingLat: accurateLat,
        parkingLng: accurateLng,
        onGeofenceBreach: () => {
          triggerBreachAlarm();
          setShowBreach(true);
        },
      });
    });

    return () => {
      cancelled = true;
      stopShieldGPS();
      destroyShield();
      setShowBreach(false);
    };
  }, [shieldSessionId, garageId, isShieldPurchased, accurateLat, accurateLng, userPhone]);

  // 🏁 إنهاء الجلسة الفوري (Optimistic Instant Close بدون تعليق)
  const handleEndSession = useCallback(async () => {
    if (ending || !activeSession) return;
    const currentSessionId = activeSession.id;

    // 1. إيقاف فوري للرادار والإنذار في المتصفح في (0 ثانية)
    stopIntenseAlarm();
    destroyShield();
    setShowBreach(false);
    setEndedSessionId(currentSessionId);
    setEnding(true);

    // 2. تحديث الـ Store الداخلي فوراً قبل انتظار السيرفر لمنع رجوع "جلسة نشطة"
    if (typeof acknowledgeSession === 'function') {
      acknowledgeSession(currentSessionId);
    }

    try {
      const elapsedSec = Math.floor((getServerNow() - activeStartMs) / 1000);
      await endSession(currentSessionId, Math.max(0, elapsedSec), 'cash', 0);

      const nowIso = new Date().toISOString();
      await supabase.from('shield_sessions')
        .update({ ended_at: nowIso, push_endpoint: null, push_p256dh: null, push_auth: null })
        .eq('session_id', currentSessionId)
        .is('ended_at', null);

      if (userPhone) {
        await supabase.from('shield_sessions')
          .update({ ended_at: nowIso, push_endpoint: null, push_p256dh: null, push_auth: null })
          .eq('phone', userPhone)
          .is('ended_at', null)
          .is('session_id', null);
      }

      toast.success('تم إنهاء الجلسة بنجاح ✅', { icon: '🏁', duration: 3000 });
      setSelectedGarageId(null);
      setScreen('list');
    } catch (e: any) {
      toast.error(e?.message || 'فشل إنهاء الجلسة، جاري التحديث');
      setSelectedGarageId(null);
      setScreen('list');
    } finally {
      if (isMountedRef.current) setEnding(false);
    }
  }, [ending, activeSession, activeStartMs, endSession, acknowledgeSession, setSelectedGarageId, setScreen, userPhone]);

  // 🚨 معالج إيقاف الإنذار عند الاختراق
  const handleBreachAction = useCallback(async (isDriver: boolean) => {
    stopIntenseAlarm();
    destroyShield();
    setShowBreach(false);
    if (isDriver) {
      toast('نتمنى لك رحلة آمنة! 🚗', { icon: '👋', duration: 3000 });
    } else {
      toast.error('تم تسجيل البلاغ وإنهاء الجلسة! 🚨', { duration: 4000 });
    }
    await handleEndSession();
  }, [handleEndSession]);

  // ⏰ الإنهاء التلقائي بعد 6 ساعات
  const handleAutoEnd = useCallback(async () => {
    if (autoEndedRef.current || !activeSession) return;
    autoEndedRef.current = true;
    stopIntenseAlarm();
    destroyShield();
    setShowBreach(false);
    setEndedSessionId(activeSession.id);

    try {
      await endSession(activeSession.id, AUTO_END_SECONDS, 'cash', 0);
      const nowIso = new Date().toISOString();
      await supabase.from('shield_sessions')
        .update({ ended_at: nowIso, push_endpoint: null, push_p256dh: null, push_auth: null })
        .eq('session_id', activeSession.id)
        .is('ended_at', null);

      if (typeof acknowledgeSession === 'function') acknowledgeSession(activeSession.id);
      toast.success('تم إنهاء الجلسة تلقائياً (6 ساعات) ⏰', { duration: 5000 });
      setSelectedGarageId(null);
      setScreen('list');
    } catch (err) {
      console.error('Auto-end error:', err);
      autoEndedRef.current = false;
      setEndedSessionId(null);
    }
  }, [activeSession, endSession, acknowledgeSession, setSelectedGarageId, setScreen]);

  // 🗺️ فتح خرائط جوجل لموقع الجراج الحقيقي
  const handleOpenGoogleMaps = () => {
    if (!garage && !accurateLat) return;
    const url = buildGoogleMapsUrl(accurateLat, accurateLng, garage?.name || '', garage?.location || '');
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // تحويل للقائمة لو مفيش جلسة
  useEffect(() => {
    if (!activeSession && !ending) {
      setSelectedGarageId(null);
      setScreen('list');
    }
  }, [activeSession, ending, setSelectedGarageId, setScreen]);

  if (activeSession) {
    const isShieldActive = (activeSession.shieldCost ?? 0) > 0;
    const currentPlate = activeSession.carPlate || currentUser?.carPlate || '---';

    return (
      <motion.div
        className="h-full flex flex-col bg-slate-950 text-white overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        dir="rtl"
      >
        <style>{`
          @keyframes radar-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes radar-wave {
            0% { transform: scale(0.6); opacity: 0.8; }
            100% { transform: scale(1.6); opacity: 0; }
          }
        `}</style>


          <div className="w-16" /> {/* موازن بصري */}
        </div>

        <div className="flex-1 flex flex-col items-center px-4 pt-2.5 pb-2 gap-2 overflow-y-auto">
          {/* بادج حالة الجلسة والتأمين في الرأس */}
          {isShieldActive ? (
            <div
              className="px-3.5 py-1 rounded-full flex items-center gap-2 border"
              style={{
                background: 'rgba(140, 198, 63, 0.12)',
                borderColor: 'rgba(140, 198, 63, 0.4)',
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: BRAND.green, boxShadow: `0 0 8px ${BRAND.green}` }}
              />
              <span className="text-[10px] font-black tracking-wider" style={{ color: BRAND.green }}>
                جلسة ركن وتأمين نشطة
              </span>
            </div>
          ) : (
            <div
              className="px-3.5 py-1 rounded-full flex items-center gap-2 border"
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                borderColor: 'rgba(239, 68, 68, 0.4)',
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: '#ef4444', boxShadow: '0 0 8px #ef4444' }}
              />
              <span className="text-[10px] font-black tracking-wider text-red-400">
                جلسة ركن عادية (بدون درع حماية)
              </span>
            </div>
          )}

          {/* 🛰️ رادار الحماية التكتيكي الحي بإحداثيات حقيقية */}
          <TacticalRadarScope
            carPlate={currentPlate}
            isShieldActive={isShieldActive}
            displayLat={accurateLat}
            displayLng={accurateLng}
          />

          {/* ⚡ شريط عداد الوقت المدمج */}
          <LiveSessionTimer
            activeStartMs={activeStartMs}
            onAutoEnd={handleAutoEnd}
          />

          {/* 💡 بطاقة التوجيه والتحذير الأمني النفسي الإلزامية */}
          {isShieldActive ? (
            <div
              className="w-full max-w-md rounded-2xl p-3 text-right border space-y-2"
              style={{
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(10, 22, 40, 0.95) 100%)',
                borderColor: 'rgba(245, 158, 11, 0.35)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
              }}
            >
              <p className="text-[11px] font-black text-amber-300 leading-snug">
                💡 لضمان استمرار رادار الحماية، يُرجى ترك هذه الصفحة في الخلفية وعدم إغلاقها.
              </p>
              <div className="pt-2 border-t border-amber-500/20 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[10px] font-bold text-slate-300 leading-relaxed">
                  ⚠️ تنبيه هام: قفل نافذة التطبيق يدوياً يؤدي إلى إيقاف رادار الحماية فوراً. يرجى ترك الصفحة مفتوحة في الخلفية وقفل الشاشة فقط لضمان عمل الإنذار.
                </p>
              </div>
            </div>
          ) : (
            <div
              className="w-full max-w-md rounded-2xl p-3 text-right border space-y-1.5"
              style={{
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(10, 22, 40, 0.95) 100%)',
                borderColor: 'rgba(239, 68, 68, 0.45)',
                boxShadow: '0 4px 16px rgba(239, 68, 68, 0.2)',
              }}
            >
              <div className="flex items-center gap-1.5 text-red-400 font-black text-[11px]">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>⚠️ تنبيه: الجلسة الحالية تعمل في الوضع العادي (بدون حماية)</span>
              </div>
              <p className="text-[10px] font-bold text-slate-300 leading-relaxed pr-5">
                السيارة غير مؤمنة . الرادار والتتبع اللحظي متوقفان لهذه الجلسة.
              </p>
            </div>
          )}
        </div>

        {/* 📋 القسم السفلي */}
        <div
          className="px-4 pt-2.5 pb-4 border-t shrink-0 flex flex-col gap-2"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, rgba(10, 22, 40, 0.9) 100%)',
            borderColor: BRAND.border,
          }}
        >
          <div className="w-full grid grid-cols-2 gap-2">
            <div
              className="border rounded-xl p-2 text-center"
              style={{
                background: `linear-gradient(135deg, ${BRAND.navyLight} 0%, rgba(17, 30, 54, 0.5) 100%)`,
                borderColor: BRAND.border,
              }}
            >
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <Car size={11} style={{ color: BRAND.blue }} />
                <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: BRAND.slateMuted }}>
                  سيارتك
                </span>
              </div>
              <div
                className="text-[13px] font-black text-white font-mono tracking-widest py-1 px-1 rounded-md border"
                style={{
                  background: 'rgba(10, 22, 40, 0.9)',
                  borderColor: BRAND.border,
                  letterSpacing: '2px',
                }}
              >
                {currentPlate}
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
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <MapPin size={11} style={{ color: BRAND.green }} />
                  <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: BRAND.slateMuted }}>
                    الجراج
                  </span>
                </div>
                <div
                  className="text-[11px] font-black text-white leading-tight py-1 px-1 rounded-md border truncate"
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

          {/* زر الملاحة لخرائط جوجل لموقع الجراج الحقيقي */}
          {garage && (
            <button
              type="button"
              onClick={handleOpenGoogleMaps}
              className="w-full py-2.5 rounded-xl border flex items-center justify-center gap-2 font-black text-xs text-white active:scale-95 transition-all cursor-pointer"
              style={{
                background: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)',
                borderColor: 'rgba(255,255,255,0.15)',
              }}
            >
              <Navigation size={14} />
              <span>الذهاب لموقع سيارتي عبر خرائط جوجل 📍</span>
            </button>
          )}

          {/* زر إنهاء الجلسة والخروج */}
          <button
            type="button"
            aria-label="إنهاء الجلسة الحالية"
            onClick={handleEndSession}
            disabled={ending}
            className="w-full py-3 rounded-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 border-0 text-white cursor-pointer font-black text-sm disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
              boxShadow: '0 8px 24px rgba(220, 38, 38, 0.45), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            <LogOut size={16} />
            <span className="text-center font-black text-white">
              {ending ? '⏳ جاري إنهاء الجلسة...' : '🚗 إنهاء الجلسة والخروج'}
            </span>
          </button>
        </div>

        {/* 🚨 شاشة اختراق الدرع وسارينة الطوارئ */}
        {showBreach && (
          <div
            className="fixed inset-0 flex items-center justify-center p-4"
            style={{
              zIndex: 99999,
              background: 'rgba(0,0,0,0.85)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div
              className="w-full max-w-sm rounded-2xl p-6 text-center border-2 border-red-500"
              style={{
                background: 'linear-gradient(135deg, #1a0505 0%, #0a1628 100%)',
                boxShadow: '0 0 60px rgba(239,68,68,0.6), 0 0 120px rgba(239,68,68,0.2)',
                animation: 'pulse 1s ease-in-out infinite',
              }}
            >
              <div className="text-6xl mb-3 animate-bounce">🚨</div>
              <h2 className="text-2xl font-black text-red-400 mb-2">
                تنبيه أمني عاجل!
              </h2>
              <p className="text-sm font-bold text-gray-200 mb-4 leading-relaxed">
                رصد رادار الحماية خروج سيارتك خارج نطاق الأمان (50 متر) أو حركتها بسرعة عالية!
              </p>

              <button
                type="button"
                onClick={() => stopIntenseAlarm()}
                className="mb-4 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold cursor-pointer active:scale-95"
              >
                <VolumeX size={15} className="text-amber-400" />
                <span>كتم صوت الإنذار مؤقتاً</span>
              </button>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => handleBreachAction(true)}
                  className="w-full py-3.5 rounded-xl font-black text-white text-sm active:scale-95 transition-all cursor-pointer"
                  style={{
                    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    boxShadow: '0 4px 16px rgba(34,197,94,0.4)',
                  }}
                >
                  ✅ أنا اللي سايق
                </button>
                <button
                  onClick={() => handleBreachAction(false)}
                  className="w-full py-3.5 rounded-xl font-black text-white text-sm active:scale-95 transition-all cursor-pointer"
                  style={{
                    background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                    boxShadow: '0 4px 16px rgba(239,68,68,0.4)',
                  }}
                >
                  🚔 مش أنا — بلاغ فوري!
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    );
  }
  return null;
}