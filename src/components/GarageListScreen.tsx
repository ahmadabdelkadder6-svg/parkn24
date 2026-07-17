import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin,
  Star,
  Car,
  Search,
  Navigation,
  Clock,
  Locate,
  Filter,
  Plus,
  Receipt,
  MessageCircle,
   DollarSign,
} from 'lucide-react';
import { useStore, Garage } from '../store';
import {
  calculateDistance,
  distanceToMinutes,
  classifyDistance,
  formatDuration,
} from '../utils/distance';
import TopUpWalletModal from './TopUpWalletModal';
import toast from 'react-hot-toast';

interface GarageWithDistance extends Garage {
  distance: number;
  minutes: number;
  classification: 'nearby' | 'far';
}

const normalizePlateForCompare = (plate?: string): string => {
  if (!plate) return '';
  return plate
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/\s+/g, ' ')
    .toUpperCase();
};

export default function GarageListScreen() {
  const {
    garages,
    setSelectedGarageId,
    setScreen,
    currentUser,
    sessions,
    incomingCars,
    offers,
    addIncomingCar,
  } = useStore();

  const [search, setSearch] = useState('');
  const [showNearbyOnly, setShowNearbyOnly] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>({
    lat: 30.0444,
    lng: 31.2357,
  });
  const [locationLoading, setLocationLoading] = useState(false);

  const normalizedUserPlate = normalizePlateForCompare(currentUser?.carPlate);

  const hasCompletedSession = sessions.some(
    (s) =>
      normalizePlateForCompare(s.carPlate) === normalizedUserPlate &&
      s.status === 'completed'
  );

  const activeSession = sessions.find(
    (s) =>
      normalizePlateForCompare(s.carPlate) === normalizedUserPlate &&
      s.status === 'active'
  );

  const myIncomingCar = incomingCars.find(
    (c) =>
      normalizePlateForCompare(c.carPlate) === normalizedUserPlate &&
      c.status === 'coming'
  );

  const getUserLocation = () => {
    setLocationLoading(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          setLocationLoading(false);
        },
        () => setLocationLoading(false),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setLocationLoading(false);
    }
  };

  useEffect(() => {
    getUserLocation();
  }, []);

  const garagesWithDistance: GarageWithDistance[] = useMemo(() => {
    return garages
      .map((garage) => {
        const distance = calculateDistance(
          userLocation.lat,
          userLocation.lng,
          garage.lat,
          garage.lng
        );
        const minutes = distanceToMinutes(distance);
        return {
          ...garage,
          distance,
          minutes,
          classification: classifyDistance(minutes),
        };
      })
      .sort((a, b) => a.minutes - b.minutes);
  }, [garages, userLocation]);

  const filteredGarages = useMemo(() => {
    let filtered = garagesWithDistance;

    if (search) {
      filtered = filtered.filter(
        (g) => g.name.includes(search) || g.location.includes(search)
      );
    }

    if (showNearbyOnly) {
      filtered = filtered.filter((g) => g.classification === 'nearby');
    }

    return filtered;
  }, [garagesWithDistance, search, showNearbyOnly]);

  const nearbyGarages = filteredGarages.filter(
    (g) => g.classification === 'nearby'
  );
  const farGarages = filteredGarages.filter(
    (g) => g.classification === 'far'
  );

  const handleDirectBooking = (garage: GarageWithDistance) => {
    if (!currentUser) {
      toast.error('سجل بياناتك أولاً');
      return;
    }

    if (activeSession) {
      setSelectedGarageId(activeSession.garageId);
      setScreen('session');
      toast('لديك جلسة ركن نشطة بالفعل! 🚗', { icon: '⚡' });
      return;
    }

    if (myIncomingCar) {
      setSelectedGarageId(myIncomingCar.garageId);
      setScreen('navigation');
      toast('لديك حجز نشط بالفعل! 📍', { icon: '🚗' });
      return;
    }

    const hasPendingOffer = offers.some(
      (o) => o.userId === currentUser.phone && o.status === 'pending'
    );

    if (hasPendingOffer) {
      toast.error('لديك عرض معلق بالفعل');
      return;
    }

    if (garage.availableSpots <= 0) {
      toast.error('لا توجد أماكن متاحة حالياً');
      return;
    }

    const estimatedMinutes = Math.max(3, garage.minutes);

    setSelectedGarageId(garage.id);

    addIncomingCar({
      garageId: garage.id,
      carPlate: currentUser.carPlate,
      customerName: currentUser.name,
      customerPhone: currentUser.phone,
      agreedPrice: garage.basePrice,
      estimatedArrival: estimatedMinutes,
    });

    toast.success(
      `تم الحجز في ${garage.name} بسعر ${garage.basePrice} ج.م/ساعة 🚗`
    );
    setScreen('navigation');
  };

  return (
    <div className="h-full bg-slate-50 flex flex-col" style={{ color: '#0f172a' }}>
      {/* ── Header ─────────────────────────── */}
      <div className="px-4 pt-12 pb-2 bg-white border-b border-slate-100">
        {/* الصف الأول */}
        <div className="flex justify-between items-center mb-3">
          <div>
            <h1 className="text-lg font-black" style={{ color: '#0f172a' }}>
              مرحباً {currentUser?.name} 👋
            </h1>
            <p className="text-[10px]" style={{ color: '#94a3b8' }}>ابحث عن أقرب مكان ركن</p>
          </div>
          <img
            src="/images/logo.png"
            alt="بركن"
            className="w-10 h-10 rounded-xl object-contain shadow-md border border-slate-100"
          />
        </div>

        {/* ── بطاقة المحفظة ───────────────── */}
        <div
          className="bg-gradient-to-l from-blue-600 to-indigo-700 p-4 rounded-2xl mb-3 shadow-xl shadow-blue-200"
          style={{ color: '#ffffff' }}
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-[9px] font-bold opacity-80">المحفظة</div>
                <div className="text-xl font-black font-mono leading-tight">
                  {currentUser?.wallet || 0}{' '}
                  <span className="text-[10px] opacity-80">ج.م</span>
                </div>
              </div>

              <button
                onClick={() => setShowTopUp(true)}
                className="bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-lg font-black text-[10px] flex items-center gap-1 active:scale-95 transition-transform hover:bg-white/30"
              >
                <Plus size={12} /> شحن
              </button>
            </div>

            <div className="text-[10px] bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-lg font-bold">
              🚗 {currentUser?.carPlate}
            </div>
          </div>
        </div>

        {/* ── بانر الجلسة النشطة ──────────── */}
        {activeSession && (
          <motion.button
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => {
              setSelectedGarageId(activeSession.garageId);
              setScreen('session');
            }}
            className="w-full bg-emerald-600 rounded-2xl p-3 mb-3 flex items-center justify-between active:scale-[0.98] transition-all shadow-lg shadow-emerald-200"
            style={{ color: '#ffffff' }}
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-xs font-black">
                عرض الجلسة النشطة ←
              </span>
            </div>
            <div className="text-right">
              <div className="text-xs font-black">
                🚗 لديك جلسة ركن نشطة
              </div>
              <div className="text-[9px] opacity-80">
                اضغط للعودة للجلسة
              </div>
            </div>
          </motion.button>
        )}

        {/* ── بانر السيارة في الطريق ────────── */}
        {!activeSession && myIncomingCar && (
          <motion.button
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => {
              setSelectedGarageId(myIncomingCar.garageId);
              setScreen('navigation');
            }}
            className="w-full bg-cyan-600 rounded-2xl p-3 mb-3 flex items-center justify-between active:scale-[0.98] transition-all shadow-lg shadow-cyan-200"
            style={{ color: '#ffffff' }}
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-xs font-black">
                عرض التوجيه ←
              </span>
            </div>
            <div className="text-right">
              <div className="text-xs font-black">
                📍 لديك حجز نشط
              </div>
              <div className="text-[9px] opacity-80">
                اضغط للعودة للتوجيه
              </div>
            </div>
          </motion.button>
        )}

        {/* ── طرق الدفع ───────────────────── */}
        <div className="flex items-center gap-1.5 mb-3 px-1">
          <span className="text-[9px] font-bold whitespace-nowrap" style={{ color: '#94a3b8' }}>
            💰 ادفع بعد الركنة:
          </span>
          <span className="text-[8px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded-full">نقدي</span>
          <span className="text-[8px] font-black bg-purple-600 text-white px-2 py-0.5 rounded-full">إنستاباي</span>
          <span className="text-[8px] font-black bg-blue-600 text-white px-2 py-0.5 rounded-full">محفظة</span>
        </div>

        {/* ── البحث + تحديد الموقع ─────────── */}
        <div className="flex gap-1.5 mb-2">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: '#94a3b8' }}
            />
            <input
              className="w-full bg-slate-50 border border-slate-200 p-2.5 pr-9 rounded-xl text-right font-bold outline-none text-xs focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
              style={{ color: '#0f172a' }}
              placeholder="ابحث عن جراج..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            onClick={getUserLocation}
            disabled={locationLoading}
            className={`p-3 rounded-2xl border transition-all shadow-sm ${
              locationLoading
                ? 'bg-slate-100 border-slate-200 text-slate-400'
                : 'bg-emerald-600 border-emerald-600 text-white active:scale-95 shadow-emerald-200'
            }`}
          >
            <Locate
              size={16}
              className={locationLoading ? 'animate-spin' : ''}
            />
          </button>

          <button
            onClick={() => setShowNearbyOnly(!showNearbyOnly)}
            className={`px-3 py-2.5 rounded-xl text-[10px] font-black transition-all border whitespace-nowrap shadow-sm ${
              showNearbyOnly
                ? 'bg-blue-600 border-blue-600 text-white shadow-blue-200'
                : 'bg-white border-slate-200 shadow-sm'
            }`}
            style={!showNearbyOnly ? { color: '#64748b' } : {}}
          >
            <Filter size={14} className="inline ml-1" />
            {showNearbyOnly ? 'الكل' : 'قريب'}
          </button>
        </div>
      </div>

      {/* ── Content ────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
        {/* ── أزرار سريعة ──────────────────── */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {hasCompletedSession && (
            <button
              onClick={() => setScreen('lastSession')}
              className="bg-white border-2 border-blue-100 rounded-2xl p-3 flex items-center gap-2 active:scale-[0.98] transition-all shadow-sm hover:shadow-md hover:border-blue-200"
            >
              <div className="bg-blue-600 p-2 rounded-xl shrink-0 shadow-md shadow-blue-200" style={{ color: '#ffffff' }}>
                <Receipt size={14} />
              </div>
              <div className="text-right flex-1">
                <div className="text-[10px] font-black" style={{ color: '#0f172a' }}>آخر جلسة</div>
                <div className="text-[8px]" style={{ color: '#94a3b8' }}>عرض التفاصيل</div>
              </div>
            </button>
          )}

          <button
            onClick={() => setScreen('chat')}
            className={`bg-white border-2 border-purple-100 rounded-2xl p-3 flex items-center gap-2 active:scale-[0.98] transition-all shadow-sm hover:shadow-md hover:border-purple-200 ${
              !hasCompletedSession ? 'col-span-2' : ''
            }`}
          >
            <div className="bg-purple-600 p-2 rounded-xl shrink-0 shadow-md shadow-purple-200" style={{ color: '#ffffff' }}>
              <MessageCircle size={14} />
            </div>
            <div className="text-right flex-1">
              <div className="text-[10px] font-black" style={{ color: '#0f172a' }}>تواصل معنا</div>
              <div className="text-[8px]" style={{ color: '#94a3b8' }}>شكاوى واستفسارات</div>
            </div>
          </button>
        </div>

        {/* ── قريب ─────────────────────────── */}
        {nearbyGarages.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3 justify-end">
              <span className="bg-emerald-600 text-white px-2 py-0.5 rounded-full text-[10px] font-black shadow-sm">
                {nearbyGarages.length}
              </span>
              <h2 className="text-sm font-black flex items-center gap-2" style={{ color: '#059669' }}>
                أماكن قريبة (1-17 دقيقة)
                <Navigation size={14} />
              </h2>
            </div>

            <div className="space-y-3">
              {nearbyGarages.map((garage, i) => (
                <GarageCard
                  key={garage.id}
                  garage={garage}
                  index={i}
                  onSelect={() => handleDirectBooking(garage)}
                  isNearby
                  isClosest={i === 0}
                  hasActiveSession={!!activeSession}
                  hasIncomingCar={!!myIncomingCar}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── بعيد ─────────────────────────── */}
        {farGarages.length > 0 && !showNearbyOnly && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3 justify-end">
              <span className="bg-amber-500 text-white px-2 py-0.5 rounded-full text-[10px] font-black shadow-sm">
                {farGarages.length}
              </span>
              <h2 className="text-sm font-black flex items-center gap-2" style={{ color: '#d97706' }}>
                خيارات أخرى (+17 دقيقة)
                <Clock size={14} />
              </h2>
            </div>

            <div className="space-y-3">
              {farGarages.map((garage, i) => (
                <GarageCard
                  key={garage.id}
                  garage={garage}
                  index={i}
                  onSelect={() => handleDirectBooking(garage)}
                  isNearby={false}
                  isClosest={nearbyGarages.length === 0 && i === 0}
                  hasActiveSession={!!activeSession}
                  hasIncomingCar={!!myIncomingCar}
                />
              ))}
            </div>
          </div>
        )}

        {filteredGarages.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🔍</div>
            <p className="text-sm font-bold" style={{ color: '#94a3b8' }}>لا توجد جراجات متاحة</p>
            <p className="text-xs mt-1" style={{ color: '#cbd5e1' }}>جرب تغيير البحث أو الموقع</p>
          </div>
        )}
      </div>

      {/* ── مودال شحن المحفظة ──────────────── */}
      <AnimatePresence>
        {showTopUp && <TopUpWalletModal onClose={() => setShowTopUp(false)} />}
      </AnimatePresence>
    </div>
  );
}

// ════════════════════════════════════════
// GarageCard - بطاقة الجراج الاحترافية
// ════════════════════════════════════════
function GarageCard({
  garage,
  index,
  onSelect,
  isNearby,
  isClosest,
  hasActiveSession,
  hasIncomingCar,
}: {
  garage: GarageWithDistance;
  index: number;
  onSelect: () => void;
  isNearby: boolean;
  isClosest?: boolean;
  hasActiveSession?: boolean;
  hasIncomingCar?: boolean;
}) {
  const isBusy = hasActiveSession || hasIncomingCar;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className={`bg-white border-2 rounded-2xl p-4 active:scale-[0.98] transition-all cursor-pointer shadow-sm hover:shadow-lg ${
        isClosest && !isBusy
          ? 'border-blue-300 shadow-blue-100'
          : isNearby
          ? 'border-emerald-200 hover:border-emerald-300'
          : 'border-slate-200 hover:border-slate-300'
      }`}
      onClick={onSelect}
    >
      {/* الصف الأول */}
      <div className="flex justify-between items-center mb-2.5">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 bg-amber-500 text-white px-2 py-0.5 rounded-lg text-[10px] font-bold shadow-sm">
            <Star size={10} fill="currentColor" />
            {garage.rating}
          </div>

          {garage.availableSpots === 0 && (
            <span className="bg-red-600 text-white text-[8px] font-black px-2 py-0.5 rounded-lg shadow-sm">
              ممتلئ
            </span>
          )}

          {!isBusy && isClosest && garage.availableSpots > 0 ? (
            <span className="bg-blue-600 text-white text-[8px] font-black px-2 py-0.5 rounded-lg shadow-sm">
              الأقرب إليك 📍
            </span>
          ) : !isBusy && isNearby && garage.availableSpots > 0 ? (
            <span className="bg-emerald-600 text-white text-[8px] font-black px-2 py-0.5 rounded-lg shadow-sm">
              قريب
            </span>
          ) : null}
        </div>

        <h3 className="text-sm font-black" style={{ color: '#0f172a' }}>{garage.name}</h3>
      </div>

      {/* الصف الثاني */}
      <div className="flex items-center gap-1 justify-end text-[10px] mb-3" style={{ color: '#94a3b8' }}>
        <span>{garage.location}</span>
        <MapPin size={10} />
      </div>

      {/* الصف الثالث - إحصائيات */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl shadow-sm ${
            isNearby ? 'bg-emerald-600' : 'bg-amber-500'
          }`}
          style={{ color: '#ffffff' }}
        >
          <Navigation size={12} />
          <span className="text-xs font-black font-mono">
            {formatDuration(garage.minutes)}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[10px]">
          <div className="flex items-center gap-1">
            <Car size={12} style={{ color: '#2563eb' }} />
            <span className="font-black font-mono" style={{ color: '#2563eb' }}>
              {garage.availableSpots}
            </span>
            <span style={{ color: '#94a3b8' }}>شاغر</span>
          </div>
          <div className="w-px h-3 bg-slate-200" />
          <div className="flex items-center gap-1">
            <DollarSign size={12} style={{ color: '#059669' }} />
            <span className="font-black font-mono" style={{ color: '#059669' }}>
              {garage.basePrice}
            </span>
            <span style={{ color: '#94a3b8' }}>ج.م/س</span>
          </div>
        </div>
      </div>

      {/* زر الحجز */}
      <button
        className={`w-full py-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all shadow-md ${
          garage.availableSpots === 0
            ? 'bg-slate-200 cursor-not-allowed'
            : hasActiveSession
            ? 'bg-emerald-600 text-white shadow-emerald-200 active:scale-95'
            : hasIncomingCar
            ? 'bg-cyan-600 text-white shadow-cyan-200 active:scale-95'
            : isClosest
            ? 'bg-blue-600 text-white shadow-blue-200 active:scale-95'
            : isNearby
            ? 'bg-emerald-600 text-white shadow-emerald-200 active:scale-95'
            : 'bg-blue-600 text-white shadow-blue-200 active:scale-95'
        }`}
        style={garage.availableSpots === 0 ? { color: '#94a3b8' } : {}}
        disabled={garage.availableSpots === 0}
      >
        <Car size={14} />
        {garage.availableSpots === 0
          ? 'ممتلئ - لا يمكن الحجز'
          : hasActiveSession
          ? '⚡ عرض جلستك النشطة'
          : hasIncomingCar
          ? '📍 عرض حجزك النشط'
          : isClosest
          ? '🅿️ احجز الأقرب إليك'
          : isNearby
          ? '🅿️ احجز - قريب منك'
          : '🅿️ احجز مكان'}
      </button>
    </motion.div>
  );
}