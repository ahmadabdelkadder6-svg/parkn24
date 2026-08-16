import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Download, Smartphone, ChevronDown, ExternalLink } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const SITE_URL = 'https://parkn24.vercel.app';

export default function InstallPage() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [waitingSeconds, setWaitingSeconds] = useState(0);
  const [showManualGuide, setShowManualGuide] = useState(false);

  const deviceInfo = useMemo(() => {
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);
    const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(ua);
    const isInAppBrowser = /FBAN|FBAV|Instagram|Line|TikTok|WhatsApp/i.test(ua);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    return { isIOS, isAndroid, isSafari, isInAppBrowser, isStandalone };
  }, []);

  // ✅ لو مثبت بالفعل → روّح الصفحة الرئيسية
  useEffect(() => {
    if (deviceInfo.isStandalone) {
      window.location.href = SITE_URL;
    }
  }, [deviceInfo.isStandalone]);

  // ✅ استمع لـ beforeinstallprompt
  useEffect(() => {
    if (deviceInfo.isStandalone) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowManualGuide(false);
    };

    const onInstalled = () => {
      localStorage.setItem('pwaJustInstalled', 'true');
      setInstalled(true);
      setDeferredPrompt(null);
      setTimeout(() => { window.location.href = SITE_URL; }, 1800);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [deviceInfo.isStandalone]);

  // ✅ عدّاد الانتظار + fallback يدوي بعد 5 ثواني
  useEffect(() => {
    if (deviceInfo.isIOS || deviceInfo.isInAppBrowser || deviceInfo.isStandalone) return;
    if (deferredPrompt) return;

    const interval = setInterval(() => {
      setWaitingSeconds(prev => {
        if (prev >= 5) {
          setShowManualGuide(true);
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [deviceInfo, deferredPrompt]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        localStorage.setItem('pwaJustInstalled', 'true');
      }
    } catch (e) {
      console.error('Install failed:', e);
    } finally {
      setInstalling(false);
      setDeferredPrompt(null);
    }
  };

  if (deviceInfo.isStandalone) return null;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(180deg, #0A1628 0%, #0D2137 50%, #0A1628 100%)' }}
    >
      {/* ✅ تم التثبيت */}
      {installed ? (
        <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center text-white">
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
          <h2 className="font-black text-2xl mb-2">تم التثبيت بنجاح</h2>
          <p className="text-slate-400 text-sm">جاري فتح التطبيق...</p>
        </motion.div>
      ) : (
        <>
          {/* اللوجو */}
          <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mb-6">
            <img src="/images/logo.png" alt="بركن" className="w-24 h-24 object-contain mx-auto"
              style={{ borderRadius: 28, boxShadow: '0 8px 40px rgba(0,102,255,0.4)', border: '3px solid rgba(0,102,255,0.3)' }} />
          </motion.div>

          {/* العنوان */}
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="text-center mb-6">
            <h1 className="font-black text-white text-2xl mb-2">بركن 24</h1>
            <p className="text-slate-400 text-sm">
              {deviceInfo.isInAppBrowser ? 'افتح الرابط في Safari أو Chrome' :
               deviceInfo.isIOS ? 'ثبّت التطبيق بسهولة' :
               'تثبيت سريع وتشغيل أفضل'}
            </p>
          </motion.div>

          {/* المميزات */}
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="w-full max-w-sm space-y-2.5 mb-6">
            {[
              { icon: '🚗', text: 'احجز مكان ركن فورًا' },
              { icon: '📍', text: 'اعرف أقرب جراج ليك' },
              { icon: '⏱️', text: 'تابع جلسة الركن بسهولة' },
              { icon: '💳', text: 'وصول أسرع من المتصفح' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 justify-end"
                style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="font-bold text-white text-sm">{item.text}</span>
                <span style={{ fontSize: 20 }}>{item.icon}</span>
              </div>
            ))}
          </motion.div>

          {/* ═══ أزرار التثبيت ═══ */}
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="w-full max-w-sm">

            {/* ══ In-App Browser ══ */}
            {deviceInfo.isInAppBrowser && (
              <div className="space-y-3">
                <div className="w-full text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 text-center"
                  style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)' }}>
                  <ExternalLink size={18} /> افتح الرابط في Safari أو Chrome أولًا
                </div>
                <div className="text-center" style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 14, border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="text-white text-sm font-black mb-1">من داخل المتصفح الحالي:</p>
                  <p className="text-slate-400 text-xs">اضغط ⋮ أو مشاركة ثم اختر <span className="text-white font-bold">فتح في المتصفح</span></p>
                </div>
              </div>
            )}

            {/* ══ iPhone ══ */}
            {!deviceInfo.isInAppBrowser && deviceInfo.isIOS && (
              <div className="space-y-3">
                <div className="text-center font-black text-white text-sm"
                  style={{ background: 'rgba(0,102,255,0.15)', borderRadius: 16, padding: '14px 16px', border: '1px solid rgba(0,102,255,0.3)' }}>
                  📱 لتثبيت التطبيق على iPhone
                </div>
                {[
                  { step: '1', title: 'افتح الرابط في Safari', desc: 'لو أنت داخل من أي تطبيق تاني' },
                  { step: '2', title: 'اضغط زر المشاركة ⬆️', desc: 'أسفل المتصفح' },
                  { step: '3', title: 'اختار Add to Home Screen', desc: 'إضافة للشاشة الرئيسية' },
                  { step: '4', title: 'اضغط Add', desc: 'وسيظهر التطبيق على الشاشة 🎉' },
                ].map((item) => (
                  <div key={item.step} className="flex items-center gap-3"
                    style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="font-black text-white flex items-center justify-center shrink-0"
                      style={{ width: 32, height: 32, borderRadius: 10, background: '#0066FF', fontSize: 14 }}>{item.step}</div>
                    <div className="text-right flex-1">
                      <div className="font-black text-white text-sm">{item.title}</div>
                      <div className="text-slate-400 text-xs">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ══ Android / Desktop ══ */}
            {!deviceInfo.isInAppBrowser && !deviceInfo.isIOS && (
              <div className="space-y-3">

                {/* ✅ زر التثبيت التلقائي */}
                {deferredPrompt && (
                  <motion.button
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    onClick={handleInstall}
                    disabled={installing}
                    className="w-full font-black flex items-center justify-center gap-3 active:scale-95 transition-all"
                    style={{
                      background: 'linear-gradient(135deg, #0066FF, #4D00FF)',
                      color: '#fff', padding: '18px 0', borderRadius: 22, fontSize: 16,
                      boxShadow: '0 8px 32px rgba(0,102,255,0.5)',
                    }}
                  >
                    <Download size={22} />
                    {installing ? 'جاري التثبيت...' : '📲 تثبيت التطبيق الآن'}
                  </motion.button>
                )}

                {/* ⏳ انتظار */}
                {!deferredPrompt && !showManualGuide && (
                  <div className="text-center">
                    <div className="w-full font-black flex items-center justify-center gap-3"
                      style={{ background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', padding: '18px 0', borderRadius: 22, fontSize: 14, border: '2px solid rgba(255,255,255,0.08)' }}>
                      <Smartphone size={20} />
                      جاري تحضير التثبيت... ({5 - waitingSeconds}ث)
                    </div>
                  </div>
                )}

                {/* ✅ الدليل اليدوي لأندرويد */}
                {showManualGuide && !deferredPrompt && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                    <div className="text-center font-black text-white text-sm"
                      style={{ background: 'rgba(0,102,255,0.15)', borderRadius: 16, padding: '14px 16px', border: '1px solid rgba(0,102,255,0.3)' }}>
                      📱 ثبّت التطبيق يدويًا
                    </div>
                    {[
                      { step: '1', title: 'تأكد إنك في Chrome', desc: 'مش واتساب أو فيسبوك' },
                      { step: '2', title: 'اضغط ⋮ أعلى المتصفح', desc: 'القائمة الثلاث نقاط' },
                      { step: '3', title: 'اختار Install app', desc: 'أو Add to Home screen' },
                      { step: '4', title: 'اضغط تثبيت ✅', desc: 'وسيظهر التطبيق على الشاشة' },
                    ].map((item) => (
                      <div key={item.step} className="flex items-center gap-3"
                        style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="font-black text-white flex items-center justify-center shrink-0"
                          style={{ width: 32, height: 32, borderRadius: 10, background: '#0066FF', fontSize: 14 }}>{item.step}</div>
                        <div className="text-right flex-1">
                          <div className="font-black text-white text-sm">{item.title}</div>
                          <div className="text-slate-400 text-xs">{item.desc}</div>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </div>
            )}

            {/* زر التخطي */}
            <button onClick={() => { window.location.href = SITE_URL; }}
              className="w-full mt-5 font-bold text-slate-500 text-xs active:scale-95 transition-all" style={{ padding: '14px 0' }}>
              تخطي واستخدام الموقع من المتصفح ←
            </button>
          </motion.div>

          {/* سهم لأسفل - iPhone */}
          {deviceInfo.isIOS && (
            <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="mt-6">
              <ChevronDown size={24} style={{ color: '#475569' }} />
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}