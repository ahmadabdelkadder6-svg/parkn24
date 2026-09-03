import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Phone, Car, User, CheckCircle2, AlertCircle, ShieldCheck, Loader2 } from 'lucide-react';
import { useStore, validatePlate } from '../store';
import toast from 'react-hot-toast';

// ─── دوال تحويل الأرقام العربية إلى إنجليزية تلقائياً ───
const normalizeArabicDigits = (val: string): string => {
  if (!val) return '';
  return val
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶٧٨٩'.indexOf(d)));
};

export default function RegisterScreen() {
  const setCurrentUser = useStore((s) => s.setCurrentUser);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [carPlate, setCarPlate] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState({ name: false, phone: false, carPlate: false });

  // ─── 1. التحقق من صحة الاسم (حروف عربية فقط + ثنائي) ───
  const nameValidation = useMemo(() => {
    const clean = name.trim();
    if (!clean) return { valid: false, message: 'الاسم بالكامل مطلوب' };
    if (/[a-zA-Z]/.test(clean)) {
      return { valid: false, message: 'يرجى كتابة الاسم بالحروف العربية فقط' };
    }
    if (/\d/.test(clean)) {
      return { valid: false, message: 'الاسم يجب ألا يحتوي على أرقام' };
    }
    if (/[!@#$%^&*(),.?":{}|<>_\-=+/\\]/.test(clean)) {
      return { valid: false, message: 'الاسم يحتوي على رموز غير مسموحة' };
    }
    if (!/^[\u0600-\u06FF\s]+$/.test(clean)) {
      return { valid: false, message: 'اكتب الاسم باللغة العربية فقط' };
    }
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length < 2) {
      return { valid: false, message: 'أدخل اسمك الثنائي على الأقل (مثال: أحمد علي)' };
    }
    if (clean.length < 5) return { valid: false, message: 'الاسم قصير جداً' };
    return { valid: true, message: '' };
  }, [name]);

  // ─── 2. التحقق من رقم الهاتف (11 رقم مصري يبدأ بـ 010, 011, 012, 015) ───
  const phoneValidation = useMemo(() => {
    const clean = normalizeArabicDigits(phone).replace(/\s+/g, '');
    if (!clean) return { valid: false, message: 'رقم الهاتف مطلوب' };
    if (!/^(010|011|012|015)/.test(clean)) {
      return { valid: false, message: 'يجب أن يبدأ بـ 010 أو 011 أو 012 أو 015' };
    }
    if (clean.length !== 11) {
      return { valid: false, message: `يجب أن يكون 11 رقماً بالضبط (${clean.length}/11)` };
    }
    return { valid: true, message: '' };
  }, [phone]);

  // ─── 3. [إصلاح #2]: التحقق الصارم الموحد مع محرك الـ Store ───
  const plateValidation = useMemo(() => {
    const clean = carPlate.trim();
    if (!clean) return { valid: false, message: 'رقم اللوحة مطلوب' };
    
    // استخدام دالة التحقق المركزية لضمان تطابق السيستم كاملاً
    const res = validatePlate(clean);
    return {
      valid: res.isValid,
      message: res.errorMessage || '',
    };
  }, [carPlate]);

  // هل جميع الحقول صحيحة وجاهزة؟
  const isFormValid = nameValidation.valid && phoneValidation.valid && plateValidation.valid;

  // إدخال أرقام فقط في حقل الهاتف بحد أقصى 11 رقماً
  const handlePhoneChange = (val: string) => {
    const clean = normalizeArabicDigits(val).replace(/[^\d]/g, '').slice(0, 11);
    setPhone(clean);
  };

  // معالجة إدخال اللوحة وتحويل الأرقام العربية تلقائياً
  const handlePlateChange = (val: string) => {
    const normalizedDigits = normalizeArabicDigits(val);
    setCarPlate(normalizedDigits);
  };

  // ─── معالجة التسجيل الآمن مع منع التكرار ───
  const handleRegister = async () => {
    setTouched({ name: true, phone: true, carPlate: true });

    if (!isFormValid || loading) {
      if (!nameValidation.valid) toast.error(nameValidation.message);
      else if (!phoneValidation.valid) toast.error(phoneValidation.message);
      else if (!plateValidation.valid) toast.error(plateValidation.message);
      return;
    }

    try {
      setLoading(true);
      const cleanPhone = normalizeArabicDigits(phone).replace(/\s+/g, '');
      const cleanName = name.trim().replace(/\s+/g, ' ');
      
      // الحصول على البصمة الصافية للوحة
      const plateResult = validatePlate(carPlate);
      const finalPlate = plateResult.isValid ? plateResult.normalizedPlate : carPlate.trim();

      // فحص وسحب بيانات المستخدم أو إنشائه في قاعدة البيانات مع فحص مكافحة الاحتيال
      await setCurrentUser({
        name: cleanName,
        phone: cleanPhone,
        carPlate: finalPlate,
        wallet: 0,
      });

      toast.success(`أهلاً بك يا ${cleanName.split(' ')[0]} في بركن! 🚗`);
    } catch (error) {
      console.error('Registration error:', error);
      toast.error('حدث خطأ أثناء التسجيل، يرجى المحاولة ثانية');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col justify-center h-full px-5 bg-slate-950 safe-top safe-bottom text-right"
    >
      <div className="text-center mb-6">
        <img
          src="/images/logo.png"
          alt="بركن"
          className="w-16 h-16 rounded-2xl object-contain mx-auto mb-3 shadow-lg border border-slate-800"
        />
        <div className="flex items-center justify-center gap-1 mb-1">
          <ShieldCheck size={16} className="text-blue-500" />
          <h2 className="text-xl font-black text-white">Parkn24</h2>
        </div>
        <p className="text-slate-400 text-xs font-bold">سجل بياناتك بالعربية لحجز مكانك فوراً</p>
      </div>

      <div className="space-y-3.5">
        {/* 1. الاسم بالكامل */}
        <div>
          <div className="relative">
            <User
              size={16}
              className={`absolute right-3.5 top-1/2 -translate-y-1/2 ${
                nameValidation.valid ? 'text-emerald-500' : 'text-slate-500'
              }`}
            />
            <input
              disabled={loading}
              className={`w-full bg-slate-900 border p-3.5 pr-10 pl-10 rounded-xl text-right font-bold text-white outline-none text-sm transition-all ${
                touched.name && !nameValidation.valid
                  ? 'border-red-500/80 focus:ring-2 focus:ring-red-500/30'
                  : nameValidation.valid
                  ? 'border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/30'
                  : 'border-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
              }`}
              placeholder="الاسم بالكامل بالعربي (مثال: أحمد علي)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched((p) => ({ ...p, name: true }))}
            />
            {nameValidation.valid && (
              <CheckCircle2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400" />
            )}
          </div>
          {touched.name && !nameValidation.valid && (
            <p className="text-[10px] font-bold text-red-400 mt-1 flex items-center justify-end gap-1">
              <span>{nameValidation.message}</span>
              <AlertCircle size={11} />
            </p>
          )}
        </div>

        {/* 2. رقم الهاتف */}
        <div>
          <div className="relative">
            <Phone
              size={16}
              className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${
                phoneValidation.valid ? 'text-emerald-500' : 'text-slate-500'
              }`}
            />
            <input
              disabled={loading}
              type="tel"
              dir="ltr"
              className={`w-full bg-slate-900 border p-3.5 pl-10 pr-10 rounded-xl text-left font-mono font-bold text-white outline-none text-sm transition-all ${
                touched.phone && !phoneValidation.valid
                  ? 'border-red-500/80 focus:ring-2 focus:ring-red-500/30'
                  : phoneValidation.valid
                  ? 'border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/30'
                  : 'border-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
              }`}
              placeholder="010XXXXXXXX"
              value={phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              onBlur={() => setTouched((p) => ({ ...p, phone: true }))}
            />
            {phoneValidation.valid && (
              <CheckCircle2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-400" />
            )}
          </div>
          {touched.phone && !phoneValidation.valid && (
            <p className="text-[10px] font-bold text-red-400 mt-1 flex items-center justify-end gap-1">
              <span>{phoneValidation.message}</span>
              <AlertCircle size={11} />
            </p>
          )}
        </div>

        {/* 3. رقم لوحة السيارة */}
        <div>
          <div className="relative">
            <Car
              size={16}
              className={`absolute right-3.5 top-1/2 -translate-y-1/2 ${
                plateValidation.valid ? 'text-emerald-500' : 'text-slate-500'
              }`}
            />
            <input
              disabled={loading}
              className={`w-full bg-slate-900 border p-3.5 pr-10 pl-10 rounded-xl text-right font-bold text-white outline-none text-sm transition-all ${
                touched.carPlate && !plateValidation.valid
                  ? 'border-red-500/80 focus:ring-2 focus:ring-red-500/30'
                  : plateValidation.valid
                  ? 'border-emerald-500/80 focus:ring-2 focus:ring-emerald-500/30'
                  : 'border-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
              }`}
              placeholder="حروف اللوحة بالعربي (مثال: س ق ر 123)"
              value={carPlate}
              onChange={(e) => handlePlateChange(e.target.value)}
              onBlur={() => setTouched((p) => ({ ...p, carPlate: true }))}
            />
            {plateValidation.valid && (
              <CheckCircle2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400" />
            )}
          </div>
          {touched.carPlate && !plateValidation.valid && (
            <p className="text-[10px] font-bold text-red-400 mt-1 flex items-center justify-end gap-1">
              <span>{plateValidation.message}</span>
              <AlertCircle size={11} />
            </p>
          )}
        </div>

        {/* زر التسجيل مع مؤشر التحميل الذكي */}
        <button
          onClick={handleRegister}
          disabled={!isFormValid || loading}
          className={`w-full py-4 rounded-xl font-black text-sm shadow-lg active:scale-95 transition-all mt-3 flex items-center justify-center gap-2 ${
            isFormValid && !loading
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30 cursor-pointer'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none'
          }`}
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin text-white" />
              <span>جاري التحقق والتسجيل...</span>
            </>
          ) : (
            <span>تسجيل الدخول</span>
          )}
        </button>

        <p className="text-[10px] text-slate-500 text-center font-bold mt-2">
          🔒 بياناتك مشفرة ومؤمنة بالكامل
        </p>
      </div>
    </motion.div>
  );
}