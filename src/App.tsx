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
   🔥🌧️ FLUXORA-STYLE HERO — GLOWING CAR IN THE RAIN
   سيارة فاخرة بأنوار برتقالية ملتهبة تحت سماء ممطرة
   ════════════════════════════════════════════════════════════ */
interface FluxoraLandingProps {
  onEnter: () => void;
}

function FluxoraLanding({ onEnter }: FluxoraLandingProps) {
  const [isExiting, setIsExiting] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const handleEnter = () => {
    setIsExiting(true);
    setTimeout(() => onEnter(), 600);
  };

  // تحميل الصورة مسبقاً
  useEffect(() => {
    const img = new Image();
    img.src = 'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?auto=format&fit=crop&w=1400&q=85';
    img.onload = () => setImgLoaded(true);
    // fallback بعد 4 ثواني لو النت بطيء
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
            background: '#0a1628',
            overflow: 'hidden',
            height: '100dvh',
          }}
        >
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&family=Inter:wght@400;500;600&family=Instrument+Serif:ital@1&family=Cairo:wght@400;500;600;700;800;900&display=swap');

            /* ═══ 🌧️ تأثير المطر المتساقط CSS فقط ═══ */
            .rain-container {
              position: absolute;
              inset: 0;
              overflow: hidden;
              pointer-events: none;
              z-index: 5;
            }
            .rain-drop {
              position: absolute;
              width: 1.5px;
              background: linear-gradient(to bottom, transparent, rgba(200, 220, 255, 0.35), transparent);
              animation: rain-fall linear infinite;
              opacity: 0;
            }
            @keyframes rain-fall {
              0% {
                transform: translateY(-100vh) translateX(0px);
                opacity: 0;
              }
              10% { opacity: 1; }
              90% { opacity: 0.6; }
              100% {
                transform: translateY(110vh) translateX(-15px);
                opacity: 0;
              }
            }

            /* ═══ 🔥 وهج أنوار السيارة البرتقالي النابض ═══ */
            @keyframes car-glow-pulse {
              0%, 100% { opacity: 0.6; transform: scale(1); }
              50% { opacity: 0.9; transform: scale(1.05); }
            }

            @keyframes car-glow-pulse-2 {
              0%, 100% { opacity: 0.4; transform: scale(1); }
              50% { opacity: 0.7; transform: scale(1.08); }
            }

            /* ═══ تأثير بخار الأسفلت المبلول ═══ */
            @keyframes mist-drift {
              0% { transform: translateX(-30%) scaleY(1); opacity: 0.3; }
              50% { transform: translateX(10%) scaleY(1.1); opacity: 0.5; }
              100% { transform: translateX(-30%) scaleY(1); opacity: 0.3; }
            }

            /* ═══ الأنيميشن الأصلية من Fluxora ═══ */
            .fluxora-hero-block {
              animation: fluxora-rise 0.95s cubic-bezier(0.16, 1, 0.3, 1) both;
            }
            .fd-1 { animation-delay: 0.06s; }
            .fd-2 { animation-delay: 0.14s; }
            .fd-3 { animation-delay: 0.20s; }
            .fd-4 { animation-delay: 0.28s; }
            .fd-5 { animation-delay: 0.36s; }

            @keyframes fluxora-rise {
              from { opacity: 0; transform: translateY(22px); }
              to { opacity: 1; transform: none; }
            }

            /* ═══ تأثير ظهور صورة السيارة ═══ */
            .car-image {
              opacity: 0;
              transform: scale(1.06);
              transition: opacity 1.4s cubic-bezier(0.16, 1, 0.3, 1), transform 2.6s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .car-image.is-loaded {
              opacity: 1;
              transform: scale(1);
            }

            /* ═══ الزر الملتهب ═══ */
            .fluxora-btn-flame {
              display: inline-flex;
              align-items: center;
              gap: 10px;
              padding: 0.5em 0.5em 0.5em 1.5em;
              border-radius: 999px;
              background: linear-gradient(96deg, #ff3d00 0%, #ff8a1f 100%);
              color: #fff;
              font-weight: 700;
              font-family: 'Cairo', sans-serif;
              box-shadow: 0 14px 40px rgba(255, 61, 0, 0.35);
              transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.35s cubic-bezier(0.16, 1, 0.3, 1);
              border: 0;
              cursor: pointer;
            }
            .fluxora-btn-flame:hover {
              transform: translateY(-2px);
              box-shadow: 0 20px 52px rgba(255, 61, 0, 0.5);
            }

            .fluxora-btn-light {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              padding: 0.72em 1.35em;
              border-radius: 999px;
              background: rgba(255,255,255,0.95);
              color: #180600;
              font-family: 'Cairo', sans-serif;
              font-weight: 600;
              box-shadow: 0 10px 26px rgba(0, 0, 0, 0.25);
              transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
              border: 0;
              cursor: pointer;
            }
            .fluxora-btn-light:hover {
              transform: translateY(-1px);
              background: #fff;
            }

            @media (prefers-reduced-motion: reduce) {
              .fluxora-hero-block { animation: none; }
              .car-image { opacity: 1; transform: none; }
              .rain-drop { animation: none; display: none; }
            }
          `}</style>

          {/* ═══════════════════════════════════════════
              🎨 طبقة الخلفية: سماء فاتحة ممطرة + سيارة
              ═══════════════════════════════════════════ */}

          {/* 🌅 السماء المتدرجة الفاتحة الجميلة */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(175deg, #3a4f7a 0%, #5c6d93 18%, #8899b5 35%, #a8b5cc 50%, #c4ceda 65%, #7a8aa8 85%, #2d3a52 100%)',
              zIndex: 1,
            }}
          />

          {/* 🚗 صورة السيارة الفاخرة */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 2,
            }}
          >
            <img
              className={`car-image ${imgLoaded ? 'is-loaded' : ''}`}
              src="https://images.unsplash.com/photo-1544636331-e26879cd4d9b?auto=format&fit=crop&w=1400&q=85"
              alt=""
              aria-hidden="true"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center 70%',
              }}
            />
          </div>

          {/* 🔥 وهج الأنوار البرتقالية الأمامية للسيارة (يمين ويسار) */}
          <div
            style={{
              position: 'absolute',
              bottom: '18%',
              left: '25%',
              width: '220px',
              height: '120px',
              borderRadius: '50%',
              background: 'radial-gradient(ellipse, rgba(255, 100, 0, 0.55) 0%, rgba(255, 61, 0, 0.25) 40%, transparent 70%)',
              filter: 'blur(30px)',
              zIndex: 3,
              animation: 'car-glow-pulse 3s ease-in-out infinite',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '18%',
              right: '25%',
              width: '220px',
              height: '120px',
              borderRadius: '50%',
              background: 'radial-gradient(ellipse, rgba(255, 138, 31, 0.5) 0%, rgba(255, 100, 0, 0.2) 40%, transparent 70%)',
              filter: 'blur(30px)',
              zIndex: 3,
              animation: 'car-glow-pulse-2 3.5s ease-in-out infinite 0.5s',
              pointerEvents: 'none',
            }}
          />

          {/* 🔥 انعكاس الأنوار على الأسفلت المبلول */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: '10%',
              right: '10%',
              height: '25%',
              background: 'linear-gradient(to top, rgba(255, 80, 0, 0.12) 0%, rgba(255, 120, 30, 0.06) 40%, transparent 100%)',
              filter: 'blur(20px)',
              zIndex: 3,
              pointerEvents: 'none',
            }}
          />

          {/* 💨 بخار الأسفلت المبلول */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '15%',
              background: 'linear-gradient(to top, rgba(180, 200, 220, 0.2) 0%, transparent 100%)',
              filter: 'blur(15px)',
              zIndex: 4,
              animation: 'mist-drift 12s ease-in-out infinite',
              pointerEvents: 'none',
            }}
          />

          {/* 🌧️ قطرات المطر المتساقطة */}
          <div className="rain-container">
            {Array.from({ length: 80 }).map((_, i) => {
              const left = Math.random() * 100;
              const duration = 0.6 + Math.random() * 0.7;
              const delay = Math.random() * 3;
              const height = 18 + Math.random() * 25;
              const opacity = 0.15 + Math.random() * 0.3;
              return (
                <div
                  key={i}
                  className="rain-drop"
                  style={{
                    left: `${left}%`,
                    height: `${height}px`,
                    animationDuration: `${duration}s`,
                    animationDelay: `${delay}s`,
                    opacity,
                  }}
                />
              );
            })}
          </div>

          {/* 🎨 طبقة الضباب اللطيفة على الحواف (التعتيم) */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 6,
              background: `
                linear-gradient(264deg, rgba(10, 22, 40, 0.85) 0%, rgba(14, 20, 35, 0.55) 30%, rgba(20, 28, 45, 0.1) 55%, rgba(20, 28, 45, 0) 70%),
                linear-gradient(0deg, rgba(9, 15, 30, 0.8) 0%, rgba(9, 15, 30, 0.1) 30%, rgba(0, 0, 0, 0) 50%),
                linear-gradient(180deg, rgba(8, 14, 28, 0.45) 0%, rgba(0, 0, 0, 0) 25%)
              `,
              pointerEvents: 'none',
            }}
          />

          {/* ═══════════════════════════════════════════
              🚗 شريط التنقل العلوي الشفاف
              ═══════════════════════════════════════════ */}
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
              padding: '18px 20px',
              direction: 'ltr',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" width="28" height="28">
                <path d="M14 1.6 20.3 8 14 14.4 7.7 8 14 1.6Z" fill="#FF6A00" />
                <path d="M6.4 9.3 12.7 15.7 6.4 22.1 0.1 15.7 6.4 9.3Z" fill="#FF3D00" />
                <path d="M21.6 9.3 27.9 15.7 21.6 22.1 15.3 15.7 21.6 9.3Z" fill="#FF9A2E" />
              </svg>
              <span
                style={{
                  fontFamily: "'Inter Tight', sans-serif",
                  fontSize: '18px',
                  fontWeight: 600,
                  letterSpacing: '-0.025em',
                  color: '#fff',
                  textShadow: '0 2px 8px rgba(0,0,0,0.3)',
                }}
              >
                Park'n <span style={{ color: '#FF8A1F' }}>24</span>
              </span>
            </div>

            <motion.button
              onClick={handleEnter}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              className="fluxora-btn-light"
              style={{ fontSize: '12.5px', direction: 'rtl' }}
            >
              تخطي للتطبيق
            </motion.button>
          </motion.nav>

          {/* ═══════════════════════════════════════════
              📝 محتوى Hero الأساسي
              ═══════════════════════════════════════════ */}
          <div
            style={{
              position: 'relative',
              zIndex: 10,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '86px 20px 26px 20px',
              direction: 'rtl',
            }}
          >
            <div style={{ maxWidth: '640px' }}>
              {/* 🌍 السطر التمهيدي */}
              <div
                className="fluxora-hero-block"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  paddingTop: '13px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.12)',
                  width: 'fit-content',
                  maxWidth: '320px',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(255,255,255,0.5)"
                  strokeWidth="1.3"
                  width="20"
                  height="20"
                  style={{ flex: 'none' }}
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18M12 3c2.5 2.6 3.7 5.7 3.7 9S14.5 18.4 12 21c-2.5-2.6-3.7-5.7-3.7-9S9.5 5.6 12 3Z" />
                </svg>
                <span
                  style={{
                    fontFamily: "'Cairo', sans-serif",
                    fontSize: '11.5px',
                    lineHeight: 1.45,
                    color: 'rgba(255,255,255,0.55)',
                    fontWeight: 500,
                  }}
                >
                  نخدم آلاف السائقين<br />في شوارع مصر يومياً
                </span>
              </div>

              {/* 🔥 العنوان الرئيسي الملتهب مع اللمسة المائلة */}
              <h1
                className="fluxora-hero-block fd-1"
                style={{
                  marginTop: '24px',
                  fontFamily: "'Cairo', sans-serif",
                  fontSize: 'clamp(2.2rem, 6.4vw, 5rem)',
                  fontWeight: 800,
                  lineHeight: 1.05,
                  letterSpacing: '-0.035em',
                  color: '#fff',
                  textShadow: '0 6px 40px rgba(0, 0, 0, 0.5)',
                }}
              >
                اركن عربيتك<br />
                في أي مكان<br />
                بلا{' '}
                <em
                  style={{
                    fontFamily: "'Instrument Serif', Georgia, serif",
                    fontWeight: 400,
                    fontStyle: 'italic',
                    letterSpacing: '-0.005em',
                    background: 'linear-gradient(96deg, #ff6a00, #ff8a1f)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  زحمة
                </em>
              </h1>

              {/* الوصف */}
              <p
                className="fluxora-hero-block fd-2"
                style={{
                  marginTop: '20px',
                  maxWidth: '380px',
                  fontFamily: "'Cairo', sans-serif",
                  fontSize: '14.5px',
                  lineHeight: 1.6,
                  color: 'rgba(255, 255, 255, 0.72)',
                  fontWeight: 500,
                  textShadow: '0 2px 8px rgba(0,0,0,0.3)',
                }}
              >
                حتى تحت المطر.. Park'n 24 يفتحلك أقرب جراج بضغطة زر. من وسط البلد للتجمع، عربيتك في أمان.
              </p>

              {/* 🔥 زر الحث الملتهب + الأفاتار */}
              <div
                className="fluxora-hero-block fd-3"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '18px',
                  marginTop: '26px',
                }}
              >
                <button
                  onClick={handleEnter}
                  className="fluxora-btn-flame"
                  style={{ fontSize: '15px' }}
                >
                  <span>يلا نبدأ</span>
                  <span
                    style={{
                      display: 'grid',
                      placeItems: 'center',
                      width: '2.55em',
                      height: '2.55em',
                      borderRadius: '999px',
                      background: '#fff',
                      color: '#1a0600',
                    }}
                  >
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ width: '1.15em', height: '1.15em', transform: 'scaleX(-1)' }}
                    >
                      <path d="M4 10h12M11 5l5 5-5 5" />
                    </svg>
                  </span>
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ display: 'flex' }}>
                    {[
                      { a: '#ff7a3d', b: '#ffb27a' },
                      { a: '#6f4bd8', b: '#a98cff' },
                      { a: '#1f9ea8', b: '#63d6df' },
                      { a: '#d8434b', b: '#ff8a8f' },
                    ].map((c, i) => (
                      <span
                        key={i}
                        style={{
                          width: '28px',
                          height: '28px',
                          marginRight: i === 0 ? 0 : '-9px',
                          borderRadius: '999px',
                          border: '2px solid rgba(10, 22, 40, 0.7)',
                          background: `linear-gradient(140deg, ${c.a}, ${c.b})`,
                        }}
                      />
                    ))}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      fontFamily: "'Cairo', sans-serif",
                      fontSize: '10px',
                      lineHeight: 1.4,
                      color: 'rgba(255,255,255,0.5)',
                    }}
                  >
                    <strong
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: 'rgba(255,255,255,0.9)',
                      }}
                    >
                      +650 حريف سعيد
                    </strong>
                    خدمة 24 ساعة
                  </div>
                </div>
              </div>

              {/* 📊 بطاقات الإحصائيات الزجاجية */}
              <ul
                className="fluxora-hero-block fd-4"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '12px',
                  margin: '28px 0 0',
                  padding: 0,
                  listStyle: 'none',
                }}
              >
                {[
                  { value: '+150', label: 'جراج متعاون', gradient: false },
                  { value: '98%', label: 'رضا العملاء', gradient: true },
                ].map((stat) => (
                  <li
                    key={stat.label}
                    style={{
                      position: 'relative',
                      display: 'grid',
                      alignContent: 'space-between',
                      width: '170px',
                      minHeight: '110px',
                      padding: '16px',
                      border: '1px solid rgba(255, 255, 255, 0.14)',
                      borderRadius: '16px',
                      background: stat.gradient
                        ? 'linear-gradient(150deg, rgba(255, 80, 0, 0.2), rgba(255, 138, 31, 0.1))'
                        : 'rgba(15, 25, 50, 0.45)',
                      backdropFilter: 'blur(20px) saturate(1.2)',
                      WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
                      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.09)',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: '12px',
                        left: '14px',
                        fontSize: '14px',
                        color: 'rgba(255,255,255,0.3)',
                      }}
                    >
                      *
                    </span>
                    <span
                      style={{
                        fontFamily: "'Cairo', sans-serif",
                        fontSize: 'clamp(1.4rem, 2.4vw, 2rem)',
                        fontWeight: 700,
                        lineHeight: 1,
                        letterSpacing: '-0.03em',
                        color: '#fff',
                      }}
                    >
                      {stat.value}
                    </span>
                    <span
                      style={{
                        fontFamily: "'Cairo', sans-serif",
                        fontSize: '11px',
                        fontWeight: 500,
                        color: 'rgba(255,255,255,0.46)',
                      }}
                    >
                      {stat.label}
                    </span>
                    <span
                      style={{
                        position: 'absolute',
                        left: '14px',
                        bottom: '18px',
                        width: '14px',
                        height: '1px',
                        background: 'rgba(255, 255, 255, 0.2)',
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 🏙️ الشريط السفلي */}
          <div
            className="fluxora-hero-block fd-5"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 20,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: '24px',
              padding: '0 20px 20px 20px',
              direction: 'ltr',
            }}
          >
            <span
              style={{
                fontFamily: "'Inter Tight', sans-serif",
                fontSize: 'clamp(2.2rem, 8vw, 5rem)',
                fontWeight: 700,
                lineHeight: 0.8,
                letterSpacing: '-0.05em',
                color: 'rgba(255, 255, 255, 0.05)',
                userSelect: 'none',
              }}
            >
              PARK
            </span>

            <div style={{ textAlign: 'right', direction: 'rtl' }}>
              <span
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontFamily: "'Cairo', sans-serif",
                  fontSize: '11px',
                  color: 'rgba(255,255,255,0.4)',
                  fontWeight: 600,
                }}
              >
                نغطي أفخم مدن مصر
              </span>
              <ul
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  margin: 0,
                  padding: 0,
                  listStyle: 'none',
                }}
              >
                {['🕌 القاهرة', '🌴 الجيزة'].map((city) => (
                  <li
                    key={city}
                    style={{
                      fontFamily: "'Cairo', sans-serif",
                      fontSize: '10.5px',
                      fontWeight: 700,
                      color: 'rgba(255,255,255,0.8)',
                      padding: '4px 10px',
                      borderRadius: '999px',
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'rgba(10, 22, 40, 0.5)',
                      backdropFilter: 'blur(8px)',
                    }}
                  >
                    {city}
                  </li>
                ))}
              </ul>
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
    const lastShownDate = localStorage.getItem('fluxora_landing_last_date');
    return lastShownDate !== today;
  });

  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';

  const handleEnterLanding = () => {
    const today = new Date().toDateString();
    localStorage.setItem('fluxora_landing_last_date', today);
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
    link.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=Inter+Tight:wght@400;500;600;700;800&family=Inter:wght@400;500;600&family=Instrument+Serif:ital@1&display=swap';
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
      {showLanding && <FluxoraLanding onEnter={handleEnterLanding} />}

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