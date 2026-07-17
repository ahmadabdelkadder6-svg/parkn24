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
  Zap,
  Shield,
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
    (s) => normalizePlateForCompare(s.carPlate) === normalizedUserPlate && s.status === 'completed'
  );

  const activeSession = sessions.find(
    (s) => normalizePlateForCompare(s.carPlate) === normalizedUserPlate && s.status === 'active'
  );

  const myIncomingCar = incomingCars.find(
    (c) => normalizePlateForCompare(c.carPlate) === normalizedUserPlate && c.status === 'coming'
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

  useEffect(() => { getUserLocation(); }, []);

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
    if (activeSession) {
      setSelectedGarageId(activeSession.garageId); setScreen('session');
      toast('لديك جلسة ركن نشطة بالفعل! 🚗', { icon: '⚡' }); return;
    }
    if (myIncomingCar) {
      setSelectedGarageId(myIncomingCar.garageId); setScreen('navigation');
      toast('لديك حجز نشط بالفعل! 📍', { icon: '🚗' }); return;
    }
    if (offers.some((o) => o.userId === currentUser.phone && o.status === 'pending')) {
      toast.error('لديك عرض معلق بالفعل'); return;
    }
    if (garage.availableSpots <= 0) { toast.error('لا توجد أماكن متاحة حالياً'); return; }

    setSelectedGarageId(garage.id);
    addIncomingCar({
      garageId: garage.id, carPlate: currentUser.carPlate, customerName: currentUser.name,
      customerPhone: currentUser.phone, agreedPrice: garage.basePrice,
      estimatedArrival: Math.max(3, garage.minutes),
    });
    toast.success(`تم الحجز في ${garage.name} بسعر ${garage.basePrice} ج.م/ساعة 🚗`);
    setScreen('navigation');
  };

  // ════════════════════════════════════════
  // JSX - نسخة احترافية Big UI + Neon
  // ════════════════════════════════════════
  return (
    <div className="h-full flex flex-col" style={{ background: '#EBF2FF', color: '#0A1628' }}>

      {/* ══════════ HEADER ══════════ */}
      <div className="px-4 pt-12 pb-3" style={{ background: '#ffffff' }}>

        {/* الترحيب + اللوجو */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-xl font-black" style={{ color: '#0A1628' }}>
              أهلاً {currentUser?.name} 👋
            </h1>
            <p className="text-xs font-bold" style={{ color: '#7B8CA6' }}>
              ابحث عن أقرب مكان ركن لسيارتك
            </p>
          </div>
          <img
            src="/images/logo.png"
            alt="بركن"
            className="w-12 h-12 object-contain"
            style={{ borderRadius: 16, boxShadow: '0 4px 20px rgba(0,102,255,0.15)', border: '2px solid #E0EAFF' }}
          />
        </div>

        {/* ══════ بطاقة المحفظة - ضخمة ══════ */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0066FF 0%, #4D00FF 100%)',
            borderRadius: 24,
            padding: '20px 18px',
            marginBottom: 14,
            boxShadow: '0 8px 32px rgba(0,102,255,0.35)',
            color: '#ffffff',
          }}
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-[10px] font-bold" style={{ opacity: 0.8 }}>💳 المحفظة</div>
                <div className="font-black font-mono" style={{ fontSize: 28, lineHeight: 1.1 }}>
                  {currentUser?.wallet || 0}
                  <span className="text-xs font-bold" style={{ opacity: 0.7, marginRight: 4 }}>ج.م</span>
                </div>
              </div>
              <button
                onClick={() => setShowTopUp(true)}
                className="flex items-center gap-1 font-black active:scale-95 transition-transform"
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(10px)',
                  borderRadius: 14,
                  padding: '10px 16px',
                  fontSize: 12,
                }}
              >
                <Plus size={14} /> شحن
              </button>
            </div>
            <div
              className="font-black"
              style={{
                background: 'rgba(255,255,255,0.15)',
                backdropFilter: 'blur(10px)',
                borderRadius: 14,
                padding: '10px 14px',
                fontSize: 12,
              }}
            >
              🚗 {currentUser?.carPlate}
            </div>
          </div>
        </div>

        {/* ══════ بانر الجلسة النشطة - توهج ══════ */}
        {activeSession && (
          <motion.button
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => { setSelectedGarageId(activeSession.garageId); setScreen('session'); }}
            className="w-full mb-3 flex items-center justify-between active:scale-[0.97] transition-all"
            style={{
              background: 'linear-gradient(135deg, #00CC66 0%, #00AA55 100%)',
              borderRadius: 20,
              padding: '16px 18px',
              color: '#ffffff',
              boxShadow: '0 0 30px rgba(0,204,102,0.4), 0 8px 24px rgba(0,204,102,0.25)',
            }}
          >
            <div className="flex items-center gap-2">
              <motion.span
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="w-3 h-3 rounded-full bg-white"
              />
              <span className="text-sm font-black">عرض الجلسة ←</span>
            </div>
            <div className="text-right">
              <div className="text-sm font-black flex items-center gap-1 justify-end">
                <Zap size={14} /> جلسة ركن نشطة
              </div>
              <div className="text-[10px]" style={{ opacity: 0.85 }}>اضغط للعودة</div>
            </div>
          </motion.button>
        )}

        {/* ══════ بانر السيارة في الطريق - توهج ══════ */}
        {!activeSession && myIncomingCar && (
          <motion.button
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => { setSelectedGarageId(myIncomingCar.garageId); setScreen('navigation'); }}
            className="w-full mb-3 flex items-center justify-between active:scale-[0.97] transition-all"
            style={{
              background: 'linear-gradient(135deg, #0099DD 0%, #0077BB 100%)',
              borderRadius: 20,
              padding: '16px 18px',
              color: '#ffffff',
              boxShadow: '0 0 30px rgba(0,153,221,0.4), 0 8px 24px rgba(0,153,221,0.25)',
            }}
          >
            <div className="flex items-center gap-2">
              <motion.span
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="w-3 h-3 rounded-full bg-white"
              />
              <span className="text-sm font-black">عرض التوجيه ←</span>
            </div>
            <div className="text-right">
              <div className="text-sm font-black flex items-center gap-1 justify-end">
                <Navigation size={14} /> حجز نشط
              </div>
              <div className="text-[10px]" style={{ opacity: 0.85 }}>اضغط للعودة للتوجيه</div>
            </div>
          </motion.button>
        )}

        {/* ══════ طرق الدفع - كبسولات ══════ */}
        <div className="flex items-center gap-2 mb-3 px-1 flex-wrap">
          <span className="text-[10px] font-black" style={{ color: '#7B8CA6' }}>💰 ادفع بعد الركنة:</span>
          {[
            { label: 'نقدي', bg: '#00CC66' },
            { label: 'إنستاباي', bg: '#7C3AED' },
            { label: 'محفظة', bg: '#0066FF' },
          ].map((m) => (
            <span
              key={m.label}
              className="font-black"
              style={{
                background: m.bg,
                color: '#fff',
                fontSize: 10,
                padding: '4px 12px',
                borderRadius: 20,
                boxShadow: `0 2px 8px ${m.bg}40`,
              }}
            >
              {m.label}
            </span>
          ))}
        </div>

        {/* ══════ البحث + تحديد الموقع ══════ */}
        <div className="flex gap-2 mb-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#94a3b8' }} />
            <input
              className="w-full font-bold outline-none text-sm"
              style={{
                background: '#F0F4FF',
                border: '2px solid #D0DCFF',
                padding: '14px 40px 14px 14px',
                borderRadius: 18,
                color: '#0A1628',
              }}
              placeholder="ابحث عن جراج..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={getUserLocation}
            disabled={locationLoading}
            className="active:scale-90 transition-all"
            style={{
              background: locationLoading ? '#E2E8F0' : '#0066FF',
              color: locationLoading ? '#94a3b8' : '#fff',
              borderRadius: 18,
              padding: '0 16px',
              boxShadow: locationLoading ? 'none' : '0 4px 16px rgba(0,102,255,0.3)',
            }}
          >
            <Locate size={20} className={locationLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowNearbyOnly(!showNearbyOnly)}
            className="font-black text-xs active:scale-90 transition-all whitespace-nowrap flex items-center gap-1"
            style={{
              background: showNearbyOnly ? '#0066FF' : '#F0F4FF',
              color: showNearbyOnly ? '#fff' : '#64748b',
              borderRadius: 18,
              padding: '0 16px',
              border: showNearbyOnly ? 'none' : '2px solid #D0DCFF',
              boxShadow: showNearbyOnly ? '0 4px 16px rgba(0,102,255,0.3)' : 'none',
            }}
          >
            <Filter size={14} />
            {showNearbyOnly ? 'الكل' : 'قريب'}
          </button>
        </div>
      </div>

      {/* ══════════ CONTENT ══════════ */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">

        {/* ══════ أزرار سريعة ══════ */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {hasCompletedSession && (
            <button
              onClick={() => setScreen('lastSession')}
              className="flex items-center gap-3 active:scale-[0.97] transition-all"
              style={{
                background: '#ffffff',
                border: '2px solid #D0DCFF',
                borderRadius: 22,
                padding: '16px 14px',
                boxShadow: '0 2px 12px rgba(0,102,255,0.08)',
              }}
            >
              <div style={{ background: '#0066FF', borderRadius: 16, padding: 10, color: '#fff', boxShadow: '0 4px 12px rgba(0,102,255,0.3)' }}>
                <Receipt size={18} />
              </div>
              <div className="text-right flex-1">
                <div className="text-xs font-black" style={{ color: '#0A1628' }}>آخر جلسة</div>
                <div className="text-[9px]" style={{ color: '#94a3b8' }}>عرض التفاصيل</div>
              </div>
            </button>
          )}
          <button
            onClick={() => setScreen('chat')}
            className={`flex items-center gap-3 active:scale-[0.97] transition-all ${!hasCompletedSession ? 'col-span-2' : ''}`}
            style={{
              background: '#ffffff',
              border: '2px solid #E0D6FF',
              borderRadius: 22,
              padding: '16px 14px',
              boxShadow: '0 2px 12px rgba(124,58,237,0.08)',
            }}
          >
            <div style={{ background: '#7C3AED', borderRadius: 16, padding: 10, color: '#fff', boxShadow: '0 4px 12px rgba(124,58,237,0.3)' }}>
              <MessageCircle size={18} />
            </div>
            <div className="text-right flex-1">
              <div className="text-xs font-black" style={{ color: '#0A1628' }}>تواصل معنا</div>
              <div className="text-[9px]" style={{ color: '#94a3b8' }}>شكاوى واستفسارات</div>
            </div>
          </button>
        </div>

        {/* ══════ أماكن قريبة ══════ */}
        {nearbyGarages.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3 justify-end">
              <span
                className="font-black"
                style={{ background: '#00CC66', color: '#fff', fontSize: 11, padding: '3px 12px', borderRadius: 20, boxShadow: '0 2px 8px rgba(0,204,102,0.3)' }}
              >
                {nearbyGarages.length}
              </span>
              <h2 className="text-sm font-black flex items-center gap-2" style={{ color: '#00AA44' }}>
                أماكن قريبة
                <Navigation size={16} />
              </h2>
            </div>
            <div className="space-y-3">
              {nearbyGarages.map((garage, i) => (
                <GarageCard
                  key={garage.id} garage={garage} index={i}
                  onSelect={() => handleDirectBooking(garage)}
                  isNearby isClosest={i === 0}
                  hasActiveSession={!!activeSession} hasIncomingCar={!!myIncomingCar}
                />
              ))}
            </div>
          </div>
        )}

        {/* ══════ خيارات أخرى ══════ */}
        {farGarages.length > 0 && !showNearbyOnly && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3 justify-end">
              <span
                className="font-black"
                style={{ background: '#FF8800', color: '#fff', fontSize: 11, padding: '3px 12px', borderRadius: 20, boxShadow: '0 2px 8px rgba(255,136,0,0.3)' }}
              >
                {farGarages.length}
              </span>
              <h2 className="text-sm font-black flex items-center gap-2" style={{ color: '#CC6600' }}>
                خيارات أخرى
                <Clock size={16} />
              </h2>
            </div>
            <div className="space-y-3">
              {farGarages.map((garage, i) => (
                <GarageCard
                  key={garage.id} garage={garage} index={i}
                  onSelect={() => handleDirectBooking(garage)}
                  isNearby={false}
                  isClosest={nearbyGarages.length === 0 && i === 0}
                  hasActiveSession={!!activeSession} hasIncomingCar={!!myIncomingCar}
                />
              ))}
            </div>
          </div>
        )}

        {filteredGarages.length === 0 && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🔍</div>
            <p className="text-base font-black" style={{ color: '#94a3b8' }}>لا توجد جراجات متاحة</p>
            <p className="text-xs mt-2" style={{ color: '#cbd5e1' }}>جرب تغيير البحث أو الموقع</p>
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

// ════════════════════════════════════════════════════
// GarageCard - بطاقة الجراج الضخمة الاحترافية
// ════════════════════════════════════════════════════
function GarageCard({
  garage, index, onSelect, isNearby, isClosest, hasActiveSession, hasIncomingCar,
}: {
  garage: GarageWithDistance; index: number; onSelect: () => void;
  isNearby: boolean; isClosest?: boolean; hasActiveSession?: boolean; hasIncomingCar?: boolean;
}) {
  const isBusy = hasActiveSession || hasIncomingCar;

  // ألوان الحالة
  const borderColor = isClosest && !isBusy ? '#0066FF' : isNearby ? '#00CC66' : '#D0DCFF';
  const glowColor = isClosest && !isBusy ? 'rgba(0,102,255,0.15)' : isNearby ? 'rgba(0,204,102,0.1)' : 'none';

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onSelect}
      className="active:scale-[0.97] transition-all cursor-pointer"
      style={{
        background: '#ffffff',
        border: `2.5px solid ${borderColor}`,
        borderRadius: 24,
        padding: '18px 16px',
        boxShadow: `0 4px 20px ${glowColor}, 0 2px 8px rgba(0,0,0,0.04)`,
      }}
    >
      {/* الصف الأول - الاسم + badges */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* التقييم */}
          <div
            className="flex items-center gap-1 font-black"
            style={{ background: '#FF9500', color: '#fff', fontSize: 11, padding: '4px 10px', borderRadius: 12, boxShadow: '0 2px 8px rgba(255,149,0,0.3)' }}
          >
            <Star size={12} fill="currentColor" />
            {garage.rating}
          </div>

          {garage.availableSpots === 0 && (
            <span className="font-black" style={{ background: '#FF3333', color: '#fff', fontSize: 10, padding: '4px 10px', borderRadius: 12 }}>ممتلئ</span>
          )}

          {!isBusy && isClosest && garage.availableSpots > 0 && (
            <span className="font-black" style={{ background: '#0066FF', color: '#fff', fontSize: 10, padding: '4px 10px', borderRadius: 12, boxShadow: '0 0 12px rgba(0,102,255,0.3)' }}>
              📍 الأقرب
            </span>
          )}
          {!isBusy && !isClosest && isNearby && garage.availableSpots > 0 && (
            <span className="font-black" style={{ background: '#00CC66', color: '#fff', fontSize: 10, padding: '4px 10px', borderRadius: 12 }}>قريب</span>
          )}
        </div>
        <h3 className="text-base font-black" style={{ color: '#0A1628' }}>{garage.name}</h3>
      </div>

      {/* الموقع */}
      <div className="flex items-center gap-1 justify-end mb-3" style={{ color: '#7B8CA6', fontSize: 11 }}>
        <span>{garage.location}</span>
        <MapPin size={12} />
      </div>

      {/* ══════ كبسولات المعلومات الضخمة ══════ */}
      <div className="flex items-center justify-between gap-2 mb-4">
        {/* المسافة */}
        <div
          className="flex items-center gap-2 font-black"
          style={{
            background: isNearby ? '#00CC66' : '#FF8800',
            color: '#fff',
            borderRadius: 16,
            padding: '10px 16px',
            fontSize: 14,
            boxShadow: isNearby ? '0 4px 16px rgba(0,204,102,0.3)' : '0 4px 16px rgba(255,136,0,0.3)',
          }}
        >
          <Navigation size={16} />
          <span className="font-mono">{formatDuration(garage.minutes)}</span>
        </div>

        {/* الأماكن + السعر */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Car size={16} style={{ color: '#0066FF' }} />
            <span className="font-black font-mono text-base" style={{ color: '#0066FF' }}>{garage.availableSpots}</span>
            <span className="text-[10px]" style={{ color: '#7B8CA6' }}>شاغر</span>
          </div>
          <div style={{ width: 2, height: 20, background: '#E2E8F0', borderRadius: 2 }} />
          <div className="flex items-center gap-1">
            <DollarSign size={16} style={{ color: '#00AA44' }} />
            <span className="font-black font-mono text-base" style={{ color: '#00AA44' }}>{garage.basePrice}</span>
            <span className="text-[10px]" style={{ color: '#7B8CA6' }}>ج.م/س</span>
          </div>
        </div>
      </div>

      {/* ══════ زر الحجز الضخم ══════ */}
      <button
        disabled={garage.availableSpots === 0}
        className="w-full font-black flex items-center justify-center gap-2 active:scale-95 transition-all"
        style={{
          background: garage.availableSpots === 0
            ? '#E2E8F0'
            : hasActiveSession
            ? 'linear-gradient(135deg, #00CC66 0%, #00AA55 100%)'
            : hasIncomingCar
            ? 'linear-gradient(135deg, #0099DD 0%, #0077BB 100%)'
            : isClosest
            ? 'linear-gradient(135deg, #0066FF 0%, #0044DD 100%)'
            : isNearby
            ? 'linear-gradient(135deg, #00CC66 0%, #00AA55 100%)'
            : 'linear-gradient(135deg, #0066FF 0%, #4D00FF 100%)',
          color: garage.availableSpots === 0 ? '#94a3b8' : '#ffffff',
          borderRadius: 18,
          padding: '16px 0',
          fontSize: 14,
          boxShadow: garage.availableSpots === 0
            ? 'none'
            : hasActiveSession
            ? '0 6px 24px rgba(0,204,102,0.35)'
            : hasIncomingCar
            ? '0 6px 24px rgba(0,153,221,0.35)'
            : '0 6px 24px rgba(0,102,255,0.35)',
        }}
      >
        <Car size={18} />
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