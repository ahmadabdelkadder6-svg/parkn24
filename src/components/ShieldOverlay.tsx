// ═══════════════════════════════════════════════════════════
// 🛡️ ShieldOverlay — طبقة فوق SessionScreen
// v3: بدون اهتزاز + رادار فوق العداد + شرط الرصيد في SessionScreen
// ═══════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import {
  startFakeAlerts, stopFakeAlerts,
  startShieldGPS, stopShieldGPS,
  destroyShield,
  saveShieldState, loadShieldState,
  SHIELD_STORAGE_KEY,
  type FakeAlert,
} from '../lib/shield';
import {
  sendLocalNotification,
  playUrgentSound,
  playNormalAlert,
  vibrateUrgent,
  requestNotificationPermission,
  stopVibration,
  unlockAudio,
} from '../utils/notifications';
import { subscribeToPush } from '../lib/pushManager';

const SHIELD_COST = 7;

interface Props {
  sessionId: string;
  garageId: string;
  garageLat: number;
  garageLng: number;
  walletBalance: number;
  onDeductWallet: (amount: number) => void;
  onNavigateToWallet: () => void;
}

// حذف vibration من Phase
type Phase = 'ask' | 'register' | 'active' | 'breach' | 'dismissed';

export default function ShieldOverlay({
  sessionId, garageId, garageLat, garageLng,
  walletBalance, onDeductWallet, onNavigateToWallet,
}: Props) {
  const { activateShield, chargeShieldFee, updateSessionShieldCost, currentUser } = useStore();

  const [phase, setPhase] = useState<Phase>('ask');
  const [phone, setPhone] = useState('');
  const [shieldCode, setShieldCode] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<FakeAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [radarAngle, setRadarAngle] = useState(0);

  const cleanups = useRef<(() => void)[]>([]);
  const breachFired = useRef(false);
  const activeStarted = useRef(false);

  // ─── أنيميشن الرادار ───
  useEffect(() => {
    if (phase !== 'active') return;
    const interval = setInterval(() => {
      setRadarAngle(prev => (prev + 3) % 360);
    }, 50);
    return () => clearInterval(interval);
  }, [phase]);

  // ─── Cleanup عند unmount ───
  useEffect(() => {
    return () => {
      cleanups.current.forEach(fn => fn());
      stopFakeAlerts();
      stopShieldGPS();
      stopVibration();
      const st = useStore.getState();
      const hasActive = st.sessions.some(s => s.status === 'active');
      if (!hasActive) {
        try { localStorage.removeItem(SHIELD_STORAGE_KEY); } catch { /* */ }
      }
    };
  }, []);

  // ─── استعادة الدرع بعد refresh ───
  useEffect(() => {
    const saved = loadShieldState();
    if (saved?.isActive && saved.garageId === garageId) {
      setShieldCode(saved.shieldCode);
      setPhase('active');
    }
  }, [garageId]);

  // ─── بدء الوضع النشط ───
  const startActiveMode = useCallback((code: string | null) => {
    if (activeStarted.current) return;
    activeStarted.current = true;

    startFakeAlerts(
      (alert) => {
        setAlerts(prev => [...prev.slice(-4), alert]);
        setTimeout(() => setAlerts(prev => prev.filter(a => a !== alert)), 8000);
        sendLocalNotification(
          `${alert.icon} ${alert.title}`,
          alert.body,
          `shield-${alert.type}`,
        );
        playNormalAlert();
      },
      {
        onWarningResolved: (_w, resolved) => {
          setAlerts(prev => [...prev.filter(a => a.type !== 'warning'), resolved]);
          setTimeout(() => setAlerts(prev => prev.filter(a => a !== resolved)), 6000);
          sendLocalNotification(
            `${resolved.icon} ${resolved.title}`,
            resolved.body,
            'shield-resolved',
          );
        },
      },
    );

    const stopGPS = startShieldGPS({
      parkingLat: garageLat,
      parkingLng: garageLng,
      onGeofenceBreach: () => {
        if (breachFired.current) return;
        breachFired.current = true;
        stopFakeAlerts();
        setPhase('breach');
        playUrgentSound();
        vibrateUrgent();
        sendLocalNotification(
          '🚨 إنذار سرقة!',
          'السيارة خرجت من نطاق الجراج! افتح التطبيق فوراً',
          'shield-breach',
        );
      },
    });
    cleanups.current.push(stopGPS);

    saveShieldState({
      isActive: true,
      shieldCode: code,
      phone: currentUser?.phone ?? null,
      garageId,
      parkingLat: garageLat,
      parkingLng: garageLng,
      learnedVibration: true,
    });
  }, [garageId, garageLat, garageLng, currentUser]);

  useEffect(() => {
    if (phase === 'active') startActiveMode(shieldCode);
  }, [phase, shieldCode, startActiveMode]);

  // ═══════════════════════════════════════════════════════════
  // 🎯 HANDLERS
  // ═══════════════════════════════════════════════════════════

  const handleYes = async () => {
    setLoading(true);
    setError(null);
    try {
      await requestNotificationPermission();
      unlockAudio();
      await subscribeToPush().catch(() => {});

      const charge = await chargeShieldFee();
      if (!charge.success) {
        if (walletBalance < SHIELD_COST) {
          setError('رصيدك مش كافي — شحن المحفظة الأول');
          return;
        }
        setError('حصل مشكلة في الخصم');
        return;
      }

      const cost = charge.isFree ? 0 : SHIELD_COST;
      await updateSessionShieldCost(sessionId, cost);

      const result = await activateShield(currentUser?.phone ?? '');
      if (!result.success) { setError('فشل تفعيل الدرع'); return; }

      setShieldCode(result.code ?? null);

      // حذف vibration — نروح active مباشرة أو register لو مفيش رقم
      const saved = loadShieldState();
      if (!saved?.phone && !currentUser?.phone) {
        setPhase('register');
      } else {
        setPhase('active');
      }
    } catch (e) {
      console.error('Shield error:', e);
      setError('حصل مشكلة — جرّب تاني');
    } finally {
      setLoading(false);
    }
  };

  const handleNo = () => setPhase('dismissed');

  const handleRegister = () => {
    if (!phone || phone.length < 11) { setError('اكتب رقم موبايل صحيح'); return; }
    setError(null);
    setPhase('active'); // مباشرة بدون vibration
  };

  const handleBreachSafe = () => {
    breachFired.current = false;
    stopVibration();
    activeStarted.current = false;
    setPhase('active');
  };

  const handleBreachTheft = () => {
    const emergency = currentUser?.phone ?? phone;
    alert(`🚨 تم إرسال إنذار سرقة!\nسيتم التواصل مع ${emergency}`);
  };

  // ═══════════════════════════════════════════════════════════
  // 🎨 RENDER
  // ═══════════════════════════════════════════════════════════
  if (phase === 'dismissed') return null;

  // ─── ACTIVE: رادار فوق العداد ───
  if (phase === 'active') {
    return (
      <div className="w-full flex flex-col items-center" dir="rtl">
        {/* 🛡️ الرادار */}
        <div className="relative mb-4">
          <div
            className="w-32 h-32 rounded-full relative overflow-hidden"
            style={{
              background: 'radial-gradient(circle, #061224 0%, #0a1628 60%, #0d1f3c 100%)',
              border: '2px solid rgba(59,130,246,0.3)',
              boxShadow: `
                0 0 30px rgba(59,130,246,0.15),
                inset 0 0 20px rgba(59,130,246,0.08)
              `,
            }}
          >
            {/* الحلقات الداخلية */}
            <div className="absolute inset-0 flex items-center justify-center">
              {[40, 28, 16].map((size, i) => (
                <div
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    width: `${size * 2}px`,
                    height: `${size * 2}px`,
                    border: `1px solid rgba(59,130,246,${0.1 + i * 0.05})`,
                  }}
                />
              ))}
            </div>

            {/* الخطوط المتقاطعة */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="absolute w-full h-[1px]" style={{ background: 'rgba(59,130,246,0.12)' }} />
              <div className="absolute h-full w-[1px]" style={{ background: 'rgba(59,130,246,0.12)' }} />
            </div>

            {/* شعاع الرادار الدوّار */}
            <div
              className="absolute inset-0"
              style={{
                background: `conic-gradient(
                  from ${radarAngle}deg at 50% 50%,
                  transparent 0deg,
                  rgba(140,198,63,0.4) 30deg,
                  rgba(140,198,63,0.15) 60deg,
                  transparent 90deg,
                  transparent 360deg
                )`,
              }}
            />

            {/* النقطة المركزية */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="w-2.5 h-2.5 rounded-full animate-pulse"
                style={{
                  background: '#8cc63f',
                  boxShadow: '0 0 10px #8cc63f, 0 0 20px rgba(140,198,63,0.4)',
                }}
              />
            </div>

            {/* نقاط وهمية على الرادار */}
            {[
              { x: 65, y: 30, size: 4, opacity: 0.6 },
              { x: 25, y: 70, size: 3, opacity: 0.4 },
              { x: 80, y: 75, size: 3, opacity: 0.3 },
            ].map((dot, i) => (
              <div
                key={i}
                className="absolute rounded-full animate-pulse"
                style={{
                  left: `${dot.x}%`,
                  top: `${dot.y}%`,
                  width: dot.size,
                  height: dot.size,
                  background: '#3b82f6',
                  opacity: dot.opacity,
                  boxShadow: `0 0 6px rgba(59,130,246,${dot.opacity})`,
                  animationDelay: `${i * 0.5}s`,
                }}
              />
            ))}
          </div>

          {/* بادج الحالة تحت الرادار */}
          <div
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1 rounded-full flex items-center gap-1.5"
            style={{
              background: 'linear-gradient(135deg, #166534 0%, #15803d 100%)',
              boxShadow: '0 2px 10px rgba(22,101,52,0.4)',
              border: '1px solid rgba(140,198,63,0.3)',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: '#86efac', boxShadow: '0 0 6px #86efac' }}
            />
            <span className="text-[9px] font-black text-green-100">🛡️ الدرع نشط</span>
            {shieldCode && (
              <>
                <span className="w-px h-2.5 bg-green-400/30" />
                <span className="text-[8px] font-mono font-bold text-green-300/70">{shieldCode}</span>
              </>
            )}
          </div>
        </div>

        {/* 📬 الإشعارات الوهمية */}
        <AnimatePresence>
          {alerts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="w-full max-w-sm space-y-1.5 mt-2"
            >
              {alerts.map((a, i) => (
                <motion.div
                  key={`${a.type}-${i}-${a.body}`}
                  initial={{ x: 80, opacity: 0, scale: 0.9 }}
                  animate={{ x: 0, opacity: 1, scale: 1 }}
                  exit={{ x: -80, opacity: 0, scale: 0.9 }}
                  transition={{ type: 'spring', damping: 20 }}
                  className={`rounded-xl px-3 py-2 flex items-center gap-2 border ${
                    a.type === 'warning'
                      ? 'bg-red-950/40 border-red-500/30 text-red-300'
                      : a.type === 'resolved'
                        ? 'bg-green-950/40 border-green-500/30 text-green-300'
                        : a.type === 'qrScan'
                          ? 'bg-purple-950/40 border-purple-500/30 text-purple-300'
                          : 'bg-blue-950/40 border-blue-500/30 text-blue-300'
                  }`}
                  style={{
                    backdropFilter: 'blur(8px)',
                    boxShadow: a.type === 'warning'
                      ? '0 2px 10px rgba(239,68,68,0.1)'
                      : '0 2px 8px rgba(0,0,0,0.2)',
                  }}
                >
                  <span className="text-sm">{a.icon}</span>
                  <span className="flex-1 text-[10px] font-bold leading-snug">{a.body}</span>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ─── باقي الـ phases (ask, register, breach) ───
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-end justify-center pointer-events-none"
        dir="rtl"
      >
        {/* ─── ASK ─── */}
        {phase === 'ask' && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="pointer-events-auto w-full max-w-md mx-4 mb-6 bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden"
            style={{ boxShadow: '0 -8px 40px rgba(0,0,0,0.15)' }}
          >
            <div className="bg-gradient-to-l from-blue-600 to-blue-700 px-6 py-5 text-white">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🛡️</span>
                <div>
                  <h3 className="text-lg font-black">درع حماية السيارة</h3>
                  <p className="text-blue-100 text-xs font-bold mt-0.5">حماية ذكية 24 ساعة لسيارتك</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-3">
              {[
                'مراقبة ذكية بالذكاء الاصطناعي',
                'إنذار فوري لو حد لمس العربية',
                'تتبع الموقع الجغرافي',
              ].map(t => (
                <div key={t} className="flex items-start gap-2 text-sm text-slate-600">
                  <span className="text-green-500 mt-0.5">✓</span><span>{t}</span>
                </div>
              ))}

              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-3">
                <p className="text-xs font-bold text-amber-800">
                  💰 أول مرة: <span className="text-green-600">مجاناً</span>
                  {' '}| بعدها: <span className="text-blue-700">{SHIELD_COST} ج.م</span>/جلسة
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2">
                  <p className="text-xs font-bold text-red-600">{error}</p>
                  {error.includes('رصيدك') && (
                    <button
                      onClick={onNavigateToWallet}
                      className="mt-2 text-xs font-black text-blue-600 underline"
                    >
                      شحن المحفظة الآن ←
                    </button>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleYes}
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-black py-3.5 rounded-2xl text-sm active:scale-95 transition-all"
                >
                  {loading ? '⏳ جاري التفعيل...' : '🛡️ نعم، فعّل الدرع'}
                </button>
                <button
                  onClick={handleNo}
                  disabled={loading}
                  className="px-5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black py-3.5 rounded-2xl text-sm active:scale-95 transition-all"
                >
                  لأ
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ─── REGISTER ─── */}
        {phase === 'register' && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="pointer-events-auto w-full max-w-md mx-4 mb-6 bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden"
          >
            <div className="bg-gradient-to-l from-green-600 to-green-700 px-6 py-5 text-white">
              <h3 className="text-lg font-black">📱 رقم الطوارئ</h3>
              <p className="text-green-100 text-xs font-bold mt-1">
                هنرسل عليه إنذار لو حصل حاجة (مرة واحدة بس)
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="01XXXXXXXXX"
                className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-center text-lg font-black tracking-widest focus:border-blue-500 focus:outline-none"
                dir="ltr"
              />
              {error && <p className="text-xs font-bold text-red-500 text-center">{error}</p>}
              <button
                onClick={handleRegister}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-3.5 rounded-2xl text-sm active:scale-95 transition-all"
              >
                ✅ تأكيد ومتابعة
              </button>
            </div>
          </motion.div>
        )}

        {/* ─── BREACH 🚨 ─── */}
        {phase === 'breach' && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="pointer-events-auto fixed inset-0 z-[99999] bg-red-900/95 flex flex-col items-center justify-center p-8 text-white"
          >
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ repeat: Infinity, duration: 0.7 }}
              className="text-8xl mb-6"
            >
              🚨
            </motion.div>
            <h2 className="text-2xl font-black mb-2">إنذار سرقة!</h2>
            <p className="text-red-200 text-sm font-bold mb-8 text-center leading-relaxed">
              العربية خرجت من نطاق الجراج!
              <br />
              لو مش أنت اللي سايق، فعّل الإنذار فوراً
            </p>
            <div className="w-full max-w-sm space-y-3">
              <button
                onClick={handleBreachSafe}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-4 rounded-2xl text-base active:scale-95 transition-all"
              >
                ✅ أنا اللي سايق — كلو أمان
              </button>
              <button
                onClick={handleBreachTheft}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-4 rounded-2xl text-base active:scale-95 transition-all border-2 border-red-400"
              >
                🚨 مش أنا! سرقة!
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}