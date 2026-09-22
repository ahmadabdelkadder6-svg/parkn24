import { useState, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Copy, ExternalLink, ArrowRight, CheckCircle, Plus, Minus, Phone, Send, Sparkles, ShieldCheck } from 'lucide-react';
// 🌟 استيراد مصفوفة الباقات الموحدة ودالة البونص ودالة تنظيف الهاتف من الـ Store مباشرة
import { useStore, TOPUP_TIERS, calculateBonus, normalizePhone } from '../store';
import toast from 'react-hot-toast';

const WALLET_NUMBER = '01229858104';
const INSTAPAY_USERNAME = 'ahmed.ali858104';
const INSTAPAY_LINK = `https://ipn.eg/S/${INSTAPAY_USERNAME}/instapay/9fp24n`;

// 🎨 الألوان الرسمية الفاخرة الموحدة لتطبيق Park'n 24
const BRAND = {
  blue: '#1656b8',       // الأزرق الرسمي
  blueDark: '#0f3d85',   // الكحلي الفخم
  blueLight: '#e8f0fe',  // الأزرق الفاتح جداً
  blueSoft: '#f0f5ff',   // خلفية ناعمة
  green: '#8cc63f',      // الأخضر الرسمي
  greenDark: '#6ea62a',  // أخضر داكن للخطوط
  greenLight: '#f2fae6', // خلفية خضراء ناعمة
  navy: '#0a1628',       // اللون الكحلي الليلي الغامق
  slate: '#475569',      // الرمادي الهادئ
  slateMuted: '#94a3b8', // الرمادي الباهت
  border: '#e2e8f0',     // حدود رفيعة هادئة
  card: '#ffffff',
  bg: '#f8fafc',
};

// 🛡️ توليد كود مرجعي فريد ومستحيل التكرار
function generateSecureReference(): string {
  const timestampPart = Date.now().toString(36).toUpperCase().slice(-4);
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `TXN-${timestampPart}-${randomPart}`;
}

export default function TopUpWalletModal({ onClose }: { onClose: () => void }) {
  const { currentUser, addWalletTopUp } = useStore();

  const [step, setStep] = useState<'amount' | 'method' | 'transfer' | 'done'>('amount');
  const [amount, setAmount] = useState<number>(100);
  const [method, setMethod] = useState<'instapay' | 'cashwallet'>('instapay');
  const [loading, setLoading] = useState(false);
  
  // 🛡️ تثبيت الكود طوال فترة فتح النافذة لمنع التغيير العشوائي
  const [transactionId] = useState<string>(() => generateSecureReference());
  const isSubmittingRef = useRef(false);

  // 🎁 حساب البونص التفاعلي مباشرة من دالة الـ Store الموحدة
  const currentBonus = useMemo(() => calculateBonus(amount), [amount]);
  const totalReceived = useMemo(() => amount + currentBonus, [amount, currentBonus]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`تم نسخ ${label}`),
      () => toast.error('فشل النسخ')
    );
  };

  const handleSubmitTopUp = async () => {
    // 🛡️ حماية أمنية صارمة من الضغط المزدوج والطلبات المكررة
    if (isSubmittingRef.current || loading) return;

    if (!currentUser) {
      toast.error('يرجى تسجيل الدخول أولاً');
      return;
    }

    const userPhone = normalizePhone(currentUser.phone);
    if (!userPhone) {
      toast.error('رقم الهاتف غير موجود، أعد التسجيل');
      return;
    }

    if (amount < 100) {
      toast.error('الحد الأدنى للشحن هو 100 ج.م');
      return;
    }

    try {
      isSubmittingRef.current = true;
      setLoading(true);
      const loadingToast = toast.loading('جاري إرسال طلب الشحن...');

      const userId = (currentUser as any).id || userPhone;

      await addWalletTopUp({
        userId: userId,
        userName: currentUser.name || 'حريف',
        userPhone: userPhone,
        amount: Math.floor(Number(amount)), // أرقام صحيحة فقط بدون كسور
        transactionId: transactionId,
        carPlate: currentUser.carPlate,
        method,
      } as any);

      toast.dismiss(loadingToast);
      toast.success(
        currentBonus > 0 
          ? `🎁 تم إرسال الطلب! ستحصل على ${amount} ج + ${currentBonus} ج بونص هدية عند الاعتماد`
          : 'تم إرسال طلب الشحن! ⏳ في انتظار اعتماد الإدارة',
        { duration: 5000 }
      );
      setStep('done');
    } catch (error) {
      console.error(error);
      toast.error('فشل إرسال الطلب، يرجى المحاولة لاحقاً');
      isSubmittingRef.current = false;
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(10,22,40,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 220 }}
        className="bg-white rounded-t-[2.2rem] w-full max-w-md max-h-[92vh] overflow-y-auto"
        style={{ boxShadow: '0 -8px 32px rgba(0,0,0,0.12)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* مقبض السحب العلوي لشكل Bottom Sheet مألوف وراقي */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1.5 rounded-full bg-slate-200" />
        </div>

        <div className="p-5 text-right" style={{ direction: 'rtl' }}>
          {/* ══════════ الخطوة 1: اختيار المبلغ + الشرائح ══════════ */}
          {step === 'amount' && (
            <>
              <div className="flex items-center justify-between mb-4">
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 border-0 bg-transparent cursor-pointer"><X size={20} /></button>
                <h2 className="font-black text-sm" style={{ color: BRAND.blueDark }}>شحن رصيد المحفظة</h2>
                <div className="w-6" />
              </div>

              {/* بطاقة الرصيد الحالي للعميل كحلي فاخر وموحد */}
              <div
                className="text-center mb-4 rounded-2xl p-4 text-white"
                style={{
                  background: BRAND.blue,
                  boxShadow: `0 4px 14px ${BRAND.blue}18`
                }}
              >
                <div className="text-[10px] font-bold opacity-80 mb-0.5">رصيدك الحالي بالمحفظة</div>
                <div className="text-2xl font-black font-mono">{currentUser?.wallet || 0} <span className="text-xs font-bold">ج.م</span></div>
              </div>

              {/* 💡 شريط توضيحي لاستخدام المحفظة في الركن ودرع الأمان */}
              <div className="mb-4 p-2 rounded-xl border flex items-center justify-between" style={{ background: BRAND.blueSoft, borderColor: BRAND.border }}>
                <div className="flex items-center gap-1.5">
                  <ShieldCheck size={14} style={{ color: BRAND.blue }} />
                  <span className="text-[10px] font-black" style={{ color: BRAND.blueDark }}>
                    جاهز لسداد الركنات وتفعيل درع الحماية الفضائية 🛡️
                  </span>
                </div>
              </div>

              {/* 🏆 الباقات التوفيرية النظيفة */}
              <div className="mb-4">
                <div className="font-black text-xs mb-3 flex items-center justify-start gap-1" style={{ color: BRAND.slate }}>
                  <Sparkles size={14} style={{ color: '#f59e0b' }} />
                  <span>اختر إحدى باقات الشحن التوفيرية:</span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {TOPUP_TIERS.map((tier) => {
                    const isSelected = amount === tier.amount;
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => setAmount(tier.amount)}
                        className="relative p-3.5 rounded-xl border-2 text-center transition-all active:scale-[0.97] cursor-pointer"
                        style={{
                          borderColor: isSelected ? BRAND.blue : BRAND.border,
                          background: isSelected ? BRAND.blueSoft : BRAND.card,
                        }}
                      >
                        {tier.popular && (
                          <span className="absolute -top-2.5 right-3 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-sm" style={{ background: '#ef4444' }}>
                            🔥 الأكثر طلباً
                          </span>
                        )}
                        <div className="font-black text-xs mb-0.5" style={{ color: BRAND.blueDark }}>{tier.label}</div>
                        <div className="text-xl font-black font-mono text-slate-900">{tier.amount} <span className="text-xs font-bold text-slate-500">ج</span></div>
                        <div className="mt-1.5 inline-block font-black text-[10px] px-2.5 py-0.5 rounded-lg" style={{ background: BRAND.greenLight, color: BRAND.greenDark }}>
                          🎁 +{tier.bonus} ج هدية
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* حقل إدخال مبلغ مخصص هادئ */}
              <div className="mb-4">
                <div className="font-black text-xs mb-2" style={{ color: BRAND.slate }}>أو حدد مبلغاً يدوياً:</div>
                <div className="flex items-center justify-center gap-4 p-2.5 rounded-xl border" style={{ background: BRAND.bg, borderColor: BRAND.border }}>
                  <button
                    type="button"
                    onClick={() => setAmount((a) => Math.max(100, a - 50))}
                    className="w-10 h-10 rounded-lg text-red-600 font-black flex items-center justify-center active:scale-90 border-0 cursor-pointer"
                    style={{ background: '#fee2e2' }}
                  >
                    <Minus size={16} />
                  </button>
                  <div className="text-center">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(Math.max(100, parseInt(e.target.value) || 100))}
                      className="bg-transparent text-center font-mono font-black text-2xl outline-none w-24 text-slate-900 border-0"
                    />
                    <span className="text-[10px] font-bold text-slate-400 block">جنيه مصري</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAmount((a) => a + 50)}
                    className="w-10 h-10 rounded-lg text-emerald-600 font-black flex items-center justify-center active:scale-90 border-0 cursor-pointer"
                    style={{ background: '#d1fae5' }}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {/* 🎁 بوكس تأكيد القيمة المضافة هادئ جداً */}
              <div className="mb-4 border-2 rounded-xl p-3 text-center" style={{ background: BRAND.greenLight, borderColor: BRAND.green }}>
                <div className="flex items-center justify-between">
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-500 block mb-0.5">إجمالي رصيد المحفظة بعد الشحن</span>
                    <span className="text-xl font-black font-mono" style={{ color: BRAND.greenDark }}>{totalReceived} ج.م</span>
                  </div>
                  <div className="text-left bg-white px-2.5 py-1 rounded-lg border" style={{ borderColor: BRAND.border }}>
                    <span className="text-[9px] font-bold text-slate-400 block">البونص الهدية</span>
                    <span className="text-xs font-black font-mono" style={{ color: BRAND.greenDark }}>+{currentBonus} ج 🎁</span>
                  </div>
                </div>
              </div>

              {/* زر التقدم للخطوة التالية */}
              <button
                type="button"
                onClick={() => setStep('method')}
                disabled={amount < 100}
                className="w-full text-white border-0 font-black py-3.5 rounded-xl text-xs active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                style={{
                  background: BRAND.blue,
                  boxShadow: `0 4px 14px ${BRAND.blue}25`
                }}
              >
                <span>متابعة شحن {amount} ج.م</span>
                <ArrowRight size={16} className="rotate-180" />
              </button>
            </>
          )}

          {/* ══════════ الخطوة 2: اختيار طريقة التحويل ══════════ */}
          {step === 'method' && (
            <>
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setStep('amount')} className="text-slate-400 hover:text-slate-600 border-0 bg-transparent cursor-pointer"><ArrowRight size={20} /></button>
                <h2 className="font-black text-sm" style={{ color: BRAND.blueDark }}>طريقة التحويل</h2>
                <div className="w-6" />
              </div>

              <div className="rounded-xl p-3.5 mb-4 text-center border" style={{ background: BRAND.bg, borderColor: BRAND.border }}>
                <span className="text-xs font-bold text-slate-500">المبلغ المطلوب تحويله: </span>
                <span className="text-lg font-black font-mono" style={{ color: BRAND.blue }}>{amount} ج.م</span>
                {currentBonus > 0 && (
                  <span className="block text-[10px] font-black mt-1" style={{ color: BRAND.greenDark }}>
                    (ستستلم {totalReceived} ج.م شامل {currentBonus} ج بونص هدية 🎁)
                  </span>
                )}
              </div>

              <div className="space-y-3 mb-5">
                <button
                  type="button"
                  onClick={() => { setMethod('instapay'); setStep('transfer'); }}
                  className="w-full flex items-center gap-3 bg-white border border-slate-200 hover:border-purple-400 p-4 rounded-xl text-right active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-lg bg-purple-600 text-white flex items-center justify-center text-lg shrink-0">📱</div>
                  <div className="flex-1">
                    <div className="font-black text-slate-900 text-xs">إنستاباي (InstaPay)</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">تحويل لحظي فوري بدون أي رسوم</div>
                  </div>
                  <ArrowRight size={16} className="text-slate-300 rotate-180" />
                </button>

                <button
                  type="button"
                  onClick={() => { setMethod('cashwallet'); setStep('transfer'); }}
                  className="w-full flex items-center gap-3 bg-white border border-slate-200 hover:border-amber-400 p-4 rounded-xl text-right active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-lg bg-amber-500 text-white flex items-center justify-center text-lg shrink-0">📲</div>
                  <div className="flex-1">
                    <div className="font-black text-slate-900 text-xs">محافظ الهاتف المحمول</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">فودافون / أورنج / اتصالات / WE كاش</div>
                  </div>
                  <ArrowRight size={16} className="text-slate-300 rotate-180" />
                </button>
              </div>
            </>
          )}

          {/* ══════════ الخطوة 3: بيانات التحويل ══════════ */}
          {step === 'transfer' && (
            <>
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setStep('method')} className="text-slate-400 hover:text-slate-600 border-0 bg-transparent cursor-pointer"><ArrowRight size={20} /></button>
                <h2 className="font-black text-sm" style={{ color: BRAND.blueDark }}>
                  {method === 'instapay' ? 'تحويل إنستاباي' : 'تحويل محفظة كاش'}
                </h2>
                <div className="w-6" />
              </div>

              {/* إيصال التحويل الداكن الأنيق */}
              <div
                className="text-center mb-4 rounded-2xl p-4 text-white relative overflow-hidden"
                style={{ background: BRAND.navy }}
              >
                <div className="text-[10px] font-bold opacity-80 mb-1 flex items-center justify-center gap-1">
                  <Sparkles size={11} style={{ color: BRAND.green }} />
                  <span>المبلغ المراد تحويله الآن:</span>
                </div>

                <div className="flex items-baseline justify-center gap-1">
                  <span className="font-mono text-4xl font-black text-white">{amount}</span>
                  <span className="text-xs font-black opacity-80">ج.م</span>
                </div>

                <div className="mt-3 text-[10px] font-mono opacity-80 bg-white/5 py-1 px-3 rounded-lg inline-block border border-white/10">
                  كود المعاملة: <span className="font-black" style={{ color: BRAND.green }}>{transactionId}</span>
                </div>

                {currentBonus > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/10 space-y-1">
                    <div className="flex justify-between items-center text-[10px] opacity-80">
                      <span>🎁 بونص إضافي هدية:</span>
                      <span className="font-mono font-black" style={{ color: BRAND.green }}>+{currentBonus} ج.م</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-black pt-1">
                      <span>💎 رصيد المحفظة القادم:</span>
                      <span className="font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10" style={{ color: BRAND.green }}>
                        {totalReceived} ج.م
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* أزرار التحويل المباشر الذكية */}
              <div className="border rounded-xl p-3.5 mb-5" style={{ background: BRAND.bg, borderColor: BRAND.border }}>
                {method === 'instapay' ? (
                  <>
                    <a
                      href={INSTAPAY_LINK}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-purple-600 text-white font-black py-2.5 rounded-lg flex items-center justify-center gap-2 mb-3 text-xs shadow-sm active:scale-95 transition-all text-decoration-none"
                    >
                      <ExternalLink size={14} /> فتح تطبيق إنستاباي للتحويل المباشر
                    </a>
                    <div className="flex items-center justify-between bg-white p-2 rounded-lg border">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(`${INSTAPAY_USERNAME}@instapay`, 'عنوان التحويل')}
                        className="bg-blue-50 text-blue-600 font-black text-[10px] px-3 py-1.5 rounded-lg flex items-center gap-1 active:scale-90 transition-all border-0 cursor-pointer"
                      >
                        <Copy size={12} /> نسخ العنوان
                      </button>
                      <span className="font-mono font-bold text-xs text-slate-800" dir="ltr">{INSTAPAY_USERNAME}@instapay</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <div className="text-[10px] text-slate-500 mb-1 font-bold">رقم المحفظة التي يتم التحويل إليها:</div>
                    <div className="text-xl font-black font-mono text-slate-900 mb-3 tracking-wider" dir="ltr">{WALLET_NUMBER}</div>
                    <div className="flex gap-2 justify-center">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(WALLET_NUMBER, 'رقم المحفظة')}
                        className="bg-amber-100 text-amber-800 font-black text-[10px] px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 active:scale-90 transition-all border-0 cursor-pointer"
                      >
                        <Copy size={12} /> نسخ الرقم
                      </button>
                      <a
                        href={`tel:${WALLET_NUMBER}`}
                        className="bg-slate-200 text-slate-700 font-bold text-[10px] px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 active:scale-90 transition-all text-decoration-none"
                      >
                        <Phone size={12} /> اتصال فوري
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* زر إرسال الطلب النهائي */}
              <button
                type="button"
                onClick={handleSubmitTopUp}
                disabled={loading}
                className="w-full text-white border-0 font-black py-3.5 rounded-xl text-xs active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                style={{
                  background: BRAND.greenDark,
                  boxShadow: `0 4px 14px ${BRAND.green}30`
                }}
              >
                <Send size={16} />
                <span>{loading ? 'جاري الإرسال...' : 'تم التحويل بنجاح، أرسل الطلب الآن'}</span>
              </button>
            </>
          )}

          {/* ══════════ الخطوة 4: شاشة النجاح والنهاية ══════════ */}
          {step === 'done' && (
            <div className="text-center py-4">
              <CheckCircle size={64} style={{ color: BRAND.green }} className="mx-auto mb-3" />
              <h3 className="text-lg font-black text-slate-900 mb-1">تم إرسال طلب الشحن بنجاح!</h3>
              <p className="text-[11px] text-slate-500 mb-4 font-bold">نقوم بمراجعة التحويل في ثوانٍ وإضافة الرصيد لمحفظتك فوراً ⏳</p>
              
              <div className="border rounded-xl p-4 mb-5 text-right space-y-2" style={{ background: BRAND.bg, borderColor: BRAND.border }}>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 font-bold">المبلغ المرسل:</span>
                  <span className="font-mono font-black text-slate-900">{amount} ج.م</span>
                </div>
                {currentBonus > 0 && (
                  <div className="flex justify-between text-xs font-bold" style={{ color: BRAND.greenDark }}>
                    <span>البونص الهدية:</span>
                    <span className="font-mono font-black">+{currentBonus} ج.م 🎁</span>
                  </div>
                )}
                <div className="flex justify-between text-xs pt-2 border-t font-black" style={{ borderColor: BRAND.border }}>
                  <span className="text-slate-800">إجمالي الرصيد المضاف:</span>
                  <span className="font-mono text-sm" style={{ color: BRAND.greenDark }}>{totalReceived} ج.م</span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full text-white border-0 font-black py-3.5 rounded-xl text-xs active:scale-[0.98] transition-all cursor-pointer"
                style={{ background: BRAND.blue }}
              >
                العودة للرئيسية والبدء
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}