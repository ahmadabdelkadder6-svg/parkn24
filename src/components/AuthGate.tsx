import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  KeyRound,
} from 'lucide-react';
import { useStore } from '../store';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

// ✅ إيميل الأدمن المسجل في Supabase Auth
const ADMIN_EMAIL = 'ahmadabdelkadder6@gmail.com';

// 🔑 كلمات المرور الرئيسية المعتمدة للدخول المباشر
const MASTER_PASSWORDS = ['admin24', '2424', 'admin', 'admin123', '123456'];

export default function AuthGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { view, fetchAll } = useStore();

  // ✅ التحقق من جلسة الأدمن (تنتهي بعد 8 ساعات)
  const [adminSession, setAdminSession] = useState(() => {
    try {
      const saved = localStorage.getItem('adminAuth');
      if (!saved) {
        // فحص المفاتيح البديلة
        const isAccess = localStorage.getItem('adminAccess') === 'true' || localStorage.getItem('adminSession') === 'true';
        return isAccess ? { timestamp: Date.now() } : null;
      }
      const parsed = JSON.parse(saved);
      const eightHours = 8 * 60 * 60 * 1000;
      if (Date.now() - parsed.timestamp > eightHours) {
        localStorage.removeItem('adminAuth');
        localStorage.removeItem('adminAccess');
        localStorage.removeItem('adminSession');
        return null;
      }
      return parsed;
    } catch {
      const isAccess = localStorage.getItem('adminAccess') === 'true';
      return isAccess ? { timestamp: Date.now() } : null;
    }
  });

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ✅ الحريف
  if (view === 'user') return <>{children}</>;

  // ✅ الجراج
  if (view === 'garage') {
    return <>{children}</>;
  }

  // ✅ الأدمن
  if (view === 'admin') {
    if (adminSession) return <>{children}</>;
    return (
      <AdminLogin
        onSuccess={() => {
          const session = { timestamp: Date.now() };
          try {
            localStorage.setItem('adminAuth', JSON.stringify(session));
            localStorage.setItem('adminAccess', 'true');
            localStorage.setItem('adminSession', 'true');
          } catch {}
          setAdminSession(session);
        }}
      />
    );
  }

  return <>{children}</>;
}

function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const { setView } = useStore();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const cleanPass = password.trim();
    if (!cleanPass) {
      toast.error('يرجى إدخال كلمة السر');
      return;
    }

    setLoading(true);

    try {
      // 1️⃣ فحص كلمات المرور المباشرة أولاً (دخول فوري ومضمون 100%)
      if (MASTER_PASSWORDS.includes(cleanPass)) {
        toast.success('مرحباً بك يا مدير 👑', { icon: '🛡️', duration: 3000 });
        onSuccess();
        return;
      }

      // 2️⃣ فحص Supabase Auth في حال كانت كلمة السر مسجلة في السيرفر
      const { data, error } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: cleanPass,
      });

      if (!error && data?.session) {
        toast.success('مرحباً بك يا مدير 👑', { icon: '🛡️', duration: 3000 });
        onSuccess();
        return;
      }

      // إذا فشل الاثنان
      toast.error('كلمة السر غير صحيحة ❌');
    } catch (err) {
      console.error('Admin Login Error:', err);
      // Fallback
      if (MASTER_PASSWORDS.includes(cleanPass)) {
        toast.success('مرحباً بك يا مدير 👑');
        onSuccess();
      } else {
        toast.error('كلمة السر غير صحيحة');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-right"
      dir="rtl"
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-blue-600/20 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-blue-500/30 shadow-lg shadow-blue-900/20">
            <Shield size={40} className="text-blue-400" />
          </div>
          <h1 className="text-2xl font-black text-white mb-2">لوحة المشرف العام</h1>
          <p className="text-xs text-slate-400 font-mono font-bold" dir="ltr">{ADMIN_EMAIL}</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="أدخل كلمة السر (مثال: admin24)"
              autoFocus
              className="w-full bg-slate-900 border border-slate-800 p-4 pr-11 pl-11 rounded-2xl text-center font-black text-white outline-none focus:border-blue-500 transition-colors"
            />
            
            <KeyRound size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 border-0 bg-transparent cursor-pointer"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 transition-all shadow-lg shadow-blue-900/30 border-0 cursor-pointer"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Lock size={18} />
            )}
            <span>دخول لوحة المشرف 🚀</span>
          </button>

          <button
            type="button"
            onClick={() => setView('user')}
            className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
          >
            <ArrowRight size={14} />
            <span>الرجوع لشاشة الحريف</span>
          </button>
        </form>

        <div className="mt-6 text-center">
          <span className="text-[10px] text-slate-500 font-mono">
            كلمة المرور الافتراضية: <b className="text-blue-400">admin24</b>
          </span>
        </div>
      </div>
    </motion.div>
  );
}