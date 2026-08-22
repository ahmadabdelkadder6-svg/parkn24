import { useState, useEffect, useRef, useMemo } from 'react';
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
} from 'lucide-react';
import { useStore } from '../store';
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

/* ─── Constants ─── */
const CANCEL_WINDOW_SECONDS = 30;

/* ─── Icons ─── */
const userIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `<div style="width:40px;height:40px;background:#2563eb;border-radius:50%;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 4px 12px rgba(0,0,0,0.4);">🚗</div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const garageIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `<div style="width:40px;height:40px;background:#059669;border-radius:50%;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 4px 12px rgba(0,0,0,0.4);">🅿️</div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

/* ─── Helper: توحيد تحويل الوقت ─── */
const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

/* ─── Helper: توحيد رقم اللوحة ─── */
const normalizePlate = (plate?: string): string => {
  if (!plate) return '';
  return plate
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶٧٨٩'.indexOf(d)))
    .replace(/\s+/g, ' ')
    .toUpperCase();
};

/* ─── Map controller ─── */
function MapController({
  userPos,
  garagePos,
}: {
  userPos: [number, number];
  garagePos: [number, number];
}) {
  const map = useMap();

  useEffect(() => {
    if (userPos[0] !== 0 && garagePos[0] !== 0) {
      try {
        const bounds = L.latLngBounds([userPos, garagePos]);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      } catch {
        map.setView(garagePos, 15);
      }
    }
  }, [map, userPos, garagePos]);

  return null;
}

/* ════════════════════════════════════════════════════════════
   ██  MAIN NAVIGATION SCREEN
   ════════════════════════════════════════════════════════════ */
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

  /* ── الكشف عن السيارة القادمة ── */
  const myIncomingCar = useMemo(() => {
    return incomingCars.find(
      (c) =>
        c.garageId === selectedGarageId &&
        normalizePlate(c.carPlate) === userPlateNav &&
        c.status === 'coming',
    );
  }, [incomingCars, selectedGarageId, userPlateNav]);

  /* ✅ الكشف عن الجلسة النشطة */
  const myActiveSession = useMemo(() => {
    return sessions
      .filter(
        (sess) =>
          sess.status === 'active' &&
          (
            normalizePlate(sess.carPlate) === userPlateNav ||
            (currentUser?.phone && (sess as any).customerPhone === currentUser.phone)
          ),
      )
      .sort((a, b) => toMs(b.startTime) - toMs(a.startTime))[0];
  }, [sessions, userPlateNav, currentUser?.phone]);

  /* ── State ── */
  const [userPos, setUserPos] = useState<{ lat: number; lng: number }>({
    lat: 30.0444,
    lng: 31.2357,
  });
  const [cancelTimeLeft, setCancelTimeLeft] = useState(CANCEL_WINDOW_SECONDS);
  const [canCancel, setCanCancel] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [pushStatus, setPushStatus] = useState<'waiting' | 'sent' | 'cancelled'>('waiting');
  const [sessionStartedByGarage, setSessionStartedByGarage] = useState(false);

  /* ── Refs لمنع استدعاء التايمر المتكرر وتصفيره ── */
  const userPosRef = useRef(userPos);
  const currentUserRef = useRef(currentUser);
  const lastCarIdRef = useRef<string | null>(null);
  const screenEnteredRef = useRef(Date.now());
  const navigatedToSessionRef = useRef(false);
  const isArrivingRef = useRef(false);
  const pushSentRef = useRef(false);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeChannelRef = useRef<any>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    userPosRef.current = userPos;
  }, [userPos]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  /* ─────────────────────────────────────────────
     ██  REALTIME: الاستماع لجدول sessions
     ───────────────────────────────────────────── */
  useEffect(() => {
    if (!userPlateNav) return;

    let cancelled = false;

    const refetch = async () => {
      if (cancelled) return;
      try {
        await fetchAll();
      } catch (e) {
        console.error('❌ fetchAll error:', e);
      }
    };

    refetch();

    const isMyRow = (row: any): boolean => {
      if (!row) return false;
      const plate = normalizePlate(row.car_plate || row.carPlate);
      const phone = row.customer_phone || row.customerPhone || '';
      return (
        plate === userPlateNav ||
        (!!currentUser?.phone && phone === currentUser.phone)
      );
    };

    const channel = supabase
      .channel(`nav-customer-live-${userPlateNav}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sessions' },
        async (payload) => {
          const newRow = payload.new as any;
          if (isMyRow(newRow) && newRow.status === 'active') {
            setSessionStartedByGarage(true);
            await refetch();
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions' },
        async (payload) => {
          const newRow = payload.new as any;
          if (isMyRow(newRow) && newRow.status === 'active') {
            setSessionStartedByGarage(true);
            await refetch();
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'incoming_cars' },
        async (payload) => {
          const oldRow = payload.old as any;
          if (isMyRow(oldRow)) {
            await refetch();
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incoming_cars' },
        async (payload) => {
          const newRow = payload.new as any;
          const oldRow = payload.old as any;
          if (isMyRow(newRow) || isMyRow(oldRow)) {
            await refetch();
          }
        },
      )
      .subscribe();

    realtimeChannelRef.current = channel;
    pollingIntervalRef.current = setInterval(refetch, 5000);

    const handleFocus = () => refetch();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      realtimeChannelRef.current = null;
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [userPlateNav, currentUser?.phone, fetchAll]);

  /* ─── GPS ─── */
  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (p) => setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
    );

    const id = navigator.geolocation.watchPosition(
      (p) => setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 5000 },
    );

    return () => navigator.geolocation.clearWatch(id);
  }, []);

  /* ─── تحميل الخريطة ─── */
  useEffect(() => {
    const t = setTimeout(() => setMapReady(true), 300);
    return () => clearTimeout(t);
  }, []);

  /* ─── مؤقت الإلغاء الشكلي للواجهة ─── */
  useEffect(() => {
    if (myIncomingCar) {
      screenEnteredRef.current = Date.now();
      setCancelTimeLeft(CANCEL_WINDOW_SECONDS);
      setCanCancel(true);
    }

    if (!myIncomingCar) {
      setCancelTimeLeft(CANCEL_WINDOW_SECONDS);
      setCanCancel(true);
      return;
    }

    const interval = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - screenEnteredRef.current) / 1000);
      const left = Math.max(0, CANCEL_WINDOW_SECONDS - elapsed);
      setCancelTimeLeft(left);
      if (left <= 0) {
        setCanCancel(false);
        window.clearInterval(interval);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [myIncomingCar?.id]);

  /* ─── إرسال Push الفعلي للجراج بعد الـ 30 ثانية ─── */
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

    const elapsed = Math.floor((Date.now() - screenEnteredRef.current) / 1000);
    const msLeft = Math.max(0, (CANCEL_WINDOW_SECONDS - elapsed) * 1000);

    pushTimerRef.current = setTimeout(async () => {
      const freshState = useStore.getState();
      const stillComing = freshState.incomingCars.find(
        (c) => c.id === myIncomingCar.id && c.status === 'coming',
      );

      if (!stillComing || pushSentRef.current) {
        setPushStatus('cancelled');
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

        setPushStatus('sent');
      } catch (err) {
        console.error('❌ خطأ في إرسال Push للجراج:', err);
        pushSentRef.current = false;
        setPushStatus('waiting');
      }
    }, msLeft + 500);

    return () => {
      if (pushTimerRef.current) {
        clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
    };
  }, [myIncomingCar?.id, selectedGarageId]);

  /* ─── الانتقال التلقائي لشاشة الجلسة ─── */
  useEffect(() => {
    if (!myActiveSession) {
      navigatedToSessionRef.current = false;
      setSessionStartedByGarage(false);
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

    toast.success('تم بدء حساب الركن ⏱️', { icon: '🚗', duration: 3000 });

    setTimeout(() => {
      setScreen('session');
    }, 500);
  }, [
    myActiveSession,
    selectedGarageId,
    setSelectedGarageId,
    setScreen,
  ]);

  /* ─── Guard ─── */
  if (!garage) {
    return (
      <div className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-8 text-right">
        <div className="text-4xl mb-4">🔍</div>
        <p className="text-slate-400 text-sm font-bold text-center mb-6">
          لم يتم تحديد جراج
        </p>
        <button
          onClick={() => setScreen('list')}
          className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black text-sm active:scale-95 transition-all"
        >
          العودة للقائمة
        </button>
      </div>
    );
  }

  /* ─── Computed ─── */
  const distance = calculateDistance(
    userPos.lat, userPos.lng,
    garage.lat, garage.lng,
  );
  const minutes = distanceToMinutes(distance);
  const coordsText = `${garage.lat},${garage.lng}`;

  /* ─── Handlers ─── */
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
      toast.success('تم نسخ الإحداثيات لجهازك!');
    } catch {
      toast.error('فشل النسخ');
    }
  };

  const openExternalMaps = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${garage.lat},${garage.lng}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCancelBooking = async () => {
    if (!currentUser || !myIncomingCar) return;

    if (pushTimerRef.current) {
      clearTimeout(pushTimerRef.current);
      pushTimerRef.current = null;
    }
    pushSentRef.current = true;
    setPushStatus('cancelled');

    if (pushStatus === 'sent') {
      await cancelScheduledPush(garage.id, myIncomingCar.carPlate);
    }

    const activeOffer = offers.find(
      (o) =>
        o.userId === currentUser.phone &&
        (o.status === 'pending' || o.status === 'accepted'),
    );
    if (activeOffer) cancelOffer(activeOffer.id);

    removeIncomingCar(myIncomingCar.id);
    toast.success('تم إلغاء الحجز');
    setSelectedGarageId(null);
    setScreen('list');
  };

  const handleCarArrived = async () => {
    if (isArrivingRef.current) return;
    isArrivingRef.current = true;

    if (!pushSentRef.current && myIncomingCar && garage) {
      if (pushTimerRef.current) {
        clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
      try {
        pushSentRef.current = true;
        await sendCarComingPush({
          garageId: garage.id,
          carPlate: myIncomingCar.carPlate,
          estimatedMinutes: 0,
          customerName: currentUser?.name,
          agreedPrice: myIncomingCar.agreedPrice,
        });
        setPushStatus('sent');
      } catch (err) {
        console.error('❌ خطأ في إرسال Push عند الوصول:', err);
      }
    }

    try {
      if (!myIncomingCar || !garage) {
        if (myActiveSession) {
          navigatedToSessionRef.current = true;
          setScreen('session');
        }
        return;
      }

      const state = useStore.getState();
      const alreadyActive = state.sessions.find(
        (s) =>
          s.status === 'active' &&
          (
            normalizePlate(s.carPlate) === userPlateNav ||
            (currentUser?.phone && (s as any).customerPhone === currentUser.phone)
          ),
      );

      if (alreadyActive) {
        await removeIncomingCar(myIncomingCar.id);
        if (alreadyActive.garageId !== selectedGarageId) {
          setSelectedGarageId(alreadyActive.garageId);
        }
        navigatedToSessionRef.current = true;
        toast.success('تم بدء حساب الركن ⏱️');
        setScreen('session');
        return;
      }

      const relatedOffer = offers.find(
        (o) =>
          o.carPlate === myIncomingCar.carPlate &&
          (o.status === 'pending' || o.status === 'accepted'),
      );
      if (relatedOffer) cancelOffer(relatedOffer.id);

      await addSession({
        garageId: garage.id,
        carPlate: myIncomingCar.carPlate,
        startTime: Date.now(),
        status: 'active',
        source: 'app',
        agreedPrice: myIncomingCar.agreedPrice,
        customerPhone: currentUser?.phone,
        customerName: currentUser?.name,
        startedBy: 'customer',
        incomingCarId: myIncomingCar.id,
      } as any);

      await removeIncomingCar(myIncomingCar.id);

      toast.success('تم بدء حساب الركن ⏱️');
      navigatedToSessionRef.current = true;
      setScreen('session');
    } catch (err) {
      console.error('❌ خطأ:', err);
      toast.error('حدث خطأ، حاول مرة أخرى');
    } finally {
      setTimeout(() => { isArrivingRef.current = false; }, 5000);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-slate-950 text-white flex flex-col safe-top safe-bottom text-right"
    >
      {/* ══ Header ══ */}
      <div className="flex items-center justify-between px-4 pt-12 pb-2 shrink-0">
        <button
          onClick={() => setScreen('list')}
          className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 active:scale-90 transition-all"
        >
          <ArrowRight size={18} />
        </button>

        <h2 className="text-sm font-black flex items-center gap-1.5" style={{ color: '#ffffff' }}>
          <motion.div
            animate={{ x: [0, -3, 0] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            <Navigation size={16} className="text-blue-400" />
          </motion.div>
          التوجيه للجراج
        </h2>

        <div className="w-10" />
      </div>

      {/* ══ Content ══ */}
      <div className="flex-1 px-4 pb-4 flex flex-col gap-3 overflow-y-auto">

        {/* ✅ بانر: الجلسة بدأت من الجراج */}
        {(myActiveSession || sessionStartedByGarage) && !navigatedToSessionRef.current && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="shrink-0"
            style={{
              background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              borderRadius: 20,
              padding: '16px 18px',
              boxShadow: '0 0 30px rgba(5,150,105,0.4), 0 8px 24px rgba(5,150,105,0.25)',
              color: '#ffffff',
            }}
          >
            <div className="flex items-center gap-3">
              <motion.span
                animate={{ scale: [1, 1.4, 1] }}
                transition={{ repeat: Infinity, duration: 1 }}
                className="w-3 h-3 rounded-full bg-white shrink-0"
              />
              <div className="flex-1">
                <div className="font-black text-sm flex items-center gap-1" style={{ color: '#ffffff' }}>
                  ✅ الجراج بدأ حساب الركن!
                </div>
                <div className="text-[10px] text-emerald-200 mt-1">
                  جاري الانتقال لشاشة الجلسة تلقائياً...
                </div>
              </div>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
              />
            </div>
          </motion.div>
        )}

        {/* 🏢 بطاقة اسم الجراج بالأسود الفخم والواضح على خلفية بيضاء نقية */}
        <div
          className="rounded-2xl p-3.5 shrink-0 shadow-md"
          style={{
            background: '#ffffff',
            border: '1.5px solid #E2E8F0',
          }}
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-blue-600" />
              <span className="text-sm font-black text-blue-600 font-mono">
                {formatDuration(minutes)}
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-xs text-slate-600 font-mono font-bold">
                {distance.toFixed(1)} كم
              </span>
            </div>
            
            <div className="text-right flex flex-col items-end">
              <span
                style={{
                  color: '#000000',
                  fontSize: '16px',
                  fontWeight: 900,
                  display: 'block',
                  lineHeight: '1.2',
                }}
              >
                {garage.name}
              </span>
              <div className="flex items-center gap-1 justify-end text-[10px] text-slate-500 mt-1 font-bold">
                <span>{garage.location}</span>
                <MapPin size={10} className="text-slate-400" />
              </div>
            </div>
          </div>
        </div>

        {/* 🗺️ الخريطة المصغرة بمقاس h-48 لإعطاء مساحة أكبر ومريحة لزر الإلغاء */}
        <div className="w-full h-48 rounded-2xl overflow-hidden border border-slate-800 relative shrink-0 shadow-lg">
          {mapReady ? (
            <MapContainer
              center={[garage.lat, garage.lng]}
              zoom={15}
              style={{ width: '100%', height: '100%' }}
              zoomControl={false}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
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
                color="#3b82f6"
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
              <div className="text-slate-500 text-sm font-bold animate-pulse">
                🗺️ جاري تحميل الخريطة...
              </div>
            </div>
          )}

          <div className="absolute top-3 left-3 bg-slate-900/90 backdrop-blur border border-slate-700 text-[10px] px-2.5 py-1 rounded-full text-slate-300 z-[400] flex items-center gap-1.5 pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
            تتبع مباشر
          </div>
        </div>

        {/* 🚀 زر توجيه الخرائط المصغر والأنيق باللون الأبيض الناصع */}
        <div className="flex flex-col gap-1.5 shrink-0">
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={openExternalMaps}
            className="w-full relative overflow-hidden flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-xl shadow-lg cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, #0066FF 0%, #0033BB 100%)',
              boxShadow: '0 6px 18px rgba(0, 102, 255, 0.35)',
              color: '#ffffff',
            }}
          >
            <Navigation size={18} color="#ffffff" className="animate-bounce shrink-0" />
            <span
              style={{
                color: '#ffffff',
                fontSize: '15px',
                fontWeight: 900,
                letterSpacing: '0.3px',
              }}
            >
              شغل الـ GPS وابدأ التحرك فوراً! 🗺️🚀
            </span>
          </motion.button>

          {/* زر نسخ الإحداثيات الفرعي */}
          <button
            onClick={copyCoords}
            className="flex items-center justify-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 py-0.5 transition-all"
          >
            <Copy size={12} className="text-slate-500" />
            <span>نسخ إحداثيات الجراج الجغرافية</span>
          </button>
        </div>

        {/* معلومات السعر والأماكن */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <Car size={12} />
              <span>
                {myIncomingCar?.agreedPrice ?? garage.basePrice} ج.م/ساعة
              </span>
            </div>
            <span className="text-xs font-black text-blue-400 font-mono">
              🚗 {currentUser?.carPlate}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-black font-mono ${
                garage.availableSpots > 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {garage.availableSpots} / {garage.capacity}
            </span>
            <span className="text-[10px] text-slate-400">الأماكن المتاحة الآن</span>
          </div>
        </div>

        {/* 🔔 مؤشر حالة الـ Push التلقائي */}
        {myIncomingCar && (
          <div
            className={`rounded-xl p-3 flex items-center gap-2 shrink-0 border ${
              pushStatus === 'sent'
                ? 'bg-emerald-600/10 border-emerald-500/20'
                : pushStatus === 'cancelled'
                  ? 'bg-red-600/10 border-red-500/20'
                  : 'bg-cyan-600/10 border-cyan-500/20'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                pushStatus === 'sent'
                  ? 'bg-emerald-500'
                  : pushStatus === 'cancelled'
                    ? 'bg-red-500'
                    : 'bg-cyan-500 animate-pulse'
              }`}
            />
            <span
              className={`text-[10px] font-bold ${
                pushStatus === 'sent'
                  ? 'text-emerald-400'
                  : pushStatus === 'cancelled'
                    ? 'text-red-400'
                    : 'text-cyan-400'
              }`}
            >
              {pushStatus === 'sent'
                ? '✅ تم إشعار الجراج بقدومك'
                : pushStatus === 'cancelled'
                  ? '❌ تم إلغاء الإشعار'
                  : `⏳ سيتم إشعار الجراج تلقائياً بعد ${cancelTimeLeft} ثانية`}
            </span>
          </div>
        )}

        {/* ملاحظة بدء الركن */}
        {!myActiveSession && (
          <div className="bg-emerald-600/10 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-2 shrink-0">
            <CheckCircle size={14} className="text-emerald-400 shrink-0" />
            <span className="text-[10px] font-bold text-emerald-400">
              سيبدأ حساب الركن فور الضغط على "وصلت للجراج" أو عندما يبدأه الجراج ✅
            </span>
          </div>
        )}

        {/* زر وصلت */}
        {!myActiveSession && (
          <button
            onClick={handleCarArrived}
            disabled={isArrivingRef.current}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-black text-base shadow-lg shadow-emerald-900/20 active:scale-95 transition-transform flex items-center justify-center gap-2 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ color: '#ffffff' }}
          >
            <Navigation size={18} color="#ffffff" />
            وصلت للجراج - ابدأ الركن ✅
          </button>
        )}

        {/* لو الجلسة بدأت - زر للانتقال يدوي */}
        {myActiveSession && (
          <button
            onClick={() => {
              if (myActiveSession.garageId !== selectedGarageId) {
                setSelectedGarageId(myActiveSession.garageId);
              }
              navigatedToSessionRef.current = true;
              setScreen('session');
            }}
            className="w-full text-white py-4 rounded-2xl font-black text-base shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2 shrink-0"
            style={{
              background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              boxShadow: '0 0 30px rgba(5,150,105,0.4)',
              color: '#ffffff',
            }}
          >
            <CheckCircle size={18} color="#ffffff" />
            الجلسة شغالة - اذهب للعداد ⏱️
          </button>
        )}

        {/* زر الإلغاء الشفاف الرائع مع العداد التفاعلي ليكون ظاهراً وواضحاً تماماً */}
        {canCancel && myIncomingCar && !myActiveSession && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="shrink-0"
          >
            <button
              onClick={handleCancelBooking}
              className="w-full bg-slate-900 border border-red-500/20 text-red-400 py-3 rounded-xl font-black text-xs active:scale-95 transition-transform flex items-center justify-center gap-2"
            >
              <XCircle size={16} />
              إلغاء الحجز ({cancelTimeLeft}ث)
            </button>

            <div className="mt-1.5 bg-slate-800 rounded-full h-1 overflow-hidden">
              <div
                className="h-full bg-red-500 transition-all duration-1000"
                style={{
                  width: `${(cancelTimeLeft / CANCEL_WINDOW_SECONDS) * 100}%`,
                }}
              />
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}