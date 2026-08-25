// v2.3 - Unified owner multi-garage support + Bold White text + fixed redirect + clean layout
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, User, Shield, HardHat, ArrowLeft, Building2, MapPin, Lock } from 'lucide-react';
import { useStore } from '../store';
import toast from 'react-hot-toast';

export default function GarageLoginScreen() {
  const { garages, setCurrentGarageId, setView, getMyOwnedGarages } = useStore();

  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'owner' | 'valet'>('owner');
  const [valetPassword, setValetPassword] = useState('');

  // لوحة جراجات المالك التي تظهر بعد التحقق من البيانات لدعم التعدد
  const [ownedGarages, setOwnedGarages] = useState<any[]>([]);
  const [loginStep, setLoginStep] = useState<'credentials' | 'select_garage'>('credentials');

  // ✅ لو جاي من الأدمن، يملأ البيانات تلقائيًا
  useEffect(() => {
    const savedUsername = localStorage.getItem('garagePrefillUsername');
    const savedPhone = localStorage.getItem('garagePrefillPhone');

    if (savedUsername) setUsername(savedUsername);
    if (savedPhone) setPhone(savedPhone);
  }, []);

  // ✅ إنهاء الدخول للجراج بشكل مضمون وبدون ارتداد
  const completeGarageLogin = (garageId: string) => {
    setCurrentGarageId(garageId);
    setView('garage');

    // تأكيد الحفظ في localStorage
    localStorage.setItem('currentGarageId', garageId);
    localStorage.setItem('appView', 'garage');

    // إعادة تحميل خفيفة لفتح الداشبورد فورًا وبشكل سليم
    setTimeout(() => {
      window.location.reload();
    }, 150);
  };

  const handleLogin = () => {
    if (!username.trim() || !phone.trim()) {
      toast.error('الرجاء إدخال جميع الحقول');
      return;
    }

    const found = garages.find(
      (g) => g.username === username.trim() && g.phone === phone.trim()
    );

    if (!found) {
      toast.error('بيانات غير صحيحة');
      return;
    }

    // ✅ امسح الـ prefill بعد نجاح التحقق من بيانات الجراج
    localStorage.removeItem('garagePrefillUsername');
    localStorage.removeItem('garagePrefillPhone');

    // ✅ دخول السايس
    if (role === 'valet') {
      const pw = valetPassword.trim();
      let valetNumber = 0;
      let valetName = '';
      let isActive = false;

      if (pw && found.valetPassword1 && pw === found.valetPassword1) {
        valetNumber = 1;
        valetName = found.valetName1 || '';
        isActive = found.valet1Active !== false;
      } else if (pw && found.valetPassword2 && pw === found.valetPassword2) {
        valetNumber = 2;
        valetName = found.valetName2 || '';
        isActive = found.valet2Active !== false;
      } else if (pw && found.valetPassword3 && pw === found.valetPassword3) {
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

    // ✅ دخول المالك
    localStorage.setItem('garageRole', 'owner');
    localStorage.removeItem('valetNumber');
    localStorage.removeItem('valetName');

    const ownerPhone = found.ownerPhone || found.phone;
    const myGarages = getMyOwnedGarages(ownerPhone);

    if (myGarages.length > 1) {
      // المالك يمتلك أكثر من جراج -> نوجهه لشاشة الاختيار المخصصة
      setOwnedGarages(myGarages);
      setLoginStep('select_garage');
    } else {
      toast.success('✅ تم الدخول كمالك الجراج');
      completeGarageLogin(found.id);
    }
  };

  const selectedGarage = useMemo(() => {
    return garages.find((g) => g.username === username.trim() && g.phone === phone.trim());
  }, [garages, username, phone]);

  const activeValetCount = selectedGarage
    ? [
        selectedGarage.valetPassword1,
        selectedGarage.valetPassword2,
        selectedGarage.valetPassword3,
      ].filter((pw) => pw && pw.trim() !== '').length
    : 0;

  return (
    <div
      className="p-8 h-full flex flex-col justify-center"
      style={{
        background: 'linear-gradient(135deg, #0066FF 0%, #4D00FF 100%)',
        color: '#fff',
      }}
    >
      <img
        src="/images/logo.png"
        alt="بركن"
        className="w-24 h-24 rounded-2xl object-contain mb-6 mx-auto shadow-2xl"
      />

      <h2 className="text-2xl font-black mb-1 text-center">بركن</h2>
      <p className="text-sm text-center mb-6" style={{ opacity: 0.8 }}>
        دخول أصحاب الجراجات
      </p>

      <AnimatePresence mode="wait">
        {/* ─── الخطوة 1: شاشة إدخال بيانات الدخول المعتادة ─── */}
        {loginStep === 'credentials' && (
          <motion.div
            key="credentials"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col w-full"
          >
            {/* اختيار نوع الدخول */}
            <div
              className="flex gap-2 mb-5 p-1.5"
              style={{
                background: 'rgba(255,255,255,0.15)',
                borderRadius: 20,
                backdropFilter: 'blur(10px)',
              }}
            >
              <button
                type="button"
                onClick={() => setRole('owner')}
                className="flex-1 flex items-center justify-center gap-2 font-black transition-all active:scale-95"
                style={{
                  padding: '12px 8px',
                  borderRadius: 16,
                  fontSize: 13,
                  background: role === 'owner' ? '#fff' : 'transparent',
                  color: role === 'owner' ? '#0066FF' : '#fff',
                  boxShadow: role === 'owner' ? '0 4px 16px rgba(0,0,0,0.15)' : 'none',
                  border: 'none',
                }}
              >
                <Shield size={16} />
                مالك الجراج
              </button>

              <button
                type="button"
                onClick={() => setRole('valet')}
                className="flex-1 flex items-center justify-center gap-2 font-black transition-all active:scale-95"
                style={{
                  padding: '12px 8px',
                  borderRadius: 16,
                  fontSize: 13,
                  background: role === 'valet' ? '#fff' : 'transparent',
                  color: role === 'valet' ? '#0066FF' : '#fff',
                  boxShadow: role === 'valet' ? '0 4px 16px rgba(0,0,0,0.15)' : 'none',
                  border: 'none',
                }}
              >
                <HardHat size={16} />
                سايس
              </button>
            </div>

            {/* كارت الفورم */}
            <div
              className="space-y-4 p-6"
              style={{
                background: 'rgba(255,255,255,0.12)',
                backdropFilter: 'blur(20px)',
                borderRadius: 28,
                border: '1.5px solid rgba(255,255,255,0.2)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
              }}
            >
              {/* اسم المستخدم */}
              <div className="relative">
                <User
                  size={18}
                  className="absolute right-4 top-1/2 -translate-y-1/2"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                />
                <input
                  className="w-full p-4 pr-12 text-right font-black outline-none text-sm"
                  style={{
                    background: 'rgba(255,255,255,0.12)',
                    border: '1.5px solid rgba(255,255,255,0.2)',
                    borderRadius: 18,
                    color: '#fff',
                    fontSize: 14,
                  }}
                  placeholder="اسم المستخدم"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              {/* رقم الهاتف */}
              <div className="relative">
                <Phone
                  size={18}
                  className="absolute right-4 top-1/2 -translate-y-1/2"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                />
                <input
                  type="tel"
                  className="w-full p-4 pr-12 text-right font-black outline-none text-sm"
                  style={{
                    background: 'rgba(255,255,255,0.12)',
                    border: '1.5px solid rgba(255,255,255,0.2)',
                    borderRadius: 18,
                    color: '#fff',
                    fontSize: 14,
                  }}
                  placeholder="رقم الهاتف"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              {/* كلمة مرور السايس */}
              {role === 'valet' && (
                <>
                  <div className="relative">
                    <Lock
                      size={18}
                      className="absolute right-4 top-1/2 -translate-y-1/2"
                      style={{ color: 'rgba(255,255,255,0.5)' }}
                    />
                    <input
                      type="password"
                      className="w-full p-4 pr-12 text-right font-black outline-none text-sm"
                      style={{
                        background: 'rgba(255,255,255,0.12)',
                        border: '1.5px solid rgba(255,255,255,0.2)',
                        borderRadius: 18,
                        color: '#fff',
                        fontSize: 14,
                      }}
                      placeholder="كلمة مرور السايس"
                      value={valetPassword}
                      onChange={(e) => setValetPassword(e.target.value)}
                    />
                  </div>

                  {/* عدد السياس المفعّلين */}
                  {selectedGarage && (
                    <div
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        borderRadius: 14,
                        padding: '8px 12px',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: 10, opacity: 0.7 }}>
                          {activeValetCount > 0
                            ? `${activeValetCount} سايس مفعّل`
                            : 'لا يوجد سياس مسجلين'}
                        </span>
                        <span className="font-bold" style={{ fontSize: 10 }}>
                          🅿️ حالة السياس
                        </span>
                      </div>

                      {activeValetCount === 0 && (
                        <p
                          style={{
                            fontSize: 9,
                            opacity: 0.6,
                            marginTop: 4,
                            textAlign: 'center',
                          }}
                        >
                          ⚠️ اطلب من مالك الجراج إضافة سايس من الإعدادات
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* اسم الجراج لو البيانات متعبية */}
              {selectedGarage && (
                <div
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    borderRadius: 14,
                    padding: '8px 12px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    textAlign: 'center',
                  }}
                >
                  <span className="font-black" style={{ fontSize: 12 }}>
                    🅿️ {selectedGarage.name}
                  </span>
                </div>
              )}

              <button
                onClick={handleLogin}
                className="w-full font-black text-lg active:scale-95 transition-all"
                style={{
                  background: '#fff',
                  color: '#0066FF',
                  padding: 18,
                  borderRadius: 22,
                  fontSize: 16,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                  border: 'none',
                }}
              >
                {role === 'owner' ? '🔑 دخول كمالك' : '🅿️ دخول كسايس'}
              </button>

              {/* زر الرجوع */}
              <button
                onClick={() => {
                  localStorage.removeItem('garagePrefillUsername');
                  localStorage.removeItem('garagePrefillPhone');
                  localStorage.removeItem('garageRole');
                  localStorage.removeItem('valetNumber');
                  localStorage.removeItem('valetName');
                  localStorage.removeItem('currentGarageId');
                  setView('user');
                }}
                className="w-full font-bold active:scale-95 transition-all"
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.7)',
                  padding: 12,
                  borderRadius: 18,
                  fontSize: 13,
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
              >
                ← الرجوع للوضع العادي
              </button>
            </div>
          </motion.div>
        )}

        {/* ─── الخطوة 2: شاشة اختيار الجراج (للمالك الموحد) ─── */}
        {loginStep === 'select_garage' && (
          <motion.div
            key="select_garage"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-4 p-6"
            style={{
              background: 'rgba(255,255,255,0.12)',
              backdropFilter: 'blur(20px)',
              borderRadius: 28,
              border: '1.5px solid rgba(255,255,255,0.2)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
          >
            <div className="flex justify-between items-center pb-2 border-b border-white/20">
              <button
                onClick={() => setLoginStep('credentials')}
                className="text-white/70 hover:text-white p-1 rounded-full hover:bg-white/10 border-none"
              >
                <ArrowLeft size={20} />
              </button>
              {/* 🚀 عنوان الشاشة بالخط الأبيض الصريح، العريض والداكن جداً ليكون بارزاً بوضوح تام */}
              <h3 className="font-black text-white flex items-center gap-1.5" style={{ color: '#ffffff', fontWeight: 900, fontSize: '18px' }}>
                <span>اختر جراجاً لإدارته</span>
                <Building2 size={20} className="text-white" />
              </h3>
            </div>

            <p className="text-[11px] font-bold text-white/75 text-center leading-relaxed">
              تم العثور على {ownedGarages.length} جراجات مرتبطة بحسابك الموحد:
            </p>

            <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
              {ownedGarages.map((g) => (
                <button
                  key={g.id}
                  onClick={() => {
                    toast.success(`✅ تم فتح لوحة تحكم ${g.name}`);
                    completeGarageLogin(g.id);
                  }}
                  className="w-full p-4 rounded-2xl border text-right transition-all flex justify-between items-center active:scale-[0.98]"
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1.5px solid rgba(255, 255, 255, 0.2)',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                    color: '#fff',
                  }}
                >
                  <div className="flex flex-col items-center gap-0.5 font-black font-mono text-white">
                    <span style={{ fontSize: 16 }}>{g.availableSpots}</span>
                    <span className="font-bold text-[9px] opacity-75">شاغر</span>
                  </div>
                  <div className="text-right flex-1 mr-3">
                    {/* 🚀 اسم الجراج بالخط الأبيض الصريح، العريض والداكن جداً ليكون بارزاً بوضوح تام */}
                    <div className="font-black text-white" style={{ color: '#ffffff', fontWeight: 900, fontSize: '16px' }}>
                      🅿️ {g.name}
                    </div>
                    <div className="flex items-center gap-1 justify-end mt-1 font-bold text-white/60" style={{ fontSize: 10 }}>
                      <span>{g.location}</span>
                      <MapPin size={10} />
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-4 pt-3 text-center border-t border-white/10">
              <span className="font-bold text-white/60" style={{ fontSize: 10 }}>
                💡 يمكنك التبديل بين جراجاتك من الداخل في أي وقت!
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}