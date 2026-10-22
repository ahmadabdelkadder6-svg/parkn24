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
  Gift,
  Zap,
  Wallet,
  AlertCircle,
  Check,
  Home,
  ShieldCheck,
} from 'lucide-react';
import {
  useStore,
  normalizePlate,
  normalizePhone,
  getServerNow,
  BOOKING_FEE,
  haversineDistance,
  TOPUP_TIERS,
} from '../store';
import {
  calculateDistance,
  distanceToMinutes,
  formatDuration,
} from '../utils/distance';
import toast from 'react-hot-toast';
import { sendCarComingPush, cancelScheduledPush } from '../lib/pushManager';

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
  blueSoft: 'rgba(22, 86, 184, 0.08)',
  green: '#8cc63f',
  greenDark: '#6ea62a',
  greenLight: 'rgba(140, 198, 63, 0.12)',
  navy: '#0a1628',
  navyLight: '#111e36',
  slate: '#64748b',
  slateMuted: '#94a3b8',
  border: 'rgba(255, 255, 255, 0.08)',
};

const CANCEL_WINDOW_SECONDS = 30;
const GPS_DEADBAND_METERS = 5;
const VIP_GEOFENCE_METERS = 100;
const AUTO_CHARGE_DELAY_SECONDS = 180; // 3 دقائق ثبات للخصم التلقائي

const getBonusForAmount = (amount: number): number => {
  if (amount >= 250) return 50;
  if (amount >= 100) return 15;
  if (amount >= 50) return 5;
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

const getDistanceMeters = (
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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
    chargeBookingFee, // ✅ تم استخراج الدالة لخصم الرصيد بوضوح
    refundBookingFee,
    addWalletTopUp,
    updateWalletBalance,
    isFirstFreeSession,
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
  const [cancelTimeLeft, setCancelTimeLeft] = useState(CANCEL_WINDOW_SECONDS);
  const [canCancel, setCanCancel] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [pushStatus, setPushStatus] = useState<'waiting' | 'sent' | 'cancelled'>('waiting');

  const [showArrivalOverlay, setShowArrivalOverlay] = useState(false);
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [feeCharged, setFeeCharged] = useState(false);
  const [processingTopup, setProcessingTopup] = useState<string | null>(null);

  const [stationarySeconds, setStationarySeconds] = useState(0);
  const [isInsideGeofence, setIsInsideGeofence] = useState(false);

  const isMountedRef = useRef(true);
  const userPosRef = useRef(userPos);
  const currentUserRef = useRef(currentUser);
  const lastCarIdRef = useRef<string | null>(null);
  const screenEnteredRef = useRef(getServerNow());
  const navigatedToSessionRef = useRef(false);
  const isArrivingRef = useRef(false);
  const isCancellingRef = useRef(false);
  const pushSentRef = useRef(false);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeChannelRef = useRef<any>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const lastStableCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  const feeChargedRef = useRef(false);
  const geofenceEntryTimeRef = useRef<number | null>(null);
  const outsideGeofenceCountRef = useRef<number>(0);
  const myActiveSessionRef = useRef(myActiveSession);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    userPosRef.current = userPos;
  }, [userPos]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    myActiveSessionRef.current = myActiveSession;
  }, [myActiveSession]);

  /* ─── REALTIME ─── */
  useEffect(() => {
    if (!userPlateNav && !userPhoneClean) return;

    let cancelled = false;

    const fastFetch = async () => {
      if (cancelled || !isMountedRef.current) return;
      try {
        await fetchAll();
      } catch (e) {
        console.error('❌ fetch error:', e);
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incoming_cars' },
        () => {
          fastFetch();
        },
      )
      .subscribe();

    realtimeChannelRef.current = channel;
    pollingIntervalRef.current = setInterval(fastFetch, 1500);

    const handleFocus = () => fastFetch();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fastFetch();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [userPlateNav, userPhoneClean, fetchAll, setScreen, setSelectedGarageId]);

  /* ─── 💰 خصم رسوم الحجز VIP (مضمون فوراً محلياً وفي قاعدة البيانات) ─── */
  const handleChargeVipFee = useCallback(async (): Promise<boolean> => {
    if (!isVipGarage || feeChargedRef.current || !currentUserRef.current || !garage) return true;

    const user = currentUserRef.current;
    const rawPhone = user.phone || '';
    const cleanPhone = normalizePhone(rawPhone);
    const userId = (user as any).id;

    const currentBalance = Number(user.wallet ?? (user as any).walletBalance ?? 0);

    if (currentBalance < BOOKING_FEE) {
      if (isMountedRef.current) setShowInsufficientModal(true);
      return false;
    }

    try {
      const newBalance = Math.max(0, currentBalance - BOOKING_FEE);

      // 1️⃣ تحديث فوري للحالة المحلية بالـ Zustand لمنع التأخير بالواجهة
      useStore.setState((state) => ({
        currentUser: state.currentUser
          ? { ...state.currentUser, wallet: newBalance }
          : null,
      }));

      // 2️⃣ تنفيذ دالة الـ Store الرسمية إذا كانت موجودة
      if (typeof chargeBookingFee === 'function') {
        try {
          await chargeBookingFee({
            userPhone: rawPhone,
            garageId: garage.id,
            amount: BOOKING_FEE,
          });
        } catch (e) {
          console.warn('chargeBookingFee method warn:', e);
        }
      }

      // 3️⃣ تحديث مباشر شامل لقاعدة البيانات Supabase
      try {
        if (userId) {
          await supabase.from('users').update({ wallet: newBalance }).eq('id', userId);
        }
        if (rawPhone) {
          await supabase.from('users').update({ wallet: newBalance }).eq('phone', rawPhone);
        }
        if (cleanPhone && cleanPhone !== rawPhone) {
          await supabase.from('users').update({ wallet: newBalance }).eq('phone', cleanPhone);
        }
      } catch (sbErr) {
        console.error('Supabase direct update error:', sbErr);
      }

      feeChargedRef.current = true;
      if (isMountedRef.current) setFeeCharged(true);

      fetchAll().catch(() => {});

      toast.success(`تم خصم ${BOOKING_FEE} ج.م رسوم الحجز بنجاح 💰`, { duration: 3500 });
      return true;
    } catch (err) {
      console.error('❌ Fee charge exception:', err);
      toast.error('حدث خطأ أثناء خصم رسوم الحجز');
      return false;
    }
  }, [isVipGarage, garage, chargeBookingFee, fetchAll]);

  /* ─── 🚗 بدء جلسة الركن ─── */
  const handleCarArrived = useCallback(async () => {
    if (isArrivingRef.current || isCancellingRef.current) return;
    isArrivingRef.current = true;

    try {
      if (isVipGarage && !feeChargedRef.current) {
        const charged = await handleChargeVipFee();
        if (!charged) {
          isArrivingRef.current = false;
          return;
        }
      }

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
        agreedPrice: myIncomingCar?.agreedPrice || garage.hourlyRate,
        customerPhone: currentUser?.phone,
        customerName: currentUser?.name,
        startedBy: 'customer',
        incomingCarId: myIncomingCar?.id,
        bookingFeePaid: isVipGarage ? BOOKING_FEE : 0,
      } as any);

      if (myIncomingCar) {
        await removeIncomingCar(myIncomingCar.id);
      }

      setShowArrivalOverlay(false);
      navigatedToSessionRef.current = true;
      setScreen('session');
    } catch (err) {
      console.error('❌ خطأ:', err);
      toast.error('حدث خطأ، حاول مرة أخرى');
    } finally {
      setTimeout(() => {
        isArrivingRef.current = false;
      }, 2000);
    }
  }, [
    isVipGarage,
    handleChargeVipFee,
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

  /* ─── ⚡ الخصم التلقائي عند انتهاء 3 دقائق ─── */
  const executeAutoCharge = useCallback(async () => {
    if (feeChargedRef.current || !currentUserRef.current || isArrivingRef.current) return;

    isArrivingRef.current = true;
    try {
      const charged = await handleChargeVipFee();
      if (charged) {
        toast.success('تم الخصم التلقائي (3ج) وبدء الركنة بعد 3 دقائق ثبات 🎯', { duration: 4000 });
        isArrivingRef.current = false;
        await handleCarArrived();
      } else {
        isArrivingRef.current = false;
      }
    } catch (err) {
      isArrivingRef.current = false;
    }
  }, [handleChargeVipFee, handleCarArrived]);

  /* 🧠 ─── GPS Tracking ─── */
  const handleGpsUpdate = useCallback((p: GeolocationPosition) => {
    if (!isMountedRef.current) return;
    const newLat = p.coords.latitude;
    const newLng = p.coords.longitude;

    if (lastStableCoordsRef.current === null) {
      lastStableCoordsRef.current = { lat: newLat, lng: newLng };
      setUserPos({ lat: newLat, lng: newLng });
    } else {
      const distanceMoved = getDistanceMeters(
        lastStableCoordsRef.current.lat,
        lastStableCoordsRef.current.lng,
        newLat,
        newLng
      );

      if (distanceMoved >= GPS_DEADBAND_METERS) {
        lastStableCoordsRef.current = { lat: newLat, lng: newLng };
        setUserPos({ lat: newLat, lng: newLng });
      }
    }
  }, []);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (!isMountedRef.current) return;
        const newLat = p.coords.latitude;
        const newLng = p.coords.longitude;
        lastStableCoordsRef.current = { lat: newLat, lng: newLng };
        setUserPos({ lat: newLat, lng: newLng });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
    );

    const id = navigator.geolocation.watchPosition(
      handleGpsUpdate,
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 },
    );

    return () => {
      navigator.geolocation.clearWatch(id);
    };
  }, [handleGpsUpdate]);

  /* ⏱️ ─── العداد الزمني للـ 3 دقائق ثبات ─── */
  useEffect(() => {
    if (!garage || !isVipGarage) return;

    const interval = setInterval(() => {
      if (!isMountedRef.current || feeChargedRef.current || myActiveSessionRef.current) return;

      const distMeters = haversineDistance(userPos.lat, userPos.lng, garage.lat, garage.lng);
      const inside = distMeters <= VIP_GEOFENCE_METERS;

      if (inside) {
        outsideGeofenceCountRef.current = 0;

        if (!geofenceEntryTimeRef.current) {
          geofenceEntryTimeRef.current = getServerNow();
          setIsInsideGeofence(true);
          setShowArrivalOverlay(true);
          toast.success('🎯 تم الوصول لمحيط الجراج! بدأ عداد الـ 3 دقائق للخصم التلقائي (3ج)', {
            id: 'geofence-enter',
            duration: 4000,
          });
        }

        const elapsedMs = getServerNow() - geofenceEntryTimeRef.current;
        const elapsedSec = Math.floor(elapsedMs / 1000);
        setStationarySeconds(elapsedSec);

        if (elapsedSec >= AUTO_CHARGE_DELAY_SECONDS && !feeChargedRef.current) {
          executeAutoCharge();
        }
      } else {
        if (geofenceEntryTimeRef.current) {
          outsideGeofenceCountRef.current += 1;
          if (outsideGeofenceCountRef.current >= 15) {
            geofenceEntryTimeRef.current = null;
            outsideGeofenceCountRef.current = 0;
            setIsInsideGeofence(false);
            setStationarySeconds(0);
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [garage, isVipGarage, userPos, executeAutoCharge]);

  /* ─── تحميل الخريطة ─── */
  useEffect(() => {
    const t = setTimeout(() => {
      if (isMountedRef.current) setMapReady(true);
    }, 200);
    return () => clearTimeout(t);
  }, []);

  /* ─── مؤقت الإلغاء (30 ثانية) ─── */
  useEffect(() => {
    if (!myIncomingCar) {
      setCancelTimeLeft(CANCEL_WINDOW_SECONDS);
      setCanCancel(true);
      return;
    }

    screenEnteredRef.current = getServerNow();
    setCancelTimeLeft(CANCEL_WINDOW_SECONDS);
    setCanCancel(true);

    const interval = window.setInterval(() => {
      const elapsed = Math.floor((getServerNow() - screenEnteredRef.current) / 1000);
      const left = Math.max(0, CANCEL_WINDOW_SECONDS - elapsed);
      if (isMountedRef.current) {
        setCancelTimeLeft(left);
        if (left <= 0) {
          setCanCancel(false);
          window.clearInterval(interval);
        }
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [myIncomingCar?.id]);

  /* ─── إرسال Push للجراج ─── */
  useEffect(() => {
    if (!myIncomingCar || !garage) return;

    if (lastCarIdRef.current !== myIncomingCar.id) {
      pushSentRef.current = false;
      lastCarIdRef.current = myIncomingCar.id;
      setPushStatus('waiting');
    }

    if (pushSentRef.current) {
      setPushStatus('sent');
      return;
    }

    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);

    const elapsed = Math.floor((getServerNow() - screenEnteredRef.current) / 1000);
    const msLeft = Math.max(0, (CANCEL_WINDOW_SECONDS - elapsed) * 1000);

    pushTimerRef.current = setTimeout(async () => {
      const freshState = useStore.getState();
      const stillComing = freshState.incomingCars.find(
        (c) => c.id === myIncomingCar.id && c.status === 'coming',
      );

      if (!stillComing || pushSentRef.current) {
        if (isMountedRef.current) setPushStatus('cancelled');
        return;
      }

      try {
        pushSentRef.current = true;
        const dist = calculateDistance(
          userPosRef.current.lat, userPosRef.current.lng,
          garage.lat, garage.lng,
        );
        const estimatedMinutes = distanceToMinutes(dist);

        await sendCarComingPush({
          garageId: garage.id,
          carPlate: myIncomingCar.carPlate,
          estimatedMinutes: Math.max(1, estimatedMinutes),
          customerName: currentUserRef.current?.name,
          agreedPrice: myIncomingCar.agreedPrice,
        });

        if (isMountedRef.current) setPushStatus('sent');
      } catch (err) {
        console.error('❌ Push error:', err);
        pushSentRef.current = false;
        if (isMountedRef.current) setPushStatus('waiting');
      }
    }, msLeft);

    return () => {
      if (pushTimerRef.current) {
        clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
    };
  }, [myIncomingCar?.id, selectedGarageId, garage]);

  /* ─── الانتقال اللحظي الفوري لشاشة العداد ─── */
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

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    toast.success('بدأ حساب الركن الآن! ⏱️', { icon: '🚗', duration: 2500 });
    setScreen('session');
  }, [myActiveSession, selectedGarageId, setSelectedGarageId, setScreen]);

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
  const walletBalance = currentUser?.wallet || (currentUser as any)?.walletBalance || 0;

  const remainingAutoChargeSeconds = Math.max(0, AUTO_CHARGE_DELAY_SECONDS - stationarySeconds);
  const autoChargeMin = Math.floor(remainingAutoChargeSeconds / 60);
  const autoChargeSec = remainingAutoChargeSeconds % 60;
  const formattedCountdown = `${autoChargeMin}:${autoChargeSec.toString().padStart(2, '0')}`;

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
    const url = `https://www.google.com/maps/dir/?api=1&destination=${garage.lat},${garage.lng}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCancelBooking = async () => {
    if (isCancellingRef.current || isArrivingRef.current) return;
    if (!currentUser || !myIncomingCar) return;

    try {
      isCancellingRef.current = true;
      if (pushTimerRef.current) {
        clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
      pushSentRef.current = true;
      if (isMountedRef.current) setPushStatus('cancelled');

      if (pushStatus === 'sent' && garage) {
        await cancelScheduledPush(garage.id, myIncomingCar.carPlate);
      }

      const activeOffer = offers.find(
        (o) =>
          o.userId === currentUser.phone &&
          (o.status === 'pending' || o.status === 'accepted'),
      );
      if (activeOffer) cancelOffer(activeOffer.id);

      await removeIncomingCar(myIncomingCar.id);
      toast.success('تم إلغاء الحجز، يمكنك اختيار جراج آخر 🚗');
      setSelectedGarageId(null);
      setScreen('list');
    } catch (err) {
      console.error('Cancel booking error:', err);
      toast.error('حدث خطأ أثناء إلغاء الحجز');
    } finally {
      isCancellingRef.current = false;
    }
  };

  const handleRefundAndExit = async () => {
    if (!currentUser) return;

    try {
      if (feeChargedRef.current) {
        await refundBookingFee({
          userPhone: currentUser.phone,
          garageId: garage.id,
          amount: BOOKING_FEE,
        });
        toast.success(`تم استرداد ${BOOKING_FEE} ج.م لمحفظتك`, { icon: '✅', duration: 3000 });
      }

      if (myIncomingCar) {
        await removeIncomingCar(myIncomingCar.id);
      }

      feeChargedRef.current = false;
      setFeeCharged(false);
      geofenceEntryTimeRef.current = null;
      setIsInsideGeofence(false);
      setStationarySeconds(0);

      setShowArrivalOverlay(false);
      setSelectedGarageId(null);
      setScreen('list');
    } catch (err) {
      console.error('❌ Refund error:', err);
      toast.error('حدث خطأ في الاسترداد، تواصل مع الدعم');
    }
  };

  const handleReturnHome = () => {
    setShowArrivalOverlay(false);
    setSelectedGarageId(null);
    setScreen('list');
  };

  const handleQuickTopup = async (tier: typeof TOPUP_TIERS[0]) => {
    if (!currentUser || processingTopup) return;
    setProcessingTopup(tier.id);

    try {
      const bonusAmount = tier.bonus ?? getBonusForAmount(tier.amount);
      await addWalletTopUp({
        userPhone: currentUser.phone,
        amount: tier.amount,
        bonus: bonusAmount,
        method: 'instapay',
        status: 'pending',
      });
      toast.success(`تم طلب شحن ${tier.amount} ج + ${bonusAmount} ج بونص هدية 🎁! في انتظار التفعيل`, { duration: 4500 });
      setShowInsufficientModal(false);
    } catch (err) {
      console.error('❌ Topup error:', err);
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

        {/* 🏢 بطاقة اسم الجراج */}
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

        {/* 🅿️ شارة VIP + رسوم الحجز */}
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
                  رصيدك: {walletBalance} ج.م
                </span>
                <span className="text-[9px] font-bold" style={{ color: BRAND.slateMuted }}>
                  رسوم الحجز: {BOOKING_FEE} ج.م (تُخصم عند الوصول أو بعد 3 دقائق)
                </span>
              </div>
            </div>
            {feeCharged && (
              <span className="text-[10px] font-black flex items-center gap-1" style={{ color: BRAND.green }}>
                <Check size={12} /> تم الخصم
              </span>
            )}
          </div>
        )}

        {/* ⏱️ كارت العداد التلقائي الـ 3 دقائق فور الوصول */}
        {isInsideGeofence && isVipGarage && !feeCharged && (
          <div className="rounded-2xl p-4 border-2 border-amber-500/50 bg-amber-500/10 text-center space-y-2 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-center gap-2 text-amber-300 font-black text-xs">
              <Clock className="w-4 h-4 animate-spin text-amber-400" />
              <span>أنت الآن في نطاق الجراج (جاري احتساب 3 دقائق ثبات)</span>
            </div>
            <div className="text-3xl font-black font-mono text-amber-400 dir-ltr">
              {formattedCountdown}
            </div>
            <p className="text-[10px] font-bold text-slate-300">
              سيتم خصم <span className="text-amber-300 font-black">{BOOKING_FEE} ج.م</span> تلقائياً وبدء العداد عند انتهاء الوقت.
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

        {/* 🚀 زر توجيه الخرائط */}
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
              شغل الـ GPS وابدأ التحرك فوراً! 🗺️🚀
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

        {/* ✅ معلومات المركبة الموجهة */}
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

        {/* 🔔 مؤشر حالة الـ Push */}
        {myIncomingCar && (
          <div
            className="rounded-2xl p-3 flex items-center gap-2 shrink-0 border"
            style={{
              background: pushStatus === 'sent' ? BRAND.greenLight : 'rgba(245, 158, 11, 0.08)',
              borderColor: pushStatus === 'sent' ? BRAND.green + '20' : 'rgba(245, 158, 11, 0.2)'
            }}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                pushStatus === 'sent'
                  ? 'bg-emerald-500'
                  : pushStatus === 'cancelled'
                    ? 'bg-red-500'
                    : 'bg-amber-500 animate-pulse'
              }`}
            />
            <span
              className="text-[10px] font-bold"
              style={{
                color: pushStatus === 'sent' ? BRAND.green : '#f59e0b'
              }}
            >
              {pushStatus === 'sent'
                ? '✅ تم إشعار الجراج بقدومك وتأكيد حجزك'
                : pushStatus === 'cancelled'
                  ? '❌ تم إلغاء الإشعار'
                  : `⏳ سيتم إشعار الجراج تلقائياً بعد ${cancelTimeLeft} ثانية`}
            </span>
          </div>
        )}

        {/* 🟢 زر "وصلت الجراج الآن" (خصم فوري 3ج وبدء الجلسة فوراً) */}
        {!myActiveSession && (
          <button
            type="button"
            onClick={handleCarArrived}
            disabled={isArrivingRef.current || isCancellingRef.current}
            className="w-full py-4 rounded-2xl active:scale-95 transition-transform flex items-center justify-center gap-2 shrink-0 disabled:opacity-50 border-0 text-white cursor-pointer shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
              boxShadow: `0 4px 18px rgba(22, 163, 74, 0.3)`,
            }}
          >
            <ShieldCheck size={18} color="#ffffff" />
            <span className="font-black text-white text-center text-sm sm:text-base">
              {isVipGarage
                ? `وصلت الجراج الآن (خصم ${BOOKING_FEE}ج وبدء الركنة فوراً)`
                : 'وصلت الجراج الآن (بدء الركنة فوراً)'}
            </span>
          </button>
        )}

        {/* 🔄 زر الإلغاء */}
        {myIncomingCar && !myActiveSession && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="shrink-0"
          >
            {canCancel ? (
              <>
                <button
                  type="button"
                  onClick={handleCancelBooking}
                  disabled={isCancellingRef.current || isArrivingRef.current}
                  className="w-full border py-3 rounded-xl font-black text-xs active:scale-95 transition-transform flex items-center justify-center gap-1.5 bg-transparent cursor-pointer disabled:opacity-50"
                  style={{ color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                >
                  <XCircle size={15} />
                  إلغاء الحجز ({cancelTimeLeft}ث)
                </button>

                <div className="mt-1.5 bg-white/5 rounded-full h-1 overflow-hidden" style={{ background: BRAND.border }}>
                  <div
                    className="h-full bg-red-500 transition-all duration-1000"
                    style={{
                      width: `${(cancelTimeLeft / CANCEL_WINDOW_SECONDS) * 100}%`,
                    }}
                  />
                </div>
              </>
            ) : (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={handleCancelBooking}
                disabled={isCancellingRef.current || isArrivingRef.current}
                className="w-full py-3 rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2 border bg-transparent cursor-pointer disabled:opacity-50"
                style={{
                  color: BRAND.slateMuted,
                  borderColor: BRAND.border,
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                <XCircle size={14} style={{ color: BRAND.slateMuted }} />
                <span>إلغاء الحجز واختيار جراج آخر</span>
              </motion.button>
            )}
          </motion.div>
        )}
      </div>

      {/* 🎯 Arrival Overlay للـ VIP */}
      <AnimatePresence>
        {showArrivalOverlay && isVipGarage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-end justify-center p-0 dir-rtl"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
          >
            <motion.div
              initial={{ y: 400 }}
              animate={{ y: 0 }}
              exit={{ y: 400 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md rounded-t-3xl p-6 space-y-4"
              style={{ background: BRAND.navyLight, border: `1px solid ${BRAND.border}` }}
            >
              <div className="text-center">
                <div className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: BRAND.greenLight }}>
                  <MapPin size={32} style={{ color: BRAND.green }} />
                </div>
                <h3 className="text-white font-black text-lg mb-1">وصلت لجراج {garage.name}! 🎉</h3>
                <p className="text-xs font-bold" style={{ color: BRAND.slateMuted }}>
                  اختر الإجراء المناسب للمتابعة
                </p>
              </div>

              <button
                onClick={handleCarArrived}
                disabled={isArrivingRef.current}
                className="w-full py-4 rounded-xl flex items-center justify-center gap-2 text-white font-black cursor-pointer border-0 disabled:opacity-50"
                style={{ background: BRAND.greenDark, fontSize: '15px' }}
              >
                <Check size={18} />
                وصلت ولقيت مكان (تأكيد الخصم والركن) ✅
              </button>

              <button
                onClick={handleRefundAndExit}
                className="w-full py-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer border font-black"
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderColor: 'rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: '14px'
                }}
              >
                <XCircle size={16} />
                ملقيتش مكان (استرداد {BOOKING_FEE} ج.م) ↩️
              </button>

              <button
                onClick={handleReturnHome}
                className="w-full py-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer border bg-transparent font-black"
                style={{
                  borderColor: BRAND.border,
                  color: BRAND.slateMuted,
                  fontSize: '13px'
                }}
              >
                <Home size={14} />
                العودة للرئيسية
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 💳 Insufficient Wallet Modal */}
      <AnimatePresence>
        {showInsufficientModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 dir-rtl"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
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
    </motion.div>
  );
}