import { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, ShieldCheck, Phone, AlertTriangle, Car, Siren } from 'lucide-react';
import {
  startFakeAlerts, stopFakeAlerts,
  startShieldGPS,
  destroyShield, saveShieldState, loadShieldState,
  SHIELD_STORAGE_KEY, SHIELD_COST,
  type FakeAlert,
} from '../lib/shield';
import {
  sendLocalNotification, playUrgentSound, playNormalAlert,
  vibrateUrgent, requestNotificationPermission,
  stopVibration, unlockAudio,
} from '../utils/notifications';
import { subscribeToPush } from '../lib/pushManager';
import { supabase } from '../lib/supabase';

type Phase = 'ask' | 'register' | 'active' | 'breach' | 'dismissed';

interface Props {
  sessionId: string;
  garageId: string;
  parkingLat: number;
  parkingLng: number;
  userPhone: string | null;
  onDeductWallet: (amount: number, note: string) => boolean;
  onNavigateToWallet: () => void;
}

// ─── Helper: ألغي الدرع من السيرفر ───
const endShieldOnServer = (sessionId: string) => {
  supabase
    .from('shield_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .is('ended_at', null)
    .then(() => {})
    .catch(() => {});
};

export default function ShieldOverlay({
  sessionId, garageId, parkingLat, parkingLng,
  userPhone, onDeductWallet, onNavigateToWallet,
}: Props) {
  const [phase, setPhase] = useState<Phase>('ask');
  const [phone, setPhone] = useState(userPhone ?? '');
  const [alerts, setAlerts] = useState<FakeAlert[]>([]);
  const [breachDistance, setBreachDistance] = useState(0);
  const [shieldCode, setShieldCode] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const testTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const radarAngle = useRef(0);
  const radarRef = useRef<HTMLDivElement>(null);

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

  // ─── Load saved state (بس لو نفس الجلسة بالظبط) ───
  useEffect(() => {
    const saved = loadShieldState() as any;
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

  // ─── Start GPS + Fake Alerts when active ───
  useEffect(() => {
    if (phase !== 'active') return;

    const cleanupGPS = startShieldGPS({
      parkingLat, parkingLng,
      onGeofenceBreach: (dist) => {
        setBreachDistance(Math.round(dist));
        setPhase('breach');
        playUrgentSound();
        vibrateUrgent();
        sendLocalNotification('🚨 إنذار سرقة!', `السيارة خرجت ${Math.round(dist)}م من نطاق الحماية!`);
      },
    });

    startFakeAlerts(
      (alert) => {
        setAlerts(prev => [alert, ...prev].slice(0, 5));
        sendLocalNotification(alert.title, alert.body);
        playNormalAlert();
      },
      {
        onWarningResolved: (_w, resolved) => {
          setAlerts(prev => [resolved, ...prev].slice(0, 5));
          sendLocalNotification(resolved.title, resolved.body);
        },
      },
    );

    return () => {
      cleanupGPS();
      stopFakeAlerts();
    };
  }, [phase, parkingLat, parkingLng]);

  // ─── Cleanup on unmount ───
  useEffect(() => {
    return () => {
      testTimersRef.current.forEach(clearTimeout);
      endShieldOnServer(sessionId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Helper: سجّل الدرع على السيرفر ───
  const registerOnServer = useCallback(async () => {
    console.log('🔍 registerOnServer started...');
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (!user) {
        console.error('❌ Step 1 failed: No user', userErr);
        return;
      }
      console.log('✅ Step 1: User found', user.id);

      const reg = await navigator.serviceWorker.ready;
      console.log('✅ Step 2: SW ready');

      let sub = await reg.pushManager.getSubscription();
      if (sub) {
        console.log('✅ Step 3: Existing subscription found');
      } else {
        console.log('🔄 Step 3: No subscription, creating...');

        let perm = Notification.permission;
        if (perm !== 'granted') {
          perm = await Notification.requestPermission();
        }
        if (perm !== 'granted') {
          console.error('❌ Step 4 failed: Permission', perm);
          return;
        }
        console.log('✅ Step 4: Permission granted');

        const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;
        if (!VAPID_PUBLIC) {
          console.error('❌ Step 5 failed: VITE_VAPID_PUBLIC_KEY undefined!');
          console.error('📋 VITE vars:', Object.keys(import.meta.env).filter(k => k.startsWith('VITE_')));
          return;
        }
        console.log('✅ Step 5: VAPID key found', VAPID_PUBLIC.substring(0, 10) + '...');

        const urlBase64ToUint8Array = (b: string): Uint8Array => {
          const p = '='.repeat((4 - (b.length % 4)) % 4);
          const d = window.atob((b + p).replace(/-/g, '+').replace(/_/g, '/'));
          return new Uint8Array([...d].map(c => c.charCodeAt(0)));
        };

        try {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
          });
          console.log('✅ Step 6: Subscription created');
        } catch (subErr: any) {
          console.error('❌ Step 6 failed:', subErr.message);
          return;
        }
      }

      const subJson = sub!.toJSON();
      if (!subJson?.endpoint) {
        console.error('❌ Step 7 failed: No endpoint', subJson);
        return;
      }
      console.log('✅ Step 7: Endpoint OK');

      await supabase.from('shield_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('user_id', user.id).is('ended_at', null);
      console.log('✅ Step 8: Old shields cleared');

      const { error } = await supabase.from('shield_sessions').insert({
        session_id: sessionId, user_id: user.id,
        parking_lat: parkingLat, parking_lng: parkingLng,
        push_endpoint: subJson.endpoint,
        push_p256dh: subJson.keys?.p256dh,
        push_auth: subJson.keys?.auth,
      });

      if (error) console.error('❌ Step 9 failed:', error);
      else console.log('✅ Step 9: Shield registered! 🎉');
    } catch (e: any) {
      console.error('❌ Crashed:', e.message);
    }
  }, [sessionId, parkingLat, parkingLng]);

  // ─── Helper: امسح الـ state المحلي ───
  const clearLocalShield = useCallback(() => {
    try {
      localStorage.removeItem(SHIELD_STORAGE_KEY);
    } catch {}
  }, []);

  // ─── Handlers ───
  const handleYes = useCallback(async () => {
    unlockAudio();
    await requestNotificationPermission();

    try {
      await subscribeToPush(garageId);
    } catch { /* */ }

    const ok = onDeductWallet(SHIELD_COST, 'درع حماية السيارة');
    if (!ok) {
      onNavigateToWallet();
      return;
    }

    if (userPhone) {
      const code = 'SH-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      setShieldCode(code);
      setPhase('active');
      saveShieldState({
        isActive: true, shieldCode: code, phone: userPhone,
        garageId, parkingLat, parkingLng,
        sessionId,
      } as any);
      await registerOnServer();
    } else {
      setPhase('register');
    }
  }, [userPhone, garageId, sessionId, parkingLat, parkingLng, onDeductWallet, onNavigateToWallet, registerOnServer]);

  const handleRegister = useCallback(async () => {
    if (phone.length < 10) return;
    const code = 'SH-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    setShieldCode(code);
    setPhase('active');
    saveShieldState({
      isActive: true, shieldCode: code, phone,
      garageId, parkingLat, parkingLng,
      sessionId,
    } as any);
    await registerOnServer();
  }, [phone, garageId, sessionId, parkingLat, parkingLng, registerOnServer]);

  const handleIamDriving = useCallback(() => {
    stopVibration();
    destroyShield();
    clearLocalShield();
    endShieldOnServer(sessionId);
    setPhase('dismissed');
  }, [sessionId, clearLocalShield]);

  const handleTheft = useCallback(() => {
    stopVibration();
    sendLocalNotification('🚨 تم الإبلاغ عن سرقة!', 'سيتم التواصل معك فوراً');
    destroyShield();
    clearLocalShield();
    endShieldOnServer(sessionId);
    setPhase('dismissed');
  }, [sessionId, clearLocalShield]);

  // ═══════════════════════════════════════════════════════
  // 🧪 Test Mode
  // ═══════════════════════════════════════════════════════
  const runTest = useCallback(() => {
    if (isTesting) return;
    setIsTesting(true);
    testTimersRef.current.forEach(clearTimeout);
    const timers: ReturnType<typeof setTimeout>[] = [];

    const pushAlert = (alert: FakeAlert) => {
      setAlerts(prev => [alert, ...prev].slice(0, 5));
      sendLocalNotification(alert.title, alert.body);
      playNormalAlert();
    };

    timers.push(setTimeout(() => {
      pushAlert({ type: 'status', title: '🛡️ الدرع نشط', body: 'كل الحساسات شغالة', icon: '🛡️' });
    }, 3000));

    timers.push(setTimeout(() => {
      pushAlert({ type: 'warning', title: '⚠️ تنبيه أمني', body: 'شخص يقترب من باب السائق', icon: '⚠️' });
    }, 8000));

    timers.push(setTimeout(() => {
      pushAlert({ type: 'resolved', title: '✅ تم الحل', body: 'كان شخص بيمر جنب العربية', icon: '✅' });
    }, 13000));

    timers.push(setTimeout(() => {
      pushAlert({ type: 'qrScan', title: '📱 مسح QR', body: 'شخص مسح كود الاستيكر — تم تسجيله', icon: '📱' });
    }, 18000));

    timers.push(setTimeout(() => {
      setBreachDistance(312);
      setPhase('breach');
      playUrgentSound();
      vibrateUrgent();
      sendLocalNotification('🚨 إنذار سرقة!', 'السيارة خرجت 312م من نطاق الحماية!');
    }, 25000));

    testTimersRef.current = timers;
  }, [isTesting]);

  const stopTest = useCallback(() => {
    testTimersRef.current.forEach(clearTimeout);
    testTimersRef.current = [];
    setIsTesting(false);
    stopVibration();
    if (phase === 'breach') setPhase('active');
  }, [phase]);

  if (phase === 'dismissed') return null;

  return (
    <div className="w-full flex flex-col items-center gap-3 py-3">

      {/* ─── ASK ─── */}
      {phase === 'ask' && (
        <div className="w-full bg-gradient-to-br from-blue-950/60 to-slate-900/60 border border-blue-500/30 rounded-2xl p-4 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Shield className="w-7 h-7 text-blue-400" />
            </div>
            <div>
              <h3 className="text-white font-bold text-base">فعّل درع حماية السيارة</h3>
              <p className="text-blue-300/70 text-xs">مراقبة ذكية + إنذار سرقة فوري</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleYes}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl text-sm transition-all active:scale-95"
            >
              🛡️ تفعيل ({SHIELD_COST} ج)
            </button>
            <button
              onClick={() => setPhase('dismissed')}
              className="px-4 bg-slate-700/50 text-slate-400 rounded-xl text-sm hover:bg-slate-700 transition-all"
            >
              لا
            </button>
          </div>
        </div>
      )}

      {/* ─── REGISTER ─── */}
      {phase === 'register' && (
        <div className="w-full bg-gradient-to-br from-blue-950/60 to-slate-900/60 border border-blue-500/30 rounded-2xl p-4 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <Phone className="w-5 h-5 text-blue-400" />
            <h3 className="text-white font-bold text-sm">رقم الموبايل للطوارئ</h3>
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
            تفعيل الدرع الآن
          </button>
        </div>
      )}

      {/* ─── ACTIVE ─── */}
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
            <span className="text-green-400 text-xs font-bold">الدرع نشط</span>
            {shieldCode && <span className="text-green-600 text-[10px] font-mono">{shieldCode}</span>}
          </div>

          <div className="flex gap-2 mt-1">
            {!isTesting ? (
              <button
                onClick={runTest}
                className="flex items-center gap-1.5 bg-amber-950/40 border border-amber-500/30 text-amber-400 text-xs font-bold px-3 py-1.5 rounded-full hover:bg-amber-900/40 transition-all active:scale-95"
              >
                🧪 تجربة الدرع (30 ث)
              </button>
            ) : (
              <button
                onClick={stopTest}
                className="flex items-center gap-1.5 bg-red-950/40 border border-red-500/30 text-red-400 text-xs font-bold px-3 py-1.5 rounded-full hover:bg-red-900/40 transition-all active:scale-95 animate-pulse"
              >
                ⏹️ إيقاف التجربة
              </button>
            )}
          </div>

          {alerts.length > 0 && (
            <div className="w-full max-w-xs space-y-1.5 mt-1">
              {alerts.map((a, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border ${
                    a.type === 'warning'
                      ? 'bg-amber-950/40 border-amber-500/30 text-amber-300'
                      : a.type === 'resolved'
                      ? 'bg-green-950/40 border-green-500/30 text-green-300'
                      : a.type === 'qrScan'
                      ? 'bg-purple-950/40 border-purple-500/30 text-purple-300'
                      : a.type === 'report'
                      ? 'bg-blue-950/40 border-blue-500/30 text-blue-300'
                      : 'bg-slate-800/40 border-slate-600/30 text-slate-300'
                  }`}
                >
                  <span>{a.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-bold">{a.title}</span>
                    <span className="text-[10px] opacity-70 mr-1">— {a.body}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── BREACH ─── */}
      {phase === 'breach' && (
        <div className="w-full bg-red-950/80 border-2 border-red-500 rounded-2xl p-4 animate-pulse backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-red-500/30 flex items-center justify-center animate-bounce">
              <Siren className="w-7 h-7 text-red-400" />
            </div>
            <div>
              <h3 className="text-red-300 font-black text-lg">🚨 إنذار سرقة!</h3>
              <p className="text-red-400/80 text-xs">السيارة خرجت {breachDistance}م من نطاق الحماية</p>
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
              سرقة!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}