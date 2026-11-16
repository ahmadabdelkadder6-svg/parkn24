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

import {
  initAudioContext,
  startShieldGPS,
  triggerIntenseAlarm,
  stopIntenseAlarm,
  destroyShield,
  registerShieldSession,
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
    endSession,
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

  const storageTimerKey = garage ? `parkn24_auto_start_timer_${garage.id}` : null;

  const [shieldChoice, setShieldChoice] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('parkn24_shield_choice');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  // ✅ استرجاع وقت بداية التواجد بالجراج المقفول من localStorage للوقاية من الـ Refresh
  const [stabilityStartMs, setStabilityStartMs] = useState<number | null>(() => {
    if (!garage) return null;
    try {
      const saved = localStorage.getItem(`parkn24_auto_start_timer_${garage.id}`);
      if (saved) {
        const parsed = Number(saved);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      }
    } catch {}
    return null;
  });

  const [stabilityElapsed, setStabilityElapsed] = useState<number>(() => {
    if (!garage) return 0;
    try {
      const saved = localStorage.getItem(`parkn24_auto_start_timer_${garage.id}`);
      if (saved) {
        const parsed = Number(saved);
        if (Number.isFinite(parsed) && parsed > 0) {
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

  useEffect(() => {
    try {
      localStorage.setItem('parkn24_shield_choice', String(shieldChoice));
    } catch {}
  }, [shieldChoice]);

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

      if (storageTimerKey) {
        try { localStorage.removeItem(storageTimerKey); } catch {}
      }

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
        autoStarted: true,
        shieldAutoEnabled: shieldChoice,
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
    deductWallet,
    shieldChoice,
    selectedGarageId,
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

  const handleAutoStartSession = useCallback(async () => {
    if (autoStartTriggeredRef.current || !garage || !isMountedRef.current) return;
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
        shieldCost: shieldCostForSession,
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
    storageTimerKey,
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

  // ✅ متابعة وتخزين الـ GPS والتواجد في نطاق 150 متر مع الحفظ بـ localStorage
  useEffect(() => {
    if (!garage || myActiveSession || autoStartTriggeredRef.current) return;

    const distMeters = haversineMeters(userPos.lat, userPos.lng, garage.lat, garage.lng);
    const within = distMeters <= AUTO_START_RADIUS_M;

    setIsWithinRadius(within);

    if (within) {
      if (stabilityStartMs === null) {
        const now = Date.now();
        setStabilityStartMs(now);
        setStabilityElapsed(0);
        if (storageTimerKey) {
          try { localStorage.setItem(storageTimerKey, String(now)); } catch {}
        }
      }
    } else {
      if (stabilityStartMs !== null) {
        setStabilityStartMs(null);
        setStabilityElapsed(0);
        if (storageTimerKey) {
          try { localStorage.removeItem(storageTimerKey); } catch {}
        }
      }
    }
  }, [userPos, garage, myActiveSession, stabilityStartMs, storageTimerKey]);

  // ✅ عداد الوقت المستمر المقاوم للـ Refresh وللخروج من التطبيق (Visibility / Focus listener)
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

    if (myActiveSession.garageId !== selectedGarageId) {
      setSelectedGarageId(myActiveSession.garageId);
    }

    setScreen('session');
  }, [myActiveSession, selectedGarageId, setSelectedGarageId, setScreen]);

  // ═══════════════════════════════════════════════════════════
  // ✅ تفعيل الدرع تلقائياً
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
      destroyShield();
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
          التوجيه للجراج
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
                  افتح خرائط جوجل وتوجه للجراج 🚀
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

        {/* 🛡️ بنر الدرع الذكي */}
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
                onClick={() => setShieldChoice(true)}
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

            <div
              className="rounded-xl p-2 border text-right"
              style={{
                background: 'rgba(10,22,40,0.6)',
                borderColor: BRAND.border,
              }}
            >
              {isWithinRadius ? (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-black" style={{ color: BRAND.green }}>
                      📍 داخل نطاق الجراج ({Math.round(distMetersNow)}م)
                    </span>
                    <span className="text-[10px] font-black font-mono" style={{ color: BRAND.green }}>
                      {autoStarting
                        ? '⏳ جاري البدء...'
                        : stabilityRemainingSec > 0
                        ? `${Math.floor(stabilityRemainingSec / 60)}:${(stabilityRemainingSec % 60).toString().padStart(2, '0')}`
                        : '✅'}
                    </span>
                  </div>

                  <div
                    className="w-full h-1 rounded-full overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.08)' }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: BRAND.green }}
                      animate={{ width: `${stabilityPct}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold" style={{ color: BRAND.slateMuted }}>
                    اقترب للمسافة ({AUTO_START_RADIUS_M}م) لبدء العد التلقائي
                  </span>
                  <span className="text-[10px] font-black font-mono text-white">
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

        {/* 🗺️ الخريطة */}
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
                disabled={autoStarting}
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
                disabled={autoStarting}
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

      {/* 🚨 شاشة الانذار للاختراق */}
      {showBreach && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-gray-900 border-2 border-red-500 p-5 text-center">
            <div className="text-5xl mb-3">🚨</div>
            <h2 className="text-xl font-black text-red-500 mb-2">تحذير أمني!</h2>
            <p className="text-gray-300 mb-5 text-sm">
              السيارة بتتحرك من مكانها!
              <br />
              الدرع الذكي اكتشف خروج السيارة من النطاق الآمن
            </p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  stopIntenseAlarm();
                  setShowBreach(false);
                  destroyShield();
                  if (myActiveSession) endSession(myActiveSession.id);
                  setScreen('list');
                }}
                className="w-full py-3 rounded-xl bg-green-600 text-white font-bold text-sm active:scale-95 transition-transform"
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
                className="w-full py-3 rounded-xl bg-red-600 text-white font-bold text-sm active:scale-95 transition-transform"
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