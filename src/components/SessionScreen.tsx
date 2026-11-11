// src/components/SessionScreen.tsx

import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Car,
  Sparkles,
  MapPin,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import { useStore, normalizePlate, normalizePhone, getServerNow, haversineDistance } from '../store';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import {
  sendLocalNotification,
  playUrgentSound,
} from '../utils/notifications';
import {
  registerShieldSession,
} from '../lib/pushManager';
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

// 🛡️ نطاق الأمان حول الجراج (متر) — لو السيارة خرجت منه = تنبيه
const SHIELD_GEOFENCE_METERS = 250;

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
   🛡️ ShieldRadarDisplay — الرادار المتحرك (عرض فقط)
   ═══════════════════════════════════════════════════════════ */
const ShieldRadarDisplay = memo(function ShieldRadarDisplay({
  shieldCost,
  shieldCode,
}: {
  shieldCost: number;
  shieldCode?: string;
}) {
  const radarRef = useRef<HTMLDivElement>(null);
  const angleRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      angleRef.current = (angleRef.current + 3) % 360;
      if (radarRef.current) {
        radarRef.current.style.background = `conic-gradient(from ${angleRef.current}deg, transparent 0deg, rgba(34,197,94,0.35) 40deg, transparent 80deg)`;
      }
    }, 50);
    return () => clearInterval(id);
  }, []);

  const costLabel = shieldCost === 0 ? 'مجاني' : `${shieldCost} ج.م`;

  return (
    <div className="w-full flex flex-col items-center gap-2">
      {/* ── الرادار المتحرك ── */}
      <div className="relative" style={{ width: 140, height: 140 }}>
        <div
          ref={radarRef}
          className="absolute inset-0 rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, transparent 0deg, rgba(34,197,94,0.35) 40deg, transparent 80deg)',
          }}
        />
        <div className="absolute inset-1.5 rounded-full border border-green-500/20" />
        <div className="absolute inset-3.5 rounded-full border border-green-500/15" />
        <div className="absolute inset-5.5 rounded-full border border-green-500/10" />
        <div className="absolute top-1/2 left-0 right-0 h-px bg-green-500/10" />
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-green-500/10" />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full animate-pulse"
          style={{
            background: '#4ade80',
            boxShadow: '0 0 12px rgba(74,222,128,0.6), 0 0 24px rgba(74,222,128,0.3)',
          }}
        />
      </div>

      {/* ── بادج الحماية ── */}
      <div
        className="flex items-center gap-2 rounded-full px-3.5 py-1.5 border"
        style={{
          background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(22,163,74,0.08))',
          borderColor: 'rgba(34,197,94,0.4)',
        }}
      >
        <ShieldCheck className="w-4 h-4 text-green-400" />
        <span className="text-green-400 text-[11px] font-black">الحماية نشطة</span>
        <span
          className="text-[9px] font-black px-1.5 py-0.5 rounded"
          style={{
            background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
            color: '#0a1628',
          }}
        >
          {costLabel}
        </span>
        {shieldCode && (
          <span className="text-green-600/80 text-[9px] font-mono">{shieldCode}</span>
        )}
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
  } = useStore();

  const userPlate = normalizePlate(currentUser?.carPlate);
  const userPhone = currentUser?.phone ? normalizePhone(currentUser.phone) : '';

  const isMountedRef = useRef(true);
  const autoEndedRef = useRef(false);

  const [ending, setEnding] = useState(false);
  const [endedSessionId, setEndedSessionId] = useState<string | null>(null);
  const [pendingArrival, setPendingArrival] = useState<any>(() => getPendingArrival());
  const [startingSession, setStartingSession] = useState(false);

  // 🛡️ refs للإشعارات
  const shieldWatchIdRef = useRef<number | null>(null);
  const shieldAlarmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shieldAlertSentRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    const syncPending = () => {
      const p = getPendingArrival();
      if (p) setPendingArrival(p);
    };

    window.addEventListener('storage', syncPending);
    window.addEventListener('focus', syncPending);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('storage', syncPending);
      window.removeEventListener('focus', syncPending);
    };
  }, []);

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

  const garage = garages?.find(
    (g) => g.id === (activeSession?.garageId ?? lastCompletedSession?.garageId),
  );

  const activeStartMs = useMemo(() => {
    if (!activeSession) return 0;
    const ms = safeParseTime(activeSession.startTime);
    return ms > 0 ? ms : getServerNow();
  }, [activeSession]);

  // 🛡️ حالة الدرع من الجلسة نفسها
  // null = بدون درع | 0 = مجاني | 7 = مدفوع
  const shieldCost = (activeSession as any)?.shieldCost as number | null | undefined;
  const shieldActive = shieldCost != null;

  /* ═══════════════════════════════════════════════════════════
     🛡️ إشعارات الدرع — GPS monitoring + تنبيه محلي + صوت
     يشتغل بس لما الدرع مفعّل والجلسة نشطة
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    const cleanup = () => {
      if (shieldWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(shieldWatchIdRef.current);
        shieldWatchIdRef.current = null;
      }
      if (shieldAlarmIntervalRef.current) {
        clearInterval(shieldAlarmIntervalRef.current);
        shieldAlarmIntervalRef.current = null;
      }
    };

    if (!shieldActive || !activeSession || !garage) {
      cleanup();
      shieldAlertSentRef.current = false;
      return;
    }

    if (!('geolocation' in navigator)) return;

    const parkingLat = garage.lat;
    const parkingLng = garage.lng;

    shieldWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (!isMountedRef.current) return;
        if (shieldAlertSentRef.current) return;

        const distMeters = haversineDistance(
          pos.coords.latitude,
          pos.coords.longitude,
          parkingLat,
          parkingLng,
        );

        if (distMeters > SHIELD_GEOFENCE_METERS) {
          shieldAlertSentRef.current = true;

          // 🔊 صوت إنذار متقطع
          try {
            playUrgentSound();
            shieldAlarmIntervalRef.current = setInterval(() => {
              try { playUrgentSound(); } catch {}
            }, 2000);
          } catch {}

          // 📱 إشعار محلي
          try {
            sendLocalNotification(
              '🚨 تنبيه حركة!',
              `السيارة تحركت ${Math.round(distMeters)}م من مكان الركن`,
              '/',
            );
          } catch {}

          // 📳 اهتزاز
          if (navigator.vibrate) {
            navigator.vibrate([300, 200, 300, 200, 300, 200, 300]);
          }

          // ⏹️ وقف الصوت بعد 10 ثواني
          setTimeout(() => {
            if (shieldAlarmIntervalRef.current) {
              clearInterval(shieldAlarmIntervalRef.current);
              shieldAlarmIntervalRef.current = null;
            }
          }, 10000);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );

    return cleanup;
  }, [shieldActive, activeSession?.id, garage?.lat, garage?.lng]);

  /* ═══════════════════════════════════════════════════════════
     📲 Push Notifications — تسجيل مع الـ Service Worker
     يشتغل بس لما الدرع مفعّل والجلسة نشطة
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!shieldActive || !activeSession || !garage) return;
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;

    const registerPush = async () => {
      if (cancelled) return;

      try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();

        const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;
        if (!VAPID_PUBLIC) {
          console.warn('⚠️ VITE_VAPID_PUBLIC_KEY missing — Push disabled');
          return;
        }

        if (!sub) {
          const urlBase64ToUint8Array = (b: string): Uint8Array => {
            const p = '='.repeat((4 - (b.length % 4)) % 4);
            const d = window.atob((b + p).replace(/-/g, '+').replace(/_/g, '/'));
            return new Uint8Array([...d].map((c) => c.charCodeAt(0)));
          };

          try {
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
            });
          } catch (subErr) {
            console.warn('⚠️ Push subscribe failed:', subErr);
            return;
          }
        }

        if (cancelled || !sub) return;

        const subJson = sub.toJSON();
        const identifier = userPhone || (currentUser as any)?.id || 'unknown';

        // تحديث الـ subscription في الداتابيز
        await supabase
          .from('shield_sessions')
          .update({
            push_endpoint: subJson.endpoint,
            push_p256dh: subJson.keys?.p256dh || null,
            push_auth: subJson.keys?.auth || null,
          })
          .eq('session_id', activeSession.id)
          .is('ended_at', null);

        // تسجيل الجلسة للـ Push
        await registerShieldSession(
          activeSession.id,
          garage.lat,
          garage.lng,
          identifier,
          garage.id,
        );

        console.log('✅ Push registered for shield session');
      } catch (err) {
        console.warn('Push registration error:', err);
      }
    };

    registerPush();

    // تجديد كل 10 دقائق
    const refreshInterval = setInterval(registerPush, 10 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(refreshInterval);
    };
  }, [shieldActive, activeSession?.id, garage?.id, garage?.lat, garage?.lng, userPhone, currentUser]);

  /* ═══════════════════════════════════════════════════════════
     📬 Service Worker Messages — استقبال تنبيهات Push
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!shieldActive || !activeSession) return;
    if (!('serviceWorker' in navigator)) return;

    const handleSWMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'SHIELD_BREACH_DETECTED') {
        if (shieldAlertSentRef.current) return;
        shieldAlertSentRef.current = true;

        const dist = data.distance || 300;

        try {
          playUrgentSound();
          shieldAlarmIntervalRef.current = setInterval(() => {
            try { playUrgentSound(); } catch {}
          }, 2000);
        } catch {}

        try {
          sendLocalNotification(
            '🚨 تنبيه حركة!',
            `السيارة تحركت ${dist}م من مكان الركن`,
            '/',
          );
        } catch {}

        if (navigator.vibrate) {
          navigator.vibrate([300, 200, 300, 200, 300, 200, 300]);
        }

        setTimeout(() => {
          if (shieldAlarmIntervalRef.current) {
            clearInterval(shieldAlarmIntervalRef.current);
            shieldAlarmIntervalRef.current = null;
          }
        }, 10000);
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    };
  }, [shieldActive, activeSession?.id]);

  /* ═══════════════════════════════════════════════════════════
     🔄 Realtime: store.setupRealtime() بيغطي كل حاجة
     ═══════════════════════════════════════════════════════════ */

  // 🏁 إنهاء الجلسة يدويًا
  const handleEndSession = useCallback(async () => {
    if (ending || !activeSession) return;

    setEndedSessionId(activeSession.id);
    setEnding(true);

    try {
      const elapsedSec = Math.floor((getServerNow() - activeStartMs) / 1000);
      await endSession(activeSession.id, Math.max(0, elapsedSec), 'cash', 0);

      const nowIso = new Date().toISOString();

      await supabase.from('shield_sessions')
        .update({ ended_at: nowIso, push_endpoint: null, push_p256dh: null, push_auth: null })
        .eq('session_id', activeSession.id)
        .is('ended_at', null);

      if (userPhone) {
        await supabase.from('shield_sessions')
          .update({ ended_at: nowIso, push_endpoint: null, push_p256dh: null, push_auth: null })
          .eq('phone', userPhone)
          .is('ended_at', null)
          .is('session_id', null);
      }

      if (typeof acknowledgeSession === 'function') acknowledgeSession(activeSession.id);
      toast.success('تم إنهاء الجلسة ✅', { icon: '🏁', duration: 3000 });
      if (isMountedRef.current) {
        setSelectedGarageId(null);
        setScreen('list');
      }
    } catch (e: any) {
      toast.error(e?.message || 'فشل إنهاء الجلسة');
      setEndedSessionId(null);
    } finally {
      setEnding(false);
    }
  }, [ending, activeSession, activeStartMs, endSession, acknowledgeSession, setSelectedGarageId, setScreen, userPhone]);

  // ⏰ الإنهاء التلقائي بعد 6 ساعات
  const handleAutoEnd = useCallback(async () => {
    if (autoEndedRef.current || !activeSession) return;
    autoEndedRef.current = true;

    setEndedSessionId(activeSession.id);

    try {
      await endSession(activeSession.id, AUTO_END_SECONDS, 'cash', 0);

      const nowIso = new Date().toISOString();

      await supabase.from('shield_sessions')
        .update({ ended_at: nowIso, push_endpoint: null, push_p256dh: null, push_auth: null })
        .eq('session_id', activeSession.id)
        .is('ended_at', null);

      if (userPhone) {
        await supabase.from('shield_sessions')
          .update({ ended_at: nowIso, push_endpoint: null, push_p256dh: null, push_auth: null })
          .eq('phone', userPhone)
          .is('ended_at', null)
          .is('session_id', null);
      }

      if (typeof acknowledgeSession === 'function') acknowledgeSession(activeSession.id);
      toast.success('تم إنهاء الجلسة تلقائياً (6 ساعات) ⏰', { duration: 5000 });
      if (isMountedRef.current) {
        setSelectedGarageId(null);
        setScreen('list');
      }
    } catch (err) {
      console.error('Auto-end error:', err);
      autoEndedRef.current = false;
      setEndedSessionId(null);
    }
  }, [activeSession, endSession, acknowledgeSession, setSelectedGarageId, setScreen, userPhone]);

  // ✅ بدء الجلسة في Supabase عند ضغط الزر الأخضر
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


  // ═══════════════════════════════════════════════════════
  // 🎨 جلسة ركن نشطة
  // ═══════════════════════════════════════════════════════
  if (activeSession) {
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

          {/* 🛡️ الدرع — رادار كبير أو بادج بسيط */}
          {shieldActive ? (
            <div className="w-full max-w-md">
              <div
                className="w-full relative overflow-hidden rounded-2xl p-4 flex flex-col items-center gap-2"
                style={{
                  background: 'linear-gradient(135deg, #0a1628 0%, #1e3a8a 50%, #0a1628 100%)',
                  border: '1.5px solid rgba(96, 165, 250, 0.3)',
                  boxShadow: '0 8px 32px rgba(22, 86, 184, 0.35), inset 0 1px 0 rgba(255,255,255,0.1)',
                }}
              >
                <div
                  className="absolute inset-0 opacity-30 pointer-events-none"
                  style={{
                    background: 'linear-gradient(90deg, transparent 0%, rgba(96,165,250,0.15) 50%, transparent 100%)',
                    animation: 'shimmerShield 3s infinite',
                  }}
                />
                <style>{`
                  @keyframes shimmerShield { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
                `}</style>

                <div className="relative flex flex-col items-center gap-2">
                  <ShieldRadarDisplay
                    shieldCost={shieldCost ?? 0}
                    shieldCode={(currentUser as any)?.shieldCode || undefined}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div
              className="w-full max-w-md rounded-xl px-3 py-2 flex items-center justify-center gap-2 border"
              style={{
                background: 'linear-gradient(135deg, rgba(100,116,139,0.1) 0%, rgba(71,85,105,0.05) 100%)',
                borderColor: 'rgba(100, 116, 139, 0.3)',
              }}
            >
              <ShieldOff size={16} style={{ color: BRAND.slateMuted }} />
              <span className="text-[11px] font-black" style={{ color: BRAND.slateMuted }}>
                الدرع غير مفعّل
              </span>
            </div>
          )}

          {/* ⚡ العداد */}
          <LiveSessionTimer
            activeStartMs={activeStartMs}
            onAutoEnd={handleAutoEnd}
          />

          {/* 💬 بطاقة الإرشاد */}
          <div
            className="w-full max-w-md rounded-xl px-3 py-2.5 text-center border"
            style={{
              background: `linear-gradient(135deg, ${BRAND.navyLight} 0%, rgba(17, 30, 54, 0.85) 100%)`,
              borderColor: BRAND.border,
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            }}
          >
            <div className="flex items-center justify-center gap-1.5 mb-1 font-black text-white text-[12px]">
              <Sparkles size={12} className="text-amber-400 shrink-0" />
              <span>خلّص مشوارك براحتك 🚗</span>
            </div>
            <p
              className="font-bold leading-relaxed mx-auto text-[10px]"
              style={{ color: BRAND.slateMuted, maxWidth: '320px' }}
            >
              التطبيق <span className="text-green-400 font-black">شغال في الخلفية</span> — أي تنبيه أو إنذار هيوصلك <span className="text-amber-300 font-black">فوراً</span> على شاشة الموبايل.
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

  return null;
}