import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
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
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const android = isAndroidDevice();
    const ios = isIOSDevice();

    setIsAndroid(android);
    setIsIOS(ios);
    setIsInstalled(isStandaloneMode());

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      localStorage.setItem('pwaJustInstalled', 'true');
      setDeferredPrompt(null);
      setIsInstalled(true);
      setInstalling(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (isInstalled || (!isAndroid && !isIOS)) return null;

  const installOnAndroid = async () => {
    if (!deferredPrompt) {
      alert(
        'زر التثبيت سيصبح جاهزًا خلال لحظات. إذا لم يظهر، افتح قائمة المتصفح ثم اختر تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية.'
      );
      return;
    }

    setInstalling(true);
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;

    if (choice.outcome === 'accepted') {
      localStorage.setItem('pwaJustInstalled', 'true');
    }

    setDeferredPrompt(null);
    setInstalling(false);
  };

  return (
    <>
      {isAndroid && (
        <button
          type="button"
          onClick={installOnAndroid}
          disabled={installing}
          className="fixed bottom-4 left-4 right-4 z-[10000] mx-auto flex max-w-md items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-sm font-black text-white shadow-2xl transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
          aria-label="تثبيت تطبيق ParkNow"
        >
          <span aria-hidden="true">📲</span>
          {installing ? 'جاري التثبيت...' : 'تثبيت تطبيق ParkNow'}
        </button>
      )}

      {isIOS && (
        <>
          <button
            type="button"
            onClick={() => setShowIOSHelp(true)}
            className="fixed bottom-4 left-4 right-4 z-[10000] mx-auto flex max-w-md items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-sm font-black text-white shadow-2xl transition hover:bg-blue-700"
            aria-label="شرح تثبيت ParkNow على الآيفون"
          >
            <span aria-hidden="true">📱</span>
            تثبيت ParkNow على الآيفون
          </button>

          {showIOSHelp && (
            <div
              className="fixed inset-0 z-[10001] flex items-end justify-center bg-black/50 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="ios-install-title"
              onClick={() => setShowIOSHelp(false)}
            >
              <div
                className="w-full max-w-md rounded-3xl bg-white p-6 text-right text-slate-900 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mb-4 flex items-center justify-between">
                  <h2 id="ios-install-title" className="text-lg font-black">
                    تثبيت ParkNow على الآيفون
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
                  افتح التطبيق من متصفح Safari، ثم اتبع الخطوات التالية:
                </p>

                <ol className="space-y-3 text-sm font-bold leading-7 text-slate-800">
                  <li>١. اضغط زر المشاركة الموجود أسفل الشاشة.</li>
                  <li>٢. اختر «إضافة إلى الشاشة الرئيسية».</li>
                  <li>٣. اضغط «إضافة»، وستظهر أيقونة ParkNow بين تطبيقاتك.</li>
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
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

// يجب تسجيل service worker في ملف الدخول الرئيسي للتطبيق، مثلًا:
// if ('serviceWorker' in navigator) {
//   window.addEventListener('load', () => {
//     navigator.serviceWorker.register('/service-worker.js');
//   });
// }
