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

// 🛡️ صمام الأمان المدمج لمنع الشاشة البيضاء في حالة حدوث أي تحديث شبكي مفاجئ
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
   👑 PALACE AT DUSK — 5 CHAPTERS OF ALTERNATING COPY HERO
   ════════════════════════════════════════════════════════════ */
interface AuroraLandingProps {
  onEnter: () => void;
}

const CHAPTERS = [
  {
    num: '٠١',
    side: 'right',
    tag: 'وقت الغسق',
    title: 'حين تغيب الشمس...',
    subtitle: 'تبدأ راحتك في المدينة',
    desc: 'عندما تزدحم الشوارع وتتسارع الدقائق، يفتح لك Park\'n 24 أبواباً من السكون والملاذ الآمن لسيارتك.',
  },
  {
    num: '٠٢',
    side: 'left',
    tag: 'حراسة وفخامة',
    title: 'مكان محجوز يليق بك',
    subtitle: 'أمان تام على مدار الساعة',
    desc: 'جراجات مجهزة ومؤمنة في أرقى الأماكن وأقربها إليك، تنتظرك بضيافة وسلاسة استثنائية.',
  },
  {
    num: '٠٣',
    side: 'right',
    tag: 'قيمة الوقت',
    title: 'دقائقك أثمن من أن تضيع',
    subtitle: 'لا دوران.. لا انتظار.. لا قلق',
    desc: 'احجز وجهتك قبل وصولك، واستمتع بتوجيه ذكي ومباشر إلى مكانك المخصص دون عناء.',
  },
  {
    num: '٠٤',
    side: 'left',
    tag: 'تقنية ذكية',
    title: 'سلاسة تسبق خطوتك',
    subtitle: 'دفع فوري وخروج بلمسة زر',
    desc: 'محفظة رقمية ذكية ونظام دخول وخروج بدون فكة أو توقف. راحتك تبدأ من أول ثانية.',
  },
  {
    num: '٠٥',
    side: 'center',
    tag: 'البداية',
    title: 'مرحباً بك في Park\'n 24',
    subtitle: 'تجربة الركن كما يجب أن تكون',
    desc: 'انضم لآلاف السائقين الذين اختاروا راحة البال واحترافية الوصول اليومية.',
  },
];

function AuroraLanding({ onEnter }: AuroraLandingProps) {
  const [currentChapter, setCurrentChapter] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleEnter = () => {
    setIsExiting(true);
    setTimeout(() => onEnter(), 500);
  };

  // 🏮 محاكي جزيئات الفوانيس وأضواء الغسق (240-Frame Lantern Embers Engine)
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

    const embers: {
      x: number;
      y: number;
      size: number;
      speedY: number;
      speedX: number;
      alpha: number;
      pulse: number;
      color: string;
    }[] = [];

    const colors = [
      'rgba(245, 158, 11, ',  // كهرمان دافئ
      'rgba(217, 119, 6, ',   // توهج فانوس ذهبي
      'rgba(251, 191, 36, ',  // نور أصفر مشع
      'rgba(239, 68, 68, ',   // أحمر غسق ناعم
    ];

    for (let i = 0; i < 45; i++) {
      embers.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 2.2 + 0.8,
        speedY: -(Math.random() * 0.6 + 0.25),
        speedX: (Math.random() - 0.5) * 0.4,
        alpha: Math.random() * 0.7 + 0.2,
        pulse: Math.random() * Math.PI * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // رسم شرارات الفوانيس المتصاعدة في سماء الغسق
      for (let i = 0; i < embers.length; i++) {
        const e = embers[i];
        e.y += e.speedY;
        e.x += e.speedX;
        e.pulse += 0.03;

        if (e.y < -10) {
          e.y = height + 10;
          e.x = Math.random() * width;
        }

        const currentAlpha = e.alpha * (0.6 + Math.sin(e.pulse) * 0.4);
        ctx.fillStyle = `${e.color}${Math.max(0, currentAlpha)})`;
        ctx.shadowColor = '#F59E0B';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  const handleNext = () => {
    if (currentChapter < CHAPTERS.length - 1) {
      setCurrentChapter(c => c + 1);
    } else {
      handleEnter();
    }
  };

  const handlePrev = () => {
    if (currentChapter > 0) {
      setCurrentChapter(c => c - 1);
    }
  };

  const activeChapter = CHAPTERS[currentChapter];

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="fixed inset-0 z-[999999]"
          style={{
            background: '#070A14',
            fontFamily: "'Cairo', sans-serif",
            overflow: 'hidden',
          }}
        >
          {/* تحميل خطوط الترحيب */}
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Cairo:wght@400;600;700;800;900&display=swap');
            
            /* نبض توهج الفوانيس في القصر */
            @keyframes lanternFlicker {
              0% { opacity: 0.75; transform: scale(1); filter: drop-shadow(0 0 15px rgba(245,158,11,0.6)); }
              50% { opacity: 1; transform: scale(1.04); filter: drop-shadow(0 0 28px rgba(245,158,11,0.95)); }
              100% { opacity: 0.75; transform: scale(1); filter: drop-shadow(0 0 15px rgba(245,158,11,0.6)); }
            }

            /* تموجات الشفق وقت الغسق */
            @keyframes duskSkyShift {
              0% { opacity: 0.55; transform: translateY(0); }
              50% { opacity: 0.85; transform: translateY(-10px); }
              100% { opacity: 0.55; transform: translateY(0); }
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
            {/* 🌌 سماء الغسق المتدرجة الفاخرة (Dusk Horizon Gradient) */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, #070B18 0%, #10162E 35%, #231B38 65%, #3D1C28 85%, #1A0D15 100%)',
              }}
            />

            {/* ✨ شفق الغسق البرتقالي والأرجواني المتوهج في الأفق */}
            <div
              style={{
                position: 'absolute',
                bottom: '15%',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '120vw',
                height: '45vh',
                background: 'radial-gradient(ellipse at 50% 100%, rgba(245,158,11,0.32) 0%, rgba(217,119,6,0.18) 40%, rgba(139,92,246,0.12) 70%, transparent 90%)',
                filter: 'blur(45px)',
                animation: 'duskSkyShift 7s ease-in-out infinite',
                pointerEvents: 'none',
              }}
            />

            {/* 🏛️ عمارة القصر الملكي المضاءة في المنتصف تماماً (Unobstructed Central Architecture) */}
            <div
              style={{
                position: 'absolute',
                top: '40%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '100%',
                maxWidth: '380px',
                height: '320px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            >
              <svg width="340" height="280" viewBox="0 0 340 280" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* هالة القصر الكلية */}
                <ellipse cx="170" cy="180" rx="140" ry="80" fill="url(#palaceHalo)" />

                {/* القبة المركزية الكبرى للقصر */}
                <path d="M120 150 C 120 95, 170 65, 170 50 C 170 65, 220 95, 220 150 Z" fill="#0E1326" stroke="rgba(245, 158, 11, 0.4)" strokeWidth="1.5" />
                <path d="M170 50 L 170 30" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
                <circle cx="170" cy="27" r="3" fill="#F59E0B" />

                {/* القباب الجانبية */}
                <path d="M60 165 C 60 125, 95 105, 95 95 C 95 105, 130 125, 130 165 Z" fill="#0B0F20" stroke="rgba(245, 158, 11, 0.3)" strokeWidth="1.2" />
                <path d="M210 165 C 210 125, 245 105, 245 95 C 245 105, 280 125, 280 165 Z" fill="#0B0F20" stroke="rgba(245, 158, 11, 0.3)" strokeWidth="1.2" />

                {/* أعمدة وجدران القصر الأساسية */}
                <rect x="50" y="165" width="240" height="90" rx="4" fill="#080C1B" stroke="rgba(245, 158, 11, 0.25)" strokeWidth="1.2" />

                {/* الأقواس الأندلسية والنوافذ المشعة بنور الفوانيس الدافئة */}
                <path d="M150 255 L 150 205 C 150 190, 190 190, 190 205 L 190 255 Z" fill="url(#doorGlow)" stroke="#F59E0B" strokeWidth="1.8" />
                <path d="M90 235 L 90 200 C 90 190, 115 190, 115 200 L 115 235 Z" fill="url(#windowGlow)" stroke="rgba(245, 158, 11, 0.6)" strokeWidth="1" />
                <path d="M225 235 L 225 200 C 225 190, 250 190, 250 200 L 250 235 Z" fill="url(#windowGlow)" stroke="rgba(245, 158, 11, 0.6)" strokeWidth="1" />

                {/* الفوانيس المعلقة المضيئة على أطراف القصر (Lanterns with Ambient Glow) */}
                {/* فانوس يسار */}
                <g style={{ animation: 'lanternFlicker 3s ease-in-out infinite' }}>
                  <line x1="38" y1="90" x2="38" y2="135" stroke="rgba(245, 158, 11, 0.6)" strokeWidth="1.2" />
                  <path d="M30 135 L 46 135 L 42 155 L 34 155 Z" fill="#D97706" stroke="#F59E0B" strokeWidth="1.2" />
                  <circle cx="38" cy="145" r="4.5" fill="#FEF3C7" />
                </g>

                {/* فانوس يمين */}
                <g style={{ animation: 'lanternFlicker 3s ease-in-out infinite 1.5s' }}>
                  <line x1="302" y1="90" x2="302" y2="135" stroke="rgba(245, 158, 11, 0.6)" strokeWidth="1.2" />
                  <path d="M294 135 L 310 135 L 306 155 L 298 155 Z" fill="#D97706" stroke="#F59E0B" strokeWidth="1.2" />
                  <circle cx="302" cy="145" r="4.5" fill="#FEF3C7" />
                </g>

                {/* انعكاسات النور على أرضية القصر المبللة */}
                <ellipse cx="170" cy="255" rx="70" ry="10" fill="url(#floorGleam)" />

                <defs>
                  <radialGradient id="palaceHalo" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="doorGlow" cx="50%" cy="80%" r="60%">
                    <stop offset="0%" stopColor="#FEF3C7" stopOpacity="1" />
                    <stop offset="60%" stopColor="#F59E0B" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#B45309" stopOpacity="0.7" />
                  </radialGradient>
                  <radialGradient id="windowGlow" cx="50%" cy="70%" r="60%">
                    <stop offset="0%" stopColor="#FEF3C7" stopOpacity="0.95" />
                    <stop offset="70%" stopColor="#F59E0B" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#78350F" stopOpacity="0.5" />
                  </radialGradient>
                  <radialGradient id="floorGleam" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
                  </radialGradient>
                </defs>
              </svg>
            </div>

            {/* 🏮 جزيئات وشرارات الفوانيس المتصاعدة في سماء الليل */}
            <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 12 }} />

            {/* 🔝 الهيدر العلوي وشعار التطبيق + زر التخطي الفوري */}
            <div
              style={{
                position: 'relative',
                zIndex: 50,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '38px 24px 10px',
              }}
            >
              <button
                onClick={handleEnter}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  color: '#FEF3C7',
                  padding: '8px 16px',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: 700,
                  backdropFilter: 'blur(10px)',
                  cursor: 'pointer',
                }}
              >
                تخطي للرئيسية ✕
              </button>

              <div
                style={{
                  background: 'rgba(7, 11, 24, 0.8)',
                  border: '1.5px solid rgba(245, 158, 11, 0.35)',
                  padding: '8px 18px',
                  borderRadius: '999px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                  backdropFilter: 'blur(14px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span style={{ color: '#ffffff', fontWeight: 900, fontSize: '15px' }}>
                  Park'n <span style={{ color: '#F59E0B' }}>24</span>
                </span>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C1.4 11 1 11.9 1 13v3c0 .6.4 1 1 1h2" />
                  <circle cx="7" cy="17" r="2" />
                  <path d="M9 17h6" />
                  <circle cx="17" cy="17" r="2" />
                </svg>
              </div>
            </div>

            {/* 📖 فصول الرواية الخمسة المتناوبة (تتغير جهتها حتى لا تحجب عمارة القصر) */}
            <div
              style={{
                position: 'relative',
                zIndex: 40,
                padding: '0 20px 36px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                minHeight: '280px',
              }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentChapter}
                  initial={{
                    opacity: 0,
                    x: activeChapter.side === 'right' ? 30 : activeChapter.side === 'left' ? -30 : 0,
                    y: activeChapter.side === 'center' ? 20 : 0,
                  }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  exit={{
                    opacity: 0,
                    x: activeChapter.side === 'right' ? -30 : activeChapter.side === 'left' ? 30 : 0,
                    y: activeChapter.side === 'center' ? -20 : 0,
                  }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems:
                      activeChapter.side === 'right'
                        ? 'flex-end'
                        : activeChapter.side === 'left'
                        ? 'flex-start'
                        : 'center',
                    textAlign:
                      activeChapter.side === 'right'
                        ? 'right'
                        : activeChapter.side === 'left'
                        ? 'left'
                        : 'center',
                    maxWidth: activeChapter.side === 'center' ? '100%' : '80%',
                    alignSelf:
                      activeChapter.side === 'right'
                        ? 'flex-end'
                        : activeChapter.side === 'left'
                        ? 'flex-start'
                        : 'center',
                    direction: activeChapter.side === 'left' ? 'ltr' : 'rtl',
                  }}
                >
                  {/* شارة الفصل الحالي */}
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'rgba(245, 158, 11, 0.12)',
                      border: '1px solid rgba(245, 158, 11, 0.35)',
                      padding: '4px 12px',
                      borderRadius: '999px',
                      marginBottom: '10px',
                    }}
                  >
                    <span style={{ color: '#F59E0B', fontWeight: 900, fontSize: '11px' }}>
                      الفصل {activeChapter.num}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px' }}>•</span>
                    <span style={{ color: '#FEF3C7', fontWeight: 700, fontSize: '11px' }}>
                      {activeChapter.tag}
                    </span>
                  </div>

                  {/* عنوان الفصل */}
                  <h2
                    style={{
                      color: '#ffffff',
                      fontSize: 'clamp(1.5rem, 5.2vw, 2.2rem)',
                      fontWeight: 900,
                      lineHeight: 1.25,
                      textShadow: '0 3px 15px rgba(0,0,0,0.8)',
                    }}
                  >
                    {activeChapter.title}
                    <br />
                    <span
                      style={{
                        background: 'linear-gradient(135deg, #FDE68A 0%, #F59E0B 70%, #D97706 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                      }}
                    >
                      {activeChapter.subtitle}
                    </span>
                  </h2>

                  {/* وصف الفصل */}
                  <p
                    style={{
                      color: 'rgba(255, 255, 255, 0.82)',
                      fontSize: '13px',
                      lineHeight: 1.7,
                      fontWeight: 600,
                      marginTop: '8px',
                      maxWidth: '310px',
                      textShadow: '0 2px 10px rgba(0,0,0,0.8)',
                    }}
                  >
                    {activeChapter.desc}
                  </p>

                  {/* زر البدء في الفصل الأخير */}
                  {currentChapter === CHAPTERS.length - 1 && (
                    <motion.button
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={handleEnter}
                      style={{
                        marginTop: '22px',
                        padding: '16px 42px',
                        borderRadius: '999px',
                        background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                        color: '#070B18',
                        fontSize: '17px',
                        fontWeight: 900,
                        border: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 8px 30px rgba(245,158,11,0.5), 0 0 20px rgba(253,230,138,0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                    >
                      <span>يلا نبدأ</span>
                      <span style={{ fontSize: '18px' }}>🚀</span>
                    </motion.button>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* 🧭 شريط أزرار التنقل بين الفصول (التمرير باللمس) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: '24px',
                  paddingTop: '16px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                {/* نقاط التقدم */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  {CHAPTERS.map((_, idx) => (
                    <div
                      key={idx}
                      onClick={() => setCurrentChapter(idx)}
                      style={{
                        width: currentChapter === idx ? '22px' : '6px',
                        height: '6px',
                        borderRadius: '999px',
                        background: currentChapter === idx ? '#F59E0B' : 'rgba(255,255,255,0.2)',
                        transition: 'all 0.3s ease',
                        cursor: 'pointer',
                        boxShadow: currentChapter === idx ? '0 0 10px #F59E0B' : 'none',
                      }}
                    />
                  ))}
                </div>

                {/* أزرار السابق / التالي */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {currentChapter > 0 && (
                    <button
                      onClick={handlePrev}
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: '#ffffff',
                        padding: '8px 16px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      السابق
                    </button>
                  )}

                  {currentChapter < CHAPTERS.length - 1 ? (
                    <button
                      onClick={handleNext}
                      style={{
                        background: '#F59E0B',
                        border: 'none',
                        color: '#070B18',
                        padding: '8px 20px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 900,
                        cursor: 'pointer',
                        boxShadow: '0 2px 12px rgba(245,158,11,0.4)',
                      }}
                    >
                      التالي ←
                    </button>
                  ) : null}
                </div>
              </div>
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