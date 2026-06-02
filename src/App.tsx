import { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { useStore, setupRealtime } from './store';
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
import GarageDashboard from './components/GarageDashboard';
import AdminDashboard from './components/AdminDashboard';
import InstallPWA from './components/InstallPWA';
import LastSessionScreen from './components/LastSessionScreen';
import ChatScreen from './components/ChatScreen';

export default function App() {
  const {
    view,
    setView,
    screen,
    setScreen,
    currentUser,
    currentGarageId,
    sessions,
    selectedGarageId,
    setSelectedGarageId,
    incomingCars,
    fetchAll,
  } = useStore();

  const prevActiveSessionRef = useRef<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const initialLoadDone = useRef(false);

  // ✅ عداد للتأكد إن الجلسة انتهت فعلاً وليس مجرد flash
  const noSessionCountRef = useRef(0);
  // ✅ تاريخ آخر مرة شفنا فيها جلسة نشطة
  const lastActiveTimeRef = useRef(0);
  // ✅ منع toast الإنهاء من الظهور أكتر من مرة
  const sessionEndToastShown = useRef(false);
  // ✅ حماية: مش هنعمل transition لو كنا على session وفيه تحديث مؤقت
  const sessionTransitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ✅ أول تحميل
  useEffect(() => {
    const init = async () => {
      const savedScreen = localStorage.getItem('appScreen');
      if (
        savedScreen === 'session' ||
        savedScreen === 'navigation' ||
        savedScreen === 'waiting'
      ) {
        localStorage.removeItem('appScreen');
      }

      await fetchAll();
      setDataLoaded(true);
      initialLoadDone.current = true;
      setupRealtime();
    };
    init();
  }, []);

  // ✅ بعد أول تحميل - استرجع الشاشة الصحيحة
  useEffect(() => {
    if (!dataLoaded) return;
    if (!currentUser) return;
    if (view !== 'user') return;

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
      prevActiveSessionRef.current = myActiveSession.id;
      lastActiveTimeRef.current = Date.now();
      noSessionCountRef.current = 0;
      sessionEndToastShown.current = false;
      setSelectedGarageId(myActiveSession.garageId);
      if (screen !== 'session' && screen !== 'summary') {
        setScreen('session');
      }
      return;
    }

    if (myIncoming) {
      setSelectedGarageId(myIncoming.garageId);
      if (
        screen !== 'navigation' &&
        screen !== 'session' &&
        screen !== 'summary'
      ) {
        setScreen('navigation');
      }
      return;
    }

    if (
      screen === 'session' ||
      screen === 'navigation' ||
      screen === 'waiting'
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

  // ─── مراقبة حالة العميل ───────────────────────────────────────────────────
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

    // ─── 1) لو في جلسة نشطة ───────────────────────────────────────────────
    if (myActiveSession) {
      // ✅ reset كل عدادات الإنهاء
      noSessionCountRef.current = 0;
      lastActiveTimeRef.current = Date.now();
      sessionEndToastShown.current = false;

      // ✅ امسح أي timer إنهاء pending
      if (sessionTransitionTimer.current) {
        clearTimeout(sessionTransitionTimer.current);
        sessionTransitionTimer.current = null;
      }

      if (myActiveSession.id !== prevActiveSessionRef.current) {
        prevActiveSessionRef.current = myActiveSession.id;
        setSelectedGarageId(myActiveSession.garageId);

        if (
          screen !== 'session' &&
          screen !== 'summary' &&
          screen !== 'lastSession' &&
          screen !== 'chat'
        ) {
          setScreen('session');
        }
      }
      return;
    }

    // ─── 2) مفيش جلسة نشطة ────────────────────────────────────────────────
    if (prevActiveSessionRef.current) {
      // ✅ زود العداد
      noSessionCountRef.current += 1;

      const timeSinceLastActive = Date.now() - lastActiveTimeRef.current;

      // ✅ الإصلاح الجوهري:
      // لو العداد أقل من 3 تحديثات متتالية بدون جلسة
      // أو الوقت من آخر جلسة نشطة أقل من 8 ثواني
      // → ما نعملش حاجة (ده ممكن يكون مجرد flash من الـ sync)
      if (noSessionCountRef.current < 3 || timeSinceLastActive < 8000) {
        return;
      }

      // ✅ تأكيد نهائي: الجلسة انتهت فعلاً
      // لكن لازم نستنى كمان شوية عشان نتأكد
      if (sessionTransitionTimer.current) return;

      sessionTransitionTimer.current = setTimeout(() => {
        sessionTransitionTimer.current = null;

        // ✅ تحقق مرة أخيرة من الـ state الحالي
        const freshState = useStore.getState();
        const freshPlate = (
          freshState.currentUser?.carPlate ?? ''
        )
          .trim()
          .toUpperCase();

        const stillActive = freshState.sessions.find(
          (s) =>
            s.carPlate.trim().toUpperCase() === freshPlate &&
            s.status === 'active'
        );

        // ✅ لو رجعت الجلسة في الـ 3 ثواني دول → ignore
        if (stillActive) {
          noSessionCountRef.current = 0;
          prevActiveSessionRef.current = stillActive.id;
          return;
        }

        // ✅ الجلسة انتهت فعلاً - اعمل الـ transition
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
            const endTime =
              typeof lastCompleted.endTime === 'number'
                ? lastCompleted.endTime
                : 0;
            const timeSinceEnd = Date.now() - endTime;

            // ✅ لو انتهت من أقل من دقيقة → روح الملخص
            if (endTime > 0 && timeSinceEnd < 60000) {
              setSelectedGarageId(lastCompleted.garageId);
              setScreen('summary');
              return;
            }
          }

          // ✅ روح للقائمة مع toast مرة واحدة بس
          if (!sessionEndToastShown.current) {
            sessionEndToastShown.current = true;
            toast.success('تم إنهاء الجلسة والعودة للرئيسية');
          }
          setSelectedGarageId(null);
          setScreen('list');
        }
      }, 3000); // ✅ استنى 3 ثواني قبل ما تعتبر الجلسة انتهت
    }

    // ─── 3) لو في شاشة التوجيه ومفيش incoming ────────────────────────────
    if (!myActiveSession && screen === 'navigation' && !myIncoming) {
      const timeout = setTimeout(() => {
        const freshState = useStore.getState();
        const freshPlate = (
          freshState.currentUser?.carPlate ?? ''
        )
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
    screen,
    incomingCars,
    dataLoaded,
    setScreen,
    setSelectedGarageId,
  ]);

  // ✅ cleanup عند unmount
  useEffect(() => {
    return () => {
      if (sessionTransitionTimer.current) {
        clearTimeout(sessionTransitionTimer.current);
      }
    };
  }, []);

  return (
    <AuthGate>
      <div
        className="max-w-md mx-auto h-dvh bg-slate-950 relative flex flex-col overflow-hidden"
        style={{ fontFamily: "'Cairo', sans-serif" }}
      >
        {/* View Switcher */}
        <div className="absolute top-3 left-3 z-[9999] flex gap-0.5 bg-black/70 p-0.5 rounded-full backdrop-blur-md border border-white/10">
          {[
            { id: 'user' as const, label: 'حريف' },
            { id: 'garage' as const, label: 'جراج' },
            { id: 'admin' as const, label: 'أدمن' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-[10px] font-black transition-all',
                view === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          {!dataLoaded ? (
            <div className="h-full bg-slate-950 flex flex-col items-center justify-center">
              <div className="text-4xl mb-4 animate-bounce">🚗</div>
              <p className="text-slate-400 text-sm font-bold animate-pulse">
                جاري تحميل البيانات...
              </p>
            </div>
          ) : view === 'admin' ? (
            <AdminDashboard />
          ) : view === 'garage' ? (
            currentGarageId ? (
              <GarageDashboard />
            ) : (
              <GarageLoginScreen />
            )
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={screen}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="h-full overflow-y-auto bg-slate-950"
              >
                {screen === 'splash' && <SplashScreen />}

                {!currentUser && screen !== 'splash' && <RegisterScreen />}

                {currentUser && (
                  <>
                    {screen === 'list' && <GarageListScreen />}
                    {screen === 'waiting' && <WaitingScreen />}
                    {screen === 'navigation' && <NavigationScreen />}
                    {screen === 'session' && <SessionScreen />}
                    {screen === 'lastSession' && <LastSessionScreen />}
                    {screen === 'chat' && <ChatScreen />}
                  </>
                )}

                {screen === 'summary' && <SummaryScreen />}
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