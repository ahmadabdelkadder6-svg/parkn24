// src/components/SummaryScreen.tsx

import { motion } from 'framer-motion';
import { CheckCircle, Home, Calculator, Wallet, AlertTriangle, Gift, Shield } from 'lucide-react';
import { useStore, normalizePlate, normalizePhone, getServerNow } from '../store';
import { useState, useMemo, useEffect, useRef } from 'react';
import { calculateFullHours, calculateCost } from '../utils/pricing';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';

const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') return value < 1_000_000_000_000 ? value * 1000 : value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function SummaryScreen() {
  const {
    garages, selectedGarageId, sessions, endSession, setScreen, setSelectedGarageId,
    currentUser, deductWallet, fetchAll, acknowledgeSession,
  } = useStore();

  const userPlate = normalizePlate(currentUser?.carPlate);
  const userPhone = currentUser?.phone ? normalizePhone(currentUser.phone) : '';

  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'wallet' | 'free'>('cash');
  const [done, setDone] = useState(false);
  const [doneMethod, setDoneMethod] = useState('');
  const [doneTotalPrice, setDoneTotalPrice] = useState(0);
  const [remainingWallet, setRemainingWallet] = useState(0);

  const isEndingRef = useRef(false);

  const isMySession = (s: any): boolean => {
    const samePlate = !!userPlate && normalizePlate(s.carPlate) === userPlate;
    const sPhone = s.customerPhone ? normalizePhone(s.customerPhone) : '';
    return samePlate || Boolean(userPhone && sPhone === userPhone);
  };

  const activeSession = useMemo(() => {
    return sessions.filter((s) => s.status === 'active' && isMySession(s)).sort((a, b) => toMs(b.startTime) - toMs(a.startTime))[0];
  }, [sessions, userPlate, userPhone]);

  const lastCompletedSession = useMemo(() => {
    return sessions.filter((s) => s.status === 'completed' && isMySession(s)).sort((a, b) => toMs(b.endTime) - toMs(a.endTime))[0];
  }, [sessions, userPlate, userPhone]);

  const referenceSession = activeSession ?? lastCompletedSession;
  const garage = garages.find((g) => g.id === selectedGarageId) ?? garages.find((g) => g.id === referenceSession?.garageId);
  const paymentMode = (garage?.payment_mode as 'cash' | 'wallet' | 'both') || 'both';

  const methods = useMemo(() => {
    const list = [];
    if (paymentMode === 'cash' || paymentMode === 'both') list.push({ id: 'cash' as const, label: 'سداد نقدي كاش', icon: '💵' });
    if (paymentMode === 'wallet' || paymentMode === 'both') list.push({ id: 'wallet' as const, label: 'خصم من المحفظة', icon: '👝' });
    return list.length ? list : [{ id: 'cash' as const, label: 'سداد نقدي كاش', icon: '💵' }];
  }, [paymentMode]);

  useEffect(() => {
    if (paymentMode === 'cash') setPaymentMethod('cash');
    else if (paymentMode === 'wallet') setPaymentMethod('wallet');
  }, [paymentMode]);

  const durationSeconds = referenceSession
    ? referenceSession.status === 'completed' && referenceSession.endTime
      ? Math.floor((toMs(referenceSession.endTime) - toMs(referenceSession.startTime)) / 1000)
      : Math.floor((getServerNow() - toMs(referenceSession.startTime)) / 1000)
    : 0;

  const durationMinutes = Math.floor(durationSeconds / 60);
  const sessionRate = Number(referenceSession?.agreedPrice ?? garage?.basePrice ?? 0);

  // 🛡️ فحص تفعيل الدرع وقيمته
  const isShieldActive = referenceSession?.shieldEnabled === true;
  const shieldPrice = isShieldActive ? 10 : 0;

  // 🎁 فحص أول 30 دقيقة مجانية ترحيبية
  const isFirstFreeApplied = referenceSession?.isFirstFreeSession === true;
  const isFreeNow = isFirstFreeApplied && durationSeconds <= 1800;
  const billableHours = isFreeNow ? 0 : calculateFullHours(durationSeconds);
  const baseCost = isFreeNow ? 0 : calculateCost(durationSeconds, sessionRate);

  // السعر الإجمالي النهائي المعتمد
  const totalPrice = useMemo(() => {
    if (referenceSession?.status === 'completed' && referenceSession?.totalPrice != null) {
      return Number(referenceSession.totalPrice);
    }
    return baseCost + shieldPrice;
  }, [referenceSession, baseCost, shieldPrice]);

  const walletBalance = currentUser?.wallet ?? 0;
  const canPayWallet = walletBalance >= totalPrice;

  const handleConfirm = async () => {
    if (isEndingRef.current) return;
    isEndingRef.current = true;

    try {
      if (totalPrice === 0) {
        await endSession(activeSession!.id, 0, 'free', Math.floor(durationSeconds / 60));
        setDoneTotalPrice(0); setDoneMethod('free'); setDone(true);
        return;
      }

      if (paymentMethod === 'wallet') {
        if (!canPayWallet) { toast.error('رصيد المحفظة غير كافي'); return; }
        await endSession(activeSession!.id, totalPrice, 'wallet');
        setDoneTotalPrice(totalPrice); setDoneMethod('wallet'); setRemainingWallet(walletBalance - totalPrice); setDone(true);
        return;
      }

      await endSession(activeSession!.id, totalPrice, 'cash');
      setDoneTotalPrice(totalPrice); setDoneMethod('cash'); setRemainingWallet(walletBalance); setDone(true);
    } finally { setTimeout(() => { isEndingRef.current = false; }, 2000); }
  };

  if (done) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="h-full bg-white text-slate-900 flex flex-col items-center justify-center p-8">
        <CheckCircle size={80} className="text-emerald-500 mb-6" />
        <h2 className="text-3xl font-black text-emerald-600 mb-2">شكراً لك!</h2>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6 text-center w-full shadow-sm">
          <div className="text-4xl font-black text-slate-900 font-mono mb-1">{doneTotalPrice} ج.م</div>
          <div className="text-xs text-slate-400 mb-2">{billableHours} ساعة × {sessionRate} ج.م {isShieldActive && '+ 10ج درع 🛡️'}</div>
          {isShieldActive && <div className="text-[10px] font-bold text-sky-600 mb-2 flex items-center justify-center gap-1"><Shield size={11} /> يشمل 10 ج.م خدمة درع حماية السيارة</div>}
        </div>
        <button onClick={() => { setSelectedGarageId(null); setScreen('list'); }} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-2">
          <Home size={20} /> العودة للرئيسية
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full bg-white text-slate-900 p-6 overflow-y-auto">
      <div className="pt-10 mb-6 text-center">
        <h2 className="text-2xl font-black text-slate-900">ملخص الفاتورة</h2>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4 shadow-sm">
        <div className="text-center mb-3">
          <div className="text-4xl font-black text-slate-900 font-mono mb-0.5">{totalPrice} ج.م</div>
          <div className="text-[10px] text-slate-400 font-bold">إجمالي المبلغ المطلوب سداده</div>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 border border-slate-100 space-y-2 text-xs">
          <div className="flex justify-between"><span className="text-slate-500">مدة الركن الكلية</span><span className="font-mono font-black">{durationMinutes} دقيقة</span></div>
          <div className="flex justify-between"><span className="text-slate-500">رسم الركن</span><span className="font-mono font-black">{baseCost} ج.م</span></div>
          {isShieldActive && (
            <div className="flex justify-between text-sky-600 font-bold">
              <span className="flex items-center gap-1"><Shield size={12} /> درع حماية السيارة</span>
              <span className="font-mono font-black">+10 ج.م</span>
            </div>
          )}
          <div className="border-t pt-2 flex justify-between font-black text-emerald-600 text-sm">
            <span>المجموع النهائي</span><span className="font-mono">{totalPrice} ج.م</span>
          </div>
        </div>
      </div>

      {activeSession && (
        <div className="space-y-4">
          <h3 className="text-sm font-black text-right">طريقة الدفع</h3>
          <div className="grid grid-cols-2 gap-3">
            {methods.map((m) => (
              <button 
                key={m.id} 
                onClick={() => setPaymentMethod(m.id)} 
                className={`py-3 px-3 rounded-2xl border text-center transition-all relative flex flex-col items-center justify-center min-h-[110px] ${
                  paymentMethod === m.id 
                    ? m.id === 'wallet' 
                      ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400 text-blue-700' 
                      : 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-400 text-emerald-700' 
                    : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}
              >
                <div className="text-2xl mb-1">{m.icon}</div>
                <div className="font-black text-slate-800 leading-tight text-xs">{m.label}</div>
                
                {/* 💳 عرض الرصيد الحالي للعميل في كارت المحفظة */}
                {m.id === 'wallet' && (
                  <div className="mt-1.5 font-bold flex items-center justify-center gap-1 border-t border-blue-200/50 pt-1.5 w-full text-slate-600">
                    <span className="text-[10px] font-black">رصيدك:</span>
                    <span className="font-mono text-xs font-black">{walletBalance} ج</span>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* ⚠️ في حال عدم كفاية رصيد المحفظة */}
          {paymentMethod === 'wallet' && !canPayWallet && (
            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-500 shrink-0" />
              <div>
                <p className="text-xs text-red-600 font-bold">رصيد المحفظة غير كافي</p>
                <p className="text-[10px] text-red-400">المطلوب: {totalPrice} ج.م | رصيدك الحالي: {walletBalance} ج.م</p>
              </div>
            </motion.div>
          )}

          {/* 👝 تفاصيل الرصيد بعد الخصم المباشر من المحفظة */}
          {paymentMethod === 'wallet' && canPayWallet && (
            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-2">
              <Wallet size={18} className="text-blue-600 shrink-0" />
              <div className="text-right">
                <p className="text-xs text-blue-600 font-black">سيتم سحب وقيد الفاتورة من محفظتك تلقائياً</p>
                <p className="text-[10px] text-blue-400 font-bold mt-0.5">الرصيد المتبقي بعد الخصم: <span className="font-mono font-black">{walletBalance - totalPrice} ج.م</span></p>
              </div>
            </motion.div>
          )}

          <button onClick={handleConfirm} disabled={paymentMethod === 'wallet' && !canPayWallet} className="w-full py-4 rounded-2xl font-black text-lg bg-emerald-600 text-white shadow-xl disabled:bg-slate-200 disabled:text-slate-400">
            تأكيد وإنهاء ({totalPrice} ج.م)
          </button>
        </div>
      )}
    </motion.div>
  );
}