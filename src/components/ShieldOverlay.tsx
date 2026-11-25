// src/components/ShieldOverlay.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Shield,
  ShieldCheck,
  Phone,
  AlertTriangle,
  Car,
  Siren,
  Radio,
  Crosshair,
  Lock,
} from 'lucide-react';
import {
  startShieldGPS,
  startFakeAlerts,
  stopFakeAlerts,
  checkUserInsideGarage,
  destroyShield,
  saveShieldState,
  loadShieldState,
  SHIELD_STORAGE_KEY,
  SHIELD_COST,
  GEOFENCE_RADIUS,
  triggerIntenseAlarm,
  stopIntenseAlarm,
  initAudioContext,
} from '../lib/shield';
import {
  sendLocalNotification,
  playUrgentSound,
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
  onDeductWallet: (amount: number, note: string) => boolean | Promise<boolean>;
  onNavigateToWallet: () => void;
  autoResume?: boolean;
  onSessionEnd?: () => void;
}
const BRAND = {
  blue: '#1656b8',
  blueDark: '#0f3d85',
  green: '#8cc63f',
  greenDark: '#6ea62a',
  navy: '#0a1628',
  navyLight: '#111e36',
  slate: '#64748b',
  slateMuted: '#94a3b8',
  border: 'rgba(255, 255, 255, 0.12)',
};
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
const terminateShieldOnServer = async (sessionId: string, identifier: string) => {
  const nowIso = new Date().toISOString();
  await Promise.all([
    supabase
      .from('shield_sessions')
      .update({
        ended_at: nowIso,
        push_endpoint: null,
        push_p256dh: null,
        push_auth: null,
      })
      .eq('session_id', sessionId),
    supabase
      .from('shield_sessions')
      .update({ ended_at: nowIso })
      .eq('phone', identifier)
      .is('ended_at', null),
  ]);
};
export default function ShieldOverlay({
  sessionId,
  userId,
  garageId,
  parkingLat,
  parkingLng,
  userPhone,
  onDeductWallet,
  onNavigateToWallet,
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
  // استخدام نقطة الركن المحفوظة للجلسة الحالية بدلاً من الاعتماد فقط على إحداثيات الجراج الثابتة
  const [anchorCoords, setAnchorCoords] = useState<{ lat: number; lng: number }>(() => {
    const saved = loadShieldState();
    if (saved && saved.sessionId === sessionId && saved.parkingLat && saved.parkingLng) {
      return { lat: saved.parkingLat, lng: saved.parkingLng };
    }
    return { lat: parkingLat, lng: parkingLng };
  });
  const alarmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRegisteringRef = useRef(false);
  const activatingLockRef = useRef(false);
  const gpsErrorNotifiedRef = useRef(false);
  const lastRegisteredAtRef = useRef(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  // ═══════════════════════════════════════════════════════════
  // 🚨 الإنذار المحلي والشديد المشترك
  // ═══════════════════════════════════════════════════════════
  const triggerLocalAlarm = useCallback((dist: number) => {
    try {
      stopFakeAlerts();
      playUrgentSound();
      sendLocalNotification(
        '🚨 تنبيه حركة غير مصرح بها!',
        `السيارة تحركت ${dist}م من مكان الركن`,
        '/'
      );
      if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = setInterval(() => {
        playUrgentSound();
      }, 2000);
      triggerIntenseAlarm();
    } catch (e) {
      console.warn('Alarm failed:', e);
    }
  }, []);
  // ═══════════════════════════════════════════════════════════
  // 🔇 إيقاف جميع الترددات والاهتزازات
  // ═══════════════════════════════════════════════════════════
  const stopLocalAlarm = useCallback(() => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    stopIntenseAlarm();
  }, []);
  // ═══════════════════════════════════════════════════════════
  // 🚗 معالج "أنا اللي سايق"
  // ═══════════════════════════════════════════════════════════
  const handleIamDriving = useCallback(async () => {
    stopLocalAlarm();
    stopFakeAlerts();
    const flashEl = document.getElementById('shield-breach-flash-overlay');
    if (flashEl) flashEl.remove();
    destroyShield();
    try { localStorage.removeItem(SHIELD_STORAGE_KEY); } catch {}
    const identifier = userPhone || userId || 'unknown';
    try {
      await terminateShieldOnServer(sessionId, identifier);
    } catch (e) {
      console.error('❌ Failed to end shield:', e);
    }
    setPhase('dismissed');
    onSessionEnd?.();
  }, [sessionId, userPhone, userId, stopLocalAlarm, onSessionEnd]);
  // ═══════════════════════════════════════════════════════════
  // 🚨 معالج "مش أنا — سرقة!"
  // ═══════════════════════════════════════════════════════════
  const handleTheft = useCallback(async () => {
    stopLocalAlarm();
    stopFakeAlerts();
    const flashEl = document.getElementById('shield-breach-flash-overlay');
    if (flashEl) flashEl.remove();
    sendLocalNotification('✅ تم استلام البلاغ', 'جاري التواصل والمتابعة فوراً', '/');
    destroyShield();
    try { localStorage.removeItem(SHIELD_STORAGE_KEY); } catch {}
    const identifier = userPhone || userId || 'unknown';
    try {
      await terminateShieldOnServer(sessionId, identifier);
    } catch (e) {
      console.error('❌ Failed to end shield:', e);
    }
    setPhase('dismissed');
    onSessionEnd?.();
  }, [sessionId, userPhone, userId, stopLocalAlarm, onSessionEnd]);
  // ═══════════════════════════════════════════════════════════
  // 🎧 تهيئة الصوت التلقائية
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (phase === 'active' || phase === 'breach') {
      try { initAudioContext(); } catch {}
    }
  }, [phase]);
  // ═══════════════════════════════════════════════════════════
  // 🔔 إشعارات بنك الدرع الوهمية كل 30 دقيقة للعميل أثناء التفعيل
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (phase === 'active') {
      startFakeAlerts();
      return () => {
        const saved = loadShieldState();
        if (!saved?.isActive || saved.sessionId !== sessionId) {
          stopFakeAlerts();
        }
      };
    } else if (phase === 'breach' || phase === 'dismissed') {
      stopFakeAlerts();
    }
  }, [phase, sessionId]);
  // ═══════════════════════════════════════════════════════════
  // 🚨 فلاش أحمر ثابت وقت الاختراق
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (phase !== 'breach') return;
    document.getElementById('shield-breach-flash-overlay')?.remove();
    const flashEl = document.createElement('div');
    flashEl.id = 'shield-breach-flash-overlay';
    flashEl.style.cssText = [
      'position: fixed',
      'inset: 0',
      'z-index: 99997',
      'pointer-events: none',
      'background: rgba(255, 0, 0, 0.4)',
      'animation: shieldFlashAnim 0.36s ease-in-out infinite alternate',
    ].join(';');
    if (!document.getElementById('shield-flash-style')) {
      const style = document.createElement('style');
      style.id = 'shield-flash-style';
      style.textContent = `
        @keyframes shieldFlashAnim {
          0%   { background-color: rgba(255, 0, 0, 0.45); }
          50%  { background-color: rgba(139, 0, 0, 0.18); }
          100% { background-color: rgba(255, 0, 0, 0.50); }
        }
      `;
      document.head.appendChild(style);
    }
    document.body.appendChild(flashEl);
    return () => {
      flashEl.remove();
    };
  }, [phase]);
  // ─── استرجاع حالة الدرع (فقط عند البداية phase === 'ask' حتى لا يُلغي شاشة الاختراق) ───
  useEffect(() => {
    if (phase !== 'ask') return;
    if (autoResume) {
      const saved = loadShieldState();
      if (saved?.sessionId === sessionId) {
        setShieldCode(saved.shieldCode);
        setPhone(saved.phone ?? '');
        if (saved.parkingLat && saved.parkingLng) {
          setAnchorCoords({ lat: saved.parkingLat, lng: saved.parkingLng });
        }
      } else {
        const code = 'SH-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        setShieldCode(code);
        saveShieldState({
          isActive: true,
          shieldCode: code,
          phone: userPhone || '',
          garageId,
          parkingLat: anchorCoords.lat,
          parkingLng: anchorCoords.lng,
          sessionId,
          anchorLocked: false,
        });
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
      if (saved.parkingLat && saved.parkingLng) {
        setAnchorCoords({ lat: saved.parkingLat, lng: saved.parkingLng });
      }
      setPhase('active');
    }
  }, [garageId, sessionId, autoResume, phase, userPhone, anchorCoords.lat, anchorCoords.lng]);
  // ─── تتبع الـ GPS والسرعة عبر المحرك الموحد ───
  const isTracking = phase === 'active' || phase === 'breach';
  useEffect(() => {
    if (!isTracking) return;
    gpsErrorNotifiedRef.current = false;
    const cleanupGPS = startShieldGPS({
      sessionId,
      parkingLat: anchorCoords.lat,
      parkingLng: anchorCoords.lng,
      onGeofenceBreach: (dist) => {
        setBreachDistance(Math.round(dist));
        setPhase('breach');
        triggerLocalAlarm(Math.round(dist));
      },
      onGPSError: () => {
        setGpsWarning(true);
        if (!gpsErrorNotifiedRef.current) {
          gpsErrorNotifiedRef.current = true;
          sendLocalNotification(
            '⚠️ الـ GPS مقفول!',
            'فعّل الموقع عشان رادار المراقبة يفضل شغال',
            '/'
          );
        }
      },
    });
    return () => {
      cleanupGPS();
    };
  }, [isTracking, sessionId, anchorCoords.lat, anchorCoords.lng, triggerLocalAlarm]);
  // ─── التسجيل على السيرفر (مع منع التكرار المتزامن) ───
  const registerOnServer = useCallback(async () => {
    if (isRegisteringRef.current) return;
    if (Date.now() - lastRegisteredAtRef.current < 5000) return;
    isRegisteringRef.current = true;
    const saved = loadShieldState();
    const effLat = saved?.sessionId === sessionId && saved.parkingLat ? saved.parkingLat : anchorCoords.lat;
    const effLng = saved?.sessionId === sessionId && saved.parkingLng ? saved.parkingLng : anchorCoords.lng;
    const identifier = userPhone || userId || 'unknown';
    let pushEndpoint: string | null = null;
    let pushP256dh: string | null = null;
    let pushAuth: string | null = null;
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        let perm = typeof Notification !== 'undefined' ? Notification.permission : 'default';
        if (perm !== 'granted' && typeof Notification !== 'undefined') {
          perm = await Notification.requestPermission();
        }
        if (perm === 'granted') {
          const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;
          if (!sub && VAPID_PUBLIC) {
            try {
              sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
              });
            } catch (subErr) {
              console.warn('⚠️ Push subscribe failed:', subErr);
            }
          }
          if (sub) {
            const subJson = sub.toJSON();
            if (subJson?.endpoint) {
              pushEndpoint = subJson.endpoint;
              pushP256dh = subJson.keys?.p256dh || null;
              pushAuth = subJson.keys?.auth || null;
            }
          }
        }
      }
    } catch (swErr) {
      console.warn('⚠️ Service Worker not ready:', swErr);
    }
    try {
      const { data: existing } = await supabase
        .from('shield_sessions')
        .select('session_id, fake_tick, alert_count, ended_at')
        .eq('session_id', sessionId)
        .is('ended_at', null)
        .maybeSingle();
      if (existing) {
        await Promise.all([
          supabase
            .from('shield_sessions')
            .update({
              push_endpoint: pushEndpoint,
              push_p256dh: pushP256dh,
              push_auth: pushAuth,
            })
            .eq('session_id', sessionId),
          registerShieldSession(sessionId, effLat, effLng, identifier, garageId),
        ]);
        lastRegisteredAtRef.current = Date.now();
        return;
      }
      await supabase
        .from('shield_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('phone', identifier)
        .is('ended_at', null);
      await Promise.all([
        supabase.from('shield_sessions').insert({
          session_id: sessionId,
          user_id: identifier,
          phone: identifier,
          parking_lat: effLat,
          parking_lng: effLng,
          push_endpoint: pushEndpoint,
          push_p256dh: pushP256dh,
          push_auth: pushAuth,
          last_lat: effLat,
          last_lng: effLng,
          last_gps_at: new Date().toISOString(),
          client_outside: false,
          theft_alerted: false,
          fake_mode: -1,
          alert_count: 0,
          fake_tick: 0,
          last_speed: null,
        }),
        registerShieldSession(sessionId, effLat, effLng, identifier, garageId),
      ]);
      lastRegisteredAtRef.current = Date.now();
    } catch (dbErr: any) {
      console.error('❌ DB registration failed:', dbErr?.message || dbErr);
    } finally {
      isRegisteringRef.current = false;
    }
  }, [sessionId, userId, userPhone, anchorCoords.lat, anchorCoords.lng, garageId]);
  // ─── تجديد اشتراك الـ Push كل 10 دقائق ───
  useEffect(() => {
    if (phase !== 'active') return;
    const refreshSubscription = async () => {
      if (isRegisteringRef.current || Date.now() - lastRegisteredAtRef.current < 10000) return;
      try {
        if (!('serviceWorker' in navigator)) return;
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;
        if (!VAPID_PUBLIC) return;
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
          });
        }
        if (sub) {
          const subJson = sub.toJSON();
          const identifier = userPhone || userId || 'unknown';
          const saved = loadShieldState();
          const effLat = saved?.sessionId === sessionId && saved.parkingLat ? saved.parkingLat : anchorCoords.lat;
          const effLng = saved?.sessionId === sessionId && saved.parkingLng ? saved.parkingLng : anchorCoords.lng;
          await Promise.all([
            supabase
              .from('shield_sessions')
              .update({
                push_endpoint: subJson.endpoint,
                push_p256dh: subJson.keys?.p256dh,
                push_auth: subJson.keys?.auth,
              })
              .eq('session_id', sessionId)
              .is('ended_at', null),
            registerShieldSession(sessionId, effLat, effLng, identifier, garageId),
          ]);
        }
      } catch (e) {
        console.warn('Failed to refresh subscription:', e);
      }
    };
    const interval = setInterval(refreshSubscription, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [phase, sessionId, userPhone, userId, garageId, anchorCoords.lat, anchorCoords.lng]);
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
    return () => {
      supabase.removeChannel(channel);
    };
  }, [phase, sessionId, triggerLocalAlarm]);
  // ─── Service Worker Messages ───
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
  // ─── Cleanup ───
  useEffect(() => {
    return () => {
      stopLocalAlarm();
      const saved = loadShieldState();
      if (!saved?.isActive || saved.sessionId !== sessionId) {
        destroyShield();
      }
      const leftover = document.getElementById('shield-breach-flash-overlay');
      if (leftover) leftover.remove();
    };
  }, [stopLocalAlarm, sessionId]);
  useEffect(() => {
    if (phase !== 'active') return;
    registerOnServer();
  }, [phase, registerOnServer]);
  // ═══════════════════════════════════════════════════════
  // 🎯 handleYes — تفعيل الدرع يدوياً
  // ═══════════════════════════════════════════════════════
  const handleYes = useCallback(async () => {
    if (activatingLockRef.current) return;
    activatingLockRef.current = true;
    initAudioContext();
    unlockAudio();
    setCheckError(null);
    setIsChecking(true);
    try {
      await requestNotificationPermission();
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
      const actualLat = check.lat ?? parkingLat;
      const actualLng = check.lng ?? parkingLng;
      setAnchorCoords({ lat: actualLat, lng: actualLng });
      try {
        await subscribeToPush(garageId, userPhone || undefined);
      } catch (pushErr) {
        console.warn('Push subscription failed (non-fatal):', pushErr);
      }
      const ok = await onDeductWallet(SHIELD_COST, 'خدمة الحماية الإضافية');
      if (!ok) {
        setIsChecking(false);
        onNavigateToWallet();
        return;
      }
      supabase
        .from('sessions')
        .update({ shield_cost: SHIELD_COST })
        .eq('id', sessionId)
        .then(
          () => {},
          (e) => console.warn('⚠️ Failed to save shield cost:', e)
        );
      setIsChecking(false);
      if (userPhone) {
        const code = 'SH-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        setShieldCode(code);
        setPhase('active');
        saveShieldState({
          isActive: true,
          shieldCode: code,
          phone: userPhone,
          garageId,
          parkingLat: actualLat,
          parkingLng: actualLng,
          sessionId,
          anchorLocked: true,
        });
        await registerOnServer();
      } else {
        setPhase('register');
      }
    } catch (e: any) {
      setIsChecking(false);
      console.error('❌ Shield activation error:', e);
      setCheckError(e?.message || 'حصل خطأ، جرّب تاني');
    } finally {
      activatingLockRef.current = false;
    }
  }, [userPhone, garageId, sessionId, parkingLat, parkingLng, onDeductWallet, onNavigateToWallet, registerOnServer]);
  const handleRegister = useCallback(async () => {
    if (activatingLockRef.current || phone.length < 10) return;
    activatingLockRef.current = true;
    try {
      initAudioContext();
      const code = 'SH-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      setShieldCode(code);
      setPhase('active');
      saveShieldState({
        isActive: true,
        shieldCode: code,
        phone,
        garageId,
        parkingLat: anchorCoords.lat,
        parkingLng: anchorCoords.lng,
        sessionId,
        anchorLocked: true,
      });
      await registerOnServer();
    } finally {
      activatingLockRef.current = false;
    }
  }, [phone, garageId, sessionId, anchorCoords.lat, anchorCoords.lng, registerOnServer]);
  if (dismissed) {
    return (
      <button
        onClick={() => {
          initAudioContext();
          setDismissed(false);
        }}
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 99999,
          background: 'linear-gradient(135deg, #1e3a8a, #1e40af)',
          color: '#ffffff',
          border: '2px solid #60a5fa',
          borderRadius: 14,
          padding: '10px 18px',
          fontSize: 13,
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          boxShadow: '0 4px 24px rgba(96,165,250,0.4)',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        🛡️ تفعيل الحماية
      </button>
    );
  }
  if (phase === 'dismissed') return null;
  return (
    <div className="w-full flex flex-col items-center gap-2">
      <style>{`
        @keyframes radar-overlay-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes radar-overlay-wave {
          0% { transform: scale(0.6); opacity: 0.8; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes pulse-gold {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.85; }
        }
      `}</style>
      {/* ─── PHASE: ASK (طلب التفعيل) ─── */}
      {phase === 'ask' && (
        <div
          className="w-full relative overflow-hidden rounded-2xl"
          style={{
            background: 'linear-gradient(135deg, #0a1628 0%, #1e3a8a 50%, #0a1628 100%)',
            border: '1.5px solid rgba(96, 165, 250, 0.35)',
            boxShadow: '0 8px 32px rgba(22, 86, 184, 0.35), inset 0 1px 0 rgba(255,255,255,0.1)',
          }}
        >
          <div className="relative p-3.5">
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border border-blue-400/40"
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)',
                  boxShadow: '0 4px 14px rgba(59,130,246,0.45)',
                }}
              >
                <Shield className="w-6 h-6 text-white animate-pulse" strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-white font-black text-sm">حماية ورادار ذكي للمركبة</h3>
                  <span
                    className="text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm"
                    style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#0a1628' }}
                  >
                    VIP 💎
                  </span>
                </div>
                <p className="text-blue-200/80 text-[11px] font-bold mt-0.5">
                  رادار GPS فوري + إنذار واهتزاز مباشر عند التحرك
                </p>
              </div>
            </div>
            {checkError && (
              <div className="bg-red-950/70 border border-red-500/50 rounded-xl p-2 mb-2.5">
                <p className="text-red-300 text-[11px] font-bold text-center whitespace-pre-line leading-relaxed">
                  {checkError}
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleYes}
                disabled={isChecking}
                className="flex-1 relative overflow-hidden text-white font-black py-2.5 rounded-xl text-[13px] transition-all active:scale-95 disabled:opacity-60 cursor-pointer border-0"
                style={{
                  background: isChecking
                    ? 'linear-gradient(135deg, #475569, #334155)'
                    : 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)',
                  boxShadow: isChecking ? 'none' : '0 4px 16px rgba(59,130,246,0.4)',
                }}
              >
                <span className="relative z-10 flex items-center justify-center gap-1.5">
                  {isChecking ? <>⏳ جاري التحقق من الموقع...</> : <>🛡️ فعّل الحماية ({SHIELD_COST} ج)</>}
                </span>
              </button>
              <button
                onClick={() => setDismissed(true)}
                disabled={isChecking}
                className="px-4 bg-slate-800/80 text-slate-300 rounded-xl text-xs font-black border border-slate-700 active:scale-95 transition-all cursor-pointer"
              >
                لا
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ─── PHASE: REGISTER (إدخال الهاتف) ─── */}
      {phase === 'register' && (
        <div
          className="w-full rounded-2xl p-3.5"
          style={{
            background: 'linear-gradient(135deg, #0a1628 0%, #1e3a8a 50%, #0a1628 100%)',
            border: '1.5px solid rgba(96, 165, 250, 0.35)',
          }}
        >
          <div className="flex items-center gap-2 mb-2.5">
            <Phone className="w-4 h-4 text-blue-400" />
            <h3 className="text-white font-black text-sm">رقم الموبايل للتواصل وحفظ الأمان</h3>
          </div>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01xxxxxxxxx"
            className="w-full bg-slate-900/90 border border-slate-600 rounded-xl px-3 py-2 text-white text-center text-base font-mono tracking-widest mb-2.5 focus:border-blue-500 focus:outline-none"
            maxLength={11}
            dir="ltr"
          />
          <button
            onClick={handleRegister}
            disabled={phone.length < 10}
            className="w-full text-white font-black py-2.5 rounded-xl text-[13px] transition-all active:scale-95 disabled:opacity-50 border-0 cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
              boxShadow: '0 4px 16px rgba(22,163,74,0.4)',
            }}
          >
            🛡️ تفعيل الحماية والرادار الآن
          </button>
        </div>
      )}
      {/* ─── PHASE: ACTIVE (الرادار التكتيكي النشط) ─── */}
      {phase === 'active' && (
        <div className="w-full flex flex-col items-center gap-2">
          {/* سكوب الرادار الحي */}
          <div className="relative w-36 h-36 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-emerald-500/30 bg-slate-950/90 shadow-[0_0_20px_rgba(34,197,94,0.2)_inset]" />
            <div className="absolute inset-4 rounded-full border border-emerald-500/20" />
            <div className="absolute inset-8 rounded-full border border-dashed border-emerald-400/40" />
            {/* خطوط المحاور */}
            <div className="absolute inset-x-0 top-1/2 h-[1px] bg-emerald-500/20" />
            <div className="absolute inset-y-0 left-1/2 w-[1px] bg-emerald-500/20" />
            {/* شعاع المسح الدوّار */}
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background: 'conic-gradient(from 0deg, rgba(34,197,94,0.5) 0deg, rgba(14,165,233,0.15) 45deg, transparent 90deg, transparent 360deg)',
                animation: 'radar-overlay-spin 2.8s linear infinite',
              }}
            />
            {/* نقطة الهدف للمركبة في المنتصف */}
            <div className="relative z-10 flex flex-col items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-slate-900 border-2 border-emerald-400 flex items-center justify-center shadow-[0_0_12px_#22c55e]">
                <Car className="w-4 h-4 text-emerald-400" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
            </div>
          </div>
          {/* شارة حالة الدرع والسيريال */}
          <div
            className="flex items-center gap-1.5 rounded-full px-3 py-1 border shadow-md"
            style={{
              background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(10,22,40,0.95))',
              borderColor: 'rgba(34,197,94,0.45)',
            }}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-[11px] font-black">الدرع الإلكتروني نشط</span>
            {shieldCode && (
              <span className="text-slate-300 text-[10px] font-mono tracking-wider font-bold">
                [{shieldCode}]
              </span>
            )}
          </div>
          {/* البانر الأمني الإرشادي لمنع قفل التاب */}
          <div
            className="w-full max-w-sm rounded-xl p-2.5 text-right border"
            style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(10, 22, 40, 0.95) 100%)',
              borderColor: 'rgba(245, 158, 11, 0.3)',
            }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Radio className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
              <p className="text-[10px] font-black text-amber-300">
                رادار الحماية نشط في الخلفية
              </p>
            </div>
            <p className="text-[9px] font-bold text-slate-300 leading-relaxed">
              💡 يُرجى ترك هذه الصفحة مفتوحة وقفل شاشة الموبايل فقط لضمان انطلاق السارينة فوراً عند أي خطر.
            </p>
          </div>
          {gpsWarning && (
            <div className="w-full bg-amber-950/60 border border-amber-500/40 rounded-xl px-3 py-1.5">
              <p className="text-amber-300 text-[10px] font-bold text-center">
                ⚠️ برجاء تفعيل الـ GPS لضمان عمل الرادار بأقصى دقة
              </p>
            </div>
          )}
        </div>
      )}
      {/* ─── PHASE: BREACH (شاشة الاختراق والإنذار التكتيكية) ─── */}
      {phase === 'breach' && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{
            zIndex: 99998,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl p-6 text-center border-2 border-red-500 shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, #1a0505 0%, #0a1628 100%)',
              boxShadow: '0 0 60px rgba(239,68,68,0.6), 0 0 120px rgba(239,68,68,0.2)',
              animation: 'pulse 1s ease-in-out infinite',
            }}
          >
            <div className="text-6xl mb-3">🚨</div>
            <h2 className="text-2xl font-black text-red-400 mb-2">
              تنبيه حركة غير مصرح بها!
            </h2>
            <p className="text-gray-300 text-sm mb-6 leading-relaxed">
              تم رصد تحرك السيارة مسافة{' '}
              <span className="text-red-400 font-black text-lg">{breachDistance}م</span>{' '}
              عن نقطة الركن الأصلية.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleIamDriving}
                className="w-full py-3.5 rounded-xl font-black text-white text-sm active:scale-95 transition-all flex items-center justify-center gap-2 border-0 cursor-pointer shadow-lg"
                style={{
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  boxShadow: '0 4px 16px rgba(34,197,94,0.4)',
                }}
              >
                <Car className="w-4 h-4" />
                ✅ أنا اللي سايق
              </button>
              <button
                onClick={handleTheft}
                className="w-full py-3.5 rounded-xl font-black text-white text-sm active:scale-95 transition-all flex items-center justify-center gap-2 border-0 cursor-pointer shadow-lg"
                style={{
                  background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                  boxShadow: '0 4px 16px rgba(239,68,68,0.4)',
                }}
              >
                <AlertTriangle className="w-4 h-4" />
                🚔 مش أنا — سرقة!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}