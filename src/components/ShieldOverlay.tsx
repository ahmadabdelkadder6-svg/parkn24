// ═══════════════════════════════════════════════════════════
// 🛡️ ShieldOverlay — طبقة فوق SessionScreen
// صفر تغيير في أي كود موجود
// ═══════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import {
  startFakeAlerts, stopFakeAlerts,
  startShieldGPS, stopShieldGPS,
  startVibrationDemo,
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

type Phase = 'ask' | 'register' | 'vibration' | 'active' | 'breach' | 'dismissed';

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

  const cleanups = useRef<(() => void)[]>([]);
  const breachFired = useRef(false);
  const activeStarted = useRef(false);

  // ─── Cleanup عند unmount (الجلسة انتهت) ───
  useEffect(() => {
    return () => {
      cleanups.current.forEach((fn) => fn());
      stopFakeAlerts();
      stopShieldGPS();
      stopVibration();
      // امسح localStorage بس لو مفيش جلسة شغالة
      const st = useStore.getState();
      const hasActive = st.sessions.some((s) => s.status === 'active');
      if (!hasActive) {
        try { localStorage.removeItem(SHIELD_STORAGE_KEY); } catch { /* */ }
      }
    };
  }, []);

  // ─── استعادة الدرع لو كان شغال (refresh / رجوع للتطبيق) ───
  useEffect(() => {
    const saved = loadShieldState();
    if (saved?.isActive && saved.garageId === garageId) {
      setShieldCode(saved.shieldCode);
      setPhase('active');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garageId]);

  // ─── بدء الوضع النشط (مرة واحدة بس) ───
  const startActiveMode = useCallback(
    (code: string | null) => {
      if (activeStarted.current) return;
      activeStarted.current = true;

      // إشعارات وهمية — بتوصل كـ local notification حقيقية عبر SW
      startFakeAlerts(
        (alert) => {
          setAlerts((prev) => [...prev.slice(-4), alert]);
          setTimeout(() => setAlerts((prev) => prev.filter((a) => a !== alert)), 8000);
          // إشعار حقيقي يوصل حتى لو التطبيق في الخلفية
          sendLocalNotification(
            `${alert.icon} ${alert.title}`,
            alert.body,
            `shield-${alert.type}`,
          );
          playNormalAlert();
        },
        {
          onWarningResolved: (_w, resolved) => {
            setAlerts((prev) => [...prev.filter((a) => a.type !== 'warning'), resolved]);
            setTimeout(() => setAlerts((prev) => prev.filter((a) => a !== resolved)), 6000);
            sendLocalNotification(
              `${resolved.icon} ${resolved.title}`,
              resolved.body,
              'shield-resolved',
            );
          },
        },
      );

      // GPS geofence
      const stopGPS = startShieldGPS({
        parkingLat: garageLat,
        parkingLng: garageLng,
        onGeofenceBreach: () => {
          if (breachFired.current) return;
          breachFired.current = true;
          stopFakeAlerts();
          setPhase('breach');
          // 🚨 إنذار حقيقي — صوت + اهتزاز + إشعار Push
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
    },
    [garageId, garageLat, garageLng, currentUser],
  );

  // لما الـ phase يبقى active → شغّل المحرك
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
      // 0) طلب إذن الإشعارات + فتح الصوت + Push
      await requestNotificationPermission();
      unlockAudio();
      await subscribeToPush().catch(() => { /* مش حرج */ });

      // 1) التحقق + الخصم (chargeShieldFee بيخصم من Supabase)
      const charge = await chargeShieldFee();
      if (!charge.success) {
        if (walletBalance < SHIELD_COST) {
          setError('رصيدك مش كافي — شحن المحفظة الأول');
          return;
        }
        setError('حصل مشكلة في الخصم');
        return;
      }

      // 2) حفظ تكلفة الدرع في الـ session
      const cost = charge.isFree ? 0 : SHIELD_COST;
      await updateSessionShieldCost(sessionId, cost);

      // 3) تفعيل الدرع (البصمة الموحدة)
      const result = await activateShield(currentUser?.phone ?? '');
      if (!result.success) { setError('فشل تفعيل الدرع'); return; }

      setShieldCode(result.code ?? null);

      // 4) تحديد المرحلة الجاية
      const saved = loadShieldState();
      if (!saved?.phone && !currentUser?.phone) {
        setPhase('register');
      } else if (!saved?.learnedVibration) {
        setPhase('vibration');
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
    setPhase('vibration');
  };

  const handleLearned = () => setPhase('active');

  const handleBreachSafe = () => {
    breachFired.current = false;
    stopVibration();
    activeStarted.current = false; // عشان نبدأ تاني
    setPhase('active');
  };

  const handleBreachTheft = () => {
    const emergency = currentUser?.phone ?? phone;
    // هنا Twilio هيتنادى في الإنتاج
    alert(`🚨 تم إرسال إنذار سرقة!\nسيتم التواصل مع ${emergency}`);
  };

  // ═══════════════════════════════════════════════════════════
  // 🎨 RENDER
  // ═══════════════════════════════════════════════════════════
  if (phase === 'dismissed') return null;

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
              ].map((t) => (
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
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
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

        {/* ─── VIBRATION ─── */}
        {phase === 'vibration' && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="pointer-events-auto w-full max-w-md mx-4 mb-6 bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden"
          >
            <div className="bg-gradient-to-l from-purple-600 to-purple-700 px-6 py-5 text-white">
              <h3 className="text-lg font-black">📳 علّم الاهتزاز</h3>
              <p className="text-purple-100 text-xs font-bold mt-1">
                حط موبايلك على الطبلون واضرب على الكابوت 3 مرات
              </p>
            </div>
            <div className="px-6 py-6 space-y-4 text-center">
              <div className="text-6xl animate-bounce">📱</div>
              <p className="text-sm font-bold text-slate-600">الدرع محتاج يتعلم يحس بالاهتزاز</p>
              <VibrationDots onLearned={handleLearned} />
              <button
                onClick={handleLearned}
                className="text-xs text-slate-400 hover:text-slate-600 font-bold underline"
              >
                تخطي ←
              </button>
            </div>
          </motion.div>
        )}

        {/* ─── ACTIVE ─── */}
        {phase === 'active' && (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="pointer-events-auto w-full max-w-md mx-4 mb-4"
          >
            <div className="bg-gradient-to-l from-green-600 to-emerald-700 rounded-2xl px-4 py-3 text-white shadow-lg mb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🛡️</span>
                  <div>
                    <p className="text-xs font-black">الدرع نشط</p>
                    {shieldCode && (
                      <p className="text-[10px] text-green-200 font-bold">{shieldCode}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-300 rounded-full animate-pulse" />
                  <span className="text-[10px] font-bold text-green-200">مراقبة</span>
                </div>
              </div>
            </div>

            <AnimatePresence>
              {alerts.map((a, i) => (
                <motion.div
                  key={`${a.type}-${i}-${a.body}`}
                  initial={{ x: 100, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -100, opacity: 0 }}
                  className={`rounded-xl px-4 py-2.5 mb-1.5 shadow-md flex items-center gap-2 ${
                    a.type === 'warning'
                      ? 'bg-red-50 border border-red-200 text-red-700'
                      : a.type === 'resolved'
                        ? 'bg-green-50 border border-green-200 text-green-700'
                        : a.type === 'qrScan'
                          ? 'bg-purple-50 border border-purple-200 text-purple-700'
                          : 'bg-blue-50 border border-blue-200 text-blue-700'
                  }`}
                >
                  <span>{a.icon}</span>
                  <span className="flex-1 text-xs font-bold">{a.body}</span>
                </motion.div>
              ))}
            </AnimatePresence>
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

// ─── Vibration Dots (3 ضربات) ───
function VibrationDots({ onLearned }: { onLearned: () => void }) {
  const [hits, setHits] = useState(0);

  useEffect(() => {
    const cleanup = startVibrationDemo(() => {
      setHits(3);
      setTimeout(onLearned, 800);
    });
    return cleanup;
  }, [onLearned]);

  return (
    <div className="flex justify-center gap-3 py-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-lg font-black transition-all duration-300 ${
            i < hits
              ? 'bg-green-500 border-green-500 text-white scale-110'
              : 'bg-slate-100 border-slate-300 text-slate-400'
          }`}
        >
          {i < hits ? '✓' : i + 1}
        </div>
      ))}
    </div>
  );
}