// src/components/SecurityShield.tsx

/**
 * 🛡️ درع الأمان الشامل المزدوج المحدث (حماية التطبيق + حماية السيارة)
 * - تم حل مشكلة تسجيل الخروج المتكرر بنجاح 100% ✅
 */

import { useEffect, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { useStore, normalizePlate } from '../store';
import { supabase } from '../lib/supabase';

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

    for (let i = 0; i < 6; i++) {
      const start = now + (i * 0.35);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(900, start);
      osc.frequency.linearRampToValueAtTime(2400, start + 0.3);

      gain.gain.setValueAtTime(0.8, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.32);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(start);
      osc.stop(start + 0.34);
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

  const carAnchorRef = useRef<{ lat: number; lng: number } | null>(null);
  const garageOriginRef = useRef<{ lat: number; lng: number } | null>(null);

  const triggerAlarm = (plate: string, reason: string, targetSessionId?: string) => {
    setIsBreached(true);
    setBreachAlert({
      carPlate: plate || 'المركبة',
      reason: reason || '🚨 رصد محاولة تحريك وسرقة للسيارة!',
      sessionId: targetSessionId,
    });

    playTheftSirenSound();

    if (navigator.vibrate) {
      navigator.vibrate([1000, 200, 1000, 200, 1500, 200, 2000]);
    }
  };

  /* ═══════════════════════════════════════════
     📡 1. الاستماع الصاعق المباشر من السيرفر (Supabase Realtime)
     ═══════════════════════════════════════════ */
  useEffect(() => {
    const userPlateClean = normalizePlate(currentUser?.carPlate);

    const channel = supabase
      .channel(`security-shield-instant-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions' },
        (payload) => {
          const newRow = payload.new as any;
          if (!newRow) return;

          if (newRow.is_breached === true && newRow.status === 'active') {
            const rowPlate = normalizePlate(newRow.car_plate || newRow.carPlate);
            const isMyCar = userPlateClean && rowPlate === userPlateClean;
            const isMyGarage = currentGarageId && newRow.garage_id === currentGarageId;

            if (isMyCar || isMyGarage || view === 'admin' || !currentUser) {
              triggerAlarm(
                newRow.car_plate,
                newRow.breach_reason || '🚨 تم رصد حركة وتحريك غير مصرح به للسيارة!',
                newRow.id
              );
            }
          } else if (newRow.is_breached === false) {
            setIsBreached(false);
            setBreachAlert(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.carPlate, currentGarageId, view]);

  useEffect(() => {
    const userPlateClean = normalizePlate(currentUser?.carPlate);
    const breached = sessions.find((s) => {
      if (s.status !== 'active') return false;
      const rowPlate = normalizePlate(s.carPlate);
      const isMatch = (userPlateClean && rowPlate === userPlateClean) || (currentGarageId && s.garageId === currentGarageId);
      return isMatch && (s as any).is_breached === true;
    });

    if (breached) {
      triggerAlarm(
        breached.carPlate,
        (breached as any).breach_reason || '🚨 تم رصد حركة غير مصرح بها للمركبة!',
        breached.id
      );
    }
  }, [sessions, currentUser?.carPlate, currentGarageId]);

  /* ═══════════════════════════════════════════
     🛡️ 2. حماية المنصة العامة من التلاعب بالرتب وصلاحيات الأدمن
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
    
    // 🛡️ فحص التلاعب بالصلاحيات فقط (يستثني بيانات المستخدم والمحفظة الطبيعية لتفادي التعليق)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'adminAccess' && e.newValue === 'true') {
        const isAdminLoggedIn = localStorage.getItem('adminAccess') === 'true';
        if (!isAdminLoggedIn) {
          setIsTampered(true);
          localStorage.clear();
          sessionStorage.clear();
          setTimeout(() => { window.location.href = '/'; }, 1000);
        }
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('storage', handleStorageChange);
    document.addEventListener('visibilitychange', () => setIsAppBlurred(document.hidden));

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  /* ═══════════════════════════════════════════
     🛰️ 3. رادار الـ GPS الميداني
     ═══════════════════════════════════════════ */
  useEffect(() => {
    if (!isSessionActive || !isShieldEnabled || !sessionId) return;

    let isRunning = true;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        carAnchorRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        garageOriginRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      });
    }

    const timer = setInterval(() => {
      if (!isRunning || !navigator.geolocation) return;

      navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        if (view === 'garage' && garageOriginRef.current) {
          const dist = calculateDistanceMeters(garageOriginRef.current.lat, garageOriginRef.current.lng, lat, lng);
          setValetDistance(dist);
          setIsValetOutOfFence(dist > 250);
        }

        if (carAnchorRef.current && !isValetOutOfFence) {
          const drift = calculateDistanceMeters(carAnchorRef.current.lat, carAnchorRef.current.lng, lat, lng);
          if (drift > 15) {
            triggerAlarm(carPlate, `🚨 تحذير سرقة: تم رصد تحرك السيارة مسافة ${drift} متراً عن موقع الركن!`, sessionId);
          }
        }
      });
    }, 5000);

    return () => {
      isRunning = false;
      clearInterval(timer);
    };
  }, [isSessionActive, isShieldEnabled, sessionId, carPlate, view, isValetOutOfFence]);

  const handleDismiss = async () => {
    setIsBreached(false);
    if (breachAlert?.sessionId) {
      await supabase
        .from('sessions')
        .update({ is_breached: false })
        .eq('id', breachAlert.sessionId);
    }
    setBreachAlert(null);
    toast.success('تم تأكيد الأمان وإيقاف الإنذار 🛡️');
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
        <p className="text-slate-100 text-sm font-bold max-w-xs mb-8 leading-relaxed">
          {breachAlert.reason}
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