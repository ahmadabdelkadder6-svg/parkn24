import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Car, Clock, DollarSign, LogOut, Plus, CheckCircle, XCircle, Settings,
  Minus, Save, MapPin, Edit3, Navigation, Phone, CarFront, FileText,
  CalendarDays, Undo2, Shield, HardHat, Users, Percent,
} from 'lucide-react';
import { useStore, pausePolling } from '../store';
import { supabase } from '../lib/supabase';
import { calculateFullHours, calculateCost } from '../utils/pricing';
import toast from 'react-hot-toast';
import { subscribeToPush, refreshPushSubscriptionIfNeeded } from '../lib/pushManager';

const UNDO_TIMEOUT_SECONDS = 30;

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
    if (value < 1_000_000_000_000) return value * 1000;
    return value;
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
  const n = new Date();
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

const fireNewCarAlert = (carPlate: string, customerName?: string, agreedPrice?: number) => {
  playFirstAlert(); vibrateDevice();
  sendNotification(
    '🚨 سيارة في الطريق!',
    [`🚗 ${carPlate}`, customerName ? `👤 ${customerName}` : '', agreedPrice ? `💰 ${agreedPrice} ج.م/ساعة` : '']
      .filter(Boolean).join('\n'),
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

export default function GarageDashboard() {
  const {
    garages, currentGarageId, setCurrentGarageId, sessions, addSession, endSession,
    removeSession, offers, updateOffer, cancelOffer, updateGarage, incomingCars,
    removeIncomingCar, fetchAll, confirmRevenue, assignSessionToValet,
  } = useStore();

  const [garageRole] = useState<'owner' | 'valet'>(
    () => (localStorage.getItem('garageRole') as 'owner' | 'valet') || 'owner',
  );
  const valetNumber = localStorage.getItem('valetNumber') || '';
  const isOwner = garageRole === 'owner';
  const isValet = garageRole === 'valet';

  const garage = garages.find(g => g.id === currentGarageId);
  const garageSessions = sessions.filter(s => s.garageId === currentGarageId);
  const currentValetNameLocal = localStorage.getItem('valetName') || '';

  const activeSessions = useMemo(() => {
    return garageSessions.filter(s => {
      if (s.status !== 'active') return false;
      if (Date.now() - toMs(s.startTime) >= 24 * 60 * 60 * 1000) return false;
      return true;
    });
  }, [garageSessions]);

  const valetActiveSessions = useMemo(() => {
    if (!isValet || !currentValetNameLocal) return activeSessions;
    return activeSessions.filter(s => {
      const addedBy = ((s as any).addedBy || '').trim();
      if (addedBy === currentValetNameLocal) return true;
      if (s.source === 'app' && addedBy === '') return true;
      return false;
    });
  }, [activeSessions, isValet, currentValetNameLocal]);

  const completedSessions = garageSessions.filter(s => s.status === 'completed');
  const garageOffers = offers.filter(o => o.garageId === currentGarageId && o.status === 'pending');
  const carsOnTheWay = incomingCars.filter(c => c.garageId === currentGarageId && c.status === 'coming');

  const processedCarsRef = useRef<Set<string>>(new Set());
  const isEndingSessionRef = useRef(false);
  const prevIncomingIdsRef = useRef<Set<string>>(new Set());
  const prevOfferIdsRef = useRef<Set<string>>(new Set());
  const approachAlertedRef = useRef<Set<string>>(new Set());
  const audioInitializedRef = useRef(false);
  const pushSubscribedGarageRef = useRef<string | null>(null);

  const [undoableSessions, setUndoableSessions] = useState<UndoableSession[]>([]);
  const [newCarPlate, setNewCarPlate] = useState('');
  const [newCarPrice, setNewCarPrice] = useState(garage?.basePrice || 15);
  const [showAddCar, setShowAddCar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editPrice, setEditPrice] = useState(garage?.basePrice || 15);
  const [editSpots, setEditSpots] = useState(garage?.availableSpots || 0);
  const [editCapacity, setEditCapacity] = useState(garage?.capacity || 50);
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
  const [confirmPaymentMethod, setConfirmPaymentMethod] = useState('cash');
  const [tick, setTick] = useState(0);
  const [garageDailyStats, setGarageDailyStats] = useState<DailyStat[]>([]);

  // ✅ إسناد جلسات الحريف للسايس تلقائياً
  useEffect(() => {
    if (!isValet) return;
    if (!currentGarageId) return;
    if (!currentValetNameLocal) return;

    const unassigned = sessions.filter(s => {
      if (s.garageId !== currentGarageId) return false;
      if (s.source !== 'app') return false;
      if (s.status !== 'active') return false;
      const addedBy = ((s as any).addedBy || '').trim();
      return addedBy === '';
    });

    if (unassigned.length === 0) return;

    unassigned.forEach(s => {
      assignSessionToValet(s.id, currentValetNameLocal);
    });
  }, [sessions, isValet, currentGarageId, currentValetNameLocal, assignSessionToValet]);

  // Realtime
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
    if (!currentGarageId || garages.length === 0 || pushSubscribedGarageRef.current === currentGarageId) return;
    (async () => { try { const s = await subscribeToPush(currentGarageId); if (s) pushSubscribedGarageRef.current = currentGarageId; } catch {} })();
  }, [currentGarageId, garages]);

  useEffect(() => {
    if (!currentGarageId) return;
    const h = async () => { if (document.visibilityState === 'visible') { await refreshPushSubscriptionIfNeeded(currentGarageId); await fetchAll(); } };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [currentGarageId, fetchAll]);

  useEffect(() => {
    const ids = new Set(carsOnTheWay.map(c => c.id));
    carsOnTheWay.forEach(car => {
      if (!prevIncomingIdsRef.current.has(car.id) && !document.hidden) {
        fireNewCarAlert(car.carPlate, car.customerName, car.agreedPrice);
        toast(`🚨 سيارة في الطريق!\n🚗 ${car.carPlate}${car.agreedPrice ? ` - ${car.agreedPrice} ج.م/ساعة` : ''}`, { duration: 10000, icon: '🚨' });
      }
    });
    prevIncomingIdsRef.current.forEach(id => {
      if (!ids.has(id)) { approachAlertedRef.current.delete(id); try { if ('vibrate' in navigator) navigator.vibrate(0); } catch {} }
    });
    prevIncomingIdsRef.current = ids;
  }, [carsOnTheWay]);

  useEffect(() => {
    carsOnTheWay.forEach(car => {
      if (approachAlertedRef.current.has(car.id)) return;
      const s = toMs(car.startTime);
      const el = (Date.now() - s) / 60000;
      const rem = Math.max(0, car.estimatedArrival - el);
      if (rem <= 2 && rem >= 0 && car.estimatedArrival > 2) {
        approachAlertedRef.current.add(car.id);
        if (!document.hidden) { fireApproachingAlert(car.carPlate); toast(`🚗 على وشك الوصول!\n${car.carPlate}`, { duration: 10000, icon: '⏰' }); }
      }
    });
  }, [carsOnTheWay, tick]);

  useEffect(() => {
    garageOffers.forEach(o => { if (!prevOfferIdsRef.current.has(o.id)) toast(`💰 عرض جديد!\n🚗 ${o.carPlate} - ${o.offeredPrice} ج.م/ساعة`, { duration: 8000, icon: '💰' }); });
    prevOfferIdsRef.current = new Set(garageOffers.map(o => o.id));
  }, [garageOffers]);

  useEffect(() => { return () => { try { if ('vibrate' in navigator) navigator.vibrate(0); } catch {} }; }, []);

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

  const getSessionRevenue = useCallback((s: any) => {
    if (s.totalPrice != null && Number(s.totalPrice) > 0) return Number(s.totalPrice);
    if (s.endTime && s.startTime) {
      return calculateCost(Math.max(0, Math.floor((toMs(s.endTime) - toMs(s.startTime)) / 1000)), Number(s.agreedPrice ?? garage?.basePrice ?? 0));
    }
    return 0;
  }, [garage?.basePrice]);

  // ✅ حساب العمولة لجلسة معينة
const getSessionCommission = useCallback((s: any) => {
  if (s.source !== 'app') return 0;
  const rev = getSessionRevenue(s);
  if (rev <= 0) return 0;
  // ✅ دايماً احسب من النسبة الحالية للجراج
  const rate = garage?.commissionRate ?? 10;
  return Math.round(rev * rate / 100 * 100) / 100;
}, [getSessionRevenue, garage?.commissionRate]);

  // ✅ حساب الصافي لجلسة معينة
const getSessionNetRevenue = useCallback((s: any) => {
  const rev = getSessionRevenue(s);
  if (s.source !== 'app') return rev;
  // ✅ دايماً احسب من العمولة الحالية
  const comm = getSessionCommission(s);
  return Math.round((rev - comm) * 100) / 100;
}, [getSessionRevenue, getSessionCommission]);
  const valetTodayRevenue = useMemo(() => {
    if (!isValet) return 0;
    return completedSessions
      .filter(s => {
        if (!s.revenueConfirmed || !s.endTime) return false;
        if (timestampToLocalDate(toMs(s.endTime)) !== getLocalToday()) return false;
        const addedBy = ((s as any).addedBy || '').trim();
        return addedBy === currentValetNameLocal || (s.source === 'app' && addedBy === '');
      })
      .reduce((a, s) => a + getSessionRevenue(s), 0);
  }, [isValet, completedSessions, currentValetNameLocal, getSessionRevenue]);

  const totalRevenue = useMemo(() => {
    if (isValet) return valetTodayRevenue;
    const fromStats = garageDailyStats.reduce((a, s) => a + Number(s.confirmed_revenue ?? 0), 0);
    if (fromStats > 0) return fromStats;
    return completedSessions
      .filter(s => {
        if (!s.revenueConfirmed) return false;
        if (s.endTime) { const d = timestampToLocalDate(toMs(s.endTime)); if (logDateFrom && d < logDateFrom) return false; if (logDateTo && d > logDateTo) return false; }
        return true;
      })
      .reduce((a, s) => a + getSessionRevenue(s), 0);
  }, [isValet, valetTodayRevenue, garageDailyStats, completedSessions, getSessionRevenue, logDateFrom, logDateTo]);

  const getActiveCost = useCallback((s: any) => {
    const st = toMs(s.startTime);
    const el = st > 0 ? Math.max(0, Math.floor((Date.now() - st) / 1000)) : 0;
    const r = Number(s.agreedPrice ?? garage?.basePrice ?? 0);
    if (el <= 0 || r <= 0) return 0;
    return calculateCost(el, r);
  }, [garage?.basePrice]);

  const filteredCompleted = useMemo(() => {
    return completedSessions.filter(s => {
      if (s.endTime) {
        const d = timestampToLocalDate(toMs(s.endTime));
        if (isValet) { if (d !== getLocalToday()) return false; }
        else { if (logDateFrom && d < logDateFrom) return false; if (logDateTo && d > logDateTo) return false; }
      }
      if (logPaymentFilter !== 'all' && s.paymentMethod !== logPaymentFilter) return false;
      if (isValet && currentValetNameLocal) {
        const addedBy = ((s as any).addedBy || '').trim();
        const isMine = addedBy === currentValetNameLocal || (s.source === 'app' && addedBy === '');
        if (!isMine) return false;
      }
      return true;
    });
  }, [completedSessions, logDateFrom, logDateTo, logPaymentFilter, isValet, currentValetNameLocal]);

  // ✅ إحصائيات مع العمولة
  const filteredStats = useMemo(() => {
    const c = filteredCompleted.filter(s => s.revenueConfirmed);
    const u = filteredCompleted.filter(s => !s.revenueConfirmed);
    const cash = c.filter(s => s.paymentMethod === 'cash').reduce((a, s) => a + getSessionRevenue(s), 0);
    const instapay = c.filter(s => s.paymentMethod === 'instapay').reduce((a, s) => a + getSessionRevenue(s), 0);
    const wallet = c.filter(s => s.paymentMethod === 'wallet').reduce((a, s) => a + getSessionRevenue(s), 0);
    const cashwallet = c.filter(s => s.paymentMethod === 'cashwallet').reduce((a, s) => a + getSessionRevenue(s), 0);
    const manual = c.filter(s => s.source === 'manual');
    const app = c.filter(s => s.source === 'app');

    // ✅ حساب إجمالي العمولة والصافي
    const totalCommission = c.reduce((a, s) => a + getSessionCommission(s), 0);
    const totalNet = c.reduce((a, s) => a + getSessionNetRevenue(s), 0);

    return {
      cash, instapay, wallet, cashwallet,
      total: cash + instapay + wallet + cashwallet,
      manualCount: manual.length, appCount: app.length,
      manualTotal: manual.reduce((a, s) => a + getSessionRevenue(s), 0),
      appTotal: app.reduce((a, s) => a + getSessionRevenue(s), 0),
      pendingRevenue: u.reduce((a, s) => a + getSessionRevenue(s), 0),
      pendingCount: u.length,
      totalCommission, // ✅
      totalNet, // ✅
    };
  }, [filteredCompleted, getSessionRevenue, getSessionCommission, getSessionNetRevenue]);

  const valetReport = useMemo(() => {
    if (!garage || !isOwner) return [];
    return [
      { name: garage.valetName1, color: '#0066FF', icon: '🅿️1' },
      { name: garage.valetName2, color: '#7C3AED', icon: '🅿️2' },
      { name: garage.valetName3, color: '#FF8800', icon: '🅿️3' },
    ]
      .filter(v => v.name?.trim())
      .map(v => {
        const vs = filteredCompleted.filter(s => (s as any).addedBy === v.name);
        const ac = vs.filter(s => s.source === 'app' && s.revenueConfirmed);
        const mc = vs.filter(s => s.source === 'manual' && s.revenueConfirmed);
        return {
          ...v, count: vs.length,
          appCount: ac.length, manualCount: mc.length,
          appTotal: ac.reduce((a, s) => a + getSessionRevenue(s), 0),
          manualTotal: mc.reduce((a, s) => a + getSessionRevenue(s), 0),
          total: [...ac, ...mc].reduce((a, s) => a + getSessionRevenue(s), 0),
        };
      })
      .filter(v => v.count > 0);
  }, [filteredCompleted, garage, isOwner, getSessionRevenue]);

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

  const getUndoRemainingSeconds = useCallback((addedAt: number) => Math.max(0, UNDO_TIMEOUT_SECONDS - Math.floor((Date.now() - addedAt) / 1000)), []);

  useEffect(() => { const i = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(i); }, []);
  useEffect(() => { if (garage) setNewCarPrice(garage.basePrice); }, [garage?.basePrice, garage]);

  useEffect(() => {
    setUndoableSessions(p =>
      p.filter(u => Math.floor((Date.now() - u.addedAt) / 1000) < UNDO_TIMEOUT_SECONDS)
        .map(u => {
          const e = sessions.find(s => s.id === u.sessionId);
          if (!e) { const n = sessions.find(s => s.carPlate === u.carPlate && s.source === 'manual' && s.status === 'active' && Math.abs(toMs(s.startTime) - u.addedAt) < 5000); if (n) return { ...u, sessionId: n.id }; }
          return u;
        }),
    );
  }, [tick, sessions]);

  if (!garage) return null;

  const handleAddCar = async () => {
    if (!newCarPlate.trim()) { toast.error('أدخل رقم السيارة'); return; }
    const cp = newCarPlate.trim();
    const pr = newCarPrice;
    const at = Date.now();
    const sid = await addSession({
      garageId: garage.id, carPlate: cp, startTime: at,
      status: 'active', source: 'manual', agreedPrice: pr,
      addedBy: isValet ? currentValetNameLocal : '',
    } as any);
    const fid = sid || `fallback-${at}`;
    setUndoableSessions(p => [...p, { sessionId: fid, localId: fid, carPlate: cp, price: pr, addedAt: at }]);
    toast.success(`تم إضافة السيارة بسعر ${pr} ج.م/ساعة`);
    setNewCarPlate(''); setNewCarPrice(garage.basePrice); setShowAddCar(false);
  };

  const openConfirmPayment = (sid: string, cp: string, cost: number, hrs: number, mins: number, src: 'app' | 'manual', ap?: number) => {
    const fc = cost > 0 ? cost : (() => { const s = activeSessions.find(s => s.id === sid); return s ? getActiveCost(s) : 0; })();
    setConfirmSession({ id: sid, carPlate: cp, cost: fc, hours: hrs, minutes: mins, source: src, agreedPrice: ap });
    setConfirmPaymentMethod('cash');
  };

  const handleConfirmPayment = async () => {
    if (!confirmSession || isEndingSessionRef.current) return;
    isEndingSessionRef.current = true;
    pausePolling(20000);
    try {
      const sc = { ...confirmSession };
      const pc = confirmPaymentMethod;
      const sd = useStore.getState().sessions.find(s => s.id === sc.id);
      const ia = sd?.source === 'app';
      setConfirmSession(null);
      setUndoableSessions(p => p.filter(u => u.sessionId !== sc.id && u.localId !== sc.id));
      await endSession(sc.id, sc.cost, pc);
      if (ia) await new Promise(r => setTimeout(r, 5000));
      await fetchGarageDailyStats();
      toast.success(`تم تحصيل ${sc.cost} ج.م ✅`);
    } finally { setTimeout(() => { isEndingSessionRef.current = false; }, 2000); }
  };

  const handleSaveSettings = () => {
    updateGarage(garage.id, {
      basePrice: editPrice, availableSpots: Math.min(editSpots, editCapacity), capacity: editCapacity,
      valetName1: editValet1Name.trim(), valetPassword1: editValet1Pass.trim(),
      valetName2: editValet2Name.trim(), valetPassword2: editValet2Pass.trim(),
      valetName3: editValet3Name.trim(), valetPassword3: editValet3Pass.trim(),
    });
    toast.success('تم تحديث الإعدادات ⚡'); setShowSettings(false);
  };

  const openSettings = () => {
    setEditPrice(garage.basePrice); setEditSpots(garage.availableSpots); setEditCapacity(garage.capacity);
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
    pausePolling(10000);
    try {
      const np = carPlate.trim().toUpperCase();
      const existing = useStore.getState().sessions.find(s => s.carPlate.trim().toUpperCase() === np && s.status === 'active');
      if (existing) { await removeIncomingCar(carId); toast('الجلسة شغالة ✅', { icon: '🚗' }); return; }
      const ro = offers.find(o => o.carPlate.trim().toUpperCase() === np && (o.status === 'pending' || o.status === 'accepted'));
      if (ro) cancelOffer(ro.id);
      await addSession({
        garageId: garage.id, carPlate: np, startTime: Date.now(),
        status: 'active', source: 'app',
        agreedPrice: car.agreedPrice, customerPhone: car.customerPhone,
        customerName: car.customerName, startedBy: 'garage',
        incomingCarId: carId, addedBy: isValet ? currentValetNameLocal : '',
      } as any);
      await removeIncomingCar(carId);
      await supabase.from('incoming_cars').delete().eq('car_plate', np).eq('garage_id', garage.id);
      toast.success(`بدأ حساب ${carPlate} 🚗`);
    } catch (e) {
      processedCarsRef.current.delete(carId);
      toast.error('خطأ، حاول تاني');
    }
  };

  const calculateRemainingTime = (st: number | string, em: number) =>
    Math.max(0, em - Math.floor((Date.now() - toMs(st)) / 60000));

  const currentValetName =
    valetNumber === '1' ? garage.valetName1 :
    valetNumber === '2' ? garage.valetName2 :
    valetNumber === '3' ? garage.valetName3 : '';

  const checkIsMySession = (session: any): boolean => {
    if (isOwner) return true;
    if (!currentValetNameLocal) return true;
    const addedBy = ((session as any).addedBy || '').trim();
    if (addedBy === currentValetNameLocal) return true;
    if (session.source === 'app' && addedBy === '') return true;
    return false;
  };

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#EBF2FF', color: '#0A1628', padding: 16 }}>

      {/* Header */}
      <div className="flex justify-between items-center mb-5 pt-14">
        <button onClick={() => { localStorage.removeItem('garageRole'); localStorage.removeItem('valetNumber'); localStorage.removeItem('valetName'); setCurrentGarageId(null); }} className="active:scale-90" style={{ background: '#fff', padding: 14, borderRadius: 20, border: '2px solid #D0DCFF' }}>
          <LogOut size={20} style={{ color: '#64748b' }} />
        </button>
        <div className="text-right flex-1 mr-3">
          <h2 className="font-black" style={{ fontSize: 20 }}>{garage.name}</h2>
          <div className="flex items-center gap-2 justify-end mt-1">
            <span className="font-bold flex items-center gap-1" style={{ fontSize: 10, padding: '4px 10px', borderRadius: 12, background: isOwner ? '#0066FF' : '#FF9500', color: '#fff' }}>
              {isOwner ? <><Shield size={10} /> مالك</> : <><HardHat size={10} /> سايس {valetNumber} {currentValetName && `- ${currentValetName}`}</>}
            </span>
            <p className="flex items-center gap-1" style={{ fontSize: 11, color: '#7B8CA6' }}><MapPin size={11} /> {garage.location}</p>
          </div>
        </div>
        {isOwner && <button onClick={openSettings} className="active:scale-90" style={{ background: '#0066FF', padding: 14, borderRadius: 20, color: '#fff' }}><Settings size={20} /></button>}
        {isValet && <div style={{ width: 48 }} />}
      </div>

      {/* Settings Modal */}
      {isOwner && showSettings && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }} onClick={() => setShowSettings(false)}>
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="w-full max-w-sm max-h-[90vh] overflow-y-auto" style={{ background: '#fff', borderRadius: 32, padding: 24 }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <button onClick={() => setShowSettings(false)} style={{ color: '#94a3b8', fontSize: 20 }}>✕</button>
              <h3 className="font-black flex items-center gap-2" style={{ fontSize: 18 }}><Settings size={18} style={{ color: '#0066FF' }} /> إعدادات الجراج</h3>
            </div>

            <div className="mb-6">
              <label className="font-black block text-right mb-2" style={{ fontSize: 12, color: '#7B8CA6' }}>💰 سعر الساعة</label>
              <div style={{ background: '#F0F4FF', borderRadius: 22, padding: 16, border: '2px solid #D0DCFF' }}>
                <div className="flex items-center justify-between gap-4">
                  <button onClick={() => setEditPrice(p => Math.max(5, p - 5))} className="active:scale-90" style={{ background: '#FF3333', color: '#fff', width: 52, height: 52, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={22} /></button>
                  <div className="text-center flex-1">
                    <input type="number" value={editPrice} onChange={e => setEditPrice(Math.max(1, parseInt(e.target.value) || 0))} className="bg-transparent text-center w-full outline-none font-mono font-black" style={{ fontSize: 40 }} />
                    <div className="font-bold" style={{ fontSize: 11, color: '#94a3b8' }}>ج.م / ساعة</div>
                  </div>
                  <button onClick={() => setEditPrice(p => p + 5)} className="active:scale-90" style={{ background: '#00CC66', color: '#fff', width: 52, height: 52, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={22} /></button>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <label className="font-black block text-right mb-2" style={{ fontSize: 12, color: '#7B8CA6' }}>🚗 الأماكن المتاحة</label>
              <div style={{ background: '#F0F4FF', borderRadius: 22, padding: 16, border: '2px solid #D0DCFF' }}>
                <div className="flex items-center justify-between gap-4">
                  <button onClick={() => setEditSpots(s => Math.max(0, s - 1))} className="active:scale-90" style={{ background: '#FF3333', color: '#fff', width: 52, height: 52, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={22} /></button>
                  <div className="text-center flex-1">
                    <input type="number" value={editSpots} onChange={e => setEditSpots(Math.max(0, Math.min(editCapacity, parseInt(e.target.value) || 0)))} className="bg-transparent text-center w-full outline-none font-mono font-black" style={{ fontSize: 40, color: '#0066FF' }} />
                    <div className="font-bold" style={{ fontSize: 11, color: '#94a3b8' }}>من {editCapacity} مكان</div>
                  </div>
                  <button onClick={() => setEditSpots(s => Math.min(editCapacity, s + 1))} className="active:scale-90" style={{ background: '#00CC66', color: '#fff', width: 52, height: 52, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={22} /></button>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <label className="font-black block text-right mb-2" style={{ fontSize: 12, color: '#7B8CA6' }}>🏢 السعة الكلية</label>
              <div style={{ background: '#F0F4FF', borderRadius: 22, padding: 16, border: '2px solid #D0DCFF' }}>
                <div className="flex items-center justify-between gap-4">
                  <button onClick={() => setEditCapacity(c => Math.max(editSpots, c - 10))} className="active:scale-90" style={{ background: '#D0DCFF', color: '#64748b', width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={18} /></button>
                  <div className="text-center flex-1">
                    <input type="number" value={editCapacity} onChange={e => setEditCapacity(Math.max(editSpots, parseInt(e.target.value) || editSpots))} className="bg-transparent text-center w-full outline-none font-mono font-black" style={{ fontSize: 28, color: '#7C3AED' }} />
                  </div>
                  <button onClick={() => setEditCapacity(c => c + 10)} className="active:scale-90" style={{ background: '#D0DCFF', color: '#64748b', width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={18} /></button>
                </div>
              </div>
            </div>

            {/* ✅ عرض نسبة العمولة (للعرض فقط - الأدمن هو اللي يغيرها) */}
            <div className="mb-6">
              <label className="font-black block text-right mb-2" style={{ fontSize: 12, color: '#7B8CA6' }}>📊 نسبة عمولة التطبيق</label>
              <div style={{ background: '#FFF8F0', borderRadius: 22, padding: 16, border: '2px solid #FFD180' }}>
                <div className="flex items-center justify-center gap-2">
                  <Percent size={20} style={{ color: '#FF9500' }} />
                  <span className="font-black font-mono" style={{ fontSize: 32, color: '#FF9500' }}>{garage.commissionRate}</span>
                  <span className="font-bold" style={{ fontSize: 12, color: '#94a3b8' }}>% على جلسات التطبيق</span>
                </div>
                <div className="text-center mt-2">
                  <span className="font-bold" style={{ fontSize: 10, color: '#94a3b8' }}>يتم تحديدها من إدارة التطبيق</span>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <label className="font-black block text-right mb-2" style={{ fontSize: 12, color: '#7B8CA6' }}>🅿️ إدارة السياس</label>
              <div style={{ background: '#F0F4FF', borderRadius: 22, padding: 16, border: '2px solid #D0DCFF' }}>
                {[
                  { n: 1, name: editValet1Name, setName: setEditValet1Name, pass: editValet1Pass, setPass: setEditValet1Pass, color: '#0066FF' },
                  { n: 2, name: editValet2Name, setName: setEditValet2Name, pass: editValet2Pass, setPass: setEditValet2Pass, color: '#7C3AED' },
                  { n: 3, name: editValet3Name, setName: setEditValet3Name, pass: editValet3Pass, setPass: setEditValet3Pass, color: '#FF8800' },
                ].map((v, i) => (
                  <div key={i} className={i < 2 ? 'mb-4 pb-4' : ''} style={i < 2 ? { borderBottom: '1px solid #D0DCFF' } : {}}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold" style={{ fontSize: 10, color: v.name || v.pass ? v.color : '#CBD5E1' }}>{v.name || v.pass ? '✅ مفعّل' : '❌ غير مفعّل'}</span>
                      <span className="font-black" style={{ fontSize: 12 }}>🅿️ سايس {v.n}</span>
                    </div>
                    <input type="text" value={v.name} onChange={e => v.setName(e.target.value)} className="w-full text-right outline-none font-bold mb-2" style={{ background: '#fff', border: `2px solid ${v.name ? v.color : '#D0DCFF'}`, padding: 12, borderRadius: 14, fontSize: 14 }} placeholder={`اسم سايس ${v.n}`} />
                    <input type="text" value={v.pass} onChange={e => v.setPass(e.target.value)} className="w-full text-center outline-none font-mono font-black" style={{ background: '#fff', border: `2px solid ${v.pass ? v.color : '#D0DCFF'}`, padding: 12, borderRadius: 14, fontSize: 16, letterSpacing: 3 }} placeholder={`كلمة مرور سايس ${v.n}`} />
                  </div>
                ))}
              </div>
            </div>

            <button onClick={handleSaveSettings} className="w-full font-black flex items-center justify-center gap-2 active:scale-95" style={{ background: 'linear-gradient(135deg,#00CC66,#00AA55)', color: '#fff', padding: 18, borderRadius: 20, fontSize: 15 }}><Save size={20} /> حفظ التغييرات</button>
          </motion.div>
        </motion.div>
      )}

      {/* Confirm Payment */}
      {confirmSession && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 flex items-end justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }} onClick={() => setConfirmSession(null)}>
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} transition={{ type: 'spring', damping: 25 }} className="w-full max-w-sm" style={{ background: '#fff', borderRadius: '32px 32px 20px 20px', padding: 24 }} onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-5" style={{ width: 40, height: 4, background: '#D0DCFF', borderRadius: 4 }} />
            <h3 className="font-black text-center mb-1" style={{ fontSize: 18 }}>تأكيد تحصيل السداد</h3>
            <div className="mb-5" style={{ background: '#F0F4FF', borderRadius: 22, padding: 16, border: '2px solid #D0DCFF' }}>
              <div className="flex justify-between items-center mb-3">
                <span className="font-bold" style={{ fontSize: 10, padding: '4px 10px', borderRadius: 12, background: confirmSession.source === 'manual' ? '#FF9500' : '#0066FF', color: '#fff' }}>{confirmSession.source === 'manual' ? 'يدوي' : 'تطبيق'}</span>
                <div className="font-black" style={{ fontSize: 18 }}>🚗 {confirmSession.carPlate}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center" style={{ background: '#fff', borderRadius: 16, padding: 12, border: '1px solid #E0EAFF' }}>
                  <div style={{ fontSize: 11, color: '#7B8CA6' }}>المدة</div>
                  <div className="font-black font-mono" style={{ fontSize: 16 }}>{confirmSession.minutes} دقيقة</div>
                </div>
                <div className="text-center" style={{ background: '#fff', borderRadius: 16, padding: 12, border: '1px solid #E0EAFF' }}>
                  <div style={{ fontSize: 11, color: '#7B8CA6' }}>المستحق</div>
                  <div className="font-black font-mono" style={{ fontSize: 24, color: '#00AA44' }}>{confirmSession.cost > 0 ? confirmSession.cost : '—'}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>ج.م</div>
                </div>
              </div>
              {/* ✅ عرض العمولة في نافذة التأكيد */}
              {confirmSession.source === 'app' && confirmSession.cost > 0 && (
                <div className="mt-3 flex items-center justify-between" style={{ background: '#FFF8F0', borderRadius: 14, padding: '8px 12px', border: '1px solid #FFD180' }}>
                  <div className="flex items-center gap-1">
                    <Percent size={12} style={{ color: '#FF9500' }} />
                    <span className="font-bold" style={{ fontSize: 10, color: '#FF9500' }}>عمولة {garage.commissionRate}%</span>
                  </div>
                  <span className="font-black font-mono" style={{ fontSize: 13, color: '#FF9500' }}>
                    {Math.round(confirmSession.cost * garage.commissionRate / 100 * 100) / 100} ج.م
                  </span>
                </div>
              )}
            </div>
            <div className="mb-5">
              <h4 className="font-black mb-3 text-right" style={{ fontSize: 12, color: '#7B8CA6' }}>طريقة السداد</h4>
              {confirmSession.source === 'manual' ? (
                <div className="text-center" style={{ background: 'linear-gradient(135deg,#00CC66,#00AA55)', borderRadius: 18, padding: 18, color: '#fff' }}>
                  <div style={{ fontSize: 28 }}>💵</div>
                  <div className="font-black" style={{ fontSize: 15 }}>نقدي</div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'cash', label: 'نقدي', icon: '💵', bg: '#00CC66', disabled: false },
                    { id: 'instapay', label: 'إنستاباي', icon: '📱', bg: '#7C3AED', disabled: false },
                    { id: 'wallet', label: 'المحفظة', icon: '👝', bg: '#0066FF', disabled: true },
                    { id: 'cashwallet', label: 'محفظة كاش', icon: '📲', bg: '#FF8800', disabled: false },
                  ].map(pm => (
                    <button key={pm.id} onClick={() => !pm.disabled && setConfirmPaymentMethod(pm.id)} disabled={pm.disabled} className="text-center active:scale-95"
                      style={{ borderRadius: 18, padding: 14, background: pm.disabled ? '#F0F4FF' : confirmPaymentMethod === pm.id ? pm.bg : '#fff', color: pm.disabled ? '#94a3b8' : confirmPaymentMethod === pm.id ? '#fff' : '#475569', border: pm.disabled ? '2px solid #D0DCFF' : confirmPaymentMethod === pm.id ? 'none' : '2px solid #D0DCFF' }}>
                      <div style={{ fontSize: 24 }}>{pm.icon}</div>
                      <div className="font-black" style={{ fontSize: 11 }}>{pm.label}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={handleConfirmPayment} className="flex-1 font-black flex items-center justify-center gap-2 active:scale-95" style={{ padding: 18, borderRadius: 20, fontSize: 14, color: '#fff', background: 'linear-gradient(135deg,#00CC66,#00AA55)' }}>
                <CheckCircle size={20} /> تأكيد ({confirmSession.cost} ج.م)
              </button>
              <button onClick={() => setConfirmSession(null)} className="active:scale-95" style={{ background: '#F0F4FF', padding: '0 20px', borderRadius: 20, color: '#7B8CA6' }}><XCircle size={20} /></button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { icon: <DollarSign size={22} />, value: totalRevenue.toFixed(0), label: isValet ? 'إيرادي اليوم' : 'مؤكد', bg: 'linear-gradient(135deg,#00CC66,#00AA55)', shadow: 'rgba(0,204,102,0.3)' },
          { icon: <Car size={22} />, value: garage.availableSpots, label: 'شاغر', bg: 'linear-gradient(135deg,#0066FF,#0044DD)', shadow: 'rgba(0,102,255,0.3)', onClick: isOwner ? openSettings : undefined },
          { icon: isValet ? <Car size={22} /> : <DollarSign size={22} />, value: isValet ? valetActiveSessions.length : garage.basePrice, label: isValet ? 'جلساتي' : 'ج.م/ساعة', bg: 'linear-gradient(135deg,#7C3AED,#5B21B6)', shadow: 'rgba(124,58,237,0.3)', onClick: isOwner ? openSettings : undefined },
        ].map((s, i) => (
          <div key={i} onClick={s.onClick} className={`text-center ${s.onClick ? 'cursor-pointer active:scale-95' : ''}`} style={{ background: s.bg, borderRadius: 22, padding: '18px 10px', color: '#fff', boxShadow: `0 6px 24px ${s.shadow}` }}>
            <div className="mx-auto mb-1" style={{ opacity: 0.9 }}>{s.icon}</div>
            <div className="font-black font-mono" style={{ fontSize: 24 }}>{s.value}</div>
            <div className="font-bold flex items-center justify-center gap-1" style={{ fontSize: 9, opacity: 0.8 }}>{s.label} {s.onClick && <Edit3 size={9} />}</div>
          </div>
        ))}
      </div>

      {/* Valet Section */}
      {isValet && (
        <>
          <AnimatePresence>
            {undoableSessions.map(un => {
              const rem = getUndoRemainingSeconds(un.addedAt);
              return (
                <motion.div key={un.localId} initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="mb-4">
                  <div style={{ background: 'linear-gradient(135deg,#FF9500,#FF7700)', borderRadius: 22, padding: 16, color: '#fff' }}>
                    <div className="flex items-center justify-between gap-3">
                      <button onClick={() => handleUndoSession(un)} className="font-black flex items-center gap-2 active:scale-95 shrink-0" style={{ background: '#FF3333', color: '#fff', padding: '12px 18px', borderRadius: 16, fontSize: 13 }}><Undo2 size={18} /> تراجع</button>
                      <div className="flex-1 text-right">
                        <span className="font-black" style={{ fontSize: 14 }}>🚗 {un.carPlate}</span>
                        <div className="font-bold font-mono" style={{ fontSize: 11 }}>⏳ {rem} ثانية</div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {carsOnTheWay.length > 0 && (
            <div className="mb-5">
              <h3 className="font-black mb-3 flex items-center gap-2 justify-end" style={{ fontSize: 15, color: '#0099DD' }}>
                <span className="font-black" style={{ background: '#0099DD', color: '#fff', fontSize: 12, padding: '3px 12px', borderRadius: 20 }}>{carsOnTheWay.length}</span>
                سيارات في الطريق <Navigation size={16} className="animate-pulse" />
              </h3>
              <div className="space-y-3">
                {carsOnTheWay.map(car => {
                  const rem = calculateRemainingTime(car.startTime, car.estimatedArrival);
                  return (
                    <motion.div key={car.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} style={{ background: '#fff', border: '2.5px solid #00BBE0', borderRadius: 24, padding: 18 }}>
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2">
                          <motion.div animate={{ x: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 1.5 }} style={{ background: '#0099DD', borderRadius: 16, padding: 10, color: '#fff' }}><CarFront size={22} /></motion.div>
                          <span className="font-black" style={{ background: rem <= 2 ? '#FF9500' : '#0099DD', color: '#fff', fontSize: 12, padding: '6px 14px', borderRadius: 14 }}>{rem > 0 ? `${rem} دقيقة` : 'وصل تقريباً'}</span>
                        </div>
                        <div className="font-black" style={{ fontSize: 18 }}>🚗 {car.carPlate}</div>
                      </div>
                      <div className="mb-3 space-y-2" style={{ background: '#F0F4FF', borderRadius: 18, padding: 14, border: '1px solid #D0DCFF' }}>
                        <div className="flex items-center justify-between">
                          <a href={`tel:${car.customerPhone}`} className="font-black font-mono" style={{ fontSize: 15, color: '#0066FF' }}>{car.customerPhone}</a>
                          <div className="flex items-center gap-1" style={{ color: '#94a3b8' }}><Phone size={14} /><span className="font-bold" style={{ fontSize: 11 }}>الهاتف</span></div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-black font-mono" style={{ fontSize: 15, color: '#00AA44' }}>{car.agreedPrice} ج.م / ساعة</span>
                          <div className="flex items-center gap-1" style={{ color: '#94a3b8' }}><DollarSign size={14} /><span className="font-bold" style={{ fontSize: 11 }}>السعر</span></div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleCarArrived(car)} className="flex-1 font-black flex items-center justify-center gap-2 active:scale-95" style={{ background: 'linear-gradient(135deg,#00CC66,#00AA55)', color: '#fff', borderRadius: 18, padding: 14, fontSize: 13 }}><CheckCircle size={18} /> وصلت وبدء الحساب</button>
                        <a href={`tel:${car.customerPhone}`} className="flex items-center justify-center active:scale-95" style={{ background: '#0066FF', color: '#fff', borderRadius: 18, padding: '0 16px' }}><Phone size={20} /></a>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {garageOffers.length > 0 && (
            <div className="mb-5">
              <h3 className="font-black mb-3 flex items-center gap-2 justify-end" style={{ fontSize: 15, color: '#FF9500' }}>عروض أسعار ({garageOffers.length})</h3>
              <div className="space-y-3">
                {garageOffers.map(o => (
                  <motion.div key={o.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} style={{ background: '#fff', border: '2.5px solid #FFD180', borderRadius: 24, padding: 18 }}>
                    <div className="flex justify-between items-center mb-3">
                      <div className="font-black font-mono" style={{ fontSize: 22 }}>{o.offeredPrice} ج.م</div>
                      <div className="font-black" style={{ fontSize: 15 }}>🚗 {o.carPlate}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { updateOffer(o.id, 'accepted'); toast.success('تم القبول'); }} className="flex-1 font-black flex items-center justify-center gap-1 active:scale-95" style={{ background: 'linear-gradient(135deg,#00CC66,#00AA55)', color: '#fff', borderRadius: 16, padding: 14, fontSize: 13 }}><CheckCircle size={18} /> قبول</button>
                      <button onClick={() => { updateOffer(o.id, 'rejected'); toast.error('تم الرفض'); }} className="flex-1 font-black flex items-center justify-center gap-1 active:scale-95" style={{ background: 'linear-gradient(135deg,#FF3333,#CC0000)', color: '#fff', borderRadius: 16, padding: 14, fontSize: 13 }}><XCircle size={18} /> رفض</button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-5">
            {!showAddCar ? (
              <button onClick={() => setShowAddCar(true)} disabled={garage.availableSpots <= 0} className="w-full font-black flex items-center justify-center gap-2 active:scale-95"
                style={{ background: garage.availableSpots > 0 ? 'linear-gradient(135deg,#0066FF,#0044DD)' : '#D0DCFF', color: garage.availableSpots > 0 ? '#fff' : '#94a3b8', borderRadius: 22, padding: 18, fontSize: 15 }}>
                <Plus size={22} /> {garage.availableSpots > 0 ? 'إضافة سيارة جديدة' : 'لا توجد أماكن'}
              </button>
            ) : (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3" style={{ background: '#fff', border: '2.5px solid #0066FF', borderRadius: 24, padding: 18 }}>
                <input className="w-full font-bold text-right outline-none" style={{ background: '#F0F4FF', border: '2px solid #D0DCFF', padding: 14, borderRadius: 18, fontSize: 15 }} placeholder="رقم لوحة السيارة" value={newCarPlate} onChange={e => setNewCarPlate(e.target.value)} />
                <div>
                  <label className="font-bold block text-right mb-1" style={{ fontSize: 11, color: '#7B8CA6' }}>💰 سعر الساعة</label>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setNewCarPrice(p => Math.max(5, p - 5))} className="active:scale-90" style={{ background: '#FF3333', color: '#fff', width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={18} /></button>
                    <input type="number" value={newCarPrice} onChange={e => setNewCarPrice(Math.max(1, parseInt(e.target.value) || 1))} className="flex-1 text-center font-black outline-none font-mono" style={{ background: '#F0F4FF', border: '2px solid #D0DCFF', padding: 10, borderRadius: 14, fontSize: 20 }} />
                    <button onClick={() => setNewCarPrice(p => p + 5)} className="active:scale-90" style={{ background: '#00CC66', color: '#fff', width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={18} /></button>
                  </div>
                  <div className="flex gap-1.5 mt-2 justify-end">
                    {[10, 15, 20, 25, 30].map(p => (
                      <button key={p} onClick={() => setNewCarPrice(p)} className="font-black active:scale-95" style={{ padding: '5px 12px', borderRadius: 10, fontSize: 11, background: newCarPrice === p ? '#0066FF' : '#F0F4FF', color: newCarPrice === p ? '#fff' : '#64748b', border: newCarPrice === p ? 'none' : '2px solid #D0DCFF' }}>{p}</button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddCar} className="flex-1 font-black active:scale-95" style={{ background: 'linear-gradient(135deg,#00CC66,#00AA55)', color: '#fff', borderRadius: 18, padding: 14, fontSize: 14 }}>إضافة ({newCarPrice} ج.م/ساعة)</button>
                  <button onClick={() => { setShowAddCar(false); setNewCarPlate(''); setNewCarPrice(garage.basePrice); }} className="flex-1 font-black active:scale-95" style={{ background: '#F0F4FF', color: '#64748b', borderRadius: 18, padding: 14, fontSize: 14, border: '2px solid #D0DCFF' }}>إلغاء</button>
                </div>
              </motion.div>
            )}
          </div>

          {/* Active sessions - valetActiveSessions */}
          <div className="mb-5">
            <h3 className="font-black mb-3 flex items-center gap-2 justify-end" style={{ fontSize: 15, color: '#00AA44' }}>
              <span className="font-bold" style={{ fontSize: 10, background: '#0066FF', color: '#fff', padding: '3px 10px', borderRadius: 10 }}>الكل: {activeSessions.length}</span>
              <span className="font-bold" style={{ fontSize: 10, background: '#FF9500', color: '#fff', padding: '3px 10px', borderRadius: 10 }}>جلساتي: {valetActiveSessions.length}</span>
              الجلسات النشطة <Clock size={16} />
            </h3>
            <div className="space-y-3">
              {valetActiveSessions.length === 0 ? (
                <div className="text-center" style={{ background: '#fff', borderRadius: 22, padding: 28, border: '2px solid #D0DCFF', color: '#94a3b8', fontSize: 14 }}>لا توجد جلسات نشطة</div>
              ) : (
                valetActiveSessions.map(s => {
                  const st = toMs(s.startTime);
                  const el = st > 0 ? Math.max(0, Math.floor((Date.now() - st) / 1000)) : 0;
                  const mins = Math.floor(el / 60);
                  const hrs = calculateFullHours(el);
                  const rate = Number(s.agreedPrice ?? garage.basePrice);
                  const cost = calculateCost(el, rate);
                  const isM = s.source === 'manual';
                  const un = undoableSessions.find(u => u.sessionId === s.id || u.localId === s.id);

                  return (
                    <div key={s.id} style={{ background: isM ? '#FFF8F0' : '#F0F8FF', border: `2.5px solid ${isM ? '#FFD180' : '#A0C4FF'}`, borderRadius: 24, padding: 18 }}>
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                          <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, duration: 1.5 }} className="rounded-full" style={{ width: 10, height: 10, background: isM ? '#FF9500' : '#00CC66' }} />
                          <span style={{ fontSize: 12, color: '#7B8CA6' }}>{formatElapsed(el)} • {hrs}ساعة</span>
                          <span className="font-bold" style={{ fontSize: 10, padding: '4px 10px', borderRadius: 12, background: isM ? '#FF9500' : '#0066FF', color: '#fff' }}>{isM ? 'يدوي' : 'تطبيق'}</span>
                        </div>
                        <div className="font-black" style={{ fontSize: 15 }}>🚗 {s.carPlate}</div>
                      </div>
                      <div className="flex items-center justify-end gap-1 mb-2">
                        <span className="font-bold" style={{ fontSize: 9, padding: '3px 8px', borderRadius: 10, background: '#E8F5E9', color: '#2E7D32' }}>👤 جلستي</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openConfirmPayment(s.id, s.carPlate, cost, hrs, mins, s.source, s.agreedPrice)} className="font-black active:scale-95" style={{ background: 'linear-gradient(135deg,#FF3333,#CC0000)', color: '#fff', padding: '10px 18px', borderRadius: 16, fontSize: 12 }}>إنهاء وتحصيل</button>
                          {un && (
                            <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} onClick={() => handleUndoSession(un)} className="font-black flex items-center gap-1 active:scale-95" style={{ background: '#FF9500', color: '#fff', padding: '10px 14px', borderRadius: 14, fontSize: 11 }}><Undo2 size={14} /> ({getUndoRemainingSeconds(un.addedAt)}ث)</motion.button>
                          )}
                        </div>
                        <div className="font-black font-mono" style={{ fontSize: 15, color: '#00AA44' }}>{cost} ج.م</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {/* Owner info bar */}
      {isOwner && (
        <div className="mb-5 flex items-center justify-between" style={{ background: '#fff', borderRadius: 20, padding: '12px 16px', border: '2px solid #D0DCFF' }}>
          <button onClick={openSettings} className="font-bold flex items-center gap-1" style={{ fontSize: 11, color: '#0066FF' }}><Settings size={14} /> تعديل</button>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 11, color: '#7B8CA6' }}>السعر: <span className="font-mono font-black" style={{ color: '#00AA44' }}>{garage.basePrice}ج</span></span>
            <div style={{ width: 2, height: 14, background: '#D0DCFF', borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: '#7B8CA6' }}>عمولة: <span className="font-mono font-black" style={{ color: '#FF9500' }}>{garage.commissionRate}%</span></span>
            <div style={{ width: 2, height: 14, background: '#D0DCFF', borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: '#7B8CA6' }}>متاح: <span className="font-mono font-black" style={{ color: '#0066FF' }}>{garage.availableSpots}/{garage.capacity}</span></span>
          </div>
        </div>
      )}

      {/* Valet info bar */}
      {isValet && (
        <div className="mb-5 flex items-center justify-between" style={{ background: '#fff', borderRadius: 20, padding: '12px 16px', border: '2px solid #D0DCFF' }}>
          <span className="font-bold flex items-center gap-1" style={{ fontSize: 11, color: '#FF9500' }}><HardHat size={14} /> {currentValetName || `سايس ${valetNumber}`}</span>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 11, color: '#7B8CA6' }}>السعر: <span className="font-mono font-black" style={{ color: '#00AA44' }}>{garage.basePrice}ج</span></span>
            <div style={{ width: 2, height: 14, background: '#D0DCFF', borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: '#7B8CA6' }}>متاح: <span className="font-mono font-black" style={{ color: '#0066FF' }}>{garage.availableSpots}/{garage.capacity}</span></span>
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
          <div className="mb-4" style={{ background: '#fff', borderRadius: 24, padding: 16, border: '2px solid #D0DCFF' }}>
            <div className="flex items-center gap-2 mb-3 justify-end"><CalendarDays size={16} style={{ color: '#0066FF' }} /><span className="font-black" style={{ fontSize: 12, color: '#7B8CA6' }}>تصفية بالتاريخ</span></div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div><label className="font-bold block text-right mb-1" style={{ fontSize: 10, color: '#94a3b8' }}>من</label><input type="date" value={logDateFrom} onChange={e => setLogDateFrom(e.target.value)} className="w-full font-bold outline-none" style={{ background: '#F0F4FF', border: '2px solid #D0DCFF', padding: 12, borderRadius: 16, fontSize: 12 }} /></div>
              <div><label className="font-bold block text-right mb-1" style={{ fontSize: 10, color: '#94a3b8' }}>إلى</label><input type="date" value={logDateTo} onChange={e => setLogDateTo(e.target.value)} className="w-full font-bold outline-none" style={{ background: '#F0F4FF', border: '2px solid #D0DCFF', padding: 12, borderRadius: 16, fontSize: 12 }} /></div>
            </div>
            <div className="flex gap-2 mb-3">
              <button onClick={() => { setLogDateFrom(getLocalToday()); setLogDateTo(getLocalToday()); }} className="font-black active:scale-95" style={{ background: '#0066FF', color: '#fff', padding: '10px 14px', borderRadius: 14, fontSize: 11 }}>اليوم</button>
              <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 7); setLogDateFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); setLogDateTo(getLocalToday()); }} className="font-black active:scale-95" style={{ background: '#F0F4FF', color: '#64748b', padding: '10px 14px', borderRadius: 14, fontSize: 11, border: '2px solid #D0DCFF' }}>آخر أسبوع</button>
              <button onClick={() => { const d = new Date(); d.setDate(1); setLogDateFrom(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`); setLogDateTo(getLocalToday()); }} className="font-black active:scale-95" style={{ background: '#F0F4FF', color: '#64748b', padding: '10px 14px', borderRadius: 14, fontSize: 11, border: '2px solid #D0DCFF' }}>هذا الشهر</button>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {[{ id: 'all', label: 'الكل', icon: '📊' }, { id: 'cash', label: 'نقدي', icon: '💵' }, { id: 'instapay', label: 'إنستاباي', icon: '📱' }, { id: 'wallet', label: 'محفظة', icon: '👝' }, { id: 'cashwallet', label: 'كاش', icon: '📲' }].map(f => (
                <button key={f.id} onClick={() => setLogPaymentFilter(f.id)} className="font-black active:scale-95" style={{ padding: '6px 12px', borderRadius: 12, fontSize: 10, background: logPaymentFilter === f.id ? '#0066FF' : '#F0F4FF', color: logPaymentFilter === f.id ? '#fff' : '#64748b', border: logPaymentFilter === f.id ? 'none' : '2px solid #D0DCFF' }}>{f.icon} {f.label}</button>
              ))}
            </div>
          </div>
        )}

        {isValet && (
          <div className="mb-4 text-center" style={{ background: '#EBF2FF', borderRadius: 18, padding: '10px 16px', border: '2px solid #D0DCFF' }}>
            <span className="font-black" style={{ fontSize: 12, color: '#0066FF' }}>📅 {formatLocalDateArabic(getLocalToday())} - عملياتي فقط</span>
          </div>
        )}

        {filteredCompleted.length > 0 && (
          <>
            {filteredStats.pendingCount > 0 && (
              <div className="mb-4" style={{ background: 'linear-gradient(135deg,#FF9500,#FF7700)', borderRadius: 22, padding: 18, color: '#fff', boxShadow: '0 8px 28px rgba(255,149,0,0.3)' }}>
                <div className="flex justify-between items-center">
                  <div className="text-right flex-1">
                    <h3 className="font-black mb-1" style={{ fontSize: 15 }}>⏳ عمليات معلقة للتأكيد</h3>
                    <div className="flex items-center gap-2 justify-end">
                      <span className="font-black" style={{ fontSize: 11, background: 'rgba(255,255,255,0.2)', padding: '3px 10px', borderRadius: 10 }}>{filteredStats.pendingCount} عملية</span>
                    </div>
                  </div>
                  <div className="text-left mr-4">
                    <div className="font-black font-mono" style={{ fontSize: 28 }}>{filteredStats.pendingRevenue.toFixed(0)}</div>
                    <div className="font-bold text-center" style={{ fontSize: 11, opacity: 0.85 }}>ج.م</div>
                  </div>
                </div>
              </div>
            )}

            {/* ✅ الإيراد المؤكد */}
            <div className="mb-4 text-center" style={{ background: 'linear-gradient(135deg,#00CC66,#00AA55)', borderRadius: 24, padding: 22, color: '#fff' }}>
              <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>
                {isValet ? `إيرادي اليوم - ${currentValetName}` : `مؤكد - ${logDateFrom === logDateTo ? formatLocalDateArabic(logDateFrom) : `${logDateFrom} → ${logDateTo}`}`}
              </div>
              <div className="font-black font-mono" style={{ fontSize: 40 }}>{filteredStats.total.toFixed(0)} ج.م</div>
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{filteredCompleted.filter(s => s.revenueConfirmed).length} عملية مؤكدة</div>
            </div>

            {/* ✅ كارت العمولة والصافي - يظهر للمالك فقط */}
            {isOwner && filteredStats.totalCommission > 0 && (
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="text-center" style={{ background: 'linear-gradient(135deg,#FF9500,#FF7700)', borderRadius: 18, padding: 14, color: '#fff' }}>
                  <div className="flex items-center justify-center gap-1 mb-1"><Percent size={14} /></div>
                  <div className="font-black font-mono" style={{ fontSize: 18 }}>{filteredStats.totalCommission.toFixed(0)}</div>
                  <div className="font-bold" style={{ fontSize: 9, opacity: 0.8 }}>عمولة التطبيق</div>
                </div>
                <div className="text-center" style={{ background: 'linear-gradient(135deg,#00AA55,#008844)', borderRadius: 18, padding: 14, color: '#fff' }}>
                  <div className="flex items-center justify-center gap-1 mb-1"><DollarSign size={14} /></div>
                  <div className="font-black font-mono" style={{ fontSize: 18 }}>{filteredStats.totalNet.toFixed(0)}</div>
                  <div className="font-bold" style={{ fontSize: 9, opacity: 0.8 }}>صافي الإيراد</div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { label: 'نقدي', value: filteredStats.cash, icon: '💵', bg: '#00CC66' },
                { label: 'إنستاباي', value: filteredStats.instapay, icon: '📱', bg: '#7C3AED' },
                { label: 'محفظة', value: filteredStats.wallet, icon: '👝', bg: '#0066FF' },
                { label: 'كاش', value: filteredStats.cashwallet, icon: '📲', bg: '#FF8800' },
              ].map(p => (
                <div key={p.label} className="text-center" style={{ background: p.bg, borderRadius: 18, padding: '12px 6px', color: '#fff' }}>
                  <div style={{ fontSize: 20, marginBottom: 2 }}>{p.icon}</div>
                  <div className="font-black font-mono" style={{ fontSize: 15 }}>{p.value.toFixed(0)}</div>
                  <div className="font-bold" style={{ fontSize: 8, opacity: 0.8 }}>{p.label}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {[
                { label: 'يدوي', count: filteredStats.manualCount, total: filteredStats.manualTotal, bg: '#FF9500' },
                { label: 'تطبيق', count: filteredStats.appCount, total: filteredStats.appTotal, bg: '#0066FF' },
              ].map(x => (
                <div key={x.label} className="text-center" style={{ background: x.bg, borderRadius: 18, padding: 14, color: '#fff' }}>
                  <div className="font-black" style={{ fontSize: 12, marginBottom: 4 }}>{x.label}</div>
                  <span className="font-black font-mono" style={{ fontSize: 16 }}>{x.count}</span>
                  <span className="font-black" style={{ fontSize: 12, marginRight: 4 }}> عربية</span>
                  <div style={{ fontSize: 10, opacity: 0.8 }}>({x.total.toFixed(0)} ج.م)</div>
                </div>
              ))}
            </div>

            {isOwner && valetReport.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3 justify-end"><Users size={16} style={{ color: '#0066FF' }} /><h4 className="font-black" style={{ fontSize: 13, color: '#334155' }}>تقرير السياس</h4></div>
                <div className="space-y-2">
                  {valetReport.map((v, i) => (
                    <div key={i} style={{ background: '#fff', borderRadius: 20, padding: '14px 16px', border: `2px solid ${v.color}30` }}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="font-black font-mono" style={{ fontSize: 16, color: v.color }}>{v.total.toFixed(0)} ج.م</div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <div className="font-black" style={{ fontSize: 14 }}>{v.name}</div>
                            <div className="font-bold" style={{ fontSize: 10, color: '#94a3b8' }}>{v.count} سيارة</div>
                          </div>
                          <div style={{ width: 38, height: 38, borderRadius: 12, background: v.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14 }}>{v.icon}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="text-center" style={{ background: '#EBF2FF', borderRadius: 14, padding: '8px 6px', border: '1px solid #D0DCFF' }}>
                          <div style={{ fontSize: 10, color: '#0066FF', fontWeight: 900 }}>📱 تطبيق</div>
                          <div className="font-black font-mono" style={{ fontSize: 14, color: '#0066FF' }}>{v.appCount}</div>
                          <div style={{ fontSize: 9, color: '#7B8CA6' }}>({v.appTotal.toFixed(0)} ج.م)</div>
                        </div>
                        <div className="text-center" style={{ background: '#FFF8F0', borderRadius: 14, padding: '8px 6px', border: '1px solid #FFD180' }}>
                          <div style={{ fontSize: 10, color: '#FF9500', fontWeight: 900 }}>✋ يدوي</div>
                          <div className="font-black font-mono" style={{ fontSize: 14, color: '#FF9500' }}>{v.manualCount}</div>
                          <div style={{ fontSize: 9, color: '#7B8CA6' }}>({v.manualTotal.toFixed(0)} ج.م)</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Completed sessions list */}
        <div className="space-y-2">
          {filteredCompleted.map(session => {
            const isM = session.source === 'manual';
            const et = session.endTime ? toMs(session.endTime) : null;
            const time = et ? new Date(et) : null;
            const rev = getSessionRevenue(session);
            const comm = getSessionCommission(session);
            const net = getSessionNetRevenue(session);
            const isC = session.revenueConfirmed;
            const addedBy = (session as any).addedBy || '';
            return (
              <div key={session.id} style={{ background: isC ? (isM ? '#FFF8F0' : '#EBF5FF') : '#FFFBF0', border: `2px solid ${isC ? (isM ? '#FFD180' : '#A0C4FF') : '#FFD180'}`, borderRadius: 18, padding: 14 }}>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-black" style={{ fontSize: 17, color: isM ? '#E65100' : '#0066FF' }}>{rev.toFixed(0)} ج.م</span>
                    <span className="font-black" style={{ fontSize: 11, padding: '5px 12px', borderRadius: 12, background: isM ? '#FF9500' : '#0066FF', color: '#fff' }}>{isM ? 'يدوي' : 'تطبيق'}</span>
                    {addedBy && isOwner && <span className="font-bold" style={{ fontSize: 9, padding: '3px 8px', borderRadius: 10, background: '#EBF2FF', color: '#0066FF', border: '1px solid #D0DCFF' }}>🅿️ {addedBy}</span>}
                    {!isC ? (
                      <button onClick={async () => { await confirmRevenue(session.id); await fetchGarageDailyStats(); toast.success('تأكيد ✅'); }} className="font-black active:scale-95" style={{ background: '#FF9500', color: '#fff', padding: '3px 10px', borderRadius: 10, fontSize: 9 }}>⏳ تأكيد</button>
                    ) : <span className="font-bold" style={{ fontSize: 9, color: '#00AA44' }}>✅ مؤكد</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="rounded-full" style={{ width: 6, height: 6, background: isM ? '#FF9500' : '#0066FF' }} />
                    <span className="font-black" style={{ fontSize: 15 }}>{session.carPlate}</span>
                  </div>
                </div>

                {/* ✅ عرض العمولة والصافي لكل جلسة تطبيق - للمالك فقط */}
                {isOwner && !isM && comm > 0 && (
                  <div className="flex items-center gap-3 mb-2" style={{ background: '#FFF8F0', borderRadius: 12, padding: '6px 10px', border: '1px solid #FFD180' }}>
                    <div className="flex items-center gap-1">
                      <Percent size={10} style={{ color: '#FF9500' }} />
                      <span className="font-bold" style={{ fontSize: 9, color: '#FF9500' }}>عمولة: {comm.toFixed(0)} ج.م</span>
                    </div>
                    <div style={{ width: 1, height: 12, background: '#FFD180' }} />
                    <div className="flex items-center gap-1">
                      <DollarSign size={10} style={{ color: '#00AA44' }} />
                      <span className="font-bold" style={{ fontSize: 9, color: '#00AA44' }}>صافي: {net.toFixed(0)} ج.م</span>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    {session.paymentMethod && (
                      <span className="font-bold" style={{ fontSize: 9, padding: '3px 10px', borderRadius: 10, color: '#fff', background: session.paymentMethod === 'cash' ? '#00CC66' : session.paymentMethod === 'instapay' ? '#7C3AED' : session.paymentMethod === 'wallet' ? '#0066FF' : '#FF8800' }}>
                        {session.paymentMethod === 'cash' ? '💵 نقدي' : session.paymentMethod === 'instapay' ? '📱 إنستاباي' : session.paymentMethod === 'wallet' ? '👝 محفظة' : '📲 كاش'}
                      </span>
                    )}
                  </div>
                  {time && <span className="font-mono font-black" style={{ fontSize: 12 }}>{time.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })} · {time.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}</span>}
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
    </div>
  );
}