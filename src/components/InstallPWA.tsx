import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const detectBrowser = () => {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
  const isChrome = /Chrome/.test(ua) && !/Edge/.test(ua);
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

  return { isIOS, isAndroid, isSafari, isChrome, isInAppBrowser, isStandalone };
};

export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showFullScreen, setShowFullScreen] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showAndroidGuide, setShowAndroidGuide] = useState(false);
  const [showInAppWarning, setShowInAppWarning] = useState(false);
  const [showSuccessMsg, setShowSuccessMsg] = useState(false);
  const [browser, setBrowser] = useState({
    isIOS: false, isAndroid: false, isSafari: false, isChrome: false,
    isInAppBrowser: false, isStandalone: false,
  });

  useEffect(() => {
    const b = detectBrowser();
    setBrowser(b);

    // ✅ لو التطبيق مثبت بالفعل → مش نعرض حاجة
    if (b.isStandalone) return;

    // ✅ أظهر شاشة التثبيت بعد ثانية (أول زيارة فقط)
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (!dismissed) {
      setTimeout(() => setShowFullScreen(true), 1000);
    }

    // ✅ استقبال prompt التثبيت المباشر (Android Chrome فقط)
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // ✅ لما التطبيق يتثبت
    window.addEventListener('appinstalled', () => {
      localStorage.setItem('pwaJustInstalled', 'true');
      setShowFullScreen(false);
      setDeferredPrompt(null);
      // ✅ رسالة نجاح واضحة
      setShowSuccessMsg(true);
      setTimeout(() => setShowSuccessMsg(false), 5000);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const canDirectInstall = !!deferredPrompt;

  const getButtonText = () => {
    if (canDirectInstall) return 'تثبيت التطبيق الآن';
    if (browser.isIOS) return 'طريقة التثبيت على iPhone';
    if (browser.isInAppBrowser) return 'افتح في المتصفح أولًا';
    return 'طريقة التثبيت';
  };

  const handleInstallClick = async () => {
    if (browser.isInAppBrowser) {
      setShowInAppWarning(true);
      return;
    }

    if (browser.isIOS) {
      setShowIOSGuide(true);
      return;
    }

    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          // ✅ حفظ إن التطبيق اتثبت
          localStorage.setItem('pwaJustInstalled', 'true');
          localStorage.setItem('pwa-install-dismissed', 'true');
          setShowFullScreen(false);
          // ✅ رسالة للمستخدم
          setShowSuccessMsg(true);
          setTimeout(() => setShowSuccessMsg(false), 5000);
        }
        setDeferredPrompt(null);
      } catch (err) {
        setShowAndroidGuide(true);
      }
      return;
    }

    setShowAndroidGuide(true);
  };

  const handleDismiss = () => {
    setShowFullScreen(false);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  // ✅ لو التطبيق مثبت بالفعل → مش نعرض حاجة
  if (browser.isStandalone) return null;

  return (
    <>
      {/* ══════ رسالة نجاح التثبيت ══════ */}
      <AnimatePresence>
        {showSuccessMsg && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-4 left-4 right-4 z-[400]"
          >
            <div className="text-center" style={{
              background: 'linear-gradient(135deg,#00CC66,#00AA55)',
              borderRadius: 22,
              padding: '16px 20px',
              color: '#fff',
              boxShadow: '0 8px 32px rgba(0,204,102,0.4)',
            }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>🎉</div>
              <p className="font-black" style={{ fontSize: 15 }}>تم تثبيت التطبيق بنجاح!</p>
              <p style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                افتحه من الأيقونة الجديدة على شاشتك الرئيسية
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════ شاشة التثبيت الكاملة ══════ */}
      <AnimatePresence>
        {showFullScreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #0A1628 0%, #0D2150 50%, #0A1628 100%)',
            }}
          >
            {/* زر تخطي */}
            <button
              onClick={handleDismiss}
              className="absolute top-12 left-4 flex items-center gap-1 active:scale-95"
              style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 700 }}
            >
              <X size={16} /> تخطي
            </button>

            {/* النجوم خلفية */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute rounded-full bg-white"
                  style={{
                    width: Math.random() * 3 + 1,
                    height: Math.random() * 3 + 1,
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                    opacity: Math.random() * 0.5 + 0.1,
                  }}
                  animate={{ opacity: [0.1, 0.5, 0.1] }}
                  transition={{ duration: Math.random() * 3 + 2, repeat: Infinity }}
                />
              ))}
            </div>

            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex flex-col items-center px-8 w-full max-w-sm"
            >
              {/* اللوجو */}
              <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 3 }} className="mb-6">
                <img
                  src="/images/logo.png"
                  alt="بركن"
                  className="w-28 h-28 rounded-[2rem] shadow-2xl object-contain"
                  style={{ boxShadow: '0 0 60px rgba(0,102,255,0.4), 0 20px 40px rgba(0,0,0,0.4)' }}
                />
              </motion.div>

              <h1 className="font-black text-white text-center mb-2" style={{ fontSize: 28 }}>
                بركن 🅿️
              </h1>
              <p className="text-center font-bold mb-8" style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
                ثبّت التطبيق على شاشتك الرئيسية
              </p>

              {/* مميزات */}
              <div className="w-full mb-8 space-y-3">
                {[
                  { icon: '⚡', text: 'أسرع من المتصفح' },
                  { icon: '📱', text: 'على شاشتك مباشرة' },
                  { icon: '🔔', text: 'إشعارات فورية' },
                ].map((f, i) => (
                  <motion.div
                    key={i}
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <span style={{ fontSize: 20 }}>{f.icon}</span>
                    <span className="font-bold text-white" style={{ fontSize: 14 }}>{f.text}</span>
                  </motion.div>
                ))}
              </div>

              {/* زر التثبيت */}
              <motion.button
                onClick={handleInstallClick}
                className="w-full font-black flex items-center justify-center gap-3 active:scale-95 transition-all mb-3"
                style={{
                  background: canDirectInstall
                    ? 'linear-gradient(135deg, #00CC66, #00AA55)'
                    : 'linear-gradient(135deg, #0066FF, #4D00FF)',
                  color: '#fff',
                  padding: '18px 0',
                  borderRadius: 22,
                  fontSize: 17,
                  boxShadow: canDirectInstall
                    ? '0 0 40px rgba(0,204,102,0.5), 0 10px 30px rgba(0,204,102,0.3)'
                    : '0 0 40px rgba(0,102,255,0.5), 0 10px 30px rgba(0,102,255,0.3)',
                }}
                whileTap={{ scale: 0.96 }}
              >
                <Download size={22} />
                {getButtonText()}
              </motion.button>

              {browser.isIOS && browser.isInAppBrowser && (
                <p className="text-center font-bold mt-2" style={{ color: '#FF9500', fontSize: 12 }}>
                  ⚠️ افتح الرابط في Safari للتثبيت
                </p>
              )}

              <button
                onClick={handleDismiss}
                className="font-bold mt-2 active:scale-95"
                style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}
              >
                متابعة من المتصفح
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════ شرح التثبيت على iPhone ══════ */}
      <AnimatePresence>
        {showIOSGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowIOSGuide(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-md"
              style={{ background: '#fff', borderRadius: '32px 32px 0 0', padding: 28, paddingBottom: 40 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="mx-auto mb-6" style={{ width: 40, height: 4, background: '#D0DCFF', borderRadius: 4 }} />

              <h3 className="font-black text-center mb-6" style={{ fontSize: 20, color: '#0A1628' }}>
                تثبيت على iPhone 📱
              </h3>

              {browser.isInAppBrowser && (
                <div className="mb-4 p-3 rounded-2xl text-center" style={{ background: '#FFF3E0', border: '2px solid #FFD180' }}>
                  <p className="font-black" style={{ fontSize: 13, color: '#E65100' }}>⚠️ افتح الرابط في Safari الأول</p>
                  <p style={{ fontSize: 11, color: '#FF9500', marginTop: 4 }}>انسخ الرابط والصقه في Safari</p>
                </div>
              )}

              <div className="space-y-5 mb-6">
                {[
                  { emoji: '⬆️', title: 'اضغط زر المشاركة', sub: 'الأيقونة ⬆️ في أسفل Safari' },
                  { emoji: '➕', title: 'اختار "إضافة للشاشة الرئيسية"', sub: 'Add to Home Screen' },
                  { emoji: '✅', title: 'اضغط "إضافة" أو "Add"', sub: 'التطبيق هيظهر على شاشتك 🎉' },
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="font-black text-white flex items-center justify-center shrink-0"
                      style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg,#0066FF,#4D00FF)', fontSize: 18 }}>
                      {s.emoji}
                    </div>
                    <div className="text-right flex-1">
                      <p className="font-black" style={{ fontSize: 14, color: '#0A1628' }}>{s.title}</p>
                      <p style={{ fontSize: 11, color: '#7B8CA6', marginTop: 2 }}>{s.sub}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* ✅ رسالة توضيحية للـ iPhone */}
              <div className="mb-4 p-3 rounded-2xl text-center" style={{ background: '#EBF2FF', border: '2px solid #D0DCFF' }}>
                <p className="font-bold" style={{ fontSize: 12, color: '#0066FF' }}>
                  💡 بعد التثبيت افتح التطبيق من الأيقونة الجديدة على الشاشة الرئيسية
                </p>
              </div>

              <button
                onClick={() => { setShowIOSGuide(false); setShowFullScreen(false); localStorage.setItem('pwa-install-dismissed', 'true'); }}
                className="w-full font-black active:scale-95"
                style={{ background: 'linear-gradient(135deg,#0066FF,#4D00FF)', color: '#fff', padding: 18, borderRadius: 22, fontSize: 15 }}
              >
                فهمت ✅
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════ شرح التثبيت على Android يدوي ══════ */}
      <AnimatePresence>
        {showAndroidGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowAndroidGuide(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-md"
              style={{ background: '#fff', borderRadius: '32px 32px 0 0', padding: 28, paddingBottom: 40 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="mx-auto mb-6" style={{ width: 40, height: 4, background: '#D0DCFF', borderRadius: 4 }} />

              <h3 className="font-black text-center mb-6" style={{ fontSize: 20, color: '#0A1628' }}>
                طريقة التثبيت 📲
              </h3>

              <div className="space-y-5 mb-6">
                {[
                  { emoji: '⋮', title: 'افتح القائمة', sub: 'اضغط ⋮ أعلى يمين Chrome', color: '#0066FF' },
                  { emoji: '➕', title: 'اختار "إضافة للشاشة الرئيسية"', sub: 'أو "Install App"', color: '#00CC66' },
                  { emoji: '✅', title: 'اضغط "تثبيت" أو "Install"', sub: 'التطبيق هيظهر على شاشتك 🎉', color: '#7C3AED' },
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="font-black text-white flex items-center justify-center shrink-0"
                      style={{ width: 44, height: 44, borderRadius: 14, background: s.color, fontSize: 18 }}>
                      {s.emoji}
                    </div>
                    <div className="text-right flex-1">
                      <p className="font-black" style={{ fontSize: 14, color: '#0A1628' }}>{s.title}</p>
                      <p style={{ fontSize: 11, color: '#7B8CA6', marginTop: 2 }}>{s.sub}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* ✅ رسالة توضيحية للأندرويد */}
              <div className="mb-4 p-3 rounded-2xl text-center" style={{ background: '#EBF2FF', border: '2px solid #D0DCFF' }}>
                <p className="font-bold" style={{ fontSize: 12, color: '#0066FF' }}>
                  💡 بعد التثبيت افتح التطبيق من الأيقونة الجديدة على الشاشة الرئيسية
                </p>
              </div>

              <button
                onClick={() => { setShowAndroidGuide(false); setShowFullScreen(false); localStorage.setItem('pwa-install-dismissed', 'true'); }}
                className="w-full font-black active:scale-95"
                style={{ background: 'linear-gradient(135deg,#0066FF,#4D00FF)', color: '#fff', padding: 18, borderRadius: 22, fontSize: 15 }}
              >
                فهمت ✅
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════ تحذير المتصفح الداخلي ══════ */}
      <AnimatePresence>
        {showInAppWarning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center p-6"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowInAppWarning(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="w-full max-w-sm text-center"
              style={{ background: '#fff', borderRadius: 32, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontSize: 60, marginBottom: 16 }}>⚠️</div>
              <h3 className="font-black mb-2" style={{ fontSize: 20, color: '#0A1628' }}>
                افتح في المتصفح الأول
              </h3>
              <p style={{ fontSize: 13, color: '#7B8CA6', lineHeight: 1.6, marginBottom: 20 }}>
                لتثبيت التطبيق، لازم تفتح الرابط في:
                <br />
                <strong style={{ color: '#0066FF' }}>Safari</strong> على iPhone
                <br />
                <strong style={{ color: '#00AA44' }}>Chrome</strong> على Android
              </p>
              <div className="mb-4 p-3 rounded-2xl" style={{ background: '#F0F4FF', border: '2px solid #D0DCFF' }}>
                <p className="font-black" style={{ fontSize: 12, color: '#0066FF' }}>📋 انسخ الرابط والصقه في المتصفح</p>
                <p className="font-mono mt-1" style={{ fontSize: 10, color: '#7B8CA6' }}>parkn24.vercel.app</p>
              </div>
              <button
                onClick={() => setShowInAppWarning(false)}
                className="w-full font-black active:scale-95"
                style={{ background: '#0066FF', color: '#fff', padding: 16, borderRadius: 18, fontSize: 14 }}
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