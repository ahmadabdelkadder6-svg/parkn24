// src/components/GarageListScreen.tsx

import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Star, Search, Navigation, Locate, Plus, Receipt, MessageCircle, 
  X, History, Gift, ChevronDown, QrCode, Copy, Edit3, Check, Minus, Menu, 
  Wallet, Radio, Smartphone, AlertTriangle, Zap, ShieldAlert
} from 'lucide-react';
import { useStore, Garage, ParkingSession as Session, IncomingCar, normalizePlate, normalizePhone } from '../store';
import {
  calculateDistance, distanceToMinutes, classifyDistance, formatDuration,
} from '../utils/distance';
import TopUpWalletModal from './TopUpWalletModal';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';

const BRAND = {
  blue: '#1656b8', blueDark: '#0f3d85', green: '#8cc63f', greenDark: '#6ea62a',
  bg: '#f1f5f9', card: '#ffffff', slate: '#334155', border: '#cbd5e1',
  borderDark: '#94a3b8', navy: '#0a1628',
};

interface GarageWithDistance extends Garage {
  distance: number; minutes: number; classification: 'nearby' | 'far';
}

interface SpeedCamera {
  id: string; name: string; lat: number; lng: number; max_speed: number;
  camera_type: 'speed' | 'seatbelt' | 'traffic_light' | string;
}

interface GarageCardProps {
  garage: GarageWithDistance; index: number; onSelect: () => void;
  onReportPrice: (garage: GarageWithDistance) => void; isNearby: boolean;
  isClosest: boolean; hasActiveSession: boolean; hasIncomingCar: boolean; disabled: boolean;
}

const safeParseTime = (value: unknown): number => {
  if (!value) return 0;
  if (typeof value === 'string') { const ms = new Date(value).getTime(); return Number.isFinite(ms) && ms > 0 ? ms : 0; }
  if (typeof value === 'number') { return value < 1_000_000_000_000 ? value * 1000 : value; }
  return 0;
};

// 🎵 نظام الصوت الذكي للرادارات (Zero-Lag Web Audio API)
let audioCtxIns: AudioContext | null = null;
const initAudio = () => {
  if (!audioCtxIns) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) audioCtxIns = new AudioCtx();
  }
  if (audioCtxIns && audioCtxIns.state === 'suspended') audioCtxIns.resume();
};

const playRadarBeepSound = (cameraType: string, isCritical: boolean = false) => {
  try {
    if (!audioCtxIns) initAudio();
    const ctx = audioCtxIns;
    if (!ctx) return;

    if (isCritical) {
      [0, 80, 160, 240].forEach((delay) => {
        setTimeout(() => {
          const osc = ctx.createOscillator(); const gain = ctx.createGain();
          osc.type = 'sawtooth'; osc.frequency.setValueAtTime(1400, ctx.currentTime);
          gain.gain.setValueAtTime(0.3, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.06);
          osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.06);
        }, delay);
      });
    } else if (cameraType === 'seatbelt') {
      [0, 120, 240].forEach((delay) => {
        setTimeout(() => {
          const osc = ctx.createOscillator(); const gain = ctx.createGain();
          osc.type = 'triangle'; osc.frequency.setValueAtTime(659.25, ctx.currentTime);
          gain.gain.setValueAtTime(0.15, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
          osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.1);
        }, delay);
      });
    } else if (cameraType === 'traffic_light') {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(783.99, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(523.25, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.2, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.3);
    } else {
      const osc1 = ctx.createOscillator(); const gain1 = ctx.createGain();
      osc1.type = 'sine'; osc1.frequency.setValueAtTime(880, ctx.currentTime);
      gain1.gain.setValueAtTime(0.25, ctx.currentTime); gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc1.connect(gain1); gain1.connect(ctx.destination); osc1.start(); osc1.stop(ctx.currentTime + 0.12);
      setTimeout(() => {
        const osc2 = ctx.createOscillator(); const gain2 = ctx.createGain();
        osc2.type = 'sine'; osc2.frequency.setValueAtTime(1174.66, ctx.currentTime);
        gain2.gain.setValueAtTime(0.25, ctx.currentTime); gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
        osc2.connect(gain2); gain2.connect(ctx.destination); osc2.start(); osc2.stop(ctx.currentTime + 0.18);
      }, 130);
    }
  } catch (e) { console.warn('Audio playback blocked'); }
};

const AREA_ICONS: Record<string, string> = {
  'وسط البلد': '🏢', 'الزمالك': '👑', 'مصر الجديدة': '🏰', 'مدينة نصر': '🏙️',
  'المعادي': '🌳', 'المهندسين': '🛍️', 'الدقي': '🎓', 'التجمع الخامس': '💎',
  'صلاح سالم والعروبة': '🛣️', 'ممشى أهل مصر': '🌊', 'جاردن سيتي والقصر العيني': '🏛️',
  'بولاق': '🚢', 'العتبة والأسواق': '🛍️', 'الحسين والأزهر': '🏮', 'شيراتون المطار': '✈️',
  'الرحاب ومدينتي': '🏡', 'القرية الذكية': '💻', 'الشيخ زايد': '🌲', '6 أكتوبر': '🎡',
  'المقطم': '⛰️', 'المنيل': '🏝️', 'الجيزة': '🏛️', 'حدائق الأهرام': '🚪',
  'المريوطية والمنصورية': '🌴', 'الكيت كات': '🌊', 'إمبابة والوراق': '⛵',
  'أرض اللواء': '🚉', 'الوايلي والعباسية': '🏥', 'الزيتون والمطرية': '🌿',
  'حدائق القبة': '🌳', 'جسر السويس': '🛣️', 'شبرا ورمسيس': '🚆', 'شبرا الخيمة': '🏭',
  'مصر القديمة': '🕌', 'مدينة الشروق': '🎓', 'مدينة العبور': '🍇', 'العاشر من رمضان': '🏭',
  'العاصمة الإدارية': '🏛️', 'حلوان': '⚙️', 'الإسكندرية': '🏖️', 'الساحل الشمالي': '🏄',
  'المنصورة والدلتا': '🌾', 'طنطا': '🕌', 'مدن القناة': '🚢', 'العين السخنة': '🏖️',
  'البساتين': '🏢', 'الخليفة': '🕌', 'السيدة زينب': '🕌', 'المعصرة': '🏭', 'دار السلام': '🌉',
  'مناطق أخرى': '📍',
};

const CATEGORIES = [
  { id: 'hotels', label: 'فنادق', icon: '🏨' }, { id: 'hospitals', label: 'مستشفيات', icon: '🏥' },
  { id: 'traffic', label: 'مرور', icon: '🚔' }, { id: 'markets', label: 'أسواق', icon: '🛒' },
  { id: 'cafes', label: 'كافيهات/كورنيش', icon: '☕' }, { id: 'malls', label: 'مولات/بلازا', icon: '🛍️' },
];

export default function GarageListScreen() {
  const {
    garages, setSelectedGarageId, setScreen, currentUser, sessions, incomingCars,
    offers, addIncomingCar, fetchAll, acknowledgedSessionIds, walletTopUps, reportPriceUpdate,
  } = useStore();

  const [search, setSearch] = useState('');
  const [showNearbyOnly, setShowNearbyOnly] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showSmartMenu, setShowSmartMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<'vip' | 'directory'>('directory');
  const [activeDirectoryTrip, setActiveDirectoryTrip] = useState<GarageWithDistance | null>(null);
  const [visibleLimits, setVisibleLimits] = useState<Record<string, number>>({});
  const [reportingGarage, setReportingGarage] = useState<GarageWithDistance | null>(null);
  const [updatedPriceInput, setUpdatedPriceInput] = useState<number | ''>(20);
  const [isSubmittingPrice, setIsSubmittingPrice] = useState(false);
  
  // شاشة المستخدم
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>({ lat: 30.0444, lng: 31.2357 });
  const [locationLoading, setLocationLoading] = useState(false);
  
  const [isBooking, setIsBooking] = useState(false);
  const [isAbuseDetected, setIsAbuseDetected] = useState(false);
  const [expandedArea, setExpandedArea] = useState<string | null>(null);

  // 🌟 نظام الرادار الذكي (Radar Alert System)
  const [speedCameras, setSpeedCameras] = useState<SpeedCamera[]>([]);
  const [radarAlertsEnabled, setRadarAlertsEnabled] = useState(true);
  const [activeRadarAlert, setActiveRadarAlert] = useState<{ camera: SpeedCamera; distanceMeters: number; isCritical: boolean } | null>(null);
  const alertedRadarsRef = useRef<Set<string>>(new Set());
  const criticalBeepedRef = useRef<Set<string>>(new Set());

  // 🌟 بانر الإنقاذ السريع (3 جراجات)
  const [rescueIndex, setRescueIndex] = useState(0);
  const MAX_RESCUE_OPTIONS = 3;

  // Refs لنظام التتبع المزدوج (Dual-Track GPS)
  const autoNavigatedRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const lastUiUpdateLocRef = useRef<{ lat: number; lng: number } | null>(null);
  const bestAccuracyRef = useRef<number>(Infinity);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; }; }, []);

  const normalizedUserPlate = useMemo(() => normalizePlate(currentUser?.carPlate), [currentUser?.carPlate]);
  const cleanUserPhone = useMemo(() => currentUser?.phone ? normalizePhone(currentUser.phone) : '', [currentUser?.phone]);

  // جلب الرادارات بالكامل بدون حد أقصى
  useEffect(() => {
    supabase.from('speed_cameras').select('*').limit(2000).then(({ data }) => {
      if (data) setSpeedCameras(data);
    });
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const checkAbuseHistory = async () => {
      try {
        const cleanPlate = normalizePlate(currentUser.carPlate);
        if (!cleanPlate && !cleanUserPhone) return;
        if (currentUser.hasUsedFreeSession) { setIsAbuseDetected(true); return; }
        if (cleanUserPhone) {
          const { data: userDb } = await supabase.from('users').select('has_used_free_session').eq('phone', cleanUserPhone).maybeSingle();
          if (userDb?.has_used_free_session === true) { setIsAbuseDetected(true); return; }
        }
        const { data: sessionDb } = await supabase.from('sessions').select('id').eq('is_first_free_session', true).or(`car_plate.eq.${cleanPlate}${cleanUserPhone ? `,customer_phone.eq.${cleanUserPhone}` : ''}`).limit(1);
        if (sessionDb && sessionDb.length > 0) { setIsAbuseDetected(true); } else { setIsAbuseDetected(false); }
      } catch (err) { console.error(err); }
    };
    checkAbuseHistory();
  }, [currentUser, sessions, cleanUserPhone]);

  const isEligibleForFreeSession = useMemo(() => currentUser && !currentUser.hasUsedFreeSession && !isAbuseDetected, [currentUser, isAbuseDetected]);

  const activeSession = useMemo(() => {
    if (!normalizedUserPlate && !cleanUserPhone) return undefined;
    return sessions
      .filter((s) => s.status === 'active' && !acknowledgedSessionIds?.has(s.id) && (normalizePlate(s.carPlate) === normalizedUserPlate || (cleanUserPhone && s.customerPhone && normalizePhone(s.customerPhone) === cleanUserPhone)))
      .sort((a, b) => safeParseTime(b.startTime) - safeParseTime(a.startTime))[0];
  }, [sessions, normalizedUserPlate, cleanUserPhone, acknowledgedSessionIds]);

  const hasCompletedSession = useMemo(() => {
    if (activeSession) return false;
    return sessions.some((s) => normalizePlate(s.carPlate) === normalizedUserPlate && s.status === 'completed');
  }, [sessions, normalizedUserPlate, activeSession]);

  const myIncomingCar = useMemo(() => {
    if (!normalizedUserPlate) return undefined;
    return incomingCars.filter((c) => normalizePlate(c.carPlate) === normalizedUserPlate && c.status === 'coming').sort((a, b) => safeParseTime(b.startTime || 0) - safeParseTime(a.startTime || 0))[0];
  }, [incomingCars, normalizedUserPlate]);

  const myTopUps = useMemo(() => {
    if (!cleanUserPhone || !walletTopUps) return [];
    return walletTopUps.filter((w) => w.userPhone === cleanUserPhone).sort((a, b) => b.timestamp - a.timestamp).slice(0, 3);
  }, [walletTopUps, cleanUserPhone]);

  const pendingTopUpsCount = useMemo(() => myTopUps.filter((w) => w.status === 'pending').length, [myTopUps]);

  // 🌟 نظام التتبع المزدوج (Dual-Track GPS)
  const getUserLocation = useCallback(() => {
    if (!('geolocation' in navigator)) { toast.error('الـ GPS غير مدعوم'); return; }
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    setLocationLoading(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        if (!isMountedRef.current) return;
        const newLat = position.coords.latitude;
        const newLng = position.coords.longitude;
        const accuracy = position.coords.accuracy || 10;
        
        // 1. مسار الرادار (سريع جداً ولحظي، لا يعيد رسم الشاشة)
        if (radarAlertsEnabled && speedCameras.length > 0) {
          let closestRadar = null;
          for (const cam of speedCameras) {
            if (Math.abs(newLat - Number(cam.lat)) > 0.012 || Math.abs(newLng - Number(cam.lng)) > 0.012) continue;
            const distMeters = calculateDistance(newLat, newLng, Number(cam.lat), Number(cam.lng)) * 1000;
            const maxSpeed = cam.max_speed || 60;
            const alertRadiusLimit = maxSpeed > 60 ? 600 : 350;

            if (distMeters <= alertRadiusLimit) {
              const isCritical = distMeters <= 100;
              if (!closestRadar || distMeters < closestRadar.distanceMeters) {
                closestRadar = { camera: cam, distanceMeters: Math.round(distMeters), isCritical };
              }
            }
          }

          if (closestRadar) {
            setActiveRadarAlert(closestRadar);
            if (!alertedRadarsRef.current.has(closestRadar.camera.id)) {
              playRadarBeepSound(closestRadar.camera.camera_type, false);
              alertedRadarsRef.current.add(closestRadar.camera.id);
            }
            if (closestRadar.isCritical && !criticalBeepedRef.current.has(closestRadar.camera.id)) {
              playRadarBeepSound(closestRadar.camera.camera_type, true);
              criticalBeepedRef.current.add(closestRadar.camera.id);
            }
          } else {
            setActiveRadarAlert(null);
          }
        }

        // 2. مسار واجهة المستخدم (تتحدث الشاشة فقط لو تحرك 25 متر لتجنب التهنيج)
        if (!lastUiUpdateLocRef.current) {
          lastUiUpdateLocRef.current = { lat: newLat, lng: newLng };
          setUserLocation({ lat: newLat, lng: newLng });
        } else {
          const distMoved = calculateDistance(lastUiUpdateLocRef.current.lat, lastUiUpdateLocRef.current.lng, newLat, newLng) * 1000;
          if (distMoved >= 25 || (accuracy < bestAccuracyRef.current && (bestAccuracyRef.current - accuracy) > 10)) {
            lastUiUpdateLocRef.current = { lat: newLat, lng: newLng };
            if (accuracy < bestAccuracyRef.current) bestAccuracyRef.current = accuracy;
            setUserLocation({ lat: newLat, lng: newLng });
          }
        }
        setLocationLoading(false);
      },
      () => { if (isMountedRef.current) setLocationLoading(false); },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  }, [radarAlertsEnabled, speedCameras]);

  const handleForceRefreshLocation = useCallback(() => {
    lastUiUpdateLocRef.current = null; bestAccuracyRef.current = Infinity; getUserLocation();
    toast.success('جاري تحديد موقعك بدقة 🛰️', { id: 'gps-refresh' });
  }, [getUserLocation]);

  useEffect(() => { getUserLocation(); return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); }; }, [getUserLocation]);

  // حساب المسافات
  const garagesWithDistance: GarageWithDistance[] = useMemo(() => {
    return garages.filter((g) => g.isActive !== false).map((garage) => {
      const distance = calculateDistance(userLocation.lat, userLocation.lng, garage.lat, garage.lng);
      const minutes = distanceToMinutes(distance);
      return { ...garage, distance, minutes, classification: classifyDistance(minutes) };
    }).sort((a, b) => a.minutes - b.minutes);
  }, [garages, userLocation]);

  // 🌟 قائمة الإنقاذ السريع (أقرب 3 فقط)
  const rescueGaragesList = useMemo(() => {
    if (locationLoading || !userLocation.lat) return [];
    const vipNearby = garagesWithDistance.filter((g) => g.garageType === 'vip' && g.availableSpots > 0 && g.minutes <= 5);
    const directoryNearby = garagesWithDistance.filter((g) => g.garageType === 'directory' && g.minutes <= 5);
    return [...vipNearby, ...directoryNearby].slice(0, MAX_RESCUE_OPTIONS);
  }, [garagesWithDistance, locationLoading, userLocation]);

  const currentRescueGarage = rescueGaragesList[rescueIndex] || null;

  const handleNextRescue = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (rescueGaragesList.length <= 1) return;
    const nextIndex = (rescueIndex + 1) % rescueGaragesList.length;
    setRescueIndex(nextIndex);
  }, [rescueIndex, rescueGaragesList.length]);

  const matchesCategory = useCallback((garage: GarageWithDistance, catId: string): boolean => {
    const text = `${garage.name} ${garage.location} ${garage.area}`.toLowerCase();
    switch (catId) {
      case 'hotels': return /فندق|هيلتون|سوفيتيل|ماريوت|شيراتون|فيرمونت/i.test(text);
      case 'hospitals': return /مستشفى|عيادات|طبي|الشفاء|الدمرداش/i.test(text);
      case 'traffic': return /مرور|تراخيص|فحص/i.test(text);
      case 'markets': return /سوق|وكالة|الموسكي|خضار/i.test(text);
      case 'cafes': return /ممشى|كورنيش|كافيه|مطعم/i.test(text);
      case 'malls': return /مول|بلازا|سكوير|سيتي|waterway/i.test(text);
      default: return false;
    }
  }, []);

  const filteredGarages = useMemo(() => {
    let filtered = garagesWithDistance.filter((g) => g.garageType === activeTab);
    if (selectedCategory) filtered = filtered.filter((g) => matchesCategory(g, selectedCategory));
    if (search.trim()) { const q = search.trim().toLowerCase(); filtered = filtered.filter((g) => g.name.toLowerCase().includes(q) || g.location.toLowerCase().includes(q) || (g.area || '').toLowerCase().includes(q)); }
    if (showNearbyOnly) filtered = filtered.filter((g) => g.classification === 'nearby');
    return filtered;
  }, [garagesWithDistance, search, showNearbyOnly, activeTab, selectedCategory, matchesCategory]);

  const areaGroups = useMemo(() => {
    const groups: Record<string, GarageWithDistance[]> = {};
    filteredGarages.forEach(g => { const zone = g.area || 'مناطق أخرى'; if (!groups[zone]) groups[zone] = []; groups[zone].push(g); });
    return Object.keys(groups).map(name => ({ name, garages: groups[name] })).sort((a, b) => a.name === 'مناطق أخرى' ? 1 : b.name === 'مناطق أخرى' ? -1 : a.name.localeCompare(b.name, 'ar'));
  }, [filteredGarages]);

  useEffect(() => { if (search.trim() && areaGroups.length > 0) setExpandedArea(areaGroups[0].name); }, [search, areaGroups]);

  const handleGarageClick = async (garage: GarageWithDistance) => {
    if (garage.garageType === 'directory') {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${garage.lat},${garage.lng}&travelmode=driving&dir_action=navigate`;
      window.open(url, '_blank', 'noopener,noreferrer');
      setActiveDirectoryTrip(garage); setSearch(''); setExpandedArea(null);
      toast.success(`رحلة سعيدة! جاري توجيهك إلى ${garage.name} 🧭`);
      return;
    }
    if (!currentUser) { toast.error('سجل بياناتك أولاً'); return; }
    if (activeSession) { setSelectedGarageId(activeSession.garageId); setScreen('session'); return; }
    if (myIncomingCar) { setSelectedGarageId(myIncomingCar.garageId); setScreen('navigation'); return; }
    
    setIsBooking(true);
    try {
      await addIncomingCar({ garageId: garage.id, carPlate: currentUser.carPlate, customerName: currentUser.name, customerPhone: currentUser.phone, agreedPrice: garage.basePrice, estimatedArrival: Math.max(3, garage.minutes) });
      setSelectedGarageId(garage.id); toast.success(`تم الحجز بنجاح 🚗`); setScreen('navigation');
    } catch (e) { toast.error('حدث خطأ أثناء الحجز'); } finally { setIsBooking(false); }
  };

  const handleOpenPriceReport = (g: GarageWithDistance) => { setReportingGarage(g); setUpdatedPriceInput(g.priceType === 'daily' ? (g.dailyPrice || g.basePrice) : g.basePrice || 20); };
  
  const handleSubmitPriceUpdate = async () => {
    const finalPrice = updatedPriceInput === '' ? (reportingGarage?.basePrice || 20) : updatedPriceInput;
    if (!reportingGarage || finalPrice <= 0) return;
    setIsSubmittingPrice(true);
    try {
      await reportPriceUpdate(reportingGarage.id, finalPrice, reportingGarage.priceType);
      toast.success('شكراً لمساعدتك! تم تسجيل بلاغك 🤝', { icon: '✅' });
      setReportingGarage(null);
    } catch (error: any) { toast.error('تعذر التحديث'); } finally { setIsSubmittingPrice(false); }
  };

  const renderCameraBadge = (type: string) => {
    switch (type) {
      case 'seatbelt': return { title: 'حزام وتليفون', bg: 'from-purple-600 to-purple-800', icon: <Smartphone className="w-5 h-5 text-purple-200" /> };
      case 'traffic_light': return { title: 'إشارة وتجاوز', bg: 'from-amber-600 to-amber-800', icon: <AlertTriangle className="w-5 h-5 text-amber-200" /> };
      default: return { title: 'رادار سرعة', bg: 'from-rose-600 to-rose-800', icon: <ShieldAlert className="w-5 h-5 text-rose-200" /> };
    }
  };

  const handleInteraction = () => initAudio();

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: BRAND.bg, color: BRAND.blueDark }} onClick={handleInteraction}>
      <div className="px-4 pt-10 pb-3 z-20 shadow-sm relative" style={{ background: BRAND.card, borderBottom: `1.5px solid ${BRAND.border}` }}>
        <div dir="rtl" className="flex justify-between items-center mb-3.5">
          <div className="text-right flex flex-col gap-1.5">
            <span className="font-black text-xl block leading-none" style={{ color: BRAND.blue }}>بركن <span style={{ color: BRAND.green }}>24</span></span>
            <div className="flex flex-col mt-0.5">
              <span className="text-base font-black text-slate-900 block leading-tight">أهلاً {currentUser?.name?.split(' ')[0] || 'بك'} 👋</span>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={() => setRadarAlertsEnabled(!radarAlertsEnabled)} className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer active:scale-90 transition-all border-[1.5px]" style={{ background: radarAlertsEnabled ? BRAND.green + '20' : BRAND.slate + '20', borderColor: radarAlertsEnabled ? BRAND.green : BRAND.border, color: radarAlertsEnabled ? BRAND.greenDark : BRAND.slate }}>
              <Radio size={18} className={radarAlertsEnabled ? 'animate-pulse' : ''} />
            </button>
            <button type="button" onClick={() => setShowQrModal(true)} className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50 border-[1.5px] border-blue-200"><QrCode size={18} style={{ color: BRAND.blue }} /></button>
            <button type="button" onClick={() => setShowSmartMenu(true)} className="w-10 h-10 rounded-xl flex items-center justify-center relative bg-slate-100 border-[1.5px]" style={{ borderColor: BRAND.border }}>
              <Menu size={18} style={{ color: BRAND.blueDark }} />
              {pendingTopUpsCount > 0 && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-white" />}
            </button>
          </div>
        </div>

        {/* ⚠️ بانر تنبيه الرادارات */}
        <AnimatePresence mode="wait">
          {radarAlertsEnabled && activeRadarAlert && (
            <motion.div initial={{ opacity: 0, y: -10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.95 }} dir="rtl" className={`mb-2.5 p-3 rounded-xl flex items-center justify-between shadow-lg text-white transition-all ${activeRadarAlert.isCritical ? 'bg-gradient-to-r from-red-600 to-red-800 border-2 border-red-400 animate-pulse' : `bg-gradient-to-r ${renderCameraBadge(activeRadarAlert.camera.camera_type).bg} border border-white/20`}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-white/20 backdrop-blur ${activeRadarAlert.isCritical ? 'animate-bounce' : ''}`}>
                  {activeRadarAlert.isCritical ? <Zap className="w-5 h-5 text-yellow-300" /> : renderCameraBadge(activeRadarAlert.camera.camera_type).icon}
                </div>
                <div className="text-right">
                  <div className="font-black text-xs text-white">{activeRadarAlert.camera.name}</div>
                  <div className="text-[10px] font-bold text-white/90">
                    {activeRadarAlert.isCritical ? (
                      <span className="text-yellow-200">⚠️ خطر! الرادار أمامك (&lt; {activeRadarAlert.distanceMeters}م)</span>
                    ) : (
                      <>{renderCameraBadge(activeRadarAlert.camera.camera_type).title} بعد <span className="font-black underline">{activeRadarAlert.distanceMeters}م</span></>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => setActiveRadarAlert(null)} className="p-1 rounded bg-white/10 text-white cursor-pointer"><X size={14} /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 🌟 بانر الإنقاذ السريع (3 جراجات) */}
        <AnimatePresence mode="wait">
          {currentRescueGarage && !activeSession && !myIncomingCar && (
            <motion.div
              key={currentRescueGarage.id}
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="mb-2.5 rounded-2xl cursor-pointer active:scale-98 transition-all border-2 text-right relative overflow-hidden"
              style={{ background: currentRescueGarage.garageType === 'vip' ? 'linear-gradient(135deg, #1656b8 0%, #0f3d85 100%)' : 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', borderColor: currentRescueGarage.garageType === 'vip' ? '#1656b8' : '#334155' }}
              dir="rtl"
            >
              <div className="p-3.5 pb-2" onClick={() => handleGarageClick(currentRescueGarage)}>
                <div className="flex justify-between items-center">
                  <div className="text-right flex-1 pr-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded-lg text-white" style={{ background: currentRescueGarage.garageType === 'vip' ? '#8cc63f' : '#334155' }}>
                        {currentRescueGarage.garageType === 'vip' ? '⭐ حجز مضمون VIP' : '⚡ منقذ سريع'}
                      </span>
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded-lg bg-white/20 text-white">{rescueIndex + 1} / {rescueGaragesList.length}</span>
                    </div>
                    <h4 className="text-xs font-black text-white leading-tight mb-1">{currentRescueGarage.name}</h4>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-black text-emerald-300">💰 {currentRescueGarage.basePrice} ج.م</span>
                      <span className="text-[10px] font-bold text-white/80">🚗 {formatDuration(currentRescueGarage.minutes)}</span>
                    </div>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white"><Navigation size={18} className="rotate-45" /></div>
                </div>
              </div>
              {rescueGaragesList.length > 1 && (
                <button type="button" onClick={handleNextRescue} className="w-full py-3 text-[12px] font-black text-white bg-black/30 border-0 flex items-center justify-center gap-2 tracking-wide" style={{ borderTop: '2px solid rgba(255,255,255,0.25)' }}>
                  <Search size={14} strokeWidth={3} />
                  <span>{rescueIndex < rescueGaragesList.length - 1 ? '🔍  مش مناسب؟ ابحث عن ساحة أخرى' : '🔄 عرض الكل من الأول'}</span>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-2 mb-2.5">
          <div className="relative flex-1"><Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: BRAND.slate }} /><input className="w-full outline-none text-xs font-bold" style={{ background: BRAND.bg, border: `1px solid ${BRAND.border}`, padding: '9px 32px 9px 12px', borderRadius: 12, color: BRAND.blueDark }} placeholder="ابحث باسم الجراج..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <button type="button" onClick={handleForceRefreshLocation} disabled={locationLoading} className="flex items-center justify-center border-0 cursor-pointer shrink-0" style={{ background: BRAND.blue, color: '#fff', borderRadius: 12, width: 36, height: 36 }}><Locate size={15} className={locationLoading ? 'animate-spin' : ''} /></button>
          <button type="button" onClick={() => setShowNearbyOnly(!showNearbyOnly)} className="text-[10px] font-black px-2.5 rounded-xl cursor-pointer" style={{ background: showNearbyOnly ? BRAND.blue : BRAND.card, color: showNearbyOnly ? '#fff' : BRAND.slate, border: `1.5px solid ${BRAND.border}` }}>{showNearbyOnly ? 'الكل' : 'القريب'}</button>
        </div>

        <div className="flex p-1 rounded-xl bg-slate-200/70" style={{ direction: 'rtl', border: '1.5px solid #cbd5e1' }}>
          <button type="button" onClick={() => { setActiveTab('vip'); setExpandedArea(null); }} className="flex-1 py-2 rounded-lg font-black text-[11px] cursor-pointer border-0 transition-all flex items-center justify-center gap-1" style={{ background: activeTab === 'vip' ? BRAND.blue : 'transparent', color: activeTab === 'vip' ? '#ffffff' : BRAND.slate }}><span>⭐ ركنات VIP</span></button>
          <button type="button" onClick={() => { setActiveTab('directory'); setExpandedArea(null); }} className="flex-1 py-2 rounded-lg font-black text-[11px] cursor-pointer border-0 transition-all flex items-center justify-center gap-1" style={{ background: activeTab === 'directory' ? BRAND.blueDark : 'transparent', color: activeTab === 'directory' ? '#ffffff' : BRAND.slate }}><span>🧭 دليل الساحات</span></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-8">
        {areaGroups.length > 0 ? (
          <div className="space-y-2.5">
            {areaGroups.map((group) => {
              const isExpanded = expandedArea === group.name;
              return (
                <div key={group.name} style={{ background: BRAND.card, borderRadius: 14, border: `1.5px solid ${BRAND.border}`, overflow: 'hidden' }}>
                  <button type="button" onClick={() => setExpandedArea(isExpanded ? null : group.name)} className="w-full p-3.5 flex items-center justify-between text-right bg-transparent border-none cursor-pointer outline-none">
                    <div className="flex items-center gap-2 shrink-0"><span className="text-[11px] font-black font-mono px-2 py-1 rounded bg-slate-100" style={{ color: BRAND.slate }}>{group.garages.length}</span><ChevronDown size={16} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }} /></div>
                    <div className="text-right"><span className="font-black text-sm block">{AREA_ICONS[group.name] || '📍'} {group.name}</span></div>
                  </button>
                  {isExpanded && (
                    <div style={{ background: BRAND.bg, padding: '10px', borderTop: `1px solid ${BRAND.border}` }} className="space-y-2">
                      {group.garages.slice(0, visibleLimits[group.name] || 8).map((garage, i) => (
                        <GarageCard key={garage.id} garage={garage} index={i} onSelect={() => handleGarageClick(garage)} onReportPrice={handleOpenPriceReport} isNearby={garage.classification === 'nearby'} isClosest={i === 0 && garage.classification === 'nearby'} hasActiveSession={Boolean(activeSession)} hasIncomingCar={Boolean(myIncomingCar)} disabled={isBooking} />
                      ))}
                      {group.garages.length > (visibleLimits[group.name] || 8) && (
                        <button type="button" onClick={() => setVisibleLimits(prev => ({ ...prev, [group.name]: (prev[group.name] || 8) + 10 }))} className="w-full py-2.5 rounded-xl font-black text-[11px] bg-white border border-slate-300">عرض المزيد 🔽</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 text-slate-400">لا توجد ساحات في الدليل.</div>
        )}
      </div>

      <AnimatePresence>{showTopUp && <TopUpWalletModal onClose={() => setShowTopUp(false)} />}</AnimatePresence>
    </div>
  );
}

const GarageCard = memo(function GarageCard({ garage, index, onSelect, onReportPrice, isNearby, isClosest, hasActiveSession, hasIncomingCar, disabled }: GarageCardProps) {
  const isDirectory = garage.garageType === 'directory';
  const isFull = !isDirectory && garage.availableSpots === 0;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-3.5 text-right relative bg-white rounded-2xl" style={{ border: `1.5px solid ${isDirectory ? BRAND.borderDark : BRAND.border}` }}>
      <div className="flex justify-between items-center mb-2" style={{ direction: 'rtl' }}>
        {isDirectory ? (<span className="text-[9px] font-black px-2.5 py-0.5 rounded bg-slate-100 border border-slate-400">🧭 دليل الشارع</span>) : (<span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">⭐ VIP</span>)}
      </div>
      <h4 className="text-[15px] font-black leading-tight mb-2" style={{ direction: 'rtl' }}>{garage.name}</h4>
      <div className="flex items-center gap-1 justify-end text-[11px] font-bold mb-3 text-slate-500" style={{ direction: 'rtl' }}><span>{garage.location}</span><MapPin size={11} /></div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200">
        <div className="flex items-center gap-1 text-xs font-black text-slate-500"><Navigation size={12} className="rotate-45" /><span>{formatDuration(garage.minutes)}</span></div>
        <div className="flex flex-col items-center"><span className="font-mono font-black text-[17px] text-green-600">{garage.basePrice}</span><span className="text-[9px] font-black text-slate-400 mt-1 uppercase">ج.م/ساعة</span></div>
      </div>
      <button type="button" disabled={isFull || disabled} onClick={!disabled && !isFull ? onSelect : undefined} className="w-full border-0 font-black py-3 rounded-2xl mt-4 text-sm text-white cursor-pointer shadow-sm" style={{ background: isDirectory ? BRAND.blueDark : isFull ? BRAND.border : BRAND.blue }}>
        {isDirectory ? 'افتح الاتجاهات 🗺️' : isFull ? 'ممتلئ' : 'احجز الآن'}
      </button>
    </motion.div>
  );
});