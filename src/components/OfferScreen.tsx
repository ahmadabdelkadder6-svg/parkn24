import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, MapPin, Star, Send, Minus, Plus, Zap } from 'lucide-react';
import { useStore } from '../store';
import toast from 'react-hot-toast';

export default function OfferScreen() {
  const {
    garages,
    selectedGarageId,
    setScreen,
    currentUser,
    addOffer,
    addIncomingCar,
    offers,
    sessions,
    incomingCars,
  } = useStore();

  const garage = garages.find((g) => g.id === selectedGarageId);
  const [price, setPrice] = useState(garage?.basePrice || 15);

  if (!garage) return null;

  const hasPendingOffer = offers.some(
    (o) => o.userId === currentUser?.phone && o.status === 'pending'
  );
  const hasActiveSession = sessions.some(
    (s) => s.carPlate === currentUser?.carPlate && s.status === 'active'
  );
  const hasIncomingCar = incomingCars.some(
    (c) =>
      c.carPlate === currentUser?.carPlate &&
      (c.status === 'coming' || c.status === 'arrived')
  );
  const hasExistingBooking = hasPendingOffer || hasActiveSession || hasIncomingCar;

  const hasAvailableSpots = garage.availableSpots > 0;

  // ✅ القبول التلقائي فقط لو السعر >= سعر الجراج وفيه أماكن
  const isAutoAccept = price >= garage.basePrice && hasAvailableSpots;
  const isBelowMinPrice = price < garage.basePrice;

  const estimatedMinutes = Math.floor(Math.random() * 10) + 3;

  const handleSubmit = () => {
    if (!currentUser) return;

    if (hasExistingBooking) {
      toast.error('لديك طلب أو جلسة نشطة بالفعل!');
      return;
    }

    // ✅ رفض تلقائي لو السعر أقل من سعر الجراج
    if (isBelowMinPrice) {
      toast.error(`❌ السعر أقل من الحد الأدنى (${garage.basePrice} ج.م/ساعة)`);
      setTimeout(() => {
        setScreen('list');
      }, 1500);
      return;
    }
// ✅ رفض تلقائي لو الجراج ممتلئ
if (!hasAvailableSpots) {
  toast.error('❌ الجراج ممتلئ حالياً - لا يمكن الحجز');
  setTimeout(() => {
    setScreen('list');
  }, 1500);
  return;
}

    if (isAutoAccept) {
      addOffer({
        garageId: garage.id,
        userId: currentUser.phone,
        carPlate: currentUser.carPlate,
        offeredPrice: price,
        status: 'accepted',
      });

      addIncomingCar({
        garageId: garage.id,
        carPlate: currentUser.carPlate,
        customerName: currentUser.name,
        customerPhone: currentUser.phone,
        agreedPrice: price,
        estimatedArrival: estimatedMinutes,
      });

      toast.success('تم قبول عرضك تلقائياً! 🎉');
      setScreen('navigation');
    } else {
      // مفيش أماكن
      addOffer({
        garageId: garage.id,
        userId: currentUser.phone,
        carPlate: currentUser.carPlate,
        offeredPrice: price,
        status: 'pending',
      });

      toast('الجراج ممتلئ حالياً - تم إرسال طلبك للمراجعة');
      setScreen('waiting');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-slate-950 text-white p-5 overflow-y-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pt-14">
        <button
          onClick={() => setScreen('list')}
          className="bg-slate-900 p-3 rounded-2xl border border-slate-800"
        >
          <ArrowRight size={20} />
        </button>
        <h2 className="text-lg font-black">تقديم عرض سعر</h2>
        <div className="w-12" />
      </div>

      {/* Garage Info */}
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-1 bg-amber-500/20 text-amber-400 px-2 py-1 rounded-full text-xs font-bold">
            <Star size={12} fill="currentColor" />
            {garage.rating}
          </div>
          <div className="text-right">
            <h3 className="text-xl font-black text-white mb-1">{garage.name}</h3>
            <div className="flex items-center gap-1 justify-end text-slate-400 text-xs">
              <span>{garage.location}</span>
              <MapPin size={12} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-950/60 p-3 rounded-xl text-center border border-slate-800">
            <div className="text-xl font-black text-blue-400 font-mono">
              {garage.availableSpots}
            </div>
            <div className="text-[9px] text-slate-500 font-bold">مكان شاغر</div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-xl text-center border border-slate-800">
            <div className="text-xl font-black text-emerald-400 font-mono">
              {garage.basePrice} ج.م
            </div>
            <div className="text-[9px] text-slate-500 font-bold">الحد الأدنى / ساعة</div>
          </div>
        </div>
      </div>

      {/* Price Offer */}
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 mb-6">
        <h3 className="text-sm font-black text-slate-300 mb-4 text-center">
          حدد السعر المقترح
        </h3>

        <div className="flex items-center justify-center gap-6 mb-6">
          <button
            onClick={() => setPrice((p) => Math.max(5, p - 5))}
            className="bg-red-600/20 text-red-400 w-14 h-14 rounded-2xl flex items-center justify-center border border-red-500/20 active:scale-90 transition-all"
          >
            <Minus size={24} />
          </button>

          <div className="text-center">
            <div className={`text-5xl font-black font-mono ${
              isBelowMinPrice ? 'text-red-400' : 'text-white'
            }`}>
              {price}
            </div>
            <div className="text-xs text-slate-500 font-bold">ج.م / ساعة</div>
            {isBelowMinPrice && (
              <div className="text-[9px] text-red-400 font-bold mt-1">
                أقل من الحد الأدنى!
              </div>
            )}
          </div>

          <button
            onClick={() => setPrice((p) => p + 5)}
            className="bg-emerald-600/20 text-emerald-400 w-14 h-14 rounded-2xl flex items-center justify-center border border-emerald-500/20 active:scale-90 transition-all"
          >
            <Plus size={24} />
          </button>
        </div>

        {/* Quick select */}
        <div className="flex gap-2 justify-center flex-wrap">
          {[10, 15, 20, 25, 30, 50].map((p) => (
            <button
              key={p}
              onClick={() => setPrice(p)}
              className={`px-4 py-2 rounded-xl text-sm font-black transition-all ${
                price === p
                  ? 'bg-blue-600 text-white shadow-lg'
                  : p < garage.basePrice
                  ? 'bg-red-600/10 text-red-500 border border-red-500/20'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {p} ج.م
            </button>
          ))}
        </div>

        {/* Status indicators */}
        {isAutoAccept && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 bg-emerald-600/20 border border-emerald-500/30 rounded-2xl p-3 flex items-center justify-center gap-2"
          >
            <Zap size={16} className="text-emerald-400" />
            <span className="text-xs font-black text-emerald-400">
              قبول تلقائي فوري ⚡
            </span>
          </motion.div>
        )}

        {/* ✅ رسالة الرفض التلقائي */}
        {isBelowMinPrice && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 bg-red-600/20 border border-red-500/30 rounded-2xl p-3 text-center"
          >
            <span className="text-xs font-black text-red-400">
              ❌ السعر أقل من الحد الأدنى ({garage.basePrice} ج.م)
            </span>
            <br />
            <span className="text-[10px] text-red-300/70">
              سيتم رفض الطلب تلقائياً والعودة للقائمة
            </span>
          </motion.div>
        )}

        {!isAutoAccept && !hasAvailableSpots && !isBelowMinPrice && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 bg-red-600/20 border border-red-500/30 rounded-2xl p-3 flex items-center justify-center gap-2"
          >
            <span className="text-xs font-black text-red-400">
              🚫 لا توجد أماكن شاغرة حالياً
            </span>
          </motion.div>
        )}
      </div>

      {/* Car info */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-6 flex items-center justify-between">
        <div className="text-sm font-black text-blue-400 font-mono">
          {currentUser?.carPlate}
        </div>
        <div className="text-xs text-slate-500 font-bold">رقم السيارة</div>
      </div>

      {/* تنبيه وجود طلب نشط */}
      {hasExistingBooking && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 bg-red-600/20 border border-red-500/30 rounded-2xl p-4 text-center"
        >
          <div className="text-2xl mb-2">⛔</div>
          <p className="text-xs font-black text-red-400 mb-1">
            لديك طلب أو جلسة نشطة بالفعل
          </p>
          <p className="text-[10px] text-red-300/70">
            لا يمكن إرسال أكثر من طلب في نفس الوقت
          </p>
        </motion.div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={hasExistingBooking}
        className={`w-full py-5 rounded-2xl font-black text-lg shadow-xl transition-all flex items-center justify-center gap-3 ${
          hasExistingBooking
            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
            : isBelowMinPrice
            ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-900/30 active:scale-95'
            : isAutoAccept
            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-900/30 active:scale-95'
            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-900/30 active:scale-95'
        }`}
      >
        {hasExistingBooking ? (
          <>لديك طلب نشط بالفعل</>
        ) : isBelowMinPrice ? (
          <>
            <span>❌</span>
            رفض تلقائي والعودة للقائمة
          </>
        ) : isAutoAccept ? (
          <>
            <Zap size={20} />
            احجز الآن (قبول فوري)
          </>
        ) : (
          <>
            <Send size={20} />
            إرسال طلب انتظار
          </>
        )}
      </button>
    </motion.div>
  );
}