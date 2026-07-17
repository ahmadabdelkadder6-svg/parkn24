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
  ChevronRight,
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

/**
 * Professional Color Palette (Vibrant & Accessible):
 * - Primary (Sky Blue): #0EA5E9 (Sky-500)
 * - Secondary (Light Green): #22C55E (Green-500)
 * - Accent (Deep Blue): #0369A1 (Sky-700)
 * - Background: #F8FAFC (Slate-50)
 * - Surface: #FFFFFF
 * - Text Primary: #0F172A (Slate-900)
 * - Text Secondary: #64748B (Slate-500)
 */

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
    <div className="h-full bg-[#F8FAFC] flex flex-col font-sans antialiased">
      {/* ── Header ─────────────────────────── */}
      <div className="px-5 pt-12 pb-4 bg-white border-b border-slate-100 shadow-sm z-10">
        {/* الصف الأول */}
        <div className="flex justify-between items-center mb-5">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
              مرحباً {currentUser?.name} 👋
            </h1>
            <p className="text-xs font-medium text-slate-400 mt-0.5">ابحث عن أفضل مكان لركن سيارتك</p>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-sky-100 rounded-2xl blur-md opacity-50"></div>
            <img
              src="/images/logo.png"
              alt="بركن"
              className="relative w-12 h-12 rounded-2xl object-contain bg-white p-1 border border-slate-100 shadow-sm"
            />
          </div>
        </div>

        {/* ── بطاقة المحفظة ───────────────── */}
        <div
          className="relative overflow-hidden bg-gradient-to-br from-sky-500 to-sky-600 p-5 rounded-3xl mb-4 shadow-lg shadow-sky-200/50 group"
        >
          {/* Decorative Circles */}
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/10 rounded-full transition-transform group-hover:scale-110"></div>
          <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-sky-400/20 rounded-full"></div>

          <div className="relative flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="bg-white/20 p-2.5 rounded-2xl backdrop-blur-md border border-white/30">
                <DollarSign size={20} className="text-white" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-sky-50 uppercase tracking-wider opacity-90">رصيد المحفظة</div>
                <div className="text-2xl font-black text-white leading-tight flex items-baseline gap-1">
                  {currentUser?.wallet || 0}
                  <span className="text-xs font-bold opacity-80">ج.م</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="text-[10px] bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-xl font-black text-white border border-white/20">
                🚗 {currentUser?.carPlate}
              </div>
              <button
                onClick={() => setShowTopUp(true)}
                className="bg-white text-sky-600 px-4 py-2 rounded-xl font-extrabold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all hover:bg-sky-50"
              >
                <Plus size={14} strokeWidth={3} /> شحن
              </button>
            </div>
          </div>
        </div>

        {/* ── بانر الجلسة النشطة ──────────── */}
        {activeSession && (
          <motion.button
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setSelectedGarageId(activeSession.garageId);
              setScreen('session');
            }}
            className="w-full bg-emerald-500 rounded-2xl p-4 mb-4 flex items-center justify-between shadow-lg shadow-emerald-100 border border-emerald-400/20"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-3 h-3 rounded-full bg-white animate-ping absolute inset-0 opacity-75"></div>
                <div className="relative w-3 h-3 rounded-full bg-white shadow-sm"></div>
              </div>
              <span className="text-xs font-extrabold text-white">عرض الجلسة النشطة</span>
            </div>
            <div className="text-right">
              <div className="text-xs font-black text-white flex items-center gap-1 justify-end">
                <span>لديك جلسة ركن نشطة</span>
                <Car size={14} />
              </div>
              <div className="text-[10px] text-emerald-50 font-medium opacity-90 mt-0.5">
                اضغط للعودة وتفاصيل الوقت
              </div>
            </div>
          </motion.button>
        )}

        {/* ── بانر السيارة في الطريق ────────── */}
        {!activeSession && myIncomingCar && (
          <motion.button
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setSelectedGarageId(myIncomingCar.garageId);
              setScreen('navigation');
            }}
            className="w-full bg-sky-600 rounded-2xl p-4 mb-4 flex items-center justify-between shadow-lg shadow-sky-100 border border-sky-500/20"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-3 h-3 rounded-full bg-white animate-ping absolute inset-0 opacity-75"></div>
                <div className="relative w-3 h-3 rounded-full bg-white shadow-sm"></div>
              </div>
              <span className="text-xs font-extrabold text-white">عرض التوجيه</span>
            </div>
            <div className="text-right">
              <div className="text-xs font-black text-white flex items-center gap-1 justify-end">
                <span>لديك حجز نشط</span>
                <Navigation size={14} />
              </div>
              <div className="text-[10px] text-sky-50 font-medium opacity-90 mt-0.5">
                اضغط للعودة لخريطة الوصول
              </div>
            </div>
          </motion.button>
        )}

        {/* ── طرق الدفع ───────────────────── */}
        <div className="flex items-center gap-2 mb-4 px-1 overflow-x-auto no-scrollbar">
          <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">
            خيارات الدفع المتاحة:
          </span>
          <span className="text-[9px] font-extrabold bg-emerald-100 text-emerald-600 px-2.5 py-1 rounded-lg border border-emerald-200/50">نقدي</span>
          <span className="text-[9px] font-extrabold bg-indigo-100 text-indigo-600 px-2.5 py-1 rounded-lg border border-indigo-200/50">إنستاباي</span>
          <span className="text-[9px] font-extrabold bg-sky-100 text-sky-600 px-2.5 py-1 rounded-lg border border-sky-200/50">محفظة</span>
        </div>

        {/* ── البحث + تحديد الموقع ─────────── */}
        <div className="flex gap-2">
          <div className="relative flex-1 group">
            <Search
              size={18}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-sky-500 transition-colors"
            />
            <input
              className="w-full bg-slate-50 border border-slate-200 p-3 pr-10 rounded-2xl text-right font-bold outline-none text-xs focus:bg-white focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10 transition-all placeholder:text-slate-400 text-slate-900"
              placeholder="ابحث عن اسم الجراج أو المنطقة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            onClick={getUserLocation}
            disabled={locationLoading}
            className={`p-3.5 rounded-2xl border transition-all shadow-sm flex items-center justify-center ${
              locationLoading
                ? 'bg-slate-100 border-slate-200 text-slate-400'
                : 'bg-emerald-500 border-emerald-500 text-white active:scale-90 shadow-emerald-100 hover:bg-emerald-600'
            }`}
          >
            <Locate
              size={18}
              className={locationLoading ? 'animate-spin' : ''}
            />
          </button>

          <button
            onClick={() => setShowNearbyOnly(!showNearbyOnly)}
            className={`px-4 py-3 rounded-2xl text-[11px] font-black transition-all border whitespace-nowrap shadow-sm flex items-center gap-2 ${
              showNearbyOnly
                ? 'bg-sky-500 border-sky-500 text-white shadow-sky-100 hover:bg-sky-600'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            <Filter size={14} />
            {showNearbyOnly ? 'عرض الكل' : 'قريب مني'}
          </button>
        </div>
      </div>

      {/* ── Content ────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-6">
        {/* ── أزرار سريعة ──────────────────── */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {hasCompletedSession && (
            <button
              onClick={() => setScreen('lastSession')}
              className="bg-white border border-slate-100 rounded-3xl p-4 flex items-center gap-3 active:scale-[0.98] transition-all shadow-sm hover:shadow-md hover:border-sky-100 group"
            >
              <div className="bg-sky-50 p-2.5 rounded-2xl shrink-0 group-hover:bg-sky-500 transition-colors group-hover:text-white text-sky-600">
                <Receipt size={18} />
              </div>
              <div className="text-right flex-1">
                <div className="text-[11px] font-black text-slate-900">آخر جلسة</div>
                <div className="text-[9px] font-medium text-slate-400">التفاصيل والمدفوعات</div>
              </div>
            </button>
          )}

          <button
            onClick={() => setScreen('chat')}
            className={`bg-white border border-slate-100 rounded-3xl p-4 flex items-center gap-3 active:scale-[0.98] transition-all shadow-sm hover:shadow-md hover:border-emerald-100 group ${
              !hasCompletedSession ? 'col-span-2' : ''
            }`}
          >
            <div className="bg-emerald-50 p-2.5 rounded-2xl shrink-0 group-hover:bg-emerald-500 transition-colors group-hover:text-white text-emerald-600">
              <MessageCircle size={18} />
            </div>
            <div className="text-right flex-1">
              <div className="text-[11px] font-black text-slate-900">الدعم الفني</div>
              <div className="text-[9px] font-medium text-slate-400">تواصل معنا مباشرة</div>
            </div>
          </button>
        </div>

        {/* ── قريب ─────────────────────────── */}
        {nearbyGarages.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                <span className="text-[10px] font-black text-emerald-600">
                  {nearbyGarages.length} أماكن
                </span>
                <div className="w-1 h-1 rounded-full bg-emerald-400"></div>
                <span className="text-[10px] font-bold text-emerald-500">1-15 دقيقة</span>
              </div>
              <h2 className="text-[13px] font-black text-slate-800 flex items-center gap-2">
                الأقرب إليك
                <Navigation size={14} className="text-emerald-500" />
              </h2>
            </div>

            <div className="space-y-4">
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
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4 px-1">
               <div className="flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                <span className="text-[10px] font-black text-slate-600">
                  {farGarages.length} خيارات
                </span>
              </div>
              <h2 className="text-[13px] font-black text-slate-500 flex items-center gap-2">
                خيارات أخرى
                <Clock size={14} className="text-slate-400" />
              </h2>
            </div>

            <div className="space-y-4">
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
          <div className="text-center py-20">
            <div className="relative inline-block mb-6">
              <div className="absolute inset-0 bg-sky-100 rounded-full blur-2xl opacity-50 animate-pulse"></div>
              <div className="relative bg-white p-6 rounded-full shadow-sm border border-slate-100">
                <Search size={40} className="text-slate-200" />
              </div>
            </div>
            <p className="text-sm font-black text-slate-800">لا توجد جراجات متاحة حالياً</p>
            <p className="text-xs font-medium text-slate-400 mt-2 max-w-[200px] mx-auto leading-relaxed">جرب تغيير كلمة البحث أو توسيع نطاق الموقع</p>
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4, ease: "easeOut" }}
      className={`relative bg-white rounded-3xl p-5 active:scale-[0.98] transition-all cursor-pointer shadow-sm hover:shadow-xl hover:shadow-sky-100/50 border-2 ${
        isClosest && !isBusy
          ? 'border-sky-400/30 ring-4 ring-sky-500/5'
          : isNearby
          ? 'border-emerald-100 hover:border-emerald-200'
          : 'border-slate-50 hover:border-slate-200'
      }`}
      onClick={onSelect}
    >
      {/* Badges Row */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 bg-amber-50 text-amber-600 px-2 py-1 rounded-xl text-[10px] font-black border border-amber-100">
            <Star size={10} fill="currentColor" />
            {garage.rating}
          </div>

          {garage.availableSpots === 0 && (
            <span className="bg-rose-50 text-rose-600 text-[9px] font-black px-2.5 py-1 rounded-xl border border-rose-100">
              ممتلئ تماماً
            </span>
          )}

          {!isBusy && isClosest && garage.availableSpots > 0 ? (
            <span className="bg-sky-500 text-white text-[9px] font-black px-2.5 py-1 rounded-xl shadow-sm shadow-sky-100">
              الأقرب 📍
            </span>
          ) : !isBusy && isNearby && garage.availableSpots > 0 ? (
            <span className="bg-emerald-500 text-white text-[9px] font-black px-2.5 py-1 rounded-xl shadow-sm shadow-emerald-100">
              قريب جداً
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1 text-slate-400">
          <ChevronRight size={16} />
        </div>
      </div>

      {/* Name & Location */}
      <div className="mb-4">
        <h3 className="text-[15px] font-black text-slate-900 mb-1">{garage.name}</h3>
        <div className="flex items-center gap-1 text-[11px] font-bold text-slate-400">
          <MapPin size={10} className="text-slate-300" />
          <span>{garage.location}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="flex items-center justify-between gap-4 p-3 bg-slate-50 rounded-2xl mb-4 border border-slate-100/50">
        <div className="flex flex-col items-center gap-1 flex-1">
          <div className="flex items-center gap-1.5 text-sky-600">
            <Navigation size={14} strokeWidth={2.5} />
            <span className="text-[13px] font-black font-mono">
              {formatDuration(garage.minutes)}
            </span>
          </div>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">وقت الوصول</span>
        </div>

        <div className="w-px h-6 bg-slate-200" />

        <div className="flex flex-col items-center gap-1 flex-1">
          <div className="flex items-center gap-1.5 text-emerald-600">
            <DollarSign size={14} strokeWidth={2.5} />
            <span className="text-[13px] font-black font-mono">
              {garage.basePrice}
            </span>
          </div>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">ج.م / ساعة</span>
        </div>

        <div className="w-px h-6 bg-slate-200" />

        <div className="flex flex-col items-center gap-1 flex-1">
          <div className={`flex items-center gap-1.5 ${garage.availableSpots > 5 ? 'text-indigo-600' : 'text-rose-500'}`}>
            <Car size={14} strokeWidth={2.5} />
            <span className="text-[13px] font-black font-mono">
              {garage.availableSpots}
            </span>
          </div>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">مكان شاغر</span>
        </div>
      </div>

      {/* Action Button */}
      <button
        className={`w-full py-4 rounded-2xl font-black text-xs flex items-center justify-center gap-2.5 transition-all shadow-md group ${
          garage.availableSpots === 0
            ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
            : hasActiveSession
            ? 'bg-emerald-500 text-white shadow-emerald-200 active:scale-95 hover:bg-emerald-600'
            : hasIncomingCar
            ? 'bg-sky-600 text-white shadow-sky-200 active:scale-95 hover:bg-sky-700'
            : isClosest
            ? 'bg-sky-500 text-white shadow-sky-200 active:scale-95 hover:bg-sky-600'
            : isNearby
            ? 'bg-emerald-500 text-white shadow-emerald-200 active:scale-95 hover:bg-emerald-600'
            : 'bg-sky-500 text-white shadow-sky-200 active:scale-95 hover:bg-sky-600'
        }`}
        disabled={garage.availableSpots === 0}
      >
        <Car size={16} strokeWidth={2.5} className="group-hover:animate-bounce" />
        {garage.availableSpots === 0
          ? 'عذراً، الجراج ممتلئ حالياً'
          : hasActiveSession
          ? 'العودة للجلسة النشطة'
          : hasIncomingCar
          ? 'العودة لتوجيهات الوصول'
          : isClosest
          ? 'احجز الآن في أقرب مكان'
          : isNearby
          ? 'احجز مكان - قريب منك'
          : 'احجز مكان ركن الآن'}
      </button>
    </motion.div>
  );
}

