import { useEffect, useRef, useState, useMemo, lazy, Suspense, Component, ErrorInfo, ReactNode, memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster, toast } from 'react-hot-toast';
import { useStore, setupRealtime, normalizePlate, normalizePhone, getServerNow } from './store';
import { cn } from './utils/cn';

// Lazy loading screens
import AuthGate from './components/AuthGate';
import SplashScreen from './components/SplashScreen';
import RegisterScreen from './components/RegisterScreen';
import GarageListScreen from './components/GarageListScreen';
import WaitingScreen from './components/WaitingScreen';
import NavigationScreen from './components/NavigationScreen';
import SessionScreen from './components/SessionScreen';
import GarageLoginScreen from './components/GarageLoginScreen';
import InstallPWA from './components/InstallPWA';
import LastSessionScreen from './components/LastSessionScreen';
import ChatScreen from './components/ChatScreen';
import InstallPage from './components/InstallPage';
import InstallQRCodePage from './components/InstallQRCodePage';
import ShieldLandingPage from './components/ShieldLandingPage';

const GarageDashboard = lazy(() => import('./components/GarageDashboard'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));

let isRealtimeInitialized = false;

const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  setItem: (key: string, value: string): void => {
    try { localStorage.setItem(key, value); } catch {}
  },
  removeItem: (key: string): void => {
    try { localStorage.removeItem(key); } catch {}
  }
};

class ErrorBoundary extends Component<{ children?: ReactNode }, { hasError: boolean }> {
  public state = { hasError: false };
  public static getDerivedStateFromError(_: Error) { return { hasError: true }; }
  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App Crash:', error, errorInfo);
  }
  public render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center" dir="rtl">
          <div className="text-5xl mb-4">🚗</div>
          <h2 className="text-xl font-black mb-2">تحديث لحظي ذكي</h2>
          <p className="text-slate-400 text-xs mb-6">حدث خطأ غير متوقع، اضغط لإعادة التحميل</p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.href = '/'; }}
            className="bg-blue-600 text-white font-black px-8 py-4 rounded-2xl text-sm active:scale-95 transition-all shadow-lg"
          >
            🔄 إعادة التحميل
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// 🎯 مكوّن المراقبة الخفي: يعمل بـ Selectors ذرية بدون التأثير على أداء الواجهات
const SessionWatcher = memo(function SessionWatcher({ dataLoaded }: { dataLoaded: boolean }) {
  const view = useStore((s) => s.view);
  const screen = useStore((s) => s.screen);
  const setScreen = useStore((s) => s.setScreen);
  const currentUser = useStore((s) => s.currentUser);
  const sessions = useStore((s) => s.sessions);
  const incomingCars = useStore((s) => s.incomingCars);
  const acknowledgedSessionIds = useStore((s) => s.acknowledgedSessionIds);
  const setSelectedGarageId = useStore((s) => s.setSelectedGarageId);

  const prevActiveSessionRef = useRef<string | null>(null);
  const noSessionCountRef = useRef(0);
  const lastActiveTimeRef = useRef(0);
  const sessionEndToastShown = useRef(false);
  const sessionTransitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. مراقبة الجلسات وتوجيه المستخدم التلقائي
  useEffect(() => {
    if (!dataLoaded || !currentUser || view !== 'user') return;

    const userPlate = normalizePlate(currentUser.carPlate);
    const userPhone = currentUser.phone ? normalizePhone(currentUser.phone) : '';

    const myActiveSession = sessions.find((s) => {
      if (s.status !== 'active') return false;
      if (acknowledgedSessionIds?.has(s.id)) return false;
      const samePlate = !!userPlate && normalizePlate(s.carPlate) === userPlate;
      const sPhone = (s as any).customerPhone ? normalizePhone((s as any).customerPhone) : '';
      return samePlate || Boolean(userPhone && sPhone === userPhone);
    });

    const myIncoming = incomingCars.find((c) => {
      if (c.status !== 'coming') return false;
      const samePlate = !!userPlate && normalizePlate(c.carPlate) === userPlate;
      const cPhone = c.customerPhone ? normalizePhone(c.customerPhone) : '';
      return samePlate || Boolean(userPhone && cPhone === userPhone);
    });

    if (myActiveSession) {
      noSessionCountRef.current = 0;
      lastActiveTimeRef.current = getServerNow();
      sessionEndToastShown.current = false;

      if (sessionTransitionTimer.current) {
        clearTimeout(sessionTransitionTimer.current);
        sessionTransitionTimer.current = null;
      }

      if (myActiveSession.id !== prevActiveSessionRef.current) {
        prevActiveSessionRef.current = myActiveSession.id;
        setSelectedGarageId(myActiveSession.garageId);
        if (screen === 'navigation' || screen === 'waiting' || screen === 'splash') {
          setScreen('session');
        }
      }
      return;
    }

    if (myIncoming) {
      setSelectedGarageId(myIncoming.garageId);
      if (!['navigation', 'session', 'list', 'lastSession'].includes(screen)) {
        setScreen('navigation');
      }
      return;
    }

    // انتهاء الجلسة والرجوع لشاشة القائمة
    if (prevActiveSessionRef.current) {
      noSessionCountRef.current += 1;
      const timeSinceLastActive = getServerNow() - lastActiveTimeRef.current;
      if (noSessionCountRef.current < 3 || timeSinceLastActive < 8000) return;

      if (sessionTransitionTimer.current) return;

      sessionTransitionTimer.current = setTimeout(() => {
        sessionTransitionTimer.current = null;
        const freshState = useStore.getState();
        const freshPlate = normalizePlate(freshState.currentUser?.carPlate);
        const freshPhone = freshState.currentUser?.phone ? normalizePhone(freshState.currentUser.phone) : '';

        const stillActive = freshState.sessions.find((s) => {
          if (s.status !== 'active') return false;
          if (freshState.acknowledgedSessionIds?.has(s.id)) return false;
          const samePlate = !!freshPlate && normalizePlate(s.carPlate) === freshPlate;
          const sPhone = (s as any).customerPhone ? normalizePhone((s as any).customerPhone) : '';
          return samePlate || Boolean(freshPhone && sPhone === freshPhone);
        });

        if (stillActive) {
          noSessionCountRef.current = 0;
          prevActiveSessionRef.current = stillActive.id;
          return;
        }

        prevActiveSessionRef.current = null;
        noSessionCountRef.current = 0;

        if (['session', 'navigation', 'waiting'].includes(freshState.screen)) {
          if (!sessionEndToastShown.current) {
            sessionEndToastShown.current = true;
            toast.success('تم إنهاء الجلسة والعودة للرئيسية ✅');
          }
          setSelectedGarageId(null);
          safeLocalStorage.removeItem('selectedGarageId');
          setScreen('list');
        }
      }, 3000);
    }
  }, [sessions, incomingCars, currentUser, view, screen, dataLoaded, acknowledgedSessionIds, setSelectedGarageId, setScreen]);

  useEffect(() => {
    return () => {
      if (sessionTransitionTimer.current) clearTimeout(sessionTransitionTimer.current);
    };
  }, []);

  return null; // مكوّن منطقي فقط لا يرسم أي واجهة
});

const ParkLanding = memo(function ParkLanding({ onEnter }: { onEnter: () => void }) {
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = () => {
    setIsExiting(true);
    timerRef.current = setTimeout(() => onEnter(), 500);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.03, filter: 'blur(10px)' }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="fixed inset-0 z-[999999] flex flex-col justify-between overflow-hidden bg-slate-950"
          style={{ height: '100dvh' }}
        >
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            <img src="/hero-car.webp?v=999" alt="Park'n 24 Car" loading="eager" className="w-full h-full object-cover object-center" />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/40 to-slate-950/95" />
          </div>

          <motion.nav initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="w-full flex items-center justify-between px-6 py-6 z-20 relative" dir="ltr">
            <div className="flex flex-col leading-tight">
              <span className="font-black text-white text-base">بركن <span className="text-[#8cc63f]">24</span></span>
              <span className="font-black text-white text-lg">Park'n <span className="text-[#8cc63f]">24</span></span>
            </div>
            <button onClick={handleEnter} className="px-4 py-1.5 rounded-full bg-slate-900/60 backdrop-blur-md text-white font-bold text-xs border border-white/20">تخطي ✕</button>
          </motion.nav>

          <div className="px-6 pb-10 z-20 relative flex flex-col justify-end max-w-lg mx-auto w-full" dir="rtl">
            <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight">
              انسى لفة كل يوم..<br /><span className="text-blue-400">ركنتك مضمونة</span><br /><span className="text-[#8cc63f]">قبل ما توصل!</span>
            </h1>
            <p className="mt-3 text-slate-300 text-sm max-w-sm">
              مع Park'n 24، حدد وجهتك، اضمن مكانك في أقرب جراج، ووفر وقتك وبنزينك بضغطة زر واحدة.
            </p>
            <div className="mt-6">
              <button onClick={handleEnter} className="w-full sm:w-auto flex items-center justify-between gap-4 px-8 py-3.5 rounded-full bg-gradient-to-r from-blue-600 to-blue-700 text-white font-black shadow-lg shadow-blue-500/40 active:scale-95 transition-all">
                <span>احجز ركنتك الآن 🚀</span>
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

const VALID_SCREENS = ['splash', 'list', 'waiting', 'navigation', 'session', 'lastSession', 'chat'] as const;

export default function App() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const screen = useStore((s) => s.screen);
  const setScreen = useStore((s) => s.setScreen);
  const currentUser = useStore((s) => s.currentUser);
  const currentGarageId = useStore((s) => s.currentGarageId);
  const setCurrentGarageId = useStore((s) => s.setCurrentGarageId);
  const fetchAll = useStore((s) => s.fetchAll);

  const [dataLoaded, setDataLoaded] = useState(false);
  const [adminAccess, setAdminAccess] = useState(() => {
    const isUrlAdmin = window.location.pathname === '/admin' || window.location.hash === '#admin';
    if (isUrlAdmin) {
      safeLocalStorage.setItem('adminAccess', 'true');
      return true;
    }
    return safeLocalStorage.getItem('adminAccess') === 'true';
  });

  const [showLanding, setShowLanding] = useState(() => {
    return safeLocalStorage.getItem('parkn24_landing_last_date') !== new Date().toDateString();
  });

  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';

  useEffect(() => {
    if (window.location.pathname === '/admin' || window.location.hash === '#admin') {
      setAdminAccess(true);
      safeLocalStorage.setItem('adminAccess', 'true');
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const isUrlAdmin = window.location.pathname === '/admin' || window.location.hash === '#admin';
      const savedView = isUrlAdmin ? 'admin' : (safeLocalStorage.getItem('appView') || 'user');
      const savedScreen = safeLocalStorage.getItem('appScreen');

      setView(savedView as any);
      if (savedScreen && VALID_SCREENS.includes(savedScreen as any)) {
        setScreen(savedScreen as any);
      }

      try {
        await fetchAll();
      } catch (err) {
        console.error('Fetch error:', err);
      } finally {
        setDataLoaded(true);
      }

      if (!isRealtimeInitialized) {
        setupRealtime();
        isRealtimeInitialized = true;
      }
    };

    init();
  }, [setView, setScreen, fetchAll]);

  const safeScreen = useMemo(() => {
    if (!VALID_SCREENS.includes(screen as any)) {
      return currentUser ? 'list' : 'splash';
    }
    return screen;
  }, [screen, currentUser]);

  if (pathname === '/install') return <InstallPage />;
  if (pathname === '/qr') return <InstallQRCodePage />;
  if (new URLSearchParams(window.location.search).has('shield')) return <ShieldLandingPage />;

  return (
    <ErrorBoundary>
      {/* مراقب الجلسات يعمل في الخلفية دون تعطيل الواجهة */}
      <SessionWatcher dataLoaded={dataLoaded} />

      {showLanding && (
        <ParkLanding onEnter={() => {
          safeLocalStorage.setItem('parkn24_landing_last_date', new Date().toDateString());
          setShowLanding(false);
        }} />
      )}

      <AuthGate>
        <div className="max-w-md mx-auto h-dvh bg-white text-slate-900 relative flex flex-col overflow-hidden">
          {adminAccess && (
            <div className="absolute top-3.5 left-3.5 z-[9999] flex gap-1 bg-slate-950/90 p-1 rounded-full backdrop-blur-md border border-white/10 shadow-2xl">
              {[
                { id: 'user' as const, label: '👤 حريف' },
                { id: 'garage' as const, label: '🅿️ جراج' },
                { id: 'admin' as const, label: '👑 أدمن' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (tab.id === 'garage') {
                      safeLocalStorage.removeItem('currentGarageId');
                      setCurrentGarageId(null);
                    }
                    setView(tab.id);
                    fetchAll().catch(() => {});
                  }}
                  className={cn(
                    'px-4 py-2.5 rounded-full text-[11px] font-black transition-all duration-300 active:scale-95 outline-none border-none cursor-pointer',
                    view === tab.id
                      ? tab.id === 'admin'
                        ? 'bg-purple-600 text-white font-black shadow-lg shadow-purple-500/30'
                        : 'bg-blue-600 text-white font-black shadow-lg shadow-blue-500/30'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          <main className="flex-1 overflow-hidden bg-white">
            {view === 'admin' && adminAccess ? (
              <Suspense fallback={<Loader text="جاري فتح لوحة المشرف..." />}>
                <AdminDashboard />
              </Suspense>
            ) : view === 'garage' ? (
              currentGarageId ? (
                <Suspense fallback={<Loader text="جاري فتح لوحة الجراج..." />}>
                  <GarageDashboard />
                </Suspense>
              ) : (
                <GarageLoginScreen />
              )
            ) : !dataLoaded ? (
              <Loader text="جاري تحميل البيانات..." icon="🚗" />
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
                </motion.div>
              </AnimatePresence>
            )}
          </main>
          <Toaster position="top-center" />
          <InstallPWA />
        </div>
      </AuthGate>
    </ErrorBoundary>
  );
}

function Loader({ text, icon = '⚙️' }: { text: string; icon?: string }) {
  return (
    <div className="h-full bg-white flex flex-col items-center justify-center">
      <div className="text-3xl mb-3 animate-bounce">{icon}</div>
      <p className="text-slate-500 text-sm font-bold animate-pulse">{text}</p>
    </div>
  );
}