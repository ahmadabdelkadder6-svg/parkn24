import { useState, useEffect, useRef } from 'react';
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
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      } catch {
        map.setView(garagePos, 15);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, userPos[0], userPos[1], garagePos[0], garagePos[1]]);

  return null;
}

/* ════════════════════════════════════════════════════════════
   ██  NAVIGATION SCREEN
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
  const userPlateNav = (currentUser?.carPlate ?? '').trim().toUpperCase();

  /* ── الجلسات والسيارات ── */
  const myIncomingCar = incomingCars.find(
    (c) =>
      c.garageId === selectedGarageId &&
      c.carPlate.trim().toUpperCase() === userPlateNav &&
      c.status === 'coming',
  );

  /* ✅ البحث عن الجلسة النشطة باللوحة أو رقم الهاتف - يشمل الجلسات اللي بدأها الجراج */
const myActiveSession = sessions
  .filter(
    (sess) =>
      sess.status === 'active' &&
      (
        sess.carPlate.trim().toUpperCase() === userPlateNav ||
        (sess as any).customerPhone === currentUser?.phone
      ),
  )
  .sort((a, b) => toMs(b.startTime) - toMs(a.startTime))[0];

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
  const screenEnteredRef = useRef(Date.now());
  const navigatedToSessionRef = useRef(false);
  const isArrivingRef = useRef(false);
  const pushSentRef = useRef(false);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeChannelRef = useRef<any>(null);

  /* ─────────────────────────────────────────────
     ██  REALTIME: الاستماع لجدول sessions
         حل مشكلة عداد الركن من شاشة الجراج
     ───────────────────────────────────────────── */
  useEffect(() => {
    if (!selectedGarageId || !userPlateNav) return;

    /* فورًا فتش آخر بيانات */
    fetchAll();

    const channel = supabase
      .channel(`nav-session-${userPlateNav}-${selectedGarageId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sessions',
          filter: `garage_id=eq.${selectedGarageId}`,
        },
        async (payload) => {
          const row = payload.new as any;
          const plate = (row.car_plate ?? '').trim().toUpperCase();
          const phone = row.customer_phone ?? '';

          /* هل الجلسة دي بتاعتي؟ */
          const isMySession =
            plate === userPlateNav ||
            (currentUser?.phone && phone === currentUser.phone);

          if (isMySession && row.status === 'active') {
            /* حدّث الـ store */
            await fetchAll();
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `garage_id=eq.${selectedGarageId}`,
        },
        async () => {
          await fetchAll();
        },
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      realtimeChannelRef.current = null;
    };
  }, [selectedGarageId, userPlateNav, currentUser?.phone, fetchAll]);

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

  /* ─── مؤقت الإلغاء ─── */
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

  /* ─── إرسال Push بعد انتهاء فترة الإلغاء ─── */
  useEffect(() => {
    if (!myIncomingCar || !garage || pushSentRef.current) return;

    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    setPushStatus('waiting');

    pushTimerRef.current = setTimeout(async () => {
      const stillComing = useStore
        .getState()
        .incomingCars.find(
          (c) => c.id === myIncomingCar.id && c.status === 'coming',
        );

      if (!stillComing || pushSentRef.current) {
        setPushStatus('cancelled');
        return;
      }

      try {
        pushSentRef.current = true;
        const dist = calculateDistance(
          userPos.lat, userPos.lng,
          garage.lat, garage.lng,
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
        console.error('❌ خطأ في إرسال Push:', err);
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

  /* ─────────────────────────────────────────────
     ██  الانتقال التلقائي لشاشة الجلسة
         يعمل سواء بدأت الجلسة من الحريف أو من الجراج
     ───────────────────────────────────────────── */
  useEffect(() => {
    if (!myActiveSession) return;
    if (navigatedToSessionRef.current) return;

    navigatedToSessionRef.current = true;

    /* لو الجلسة في جراج مختلف → حدّث الاختيار */
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

  /* ─── Guard ─── */
  if (!garage) {
    return (
      <div className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-8">
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
      toast.success('تم نسخ الإحداثيات');
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

    /* إرسال Push فوري لو لسه ما اتبعتش */
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

      /* هل فيه جلسة نشطة بالفعل؟ (من الجراج أو من الحريف) */
      const state = useStore.getState();
      const alreadyActive = state.sessions.find(
        (s) =>
          s.status === 'active' &&
          (
            s.carPlate.trim().toUpperCase() === myIncomingCar.carPlate.trim().toUpperCase() ||
            (s as any).customerPhone === currentUser?.phone
          ),
      );

      if (alreadyActive) {
        await removeIncomingCar(myIncomingCar.id);
        /* تأكد إن الـ garageId صح */
        if (alreadyActive.garageId !== selectedGarageId) {
          setSelectedGarageId(alreadyActive.garageId);
        }
        navigatedToSessionRef.current = true;
        toast.success('تم بدء حساب الركن ⏱️');
        setScreen('session');
        return;
      }

      /* مفيش جلسة → أنشئ واحدة */
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

  /* ─────────────────────────────────────────────
     ██  RENDER
     ───────────────────────────────────────────── */
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-slate-950 text-white flex flex-col safe-top safe-bottom"
    >
      {/* ══ Header ══ */}
      <div className="flex items-center justify-between px-4 pt-12 pb-2 shrink-0">
        <button
          onClick={() => setScreen('list')}
          className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 active:scale-90 transition-all"
        >
          <ArrowRight size={18} />
        </button>

        <h2 className="text-sm font-black flex items-center gap-1.5">
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

        {/* بطاقة الوقت والمسافة */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shrink-0">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-blue-400" />
              <span className="text-sm font-black text-blue-400 font-mono">
                {formatDuration(minutes)}
              </span>
              <span className="text-slate-700">·</span>
              <span className="text-xs text-slate-400 font-mono">
                {distance.toFixed(1)} كم
              </span>
            </div>
            <div className="text-right">
              <div className="text-sm font-black text-white">{garage.name}</div>
              <div className="flex items-center gap-1 justify-end text-[10px] text-slate-500">
                <span>{garage.location}</span>
                <MapPin size={9} />
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

          <div className="absolute top-3 left-3 bg-slate-900/90 backdrop-blur border border-slate-700 text-[10px] px-2.5 py-1 rounded-full text-slate-300 z-[400] flex items-center gap-1.5 pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
            تتبع مباشر
          </div>
        </div>

        {/* أزرار النسخ وجوجل ماب */}
        <div className="grid grid-cols-2 gap-2 shrink-0">
          <button
            onClick={copyCoords}
            className="bg-slate-900 border border-slate-800 text-slate-300 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
          >
            <Copy size={14} className="text-blue-400" />
            نسخ الإحداثيات
          </button>
          <button
            onClick={openExternalMaps}
            className="bg-slate-900 border border-slate-800 text-slate-300 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
          >
            <ExternalLink size={14} className="text-blue-400" />
            خرائط Google
          </button>
        </div>

        {/* معلومات السعر والأماكن */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
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
            <span className="text-[10px] text-slate-500">الأماكن المتاحة الآن</span>
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
                  : `⏳ سيتم إشعار الجراج بعد ${cancelTimeLeft} ثانية`}
            </span>
          </div>
        )}

        {/* ملاحظة بدء الركن */}
        <div className="bg-emerald-600/10 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-2 shrink-0">
          <CheckCircle size={14} className="text-emerald-400 shrink-0" />
          <span className="text-[10px] font-bold text-emerald-400">
            سيبدأ حساب الركن فور الضغط على "وصلت للجراج" ✅
          </span>
        </div>

        {/* ✅ بانر: الجلسة بدأت من الجراج */}
        {myActiveSession && !navigatedToSessionRef.current && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-emerald-600/15 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-2 shrink-0"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
            <span className="text-[10px] font-bold text-emerald-400">
              ✅ بدأ الجراج حساب الركن - جاري الانتقال لشاشة الجلسة...
            </span>
          </motion.div>
        )}

        {/* زر وصلت */}
        <button
          onClick={handleCarArrived}
          disabled={isArrivingRef.current}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-black text-base shadow-lg shadow-emerald-900/20 active:scale-95 transition-transform flex items-center justify-center gap-2 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Navigation size={18} />
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