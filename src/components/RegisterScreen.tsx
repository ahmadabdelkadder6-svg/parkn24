import { useState } from 'react';
import { motion } from 'framer-motion';
import { Car, Phone, User, ArrowRight, ShieldCheck, Sparkles, Loader2 } from 'lucide-react';
import { useStore, normalizePlate } from '../store';
import toast from 'react-hot-toast';

export default function RegisterScreen() {
  const { setCurrentUser, setScreen } = useStore();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [carPlate, setCarPlate] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!name.trim()) { 
      toast.error('يرجى إدخال اسمك'); 
      return; 
    }
    
    const cleanPhone = phone.replace(/[^\d+]/g, '').trim();
    if (cleanPhone.length < 11) { 
      toast.error('يرجى إدخال رقم هاتف صحيح (11 رقم)'); 
      return; 
    }

    const cleanPlate = normalizePlate(carPlate);
    if (!cleanPlate) { 
      toast.error('يرجى إدخال رقم لوحة صحيح'); 
      return; 
    }

    try {
      setLoading(true);
      await setCurrentUser({
        name: name.trim(),
        phone: cleanPhone,
        carPlate: cleanPlate,
        wallet: 0,
      });
      toast.success('تم تسجيل بياناتك بنجاح! 🚗✨');
      setScreen('list');
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء التسجيل، حاول مجدداً');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full bg-slate-950 text-white flex flex-col justify-between p-6 text-right"
    >
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
        {/* Logo & Intro */}
        <div className="text-center mb-8">
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ repeat: Infinity, duration: 3 }}
            className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/30"
          >
            <Car size={40} className="text-white" />
          </motion.div>
          <h2 className="text-2xl font-black text-white">سجل بياناتك للبدء</h2>
          <p className="text-xs text-slate-400 mt-1.5 font-bold">
            خطوة واحدة تفصلك عن حجز ركنتك وتجربة الانتظار الذكية ⚡
          </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          {/* الاسم */}
          <div>
            <label className="block text-xs font-black text-slate-400 mb-1.5 mr-1">الاسم بالكامل</label>
            <div className="relative">
              <input
                type="text"
                placeholder="أحمد علي"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-3.5 px-4 pr-11 text-sm font-bold text-white text-right outline-none focus:border-blue-500 transition-colors disabled:opacity-60"
              />
              <User className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            </div>
          </div>

          {/* الهاتف */}
          <div>
            <label className="block text-xs font-black text-slate-400 mb-1.5 mr-1">رقم الموبايل</label>
            <div className="relative">
              <input
                type="tel"
                placeholder="01xxxxxxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
                className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-3.5 px-4 pr-11 text-sm font-bold text-white text-left font-mono outline-none focus:border-blue-500 transition-colors disabled:opacity-60"
                dir="ltr"
              />
              <Phone className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            </div>
          </div>

          {/* رقم اللوحة المطور */}
          <div>
            <label className="block text-xs font-black text-slate-400 mb-1.5 mr-1 flex items-center justify-end gap-1">
              <span>رقم لوحة السيارة</span>
              <Sparkles size={11} className="text-amber-500" />
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="مثال: أ ب ج ١٢٣ أو ABC 123"
                value={carPlate}
                onChange={(e) => setCarPlate(e.target.value)}
                disabled={loading}
                className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-3.5 px-4 pr-11 text-sm font-black text-white text-center outline-none focus:border-blue-500 transition-colors tracking-wider disabled:opacity-60"
              />
              <Car className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            </div>
            <p className="text-[10px] text-slate-500 mt-1 font-bold text-right mr-1">
              💡 اكتب اللوحة بأي لغة أو طريقة والنظام سيتعرف عليها بذكاء تلقائياً ✨
            </p>
          </div>

          {/* زر التأكيد */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800/50 disabled:cursor-not-allowed text-white font-black py-4 rounded-2xl text-base shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>جاري تسجيل وتأمين الحساب...</span>
              </>
            ) : (
              <>
                <span>حفظ البيانات والتحرك</span>
                <ArrowRight size={18} className="rotate-180" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* حماية الأمان والخصوصية */}
      <div className="pt-4 border-t border-slate-900 text-center flex items-center justify-center gap-1.5 text-slate-600 text-[10px] font-bold">
        <span>جميع بياناتك آمنة ومشفرة بالكامل تماشياً مع معايير الحماية</span>
        <ShieldCheck size={12} className="text-slate-500" />
      </div>
    </motion.div>
  );
}