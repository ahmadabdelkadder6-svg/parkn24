// src/components/SecurityShield.tsx

/**
 * 🛡️ درع الأمان الشامل المزدوج المحدث (حماية التطبيق + حماية السيارة)
 * 🔒 [إيقاف فوري ونهائي]: إرسال أمر إلغاء صريح للـ Service Worker وإعادة ضبط الرادار فور تأكيد الأمان ✅
 */

import { useEffect, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { useStore, normalizePlate } from '../store';
import { supabase } from '../lib/supabase';
import { sendTheftAlertPush, stopTheftAlarmRepeat } from '../lib/pushManager';

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
      vibrate: [2000, 200, 2000, 200, 2000, 200, 3000],
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

// 🛑 دالة إلغاء ومسح كل إشعارات ومؤقتات السرقة من الـ Service Worker فوراً
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

  const [isTampered, setIsTampered] = useState(false);
  const [isAppBlurred, setIsAppBlurred] = useState(false);
  const [isValetOutOfFence, setIsValetOutOfFence] = useState(false);
  const [valetDistance, setValetDistance] = useState(0);

  const [isBreached, setIsBreached] = useState(false);
  const [breachAlert, setBreachAlert] = useState<{ carPlate: string; reason: string; sessionId?: string } | null>(null);
  const [isValetMutedLocally, setIsValetMutedLocally] = useState(false);

  const carAnchorRef = useRef<{ lat: number; lng: number; accuracy: number } | null>(null);
  const garageOriginRef = useRef<{ lat: number; lng: number } | null>(null);
  const consecutiveBreachCountRef = useRef<number>(0);
  const gpsHistoryRef = useRef<Array<{ lat: number; lng: number; time: number; accuracy: number }>>([]);
  const dismissCooldownUntilRef = useRef<number>(0);

  const repeatAlarmTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isCarOwner = view === 'user' || view === 'admin';

  const triggerAlarm = async (
    plate: string,
    reason: string,
    targetSessionId?: string,
    isLocalDetection = false
  ) => {
    // لو تم تأكيد الأمان مؤخراً (خلال دقيقة)، لا تقبل أي إنذار محلي عابر
    if (Date.now() < dismissCooldownUntilRef.current) return;

    setIsBreached(true);
    setIsValetMutedLocally(false);
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

    triggerExternalSystemNotification(
      '🚨 إنذار سرقة عاجل لمركبتك!',
      `🚗 السيارة ${plate || ''} • ${cleanReason}`,
      `theft-alarm-${plate || 'car'}-${Date.now()}`,
      plate
    );

    if (repeatAlarmTimerRef.current) {
      clearInterval(repeatAlarmTimerRef.current);
    }

    let repeatCount = 0;
    repeatAlarmTimerRef.current = setInterval(() => {
      repeatCount += 1;

      if (repeatCount >= 20) {
        if (repeatAlarmTimerRef.current) {
          clearInterval(repeatAlarmTimerRef.current);
          repeatAlarmTimerRef.current = null;
        }
        return;
      }

      playTheftSirenSound();
      if (navigator.vibrate) {
        navigator.vibrate([2000, 200, 2000, 200, 2000, 200, 3000]);
      }

      triggerExternalSystemNotification(
        `🚨 إنذار سرقة متكرر (${repeatCount})!`,
        `🚗 السيارة ${plate || ''} • ${cleanReason} • افتح التطبيق فوراً!`,
        `theft-alarm-repeat-${plate || 'car'}-${Date.now()}`,
        plate
      );

      if (repeatCount % 2 === 0 && targetSessionId) {
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
    }, 15000);

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

          if (newRow.is_breached === true && newRow.status === 'active') {
            const rowPlate = normalizePlate(newRow.car_plate || newRow.carPlate);
            const rowPhone = newRow.customer_phone ? String(newRow.customer_phone).replace(/[^\d]/g, '') : '';

            const isMyCarByPlate = !!userPlateClean && rowPlate === userPlateClean;
            const isMyCarByPhone = !!userPhoneClean && rowPhone === userPhoneClean;
            const isMySessionId  = sessionId && newRow.id === sessionId;
            const isMyGarage     = currentGarageId && newRow.garage_id === currentGarageId;

            if (isMyCarByPlate || isMyCarByPhone || isMySessionId || isMyGarage || view === 'admin') {
              triggerAlarm(
                newRow.car_plate,
                newRow.breach_reason || '🚨 تم رصد حركة وتحريك غير مصرح به للسيارة!',
                newRow.id,
                false
              );
            }
          } else if (newRow.is_breached === false) {
            // ✅ عندما يتم إيقاف الإنذار من السيرفر، يتم إيقاف كل شيء فوراً في كل الأجهزة
            setIsBreached(false);
            setBreachAlert(null);
            setIsValetMutedLocally(false);
            consecutiveBreachCountRef.current = 0;

            if (repeatAlarmTimerRef.current) {
              clearInterval(repeatAlarmTimerRef.current);
              repeatAlarmTimerRef.current = null;
            }

            killAllServiceWorkerTheftAlarms(newRow.car_plate);
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
            gpsHistoryRef.current = [{
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              time: Date.now(),
              accuracy: Math.round(pos.coords.accuracy),
            }];
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }

    const timer = setInterval(() => {
      if (!isRunning || !navigator.geolocation) return;
      if (Date.now() < dismissCooldownUntilRef.current) return;

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords;
          const now = Date.now();

          if (accuracy > 35) return;

          if (!carAnchorRef.current) {
            carAnchorRef.current = { lat, lng, accuracy: Math.round(accuracy) };
            return;
          }

          if (view === 'garage' && garageOriginRef.current) {
            const dist = calculateDistanceMeters(garageOriginRef.current.lat, garageOriginRef.current.lng, lat, lng);
            setValetDistance(dist);
            setIsValetOutOfFence(dist > 250);
          }

          gpsHistoryRef.current.push({ lat, lng, time: now, accuracy: Math.round(accuracy) });
          if (gpsHistoryRef.current.length > 5) gpsHistoryRef.current.shift();

          const drift = calculateDistanceMeters(carAnchorRef.current.lat, carAnchorRef.current.lng, lat, lng);
          const safeThreshold = Math.max(45, (carAnchorRef.current.accuracy || 15) + accuracy);

          const currentSpeedKmh = speed !== null && speed >= 0 ? speed * 3.6 : -1;
          const isMovingFast = currentSpeedKmh > 5;

          let isConsistentDirection = false;
          if (gpsHistoryRef.current.length >= 3) {
            const recent = gpsHistoryRef.current.slice(-3);
            const distances = [];
            for (let i = 1; i < recent.length; i++) {
              distances.push(calculateDistanceMeters(recent[i - 1].lat, recent[i - 1].lng, recent[i].lat, recent[i].lng));
            }
            isConsistentDirection = distances.every((d) => d > 4);
          }

          if (drift > safeThreshold) {
            if (isMovingFast || isConsistentDirection || drift > 90) {
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

  useEffect(() => {
    return () => {
      if (repeatAlarmTimerRef.current) {
        clearInterval(repeatAlarmTimerRef.current);
        repeatAlarmTimerRef.current = null;
      }
    };
  }, []);

  // 👑 1. دالة تأكيد الأمان من مالك السيارة (العميل)
  const handleOwnerDismiss = async () => {
    setIsBreached(false);
    consecutiveBreachCountRef.current = 0;
    dismissCooldownUntilRef.current = Date.now() + 60000; // منع الـ GPS من إعادة تشغيل الإنذار لمدة دقيقة

    // 🛑 1. إيقاف المؤقت في واجهة React
    if (repeatAlarmTimerRef.current) {
      clearInterval(repeatAlarmTimerRef.current);
      repeatAlarmTimerRef.current = null;
    }

    const currentPlate = breachAlert?.carPlate || carPlate;

    // 🛑 2. إرسال أمر فوري للـ Service Worker لقتل كل المؤقتات ومسح الإشعارات من شاشة القفل
    killAllServiceWorkerTheftAlarms(currentPlate);

    // 🛑 3. إيقاف التكرار في السيرفر
    if (currentPlate) {
      stopTheftAlarmRepeat({ carPlate: currentPlate }).catch(() => {});
    }

    // 🔄 4. إعادة تعيين نقطة الرادار للموقع الحالي لمنع أي إنذار كاذب بعد الإيقاف
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        carAnchorRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 15),
        };
      });
    }

    // 🌐 5. تحديث السيرفر لإعلام هاتف السايس والأجهزة الأخرى بالإلغاء
    if (breachAlert?.sessionId) {
      await supabase
        .from('sessions')
        .update({ is_breached: false })
        .eq('id', breachAlert.sessionId);
    }

    setBreachAlert(null);
    toast.success('تم تأكيد الأمان وإيقاف الإنذار بالكامل 🛡️');
  };

  // 🅿️ 2. دالة كتم الصوت لجهاز السايس
  const handleValetMuteLocal = () => {
    setIsValetMutedLocally(true);
    if (repeatAlarmTimerRef.current) {
      clearInterval(repeatAlarmTimerRef.current);
      repeatAlarmTimerRef.current = null;
    }
    killAllServiceWorkerTheftAlarms(breachAlert?.carPlate || carPlate);
    toast('تم كتم الصوت بجهازك • الإنذار مستمر لدى العميل حتى يؤكد الأمان ⚠️', {
      icon: '🔇',
      duration: 5000,
    });
  };

  if (isTampered) {
    return (
      <div className="fixed inset-0 z-[9999999] bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center" dir="rtl">
        <div className="text-5xl mb-4">🛡️</div>
        <h2 className="text-xl font-black mb-2">تم تفعيل بروتوكول الأمان الذاتي</h2>
        <p className="text-red-400 text-xs font-bold max-w-xs">تم رصد تلاعب خارجي بالصلاحيات. جاري إعادة التهيئة...</p>
      </div>
    );
  }

  // 🚨 شاشة إنذار السرقة الحمراء
  if (isBreached && breachAlert) {
    return (
      <div className="fixed inset-0 z-[9999999] bg-red-950/95 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 text-white animate-pulse" dir="rtl">
        <div className="w-28 h-28 bg-red-600 rounded-full flex items-center justify-center text-6xl mb-6 shadow-2xl animate-bounce">
          🚨
        </div>
        <h2 className="text-3xl font-black mb-2">إنذار سرقة عاجل!</h2>
        <span className="bg-red-900 text-red-100 text-sm font-black px-5 py-2 rounded-full mb-4 border border-red-700 shadow-md">
          🚗 السيارة: {breachAlert.carPlate}
        </span>
        <p className="text-slate-100 text-sm font-bold max-w-xs mb-3 leading-relaxed">
          {breachAlert.reason}
        </p>

        {isCarOwner ? (
          <>
            <p className="text-amber-300 text-[10px] font-black mb-6 animate-pulse">
              ⚠️ بصفتك مالك السيارة، اضغط أدناه لتأكيد أمان سيارتك وإيقاف الإنذار
            </p>
            <button
              onClick={handleOwnerDismiss}
              className="bg-white hover:bg-slate-100 text-red-600 font-black px-10 py-4 rounded-2xl text-sm active:scale-95 transition-all shadow-2xl cursor-pointer"
            >
              🔕 تأكيد أمان سيارتي وإيقاف الإنذار
            </button>
          </>
        ) : (
          <div className="w-full max-w-xs space-y-3 mt-2">
            <div className="p-3 bg-red-900/60 border border-red-500/50 rounded-xl text-[11px] font-bold text-amber-200">
              🔒 لا يمكن للسايس إيقاف الإنذار. في انتظار تأكيد الأمان من مالك السيارة حصراً.
            </div>

            {!isValetMutedLocally ? (
              <button
                onClick={handleValetMuteLocal}
                className="w-full bg-slate-900/80 hover:bg-slate-900 text-slate-200 font-black py-3 rounded-xl text-xs border border-white/20 active:scale-95 transition-all cursor-pointer"
              >
                🔇 كتم صوت جهازي فقط (الإنذار مستمر عند العميل)
              </button>
            ) : (
              <div className="text-[10px] text-slate-300 font-bold">
                🔇 تم كتم صوت جهازك • الإنذار مستمر لدى العميل
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (isAppBlurred) {
    return (
      <div className="fixed inset-0 z-[9999998] bg-slate-950/85 backdrop-blur-xl flex flex-col items-center justify-center text-center p-6">
        <div className="text-4xl mb-3">🛡️</div>
        <h3 className="text-white font-black text-base" style={{ fontFamily: "'Cairo', sans-serif" }}>بركن <span className="text-[#8cc63f]">24</span></h3>
        <p className="text-slate-400 text-xs mt-1 font-bold">البيانات مؤمنة لحمايتك</p>
      </div>
    );
  }

  if (view === 'garage' && isValetOutOfFence && isShieldEnabled) {
    return (
      <div className="fixed inset-0 z-[999999] bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-center text-center p-6 text-white" dir="rtl">
        <div className="w-20 h-20 bg-amber-500/20 border border-amber-500/40 rounded-full flex items-center justify-center text-4xl mb-5 animate-pulse text-amber-400">📍</div>
        <h2 className="text-2xl font-black mb-2 text-amber-400">خارج نطاق السياج الأمني!</h2>
        <span className="bg-amber-950/60 text-amber-300 text-xs font-bold px-4 py-1.5 rounded-full mb-4 border border-amber-800">أنت تبعد {valetDistance} متراً عن نطاق الحماية</span>
        <p className="text-slate-300 text-xs max-w-xs font-bold leading-relaxed mb-6">تم حجب التطبيق. عد لمحيط الـ 250 متراً لفتح الشاشة تلقائياً.</p>
      </div>
    );
  }

  return null;
}