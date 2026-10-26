// ═══════════════════════════════════════════════════════════
// 🛡️ ShieldLandingPage — صفحة هبوط الدرع
// تفتح لما العميل يمسح QR Code من عند السايس
// ═══════════════════════════════════════════════════════════
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const FEATURES = [
  {
    icon: '🔒',
    title: 'مراقبة ذكية 24/7',
    desc: 'نظام حماية بالذكاء الاصطناعي يراقب سيارتك كل ثانية',
    color: '#3b82f6',
    glow: 'rgba(59, 130, 246, 0.3)',
  },
  {
    icon: '🚨',
    title: 'إنذار سرقة فوري',
    desc: 'إشعار فوري على موبايلك لو أي حد لمس العربية أو حرّكها',
    color: '#ef4444',
    glow: 'rgba(239, 68, 68, 0.3)',
  },
  {
    icon: '📍',
    title: 'تتبع الموقع الجغرافي',
    desc: 'لو العربية اتحركت من مكانها هتعرف فوراً وين راحت',
    color: '#8cc63f',
    glow: 'rgba(140, 198, 63, 0.3)',
  },
];

const STATS = [
  { value: '24/7', label: 'حماية مستمرة' },
  { value: '< 3ث', label: 'زمن الإنذار' },
  { value: '250م', label: 'نطاق المراقبة' },
];

export default function ShieldLandingPage() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // ─── التقاط Install Prompt من الـ PWA ───
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setShowSuccess(true);
    });
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // ─── هل التطبيق متثبّت بالفعل؟ ───
  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
    }
  }, []);

  const handleInstall = async () => {
    if (installed) {
      // التطبيق متثبّت — وجّهه للصفحة الرئيسية
      window.location.href = '/';
      return;
    }

    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstalled(true);
        setShowSuccess(true);
      }
      setInstallPrompt(null);
    } else {
      // Fallback: وجّهه للصفحة الرئيسية (هيتثبّت من هناك)
      window.location.href = '/';
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start overflow-x-hidden"
      dir="rtl"
      style={{
        background: `
          radial-gradient(ellipse at 50% 0%, rgba(22, 86, 184, 0.15) 0%, transparent 60%),
          radial-gradient(ellipse at 80% 80%, rgba(140, 198, 63, 0.08) 0%, transparent 50%),
          linear-gradient(180deg, #060d1a 0%, #0a1628 40%, #0f1d35 100%)
        `,
      }}
    >
      {/* ═══════════ Particles الخلفية ═══════════ */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: Math.random() * 4 + 1,
              height: Math.random() * 4 + 1,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              background: i % 3 === 0 ? '#3b82f6' : i % 3 === 1 ? '#8cc63f' : '#ffffff',
              opacity: Math.random() * 0.3 + 0.05,
              animation: `float ${Math.random() * 8 + 6}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 4}s`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) translateX(0); }
          25% { transform: translateY(-20px) translateX(10px); }
          50% { transform: translateY(-10px) translateX(-5px); }
          75% { transform: translateY(-25px) translateX(8px); }
        }
        @keyframes shieldPulse {
          0%, 100% { box-shadow: 0 0 30px rgba(59,130,246,0.3), 0 0 60px rgba(59,130,246,0.1); }
          50% { box-shadow: 0 0 50px rgba(59,130,246,0.5), 0 0 100px rgba(59,130,246,0.2), 0 0 150px rgba(140,198,63,0.1); }
        }
        @keyframes scanLine {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes glowText {
          0%, 100% { text-shadow: 0 0 10px rgba(59,130,246,0.5); }
          50% { text-shadow: 0 0 20px rgba(59,130,246,0.8), 0 0 40px rgba(140,198,63,0.3); }
        }
      `}</style>

      {/* ═══════════ Header ═══════════ */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full px-6 pt-8 pb-4 flex items-center justify-center gap-2"
      >
        <span className="text-white/40 text-xs font-bold tracking-wider">PARK'N 24</span>
        <span className="w-1 h-1 rounded-full bg-blue-500/50" />
        <span className="text-white/40 text-xs font-bold tracking-wider">SECURITY</span>
      </motion.div>

      {/* ═══════════ الدرع الرئيسي ═══════════ */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 12, stiffness: 100, delay: 0.2 }}
        className="relative mt-6 mb-8"
      >
        {/* الحلقة الخارجية */}
        <div
          className="w-40 h-40 rounded-full flex items-center justify-center relative"
          style={{
            background: 'linear-gradient(135deg, rgba(22,86,184,0.15) 0%, rgba(140,198,63,0.08) 100%)',
            border: '2px solid rgba(59,130,246,0.2)',
            animation: 'shieldPulse 3s ease-in-out infinite',
          }}
        >
          {/* Scan Line */}
          <div
            className="absolute left-2 right-2 h-[2px] rounded-full"
            style={{
              background: 'linear-gradient(90deg, transparent, #3b82f6, transparent)',
              animation: 'scanLine 3s linear infinite',
            }}
          />

          {/* الحلقة الداخلية */}
          <div
            className="w-28 h-28 rounded-full flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #0f2847 0%, #0a1628 100%)',
              border: '2px solid rgba(59,130,246,0.3)',
              boxShadow: 'inset 0 0 30px rgba(59,130,246,0.1)',
            }}
          >
            <motion.span
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              className="text-6xl"
              style={{ filter: 'drop-shadow(0 0 15px rgba(59,130,246,0.5))' }}
            >
              🛡️
            </motion.span>
          </div>
        </div>

        {/* نقاط المدار */}
        {[0, 120, 240].map((deg, i) => (
          <motion.div
            key={deg}
            className="absolute w-3 h-3 rounded-full"
            style={{
              background: i === 0 ? '#3b82f6' : i === 1 ? '#8cc63f' : '#f59e0b',
              top: '50%',
              left: '50%',
              boxShadow: `0 0 10px ${i === 0 ? '#3b82f6' : i === 1 ? '#8cc63f' : '#f59e0b'}`,
            }}
            animate={{
              x: [
                Math.cos((deg * Math.PI) / 180) * 80,
                Math.cos(((deg + 360) * Math.PI) / 180) * 80,
              ],
              y: [
                Math.sin((deg * Math.PI) / 180) * 80,
                Math.sin(((deg + 360) * Math.PI) / 180) * 80,
              ],
            }}
            transition={{ repeat: Infinity, duration: 8, ease: 'linear' }}
          />
        ))}
      </motion.div>

      {/* ═══════════ العنوان ═══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="text-center px-6 mb-8"
      >
        <h1
          className="text-3xl font-black text-white mb-2"
          style={{ animation: 'glowText 3s ease-in-out infinite' }}
        >
          درع حماية السيارة
        </h1>
        <p className="text-blue-300/70 text-sm font-bold leading-relaxed">
          نظام حماية ذكي يراقب سيارتك على مدار الساعة
          <br />
          <span className="text-white/40 text-xs">ويُنبّهك فوراً لو أي حاجة مش طبيعية</span>
        </p>
      </motion.div>

      {/* ═══════════ الإحصائيات ═══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="flex gap-4 px-6 mb-8"
      >
        {STATS.map((s, i) => (
          <div
            key={i}
            className="flex-1 text-center p-3 rounded-2xl"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <div className="text-lg font-black text-white font-mono">{s.value}</div>
            <div className="text-[9px] font-bold text-white/40 mt-0.5">{s.label}</div>
          </div>
        ))}
      </motion.div>

      {/* ═══════════ المميزات ═══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="w-full px-6 space-y-3 mb-8"
      >
        {FEATURES.map((f, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.7 + i * 0.1 }}
            className="flex items-center gap-4 p-4 rounded-2xl"
            style={{
              background: `linear-gradient(135deg, ${f.glow.replace('0.3', '0.06')} 0%, rgba(255,255,255,0.02) 100%)`,
              border: `1px solid ${f.glow.replace('0.3', '0.15')}`,
            }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
              style={{
                background: `linear-gradient(135deg, ${f.glow.replace('0.3', '0.15')} 0%, transparent 100%)`,
                border: `1px solid ${f.glow.replace('0.3', '0.2')}`,
              }}
            >
              {f.icon}
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-black text-white mb-0.5">{f.title}</h3>
              <p className="text-[11px] font-bold text-white/40 leading-relaxed">{f.desc}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* ═══════════ السعر ═══════════ */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.9 }}
        className="mx-6 mb-6 p-4 rounded-2xl text-center w-[calc(100%-48px)]"
        style={{
          background: 'linear-gradient(135deg, rgba(140,198,63,0.08) 0%, rgba(59,130,246,0.05) 100%)',
          border: '1px solid rgba(140,198,63,0.2)',
        }}
      >
        <div className="flex items-center justify-center gap-3">
          <div>
            <span className="text-[10px] font-bold text-white/40">أول مرة</span>
            <div className="text-xl font-black text-green-400">مجاناً 🎁</div>
          </div>
          <div className="w-px h-10 bg-white/10" />
          <div>
            <span className="text-[10px] font-bold text-white/40">بعد كده</span>
            <div className="text-xl font-black text-blue-400">7 ج.م <span className="text-xs text-white/30">/جلسة</span></div>
          </div>
        </div>
      </motion.div>

      {/* ═══════════ زرار التحميل ═══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0 }}
        className="w-full px-6 mb-4"
      >
        <AnimatePresence mode="wait">
          {showSuccess ? (
            <motion.div
              key="success"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full py-5 rounded-2xl text-center"
              style={{
                background: 'linear-gradient(135deg, #166534 0%, #15803d 100%)',
                boxShadow: '0 8px 30px rgba(22,101,52,0.4)',
              }}
            >
              <div className="text-3xl mb-2">✅</div>
              <p className="text-white font-black text-base">تم تثبيت التطبيق بنجاح!</p>
              <p className="text-green-200/60 text-xs font-bold mt-1">
                افتح التطبيق وسجّل بياناتك لتفعيل الدرع
              </p>
              <button
                onClick={() => (window.location.href = '/')}
                className="mt-4 px-8 py-2.5 rounded-xl bg-white/20 text-white font-black text-sm border border-white/20 active:scale-95 transition-all"
              >
                افتح التطبيق ←
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="install"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleInstall}
              className="w-full py-5 rounded-2xl text-white font-black text-base active:scale-[0.98] transition-all relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #1656b8 0%, #0f3d85 50%, #1656b8 100%)',
                boxShadow: '0 8px 30px rgba(22,86,184,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}
            >
              {/* Shimmer Effect */}
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                  animation: 'shimmer 2s infinite',
                }}
              />
              <style>{`
                @keyframes shimmer {
                  0% { transform: translateX(-100%); }
                  100% { transform: translateX(100%); }
                }
              `}</style>
              <span className="relative z-10 flex items-center justify-center gap-2">
                🛡️ {installed ? 'افتح التطبيق وفعّل الدرع' : 'حمّل التطبيق وفعّل الدرع مجاناً'}
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ═══════════ ملاحظات ═══════════ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="px-6 pb-10 space-y-2 text-center"
      >
        <p className="text-[10px] font-bold text-white/25 flex items-center justify-center gap-1.5">
          ✅ يعمل على iPhone و Android بدون تحميل من المتجر
        </p>
        <p className="text-[10px] font-bold text-white/25 flex items-center justify-center gap-1.5">
          🔒 بياناتك محمية ومش بتتشارك مع أي حد
        </p>
        <p className="text-[10px] font-bold text-white/15 mt-4">
          Park'n 24 © {new Date().getFullYear()}
        </p>
      </motion.div>
    </div>
  );
}