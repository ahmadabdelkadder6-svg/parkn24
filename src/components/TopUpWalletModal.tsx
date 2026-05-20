import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { X, Copy, ExternalLink, ArrowRight, ShieldCheck, Lock, Plus, Minus, Phone, CheckCircle } from 'lucide-react';
import { useStore } from '../store';
import toast from 'react-hot-toast';

const WALLET_NUMBER = '01229858104';
const INSTAPAY_USERNAME = 'ahmed.ali858104';
const INSTAPAY_LINK = `https://ipn.eg/S/${INSTAPAY_USERNAME}/instapay/9fp24n`;

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export default function TopUpWalletModal({ onClose }: { onClose: () => void }) {
  const { currentUser, addWalletTopUp } = useStore();

  const [step, setStep] = useState<'amount' | 'method' | 'transfer' | 'confirm' | 'done'>('amount');
  const [amount, setAmount] = useState(100);
  const [method, setMethod] = useState<'instapay' | 'cashwallet'>('instapay');
  const confirmCode = useMemo(() => generateCode(), []);
  const [enteredCode, setEnteredCode] = useState('');
  const [codeError, setCodeError] = useState(false);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`تم نسخ ${label}`),
      () => toast.error('فشل النسخ')
    );
  };

  const handleSubmitTopUp = () => {
    if (enteredCode !== confirmCode) {
      setCodeError(true);
      toast.error('كود التأكيد غير صحيح');
      return;
    }
    if (!currentUser) return;

    addWalletTopUp({
      userId: currentUser.phone,
      userName: currentUser.name,
      userPhone: currentUser.phone,
      amount,
      transactionId: `TXN-${Date.now()}`,
      carPlate: currentUser.carPlate,
      method,
    });

    toast.success('تم إرسال طلب الشحن! ⏳ في انتظار اعتماد الأدمن');
    setStep('done');
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
        className="bg-slate-900 border-t border-slate-800 rounded-t-[2.5rem] w-full max-w-md max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* المقبض */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-700 rounded-full" />
        </div>

        <div className="p-5">
          {/* ========== اختيار المبلغ ========== */}
          {step === 'amount' && (
            <>
              <div className="flex items-center justify-between mb-6">
                <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={20} /></button>
                <h2 className="text-lg font-black text-white">شحن رصيد المحفظة</h2>
                <div className="w-8" />
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 mb-4 text-center">
                <div className="text-[10px] text-slate-500 mb-1">رصيدك الحالي</div>
                <div className="text-2xl font-black text-blue-400 font-mono">{currentUser?.wallet || 0} ج.م</div>
              </div>

              <div className="mb-4">
                <div className="text-xs font-black text-slate-400 mb-3 text-right">حدد مبلغ الشحن</div>
                <div className="flex items-center justify-center gap-5 mb-4">
                  <button onClick={() => setAmount((a) => Math.max(100, a - 50))}
                    className="bg-red-600/20 text-red-400 w-12 h-12 rounded-xl flex items-center justify-center border border-red-500/20 active:scale-90">
                    <Minus size={20} />
                  </button>
                  <div className="text-center">
                    <input type="number" value={amount}
                      onChange={(e) => setAmount(Math.max(100, parseInt(e.target.value) || 100))}
                      className={`bg-transparent text-4xl font-black text-center w-32 outline-none font-mono ${amount < 100 ? 'text-red-400' : 'text-white'}`} />
                    <div className="text-[10px] text-slate-500 font-bold">ج.م</div>
                  </div>
                  <button onClick={() => setAmount((a) => a + 50)}
                    className="bg-emerald-600/20 text-emerald-400 w-12 h-12 rounded-xl flex items-center justify-center border border-emerald-500/20 active:scale-90">
                    <Plus size={20} />
                  </button>
                </div>
                <div className="flex gap-2 justify-center flex-wrap">
                  {[100, 200, 300, 500, 1000].map((v) => (
                    <button key={v} onClick={() => setAmount(v)}
                      className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                        amount === v ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'
                      }`}>
                      {v} ج.م
                    </button>
                  ))}
                </div>
                <div className="mt-3 text-center text-[10px] text-amber-400 font-bold">⚠️ الحد الأدنى للشحن 100 ج.م</div>
              </div>

              <button onClick={() => setStep('method')} disabled={amount < 100}
                className={`w-full py-4 rounded-2xl font-black text-sm active:scale-95 transition-all flex items-center justify-center gap-2 ${
                  amount < 100 ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white'
                }`}>
                <Plus size={18} /> متابعة شحن {amount} ج.م
              </button>
            </>
          )}

          {/* ========== اختيار طريقة الشحن ========== */}
          {step === 'method' && (
            <>
              <div className="flex items-center justify-between mb-6">
                <button onClick={() => setStep('amount')} className="text-slate-500"><ArrowRight size={20} /></button>
                <h2 className="text-lg font-black text-white">طريقة الشحن</h2>
                <div className="w-8" />
              </div>

              <div className="bg-blue-600/10 border border-blue-500/20 rounded-2xl p-3 mb-5 text-center">
                <span className="text-xs text-slate-400">مبلغ الشحن: </span>
                <span className="text-xl font-black text-blue-400 font-mono">{amount} ج.م</span>
              </div>

              <div className="space-y-3 mb-5">
                <button onClick={() => { setMethod('instapay'); setStep('transfer'); }}
                  className="w-full bg-slate-950 border border-slate-800 hover:border-purple-500/50 rounded-2xl p-5 flex items-center gap-4 active:scale-[0.98] transition-all text-right">
                  <div className="bg-purple-600 p-3 rounded-xl text-2xl">📱</div>
                  <div className="flex-1">
                    <div className="text-sm font-black text-white mb-1">إنستاباي</div>
                    <div className="text-[10px] text-slate-500">تحويل عبر InstaPay</div>
                  </div>
                  <ArrowRight size={18} className="text-slate-600 rotate-180" />
                </button>

                <button onClick={() => { setMethod('cashwallet'); setStep('transfer'); }}
                  className="w-full bg-slate-950 border border-slate-800 hover:border-orange-500/50 rounded-2xl p-5 flex items-center gap-4 active:scale-[0.98] transition-all text-right">
                  <div className="bg-orange-600 p-3 rounded-xl text-2xl">📲</div>
                  <div className="flex-1">
                    <div className="text-sm font-black text-white mb-1">تحويل محفظة كاش</div>
                    <div className="text-[10px] text-slate-500">فودافون / أورانج / اتصالات / WE</div>
                  </div>
                  <ArrowRight size={18} className="text-slate-600 rotate-180" />
                </button>
              </div>
            </>
          )}

          {/* ========== بيانات التحويل ========== */}
          {step === 'transfer' && (
            <>
              <div className="flex items-center justify-between mb-6">
                <button onClick={() => setStep('method')} className="text-slate-500"><ArrowRight size={20} /></button>
                <h2 className="text-lg font-black text-white">
                  {method === 'instapay' ? 'تحويل إنستاباي' : 'تحويل محفظة كاش'}
                </h2>
                <div className="w-8" />
              </div>

              {/* المبلغ */}
              <div className={`rounded-[2rem] p-5 mb-5 text-center border ${
                method === 'instapay'
                  ? 'bg-gradient-to-br from-purple-600/30 to-indigo-600/20 border-purple-500/40'
                  : 'bg-gradient-to-br from-orange-600/30 to-amber-600/20 border-orange-500/40'
              }`}>
                <p className={`text-xs font-bold mb-2 ${method === 'instapay' ? 'text-purple-300' : 'text-orange-300'}`}>
                  المبلغ المطلوب تحويله
                </p>
                <div className="text-4xl font-black text-white font-mono">{amount}</div>
                <div className={`text-sm font-bold ${method === 'instapay' ? 'text-purple-300' : 'text-orange-300'}`}>جنيه مصري</div>
              </div>

              {/* بيانات التحويل */}
              <div className="bg-slate-950 border border-slate-800 rounded-[2rem] p-5 mb-5">
                {method === 'instapay' ? (
                  <>
                    {/* رابط إنستاباي */}
                    <a href={INSTAPAY_LINK} target="_blank" rel="noopener noreferrer"
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg mb-3">
                      <ExternalLink size={16} /> اضغط هنا لإرسال نقود
                    </a>
                    <div className="bg-slate-900 rounded-xl p-3 mb-3 border border-slate-800">
                      <div className="text-[10px] text-slate-500 font-bold mb-1 text-right">إرسال نقود إلى</div>
                      <div className="flex items-center justify-between">
                        <button onClick={() => copyToClipboard(`${INSTAPAY_USERNAME}@instapay`, 'الحساب')} className="text-blue-400 active:scale-90">
                          <Copy size={14} />
                        </button>
                        <div className="text-base font-black text-purple-400 font-mono" dir="ltr">{INSTAPAY_USERNAME}@instapay</div>
                      </div>
                    </div>
                    <div className="text-center">
                      <span className="text-[10px] text-slate-500">Powered by </span>
                      <span className="text-xs font-black text-purple-400">InstaPay</span>
                    </div>
                  </>
                ) : (
                  <>
                    {/* رقم محفظة كاش */}
                    <div className="text-center mb-3">
                      <div className="text-[10px] text-slate-500 font-bold mb-2">حوّل على الرقم التالي</div>
                      <div className="text-3xl font-black text-orange-400 font-mono tracking-wider mb-3" dir="ltr">{WALLET_NUMBER}</div>
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => copyToClipboard(WALLET_NUMBER, 'الرقم')}
                          className="bg-orange-600/20 text-orange-400 px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 active:scale-95 border border-orange-500/30">
                          <Copy size={14} /> نسخ الرقم
                        </button>
                        <a href={`tel:${WALLET_NUMBER}`}
                          className="bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 active:scale-95">
                          <Phone size={14} /> اتصال
                        </a>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <button onClick={() => setStep('confirm')}
                className={`w-full py-4 rounded-2xl font-black text-sm shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 ${
                  method === 'instapay' ? 'bg-purple-600 text-white' : 'bg-orange-600 text-white'
                }`}>
                <CheckCircle size={18} /> تم التحويل - أدخل كود التأكيد
              </button>
            </>
          )}

          {/* ========== كود التأكيد ========== */}
          {step === 'confirm' && (
            <>
              <div className="flex items-center justify-between mb-6">
                <button onClick={() => setStep('transfer')} className="text-slate-500"><ArrowRight size={20} /></button>
                <h2 className="text-lg font-black text-white">تأكيد الشحن</h2>
                <div className="w-8" />
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-[2rem] p-5 mb-5">
                <div className="text-center mb-5">
                  <ShieldCheck size={36} className="text-emerald-400 mx-auto mb-2" />
                  <p className="text-xs text-slate-400 mb-3">كود التأكيد</p>
                  <div className="bg-slate-900 border-2 border-dashed border-emerald-500/40 rounded-2xl p-4 mb-3">
                    <div className="text-3xl font-black text-emerald-400 font-mono tracking-[0.3em]">{confirmCode}</div>
                  </div>
                  <button onClick={() => copyToClipboard(confirmCode, 'الكود')}
                    className="bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 mx-auto active:scale-95">
                    <Copy size={14} /> نسخ
                  </button>
                </div>

                <input type="text" inputMode="numeric" maxLength={6} value={enteredCode}
                  onChange={(e) => { setEnteredCode(e.target.value.replace(/\D/g, '')); setCodeError(false); }}
                  placeholder="أدخل الكود (6 أرقام)"
                  className={`w-full bg-slate-900 p-4 rounded-2xl text-center text-2xl font-black font-mono tracking-[0.3em] outline-none border-2 ${
                    codeError ? 'border-red-500 text-red-400' : enteredCode.length === 6 ? 'border-emerald-500 text-emerald-400' : 'border-slate-800 text-white'
                  }`} />
                {codeError && <p className="text-red-400 text-xs text-center mt-2 font-bold">❌ كود غير صحيح</p>}
              </div>

              <button onClick={handleSubmitTopUp} disabled={enteredCode.length !== 6}
                className={`w-full py-4 rounded-2xl font-black text-sm shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 ${
                  enteredCode.length === 6 ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}>
                <Lock size={18} /> تأكيد وإرسال طلب الشحن
              </button>
            </>
          )}

          {/* ========== تم الإرسال ========== */}
          {step === 'done' && (
            <div className="text-center py-6">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }}>
                <CheckCircle size={64} className="text-emerald-400 mx-auto mb-4" />
              </motion.div>
              <h2 className="text-xl font-black text-emerald-400 mb-2">تم إرسال طلب الشحن!</h2>
              <p className="text-slate-400 text-sm mb-2">مبلغ الشحن: <span className="font-black text-white font-mono">{amount} ج.م</span></p>
              <p className="text-slate-500 text-xs mb-6">سيتم إضافة الرصيد بعد اعتماد الأدمن ⏳</p>

              <div className="bg-amber-600/10 border border-amber-500/20 rounded-xl p-3 mb-5">
                <p className="text-[10px] text-amber-400 font-bold">⏳ الطلب في انتظار اعتماد المشرف</p>
              </div>

              <button onClick={onClose}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-sm active:scale-95 transition-all">
                حسناً
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
