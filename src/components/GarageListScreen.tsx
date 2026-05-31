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

  // ─── هل فيه جلسة مكتملة سابقة ────────────────────────────────────────────
  const hasCompletedSession = sessions.some(
    (s) => s.carPlate === currentUser?.carPlate && s.status === 'completed'
  );

  // ✅ هل فيه جلسة نشطة حالياً
const activeSession = sessions.find(
  (s) =>
    s.carPlate === currentUser?.carPlate &&
    s.status === 'active'
);
console.log('🔍 DEBUG:', {
  userPlate: currentUser?.carPlate,
  allSessions: sessions.map(s => ({
    plate: s.carPlate,
    status: s.status,
    id: s.id.slice(0, 8)
  })),
  activeSession: activeSession?.id
});

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

  // ─── حجز مباشر بدون تفاوض ────────────────────────────────────────────────
  const handleDirectBooking = (garage: GarageWithDistance) => {
    if (!currentUser) {
      toast.error('سجل بياناتك أولاً');
      return;
    }

    // ✅ لو فيه جلسة نشطة → روّح لشاشة الجلسة مباشرة
    if (activeSession) {
      setSelectedGarageId(activeSession.garageId);
      setScreen('session');
      toast('لديك جلسة ركن نشطة بالفعل! 🚗', {
        icon: '⚡',
        style: {
          background: '#1e293b',
          color: '#f1f5f9',
          border: '1px solid #334155',
        },
      });
      return;
    }

    const hasPendingOffer = offers.some(
      (o) => o.userId === currentUser.phone && o.status === 'pending'
    );

    const hasIncomingCar = incomingCars.some(
      (c) =>
        c.carPlate === currentUser.carPlate && c.status === 'coming'
    );

    if (hasPendingOffer || hasIncomingCar) {
      toast.error('لديك حجز نشط بالفعل');
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
    <div className="h-full bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <div className="px-4 pt-12 pb-2">
        {/* الصف الأول */}
        <div className="flex justify-between items-center mb-3">
          <div>
            <h1 className="text-lg font-black text-white">
              مرحباً {currentUser?.name} 👋
            </h1>
            <p className="text-slate-500 text-[10px]">ابحث عن أقرب مكان ركن</p>
          </div>
          <img
            src="/images/logo.png"
            alt="بركن"
            className="w-9 h-9 rounded-lg object-contain"
          />
        </div>

        {/* بطاقة المحفظة */}
        <div className="bg-gradient-to-l from-blue-600 to-indigo-700 p-3 rounded-xl mb-2">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-[9px] text-blue-200 font-bold">المحفظة</div>
                <div className="text-lg font-black text-white font-mono leading-tight">
                  {currentUser?.wallet || 0}{' '}
                  <span className="text-[10px]">ج.م</span>
                </div>
              </div>

              <button
                onClick={() => setShowTopUp(true)}
                className="bg-white/20 text-white px-3 py-1.5 rounded-lg font-black text-[10px] flex items-center gap-1 active:scale-95 transition-transform"
              >
                <Plus size={12} /> شحن
              </button>
            </div>

            <div className="text-[10px] bg-white/20 px-2 py-1 rounded-lg text-white font-bold">
              🚗 {currentUser?.carPlate}
            </div>
          </div>
        </div>

        {/* ✅ بانر الجلسة النشطة */}
        {activeSession && (
          <motion.button
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => {
              setSelectedGarageId(activeSession.garageId);
              setScreen('session');
            }}
            className="w-full bg-emerald-600/20 border border-emerald-500/40 rounded-xl p-3 mb-2 flex items-center justify-between active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-black text-emerald-400">
                عرض الجلسة النشطة ←
              </span>
            </div>
            <div className="text-right">
              <div className="text-xs font-black text-white">
                🚗 لديك جلسة ركن نشطة
              </div>
              <div className="text-[9px] text-emerald-400/70">
                اضغط للعودة للجلسة
              </div>
            </div>
          </motion.button>
        )}

        {/* طرق الدفع */}
        <div className="flex items-center gap-1.5 mb-2 px-1">
          <span className="text-[9px] text-slate-400 font-bold whitespace-nowrap">
            💰 ادفع بعد الركنة:
          </span>
          <span className="text-[8px] text-emerald-400 font-bold">نقدي</span>
          <span className="text-slate-700">·</span>
          <span className="text-[8px] text-purple-400 font-bold">إنستاباي</span>
          <span className="text-slate-700">·</span>
          <span className="text-[8px] text-blue-400 font-bold">محفظة</span>
        </div>

        {/* البحث + تحديد الموقع */}
        <div className="flex gap-1.5 mb-2">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              className="w-full bg-slate-900 border border-slate-800 p-2.5 pr-9 rounded-xl text-right font-bold text-white outline-none text-xs placeholder:text-slate-600"
              placeholder="ابحث عن جراج..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            onClick={getUserLocation}
            disabled={locationLoading}
            className={`p-3 rounded-2xl border transition-all ${
              locationLoading
                ? 'bg-slate-800 border-slate-700 text-slate-500'
                : 'bg-emerald-600/20 border-emerald-500/30 text-emerald-400 active:scale-95'
            }`}
          >
            <Locate
              size={16}
              className={locationLoading ? 'animate-spin' : ''}
            />
          </button>

          <button
            onClick={() => setShowNearbyOnly(!showNearbyOnly)}
            className={`px-3 py-2.5 rounded-xl text-[10px] font-black transition-all border whitespace-nowrap ${
              showNearbyOnly
                ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            <Filter size={14} className="inline ml-1" />
            {showNearbyOnly ? 'الكل' : 'قريب'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-1 pb-4">
        {/* أزرار سريعة */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {hasCompletedSession && (
            <button
              onClick={() => setScreen('lastSession')}
              className="bg-gradient-to-l from-blue-600/20 to-slate-900 border border-blue-500/20 rounded-2xl p-3 flex items-center gap-2 active:scale-[0.98] transition-all"
            >
              <div className="bg-blue-600/20 p-2 rounded-xl shrink-0">
                <Receipt size={14} className="text-blue-400" />
              </div>
              <div className="text-right flex-1">
                <div className="text-[10px] font-black text-white">آخر جلسة</div>
                <div className="text-[8px] text-slate-500">عرض التفاصيل</div>
              </div>
            </button>
          )}

          <button
            onClick={() => setScreen('chat')}
            className={`bg-gradient-to-l from-purple-600/20 to-slate-900 border border-purple-500/20 rounded-2xl p-3 flex items-center gap-2 active:scale-[0.98] transition-all ${
              !hasCompletedSession ? 'col-span-2' : ''
            }`}
          >
            <div className="bg-purple-600/20 p-2 rounded-xl shrink-0">
              <MessageCircle size={14} className="text-purple-400" />
            </div>
            <div className="text-right flex-1">
              <div className="text-[10px] font-black text-white">تواصل معنا</div>
              <div className="text-[8px] text-slate-500">شكاوى واستفسارات</div>
            </div>
          </button>
        </div>

        {/* قريب */}
        {nearbyGarages.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3 justify-end">
              <span className="text-xs text-slate-500">
                ({nearbyGarages.length})
              </span>
              <h2 className="text-sm font-black text-emerald-400 flex items-center gap-2">
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
                />
              ))}
            </div>
          </div>
        )}

        {/* بعيد */}
        {farGarages.length > 0 && !showNearbyOnly && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3 justify-end">
              <span className="text-xs text-slate-500">
                ({farGarages.length})
              </span>
              <h2 className="text-sm font-black text-amber-400 flex items-center gap-2">
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
                />
              ))}
            </div>
          </div>
        )}

        {filteredGarages.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🔍</div>
            <p className="text-slate-500 text-sm">لا توجد جراجات متاحة</p>
          </div>
        )}
      </div>

      {/* مودال شحن المحفظة */}
      <AnimatePresence>
        {showTopUp && <TopUpWalletModal onClose={() => setShowTopUp(false)} />}
      </AnimatePresence>
    </div>
  );
}

function GarageCard({
  garage,
  index,
  onSelect,
  isNearby,
  isClosest,
  hasActiveSession,
}: {
  garage: GarageWithDistance;
  index: number;
  onSelect: () => void;
  isNearby: boolean;
  isClosest?: boolean;
  hasActiveSession?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className={`border rounded-2xl p-3.5 active:scale-[0.98] transition-transform cursor-pointer ${
        isNearby
          ? 'bg-slate-900 border-emerald-500/30'
          : 'bg-slate-900 border-slate-800'
      }`}
      onClick={onSelect}
    >
      {/* الصف الأول */}
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded text-[10px] font-bold">
            <Star size={10} fill="currentColor" />
            {garage.rating}
          </div>

          {garage.availableSpots === 0 && (
            <span className="bg-red-500/20 text-red-400 text-[8px] font-black px-1.5 py-0.5 rounded">
              ممتلئ
            </span>
          )}

          {isClosest && garage.availableSpots > 0 ? (
            <span className="bg-blue-500/20 text-blue-400 text-[8px] font-black px-1.5 py-0.5 rounded">
              الأقرب إليك 📍
            </span>
          ) : isNearby && garage.availableSpots > 0 ? (
            <span className="bg-emerald-500/20 text-emerald-400 text-[8px] font-black px-1.5 py-0.5 rounded">
              قريب
            </span>
          ) : null}
        </div>

        <h3 className="text-sm font-black text-white">{garage.name}</h3>
      </div>

      {/* الصف الثاني */}
      <div className="flex items-center gap-1 justify-end text-slate-500 text-[10px] mb-2.5">
        <span>{garage.location}</span>
        <MapPin size={10} />
      </div>

      {/* الصف الثالث */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div
          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${
            isNearby ? 'bg-emerald-600/10' : 'bg-slate-950/60'
          }`}
        >
          <Navigation
            size={12}
            className={isNearby ? 'text-emerald-400' : 'text-amber-400'}
          />
          <span
            className={`text-xs font-black font-mono ${
              isNearby ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {formatDuration(garage.minutes)}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-blue-400 font-black font-mono">
            {garage.availableSpots}{' '}
            <span className="text-slate-500 font-normal">شاغر</span>
          </span>
          <span className="text-slate-700">·</span>
          <span className="text-emerald-400 font-black font-mono">
            {garage.basePrice}{' '}
            <span className="text-slate-500 font-normal">ج.م/س</span>
          </span>
        </div>
      </div>

      {/* زر الحجز */}
      <button
        className={`w-full py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 ${
          garage.availableSpots === 0
            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
            : hasActiveSession
            ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
            : isClosest
            ? 'bg-blue-600 text-white'
            : isNearby
            ? 'bg-emerald-600 text-white'
            : 'bg-blue-600 text-white'
        }`}
        disabled={garage.availableSpots === 0}
      >
        <Car size={14} />
        {garage.availableSpots === 0
          ? 'ممتلئ - لا يمكن الحجز'
          : hasActiveSession
          ? '⚡ عرض جلستك النشطة'
          : isClosest
          ? 'احجز الأقرب إليك'
          : isNearby
          ? 'احجز - قريب منك'
          : 'احجز مكان'}
      </button>
    </motion.div>
  );
}