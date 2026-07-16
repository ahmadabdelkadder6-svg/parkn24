import { useEffect, useRef, useState, useMemo } from 'react';
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

const VALID_SCREENS = [
  'splash',
  'list',
  'waiting',
  'navigation',
  'session',
  'summary',
  'lastSession',
  'chat',
] as const;

// ✅ الرابط السري للأدمن - غيّره لأي كلمة تحبها
const ADMIN_SECRET_CODE = 'admin2025x';

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

  const noSessionCountRef = useRef(0);
  const lastActiveTimeRef = useRef(0);
  const sessionEndToastShown = useRef(false);
  const sessionTransitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [adminAccess, setAdminAccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const adminParam = params.get('admin');

    if (adminParam === ADMIN_SECRET_CODE) {
      setAdminAccess(true);
      localStorage.setItem('adminAccess', 'true');
    }

    if (window.location.pathname === '/admin' || window.location.hash === '#admin') {
      setAdminAccess(true);
      localStorage.setItem('adminAccess', 'true');
    }

    if (localStorage.getItem('adminAccess') === 'true') {
      setAdminAccess(true);
    }
  }, []);

  const safeScreen = useMemo(() => {
    if (!VALID_SCREENS.includes(screen as any)) {
      console.warn('⚠️ شاشة غير صالحة:', screen, '→ تحويل لـ list');
      return currentUser ? 'list' : 'splash';
    }
    return screen;
  }, [screen, currentUser]);

  useEffect(() => {
    if (!dataLoaded) return;
    if (view !== 'user') return;

    if (safeScreen !== screen) {
      setScreen(safeScreen as typeof screen);
    }
  }, [safeScreen, screen, setScreen, dataLoaded, view]);

  useEffect(() => {
    const init = async () => {
      const savedScreen = localStorage.getItem('appScreen');
      if (
        savedScreen === 'session' ||
        savedScreen === 'navigation' ||
        savedScreen === 'waiting' ||
        savedScreen === 'offer' ||
        (savedScreen && !VALID_SCREENS.includes(savedScreen as any))
      ) {
        localStorage.removeItem('appScreen');
      }

      await fetchAll();
      setDataLoaded(true);
      initialLoadDone.current = true;
      setupRealtime();
    };
    init();
  }, []);

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

    if (myActiveSession) {
      prevActiveSessionRef.current = myActiveSession.id;
      lastActiveTimeRef.current = Date.now();
      noSessionCountRef.current = 0;
      sessionEndToastShown.current = false;
      setSelectedGarageId(myActiveSession.garageId);
      if (safeScreen !== 'session' && safeScreen !== 'summary') {
        setScreen('session');
      }
      return;
    }

    if (myIncoming) {
      setSelectedGarageId(myIncoming.garageId);
      if (
        safeScreen !== 'navigation' &&
        safeScreen !== 'session' &&
        safeScreen !== 'summary'
      ) {
        setScreen('navigation');
      }
      return;
    }

    if (
      safeScreen === 'session' ||
      safeScreen === 'navigation' ||
      safeScreen === 'waiting'
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
    }
  }, [dataLoaded]);

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

    if (myActiveSession) {
      noSessionCountRef.current = 0;
      lastActiveTimeRef.current = Date.now();
      sessionEndToastShown.current = false;

      if (sessionTransitionTimer.current) {
        clearTimeout(sessionTransitionTimer.current);
        sessionTransitionTimer.current = null;
      }

      if (myActiveSession.id !== prevActiveSessionRef.current) {
        prevActiveSessionRef.current = myActiveSession.id;
        setSelectedGarageId(myActiveSession.garageId);

        if (
          safeScreen !== 'session' &&
          safeScreen !== 'summary' &&
          safeScreen !== 'lastSession' &&
          safeScreen !== 'chat'
        ) {
          setScreen('session');
        }
      }
      return;
    }

    if (prevActiveSessionRef.current) {
      noSessionCountRef.current += 1;

      const timeSinceLastActive = Date.now() - lastActiveTimeRef.current;

      if (noSessionCountRef.current < 3 || timeSinceLastActive < 8000) {
        return;
      }

      if (sessionTransitionTimer.current) return;

      sessionTransitionTimer.current = setTimeout(() => {
        sessionTransitionTimer.current = null;

        const freshState = useStore.getState();
        const freshPlate = (freshState.currentUser?.carPlate ?? '')
          .trim()
          .toUpperCase();

        const stillActive = freshState.sessions.find(
          (s) =>
            s.carPlate.trim().toUpperCase() === freshPlate &&
            s.status === 'active'
        );

        if (stillActive) {
          noSessionCountRef.current = 0;
          prevActiveSessionRef.current = stillActive.id;
          return;
        }

        const currentScreen = freshState.screen;
        prevActiveSessionRef.current = null;
        noSessionCountRef.current = 0;

        if (
          currentScreen === 'session' ||
          currentScreen === 'navigation' ||
          currentScreen === 'waiting'
        ) {
          const lastCompleted = freshState.sessions
            .filter(
              (s) =>
                s.carPlate.trim().toUpperCase() === freshPlate &&
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

          if (!sessionEndToastShown.current) {
            sessionEndToastShown.current = true;
            toast.success('تم إنهاء الجلسة والعودة للرئيسية');
          }
          setSelectedGarageId(null);
          setScreen('list');
        }
      }, 3000);
    }

    if (!myActiveSession && safeScreen === 'navigation' && !myIncoming) {
      const timeout = setTimeout(() => {
        const freshState = useStore.getState();
        const freshPlate = (freshState.currentUser?.carPlate ?? '')
          .trim()
          .toUpperCase();

        const freshIncoming = freshState.incomingCars.find(
          (c) =>
            c.carPlate.trim().toUpperCase() === freshPlate &&
            c.status === 'coming'
        );
        const freshSession = freshState.sessions.find(
          (s) =>
            s.carPlate.trim().toUpperCase() === freshPlate &&
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
    safeScreen,
    incomingCars,
    dataLoaded,
    setScreen,
    setSelectedGarageId,
  ]);

  useEffect(() => {
    return () => {
      if (sessionTransitionTimer.current) {
        clearTimeout(sessionTransitionTimer.current);
      }
    };
  }, []);

  return (
    <AuthGate>
      <div
        className="max-w-md mx-auto h-dvh bg-white text-slate-900 relative flex flex-col overflow-hidden"
        style={{ fontFamily: "'Cairo', sans-serif" }}
      >
        <div className="absolute top-3 left-3 z-[9999] flex gap-0.5 bg-white/90 p-0.5 rounded-full backdrop-blur-md border border-slate-200 shadow-sm">
          {[
            { id: 'user' as const, label: 'حريف', show: true },
            { id: 'garage' as const, label: 'جراج', show: true },
            { id: 'admin' as const, label: 'أدمن', show: adminAccess },
          ]
            .filter((tab) => tab.show)
            .map((tab) => (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-[10px] font-black transition-all',
                  view === tab.id
                    ? tab.id === 'admin'
                      ? 'bg-purple-600 text-white'
                      : 'bg-blue-600 text-white'
                    : 'text-slate-600'
                )}
              >
                {tab.label}
              </button>
            ))}
        </div>

        <main className="flex-1 overflow-hidden bg-white">
          {!dataLoaded ? (
            <div className="h-full bg-white flex flex-col items-center justify-center">
              <div className="text-4xl mb-4 animate-bounce">🚗</div>
              <p className="text-slate-600 text-sm font-bold animate-pulse">
                جاري تحميل البيانات...
              </p>
            </div>
          ) : view === 'admin' && adminAccess ? (
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
                key={safeScreen}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="h-full overflow-y-auto bg-white text-slate-900"
              >
                {safeScreen === 'splash' && <SplashScreen />}

                {!currentUser && safeScreen !== 'splash' && <RegisterScreen />}

                {currentUser && (
                  <>
                    {safeScreen === 'list' && <GarageListScreen />}
                    {safeScreen === 'waiting' && <WaitingScreen />}
                    {safeScreen === 'navigation' && <NavigationScreen />}
                    {safeScreen === 'session' && <SessionScreen />}
                    {safeScreen === 'lastSession' && <LastSessionScreen />}
                    {safeScreen === 'chat' && <ChatScreen />}
                  </>
                )}

                {safeScreen === 'summary' && <SummaryScreen />}
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