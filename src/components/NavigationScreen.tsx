// src/components/NavigationScreen.tsx
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Navigation,
  MapPin,
  ArrowRight,
  CheckCircle,
  Car,
  Clock,
  XCircle,
  Copy,
  Gift,
  CreditCard,
} from 'lucide-react';
// 🌟 استيراد getServerNow ودوال البصمة الموحدة من الـ store لضمان المزامنة التامة
import { useStore, normalizePlate, normalizePhone, getServerNow } from '../store';
import {
  calculateDistance,
  distanceToMinutes,
  formatDuration,
} from '../utils/distance';
import { assignChessSlot } from '../utils/chessGridEngine';
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

/* ─── 🎨 الألوان الرسمية الفاخرة لتطبيق Park'n 24 ─── */
const BRAND = {
  blue: '#1656b8',       // الأزرق الرسمي للوجو
  blueDark: '#0f3d85',   // الكحلي الفخم
  blueLight: '#e8f0fe',  // الأزرق الفاتح جداً
  blueSoft: 'rgba(22, 86, 184, 0.08)', // كحلي زجاجي ناعم
  green: '#8cc63f',      // الأخضر الرسمي للوجو
  greenDark: '#6ea62a',  // أخضر داكن للخطوط والنصوص
  greenLight: 'rgba(140, 198, 63, 0.12)', // خلفية خضراء ناعمة
  navy: '#0a1628',       // الكحلي الليلي الغامق للواجهة الداكنة
  navyLight: '#111e36',  // كحلي أفتح للبطاقات والـ overlays
  slate: '#64748b',      // الرمادي الهادئ
  slateMuted: '#94a3b8', // الرمادي الباهت
  border: 'rgba(255, 255, 255, 0.08)', // حدود زجاجية رفيعة
};

/* ─── Constants ─── */
const CANCEL_WINDOW_SECONDS = 30; // ⏱️ مهلة الـ 30 ثانية المعتمدة قبل إرسال إشعار السايس
const GPS_DEADBAND_METERS = 6;   // 🛡️ فلتر منع رعشة الخريطة

/* ─── Icons ─── */
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
    setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {}
    }, 250);

    const isValidCoord = (c: [number, number]) =>
      Array.isArray(c) &&
      typeof c[0] === 'number' && !isNaN(c[0]) && c[0] !== 0 &&
      typeof c[1] === 'number' && !isNaN(c[1]) && c[1] !== 0;

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
  } = useStore();

  const garage = garages.find((g) => g.id === selectedGarageId);
  const userPlateNav = normalizePlate(currentUser?.carPlate);
  const userPhoneClean = currentUser?.phone ? normalizePhone(currentUser.phone) : '';

  // 🛡️ الكشف المزدوج والآمن عن السيارة القادمة (لوحة + هاتف)
  const myIncomingCar = useMemo(() => {
    return incomingCars.find((c) => {
      if (c.status !== 'coming') return false;
      const samePlate = !!userPlateNav && normalizePlate(c.carPlate) === userPlateNav;
      const cPhone = c.customerPhone ? normalizePhone(c.customerPhone) : '';
      const samePhone = Boolean(userPhoneClean && cPhone === userPhoneClean);
      const sameGarage = selectedGarageId ? String(c.garageId) === String(selectedGarageId) : true;
      return (samePlate || samePhone) && sameGarage;
    });
  }, [incomingCars, selectedGarageId, userPlateNav, userPhoneClean]);

  // ✅ الكشف اللحظي عن الجلسة النشطة
  const myActiveSession = useMemo(() => {
    return sessions
      .filter((sess) => {
        if (sess.status !== 'active') return false;
        const samePlate = !!userPlateNav && normalizePlate(sess.carPlate) === userPlateNav;
        const sPhone = (sess as any).customerPhone ? normalizePhone((sess as any).customerPhone) : '';
        const samePhone = Boolean(userPhoneClean && sPhone === userPhoneClean);
        return samePlate || samePhone;
      })
      .sort((a, b) => toMs(b.startTime) - toMs(a.startTime))[0];
  }, [sessions, userPlateNav, userPhoneClean]);

  /* ── State ── */
  const [userPos, setUserPos] = useState<{ lat: number; lng: number }>({
    lat: 30.0444,
    lng: 31.2357,
  });
  const [cancelTimeLeft, setCancelTimeLeft] = useState(CANCEL_WINDOW_SECONDS);
  const [canCancel, setCanCancel] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [pushStatus, setPushStatus] = useState<'waiting' | 'sent' | 'cancelled'>('waiting');

  /* ── Refs ── */
  const userPosRef = useRef(userPos);
  const currentUserRef = useRef(currentUser);
  const lastCarIdRef = useRef<string | null>(null);
  const screenEnteredRef = useRef(getServerNow());
  const navigatedToSessionRef = useRef(false);
  const isArrivingRef = useRef(false);
  const pushSentRef = useRef(false);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeChannelRef = useRef<any>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastStableCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    userPosRef.current = userPos;
  }, [userPos]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  /* ─── REALTIME ─── */
  useEffect(() => {
    if (!userPlateNav && !userPhoneClean) return;

    let cancelled = false;

    const fastFetch = async () => {
      if (cancelled) return;
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

    const channel = supabase
      .channel(`instant-nav-${userPlateNav || userPhoneClean}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions' },
        async (payload) => {
          const newRow = payload.new as any;
          if (isMySessionPayload(newRow) && newRow?.status === 'active') {
            await fastFetch();
            if (newRow.garage_id || newRow.garageId) {
              setSelectedGarageId(newRow.garage_id || newRow.garageId);
            }
            setScreen('session');
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

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      realtimeChannelRef.current = null;
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [userPlateNav, userPhoneClean, fetchAll, setScreen, setSelectedGarageId]);

  /* ─── GPS ─── */
  const handleGpsUpdate = useCallback((p: GeolocationPosition) => {
    const newLat = p.coords.latitude;
    const newLng = p.coords.longitude;

    if (lastStableCoordsRef.current === null) {
      lastStableCoordsRef.current = { lat: newLat, lng: newLng };
      setUserPos({ lat: newLat, lng: newLng });
      return;
    }

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
  }, []);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (p) => {
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

    return () => navigator.geolocation.clearWatch(id);
  }, [handleGpsUpdate]);

  useEffect(() => {
    const t = setTimeout(() => setMapReady(true), 200);
    return () => clearTimeout(t);
  }, []);

  /* ─── ⏱️ مؤقت الإلغاء (30 ثانية دقيقة) ─── */
  useEffect(() => {
    screenEnteredRef.current = getServerNow();
    setCancelTimeLeft(CANCEL_WINDOW_SECONDS);
    setCanCancel(true);

    const interval = window.setInterval(() => {
      const elapsed = Math.floor((getServerNow() - screenEnteredRef.current) / 1000);
      const left = Math.max(0, CANCEL_WINDOW_SECONDS - elapsed);
      setCancelTimeLeft(left);
      if (left <= 0) {
        setCanCancel(false);
        window.clearInterval(interval);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [myIncomingCar?.id]);

  /* ─── ⏳ إرسال الـ Push للسايس فقط بعد انتهاء مهلة الـ 30 ثانية ─── */
  useEffect(() => {
    if (!garage) return;

    const carId = myIncomingCar?.id || `${userPlateNav}-${selectedGarageId}`;

    if (lastCarIdRef.current !== carId) {
      pushSentRef.current = false;
      lastCarIdRef.current = carId;
      setPushStatus('waiting');
    }

    if (pushSentRef.current) {
      setPushStatus('sent');
      return;
    }

    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);

    const elapsed = Math.floor((getServerNow() - screenEnteredRef.current) / 1000);
    const msLeft = Math.max(0, (CANCEL_WINDOW_SECONDS - elapsed) * 1000);

    // جدولة إرسال التنبيه للسايس بعد انتهاء الـ 30 ثانية
    pushTimerRef.current = setTimeout(async () => {
      const freshState = useStore.getState();
      const carPlate = myIncomingCar?.carPlate || currentUserRef.current?.carPlate;
      
      if (!carPlate || pushSentRef.current) {
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
          carPlate: carPlate,
          estimatedMinutes: Math.max(1, estimatedMinutes),
          customerName: currentUserRef.current?.name,
          agreedPrice: myIncomingCar?.agreedPrice ?? garage.basePrice,
        });

        setPushStatus('sent');
      } catch (err) {
        console.error('❌ Push error:', err);
        pushSentRef.current = false;
        setPushStatus('waiting');
      }
    }, msLeft);

    return () => {
      if (pushTimerRef.current) {
        clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
    };
  }, [garage, myIncomingCar?.id, userPlateNav, selectedGarageId]);

  /* ─── الانتقال التلقائي لشاشة العداد ─── */
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

    toast.success('بدأ حساب الركن الآن! ⏱️', { icon: '🚗', duration: 2500 });
    setScreen('session');
  }, [myActiveSession, selectedGarageId, setSelectedGarageId, setScreen]);

  if (!garage) {
    return (
      <div className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-8 text-right">
        <div className="text-4xl mb-4">🔍</div>
        <p className="text-slate-400 text-sm font-bold text-center mb-6">لم يتم تحديد جراج</p>
        <button onClick={() => setScreen('list')} className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black text-sm">
          العودة للقائمة
        </button>
      </div>
    );
  }

  const distance = calculateDistance(userPos.lat, userPos.lng, garage.lat, garage.lng);
  const minutes = distanceToMinutes(distance);
  const coordsText = `${garage.lat},${garage.lng}`;
  const isEligibleForFree = currentUser && !currentUser.hasUsedFreeSession;

  const copyCoords = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(coordsText);
      } else {
        const el = document.createElement('textarea');
        el.value = coordsText;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      toast.success('تم نسخ الإحداثيات!');
    } catch {
      toast.error('فشل النسخ');
    }
  };

  const openExternalMaps = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${garage.lat},${garage.lng}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCancelBooking = async () => {
    if (!currentUser) return;

    if (pushTimerRef.current) {
      clearTimeout(pushTimerRef.current);
      pushTimerRef.current = null;
    }
    pushSentRef.current = true;
    setPushStatus('cancelled');

    const carPlate = myIncomingCar?.carPlate || currentUser?.carPlate;
    if (carPlate && pushStatus === 'sent') {
      await cancelScheduledPush(garage.id, carPlate);
    }

    const activeOffer = offers.find(
      (o) => o.userId === currentUser.phone && (o.status === 'pending' || o.status === 'accepted')
    );
    if (activeOffer) cancelOffer(activeOffer.id);

    if (myIncomingCar) {
      removeIncomingCar(myIncomingCar.id);
    }

    toast.success('تم إلغاء الحجز، يمكنك اختيار جراج آخر 🚗');
    setSelectedGarageId(null);
    setScreen('list');
  };

  // 🚀 بدء الركن الفوري بدون أي تعليق
  const handleCarArrived = async () => {
    if (isArrivingRef.current) return;
    isArrivingRef.current = true;

    // إلغاء مؤقت الـ Push لتجنب إرسال إشعار قدوم بعد الوصول
    if (pushTimerRef.current) {
      clearTimeout(pushTimerRef.current);
      pushTimerRef.current = null;
    }

    try {
      const state = useStore.getState();
      const carPlateToUse = myIncomingCar?.carPlate || currentUser?.carPlate;
      if (!carPlateToUse) {
        toast.error('رقم لوحة السيارة غير متوفر');
        isArrivingRef.current = false;
        return;
      }

      const np = normalizePlate(carPlateToUse);
      const alreadyActive = state.sessions.find(
        (s) =>
          s.status === 'active' &&
          (normalizePlate(s.carPlate) === np || (userPhoneClean && normalizePhone((s as any).customerPhone || '') === userPhoneClean))
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

      let assignedSlot = undefined;
      if (garage.lat && garage.lng) {
        const activeSessionsCount = state.sessions.filter(s => s.garageId === garage.id && s.status === 'active').length;
        const slot = assignChessSlot(activeSessionsCount);
        assignedSlot = slot.slotId;
      }

      const startTimeISO = new Date(getServerNow()).toISOString();

      await addSession({
        garageId: garage.id,
        carPlate: carPlateToUse,
        startTime: startTimeISO,
        status: 'active',
        source: 'app',
        agreedPrice: myIncomingCar?.agreedPrice ?? garage.basePrice,
        customerPhone: currentUser?.phone,
        customerName: currentUser?.name,
        startedBy: 'customer',
        incomingCarId: myIncomingCar?.id || undefined,
        securityShieldActive: false,
        shieldLocked: false,
        slotId: assignedSlot,
      } as any);

      if (myIncomingCar) {
        await removeIncomingCar(myIncomingCar.id);
      }

      navigatedToSessionRef.current = true;
      setScreen('session');
      toast.success('بدأ حساب الركن الآن! ⏱️', { icon: '🚗' });
    } catch (err) {
      console.error('❌ خطأ في تحويل العداد:', err);
      setScreen('session');
    } finally {
      setTimeout(() => { isArrivingRef.current = false; }, 2000);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full flex flex-col safe-top safe-bottom text-right"
      style={{ background: BRAND.navy, color: '#ffffff' }}
    >
      {/* ══ Header ══ */}
      <div className="flex items-center justify-between px-4 pt-12 pb-2 shrink-0">
        <button
          onClick={() => setScreen('list')}
          className="p-2.5 rounded-xl border cursor-pointer bg-white/5 active:scale-90 transition-all"
          style={{ borderColor: BRAND.border, color: '#fff' }}
        >
          <ArrowRight size={18} />
        </button>

        <h2 className="text-xs font-black flex items-center gap-1.5" style={{ color: '#ffffff' }}>
          <motion.div animate={{ x: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
            <Navigation size={15} style={{ color: BRAND.blue }} />
          </motion.div>
          التوجيه للجراج
        </h2>

        <div className="w-10" />
      </div>

      {/* ══ Content ══ */}
      <div className="flex-1 px-4 pb-4 flex flex-col gap-3 overflow-y-auto">

        {/* 🏢 بطاقة اسم الجراج */}
        <div className="rounded-2xl p-4 shrink-0 border" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
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
              <span style={{ color: '#ffffff', fontSize: '15px', fontWeight: 950, display: 'block', lineHeight: '1.2' }}>
                {garage.name}
              </span>
              <div className="flex items-center gap-1 justify-end text-[10px] mt-1 font-bold" style={{ color: BRAND.slateMuted }}>
                <span>{garage.location}</span>
                <MapPin size={10} style={{ color: BRAND.slateMuted }} />
              </div>
            </div>
          </div>
        </div>

        {/* 🗺️ الخريطة المستقرة */}
        <div className="w-full h-44 rounded-2xl overflow-hidden relative shrink-0 border" style={{ transform: 'translateZ(0)', borderColor: BRAND.border }}>
          {mapReady ? (
            <MapContainer
              key={`map-nav-${garage.id}`}
              center={[garage.lat || 30.0444, garage.lng || 31.2357]}
              zoom={15}
              style={{ width: '100%', height: '100%' }}
              zoomControl={false}
            >
              <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
              <Marker position={[userPos.lat, userPos.lng]} icon={userIcon}>
                <Popup>موقعك الحالي 🚗</Popup>
              </Marker>
              <Marker position={[garage.lat, garage.lng]} icon={garageIcon}>
                <Popup>{garage.name} 🅿️</Popup>
              </Marker>
              <Polyline positions={[[userPos.lat, userPos.lng], [garage.lat, garage.lng]]} color={BRAND.blue} weight={4} dashArray="8, 8" />
              <MapController userPos={[userPos.lat, userPos.lng]} garagePos={[garage.lat, garage.lng]} />
            </MapContainer>
          ) : (
            <div className="w-full h-full bg-slate-900 flex items-center justify-center">
              <div className="text-slate-500 text-xs font-bold animate-pulse">🗺️ جاري تحميل الخريطة...</div>
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
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={openExternalMaps}
            className="w-full relative overflow-hidden flex items-center justify-center gap-2 py-3 px-4 rounded-xl cursor-pointer border-0 text-white font-black"
            style={{ background: BRAND.blue, boxShadow: `0 4px 14px ${BRAND.blue}25` }}
          >
            <Navigation size={16} color="#ffffff" className="animate-bounce shrink-0" />
            <span style={{ color: '#ffffff', fontSize: '14px', fontWeight: 950 }}>
              شغل الـ GPS وابدأ التحرك فوراً! 🗺️🚀
            </span>
          </motion.button>

          <button onClick={copyCoords} className="flex items-center justify-center gap-1 text-[10px] py-0.5 border-0 bg-transparent cursor-pointer" style={{ color: BRAND.slateMuted }}>
            <Copy size={11} style={{ color: BRAND.slateMuted }} />
            <span>نسخ إحداثيات الجراج الجغرافية</span>
          </button>
        </div>

        {/* معلومات السعر والأماكن */}
        <div className="border rounded-xl p-3.5 shrink-0 space-y-2.5" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-[10px] font-bold" style={{ color: BRAND.slateMuted }}>
              <Car size={12} />
              <span>{myIncomingCar?.agreedPrice ?? garage.basePrice} ج.م/ساعة</span>
            </div>
            <span className="text-xs font-black font-mono" style={{ color: BRAND.blue }}>
              🚗 {currentUser?.carPlate}
            </span>
          </div>

          <div className="flex items-center justify-between border-t pt-2" style={{ borderColor: BRAND.border }}>
            <span className={`text-xs font-black font-mono ${garage.availableSpots > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {garage.availableSpots} / {garage.capacity}
            </span>
            <span className="text-[10px] font-bold" style={{ color: BRAND.slateMuted }}>الأماكن المتاحة الآن</span>
          </div>

          <div className="flex items-center justify-between border-t pt-2" style={{ borderColor: BRAND.border }}>
            <span className="text-xs font-black flex items-center gap-1" style={{ color: BRAND.green }}>
              <CreditCard size={12} />
              {garage.payment_mode === 'cash' ? '💵 نقدي فقط' : garage.payment_mode === 'wallet' ? '👝 محفظة فقط' : '💳 نقدي ومحفظة'}
            </span>
            <span className="text-[10px] font-bold" style={{ color: BRAND.slateMuted }}>طريقة الدفع المقبولة</span>
          </div>

          {isEligibleForFree && (
            <div className="border rounded-lg p-2 text-center flex items-center justify-center gap-1 text-[10px] font-black" style={{ background: BRAND.greenLight, borderColor: BRAND.green + '40', color: BRAND.green }}>
              <Gift size={12} style={{ color: BRAND.green }} />
              <span>أول 30 دقيقة مجاناً كهدية ترحيبية لك في هذا الحجز! 🎁</span>
            </div>
          )}
        </div>

        {/* 🔔 مؤشر حالة الإشعار المتزامن مع عداد الـ 30 ثانية */}
        <div
          className="rounded-xl p-3 flex items-center gap-2 shrink-0 border"
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

        {/* زر وصلت للجراج */}
        {!myActiveSession && (
          <button
            onClick={handleCarArrived}
            disabled={isArrivingRef.current}
            className="w-full py-3.5 rounded-xl active:scale-95 transition-transform flex items-center justify-center gap-2 shrink-0 disabled:opacity-50 border-0 text-white cursor-pointer"
            style={{ background: BRAND.greenDark, boxShadow: `0 4px 14px ${BRAND.green}20` }}
          >
            <Navigation size={16} color="#ffffff" />
            <span className="font-black text-white text-center" style={{ color: '#ffffff', fontWeight: 950, fontSize: '15px' }}>
              📍 وصلت الجراج وبدء الركن
            </span>
          </button>
        )}

        {/* 🔄 زر الإلغاء الذكي مع العداد التنازلي التفاعلي */}
        {!myActiveSession && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="shrink-0">
            {canCancel ? (
              <>
                <button
                  onClick={handleCancelBooking}
                  className="w-full border py-3 rounded-xl font-black text-xs active:scale-95 transition-transform flex items-center justify-center gap-1.5 bg-transparent cursor-pointer"
                  style={{ color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                >
                  <XCircle size={15} />
                  إلغاء الحجز ({cancelTimeLeft}ث)
                </button>
                <div className="mt-1.5 bg-white/5 rounded-full h-1 overflow-hidden" style={{ background: BRAND.border }}>
                  <div className="h-full bg-red-500 transition-all duration-1000" style={{ width: `${(cancelTimeLeft / CANCEL_WINDOW_SECONDS) * 100}%` }} />
                </div>
              </>
            ) : (
              <motion.button
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={handleCancelBooking}
                className="w-full py-3 rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2 border bg-transparent cursor-pointer"
                style={{ color: BRAND.slateMuted, borderColor: BRAND.border, fontSize: 12, fontWeight: 900 }}
              >
                <XCircle size={14} style={{ color: BRAND.slateMuted }} />
                <span>إلغاء الحجز واختيار جراج آخر</span>
              </motion.button>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}