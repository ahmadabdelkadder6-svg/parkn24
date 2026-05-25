import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Smartphone } from 'lucide-react';

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
    // كشف iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;

    if (isIOSDevice && !isStandalone) {
      setIsIOS(true);
      // اعرض البانر بعد 3 ثواني
      const dismissed = localStorage.getItem('pwa-ios-dismissed');
      if (!dismissed) {
        setTimeout(() => setShowBanner(true), 3000);
      }
    }

    // Android / Chrome
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      const dismissed = localStorage.getItem('pwa-dismissed');
      if (!dismissed) {
        setTimeout(() => setShowBanner(true), 2000);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    // لو التطبيق اتثبت بالفعل
    window.addEventListener('appinstalled', () => {
      setShowBanner(false);
      setDeferredPrompt(null);
      console.log('✅ تم تثبيت التطبيق');
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('✅ المستخدم وافق على التثبيت');
    }
    setDeferredPrompt(null);
    setShowBanner(false);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem(isIOS ? 'pwa-ios-dismissed' : 'pwa-dismissed', 'true');
  };

  // لو التطبيق مثبت بالفعل
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true;
  if (isStandalone) return null;

  return (
    <>
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 25 }}
            className="fixed bottom-4 left-4 right-4 z-[100]"
          >
            <div className="bg-gradient-to-r from-blue-900 to-slate-900 border border-blue-500/30 rounded-2xl p-4 shadow-2xl shadow-blue-900/30">
              <button
                onClick={handleDismiss}
                className="absolute top-3 left-3 text-slate-500 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-3">
                <div className="bg-blue-600/30 p-3 rounded-xl border border-blue-500/20 shrink-0">
                  <Smartphone size={24} className="text-blue-400" />
                </div>
                <div className="flex-1 text-right">
                  <h4 className="text-sm font-black text-white mb-0.5">
                    ثبّت التطبيق على هاتفك 📱
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    أسرع - بدون متصفح - يعمل بدون نت
                  </p>
                </div>
              </div>

              {isIOS ? (
                <button
                  onClick={() => setShowIOSGuide(true)}
                  className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  <Download size={16} />
                  إزاي أثبّته؟
                </button>
              ) : (
                <button
                  onClick={handleInstall}
                  className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  <Download size={16} />
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
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 w-full max-w-sm shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-black text-white text-center mb-5">
                تثبيت على iPhone 📱
              </h3>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shrink-0">
                    1
                  </div>
                  <div className="text-right flex-1">
                    <p className="text-sm font-bold text-white">
                      اضغط على زرار المشاركة
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      الأيقونة المربعة مع السهم ⬆️ في أسفل Safari
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shrink-0">
                    2
                  </div>
                  <div className="text-right flex-1">
                    <p className="text-sm font-bold text-white">
                      اختار "إضافة للشاشة الرئيسية"
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Add to Home Screen ➕
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shrink-0">
                    3
                  </div>
                  <div className="text-right flex-1">
                    <p className="text-sm font-bold text-white">اضغط "إضافة"</p>
                    <p className="text-xs text-slate-400 mt-1">
                      وهيظهر التطبيق على الشاشة الرئيسية 🎉
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full mt-6 bg-slate-800 text-white py-3 rounded-xl font-black text-sm active:scale-95 transition-all"
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