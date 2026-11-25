// src/components/NavigationScreen.tsx
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
  ShieldOff,
  Navigation2,
  Radio,
  Crosshair,
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
import { calculateCostWithLoyalty } from '../utils/pricing';
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
import {
  initAudioContext,
  startShieldGPS,
  triggerIntenseAlarm,
  stopIntenseAlarm,
  destroyShield,
  registerShieldSession,
  startFakeAlerts,
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
const AUTO_START_LEAVE_RADIUS_M = 180; // Hysteresis buffer لمنع إلغاء العداد بسبب تذبذب الـ GPS
const MANUAL_SHIELD_MAX_RADIUS_M = 180;
const AUTO_START_STABILITY_MS = 3 * 60 * 1000;
const SHIELD_AUTO_FEE = 7;
const GPS_POLL_INTERVAL_MS = 1000;
const LAST_COORDS_STORAGE_KEY = 'parkn24_last_user_coords';
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
const loadSavedUserCoords = (): { lat: number; lng: number } | null => {
  try {
    const saved = localStorage.getItem(LAST_COORDS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (
        parsed &&
        typeof parsed.lat === 'number' &&
        Number.isFinite(parsed.lat) &&
        typeof parsed.lng === 'number' &&
        Number.isFinite(parsed.lng)
      ) {
        return { lat: parsed.lat, lng: parsed.lng };
      }
    }
  } catch {}
  return null;
};
function MapController({
  userPos,
  garagePos,
}: {
  userPos: [number, number];
  garagePos: [number, number];
}) {
  const map = useMap();
  const initialFitDoneRef = useRef(false);
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
    // لا نقوم بعمل fitBounds إلا في أول تحميل فقط لمنع قفز وتجميد الخريطة أثناء قيادة السيارة
    if (!initialFitDoneRef.current) {
      if (isValidCoord(userPos) && isValidCoord(garagePos)) {
        try {
          const bounds = L.latLngBounds([userPos, garagePos]);
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
          initialFitDoneRef.current = true;
        } catch {
          try {
            map.setView(garagePos, 15);
            initialFitDoneRef.current = true;
          } catch {}
        }
      } else if (isValidCoord(garagePos)) {
        try {
          map.setView(garagePos, 15);
          initialFitDoneRef.current = true;
        } catch {}
      }
    }
    return () => {
      clearTimeout(timer);
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
    endSession,
    addWalletTopUp,
    deductWallet,
  } = useStore();
  const userPlateNav = normalizePlate(currentUser?.carPlate);
  const userPhoneClean = currentUser?.phone ? normalizePhone(currentUser.phone) : '';
  const fallbackIncomingCar = useMemo(() => {
    return incomingCars.find(
      (c) =>
        (
          (userPlateNav && normalizePlate(c.carPlate) === userPlateNav) ||
          (userPhoneClean &&
            normalizePhone(c.customerPhone || (c as any).userPhone || '') === userPhoneClean)
        ) &&
        c.status === 'coming',
    );
  }, [incomingCars, userPlateNav, userPhoneClean]);
  const effectiveGarageId = useMemo(() => {
    if (selectedGarageId) return selectedGarageId;
    try {
      const saved = localStorage.getItem('selectedGarageId');
      if (saved) return saved;
    } catch {}
    if (fallbackIncomingCar?.garageId) return fallbackIncomingCar.garageId;
    return null;
  }, [selectedGarageId, fallbackIncomingCar]);
  useEffect(() => {
    if (!selectedGarageId && effectiveGarageId) {
      setSelectedGarageId(effectiveGarageId);
    }
  }, [selectedGarageId, effectiveGarageId, setSelectedGarageId]);
  const garage = garages.find((g) => g.id === effectiveGarageId);
  const isVipGarage = useMemo(() => {
    if (!garage) return false;
    const type = (garage as any).type || (garage as any).garage_type || garage.garageType;
    return type === 'partner' || type === 'vip';
  }, [garage]);
  const myIncomingCar = useMemo(() => {
    return incomingCars.find(
      (c) =>
        c.garageId === effectiveGarageId &&
        (
          (userPlateNav && normalizePlate(c.carPlate) === userPlateNav) ||
          (userPhoneClean &&
            normalizePhone(c.customerPhone || (c as any).userPhone || '') === userPhoneClean)
        ) &&
        c.status === 'coming',
    );
  }, [incomingCars, effectiveGarageId, userPlateNav, userPhoneClean]);
  const myActiveSession = useMemo(() => {
    return sessions
      .filter(
        (sess) =>
          sess.status === 'active' &&
          (
            (userPlateNav && normalizePlate(sess.carPlate) === userPlateNav) ||
            (userPhoneClean &&
              normalizePhone(
                (sess as any).customerPhone ||
                  (sess as any).userPhone ||
                  (sess as any).user_phone ||
                  '',
              ) === userPhoneClean)
          ),
      )
      .sort((a, b) => toMs(b.startTime) - toMs(a.startTime))[0];
  }, [sessions, userPlateNav, userPhoneClean]);
  const [hasRealGps, setHasRealGps] = useState<boolean>(() => Boolean(loadSavedUserCoords()));
  const [userPos, setUserPos] = useState<{ lat: number; lng: number }>(() => {
    const savedCoords = loadSavedUserCoords();
    if (savedCoords) return savedCoords;
    return {
      lat: 30.0444,
      lng: 31.2357,
    };
  });
  const [mapReady, setMapReady] = useState(false);
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [processingTopup, setProcessingTopup] = useState<string | null>(null);
  const storageTimerKey = garage ? `parkn24_auto_start_timer_${garage.id}` : null;
  const [shieldChoice, setShieldChoice] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('parkn24_shield_choice');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [stabilityStartMs, setStabilityStartMs] = useState<number | null>(() => {
    if (!garage) return null;
    try {
      const savedCoords = loadSavedUserCoords();
      if (!savedCoords) {
        localStorage.removeItem(`parkn24_auto_start_timer_${garage.id}`);
        return null;
      }
      const distNow = haversineMeters(savedCoords.lat, savedCoords.lng, garage.lat, garage.lng);
      if (distNow > AUTO_START_LEAVE_RADIUS_M) {
        localStorage.removeItem(`parkn24_auto_start_timer_${garage.id}`);
        return null;
      }
      const saved = localStorage.getItem(`parkn24_auto_start_timer_${garage.id}`);
      if (saved) {
        const parsed = Number(saved);
        if (Number.isFinite(parsed) && parsed > 0 && Date.now() - parsed < AUTO_START_STABILITY_MS) {
          return parsed;
        }
        localStorage.removeItem(`parkn24_auto_start_timer_${garage.id}`);
      }
    } catch {}
    return null;
  });
  const [stabilityElapsed, setStabilityElapsed] = useState<number>(() => {
    if (!garage) return 0;
    try {
      const savedCoords = loadSavedUserCoords();
      if (!savedCoords) return 0;
      const distNow = haversineMeters(savedCoords.lat, savedCoords.lng, garage.lat, garage.lng);
      if (distNow > AUTO_START_LEAVE_RADIUS_M) return 0;
      const saved = localStorage.getItem(`parkn24_auto_start_timer_${garage.id}`);
      if (saved) {
        const parsed = Number(saved);
        if (Number.isFinite(parsed) && parsed > 0 && Date.now() - parsed < AUTO_START_STABILITY_MS) {
          return Math.max(0, Date.now() - parsed);
        }
      }
    } catch {}
    return 0;
  });
  const [isWithinRadius, setIsWithinRadius] = useState<boolean>(false);
  const [autoStarting, setAutoStarting] = useState<boolean>(false);
  const [showBreach, setShowBreach] = useState(false);
  const isMountedRef = useRef(true);
  const navigatedToSessionRef = useRef(false);
  const isArrivingRef = useRef(false);
  const autoStartTriggeredRef = useRef(false);
  const gpsWatchIdRef = useRef<number | null>(null);
  const stabilityTickerRef = useRef<number | null>(null);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('parkn24_shield_choice', String(shieldChoice));
    } catch {}
  }, [shieldChoice]);
  /* ─── 🚗 زر: وصلت للجراج وبدأ الركن (مفحوص بدقة مع إصلاح سعر الساعة) ─── */
  const handleCarArrived = useCallback(async () => {
    if (isArrivingRef.current || autoStartTriggeredRef.current) return;
    isArrivingRef.current = true;
    try {
      if (!garage) return;
      if (storageTimerKey) {
        try { localStorage.removeItem(storageTimerKey); } catch {}
      }
      const state = useStore.getState();
      const alreadyActive = state.sessions.find(
        (s) =>
          s.status === 'active' &&
          (
            normalizePlate(s.carPlate) === userPlateNav ||
            (userPhoneClean &&
              normalizePhone(
                (s as any).customerPhone ||
                  (s as any).userPhone ||
                  (s as any).user_phone ||
                  '',
              ) === userPhoneClean)
          ),
      );
      if (alreadyActive) {
        if (myIncomingCar) await removeIncomingCar(myIncomingCar.id);
        if (alreadyActive.garageId !== effectiveGarageId) {
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
      const currentDistMeters = haversineMeters(userPos.lat, userPos.lng, garage.lat, garage.lng);
      let shieldCostForSession = 0;
      if (shieldChoice) {
        if (currentDistMeters > MANUAL_SHIELD_MAX_RADIUS_M) {
          toast.error(`عفواً! أنت خارج نطاق الجراج (أكثر من ${MANUAL_SHIELD_MAX_RADIUS_M}م) — تم بدء الجلسة بدون تفعيل الدرع 🛡️`, {
            duration: 4500,
          });
        } else {
          const walletNow = Number(currentUser?.wallet ?? (currentUser as any)?.walletBalance ?? 0);
          if (walletNow >= SHIELD_AUTO_FEE) {
            try {
              const deducted = await deductWallet(SHIELD_AUTO_FEE);
              if (deducted) {
                shieldCostForSession = SHIELD_AUTO_FEE;
                toast.success(`تم خصم ${SHIELD_AUTO_FEE} ج.م لتفعيل الدرع 🛡️`, { duration: 2500 });
              } else {
                shieldCostForSession = 0;
                toast.error('تعذر خصم رسوم الدرع — تم بدء الجلسة بدون درع', { duration: 3000 });
              }
            } catch (e) {
              console.error('Shield deduction error:', e);
              shieldCostForSession = 0;
            }
          } else {
            toast.error(`رصيد غير كافٍ لتفعيل الدرع (${SHIELD_AUTO_FEE} ج.م) — تم بدء الجلسة بدون درع`, { duration: 3500 });
          }
        }
      }
      // 💰 إصلاح ثغرة الإيرادات: فحص السعر المتفق عليه أو السعر الأساسي للجراج (basePrice / pricePerHour)
      const agreedNum = Number(myIncomingCar?.agreedPrice);
      const garageRateNum = Number(
        garage.basePrice ??
        garage.pricePerHour ??
        (garage as any).price ??
        15
      );
      const resolvedPricePerHour = agreedNum > 0 ? agreedNum : (garageRateNum > 0 ? garageRateNum : 15);
      await addSession({
        garageId: garage.id,
        carPlate: myIncomingCar?.carPlate || currentUser?.carPlate || '---',
        startTime: startTimeISO,
        parking_lat: garage.lat,
        parking_lng: garage.lng,
        status: 'active',
        source: 'app',
        agreedPrice: resolvedPricePerHour,
        userPhone: currentUser?.phone,
        customerPhone: currentUser?.phone,
        customerName: currentUser?.name,
        startedBy: 'customer',
        incomingCarId: myIncomingCar?.id,
        autoStarted: false,
        shieldAutoEnabled: shieldCostForSession > 0,
        shieldCost: shieldCostForSession,
      } as any);
      if (myIncomingCar) {
        await removeIncomingCar(myIncomingCar.id);
      }
      useStore.getState().setHasPaidBookingFee(false);
      navigatedToSessionRef.current = true;
      toast.success('تم الوصول للجراج وبدأت الجلسة بنجاح ⏱️', { duration: 3000 });
      setScreen('session');
    } catch (err) {
      console.error('❌ خطأ في بدء الجلسة:', err);
      toast.error('حدث خطأ، حاول مرة أخرى');
    } finally {
      setTimeout(() => {
        isArrivingRef.current = false;
      }, 1500);
    }
  }, [
    garage,
    userPos,
    userPlateNav,
    userPhoneClean,
    myIncomingCar,
    offers,
    cancelOffer,
    currentUser,
    addSession,
    removeIncomingCar,
    deductWallet,
    shieldChoice,
    effectiveGarageId,
    setSelectedGarageId,
    setScreen,
    storageTimerKey,
  ]);
  /* ─── ❌ زر: وصلت بس ملقتش مكان / العودة للرئيسية ─── */
  const handleNoSpaceFound = useCallback(async () => {
    if (storageTimerKey) {
      try { localStorage.removeItem(storageTimerKey); } catch {}
    }
    try {
      if (myIncomingCar) {
        await removeIncomingCar(myIncomingCar.id);
      }
      setSelectedGarageId(null);
      localStorage.removeItem('selectedGarageId');
      setScreen('list');
    } catch (err) {
      setSelectedGarageId(null);
      localStorage.removeItem('selectedGarageId');
      setScreen('list');
    }
  }, [myIncomingCar, removeIncomingCar, setSelectedGarageId, setScreen, storageTimerKey]);
  /* ─── ⏱️ البدء التلقائي الذكي للجلسة عند الاستقرار داخل الجراج ─── */
  const handleAutoStartSession = useCallback(async () => {
    if (autoStartTriggeredRef.current || isArrivingRef.current || !garage || !isMountedRef.current) return;
    const currentDistMeters = haversineMeters(userPos.lat, userPos.lng, garage.lat, garage.lng);
    if (!hasRealGps || currentDistMeters > AUTO_START_LEAVE_RADIUS_M) {
      setIsWithinRadius(false);
      setStabilityStartMs(null);
      setStabilityElapsed(0);
      if (storageTimerKey) {
        try { localStorage.removeItem(storageTimerKey); } catch {}
      }
      return;
    }
    autoStartTriggeredRef.current = true;
    setAutoStarting(true);
    if (storageTimerKey) {
      try { localStorage.removeItem(storageTimerKey); } catch {}
    }
    try {
      const state = useStore.getState();
      const alreadyActive = state.sessions.find(
        (s) =>
          s.status === 'active' &&
          (
            normalizePlate(s.carPlate) === userPlateNav ||
            (userPhoneClean &&
              normalizePhone(
                (s as any).customerPhone ||
                  (s as any).userPhone ||
                  (s as any).user_phone ||
                  '',
              ) === userPhoneClean)
          ),
      );
      if (alreadyActive) {
        if (alreadyActive.garageId !== effectiveGarageId) {
          setSelectedGarageId(alreadyActive.garageId);
        }
        navigatedToSessionRef.current = true;
        setScreen('session');
        return;
      }
      const startTimeISO = new Date(getServerNow()).toISOString();
      let shieldCostForSession = 0;
      if (shieldChoice && currentDistMeters <= AUTO_START_LEAVE_RADIUS_M) {
        const walletNow = Number(currentUser?.wallet ?? (currentUser as any)?.walletBalance ?? 0);
        if (walletNow >= SHIELD_AUTO_FEE) {
          try {
            const deducted = await deductWallet(SHIELD_AUTO_FEE);
            if (deducted) {
              shieldCostForSession = SHIELD_AUTO_FEE;
              toast.success(`تم خصم ${SHIELD_AUTO_FEE} ج.م لتفعيل الدرع 🛡️`, { duration: 2500 });
            } else {
              shieldCostForSession = 0;
              toast.error('تعذر خصم رسوم الدرع — تم بدء الجلسة بدون درع', { duration: 3000 });
            }
          } catch (e) {
            console.error('Shield deduction error:', e);
            shieldCostForSession = 0;
          }
        } else {
          toast.error(`رصيد غير كافٍ لتفعيل الدرع (${SHIELD_AUTO_FEE} ج.م) — تم بدء الجلسة بدون درع`, { duration: 3500 });
        }
      }
      // 💰 إصلاح ثغرة الإيرادات في البدء التلقائي:
      const agreedNum = Number(myIncomingCar?.agreedPrice);
      const garageRateNum = Number(
        garage.basePrice ??
        garage.pricePerHour ??
        (garage as any).price ??
        15
      );
      const resolvedPricePerHour = agreedNum > 0 ? agreedNum : (garageRateNum > 0 ? garageRateNum : 15);
      await addSession({
        garageId: garage.id,
        carPlate: myIncomingCar?.carPlate || currentUser?.carPlate || '---',
        startTime: startTimeISO,
        parking_lat: garage.lat,
        parking_lng: garage.lng,
        status: 'active',
        source: 'app',
        agreedPrice: resolvedPricePerHour,
        userPhone: currentUser?.phone,
        customerPhone: currentUser?.phone,
        customerName: currentUser?.name,
        startedBy: 'customer',
        incomingCarId: myIncomingCar?.id,
        autoStarted: true,
        shieldAutoEnabled: shieldCostForSession > 0,
        shieldCost: shieldCostForSession,
      } as any);
      if (myIncomingCar) {
        try { await removeIncomingCar(myIncomingCar.id); } catch {}
      }
      useStore.getState().setHasPaidBookingFee(false);
      navigatedToSessionRef.current = true;
      const msg = shieldCostForSession > 0
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
    userPos,
    hasRealGps,
    shieldChoice,
    userPlateNav,
    userPhoneClean,
    effectiveGarageId,
    currentUser,
    myIncomingCar,
    addSession,
    removeIncomingCar,
    deductWallet,
    setSelectedGarageId,
    setScreen,
    storageTimerKey,
  ]);
  /* ─── 🚨 إنهاء الجلسة من شاشة اختراق الدرع مع حساب التكلفة الفعلية ─── */
  const handleBreachEndSession = useCallback(async () => {
    stopIntenseAlarm();
    stopFakeAlerts();
    setShowBreach(false);
    destroyShield();
    if (myActiveSession) {
      const startMs = toMs(myActiveSession.startTime);
      const elapsedSec = startMs > 0 ? Math.max(0, Math.floor((getServerNow() - startMs) / 1000)) : 0;
      const isFreeSession = Boolean(
        myActiveSession.isFirstFreeSession ??
        (myActiveSession as any).isFreeSession ??
        (myActiveSession as any).is_first_free_session ??
        false
      );
      const rate = Number(
        myActiveSession.agreedPrice ??
        garage?.basePrice ??
        garage?.pricePerHour ??
        (garage as any)?.price ??
        15
      );
      const pricing = calculateCostWithLoyalty(elapsedSec, rate, isFreeSession);
      const freeMinutesApplied = isFreeSession
        ? (elapsedSec <= 1800 ? Math.floor(elapsedSec / 60) : 30)
        : 0;
      await endSession(myActiveSession.id, pricing.cost, 'cash', freeMinutesApplied);
    }
    setScreen('list');
  }, [myActiveSession, garage, endSession, setScreen]);
  /* 🧠 نظام الـ GPS المتقدم مع فلتر الاهتزاز لمنع التقطيع */
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (!isMountedRef.current) return;
        const coords = { lat: p.coords.latitude, lng: p.coords.longitude };
        setUserPos(coords);
        setHasRealGps(true);
        try {
          localStorage.setItem(LAST_COORDS_STORAGE_KEY, JSON.stringify(coords));
        } catch {}
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
        const newLat = p.coords.latitude;
        const newLng = p.coords.longitude;
        setHasRealGps(true);
        setUserPos((prev) => {
          // فلترة التذبذب: لا نُحدّث الحالة إلا إذا تحركت السيارة 3 أمتار حقيقية
          const moveDelta = haversineMeters(prev.lat, prev.lng, newLat, newLng);
          if (moveDelta < 3.0) return prev;
          const nextCoords = { lat: newLat, lng: newLng };
          try {
            localStorage.setItem(LAST_COORDS_STORAGE_KEY, JSON.stringify(nextCoords));
          } catch {}
          return nextCoords;
        });
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
  /* 🎯 مراقبة ثبات السيارة داخل النطاق مع Hysteresis لمنع التصفير المفاجئ */
  useEffect(() => {
    if (!garage || !hasRealGps || myActiveSession || autoStartTriggeredRef.current) return;
    const distMeters = haversineMeters(userPos.lat, userPos.lng, garage.lat, garage.lng);
    const within = distMeters <= AUTO_START_RADIUS_M;
    if (within) {
      setIsWithinRadius(true);
      if (stabilityStartMs === null) {
        const now = Date.now();
        setStabilityStartMs(now);
        setStabilityElapsed(0);
        if (storageTimerKey) {
          try { localStorage.setItem(storageTimerKey, String(now)); } catch {}
        }
      }
    } else if (distMeters > AUTO_START_LEAVE_RADIUS_M) {
      // لا نلغي المؤقت إلا إذا تجاوز 65م (Buffer) لحماية السائق من التذبذبات اللحظية
      setIsWithinRadius(false);
      if (stabilityStartMs !== null) {
        setStabilityStartMs(null);
        setStabilityElapsed(0);
        if (storageTimerKey) {
          try { localStorage.removeItem(storageTimerKey); } catch {}
        }
      }
    }
  }, [userPos, hasRealGps, garage, myActiveSession, stabilityStartMs, storageTimerKey]);
  useEffect(() => {
    if (stabilityStartMs === null) {
      if (stabilityTickerRef.current !== null) {
        window.clearInterval(stabilityTickerRef.current);
        stabilityTickerRef.current = null;
      }
      return;
    }
    const checkAndTick = () => {
      if (!isMountedRef.current) return;
      const elapsed = Date.now() - stabilityStartMs;
      setStabilityElapsed(elapsed);
      if (elapsed >= AUTO_START_STABILITY_MS && !autoStartTriggeredRef.current) {
        if (storageTimerKey) {
          try { localStorage.removeItem(storageTimerKey); } catch {}
        }
        handleAutoStartSession();
      }
    };
    checkAndTick();
    stabilityTickerRef.current = window.setInterval(checkAndTick, 1000);
    const handleVisibilityOrFocus = () => {
      checkAndTick();
    };
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    return () => {
      if (stabilityTickerRef.current !== null) {
        window.clearInterval(stabilityTickerRef.current);
        stabilityTickerRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [stabilityStartMs, handleAutoStartSession, storageTimerKey]);
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
    if (myActiveSession.garageId !== effectiveGarageId) {
      setSelectedGarageId(myActiveSession.garageId);
    }
    setScreen('session');
  }, [myActiveSession, effectiveGarageId, setSelectedGarageId, setScreen]);
  // ═══════════════════════════════════════════════════════════
  // ✅ تفعيل الدرع الذكي تلقائياً (في حال البقاء على شاشة التوجيه)
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!myActiveSession || !garage) return;
    if (navigatedToSessionRef.current) return;
    if ((myActiveSession.shieldCost ?? 0) <= 0) return;
    try { initAudioContext(); } catch {}
    const lat = (garage as any).lat ?? 30.0444;
    const lng = (garage as any).lng ?? 31.2357;
    let cancelled = false;
    registerShieldSession({
      sessionId: myActiveSession.id,
      phone:
        (myActiveSession as any).customerPhone ||
        (myActiveSession as any).userPhone ||
        currentUser?.phone ||
        '',
      garageId: garage.id,
      parkingLat: lat,
      parkingLng: lng,
    }).then((shieldId) => {
      if (cancelled || !shieldId) return;
      startFakeAlerts();
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
    });
    return () => {
      cancelled = true;
      if (!navigatedToSessionRef.current) {
        stopFakeAlerts();
        destroyShield();
      }
      setShowBreach(false);
    };
  }, [myActiveSession?.id, garage?.id, currentUser?.phone]);
  if (!garage) {
    return (
      <div className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-8 text-right dir-rtl">
        <div className="text-4xl mb-4">🔍</div>
        <p className="text-slate-400 text-sm font-bold text-center mb-6">
          لم يتم تحديد جراج للملاحة
        </p>
        <button
          type="button"
          onClick={() => {
            setSelectedGarageId(null);
            localStorage.removeItem('selectedGarageId');
            setScreen('list');
          }}
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
      garage.id,
      () => {
        toast.success('🎉 وصلت عند الجراج! اضغط على زرار "وصلت للجراج وبدأ الركن" لتفعيل الحماية 🛡️', {
          duration: 6000,
          icon: '📍',
        });
      },
      garage.location
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
      <div className="flex items-center justify-between px-4 pt-10 pb-2 shrink-0">
        <button
          type="button"
          aria-label="الرجوع للقائمة"
          onClick={() => {
            if (storageTimerKey) {
              try { localStorage.removeItem(storageTimerKey); } catch {}
            }
            setSelectedGarageId(null);
            localStorage.removeItem('selectedGarageId');
            setScreen('list');
          }}
          className="p-2 rounded-xl border cursor-pointer bg-white/5 active:scale-90 transition-all"
          style={{ borderColor: BRAND.border, color: '#fff' }}
        >
          <ArrowRight size={18} />
        </button>
        <h2 className="text-xs font-black flex items-center gap-1.5 text-white">
          <div className="animate-pulse">
            <Navigation size={15} style={{ color: BRAND.blue }} />
          </div>
          التوجيه ورادار الجراج
        </h2>
        <div className="w-8" />
      </div>
      {/* ══ Content ══ */}
      <div className="flex-1 px-3.5 pb-4 flex flex-col gap-2.5 overflow-y-auto">
        {/* 🚀 بانر التوجيه الخارجي لخرائط جوجل */}
        {!myActiveSession && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.97 }}
            onClick={openExternalMaps}
            className="w-full relative overflow-hidden flex items-center justify-between py-3.5 px-4 rounded-2xl cursor-pointer border-0 text-white shadow-xl"
            style={{
              background: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)',
              boxShadow: '0 6px 20px rgba(29, 78, 216, 0.45)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0 border border-white/25">
                <Navigation2 size={22} className="text-white animate-bounce" />
              </div>
              <div className="flex flex-col text-right">
                <span className="font-black text-white text-base leading-tight">
                  اضغط هنا وتوجه للجراج 
                </span>
                <span className="text-[10px] font-bold text-blue-200 mt-0.5">
                  توجيه مباشر ودقيق عبر الـ GPS
                </span>
              </div>
            </div>
            <div className="bg-white/10 p-2 rounded-xl border border-white/20">
              <ArrowRight size={18} className="text-white" />
            </div>
          </motion.button>
        )}
        {/* 🏢 بطاقة اسم الجراج والمعلومات */}
        <div
          className="rounded-2xl p-3 shrink-0 border"
          style={{
            background: BRAND.navyLight,
            borderColor: BRAND.border,
          }}
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Clock size={14} style={{ color: BRAND.green }} />
              <span className="text-xs font-black font-mono" style={{ color: BRAND.green }}>
                {formatDuration(minutes)}
              </span>
              <span style={{ color: BRAND.border }}>·</span>
              <span className="text-xs font-mono font-bold" style={{ color: BRAND.slateMuted }}>
                {distMetersNow < 1000 ? `${Math.round(distMetersNow)} م` : `${distance.toFixed(1)} كم`}
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
                <span className="text-sm font-black text-white leading-tight">
                  {garage.name}
                </span>
              </div>
              <div className="flex items-center gap-1 justify-end text-[10px] mt-0.5 font-bold" style={{ color: BRAND.slateMuted }}>
                <span>{garage.location}</span>
                <MapPin size={10} style={{ color: BRAND.slateMuted }} />
              </div>
            </div>
          </div>
        </div>
        {/* 🛡️ بنر رادار الدرع الذكي */}
        {!myActiveSession && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-3 shrink-0 border-2 relative"
            style={{
              background: shieldChoice
                ? `linear-gradient(135deg, ${BRAND.greenLight} 0%, rgba(140,198,63,0.05) 100%)`
                : `linear-gradient(135deg, rgba(100,116,139,0.15) 0%, rgba(71,85,105,0.05) 100%)`,
              borderColor: shieldChoice ? BRAND.green + '60' : BRAND.border,
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                {shieldChoice ? (
                  <ShieldCheck size={18} style={{ color: BRAND.green }} />
                ) : (
                  <ShieldOff size={18} style={{ color: BRAND.slateMuted }} />
                )}
                <span
                  className="text-xs font-black tracking-wide"
                  style={{ color: shieldChoice ? BRAND.green : BRAND.slateMuted }}
                >
                  {shieldChoice ? 'الدرع الذكي مفعّل ✅' : 'الدرع الذكي غير مفعّل'}
                </span>
              </div>
              <span
                className="text-[10px] font-black px-2 py-0.5 rounded"
                style={{
                  background: 'rgba(10,22,40,0.6)',
                  color: BRAND.green,
                  border: `1px solid ${BRAND.green}40`,
                }}
              >
                {SHIELD_AUTO_FEE} ج.م
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              <button
                type="button"
                onClick={() => {
                  setShieldChoice(true);
                  if (!isWithinRadius) {
                    toast(`سيتم تفعيل الدرع فور دخول نطاق الجراج (${AUTO_START_RADIUS_M}م) 📍`, { icon: '🛡️', duration: 3000 });
                  }
                }}
                disabled={autoStarting}
                className="py-1.5 rounded-xl font-black text-[10px] border active:scale-95 transition-all cursor-pointer disabled:opacity-50"
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
                className="py-1.5 rounded-xl font-black text-[10px] border active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                style={{
                  background: !shieldChoice ? '#475569' : 'transparent',
                  color: '#fff',
                  borderColor: !shieldChoice ? '#475569' : BRAND.border,
                }}
              >
                ❌ بدون درع
              </button>
            </div>
            {/* بطاقة فحص القرب والرادار الجغرافي */}
            <div
              className="rounded-xl p-2 border text-right"
              style={{
                background: 'rgba(10,22,40,0.75)',
                borderColor: BRAND.border,
              }}
            >
              {isWithinRadius ? (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-black flex items-center gap-1" style={{ color: BRAND.green }}>
                      <Radio size={11} className="text-emerald-400 animate-pulse" />
                      داخل نطاق الجراج ({Math.round(distMetersNow)}م)
                    </span>
                    <span className="text-[10px] font-black font-mono" style={{ color: BRAND.green }}>
                      {autoStarting
                        ? '⏳ جاري البدء...'
                        : stabilityRemainingSec > 0
                        ? `${Math.floor(stabilityRemainingSec / 60)}:${(stabilityRemainingSec % 60).toString().padStart(2, '0')}`
                        : '✅ جاهز'}
                    </span>
                  </div>
                  <div
                    className="w-full h-1.5 rounded-full overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.08)' }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: 'linear-gradient(90deg, #16a34a, #8cc63f)' }}
                      animate={{ width: `${stabilityPct}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold flex items-center gap-1" style={{ color: BRAND.slateMuted }}>
                    <Crosshair size={11} className="text-sky-400" />
                    اقترب للمسافة ({AUTO_START_RADIUS_M}م) لبدء العد التلقائي
                  </span>
                  <span className="text-[10px] font-black font-mono text-sky-300">
                    {Math.round(distMetersNow)}م
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
        {/* 🅿️ شارة المحفظة للمستخدم */}
        {isVipGarage && (
          <div
            className="rounded-2xl p-2.5 shrink-0 border flex items-center justify-between"
            style={{
              background: BRAND.greenLight,
              borderColor: BRAND.green + '40',
            }}
          >
            <div className="flex items-center gap-2">
              <Wallet size={15} style={{ color: BRAND.green }} />
              <div className="flex flex-col">
                <span className="text-[10px] font-black" style={{ color: BRAND.green }}>
                  رصيد محفظتك الحالي: {walletBalance} ج.م
                </span>
              </div>
            </div>
            <span className="text-[9px] font-black flex items-center gap-1" style={{ color: BRAND.green }}>
              <Check size={11} /> تم الحجز
            </span>
          </div>
        )}
        {/* 🗺️ الخريطة التفاعلية */}
        <div
          className="w-full h-36 rounded-2xl overflow-hidden relative shrink-0 border"
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
                attribution='&copy; OpenStreetMap'
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
        </div>
        {/* 🚀 زر نسخ الإحداثيات */}
        <div className="flex flex-col gap-1 shrink-0">
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
        <div className="border rounded-2xl p-2.5 shrink-0 flex items-center justify-between" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
          <span className="text-[10px] font-bold" style={{ color: BRAND.slateMuted }}>
            المركبة الحالية
          </span>
          <div className="flex items-center gap-2 bg-white/5 px-2.5 py-1 rounded-lg border" style={{ borderColor: BRAND.border }}>
            <Car size={14} style={{ color: BRAND.blue }} />
            <span className="text-xs font-black font-mono text-white">
              {currentUser?.carPlate}
            </span>
          </div>
        </div>
        {/* 🟢 الأزرار الرئيسية للتحكم بالركن والمغادرة */}
        {!myActiveSession && (
          <div className="flex flex-col gap-2 shrink-0 mt-1 pb-4">
            <button
              type="button"
              onClick={handleCarArrived}
              disabled={isArrivingRef.current || autoStarting}
              className="w-full py-3.5 rounded-2xl active:scale-95 transition-transform flex items-center justify-center gap-2 shrink-0 disabled:opacity-50 border-0 text-white cursor-pointer shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                boxShadow: `0 4px 18px rgba(22, 163, 74, 0.3)`,
              }}
            >
              <ShieldCheck size={18} color="#ffffff" />
              <span className="font-black text-white text-center text-sm">
                وصلت للجراج وبدأ الركن ✅
              </span>
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleNoSpaceFound}
                disabled={autoStarting || isArrivingRef.current}
                className="py-3 rounded-xl active:scale-95 transition-all flex items-center justify-center gap-1.5 shrink-0 border-0 cursor-pointer shadow-md disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
                }}
              >
                <XCircle size={15} color="#ffffff" />
                <span className="font-black text-[11px] text-white">
                  ملقتش مكان ❌
                </span>
              </button>
              <button
                type="button"
                onClick={handleNoSpaceFound}
                disabled={autoStarting || isArrivingRef.current}
                className="py-3 rounded-xl active:scale-95 transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer border-0 shadow-md disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #475569 0%, #334155 100%)',
                }}
              >
                <ArrowRight size={15} color="#ffffff" />
                <span className="font-black text-[11px] text-white">
                  الرئيسية 🏠
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
      {/* 💳 Modal الرصيد غير الكافي */}
      <AnimatePresence>
        {showInsufficientModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 dir-rtl bg-black/80"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="w-full max-w-md rounded-3xl p-5 space-y-3"
              style={{ background: BRAND.navyLight, border: `1px solid ${BRAND.border}` }}
            >
              <div className="text-center">
                <div className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center bg-red-500/10">
                  <AlertCircle size={24} className="text-red-400" />
                </div>
                <h3 className="text-white font-black text-sm mb-1">رصيد المحفظة غير كافٍ</h3>
                <p className="text-[11px] font-bold text-slate-400">
                  اختر باقة شحن سريعة للمتابعة
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[...TOPUP_TIERS].reverse().map((tier) => (
                  <button
                    key={tier.id}
                    onClick={() => handleQuickTopup(tier)}
                    disabled={processingTopup !== null}
                    className="rounded-xl p-2.5 text-right cursor-pointer border transition-all active:scale-95 text-white"
                    style={{ background: BRAND.navy, borderColor: BRAND.border }}
                  >
                    <div className="text-[10px] font-black text-slate-300">{tier.label}</div>
                    <div className="text-sm font-black text-white">{tier.amount} ج.م</div>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowInsufficientModal(false)}
                className="w-full py-2 rounded-xl text-xs font-black text-slate-400 border border-slate-700 bg-transparent"
              >
                إلغاء
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* 🚨 شاشة الإنذار للاختراق بتصميم تكتيكي متقدم */}
      {showBreach && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
          style={{
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 text-center border-2 border-red-500"
            style={{
              background: 'linear-gradient(135deg, #1a0505 0%, #0a1628 100%)',
              boxShadow: '0 0 60px rgba(239,68,68,0.6), 0 0 120px rgba(239,68,68,0.2)',
              animation: 'pulse 1s ease-in-out infinite',
            }}
          >
            <div className="text-6xl mb-3">🚨</div>
            <h2 className="text-2xl font-black text-red-400 mb-2">تنبيه أمني!</h2>
            <p className="text-sm text-gray-300 mb-6 leading-relaxed">
              سيارتك خرجت من نطاق الأمان حول الجراج
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleBreachEndSession}
                className="w-full py-3.5 rounded-xl font-black text-white text-sm active:scale-95 transition-all"
                style={{
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  boxShadow: '0 4px 16px rgba(34,197,94,0.4)',
                }}
              >
                ✅ أنا اللي سايق
              </button>
              <button
                onClick={handleBreachEndSession}
                className="w-full py-3.5 rounded-xl font-black text-white text-sm active:scale-95 transition-all"
                style={{
                  background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                  boxShadow: '0 4px 16px rgba(239,68,68,0.4)',
                }}
              >
                🚔 مش أنا — !
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}