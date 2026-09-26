// src/components/RegisterScreen.tsx
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Car, Phone, User, ArrowRight, ShieldCheck, Sparkles, Loader2, Gift } from 'lucide-react';
// 🌟 استيراد دوال البصمة الموحدة من الـ store لضمان مطابقة تامة مع قاعدة البيانات
import { useStore, normalizePlate, normalizePhone } from '../store';
import toast from 'react-hot-toast';

/* ─── 🎨 الألوان الرسمية الفاخرة لتطبيق Park'n 24 ─── */
const BRAND = {
  blue: '#1656b8',       // الأزرق الرسمي
  blueDark: '#0f3d85',   // الكحلي الفخم
  blueLight: '#e8f0fe',  // الأزرق الفاتح جداً
  blueSoft: 'rgba(22, 86, 184, 0.08)', // كحلي زجاجي ناعم
  green: '#8cc63f',      // الأخضر الرسمي
  greenDark: '#6ea62a',  // أخضر داكن للخطوط
  greenLight: 'rgba(140, 198, 63, 0.12)', // خلفية خضراء ناعمة
  navy: '#0a1628',       // الكحلي الليلي الغامق للواجهة الداكنة
  navyLight: '#111e36',  // كحلي أفتح للبطاقات والـ overlays
  slate: '#64748b',      // الرمادي الهادئ
  slateMuted: '#94a3b8', // الرمادي الباهت
  border: 'rgba(255, 255, 255, 0.08)', // حدود زجاجية رفيعة
};

export default function RegisterScreen() {
  const { setCurrentUser, setScreen } = useStore();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [carPlate, setCarPlate] = useState('');
  const [loading, setLoading] = useState(false);

  // ✍️ قبول الحروف العربية والمسافات فقط في الاسم
  const handleNameChange = (val: string) => {
    const arabicOnly = val.replace(/[^\u0600-\u06FF\s]/g, '');
    setName(arabicOnly);
  };

  // 📱 فلترة لحظية فائقة الذكاء أثناء الكتابة للهواتف المصرية
  const handlePhoneChange = (val: string) => {
    let digits = val;
    const arabicNums = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    for (let i = 0; i < 10; i++) {
      digits = digits.split(arabicNums[i]).join(String(i));
    }
    const digitsOnly = digits.replace(/[^\d]/g, '').slice(0, 11);
    setPhone(digitsOnly);
  };

  // 🚗 فلترة صارمة للغاية لرقم اللوحة (حروف عربية وأرقام ومسافات فقط)
  const handlePlateChange = (val: string) => {
    const cleaned = val.replace(/[^\u0621-\u064A\u0660-\u06690-9\s]/g, '');
    const singleSpaceOnly = cleaned.replace(/\s+/g, ' ');

    if (val !== cleaned) {
      toast.error('يرجى كتابة الحروف العربية والأرقام فقط 🇪🇬', {
        id: 'plate-lang-warn',
        duration: 2000,
      });
    }

    setCarPlate(singleSpaceOnly);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!name.trim() || name.trim().length < 3) { 
      toast.error('يرجى إدخال اسمك باللغة العربية (3 حروف على الأقل)'); 
      return; 
    }
    
    const cleanPhone = normalizePhone(phone);
    const isValidEgyptianMobile = /^01[0125][0-9]{8}$/.test(cleanPhone);

    if (!isValidEgyptianMobile) { 
      toast.error('رقم الهاتف غير صحيح! يجب أن يتكون من 11 رقماً ويبدأ بـ (010 / 011 / 012 / 015) 🇪🇬', {
        duration: 4500,
        icon: '📱'
      }); 
      return; 
    }

    const plateTrimmed = carPlate.trim();
    if (!plateTrimmed) {
      toast.error('يرجى إدخال رقم اللوحة');
      return;
    }

    const hasArabicLetters = /[\u0621-\u064A]/.test(plateTrimmed);
    const hasNumbers = /[\u0660-\u06690-9]/.test(plateTrimmed);

    if (!hasArabicLetters || !hasNumbers) {
      toast.error('رقم اللوحة غير مكتمل! يجب إدخال حروف عربية وأرقام معاً (مثال: أ ب ج ١٢٣)');
      return;
    }

    const cleanPlate = normalizePlate(carPlate);
    if (!cleanPlate) { 
      toast.error('يرجى إدخال رقم اللوحة بالحروف والأرقام العربية المعتمدة'); 
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
      toast.success('تم تسجيل وتأمين بياناتك بنجاح! 🚗✨');
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
      className="h-full text-white flex flex-col justify-between p-6 text-right overflow-y-auto"
      style={{ background: BRAND.navy }}
    >
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full py-4">
        {/* Logo & Intro */}
        <div className="text-center mb-6">
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ repeat: Infinity, duration: 3 }}
            className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg"
            style={{
              background: BRAND.blue,
              boxShadow: `0 8px 30px ${BRAND.blue}40`
            }}
          >
            <Car size={40} className="text-white" />
          </motion.div>
          <h2 className="text-2xl font-black text-white">سجل بياناتك للبدء</h2>
          
          {/* 🎁 بانر ترويجي للـ 30 دقيقة المجانية */}
          <div 
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-2xl shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #FEF08A 0%, #FDE047 50%, #EAB308 100%)',
              border: '2px solid #CA8A04',
              boxShadow: '0 8px 24px rgba(234,179,8,0.15)'
            }}
          >
            <Gift size={16} className="text-black animate-bounce shrink-0" />
            <span 
              style={{
                color: '#000000',
                fontWeight: 955,
                fontSize: '12px',
                letterSpacing: '0.2px',
              }}
            >
              أول 30 دقيقة ركنة مجاناً بالكامل كهدية ترحيبية! 🎁
            </span>
          </div>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          {/* الاسم بالعربي */}
          <div>
            <label className="block text-xs font-black text-slate-400 mb-1.5 mr-1">الاسم بالكامل (عربي فقط)</label>
            <div className="relative">
              <input
                type="text"
                placeholder="أحمد علي"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                disabled={loading}
                className="w-full border rounded-2xl py-3.5 px-4 pr-11 text-sm font-bold text-white text-right outline-none focus:border-blue-500 transition-colors disabled:opacity-60"
                style={{ background: BRAND.navyLight, borderColor: BRAND.border }}
              />
              <User className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            </div>
          </div>

          {/* الهاتف */}
          <div>
            <div className="flex justify-between items-center mb-1.5 mr-1">
              <span className="text-[10px] font-mono font-black text-blue-400" dir="ltr">
                {phone.length}/11
              </span>
              <label className="text-xs font-black text-slate-400">رقم الموبايل (أرقام فقط)</label>
            </div>
            <div className="relative">
              <input
                type="tel"
                placeholder="01xxxxxxxxx"
                value={phone}
                maxLength={11}
                onChange={(e) => handlePhoneChange(e.target.value)}
                disabled={loading}
                className="w-full border rounded-2xl py-3.5 px-4 pr-11 text-sm font-bold text-white text-left font-mono outline-none focus:border-blue-500 transition-colors disabled:opacity-60"
                style={{ background: BRAND.navyLight, borderColor: BRAND.border }}
                dir="ltr"
              />
              <Phone className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            </div>
          </div>

          {/* رقم اللوحة بالعربي */}
          <div>
            <label className="block text-xs font-black text-slate-400 mb-1.5 mr-1 flex items-center justify-end gap-1">
              <span>رقم لوحة السيارة (حروف وأرقام عربية)</span>
              <Sparkles size={11} className="text-amber-500" />
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="مثال: أ ب ج ١٢٣ أو أ ب ج 123"
                value={carPlate}
                onChange={(e) => handlePlateChange(e.target.value)}
                disabled={loading}
                className="w-full border rounded-2xl py-3.5 px-4 pr-11 text-sm font-black text-white text-center outline-none focus:border-blue-500 transition-colors tracking-wider disabled:opacity-60"
                style={{ background: BRAND.navyLight, borderColor: BRAND.border }}
              />
              <Car className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            </div>
            <p className="text-[10px] text-slate-500 mt-1 font-bold text-right mr-1">
              💡 اكتب الحروف والأرقام كما هي باللغة العربية على اللوحة
            </p>
          </div>

          {/* زر التأكيد */}
          <button
            type="submit"
            disabled={loading}
            className="w-full hover:bg-blue-700 disabled:bg-blue-800/50 disabled:cursor-not-allowed py-4 rounded-2xl text-base shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 cursor-pointer border-none mt-2 text-white font-black"
            style={{
              background: BRAND.blue,
              boxShadow: `0 8px 30px ${BRAND.blue}30`
            }}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin text-white" />
                <span 
                  style={{ 
                    color: '#ffffff', 
                    fontWeight: 950, 
                    fontSize: '15.5px',
                    textShadow: '0 1px 3px rgba(0,0,0,0.35)' 
                  }}
                >
                  جاري تأمين الحساب والتحقق...
                </span>
              </>
            ) : (
              <>
                <span 
                  style={{ 
                    color: '#ffffff', 
                    fontWeight: 950, 
                    fontSize: '16px',
                    letterSpacing: '0.3px',
                    textShadow: '0 1px 3px rgba(0,0,0,0.35)' 
                  }}
                >
                  حفظ البيانات واستلام الهدية 🚀
                </span>
                <ArrowRight size={18} className="rotate-180 text-white" strokeWidth={3} />
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