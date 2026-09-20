// v2.6 - Bulletproof Login + Force String Conversion + Instant SPA Transition
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, User, Shield, HardHat, ArrowLeft, Building2, MapPin, Lock, ArrowRight } from 'lucide-react';
import { useStore, normalizePhone } from '../store';
import toast from 'react-hot-toast';

/* ─── 🎨 الألوان الرسمية الفاخرة لتطبيق Park'n 24 ─── */
const BRAND = {
  blue: '#1656b8',       
  blueDark: '#0f3d85',   
  blueLight: '#e8f0fe',  
  blueSoft: 'rgba(22, 86, 184, 0.12)', 
  green: '#8cc63f',      
  greenDark: '#6ea62a',  
  greenLight: 'rgba(140, 198, 63, 0.12)', 
  navy: '#0a1628',       
  navyLight: '#111e36',  
  slate: '#64748b',      
  slateMuted: '#94a3b8', 
  border: 'rgba(255, 255, 255, 0.08)', 
};

// 🛡️ دالة تحمي التطبيق من الانهيار حتى لو دخلت أرقام أو قيم فارغة من قاعدة البيانات
const normalizeText = (val: any): string => {
  if (val === null || val === undefined) return '';
  const str = String(val).trim(); // تحويل إجباري لنص لمنع الانهيار
  return str
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶٧٨٩'.indexOf(d)))
    .replace(/\s+/g, '');
};

export default function GarageLoginScreen() {
  const { garages, setCurrentGarageId, setView, getMyOwnedGarages } = useStore();

  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'owner' | 'valet'>('owner');
  const [valetPassword, setValetPassword] = useState('');

  const [ownedGarages, setOwnedGarages] = useState<any[]>([]);
  const [loginStep, setLoginStep] = useState<'credentials' | 'select_garage'>('credentials');

  // جلب البيانات تلقائياً لو تم التوجيه من الأدمن
  useEffect(() => {
    const savedUsername = localStorage.getItem('garagePrefillUsername');
    const savedPhone = localStorage.getItem('garagePrefillPhone');

    if (savedUsername) setUsername(savedUsername);
    if (savedPhone) setPhone(savedPhone);
  }, []);

  const completeGarageLogin = (garageId: string) => {
    localStorage.setItem('currentGarageId', garageId);
    localStorage.setItem('appView', 'garage');
    setCurrentGarageId(garageId);
    setView('garage');
  };

  const handleLogin = () => {
    const cleanUsername = normalizeText(username).toLowerCase();
    const cleanPhone = normalizePhone(phone);

    if (!cleanUsername || !cleanPhone) {
      toast.error('الرجاء إدخال اسم المستخدم ورقم الهاتف');
      return;
    }

    const found = garages.find(
      (g) =>
        normalizeText(g.username).toLowerCase() === cleanUsername &&
        (normalizePhone(g.phone) === cleanPhone || normalizePhone(g.ownerPhone || '') === cleanPhone)
    );

    if (!found) {
      toast.error('بيانات الدخول غير صحيحة، تأكد من اسم المستخدم ورقم الهاتف');
      return;
    }

    localStorage.removeItem('garagePrefillUsername');
    localStorage.removeItem('garagePrefillPhone');

    if (role === 'valet') {
      const pw = normalizeText(valetPassword);
      let valetNumber = 0;
      let valetName = '';
      let isActive = false;

      // مقارنة نصوص صلبة لمنع أي خطأ في نوع البيانات
      if (pw && normalizeText(found.valetPassword1) === pw) {
        valetNumber = 1;
        valetName = found.valetName1 || '';
        isActive = found.valet1Active !== false;
      } else if (pw && normalizeText(found.valetPassword2) === pw) {
        valetNumber = 2;
        valetName = found.valetName2 || '';
        isActive = found.valet2Active !== false;
      } else if (pw && normalizeText(found.valetPassword3) === pw) {
        valetNumber = 3;
        valetName = found.valetName3 || '';
        isActive = found.valet3Active !== false;
      }

      if (valetNumber === 0) {
        toast.error('كلمة مرور السايس غير صحيحة');
        return;
      }

      if (!isActive) {
        toast.error('عذراً، هذا الحساب معطل حالياً من قبل المالك 🔒');
        return;
      }

      localStorage.setItem('garageRole', 'valet');
      localStorage.setItem('valetNumber', String(valetNumber));
      localStorage.setItem('valetName', valetName);

      toast.success(
        valetName
          ? `✅ مرحباً ${valetName} - سايس ${valetNumber}`
          : `✅ تم الدخول كسايس ${valetNumber}`
      );

      completeGarageLogin(found.id);
      return;
    }

    localStorage.setItem('garageRole', 'owner');
    localStorage.removeItem('valetNumber');
    localStorage.removeItem('valetName');

    const ownerPhone = found.ownerPhone || found.phone;
    const myGarages = getMyOwnedGarages(ownerPhone);

    if (myGarages.length > 1) {
      setOwnedGarages(myGarages);
      setLoginStep('select_garage');
    } else {
      toast.success('✅ تم الدخول كمالك الجراج');
      completeGarageLogin(found.id);
    }
  };

  const selectedGarage = useMemo(() => {
    const cleanUsername = normalizeText(username).toLowerCase();
    const cleanPhone = normalizePhone(phone);
    if (!cleanUsername || !cleanPhone) return null;
    return garages.find(
      (g) =>
        normalizeText(g.username).toLowerCase() === cleanUsername &&
        (normalizePhone(g.phone) === cleanPhone || normalizePhone(g.ownerPhone || '') === cleanPhone)
    );
  }, [get(), username, phone]);

  const activeValetCount = selectedGarage
    ? [
        selectedGarage.valetPassword1,
        selectedGarage.valetPassword2,
        selectedGarage.valetPassword3,
      ].filter((pw) => pw !== null && pw !== undefined && String(pw).trim() !== '').length
    : 0;

  return (
    <div
      className="p-6 h-full flex flex-col justify-center max-w-sm mx-auto w-full text-right relative overflow-hidden safe-top safe-bottom"
      style={{
        background: BRAND.navy,
        color: '#ffffff',
        direction: 'rtl',
      }}
    >
      <div className="absolute -top-20 -right-20 w-52 h-52 rounded-full pointer-events-none" style={{ background: `${BRAND.blue}20`, filter: 'blur(50px)' }} />
      <div className="absolute -bottom-20 -left-20 w-48 h-48 rounded-full pointer-events-none" style={{ background: `${BRAND.green}15`, filter: 'blur(50px)' }} />

      <div className="text-center mb-6 relative z-10">
        <div className="w-20 h-20 rounded-2xl p-2.5 mx-auto mb-3 flex items-center justify-center border" style={{ background: BRAND.navyLight, borderColor: BRAND.border, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
          <img src="/images/logo.png" alt="بركن 24" className="w-full h-full object-contain" />
        </div>
        <h2 className="text-2xl font-black mb-0.5 tracking-tight text-white">بركن <span style={{ color: BRAND.green }}>24</span></h2>
        <p className="text-xs font-bold" style={{ color: BRAND.slateMuted }}>بوابة تسجيل دخول أصحاب الجراجات والسياس</p>
      </div>

      <AnimatePresence mode="wait">
        {loginStep === 'credentials' && (
          <motion.div key="credentials" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="flex flex-col w-full relative z-10">
            <div className="flex gap-1.5 mb-4 p-1 rounded-2xl border" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
              <button
                type="button"
                onClick={() => setRole('owner')}
                className="flex-1 flex items-center justify-center gap-1.5 font-black py-2.5 rounded-xl transition-all cursor-pointer border-0 text-xs"
                style={{
                  background: role === 'owner' ? BRAND.blue : 'transparent',
                  color: role === 'owner' ? '#ffffff' : BRAND.slateMuted,
                  boxShadow: role === 'owner' ? `0 4px 12px ${BRAND.blue}30` : 'none',
                }}
              >
                <Shield size={14} /> مالك الجراج
              </button>
              <button
                type="button"
                onClick={() => setRole('valet')}
                className="flex-1 flex items-center justify-center gap-1.5 font-black py-2.5 rounded-xl transition-all cursor-pointer border-0 text-xs"
                style={{
                  background: role === 'valet' ? BRAND.blue : 'transparent',
                  color: role === 'valet' ? '#ffffff' : BRAND.slateMuted,
                  boxShadow: role === 'valet' ? `0 4px 12px ${BRAND.blue}30` : 'none',
                }}
              >
                <HardHat size={14} /> سايس
              </button>
            </div>

            <div className="space-y-3.5 p-5 rounded-3xl border shadow-xl" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
              <div>
                <label className="text-[10px] font-bold block mb-1" style={{ color: BRAND.slateMuted }}>اسم المستخدم المسجل للجراج</label>
                <div className="relative">
                  <User size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: BRAND.slateMuted }} />
                  <input className="w-full py-3 px-3.5 pr-10 text-right font-bold outline-none text-xs rounded-xl border text-white transition-all focus:border-blue-500" style={{ background: BRAND.navy, borderColor: BRAND.border }} placeholder="مثال: garage_cairo" value={username} onChange={(e) => setUsername(e.target.value)} />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold block mb-1" style={{ color: BRAND.slateMuted }}>رقم الهاتف المعتمد</label>
                <div className="relative">
                  <Phone size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: BRAND.slateMuted }} />
                  <input type="tel" dir="ltr" className="w-full py-3 px-3.5 pr-10 text-left font-mono font-bold outline-none text-xs rounded-xl border text-white transition-all focus:border-blue-500" style={{ background: BRAND.navy, borderColor: BRAND.border }} placeholder="01xxxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>

              {role === 'valet' && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-2">
                  <label className="text-[10px] font-bold block mb-1" style={{ color: BRAND.slateMuted }}>كلمة مرور السايس السرية</label>
                  <div className="relative">
                    <Lock size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: BRAND.slateMuted }} />
                    <input type="password" className="w-full py-3 px-3.5 pr-10 text-center font-mono font-black outline-none text-sm rounded-xl border text-white transition-all tracking-widest focus:border-blue-500" style={{ background: BRAND.navy, borderColor: BRAND.border }} placeholder="••••" value={valetPassword} onChange={(e) => setValetPassword(e.target.value)} />
                  </div>
                  {selectedGarage && (
                    <div className="rounded-xl p-2.5 border text-center" style={{ background: BRAND.navy, borderColor: BRAND.border }}>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold" style={{ color: BRAND.green }}>{activeValetCount > 0 ? `✅ متاح ${activeValetCount} حسابات سياس` : '⚠️ لا يوجد سياس مسجلين'}</span>
                        <span style={{ color: BRAND.slateMuted }}>حالة الطاقم</span>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {selectedGarage && (
                <div className="rounded-xl p-2.5 border text-center flex items-center justify-center gap-1.5" style={{ background: BRAND.blueSoft, borderColor: `${BRAND.blue}30` }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-black text-xs" style={{ color: BRAND.blueLight }}>🅿️ {selectedGarage.name}</span>
                </div>
              )}

              <button type="button" onClick={handleLogin} className="w-full font-black py-3.5 rounded-xl text-xs active:scale-[0.98] transition-all border-0 text-white cursor-pointer flex items-center justify-center gap-1.5" style={{ background: BRAND.blue, boxShadow: `0 4px 14px ${BRAND.blue}30` }}>
                <span>{role === 'owner' ? 'دخول لوحة المالك' : 'دخول وردية السايس'}</span>
                <ArrowRight size={15} className="rotate-180" />
              </button>
            </div>
          </motion.div>
        )}

        {loginStep === 'select_garage' && (
          <motion.div key="select_garage" initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 15 }} className="space-y-3.5 p-5 rounded-3xl border shadow-xl relative z-10" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
            <div className="flex justify-between items-center pb-2.5 border-b" style={{ borderColor: BRAND.border }}>
              <button onClick={() => setLoginStep('credentials')} className="text-slate-400 hover:text-white p-1 rounded-lg border-0 bg-transparent cursor-pointer"><ArrowLeft size={18} /></button>
              <h3 className="font-black text-xs text-white flex items-center gap-1.5">
                <span>اختر الجراج المطلوب إدارته</span>
                <Building2 size={16} style={{ color: BRAND.blue }} />
              </h3>
            </div>
            <p className="text-[10px] font-bold text-center" style={{ color: BRAND.slateMuted }}>تم العثور على {ownedGarages.length} جراجات مسجلة برقم هاتفك:</p>
            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {ownedGarages.map((g) => (
                <button key={g.id} onClick={() => { toast.success(`✅ تم فتح لوحة تحكم ${g.name}`); completeGarageLogin(g.id); }} className="w-full p-3.5 rounded-xl border text-right transition-all flex justify-between items-center active:scale-[0.98] cursor-pointer" style={{ background: BRAND.navy, borderColor: BRAND.border }}>
                  <div className="flex flex-col items-center gap-0.5 font-mono text-center">
                    <span className="font-black text-sm text-white">{g.availableSpots}</span>
                    <span className="text-[8px] font-bold" style={{ color: BRAND.slateMuted }}>شاغر</span>
                  </div>
                  <div className="text-right flex-1 mr-3">
                    <div className="font-black text-xs text-white">🅿️ {g.name}</div>
                    <div className="flex items-center gap-1 justify-end mt-0.5 text-[9.5px]" style={{ color: BRAND.slateMuted }}>
                      <span>{g.location}</span>
                      <MapPin size={10} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="pt-2 text-center border-t border-dashed" style={{ borderColor: BRAND.border }}>
              <span className="text-[9.5px] font-bold" style={{ color: BRAND.slateMuted }}>💡 يمكنك التبديل بين جراجاتك من الداخل في أي وقت!</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}