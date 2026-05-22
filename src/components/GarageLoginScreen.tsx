import { useState } from 'react';
import { Phone, User } from 'lucide-react';
import { useStore } from '../store';
import toast from 'react-hot-toast';

export default function GarageLoginScreen() {
  const { garages, setCurrentGarageId, setView } = useStore();
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');

  const handleLogin = () => {
    const found = garages.find((g) => g.username === username && g.phone === phone);
    if (found) {
      setCurrentGarageId(found.id);
      setView('garage');
      toast.success('تم تسجيل الدخول بنجاح');
    } else {
      toast.error('بيانات غير صحيحة');
    }
  };

  return (
    <div className="p-8 h-full flex flex-col justify-center bg-blue-600 text-white">
      <img src="/images/logo.png" alt="ركنتي" className="w-24 h-24 rounded-2xl object-contain mb-6 mx-auto shadow-2xl" />
      <h2 className="text-2xl font-black mb-1 text-center">ركنتي</h2>
      <p className="text-blue-100 text-sm text-center mb-6 opacity-80">دخول أصحاب الجراجات</p>

      <div className="bg-white/10 backdrop-blur-xl p-8 rounded-[2rem] space-y-5 shadow-2xl border border-white/20">
        <div className="relative">
          <User size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50" />
          <input
            className="w-full p-4 pr-12 bg-white/10 border border-white/20 rounded-2xl text-right font-black outline-none focus:ring-2 focus:ring-white/50 text-white placeholder:text-white/40 text-sm"
            placeholder="اسم المستخدم"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="relative">
          <Phone size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50" />
          <input
            type="tel"
            className="w-full p-4 pr-12 bg-white/10 border border-white/20 rounded-2xl text-right font-black outline-none focus:ring-2 focus:ring-white/50 text-white placeholder:text-white/40 text-sm"
            placeholder="رقم الهاتف"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <button
          onClick={handleLogin}
          className="w-full bg-white text-blue-600 py-4 rounded-2xl font-black text-lg shadow-xl active:scale-95 transition-all mt-4"
        >
          تسجيل الدخول
        </button>
    </div>
  );
}
