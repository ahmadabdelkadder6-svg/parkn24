import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  Warehouse,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { useStore } from '../store';
import { shallow } from 'zustand/shallow';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const ADMIN_EMAIL = 'ahmadabdelkadder6@gmail.com';

export default function AuthGate({
  children,
}: {
  children: React.ReactNode;
}) {
  // ✅ selector + shallow
  const { view, currentGarageId } = useStore(
    (s) => ({
      view: s.view,
      currentGarageId: s.currentGarageId,
    }),
    shallow
  );

  const isGarageAuthed = !!localStorage.getItem('garageAuth');

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

  // ✅ شيلنا fetchAll من هنا - App.tsx بيعملها
  // مش محتاجين نجيب البيانات مرتين

  if (view === 'user') return <>{children}</>;

  if (view === 'garage') {
    if (isGarageAuthed && currentGarageId) return <>{children}</>;
    return <GarageLogin />;
  }

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

function GarageLogin() {
  // ✅ selector + shallow
  const { garages, setCurrentGarageId, setView, setScreen, fetchAll } =
    useStore(
      (s) => ({
        garages: s.garages,
        setCurrentGarageId: s.setCurrentGarageId,
        setView: s.setView,
        setScreen: s.setScreen,
        fetchAll: s.fetchAll,
      }),
      shallow
    );

  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [showPhone, setShowPhone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (garages.length === 0) fetchAll();
  }, []);

  const handleLogin = async () => {
    if (!username.trim() || !phone.trim()) {
      toast.error('أدخل اسم المستخدم ورقم الهاتف');
      return;
    }
    setLoading(true);
    try {
      let garage = garages.find(
        (g) =>
          g.username.toLowerCase() === username.trim().toLowerCase() &&
          g.phone === phone.trim()
      );

      if (!garage) {
        const { data, error } = await supabase
          .from('garages')
          .select('*')
          .ilike('username', username.trim())
          .eq('phone', phone.trim())
          .single();

        if (error || !data) {
          toast.error('بيانات الدخول غير صحيحة');
          setLoading(false);
          return;
        }

        garage = {
          id: data.id,
          name: data.name,
          username: data.username,
          phone: data.phone,
          location: data.location,
          lat: data.lat,
          lng: data.lng,
          capacity: data.capacity,
          availableSpots: data.available_spots,
          basePrice: Number(data.base_price),
          rating: Number(data.rating),
        };

        await fetchAll();
      }

      localStorage.setItem(
        'garageAuth',
        JSON.stringify({
          garageId: garage.id,
          username: garage.username,
          timestamp: Date.now(),
        })
      );

      setCurrentGarageId(garage.id);
      setScreen('splash');
      toast.success(`مرحباً بك في ${garage.name} 🅿️`);
    } catch (err) {
      toast.error('حدث خطأ في الدخول');
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
          <div className="w-20 h-20 bg-blue-600/20 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-blue-500/30">
            <Warehouse size={40} className="text-blue-400" />
          </div>
          <h1 className="text-2xl font-black text-white mb-2">دخول الجراج</h1>
        </div>
        <div className="space-y-4">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="اسم المستخدم"
            className="w-full bg-slate-900 border border-slate-800 p-4 rounded-2xl text-right font-bold text-white outline-none focus:border-blue-500"
          />
          <div className="relative">
            <input
              type={showPhone ? 'text' : 'password'}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="رقم الهاتف"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="w-full bg-slate-900 border border-slate-800 p-4 rounded-2xl text-right font-bold text-white outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowPhone(!showPhone)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            >
              {showPhone ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <LogIn size={18} />
            )}{' '}
            دخول الجراج
          </button>
          <button
            type="button"
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

function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  // ✅ selector + shallow
  const { setView } = useStore(
    (s) => ({ setView: s.setView }),
    shallow
  );

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
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-red-600 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 shadow-lg shadow-red-900/20"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Lock size={18} />
            )}{' '}
            دخول المشرف
          </button>
          <button
            type="button"
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