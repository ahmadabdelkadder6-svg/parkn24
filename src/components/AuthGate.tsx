import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  Warehouse,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  ArrowRight,
} from 'lucide-react';
import { useStore } from '../store';
import toast from 'react-hot-toast';

const ADMIN_PASSWORD = 'admin2024';

export default function AuthGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { view, currentGarageId } = useStore();

  const isGarageAuthed = !!localStorage.getItem('garageAuth');
  const isAdminAuthed = !!localStorage.getItem('adminAuth');

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
  const { garages, setCurrentGarageId, setView, setScreen } = useStore();
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [showPhone, setShowPhone] = useState(false);

  const handleLogin = () => {
    if (!username.trim() || !phone.trim()) {
      toast.error('أدخل اسم المستخدم ورقم الهاتف');
      return;
    }
    const garage = garages.find(
      (g) =>
        g.username.toLowerCase() === username.trim().toLowerCase() &&
        g.phone === phone.trim()
    );
    if (!garage) {
      toast.error('بيانات الدخول غير صحيحة');
      return;
    }
    localStorage.setItem('garageAuth', JSON.stringify({
      garageId: garage.id,
      username: garage.username,
      timestamp: Date.now(),
    }));
    setCurrentGarageId(garage.id);
    setScreen('splash');
    toast.success(`مرحباً بك في ${garage.name} 🅿️`);
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
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <LogIn size={18} />
            دخول الجراج
          </button>

          <button
            onClick={() => setView('user')}
            className="w-full bg-slate-900 border border-slate-800 text-slate-400 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"
          >
            <ArrowRight size={14} />
            الرجوع للوضع العادي
          </button>
        </div>

        <div className="mt-6 bg-slate-900/50 border border-slate-800 rounded-xl p-3">
          <p className="text-[10px] text-slate-500 text-center font-bold mb-2">
            📋 بيانات الدخول التجريبية
          </p>
          <div className="space-y-1.5">
            {[
              { name: 'جراج التحرير', user: 'tahrir', phone: '01001234567' },
              { name: 'جراج المعادي', user: 'maadi', phone: '01009876543' },
              { name: 'جراج مدينة نصر', user: 'nasr', phone: '01112223344' },
              { name: 'جراج الزمالك', user: 'zamalek', phone: '01223344556' },
            ].map((g) => (
              <button
                key={g.user}
                onClick={() => { setUsername(g.user); setPhone(g.phone); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 flex items-center justify-between text-[9px] active:scale-95 transition-all"
              >
                <span className="text-slate-600 font-mono">{g.user} / {g.phone}</span>
                <span className="text-slate-400 font-black">{g.name}</span>
              </button>
            ))}
          </div>
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