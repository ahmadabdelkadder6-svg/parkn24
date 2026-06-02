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

  // ─── جلب daily_stats من Supabase ─────────────────────────────────────────
  const fetchDailyStats = useCallback(async () => {
    setDailyStatsLoading(true);
    try {
      let query = supabase
        .from('daily_stats')
        .select('*')
        .order('stat_date', { ascending: false });

      if (dateFrom) query = query.gte('stat_date', dateFrom);
      if (dateTo) query = query.lte('stat_date', dateTo);

      if (!dateFrom && !dateTo) {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        query = query.gte('stat_date', ninetyDaysAgo.toISOString().split('T')[0]);
      }

      const { data, error } = await query;
      if (error) throw error;
      setDailyStats(data ?? []);
    } catch (err) {
      console.error('❌ Error fetching stats:', err);
    } finally {
      setDailyStatsLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchDailyStats();
  }, [fetchDailyStats]);

  // ─── حسابات التقارير ────────────────────────────────────────────────────
  const totalRevenueFromStats = useMemo(() => dailyStats.reduce((a, s) => a + Number(s.confirmed_revenue ?? 0), 0), [dailyStats]);
  const pendingRevenueFromStats = useMemo(() => dailyStats.reduce((a, s) => a + Number(s.pending_revenue ?? 0), 0), [dailyStats]);
  const totalSessionsFromStats = useMemo(() => dailyStats.reduce((a, s) => a + Number(s.total_sessions ?? 0), 0), [dailyStats]);

  const garageReportFromStats = useMemo(() => {
    return garages.map((g) => {
      const gStats = dailyStats.filter((s) => s.garage_id === g.id);
      return {
        name: g.name,
        garageId: g.id,
        count: gStats.reduce((a, s) => a + Number(s.total_sessions ?? 0), 0),
        revenue: gStats.reduce((a, s) => a + Number(s.confirmed_revenue ?? 0), 0),
        pendingRevenue: gStats.reduce((a, s) => a + Number(s.pending_revenue ?? 0), 0),
        cash: gStats.reduce((a, s) => a + Number(s.cash_revenue ?? 0), 0),
        instapay: gStats.reduce((a, s) => a + Number(s.instapay_revenue ?? 0), 0),
        wallet: gStats.reduce((a, s) => a + Number(s.wallet_revenue ?? 0), 0),
        cashwallet: gStats.reduce((a, s) => a + Number(s.cashwallet_revenue ?? 0), 0),
      };
    });
  }, [garages, dailyStats]);

  const completedSessions = sessions.filter((s) => s.status === 'completed');

  const filteredSessions = useMemo(() => {
    return completedSessions.filter((s) => {
      const sessionEndTime = getSessionTime(s.endTime);
      if (!sessionEndTime) return false;
      if (dateFrom && sessionEndTime < getLocalDayStart(dateFrom)) return false;
      if (dateTo && sessionEndTime > getLocalDayEnd(dateTo)) return false;
      return true;
    });
  }, [completedSessions, dateFrom, dateTo]);

  const getRevenue = (s: any) => {
    if (s.totalPrice != null && Number(s.totalPrice) > 0) return Number(s.totalPrice);
    if (s.endTime && s.startTime) {
      const start = typeof s.startTime === 'number' ? s.startTime : new Date(s.startTime).getTime();
      const end = typeof s.endTime === 'number' ? s.endTime : new Date(s.endTime).getTime();
      const elapsed = Math.max(0, Math.floor((end - start) / 1000));
      const g = garages.find((ga: any) => ga.id === s.garageId);
      const rate = Number(s.agreedPrice ?? g?.basePrice ?? 0);
      return calculateCost(elapsed, rate);
    }
    return 0;
  };

  const pendingRevenueCount = useMemo(() => filteredSessions.filter((s) => !s.revenueConfirmed).length, [filteredSessions]);
  const pendingTopUps = walletTopUps.filter((w) => w.status === 'pending');
  const activeSessions = sessions.filter((s) => s.status === 'active');

  const displayedRevenueSessions = useMemo(() => {
    let filtered = filteredSessions;
    if (revenueFilter === 'confirmed') filtered = filtered.filter((s) => s.revenueConfirmed);
    else if (revenueFilter === 'pending') filtered = filtered.filter((s) => !s.revenueConfirmed);
    if (sessionSearch.trim()) {
      const searchNormalized = sessionSearch.trim().toUpperCase();
      filtered = filtered.filter((s) => (s.carPlate ?? '').toUpperCase().includes(searchNormalized));
    }
    return filtered;
  }, [filteredSessions, revenueFilter, sessionSearch]);

  const safeMessages = messages ?? [];
  const pendingMessages = safeMessages.filter((m) => m.status === 'pending');
  const allMessages = [...safeMessages].sort((a, b) => b.timestamp - a.timestamp);
  const displayedMessages = messagesTab === 'pending' ? pendingMessages : allMessages;

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
    return new Date(timestamp).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
        <button onClick={() => { localStorage.removeItem('adminAuth'); logout(); }} className="bg-red-600/20 border border-red-500/20 text-red-400 px-4 py-2 rounded-xl text-[10px] font-black active:scale-95 transition-all">تسجيل خروج</button>
        <h2 className="text-xl font-black text-blue-400 flex items-center gap-2">لوحة المشرف العام <Shield size={20} /></h2>
        <div className="bg-slate-900 border border-slate-800 p-2 rounded-xl text-[10px] text-slate-400">{sessions.length} عملية</div>
      </div>

      {/* ─── Date Filter ─────────────────────────────────────────────────────── */}
      <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-[2rem] mb-6 text-center">
        <h3 className="text-xs font-black text-slate-400 mb-3">تصفية حسب التاريخ</h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[9px] text-slate-500 font-bold block mb-1">من</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-[10px] font-bold text-white outline-none" />
          </div>
          <div>
            <label className="text-[9px] text-slate-500 font-bold block mb-1">إلى</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-[10px] font-bold text-white outline-none" />
          </div>
        </div>
        <div className="flex gap-2 justify-center">
          <button onClick={setToday} className="bg-blue-600/20 text-blue-400 px-4 py-2 rounded-xl text-[10px] font-black border border-blue-500/20 active:scale-95 transition-all">📅 اليوم</button>
          <button onClick={() => { const y = new Date(); y.setDate(y.getDate() - 1); setDateFrom(y.toISOString().split('T')[0]); setDateTo(y.toISOString().split('T')[0]); }} className="bg-slate-800 text-slate-400 px-4 py-2 rounded-xl text-[10px] font-black active:scale-95 transition-all">أمس</button>
          <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="bg-slate-800 text-slate-400 px-4 py-2 rounded-xl text-[10px] font-black active:scale-95 transition-all">الكل</button>
        </div>
      </div>

      {/* ─── Stats ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-5 rounded-[2rem] shadow-2xl">
          <div className="text-[10px] text-blue-100 font-bold mb-1">الإيرادات المؤكدة</div>
          <div className="text-3xl font-black text-white font-mono tracking-tighter">{totalRevenueFromStats.toFixed(0)} <span className="text-xs">ج.م</span></div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-[2rem] shadow-2xl">
          <div className="text-[10px] text-slate-500 font-bold mb-1">إجمالي العمليات</div>
          <div className="text-3xl font-black text-emerald-400 font-mono tracking-tighter">{totalSessionsFromStats}</div>
        </div>
      </div>

      {/* ─── Garage Report Table ───────────────────────────────────────────── */}
      <div className="mb-8">
        <h3 className="font-black text-lg text-slate-300 mb-4 text-right">تقرير إيرادات الجراجات</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-right min-w-[580px]">
            <thead className="bg-slate-950 text-[9px] text-slate-500 font-bold">
              <tr>
                <th className="p-3">الجراج</th>
                <th className="p-3 text-center">المؤكد</th>
                <th className="p-3 text-amber-500 text-center">معلق</th>
                <th className="p-3 text-emerald-500 text-center">نقدي</th>
                <th className="p-3 text-purple-500 text-center">إنستاباي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {garageReportFromStats.map((r) => (
                <tr key={r.garageId} className="hover:bg-slate-800/30">
                  <td className="p-3 text-xs font-black text-slate-200">{r.name}</td>
                  <td className="p-3 text-center text-xs font-mono font-black text-slate-100">{r.revenue.toFixed(0)}ج</td>
                  <td className="p-3 text-center text-xs font-mono text-amber-400">{r.pendingRevenue.toFixed(0)}ج</td>
                  <td className="p-3 text-center text-xs font-mono text-emerald-400">{r.cash.toFixed(0)}</td>
                  <td className="p-3 text-center text-xs font-mono text-purple-400">{r.instapay.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Manage Sessions ─────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h3 className="font-black text-lg mb-4 text-slate-300 flex items-center gap-2 justify-end">إدارة الجلسات ({filteredSessions.length}) <Receipt size={18} /></h3>
        <div className="space-y-3 mb-4">
          <div className="flex gap-2">
            <button onClick={() => setRevenueFilter('pending')} className={`flex-1 py-2 rounded-xl font-black text-xs ${revenueFilter === 'pending' ? 'bg-amber-600' : 'bg-slate-900 text-slate-500'}`}>⏳ معلق</button>
            <button onClick={() => setRevenueFilter('confirmed')} className={`flex-1 py-2 rounded-xl font-black text-xs ${revenueFilter === 'confirmed' ? 'bg-emerald-600' : 'bg-slate-900 text-slate-500'}`}>✅ مؤكد</button>
            <button onClick={() => setRevenueFilter('all')} className={`flex-1 py-2 rounded-xl font-black text-xs ${revenueFilter === 'all' ? 'bg-slate-700' : 'bg-slate-900 text-slate-500'}`}>الكل</button>
          </div>
        </div>
        <div className="space-y-2">
          {displayedRevenueSessions.map((session) => (
            <div key={session.id} className="rounded-xl p-3 border bg-slate-900/50 border-slate-800">
              <div className="flex justify-between items-center">
                <span className="text-sm font-mono font-black text-blue-400">{getRevenue(session).toFixed(0)} ج.م</span>
                <div className="text-right">
                  <div className="text-xs font-black">🚗 {session.carPlate}</div>
                  <div className="text-[9px] text-slate-500">{garages.find(g => g.id === session.garageId)?.name}</div>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                {!session.revenueConfirmed ? (
                  <button onClick={() => confirmRevenue(session.id)} className="flex-1 bg-emerald-600/20 text-emerald-400 py-1.5 rounded-lg text-[9px] font-black border border-emerald-500/20">✅ تأكيد</button>
                ) : (
                  <button onClick={() => unconfirmRevenue(session.id)} className="flex-1 bg-amber-600/20 text-amber-400 py-1.5 rounded-lg text-[9px] font-black border border-amber-500/20">↩️ إلغاء</button>
                )}
                <button onClick={() => removeSession(session.id)} className="bg-red-600/10 text-red-400 px-3 py-1.5 rounded-lg text-[9px] font-black border border-red-500/20">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Messages ────────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h3 className="font-black text-lg text-blue-400 mb-4 text-right flex items-center gap-2 justify-end">الرسائل والشكاوى <MessageCircle size={18} /></h3>
        <div className="space-y-3">
          {displayedMessages.map((msg) => (
            <div key={msg.id} className="rounded-2xl p-4 border bg-slate-900 border-slate-800">
              <div className="flex justify-between mb-2">
                <span className="text-[9px] text-slate-500">{formatMsgTime(msg.timestamp)}</span>
                <span className="text-[9px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">{getTypeLabel(msg.type)}</span>
              </div>
              <div className="text-xs font-black mb-1">{msg.userName || msg.userPhone}</div>
              <div className="text-[11px] text-slate-400 mb-3">{msg.message}</div>
              {msg.status === 'pending' && (
                <div className="flex gap-2">
                  <button onClick={() => setReplyingTo(msg.id)} className="flex-1 bg-blue-600/20 text-blue-400 py-2 rounded-xl font-black text-xs border border-blue-500/20">رد</button>
                  <button onClick={() => closeMessage(msg.id)} className="bg-slate-800 text-slate-400 px-4 py-2 rounded-xl font-black text-xs">إغلاق</button>
                </div>
              )}
              {replyingTo === msg.id && (
                <div className="mt-3 space-y-2">
                  <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-right text-xs text-white outline-none" rows={2} placeholder="اكتب ردك..." />
                  <button onClick={async () => { await replyMessage(msg.id, replyText); setReplyingTo(null); setReplyText(''); toast.success('تم الرد'); }} className="w-full bg-emerald-600 text-white py-2 rounded-xl font-black text-xs">إرسال</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ─── Add Garage ──────────────────────────────────────────────────────── */}
      <div className="mb-20">
        <h3 className="font-black text-lg mb-4 text-blue-400 flex items-center gap-2 justify-end">إضافة جراج جديد <Plus size={18} /></h3>
        <div className="bg-slate-900 p-5 rounded-[2rem] border border-slate-800 space-y-4">
          <input className="w-full bg-slate-950 p-4 rounded-xl border border-slate-800 text-sm font-bold text-right text-white outline-none" placeholder="اسم الجراج" value={gName} onChange={(e) => setGName(e.target.value)} />
          <div className="flex gap-2">
            <input className="flex-1 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-bold text-right text-white outline-none" placeholder="المستخدم" value={gUser} onChange={(e) => setGUser(e.target.value)} />
            <input className="flex-1 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-bold text-right text-white outline-none" placeholder="الهاتف" value={gPhone} onChange={(e) => setGPhone(e.target.value)} />
          </div>
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <div className="text-[10px] text-blue-400 font-bold mb-2">تحديد الإحداثيات</div>
            <div className="grid grid-cols-2 gap-3 text-white font-mono mb-3">
              <div><span className="text-[8px] text-slate-500 block px-1">خط العرض</span><input type="number" value={lat} onChange={(e) => setLat(parseFloat(e.target.value))} className="w-full bg-slate-900 p-2 rounded-lg border border-slate-800 text-xs outline-none" step="0.000001" /></div>
              <div><span className="text-[8px] text-slate-500 block px-1">خط الطول</span><input type="number" value={lng} onChange={(e) => setLng(parseFloat(e.target.value))} className="w-full bg-slate-900 p-2 rounded-lg border border-slate-800 text-xs outline-none" step="0.000001" /></div>
            </div>
            <button type="button" onClick={() => { if ('geolocation' in navigator) navigator.geolocation.getCurrentPosition((pos) => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); toast.success('تم تحديث الموقع'); }, () => toast.error('تعذر الحصول على الموقع')); }} className="w-full bg-blue-600/20 text-blue-400 py-3 rounded-xl text-xs font-black border border-blue-500/20 active:scale-95 transition-all">📍 استخدم موقعي الحالي</button>
          </div>
          <button onClick={async () => { if (gName && gUser && gPhone) { await addGarage({ name: gName, username: gUser, phone: gPhone, capacity: 50, basePrice: 15, location: 'موقع جديد', lat, lng }); setGName(''); setGUser(''); setGPhone(''); toast.success('تم إضافة الجراج بنجاح!'); } else { toast.error('يرجى ملء جميع الحقول'); } }} className="w-full bg-blue-600 py-4 rounded-xl font-black text-sm text-white active:scale-95 transition-all">حفظ الجراج</button>
        </div>
      </div>
    </div>
  );
}
