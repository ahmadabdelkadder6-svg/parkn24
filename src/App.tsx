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

/* ════════════════════════════════════════════════════════════
   👑 MOLTEN GOLD HOURGLASS ENGINE (سيمفونية الوقت الفاخرة برمجياً)
   ════════════════════════════════════════════════════════════ */
interface AuroraLandingProps {
  onEnter: () => void;
}

function AuroraLanding({ onEnter }: AuroraLandingProps) {
  const [isExiting, setIsExiting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleEnter = () => {
    setIsExiting(true);
    setTimeout(() => onEnter(), 500);
  };

  // ⏳ محاكاة حركة حبات الرمل الذهبية المنصهرة وتحدي الجاذبية
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const grains: {
      x: number;
      y: number;
      size: number;
      speedY: number;
      speedX: number;
      alpha: number;
      angle: number;
      color: string;
    }[] = [];

    const grainColors = [
      'rgba(212, 175, 55, ',
      'rgba(255, 223, 0, ',
      'rgba(245, 158, 11, ',
      'rgba(251, 191, 36, ',
    ];

    const createGrain = (x: number, y: number, isFloating = false) => {
      const colorBase = grainColors[Math.floor(Math.random() * grainColors.length)];
      return {
        x: x + (Math.random() - 0.5) * 12,
        y: y,
        size: Math.random() * 2 + 1,
        speedY: isFloating ? -(Math.random() * 0.4 + 0.2) : Math.random() * 1.5 + 0.8,
        speedX: (Math.random() - 0.5) * 0.5,
        alpha: Math.random() * 0.6 + 0.4,
        angle: Math.random() * Math.PI * 2,
        color: colorBase,
      };
    };

    const centerX = width / 2;
    const centerY = height * 0.42;
    const glassHeight = 180;
    const neckY = centerY;

    const render = () => {
      ctx.fillStyle = 'rgba(3, 7, 18, 0.2)';
      ctx.fillRect(0, 0, width, height);

      const glassGlow = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, 120);
      glassGlow.addColorStop(0, 'rgba(0, 102, 255, 0.08)');
      glassGlow.addColorStop(0.5, 'rgba(212, 175, 55, 0.04)');
      glassGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = glassGlow;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 140, 0, Math.PI * 2);
      ctx.fill();

      if (grains.length < 180) {
        grains.push(createGrain(centerX + (Math.random() - 0.5) * 40, centerY - glassHeight / 2));
        grains.push(createGrain(centerX + (Math.random() - 0.5) * 40, centerY + glassHeight / 2, true));
      }

      for (let i = grains.length - 1; i >= 0; i--) {
        const p = grains[i];
        p.x += p.speedX;
        p.y += p.speedY;
        p.angle += 0.02;

        const distFromNeck = Math.abs(p.y - neckY);
        if (distFromNeck < 40) {
          p.x += (centerX - p.x) * 0.12;
        }

        ctx.shadowColor = '#D4AF37';
        ctx.shadowBlur = Math.sin(p.angle) * 4 + 4;
        ctx.fillStyle = `${p.color}${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        if (p.y > centerY + glassHeight / 2 + 10 || p.y < centerY - glassHeight / 2 - 10) {
          grains.splice(i, 1);
        }
      }

      ctx.strokeStyle = 'rgba(212, 175, 55, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(centerX - 50, centerY - glassHeight / 2);
      ctx.lineTo(centerX + 50, centerY - glassHeight / 2);
      ctx.lineTo(centerX - 10, centerY);
      ctx.lineTo(centerX - 50, centerY + glassHeight / 2);
      ctx.lineTo(centerX + 50, centerY + glassHeight / 2);
      ctx.lineTo(centerX + 10, centerY);
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = '#0066FF';
      ctx.shadowColor = '#0066FF';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(centerX - 50, centerY - glassHeight / 2, 3, 0, Math.PI * 2);
      ctx.arc(centerX + 50, centerY - glassHeight / 2, 3, 0, Math.PI * 2);
      ctx.arc(centerX - 50, centerY + glassHeight / 2, 3, 0, Math.PI * 2);
      ctx.arc(centerX + 50, centerY + glassHeight / 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="fixed inset-0 z-[999999]"
          style={{
            background: '#03050c',
            fontFamily: "'Cairo', sans-serif",
            overflow: 'hidden',
          }}
        >
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Cairo:wght@400;600;700;800;900&display=swap');
            
            @keyframes moltenGlow {
              0% { opacity: 0.4; transform: translate(-50%, -30%) scale(0.95); }
              50% { opacity: 0.7; transform: translate(-50%, -20%) scale(1.1); }
              100% { opacity: 0.4; transform: translate(-50%, -30%) scale(0.95); }
            }
          `}</style>

          <section
            style={{
              position: 'relative',
              width: '100%',
              height: '100vh',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(ellipse at 50% 40%, #081125 0%, #030610 60%, #010206 100%)',
              }}
            />

            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                width: '140vw',
                height: '70vh',
                background: 'radial-gradient(ellipse at 50% 20%, rgba(0, 102, 255, 0.22) 0%, rgba(212, 175, 55, 0.12) 45%, transparent 75%)',
                filter: 'blur(55px)',
                animation: 'moltenGlow 6s ease-in-out infinite',
                pointerEvents: 'none',
              }}
            />

            <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }} />

            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              style={{
                position: 'relative',
                zIndex: 50,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                paddingTop: '40px',
              }}
            >
              <div
                style={{
                  background: 'rgba(3, 7, 18, 0.75)',
                  border: '1.5px solid rgba(212, 175, 55, 0.35)',
                  padding: '12px 20px',
                  borderRadius: '24px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 24px rgba(212, 175, 55, 0.15)',
                  backdropFilter: 'blur(16px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <svg
                  width="34"
                  height="34"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#D4AF37"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    filter: 'drop-shadow(0 0 8px rgba(212,175,55,0.8))',
                  }}
                >
                  <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C1.4 11 1 11.9 1 13v3c0 .6.4 1 1 1h2" />
                  <circle cx="7" cy="17" r="2" />
                  <path d="M9 17h6" />
                  <circle cx="17" cy="17" r="2" />
                </svg>
                <span
                  style={{
                    color: '#ffffff',
                    fontWeight: 900,
                    fontSize: '18px',
                    letterSpacing: '0.5px',
                    textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                  }}
                >
                  Park'n <span style={{ color: '#D4AF37' }}>24</span>
                </span>
              </div>
            </motion.div>

            <div
              style={{
                position: 'relative',
                zIndex: 40,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                paddingLeft: '24px',
                paddingRight: '24px',
                paddingBottom: '50px',
              }}
            >
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
                  background: 'rgba(3, 7, 18, 0.75)',
                  border: '1px solid rgba(212, 175, 55, 0.35)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                  direction: 'rtl',
                  marginBottom: '18px',
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
                        background: 'linear-gradient(135deg, #D4AF37, #F59E0B)',
                        border: '2px solid rgba(3,7,18,0.9)',
                        marginRight: i === 0 ? 0 : '-8px',
                      }}
                    />
                  ))}
                </div>
                <span
                  style={{
                    fontSize: '12px',
                    color: 'rgba(255,255,255,0.95)',
                    fontWeight: 700,
                  }}
                >
                  انضم لأكثر من{' '}
                  <strong style={{ color: '#FFE082', fontWeight: 900 }}>10 آلاف سائق</strong>
                </span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.25, ease: 'easeOut' }}
                style={{
                  fontWeight: 900,
                  fontSize: 'clamp(2.1rem, 6.2vw, 3.5rem)',
                  lineHeight: 1.25,
                  letterSpacing: '-0.02em',
                  color: '#ffffff',
                  direction: 'rtl',
                  textShadow: '0 4px 24px rgba(0,0,0,0.8)',
                }}
              >
                دقائقك ثمينة...
                <br />
                <span
                  style={{
                    background: 'linear-gradient(135deg, #FFE082 0%, #D4AF37 50%, #F59E0B 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    filter: 'drop-shadow(0 2px 14px rgba(212,175,55,0.4))',
                  }}
                >
                  لا تضيعها في البحث عن ركنة
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.42, ease: 'easeOut' }}
                style={{
                  marginTop: '14px',
                  fontSize: '14px',
                  lineHeight: 1.7,
                  color: 'rgba(255,255,255,0.82)',
                  fontWeight: 600,
                  maxWidth: '360px',
                  direction: 'rtl',
                  textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                }}
              >
                رصيد وقتك يستحق الحفاظ عليه. رتب أولوياتك، احجز مكانك بثوانٍ وانطلق بذكاء ⚡
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.58, ease: 'easeOut' }}
                style={{ marginTop: '28px', width: '100%', maxWidth: '300px' }}
              >
                <motion.button
                  onClick={handleEnter}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  style={{
                    width: '100%',
                    padding: '18px 36px',
                    borderRadius: '999px',
                    background: 'linear-gradient(135deg, #D4AF37 0%, #F59E0B 100%)',
                    color: '#03050c',
                    fontSize: '17px',
                    fontWeight: 900,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 10px 32px rgba(212,175,55,0.45), 0 0 20px rgba(251,191,36,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    textShadow: '0 1px 1px rgba(255,255,255,0.2)',
                  }}
                >
                  <span>يلا نبدأ</span>
                  <span style={{ fontSize: '20px' }}>🚀</span>
                </motion.button>
              </motion.div>
            </div>
          </section>
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