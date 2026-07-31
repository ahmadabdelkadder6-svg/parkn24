import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { useStore } from '../store';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

// ✅ إيميل الأدمن المسجل في Supabase Auth
const ADMIN_EMAIL = 'ahmadabdelkadder6@gmail.com';

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
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      const eightHours = 8 * 60 * 60 * 1000;
      if (Date.now() - parsed.timestamp > eightHours) {
        localStorage.removeItem('adminAuth');
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    fetchAll();
  }, []);

  // ✅ الحريف
  if (view === 'user') return <>{children}</>;

  // ✅ الجراج
  // مهم جدًا: ما تعرضش أي GarageLogin داخلي هنا
  // خلي App.tsx هو اللي يختار بين GarageLoginScreen و GarageDashboard
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
          localStorage.setItem('adminAuth', JSON.stringify(session));
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

  const handleLogin = async () => {
    if (!password.trim()) {
      toast.error('أدخل كلمة السر');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: password.trim(),
      });

      if (error || !data.session) {
        toast.error('كلمة السر غير صحيحة');
        return;
      }

      await supabase.auth.signOut();

      toast.success('مرحباً بك يا مدير 👑');
      onSuccess();
    } catch (err) {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-6"
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-red-600/20 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-red-500/30">
            <Shield size={40} className="text-red-400" />
          </div>
          <h1 className="text-2xl font-black text-white mb-2">لوحة المشرف</h1>
          <p className="text-xs text-slate-500 font-bold">{ADMIN_EMAIL}</p>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="أدخل كلمة السر"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="w-full bg-slate-900 border border-slate-800 p-4 rounded-2xl text-right font-bold text-white outline-none focus:border-red-500"
            />
            <button
              onClick={() => setShowPassword(!showPassword)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-red-600 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 shadow-lg shadow-red-900/20"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Lock size={18} />
            )}
            دخول المشرف
          </button>

          <button
            onClick={() => setView('user')}
            className="w-full bg-slate-900 border border-slate-800 text-slate-400 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1 active:scale-95"
          >
            <ArrowRight size={14} /> الرجوع للوضع العادي
          </button>
        </div>
      </div>
    </motion.div>
  );
}