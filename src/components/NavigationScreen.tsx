import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Navigation,
  MapPin,
  ArrowRight,
  Car,
  Clock,
  XCircle,
  Copy,
  Edit3,
} from 'lucide-react';
import { useStore, normalizePlate } from '../store';
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

const CANCEL_WINDOW_SECONDS = 30;

const userIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `<div style="width:38px;height:38px;background:#2563eb;border-radius:50%;border:2.5px solid white;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 4px 12px rgba(0,0,0,0.4);">🚗</div>`,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
});

const garageIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `<div style="width:38px;height:38px;background:#059669;border-radius:50%;border:2.5px solid white;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 4px 12px rgba(0,0,0,0.4);">🅿️</div>`,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
});

const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

// 🔒 قفل تتبع عالمي لمنع تكرار الإرسال نهائياً أثناء التنقل
const globallyTriggeredCars = new Set<string>();

function MapController({
  userPos,
  garagePos,
}: {
  userPos: [number, number];
  garagePos: [number, number];
}) {
  const map = useMap();

  useEffect(() => {
    let active = true;

    const timer = setTimeout(() => {
      if (active && map && (map as any)._mapPane) {
        try {
          map.invalidateSize({ animate: false });
        } catch (e) {}
      }
    }, 250);

    if (userPos[0] !== 0 && garagePos[0] !== 0) {
      try {
        const bounds = L.latLngBounds([userPos, garagePos]);
        if (active && map) {
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
        }
      } catch {
        if (active && map) {
          map.setView(garagePos, 15);
        }
      }
    }

    return () => {
      active = false;
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
    fetchAll,
  } = useStore();

  const garage = garages.find((g) => g.id === selectedGarageId);
  const userPlateNav = normalizePlate(currentUser?.carPlate);
  const userPhoneClean = currentUser?.phone ? currentUser.phone.replace(/[^\d+]/g, '') : '';

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
            (userPhoneClean && ((sess as any).customerPhone || '').replace(/[^\d+]/g, '') === userPhoneClean)
          ),
      )
      .sort((a, b) => toMs(b.startTime) - toMs(a.startTime))[0];
  }, [sessions, userPlateNav, userPhoneClean]);

  const [userPos, setUserPos] = useState<{ lat: number; lng: number }>({
    lat: 30.0444,
    lng: 31.2357,
  });
  const [cancelTimeLeft, setCancelTimeLeft] = useState(CANCEL_WINDOW_SECONDS);
  const [canCancel, setCanCancel] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [pushStatus, setPushStatus] = useState<'waiting' | 'sent' | 'cancelled'>('waiting');

  const userPosRef = useRef(userPos);
  const currentUserRef = useRef(currentUser);
  const screenEnteredRef = useRef(Date.now());
  const navigatedToSessionRef = useRef(false);
  const isArrivingRef = useRef(false);

  const realtimeChannelRef = useRef<any>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    userPosRef.current = userPos;
  }, [userPos]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    if (!userPlateNav && !userPhoneClean) return;

    let cancelled = false;

    const fastFetch = async () => {
      if (cancelled) return;
      try {
        await fetchAll();
      } catch (e) {}
    };

    fastFetch();

    const isMySessionPayload = (row: any): boolean => {
      if (!row) return false;
      const plate = normalizePlate(row.car_plate || row.carPlate);
      const phone = (row.customer_phone || row.customerPhone || '').replace(/[^\d+]/g, '');
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
    pollingIntervalRef.current = setInterval(fastFetch, 5000);

    const handleFocus = () => fastFetch();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fastFetch();
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
  }, [userPlateNav, userPhoneClean, fetchAll, setScreen, setSelectedGarageId]);

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

  useEffect(() => {
    const t = setTimeout(() => setMapReady(true), 200);
    return () => clearTimeout(t);
  }, []);

  const bookingTime = useMemo(() => {
    if (!myIncomingCar) return 0;
    return toMs(myIncomingCar.startTime || myIncomingCar.created_at) || screenEnteredRef.current;
  }, [myIncomingCar]);

  // 1️⃣ عداد واجهة المستخدم (فقط يحدث الرقم التنازلي على الشاشة ولا يرسل إشعارات)
  useEffect(() => {
    if (!bookingTime) return;

    const updateVisualTimer = () => {
      const elapsed = Math.floor((Date.now() - bookingTime) / 1000);
      const left = Math.max(0, CANCEL_WINDOW_SECONDS - elapsed);
      setCancelTimeLeft(left);
      setCanCancel(left > 0);
    };

    updateVisualTimer();
    const intervalId = setInterval(updateVisualTimer, 1000);

    return () => clearInterval(intervalId);
  }, [bookingTime]);

  // 2️⃣ 🚀 [مؤقت إرسال الإشعار لمرة واحدة فقط]: غير مرتبط بـ re-render ولا يتكرر إطلاقاً
  useEffect(() => {
    if (!myIncomingCar || !garage || !bookingTime) return;

    const carId = myIncomingCar.id;

    // إذا تم إرسال الإشعار مسبقاً، نكتفي بعرض الحالة "تم الإرسال" ونخرج فوراً
    if (globallyTriggeredCars.has(carId)) {
      setPushStatus('sent');
      return;
    }

    setPushStatus('waiting');

    // حساب المتبقي بالضبط حتى اكتمال الـ 30 ثانية
    const elapsedMs = Date.now() - bookingTime;
    const delayMs = Math.max(0, (CANCEL_WINDOW_SECONDS * 1000) - elapsedMs);

    const singleTimer = setTimeout(async () => {
      // حماية إضافية
      if (globallyTriggeredCars.has(carId)) return;
      globallyTriggeredCars.add(carId);

      const freshState = useStore.getState();
      const stillComing = freshState.incomingCars.find(
        (c) => c.id === carId && c.status === 'coming',
      );

      if (stillComing) {
        try {
          const dist = calculateDistance(
            userPosRef.current.lat, userPosRef.current.lng,
            garage.lat, garage.lng,
          );
          const estimatedMinutes = distanceToMinutes(dist);

          setPushStatus('sent');
          await sendCarComingPush({
            garageId: garage.id,
            carPlate: myIncomingCar.carPlate,
            estimatedMinutes: Math.max(1, estimatedMinutes),
            customerName: currentUserRef.current?.name,
            agreedPrice: myIncomingCar.agreedPrice,
          });
        } catch (err) {
          console.error('❌ Push error:', err);
        }
      } else {
        setPushStatus('cancelled');
      }
    }, delayMs);

    return () => clearTimeout(singleTimer);
  }, [myIncomingCar?.id, garage?.id, bookingTime]);

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

  const distance = calculateDistance(
    userPos.lat, userPos.lng,
    garage.lat, garage.lng,
  );
  const minutes = distanceToMinutes(distance);
  const coordsText = `${garage.lat},${garage.lng}`;
  const isWithinGracePeriod = cancelTimeLeft > 0 && canCancel;

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

    const loading = toast.loading('جاري إلغاء الحجز وتحرير مكان الجراج...');
    try {
      if (myIncomingCar) {
        globallyTriggeredCars.add(myIncomingCar.id);
        await removeIncomingCar(myIncomingCar.id);
        await cancelScheduledPush(garage.id, myIncomingCar.carPlate);
      }

      setPushStatus('cancelled');

      const activeOffer = offers.find(
        (o) =>
          o.userId === currentUser.phone &&
          (o.status === 'pending' || o.status === 'accepted'),
      );
      if (activeOffer) cancelOffer(activeOffer.id);

      toast.dismiss(loading);
      toast.error('تم إلغاء الحجز بنجاح وتحرير مكان الجراج ✕', { duration: 4000 });
      setSelectedGarageId(null);
      setScreen('list');
    } catch (err) {
      toast.dismiss(loading);
      toast.error('حدث خطأ أثناء الإلغاء، يرجى المحاولة لاحقاً');
    }
  };

  const handleModifyOrSwitch = async () => {
    if (!currentUser) return;

    const loading = toast.loading('جاري الانتقال لتعديل وجهتك...');
    try {
      if (myIncomingCar) {
        globallyTriggeredCars.add(myIncomingCar.id);
        await removeIncomingCar(myIncomingCar.id);
        await cancelScheduledPush(garage.id, myIncomingCar.carPlate);
      }

      setPushStatus('cancelled');

      const activeOffer = offers.find(
        (o) =>
          o.userId === currentUser.phone &&
          (o.status === 'pending' || o.status === 'accepted'),
      );
      if (activeOffer) cancelOffer(activeOffer.id);

      toast.dismiss(loading);
      toast.success('تم إلغاء وجهتك السابقة. اختر جراجاً آخر أو أعد الحجز الآن 🔄', { duration: 5000 });
      setSelectedGarageId(null);
      setScreen('list');
    } catch (err) {
      toast.dismiss(loading);
      setSelectedGarageId(null);
      setScreen('list');
    }
  };

  const handleCarArrived = async () => {
    if (isArrivingRef.current) return;
    isArrivingRef.current = true;

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
            (userPhoneClean && ((s as any).customerPhone || '').replace(/[^\d+]/g, '') === userPhoneClean)
          ),
      );

      if (alreadyActive) {
        await removeIncomingCar(myIncomingCar.id);
        if (alreadyActive.garageId !== selectedGarageId) {
          setSelectedGarageId(alreadyActive.garageId);
        }
        navigatedToSessionRef.current = true;
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
      navigatedToSessionRef.current = true;
      setScreen('session');
    } catch (err) {
      console.error('❌ خطأ:', err);
      toast.error('حدث خطأ، حاول مرة أخرى');
    } finally {
      setTimeout(() => { isArrivingRef.current = false; }, 3000);
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

        {/* 🏢 بطاقة اسم الجراج */}
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
            
            <div className="text-right flex-col items-end">
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

        {/* 🗺️ الخريطة */}
        <div className="w-full h-48 rounded-2xl overflow-hidden border border-slate-800 relative shrink-0 shadow-lg">
          {mapReady ? (
            <MapContainer
              center={[garage.lat, garage.lng]}
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
                color="#2563eb"
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

        {/* 🚀 زر توجيه الخرائط */}
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

        {/* 🔔 مؤشر حالة الـ Push */}
        {!isWithinGracePeriod && myIncomingCar && (
          <div
            className={`rounded-xl p-3 flex items-center gap-2 shrink-0 border ${
              pushStatus === 'sent'
                ? 'bg-emerald-600/10 border-emerald-500/20'
                : 'bg-cyan-600/10 border-cyan-500/20'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                pushStatus === 'sent'
                  ? 'bg-emerald-500'
                  : 'bg-cyan-500 animate-pulse'
              }`}
            />
            <span
              className={`text-[10px] font-bold ${
                pushStatus === 'sent'
                  ? 'text-emerald-400'
                  : 'text-cyan-400'
              }`}
            >
              {pushStatus === 'sent'
                ? '✅ تم إشعار الجراج بقدومك'
                : '⏳ جاري الاتصال بالسايس...'}
            </span>
          </div>
        )}

        {/* زر وصلت للجراج */}
        {!myActiveSession && (
          <button
            onClick={handleCarArrived}
            disabled={isArrivingRef.current}
            className="w-full py-3.5 rounded-2xl active:scale-95 transition-transform flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #00CC66 0%, #00AA55 100%)',
              boxShadow: '0 8px 24px rgba(0,204,102,0.3)',
              border: 'none',
            }}
          >
            <Navigation size={18} color="#ffffff" />
            <span className="font-black text-white text-center" style={{ color: '#ffffff', fontWeight: 900, fontSize: '15px' }}>
              📍 وصلت الجراج وبدء الركن
            </span>
          </button>
        )}

        {/* ✏️ زر تعديل الحجز أو اختيار جراج آخر */}
        {!myActiveSession && (
          <button
            onClick={handleModifyOrSwitch}
            className="w-full bg-slate-900 hover:bg-slate-800 text-blue-400 py-3 rounded-xl font-black text-xs active:scale-95 transition-all flex items-center justify-center gap-2 border border-slate-800 shrink-0"
          >
            <Edit3 size={14} />
            تعديل الحجز أو اختيار جراج آخر
          </button>
        )}

        {/* ✕ زر الإلغاء الذكي الموحد */}
        {!myActiveSession && myIncomingCar && (
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
              {isWithinGracePeriod 
                ? `إلغاء الحجز السريع (${cancelTimeLeft}ث)` 
                : 'إلغاء الحجز والرجوع للرئيسية'}
            </button>

            {isWithinGracePeriod && (
              <div className="mt-1.5 bg-slate-800 rounded-full h-1 overflow-hidden">
                <div
                  className="h-full bg-red-500 transition-all duration-1000"
                  style={{
                    width: `${(cancelTimeLeft / CANCEL_WINDOW_SECONDS) * 100}%`,
                  }}
                />
              </div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}