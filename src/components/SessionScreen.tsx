import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  Car,
  ArrowRight,
  Gift,
  Sparkles,
  CreditCard,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Activity,
} from 'lucide-react';
// 🌟 استيراد getServerNow ودوال البصمة لضمان مطابقة العداد بالملي ثانية بين جميع الهواتف
import { useStore, normalizePlate, normalizePhone, getServerNow } from '../store';
import {
  calculateFullHours,
  calculateCost,
  formatTime,
  getRemainingInCurrentHour,
  calculateTotalCostWithShield, // 🛡️ استدعاء محرك الحسابات الجديد
} from '../utils/pricing';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

// 🛡️ استيراد محركات الأمان لدرع VIP والنبضات اللحظية
import { requestLocationPermission, getCurrentLocation, startDistanceTracking } from '../utils/distanceTracker';
import { canActivateShield, checkGeofence } from '../utils/geofenceEngine';
import { captureFullPhysicalShield } from '../utils/batShieldEngine';
import { notifyShieldActivated } from '../utils/notifications';

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
  gold: '#fbbf24',       // لون ذهبي فاخر لمعالم VIP
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
    toggleShield,
  } = useStore();

  const userPlate = normalizePlate(currentUser?.carPlate);
  const userPhone = currentUser?.phone ? normalizePhone(currentUser.phone) : '';

  const redirectedToSummaryRef = useRef(false);
  const redirectedToSessionRef = useRef(false);
  const activeSessionIdRef = useRef<string | null>(null);
  const realtimeChannelRef = useRef<any>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [elapsed, setElapsed] = useState(0);

  // 🛡️ حالات درع الأمان VIP والمسافات الفورية المخصصة
  const [isTogglingShield, setIsTogglingShield] = useState(false);
  const [localDistance, setLocalDistance] = useState<string | null>(null);

  const isMySessionRow = (row: any) => {
    if (!row) return false;
    const rowPlate = normalizePlate(row.car_plate || row.carPlate);
    const rowPhone = normalizePhone(row.customer_phone || row.customerPhone || '');
    return (
      (!!userPlate && rowPlate === userPlate) ||
      (!!userPhone && rowPhone === userPhone)
    );
  };

  // البحث عن الجلسة النشطة بالبصمة الموحدة
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

  // حساب وقت البداية مع Fallback بتوقيت السيرفر الموحد
  const activeStartMs = useMemo(() => {
    if (!activeSession) return 0;
    const ms = safeParseTime(activeSession.startTime);
    return ms > 0 ? ms : getServerNow();
  }, [activeSession?.id, activeSession?.startTime]);

  // جلب البيانات في الخلفية
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

  // عداد الثواني اللحظي الموحد مع سيرفر قاعدة البيانات
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

  // 🛡️ تتبع المسافة والنبض الحصري للدرع الذهبي النشط
  useEffect(() => {
    if (!activeSession?.is_shield_active) {
      setLocalDistance(null);
      return;
    }

    const carLat = activeSession.anchor_lat || activeSession.lat;
    const carLng = activeSession.anchor_lng || activeSession.lng;

    if (!carLat || !carLng) return;

    // تشغيل رادار التتبع الحي
    const stopDistanceUpdates = startDistanceTracking(carLat, carLng, (reading) => {
      setLocalDistance(reading.displayText);
    });

    return () => {
      stopDistanceUpdates();
    };
  }, [activeSession?.is_shield_active, activeSession?.anchor_lat, activeSession?.anchor_lng]);

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
  const isShieldActive = activeSession?.is_shield_active === true;

  // 🛡️ تفعيل الحسابات الذكية الشاملة لرسوم الدرع VIP والهدية والوقت
  const pricingSummary = useMemo(() => {
    return calculateTotalCostWithShield(elapsed, sessionRate, isFirstFreeApplied, isShieldActive);
  }, [elapsed, sessionRate, isFirstFreeApplied, isShieldActive]);

  // الحسابات التفاعلية لـ (30 دقيقة مجانية)
  const { countdownLabel, countdownTime, isFreeNow } = useMemo(() => {
    const defaultCountdown = { minutes: 59, seconds: 59 };

    if (!isFirstFreeApplied) {
      const calculatedCountdown = getRemainingInCurrentHour ? getRemainingInCurrentHour(elapsed) : defaultCountdown;
      return {
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
        countdownLabel: 'ينتهي الركن المجاني الهدية خلال 🎁',
        countdownTime: { minutes, seconds },
        isFreeNow: true,
      };
    } else {
      const calculatedCountdown = getRemainingInCurrentHour ? getRemainingInCurrentHour(elapsed) : defaultCountdown;
      return {
        countdownLabel: 'الوقت المتبقي حتى الساعة التالية',
        countdownTime: calculatedCountdown || defaultCountdown,
        isFreeNow: false,
      };
    }
  }, [isFirstFreeApplied, elapsed]);

  // 🛡️ معالج تفعيل درع الأمان الفيزيائي والمغناطيسي والـ Geofence
  const handleToggleShield = async () => {
    if (!activeSession) return;
    setIsTogglingShield(true);

    try {
      if (!isShieldActive) {
        // 1. استئذان إذن الموقع من الهاتف
        const hasPermission = await requestLocationPermission();
        if (!hasPermission) {
          toast.error("⚠️ يرجى تفعيل إذن الموقع الجغرافي لتأمين سياج الركنة!");
          setIsTogglingShield(false);
          return;
        }

        // 2. قراءة خطوط العرض والطول اللحظية للسيارة والجراج
        const location = await getCurrentLocation();
        if (!location) {
          toast.error("⚠️ تعذر تحديد إحداثيات الركنة الدقيقة حالياً.");
          setIsTogglingShield(false);
          return;
        }

        // 3. فحص سياج الجراج الإجباري (نطاق 250م)
        const garageObj = {
          name: garage?.name || "الجراج الحالي",
          lat: garage?.lat || location.lat,
          lng: garage?.lng || location.lng,
          radiusMeters: 250,
        };

        const geofenceCheck = checkGeofence(location.lat, location.lng, garageObj);
        if (!geofenceCheck.isInside) {
          toast.error(`🚫 لا يمكن تفعيل الدرع خارج نطاق الجراج بـ ${geofenceCheck.distanceFromEdge}م!`);
          setIsTogglingShield(false);
          return;
        }

        // 4. أخذ البصمة الفوق صوتية للصاج والمجال المغناطيسي التقديري
        toast.loading("🦇 جاري أخذ بصمة صدى الصاج والمجال المغناطيسي...", { id: "shield-init" });
        const physicalData = await captureFullPhysicalShield();

        // 5. تفعيل الدرع في قاعدة البيانات والـ Zustand Store
        await toggleShield(
          activeSession.id,
          true,
          location.lat,
          location.lng,
          physicalData.magneticBaseline || undefined,
          physicalData.echoSignature || undefined,
          physicalData.bleDeviceId || undefined
        );

        notifyShieldActivated(activeSession.carPlate || currentUser?.carPlate || "");
        toast.success("🛡️ تم تفعيل درع الأمان VIP بنجاح!", { id: "shield-init", icon: "👑" });
      } else {
        // إلغاء تفعيل الدرع (مجاني الإيقاف دائماً)
        await toggleShield(activeSession.id, false);
        toast.success("🔓 تم إيقاف الدرع والعودة للوضع العادي");
      }
    } catch (err) {
      console.error('Shield initialization error:', err);
      toast.error("❌ فشل الاتصال بمستشعرات الأمان الميكانيكية", { id: "shield-init" });
    } finally {
      setIsTogglingShield(false);
    }
  };

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
      className="h-full text-white flex flex-col items-center justify-start p-6 overflow-y-auto safe-top safe-bottom scrollbar-none"
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

      {/* 🛡️ لوحة التحكم لدرع الأمان الفيزيائي والمغناطيسي VIP (الطبقة المميزة الحصرية) */}
      <div 
        className="w-full border rounded-2xl p-4 mb-4 text-right transition-all duration-300 relative overflow-hidden"
        style={{
          background: isShieldActive 
            ? 'linear-gradient(135deg, rgba(30,58,138,0.4) 0%, rgba(15,23,42,0.8) 100%)' 
            : BRAND.navyLight,
          borderColor: isShieldActive ? BRAND.gold : BRAND.border,
          boxShadow: isShieldActive ? `0 8px 30px rgba(251,191,36,0.1)` : 'none'
        }}
      >
        {/* تأثير توهج خلفي للدرع الذهبي */}
        {isShieldActive && (
          <div className="absolute -top-12 -left-12 w-28 h-28 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
        )}

        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div 
              className={`p-2.5 rounded-xl transition-all duration-300 ${isShieldActive ? 'text-amber-400 bg-amber-400/10' : 'text-slate-400 bg-white/5'}`}
            >
              {isShieldActive ? <ShieldCheck size={20} className="animate-pulse" /> : <Shield size={20} />}
            </div>
            <div>
              <h3 className="text-xs font-black text-white flex items-center gap-1">
                <span>درع الأمان VIP الذكي</span>
                {isShieldActive && <span className="bg-amber-400/20 text-amber-300 text-[8px] px-1.5 py-0.5 rounded-full font-extrabold animate-bounce">مفعل</span>}
              </h3>
              <p className="text-[9px] text-slate-400 font-bold">بصمة الصاج، الاهتزاز، والسياج 250م</p>
            </div>
          </div>

          {/* مفتاح تفعيل الدرع VIP */}
          <button
            onClick={handleToggleShield}
            disabled={isTogglingShield}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all active:scale-95 ${
              isShieldActive 
                ? 'bg-amber-400 hover:bg-amber-500 text-slate-950 shadow-md shadow-amber-400/20' 
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20'
            }`}
          >
            {isTogglingShield ? (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-current rounded-full animate-ping" />
                جاري...
              </span>
            ) : isShieldActive ? (
              '🛡️ إلغاء التأمين'
            ) : (
              '⚡ تفعيل VIP'
            )}
          </button>
        </div>

        {/* مؤشر رادار المسافة ومستشعرات الصاج (يظهر حصرياً فقط لو الدرع نشط) */}
        <AnimatePresence>
          {isShieldActive && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-3 pt-3 border-t border-white/5 flex flex-col gap-2.5"
            >
              {/* الرادار التفاعلي */}
              <div className="flex items-center justify-between bg-white/5 rounded-xl p-2.5">
                <div className="flex items-center gap-2">
                  <Activity size={14} className="text-emerald-400 animate-pulse" />
                  <span className="text-[10px] font-black text-slate-300">مستشعر الزلازل والصاج:</span>
                </div>
                <span className="text-[10px] font-black text-emerald-400">آمن ومستقر 🟢</span>
              </div>

              {/* عداد المسافة الفورية الحقيقية (0م لو بجواره) */}
              {localDistance && (
                <div className="flex items-center justify-between bg-gradient-to-r from-amber-500/10 to-transparent rounded-xl p-2.5 border border-amber-500/20">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
                    <span className="text-[10px] font-black text-amber-300">رادار المسافة المباشرة:</span>
                  </div>
                  <span className="text-xs font-black text-amber-400 font-mono">{localDistance}</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {!isShieldActive && (
          <p className="text-[9px] text-amber-400/80 font-bold mt-2 leading-relaxed bg-amber-400/5 p-2 rounded-lg border border-amber-400/10">
            💡 خدمة مميزة اختيارية: تفعيل الدرع يضيف 10 ج.م فقط على إجمالي الفاتورة، ويؤمن سيارتك بالكامل في غيابك مع رادار تتبع حقيقي متكامل.
          </p>
        )}
      </div>

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
        className="w-36 h-36 rounded-full flex flex-col items-center justify-center border-2 mb-5 shadow-lg shrink-0"
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
      <div className="w-full border rounded-2xl p-4 mb-4 shrink-0" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
        <div className="flex justify-between items-center mb-3">
          <div className="text-center">
            <div className="text-xl font-black font-mono" style={{ color: isFreeNow ? BRAND.green : BRAND.blue }}>
              {pricingSummary.paidHours}
            </div>
            <div className="text-[9px] font-bold mt-0.5" style={{ color: BRAND.slateMuted }}>ساعة محسوبة</div>
          </div>
          <div className="text-lg font-black" style={{ color: BRAND.border }}>=</div>
          <div className="text-center">
            {/* عرض التكلفة الكلية مدمجة برسوم الدرع (10ج) لو كان نشطاً */}
            <div className="text-xl font-black font-mono" style={{ color: BRAND.green }}>
              {pricingSummary.totalCost} <span className="text-[10px]">ج.م</span>
            </div>
            <div className="text-[9px] font-bold mt-0.5" style={{ color: BRAND.slateMuted }}>إجمالي الحساب حتى الآن</div>
          </div>
        </div>

        {/* عداد التنازل الديناميكي للساعات والتحذيرات */}
        <div className="rounded-xl p-2.5 text-center border" style={{ background: BRAND.blueSoft, borderColor: BRAND.border }}>
          <div className="text-[9px] mb-0.5 font-bold" style={{ color: BRAND.slateMuted }}>{countdownLabel}</div>
          <div className="text-sm font-black font-mono" style={{ color: isFreeNow ? BRAND.green : BRAND.blue }}>
            {String(countdownTime?.minutes ?? 0).padStart(2, '0')}:{String(countdownTime?.seconds ?? 0).padStart(2, '0')}
          </div>
          <div className="text-[8px] mt-0.5 font-semibold" style={{ color: BRAND.slateMuted }}>
            {isFreeNow ? (
              <span>استمتع بالركن المجاني في أول نصف ساعة 🎁</span>
            ) : (
              <span>
                بعدها ستُحسب ساعة إضافية ({pricingSummary.paidHours + 1} × {sessionRate} = {(pricingSummary.paidHours + 1) * sessionRate} ج.م)
              </span>
            )}
          </div>
        </div>

        {/* تفاصيل الفاتورة الدقيقة الشفافة */}
        {isShieldActive && (
          <div className="mt-3 pt-3 border-t border-white/5 flex flex-col gap-1.5 text-[10px] font-bold text-slate-400">
            <div className="flex justify-between">
              <span>قيمة ركن السيارة:</span>
              <span className="text-white">{pricingSummary.parkingCost} ج.م</span>
            </div>
            <div className="flex justify-between text-amber-400">
              <span>تأمين درع VIP الفيزيائي:</span>
              <span>+ {pricingSummary.shieldFee} ج.م</span>
            </div>
          </div>
        )}
      </div>

      {sessionRate !== garage?.basePrice && garage && (
        <div className="w-full rounded-xl p-2 mb-3 text-center border shrink-0" style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.2)' }}>
          <p className="text-[9px] font-bold text-amber-500">💰 سعر خاص متفق عليه: {sessionRate} ج.م/ساعة (بدلاً من {garage.basePrice} ج.م)</p>
        </div>
      )}

      {/* بانر إرشادي متناسق ومدمج ومريح للشاشة */}
      <div 
        className="w-full rounded-2xl p-3.5 mb-4 text-center border shrink-0"
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
      <div className="w-full grid grid-cols-2 gap-2.5 mb-4 shrink-0">
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
        <div className="border p-3.5 rounded-2xl w-full text-center mb-3 shrink-0" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
          <div className="text-[8px] font-bold mb-0.5" style={{ color: BRAND.slateMuted }}>الجراج الحالي</div>
          <div className="text-xs font-black" style={{ color: '#ffffff' }}>{garage.name}</div>
        </div>
      )}

      <div className="w-full text-center mb-3.5 shrink-0">
        <span className="font-bold text-[9px]" style={{ color: BRAND.slateMuted }}>
          {activeSession.source === 'app' ? '📱 بدأت من التطبيق' : '🅿️ بدأت من الجراج'}
          {(activeSession as any).startedBy === 'garage' && ' (بواسطة السايس)'}
        </span>
      </div>

      {/* بانر توضيح طرق الدفع المتاحة في الجراج */}
      <div className="w-full border rounded-xl p-2.5 mb-4 text-center shrink-0" style={{ background: BRAND.blueSoft, borderColor: BRAND.border }}>
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
        className="w-full py-3.5 rounded-xl active:scale-[0.98] transition-all mb-3 flex items-center justify-center border-0 text-white cursor-pointer font-black shrink-0"
        style={{
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          boxShadow: '0 4px 14px rgba(220,38,38,0.25)',
        }}
      >
        <span className="text-center text-sm font-black" style={{ color: '#ffffff' }}>
          {isFreeNow && !isShieldActive ? (
            <span>🚗 إنهاء الجلسة (مجاناً 🎁)</span>
          ) : (
            <span>🚗 إنهاء الجلسة وحساب التكلفة ({pricingSummary.totalCost} ج.م)</span>
          )}
        </span>
      </button>

      {/* زر العودة الصامت */}
      <button
        onClick={() => setScreen('list')}
        className="w-full py-2.5 rounded-xl border cursor-pointer bg-transparent text-xs shrink-0 mb-4"
        style={{ color: BRAND.slateMuted, borderColor: BRAND.border }}
      >
        العودة للقائمة الرئيسية
      </button>
    </motion.div>
  );
}