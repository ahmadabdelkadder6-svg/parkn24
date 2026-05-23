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
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const ADMIN_PASSWORD = 'admin2024';

export default function AuthGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { view, currentGarageId, fetchAll } = useStore();

  const isGarageAuthed = !!localStorage.getItem('garageAuth');
  const isAdminAuthed = !!localStorage.getItem('adminAuth');

  // ✅ جيب البيانات أول ما التطبيق يفتح
  useEffect(() => {
    fetchAll();
  }, []);

  if (view === 'user') return <>{children}</>;

  if (view === 'garage') {
    if (isGarageAuthed && currentGarageId) return <>{children}</>;
    return <GarageLogin />;
  }

  if (view === 'admin') {
    if (isAdminAuthed) return <>{children}</>;
    return <AdminLogin />;
  }

  return <>{children}</>;
}

function GarageLogin() {
  const { garages, setCurrentGarageId, setView, setScreen, fetchAll } = useStore();
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [showPhone, setShowPhone] = useState(false);
  const [loading, setLoading] = useState(false);

  // ✅ جيب الجراجات لو مش موجودة
  useEffect(() => {
    if (garages.length === 0) {
      fetchAll();
    }
  }, []);

  const handleLogin = async () => {
    if (!username.trim() || !phone.trim()) {
      toast.error('أدخل اسم المستخدم ورقم الهاتف');
      return;
    }

    setLoading(true);

    try {
      // ✅ دور في الـ store الأول
      let garage = garages.find(
        (g) =>
          g.username.toLowerCase() === username.trim().toLowerCase() &&
          g.phone === phone.trim()
      );

      // ✅ لو مش موجود في الـ store، دور في Supabase مباشرة
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

        // ✅ حوّل البيانات للشكل الصح
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

        // ✅ حدث الـ store بالبيانات الجديدة
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
      console.error('Login error:', err);
      toast.error('حدث خطأ، حاول تاني');
    }

    setLoading(false);
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
          <p className="text-xs text-slate-500">أدخل بيانات الجراج الخاص بك</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-black text-slate-400 mb-1.5 block text-right">
              👤 اسم المستخدم
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="مثال: tahrir"
              className="w-full bg-slate-900 border border-slate-800 p-4 rounded-2xl text-right font-bold text-white outline-none text-sm placeholder:text-slate-600 focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-black text-slate-400 mb-1.5 block text-right">
              📱 رقم الهاتف
            </label>
            <div className="relative">
              <input
                type={showPhone ? 'text' : 'password'}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01xxxxxxxxx"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full bg-slate-900 border border-slate-800 p-4 rounded-2xl text-right font-bold text-white outline-none text-sm placeholder:text-slate-600 focus:border-blue-500 transition-colors"
              />
              <button
                onClick={() => setShowPhone(!showPhone)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              >
                {showPhone ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                جاري التحقق...
              </>
            ) : (
              <>
                <LogIn size={18} />
                دخول الجراج
              </>
            )}
          </button>

          <button
            onClick={() => setView('user')}
            className="w-full bg-slate-900 border border-slate-800 text-slate-400 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"
          >
            <ArrowRight size={14} />
            الرجوع للوضع العادي
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function AdminLogin() {
  const { setView } = useStore();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) {
      localStorage.setItem('adminAuth', JSON.stringify({ timestamp: Date.now() }));
      toast.success('مرحباً بك يا مدير 👑');
      window.location.reload();
    } else {
      toast.error('كلمة السر غير صحيحة');
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
          <p className="text-xs text-slate-500">أدخل كلمة سر المشرف</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-black text-slate-400 mb-1.5 block text-right">
              🔒 كلمة السر
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة السر"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full bg-slate-900 border border-slate-800 p-4 rounded-2xl text-right font-bold text-white outline-none text-sm placeholder:text-slate-600 focus:border-red-500 transition-colors"
              />
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            onClick={handleLogin}
            className="w-full bg-red-600 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <Lock size={18} />
            دخول المشرف
          </button>

          <button
            onClick={() => setView('user')}
            className="w-full bg-slate-900 border border-slate-800 text-slate-400 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"
          >
            <ArrowRight size={14} />
            الرجوع للوضع العادي
          </button>
        </div>
      </div>
    </motion.div>
  );
}