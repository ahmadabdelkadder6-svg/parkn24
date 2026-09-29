// src/components/SecurityShield.tsx

/**
 * 🛡️ درع الأمان الشامل المزدوج المحدث V4.0
 * ⚡ سرعة استجابة صاعقة (< 2 ثانية) للإشعارات الخارجية
 * 🅿️ وضع العمل المرن للسايس: كتم الصوت ومتابعة باقي السيارات عبر بانر عائم دون تعطيل
 * 👑 صلاحية إلغاء الإنذار من السيرفر محصورة بالعميل (المالك) فقط
 */

import { useEffect, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { useStore, normalizePlate } from '../store';
import { supabase } from '../lib/supabase';
import { sendTheftAlertPush, stopTheftAlarmRepeat } from '../lib/pushManager';
import { Shield, VolumeX, AlertTriangle, CheckCircle } from 'lucide-react';

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

// 🔊 مشغل الصوت القابل للإيقاف الفوري
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

    for (let i = 0; i < 6; i++) {
      const start = now + (i * 0.35);
      const osc = globalAudioCtx.createOscillator();
      const gain = globalAudioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(900, start);
      osc.frequency.linearRampToValueAtTime(2600, start + 0.3);

      gain.gain.setValueAtTime(1.0, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.33);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(start);
      osc.stop(start + 0.34);
      activeOscillators.push(osc);
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

  // 🔇 حالة كتم الصوت المحلية
  const [isMutedLocally, setIsMutedLocally] = useState(false);
  const isMutedLocallyRef = useRef(isMutedLocally);

  // 🅿️ وضع العمل للسايس (إخفاء الشاشة الحمراء وإظهار البانر العائم لمتابعة باقي السيارات)
  const [isValetMinimized, setIsValetMinimized] = useState(false);

  useEffect(() => {
    isMutedLocallyRef.current = isMutedLocally;
  }, [isMutedLocally]);

  const carAnchorRef = useRef<{ lat: number; lng: number; accuracy: number } | null>(null);
  const garageOriginRef = useRef<{ lat: number; lng: number } | null>(null);
  const consecutiveBreachCountRef = useRef<number>(0);
  const dismissCooldownUntilRef = useRef<number>(0);

  const repeatAlarmTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isCarOwner = view === 'user' || view === 'admin';

  const triggerAlarm = (
    plate: string,
    reason: string,
    targetSessionId?: string,
    isLocalDetection = false
  ) => {
    if (Date.now() < dismissCooldownUntilRef.current) return;

    setIsBreached(true);
    setIsMutedLocally(false);
    setIsValetMinimized(false);
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

    // ⚡ 1. إطلاق الإشعار الخارجي فوراً وبدون أي انتظار
    triggerExternalSystemNotification(
      '🚨 إنذار سرقة عاجل لمركبتك!',
      `🚗 السيارة ${plate || ''} • ${cleanReason}`,
      `theft-alarm-${plate || 'car'}-${Date.now()}`,
      plate
    );

    // ⚡ 2. إرسال الـ Web Push وتحديث السيرفر بالتوازي في الخلفية فوراً (< 1 ثانية)
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

    // 🔁 3. مؤقت التكرار
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

      if (!isMutedLocallyRef.current) {
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
      }
    }, 15000);
  };

  /* ═══════════════════════════════════════════
     📡 1. الاستماع اللحظي الصاعق (Supabase Realtime)
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
            setIsBreached(false);
            setBreachAlert(null);
            setIsMutedLocally(false);
            setIsValetMinimized(false);
            stopAllSirenSounds();
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
     🛰️ 3. رادار الـ GPS فائق السرعة والدقة (فحص كل 2.5 ثانية)
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
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }

    const timer = setInterval(() => {
      if (!isRunning || !navigator.geolocation) return;
      if (Date.now() < dismissCooldownUntilRef.current) return;

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords;

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

          const drift = calculateDistanceMeters(carAnchorRef.current.lat, carAnchorRef.current.lng, lat, lng);
          const safeThreshold = Math.max(45, (carAnchorRef.current.accuracy || 15) + accuracy);
          const currentSpeedKmh = speed !== null && speed >= 0 ? speed * 3.6 : -1;

          // ⚡ كشف فوري وسريع: لو الحركة مؤكدة (> 50 متر أو سرعة قيادة) ينطلق فوراً
          if (drift > safeThreshold) {
            if (currentSpeedKmh > 4 || drift > 65) {
              triggerAlarm(
                carPlate,
                `🚨 رصد تحرك وسحب للسيارة مسافة ${drift} متراً عن موقع الركن!`,
                sessionId,
                true
              );
            }
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 4000, maximumAge: 1000 }
      );
    }, 2500); // دورة فحص سريعة كل 2.5 ثانية

    return () => {
      isRunning = false;
      clearInterval(timer);
    };
  }, [isSessionActive, isShieldEnabled, sessionId, carPlate, view]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('breach') === 'true') {
      const urlPlate = params.get('carPlate') || carPlate || 'المركبة';
      triggerAlarm(
        urlPlate,
        '🚨 إنذار عاجل: تم رصد محاولة تحريك وسرقة لسيارتك!',
        sessionId || undefined,
        false
      );
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch {}
    }
  }, [carPlate, sessionId]);

  useEffect(() => {
    return () => {
      stopAllSirenSounds();
      if (repeatAlarmTimerRef.current) {
        clearInterval(repeatAlarmTimerRef.current);
        repeatAlarmTimerRef.current = null;
      }
    };
  }, []);

  // 👑 1. دالة تأكيد الأمان النهائية من مالك السيارة فقط
  const handleOwnerDismiss = async () => {
    stopAllSirenSounds();
    setIsBreached(false);
    dismissCooldownUntilRef.current = Date.now() + 60000;

    if (repeatAlarmTimerRef.current) {
      clearInterval(repeatAlarmTimerRef.current);
      repeatAlarmTimerRef.current = null;
    }

    const currentPlate = breachAlert?.carPlate || carPlate;
    killAllServiceWorkerTheftAlarms(currentPlate);

    try { window.history.replaceState({}, document.title, '/'); } catch {}

    if (currentPlate) {
      stopTheftAlarmRepeat({ carPlate: currentPlate }).catch(() => {});
    }

    if (breachAlert?.sessionId) {
      await supabase
        .from('sessions')
        .update({ is_breached: false })
        .eq('id', breachAlert.sessionId);
    }

    setBreachAlert(null);
    toast.success('تم تأكيد الأمان وإيقاف الإنذار بالكامل 🛡️');
  };

  // 🔇 2. كتم الصوت المباشر للعميل (للتحدث)
  const handleCustomerLocalMute = () => {
    stopAllSirenSounds();
    setIsMutedLocally(true);
    if (navigator.vibrate) navigator.vibrate(0);
    toast.success('🔇 تم كتم الصوت بجهازك لتتمكن من التحدث • الإنذار مستمر في الجراج');
  };

  // 🅿️ 3. كتم السايس وتحويل الشاشة لبانر عائم لمتابعة عمل الجراج
  const handleValetMuteAndWork = () => {
    stopAllSirenSounds();
    setIsMutedLocally(true);
    setIsValetMinimized(true);
    if (navigator.vibrate) navigator.vibrate(0);
    killAllServiceWorkerTheftAlarms(breachAlert?.carPlate || carPlate);
    toast('🔇 تم كتم الصوت وفتح لوحة الجراج للعمل • الإنذار مستمر لدى العميل ⚠️', {
      icon: '🅿️',
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
    // 🅿️ إذا كان السايس كتم الإنذار، نعرض له بانر علوي عائم ولا نعطل شاشته
    if (view === 'garage' && isValetMinimized) {
      return (
        <div className="fixed top-2 left-2 right-2 z-[9999999] bg-red-600 text-white p-3 rounded-2xl shadow-2xl flex items-center justify-between border-2 border-white/40 animate-pulse" dir="rtl">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-base font-black">
              🚨
            </div>
            <div className="text-right">
              <div className="text-xs font-black">إنذار سرقة نشط: 🚗 {breachAlert.carPlate}</div>
              <div className="text-[9px] text-red-100 font-bold">في انتظار تأكيد الأمان من العميل (تم كتم صوت الجراج)</div>
            </div>
          </div>
          <button
            onClick={() => setIsValetMinimized(false)}
            className="bg-white text-red-600 text-[10px] font-black px-3 py-1.5 rounded-xl border-0 cursor-pointer active:scale-95"
          >
            عرض التفاصيل
          </button>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-[9999999] bg-red-950/95 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 text-white animate-pulse" dir="rtl">
        <div className="w-28 h-28 bg-red-600 rounded-full flex items-center justify-center text-6xl mb-6 shadow-2xl animate-bounce">
          🚨
        </div>
        <h2 className="text-3xl font-black mb-2">إنذار سرقة عاجل!</h2>
        <span className="bg-red-900 text-red-100 text-sm font-black px-5 py-2 rounded-full mb-4 border border-red-700 shadow-md">
          🚗 السيارة: {breachAlert.carPlate}
        </span>
        <p className="text-slate-100 text-sm font-bold max-w-xs mb-4 leading-relaxed">
          {breachAlert.reason}
        </p>

        {isCarOwner ? (
          /* 👑 واجهة مالك السيارة: يملك صلاحية الإيقاف النهائي + كتم الصوت */
          <div className="w-full max-w-xs space-y-2.5">
            <button
              onClick={handleOwnerDismiss}
              className="w-full bg-white hover:bg-slate-100 text-red-600 font-black py-4 rounded-2xl text-sm active:scale-95 transition-all shadow-2xl cursor-pointer border-0"
            >
              🔕 تأكيد أمان سيارتي وإيقاف الإنذار
            </button>

            {!isMutedLocally ? (
              <button
                onClick={handleCustomerLocalMute}
                className="w-full bg-white/10 hover:bg-white/20 text-white font-black py-3 rounded-xl text-xs border border-white/20 backdrop-blur-sm active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <VolumeX size={14} /> كتم الصوت مؤقتاً للتحدث
              </button>
            ) : (
              <div className="text-[10px] text-amber-300 font-bold py-1">
                🔇 تم كتم الصوت بجهازك مؤقتاً • الإنذار مستمر في الجراج
              </div>
            )}
          </div>
        ) : (
          /* 🅿️ واجهة السايس: كتم الصوت ومتابعة باقي سيارات الجراج */
          <div className="w-full max-w-xs space-y-3 mt-2">
            <div className="p-3 bg-red-900/60 border border-red-500/50 rounded-xl text-[11px] font-bold text-amber-200">
              🔒 لا يمكن للسايس إلغاء الإنذار، لكن يمكنك كتم الصوت ومتابعة عمل الجراج.
            </div>

            <button
              onClick={handleValetMuteAndWork}
              className="w-full bg-white text-slate-900 hover:bg-slate-100 font-black py-3.5 rounded-xl text-xs active:scale-95 transition-all cursor-pointer border-0 shadow-lg flex items-center justify-center gap-2"
            >
              <VolumeX size={16} className="text-red-600" />
              <span>🔇 كتم ومتابعة عمل الجراج (بانر عائم)</span>
            </button>
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