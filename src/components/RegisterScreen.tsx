import { useState } from 'react';
import { motion } from 'framer-motion';
import { Phone, Car, User } from 'lucide-react';
import { useStore } from '../store';
import toast from 'react-hot-toast';

export default function RegisterScreen() {
  const setCurrentUser = useStore((s) => s.setCurrentUser);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [carPlate, setCarPlate] = useState('');

  const handleRegister = () => {
    if (!name || !phone || !carPlate) {
      toast.error('يرجى ملء جميع الحقول');
      return;
    }
    setCurrentUser({ name, phone, carPlate, wallet: 0 });
    toast.success('تم التسجيل بنجاح!');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col justify-center h-full px-5 bg-slate-950 safe-top safe-bottom"
    >
      <div className="text-center mb-6">
        <img src="/images/logo.png" alt="ركنتي" className="w-16 h-16 rounded-2xl object-contain mx-auto mb-3 shadow-lg" />
        <h2 className="text-xl font-black text-white mb-0.5">ركنتي</h2>
        <p className="text-slate-400 text-xs">سجل بياناتك للبدء</p>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <User size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="w-full bg-slate-900 border border-slate-800 p-3.5 pr-10 rounded-xl text-right font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            placeholder="الاسم بالكامل"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="relative">
          <Phone size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="tel"
            className="w-full bg-slate-900 border border-slate-800 p-3.5 pr-10 rounded-xl text-right font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            placeholder="رقم الهاتف"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="relative">
          <Car size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="w-full bg-slate-900 border border-slate-800 p-3.5 pr-10 rounded-xl text-right font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            placeholder="رقم لوحة السيارة"
            value={carPlate}
            onChange={(e) => setCarPlate(e.target.value)}
          />
        </div>
        <button
          onClick={handleRegister}
          className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-black text-base shadow-lg active:scale-95 transition-transform mt-2"
        >
          تسجيل الدخول
        </button>
      </div>
    </motion.div>
  );
}
