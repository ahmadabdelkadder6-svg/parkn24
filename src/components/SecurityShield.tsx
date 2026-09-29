// src/components/SecurityShield.tsx
/**
 * 🛡️ درع الأمان الشامل v6.0 - Park'n 24
 * 
 * ✅ الميزات الرئيسية:
 * - قناة استماع لحظية مستقرة (لا تنقطع)
 * - شاشة حمراء كاملة للعميل فقط
 * - بانر عائم علوي للسايس (لا يعطل عمله)
 * - كتم مزدوج بين العميل والسايس عند التأكيد
 * - سارينة متواصلة داخل التطبيق + إنذارات خارجية مزعجة
 */

import { useEffect, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { useStore, normalizePlate } from '../store';
import { supabase } from '../lib/supabase';
import { sendTheftAlertPush, stopTheftAlarmRepeat } from '../lib/pushManager';
import { VolumeX, X, Eye } from 'lucide-react';

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

// 🔊 مشغل الصوت الاحترافي
let globalAudioCtx: AudioContext | null = null;
let activeOscillators: OscillatorNode[] = [];

const stopAllSirenSounds = () => {
  try {
    activeOscillators.forEach((osc) => {
      try { osc.stop(); osc.disconnect(); } catch {}
    });
    activeOscillators = [];
    if (globalAudioCtx && globalAudioCtx.state !== 'closed') {
      globalAudioCtx.close().catch(() => {});
      globalAudioCtx = null;
    }
  } catch {}
};

const playTheftSirenSound = () => {
  try {
    stopAllSirenSounds();
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    globalAudioCtx = new AudioCtx();
    const now = globalAudioCtx.currentTime;
    const masterGain = globalAudioCtx.createGain();
    masterGain.gain.setValueAtTime(1.0, now);
    masterGain.connect(globalAudioCtx.destination);

    for (let i = 0; i < 10; i++) {
      const start = now + (i * 0.3);
      const duration = 0.28;

      const osc1 = globalAudioCtx.createOscillator();
      const osc2 = globalAudioCtx.createOscillator();
      const gain = globalAudioCtx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'square';

      const freq = i % 2 === 0 ? 1000 : 2200;
      osc1.frequency.setValueAtTime(freq, start);
      osc2.frequency.setValueAtTime(freq * 1.2, start);

      gain.gain.setValueAtTime(1.0, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + duration);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(masterGain);

      osc1.start(start);
      osc2.start(start);
      osc1.stop(start + duration);
      osc2.stop(start + duration);
      activeOscillators.push(osc1, osc2);
    }
  } catch {}
};

const triggerExternalSystemNotification = async (title: string, body: string, tag: string, carPlate: string) => {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const options: NotificationOptions = {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      tag,
      requireInteraction: true,
      renotify: true,
      vibrate: [1000, 200, 1000, 200, 1500, 200, 2000],
      data: { url: '/', type: 'theft_breach', carPlate },
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

// 🛑 إيقاف كل تنبيهات الـ Service Worker
const killAllServiceWorkerTheftAlarms = (carPlate?: string) => {
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'STOP_THEFT_ALARM',
        carPlate: carPlate || '',
      });
    }
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

  const [isBreached, setIsBreached] = useState(false);
  const [breachAlert, setBreachAlert] = useState<{ carPlate: string; reason: string; sessionId?: string } | null>(null);

  const [isMutedLocally, setIsMutedLocally] = useState(false);
  const isMutedLocallyRef = useRef(isMutedLocally);

  const carAnchorRef = useRef<{ lat: number; lng: number; accuracy: number } | null>(null);
  const garageOriginRef = useRef<{ lat: number; lng: number } | null>(null);
  const dismissCooldownUntilRef = useRef<number>(0);
  const repeatAlarmTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isCarOwner = view === 'user' || view === 'admin';
  const isValet = view === 'garage';

  const stateRef = useRef({
    currentUser, currentGarageId, sessionId, view, carPlate, isShieldEnabled, isSessionActive
  });

  useEffect(() => {
    stateRef.current = {
      currentUser, currentGarageId, sessionId, view, carPlate, isShieldEnabled, isSessionActive
    };
  }, [currentUser, currentGarageId, sessionId, view, carPlate, isShieldEnabled, isSessionActive]);

  useEffect(() => {
    isMutedLocallyRef.current = isMutedLocally;
  }, [isMutedLocally]);

  // 🚨 دالة إطلاق الإنذار الرئيسية
  const triggerAlarm = (
    plate: string,
    reason: string,
    targetSessionId?: string,
    isLocalDetection = false
  ) => {
    if (Date.now() < dismissCooldownUntilRef.current) return;

    setIsBreached(true);
    setIsMutedLocally(false);
    const cleanReason = reason || '🚨 رصد محاولة تحريك وسرقة للسيارة!';

    setBreachAlert({
      carPlate: plate || 'المركبة',
      reason: cleanReason,
      sessionId: targetSessionId,
    });

    playTheftSirenSound();

    if (navigator.vibrate) {
      navigator.vibrate([1500, 150, 1500, 150, 2000]);
    }

    triggerExternalSystemNotification(
      '🚨 إنذار سرقة عاجل لمركبتك!',
      `🚗 السيارة ${plate || ''} • ${cleanReason}`,
      `theft-alarm-${plate || 'car'}-${Date.now()}`,
      plate
    );

    if (isLocalDetection && targetSessionId) {
      supabase
        .from('sessions')
        .update({
          is_breached: true,
          breach_reason: cleanReason,
        })
        .eq('id', targetSessionId)
        .then(() => {
          const targetSession = sessions.find((s) => s.id === targetSessionId);
          sendTheftAlertPush({
            garageId: targetSession?.garageId,
            customerPhone: (targetSession as any)?.customerPhone || currentUser?.phone,
            carPlate: plate,
            reason: cleanReason,
          }).catch(() => {});
        });
    }

    // 🔁 مؤقت التكرار الداخلي (بينما التطبيق مفتوح)
    if (repeatAlarmTimerRef.current) {
      clearInterval(repeatAlarmTimerRef.current);
    }

    let repeatCount = 0;
    repeatAlarmTimerRef.current = setInterval(() => {
      repeatCount += 1;
      if (repeatCount >= 30) {
        if (repeatAlarmTimerRef.current) {
          clearInterval(repeatAlarmTimerRef.current);
          repeatAlarmTimerRef.current = null;
        }
        return;
      }

      if (!isMutedLocallyRef.current) {
        playTheftSirenSound();
        if (navigator.vibrate) {
          navigator.vibrate([1500, 150, 1500, 150, 2000]);
        }
      }
    }, 8000); // كل 8 ثواني
  };

  /* ═══════════════════════════════════════════
     📡 قناة الاستماع اللحظي المستقرة (لا تنقطع)
     ═══════════════════════════════════════════ */
  useEffect(() => {
    const channel = supabase
      .channel(`security-shield-persistent-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions' },
        (payload) => {
          const newRow = payload.new as any;
          if (!newRow) return;

          const snap = stateRef.current;
          const userPlateClean = normalizePlate(snap.currentUser?.carPlate);
          const userPhoneClean = snap.currentUser?.phone ? snap.currentUser.phone.replace(/[^\d]/g, '') : '';

          const rowPlate = normalizePlate(newRow.car_plate || newRow.carPlate);
          const rowPhone = newRow.customer_phone ? String(newRow.customer_phone).replace(/[^\d]/g, '') : '';

          const isMyCarByPlate = !!userPlateClean && rowPlate === userPlateClean;
          const isMyCarByPhone = !!userPhoneClean && rowPhone === userPhoneClean;
          const isMySessionId  = snap.sessionId && newRow.id === snap.sessionId;
          const isMyGarage     = snap.currentGarageId && newRow.garage_id === snap.currentGarageId;

          if (newRow.is_breached === true && newRow.status === 'active') {
            if (isMyCarByPlate || isMyCarByPhone || isMySessionId || isMyGarage || snap.view === 'admin') {
              triggerAlarm(
                newRow.car_plate,
                newRow.breach_reason || '🚨 تم رصد حركة وتحريك غير مصرح به للسيارة!',
                newRow.id,
                false
              );
            }
          } else if (newRow.is_breached === false) {
            // 🔄 إخماد فوري متزامن للطرفين عند تأكيد العميل للأمان
            if (isMyCarByPlate || isMyCarByPhone || isMySessionId || isMyGarage) {
              console.log('✅ تم استقبال أمر إيقاف الإنذار من السيرفر');
              setIsBreached(false);
              setBreachAlert(null);
              setIsMutedLocally(false);
              stopAllSirenSounds();
              if (repeatAlarmTimerRef.current) {
                clearInterval(repeatAlarmTimerRef.current);
                repeatAlarmTimerRef.current = null;
              }
              killAllServiceWorkerTheftAlarms(newRow.car_plate);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  /* ═══════════════════════════════════════════
     🛰️ رادار الـ GPS للسيارة (مع منع الإنذارات الكاذبة)
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
        { enableHighAccuracy: true, timeout: 6000 }
      );
    }

    const timer = setInterval(() => {
      if (!isRunning || !navigator.geolocation) return;
      if (Date.now() < dismissCooldownUntilRef.current) return;

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords;
          if (accuracy > 35) return;

          const snap = stateRef.current;

          // 💡 حماية العميل من الإنذارات الكاذبة عند الابتعاد بهاتفه
          if (snap.view === 'user' && garageOriginRef.current) {
            const userDistFromGarage = calculateDistanceMeters(
              garageOriginRef.current.lat,
              garageOriginRef.current.lng,
              lat, lng
            );
            if (userDistFromGarage > 60) return;
          }

          if (!carAnchorRef.current) {
            carAnchorRef.current = { lat, lng, accuracy: Math.round(accuracy) };
            return;
          }

          const drift = calculateDistanceMeters(carAnchorRef.current.lat, carAnchorRef.current.lng, lat, lng);
          const safeThreshold = Math.max(45, (carAnchorRef.current.accuracy || 15) + accuracy);
          const currentSpeedKmh = speed !== null && speed >= 0 ? speed * 3.6 : -1;

          if (drift > safeThreshold) {
            if (currentSpeedKmh > 5 || drift > 65) {
              triggerAlarm(
                carPlate,
                `🚨 رصد سحب أو حركة غير مصرح بها للسيارة لمسافة ${drift} متراً!`,
                sessionId,
                true
              );
            }
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 4000, maximumAge: 1000 }
      );
    }, 3000);

    return () => {
      isRunning = false;
      clearInterval(timer);
    };
  }, [isSessionActive, isShieldEnabled, sessionId, carPlate, view]);

  useEffect(() => {
    return () => {
      stopAllSirenSounds();
      if (repeatAlarmTimerRef.current) {
        clearInterval(repeatAlarmTimerRef.current);
        repeatAlarmTimerRef.current = null;
      }
    };
  }, []);

  // 👑 [العميل فقط] تأكيد الأمان النهائي وإيقاف الإنذار عند الطرفين
  const handleOwnerDismiss = async () => {
    stopAllSirenSounds();
    setIsBreached(false);
    dismissCooldownUntilRef.current = Date.now() + 60000;

    if (repeatAlarmTimerRef.current) {
      clearInterval(repeatAlarmTimerRef.current);
      repeatAlarmTimerRef.current = null;
    }

    const currentPlate = breachAlert?.carPlate || carPlate;
    
    // 1. إيقاف تنبيهات الـ Service Worker على هاتف العميل نفسه
    killAllServiceWorkerTheftAlarms(currentPlate);

    // 2. طلب إيقاف من السيرفر (للـ Push المتكررة)
    if (currentPlate) {
      stopTheftAlarmRepeat({ carPlate: currentPlate }).catch(() => {});
    }

    // 3. تحديث قاعدة البيانات (سيصل للسايس عبر Realtime ويوقف الإنذار عنده)
    if (breachAlert?.sessionId) {
      await supabase
        .from('sessions')
        .update({ is_breached: false, breach_reason: '' })
        .eq('id', breachAlert.sessionId);

      useStore.setState((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === breachAlert?.sessionId ? { ...s, is_breached: false, breach_reason: '' } : s
        ),
      }));
    }

    setBreachAlert(null);
    toast.success('تم إيقاف الإنذار وتأكيد أمان المركبة عند السايس أيضاً 🛡️', { duration: 4000 });
  };

  // 🔇 [العميل] كتم صوت مؤقت (للتحدث)
  const handleCustomerLocalMute = () => {
    stopAllSirenSounds();
    setIsMutedLocally(true);
    if (navigator.vibrate) navigator.vibrate(0);
    const currentPlate = breachAlert?.carPlate || carPlate;
    killAllServiceWorkerTheftAlarms(currentPlate);
    toast.success('🔇 تم كتم الصوت بجهازك • الإنذار مستمر عند السايس', { duration: 3500 });
  };

  // 🅿️ [السايس] كتم الإنذار والاستمرار في العمل
  const handleValetMute = () => {
    stopAllSirenSounds();
    setIsMutedLocally(true);
    if (navigator.vibrate) navigator.vibrate(0);
    const currentPlate = breachAlert?.carPlate || carPlate;
    killAllServiceWorkerTheftAlarms(currentPlate);
    toast('🔇 تم كتم الصوت • تابع فحص السيارة والإنذار قائم حتى يؤكد العميل', {
      icon: '🅿️',
      duration: 4000,
    });
  };

  // ═══════════════════════════════════════════
  // 🎨 الواجهات المرئية
  // ═══════════════════════════════════════════

  if (!isBreached || !breachAlert) return null;

  // 🅿️ ═══════ واجهة السايس: بانر عائم دائم فقط (لا شاشة حمراء إطلاقاً) ═══════
  if (isValet) {
    return (
      <div 
        className="fixed top-0 left-0 right-0 z-[9999999] p-2 pointer-events-none"
        dir="rtl"
      >
        <div 
          className={`max-w-md mx-auto rounded-2xl shadow-2xl p-3 pointer-events-auto border-2 ${!isMutedLocally ? 'animate-pulse' : ''}`}
          style={{
            background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
            borderColor: 'rgba(255, 255, 255, 0.4)',
            boxShadow: '0 10px 40px rgba(220, 38, 38, 0.6)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0 text-xl">
                🚨
              </div>
              <div className="text-right text-white min-w-0 flex-1">
                <div className="text-[11px] font-black leading-tight">
                  ⚠️ إنذار سرقة نشط!
                </div>
                <div className="text-[10px] font-bold text-red-100 truncate">
                  🚗 {breachAlert.carPlate} • {isMutedLocally ? 'صوت مكتوم' : 'جاري التنبيه...'}
                </div>
                <div className="text-[9px] text-amber-200 font-bold mt-0.5 truncate">
                  {breachAlert.reason.substring(0, 60)}
                </div>
              </div>
            </div>
            
            {!isMutedLocally ? (
              <button
                onClick={handleValetMute}
                className="bg-white text-red-600 text-[10px] font-black px-3 py-2 rounded-xl border-0 cursor-pointer active:scale-95 shrink-0 flex items-center gap-1"
              >
                <VolumeX size={12} /> كتم
              </button>
            ) : (
              <div className="bg-white/20 text-white text-[9px] font-black px-3 py-2 rounded-xl border border-white/40 shrink-0">
                🔇 مكتوم
              </div>
            )}
          </div>
          
          <div className="mt-2 pt-2 border-t border-white/20 text-center">
            <div className="text-[9px] text-white font-bold flex items-center justify-center gap-1">
              <Eye size={10} />
              <span>افحص السيارة الآن • في انتظار تأكيد الأمان من العميل</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 👑 ═══════ واجهة العميل: شاشة حمراء كاملة ═══════
  return (
    <div className="fixed inset-0 z-[9999999] bg-red-950/95 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 text-white animate-pulse" dir="rtl">
      <div className="w-24 h-24 bg-red-600 rounded-full flex items-center justify-center text-5xl mb-6 shadow-2xl animate-bounce">
        🚨
      </div>
      <h2 className="text-2xl font-black mb-1">تحذير سرقة نشط!</h2>
      <span className="bg-red-900 text-red-100 text-xs font-black px-4 py-1.5 rounded-full mb-4 border border-red-700 shadow-md">
        🚗 لوحة السيارة: {breachAlert.carPlate}
      </span>
      <p className="text-slate-100 text-xs font-bold max-w-xs mb-6 leading-relaxed">
        {breachAlert.reason}
      </p>

      <div className="w-full max-w-xs space-y-2.5">
        <button
          onClick={handleOwnerDismiss}
          className="w-full bg-white text-red-600 font-black py-4 rounded-2xl text-xs active:scale-95 transition-all shadow-2xl cursor-pointer border-0"
        >
          🔕 تأكيد أمان سيارتي وإيقاف الإنذار نهائياً
        </button>

        {!isMutedLocally ? (
          <button
            onClick={handleCustomerLocalMute}
            className="w-full bg-white/10 text-white font-black py-3 rounded-xl text-[11px] border border-white/20 backdrop-blur-sm active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <VolumeX size={14} /> كتم صوت هاتفي مؤقتاً للتحدث
          </button>
        ) : (
          <div className="text-[10px] text-amber-300 font-bold py-1">
            🔇 تم كتم الصوت بجهازك • الإنذار مستمر عند السايس
          </div>
        )}
      </div>
    </div>
  );
}