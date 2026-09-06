import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Download, Smartphone, ChevronDown, ExternalLink, Globe, ArrowLeft } from 'lucide-react';

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

  // ✅ لو مثبت بالفعل → فتح الصفحة الرئيسية
  useEffect(() => {
    if (deviceInfo.isStandalone) {
      window.location.href = SITE_URL;
    }
  }, [deviceInfo.isStandalone]);

  // ✅ الاستماع لطلب التثبيت
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

  // ✅ عدّاد الانتظار مع إظهار الدليل اليدوي
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
      className="min-h-screen flex flex-col items-center justify-center px-6 py-10"
      style={{ background: 'linear-gradient(180deg, #0A1628 0%, #0D2137 50%, #0A1628 100%)' }}
    >
      {installed ? (
        <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center text-white">
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
          <h2 className="font-black text-2xl mb-2">تم التثبيت بنجاح</h2>
          <p className="text-slate-400 text-sm">جاري فتح التطبيق...</p>
        </motion.div>
      ) : (
        <>
          {/* اللوجو */}
          <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mb-5">
            <img src="/images/logo.png" alt="بركن" className="w-24 h-24 object-contain mx-auto"
              style={{ borderRadius: 28, boxShadow: '0 8px 40px rgba(0,102,255,0.4)', border: '3px solid rgba(0,102,255,0.3)' }} />
          </motion.div>

          {/* العنوان */}
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="text-center mb-5">
            <h1 className="font-black text-white text-2xl mb-1.5">بركن 24</h1>
            <p className="text-slate-400 text-xs font-bold">
              {deviceInfo.isInAppBrowser ? 'افتح الرابط في Safari أو Chrome' :
               deviceInfo.isIOS ? 'ثبّت التطبيق بسهولة على هاتفك' :
               'تثبيت سريع وتشغيل فوري'}
            </p>
          </motion.div>

          {/* المميزات */}
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="w-full max-w-sm space-y-2 mb-5">
            {[
              { icon: '🚗', text: 'احجز مكان ركن فورًا' },
              { icon: '📍', text: 'اعرف أقرب جراج ليك' },
              { icon: '⏱️', text: 'تابع جلسة الركن بسهولة' },
              { icon: '💳', text: 'وصول أسرع بدون انتظار' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 justify-end"
                style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: '9px 14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="font-bold text-white text-xs">{item.text}</span>
                <span style={{ fontSize: 18 }}>{item.icon}</span>
              </div>
            ))}
          </motion.div>

          {/* ═══ أزرار التثبيت ═══ */}
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="w-full max-w-sm space-y-4">

            {/* In-App Browser */}
            {deviceInfo.isInAppBrowser && (
              <div className="space-y-3">
                <div className="w-full text-white py-3.5 rounded-2xl font-black text-xs flex items-center justify-center gap-2 text-center shadow-lg"
                  style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)' }}>
                  <ExternalLink size={16} /> افتح الرابط في Safari أو Chrome أولًا
                </div>
                <div className="text-center" style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="text-white text-xs font-black mb-1">من داخل المتصفح الحالي:</p>
                  <p className="text-slate-400 text-[11px]">اضغط ⋮ أو مشاركة ثم اختر <span className="text-white font-bold">فتح في المتصفح</span></p>
                </div>
              </div>
            )}

            {/* iPhone Guide */}
            {!deviceInfo.isInAppBrowser && deviceInfo.isIOS && (
              <div className="space-y-2.5">
                <div className="text-center font-black text-white text-xs"
                  style={{ background: 'rgba(0,102,255,0.15)', borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(0,102,255,0.3)' }}>
                  📱 خطوات تثبيت التطبيق على iPhone
                </div>
                {[
                  { step: '1', title: 'افتح الرابط في Safari', desc: 'لو أنت داخل من أي تطبيق آخر' },
                  { step: '2', title: 'اضغط زر المشاركة ⬆️', desc: 'أسفل الشاشة في المتصفح' },
                  { step: '3', title: 'اختر Add to Home Screen', desc: 'إضافة إلى الشاشة الرئيسية' },
                  { step: '4', title: 'اضغط Add (إضافة)', desc: 'وسيظهر التطبيق على شاشتك 🎉' },
                ].map((item) => (
                  <div key={item.step} className="flex items-center gap-3"
                    style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="font-black text-white flex items-center justify-center shrink-0"
                      style={{ width: 28, height: 28, borderRadius: 8, background: '#0066FF', fontSize: 13 }}>{item.step}</div>
                    <div className="text-right flex-1">
                      <div className="font-black text-white text-xs">{item.title}</div>
                      <div className="text-slate-400 text-[10px]">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Android / Desktop */}
            {!deviceInfo.isInAppBrowser && !deviceInfo.isIOS && (
              <div className="space-y-3">
                {deferredPrompt && (
                  <motion.button
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    onClick={handleInstall}
                    disabled={installing}
                    className="w-full font-black flex items-center justify-center gap-2.5 active:scale-95 transition-all shadow-xl"
                    style={{
                      background: 'linear-gradient(135deg, #0066FF, #4D00FF)',
                      color: '#fff', padding: '16px 0', borderRadius: 20, fontSize: 15,
                      boxShadow: '0 8px 30px rgba(0,102,255,0.4)',
                    }}
                  >
                    <Download size={20} />
                    {installing ? 'جاري التثبيت...' : '📲 تثبيت التطبيق الآن'}
                  </motion.button>
                )}

                {!deferredPrompt && !showManualGuide && (
                  <div className="text-center">
                    <div className="w-full font-bold flex items-center justify-center gap-2"
                      style={{ background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', padding: '14px 0', borderRadius: 18, fontSize: 13, border: '1.5px solid rgba(255,255,255,0.08)' }}>
                      <Smartphone size={18} />
                      جاري فحص إمكانية التثبيت... ({5 - waitingSeconds}ث)
                    </div>
                  </div>
                )}

                {showManualGuide && !deferredPrompt && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                    <div className="text-center font-black text-white text-xs"
                      style={{ background: 'rgba(0,102,255,0.15)', borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(0,102,255,0.3)' }}>
                      📱 خطوات التثبيت اليدوي على أندرويد
                    </div>
                    {[
                      { step: '1', title: 'تأكد أنك داخل متصفح Chrome', desc: 'وليس داخل تطبيق آخر' },
                      { step: '2', title: 'اضغط قائمة الثلاث نقاط ⋮', desc: 'أعلى يسار/يمين الشاشة' },
                      { step: '3', title: 'اختر Install app أو Add to Home', desc: 'تثبيت التطبيق أو إضافة للشاشة' },
                      { step: '4', title: 'اضغط تثبيت ✅', desc: 'وسيتم تحميله فوراً على هاتفك' },
                    ].map((item) => (
                      <div key={item.step} className="flex items-center gap-3"
                        style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="font-black text-white flex items-center justify-center shrink-0"
                          style={{ width: 28, height: 28, borderRadius: 8, background: '#0066FF', fontSize: 13 }}>{item.step}</div>
                        <div className="text-right flex-1">
                          <div className="font-black text-white text-xs">{item.title}</div>
                          <div className="text-slate-400 text-[10px]">{item.desc}</div>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </div>
            )}

            {/* 🚀 البلوك الأبيض المتناسق رأسياً في المنتصف 🚀 */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.35 }}
              className="pt-2 w-full"
            >
              <button
                onClick={() => { window.location.href = SITE_URL; }}
                className="w-full py-4 px-4 rounded-2xl active:scale-[0.98] transition-all flex flex-col items-center justify-center text-center shadow-2xl cursor-pointer"
                style={{
                  background: '#ffffff',
                  color: '#0A1628',
                  boxShadow: '0 10px 30px rgba(255, 255, 255, 0.2), 0 4px 12px rgba(0, 0, 0, 0.35)',
                  border: '2px solid #E2E8F0',
                }}
              >
                {/* السطر الأول: العنوان مع أيقونة الكرة الأرضية */}
                <div className="flex items-center justify-center gap-2 text-slate-900 mb-1">
                  <Globe size={18} className="text-blue-600 shrink-0" />
                  <span className="text-sm font-black" style={{ fontWeight: 950, fontSize: '15px' }}>
                    تخطي والفتح من المتصفح مباشرة
                  </span>
                </div>

                {/* السطر الثاني: التوضيح مع سهم الدخول */}
                <div className="text-[11px] font-bold text-slate-500 flex items-center justify-center gap-1.5">
                  <span>استخدم كافة مميزات التطبيق وحجز الركنة الآن</span>
                  <ArrowLeft size={13} className="text-blue-600" />
                </div>
              </button>
            </motion.div>
          </motion.div>

          {/* سهم تلميح - iPhone */}
          {deviceInfo.isIOS && (
            <motion.div animate={{ y: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.8 }} className="mt-4">
              <ChevronDown size={22} style={{ color: '#64748b' }} />
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}