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
  Shield,
  ShieldOff,
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

// ✅ إضافة imports الدرع
import {
  initAudioContext,
  startShieldGPS,
  triggerIntenseAlarm,
  stopIntenseAlarm,
  destroyShield,
  registerShieldSession,
   startFakeAlerts,    // ← أضف
  stopFakeAlerts,
} from '../lib/shield';

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

const AUTO_START_RADIUS_M = 150;
const AUTO_START_STABILITY_MS = 3 * 60 * 1000;
const SHIELD_AUTO_FEE = 7;
const GPS_POLL_INTERVAL_MS = 1000;

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

const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
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
    endSession, // ✅ أضفنا endSession
    fetchAll,
    addWalletTopUp,
    deductWallet,
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

  const [shieldChoice, setShieldChoice] = useState<boolean>(true);
  const [stabilityStartMs, setStabilityStartMs] = useState<number | null>(null);
  const [stabilityElapsed, setStabilityElapsed] = useState<number>(0);
  const [isWithinRadius, setIsWithinRadius] = useState<boolean>(false);
  const [autoStarting, setAutoStarting] = useState<boolean>(false);

  // ✅ حالة شاشة الاختراق
  const [showBreach, setShowBreach] = useState(false);

  const isMountedRef = useRef(true);
  const navigatedToSessionRef = useRef(false);
  const isArrivingRef = useRef(false);
  const realtimeChannelRef = useRef<any>(null);
  const autoStartTriggeredRef = useRef(false);
  const gpsWatchIdRef = useRef<number | null>(null);
  const stabilityTickerRef = useRef<number | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /* ─── REALTIME & SYNC ─── */
  useEffect(() => {
    if (!userPlateNav && !userPhoneClean) return;

    let cancelled = false;

    const fastFetch = async () => {
      if (cancelled || !isMountedRef.current) return;
      try {
        await fetchAll();
      } catch (e) {
        console.error('Fetch error:', e);
      }
    };

    fastFetch();

    const isMySessionPayload = (row: any): boolean => {
      if (!row) return false;
      const plate = normalizePlate(row.car_plate || row.carPlate);
      const phone = normalizePhone(row.customer_phone || row.customerPhone || '');
      return (
        (!!userPlateNav && plate === userPlateNav) ||
        (!!userPhoneClean && phone === userPhoneClean)
      );
    };

    const channel = supabase.channel(`instant-nav-${userPlateNav || userPhoneClean}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions' },
        async (payload) => {
          const newRow = payload.new as any;
          if (isMySessionPayload(newRow) && newRow?.status === 'active') {
            await fastFetch();
            if (isMountedRef.current) {
              if (newRow.garage_id || newRow.garageId) {
                setSelectedGarageId(newRow.garage_id || newRow.garageId);
              }
              setScreen('session');
            }
          } else {
            fastFetch();
          }
        },
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fastFetch();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', fastFetch);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', fastFetch);
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [userPlateNav, userPhoneClean, fetchAll, setScreen, setSelectedGarageId]);

  /* ─── 🚗 زر: وصلت للجراج وبدأ الركن ─── */
  const handleCarArrived = useCallback(async () => {
    if (isArrivingRef.current) return;
    isArrivingRef.current = true;

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
  autoStarted: true,
  shieldAutoEnabled: shieldChoice,
  shieldCost: shieldChoice ? SHIELD_AUTO_FEE : 0,  // ✅ السطر ده هو الحل
} as any);

      if (myIncomingCar) {
        await removeIncomingCar(myIncomingCar.id);
      }

      useStore.getState().setHasPaidBookingFee(false);

      navigatedToSessionRef.current = true;
      toast.success('تم الوصول للجراج وبدأت الجلسة بنجاح ⏱️', { duration: 3000 });
      setScreen('session');
    } catch (err) {
      console.error('❌ خطأ:', err);
      toast.error('حدث خطأ، حاول مرة أخرى');
    } finally {
      setTimeout(() => {
        isArrivingRef.current = false;
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

  const handleAutoStartSession = useCallback(async () => {
    if (autoStartTriggeredRef.current || !garage || !isMountedRef.current) return;
    autoStartTriggeredRef.current = true;
    setAutoStarting(true);

    try {
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
        if (alreadyActive.garageId !== selectedGarageId) {
          setSelectedGarageId(alreadyActive.garageId);
        }
        navigatedToSessionRef.current = true;
        setScreen('session');
        return;
      }

      const startTimeISO = new Date(getServerNow()).toISOString();
// ✅ لو اختار الدرع، اخصم الرسوم الأول
let shieldCostForSession = 0;
if (shieldChoice) {
  const walletNow = Number(currentUser?.wallet ?? (currentUser as any)?.walletBalance ?? 0);
  if (walletNow >= SHIELD_AUTO_FEE) {
    try {
      await deductWallet(SHIELD_AUTO_FEE);
      shieldCostForSession = SHIELD_AUTO_FEE;
      toast.success(`تم خصم ${SHIELD_AUTO_FEE} ج.م لتفعيل الدرع 🛡️`, { duration: 2500 });
    } catch (e) {
      console.error('Shield deduction error:', e);
    }
  } else {
    toast.error(`رصيد غير كافٍ لتفعيل الدرع (${SHIELD_AUTO_FEE} ج.م) — تم بدء الجلسة بدون درع`, { duration: 3500 });
  }
}

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
  shieldCost: shieldCostForSession,  // ✅ السطر ده هو الحل
} as any);

      if (myIncomingCar) {
        try { await removeIncomingCar(myIncomingCar.id); } catch {}
      }

      useStore.getState().setHasPaidBookingFee(false);

      navigatedToSessionRef.current = true;

      const msg = shieldChoice
        ? '✅ تم بدء الجلسة والدرع تلقائياً 🛡️'
        : '✅ تم بدء الجلسة تلقائياً (بدون درع)';
      toast.success(msg, { duration: 4000, icon: '🚀' });

      setScreen('session');
    } catch (err) {
      console.error('❌ Auto-start error:', err);
      toast.error('فشل البدء التلقائي، حاول يدوياً');
      autoStartTriggeredRef.current = false;
    } finally {
      if (isMountedRef.current) setAutoStarting(false);
    }
  }, [
    garage,
    shieldChoice,
    userPlateNav,
    userPhoneClean,
    selectedGarageId,
    currentUser,
    myIncomingCar,
    addSession,
    removeIncomingCar,
    deductWallet,
    setSelectedGarageId,
    setScreen,
  ]);

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

  useEffect(() => {
    if (!garage || !('geolocation' in navigator)) return;
    if (myActiveSession) return;

    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        if (!isMountedRef.current) return;
        setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      (err) => {
        console.warn('GPS watch error:', err);
      },
      {
        enableHighAccuracy: true,
        maximumAge: GPS_POLL_INTERVAL_MS,
        timeout: 10000,
      }
    );

    gpsWatchIdRef.current = watchId;

    return () => {
      if (gpsWatchIdRef.current !== null) {
        try { navigator.geolocation.clearWatch(gpsWatchIdRef.current); } catch {}
        gpsWatchIdRef.current = null;
      }
    };
  }, [garage, myActiveSession]);

  useEffect(() => {
    if (!garage || myActiveSession || autoStartTriggeredRef.current) return;

    const distMeters = haversineMeters(userPos.lat, userPos.lng, garage.lat, garage.lng);
    const within = distMeters <= AUTO_START_RADIUS_M;

    setIsWithinRadius(within);

    if (within) {
      if (stabilityStartMs === null) {
        setStabilityStartMs(Date.now());
        setStabilityElapsed(0);
      }
    } else {
      if (stabilityStartMs !== null) {
        setStabilityStartMs(null);
        setStabilityElapsed(0);
      }
    }
  }, [userPos, garage, myActiveSession, stabilityStartMs]);

  useEffect(() => {
    if (stabilityStartMs === null) {
      if (stabilityTickerRef.current !== null) {
        window.clearInterval(stabilityTickerRef.current);
        stabilityTickerRef.current = null;
      }
      return;
    }

    const tick = () => {
      if (!isMountedRef.current) return;
      const elapsed = Date.now() - stabilityStartMs;
      setStabilityElapsed(elapsed);

      if (elapsed >= AUTO_START_STABILITY_MS && !autoStartTriggeredRef.current) {
        handleAutoStartSession();
      }
    };

    tick();
    stabilityTickerRef.current = window.setInterval(tick, 1000);

    return () => {
      if (stabilityTickerRef.current !== null) {
        window.clearInterval(stabilityTickerRef.current);
        stabilityTickerRef.current = null;
      }
    };
  }, [stabilityStartMs, handleAutoStartSession]);

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
      return;
    }

    if (navigatedToSessionRef.current) return;
    navigatedToSessionRef.current = true;

    if (myActiveSession.garageId !== selectedGarageId) {
      setSelectedGarageId(myActiveSession.garageId);
    }

    setScreen('session');
  }, [myActiveSession, selectedGarageId, setSelectedGarageId, setScreen]);

  // ═══════════════════════════════════════════════════════════
  // ✅ تفعيل الدرع تلقائياً في NavigationScreen
  // لو session نشط + shieldCost > 0 → شغّل الدرع في الخلفية
  // ═══════════════════════════════════════════════════════════
useEffect(() => {
  if (!myActiveSession || !garage) return;
  if ((myActiveSession.shieldCost ?? 0) <= 0) return;
  try { initAudioContext(); } catch {}
  const lat = (garage as any).lat ?? 30.0444;
  const lng = (garage as any).lng ?? 31.2357;
  let cancelled = false;
  registerShieldSession({
    sessionId: myActiveSession.id,
    phone: (myActiveSession as any).customerPhone || currentUser?.phone || '',
    garageId: garage.id,
    parkingLat: lat,
    parkingLng: lng,
  }).then((shieldId) => {
    if (cancelled || !shieldId) return;
    console.log('🛡️ Shield registered in DB:', shieldId);
    startShieldGPS({
      sessionId: myActiveSession.id,
      shieldId,
      parkingLat: lat,
      parkingLng: lng,
      onGeofenceBreach: () => {
        triggerIntenseAlarm();
        setShowBreach(true);
      },
    });
    startFakeAlerts();  // ← أضف السطر ده هنا
  });
  return () => {
    cancelled = true;
    destroyShield();
    stopFakeAlerts();   // ← أضف السطر ده هنا
    setShowBreach(false);
  };
}, [myActiveSession?.id, garage?.id]);


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

  const distMetersNow = haversineMeters(userPos.lat, userPos.lng, garage.lat, garage.lng);
  const stabilityRemainingMs = Math.max(0, AUTO_START_STABILITY_MS - stabilityElapsed);
  const stabilityRemainingSec = Math.ceil(stabilityRemainingMs / 1000);
  const stabilityPct = Math.min(100, (stabilityElapsed / AUTO_START_STABILITY_MS) * 100);

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

        {/* 🛡️ بنر اختيار الدرع + البدء التلقائي */}
        {!myActiveSession && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-3.5 shrink-0 border-2 relative overflow-hidden"
            style={{
              background: shieldChoice
                ? `linear-gradient(135deg, ${BRAND.greenLight} 0%, rgba(140,198,63,0.05) 100%)`
                : `linear-gradient(135deg, rgba(100,116,139,0.15) 0%, rgba(71,85,105,0.05) 100%)`,
              borderColor: shieldChoice ? BRAND.green + '60' : BRAND.border,
              boxShadow: shieldChoice
                ? `0 4px 20px rgba(140,198,63,0.15)`
                : '0 4px 12px rgba(0,0,0,0.2)',
            }}
          >
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5">
                {shieldChoice ? (
                  <Shield size={16} style={{ color: BRAND.green }} className="animate-pulse" />
                ) : (
                  <ShieldOff size={16} style={{ color: BRAND.slateMuted }} />
                )}
                <span
                  className="text-[12px] font-black"
                  style={{ color: shieldChoice ? BRAND.green : BRAND.slateMuted }}
                >
                  {shieldChoice ? 'الدرع مفعّل ✅' : 'الدرع غير مفعّل'}
                </span>
              </div>
              <span
                className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: 'rgba(10,22,40,0.6)',
                  color: BRAND.slateMuted,
                  border: `1px solid ${BRAND.border}`,
                }}
              >
                {SHIELD_AUTO_FEE} ج.م
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2.5">
              <button
                type="button"
                onClick={() => setShieldChoice(true)}
                disabled={autoStarting}
                className="py-2 rounded-xl font-black text-[11px] border-2 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                style={{
                  background: shieldChoice ? BRAND.green : 'transparent',
                  color: shieldChoice ? BRAND.navy : '#fff',
                  borderColor: shieldChoice ? BRAND.green : BRAND.border,
                }}
              >
                🛡️ تفعيل الدرع
              </button>
              <button
                type="button"
                onClick={() => setShieldChoice(false)}
                disabled={autoStarting}
                className="py-2 rounded-xl font-black text-[11px] border-2 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                style={{
                  background: !shieldChoice ? '#475569' : 'transparent',
                  color: '#fff',
                  borderColor: !shieldChoice ? '#475569' : BRAND.border,
                }}
              >
                ❌ بدون درع
              </button>
            </div>

            <div
              className="rounded-xl p-2.5 border"
              style={{
                background: 'rgba(10,22,40,0.6)',
                borderColor: BRAND.border,
              }}
            >
              {isWithinRadius ? (
                <>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-black" style={{ color: BRAND.green }}>
                      📍 داخل نطاق الجراج ({Math.round(distMetersNow)}م)
                    </span>
                    <span className="text-[11px] font-black font-mono" style={{ color: BRAND.green }}>
                      {autoStarting
                        ? '⏳ جاري البدء...'
                        : stabilityRemainingSec > 0
                        ? `${Math.floor(stabilityRemainingSec / 60)}:${(stabilityRemainingSec % 60).toString().padStart(2, '0')}`
                        : '✅'}
                    </span>
                  </div>

                  <div
                    className="w-full h-1.5 rounded-full overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.08)' }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: BRAND.green }}
                      animate={{ width: `${stabilityPct}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>

                  <p className="text-[9px] font-bold mt-1.5 leading-relaxed" style={{ color: BRAND.slateMuted }}>
                    {autoStarting
                      ? '🚀 جاري بدء الجلسة تلقائياً...'
                      : `استقر داخل الجراج لـ 3 دقائق لبدء الجلسة ${shieldChoice ? 'والدرع' : ''} تلقائياً`}
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black" style={{ color: BRAND.slateMuted }}>
                      📡 خارج نطاق الجراج
                    </span>
                    <span className="text-[11px] font-black font-mono text-white">
                      {Math.round(distMetersNow)}م
                    </span>
                  </div>
                  <p className="text-[9px] font-bold leading-relaxed" style={{ color: BRAND.slateMuted }}>
                    اقترب من الجراج لمسافة {AUTO_START_RADIUS_M}م لبدء العد التلقائي
                  </p>
                </>
              )}
            </div>
          </motion.div>
        )}

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
            <button
              type="button"
              onClick={handleCarArrived}
              disabled={isArrivingRef.current || autoStarting}
              className="w-full py-4 rounded-2xl active:scale-95 transition-transform flex items-center justify-center gap-2 shrink-0 disabled:opacity-50 border-0 text-white cursor-pointer shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                boxShadow: `0 4px 18px rgba(22, 163, 74, 0.3)`,
              }}
            >
              <ShieldCheck size={20} color="#ffffff" />
              <span className="font-black text-white text-center text-sm sm:text-base">
                وصلت للجراج وبدأ الركن ✅
              </span>
            </button>

            <button
              type="button"
              onClick={handleNoSpaceFound}
              disabled={autoStarting}
              className="w-full py-3.5 rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0 border-0 cursor-pointer shadow-md disabled:opacity-50"
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

            <button
              type="button"
              onClick={handleNoSpaceFound}
              disabled={autoStarting}
              className="w-full py-3.5 rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer border-0 shadow-md disabled:opacity-50"
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

      {/* ═══════════════════════════════════════════════════════════
          ✅ شاشة الاختراق — تظهر فوراً لو الدرع اكتشف خروج السيارة
          ═══════════════════════════════════════════════════════════ */}
      {showBreach && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-gray-900 border-2 border-red-500 p-6 text-center animate-pulse">
            <div className="text-6xl mb-4">🚨</div>
            <h2 className="text-2xl font-black text-red-500 mb-2">تحذير أمني!</h2>
            <p className="text-gray-300 mb-6 text-lg">
              السيارة بتتحرك من مكانها!
              <br />
              الدرع الذكي اكتشف خروج السيارة من النطاق الآمن
            </p>
            <div className="space-y-3">
              <button
                onClick={() => {
                  stopIntenseAlarm();
                  setShowBreach(false);
                  destroyShield();
                  if (myActiveSession) endSession(myActiveSession.id);
                  setScreen('list');
                }}
                className="w-full py-4 rounded-xl bg-green-600 text-white font-bold text-lg active:scale-95 transition-transform"
              >
                ✅ أنا اللي سايق
              </button>
              <button
                onClick={() => {
                  stopIntenseAlarm();
                  setShowBreach(false);
                  destroyShield();
                  if (myActiveSession) endSession(myActiveSession.id);
                  setScreen('list');
                }}
                className="w-full py-4 rounded-xl bg-red-600 text-white font-bold text-lg active:scale-95 transition-transform"
              >
                🚫 مش أنا
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}