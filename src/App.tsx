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
   👑 AURORA LANDING COMPONENT (المشهد السينمائي للأسفلت المبلل والسيارة الفاخرة)
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
            background: '#02050e',
            fontFamily: "'Cairo', sans-serif",
            overflow: 'hidden',
          }}
        >
          {/* تحميل خطوط الترحيب */}
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Cairo:wght@400;600;700;800;900&display=swap');
            
            /* حركة خطوط الأسفلت */
            @keyframes roadLines {
              0% { transform: translateY(-100%) scaleY(0.5); opacity: 0; }
              50% { opacity: 0.8; }
              100% { transform: translateY(400px) scaleY(1.8); opacity: 0; }
            }

            /* حركة سقوط قطرات المطر النيون */
            @keyframes neonRain {
              0% { background-position: 0px 0px; }
              100% { background-position: 40px 800px; }
            }

            /* اهتزاز طبيعي للسيارة أثناء السير */
            @keyframes carVibration {
              0% { transform: translateY(0px) rotate(0deg); }
              50% { transform: translateY(-2px) rotate(0.2deg); }
              100% { transform: translateY(0px) rotate(0deg); }
            }

            /* تموجات الإضاءة المنعكسة على الأسفلت مائي اللمعة */
            @keyframes wetReflection {
              0% { opacity: 0.4; filter: blur(15px); }
              50% { opacity: 0.7; filter: blur(25px); }
              100% { opacity: 0.4; filter: blur(15px); }
            }

            .neon-rain-overlay {
              position: absolute;
              inset: 0;
              background-image: linear-gradient(rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.08) 80%, rgba(255, 255, 255, 0) 100%);
              background-size: 3px 200px;
              animation: neonRain 0.6s linear infinite;
              pointer-events: none;
            }

            .road-dashed-line {
              position: absolute;
              width: 5px;
              height: 120px;
              background: linear-gradient(180deg, rgba(16,185,129,0.9), rgba(255,255,255,0.85));
              box-shadow: 0 0 15px rgba(16,185,129,0.8), 0 0 30px rgba(16,185,129,0.4);
              border-radius: 4px;
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
            {/* 🛣️ مشهد طريق الأسفلت المبلل الداكن ليلاً مع حبيبات لمعة المطر */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, #030611 0%, #060c1d 40%, #0d1830 70%, #040816 100%)',
              }}
            />

            {/* نسيج الأسفلت الخشن مع قطرات نيون متلألئة */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: 'radial-gradient(rgba(16,185,129,0.06) 1.5px, transparent 1.5px), radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',
                backgroundSize: '32px 32px, 16px 16px',
                opacity: 0.85,
              }}
            />

            {/* 🌧️ قطرات المطر المتساقطة بتأثير النيون */}
            <div className="neon-rain-overlay" />

            {/* 🟢 شفق أورورا الأخضر المضيء في سماء الأفق */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: '140vw',
                height: '50vh',
                background: 'radial-gradient(ellipse at 50% 10%, rgba(16,185,129,0.3) 0%, rgba(5,150,105,0.1) 50%, transparent 80%)',
                filter: 'blur(40px)',
                pointerEvents: 'none',
              }}
            />

            {/* 🛣️ خطوط طريق الأسفلت المبلل ثلاثية الأبعاد والمتحركة */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                justifyContent: 'center',
                perspective: '500px',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: '280px',
                  height: '100%',
                  transform: 'rotateX(52deg)',
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                {/* خطوط الطريق المتعاقبة لمحاكاة السير السريع */}
                <div className="road-dashed-line" style={{ top: '0%', animation: 'roadLines 2s linear infinite' }} />
                <div className="road-dashed-line" style={{ top: '0%', animation: 'roadLines 2s linear infinite 0.66s' }} />
                <div className="road-dashed-line" style={{ top: '0%', animation: 'roadLines 2s linear infinite 1.33s' }} />
              </div>
            </div>

            {/* 🚗 شعار السيارة الأنيق في الجزء العلوي */}
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
                  background: 'rgba(5, 12, 28, 0.75)',
                  border: '1.5px solid rgba(16,185,129,0.4)',
                  padding: '12px 18px',
                  borderRadius: '24px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(16,185,129,0.2)',
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
                  stroke="#10b981"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    filter: 'drop-shadow(0 0 8px rgba(16,185,129,0.8))',
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
                    fontSize: '17px',
                    letterSpacing: '0.5px',
                    textShadow: '0 2px 8px rgba(0,0,0,0.5)',
                  }}
                >
                  Park'n <span style={{ color: '#10b981' }}>24</span>
                </span>
              </div>
            </motion.div>

            {/* 🚘 رسمة السيارة الرياضية الفاخرة بالكامل في منتصف الشاشة مع الحركة التفاعلية */}
            <div
              style={{
                position: 'absolute',
                top: '44%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '100%',
                maxWidth: '310px',
                height: '180px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 20,
                pointerEvents: 'none',
              }}
            >
              <div style={{ animation: 'carVibration 1.5s ease-in-out infinite', position: 'relative' }}>
                <svg width="270" height="150" viewBox="0 0 260 150" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* إضاءة النيون الخضراء المنعكسة تحت هيكل السيارة على الأسفلت المبلل */}
                  <ellipse cx="130" cy="132" rx="95" ry="14" fill="url(#underglow)"/>
                  
                  {/* الهيكل الخارجي للسيارة (رؤية خلفية سينمائية) */}
                  <path d="M40 120 C 35 110, 45 60, 60 55 C 70 50, 80 40, 100 36 C 115 33, 145 33, 160 36 C 180 40, 190 50, 200 55 C 215 60, 225 110, 220 120 C 215 130, 45 130, 40 120 Z" fill="#090d18" stroke="#25354c" strokeWidth="2.5"/>
                  
                  {/* زجاج المقصورة الخلفي مع لمعة الانعكاس النيون */}
                  <path d="M72 55 C 82 45, 95 41, 130 41 C 165 41, 178 45, 188 55 C 178 80, 82 80, 72 55 Z" fill="#03050c" stroke="rgba(16,185,129,0.3)" strokeWidth="1.5"/>
                  
                  {/* الجناح الخلفي للسيارة (Spoiler) */}
                  <path d="M48 54 L 212 54 C 212 54, 217 47, 202 47 L 58 47 C 43 47, 48 54, 48 54 Z" fill="#04060d" stroke="#25354c"/>
                  
                  {/* مصابيح LED الخلفية الحمراء المتوهجة بالكامل (Neon LED Tail-lights) */}
                  <path d="M44 95 C 60 90, 200 90, 216 95 L 214 100 C 190 96, 70 96, 46 100 Z" fill="#ff2a55" filter="url(#glow-red)"/>
                  <path d="M44 95 C 60 90, 200 90, 216 95" stroke="#ff4d79" strokeWidth="2.5" filter="url(#glow-red-bright)"/>
                  
                  {/* نظام العادم الثنائي الفاخر ومشتت الهواء */}
                  <rect x="74" y="121" width="22" height="8" rx="4" fill="#0c101a" stroke="#475569"/>
                  <rect x="164" y="121" width="22" height="8" rx="4" fill="#0c101a" stroke="#475569"/>
                  
                  {/* لوحة السيارة بركن 24 */}
                  <rect x="110" y="111" width="40" height="15" rx="3" fill="#0b0f19" stroke="#10b981" strokeWidth="1.2"/>
                  <text x="130" y="121" fill="#ffffff" fontFamily="Cairo" fontSize="7.5" fontWeight="900" textAnchor="middle" letterSpacing="0.5">PARK'N</text>
                  
                  {/* تدرجات الفلاتر الضوئية والنيون */}
                  <defs>
                    <radialGradient id="underglow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.8"/>
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0"/>
                    </radialGradient>
                    <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="8" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <filter id="glow-red-bright" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="2" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>
                </svg>
              </div>
            </div>

            {/* 📝 المحتوى النصي الفاخر وزر البداية (في الجزء السفلي من الموبايل لسهولة الاستخدام) */}
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
              {/* شارة عدد السائقين */}
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
                  background: 'rgba(5, 12, 28, 0.65)',
                  border: '1px solid rgba(16,185,129,0.3)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                  direction: 'rtl',
                  marginBottom: '20px',
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
                        border: '2px solid rgba(4,7,17,0.9)',
                        marginRight: i === 0 ? 0 : '-8px',
                      }}
                    />
                  ))}
                </div>
                <span
                  style={{
                    fontSize: '12px',
                    color: 'rgba(255,255,255,0.9)',
                    fontWeight: 700,
                  }}
                >
                  انضم لأكثر من{' '}
                  <strong style={{ color: '#6EE7B7', fontWeight: 900 }}>10 آلاف سائق</strong>
                </span>
              </motion.div>

              {/* العنوان الرئيسي المبهر باللغة العربية */}
              <motion.h1
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.25, ease: 'easeOut' }}
                style={{
                  fontWeight: 900,
                  fontSize: 'clamp(2.1rem, 6.2vw, 3.5rem)',
                  lineHeight: 1.2,
                  letterSpacing: '-0.02em',
                  color: '#ffffff',
                  direction: 'rtl',
                  textShadow: '0 4px 24px rgba(0,0,0,0.7)',
                }}
              >
                اركن سيارتك
                <br />
                <span
                  style={{
                    background: 'linear-gradient(135deg, #A7F3D0 0%, #34D399 50%, #10B981 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    filter: 'drop-shadow(0 2px 14px rgba(16,185,129,0.4))',
                  }}
                >
                  بضغطة زر واحدة
                </span>
              </motion.h1>

              {/* الوصف التحفيزي السريع */}
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
                  textShadow: '0 2px 8px rgba(0,0,0,0.5)',
                }}
              >
                وفّر وقتك ومجهودك، احجز أقرب جراج ليك وادفع فورياً بدون فكة أو انتظار ⚡
              </motion.p>

              {/* 🚀 زر يلا نبدأ الفاخر والمميز */}
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
                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    color: '#ffffff',
                    fontSize: '17px',
                    fontWeight: 900,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 10px 32px rgba(16,185,129,0.5), 0 0 20px rgba(52,211,153,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    textShadow: '0 1px 2px rgba(0,0,0,0.25)',
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