import { useEffect, useMemo, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const SITE_URL = 'https://parkn24.vercel.app';

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

function isInAppBrowser() {
  const ua = window.navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|Line|TikTok|WhatsApp/i.test(ua);
}

export default function InstallPage() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  const isIOS = useMemo(() => isIOSDevice(), []);
  const isAndroid = useMemo(() => isAndroidDevice(), []);
  const inAppBrowser = useMemo(() => isInAppBrowser(), []);
  const isStandalone = useMemo(() => isStandaloneMode(), []);

  useEffect(() => {
    if (isStandalone) {
      window.location.href = SITE_URL;
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      localStorage.setItem('pwaJustInstalled', 'true');
      setInstalled(true);
      setDeferredPrompt(null);
      setTimeout(() => {
        window.location.href = SITE_URL;
      }, 1500);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [isStandalone]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;

      if (result.outcome === 'accepted') {
        localStorage.setItem('pwaJustInstalled', 'true');
      }
    } catch (error) {
      console.error('Install failed:', error);
    } finally {
      setInstalling(false);
      setDeferredPrompt(null);
    }
  };

  const handleSkip = () => {
    window.location.href = SITE_URL;
  };

  if (isStandalone) return null;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ background: '#0A1628' }}
    >
      <div
        className="w-full max-w-md"
        style={{
          background: '#fff',
          borderRadius: 24,
          padding: 24,
          textAlign: 'right',
          boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
        }}
      >
        {installed ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontSize: 24, fontWeight: 900, color: '#0A1628', marginBottom: 8 }}>
              تم التثبيت بنجاح
            </h2>
            <p style={{ fontSize: 14, color: '#64748b' }}>
              جاري فتح التطبيق...
            </p>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <img
                src="/images/logo.png"
                alt="Parkn24"
                style={{
                  width: 84,
                  height: 84,
                  objectFit: 'contain',
                  margin: '0 auto 12px',
                  borderRadius: 20,
                }}
              />
              <h1 style={{ fontSize: 24, fontWeight: 900, color: '#0A1628', marginBottom: 6 }}>
                تثبيت تطبيق Parkn24
              </h1>
              <p style={{ fontSize: 13, color: '#64748b' }}>
                للوصول السريع للتطبيق من شاشة الموبايل
              </p>
            </div>

            {/* لو داخل من متصفح داخلي */}
            {inAppBrowser && (
              <div
                style={{
                  background: '#FFF7ED',
                  border: '2px solid #FDBA74',
                  borderRadius: 18,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 15, color: '#C2410C', marginBottom: 8 }}>
                  افتح الرابط في Chrome أو Safari أولًا
                </div>
                <ul style={{ fontSize: 13, color: '#7C2D12', lineHeight: 2 }}>
                  <li>• اضغط ⋮ أو زر المشاركة</li>
                  <li>• اختر: فتح في المتصفح</li>
                  <li>• ثم ارجع لصفحة التثبيت</li>
                </ul>
              </div>
            )}

            {/* Android */}
            {!inAppBrowser && isAndroid && (
              <div style={{ marginBottom: 16 }}>
                {deferredPrompt ? (
                  <button
                    onClick={handleInstall}
                    disabled={installing}
                    style={{
                      width: '100%',
                      background: '#0066FF',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 18,
                      padding: '16px 14px',
                      fontSize: 16,
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    {installing ? 'جاري التثبيت...' : '📲 تثبيت التطبيق الآن'}
                  </button>
                ) : (
                  <div
                    style={{
                      background: '#EFF6FF',
                      border: '2px solid #BFDBFE',
                      borderRadius: 18,
                      padding: 16,
                    }}
                  >
                    <div style={{ fontWeight: 900, fontSize: 15, color: '#1D4ED8', marginBottom: 8 }}>
                      لو زر التثبيت مش ظاهر:
                    </div>
                    <ul style={{ fontSize: 13, color: '#1E3A8A', lineHeight: 2 }}>
                      <li>• افتح الموقع من <strong>Chrome</strong></li>
                      <li>• اضغط <strong>⋮ الثلاث نقاط</strong></li>
                      <li>• اختر <strong>تثبيت التطبيق</strong></li>
                      <li>• أو اختر <strong>Add to Home screen</strong></li>
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* iPhone */}
            {!inAppBrowser && isIOS && (
              <div
                style={{
                  background: '#F8FAFC',
                  border: '2px solid #CBD5E1',
                  borderRadius: 18,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 15, color: '#0F172A', marginBottom: 8 }}>
                  تثبيت التطبيق على iPhone:
                </div>
                <ul style={{ fontSize: 13, color: '#334155', lineHeight: 2 }}>
                  <li>• افتح الموقع في <strong>Safari</strong></li>
                  <li>• اضغط زر <strong>المشاركة ⬆️</strong></li>
                  <li>• اختر <strong>Add to Home Screen</strong></li>
                  <li>• اضغط <strong>Add</strong></li>
                </ul>
              </div>
            )}

            <button
              onClick={handleSkip}
              style={{
                width: '100%',
                background: '#F1F5F9',
                color: '#475569',
                border: '2px solid #CBD5E1',
                borderRadius: 18,
                padding: '14px 12px',
                fontSize: 14,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              تخطي واستخدام الموقع من المتصفح
            </button>
          </>
        )}
      </div>
    </div>
  );
}