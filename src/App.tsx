import { useEffect, useRef, useState, useMemo, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { useStore, setupRealtime } from './store';
import { cn } from './utils/cn';
import { supabase } from './lib/supabase';
import { Lock, Mail, X, Shield } from 'lucide-react';

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

// Lazy loading للوحات الإدارة
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

// 🛡️ توحيد تنظيف رقم اللوحة
const normalizePlate = (plate?: string): string => {
  if (!plate) return '';
  return plate
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶٧٨٩'.indexOf(d)))
    .replace(/[^0-9\u0600-\u06FF]/gi, '')
    .toUpperCase();
};

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
  } = useStore();

  const prevActiveSessionRef = useRef<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const initialLoadDone = useRef(false);

  const noSessionCountRef = useRef(0);
  const lastActiveTimeRef = useRef(0);
  const sessionEndToastShown = useRef(false);
  const sessionTransitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 🔒 إدارة وصول الأدمن عبر Supabase Auth الرسمي
  const [adminAccess, setAdminAccess] = useState(false);
  const [showAdminLoginModal, setShowAdminLoginModal] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);

  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';

  // 1. فحص هل الأدمن مسجل دخوله مسبقاً في Supabase Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setAdminAccess(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAdminAccess(!!session?.user);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. تسجيل دخول الأدمن المشفر عبر Supabase Auth
  const handleAdminAuthLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmail.trim() || !adminPassword.trim()) {
      toast.error('أدخل البريد الإلكتروني وكلمة المرور');
      return;
    }

    setAdminLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: adminEmail.trim(),
        password: adminPassword.trim(),
      });

      if (error) {
        toast.error('بيانات الدخول غير صحيحة ❌');
      } else if (data.session) {
        setAdminAccess(true);
        setShowAdminLoginModal(false);
        setAdminEmail('');
        setAdminPassword('');
        setView('admin');
        toast.success('تم تسجيل دخول المشرف بنجاح 🛡️');
      }
    } catch (err) {
      toast.error('حدث خطأ أثناء الاتصال بالخادم');
    } finally {
      setAdminLoading(false);
    }
  };

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

  // التهيئة المبدئية
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

      const savedView = localStorage.getItem('appView');
      const isGarageLoggedIn = localStorage.getItem('currentGarageId') || currentGarageId;

      if (savedView === 'admin' && adminAccess) {
        setView('admin');
      } else if (savedView === 'garage' || isGarageLoggedIn) {
        setView('garage');
      } else {
        setView('user');
      }

      setDataLoaded(true);
      initialLoadDone.current = true;

      fetchAll().catch((e) => console.error('Background fetch error:', e));
      setupRealtime();
    };

    init();
  }, [adminAccess]);

  useEffect(() => {
    if (view) {
      localStorage.setItem('appView', view);
    }
  }, [view]);

  // فحص الجلسة النشطة
  useEffect(() => {
    if (!dataLoaded) return;
    if (!currentUser) return;
    if (view !== 'user') return;

    const userPlate = normalizePlate(currentUser.carPlate);
    const userPhone = currentUser.phone ? currentUser.phone.replace(/[^\d+]/g, '') : '';

    const myActiveSession = sessions.find((s) => {
      if (s.status !== 'active') return false;
      const samePlate = !!userPlate && normalizePlate(s.carPlate) === userPlate;
      const sPhone = (s as any).customerPhone ? (s as any).customerPhone.replace(/[^\d+]/g, '') : '';
      const samePhone = !!userPhone && sPhone === userPhone;
      return samePlate || samePhone;
    });

    const myIncoming = incomingCars.find((c) => {
      if (c.status !== 'coming') return false;
      const samePlate = !!userPlate && normalizePlate(c.carPlate) === userPlate;
      const cPhone = c.customerPhone ? c.customerPhone.replace(/[^\d+]/g, '') : '';
      const samePhone = !!userPhone && cPhone === userPhone;
      return samePlate || samePhone;
    });

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
  }, [dataLoaded]);

  // مراقبة التنقل اللحظي للجلسة
  useEffect(() => {
    if (!dataLoaded) return;
    if (!currentUser || view !== 'user') return;

    const userPlate = normalizePlate(currentUser.carPlate);
    const userPhone = currentUser.phone ? currentUser.phone.replace(/[^\d+]/g, '') : '';

    const myActiveSession = sessions.find((s) => {
      if (s.status !== 'active') return false;
      const samePlate = !!userPlate && normalizePlate(s.carPlate) === userPlate;
      const sPhone = (s as any).customerPhone ? (s as any).customerPhone.replace(/[^\d+]/g, '') : '';
      const samePhone = !!userPhone && sPhone === userPhone;
      return samePlate || samePhone;
    });

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
    }
  }, [sessions, currentUser, view, safeScreen, dataLoaded, setScreen, setSelectedGarageId]);

  if (pathname === '/install') return <InstallPage />;
  if (pathname === '/qr') return <InstallQRCodePage />;

  return (
    <AuthGate>
      <div
        className="max-w-md mx-auto h-dvh bg-white text-slate-900 relative flex flex-col overflow-hidden"
        style={{ fontFamily: "'Cairo', sans-serif" }}
      >
        {/* شريط التبديل العلوي */}
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
                  setView('garage');
                } else if (tab.id === 'admin') {
                  if (!adminAccess) {
                    setShowAdminLoginModal(true);
                  } else {
                    setView('admin');
                  }
                } else {
                  setView('user');
                }
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

        {/* 🔒 نافذة تسجيل دخول الأدمن عبر Supabase Auth */}
        <AnimatePresence>
          {showAdminLoginModal && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100000] flex items-center justify-center p-4">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-3xl p-6 w-full max-w-xs text-center border border-slate-200 shadow-2xl relative"
              >
                <button
                  onClick={() => setShowAdminLoginModal(false)}
                  className="absolute top-4 left-4 text-slate-400 hover:text-slate-600"
                >
                  <X size={18} />
                </button>

                <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mx-auto mb-3">
                  <Shield size={24} />
                </div>

                <h3 className="font-black text-slate-900 text-base mb-1">لوحة المشرف العام</h3>
                <p className="text-xs text-slate-500 font-bold mb-4">سجل الدخول بحساب المشرف في Supabase</p>

                <form onSubmit={handleAdminAuthLogin} className="space-y-3">
                  <div className="relative">
                    <input
                      type="email"
                      placeholder="البريد الإلكتروني"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-200 p-3 pr-10 rounded-xl text-right font-bold text-sm outline-none focus:border-purple-600"
                      autoFocus
                    />
                    <Mail size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>

                  <div className="relative">
                    <input
                      type="password"
                      placeholder="كلمة المرور"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-200 p-3 pr-10 rounded-xl text-right font-bold text-sm outline-none focus:border-purple-600"
                    />
                    <Lock size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>

                  <button
                    type="submit"
                    disabled={adminLoading}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black py-3 rounded-xl text-sm active:scale-95 transition-all shadow-md shadow-purple-200 disabled:opacity-50"
                  >
                    {adminLoading ? 'جاري التحقق...' : 'دخول المشرف 🚀'}
                  </button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <main className="flex-1 overflow-hidden bg-white">
          {view === 'admin' && adminAccess ? (
            <Suspense
              fallback={
                <div className="h-full bg-white flex flex-col items-center justify-center">
                  <div className="text-3xl mb-3 animate-bounce">⚙️</div>
                  <p className="text-slate-500 text-sm font-bold animate-pulse">جاري فتح لوحة المشرف...</p>
                </div>
              }
            >
              <AdminDashboard />
            </Suspense>
          ) : view === 'garage' ? (
            currentGarageId ? (
              <Suspense
                fallback={
                  <div className="h-full bg-white flex flex-col items-center justify-center">
                    <div className="text-3xl mb-3 animate-bounce">🅿️</div>
                    <p className="text-slate-500 text-sm font-bold animate-pulse">جاري فتح لوحة الجراج...</p>
                  </div>
                }
              >
                <GarageDashboard />
              </Suspense>
            ) : (
              <GarageLoginScreen />
            )
          ) : !dataLoaded ? (
            <div className="h-full bg-white flex flex-col items-center justify-center">
              <div className="text-4xl mb-4 animate-bounce">🚗</div>
              <p className="text-slate-600 text-sm font-bold animate-pulse">جاري تحميل البيانات...</p>
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