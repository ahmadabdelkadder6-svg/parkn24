// src/components/GarageListScreen.tsx

import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Star, Search, Navigation, Locate, Plus, Receipt, MessageCircle,
  X, ChevronDown, QrCode, Copy, Edit3, Check, Minus, Menu,
  Wallet, Zap
} from 'lucide-react';
import { useStore, Garage, ParkingSession as Session, IncomingCar, normalizePlate, normalizePhone, BOOKING_FEE, TOPUP_TIERS } from '../store';
import { calculateDistance, distanceToMinutes, classifyDistance, formatDuration } from '../utils/distance';
import TopUpWalletModal from './TopUpWalletModal';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { QRCodeCanvas } from 'qrcode.react';

const BRAND = {
  blue: '#1656b8', blueDark: '#0f3d85', green: '#8cc63f', greenDark: '#6ea62a',
  bg: '#f1f5f9', card: '#ffffff', slate: '#334155', border: '#cbd5e1', borderDark: '#94a3b8', navy: '#0a1628',
};

// 📍 مسافة التحديث الحقيقية لواجهة المستخدم
const MIN_UI_MOVE_METERS = 25;

interface GarageWithDistance extends Garage { distance: number; minutes: number; classification: 'nearby' | 'far'; }
interface GarageCardProps { garage: GarageWithDistance; index: number; onSelect: () => void; onReportPrice: (garage: GarageWithDistance) => void; isNearby: boolean; isClosest: boolean; hasActiveSession: boolean; hasIncomingCar: boolean; disabled: boolean; }

const safeParseTime = (value: unknown): number => {
  if (!value) return 0;
  if (typeof value === 'string') { const ms = new Date(value).getTime(); return Number.isFinite(ms) && ms > 0 ? ms : 0; }
  if (typeof value === 'number') { return value < 1_000_000_000_000 ? value * 1000 : value; }
  return 0;
};

const SITE_URL = import.meta.env.VITE_SITE_URL || 'https://parkn24.com';

/* ═══════════════════════════════════════════════════════════════════
   🗺️ المناطق الجغرافية الموحدة (مطابقة تماماً لشاشة الأدمن)
   ═══════════════════════════════════════════════════════════════════ */
const AREA_ICONS: Record<string, string> = {
  'وسط البلد': '🏢', 'الزمالك': '👑', 'مصر الجديدة': '🏰', 'مدينة نصر': '🏙️', 'المعادي': '🌳',
  'المهندسين': '🛍️', 'الدقي': '🎓', 'التجمع الخامس': '💎', 'صلاح سالم والعروبة': '🛣️',
  'ممشى أهل مصر': '🌊', 'جاردن سيتي والقصر العيني': '🏛️', 'بولاق': '🚢', 'العتبة والأسواق': '🛍️',
  'الحسين والأزهر': '🏮', 'شيراتون المطار': '✈️', 'الرحاب ومدينتي': '🏡', 'القرية الذكية': '💻',
  'الشيخ زايد': '🌲', '6 أكتوبر': '🎡', 'المقطم': '⛰️', 'المنيل': '🏝️', 'الجيزة': '🏛️',
  'حدائق الأهرام': '🚪', 'المريوطية والمنصورية': '🌴', 'الكيت كات': '🌊', 'إمبابة والوراق': '⛵',
  'أرض اللواء': '🚉', 'الوايلي والعباسية': '🏥', 'الزيتون والمطرية': '🌿', 'حدائق القبة': '🌳',
  'جسر السويس': '🛣️', 'شبرا ورمسيس': '🚆', 'شبرا الخيمة': '🏭', 'مصر القديمة': '🕌',
  'مدينة الشروق': '🎓', 'مدينة العبور': '🍇', 'العاشر من رمضان': '🏭', 'العاصمة الإدارية': '🏛️',
  'حلوان': '⚙️', 'الإسكندرية': '🏖️', 'الساحل الشمالي': '🏄', 'المنصورة والدلتا': '🌾',
  'طنطا': '🕌', 'مدن القناة': '🚢', 'العين السخنة': '🏖️', 'مناطق أخرى': '📍',
};

/* ─── مراكز المناطق الجغرافية للتحقق من دقة الإحداثيات ─── */
const AREA_CENTERS: Record<string, { lat: number; lng: number; maxRadiusKm: number }> = {
  'وسط البلد': { lat: 30.0444, lng: 31.2357, maxRadiusKm: 4.0 },
  'الزمالك': { lat: 30.0626, lng: 31.2197, maxRadiusKm: 3.0 },
  'مصر الجديدة': { lat: 30.0911, lng: 31.3236, maxRadiusKm: 8.0 },
  'مدينة نصر': { lat: 30.0561, lng: 31.3301, maxRadiusKm: 8.0 },
  'المعادي': { lat: 29.9602, lng: 31.2569, maxRadiusKm: 7.0 },
  'المهندسين': { lat: 30.0631, lng: 31.2000, maxRadiusKm: 4.0 },
  'الدقي': { lat: 30.0384, lng: 31.2126, maxRadiusKm: 3.5 },
  'التجمع الخامس': { lat: 30.0074, lng: 31.4913, maxRadiusKm: 15.0 },
  'صلاح سالم والعروبة': { lat: 30.0735, lng: 31.3015, maxRadiusKm: 8.0 },
  'ممشى أهل مصر': { lat: 30.0760, lng: 31.2250, maxRadiusKm: 5.0 },
  'جاردن سيتي والقصر العيني': { lat: 30.0355, lng: 31.2300, maxRadiusKm: 3.0 },
  'بولاق': { lat: 30.0620, lng: 31.2280, maxRadiusKm: 3.5 },
  'العتبة والأسواق': { lat: 30.0510, lng: 31.2470, maxRadiusKm: 2.5 },
  'الحسين والأزهر': { lat: 30.0477, lng: 31.2622, maxRadiusKm: 2.0 },
  'شيراتون المطار': { lat: 30.1115, lng: 31.3745, maxRadiusKm: 6.0 },
  'الرحاب ومدينتي': { lat: 30.0590, lng: 31.4910, maxRadiusKm: 10.0 },
  'القرية الذكية': { lat: 30.0714, lng: 30.9707, maxRadiusKm: 5.0 },
  'الشيخ زايد': { lat: 30.0680, lng: 30.9755, maxRadiusKm: 12.0 },
  '6 أكتوبر': { lat: 29.9723, lng: 30.9493, maxRadiusKm: 15.0 },
  'المقطم': { lat: 30.0070, lng: 31.3100, maxRadiusKm: 6.0 },
  'المنيل': { lat: 30.0260, lng: 31.2270, maxRadiusKm: 2.5 },
  'الجيزة': { lat: 30.0131, lng: 31.2089, maxRadiusKm: 7.0 },
  'حدائق الأهرام': { lat: 29.9870, lng: 31.1600, maxRadiusKm: 6.0 },
  'المريوطية والمنصورية': { lat: 29.9950, lng: 31.1500, maxRadiusKm: 8.0 },
  'الكيت كات': { lat: 30.0710, lng: 31.2130, maxRadiusKm: 3.0 },
  'إمبابة والوراق': { lat: 30.0860, lng: 31.2050, maxRadiusKm: 6.0 },
  'أرض اللواء': { lat: 30.0730, lng: 31.2050, maxRadiusKm: 3.5 },
  'الوايلي والعباسية': { lat: 30.0680, lng: 31.2820, maxRadiusKm: 4.0 },
  'الزيتون والمطرية': { lat: 30.1150, lng: 31.3100, maxRadiusKm: 5.0 },
  'حدائق القبة': { lat: 30.0870, lng: 31.2810, maxRadiusKm: 3.5 },
  'جسر السويس': { lat: 30.1050, lng: 31.3310, maxRadiusKm: 5.0 },
  'شبرا ورمسيس': { lat: 30.0760, lng: 31.2440, maxRadiusKm: 4.0 },
  'شبرا الخيمة': { lat: 30.1286, lng: 31.2426, maxRadiusKm: 6.0 },
  'مصر القديمة': { lat: 30.0070, lng: 31.2290, maxRadiusKm: 4.0 },
  'مدينة الشروق': { lat: 30.1480, lng: 31.6220, maxRadiusKm: 10.0 },
  'مدينة العبور': { lat: 30.2070, lng: 31.4810, maxRadiusKm: 8.0 },
  'العاشر من رمضان': { lat: 30.3080, lng: 31.7420, maxRadiusKm: 12.0 },
  'العاصمة الإدارية': { lat: 30.0160, lng: 31.7390, maxRadiusKm: 20.0 },
  'حلوان': { lat: 29.8550, lng: 31.3340, maxRadiusKm: 10.0 },
  'الإسكندرية': { lat: 31.2001, lng: 29.9187, maxRadiusKm: 30.0 },
  'الساحل الشمالي': { lat: 30.8700, lng: 28.9500, maxRadiusKm: 200.0 },
  'المنصورة والدلتا': { lat: 31.0409, lng: 31.3785, maxRadiusKm: 50.0 },
  'طنطا': { lat: 30.7865, lng: 31.0004, maxRadiusKm: 15.0 },
  'مدن القناة': { lat: 30.5852, lng: 32.2654, maxRadiusKm: 50.0 },
  'العين السخنة': { lat: 29.6050, lng: 32.3350, maxRadiusKm: 30.0 },
};

// 🔇 صوت صامت متكرر لإبقاء GPS يعمل على الشاشة السوداء (Keep Alive)
let silentAudioEl: HTMLAudioElement | null = null;

const enableBackgroundKeepAlive = async () => {
  try {
    if (!silentAudioEl) {
      silentAudioEl = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==');
      silentAudioEl.loop = true;
      silentAudioEl.volume = 0.001;
    }
    await silentAudioEl.play().catch(() => {});

    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission().catch(() => {});
    }

    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => silentAudioEl?.play().catch(() => {}));
      navigator.mediaSession.setActionHandler('pause', () => silentAudioEl?.play().catch(() => {}));
    }
  } catch (err) {
    console.warn("Background keep-alive error:", err);
  }
};

export default function GarageListScreen() {
  const {
    garages, setSelectedGarageId, setScreen, currentUser, sessions, incomingCars,
    offers, fetchAll, acknowledgedSessionIds, walletTopUps, reportPriceUpdate,
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
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>({ lat: 30.0444, lng: 31.2357 });
  const [locationLoading, setLocationLoading] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [expandedArea, setExpandedArea] = useState<string | null>(null);

  // 💰 مودال "رصيدك غير كافي"
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [pendingVipGarage, setPendingVipGarage] = useState<GarageWithDistance | null>(null);

  const [rescueIndex, setRescueIndex] = useState(0);
  const MAX_RESCUE_OPTIONS = 3;

  const autoNavigatedRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const speedHistoryRef = useRef<number[]>([]);
  const bearingHistoryRef = useRef<number[]>([]);
  const stopStartTimeRef = useRef<number | null>(null);
  const totalStopDurationRef = useRef<number>(0);

  const lastGpsTickRef = useRef<{ lat: number; lng: number; time: number } | null>(null);

  useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; }; }, []);

  const normalizedUserPlate = useMemo(() => normalizePlate(currentUser?.carPlate), [currentUser?.carPlate]);
  const cleanUserPhone = useMemo(() => currentUser?.phone ? normalizePhone(currentUser.phone) : '', [currentUser?.phone]);

  const activeSession = useMemo(() => {
    if (!normalizedUserPlate && !cleanUserPhone) return undefined;
    return sessions
      .filter((s: Session & { customerPhone?: string }) => {
        if (s.status !== 'active') return false;
        if (acknowledgedSessionIds?.has(s.id)) return false;
        const samePlate = normalizePlate(s.carPlate) === normalizedUserPlate;
        const sPhoneClean = s.customerPhone ? normalizePhone(s.customerPhone) : '';
        const samePhone = Boolean(cleanUserPhone && sPhoneClean === cleanUserPhone);
        return samePlate || samePhone;
      })
      .sort((a, b) => safeParseTime(b.startTime) - safeParseTime(a.startTime))[0];
  }, [sessions, normalizedUserPlate, cleanUserPhone, acknowledgedSessionIds]);

  const hasCompletedSession = useMemo(() => {
    if (activeSession) return false;
    return sessions.some((s: Session) => normalizePlate(s.carPlate) === normalizedUserPlate && s.status === 'completed');
  }, [sessions, normalizedUserPlate, activeSession]);

  const myIncomingCar = useMemo(() => {
    if (!normalizedUserPlate) return undefined;
    return incomingCars
      .filter((c: IncomingCar) => normalizePlate(c.carPlate) === normalizedUserPlate && c.status === 'coming')
      .sort((a, b) => safeParseTime(b.startTime || 0) - safeParseTime(a.startTime || 0))[0];
  }, [incomingCars, normalizedUserPlate]);

  const myTopUps = useMemo(() => {
    if (!cleanUserPhone || !walletTopUps) return [];
    return walletTopUps.filter((w) => w.userPhone === cleanUserPhone).sort((a, b) => b.timestamp - a.timestamp).slice(0, 3);
  }, [walletTopUps, cleanUserPhone]);

  const pendingTopUpsCount = useMemo(() => myTopUps.filter((w) => w.status === 'pending').length, [myTopUps]);

  const getUserLocation = useCallback(() => {
    if (!('geolocation' in navigator)) { toast.error('خدمة تحديد الموقع غير مدعومة في متصفحك'); return; }
    if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); }
    setLocationLoading(true);

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
        if (rawHeading !== null) { bearingHistoryRef.current.push(rawHeading); if (bearingHistoryRef.current.length > 5) bearingHistoryRef.current.shift(); }

        if (speedKmh < 1.0) {
          if (stopStartTimeRef.current === null) { stopStartTimeRef.current = Date.now(); }
          else { totalStopDurationRef.current = Math.round((Date.now() - stopStartTimeRef.current) / 1000); }
        } else { stopStartTimeRef.current = null; }

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
          lastLocationRef.current = { lat: newLat, lng: newLng };
          setUserLocation({ lat: newLat, lng: newLng });
        }

        setLocationLoading(false);
      },
      () => { if (!isMountedRef.current) return; setLocationLoading(false); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  const handleForceRefreshLocation = useCallback(async () => {
    try {
      await enableBackgroundKeepAlive();
    } catch (e) {
      console.warn("Background init error:", e);
    }

    lastLocationRef.current = null;
    getUserLocation();

    toast.success('🚀 تم تحديث الموقع', { duration: 2500, icon: '📍' });
  }, [getUserLocation]);

  useEffect(() => { getUserLocation(); return () => { if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); } }; }, [getUserLocation]);

  useEffect(() => {
    if (!normalizedUserPlate && !cleanUserPhone) return;
    let isSubscribed = true;
    const refetch = async () => { if (!isSubscribed) return; try { await fetchAll(); } catch (e) { console.error('Realtime Fetch Error:', e); } };
    const isMyRow = (row: any): boolean => { if (!row) return false; const plate = normalizePlate(row.car_plate || row.carPlate); const phone = (row.customer_phone || row.customerPhone || row.phone || row.userPhone || '').replace(/[^\d+]/g, ''); return plate === normalizedUserPlate || Boolean(cleanUserPhone && phone === cleanUserPhone); };
    const channel = supabase.channel(`customer-realtime-wallet-${cleanUserPhone}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, (payload) => { if (isMyRow(payload.new) || isMyRow(payload.old)) refetch(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_topups' }, (payload) => { if (isMyRow(payload.new) || isMyRow(payload.old)) { refetch(); if (payload.event === 'UPDATE' && payload.new.status === 'approved') { toast.success(`🎁 تم اعتماد شحن رصيد بمبلغ ${payload.new.amount} ج.م بنجاح!`, { icon: '💳' }); } } })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, (payload) => { if (cleanUserPhone && payload.new.phone && normalizePhone(payload.new.phone) === cleanUserPhone) { refetch(); } })
      .subscribe();
    const interval = setInterval(refetch, 12000);
    const handleVisibility = () => { if (document.visibilityState === 'visible') refetch(); };
    const handleFocus = () => refetch();
    document.addEventListener('visibilitychange', handleVisibility); window.addEventListener('focus', handleFocus);
    return () => { isSubscribed = false; clearInterval(interval); document.removeEventListener('visibilitychange', handleVisibility); window.removeEventListener('focus', handleFocus); supabase.removeChannel(channel); };
  }, [normalizedUserPlate, cleanUserPhone, fetchAll]);

  useEffect(() => {
    if (!activeSession) { autoNavigatedRef.current = null; return; }
    if (autoNavigatedRef.current === activeSession.id) return;
    autoNavigatedRef.current = activeSession.id; setSelectedGarageId(activeSession.garageId); setScreen('session');
    toast.success('بدأت جلسة الركن! ⏱️', { icon: '🚗', duration: 3000 });
  }, [activeSession, setSelectedGarageId, setScreen]);

  const garagesWithDistance: GarageWithDistance[] = useMemo(() => {
    return garages.filter((g) => g.isActive !== false).map((garage) => {
      const distance = calculateDistance(userLocation.lat, userLocation.lng, garage.lat, garage.lng);
      const minutes = distanceToMinutes(distance);
      return { ...garage, distance, minutes, classification: classifyDistance(minutes) };
    }).sort((a, b) => a.minutes - b.minutes);
  }, [garages, userLocation]);

  const rescueGaragesList = useMemo(() => {
    if (!userLocation.lat) return [];
    const vipNearby = garagesWithDistance.filter((g) => g.garageType === 'vip' && g.availableSpots > 0 && g.minutes <= 5 && g.isActive !== false);
    const directoryNearby = garagesWithDistance.filter((g) => g.garageType === 'directory' && g.minutes <= 5 && g.isActive !== false);
    return [...vipNearby, ...directoryNearby].slice(0, MAX_RESCUE_OPTIONS);
  }, [garagesWithDistance, userLocation.lat]);

  const currentRescueGarage = rescueGaragesList[rescueIndex] || null;

  useEffect(() => { setRescueIndex(0); }, [rescueGaragesList.length]);

  const handleNextRescue = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (rescueGaragesList.length <= 1) return;
    const nextIndex = (rescueIndex + 1) % rescueGaragesList.length;
    setRescueIndex(nextIndex);
    if (nextIndex === 0) { toast('🔄 تم عرض كل الخيارات القريبة، نبدأ من الأول!', { icon: '🔁', duration: 2000 }); }
    else { toast.success(`جاري عرض الخيار ${nextIndex + 1} من ${rescueGaragesList.length}... 🔍`, { duration: 1500 }); }
  }, [rescueIndex, rescueGaragesList.length]);

  const filteredGarages = useMemo(() => {
    let filtered = garagesWithDistance;
    filtered = filtered.filter((g) => g.garageType === activeTab);
    if (searchQuery.trim()) { const q = searchQuery.trim().toLowerCase(); filtered = filtered.filter((g) => g.name.toLowerCase().includes(q) || g.location.toLowerCase().includes(q) || (g.area || '').toLowerCase().includes(q)); }
    if (showNearbyOnly) { filtered = filtered.filter((g) => g.classification === 'nearby'); }
    return filtered;
  }, [garagesWithDistance, searchQuery, showNearbyOnly, activeTab]);

  /* ─── 🗺️ تجميع الجراجات حسب المنطقة الموحدة ─── */
  const areaGroups = useMemo(() => {
    const groups: Record<string, GarageWithDistance[]> = {};
    filteredGarages.forEach(g => {
      const zone = (g as any).area || 'مناطق أخرى';
      if (!groups[zone]) groups[zone] = [];
      groups[zone].push(g);
    });
    return Object.keys(groups)
      .map(name => ({
        name,
        garages: groups[name],
        totalCapacity: groups[name].reduce((sum, g) => sum + (g.capacity || 0), 0)
      }))
      .sort((a, b) => {
        if (a.name === 'مناطق أخرى') return 1;
        if (b.name === 'مناطق أخرى') return -1;
        const minA = Math.min(...a.garages.map(g => g.minutes));
        const minB = Math.min(...b.garages.map(g => g.minutes));
        return minA - minB;
      });
  }, [filteredGarages]);

  useEffect(() => { if (searchQuery.trim() && areaGroups.length > 0) setExpandedArea(areaGroups[0].name); }, [searchQuery, areaGroups]);

  // 💰 عملية الحجز والخصم الفوري لـ VIP
  const handleGarageClick = async (garage: GarageWithDistance) => {
    if (garage.garageType === 'directory') {
      const areaCenter = AREA_CENTERS[garage.area || ''];
      let isLocationBroken = false;
      if (areaCenter) {
        const distanceFromCenterKm = calculateDistance(garage.lat, garage.lng, areaCenter.lat, areaCenter.lng);
        if (distanceFromCenterKm > areaCenter.maxRadiusKm) {
          isLocationBroken = true;
          supabase.from('garage_arrival_telemetry').insert({ garage_id: garage.id, user_phone: cleanUserPhone || '00000000000', lat: garage.lat, lng: garage.lng, accuracy: 999 }).then(() => {}).catch(() => {});
        }
      }
      const isFamousLandmark = /مول|mall|فندق|hotel|مستشفى|hospital|جامعة|university|نادي|club|مرور|traffic|كارفور|سيتي سنتر|تريومف|بلاتفورم|وتر واي|waterway|أركان|arkan|سكوير|plaza/gi.test(garage.name);
      let url = '';
      if (isLocationBroken || isFamousLandmark) {
        const cleanLandmark = garage.name.replace(/ساحة انتظار|جراج|ساحة ركني -|ساحة/gi, '').trim();
        const destinationQuery = encodeURIComponent(`${cleanLandmark} ${garage.location || garage.area}`);
        url = `https://www.google.com/maps/dir/?api=1&destination=${destinationQuery}&travelmode=driving`;
      } else {
        url = `https://www.google.com/maps/dir/?api=1&destination=${garage.lat},${garage.lng}&travelmode=driving&dir_action=navigate`;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
      setActiveDirectoryTrip(garage);
      toast.success(`رحلة سعيدة! جاري توجيهك إلى ${garage.name} 🧭`, { icon: '🚙' });
      return;
    }

    // 🌟 جراج VIP
    if (!currentUser) { toast.error('سجل بياناتك أولاً'); return; }
    if (activeSession) { setSelectedGarageId(activeSession.garageId); setScreen('session'); return; }
    if (myIncomingCar) { setSelectedGarageId(myIncomingCar.garageId); setScreen('navigation'); return; }
    if (offers.some((o) => o.userId === currentUser.phone && o.status === 'pending')) { toast.error('لديك عرض معلق بالفعل'); return; }
    if (garage.availableSpots <= 0) { toast.error('لا توجد أماكن متاحة حالياً'); return; }

    const { hasPaidBookingFee } = useStore.getState();
    const userWallet = currentUser.wallet || 0;

    // فحص الحد الأقصى اليومي
    const todayCount = getDailyDeductionCount();
    const isFreeToday = todayCount >= 2;

    // 💡 حالة 1: العميل سبق له الخصم في نفس محاولة البحث (لأنه لم يجد مكان في الجراج السابق)
    if (hasPaidBookingFee) {
      setIsBooking(true);
      try {
        await addIncomingCar({
          garageId: garage.id,
          carPlate: currentUser.carPlate,
          customerName: currentUser.name,
          customerPhone: currentUser.phone,
          agreedPrice: garage.basePrice,
          estimatedArrival: Math.max(3, garage.minutes)
        });

        setSelectedGarageId(garage.id);
        toast.success(`تم تحويل حجزك للجراج الجديد مجاناً (الرسوم مدفوعة) 🚗`, { duration: 4000 });
        setScreen('navigation');
      } catch (e) {
        console.error(e);
        toast.error('حدث خطأ أثناء تحويل الحجز');
      } finally {
        setIsBooking(false);
      }
      return;
    }

    // 💡 حالة 2: حجز جديد لأول مرة (ولم يستوفِ الحد الأقصى) -> فحص الرصيد
    const MIN_REQUIRED_BALANCE = isFreeToday ? 7 : 10;
    if (userWallet < MIN_REQUIRED_BALANCE) {
      setPendingVipGarage(garage);
      setShowInsufficientModal(true);
      return;
    }

    setIsBooking(true);
    try {
      // chargeBookingFee يتعامل تلقائياً مع نظام الحد الأقصى ويجعله مجانياً إذا لزم الأمر
      const success = await chargeBookingFee();
      if (success) {
        await addIncomingCar({
          garageId: garage.id,
          carPlate: currentUser.carPlate,
          customerName: currentUser.name,
          customerPhone: currentUser.phone,
          agreedPrice: garage.basePrice,
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
      setIsBooking(false);
    }
  };

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
          if (bearingHistoryRef.current.length >= 2) { maxBearingChange = Math.abs(bearingHistoryRef.current[bearingHistoryRef.current.length - 1] - bearingHistoryRef.current[0]); }
          const avgSpeed = speedHistoryRef.current.reduce((a, b) => a + b, 0) / (speedHistoryRef.current.length || 1);
          await supabase.rpc('record_arrival_telemetry', { p_garage_id: tripToCalibrate.id, p_user_lat: latitude, p_user_lng: longitude, p_accuracy: accuracy || 10, p_user_phone: cleanUserPhone || null, p_speed: avgSpeed, p_bearing_change: maxBearingChange, p_stop_duration: totalStopDurationRef.current || 0 });
          speedHistoryRef.current = []; bearingHistoryRef.current = []; totalStopDurationRef.current = 0;
        } catch (e) { /* صامت */ }
      }, () => {}, { enableHighAccuracy: true, timeout: 6000 });
    }
  }, [activeDirectoryTrip, cleanUserPhone]);

  const handleOpenPriceReport = (g: GarageWithDistance) => { setReportingGarage(g); setUpdatedPriceInput(g.priceType === 'daily' ? (g.dailyPrice || g.basePrice) : g.basePrice || 20); };

  const handleSubmitPriceUpdate = async () => {
    const finalPrice = updatedPriceInput === '' ? (reportingGarage?.basePrice || 20) : updatedPriceInput;
    if (!reportingGarage || finalPrice <= 0) return;
    setIsSubmittingPrice(true);
    try {
      const result = await reportPriceUpdate(reportingGarage.id, finalPrice, reportingGarage.priceType) as any;
      if (result?.status === 'approved') { toast.success(`رائع! تم تحديث السعر رسمياً إلى ${finalPrice} ج.م بعد تأكيد 3 مستخدمين! 🎉`, { duration: 5000, icon: '🔥' }); }
      else if (result?.status === 'voted') { toast.success(`تم تسجيل تأكيدك! السعر مؤكد الآن من ${result.votes} مستخدمين. متبقي ${result.required - result.votes} تأكيد ⏳`, { duration: 5000, icon: '👍' }); }
      else if (result?.status === 'started') { toast.success(`شكراً لمساعدتك! تم تسجيل بلاغك.. بانتظار تأكيد مستخدمين آخرين لتعديل السعر رسمياً.`, { duration: 5000, icon: '🤝' }); }
      else { toast.success('شكراً لمساعدتك! تم تسجيل بلاغك 🤝', { icon: '✅' }); }
      setReportingGarage(null);
    } catch (error: any) { toast.error(error?.message || 'تعذر تحديث السعر، يرجى المحاولة لاحقاً'); } finally { setIsSubmittingPrice(false); }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden relative" style={{ background: BRAND.bg, color: BRAND.blueDark }}>

      <div className="px-4 pt-10 pb-3 z-20 shadow-sm relative" style={{ background: BRAND.card, borderBottom: `1.5px solid ${BRAND.border}` }}>
        <div dir="rtl" className="flex justify-between items-center mb-4">
          <div className="text-right flex items-center gap-3">
            {/* 🌟 اللوجو الخاص بالتطبيق */}
            <img
              src="/icons/logo.png"
              alt="Park'n 24"
              className="h-12 w-auto object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                const fallback = document.getElementById('logo-fallback');
                if (fallback) fallback.style.display = 'flex';
              }}
            />
            <div id="logo-fallback" style={{ display: 'none' }} className="flex items-center">
              <span className="font-black text-xl leading-none" style={{ color: BRAND.blue }}>
                P<span style={{ color: BRAND.green }}>24</span>
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-base font-black text-slate-900 leading-tight">أهلاً {currentUser?.name?.split(' ')[0] || 'بك'} 👋</span>
              {/* 🚀 جملة تحفيزية بخط أكبر وأوضح */}
              <span className="text-[13px] font-black leading-tight mt-1" style={{ color: BRAND.blue }}>
              اركن بسرعة… وريّح بالك! parkn24.com🚗✨
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 📱 زر الباركود */}
            <button type="button" onClick={() => setShowQrModal(true)} className="w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer active:scale-90 transition-all bg-white border-2 shadow-sm" style={{ borderColor: BRAND.blue + '40' }}>
              <QrCode size={24} strokeWidth={2.5} style={{ color: BRAND.blue }} />
            </button>
            <button type="button" onClick={() => setShowSmartMenu(true)} className="w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer active:scale-90 transition-all relative bg-slate-100 border-[1.5px]" style={{ borderColor: BRAND.border }}>
              <Menu size={20} style={{ color: BRAND.blueDark }} />
              {pendingTopUpsCount > 0 && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 border-2 border-white" />}
            </button>
          </div>
        </div>

        {/* 💳 بانر الرصيد — مكبر مع خط أوضح وأثقل */}
        <div
          className="flex items-center justify-between rounded-2xl px-4 py-3.5 mb-3"
          style={{
            background: `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueDark} 100%)`,
            boxShadow: '0 6px 18px rgba(22,86,184,0.28)',
            direction: 'rtl'
          }}
        >
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowTopUp(true)}
              className="flex items-center gap-1.5 font-black active:scale-95 transition-all text-[13px] cursor-pointer border-0 shadow-md"
              style={{ background: '#ffffff', color: BRAND.blue, borderRadius: 10, padding: '8px 14px' }}
            >
              <Plus size={14} strokeWidth={3.5} />
              <span>شحن</span>
            </button>
            <span className="font-mono font-black text-[13px] bg-white text-[#1656b8] px-3 py-1.5 rounded-xl tracking-wider shadow-sm">
              🚙 {currentUser?.carPlate || '---'}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[11px] font-black text-white/85 block leading-none mb-1.5">💳 رصيدك الحالي</span>
            <span className="font-black font-mono text-white leading-none" style={{ fontSize: '22px', letterSpacing: '-0.5px' }}>
              {currentUser?.wallet || 0}
              <span className="text-[13px] font-black mr-1">ج.م</span>
            </span>
          </div>
        </div>

        {/* 🌟 بانر "المنقذ السريع" — مُصغَّر مع إبقاء الخط كبير وواضح */}
        {currentRescueGarage && !activeSession && !myIncomingCar && (
          <div
            className="mb-3 rounded-xl overflow-hidden border-2"
            style={{
              background: currentRescueGarage.garageType === 'vip'
                ? 'linear-gradient(135deg, #1656b8 0%, #0f3d85 100%)'
                : 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              borderColor: currentRescueGarage.garageType === 'vip' ? '#1656b8' : '#334155',
              boxShadow: '0 3px 12px rgba(0,0,0,0.12)',
            }}
            dir="rtl"
          >
<div className="px-3 pt-2 pb-1 flex items-center justify-between">
  <div className="flex items-center gap-1.5">
    <span className="text-[13px] font-black text-white leading-tight">
      ⚡ أقرب وأسرع {rescueGaragesList.length} ركنات حواليك
    </span>
  </div>
  <span
    className="font-black text-[11px] px-2 py-0.5 rounded-lg text-white"
    style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)' }}
  >
    {rescueIndex + 1} / {rescueGaragesList.length}
  </span>
</div>

            <div
              className="px-3 pb-2 pt-0.5 cursor-pointer active:opacity-90 transition-all"
              onClick={() => handleGarageClick(currentRescueGarage)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 text-right">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className="text-[10px] font-black px-2 py-0.5 rounded-md text-white"
                      style={{ background: currentRescueGarage.garageType === 'vip' ? '#8cc63f' : '#475569' }}
                    >
                      {currentRescueGarage.garageType === 'vip' ? '⭐ VIP مضمون' : '🧭 دليل مجاني'}
                    </span>
                  </div>
                  <h4 className="text-[14px] font-black text-white leading-tight mb-1">{currentRescueGarage.name}</h4>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[13px] font-black text-emerald-300">
                      💰 {currentRescueGarage.priceType === 'daily'
                        ? `${currentRescueGarage.dailyPrice || currentRescueGarage.basePrice} ج/يوم`
                        : `${currentRescueGarage.basePrice} ج/ساعة`}
                    </span>
                    <span className="text-[12px] font-bold text-white/85">🚗 {formatDuration(currentRescueGarage.minutes)}</span>
                  </div>
                </div>
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: BRAND.green, border: `1.5px solid ${BRAND.greenDark}`, boxShadow: '0 2px 8px rgba(140,198,63,0.3)' }}
                >
                  <Navigation size={16} className="rotate-45 text-white" />
                </div>
              </div>
            </div>
          </div>
        )}

        {rescueGaragesList.length > 1 && !activeSession && !myIncomingCar && (
          <button
            type="button"
            onClick={handleNextRescue}
            className="w-full mb-3 py-3 rounded-xl text-[14px] font-black border-0 cursor-pointer active:scale-[0.97] transition-all flex items-center justify-center gap-2 shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${BRAND.green} 0%, ${BRAND.greenDark} 100%)`,
              color: '#ffffff',
              boxShadow: '0 4px 14px rgba(140,198,63,0.35)',
            }}
          >
            <Search size={16} strokeWidth={3} />
            <span>🔍 اضغط لاختيار أنسب ركنة ليك</span>
          </button>
        )}
        {activeSession && (
          <button type="button" onClick={() => { setSelectedGarageId(activeSession.garageId); setScreen('session'); }} className="w-full mb-2.5 flex items-center justify-between px-3 py-2.5 rounded-xl border-0 text-white cursor-pointer active:scale-98 transition-all" style={{ background: BRAND.greenDark }}>
            <span className="text-[10px] font-black">عرض التفاصيل ←</span><span className="text-[11px] font-black flex items-center gap-1">🚙 لديك جلسة ركن نشطة الآن</span>
          </button>
        )}

        {!activeSession && myIncomingCar && (
          <button type="button" onClick={() => { setSelectedGarageId(myIncomingCar.garageId); setScreen('navigation'); }} className="w-full mb-2.5 flex items-center justify-between px-3 py-2.5 rounded-xl border-0 text-white cursor-pointer active:scale-98 transition-all" style={{ background: BRAND.blue }}>
            <span className="text-[10px] font-black">فتح الخريطة ←</span><span className="text-[11px] font-black flex items-center gap-1">📍 حجز نشط (في الطريق)</span>
          </button>
        )}

        {/* 🔍 شريط البحث */}
        <div className="flex gap-2 mb-2.5">
          <div className="relative flex-1">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: BRAND.blue }} />
            <input
              type="text"
              className="w-full outline-none text-xs font-black rounded-xl transition-all focus:shadow-md"
              style={{
                padding: '11px 36px 11px 36px',
                background: '#f0f5ff',
                border: `2px solid ${BRAND.blue}30`,
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
                  className="rounded-full w-6 h-6 flex items-center justify-center cursor-pointer border-0 active:scale-90 transition-all"
                  style={{ background: BRAND.blue, color: '#ffffff' }}
                >
                  <X size={13} strokeWidth={3} />
                </button>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={handleForceRefreshLocation}
            disabled={locationLoading}
            className="flex items-center justify-center border-0 cursor-pointer shrink-0 active:scale-90 transition-all"
            style={{ background: BRAND.blue, color: '#fff', borderRadius: 12, width: 40, height: 40, boxShadow: '0 2px 8px rgba(22,86,184,0.25)' }}
            title="تحديث الموقع"
          >
            <Locate size={16} className={locationLoading ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={() => setShowNearbyOnly(!showNearbyOnly)} className="text-[10px] font-black px-3 rounded-xl cursor-pointer shrink-0 active:scale-95 transition-all" style={{ background: showNearbyOnly ? BRAND.blue : BRAND.card, color: showNearbyOnly ? '#fff' : BRAND.slate, border: `2px solid ${showNearbyOnly ? BRAND.blue : BRAND.border}` }}>{showNearbyOnly ? '🌍 الكل' : '📍 القريب'}</button>
        </div>

        {/* ✅ تبويبات VIP / دليل مجاني */}
        <div className="flex p-1 rounded-xl bg-slate-200/70" style={{ direction: 'rtl', border: '1.5px solid #cbd5e1' }}>
          <button type="button" onClick={() => { setActiveTab('vip'); setExpandedArea(null); }} className="flex-1 py-2 rounded-lg font-black text-[11px] cursor-pointer border-0 transition-all flex items-center justify-center gap-1 relative" style={{ background: activeTab === 'vip' ? BRAND.blue : 'transparent', color: activeTab === 'vip' ? '#ffffff' : BRAND.slate, boxShadow: activeTab === 'vip' ? '0 2px 8px rgba(22,86,184,0.25)' : 'none' }}>
            <span>⭐ احجز ركنتك بـ {BOOKING_FEE} ج</span>
            {activeTab === 'vip' && (
              <span className="absolute -top-1 -left-1 w-2 h-2 rounded-full animate-pulse" style={{ background: BRAND.green }} />
            )}
          </button>
          <button type="button" onClick={() => { setActiveTab('directory'); setExpandedArea(null); }} className="flex-1 py-2 rounded-lg font-black text-[11px] cursor-pointer border-0 transition-all flex items-center justify-center gap-1" style={{ background: activeTab === 'directory' ? BRAND.blueDark : 'transparent', color: activeTab === 'directory' ? '#ffffff' : BRAND.slate, boxShadow: activeTab === 'directory' ? '0 2px 8px rgba(15,61,133,0.25)' : 'none' }}><span>🧭 دليل الساحات المجاني</span></button>
        </div>

      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-8">

        {areaGroups.length > 0 ? (
          <div className="space-y-2.5">
            {areaGroups.map((group) => {
              const isExpanded = expandedArea === group.name;
              const totalGarages = group.garages.length;
              return (
                <div key={group.name} style={{ background: BRAND.card, borderRadius: 14, border: `1.5px solid ${BRAND.border}`, overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
                  <button type="button" onClick={() => setExpandedArea(isExpanded ? null : group.name)} className="w-full p-3.5 flex items-center justify-between text-right bg-transparent border-none cursor-pointer outline-none">
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-black font-mono px-2 py-1 rounded bg-slate-100" style={{ color: BRAND.slate }}>{totalGarages} {activeTab === 'vip' ? 'معتمد' : 'ساحات'}</span>
                      <ChevronDown size={16} style={{ color: BRAND.slate, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    </div>
                    <div className="text-right">
                      <span className="font-black text-sm block" style={{ color: BRAND.blueDark }}>{AREA_ICONS[group.name] || '📍'} {group.name}</span>
                      <span className="text-[10px] font-bold block mt-0.5" style={{ color: BRAND.slate }}>{activeTab === 'vip' ? `🚗 جراجات معتمدة — الحجز بـ ${BOOKING_FEE} ج.م بس` : '🧭 دليل ساحات الركن بالمنطقة'}</span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div style={{ background: BRAND.bg, padding: '10px', borderTop: `1px solid ${BRAND.border}` }} className="space-y-2">
                      {(() => {
                        const limit = visibleLimits[group.name] || 8;
                        const displayedGarages = group.garages.slice(0, limit);
                        const hasMore = group.garages.length > limit;
                        return (<>
                          {displayedGarages.map((garage, i) => (
                            <GarageCard
                              key={garage.id}
                              garage={garage} index={i} onSelect={() => handleGarageClick(garage)} onReportPrice={handleOpenPriceReport} isNearby={garage.classification === 'nearby'} isClosest={i === 0 && garage.classification === 'nearby'} hasActiveSession={Boolean(activeSession)} hasIncomingCar={Boolean(myIncomingCar)} disabled={isBooking}
                            />
                          ))}
                          {hasMore && (<button type="button" onClick={() => { setVisibleLimits(prev => ({ ...prev, [group.name]: limit + 10 })); toast.success('تم تحميل ساحات إضافية 📍', { id: 'lazy-load-toast' }); }} className="w-full py-2.5 rounded-xl font-black text-[11px] cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-1 bg-white mt-2" style={{ color: BRAND.blue, border: `1.5px solid ${BRAND.border}` }}><span>عرض المزيد (+{group.garages.length - limit}) 🔽</span></button>)}
                        </>);
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 text-slate-400"><span className="text-3xl block mb-2">🚗🔍</span><p className="text-xs font-bold leading-relaxed max-w-[240px] mx-auto">لا توجد ساحات في الدليل، جرب البحث باسم منطقة أخرى!</p></div>
        )}
      </div>

{/* ═══════════════════════════════════════════════════
           💰 مودال "رصيدك غير كافي"
         ═══════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showInsufficientModal && pendingVipGarage && (
          <div className="fixed inset-0 z-[1600] flex items-center justify-center p-5" style={{ background: 'rgba(10,22,40,0.8)', backdropFilter: 'blur(8px)' }} onClick={() => { setShowInsufficientModal(false); setPendingVipGarage(null); }}>
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="rounded-3xl p-6 text-center max-w-sm w-full shadow-2xl relative"
              style={{ background: BRAND.card }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: '#fef3c7' }}>
                <Wallet size={28} className="text-amber-600" />
              </div>

              <h3 className="text-base font-black mb-1" style={{ color: BRAND.blueDark }}>رصيدك غير كافي 💳</h3>
              <p className="text-xs font-bold mb-4 leading-relaxed" style={{ color: BRAND.slate }}>
                محتاج <b style={{ color: BRAND.blue }}>10 ج.م</b> على الأقل عشان تحجز وتفعّل درع الحماية في <b style={{ color: BRAND.navy }}>{pendingVipGarage.name}</b>
              </p>

              <div className="rounded-xl p-3 mb-4 text-right" style={{ background: '#f8fafc', border: `1.5px solid ${BRAND.border}` }}>
                <div className="flex justify-between items-center mb-2 pb-2" style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                  <span className="font-mono font-black text-red-500 text-sm">{currentUser?.wallet || 0} ج.م</span>
                  <span className="text-[11px] font-black" style={{ color: BRAND.slate }}>💰 رصيدك الحالي</span>
                </div>
                <div className="flex justify-between items-center mb-2 pb-2" style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                  <span className="font-mono font-black text-sm" style={{ color: BRAND.blue }}>{BOOKING_FEE} ج.م</span>
                  <span className="text-[11px] font-black" style={{ color: BRAND.slate }}>🅿️ رسوم الحجز</span>
                </div>
                <div className="flex justify-between items-center mb-2 pb-2" style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                  <span className="font-mono font-black text-sm" style={{ color: '#8b5cf6' }}>7 ج.م</span>
                  <span className="text-[11px] font-black" style={{ color: BRAND.slate }}>🛡️ درع الحماية</span>
                </div>
                <div className="flex justify-between items-center mb-2 pb-2" style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                  <span className="font-mono font-black text-sm" style={{ color: BRAND.green }}>10 ج.م</span>
                  <span className="text-[11px] font-black" style={{ color: BRAND.slate }}>📋 الإجمالي المطلوب</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-mono font-black text-amber-600 text-sm">{Math.max(0, 10 - (currentUser?.wallet || 0))} ج.م</span>
                  <span className="text-[11px] font-black" style={{ color: BRAND.slate }}>📊 محتاج تشحن</span>
                </div>
              </div>

              <p className="text-[11px] font-black mb-3 text-right" style={{ color: BRAND.blueDark }}>⚡ اشحن دلوقتي واحجز ركنتك مع حماية كاملة:</p>

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
                      background: tier.popular ? 'linear-gradient(135deg, #1656b8 0%, #0f3d85 100%)' : BRAND.card,
                      color: tier.popular ? '#ffffff' : BRAND.blueDark,
                      border: tier.popular ? '2px solid #1656b8' : `1.5px solid ${BRAND.border}`,
                      boxShadow: tier.popular ? '0 4px 15px rgba(22,86,184,0.25)' : '0 1px 4px rgba(0,0,0,0.04)',
                    }}
                  >
                    {tier.popular && (
                      <span className="absolute top-1 left-1 text-[7px] font-black px-1.5 py-0.5 rounded-lg" style={{ background: BRAND.green, color: '#ffffff' }}>الأكثر شعبية ⭐</span>
                    )}
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-black text-lg font-mono">{tier.amount} ج</span>
                      <span className="text-[9px] font-black" style={{ color: tier.popular ? '#bbf7d0' : BRAND.greenDark }}>+ {tier.bonus} ج بونص 🎁</span>
                      <span className="text-[8px] font-bold" style={{ color: tier.popular ? 'rgba(255,255,255,0.7)' : BRAND.slate }}>≈ {tier.bookings} حجز</span>
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
                className="w-full py-3.5 rounded-xl font-black text-sm text-white border-0 cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg mb-2"
                style={{ background: BRAND.blue, boxShadow: '0 6px 20px rgba(22,86,184,0.35)' }}
              >
                <Wallet size={16} />
                <span>شحن المحفظة 💰</span>
              </button>

              <button
                type="button"
                onClick={() => { setShowInsufficientModal(false); setPendingVipGarage(null); }}
                className="w-full py-2.5 rounded-xl font-bold text-xs cursor-pointer active:scale-95 transition-all"
                style={{ background: 'transparent', color: BRAND.slate, border: `1.5px solid ${BRAND.border}` }}
              >
                إلغاء
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence> 
     {/* ═══ القائمة الذكية الجانبية ═══ */}
      <AnimatePresence>
        {showSmartMenu && (
          <div className="fixed inset-0 z-[1500] flex items-end" style={{ background: 'rgba(10,22,40,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => setShowSmartMenu(false)}>
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 300 }} className="w-full max-w-md mx-auto bg-white rounded-t-[28px] p-5 pb-8" onClick={(e) => e.stopPropagation()}>
              <div className="w-10 h-1.5 rounded-full bg-slate-200 mx-auto mb-5" />
              <div className="flex justify-between items-center mb-4 pb-3 border-b-[1.5px]" style={{ borderColor: BRAND.border }}>
                <button type="button" onClick={() => setShowSmartMenu(false)} className="text-slate-400 font-black text-base border-0 bg-transparent cursor-pointer">✕</button>
                <h3 className="font-extrabold text-base" style={{ color: BRAND.blueDark }}>⚙️ القائمة والخدمات</h3>
              </div>
              <div className="space-y-3">
                <button type="button" onClick={() => { setShowSmartMenu(false); setShowTopUp(true); }} className="w-full flex items-center justify-between p-4 rounded-2xl cursor-pointer active:scale-[0.98] transition-all bg-white border-2" style={{ borderColor: BRAND.border }}><ChevronDown size={20} className="rotate-90 text-slate-400" /><div className="flex items-center gap-3"><div className="text-right"><span className="text-sm font-extrabold block mb-0.5" style={{ color: BRAND.blueDark }}>شحن رصيد المحفظة</span><span className="text-[11px] font-bold text-slate-500">اشحن بـ إنستاباي أو فودافون كاش</span></div><div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center"><Wallet size={20} style={{ color: BRAND.blue }} /></div></div></button>
                {hasCompletedSession && (<button type="button" onClick={() => { setShowSmartMenu(false); setScreen('lastSession'); }} className="w-full flex items-center justify-between p-4 rounded-2xl cursor-pointer active:scale-[0.98] transition-all bg-white border-2" style={{ borderColor: BRAND.border }}><ChevronDown size={20} className="rotate-90 text-slate-400" /><div className="flex items-center gap-3"><div className="text-right"><span className="text-sm font-extrabold block mb-0.5" style={{ color: BRAND.blueDark }}>إيصال آخر ركنة</span><span className="text-[11px] font-bold text-slate-500">عرض تفاصيل وحساب آخر جلسة</span></div><div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center"><Receipt size={20} style={{ color: BRAND.greenDark }} /></div></div></button>)}
                <button type="button" onClick={() => { setShowSmartMenu(false); setScreen('chat'); }} className="w-full flex items-center justify-between p-4 rounded-2xl cursor-pointer active:scale-[0.98] transition-all bg-white border-2" style={{ borderColor: BRAND.border }}><ChevronDown size={20} className="rotate-90 text-slate-400" /><div className="flex items-center gap-3"><div className="text-right"><span className="text-sm font-extrabold block mb-0.5" style={{ color: BRAND.blueDark }}>الدعم والشكاوى</span><span className="text-[11px] font-bold text-slate-500">تواصل معنا في أي وقت 24 ساعة</span></div><div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center"><MessageCircle size={20} className="text-amber-600" /></div></div></button>

                {myTopUps.length > 0 && (
                  <div className="pt-4 mt-4 border-t-2" style={{ borderColor: BRAND.border }}>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[11px] font-bold text-slate-400">آخر 3 عمليات</span>
                      <span className="text-xs font-extrabold" style={{ color: BRAND.slate }}>📜 سجل الشحن</span>
                    </div>
                    <div className="space-y-2.5">
                      {myTopUps.map((topUp) => (
                        <div key={topUp.id} className="flex justify-between items-center text-right p-3 rounded-xl bg-slate-50 border-[1.5px]" style={{ borderColor: BRAND.border }}>
                          <div>
                            <span className="font-extrabold text-sm text-slate-800 block mb-0.5">{topUp.amount} ج.م</span>
                            <span className="font-bold text-[10px] text-slate-500 block" dir="ltr">
                              {new Date(topUp.timestamp).toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <span className="font-extrabold text-[11px] px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 shadow-sm">
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

      {/* 📲 نافذة تكبير الباركود */}
      <AnimatePresence>
        {showQrModal && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center p-5" style={{ background: 'rgba(10,22,40,0.85)', backdropFilter: 'blur(8px)' }} onClick={() => setShowQrModal(false)}>
            <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.85, opacity: 0 }} className="rounded-3xl p-6 text-center max-w-sm w-full shadow-2xl relative" style={{ background: BRAND.card }} onClick={e => e.stopPropagation()}>
              <button type="button" onClick={() => setShowQrModal(false)} className="absolute top-4 left-4 text-slate-400 font-black text-lg border-0 bg-transparent cursor-pointer">✕</button>

              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: BRAND.green + '20' }}><QrCode size={24} style={{ color: BRAND.greenDark }} /></div>
              <h3 className="text-base font-black mb-1" style={{ color: BRAND.blueDark }}>📲 شارك بركن 24 مع أصحابك</h3>
              <p className="text-xs font-bold mb-4 leading-relaxed" style={{ color: BRAND.slate }}>دليل وأماكن الركن الذكية في القاهرة بين إيديك parkn24.com🚗💨</p>

              <div className="w-64 h-64 mx-auto p-4 bg-white rounded-[32px] border-4 shadow-xl flex items-center justify-center mb-5" style={{ borderColor: BRAND.blue }}>
                <QRCodeCanvas
                  value={`${SITE_URL}/install`}
                  size={220}
                  level="H"
                  bgColor="#ffffff"
                  fgColor="#0A1628"
                  includeMargin={false}
                />
              </div>

              <div className="space-y-2.5">
                <button type="button" onClick={async () => { const appUrl = `${SITE_URL}/install`; try { if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') { await navigator.clipboard.writeText(appUrl); } else { const textArea = document.createElement('textarea'); textArea.value = appUrl; textArea.style.position = 'fixed'; textArea.style.opacity = '0'; document.body.appendChild(textArea); textArea.select(); document.execCommand('copy'); document.body.removeChild(textArea); } toast.success('تم نسخ رابط التطبيق بنجاح! 📋🚀', { duration: 3000 }); } catch { toast.error('تعذر نسخ الرابط'); } }} className="w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all border-0 text-white shadow-md" style={{ background: BRAND.greenDark }}><Copy size={16} /><span>نسخ رابط التطبيق 🔗</span></button>
                <button type="button" onClick={() => setShowQrModal(false)} className="w-full py-3 rounded-xl font-bold text-sm text-slate-500 bg-slate-100 cursor-pointer active:scale-95 transition-all" style={{ border: `1.5px solid ${BRAND.border}` }}>إغلاق النافذة</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 🌟 نافذة الإبلاغ عن تعديل سعر الجراج */}
      <AnimatePresence>
        {reportingGarage && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-5" style={{ background: 'rgba(10,22,40,0.75)', backdropFilter: 'blur(6px)' }} onClick={() => setReportingGarage(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="rounded-3xl p-6 text-right max-w-xs w-full shadow-2xl relative" style={{ background: BRAND.card }} onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-3"><button type="button" onClick={() => setReportingGarage(null)} className="text-slate-400 font-black text-sm border-0 bg-transparent cursor-pointer">✕</button><h3 className="text-sm font-black" style={{ color: BRAND.blueDark }}>✍️ تحديث سعر الركنة</h3></div>
              <p className="text-[11px] font-bold mb-4" style={{ color: BRAND.slate }}>لقيت السعر اتغير في <b style={{ color: BRAND.navy }}>{reportingGarage.name}</b>؟ اكتب السعر الجديد لمساعدة باقي السائقين! 🤝</p>
              <div className="mb-5"><label className="text-[10px] font-black block mb-2 text-right" style={{ color: BRAND.slate }}>السعر الفعلي الحالي في الشارع:</label>
                <div className="rounded-2xl p-3.5 bg-slate-50" style={{ border: `1.5px solid ${BRAND.border}` }}><div className="flex items-center justify-between gap-3">
                  <button type="button" onClick={() => setUpdatedPriceInput(p => Math.max(5, (Number(p) || 0) - 5))} className="active:scale-90 border-0 rounded-xl text-white font-black w-10 h-10 flex items-center justify-center cursor-pointer bg-red-500 shadow-md shadow-red-500/10"><Minus size={16} strokeWidth={3} /></button>
                  <div className="text-center flex-1"><input type="number" pattern="\d*" inputMode="numeric" value={updatedPriceInput} onChange={(e) => { const val = e.target.value; if (val === '') setUpdatedPriceInput(''); else { const parsed = parseInt(val, 10); if (!isNaN(parsed)) setUpdatedPriceInput(parsed); } }} onBlur={() => { if (updatedPriceInput === '' || Number(updatedPriceInput) <= 0) { setUpdatedPriceInput(reportingGarage.basePrice || 20); } }} className="bg-transparent text-center w-full outline-none font-mono font-black text-3xl border-0 p-0" style={{ color: BRAND.navy }} /><div className="font-bold text-[9px] mt-1" style={{ color: BRAND.slate }}>{reportingGarage.priceType === 'daily' ? 'ج.م / اليوم بالكامل' : 'ج.م / الساعة'}</div></div>
                  <button type="button" onClick={() => setUpdatedPriceInput(p => (Number(p) || 0) + 5)} className="active:scale-90 border-0 rounded-xl text-white font-black w-10 h-10 flex items-center justify-center cursor-pointer bg-emerald-500 shadow-md shadow-emerald-500/10"><Plus size={16} strokeWidth={3} /></button>
                </div></div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={handleSubmitPriceUpdate} disabled={isSubmittingPrice} className="flex-1 py-3 rounded-xl font-black text-xs text-white border-0 cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-1" style={{ background: BRAND.blue }}><Check size={14} /><span>{isSubmittingPrice ? 'جاري الحفظ...' : 'تأكيد السعر'}</span></button>
                <button type="button" onClick={() => setReportingGarage(null)} className="py-3 px-4 rounded-xl font-bold text-xs bg-slate-100 text-slate-500 cursor-pointer" style={{ border: `1.5px solid ${BRAND.border}` }}>إلغاء</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 🌟 شاشة "طريق السلامة" التفاعلية */}
      <AnimatePresence>
        {activeDirectoryTrip && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[2000] flex flex-col justify-between p-6 text-center" style={{ background: 'linear-gradient(180deg, #0f172a 0%, #020617 100%)' }}>
            <div className="pt-16 max-w-sm mx-auto w-full">
              <motion.div initial={{ scale: 0.3, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: 'spring', damping: 11, stiffness: 140 }} className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 bg-slate-800 border-2 border-blue-500 shadow-lg shadow-blue-500/10"><motion.span className="text-4xl inline-block" initial={{ rotate: -40, scale: 0.5 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', damping: 8, stiffness: 160, delay: 0.15 }}>🚙</motion.span></motion.div>
              <h2 className="text-xl font-black text-white mb-2">طريق السلامة يا بطل! 🛣️✨</h2>
              <p className="text-xs font-bold text-slate-400 mb-6 leading-relaxed">جاري توجيهك الآن عبر خرائط جوجل إلى <b className="text-white">{activeDirectoryTrip.name}</b></p>
              <div className="border border-slate-800 rounded-2xl p-4 bg-slate-900/80 mb-6 shadow-lg shadow-black/30">
                <span className="text-[10px] font-black text-slate-400 block mb-1">💰 السعر المتوقع هناك</span>
                <span className="font-black text-2xl text-emerald-400 font-mono block mb-2 leading-none">{activeDirectoryTrip.priceType === 'daily' ? `${activeDirectoryTrip.dailyPrice || activeDirectoryTrip.basePrice} ج.م / اليوم` : `${activeDirectoryTrip.basePrice} ج.م / ساعة`}</span>
                <span className="text-[12px] font-black text-white block mt-2 border-t border-slate-800 pt-3.5 leading-relaxed" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>💵 يرجى سداد الحساب كاش للسايس</span>
              </div>
              <div className="p-4 rounded-xl text-right bg-amber-500/10 border border-amber-500/40 flex gap-2"><div className="text-right w-full"><span className="text-[12px] font-black text-amber-400 block mb-1.5">💡 شارك مجتمع بركن</span><span className="text-[11px] font-black text-white leading-relaxed block" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>لما توصل بالسلامة، لو لقيت السعر اتغير أو السايس غيره، اطلب تعديل السعر وساعد غيرك! 🤝</span></div></div>
            </div>
            <div className="max-w-xs mx-auto w-full space-y-3 pb-8">
              <button type="button" onClick={() => { const url = `https://www.google.com/maps/dir/?api=1&destination=${activeDirectoryTrip.lat},${activeDirectoryTrip.lng}&travelmode=driving&dir_action=navigate`; window.open(url, '_blank', 'noopener,noreferrer'); }} className="w-full py-3.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all border-0 text-white shadow-sm" style={{ background: BRAND.blue }}><Navigation size={14} /><span>إعادة فتح خرائط جوجل 🗺️</span></button>

              <button
                type="button"
                onClick={handleConfirmArrival}
                className="w-full py-3.5 rounded-xl font-black text-sm text-white border-0 cursor-pointer active:scale-95 transition-all shadow-lg"
                style={{ background: BRAND.greenDark, boxShadow: '0 4px 15px rgba(110, 166, 42, 0.4)' }}
              >
                🏁 وصلت بالسلامة / العودة للرئيسية
              </button>

              {/* 🏠 زر العودة السريعة للرئيسية */}
              <button
                type="button"
                onClick={() => {
                  setActiveDirectoryTrip(null);
                  toast('تم العودة للرئيسية 🏠', { icon: '🔙', duration: 2000 });
                }}
                className="w-full py-3 rounded-xl font-black text-xs cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-1.5"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  color: '#ffffff',
                  border: '1.5px solid rgba(255,255,255,0.25)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <span>🏠 العودة للصفحة الرئيسية</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const GarageCard = memo(function GarageCard({ garage, index, onSelect, onReportPrice, isNearby, isClosest, hasActiveSession, hasIncomingCar, disabled }: GarageCardProps) {
  const isDirectory = garage.garageType === 'directory';
  const isVip = garage.garageType === 'vip';
  const isBusy = hasActiveSession || hasIncomingCar;
  const isFull = !isDirectory && garage.availableSpots === 0;
  const btnBg = (() => { if (isDirectory) return BRAND.blueDark; if (isFull) return BRAND.border; if (isBusy) return BRAND.green; return BRAND.blue; })();
  const btnLabel = (() => { if (isDirectory) return 'افتح الاتجاهات 🗺️'; if (isFull) return 'ممتلئ'; if (hasActiveSession) return 'الجلسة النشطة ⚡'; if (hasIncomingCar) return 'الحجز النشط 📍'; return `احجز بـ ${BOOKING_FEE} ج.م 🅿️`; })();
  const displayPrice = (() => { if (garage.priceType === 'daily') return `${garage.dailyPrice || garage.basePrice}`; if (garage.priceType === 'monthly') return `${garage.monthlyPrice || 1500}`; return `${garage.basePrice}`; })();
  const priceUnit = (() => { if (garage.priceType === 'daily') return 'ج.م/يومي'; if (garage.priceType === 'monthly') return 'ج.م/شهري'; return 'ج.م/ساعة'; })();

  return (
    <div className="p-3 text-right relative bg-white rounded-xl transition-all" style={{ border: `1.5px solid ${isVip ? BRAND.blue + '40' : BRAND.borderDark}`, boxShadow: isVip ? '0 2px 8px rgba(22,86,184,0.08)' : '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div className="flex justify-between items-center mb-1.5 flex-wrap gap-1" style={{ direction: 'rtl' }}>
        <div className="flex items-center gap-1 flex-wrap">
          {isDirectory ? (
            <span className="text-[8px] font-black px-2 py-0.5 rounded flex items-center gap-1" style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #94a3b8' }}><span>🧭 دليل مجاني</span></span>
          ) : (
            <>
              <span className="text-[8px] font-black px-2 py-0.5 rounded flex items-center gap-1" style={{ background: '#eff6ff', color: BRAND.blue, border: `1px solid ${BRAND.blue}40` }}>
                <Zap size={8} /> VIP مضمون
              </span>
              <span className="flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: '#fef3c7', color: '#b45309' }}><Star size={8} fill="currentColor" /> {garage.rating || 4.5}</span>
            </>
          )}
          {!isDirectory && garage.payment_mode === 'cash' && (<span className="text-[8px] font-black px-1.5 py-0.5 rounded" style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>💵 نقدي</span>)}
          {!isDirectory && garage.payment_mode === 'wallet' && (<span className="text-[8px] font-black px-1.5 py-0.5 rounded" style={{ background: '#f0f5ff', color: BRAND.blue, border: `1px solid ${BRAND.border}` }}>👝 محفظة</span>)}
          {!isDirectory && garage.payment_mode === 'both' && (<span className="text-[8px] font-black px-1.5 py-0.5 rounded" style={{ background: '#f0fdf4', color: BRAND.greenDark, border: `1px solid #bbf7d0` }}>💵👝 كاش ومحفظة</span>)}
          {isDirectory && (<span className="text-[8px] font-black px-1.5 py-0.5 rounded" style={{ background: '#f0fdf4', color: BRAND.greenDark }}>💵 كاش للسايس</span>)}
        </div>
      </div>
      <div className="flex items-start justify-between gap-2 mb-1" style={{ direction: 'rtl' }}>
        <h4 className="text-[13px] font-black leading-tight text-slate-950 flex-1">{garage.name}</h4>
      </div>
      <div className="flex items-center gap-1 justify-end text-[10px] font-bold mb-2" style={{ color: BRAND.slate, direction: 'rtl' }}>
        <span className="truncate max-w-[260px]">{garage.location}</span><MapPin size={10} style={{ color: BRAND.slate }} className="shrink-0" />
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t-[1.5px]" style={{ borderColor: BRAND.border }}>
        <div className="flex items-center gap-1 text-[11px] font-black" style={{ color: BRAND.slate }}><Navigation size={11} className="rotate-45" /><span>{formatDuration(garage.minutes)}</span></div>
        <div className="flex items-center gap-3 text-right" style={{ direction: 'rtl' }}>
          {isDirectory && (<button type="button" onClick={(e) => { e.stopPropagation(); onReportPrice(garage); }} className="flex items-center gap-0.5 text-[9px] font-black border-0 bg-transparent cursor-pointer hover:underline p-1 rounded" style={{ color: BRAND.blue }}><Edit3 size={10} /><span>تعديل السعر</span></button>)}
          {!isDirectory && (<div className="flex flex-col items-center"><span className="font-mono font-black text-[15px] leading-none" style={{ color: BRAND.blue }}>{garage.availableSpots}</span><span className="text-[8px] font-black text-slate-400 mt-1 uppercase">مكان شاغر</span></div>)}
          <div className="flex flex-col items-center"><span className="font-mono font-black text-[15px] leading-none" style={{ color: BRAND.greenDark }}>{displayPrice}</span><span className="text-[8px] font-black text-slate-400 mt-1 uppercase">{priceUnit}</span></div>
        </div>
      </div>
      <button type="button" disabled={isFull || disabled} onClick={!disabled && !isFull ? onSelect : undefined} className="w-full border-0 font-black py-2 rounded-xl mt-2.5 text-xs text-white cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-1 shadow-sm" style={{ background: btnBg }}><span>{btnLabel}</span></button>
    </div>
  );
});