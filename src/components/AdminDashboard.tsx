import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Shield,
  Clock,
  CheckCircle,
  XCircle,
  MapPin,
  Warehouse,
  Plus,
  MessageCircle,
  Send,
  Receipt,
  Search,
} from 'lucide-react';
import { useStore } from '../store';
import { supabase } from '../lib/supabase';
import { calculateFullHours, calculateCost } from '../utils/pricing';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────
interface DailyStat {
  garage_id: string;
  stat_date: string;
  total_sessions: number;
  manual_sessions: number;
  app_sessions: number;
  total_revenue: number;
  cash_revenue: number;
  instapay_revenue: number;
  wallet_revenue: number;
  cashwallet_revenue: number;
  confirmed_revenue: number;
  pending_revenue: number;
}

// ─── دوال حساب التاريخ المحلي الصحيح ─────────────────────────────────────────
const getLocalDayStart = (dateStr: string): number => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
};

const getLocalDayEnd = (dateStr: string): number => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
};

const getSessionTime = (value?: number | string): number | null => {
  if (!value) return null;
  return typeof value === 'number' ? value : new Date(value).getTime();
};

export default function AdminDashboard() {
  const {
    garages,
    sessions,
    walletTopUps,
    approveTopUp,
    rejectTopUp,
    addGarage,
    setCurrentGarageId,
    setView,
    logout,
    messages,
    replyMessage,
    closeMessage,
    confirmRevenue,
    unconfirmRevenue,
    removeSession,
  } = useStore();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [, setTick] = useState(0);

  // ─── state للرسائل ────────────────────────────────────────────────────────
  const [replyText, setReplyText] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [expandedMessage, setExpandedMessage] = useState<string | null>(null);
  const [messagesTab, setMessagesTab] = useState<'pending' | 'all'>('pending');

  // ─── state لإدارة الإيرادات ──────────────────────────────────────────────
  const [revenueFilter, setRevenueFilter] = useState<'all' | 'confirmed' | 'pending'>('pending');
  const [sessionSearch, setSessionSearch] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // ─── state لـ daily_stats ─────────────────────────────────────────────────
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [dailyStatsLoading, setDailyStatsLoading] = useState(false);

  const [gName, setGName] = useState('');
  const [gUser, setGUser] = useState('');
  const [gPhone, setGPhone] = useState('');
  const [lat, setLat] = useState(30.04);
  const [lng, setLng] = useState(31.23);

  // ─── Tick كل ثانية ────────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // ─── جلب daily_stats من Supabase ─────────────────────────────────────────
const fetchDailyStats = useCallback(async () => {
  setDailyStatsLoading(true);
  try {
    let query = supabase
      .from('daily_stats')
      .select('*')
      .order('stat_date', { ascending: false });

    if (dateFrom) {
      query = query.gte('stat_date', dateFrom);
    }
    if (dateTo) {
      query = query.lte('stat_date', dateTo);
    }

    // ✅ لو مفيش فلتر - جيب آخر 90 يوم بدل كل البيانات
    if (!dateFrom && !dateTo) {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      query = query.gte('stat_date', ninetyDaysAgo.toISOString().split('T')[0]);
    }

    const { data, error } = await query;

    console.log('✅ daily_stats fetched:', data?.length, 'rows', data);

    if (error) {
      console.error('❌ خطأ في جلب daily_stats:', error);
      return;
    }

    console.log('✅ daily_stats loaded:', data?.length, 'rows');
    setDailyStats(data ?? []);

  useEffect(() => {
    fetchDailyStats();
  }, [fetchDailyStats]);

  // ─── حسابات التقارير من daily_stats ──────────────────────────────────────

  // ✅ إجمالي الإيرادات المؤكدة من daily_stats
  const totalRevenueFromStats = useMemo(() => {
    return dailyStats.reduce((a, s) => a + Number(s.confirmed_revenue ?? 0), 0);
  }, [dailyStats]);

  // ✅ إجمالي الإيرادات المعلقة من daily_stats
  const pendingRevenueFromStats = useMemo(() => {
    return dailyStats.reduce((a, s) => a + Number(s.pending_revenue ?? 0), 0);
  }, [dailyStats]);

  // ✅ إجمالي الجلسات المؤكدة من daily_stats
  const totalSessionsFromStats = useMemo(() => {
    return dailyStats.reduce((a, s) => a + Number(s.total_sessions ?? 0), 0);
  }, [dailyStats]);

  // ✅ تحليل طرق الدفع من daily_stats
  const paymentBreakdownFromStats = useMemo(() => {
    return {
      cash: dailyStats.reduce((a, s) => a + Number(s.cash_revenue ?? 0), 0),
      instapay: dailyStats.reduce((a, s) => a + Number(s.instapay_revenue ?? 0), 0),
      wallet: dailyStats.reduce((a, s) => a + Number(s.wallet_revenue ?? 0), 0),
      cashwallet: dailyStats.reduce((a, s) => a + Number(s.cashwallet_revenue ?? 0), 0),
    };
  }, [dailyStats]);

  // ✅ تقرير الجراجات من daily_stats
  const garageReportFromStats = useMemo(() => {
    return garages.map((g) => {
      const gStats = dailyStats.filter((s) => s.garage_id === g.id);
      return {
        name: g.name,
        garageId: g.id,
        count: gStats.reduce((a, s) => a + Number(s.total_sessions ?? 0), 0),
        revenue: gStats.reduce((a, s) => a + Number(s.confirmed_revenue ?? 0), 0),
        pendingRevenue: gStats.reduce((a, s) => a + Number(s.pending_revenue ?? 0), 0),
        pendingCount: 0, // هيتحدث من sessions
        cash: gStats.reduce((a, s) => a + Number(s.cash_revenue ?? 0), 0),
        instapay: gStats.reduce((a, s) => a + Number(s.instapay_revenue ?? 0), 0),
        wallet: gStats.reduce((a, s) => a + Number(s.wallet_revenue ?? 0), 0),
        cashwallet: gStats.reduce((a, s) => a + Number(s.cashwallet_revenue ?? 0), 0),
      };
    });
  }, [garages, dailyStats]);

  // ─── الجلسات للإدارة الفردية - بتيجي من sessions ──────────────────────────
  const completedSessions = sessions.filter((s) => s.status === 'completed');

  const filteredSessions = useMemo(() => {
    return completedSessions.filter((s) => {
      const sessionEndTime = getSessionTime(s.endTime);
      if (!sessionEndTime) return false;

      if (dateFrom) {
        const fromStart = getLocalDayStart(dateFrom);
        if (sessionEndTime < fromStart) return false;
      }

      if (dateTo) {
        const toEnd = getLocalDayEnd(dateTo);
        if (sessionEndTime > toEnd) return false;
      }

      return true;
    });
  }, [completedSessions, dateFrom, dateTo]);

  // ─── دالة حساب الإيراد للجلسة الفردية ───────────────────────────────────
  const getRevenue = (s: typeof completedSessions[0]) => {
    if (s.totalPrice != null && Number(s.totalPrice) > 0) {
      return Number(s.totalPrice);
    }
    if (s.endTime && s.startTime) {
      const start =
        typeof s.startTime === 'number'
          ? s.startTime
          : new Date(s.startTime).getTime();
      const end =
        typeof s.endTime === 'number'
          ? s.endTime
          : new Date(s.endTime).getTime();
      const elapsed = Math.max(0, Math.floor((end - start) / 1000));
      const g = garages.find((g) => g.id === s.garageId);
      const rate = Number(s.agreedPrice ?? g?.basePrice ?? 0);
      return calculateCost(elapsed, rate);
    }
    return 0;
  };

  // ─── عدد الجلسات المعلقة (للبانر) - من sessions ──────────────────────────
  const pendingRevenueCount = useMemo(
    () => filteredSessions.filter((s) => !s.revenueConfirmed).length,
    [filteredSessions]
  );

  const pendingTopUps = walletTopUps.filter((w) => w.status === 'pending');
  const activeSessions = sessions.filter((s) => s.status === 'active');

  // ✅ الجلسات المعروضة في إدارة الإيرادات
  const displayedRevenueSessions = useMemo(() => {
    let filtered = filteredSessions;

    if (revenueFilter === 'confirmed') {
      filtered = filtered.filter((s) => s.revenueConfirmed);
    } else if (revenueFilter === 'pending') {
      filtered = filtered.filter((s) => !s.revenueConfirmed);
    }

    if (sessionSearch.trim()) {
      const searchNormalized = sessionSearch.trim().toUpperCase();
      filtered = filtered.filter((s) =>
        (s.carPlate ?? '').toUpperCase().includes(searchNormalized)
      );
    }

    return filtered;
  }, [filteredSessions, revenueFilter, sessionSearch]);

  // ─── الرسائل ──────────────────────────────────────────────────────────────
  const safeMessages = messages ?? [];
  const pendingMessages = safeMessages.filter((m) => m.status === 'pending');
  const allMessages = [...safeMessages].sort((a, b) => b.timestamp - a.timestamp);
  const displayedMessages =
    messagesTab === 'pending' ? pendingMessages : allMessages;

  const getTypeEmoji = (type: string) => {
    switch (type) {
      case 'complaint': return '🚨';
      case 'inquiry': return '❓';
      case 'suggestion': return '💡';
      case 'technical': return '🔧';
      default: return '💬';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'complaint': return 'شكوى';
      case 'inquiry': return 'استفسار';
      case 'suggestion': return 'اقتراح';
      case 'technical': return 'مشكلة تقنية';
      default: return 'رسالة';
    }
  };

  const formatMsgTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('ar-EG', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const setToday = () => {
    const today = new Date().toISOString().split('T')[0];
    setDateFrom(today);
    setDateTo(today);
  };

  return (
    <div className="h-full bg-slate-950 text-white text-right p-5 overflow-y-auto pt-16">

      {/* ─── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
        <button
          onClick={() => {
            localStorage.removeItem('adminAuth');
            logout();
          }}
          className="bg-red-600/20 border border-red-500/20 text-red-400 px-4 py-2 rounded-xl text-[10px] font-black active:scale-95 transition-all"
        >
          تسجيل خروج
        </button>

        <h2 className="text-xl font-black text-blue-400 flex items-center gap-2">
          لوحة المشرف العام
          <Shield size={20} />
        </h2>

        <div className="bg-slate-900 border border-slate-800 p-2 rounded-xl text-[10px] text-slate-400">
          {sessions.length} عملية
        </div>
      </div>

      {/* ─── Date Filter ─────────────────────────────────────────────────────── */}
      <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-[2rem] mb-6 text-center">
        <h3 className="text-xs font-black text-slate-400 mb-3">
          تصفية حسب التاريخ
        </h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[9px] text-slate-500 font-bold block mb-1">من</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-[10px] font-bold text-white outline-none"
            />
          </div>
          <div>
            <label className="text-[9px] text-slate-500 font-bold block mb-1">إلى</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-[10px] font-bold text-white outline-none"
            />
          </div>
        </div>

        <div className="flex gap-2 justify-center">
          <button
            onClick={setToday}
            className="bg-blue-600/20 text-blue-400 px-4 py-2 rounded-xl text-[10px] font-black border border-blue-500/20 active:scale-95 transition-all"
          >
            📅 اليوم
          </button>
          <button
            onClick={() => {
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              const d = yesterday.toISOString().split('T')[0];
              setDateFrom(d);
              setDateTo(d);
            }}
            className="bg-slate-800 text-slate-400 px-4 py-2 rounded-xl text-[10px] font-black active:scale-95 transition-all"
          >
            أمس
          </button>
          <button
            onClick={() => {
              const weekAgo = new Date();
              weekAgo.setDate(weekAgo.getDate() - 7);
              setDateFrom(weekAgo.toISOString().split('T')[0]);
              setDateTo(new Date().toISOString().split('T')[0]);
            }}
            className="bg-slate-800 text-slate-400 px-4 py-2 rounded-xl text-[10px] font-black active:scale-95 transition-all"
          >
            آخر أسبوع
          </button>
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); }}
            className="bg-slate-800 text-slate-400 px-4 py-2 rounded-xl text-[10px] font-black active:scale-95 transition-all"
          >
            الكل
          </button>
        </div>

        {(dateFrom || dateTo) && (
          <div className="mt-3 bg-blue-600/10 border border-blue-500/20 rounded-xl p-2 text-center">
            <p className="text-[9px] text-blue-400 font-bold">
              {dateFrom && dateTo
                ? dateFrom === dateTo
                  ? `📅 ${new Date(getLocalDayStart(dateFrom)).toLocaleDateString('ar-EG', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}`
                  : `من ${dateFrom} إلى ${dateTo}`
                : dateFrom
                ? `من ${dateFrom}`
                : `إلى ${dateTo}`}
            </p>
            <p className="text-[8px] text-blue-400/60 mt-0.5">
              ⏰ من 12:00 صباحاً إلى 11:59 مساءً
            </p>
          </div>
        )}
      </div>

      {/* ─── Revenue Stats - من daily_stats ─────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-5 rounded-[2rem] shadow-2xl">
          <div className="text-[10px] text-blue-100 font-bold mb-1">
            الإيرادات المؤكدة
            {dailyStatsLoading && (
              <span className="text-blue-200/60 mr-1">⏳</span>
            )}
          </div>
          <div className="text-3xl font-black text-white font-mono tracking-tighter">
            {totalRevenueFromStats.toFixed(0)} <span className="text-xs">ج.م</span>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-[2rem] shadow-2xl">
          <div className="text-[10px] text-slate-500 font-bold mb-1">
            إجمالي العمليات
          </div>
          <div className="text-3xl font-black text-emerald-400 font-mono tracking-tighter">
            {totalSessionsFromStats}
          </div>
        </div>
      </div>

      {/* ─── Pending Revenue Banner ──────────────────────────────────────────── */}
      {(pendingRevenueFromStats > 0 || pendingRevenueCount > 0) && (
        <div className="bg-amber-600/10 border border-amber-500/30 rounded-2xl p-4 mb-6">
          <div className="flex justify-between items-center">
            <div className="text-right">
              <h3 className="text-sm font-black text-amber-400">
                ⏳ إيرادات معلقة ({pendingRevenueCount})
              </h3>
              <p className="text-[10px] text-amber-400/60">
                تحتاج تأكيد من أصحاب الجراجات
              </p>
            </div>
            <div className="text-xl font-black text-amber-400 font-mono">
              {pendingRevenueFromStats.toFixed(0)} ج.م
            </div>
          </div>
        </div>
      )}

      {/* ─── Payment Breakdown - من daily_stats ──────────────────────────────── */}
      <h3 className="text-xs font-black text-slate-400 mb-3">
        تحليل الإيرادات المؤكدة حسب وسيلة السداد
      </h3>
      <div className="grid grid-cols-2 gap-3 mb-8">
        <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full" />
            <span className="text-[9px] text-slate-400 font-bold">نقدي (كاش)</span>
          </div>
          <div className="text-xl font-black text-emerald-400 font-mono">
            {paymentBreakdownFromStats.cash.toFixed(0)}ج
          </div>
        </div>
        <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-purple-500 rounded-full" />
            <span className="text-[9px] text-slate-400 font-bold">إنستاباي</span>
          </div>
          <div className="text-xl font-black text-purple-400 font-mono">
            {paymentBreakdownFromStats.instapay.toFixed(0)}ج
          </div>
        </div>
        <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full" />
            <span className="text-[9px] text-slate-400 font-bold">المحفظة (شحن)</span>
          </div>
          <div className="text-xl font-black text-blue-400 font-mono">
            {paymentBreakdownFromStats.wallet.toFixed(0)}ج
          </div>
        </div>
        <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-red-500 rounded-full" />
            <span className="text-[9px] text-slate-400 font-bold">محفظة كاش</span>
          </div>
          <div className="text-xl font-black text-red-400 font-mono">
            {paymentBreakdownFromStats.cashwallet.toFixed(0)}ج
          </div>
        </div>
      </div>

      {/* ─── Garage Revenue Table - من daily_stats ───────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] overflow-hidden mb-8 shadow-2xl">
        <div className="p-4 border-b border-slate-800 bg-slate-900/50">
          <h3 className="text-sm font-black text-slate-300">
            تقرير إيرادات الجراجات (المؤكدة)
            {dailyStatsLoading && (
              <span className="text-slate-500 text-xs mr-2">جاري التحديث...</span>
            )}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right min-w-[580px]">
            <thead className="bg-slate-950 text-[9px] text-slate-500 font-bold">
              <tr>
                <th className="p-3">الجراج</th>
                <th className="p-3 text-center">المؤكد</th>
                <th className="p-3 text-amber-500 text-center">معلق</th>
                <th className="p-3 text-emerald-500 text-center">نقدي</th>
                <th className="p-3 text-purple-500 text-center">إنستاباي</th>
                <th className="p-3 text-blue-500 text-center">محفظة</th>
                <th className="p-3 text-red-500 text-center">كاش</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {garageReportFromStats.map((r) => (
                <tr key={r.name} className="hover:bg-slate-800/30 transition-colors">
                  <td className="p-3">
                    <div className="text-xs font-black text-slate-200">{r.name}</div>
                    <div className="text-[8px] text-slate-500">{r.count} جلسة</div>
                  </td>
                  <td className="p-3 text-center text-xs font-mono font-black text-slate-100 bg-slate-800/20">
                    {r.revenue.toFixed(0)}ج
                  </td>
                  <td className="p-3 text-center text-xs font-mono text-amber-400">
                    {r.pendingRevenue > 0 ? (
                      <span className="flex flex-col items-center">
                        <span>{r.pendingRevenue.toFixed(0)}ج</span>
                      </span>
                    ) : (
                      <span className="text-slate-700">—</span>
                    )}
                  </td>
                  <td className="p-3 text-center text-xs font-mono text-emerald-400">
                    {r.cash.toFixed(0)}
                  </td>
                  <td className="p-3 text-center text-xs font-mono text-purple-400">
                    {r.instapay.toFixed(0)}
                  </td>
                  <td className="p-3 text-center text-xs font-mono text-blue-400">
                    {r.wallet.toFixed(0)}
                  </td>
                  <td className="p-3 text-center text-xs font-mono text-red-400">
                    {r.cashwallet.toFixed(0)}
                  </td>
                </tr>
              ))}
              {garageReportFromStats.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-xs text-slate-600">
                    {dailyStatsLoading ? '⏳ جاري التحميل...' : 'لا توجد بيانات للفترة المحددة'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Revenue Sessions Management ─────────────────────────────────────── */}
      <div className="mb-8">
        <h3 className="font-black text-lg mb-4 text-slate-300 flex items-center gap-2 justify-end">
          إدارة الجلسات ({filteredSessions.length})
          <Receipt size={18} />
        </h3>

        <div className="space-y-3 mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setRevenueFilter('pending')}
              className={`flex-1 py-2 rounded-xl font-black text-xs transition-all ${
                revenueFilter === 'pending'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-900 border border-slate-800 text-slate-500'
              }`}
            >
              ⏳ معلق ({filteredSessions.filter((s) => !s.revenueConfirmed).length})
            </button>
            <button
              onClick={() => setRevenueFilter('confirmed')}
              className={`flex-1 py-2 rounded-xl font-black text-xs transition-all ${
                revenueFilter === 'confirmed'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-900 border border-slate-800 text-slate-500'
              }`}
            >
              ✅ مؤكد ({filteredSessions.filter((s) => s.revenueConfirmed).length})
            </button>
            <button
              onClick={() => setRevenueFilter('all')}
              className={`flex-1 py-2 rounded-xl font-black text-xs transition-all ${
                revenueFilter === 'all'
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-900 border border-slate-800 text-slate-500'
              }`}
            >
              الكل ({filteredSessions.length})
            </button>
          </div>

          <div className="relative">
            <Search
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              type="text"
              value={sessionSearch}
              onChange={(e) => setSessionSearch(e.target.value)}
              placeholder="ابحث برقم العربية..."
              className="w-full bg-slate-950 border border-slate-800 p-2.5 pr-9 rounded-xl text-right font-bold text-white outline-none text-xs placeholder:text-slate-600"
            />
            {sessionSearch && (
              <button
                onClick={() => setSessionSearch('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <XCircle size={14} />
              </button>
            )}
          </div>

          {(sessionSearch || revenueFilter !== 'all') && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-2 text-center">
              <span className="text-[10px] text-slate-400">
                عرض {displayedRevenueSessions.length} جلسة
                {sessionSearch && (
                  <span className="text-blue-400"> · بحث: "{sessionSearch}"</span>
                )}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {displayedRevenueSessions.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
              <div className="text-3xl mb-3">📭</div>
              <p className="text-slate-500 text-sm font-bold">
                {sessionSearch
                  ? `لا توجد نتائج لـ "${sessionSearch}"`
                  : revenueFilter === 'pending'
                  ? 'لا توجد جلسات معلقة'
                  : revenueFilter === 'confirmed'
                  ? 'لا توجد جلسات مؤكدة'
                  : 'لا توجد جلسات'}
              </p>
            </div>
          ) : (
            displayedRevenueSessions.map((session) => {
              const g = garages.find((ga) => ga.id === session.garageId);
              const rev = getRevenue(session);
              const endTime = session.endTime
                ? typeof session.endTime === 'number'
                  ? session.endTime
                  : new Date(session.endTime).getTime()
                : null;
              const time = endTime ? new Date(endTime) : null;
              const isDeleting = deleteConfirmId === session.id;

              return (
                <div
                  key={session.id}
                  className={`rounded-xl p-3 border ${
                    isDeleting
                      ? 'bg-red-950/30 border-red-500/50'
                      : session.revenueConfirmed
                      ? 'bg-emerald-950/20 border-emerald-500/20'
                      : 'bg-amber-950/20 border-amber-500/30'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-sm font-mono font-black ${
                          session.revenueConfirmed ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {rev.toFixed(0)} ج.م
                      </span>

                      <span
                        className={`text-[8px] px-2 py-0.5 rounded-full font-bold ${
                          session.source === 'manual'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}
                      >
                        {session.source === 'manual' ? 'يدوي' : 'تطبيق'}
                      </span>

                      {session.paymentMethod && (
                        <span
                          className={`text-[8px] px-2 py-0.5 rounded-full font-bold ${
                            session.paymentMethod === 'cash'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : session.paymentMethod === 'instapay'
                              ? 'bg-purple-500/20 text-purple-400'
                              : session.paymentMethod === 'wallet'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-orange-500/20 text-orange-400'
                          }`}
                        >
                          {session.paymentMethod === 'cash'
                            ? '💵 نقدي'
                            : session.paymentMethod === 'instapay'
                            ? '📱 إنستاباي'
                            : session.paymentMethod === 'wallet'
                            ? '👝 محفظة'
                            : '📲 كاش'}
                        </span>
                      )}

                      <span
                        className={`text-[8px] px-2 py-0.5 rounded-full font-bold ${
                          session.revenueConfirmed
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {session.revenueConfirmed ? '✅ مؤكد' : '⏳ معلق'}
                      </span>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-black text-white">
                        🚗 {session.carPlate}
                      </div>
                      <div className="text-[9px] text-slate-500">
                        {g?.name || '—'}
                      </div>
                    </div>
                  </div>

                  {time && (
                    <div className="text-[9px] text-slate-600 font-mono mb-2 text-left">
                      {time.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                      {' · '}
                      {time.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}
                    </div>
                  )}

                  {isDeleting ? (
                    <div className="bg-red-600/10 border border-red-500/30 rounded-xl p-3 space-y-2">
                      <p className="text-xs text-red-400 font-black text-center">
                        ⚠️ هل تريد حذف هذه الجلسة نهائياً؟
                      </p>
                      <p className="text-[9px] text-red-300/70 text-center">
                        🚗 {session.carPlate} · {rev.toFixed(0)} ج.م
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            await removeSession(session.id);
                            setDeleteConfirmId(null);
                            await fetchDailyStats();
                            toast.success('تم حذف الجلسة نهائياً 🗑️');
                          }}
                          className="flex-1 bg-red-600 text-white py-2 rounded-lg text-[10px] font-black active:scale-95 transition-all"
                        >
                          🗑️ تأكيد الحذف
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="flex-1 bg-slate-800 text-slate-400 py-2 rounded-lg text-[10px] font-black active:scale-95 transition-all"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {session.revenueConfirmed ? (
                        <button
                          onClick={async () => {
                            await unconfirmRevenue(session.id);
                            await fetchDailyStats();
                            toast('تم إلغاء تأكيد الإيراد ↩️', {
                              icon: '⏳',
                              style: {
                                background: '#1e293b',
                                color: '#f1f5f9',
                                border: '1px solid #334155',
                              },
                            });
                          }}
                          className="flex-1 bg-amber-600/20 text-amber-400 py-1.5 rounded-lg text-[9px] font-black border border-amber-500/20 active:scale-95 transition-all"
                        >
                          ↩️ إلغاء التأكيد
                        </button>
                      ) : (
                        <button
                          onClick={async () => {
                            await confirmRevenue(session.id);
                            await fetchDailyStats();
                            toast.success('تم تأكيد الإيراد ✅');
                          }}
                          className="flex-1 bg-emerald-600/20 text-emerald-400 py-1.5 rounded-lg text-[9px] font-black border border-emerald-500/20 active:scale-95 transition-all"
                        >
                          ✅ تأكيد الإيراد
                        </button>
                      )}

                      <button
                        onClick={() => setDeleteConfirmId(session.id)}
                        className="bg-red-600/10 text-red-400 px-3 py-1.5 rounded-lg text-[9px] font-black border border-red-500/20 active:scale-95 transition-all"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─── Pending Top-ups ─────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h3 className="font-black text-lg mb-4 text-orange-400 flex items-center gap-2 justify-end">
          اعتمادات معلقة ({pendingTopUps.length})
          <Clock size={18} />
        </h3>
        <div className="space-y-3">
          {pendingTopUps.map((w) => (
            <div key={w.id} className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
              <div className="flex justify-between items-center mb-3">
                <div
                  className={`text-[9px] font-black p-1 px-3 rounded-full ${
                    w.method === 'instapay'
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'bg-orange-500/20 text-orange-400'
                  }`}
                >
                  {w.method === 'instapay' ? '📱 إنستاباي' : '📲 محفظة كاش'}
                </div>
                <div className="text-[9px] text-slate-500 font-bold">
                  {new Date(w.timestamp).toLocaleDateString('ar-EG', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>

              <div className="text-3xl font-black text-white font-mono mb-3">
                {w.amount} <span className="text-xs opacity-50">ج.م</span>
              </div>

              <div className="bg-slate-950/50 rounded-xl p-3 mb-3 space-y-2 border border-slate-800">
                {w.userName && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-white">{w.userName}</span>
                    <span className="text-[10px] text-slate-500">👤 الاسم</span>
                  </div>
                )}
                {w.userPhone && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-blue-400 font-mono">{w.userPhone}</span>
                    <span className="text-[10px] text-slate-500">📞 الهاتف</span>
                  </div>
                )}
                {w.carPlate && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-amber-400">{w.carPlate}</span>
                    <span className="text-[10px] text-slate-500">🚗 السيارة</span>
                  </div>
                )}
              </div>

              <div className="text-[9px] text-slate-600 font-mono mb-3 bg-slate-950/30 p-2 rounded-lg border border-slate-800">
                مرجع: {w.transactionId}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    approveTopUp(w.id);
                    toast.success(`تم اعتماد شحن ${w.amount} ج.م لـ ${w.userName || 'العميل'} ✅`);
                  }}
                  className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-black text-sm flex items-center justify-center gap-1 active:scale-95 transition-all"
                >
                  <CheckCircle size={16} />
                  اعتماد وإضافة الرصيد
                </button>
                <button
                  onClick={() => {
                    rejectTopUp(w.id);
                    toast.error('تم رفض عملية الشحن');
                  }}
                  className="bg-red-600 text-white px-4 py-3 rounded-xl font-black text-sm flex items-center justify-center active:scale-95 transition-all"
                >
                  <XCircle size={16} />
                </button>
              </div>
            </div>
          ))}
          {pendingTopUps.length === 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-slate-500 text-sm">
              لا توجد اعتمادات معلقة
            </div>
          )}
        </div>
      </div>

      {/* ─── Active Sessions ─────────────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] text-slate-500 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
            {activeSessions.length} جلسة
          </span>
          <h3 className="font-black text-lg text-emerald-400 flex items-center gap-2">
            الجلسات النشطة الآن
            <Clock size={18} />
          </h3>
        </div>

        {activeSessions.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {garages
              .map((g) => {
                const garageActive = activeSessions.filter((s) => s.garageId === g.id);
                if (garageActive.length === 0) return null;

                const totalExpected = garageActive.reduce((a, s) => {
                  const start =
                    typeof s.startTime === 'number'
                      ? s.startTime
                      : new Date(s.startTime).getTime();
                  const secs = Math.max(0, Math.floor((Date.now() - start) / 1000));
                  const rate = Number(s.agreedPrice ?? g.basePrice);
                  return a + calculateCost(secs, rate);
                }, 0);

                return (
                  <div key={g.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-black text-emerald-400 font-mono">
                        {garageActive.length}
                      </span>
                      <span className="text-[10px] font-black text-white">{g.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-emerald-400 font-mono font-bold">
                        {totalExpected.toFixed(0)} ج.م
                      </span>
                      <span className="text-[9px] text-slate-500">إيراد متوقع</span>
                    </div>
                  </div>
                );
              })
              .filter(Boolean)}
          </div>
        )}

        <div className="space-y-3">
          {activeSessions.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-slate-500 text-sm">
              لا توجد جلسات نشطة حالياً
            </div>
          ) : (
            activeSessions.map((s) => {
              const g = garages.find((ga) => ga.id === s.garageId);
              const start =
                typeof s.startTime === 'number'
                  ? s.startTime
                  : new Date(s.startTime).getTime();
              const elapsedSecs = Math.max(0, Math.floor((Date.now() - start) / 1000));
              const mins = Math.floor(elapsedSecs / 60);
              const hours = calculateFullHours(elapsedSecs);
              const rate = Number(s.agreedPrice ?? g?.basePrice ?? 0);
              const cost = calculateCost(elapsedSecs, rate);
              const isManual = s.source === 'manual';

              return (
                <div
                  key={s.id}
                  className={`p-4 rounded-2xl border ${
                    isManual
                      ? 'bg-amber-950/20 border-amber-500/20'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full animate-pulse ${
                          isManual ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                      />
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                          isManual
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}
                      >
                        {isManual ? 'يدوي' : 'تطبيق'}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-white">🚗 {s.carPlate}</div>
                      <div className="text-xs text-slate-400">{g?.name || 'جراج غير معروف'}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-950/50 rounded-lg p-2 border border-slate-800">
                      <div className="text-sm font-black text-white font-mono">{mins}</div>
                      <div className="text-[8px] text-slate-500">دقيقة</div>
                    </div>
                    <div className="bg-slate-950/50 rounded-lg p-2 border border-slate-800">
                      <div className="text-sm font-black text-blue-400 font-mono">{hours}</div>
                      <div className="text-[8px] text-slate-500">ساعة محسوبة</div>
                    </div>
                    <div className="bg-slate-950/50 rounded-lg p-2 border border-slate-800">
                      <div className="text-sm font-black text-emerald-400 font-mono">{cost}</div>
                      <div className="text-[8px] text-slate-500">ج.م</div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─── Messages & Complaints ───────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded-lg text-[10px] font-black border border-red-500/20">
            {pendingMessages.length} جديد
          </span>
          <h3 className="font-black text-lg text-blue-400 flex items-center gap-2">
            الرسائل والشكاوى
            <MessageCircle size={18} />
          </h3>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMessagesTab('all')}
            className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all ${
              messagesTab === 'all'
                ? 'bg-slate-700 text-white'
                : 'bg-slate-900 border border-slate-800 text-slate-500'
            }`}
          >
            الكل ({allMessages.length})
          </button>
          <button
            onClick={() => setMessagesTab('pending')}
            className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all ${
              messagesTab === 'pending'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-900 border border-slate-800 text-slate-500'
            }`}
          >
            ⏳ معلقة ({pendingMessages.length})
          </button>
        </div>

        <div className="space-y-3">
          {displayedMessages.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-slate-500 text-sm">
              لا توجد رسائل
            </div>
          ) : (
            displayedMessages.map((msg) => {
              const isExpanded = expandedMessage === msg.id;
              const isReplying = replyingTo === msg.id;

              return (
                <div
                  key={msg.id}
                  className={`rounded-2xl p-4 border transition-all ${
                    msg.status === 'pending'
                      ? 'bg-amber-950/20 border-amber-500/20'
                      : msg.status === 'replied'
                      ? 'bg-emerald-950/20 border-emerald-500/20'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                          msg.status === 'pending'
                            ? 'bg-amber-500/20 text-amber-400'
                            : msg.status === 'replied'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-slate-500/20 text-slate-400'
                        }`}
                      >
                        {msg.status === 'pending'
                          ? '⏳ معلقة'
                          : msg.status === 'replied'
                          ? '✅ تم الرد'
                          : '🔒 مغلقة'}
                      </span>
                      <span className="text-[9px] text-slate-600">
                        {formatMsgTime(msg.timestamp)}
                      </span>
                    </div>
                    <span className="text-[9px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-bold">
                      {getTypeEmoji(msg.type)} {getTypeLabel(msg.type)}
                    </span>
                  </div>

                  <div className="bg-slate-950/50 rounded-xl p-2 mb-2 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 font-mono">{msg.userPhone}</span>
                    <div className="flex items-center gap-2">
                      {msg.userName && (
                        <span className="text-[10px] text-white font-bold">{msg.userName}</span>
                      )}
                      {msg.carPlate && (
                        <span className="text-[9px] text-blue-400 font-mono">🚗 {msg.carPlate}</span>
                      )}
                    </div>
                  </div>

                  {msg.subject && (
                    <div className="text-xs font-black text-white mb-1 text-right">
                      {msg.subject}
                    </div>
                  )}

                  <div
                    className={`text-[11px] text-slate-400 text-right leading-relaxed mb-2 cursor-pointer ${
                      isExpanded ? '' : 'line-clamp-2'
                    }`}
                    onClick={() => setExpandedMessage(isExpanded ? null : msg.id)}
                  >
                    {msg.message}
                  </div>

                  {!isExpanded && msg.message.length > 80 && (
                    <button
                      onClick={() => setExpandedMessage(msg.id)}
                      className="text-[9px] text-blue-400 font-bold mb-2"
                    >
                      عرض الكامل ↓
                    </button>
                  )}

                  {msg.reply && (
                    <div className="bg-emerald-600/10 border border-emerald-500/20 rounded-xl p-3 mb-3">
                      <div className="text-[9px] text-emerald-400 font-bold text-right mb-1">
                        ردك السابق:
                      </div>
                      <div className="text-[11px] text-emerald-300 text-right leading-relaxed">
                        {msg.reply}
                      </div>
                      {msg.repliedAt && (
                        <div className="text-[8px] text-emerald-600 text-left mt-1">
                          {formatMsgTime(msg.repliedAt)}
                        </div>
                      )}
                    </div>
                  )}

                  {msg.status !== 'closed' && (
                    <>
                      {isReplying ? (
                        <div className="space-y-2">
                          <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="اكتب ردك هنا..."
                            rows={3}
                            className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-right font-bold text-white outline-none text-sm placeholder:text-slate-600 resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                if (!replyText.trim()) {
                                  toast.error('اكتب الرد أولاً');
                                  return;
                                }
                                await replyMessage(msg.id, replyText.trim());
                                toast.success('تم إرسال الرد ✅');
                                setReplyText('');
                                setReplyingTo(null);
                              }}
                              className="flex-1 bg-emerald-600 text-white py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                            >
                              <Send size={14} />
                              إرسال الرد
                            </button>
                            <button
                              onClick={() => { setReplyingTo(null); setReplyText(''); }}
                              className="bg-slate-800 text-slate-400 px-4 py-2.5 rounded-xl font-black text-xs active:scale-95 transition-all"
                            >
                              إلغاء
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setReplyingTo(msg.id);
                              setReplyText('');
                              setExpandedMessage(msg.id);
                            }}
                            className="flex-1 bg-blue-600/20 text-blue-400 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 border border-blue-500/20 active:scale-95 transition-all"
                          >
                            <Send size={14} />
                            {msg.reply ? 'تعديل الرد' : 'رد'}
                          </button>
                          <button
                            onClick={async () => {
                              await closeMessage(msg.id);
                              toast.success('تم إغلاق الرسالة');
                            }}
                            className="bg-slate-800 text-slate-400 px-4 py-2.5 rounded-xl font-black text-xs active:scale-95 transition-all"
                          >
                            إغلاق
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─── Manage Garages ──────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h3 className="font-black text-lg mb-4 text-blue-400 flex items-center gap-2 justify-end">
          إدارة الجراجات
          <Warehouse size={18} />
        </h3>
        <div className="space-y-3">
          {garages.map((g) => (
            <div key={g.id} className="bg-slate-900 p-5 rounded-[2rem] border border-slate-800">
              <div className="flex justify-between mb-4">
                <div className="bg-blue-600/20 text-blue-400 p-3 rounded-2xl text-center border border-blue-500/20 min-w-[60px]">
                  <div className="text-xl font-black font-mono">{g.availableSpots}</div>
                  <div className="text-[8px] font-bold">شاغر</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-white mb-1">{g.name}</div>
                  <div className="text-[10px] text-slate-500 flex items-center gap-1 justify-end">
                    <MapPin size={10} /> {g.location}
                  </div>
                </div>
              </div>
              <button
                onClick={() => { setCurrentGarageId(g.id); setView('garage'); }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-black text-sm active:scale-95 transition-all"
              >
                دخول وإدارة البيانات
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Add Garage ──────────────────────────────────────────────────────── */}
      <div className="mb-20">
        <h3 className="font-black text-lg mb-4 text-blue-400 flex items-center gap-2 justify-end">
          إضافة جراج جديد
          <Plus size={18} />
        </h3>
        <div className="bg-slate-900 p-5 rounded-[2rem] border border-slate-800 space-y-4">
          <input
            className="w-full bg-slate-950 p-4 rounded-xl border border-slate-800 text-sm font-bold text-right text-white outline-none placeholder:text-slate-600"
            placeholder="اسم الجراج"
            value={gName}
            onChange={(e) => setGName(e.target.value)}
          />
          <div className="flex gap-2">
            <input
              className="flex-1 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-bold text-right text-white outline-none placeholder:text-slate-600"
              placeholder="المستخدم"
              value={gUser}
              onChange={(e) => setGUser(e.target.value)}
            />
            <input
              className="flex-1 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-bold text-right text-white outline-none placeholder:text-slate-600"
              placeholder="الهاتف"
              value={gPhone}
              onChange={(e) => setGPhone(e.target.value)}
            />
          </div>

          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <div className="text-[10px] text-blue-400 font-bold mb-2">تحديد الإحداثيات</div>
            <div className="grid grid-cols-2 gap-3 text-white font-mono mb-3">
              <div>
                <span className="text-[8px] text-slate-500 block px-1">خط العرض</span>
                <input
                  type="number"
                  value={lat}
                  onChange={(e) => setLat(parseFloat(e.target.value))}
                  className="w-full bg-slate-900 p-2 rounded-lg border border-slate-800 text-xs outline-none"
                  step="0.000001"
                />
              </div>
              <div>
                <span className="text-[8px] text-slate-500 block px-1">خط الطول</span>
                <input
                  type="number"
                  value={lng}
                  onChange={(e) => setLng(parseFloat(e.target.value))}
                  className="w-full bg-slate-900 p-2 rounded-lg border border-slate-800 text-xs outline-none"
                  step="0.000001"
                />
              </div>
            </div>
          </div>

          <div className="bg-slate-950 rounded-2xl border border-slate-800 p-4 text-center">
            <div className="text-2xl mb-2">📍</div>
            <div className="text-xs text-slate-400 font-bold mb-2">الموقع المحدد</div>
            <div className="text-sm font-black text-blue-400 font-mono">
              {lat.toFixed(4)}, {lng.toFixed(4)}
            </div>
            <button
              type="button"
              onClick={() => {
                if ('geolocation' in navigator) {
                  navigator.geolocation.getCurrentPosition(
                    (pos) => {
                      setLat(pos.coords.latitude);
                      setLng(pos.coords.longitude);
                      toast.success('تم تحديث الموقع');
                    },
                    () => toast.error('تعذر الحصول على الموقع')
                  );
                }
              }}
              className="mt-3 bg-blue-600/20 text-blue-400 px-4 py-2 rounded-xl text-xs font-black border border-blue-500/20 active:scale-95 transition-all"
            >
              📍 استخدم موقعي الحالي
            </button>
          </div>

          <button
            onClick={() => {
              if (gName && gUser && gPhone) {
                addGarage({
                  name: gName,
                  username: gUser,
                  phone: gPhone,
                  capacity: 50,
                  basePrice: 15,
                  location: 'موقع جديد',
                  lat,
                  lng,
                });
                setGName('');
                setGUser('');
                setGPhone('');
                toast.success('تم إضافة الجراج بنجاح!');
              } else {
                toast.error('يرجى ملء جميع الحقول');
              }
            }}
            className="w-full bg-blue-600 py-4 rounded-xl font-black text-sm text-white shadow-xl active:scale-95 transition-all"
          >
            حفظ الجراج
          </button>
        </div>
      </div>
    </div>
  );
}