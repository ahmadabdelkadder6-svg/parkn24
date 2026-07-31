// v2.0 - valet support
import { useState, useEffect } from 'react';
import { Phone, User, Shield, HardHat } from 'lucide-react';
import { useStore } from '../store';
import toast from 'react-hot-toast';

export default function GarageLoginScreen() {
  const { garages, setCurrentGarageId, setView } = useStore();
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'owner' | 'valet'>('owner');
  const [valetPassword, setValetPassword] = useState('');

  // ✅ لو جاي من الأدمن، يملأ البيانات تلقائيًا
  useEffect(() => {
    const savedUsername = localStorage.getItem('garagePrefillUsername');
    const savedPhone = localStorage.getItem('garagePrefillPhone');
    if (savedUsername) setUsername(savedUsername);
    if (savedPhone) setPhone(savedPhone);
  }, []);

  const handleLogin = () => {
    const found = garages.find(
      (g) => g.username === username && g.phone === phone
    );

    if (!found) {
      toast.error('بيانات غير صحيحة');
      return;
    }

    // ✅ امسح الـ prefill بعد ما الدخول ينجح
    localStorage.removeItem('garagePrefillUsername');
    localStorage.removeItem('garagePrefillPhone');

    if (role === 'valet') {
      const pw = valetPassword.trim();
      let valetNumber = 0;
      let valetName = '';

      if (pw && found.valetPassword1 && pw === found.valetPassword1) {
        valetNumber = 1;
        valetName = found.valetName1 || '';
      } else if (pw && found.valetPassword2 && pw === found.valetPassword2) {
        valetNumber = 2;
        valetName = found.valetName2 || '';
      } else if (pw && found.valetPassword3 && pw === found.valetPassword3) {
        valetNumber = 3;
        valetName = found.valetName3 || '';
      }

      if (valetNumber === 0) {
        toast.error('كلمة مرور السايس غير صحيحة');
        return;
      }

      localStorage.setItem('garageRole', 'valet');
      localStorage.setItem('valetNumber', String(valetNumber));
      localStorage.setItem('valetName', valetName);

      setCurrentGarageId(found.id);
      setView('garage');

      toast.success(
        valetName
          ? `✅ مرحباً ${valetName} - سايس ${valetNumber}`
          : `✅ تم الدخول كسايس ${valetNumber}`
      );
    } else {
      localStorage.setItem('garageRole', 'owner');
      localStorage.removeItem('valetNumber');
      localStorage.removeItem('valetName');

      setCurrentGarageId(found.id);
      setView('garage');
      toast.success('✅ تم الدخول كمالك الجراج');
    }
  };

  const selectedGarage = garages.find(
    (g) => g.username === username && g.phone === phone
  );

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

      {/* ══════ اختيار نوع الدخول ══════ */}
      <div
        className="flex gap-2 mb-5 p-1.5"
        style={{
          background: 'rgba(255,255,255,0.15)',
          borderRadius: 20,
          backdropFilter: 'blur(10px)',
        }}
      >
        <button
          onClick={() => setRole('owner')}
          className="flex-1 flex items-center justify-center gap-2 font-black transition-all active:scale-95"
          style={{
            padding: '12px 8px',
            borderRadius: 16,
            fontSize: 13,
            background: role === 'owner' ? '#fff' : 'transparent',
            color: role === 'owner' ? '#0066FF' : '#fff',
            boxShadow: role === 'owner' ? '0 4px 16px rgba(0,0,0,0.15)' : 'none',
          }}
        >
          <Shield size={16} />
          مالك الجراج
        </button>

        <button
          onClick={() => setRole('valet')}
          className="flex-1 flex items-center justify-center gap-2 font-black transition-all active:scale-95"
          style={{
            padding: '12px 8px',
            borderRadius: 16,
            fontSize: 13,
            background: role === 'valet' ? '#fff' : 'transparent',
            color: role === 'valet' ? '#0066FF' : '#fff',
            boxShadow: role === 'valet' ? '0 4px 16px rgba(0,0,0,0.15)' : 'none',
          }}
        >
          <HardHat size={16} />
          سايس
        </button>
      </div>

      {/* ══════ الفورم ══════ */}
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
          <User size={18} className="absolute right-4 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.5)' }} />
          <input
            className="w-full p-4 pr-12 text-right font-black outline-none text-sm"
            style={{ background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 18, color: '#fff', fontSize: 14 }}
            placeholder="اسم المستخدم"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        {/* رقم الهاتف */}
        <div className="relative">
          <Phone size={18} className="absolute right-4 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.5)' }} />
          <input
            type="tel"
            className="w-full p-4 pr-12 text-right font-black outline-none text-sm"
            style={{ background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 18, color: '#fff', fontSize: 14 }}
            placeholder="رقم الهاتف"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        {/* ✅ كلمة مرور السايس */}
        {role === 'valet' && (
          <>
            <div className="relative">
              <HardHat size={18} className="absolute right-4 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.5)' }} />
              <input
                type="password"
                className="w-full p-4 pr-12 text-right font-black outline-none text-sm"
                style={{ background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 18, color: '#fff', fontSize: 14 }}
                placeholder="كلمة مرور السايس"
                value={valetPassword}
                onChange={(e) => setValetPassword(e.target.value)}
              />
            </div>

            {/* ✅ عدد السياس المفعّلين */}
            {selectedGarage && (
              <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 10, opacity: 0.7 }}>
                    {activeValetCount > 0 ? `${activeValetCount} سايس مفعّل` : 'لا يوجد سياس مسجلين'}
                  </span>
                  <span className="font-bold" style={{ fontSize: 10 }}>🅿️ حالة السياس</span>
                </div>
                {activeValetCount === 0 && (
                  <p style={{ fontSize: 9, opacity: 0.6, marginTop: 4, textAlign: 'center' }}>
                    ⚠️ اطلب من مالك الجراج إضافة سايس من الإعدادات
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* ✅ لو فيه prefill من الأدمن، بيّن اسم الجراج */}
        {selectedGarage && (
          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
            <span className="font-black" style={{ fontSize: 12 }}>🅿️ {selectedGarage.name}</span>
          </div>
        )}

        <button
          onClick={handleLogin}
          className="w-full font-black text-lg active:scale-95 transition-all"
          style={{ background: '#fff', color: '#0066FF', padding: 18, borderRadius: 22, fontSize: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
        >
          {role === 'owner' ? '🔑 دخول كمالك' : '🅿️ دخول كسايس'}
        </button>

        {/* ✅ زر الرجوع - بيمسح الـ prefill */}
        <button
          onClick={() => {
            localStorage.removeItem('garagePrefillUsername');
            localStorage.removeItem('garagePrefillPhone');
            setView('user');
          }}
          className="w-full font-bold active:scale-95 transition-all"
          style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', padding: 12, borderRadius: 18, fontSize: 13, border: '1px solid rgba(255,255,255,0.15)' }}
        >
          ← الرجوع للوضع العادي
        </button>
      </div>
    </div>
  );
}