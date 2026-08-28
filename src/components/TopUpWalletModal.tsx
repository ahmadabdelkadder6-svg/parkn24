import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, ExternalLink, ArrowRight, CheckCircle, Plus, Minus, Phone, Send, Gift, Sparkles, Crown } from 'lucide-react';
import { useStore } from '../store';
import toast from 'react-hot-toast';

const WALLET_NUMBER = '01229858104';
const INSTAPAY_USERNAME = 'ahmed.ali858104';
const INSTAPAY_LINK = `https://ipn.eg/S/${INSTAPAY_USERNAME}/instapay/9fp24n`;

// 🏆 تعريف الشرائح والبونص مباشرة داخل المودال لضمان الظهور 100%
export const TIERS = [
  { id: 'bronze',   amount: 100,  bonus: 5,   label: '🥉 برونزي',   popular: false },
  { id: 'silver',   amount: 300,  bonus: 30,  label: '🥈 فضي',      popular: false },
  { id: 'gold',     amount: 500,  bonus: 75,  label: '🥇 ذهبي',     popular: true  },
  { id: 'platinum', amount: 1000, bonus: 200, label: '👑 بلاتيني', popular: false },
];

export const getBonus = (amount: number): number => {
  const val = Number(amount);
  if (isNaN(val) || val < 100) return 0;
  if (val >= 1000) return 200;
  if (val >= 500) return 75;
  if (val >= 300) return 30;
  if (val >= 100) return 5;
  return 0;
};

function generateAutoReference(): string {
  return 'TXN-' + Math.floor(100000 + Math.random() * 900000).toString();
}

export default function TopUpWalletModal({ onClose }: { onClose: () => void }) {
  const { currentUser, addWalletTopUp } = useStore();

  const [step, setStep] = useState<'amount' | 'method' | 'transfer' | 'done'>('amount');
  const [amount, setAmount] = useState<number>(100);
  const [method, setMethod] = useState<'instapay' | 'cashwallet'>('instapay');
  const [loading, setLoading] = useState(false);
  
  const transactionId = useMemo(() => generateAutoReference(), [step]);

  // 🎁 حساب البونص التفاعلي
  const currentBonus = useMemo(() => getBonus(amount), [amount]);
  const totalReceived = useMemo(() => amount + currentBonus, [amount, currentBonus]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`تم نسخ ${label}`),
      () => toast.error('فشل النسخ')
    );
  };

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
        amount: Number(amount),
        transactionId: transactionId,
        carPlate: currentUser.carPlate,
        method,
      } as any);

      toast.dismiss(loadingToast);
      toast.success(
        currentBonus > 0 
          ? `🎁 تم إرسال الطلب! ستحصل على ${amount} ج + ${currentBonus} ج بونص هدية عند الاعتماد`
          : 'تم إرسال طلب الشحن! ⏳ في انتظار اعتماد الأدمن',
        { duration: 5000 }
      );
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
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        <div className="p-5">
          {/* ══════════ الخطوة 1: اختيار المبلغ + الشرائح ══════════ */}
          {step === 'amount' && (
            <>
              <div className="flex items-center justify-between mb-4">
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                <h2 className="font-black text-slate-900 text-lg">شحن رصيد المحفظة</h2>
                <div className="w-6" />
              </div>

              {/* رصيد العميل الحالي */}
              <div className="text-center mb-4 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-4 text-white shadow-lg shadow-blue-500/20">
                <div className="text-xs font-bold opacity-80 mb-0.5">رصيدك الحالي</div>
                <div className="text-3xl font-black font-mono">{currentUser?.wallet || 0} <span className="text-sm">ج.م</span></div>
              </div>

              {/* 🏆 كروت الشرائح الأربعة المعروضة بشكل مباشر وواضح */}
              <div className="mb-4">
                <div className="font-black text-slate-600 text-xs mb-2.5 text-right flex items-center justify-end gap-1">
                  <span>اختر إحدى باقات الشحن التوفيرية</span>
                  <Sparkles size={14} className="text-amber-500" />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {TIERS.map((tier) => {
                    const isSelected = amount === tier.amount;
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => setAmount(tier.amount)}
                        className={`relative p-3.5 rounded-2xl border-2 text-center transition-all active:scale-95 ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50 shadow-md ring-2 ring-blue-500/30'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        {tier.popular && (
                          <span className="absolute -top-2.5 right-3 bg-red-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-sm">
                            🔥 الأكثر طلباً
                          </span>
                        )}
                        <div className="font-black text-slate-800 text-sm mb-0.5">{tier.label}</div>
                        <div className="text-2xl font-black font-mono text-slate-900">{tier.amount} <span className="text-xs font-bold text-slate-500">ج</span></div>
                        <div className="mt-1.5 inline-block bg-emerald-100 text-emerald-700 font-black text-xs px-2.5 py-0.5 rounded-lg">
                          🎁 +{tier.bonus} ج هدية
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* عداد إدخال المبلغ */}
              <div className="mb-4">
                <div className="font-black text-slate-500 text-xs mb-1.5 text-right">أو حدد مبلغ يدوي:</div>
                <div className="flex items-center justify-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setAmount((a) => Math.max(100, a - 50))}
                    className="w-10 h-10 rounded-xl bg-red-100 text-red-600 font-black flex items-center justify-center active:scale-90"
                  >
                    <Minus size={18} />
                  </button>
                  <div className="text-center">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(Math.max(100, parseInt(e.target.value) || 100))}
                      className="bg-transparent text-center font-mono font-black text-3xl outline-none w-28 text-slate-900"
                    />
                    <span className="text-xs font-bold text-slate-400 block">جنيه مصري</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAmount((a) => a + 50)}
                    className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 font-black flex items-center justify-center active:scale-90"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              {/* 🎁 بوكس تأكيد ما سيتم استلامه في المحفظة */}
              <div className="mb-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-400 rounded-2xl p-3.5 text-center">
                <div className="flex items-center justify-between">
                  <div className="text-right">
                    <span className="text-xs font-bold text-slate-500 block">إجمالي رصيد المحفظة</span>
                    <span className="text-2xl font-black font-mono text-emerald-600">{totalReceived} ج.م</span>
                  </div>
                  <div className="text-left bg-white px-3 py-1.5 rounded-xl border border-emerald-200">
                    <span className="text-[10px] font-bold text-slate-400 block">البونص الهدية</span>
                    <span className="text-sm font-black text-emerald-600 font-mono">+{currentBonus} ج 🎁</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStep('method')}
                disabled={amount < 100}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black py-4 rounded-2xl text-base shadow-lg shadow-blue-500/30 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <span>متابعة شحن {amount} ج.م</span>
                <ArrowRight size={18} className="rotate-180" />
              </button>
            </>
          )}

          {/* ══════════ الخطوة 2: اختيار طريقة التحويل ══════════ */}
          {step === 'method' && (
            <>
              <div className="flex items-center justify-between mb-5">
                <button onClick={() => setStep('amount')} className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></button>
                <h2 className="font-black text-slate-900 text-lg">طريقة التحويل</h2>
                <div className="w-6" />
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4 text-center">
                <span className="text-xs font-bold text-slate-500">المبلغ المطلوب تحويله: </span>
                <span className="text-xl font-black font-mono text-blue-600">{amount} ج.م</span>
                {currentBonus > 0 && (
                  <span className="block text-xs font-black text-emerald-600 mt-1">
                    (ستستلم {totalReceived} ج.م شامل {currentBonus} ج بونص 🎁)
                  </span>
                )}
              </div>

              <div className="space-y-3 mb-5">
                <button
                  type="button"
                  onClick={() => { setMethod('instapay'); setStep('transfer'); }}
                  className="w-full flex items-center gap-3 bg-white border-2 border-purple-200 hover:border-purple-500 p-4 rounded-2xl text-right active:scale-98 transition-all shadow-sm"
                >
                  <div className="w-12 h-12 rounded-xl bg-purple-600 text-white flex items-center justify-center text-xl shrink-0">📱</div>
                  <div className="flex-1">
                    <div className="font-black text-slate-900 text-sm">إنستاباي (InstaPay)</div>
                    <div className="text-xs text-slate-400">تحويل فوري بدون رسوم</div>
                  </div>
                  <ArrowRight size={18} className="text-slate-300 rotate-180" />
                </button>

                <button
                  type="button"
                  onClick={() => { setMethod('cashwallet'); setStep('transfer'); }}
                  className="w-full flex items-center gap-3 bg-white border-2 border-amber-200 hover:border-amber-500 p-4 rounded-2xl text-right active:scale-98 transition-all shadow-sm"
                >
                  <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center text-xl shrink-0">📲</div>
                  <div className="flex-1">
                    <div className="font-black text-slate-900 text-sm">محافظ الكاش</div>
                    <div className="text-xs text-slate-400">فودافون / أورنج / اتصالات / WE كاش</div>
                  </div>
                  <ArrowRight size={18} className="text-slate-300 rotate-180" />
                </button>
              </div>
            </>
          )}

          {/* ══════════ الخطوة 3: بيانات التحويل ══════════ */}
          {step === 'transfer' && (
            <>
              <div className="flex items-center justify-between mb-5">
                <button onClick={() => setStep('method')} className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></button>
                <h2 className="font-black text-slate-900 text-lg">
                  {method === 'instapay' ? 'تحويل إنستاباي' : 'تحويل محفظة كاش'}
                </h2>
                <div className="w-6" />
              </div>

              {/* كارت عرض المبلغ - بتصميم متبقين وفائق الوضوح وخطوط عريضة بارزة */}
              <div
                className="text-center mb-4 rounded-3xl p-5 text-white shadow-2xl relative overflow-hidden border border-amber-500/30"
                style={{
                  background: 'linear-gradient(135deg, #0F172A 0%, #020617 100%)',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
                }}
              >
                {/* تأثير لمعان بالخلفية */}
                <div className="absolute -top-10 -right-10 w-24 h-24 bg-amber-500/10 rounded-full filter blur-xl" />

                {/* 🌟 بادج العنوان بلون ذهبي فاقع وخط عريض جداً وواضح */}
                <div 
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black mb-3 shadow-md"
                  style={{
                    background: 'rgba(245, 158, 11, 0.15)',
                    border: '1.5px solid rgba(245, 158, 11, 0.4)',
                    color: '#FBBF24',
                    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                  }}
                >
                  <Sparkles size={13} className="text-yellow-400 animate-pulse" />
                  <span>المبلغ المراد تحويله</span>
                </div>

                {/* الرقم الرئيسي بلون أخضر زمردي ناصع وضخم للغاية */}
                <div className="flex items-end justify-center gap-2 drop-shadow-md">
                  <span className="font-mono text-5xl font-black text-emerald-400 leading-none">
                    {amount}
                  </span>
                  <span className="text-lg font-black text-white mb-1">ج.م</span>
                </div>

                {/* تفاصيل البونص التفاعلية بلون واضح */}
                {currentBonus > 0 && (
                  <div className="mt-4 pt-3 border-t border-white/10 space-y-1.5">
                    <div className="flex justify-between items-center text-xs font-black text-slate-300">
                      <span>🎁 بونص إضافي هدية:</span>
                      <span className="text-emerald-400 font-mono">+{currentBonus} ج.م</span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-black text-white pt-1">
                      <span>💎 رصيد المحفظة القادم:</span>
                      <span className="font-mono text-yellow-300 text-sm bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
                        {totalReceived} ج.م
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-5">
                {method === 'instapay' ? (
                  <>
                    <a
                      href={INSTAPAY_LINK}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-purple-600 text-white font-black py-3 rounded-xl flex items-center justify-center gap-2 mb-3 text-sm shadow-md"
                    >
                      <ExternalLink size={16} /> فتح تطبيق إنستاباي
                    </a>
                    <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(`${INSTAPAY_USERNAME}@instapay`, 'اسم المستخدم')}
                        className="bg-blue-50 text-blue-600 font-black text-xs px-3 py-1.5 rounded-lg flex items-center gap-1"
                      >
                        <Copy size={12} /> نسخ
                      </button>
                      <span className="font-mono font-bold text-xs text-slate-800" dir="ltr">{INSTAPAY_USERNAME}@instapay</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <div className="text-xs text-slate-500 mb-1 font-bold">رقم المحفظة للتحويل</div>
                    <div className="text-2xl font-black font-mono text-amber-600 mb-3 tracking-wider" dir="ltr">{WALLET_NUMBER}</div>
                    <div className="flex gap-2 justify-center">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(WALLET_NUMBER, 'رقم المحفظة')}
                        className="bg-amber-100 text-amber-800 font-black text-xs px-4 py-2 rounded-xl flex items-center gap-1.5"
                      >
                        <Copy size={14} /> نسخ الرقم
                      </button>
                      <a
                        href={`tel:${WALLET_NUMBER}`}
                        className="bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5"
                      >
                        <Phone size={14} /> اتصال
                      </a>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleSubmitTopUp}
                disabled={loading}
                className="w-full bg-emerald-600 text-white font-black py-4 rounded-2xl text-base shadow-lg shadow-emerald-500/30 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Send size={18} />
                <span>{loading ? 'جاري الإرسال...' : 'تم التحويل، أرسل الطلب الآن ✅'}</span>
              </button>
            </>
          )}

          {/* ══════════ الخطوة 4: تم بنجاح ══════════ */}
          {step === 'done' && (
            <div className="text-center py-4">
              <CheckCircle size={70} className="text-emerald-500 mx-auto mb-3" />
              <h3 className="text-xl font-black text-slate-900 mb-1">تم إرسال طلب الشحن بنجاح!</h3>
              <p className="text-xs text-slate-500 mb-4">سيتم مراجعة الطلب وإضافة الرصيد لمحفظتك فوراً ⏳</p>
              
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-5 text-right">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-500">المبلغ المشحون:</span>
                  <span className="font-mono font-black text-slate-900">{amount} ج.م</span>
                </div>
                {currentBonus > 0 && (
                  <div className="flex justify-between text-xs mb-1.5 text-emerald-600 font-bold">
                    <span>البونص الهدية:</span>
                    <span className="font-mono font-black">+{currentBonus} ج.م 🎁</span>
                  </div>
                )}
                <div className="flex justify-between text-xs pt-1.5 border-t border-slate-200 font-black">
                  <span className="text-slate-800">إجمالي الرصيد القادم:</span>
                  <span className="font-mono text-emerald-600 text-sm">{totalReceived} ج.م</span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full bg-slate-900 text-white font-black py-3.5 rounded-2xl text-sm"
              >
                إغلاق
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}