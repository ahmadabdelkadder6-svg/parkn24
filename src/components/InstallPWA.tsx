import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Smartphone, Sparkles } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isIOSDevice && !isStandalone) {
      setIsIOS(true);
      const dismissed = localStorage.getItem('pwa-ios-dismissed');
      if (!dismissed) {
        setTimeout(() => setShowBanner(true), 2500);
      }
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      const dismissed = localStorage.getItem('pwa-dismissed');
      if (!dismissed) {
        setTimeout(() => setShowBanner(true), 1500);
      }
    };

    const handleInstalled = () => {
      setShowBanner(false);
      setDeferredPrompt(null);
      console.log('✅ تم تثبيت التطبيق');
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('✅ المستخدم وافق على التثبيت');
      }
    } catch (error) {
      console.error('❌ فشل التثبيت:', error);
    } finally {
      setDeferredPrompt(null);
      setShowBanner(false);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem(isIOS ? 'pwa-ios-dismissed' : 'pwa-dismissed', 'true');
  };

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;

  if (isStandalone) return null;

  return (
    <>
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 120, opacity: 0 }}
            transition={{ type: 'spring', damping: 24 }}
            className="fixed bottom-4 left-4 right-4 z-[100]"
          >
            <div
              className="relative overflow-hidden rounded-[28px] p-5 shadow-2xl"
              style={{
                background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 55%, #2563EB 100%)',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 18px 50px rgba(15,23,42,0.45)',
              }}
            >
              {/* glow */}
              <div
                style={{
                  position: 'absolute',
                  top: -40,
                  right: -40,
                  width: 120,
                  height: 120,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.08)',
                  filter: 'blur(8px)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: -30,
                  left: -20,
                  width: 90,
                  height: 90,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.06)',
                  filter: 'blur(6px)',
                }}
              />

              <button
                onClick={handleDismiss}
                className="absolute top-3 left-3 rounded-full p-1 text-white/70 hover:text-white transition-colors"
                aria-label="إغلاق"
                style={{ background: 'rgba(255,255,255,0.08)' }}
              >
                <X size={16} />
              </button>

              <div className="relative z-10 flex items-start gap-4">
                <div
                  className="shrink-0 rounded-2xl p-3"
                  style={{
                    background: 'rgba(255,255,255,0.12)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <Smartphone size={24} className="text-white" />
                </div>

                <div className="flex-1 text-right">
                  <div className="flex items-center justify-end gap-1 mb-1">
                    <Sparkles size={14} style={{ color: '#FDE68A' }} />
                    <span
                      className="font-black"
                      style={{
                        color: '#FDE68A',
                        fontSize: 11,
                        letterSpacing: 0.3,
                      }}
                    >
                      تجربة أفضل
                    </span>
                  </div>

                  <h4
                    className="font-black"
                    style={{
                      color: '#ffffff',
                      fontSize: 19,
                      lineHeight: 1.45,
                      marginBottom: 6,
                    }}
                  >
                    ثبّت التطبيق على هاتفك الآن
                  </h4>

                  <p
                    style={{
                      color: 'rgba(255,255,255,0.94)',
                      fontSize: 13,
                      lineHeight: 1.8,
                      fontWeight: 800,
                    }}
                  >
                    وصول أسرع — فتح مباشر — استخدام مريح مثل التطبيقات الحقيقية
                  </p>

                  <p
                    style={{
                      color: 'rgba(255,255,255,0.75)',
                      fontSize: 11,
                      marginTop: 6,
                      lineHeight: 1.7,
                    }}
                  >
                    {isIOS
                      ? 'ثبّت التطبيق بسهولة من Safari على الشاشة الرئيسية'
                      : 'ثبّت التطبيق واستخدمه مباشرة من شاشة هاتفك'}
                  </p>
                </div>
              </div>

              {isIOS ? (
                <button
                  onClick={() => setShowIOSGuide(true)}
                  className="relative z-10 w-full mt-4 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
                  style={{
                    background: '#ffffff',
                    color: '#0F172A',
                    boxShadow: '0 8px 24px rgba(255,255,255,0.2)',
                  }}
                >
                  <Download size={17} />
                  عرض خطوات التثبيت
                </button>
              ) : (
                <button
                  onClick={handleInstall}
                  className="relative z-10 w-full mt-4 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
                  style={{
                    background: '#ffffff',
                    color: '#0F172A',
                    boxShadow: '0 8px 24px rgba(255,255,255,0.2)',
                  }}
                >
                  <Download size={17} />
                  تثبيت التطبيق الآن
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS Guide Modal */}
      <AnimatePresence>
        {showIOSGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[101] flex items-center justify-center p-4"
            onClick={() => setShowIOSGuide(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="bg-slate-900 border border-slate-700 rounded-[2rem] p-6 w-full max-w-sm shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3
                className="text-center mb-5"
                style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}
              >
                تثبيت التطبيق على iPhone
              </h3>

              <div className="space-y-4">
                {[
                  {
                    step: '1',
                    title: 'اضغط على زر المشاركة',
                    desc: 'الأيقونة المربعة مع السهم ⬆️ في أسفل Safari',
                  },
                  {
                    step: '2',
                    title: 'اختر "إضافة للشاشة الرئيسية"',
                    desc: 'Add to Home Screen',
                  },
                  {
                    step: '3',
                    title: 'اضغط "إضافة"',
                    desc: 'وسيظهر التطبيق على الشاشة الرئيسية',
                  },
                ].map((item) => (
                  <div key={item.step} className="flex items-start gap-3">
                    <div
                      className="text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shrink-0"
                      style={{ background: '#2563EB' }}
                    >
                      {item.step}
                    </div>
                    <div className="text-right flex-1">
                      <p className="text-sm font-black text-white">
                        {item.title}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="mt-5 rounded-2xl p-3"
                style={{
                  background: 'rgba(37,99,235,0.12)',
                  border: '1px solid rgba(37,99,235,0.22)',
                }}
              >
                <p className="text-xs leading-6" style={{ color: '#BFDBFE' }}>
                  لو الخيار مش ظاهر، تأكد إنك فاتح الموقع من Safari وليس من تطبيق آخر.
                </p>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full mt-5 py-3 rounded-xl font-black text-sm active:scale-95 transition-all"
                style={{ background: '#1E293B', color: '#fff' }}
              >
                فهمت ✅
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}