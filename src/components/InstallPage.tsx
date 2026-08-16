import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Download, Smartphone, ChevronDown, ExternalLink } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const SITE_URL = 'https://parkn24.vercel.app';
const DISMISS_DAYS = 3;

const getDismissKey = (type: 'ios' | 'android' | 'browser') => `pwa-dismissed-${type}`;

const isDismissedRecently = (key: string) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
};

const setDismissedNow = (key: string) => {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {}
};

export default function InstallPage() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);

  const deviceInfo = useMemo(() => {
    const ua = navigator.userAgent || '';

    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const isAndroid = /Android/i.test(ua);

    const isSafari =
      /Safari/i.test(ua) &&
      !/CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(ua);

    const isFacebookInApp = /FBAN|FBAV/i.test(ua);
    const isInstagramInApp = /Instagram/i.test(ua);
    const isLineInApp = /Line/i.test(ua);
    const isTikTokInApp = /TikTok/i.test(ua);
    const isWhatsAppInApp = /WhatsApp/i.test(ua);

    const isInAppBrowser =
      isFacebookInApp ||
      isInstagramInApp ||
      isLineInApp ||
      isTikTokInApp ||
      isWhatsAppInApp;

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    return {
      isIOS,
      isAndroid,
      isSafari,
      isInAppBrowser,
      isStandalone,
    };
  }, []);

  const dismissKey = useMemo(() => {
    if (deviceInfo.isIOS) return getDismissKey('ios');
    if (deviceInfo.isAndroid) return getDismissKey('android');
    return getDismissKey('browser');
  }, [deviceInfo]);

  const canShowPromptState = useCallback(() => {
    if (deviceInfo.isStandalone) return false;
    if (isDismissedRecently(dismissKey)) return false;
    return true;
  }, [deviceInfo, dismissKey]);

  useEffect(() => {
    if (deviceInfo.isStandalone) {
      window.location.href = SITE_URL;
      return;
    }

    let mounted = true;

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      if (!mounted) return;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      if (!mounted) return;
      localStorage.setItem('pwaJustInstalled', 'true');
      setInstalled(true);
      setDeferredPrompt(null);
      setTimeout(() => {
        window.location.href = SITE_URL;
      }, 1800);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      mounted = false;
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, [deviceInfo]);

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

  const handleSkip = () => {
    setDismissedNow(dismissKey);
    window.location.href = SITE_URL;
  };

  if (deviceInfo.isStandalone) return null;

  const canShow = canShowPromptState();

  const renderSubText = () => {
    if (deviceInfo.isInAppBrowser) return 'افتح الرابط في Safari أو Chrome لتثبيت التطبيق';
    if (deviceInfo.isIOS) return 'ثبّت التطبيق على الشاشة الرئيسية بسهولة';
    return 'تثبيت سريع وتشغيل أفضل من المتصفح';
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{
        background: 'linear-gradient(180deg, #0A1628 0%, #0D2137 50%, #0A1628 100%)',
      }}
    >
      {installed ? (
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center text-white"
        >
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
          <h2 className="font-black text-2xl mb-2">تم التثبيت بنجاح</h2>
          <p className="text-slate-400 text-sm">جاري فتح التطبيق...</p>
        </motion.div>
      ) : (
        <>
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="mb-8"
          >
            <img
              src="/images/logo.png"
              alt="بركن"
              className="w-24 h-24 object-contain mx-auto"
              style={{
                borderRadius: 28,
                boxShadow: '0 8px 40px rgba(0,102,255,0.4)',
                border: '3px solid rgba(0,102,255,0.3)',
              }}
            />
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="text-center mb-8"
          >
            <h1 className="font-black text-white text-2xl mb-2">بركن 24</h1>
            <p className="text-slate-400 text-sm">{renderSubText()}</p>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="w-full max-w-sm space-y-3 mb-8"
          >
            {[
              { icon: '🚗', text: 'احجز مكان ركن فورًا' },
              { icon: '📍', text: 'اعرف أقرب جراج ليك' },
              { icon: '⏱️', text: 'تابع جلسة الركن بسهولة' },
              { icon: '💳', text: 'وصول أسرع من المتصفح' },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 justify-end"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: 16,
                  padding: '12px 16px',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <span className="font-bold text-white text-sm">{item.text}</span>
                <span style={{ fontSize: 22 }}>{item.icon}</span>
              </div>
            ))}
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.45 }}
            className="w-full max-w-sm"
          >
            {deviceInfo.isInAppBrowser ? (
              <div className="space-y-3">
                <div
                  className="w-full text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 text-center"
                  style={{
                    background: 'linear-gradient(135deg,#F59E0B,#D97706)',
                  }}
                >
                  <ExternalLink size={18} />
                  افتح الرابط في Safari أو Chrome أولًا
                </div>
                <div
                  className="text-center"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: 16,
                    padding: 14,
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <p className="text-white text-sm font-black mb-1">من داخل المتصفح الحالي:</p>
                  <p className="text-slate-400 text-xs">
                    اضغط ⋮ أو مشاركة ثم اختر
                    <span className="text-white font-bold"> فتح في المتصفح </span>
                  </p>
                </div>
              </div>
            ) : deviceInfo.isIOS ? (
              <div className="space-y-4">
                <div
                  className="text-center font-black text-white text-sm"
                  style={{
                    background: 'rgba(0,102,255,0.15)',
                    borderRadius: 16,
                    padding: '14px 16px',
                    border: '1px solid rgba(0,102,255,0.3)',
                  }}
                >
                  📱 لتثبيت التطبيق على iPhone
                </div>

                {[
                  {
                    step: '1',
                    title: 'افتح الرابط في Safari',
                    desc: 'لو أنت داخل من أي تطبيق تاني',
                  },
                  {
                    step: '2',
                    title: 'اضغط زر المشاركة ⬆️',
                    desc: 'أسفل المتصفح',
                  },
                  {
                    step: '3',
                    title: 'اختار Add to Home Screen',
                    desc: 'إضافة للشاشة الرئيسية',
                  },
                  {
                    step: '4',
                    title: 'اضغط Add',
                    desc: 'وسيظهر التطبيق على الشاشة',
                  },
                ].map((item) => (
                  <div
                    key={item.step}
                    className="flex items-center gap-3"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: 16,
                      padding: '14px 16px',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <div
                      className="font-black text-white flex items-center justify-center shrink-0"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        background: '#0066FF',
                        fontSize: 14,
                      }}
                    >
                      {item.step}
                    </div>
                    <div className="text-right flex-1">
                      <div className="font-black text-white text-sm">{item.title}</div>
                      <div className="text-slate-400 text-xs">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {deferredPrompt ? (
                  <button
                    onClick={handleInstall}
                    disabled={installing}
                    className="w-full font-black flex items-center justify-center gap-3 active:scale-95 transition-all"
                    style={{
                      background: 'linear-gradient(135deg, #0066FF, #4D00FF)',
                      color: '#fff',
                      padding: '18px 0',
                      borderRadius: 22,
                      fontSize: 16,
                      boxShadow: '0 8px 32px rgba(0,102,255,0.5)',
                    }}
                  >
                    <Download size={22} />
                    {installing ? 'جاري التثبيت...' : 'تثبيت التطبيق الآن'}
                  </button>
                ) : (
                  <div
                    className="w-full font-black flex items-center justify-center gap-3"
                    style={{
                      background: canShow ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)',
                      color: '#cbd5e1',
                      padding: '18px 0',
                      borderRadius: 22,
                      fontSize: 14,
                      border: '2px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <Smartphone size={20} />
                    جاري تحضير التثبيت...
                  </div>
                )}

                {!deferredPrompt && (
                  <p className="text-slate-500 text-xs text-center">
                    لو لم يظهر الزر افتح الموقع من Chrome أو Edge وانتظر قليلًا
                  </p>
                )}
              </div>
            )}

            <button
              onClick={handleSkip}
              className="w-full mt-5 font-bold text-slate-500 text-xs active:scale-95 transition-all"
              style={{ padding: '14px 0' }}
            >
              تخطي واستخدام الموقع من المتصفح ←
            </button>
          </motion.div>

          {deviceInfo.isIOS && (
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="mt-6"
            >
              <ChevronDown size={24} style={{ color: '#475569' }} />
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}