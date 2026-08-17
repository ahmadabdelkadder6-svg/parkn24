
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
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
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // كشف iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;

    if (isIOSDevice && !isStandalone) {
      setIsIOS(true);
      const dismissed = localStorage.getItem('pwa-ios-dismissed');
      if (!dismissed) {
        setTimeout(() => setShowBanner(true), 3000);
      }
    }
    const android = isAndroidDevice();
    const ios = isIOSDevice();

    // Android / Chrome
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      const dismissed = localStorage.getItem('pwa-dismissed');
      if (!dismissed) {
        setTimeout(() => setShowBanner(true), 2000);
      }
    };
    setIsAndroid(android);
    setIsIOS(ios);
    setIsInstalled(isStandaloneMode());

    window.addEventListener('beforeinstallprompt', handler);
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('appinstalled', () => {
      setShowBanner(false);
    const handleAppInstalled = () => {
      localStorage.setItem('pwaJustInstalled', 'true');
      setDeferredPrompt(null);
      console.log('✅ تم تثبيت التطبيق');
    });
      setIsInstalled(true);
      setInstalling(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('✅ المستخدم وافق على التثبيت');
  if (isInstalled || (!isAndroid && !isIOS)) return null;

  const installOnAndroid = async () => {
    if (!deferredPrompt) {
      alert(
        'زر التثبيت سيصبح جاهزًا خلال لحظات. إذا لم يظهر، افتح قائمة المتصفح ثم اختر تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية.'
      );
      return;
    }
    setDeferredPrompt(null);
    setShowBanner(false);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem(isIOS ? 'pwa-ios-dismissed' : 'pwa-dismissed', 'true');
  };
    setInstalling(true);
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true;
  if (isStandalone) return null;
    if (choice.outcome === 'accepted') {
      localStorage.setItem('pwaJustInstalled', 'true');
    }

    setDeferredPrompt(null);
    setInstalling(false);
  };

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
            <div className="bg-gradient-to-r from-blue-900 to-slate-900 border border-blue-500/30 rounded-2xl p-4 shadow-2xl shadow-blue-900/30">
              <button
                onClick={handleDismiss}
                className="absolute top-3 left-3 text-slate-500 hover:text-white transition-colors"
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
              </div>
