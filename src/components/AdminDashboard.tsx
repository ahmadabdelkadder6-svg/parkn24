import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Clock, CheckCircle, XCircle, MapPin, Warehouse, Plus,
  MessageCircle, Send, Receipt, Search, HardHat, Percent, DollarSign,
  Minus, Edit3, Archive, Lock, ArrowUp, ArrowDown, Gift, Sparkles,
  Settings,
  CalendarDays, // ⚡ تم إضافتها هنا لحل الشاشة البيضاء نهائياً
} from 'lucide-react';
import { useStore } from '../store';
import { supabase } from '../lib/supabase';
import { calculateCost } from '../utils/pricing';
import toast from 'react-hot-toast';

// ═══════════ Helpers ═══════════
const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'string') {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : 0;
  }
  if (typeof value === 'number') {
    if (value < 1_000_000_000_000) return value * 1000;
    return value;
  }
  return 0;
};

const timestampToLocalDate = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getLocalToday = (): string => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

const getLocalYesterday = (): string => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getLocalDaysAgo = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatLocalDateArabic = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ar-EG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
};

interface SettlementRecord {
  id: string;
  garage_id: string;
  garage_name: string;
  settlement_date: string;
  amount: number;
  direction: 'admin_to_garage' | 'garage_to_admin';
  session_ids: string[];
  session_count: number;
  wallet_collected: number;
  commission_amount: number;
  notes?: string;
  created_at: string;
}

export default function AdminDashboard() {
  const {
    garages, sessions, walletTopUps, approveTopUp, rejectTopUp, addGarage,
    setCurrentGarageId, setView, logout, messages, replyMessage, closeMessage,
    confirmRevenue, unconfirmRevenue, removeSession, updateGarage, fetchAll,
  } = useStore();

  const [dateFrom, setDateFrom] = useState(() => getLocalToday());
  const [dateTo, setDateTo] = useState(() => getLocalToday());
  const [, setTick] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [expandedMessage, setExpandedMessage] = useState<string | null>(null);
  const [messagesTab, setMessagesTab] = useState<'pending' | 'all'>('pending');
  const [revenueFilter, setRevenueFilter] = useState<'all' | 'confirmed' | 'pending'>('pending');
  const [sessionSearch, setSessionSearch] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [processingTopUpId, setProcessingTopUpId] = useState<string | null>(null);

  const [editingCommissionGarageId, setEditingCommissionGarageId] = useState<string | null>(null);
  const [editCommissionRate, setEditCommissionRate] = useState(10);

  const [settlementRecords, setSettlementRecords] = useState<SettlementRecord[]>([]);
  const [confirmSettlementGarageId, setConfirmSettlementGarageId] = useState<string | null>(null);
  const [processingSettlement, setProcessingSettlement] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState('');
  const [visibleSettlements, setVisibleSettlements] = useState(4);
  const [activeAccordionGarageId, setActiveAccordionGarageId] = useState<string | null>(null);

  const [gName, setGName] = useState('');
  const [gUser, setGUser] = useState('');
  const [gPhone, setGPhone] = useState('');
  const [lat, setLat] = useState(30.04);
  const [lng, setLng] = useState(31.23);
  const [gValet1Name, setGValet1Name] = useState('');
  const [gValet1Pass, setGValet1Pass] = useState('');
  const [gValet2Name, setGValet2Name] = useState('');
  const [gValet2Pass, setGValet2Pass] = useState('');
  const [gValet3Name, setGValet3Name] = useState('');
  const [gValet3Pass, setGValet3Pass] = useState('');

  useEffect(() => { const i = setInterval(() => setTick(t => t + 1), 60000); return () => clearInterval(i); }, []);

  const fetchSettlements = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('settlements')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error) setSettlementRecords(data ?? []);
    } catch (e) {
      console.error('Failed to fetch settlements:', e);
    }
  }, []);

  useEffect(() => { fetchSettlements(); }, [fetchSettlements]);

  // 🎁 [منطق الهدية المعدل]: حساب الإيرادات الفعلية مع مراعاة خصم الساعة الترحيبية للركنات المستحقة
  const getRevenue = useCallback((s: any) => {
    if (s.totalPrice != null && Number(s.totalPrice) > 0) return Number(s.totalPrice);
    if (s.endTime && s.startTime) {
      const st = toMs(s.startTime);
      const en = toMs(s.endTime);
      const g = garages.find((ga: any) => ga.id === s.garageId);
      const rate = Number(s.agreedPrice ?? g?.basePrice ?? 0);
      const elapsedSeconds = Math.max(0, Math.floor((en - st) / 1000));

      if (s.isFirstFreeSession === true) {
        const freeSeconds = Math.min(elapsedSeconds, 3600); // خصم ساعة واحدة (3600 ثانية) كحد أقصى
        const billableSeconds = Math.max(0, elapsedSeconds - freeSeconds);
        return calculateCost(billableSeconds, rate);
      }
      return calculateCost(elapsedSeconds, rate);
    }
    return 0;
  }, [garages]);

  const getCommission = useCallback((s: any) => {
    if (s.source !== 'app') return 0;
    const rev = getRevenue(s);
    if (rev <= 0) return 0;
    const g = garages.find((ga: any) => ga.id === s.garageId);
    const rate = g?.commissionRate ?? 10;
    const commission = (rev * rate) / 100;
    return Math.round(commission * 100) / 100;
  }, [garages, getRevenue]);

  const completedSessions = useMemo(() => sessions.filter(s => s.status === 'completed'), [sessions]);

  const filteredSessions = useMemo(() => {
    return completedSessions.filter(s => {
      if (!s.endTime) return false;
      const d = timestampToLocalDate(toMs(s.endTime));
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }, [completedSessions, dateFrom, dateTo]);

  const totalsFromSessions = useMemo(() => {
    const confirmed = filteredSessions.filter(s => s.revenueConfirmed);
    const pending = filteredSessions.filter(s => !s.revenueConfirmed);
    const totalRevenueConfirmed = confirmed.reduce((sum, s) => sum + getRevenue(s), 0);
    const totalPendingRevenue = pending.reduce((sum, s) => sum + getRevenue(s), 0);
    const totalSessionsCount = filteredSessions.length;
    return {
      totalRevenueConfirmed,
      totalPendingRevenue,
      totalSessionsCount,
      pendingCount: pending.length
    };
  }, [filteredSessions, getRevenue]);

  const commissionStats = useMemo(() => {
    // ⚡ [فلترة التسوية الصارمة]: جلب فقط وفقط الجلسات القادمة من التطبيق (source === 'app')
    // وإلغاء الجلسات المضافة يدوياً تماماً من حسابات العمولات وصافي الربح والتسويات مع المالك
    const confirmed = filteredSessions.filter(
      s => s.revenueConfirmed && !(s as any).settled && s.source === 'app'
    );
    const totalCommission = confirmed.reduce((a, s) => a + getCommission(s), 0);
    const totalRevenue = confirmed.reduce((a, s) => a + getRevenue(s), 0);
    const totalNet = totalRevenue - totalCommission;

    const perGarage = garages.map(g => {
      const gs = confirmed.filter(s => s.garageId === g.id); // gs أصبحت تحتوي تلقائياً على جلسات التطبيق فقط
      const gCommission = gs.reduce((a, s) => a + getCommission(s), 0);
      const gRevenue = gs.reduce((a, s) => a + getRevenue(s), 0);
      const walletRevenue = gs.filter(s => s.paymentMethod === 'wallet').reduce((a, s) => a + getRevenue(s), 0);
      const sessionIds = gs.map(s => s.id);
      return {
        id: g.id,
        name: g.name,
        commissionRate: g.commissionRate ?? 10,
        totalRevenue: gRevenue,
        commission: gCommission,
        netRevenue: gRevenue - gCommission,
        walletRevenue,
        appCount: gs.length,
        totalCount: gs.length,
        sessionIds,
      };
    }).filter(g => g.totalCount > 0);

    const totalWalletCollected = confirmed.filter(s => s.paymentMethod === 'wallet').reduce((a, s) => a + getRevenue(s), 0);
    const totalSettlement = totalWalletCollected - totalCommission;

    return { totalCommission, totalRevenue, totalNet, perGarage, totalWalletCollected, totalSettlement };
  }, [filteredSessions, garages, getRevenue, getCommission]);
  const garageReport = useMemo(() => {
    return garages
      .map(g => {
        const gs = filteredSessions.filter(s => s.garageId === g.id);
        const confirmed = gs.filter(s => s.revenueConfirmed);
        const pending = gs.filter(s => !s.revenueConfirmed);

        const revenue = confirmed.reduce((sum, s) => sum + getRevenue(s), 0);
        const pendingRevenue = pending.reduce((sum, s) => sum + getRevenue(s), 0);

        const cash = confirmed.filter(s => s.paymentMethod === 'cash').reduce((sum, s) => sum + getRevenue(s), 0);
        const instapay = confirmed.filter(s => s.paymentMethod === 'instapay').reduce((sum, s) => sum + getRevenue(s), 0);
        const wallet = confirmed.filter(s => s.paymentMethod === 'wallet').reduce((sum, s) => sum + getRevenue(s), 0);
        const cashwallet = confirmed.filter(s => s.paymentMethod === 'cashwallet').reduce((sum, sumSession) => sum + getRevenue(sumSession), 0);

        return {
          name: g.name,
          garageId: g.id,
          commissionRate: g.commissionRate ?? 10,
          count: gs.length,
          revenue,
          pendingRevenue,
          cash,
          instapay,
          wallet,
          cashwallet,
        };
      })
      .filter(r => r.count > 0 || r.revenue > 0 || r.pendingRevenue > 0);
  }, [garages, filteredSessions, getRevenue]);

  const pendingTopUps = walletTopUps.filter(w => w.status === 'pending');

  const displayedRevenueSessions = useMemo(() => {
    const searchTerm = sessionSearch.trim().toUpperCase();
    
    // 🔍 [ذكاء صاروخي]: عند البحث برقم لوحة، نبحث في "كل الأرشيف" وليس فقط الفترة المحددة
    let f = searchTerm 
      ? completedSessions // البحث في كل السجل التاريخي عند وجود كلمة بحث
      : filteredSessions;  // فلترة عادية بالتاريخ عند عدم وجود بحث

    if (revenueFilter === 'confirmed') f = f.filter(s => s.revenueConfirmed);
    else if (revenueFilter === 'pending') f = f.filter(s => !s.revenueConfirmed);
    
    if (searchTerm) {
      f = f.filter(s => (s.carPlate ?? '').toUpperCase().includes(searchTerm));
    }
    
    // ⚡ ترتيب النتائج من الأحدث للأقدم مع عرض أكثر 50 نتيجة عند البحث لضمان تغطية كل العمليات
    const sorted = [...f].sort((a, b) => {
      const endA = a.endTime ? toMs(a.endTime) : 0;
      const endB = b.endTime ? toMs(b.endTime) : 0;
      return endB - endA;
    });
    
    return searchTerm ? sorted.slice(0, 50) : sorted.slice(0, 30);
  }, [completedSessions, filteredSessions, revenueFilter, sessionSearch]);

  const safeMessages = messages ?? [];
  const pendingMessages = safeMessages.filter(m => m.status === 'pending');
  const allMessages = [...safeMessages].sort((a, b) => b.timestamp - a.timestamp);
  const displayedMessages = messagesTab === 'pending' ? pendingMessages : allMessages;

  const getTypeEmoji = (t: string) => { switch (t) { case 'complaint': return '🚨'; case 'inquiry': return '❓'; case 'suggestion': return '💡'; case 'technical': return '🔧'; default: return '💬'; } };
  const getTypeLabel = (t: string) => { switch (t) { case 'complaint': return 'شكوى'; case 'inquiry': return 'استفسار'; case 'suggestion': return 'اقتراح'; case 'technical': return 'مشكلة تقنية'; default: return 'رسالة'; } };
  const formatMsgTime = (ts: number) => new Date(ts).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const setToday = () => { const t = getLocalToday(); setDateFrom(t); setDateTo(t); };

  const handleAddGarage = () => {
    if (!gName || !gUser || !gPhone) { toast.error('أكمل الحقول الأساسية'); return; }
    addGarage({
      name: gName, username: gUser, phone: gPhone,
      ownerPhone: gPhone,
      capacity: 50, basePrice: 15, location: 'موقع جديد', lat, lng,
      valetName1: gValet1Name, valetPassword1: gValet1Pass,
      valetName2: gValet2Name, valetPassword2: gValet2Pass,
      valetName3: gValet3Name, valetPassword3: gValet3Pass,
    } as any);
    setGName(''); setGUser(''); setGPhone('');
    setGValet1Name(''); setGValet1Pass('');
    setGValet2Name(''); setGValet2Pass('');
    setGValet3Name(''); setGValet3Pass('');
    toast.success('تم إضافة الجراج!');
  };

  const handleSaveCommission = (garageId: string) => {
    updateGarage(garageId, { commissionRate: editCommissionRate });
    setEditingCommissionGarageId(null);
    toast.success(`تم تحديث العمولة إلى ${editCommissionRate}% ✅`);
  };

  const handleAdminEnterGarage = (g: typeof garages[0]) => {
    localStorage.removeItem('garageRole');
    localStorage.removeItem('valetNumber');
    localStorage.removeItem('valetName');
    localStorage.removeItem('currentGarageId');
    localStorage.setItem('garagePrefillUsername', g.username);
    localStorage.setItem('garagePrefillPhone', g.phone);
    setCurrentGarageId(null);
    setView('garage');
  };

  const handleApproveTopUp = async (id: string, amount: number) => {
    if (processingTopUpId) return;
    setProcessingTopUpId(id);
    const loadingToast = toast.loading('جاري اعتماد الرصيد في المحفظة...');
    try {
      await approveTopUp(id);
      toast.dismiss(loadingToast);
      toast.success(`تم اعتماد شحن ${amount} ج.م بنجاح للحريف ✅`);
    } catch (error: any) {
      toast.dismiss(loadingToast);
      console.error("Top-up approval failed:", error);
      toast.error(error?.message || 'عذراً، فشل شحن الرصيد. تأكد من اتصالك بالشبكة.');
    } finally {
      setProcessingTopUpId(null);
    }
  };

  const handleRejectTopUp = async (id: string) => {
    if (processingTopUpId) return;
    setProcessingTopUpId(id);
    const loadingToast = toast.loading('جاري رفض الطلب...');
    try {
      await rejectTopUp(id);
      toast.dismiss(loadingToast);
      toast.error('تم رفض طلب الشحن ❌');
    } catch (error: any) {
      toast.dismiss(loadingToast);
      console.error("Top-up rejection failed:", error);
      toast.error(error?.message || 'فشل الرفض، يرجى المحاولة لاحقاً');
    } finally {
      setProcessingTopUpId(null);
    }
  };

  const handleConfirmSettlement = async (garageId: string) => {
    if (processingSettlement) return;
    const garageData = commissionStats.perGarage.find(g => g.id === garageId);
    if (!garageData) {
      toast.error('لا توجد بيانات للجراج');
      return;
    }

    setProcessingSettlement(true);
    const loadingToast = toast.loading('جاري إقفال الفترة وتسجيل التسوية...');

    try {
      const settlement = garageData.walletRevenue - garageData.commission;
      const adminOwesGarage = settlement > 0;
      const absSettlement = Math.abs(settlement);

      const settlementRecord = {
        garage_id: garageId,
        garage_name: garageData.name,
        settlement_date: getLocalToday(),
        amount: absSettlement,
        direction: adminOwesGarage ? 'admin_to_garage' : 'garage_to_admin',
        session_ids: garageData.sessionIds,
        session_count: garageData.totalCount,
        wallet_collected: garageData.walletRevenue,
        commission_amount: garageData.commission,
        notes: `تسوية ${garageData.totalCount} جلسة`,
        created_at: new Date().toISOString(),
      };

      const { error: insertError } = await supabase
        .from('settlements')
        .insert([settlementRecord]);

      if (insertError) throw insertError;

      if (garageData.sessionIds.length > 0) {
        const batchSize = 50;
        for (let i = 0; i < garageData.sessionIds.length; i += batchSize) {
          const batch = garageData.sessionIds.slice(i, i + batchSize);
          const { error: updateError } = await supabase
            .from('sessions')
            .update({ settled: true, settled_at: new Date().toISOString() })
            .in('id', batch);

          if (updateError) {
            console.error('Batch update error:', updateError);
            throw updateError;
          }
        }
      }

      toast.dismiss(loadingToast);
      toast.success(`✅ تم إقفال حساب ${garageData.name} بمبلغ ${absSettlement.toFixed(0)} ج.م`);
      setConfirmSettlementGarageId(null);

      await fetchSettlements();
      await fetchAll();

    } catch (error: any) {
      toast.dismiss(loadingToast);
      console.error('Cleanup failed:', error);
      toast.error(error?.message || 'فشل تنفيذ التسوية. تحقق من الاتصال بالشبكة.');
    } finally {
      setProcessingSettlement(false);
    }
  };

  const handleDatabaseCleanup = async () => {
    const confirmCleanup = window.confirm(
      "⚠️ هل أنت متأكد من تنظيف الأرشيف؟\n\nسيتم حذف الجلسات القديمة جداً (التي مر عليها أكثر من 30 يوماً) والمؤكدة والمسواة مالياً بالكامل لتسريع النظام وحماية مساحة قاعدة البيانات.\n\nهذا الإجراء آمن 100% ولا يغير أرقام إيرادات الجراجات التاريخية."
    );
    if (!confirmCleanup) return;

    const loadingToast = toast.loading('جاري تنظيف وتخفيف قاعدة البيانات...');
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const limitDateISO = thirtyDaysAgo.toISOString();

      const { error, count } = await supabase
        .from('sessions')
        .delete({ count: 'exact' })
        .eq('status', 'completed')
        .eq('revenue_confirmed', true)
        .eq('settled', true)
        .lt('created_at', limitDateISO);

      toast.dismiss(loadingToast);

      if (error) throw error;

      if (count && count > 0) {
        toast.success(`🧹 تم بنجاح حذف ${count} جلسة قديمة ومسواة وتخفيف النظام كلياً! ✅`);
        await fetchAll();
      } else {
        toast('قاعدة البيانات نظيفة ومثالية بالفعل، لا توجد جلسات قديمة لتنظيفها حالياً. ✨', { icon: '✨' });
      }
    } catch (e: any) {
      toast.dismiss(loadingToast);
      console.error('Cleanup failed:', e);
      toast.error('فشل التنظيف: ' + (e.message || 'خطأ في الاتصال بالشبكة'));
    }
  };

  return (
    <div className="h-full overflow-y-auto pt-16" style={{ background: '#EBF2FF', color: '#0A1628', padding: 16 }}>

      {/* ══════ Header ══════ */}
      <div className="flex justify-between items-center mb-6 pb-4" style={{ borderBottom: '2px solid #D0DCFF' }}>
        <button onClick={() => { localStorage.removeItem('adminSession'); logout(); }} className="font-black active:scale-95 transition-all"
          style={{ background: 'linear-gradient(135deg,#FF3333,#CC0000)', color: '#fff', padding: '10px 18px', borderRadius: 16, fontSize: 11, boxShadow: '0 4px 16px rgba(255,51,51,0.3)' }}>
          تسجيل خروج
        </button>
        <h2 className="font-black flex items-center gap-2" style={{ fontSize: 20, color: '#4D00FF' }}>
          لوحة المشرف العام <Shield size={22} />
        </h2>
        <div className="font-bold" style={{ background: '#fff', border: '2px solid #D0DCFF', padding: '8px 14px', borderRadius: 14, fontSize: 11, color: '#7B8CA6' }}>
          {sessions.length} عملية
        </div>
      </div>

      {/* ══════ Date Filter - تصميم مدمج نصف الحجم ══════ */}
      <div 
        className="mb-4" 
        style={{ 
          background: '#fff', 
          border: '1.5px solid #D0DCFF', 
          borderRadius: 18, 
          padding: '12px 14px', 
          boxShadow: '0 3px 12px rgba(0,102,255,0.04)' 
        }}
      >
        {/* السطر الأول: التاريخ من - إلى مدمج أفقياً */}
        <div className="flex items-center gap-1.5 mb-2">
          <input 
            type="date" 
            value={dateFrom} 
            onChange={e => setDateFrom(e.target.value)} 
            className="flex-1 font-black outline-none text-center font-mono" 
            style={{ 
              background: '#F0F4FF', 
              border: '1.5px solid #D0DCFF', 
              padding: '6px 4px', 
              borderRadius: 10, 
              fontSize: 11, 
              fontWeight: 950, 
              color: '#0066FF' 
            }} 
          />
          <span className="font-black text-slate-400" style={{ fontSize: 11, fontWeight: 950 }}>←</span>
          <input 
            type="date" 
            value={dateTo} 
            onChange={e => setDateTo(e.target.value)} 
            className="flex-1 font-black outline-none text-center font-mono" 
            style={{ 
              background: '#F0F4FF', 
              border: '1.5px solid #D0DCFF', 
              padding: '6px 4px', 
              borderRadius: 10, 
              fontSize: 11, 
              fontWeight: 950, 
              color: '#0066FF' 
            }} 
          />
          <CalendarDays size={16} style={{ color: '#0066FF' }} className="shrink-0" />
        </div>

        {/* السطر الثاني: أزرار الفلاتر السريعة المدمجة */}
        <div className="flex gap-1 mb-2">
          {[
            { label: '📅 اليوم', onClick: setToday, active: dateFrom === getLocalToday() && dateTo === getLocalToday() },
            { label: 'أمس', onClick: () => { setDateFrom(getLocalYesterday()); setDateTo(getLocalYesterday()); }, active: dateFrom === getLocalYesterday() && dateTo === getLocalYesterday() },
            { label: 'أسبوع', onClick: () => { setDateFrom(getLocalDaysAgo(7)); setDateTo(getLocalToday()); }, active: dateFrom === getLocalDaysAgo(7) },
            { label: 'الكل', onClick: () => { setDateFrom(''); setDateTo(''); }, active: !dateFrom && !dateTo },
          ].map(b => (
            <button 
              key={b.label} 
              onClick={b.onClick} 
              className="flex-1 active:scale-95 transition-all" 
              style={{ 
                background: b.active ? '#0066FF' : '#F8FAFF', 
                color: b.active ? '#ffffff' : '#475569', 
                padding: '6px 0', 
                borderRadius: 10, 
                fontSize: 10, 
                fontWeight: 950,
                border: b.active ? 'none' : '1.5px solid #D0DCFF',
                textShadow: b.active ? '0 1px 1px rgba(0,0,0,0.15)' : 'none',
                boxShadow: b.active ? '0 2px 8px rgba(0,102,255,0.2)' : 'none'
              }}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* زر تنظيف الأرشيف مدمج بالأسفل */}
        <div className="pt-2 border-t border-dashed border-slate-200">
          <button 
            onClick={handleDatabaseCleanup} 
            className="w-full font-black active:scale-95 transition-all flex items-center justify-center gap-1.5"
            style={{ 
              background: 'linear-gradient(135deg,#1E293B,#0F172A)', 
              color: '#ffffff', 
              padding: '7px 0', 
              borderRadius: 10, 
              fontSize: 10.5, 
              fontWeight: 950,
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)' 
            }}
          >
            🧹 تنظيف الأرشيف (+30 يوم)
          </button>
        </div>
      </div>

      {/* ══════ Revenue Stats - كروت مدمجة نصف الحجم ══════ */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {/* 🔵 الإيرادات المؤكدة */}
        <div 
          className="text-center transition-all" 
          style={{ 
            background: 'linear-gradient(135deg,#0066FF,#4D00FF)', 
            borderRadius: 16, 
            padding: '9px 10px', 
            color: '#ffffff', 
            boxShadow: '0 4px 14px rgba(0,102,255,0.22)' 
          }}
        >
          <div className="font-bold mb-0.5" style={{ fontSize: 9.5, fontWeight: 900, opacity: 0.95, color: '#ffffff' }}>الإيرادات المؤكدة</div>
          <div className="font-black font-mono leading-none my-1" style={{ fontSize: 20, fontWeight: 950, color: '#ffffff', textShadow: '0 1px 2px rgba(0,0,0,0.15)' }}>
            {totalsFromSessions.totalRevenueConfirmed.toFixed(0)} <span style={{ fontSize: 10, fontWeight: 800 }}>ج.م</span>
          </div>
        </div>

        {/* 🟢 إجمالي العمليات */}
        <div 
          className="text-center transition-all" 
          style={{ 
            background: 'linear-gradient(135deg,#00CC66,#00AA55)', 
            borderRadius: 16, 
            padding: '9px 10px', 
            color: '#ffffff', 
            boxShadow: '0 4px 14px rgba(0,204,102,0.22)' 
          }}
        >
          <div className="font-bold mb-0.5" style={{ fontSize: 9.5, fontWeight: 900, opacity: 0.95, color: '#ffffff' }}>إجمالي العمليات</div>
          <div className="font-black font-mono leading-none my-1" style={{ fontSize: 20, fontWeight: 950, color: '#ffffff', textShadow: '0 1px 2px rgba(0,0,0,0.15)' }}>
            {totalsFromSessions.totalSessionsCount} <span style={{ fontSize: 10, fontWeight: 800 }}>عملية</span>
          </div>
        </div>
      </div>

      {/* ══════ كارت العمولة الإجمالية والتسوية النشطة - نصف الحجم ══════ */}
      {commissionStats.totalCommission > 0 && (
        <>
          {/* 🌟 شريط موجز الإيرادات الثلاثي المطور - تصميم بريميوم مدمج ومغلظ */}
          <div 
            className="flex justify-between items-stretch mb-3 text-center" 
            style={{ 
              background: '#ffffff', 
              borderRadius: 18, 
              padding: '12px 10px', 
              border: '1.5px solid #FFD180',
              boxShadow: '0 4px 16px rgba(255,149,0,0.06)'
            }}
          >
            {/* الإيراد الكلي */}
            <div className="flex-1 flex flex-col justify-center items-center border-l border-slate-150">
              <span className="text-[10px] font-black text-slate-400 mb-1 block">💳 الإيراد الكلي</span>
              <span className="font-mono font-black text-slate-800 text-sm" style={{ fontSize: '15px', fontWeight: 950 }}>
                {commissionStats.totalRevenue.toFixed(0)} <span style={{ fontSize: '10px', fontWeight: 800 }}>ج</span>
              </span>
            </div>

            {/* عمولة التطبيق */}
            <div className="flex-1 flex flex-col justify-center items-center border-l border-slate-150">
              <span className="text-[10px] font-black text-amber-600 mb-1 flex items-center gap-0.5 justify-center">
                <Percent size={10} className="text-amber-500" /> عمولة التطبيق
              </span>
              <span className="font-mono font-black text-amber-600 text-sm" style={{ fontSize: '15px', fontWeight: 950 }}>
                {commissionStats.totalCommission.toFixed(0)} <span style={{ fontSize: '10px', fontWeight: 800 }}>ج</span>
              </span>
            </div>

            {/* صافي الربح */}
            <div className="flex-1 flex flex-col justify-center items-center">
              <span className="text-[10px] font-black text-emerald-600 mb-1 block">🟢 صافي الربح</span>
              <span className="font-mono font-black text-emerald-600 text-sm" style={{ fontSize: '15px', fontWeight: 950 }}>
                {commissionStats.totalNet.toFixed(0)} <span style={{ fontSize: '10px', fontWeight: 800 }}>ج</span>
              </span>
            </div>
          </div>
          {(() => {
            const settlement = commissionStats.totalSettlement;
            const adminOwesGarages = settlement > 0;
            const absVal = Math.abs(settlement).toFixed(0);

            return (
              <div 
                className="mb-3 transition-all"
                style={{ 
                  background: adminOwesGarages ? 'linear-gradient(135deg,#EBFDF2,#D8F5E0)' : 'linear-gradient(135deg,#FFF3F3,#FFE8E8)', 
                  border: `2px solid ${adminOwesGarages ? '#00CC66' : '#FF3333'}`, 
                  borderRadius: 16, 
                  padding: '10px 12px',
                  boxShadow: `0 4px 14px ${adminOwesGarages ? 'rgba(0,204,102,0.12)' : 'rgba(255,51,51,0.12)'}`
                }}
              >
                {/* السطر الأول: المبلغ والحالة */}
                <div className="flex justify-between items-center mb-1.5">
                  <div className="font-black font-mono leading-none" style={{ fontSize: 20, fontWeight: 950, color: adminOwesGarages ? '#00AA44' : '#CC0000' }}>
                    {absVal} <span style={{ fontSize: 10, fontWeight: 800 }}>ج.م</span>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-xs block" style={{ fontWeight: 950, color: '#0A1628' }}>
                      {adminOwesGarages ? '🟢 مستحق للجراجات' : '🔴 مستحق للتطبيق'}
                    </span>
                    <span className="font-bold text-[9px] text-slate-500">
                      {adminOwesGarages ? 'تحويل من الأدمن' : 'تحصيل من الجراج'}
                    </span>
                  </div>
                </div>

                {/* السطر الثاني: المحصل بالمحفظة والعمولة مدمجين */}
                <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-200/60">
                  <div className="text-center bg-white rounded-lg p-1 border border-slate-200 flex items-center justify-center gap-1.5">
                    <span style={{ fontSize: 8.5, color: '#7B8CA6', fontWeight: 900 }}>💳 محفظة:</span>
                    <span className="font-black font-mono text-xs text-blue-600" style={{ fontWeight: 950 }}>{commissionStats.totalWalletCollected.toFixed(0)}ج</span>
                  </div>
                  <div className="text-center bg-white rounded-lg p-1 border border-amber-200 flex items-center justify-center gap-1.5">
                    <span style={{ fontSize: 8.5, color: '#FF9500', fontWeight: 900 }}>📊 عمولة:</span>
                    <span className="font-black font-mono text-xs text-amber-600" style={{ fontWeight: 950 }}>{commissionStats.totalCommission.toFixed(0)}ج</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* ══════ Pending Revenue Banner ══════ */}
      {(totalsFromSessions.totalPendingRevenue > 0 || totalsFromSessions.pendingCount > 0) && (
        <div className="mb-5 flex items-center justify-between" style={{ background: 'linear-gradient(135deg,#FF9500,#FF7700)', borderRadius: 22, padding: '16px 20px', color: '#fff', boxShadow: '0 6px 24px rgba(255,149,0,0.3)' }}>
          <div className="text-right">
            <h3 className="font-black" style={{ fontSize: 14 }}>⏳ إيرادات معلقة ({totalsFromSessions.pendingCount})</h3>
            <p style={{ fontSize: 10, opacity: 0.8 }}>تحتاج تأكيد</p>
          </div>
          <div className="font-black font-mono" style={{ fontSize: 24 }}>{totalsFromSessions.totalPendingRevenue.toFixed(0)} <span style={{ fontSize: 12 }}>ج.م</span></div>
        </div>
      )}

      {/* 📊 جدول التسويات النشطة (Accordion) */}
      <div className="mb-6 space-y-2">
        <div className="flex items-center justify-between mb-3">
          <span className="font-black" style={{ background: '#0066FF', color: '#fff', fontSize: 11, padding: '3.5px 12px', borderRadius: 20 }}>
            {commissionStats.perGarage.length} جراجات نشطة
          </span>
          <h3 className="font-black flex items-center gap-2" style={{ fontSize: 16, color: '#0A1628' }}>
            📊 التسويات النشطة للجراجات
          </h3>
        </div>

        {commissionStats.perGarage.length === 0 ? (
          <div className="text-center py-8" style={{ background: '#fff', borderRadius: 20, border: '2px dashed #D0DCFF' }}>
            <span style={{ fontSize: 36, display: 'block', marginBottom: 8 }}>⚖️</span>
            <p className="font-black text-xs" style={{ color: '#64748b' }}>جميع حسابات الجراجات متزنة ومقفلة بالكامل!</p>
          </div>
        ) : (
          commissionStats.perGarage.map(g => {
            const settlement = g.walletRevenue - g.commission;
            const adminOwesGarage = settlement > 0;
            const absSettlement = Math.abs(settlement).toFixed(0);
            const isExpanded = activeAccordionGarageId === g.id;
            const isConfirming = confirmSettlementGarageId === g.id;

            return (
              <div 
                key={g.id} 
                className="transition-all"
                style={{ 
                  background: '#fff', 
                  border: isExpanded 
                    ? `2.5px solid ${adminOwesGarage ? '#00CC66' : '#FF3333'}` 
                    : '1.5px solid #D0DCFF', 
                  borderRadius: 18, 
                  boxShadow: isExpanded ? '0 8px 24px rgba(0,0,0,0.06)' : 'none',
                  overflow: 'hidden'
                }}
              >
                <div 
                  onClick={() => {
                    setActiveAccordionGarageId(isExpanded ? null : g.id);
                    setConfirmSettlementGarageId(null);
                  }}
                  className="flex justify-between items-center p-4 cursor-pointer active:scale-[0.99] transition-all"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-black" style={{ fontSize: 11, color: adminOwesGarage ? '#00AA44' : '#CC0000' }}>
                      {adminOwesGarage ? 'أرسل للجراج' : 'اطلب من الجراج'}
                    </span>
                    <span className="font-black font-mono" style={{ fontSize: 16, color: adminOwesGarage ? '#00AA44' : '#CC0000' }}>
                      {absSettlement} ج.م
                    </span>
                    <span className="font-bold" style={{ fontSize: 11, color: '#94a3b8' }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>

                  <div className="text-right">
                    <div className="font-black" style={{ fontSize: 14, color: '#0A1628' }}>{g.name}</div>
                    <div className="font-bold" style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{g.totalCount} جلسة معلقة تسويتها</div>
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ borderTop: '1px solid #F0F4FF', background: '#FAFBFF', padding: '0 16px 16px 16px' }}
                    >
                      <div className="grid grid-cols-3 gap-2 my-3">
                        <div className="text-center" style={{ background: '#F8FAFF', borderRadius: 12, padding: '8px 4px', border: '1px solid #D0DCFF' }}>
                          <div style={{ fontSize: 8, color: '#7B8CA6', fontWeight: 900 }}>تحصيل محفظة</div>
                          <div className="font-black font-mono" style={{ fontSize: 13, color: '#0066FF', marginTop: 2 }}>{g.walletRevenue.toFixed(0)}</div>
                        </div>
                        <div className="text-center" style={{ background: '#FFF8F0', borderRadius: 12, padding: '8px 4px', border: '1px solid #FFD180' }}>
                          <div style={{ fontSize: 8, color: '#FF9500', fontWeight: 900 }}>عمولتنا {g.commissionRate}%</div>
                          <div className="font-black font-mono" style={{ fontSize: 13, color: '#FF9500', marginTop: 2 }}>{g.commission.toFixed(0)}</div>
                        </div>
                        <div className="text-center" style={{ background: adminOwesGarage ? '#EBFDF2' : '#FFF3F3', borderRadius: 12, padding: '8px 4px', border: `1px solid ${adminOwesGarage ? '#00CC66' : '#FF3333'}` }}>
                          <div style={{ fontSize: 8, color: adminOwesGarage ? '#00AA44' : '#CC0000', fontWeight: 900 }}>الفرق للتسوية</div>
                          <div className="font-black font-mono" style={{ fontSize: 15, color: adminOwesGarage ? '#00AA44' : '#CC0000', marginTop: 2 }}>{absSettlement}</div>
                        </div>
                      </div>

                      {isConfirming ? (
                        <div style={{ background: '#FFF8F0', border: '2px solid #FFD180', borderRadius: 16, padding: 12 }}>
                          <p className="font-black text-center mb-1.5" style={{ fontSize: 11, color: '#3D1F00' }}>
                            ⚠️ هل تم فعلياً {adminOwesGarage ? 'تحويل' : 'استلام'} <span style={{ fontSize: 14, color: adminOwesGarage ? '#00AA44' : '#CC0000' }}>{absSettlement} ج.م</span>؟
                          </p>
                          <p className="text-center mb-3" style={{ fontSize: 9, color: '#7B8CA6' }}>
                            عند التأكيد سيتم قفل {g.totalCount} جلسة نهائياً ولن تظهر في الحسابات مرة أخرى.
                          </p>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => {
                                handleConfirmSettlement(g.id);
                                setActiveAccordionGarageId(null);
                              }} 
                              disabled={processingSettlement}
                              className="flex-1 font-black active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1"
                              style={{ background: '#00CC66', color: '#fff', padding: 10, borderRadius: 12, fontSize: 12 }}
                            >
                              <Lock size={14} /> {processingSettlement ? 'جاري الإقفال...' : 'تأكيد وإقفال'}
                            </button>
                            <button 
                              onClick={() => setConfirmSettlementGarageId(null)} 
                              disabled={processingSettlement}
                              className="flex-1 font-black active:scale-95"
                              style={{ background: '#F0F4FF', color: '#475569', padding: 10, borderRadius: 12, fontSize: 12, border: '1px solid #D0DCFF' }}
                            >
                              إلغاء
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setConfirmSettlementGarageId(g.id)} 
                          className="w-full font-black active:scale-95 flex items-center justify-center gap-2"
                          style={{ 
                            background: `linear-gradient(135deg, ${adminOwesGarage ? '#00CC66,#00AA55' : '#FF3333,#CC0000'})`, 
                            color: '#fff', 
                            padding: 12, 
                            borderRadius: 14, 
                            fontSize: 12,
                            boxShadow: `0 4px 12px ${adminOwesGarage ? 'rgba(0,204,102,0.3)' : 'rgba(255,51,51,0.3)'}`
                          }}
                        >
                          <Lock size={14} /> تسجيل تسوية وإقفال ({absSettlement} ج.م)
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>

      {/* 📂 أرشيف التسويات المُقفلة */}
      <div className="mb-5">
        <button 
          onClick={() => { setShowArchive(!showArchive); setVisibleSettlements(4); setArchiveSearch(''); }} 
          className="w-full font-black flex items-center justify-between active:scale-95 transition-all"
          style={{ 
            background: '#fff', 
            border: '2.5px solid #0A1628', 
            borderRadius: 18, 
            padding: '14px 18px',
            color: '#000000' 
          }}
        >
          <span className="font-black" style={{ fontSize: 12, color: '#0066FF' }}>{showArchive ? '▲ إخفاء الأرشيف' : '▼ عرض الأرشيف'}</span>
          <div className="flex items-center gap-2">
            <span className="font-black" style={{ fontSize: 11, color: '#000000', opacity: 0.7 }}>({settlementRecords.length} تسوية)</span>
            <span className="font-black" style={{ fontSize: 14, color: '#000000' }}>📂 أرشيف التسويات</span>
            <Archive size={18} style={{ color: '#000000' }} />
          </div>
        </button>

        {showArchive && (
          <div className="mt-3 space-y-3" style={{ background: '#F0F4FF', border: '2px solid #D0DCFF', borderRadius: 20, padding: 12 }}>
            
            {settlementRecords.length > 4 && (
              <div className="relative">
                <input 
                  type="text" 
                  value={archiveSearch}
                  onChange={(e) => { setArchiveSearch(e.target.value); setVisibleSettlements(4); }}
                  placeholder="ابحث باسم الجراج في الأرشيف..." 
                  className="w-full font-bold text-right outline-none"
                  style={{
                    background: '#ffffff',
                    border: '1.5px solid #D0DCFF',
                    padding: '10px 14px 10px 34px',
                    borderRadius: 12,
                    fontSize: 12,
                    color: '#0A1628'
                  }}
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ fontSize: 12, color: '#94a3b8' }}>🔍</span>
              </div>
            )}

            {(() => {
              const filtered = settlementRecords.filter(r => 
                r.garage_name.toLowerCase().includes(archiveSearch.trim().toLowerCase())
              );

              if (filtered.length === 0) {
                return (
                  <div className="text-center py-6" style={{ background: '#fff', borderRadius: 16, border: '2px solid #D0DCFF' }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
                    <p className="font-black" style={{ fontSize: 12, color: '#94a3b8' }}>
                      {archiveSearch ? `لا توجد تسويات مطابقة لـ "${archiveSearch}"` : 'لم يتم تسجيل أي تسويات بعد'}
                    </p>
                  </div>
                );
              }

              const sliced = filtered.slice(0, visibleSettlements);

              return (
                <>
                  <div className="space-y-2">
                    {sliced.map(r => {
                      const isAdminToGarage = r.direction === 'admin_to_garage';
                      return (
                        <div key={r.id} style={{ 
                          background: '#fff', 
                          border: `2px solid ${isAdminToGarage ? '#66DDAA' : '#FFA0A0'}`, 
                          borderRadius: 16, 
                          padding: 12,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                        }}>
                          <div className="flex justify-between items-start mb-1.5">
                            <div className="flex items-center gap-1" style={{ padding: '3px 8px', borderRadius: 8, background: isAdminToGarage ? '#EBFDF2' : '#FFF3F3' }}>
                              {isAdminToGarage ? <ArrowUp size={10} style={{ color: '#00AA44' }} /> : <ArrowDown size={10} style={{ color: '#CC0000' }} />}
                              <span className="font-black" style={{ fontSize: 9, color: isAdminToGarage ? '#00AA44' : '#CC0000' }}>
                                {isAdminToGarage ? 'أرسل الأدمن' : 'استلم الأدمن'}
                              </span>
                            </div>
                            <div className="text-right">
                              <div className="font-black" style={{ fontSize: 13, color: '#000000' }}>{r.garage_name}</div>
                              <div className="font-black font-mono" style={{ fontSize: 9, color: '#94a3b8', marginTop: 1 }}>{r.settlement_date}</div>
                            </div>
                          </div>
                          <div className="flex justify-between items-center" style={{ borderTop: '1px dashed #F0F4FF', paddingTop: 6 }}>
                            <div className="font-black font-mono" style={{ fontSize: 18, color: isAdminToGarage ? '#00AA44' : '#CC0000' }}>
                              {r.amount.toFixed(0)} <span style={{ fontSize: 10 }}>ج.م</span>
                            </div>
                            <div className="text-right font-black" style={{ fontSize: 10, color: '#000000', lineHeight: 1.5 }}>
                              <div>{r.session_count} جلسة مقفلة 🔒</div>
                              <div style={{ fontSize: 9, opacity: 0.6 }}>محفظة: {r.wallet_collected.toFixed(0)}ج · عمولة: {r.commission_amount.toFixed(0)}ج</div>
                            </div>
                          </div>
                          {r.notes && (
                            <div className="mt-1.5 text-right font-black" style={{ background: '#F8FAFF', borderRadius: 8, padding: '6px 10px', fontSize: 10, color: '#000000', border: '1px solid #D0DCFF' }}>
                              📝 {r.notes}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {filtered.length > visibleSettlements && (
                    <button
                      onClick={() => setVisibleSettlements(prev => prev + 5)}
                      className="w-full font-black active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                      style={{ background: '#fff', border: '2px solid #D0DCFF', borderRadius: 14, color: '#0066FF', padding: '10px 0', fontSize: 12 }}
                    >
                      <span>🔄 عرض المزيد ({filtered.length - visibleSettlements} تسوية أخرى)</span>
                    </button>
                  )}

                  <div className="text-center">
                    <span className="font-bold" style={{ fontSize: 9, color: '#000000', opacity: 0.6 }}>
                      عرض {Math.min(visibleSettlements, filtered.length)} من {filtered.length} تسوية
                    </span>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* ══════ تقرير الإيرادات المباشر - بريميوم مدمج ══════ */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="font-black" style={{ fontSize: 10, background: '#0066FF', color: '#fff', padding: '3.5px 12px', borderRadius: 20 }}>
            {garageReport.length} جراج
          </span>
          <h3 className="font-black flex items-center gap-1.5 text-right" style={{ fontSize: 14, color: '#334155' }}>
            📊 تقرير الإيرادات
          </h3>
        </div>

        {garageReport.length === 0 ? (
          <div className="text-center py-8" style={{ background: '#fff', borderRadius: 18, border: '2px dashed #D0DCFF' }}>
            <span style={{ fontSize: 32, display: 'block', marginBottom: 6 }}>📭</span>
            <p className="font-black text-xs" style={{ color: '#94a3b8' }}>لا توجد جراجات نشطة في هذه الفترة</p>
          </div>
        ) : (
          <div className="space-y-2">
            {garageReport.map(r => (
              <div 
                key={r.garageId} 
                style={{ 
                  background: '#ffffff', 
                  border: '1.5px solid #D0DCFF', 
                  borderRadius: 16, 
                  padding: '10px 12px',
                  boxShadow: '0 2px 8px rgba(0,102,255,0.03)'
                }}
              >
                {/* السطر الأول: اسم الجراج + عدد الجلسات + المؤكد */}
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-black font-mono" style={{ fontSize: 16, fontWeight: 950, color: '#00AA44', textShadow: '0 0.5px 1px rgba(0,0,0,0.05)' }}>
                      {r.revenue.toFixed(0)} <span style={{ fontSize: 9, fontWeight: 800 }}>ج</span>
                    </span>
                    <span className="font-black text-[8px] text-white px-1.5 py-0.5 rounded-md" style={{ background: '#00CC66' }}>مؤكد</span>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-slate-900" style={{ fontSize: 13, fontWeight: 950 }}>{r.name}</span>
                    <span className="font-bold text-slate-400 block" style={{ fontSize: 9 }}>{r.count} جلسة</span>
                  </div>
                </div>

                {/* السطر الثاني: المعلومات المالية المدمجة (عمولة + معلق + نقدي + محفظة) */}
                <div className="flex items-center justify-between gap-1" style={{ background: '#F8FAFF', borderRadius: 10, padding: '5px 8px', border: '1px solid #E9EEFF' }}>
                  
                  {/* عمولة التطبيق */}
                  <div className="flex items-center gap-0.5">
                    <Percent size={9} className="text-amber-500" />
                    <span className="font-black font-mono text-amber-600" style={{ fontSize: 11, fontWeight: 950 }}>{r.commissionRate}%</span>
                  </div>

                  <div style={{ width: 1, height: 14, background: '#D0DCFF' }} />

                  {/* معلق */}
                  <div className="flex items-center gap-0.5">
                    <span className="font-black text-[8px] text-amber-600">⏳</span>
                    <span className="font-black font-mono text-amber-600" style={{ fontSize: 11, fontWeight: 950 }}>
                      {r.pendingRevenue > 0 ? `${r.pendingRevenue.toFixed(0)}ج` : '—'}
                    </span>
                  </div>

                  <div style={{ width: 1, height: 14, background: '#D0DCFF' }} />

                  {/* نقدي كاش */}
                  <div className="flex items-center gap-0.5">
                    <span className="text-[8px]">💵</span>
                    <span className="font-black font-mono text-emerald-600" style={{ fontSize: 11, fontWeight: 950 }}>
                      {r.cash.toFixed(0)}
                    </span>
                  </div>

                  <div style={{ width: 1, height: 14, background: '#D0DCFF' }} />

                  {/* محفظة */}
                  <div className="flex items-center gap-0.5">
                    <span className="text-[8px]">👝</span>
                    <span className="font-black font-mono text-blue-600" style={{ fontSize: 11, fontWeight: 950 }}>
                      {r.wallet.toFixed(0)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* ══════ Revenue Sessions ══════ */}
      <div className="mb-8">
        <h3 className="font-black mb-4 flex items-center gap-2 justify-end" style={{ fontSize: 16, color: '#334155' }}>إدارة الجلسات ({filteredSessions.length}) <Receipt size={18} /></h3>
        <div className="space-y-3 mb-4">
          <div className="flex gap-2">
            {[
              { id: 'pending' as const, label: `⏳ معلق (${filteredSessions.filter(s => !s.revenueConfirmed).length})`, bg: '#FF9500', shadow: 'rgba(255,149,0,0.3)' },
              { id: 'confirmed' as const, label: `✅ مؤكد (${filteredSessions.filter(s => s.revenueConfirmed).length})`, bg: '#00CC66', shadow: 'rgba(0,204,102,0.3)' },
              { id: 'all' as const, label: `الكل (${filteredSessions.length})`, bg: '#0066FF', shadow: 'rgba(0,102,255,0.3)' },
            ].map(b => (
              <button key={b.id} onClick={() => setRevenueFilter(b.id)} className="flex-1 font-black transition-all active:scale-95"
                style={{ padding: '12px 0', borderRadius: 16, fontSize: 12, background: revenueFilter === b.id ? b.bg : '#fff', color: revenueFilter === b.id ? '#fff' : '#7B8CA6', boxShadow: revenueFilter === b.id ? `0 4px 16px ${b.shadow}` : 'none', border: revenueFilter !== b.id ? '2px solid #D0DCFF' : 'none' }}>
                {b.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#94a3b8' }} />
            <input type="text" value={sessionSearch} onChange={e => setSessionSearch(e.target.value)} placeholder="ابحث برقم العربية..." className="w-full font-bold outline-none"
              style={{ background: '#fff', border: '2px solid #D0DCFF', padding: '14px 40px 14px 40px', borderRadius: 18, fontSize: 13, color: '#0A1628' }} />
            {sessionSearch && <button onClick={() => setSessionSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#94a3b8' }}><XCircle size={16} /></button>}
          </div>
        </div>

        <div className="space-y-3">
          {displayedRevenueSessions.length === 0 ? (
            <div className="text-center" style={{ background: '#fff', borderRadius: 24, padding: 32, border: '2px solid #D0DCFF' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              <p className="font-bold" style={{ fontSize: 14, color: '#94a3b8' }}>
                {sessionSearch ? `لا توجد نتائج لـ "${sessionSearch}"` : revenueFilter === 'pending' ? 'لا توجد معلقة' : 'لا توجد جلسات'}
              </p>
            </div>
          ) : (
            displayedRevenueSessions.map(session => {
              const g = garages.find((ga: any) => ga.id === session.garageId);
              const rev = getRevenue(session);
              const comm = getCommission(session);
              const net = rev - comm;
              const et = session.endTime ? typeof session.endTime === 'number' ? session.endTime : new Date(session.endTime).getTime() : null;
              const time = et ? new Date(et) : null;
              const isDel = deleteConfirmId === session.id;
              const isSettled = (session as any).settled === true;
              return (
                <div key={session.id} style={{ 
                  background: isDel ? '#FFF0F0' : isSettled ? '#F1F5F9' : session.revenueConfirmed ? '#F0FFF5' : '#FFFAF0', 
                  border: `2.5px solid ${isDel ? '#FF6666' : isSettled ? '#CBD5E1' : session.revenueConfirmed ? '#66DDAA' : '#FFD180'}`, 
                  borderRadius: 22, 
                  padding: 16,
                  opacity: isSettled ? 0.75 : 1 
                }}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-black" style={{ fontSize: 16, color: session.revenueConfirmed ? '#00AA44' : '#E65100' }}>{rev.toFixed(0)} ج.م</span>
                      {[
                        { show: true, bg: session.source === 'manual' ? '#FF9500' : '#0066FF', text: session.source === 'manual' ? 'يدوي' : 'تطبيق' },
                        { show: !!session.paymentMethod, bg: session.paymentMethod === 'cash' ? '#00CC66' : session.paymentMethod === 'instapay' ? '#7C3AED' : session.paymentMethod === 'wallet' ? '#0066FF' : '#FF8800', text: session.paymentMethod === 'cash' ? '💵 نقدي' : session.paymentMethod === 'instapay' ? '📱 إنستا' : session.paymentMethod === 'wallet' ? '👝 محفظة' : '📲 كاش' },
                        { show: true, bg: session.revenueConfirmed ? '#00CC66' : '#FF9500', text: session.revenueConfirmed ? '✅ مؤكد' : '⏳ معلق' },
                        { show: isSettled, bg: '#94a3b8', text: '🔒 تمت التسوية' },
                        { show: session.isFirstFreeSession === true, bg: '#E65100', text: '🎁 ساعة مجانية' } // 🎁 مضاف: بادج الساعة المجانية
                      ].filter(b => b.show).map((b, i) => (
                        <span key={i} className="font-bold" style={{ fontSize: 9, padding: '4px 10px', borderRadius: 12, background: b.bg, color: '#fff' }}>{b.text}</span>
                      ))}
                    </div>
                    <div className="text-right">
                      <div className="font-black" style={{ fontSize: 14, color: '#0A1628' }}>🚗 {session.carPlate}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{g?.name || '—'}</div>
                    </div>
                  </div>

                  {session.source === 'app' && comm > 0 && (
                    <div className="flex items-center gap-3 mb-2" style={{ background: '#FFF8F0', borderRadius: 12, padding: '6px 10px', border: '1px solid #FFD180' }}>
                      <div className="flex items-center gap-1">
                        <Percent size={10} style={{ color: '#FF9500' }} />
                        <span className="font-bold" style={{ fontSize: 9, color: '#FF9500' }}>عمولة {g?.commissionRate ?? 10}%: {comm.toFixed(0)} ج.م</span>
                      </div>
                      <div style={{ width: 1, height: 12, background: '#FFD180' }} />
                      <div className="flex items-center gap-1">
                        <DollarSign size={10} style={{ color: '#00AA44' }} />
                        <span className="font-bold" style={{ fontSize: 9, color: '#00AA44' }}>صافي: {net.toFixed(0)} ج.م</span>
                      </div>
                    </div>
                  )}

                  {time && <div className="font-mono text-left mb-2" style={{ fontSize: 10, color: '#94a3b8' }}>{time.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })} · {time.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}</div>}
                  {isDel ? (
                    <div className="space-y-2" style={{ background: '#FFE0E0', borderRadius: 16, padding: 14, border: '1px solid #FFA0A0' }}>
                      <p className="font-black text-center" style={{ fontSize: 13, color: '#CC0000' }}>⚠️ حذف نهائياً؟</p>
                      <p className="text-center" style={{ fontSize: 11, color: '#FF3333' }}>🚗 {session.carPlate} · {rev.toFixed(0)} ج.م</p>
                      <div className="flex gap-2">
                        <button onClick={async () => { await removeSession(session.id); setDeleteConfirmId(null); toast.success('تم الحذف 🗑️'); }} className="flex-1 font-black active:scale-95"
                          style={{ background: '#FF3333', color: '#fff', padding: 12, borderRadius: 14, fontSize: 12 }}>🗑️ تأكيد</button>
                        <button onClick={() => setDeleteConfirmId(null)} className="flex-1 font-black active:scale-95"
                          style={{ background: '#F0F4FF', color: '#475569', padding: 12, borderRadius: 14, fontSize: 12, border: '2px solid #D0DCFF' }}>إلغاء</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {session.revenueConfirmed ? (
                        <button onClick={async () => {
                          await unconfirmRevenue(session.id);
                          toast('إلغاء ↩️', { icon: '⏳' });
                        }} disabled={isSettled} className="flex-1 font-black active:scale-95 disabled:opacity-50"
                          style={{ background: '#FF9500', color: '#fff', padding: 10, borderRadius: 14, fontSize: 11 }}>
                          ↩️ إلغاء التأكيد
                        </button>
                      ) : (
                        <button onClick={async () => {
                          await confirmRevenue(session.id);
                          toast.success('تأكيد ✅');
                        }} className="flex-1 font-black active:scale-95"
                          style={{ background: '#00CC66', color: '#fff', padding: 10, borderRadius: 14, fontSize: 11 }}>
                          ✅ تأكيد الإيراد
                        </button>
                      )}
                      <button onClick={() => setDeleteConfirmId(session.id)} disabled={isSettled} className="font-black active:scale-95 disabled:opacity-50"
                        style={{ background: '#FFE0E0', color: '#CC0000', padding: '10px 16px', borderRadius: 14, fontSize: 11 }}>🗑️</button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ══════ Pending Top-ups ══════ */}
      <div className="mb-8">
        <h3 className="font-black mb-4 flex items-center gap-2 justify-end" style={{ fontSize: 16, color: '#FF8800' }}>اعتمادات معلقة ({pendingTopUps.length}) <Clock size={18} /></h3>
        <div className="space-y-3">
          {pendingTopUps.map(w => (
            <div key={w.id} style={{ background: '#fff', border: '2px solid #FFD180', borderRadius: 18, padding: '12px 14px', boxShadow: '0 3px 12px rgba(255,149,0,0.06)' }}>
              {/* السطر العلوي: طريقة الدفع + التاريخ + المبلغ */}
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-black" style={{ fontSize: 9, padding: '3px 10px', borderRadius: 10, background: w.method === 'instapay' ? '#7C3AED' : '#FF8800', color: '#fff' }}>
                    {w.method === 'instapay' ? '📱 إنستاباي' : '📲 كاش'}
                  </span>
                  <span className="font-bold font-mono" style={{ fontSize: 9, color: '#94a3b8' }}>
                    {new Date(w.timestamp).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="font-black font-mono" style={{ fontSize: 22, fontWeight: 950, color: '#0A1628' }}>
                  {w.amount} <span style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8' }}>ج.م</span>
                </div>
              </div>

              {/* بيانات العميل المدمجة في سطر واحد */}
              <div className="flex items-center justify-between gap-2 mb-2" style={{ background: '#F8FAFF', borderRadius: 12, padding: '6px 10px', border: '1px solid #E9EEFF' }}>
                <div className="flex items-center gap-2 flex-wrap">
                  {w.userName && <span className="font-black" style={{ fontSize: 11, color: '#0A1628' }}>👤 {w.userName}</span>}
                  {w.carPlate && <span className="font-black" style={{ fontSize: 11, color: '#E65100' }}>🚗 {w.carPlate}</span>}
                </div>
                {w.userPhone && <span className="font-black font-mono" style={{ fontSize: 11, color: '#0066FF' }}>{w.userPhone}</span>}
              </div>

              {/* أزرار الموافقة والرفض مدمجة */}
              <div className="flex gap-2">
                <button 
                  onClick={() => handleApproveTopUp(w.id, w.amount)} 
                  disabled={processingTopUpId === w.id}
                  className="flex-1 font-black flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ 
                    background: 'linear-gradient(135deg,#00CC66,#00AA55)', 
                    color: '#ffffff', 
                    padding: '10px 0', 
                    borderRadius: 14, 
                    fontSize: 12, 
                    fontWeight: 950,
                    boxShadow: '0 4px 14px rgba(0,204,102,0.25)',
                    textShadow: '0 1px 2px rgba(0,0,0,0.15)'
                  }}
                >
                  <CheckCircle size={16} />
                  {processingTopUpId === w.id ? 'جاري...' : 'اعتماد'}
                </button>
                <button 
                  onClick={() => handleRejectTopUp(w.id)} 
                  disabled={processingTopUpId === w.id}
                  className="font-black flex items-center justify-center active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ 
                    background: 'linear-gradient(135deg,#FF3333,#CC0000)', 
                    color: '#ffffff', 
                    padding: '10px 16px', 
                    borderRadius: 14,
                    boxShadow: '0 3px 12px rgba(255,51,51,0.2)'
                  }}
                >
                  <XCircle size={16} />
                </button>
              </div>
            </div>
          ))}
          {pendingTopUps.length === 0 && (
            <div className="text-center" style={{ background: '#fff', borderRadius: 24, padding: 28, border: '2px solid #D0DCFF', color: '#94a3b8', fontSize: 14 }}>لا توجد اعتمادات معلقة</div>
          )}
        </div>
      </div>

      {/* ══════ Messages ══════ */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <span className="font-black" style={{ background: '#FF3333', color: '#fff', padding: '5px 14px', borderRadius: 12, fontSize: 11, boxShadow: '0 2px 8px rgba(255,51,51,0.3)' }}>{pendingMessages.length} جديد</span>
          <h3 className="font-black flex items-center gap-2" style={{ fontSize: 16, color: '#0066FF' }}>الرسائل والشكاوى <MessageCircle size={18} /></h3>
        </div>
        <div className="flex gap-2 mb-4">
          {[
            { id: 'all' as const, label: `الكل (${allMessages.length})`, bg: '#0066FF', shadow: 'rgba(0,102,255,0.3)' },
            { id: 'pending' as const, label: `⏳ معلقة (${pendingMessages.length})`, bg: '#FF9500', shadow: 'rgba(255,149,0,0.3)' },
          ].map(b => (
            <button key={b.id} onClick={() => setMessagesTab(b.id)} className="flex-1 font-black transition-all active:scale-95"
              style={{ padding: '12px 0', borderRadius: 16, fontSize: 12, background: messagesTab === b.id ? b.bg : '#fff', color: messagesTab === b.id ? '#fff' : '#7B8CA6', boxShadow: messagesTab === b.id ? `0 4px 16px ${b.shadow}` : 'none', border: messagesTab !== b.id ? '2px solid #D0DCFF' : 'none' }}>
              {b.label}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {displayedMessages.length === 0 ? (
            <div className="text-center" style={{ background: '#fff', borderRadius: 24, padding: 28, border: '2px solid #D0DCFF', color: '#94a3b8', fontSize: 14 }}>لا توجد رسائل</div>
          ) : (
            displayedMessages.map(msg => {
              const isExp = expandedMessage === msg.id; const isRep = replyingTo === msg.id;
              return (
                <div key={msg.id} style={{ background: msg.status === 'pending' ? '#FFFAF0' : msg.status === 'replied' ? '#F0FFF5' : '#fff', border: `2.5px solid ${msg.status === 'pending' ? '#FFD180' : msg.status === 'replied' ? '#66DDAA' : '#D0DCFF'}`, borderRadius: 24, padding: 18 }}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold" style={{ fontSize: 10, padding: '4px 12px', borderRadius: 12, background: msg.status === 'pending' ? '#FF9500' : msg.status === 'replied' ? '#00CC66' : '#94a3b8', color: '#fff' }}>
                        {msg.status === 'pending' ? '⏳ معلقة' : msg.status === 'replied' ? '✅ تم الرد' : '🔒 مغلقة'}
                      </span>
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>{formatMsgTime(msg.timestamp)}</span>
                    </div>
                    <span className="font-bold" style={{ fontSize: 10, background: '#F0F4FF', padding: '4px 12px', borderRadius: 12, color: '#7B8CA6' }}>{getTypeEmoji(msg.type)} {getTypeLabel(msg.type)}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2" style={{ background: '#F0F4FF', borderRadius: 14, padding: '8px 12px', border: '1px solid #D0DCFF' }}>
                    <span className="font-mono" style={{ fontSize: 11, color: '#7B8CA6' }}>{msg.userPhone}</span>
                    <div className="flex items-center gap-2">
                      {msg.userName && <span className="font-bold" style={{ fontSize: 11, color: '#0A1628' }}>{msg.userName}</span>}
                      {msg.carPlate && <span className="font-mono" style={{ fontSize: 10, color: '#0066FF' }}>🚗 {msg.carPlate}</span>}
                    </div>
                  </div>
                  {msg.subject && <div className="font-black mb-1 text-right" style={{ fontSize: 13, color: '#0A1628' }}>{msg.subject}</div>}
                  <div className={`text-right leading-relaxed mb-2 cursor-pointer ${isExp ? '' : 'line-clamp-2'}`} style={{ fontSize: 12, color: '#475569' }} onClick={() => setExpandedMessage(isExp ? null : msg.id)}>{msg.message}</div>
                  {!isExp && msg.message.length > 80 && <button onClick={() => setExpandedMessage(msg.id)} className="font-bold mb-2" style={{ fontSize: 10, color: '#0066FF' }}>عرض الكامل ↓</button>}
                  {msg.reply && (
                    <div className="mb-3" style={{ background: '#E8FFF0', border: '1px solid #66DDAA', borderRadius: 16, padding: 14 }}>
                      <div className="font-bold text-right mb-1" style={{ fontSize: 10, color: '#00AA44' }}>ردك السابق:</div>
                      <div className="text-right leading-relaxed" style={{ fontSize: 12, color: '#047857' }}>{msg.reply}</div>
                      {msg.repliedAt && <div className="text-left mt-1" style={{ fontSize: 9, color: '#66DDAA' }}>{formatMsgTime(msg.repliedAt)}</div>}
                    </div>
                  )}
                  {msg.status !== 'closed' && (
                    isRep ? (
                      <div className="space-y-2">
                        <textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="اكتب ردك..." rows={3} className="w-full font-bold text-right outline-none resize-none"
                          style={{ background: '#F0F4FF', border: '2px solid #D0DCFF', padding: 14, borderRadius: 18, fontSize: 13, color: '#0A1628' }} />
                        <div className="flex gap-2">
                          <button onClick={async () => { if (!replyText.trim()) { toast.error('اكتب الرد'); return; } await replyMessage(msg.id, replyText.trim()); toast.success('تم ✅'); setReplyText(''); setReplyingTo(null); }} className="flex-1 font-black flex items-center justify-center gap-2 active:scale-95"
                            style={{ background: 'linear-gradient(135deg,#00CC66,#00AA55)', color: '#fff', padding: 14, borderRadius: 18, fontSize: 13 }}><Send size={16} />إرسال</button>
                          <button onClick={() => { setReplyingTo(null); setReplyText(''); }} className="font-black active:scale-95"
                            style={{ background: '#F0F4FF', color: '#475569', padding: '14px 20px', borderRadius: 18, fontSize: 13, border: '2px solid #D0DCFF' }}>إلغاء</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => { setReplyingTo(msg.id); setReplyText(''); setExpandedMessage(msg.id); }} className="flex-1 font-black flex items-center justify-center gap-2 active:scale-95"
                          style={{ background: '#0066FF', color: '#fff', padding: 14, borderRadius: 18, fontSize: 13, boxShadow: '0 6px 20px rgba(0,102,255,0.3)' }}><Send size={16} />{msg.reply ? 'تعديل' : 'رد'}</button>
                        <button onClick={async () => { await closeMessage(msg.id); toast.success('تم الإغلاق'); }} className="font-black active:scale-95"
                          style={{ background: '#F0F4FF', color: '#475569', padding: '14px 20px', borderRadius: 18, fontSize: 13, border: '2px solid #D0DCFF' }}>إلغاء</button>
                      </div>
                    )
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ══════ Manage Garages ══════ */}
      <div className="mb-8">
        <h3 className="font-black mb-4 flex items-center gap-2 justify-end" style={{ fontSize: 16, color: '#0066FF' }}>إدارة الجراجات <Warehouse size={18} /></h3>
        <div className="space-y-2.5">
          {garages.map(g => {
            const isEditingComm = editingCommissionGarageId === g.id;
            const ownerPhone = (g as any).ownerPhone || g.phone;
            const sameOwnerCount = garages.filter((x: any) => ((x.ownerPhone || x.phone) === ownerPhone)).length;
            return (
              <div key={g.id} style={{ background: '#fff', border: '2px solid #D0DCFF', borderRadius: 18, padding: '12px 14px', boxShadow: '0 3px 12px rgba(0,102,255,0.04)' }}>
                
                {/* السطر الأول: اسم الجراج + عدد الأماكن الشاغرة + الشارات المدمجة */}
                <div className="flex justify-between items-center mb-2">
                  {/* الأماكن الشاغرة (بدلاً من كارت كبير عمودي) */}
                  <div className="flex items-center gap-1.5" style={{ background: 'linear-gradient(135deg,#0066FF,#4D00FF)', borderRadius: 12, padding: '5px 10px', color: '#fff', boxShadow: '0 3px 10px rgba(0,102,255,0.25)' }}>
                    <span className="font-black font-mono" style={{ fontSize: 15, fontWeight: 950, textShadow: '0 1px 2px rgba(0,0,0,0.15)' }}>{g.availableSpots}</span>
                    <span className="font-bold" style={{ fontSize: 9, opacity: 0.95 }}>شاغر</span>
                  </div>
                  
                  {/* اسم الجراج + شارة الجراجات المتعددة */}
                  <div className="text-right flex items-center gap-1.5 flex-wrap justify-end">
                    {sameOwnerCount > 1 && (
                      <span className="font-black" style={{ 
                        fontSize: 9, 
                        padding: '2.5px 7px', 
                        borderRadius: 8, 
                        background: 'linear-gradient(135deg,#7C3AED,#5B21B6)', 
                        color: '#fff',
                        fontWeight: 900
                      }}>
                        👑 {sameOwnerCount}
                      </span>
                    )}
                    <span className="font-black text-slate-900" style={{ fontSize: 15, fontWeight: 950 }}>{g.name}</span>
                  </div>
                </div>

                {/* السطر الثاني: الموقع + السياس المدمجين */}
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="flex flex-wrap gap-1 justify-start">
                    {[
                      { n: 1, name: (g as any).valetName1, pw: (g as any).valetPassword1, color: '#0066FF' },
                      { n: 2, name: (g as any).valetName2, pw: (g as any).valetPassword2, color: '#7C3AED' },
                      { n: 3, name: (g as any).valetName3, pw: (g as any).valetPassword3, color: '#FF8800' },
                    ].filter(v => v.pw).map(v => (
                      <span key={v.n} className="font-bold flex items-center gap-0.5" style={{ fontSize: 8, color: v.color, background: `${v.color}15`, padding: '1.5px 6px', borderRadius: 6, fontWeight: 900 }}>
                        <HardHat size={7} /> {v.name || `س${v.n}`}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 text-slate-500 text-right truncate" style={{ fontSize: 10, fontWeight: 700 }}>
                    <span className="truncate max-w-[150px]">{g.location}</span>
                    <MapPin size={10} className="shrink-0" />
                  </div>
                </div>

                {/* السطر الثالث: بوكس العمولة + حالة التفعيل (كل شيء أفقياً في سطر واحد) */}
                <div className="flex items-center justify-between gap-2 mb-2" style={{ background: '#FFF8F0', borderRadius: 12, padding: '6px 10px', border: '1.5px solid #FFD180' }}>
                  {/* التحكم في العمولة */}
                  <div className="flex items-center gap-1.5">
                    {!isEditingComm ? (
                      <button
                        onClick={() => { setEditingCommissionGarageId(g.id); setEditCommissionRate(g.commissionRate ?? 10); }}
                        className="font-black active:scale-95 flex items-center gap-0.5"
                        style={{ background: '#FF9500', color: '#fff', padding: '3px 8px', borderRadius: 8, fontSize: 9, fontWeight: 950, textShadow: '0 1px 1px rgba(0,0,0,0.1)' }}
                      >
                        <Edit3 size={9} /> تعديل
                      </button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleSaveCommission(g.id)} className="font-black active:scale-95"
                          style={{ background: '#00CC66', color: '#fff', padding: '3px 8px', borderRadius: 8, fontSize: 9, fontWeight: 950 }}>حفظ</button>
                        <button onClick={() => setEditingCommissionGarageId(null)} className="font-black active:scale-95"
                          style={{ background: '#F0F4FF', color: '#475569', padding: '3px 8px', borderRadius: 8, fontSize: 9, fontWeight: 900, border: '1px solid #D0DCFF' }}>✕</button>
                      </div>
                    )}
                    {isEditingComm && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditCommissionRate(r => Math.max(0, r - 1))} className="active:scale-90 flex items-center justify-center"
                          style={{ background: '#FF3333', color: '#fff', width: 22, height: 22, borderRadius: 7 }}>
                          <Minus size={11} />
                        </button>
                        <input type="number" value={editCommissionRate} onChange={e => setEditCommissionRate(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                          className="bg-transparent text-center outline-none font-mono font-black"
                          style={{ width: 34, fontSize: 13, fontWeight: 950, color: '#FF9500', background: '#fff', border: '1px solid #FFD180', borderRadius: 6, padding: '2px 0' }} />
                        <button onClick={() => setEditCommissionRate(r => Math.min(100, r + 1))} className="active:scale-90 flex items-center justify-center"
                          style={{ background: '#00CC66', color: '#fff', width: 22, height: 22, borderRadius: 7 }}>
                          <Plus size={11} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* عرض النسبة الحالية */}
                  <div className="flex items-center gap-1">
                    <Percent size={11} style={{ color: '#FF9500' }} />
                    <span className="font-black font-mono" style={{ fontSize: 14, fontWeight: 950, color: '#FF9500', textShadow: '0 1px 1px rgba(0,0,0,0.05)' }}>
                      {isEditingComm ? editCommissionRate : (g.commissionRate ?? 10)}%
                    </span>
                    <span className="font-black" style={{ fontSize: 9, color: '#94a3b8', fontWeight: 900 }}>عمولة</span>
                  </div>
                </div>

                {/* السطر الأخير: زر التفعيل + زر الدخول للإدارة (كلاهما في نفس السطر) */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const newStatus = g.isActive === false ? true : false;
                      updateGarage(g.id, { isActive: newStatus });
                      toast.success(newStatus ? `تم تفعيل ${g.name} للعملاء 🟢` : `تم تعطيل ${g.name} 🔴`);
                    }}
                    className="font-black active:scale-95 transition-all flex items-center justify-center gap-1"
                    style={{
                      background: g.isActive !== false ? '#00CC66' : '#FF3333',
                      color: '#ffffff',
                      padding: '9px 10px',
                      borderRadius: 12,
                      fontSize: 10,
                      fontWeight: 950,
                      boxShadow: g.isActive !== false ? '0 3px 10px rgba(0,204,102,0.25)' : '0 3px 10px rgba(255,51,51,0.25)',
                      textShadow: '0 1px 1px rgba(0,0,0,0.15)',
                      flexShrink: 0
                    }}
                  >
                    <span>{g.isActive !== false ? '🟢 مفعّل' : '🔴 معطّل'}</span>
                  </button>

                  <button
                    onClick={() => handleAdminEnterGarage(g)}
                    className="flex-1 font-black active:scale-95 transition-all flex items-center justify-center gap-1.5"
                    style={{ 
                      background: 'linear-gradient(135deg,#0066FF,#0044DD)', 
                      color: '#ffffff', 
                      padding: '9px 0', 
                      borderRadius: 12, 
                      fontSize: 12, 
                      fontWeight: 950,
                      boxShadow: '0 4px 14 rgba(0,102,255,0.28)',
                      textShadow: '0 1px 2px rgba(0,0,0,0.15)'
                    }}
                  >
                    <Settings size={14} />
                    دخول وإدارة
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════ Add Garage ══════ */}
      <div className="mb-20">
        <h3 className="font-black mb-4 flex items-center gap-2 justify-end" style={{ fontSize: 16, color: '#0066FF' }}>إضافة جراج جديد <Plus size={18} /></h3>
        <div className="space-y-4" style={{ background: '#fff', border: '2.5px solid #D0DCFF', borderRadius: 28, padding: 22, boxShadow: '0 4px 20px rgba(0,102,255,0.06)' }}>
          <input className="w-full font-bold text-right outline-none" style={{ background: '#F0F4FF', border: '2px solid #D0DCFF', padding: 16, borderRadius: 18, fontSize: 14, color: '#0A1628' }} placeholder="اسم الجراج" value={gName} onChange={e => setGName(e.target.value)} />
          <div className="flex gap-2">
            <input className="flex-1 font-bold text-right outline-none" style={{ background: '#F0F4FF', border: '2px solid #D0DCFF', padding: 14, borderRadius: 16, fontSize: 12, color: '#0A1628' }} placeholder="المستخدم" value={gUser} onChange={e => setGUser(e.target.value)} />
            <input className="flex-1 font-bold text-right outline-none" style={{ background: '#F0F4FF', border: '2px solid #D0DCFF', padding: 14, borderRadius: 16, fontSize: 12, color: '#0A1628' }} placeholder="الهاتف" value={gPhone} onChange={e => setGPhone(e.target.value)} />
          </div>

          <div style={{ background: '#F0F4FF', borderRadius: 22, padding: 16, border: '2px solid #D0DCFF' }}>
            <div className="font-bold mb-3 text-right flex items-center gap-2 justify-end" style={{ fontSize: 12, color: '#7B8CA6' }}>
              <HardHat size={14} /> السياس (اختياري)
            </div>
            {[
              { n: 1, name: gValet1Name, setName: setGValet1Name, pass: gValet1Pass, setPass: setGValet1Pass, color: '#0066FF' },
              { n: 2, name: gValet2Name, setName: setGValet2Name, pass: gValet2Pass, setPass: setGValet2Pass, color: '#7C3AED' },
              { n: 3, name: gValet3Name, setName: setGValet3Name, pass: gValet3Pass, setPass: setGValet3Pass, color: '#FF8800' },
            ].map((v, i) => (
              <div key={i} className={i < 2 ? 'mb-3 pb-3' : ''} style={i < 2 ? { borderBottom: '1px solid #D0DCFF' } : {}}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold" style={{ fontSize: 10, color: (v.name || v.pass) ? v.color : '#CBD5E1' }}>
                    {(v.name || v.pass) ? '✅ مفعّل' : '❌ غير مفعّل'}
                  </span>
                  <span className="font-black" style={{ fontSize: 11, color: '#0A1628' }}>🅿️ سايس {v.n}</span>
                </div>
                <div className="flex gap-2">
                  <input type="text" value={v.name} onChange={e => v.setName(e.target.value)} className="flex-1 font-bold text-right outline-none"
                    style={{ background: '#fff', border: `2px solid ${v.name ? v.color : '#D0DCFF'}`, padding: 10, borderRadius: 12, fontSize: 12, color: '#0A1628' }} placeholder="الاسم" />
                  <input type="text" value={v.pass} onChange={e => v.setPass(e.target.value)} className="flex-1 font-mono font-black text-center outline-none"
                    style={{ background: '#fff', border: `2px solid ${v.pass ? v.color : '#D0DCFF'}`, padding: 10, borderRadius: 12, fontSize: 13, color: '#0A1628', letterSpacing: 2 }} placeholder="الباسورد" />
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: '#F0F4FF', borderRadius: 22, padding: 16, border: '2px solid #D0DCFF' }}>
            <div className="font-bold mb-2" style={{ fontSize: 11, color: '#0066FF' }}>📍 تحديد الإحداثيات</div>
            <div className="grid grid-cols-2 gap-3 font-mono mb-3">
              {[{ label: 'خط العرض', value: lat, set: setLat }, { label: 'خط الطول', value: lng, set: setLng }].map(c => (
                <div key={c.label}>
                  <span style={{ fontSize: 9, color: '#94a3b8' }}>{c.label}</span>
                  <input type="number" value={c.value} onChange={e => c.set(parseFloat(e.target.value))} className="w-full outline-none"
                    style={{ background: '#fff', border: '2px solid #D0DCFF', padding: 10, borderRadius: 14, fontSize: 12, color: '#0A1628' }} step="0.000001" />
                </div>
              ))}
            </div>
          </div>

          <div className="text-center" style={{ background: '#F0F4FF', borderRadius: 22, padding: 18, border: '2px solid #D0DCFF' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📍</div>
            <div className="font-bold mb-2" style={{ fontSize: 12, color: '#7B8CA6' }}>الموقع المحدد</div>
            <div className="font-black font-mono" style={{ fontSize: 15, color: '#0066FF' }}>{lat.toFixed(4)}, {lng.toFixed(4)}</div>
            <button type="button" onClick={() => { if ('geolocation' in navigator) navigator.geolocation.getCurrentPosition(p => { setLat(p.coords.latitude); setLng(p.coords.longitude); toast.success('تم'); }, () => toast.error('تعذر')); }} className="font-black active:scale-95 mt-3"
              style={{ background: '#0066FF', color: '#fff', padding: '10px 20px', borderRadius: 16, fontSize: 12, boxShadow: '0 4px 16px rgba(0,102,255,0.3)' }}>📍 موقعي الحالي</button>
          </div>

          <button onClick={handleAddGarage} className="w-full font-black active:scale-95 transition-all"
            style={{ background: 'linear-gradient(135deg,#0066FF,#4D00FF)', color: '#fff', padding: 20, borderRadius: 22, fontSize: 16, boxShadow: '0 8px 32px rgba(0,102,255,0.35)' }}>
            حفظ الجراج
          </button>
        </div>
      </div>
    </div>
  );
}