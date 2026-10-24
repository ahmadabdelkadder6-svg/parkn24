// src/components/TopUpWalletModal.tsx

import { useState, useMemo, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Copy, ExternalLink, ArrowRight, CheckCircle, Plus, Minus, Phone, Send, Sparkles, Wallet, ShieldCheck } from 'lucide-react';
import { useStore, TOPUP_TIERS, normalizePhone, BOOKING_FEE } from '../store';
import toast from 'react-hot-toast';

const WALLET_NUMBER = '01229858104';
const INSTAPAY_USERNAME = 'ahmed.ali858104';
const INSTAPAY_LINK = `https://ipn.eg/S/${INSTAPAY_USERNAME}/instapay/9fp24n`;

const MIN_AMOUNT = 20;
const MAX_AMOUNT = 100000;
const STEP_AMOUNT = 10;

const SHOW_CASH_WALLET_OPTION = false;

const LOCAL_BONUS_TIERS = [
  { amount: 250, bonus: 50 },
  { amount: 100, bonus: 15 },
  { amount: 50,  bonus: 5 },
  { amount: 20,  bonus: 2 },
];

const BRAND = {
  blue: '#1656b8',
  blueDark: '#0f3d85',
  blueLight: '#e8f0fe',
  blueSoft: 'rgba(22, 86, 184, 0.08)',
  green: '#8cc63f',
  greenDark: '#6ea62a',
  greenLight: 'rgba(140, 198, 63, 0.12)',
  navy: '#0a1628',
  slate: '#475569',
  slateMuted: '#94a3b8',
  border: '#e2e8f0',
  card: '#ffffff',
  bg: '#f8fafc',
};

function generateSecureReference(): string {
  const timestampPart = Date.now().toString(36).toUpperCase().slice(-4);
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `TXN-${timestampPart}-${randomPart}`;
}

function clampAmount(value: number): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) return MIN_AMOUNT;
  const intVal = Math.floor(value);
  if (intVal < MIN_AMOUNT) return MIN_AMOUNT;
  if (intVal > MAX_AMOUNT) return MAX_AMOUNT;
  return intVal;
}

export default function TopUpWalletModal({ onClose }: { onClose: () => void }) {
  const { currentUser, addWalletTopUp } = useStore();

  const [step, setStep] = useState<'amount' | 'method' | 'transfer' | 'done'>('amount');
  const [amount, setAmount] = useState<number>(100);
  const [method, setMethod] = useState<'instapay' | 'cashwallet'>('instapay');
  const [loading, setLoading] = useState(false);

  const [transactionId] = useState<string>(() => generateSecureReference());
  const isSubmittingRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      isSubmittingRef.current = false;
    };
  }, []);

  const currentBonus = useMemo(() => {
    const match = LOCAL_BONUS_TIERS.find((t) => amount >= t.amount);
    return match ? match.bonus : 0;
  }, [amount]);

  const totalReceived = useMemo(() => amount + currentBonus, [amount, currentBonus]);

  const estimatedBookings = useMemo(
    () => (BOOKING_FEE > 0 ? Math.floor(totalReceived / BOOKING_FEE) : 0),
    [totalReceived]
  );

  const handleSafeClose = () => {
    if (loading || isSubmittingRef.current) {
      toast.error('يرجى الانتظار حتى اكتمال إرسال الطلب');
      return;
    }
    onClose();
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        toast.success(`تم نسخ ${label}`);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        toast.success(`تم نسخ ${label}`);
      }
    } catch (err) {
      console.error('Copy failed:', err);
      toast.error('فشل النسخ، يرجى النسخ يدوياً');
    }
  };

  const handleSubmitTopUp = async () => {
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

    const safeAmount = clampAmount(amount);
    if (safeAmount < MIN_AMOUNT) {
      toast.error(`الحد الأدنى للشحن هو ${MIN_AMOUNT} ج.م`);
      return;
    }
    if (safeAmount > MAX_AMOUNT) {
      toast.error(`الحد الأقصى للشحن هو ${MAX_AMOUNT} ج.م`);
      return;
    }

    const loadingToast = toast.loading('جاري إرسال طلب الشحن...');

    try {
      isSubmittingRef.current = true;
      setLoading(true);

      const userId = (currentUser as any).id || userPhone;

      await addWalletTopUp({
        userId: userId,
        userName: currentUser.name || 'حريف',
        userPhone: userPhone,
        amount: safeAmount,
        bonus: currentBonus,
        transactionId: transactionId,
        carPlate: currentUser.carPlate,
        method,
      } as any);

      toast.dismiss(loadingToast);

      if (!isMountedRef.current) return;

      toast.success(
        currentBonus > 0
          ? `🎁 تم إرسال الطلب! ستحصل على ${safeAmount} ج + ${currentBonus} ج بونص`
          : 'تم إرسال طلب الشحن! ⏳ في انتظار اعتماد الإدارة',
        { duration: 5000 }
      );
      setStep('done');
    } catch (error) {
      console.error('Top-up error:', error);
      toast.dismiss(loadingToast);
      if (isMountedRef.current) {
        toast.error('فشل إرسال الطلب، يرجى المحاولة لاحقاً');
      }
    } finally {
      isSubmittingRef.current = false;
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(10, 22, 40, 0.85)' }}
      onClick={handleSafeClose}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 220 }}
        className="bg-white rounded-t-[32px] w-full max-w-md max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* مقبض السحب */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 rounded-full" style={{ background: BRAND.border }} />
        </div>

        <div className="px-5 pb-6 text-right" style={{ direction: 'rtl' }}>
          {/* ═══════════════════════════════════
              الخطوة 1: اختيار المبلغ
              ═══════════════════════════════════ */}
          {step === 'amount' && (
            <>
              {/* الهيدر */}
              <div className="flex items-center justify-between mb-4">
                <button
                  type="button"
                  onClick={handleSafeClose}
                  className="text-slate-400 hover:text-slate-600 border-0 bg-transparent cursor-pointer p-1"
                >
                  <X size={22} />
                </button>
                <h2 className="font-black text-base" style={{ color: BRAND.navy }}>
                  شحن المحفظة
                </h2>
                <div className="w-8" />
              </div>

              {/* كارت الرصيد (ستايل بنكي) */}
              <div
                className="relative overflow-hidden rounded-2xl p-4 mb-5 text-white shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueDark} 100%)`,
                }}
              >
                <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full opacity-20" style={{ background: BRAND.green }} />
                <div className="absolute -left-8 -bottom-8 w-24 h-24 rounded-full opacity-10" style={{ background: '#ffffff' }} />
                
                <div className="relative z-10 flex items-center justify-between mb-1">
                  <div className="text-[11px] font-black opacity-80 uppercase tracking-wider">رصيدك الحالي</div>
                  <Wallet size={16} className="opacity-80" />
                </div>
                <div className="relative z-10 flex items-baseline gap-1">
                  <span className="text-3xl font-black font-mono tracking-tight">
                    {(currentUser?.wallet ?? (currentUser as any)?.walletBalance ?? 0).toFixed(2)}
                  </span>
                  <span className="text-xs font-bold opacity-80">ج.م</span>
                </div>
              </div>

              {/* باقات الشحن */}
              <div className="mb-4">
                <div className="font-black text-xs mb-3 flex items-center gap-1.5" style={{ color: BRAND.slate }}>
                  <Sparkles size={14} className="text-amber-500" />
                  <span>اختر باقة التوفير الأنسب لك:</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[...TOPUP_TIERS].reverse().map((tier) => {
                    const isSelected = amount === tier.amount;
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => setAmount(tier.amount)}
                        className="relative p-3 rounded-xl border-2 text-center transition-all active:scale-[0.97] cursor-pointer bg-white"
                        style={{
                          borderColor: isSelected ? BRAND.blue : BRAND.border,
                          boxShadow: isSelected ? `0 4px 12px ${BRAND.blueSoft}` : 'none',
                        }}
                      >
                        {tier.popular && (
                          <span className="absolute -top-2.5 right-2 text-white text-[9px] font-black px-2 py-0.5 rounded-full" style={{ background: '#ef4444' }}>
                            🔥 الأكثر طلباً
                          </span>
                        )}
                        <div className="text-lg font-black font-mono" style={{ color: BRAND.navy }}>
                          {tier.amount} <span className="text-[10px] font-bold text-slate-400">ج</span>
                        </div>
                        <div className="mt-1 text-[10px] font-black px-2 py-0.5 rounded flex justify-center items-center gap-1" style={{ background: BRAND.greenLight, color: BRAND.greenDark }}>
                          🎁 +{tier.bonus} ج هدية
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* إدخال يدوي مدمج */}
              <div className="mb-5 flex items-center justify-between p-1.5 rounded-xl border" style={{ background: BRAND.bg, borderColor: BRAND.border }}>
                <button
                  type="button"
                  onClick={() => setAmount((a) => clampAmount(a - STEP_AMOUNT))}
                  disabled={amount <= MIN_AMOUNT}
                  className="w-10 h-10 rounded-lg flex items-center justify-center border-0 cursor-pointer disabled:opacity-40"
                  style={{ background: '#fee2e2', color: '#dc2626' }}
                >
                  <Minus size={18} strokeWidth={3} />
                </button>
                <div className="text-center flex-1">
                  <div className="text-[9px] font-bold text-slate-400">أو أدخل مبلغاً مخصصاً</div>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(clampAmount(parseInt(e.target.value, 10)))}
                    className="bg-transparent text-center font-mono font-black text-xl w-full outline-none border-0 p-0 m-0"
                    style={{ color: BRAND.navy }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setAmount((a) => clampAmount(a + STEP_AMOUNT))}
                  disabled={amount >= MAX_AMOUNT}
                  className="w-10 h-10 rounded-lg flex items-center justify-center border-0 cursor-pointer disabled:opacity-40"
                  style={{ background: '#d1fae5', color: '#16a34a' }}
                >
                  <Plus size={18} strokeWidth={3} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setStep('method')}
                disabled={amount < MIN_AMOUNT}
                className="w-full text-white border-0 font-black py-4 rounded-2xl text-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                style={{
                  background: `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueDark} 100%)`,
                  boxShadow: `0 8px 24px ${BRAND.blueSoft}`,
                }}
              >
                <span>متابعة الدفع ({totalReceived} ج.م)</span>
                <ArrowRight size={18} className="rotate-180" />
              </button>
            </>
          )}

          {/* ═══════════════════════════════════
              الخطوة 2: طريقة الدفع
              ═══════════════════════════════════ */}
          {step === 'method' && (
            <>
              <div className="flex items-center justify-between mb-5">
                <button
                  type="button"
                  onClick={() => setStep('amount')}
                  className="text-slate-400 hover:text-slate-600 border-0 bg-transparent cursor-pointer p-1"
                >
                  <ArrowRight size={22} />
                </button>
                <h2 className="font-black text-base" style={{ color: BRAND.navy }}>طريقة الدفع</h2>
                <div className="w-8" />
              </div>

              {/* ملخص الدفع */}
              <div className="rounded-xl p-4 mb-5 flex items-center justify-between border" style={{ background: BRAND.bg, borderColor: BRAND.border }}>
                <div>
                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">الإجمالي المستحق</div>
                  <div className="text-xl font-black font-mono" style={{ color: BRAND.blue }}>{amount} ج.م</div>
                </div>
                {currentBonus > 0 && (
                  <div className="text-left">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">البونص</div>
                    <div className="text-sm font-black font-mono" style={{ color: BRAND.greenDark }}>+{currentBonus} ج.م</div>
                  </div>
                )}
              </div>

              <div className="space-y-3 mb-6">
                <button
                  type="button"
                  onClick={() => { setMethod('instapay'); setStep('transfer'); }}
                  className="w-full flex items-center gap-3 bg-white border p-4 rounded-xl text-right active:scale-[0.98] transition-all cursor-pointer"
                  style={{ borderColor: BRAND.border }}
                >
                  <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center text-xl shrink-0">📱</div>
                  <div className="flex-1">
                    <div className="font-black text-sm" style={{ color: BRAND.navy }}>إنستاباي (InstaPay)</div>
                    <div className="text-[10px] font-bold mt-0.5" style={{ color: BRAND.slate }}>تحويل لحظي فوري بدون رسوم</div>
                  </div>
                  <ArrowRight size={18} className="text-slate-300 rotate-180" />
                </button>

                {SHOW_CASH_WALLET_OPTION && (
                  <button
                    type="button"
                    onClick={() => { setMethod('cashwallet'); setStep('transfer'); }}
                    className="w-full flex items-center gap-3 bg-white border p-4 rounded-xl text-right active:scale-[0.98] transition-all cursor-pointer"
                    style={{ borderColor: BRAND.border }}
                  >
                    <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center text-xl shrink-0">📲</div>
                    <div className="flex-1">
                      <div className="font-black text-sm" style={{ color: BRAND.navy }}>محافظ الهاتف المحمول</div>
                      <div className="text-[10px] font-bold mt-0.5" style={{ color: BRAND.slate }}>فودافون / أورنج / اتصالات / كاش</div>
                    </div>
                    <ArrowRight size={18} className="text-slate-300 rotate-180" />
                  </button>
                )}
              </div>
            </>
          )}

          {/* ═══════════════════════════════════
              الخطوة 3: التحويل الفعلي
              ═══════════════════════════════════ */}
          {step === 'transfer' && (
            <>
              <div className="flex items-center justify-between mb-4">
                <button
                  type="button"
                  onClick={() => setStep('method')}
                  disabled={loading}
                  className="text-slate-400 hover:text-slate-600 border-0 bg-transparent cursor-pointer p-1 disabled:opacity-40"
                >
                  <ArrowRight size={22} />
                </button>
                <h2 className="font-black text-base" style={{ color: BRAND.navy }}>
                  {method === 'instapay' ? 'الدفع عبر إنستاباي' : 'الدفع عبر كاش'}
                </h2>
                <div className="w-8" />
              </div>

              {/* إيصال التحويل (Ticket Style) */}
              <div
                className="relative overflow-hidden rounded-2xl p-5 mb-5 text-center text-white"
                style={{ background: `linear-gradient(135deg, ${BRAND.navy} 0%, #1a2744 100%)` }}
              >
                <div className="text-[10px] font-black opacity-70 uppercase tracking-wider mb-1">المبلغ المطلوب تحويله الآن</div>
                <div className="flex justify-center items-baseline gap-1 mb-4">
                  <span className="text-4xl font-black font-mono">{amount}</span>
                  <span className="text-sm font-bold opacity-80">ج.م</span>
                </div>
                
                {/* فاصل منقط */}
                <div className="border-t border-dashed border-white/20 mb-4 w-full" />

                <div className="flex justify-between items-center text-xs font-black">
                  <span className="opacity-80">كود المرجع:</span>
                  <span className="font-mono text-emerald-400 tracking-wider">{transactionId}</span>
                </div>
              </div>

              <div className="mb-6">
                {method === 'instapay' ? (
                  <>
                    <a
                      href={INSTAPAY_LINK}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-purple-600 text-white font-black py-3.5 rounded-xl flex items-center justify-center gap-2 mb-3 text-sm shadow-md active:scale-95 transition-all no-underline"
                    >
                      <ExternalLink size={18} /> فتح تطبيق إنستاباي
                    </a>
                    <div className="flex items-center justify-between bg-purple-50 p-2.5 rounded-xl border border-purple-100">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(`${INSTAPAY_USERNAME}@instapay`, 'عنوان التحويل')}
                        className="bg-white text-purple-700 font-black text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-sm active:scale-90 transition-all border border-purple-100 cursor-pointer"
                      >
                        <Copy size={14} /> نسخ
                      </button>
                      <span className="font-mono font-bold text-sm text-slate-800" dir="ltr">{INSTAPAY_USERNAME}@instapay</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center bg-amber-50 p-4 rounded-xl border border-amber-100">
                    <div className="text-[10px] text-slate-500 mb-1 font-bold">رقم المحفظة لتحويل الكاش:</div>
                    <div className="text-2xl font-black font-mono text-slate-900 mb-3 tracking-wider" dir="ltr">{WALLET_NUMBER}</div>
                    <div className="flex gap-2 justify-center">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(WALLET_NUMBER, 'رقم المحفظة')}
                        className="bg-white text-amber-700 font-black text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-sm active:scale-90 transition-all border border-amber-200 cursor-pointer"
                      >
                        <Copy size={14} /> نسخ
                      </button>
                      <a
                        href={`tel:${WALLET_NUMBER}`}
                        className="bg-amber-600 text-white font-black text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-sm active:scale-90 transition-all no-underline"
                      >
                        <Phone size={14} /> اتصال
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* تحذير وتأكيد */}
              <div className="flex items-start gap-2 bg-blue-50 p-3 rounded-xl mb-4 text-[10px] font-bold text-blue-800">
                <ShieldCheck size={16} className="shrink-0 text-blue-600 mt-0.5" />
                <p>يرجى التأكد من تحويل المبلغ أولاً قبل الضغط على زر التأكيد بالأسفل لضمان إضافة الرصيد.</p>
              </div>

              <button
                type="button"
                onClick={handleSubmitTopUp}
                disabled={loading}
                className="w-full text-white border-0 font-black py-4 rounded-2xl text-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                style={{
                  background: `linear-gradient(135deg, ${BRAND.green} 0%, ${BRAND.greenDark} 100%)`,
                  boxShadow: `0 8px 24px ${BRAND.greenLight}`,
                }}
              >
                {loading ? (
                  <span>جاري تأكيد الدفع...</span>
                ) : (
                  <>
                    <Send size={18} />
                    <span>تم التحويل بنجاح، أرسل الطلب</span>
                  </>
                )}
              </button>
            </>
          )}

          {/* ═══════════════════════════════════
              الخطوة 4: النجاح
              ═══════════════════════════════════ */}
          {step === 'done' && (
            <div className="text-center pt-6 pb-2">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: `linear-gradient(135deg, ${BRAND.green} 0%, ${BRAND.greenDark} 100%)`, boxShadow: `0 8px 24px ${BRAND.greenLight}` }}
              >
                <CheckCircle size={40} className="text-white" strokeWidth={3} />
              </div>
              <h3 className="text-xl font-black mb-1" style={{ color: BRAND.navy }}>تم إرسال الطلب بنجاح</h3>
              <p className="text-xs text-slate-500 mb-6 font-bold">جاري مراجعة التحويل وإضافة الرصيد لمحفظتك ⏳</p>

              <div className="border rounded-2xl p-4 mb-6 text-right space-y-3" style={{ background: BRAND.bg, borderColor: BRAND.border }}>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 font-bold">المبلغ المحول:</span>
                  <span className="font-mono font-black text-slate-900">{amount} ج.م</span>
                </div>
                {currentBonus > 0 && (
                  <div className="flex justify-between items-center text-sm font-bold" style={{ color: BRAND.greenDark }}>
                    <span>هدية الشحن:</span>
                    <span className="font-mono font-black">+{currentBonus} ج.م</span>
                  </div>
                )}
                <div className="border-t border-slate-200 pt-3 flex justify-between items-center text-base font-black">
                  <span className="text-slate-800">إجمالي الرصيد القادم:</span>
                  <span className="font-mono" style={{ color: BRAND.blue }}>{totalReceived} ج.م</span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full text-white border-0 font-black py-4 rounded-2xl text-sm active:scale-[0.98] transition-all cursor-pointer"
                style={{
                  background: `linear-gradient(135deg, ${BRAND.blue} 0%, ${BRAND.blueDark} 100%)`,
                  boxShadow: `0 8px 24px ${BRAND.blueSoft}`,
                }}
              >
                العودة للصفحة الرئيسية
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}