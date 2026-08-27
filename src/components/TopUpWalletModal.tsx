import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  X, Copy, ExternalLink, ArrowRight, CheckCircle, Plus, Minus, 
  Phone, Send, Coins, Percent, Sparkles, Gift 
} from 'lucide-react';
import { useStore, calculateTierRefund } from '../store';
import toast from 'react-hot-toast';

const WALLET_NUMBER = '01229858104';
const INSTAPAY_USERNAME = 'ahmed.ali858104';
const INSTAPAY_LINK = `https://ipn.eg/S/${INSTAPAY_USERNAME}/instapay/9fp24n`;

// دالة لتوليد كود مرجعي تلقائي مميز يظهر للأدمن وللعميل في الأرشيف
function generateAutoReference(): string {
  return 'TXN-' + Math.floor(100000 + Math.random() * 900000).toString();
}

export default function TopUpWalletModal({ onClose }: { onClose: () => void }) {
  const { currentUser, addWalletTopUp } = useStore();

  const [step, setStep] = useState<'amount' | 'method' | 'transfer' | 'done'>('amount');
  const [amount, setAmount] = useState(100);
  const [method, setMethod] = useState<'instapay' | 'cashwallet'>('instapay');
  const [loading, setLoading] = useState(false);
  const [showTiersInfo, setShowTiersInfo] = useState(false);
  
  // توليد رقم العملية تلقائياً دون تدخل العميل
  const transactionId = useMemo(() => generateAutoReference(), [step]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`تم نسخ ${label}`),
      () => toast.error('فشل النسخ')
    );
  };

  // نسبة الكاش باك للمبلغ الحالي
  const currentCashbackTier = useMemo(() => {
    if (amount >= 1000) return { percent: '10%', color: '#10B981', label: 'كاش باك ذهبي' };
    if (amount >= 500) return { percent: '7%', color: '#0066FF', label: 'كاش باك فضي' };
    if (amount >= 200) return { percent: '5%', color: '#7C3AED', label: 'كاش باك برونزي' };
    if (amount >= 100) return { percent: '3%', color: '#FF9500', label: 'كاش باك أساسي' };
    return { percent: '0%', color: '#94a3b8', label: 'بدون كاش باك' };
  }, [amount]);

  const handleSubmitTopUp = async () => {
    if (!currentUser) return;

    const userId = (currentUser as any).id || currentUser.phone;
    const userPhone = currentUser.phone;

    if (!userPhone || userPhone.trim() === '') {
      toast.error('رقم الهاتف غير موجود، أعد التسجيل');
      return;
    }

    setLoading(true);
    const loadingToast = toast.loading('جاري إرسال طلب الشحن...');

    try {
      await addWalletTopUp({
        userId: userId,
        userName: currentUser.name,
        userPhone: userPhone,
        amount,
        transactionId: transactionId,
        carPlate: currentUser.carPlate,
        method,
      } as any);

      toast.dismiss(loadingToast);
      toast.success('تم إرسال طلب الشحن! ⏳ في انتظار اعتماد الأدمن');
      setStep('done');
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error('فشل إرسال الطلب، يرجى المحاولة لاحقاً');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25 }}
        className="bg-white rounded-t-[2.5rem] w-full max-w-md max-h-[92vh] overflow-y-auto"
        style={{ boxShadow: '0 -10px 40px rgba(0,0,0,0.15)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* المقبض */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: '#D0DCFF' }} />
        </div>

        <div className="p-5">
          {/* ══════════ الخطوة 1: اختيار المبلغ ══════════ */}
          {step === 'amount' && (
            <>
              <div className="flex items-center justify-between mb-5">
                <button onClick={onClose} style={{ color: '#94a3b8' }}><X size={20} /></button>
                <h2 className="font-black" style={{ fontSize: 18, color: '#0A1628' }}>شحن رصيد المحفظة</h2>
                <div className="w-8" />
              </div>

              {/* الرصيد الحالي */}
              <div className="text-center mb-4" style={{ background: 'linear-gradient(135deg,#0066FF,#4D00FF)', borderRadius: 22, padding: '18px 16px', color: '#fff', boxShadow: '0 8px 32px rgba(0,102,255,0.25)' }}>
                <div className="font-bold mb-1" style={{ fontSize: 11, opacity: 0.85 }}>رصيدك الحالي بالمحفظة</div>
                <div className="font-black font-mono" style={{ fontSize: 32 }}>{currentUser?.wallet || 0} <span style={{ fontSize: 14 }}>ج.م</span></div>
              </div>

              {/* 🎁 بطاقة كاش باك تحفيزية للشرائح */}
              <div 
                className="mb-4 p-3.5 rounded-2xl border transition-all"
                style={{
                  background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                  borderColor: '#FDE68A'
                }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-black text-xs flex items-center gap-1 text-amber-900 font-mono" style={{ color: currentCashbackTier.color }}>
                    <Coins size={14} /> كاش باك الركنات: {currentCashbackTier.percent}
                  </span>
                  <div className="flex items-center gap-1 text-amber-800 font-black text-xs">
                    <span>ميزة المحفظة</span>
                    <Sparkles size={13} className="text-amber-600" />
                  </div>
                </div>
                <p className="text-[10px] text-amber-800 font-bold leading-relaxed text-right">
                  الدفع من المحفظة يمنحك استرداداً تراكمياً فورياً يصل إلى 10% من قيمة كل ركنة بدءاً من الركنة الثانية!
                </p>

                {/* زر عرض تفاصيل الشرائح */}
                <button
                  onClick={() => setShowTiersInfo(!showTiersInfo)}
                  className="mt-2 text-[10px] font-black text-amber-900 underline flex items-center gap-1 justify-end w-full"
                >
                  {showTiersInfo ? 'إخفاء جدول الشرائح ▲' : 'عرض جدول شرائح الكاش باك ▼'}
                </button>

                {showTiersInfo && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-2.5 pt-2 border-t border-amber-300/60 space-y-1 text-right text-[10px]"
                  >
                    <div className="flex justify-between font-bold text-amber-950">
                      <span className="font-mono font-black text-emerald-700">10% كاش باك</span>
                      <span>من 1000 ج.م فأكثر:</span>
                    </div>
                    <div className="flex justify-between font-bold text-amber-950">
                      <span className="font-mono font-black text-blue-700">7% كاش باك</span>
                      <span>من 500 إلى 999 ج.م:</span>
                    </div>
                    <div className="flex justify-between font-bold text-amber-950">
                      <span className="font-mono font-black text-purple-700">5% كاش باك</span>
                      <span>من 200 إلى 499 ج.م:</span>
                    </div>
                    <div className="flex justify-between font-bold text-amber-950">
                      <span className="font-mono font-black text-amber-700">3% كاش باك</span>
                      <span>من 100 إلى 199 ج.م:</span>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* اختيار المبلغ */}
              <div className="mb-5">
                <div className="font-black mb-3 text-right" style={{ fontSize: 13, color: '#7B8CA6' }}>حدد مبلغ الشحن</div>
                <div className="flex items-center justify-center gap-5 mb-4">
                  <button onClick={() => setAmount((a) => Math.max(100, a - 50))} className="active:scale-90 transition-all"
                    style={{ background: '#FFE0E0', color: '#CC0000', width: 52, height: 52, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}>
                    <Minus size={22} />
                  </button>
                  <div className="text-center">
                    <input type="number" value={amount}
                      onChange={(e) => setAmount(Math.max(100, parseInt(e.target.value) || 100))}
                      className="bg-transparent text-center outline-none font-mono font-black"
                      style={{ fontSize: 44, width: 140, color: amount < 100 ? '#CC0000' : '#0A1628' }} />
                    <div className="font-bold" style={{ fontSize: 11, color: '#94a3b8' }}>ج.م</div>
                  </div>
                  <button onClick={() => setAmount((a) => a + 50)} className="active:scale-90 transition-all"
                    style={{ background: '#D1FAE5', color: '#059669', width: 52, height: 52, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}>
                    <Plus size={22} />
                  </button>
                </div>
                <div className="flex gap-2 justify-center flex-wrap">
                  {[100, 200, 300, 500, 1000].map((v) => (
                    <button key={v} onClick={() => setAmount(v)} className="font-black transition-all active:scale-95"
                      style={{ padding: '8px 16px', borderRadius: 14, fontSize: 13, background: amount === v ? '#0066FF' : '#F0F4FF', color: amount === v ? '#fff' : '#64748b', boxShadow: amount === v ? '0 4px 12px rgba(0,102,255,0.3)' : 'none', border: amount === v ? 'none' : '2px solid #D0DCFF' }}>
                      {v} ج.م
                    </button>
                  ))}
                </div>
                <div className="mt-3 text-center font-bold" style={{ fontSize: 11, color: '#FF9500' }}>⚠️ الحد الأدنى للشحن 100 ج.م</div>
              </div>

              <button onClick={() => setStep('method')} disabled={amount < 100} className="w-full font-black flex items-center justify-center gap-2 active:scale-95 transition-all"
                style={{ background: amount < 100 ? '#F0F4FF' : 'linear-gradient(135deg,#0066FF,#4D00FF)', color: amount < 100 ? '#94a3b8' : '#fff', padding: 18, borderRadius: 22, fontSize: 15, boxShadow: amount < 100 ? 'none' : '0 8px 32px rgba(0,102,255,0.35)', cursor: amount < 100 ? 'not-allowed' : 'pointer', border: 'none' }}>
                <Plus size={20} /> متابعة شحن {amount} ج.م
              </button>
            </>
          )}

          {/* ══════════ الخطوة 2: اختيار طريقة الشحن ══════════ */}
          {step === 'method' && (
            <>
              <div className="flex items-center justify-between mb-6">
                <button onClick={() => setStep('amount')} style={{ color: '#94a3b8' }}><ArrowRight size={20} /></button>
                <h2 className="font-black" style={{ fontSize: 18, color: '#0A1628' }}>طريقة الشحن</h2>
                <div className="w-8" />
              </div>

              <div className="text-center mb-5" style={{ background: '#EBF2FF', borderRadius: 18, padding: '14px 16px', border: '2px solid #D0DCFF' }}>
                <span className="font-bold" style={{ fontSize: 13, color: '#7B8CA6' }}>مبلغ الشحن: </span>
                <span className="font-black font-mono" style={{ fontSize: 22, color: '#0066FF' }}>{amount} ج.م</span>
              </div>

              <div className="space-y-3 mb-5">
                <button onClick={() => { setMethod('instapay'); setStep('transfer'); }}
                  className="w-full flex items-center gap-4 active:scale-[0.98] transition-all text-right"
                  style={{ background: '#fff', border: '2.5px solid #E9D5FF', borderRadius: 24, padding: 20, boxShadow: '0 4px 20px rgba(124,58,237,0.08)' }}>
                  <div style={{ background: '#7C3AED', borderRadius: 18, padding: 14, fontSize: 24, boxShadow: '0 4px 16px rgba(124,58,237,0.3)' }}>📱</div>
                  <div className="flex-1">
                    <div className="font-black" style={{ fontSize: 15, color: '#0A1628', marginBottom: 4 }}>إنستاباي</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>تحويل فوري عبر InstaPay</div>
                  </div>
                  <ArrowRight size={20} style={{ color: '#D0DCFF', transform: 'rotate(180deg)' }} />
                </button>

                <button onClick={() => { setMethod('cashwallet'); setStep('transfer'); }}
                  className="w-full flex items-center gap-4 active:scale-[0.98] transition-all text-right"
                  style={{ background: '#fff', border: '2.5px solid #FFD180', borderRadius: 24, padding: 20, boxShadow: '0 4px 20px rgba(255,149,0,0.08)' }}>
                  <div style={{ background: '#FF8800', borderRadius: 18, padding: 14, fontSize: 24, boxShadow: '0 4px 16px rgba(255,136,0,0.3)' }}>📲</div>
                  <div className="flex-1">
                    <div className="font-black" style={{ fontSize: 15, color: '#0A1628', marginBottom: 4 }}>تحويل محفظة كاش</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>فودافون / أورانج / اتصالات / WE</div>
                  </div>
                  <ArrowRight size={20} style={{ color: '#D0DCFF', transform: 'rotate(180deg)' }} />
                </button>
              </div>
            </>
          )}

          {/* ══════════ الخطوة 3: بيانات التحويل والإرسال الفوري ══════════ */}
          {step === 'transfer' && (
            <>
              <div className="flex items-center justify-between mb-6">
                <button onClick={() => setStep('method')} style={{ color: '#94a3b8' }}><ArrowRight size={20} /></button>
                <h2 className="font-black" style={{ fontSize: 18, color: '#0A1628' }}>
                  {method === 'instapay' ? 'تحويل إنستاباي' : 'تحويل محفظة كاش'}
                </h2>
                <div className="w-8" />
              </div>

              {/* المبلغ */}
              <div className="text-center mb-5" style={{
                background: method === 'instapay' ? 'linear-gradient(135deg,#7C3AED,#5B21B6)' : 'linear-gradient(135deg,#FF8800,#CC6600)',
                borderRadius: 26, padding: '24px 20px', color: '#fff',
                boxShadow: method === 'instapay' ? '0 8px 32px rgba(124,58,237,0.3)' : '0 8px 32px rgba(255,136,0,0.3)',
              }}>
                <div className="font-bold mb-2" style={{ fontSize: 12, opacity: 0.8 }}>المبلغ المطلوب تحويله</div>
                <div className="font-black font-mono" style={{ fontSize: 44 }}>{amount}</div>
                <div className="font-bold" style={{ fontSize: 14, opacity: 0.8 }}>جنيه مصري</div>
              </div>

              {/* بيانات التحويل */}
              <div className="mb-5" style={{ background: '#fff', border: '2.5px solid #D0DCFF', borderRadius: 26, padding: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
                {method === 'instapay' ? (
                  <>
                    <a href={INSTAPAY_LINK} target="_blank" rel="noopener noreferrer"
                      className="w-full font-black flex items-center justify-center gap-2 active:scale-95 transition-all mb-3"
                      style={{ background: 'linear-gradient(135deg,#7C3AED,#5B21B6)', color: '#fff', padding: 16, borderRadius: 18, fontSize: 14, boxShadow: '0 6px 24px rgba(124,58,237,0.35)' }}>
                      <ExternalLink size={18} /> اضغط هنا لإرسال نقود
                    </a>
                    <div style={{ background: '#F0F4FF', borderRadius: 18, padding: 14, border: '2px solid #D0DCFF', marginBottom: 12 }}>
                      <div className="font-bold text-right mb-1" style={{ fontSize: 10, color: '#94a3b8' }}>إرسال نقود إلى</div>
                      <div className="flex items-center justify-between">
                        <button onClick={() => copyToClipboard(`${INSTAPAY_USERNAME}@instapay`, 'الحساب')} style={{ color: '#0066FF' }} className="active:scale-90 flex gap-1 items-center font-bold text-xs bg-white py-1.5 px-3 rounded-lg border">
                          <Copy size={13} /> نسخ
                        </button>
                        <div className="font-black font-mono text-sm text-slate-800" dir="ltr">{INSTAPAY_USERNAME}@instapay</div>
                      </div>
                    </div>
                    <div className="text-center">
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>Powered by </span>
                      <span className="font-black" style={{ fontSize: 12, color: '#7C3AED' }}>InstaPay</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <div className="font-bold mb-2" style={{ fontSize: 11, color: '#94a3b8' }}>حوّل على الرقم التالي</div>
                    <div className="font-black font-mono mb-4" style={{ fontSize: 26, color: '#FF8800', letterSpacing: 3 }} dir="ltr">{WALLET_NUMBER}</div>
                    <div className="flex gap-2 justify-center">
                      <button onClick={() => copyToClipboard(WALLET_NUMBER, 'الرقم')}
                        className="font-black flex items-center gap-2 active:scale-95"
                        style={{ background: '#FFF3E0', color: '#E65100', padding: '10px 18px', borderRadius: 14, fontSize: 12, border: '2px solid #FFD180' }}>
                        <Copy size={16} /> نسخ الرقم
                      </button>
                      <a href={`tel:${WALLET_NUMBER}`}
                        className="font-bold flex items-center gap-2 active:scale-95"
                        style={{ background: '#F0F4FF', color: '#64748b', padding: '10px 18px', borderRadius: 14, fontSize: 12, border: '2px solid #D0DCFF' }}>
                        <Phone size={16} /> اتصال
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* زر الإرسال المباشر */}
              <button 
                onClick={handleSubmitTopUp} 
                disabled={loading}
                className="w-full font-black flex items-center justify-center gap-2 active:scale-95 transition-all"
                style={{
                  background: 'linear-gradient(135deg,#00CC66,#00AA55)',
                  color: '#fff', padding: 18, borderRadius: 22, fontSize: 15,
                  boxShadow: '0 8px 32px rgba(0,204,102,0.35)',
                  border: 'none'
                }}
              >
                <Send size={18} /> لقد قمت بالتحويل، أرسل الطلب الآن ✅
              </button>
            </>
          )}

          {/* ══════════ تم الإرسال بنجاح ══════════ */}
          {step === 'done' && (
            <div className="text-center py-6">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }}>
                <CheckCircle size={80} style={{ color: '#00CC66', margin: '0 auto 20px' }} />
              </motion.div>
              <h2 className="font-black mb-2" style={{ fontSize: 24, color: '#00AA44' }}>تم إرسال طلب الشحن!</h2>
              <p className="mb-2 text-slate-700" style={{ fontSize: 14 }}>
                المبلغ المراد شحنه: <span className="font-black font-mono text-slate-900" style={{ fontSize: 18 }}>{amount} ج.م</span>
              </p>
              
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 my-4">
                <span className="text-[10px] font-black text-slate-400 block">رقم طلبك للمتابعة تلقائياً</span>
                <span className="font-mono font-black text-sm text-slate-800 tracking-wider">{transactionId}</span>
              </div>

              <div className="mb-6 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                ✨ رصيدك في المحفظة يمنحك كاش باك تراكمي فوري يبدأ من ثاني ركنة!
              </div>

              <button onClick={onClose} className="w-full font-black active:scale-95 transition-all"
                style={{ background: 'linear-gradient(135deg,#0066FF,#4D00FF)', color: '#fff', padding: 18, borderRadius: 22, fontSize: 15, boxShadow: '0 8px 32px rgba(0,102,255,0.35)', border: 'none' }}>
                العودة للرئيسية
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}