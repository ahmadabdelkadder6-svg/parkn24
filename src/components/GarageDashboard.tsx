import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Car,
  Clock,
  DollarSign,
  LogOut,
  Plus,
  CheckCircle,
  XCircle,
  Settings,
  Minus,
  Save,
  MapPin,
  Edit3,
  Navigation,
  Phone,
  CarFront,
  FileText,
  CalendarDays,
  Undo2,
} from 'lucide-react';
import { useStore, pausePolling } from '../store';
import { shallow } from 'zustand/shallow';
import { supabase } from '../lib/supabase';
import { calculateFullHours, calculateCost } from '../utils/pricing';
import toast from 'react-hot-toast';
import { subscribeToPush } from '../lib/pushManager';
import InstallPWABanner from './InstallPWABanner';

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

// ─── دوال التاريخ المحلي ─────────────────────────────────────────────────────
const getLocalToday = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const timestampToLocalDate = (timestamp: number): string => {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatLocalDateArabic = (dateStr: string): string => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

// ─── إدارة AudioContext ───────────────────────────────────────────────────────
let audioCtxInstance: AudioContext | null = null;
let audioCtxReady = false;

const initAudioContext = async (): Promise<AudioContext | null> => {
  try {
    if (!audioCtxInstance) {
      const AudioCtxClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return null;
      audioCtxInstance = new AudioCtxClass();
    }
    if (audioCtxInstance.state === 'suspended') {
      await audioCtxInstance.resume();
    }
    audioCtxReady = audioCtxInstance.state === 'running';
    return audioCtxInstance;
  } catch {
    return null;
  }
};

const getAudioCtx = (): AudioContext | null => {
  if (!audioCtxInstance) return null;
  if (audioCtxInstance.state === 'closed') {
    audioCtxInstance = null;
    audioCtxReady = false;
    return null;
  }
  return audioCtxInstance;
};

// ✅ مش بتتنادى على مستوى الملف - بتتنادى داخل useEffect
const setupAudioOnInteraction = () => {
  const events = ['touchstart', 'touchend', 'mousedown', 'keydown', 'click'];
  const handler = async () => {
    if (!audioCtxReady) {
      await initAudioContext();
      if (audioCtxReady) {
        events.forEach((e) => document.removeEventListener(e, handler));
      }
    }
  };
  events.forEach((e) =>
    document.addEventListener(e, handler, { passive: true })
  );

  // ✅ رجّع cleanup function
  return () => {
    events.forEach((e) => document.removeEventListener(e, handler));
  };
};

// ─── دوال الصوت والاهتزاز ────────────────────────────────────────────────────
const vibrateDevice = () => {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([500, 150, 500, 150, 700, 200, 700, 150, 500, 150, 900]);
    }
  } catch {}
};

const sendNotification = (title: string, body: string, tag: string) => {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(title, {
        body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        tag,
        requireInteraction: true,
        silent: false,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
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
    const patterns = [
      { freq: 800, delay: 0, dur: 0.15 },
      { freq: 1000, delay: 0.2, dur: 0.15 },
      { freq: 1200, delay: 0.4, dur: 0.2 },
      { freq: 800, delay: 0.7, dur: 0.15 },
      { freq: 1000, delay: 0.9, dur: 0.15 },
      { freq: 1200, delay: 1.1, dur: 0.2 },
      { freq: 1400, delay: 1.5, dur: 0.4 },
    ];
    patterns.forEach(({ freq, delay, dur }) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.connect(gain);
      gain.connect(ctx!.destination);
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.5, ctx!.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        ctx!.currentTime + delay + dur
      );
      osc.start(ctx!.currentTime + delay);
      osc.stop(ctx!.currentTime + delay + dur + 0.05);
    });
  } catch (err) {
    console.warn('⚠️ خطأ في صوت التنبيه الأول:', err);
  }
};

const fireNewCarAlert = (
  carPlate: string,
  customerName?: string,
  agreedPrice?: number
) => {
  playFirstAlert();
  vibrateDevice();
  const body = [
    `🚗 ${carPlate}`,
    customerName ? `👤 ${customerName}` : '',
    agreedPrice ? `💰 ${agreedPrice} ج.م/ساعة` : '',
  ]
    .filter(Boolean)
    .join('\n');
  sendNotification('🚨 سيارة في الطريق!', body, `incoming-${carPlate}`);
};

const playApproachingAlert = async () => {
  let ctx = getAudioCtx();
  if (!ctx || !audioCtxReady) ctx = await initAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    const patterns = [
      { freq: 1000, delay: 0, dur: 0.2 },
      { freq: 1300, delay: 0.25, dur: 0.2 },
      { freq: 1600, delay: 0.5, dur: 0.3 },
      { freq: 1000, delay: 0.9, dur: 0.2 },
      { freq: 1300, delay: 1.15, dur: 0.2 },
      { freq: 1600, delay: 1.4, dur: 0.3 },
      { freq: 1800, delay: 1.8, dur: 0.5 },
    ];
    patterns.forEach(({ freq, delay, dur }) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.connect(gain);
      gain.connect(ctx!.destination);
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.6, ctx!.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        ctx!.currentTime + delay + dur
      );
      osc.start(ctx!.currentTime + delay);
      osc.stop(ctx!.currentTime + delay + dur + 0.05);
    });
  } catch (err) {
    console.warn('⚠️ خطأ في صوت تنبيه الاقتراب:', err);
  }
};

const fireApproachingAlert = (carPlate: string) => {
  playApproachingAlert();
  vibrateDevice();
  sendNotification(
    '🚗 سيارة على وشك الوصول!',
    `🚗 ${carPlate} - باقي أقل من دقيقتين ⏰`,
    `approaching-${carPlate}`
  );
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function GarageDashboard() {
  // ✅ التعديل الأساسي: selector + shallow لمنع re-renders الزيادة
  const {
    garages,
    currentGarageId,
    setCurrentGarageId,
    sessions,
    addSession,
    endSession,
    removeSession,
    offers,
    updateOffer,
    cancelOffer,
    updateGarage,
    incomingCars,
    removeIncomingCar,
    fetchAll,
    confirmRevenue,
  } = useStore(
    (s) => ({
      garages: s.garages,
      currentGarageId: s.currentGarageId,
      setCurrentGarageId: s.setCurrentGarageId,
      sessions: s.sessions,
      addSession: s.addSession,
      endSession: s.endSession,
      removeSession: s.removeSession,
      offers: s.offers,
      updateOffer: s.updateOffer,
      cancelOffer: s.cancelOffer,
      updateGarage: s.updateGarage,
      incomingCars: s.incomingCars,
      removeIncomingCar: s.removeIncomingCar,
      fetchAll: s.fetchAll,
      confirmRevenue: s.confirmRevenue,
    }),
    shallow
  );

  // ✅ useMemo للحسابات المتكررة بدل إعادة الحساب في كل render
  const garage = useMemo(
    () => garages.find((g) => g.id === currentGarageId) ?? null,
    [garages, currentGarageId]
  );

  const garageSessions = useMemo(
    () => sessions.filter((s) => s.garageId === currentGarageId),
    [sessions, currentGarageId]
  );

  const activeSessions = useMemo(
    () =>
      garageSessions.filter(
        (s) =>
          s.status === 'active' &&
          Date.now() - s.startTime < 24 * 60 * 60 * 1000
      ),
    [garageSessions]
  );

  const completedSessions = useMemo(
    () => garageSessions.filter((s) => s.status === 'completed'),
    [garageSessions]
  );

  const garageOffers = useMemo(
    () =>
      offers.filter(
        (o) => o.garageId === currentGarageId && o.status === 'pending'
      ),
    [offers, currentGarageId]
  );

  const carsOnTheWay = useMemo(
    () =>
      incomingCars.filter(
        (c) => c.garageId === currentGarageId && c.status === 'coming'
      ),
    [incomingCars, currentGarageId]
  );

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
  const [logDateFilter, setLogDateFilter] = useState(() => getLocalToday());
  const [logPaymentFilter, setLogPaymentFilter] = useState<string>('all');
  const [confirmSession, setConfirmSession] = useState<{
    id: string;
    carPlate: string;
    cost: number;
    hours: number;
    minutes: number;
    source: 'app' | 'manual';
    agreedPrice?: number;
  } | null>(null);
  const [confirmPaymentMethod, setConfirmPaymentMethod] = useState('cash');
  const [tick, setTick] = useState(0);
  const [garageDailyStats, setGarageDailyStats] = useState<DailyStat[]>([]);

  // ✅ setupAudioOnInteraction داخل useEffect مع cleanup
  useEffect(() => {
    const cleanup = setupAudioOnInteraction();
    return cleanup;
  }, []);

  // ─── تهيئة الصوت + طلب إذن الإشعارات ───────────────────────────────────
  useEffect(() => {
    const initAll = async () => {
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      if (!audioInitializedRef.current) {
        await initAudioContext();
        audioInitializedRef.current = true;
      }
    };
    initAll();
  }, []);

  // ─── تسجيل الجراج في Push Notifications ─────────────────────────────────
  useEffect(() => {
    if (!currentGarageId || garages.length === 0) return;
    if (pushSubscribedGarageRef.current === currentGarageId) return;

    const setupGaragePush = async () => {
      try {
        const success = await subscribeToPush(currentGarageId);
        if (success) {
          pushSubscribedGarageRef.current = currentGarageId;
          console.log('✅ تم تسجيل الجراج في Push:', currentGarageId);
        }
      } catch (err) {
        console.error('❌ خطأ في تسجيل Push للجراج:', err);
      }
    };

    setupGaragePush();
  }, [currentGarageId, garages.length]);

  // ─── تنبيه 1: مراقبة السيارات الجديدة ───────────────────────────────────
  useEffect(() => {
    const currentIds = new Set(carsOnTheWay.map((c) => c.id));

    carsOnTheWay.forEach((car) => {
      if (!prevIncomingIdsRef.current.has(car.id)) {
        if (!document.hidden) {
          fireNewCarAlert(car.carPlate, car.customerName, car.agreedPrice);
          toast(
            `🚨 سيارة في الطريق!\n🚗 ${car.carPlate}${car.agreedPrice ? ` - ${car.agreedPrice} ج.م/ساعة` : ''}`,
            {
              duration: 10000,
              style: {
                background: '#0f172a',
                color: '#f1f5f9',
                border: '2px solid #06b6d4',
                fontWeight: 'bold',
                fontSize: '14px',
              },
              icon: '🚨',
            }
          );
        }
      }
    });

    prevIncomingIdsRef.current.forEach((prevId) => {
      if (!currentIds.has(prevId)) {
        approachAlertedRef.current.delete(prevId);
        try {
          if ('vibrate' in navigator) navigator.vibrate(0);
        } catch {}
      }
    });

    prevIncomingIdsRef.current = currentIds;
  }, [carsOnTheWay]);

  // ─── تنبيه 2: مراقبة اقتراب السيارات ────────────────────────────────────
  useEffect(() => {
    carsOnTheWay.forEach((car) => {
      if (approachAlertedRef.current.has(car.id)) return;

      const start =
        typeof car.startTime === 'number'
          ? car.startTime
          : new Date(car.startTime).getTime();

      const elapsedMinutes = (Date.now() - start) / 60000;
      const remainingMinutes = Math.max(
        0,
        car.estimatedArrival - elapsedMinutes
      );

      if (
        remainingMinutes <= 2 &&
        remainingMinutes >= 0 &&
        car.estimatedArrival > 2
      ) {
        approachAlertedRef.current.add(car.id);

        if (!document.hidden) {
          fireApproachingAlert(car.carPlate);
          toast(
            `🚗 سيارة على وشك الوصول!\n${car.carPlate} - باقي أقل من دقيقتين ⏰`,
            {
              duration: 10000,
              style: {
                background: '#0f172a',
                color: '#f1f5f9',
                border: '2px solid #f59e0b',
                fontWeight: 'bold',
                fontSize: '14px',
              },
              icon: '⏰',
            }
          );
        }
      }
    });
  }, [carsOnTheWay, tick]);

  // ─── مراقبة العروض الجديدة ───────────────────────────────────────────────
  useEffect(() => {
    garageOffers.forEach((offer) => {
      if (!prevOfferIdsRef.current.has(offer.id)) {
        toast(
          `💰 عرض سعر جديد!\n🚗 ${offer.carPlate} - ${offer.offeredPrice} ج.م/ساعة`,
          {
            duration: 8000,
            style: {
              background: '#0f172a',
              color: '#f1f5f9',
              border: '2px solid #f59e0b',
              fontWeight: 'bold',
            },
            icon: '💰',
          }
        );
      }
    });
    prevOfferIdsRef.current = new Set(garageOffers.map((o) => o.id));
  }, [garageOffers]);

  // ─── cleanup عند الخروج ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      try {
        if ('vibrate' in navigator) navigator.vibrate(0);
      } catch {}
    };
  }, []);

  // ─── جلب daily_stats ─────────────────────────────────────────────────────
  const fetchGarageDailyStats = useCallback(async () => {
    if (!currentGarageId) return;
    try {
      let query = supabase
        .from('daily_stats')
        .select('*')
        .eq('garage_id', currentGarageId);
      if (logDateFilter) {
        query = query.eq('stat_date', logDateFilter);
      }
      const { data, error } = await query;
      if (error) {
        console.error('❌ خطأ في جلب garage daily_stats:', error);
        return;
      }
      setGarageDailyStats(data ?? []);
    } catch (err) {
      console.error('❌ خطأ غير متوقع:', err);
    }
  }, [currentGarageId, logDateFilter]);

  useEffect(() => {
    fetchGarageDailyStats();
  }, [fetchGarageDailyStats]);

  const totalRevenueFromStats = useMemo(
    () =>
      garageDailyStats.reduce(
        (a, s) => a + Number(s.confirmed_revenue ?? 0),
        0
      ),
    [garageDailyStats]
  );

  const pendingRevenueFromStats = useMemo(
    () =>
      garageDailyStats.reduce(
        (a, s) => a + Number(s.pending_revenue ?? 0),
        0
      ),
    [garageDailyStats]
  );

  const paymentStatsFromDB = useMemo(
    () => ({
      cash: garageDailyStats.reduce(
        (a, s) => a + Number(s.cash_revenue ?? 0),
        0
      ),
      instapay: garageDailyStats.reduce(
        (a, s) => a + Number(s.instapay_revenue ?? 0),
        0
      ),
      wallet: garageDailyStats.reduce(
        (a, s) => a + Number(s.wallet_revenue ?? 0),
        0
      ),
      cashwallet: garageDailyStats.reduce(
        (a, s) => a + Number(s.cashwallet_revenue ?? 0),
        0
      ),
      totalSessions: garageDailyStats.reduce(
        (a, s) => a + Number(s.total_sessions ?? 0),
        0
      ),
      manualSessions: garageDailyStats.reduce(
        (a, s) => a + Number(s.manual_sessions ?? 0),
        0
      ),
      appSessions: garageDailyStats.reduce(
        (a, s) => a + Number(s.app_sessions ?? 0),
        0
      ),
    }),
    [garageDailyStats]
  );

  const getSessionRevenue = useCallback(
    (s: (typeof completedSessions)[0]) => {
      if (s.totalPrice != null && Number(s.totalPrice) > 0)
        return Number(s.totalPrice);
      if (s.endTime && s.startTime) {
        const start =
          typeof s.startTime === 'number'
            ? s.startTime
            : new Date(s.startTime).getTime();
        const end =
          typeof s.endTime === 'number'
            ? s.endTime
            : new Date(s.endTime).getTime();
        const elapsed = Math.max(0, Math.floor((end - start) / 1000));
        const rate = Number(s.agreedPrice ?? garage?.basePrice ?? 0);
        return calculateCost(elapsed, rate);
      }
      return 0;
    },
    [garage?.basePrice]
  );

  const totalRevenue = useMemo(
    () =>
      completedSessions
        .filter((s) => s.revenueConfirmed)
        .reduce((acc, s) => acc + getSessionRevenue(s), 0),
    [completedSessions, getSessionRevenue]
  );

  const getActiveCost = useCallback(
    (session: (typeof activeSessions)[0]) => {
      const startTime =
        typeof session.startTime === 'number'
          ? session.startTime
          : new Date(session.startTime).getTime();
      const elapsed = Math.max(
        0,
        Math.floor((Date.now() - startTime) / 1000)
      );
      const rate = Number(session.agreedPrice ?? garage?.basePrice ?? 0);
      if (isNaN(elapsed) || elapsed <= 0) return 0;
      if (isNaN(rate) || rate <= 0) return 0;
      return calculateCost(elapsed, rate);
    },
    [garage?.basePrice]
  );

  const filteredCompleted = useMemo(() => {
    return completedSessions.filter((s) => {
      if (logDateFilter && s.endTime) {
        const endTime =
          typeof s.endTime === 'number'
            ? s.endTime
            : new Date(s.endTime).getTime();
        if (timestampToLocalDate(endTime) !== logDateFilter) return false;
      }
      if (logPaymentFilter !== 'all' && s.paymentMethod !== logPaymentFilter)
        return false;
      return true;
    });
  }, [completedSessions, logDateFilter, logPaymentFilter]);

  const filteredStats = useMemo(() => {
    const confirmed = filteredCompleted.filter((s) => s.revenueConfirmed);
    const unconfirmed = filteredCompleted.filter((s) => !s.revenueConfirmed);
    const hasStatsForDate = garageDailyStats.length > 0;

    const cash = hasStatsForDate
      ? paymentStatsFromDB.cash
      : confirmed
          .filter((s) => s.paymentMethod === 'cash')
          .reduce((a, s) => a + getSessionRevenue(s), 0);
    const instapay = hasStatsForDate
      ? paymentStatsFromDB.instapay
      : confirmed
          .filter((s) => s.paymentMethod === 'instapay')
          .reduce((a, s) => a + getSessionRevenue(s), 0);
    const wallet = hasStatsForDate
      ? paymentStatsFromDB.wallet
      : confirmed
          .filter((s) => s.paymentMethod === 'wallet')
          .reduce((a, s) => a + getSessionRevenue(s), 0);
    const cashwallet = hasStatsForDate
      ? paymentStatsFromDB.cashwallet
      : confirmed
          .filter((s) => s.paymentMethod === 'cashwallet')
          .reduce((a, s) => a + getSessionRevenue(s), 0);
    const total = hasStatsForDate
      ? garageDailyStats.reduce(
          (a, s) => a + Number(s.confirmed_revenue ?? 0),
          0
        )
      : cash + instapay + wallet + cashwallet;

    const manual = confirmed.filter((s) => s.source === 'manual');
    const app = confirmed.filter((s) => s.source === 'app');
    const pendingRevenue = hasStatsForDate
      ? pendingRevenueFromStats
      : unconfirmed.reduce((a, s) => a + getSessionRevenue(s), 0);

    return {
      cash,
      instapay,
      wallet,
      cashwallet,
      total,
      manualCount: hasStatsForDate
        ? paymentStatsFromDB.manualSessions
        : manual.length,
      appCount: hasStatsForDate
        ? paymentStatsFromDB.appSessions
        : app.length,
      manualTotal: manual.reduce((a, s) => a + getSessionRevenue(s), 0),
      appTotal: app.reduce((a, s) => a + getSessionRevenue(s), 0),
      pendingRevenue,
      pendingCount: unconfirmed.length,
    };
  }, [
    filteredCompleted,
    getSessionRevenue,
    garageDailyStats,
    paymentStatsFromDB,
    pendingRevenueFromStats,
  ]);

  const handleUndoSession = useCallback(
    (undoable: UndoableSession) => {
      if (!garage) return;
      removeSession(undoable.sessionId);
      if (undoable.localId !== undoable.sessionId)
        removeSession(undoable.localId);
      const currentSessions = useStore.getState().sessions;
      const matchingSession = currentSessions.find(
        (s) =>
          s.carPlate === undoable.carPlate &&
          s.source === 'manual' &&
          s.status === 'active' &&
          Math.abs(s.startTime - undoable.addedAt) < 5000
      );
      if (matchingSession) removeSession(matchingSession.id);
      setUndoableSessions((prev) =>
        prev.filter(
          (u) =>
            u.sessionId !== undoable.sessionId &&
            u.localId !== undoable.localId
        )
      );
      toast('تم إلغاء إضافة السيارة ' + undoable.carPlate + ' ↩️', {
        icon: '🔙',
        style: {
          background: '#1e293b',
          color: '#f1f5f9',
          border: '1px solid #334155',
        },
      });
    },
    [garage, removeSession]
  );

  const getUndoRemainingSeconds = useCallback((addedAt: number) => {
    return Math.max(
      0,
      UNDO_TIMEOUT_SECONDS - Math.floor((Date.now() - addedAt) / 1000)
    );
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (garage) setNewCarPrice(garage.basePrice);
  }, [garage?.basePrice]);

  useEffect(() => {
    setUndoableSessions((prev) => {
      return prev
        .filter(
          (u) =>
            Math.floor((Date.now() - u.addedAt) / 1000) < UNDO_TIMEOUT_SECONDS
        )
        .map((u) => {
          const stillExists = sessions.find((s) => s.id === u.sessionId);
          if (!stillExists) {
            const newSession = sessions.find(
              (s) =>
                s.carPlate === u.carPlate &&
                s.source === 'manual' &&
                s.status === 'active' &&
                Math.abs(s.startTime - u.addedAt) < 5000
            );
            if (newSession) return { ...u, sessionId: newSession.id };
          }
          return u;
        });
    });
  }, [tick, sessions]);

  if (!garage) return null;

  const handleAddCar = async () => {
    if (!newCarPlate.trim()) {
      toast.error('أدخل رقم السيارة');
      return;
    }
    const carPlate = newCarPlate.trim();
    const price = newCarPrice;
    const addedAt = Date.now();
    const sessionId = await addSession({
      garageId: garage.id,
      carPlate,
      startTime: addedAt,
      status: 'active',
      source: 'manual',
      agreedPrice: price,
    });
    const finalSessionId = sessionId || `fallback-${addedAt}`;
    setUndoableSessions((prev) => [
      ...prev,
      {
        sessionId: finalSessionId,
        localId: finalSessionId,
        carPlate,
        price,
        addedAt,
      },
    ]);
    toast.success(`تم إضافة السيارة بسعر ${price} ج.م/ساعة`);
    setNewCarPlate('');
    setNewCarPrice(garage.basePrice);
    setShowAddCar(false);
  };

  const openConfirmPayment = (
    sessionId: string,
    carPlate: string,
    cost: number,
    hours: number,
    minutes: number,
    source: 'app' | 'manual',
    agreedPrice?: number
  ) => {
    const finalCost =
      cost > 0
        ? cost
        : (() => {
            const session = activeSessions.find((s) => s.id === sessionId);
            if (!session) return 0;
            return getActiveCost(session);
          })();
    setConfirmSession({
      id: sessionId,
      carPlate,
      cost: finalCost,
      hours,
      minutes,
      source,
      agreedPrice,
    });
    setConfirmPaymentMethod('cash');
  };

  const handleConfirmPayment = async () => {
    if (!confirmSession) return;
    if (isEndingSessionRef.current) return;
    isEndingSessionRef.current = true;
    pausePolling(20000);
    try {
      const sessionCopy = { ...confirmSession };
      const paymentCopy = confirmPaymentMethod;
      const sessionData = useStore
        .getState()
        .sessions.find((s) => s.id === sessionCopy.id);
      const isAppSession = sessionData?.source === 'app';
      setConfirmSession(null);
      setUndoableSessions((prev) =>
        prev.filter(
          (u) =>
            u.sessionId !== sessionCopy.id && u.localId !== sessionCopy.id
        )
      );
      await endSession(sessionCopy.id, sessionCopy.cost, paymentCopy);
      if (isAppSession)
        await new Promise((resolve) => setTimeout(resolve, 5000));
      await fetchGarageDailyStats();
      const methodLabel =
        paymentCopy === 'cash'
          ? 'نقدي 💵'
          : paymentCopy === 'instapay'
          ? 'إنستاباي 📱'
          : paymentCopy === 'wallet'
          ? 'خصم من المحفظة 👝'
          : 'تحويل محفظة كاش 📲';
      toast.success(
        `تم تحصيل ${sessionCopy.cost} ج.م (${methodLabel}) ✅`
      );
    } finally {
      setTimeout(() => {
        isEndingSessionRef.current = false;
      }, 2000);
    }
  };

  const handleSaveSettings = () => {
    updateGarage(garage.id, {
      basePrice: editPrice,
      availableSpots: Math.min(editSpots, editCapacity),
      capacity: editCapacity,
    });
    toast.success('تم تحديث الإعدادات بنجاح! ⚡');
    setShowSettings(false);
  };

  const openSettings = () => {
    setEditPrice(garage.basePrice);
    setEditSpots(garage.availableSpots);
    setEditCapacity(garage.capacity);
    setShowSettings(true);
  };

  const handleCarArrived = async (
    carId: string,
    carPlate: string,
    agreedPrice: number
  ) => {
    if (processedCarsRef.current.has(carId)) return;
    processedCarsRef.current.add(carId);
    pausePolling(10000);
    try {
      const normalizedPlate = carPlate.trim().toUpperCase();
      const existingLocal = useStore
        .getState()
        .sessions.find(
          (s) =>
            s.carPlate.trim().toUpperCase() === normalizedPlate &&
            s.status === 'active'
        );
      if (existingLocal) {
        await removeIncomingCar(carId);
        await supabase
          .from('incoming_cars')
          .delete()
          .eq('car_plate', normalizedPlate)
          .eq('garage_id', garage.id);
        toast('الجلسة شغالة بالفعل ✅', {
          icon: '🚗',
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            border: '1px solid #334155',
          },
        });
        return;
      }
      try {
        const { data: dbCheck } = await supabase
          .from('sessions')
          .select('id')
          .eq('car_plate', normalizedPlate)
          .eq('status', 'active')
          .limit(1);
        if (dbCheck && dbCheck.length > 0) {
          await removeIncomingCar(carId);
          await supabase
            .from('incoming_cars')
            .delete()
            .eq('car_plate', normalizedPlate)
            .eq('garage_id', garage.id);
          await fetchAll();
          toast('الجلسة شغالة بالفعل ✅', {
            icon: '🚗',
            style: {
              background: '#1e293b',
              color: '#f1f5f9',
              border: '1px solid #334155',
            },
          });
          return;
        }
      } catch (err) {
        console.error('خطأ في التحقق من DB:', err);
      }

      const relatedOffer = offers.find(
        (o) =>
          o.carPlate.trim().toUpperCase() === normalizedPlate &&
          (o.status === 'pending' || o.status === 'accepted')
      );
      if (relatedOffer) cancelOffer(relatedOffer.id);

      await addSession({
        garageId: garage.id,
        carPlate: normalizedPlate,
        startTime: Date.now(),
        status: 'active',
        source: 'app',
        agreedPrice,
      });
      await removeIncomingCar(carId);
      await supabase
        .from('incoming_cars')
        .delete()
        .eq('car_plate', normalizedPlate)
        .eq('garage_id', garage.id);
      toast.success(`بدأ حساب السيارة ${carPlate} 🚗`);
    } catch (err) {
      console.error('❌ خطأ في handleCarArrived:', err);
      processedCarsRef.current.delete(carId);
      toast.error('حدث خطأ، حاول مرة أخرى');
    }
  };

  const calculateRemainingTime = (
    startTime: number,
    estimatedMinutes: number
  ) => {
    const start =
      typeof startTime === 'number'
        ? startTime
        : new Date(startTime).getTime();
    const elapsed = Math.floor((Date.now() - start) / 60000);
    return Math.max(0, estimatedMinutes - elapsed);
  };

  // ─── JSX - كما هو بدون أي تغيير ──────────────────────────────────────────
  return (
    <div className="h-full bg-slate-950 text-white p-5 overflow-y-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 pt-14">
        <button
          onClick={() => setCurrentGarageId(null)}
          className="bg-slate-900 p-3 rounded-2xl border border-slate-800"
        >
          <LogOut size={18} />
        </button>
        <div className="text-right flex-1 mr-3">
          <h2 className="text-xl font-black text-white">{garage.name}</h2>
          <p className="text-xs text-slate-400 flex items-center gap-1 justify-end">
            <MapPin size={10} />
            {garage.location}
          </p>
        </div>
        <button
          onClick={openSettings}
          className="bg-blue-600 p-3 rounded-2xl border border-blue-500/30 shadow-lg shadow-blue-900/20"
        >
          <Settings size={18} />
        </button>
      </div>

      {/* مؤشر حالة التنبيهات */}
      <div className="mb-4 bg-emerald-600/10 border border-emerald-500/20 rounded-2xl p-3 flex items-center justify-between">
        <button
          onClick={() => {
            playFirstAlert();
            vibrateDevice();
            toast('🔔 تجربة التنبيه - صوت واهتزاز!', {
              icon: '🔊',
              duration: 3000,
              style: {
                background: '#1e293b',
                color: '#f1f5f9',
                border: '1px solid #334155',
              },
            });
          }}
          className="text-[10px] text-emerald-400 font-bold bg-emerald-600/20 px-3 py-1.5 rounded-lg border border-emerald-500/20 active:scale-95 transition-all"
        >
          🔊 تجربة
        </button>
        <div className="text-right flex items-center gap-2">
          <div className="text-right">
            <span className="text-xs font-black text-emerald-400">
              ✅ التنبيهات مفعّلة
            </span>
            <div className="text-[9px] text-slate-500">
              صوت + اهتزاز عند وصول وقرب العربيات
            </div>
          </div>
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
        </div>
      </div>

      <InstallPWABanner />

      {/* Settings Modal */}
      {showSettings && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowSettings(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => setShowSettings(false)}
                className="text-slate-500 hover:text-white transition-colors text-lg"
              >
                ✕
              </button>
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Settings size={18} className="text-blue-400" />
                إعدادات الجراج
              </h3>
            </div>
            <div className="mb-6">
              <label className="text-xs font-black text-slate-400 mb-2 block text-right">
                💰 سعر الساعة (ج.م)
              </label>
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <button
                    onClick={() => setEditPrice((p) => Math.max(5, p - 5))}
                    className="bg-red-600/20 text-red-400 w-12 h-12 rounded-xl flex items-center justify-center border border-red-500/20 active:scale-90 transition-all"
                  >
                    <Minus size={20} />
                  </button>
                  <div className="text-center flex-1">
                    <input
                      type="number"
                      value={editPrice}
                      onChange={(e) =>
                        setEditPrice(
                          Math.max(1, parseInt(e.target.value) || 0)
                        )
                      }
                      className="bg-transparent text-4xl font-black text-white text-center w-full outline-none font-mono"
                    />
                    <div className="text-[10px] text-slate-500 font-bold">
                      ج.م / ساعة
                    </div>
                  </div>
                  <button
                    onClick={() => setEditPrice((p) => p + 5)}
                    className="bg-emerald-600/20 text-emerald-400 w-12 h-12 rounded-xl flex items-center justify-center border border-emerald-500/20 active:scale-90 transition-all"
                  >
                    <Plus size={20} />
                  </button>
                </div>
                <div className="flex gap-2 justify-center mt-3">
                  {[10, 15, 20, 25, 30].map((p) => (
                    <button
                      key={p}
                      onClick={() => setEditPrice(p)}
                      className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                        editPrice === p
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mb-6">
              <label className="text-xs font-black text-slate-400 mb-2 block text-right">
                🚗 الأماكن المتاحة حالياً
              </label>
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <button
                    onClick={() =>
                      setEditSpots((s) => Math.max(0, s - 1))
                    }
                    className="bg-red-600/20 text-red-400 w-12 h-12 rounded-xl flex items-center justify-center border border-red-500/20 active:scale-90 transition-all"
                  >
                    <Minus size={20} />
                  </button>
                  <div className="text-center flex-1">
                    <input
                      type="number"
                      value={editSpots}
                      onChange={(e) =>
                        setEditSpots(
                          Math.max(
                            0,
                            Math.min(
                              editCapacity,
                              parseInt(e.target.value) || 0
                            )
                          )
                        )
                      }
                      className="bg-transparent text-4xl font-black text-blue-400 text-center w-full outline-none font-mono"
                    />
                    <div className="text-[10px] text-slate-500 font-bold">
                      من {editCapacity} مكان
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setEditSpots((s) => Math.min(editCapacity, s + 1))
                    }
                    className="bg-emerald-600/20 text-emerald-400 w-12 h-12 rounded-xl flex items-center justify-center border border-emerald-500/20 active:scale-90 transition-all"
                  >
                    <Plus size={20} />
                  </button>
                </div>
                <div className="mt-3 bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-600 to-emerald-500 h-full transition-all duration-300"
                    style={{
                      width: `${
                        editCapacity > 0
                          ? (editSpots / editCapacity) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="mb-6">
              <label className="text-xs font-black text-slate-400 mb-2 block text-right">
                🏢 السعة الكلية للجراج
              </label>
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <button
                    onClick={() =>
                      setEditCapacity((c) => Math.max(editSpots, c - 10))
                    }
                    className="bg-slate-800 text-slate-400 w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-all"
                  >
                    <Minus size={16} />
                  </button>
                  <div className="text-center flex-1">
                    <input
                      type="number"
                      value={editCapacity}
                      onChange={(e) =>
                        setEditCapacity(
                          Math.max(
                            editSpots,
                            parseInt(e.target.value) || editSpots
                          )
                        )
                      }
                      className="bg-transparent text-2xl font-black text-purple-400 text-center w-full outline-none font-mono"
                    />
                    <div className="text-[10px] text-slate-500 font-bold">
                      مكان إجمالي
                    </div>
                  </div>
                  <button
                    onClick={() => setEditCapacity((c) => c + 10)}
                    className="bg-slate-800 text-slate-400 w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-all"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={handleSaveSettings}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-xl shadow-emerald-900/30"
            >
              <Save size={18} /> حفظ التغييرات
            </button>
          </motion.div>
        </motion.div>
      )}

      {/* Confirm Payment Modal */}
      {confirmSession && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center p-4"
          onClick={() => setConfirmSession(null)}
        >
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', damping: 25 }}
            className="bg-slate-900 border border-slate-800 rounded-t-[2.5rem] rounded-b-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-5" />
            <h3 className="text-lg font-black text-white text-center mb-1">
              تأكيد تحصيل السداد
            </h3>
            <p className="text-xs text-slate-500 text-center mb-5">
              لن يتم إنهاء الجلسة إلا بعد تأكيد السداد
            </p>
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 mb-5">
              <div className="flex justify-between items-center mb-3">
                <span
                  className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                    confirmSession.source === 'manual'
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-blue-500/20 text-blue-400'
                  }`}
                >
                  {confirmSession.source === 'manual' ? 'يدوي' : 'تطبيق'}
                </span>
                <div className="text-lg font-black text-white">
                  🚗 {confirmSession.carPlate}
                </div>
              </div>
              {confirmSession.agreedPrice &&
                confirmSession.agreedPrice !== garage.basePrice && (
                  <div className="bg-amber-600/10 border border-amber-500/20 rounded-xl p-2 mb-3 text-center">
                    <p className="text-[10px] text-amber-400 font-bold">
                      💰 السعر المتفق: {confirmSession.agreedPrice} ج.م/ساعة
                    </p>
                  </div>
                )}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900 rounded-xl p-2 text-center">
                  <div className="text-xs text-slate-500">المدة</div>
                  <div className="text-sm font-black text-white font-mono">
                    {confirmSession.minutes} دقيقة
                  </div>
                  <div className="text-[9px] text-slate-600">
                    ({confirmSession.hours} ساعة محسوبة)
                  </div>
                </div>
                <div className="bg-slate-900 rounded-xl p-2 text-center">
                  <div className="text-xs text-slate-500">المستحق</div>
                  <div className="text-xl font-black text-emerald-400 font-mono">
                    {confirmSession.cost > 0 ? confirmSession.cost : '—'}
                  </div>
                  <div className="text-[9px] text-slate-600">ج.م</div>
                </div>
              </div>
            </div>
            <div className="mb-5">
              <h4 className="text-xs font-black text-slate-400 mb-3 text-right">
                طريقة السداد
              </h4>
              {confirmSession.source === 'manual' ? (
                <div>
                  <div className="bg-emerald-600/20 border border-emerald-500 ring-1 ring-emerald-500/50 p-4 rounded-xl text-center">
                    <div className="text-2xl mb-1">💵</div>
                    <div className="text-sm font-black text-emerald-400">
                      نقدي
                    </div>
                  </div>
                  <div className="mt-3 bg-amber-600/10 border border-amber-500/20 rounded-xl p-2 text-center">
                    <p className="text-[10px] text-amber-400 font-bold">
                      ⚠️ السيارات المضافة يدوياً تُحصّل نقدياً فقط
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'cash', label: 'نقدي', icon: '💵', disabled: false },
                      { id: 'instapay', label: 'إنستاباي', icon: '📱', disabled: false },
                      { id: 'wallet', label: 'المحفظة', icon: '👝', disabled: true },
                      { id: 'cashwallet', label: 'تحويل محفظة كاش', icon: '📲', disabled: false },
                    ].map((pm) => (
                      <button
                        key={pm.id}
                        onClick={() =>
                          !pm.disabled && setConfirmPaymentMethod(pm.id)
                        }
                        disabled={pm.disabled}
                        className={`p-3 rounded-xl border text-center transition-all ${
                          pm.disabled
                            ? 'bg-slate-950 border-slate-700 opacity-40 cursor-not-allowed'
                            : confirmPaymentMethod === pm.id
                            ? pm.id === 'instapay'
                              ? 'bg-purple-600/20 border-purple-500 ring-1 ring-purple-500/50'
                              : pm.id === 'cashwallet'
                              ? 'bg-orange-600/20 border-orange-500 ring-1 ring-orange-500/50'
                              : 'bg-emerald-600/20 border-emerald-500 ring-1 ring-emerald-500/50'
                            : 'bg-slate-950 border-slate-800'
                        } ${!pm.disabled ? 'active:scale-95' : ''}`}
                      >
                        <div className="text-xl mb-1">{pm.icon}</div>
                        <div
                          className={`text-[10px] font-black ${
                            pm.disabled
                              ? 'text-slate-600'
                              : confirmPaymentMethod === pm.id
                              ? 'text-white'
                              : 'text-slate-500'
                          }`}
                        >
                          {pm.label}
                        </div>
                        {pm.disabled && (
                          <div className="text-[7px] text-red-400/60 font-bold mt-1">
                            🔒 غير متاح من الجراج
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 bg-blue-600/10 border border-blue-500/20 rounded-xl p-2 text-center">
                    <p className="text-[9px] text-blue-400 font-bold">
                      💡 خصم المحفظة متاح فقط من تطبيق العميل
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleConfirmPayment}
                className={`flex-1 py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-xl ${
                  confirmPaymentMethod === 'instapay'
                    ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-900/30'
                    : confirmPaymentMethod === 'cashwallet'
                    ? 'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-900/30'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-900/30'
                }`}
              >
                <CheckCircle size={18} /> تأكيد السداد ({confirmSession.cost}{' '}
                ج.م)
              </button>
              <button
                onClick={() => setConfirmSession(null)}
                className="bg-slate-800 text-slate-400 px-5 py-4 rounded-2xl font-black text-sm active:scale-95 transition-all"
              >
                <XCircle size={18} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-emerald-600/20 border border-emerald-500/20 p-4 rounded-2xl text-center">
          <DollarSign size={20} className="text-emerald-400 mx-auto mb-1" />
          <div className="text-xl font-black text-emerald-400 font-mono">
            {(garageDailyStats.length > 0
              ? totalRevenueFromStats
              : totalRevenue
            ).toFixed(0)}
          </div>
          <div className="text-[8px] text-slate-500 font-bold">مؤكد</div>
        </div>
        <div
          className="bg-blue-600/20 border border-blue-500/20 p-4 rounded-2xl text-center cursor-pointer hover:bg-blue-600/30 transition-all"
          onClick={openSettings}
        >
          <Car size={20} className="text-blue-400 mx-auto mb-1" />
          <div className="text-xl font-black text-blue-400 font-mono">
            {garage.availableSpots}
          </div>
          <div className="text-[8px] text-slate-500 font-bold flex items-center justify-center gap-1">
            شاغر <Edit3 size={8} />
          </div>
        </div>
        <div
          className="bg-purple-600/20 border border-purple-500/20 p-4 rounded-2xl text-center cursor-pointer hover:bg-purple-600/30 transition-all"
          onClick={openSettings}
        >
          <DollarSign size={20} className="text-purple-400 mx-auto mb-1" />
          <div className="text-xl font-black text-purple-400 font-mono">
            {garage.basePrice}
          </div>
          <div className="text-[8px] text-slate-500 font-bold flex items-center justify-center gap-1">
            ج.م/ساعة <Edit3 size={8} />
          </div>
        </div>
      </div>

      {/* Undo Banners */}
      <AnimatePresence>
        {undoableSessions.map((undoable) => {
          const remaining = getUndoRemainingSeconds(undoable.addedAt);
          const progress =
            ((UNDO_TIMEOUT_SECONDS - remaining) / UNDO_TIMEOUT_SECONDS) * 100;
          return (
            <motion.div
              key={undoable.localId}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{
                opacity: 0,
                y: -20,
                scale: 0.95,
                transition: { duration: 0.3 },
              }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="mb-4"
            >
              <div className="bg-gradient-to-l from-amber-950/60 to-slate-900 border border-amber-500/40 rounded-2xl p-4 relative overflow-hidden shadow-lg shadow-amber-900/20">
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800">
                  <motion.div
                    className="h-full bg-gradient-to-r from-amber-500 to-red-500"
                    initial={{ width: '0%' }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5, ease: 'linear' }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => handleUndoSession(undoable)}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 active:scale-95 transition-all shadow-lg shadow-red-900/30 shrink-0"
                  >
                    <Undo2 size={16} /> تراجع
                  </button>
                  <div className="flex-1 text-right">
                    <div className="flex items-center justify-end gap-2 mb-1">
                      <span className="text-xs font-black text-white">
                        🚗 {undoable.carPlate}
                      </span>
                      <span className="text-[9px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-bold">
                        يدوي
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-[10px] text-slate-400">
                        {undoable.price} ج.م/ساعة
                      </span>
                      <span className="text-slate-700">|</span>
                      <span className="text-[10px] text-amber-400 font-bold font-mono">
                        ⏳ {remaining} ثانية
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 bg-amber-600/10 border border-amber-500/20 rounded-xl p-2 text-center">
                  <p className="text-[9px] text-amber-400 font-bold">
                    ⚠️ يمكنك إلغاء الإضافة خلال {remaining} ثانية
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* سيارات في الطريق */}
      {carsOnTheWay.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-black text-cyan-400 mb-3 flex items-center gap-2 justify-end">
            <span className="bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full text-[10px]">
              {carsOnTheWay.length}
            </span>
            سيارات في الطريق
            <Navigation size={14} className="animate-pulse" />
          </h3>
          <div className="space-y-3">
            {carsOnTheWay.map((car) => {
              const remainingTime = calculateRemainingTime(
                car.startTime,
                car.estimatedArrival
              );
              const sessionAlreadyStarted = sessions.some(
                (s) =>
                  s.carPlate.trim().toUpperCase() ===
                    car.carPlate.trim().toUpperCase() &&
                  s.status === 'active'
              );
              return (
                <motion.div
                  key={car.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-gradient-to-l from-cyan-900/30 to-slate-900 border border-cyan-500/30 rounded-2xl p-4 relative overflow-hidden"
                >
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all"
                      style={{
                        width: `${Math.max(
                          0,
                          100 -
                            (remainingTime / car.estimatedArrival) * 100
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                      <motion.div
                        animate={{ x: [0, -5, 0] }}
                        transition={{ repeat: Infinity, duration: 1.5 }}
                        className="bg-cyan-600/20 p-2 rounded-xl"
                      >
                        <CarFront size={20} className="text-cyan-400" />
                      </motion.div>
                      {sessionAlreadyStarted ? (
                        <div className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-[10px] font-black">
                          ✅ الجلسة شغالة
                        </div>
                      ) : (
                        <div
                          className={`px-3 py-1 rounded-full text-[10px] font-black ${
                            remainingTime <= 2
                              ? 'bg-amber-500/20 text-amber-400 animate-pulse'
                              : 'bg-cyan-500/20 text-cyan-400'
                          }`}
                        >
                          {remainingTime > 0
                            ? `${remainingTime} دقيقة`
                            : 'وصل تقريباً'}
                        </div>
                      )}
                    </div>
                    <div className="text-lg font-black text-white">
                      🚗 {car.carPlate}
                    </div>
                  </div>
                  <div className="bg-slate-950/50 rounded-xl p-3 mb-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <a
                        href={`tel:${car.customerPhone}`}
                        className="text-sm font-black text-blue-400 font-mono"
                      >
                        {car.customerPhone}
                      </a>
                      <div className="flex items-center gap-1 text-slate-400">
                        <Phone size={12} />
                        <span className="text-[10px] font-bold">الهاتف</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black text-emerald-400 font-mono">
                        {car.agreedPrice} ج.م / ساعة
                      </span>
                      <div className="flex items-center gap-1 text-slate-400">
                        <DollarSign size={12} />
                        <span className="text-[10px] font-bold">
                          السعر المتفق
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        handleCarArrived(
                          car.id,
                          car.carPlate,
                          car.agreedPrice
                        )
                      }
                      className={`flex-1 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all ${
                        sessionAlreadyStarted
                          ? 'bg-slate-700 text-slate-300'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      <CheckCircle size={16} />
                      {sessionAlreadyStarted
                        ? 'تأكيد الوصول وإزالة'
                        : 'وصلت وبدء الحساب'}
                    </button>
                    <a
                      href={`tel:${car.customerPhone}`}
                      className="bg-blue-600/20 text-blue-400 px-4 py-3 rounded-xl flex items-center justify-center border border-blue-500/20 active:scale-95 transition-all"
                    >
                      <Phone size={18} />
                    </a>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* شريط المعلومات */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-3 mb-6 flex items-center justify-between">
        <button
          onClick={openSettings}
          className="text-[10px] text-blue-400 font-bold flex items-center gap-1"
        >
          <Settings size={12} /> تعديل الإعدادات
        </button>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-500">
            السعر:{' '}
            <span className="text-emerald-400 font-mono font-black">
              {garage.basePrice}ج
            </span>
          </span>
          <span className="text-slate-700">|</span>
          <span className="text-[10px] text-slate-500">
            متاح:{' '}
            <span className="text-blue-400 font-mono font-black">
              {garage.availableSpots}/{garage.capacity}
            </span>
          </span>
        </div>
      </div>

      {/* عروض الأسعار */}
      {garageOffers.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-black text-amber-400 mb-3 flex items-center gap-2 justify-end">
            عروض أسعار معلقة ({garageOffers.length})
          </h3>
          <div className="space-y-3">
            {garageOffers.map((offer) => (
              <motion.div
                key={offer.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-4"
              >
                <div className="flex justify-between items-center mb-3">
                  <div className="text-xl font-black text-white font-mono">
                    {offer.offeredPrice} ج.م
                    {offer.offeredPrice < garage.basePrice && (
                      <span className="text-xs text-red-400 mr-2">
                        (أقل من {garage.basePrice})
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-black text-white">
                    🚗 {offer.carPlate}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      updateOffer(offer.id, 'accepted');
                      toast.success('تم قبول العرض');
                    }}
                    className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-black text-sm flex items-center justify-center gap-1 active:scale-95 transition-all"
                  >
                    <CheckCircle size={16} /> قبول
                  </button>
                  <button
                    onClick={() => {
                      updateOffer(offer.id, 'rejected');
                      toast.error('تم رفض العرض');
                    }}
                    className="flex-1 bg-red-600 text-white py-3 rounded-xl font-black text-sm flex items-center justify-center gap-1 active:scale-95 transition-all"
                  >
                    <XCircle size={16} /> رفض
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* إضافة سيارة */}
      <div className="mb-6">
        {!showAddCar ? (
          <button
            onClick={() => setShowAddCar(true)}
            disabled={garage.availableSpots <= 0}
            className={`w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all ${
              garage.availableSpots > 0
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Plus size={20} />
            {garage.availableSpots > 0
              ? 'إضافة سيارة جديدة'
              : 'لا توجد أماكن شاغرة'}
          </button>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3"
          >
            <input
              className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-right font-bold text-white outline-none text-sm placeholder:text-slate-600"
              placeholder="رقم لوحة السيارة"
              value={newCarPlate}
              onChange={(e) => setNewCarPlate(e.target.value)}
            />
            <div>
              <label className="text-[10px] text-slate-500 font-bold block text-right mb-1">
                💰 سعر الساعة - الافتراضي: {garage.basePrice} ج.م
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNewCarPrice((p) => Math.max(5, p - 5))}
                  className="bg-red-600/20 text-red-400 w-10 h-10 rounded-xl flex items-center justify-center border border-red-500/20 active:scale-90 transition-all"
                >
                  <Minus size={16} />
                </button>
                <input
                  type="number"
                  value={newCarPrice}
                  onChange={(e) =>
                    setNewCarPrice(
                      Math.max(1, parseInt(e.target.value) || 1)
                    )
                  }
                  className="flex-1 bg-slate-950 border border-slate-800 p-2 rounded-xl text-center font-black text-white text-lg outline-none font-mono"
                />
                <button
                  onClick={() => setNewCarPrice((p) => p + 5)}
                  className="bg-emerald-600/20 text-emerald-400 w-10 h-10 rounded-xl flex items-center justify-center border border-emerald-500/20 active:scale-90 transition-all"
                >
                  <Plus size={16} />
                </button>
              </div>
              <div className="flex gap-1.5 mt-2 justify-end">
                {[10, 15, 20, 25, 30].map((p) => (
                  <button
                    key={p}
                    onClick={() => setNewCarPrice(p)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all active:scale-95 ${
                      newCarPrice === p
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddCar}
                className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-black text-sm active:scale-95 transition-all"
              >
                إضافة ({newCarPrice} ج.م/ساعة)
              </button>
              <button
                onClick={() => {
                  setShowAddCar(false);
                  setNewCarPlate('');
                  setNewCarPrice(garage.basePrice);
                }}
                className="flex-1 bg-slate-800 text-white py-3 rounded-xl font-black text-sm active:scale-95 transition-all"
              >
                إلغاء
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* الجلسات النشطة */}
      <div className="mb-6">
        <h3 className="text-sm font-black text-emerald-400 mb-3 flex items-center gap-2 justify-end">
          الجلسات النشطة ({activeSessions.length}){' '}
          <Clock size={14} />
        </h3>
        <div className="space-y-3">
          {activeSessions.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-slate-500 text-sm">
              لا توجد جلسات نشطة
            </div>
          ) : (
            activeSessions.map((session) => {
              const startTime =
                typeof session.startTime === 'number'
                  ? session.startTime
                  : new Date(session.startTime).getTime();
              const elapsedSeconds = Math.max(
                0,
                Math.floor((Date.now() - startTime) / 1000)
              );
              const mins = Math.floor(elapsedSeconds / 60);
              const hours = calculateFullHours(elapsedSeconds);
              const rate = Number(
                session.agreedPrice ?? garage.basePrice
              );
              const cost = calculateCost(elapsedSeconds, rate);
              const isManual = session.source === 'manual';
              const undoable = undoableSessions.find(
                (u) =>
                  u.sessionId === session.id ||
                  u.localId === session.id
              );
              return (
                <div
                  key={session.id}
                  className={`rounded-2xl p-4 border ${
                    isManual
                      ? 'bg-amber-950/20 border-amber-500/20'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full animate-pulse ${
                          isManual ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                      />
                      <span className="text-xs text-slate-500">
                        {mins} دقيقة ({hours} ساعة)
                      </span>
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                          isManual
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}
                      >
                        {isManual ? 'يدوي' : 'تطبيق'}
                      </span>
                    </div>
                    <div className="text-sm font-black text-white">
                      🚗 {session.carPlate}
                    </div>
                  </div>
                  {session.agreedPrice &&
                    session.agreedPrice !== garage.basePrice && (
                      <div className="bg-amber-600/10 border border-amber-500/20 rounded-lg p-1.5 mb-2 text-center">
                        <span className="text-[9px] text-amber-400 font-bold">
                          سعر متفق: {session.agreedPrice} ج.م/ساعة
                        </span>
                      </div>
                    )}
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          openConfirmPayment(
                            session.id,
                            session.carPlate,
                            cost,
                            hours,
                            mins,
                            session.source,
                            session.agreedPrice
                          )
                        }
                        className="bg-red-600/20 text-red-400 px-4 py-2 rounded-xl text-xs font-black border border-red-500/20 active:scale-95 transition-all"
                      >
                        إنهاء وتحصيل
                      </button>
                      {undoable && (
                        <motion.button
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          onClick={() => handleUndoSession(undoable)}
                          className="bg-amber-600/20 text-amber-400 px-3 py-2 rounded-xl text-[10px] font-black border border-amber-500/20 active:scale-95 transition-all flex items-center gap-1"
                        >
                          <Undo2 size={12} /> إلغاء (
                          {getUndoRemainingSeconds(undoable.addedAt)}ث)
                        </motion.button>
                      )}
                    </div>
                    <div className="text-sm font-black text-emerald-400 font-mono">
                      {cost} ج.م ({hours}×{rate})
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* سجل العمليات */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] text-slate-500 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
            {filteredCompleted.length} عملية
          </span>
          <h3 className="text-sm font-black text-slate-300 flex items-center gap-2">
            سجل العمليات <FileText size={14} />
          </h3>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3 justify-end">
            <CalendarDays size={14} className="text-blue-400" />
            <span className="text-xs font-black text-slate-400">
              تصفية بالتاريخ
            </span>
          </div>
          <div className="flex gap-2 mb-3">
            <input
              type="date"
              value={logDateFilter}
              onChange={(e) => setLogDateFilter(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs font-bold text-white outline-none"
            />
            <button
              onClick={() => setLogDateFilter(getLocalToday())}
              className="bg-blue-600/20 text-blue-400 px-3 py-2 rounded-xl text-[10px] font-black border border-blue-500/20 active:scale-95 transition-all whitespace-nowrap"
            >
              اليوم
            </button>
            <button
              onClick={() => setLogDateFilter('')}
              className="bg-slate-800 text-slate-400 px-3 py-2 rounded-xl text-[10px] font-black active:scale-95 transition-all whitespace-nowrap"
            >
              الكل
            </button>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {[
              { id: 'all', label: 'الكل', icon: '📊' },
              { id: 'cash', label: 'نقدي', icon: '💵' },
              { id: 'instapay', label: 'إنستاباي', icon: '📱' },
              { id: 'wallet', label: 'محفظة', icon: '👝' },
              { id: 'cashwallet', label: 'كاش', icon: '📲' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setLogPaymentFilter(f.id)}
                className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black transition-all active:scale-95 ${
                  logPaymentFilter === f.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-950 text-slate-500 border border-slate-800'
                }`}
              >
                {f.icon} {f.label}
              </button>
            ))}
          </div>
        </div>

        {filteredCompleted.length > 0 && (
          <>
            {filteredStats.pendingCount > 0 && (
              <div className="bg-amber-600/10 border border-amber-500/30 rounded-2xl p-4 mb-4">
                <div className="flex justify-between items-center">
                  <div className="text-right">
                    <h3 className="text-sm font-black text-amber-400">
                      ⏳ إيرادات معلقة ({filteredStats.pendingCount})
                    </h3>
                    <p className="text-[10px] text-amber-400/60">
                      تحتاج تأكيد لتُحسب في الإيرادات
                    </p>
                  </div>
                  <div className="text-xl font-black text-amber-400 font-mono">
                    {filteredStats.pendingRevenue.toFixed(0)} ج.م
                  </div>
                </div>
              </div>
            )}
            <div className="bg-gradient-to-l from-emerald-600/20 to-slate-900 border border-emerald-500/30 rounded-2xl p-4 mb-4 text-center">
              <div className="text-[10px] text-slate-400 mb-1">
                {logDateFilter
                  ? `إجمالي مؤكد - يوم ${formatLocalDateArabic(logDateFilter)}`
                  : 'إجمالي مؤكد - كل العمليات'}
              </div>
              <div className="text-3xl font-black text-emerald-400 font-mono">
                {filteredStats.total.toFixed(0)} ج.م
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                {filteredCompleted.filter((s) => s.revenueConfirmed).length}{' '}
                عملية مؤكدة
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { label: 'نقدي', value: filteredStats.cash, icon: '💵', color: 'text-emerald-400' },
                { label: 'إنستاباي', value: filteredStats.instapay, icon: '📱', color: 'text-purple-400' },
                { label: 'محفظة', value: filteredStats.wallet, icon: '👝', color: 'text-blue-400' },
                { label: 'كاش', value: filteredStats.cashwallet, icon: '📲', color: 'text-orange-400' },
              ].map((p) => (
                <div
                  key={p.label}
                  className="bg-slate-900/50 border border-slate-800 rounded-xl p-2 text-center"
                >
                  <div className="text-lg mb-0.5">{p.icon}</div>
                  <div className={`text-sm font-black font-mono ${p.color}`}>
                    {p.value.toFixed(0)}
                  </div>
                  <div className="text-[7px] text-slate-500 font-bold">
                    {p.label}
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-amber-600/10 border border-amber-500/20 rounded-xl p-3 text-center">
                <div className="text-[9px] text-amber-400 font-black mb-1">
                  يدوي
                </div>
                <span className="text-sm font-black text-amber-400 font-mono">
                  {filteredStats.manualCount}
                </span>
                <span className="text-[9px] text-slate-500 mr-1">
                  {' '}
                  عربية
                </span>
                <div className="text-[9px] text-amber-300">
                  ({filteredStats.manualTotal.toFixed(0)} ج.م)
                </div>
              </div>
              <div className="bg-blue-600/10 border border-blue-500/20 rounded-xl p-3 text-center">
                <div className="text-[9px] text-blue-400 font-black mb-1">
                  تطبيق
                </div>
                <span className="text-sm font-black text-blue-400 font-mono">
                  {filteredStats.appCount}
                </span>
                <span className="text-[9px] text-slate-500 mr-1">
                  {' '}
                  عربية
                </span>
                <div className="text-[9px] text-blue-300">
                  ({filteredStats.appTotal.toFixed(0)} ج.م)
                </div>
              </div>
            </div>
          </>
        )}

        <div className="space-y-2">
          {filteredCompleted.map((session) => {
            const isManual = session.source === 'manual';
            const endTime = session.endTime
              ? typeof session.endTime === 'number'
                ? session.endTime
                : new Date(session.endTime).getTime()
              : null;
            const time = endTime ? new Date(endTime) : null;
            const revenue = getSessionRevenue(session);
            const isConfirmed = session.revenueConfirmed;
            return (
              <div
                key={session.id}
                className={`rounded-xl p-3 border ${
                  !isConfirmed
                    ? 'bg-amber-950/20 border-amber-500/30'
                    : isManual
                    ? 'bg-amber-950/30 border-amber-500/20'
                    : 'bg-blue-950/20 border-blue-500/20'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-sm font-mono font-black ${
                        !isConfirmed
                          ? 'text-amber-300'
                          : isManual
                          ? 'text-amber-400'
                          : 'text-blue-400'
                      }`}
                    >
                      {revenue.toFixed(0)} ج.م
                    </span>
                    <span
                      className={`text-[8px] px-2 py-0.5 rounded-full font-bold ${
                        isManual
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}
                    >
                      {isManual ? 'يدوي' : 'تطبيق'}
                    </span>
                    {!isConfirmed ? (
                      <button
                        onClick={async () => {
                          await confirmRevenue(session.id);
                          await fetchGarageDailyStats();
                          toast.success('تم تأكيد الإيراد ✅');
                        }}
                        className="bg-amber-600/20 text-amber-400 px-2 py-0.5 rounded-lg text-[8px] font-black border border-amber-500/30 active:scale-95 transition-all"
                      >
                        ⏳ تأكيد الإيراد
                      </button>
                    ) : (
                      <span className="text-[8px] text-emerald-400 font-bold">
                        ✅ مؤكد
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isManual ? 'bg-amber-500' : 'bg-blue-500'
                      }`}
                    />
                    <span className="text-xs text-slate-400 font-bold">
                      {session.carPlate}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    {session.paymentMethod && (
                      <span
                        className={`text-[8px] px-2 py-0.5 rounded-full font-bold ${
                          session.paymentMethod === 'cash'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : session.paymentMethod === 'instapay'
                            ? 'bg-purple-500/20 text-purple-400'
                            : session.paymentMethod === 'wallet'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-orange-500/20 text-orange-400'
                        }`}
                      >
                        {session.paymentMethod === 'cash'
                          ? '💵 نقدي'
                          : session.paymentMethod === 'instapay'
                          ? '📱 إنستاباي'
                          : session.paymentMethod === 'wallet'
                          ? '👝 محفظة'
                          : '📲 محفظة كاش'}
                      </span>
                    )}
                    {session.agreedPrice &&
                      session.agreedPrice !== garage.basePrice && (
                        <span className="text-[8px] text-amber-400 font-bold">
                          ({session.agreedPrice}ج/س)
                        </span>
                      )}
                  </div>
                  {time && (
                    <span className="text-[9px] text-slate-600 font-mono">
                      {time.toLocaleTimeString('ar-EG', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {filteredCompleted.length === 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
              <div className="text-3xl mb-3">📭</div>
              <p className="text-slate-500 text-sm font-bold">
                لا توجد عمليات
              </p>
              <p className="text-slate-600 text-xs mt-1">
                {logDateFilter
                  ? 'جرب تغيير التاريخ'
                  : 'لم تتم أي عمليات بعد'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}