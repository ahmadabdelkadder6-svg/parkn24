import { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, ShieldCheck, Phone, AlertTriangle, Car, Siren } from 'lucide-react';
import {
  startShieldGPS, checkUserInsideGarage,
  destroyShield, saveShieldState, loadShieldState,
  SHIELD_STORAGE_KEY, SHIELD_COST,
} from '../lib/shield';
import {
  sendLocalNotification, playUrgentSound,
  vibrateUrgent, requestNotificationPermission,
  stopVibration, unlockAudio,
} from '../utils/notifications';
import { subscribeToPush } from '../lib/pushManager';
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

  const triggerLocalAlarm = useCallback((dist: number) => {
    try {
      playUrgentSound();
      vibrateUrgent();
      sendLocalNotification(
        '🚨 تنبيه حركة!',
        `السيارة تحركت ${dist}م من مكان الركن`,
        'shield-breach-local',
      );
      if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = setInterval(() => {
        playUrgentSound();
        vibrateUrgent();
      }, 3000);
    } catch (e) {
      console.warn('Alarm failed:', e);
    }
  }, []);

  const stopLocalAlarm = useCallback(() => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    stopVibration();
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
      console.log('✅ Shield session ended on server');
    } catch (e) {
      console.error('❌ Failed to end shield:', e);
    }

    setPhase('dismissed');
  }, [sessionId, userPhone, userId, stopLocalAlarm]);

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

  useEffect(() => {
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
  }, [garageId, sessionId]);

  useEffect(() => {
    if (phase !== 'active') return;

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
          'shield-gps-warning',
        );
      },
    });

    return () => { cleanupGPS(); };
  }, [phase, sessionId, parkingLat, parkingLng, triggerLocalAlarm]);

  // ─── 🔄 تجديد الـ Push Subscription تلقائي ───
  useEffect(() => {
    if (phase !== 'active') return;

    const refreshSubscription = async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();

        if (!sub) {
          const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;
          if (!VAPID_PUBLIC) return;

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

          console.log('✅ Push subscription refreshed');
        }
      } catch (e) {
        console.warn('Failed to refresh subscription:', e);
      }
    };

    refreshSubscription();
    const interval = setInterval(refreshSubscription, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [phase, sessionId, userPhone, userId]);

  useEffect(() => {
    if (phase !== 'active') return;

    const channel = supabase
      .channel(`shield-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'shield_sessions', filter: `session_id=eq.${sessionId}` },
        (payload: any) => {
          const u = payload.new;
          if (u.theft_alerted && phase !== 'breach') {
            setBreachDistance(300);
            setPhase('breach');
            triggerLocalAlarm(300);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [phase, sessionId, triggerLocalAlarm]);

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
  }, [handleIamDriving]);

  useEffect(() => {
    return () => {
      stopLocalAlarm();
      destroyShield();
      const identifier = userPhone || userId || 'unknown';

      supabase.from('shield_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('session_id', sessionId).is('ended_at', null)
        .then(() => {}).catch(() => {});

      supabase.from('shield_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('phone', identifier).is('ended_at', null)
        .then(() => console.log('✅ Shield auto-closed'))
        .catch(() => {});
    };
  }, [sessionId, userPhone, userId, stopLocalAlarm]);

  const registerOnServer = useCallback(async () => {
    const identifier = userPhone || userId || 'unknown';
    console.log('🔍 registerOnServer, phone:', identifier);
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        let perm = Notification.permission;
        if (perm !== 'granted') perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          console.error('❌ Permission denied');
          return;
        }

        const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;
        if (!VAPID_PUBLIC) {
          console.error('❌ VITE_VAPID_PUBLIC_KEY undefined');
          return;
        }

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

      const subJson = sub!.toJSON();
      if (!subJson?.endpoint) return;

      await supabase.from('shield_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('phone', identifier).is('ended_at', null);

      // ✅ بسيط: 50% إشعار واحد، 50% إشعارين — مفيش صفر
      const fakeMode = Math.random() < 0.5 ? 1 : 2;

      await supabase.from('shield_sessions').delete().eq('session_id', sessionId);

      const { error } = await supabase.from('shield_sessions').insert({
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
        is_outside_fence: false,
        theft_alerted: false,
        fake_mode: fakeMode,
        alert_count: 0,
        last_speed: null,
      });

      if (error) console.error('❌ Insert error:', error.message);
      else console.log('✅ Shield registered! 🎉');
    } catch (e: any) {
      console.error('❌ Crashed:', e.message);
    }
  }, [sessionId, userId, userPhone, parkingLat, parkingLng]);

  const handleYes = useCallback(async () => {
    unlockAudio();
    setCheckError(null);
    setIsChecking(true);

    try {
      await requestNotificationPermission();

      const check = await checkUserInsideGarage(parkingLat, parkingLng);

      if (!check.inside) {
        setIsChecking(false);
        if (check.distance < 0) {
          setCheckError('مش قادر أحدد موقعك! فعّل الـ GPS وجرّب تاني.');
        } else {
          setCheckError(`لازم تكون جوه الجراج علشان تفعّل الحماية (بُعدك ${Math.round(check.distance)}م)`);
        }
        return;
      }

      const { data: vipGarages, error: vipErr } = await supabase
        .from('garages')
        .select('lat, lng, name')
        .eq('is_vip', true)
        .eq('is_active', true);

      if (vipErr) {
        setIsChecking(false);
        setCheckError('مش قادر أتحقق من الجراجات، جرّب تاني');
        return;
      }

      if (!vipGarages || vipGarages.length === 0) {
        setIsChecking(false);
        setCheckError('مفيش جراجات VIP متاحة حالياً');
        return;
      }

      let minDist = Infinity;
      let nearestGarage = '';
      for (const g of vipGarages) {
        if (g.lat == null || g.lng == null) continue;
        const d = haversine(parkingLat, parkingLng, g.lat, g.lng);
        if (d < minDist) {
          minDist = d;
          nearestGarage = g.name || '';
        }
      }

      if (minDist > 250) {
        setIsChecking(false);
        setCheckError(`الحماية الإضافية متاحة في جراجات VIP فقط 💎${nearestGarage ? `\nأقرب جراج VIP: ${nearestGarage}` : ''}`);
        return;
      }

      console.log(`✅ VIP check passed: ${nearestGarage} (${Math.round(minDist)}م)`);

      try { await subscribeToPush(garageId); } catch { /* */ }

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
        .then(() => {})
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
    } catch (e) {
      setIsChecking(false);
      setCheckError('حصل خطأ غير متوقع، جرّب تاني');
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

  const handleTheft = useCallback(async () => {
    stopLocalAlarm();
    sendLocalNotification('✅ تم استلام البلاغ', 'هيتم التواصل معاك قريباً');
    destroyShield();
    try { localStorage.removeItem(SHIELD_STORAGE_KEY); } catch {}

    const identifier = userPhone || userId || 'unknown';

    try {
      await endShieldOnServer(sessionId);
      await supabase.from('shield_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('phone', identifier).is('ended_at', null);
      console.log('✅ Shield session ended');
    } catch (e) {
      console.error('❌ Failed to end shield:', e);
    }

    setPhase('dismissed');
  }, [sessionId, userPhone, userId, stopLocalAlarm]);

  if (dismissed) {
    return (
      <button
        onClick={() => setDismissed(false)}
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
    <div className="w-full flex flex-col items-center gap-3 py-3">

      {phase === 'ask' && (
        <div className="w-full bg-gradient-to-br from-blue-950/60 to-slate-900/60 border border-blue-500/30 rounded-2xl p-4 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Shield className="w-7 h-7 text-blue-400" />
            </div>
            <div>
              <h3 className="text-white font-bold text-base">خدمة الحماية الإضافية 💎</h3>
              <p className="text-blue-300/70 text-xs">مراقبة ذكية + تنبيهات فورية للحركة</p>
            </div>
          </div>

          {checkError && (
            <div className="bg-red-950/50 border border-red-500/40 rounded-xl p-2.5 mb-3">
              <p className="text-red-300 text-xs font-bold text-center whitespace-pre-line">{checkError}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleYes}
              disabled={isChecking}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-2.5 rounded-xl text-sm transition-all active:scale-95"
            >
              {isChecking ? '📍 جاري التحقق من موقعك...' : `💎 تفعيل (${SHIELD_COST} ج)`}
            </button>
            <button
              onClick={() => setDismissed(true)}
              disabled={isChecking}
              className="px-4 bg-slate-700/50 text-slate-400 rounded-xl text-sm hover:bg-slate-700 transition-all disabled:opacity-50"
            >
              لا
            </button>
          </div>
        </div>
      )}

      {phase === 'register' && (
        <div className="w-full bg-gradient-to-br from-blue-950/60 to-slate-900/60 border border-blue-500/30 rounded-2xl p-4 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <Phone className="w-5 h-5 text-blue-400" />
            <h3 className="text-white font-bold text-sm">رقم الموبايل للتواصل</h3>
          </div>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01xxxxxxxxx"
            className="w-full bg-slate-800/80 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-center text-lg tracking-widest mb-3 focus:border-blue-500 focus:outline-none"
            maxLength={11}
            dir="ltr"
          />
          <button
            onClick={handleRegister}
            disabled={phone.length < 10}
            className="w-full bg-blue-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-2.5 rounded-xl text-sm transition-all active:scale-95"
          >
            تفعيل الحماية الآن
          </button>
        </div>
      )}

      {phase === 'active' && (
        <div className="flex flex-col items-center gap-2">
          <div className="relative" style={{ width: 128, height: 128 }}>
            <div
              ref={radarRef}
              className="absolute inset-0 rounded-full"
              style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgba(34,197,94,0.35) 40deg, transparent 80deg)' }}
            />
            <div className="absolute inset-2 rounded-full border border-green-500/20" />
            <div className="absolute inset-5 rounded-full border border-green-500/15" />
            <div className="absolute inset-8 rounded-full border border-green-500/10" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-green-500/10" />
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-green-500/10" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-green-400 animate-pulse shadow-lg shadow-green-400/50" />
            <div className="absolute w-1.5 h-1.5 rounded-full bg-green-300/60" style={{ top: '25%', left: '65%' }} />
            <div className="absolute w-1 h-1 rounded-full bg-green-300/40" style={{ top: '70%', left: '25%' }} />
            <div className="absolute w-1 h-1 rounded-full bg-green-300/50" style={{ top: '60%', left: '75%' }} />
          </div>

          <div className="flex items-center gap-1.5 bg-green-950/50 border border-green-500/30 rounded-full px-3 py-1">
            <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
            <span className="text-green-400 text-xs font-bold">الحماية نشطة</span>
            {shieldCode && <span className="text-green-600 text-[10px] font-mono">{shieldCode}</span>}
          </div>

          {gpsWarning && (
            <div className="w-full bg-yellow-950/50 border border-yellow-500/40 rounded-xl p-2.5 mt-1">
              <p className="text-yellow-300 text-xs font-bold text-center">
                ⚠️ الـ GPS مقفول! فعّل الموقع عشان المراقبة تشتغل
              </p>
            </div>
          )}

          <p className="text-slate-400 text-[10px] text-center max-w-xs mt-1">
            🔒 المراقبة شغالة في الخلفية حتى لو قفلت التطبيق
          </p>
        </div>
      )}

      {phase === 'breach' && (
        <div className="w-full bg-red-950/90 border-2 border-red-500 rounded-2xl p-4 animate-pulse backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-red-500/30 flex items-center justify-center animate-bounce">
              <Siren className="w-7 h-7 text-red-400" />
            </div>
            <div>
              <h3 className="text-red-300 font-black text-lg">🚨 تنبيه حركة!</h3>
              <p className="text-red-400/80 text-xs">
                السيارة اتحركت {breachDistance}م من مكان الركن
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleIamDriving}
              className="flex-1 bg-green-700 hover:bg-green-600 text-white font-bold py-3 rounded-xl text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
            >
              <Car className="w-4 h-4" />
              أنا اللي سايق
            </button>
            <button
              onClick={handleTheft}
              className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
            >
              <AlertTriangle className="w-4 h-4" />
              مش أنا!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}