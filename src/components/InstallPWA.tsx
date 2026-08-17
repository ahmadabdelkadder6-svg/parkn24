import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Smartphone } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
};

function isIOSDevice() {
  return (
    /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isAndroidDevice() {
  return /android/i.test(window.navigator.userAgent);
}

function isStandaloneMode() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function InstallPWA() {
  const [isAndroid, setIsAndroid] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  const [showBanner, setShowBanner] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const android = isAndroidDevice();
    const ios = isIOSDevice();
    const standalone = isStandaloneMode();

    setIsAndroid(android);
    setIsIOS(ios);
    setIsInstalled(standalone);

    if (standalone || (!android && !ios)) return;

    const dismissedKey = ios ? 'pwa-ios-dismissed' : 'pwa-android-dismissed';
    const dismissed = localStorage.getItem(dismissedKey);

    if (!dismissed) {
      const timer = setTimeout(() => {
        setShowBanner(true);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    const handleAppInstalled = () => {
      localStorage.setItem('pwaJustInstalled', 'true');
      setDeferredPrompt(null);
      setIsInstalled(true);
      setInstalling(false);
      setShowBanner(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleDismiss = () => {
    setShowBanner(false);
    const dismissedKey = isIOS ? 'pwa-ios-dismissed' : 'pwa-android-dismissed';
    localStorage.setItem(dismissedKey, 'true');
  };

  const installOnAndroid = async () => {
    if (!deferredPrompt) {
      alert(
        'إذا لم يظهر زر التثبيت تلقائيًا:\n\n' +
        '1) افتح الموقع من Chrome\n' +
        '2) اضغط ⋮ الثلاث نقاط\n' +
        '3) اختر "تثبيت التطبيق" أو "Add to Home screen"'
      );
      return;
    }

    setInstalling(true);

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;

      if (choice.outcome === 'accepted') {
        localStorage.setItem('pwaJustInstalled', 'true');
      }
    } catch (error) {
      console.error('Install failed:', error);
    } finally {
      setDeferredPrompt(null);
      setInstalling(false);
    }
  };

  if (isInstalled || (!isAndroid && !isIOS)) return null;

  return (
    <>
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 120, opacity: 0 }}
            transition={{ type: 'spring', damping: 24 }}
            className="fixed bottom-4 left-4 right-4 z-[10000] mx-auto max-w-md"
          >
            <div
              className="relative rounded-3xl p-4 shadow-2xl"
              style={{
                background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <button
                type="button"
                onClick={handleDismiss}
                className="absolute top-3 left-3 rounded-full p-1 text-slate-400 transition hover:text-white"
                aria-label="إغلاق"
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-3 mb-3">
                <div
                  className="shrink-0 rounded-2xl p-3"
                  style={{
                    background: 'rgba(59,130,246,0.16)',
                    border: '1px solid rgba(59,130,246,0.22)',
                  }}
                >
                  <Smartphone size={22} className="text-blue-400" />
                </div>

                <div className="flex-1 text-right">
                  <h4 className="text-sm font-black text-white mb-0.5">
                    ثبّت التطبيق على هاتفك 📱
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    أسرع وأسهل من استخدام المتصفح
                  </p>
                </div>
              </div>

              {isAndroid && (
                <>
                  <button
                    type="button"
                    onClick={installOnAndroid}
                    disabled={installing}
                    className="w-full rounded-2xl px-5 py-4 text-sm font-black text-white transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
                    style={{
                      background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                    }}
                    aria-label="تثبيت تطبيق Parkn24"
                  >
                    <span className="inline-flex items-center justify-center gap-2">
                      <Download size={18} />
                      {installing
                        ? 'جاري التثبيت...'
                        : deferredPrompt
                          ? 'تثبيت تطبيق Parkn24'
                          : 'تثبيت التطبيق / عرض التعليمات'}
                    </span>
                  </button>

                  {!deferredPrompt && (
                    <p className="mt-3 text-center text-[11px] text-slate-400 leading-6">
                      لو لم يظهر زر التثبيت تلقائيًا:
                      <br />
                      افتح الموقع من <span className="font-black text-white">Chrome</span> ثم اضغط
                      <span className="font-black text-white"> ⋮ </span>
                      واختر
                      <span className="font-black text-white"> تثبيت التطبيق </span>
                      أو
                      <span className="font-black text-white"> Add to Home screen</span>
                    </p>
                  )}
                </>
              )}

              {isIOS && (
                <button
                  type="button"
                  onClick={() => setShowIOSHelp(true)}
                  className="w-full rounded-2xl px-5 py-4 text-sm font-black text-white transition active:scale-[0.98]"
                  style={{
                    background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                  }}
                  aria-label="شرح تثبيت Parkn24 على الآيفون"
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <Download size={18} />
                    تثبيت Parkn24 على الآيفون
                  </span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showIOSHelp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10001] flex items-end justify-center bg-black/55 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            onClick={() => setShowIOSHelp(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="w-full max-w-md rounded-[2rem] bg-white p-6 text-right text-slate-900 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 id="ios-install-title" className="text-lg font-black">
                  تثبيت Parkn24 على الآيفون
                </h2>
                <button
                  type="button"
                  onClick={() => setShowIOSHelp(false)}
                  className="rounded-full px-3 py-1 text-xl text-slate-500"
                  aria-label="إغلاق"
                >
                  ×
                </button>
              </div>

              <p className="mb-4 text-sm leading-7 text-slate-600">
                افتح الموقع من متصفح Safari ثم اتبع الخطوات التالية:
              </p>

              <ol className="space-y-3 text-sm font-bold leading-7 text-slate-800">
                <li>١. اضغط زر المشاركة الموجود أسفل الشاشة.</li>
                <li>٢. اختر «إضافة إلى الشاشة الرئيسية».</li>
                <li>٣. اضغط «إضافة».</li>
                <li>٤. ستظهر أيقونة Parkn24 بين تطبيقاتك.</li>
              </ol>

              <p className="mt-4 rounded-2xl bg-blue-50 p-3 text-xs leading-6 text-blue-800">
                إذا لم تجد الخيار، تأكد أنك تستخدم Safari وليس متصفحًا آخر.
              </p>

              <button
                type="button"
                onClick={() => setShowIOSHelp(false)}
                className="mt-5 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white"
              >
                فهمت
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}