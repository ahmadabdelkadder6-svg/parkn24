import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { useStore, setupRealtime } from './store';
import { cn } from './utils/cn';

// Screens
import AuthGate from './components/AuthGate';
import SplashScreen from './components/SplashScreen';
import RegisterScreen from './components/RegisterScreen';
import GarageListScreen from './components/GarageListScreen';
import WaitingScreen from './components/WaitingScreen';
import NavigationScreen from './components/NavigationScreen';
import SessionScreen from './components/SessionScreen';
import SummaryScreen from './components/SummaryScreen';
import GarageLoginScreen from './components/GarageLoginScreen';
import GarageDashboard from './components/GarageDashboard';
import AdminDashboard from './components/AdminDashboard';
import InstallPWA from './components/InstallPWA';

export default function App() {
  const {
    view,
    setView,
    screen,
    setScreen,
    currentUser,
    currentGarageId,
    sessions,
    setSelectedGarageId,
    incomingCars,
    fetchAll,
  } = useStore();

  const prevActiveSessionRef = useRef<string | null>(null);

  useEffect(() => {
    fetchAll();
    setupRealtime();
  }, [fetchAll]);

  // مراقبة حالة العميل: بدء الجلسة / إنهاؤها / اختفاء الحجز
  useEffect(() => {
    if (!currentUser || view !== 'user') return;

    const myActiveSession = sessions.find(
      (s) => s.carPlate === currentUser.carPlate && s.status === 'active'
    );

    const myIncoming = incomingCars.find(
      (c) =>
        c.carPlate === currentUser.carPlate &&
        (c.status === 'coming' || c.status === 'arrived')
    );

    // 1) لو الجلسة بدأت
    if (myActiveSession && myActiveSession.id !== prevActiveSessionRef.current) {
      prevActiveSessionRef.current = myActiveSession.id;
      setSelectedGarageId(myActiveSession.garageId);

      if (screen !== 'session' && screen !== 'summary') {
        setScreen('session');
      }
      return;
    }

    // 2) لو كانت هناك جلسة ثم انتهت/اختفت
    if (!myActiveSession && prevActiveSessionRef.current) {
      prevActiveSessionRef.current = null;

      if (
        screen === 'session' ||
        screen === 'navigation' ||
        screen === 'waiting'
      ) {
        setSelectedGarageId(null);
        setScreen('list');
        toast.success('تم إنهاء الجلسة والعودة للرئيسية');
        return;
      }
    }

    // 3) لو العميل في شاشة التوجيه ومفيش incoming car ومفيش جلسة
    if (!myActiveSession && screen === 'navigation' && !myIncoming) {
      setSelectedGarageId(null);
      setScreen('list');
    }
  }, [
    sessions,
    currentUser,
    view,
    screen,
    incomingCars,
    setScreen,
    setSelectedGarageId,
  ]);

  return (
    <AuthGate>
      <div
        className="max-w-md mx-auto h-dvh bg-slate-950 relative flex flex-col overflow-hidden"
        style={{ fontFamily: "'Cairo', sans-serif" }}
      >
        {/* View Switcher */}
        <div className="absolute top-3 left-3 z-[9999] flex gap-0.5 bg-black/70 p-0.5 rounded-full backdrop-blur-md border border-white/10">
          {[
            { id: 'user' as const, label: 'حريف' },
            { id: 'garage' as const, label: 'جراج' },
            { id: 'admin' as const, label: 'أدمن' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-[10px] font-black transition-all',
                view === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          {view === 'admin' ? (
            <AdminDashboard />
          ) : view === 'garage' ? (
            currentGarageId ? (
              <GarageDashboard />
            ) : (
              <GarageLoginScreen />
            )
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={screen}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="h-full overflow-y-auto bg-slate-950"
              >
                {screen === 'splash' && <SplashScreen />}

                {!currentUser && screen !== 'splash' && <RegisterScreen />}

                {currentUser && (
                  <>
                    {screen === 'list' && <GarageListScreen />}
                    {screen === 'waiting' && <WaitingScreen />}
                    {screen === 'navigation' && <NavigationScreen />}
                    {screen === 'session' && <SessionScreen />}
                  </>
                )}

                {screen === 'summary' && <SummaryScreen />}
              </motion.div>
            </AnimatePresence>
          )}
        </main>

        <Toaster position="top-center" />

        {/* PWA Install Banner */}
        <InstallPWA />
      </div>
    </AuthGate>
  );
}