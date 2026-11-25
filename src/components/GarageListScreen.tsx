
// src/components/GarageListScreen.tsx
import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Star, Search, Navigation, Locate, Plus, Receipt, MessageCircle,
  X, ChevronDown, QrCode, Copy, Edit3, Check, Minus, Menu,
  Wallet, ShieldCheck, Radio, Sparkles
} from 'lucide-react';
import { useStore, Garage, ParkingSession as Session, IncomingCar, normalizePlate, normalizePhone, BOOKING_FEE, TOPUP_TIERS } from '../store';
import { calculateDistance, distanceToMinutes, classifyDistance, formatDuration } from '../utils/distance';
import { buildGoogleMapsUrl } from '../utils/mapsNavigation';
import TopUpWalletModal from './TopUpWalletModal';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { QRCodeCanvas } from 'qrcode.react';
const BRAND = {
  blue: '#1656b8',
  blueDark: '#0e3a7d',
  blueDeep: '#081e42',
  green: '#8cc63f',
  greenDark: '#6da528',
  greenLight: '#f4fbe8',
  bg: '#f8fafc',
  card: '#ffffff',
  slate: '#334155',
  slateLight: '#64748b',
  border: '#e2e8f0',
  borderDark: '#cbd5e1',
  navy: '#0a1628',
  shieldGold: '#d97706'
};
const MIN_UI_MOVE_METERS = 25;
const LAST_COORDS_STORAGE_KEY = 'parkn24_last_user_coords';
interface GarageWithDistance extends Garage {
  distance: number;
  minutes: number;
  classification: 'nearby' | 'far';
}
interface GarageCardProps {
  garage: GarageWithDistance;
  index: number;
  onSelect: (garage: GarageWithDistance) => void;
  onReportPrice: (garage: GarageWithDistance) => void;
  isNearby: boolean;
  isClosest: boolean;
  hasActiveSession: boolean;
  hasIncomingCar: boolean;
  disabled: boolean;
}
const safeParseTime = (value: unknown): number => {
  if (!value) return 0;
  if (typeof value === 'string') {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : 0;
  }
  if (typeof value === 'number') {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  return 0;
};
const SITE_URL = import.meta.env.VITE_SITE_URL || 'https://parkn24.com';
export const OFFICIAL_AREAS = [
  'وسط البلد والزمالك',
  'المعادي والمقطم',
  'مصر الجديدة والشروق',
  'مدينة نصر والشرقية',
  'المهندسين والدقي',
  'الجيزة وفيصل والهرم',
  '6 أكتوبر والشيخ زايد',
  'التجمع والقاهرة الجديدة',
  'شبرا الخيمة',
  'السويس والقناة',
  'الإسكندرية والساحل',
  'القناة والدلتا',
  'العاشر من رمضان',
] as const;
const AREA_ICONS: Record<string, string> = {
  'وسط البلد والزمالك': '🏛️',
  'المعادي والمقطم': '🌳',
  'مصر الجديدة والشروق': '🏰',
  'مدينة نصر والشرقية': '🏙️',
  'المهندسين والدقي': '🛍️',
  'الجيزة وفيصل والهرم': '🏛️',
  '6 أكتوبر والشيخ زايد': '🌲',
  'التجمع والقاهرة الجديدة': '💎',
  'شبرا الخيمة': '🚆',
  'السويس والقناة': '🚢',
  'الإسكندرية والساحل': '🏖️',
  'القناة والدلتا': '🌾',
  'العاشر من رمضان': '🏭',
};
const DIRECT_AREA_MAP: Record<string, string> = {
  'وسط البلد': 'وسط البلد والزمالك',
  'الزمالك': 'وسط البلد والزمالك',
  'جاردن سيتي والقصر العيني': 'وسط البلد والزمالك',
  'بولاق': 'وسط البلد والزمالك',
  'العتبة والأسواق': 'وسط البلد والزمالك',
  'الحسين والأزهر': 'وسط البلد والزمالك',
  'المنيل': 'وسط البلد والزمالك',
  'مصر القديمة': 'وسط البلد والزمالك',
  'ممشى أهل مصر': 'وسط البلد والزمالك',
  'شبرا ورمسيس': 'وسط البلد والزمالك',
  'المعادي': 'المعادي والمقطم',
  'المقطم': 'المعادي والمقطم',
  'حلوان': 'المعادي والمقطم',
  'مصر الجديدة': 'مصر الجديدة والشروق',
  'مدينة الشروق': 'مصر الجديدة والشروق',
  'مدينة العبور': 'مصر الجديدة والشروق',
  'العاصمة الإدارية': 'مصر الجديدة والشروق',
  'شيراتون المطار': 'مصر الجديدة والشروق',
  'جسر السويس': 'مصر الجديدة والشروق',
  'الزيتون والمطرية': 'مصر الجديدة والشروق',
  'حدائق القبة': 'مصر الجديدة والشروق',
  'الوايلي والعباسية': 'مصر الجديدة والشروق',
  'صلاح سالم والعروبة': 'مصر الجديدة والشروق',
  'مدينة نصر': 'مدينة نصر والشرقية',
  'المهندسين': 'المهندسين والدقي',
  'الدقي': 'المهندسين والدقي',
  'الكيت كات': 'المهندسين والدقي',
  'أرض اللواء': 'المهندسين والدقي',
  'الجيزة': 'الجيزة وفيصل والهرم',
  'حدائق الأهرام': 'الجيزة وفيصل والهرم',
  'المريوطية والمنصورية': 'الجيزة وفيصل والهرم',
  'إمبابة والوراق': 'الجيزة وفيصل والهرم',
  '6 أكتوبر': '6 أكتوبر والشيخ زايد',
  'الشيخ زايد': '6 أكتوبر والشيخ زايد',
  'القرية الذكية': '6 أكتوبر والشيخ زايد',
  'التجمع الخامس': 'التجمع والقاهرة الجديدة',
  'الرحاب ومدينتي': 'التجمع والقاهرة الجديدة',
  'شبرا وخيمة': 'شبرا الخيمة',
  'شبرا و خيمة': 'شبرا الخيمة',
  'شبرا': 'شبرا الخيمة',
  'الخيمة': 'شبرا الخيمة',
  'مدن القناة': 'السويس والقناة',
  'العين السخنة': 'السويس والقناة',
  'الإسكندرية': 'الإسكندرية والساحل',
  'الساحل الشمالي': 'الإسكندرية والساحل',
  'المنصورة والدلتا': 'القناة والدلتا',
  'طنطا': 'القناة والدلتا',
  'العاشر': 'العاشر من رمضان',
  'مدينة العاشر من رمضان': 'العاشر من رمضان'
};
// ⚡ كاش ذكي لتسريع الـ RegEx ومنع هبوط الفريمات مع سقف أمان للذاكرة
const canonicalAreaCache = new Map<string, string>();
export const getCanonicalArea = (rawArea?: string, name: string = '', location: string = ''): string => {
  const cacheKey = `${rawArea || ''}__${name}__${location}`;
  const cached = canonicalAreaCache.get(cacheKey);
  if (cached) return cached;
  let result = 'وسط البلد والزمالك';
  const trimmed = (rawArea || '').trim();
  if (trimmed && (OFFICIAL_AREAS as readonly string[]).includes(trimmed)) {
    result = trimmed;
  } else if (trimmed && DIRECT_AREA_MAP[trimmed]) {
    result = DIRECT_AREA_MAP[trimmed];
  } else {
    const combined = `${trimmed} ${name} ${location}`.trim();
    if (/عاشر من رمضان|العاشر/i.test(combined)) result = 'العاشر من رمضان';
    else if (/سخنة|سويس|إسماعيلية|اسماعيلية|بورسعيد|بورفؤاد|فايد|جلالة/i.test(combined) && !/جسر السويس|طريق السويس/i.test(combined)) {
      result = 'السويس والقناة';
    } else if (/إسكندرية|اسكندرية|ساحل|علمين|مارينا|مطروح|سموحة|سيدي جابر|محطة الرمل/i.test(combined)) {
      result = 'الإسكندرية والساحل';
    } else if (/طنطا|منصورة|دلتا|محلة|كفر الشيخ|دمياط|منوفية|شبين|بنها|قليوب/i.test(combined)) {
      result = 'القناة والدلتا';
    } else if (/شبرا|الخيمة|خيمة|بهتيم|مسطرد|عبود|روض الفرج/i.test(combined)) {
      result = 'شبرا الخيمة';
    } else if (/أكتوبر|اكتوبر|زايد|حصري|قرية ذكية|دريم|بيفرلي|توسعات/i.test(combined)) {
      result = '6 أكتوبر والشيخ زايد';
    } else if (/تجمع|قاهرة جديدة|رحاب|مدينتي|لوتس|نرجس|ياسمين|بنفسج|شويفات|مستثمرين/i.test(combined)) {
      result = 'التجمع والقاهرة الجديدة';
    } else if (/معادي|مقطم|دجلة|طرة|حلوان|أوتوستراد|اتوستراد|زهراء المعادي/i.test(combined)) {
      result = 'المعادي والمقطم';
    } else if (/مهندسين|دقي|عجوزة|مصدق|نادي الصيد|محي الدين|لبنان|جامعة الدول/i.test(combined)) {
      result = 'المهندسين والدقي';
    } else if (/جيزة|فيصل|هرم|عمرانية|طالبية|رماية|مريوطية|منصورية|أهرام|اهرام|بين السرايات|جامعة القاهرة/i.test(combined)) {
      result = 'الجيزة وفيصل والهرم';
    } else if (/مدينة نصر|مكرم|عباس العقاد|نحاس|رابعة|حي سابع|حي ثامن|حي سادس|حي عاشر|وفاء وأمل|زقازيق|شرقية/i.test(combined)) {
      result = 'مدينة نصر والشرقية';
    } else if (/مصر الجديدة|شروق|نزهة|روكسي|كوربة|هليوبوليس|جسر السويس|طريق السويس|شيراتون|مطار|عبور|عاصمة إدارية|عاصمة ادارية|زيتون|مطرية|حدائق القبة|وايلي|عباسية/i.test(combined)) {
      result = 'مصر الجديدة والشروق';
    } else if (/وسط البلد|زمالك|جاردن سيتي|قصر عيني|بولاق|عتبة|حسين|أزهر|ازهر|تحرير|منيل|مصر القديمة|رمسيس|باب اللوق|ممشى أهل مصر/i.test(combined)) {
      result = 'وسط البلد والزمالك';
    }
  }
  if (canonicalAreaCache.size > 2000) {
    canonicalAreaCache.clear();
  }
  canonicalAreaCache.set(cacheKey, result);
  return result;
};
const AREA_CENTERS: Record<string, { lat: number; lng: number; maxRadiusKm: number }> = {
  'وسط البلد والزمالك': { lat: 30.0480, lng: 31.2300, maxRadiusKm: 6.0 },
  'المعادي والمقطم': { lat: 29.9800, lng: 31.2800, maxRadiusKm: 12.0 },
  'مصر الجديدة والشروق': { lat: 30.1100, lng: 31.3500, maxRadiusKm: 25.0 },
  'مدينة نصر والشرقية': { lat: 30.0600, lng: 31.3400, maxRadiusKm: 30.0 },
  'المهندسين والدقي': { lat: 30.0500, lng: 31.2050, maxRadiusKm: 6.0 },
  'الجيزة وفيصل والهرم': { lat: 30.0050, lng: 31.1850, maxRadiusKm: 12.0 },
  '6 أكتوبر والشيخ زايد': { lat: 30.0100, lng: 30.9600, maxRadiusKm: 20.0 },
  'التجمع والقاهرة الجديدة': { lat: 30.0200, lng: 31.4800, maxRadiusKm: 22.0 },
  'شبرا الخيمة': { lat: 30.1000, lng: 31.2400, maxRadiusKm: 8.0 },
  'السويس والقناة': { lat: 30.5000, lng: 32.2500, maxRadiusKm: 80.0 },
  'الإسكندرية والساحل': { lat: 31.2001, lng: 29.9187, maxRadiusKm: 180.0 },
  'القناة والدلتا': { lat: 30.8500, lng: 31.2000, maxRadiusKm: 70.0 },
  'العاشر من رمضان': { lat: 30.3080, lng: 31.7420, maxRadiusKm: 15.0 },
};
export default function GarageListScreen() {
  const {
    garages, setSelectedGarageId, setScreen, currentUser, sessions, incomingCars,
    offers, acknowledgedSessionIds, walletTopUps, reportPriceUpdate,
    chargeBookingFee, addIncomingCar, getDailyDeductionCount
  } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showNearbyOnly, setShowNearbyOnly] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showSmartMenu, setShowSmartMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<'vip' | 'directory'>('vip');
  const [activeDirectoryTrip, setActiveDirectoryTrip] = useState<GarageWithDistance | null>(null);
  const [visibleLimits, setVisibleLimits] = useState<Record<string, number>>({});
  const [reportingGarage, setReportingGarage] = useState<GarageWithDistance | null>(null);
  const [updatedPriceInput, setUpdatedPriceInput] = useState<number | ''>(20);
  const [isSubmittingPrice, setIsSubmittingPrice] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>(() => {
    try {
      const saved = localStorage.getItem(LAST_COORDS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          parsed &&
          typeof parsed.lat === 'number' &&
          Number.isFinite(parsed.lat) &&
          typeof parsed.lng === 'number' &&
          Number.isFinite(parsed.lng)
        ) {
          return { lat: parsed.lat, lng: parsed.lng };
        }
      }
    } catch {}
    return { lat: 30.0444, lng: 31.2357 };
  });
  const [locationLoading, setLocationLoading] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [expandedArea, setExpandedArea] = useState<string | null>(null);
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [pendingVipGarage, setPendingVipGarage] = useState<GarageWithDistance | null>(null);
  const [rescueIndex, setRescueIndex] = useState(0);
  const MAX_RESCUE_OPTIONS = 3;
  const isMountedRef = useRef(true);
  const bookingLockRef = useRef(false);
  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const speedHistoryRef = useRef<number[]>([]);
  const bearingHistoryRef = useRef<number[]>([]);
  const stopStartTimeRef = useRef<number | null>(null);
  const totalStopDurationRef = useRef<number>(0);
  const lastGpsTickRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const toastedTopupIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);
  const normalizedUserPlate = useMemo(() => normalizePlate(currentUser?.carPlate), [currentUser?.carPlate]);
  const cleanUserPhone = useMemo(() => currentUser?.phone ? normalizePhone(currentUser.phone) : '', [currentUser?.phone]);
  const activeSession = useMemo(() => {
    if (!normalizedUserPlate && !cleanUserPhone) return undefined;
    return sessions
      .filter((s: Session & { customerPhone?: string; userPhone?: string }) => {
        if (s.status !== 'active') return false;
        if (acknowledgedSessionIds?.has(s.id)) return false;
        const samePlate = Boolean(normalizedUserPlate && normalizePlate(s.carPlate) === normalizedUserPlate);
        const sPhoneClean = normalizePhone(s.customerPhone || s.userPhone || (s as any).user_phone || '');
        return samePlate || Boolean(cleanUserPhone && sPhoneClean === cleanUserPhone);
      })
      .sort((a, b) => safeParseTime(b.startTime) - safeParseTime(a.startTime))[0];
  }, [sessions, normalizedUserPlate, cleanUserPhone, acknowledgedSessionIds]);
  const hasCompletedSession = useMemo(() => {
    if (activeSession) return false;
    return sessions.some((s: Session & { customerPhone?: string; userPhone?: string }) => {
      if (s.status !== 'completed') return false;
      const samePlate = Boolean(normalizedUserPlate && normalizePlate(s.carPlate) === normalizedUserPlate);
      const sPhoneClean = normalizePhone(s.customerPhone || s.userPhone || (s as any).user_phone || '');
      return samePlate || Boolean(cleanUserPhone && sPhoneClean === cleanUserPhone);
    });
  }, [sessions, normalizedUserPlate, cleanUserPhone, activeSession]);
  const myIncomingCar = useMemo(() => {
    if (!normalizedUserPlate && !cleanUserPhone) return undefined;
    return incomingCars
      .filter((c: IncomingCar) => {
        if (c.status !== 'coming') return false;
        const samePlate = Boolean(normalizedUserPlate && normalizePlate(c.carPlate) === normalizedUserPlate);
        const cPhoneClean = normalizePhone(c.customerPhone || (c as any).userPhone || '');
        return samePlate || Boolean(cleanUserPhone && cPhoneClean === cleanUserPhone);
      })
      .sort((a, b) => safeParseTime(b.startTime || 0) - safeParseTime(a.startTime || 0))[0];
  }, [incomingCars, normalizedUserPlate, cleanUserPhone]);
  const myTopUps = useMemo(() => {
    if (!cleanUserPhone || !walletTopUps) return [];
    return walletTopUps
      .filter((w) => normalizePhone(w.userPhone || w.phone || '') === cleanUserPhone)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 3);
  }, [walletTopUps, cleanUserPhone]);
  const pendingTopUpsCount = useMemo(() => myTopUps.filter((w) => w.status === 'pending').length, [myTopUps]);
  // تثبيت المراجع للحفاظ على ثبات دالة handleGarageClick وعدم كسر memo الكروت
  const bookingContextRef = useRef({
    currentUser,
    activeSession,
    myIncomingCar,
    offers,
    cleanUserPhone
  });
  useEffect(() => {
    bookingContextRef.current = {
      currentUser,
      activeSession,
      myIncomingCar,
      offers,
      cleanUserPhone
    };
  }, [currentUser, activeSession, myIncomingCar, offers, cleanUserPhone]);
  const stopGpsWatch = useCallback(() => {
    if (watchIdRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);
  const getUserLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      toast.error('خدمة تحديد الموقع غير مدعومة في متصفحك');
      return;
    }
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    stopGpsWatch();
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!isMountedRef.current) return;
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(coords);
        lastLocationRef.current = coords;
        try {
          localStorage.setItem(LAST_COORDS_STORAGE_KEY, JSON.stringify(coords));
        } catch {}
        setLocationLoading(false);
      },
      () => {
        if (isMountedRef.current) setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 }
    );
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        if (!isMountedRef.current) return;
        const newLat = position.coords.latitude;
        const newLng = position.coords.longitude;
        const rawSpeed = position.coords.speed;
        const rawHeading = position.coords.heading || 0;
        const nowMs = Date.now();
        let speedKmh = 0;
        if (rawSpeed !== null && rawSpeed !== undefined && !isNaN(rawSpeed) && rawSpeed >= 0) {
          speedKmh = rawSpeed * 3.6;
        } else if (lastGpsTickRef.current) {
          const prev = lastGpsTickRef.current;
          const distMeters = calculateDistance(prev.lat, prev.lng, newLat, newLng) * 1000;
          const timeSec = (nowMs - prev.time) / 1000;
          if (timeSec > 0 && timeSec < 30) {
            speedKmh = (distMeters / timeSec) * 3.6;
          }
        }
        lastGpsTickRef.current = { lat: newLat, lng: newLng, time: nowMs };
        speedHistoryRef.current.push(speedKmh);
        if (speedHistoryRef.current.length > 10) speedHistoryRef.current.shift();
        if (rawHeading !== null) {
          bearingHistoryRef.current.push(rawHeading);
          if (bearingHistoryRef.current.length > 5) bearingHistoryRef.current.shift();
        }
        if (speedKmh < 1.0) {
          if (stopStartTimeRef.current === null) {
            stopStartTimeRef.current = Date.now();
          } else {
            totalStopDurationRef.current = Math.round((Date.now() - stopStartTimeRef.current) / 1000);
          }
        } else {
          stopStartTimeRef.current = null;
        }
        let shouldUpdateUI = false;
        if (!lastLocationRef.current) {
          shouldUpdateUI = true;
        } else {
          const movedDist = calculateDistance(lastLocationRef.current.lat, lastLocationRef.current.lng, newLat, newLng) * 1000;
          if (movedDist >= MIN_UI_MOVE_METERS) {
            shouldUpdateUI = true;
          }
        }
        if (shouldUpdateUI) {
          const coords = { lat: newLat, lng: newLng };
          lastLocationRef.current = coords;
          setUserLocation(coords);
          try {
            localStorage.setItem(LAST_COORDS_STORAGE_KEY, JSON.stringify(coords));
          } catch {}
        }
        setLocationLoading(false);
      },
      () => {
        if (!isMountedRef.current) return;
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  }, [stopGpsWatch]);
  const handleForceRefreshLocation = useCallback(() => {
    lastLocationRef.current = null;
    getUserLocation();
    toast.success('🚀 تم تحديث رادار الموقع الدقيق', { duration: 2500, icon: '📍' });
  }, [getUserLocation]);
  // إيقاف الـ GPS تلقائياً في الخلفية لتوفير البطارية واستئنافه عند العودة
  useEffect(() => {
    getUserLocation();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stopGpsWatch();
      } else {
        getUserLocation();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopGpsWatch();
    };
  }, [getUserLocation, stopGpsWatch]);
  // 🔄 إشعار فوري للعميل عند اعتماد شحن محفظته (بدون استدعاء fetchAll لأن الـ Store يحدث الرصيد لحظياً في الذاكرة)
  useEffect(() => {
    if (!cleanUserPhone) return;
    const channelName = `garage-list-topup-${cleanUserPhone}`;
    const channel = supabase.channel(channelName)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'wallet_topups' },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          const rowPhone = normalizePhone(row.user_phone || row.userPhone || '');
          if (rowPhone === cleanUserPhone && row.status === 'approved') {
            if (!toastedTopupIdsRef.current.has(row.id)) {
              toastedTopupIdsRef.current.add(row.id);
              toast.success(`🎁 تم اعتماد شحن رصيد بمبلغ ${row.amount} ج.م بنجاح!`, { icon: '💳' });
            }
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [cleanUserPhone]);
  // حساب المسافات لجميع الجراجات مرتبة بالأقرب دائماً
  const garagesWithDistance: GarageWithDistance[] = useMemo(() => {
    return garages
      .filter((g) => g.isActive !== false)
      .map((garage) => {
        const distance = calculateDistance(userLocation.lat, userLocation.lng, garage.lat, garage.lng);
        const minutes = distanceToMinutes(distance);
        return { ...garage, distance, minutes, classification: classifyDistance(minutes) };
      })
      .sort((a, b) => a.distance - b.distance);
  }, [garages, userLocation]);
  // 🎯 خوارزمية المنقذ السريع الذكية: رصد أقرب جراجات VIP
  const MAX_RESCUE_RADIUS_KM = 20;
  const rescueGaragesList = useMemo(() => {
    if (!userLocation.lat || !userLocation.lng) return [];
    
    return garagesWithDistance
      .filter((g) => 
        g.isActive !== false &&
        g.garageType === 'vip' &&
        g.availableSpots > 0 &&
        g.distance <= MAX_RESCUE_RADIUS_KM
      )
      .slice(0, MAX_RESCUE_OPTIONS);
  }, [garagesWithDistance, userLocation.lat, userLocation.lng]);
  const currentRescueGarage = rescueGaragesList[rescueIndex] || null;
  useEffect(() => {
    setRescueIndex(0);
  }, [rescueGaragesList.length]);
  const handleNextRescue = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (rescueGaragesList.length <= 1) return;
    const nextIndex = (rescueIndex + 1) % rescueGaragesList.length;
    setRescueIndex(nextIndex);
    toast.success(`ركنة بديلة ${nextIndex + 1} من ${rescueGaragesList.length}: ${rescueGaragesList[nextIndex]?.name} — اضغط على الجراج للانتقال لشاشة التوجيه 🧭`, { duration: 2200 });
  }, [rescueIndex, rescueGaragesList]);
  const filteredGarages = useMemo(() => {
    let filtered = garagesWithDistance.filter((g) => g.garageType === activeTab);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((g) =>
        g.name.toLowerCase().includes(q) ||
        g.location.toLowerCase().includes(q) ||
        getCanonicalArea(g.area, g.name, g.location).toLowerCase().includes(q)
      );
    }
    if (showNearbyOnly) {
      filtered = filtered.filter((g) => g.classification === 'nearby');
    }
    return filtered;
  }, [garagesWithDistance, searchQuery, showNearbyOnly, activeTab]);
  const areaGroups = useMemo(() => {
    const groups: Record<string, GarageWithDistance[]> = {};
    filteredGarages.forEach((g) => {
      const zone = getCanonicalArea(g.area, g.name, g.location);
      if (!groups[zone]) groups[zone] = [];
      groups[zone].push(g);
    });
    return Object.keys(groups)
      .map((name) => ({
        name,
        garages: groups[name],
        totalCapacity: groups[name].reduce((sum, g) => sum + (g.capacity || 0), 0)
      }))
      .sort((a, b) => {
        const minA = Math.min(...a.garages.map((g) => g.distance));
        const minB = Math.min(...b.garages.map((g) => g.distance));
        return minA - minB;
      });
  }, [filteredGarages]);
  useEffect(() => {
    if (searchQuery.trim() && areaGroups.length > 0) setExpandedArea(areaGroups[0].name);
  }, [searchQuery, areaGroups]);
  // 💰 عملية الحجز والتوجيه الذكي (مستقرة مرجعياً 100% لمنع إعادة رسم الكروت)
  const handleGarageClick = useCallback(async (garage: GarageWithDistance) => {
    if (bookingLockRef.current) return;
    const {
      currentUser: user,
      activeSession: currActiveSession,
      myIncomingCar: currIncomingCar,
      offers: currOffers,
      cleanUserPhone: userPhoneClean
    } = bookingContextRef.current;
    if (garage.garageType === 'directory') {
      const canonicalZone = getCanonicalArea(garage.area, garage.name, garage.location);
      const areaCenter = AREA_CENTERS[canonicalZone];
      if (areaCenter) {
        const distanceFromCenterKm = calculateDistance(garage.lat, garage.lng, areaCenter.lat, areaCenter.lng);
        if (distanceFromCenterKm > areaCenter.maxRadiusKm) {
          supabase.from('garage_arrival_telemetry').insert({
            garage_id: garage.id,
            user_phone: userPhoneClean || '00000000000',
            lat: garage.lat,
            lng: garage.lng,
            accuracy: 999
          }).then(() => {}).catch(() => {});
        }
      }
      const url = buildGoogleMapsUrl(garage.lat, garage.lng, garage.name, garage.location || canonicalZone);
      window.open(url, '_blank', 'noopener,noreferrer');
      setActiveDirectoryTrip(garage);
      toast.success(`رحلة سعيدة! جاري توجيهك إلى ${garage.name} 🧭`, { icon: '🚙' });
      return;
    }
    if (!user) {
      toast.error('سجل بياناتك أولاً');
      return;
    }
    if (currActiveSession) {
      setSelectedGarageId(currActiveSession.garageId);
      setScreen('session');
      return;
    }
    if (currIncomingCar) {
      setSelectedGarageId(currIncomingCar.garageId);
      setScreen('navigation');
      return;
    }
    if (currOffers.some((o) => o.userId === user.phone && o.status === 'pending')) {
      toast.error('لديك عرض معلق بالفعل');
      return;
    }
    if (garage.availableSpots <= 0) {
      toast.error('لا توجد أماكن متاحة حالياً');
      return;
    }
    const resolvedHourlyPrice = Number(garage.basePrice || garage.pricePerHour || 15) > 0
      ? Number(garage.basePrice || garage.pricePerHour || 15)
      : 15;
    const { hasPaidBookingFee } = useStore.getState();
    const userWallet = user.wallet || 0;
    const todayCount = getDailyDeductionCount();
    const isFreeToday = todayCount >= 2;
    if (hasPaidBookingFee) {
      bookingLockRef.current = true;
      setIsBooking(true);
      try {
        await addIncomingCar({
          garageId: garage.id,
          carPlate: user.carPlate,
          customerName: user.name,
          customerPhone: user.phone,
          agreedPrice: resolvedHourlyPrice,
          estimatedArrival: Math.max(3, garage.minutes)
        });
        setSelectedGarageId(garage.id);
        toast.success(`تم تحويل حجزك للجراج الجديد مجاناً (الرسوم مدفوعة) 🚗`, { duration: 4000 });
        setScreen('navigation');
      } catch (e) {
        console.error(e);
        toast.error('حدث خطأ أثناء تحويل الحجز');
      } finally {
        bookingLockRef.current = false;
        setIsBooking(false);
      }
      return;
    }
    const MIN_REQUIRED_BALANCE = isFreeToday ? 7 : 10;
    if (userWallet < MIN_REQUIRED_BALANCE) {
      setPendingVipGarage(garage);
      setShowInsufficientModal(true);
      return;
    }
    bookingLockRef.current = true;
    setIsBooking(true);
    try {
      const success = await chargeBookingFee();
      if (success) {
        await addIncomingCar({
          garageId: garage.id,
          carPlate: user.carPlate,
          customerName: user.name,
          customerPhone: user.phone,
          agreedPrice: resolvedHourlyPrice,
          estimatedArrival: Math.max(3, garage.minutes)
        });
        setSelectedGarageId(garage.id);
        if (isFreeToday) {
          toast.success(`تم الحجز مجاناً! استوفيت الحد الأقصى للخصم اليومي 🎁`, { duration: 4000, icon: '🎉' });
        } else {
          const nextCount = todayCount + 1;
          toast.success(`تم الخصم بنجاح (${BOOKING_FEE} ج.م) — الخصم رقم ${nextCount} اليوم 🚗`);
        }
        setScreen('navigation');
      } else {
        toast.error('حدث خطأ أثناء الخصم، برجاء المحاولة لاحقاً');
      }
    } catch (e) {
      console.error(e);
      toast.error('حدث خطأ أثناء إتمام الحجز');
    } finally {
      bookingLockRef.current = false;
      setIsBooking(false);
    }
  }, [getDailyDeductionCount, addIncomingCar, setSelectedGarageId, setScreen, chargeBookingFee]);
  const handleConfirmArrival = useCallback(async () => {
    if (!activeDirectoryTrip) return;
    const tripToCalibrate = activeDirectoryTrip;
    setActiveDirectoryTrip(null);
    setActiveTab('directory');
    toast.success('حمد الله على سلامتك! نورت بركن من جديد 🌟', { duration: 3000 });
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        try {
          const { latitude, longitude, accuracy } = position.coords;
          let maxBearingChange = 0;
          if (bearingHistoryRef.current.length >= 2) {
            maxBearingChange = Math.abs(bearingHistoryRef.current[bearingHistoryRef.current.length - 1] - bearingHistoryRef.current[0]);
          }
          const avgSpeed = speedHistoryRef.current.reduce((a, b) => a + b, 0) / (speedHistoryRef.current.length || 1);
          await supabase.rpc('record_arrival_telemetry', {
            p_garage_id: tripToCalibrate.id,
            p_user_lat: latitude,
            p_user_lng: longitude,
            p_accuracy: accuracy || 10,
            p_user_phone: cleanUserPhone || null,
            p_speed: avgSpeed,
            p_bearing_change: maxBearingChange,
            p_stop_duration: totalStopDurationRef.current || 0
          });
          speedHistoryRef.current = [];
          bearingHistoryRef.current = [];
          totalStopDurationRef.current = 0;
        } catch (e) {}
      }, () => {}, { enableHighAccuracy: true, timeout: 6000 });
    }
  }, [activeDirectoryTrip, cleanUserPhone]);
  const handleOpenPriceReport = useCallback((g: GarageWithDistance) => {
    setReportingGarage(g);
    setUpdatedPriceInput(g.priceType === 'daily' ? (g.dailyPrice || g.basePrice || g.pricePerHour || 20) : (g.basePrice || g.pricePerHour || 20));
  }, []);
  const handleSubmitPriceUpdate = async () => {
    const finalPrice = updatedPriceInput === '' ? (reportingGarage?.basePrice || reportingGarage?.pricePerHour || 20) : updatedPriceInput;
    if (!reportingGarage || finalPrice <= 0) return;
    setIsSubmittingPrice(true);
    try {
      const result = await reportPriceUpdate(reportingGarage.id, finalPrice, reportingGarage.priceType) as any;
      if (result?.status === 'approved') {
        toast.success(`رائع! تم تحديث السعر رسمياً إلى ${finalPrice} ج.م بعد تأكيد 3 مستخدمين! 🎉`, { duration: 5000, icon: '🔥' });
      } else if (result?.status === 'voted') {
        toast.success(`تم تسجيل تأكيدك! السعر مؤكد الآن من ${result.votes} مستخدمين. متبقي ${result.required - result.votes} تأكيد ⏳`, { duration: 5000, icon: '👍' });
      } else if (result?.status === 'started') {
        toast.success(`شكراً لمساعدتك! تم تسجيل بلاغك.. بانتظار تأكيد مستخدمين آخرين لتعديل السعر رسمياً.`, { duration: 5000, icon: '🤝' });
      } else {
        toast.success('شكراً لمساعدتك! تم تسجيل بلاغك 🤝', { icon: '✅' });
      }
      setReportingGarage(null);
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تحديث السعر، يرجى المحاولة لاحقاً');
    } finally {
      setIsSubmittingPrice(false);
    }
  };
  return (
    <div className="h-full flex flex-col overflow-hidden relative select-none" style={{ background: BRAND.bg, color: BRAND.navy }}>
      
      {/* الهيدر المدمج */}
      <div className="px-3.5 pt-8 pb-2.5 z-20 shadow-xs relative" style={{ background: BRAND.card, borderBottom: `1.5px solid ${BRAND.border}` }}>
        <div dir="rtl" className="flex justify-between items-center gap-2 mb-2">
          
          <div className="text-right flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0">
              <img
                src="/icons/logo.png"
                alt="Park'n 24"
                className="h-10 w-auto object-contain filter drop-shadow-xs"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  const fallback = document.getElementById('logo-fallback');
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
              <div id="logo-fallback" style={{ display: 'none' }} className="items-center font-black text-xl tracking-tighter">
                <span style={{ color: BRAND.blue }}>P</span>
                <span style={{ color: BRAND.green }}>24</span>
              </div>
            </div>
            
            <div className="flex flex-col min-w-0 justify-center">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm sm:text-base font-black text-slate-900 leading-tight">
                  أهلاً {currentUser?.name?.split(' ')[0] || 'بك'} 👋
                </span>
                {currentUser?.carPlate && (
                  <span className="text-[11px] sm:text-xs font-mono font-black px-2 py-0.5 rounded-lg bg-blue-50 text-[#1656b8] border border-blue-200/90 shadow-2xs shrink-0 flex items-center gap-1">
                    <span>🚗</span>
                    <span>{currentUser.carPlate}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowTopUp(true)}
              className="flex items-center gap-2 px-2.5 py-2 rounded-xl border cursor-pointer active:scale-95 transition-all shadow-xs h-10"
              style={{
                background: `linear-gradient(135deg, ${BRAND.blueDark} 0%, ${BRAND.blueDeep} 100%)`,
                borderColor: BRAND.green,
                color: '#fff'
              }}
              title="شحن المحفظة"
            >
              <div className="flex flex-col items-end leading-none">
                <span className="text-[8px] font-bold text-slate-300">رصيدك</span>
                <span className="font-mono font-black text-[13px] text-yellow-300">
                  {currentUser?.wallet || 0}<span className="text-[8px] text-white font-sans mr-0.5">ج</span>
                </span>
              </div>
              <div
                className="w-5 h-5 rounded-lg flex items-center justify-center font-black shadow-xs"
                style={{ background: BRAND.green, color: BRAND.blueDeep }}
              >
                <Plus size={13} strokeWidth={3.5} />
              </div>
            </button>
            <button
              type="button"
              onClick={() => setShowQrModal(true)}
              className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer active:scale-90 transition-all bg-slate-50 hover:bg-slate-100 border shadow-2xs"
              style={{ borderColor: BRAND.border }}
              title="مشاركة الكود"
            >
              <QrCode size={20} strokeWidth={2.2} style={{ color: BRAND.blue }} />
            </button>
            <button
              type="button"
              onClick={() => setShowSmartMenu(true)}
              className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer active:scale-90 transition-all relative bg-slate-50 hover:bg-slate-100 border shadow-2xs"
              style={{ borderColor: BRAND.border }}
              title="القائمة"
            >
              <Menu size={20} strokeWidth={2.2} style={{ color: BRAND.navy }} />
              {pendingTopUpsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 border border-white animate-ping" />
              )}
            </button>
          </div>
        </div>
        {/* بانر المنقذ السريع */}
        {currentRescueGarage && !activeSession && !myIncomingCar && (
          <div
            className="mb-2.5 rounded-2xl overflow-hidden border-2 text-right transition-all shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${BRAND.blueDark} 0%, ${BRAND.blueDeep} 100%)`,
              borderColor: BRAND.green,
              boxShadow: '0 6px 20px rgba(14, 58, 125, 0.28)',
              direction: 'rtl'
            }}
          >
            <div className="px-3.5 py-2 flex items-center justify-between border-b border-white/15 bg-white/5">
              <div className="flex items-center gap-2">
                <Radio size={15} className="text-lime-400 animate-pulse shrink-0" />
                <span className="text-xs sm:text-sm font-black text-white">
                  ⚡ رادار المنقذ السريع (الجراج الأقرب لموقعك بالمتر)
                </span>
              </div>
              <span className="font-black text-[10px] sm:text-xs px-2.5 py-0.5 rounded-lg bg-white/15 text-lime-300 border border-white/20 font-mono shrink-0">
                {rescueIndex + 1} من {rescueGaragesList.length}
              </span>
            </div>
            <div
              className="p-3.5 cursor-pointer active:opacity-90 transition-all"
              onClick={() => handleGarageClick(currentRescueGarage)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className="text-[10px] font-black px-2 py-0.5 rounded-md text-white flex items-center gap-1 shadow-2xs"
                      style={{ background: currentRescueGarage.garageType === 'vip' ? BRAND.greenDark : '#475569' }}
                    >
                      {currentRescueGarage.garageType === 'vip' ? <ShieldCheck size={11} /> : '🧭'}
                      {currentRescueGarage.garageType === 'vip' ? 'VIP مؤمن بالرادار' : 'ساحة مفتوحة'}
                    </span>
                    <span className="text-[11px] font-bold text-lime-200">
                      📍 يبعد عنك بالظبط: {(currentRescueGarage.distance * 1000).toFixed(0)} متر
                    </span>
                  </div>
                  <h4 className="text-sm sm:text-base font-black text-white leading-snug mb-1.5 truncate">
                    {currentRescueGarage.name}
                  </h4>
                  <div className="flex items-center gap-3.5">
                    <span className="text-sm sm:text-base font-black text-lime-300 font-mono">
                      💰 {currentRescueGarage.priceType === 'daily'
                        ? `${currentRescueGarage.dailyPrice || currentRescueGarage.basePrice || currentRescueGarage.pricePerHour || 15} ج/يوم`
                        : `${currentRescueGarage.basePrice || currentRescueGarage.pricePerHour || 15} ج/ساعة`}
                    </span>
                    <span className="text-[11px] sm:text-xs font-bold text-slate-200">
                      ⏱️ {formatDuration(currentRescueGarage.minutes)}
                    </span>
                  </div>
                </div>
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-md transition-transform active:scale-90"
                  style={{ background: BRAND.green, border: `2px solid ${BRAND.greenDark}` }}
                  title="توجيه سريع"
                >
                  <Navigation size={20} className="rotate-45 text-slate-950 stroke-[2.5]" />
                </div>
              </div>
              <div
                className="mt-2.5 py-2.5 px-3.5 rounded-xl flex items-center justify-between gap-2 shadow-md transition-transform active:scale-[0.99]"
                style={{
                  background: BRAND.greenDark,
                  border: `1.5px solid ${BRAND.green}`,
                  color: '#ffffff',
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.35)'
                }}
              >
                <span className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
                  <span>👆</span>
                  <span>اضغط هنا لتأكيد الجراج والانتقال لشاشة التوجيه</span>
                </span>
                <span className="text-[11px] sm:text-xs font-black px-2.5 py-1 rounded-lg bg-black/25 text-white border border-white/30 shrink-0 flex items-center gap-1">
                  <span>ابدأ المسار</span>
                  <Navigation size={13} className="rotate-45 text-white stroke-[3]" />
                </span>
              </div>            </div>
          </div>
        )}
        {/* زر الركنة البديلة */}
        {rescueGaragesList.length > 1 && !activeSession && !myIncomingCar && (
          <button
            type="button"
            onClick={handleNextRescue}
            className="w-full mb-2.5 py-3 px-3.5 rounded-xl text-xs sm:text-sm font-black cursor-pointer active:scale-[0.98] transition-all flex items-center justify-between shadow-sm"
            style={{
              background: `linear-gradient(135deg, ${BRAND.blueDark} 0%, ${BRAND.blueDeep} 100%)`,
              border: `1.5px solid ${BRAND.green}`,
              color: '#ffffff',
              boxShadow: '0 3px 12px rgba(14, 58, 125, 0.18)',
              direction: 'rtl'
            }}
          >
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-lime-400 animate-ping" />
              <span className="font-black text-xs sm:text-sm text-white">🔍 شوف الركنة البديلة اللي بعدها</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-black text-lime-300 bg-white/10 px-2.5 py-1 rounded-lg border border-white/20">
              <Sparkles size={12} className="text-lime-400" />
              <span>خيار {((rescueIndex + 1) % rescueGaragesList.length) + 1} من {rescueGaragesList.length}</span>
            </div>
          </button>
        )}
        {/* إشعارات الجلسة النشطة */}
        {activeSession && (
          <button
            type="button"
            onClick={() => { setSelectedGarageId(activeSession.garageId); setScreen('session'); }}
            className="w-full mb-2 flex items-center justify-between px-3.5 py-2.5 rounded-xl border-2 text-white cursor-pointer active:scale-98 transition-all shadow-md animate-pulse"
            style={{ background: BRAND.greenDark, borderColor: BRAND.green }}
          >
            <span className="text-[11px] font-black">فتح شاشة المراقبة ←</span>
            <span className="text-[12px] font-black flex items-center gap-1.5">
              <ShieldCheck size={16} /> 🛡️ درع الحماية نشط والركنة جارية
            </span>
          </button>
        )}
        {!activeSession && myIncomingCar && (
          <button
            type="button"
            onClick={() => { setSelectedGarageId(myIncomingCar.garageId); setScreen('navigation'); }}
            className="w-full mb-2 flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-white cursor-pointer active:scale-98 transition-all shadow-sm"
            style={{ background: BRAND.blue, borderColor: BRAND.blueDark }}
          >
            <span className="text-[11px] font-black">فتح المسار ←</span>
            <span className="text-[12px] font-black flex items-center gap-1.5">
              <Navigation size={15} className="rotate-45" /> 📍 حجز مؤكد (أنت في الطريق)
            </span>
          </button>
        )}
        {/* شريط البحث */}
        <div className="flex gap-2 mb-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: BRAND.blue }} />
            <input
              type="text"
              className="w-full outline-none text-xs font-bold rounded-xl transition-all focus:bg-white"
              style={{
                padding: '9px 34px 9px 34px',
                background: '#ffffff',
                border: `1.5px solid ${BRAND.borderDark}`,
                color: BRAND.navy,
              }}
              placeholder="🔍 ابحث عن ساحة ركن أو منطقة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery ? (
              <div className="absolute left-2.5 inset-y-0 flex items-center z-10">
                <button
                  type="button"
                  onClick={() => { setSearchQuery(''); setExpandedArea(null); }}
                  className="rounded-full w-5 h-5 flex items-center justify-center cursor-pointer border-0 active:scale-90 transition-all text-white"
                  style={{ background: BRAND.blue }}
                >
                  <X size={12} strokeWidth={3} />
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleForceRefreshLocation}
            disabled={locationLoading}
            className="flex items-center justify-center border cursor-pointer shrink-0 active:scale-90 transition-all shadow-xs"
            style={{
              background: BRAND.blue,
              borderColor: BRAND.blueDark,
              color: '#fff',
              borderRadius: 12,
              width: 36,
              height: 36
            }}
            title="تحديث الموقع"
          >
            <Locate size={16} className={locationLoading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => setShowNearbyOnly(!showNearbyOnly)}
            className="text-[11px] font-black px-2.5 rounded-xl cursor-pointer shrink-0 active:scale-95 transition-all flex items-center gap-1 shadow-xs"
            style={{
              background: showNearbyOnly ? BRAND.blue : '#ffffff',
              color: showNearbyOnly ? '#fff' : BRAND.slate,
              border: `1.5px solid ${showNearbyOnly ? BRAND.blueDark : BRAND.borderDark}`
            }}
          >
            {showNearbyOnly ? '🌍 الكل' : '📍 القريب'}
          </button>
        </div>
        {/* التبويبات */}
        <div className="flex p-1 rounded-xl bg-slate-100" style={{ direction: 'rtl', border: `1px solid ${BRAND.border}` }}>
          <button
            type="button"
            onClick={() => { setActiveTab('vip'); setExpandedArea(null); }}
            className="flex-1 py-1.5 rounded-lg font-black text-xs cursor-pointer border-0 transition-all flex items-center justify-center gap-1.5 relative shadow-xs"
            style={{
              background: activeTab === 'vip' ? BRAND.blue : 'transparent',
              color: activeTab === 'vip' ? '#ffffff' : BRAND.slate,
            }}
          >
            <ShieldCheck size={14} className={activeTab === 'vip' ? 'text-lime-300' : 'text-slate-400'} />
            <span>⭐ VIP مؤمن بالدرع ({BOOKING_FEE} ج)</span>
          </button>
          
          <button
            type="button"
            onClick={() => { setActiveTab('directory'); setExpandedArea(null); }}
            className="flex-1 py-1.5 rounded-lg font-black text-xs cursor-pointer border-0 transition-all flex items-center justify-center gap-1.5"
            style={{
              background: activeTab === 'directory' ? BRAND.blueDark : 'transparent',
              color: activeTab === 'directory' ? '#ffffff' : BRAND.slate,
            }}
          >
            <span>🧭 دليل الساحات المفتوح</span>
          </button>
        </div>
      </div>
      {/* قائمة المناطق والساحات */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-8">
        {areaGroups.length > 0 ? (
          <div className="space-y-3">
            {areaGroups.map((group) => {
              const isExpanded = expandedArea === group.name;
              const totalGarages = group.garages.length;
              return (
                <div
                  key={group.name}
                  style={{
                    background: BRAND.card,
                    borderRadius: 16,
                    border: `1.5px solid ${isExpanded ? BRAND.blue : BRAND.border}`,
                    overflow: 'hidden',
                    boxShadow: isExpanded ? '0 4px 14px rgba(22,86,184,0.08)' : '0 1px 3px rgba(0,0,0,0.02)'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedArea(isExpanded ? null : group.name)}
                    className="w-full p-3.5 flex items-center justify-between text-right bg-transparent border-none cursor-pointer outline-none"
                  >
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-black font-mono px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-800 border border-slate-200">
                        {totalGarages} {activeTab === 'vip' ? 'معتمد' : 'ساحات'}
                      </span>
                      <ChevronDown
                        size={17}
                        style={{
                          color: BRAND.blue,
                          transform: isExpanded ? 'rotate(180deg)' : 'none',
                          transition: 'transform 0.25s ease'
                        }}
                      />
                    </div>
                    <div className="text-right">
                      <span className="font-black text-[14px] block text-slate-900">
                        {AREA_ICONS[group.name] || '📍'} {group.name}
                      </span>
                      <span className="text-[11px] font-bold block mt-0.5" style={{ color: activeTab === 'vip' ? BRAND.blue : BRAND.slateLight }}>
                        {activeTab === 'vip' ? `🛡️ جراجات معتمدة برادار حماية — الحجز بـ ${BOOKING_FEE} ج.م` : '🧭 مواقف وساحات عامة متاحة'}
                      </span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div style={{ background: BRAND.bg, padding: '10px', borderTop: `1px solid ${BRAND.border}` }} className="space-y-2.5">
                      {(() => {
                        const limit = visibleLimits[group.name] || 8;
                        const displayedGarages = group.garages.slice(0, limit);
                        const hasMore = group.garages.length > limit;
                        return (
                          <>
                            {displayedGarages.map((garage, i) => (
                              <GarageCard
                                key={garage.id}
                                garage={garage}
                                index={i}
                                onSelect={handleGarageClick}
                                onReportPrice={handleOpenPriceReport}
                                isNearby={garage.classification === 'nearby'}
                                isClosest={i === 0 && garage.classification === 'nearby'}
                                hasActiveSession={Boolean(activeSession)}
                                hasIncomingCar={Boolean(myIncomingCar)}
                                disabled={isBooking}
                              />
                            ))}
                            {hasMore && (
                              <button
                                type="button"
                                onClick={() => {
                                  setVisibleLimits(prev => ({ ...prev, [group.name]: limit + 10 }));
                                  toast.success('تم تحميل ساحات إضافية 📍', { id: 'lazy-load-toast' });
                                }}
                                className="w-full py-2.5 rounded-xl font-black text-xs cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-1 bg-white mt-2 shadow-xs"
                                style={{ color: BRAND.blue, border: `1.5px solid ${BRAND.borderDark}` }}
                              >
                                <span>عرض باقي الساحات (+{group.garages.length - limit}) 🔽</span>
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 text-slate-400">
            <span className="text-4xl block mb-3">🚗🔍</span>
            <p className="text-xs font-bold leading-relaxed max-w-[240px] mx-auto text-slate-600">
              لا توجد ساحات مطابقة لبحثك، جرب البحث باسم منطقة أو معلم شهير!
            </p>
          </div>
        )}
      </div>
      {/* مودال رصيدك غير كافي */}
      <AnimatePresence>
        {showInsufficientModal && pendingVipGarage && (
          <div
            className="fixed inset-0 z-[1600] flex items-center justify-center p-5"
            style={{ background: 'rgba(10,22,40,0.85)', backdropFilter: 'blur(8px)' }}
            onClick={() => { setShowInsufficientModal(false); setPendingVipGarage(null); }}
          >
            <motion.div
              initial={{ scale: 0.88, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.88, opacity: 0, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="rounded-3xl p-6 text-center max-w-sm w-full shadow-2xl relative border"
              style={{ background: BRAND.card, borderColor: BRAND.border }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 bg-amber-50 border border-amber-200">
                <Wallet size={28} className="text-amber-600" />
              </div>
              <h3 className="text-base font-black mb-1 text-slate-900">رصيد محفظتك غير كافي 💳</h3>
              <p className="text-xs font-bold mb-4 leading-relaxed text-slate-600">
                محتاج <b style={{ color: BRAND.blue }}>10 ج.م</b> على الأقل عشان تحجز وتفعّل درع الحماية في <b className="text-slate-900">{pendingVipGarage.name}</b>
              </p>
              
              <div className="rounded-2xl p-3 mb-4 text-right bg-slate-50 border" style={{ borderColor: BRAND.border }}>
                <div className="flex justify-between items-center mb-1.5 pb-1.5 border-b border-slate-200">
                  <span className="font-mono font-black text-red-600 text-sm">{currentUser?.wallet || 0} ج.م</span>
                  <span className="text-[11px] font-bold text-slate-600">💰 رصيدك الحالي</span>
                </div>
                <div className="flex justify-between items-center mb-1.5 pb-1.5 border-b border-slate-200">
                  <span className="font-mono font-black text-sm text-blue-700">{BOOKING_FEE} ج.م</span>
                  <span className="text-[11px] font-bold text-slate-600">🅿️ رسوم الحجز</span>
                </div>
                <div className="flex justify-between items-center mb-1.5 pb-1.5 border-b border-slate-200">
                  <span className="font-mono font-black text-sm text-purple-700">7 ج.م</span>
                  <span className="text-[11px] font-bold text-slate-600">🛡️ درع الحماية ضد الونش</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-mono font-black text-amber-600 text-sm">{Math.max(0, 10 - (currentUser?.wallet || 0))} ج.م</span>
                  <span className="text-[11px] font-bold text-slate-800">📊 المطلوب شحنه</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {TOPUP_TIERS.map((tier) => (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => {
                      setShowInsufficientModal(false);
                      setPendingVipGarage(null);
                      setShowTopUp(true);
                    }}
                    className="p-3 rounded-xl cursor-pointer active:scale-95 transition-all text-right relative overflow-hidden"
                    style={{
                      background: tier.popular ? `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueDark} 100%)` : BRAND.card,
                      color: tier.popular ? '#ffffff' : BRAND.blueDark,
                      border: tier.popular ? `1.5px solid ${BRAND.green}` : `1.5px solid ${BRAND.border}`,
                    }}
                  >
                    {tier.popular && (
                      <span className="absolute top-1 left-1 text-[7px] font-black px-1.5 py-0.2 rounded-md text-slate-950" style={{ background: BRAND.green }}>
                        الأفضل ⭐
                      </span>
                    )}
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="font-black text-base font-mono">{tier.amount} ج</span>
                      <span className="text-[10px] font-bold" style={{ color: tier.popular ? '#d9f99d' : BRAND.greenDark }}>+ {tier.bonus} ج بونص 🎁</span>
                      <span className="text-[9px] font-bold" style={{ color: tier.popular ? 'rgba(255,255,255,0.8)' : BRAND.slateLight }}>≈ {tier.bookings} حجز</span>
                    </div>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowInsufficientModal(false);
                  setPendingVipGarage(null);
                  setShowTopUp(true);
                }}
                className="w-full py-3 rounded-xl font-black text-sm text-white border-0 cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2 shadow-md mb-2"
                style={{ background: BRAND.blue }}
              >
                <Wallet size={16} />
                <span>شحن المحفظة فوراً 💰</span>
              </button>
              <button
                type="button"
                onClick={() => { setShowInsufficientModal(false); setPendingVipGarage(null); }}
                className="w-full py-2 rounded-xl font-bold text-xs cursor-pointer active:scale-95 transition-all bg-slate-100 text-slate-600"
                style={{ border: `1px solid ${BRAND.border}` }}
              >
                إلغاء
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* القائمة الذكية */}
      <AnimatePresence>
        {showSmartMenu && (
          <div className="fixed inset-0 z-[1500] flex items-end" style={{ background: 'rgba(10,22,40,0.65)', backdropFilter: 'blur(5px)' }} onClick={() => setShowSmartMenu(false)}>
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 300 }} className="w-full max-w-md mx-auto bg-white rounded-t-[32px] p-5 pb-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="w-12 h-1.5 rounded-full bg-slate-300 mx-auto mb-5" />
              <div className="flex justify-between items-center mb-4 pb-3 border-b" style={{ borderColor: BRAND.border }}>
                <button type="button" onClick={() => setShowSmartMenu(false)} className="text-slate-400 font-bold text-lg border-0 bg-transparent cursor-pointer">✕</button>
                <h3 className="font-black text-base text-slate-900">⚙️ القائمة والخدمات السريعة</h3>
              </div>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => { setShowSmartMenu(false); setShowTopUp(true); }}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl cursor-pointer active:scale-[0.98] transition-all bg-white border"
                  style={{ borderColor: BRAND.border }}
                >
                  <ChevronDown size={18} className="rotate-90 text-slate-400" />
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-sm font-black block mb-0.5 text-slate-900">شحن رصيد المحفظة</span>
                      <span className="text-[11px] font-bold text-slate-500">اشحن بـ إنستاباي أو محافظ الكاش</span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
                      <Wallet size={18} style={{ color: BRAND.blue }} />
                    </div>
                  </div>
                </button>
                {hasCompletedSession && (
                  <button
                    type="button"
                    onClick={() => { setShowSmartMenu(false); setScreen('lastSession'); }}
                    className="w-full flex items-center justify-between p-3.5 rounded-2xl cursor-pointer active:scale-[0.98] transition-all bg-white border"
                    style={{ borderColor: BRAND.border }}
                  >
                    <ChevronDown size={18} className="rotate-90 text-slate-400" />
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-sm font-black block mb-0.5 text-slate-900">إيصال آخر ركنة</span>
                        <span className="text-[11px] font-bold text-slate-500">عرض تفاصيل وحساب آخر جلسة</span>
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                        <Receipt size={18} style={{ color: BRAND.greenDark }} />
                      </div>
                    </div>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setShowSmartMenu(false); setScreen('chat'); }}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl cursor-pointer active:scale-[0.98] transition-all bg-white border"
                  style={{ borderColor: BRAND.border }}
                >
                  <ChevronDown size={18} className="rotate-90 text-slate-400" />
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-sm font-black block mb-0.5 text-slate-900">الدعم والشكاوى 24/7</span>
                      <span className="text-[11px] font-bold text-slate-500">فريق الدعم الفني جاهز لمساعدتك</span>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                      <MessageCircle size={18} className="text-amber-600" />
                    </div>
                  </div>
                </button>
                {myTopUps.length > 0 && (
                  <div className="pt-3 mt-3 border-t" style={{ borderColor: BRAND.border }}>
                    <div className="flex justify-between items-center mb-2.5">
                      <span className="text-[11px] font-bold text-slate-400">آخر 3 عمليات</span>
                      <span className="text-xs font-black text-slate-800">📜 سجل الشحن</span>
                    </div>
                    <div className="space-y-2">
                      {myTopUps.map((topUp) => (
                        <div key={topUp.id} className="flex justify-between items-center text-right p-2.5 rounded-xl bg-slate-50 border" style={{ borderColor: BRAND.border }}>
                          <div>
                            <span className="font-black text-sm text-slate-900 block font-mono">{topUp.amount} ج.م</span>
                            <span className="font-bold text-[10px] text-slate-500 block" dir="ltr">
                              {new Date(topUp.timestamp).toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <span className="font-bold text-[10px] px-2 py-1 rounded-md bg-white border border-slate-200 shadow-2xs">
                            {topUp.status === 'pending' ? '⏳ قيد المراجعة' : topUp.status === 'approved' ? '✅ تم الشحن' : '❌ مرفوض'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>{showTopUp && <TopUpWalletModal onClose={() => setShowTopUp(false)} />}</AnimatePresence>
      {/* مودال QR */}
      <AnimatePresence>
        {showQrModal && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center p-5" style={{ background: 'rgba(10,22,40,0.85)', backdropFilter: 'blur(8px)' }} onClick={() => setShowQrModal(false)}>
            <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.88, opacity: 0 }} className="rounded-3xl p-6 text-center max-w-sm w-full shadow-2xl relative bg-white border border-slate-100" onClick={e => e.stopPropagation()}>
              <button type="button" onClick={() => setShowQrModal(false)} className="absolute top-4 left-4 text-slate-400 font-bold text-lg border-0 bg-transparent cursor-pointer">✕</button>
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: `${BRAND.green}25` }}>
                <QrCode size={24} style={{ color: BRAND.greenDark }} />
              </div>
              <h3 className="text-base font-black mb-1 text-slate-900">📲 شارك بركن 24 مع أصحابك</h3>
              <p className="text-xs font-bold mb-4 leading-relaxed text-slate-600">دليل ورادار الركن الذكي الأول في مصر parkn24.com 🚗💨</p>
              <div className="w-60 h-60 mx-auto p-3.5 bg-white rounded-[28px] border-4 shadow-lg flex items-center justify-center mb-4" style={{ borderColor: BRAND.blue }}>
                <QRCodeCanvas
                  value={`${SITE_URL}/install`}
                  size={210}
                  level="H"
                  bgColor="#ffffff"
                  fgColor="#0A1628"
                  includeMargin={false}
                />
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={async () => {
                    const appUrl = `${SITE_URL}/install`;
                    try {
                      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                        await navigator.clipboard.writeText(appUrl);
                      } else {
                        const textArea = document.createElement('textarea');
                        textArea.value = appUrl;
                        textArea.style.position = 'fixed';
                        textArea.style.opacity = '0';
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                      }
                      toast.success('تم نسخ رابط التطبيق بنجاح! 📋🚀', { duration: 3000 });
                    } catch {
                      toast.error('تعذر نسخ الرابط');
                    }
                  }}
                  className="w-full py-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all border-0 text-white shadow-md"
                  style={{ background: BRAND.greenDark }}
                >
                  <Copy size={15} />
                  <span>نسخ رابط التطبيق 🔗</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowQrModal(false)}
                  className="w-full py-2.5 rounded-xl font-bold text-xs text-slate-600 bg-slate-100 cursor-pointer active:scale-95 transition-all"
                  style={{ border: `1px solid ${BRAND.border}` }}
                >
                  إغلاق النافذة
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* نافذة الإبلاغ عن تعديل السعر */}
      <AnimatePresence>
        {reportingGarage && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-5" style={{ background: 'rgba(10,22,40,0.8)', backdropFilter: 'blur(6px)' }} onClick={() => setReportingGarage(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="rounded-3xl p-6 text-right max-w-xs w-full shadow-2xl relative bg-white border border-slate-200" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-3">
                <button type="button" onClick={() => setReportingGarage(null)} className="text-slate-400 font-bold text-sm border-0 bg-transparent cursor-pointer">✕</button>
                <h3 className="text-base font-black text-slate-900">✍️ تعديل سعر الساحة</h3>
              </div>
              <p className="text-xs font-bold mb-4 text-slate-600">
                لقيت السعر اتغير في <b className="text-slate-900">{reportingGarage.name}</b>؟ اكتب السعر الحقيقي وساعد غيرك! 🤝
              </p>
              <div className="mb-5">
                <label className="text-[11px] font-black block mb-2 text-right text-slate-700">السعر الفعلي في الشارع:</label>
                <div className="rounded-2xl p-3 bg-slate-50 border" style={{ borderColor: BRAND.border }}>
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setUpdatedPriceInput(p => Math.max(5, (Number(p) || 0) - 5))}
                      className="active:scale-90 border-0 rounded-xl text-white font-black w-9 h-9 flex items-center justify-center cursor-pointer bg-red-500 shadow-xs"
                    >
                      <Minus size={15} strokeWidth={3} />
                    </button>
                    <div className="text-center flex-1">
                      <input
                        type="number"
                        pattern="\d*"
                        inputMode="numeric"
                        value={updatedPriceInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '') setUpdatedPriceInput('');
                          else {
                            const parsed = parseInt(val, 10);
                            if (!isNaN(parsed)) setUpdatedPriceInput(parsed);
                          }
                        }}
                        onBlur={() => {
                          if (updatedPriceInput === '' || Number(updatedPriceInput) <= 0) {
                            setUpdatedPriceInput(reportingGarage.basePrice || reportingGarage.pricePerHour || 20);
                          }
                        }}
                        className="bg-transparent text-center w-full outline-none font-mono font-black text-2xl border-0 p-0 text-slate-900"
                      />
                      <div className="font-bold text-[10px] mt-0.5 text-slate-500">
                        {reportingGarage.priceType === 'daily' ? 'ج.م / اليوم بالكامل' : 'ج.م / الساعة'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUpdatedPriceInput(p => (Number(p) || 0) + 5)}
                      className="active:scale-90 border-0 rounded-xl text-white font-black w-9 h-9 flex items-center justify-center cursor-pointer bg-emerald-500 shadow-xs"
                    >
                      <Plus size={15} strokeWidth={3} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSubmitPriceUpdate}
                  disabled={isSubmittingPrice}
                  className="flex-1 py-2.5 rounded-xl font-black text-xs text-white border-0 cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-1 shadow-md"
                  style={{ background: BRAND.blue }}
                >
                  <Check size={14} />
                  <span>{isSubmittingPrice ? 'جاري الحفظ...' : 'تأكيد السعر'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReportingGarage(null)}
                  className="py-2.5 px-3 rounded-xl font-bold text-xs bg-slate-100 text-slate-600 cursor-pointer border"
                  style={{ borderColor: BRAND.border }}
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* شاشة طريق السلامة */}
      <AnimatePresence>
        {activeDirectoryTrip && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] flex flex-col justify-between p-6 text-center select-none"
            style={{ background: 'linear-gradient(180deg, #0a1628 0%, #030712 100%)' }}
          >
            <div className="pt-14 max-w-sm mx-auto w-full">
              <motion.div
                initial={{ scale: 0.3, opacity: 0, y: 30 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: 'spring', damping: 11, stiffness: 140 }}
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-slate-800 border-2 border-lime-400 shadow-xl"
              >
                <span className="text-3xl">🚙</span>
              </motion.div>
              <h2 className="text-lg font-black text-white mb-1.5">طريق السلامة يا بطل! 🛣️✨</h2>
              <p className="text-xs font-bold text-slate-300 mb-5 leading-relaxed">
                جاري توجيهك الآن عبر خرائط جوجل إلى <b className="text-lime-400">{activeDirectoryTrip.name}</b>
              </p>
              
              <div className="border border-slate-700 rounded-2xl p-4 bg-slate-900/90 mb-4 shadow-xl">
                <span className="text-[11px] font-bold text-slate-400 block mb-1">💰 السعر المتوقع هناك</span>
                <span className="font-black text-2xl text-lime-400 font-mono block mb-2 leading-none">
                  {activeDirectoryTrip.priceType === 'daily'
                    ? `${activeDirectoryTrip.dailyPrice || activeDirectoryTrip.basePrice || activeDirectoryTrip.pricePerHour || 15} ج.م / اليوم`
                    : `${activeDirectoryTrip.basePrice || activeDirectoryTrip.pricePerHour || 15} ج.م / ساعة`}
                </span>
                <span className="text-[12px] font-black text-white block mt-2 border-t border-slate-800 pt-2.5">
                  💵 يرجى سداد الحساب كاش للسايس
                </span>
              </div>
              <div className="p-3 rounded-xl text-right bg-amber-500/10 border border-amber-500/30 flex gap-2">
                <div className="text-right w-full">
                  <span className="text-[11px] font-black text-amber-400 block mb-0.5">💡 شارك مجتمع بركن 24</span>
                  <span className="text-[10px] font-bold text-slate-200 leading-relaxed block">
                    أول ما توصل بالسلامة، لو لقيت السعر اتغير أو السايس طلب زيادة، عدل السعر فوراً لمساعدة السائقين! 🤝
                  </span>
                </div>
              </div>
            </div>
            <div className="max-w-xs mx-auto w-full space-y-2.5 pb-6">
              <button
                type="button"
                onClick={() => {
                  const url = buildGoogleMapsUrl(
                    activeDirectoryTrip.lat, 
                    activeDirectoryTrip.lng, 
                    activeDirectoryTrip.name, 
                    activeDirectoryTrip.location || ''
                  );
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}
                className="w-full py-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all border-0 text-white shadow-md"
                style={{ background: BRAND.blue }}
              >
                <Navigation size={14} />
                <span>إعادة فتح خرائط جوجل 🗺️</span>
              </button>
              
              <button
                type="button"
                onClick={handleConfirmArrival}
                className="w-full py-3 rounded-xl font-black text-xs text-white border-0 cursor-pointer active:scale-95 transition-all shadow-md"
                style={{ background: BRAND.greenDark }}
              >
                🏁 وصلت بالسلامة / العودة للرئيسية
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setActiveDirectoryTrip(null);
                  toast('تم العودة للرئيسية 🏠', { icon: '🔙', duration: 2000 });
                }}
                className="w-full py-2 rounded-xl font-bold text-xs cursor-pointer active:scale-95 transition-all bg-white/10 text-white border border-white/20"
              >
                🏠 العودة للصفحة الرئيسية
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
/* ══════════════════════════════════════════════════════════════
   🚗 كارت الساحة مع حماية الأداء التامة
   ══════════════════════════════════════════════════════════════ */
const GarageCard = memo(function GarageCard({
  garage,
  onSelect,
  onReportPrice,
  hasActiveSession,
  hasIncomingCar,
  disabled
}: GarageCardProps) {
  const isDirectory = garage.garageType === 'directory';
  const isVip = garage.garageType === 'vip';
  const isBusy = hasActiveSession || hasIncomingCar;
  const isFull = !isDirectory && garage.availableSpots === 0;
  const btnBg = (() => {
    if (isDirectory) return BRAND.blueDark;
    if (isFull) return BRAND.borderDark;
    if (isBusy) return BRAND.greenDark;
    return BRAND.blue;
  })();
  const btnLabel = (() => {
    if (isDirectory) return 'افتح الاتجاهات 🗺️';
    if (isFull) return 'ممتلئ حالياً';
    if (hasActiveSession) return 'الجلسة النشطة ⚡';
    if (hasIncomingCar) return 'الحجز النشط 📍';
    return `احجز مكانك بـ ${BOOKING_FEE} ج.م 🛡️`;
  })();
  const displayPrice = (() => {
    if (garage.priceType === 'daily') return `${garage.dailyPrice || garage.basePrice || garage.pricePerHour || 15}`;
    if (garage.priceType === 'monthly') return `${garage.monthlyPrice || 1500}`;
    return `${garage.basePrice || garage.pricePerHour || 15}`;
  })();
  const priceUnit = (() => {
    if (garage.priceType === 'daily') return 'ج.م / يومي';
    if (garage.priceType === 'monthly') return 'ج.م / شهري';
    return 'ج.م / ساعة';
  })();
  const handleCardSelect = useCallback(() => {
    if (!disabled && !isFull) onSelect(garage);
  }, [disabled, isFull, onSelect, garage]);
  const handlePriceReportClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onReportPrice(garage);
  }, [onReportPrice, garage]);
  return (
    <div
      className="p-3 text-right relative bg-white rounded-2xl transition-all"
      style={{
        border: `1.5px solid ${isVip ? `${BRAND.blue}40` : BRAND.border}`,
        boxShadow: isVip ? '0 3px 12px rgba(22,86,184,0.06)' : '0 1px 3px rgba(0,0,0,0.02)'
      }}
    >
      <div className="flex justify-between items-center mb-1.5 flex-wrap gap-1" style={{ direction: 'rtl' }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          {isDirectory ? (
            <span className="text-[9px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-200">
              <span>🧭 دليل ساحات</span>
            </span>
          ) : (
            <>
              <span className="text-[9px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200">
                <ShieldCheck size={11} style={{ color: BRAND.greenDark }} />
                VIP مؤمن بالرادار
              </span>
              <span className="flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                <Star size={10} fill="currentColor" /> {garage.rating || 4.5}
              </span>
            </>
          )}
          {!isDirectory && garage.payment_mode === 'cash' && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-orange-50 text-orange-700 border border-orange-200">
              💵 نقدي
            </span>
          )}
          {!isDirectory && garage.payment_mode === 'wallet' && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
              👝 محفظة
            </span>
          )}
          {!isDirectory && garage.payment_mode === 'both' && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
              💵👝 كاش ومحفظة
            </span>
          )}
          {isDirectory && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
              💵 كاش للسايس
            </span>
          )}
        </div>
      </div>
      <div className="flex items-start justify-between gap-2 mb-1" style={{ direction: 'rtl' }}>
        <h4 className="text-[13px] font-black leading-tight text-slate-950 flex-1">{garage.name}</h4>
      </div>
      <div className="flex items-center gap-1 justify-end text-[10px] font-bold mb-2 text-slate-500" style={{ direction: 'rtl' }}>
        <span className="truncate max-w-[280px]">{garage.location}</span>
        <MapPin size={11} className="text-slate-400 shrink-0" />
      </div>
      <div className="flex items-center justify-between mt-1.5 pt-2 border-t" style={{ borderColor: BRAND.border }}>
        <div className="flex items-center gap-1.5 text-xs font-black text-slate-700">
          <Navigation size={12} className="rotate-45" style={{ color: BRAND.blue }} />
          <span>{formatDuration(garage.minutes)}</span>
        </div>
        <div className="flex items-center gap-3 text-right" style={{ direction: 'rtl' }}>
          {isDirectory && (
            <button
              type="button"
              onClick={handlePriceReportClick}
              className="flex items-center gap-1 text-[10px] font-bold border-0 bg-transparent cursor-pointer hover:underline p-0.5 rounded text-blue-700"
            >
              <Edit3 size={11} />
              <span>تعديل السعر</span>
            </button>
          )}
          {!isDirectory && (
            <div className="flex flex-col items-center">
              <span className="font-mono font-black text-sm leading-none text-blue-700">{garage.availableSpots}</span>
              <span className="text-[8px] font-bold text-slate-400 mt-0.5 uppercase">مكان شاغر</span>
            </div>
          )}
          <div className="flex flex-col items-center">
            <span className="font-mono font-black text-sm leading-none" style={{ color: BRAND.greenDark }}>{displayPrice}</span>
            <span className="text-[8px] font-bold text-slate-400 mt-0.5 uppercase">{priceUnit}</span>
          </div>
        </div>
      </div>
      <button
        type="button"
        disabled={isFull || disabled}
        onClick={handleCardSelect}
        className="w-full border-0 font-black py-2.5 rounded-xl mt-2.5 text-xs text-white cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-sm"
        style={{ background: btnBg }}
      >
        <span>{btnLabel}</span>
      </button>
    </div>
  );
});
