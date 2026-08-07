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
  const isSafari =
    /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
  const isChrome = /Chrome/.test(ua) && !/Edg/.test(ua);
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

  return {
    isIOS,
    isAndroid,
    isSafari,
    isChrome,
    isInAppBrowser,
    isStandalone,
  };
};

export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showEntryBanner, setShowEntryBanner] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showAndroidGuide, setShowAndroidGuide] = useState(false);
  const [showInAppWarning, setShowInAppWarning] = useState(false);
  const [browser, setBrowser] = useState({
    isIOS: false,
    isAndroid: false,
    isSafari: false,
    isChrome: false,
    isInAppBrowser: false,
    isStandalone: false,
  });

  useEffect(() => {
    const b = detectBrowser();
    setBrowser(b);

    if (b.isStandalone) return;

    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (!dismissed) {
      // ✅ يظهر فور الدخول تقريبًا
      setTimeout(() => setShowEntryBanner(true), 1200);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      console.log('✅ beforeinstallprompt FIRED');
    };

    const installedHandler = () => {
      localStorage.setItem('pwaJustInstalled', 'true');
      localStorage.setItem('pwa-install-dismissed', 'true');
      setShowEntryBanner(false);
      setDeferredPrompt(null);
      alert('✅ تم تثبيت التطبيق بنجاح\nافتحه من الأيقونة الجديدة على الشاشة الرئيسية');
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const handleDismiss = () => {
    setShowEntryBanner(false);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  const handleInstall = async () => {
    // لو داخل من واتساب/متصفح داخلي
    if (browser.isInAppBrowser) {
      setShowInAppWarning(true);
      return;
    }

    // iPhone
    if (browser.isIOS) {
      setShowIOSGuide(true);
      return;
    }

    // Android + Chrome + prompt available
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log('Install outcome:', outcome);

        if (outcome === 'accepted') {
          localStorage.setItem('pwaJustInstalled', 'true');
          localStorage.setItem('pwa-install-dismissed', 'true');
          setShowEntryBanner(false);
        }

        setDeferredPrompt(null);
      } catch (err) {
        console.error('❌ install error:', err);
        setShowAndroidGuide(true);
      }
      return;
    }

    // Android but no prompt
    if (browser.isAndroid) {
      setShowAndroidGuide(true);
      return;
    }

    // أي جهاز آخر
    setShowAndroidGuide(true);
  };

  if (browser.isStandalone) return null;

  const canDirectInstall =
    browser.isAndroid && browser.isChrome && !!deferredPrompt && !browser.isInAppBrowser;

  return (
    <>
      {/* ✅ بانر/شاشة أولية تظهر فور الدخول */}
      <AnimatePresence>
        {showEntryBanner && (
          <motion.div
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ type: 'spring', damping: 24 }}
            className="fixed bottom-4 left-4 right-4 z-[9999]"
          >
            <div
              className="relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #0066FF 0%, #4D00FF 100%)',
                borderRadius: 24,
                padding: '18px 18px 16px',
                color: '#fff',
                boxShadow: '0 16px 40px rgba(0,102,255,0.35)',
              }}
            >
              <button
                onClick={handleDismiss}
                style={{
                  position: 'absolute',
                  top: 12,
                  left: 12,
                  background: 'rgba(255,255,255,0.16)',
                  border: 'none',
                  width: 30,
                  height: 30,
                  borderRadius: 10,
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-3 mb-3">
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    background: 'rgba(255,255,255,0.16)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Smartphone size={24} />
                </div>

                <div className="text-right flex-1">
                  <div className="font-black" style={{ fontSize: 15 }}>
                    ثبّت التطبيق على جهازك 📱
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                    أسرع - أسهل - أفضل من المتصفح
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(255,255,255,0.10)',
                  borderRadius: 16,
                  padding: '10px 12px',
                  marginBottom: 12,
                }}
              >
                <div className="text-right" style={{ fontSize: 11, lineHeight: 1.8 }}>
                  <div>⚡ فتح أسرع</div>
                  <div>🔔 إشعارات أفضل</div>
                  <div>📲 أيقونة مباشرة على الشاشة</div>
                </div>
              </div>

              <button
                onClick={handleInstall}
                className="w-full font-black active:scale-95 transition-all"
                style={{
                  background: canDirectInstall
                    ? 'linear-gradient(135deg, #00CC66, #00AA55)'
                    : '#ffffff',
                  color: canDirectInstall ? '#fff' : '#0066FF',
                  padding: 16,
                  borderRadius: 18,
                  border: 'none',
                  fontSize: 15,
                  boxShadow: canDirectInstall
                    ? '0 10px 24px rgba(0,204,102,0.30)'
                    : '0 8px 20px rgba(255,255,255,0.25)',
                  width: '100%',
                  cursor: 'pointer',
                }}
              >
                <div className="flex items-center justify-center gap-2">
                  <Download size={18} />
                  {canDirectInstall
                    ? 'تثبيت التطبيق الآن'
                    : browser.isIOS
                    ? 'شرح التثبيت على iPhone'
                    : browser.isInAppBrowser
                    ? 'افتح في المتصفح أولًا'
                    : 'طريقة التثبيت'}
                </div>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ✅ شرح iPhone */}
      <AnimatePresence>
        {showIOSGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[10000] flex items-end justify-center"
            onClick={() => setShowIOSGuide(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-md"
              style={{
                background: '#fff',
                borderRadius: '32px 32px 0 0',
                padding: 28,
                paddingBottom: 40,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ width: 40, height: 4, borderRadius: 4, background: '#D0DCFF', margin: '0 auto 20px' }} />

              <h3 className="font-black text-center mb-5" style={{ fontSize: 20, color: '#0A1628' }}>
                تثبيت على iPhone 📱
              </h3>

              {browser.isInAppBrowser && (
                <div style={{ background: '#FFF3E0', border: '2px solid #FFD180', borderRadius: 16, padding: 12, textAlign: 'center', marginBottom: 16 }}>
                  <p className="font-black" style={{ fontSize: 12, color: '#E65100' }}>
                    افتح الرابط في Safari أولًا
                  </p>
                </div>
              )}

              <div className="space-y-4 mb-6">
                {[
                  { n: 1, title: 'اضغط زر المشاركة', sub: 'الأيقونة ⬆️ في Safari' },
                  { n: 2, title: 'اختار Add to Home Screen', sub: 'أو إضافة للشاشة الرئيسية' },
                  { n: 3, title: 'اضغط Add', sub: 'وسيظهر التطبيق على الشاشة الرئيسية' },
                ].map((s) => (
                  <div key={s.n} className="flex items-center gap-4">
                    <div style={{ width: 42, height: 42, borderRadius: 14, background: 'linear-gradient(135deg,#0066FF,#4D00FF)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>
                      {s.n}
                    </div>
                    <div className="text-right flex-1">
                      <div className="font-black" style={{ fontSize: 14, color: '#0A1628' }}>{s.title}</div>
                      <div style={{ fontSize: 11, color: '#7B8CA6', marginTop: 2 }}>{s.sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full font-black active:scale-95"
                style={{
                  background: 'linear-gradient(135deg,#0066FF,#4D00FF)',
                  color: '#fff',
                  padding: 16,
                  borderRadius: 18,
                  border: 'none',
                  fontSize: 15,
                }}
              >
                فهمت ✅
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ✅ شرح Android */}
      <AnimatePresence>
        {showAndroidGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[10000] flex items-end justify-center"
            onClick={() => setShowAndroidGuide(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-md"
              style={{
                background: '#fff',
                borderRadius: '32px 32px 0 0',
                padding: 28,
                paddingBottom: 40,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ width: 40, height: 4, borderRadius: 4, background: '#D0DCFF', margin: '0 auto 20px' }} />

              <h3 className="font-black text-center mb-5" style={{ fontSize: 20, color: '#0A1628' }}>
                طريقة التثبيت على Android 📲
              </h3>

              <div className="space-y-4 mb-6">
                {[
                  { n: 1, title: 'افتح قائمة Chrome', sub: 'اضغط ⋮ أعلى اليمين' },
                  { n: 2, title: 'اختار Add to Home Screen', sub: 'أو Install App' },
                  { n: 3, title: 'اضغط تثبيت', sub: 'وسيظهر التطبيق على الشاشة الرئيسية' },
                ].map((s) => (
                  <div key={s.n} className="flex items-center gap-4">
                    <div style={{ width: 42, height: 42, borderRadius: 14, background: s.n === 1 ? '#0066FF' : s.n === 2 ? '#00CC66' : '#7C3AED', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>
                      {s.n}
                    </div>
                    <div className="text-right flex-1">
                      <div className="font-black" style={{ fontSize: 14, color: '#0A1628' }}>{s.title}</div>
                      <div style={{ fontSize: 11, color: '#7B8CA6', marginTop: 2 }}>{s.sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setShowAndroidGuide(false)}
                className="w-full font-black active:scale-95"
                style={{
                  background: 'linear-gradient(135deg,#0066FF,#4D00FF)',
                  color: '#fff',
                  padding: 16,
                  borderRadius: 18,
                  border: 'none',
                  fontSize: 15,
                }}
              >
                فهمت ✅
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ✅ تحذير المتصفح الداخلي */}
      <AnimatePresence>
        {showInAppWarning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[10000] flex items-center justify-center p-6"
            onClick={() => setShowInAppWarning(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="w-full max-w-sm text-center"
              style={{
                background: '#fff',
                borderRadius: 32,
                padding: 28,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontSize: 48, marginBottom: 14 }}>⚠️</div>
              <h3 className="font-black mb-3" style={{ fontSize: 20, color: '#0A1628' }}>
                افتح في المتصفح أولًا
              </h3>
              <p style={{ fontSize: 13, color: '#7B8CA6', lineHeight: 1.7, marginBottom: 20 }}>
                للتثبيت لازم تفتح الرابط في:
                <br />
                <strong style={{ color: '#0066FF' }}>Safari</strong> على iPhone
                <br />
                <strong style={{ color: '#00AA44' }}>Chrome</strong> على Android
              </p>

              <button
                onClick={() => setShowInAppWarning(false)}
                className="w-full font-black active:scale-95"
                style={{
                  background: '#0066FF',
                  color: '#fff',
                  padding: 16,
                  borderRadius: 18,
                  border: 'none',
                  fontSize: 14,
                }}
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