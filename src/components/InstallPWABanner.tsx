import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Download, X } from 'lucide-react';

export default function InstallPWABanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showManualSteps, setShowManualSteps] = useState(false);

  useEffect(() => {
    // ✅ هل التطبيق متثبت بالفعل؟
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // ✅ استقبال حدث التثبيت التلقائي
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // ✅ مراقبة لو اتثبت
    const installedHandler = () => setIsInstalled(true);
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  // ✅ لو متثبت → مش بنعرض حاجة
  if (isInstalled) return null;

  // ✅ زر التثبيت التلقائي
  const handleInstallClick = async () => {
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
            <div className="bg-blue-600 w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/50 shrink-0">
              <Download size={22} className="text-white" />
            </div>
            <div className="text-right flex-1">
              <h3 className="text-sm font-black text-white">
                📲 ثبّت التطبيق على تليفونك
              </h3>
              <p className="text-[10px] text-blue-300/70 mt-0.5">
                مطلوب عشان التنبيهات توصلك في الخلفية
              </p>
            </div>
          </div>

          {/* المميزات */}
          <div className="bg-slate-950/50 rounded-xl p-2.5 mb-3 space-y-1.5">
            {[
              { icon: '🔔', text: 'تنبيه صوت واهتزاز حتى لو الشاشة مقفولة' },
              { icon: '🚗', text: 'تعرف فوراً لما عربية تيجي للجراج' },
              { icon: '⚡', text: 'يشتغل أسرع وبدون شريط المتصفح' },
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
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-black text-sm active:scale-95 transition-all shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2"
          >
            <Download size={18} />
            {deferredPrompt ? 'ثبّت التطبيق الآن' : 'طريقة التثبيت'}
          </button>

          {/* تحذير */}
          <div className="mt-2.5 bg-amber-600/10 border border-amber-500/20 rounded-lg p-2 text-center">
            <p className="text-[9px] text-amber-400 font-bold">
              ⚠️ بدون التثبيت، التنبيهات مش هتشتغل والشاشة مقفولة
            </p>
          </div>
        </div>
      </motion.div>

      {/* ─── مودال التعليمات اليدوية ─── */}
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

            {/* الخطوات */}
            <div className="space-y-3 mb-5">
              {[
                {
                  step: '1',
                  title: 'افتح القائمة',
                  desc: 'اضغط على ⋮ (النقاط الثلاث) أعلى يمين Chrome',
                  icon: '⋮',
                  color: 'bg-blue-600',
                },
                {
                  step: '2',
                  title: 'إضافة للشاشة',
                  desc: 'اختار "إضافة إلى الشاشة الرئيسية" أو "Install app"',
                  icon: '➕',
                  color: 'bg-emerald-600',
                },
                {
                  step: '3',
                  title: 'تأكيد التثبيت',
                  desc: 'اضغط "إضافة" أو "Install" وخلاص!',
                  icon: '✅',
                  color: 'bg-purple-600',
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="flex items-center gap-3 bg-slate-800/50 rounded-xl p-3.5 border border-slate-700/50"
                >
                  <div className="text-right flex-1">
                    <p className="text-sm font-black text-white mb-0.5">
                      {item.title}
                    </p>
                    <p className="text-[10px] text-slate-400">{item.desc}</p>
                  </div>
                  <div
                    className={`${item.color} w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-lg shrink-0 shadow-lg`}
                  >
                    {item.step}
                  </div>
                </div>
              ))}
            </div>

            {/* صورة توضيحية */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mb-5 text-center">
              <div className="text-4xl mb-2">📱</div>
              <p className="text-xs text-slate-400 font-bold">
                بعد التثبيت هتلاقي أيقونة التطبيق
              </p>
              <p className="text-xs text-slate-400">
                على الشاشة الرئيسية للموبايل
              </p>
            </div>

            {/* ملاحظات */}
            <div className="space-y-2 mb-4">
              <div className="bg-blue-600/10 border border-blue-500/20 rounded-lg p-2.5 text-center">
                <p className="text-[10px] text-blue-400 font-bold">
                  💡 لازم تستخدم Chrome على Android
                </p>
              </div>
              <div className="bg-amber-600/10 border border-amber-500/20 rounded-lg p-2.5 text-center">
                <p className="text-[10px] text-amber-400 font-bold">
                  ⚠️ بعد التثبيت، افتح التطبيق من الأيقونة الجديدة
                </p>
              </div>
            </div>

            {/* زر إغلاق */}
            <button
              onClick={() => setShowManualSteps(false)}
              className="w-full bg-slate-800 text-white py-3.5 rounded-xl font-black text-sm active:scale-95 transition-all"
            >
              فهمت ✅
            </button>
          </motion.div>
        </motion.div>
      )}
    </>
  );
}