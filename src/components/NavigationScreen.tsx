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
  Zap,
} from 'lucide-react';
import { useStore, validatePlate, ParkingSession, IncomingCar } from '../store';
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
const CANCEL_WINDOW_SECONDS = 30; // مهلة الـ 30 ثانية للعميل قبل إشعار السايس

/* ─── Icons ─── */
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

/* ─── Helper: توحيد تحويل الوقت ─── */
const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

/* ─── Helper: [إصلاح آمن] توحيد بصمة اللوحة لمنع تعارض المطابقة ─── */
const normalizePlate = (plate?: string): string => {
  if (!plate) return '';
  let cleaned = plate.trim();

  // رفض الحروف الإنجليزية تماماً لتجنب ثغرات الالتفاف
  if (/[a-zA-Z]/.test(cleaned)) return '';

  // تحويل الأرقام العربية والفارسية إلى أرقام موحدة
  cleaned = cleaned
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶٧٨٩'.indexOf(d)));

  // توحيد الحروف المتشابهة
  const charMap: Record<string, string> = {
    'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ء': 'ا',
    'ة': 'ت',
    'ى': 'ي', 'ئ': 'ي',
    'ؤ': 'و',
    'پ': 'ب', 'چ': 'ج', 'ژ': 'ز', 'گ': 'ك', 'ڤ': 'ف',
    'ک': 'ك', 'ی': 'ي',
  };
  cleaned = cleaned.replace(/./g, (char) => charMap[char] || char);

  // تنظيف كامل للمسافات والرموز لدمج الحروف والتحقق
  cleaned = cleaned.replace(/[^0-9\u0600-\u06FF]/g, '');

  return cleaned;
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
    setTimeout(() => {
      map.invalidateSize();
    }, 250);

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
  const userPhoneClean = currentUser?.phone ? currentUser.phone.replace(/[^\d+]/g, '') : '';

  /* ── الكشف عن السيارة القادمة ── */
  const myIncomingCar = useMemo(() => {
    return (incomingCars as IncomingCar[]).find(
      (c) =>
        c.garageId === selectedGarageId &&
        normalizePlate(c.carPlate) === userPlateNav &&
        c.status === 'coming',
    );
  }, [incomingCars, selectedGarageId, userPlateNav]);

  /* ✅ الكشف اللحظي عن الجلسة النشطة */
  const myActiveSession = useMemo(() => {
    return (sessions as ParkingSession[])
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
     ██  REALTIME فائق السرعة والأمان
     ───────────────────────────────────────────── */
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

    // Polling آمن وموفر للبطارية كل 5 ثوانٍ بدلاً من 1.5 ثانية لمنع نفاد بطارية الهاتف المحمول
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
    const t = setTimeout(() => setMapReady(true), 200);
    return () => clearTimeout(t);
  }, []);

  /* ─── مؤقت الإلغاء وحساب الوقت المتبقي الفعلي بدقة ضد تجميد الخلفية ─── */
  useEffect(() => {
    if (!myIncomingCar) {
      setCancelTimeLeft(CANCEL_WINDOW_SECONDS);
      setCanCancel(true);
      return;
    }

    screenEnteredRef.current = Date.now();
    setCancelTimeLeft(CANCEL_WINDOW_SECONDS);
    setCanCancel(true);

    const interval = window.setInterval(() => {
      // الاعتماد على فارق التوقيت المطلق لمنع تجميد الموبايل عند الخروج المؤقت من الشاشة
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

  /* ─── إرسال Push للجراج فور انتهاء الـ 30 ثانية ─── */
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

  /* ─── Computed ─── */
  const distance = calculateDistance(
    userPos.lat, userPos.lng,
    garage.lat, garage.lng,
  );
  const minutes = distanceToMinutes(distance);
  const coordsText = `${garage.lat},${garage.lng}`;

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

      // 🛡️ فحص اللوحة قبل الركن الفعلي من دالة التحقق الصارمة
      const plateValidation = validatePlate(myIncomingCar.carPlate);
      const finalPlate = plateValidation.isValid ? plateValidation.normalizedPlate : myIncomingCar.carPlate;

      await addSession({
        garageId: garage.id,
        carPlate: finalPlate,
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

        {/* 🗺️ الخريطة المحدثة والمجانية 100% */}
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

        {/* زر وصلت للجراج - [التحكم اليدوي الكامل للعميل] */}
        {!myActiveSession && (
          <button
            onClick={handleCarArrived}
            disabled={isArrivingRef.current}
            className="w-full py-4 rounded-2xl active:scale-95 transition-transform flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #0055FF 0%, #0022AA 100%)', // العودة للنمط الكلاسيكي الأزرق المعتمد
              boxShadow: '0 8px 24px rgba(0,102,255,0.3)',
              border: 'none',
            }}
          >
            <Navigation size={18} color="#ffffff" />
            <span className="font-black text-white text-center" style={{ color: '#ffffff', fontWeight: 900, fontSize: '16px' }}>
              📍 وصلت الجراج وبدء الركن
            </span>
          </button>
        )}

        {/* زر الإلغاء */}
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