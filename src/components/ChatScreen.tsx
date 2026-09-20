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
  XCircle,
  X,
  Sparkles,
} from 'lucide-react';
// 🌟 استيراد التوقيت الموحد ودوال مطابقة الهواتف
import { useStore, getServerNow, normalizePhone } from '../store';
import toast from 'react-hot-toast';

/* ─── 🎨 الألوان الرسمية الفاخرة لتطبيق Park'n 24 ─── */
const BRAND = {
  blue: '#1656b8',       // الأزرق الرسمي
  blueDark: '#0f3d85',   // الكحلي الفخم
  blueLight: '#e8f0fe',  // الأزرق الفاتح جداً
  blueSoft: 'rgba(22, 86, 184, 0.12)', // كحلي زجاجي ناعم
  green: '#8cc63f',      // الأخضر الرسمي
  greenDark: '#6ea62a',  // أخضر داكن للخطوط
  greenLight: 'rgba(140, 198, 63, 0.12)', // خلفية خضراء ناعمة
  navy: '#0a1628',       // الكحلي الليلي الغامق للواجهة
  navyLight: '#111e36',  // كحلي أفتح للبطاقات والـ overlays
  slate: '#64748b',      // الرمادي الهادئ
  slateMuted: '#94a3b8', // الرمادي الباهت
  border: 'rgba(255, 255, 255, 0.08)', // حدود زجاجية رفيعة
};

const MESSAGE_TYPES = [
  {
    id: 'complaint' as const,
    label: 'شكوى',
    icon: AlertTriangle,
    emoji: '🚨',
    color: '#f87171',
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.25)',
    description: 'مشكلة مع جراج أو خدمة',
  },
  {
    id: 'inquiry' as const,
    label: 'استفسار',
    icon: HelpCircle,
    emoji: '❓',
    color: '#60a5fa',
    bg: BRAND.blueSoft,
    border: 'rgba(96, 165, 250, 0.25)',
    description: 'سؤال عام عن الخدمة',
  },
  {
    id: 'suggestion' as const,
    label: 'اقتراح',
    icon: Lightbulb,
    emoji: '💡',
    color: '#fbbf24',
    bg: 'rgba(251, 191, 36, 0.12)',
    border: 'rgba(251, 191, 36, 0.25)',
    description: 'فكرة لتطوير التطبيق',
  },
  {
    id: 'technical' as const,
    label: 'مشكلة تقنية',
    icon: Wrench,
    emoji: '🔧',
    color: '#c084fc',
    bg: 'rgba(192, 132, 252, 0.12)',
    border: 'rgba(192, 132, 252, 0.25)',
    description: 'خطأ أو عطل بالتطبيق',
  },
];

export default function ChatScreen() {
  const { currentUser, messages, addMessage, setScreen } = useStore();

  const [showNewMessage, setShowNewMessage] = useState(false);
  const [selectedType, setSelectedType] = useState<
    'complaint' | 'inquiry' | 'suggestion' | 'technical' | null
  >(null);
  const [subject, setSubject] = useState('');
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);

  const userPhoneClean = currentUser?.phone ? normalizePhone(currentUser.phone) : '';

  // ✅ جلب رسائل المستخدم بالهاتف الموحد بدقة
  const myMessages = (messages ?? [])
    .filter((m) => {
      const msgPhone = m.userPhone ? normalizePhone(m.userPhone) : '';
      return userPhoneClean && msgPhone === userPhoneClean;
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  const handleSend = async () => {
    if (!currentUser) {
      toast.error('سجل دخول أولاً');
      return;
    }
    if (!selectedType) {
      toast.error('اختر نوع الرسالة');
      return;
    }
    if (!messageText.trim()) {
      toast.error('اكتب رسالتك');
      return;
    }

    setSending(true);

    try {
      const result = await addMessage({
        userPhone: currentUser.phone,
        userName: currentUser.name,
        carPlate: currentUser.carPlate,
        type: selectedType,
        subject: subject.trim() || undefined,
        message: messageText.trim(),
      });

      if (result && !result.success) {
        toast.error(result.error || 'فشل الإرسال، حاول مرة أخرى');
        return;
      }

      toast.success('تم إرسال رسالتك بنجاح ✅');
      setShowNewMessage(false);
      setSelectedType(null);
      setSubject('');
      setMessageText('');
    } catch (err) {
      console.error('ChatScreen send error:', err);
      toast.error(
        err instanceof Error ? err.message : 'فشل الإرسال، حاول مرة أخرى'
      );
    } finally {
      setSending(false);
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'pending':
        return {
          label: 'بانتظار الرد',
          icon: Clock,
          color: '#fbbf24',
          bg: 'rgba(251, 191, 36, 0.12)',
        };
      case 'replied':
        return {
          label: 'تم الرد',
          icon: CheckCircle,
          color: BRAND.green,
          bg: BRAND.greenLight,
        };
      case 'closed':
        return {
          label: 'مغلقة',
          icon: XCircle,
          color: BRAND.slateMuted,
          bg: 'rgba(255, 255, 255, 0.05)',
        };
      default:
        return {
          label: 'غير محدد',
          icon: Clock,
          color: BRAND.slateMuted,
          bg: 'rgba(255, 255, 255, 0.05)',
        };
    }
  };

  const getTypeInfo = (type: string) => {
    return (
      MESSAGE_TYPES.find((t) => t.id === type) || {
        label: 'رسالة',
        emoji: '💬',
        color: BRAND.slateMuted,
        bg: 'rgba(255, 255, 255, 0.05)',
        border: BRAND.border,
      }
    );
  };

  // ✅ حساب فارق التوقيت النسبي بالاعتماد على توقيت السيرفر الموحد
  const formatTime = (timestamp: number) => {
    const nowMs = getServerNow();
    const diffMs = Math.max(0, nowMs - timestamp);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    if (diffDays < 7) return `منذ ${diffDays} يوم`;
    return new Date(timestamp).toLocaleDateString('ar-EG', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full flex flex-col safe-top safe-bottom text-right"
      style={{ background: BRAND.navy, color: '#ffffff', direction: 'rtl' }}
    >
      {/* ══ Header ══ */}
      <div className="flex items-center justify-between px-4 pt-12 pb-3 shrink-0">
        <button
          onClick={() => setScreen('list')}
          className="p-2.5 rounded-xl border cursor-pointer bg-white/5 active:scale-90 transition-all text-slate-300"
          style={{ borderColor: BRAND.border }}
        >
          <ArrowRight size={18} />
        </button>
        <h2 className="text-xs font-black flex items-center gap-1.5" style={{ color: '#ffffff' }}>
          <MessageCircle size={16} style={{ color: BRAND.blue }} />
          مركز الدعم والتواصل
        </h2>
        <div className="w-10" />
      </div>

      {/* ══ Content ══ */}
      <div className="flex-1 px-4 pb-4 overflow-y-auto space-y-3">
        {!showNewMessage && (
          <motion.button
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setShowNewMessage(true)}
            className="w-full border-0 text-white py-3.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all"
            style={{ background: BRAND.blue, boxShadow: `0 4px 14px ${BRAND.blue}25` }}
          >
            <Send size={15} />
            كتابة رسالة جديدة للإدارة
          </motion.button>
        )}

        {/* ✉️ نموذج إرسال رسالة جديدة */}
        <AnimatePresence>
          {showNewMessage && (
            <motion.div
              initial={{ opacity: 0, y: -15, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -15, scale: 0.98 }}
              className="border rounded-2xl p-4 space-y-3.5"
              style={{ background: BRAND.navyLight, borderColor: BRAND.border }}
            >
              <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: BRAND.border }}>
                <h3 className="text-xs font-black text-white flex items-center gap-1.5">
                  <Sparkles size={13} style={{ color: BRAND.green }} />
                  رسالة جديدة للإدارة
                </h3>
                <button
                  onClick={() => {
                    setShowNewMessage(false);
                    setSelectedType(null);
                    setSubject('');
                    setMessageText('');
                  }}
                  className="text-slate-400 hover:text-white border-0 bg-transparent cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* اختيار نوع الرسالة */}
              <div>
                <label className="text-[10px] font-bold block mb-2" style={{ color: BRAND.slateMuted }}>
                  اختر نوع الرسالة *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {MESSAGE_TYPES.map((type) => {
                    const isSelected = selectedType === type.id;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setSelectedType(type.id)}
                        className="p-2.5 rounded-xl border text-center transition-all cursor-pointer"
                        style={{
                          background: isSelected ? type.bg : 'rgba(255, 255, 255, 0.02)',
                          borderColor: isSelected ? type.color : BRAND.border,
                        }}
                      >
                        <div className="text-lg mb-0.5">{type.emoji}</div>
                        <div
                          className="text-[10px] font-black"
                          style={{ color: isSelected ? type.color : '#ffffff' }}
                        >
                          {type.label}
                        </div>
                        <div className="text-[8px] mt-0.5" style={{ color: BRAND.slateMuted }}>
                          {type.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* عنوان الرسالة */}
              <div>
                <label className="text-[10px] font-bold block mb-1" style={{ color: BRAND.slateMuted }}>
                  عنوان الموضوع (اختياري)
                </label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="مثال: استفسار عن رصيد المحفظة"
                  className="w-full border p-2.5 rounded-xl font-bold text-white outline-none text-xs"
                  style={{ background: BRAND.navy, borderColor: BRAND.border }}
                />
              </div>

              {/* نص الرسالة */}
              <div>
                <label className="text-[10px] font-bold block mb-1" style={{ color: BRAND.slateMuted }}>
                  تفاصيل الرسالة *
                </label>
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="اكتب رسالتك أو استفسارك بالتفصيل..."
                  rows={4}
                  className="w-full border p-2.5 rounded-xl font-bold text-white outline-none text-xs resize-none"
                  style={{ background: BRAND.navy, borderColor: BRAND.border }}
                />
              </div>

              {/* بيانات المرسل التلقائية */}
              <div className="rounded-xl p-2.5 space-y-1 border" style={{ background: BRAND.navy, borderColor: BRAND.border }}>
                <div className="flex items-center justify-between text-[9.5px]">
                  <span className="font-mono text-slate-400">{currentUser?.phone}</span>
                  <span style={{ color: BRAND.slateMuted }}>رقم الهاتف:</span>
                </div>
                <div className="flex items-center justify-between text-[9.5px]">
                  <span className="font-mono text-blue-400">🚗 {currentUser?.carPlate}</span>
                  <span style={{ color: BRAND.slateMuted }}>رقم اللوحة:</span>
                </div>
              </div>

              {/* زر الإرسال */}
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !selectedType || !messageText.trim()}
                className="w-full py-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 border-0 text-white cursor-pointer active:scale-[0.98] transition-all disabled:opacity-50"
                style={{ background: BRAND.greenDark }}
              >
                <Send size={14} />
                {sending ? 'جاري الإرسال...' : 'إرسال الرسالة للإدارة'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 📬 سجل الرسائل والردود */}
        <div>
          <div className="flex items-center justify-between mb-2.5 px-1">
            <span className="text-[9px] px-2 py-0.5 rounded border" style={{ background: BRAND.navyLight, borderColor: BRAND.border, color: BRAND.slateMuted }}>
              {myMessages.length} رسالة
            </span>
            <h3 className="text-xs font-black flex items-center gap-1" style={{ color: BRAND.slateMuted }}>
              سجل رسائلي
            </h3>
          </div>

          {myMessages.length === 0 ? (
            <div className="border rounded-2xl p-8 text-center" style={{ background: BRAND.navyLight, borderColor: BRAND.border }}>
              <div className="text-3xl mb-2">💬</div>
              <p className="text-white text-xs font-bold">لا توجد رسائل سابقة</p>
              <p className="text-[10px] mt-1" style={{ color: BRAND.slateMuted }}>
                أرسل رسالتك وسيتواصل معك فريق الدعم فوراً
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {myMessages.map((msg) => {
                const statusInfo = getStatusInfo(msg.status);
                const typeInfo = getTypeInfo(msg.type);
                const StatusIcon = statusInfo.icon;
                const isExpanded = selectedMessage === msg.id;

                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => setSelectedMessage(isExpanded ? null : msg.id)}
                    className="border rounded-2xl p-3.5 cursor-pointer transition-all active:scale-[0.99]"
                    style={{
                      background: msg.status === 'replied' ? 'rgba(140, 198, 63, 0.04)' : BRAND.navyLight,
                      borderColor: msg.status === 'replied' ? BRAND.green + '40' : BRAND.border,
                    }}
                  >
                    {/* شريط الحالة والنوع */}
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-[8.5px] px-2 py-0.5 rounded-full font-black flex items-center gap-1"
                          style={{ background: statusInfo.bg, color: statusInfo.color }}
                        >
                          <StatusIcon size={9} />
                          {statusInfo.label}
                        </span>
                        <span className="text-[9px]" style={{ color: BRAND.slateMuted }}>
                          {formatTime(msg.timestamp)}
                        </span>
                      </div>

                      <span
                        className="text-[8.5px] px-2 py-0.5 rounded-full font-bold"
                        style={{ background: typeInfo.bg, color: typeInfo.color }}
                      >
                        {typeInfo.emoji} {typeInfo.label}
                      </span>
                    </div>

                    {/* الموضوع */}
                    {msg.subject && (
                      <div className="text-xs font-black text-white mb-1">
                        {msg.subject}
                      </div>
                    )}

                    {/* نص الرسالة */}
                    <div
                      className={`leading-relaxed text-xs font-medium ${isExpanded ? '' : 'line-clamp-2'}`}
                      style={{ color: '#e2e8f0' }}
                    >
                      {msg.message}
                    </div>

                    {/* صندوق رد الإدارة */}
                    <AnimatePresence>
                      {isExpanded && msg.reply && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-3 border rounded-xl p-3"
                          style={{
                            background: BRAND.navy,
                            borderColor: BRAND.green + '50',
                          }}
                        >
                          <div className="flex items-center gap-1 mb-1" style={{ color: BRAND.green }}>
                            <CheckCircle size={12} />
                            <span className="text-[10px] font-black">رد إدارة Park'n 24:</span>
                          </div>
                          
                          <p className="leading-relaxed text-xs font-bold text-white">
                            {msg.reply}
                          </p>

                          {msg.repliedAt && (
                            <div className="text-[8.5px] text-left mt-1.5 font-mono" style={{ color: BRAND.slateMuted }}>
                              {formatTime(msg.repliedAt)}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* تنبيه بالرد الجديد إن وُجد */}
                    {msg.status === 'replied' && !isExpanded && (
                      <div 
                        className="mt-2.5 rounded-lg p-1.5 text-center border flex items-center justify-center gap-1"
                        style={{ background: BRAND.greenLight, borderColor: BRAND.green + '30', color: BRAND.green }}
                      >
                        <CheckCircle size={11} />
                        <span className="text-[9px] font-black">وصلك رد رسمي من الإدارة - اضغط للقراءة</span>
                      </div>
                    )}

                    {!isExpanded && !msg.reply && msg.message.length > 80 && (
                      <div className="text-[8.5px] text-center mt-2 font-bold" style={{ color: BRAND.blue }}>
                        عرض النص بالكامل ↓
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}