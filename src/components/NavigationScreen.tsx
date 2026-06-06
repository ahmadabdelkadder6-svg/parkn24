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
  ExternalLink,
} from 'lucide-react';
import { useStore } from '../store';
import { shallow } from 'zustand/shallow';
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

const CANCEL_WINDOW_SECONDS = 30;

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
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      } catch {
        map.setView(garagePos, 15);
      }
    }
  }, [map, userPos[0], userPos[1], garagePos[0], garagePos[1]]);

  return null;
}

export default function NavigationScreen() {
  // ✅ selector + shallow
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
  } = useStore(
    (s) => ({
      garages: s.garages,
      selectedGarageId: s.selectedGarageId,
      setScreen: s.setScreen,
      incomingCars: s.incomingCars,
      currentUser: s.currentUser,
      cancelOffer: s.cancelOffer,
      removeIncomingCar: s.removeIncomingCar,
      setSelectedGarageId: s.setSelectedGarageId,
      offers: s.offers,
      sessions: s.sessions,
      addSession: s.addSession,
    }),
    shallow
  );

  // ✅ useMemo للحسابات المتكررة
  const userPlateNav = useMemo(
    () => (currentUser?.carPlate ?? '').trim().toUpperCase(),
    [currentUser?.carPlate]
  );

  const garage = useMemo(
    () => garages.find((g) => g.id === selectedGarageId) ?? null,
    [garages, selectedGarageId]
  );

  const myIncomingCar = useMemo(
    () =>
      incomingCars.find(
        (c) =>
          c.garageId === selectedGarageId &&
          c.carPlate.trim().toUpperCase() === userPlateNav &&
          c.status === 'coming'
      ) ?? null,
    [incomingCars, selectedGarageId, userPlateNav]
  );

  const myActiveSession = useMemo(
    () =>
      sessions.find(
        (sess) =>
          sess.carPlate.trim().toUpperCase() === userPlateNav &&
          sess.status === 'active'
      ) ?? null,
    [sessions, userPlateNav]
  );

  const [userPos, setUserPos] = useState<{ lat: number; lng: number }>({
    lat: 30.0444,
    lng: 31.2357,
  });

  const screenEnteredRef = useRef(Date.now());
  const [cancelTimeLeft, setCancelTimeLeft] = useState(CANCEL_WINDOW_SECONDS);
  const [canCancel, setCanCancel] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [pushStatus, setPushStatus] = useState<'waiting' | 'sent' | 'cancelled'>('waiting');
  const navigatedToSessionRef = useRef(false);
  const isArrivingRef = useRef(false);
  const pushSentRef = useRef(false);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── GPS ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (p) => setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {}
    );

    const id = navigator.geolocation.watchPosition(
      (p) => setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 5000 }
    );

    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // ─── تحميل الخريطة ────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setMapReady(true), 300);
    return () => clearTimeout(t);
  }, []);

  // ─── مؤقت الإلغاء ─────────────────────────────────────────────────────────
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
      const elapsed = Math.floor(
        (Date.now() - screenEnteredRef.current) / 1000
      );
      const left = Math.max(0, CANCEL_WINDOW_SECONDS - elapsed);
      setCancelTimeLeft(left);
      if (left <= 0) {
        setCanCancel(false);
        window.clearInterval(interval);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [myIncomingCar?.id]);

  // ─── إرسال Push بعد انتهاء فترة الإلغاء ─────────────────────────────────
  useEffect(() => {
    if (!myIncomingCar || !garage || pushSentRef.current) return;

    if (pushTimerRef.current) {
      clearTimeout(pushTimerRef.current);
    }

    setPushStatus('waiting');

    pushTimerRef.current = setTimeout(async () => {
      const stillComing = useStore.getState().incomingCars.find(
        (c) => c.id === myIncomingCar.id && c.status === 'coming'
      );

      if (!stillComing || pushSentRef.current) {
        setPushStatus('cancelled');
        return;
      }

      try {
        pushSentRef.current = true;

        const dist = calculateDistance(
          userPos.lat,
          userPos.lng,
          garage.lat,
          garage.lng
        );
        const estimatedMinutes = distanceToMinutes(dist);

        await sendCarComingPush({
          garageId: garage.id,
          carPlate: myIncomingCar.carPlate,
          estimatedMinutes: Math.max(1, estimatedMinutes),
          customerName: currentUser?.name,
          agreedPrice: myIncomingCar.agreedPrice,
        });

        setPushStatus('sent');
      } catch (err) {
        console.error('❌ خطأ في إرسال Push للجراج:', err);
        pushSentRef.current = false;
        setPushStatus('waiting');
      }
    }, (CANCEL_WINDOW_SECONDS + 2) * 1000);

    return () => {
      if (pushTimerRef.current) {
        clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
    };
  }, [myIncomingCar?.id, garage?.id]);

  // ─── الانتقال التلقائي لشاشة الجلسة ─────────────────────────────────────
  useEffect(() => {
    if (!myActiveSession) return;
    if (navigatedToSessionRef.current) return;

    navigatedToSessionRef.current = true;

    if (myActiveSession.garageId !== selectedGarageId) {
      setSelectedGarageId(myActiveSession.garageId);
    }

    toast.success('تم بدء حساب الركن ⏱️');
    setScreen('session');
  }, [
    myActiveSession?.id,
    myActiveSession?.garageId,
    selectedGarageId,
    setSelectedGarageId,
    setScreen,
  ]);

  // ✅ useCallback للدوال
  const copyCoords = useCallback(async () => {
    if (!garage) return;
    const coordsText = `${garage.lat},${garage.lng}`;
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
      toast.success('تم نسخ الإحداثيات');
    } catch {
      toast.error('فشل النسخ');
    }
  }, [garage?.lat, garage?.lng]);

  const openExternalMaps = useCallback(() => {
    if (!garage) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${garage.lat},${garage.lng}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [garage?.lat, garage?.lng]);

  const handleCancelBooking = useCallback(async () => {
    if (!currentUser || !myIncomingCar || !garage) return;

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
        (o.status === 'pending' || o.status === 'accepted')
    );
    if (activeOffer) cancelOffer(activeOffer.id);

    removeIncomingCar(myIncomingCar.id);
    toast.success('تم إلغاء الحجز');
    setSelectedGarageId(null);
    setScreen('list');
  }, [currentUser, myIncomingCar, garage, pushStatus, offers, cancelOffer, removeIncomingCar, setSelectedGarageId, setScreen]);

  const handleCarArrived = useCallback(async () => {
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
        setScreen('session');
        return;
      }

      const alreadyActive = useStore.getState().sessions.find(
        (s) =>
          s.carPlate === myIncomingCar.carPlate &&
          s.status === 'active'
      );

      if (alreadyActive) {
        await removeIncomingCar(myIncomingCar.id);
        navigatedToSessionRef.current = true;
        setScreen('session');
        return;
      }

      const relatedOffer = offers.find(
        (o) =>
          o.carPlate === myIncomingCar.carPlate &&
          (o.status === 'pending' || o.status === 'accepted')
      );
      if (relatedOffer) cancelOffer(relatedOffer.id);

      await addSession({
        garageId: garage.id,
        carPlate: myIncomingCar.carPlate,
        startTime: Date.now(),
        status: 'active',
        source: 'app',
        agreedPrice: myIncomingCar.agreedPrice,
      });

      await removeIncomingCar(myIncomingCar.id);

      toast.success('تم بدء حساب الركن ⏱️');
      navigatedToSessionRef.current = true;
      setScreen('session');
    } catch (err) {
      console.error('❌ خطأ:', err);
      toast.error('حدث خطأ، حاول مرة أخرى');
    } finally {
      setTimeout(() => {
        isArrivingRef.current = false;
      }, 5000);
    }
  }, [myIncomingCar, garage, currentUser, offers, cancelOffer, removeIncomingCar, addSession, setScreen]);

  // ✅ حسابات المسافة بـ useMemo
  const { distance, minutes } = useMemo(() => {
    if (!garage) return { distance: 0, minutes: 0 };
    const dist = calculateDistance(
      userPos.lat,
      userPos.lng,
      garage.lat,
      garage.lng
    );
    return {
      distance: dist,
      minutes: distanceToMinutes(dist),
    };
  }, [userPos.lat, userPos.lng, garage?.lat, garage?.lng]);

  if (!garage) {
    return (
      <div className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-8">
        <div className="text-4xl mb-4">🔍</div>
        <p className="text-slate-400 text-sm font-bold text-center mb-6">
          لم يتم تحديد جراج
        </p>
        <button
          type="button"
          onClick={() => setScreen('list')}
          className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black text-sm active:scale-95 transition-all"
        >
          العودة للقائمة
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-slate-950 text-white flex flex-col safe-top safe-bottom"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-12 pb-2 shrink-0">
        <button
          type="button"
          onClick={() => setScreen('list')}
          aria-label="العودة للقائمة"
          className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 active:scale-90 transition-all"
        >
          <ArrowRight size={18} aria-hidden="true" />
        </button>

        <h2 className="text-sm font-black flex items-center gap-1.5">
          <motion.div
            animate={{ x: [0, -3, 0] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            <Navigation size={16} className="text-blue-400" aria-hidden="true" />
          </motion.div>
          التوجيه للجراج
        </h2>

        <div className="w-10" />
      </div>

      <div className="flex-1 px-4 pb-4 flex flex-col gap-3 overflow-y-auto">
        {/* بطاقة الوقت والمسافة */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shrink-0">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-blue-400" aria-hidden="true" />
              <span className="text-sm font-black text-blue-400 font-mono">
                {formatDuration(minutes)}
              </span>
              <span className="text-slate-700" aria-hidden="true">·</span>
              <span className="text-xs text-slate-400 font-mono">
                {distance.toFixed(1)} كم
              </span>
            </div>
            <div className="text-right">
              <div className="text-sm font-black text-white">{garage.name}</div>
              <div className="flex items-center gap-1 justify-end text-xs text-slate-500">
                <span>{garage.location}</span>
                <MapPin size={9} aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>

        {/* الخريطة */}
        <div className="w-full h-64 rounded-2xl overflow-hidden border border-slate-800 relative shrink-0 shadow-lg">
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

          <div className="absolute top-3 left-3 bg-slate-900/90 backdrop-blur border border-slate-700 text-xs px-2.5 py-1 rounded-full text-slate-300 z-[400] flex items-center gap-1.5 pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" aria-hidden="true" />
            تتبع مباشر
          </div>
        </div>

        {/* أزرار النسخ وجوجل ماب */}
        <div className="grid grid-cols-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={copyCoords}
            aria-label="نسخ إحداثيات الجراج"
            className="bg-slate-900 border border-slate-800 text-slate-300 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
          >
            <Copy size={14} className="text-blue-400" aria-hidden="true" />
            نسخ الإحداثيات
          </button>
          <button
            type="button"
            onClick={openExternalMaps}
            aria-label="فتح خرائط Google"
            className="bg-slate-900 border border-slate-800 text-slate-300 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
          >
            <ExternalLink size={14} className="text-blue-400" aria-hidden="true" />
            خرائط Google
          </button>
        </div>

        {/* معلومات السعر والأماكن */}
        <div
          className="bg-slate-900 border border-slate-800 rounded-xl p-3 shrink-0"
          role="region"
          aria-label="معلومات الجراج"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Car size={12} aria-hidden="true" />
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
            <span className="text-xs text-slate-500">
              الأماكن المتاحة الآن
            </span>
          </div>
        </div>

        {/* مؤشر حالة Push */}
        {myIncomingCar && (
          <div
            className={`rounded-xl p-3 flex items-center gap-2 shrink-0 border ${
              pushStatus === 'sent'
                ? 'bg-emerald-600/10 border-emerald-500/20'
                : pushStatus === 'cancelled'
                ? 'bg-red-600/10 border-red-500/20'
                : 'bg-cyan-600/10 border-cyan-500/20'
            }`}
            role="status"
            aria-live="polite"
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                pushStatus === 'sent'
                  ? 'bg-emerald-500'
                  : pushStatus === 'cancelled'
                  ? 'bg-red-500'
                  : 'bg-cyan-500 animate-pulse'
              }`}
              aria-hidden="true"
            />
            <span
              className={`text-xs font-bold ${
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
                : `⏳ سيتم إشعار الجراج بعد ${cancelTimeLeft} ثانية`}
            </span>
          </div>
        )}

        {/* ملاحظة */}
        <div className="bg-emerald-600/10 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-2 shrink-0">
          <CheckCircle size={14} className="text-emerald-400 shrink-0" aria-hidden="true" />
          <span className="text-xs font-bold text-emerald-400">
            سيبدأ حساب الركن فور الضغط على "وصلت للجراج" ✅
          </span>
        </div>

        {/* زر وصلت */}
        <button
          type="button"
          onClick={handleCarArrived}
          disabled={isArrivingRef.current}
          aria-label="تأكيد الوصول وبدء الركن"
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-black text-base shadow-lg shadow-emerald-900/20 active:scale-95 transition-transform flex items-center justify-center gap-2 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Navigation size={18} aria-hidden="true" />
          وصلت للجراج - ابدأ الركن ✅
        </button>

        {/* زر الإلغاء */}
        {canCancel && myIncomingCar && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="shrink-0"
          >
            <button
              type="button"
              onClick={handleCancelBooking}
              aria-label={`إلغاء الحجز - متبقي ${cancelTimeLeft} ثانية`}
              className="w-full bg-slate-900 border border-red-500/20 text-red-400 py-3 rounded-xl font-black text-xs active:scale-95 transition-transform flex items-center justify-center gap-2"
            >
              <XCircle size={16} aria-hidden="true" />
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