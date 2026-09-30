// src/components/SecurityShield.tsx
import { useEffect, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { useStore, normalizePlate, normalizePhone } from '../store';
import { supabase } from '../lib/supabase';
import { sendTheftAlertPush, stopTheftAlarmRepeat } from '../lib/pushManager';
import { VolumeX, ShieldAlert } from 'lucide-react';

let globalAudioCtx: AudioContext | null = null;
let activeOscillators: OscillatorNode[] = [];
let isAudioUnlocked = false;

// 🔊 فتح قفل الصوت للمتصفحات لمنع كتم السارينة على الموبايل
const unlockAudioEngine = async () => {
  if (isAudioUnlocked && globalAudioCtx && globalAudioCtx.state === 'running') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    if (!globalAudioCtx) globalAudioCtx = new AudioCtx();
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

const stopAllSirenSounds = () => {
  try {
    activeOscillators.forEach((o) => { try { o.stop(); o.disconnect(); } catch {} });
    activeOscillators = [];
    if (globalAudioCtx && globalAudioCtx.state !== 'closed') {
      globalAudioCtx.close().catch(() => {});
      globalAudioCtx = null;
      isAudioUnlocked = false;
    }
  } catch {}
};

const playTheftSirenSound = async () => {
  try {
    await unlockAudioEngine();
    stopAllSirenSounds();
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    globalAudioCtx = new AudioCtx();
    if (globalAudioCtx.state === 'suspended') await globalAudioCtx.resume();

    const now = globalAudioCtx.currentTime;
    const gain = globalAudioCtx.createGain();
    gain.gain.setValueAtTime(1.0, now);
    gain.connect(globalAudioCtx.destination);

    for (let i = 0; i < 8; i++) {
      const start = now + (i * 0.3);
      const osc = globalAudioCtx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(i % 2 === 0 ? 1000 : 2200, start);
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + 0.28);
      activeOscillators.push(osc);
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

  const isMutedRef = useRef(isMuted);
  const sirenIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stateRef = useRef({ currentUser, currentGarageId, sessionId, view, carPlate });
  useEffect(() => {
    stateRef.current = { currentUser, currentGarageId, sessionId, view, carPlate };
  }, [currentUser, currentGarageId, sessionId, view, carPlate]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // طلب إذن الإشعارات من المتصفح تلقائياً
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const startSirenRepeat = () => {
    if (sirenIntervalRef.current) clearInterval(sirenIntervalRef.current);
    playTheftSirenSound();
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
    stopAllSirenSounds();
  };

  const triggerAlarm = (plate: string, reason: string, targetSessionId?: string) => {
    setIsBreached(true);
    setIsMuted(false);
    setBreachAlert({ 
      carPlate: plate || 'المركبة', 
      reason: reason || '🚨 تم رصد حركة وتحريك غير مصرح به للسيارة!', 
      sessionId: targetSessionId 
    });
    startSirenRepeat();
    if (navigator.vibrate) navigator.vibrate([1500, 200, 1500, 200, 2000]);
  };

  // 📡 الاستماع اللحظي لسيرفر Supabase (ربط ثنائي فوري بين السايس والعميل)
  useEffect(() => {
    const channel = supabase
      .channel(`shield-realtime-${Date.now()}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions' }, (payload) => {
        const row = payload.new as any;
        if (!row) return;

        const snap = stateRef.current;
        const myPlate = snap.currentUser?.carPlate?.replace(/\s/g, '');
        const rowPlate = row.car_plate?.replace(/\s/g, '');

        const isMatch =
          (myPlate && rowPlate && myPlate === rowPlate) ||
          (snap.currentUser?.phone && row.customer_phone && snap.currentUser.phone.slice(-8) === String(row.customer_phone).slice(-8)) ||
          (snap.sessionId && row.id === snap.sessionId) ||
          (snap.currentGarageId && row.garage_id === snap.currentGarageId) ||
          snap.view === 'admin';

        if (row.is_breached === true && row.status === 'active' && isMatch) {
          triggerAlarm(row.car_plate, row.breach_reason, row.id);
        } else if (row.is_breached === false && isMatch) {
          // 🔄 إيقاف الإنذار فوراً عند الطرفين بمجرد تأكيد الأمان
          setIsBreached(false);
          setBreachAlert(null);
          setIsMuted(false);
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

  // فحص مباشر لو العميل فتح من شاشة القفل عبر الإشعار
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('breach') === 'true') {
      triggerAlarm(params.get('carPlate') || carPlate || 'المركبة', '🚨 تم رصد محاولة تحريك وسرقة لسيارتك!', sessionId || undefined);
      try { window.history.replaceState({}, document.title, window.location.pathname); } catch {}
    }
  }, [carPlate, sessionId]);

  // إيقاف وتأكيد الأمان (العميل)
  const handleDismiss = async () => {
    stopSirenRepeat();
    setIsBreached(false);
    
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

  // كتم الصوت
  const handleMute = () => {
    stopSirenRepeat();
    setIsMuted(true);
    if (navigator.vibrate) navigator.vibrate(0);
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'STOP_THEFT_ALARM' });
    }
    toast.success('🔇 تم كتم الصوت');
  };

  if (!isBreached || !breachAlert) return null;

  // 🅿️ واجهة السايس: بانر عائم علوي فقط (الشاشة تحته شغالة 100% ويستطيع استلام باقي السيارات بحرية)
  if (view === 'garage') {
    return (
      <div className="fixed top-3 left-3 right-3 z-[9999999] pointer-events-none" dir="rtl">
        <div 
          className="max-w-md mx-auto rounded-2xl shadow-2xl p-3.5 pointer-events-auto border-2 text-white flex items-center justify-between animate-pulse"
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
                onClick={handleMute} 
                className="bg-white text-red-600 text-xs font-black px-3.5 py-2 rounded-xl border-0 cursor-pointer active:scale-95 shadow-md flex items-center gap-1"
              >
                <VolumeX size={13} /> كتم
              </button>
            ) : (
              <span className="text-[10px] font-black bg-white/20 px-2.5 py-1.5 rounded-lg border border-white/20 text-white">
                🔇 مكتوم
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 👑 واجهة العميل: شاشة حمراء كاملة مع سارينة إنذار متكررة
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
          <button onClick={handleMute} className="w-full bg-white/10 text-white font-black py-3 rounded-xl text-[11px] border border-white/20 cursor-pointer active:scale-95 transition-all">
            <VolumeX size={14} className="inline mr-1" /> كتم صوت هاتفي مؤقتاً
          </button>
        ) : (
          <div className="text-[10px] text-amber-300 font-bold py-1">🔇 تم كتم الصوت بجهازك</div>
        )}
      </div>
    </div>
  );
}