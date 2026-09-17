import { useEffect, useRef, useState, useMemo, lazy, Suspense, Component, ErrorInfo, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
// 🌟 استيراد التوقيت الموحد ودوال البصمة الموحدة من الـ store لربط تقني متماسك
import { useStore, setupRealtime, normalizePlate, normalizePhone, getServerNow } from './store';
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
import InstallPWA from './components/InstallPWA';
import LastSessionScreen from './components/LastSessionScreen';
import ChatScreen from './components/ChatScreen';
import InstallPage from './components/InstallPage';
import InstallQRCodePage from './components/InstallQRCodePage';

// Lazy Components
const GarageDashboard = lazy(() => import('./components/GarageDashboard'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));

/* ════════════════════════════════════════════════════════════
   👑 AURORA LANDING COMPONENT (مدمج داخلياً لضمان نجاح الـ Build)
   ════════════════════════════════════════════════════════════ */
interface AuroraLandingProps {
  onEnter: () => void;
}

function AuroraLanding({ onEnter }: AuroraLandingProps) {
  const [isExiting, setIsExiting] = useState(false);

  const handleEnter = () => {
    setIsExiting(true);
    setTimeout(() => onEnter(), 500);
  };

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="fixed inset-0 z-[999999]"
          style={{
            background: '#000',
            fontFamily: "'Inter', sans-serif",
            overflow: 'hidden',
          }}
        >
          {/* تحميل خطوط الترحيب */}
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Cairo:wght@400;600;700;800;900&display=swap');
          `}</style>

          <section
            style={{
              position: 'relative',
              width: '100%',
              height: '100vh',
              overflow: 'hidden',
            }}
          >
            {/* 🎬 فيديو الخلفية المحسّن فائق السرعة */}
            <video
              src="https://pub-1e5b4001b36b47e28e6a2fb775966a79.r2.dev/templates/aurora/hero.mp4"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              disablePictureInPicture
              // @ts-ignore
              disableRemotePlayback
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'translateZ(0)',
              }}
            />

            {/* 🎨 طبقات التعتيم البصرية */}
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.20)' }} />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, transparent 30%, transparent 55%, rgba(0,0,0,0.35) 100%)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(to right, rgba(0,0,0,0.10) 0%, transparent 20%, transparent 80%, rgba(0,0,0,0.10) 100%)',
              }}
            />

            {/* ✨ التوهج الأخضر الفاخر */}
            <div
              style={{
                position: 'absolute',
                top: '-14%',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '1000px',
                height: '720px',
                background:
                  'radial-gradient(ellipse at 50% 30%, rgba(6,95,70,0.22) 0%, transparent 68%)',
                pointerEvents: 'none',
              }}
            />

            {/* 🚗 شعار السيارة الأيقوني في الأعلى */}
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 50,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '26px 44px',
              }}
            >
              <svg
                width="42"
                height="42"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                xmlns="http://www.w3.org/2000/svg"
                style={{
                  filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))',
                }}
              >
                <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C1.4 11 1 11.9 1 13v3c0 .6.4 1 1 1h2" />
                <circle cx="7" cy="17" r="2" />
                <path d="M9 17h6" />
                <circle cx="17" cy="17" r="2" />
              </svg>
            </motion.div>

            {/* 📝 النصوص والأزرار الترحيبية */}
            <div
              style={{
                position: 'relative',
                zIndex: 10,
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                justifyContent: 'flex-start',
                paddingTop: '24vh',
                paddingLeft: '64px',
                paddingRight: '24px',
              }}
            >
              {/* شارة الترحيب بعدد السائقين */}
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.1, ease: 'easeOut' }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  borderRadius: '999px',
                  padding: '6px 16px 6px 6px',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  width: 'fit-content',
                  direction: 'rtl',
                }}
              >
                <div style={{ display: 'flex' }}>
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '999px',
                        background: 'linear-gradient(135deg, #10b981, #047857)',
                        border: '2px solid rgba(10,20,16,0.9)',
                        marginRight: i === 0 ? 0 : '-8px',
                      }}
                    />
                  ))}
                </div>
                <span
                  style={{
                    fontSize: '12.5px',
                    color: 'rgba(255,255,255,0.85)',
                    fontFamily: "'Cairo', sans-serif",
                    fontWeight: 600,
                  }}
                >
                  انضم لأكثر من{' '}
                  <strong style={{ color: '#fff', fontWeight: 800 }}>10 آلاف سائق</strong>
                </span>
              </motion.div>

              {/* العنوان العربي المطور */}
              <motion.h1
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.25, ease: 'easeOut' }}
                style={{
                  fontFamily: "'Cairo', sans-serif",
                  fontWeight: 800,
                  fontSize: 'clamp(2.4rem, 4.6vw, 4.1rem)',
                  lineHeight: 1.15,
                  letterSpacing: '-0.01em',
                  color: '#fff',
                  marginTop: '22px',
                  maxWidth: '580px',
                  direction: 'rtl',
                  textShadow: '0 4px 20px rgba(0,0,0,0.35)',
                }}
              >
                اركن سيارتك
                <br />
                <span
                  style={{
                    background: 'linear-gradient(135deg, #6EE7B7 0%, #10b981 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  بضغطة زر واحدة
                </span>
              </motion.h1>

              {/* الوصف التحفيزي */}
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.42, ease: 'easeOut' }}
                style={{
                  marginTop: '16px',
                  fontSize: '15px',
                  lineHeight: 1.75,
                  color: 'rgba(255,255,255,0.75)',
                  fontFamily: "'Cairo', sans-serif",
                  fontWeight: 500,
                  maxWidth: '380px',
                  direction: 'rtl',
                }}
              >
                وفّر وقتك ومجهودك، احجز أقرب جراج ليك وادفع فورياً بدون فكة أو انتظار ⚡
              </motion.p>

              {/* زر البدء التفاعلي */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.58, ease: 'easeOut' }}
                style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '34px' }}
              >
                <motion.button
                  onClick={handleEnter}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  style={{
                    padding: '16px 34px',
                    borderRadius: '999px',
                    background: '#0a0a0a',
                    color: '#fff',
                    fontSize: '16px',
                    fontWeight: 800,
                    fontFamily: "'Cairo', sans-serif",
                    border: '1px solid rgba(255,255,255,0.18)',
                    cursor: 'pointer',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <span>يلا نبدأ</span>
                  <span style={{ fontSize: '18px' }}>🚀</span>
                </motion.button>
              </motion.div>

              {/* نص الضمان الفرعي */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.8, ease: 'easeOut' }}
                style={{
                  marginTop: '20px',
                  fontSize: '12px',
                  color: 'rgba(255,255,255,0.55)',
                  fontFamily: "'Cairo', sans-serif",
                  fontWeight: 600,
                  direction: 'rtl',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#10b981',
                    display: 'inline-block',
                    boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)',
                  }}
                />
                مجاناً • بدون تعقيدات • تجربة سلسة
              </motion.p>
            </div>
          </section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ⏱️ دالة تحويل التوقيت الشاملة للأرقام والـ ISO Strings
const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

// 🛡️ صمام الأمان المدمج مباشرة لمنع الشاشة البيضاء في حالة حدوث أي تحديث شبكي مفاجئ
class ErrorBoundary extends Component<{ children?: ReactNode }, { hasError: boolean }> {
  public state = { hasError: false };

  public static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App Error Boundary caught:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center" dir="rtl">
          <div className="text-5xl mb-4">🚗</div>
          <h2 className="text-xl font-black mb-2 font-sans">تحديث لحظي ذكي</h2>
          <p className="text-slate-400 text-xs font-bold mb-6">حدثنا بعض الخصائص، اضغط بالأسفل للعودة فوراً لمتابعة حجزك</p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              window.location.href = '/';
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white font-black px-8 py-4 rounded-2xl text-sm active:scale-95 transition-all shadow-lg"
            style={{ boxShadow: '0 6px 20px rgba(37,99,235,0.35)' }}
          >
            🔄 إعادة تحميل التطبيق ومتابعة الحجز
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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

  // 🟢 حالة الحماية للتحقق من عرض شاشة الترحيب مرة واحدة في الـ Session
  const [showLanding, setShowLanding] = useState(true);

  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';

  useEffect(() => {
    const shown = sessionStorage.getItem('landingShown') === 'true';
    if (shown) {
      setShowLanding(false);
    }
  }, []);

  const handleEnterLanding = () => {
    sessionStorage.setItem('landingShown', 'true');
    setShowLanding(false);
  };

  useEffect(() => {
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

      setDataLoaded(true);
      initialLoadDone.current = true;

      fetchAll().catch((e) => console.error('Background fetch error:', e));
      setupRealtime();
    };

    init();
  }, []);

  useEffect(() => {
    if (view) {
      localStorage.setItem('appView', view);
    }
  }, [view]);

  // فحص الجلسة عند التحميل المبدئي
  useEffect(() => {
    if (!dataLoaded) return;
    if (!currentUser) return;
    if (view !== 'user') return;

    const userPlate = normalizePlate(currentUser.carPlate);
    const userPhone = currentUser.phone ? normalizePhone(currentUser.phone) : '';

    const myActiveSession = sessions.find((s) => {
      if (s.status !== 'active') return false;
      const samePlate = !!userPlate && normalizePlate(s.carPlate) === userPlate;
      const sPhone = (s as any).customerPhone ? normalizePhone((s as any).customerPhone) : '';
      const samePhone = Boolean(userPhone && sPhone === userPhone);
      return samePlate || samePhone;
    });

    const myIncoming = incomingCars.find((c) => {
      if (c.status !== 'coming') return false;
      const samePlate = !!userPlate && normalizePlate(c.carPlate) === userPlate;
      const cPhone = c.customerPhone ? normalizePhone(c.customerPhone) : '';
      const samePhone = Boolean(userPhone && cPhone === userPhone);
      return samePlate || samePhone;
    });

    if (myActiveSession) {
      prevActiveSessionRef.current = myActiveSession.id;
      lastActiveTimeRef.current = getServerNow();
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
        .filter((s) => {
          if (s.status !== 'completed') return false;
          const samePlate = !!userPlate && normalizePlate(s.carPlate) === userPlate;
          const sPhone = (s as any).customerPhone ? normalizePhone((s as any).customerPhone) : '';
          const samePhone = Boolean(userPhone && sPhone === userPhone);
          return samePlate || samePhone;
        })
        .sort((a, b) => toMs(b.endTime) - toMs(a.endTime))[0];

      if (lastCompleted) {
        const endTime = toMs(lastCompleted.endTime);
        const timeSinceEnd = getServerNow() - endTime;

        const freshAcknowledged = acknowledgedSessionIds;
        const isNotAcknowledged = freshAcknowledged ? !freshAcknowledged.has(lastCompleted.id) : true;

        if (endTime > 0 && timeSinceEnd < 60000 && isNotAcknowledged) {
          setSelectedGarageId(lastCompleted.garageId);
          setScreen('summary');
          return;
        }
      }

      setSelectedGarageId(null);
      setScreen('list');
    }
  }, [dataLoaded]);

  // مراقبة الجلسة والتنقل اللحظي الفوري بين الشاشات
  useEffect(() => {
    if (!dataLoaded) return;
    if (!currentUser || view !== 'user') return;

    const userPlate = normalizePlate(currentUser.carPlate);
    const userPhone = currentUser.phone ? normalizePhone(currentUser.phone) : '';

    const myActiveSession = sessions.find((s) => {
      if (s.status !== 'active') return false;
      const samePlate = !!userPlate && normalizePlate(s.carPlate) === userPlate;
      const sPhone = (s as any).customerPhone ? normalizePhone((s as any).customerPhone) : '';
      const samePhone = Boolean(userPhone && sPhone === userPhone);
      return samePlate || samePhone;
    });

    const myIncoming = incomingCars.find((c) => {
      if (c.status !== 'coming') return false;
      const samePlate = !!userPlate && normalizePlate(c.carPlate) === userPlate;
      const cPhone = c.customerPhone ? normalizePhone(c.customerPhone) : '';
      const samePhone = Boolean(userPhone && cPhone === userPhone);
      return samePlate || samePhone;
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
      const timeSinceLastActive = getServerNow() - lastActiveTimeRef.current;

      if (noSessionCountRef.current < 3 || timeSinceLastActive < 8000) {
        return;
      }

      if (sessionTransitionTimer.current) return;

      sessionTransitionTimer.current = setTimeout(() => {
        sessionTransitionTimer.current = null;
        const freshState = useStore.getState();
        const freshPlate = normalizePlate(freshState.currentUser?.carPlate);
        const freshPhone = freshState.currentUser?.phone ? normalizePhone(freshState.currentUser.phone) : '';

        const stillActive = freshState.sessions.find((s) => {
          if (s.status !== 'active') return false;
          const samePlate = !!freshPlate && normalizePlate(s.carPlate) === freshPlate;
          const sPhone = (s as any).customerPhone ? normalizePhone((s as any).customerPhone) : '';
          const samePhone = Boolean(freshPhone && sPhone === freshPhone);
          return samePlate || samePhone;
        });

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
            .filter((s) => {
              if (s.status !== 'completed') return false;
              const samePlate = !!freshPlate && normalizePlate(s.carPlate) === freshPlate;
              const sPhone = (s as any).customerPhone ? normalizePhone((s as any).customerPhone) : '';
              const samePhone = Boolean(freshPhone && sPhone === freshPhone);
              return samePlate || samePhone;
            })
            .sort((a, b) => toMs(b.endTime) - toMs(a.endTime))[0];

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
        const freshPlate = normalizePlate(freshState.currentUser?.carPlate);
        const freshPhone = freshState.currentUser?.phone ? normalizePhone(freshState.currentUser.phone) : '';

        const freshIncoming = freshState.incomingCars.find((c) => {
          if (c.status !== 'coming') return false;
          const samePlate = !!freshPlate && normalizePlate(c.carPlate) === freshPlate;
          const cPhone = c.customerPhone ? normalizePhone(c.customerPhone) : '';
          const samePhone = Boolean(freshPhone && cPhone === freshPhone);
          return samePlate || samePhone;
        });

        const freshSession = freshState.sessions.find((s) => {
          if (s.status !== 'active') return false;
          const samePlate = !!freshPlate && normalizePlate(s.carPlate) === freshPlate;
          const sPhone = (s as any).customerPhone ? normalizePhone((s as any).customerPhone) : '';
          const samePhone = Boolean(freshPhone && sPhone === freshPhone);
          return samePlate || samePhone;
        });

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
    <ErrorBoundary>
      {/* 🟢 شاشة الترحيب الفاخرة لـ Aurora تظهر قبل الدخول للتطبيق */}
      {showLanding && <AuroraLanding onEnter={handleEnterLanding} />}

      <AuthGate>
        <div
          className="max-w-md mx-auto h-dvh bg-white text-slate-900 relative flex flex-col overflow-hidden"
          style={{ fontFamily: "'Cairo', sans-serif" }}
        >
          {/* 👑 شريط الأدمن العلوي الزجاجي الداكن الفاخر بنصوص بيضاء عريضة جداً */}
          {adminAccess && (
            <div 
              className="absolute top-3.5 left-3.5 z-[9999] flex gap-1 bg-slate-950/90 p-1 rounded-full backdrop-blur-md border border-white/10 shadow-2xl"
              style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.24)' }}
            >
              {[
                { id: 'user' as const, label: '👤 حريف' },
                { id: 'garage' as const, label: '🅿️ جراج' },
                { id: 'admin' as const, label: '👑 أدمن' },
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
                    'px-4 py-2.5 rounded-full text-[11px] font-black transition-all duration-300 active:scale-95 outline-none border-none cursor-pointer',
                    view === tab.id
                      ? tab.id === 'admin'
                        ? 'bg-purple-600 text-white font-black shadow-lg shadow-purple-500/30'
                        : 'bg-blue-600 text-white font-black shadow-lg shadow-blue-500/30'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  )}
                  style={{ 
                    fontWeight: 950,
                    textShadow: '0 1px 2px rgba(0,0,0,0.2)'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
          <main className="flex-1 overflow-hidden bg-white">
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
    </ErrorBoundary>
  );
}