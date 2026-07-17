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
  ChevronLeft,
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
 * LOGO-INSPIRED MINIMALIST PALETTE:
 * - Logo Blue: #0066FF (Vibrant & Trustworthy)
 * - Logo Green: #66FF00 (High Visibility / Action)
 * - Background: #F9FAFB (Ultra Clean)
 * - Surface: #FFFFFF
 * - Text Primary: #111827 (Deep Slate for readability)
 * - Text Secondary: #6B7280 (Neutral Gray)
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

  const hasCompletedSession = sessions.some(
    (s) =>
      normalizePlateForCompare(s.carPlate) === normalizedUserPlate &&
      s.status === 'completed'
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

  const nearbyGarages = filteredGarages.filter((g) => g.classification === 'nearby');
  const farGarages = filteredGarages.filter((g) => g.classification === 'far');

  const handleDirectBooking = (garage: GarageWithDistance) => {
    if (!currentUser) { toast.error('سجل بياناتك أولاً'); return; }
    if (activeSession) { setSelectedGarageId(activeSession.garageId); setScreen('session'); return; }
    if (myIncomingCar) { setSelectedGarageId(myIncomingCar.garageId); setScreen('navigation'); return; }
    if (garage.availableSpots <= 0) { toast.error('لا توجد أماكن متاحة حالياً'); return; }

    setSelectedGarageId(garage.id);
    addIncomingCar({
      garageId: garage.id,
      carPlate: currentUser.carPlate,
      customerName: currentUser.name,
      customerPhone: currentUser.phone,
      agreedPrice: garage.basePrice,
      estimatedArrival: Math.max(3, garage.minutes),
    });
    setScreen('navigation');
  };

  return (
    <div className="h-full bg-[#F9FAFB] flex flex-col font-sans antialiased text-[#111827] dir-rtl">
      {/* ── Minimal Header ────────────────── */}
      <div className="px-6 pt-14 pb-6 bg-white border-b border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <img src="/images/logo.png" alt="Logo" className="w-10 h-10 object-contain" />
            <div>
              <h1 className="text-lg font-bold tracking-tight">مرحباً {currentUser?.name}</h1>
              <p className="text-[11px] text-gray-400 font-medium">أين تود الركن اليوم؟</p>
            </div>
          </div>
          <button 
            onClick={() => setShowTopUp(true)}
            className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 px-4 py-2 rounded-2xl transition-colors border border-gray-100"
          >
            <div className="text-right">
              <p className="text-[9px] text-gray-400 font-bold leading-none">المحفظة</p>
              <p className="text-sm font-black text-[#0066FF] leading-none mt-1">{currentUser?.wallet || 0} ج.م</p>
            </div>
            <div className="bg-[#0066FF] p-1.5 rounded-xl text-white shadow-sm">
              <Plus size={14} strokeWidth={3} />
            </div>
          </button>
        </div>

        {/* ── Search & Filter ──────────────── */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              className="w-full bg-gray-50 border-none p-3.5 pr-11 rounded-2xl text-right font-semibold text-xs focus:ring-2 focus:ring-[#0066FF]/20 transition-all placeholder:text-gray-300"
              placeholder="ابحث عن جراج أو منطقة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowNearbyOnly(!showNearbyOnly)}
            className={`p-3.5 rounded-2xl transition-all border ${
              showNearbyOnly 
              ? 'bg-[#0066FF] border-[#0066FF] text-white shadow-lg shadow-[#0066FF]/20' 
              : 'bg-white border-gray-100 text-gray-400'
            }`}
          >
            <Filter size={18} />
          </button>
        </div>
      </div>

      {/* ── Content Area ─────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* Active Alerts */}
        <AnimatePresence>
          {(activeSession || myIncomingCar) && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mb-6"
            >
              <button
                onClick={() => {
                  setSelectedGarageId(activeSession?.garageId || myIncomingCar?.garageId);
                  setScreen(activeSession ? 'session' : 'navigation');
                }}
                className={`w-full p-4 rounded-3xl flex items-center justify-between text-white shadow-xl ${
                  activeSession ? 'bg-[#66FF00] !text-[#111827]' : 'bg-[#0066FF]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-2xl ${activeSession ? 'bg-black/5' : 'bg-white/10'}`}>
                    {activeSession ? <Car size={20} /> : <Navigation size={20} />}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">
                      {activeSession ? 'جلسة نشطة حالياً' : 'سيارتك في الطريق'}
                    </p>
                    <p className="text-sm font-black">اضغط للمتابعة الآن</p>
                  </div>
                </div>
                <ChevronLeft size={20} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <button 
            onClick={() => setScreen('chat')}
            className="bg-white p-4 rounded-3xl border border-gray-100 flex flex-col gap-3 hover:border-[#0066FF]/30 transition-all group"
          >
            <div className="w-10 h-10 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-[#0066FF]/5 group-hover:text-[#0066FF] transition-colors">
              <MessageCircle size={20} />
            </div>
            <div className="text-right">
              <p className="text-xs font-bold">الدعم الفني</p>
              <p className="text-[9px] text-gray-400 mt-0.5">تواصل معنا 24/7</p>
            </div>
          </button>
          
          <button 
            onClick={() => setScreen('lastSession')}
            className="bg-white p-4 rounded-3xl border border-gray-100 flex flex-col gap-3 hover:border-[#66FF00]/30 transition-all group"
          >
            <div className="w-10 h-10 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-[#66FF00]/10 group-hover:text-[#66FF00] transition-colors">
              <Receipt size={20} />
            </div>
            <div className="text-right">
              <p className="text-xs font-bold">آخر ركنة</p>
              <p className="text-[9px] text-gray-400 mt-0.5">تفاصيل المدفوعات</p>
            </div>
          </button>
        </div>

        {/* Garage Lists */}
        <section className="space-y-8">
          {nearbyGarages.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-black flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#66FF00]"></span>
                  جراجات قريبة منك
                </h2>
                <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">
                  {nearbyGarages.length} متاح
                </span>
              </div>
              <div className="space-y-4">
                {nearbyGarages.map((g, i) => (
                  <GarageCard key={g.id} garage={g} index={i} onSelect={() => handleDirectBooking(g)} isNearby />
                ))}
              </div>
            </div>
          )}

          {farGarages.length > 0 && !showNearbyOnly && (
            <div>
              <h2 className="text-sm font-black text-gray-400 mb-5 px-1">خيارات إضافية</h2>
              <div className="space-y-4">
                {farGarages.map((g, i) => (
                  <GarageCard key={g.id} garage={g} index={i} onSelect={() => handleDirectBooking(g)} isNearby={false} />
                ))}
              </div>
            </div>
          )}
        </section>

        {filteredGarages.length === 0 && (
          <div className="text-center py-20">
            <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search size={32} className="text-gray-200" />
            </div>
            <p className="text-sm font-bold text-gray-400">لا توجد نتائج مطابقة</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showTopUp && <TopUpWalletModal onClose={() => setShowTopUp(false)} />}
      </AnimatePresence>
    </div>
  );
}

function GarageCard({ garage, index, onSelect, isNearby }: { garage: GarageWithDistance, index: number, onSelect: () => void, isNearby: boolean }) {
  const isFull = garage.availableSpots === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onSelect}
      className="bg-white rounded-[32px] p-5 border border-gray-100 hover:border-[#0066FF]/20 transition-all cursor-pointer group shadow-sm hover:shadow-md"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex gap-2">
          <div className="flex items-center gap-1 bg-gray-50 px-2.5 py-1 rounded-xl text-[10px] font-bold">
            <Star size={10} className="text-amber-400" fill="currentColor" />
            {garage.rating}
          </div>
          {isNearby && !isFull && (
            <div className="bg-[#66FF00]/10 text-[#4CAF50] px-2.5 py-1 rounded-xl text-[10px] font-black">
              قريب جداً
            </div>
          )}
          {isFull && (
            <div className="bg-rose-50 text-rose-500 px-2.5 py-1 rounded-xl text-[10px] font-black">
              مكتمل
            </div>
          )}
        </div>
        <div className="text-right">
          <h3 className="text-sm font-black group-hover:text-[#0066FF] transition-colors">{garage.name}</h3>
          <p className="text-[10px] text-gray-400 font-medium mt-0.5">{garage.location}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="bg-gray-50 p-3 rounded-2xl text-center">
          <p className="text-[8px] text-gray-400 font-bold uppercase mb-1">الوصول</p>
          <p className="text-xs font-black text-[#111827]">{formatDuration(garage.minutes)}</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-2xl text-center">
          <p className="text-[8px] text-gray-400 font-bold uppercase mb-1">الساعة</p>
          <p className="text-xs font-black text-[#111827]">{garage.basePrice} ج.م</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-2xl text-center">
          <p className="text-[8px] text-gray-400 font-bold uppercase mb-1">متاح</p>
          <p className={`text-xs font-black ${garage.availableSpots > 0 ? 'text-[#0066FF]' : 'text-rose-500'}`}>
            {garage.availableSpots}
          </p>
        </div>
      </div>

      <button
        disabled={isFull}
        className={`w-full py-4 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 ${
          isFull 
          ? 'bg-gray-100 text-gray-300' 
          : 'bg-[#0066FF] text-white shadow-lg shadow-[#0066FF]/20 active:scale-[0.98]'
        }`}
      >
        <Car size={16} />
        {isFull ? 'الجراج ممتلئ' : 'احجز مكانك الآن'}
      </button>
    </motion.div>
  );
}
