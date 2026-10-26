import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Send,
  MessageCircle,
  AlertTriangle,
  HelpCircle,
  Lightbulb,
  Wrench,
  CheckCircle,
  Clock,
  X,
} from 'lucide-react';
import { useStore, getServerNow, normalizePhone } from '../store';
import toast from 'react-hot-toast';

/* ─── 🎨 الألوان الرسمية للتطبيق ─── */
const BRAND = {
  blue: '#1656b8',
  blueDark: '#0f3d85',
  green: '#8cc63f',
  greenDark: '#6ea62a',
  navy: '#0a1628',
  navyLight: '#111e36',
  slate: '#64748b',
  slateMuted: '#94a3b8',
  border: 'rgba(255, 255, 255, 0.08)',
};

const MESSAGE_TYPES = [
  { id: 'complaint', label: 'شكوى', icon: AlertTriangle },
  { id: 'inquiry', label: 'استفسار', icon: HelpCircle },
  { id: 'suggestion', label: 'اقتراح', icon: Lightbulb },
  { id: 'technical', label: 'مشكلة تقنية', icon: Wrench },
];

export default function ChatScreen() {
  const { currentUser, messages, addMessage, setScreen } = useStore();

  const [showNewMessage, setShowNewMessage] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);

  const userPhoneClean = currentUser?.phone ? normalizePhone(currentUser.phone) : '';

  // جلب رسائل المستخدم فقط
  const myMessages = (messages ?? [])
    .filter((m) => {
      const msgPhone = m.userPhone ? normalizePhone(m.userPhone) : '';
      return userPhoneClean && msgPhone === userPhoneClean;
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  const handleSend = async () => {
    if (!currentUser) return toast.error('سجل دخول أولاً');
    if (!selectedType) return toast.error('اختر نوع الرسالة');
    if (!messageText.trim()) return toast.error('اكتب رسالتك');

    setSending(true);
    try {
      const result = await addMessage({
        userPhone: currentUser.phone,
        userName: currentUser.name,
        carPlate: currentUser.carPlate,
        type: selectedType as any,
        message: messageText.trim(),
      });

      if (result && !result.success) {
        toast.error(result.error || 'فشل الإرسال');
        return;
      }

      toast.success('تم الإرسال بنجاح ✅');
      setShowNewMessage(false);
      setSelectedType(null);
      setMessageText('');
    } catch (err) {
      toast.error('حدث خطأ أثناء الإرسال');
    } finally {
      setSending(false);
    }
  };

  const getTypeLabel = (typeId: string) => {
    return MESSAGE_TYPES.find((t) => t.id === typeId)?.label || 'رسالة';
  };

  const formatTime = (timestamp: number) => {
    const diffMins = Math.floor((getServerNow() - timestamp) / 60000);
    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    if (diffMins < 1440) return `منذ ${Math.floor(diffMins / 60)} ساعة`;
    return new Date(timestamp).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full flex flex-col safe-top safe-bottom text-right bg-slate-950"
      style={{ background: BRAND.navy, direction: 'rtl' }}
    >
      {/* ══ الهيدر ══ */}
      <div className="flex items-center justify-between px-5 pt-10 pb-4 shrink-0 border-b border-white/5">
        <button
          onClick={() => setScreen('list')}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 active:scale-90 transition-all text-slate-300 border-0 cursor-pointer"
        >
          <ArrowRight size={20} />
        </button>
        <h2 className="text-sm font-black text-white flex items-center gap-2">
          <MessageCircle size={18} style={{ color: BRAND.blue }} />
          الدعم والمساعدة
        </h2>
        <div className="w-10" />
      </div>

      {/* ══ المحتوى ══ */}
      <div className="flex-1 px-4 py-4 overflow-y-auto space-y-4">
        
        {/* زر إنشاء رسالة (يختفي عند فتح الفورم) */}
        {!showNewMessage && (
          <motion.button
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setShowNewMessage(true)}
            className="w-full py-4 rounded-2xl font-black text-sm text-white flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all border-0 shadow-lg"
            style={{ background: BRAND.blue }}
          >
            <Send size={16} />
            تواصل مع الإدارة
          </motion.button>
        )}

        {/* نموذج الإرسال المبسط */}
        <AnimatePresence>
          {showNewMessage && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="p-4 rounded-2xl border space-y-4 shadow-xl" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-black text-white">رسالة جديدة</span>
                  <button onClick={() => setShowNewMessage(false)} className="text-slate-400 bg-transparent border-0 cursor-pointer p-1">
                    <X size={18} />
                  </button>
                </div>

                {/* أزرار الاختيار الأنيقة */}
                <div className="grid grid-cols-2 gap-2">
                  {MESSAGE_TYPES.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setSelectedType(id)}
                      className="py-2.5 px-2 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold transition-all cursor-pointer"
                      style={{
                        background: selectedType === id ? BRAND.blue : 'transparent',
                        borderColor: selectedType === id ? BRAND.blue : BRAND.border,
                        color: selectedType === id ? '#fff' : BRAND.slateMuted,
                      }}
                    >
                      <Icon size={14} />
                      {label}
                    </button>
                  ))}
                </div>

                {/* نص الرسالة */}
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="اكتب تفاصيل رسالتك هنا..."
                  rows={4}
                  className="w-full p-3 rounded-xl text-sm font-semibold text-white outline-none resize-none border"
                  style={{ background: BRAND.navy, borderColor: BRAND.border }}
                />

                {/* زر الإرسال */}
                <button
                  onClick={handleSend}
                  disabled={sending || !selectedType || !messageText.trim()}
                  className="w-full py-3.5 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 border-0 cursor-pointer active:scale-[0.98] disabled:opacity-50 transition-all"
                  style={{ background: BRAND.greenDark }}
                >
                  <Send size={16} />
                  {sending ? 'جاري الإرسال...' : 'إرسال'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══ سجل الرسائل ══ */}
        <div className="space-y-3 pb-6">
          <h3 className="text-xs font-bold px-1" style={{ color: BRAND.slateMuted }}>سجل المراسلات ({myMessages.length})</h3>
          
          {myMessages.length === 0 ? (
             <div className="text-center py-10 opacity-50">
               <MessageCircle size={32} className="mx-auto mb-2 text-slate-500" />
               <p className="text-xs font-bold text-slate-400">لا توجد رسائل سابقة</p>
             </div>
          ) : (
            myMessages.map((msg) => {
              const isReplied = msg.status === 'replied';
              const isExpanded = selectedMessage === msg.id;

              return (
                <div
                  key={msg.id}
                  onClick={() => setSelectedMessage(isExpanded ? null : msg.id)}
                  className="border rounded-2xl p-4 cursor-pointer transition-all active:scale-[0.99]"
                  style={{
                    background: isReplied ? 'rgba(140, 198, 63, 0.05)' : BRAND.navyLight,
                    borderColor: isReplied ? 'rgba(140, 198, 63, 0.2)' : BRAND.border,
                  }}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-black px-2 py-1 rounded border" style={{ background: BRAND.navy, borderColor: BRAND.border, color: BRAND.slateMuted }}>
                      {getTypeLabel(msg.type)}
                    </span>
                    <span className="text-[9px] font-mono" style={{ color: BRAND.slateMuted }}>
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>

                  <p className={`text-xs text-white font-medium leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>
                    {msg.message}
                  </p>

                  {/* حالة الرد */}
                  {isReplied ? (
                    <div className="mt-3 pt-3 border-t" style={{ borderColor: 'rgba(140, 198, 63, 0.15)' }}>
                      <div className="flex items-center gap-1.5 mb-1.5" style={{ color: BRAND.green }}>
                        <CheckCircle size={12} />
                        <span className="text-[10px] font-black">رد الإدارة:</span>
                      </div>
                      <p className="text-xs font-bold text-white leading-relaxed">{msg.reply}</p>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center gap-1" style={{ color: '#fbbf24' }}>
                      <Clock size={10} />
                      <span className="text-[9px] font-bold">قيد المراجعة...</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </motion.div>
  );
}