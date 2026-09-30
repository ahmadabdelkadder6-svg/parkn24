// src/components/SecurityShield.tsx

import { useEffect, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { useStore, normalizePlate } from '../store';
import { supabase } from '../lib/supabase';
import { sendTheftAlertPush } from '../lib/pushManager';

const calculateDistanceMeters = (
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number => {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
};

const playTheftSirenSound = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(1.0, now);
    masterGain.connect(ctx.destination);

    for (let i = 0; i < 8; i++) {
      const start = now + (i * 0.35);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(900, start);
      osc.frequency.linearRampToValueAtTime(2600, start + 0.3);

      gain.gain.setValueAtTime(1.0, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.33);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(start);
      osc.stop(start + 0.34);
    }
  } catch {}
};

// 🚨 إطلاق الإشعار الخارجي على شاشة القفل
const triggerExternalSystemNotification = async (title: string, body: string, tag: string) => {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const options: NotificationOptions = {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      tag,
      requireInteraction: true,
      renotify: true,
      vibrate: [2000, 200, 2000, 200, 2000, 200, 3000],
      data: { url: '/', type: 'theft_breach' },
    };

    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, options);
        return;
      }
    }

    new Notification(title, options);
  } catch {}
};

interface SecurityShieldProps {
  view?: 'user' | 'garage' | 'admin';
  isSessionActive?: boolean;
  isShieldEnabled?: boolean;
  sessionId?: string | null;
  carPlate?: string;
}

export default function SecurityShield({
  view = 'user',
  isSessionActive = false,
  isShieldEnabled = false,
  sessionId = null,
  carPlate = '',
}: SecurityShieldProps) {
  const { currentUser, currentGarageId, sessions } = useStore();

  const [isTampered, setIsTampered] = useState(false);
  const [isAppBlurred, setIsAppBlurred] = useState(false);
  const [isValetOutOfFence, setIsValetOutOfFence] = useState(false);
  const [valetDistance, setValetDistance] = useState(0);

  const [isBreached, setIsBreached] = useState(false);
  const [breachAlert, setBreachAlert] = useState<{ carPlate: string; reason: string; sessionId?: string } | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const isMutedRef = useRef(isMuted);
  const carAnchorRef = useRef<{ lat: number; lng: number; accuracy: number } | null>(null);
  const garageOriginRef = useRef<{ lat: number; lng: number } | null>(null);
  const consecutiveBreachCountRef = useRef<number>(0);

  // 🔁 مرجع مؤقت تكرار الإشعار
  const repeatAlarmTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stateRef = useRef({ currentUser, currentGarageId, sessionId, view, carPlate });
  useEffect(() => {
    stateRef.current = { currentUser, currentGarageId, sessionId, view, carPlate };
  }, [currentUser, currentGarageId, sessionId, view, carPlate]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const triggerAlarm = async (
    plate: string,
    reason: string,
    targetSessionId?: string,
    isLocalDetection = false
  ) => {
    setIsBreached(true);
    setIsMuted(false);
    isMutedRef.current = false;
    const cleanReason = reason || '🚨 رصد محاولة تحريك وسرقة للسيارة!';

    setBreachAlert({
      carPlate: plate || 'المركبة',
      reason: cleanReason,
      sessionId: targetSessionId,
    });

    playTheftSirenSound();

    if (navigator.vibrate) {
      navigator.vibrate([2000, 200, 2000, 200, 2000, 200, 3000]);
    }

    // 🔔 إطلاق الإشعار الخارجي الأول فوراً
    triggerExternalSystemNotification(
      '🚨 إنذار سرقة عاجل لمركبتك!',
      `🚗 السيارة ${plate || ''} • ${cleanReason}`,
      `theft-alarm-${plate || 'car'}-${Date.now()}`
    );

    // 🔁 بدء تكرار الإشعار كل 15 ثانية لحد ما العميل يفتح أو يوقف
    if (repeatAlarmTimerRef.current) {
      clearInterval(repeatAlarmTimerRef.current);
    }

    let repeatCount = 0;
    repeatAlarmTimerRef.current = setInterval(() => {
      repeatCount += 1;

      // إيقاف التكرار بعد 20 مرة (5 دقائق) أو لو تم إيقاف الإنذار
      if (repeatCount >= 20) {
        if (repeatAlarmTimerRef.current) {
          clearInterval(repeatAlarmTimerRef.current);
          repeatAlarmTimerRef.current = null;
        }
        return;
      }

      // 🔇 إعادة تشغيل الصوت فقط إذا لم يتم الضغط على كتم الصوت
      if (!isMutedRef.current) {
        playTheftSirenSound();
        if (navigator.vibrate) {
          navigator.vibrate([2000, 200, 2000, 200, 2000, 200, 3000]);
        }

        // إعادة إطلاق الإشعار الخارجي
        triggerExternalSystemNotification(
          `🚨 إنذار سرقة متكرر (${repeatCount})!`,
          `🚗 السيارة ${plate || ''} • ${cleanReason} • افتح التطبيق فوراً!`,
          `theft-alarm-repeat-${plate || 'car'}-${Date.now()}`
        );
      }

      // إعادة إرسال Web Push للطرف الآخر كل 30 ثانية
      if (repeatCount % 2 === 0 && targetSessionId && !isMutedRef.current) {
        const targetSession = sessions.find((s) => s.id === targetSessionId);
        if (targetSession?.garageId) {
          sendTheftAlertPush({
            garageId: targetSession.garageId,
            customerPhone: (targetSession as any)?.customerPhone || currentUser?.phone,
            carPlate: plate,
            reason: cleanReason,
          }).catch(() => {});
        }
      }
    }, 15000); // كل 15 ثانية

    // 🛰️ مزامنة فورية مع السيرفر
    if (isLocalDetection && targetSessionId) {
      try {
        await supabase
          .from('sessions')
          .update({
            is_breached: true,
            breach_reason: cleanReason,
          })
          .eq('id', targetSessionId);

        const targetSession = sessions.find((s) => s.id === targetSessionId);
        sendTheftAlertPush({
          garageId: targetSession?.garageId,
          customerPhone: (targetSession as any)?.customerPhone || currentUser?.phone,
          carPlate: plate,
          reason: cleanReason,
        }).catch(() => {});
      } catch (e) {
        console.error('Failed to sync breach:', e);
      }
    }
  };

  /* ═══════════════════════════════════════════
     📡 1. الاستماع الصاعق عبر Supabase Realtime
     ═══════════════════════════════════════════ */
  useEffect(() => {
    const userPlateClean = normalizePlate(currentUser?.carPlate);
    const userPhoneClean = currentUser?.phone ? currentUser.phone.replace(/[^\d]/g, '') : '';

    const channel = supabase
      .channel(`security-shield-global-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions' },
        (payload) => {
          const newRow = payload.new as any;
          if (!newRow) return;

          const snap = stateRef.current;
          const myPlate = snap.currentUser?.carPlate?.replace(/\s/g, '');
          const rowPlate = newRow.car_plate?.replace(/\s/g, '');

          const isMatch =
            (myPlate && rowPlate && myPlate === rowPlate) ||
            (snap.currentUser?.phone && newRow.customer_phone && snap.currentUser.phone.slice(-8) === String(newRow.customer_phone).slice(-8)) ||
            (snap.sessionId && newRow.id === snap.sessionId) ||
            (snap.currentGarageId && newRow.garage_id === snap.currentGarageId) ||
            snap.view === 'admin';

          if (newRow.is_breached === true && newRow.status === 'active' && isMatch) {
            triggerAlarm(
              newRow.car_plate,
              newRow.breach_reason || '🚨 تم رصد حركة وتحريك غير مصرح به للسيارة!',
              newRow.id,
              false
            );
          } else if (newRow.is_breached === false && isMatch) {
            setIsBreached(false);
            setBreachAlert(null);
            setIsMuted(false);
            isMutedRef.current = false;
            consecutiveBreachCountRef.current = 0;

            // 🛑 إيقاف تكرار الإشعار
            if (repeatAlarmTimerRef.current) {
              clearInterval(repeatAlarmTimerRef.current);
              repeatAlarmTimerRef.current = null;
            }

            // إرسال رسالة توجيهية لإيقاف السيرفس وركر
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
              navigator.serviceWorker.controller.postMessage({ type: 'STOP_THEFT_ALARM' });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.carPlate, currentUser?.phone, sessionId, currentGarageId, view]);

  /* ═══════════════════════════════════════════
     🛡️ 2. حماية المنصة
     ═══════════════════════════════════════════ */
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'F12' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase()))
      ) {
        e.preventDefault();
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('visibilitychange', () => setIsAppBlurred(document.hidden));

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  /* ═══════════════════════════════════════════
     🛰️ 3. رادار الـ GPS الذكي
     ═══════════════════════════════════════════ */
  useEffect(() => {
    if (!isSessionActive || !isShieldEnabled || !sessionId) return;

    let isRunning = true;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (pos.coords.accuracy <= 30) {
            carAnchorRef.current = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: Math.round(pos.coords.accuracy),
            };
            garageOriginRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }

    const timer = setInterval(() => {
      if (!isRunning || !navigator.geolocation) return;

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lng, accuracy } = pos.coords;

          if (accuracy > 35) return;

          const snap = stateRef.current;

          // حماية العميل من التنبيهات الكاذبة عند الابتعاد بهاتفه عن الجراج
          if (snap.view === 'user' && garageOriginRef.current) {
            const userDist = calculateDistanceMeters(garageOriginRef.current.lat, garageOriginRef.current.lng, lat, lng);
            if (userDist > 60) return;
          }

          if (!carAnchorRef.current) {
            carAnchorRef.current = { lat, lng, accuracy: Math.round(accuracy) };
            return;
          }

          if (view === 'garage' && garageOriginRef.current) {
            const dist = calculateDistanceMeters(garageOriginRef.current.lat, garageOriginRef.current.lng, lat, lng);
            setValetDistance(dist);
            setIsValetOutOfFence(dist > 250);
          }

          const drift = calculateDistanceMeters(carAnchorRef.current.lat, carAnchorRef.current.lng, lat, lng);
          const safeThreshold = Math.max(45, (carAnchorRef.current.accuracy || 15) + accuracy);

          if (drift > safeThreshold) {
            consecutiveBreachCountRef.current += 1;
            if (consecutiveBreachCountRef.current >= 2) {
              triggerAlarm(
                carPlate,
                `🚨 رصد تحرك وسحب للسيارة مسافة ${drift} متراً عن موقع الركن!`,
                sessionId,
                true
              );
            }
          } else {
            consecutiveBreachCountRef.current = 0;
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 2000 }
      );
    }, 4000);

    return () => {
      isRunning = false;
      clearInterval(timer);
    };
  }, [isSessionActive, isShieldEnabled, sessionId, carPlate, view]);

  // فحص الرابط المباشر عند فتح الإشعار الخارجي على شاشة القفل
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('breach') === 'true') {
      const urlPlate = params.get('carPlate') || carPlate || 'المركبة';
      triggerAlarm(
        urlPlate,
        '🚨 تم رصد حركة غير مصرح بها لسيارتك!',
        sessionId || undefined,
        false
      );
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch {}
    }
  }, [carPlate, sessionId]);

  // 🧹 تنظيف مؤقت التكرار عند إلغاء المكون
  useEffect(() => {
    return () => {
      if (repeatAlarmTimerRef.current) {
        clearInterval(repeatAlarmTimerRef.current);
        repeatAlarmTimerRef.current = null;
      }
    };
  }, []);

  // إيقاف وتأكيد الأمان (العميل)
  const handleDismiss = async () => {
    setIsBreached(false);
    consecutiveBreachCountRef.current = 0;
    setIsMuted(false);
    isMutedRef.current = false;

    // 🛑 إيقاف تكرار الإشعار فوراً للـ Service Worker في شاشة القفل
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'STOP_THEFT_ALARM' });
    }

    if (repeatAlarmTimerRef.current) {
      clearInterval(repeatAlarmTimerRef.current);
      repeatAlarmTimerRef.current = null;
    }

    if (breachAlert?.sessionId) {
      await supabase
        .from('sessions')
        .update({ is_breached: false })
        .eq('id', breachAlert.sessionId);
    }
    setBreachAlert(null);
    toast.success('تم تأكيد الأمان وإيقاف الإنذار 🛡️');
  };

  // 🔇 كتم الصوت الفوري الصامت (للسايس والعميل)
  const handleMute = () => {
    setIsMuted(true);
    isMutedRef.current = true;
    stopAllSirenSounds();
    if (navigator.vibrate) navigator.vibrate(0);

    // كتم وإيقاف إشعارات شاشة القفل أيضاً
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'STOP_THEFT_ALARM' });
    }

    toast.success('🔇 تم كتم الصوت');
  };

  if (!isBreached || !breachAlert) return null;

  // 🅿️ واجهة السايس: بانر عائم علوي دائم فقط (لا يعطل الشاشة إطلاقاً ولا يمنع استكمال العمل)
  if (view === 'garage') {
    return (
      <div className="fixed top-3 left-3 right-3 z-[9999999] pointer-events-none" dir="rtl">
        <div 
          className="max-w-md mx-auto rounded-2xl shadow-2xl p-3.5 pointer-events-auto border-2 text-white flex items-center justify-between"
          style={{
            background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
            borderColor: 'rgba(255, 255, 255, 0.4)',
            boxShadow: '0 8px 30px rgba(220, 38, 38, 0.6)'
          }}
        >
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl shrink-0">
              🚨
            </div>
            <div className="text-right min-w-0 flex-1">
              <div className="text-xs font-black flex items-center gap-1 text-white">
                <ShieldAlert size={14} className="text-amber-300" />
                <span>إنذار سرقة نشط!</span>
              </div>
              <div className="text-[11px] font-bold text-red-100 truncate mt-0.5">
                🚗 لوحة: <b className="text-white text-xs">{breachAlert.carPlate}</b>
              </div>
              <div className="text-[9px] text-amber-200 font-bold mt-0.5 truncate">
                افحص السيارة فوراً • في انتظار تأكيد العميل
              </div>
            </div>
          </div>
          
          <div className="mr-2 shrink-0">
            {!isMuted ? (
              <button 
                type="button"
                onClick={handleMute} 
                className="bg-white text-red-600 text-xs font-black px-4 py-2 rounded-xl border-0 cursor-pointer active:scale-90 shadow-xl flex items-center gap-1"
              >
                <VolumeX size={13} /> كتم
              </button>
            ) : (
              <span className="text-[10px] font-black bg-white/20 px-3 py-2 rounded-lg border border-white/20 text-white block">
                🔇 مكتوم
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 👑 واجهة العميل: شاشة حمراء كاملة للتحذير والسيطرة
  return (
    <div className="fixed inset-0 z-[9999999] bg-red-950/95 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 text-white animate-pulse" dir="rtl">
      <div className="w-24 h-24 bg-red-600 rounded-full flex items-center justify-center text-5xl mb-6 shadow-2xl animate-bounce">🚨</div>
      <h2 className="text-2xl font-black mb-1">تحذير سرقة نشط!</h2>
      <span className="bg-red-900 text-red-100 text-xs font-black px-4 py-1.5 rounded-full mb-4 border border-red-700 shadow-md">
        🚗 لوحة السيارة: {breachAlert.carPlate}
      </span>
      <p className="text-slate-100 text-xs font-bold max-w-xs mb-6 leading-relaxed">{breachAlert.reason}</p>

      <div className="w-full max-w-xs space-y-2.5">
        <button onClick={handleDismiss} className="w-full bg-white text-red-600 font-black py-4 rounded-2xl text-xs cursor-pointer border-0 shadow-2xl active:scale-95 transition-all">
          🔕 تأكيد أمان سيارتي وإيقاف الإنذار نهائياً
        </button>
        {!isMuted ? (
          <button onClick={handleMute} className="w-full bg-white/10 text-white font-black py-3 rounded-xl text-[11px] border border-white/20 cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-1.5">
            <VolumeX size={14} className="inline mr-1" /> كتم صوت هاتفي مؤقتاً
          </button>
        ) : (
          <div className="text-[10px] text-amber-300 font-bold py-1">🔇 تم كتم الصوت بجهازك</div>
        )}
      </div>
    </div>
  );
}