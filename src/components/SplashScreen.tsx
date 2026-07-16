import { motion } from 'framer-motion';
import { useStore } from '../store';

export default function SplashScreen() {
  const setScreen = useStore((s) => s.setScreen);

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center bg-white text-slate-900 safe-top safe-bottom">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', bounce: 0.4 }}
        className="mb-6"
      >
        <img
          src="/images/logo.png"
          alt="بركن - parkn24"
          className="w-44 h-44 object-contain rounded-3xl shadow-xl bg-white p-2 border border-slate-200"
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
        className="text-sm font-black text-blue-600 mb-3 tracking-widest"
      >
        PARKN24
      </motion.p>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.9 }}
        transition={{ delay: 0.3 }}
        className="text-base font-bold text-slate-700 mb-2"
      >
        منصة ذكية لحجز أماكن الركن
      </motion.p>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.75 }}
        transition={{ delay: 0.35 }}
        className="text-xs font-bold text-slate-500 mb-10"
      >
        أسرع وأسهل طريقة لإيجاد مكان ركن في مصر
      </motion.p>

      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        onClick={() => setScreen('list')}
        className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-xl shadow-xl active:scale-95 transition-transform hover:bg-blue-700"
      >
        ابدأ الآن
      </motion.button>
    </div>
  );
}