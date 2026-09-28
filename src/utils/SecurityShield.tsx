// src/components/SecurityShield.tsx

/**
 * 🛡️ درع الأمان الشامل المزدوج (حماية التطبيق + حماية السيارة)
 *
 * الطبقة الأولى: حماية التطبيق من الهاكرز
 *   - منع كليك يمين وأدوات الفحص (DevTools)
 *   - كشف التلاعب بالـ LocalStorage
 *   - تعتيم الشاشة عند التصوير أو الخروج
 *
 * الطبقة الثانية: حماية السيارة من السرقة (Virtual Radar)
 *   - تثبيت موقع السيارة بالـ GPS لحظة الركن
 *   - رصد أي إزاحة أو سحب أو ونش
 *   - سياج 250 متر للسايس
 *   - إنذار مزدوج للعميل والسايس
 */

import { useEffect, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  lockCarRadarAnchor,
  evaluateRadarDrift,
  calculateDistanceMeters,
  playShieldConfirmationChime,
  RadarCarAnchor,
} from '../utils/batShieldEngine';

interface SecurityShieldProps {
  view: 'user' | 'garage' | 'admin';
  isSessionActive: boolean;
  isShieldEnabled?: boolean;
  sessionId?: string | null;
  carPlate?: string;
}

export default function SecurityShield({
  view,
  isSessionActive,
  isShieldEnabled = false,
  sessionId,
  carPlate = '',
}: SecurityShieldProps) {
  // ─── حالات حماية التطبيق ───
  const [isTampered, setIsTampered] = useState(false);
  const [isAppBlurred, setIsAppBlurred] = useState(false);

  // ─── حالات سياج الـ 250 متر ───
  const [isValetOutOfFence, setIsValetOutOfFence] = useState(false);
  const [valetDistance, setValetDistance] = useState(0);

  // ─── حالات إنذار السرقة ───
  const [isBreached, setIsBreached] = useState(false);
  const [breachAlert, setBreachAlert] = useState<{
    carPlate: string;
    reason: string;
  } | null>(null);

  // ─── مراجع الذاكرة الصامتة (لا تسبب إعادة رسم الشاشة) ───
  const carAnchorRef = useRef<RadarCarAnchor | null>(null);
  const garageOriginRef = useRef<{ lat: number; lng: number } | null>(null);
  const breachCountRef = useRef(0);

  /* ═══════════════════════════════════════════
     🛡️ الطبقة الأولى: حماية التطبيق من الهاكرز
     ═══════════════════════════════════════════ */
  useEffect(() => {
    // 1. منع كليك يمين
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();

    // 2. منع اختصارات DevTools
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'F12' ||
        ((e.ctrlKey || e.metaKey) &&
          e.shiftKey &&
          ['I', 'J', 'C'].includes(e.key.toUpperCase())) ||
        ((e.ctrlKey || e.metaKey) && e.key.toUpperCase() === 'U')
      ) {
        e.preventDefault();
      }
    };

    // 3. كشف التلاعب بالـ LocalStorage
    const handleStorageChange = (e: StorageEvent) => {
      if (
        e.key === 'adminAccess' ||
        e.key === 'currentUser' ||
        e.key === 'currentGarageId'
      ) {
        setIsTampered(true);
        localStorage.clear();
        sessionStorage.clear();
        setTimeout(() => {
          window.location.href = '/';
        }, 1000);
      }

      // استقبال إنذار السرقة المشترك
      if (e.key && e.key.startsWith('radar_breach_') && e.newValue) {
        try {
          const alert = JSON.parse(e.newValue);
          if (alert.isRealBreach) {
            setIsBreached(true);
            setBreachAlert({
              carPlate: alert.carPlate,
              reason: alert.reason,
            });
            if (navigator.vibrate) {
              navigator.vibrate([800, 200, 800, 200, 800]);
            }
          }
        } catch {
          // تجاهل
        }
      }
    };

    // 4. تعتيم الشاشة عند الخروج أو التصوير
    const handleVisibility = () => {
      setIsAppBlurred(document.hidden || !document.hasFocus());
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('blur', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('blur', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  /* ═══════════════════════════════════════════
     🛰️ الطبقة الثانية: رادار حماية السيارة
     ═══════════════════════════════════════════ */
  useEffect(() => {
    if (!isSessionActive || !isShieldEnabled || !sessionId) {
      setIsBreached(false);
      setIsValetOutOfFence(false);
      carAnchorRef.current = null;
      garageOriginRef.current = null;
      breachCountRef.current = 0;
      return;
    }

    let isRunning = true;
    let radarTimer: NodeJS.Timeout | null = null;

    const setupRadar = async () => {
      // تثبيت موقع السيارة
      const anchor = await lockCarRadarAnchor(sessionId, carPlate);
      if (anchor) {
        carAnchorRef.current = anchor;
        garageOriginRef.current = {
          lat: anchor.latitude,
          lng: anchor.longitude,
        };
        playShieldConfirmationChime();
        toast.success(
          `🛡️ رادار الحماية نشط للسيارة (${carPlate || 'المركبة'})`,
          { id: `radar-${sessionId}`, duration: 4000 }
        );
      }

      // فحص راداري كل 5 ثوانٍ (خفيف جداً)
      radarTimer = setInterval(() => {
        if (!isRunning || !navigator.geolocation) return;

        navigator.geolocation.getCurrentPosition((pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;

          // [أ] فحص سياج الـ 250 متر للسايس
          if (view === 'garage' && garageOriginRef.current) {
            const dist = calculateDistanceMeters(
              garageOriginRef.current.lat,
              garageOriginRef.current.lng,
              lat,
              lng
            );
            setValetDistance(dist);
            setIsValetOutOfFence(dist > 250);
          }

          // [ب] فحص إزاحة السيارة (ضد السرقة)
          if (carAnchorRef.current && !isValetOutOfFence) {
            const drift = evaluateRadarDrift(carAnchorRef.current, lat, lng);

            if (drift.isBreached) {
              breachCountRef.current += 1;

              // التأكيد الثلاثي لمنع الإنذار الكاذب
              if (breachCountRef.current >= 3) {
                breachCountRef.current = 0;
                const alertPayload = {
                  isRealBreach: true,
                  carPlate: carAnchorRef.current.carPlate,
                  reason: drift.reason,
                  time: Date.now(),
                };

                setIsBreached(true);
                setBreachAlert({
                  carPlate: alertPayload.carPlate,
                  reason: alertPayload.reason,
                });

                if (navigator.vibrate) {
                  navigator.vibrate([800, 200, 800, 200, 800]);
                }

                // بث الإنذار للطرف الآخر
                localStorage.setItem(
                  `radar_breach_${sessionId}`,
                  JSON.stringify(alertPayload)
                );
              }
            } else {
              breachCountRef.current = 0;
            }
          }
        });
      }, 5000);
    };

    setupRadar();

    return () => {
      isRunning = false;
      if (radarTimer) clearInterval(radarTimer);
      if (sessionId) localStorage.removeItem(`radar_breach_${sessionId}`);
    };
  }, [isSessionActive, isShieldEnabled, sessionId, carPlate, view]);

  /* ═══════════════════════════════════════════
     🎨 الشاشات البصرية للدرع
     ═══════════════════════════════════════════ */

  const handleDismiss = () => {
    setIsBreached(false);
    setBreachAlert(null);
    breachCountRef.current = 0;
    if (sessionId) localStorage.removeItem(`radar_breach_${sessionId}`);
    toast.success('تم تأكيد الأمان واستئناف الحماية 🛡️');
  };

  // 1️⃣ شاشة قفل التطبيق (تلاعب بالأكواد)
  if (isTampered) {
    return (
      <div
        className="fixed inset-0 z-[9999999] bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center"
        dir="rtl"
      >
        <div className="text-5xl mb-4">🛡️</div>
        <h2 className="text-xl font-black mb-2">
          تم تفعيل بروتوكول الأمان الذاتي
        </h2>
        <p className="text-red-400 text-xs font-bold max-w-xs">
          تم رصد تلاعب خارجي بالصلاحيات. تم مسح الجلسة وإعادة التهيئة...
        </p>
      </div>
    );
  }

  // 2️⃣ شاشة تعتيم البيانات (تصوير الشاشة)
  if (isAppBlurred) {
    return (
      <div className="fixed inset-0 z-[9999998] bg-slate-950/85 backdrop-blur-xl flex flex-col items-center justify-center text-center p-6">
        <div className="text-4xl mb-3">🛡️</div>
        <h3
          className="text-white font-black text-base"
          style={{ fontFamily: "'Cairo', sans-serif" }}
        >
          بركن <span className="text-[#8cc63f]">24</span>
        </h3>
        <p className="text-slate-400 text-xs mt-1 font-bold">
          البيانات مؤمنة لحمايتك
        </p>
      </div>
    );
  }

  // 3️⃣ شاشة حجب التطبيق للسايس (خارج الـ 250 متر)
  if (view === 'garage' && isValetOutOfFence && isShieldEnabled) {
    return (
      <div
        className="fixed inset-0 z-[999999] bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-center text-center p-6 text-white"
        dir="rtl"
      >
        <div className="w-20 h-20 bg-amber-500/20 border border-amber-500/40 rounded-full flex items-center justify-center text-4xl mb-5 animate-pulse text-amber-400">
          📍
        </div>
        <h2 className="text-2xl font-black mb-2 text-amber-400">
          خارج نطاق السياج الأمني!
        </h2>
        <span className="bg-amber-950/60 text-amber-300 text-xs font-bold px-4 py-1.5 rounded-full mb-4 border border-amber-800">
          أنت تبعد {valetDistance} متراً عن نطاق الحماية
        </span>
        <p className="text-slate-300 text-xs max-w-xs font-bold leading-relaxed mb-6">
          تم حجب التطبيق. عد لمحيط الـ 250 متراً لفتح الشاشة تلقائياً.
        </p>
        <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-white/5 px-4 py-2 rounded-xl">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          جاري التحقق التلقائي من موقعك...
        </div>
      </div>
    );
  }

  // 4️⃣ شاشة إنذار السرقة المزدوج (عميل + سايس)
  if (isBreached && breachAlert) {
    return (
      <div
        className="fixed inset-0 z-[99999] bg-red-950/95 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 text-white animate-pulse"
        dir="rtl"
      >
        <div className="w-24 h-24 bg-red-600 rounded-full flex items-center justify-center text-5xl mb-6 shadow-2xl animate-bounce">
          📢
        </div>
        <h2 className="text-3xl font-black mb-2">إنذار سرقة عاجل!</h2>
        <span className="bg-red-900 text-red-100 text-xs font-black px-4 py-1.5 rounded-full mb-4 border border-red-700">
          {view === 'garage'
            ? `⚠️ السايس: السيارة ${breachAlert.carPlate} تتحرك!`
            : `⚠️ العميل: سيارتك ${breachAlert.carPlate} تتحرك!`}
        </span>
        <p className="text-slate-200 text-sm font-bold max-w-xs mb-8 leading-relaxed">
          {breachAlert.reason}
        </p>
        <button
          onClick={handleDismiss}
          className="bg-white hover:bg-slate-100 text-red-600 font-black px-10 py-3.5 rounded-2xl text-xs active:scale-95 transition-all shadow-2xl cursor-pointer"
        >
          🔕 إيقاف الإنذار وتأكيد الأمان
        </button>
      </div>
    );
  }

  return null;
}