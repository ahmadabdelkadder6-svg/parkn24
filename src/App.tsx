import { useEffect, useRef, useState, useMemo, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { useStore, setupRealtime } from './store';
import { cn } from './utils/cn';

// Screens (تحميل مباشر للشاشات الخفيفة التي يحتاجها العميل فوراً)
import AuthGate from './components/AuthGate';
import SplashScreen from './components/SplashScreen';
import RegisterScreen from './components/RegisterScreen';
import GarageListScreen from './components/GarageListScreen';
import WaitingScreen from './components/WaitingScreen';
import NavigationScreen from './components/NavigationScreen';
import SessionScreen from './components/SessionScreen';
import SummaryScreen from './components/SummaryScreen';
import GarageLoginScreen from './components/GarageLoginScreen';
import InstallPWA from './components/InstallPWA';
import LastSessionScreen from './components/LastSessionScreen';
import ChatScreen from './components/ChatScreen';
import InstallPage from './components/InstallPage';
import InstallQRCodePage from './components/InstallQRCodePage';

// ⚡ [تسريع صاروخي]: تحميل كسول للوحات الإدارة الثقيلة
// لن يتم تحميل كودها إلا عند فتحها فعلياً (يوفر ~400KB من حجم التطبيق للعميل العادي)
const GarageDashboard = lazy(() => import('./components/GarageDashboard'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));

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

const ADMIN_SECRET_CODE = 'admin2025x';

export default function App() {
  const {
    view,
    setView,
    screen,
    setScreen,
    currentUser,
    currentGarageId,
    setCurrentGarageId,
    sessions,
    selectedGarageId,
    setSelectedGarageId,
    incomingCars,
    fetchAll,
    acknowledgedSessionIds,
  } = useStore();

  const prevActiveSessionRef = useRef<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const initialLoadDone = useRef(false);

  const noSessionCountRef = useRef(0);
  const lastActiveTimeRef = useRef(0);
  const sessionEndToastShown = useRef(false);
  const sessionTransitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [adminAccess, setAdminAccess] = useState(false);

  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';

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

  // ⚡ [التهيئة الصاروخية]: فتح الشاشة فوراً + جلب البيانات في الخلفية
  useEffect(() => {
    const init = async () => {
      const justInstalled = localStorage.getItem('pwaJustInstalled') === 'true';
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;

      if (justInstalled && isStandalone) {
        localStorage.removeItem('pwaJustInstalled');
        localStorage.setItem('appView', 'user');
        localStorage.setItem('appScreen', 'splash');
        localStorage.removeItem('selectedGarageId');
        setView('user');
        setScreen('splash');
        setSelectedGarageId(null);
      }

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

      const urlParams = new URLSearchParams(window.location.search);
      const isGarageFromURL = urlParams.has('garage');
      const isAdminFromURL =
        urlParams.get('admin') === ADMIN_SECRET_CODE ||
        window.location.pathname === '/admin' ||
        window.location.hash === '#admin';

      const savedView = localStorage.getItem('appView');
      const isGarageLoggedIn = localStorage.getItem('currentGarageId') || currentGarageId;
      const isAdminLoggedIn = localStorage.getItem('adminAccess') === 'true';

      if (isAdminFromURL) {
        setView('admin');
      } else if (isGarageFromURL) {
        setView('garage');
      } else if (savedView && (savedView === 'user' || savedView === 'garage' || savedView === 'admin')) {
        setView(savedView as any);
      } else {
        if (isAdminLoggedIn) {
          setView('admin');
        } else if (isGarageLoggedIn) {
          setView('garage');
        } else {
          setView('user');
        }
      }

      // ⚡ [صاروخي]: فتح الشاشة فوراً بدون انتظار fetchAll
      // البيانات المحفوظة محلياً (currentUser, garages) تكفي لعرض الواجهة الأولى
      setDataLoaded(true);
      initialLoadDone.current = true;

      // 🔄 جلب البيانات الجديدة في الخلفية بهدوء (Background Fetch)
      fetchAll().catch(e => console.error('Background fetch error:', e));
      setupRealtime();
    };

    init();
  }, []);

  useEffect(() => {
    if (view) {
      localStorage.setItem('appView', view);
    }
  }, [view]);

  useEffect(() => {
    if (!dataLoaded) return;
    if (!currentUser) return;
    if (view !== 'user') return;

    const userPlate = (currentUser.carPlate ?? '').trim().toUpperCase();

    const myActiveSession = sessions.find(
      (s) => s.carPlate.trim().toUpperCase() === userPlate && s.status === 'active'
    );

    const myIncoming = incomingCars.find(
      (c) => c.carPlate.trim().toUpperCase() === userPlate && c.status === 'coming'
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
            const freshAcknowledged = freshState.acknowledgedSessionIds;
            const isNotAcknowledged = freshAcknowledged ? !freshAcknowledged.has(lastCompleted.id) : true;
            if (isNotAcknowledged) {
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

  if (pathname === '/install') {
    return <InstallPage />;
  }

  if (pathname === '/qr') {
    return <InstallQRCodePage />;
  }

  return (
    <AuthGate>
      <div
        className="max-w-md mx-auto h-dvh bg-white text-slate-900 relative flex flex-col overflow-hidden"
        style={{ fontFamily: "'Cairo', sans-serif" }}
      >
        {adminAccess && (
          <div className="absolute top-3 left-3 z-[9999] flex gap-0.5 bg-white/90 p-0.5 rounded-full backdrop-blur-md border border-slate-200 shadow-sm">
            {[
              { id: 'user' as const, label: 'حريف' },
              { id: 'garage' as const, label: 'جراج' },
              { id: 'admin' as const, label: 'أدمن' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id === 'garage') {
                    localStorage.removeItem('currentGarageId');
                    localStorage.removeItem('garageRole');
                    localStorage.removeItem('valetNumber');
                    localStorage.removeItem('valetName');
                    localStorage.removeItem('garagePrefillUsername');
                    localStorage.removeItem('garagePrefillPhone');
                    setCurrentGarageId(null);
                  }
                  setView(tab.id);
                }}
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
        )}

        <main className="flex-1 overflow-hidden bg-white">
          {/* ⚡ [صاروخي]: لوحة الأدمن تُحمّل فقط عند الحاجة */}
          {view === 'admin' && adminAccess ? (
            <Suspense fallback={
              <div className="h-full bg-white flex flex-col items-center justify-center">
                <div className="text-3xl mb-3 animate-bounce">⚙️</div>
                <p className="text-slate-500 text-sm font-bold animate-pulse">جاري فتح لوحة المشرف...</p>
              </div>
            }>
              <AdminDashboard />
            </Suspense>
          ) : view === 'garage' ? (
            currentGarageId ? (
              /* ⚡ [صاروخي]: لوحة الجراج تُحمّل فقط عند الحاجة */
              <Suspense fallback={
                <div className="h-full bg-white flex flex-col items-center justify-center">
                  <div className="text-3xl mb-3 animate-bounce">🅿️</div>
                  <p className="text-slate-500 text-sm font-bold animate-pulse">جاري فتح لوحة الجراج...</p>
                </div>
              }>
                <GarageDashboard />
              </Suspense>
            ) : (
              <GarageLoginScreen />
            )
          ) : !dataLoaded ? (
            <div className="h-full bg-white flex flex-col items-center justify-center">
              <div className="text-4xl mb-4 animate-bounce">🚗</div>
              <p className="text-slate-600 text-sm font-bold animate-pulse">
                جاري تحميل البيانات...
              </p>
            </div>
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