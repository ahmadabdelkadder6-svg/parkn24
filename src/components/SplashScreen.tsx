import { motion } from 'framer-motion';
import { useStore } from '../store';
import { Gift, ArrowRight } from 'lucide-react';

export default function SplashScreen() {
  const setScreen = useStore((s) => s.setScreen);

  return (
    <div className="flex flex-col items-center justify-between h-full px-6 py-10 text-center bg-white text-slate-900 safe-top safe-bottom max-w-sm mx-auto">
      
      {/* الجزء العلوي: الشعار والعناوين */}
      <div className="flex-1 flex flex-col items-center justify-center w-full">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', bounce: 0.4 }}
          className="mb-6 relative"
        >
          <img
            src="/images/logo.png"
            alt="بركن - parkn24"
            className="w-40 h-40 object-contain rounded-3xl shadow-xl bg-white p-2 border border-slate-200"
          />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-5xl font-black mb-1 tracking-tight text-slate-900"
        >
          بركن<span className="text-amber-500">24</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="text-xs font-black text-blue-600 mb-3 tracking-widest"
        >
          PARKN24
        </motion.p>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.9 }}
          transition={{ delay: 0.3 }}
          className="text-base font-bold text-slate-700 mb-1"
        >
          منصة ذكية لحجز وإدارة أماكن الركن
        </motion.p>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.75 }}
          transition={{ delay: 0.35 }}
          className="text-xs font-bold text-slate-500 mb-6"
        >
          أسرع وأسهل طريقة لركن سيارتك بأمان
        </motion.p>

        {/* 🎁 شارة الهدية الترحيبية للـ 30 دقيقة */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-black shadow-sm"
        >
          <Gift size={15} className="text-amber-600 animate-bounce" />
          <span>هدية ترحيبية: أول 30 دقيقة مجاناً لأول ركنة! 🎉</span>
        </motion.div>
      </div>

      {/* الجزء السفلي: زر البداية */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="w-full"
      >
        <button
          onClick={() => setScreen('list')}
          className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-blue-600/20 active:scale-95 transition-all hover:bg-blue-700 flex items-center justify-center gap-2 border-none cursor-pointer"
        >
          <span>ابدأ الآن</span>
          <ArrowRight size={20} className="rotate-180" strokeWidth={3} />
        </button>
      </motion.div>
    </div>
  );
}