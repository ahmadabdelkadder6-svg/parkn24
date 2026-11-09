import { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, ShieldCheck, Phone, AlertTriangle, Car, Siren } from 'lucide-react';
import {
  startShieldGPS, checkUserInsideGarage,
  destroyShield, saveShieldState, loadShieldState,
  SHIELD_STORAGE_KEY, SHIELD_COST, GEOFENCE_RADIUS,
} from '../lib/shield';
import {
  sendLocalNotification, playUrgentSound,
  requestNotificationPermission,
  unlockAudio,
} from '../utils/notifications';
import { subscribeToPush, registerShieldSession } from '../lib/pushManager';
import { supabase } from '../lib/supabase';

type Phase = 'ask' | 'register' | 'active' | 'breach' | 'dismissed';

interface Props {
  sessionId: string;
  userId: string;
  garageId: string;
  parkingLat: number;
  parkingLng: number;
  userPhone: string | null;
  onDeductWallet: (amount: number, note: string) => boolean;
  onNavigateToWallet: () => void;
  autoResume?: boolean;
  onSessionEnd?: () => void;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const endShieldOnServer = async (sessionId: string) => {
  await supabase
    .from('shield_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .is('ended_at', null);
};

export default function ShieldOverlay({
  sessionId, userId, garageId, parkingLat, parkingLng,
  userPhone, onDeductWallet, onNavigateToWallet,
  autoResume = false,
  onSessionEnd,
}: Props) {
  const [phase, setPhase] = useState<Phase>('ask');
  const [phone, setPhone] = useState(userPhone ?? '');
  const [breachDistance, setBreachDistance] = useState(0);
  const [shieldCode, setShieldCode] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [gpsWarning, setGpsWarning] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const alarmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const radarAngle = useRef(0);
  const radarRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const triggerLocalAlarm = useCallback((dist: number) => {
    try {
      playUrgentSound();
      sendLocalNotification(
        '🚨 تنبيه حركة!',
        `السيارة تحركت ${dist}م من مكان الركن`,
        '/'
      );
      if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = setInterval(() => {
        playUrgentSound();
      }, 2000);
    } catch (e) {
      console.warn('Alarm failed:', e);
    }
  }, []);

  const stopLocalAlarm = useCallback(() => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
  }, []);

  const handleIamDriving = useCallback(async () => {
    stopLocalAlarm();
    destroyShield();
    try { localStorage.removeItem(SHIELD_STORAGE_KEY); } catch {}

    const identifier = userPhone || userId || 'unknown';

    try {
      await endShieldOnServer(sessionId);
      await supabase.from('shield_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('phone', identifier).is('ended_at', null);

      await supabase.from('shield_sessions')
        .update({ push_endpoint: null, push_p256dh: null, push_auth: null })
        .eq('session_id', sessionId);
    } catch (e) {
      console.error('❌ Failed to end shield:', e);
    }

    setPhase('dismissed');
    onSessionEnd?.();
  }, [sessionId, userPhone, userId, stopLocalAlarm, onSessionEnd]);

  const handleTheft = useCallback(async () => {
    stopLocalAlarm();
    sendLocalNotification('✅ تم استلام البلاغ', 'هيتم التواصل معاك قريباً', '/');
    destroyShield();
    try { localStorage.removeItem(SHIELD_STORAGE_KEY); } catch {}

    const identifier = userPhone || userId || 'unknown';

    try {
      await endShieldOnServer(sessionId);
      await supabase.from('shield_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('phone', identifier).is('ended_at', null);

      await supabase.from('shield_sessions')
        .update({ push_endpoint: null, push_p256dh: null, push_auth: null })
        .eq('session_id', sessionId);
    } catch (e) {
      console.error('❌ Failed to end shield:', e);
    }

    setPhase('dismissed');
    onSessionEnd?.();
  }, [sessionId, userPhone, userId, stopLocalAlarm, onSessionEnd]);

  // ─── Radar animation ───
  useEffect(() => {
    if (phase !== 'active') return;
    const id = setInterval(() => {
      radarAngle.current = (radarAngle.current + 3) % 360;
      if (radarRef.current) {
        radarRef.current.style.background = `conic-gradient(from ${radarAngle.current}deg, transparent 0deg, rgba(34,197,94,0.35) 40deg, transparent 80deg)`;
      }
    }, 50);
    return () => clearInterval(id);
  }, [phase]);

  // ─── استرجاع حالة الدرع ───
  useEffect(() => {
    if (autoResume && phase === 'ask') {
      const saved = loadShieldState();
      if (saved?.sessionId === sessionId) {
        setShieldCode(saved.shieldCode);
        setPhone(saved.phone ?? '');
      } else {
        setShieldCode('SH-' + Math.random().toString(36).slice(2, 8).toUpperCase());
      }
      setPhase('active');
      return;
    }

    const saved = loadShieldState();
    if (
      saved?.isActive &&
      saved.garageId === garageId &&
      saved.sessionId === sessionId
    ) {
      setShieldCode(saved.shieldCode);
      setPhone(saved.phone ?? '');
      setPhase('active');
    }
  }, [garageId, sessionId, autoResume, phase]);

  // ─── GPS — يشتغل في active و breach ───
  const isTracking = phase === 'active' || phase === 'breach';

  useEffect(() => {
    if (!isTracking) return;

    const cleanupGPS = startShieldGPS({
      sessionId,
      parkingLat, parkingLng,
      onGeofenceBreach: (dist) => {
        setBreachDistance(Math.round(dist));
        setPhase('breach');
        triggerLocalAlarm(Math.round(dist));
      },
      onGPSError: () => {
        setGpsWarning(true);
        sendLocalNotification(
          '⚠️ الـ GPS مقفول!',
          'فعّل الموقع عشان المراقبة تشتغل',
          '/'
        );
      },
    });

    return () => { cleanupGPS(); };
  }, [isTracking ? 'tracking' : 'off', sessionId, parkingLat, parkingLng, triggerLocalAlarm]);

  // ─── GPS للسرعة ───
  useEffect(() => {
    if (!isTracking) return;

    let prev: { lat: number; lng: number; t: number } | null = null;
    let lastUp = 0;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const now = Date.now();

        let spd = (pos.coords.speed && pos.coords.speed > 0) ? pos.coords.speed : 0;
        if (prev) {
          const d = haversine(prev.lat, prev.lng, lat, lng);
          const dt = (now - prev.t) / 1000;
          if (dt > 2) spd = Math.max(spd, d / dt);
        }
        prev = { lat, lng, t: now };

        if (spd >= 2.22 && now - lastUp > 15000) {
          lastUp = now;
          supabase.from('shield_sessions')
            .update({ last_lat: lat, last_lng: lng, last_speed: Math.round(spd * 3.6) })
            .eq('session_id', sessionId);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isTracking ? 'tracking' : 'off', sessionId]);

  // ─── تجديد الـ Push Subscription ───
  useEffect(() => {
    if (phase !== 'active') return;

    const refreshSubscription = async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();

        const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;
        if (!VAPID_PUBLIC) return;

        if (!sub) {
          const urlBase64ToUint8Array = (b: string): Uint8Array => {
            const p = '='.repeat((4 - (b.length % 4)) % 4);
            const d = window.atob((b + p).replace(/-/g, '+').replace(/_/g, '/'));
            return new Uint8Array([...d].map(c => c.charCodeAt(0)));
          };
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
          });
        }

        if (sub) {
          const subJson = sub.toJSON();
          await supabase
            .from('shield_sessions')
            .update({
              push_endpoint: subJson.endpoint,
              push_p256dh: subJson.keys?.p256dh,
              push_auth: subJson.keys?.auth,
            })
            .eq('session_id', sessionId)
            .is('ended_at', null);

          const identifier = userPhone || userId || 'unknown';
          await registerShieldSession(sessionId, parkingLat, parkingLng, identifier, garageId);
        }
      } catch (e) {
        console.warn('Failed to refresh subscription:', e);
      }
    };

    refreshSubscription();
    const interval = setInterval(refreshSubscription, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [phase, sessionId, userPhone, userId, garageId, parkingLat, parkingLng]);

  // ─── Realtime listener ───
  useEffect(() => {
    if (phase !== 'active') return;

    const channel = supabase
      .channel(`shield-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'shield_sessions', filter: `session_id=eq.${sessionId}` },
        (payload: any) => {
          const u = payload.new;
          if (u.theft_alerted && phaseRef.current !== 'breach') {
            setBreachDistance(300);
            setPhase('breach');
            triggerLocalAlarm(300);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [phase, sessionId, triggerLocalAlarm]);

  // ─── Service Worker messages ───
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleSWMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'SHIELD_BREACH_DETECTED') {
        const dist = data.distance || 300;
        setBreachDistance(dist);
        setPhase('breach');
        triggerLocalAlarm(dist);
      }

      if (data.type === 'SHIELD_BREACH_DISMISSED') {
        handleIamDriving();
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    };
  }, [handleIamDriving, triggerLocalAlarm]);

  // ─── Cleanup on unmount ───
  useEffect(() => {
    return () => {
      stopLocalAlarm();
      destroyShield();
    };
  }, [stopLocalAlarm]);

  // ─── التسجيل الذكي ───
  const registerOnServer = useCallback(async () => {
    const identifier = userPhone || userId || 'unknown';
    try {
      const reg = await navigator.serviceWorker.ready;

      const oldSub = await reg.pushManager.getSubscription();
      if (oldSub) await oldSub.unsubscribe();

      let perm = Notification.permission;
      if (perm !== 'granted') perm = await Notification.requestPermission();
      if (perm !== 'granted') return;

      const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!VAPID_PUBLIC) return;

      const urlBase64ToUint8Array = (b: string): Uint8Array => {
        const p = '='.repeat((4 - (b.length % 4)) % 4);
        const d = window.atob((b + p).replace(/-/g, '+').replace(/_/g, '/'));
        return new Uint8Array([...d].map(c => c.charCodeAt(0)));
      };

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });

      const subJson = sub.toJSON();
      if (!subJson?.endpoint) return;

      const { data: existing } = await supabase
        .from('shield_sessions')
        .select('session_id, fake_tick, alert_count, ended_at')
        .eq('session_id', sessionId)
        .is('ended_at', null)
        .maybeSingle();

      if (existing) {
        await supabase.from('shield_sessions')
          .update({
            push_endpoint: subJson.endpoint,
            push_p256dh: subJson.keys?.p256dh,
            push_auth: subJson.keys?.auth,
          })
          .eq('session_id', sessionId);

        await registerShieldSession(sessionId, parkingLat, parkingLng, identifier, garageId);
        return;
      }

      await supabase.from('shield_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('phone', identifier)
        .is('ended_at', null);

      await supabase.from('shield_sessions').insert({
        session_id: sessionId,
        user_id: identifier,
        phone: identifier,
        parking_lat: parkingLat,
        parking_lng: parkingLng,
        push_endpoint: subJson.endpoint,
        push_p256dh: subJson.keys?.p256dh,
        push_auth: subJson.keys?.auth,
        last_lat: parkingLat,
        last_lng: parkingLng,
        last_gps_at: new Date().toISOString(),
        client_outside: false,
        theft_alerted: false,
        fake_mode: -1,
        alert_count: 0,
        fake_tick: 0,
        last_speed: null,
      });

      await registerShieldSession(sessionId, parkingLat, parkingLng, identifier, garageId);
    } catch (e: any) {
      console.error('❌ Register crashed:', e.message);
    }
  }, [sessionId, userId, userPhone, parkingLat, parkingLng, garageId]);

  useEffect(() => {
    if (!autoResume || phase !== 'active') return;
    registerOnServer();
  }, [autoResume, phase, registerOnServer]);

  // ═══════════════════════════════════════════════════════
  // 🎯 handleYes — التعديل هنا
  // ═══════════════════════════════════════════════════════
  const handleYes = useCallback(async () => {
    unlockAudio();
    setCheckError(null);
    setIsChecking(true);

    try {
      await requestNotificationPermission();

      // ✅ التعديل: بنبعت GEOFENCE_RADIUS صراحة
      // والـ function دلوقتي بيرجع { inside, distance }
      const check = await checkUserInsideGarage(parkingLat, parkingLng, GEOFENCE_RADIUS);

      if (!check.inside) {
        setIsChecking(false);
        if (check.distance < 0) {
          setCheckError('مش قادر أحدد موقعك! فعّل الـ GPS وجرّب تاني.');
        } else {
          setCheckError(`لازم تكون جوه الجراج علشان تفعّل الحماية (بُعدك ${Math.round(check.distance)}م)`);
        }
        return;
      }

      // ✅ Push subscription — non-blocking
      // لو فشل مش هنوقف التفعيل
      try {
        await subscribeToPush(garageId, userPhone || undefined);
      } catch (pushErr) {
        console.warn('Push subscription failed (non-fatal):', pushErr);
      }

      const ok = onDeductWallet(SHIELD_COST, 'خدمة الحماية الإضافية');
      if (!ok) {
        setIsChecking(false);
        onNavigateToWallet();
        return;
      }

      supabase
        .from('sessions')
        .update({ shield_cost: SHIELD_COST })
        .eq('id', sessionId)
        .catch((e) => console.error('Failed to save shield cost:', e));

      setIsChecking(false);

      if (userPhone) {
        const code = 'SH-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        setShieldCode(code);
        setPhase('active');
        saveShieldState({
          isActive: true, shieldCode: code, phone: userPhone,
          garageId, parkingLat, parkingLng, sessionId,
        });
        await registerOnServer();
      } else {
        setPhase('register');
      }
    } catch (e: any) {
      setIsChecking(false);
      console.error('❌ Shield activation error:', e);
      setCheckError(e?.message || 'حصل خطأ، جرّب تاني');
    }
  }, [userPhone, garageId, sessionId, parkingLat, parkingLng, onDeductWallet, onNavigateToWallet, registerOnServer]);

  const handleRegister = useCallback(async () => {
    if (phone.length < 10) return;
    const code = 'SH-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    setShieldCode(code);
    setPhase('active');
    saveShieldState({
      isActive: true, shieldCode: code, phone,
      garageId, parkingLat, parkingLng, sessionId,
    });
    await registerOnServer();
  }, [phone, garageId, sessionId, parkingLat, parkingLng, registerOnServer]);

  if (dismissed) {
    return (
      <button
        onClick={() => setDismissed(false)}
        style={{
          position: 'fixed', top: 16, right: 16, zIndex: 99999,
          background: 'linear-gradient(135deg, #1e3a8a, #1e40af)',
          color: '#ffffff', border: '2px solid #60a5fa',
          borderRadius: 14, padding: '10px 18px', fontSize: 13,
          fontWeight: 'bold', display: 'flex', alignItems: 'center',
          gap: 8, boxShadow: '0 4px 24px rgba(96,165,250,0.4)',
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        🛡️ تفعيل الحماية
      </button>
    );
  }

  if (phase === 'dismissed') return null;

  return (
    <div className="w-full flex flex-col items-center gap-2">
      {phase === 'ask' && (
        <div className="w-full relative overflow-hidden rounded-2xl"
          style={{
            background: 'linear-gradient(135deg, #0a1628 0%, #1e3a8a 50%, #0a1628 100%)',
            border: '1.5px solid rgba(96, 165, 250, 0.3)',
            boxShadow: '0 8px 32px rgba(22, 86, 184, 0.35), inset 0 1px 0 rgba(255,255,255,0.1)',
          }}
        >
          <div className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(96,165,250,0.15) 50%, transparent 100%)',
              animation: 'shimmerShield 3s infinite',
            }}
          />
          <style>{`
            @keyframes shimmerShield { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
            @keyframes pulseShield { 0%, 100% { box-shadow: 0 0 0 0 rgba(96,165,250,0.5); } 50% { box-shadow: 0 0 0 8px rgba(96,165,250,0); } }
          `}</style>
          <div className="relative p-3.5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)',
                  boxShadow: '0 4px 12px rgba(59,130,246,0.4)',
                  animation: 'pulseShield 2s infinite',
                }}
              >
                <Shield className="w-6 h-6 text-white" strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-white font-black text-sm">حماية إضافية</h3>
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
                    style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#0a1628' }}>
                    VIP 💎
                  </span>
                </div>
                <p className="text-blue-200/70 text-[11px] font-bold mt-0.5">مراقبة ذكية 24/7 + تنبيه فوري</p>
              </div>
            </div>
            {checkError && (
              <div className="bg-red-950/60 border border-red-500/40 rounded-xl p-2 mb-2.5">
                <p className="text-red-300 text-[11px] font-bold text-center whitespace-pre-line">{checkError}</p>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={handleYes} disabled={isChecking}
                className="flex-1 relative overflow-hidden text-white font-black py-2.5 rounded-xl text-[13px] transition-all active:scale-95 disabled:opacity-60"
                style={{
                  background: isChecking ? 'linear-gradient(135deg, #475569, #334155)' : 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)',
                  boxShadow: isChecking ? 'none' : '0 4px 16px rgba(59,130,246,0.4)',
                }}
              >
                <span className="relative z-10 flex items-center justify-center gap-1.5">
                  {isChecking ? <>⏳ جاري التحقق...</> : <>🛡️ فعّل الحماية ({SHIELD_COST} ج)</>}
                </span>
              </button>
              <button onClick={() => setDismissed(true)} disabled={isChecking}
                className="px-3.5 bg-slate-800/60 text-slate-400 rounded-xl text-xs font-black border border-slate-700">
                لا
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'register' && (
        <div className="w-full rounded-2xl p-3.5"
          style={{
            background: 'linear-gradient(135deg, #0a1628 0%, #1e3a8a 50%, #0a1628 100%)',
            border: '1.5px solid rgba(96, 165, 250, 0.3)',
          }}
        >
          <div className="flex items-center gap-2 mb-2.5">
            <Phone className="w-4 h-4 text-blue-400" />
            <h3 className="text-white font-black text-sm">رقم الموبايل للتواصل</h3>
          </div>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="01xxxxxxxxx"
            className="w-full bg-slate-900/80 border border-slate-600 rounded-xl px-3 py-2 text-white text-center text-base tracking-widest mb-2.5 focus:border-blue-500 focus:outline-none"
            maxLength={11} dir="ltr"
          />
          <button onClick={handleRegister} disabled={phone.length < 10}
            className="w-full text-white font-black py-2.5 rounded-xl text-[13px] transition-all active:scale-95 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)' }}>
            🛡️ تفعيل الحماية الآن
          </button>
        </div>
      )}

      {phase === 'active' && (
        <div className="w-full flex flex-col items-center gap-1.5">
          <div className="relative" style={{ width: 110, height: 110 }}>
            <div ref={radarRef} className="absolute inset-0 rounded-full"
              style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgba(34,197,94,0.35) 40deg, transparent 80deg)' }} />
            <div className="absolute inset-1.5 rounded-full border border-green-500/20" />
            <div className="absolute inset-3 rounded-full border border-green-500/15" />
            <div className="absolute inset-5 rounded-full border border-green-500/10" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-green-500/10" />
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-green-500/10" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse shadow-lg shadow-green-400/50" />
          </div>
          <div className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 border"
            style={{
              background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(22,163,74,0.08))',
              borderColor: 'rgba(34,197,94,0.4)',
            }}>
            <ShieldCheck className="w-3 h-3 text-green-400" />
            <span className="text-green-400 text-[10px] font-black">الحماية نشطة</span>
            {shieldCode && <span className="text-green-600/80 text-[9px] font-mono">{shieldCode}</span>}
          </div>
          {gpsWarning && (
            <div className="w-full bg-yellow-950/50 border border-yellow-500/40 rounded-lg px-2 py-1.5 mt-0.5">
              <p className="text-yellow-300 text-[10px] font-bold text-center">⚠️ فعّل الـ GPS عشان المراقبة تشتغل</p>
            </div>
          )}
        </div>
      )}

      {phase === 'breach' && (
        <div className="w-full rounded-2xl p-4 backdrop-blur-sm"
          style={{
            background: 'linear-gradient(135deg, rgba(127,29,29,0.95) 0%, rgba(153,27,27,0.9) 100%)',
            border: '2px solid rgba(239,68,68,0.7)',
            boxShadow: '0 8px 32px rgba(239,68,68,0.4)',
            animation: 'breachPulse 1.5s ease-in-out infinite',
          }}
        >
          <style>{`
            @keyframes breachPulse {
              0%, 100% { box-shadow: 0 8px 32px rgba(239,68,68,0.4); }
              50% { box-shadow: 0 8px 48px rgba(239,68,68,0.7); }
            }
          `}</style>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'rgba(239,68,68,0.3)', animation: 'bounce 1s infinite' }}>
              <Siren className="w-7 h-7 text-red-300" />
            </div>
            <div>
              <h3 className="text-red-100 font-black text-lg leading-tight">🚨 تنبيه حركة!</h3>
              <p className="text-red-300/90 text-[12px] font-bold mt-0.5">
                السيارة اتحركت <span className="text-white font-black text-sm">{breachDistance}م</span> من مكان الركن
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleIamDriving}
              className="flex-1 text-white font-black py-3 rounded-xl text-[14px] transition-all active:scale-95 flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                boxShadow: '0 4px 16px rgba(22,101,52,0.5)',
              }}>
              <Car className="w-5 h-5" />
              أنا اللي سايق
            </button>
            <button onClick={handleTheft}
              className="flex-1 text-white font-black py-3 rounded-xl text-[14px] transition-all active:scale-95 flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                boxShadow: '0 4px 16px rgba(185,28,28,0.5)',
              }}>
              <AlertTriangle className="w-5 h-5" />
              مش أنا!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}