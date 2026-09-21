import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, User, Shield, HardHat, ArrowLeft, Building2, MapPin, Lock, ArrowRight } from 'lucide-react';
import { useStore, normalizePhone } from '../store';
import toast from 'react-hot-toast';

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

// 🛡️ دالة تحويل آمنة تماماً تمنع أي انهيار
const safeClean = (val: any): string => {
  if (val === null || val === undefined) return '';
  return String(val)
    .trim()
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
    const cleanUsername = safeClean(username).toLowerCase();
    const cleanPhone = normalizePhone(phone);

    if (!cleanUsername || !cleanPhone) {
      toast.error('الرجاء إدخال اسم المستخدم ورقم الهاتف');
      return;
    }

    const found = garages.find(
      (g) =>
        safeClean(g.username).toLowerCase() === cleanUsername &&
        (normalizePhone(g.phone) === cleanPhone || normalizePhone(g.ownerPhone || '') === cleanPhone)
    );

    if (!found) {
      toast.error('بيانات الدخول غير صحيحة، تأكد من اسم المستخدم ورقم الهاتف');
      return;
    }

    localStorage.removeItem('garagePrefillUsername');
    localStorage.removeItem('garagePrefillPhone');

    if (role === 'valet') {
      const pw = safeClean(valetPassword);
      let valetNumber = 0;
      let valetName = '';
      let isActive = false;

      if (pw && safeClean(found.valetPassword1) === pw) {
        valetNumber = 1;
        valetName = String(found.valetName1 || '');
        isActive = found.valet1Active !== false;
      } else if (pw && safeClean(found.valetPassword2) === pw) {
        valetNumber = 2;
        valetName = String(found.valetName2 || '');
        isActive = found.valet2Active !== false;
      } else if (pw && safeClean(found.valetPassword3) === pw) {
        valetNumber = 3;
        valetName = String(found.valetName3 || '');
        isActive = found.valet3Active !== false;
      }

      if (valetNumber === 0) {
        toast.error('كلمة مرور الفالية غير صحيحة');
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
          ? `✅ مرحباً ${valetName} - فالية ${valetNumber}`
          : `✅ تم الدخول كفالية جراج ${valetNumber}`
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
    const cleanUsername = safeClean(username).toLowerCase();
    const cleanPhone = normalizePhone(phone);
    if (!cleanUsername || !cleanPhone) return null;
    return garages.find(
      (g) =>
        safeClean(g.username).toLowerCase() === cleanUsername &&
        (normalizePhone(g.phone) === cleanPhone || normalizePhone(g.ownerPhone || '') === cleanPhone)
    );
  }, [garages, username, phone]);

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
      <div className="text-center mb-6 relative z-10">
        <div className="w-20 h-20 rounded-2xl p-2.5 mx-auto mb-3 flex items-center justify-center border" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
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
                }}
              >
                <HardHat size={14} /> فالية الجراج
              </button>
            </div>

            <div className="space-y-3.5 p-5 rounded-3xl border shadow-xl" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
              <div>
                <label className="text-[10px] font-bold block mb-1" style={{ color: BRAND.slateMuted }}>اسم المستخدم المسجل للجراج</label>
                <div className="relative">
                  <User size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: BRAND.slateMuted }} />
                  <input className="w-full py-3 px-3.5 pr-10 text-right font-bold outline-none text-xs rounded-xl border text-white" style={{ background: BRAND.navy, borderColor: BRAND.border }} placeholder="اسم المستخدم" value={username} onChange={(e) => setUsername(e.target.value)} />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold block mb-1" style={{ color: BRAND.slateMuted }}>رقم الهاتف المعتمد</label>
                <div className="relative">
                  <Phone size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: BRAND.slateMuted }} />
                  <input type="tel" dir="ltr" className="w-full py-3 px-3.5 pr-10 text-left font-mono font-bold outline-none text-xs rounded-xl border text-white" style={{ background: BRAND.navy, borderColor: BRAND.border }} placeholder="01xxxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>

              {role === 'valet' && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-2">
                  <label className="text-[10px] font-bold block mb-1" style={{ color: BRAND.slateMuted }}>كلمة مرور الفالية السرية</label>
                  <div className="relative">
                    <Lock size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: BRAND.slateMuted }} />
                    <input type="password" className="w-full py-3 px-3.5 pr-10 text-center font-mono font-black outline-none text-sm rounded-xl border text-white tracking-widest" style={{ background: BRAND.navy, borderColor: BRAND.border }} placeholder="••••" value={valetPassword} onChange={(e) => setValetPassword(e.target.value)} />
                  </div>
                  {selectedGarage && (
                    <div className="rounded-xl p-2 border text-center" style={{ background: BRAND.navy, borderColor: BRAND.border }}>
                      <span className="text-[10px] font-bold" style={{ color: BRAND.green }}>
                        {activeValetCount > 0 ? `✅ متاح ${activeValetCount} حسابات سياس` : '⚠️ لا يوجد سياس مسجلين'}
                      </span>
                    </div>
                  )}
                </motion.div>
              )}

              {selectedGarage && (
                <div className="rounded-xl p-2 border text-center" style={{ background: BRAND.blueSoft, borderColor: `${BRAND.blue}30` }}>
                  <span className="font-black text-xs" style={{ color: BRAND.blueLight }}>🅿️ {selectedGarage.name}</span>
                </div>
              )}

              <button type="button" onClick={handleLogin} className="w-full font-black py-3.5 rounded-xl text-xs border-0 text-white cursor-pointer flex items-center justify-center gap-1.5" style={{ background: BRAND.blue }}>
                <span>{role === 'owner' ? 'دخول لوحة المالك' : 'دخول وردية الفالية'}</span>
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
            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {ownedGarages.map((g) => (
                <button key={g.id} onClick={() => { toast.success(`✅ تم فتح لوحة تحكم ${g.name}`); completeGarageLogin(g.id); }} className="w-full p-3.5 rounded-xl border text-right flex justify-between items-center cursor-pointer" style={{ background: BRAND.navy, borderColor: BRAND.border }}>
                  <div className="font-mono font-black text-sm text-white">{g.availableSpots} <span className="text-[9px] text-slate-400">شاغر</span></div>
                  <div className="text-right flex-1 mr-3">
                    <div className="font-black text-xs text-white">🅿️ {g.name}</div>
                    <div className="text-[9.5px] text-slate-400 mt-0.5">{g.location}</div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}