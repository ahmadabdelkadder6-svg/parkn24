import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Car, Phone, User, ArrowRight, ShieldCheck, Sparkles, Loader2, Zap, Wallet } from 'lucide-react';
// 🌟 استيراد دوال البصمة الموحدة من الـ store لضمان مطابقة تامة مع قاعدة البيانات
import { useStore, normalizePlate, normalizePhone, BOOKING_FEE } from '../store';
import toast from 'react-hot-toast';

/* ─── 🎨 هوية Park'n 24 الرسمية ─── */
const BRAND = {
  blue: '#1656b8',
  blueDark: '#0f3d85',
  blueBright: '#1d68dc',
  green: '#8cc63f',
  greenDark: '#6ea62a',
  navy: '#0a1628',
  navyLight: '#111e36',
  slate: '#64748b',
  slateMuted: '#94a3b8',
  border: 'rgba(255, 255, 255, 0.10)',
};

export default function RegisterScreen() {
  const { setCurrentUser, setScreen } = useStore();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [carPlate, setCarPlate] = useState('');
  const [loading, setLoading] = useState(false);

  const isMountedRef = useRef(true);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      isSubmittingRef.current = false;
    };
  }, []);

  // ✍️ قبول الحروف العربية والمسافات فقط في الاسم وتنظيف المسافات المتكررة
  const handleNameChange = (val: string) => {
    const arabicOnly = val.replace(/[^\u0600-\u06FF\s]/g, '').replace(/\s+/g, ' ');
    setName(arabicOnly);
  };

  // 📱 فلترة لحظية فائقة الذكاء أثناء الكتابة للهواتف المصرية
  const handlePhoneChange = (val: string) => {
    let digits = val;
    const arabicNums = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    for (let i = 0; i < 10; i++) {
      digits = digits.split(arabicNums[i]).join(String(i));
    }
    
    // إزالة أي شيء ليس رقماً والالتزام بـ 11 خانة كحد أقصى
    const digitsOnly = digits.replace(/[^\d]/g, '').slice(0, 11);
    setPhone(digitsOnly);
  };

  // 🚗 فلترة صارمة لرقم اللوحة (حروف عربية وأرقام ومسافات فقط)
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
    
    // 🛡️ حماية فورية من الضغط المزدوج السريع
    if (isSubmittingRef.current || loading) return;

    if (!name.trim() || name.trim().length < 3) { 
      toast.error('يرجى إدخال اسمك باللغة العربية (3 حروف على الأقل)'); 
      return; 
    }
    
    // 🇪🇬 الفحص الصارم لرقم الهاتف المصري
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

    // 🛡️ فحص اكتمال اللوحة عبر البصمة الفولاذية الموحدة (يجب أن تحتوي على حروف وأرقام معاً)
    const cleanPlate = normalizePlate(plateTrimmed);
    const plateParts = cleanPlate.split('_');
    const hasValidLetters = plateParts[0] && plateParts[0].length > 0;
    const hasValidDigits = plateParts[1] && plateParts[1].length > 0;

    if (!cleanPlate || !hasValidLetters || !hasValidDigits) { 
      toast.error('رقم اللوحة غير مكتمل! يجب إدخال حروف عربية وأرقام معاً (مثال: أ ب ج ١٢٣)'); 
      return; 
    }

    try {
      isSubmittingRef.current = true;
      setLoading(true);

      await setCurrentUser({
        name: name.trim(),
        phone: cleanPhone,
        carPlate: cleanPlate,
        wallet: 0,
      });

      if (!isMountedRef.current) return;
      toast.success('تم تسجيل وتأمين بياناتك بنجاح! 🚗✨');
      setScreen('list');
    } catch (err) {
      console.error('Registration error:', err);
      if (isMountedRef.current) {
        toast.error('حدث خطأ أثناء التسجيل، حاول مجدداً');
      }
    } finally {
      isSubmittingRef.current = false;
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full text-white flex flex-col justify-between p-6 text-right overflow-y-auto relative"
      dir="rtl"
      style={{
        background: `
          radial-gradient(ellipse at 50% -10%, rgba(22, 86, 184, 0.22) 0%, transparent 55%),
          radial-gradient(ellipse at 50% 110%, rgba(140, 198, 63, 0.07) 0%, transparent 50%),
          ${BRAND.navy}
        `,
      }}
    >
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full py-4 relative z-10">

        {/* ══ الشعار والعنوان ══ */}
        <div className="text-center mb-5">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 18, stiffness: 240 }}
            className="w-[72px] h-[72px] rounded-[22px] flex items-center justify-center mx-auto mb-3.5 relative"
            style={{
              background: '#ffffff',
              border: '1.5px solid rgba(255,255,255,0.15)',
              boxShadow: `0 10px 30px rgba(22, 86, 184, 0.35), 0 0 0 6px rgba(22, 86, 184, 0.08)`,
            }}
          >
            <img
              src="/images/logo.png"
              alt="بركن 24"
              className="w-12 h-12 object-contain"
              onError={(e) => {
                // لو اللوجو مش موجود يظهر آيقونة العربية
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </motion.div>

          <h2
            className="text-[22px] font-black text-white tracking-tight"
            style={{ textShadow: '0 2px 12px rgba(0,0,0,0.4)' }}
          >
            سجل بياناتك للبدء 🚀
          </h2>
          <p className="text-[11px] font-bold mt-1" style={{ color: BRAND.slateMuted }}>
            خطوة واحدة وتبقى جاهز تحجز ركنتك
          </p>

          {/* ══ شارات المميزات (VIP + الدرع الذكي) ══ */}
          <div className="mt-3.5 flex flex-col items-center gap-2">
            {/* ⚡ شارة حجز VIP */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl"
              style={{
                background: `linear-gradient(135deg, ${BRAND.blueBright} 0%, ${BRAND.blue} 100%)`,
                border: '1.5px solid rgba(255,255,255,0.22)',
                boxShadow: '0 8px 24px rgba(22, 86, 184, 0.4)',
              }}
            >
              <Zap size={15} className="text-yellow-300 shrink-0" />
              <span
                style={{
                  color: '#ffffff',
                  fontWeight: 950,
                  fontSize: '12px',
                  letterSpacing: '0.2px',
                  textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                }}
              >
                احجز ركنتك بـ {BOOKING_FEE} ج.م فقط من محفظتك! ⚡
              </span>
            </motion.div>

            {/* 🛡️ شارة درع الحماية الذكي */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, rgba(140, 198, 63, 0.14) 0%, rgba(140, 198, 63, 0.05) 100%)',
                border: `1.5px solid rgba(140, 198, 63, 0.35)`,
                boxShadow: '0 4px 16px rgba(140, 198, 63, 0.12)',
              }}
            >
              <ShieldCheck size={14} style={{ color: BRAND.green }} className="shrink-0" />
              <span
                style={{
                  color: '#b5e07a',
                  fontWeight: 900,
                  fontSize: '11px',
                  letterSpacing: '0.2px',
                }}
              >
                درع الحماية الذكي لمراقبة عربيتك 24/7 🛡️
              </span>
            </motion.div>
          </div>
        </div>

        {/* ══ الفورم ══ */}
        <form onSubmit={handleRegister} className="space-y-3.5">
          {/* الاسم بالعربي */}
          <div>
            <label
              className="block text-[11px] font-black mb-1.5 mr-1"
              style={{ color: BRAND.slateMuted }}
            >
              الاسم بالكامل (عربي فقط)
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="أحمد علي"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                disabled={loading}
                autoComplete="name"
                spellCheck={false}
                className="w-full rounded-2xl py-3.5 px-4 pr-11 text-sm font-bold text-white text-right outline-none transition-all disabled:opacity-60 placeholder:text-slate-600"
                style={{
                  background: `linear-gradient(135deg, ${BRAND.navyLight} 0%, rgba(17, 30, 54, 0.7) 100%)`,
                  border: `1.5px solid ${BRAND.border}`,
                  boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.25)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = BRAND.blue;
                  e.currentTarget.style.boxShadow = `0 0 0 3px rgba(22, 86, 184, 0.25), inset 0 2px 6px rgba(0,0,0,0.25)`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = BRAND.border;
                  e.currentTarget.style.boxShadow = 'inset 0 2px 6px rgba(0,0,0,0.25)';
                }}
              />
              <User
                className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"
                size={16}
                style={{ color: BRAND.slateMuted }}
              />
            </div>
          </div>

          {/* الهاتف (11 رقم مصري معتمد) */}
          <div>
            <div className="flex justify-between items-center mb-1.5 mr-1">
              <span
                className="text-[10px] font-mono font-black"
                dir="ltr"
                style={{ color: phone.length === 11 ? BRAND.green : BRAND.blueBright }}
              >
                {phone.length}/11
              </span>
              <label className="text-[11px] font-black" style={{ color: BRAND.slateMuted }}>
                رقم الموبايل (مثال: 012 / 010 / 011 / 015)
              </label>
            </div>
            <div className="relative">
              <input
                type="tel"
                inputMode="numeric"
                placeholder="01xxxxxxxxx"
                value={phone}
                maxLength={11}
                onChange={(e) => handlePhoneChange(e.target.value)}
                disabled={loading}
                autoComplete="tel"
                className="w-full rounded-2xl py-3.5 px-4 pr-11 text-sm font-bold text-white text-left font-mono outline-none transition-all disabled:opacity-60 placeholder:text-slate-600"
                dir="ltr"
                style={{
                  background: `linear-gradient(135deg, ${BRAND.navyLight} 0%, rgba(17, 30, 54, 0.7) 100%)`,
                  border: `1.5px solid ${BRAND.border}`,
                  boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.25)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = BRAND.blue;
                  e.currentTarget.style.boxShadow = `0 0 0 3px rgba(22, 86, 184, 0.25), inset 0 2px 6px rgba(0,0,0,0.25)`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = BRAND.border;
                  e.currentTarget.style.boxShadow = 'inset 0 2px 6px rgba(0,0,0,0.25)';
                }}
              />
              <Phone
                className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"
                size={16}
                style={{ color: BRAND.slateMuted }}
              />
            </div>
          </div>

          {/* رقم اللوحة بالعربي */}
          <div>
            <label
              className="text-[11px] font-black mb-1.5 mr-1 flex items-center justify-end gap-1"
              style={{ color: BRAND.slateMuted }}
            >
              <span>رقم لوحة السيارة (عربي فقط)</span>
              <Sparkles size={11} className="text-amber-400" />
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="مثال: أ ب ج ١٢٣ أو أ ب ج 123"
                value={carPlate}
                onChange={(e) => handlePlateChange(e.target.value)}
                disabled={loading}
                spellCheck={false}
                className="w-full rounded-2xl py-3.5 px-4 pr-11 text-sm font-black text-white text-center outline-none transition-all tracking-wider disabled:opacity-60 placeholder:text-slate-600"
                style={{
                  background: `linear-gradient(135deg, ${BRAND.navyLight} 0%, rgba(17, 30, 54, 0.7) 100%)`,
                  border: `1.5px solid ${BRAND.border}`,
                  boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.25)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = BRAND.blue;
                  e.currentTarget.style.boxShadow = `0 0 0 3px rgba(22, 86, 184, 0.25), inset 0 2px 6px rgba(0,0,0,0.25)`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = BRAND.border;
                  e.currentTarget.style.boxShadow = 'inset 0 2px 6px rgba(0,0,0,0.25)';
                }}
              />
              <Car
                className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"
                size={16}
                style={{ color: BRAND.slateMuted }}
              />
            </div>
            <p
              className="text-[10px] mt-1.5 font-bold text-right mr-1"
              style={{ color: BRAND.slateMuted }}
            >
              💡 اكتب الحروف والأرقام كما هي باللغة العربية على اللوحة
            </p>
          </div>

          {/* زر التأكيد */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl text-base active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 cursor-pointer border-none mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: `linear-gradient(135deg, ${BRAND.blueBright} 0%, ${BRAND.blueDark} 100%)`,
              boxShadow: '0 10px 28px rgba(22, 86, 184, 0.45), inset 0 1px 0 rgba(255,255,255,0.18)',
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
                    textShadow: '0 1px 3px rgba(0,0,0,0.35)',
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
                    textShadow: '0 1px 3px rgba(0,0,0,0.35)',
                  }}
                >
                  حفظ البيانات والبدء الآن 🚀
                </span>
                <ArrowRight size={18} className="rotate-180 text-white" strokeWidth={3} />
              </>
            )}
          </button>
        </form>
      </div>

      {/* ══ حماية الأمان والخصوصية ══ */}
      <div
        className="pt-4 text-center flex items-center justify-center gap-3 text-[10px] font-bold relative z-10"
        style={{
          borderTop: `1px solid ${BRAND.border}`,
          color: BRAND.slateMuted,
        }}
      >
        <span className="flex items-center gap-1">
          <Wallet size={10} style={{ color: BRAND.blueBright }} />
          محفظة إلكترونية آمنة
        </span>
        <span style={{ color: 'rgba(255,255,255,0.2)' }}>•</span>
        <span className="flex items-center gap-1">
          <ShieldCheck size={10} style={{ color: BRAND.green }} />
          بياناتك مشفرة بالكامل
        </span>
      </div>
    </motion.div>
  );
}