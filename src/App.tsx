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
   👑 AURORA ACID-GREEN DISPLAY & 3D CAR TURNING HERO
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
          exit={{ opacity: 0, scale: 1.08 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="fixed inset-0 z-[999999]"
          style={{
            background: '#030509',
            fontFamily: "'Cairo', sans-serif",
            overflow: 'hidden',
          }}
        >
          {/* استيراد الخطوط الطباعية الضخمة والعريضة */}
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Anton&family=Plus+Jakarta+Sans:wght@800;900&family=Cairo:wght@700;800;900&display=swap');

            /* تأثير التردد النبضي للون الأخضر الأسيدي */
            @keyframes acidGlowPulse {
              0% { filter: drop-shadow(0 0 25px rgba(0, 255, 102, 0.45)); opacity: 0.9; }
              50% { filter: drop-shadow(0 0 50px rgba(0, 255, 102, 0.85)); opacity: 1; }
              100% { filter: drop-shadow(0 0 25px rgba(0, 255, 102, 0.45)); opacity: 0.9; }
            }

            /* مسار دوران السيارة البطيء والتفاعلي في المنظور */
            @keyframes carDriftTurn {
              0% { transform: translateY(0px) rotate(-4deg) scale(0.97); }
              50% { transform: translateY(-8px) rotate(4deg) scale(1.03); }
              100% { transform: translateY(0px) rotate(-4deg) scale(0.97); }
            }

            /* شعاع المصابيح الأمامية المتحرك عبر الحروف */
            @keyframes headlightSweep {
              0% { transform: rotate(-18deg) scaleX(0.9); opacity: 0.6; }
              50% { transform: rotate(18deg) scaleX(1.15); opacity: 0.95; }
              100% { transform: rotate(-18deg) scaleX(0.9); opacity: 0.6; }
            }

            .acid-display-font {
              font-family: 'Anton', 'Plus Jakarta Sans', sans-serif;
              text-transform: uppercase;
              letter-spacing: -0.05em;
              line-height: 0.82;
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
              background: 'radial-gradient(ellipse at 50% 45%, #081a14 0%, #030806 50%, #010403 100%)',
            }}
          >
            {/* 🌌 شبكة الأرضية النيون المنظورية (Perspective Grid Floor) */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: '-50%',
                width: '200%',
                height: '60%',
                backgroundImage: 'linear-gradient(rgba(0, 255, 102, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 102, 0.08) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
                transform: 'perspective(300px) rotateX(65deg)',
                maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, transparent 85%)',
                WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, transparent 85%)',
                pointerEvents: 'none',
              }}
            />

            {/* 🟢 نصوص الـ ACID-GREEN العملاقة بحجم الإطار الكامل (Massive Display Type) */}
            <div
              style={{
                position: 'absolute',
                top: '40%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '100vw',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                userSelect: 'none',
                zIndex: 5,
              }}
            >
              {/* السطر الأول: PARK */}
              <div
                className="acid-display-font"
                style={{
                  fontSize: 'clamp(5.8rem, 27vw, 16rem)',
                  color: '#00ff66',
                  textShadow: '0 0 40px rgba(0,255,102,0.5), 0 0 90px rgba(0,255,102,0.25)',
                  animation: 'acidGlowPulse 4s ease-in-out infinite',
                  opacity: 0.92,
                }}
              >
                PARK'N
              </div>

              {/* السطر الثاني: 24 مفرغ مع حدود نيون نارية */}
              <div
                className="acid-display-font"
                style={{
                  fontSize: 'clamp(5.2rem, 25vw, 15rem)',
                  color: 'transparent',
                  WebkitTextStroke: '2.5px #00ff66',
                  textShadow: '0 0 35px rgba(0,255,102,0.6)',
                  marginTop: '-4vw',
                  opacity: 0.85,
                }}
              >
                24·ONLINE
              </div>
            </div>

            {/* 🚘 السيارة التي تدور ببطء وتتحرك عبر الحروف (3D Turning Motion) */}
            <div
              style={{
                position: 'absolute',
                top: '46%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '100%',
                maxWidth: '340px',
                height: '220px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 15,
                pointerEvents: 'none',
              }}
            >
              {/* شعاع أضواء الكشافات الأمامية الممسحة على الحروف */}
              <div
                style={{
                  position: 'absolute',
                  top: '10%',
                  left: '50%',
                  width: '320px',
                  height: '240px',
                  background: 'radial-gradient(ellipse at 50% 90%, rgba(0, 255, 102, 0.35) 0%, rgba(0, 255, 102, 0.08) 50%, transparent 75%)',
                  filter: 'blur(16px)',
                  transformOrigin: 'bottom center',
                  animation: 'headlightSweep 5s ease-in-out infinite',
                  zIndex: 10,
                }}
              />

              {/* هيكل السيارة السينمائي الملتف */}
              <div style={{ animation: 'carDriftTurn 6s ease-in-out infinite', position: 'relative', zIndex: 12 }}>
                <svg width="300" height="170" viewBox="0 0 300 170" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* توهج نيون أرضي أسفل الشاسيه */}
                  <ellipse cx="150" cy="148" rx="120" ry="16" fill="url(#acidUnderglow)" />

                  {/* ظل السيارة */}
                  <ellipse cx="150" cy="144" rx="110" ry="10" fill="#000000" opacity="0.8" />

                  {/* الهيكل الديناميكي للسيارة الرياضية في وضعية الدوران */}
                  <path
                    d="M38 126 C 30 114, 40 70, 56 62 C 72 54, 88 42, 114 38 C 138 34, 172 34, 196 38 C 220 42, 238 54, 252 62 C 268 70, 276 114, 268 126 C 260 138, 48 138, 38 126 Z"
                    fill="#040a06"
                    stroke="#00ff66"
                    strokeWidth="2.5"
                    style={{ filter: 'drop-shadow(0 0 10px rgba(0,255,102,0.4))' }}
                  />

                  {/* زجاج المقصورة المائل المشع بانعكاسات الحروف */}
                  <path
                    d="M74 62 C 86 48, 104 43, 150 43 C 196 43, 214 48, 226 62 C 212 90, 88 90, 74 62 Z"
                    fill="#020503"
                    stroke="#34d399"
                    strokeWidth="1.6"
                  />

                  {/* الجناح الخلفي الرياضي العريض (Aerodynamic Wing) */}
                  <path d="M44 60 L 256 60 C 256 60, 264 50, 244 50 L 56 50 C 36 50, 44 60, 44 60 Z" fill="#020804" stroke="#00ff66" strokeWidth="1.5" />

                  {/* شريط الإضاءة الخلفية LED النيون المشع بالكامل */}
                  <path d="M46 102 C 72 96, 228 96, 254 102 L 250 108 C 220 102, 80 102, 50 108 Z" fill="#ff1744" filter="url(#glowRed)" />
                  <path d="M46 102 C 72 96, 228 96, 254 102" stroke="#ff5252" strokeWidth="3" filter="url(#glowRedBright)" />

                  {/* مصابيح النيون الجانبية (Acid Neon Accents) */}
                  <circle cx="48" cy="116" r="3.5" fill="#00ff66" filter="url(#glowAcid)" />
                  <circle cx="252" cy="116" r="3.5" fill="#00ff66" filter="url(#glowAcid)" />

                  {/* مخارج العادم المزدوجة المتوهجة */}
                  <rect x="80" y="128" width="26" height="9" rx="4.5" fill="#0a120c" stroke="#00ff66" strokeWidth="1.2" />
                  <rect x="194" y="128" width="26" height="9" rx="4.5" fill="#0a120c" stroke="#00ff66" strokeWidth="1.2" />

                  {/* لوحة السيارة */}
                  <rect x="126" y="117" width="48" height="17" rx="4" fill="#020603" stroke="#00ff66" strokeWidth="1.5" />
                  <text x="150" y="129" fill="#00ff66" fontFamily="Anton, Cairo" fontSize="9" fontWeight="900" textAnchor="middle" letterSpacing="1">
                    PARK'N
                  </text>

                  <defs>
                    <radialGradient id="acidUnderglow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#00ff66" stopOpacity="0.95" />
                      <stop offset="60%" stopColor="#10b981" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#00ff66" stopOpacity="0" />
                    </radialGradient>
                    <filter id="glowRed" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="8" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <filter id="glowRedBright" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="2" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <filter id="glowAcid" x="-30%" y="-30%" width="160%" height="160%">
                      <feGaussianBlur stdDeviation="4" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>
                </svg>
              </div>
            </div>

            {/* 🚗 الهيدر العلوي وشعار التطبيق الفاخر */}
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
                paddingTop: '38px',
              }}
            >
              <div
                style={{
                  background: 'rgba(2, 6, 4, 0.8)',
                  border: '1.5px solid rgba(0, 255, 102, 0.45)',
                  padding: '10px 22px',
                  borderRadius: '999px',
                  boxShadow: '0 0 25px rgba(0,255,102,0.25)',
                  backdropFilter: 'blur(16px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <svg
                  width="30"
                  height="30"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#00ff66"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ filter: 'drop-shadow(0 0 8px #00ff66)' }}
                >
                  <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C1.4 11 1 11.9 1 13v3c0 .6.4 1 1 1h2" />
                  <circle cx="7" cy="17" r="2" />
                  <path d="M9 17h6" />
                  <circle cx="17" cy="17" r="2" />
                </svg>
                <span style={{ color: '#ffffff', fontWeight: 900, fontSize: '16px', letterSpacing: '0.5px' }}>
                  Park'n <span style={{ color: '#00ff66', textShadow: '0 0 12px #00ff66' }}>24</span>
                </span>
              </div>
            </motion.div>

            {/* 📝 الجزء السفلي: الأزرار والنصوص الموجهة بتصميم هجومي وجريء */}
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
                paddingBottom: '44px',
                background: 'linear-gradient(to top, #010403 70%, transparent 100%)',
              }}
            >
              {/* شارة الثقة */}
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
                  background: 'rgba(0, 255, 102, 0.08)',
                  border: '1px solid rgba(0, 255, 102, 0.35)',
                  backdropFilter: 'blur(12px)',
                  boxShadow: '0 0 20px rgba(0,255,102,0.15)',
                  direction: 'rtl',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex' }}>
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '999px',
                        background: 'linear-gradient(135deg, #00ff66, #047857)',
                        border: '2px solid #010403',
                        marginRight: i === 0 ? 0 : '-7px',
                      }}
                    />
                  ))}
                </div>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.92)', fontWeight: 800 }}>
                  انضم لأكثر من{' '}
                  <strong style={{ color: '#00ff66', fontWeight: 900, textShadow: '0 0 10px #00ff66' }}>10 آلاف سائق</strong>
                </span>
              </motion.div>

              {/* العنوان الصريح والقوي */}
              <motion.h1
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.25, ease: 'easeOut' }}
                style={{
                  fontWeight: 900,
                  fontSize: 'clamp(2.1rem, 6.2vw, 3.4rem)',
                  lineHeight: 1.18,
                  letterSpacing: '-0.02em',
                  color: '#ffffff',
                  direction: 'rtl',
                  textShadow: '0 4px 25px rgba(0,0,0,0.9)',
                }}
              >
                اركن سيارتك
                <br />
                <span
                  style={{
                    background: 'linear-gradient(135deg, #ffffff 0%, #00ff66 60%, #059669 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    filter: 'drop-shadow(0 0 16px rgba(0,255,102,0.55))',
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
                  marginTop: '12px',
                  fontSize: '14px',
                  lineHeight: 1.7,
                  color: 'rgba(255,255,255,0.82)',
                  fontWeight: 700,
                  maxWidth: '360px',
                  direction: 'rtl',
                }}
              >
                وفّر وقتك ومجهودك، احجز أقرب جراج ليك وادفع فورياً بدون فكة أو انتظار ⚡
              </motion.p>

              {/* 🚀 زر يلا نبدأ الفسفوري الصاخب */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.58, ease: 'easeOut' }}
                style={{ marginTop: '26px', width: '100%', maxWidth: '300px' }}
              >
                <motion.button
                  onClick={handleEnter}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    width: '100%',
                    padding: '18px 36px',
                    borderRadius: '999px',
                    background: 'linear-gradient(135deg, #00ff66 0%, #00cc52 100%)',
                    color: '#020904',
                    fontSize: '18px',
                    fontWeight: 900,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 0 35px rgba(0,255,102,0.65), 0 8px 20px rgba(0,0,0,0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    letterSpacing: '0.5px',
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