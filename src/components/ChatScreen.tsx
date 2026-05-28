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
} from 'lucide-react';
import { useStore } from '../store';
import toast from 'react-hot-toast';

const MESSAGE_TYPES = [
  {
    id: 'complaint' as const,
    label: 'شكوى',
    icon: AlertTriangle,
    emoji: '🚨',
    color: 'text-red-400',
    bg: 'bg-red-500/20',
    border: 'border-red-500/20',
    description: 'مشكلة مع جراج أو خدمة',
  },
  {
    id: 'inquiry' as const,
    label: 'استفسار',
    icon: HelpCircle,
    emoji: '❓',
    color: 'text-blue-400',
    bg: 'bg-blue-500/20',
    border: 'border-blue-500/20',
    description: 'سؤال عام عن الخدمة',
  },
  {
    id: 'suggestion' as const,
    label: 'اقتراح',
    icon: Lightbulb,
    emoji: '💡',
    color: 'text-amber-400',
    bg: 'bg-amber-500/20',
    border: 'border-amber-500/20',
    description: 'فكرة لتحسين التطبيق',
  },
  {
    id: 'technical' as const,
    label: 'مشكلة تقنية',
    icon: Wrench,
    emoji: '🔧',
    color: 'text-purple-400',
    bg: 'bg-purple-500/20',
    border: 'border-purple-500/20',
    description: 'خطأ أو عطل في التطبيق',
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

  // ✅ حماية من undefined
  const myMessages = (messages ?? [])
    .filter((m) => m.userPhone === currentUser?.phone)
    .sort((a, b) => b.timestamp - a.timestamp);

  // ─── إرسال رسالة ─────────────────────────────────────────────────────────
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

  // ─── حالة الرسالة ─────────────────────────────────────────────────────────
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'pending':
        return {
          label: 'بانتظار الرد',
          icon: Clock,
          color: 'text-amber-400',
          bg: 'bg-amber-500/20',
        };
      case 'replied':
        return {
          label: 'تم الرد',
          icon: CheckCircle,
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/20',
        };
      case 'closed':
        return {
          label: 'مغلقة',
          icon: XCircle,
          color: 'text-slate-400',
          bg: 'bg-slate-500/20',
        };
      default:
        return {
          label: 'غير محدد',
          icon: Clock,
          color: 'text-slate-400',
          bg: 'bg-slate-500/20',
        };
    }
  };

  // ─── نوع الرسالة ──────────────────────────────────────────────────────────
  const getTypeInfo = (type: string) => {
    return (
      MESSAGE_TYPES.find((t) => t.id === type) || {
        label: 'رسالة',
        emoji: '💬',
        color: 'text-slate-400',
        bg: 'bg-slate-500/20',
        border: 'border-slate-500/20',
      }
    );
  };

  // ─── تنسيق الوقت ──────────────────────────────────────────────────────────
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    if (diffDays < 7) return `منذ ${diffDays} يوم`;
    return date.toLocaleDateString('ar-EG', {
      month: 'short',
      day: 'numeric',
    });
  };

  // ─── العرض ───────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full bg-slate-950 text-white flex flex-col safe-top safe-bottom"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-12 pb-3 shrink-0">
        <button
          onClick={() => setScreen('list')}
          className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 active:scale-90 transition-all"
        >
          <ArrowRight size={18} />
        </button>
        <h2 className="text-sm font-black flex items-center gap-2">
          <MessageCircle size={16} className="text-blue-400" />
          تواصل معنا
        </h2>
        <div className="w-10" />
      </div>

      {/* المحتوى */}
      <div className="flex-1 px-4 pb-4 overflow-y-auto">
        {/* زر رسالة جديدة */}
        {!showNewMessage && (
          <motion.button
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setShowNewMessage(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-blue-900/30 mb-4"
          >
            <Send size={16} />
            رسالة جديدة
          </motion.button>
        )}

        {/* فورم رسالة جديدة */}
        <AnimatePresence>
          {showNewMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-4 space-y-4"
            >
              {/* عنوان الفورم */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => {
                    setShowNewMessage(false);
                    setSelectedType(null);
                    setSubject('');
                    setMessageText('');
                  }}
                  className="text-slate-500 hover:text-white text-lg transition-colors"
                >
                  ✕
                </button>
                <h3 className="text-sm font-black text-white">
                  رسالة جديدة ✉️
                </h3>
              </div>

              {/* اختيار النوع */}
              <div>
                <label className="text-[10px] text-slate-500 font-bold block text-right mb-2">
                  نوع الرسالة *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {MESSAGE_TYPES.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setSelectedType(type.id)}
                      className={`p-3 rounded-xl border text-center transition-all active:scale-95 ${
                        selectedType === type.id
                          ? `${type.bg} ${type.border} ring-1 ring-opacity-50`
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <div className="text-xl mb-1">{type.emoji}</div>
                      <div
                        className={`text-[10px] font-black ${
                          selectedType === type.id
                            ? type.color
                            : 'text-slate-500'
                        }`}
                      >
                        {type.label}
                      </div>
                      <div className="text-[8px] text-slate-600 mt-0.5">
                        {type.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* الموضوع */}
              <div>
                <label className="text-[10px] text-slate-500 font-bold block text-right mb-1">
                  الموضوع (اختياري)
                </label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="مثال: مشكلة في الحساب"
                  className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-right font-bold text-white outline-none text-sm placeholder:text-slate-600"
                />
              </div>

              {/* الرسالة */}
              <div>
                <label className="text-[10px] text-slate-500 font-bold block text-right mb-1">
                  رسالتك *
                </label>
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="اكتب رسالتك هنا بالتفصيل..."
                  rows={4}
                  className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-right font-bold text-white outline-none text-sm placeholder:text-slate-600 resize-none"
                />
              </div>

              {/* معلومات المرسل */}
              <div className="bg-slate-950 rounded-xl p-3 space-y-1 border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-mono">
                    {currentUser?.phone}
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold">
                    المرسل
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-blue-400 font-mono">
                    {currentUser?.carPlate}
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold">
                    السيارة
                  </span>
                </div>
              </div>

              {/* زر الإرسال */}
              <button
                onClick={handleSend}
                disabled={sending || !selectedType || !messageText.trim()}
                className={`w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all ${
                  sending || !selectedType || !messageText.trim()
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-900/30 active:scale-95'
                }`}
              >
                <Send size={16} />
                {sending ? 'جاري الإرسال...' : 'إرسال الرسالة'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* قائمة الرسائل */}
        <div>
          <h3 className="text-xs font-black text-slate-400 mb-3 flex items-center gap-2 justify-end">
            رسائلي ({myMessages.length})
            <MessageCircle size={12} />
          </h3>

          {myMessages.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
              <div className="text-3xl mb-3">💬</div>
              <p className="text-slate-500 text-sm font-bold">لا توجد رسائل</p>
              <p className="text-slate-600 text-xs mt-1">
                أرسل رسالتك الأولى وسنرد عليك قريباً
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {myMessages.map((msg) => {
                const statusInfo = getStatusInfo(msg.status);
                const typeInfo = getTypeInfo(msg.type);
                const StatusIcon = statusInfo.icon;
                const isExpanded = selectedMessage === msg.id;

                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() =>
                      setSelectedMessage(isExpanded ? null : msg.id)
                    }
                    className={`rounded-2xl p-4 border cursor-pointer transition-all active:scale-[0.98] ${
                      msg.status === 'replied'
                        ? 'bg-emerald-950/20 border-emerald-500/20'
                        : msg.status === 'closed'
                        ? 'bg-slate-900/50 border-slate-700'
                        : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    {/* الصف العلوي */}
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${statusInfo.bg} ${statusInfo.color}`}
                        >
                          <StatusIcon size={9} />
                          {statusInfo.label}
                        </span>
                        <span className="text-[9px] text-slate-600">
                          {formatTime(msg.timestamp)}
                        </span>
                      </div>
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${typeInfo.bg} ${typeInfo.color}`}
                      >
                        {typeInfo.emoji} {typeInfo.label}
                      </span>
                    </div>

                    {/* الموضوع */}
                    {msg.subject && (
                      <div className="text-xs font-black text-white mb-1 text-right">
                        {msg.subject}
                      </div>
                    )}

                    {/* الرسالة */}
                    <div
                      className={`text-[11px] text-slate-400 text-right leading-relaxed ${
                        isExpanded ? '' : 'line-clamp-2'
                      }`}
                    >
                      {msg.message}
                    </div>

                    {/* الرد */}
                    <AnimatePresence>
                      {isExpanded && msg.reply && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-3 bg-emerald-600/10 border border-emerald-500/20 rounded-xl p-3"
                        >
                          <div className="flex items-center gap-1.5 justify-end mb-2">
                            <span className="text-[9px] text-emerald-400 font-bold">
                              رد الإدارة
                            </span>
                            <CheckCircle size={10} className="text-emerald-400" />
                          </div>
                          <p className="text-[11px] text-emerald-300 text-right leading-relaxed">
                            {msg.reply}
                          </p>
                          {msg.repliedAt && (
                            <div className="text-[8px] text-emerald-600 text-left mt-2">
                              {formatTime(msg.repliedAt)}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* اضغط للتوسيع */}
                    {!isExpanded && (msg.reply || msg.message.length > 80) && (
                      <div className="text-[8px] text-blue-400 text-center mt-2 font-bold">
                        اضغط لعرض التفاصيل ↓
                      </div>
                    )}

                    {/* بادج الرد الجديد */}
                    {msg.status === 'replied' && !isExpanded && (
                      <div className="mt-2 bg-emerald-600/10 border border-emerald-500/20 rounded-lg p-1.5 text-center">
                        <span className="text-[9px] text-emerald-400 font-bold">
                          ✅ تم الرد - اضغط للعرض
                        </span>
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