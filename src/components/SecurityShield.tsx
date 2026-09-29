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

  const carAnchorRef = useRef<{ lat: number; lng: number; accuracy: number } | null>(null);
  const garageOriginRef = useRef<{ lat: number; lng: number } | null>(null);
  const consecutiveBreachCountRef = useRef<number>(0);

  // 🔁 مرجع مؤقت تكرار الإشعار
  const repeatAlarmTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const triggerAlarm = async (
    plate: string,
    reason: string,
    targetSessionId?: string,
    isLocalDetection = false
  ) => {
    setIsBreached(true);
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

      // إعادة تشغيل الصوت والاهتزاز
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

      // إعادة إرسال Web Push للطرف الآخر كل 30 ثانية
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
            consecutiveBreachCountRef.current = 0;

            // 🛑 إيقاف تكرار الإشعار
            if (repeatAlarmTimerRef.current) {
              clearInterval(repeatAlarmTimerRef.current);
              repeatAlarmTimerRef.current = null;
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

  // 🧹 تنظيف مؤقت التكرار عند إلغاء المكون
  useEffect(() => {
    return () => {
      if (repeatAlarmTimerRef.current) {
        clearInterval(repeatAlarmTimerRef.current);
        repeatAlarmTimerRef.current = null;
      }
    };
  }, []);

  const handleDismiss = async () => {
    setIsBreached(false);
    consecutiveBreachCountRef.current = 0;

    // 🛑 إيقاف تكرار الإشعار فوراً
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
        <p className="text-amber-300 text-[10px] font-black mb-8 animate-pulse">
          ⚠️ يتم تكرار التنبيه كل 15 ثانية حتى تفتح التطبيق
        </p>
        <button
          onClick={handleDismiss}
          className="bg-white hover:bg-slate-100 text-red-600 font-black px-12 py-4 rounded-2xl text-sm active:scale-95 transition-all shadow-2xl cursor-pointer"
        >
          🔕 إيقاف الإنذار وتأكيد الأمان
        </button>
      </div>
    );
  }

  return null;
}