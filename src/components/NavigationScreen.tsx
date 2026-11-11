import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Navigation,
  MapPin,
  ArrowRight,
  Car,
  Clock,
  XCircle,
  Copy,
  Zap,
  Wallet,
  AlertCircle,
  Check,
  ShieldCheck,
} from 'lucide-react';
import {
  useStore,
  normalizePlate,
  normalizePhone,
  getServerNow,
  BOOKING_FEE,
  TOPUP_TIERS,
} from '../store';
import {
  calculateDistance,
  distanceToMinutes,
  formatDuration,
} from '../utils/distance';
import { openMapsWithSmartArrival } from '../utils/mapsNavigation';
import toast from 'react-hot-toast';

import 'leaflet/dist/leaflet.css';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import { supabase } from '../lib/supabase';

const BRAND = {
  blue: '#1656b8',
  blueDark: '#0f3d85',
  blueLight: '#e8f0fe',
  green: '#8cc63f',
  greenDark: '#6ea62a',
  greenLight: 'rgba(140, 198, 63, 0.12)',
  navy: '#0a1628',
  navyLight: '#111e36',
  slate: '#64748b',
  slateMuted: '#94a3b8',
  border: 'rgba(255, 255, 255, 0.08)',
};

// 🎯 ثوابت البدء التلقائي (محسّنة لـ GPS الجراج الضعيف)
const AUTO_START_DISTANCE_KM = 0.3;    // 300 متر (GPS جوه الجراج ضعيف)
const AUTO_START_DURATION_MS = 120_000; // 120 ثانية (دقيقتين)
const AUTO_START_MOVEMENT_KM = 0.05;    // 50 متر tolerance للحركة

const getBonusForAmount = (amount: number): number => {
  if (amount >= 250) return 50;
  if (amount >= 100) return 15;
  if (amount >= 50) return 5;
  if (amount >= 20) return 2;
  return 0;
};

const userIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `<div style="width:36px;height:38px;background:${BRAND.blue};border-radius:50%;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 4px 12px rgba(0,0,0,0.3);">🚗</div>`,
  iconSize: [36, 38],
  iconAnchor: [18, 19],
});

const garageIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `<div style="width:36px;height:38px;background:${BRAND.green};border-radius:50%;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 4px 12px rgba(0,0,0,0.3);">🅿️</div>`,
  iconSize: [36, 38],
  iconAnchor: [18, 19],
});

const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

function MapController({
  userPos,
  garagePos,
}: {
  userPos: [number, number];
  garagePos: [number, number];
}) {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {}
    }, 250);

    const isValidCoord = (c: [number, number]) =>
      Array.isArray(c) &&
      typeof c[0] === 'number' && Number.isFinite(c[0]) && !isNaN(c[0]) && c[0] !== 0 &&
      typeof c[1] === 'number' && Number.isFinite(c[1]) && !isNaN(c[1]) && c[1] !== 0;

    if (isValidCoord(userPos) && isValidCoord(garagePos)) {
      try {
        const bounds = L.latLngBounds([userPos, garagePos]);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      } catch {
        try {
          map.setView(garagePos, 15);
        } catch {}
      }
    } else if (isValidCoord(garagePos)) {
      try {
        map.setView(garagePos, 15);
      } catch {}
    }

    return () => {
      clearTimeout(timer);
      try {
        map.stop();
      } catch {}
    };
  }, [map, userPos, garagePos]);

  return null;
}

export default function NavigationScreen() {
  const {
    garages,
    selectedGarageId,
    setScreen,
    incomingCars,
    currentUser,
    cancelOffer,
    removeIncomingCar,
    setSelectedGarageId,
    offers,
    sessions,
    addSession,
    fetchAll,
    addWalletTopUp,
  } = useStore();

  const garage = garages.find((g) => g.id === selectedGarageId);
  const userPlateNav = normalizePlate(currentUser?.carPlate);
  const userPhoneClean = currentUser?.phone ? normalizePhone(currentUser.phone) : '';

  const isVipGarage = useMemo(() => {
    if (!garage) return false;
    const type = (garage as any).type || (garage as any).garage_type;
    return type === 'partner' || type === 'vip';
  }, [garage]);

  const myIncomingCar = useMemo(() => {
    return incomingCars.find(
      (c) =>
        c.garageId === selectedGarageId &&
        normalizePlate(c.carPlate) === userPlateNav &&
        c.status === 'coming',
    );
  }, [incomingCars, selectedGarageId, userPlateNav]);

  const myActiveSession = useMemo(() => {
    return sessions
      .filter(
        (sess) =>
          sess.status === 'active' &&
          (
            normalizePlate(sess.carPlate) === userPlateNav ||
            (userPhoneClean && normalizePhone((sess as any).customerPhone || '') === userPhoneClean)
          ),
      )
      .sort((a, b) => toMs(b.startTime) - toMs(a.startTime))[0];
  }, [sessions, userPlateNav, userPhoneClean]);

  const [userPos, setUserPos] = useState<{ lat: number; lng: number }>({
    lat: garage?.lat || 30.0444,
    lng: garage?.lng || 31.2357,
  });
  const [mapReady, setMapReady] = useState(false);
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [processingTopup, setProcessingTopup] = useState<string | null>(null);

  // 🚨 Geofence alarm states
  const [showGeofenceAlarm, setShowGeofenceAlarm] = useState(false);
  const [geofenceAlertSent, setGeofenceAlertSent] = useState(false);

  // 🛡️ اختيار الدرع (افتراضياً شغال)
  const [shieldEnabled, setShieldEnabled] = useState(true);

  // 🎯 حالة البدء التلقائي (للعرض بس)
  const [autoStartCountdown, setAutoStartCountdown] = useState<number | null>(null);

  const isMountedRef = useRef(true);
  const navigatedToSessionRef = useRef(false);

  const [isArriving, setIsArriving] = useState(false);

  // 🚨 Geofence alarm refs
  const alarmCtxRef = useRef<AudioContext | null>(null);
  const alarmOscRef = useRef<OscillatorNode | null>(null);
  const geofenceTriggeredRef = useRef(false);
  const geofenceWatchIdRef = useRef<number | null>(null);
  const alarmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 🎯 Auto-start refs
  const autoStartWatchIdRef = useRef<number | null>(null);
  const autoStartTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStartAnchorRef = useRef<{ lat: number; lng: number } | null>(null);
  const autoStartStartedAtRef = useRef<number | null>(null);
  const autoStartTriggeredRef = useRef(false);
  const shieldEnabledRef = useRef(shieldEnabled);

  useEffect(() => {
    shieldEnabledRef.current = shieldEnabled;
  }, [shieldEnabled]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      try {
        alarmOscRef.current?.stop();
        alarmCtxRef.current?.close();
      } catch {}
      alarmOscRef.current = null;
      alarmCtxRef.current = null;
      if (geofenceWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(geofenceWatchIdRef.current);
        geofenceWatchIdRef.current = null;
      }
      if (autoStartWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(autoStartWatchIdRef.current);
        autoStartWatchIdRef.current = null;
      }
      if (autoStartTimerRef.current) {
        clearInterval(autoStartTimerRef.current);
        autoStartTimerRef.current = null;
      }
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
      }
    };
  }, []);

  /* ─── 🚨 Alarm Sound Helpers ─── */
  const stopAlarmSound = useCallback(() => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    try {
      alarmOscRef.current?.stop();
      alarmCtxRef.current?.close();
    } catch {}
    alarmOscRef.current = null;
    alarmCtxRef.current = null;
    if (navigator.vibrate) {
      navigator.vibrate(0);
    }
  }, []);

  const startAlarmSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      alarmCtxRef.current = ctx;

      const beep = () => {
        if (!alarmCtxRef.current || alarmCtxRef.current.state === 'closed') return;
        const osc = alarmCtxRef.current.createOscillator();
        const gain = alarmCtxRef.current.createGain();
        osc.connect(gain);
        gain.connect(alarmCtxRef.current.destination);
        osc.frequency.value = 1200;
        osc.type = 'square';
        gain.gain.value = 0.8;
        osc.start();
        osc.stop(alarmCtxRef.current.currentTime + 0.15);
      };

      beep();
      alarmIntervalRef.current = setInterval(beep, 400);

      if (navigator.vibrate) {
        navigator.vibrate([300, 200, 300, 200, 300, 200, 300, 200, 300]);
      }
    } catch {}
  }, []);

  /* ─── 🚗 زر: وصلت للجراج وبدأ الركن ─── */
  const handleCarArrived = useCallback(async () => {
    if (isArriving) return;
    setIsArriving(true);

    try {
      if (!garage) return;

      const state = useStore.getState();
      const alreadyActive = state.sessions.find(
        (s) =>
          s.status === 'active' &&
          (
            normalizePlate(s.carPlate) === userPlateNav ||
            (userPhoneClean && normalizePhone((s as any).customerPhone || '') === userPhoneClean)
          ),
      );

      if (alreadyActive) {
        if (myIncomingCar) await removeIncomingCar(myIncomingCar.id);
        if (alreadyActive.garageId !== selectedGarageId) {
          setSelectedGarageId(alreadyActive.garageId);
        }
        navigatedToSessionRef.current = true;
        setScreen('session');
        return;
      }

      if (myIncomingCar) {
        const relatedOffer = offers.find(
          (o) =>
            o.carPlate === myIncomingCar.carPlate &&
            (o.status === 'pending' || o.status === 'accepted'),
        );
        if (relatedOffer) cancelOffer(relatedOffer.id);
      }

      const startTimeISO = new Date(getServerNow()).toISOString();

      // ✅ تمرير shieldEnabled للـ store عشان يخصم الدرع بعد بدء الجلسة
      await addSession({
        garageId: garage.id,
        carPlate: myIncomingCar?.carPlate || currentUser?.carPlate || '---',
        startTime: startTimeISO,
        status: 'active',
        source: 'app',
        agreedPrice: myIncomingCar?.agreedPrice || (garage as any).basePrice || 15,
        customerPhone: currentUser?.phone,
        customerName: currentUser?.name,
        startedBy: 'customer',
        incomingCarId: myIncomingCar?.id,
        shieldEnabled: shieldEnabledRef.current, // 🛡️ الدرع
      } as any);

      if (myIncomingCar) {
        await removeIncomingCar(myIncomingCar.id);
      }

      useStore.getState().setHasPaidBookingFee(false);

      navigatedToSessionRef.current = true;

      // رسالة مختلفة حسب تفعيل الدرع
      if (shieldEnabledRef.current) {
        toast.success('✅ بدأت الجلسة والحماية مفعّلة 🛡️', { duration: 3000 });
      } else {
        toast.success('✅ بدأت الجلسة بدون حماية', { duration: 3000 });
      }

      setScreen('session');
    } catch (err) {
      console.error('❌ خطأ:', err);
      toast.error('حدث خطأ، حاول مرة أخرى');
    } finally {
      setTimeout(() => {
        setIsArriving(false);
      }, 1500);
    }
  }, [
    garage,
    userPlateNav,
    userPhoneClean,
    myIncomingCar,
    offers,
    cancelOffer,
    currentUser,
    addSession,
    removeIncomingCar,
    selectedGarageId,
    setSelectedGarageId,
    setScreen,
    isArriving,
  ]);

  /* ─── ❌ زر: وصلت بس ملقتش مكان / العودة للرئيسية ─── */
  const handleNoSpaceFound = useCallback(async () => {
    try {
      if (myIncomingCar) {
        await removeIncomingCar(myIncomingCar.id);
      }
      setSelectedGarageId(null);
      setScreen('list');
    } catch (err) {
      setSelectedGarageId(null);
      setScreen('list');
    }
  }, [myIncomingCar, removeIncomingCar, setSelectedGarageId, setScreen]);

  /* 🧠 GPS positioning */
  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (!isMountedRef.current) return;
        setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }, []);

  /* ─── تحميل الخريطة ─── */
  useEffect(() => {
    const t = setTimeout(() => {
      if (isMountedRef.current) setMapReady(true);
    }, 200);
    return () => clearTimeout(t);
  }, []);

  /* ─── التوجيه التلقائي في حالة تحول الجلسة لنشطة ─── */
  useEffect(() => {
    if (!myActiveSession) {
      navigatedToSessionRef.current = false;
      geofenceTriggeredRef.current = false;
      setGeofenceAlertSent(false);
      setShowGeofenceAlarm(false);
      stopAlarmSound();
      return;
    }

    if (navigatedToSessionRef.current) return;
    navigatedToSessionRef.current = true;

    if (myActiveSession.garageId !== selectedGarageId) {
      setSelectedGarageId(myActiveSession.garageId);
    }

    setScreen('session');
  }, [myActiveSession, selectedGarageId, setSelectedGarageId, setScreen, stopAlarmSound]);

  /* ─── 🚨 مراقبة الجيوفينس أثناء الركنة النشطة (500 متر) ─── */
  useEffect(() => {
    if (!myActiveSession || !garage || geofenceAlertSent) {
      if (geofenceWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(geofenceWatchIdRef.current);
        geofenceWatchIdRef.current = null;
      }
      return;
    }

    const GEOFENCE_RADIUS_KM = 0.5; // 500 متر — آمن للـ GPS الضعيف

    geofenceWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (!isMountedRef.current) return;
        if (geofenceTriggeredRef.current) return;

        const dist = calculateDistance(
          pos.coords.latitude,
          pos.coords.longitude,
          garage.lat,
          garage.lng,
        );

        if (dist > GEOFENCE_RADIUS_KM) {
          geofenceTriggeredRef.current = true;
          setShowGeofenceAlarm(true);
          startAlarmSound();
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );

    return () => {
      if (geofenceWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(geofenceWatchIdRef.current);
        geofenceWatchIdRef.current = null;
      }
      stopAlarmSound();
    };
  }, [myActiveSession, garage, geofenceAlertSent, startAlarmSound, stopAlarmSound]);

  /* ─── 🚨 Geofence Alarm Choice Handler ─── */
  const handleGeofenceChoice = useCallback(
    async (isMeDriving: boolean) => {
      stopAlarmSound();
      setShowGeofenceAlarm(false);

      if (myActiveSession) {
        try {
          await supabase
            .from('sessions')
            .update({
              status: 'ended',
              endTime: new Date(getServerNow()).toISOString(),
            })
            .eq('id', myActiveSession.id);
        } catch (err) {
          console.error('Error ending session:', err);
        }
      }

      if (isMeDriving) {
        toast.success('تم إنهاء الجلسة بنجاح ✅', { duration: 3000 });
      } else {
        toast.error('⚠️ تم إرسال تنبيه أمان وإنهاء الجلسة!', { duration: 4000, icon: '🚨' });
      }

      setGeofenceAlertSent(true);
      geofenceTriggeredRef.current = false;

      setSelectedGarageId(null);
      setScreen('list');
    },
    [stopAlarmSound, myActiveSession, setSelectedGarageId, setScreen],
  );

  /* ─── 🎯 البدء التلقائي للجلسة بعد 120 ثانية ثبات ─── */
  useEffect(() => {
    if (!garage || myActiveSession || isArriving) {
      if (autoStartWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(autoStartWatchIdRef.current);
        autoStartWatchIdRef.current = null;
      }
      if (autoStartTimerRef.current) {
        clearInterval(autoStartTimerRef.current);
        autoStartTimerRef.current = null;
      }
      autoStartAnchorRef.current = null;
      autoStartStartedAtRef.current = null;
      setAutoStartCountdown(null);
      return;
    }

    if (!('geolocation' in navigator)) return;

    const handlePosition = (pos: GeolocationPosition) => {
      if (!isMountedRef.current) return;
      if (autoStartTriggeredRef.current) return;

      const curLat = pos.coords.latitude;
      const curLng = pos.coords.longitude;

      setUserPos({ lat: curLat, lng: curLng });

      const distFromGarage = calculateDistance(curLat, curLng, garage.lat, garage.lng);

      // 🔍 Debug: شوف المسافة والدقة في الـ Console
      console.log(
        `[AutoStart] 📍 المسافة: ${(distFromGarage * 1000).toFixed(0)}م | الدقة: ${pos.coords.accuracy.toFixed(0)}م | الحد: ${AUTO_START_DISTANCE_KM * 1000}م`
      );

      if (distFromGarage > AUTO_START_DISTANCE_KM) {
        if (autoStartAnchorRef.current) {
          autoStartAnchorRef.current = null;
          autoStartStartedAtRef.current = null;
          setAutoStartCountdown(null);
        }
        return;
      }

      if (!autoStartAnchorRef.current) {
        autoStartAnchorRef.current = { lat: curLat, lng: curLng };
        autoStartStartedAtRef.current = Date.now();
        setAutoStartCountdown(Math.ceil(AUTO_START_DURATION_MS / 1000));
        return;
      }

      const distFromAnchor = calculateDistance(
        curLat,
        curLng,
        autoStartAnchorRef.current.lat,
        autoStartAnchorRef.current.lng,
      );

      if (distFromAnchor > AUTO_START_MOVEMENT_KM) {
        autoStartAnchorRef.current = { lat: curLat, lng: curLng };
        autoStartStartedAtRef.current = Date.now();
        setAutoStartCountdown(Math.ceil(AUTO_START_DURATION_MS / 1000));
      }
    };

    autoStartWatchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );

    autoStartTimerRef.current = setInterval(() => {
      if (!isMountedRef.current) return;
      if (autoStartTriggeredRef.current) return;
      if (!autoStartStartedAtRef.current) return;

      const elapsed = Date.now() - autoStartStartedAtRef.current;
      const remaining = Math.max(0, Math.ceil((AUTO_START_DURATION_MS - elapsed) / 1000));
      setAutoStartCountdown(remaining);

      if (elapsed >= AUTO_START_DURATION_MS) {
        autoStartTriggeredRef.current = true;

        if (navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }

        const shieldMsg = shieldEnabledRef.current
          ? '✅ تم رصد وقوفك بالجراج — جاري بدء الركنة والحماية تلقائياً...'
          : '✅ تم رصد وقوفك بالجراج — جاري بدء الركنة...';

        toast.success(shieldMsg, {
          duration: 3500,
          icon: '🅿️',
        });

        handleCarArrived();
      }
    }, 1000);

    return () => {
      if (autoStartWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(autoStartWatchIdRef.current);
        autoStartWatchIdRef.current = null;
      }
      if (autoStartTimerRef.current) {
        clearInterval(autoStartTimerRef.current);
        autoStartTimerRef.current = null;
      }
    };
  }, [garage, myActiveSession, isArriving, handleCarArrived]);

  if (!garage) {
    return (
      <div className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-8 text-right dir-rtl">
        <div className="text-4xl mb-4">🔍</div>
        <p className="text-slate-400 text-sm font-bold text-center mb-6">
          لم يتم تحديد جراج للملاحة
        </p>
        <button
          type="button"
          onClick={() => setScreen('list')}
          className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black text-sm active:scale-95 transition-all border-0 cursor-pointer"
        >
          العودة للقائمة
        </button>
      </div>
    );
  }

  const distance = calculateDistance(
    userPos.lat, userPos.lng,
    garage.lat, garage.lng,
  );
  const minutes = distanceToMinutes(distance);
  const coordsText = `${garage.lat},${garage.lng}`;
  const walletBalance = Number(currentUser?.wallet ?? (currentUser as any)?.walletBalance ?? 0);

  const copyCoords = async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(coordsText);
        toast.success('تم نسخ الإحداثيات!');
      } else {
        const el = document.createElement('textarea');
        el.value = coordsText;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        toast.success('تم نسخ الإحداثيات!');
      }
    } catch {
      toast.error('فشل النسخ');
    }
  };

  const openExternalMaps = () => {
    if (!garage) return;
    openMapsWithSmartArrival(
      garage.lat,
      garage.lng,
      garage.name,
      () => {
        toast.success('🎉 وصلت عند الجراج! اضغط على زرار "وصلت للجراج وبدأ الركن" لتفعيل الحماية 🛡️', {
          duration: 6000,
          icon: '📍',
        });
      }
    );
  };

  const handleQuickTopup = async (tier: typeof TOPUP_TIERS[0]) => {
    if (!currentUser || processingTopup) return;
    setProcessingTopup(tier.id);

    try {
      const bonusAmount = tier.bonus ?? getBonusForAmount(tier.amount);
      await addWalletTopUp({
        userId: (currentUser as any).id,
        userPhone: currentUser.phone,
        phone: currentUser.phone,
        amount: tier.amount,
        bonus: bonusAmount,
        method: 'instapay',
        paymentMethod: 'instapay',
        payment_method: 'instapay',
        status: 'pending',
      } as any);

      toast.success(`تم طلب شحن ${tier.amount} ج + ${bonusAmount} ج بونص هدية 🎁! في انتظار التفعيل`, { duration: 4500 });
      setShowInsufficientModal(false);
    } catch (err) {
      console.error('Topup error:', err);
      toast.error('حدث خطأ، حاول مرة أخرى');
    } finally {
      setProcessingTopup(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full flex flex-col safe-top safe-bottom text-right relative dir-rtl"
      style={{ background: BRAND.navy, color: '#ffffff' }}
    >
      {/* ══ Header ══ */}
      <div className="flex items-center justify-between px-4 pt-12 pb-2 shrink-0">
        <button
          type="button"
          aria-label="الرجوع للقائمة"
          onClick={() => setScreen('list')}
          className="p-2.5 rounded-xl border cursor-pointer bg-white/5 active:scale-90 transition-all"
          style={{ borderColor: BRAND.border, color: '#fff' }}
        >
          <ArrowRight size={18} />
        </button>

        <h2 className="text-xs font-black flex items-center gap-1.5" style={{ color: '#ffffff' }}>
          <div className="animate-pulse">
            <Navigation size={15} style={{ color: BRAND.blue }} />
          </div>
          التوجيه للجراج
        </h2>

        <div className="w-10" />
      </div>

      {/* ══ Content ══ */}
      <div className="flex-1 px-4 pb-4 flex flex-col gap-3 overflow-y-auto">

        {/* 🏢 بطاقة اسم الجراج والمعلومات */}
        <div
          className="rounded-2xl p-4 shrink-0 border"
          style={{
            background: BRAND.navyLight,
            borderColor: BRAND.border,
          }}
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Clock size={15} style={{ color: BRAND.green }} />
              <span className="text-sm font-black font-mono" style={{ color: BRAND.green }}>
                {formatDuration(minutes)}
              </span>
              <span style={{ color: BRAND.border }}>·</span>
              <span className="text-xs font-mono font-bold" style={{ color: BRAND.slateMuted }}>
                {distance.toFixed(1)} كم
              </span>
            </div>

            <div className="text-right flex flex-col items-end">
              <div className="flex items-center gap-1.5">
                {isVipGarage && (
                  <span
                    className="text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5"
                    style={{ background: BRAND.green, color: BRAND.navy }}
                  >
                    <Zap size={9} />
                    VIP
                  </span>
                )}
                <span
                  style={{
                    color: '#ffffff',
                    fontSize: '15px',
                    fontWeight: 950,
                    display: 'block',
                    lineHeight: '1.2',
                  }}
                >
                  {garage.name}
                </span>
              </div>
              <div className="flex items-center gap-1 justify-end text-[10px] mt-1 font-bold" style={{ color: BRAND.slateMuted }}>
                <span>{garage.location}</span>
                <MapPin size={10} style={{ color: BRAND.slateMuted }} />
              </div>
            </div>
          </div>
        </div>

        {/* 🅿️ شارة المحفظة للمستخدم */}
        {isVipGarage && (
          <div
            className="rounded-2xl p-3 shrink-0 border flex items-center justify-between"
            style={{
              background: BRAND.greenLight,
              borderColor: BRAND.green + '40',
            }}
          >
            <div className="flex items-center gap-2">
              <Wallet size={16} style={{ color: BRAND.green }} />
              <div className="flex flex-col">
                <span className="text-[11px] font-black" style={{ color: BRAND.green }}>
                  رصيد محفظتك الحالي: {walletBalance} ج.م
                </span>
                <span className="text-[9px] font-bold" style={{ color: BRAND.slateMuted }}>
                  تم خصم {BOOKING_FEE} ج.م رسوم حجز لهذا الجراج
                </span>
              </div>
            </div>
            <span className="text-[10px] font-black flex items-center gap-1" style={{ color: BRAND.green }}>
              <Check size={12} /> تم الحجز
            </span>
          </div>
        )}

        {/* 🛡️ اختيار الدرع (قبل التوجيه) */}
        {!myActiveSession && (
          <div
            className="rounded-2xl p-3 shrink-0 border"
            style={{
              background: BRAND.navyLight,
              borderColor: shieldEnabled ? BRAND.green + '60' : BRAND.border,
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} style={{ color: shieldEnabled ? BRAND.green : BRAND.slateMuted }} />
                <span className="text-xs font-black" style={{ color: '#ffffff' }}>
                  🛡️ حماية الدرع
                </span>
              </div>
              <span className="text-[10px] font-bold" style={{ color: BRAND.slateMuted }}>
                (اختياري)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShieldEnabled(true)}
                className="py-2.5 rounded-xl font-black text-[11px] border transition-all active:scale-95 cursor-pointer"
                style={{
                  background: shieldEnabled ? BRAND.green : 'transparent',
                  borderColor: shieldEnabled ? BRAND.green : BRAND.border,
                  color: shieldEnabled ? BRAND.navy : BRAND.slateMuted,
                }}
              >
                ✅ تفعيل الدرع
              </button>
              <button
                type="button"
                onClick={() => setShieldEnabled(false)}
                className="py-2.5 rounded-xl font-black text-[11px] border transition-all active:scale-95 cursor-pointer"
                style={{
                  background: !shieldEnabled ? '#475569' : 'transparent',
                  borderColor: !shieldEnabled ? '#475569' : BRAND.border,
                  color: !shieldEnabled ? '#ffffff' : BRAND.slateMuted,
                }}
              >
                ❌ بدون درع
              </button>
            </div>
            <p className="text-[9px] font-bold text-center mt-2" style={{ color: BRAND.slateMuted }}>
              {shieldEnabled
                ? 'هيتم خصم رسوم الحماية عند بدء الركنة فقط'
                : 'الركنة بدون حماية إضافية'}
            </p>
          </div>
        )}

        {/* 🎯 شريط البدء التلقائي (يظهر لما العميل قريب من الجراج) */}
        {!myActiveSession && autoStartCountdown !== null && autoStartCountdown > 0 && (
          <div
            className="rounded-2xl p-3 shrink-0 border"
            style={{
              background: 'linear-gradient(135deg, rgba(140, 198, 63, 0.15) 0%, rgba(22, 163, 74, 0.1) 100%)',
              borderColor: BRAND.green + '60',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: BRAND.green }} />
                <span className="text-[11px] font-black" style={{ color: BRAND.green }}>
                  🅿️ تم رصد وصولك — بدء تلقائي للركنة
                </span>
              </div>
              <span className="text-sm font-black font-mono" style={{ color: BRAND.green }}>
                {autoStartCountdown}ث
              </span>
            </div>
            <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <div
                className="h-full transition-all duration-1000 ease-linear"
                style={{
                  background: BRAND.green,
                  width: `${((AUTO_START_DURATION_MS / 1000 - autoStartCountdown) / (AUTO_START_DURATION_MS / 1000)) * 100}%`,
                }}
              />
            </div>
            <p className="text-[9px] font-bold text-center mt-1.5" style={{ color: BRAND.slateMuted }}>
              فضل ثابت في مكانك لبدء الركنة تلقائياً
            </p>
          </div>
        )}

        {/* 🗺️ الخريطة */}
        <div
          className="w-full h-44 rounded-2xl overflow-hidden relative shrink-0 border"
          style={{ transform: 'translateZ(0)', borderColor: BRAND.border }}
        >
          {mapReady ? (
            <MapContainer
              key={`map-nav-${garage.id}`}
              center={[garage.lat || 30.0444, garage.lng || 31.2357]}
              zoom={15}
              style={{ width: '100%', height: '100%' }}
              zoomControl={false}
            >
              <TileLayer
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />
              <Marker position={[userPos.lat, userPos.lng]} icon={userIcon}>
                <Popup>موقعك الحالي 🚗</Popup>
              </Marker>
              <Marker position={[garage.lat, garage.lng]} icon={garageIcon}>
                <Popup>{garage.name} 🅿️</Popup>
              </Marker>
              <Polyline
                positions={[
                  [userPos.lat, userPos.lng],
                  [garage.lat, garage.lng],
                ]}
                color={BRAND.blue}
                weight={4}
                dashArray="8, 8"
              />
              <MapController
                userPos={[userPos.lat, userPos.lng]}
                garagePos={[garage.lat, garage.lng]}
              />
            </MapContainer>
          ) : (
            <div className="w-full h-full bg-slate-900 flex items-center justify-center">
              <div className="text-slate-500 text-xs font-bold animate-pulse">
                🗺️ جاري تحميل الخريطة...
              </div>
            </div>
          )}

          <div className="absolute top-3 left-3 border text-[9px] px-2.5 py-1 rounded-full z-[400] flex items-center gap-1.5 pointer-events-none" style={{ background: 'rgba(10,22,40,0.85)', borderColor: BRAND.border, color: BRAND.slateMuted }}>
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
            تتبع مباشر
          </div>
        </div>

        {/* 🚀 زر توجيه الخرائط الخارجية */}
        <div className="flex flex-col gap-1.5 shrink-0">
          <motion.button
            type="button"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={openExternalMaps}
            className="w-full relative overflow-hidden flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl cursor-pointer border-0 text-white font-black"
            style={{
              background: BRAND.blue,
              boxShadow: `0 4px 14px ${BRAND.blue}25`,
            }}
          >
            <Navigation size={16} color="#ffffff" className="animate-bounce shrink-0" />
            <span style={{ color: '#ffffff', fontSize: '14px', fontWeight: 950 }}>
              فتح في خرائط Google 🗺️🚀
            </span>
          </motion.button>

          <button
            type="button"
            onClick={copyCoords}
            className="flex items-center justify-center gap-1 text-[10px] py-0.5 border-0 bg-transparent cursor-pointer"
            style={{ color: BRAND.slateMuted }}
          >
            <Copy size={11} style={{ color: BRAND.slateMuted }} />
            <span>نسخ إحداثيات الجراج الجغرافية</span>
          </button>
        </div>

        {/* ✅ معلومات المركبة */}
        <div className="border rounded-2xl p-3.5 shrink-0 flex flex-col gap-3" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold" style={{ color: BRAND.slateMuted }}>
              المركبة الحالية الموجهة
            </span>
            <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border shadow-inner" style={{ borderColor: BRAND.border }}>
              <Car size={15} style={{ color: BRAND.blue }} />
              <span className="text-sm font-black font-mono tracking-widest text-white">
                {currentUser?.carPlate}
              </span>
            </div>
          </div>
        </div>

        {/* 🟢 الأزرار الرئيسية للتحكم بالركن والمغادرة */}
        {!myActiveSession && (
          <div className="flex flex-col gap-3 shrink-0 mt-2">
            {/* زر 1: وصلت للجراج وبدأ الركن */}
            <button
              type="button"
              onClick={handleCarArrived}
              disabled={isArriving}
              className="w-full py-4 rounded-2xl active:scale-95 transition-transform flex items-center justify-center gap-2 shrink-0 disabled:opacity-50 border-0 text-white cursor-pointer shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                boxShadow: `0 4px 18px rgba(22, 163, 74, 0.3)`,
              }}
            >
              <ShieldCheck size={20} color="#ffffff" />
              <span className="font-black text-white text-center text-sm sm:text-base">
                {isArriving ? '⏳ جاري بدء الجلسة...' : 'وصلت للجراج وبدأ الركن ✅'}
              </span>
            </button>

            {/* زر 2: وصلت بس ملقتش مكان */}
            <button
              type="button"
              onClick={handleNoSpaceFound}
              className="w-full py-3.5 rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0 border-0 cursor-pointer shadow-md"
              style={{
                background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
                boxShadow: '0 4px 14px rgba(220, 38, 38, 0.3)',
              }}
            >
              <XCircle size={18} color="#ffffff" />
              <span className="font-black text-xs sm:text-sm text-white">
                وصلت بس ملقتش مكان ❌
              </span>
            </button>

            {/* زر 3: العودة للرئيسية */}
            <button
              type="button"
              onClick={handleNoSpaceFound}
              className="w-full py-3.5 rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer border-0 shadow-md"
              style={{
                background: 'linear-gradient(135deg, #475569 0%, #334155 100%)',
                boxShadow: '0 4px 14px rgba(71, 85, 105, 0.3)',
              }}
            >
              <ArrowRight size={16} color="#ffffff" />
              <span className="font-black text-sm text-white">
                🏠 العودة للصفحة الرئيسية
              </span>
            </button>
          </div>
        )}
      </div>

      {/* 💳 Insufficient Wallet Modal */}
      <AnimatePresence>
        {showInsufficientModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 dir-rtl"
            style={{ background: 'rgba(10, 22, 40, 0.95)' }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-md rounded-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
              style={{ background: BRAND.navyLight, border: `1px solid ${BRAND.border}` }}
            >
              <div className="text-center">
                <div className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'rgba(239, 68, 68, 0.15)' }}>
                  <AlertCircle size={28} style={{ color: '#f87171' }} />
                </div>
                <h3 className="text-white font-black text-base mb-1">رصيد المحفظة غير كافٍ</h3>
                <p className="text-xs font-bold" style={{ color: BRAND.slateMuted }}>
                  اختر باقة شحن سريعة للمتابعة
                </p>
              </div>

              <div className="rounded-xl p-3 space-y-1.5 border" style={{ background: BRAND.navy, borderColor: BRAND.border }}>
                <div className="flex justify-between text-xs">
                  <span className="font-black text-white">{walletBalance} ج.م</span>
                  <span className="font-bold" style={{ color: BRAND.slateMuted }}>رصيدك الحالي:</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="font-black" style={{ color: BRAND.green }}>{BOOKING_FEE} ج.م</span>
                  <span className="font-bold" style={{ color: BRAND.slateMuted }}>رسوم الحجز المطلوبة:</span>
                </div>
                <div className="flex justify-between text-xs border-t pt-1.5" style={{ borderColor: BRAND.border }}>
                  <span className="font-black" style={{ color: '#f87171' }}>{Math.max(0, BOOKING_FEE - walletBalance)} ج.م</span>
                  <span className="font-bold" style={{ color: BRAND.slateMuted }}>الفرق المطلوب:</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[...TOPUP_TIERS].reverse().map((tier) => {
                  const calculatedBonus = tier.bonus ?? getBonusForAmount(tier.amount);
                  return (
                    <button
                      key={tier.id}
                      onClick={() => handleQuickTopup(tier)}
                      disabled={processingTopup !== null}
                      className="rounded-xl p-3 text-right cursor-pointer border transition-all active:scale-95 disabled:opacity-50 relative"
                      style={{
                        background: tier.popular ? BRAND.greenLight : BRAND.navy,
                        borderColor: tier.popular ? BRAND.green : BRAND.border,
                      }}
                    >
                      {tier.popular && (
                        <span
                          className="absolute -top-2 right-2 text-[8px] font-black px-1.5 py-0.5 rounded-full"
                          style={{ background: BRAND.green, color: BRAND.navy }}
                        >
                          الأفضل
                        </span>
                      )}
                      <div className="text-[10px] font-black mb-1" style={{ color: tier.popular ? BRAND.green : '#fff' }}>
                        {tier.label}
                      </div>
                      <div className="text-base font-black text-white mb-0.5">
                        {tier.amount} ج.م
                      </div>
                      <div className="text-[9px] font-bold" style={{ color: BRAND.green }}>
                        +{calculatedBonus} ج.م هدية 🎁
                      </div>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setShowInsufficientModal(false)}
                className="w-full py-2.5 rounded-xl cursor-pointer border bg-transparent font-black"
                style={{
                  borderColor: BRAND.border,
                  color: BRAND.slateMuted,
                  fontSize: '12px'
                }}
              >
                إلغاء
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 🚨 Geofence Alarm Overlay */}
      <AnimatePresence>
        {showGeofenceAlarm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] flex items-center justify-center p-4 dir-rtl"
            style={{ background: 'rgba(127, 29, 29, 0.95)' }}
          >
            <motion.div
              initial={{ scale: 0.8, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 30 }}
              className="w-full max-w-sm rounded-3xl p-6 space-y-5 text-center"
              style={{ background: BRAND.navyLight, border: '2px solid #ef4444' }}
            >
              <div
                className="w-16 h-16 rounded-full mx-auto flex items-center justify-center animate-pulse"
                style={{ background: 'rgba(239, 68, 68, 0.2)' }}
              >
                <AlertCircle size={36} style={{ color: '#ef4444' }} />
              </div>

              <div>
                <h3 className="text-white font-black text-lg mb-2">⚠️ تنبيه أمان!</h3>
                <p className="text-sm font-bold" style={{ color: '#fca5a5' }}>
                  تم رصد خروج المركبة من نطاق الجراج
                </p>
                <p className="text-xs font-bold mt-1" style={{ color: BRAND.slateMuted }}>
                  هل أنت من يقود السيارة الآن؟
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => handleGeofenceChoice(true)}
                  className="w-full py-3.5 rounded-2xl font-black text-sm active:scale-95 transition-all border-0 cursor-pointer text-white"
                  style={{
                    background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                    boxShadow: '0 4px 14px rgba(22, 163, 74, 0.3)',
                  }}
                >
                  ✅ أنا اللي سايق
                </button>
                <button
                  type="button"
                  onClick={() => handleGeofenceChoice(false)}
                  className="w-full py-3.5 rounded-2xl font-black text-sm active:scale-95 transition-all border-0 cursor-pointer text-white"
                  style={{
                    background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
                    boxShadow: '0 4px 14px rgba(220, 38, 38, 0.3)',
                  }}
                >
                  🚨 مش أنا - إرسال تنبيه أمان
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}