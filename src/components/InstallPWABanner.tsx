import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Smartphone, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const detectBrowser = () => {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
  const isInAppBrowser =
    /FBAN|FBAV|Instagram|Twitter|Line|WhatsApp|Telegram/.test(ua) ||
    (/iPhone|iPad/.test(ua) &&
      !isSafari &&
      !/Chrome/.test(ua) &&
      !/CriOS/.test(ua) &&
      !/GSA/.test(ua));

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;

  return { isIOS, isAndroid, isSafari, isInAppBrowser, isStandalone };
};

export default function InstallPWABanner() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showManualSteps, setShowManualSteps] = useState(false);
  const [showInAppWarning, setShowInAppWarning] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const browser = detectBrowser();

    if (browser.isStandalone) {
      setIsInstalled(true);
      return;
    }

    setIsIOS(browser.isIOS);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);

    const installedHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      console.log('✅ تم تثبيت التطبيق');
    };

    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  if (isInstalled) return null;

  const handleInstallClick = async () => {
    const browser = detectBrowser();

    if (browser.isInAppBrowser) {
      setShowInAppWarning(true);
      return;
    }

    if (browser.isIOS) {
      setShowManualSteps(true);
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      setShowManualSteps(true);
    }
  };

  return (
    <>
      {/* ─── البنر الثابت في الداشبورد ─── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 bg-gradient-to-l from-blue-600/20 to-slate-900 border-2 border-blue-500/40 rounded-2xl p-4 relative overflow-hidden"
      >
        {/* خلفية متحركة */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500 rounded-full animate-pulse" />
          <div className="absolute -left-4 -bottom-4 w-20 h-20 bg-cyan-500 rounded-full animate-pulse delay-700" />
        </div>

        <div className="relative z-10">
          {/* العنوان */}
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-blue-600/30 p-3 rounded-xl border border-blue-500/20 shrink-0">
              <Smartphone size={24} className="text-blue-400" />
            </div>
            <div className="flex-1 text-right">
              <h4 className="text-sm font-black text-white mb-0.5">
                📲 ثبّت التطبيق على جهازك
              </h4>
              <p className="text-[10px] text-slate-400">
                أسرع - بدون متصفح - تنبيهات أفضل
              </p>
            </div>
          </div>

          {/* المميزات */}
          <div className="bg-slate-950/50 rounded-xl p-2.5 mb-3 space-y-1.5">
            {[
              { icon: '🔔', text: 'تنبيهات أسرع وأكثر ثباتًا' },
              { icon: '🚗', text: 'فتح مباشر بدون متصفح' },
              { icon: '⚡', text: 'تجربة أسرع من الموقع العادي' },
            ].map((item) => (
              <div
                key={item.text}
                className="flex items-center gap-2 justify-end"
              >
                <span className="text-[10px] text-slate-300 font-bold">
                  {item.text}
                </span>
                <span className="text-sm">{item.icon}</span>
              </div>
            ))}
          </div>

          {/* زر التثبيت */}
          <button
            onClick={handleInstallClick}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-900/30"
          >
            <Download size={18} />
            {deferredPrompt && !isIOS ? 'تثبيت التطبيق الآن' : 'طريقة التثبيت'}
          </button>

          {/* تحذير */}
          <div className="mt-2.5 bg-amber-600/10 border border-amber-500/20 rounded-lg p-2 text-center">
            <p className="text-[9px] text-amber-400 font-bold">
              ⚠️ أفضل تجربة بعد فتحه من الأيقونة على الشاشة الرئيسية
            </p>
          </div>
        </div>
      </motion.div>

      {/* ─── مودال التعليمات اليدوية ─── */}
      <AnimatePresence>
        {showManualSteps && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center p-4"
            onClick={() => setShowManualSteps(false)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', damping: 25 }}
              className="bg-slate-900 border border-slate-800 rounded-t-[2.5rem] rounded-b-2xl p-6 w-full max-w-sm shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Handle */}
              <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-5" />

              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <button
                  onClick={() => setShowManualSteps(false)}
                  className="bg-slate-800 p-2 rounded-xl active:scale-90 transition-all"
                >
                  <X size={16} className="text-slate-400" />
                </button>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  📲 طريقة تثبيت التطبيق
                </h3>
              </div>

              {/* iPhone */}
              {isIOS ? (
                <div className="space-y-4">
                  {[
                    {
                      step: '1',
                      title: 'افتح الموقع في Safari',
                      desc: 'لو فاتح من واتساب أو تيليجرام انسخ الرابط وافتحه في Safari',
                      icon: <Share size={18} />,
                      color: 'bg-blue-600',
                    },
                    {
                      step: '2',
                      title: 'اضغط زر المشاركة',
                      desc: 'المربع مع السهم ⬆️ أسفل Safari',
                      icon: '⬆️',
                      color: 'bg-emerald-600',
                    },
                    {
                      step: '3',
                      title: 'اختار "إضافة للشاشة الرئيسية"',
                      desc: 'Add to Home Screen',
                      icon: '➕',
                      color: 'bg-purple-600',
                    },
                  ].map((item) => (
                    <div
                      key={item.step}
                      className="flex items-center gap-3 bg-slate-800/50 rounded-xl p-3.5 border border-slate-700/50"
                    >
                      <div
                        className={`${item.color} w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0 shadow-lg`}
                      >
                        {item.step}
                      </div>
                      <div className="text-right flex-1">
                        <p className="text-sm font-black text-white mb-0.5">
                          {item.title}
                        </p>
                        <p className="text-[10px] text-slate-400">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                // Android fallback
                <div className="space-y-4">
                  {[
                    {
                      step: '1',
                      title: 'افتح القائمة',
                      desc: 'اضغط ⋮ أعلى يمين Chrome',
                    },
                    {
                      step: '2',
                      title: 'اختار Add to Home Screen',
                      desc: 'أو Install App',
                    },
                    {
                      step: '3',
                      title: 'اضغط تثبيت',
                      desc: 'وسيظهر التطبيق على الشاشة الرئيسية',
                    },
                  ].map((item) => (
                    <div
                      key={item.step}
                      className="flex items-center gap-3 bg-slate-800/50 rounded-xl p-3.5 border border-slate-700/50"
                    >
                      <div className="bg-blue-600 w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0 shadow-lg">
                        {item.step}
                      </div>
                      <div className="text-right flex-1">
                        <p className="text-sm font-black text-white mb-0.5">
                          {item.title}
                        </p>
                        <p className="text-[10px] text-slate-400">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* إغلاق */}
              <button
                onClick={() => setShowManualSteps(false)}
                className="w-full mt-6 bg-slate-800 text-white py-3.5 rounded-xl font-black text-sm active:scale-95 transition-all"
              >
                فهمت ✅
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── تحذير المتصفح الداخلي ─── */}
      <AnimatePresence>
        {showInAppWarning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowInAppWarning(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 w-full max-w-sm shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-black text-white text-center mb-4">
                افتح في المتصفح أولًا 🌐
              </h3>

              <div className="bg-amber-600/10 border border-amber-500/20 rounded-xl p-4 text-center mb-4">
                <p className="text-sm text-amber-400 font-black mb-1">
                  انت فاتح اللينك من متصفح داخلي
                </p>
                <p className="text-[10px] text-amber-300">
                  (واتساب / تيليجرام / إنستجرام / فيسبوك)
                </p>
              </div>

              <div className="space-y-3 text-right text-sm text-slate-300">
                {isIOS ? (
                  <>
                    <p>1. اضغط مشاركة</p>
                    <p>2. اختار "Open in Safari"</p>
                    <p>3. بعدها هتقدر تثبّت التطبيق</p>
                  </>
                ) : (
                  <>
                    <p>1. افتح القائمة ⋮</p>
                    <p>2. اختار "Open in Chrome"</p>
                    <p>3. بعدها هتقدر تثبّت التطبيق</p>
                  </>
                )}
              </div>

              <button
                onClick={() => setShowInAppWarning(false)}
                className="w-full mt-6 bg-blue-600 text-white py-3.5 rounded-xl font-black text-sm active:scale-95 transition-all"
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