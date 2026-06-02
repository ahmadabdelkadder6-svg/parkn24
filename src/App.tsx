import { useEffect, useRef, useState } from 'react';
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
import LastSessionScreen from './components/LastSessionScreen';
import ChatScreen from './components/ChatScreen';

export default function App() {
  const {
    view,
    setView,
    screen,
    setScreen,
    currentUser,
    currentGarageId,
    sessions,
    selectedGarageId,
    setSelectedGarageId,
    incomingCars,
    fetchAll,
  } = useStore();

  const prevActiveSessionRef = useRef<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const initialLoadDone = useRef(false);

  // ✅ أول تحميل
useEffect(() => {
  const init = async () => {
    // ✅ نظف الشاشات القديمة قبل التحميل
    const savedScreen = localStorage.getItem('appScreen');
    if (savedScreen === 'session' || savedScreen === 'summary' || savedScreen === 'navigation') {
      // مش نغير الشاشة هنا - نستنى fetchAll يخلص ونقرر بعدها
    }

    await fetchAll();
    setDataLoaded(true);
    initialLoadDone.current = true;
    setupRealtime();
  };
  init();
}, []);

  // ✅ بعد أول تحميل - استرجع الشاشة الصحيحة
  useEffect(() => {
    if (!dataLoaded) return;
    if (!currentUser) return;
    if (view !== 'user') return;

    const userPlate = (currentUser.carPlate ?? '').trim().toUpperCase();

    const myActiveSession = sessions.find(
      (s) =>
        s.carPlate.trim().toUpperCase() === userPlate &&
        s.status === 'active'
    );

    const myIncoming = incomingCars.find(
      (c) =>
        c.carPlate.trim().toUpperCase() === userPlate &&
        c.status === 'coming'
    );

    // ✅ لو فيه جلسة نشطة → روح لشاشة الجلسة
    if (myActiveSession) {
      prevActiveSessionRef.current = myActiveSession.id;
      setSelectedGarageId(myActiveSession.garageId);
      if (screen !== 'session' && screen !== 'summary') {
        setScreen('session');
      }
      return;
    }

    // ✅ لو فيه سيارة في الطريق → روح للتوجيه
    if (myIncoming) {
      setSelectedGarageId(myIncoming.garageId);
      if (screen !== 'navigation' && screen !== 'session' && screen !== 'summary') {
        setScreen('navigation');
      }
      return;
    }

    // ✅ لو مفيش حاجة - لو الشاشة المحفوظة محتاجة جلسة، ارجع للقائمة
    if (
      screen === 'session' ||
      screen === 'navigation' ||
      screen === 'waiting'
    ) {
      const lastCompleted = sessions
        .filter(
          (s) =>
            s.carPlate.trim().toUpperCase() === userPlate &&
            s.status === 'completed'
        )
        .sort((a, b) => {
          const endA = typeof a.endTime === 'number' ? a.endTime : 0;
          const endB = typeof b.endTime === 'number' ? b.endTime : 0;
          return endB - endA;
        })[0];

      if (lastCompleted) {
        const endTime =
          typeof lastCompleted.endTime === 'number'
            ? lastCompleted.endTime
            : 0;
        const timeSinceEnd = Date.now() - endTime;

        // ✅ لو الجلسة انتهت من أقل من دقيقتين فقط → روح الملخص
        // ✅ الإصلاح: كان 120000 (دقيقتين) - خليناه 60000 (دقيقة واحدة) بس
        // عشان ما يرجعش لجلسة قديمة بعد refresh
        if (endTime > 0 && timeSinceEnd < 60000) {
          setSelectedGarageId(lastCompleted.garageId);
          setScreen('summary');
          return;
        }
      }

      // ✅ ارجع للقائمة
      setSelectedGarageId(null);
      setScreen('list');
    }
  }, [dataLoaded]);

  // ─── مراقبة حالة العميل ───────────────────────────────────────────────────
  useEffect(() => {
    if (!dataLoaded) return;
    if (!currentUser || view !== 'user') return;

    const userPlate = (currentUser.carPlate ?? '').trim().toUpperCase();

    const myActiveSession = sessions.find(
      (s) =>
        s.carPlate.trim().toUpperCase() === userPlate &&
        s.status === 'active'
    );

    const myIncoming = incomingCars.find(
      (c) =>
        c.carPlate.trim().toUpperCase() === userPlate &&
        c.status === 'coming'
    );

    // 1) لو الجلسة بدأت (جديدة)
    if (
      myActiveSession &&
      myActiveSession.id !== prevActiveSessionRef.current
    ) {
      prevActiveSessionRef.current = myActiveSession.id;
      setSelectedGarageId(myActiveSession.garageId);

      if (
        screen !== 'session' &&
        screen !== 'summary' &&
        screen !== 'lastSession' &&
        screen !== 'chat'
      ) {
        setScreen('session');
      }
      return;
    }

    // 2) لو كانت هناك جلسة ثم انتهت
    if (!myActiveSession && prevActiveSessionRef.current) {
      prevActiveSessionRef.current = null;

      if (
        screen === 'session' ||
        screen === 'navigation' ||
        screen === 'waiting'
      ) {
        const lastCompleted = sessions
          .filter(
            (s) =>
              s.carPlate.trim().toUpperCase() === userPlate &&
              s.status === 'completed'
          )
          .sort((a, b) => {
            const endA = typeof a.endTime === 'number' ? a.endTime : 0;
            const endB = typeof b.endTime === 'number' ? b.endTime : 0;
            return endB - endA;
          })[0];

        if (lastCompleted) {
          const endTime =
            typeof lastCompleted.endTime === 'number'
              ? lastCompleted.endTime
              : 0;
          const timeSinceEnd = Date.now() - endTime;

          if (endTime > 0 && timeSinceEnd < 60000) {
            setSelectedGarageId(lastCompleted.garageId);
            setScreen('summary');
            return;
          }
        }

        setSelectedGarageId(null);
        setScreen('list');
        toast.success('تم إنهاء الجلسة والعودة للرئيسية');
        return;
      }
    }

    // 3) لو في شاشة التوجيه ومفيش incoming ومفيش جلسة
    if (!myActiveSession && screen === 'navigation' && !myIncoming) {
      const timeout = setTimeout(() => {
        const freshIncoming = useStore.getState().incomingCars.find(
          (c) =>
            c.carPlate.trim().toUpperCase() === userPlate &&
            c.status === 'coming'
        );
        const freshSession = useStore.getState().sessions.find(
          (s) =>
            s.carPlate.trim().toUpperCase() === userPlate &&
            s.status === 'active'
        );

        if (!freshIncoming && !freshSession) {
          setSelectedGarageId(null);
          setScreen('list');
        }
      }, 3000);

      return () => clearTimeout(timeout);
    }
  }, [
    sessions,
    currentUser,
    view,
    screen,
    incomingCars,
    dataLoaded,
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
          {/* ✅ شاشة تحميل أولية */}
          {!dataLoaded && view === 'user' ? (
            <div className="h-full bg-slate-950 flex flex-col items-center justify-center">
              <div className="text-4xl mb-4 animate-bounce">🚗</div>
              <p className="text-slate-400 text-sm font-bold animate-pulse">
                جاري تحميل البيانات...
              </p>
            </div>
          ) : view === 'admin' ? (
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
                    {screen === 'lastSession' && <LastSessionScreen />}
                    {screen === 'chat' && <ChatScreen />}
                  </>
                )}

                {screen === 'summary' && <SummaryScreen />}
              </motion.div>
            </AnimatePresence>
          )}
        </main>

        <Toaster position="top-center" />
        <InstallPWA />
      </div>
    </AuthGate>
  );
}