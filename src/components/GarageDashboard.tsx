import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Car, Clock, LogOut, Plus, CheckCircle, XCircle, Settings,
  Minus, Save, MapPin, Edit3, Navigation, Phone, CarFront, FileText,
  CalendarDays, Undo2, Shield, HardHat, Users, Percent, Building2, Gift,
  Search, X, CreditCard, Compass, AlertCircle, RefreshCw, Radio,
} from 'lucide-react';
import { useStore, pausePolling, normalizePlate, getServerNow } from '../store';
import { supabase } from '../lib/supabase';
import { calculateFullHours, calculateCost } from '../utils/pricing';
import { calculateDistance } from '../utils/distance';
import toast from 'react-hot-toast';
import { subscribeToPush } from '../lib/pushManager';

const UNDO_TIMEOUT_SECONDS = 30;
// 📍 أقصى مسافة مسموحة للسايس (250 متر حول الجراج)
const MAX_VALET_DISTANCE_METERS = 250;

interface UndoableSession {
  sessionId: string;
  localId: string;
  carPlate: string;
  price: number;
  addedAt: number;
}

interface DailyStat {
  garage_id: string;
  stat_date: string;
  total_sessions: number;
  manual_sessions: number;
  app_sessions: number;
  total_revenue: number;
  cash_revenue: number;
  instapay_revenue: number;
  wallet_revenue: number;
  cashwallet_revenue: number;
  confirmed_revenue: number;
  pending_revenue: number;
}

const toMs = (value: any): number => {
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

const formatElapsed = (totalSeconds: number): string => {
  if (totalSeconds < 0) totalSeconds = 0;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}س ${m}د ${s}ث`;
  if (m > 0) return `${m}د ${s}ث`;
  return `${s}ث`;
};

const getLocalToday = (): string => {
  const n = new Date(getServerNow());
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

const timestampToLocalDate = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatLocalDateArabic = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ar-EG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
};

const normalizeSearchPlate = (plate?: string): string => {
  return normalizePlate(plate);
};

let audioCtxInstance: AudioContext | null = null;
let audioCtxReady = false;

const initAudioContext = async (): Promise<AudioContext | null> => {
  try {
    if (!audioCtxInstance) {
      const A = window.AudioContext || (window as any).webkitAudioContext;
      if (!A) return null;
      audioCtxInstance = new A();
    }
    if (audioCtxInstance.state === 'suspended') await audioCtxInstance.resume();
    audioCtxReady = audioCtxInstance.state === 'running';
    return audioCtxInstance;
  } catch { return null; }
};

const getAudioCtx = (): AudioContext | null => {
  if (!audioCtxInstance) return null;
  if (audioCtxInstance.state === 'closed') {
    audioCtxInstance = null; audioCtxReady = false; return null;
  }
  return audioCtxInstance;
};

const setupAudioOnInteraction = () => {
  const events = ['touchstart', 'touchend', 'mousedown', 'keydown', 'click'];
  const handler = async () => {
    if (!audioCtxReady) {
      await initAudioContext();
      if (audioCtxReady) events.forEach(ev => document.removeEventListener(ev, handler));
    }
  };
  events.forEach(ev => document.addEventListener(ev, handler, { passive: true }));
};
setupAudioOnInteraction();

const vibrateDevice = () => {
  try { if ('vibrate' in navigator) navigator.vibrate([500, 150, 500, 150, 700]); } catch {}
};

const sendNotification = (title: string, body: string, tag: string) => {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(title, {
        body, icon: '/icons/icon-192x192.png', tag, requireInteraction: true, silent: false,
      });
      n.onclick = () => { window.focus(); n.close(); };
      setTimeout(() => n.close(), 30000);
    }
  } catch {}
};

const playFirstAlert = async () => {
  let ctx = getAudioCtx();
  if (!ctx || !audioCtxReady) ctx = await initAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    [
      { freq: 800, delay: 0, dur: 0.15 },
      { freq: 1000, delay: 0.2, dur: 0.15 },
      { freq: 1200, delay: 0.4, dur: 0.2 },
      { freq: 1400, delay: 1.5, dur: 0.4 },
    ].forEach(({ freq, delay, dur }) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.connect(g); g.connect(ctx!.destination);
      o.type = 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.5, ctx!.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.01, ctx!.currentTime + delay + dur);
      o.start(ctx!.currentTime + delay);
      o.stop(ctx!.currentTime + delay + dur + 0.05);
    });
  } catch {}
};

const fireNewCarAlert = (carPlate: string) => {
  playFirstAlert(); 
  vibrateDevice();
  sendNotification(
    '🚨 سيارة في الطريق!',
    `🚗 رقم السيارة: ${carPlate}`,
    `incoming-${carPlate}`,
  );
};

const playApproachingAlert = async () => {
  let ctx = getAudioCtx();
  if (!ctx || !audioCtxReady) ctx = await initAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    [
      { freq: 1000, delay: 0, dur: 0.2 },
      { freq: 1300, delay: 0.25, dur: 0.2 },
      { freq: 1600, delay: 0.5, dur: 0.3 },
      { freq: 1800, delay: 1.8, dur: 0.5 },
    ].forEach(({ freq, delay, dur }) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.connect(g); g.connect(ctx!.destination);
      o.type = 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.6, ctx!.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.01, ctx!.currentTime + delay + dur);
      o.start(ctx!.currentTime + delay);
      o.stop(ctx!.currentTime + delay + dur + 0.05);
    });
  } catch {}
};

const fireApproachingAlert = (carPlate: string) => {
  playApproachingAlert(); vibrateDevice();
  sendNotification(
    '🚗 سيارة على وشك الوصول!',
    `🚗 ${carPlate} - باقي أقل من دقيقتين ⏰`,
    `approaching-${carPlate}`,
  );
};

interface ActiveSessionCardProps {
  session: any;
  basePrice: number;
  undoableSession?: UndoableSession;
  onEndSession: (id: string, carPlate: string, cost: number, hours: number, minutes: number, source: 'app' | 'manual', agreedPrice?: number) => void;
  onUndo: (un: UndoableSession) => void;
  getUndoRemainingSeconds: (addedAt: number) => number;
}

const ActiveSessionCard = memo(function ActiveSessionCard({
  session: s,
  basePrice,
  undoableSession: un,
  onEndSession,
  onUndo,
  getUndoRemainingSeconds,
}: ActiveSessionCardProps) {
  const [, setLocalTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setLocalTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const st = toMs(s.startTime);
  const el = st > 0 ? Math.max(0, Math.floor((getServerNow() - st) / 1000)) : 0;
  const mins = Math.floor(el / 60);

  const isFreeApplied = s.isFirstFreeSession === true;
  const isFreeNow = isFreeApplied && el <= 1800;
  
  const hrs = isFreeNow ? 0 : calculateFullHours(el);
  const rate = Number(s.agreedPrice ?? basePrice);
  const cost = isFreeNow ? 0 : calculateCost(el, rate);

  const isM = s.source === 'manual';

  return (
    <div 
      style={{ 
        background: isM ? '#FFFBF5' : '#F4F9FF', 
        border: `1.5px solid ${isM ? '#FFD180' : '#A0C4FF'}`, 
        borderRadius: 16, 
        padding: '10px 12px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
      }}
      className="mb-2"
    >
      <div className="flex justify-between items-center mb-1.5">
        <div className="flex items-center gap-1 flex-wrap">
          <motion.span animate={{ scale: [1, 1.25, 1] }} transition={{ repeat: Infinity, duration: 1.5 }} className="rounded-full shrink-0" style={{ width: 8, height: 8, background: isM ? '#FF9500' : '#00CC66' }} />
          <span className="font-bold text-slate-500 font-mono" style={{ fontSize: 11 }}>{formatElapsed(el)} • {hrs}س</span>
          <span className="font-black text-white shrink-0" style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, background: isM ? '#FF9500' : '#0066FF' }}>{isM ? 'يدوي' : 'تطبيق'}</span>
          
          {isFreeApplied && (
            <span className="font-black flex items-center gap-0.5 shrink-0" style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, background: '#FFF3E0', color: '#E65100', border: '1px solid #FFE0B2' }}>
              <Gift size={10} /> {isFreeNow ? 'هدية ترحيبية نشطة 🎁' : 'انتهت الهدية الترحيبية'}
            </span>
          )}
        </div>
        <div className="font-black text-slate-900" style={{ fontSize: 16 }}>🚗 {s.carPlate}</div>
      </div>

      <div className="flex justify-between items-center" style={{ paddingTop: 4 }}>
        <div className="flex items-center gap-1.5">
          <button 
            onClick={() => onEndSession(s.id, s.carPlate, cost, hrs, mins, s.source, s.agreedPrice)} 
            className="active:scale-95 transition-all flex items-center justify-center font-black !text-white"
            style={{ 
              background: 'linear-gradient(135deg,#FF3333,#CC0000)', 
              padding: '8px 14px',
              borderRadius: 12, 
              fontSize: '11.5px',
              fontWeight: 900,
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              textShadow: '0 1px 2px rgba(0,0,0,0.35)'
            }}
          >
            إنهاء وتحصيل
          </button>
          {un && (
            <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} onClick={() => onUndo(un)} className="font-black flex items-center gap-1 active:scale-95 text-white" style={{ background: '#FF9500', padding: '8px 12px', borderRadius: 12, fontSize: 10, border: 'none' }}>
              <Undo2 size={12} /> ({getUndoRemainingSeconds(un.addedAt)}ث)
            </motion.button>
          )}
        </div>

        <div className="font-black text-left" style={{ fontSize: isFreeNow ? 11 : 15, color: isFreeNow ? '#FF9500' : '#00AA44' }}>
          {isFreeNow ? (
            <span className="flex items-center gap-0.5 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg shadow-sm">
              🎁 مجاناً (0ج)
            </span>
          ) : (
            <span className="font-mono">{cost} ج.م</span>
          )}
        </div>
      </div>
    </div>
  );
});

export default function GarageDashboard() {
  const {
    garages, currentGarageId, setCurrentGarageId, sessions, addSession, endSession,
    removeSession, offers, updateOffer, cancelOffer, updateGarage, incomingCars,
    removeIncomingCar, fetchAll, confirmRevenue, assignSessionToValet, adjustGarageSpots,
    getMyOwnedGarages,
  } = useStore();

  const [garageRole] = useState<'owner' | 'valet'>(
    () => (localStorage.getItem('garageRole') as 'owner' | 'valet') || 'owner',
  );
  const valetNumber = localStorage.getItem('valetNumber') || '';
  const isOwner = garageRole === 'owner';
  const isValet = garageRole === 'valet';

  const garage = garages.find(g => g.id === currentGarageId);

  // 📍🛰️ منظومة الـ Geofencing وتتبع موقع السياس
  const [valetDistanceMeters, setValetDistanceMeters] = useState<number | null>(null);
  const [isLocationDenied, setIsLocationDenied] = useState(false);
  const [isCheckingGPS, setIsCheckingGPS] = useState(true);
  const [valetsPresenceMap, setValetsPresenceMap] = useState<Record<string, any>>({});

  const presenceChannelRef = useRef<any>(null);

  // 📡 إرسال وتتبع موقع السايس لحظياً إلى السيرفر
  const trackValetPresence = useCallback((distMeters: number, inside: boolean) => {
    if (!presenceChannelRef.current || !isValet) return;
    try {
      presenceChannelRef.current.track({
        valetNumber,
        valetName: localStorage.getItem('valetName') || `سايس ${valetNumber}`,
        distanceMeters: distMeters,
        isInside: inside,
        updatedAt: getServerNow(),
      });
    } catch (e) {
      console.warn('Presence track error:', e);
    }
  }, [isValet, valetNumber]);

  const checkValetLocation = useCallback(() => {
    if (!isValet || !garage || !garage.lat || !garage.lng) {
      setIsCheckingGPS(false);
      return;
    }

    if (!('geolocation' in navigator)) {
      setIsLocationDenied(true);
      setIsCheckingGPS(false);
      return;
    }

    setIsCheckingGPS(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const uLat = position.coords.latitude;
        const uLng = position.coords.longitude;
        const distKm = calculateDistance(uLat, uLng, garage.lat, garage.lng);
        const distMeters = Math.round(distKm * 1000);
        const isInside = distMeters <= MAX_VALET_DISTANCE_METERS;

        setValetDistanceMeters(distMeters);
        setIsLocationDenied(false);
        setIsCheckingGPS(false);

        // إرسال التحديث لغرفة المالك
        trackValetPresence(distMeters, isInside);
      },
      (error) => {
        console.warn('GPS location error:', error);
        setIsLocationDenied(true);
        setIsCheckingGPS(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
    );
  }, [isValet, garage, trackValetPresence]);

  // 🛰️ اشتراك المالك والسايس في قناة البث المباشر للموقع (Presence Channel)
  useEffect(() => {
    if (!currentGarageId) return;

    const channelName = `garage_valets_live_${currentGarageId}`;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: isValet ? `valet_${valetNumber}` : `owner_${Date.now()}` } }
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setValetsPresenceMap(state);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && isValet) {
          checkValetLocation();
        }
      });

    presenceChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      presenceChannelRef.current = null;
    };
  }, [currentGarageId, isValet, valetNumber, checkValetLocation]);

  useEffect(() => {
    checkValetLocation();
    const interval = setInterval(checkValetLocation, 45000);
    return () => clearInterval(interval);
  }, [checkValetLocation]);

  const isValetOutsideGarage = useMemo(() => {
    if (!isValet) return false;
    if (isLocationDenied) return true;
    if (valetDistanceMeters === null) return false;
    return valetDistanceMeters > MAX_VALET_DISTANCE_METERS;
  }, [isValet, isLocationDenied, valetDistanceMeters]);

  // 📊 استخراج وتجهيز بيانات السياس الحية لشاشة المالك
  const activeValetsLocationStatus = useMemo(() => {
    if (!isOwner || !garage) return [];

    const valetsConfig = [
      { num: '1', name: (garage.valetName1 || '').trim() || 'سايس 1', active: (garage as any).valet1Active },
      { num: '2', name: (garage.valetName2 || '').trim() || 'سايس 2', active: (garage as any).valet2Active },
      { num: '3', name: (garage.valetName3 || '').trim() || 'سايس 3', active: (garage as any).valet3Active },
    ];

    return valetsConfig.map((v) => {
      const presenceKey = `valet_${v.num}`;
      const presenceEntry = valetsPresenceMap[presenceKey]?.[0];

      if (!presenceEntry) {
        return {
          ...v,
          status: 'offline' as const,
          label: 'غير متصل ⚪',
          distanceText: '---',
          isInside: false,
        };
      }

      const dist = presenceEntry.distanceMeters ?? 0;
      const isInside = presenceEntry.isInside === true;

      return {
        ...v,
        status: isInside ? ('inside' as const) : ('outside' as const),
        label: isInside ? 'متواجد 🟢' : 'خارج الجراج 🔴',
        distanceText: dist >= 1000 ? `${(dist / 1000).toFixed(1)} كم` : `${dist} م`,
        isInside,
        updatedAt: presenceEntry.updatedAt,
      };
    });
  }, [isOwner, garage, valetsPresenceMap]);

  const garageSessions = useMemo(
    () => sessions.filter(s => s.garageId === currentGarageId),
    [sessions, currentGarageId]
  );
  const currentValetNameLocal = localStorage.getItem('valetName') || '';

  const currentValetName =
    valetNumber === '1' ? garage?.valetName1 :
    valetNumber === '2' ? garage?.valetName2 :
    valetNumber === '3' ? garage?.valetName3 :
    '';

  const myValetNames = useMemo(() => {
    const names = new Set<string>();
    if (currentValetNameLocal) names.add(currentValetNameLocal.trim());
    if (currentValetName) names.add(currentValetName.trim());
    if (valetNumber) {
      names.add(`سايس ${valetNumber}`);
      names.add(`valet ${valetNumber}`);
    }
    return names;
  }, [currentValetNameLocal, currentValetName, valetNumber]);

  const garageValetNames = useMemo(() => {
    if (!garage) return [];
    return [
      (garage.valetName1 || '').trim(),
      (garage.valetName2 || '').trim(),
      (garage.valetName3 || '').trim(),
      'سايس 1', 'سايس 2', 'سايس 3'
    ].filter(Boolean);
  }, [garage]);

  const activeSessions = useMemo(() => {
    return garageSessions.filter(s => {
      if (s.status !== 'active') return false;
      const st = toMs(s.startTime);
      if (st <= 0) return false;
      const elapsedMs = getServerNow() - st;
      if (elapsedMs >= 24 * 60 * 60 * 1000) return false;
      return true;
    });
  }, [garageSessions]);

  const valetActiveSessions = useMemo(() => {
    if (!isValet) return activeSessions;
    const isActive =
      valetNumber === '1' ? garage?.valet1Active :
      valetNumber === '2' ? garage?.valet2Active :
      valetNumber === '3' ? garage?.valet3Active : false;
    if (!isActive) return [];

    return activeSessions;
  }, [activeSessions, isValet, valetNumber, garage]);

  const completedSessions = useMemo(
    () => garageSessions.filter(s => s.status === 'completed'),
    [garageSessions]
  );
  const garageOffers = useMemo(
    () => offers.filter(o => o.garageId === currentGarageId && o.status === 'pending'),
    [offers, currentGarageId]
  );
  const carsOnTheWay = useMemo(
    () => incomingCars.filter(c => c.garageId === currentGarageId && c.status === 'coming'),
    [incomingCars, currentGarageId]
  );

  const processedCarsRef = useRef<Set<string>>(new Set());
  const isEndingSessionRef = useRef(false);
  const prevIncomingIdsRef = useRef<Set<string>>(new Set());
  const prevOfferIdsRef = useRef<Set<string>>(new Set());
  const approachAlertedRef = useRef<Set<string>>(new Set());
  const audioInitializedRef = useRef(false);

  const [undoableSessions, setUndoableSessions] = useState<UndoableSession[]>([]);
  const [newCarPlate, setNewCarPlate] = useState('');
  const [newCarPrice, setNewCarPrice] = useState(garage?.basePrice || 15);
  const [showAddCar, setShowAddCar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  const [editPrice, setEditPrice] = useState(garage?.basePrice || 15);
  const [editSpots, setEditSpots] = useState(garage?.availableSpots || 0);
  const [editCapacity, setEditCapacity] = useState(garage?.capacity || 50);
  const [editPaymentMode, setEditPaymentMode] = useState<'cash' | 'wallet' | 'both'>(
    (garage?.payment_mode as 'cash' | 'wallet' | 'both') || 'both'
  );
  const [editValet1Name, setEditValet1Name] = useState(garage?.valetName1 || '');
  const [editValet1Pass, setEditValet1Pass] = useState(garage?.valetPassword1 || '');
  const [editValet2Name, setEditValet2Name] = useState(garage?.valetName2 || '');
  const [editValet2Pass, setEditValet2Pass] = useState(garage?.valetPassword2 || '');
  const [editValet3Name, setEditValet3Name] = useState(garage?.valetName3 || '');
  const [editValet3Pass, setEditValet3Pass] = useState(garage?.valetPassword3 || '');
  
  const [logDateFrom, setLogDateFrom] = useState(() => getLocalToday());
  const [logDateTo, setLogDateTo] = useState(() => getLocalToday());
  const [logPaymentFilter, setLogPaymentFilter] = useState<string>('all');
  
  const [confirmSession, setConfirmSession] = useState<{
    id: string; carPlate: string; cost: number; hours: number;
    minutes: number; source: 'app' | 'manual'; agreedPrice?: number;
  } | null>(null);
  
  const [confirmPaymentMethod, setConfirmPaymentMethod] = useState<string>('cash');
  
  const [garageDailyStats, setGarageDailyStats] = useState<DailyStat[]>([]);
  const [valetEditSpots, setValetEditSpots] = useState(false);
  const [selectedValetFilter, setSelectedValetFilter] = useState<string | null>(null);
  const [plateSearch, setPlateSearch] = useState('');

  const [showSwitcher, setShowSwitcher] = useState(false);
  const myGarages = useMemo(() => {
    if (!garage) return [];
    return getMyOwnedGarages(garage.ownerPhone || garage.phone || '');
  }, [getMyOwnedGarages, garage, garages]);

  useEffect(() => {
    if (!isValet || !currentGarageId) return;
    const currentValet = currentValetNameLocal || currentValetName || `سايس ${valetNumber}`;
    if (!currentValet) return;

    const unassignedCompletedSessions = sessions.filter(s => {
      if (s.garageId !== currentGarageId) return false;
      if (s.status !== 'completed') return false;
      if (s.source !== 'app') return false;
      
      const isToday = timestampToLocalDate(toMs(s.endTime || s.startTime)) === getLocalToday();
      const ab = ((s as any).addedBy || '').trim();
      return isToday && !ab;
    });

    unassignedCompletedSessions.forEach(s => {
      assignSessionToValet(s.id, currentValet);
    });
  }, [sessions, isValet, currentGarageId, currentValetNameLocal, currentValetName, valetNumber, assignSessionToValet]);

  const filteredValetActiveSessions = useMemo(() => {
    if (!plateSearch.trim()) return valetActiveSessions;
    const query = normalizeSearchPlate(plateSearch);
    return valetActiveSessions.filter(s => {
      const plate = normalizeSearchPlate(s.carPlate);
      return plate.includes(query);
    });
  }, [valetActiveSessions, plateSearch]);

  const fetchGarageDailyStats = useCallback(async () => {
    if (!currentGarageId) return;
    try {
      let q = supabase.from('daily_stats').select('*').eq('garage_id', currentGarageId);
      if (isValet) q = q.eq('stat_date', getLocalToday());
      else { if (logDateFrom) q = q.gte('stat_date', logDateFrom); if (logDateTo) q = q.lte('stat_date', logDateTo); }
      const { data, error } = await q;
      if (!error) setGarageDailyStats(data ?? []);
    } catch {}
  }, [currentGarageId, logDateFrom, logDateTo, isValet]);

  const fetchGarageDailyStatsRef = useRef(fetchGarageDailyStats);
  useEffect(() => { fetchGarageDailyStatsRef.current = fetchGarageDailyStats; }, [fetchGarageDailyStats]);
  useEffect(() => { fetchGarageDailyStats(); }, [fetchGarageDailyStats]);

  useEffect(() => {
    if (!currentGarageId) return;
    const channel = supabase
      .channel(`garage-realtime-${currentGarageId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `garage_id=eq.${currentGarageId}` }, async () => { await fetchAll(); await fetchGarageDailyStatsRef.current(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incoming_cars', filter: `garage_id=eq.${currentGarageId}` }, async () => { await fetchAll(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offers', filter: `garage_id=eq.${currentGarageId}` }, async () => { await fetchAll(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentGarageId, fetchAll]);

  useEffect(() => {
    const init = async () => {
      if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
      if (!audioInitializedRef.current) { await initAudioContext(); audioInitializedRef.current = true; }
    };
    init();
  }, []);

  useEffect(() => {
    if (!currentGarageId) return;
    const silentSync = async () => {
      try {
        await subscribeToPush(currentGarageId);
      } catch (e) {
        console.warn('Silent push sync error:', e);
      }
    };
    silentSync();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        silentSync();
        fetchAll();
        checkValetLocation();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [currentGarageId, fetchAll, checkValetLocation]);

  useEffect(() => {
    const ids = new Set(carsOnTheWay.map(c => c.id));
    carsOnTheWay.forEach(car => {
      if (!prevIncomingIdsRef.current.has(car.id) && !document.hidden) {
        fireNewCarAlert(car.carPlate);
        toast(`🚨 سيارة في الطريق!\n🚗 رقم السيارة: ${car.carPlate}`, { duration: 10000, icon: '🚨' });
      }
    });
    prevIncomingIdsRef.current.forEach(id => {
      if (!ids.has(id)) { approachAlertedRef.current.delete(id); try { if ('vibrate' in navigator) navigator.vibrate(0); } catch {} }
    });
    prevIncomingIdsRef.current = ids;
  }, [carsOnTheWay]);

  const [carsTick, setCarsTick] = useState(0);
  useEffect(() => {
    if (carsOnTheWay.length === 0) return;
    const i = setInterval(() => setCarsTick(t => t + 1), 15000);
    return () => clearInterval(i);
  }, [carsOnTheWay.length]);

  useEffect(() => {
    carsOnTheWay.forEach(car => {
      if (approachAlertedRef.current.has(car.id)) return;
      const s = toMs(car.startTime);
      const el = (getServerNow() - s) / 60000;
      const rem = Math.max(0, car.estimatedArrival - el);
      if (rem <= 2 && rem >= 0 && car.estimatedArrival > 2) {
        approachAlertedRef.current.add(car.id);
        if (!document.hidden) { fireApproachingAlert(car.carPlate); toast(`🚗 على وشك الوصول!\n${car.carPlate}`, { duration: 10000, icon: '⏰' }); }
      }
    });
  }, [carsOnTheWay, carsTick]);

  useEffect(() => {
    garageOffers.forEach(o => { if (!prevOfferIdsRef.current.has(o.id)) toast(`💰 عرض جديد!\n🚗 ${o.carPlate} - ${o.offeredPrice} ج.م/ساعة`, { duration: 8000, icon: '💰' }); });
    prevOfferIdsRef.current = new Set(garageOffers.map(o => o.id));
  }, [garageOffers]);

  useEffect(() => { return () => { try { if ('vibrate' in navigator) navigator.vibrate(0); } catch {} }; }, []);

  const getSessionRevenue = useCallback((s: any) => {
    if (s.totalPrice != null) return Number(s.totalPrice);
    if (s.endTime && s.startTime) {
      const elSeconds = Math.max(0, Math.floor((toMs(s.endTime) - toMs(s.startTime)) / 1000));
      const r = Number(s.agreedPrice ?? garage?.basePrice ?? 0);
      
      const isFreeNow = s.isFirstFreeSession === true && elSeconds <= 1800;
      return isFreeNow ? 0 : calculateCost(elSeconds, r);
    }
    return 0;
  }, [garage?.basePrice]);

  const getSessionCommission = useCallback((s: any) => {
    if (s.source !== 'app') return 0;
    const rev = getSessionRevenue(s);
    if (rev <= 0) return 0;
    const rate = garage?.commissionRate ?? 10;
    return Math.round((rev * rate / 100) * 100) / 100;
  }, [getSessionRevenue, garage?.commissionRate]);

  const getSessionNetRevenue = useCallback((s: any) => {
    const rev = getSessionRevenue(s);
    if (s.source !== 'app') return rev;
    const comm = getSessionCommission(s);
    return Math.round((rev - comm) * 100) / 100;
  }, [getSessionRevenue, getSessionCommission]);

  const getActiveCost = useCallback((s: any) => {
    const st = toMs(s.startTime);
    const el = st > 0 ? Math.max(0, Math.floor((getServerNow() - st) / 1000)) : 0;
    const r = Number(s.agreedPrice ?? garage?.basePrice ?? 0);
    if (el <= 0 || r <= 0) return 0;

    const isFreeNow = s.isFirstFreeSession === true && el <= 1800;
    return isFreeNow ? 0 : calculateCost(el, r);
  }, [garage?.basePrice]);

  const filteredCompleted = useMemo(() => {
    if (isValet) {
      const isActive =
        valetNumber === '1' ? garage?.valet1Active :
        valetNumber === '2' ? garage?.valet2Active :
        valetNumber === '3' ? garage?.valet3Active : false;
      if (!isActive) return [];
    }

    const today = new Date(getServerNow());
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;

    const boundaryFrom = logDateFrom ? new Date(`${logDateFrom}T00:00:00`).getTime() : 0;
    const boundaryTo = logDateTo ? new Date(`${logDateTo}T23:59:59.999`).getTime() : 0;

    return completedSessions.filter(s => {
      if (s.endTime) {
        const endMs = toMs(s.endTime);
        if (isValet) { 
          const isToday = endMs >= todayStart && endMs <= todayEnd;
          if (!isToday) return false; 
        } else { 
          if (boundaryFrom && endMs < boundaryFrom) return false; 
          if (boundaryTo && endMs > boundaryTo) return false; 
        }
      }
      
      if (logPaymentFilter !== 'all' && s.paymentMethod !== logPaymentFilter) return false;
      
      const addedBy = ((s as any).addedBy || '').trim();
      
      if (isValet) {
        const isMine = addedBy && myValetNames.has(addedBy);
        const isUnassignedApp = !addedBy && s.source === 'app';
        if (!isMine && !isUnassignedApp) return false;
      }      
      
      if (isOwner && selectedValetFilter) { 
        if (addedBy !== selectedValetFilter) return false; 
      }
      
      return true;
    });
  }, [completedSessions, logDateFrom, logDateTo, logPaymentFilter, isValet, isOwner, myValetNames, selectedValetFilter, valetNumber, garage]);

  const filteredStats = useMemo(() => {
    const c = filteredCompleted.filter(s => s.revenueConfirmed);
    const u = filteredCompleted.filter(s => !s.revenueConfirmed);
    const activeC = c.filter(s => !(s as any).settled);

    const cash = c.filter(s => s.paymentMethod === 'cash').reduce((a, s) => a + getSessionRevenue(s), 0);
    const instapay = c.filter(s => s.paymentMethod === 'instapay').reduce((a, s) => a + getSessionRevenue(s), 0);
    const wallet = c.filter(s => s.paymentMethod === 'wallet').reduce((a, s) => a + getSessionRevenue(s), 0);
    const cashwallet = c.filter(s => s.paymentMethod === 'cashwallet').reduce((a, s) => a + getSessionRevenue(s), 0);
    
    const manual = c.filter(s => s.source === 'manual');
    const app = c.filter(s => s.source === 'app');
    
    const totalCommission = c.reduce((a, s) => a + getSessionCommission(s), 0);
    const totalNet = c.reduce((a, s) => a + getSessionNetRevenue(s), 0);
    const confirmedTotal = cash + instapay + wallet + cashwallet;

    const activeWallet = activeC.filter(s => s.paymentMethod === 'wallet').reduce((a, s) => a + getSessionRevenue(s), 0);
    const activeCommission = activeC.reduce((a, s) => a + getSessionCommission(s), 0);

    return {
      cash, instapay, wallet, cashwallet,
      total: confirmedTotal,
      manualCount: manual.length, appCount: app.length,
      manualTotal: manual.reduce((a, s) => a + getSessionRevenue(s), 0),
      appTotal: app.reduce((a, s) => a + getSessionRevenue(s), 0),
      pendingRevenue: u.reduce((a, s) => a + getSessionRevenue(s), 0),
      pendingCount: u.length,
      totalCommission, totalNet,
      activeWallet, activeCommission,
    };
  }, [filteredCompleted, getSessionRevenue, getSessionCommission, getSessionNetRevenue]);

  const topCardConfirmedRevenue = useMemo(() => filteredStats.total, [filteredStats]);

  const valetReport = useMemo(() => {
    if (!garage || !isOwner || !currentGarageId) return [];
    const garageValets = [
      { name: (garage.valetName1 || '').trim() || 'سايس 1', defaultName: 'سايس 1', color: '#0066FF', icon: '🅿️1' },
      { name: (garage.valetName2 || '').trim() || 'سايس 2', defaultName: 'سايس 2', color: '#7C3AED', icon: '🅿️2' },
      { name: (garage.valetName3 || '').trim() || 'سايس 3', defaultName: 'سايس 3', color: '#FF8800', icon: '🅿️3' },
    ].filter(v => v.name);
    
    const ownerGarageCompleted = completedSessions.filter((s) => {
      if (s.garageId !== currentGarageId) return false;
      if (s.endTime) {
        const d = timestampToLocalDate(toMs(s.endTime));
        if (logDateFrom && d < logDateFrom) return false;
        if (logDateTo && d > logDateTo) return false;
      }
      if (logPaymentFilter !== 'all' && s.paymentMethod !== logPaymentFilter) return false;
      return true;
    });
    
    return garageValets.map((v) => {
      const vs = ownerGarageCompleted.filter((s) => {
        const addedBy = ((s as any).addedBy || '').trim();
        return addedBy === v.name || addedBy === v.defaultName;
      });
      const confirmed = vs.filter((s) => s.revenueConfirmed);
      const ac = confirmed.filter((s) => s.source === 'app');
      const mc = confirmed.filter((s) => s.source === 'manual');
      return {
        name: v.name, color: v.color, icon: v.icon, count: vs.length,
        appCount: ac.length, manualCount: mc.length,
        appTotal: ac.reduce((a, s) => a + getSessionRevenue(s), 0),
        manualTotal: mc.reduce((a, s) => a + getSessionRevenue(s), 0),
        total: confirmed.reduce((a, s) => a + getSessionRevenue(s), 0),
      };
    }).filter((v) => v.count > 0);
  }, [garage, isOwner, currentGarageId, completedSessions, logDateFrom, logDateTo, logPaymentFilter, getSessionRevenue]);

  const handleUndoSession = useCallback((un: UndoableSession) => {
    if (!garage) return;
    removeSession(un.sessionId);
    if (un.localId !== un.sessionId) removeSession(un.localId);
    const cs = useStore.getState().sessions;
    const ms = cs.find(s => s.carPlate === un.carPlate && s.source === 'manual' && s.status === 'active' && Math.abs(toMs(s.startTime) - un.addedAt) < 5000);
    if (ms) removeSession(ms.id);
    setUndoableSessions(p => p.filter(u => u.sessionId !== un.sessionId && u.localId !== un.localId));
    toast('تم إلغاء ' + un.carPlate + ' ↩️', { icon: '🔙' });
  }, [garage, removeSession]);

  const getUndoRemainingSeconds = useCallback((addedAt: number) => Math.max(0, UNDO_TIMEOUT_SECONDS - Math.floor((getServerNow() - addedAt) / 1000)), []);

  const [undoTick, setUndoTick] = useState(0);
  useEffect(() => {
    if (undoableSessions.length === 0) return;
    const i = setInterval(() => setUndoTick(t => t + 1), 5000);
    return () => clearInterval(i);
  }, [undoableSessions.length]);

  useEffect(() => {
    setUndoableSessions(p =>
      p.filter(u => Math.floor((getServerNow() - u.addedAt) / 1000) < UNDO_TIMEOUT_SECONDS)
        .map(u => {
          const e = sessions.find(s => s.id === u.sessionId);
          if (!e) { const n = sessions.find(s => s.carPlate === u.carPlate && s.source === 'manual' && s.status === 'active' && Math.abs(toMs(s.startTime) - u.addedAt) < 5000); if (n) return { ...u, sessionId: n.id }; }
          return u;
        }),
    );
  }, [undoTick, sessions]);

  if (!garage) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6" style={{ background: '#EBF2FF', color: '#0A1628' }}>
        <div style={{ background: '#fff', borderRadius: 28, padding: 32, textAlign: 'center', maxWidth: 360, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.08)', border: '2px solid #D0DCFF' }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>⏳</div>
          <h2 className="font-black" style={{ fontSize: 20, color: '#0A1628', marginBottom: 8 }}>جاري تحميل البيانات</h2>
          <p className="font-bold" style={{ fontSize: 13, color: '#7B8CA6', lineHeight: 1.8 }}>انتظر لحظة...</p>
        </div>
      </div>
    );
  }

  if (isValet) {
    const isActive =
      valetNumber === '1' ? (garage as any).valet1Active :
      valetNumber === '2' ? (garage as any).valet2Active :
      valetNumber === '3' ? (garage as any).valet3Active : false;
    if (!isActive) {
      return (
        <div className="h-full flex flex-col items-center justify-center px-6" style={{ background: '#EBF2FF', color: '#0A1628' }}>
          <div style={{ background: '#fff', borderRadius: 28, padding: 32, textAlign: 'center', maxWidth: 360, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.08)', border: '2px solid #FFD180' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🔒</div>
            <h2 className="font-black" style={{ fontSize: 20, color: '#0A1628', marginBottom: 8 }}>الحساب غير مُفعل</h2>
            <p className="font-bold" style={{ fontSize: 13, color: '#7B8CA6', lineHeight: 1.8, marginBottom: 20 }}>تم تعطيل هذا الحساب مؤقتًا من قبل مالك الجراج.<br />برجاء التواصل معه لإعادة التفعيل.</p>
            <div style={{ background: '#FFF8F0', borderRadius: 16, padding: 14, border: '1.5px solid #FFD180', marginBottom: 16 }}>
              <div className="font-black" style={{ fontSize: 15, color: '#0A1628' }}>{currentValetName || `سايس ${valetNumber}`}</div>
              <div className="font-bold" style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{garage.name}</div>
            </div>
            <button onClick={() => { localStorage.removeItem('garageRole'); localStorage.removeItem('valetNumber'); localStorage.removeItem('valetName'); setCurrentGarageId(null); }} className="w-full font-black active:scale-95" style={{ background: '#F0F4FF', color: '#475569', padding: 14, borderRadius: 18, fontSize: 13, border: '2px solid #D0DCFF' }}>تسجيل خروج</button>
          </div>
        </div>
      );
    }
  }

  // 🛑 قفل شاشة السايس إذا كان خارج نطاق الجراج
  if (isValet && isValetOutsideGarage) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6 text-center" style={{ background: '#0F172A', color: '#ffffff' }}>
        <div style={{ background: '#1E293B', borderRadius: 28, padding: 28, maxWidth: 360, width: '100%', border: '2px solid #EF4444', boxShadow: '0 10px 40px rgba(239, 68, 68, 0.2)' }}>
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center animate-bounce">
            <Compass size={36} />
          </div>

          <h2 className="text-white mb-2" style={{ fontSize: '20px', fontWeight: 950 }}>أنت خارج نطاق الجراج</h2>

          <p className="leading-relaxed mb-5" style={{ fontSize: '13px', color: '#FFFFFF', fontWeight: 950 }}>
            {isLocationDenied ? (
              <span>⚠️ يرجى تفعيل خدمة الموقع (GPS) في هاتفك وإعطاء الصلاحية للتطبيق للتأكد من تواجدك داخل الجراج لمتابعة العمل.</span>
            ) : (
              <span>حفاظاً على دقة الحسابات والأمان، لا يمكنك رؤية أو تسجيل جلسات الركن إلا أثناء التواجد الفعلي داخل موقع الجراج.</span>
            )}
          </p>

          {valetDistanceMeters !== null && !isLocationDenied && (
            <div className="mb-5 bg-slate-900 border border-slate-700 rounded-2xl p-4">
              <span className="block mb-1" style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800 }}>مسافتك الحالية عن الجراج:</span>
              <span className="font-mono text-amber-400 text-xl" style={{ fontWeight: 950 }}>
                {valetDistanceMeters >= 1000 ? `${(valetDistanceMeters / 1000).toFixed(1)} كم` : `${valetDistanceMeters} متر`}
              </span>
              <span className="block mt-1" style={{ fontSize: '10px', color: '#64748B', fontWeight: 700 }}>(المسموح به: حتى {MAX_VALET_DISTANCE_METERS} متر فقط)</span>
            </div>
          )}

          <div className="space-y-2">
            <button
              onClick={checkValetLocation}
              disabled={isCheckingGPS}
              className="w-full font-black py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg"
              style={{ fontWeight: 950, fontSize: '13px' }}
            >
              <RefreshCw size={14} className={isCheckingGPS ? 'animate-spin' : ''} />
              {isCheckingGPS ? 'جاري التحقق من موقعك...' : '🔄 تحديث الموقع الآن'}
            </button>

            <button
              onClick={() => {
                localStorage.removeItem('garageRole');
                localStorage.removeItem('valetNumber');
                localStorage.removeItem('valetName');
                setCurrentGarageId(null);
              }}
              className="w-full py-3 rounded-2xl bg-slate-800 text-slate-400 hover:text-white text-xs active:scale-95 transition-all"
              style={{ fontWeight: 800 }}
            >
              تسجيل خروج
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 🚀 دالة إضافة سيارة يدوياً
  const handleAddCar = async () => {
    if (!newCarPlate.trim()) { toast.error('أدخل رقم السيارة'); return; }
    const cp = newCarPlate.trim(); 
    const pr = newCarPrice; 
    const at = getServerNow();
    const startTimeISO = new Date(at).toISOString();
    
    const sid = await addSession({ 
      garageId: garage.id, 
      carPlate: cp, 
      startTime: startTimeISO, 
      status: 'active', 
      source: 'manual', 
      agreedPrice: pr, 
      addedBy: isValet ? (currentValetNameLocal || currentValetName || `سايس ${valetNumber}`) : '' 
    } as any);
    
    const fid = sid || `fallback-${at}`;
    setUndoableSessions(p => [...p, { sessionId: fid, localId: fid, carPlate: cp, price: pr, addedAt: at }]);
    toast.success(`تم إضافة السيارة بسعر ${pr} ج.م/ساعة`);
    setNewCarPlate(''); 
    setNewCarPrice(garage.basePrice); 
    setShowAddCar(false);
  };

  const openConfirmPayment = (sid: string, cp: string, cost: number, hrs: number, minutes: number, source: 'app' | 'manual', ap?: number) => {
    const sessionObj = activeSessions.find(s => s.id === sid);
    const isFreeApplied = sessionObj?.isFirstFreeSession === true;
    
    const st = sessionObj ? toMs(sessionObj.startTime) : 0;
    const el = st > 0 ? Math.max(0, Math.floor((getServerNow() - st) / 1000)) : 0;
    
    const isFreeNow = isFreeApplied && el <= 1800;
    const finalCost = isFreeNow ? 0 : (cost > 0 ? cost : getActiveCost(sessionObj));

    setConfirmSession({ 
      id: sid, 
      carPlate: cp, 
      cost: finalCost, 
      hours: isFreeNow ? 0 : hrs, 
      minutes, 
      source, 
      agreedPrice: ap 
    });

    setConfirmPaymentMethod('cash');
  };

  const handleConfirmPayment = async () => {
    if (!confirmSession || isEndingSessionRef.current) return;
    isEndingSessionRef.current = true;
    
    pausePolling(2000);
    
    try {
      const sc = { ...confirmSession }; 
      const sd = useStore.getState().sessions.find(s => s.id === sc.id);
      
      const pc = (isValet || sc.source === 'manual') ? 'cash' : (confirmPaymentMethod || 'cash');
      
      let freeMinutesApplied = 0;
      if (sd?.isFirstFreeSession === true) {
        const elapsedSeconds = Math.floor((getServerNow() - toMs(sd.startTime)) / 1000);
        if (elapsedSeconds <= 1800) {
          freeMinutesApplied = Math.floor(elapsedSeconds / 60);
        }
      }

      const currentValet = isValet 
        ? (currentValetNameLocal || currentValetName || `سايس ${valetNumber}`).trim() 
        : 'المالك';

      setConfirmSession(null);
      setUndoableSessions(p => p.filter(u => u.sessionId !== sc.id && u.localId !== sc.id));
      
      await endSession(sc.id, sc.cost, pc, freeMinutesApplied, currentValet);
      await fetchGarageDailyStats();
      
      const paymentText = pc === 'cash' ? 'نقداً (كاش)' : 'من المحفظة الرقمية';
      toast.success(`تم تحصيل ${sc.cost} ج.م ${paymentText} بنجاح بواسطة ${currentValet} ✅`);
    } catch (err: any) {
      console.error('Payment Error:', err);
      toast.error(err.message || 'فشلت عملية التحصيل، برجاء المحاولة مجدداً.');
    } finally { 
      pausePolling(0);
      setTimeout(() => { isEndingSessionRef.current = false; }, 800); 
    }
  };

  const handleSaveSettings = () => {
    updateGarage(garage.id, {
      basePrice: editPrice, 
      availableSpots: Math.min(editSpots, editCapacity), 
      capacity: editCapacity,
      payment_mode: editPaymentMode,
      valetName1: editValet1Name.trim(), valetPassword1: editValet1Pass.trim(),
      valetName2: editValet2Name.trim(), valetPassword2: editValet2Pass.trim(),
      valetName3: editValet3Name.trim(), valetPassword3: editValet3Pass.trim(),
    });
    toast.success('تم تحديث الإعدادات ⚡'); 
    setShowSettings(false);
  };

  const openSettings = () => {
    setEditPrice(garage.basePrice); 
    setEditSpots(garage.availableSpots); 
    setEditCapacity(garage.capacity);
    setEditPaymentMode((garage.payment_mode as 'cash' | 'wallet' | 'both') || 'both');
    setEditValet1Name(garage.valetName1 || ''); setEditValet1Pass(garage.valetPassword1 || '');
    setEditValet2Name(garage.valetName2 || ''); setEditValet2Pass(garage.valetPassword2 || '');
    setEditValet3Name(garage.valetName3 || ''); setEditValet3Pass(garage.valetPassword3 || '');
    setShowSettings(true);
  };

  const handleCarArrived = async (car: any) => {
    const carId: string = car.id; 
    const carPlate: string = car.carPlate;
    if (processedCarsRef.current.has(carId)) return;
    processedCarsRef.current.add(carId);
    
    pausePolling(2000);
    
    try {
      const np = normalizePlate(carPlate);
      const existing = useStore.getState().sessions.find(s => normalizePlate(s.carPlate) === np && s.status === 'active');
      if (existing) { 
        await removeIncomingCar(carId); 
        toast('الجلسة شغالة بالفعل ✅', { icon: '🚗' }); 
        return; 
      }
      
      const ro = offers.find(o => normalizePlate(o.carPlate) === np && (o.status === 'pending' || o.status === 'accepted'));
      if (ro) cancelOffer(ro.id);

      const startTimeISO = new Date(getServerNow()).toISOString();

      await addSession({ 
        garageId: garage.id, 
        carPlate: np, 
        startTime: startTimeISO, 
        status: 'active', 
        source: 'app', 
        agreedPrice: car.agreedPrice, 
        customerPhone: car.customerPhone, 
        customerName: car.customerName, 
        startedBy: 'garage', 
        incomingCarId: carId, 
        addedBy: isValet ? (currentValetNameLocal || currentValetName || `سايس ${valetNumber}`) : '' 
      } as any);
      
      await removeIncomingCar(carId);
      await supabase.from('incoming_cars').delete().eq('car_plate', np).eq('garage_id', garage.id);
      toast.success(`بدأ حساب ${carPlate} 🚗`);
    } catch (e) { 
      processedCarsRef.current.delete(carId); 
      toast.error('حدث خطأ، حاول مرة أخرى'); 
    } finally {
      pausePolling(0);
    }
  };

  const calculateRemainingTime = (st: number | string, em: number) =>
    Math.max(0, em - Math.floor((getServerNow() - toMs(st)) / 60000));

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#EBF2FF', color: '#0A1628', padding: 16 }}>

      {/* Header */}
      <div className="flex justify-between items-center mb-5 pt-14">
        <div className="flex gap-2 items-center">
          <button onClick={() => { localStorage.removeItem('garageRole'); localStorage.removeItem('valetNumber'); localStorage.removeItem('valetName'); setCurrentGarageId(null); }} className="active:scale-90" style={{ background: '#fff', padding: 14, borderRadius: 20, border: '2px solid #D0DCFF' }}>
            <LogOut size={20} style={{ color: '#64748b' }} />
          </button>

          {isOwner && myGarages.length > 1 && (
            <button
              onClick={() => setShowSwitcher(true)}
              className="active:scale-90 font-black flex items-center gap-1.5"
              style={{
                background: 'linear-gradient(135deg,#0066FF,#4D00FF)',
                color: '#fff',
                padding: '10px 14px',
                borderRadius: 16,
                fontSize: 11,
                boxShadow: '0 4px 14px rgba(0,102,255,0.25)'
              }}
            >
              <Building2 size={14} />
              <span>جراجاتي ({myGarages.length})</span>
            </button>
          )}
        </div>

        <div className="text-right flex-1 mr-3">
          <h2 className="font-black" style={{ fontSize: 20 }}>{garage.name}</h2>
          <div className="flex items-center gap-2 justify-end mt-1">
            <span className="font-bold flex items-center gap-1" style={{ fontSize: 10, padding: '4px 10px', borderRadius: 12, background: isOwner ? '#0066FF' : '#FF9500', color: '#fff' }}>
              {isOwner ? <><Shield size={10} /> مالك</> : <><HardHat size={10} style={{ color: '#fff' }} /> <span style={{ color: '#fff', fontWeight: 900 }}>سايس {valetNumber}</span> {currentValetName && <span style={{ color: '#fff', fontWeight: 900 }}> - {currentValetName}</span>}</>}
            </span>
            <p className="flex items-center gap-1" style={{ fontSize: 11, color: '#7B8CA6' }}><MapPin size={11} /> {garage.location}</p>
          </div>
        </div>
        {isOwner && <button onClick={openSettings} className="active:scale-90" style={{ background: '#0066FF', padding: 14, borderRadius: 20, color: '#fff' }}><Settings size={20} /></button>}
        {isValet && <div style={{ width: 48 }} />}
      </div>

      {/* 📡 شاشة تتبع موقع السياس الحية المدمجة والمبسطة لمالك الجراج */}
      {isOwner && activeValetsLocationStatus.length > 0 && (
        <div className="mb-4 bg-white border border-slate-200 rounded-3xl p-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-indigo-600 font-black text-[10px]">
              <Radio size={12} className="animate-pulse text-red-500" />
              <span>تتبع مباشر (GPS)</span>
            </div>
            <span className="font-black text-slate-850" style={{ fontSize: 11 }}>حالة السياس</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {activeValetsLocationStatus.map((v) => (
              <div
                key={v.num}
                className={`p-2 rounded-2xl border text-center flex flex-col justify-center items-center ${
                  v.status === 'inside'
                    ? 'bg-emerald-50/60 border-emerald-200'
                    : v.status === 'outside'
                    ? 'bg-rose-50/60 border-rose-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <span className="font-black text-[11px] text-slate-900 block truncate w-full">{v.name}</span>
                <span className="text-[9px] font-black text-slate-400 block mt-0.5">سايس {v.num}</span>
                <span
                  className={`text-[9px] font-black px-1.5 py-0.5 rounded-md mt-1 block w-fit ${
                    v.status === 'inside'
                      ? 'bg-emerald-600 text-white'
                      : v.status === 'outside'
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-300 text-slate-600'
                  }`}
                >
                  {v.status === 'inside' ? `🟢 ${v.distanceText}` : v.status === 'outside' ? `🔴 ${v.distanceText}` : '⚪ مغلق'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* سجل العمليات */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="font-bold" style={{ fontSize: 11, background: '#fff', padding: '6px 12px', borderRadius: 12, border: '2px solid #D0DCFF', color: '#7B8CA6' }}>{filteredCompleted.length} عملية</span>
          <h3 className="font-black flex items-center gap-2" style={{ fontSize: 15, color: '#334155' }}>{isValet ? 'سجل عملياتي اليوم' : 'سجل العمليات'} <FileText size={16} /></h3>
        </div>

        {isOwner && (
          <div className="mb-3" style={{ background: '#fff', borderRadius: 16, padding: '10px 12px', border: '1.5px solid #D0DCFF', boxShadow: '0 3px 10px rgba(0,102,255,0.03)' }}>
            <div className="flex items-center gap-1.5 mb-2">
              <input type="date" value={logDateFrom} onChange={e => setLogDateFrom(e.target.value)} className="flex-1 font-black outline-none text-center" style={{ background: '#F0F4FF', border: '1.5px solid #D0DCFF', padding: '7px 4px', borderRadius: 10, fontSize: 10, fontWeight: 900, color: '#0066FF' }} />
              <span className="font-black text-slate-400" style={{ fontSize: 11, fontWeight: 950 }}>←</span>
              <input type="date" value={logDateTo} onChange={e => setLogDateTo(e.target.value)} className="flex-1 font-black outline-none text-center" style={{ background: '#F0F4FF', border: '1.5px solid #D0DCFF', padding: '7px 4px', borderRadius: 10, fontSize: 10, fontWeight: 900, color: '#0066FF' }} />
              <CalendarDays size={16} style={{ color: '#0066FF' }} />
            </div>

            <div className="flex gap-1.5 mb-2">
              <button onClick={() => { setLogDateFrom(getLocalToday()); setLogDateTo(getLocalToday()); }} className="flex-1 active:scale-95" style={{ background: '#0066FF', color: '#ffffff', padding: '6px 0', borderRadius: 10, fontSize: 10, fontWeight: 950, textShadow: '0 1px 1px rgba(0,0,0,0.15)', boxShadow: '0 2px 8px rgba(0,102,255,0.2)', border: 'none' }}>📅 اليوم</button>
              <button onClick={() => { const d = new Date(getServerNow()); d.setDate(d.getDate() - 7); setLogDateFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); setLogDateTo(getLocalToday()); }} className="flex-1 active:scale-95" style={{ background: '#F0F4FF', color: '#334155', padding: '6px 0', borderRadius: 10, fontSize: 10, fontWeight: 950, border: '1.5px solid #D0DCFF' }}>آخر أسبوع</button>
              <button onClick={() => { const d = new Date(getServerNow()); d.setDate(1); setLogDateFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`); setLogDateTo(getLocalToday()); }} className="flex-1 active:scale-95" style={{ background: '#F0F4FF', color: '#334155', padding: '6px 0', borderRadius: 10, fontSize: 10, fontWeight: 950, border: '1.5px solid #D0DCFF' }}>هذا الشهر</button>
            </div>

            <div className="flex gap-1.5">
              {[
                { id: 'all', label: 'الكل', icon: '📊' }, 
                { id: 'cash', label: 'نقدي', icon: '💵' }, 
                { id: 'wallet', label: 'محفظة', icon: '👝' }
              ].map(f => {
                const isActive = logPaymentFilter === f.id;
                return (
                  <button key={f.id} onClick={() => setLogPaymentFilter(f.id)} className="flex-1 active:scale-95 transition-all" style={{ padding: '6px 0', borderRadius: 10, fontSize: 10, fontWeight: 950, background: isActive ? '#0066FF' : '#F8FAFF', color: isActive ? '#ffffff' : '#64748b', border: isActive ? 'none' : '1.5px solid #D0DCFF', textShadow: isActive ? '0 1px 1px rgba(0,0,0,0.15)' : 'none', boxShadow: isActive ? '0 2px 8px rgba(0,102,255,0.2)' : 'none' }}>
                    {f.icon} {f.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {isValet && (
          <div className="mb-4 text-center" style={{ background: '#EBF2FF', borderRadius: 18, padding: '10px 16px', border: '2px solid #D0DCFF' }}>
            <span className="font-black" style={{ fontSize: 12, color: '#0066FF' }}>📅 {formatLocalDateArabic(getLocalToday())} - عملياتي اليوم</span>
          </div>
        )}

        {isOwner && selectedValetFilter && (
          <div className="flex items-center justify-between mb-3" style={{ background: '#EBF2FF', borderRadius: 14, padding: '8px 12px', border: '1.5px solid #D0DCFF' }}>
            <button onClick={() => setSelectedValetFilter(null)} className="font-bold active:scale-95" style={{ fontSize: 10, color: '#FF3333' }}>✕ إلغاء الفلتر</button>
            <span className="font-black" style={{ fontSize: 11, color: '#0066FF' }}>🅿️ عمليات: {selectedValetFilter}</span>
          </div>
        )}

        {filteredCompleted.length > 0 && (
          <>
            {filteredStats.pendingCount > 0 && (
              <div className="mb-3 transition-all" style={{ background: 'linear-gradient(135deg,#FF9500,#FF7700)', borderRadius: 16, padding: '10px 14px', color: '#ffffff', boxShadow: '0 4px 14px rgba(255,119,0,0.22)' }}>
                <div className="flex justify-between items-center">
                  <div className="text-right flex-1">
                    <h3 className="font-black mb-1 flex items-center gap-1 justify-end text-white" style={{ fontSize: 12, fontWeight: 900, textShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                      ⏳ عمليات معلقة للتأكيد
                    </h3>
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className="font-black text-white" style={{ fontSize: 10, fontWeight: 900, background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 8 }}>
                        {filteredStats.pendingCount} عملية
                      </span>
                    </div>
                  </div>
                  {isOwner && (
                    <div className="text-left mr-4 shrink-0">
                      <div className="font-black font-mono leading-none text-white" style={{ fontSize: 20, fontWeight: 950, textShadow: '0 1.5px 3px rgba(0,0,0,0.15)' }}>
                        {filteredStats.pendingRevenue.toFixed(0)} <span style={{ fontSize: 11, fontWeight: 800 }}>ج.م</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {isOwner && (
              <>
                <div className="mb-3 text-center transition-all" style={{ background: 'linear-gradient(135deg,#00CC66,#00AA55)', borderRadius: 18, padding: '10px 14px', color: '#fff', boxShadow: '0 4px 14px rgba(0,204,102,0.22)' }}>
                  <div style={{ fontSize: 9, fontWeight: 900, opacity: 0.9, marginBottom: 2 }}>
                    {`🟢 إجمالي الإيراد المؤكد (${logDateFrom === logDateTo ? 'اليوم' : `${logDateFrom} ➜ ${logDateTo}`})`}
                  </div>
                  <div className="font-black font-mono leading-none my-1" style={{ fontSize: 26, fontWeight: 950, textShadow: '0 1.5px 3px rgba(0,0,0,0.15)' }}>
                    {filteredStats.total.toFixed(0)} <span style={{ fontSize: 13, fontWeight: 800 }}>ج.م</span>
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 900, opacity: 0.85 }}>
                    {filteredCompleted.filter(s => s.revenueConfirmed).length} عملية مكتملة ومسجلة
                  </div>
                </div>

                {filteredStats.totalCommission > 0 && (
                  <div className="space-y-2 mb-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-center transition-all" style={{ background: 'linear-gradient(135deg,#FF9500,#FF7700)', borderRadius: 16, padding: '8px 10px', color: '#ffffff', boxShadow: '0 4px 12px rgba(255,149,0,0.22)' }}>
                        <div className="font-bold mb-0.5" style={{ fontSize: 10, fontWeight: 900, opacity: 0.95, color: '#ffffff' }}>عمولة التطبيق</div>
                        <div className="font-black font-mono leading-none my-1" style={{ fontSize: 18, fontWeight: 950, color: '#ffffff', textShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                          {filteredStats.totalCommission.toFixed(0)} <span style={{ fontSize: 10, fontWeight: 800 }}>ج.م</span>
                        </div>
                      </div>

                      <div className="text-center transition-all" style={{ background: 'linear-gradient(135deg,#00AA55,#008844)', borderRadius: 16, padding: '8px 10px', color: '#ffffff', boxShadow: '0 4px 12px rgba(0,170,85,0.22)' }}>
                        <div className="font-bold mb-0.5" style={{ fontSize: 10, fontWeight: 900, opacity: 0.95, color: '#ffffff' }}>صافي إيرادك</div>
                        <div className="font-black font-mono leading-none my-1" style={{ fontSize: 18, fontWeight: 950, color: '#ffffff', textShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                          {filteredStats.totalNet.toFixed(0)} <span style={{ fontSize: 10, fontWeight: 800 }}>ج.م</span>
                        </div>
                      </div>
                    </div>

                    {(() => {
                      const settlement = filteredStats.activeWallet - filteredStats.activeCommission;
                      const isGarageOwed = settlement > 0;
                      const absSettlement = Math.abs(settlement).toFixed(0);

                      if (settlement === 0 && filteredStats.activeWallet === 0 && filteredStats.activeCommission === 0) return null;

                      return (
                        <div className="text-center transition-all" style={{ background: settlement === 0 ? '#F0F4FF' : isGarageOwed ? '#EBFDF2' : '#FFF3F3', border: `2px solid ${settlement === 0 ? '#D0DCFF' : isGarageOwed ? '#00CC66' : '#FF3333'}`, borderRadius: 18, padding: '14px 16px', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                          <div className="flex justify-between items-center">
                            <div className="font-black font-mono" style={{ fontSize: 22, color: settlement === 0 ? '#0066FF' : isGarageOwed ? '#00AA44' : '#CC0000' }}>
                              {absSettlement} ج.م
                            </div>
                            <div className="text-right">
                              <div className="font-black" style={{ fontSize: 14, color: '#0A1628' }}>
                                {settlement === 0 ? '⚖️ الحساب متزن' : isGarageOwed ? '🟢 مستحق لك طرف التطبيق' : '🔴 مستحق عليك للتطبيق'}
                              </div>
                              <div className="font-bold" style={{ fontSize: 10, color: '#7B8CA6', marginTop: 2 }}>
                                {settlement === 0 ? 'محصل بالمحفظة أكبر من العمولة' : 'العمولة أكبر من رصيد المحفظة'}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[
                    { label: '✋ يدوي', count: filteredStats.manualCount, total: filteredStats.manualTotal, bg: '#FF9500', shadow: 'rgba(255,149,0,0.22)' },
                    { label: '📱 تطبيق', count: filteredStats.appCount, total: filteredStats.appTotal, bg: '#0066FF', shadow: 'rgba(0,102,255,0.22)' },
                  ].map(x => (
                    <div key={x.label} className="text-center transition-all" style={{ background: x.bg, borderRadius: 16, padding: '8px 10px', color: '#fff', boxShadow: `0 4px 14px ${x.shadow}` }}>
                      <div className="font-black" style={{ fontSize: 11, fontWeight: 900, marginBottom: 1 }}>{x.label}</div>
                      <div className="font-black font-mono leading-none my-1" style={{ fontSize: 16, fontWeight: 950 }}>
                        {x.count} <span style={{ fontSize: 9, fontWeight: 800 }}>سيارة</span>
                      </div>
                      <div style={{ fontSize: 9, fontWeight: 900, opacity: 0.9 }}>
                        ({x.total.toFixed(0)} ج)
                      </div>
                    </div>
                  ))}
                </div>

                {valetReport.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-2">
                      {selectedValetFilter && (
                        <button onClick={() => setSelectedValetFilter(null)} className="font-black active:scale-95" style={{ fontSize: 9, padding: '3px 9px', borderRadius: 10, background: '#FF3333', color: '#ffffff', fontWeight: 950, textShadow: '0 1px 1px rgba(0,0,0,0.15)' }}>
                          ✕ إلغاء
                        </button>
                      )}
                      <div className="flex items-center gap-1.5 justify-end flex-1">
                        <Users size={14} style={{ color: '#0066FF' }} />
                        <h4 className="font-black" style={{ fontSize: 12, fontWeight: 950, color: '#334155' }}>تقرير السياس</h4>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {valetReport.map((v, i) => (
                        <div key={i} onClick={() => setSelectedValetFilter(selectedValetFilter === v.name ? null : v.name)} className="cursor-pointer active:scale-[0.99] transition-all" style={{ background: selectedValetFilter === v.name ? `${v.color}10` : '#fff', borderRadius: 14, padding: '9px 12px', border: `1.5px solid ${selectedValetFilter === v.name ? v.color : `${v.color}30`}` }}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="font-black font-mono" style={{ fontSize: 14, fontWeight: 950, color: v.color, textShadow: '0 1px 1px rgba(0,0,0,0.05)' }}>
                              {v.total.toFixed(0)} <span style={{ fontSize: 10, fontWeight: 800 }}>ج.م</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="text-right">
                                <div className="font-black" style={{ fontSize: 12, fontWeight: 950, color: '#0A1628' }}>{v.name}</div>
                                <div className="font-black" style={{ fontSize: 9, color: '#94a3b8', fontWeight: 900 }}>{v.count} سيارة</div>
                              </div>
                              <div style={{ width: 30, height: 30, borderRadius: 10, background: v.color, color: '#ffffff', display: 'flex', alignItems: 'center', justifyStyle: 'center', fontWeight: 950, fontSize: 12, textShadow: '0 1px 1px rgba(0,0,0,0.2)', justifyItems: 'center', alignContent: 'center', justifySelf: 'center' }}>
                                <span className="m-auto text-center">{v.icon}</span>
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="text-center flex items-center justify-center gap-1.5" style={{ background: '#EBF2FF', borderRadius: 10, padding: '5px 6px', border: '1px solid #D0DCFF' }}>
                              <span style={{ fontSize: 10, color: '#0066FF', fontWeight: 950 }}>📱</span>
                              <span className="font-black font-mono" style={{ fontSize: 12, fontWeight: 950, color: '#0066FF' }}>{v.appCount}</span>
                              <span style={{ fontSize: 9, color: '#7B8CA6', fontWeight: 900 }}>({v.appTotal.toFixed(0)}ج)</span>
                            </div>
                            <div className="text-center flex items-center justify-center gap-1.5" style={{ background: '#FFF8F0', borderRadius: 10, padding: '5px 6px', border: '1px solid #FFD180' }}>
                              <span style={{ fontSize: 10, color: '#FF9500', fontWeight: 950 }}>✋</span>
                              <span className="font-black font-mono" style={{ fontSize: 12, fontWeight: 950, color: '#FF9500' }}>{v.manualCount}</span>
                              <span style={{ fontSize: 9, color: '#7B8CA6', fontWeight: 900 }}>({v.manualTotal.toFixed(0)}ج)</span>
                            </div>
                          </div>
                          {selectedValetFilter === v.name && (
                            <div className="mt-1.5 text-center">
                              <span className="font-black" style={{ fontSize: 9, color: v.color, fontWeight: 950 }}>✅ فلتر مفعّل — اضغط للإلغاء</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {isValet && (
              <div className="mb-4 flex items-center justify-between" style={{ background: '#ffffff', borderRadius: 16, padding: '10px 16px', border: '1.5px solid #D0DCFF', boxShadow: '0 2px 8px rgba(0,102,255,0.02)' }}>
                <div className="flex items-baseline gap-1">
                  <span className="font-mono font-black text-blue-600" style={{ fontSize: 24, lineHeight: 1 }}>
                    {filteredCompleted.length}
                  </span>
                  <span className="font-bold text-slate-400" style={{ fontSize: 10 }}>عملية مكتملة</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-black text-slate-800 text-sm">📊 عملياتي اليوم</span>
                </div>
              </div>
            )}
          </>
        )}

        <div className="space-y-1.5">
          {filteredCompleted.slice(0, 30).map(session => {
            const isM = session.source === 'manual';
            const et = session.endTime ? toMs(session.endTime) : null;
            const time = et ? new Date(et) : null;
            const rev = getSessionRevenue(session);
            const isC = session.revenueConfirmed;
            const isSettled = (session as any).settled === true;
            const rawAddedBy = ((session as any).addedBy || '').trim();
            const addedBy = garageValetNames.includes(rawAddedBy) ? rawAddedBy : '';
            return (
              <div key={session.id} style={{ background: isSettled ? '#F1F5F9' : isC ? (isM ? '#FFF8F0' : '#EBF5FF') : '#FFFBF0', border: `1.5px solid ${isSettled ? '#CBD5E1' : isC ? (isM ? '#FFD180' : '#A0C4FF') : '#FFD180'}`, borderRadius: 14, padding: '9px 12px', opacity: isSettled ? 0.75 : 1 }}>
                <div className="flex justify-between items-center mb-1.5 gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(isOwner || !isC) && (
                      <span className="font-black" style={{ fontSize: rev === 0 && session.isFirstFreeSession ? 11 : 15, fontWeight: 950, color: isSettled ? '#64748B' : rev === 0 && session.isFirstFreeSession ? '#00AA44' : isM ? '#E65100' : '#0066FF', textShadow: '0 0.5px 1px rgba(0,0,0,0.05)' }}>
                        {rev === 0 && session.isFirstFreeSession ? (
                          <span className="flex items-center gap-0.5 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                            🎁 مجانية (0ج)
                          </span>
                        ) : (
                          <span className="font-mono">{rev.toFixed(0)} <span style={{ fontSize: 9, fontWeight: 800 }}>ج.م</span></span>
                        )}
                      </span>
                    )}
                    <span className="font-black" style={{ fontSize: 9, padding: '2.5px 8px', borderRadius: 8, background: isSettled ? '#94a3b8' : isM ? '#FF9500' : '#0066FF', color: '#ffffff', fontWeight: 950, textShadow: '0 1px 1px rgba(0,0,0,0.15)' }}>
                      {isSettled ? '🔒 مقفلة' : isM ? 'يدوي' : 'تطبيق'}
                    </span>
                    {addedBy && isOwner && (
                      <span className="font-black cursor-pointer active:scale-95" onClick={() => setSelectedValetFilter(selectedValetFilter === addedBy ? null : addedBy)} style={{ fontSize: 8.5, padding: '2px 6px', borderRadius: 8, background: selectedValetFilter === addedBy ? '#0066FF' : '#EBF2FF', color: selectedValetFilter === addedBy ? '#ffffff' : '#0066FF', border: '1px solid #D0DCFF', fontWeight: 900 }}>
                        🅿️ {addedBy}
                      </span>
                    )}
                    {!isSettled && !isC ? (
                      <button 
                        onClick={async () => { 
                          const currentValet = isValet ? (currentValetNameLocal || currentValetName || `سايس ${valetNumber}`) : '';
                          if (currentValet) {
                            await assignSessionToValet(session.id, currentValet);
                          }
                          await confirmRevenue(session.id, currentValet); 
                          await fetchGarageDailyStats(); 
                          toast.success('تأكيد ✅'); 
                        }} 
                        className="active:scale-95" 
                        style={{ background: '#FF9500', color: '#ffffff', padding: '2.5px 8px', borderRadius: 8, fontSize: 8.5, fontWeight: 950, textShadow: '0 1px 1px rgba(0,0,0,0.15)', border: 'none' }}
                      >
                        ⏳ تأكيد
                      </button>
                    ) : !isSettled ? (
                      <span className="font-black" style={{ fontSize: 8.5, color: '#00AA44', fontWeight: 950 }}>✅ مؤكد</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="rounded-full" style={{ width: 6, height: 6, background: isSettled ? '#94a3b8' : isM ? '#FF9500' : '#0066FF' }} />
                    <span className="font-black" style={{ fontSize: 13, fontWeight: 950, color: isSettled ? '#64748B' : '#000000' }}>{session.carPlate}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1">
                    {session.paymentMethod && (
                      <span className="font-black" style={{ fontSize: 8.5, padding: '2px 8px', borderRadius: 8, color: '#ffffff', background: isSettled ? '#94a3b8' : session.paymentMethod === 'cash' ? '#00CC66' : session.paymentMethod === 'instapay' ? '#7C3AED' : session.paymentMethod === 'wallet' ? '#0066FF' : '#FF8800', fontWeight: 950, textShadow: '0 1px 1px rgba(0,0,0,0.15)' }}>
                        {session.paymentMethod === 'cash' ? '💵 نقدي' : session.paymentMethod === 'instapay' ? '📱 إنستاباي' : session.paymentMethod === 'wallet' ? '👝 محفظة' : '📲 كاش'}
                      </span>
                    )}
                  </div>
                  {time && (
                    <span className="font-mono font-black" style={{ fontSize: 10.5, fontWeight: 950, color: isSettled ? '#94a3b8' : '#334155' }}>
                      {time.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })} · {time.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {filteredCompleted.length === 0 && (
            <div className="text-center" style={{ background: '#fff', borderRadius: 24, padding: 32, border: '2px solid #D0DCFF' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
              <p className="font-bold" style={{ fontSize: 14, color: '#7B8CA6' }}>{isValet ? 'لا توجد عمليات لك اليوم' : 'لا توجد عمليات'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Switcher Modal */}
      <AnimatePresence>
        {showSwitcher && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] flex items-end justify-center p-4" style={{ background: 'rgba(10,22,40,0.65)', backdropFilter: 'blur(8px)' }} onClick={() => setShowSwitcher(false)}>
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25 }} className="w-full max-w-sm bg-white rounded-t-[32px] rounded-b-[20px] p-6 text-right" onClick={e => e.stopPropagation()} style={{ boxShadow: '0 -10px 40px rgba(0,0,0,0.15)' }}>
              <div className="mx-auto mb-4" style={{ width: 40, height: 4, background: '#D0DCFF', borderRadius: 4 }} />
              
              <div className="flex justify-between items-center mb-5 pb-3" style={{ borderBottom: '2px solid #F0F4FF' }}>
                <button onClick={() => setShowSwitcher(false)} className="text-slate-400 hover:text-slate-600 font-black" style={{ fontSize: 22 }}>✕</button>
                <h3 className="font-black text-slate-800 flex items-center gap-2" style={{ fontSize: 16 }}>
                  <span>اختر الجراج للإدارة</span>
                  <Building2 size={18} style={{ color: '#0066FF' }} />
                </h3>
              </div>

              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {myGarages.map((g) => {
                  const isActive = g.id === currentGarageId;
                  return (
                    <button key={g.id} onClick={() => { setCurrentGarageId(g.id); setShowSwitcher(false); toast.success(`تم الانتقال لـ ${g.name} ⚡`); fetchAll(); }} className="w-full p-4 rounded-2xl text-right transition-all flex justify-between items-center active:scale-[0.98]" style={{ background: isActive ? '#F0F4FF' : '#ffffff', border: `2px solid ${isActive ? '#0066FF' : '#E2E8F0'}`, boxShadow: isActive ? '0 4px 14px rgba(0,102,255,0.15)' : '0 2px 6px rgba(0,0,0,0.03)' }}>
                      <div className="flex flex-col items-center gap-0.5 font-black font-mono" style={{ color: isActive ? '#0066FF' : '#94a3b8' }}>
                        <span style={{ fontSize: 20 }}>{g.availableSpots}</span>
                        <span className="font-bold" style={{ fontSize: 9 }}>شاغر</span>
                      </div>
                      <div className="text-right flex-1 mr-3">
                        <div className="font-black flex items-center gap-1.5 justify-end" style={{ fontSize: 15, color: '#0A1628' }}>
                          {isActive && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                          <span>🅿️ {g.name}</span>
                        </div>
                        <div className="flex items-center gap-1 justify-end mt-1 font-bold text-slate-400" style={{ fontSize: 10 }}>
                          <span>{g.location}</span>
                          <MapPin size={10} />
                        </div>
                        <div className="flex items-center gap-1.5 justify-end mt-1">
                          <span className="font-black font-mono" style={{ fontSize: 10, color: '#00AA44' }}>{g.basePrice}ج/س</span>
                          <span className="text-slate-300">·</span>
                          <span className="font-black font-mono" style={{ fontSize: 10, color: '#FF9500' }}>{g.capacity} مكان</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 pt-3 text-center" style={{ borderTop: '1px dashed #D0DCFF' }}>
                <p className="font-bold text-slate-400" style={{ fontSize: 10 }}>
                  💡 لديك {myGarages.length} جراجات تحت إدارتك
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}