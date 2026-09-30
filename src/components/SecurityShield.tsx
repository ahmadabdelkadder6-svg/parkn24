// src/components/SecurityShield.tsx
import { useEffect, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { useStore } from '../store';
import { supabase } from '../lib/supabase';
import { sendTheftAlertPush, stopTheftAlarmRepeat } from '../lib/pushManager';
import { VolumeX, ShieldAlert } from 'lucide-react';

// 🧼 دوال مطابقة خارقة تمنع أي خطأ في الحروف أو أرقام التليفونات
const cleanLettersAndDigits = (str: any): string => {
  if (!str) return '';
  return String(str)
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىی]/g, 'ي')
    .replace(/[^ا-ي0-9a-zA-Z]/g, '')
    .toLowerCase();
};

const cleanPhoneDigits = (str: any): string => {
  if (!str) return '';
  const digits = String(str).replace(/\D/g, '');
  return digits.slice(-8); // مطابقة آخر 8 أرقام لتخطي أي كود دولة (+20 أو 002 أو 01)
};

// 🔊 نظام الصوت الذكي المزود بصمام كتم فوري (Master Gain)
let globalAudioCtx: AudioContext | null = null;
let globalMasterGain: GainNode | null = null;
let isAudioUnlocked = false;

const unlockAudioEngine = async () => {
  if (isAudioUnlocked && globalAudioCtx && globalAudioCtx.state === 'running') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    if (!globalAudioCtx) {
      globalAudioCtx = new AudioCtx();
      globalMasterGain = globalAudioCtx.createGain();
      globalMasterGain.connect(globalAudioCtx.destination);
    }
    if (globalAudioCtx.state === 'suspended') await globalAudioCtx.resume();
    isAudioUnlocked = true;
  } catch {}
};

if (typeof window !== 'undefined') {
  const unlockEvents = ['touchstart', 'touchend', 'click', 'keydown'];
  const handleUnlock = () => {
    unlockAudioEngine();
    unlockEvents.forEach((e) => document.removeEventListener(e, handleUnlock));
  };
  unlockEvents.forEach((e) => document.addEventListener(e, handleUnlock, { passive: true }));
}

// 🔇 دالة الكتم الفورية الصامتة (تقطع الصوت في 0 جزء من الثانية)
const stopAllSirenSoundsImmediately = () => {
  try {
    if (globalMasterGain && globalAudioCtx) {
      globalMasterGain.gain.cancelScheduledValues(globalAudioCtx.currentTime);
      globalMasterGain.gain.setValueAtTime(0, globalAudioCtx.currentTime);
    }
    if (navigator.vibrate) navigator.vibrate(0);
  } catch {}
};

const playTheftSirenSound = async () => {
  try {
    await unlockAudioEngine();
    if (!globalAudioCtx || !globalMasterGain) return;
    if (globalAudioCtx.state === 'suspended') await globalAudioCtx.resume();

    const now = globalAudioCtx.currentTime;
    globalMasterGain.gain.cancelScheduledValues(now);
    globalMasterGain.gain.setValueAtTime(1.0, now);

    for (let i = 0; i < 8; i++) {
      const start = now + (i * 0.3);
      const osc = globalAudioCtx.createOscillator();
      const noteGain = globalAudioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(i % 2 === 0 ? 1000 : 2200, start);

      noteGain.gain.setValueAtTime(1.0, start);
      noteGain.gain.exponentialRampToValueAtTime(0.01, start + 0.28);

      osc.connect(noteGain);
      noteGain.connect(globalMasterGain);

      osc.start(start);
      osc.stop(start + 0.29);
    }
  } catch {}
};

export default function SecurityShield({
  view = 'user',
  sessionId = null,
  carPlate = '',
}: {
  view?: 'user' | 'garage' | 'admin';
  isSessionActive?: boolean;
  isShieldEnabled?: boolean;
  sessionId?: string | null;
  carPlate?: string;
}) {
  const { currentUser, currentGarageId, sessions } = useStore();
  const [isBreached, setIsBreached] = useState(false);
  const [breachAlert, setBreachAlert] = useState<{ carPlate: string; reason: string; sessionId?: string } | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const isMutedRef = useRef(false);
  const sirenIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stateRef = useRef({ currentUser, currentGarageId, sessionId, view, carPlate });
  useEffect(() => {
    stateRef.current = { currentUser, currentGarageId, sessionId, view, carPlate };
  }, [currentUser, currentGarageId, sessionId, view, carPlate]);

  const startSirenRepeat = () => {
    if (sirenIntervalRef.current) clearInterval(sirenIntervalRef.current);
    if (!isMutedRef.current) {
      playTheftSirenSound();
    }
    sirenIntervalRef.current = setInterval(() => {
      if (!isMutedRef.current) {
        playTheftSirenSound();
      }
    }, 5000);
  };

  const stopSirenRepeat = () => {
    if (sirenIntervalRef.current) {
      clearInterval(sirenIntervalRef.current);
      sirenIntervalRef.current = null;
    }
    stopAllSirenSoundsImmediately();
  };

  const triggerAlarm = (plate: string, reason: string, targetSessionId?: string) => {
    setIsBreached(true);
    setIsMuted(false);
    isMutedRef.current = false;
    setBreachAlert({ 
      carPlate: plate || 'المركبة', 
      reason: reason || '🚨 تم رصد حركة وتحريك غير مصرح به للسيارة!', 
      sessionId: targetSessionId 
    });
    startSirenRepeat();
    if (navigator.vibrate) navigator.vibrate([1500, 200, 1500, 200, 2000]);
  };

  // 📡 الاستماع اللحظي لسيرفر Supabase (بمطابقة مرنة ومضمونة 100%)
  useEffect(() => {
    const channel = supabase
      .channel(`shield-realtime-${Date.now()}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions' }, (payload) => {
        const row = payload.new as any;
        if (!row) return;

        const snap = stateRef.current;
        const myPlate = cleanLettersAndDigits(snap.currentUser?.carPlate);
        const rowPlate = cleanLettersAndDigits(row.car_plate || row.carPlate);

        const myPhone = cleanPhoneDigits(snap.currentUser?.phone);
        const rowPhone = cleanPhoneDigits(row.customer_phone || row.customerPhone);

        const isMatchPlate = !!myPlate && !!rowPlate && myPlate === rowPlate;
        const isMatchPhone = !!myPhone && !!rowPhone && myPhone === rowPhone;
        const isMatchSession = !!snap.sessionId && row.id === snap.sessionId;
        const isMatchGarage = !!snap.currentGarageId && (row.garage_id === snap.currentGarageId || row.garageId === snap.currentGarageId);
        const isAdmin = snap.view === 'admin';

        const isMatch = isMatchPlate || isMatchPhone || isMatchSession || isMatchGarage || isAdmin;

        if (row.is_breached === true && row.status === 'active' && isMatch) {
          triggerAlarm(row.car_plate, row.breach_reason, row.id);
        } else if (row.is_breached === false && isMatch) {
          // 🔄 إيقاف الإنذار فوراً عند تأكيد العميل للأمان
          setIsBreached(false);
          setBreachAlert(null);
          setIsMuted(false);
          isMutedRef.current = false;
          stopSirenRepeat();
          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'STOP_THEFT_ALARM' });
          }
        }
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
      stopSirenRepeat();
    };
  }, []);

  // فحص مباشر لو العميل ضغط على إشعار من شاشة القفل
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('breach') === 'true') {
      triggerAlarm(params.get('carPlate') || carPlate || 'المركبة', '🚨 تم رصد محاولة تحريك وسرقة لسيارتك!', sessionId || undefined);
      try { window.history.replaceState({}, document.title, window.location.pathname); } catch {}
    }
  }, [carPlate, sessionId]);

  // إيقاف وتأكيد الأمان للعميل
  const handleDismiss = async () => {
    stopSirenRepeat();
    setIsBreached(false);
    isMutedRef.current = true;
    
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'STOP_THEFT_ALARM' });
    }
    const currentPlate = breachAlert?.carPlate || carPlate;
    if (currentPlate) stopTheftAlarmRepeat({ carPlate: currentPlate });

    if (breachAlert?.sessionId) {
      await supabase.from('sessions').update({ is_breached: false, breach_reason: '' }).eq('id', breachAlert.sessionId);
    }
    setBreachAlert(null);
    toast.success('تم إيقاف الإنذار وتأكيد أمان المركبة 🛡️');
  };

  // 🔇 كتم الصوت الفوري الصاعق (للسايس والعميل)
  const handleMute = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    isMutedRef.current = true; // كتم المتغير المرجعي فوراً
    setIsMuted(true);
    stopSirenRepeat(); // قطع الصوت والاهتزاز فوراً في نفس اللحظة

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'STOP_THEFT_ALARM' });
    }
    toast.success('🔇 تم كتم الصوت فوراً');
  };

  if (!isBreached || !breachAlert) return null;

  // 🅿️ واجهة السايس: بانر عائم علوي دائم (مع زر كتم فوري يستجيب من اللمسة الأولى)
  if (view === 'garage') {
    return (
      <div className="fixed top-3 left-3 right-3 z-[9999999] pointer-events-none" dir="rtl">
        <div 
          className="max-w-md mx-auto rounded-2xl shadow-2xl p-3.5 pointer-events-auto border-2 text-white flex items-center justify-between"
          style={{
            background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
            borderColor: 'rgba(255, 255, 255, 0.4)',
            boxShadow: '0 8px 30px rgba(220, 38, 38, 0.6)'
          }}
        >
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl shrink-0">
              🚨
            </div>
            <div className="text-right min-w-0 flex-1">
              <div className="text-xs font-black flex items-center gap-1 text-white">
                <ShieldAlert size={14} className="text-amber-300" />
                <span>إنذار سرقة نشط!</span>
              </div>
              <div className="text-[11px] font-bold text-red-100 truncate mt-0.5">
                🚗 لوحة: <b className="text-white text-xs">{breachAlert.carPlate}</b>
              </div>
              <div className="text-[9px] text-amber-200 font-bold mt-0.5 truncate">
                افحص السيارة فوراً • في انتظار تأكيد العميل
              </div>
            </div>
          </div>
          
          <div className="mr-2 shrink-0">
            {!isMuted ? (
              <button 
                type="button"
                onClick={handleMute} 
                className="bg-white text-red-600 text-xs font-black px-4 py-2.5 rounded-xl border-0 cursor-pointer active:scale-90 shadow-xl flex items-center gap-1.5 transition-transform"
              >
                <VolumeX size={14} /> كتم الصوت
              </button>
            ) : (
              <span className="text-[10px] font-black bg-white/20 px-3 py-2 rounded-lg border border-white/20 text-white block">
                🔇 الصوت مكتوم
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 👑 واجهة العميل: شاشة حمراء كاملة للسيطرة والتحذير الشديد
  return (
    <div className="fixed inset-0 z-[9999999] bg-red-950/95 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 text-white animate-pulse" dir="rtl">
      <div className="w-24 h-24 bg-red-600 rounded-full flex items-center justify-center text-5xl mb-6 shadow-2xl animate-bounce">🚨</div>
      <h2 className="text-2xl font-black mb-1">تحذير سرقة نشط!</h2>
      <span className="bg-red-900 text-red-100 text-xs font-black px-4 py-1.5 rounded-full mb-4 border border-red-700 shadow-md">
        🚗 لوحة السيارة: {breachAlert.carPlate}
      </span>
      <p className="text-slate-100 text-xs font-bold max-w-xs mb-6 leading-relaxed">{breachAlert.reason}</p>

      <div className="w-full max-w-xs space-y-2.5">
        <button onClick={handleDismiss} className="w-full bg-white text-red-600 font-black py-4 rounded-2xl text-xs cursor-pointer border-0 shadow-2xl active:scale-95 transition-all">
          🔕 تأكيد أمان سيارتي وإيقاف الإنذار نهائياً
        </button>
        {!isMuted ? (
          <button onClick={handleMute} className="w-full bg-white/10 text-white font-black py-3 rounded-xl text-[11px] border border-white/20 cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-1.5">
            <VolumeX size={14} /> كتم صوت هاتفي مؤقتاً
          </button>
        ) : (
          <div className="text-[10px] text-amber-300 font-bold py-1">🔇 تم كتم الصوت بجهازك</div>
        )}
      </div>
    </div>
  );
}