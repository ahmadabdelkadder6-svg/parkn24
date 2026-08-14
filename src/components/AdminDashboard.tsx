import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Shield, Clock, CheckCircle, XCircle, MapPin, Warehouse, Plus,
  MessageCircle, Send, Receipt, Search, HardHat, Percent, DollarSign,
  Minus,
} from 'lucide-react';
import { useStore } from '../store';
import { supabase } from '../lib/supabase';
import { calculateCost } from '../utils/pricing';
import toast from 'react-hot-toast';

interface DailyStat {
  garage_id: string; stat_date: string; total_sessions: number; manual_sessions: number;
  app_sessions: number; total_revenue: number; cash_revenue: number; instapay_revenue: number;
  wallet_revenue: number; cashwallet_revenue: number; confirmed_revenue: number; pending_revenue: number;
}

const getLocalToday = (): string => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };
const getLocalYesterday = (): string => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const getLocalDaysAgo = (days: number): string => { const d = new Date(); d.setDate(d.getDate() - days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const getLocalDayStartMs = (dateStr: string): number => { const [y, m, d] = dateStr.split('-').map(Number); return new Date(y, m - 1, d, 0, 0, 0, 0).getTime(); };
const getLocalDayEndMs = (dateStr: string): number => { const [y, m, d] = dateStr.split('-').map(Number); return new Date(y, m - 1, d, 23, 59, 59, 999).getTime(); };
const formatLocalDateArabic = (dateStr: string): string => { const [y, m, d] = dateStr.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); };
const getSessionTime = (value?: number | string): number | null => { if (!value) return null; return typeof value === 'number' ? value : new Date(value).getTime(); };

export default function AdminDashboard() {
  const {
    garages, sessions, walletTopUps, approveTopUp, rejectTopUp, addGarage,
    setCurrentGarageId, setView, logout, messages, replyMessage, closeMessage,
    confirmRevenue, unconfirmRevenue, removeSession, updateGarage,
  } = useStore();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [, setTick] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [expandedMessage, setExpandedMessage] = useState<string | null>(null);
  const [messagesTab, setMessagesTab] = useState<'pending' | 'all'>('pending');
  const [revenueFilter, setRevenueFilter] = useState<'all' | 'confirmed' | 'pending'>('pending');
  const [sessionSearch, setSessionSearch] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [dailyStatsLoading, setDailyStatsLoading] = useState(false);

  // ✅ حالة تعديل العمولة
  const [editingCommissionGarageId, setEditingCommissionGarageId] = useState<string | null>(null);
  const [editCommissionRate, setEditCommissionRate] = useState(10);

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

  const fetchDailyStats = useCallback(async () => {
    setDailyStatsLoading(true);
    try {
      let q = supabase.from('daily_stats').select('*').order('stat_date', { ascending: false });
      if (dateFrom) q = q.gte('stat_date', dateFrom);
      if (dateTo) q = q.lte('stat_date', dateTo);
      if (!dateFrom && !dateTo) q = q.gte('stat_date', getLocalDaysAgo(90));
      const { data, error } = await q;
      if (error) { console.error('❌', error); return; }
      setDailyStats(data ?? []);
    } catch (e) { console.error('❌', e); }
    finally { setDailyStatsLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { const i = setInterval(() => setTick(t => t + 1), 60000); return () => clearInterval(i); }, []);
  useEffect(() => { fetchDailyStats(); }, [fetchDailyStats]);

  const totalRevenueFromStats = useMemo(() => dailyStats.reduce((a, s) => a + Number(s.confirmed_revenue ?? 0), 0), [dailyStats]);
  const pendingRevenueFromStats = useMemo(() => dailyStats.reduce((a, s) => a + Number(s.pending_revenue ?? 0), 0), [dailyStats]);
  const totalSessionsFromStats = useMemo(() => dailyStats.reduce((a, s) => a + Number(s.total_sessions ?? 0), 0), [dailyStats]);

  const completedSessions = sessions.filter(s => s.status === 'completed');
  const filteredSessions = useMemo(() => completedSessions.filter(s => {
    const t = getSessionTime(s.endTime); if (!t) return false;
    if (dateFrom && t < getLocalDayStartMs(dateFrom)) return false;
    if (dateTo && t > getLocalDayEndMs(dateTo)) return false;
    return true;
  }), [completedSessions, dateFrom, dateTo]);

  const getRevenue = (s: any) => {
    if (s.totalPrice != null && Number(s.totalPrice) > 0) return Number(s.totalPrice);
    if (s.endTime && s.startTime) {
      const st = typeof s.startTime === 'number' ? s.startTime : new Date(s.startTime).getTime();
      const en = typeof s.endTime === 'number' ? s.endTime : new Date(s.endTime).getTime();
      const g = garages.find((ga: any) => ga.id === s.garageId);
      return calculateCost(Math.max(0, Math.floor((en - st) / 1000)), Number(s.agreedPrice ?? g?.basePrice ?? 0));
    }
    return 0;
  };

  // ✅ حساب العمولة لجلسة
const getCommission = useCallback((s: any) => {
  if (s.source !== 'app') return 0;
  const rev = getRevenue(s);
  if (rev <= 0) return 0;
  const g = garages.find((ga: any) => ga.id === s.garageId);
  const rate = g?.commissionRate ?? 10;
  const commission = (rev * rate) / 100;
  return Math.round(commission * 100) / 100;
}, [garages, getRevenue]);

  // ✅ إحصائيات العمولة الإجمالية
  const commissionStats = useMemo(() => {
    const confirmed = filteredSessions.filter(s => s.revenueConfirmed);
    const totalCommission = confirmed.reduce((a, s) => a + getCommission(s), 0);
    const totalRevenue = confirmed.reduce((a, s) => a + getRevenue(s), 0);
    const totalNet = totalRevenue - totalCommission;

    // ✅ تقرير العمولة لكل جراج
    const perGarage = garages.map(g => {
      const gs = confirmed.filter(s => s.garageId === g.id);
      const appSessions = gs.filter(s => s.source === 'app');
      const gCommission = appSessions.reduce((a, s) => a + getCommission(s), 0);
      const gRevenue = gs.reduce((a, s) => a + getRevenue(s), 0);
      return {
        id: g.id,
        name: g.name,
        commissionRate: g.commissionRate,
        totalRevenue: gRevenue,
        commission: gCommission,
        netRevenue: gRevenue - gCommission,
        appCount: appSessions.length,
        totalCount: gs.length,
      };
    }).filter(g => g.totalCount > 0);

    return { totalCommission, totalRevenue, totalNet, perGarage };
  }, [filteredSessions, garages, getRevenue, getCommission]);

  const garageReportFromStats = useMemo(() => garages.map(g => {
    const gs = dailyStats.filter(s => s.garage_id === g.id);
    return {
      name: g.name, garageId: g.id, commissionRate: g.commissionRate,
      count: gs.reduce((a, s) => a + Number(s.total_sessions ?? 0), 0),
      revenue: gs.reduce((a, s) => a + Number(s.confirmed_revenue ?? 0), 0),
      pendingRevenue: gs.reduce((a, s) => a + Number(s.pending_revenue ?? 0), 0),
      cash: gs.reduce((a, s) => a + Number(s.cash_revenue ?? 0), 0),
      instapay: gs.reduce((a, s) => a + Number(s.instapay_revenue ?? 0), 0),
      wallet: gs.reduce((a, s) => a + Number(s.wallet_revenue ?? 0), 0),
      cashwallet: gs.reduce((a, s) => a + Number(s.cashwallet_revenue ?? 0), 0),
    };
  }), [garages, dailyStats]);

  const pendingRevenueCount = useMemo(() => filteredSessions.filter(s => !s.revenueConfirmed).length, [filteredSessions]);
  const pendingTopUps = walletTopUps.filter(w => w.status === 'pending');

  const displayedRevenueSessions = useMemo(() => {
    let f = filteredSessions;
    if (revenueFilter === 'confirmed') f = f.filter(s => s.revenueConfirmed);
    else if (revenueFilter === 'pending') f = f.filter(s => !s.revenueConfirmed);
    if (sessionSearch.trim()) { const sn = sessionSearch.trim().toUpperCase(); f = f.filter(s => (s.carPlate ?? '').toUpperCase().includes(sn)); }
    return f;
  }, [filteredSessions, revenueFilter, sessionSearch]);

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

  // ✅ حفظ تعديل العمولة
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

      {/* ══════ Date Filter ══════ */}
      <div className="text-center mb-6" style={{ background: '#fff', border: '2px solid #D0DCFF', borderRadius: 28, padding: 20, boxShadow: '0 4px 20px rgba(0,102,255,0.06)' }}>
        <h3 className="font-black mb-3" style={{ fontSize: 13, color: '#7B8CA6' }}>📅 تصفية حسب التاريخ</h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          {[{ label: 'من', value: dateFrom, set: setDateFrom }, { label: 'إلى', value: dateTo, set: setDateTo }].map(d => (
            <div key={d.label}>
              <label className="font-bold block mb-1" style={{ fontSize: 10, color: '#94a3b8' }}>{d.label}</label>
              <input type="date" value={d.value} onChange={e => d.set(e.target.value)} className="w-full font-bold outline-none"
                style={{ background: '#F0F4FF', border: '2px solid #D0DCFF', padding: 14, borderRadius: 16, fontSize: 12, color: '#0A1628' }} />
            </div>
          ))}
        </div>
        <div className="flex gap-2 justify-center flex-wrap">
          {[
            { label: '📅 اليوم', onClick: setToday, bg: '#0066FF', shadow: 'rgba(0,102,255,0.3)', color: '#fff' },
            { label: 'أمس', onClick: () => { setDateFrom(getLocalYesterday()); setDateTo(getLocalYesterday()); }, bg: '#F0F4FF', shadow: 'none', color: '#475569' },
            { label: 'آخر أسبوع', onClick: () => { setDateFrom(getLocalDaysAgo(7)); setDateTo(getLocalToday()); }, bg: '#F0F4FF', shadow: 'none', color: '#475569' },
            { label: 'الكل', onClick: () => { setDateFrom(''); setDateTo(''); }, bg: '#F0F4FF', shadow: 'none', color: '#475569' },
          ].map(b => (
            <button key={b.label} onClick={b.onClick} className="font-black active:scale-95 transition-all"
              style={{ background: b.bg, color: b.color, padding: '10px 18px', borderRadius: 14, fontSize: 11, boxShadow: `0 4px 16px ${b.shadow}`, border: b.bg === '#F0F4FF' ? '2px solid #D0DCFF' : 'none' }}>
              {b.label}
            </button>
          ))}
        </div>
        {(dateFrom || dateTo) && (
          <div className="mt-3" style={{ background: '#EBF2FF', borderRadius: 16, padding: '10px 14px', border: '2px solid #D0DCFF' }}>
            <p className="font-bold" style={{ fontSize: 11, color: '#0066FF' }}>
              {dateFrom && dateTo ? dateFrom === dateTo ? `📅 ${formatLocalDateArabic(dateFrom)}` : `من ${dateFrom} إلى ${dateTo}` : dateFrom ? `من ${dateFrom}` : `إلى ${dateTo}`}
            </p>
            <p style={{ fontSize: 9, color: '#7B8CA6', marginTop: 2 }}>⏰ من 12:00 صباحاً إلى 11:59 مساءً</p>
          </div>
        )}
      </div>

      {/* ══════ Revenue Stats ══════ */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="text-center" style={{ background: 'linear-gradient(135deg,#0066FF,#4D00FF)', borderRadius: 26, padding: '22px 16px', color: '#fff', boxShadow: '0 8px 32px rgba(0,102,255,0.35)' }}>
          <div className="font-bold mb-1" style={{ fontSize: 11, opacity: 0.8 }}>الإيرادات المؤكدة {dailyStatsLoading && '⏳'}</div>
          <div className="font-black font-mono" style={{ fontSize: 32 }}>{totalRevenueFromStats.toFixed(0)} <span style={{ fontSize: 12, opacity: 0.7 }}>ج.م</span></div>
        </div>
        <div className="text-center" style={{ background: 'linear-gradient(135deg,#00CC66,#00AA55)', borderRadius: 26, padding: '22px 16px', color: '#fff', boxShadow: '0 8px 32px rgba(0,204,102,0.3)' }}>
          <div className="font-bold mb-1" style={{ fontSize: 11, opacity: 0.8 }}>إجمالي العمليات</div>
          <div className="font-black font-mono" style={{ fontSize: 32 }}>{totalSessionsFromStats}</div>
        </div>
      </div>

      {/* ✅ كارت العمولة الإجمالية */}
  {commissionStats.totalCommission > 0 && (
  <div className="flex items-center gap-2 mb-5" style={{ background: '#fff', borderRadius: 18, padding: '10px 14px', border: '2px solid #FFD180' }}>
    <div className="flex items-center gap-1.5 flex-1 justify-end">
      <span className="font-bold" style={{ fontSize: 10, color: '#7B8CA6' }}>إجمالي</span>
      <span className="font-black font-mono" style={{ fontSize: 13, color: '#0A1628' }}>{commissionStats.totalRevenue.toFixed(0)}</span>
    </div>
    <div style={{ width: 1, height: 16, background: '#D0DCFF' }} />
    <div className="flex items-center gap-1.5">
      <span className="font-black font-mono" style={{ fontSize: 13, color: '#FF9500' }}>{commissionStats.totalCommission.toFixed(0)}</span>
      <span className="font-bold flex items-center gap-0.5" style={{ fontSize: 10, color: '#FF9500' }}><Percent size={10} /> عمولة</span>
    </div>
    <div style={{ width: 1, height: 16, background: '#D0DCFF' }} />
    <div className="flex items-center gap-1.5">
      <span className="font-black font-mono" style={{ fontSize: 13, color: '#00AA44' }}>{commissionStats.totalNet.toFixed(0)}</span>
      <span className="font-bold" style={{ fontSize: 10, color: '#00AA44' }}>صافي</span>
    </div>
  </div>
)}

      {/* ══════ Pending Revenue Banner ══════ */}
      {(pendingRevenueFromStats > 0 || pendingRevenueCount > 0) && (
        <div className="mb-5 flex items-center justify-between" style={{ background: 'linear-gradient(135deg,#FF9500,#FF7700)', borderRadius: 22, padding: '16px 20px', color: '#fff', boxShadow: '0 6px 24px rgba(255,149,0,0.3)' }}>
          <div className="text-right">
            <h3 className="font-black" style={{ fontSize: 14 }}>⏳ إيرادات معلقة ({pendingRevenueCount})</h3>
            <p style={{ fontSize: 10, opacity: 0.8 }}>تحتاج تأكيد</p>
          </div>
          <div className="font-black font-mono" style={{ fontSize: 24 }}>{pendingRevenueFromStats.toFixed(0)} <span style={{ fontSize: 12 }}>ج.م</span></div>
        </div>
      )}

      {/* ✅ تقرير العمولة لكل جراج */}
{commissionStats.perGarage.length > 0 && (
  <div className="mb-5">
    <div className="flex items-center gap-2 mb-2 justify-end">
      <Percent size={13} style={{ color: '#FF9500' }} />
      <span className="font-black" style={{ fontSize: 12, color: '#334155' }}>العمولات</span>
    </div>
    <div className="overflow-x-auto" style={{ background: '#fff', borderRadius: 18, border: '2px solid #FFD180' }}>
      <table className="w-full text-center" style={{ minWidth: 380 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #FFF0E0' }}>
            {['الجراج', '%', 'إجمالي', 'عمولة', 'صافي'].map((h, i) => (
              <th key={i} className="font-black" style={{ padding: '10px 6px', fontSize: 9, color: i === 3 ? '#FF9500' : i === 4 ? '#00AA44' : '#7B8CA6', textAlign: i === 0 ? 'right' : 'center' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {commissionStats.perGarage.map(g => (
            <tr key={g.id} style={{ borderBottom: '1px solid #FFF8F0' }}>
              <td className="font-black text-right" style={{ padding: '8px 10px', fontSize: 11, color: '#0A1628' }}>{g.name}</td>
              <td className="font-black font-mono" style={{ padding: '8px 4px', fontSize: 11, color: '#FF9500' }}>{g.commissionRate}%</td>
              <td className="font-mono" style={{ padding: '8px 4px', fontSize: 11, color: '#0A1628' }}>{g.totalRevenue.toFixed(0)}</td>
              <td className="font-black font-mono" style={{ padding: '8px 4px', fontSize: 11, color: '#FF9500' }}>{g.commission.toFixed(0)}</td>
              <td className="font-black font-mono" style={{ padding: '8px 4px', fontSize: 11, color: '#00AA44' }}>{g.netRevenue.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}      
{/* ══════ Daily Stats Table ══════ */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <span className="font-bold" style={{ fontSize: 11, background: '#fff', padding: '6px 14px', borderRadius: 12, border: '2px solid #D0DCFF', color: '#7B8CA6' }}>{dailyStats.length} يوم</span>
          <h3 className="font-black flex items-center gap-2" style={{ fontSize: 16, color: '#334155' }}>
            تقرير الإيرادات {dailyStatsLoading && <span style={{ fontSize: 11, color: '#94a3b8' }}>⏳</span>}
          </h3>
        </div>
        <div className="overflow-x-auto" style={{ background: '#fff', borderRadius: 22, border: '2px solid #D0DCFF', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
          <table className="w-full text-right" style={{ minWidth: 620 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #F0F4FF' }}>
                {[{ t: 'الجراج', c: '#7B8CA6' }, { t: 'المؤكد', c: '#0A1628' }, { t: 'عمولة%', c: '#FF9500' }, { t: 'معلق', c: '#FF9500' }, { t: 'نقدي', c: '#00CC66' }, { t: 'إنستاباي', c: '#7C3AED' }, { t: 'محفظة', c: '#0066FF' }, { t: 'كاش', c: '#FF8800' }].map((h, i) => (
                  <th key={i} className="font-black" style={{ padding: 14, fontSize: 10, color: h.c, textAlign: i === 0 ? 'right' : 'center' }}>{h.t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {garageReportFromStats.map(r => (
                <tr key={r.garageId} style={{ borderBottom: '1px solid #F0F4FF' }}>
                  <td style={{ padding: 14 }}>
                    <div className="font-black" style={{ fontSize: 13, color: '#0A1628' }}>{r.name}</div>
                    <div style={{ fontSize: 9, color: '#94a3b8' }}>{r.count} جلسة</div>
                  </td>
                  <td className="font-black font-mono text-center" style={{ fontSize: 13, color: '#0A1628', background: '#F8FAFF', padding: 14 }}>{r.revenue.toFixed(0)}ج</td>
                  <td className="font-black font-mono text-center" style={{ fontSize: 12, color: '#FF9500', padding: 14 }}>{r.commissionRate}%</td>
                  <td className="font-mono text-center" style={{ fontSize: 12, color: '#FF9500', padding: 14 }}>{r.pendingRevenue > 0 ? `${r.pendingRevenue.toFixed(0)}ج` : <span style={{ color: '#D0DCFF' }}>—</span>}</td>
                  <td className="font-mono text-center" style={{ fontSize: 12, color: '#00AA44', padding: 14 }}>{r.cash.toFixed(0)}</td>
                  <td className="font-mono text-center" style={{ fontSize: 12, color: '#7C3AED', padding: 14 }}>{r.instapay.toFixed(0)}</td>
                  <td className="font-mono text-center" style={{ fontSize: 12, color: '#0066FF', padding: 14 }}>{r.wallet.toFixed(0)}</td>
                  <td className="font-mono text-center" style={{ fontSize: 12, color: '#FF8800', padding: 14 }}>{r.cashwallet.toFixed(0)}</td>
                </tr>
              ))}
              {garageReportFromStats.length === 0 && (
                <tr><td colSpan={8} className="text-center" style={{ padding: 28, fontSize: 13, color: '#94a3b8' }}>{dailyStatsLoading ? '⏳ جاري التحميل...' : 'لا توجد بيانات'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
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
              return (
                <div key={session.id} style={{ background: isDel ? '#FFF0F0' : session.revenueConfirmed ? '#F0FFF5' : '#FFFAF0', border: `2.5px solid ${isDel ? '#FF6666' : session.revenueConfirmed ? '#66DDAA' : '#FFD180'}`, borderRadius: 22, padding: 16 }}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-black" style={{ fontSize: 16, color: session.revenueConfirmed ? '#00AA44' : '#E65100' }}>{rev.toFixed(0)} ج.م</span>
                      {[
                        { show: true, bg: session.source === 'manual' ? '#FF9500' : '#0066FF', text: session.source === 'manual' ? 'يدوي' : 'تطبيق' },
                        { show: !!session.paymentMethod, bg: session.paymentMethod === 'cash' ? '#00CC66' : session.paymentMethod === 'instapay' ? '#7C3AED' : session.paymentMethod === 'wallet' ? '#0066FF' : '#FF8800', text: session.paymentMethod === 'cash' ? '💵 نقدي' : session.paymentMethod === 'instapay' ? '📱 إنستا' : session.paymentMethod === 'wallet' ? '👝 محفظة' : '📲 كاش' },
                        { show: true, bg: session.revenueConfirmed ? '#00CC66' : '#FF9500', text: session.revenueConfirmed ? '✅ مؤكد' : '⏳ معلق' },
                      ].filter(b => b.show).map((b, i) => (
                        <span key={i} className="font-bold" style={{ fontSize: 9, padding: '4px 10px', borderRadius: 12, background: b.bg, color: '#fff' }}>{b.text}</span>
                      ))}
                    </div>
                    <div className="text-right">
                      <div className="font-black" style={{ fontSize: 14, color: '#0A1628' }}>🚗 {session.carPlate}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{g?.name || '—'}</div>
                    </div>
                  </div>

                  {/* ✅ سطر العمولة والصافي */}
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
                        <button onClick={async () => { await removeSession(session.id); setDeleteConfirmId(null); await fetchDailyStats(); toast.success('تم الحذف 🗑️'); }} className="flex-1 font-black active:scale-95"
                          style={{ background: '#FF3333', color: '#fff', padding: 12, borderRadius: 14, fontSize: 12 }}>🗑️ تأكيد</button>
                        <button onClick={() => setDeleteConfirmId(null)} className="flex-1 font-black active:scale-95"
                          style={{ background: '#F0F4FF', color: '#475569', padding: 12, borderRadius: 14, fontSize: 12, border: '2px solid #D0DCFF' }}>إلغاء</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {session.revenueConfirmed ? (
                        <button onClick={async () => { await unconfirmRevenue(session.id); await fetchDailyStats(); toast('إلغاء ↩️', { icon: '⏳' }); }} className="flex-1 font-black active:scale-95"
                          style={{ background: '#FF9500', color: '#fff', padding: 10, borderRadius: 14, fontSize: 11 }}>↩️ إلغاء التأكيد</button>
                      ) : (
                        <button onClick={async () => { await confirmRevenue(session.id); await fetchDailyStats(); toast.success('تأكيد ✅'); }} className="flex-1 font-black active:scale-95"
                          style={{ background: '#00CC66', color: '#fff', padding: 10, borderRadius: 14, fontSize: 11 }}>✅ تأكيد الإيراد</button>
                      )}
                      <button onClick={() => setDeleteConfirmId(session.id)} className="font-black active:scale-95"
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
            <div key={w.id} style={{ background: '#fff', border: '2.5px solid #FFD180', borderRadius: 26, padding: 20, boxShadow: '0 4px 20px rgba(255,149,0,0.1)' }}>
              <div className="flex justify-between items-center mb-3">
                <span className="font-black" style={{ fontSize: 10, padding: '5px 14px', borderRadius: 14, background: w.method === 'instapay' ? '#7C3AED' : '#FF8800', color: '#fff' }}>
                  {w.method === 'instapay' ? '📱 إنستاباي' : '📲 محفظة كاش'}
                </span>
                <span className="font-bold" style={{ fontSize: 10, color: '#94a3b8' }}>{new Date(w.timestamp).toLocaleDateString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="font-black font-mono mb-3" style={{ fontSize: 36, color: '#0A1628' }}>{w.amount} <span style={{ fontSize: 14, color: '#94a3b8' }}>ج.م</span></div>
              <div className="mb-3 space-y-2" style={{ background: '#F0F4FF', borderRadius: 20, padding: 14, border: '1px solid #D0DCFF' }}>
                {w.userName && <div className="flex justify-between"><span className="font-black" style={{ fontSize: 14, color: '#0A1628' }}>{w.userName}</span><span style={{ fontSize: 11, color: '#94a3b8' }}>👤</span></div>}
                {w.userPhone && <div className="flex justify-between"><span className="font-black font-mono" style={{ fontSize: 14, color: '#0066FF' }}>{w.userPhone}</span><span style={{ fontSize: 11, color: '#94a3b8' }}>📞</span></div>}
                {w.carPlate && <div className="flex justify-between"><span className="font-black" style={{ fontSize: 14, color: '#E65100' }}>{w.carPlate}</span><span style={{ fontSize: 11, color: '#94a3b8' }}>🚗</span></div>}
              </div>
              <div className="font-mono mb-3" style={{ background: '#F0F4FF', padding: 10, borderRadius: 12, border: '1px solid #D0DCFF', fontSize: 10, color: '#94a3b8' }}>مرجع: {w.transactionId}</div>
              <div className="flex gap-2">
                <button onClick={() => { approveTopUp(w.id); toast.success(`اعتماد ${w.amount} ج.م ✅`); }} className="flex-1 font-black flex items-center justify-center gap-2 active:scale-95"
                  style={{ background: 'linear-gradient(135deg,#00CC66,#00AA55)', color: '#fff', padding: 16, borderRadius: 18, fontSize: 14, boxShadow: '0 6px 24px rgba(0,204,102,0.35)' }}><CheckCircle size={20} />اعتماد</button>
                <button onClick={() => { rejectTopUp(w.id); toast.error('تم الرفض'); }} className="font-black flex items-center justify-center active:scale-95"
                  style={{ background: 'linear-gradient(135deg,#FF3333,#CC0000)', color: '#fff', padding: '0 20px', borderRadius: 18, boxShadow: '0 4px 16px rgba(255,51,51,0.3)' }}><XCircle size={20} /></button>
              </div>
            </div>
          ))}
          {pendingTopUps.length === 0 && (
            <div className="text-center" style={{ background: '#fff', borderRadius: 24, padding: 28, border: '2px solid #D0DCFF', color: '#94a3b8', fontSize: 14 }}>لا توجد اعتمادات</div>
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
                          style={{ background: '#F0F4FF', color: '#475569', padding: '14px 20px', borderRadius: 18, fontSize: 13, border: '2px solid #D0DCFF' }}>إغلاق</button>
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
        <div className="space-y-3">
          {garages.map(g => {
            const isEditingComm = editingCommissionGarageId === g.id;
            return (
              <div key={g.id} style={{ background: '#fff', border: '2.5px solid #D0DCFF', borderRadius: 28, padding: 22, boxShadow: '0 4px 20px rgba(0,102,255,0.06)' }}>
                <div className="flex justify-between mb-3">
                  <div className="text-center" style={{ background: 'linear-gradient(135deg,#0066FF,#4D00FF)', borderRadius: 20, padding: '14px 20px', color: '#fff', minWidth: 70, boxShadow: '0 6px 20px rgba(0,102,255,0.3)' }}>
                    <div className="font-black font-mono" style={{ fontSize: 24 }}>{g.availableSpots}</div>
                    <div className="font-bold" style={{ fontSize: 9, opacity: 0.8 }}>شاغر</div>
                  </div>
                  <div className="text-right">
                    <div className="font-black mb-1" style={{ fontSize: 18, color: '#0A1628' }}>{g.name}</div>
                    <div className="flex items-center gap-1 justify-end mb-1" style={{ fontSize: 11, color: '#94a3b8' }}><MapPin size={12} />{g.location}</div>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {[
                        { n: 1, name: (g as any).valetName1, pw: (g as any).valetPassword1, color: '#0066FF' },
                        { n: 2, name: (g as any).valetName2, pw: (g as any).valetPassword2, color: '#7C3AED' },
                        { n: 3, name: (g as any).valetName3, pw: (g as any).valetPassword3, color: '#FF8800' },
                      ].filter(v => v.pw).map(v => (
                        <span key={v.n} className="font-bold flex items-center gap-1" style={{ fontSize: 9, color: v.color, background: `${v.color}15`, padding: '2px 8px', borderRadius: 8 }}>
                          <HardHat size={8} /> {v.name || `سايس ${v.n}`}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ✅ تعديل نسبة العمولة */}
{/* ✅ تعديل نسبة العمولة - بوكس أصغر */}
<div
  className="mb-3"
  style={{
    background: '#FFF8F0',
    borderRadius: 14,
    padding: '10px 12px',
    border: '1.5px solid #FFD180',
  }}
>
  <div className="flex items-center justify-between gap-2">
    <div className="flex items-center gap-2">
      {!isEditingComm ? (
        <button
          onClick={() => {
            setEditingCommissionGarageId(g.id);
            setEditCommissionRate(g.commissionRate);
          }}
          className="font-black active:scale-95"
          style={{
            background: '#FF9500',
            color: '#fff',
            padding: '5px 10px',
            borderRadius: 10,
            fontSize: 9,
          }}
        >
          ✏️ تعديل
        </button>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleSaveCommission(g.id)}
            className="font-black active:scale-95"
            style={{
              background: '#00CC66',
              color: '#fff',
              padding: '5px 10px',
              borderRadius: 10,
              fontSize: 9,
            }}
          >
            حفظ
          </button>
          <button
            onClick={() => setEditingCommissionGarageId(null)}
            className="font-black active:scale-95"
            style={{
              background: '#F0F4FF',
              color: '#475569',
              padding: '5px 10px',
              borderRadius: 10,
              fontSize: 9,
              border: '1px solid #D0DCFF',
            }}
          >
            إلغاء
          </button>
        </div>
      )}
    </div>

    <div className="flex items-center gap-1.5">
      <Percent size={12} style={{ color: '#FF9500' }} />
      <span className="font-black font-mono" style={{ fontSize: 16, color: '#FF9500' }}>
        {isEditingComm ? editCommissionRate : g.commissionRate}%
      </span>
      <span className="font-bold" style={{ fontSize: 9, color: '#7B8CA6' }}>
        عمولة التطبيق
      </span>
    </div>
  </div>

  {isEditingComm && (
    <div className="flex items-center justify-center gap-2 mt-2">
      <button
        onClick={() => setEditCommissionRate(r => Math.max(0, r - 1))}
        className="active:scale-90"
        style={{
          background: '#FF3333',
          color: '#fff',
          width: 30,
          height: 30,
          borderRadius: 9,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Minus size={14} />
      </button>

      <input
        type="number"
        value={editCommissionRate}
        onChange={e => setEditCommissionRate(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
        className="bg-transparent text-center outline-none font-mono font-black"
        style={{
          width: 54,
          fontSize: 18,
          color: '#FF9500',
          background: '#fff',
          border: '1.5px solid #FFD180',
          borderRadius: 10,
          padding: '4px 0',
        }}
      />

      <button
        onClick={() => setEditCommissionRate(r => Math.min(100, r + 1))}
        className="active:scale-90"
        style={{
          background: '#00CC66',
          color: '#fff',
          width: 30,
          height: 30,
          borderRadius: 9,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Plus size={14} />
      </button>
    </div>
  )}
</div>

                <button
                  onClick={() => handleAdminEnterGarage(g)}
                  className="w-full font-black active:scale-95 transition-all"
                  style={{ background: 'linear-gradient(135deg,#0066FF,#0044DD)', color: '#fff', padding: 16, borderRadius: 18, fontSize: 14, boxShadow: '0 8px 32px rgba(0,102,255,0.35)' }}
                >
                  دخول وإدارة
                </button>
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