import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Car,
  DollarSign,
  ArrowRight,
} from 'lucide-react';
import { useStore } from '../store';
import {
  calculateFullHours,
  calculateCost,
  formatTime,
  getRemainingInCurrentHour,
} from '../utils/pricing';
import { supabase } from '../lib/supabase';

/* ─── Helper ─── */
const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizePlate = (plate?: string): string => {
  if (!plate) return '';
  return plate
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/\s+/g, ' ')
    .toUpperCase();
};

/* ════════════════════════════════════════════════
   ██  SESSION SCREEN
   ════════════════════════════════════════════════ */
export default function SessionScreen() {
  const {
    garages,
    sessions,
    setScreen,
    currentUser,
    fetchAll,
  } = useStore();

  const userPlate = normalizePlate(currentUser?.carPlate);
  const userPhone = currentUser?.phone || '';

  /* ✅ البحث عن الجلسة بـ 3 طرق:
     1. carPlate مطابق
     2. customerPhone مطابق
     3. carPlate يحتوي على نفس الحروف (fuzzy)
  */
  const findMyActiveSession = () => {
    // أولاً: بحث دقيق بالـ plate
    let session = sessions
      .filter(s =>
        s.status === 'active' &&
        normalizePlate(s.carPlate) === userPlate
      )
      .sort((a, b) => toMs(b.startTime) - toMs(a.startTime))[0];

    if (session) return session;

    // ثانياً: بحث بـ customerPhone
    if (userPhone) {
      session = sessions
        .filter(s =>
          s.status === 'active' &&
          (s as any).customerPhone === userPhone
        )
        .sort((a, b) => toMs(b.startTime) - toMs(a.startTime))[0];

      if (session) return session;
    }

    return undefined;
  };

  const activeSession = findMyActiveSession();

  const lastCompletedSession = sessions
    .filter(s =>
      s.status === 'completed' &&
      (
        normalizePlate(s.carPlate) === userPlate ||
        (s as any).customerPhone === userPhone
      )
    )
    .sort((a, b) => toMs(b.endTime) - toMs(a.endTime))[0];

  const garage = garages.find(
    (g) => g.id === (activeSession?.garageId ?? lastCompletedSession?.garageId),
  );

  /* ── State ── */
  const [elapsed, setElapsed] = useState(0);
  const [tick, setTick] = useState(0);

  /* ── Refs ── */
  const redirectedRef = useRef(false);
  const realtimeChannelRef = useRef<any>(null);

  /* ─────────────────────────────────────────────
     ██  REALTIME + Polling مشدد
     ───────────────────────────────────────────── */
  useEffect(() => {
    if (!userPlate && !userPhone) return;

    /* فتش فورًا */
    fetchAll();

    /* Realtime */
    const channel = supabase
      .channel(`session-live-${userPlate}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions' },
        async () => {
          await fetchAll();
          setTick(t => t + 1); // force re-render
        },
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    /* ✅ Polling إضافي كل 3 ثواني كـ fallback */
    const pollInterval = setInterval(async () => {
      await fetchAll();
      setTick(t => t + 1);
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      realtimeChannelRef.current = null;
      clearInterval(pollInterval);
    };
  }, [userPlate, userPhone, fetchAll]);

  /* ─────────────────────────────────────────────
     ██  العداد - يبدأ من الثواني الحقيقية
     ───────────────────────────────────────────── */
  useEffect(() => {
    if (!activeSession) {
      setElapsed(0);
      return;
    }

    const startMs = toMs(activeSession.startTime);
    if (!startMs || startMs <= 0) {
      setElapsed(0);
      return;
    }

    const calcElapsed = () => {
      const now = Date.now();
      const diff = now - startMs;
      return Math.max(0, Math.floor(diff / 1000));
    };

    /* ✅ ضبط فوري */
    setElapsed(calcElapsed());

    const interval = setInterval(() => {
      setElapsed(calcElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession?.id, activeSession?.startTime]);

  /* ─── التوجيه التلقائي لشاشة الملخص ─── */
  useEffect(() => {
    if (activeSession) {
      redirectedRef.current = false;
      return;
    }

    if (!lastCompletedSession || redirectedRef.current) return;

    const endTime = toMs(lastCompletedSession.endTime);
    const timeSinceEnd = Date.now() - endTime;

    if (endTime > 0 && timeSinceEnd < 60000) {
      redirectedRef.current = true;
      setScreen('summary');
    }
  }, [activeSession?.id, lastCompletedSession?.id, lastCompletedSession?.endTime, setScreen]);

  /* ─── Debug logging ─── */
  useEffect(() => {
    if (activeSession) {
      const startMs = toMs(activeSession.startTime);
      console.log('🔍 Active session found:', {
        id: activeSession.id,
        carPlate: activeSession.carPlate,
        customerPhone: (activeSession as any).customerPhone,
        startTime: activeSession.startTime,
        startMs,
        elapsedSec: Math.floor((Date.now() - startMs) / 1000),
        source: activeSession.source,
        startedBy: (activeSession as any).startedBy,
      });
    } else {
      console.log('⚠️ No active session found for:', {
        userPlate,
        userPhone,
        totalSessions: sessions.length,
        activeSessions: sessions.filter(s => s.status === 'active').map(s => ({
          id: s.id.slice(0, 8),
          plate: s.carPlate,
          phone: (s as any).customerPhone,
          start: s.startTime,
        })),
      });
    }
  }, [activeSession?.id, sessions.length, tick]);

  /* ─────────────────────────────────────────────
     ██  لا توجد جلسة نشطة
     ───────────────────────────────────────────── */
  if (!activeSession) {
    return (
      <div className="h-full bg-white text-slate-900 flex flex-col items-center justify-center p-8">
        <div className="text-4xl mb-4 animate-bounce">⏳</div>
        <p className="text-slate-500 text-sm font-bold text-center mb-2">
          لا توجد جلسة ركن نشطة حالياً
        </p>
        <p className="text-slate-400 text-xs text-center mb-2">
          ابحث عن جراج وابدأ الركن
        </p>

        {/* ✅ Debug info for testing */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 w-full">
          <p className="text-[10px] text-slate-400 text-center font-mono">
            🔍 لوحتك: {userPlate || '—'}
          </p>
          <p className="text-[10px] text-slate-400 text-center font-mono">
            📱 هاتفك: {userPhone || '—'}
          </p>
          <p className="text-[10px] text-slate-400 text-center font-mono">
            📊 جلسات نشطة: {sessions.filter(s => s.status === 'active').length}
          </p>
        </div>

        <button
          onClick={() => setScreen('list')}
          className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black text-sm active:scale-95 transition-all flex items-center gap-2"
        >
          <ArrowRight size={16} />
          العودة للقائمة
        </button>
      </div>
    );
  }

  /* ── Computed ── */
  const sessionRate = Number(activeSession.agreedPrice ?? garage?.basePrice ?? 0);
  const currentHours = calculateFullHours(elapsed);
  const currentCost = calculateCost(elapsed, sessionRate);
  const remainingInHour = getRemainingInCurrentHour(elapsed);

  /* ─────────────────────────────────────────────
     ██  RENDER
     ───────────────────────────────────────────── */
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-white text-slate-900 flex flex-col items-center justify-center p-8"
    >
      {/* ══ عداد الوقت ══ */}
      <motion.div
        animate={{
          boxShadow: [
            '0 0 0px rgba(59,130,246,0.15)',
            '0 0 60px rgba(59,130,246,0.2)',
            '0 0 0px rgba(59,130,246,0.15)',
          ],
        }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="w-48 h-48 bg-blue-50 rounded-full flex flex-col items-center justify-center border-4 border-blue-300 mb-6 shadow-lg shadow-blue-100"
      >
        <Clock size={28} className="text-blue-600 mb-1" />
        <div className="text-3xl font-black font-mono text-slate-900">
          {formatTime(elapsed)}
        </div>
        <div className="text-[10px] text-slate-500 font-bold mt-1">
          مدة الركن
        </div>
      </motion.div>

      {/* ══ بطاقة التكلفة ══ */}
      <div className="w-full bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-2xl p-4 mb-4 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <div className="text-center">
            <div className="text-3xl font-black text-blue-600 font-mono">
              {currentHours}
            </div>
            <div className="text-[9px] text-slate-500 font-bold">
              ساعة محسوبة
            </div>
          </div>
          <div className="text-4xl font-black text-slate-400">=</div>
          <div className="text-center">
            <div className="text-3xl font-black text-emerald-600 font-mono">
              {currentCost}
            </div>
            <div className="text-[9px] text-slate-500 font-bold">
              ج.م إجمالي
            </div>
          </div>
        </div>

        <div className="bg-white/80 rounded-xl p-3 text-center border border-slate-100">
          <div className="text-[10px] text-slate-500 mb-1">
            الوقت المتبقي حتى الساعة التالية
          </div>
          <div className="text-lg font-black text-amber-500 font-mono">
            {String(remainingInHour.minutes).padStart(2, '0')}:
            {String(remainingInHour.seconds).padStart(2, '0')}
          </div>
          <div className="text-[9px] text-slate-400 mt-1">
            بعدها ستُحسب ساعة إضافية ({currentHours + 1} × {sessionRate} ={' '}
            {(currentHours + 1) * sessionRate} ج.م)
          </div>
        </div>
      </div>

      {/* ══ تنبيه سعر خاص ══ */}
      {sessionRate !== garage?.basePrice && garage && (
        <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-2 mb-4 text-center">
          <p className="text-[10px] text-amber-600 font-bold">
            💰 سعر خاص: {sessionRate} ج.م/ساعة (بدل {garage.basePrice} ج.م)
          </p>
        </div>
      )}

      {/* ══ معلومات السيارة والسعر ══ */}
      <div className="w-full grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl text-center shadow-sm">
          <Car size={20} className="text-blue-600 mx-auto mb-2" />
          <div className="text-sm font-black text-slate-900">
            {activeSession.carPlate || currentUser?.carPlate}
          </div>
          <div className="text-[9px] text-slate-500 font-bold">
            رقم السيارة
          </div>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl text-center shadow-sm">
          <DollarSign size={20} className="text-purple-600 mx-auto mb-2" />
          <div className="text-sm font-black text-purple-600 font-mono">
            {sessionRate} ج.م
          </div>
          <div className="text-[9px] text-slate-500 font-bold">
            سعر الساعة
          </div>
        </div>
      </div>

      {/* ══ اسم الجراج ══ */}
      {garage && (
        <div className="bg-white border border-slate-200 p-4 rounded-2xl w-full text-center mb-6 shadow-sm">
          <div className="text-xs text-slate-500 font-bold mb-1">الجراج</div>
          <div className="text-lg font-black text-slate-900">{garage.name}</div>
        </div>
      )}

      {/* ══ مصدر الجلسة ══ */}
      <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 mb-4 text-center">
        <p className="text-[10px] text-slate-400 font-bold">
          {activeSession.source === 'app' ? '📱 بدأت من التطبيق' : '🅿️ بدأت من الجراج'}
          {(activeSession as any).startedBy === 'garage' && ' (بواسطة السايس)'}
        </p>
      </div>

      {/* ══ ملاحظة الدفع ══ */}
      <div className="w-full bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-center">
        <p className="text-[10px] text-blue-600 font-bold">
          💡 سيتم تحديد طريقة الدفع عند إنهاء الجلسة
        </p>
      </div>

      {/* ══ زر إنهاء الجلسة ══ */}
      <button
        onClick={() => setScreen('summary')}
        className="w-full bg-red-600 hover:bg-red-700 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-red-100 active:scale-95 transition-all mb-3"
      >
        إنهاء الجلسة ({currentCost} ج.م)
      </button>
    </motion.div>
  );
}