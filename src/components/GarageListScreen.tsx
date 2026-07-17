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
  Sparkles,
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
 * DRIVER-CENTRIC JOYFUL PALETTE:
 * - Primary Blue: #0066FF (Logo Blue - High Contrast)
 * - Action Green: #66FF00 (Logo Green - Vibrant/Neon)
 * - Success Emerald: #10B981
 * - Warning Amber: #F59E0B
 * - Background: #F0F4F8 (Soft Sky Tint)
 * - Card Surface: #FFFFFF
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
          setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
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
        const distance = calculateDistance(userLocation.lat, userLocation.lng, garage.lat, garage.lng);
        const minutes = distanceToMinutes(distance);
        return { ...garage, distance, minutes, classification: classifyDistance(minutes) };
      })
      .sort((a, b) => a.minutes - b.minutes);
  }, [garages, userLocation]);

  const filteredGarages = useMemo(() => {
    let filtered = garagesWithDistance;
    if (search) filtered = filtered.filter((g) => g.name.includes(search) || g.location.includes(search));
    if (showNearbyOnly) filtered = filtered.filter((g) => g.classification === 'nearby');
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
    <div className="h-full bg-[#F0F4F8] flex flex-col font-sans antialiased text-[#1A202C] dir-rtl">
      {/* ── Driver-Friendly Header ────────── */}
      <div className="px-6 pt-14 pb-6 bg-white rounded-b-[40px] shadow-xl shadow-blue-900/5 z-20">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-[#0066FF]/20 blur-xl rounded-full"></div>
              <img src="/images/logo.png" alt="Logo" className="relative w-14 h-14 object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-[#0066FF]">أهلاً {currentUser?.name}!</h1>
              <p className="text-xs font-bold text-gray-400">جاهز لركن سيارتك؟ 🚗</p>
            </div>
          </div>
          
          <button 
            onClick={() => setShowTopUp(true)}
            className="bg-gradient-to-br from-[#0066FF] to-[#0052CC] p-1 rounded-[22px] shadow-lg shadow-[#0066FF]/30 active:scale-95 transition-transform"
          >
            <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-[20px] border border-white/20 flex items-center gap-3">
              <div className="text-right">
                <p className="text-[10px] text-white/70 font-bold leading-none">رصيدك</p>
                <p className="text-base font-black text-white leading-none mt-1">{currentUser?.wallet || 0} ج.م</p>
              </div>
              <Plus size={18} strokeWidth={3} className="text-[#66FF00]" />
            </div>
          </button>
        </div>

        {/* ── Large Search Input ───────────── */}
        <div className="flex gap-3">
          <div className="relative flex-1 group">
            <Search size={22} className="absolute right-5 top-1/2 -translate-y-1/2 text-[#0066FF]" />
            <input
              className="w-full bg-gray-50 border-2 border-transparent p-4 pr-14 rounded-[24px] text-right font-black text-sm focus:bg-white focus:border-[#0066FF] transition-all placeholder:text-gray-300 shadow-inner"
              placeholder="ابحث عن جراج أو منطقة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowNearbyOnly(!showNearbyOnly)}
            className={`p-4 rounded-[24px] transition-all shadow-lg ${
              showNearbyOnly 
              ? 'bg-[#66FF00] text-black shadow-[#66FF00]/20' 
              : 'bg-white text-[#0066FF] border-2 border-gray-50'
            }`}
          >
            <Filter size={22} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* ── Main Scrollable Area ──────────── */}
      <div className="flex-1 overflow-y-auto px-6 pt-8 pb-10 space-y-8">
        
        {/* Active Status Banner - High Visibility */}
        <AnimatePresence>
          {(activeSession || myIncomingCar) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative group"
            >
              <div className={`absolute inset-0 blur-2xl opacity-40 rounded-[32px] ${activeSession ? 'bg-[#66FF00]' : 'bg-[#0066FF]'}`}></div>
              <button
                onClick={() => {
                  setSelectedGarageId(activeSession?.garageId || myIncomingCar?.garageId);
                  setScreen(activeSession ? 'session' : 'navigation');
                }}
                className={`relative w-full p-6 rounded-[32px] flex items-center justify-between shadow-2xl overflow-hidden ${
                  activeSession ? 'bg-[#66FF00] text-black' : 'bg-[#0066FF] text-white'
                }`}
              >
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-white/20 to-transparent pointer-events-none"></div>
                <div className="flex items-center gap-4">
                  <div className={`p-4 rounded-3xl ${activeSession ? 'bg-black/10' : 'bg-white/20 shadow-inner'}`}>
                    {activeSession ? <Sparkles size={28} /> : <Navigation size={28} />}
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black uppercase tracking-widest opacity-70">
                      {activeSession ? 'أنت الآن في الجراج' : 'في الطريق للجراج'}
                    </p>
                    <p className="text-xl font-black mt-1">اضغط للعودة الآن ⚡</p>
                  </div>
                </div>
                <ChevronLeft size={28} strokeWidth={3} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Buttons - Joyful & Big */}
        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => setScreen('chat')}
            className="bg-white p-6 rounded-[32px] shadow-sm border-b-4 border-gray-100 flex flex-col items-center gap-3 active:translate-y-1 active:border-b-0 transition-all"
          >
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-[#0066FF]">
              <MessageCircle size={28} strokeWidth={2.5} />
            </div>
            <p className="text-sm font-black">الدعم الفني</p>
          </button>
          
          <button 
            onClick={() => setScreen('lastSession')}
            className="bg-white p-6 rounded-[32px] shadow-sm border-b-4 border-gray-100 flex flex-col items-center gap-3 active:translate-y-1 active:border-b-0 transition-all"
          >
            <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center text-[#66FF00]">
              <Receipt size={28} strokeWidth={2.5} />
            </div>
            <p className="text-sm font-black">آخر ركنة</p>
          </button>
        </div>

        {/* Garage Sections */}
        {nearbyGarages.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-6 px-2">
              <h2 className="text-lg font-black flex items-center gap-2">
                <div className="w-2 h-6 bg-[#66FF00] rounded-full"></div>
                الأقرب إليك الآن
              </h2>
              <div className="bg-white px-3 py-1.5 rounded-full shadow-sm text-[10px] font-black text-[#0066FF]">
                {nearbyGarages.length} جراج متاح
              </div>
            </div>
            <div className="space-y-6">
              {nearbyGarages.map((g, i) => (
                <GarageCard key={g.id} garage={g} index={i} onSelect={() => handleDirectBooking(g)} isNearby />
              ))}
            </div>
          </section>
        )}

        {farGarages.length > 0 && !showNearbyOnly && (
          <section>
            <h2 className="text-lg font-black text-gray-400 mb-6 px-2">خيارات أخرى</h2>
            <div className="space-y-6">
              {farGarages.map((g, i) => (
                <GarageCard key={g.id} garage={g} index={i} onSelect={() => handleDirectBooking(g)} isNearby={false} />
              ))}
            </div>
          </section>
        )}

        {filteredGarages.length === 0 && (
          <div className="text-center py-20">
            <div className="bg-white w-24 h-24 rounded-[40px] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-900/5">
              <Search size={40} className="text-gray-100" />
            </div>
            <p className="text-lg font-black text-gray-400">لا يوجد جراجات بهذا الاسم</p>
            <p className="text-sm font-bold text-gray-300 mt-2">جرب البحث بكلمة أخرى</p>
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      onClick={onSelect}
      className="bg-white rounded-[40px] p-6 shadow-xl shadow-blue-900/5 border-2 border-transparent hover:border-[#0066FF]/20 transition-all cursor-pointer group active:scale-[0.98]"
    >
      <div className="flex justify-between items-start mb-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="bg-amber-400 text-white px-3 py-1 rounded-full text-[11px] font-black flex items-center gap-1 shadow-md shadow-amber-400/20">
              <Star size={12} fill="currentColor" />
              {garage.rating}
            </div>
            {isNearby && !isFull && (
              <div className="bg-[#66FF00] text-black px-3 py-1 rounded-full text-[11px] font-black shadow-md shadow-[#66FF00]/20">
                أقرب اختيار
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-gray-400 text-xs font-bold mt-1">
            <MapPin size={14} className="text-[#0066FF]" />
            {garage.location}
          </div>
        </div>
        <div className="text-right">
          <h3 className="text-xl font-black text-[#1A202C] group-hover:text-[#0066FF] transition-colors leading-tight">{garage.name}</h3>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 bg-blue-50/50 p-4 rounded-[28px] border border-blue-100/50">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={14} className="text-[#0066FF]" />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">الوصول</span>
          </div>
          <p className="text-lg font-black text-[#1A202C]">{formatDuration(garage.minutes)}</p>
        </div>
        
        <div className="flex-1 bg-green-50/50 p-4 rounded-[28px] border border-green-100/50">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign size={14} className="text-[#10B981]" />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">الساعة</span>
          </div>
          <p className="text-lg font-black text-[#1A202C]">{garage.basePrice} <span className="text-xs">ج.م</span></p>
        </div>

        <div className={`flex-1 p-4 rounded-[28px] border ${isFull ? 'bg-rose-50 border-rose-100' : 'bg-indigo-50/50 border-indigo-100/50'}`}>
          <div className="flex items-center gap-2 mb-1">
            <Car size={14} className={isFull ? 'text-rose-500' : 'text-indigo-600'} />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">شاغر</span>
          </div>
          <p className={`text-lg font-black ${isFull ? 'text-rose-500' : 'text-[#1A202C]'}`}>{garage.availableSpots}</p>
        </div>
      </div>

      <button
        disabled={isFull}
        className={`w-full py-5 rounded-[28px] font-black text-sm transition-all flex items-center justify-center gap-3 shadow-2xl ${
          isFull 
          ? 'bg-gray-100 text-gray-300 shadow-none' 
          : 'bg-gradient-to-r from-[#0066FF] to-[#0052CC] text-white shadow-[#0066FF]/30 hover:scale-[1.02]'
        }`}
      >
        <Car size={20} strokeWidth={3} />
        {isFull ? 'الجراج ممتلئ حالياً' : 'احجز مكانك الآن'}
      </button>
    </motion.div>
  );
}
