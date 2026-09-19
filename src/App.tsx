import { useEffect, useRef, useState, useMemo, lazy, Suspense, Component, ErrorInfo, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
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

const GarageDashboard = lazy(() => import('./components/GarageDashboard'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));

const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

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

/* ════════════════════════════════════════════════════════════
   🛡️ PARK'N 24 BRAND LOGO (مستوحى من الشعار المرفق)
   ════════════════════════════════════════════════════════════ */
function ParkShieldLogo({ width = 36, height = 42 }: { width?: number; height?: number }) {
  return (
    <svg viewBox="0 0 100 115" width={width} height={height} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* الدرع الأزرق الخارجي */}
      <path d="M50 2 C78 2, 98 14, 98 26 C98 76, 75 104, 50 114 C25 104, 2 76, 2 26 C2 14, 22 2, 50 2 Z" fill="#1656b8" />
      {/* الإطار الداخلي للدرع */}
      <path d="M50 8 C72 8, 90 18, 90 28 C90 70, 70 96, 50 105 C30 96, 10 70, 10 28 C10 18, 28 8, 50 8 Z" stroke="#ffffff" strokeWidth="2.5" fill="none" opacity="0.95" />
      
      {/* حرف P الأخضر الكبيرة */}
      <path d="M26 30 H48 C60 30, 62 48, 48 48 H38 V78 H26 V30 Z M38 38 V40 H46 C48 40, 48 38, 46 38 Z" fill="#8cc63f" />
      
      {/* أيقونة الساعة 24 فوق الـ P */}
      <path d="M64 30 A 10 10 0 1 1 58 44" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <polyline points="64 34, 64 40, 68 40" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <text x="69" y="52" fill="#ffffff" fontSize="9" fontWeight="900" fontFamily="sans-serif">24</text>
      
      {/* أيقونة السيارة البيضاء تحت الـ P */}
      <path d="M58 64 L62 58 H74 L78 64 H80 C81.5 64 82 65 82 66.5 V72 H54 V66.5 C54 65 54.5 64 56 64 Z" fill="#ffffff" />
      <circle cx="61" cy="72" r="2.2" fill="#1656b8" />
      <circle cx="75" cy="72" r="2.2" fill="#1656b8" />
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════
   ☀️ PARK'N 24 HERO — OPTION 1 IMPLEMENTATION
   ════════════════════════════════════════════════════════════ */
interface ParkLandingProps {
  onEnter: () => void;
}

function ParkLanding({ onEnter }: ParkLandingProps) {
  const [isExiting, setIsExiting] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const handleEnter = () => {
    setIsExiting(true);
    setTimeout(() => onEnter(), 600);
  };

  const BRAND_BLUE = '#1656b8';
  const BRAND_GREEN = '#8cc63f';

  useEffect(() => {
    const img = new Image();
    img.src = 'https://images.unsplash.com/photo-1617531653332-bd46c24f2068?auto=format&fit=crop&w=1200&q=80';
    img.onload = () => setImgLoaded(true);
    const t = setTimeout(() => setImgLoaded(true), 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.02, filter: 'blur(8px)' }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="fixed inset-0 z-[999999]"
          style={{
            background: 'linear-gradient(180deg, #7db9e8 0%, #c4e0f5 40%, #e8f4f8 100%)',
            overflow: 'hidden',
            height: '100dvh',
          }}
        >
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=Inter+Tight:wght@400;500;600;700;800&display=swap');

            .hero-block {
              animation: rise-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
            }
            .delay-1 { animation-delay: 0.1s; }
            .delay-2 { animation-delay: 0.2s; }
            .delay-3 { animation-delay: 0.3s; }

            @keyframes rise-up {
              from { opacity: 0; transform: translateY(20px); }
              to { opacity: 1; transform: none; }
            }

            .car-image {
              opacity: 0;
              transform: scale(1.05) translateY(10px);
              transition: opacity 1.4s cubic-bezier(0.16, 1, 0.3, 1), transform 2.6s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .car-image.is-loaded {
              opacity: 1;
              transform: scale(1) translateY(0);
            }

            .btn-brand {
              display: inline-flex;
              align-items: center;
              gap: 12px;
              padding: 0.7em 0.8em 0.7em 2em;
              border-radius: 999px;
              background: ${BRAND_BLUE};
              color: #fff;
              font-weight: 800;
              font-family: 'Cairo', sans-serif;
              box-shadow: 0 10px 30px rgba(22, 86, 184, 0.35);
              transition: transform 0.3s ease, box-shadow 0.3s ease;
              border: 0;
              cursor: pointer;
            }
            .btn-brand:hover {
              transform: translateY(-3px);
              box-shadow: 0 15px 40px rgba(22, 86, 184, 0.45);
            }

            .btn-skip {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              padding: 0.6em 1.2em;
              border-radius: 999px;
              background: rgba(255, 255, 255, 0.85);
              backdrop-filter: blur(10px);
              -webkit-backdrop-filter: blur(10px);
              color: ${BRAND_BLUE};
              font-family: 'Cairo', sans-serif;
              font-weight: 800;
              box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
              transition: transform 0.3s ease, background 0.3s ease;
              border: 1px solid rgba(255,255,255,0.7);
              cursor: pointer;
            }
            .btn-skip:hover {
              transform: translateY(-2px);
              background: #fff;
            }

            @media (prefers-reduced-motion: reduce) {
              .hero-block { animation: none; }
              .car-image { opacity: 1; transform: none; }
            }
          `}</style>

          {/* 🚗 صورة السيارة المصغرة */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '58dvh',
              zIndex: 1,
            }}
          >
            <img
              className={`car-image ${imgLoaded ? 'is-loaded' : ''}`}
              src="https://images.unsplash.com/photo-1617531653332-bd46c24f2068?auto=format&fit=crop&w=1200&q=80"
              alt="Park'n 24 Car"
              aria-hidden="true"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center 80%',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 25%, black 100%)',
                maskImage: 'linear-gradient(to bottom, transparent 0%, black 25%, black 100%)',
              }}
            />
          </div>

          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 2,
              background: 'linear-gradient(to bottom, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 65%)',
              pointerEvents: 'none',
            }}
          />

          {/* 🛡️ شريط التنقل العلوي بالاسم فقط (عربي وإنجليزي) */}
          <motion.nav
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 50,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px 24px',
              direction: 'ltr',
            }}
          >
            {/* النص العربي والإنجليزي متراكبان بأسلوب واضح وأنيق على اليسار */}
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.15' }}>
              <span
                style={{
                  fontFamily: "'Cairo', sans-serif",
                  fontSize: '15px',
                  fontWeight: 900,
                  color: BRAND_BLUE,
                  letterSpacing: '-0.01em',
                }}
              >
                بركن <span style={{ color: BRAND_GREEN }}>24</span>
              </span>
              <span
                style={{
                  fontFamily: "'Inter Tight', sans-serif",
                  fontSize: '17px',
                  fontWeight: 900,
                  letterSpacing: '-0.02em',
                  color: BRAND_BLUE,
                }}
              >
                Park'n <span style={{ color: BRAND_GREEN }}>24</span>
              </span>
            </div>

            <button
              onClick={handleEnter}
              className="btn-skip"
              style={{ fontSize: '13px', direction: 'rtl' }}
            >
              تخطي 
            </button>
          </motion.nav>

          {/* 📝 المحتوى التحفيزي */}
          <div
            style={{
              position: 'relative',
              zIndex: 10,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              padding: '16dvh 24px 26px 24px',
              direction: 'rtl',
            }}
          >
            <div style={{ maxWidth: '640px' }}>
              
              <h1
                className="hero-block delay-1"
                style={{
                  fontFamily: "'Cairo', sans-serif",
                  fontSize: 'clamp(2.2rem, 6.8vw, 4.8rem)',
                  fontWeight: 900,
                  lineHeight: 1.15,
                  letterSpacing: '-0.02em',
                  color: '#0f172a',
                }}
              >
                انسى لفة كل يوم..<br />
                <span style={{ color: BRAND_BLUE }}>ركنتك مضمونة</span><br />
                <span style={{ color: BRAND_GREEN }}>قبل ما توصل!</span>
              </h1>

              <p
                className="hero-block delay-2"
                style={{
                  marginTop: '16px',
                  maxWidth: '360px',
                  fontFamily: "'Cairo', sans-serif",
                  fontSize: '15px',
                  lineHeight: 1.6,
                  color: '#334155',
                  fontWeight: 700,
                }}
              >
                مع Park'n 24، الشارع أسهل بكتير. حدد وجهتك، اضمن مكانك في أقرب جراج، ووفر وقتك وبنزينك بضغطة زر واحدة.
              </p>

              <div
                className="hero-block delay-3"
                style={{
                  marginTop: '28px',
                }}
              >
                <button
                  onClick={handleEnter}
                  className="btn-brand"
                  style={{ fontSize: '16px' }}
                >
                  <span>احجز ركنتك الآن 🚀</span>
                  <span
                    style={{
                      display: 'grid',
                      placeItems: 'center',
                      width: '2.4em',
                      height: '2.4em',
                      borderRadius: '999px',
                      background: '#fff',
                      color: BRAND_BLUE,
                    }}
                  >
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ width: '1.2em', height: '1.2em', transform: 'scaleX(-1)' }}
                    >
                      <path d="M4 10h12M11 5l5 5-5 5" />
                    </svg>
                  </span>
                </button>
              </div>

            </div>
          </div>

        </motion.div>
      )}
    </AnimatePresence>
  );
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

  const [showLanding, setShowLanding] = useState(() => {
    const today = new Date().toDateString();
    const lastShownDate = localStorage.getItem('parkn24_landing_last_date');
    return lastShownDate !== today;
  });

  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';

  const handleEnterLanding = () => {
    const today = new Date().toDateString();
    localStorage.setItem('parkn24_landing_last_date', today);
    setShowLanding(false);
  };

  useEffect(() => {
    if (document.getElementById('google-fonts-optimized')) return;

    const preconnect1 = document.createElement('link');
    preconnect1.rel = 'preconnect';
    preconnect1.href = 'https://fonts.googleapis.com';
    document.head.appendChild(preconnect1);

    const preconnect2 = document.createElement('link');
    preconnect2.rel = 'preconnect';
    preconnect2.href = 'https://fonts.gstatic.com';
    preconnect2.crossOrigin = 'anonymous';
    document.head.appendChild(preconnect2);

    const link = document.createElement('link');
    link.id = 'google-fonts-optimized';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=Inter+Tight:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(link);
  }, []);

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
      {showLanding && <ParkLanding onEnter={handleEnterLanding} />}

      <AuthGate>
        <div
          className="max-w-md mx-auto h-dvh bg-white text-slate-900 relative flex flex-col overflow-hidden"
          style={{ fontFamily: "'Cairo', 'Noto Sans Arabic', system-ui, sans-serif" }}
        >
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