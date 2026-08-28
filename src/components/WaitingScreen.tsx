import { motion } from 'framer-motion';
import { Clock, ArrowRight, AlertCircle } from 'lucide-react';
import { useStore } from '../store';
import { useEffect, useState, useRef } from 'react';
import toast from 'react-hot-toast';

export default function WaitingScreen() {
  const {
    setScreen,
    offers,
    selectedGarageId,
    garages,
    currentUser,
    addIncomingCar,
    sessions,
    updateOffer,
    incomingCars,
  } = useStore();

  const garage = garages.find((g) => g.id === selectedGarageId);

  const latestOffer = offers
    .filter(
      (o) =>
        o.garageId === selectedGarageId &&
        o.userId === currentUser?.phone
    )
    .slice(-1)[0];

  // ✅ حساب الحالة من العرض مباشرة (بدل state منفصل)
  const offerStatus = latestOffer?.status;

  const [status, setStatus] = useState<'waiting' | 'accepted' | 'rejected'>(
    () => {
      if (offerStatus === 'accepted') return 'accepted';
      if (offerStatus === 'rejected') return 'rejected';
      return 'waiting';
    }
  );

  // ✅ منع تكرار addIncomingCar
  const incomingCarAddedRef = useRef(false);

  // ✅ مراقبة الجلسة النشطة
  const myActiveSession = sessions.find(
    (s) => s.carPlate === currentUser?.carPlate && s.status === 'active'
  );

  useEffect(() => {
    if (myActiveSession) {
      toast.success('تم بدء الجلسة! ⏱️');
      setScreen('session');
    }
  }, [myActiveSession?.id, setScreen]);

  // ✅ مراقبة حالة العرض من Supabase/Realtime
  useEffect(() => {
    if (offerStatus === 'accepted' && status !== 'accepted') {
      setStatus('accepted');
      toast.success('تم قبول عرضك! 🎉');
    } else if (offerStatus === 'rejected' && status !== 'rejected') {
      setStatus('rejected');
      toast.error('تم رفض العرض');
    }
  }, [offerStatus]);

  // ✅ محاكاة رد الجراج بعد 5 ثواني (للعرض التجريبي فقط)
  useEffect(() => {
    if (
      status === 'waiting' &&
      latestOffer?.status === 'pending' &&
      garage?.availableSpots &&
      garage.availableSpots > 0
    ) {
      const timer = setTimeout(() => {
        updateOffer(latestOffer.id, 'accepted');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [status, latestOffer?.id, latestOffer?.status, garage?.availableSpots, updateOffer]);

  // ✅ الانتقال للتنقل بعد القبول مع منع التكرار
  useEffect(() => {
    if (status !== 'accepted' || !currentUser || !garage) return;
    if (incomingCarAddedRef.current) return;

    const timer = setTimeout(() => {
      const alreadyIncoming = incomingCars.some(
        (c) =>
          c.carPlate === currentUser.carPlate &&
          (c.status === 'coming' || c.status === 'arrived')
      );

      if (!alreadyIncoming) {
        incomingCarAddedRef.current = true;
        const estimatedMinutes = Math.floor(Math.random() * 10) + 3;
        addIncomingCar({
          garageId: garage.id,
          carPlate: currentUser.carPlate,
          customerName: currentUser.name,
          customerPhone: currentUser.phone,
          agreedPrice: latestOffer?.offeredPrice || garage.basePrice,
          estimatedArrival: estimatedMinutes,
        });
      }

      setScreen('navigation');
    }, 1500);

    return () => clearTimeout(timer);
  }, [status, currentUser?.carPlate, garage?.id]);

  // ✅ لو العميل عنده incomingCar بالفعل → اذهب للتنقل مباشرة
  useEffect(() => {
    const myIncoming = incomingCars.find(
      (c) =>
        c.carPlate === currentUser?.carPlate &&
        (c.status === 'coming' || c.status === 'arrived')
    );

    if (myIncoming && status === 'waiting') {
      setStatus('accepted');
    }
  }, [incomingCars, currentUser?.carPlate, status]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-slate-950 text-white flex flex-col items-center justify-center p-8"
    >
      <button
        onClick={() => setScreen('list')}
        className="absolute top-5 right-5 bg-slate-900 p-3 rounded-2xl border border-slate-800 z-10"
      >
        <ArrowRight size={20} />
      </button>

      {/* ✅ حالة الانتظار */}
      {status === 'waiting' && (
        <>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
            className="mb-8"
          >
            <div className="w-24 h-24 bg-blue-600/20 rounded-full flex items-center justify-center border-4 border-blue-600/40">
              <Clock size={48} className="text-blue-400" />
            </div>
          </motion.div>

          <h2 className="text-2xl font-black mb-3 text-center">
            جاري انتظار الرد...
          </h2>
          <p className="text-slate-400 text-sm text-center mb-4">
            تم إرسال عرضك إلى {garage?.name}
          </p>

          <div
            className={`rounded-2xl p-4 mb-4 text-center border ${
              garage?.availableSpots && garage.availableSpots > 0
                ? 'bg-amber-600/20 border-amber-500/30'
                : 'bg-red-600/20 border-red-500/30'
            }`}
          >
            <AlertCircle
              size={20}
              className={`mx-auto mb-2 ${
                garage?.availableSpots && garage.availableSpots > 0
                  ? 'text-amber-400'
                  : 'text-red-400'
              }`}
            />
            <p
              className={`text-xs font-bold ${
                garage?.availableSpots && garage.availableSpots > 0
                  ? 'text-amber-300'
                  : 'text-red-300'
              }`}
            >
              {garage?.availableSpots && garage.availableSpots > 0
                ? 'السعر المقترح أقل من سعر الجراج'
                : 'الجراج ممتلئ حالياً'}
            </p>
            <p
              className={`text-[10px] mt-1 ${
                garage?.availableSpots && garage.availableSpots > 0
                  ? 'text-amber-400/70'
                  : 'text-red-400/70'
              }`}
            >
              {garage?.availableSpots && garage.availableSpots > 0
                ? 'يحتاج موافقة صاحب الجراج'
                : 'لن يتم القبول التلقائي حتى يتوفر مكان شاغر'}
            </p>
          </div>

          {latestOffer && (
            <div className="bg-slate-900 border border-slate-800 px-6 py-3 rounded-2xl text-center">
              <span className="text-xs text-slate-500">العرض: </span>
              <span className="text-xl font-black text-blue-400 font-mono">
                {latestOffer.offeredPrice} ج.م
              </span>
              <span className="text-xs text-slate-500 mr-2">/ ساعة</span>
            </div>
          )}

          <motion.div
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="mt-8 flex gap-2"
          >
            <div className="w-3 h-3 bg-blue-500 rounded-full" />
            <div className="w-3 h-3 bg-blue-400 rounded-full" />
            <div className="w-3 h-3 bg-blue-300 rounded-full" />
          </motion.div>

          <p className="text-[10px] text-slate-600 mt-6">
            💡 نصيحة: العروض بسعر الجراج الأساسي أو أعلى تُقبل تلقائياً
          </p>
        </>
      )}

      {/* ✅ حالة القبول */}
      {status === 'accepted' && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="text-center"
        >
          <div className="w-24 h-24 bg-emerald-600/20 rounded-full flex items-center justify-center mb-6 mx-auto border-4 border-emerald-500/40">
            <span className="text-5xl">✅</span>
          </div>
          <h2 className="text-2xl font-black text-emerald-400 mb-2">
            تم قبول العرض!
          </h2>
          <p className="text-slate-400 text-sm">جاري التوجيه للجراج...</p>

          <motion.div
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="mt-6 flex gap-2 justify-center"
          >
            <div className="w-3 h-3 bg-emerald-500 rounded-full" />
            <div className="w-3 h-3 bg-emerald-400 rounded-full" />
            <div className="w-3 h-3 bg-emerald-300 rounded-full" />
          </motion.div>
        </motion.div>
      )}

      {/* ✅ حالة الرفض */}
      {status === 'rejected' && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="text-center"
        >
          <div className="w-24 h-24 bg-red-600/20 rounded-full flex items-center justify-center mb-6 mx-auto border-4 border-red-500/40">
            <span className="text-5xl">❌</span>
          </div>
          <h2 className="text-2xl font-black text-red-400 mb-2">
            تم رفض العرض
          </h2>
          <p className="text-slate-400 text-sm mb-6">
            جرب جراج آخر أو عدّل السعر
          </p>
          <button
            onClick={() => setScreen('list')}
            className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black text-sm active:scale-95 transition-all"
          >
            العودة للقائمة
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}