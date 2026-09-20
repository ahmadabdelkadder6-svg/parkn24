import { motion } from 'framer-motion';
import { useStore } from '../store';
import { Gift, ArrowRight, Sparkles, ShieldCheck } from 'lucide-react';

/* ─── 🎨 الألوان الرسمية الفاخرة لتطبيق Park'n 24 ─── */
const BRAND = {
  blue: '#1656b8',       // الأزرق الرسمي
  blueDark: '#0f3d85',   // الكحلي الفخم
  blueLight: '#e8f0fe',  // الأزرق الفاتح
  green: '#8cc63f',      // الأخضر الرسمي
  greenDark: '#6ea62a',  // أخضر داكن للخطوط
  greenLight: '#f2fae6', // خلفية خضراء ناعمة
  navy: '#0a1628',       // الكحلي الليلي الغامق
  slate: '#475569',      // الرمادي الهادئ
  slateMuted: '#94a3b8', // الرمادي الباهت
  border: '#e2e8f0',     // الحدود الرمادية الناعمة
};

export default function SplashScreen() {
  const setScreen = useStore((s) => s.setScreen);

  return (
    <div
      className="flex flex-col items-center justify-between h-full px-6 py-8 text-center safe-top safe-bottom max-w-sm mx-auto overflow-hidden relative"
      style={{ background: '#ffffff', color: BRAND.navy }}
    >
      {/* إضاءة خلفية ناعمة */}
      <div
        className="absolute top-12 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${BRAND.blue}12 0%, transparent 70%)`,
          filter: 'blur(40px)',
        }}
      />

      {/* ══ الجزء الأوسط: الشعار والعناوين ══ */}
      <div className="flex-1 flex flex-col items-center justify-center w-full relative z-10">
        
        {/* حاوية الشعار التفاعلية الفاخرة */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 20, stiffness: 260 }}
          className="mb-5 relative"
        >
          <div
            className="w-32 h-32 rounded-3xl p-3 flex items-center justify-center relative"
            style={{
              background: '#ffffff',
              border: `1.5px solid ${BRAND.border}`,
              boxShadow: `0 12px 32px ${BRAND.blue}15`,
            }}
          >
            <img
              src="/images/logo.png"
              alt="بركن - Park'n 24"
              className="w-full h-full object-contain"
            />
          </div>
        </motion.div>

        {/* اسم التطبيق الموحد بالألوان الرسمية */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <h1
            className="text-4xl font-black mb-0.5 tracking-tight"
            style={{ color: BRAND.navy }}
          >
            بركن <span style={{ color: BRAND.green }}>24</span>
          </h1>
          <p
            className="text-[11px] font-black tracking-widest uppercase mb-3 font-sans"
            style={{ color: BRAND.blue }}
          >
            Park'n 24 Smart Parking
          </p>
        </motion.div>

        {/* النصوص التسويقية والتحفيزية */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="space-y-1 mb-5"
        >
          <p className="text-sm font-black" style={{ color: BRAND.navy }}>
            ركنتك مضمونة قبل ما توصل 🚗
          </p>
          <p
            className="text-xs font-semibold leading-relaxed max-w-[280px] mx-auto"
            style={{ color: BRAND.slate }}
          >
            احجز مكانك في أقرب جراج، ادفع بسهولة وبدون فكة، ووفر وقتك وبنزينك بضغطة زر.
          </p>
        </motion.div>

        {/* 🎁 شارة الهدية الترحيبية (30 دقيقة مجاناً) بتصميم هادئ وراقي */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.35 }}
          className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border"
          style={{
            background: BRAND.greenLight,
            borderColor: `${BRAND.green}40`,
            boxShadow: `0 4px 14px ${BRAND.green}12`,
          }}
        >
          <Gift size={18} style={{ color: BRAND.greenDark }} className="animate-bounce shrink-0" />
          <div className="text-right">
            <span className="text-[11px] font-black block" style={{ color: BRAND.greenDark }}>
              هدية ترحيبية نشطة لزيارتك الأولى! 🎉
            </span>
            <span className="text-[10px] font-bold text-slate-600">
              أول 30 دقيقة ركن مجانية بالكامل 100%
            </span>
          </div>
        </motion.div>
      </div>

      {/* ══ الجزء السفلي: زر الدخول وتأكيدات الأمان ══ */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="w-full relative z-10 space-y-3"
      >
        <button
          onClick={() => setScreen('list')}
          className="w-full py-4 rounded-2xl font-black text-sm text-white flex items-center justify-center gap-2 border-0 cursor-pointer active:scale-[0.98] transition-all"
          style={{
            background: BRAND.blue,
            boxShadow: `0 8px 24px ${BRAND.blue}30`,
          }}
        >
          <span>ابدأ وتصفح الجراجات الآن</span>
          <ArrowRight size={18} className="rotate-180" strokeWidth={3} />
        </button>

        {/* شارات الثقة السريعة */}
        <div className="flex items-center justify-center gap-3 text-[10px] font-bold" style={{ color: BRAND.slateMuted }}>
          <span>⚡ حجز فوري ومؤكد</span>
          <span>•</span>
          <span>🔒 دفع إلكتروني آمن</span>
        </div>
      </motion.div>
    </div>
  );
}