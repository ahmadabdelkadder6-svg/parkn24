// src/components/GarageListScreen.tsx

import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Star, Search, Navigation, Locate, Plus, Receipt, MessageCircle,
  X, History, Gift, ChevronDown, QrCode, Copy, Edit3, Check, Minus, Menu,
  Wallet, AlertTriangle, Camera
} from 'lucide-react';
import { useStore, Garage, ParkingSession as Session, IncomingCar, normalizePlate, normalizePhone } from '../store';
import { calculateDistance, distanceToMinutes, classifyDistance, formatDuration } from '../utils/distance';
import TopUpWalletModal from './TopUpWalletModal';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';

const BRAND = {
  blue: '#1656b8', blueDark: '#0f3d85', green: '#8cc63f', greenDark: '#6ea62a',
  bg: '#f1f5f9', card: '#ffffff', slate: '#334155', border: '#cbd5e1', borderDark: '#94a3b8', navy: '#0a1628',
};

interface GarageWithDistance extends Garage { distance: number; minutes: number; classification: 'nearby' | 'far'; }
interface Radar { id: string; lat: number; lng: number; camera_type: string; speed_limit: number; }
interface RadarAlert { radar: Radar; distanceMeters: number; isCritical: boolean; }
interface GarageCardProps { garage: GarageWithDistance; index: number; onSelect: () => void; onReportPrice: (garage: GarageWithDistance) => void; isNearby: boolean; isClosest: boolean; hasActiveSession: boolean; hasIncomingCar: boolean; disabled: boolean; }

const safeParseTime = (value: unknown): number => {
  if (!value) return 0;
  if (typeof value === 'string') { const ms = new Date(value).getTime(); return Number.isFinite(ms) && ms > 0 ? ms : 0; }
  if (typeof value === 'number') { return value < 1_000_000_000_000 ? value * 1000 : value; }
  return 0;
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
  'مناطق أخرى': '📍',
};

const AREA_CENTERS: Record<string, { lat: number; lng: number; maxRadiusKm: number }> = {
  'وسط البلد': { lat: 30.0444, lng: 31.2357, maxRadiusKm: 4.5 },
  'الزمالك': { lat: 30.0634, lng: 31.2195, maxRadiusKm: 3.0 },
  'مصر الجديدة': { lat: 30.0915, lng: 31.3210, maxRadiusKm: 6.0 },
  'مدينة نصر': { lat: 30.0566, lng: 31.3468, maxRadiusKm: 7.0 },
  'المعادي': { lat: 29.9602, lng: 31.2569, maxRadiusKm: 6.5 },
  'المهندسين': { lat: 30.0544, lng: 31.2007, maxRadiusKm: 4.0 },
  'الدقي': { lat: 30.0378, lng: 31.2058, maxRadiusKm: 3.5 },
  'التجمع الخامس': { lat: 30.0074, lng: 31.4340, maxRadiusKm: 12.0 },
  'شيراتون المطار': { lat: 30.1146, lng: 31.3848, maxRadiusKm: 4.5 },
  'الرحاب ومدينتي': { lat: 30.0885, lng: 31.5510, maxRadiusKm: 15.0 },
  'الشيخ زايد': { lat: 30.0245, lng: 30.9925, maxRadiusKm: 7.5 },
  '6 أكتوبر': { lat: 29.9725, lng: 30.9438, maxRadiusKm: 15.0 },
  'المقطم': { lat: 30.0095, lng: 31.3078, maxRadiusKm: 5.0 },
  'المنيل': { lat: 30.0245, lng: 31.2285, maxRadiusKm: 3.0 },
  'الجيزة': { lat: 30.0105, lng: 31.2078, maxRadiusKm: 6.0 },
  'حدائق الأهرام': { lat: 29.9725, lng: 31.1180, maxRadiusKm: 5.5 },
  'المريوطية والمنصورية': { lat: 29.9889, lng: 31.1341, maxRadiusKm: 6.0 },
  'الكيت كات': { lat: 30.0665, lng: 31.2142, maxRadiusKm: 3.0 },
  'إمبابة والوراق': { lat: 30.0782, lng: 31.2264, maxRadiusKm: 5.0 },
  'أرض اللواء': { lat: 30.0625, lng: 31.1942, maxRadiusKm: 3.0 },
  'الوايلي والعباسية': { lat: 30.0682, lng: 31.2845, maxRadiusKm: 4.5 },
  'الزيتون والمطرية': { lat: 30.1185, lng: 31.3142, maxRadiusKm: 5.0 },
  'حدائق القبة': { lat: 30.0865, lng: 31.2885, maxRadiusKm: 4.0 },
  'جسر السويس': { lat: 30.1285, lng: 31.3410, maxRadiusKm: 8.0 },
  'شبرا ورمسيس': { lat: 30.0812, lng: 31.2465, maxRadiusKm: 5.5 },
  'شبرا الخيمة': { lat: 30.1235, lng: 31.2445, maxRadiusKm: 6.0 },
  'مصر القديمة': { lat: 30.0085, lng: 31.2505, maxRadiusKm: 5.0 },
  'مدينة الشروق': { lat: 30.1385, lng: 31.6210, maxRadiusKm: 10.0 },
  'حلوان': { lat: 29.8495, lng: 31.3342, maxRadiusKm: 12.0 },
  'الساحل الشمالي': { lat: 30.9145, lng: 28.7428, maxRadiusKm: 150.0 },
  'مدن القناة': { lat: 30.5989, lng: 32.2841, maxRadiusKm: 90.0 },
  'العين السخنة': { lat: 29.6258, lng: 32.3541, maxRadiusKm: 40.0 },
};

const CATEGORIES = [
  { id: 'hotels', label: 'فنادق', icon: '🏨' },
  { id: 'hospitals', label: 'مستشفيات', icon: '🏥' },
  { id: 'traffic', label: 'مرور', icon: '🚔' },
  { id: 'markets', label: 'أسواق', icon: '🛒' },
  { id: 'cafes', label: 'كافيهات/كورنيش', icon: '☕' },
  { id: 'malls', label: 'مولات/بلازا', icon: '🛍️' },
];

// 🎵 محرك الصوت (Web Audio API) - نغمة تبية رادار كلاسيكية
let audioCtx: AudioContext | null = null;

const playRadarTone = (type: string, isCritical: boolean) => {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const ctx = audioCtx;
    const now = ctx.currentTime;

    // نمط التبية:
    // - تحذير بعيد (أصفر): تبية-تبية بطيئة
    // - خطر قريب (أحمر): تبية سريعة ومتكررة
    const beepCount = isCritical ? 6 : 4;
    const beepDuration = isCritical ? 0.09 : 0.12;   // طول التبية الواحدة
    const gap = isCritical ? 0.07 : 0.16;            // المسافة بين التبات
    const baseFreq = isCritical ? 1350 : 980;        // تردد أعلى = إحساس أخطر
    const volume = isCritical ? 0.32 : 0.22;

    for (let i = 0; i < beepCount; i++) {
      const startAt = now + i * (beepDuration + gap);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // square = صوت تبية حاد وواضح زي أجهزة الرادار
      osc.type = 'square';
      osc.frequency.setValueAtTime(baseFreq, startAt);

      // تبية في الأول والآخر أقوى شوية (Accent)
      const isEdge = i === 0 || i === beepCount - 1;
      const beepVol = isEdge ? volume * 1.25 : volume;

      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(beepVol, startAt + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + beepDuration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startAt);
      osc.stop(startAt + beepDuration + 0.02);
    }

    // في الحالة الحرجة: صافرة قصيرة إضافية في الآخر للتأكيد
    if (isCritical) {
      const endAt = now + beepCount * (beepDuration + gap) + 0.05;
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();

      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(1500, endAt);
      osc2.frequency.exponentialRampToValueAtTime(900, endAt + 0.22);

      gain2.gain.setValueAtTime(0.0001, endAt);
      gain2.gain.exponentialRampToValueAtTime(0.28, endAt + 0.02);
      gain2.gain.exponentialRampToValueAtTime(0.0001, endAt + 0.22);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(endAt);
      osc2.stop(endAt + 0.25);
    }
  } catch (e) {
    console.warn('Audio Context Blocked:', e);
  }

};export default function GarageListScreen() {
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
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>({ lat: 30.0444, lng: 31.2357 });
  const [locationLoading, setLocationLoading] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [isAbuseDetected, setIsAbuseDetected] = useState(false);
  const [expandedArea, setExpandedArea] = useState<string | null>(null);

  const [rescueIndex, setRescueIndex] = useState(0);
  const MAX_RESCUE_OPTIONS = 3;

  const [activeRadarAlert, setActiveRadarAlert] = useState<RadarAlert | null>(null);
  const radarsRef = useRef<Radar[]>([]);
  const lastAudioPlayRef = useRef<number>(0);

  const autoNavigatedRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const bestAccuracyRef = useRef<number>(Infinity);
  const watchIdRef = useRef<number | null>(null);
  const speedHistoryRef = useRef<number[]>([]);
  const bearingHistoryRef = useRef<number[]>([]);
  const stopStartTimeRef = useRef<number | null>(null);
  const totalStopDurationRef = useRef<number>(0);

  useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; }; }, []);

  useEffect(() => {
    const fetchRadars = async () => {
      try {
        const { data } = await supabase
          .from('speed_cameras')
          .select('id, lat, lng, camera_type, speed_limit') 
          .limit(2000);
        if (data) radarsRef.current = data;
      } catch (err) { console.error('Error fetching radars:', err); }
    };
    fetchRadars();
  }, []);

  const normalizedUserPlate = useMemo(() => normalizePlate(currentUser?.carPlate), [currentUser?.carPlate]);
  const cleanUserPhone = useMemo(() => currentUser?.phone ? normalizePhone(currentUser.phone) : '', [currentUser?.phone]);

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
      } catch (err) { console.error('Error verifying welcome gift eligibility:', err); }
    };
    checkAbuseHistory();
  }, [currentUser, sessions, cleanUserPhone]);

  const isEligibleForFreeSession = useMemo(() => currentUser && !currentUser.hasUsedFreeSession && !isAbuseDetected, [currentUser, isAbuseDetected]);

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

        // 🔴 تخطي حسابات التحديث الفعلي لتجنب إلغاء المحاكاة
        if ((window as any).isTestingRadar) {
            setLocationLoading(false);
            return;
        }

        const newLat = position.coords.latitude;
        const newLng = position.coords.longitude;
        const newAccuracy = position.coords.accuracy || 10;
        const rawSpeed = position.coords.speed || 0;
        const rawHeading = position.coords.heading || 0;
        const speedKmh = rawSpeed * 3.6;
        
        speedHistoryRef.current.push(speedKmh);
        if (speedHistoryRef.current.length > 10) speedHistoryRef.current.shift();
        if (rawHeading !== null) { bearingHistoryRef.current.push(rawHeading); if (bearingHistoryRef.current.length > 5) bearingHistoryRef.current.shift(); }
        
        if (speedKmh < 1.0) { 
            if (stopStartTimeRef.current === null) { stopStartTimeRef.current = Date.now(); } 
            else { totalStopDurationRef.current = Math.round((Date.now() - stopStartTimeRef.current) / 1000); } 
        } else { stopStartTimeRef.current = null; }

        if (radarsRef.current.length > 0 && speedKmh > 10) { 
            let minDistance = 500; 
            let closestRadarData: Radar | null = null;
            
            for (const radar of radarsRef.current) {
                const latDiff = Math.abs(radar.lat - newLat);
                const lngDiff = Math.abs(radar.lng - newLng);
                if (latDiff > 0.09 || lngDiff > 0.1) continue; 
                
                const dist = calculateDistance(newLat, newLng, radar.lat, radar.lng) * 1000;
                if (dist < minDistance) {
                    minDistance = dist;
                    closestRadarData = radar;
                }
            }
            
            if (closestRadarData && minDistance <= 500) {
                const isCritical = minDistance <= 100;
                setActiveRadarAlert({ radar: closestRadarData, distanceMeters: Math.round(minDistance), isCritical });
                
                const now = Date.now();
                const audioThrottle = isCritical ? 1000 : 3000; 
                if (now - lastAudioPlayRef.current > audioThrottle) {
                    playRadarTone(closestRadarData.camera_type, isCritical);
                    lastAudioPlayRef.current = now;
                }
            } else {
                setActiveRadarAlert(null);
            }
        } else {
            setActiveRadarAlert(null);
        }

        const isMoreAccurate = newAccuracy < bestAccuracyRef.current;
        let shouldUpdateUI = false;
        
        if (!lastLocationRef.current) { 
            shouldUpdateUI = true; 
        } else {
          const movedDist = calculateDistance(lastLocationRef.current.lat, lastLocationRef.current.lng, newLat, newLng) * 1000;
          if (movedDist >= 25 || (isMoreAccurate && (bestAccuracyRef.current - newAccuracy) > 10)) { 
              shouldUpdateUI = true; 
          }
        }
        
        if (shouldUpdateUI) { 
            lastLocationRef.current = { lat: newLat, lng: newLng }; 
            if (isMoreAccurate) { bestAccuracyRef.current = newAccuracy; } 
            setUserLocation({ lat: newLat, lng: newLng }); 
        }
        
        setLocationLoading(false);
      },
      () => { if (!isMountedRef.current) return; setLocationLoading(false); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  const handleForceRefreshLocation = useCallback(() => {
    try { if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {}

    if ((window as any).isTestingRadar) return;
    (window as any).isTestingRadar = true;

    setActiveRadarAlert({
      radar: { id: 'test', lat: 30.0444, lng: 31.2357, camera_type: 'speed', speed_limit: 90 },
      distanceMeters: 300,
      isCritical: false
    });
    playRadarTone('speed', false);
    toast('🟡 رادار تجريبي من بعيد...', { icon: '📡', id: 'radar-test' });

    setTimeout(() => {
      if (!(window as any).isTestingRadar) return;
      setActiveRadarAlert({
        radar: { id: 'test', lat: 30.0444, lng: 31.2357, camera_type: 'speed', speed_limit: 90 },
        distanceMeters: 60,
        isCritical: true
      });
      playRadarTone('speed', true);
      toast('🔴 رادار قريب جداً!', { icon: '⚠️', id: 'radar-test' });
    }, 4000);

    setTimeout(() => {
      setActiveRadarAlert(null);
      (window as any).isTestingRadar = false;
      toast.success('عديت الرادار بسلام 🏁', { id: 'radar-test' });
      
      lastLocationRef.current = null;
      bestAccuracyRef.current = Infinity;
      getUserLocation();
    }, 8000);
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
    if (locationLoading || !userLocation.lat) return [];
    const vipNearby = garagesWithDistance.filter((g) => g.garageType === 'vip' && g.availableSpots > 0 && g.minutes <= 5 && g.isActive !== false);
    const directoryNearby = garagesWithDistance.filter((g) => g.garageType === 'directory' && g.minutes <= 5 && g.isActive !== false);
    return [...vipNearby, ...directoryNearby].slice(0, MAX_RESCUE_OPTIONS);
  }, [garagesWithDistance, locationLoading, userLocation]);

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

  const matchesCategory = useCallback((garage: GarageWithDistance, catId: string): boolean => {
    const name = (garage.name || '').toLowerCase(); const loc = (garage.location || '').toLowerCase(); const user = (garage.username || '').toLowerCase(); const text = `${name} ${loc} ${user}`;
    switch (catId) {
      case 'hotels': return /فندق|هيلتون|سوفيتيل|ماريوت|شيراتون|فيرمونت|راديسون|kempinski|hotel|triumph plaza/.test(text);
      case 'hospitals': return /مستشفى|عيادات|طبي|الشفاء|الدمرداش|أبو الريش|الأورمان|حسبو|الندا|الشرطة|الجو|hosp|clinics|medical/.test(text);
      case 'traffic': return /مرور|تراخيص|فحص|نيابة|traffic/.test(text);
      case 'markets': return /سوق|وكالة|المناصرة|البرابرة|السبتية|الجمعة|الحرفيين|سنان|الغورية|الموسكي|خضار|فاكهة|سمك|market/.test(text);
      case 'cafes': return /ممشى|كورنيش|كافيه|مطعم|سهرة|بلاتفورم|النرجس|بغداد|الأهرام|سفيرة|الجزيرة|أبو الفدا|salah_eldin|cafe|restaurant|the platform|waterway/.test(text);
      case 'malls': return /مول|بلازا|سكوير|سيتي|وتر واي|waterway|أركان|arkan|park|جنينة|stars|point90|dandy|mall|gate|avenue/.test(text);
      default: return false;
    }
  }, []);

  const filteredGarages = useMemo(() => {
    let filtered = garagesWithDistance;
    filtered = filtered.filter((g) => g.garageType === activeTab);
    if (selectedCategory) { filtered = filtered.filter((g) => matchesCategory(g, selectedCategory)); }
    if (search.trim()) { const q = search.trim().toLowerCase(); filtered = filtered.filter((g) => g.name.toLowerCase().includes(q) || g.location.toLowerCase().includes(q) || (g.area || '').toLowerCase().includes(q)); }
    if (showNearbyOnly) { filtered = filtered.filter((g) => g.classification === 'nearby'); }
    return filtered;
  }, [garagesWithDistance, search, showNearbyOnly, activeTab, selectedCategory, matchesCategory]);

  const areaGroups = useMemo(() => {
    const groups: Record<string, GarageWithDistance[]> = {};
    filteredGarages.forEach(g => { const zone = (g as any).area || 'مناطق أخرى'; if (!groups[zone]) groups[zone] = []; groups[zone].push(g); });
    return Object.keys(groups).map(name => ({ name, garages: groups[name], totalCapacity: groups[name].reduce((sum, g) => sum + (g.capacity || 0), 0) })).sort((a, b) => { if (a.name === 'مناطق أخرى') return 1; if (b.name === 'مناطق أخرى') return -1; return a.name.localeCompare(b.name, 'ar'); });
  }, [filteredGarages]);

  useEffect(() => { if (search.trim() && areaGroups.length > 0) setExpandedArea(areaGroups[0].name); }, [search, areaGroups]);

  const handleGarageClick = async (garage: GarageWithDistance) => {
    if (garage.garageType === 'directory') {
      const areaCenter = AREA_CENTERS[garage.area || ''];
      let isLocationBroken = false;
      if (areaCenter) { const distanceFromCenterKm = calculateDistance(garage.lat, garage.lng, areaCenter.lat, areaCenter.lng); if (distanceFromCenterKm > areaCenter.maxRadiusKm) { isLocationBroken = true; supabase.from('garage_arrival_telemetry').insert({ garage_id: garage.id, user_phone: cleanUserPhone || '00000000000', lat: garage.lat, lng: garage.lng, accuracy: 999 }).then(() => {}).catch(() => {}); } }
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
      // ✅ تم إزالة setSearch('') و setExpandedArea(null) للحفاظ على حالة البحث للمستخدم
      toast.success(`رحلة سعيدة! جاري توجيهك إلى ${garage.name} 🧭`, { icon: '🚙' });
      return;
    }
    if (!currentUser) { toast.error('سجل بياناتك أولاً'); return; }
    if (activeSession) { setSelectedGarageId(activeSession.garageId); setScreen('session'); return; }
    if (myIncomingCar) { setSelectedGarageId(myIncomingCar.garageId); setScreen('navigation'); return; }
    if (offers.some((o) => o.userId === currentUser.phone && o.status === 'pending')) { toast.error('لديك عرض معلق بالفعل'); return; }
    if (garage.availableSpots <= 0) { toast.error('لا توجد أماكن متاحة حالياً'); return; }
    const userWallet = currentUser.wallet || 0;
    if (garage.payment_mode === 'wallet' && userWallet < garage.basePrice && !isEligibleForFreeSession) { toast.error(`عذراً، هذا الجراج يتطلب الدفع بالمحفظة. يرجى شحن محفظتك بمبلغ ${garage.basePrice} ج.م على الأقل للمتابعة.`); setShowTopUp(true); return; }
    try {
      setIsBooking(true); setSelectedGarageId(garage.id);
      await addIncomingCar({ garageId: garage.id, carPlate: currentUser.carPlate, customerName: currentUser.name, customerPhone: currentUser.phone, agreedPrice: garage.basePrice, estimatedArrival: Math.max(3, garage.minutes) });
      toast.success(`تم الحجز بنجاح 🚗`); setScreen('navigation');
    } catch (e) { console.error(e); toast.error('حدث خطأ أثناء إتمام الحجز'); } finally { setIsBooking(false); }
  };

  const handleConfirmArrival = useCallback(async () => {
    if (!activeDirectoryTrip) return;
    const tripToCalibrate = activeDirectoryTrip; 
    
    // ✅ إغلاق شاشة الرحلة مع ضمان البقاء في تبويب الدليل المجاني
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
      
      {/* 🚨 نافذة الرادار الثابتة (Fixed) مع z-index عالي جداً */}
      <AnimatePresence>
        {activeRadarAlert && (
          <motion.div
            initial={{ opacity: 0, y: -100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -100 }}
            className={`fixed top-6 left-4 right-4 z-[99999] p-4 rounded-2xl shadow-2xl flex items-center justify-between border-2 transition-colors duration-300 pointer-events-none ${
              activeRadarAlert.isCritical 
                ? 'bg-red-600/95 border-white backdrop-blur-md shadow-red-900/50' 
                : 'bg-amber-500/95 border-slate-900 text-slate-950 backdrop-blur-md shadow-amber-900/30'
            }`}
            style={{ direction: 'rtl' }}
          >
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl flex items-center justify-center ${activeRadarAlert.isCritical ? 'bg-white/20 text-white' : 'bg-black/10 text-slate-950'}`}>
                <Camera className="w-8 h-8 animate-pulse" />
              </div>
              <div>
                <div className={`font-black text-lg leading-tight ${activeRadarAlert.isCritical ? 'text-white' : 'text-slate-950'}`}>
                  {activeRadarAlert.radar.camera_type === 'speed' ? '⚡ رادار سرعة' : '📷 كاميرا إشارة/حزام'}
                </div>
                <div className={`text-sm font-extrabold opacity-90 mt-0.5 ${activeRadarAlert.isCritical ? 'text-white' : 'text-slate-950'}`}>
                  على بُعد {Math.round(activeRadarAlert.distanceMeters)} متر
                </div>
              </div>
            </div>

            {activeRadarAlert.radar.speed_limit && (
              <div className="w-14 h-14 rounded-full bg-white border-4 border-red-600 flex items-center justify-center shadow-md shrink-0">
                <span className="text-red-600 font-black text-xl dir-ltr">
                  {activeRadarAlert.radar.speed_limit}
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-4 pt-10 pb-3 z-20 shadow-sm relative" style={{ background: BRAND.card, borderBottom: `1.5px solid ${BRAND.border}` }}>
        <div dir="rtl" className="flex justify-between items-center mb-3.5">
          <div className="text-right flex flex-col gap-1.5">
            <span className="font-black text-xl block leading-none" style={{ color: BRAND.blue }}>بركن <span style={{ color: BRAND.green }}>24</span></span>
            <div className="flex flex-col mt-0.5">
              <span className="text-base font-black text-slate-900 block leading-tight">أهلاً {currentUser?.name?.split(' ')[0] || 'بك'} 👋</span>
              <span className="text-xs font-bold text-slate-500 block mt-1 leading-none">انزل وأنت رايق .. سيب الركنة علينا! ☕🚗</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={() => setShowQrModal(true)} className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer active:scale-90 transition-all bg-blue-50 border-[1.5px] border-blue-200"><QrCode size={18} style={{ color: BRAND.blue }} /></button>
            <button type="button" onClick={() => setShowSmartMenu(true)} className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer active:scale-90 transition-all relative bg-slate-100 border-[1.5px]" style={{ borderColor: BRAND.border }}>
              <Menu size={18} style={{ color: BRAND.blueDark }} />
              {pendingTopUpsCount > 0 && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-white" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl px-3 py-2 mb-2.5" style={{ background: BRAND.blue, boxShadow: '0 3px 10px rgba(22,86,184,0.18)', direction: 'rtl' }}>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={() => setShowTopUp(true)} className="flex items-center gap-1 font-black active:scale-95 transition-all text-[10px] cursor-pointer border-0" style={{ background: '#ffffff', color: BRAND.blue, borderRadius: 8, padding: '5px 9px' }}><Plus size={10} strokeWidth={3} /><span>شحن</span></button>
            <span className="font-mono font-black text-[11px] bg-white text-[#1656b8] px-2 py-1 rounded-lg tracking-wider">🚙 {currentUser?.carPlate || '---'}</span>
          </div>
          <div className="text-right">
            <span className="text-[8px] font-black text-white/80 block leading-none mb-0.5">💳 رصيدك الحالي</span>
            <span className="font-black font-mono text-white text-base leading-none">{currentUser?.wallet || 0} <span className="text-[10px]">ج.م</span></span>
          </div>
        </div>

        {isEligibleForFreeSession && !activeSession && !myIncomingCar && (
          <div dir="rtl" className="mb-2.5 py-1.5 px-3 rounded-xl flex items-center justify-between text-right border-[1.5px]" style={{ background: BRAND.green + '10', borderColor: BRAND.green + '50' }}>
            <div className="flex items-center gap-1.5"><Gift size={12} style={{ color: BRAND.greenDark }} className="shrink-0 animate-pulse" /><span className="text-[10px] font-black text-slate-900 leading-none">هديتك: <span style={{ color: BRAND.greenDark }}>أول 30 دقيقة مجاناً! 🎉</span></span></div>
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded text-white bg-green-600 shrink-0">نشط 🎁</span>
          </div>
        )}

        {/* 🌟 بانر "الركنة السريعة المنقذة" */}
        <AnimatePresence mode="wait">
          {currentRescueGarage && !activeSession && !myIncomingCar && (
            <motion.div
              key={currentRescueGarage.id}
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="mb-2.5 rounded-2xl cursor-pointer active:scale-98 transition-all border-2 text-right relative overflow-hidden"
              style={{
                background: currentRescueGarage.garageType === 'vip' 
                  ? 'linear-gradient(135deg, #1656b8 0%, #0f3d85 100%)'
                  : 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                borderColor: currentRescueGarage.garageType === 'vip' ? '#1656b8' : '#334155',
                boxShadow: currentRescueGarage.garageType === 'vip' 
                  ? '0 4px 15px rgba(22,86,184,0.3)' 
                  : '0 4px 15px rgba(15,23,42,0.4)',
              }}
              dir="rtl"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl pointer-events-none" />

              <div className="p-3.5 pb-2" onClick={() => handleGarageClick(currentRescueGarage)}>
                <div className="flex justify-between items-center">
                  <div className="text-right flex-1 pr-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded-lg animate-pulse text-white" style={{ background: currentRescueGarage.garageType === 'vip' ? '#8cc63f' : '#334155' }}>
                        {currentRescueGarage.garageType === 'vip' ? '⭐ حجز مضمون VIP' : '⚡ منقذ سريع'}
                      </span>
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded-lg bg-white/20 text-white">{rescueIndex + 1} / {rescueGaragesList.length}</span>
                    </div>
                    <h4 className="text-xs font-black text-white leading-tight mb-1">{currentRescueGarage.name}</h4>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-black text-emerald-300">💰 {currentRescueGarage.priceType === 'daily' ? `${currentRescueGarage.dailyPrice || currentRescueGarage.basePrice} ج.م/يوم` : `${currentRescueGarage.basePrice} ج.م/ساعة`}</span>
                      <span className="text-[10px] font-bold text-white/80">🚗 {formatDuration(currentRescueGarage.minutes)}</span>
                    </div>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0 text-white"><Navigation size={18} className="rotate-45 animate-bounce" /></div>
                </div>
              </div>

              {rescueGaragesList.length > 1 && (
                <button 
                  type="button" 
                  onClick={handleNextRescue} 
                  className="w-full py-3 text-[12px] font-black text-white bg-black/30 border-0 cursor-pointer active:bg-black/40 active:scale-[0.98] transition-all flex items-center justify-center gap-2 tracking-wide"
                  style={{ 
                    borderTop: '2px solid rgba(255,255,255,0.25)',
                    textShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    letterSpacing: '0.02em'
                  }}
                >
                  <Search size={14} strokeWidth={3} />
                  <span>{rescueIndex < rescueGaragesList.length - 1 ? '🔍 مش مناسب؟ ابحث عن ساحة أخرى' : '🔄 عرض الكل من الأول'}</span>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

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

        {/* ✅ حقل البحث المعزز بزر إزالة النص المضبوط عمودياً وزر الرادار */}
        <div className="flex gap-2 mb-2.5">
          <div className="relative flex-1">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input 
              type="text"
              className="w-full outline-none text-xs font-bold bg-slate-100 border border-slate-300 text-slate-800 rounded-xl transition-all focus:border-blue-500 focus:bg-white focus:shadow-sm" 
              style={{ padding: '9px 32px 9px 32px' }} 
              placeholder="ابحث باسم الجراج أو المنطقة..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
            />
            <AnimatePresence>
              {search ? (
                <div className="absolute left-2.5 inset-y-0 flex items-center z-10">
                  <motion.button 
                    initial={{ opacity: 0, scale: 0.5 }} 
                    animate={{ opacity: 1, scale: 1 }} 
                    exit={{ opacity: 0, scale: 0.5 }}
                    type="button" 
                    onClick={() => { setSearch(''); setExpandedArea(null); }} 
                    className="bg-slate-300 text-slate-600 rounded-full w-5 h-5 flex items-center justify-center cursor-pointer border-0 active:scale-90 hover:bg-slate-400 hover:text-white transition-all"
                  >
                    <X size={12} strokeWidth={3} />
                  </motion.button>
                </div>
              ) : null}
            </AnimatePresence>
          </div>
 
          <button 
            type="button" 
            onClick={handleForceRefreshLocation} 
            disabled={locationLoading} 
            className="flex items-center justify-center border-0 cursor-pointer shrink-0" 
            style={{ background: BRAND.blue, color: '#fff', borderRadius: 12, width: 36, height: 36 }}
            title="تحديث الموقع ورادار السرعة"
          >
            <Locate size={15} className={locationLoading ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={() => setShowNearbyOnly(!showNearbyOnly)} className="text-[10px] font-black px-2.5 rounded-xl cursor-pointer shrink-0" style={{ background: showNearbyOnly ? BRAND.blue : BRAND.card, color: showNearbyOnly ? '#fff' : BRAND.slate, border: `1.5px solid ${BRAND.border}` }}>{showNearbyOnly ? 'الكل' : 'القريب'}</button>
        </div>

        <div dir="rtl" className="flex gap-2 overflow-x-auto pb-2 scrollbar-none mb-3 w-full px-0.5" style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', justifyContent: 'flex-start' }}>
          <button type="button" onClick={() => setSelectedCategory(null)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black cursor-pointer border-[1.5px] transition-all shrink-0 active:scale-95 shadow-sm" style={{ background: selectedCategory === null ? BRAND.blue : '#ffffff', color: selectedCategory === null ? '#ffffff' : BRAND.slate, borderColor: selectedCategory === null ? BRAND.blue : BRAND.border, scrollSnapAlign: 'start' }}><span>💎 الكل</span></button>
          {CATEGORIES.map((cat) => { const isActive = selectedCategory === cat.id; return (<button key={cat.id} type="button" onClick={() => setSelectedCategory(isActive ? null : cat.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black cursor-pointer border-[1.5px] transition-all shrink-0 active:scale-95 shadow-sm" style={{ background: isActive ? BRAND.blue : '#ffffff', color: isActive ? '#ffffff' : BRAND.slate, borderColor: isActive ? BRAND.blue : BRAND.border, scrollSnapAlign: 'start' }}><span>{cat.icon}</span><span>{cat.label}</span></button>); })}
        </div>

        <div className="flex p-1 rounded-xl bg-slate-200/70" style={{ direction: 'rtl', border: '1.5px solid #cbd5e1' }}>
          <button type="button" onClick={() => { setActiveTab('vip'); setExpandedArea(null); }} className="flex-1 py-2 rounded-lg font-black text-[11px] cursor-pointer border-0 transition-all flex items-center justify-center gap-1" style={{ background: activeTab === 'vip' ? BRAND.blue : 'transparent', color: activeTab === 'vip' ? '#ffffff' : BRAND.slate, boxShadow: activeTab === 'vip' ? '0 2px 8px rgba(22,86,184,0.25)' : 'none' }}><span>⭐ ركنات حجز مباشر VIP</span></button>
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
                    <div className="flex items-center gap-2 shrink-0"><span className="text-[11px] font-black font-mono px-2 py-1 rounded bg-slate-100" style={{ color: BRAND.slate }}>{totalGarages} {activeTab === 'vip' ? 'معتمد' : 'ساحات'}</span><ChevronDown size={16} style={{ color: BRAND.slate, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} /></div>
                    <div className="text-right"><span className="font-black text-sm block" style={{ color: BRAND.blueDark }}>{AREA_ICONS[group.name] || '📍'} {group.name}</span><span className="text-[10px] font-bold block mt-0.5" style={{ color: BRAND.slate }}>{activeTab === 'vip' ? '🚗 جراجات معتمدة للحجز المباشر' : '🧭 دليل ساحات الركن بالمنطقة'}</span></div>
                  </button>
                  {isExpanded && (
                    <div style={{ background: BRAND.bg, padding: '10px', borderTop: `1px solid ${BRAND.border}` }} className="space-y-2">
                      {(() => { const limit = visibleLimits[group.name] || 8; const displayedGarages = group.garages.slice(0, limit); const hasMore = group.garages.length > limit;
                        return (<>
                          {displayedGarages.map((garage, i) => (<GarageCard key={garage.id} garage={garage} index={i} onSelect={() => handleGarageClick(garage)} onReportPrice={handleOpenPriceReport} isNearby={garage.classification === 'nearby'} isClosest={i === 0 && garage.classification === 'nearby'} hasActiveSession={Boolean(activeSession)} hasIncomingCar={Boolean(myIncomingCar)} disabled={isBooking} />))}
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
          <div className="text-center py-16 text-slate-400"><span className="text-3xl block mb-2">🚗🔍</span><p className="text-xs font-bold leading-relaxed max-w-[240px] mx-auto">{selectedCategory ? `لا توجد نتائج تحت فئة "${CATEGORIES.find(c => c.id === selectedCategory)?.label}" في هذه المنطقة.` : 'لا توجد ساحات في الدليل، جرب البحث باسم منطقة أخرى!'}</p></div>
        )}
      </div>

      {/* ═══ القائمة الذكية الجانبية ═══ */}
      <AnimatePresence>
        {showSmartMenu && (
          <div className="fixed inset-0 z-[1500] flex items-end" style={{ background: 'rgba(10,22,40,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => setShowSmartMenu(false)}>
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 300 }} className="w-full max-w-md mx-auto bg-white rounded-t-[28px] p-5 pb-8" onClick={(e) => e.stopPropagation()}>
              <div className="w-10 h-1.5 rounded-full bg-slate-200 mx-auto mb-5" />
              <div className="flex justify-between items-center mb-4 pb-3 border-b-[1.5px]" style={{ borderColor: BRAND.border }}><button type="button" onClick={() => setShowSmartMenu(false)} className="text-slate-400 font-black text-sm border-0 bg-transparent cursor-pointer">✕</button><h3 className="font-black text-sm" style={{ color: BRAND.blueDark }}>⚙️ القائمة والخدمات</h3></div>
              <div className="space-y-2">
                <button type="button" onClick={() => { setShowSmartMenu(false); setShowTopUp(true); }} className="w-full flex items-center justify-between p-3.5 rounded-xl cursor-pointer active:scale-[0.98] transition-all bg-white border-[1.5px]" style={{ borderColor: BRAND.border }}><ChevronDown size={16} className="rotate-90 text-slate-400" /><div className="flex items-center gap-2.5"><div className="text-right"><span className="text-xs font-black block" style={{ color: BRAND.blueDark }}>شحن رصيد المحفظة</span><span className="text-[9px] font-bold text-slate-500">اشحن بـ إنستاباي أو فودافون كاش</span></div><div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center"><Wallet size={16} style={{ color: BRAND.blue }} /></div></div></button>
                {hasCompletedSession && (<button type="button" onClick={() => { setShowSmartMenu(false); setScreen('lastSession'); }} className="w-full flex items-center justify-between p-3.5 rounded-xl cursor-pointer active:scale-[0.98] transition-all bg-white border-[1.5px]" style={{ borderColor: BRAND.border }}><ChevronDown size={16} className="rotate-90 text-slate-400" /><div className="flex items-center gap-2.5"><div className="text-right"><span className="text-xs font-black block" style={{ color: BRAND.blueDark }}>إيصال آخر ركنة</span><span className="text-[9px] font-bold text-slate-500">عرض تفاصيل وحساب آخر جلسة</span></div><div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center"><Receipt size={16} style={{ color: BRAND.greenDark }} /></div></div></button>)}
                <button type="button" onClick={() => { setShowSmartMenu(false); setScreen('chat'); }} className="w-full flex items-center justify-between p-3.5 rounded-xl cursor-pointer active:scale-[0.98] transition-all bg-white border-[1.5px]" style={{ borderColor: BRAND.border }}><ChevronDown size={16} className="rotate-90 text-slate-400" /><div className="flex items-center gap-2.5"><div className="text-right"><span className="text-xs font-black block" style={{ color: BRAND.blueDark }}>الدعم والشكاوى</span><span className="text-[9px] font-bold text-slate-500">تواصل معنا في أي وقت 24 ساعة</span></div><div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center"><MessageCircle size={16} className="text-amber-600" /></div></div></button>
                
                {/* ✅ تم تحديث سجل المحفظة لعرض التاريخ والوقت هنا */}
                {myTopUps.length > 0 && (
                  <div className="pt-3 mt-3 border-t-[1.5px]" style={{ borderColor: BRAND.border }}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[9px] font-bold text-slate-400">آخر 3 عمليات</span>
                      <span className="text-[11px] font-black" style={{ color: BRAND.slate }}>📜 سجل الشحن</span>
                    </div>
                    <div className="space-y-2">
                      {myTopUps.map((topUp) => (
                        <div key={topUp.id} className="flex justify-between items-center text-right p-2.5 rounded-xl bg-slate-50 border-[1.5px]" style={{ borderColor: BRAND.border }}>
                          <div>
                            <span className="font-black text-[13px] text-slate-800 block mb-0.5">{topUp.amount} ج.م</span>
                            <span className="font-bold text-[10px] text-slate-500 block" dir="ltr">
                              {new Date(topUp.timestamp).toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <span className="font-black text-[10px] px-2 py-1.5 rounded-lg bg-white border border-slate-200 shadow-sm">
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
          <div className="fixed inset-0 z-[999] flex items-center justify-center p-5" style={{ background: 'rgba(10,22,40,0.75)', backdropFilter: 'blur(6px)' }} onClick={() => setShowQrModal(false)}>
            <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.85, opacity: 0 }} className="rounded-3xl p-6 text-center max-w-xs w-full shadow-2xl relative" style={{ background: BRAND.card }} onClick={e => e.stopPropagation()}>
              <button type="button" onClick={() => setShowQrModal(false)} className="absolute top-4 left-4 text-slate-400 font-black text-sm border-0 bg-transparent cursor-pointer">✕</button>
              <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2" style={{ background: BRAND.green + '20' }}><Gift size={20} style={{ color: BRAND.greenDark }} /></div>
              <h3 className="text-sm font-black mb-1" style={{ color: BRAND.blueDark }}>📲 شارك بركن 24 مع أصحابك</h3>
              <p className="text-[11px] font-bold mb-3 leading-relaxed" style={{ color: BRAND.slate }}>دليل وأماكن الركن الذكية في القاهرة بين إيديك! 🚗💨</p>
              <div className="w-44 h-44 mx-auto p-2 bg-white rounded-2xl border-2 shadow-inner flex items-center justify-center mb-3" style={{ borderColor: BRAND.blue }}><img src="/app-qr.png" alt="QR Code" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} /></div>
              <div className="space-y-2">
                <button type="button" onClick={async () => { const appUrl = window.location.origin; try { if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') { await navigator.clipboard.writeText(appUrl); } else { const textArea = document.createElement('textarea'); textArea.value = appUrl; textArea.style.position = 'fixed'; textArea.style.opacity = '0'; document.body.appendChild(textArea); textArea.select(); document.execCommand('copy'); document.body.removeChild(textArea); } toast.success('تم نسخ رابط التطبيق بنجاح! 📋🚀', { duration: 3000 }); } catch { toast.error('تعذر نسخ الرابط'); } }} className="w-full py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all border-0 text-white shadow-sm" style={{ background: BRAND.greenDark }}><Copy size={14} /><span>نسخ رابط التطبيق 🔗</span></button>
                <button type="button" onClick={() => setShowQrModal(false)} className="w-full py-2.5 rounded-xl font-bold text-xs text-slate-500 bg-slate-100 cursor-pointer active:scale-95 transition-all" style={{ border: `1.5px solid ${BRAND.border}` }}>إغلاق النافذة</button>
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
              
              {/* ✅ زر العودة الأخضر الواضح */}
              <button 
                type="button" 
                onClick={handleConfirmArrival} 
                className="w-full py-3.5 rounded-xl font-black text-sm text-white border-0 cursor-pointer active:scale-95 transition-all shadow-lg"
                style={{ background: BRAND.greenDark, boxShadow: '0 4px 15px rgba(110, 166, 42, 0.4)' }}
              >
                🏁 وصلت بالسلامة / العودة للرئيسية
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <WelcomeGiftModal />
    </div>
  );
}

function WelcomeGiftModal() {
  const [show, setShow] = useState(false);
  const currentUser = useStore((s) => s.currentUser);
  useEffect(() => { const hasGiftFlag = localStorage.getItem('showWelcomeGift'); if (hasGiftFlag === 'true' && currentUser && !currentUser.hasUsedFreeSession) { setShow(true); } else { localStorage.removeItem('showWelcomeGift'); setShow(false); } }, [currentUser]);
  const handleClose = () => { localStorage.removeItem('showWelcomeGift'); setShow(false); };
  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-5" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }} onClick={handleClose}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="p-6 max-w-sm w-full text-center relative" style={{ background: BRAND.card, borderRadius: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }} onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: BRAND.green + '20' }}><Gift size={24} style={{ color: BRAND.greenDark }} /></div>
            <h3 className="text-lg font-black mb-1" style={{ color: BRAND.blueDark }}>🎁 ركنتك الأولى مجانية!</h3>
            <p className="text-xs font-bold leading-relaxed mb-4" style={{ color: BRAND.slate }}>نورت عائلة <span style={{ color: BRAND.blue }}>Park'n 24</span>. استمتع بأول 30 دقيقة مجاناً في الجراجات المعتمدة كهدية ترحيبية.</p>
            <button type="button" onClick={handleClose} className="w-full py-3 rounded-xl font-black border-0 cursor-pointer text-white text-xs" style={{ background: BRAND.blue }}>جاهز للبدء 🚀</button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

const GarageCard = memo(function GarageCard({ garage, index, onSelect, onReportPrice, isNearby, isClosest, hasActiveSession, hasIncomingCar, disabled }: GarageCardProps) {
  const isDirectory = garage.garageType === 'directory';
  const isBusy = hasActiveSession || hasIncomingCar;
  const isFull = !isDirectory && garage.availableSpots === 0;
  const btnBg = (() => { if (isDirectory) return BRAND.blueDark; if (isFull) return BRAND.border; if (isBusy) return BRAND.green; return BRAND.blue; })();
  const btnLabel = (() => { if (isDirectory) return 'افتح الاتجاهات على الخريطة 🗺️'; if (isFull) return 'ممتلئ'; if (hasActiveSession) return 'الجلسة النشطة ⚡'; if (hasIncomingCar) return 'الحجز النشط 📍'; return 'احجز الآن'; })();
  const displayPrice = (() => { if (garage.priceType === 'daily') return `${garage.dailyPrice || garage.basePrice}`; if (garage.priceType === 'monthly') return `${garage.monthlyPrice || 1500}`; return `${garage.basePrice}`; })();
  const priceUnit = (() => { if (garage.priceType === 'daily') return 'ج.م/يومي'; if (garage.priceType === 'monthly') return 'ج.م/شهري'; return 'ج.م/ساعة'; })();

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }} className="p-3.5 text-right relative bg-white rounded-2xl transition-all" style={{ border: `1.5px solid ${isDirectory ? BRAND.borderDark : BRAND.border}`, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      <div className="flex justify-between items-center mb-2 flex-wrap gap-1.5" style={{ direction: 'rtl' }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          {isDirectory ? (<span className="text-[9px] font-black px-2.5 py-0.5 rounded flex items-center gap-1" style={{ background: '#f1f5f9', color: '#334155', border: '1.5px solid #94a3b8' }}><span>🧭 دليل إرشاد الشارع</span></span>) : (<span className="flex items-center gap-0.5 text-[10px] font-black px-1.5 py-0.5 rounded" style={{ background: '#fef3c7', color: '#b45309' }}><Star size={8} fill="currentColor" /> {garage.rating || 4.5} ⭐ معتمد</span>)}
          {!isDirectory && garage.payment_mode === 'cash' && (<span className="text-[9px] font-black px-2 py-0.5 rounded" style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>💵 نقدي</span>)}
          {!isDirectory && garage.payment_mode === 'wallet' && (<span className="text-[9px] font-black px-2 py-0.5 rounded" style={{ background: '#f0f5ff', color: BRAND.blue, border: `1px solid ${BRAND.border}` }}>👝 محفظة</span>)}
          {!isDirectory && garage.payment_mode === 'both' && (<span className="text-[9px] font-black px-2 py-0.5 rounded" style={{ background: '#f0fdf4', color: BRAND.greenDark, border: `1px solid #bbf7d0` }}>💵👝 كاش ومحفظة</span>)}
          {isDirectory && (<span className="text-[9px] font-black px-2 py-0.5 rounded" style={{ background: '#f0fdf4', color: BRAND.greenDark }}>💵 دفع للسايس مباشرة</span>)}
        </div>
      </div>
      <div className="flex items-start justify-between gap-2 mb-2" style={{ direction: 'rtl' }}><h4 className="text-[15px] font-black leading-tight text-slate-950 flex-1">{garage.name}</h4></div>
      <div className="flex items-center gap-1 justify-end text-[11px] font-bold mb-3" style={{ color: BRAND.slate, direction: 'rtl' }}><span className="truncate max-w-[280px]">{garage.location}</span><MapPin size={11} style={{ color: BRAND.slate }} className="shrink-0" /></div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t-[1.5px]" style={{ borderColor: BRAND.border }}>
        <div className="flex items-center gap-1 text-xs font-black" style={{ color: BRAND.slate }}><Navigation size={12} className="rotate-45" /><span>{formatDuration(garage.minutes)}</span></div>
        <div className="flex items-center gap-4 text-right" style={{ direction: 'rtl' }}>
          {isDirectory && (<button type="button" onClick={(e) => { e.stopPropagation(); onReportPrice(garage); }} className="flex items-center gap-0.5 text-[10px] font-black border-0 bg-transparent cursor-pointer hover:underline p-1 rounded" style={{ color: BRAND.blue }}><Edit3 size={11} /><span>تعديل السعر</span></button>)}
          {!isDirectory && (<div className="flex flex-col items-center"><span className="font-mono font-black text-[17px] leading-none" style={{ color: BRAND.blue }}>{garage.availableSpots}</span><span className="text-[9px] font-black text-slate-400 mt-1 uppercase">مكان شاغر</span></div>)}
          <div className="flex flex-col items-center"><span className="font-mono font-black text-[17px] leading-none" style={{ color: BRAND.greenDark }}>{displayPrice}</span><span className="text-[9px] font-black text-slate-400 mt-1 uppercase">{priceUnit}</span></div>
        </div>
      </div>
      <button type="button" disabled={isFull || disabled} onClick={!disabled && !isFull ? onSelect : undefined} className="w-full border-0 font-black py-3 rounded-2xl mt-4 text-sm text-white cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-sm" style={{ background: btnBg }}><span>{btnLabel}</span></button>
    </motion.div>
  );
});