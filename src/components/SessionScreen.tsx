import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  Lock,
  Unlock,
  Radio,
} from 'lucide-react';
import { useStore, normalizePlate, normalizePhone, getServerNow } from '../store';
import {
  calculateFullHours,
  calculateCost,
  formatTime,
  getRemainingInCurrentHour,
  calculateTotalCostWithShield,
} from '../utils/pricing';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

import { requestLocationPermission, getCurrentLocation, startDistanceTracking } from '../utils/distanceTracker';
import { checkGeofence } from '../utils/geofenceEngine';
import { captureFullPhysicalShield } from '../utils/batShieldEngine';
import { notifyShieldActivated } from '../utils/notifications';

/* ─── 🎨 الألوان الرسمية ─── */
const BRAND = {
  blue: '#1656b8',       // الأزرق الرسمي
  blueDark: '#0f3d85',   // الكحلي الفخم
  blueLight: '#e8f0fe',  // الأزرق الفاتح جداً
  blueSoft: 'rgba(22, 86, 184, 0.08)', 
  green: '#8cc63f',      // الأخضر الرسمي
  greenDark: '#6ea62a',  // أخضر داكن
  greenLight: 'rgba(140, 198, 63, 0.12)', 
  navy: '#0a1628',       // الكحلي الليلي الغامق للواجهة
  navyLight: '#111e36',  // كحلي أفتح للبطاقات
  slate: '#64748b',      
  slateMuted: '#94a3b8', 
  border: 'rgba(255, 255, 255, 0.08)', 
  gold: '#fbbf24',       // ذهبي VIP
  goldLight: 'rgba(251, 191, 36, 0.15)',
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
  const [isTogglingShield, setIsTogglingShield] = useState(false);
  const [localDistance, setLocalDistance] = useState<string | null>(null);

  const isMySessionRow = useCallback((row: any) => {
    if (!row) return false;
    const rowPlate = normalizePlate(row.car_plate || row.carPlate);
    const rowPhone = normalizePhone(row.customer_phone || row.customerPhone || '');
    return (
      (!!userPlate && rowPlate === userPlate) ||
      (!!userPhone && rowPhone === userPhone)
    );
  }, [userPlate, userPhone]);

  // البحث عن الجلسة النشطة
  const activeSession = useMemo(() => {
    return (sessions || [])
      .filter((s) => {
        if (!s || s.status !== 'active') return false;
        if (acknowledgedSessionIds?.has(s.id)) return false;
        const samePlateMatch = !!userPlate && normalizePlate(s.carPlate || '') === userPlate;
        const sPhone = (s as any).customerPhone ? normalizePhone((s as any).customerPhone) : '';
        const samePhoneMatch = Boolean(userPhone && sPhone === userPhone);
        return samePlateMatch || samePhoneMatch;
      })
      .sort((a, b) => safeParseTime(b.startTime) - safeParseTime(a.startTime))[0];
  }, [sessions, userPlate, userPhone, acknowledgedSessionIds]);

  // البحث عن آخر جلسة مكتملة
  const lastCompletedSession = useMemo(() => {
    return (sessions || [])
      .filter((s) => {
        if (!s || s.status !== 'completed') return false;
        const samePlateMatch = !!userPlate && normalizePlate(s.carPlate || '') === userPlate;
        const sPhone = (s as any).customerPhone ? normalizePhone((s as any).customerPhone) : '';
        const samePhoneMatch = Boolean(userPhone && sPhone === userPhone);
        return samePlateMatch || samePhoneMatch;
      })
      .sort((a, b) => safeParseTime(b.endTime) - safeParseTime(a.endTime))[0];
  }, [sessions, userPlate, userPhone]);

  const garage = garages?.find(
    (g) => g && g.id === (activeSession?.garageId ?? lastCompletedSession?.garageId),
  );

  useEffect(() => {
    if (activeSession?.id) {
      activeSessionIdRef.current = activeSession.id;
    }
  }, [activeSession?.id]);

  const activeStartMs = useMemo(() => {
    if (!activeSession) return 0;
    const ms = safeParseTime(activeSession.startTime);
    return ms > 0 ? ms : getServerNow();
  }, [activeSession?.id, activeSession?.startTime]);

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

    const handleVisibility = () => { 
      if (document.visibilityState === 'visible') refetch(); 
    };
    const handleWindowFocus = () => { 
      refetch(); 
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleWindowFocus);
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      if (realtimeChannelRef.current) { supabase.removeChannel(realtimeChannelRef.current); realtimeChannelRef.current = null; }
    };
  }, [userPlate, userPhone, fetchAll, isMySessionRow]);

  // عداد الثواني اللحظي
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

  // تتبع المسافة والنبض الحصري للدرع الذهبي النشط
  useEffect(() => {
    if (!activeSession?.is_shield_active) {
      setLocalDistance(null);
      return;
    }

    const carLat = activeSession.anchor_lat || activeSession.lat;
    const carLng = activeSession.anchor_lng || activeSession.lng;

    if (!carLat || !carLng) return;

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

  // التحويل التلقائي الفوري لشاشة الملخص فور إنهاء الجلسة لمنع الوقوف على جاري التحميل
  useEffect(() => {
    if (activeSession) {
      redirectedToSummaryRef.current = false;
      return;
    }

    if (activeSessionIdRef.current) {
      const targetSession = (sessions || []).find((s) => s && s.id === activeSessionIdRef.current);
      if (targetSession && targetSession.status === 'completed' && !redirectedToSummaryRef.current) {
        redirectedToSummaryRef.current = true;
        if (targetSession.garageId) setSelectedGarageId(targetSession.garageId);
        if (typeof acknowledgeSession === 'function') acknowledgeSession(targetSession.id);
        activeSessionIdRef.current = null;
        toast.success('تم إنهاء الجلسة بنجاح ✅', { icon: '🏁', duration: 3000 });
        setScreen('summary');
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
        setScreen('summary');
      }
    }
  }, [activeSession, lastCompletedSession, sessions, setScreen, setSelectedGarageId, acknowledgedSessionIds, acknowledgeSession]);

  const sessionRate = Number(activeSession?.agreedPrice ?? garage?.basePrice ?? 0);
  const isFirstFreeApplied = activeSession?.isFirstFreeSession === true;
  const isShieldActive = activeSession?.is_shield_active === true;

  const pricingSummary = useMemo(() => {
    return calculateTotalCostWithShield(elapsed, sessionRate, isFirstFreeApplied, isShieldActive);
  }, [elapsed, sessionRate, isFirstFreeApplied, isShieldActive]);

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

  const handleToggleShield = async () => {
    if (!activeSession || isTogglingShield) return;
    setIsTogglingShield(true);

    try {
      if (!isShieldActive) {
        const hasPermission = await requestLocationPermission();
        if (!hasPermission) {
          toast.error("⚠️ يرجى تفعيل إذن الموقع الجغرافي لتأمين الركنة!");
          setIsTogglingShield(false);
          return;
        }

        let location = await getCurrentLocation();
        
        if (!location) {
          console.warn("📡 GPS Signal weak indoors. Auto-falling back to Garage Coordinates.");
          if (garage && garage.lat && garage.lng) {
            location = { lat: garage.lat, lng: garage.lng };
            toast.success("📡 تم ربط الدرع بموقع الجراج تلقائياً لضعف إشارة الموقع", { duration: 3000 });
          }
        }

        if (!location) {
          toast.error("⚠️ تعذر تحديد إحداثيات الركنة الدقيقة حالياً.");
          setIsTogglingShield(false);
          return;
        }

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

        toast.loading("🦇 جاري فحص صدى الصاج والبصمة المغناطيسية...", { id: "shield-init" });
        const physicalData = await captureFullPhysicalShield();

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
        toast.success("🛡️ تم تفعيل درع الأمان VIP بنجاح (+10 ج.م)", { id: "shield-init", icon: "👑" });
      } else {
        await toggleShield(activeSession.id, false);
        toast.success("🔓 تم إيقاف الدرع والعودة للوضع العادي");
      }
    } catch (err) {
      console.error('Shield error:', err);
      toast.error("❌ فشل تشغيل مستشعرات الأمان", { id: "shield-init" });
    } finally {
      setIsTogglingShield(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full text-white flex flex-col items-center justify-start p-5 overflow-y-auto safe-top safe-bottom scrollbar-none"
      style={{ background: BRAND.navy }}
    >
      {/* 🎁 شارة الهدية الترحيبية */}
      {isFirstFreeApplied && (
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full border rounded-2xl p-3 mb-3 flex items-center gap-3"
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

      {/* 🛡️ لوحة درع الأمان VIP الفاخر والتفاعلي بوضوح تام */}
      <div 
        className="w-full border-2 rounded-3xl p-4 mb-4 text-right transition-all duration-300 relative overflow-hidden shadow-2xl"
        style={{
          background: isShieldActive 
            ? 'linear-gradient(135deg, #111e36 0%, #0d1b2a 100%)' 
            : 'linear-gradient(135deg, #111e36 0%, #152238 100%)',
          borderColor: isShieldActive ? BRAND.gold : 'rgba(251, 191, 36, 0.35)',
          boxShadow: isShieldActive ? '0 10px 30px rgba(251, 191, 36, 0.2)' : '0 6px 20px rgba(0,0,0,0.2)',
        }}
      >
        <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-3">
          <div 
            className="flex items-center gap-1 px-3 py-1.5 rounded-full font-black text-xs font-mono"
            style={{
              background: isShieldActive ? BRAND.gold : 'rgba(251, 191, 36, 0.15)',
              color: isShieldActive ? '#0a1628' : BRAND.gold,
              border: `1px solid ${BRAND.gold}`,
            }}
          >
            <span>{isShieldActive ? '🛡️ مفعّل' : '+10 ج.م فقط'}</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-right">
              <h3 className="text-sm font-black text-white flex items-center gap-1.5 justify-end">
                <span>درع الأمان VIP الذكي</span>
                <Sparkles size={14} className="text-amber-400" />
              </h3>
              <p className="text-[10px] text-amber-300/80 font-bold mt-0.5">
                تأمين ركنة السيارة وحمايتها من السرقة
              </p>
            </div>
            <div 
              className="p-2.5 rounded-2xl shrink-0"
              style={{
                background: isShieldActive ? BRAND.gold : 'rgba(255, 255, 255, 0.05)',
                color: isShieldActive ? '#0a1628' : BRAND.gold,
              }}
            >
              {isShieldActive ? <ShieldCheck size={22} className="animate-pulse" /> : <Shield size={22} />}
            </div>
          </div>
        </div>

        {/* شرح مبسط للميزة بدون تفاصيل صاج معقدة بناءً على طلبك */}
        <div className="text-right space-y-2 mb-3.5 bg-black/25 p-3 rounded-2xl border border-white/5">
          <div className="flex items-center gap-2 justify-end text-xs font-bold text-white">
            <span>تتبع موقع سيارتك وحركتها لحظة بلحظة 📍</span>
          </div>
          <div className="flex items-center gap-2 justify-end text-xs font-bold text-white">
            <span>إنذار طوارئ فوري واهتزاز عند تحرك السيارة 🚨</span>
          </div>
          <div className="flex items-center gap-2 justify-end text-xs font-bold text-white">
            <span>رادار مباشر يرشدك لمكان السيارة خطوة بخطوة 📏</span>
          </div>
        </div>

        {/* مؤشرات الرادار الحية عند التشغيل */}
        <AnimatePresence>
          {isShieldActive && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-3.5 flex flex-col gap-2 overflow-hidden"
            >
              <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-2.5">
                <span className="text-[10px] font-black text-emerald-400 font-mono">نشط ومستقر 🟢</span>
                <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-200">
                  <span>مستشعر اهتزاز وحركة السيارة:</span>
                  <Activity size={13} className="text-emerald-400 animate-pulse" />
                </div>
              </div>

              {localDistance && (
                <div className="flex items-center justify-between bg-gradient-to-r from-amber-500/20 to-transparent border border-amber-500/30 rounded-xl p-2.5">
                  <span className="text-xs font-black text-amber-300 font-mono">{localDistance}</span>
                  <div className="flex items-center gap-1.5 text-[10px] font-black text-amber-300">
                    <span>رادار المسافة المباشر:</span>
                    <Radio size={14} className="text-amber-400 animate-spin" />
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 🔘 الزر التفاعلي البارز لدرع VIP */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleToggleShield}
          disabled={isTogglingShield}
          className="w-full py-4 px-4 rounded-2xl font-black text-xs flex items-center justify-center gap-2 cursor-pointer border-0 shadow-lg transition-all active:scale-95"
          style={{
            background: isShieldActive 
              ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' 
              : 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
            color: isShieldActive ? '#ffffff' : '#0a1628',
            boxShadow: isShieldActive 
              ? '0 4px 14px rgba(220, 38, 38, 0.35)' 
              : '0 4px 18px rgba(251, 191, 36, 0.45)',
          }}
        >
          {isTogglingShield ? (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-current animate-ping" />
              جاري فحص المستشعرات...
            </span>
          ) : isShieldActive ? (
            <>
              <Unlock size={15} />
              <span>إيقاف درع الأمان VIP والعودة للوضع العادي</span>
            </>
          ) : (
            <>
              <Lock size={15} />
              <span className="text-sm font-black">⚡ تفعيل درع الأمان VIP الآن (10 ج.م فقط)</span>
            </>
          )}
        </motion.button>
      </div>

      {/* حلقة العداد الدائرية */}
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
        className="w-36 h-36 rounded-full flex flex-col items-center justify-center border-2 mb-4 shadow-lg shrink-0"
        style={{
          background: BRAND.navyLight,
          borderColor: isFreeNow ? BRAND.green : BRAND.blue,
        }}
      >
        <Clock size={20} style={{ color: isFreeNow ? BRAND.green : BRAND.blue }} className="mb-1" />
        <div className="text-2xl font-black font-mono text-white leading-none">{formatTime(elapsed)}</div>
        <div className="text-[9px] font-bold mt-1.5" style={{ color: BRAND.slateMuted }}>مدة الركن الفعلية</div>
      </motion.div>

      {/* كارت الحساب التفاعلي */}
      <div className="w-full border rounded-2xl p-4 mb-3.5 shrink-0" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
        <div className="flex justify-between items-center mb-3">
          <div className="text-center">
            <div className="text-xl font-black font-mono" style={{ color: isFreeNow ? BRAND.green : BRAND.blue }}>
              {pricingSummary.paidHours}
            </div>
            <div className="text-[9px] font-bold mt-0.5" style={{ color: BRAND.slateMuted }}>ساعة محسوبة</div>
          </div>
          <div className="text-lg font-black" style={{ color: BRAND.border }}>=</div>
          <div className="text-center">
            <div className="text-xl font-black font-mono" style={{ color: BRAND.green }}>
              {pricingSummary.totalCost} <span className="text-[10px]">ج.م</span>
            </div>
            <div className="text-[9px] font-bold mt-0.5" style={{ color: BRAND.slateMuted }}>إجمالي الحساب حتى الآن</div>
          </div>
        </div>

        {/* عداد التنازل الديناميكي للساعات */}
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

        {/* تفاصيل الفاتورة الشفافة */}
        {isShieldActive && (
          <div className="mt-3 pt-3 border-t border-white/5 flex flex-col gap-1 text-[10px] font-bold text-slate-400">
            <div className="flex justify-between">
              <span>قيمة ركن السيارة:</span>
              <span className="text-white font-mono">{pricingSummary.parkingCost} ج.م</span>
            </div>
            <div className="flex justify-between text-amber-400">
              <span>تأمين درع الأمان VIP:</span>
              <span className="font-mono">+ {pricingSummary.shieldFee} ج.م</span>
            </div>
          </div>
        )}
      </div>

      {/* بيانات السيارة والسعر */}
      <div className="w-full grid grid-cols-2 gap-2.5 mb-3 shrink-0">
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
        <div className="border p-3 rounded-2xl w-full text-center mb-3 shrink-0" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
          <div className="text-[8px] font-bold mb-0.5" style={{ color: BRAND.slateMuted }}>الجراج الحالي</div>
          <div className="text-xs font-black" style={{ color: '#ffffff' }}>{garage.name}</div>
        </div>
      )}

      {/* طرق الدفع المقبولة بالجراج */}
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

      {/* زر إنهاء الجلسة */}
      <button
        onClick={() => setScreen('summary')}
        className="w-full py-3.5 rounded-2xl active:scale-[0.98] transition-all mb-2.5 flex items-center justify-center border-0 text-white cursor-pointer font-black shrink-0"
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

      {/* زر العودة */}
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