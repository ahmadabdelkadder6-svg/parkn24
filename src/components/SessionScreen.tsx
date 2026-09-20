import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Car,
  ArrowRight,
  Gift,
  Sparkles,
  CreditCard,
  XCircle,
} from 'lucide-react';
// 🌟 استيراد getServerNow ودوال البصمة لضمان مطابقة العداد بالملي ثانية بين جميع الهواتف
import { useStore, normalizePlate, normalizePhone, getServerNow } from '../store';
import {
  calculateFullHours,
  calculateCost,
  formatTime,
  getRemainingInCurrentHour,
} from '../utils/pricing';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

/* ─── 🎨 الألوان الرسمية الفاخرة لتطبيق Park'n 24 ─── */
const BRAND = {
  blue: '#1656b8',       // الأزرق الرسمي
  blueDark: '#0f3d85',   // الكحلي الفخم
  blueLight: '#e8f0fe',  // الأزرق الفاتح جداً
  blueSoft: 'rgba(22, 86, 184, 0.08)', // كحلي زجاجي ناعم
  green: '#8cc63f',      // الأخضر الرسمي
  greenDark: '#6ea62a',  // أخضر داكن للخطوط
  greenLight: 'rgba(140, 198, 63, 0.12)', // خلفية خضراء ناعمة
  navy: '#0a1628',       // الكحلي الليلي الغامق للواجهة
  navyLight: '#111e36',  // كحلي أفتح للبطاقات والـ overlays
  slate: '#64748b',      // الرمادي الهادئ
  slateMuted: '#94a3b8', // الرمادي الباهت
  border: 'rgba(255, 255, 255, 0.08)', // حدود زجاجية رفيعة
};

const safeParseTime = (value: any): number => {
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

export default function SessionScreen() {
  const {
    garages,
    sessions,
    setScreen,
    currentUser,
    fetchAll,
    setSelectedGarageId,
    acknowledgedSessionIds,
    acknowledgeSession,
  } = useStore();

  const userPlate = normalizePlate(currentUser?.carPlate);
  const userPhone = currentUser?.phone ? normalizePhone(currentUser.phone) : '';

  const redirectedToSummaryRef = useRef(false);
  const redirectedToSessionRef = useRef(false);
  const activeSessionIdRef = useRef<string | null>(null);
  const realtimeChannelRef = useRef<any>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [elapsed, setElapsed] = useState(0);

  const isMySessionRow = (row: any) => {
    if (!row) return false;
    const rowPlate = normalizePlate(row.car_plate || row.carPlate);
    const rowPhone = normalizePhone(row.customer_phone || row.customerPhone || '');
    return (
      (!!userPlate && rowPlate === userPlate) ||
      (!!userPhone && rowPhone === userPhone)
    );
  };

  // ✅ البحث عن الجلسة النشطة بالبصمة الموحدة
  const activeSession = useMemo(() => {
    return sessions
      .filter((s) => {
        if (!s || s.status !== 'active') return false;
        if (acknowledgedSessionIds?.has(s.id)) return false;
        const samePlateMatch = !!userPlate && normalizePlate(s.carPlate) === userPlate;
        const sPhone = (s as any).customerPhone ? normalizePhone((s as any).customerPhone) : '';
        const samePhoneMatch = Boolean(userPhone && sPhone === userPhone);
        return samePlateMatch || samePhoneMatch;
      })
      .sort((a, b) => safeParseTime(b.startTime) - safeParseTime(a.startTime))[0];
  }, [sessions, userPlate, userPhone, acknowledgedSessionIds]);

  const lastCompletedSession = useMemo(() => {
    return sessions
      .filter((s) => {
        if (!s || s.status !== 'completed') return false;
        const samePlateMatch = !!userPlate && normalizePlate(s.carPlate) === userPlate;
        const sPhone = (s as any).customerPhone ? normalizePhone((s as any).customerPhone) : '';
        const samePhoneMatch = Boolean(userPhone && sPhone === userPhone);
        return samePlateMatch || samePhoneMatch;
      })
      .sort((a, b) => safeParseTime(b.endTime) - safeParseTime(a.endTime))[0];
  }, [sessions, userPlate, userPhone]);

  const garage = garages?.find(
    (g) => g.id === (activeSession?.garageId ?? lastCompletedSession?.garageId),
  );

  useEffect(() => {
    if (activeSession?.id) {
      activeSessionIdRef.current = activeSession.id;
    }
  }, [activeSession?.id]);

  // ✅ حساب وقت البداية مع Fallback بتوقيت السيرفر الموحد
  const activeStartMs = useMemo(() => {
    if (!activeSession) return 0;
    const ms = safeParseTime(activeSession.startTime);
    return ms > 0 ? ms : getServerNow();
  }, [activeSession?.id, activeSession?.startTime]);

  // 📡 جلب البيانات في الخلفية
  useEffect(() => {
    fetchAll().catch((e) => console.error('Fetch error:', e));
  }, [fetchAll]);

  // Realtime
  useEffect(() => {
    if (!userPlate && !userPhone) return;
    let cancelled = false;

    const refetch = async () => {
      if (cancelled) return;
      try { await fetchAll(); } catch (e) { console.error('❌', e); }
    };

    const channel = supabase
      .channel(`customer-session-live-${userPlate || userPhone}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions' },
        async (payload) => {
          const newRow = payload.new as any;
          const oldRow = payload.old as any;
          if (isMySessionRow(newRow) || isMySessionRow(oldRow)) {
            await refetch();
          }
        },
      )
      .subscribe();

    realtimeChannelRef.current = channel;
    pollingRef.current = setInterval(refetch, 4000);

    const handleVisibility = () => { if (document.visibilityState === 'visible') refetch(); };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', refetch);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', refetch);
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      if (realtimeChannelRef.current) { supabase.removeChannel(realtimeChannelRef.current); realtimeChannelRef.current = null; }
    };
  }, [userPlate, userPhone, fetchAll]);

  // ⏱️ عداد الثواني اللحظي الموحد مع سيرفر قاعدة البيانات
  useEffect(() => {
    if (!activeSession || activeStartMs <= 0) {
      setElapsed(0);
      return;
    }

    const calcElapsed = () => {
      const now = getServerNow();
      const diff = now - activeStartMs;
      return Math.max(0, Math.floor(diff / 1000));
    };

    setElapsed(calcElapsed());

    const interval = setInterval(() => {
      setElapsed(calcElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession?.id, activeStartMs]);

  useEffect(() => {
    if (!activeSession) { redirectedToSessionRef.current = false; return; }
    if (redirectedToSessionRef.current) return;
    redirectedToSessionRef.current = true;
    if (activeSession.garageId) setSelectedGarageId(activeSession.garageId);
  }, [activeSession?.id, activeSession?.garageId, setSelectedGarageId]);

  // التحويل التلقائي عند انتهاء الجلسة
  useEffect(() => {
    if (activeSession) {
      redirectedToSummaryRef.current = false;
      return;
    }

    if (activeSessionIdRef.current) {
      const targetSession = sessions.find((s) => s.id === activeSessionIdRef.current);
      if (targetSession && targetSession.status === 'completed' && !redirectedToSummaryRef.current) {
        redirectedToSummaryRef.current = true;
        if (targetSession.garageId) setSelectedGarageId(targetSession.garageId);
        if (typeof acknowledgeSession === 'function') acknowledgeSession(targetSession.id);
        activeSessionIdRef.current = null;
        toast.success('تم إنهاء الجلسة ✅', { icon: '🏁', duration: 3000 });
        setTimeout(() => { setScreen('summary'); }, 400);
        return;
      }
    }

    if (lastCompletedSession && !redirectedToSummaryRef.current) {
      const isNotAcknowledged = acknowledgedSessionIds ? !acknowledgedSessionIds.has(lastCompletedSession.id) : true;
      if (isNotAcknowledged) {
        redirectedToSummaryRef.current = true;
        if (lastCompletedSession.garageId) setSelectedGarageId(lastCompletedSession.garageId);
        if (typeof acknowledgeSession === 'function') acknowledgeSession(lastCompletedSession.id);
        toast.success('تم إنهاء الجلسة بنجاح ✅', { icon: '🏁', duration: 3000 });
        setTimeout(() => { setScreen('summary'); }, 400);
      }
    }
  }, [activeSession, lastCompletedSession, sessions, setScreen, setSelectedGarageId, acknowledgedSessionIds, acknowledgeSession]);

  const sessionRate = Number(activeSession?.agreedPrice ?? garage?.basePrice ?? 0);
  const isFirstFreeApplied = activeSession?.isFirstFreeSession === true;

  // 🎁 الحسابات التفاعلية لـ (30 دقيقة مجانية)
  const { displayedCost, displayedHours, countdownLabel, countdownTime, isFreeNow } = useMemo(() => {
    const defaultCountdown = { minutes: 59, seconds: 59 };

    if (!isFirstFreeApplied) {
      const calculatedCountdown = getRemainingInCurrentHour ? getRemainingInCurrentHour(elapsed) : defaultCountdown;
      return {
        displayedCost: calculateCost(elapsed, sessionRate),
        displayedHours: calculateFullHours(elapsed),
        countdownLabel: 'الوقت المتبقي حتى الساعة التالية',
        countdownTime: calculatedCountdown || defaultCountdown,
        isFreeNow: false,
      };
    }

    if (elapsed <= 1800) {
      const freeTimeRemaining = Math.max(0, 1800 - elapsed);
      const minutes = Math.floor(freeTimeRemaining / 60);
      const seconds = freeTimeRemaining % 60;
      return {
        displayedCost: 0,
        displayedHours: 0,
        countdownLabel: 'ينتهي الركن المجاني الهدية خلال 🎁',
        countdownTime: { minutes, seconds },
        isFreeNow: true,
      };
    } else {
      const calculatedCountdown = getRemainingInCurrentHour ? getRemainingInCurrentHour(elapsed) : defaultCountdown;
      const totalHours = calculateFullHours(elapsed);
      return {
        displayedCost: calculateCost(elapsed, sessionRate),
        displayedHours: totalHours,
        countdownLabel: 'الوقت المتبقي حتى الساعة التالية',
        countdownTime: calculatedCountdown || defaultCountdown,
        isFreeNow: false,
      };
    }
  }, [isFirstFreeApplied, elapsed, sessionRate]);

  // شاشة الانتظار والمزامنة
  if (!activeSession) {
    return (
      <div className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-8 text-right" style={{ background: BRAND.navy }}>
        <div className="text-4xl mb-4 animate-bounce">⏳</div>
        <p className="text-slate-400 text-sm font-bold text-center mb-2">جاري مزامنة بيانات الجلسة...</p>
        <p className="text-slate-500 text-xs text-center mb-6">ستظهر بيانات العداد فور استلامها من السيرفر</p>
        <button
          onClick={() => setScreen('list')}
          className="bg-blue-600 text-white border-0 px-8 py-3.5 rounded-2xl font-black text-xs active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
          style={{ background: BRAND.blue, boxShadow: `0 4px 14px ${BRAND.blue}25` }}
        >
          <ArrowRight size={15} /> <span>العودة للقائمة الرئيسية</span>
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full text-white flex flex-col items-center justify-center p-6 overflow-y-auto safe-top safe-bottom"
      style={{ background: BRAND.navy }}
    >
      {/* 🎁 شارة مميزة علوية ترحيبية في العداد إذا كانت الجلسة مجانية */}
      {isFirstFreeApplied && (
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full border rounded-2xl p-3 mb-4 flex items-center gap-3"
          style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(217, 119, 6, 0.18) 100%)',
            borderColor: 'rgba(245,158,11,0.3)',
          }}
        >
          <div className="p-2 rounded-xl text-amber-400 shrink-0" style={{ background: 'rgba(245,158,11,0.15)' }}>
            <Gift size={20} className="animate-pulse" />
          </div>
          <div className="text-right flex-1">
            <div className="font-black flex items-center gap-1 justify-end text-xs text-amber-400">
              <span>هدية ترحيبية نشطة</span>
              <Sparkles size={12} className="text-yellow-200" />
            </div>
            <div className="font-bold text-[10px] mt-0.5" style={{ color: BRAND.slateMuted }}>
              {isFreeNow 
                ? 'أنت الآن في أول 30 دقيقة مجانية بالكامل! 🎁' 
                : 'انتهت الـ 30 دقيقة المجانية وتم بدء الاحتساب بالسعر العادي ✅'}
            </div>
          </div>
        </motion.div>
      )}

      {/* حلقة العداد الدائرية الكبيرة المتوهجة بالكامل */}
      <motion.div
        animate={{
          boxShadow: isFreeNow
            ? [
                '0 0 0px rgba(140, 198, 63, 0.1)',
                '0 0 40px rgba(140, 198, 63, 0.25)',
                '0 0 0px rgba(140, 198, 63, 0.1)',
              ]
            : [
                '0 0 0px rgba(22, 86, 184, 0.1)',
                '0 0 40px rgba(22, 86, 184, 0.25)',
                '0 0 0px rgba(22, 86, 184, 0.1)',
              ],
        }}
        transition={{ repeat: Infinity, duration: 2.5 }}
        className="w-36 h-36 rounded-full flex flex-col items-center justify-center border-2 mb-5 shadow-lg"
        style={{
          background: BRAND.navyLight,
          borderColor: isFreeNow ? BRAND.green : BRAND.blue,
        }}
      >
        <Clock size={20} style={{ color: isFreeNow ? BRAND.green : BRAND.blue }} className="mb-1" />
        <div className="text-2xl font-black font-mono text-white leading-none">{formatTime(elapsed)}</div>
        <div className="text-[9px] font-bold mt-1.5" style={{ color: BRAND.slateMuted }}>مدة الركن الفعلية</div>
      </motion.div>

      {/* كارت الحساب التفاعلي مع الهدية والعداد */}
      <div className="w-full border rounded-2xl p-4 mb-4" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
        <div className="flex justify-between items-center mb-3">
          <div className="text-center">
            <div className="text-xl font-black font-mono" style={{ color: isFreeNow ? BRAND.green : BRAND.blue }}>
              {displayedHours}
            </div>
            <div className="text-[9px] font-bold mt-0.5" style={{ color: BRAND.slateMuted }}>ساعة محسوبة</div>
          </div>
          <div className="text-lg font-black" style={{ color: BRAND.border }}>=</div>
          <div className="text-center">
            <div className="text-xl font-black font-mono" style={{ color: BRAND.green }}>
              {displayedCost} <span className="text-[10px]">ج.م</span>
            </div>
            <div className="text-[9px] font-bold mt-0.5" style={{ color: BRAND.slateMuted }}>إجمالي الحساب حتى الآن</div>
          </div>
        </div>

        {/* عداد التنازل الديناميكي */}
        <div className="rounded-xl p-2.5 text-center border" style={{ background: BRAND.blueSoft, borderColor: BRAND.border }}>
          <div className="text-[9px] mb-0.5 font-bold" style={{ color: BRAND.slateMuted }}>{countdownLabel}</div>
          <div className="text-sm font-black font-mono" style={{ color: isFreeNow ? BRAND.green : BRAND.blue }}>
            {String(countdownTime?.minutes ?? 0).padStart(2, '0')}:{String(countdownTime?.seconds ?? 0).padStart(2, '0')}
          </div>
          <div className="text-[8px] mt-0.5 font-semibold" style={{ color: BRAND.slateMuted }}>
            {isFreeNow ? (
              <span>استمتع بالركن المجاني في أول نصف ساعة 🥳</span>
            ) : (
              <span>
                بعدها ستُحسب ساعة إضافية ({displayedHours + 1} × {sessionRate} = {(displayedHours + 1) * sessionRate} ج.م)
              </span>
            )}
          </div>
        </div>
      </div>

      {sessionRate !== garage?.basePrice && garage && (
        <div className="w-full rounded-xl p-2 mb-3 text-center border" style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.2)' }}>
          <p className="text-[9px] font-bold text-amber-500">💰 سعر خاص متفق عليه: {sessionRate} ج.م/ساعة (بدلاً من {garage.basePrice} ج.م)</p>
        </div>
      )}

      {/* 💡 بانر إرشادي متناسق ومدمج ومريح للشاشة 💡 */}
      <div 
        className="w-full rounded-2xl p-3.5 mb-4 text-center border"
        style={{
          background: 'rgba(255, 255, 255, 0.02)',
          borderColor: BRAND.border,
        }}
      >
        <div className="flex items-center justify-center gap-1.5 mb-1 font-black text-white" style={{ fontSize: '12px' }}>
          <Sparkles size={13} className="text-yellow-400 shrink-0 animate-pulse" />
          <span>خلّص مشوارك براحتك 🚗✨</span>
        </div>
        <p 
          className="font-bold leading-relaxed mx-auto"
          style={{ 
            fontSize: '10px',
            color: BRAND.slateMuted,
            maxWidth: '280px'
          }}
        >
          وقت الركنة <span className="font-black text-white">محفوظ بالثانية</span> في الخلفية. 
          أغلق التطبيق الآن وافتحه عند العودة للجراج لإنهاء الجلسة.
        </p>
      </div>

      {/* بيانات السيارة والسعر */}
      <div className="w-full grid grid-cols-2 gap-2.5 mb-4">
        <div className="border p-3 rounded-2xl text-center" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
          <Car size={16} style={{ color: BRAND.blue }} className="mx-auto mb-1" />
          <div className="text-xs font-black text-white">{activeSession.carPlate || currentUser?.carPlate || '---'}</div>
          <div className="text-[9px] font-bold mt-1.5" style={{ color: BRAND.slateMuted }}>رقم السيارة</div>
        </div>
        <div className="border p-3 rounded-2xl text-center" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
          <div className="font-black text-xs mb-1" style={{ color: BRAND.green }}>ج.م/ساعة</div>
          <div className="text-xs font-black font-mono text-white">{sessionRate} ج.م</div>
          <div className="text-[9px] font-bold mt-1.5" style={{ color: BRAND.slateMuted }}>السعر العادي</div>
        </div>
      </div>

      {garage && (
        <div className="border p-3.5 rounded-2xl w-full text-center mb-3" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
          <div className="text-[8px] font-bold mb-0.5" style={{ color: BRAND.slateMuted }}>الجراج الحالي</div>
          <div className="text-xs font-black" style={{ color: '#ffffff' }}>{garage.name}</div>
        </div>
      )}

      <div className="w-full text-center mb-3.5">
        <span className="font-bold text-[9px]" style={{ color: BRAND.slateMuted }}>
          {activeSession.source === 'app' ? '📱 بدأت من التطبيق' : '🅿️ بدأت من الجراج'}
          {(activeSession as any).startedBy === 'garage' && ' (بواسطة السايس)'}
        </span>
      </div>

      {/* 💳 بانر توضيح طرق الدفع المتاحة في الجراج */}
      <div className="w-full border rounded-xl p-2.5 mb-4 text-center" style={{ background: BRAND.blueSoft, borderColor: BRAND.border }}>
        <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold" style={{ color: BRAND.blue }}>
          <CreditCard size={12} />
          {garage?.payment_mode === 'cash' ? (
            <span>💵 يقبل الدفع النقدي (كاش) فقط</span>
          ) : garage?.payment_mode === 'wallet' ? (
            <span>👝 يقبل الدفع والخصم من المحفظة فقط</span>
          ) : (
            <span>💳 يقبل الدفع كاش أو الخصم من المحفظة</span>
          )}
        </div>
      </div>

      {/* زر إنهاء الجلسة الفاخر باللون الأحمر الإرشادي المضاء */}
      <button
        onClick={() => setScreen('summary')}
        className="w-full py-3.5 rounded-xl active:scale-[0.98] transition-all mb-3 flex items-center justify-center border-0 text-white cursor-pointer font-black"
        style={{
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          boxShadow: '0 4px 14px rgba(220,38,38,0.25)',
        }}
      >
        <span className="text-center text-sm font-black" style={{ color: '#ffffff' }}>
          {isFreeNow ? (
            <span>🚗 إنهاء الجلسة (مجاناً 🎁)</span>
          ) : (
            <span>🚗 إنهاء الجلسة وحساب التكلفة ({displayedCost} ج.م)</span>
          )}
        </span>
      </button>

      {/* زر العودة الصامت */}
      <button
        onClick={() => setScreen('list')}
        className="w-full py-2.5 rounded-xl border cursor-pointer bg-transparent text-xs"
        style={{ color: BRAND.slateMuted, borderColor: BRAND.border }}
      >
        العودة للقائمة الرئيسية
      </button>
    </motion.div>
  );
}