import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Shield, Clock, CheckCircle, XCircle, MapPin, Warehouse, Plus,
  MessageCircle, Send, Receipt, Search,
} from 'lucide-react';
import { useStore } from '../store';
import { supabase } from '../lib/supabase';
import { calculateFullHours, calculateCost } from '../utils/pricing';
import toast from 'react-hot-toast';

interface DailyStat {
  garage_id: string; stat_date: string; total_sessions: number; manual_sessions: number;
  app_sessions: number; total_revenue: number; cash_revenue: number; instapay_revenue: number;
  wallet_revenue: number; cashwallet_revenue: number; confirmed_revenue: number; pending_revenue: number;
}

const getLocalToday = (): string => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; };
const getLocalYesterday = (): string => { const d = new Date(); d.setDate(d.getDate()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const getLocalDaysAgo = (days: number): string => { const d = new Date(); d.setDate(d.getDate()-days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const getLocalDayStartMs = (dateStr: string): number => { const [y,m,d] = dateStr.split('-').map(Number); return new Date(y,m-1,d,0,0,0,0).getTime(); };
const getLocalDayEndMs = (dateStr: string): number => { const [y,m,d] = dateStr.split('-').map(Number); return new Date(y,m-1,d,23,59,59,999).getTime(); };
const formatLocalDateArabic = (dateStr: string): string => { const [y,m,d] = dateStr.split('-').map(Number); return new Date(y,m-1,d).toLocaleDateString('ar-EG',{weekday:'long',year:'numeric',month:'long',day:'numeric'}); };
const getSessionTime = (value?: number|string): number|null => { if(!value) return null; return typeof value==='number'? value: new Date(value).getTime(); };

export default function AdminDashboard() {
  const {
    garages, sessions, walletTopUps, approveTopUp, rejectTopUp, addGarage,
    setCurrentGarageId, setView, logout, messages, replyMessage, closeMessage,
    confirmRevenue, unconfirmRevenue, removeSession,
  } = useStore();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [, setTick] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [replyingTo, setReplyingTo] = useState<string|null>(null);
  const [expandedMessage, setExpandedMessage] = useState<string|null>(null);
  const [messagesTab, setMessagesTab] = useState<'pending'|'all'>('pending');
  const [revenueFilter, setRevenueFilter] = useState<'all'|'confirmed'|'pending'>('pending');
  const [sessionSearch, setSessionSearch] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string|null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [dailyStatsLoading, setDailyStatsLoading] = useState(false);
  const [gName, setGName] = useState('');
  const [gUser, setGUser] = useState('');
  const [gPhone, setGPhone] = useState('');
  const [lat, setLat] = useState(30.04);
  const [lng, setLng] = useState(31.23);

  const fetchDailyStats = useCallback(async () => {
    setDailyStatsLoading(true);
    try {
      let query = supabase.from('daily_stats').select('*').order('stat_date',{ascending:false});
      if(dateFrom) query = query.gte('stat_date',dateFrom);
      if(dateTo) query = query.lte('stat_date',dateTo);
      if(!dateFrom && !dateTo) query = query.gte('stat_date',getLocalDaysAgo(90));
      const {data,error} = await query;
      if(error){console.error('❌',error); return;}
      setDailyStats(data ?? []);
    } catch(err){console.error('❌',err);} finally{setDailyStatsLoading(false);}
  },[dateFrom,dateTo]);

  useEffect(()=>{const i=setInterval(()=>setTick(t=>t+1),60000);return()=>clearInterval(i);},[]);
  useEffect(()=>{fetchDailyStats();},[fetchDailyStats]);

  const totalRevenueFromStats = useMemo(()=>dailyStats.reduce((a,s)=>a+Number(s.confirmed_revenue??0),0),[dailyStats]);
  const pendingRevenueFromStats = useMemo(()=>dailyStats.reduce((a,s)=>a+Number(s.pending_revenue??0),0),[dailyStats]);
  const totalSessionsFromStats = useMemo(()=>dailyStats.reduce((a,s)=>a+Number(s.total_sessions??0),0),[dailyStats]);

  const garageReportFromStats = useMemo(()=>{
    return garages.map(g=>{
      const gs=dailyStats.filter(s=>s.garage_id===g.id);
      return {
        name:g.name, garageId:g.id,
        count:gs.reduce((a,s)=>a+Number(s.total_sessions??0),0),
        revenue:gs.reduce((a,s)=>a+Number(s.confirmed_revenue??0),0),
        pendingRevenue:gs.reduce((a,s)=>a+Number(s.pending_revenue??0),0),
        cash:gs.reduce((a,s)=>a+Number(s.cash_revenue??0),0),
        instapay:gs.reduce((a,s)=>a+Number(s.instapay_revenue??0),0),
        wallet:gs.reduce((a,s)=>a+Number(s.wallet_revenue??0),0),
        cashwallet:gs.reduce((a,s)=>a+Number(s.cashwallet_revenue??0),0),
      };
    });
  },[garages,dailyStats]);

  const completedSessions = sessions.filter(s=>s.status==='completed');
  const filteredSessions = useMemo(()=>{
    return completedSessions.filter(s=>{
      const t=getSessionTime(s.endTime); if(!t) return false;
      if(dateFrom && t<getLocalDayStartMs(dateFrom)) return false;
      if(dateTo && t>getLocalDayEndMs(dateTo)) return false;
      return true;
    });
  },[completedSessions,dateFrom,dateTo]);

  const getRevenue=(s:any)=>{
    if(s.totalPrice!=null&&Number(s.totalPrice)>0) return Number(s.totalPrice);
    if(s.endTime&&s.startTime){
      const start=typeof s.startTime==='number'?s.startTime:new Date(s.startTime).getTime();
      const end=typeof s.endTime==='number'?s.endTime:new Date(s.endTime).getTime();
      const elapsed=Math.max(0,Math.floor((end-start)/1000));
      const g=garages.find((ga:any)=>ga.id===s.garageId);
      return calculateCost(elapsed,Number(s.agreedPrice??g?.basePrice??0));
    }
    return 0;
  };

  const pendingRevenueCount = useMemo(()=>filteredSessions.filter(s=>!s.revenueConfirmed).length,[filteredSessions]);
  const pendingTopUps = walletTopUps.filter(w=>w.status==='pending');
  const activeSessions = sessions.filter(s=>s.status==='active');

  const displayedRevenueSessions = useMemo(()=>{
    let f=filteredSessions;
    if(revenueFilter==='confirmed') f=f.filter(s=>s.revenueConfirmed);
    else if(revenueFilter==='pending') f=f.filter(s=>!s.revenueConfirmed);
    if(sessionSearch.trim()){const sn=sessionSearch.trim().toUpperCase(); f=f.filter(s=>(s.carPlate??'').toUpperCase().includes(sn));}
    return f;
  },[filteredSessions,revenueFilter,sessionSearch]);

  const safeMessages = messages??[];
  const pendingMessages = safeMessages.filter(m=>m.status==='pending');
  const allMessages = [...safeMessages].sort((a,b)=>b.timestamp-a.timestamp);
  const displayedMessages = messagesTab==='pending'?pendingMessages:allMessages;

  const getTypeEmoji=(t:string)=>{switch(t){case 'complaint':return '🚨';case 'inquiry':return '❓';case 'suggestion':return '💡';case 'technical':return '🔧';default:return '💬';}};
  const getTypeLabel=(t:string)=>{switch(t){case 'complaint':return 'شكوى';case 'inquiry':return 'استفسار';case 'suggestion':return 'اقتراح';case 'technical':return 'مشكلة تقنية';default:return 'رسالة';}};
  const formatMsgTime=(ts:number)=>new Date(ts).toLocaleDateString('ar-EG',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  const setToday=()=>{const t=getLocalToday();setDateFrom(t);setDateTo(t);};

  return (
    <div className="h-full bg-slate-50 p-5 overflow-y-auto pt-16" style={{ color: '#0f172a' }}>

      {/* ── Header ──────────────────────────── */}
      <div className="flex justify-between items-center mb-6 border-b border-slate-200 pb-4">
        <button
          onClick={() => { localStorage.removeItem('adminSession'); logout(); }}
          className="bg-red-600 text-white px-4 py-2 rounded-xl text-[10px] font-black active:scale-95 transition-all shadow-md shadow-red-200"
        >
          تسجيل خروج
        </button>
        <h2 className="text-xl font-black flex items-center gap-2" style={{ color: '#7c3aed' }}>
          لوحة المشرف العام
          <Shield size={20} />
        </h2>
        <div className="bg-white border border-slate-200 p-2 rounded-xl text-[10px] shadow-sm" style={{ color: '#64748b' }}>
          {sessions.length} عملية
        </div>
      </div>

      {/* ── Date Filter ─────────────────────── */}
      <div className="bg-white border border-slate-200 p-4 rounded-[2rem] mb-6 text-center shadow-sm">
        <h3 className="text-xs font-black mb-3" style={{ color: '#64748b' }}>تصفية حسب التاريخ</h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[9px] font-bold block mb-1" style={{ color: '#94a3b8' }}>من</label>
            <input type="date" value={dateFrom} onChange={(e)=>setDateFrom(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-[10px] font-bold outline-none" style={{ color: '#0f172a' }} />
          </div>
          <div>
            <label className="text-[9px] font-bold block mb-1" style={{ color: '#94a3b8' }}>إلى</label>
            <input type="date" value={dateTo} onChange={(e)=>setDateTo(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-[10px] font-bold outline-none" style={{ color: '#0f172a' }} />
          </div>
        </div>
        <div className="flex gap-2 justify-center">
          <button onClick={setToday} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black active:scale-95 transition-all shadow-md shadow-blue-200">📅 اليوم</button>
          <button onClick={()=>{setDateFrom(getLocalYesterday());setDateTo(getLocalYesterday());}} className="bg-slate-200 px-4 py-2 rounded-xl text-[10px] font-black active:scale-95 transition-all" style={{color:'#475569'}}>أمس</button>
          <button onClick={()=>{setDateFrom(getLocalDaysAgo(7));setDateTo(getLocalToday());}} className="bg-slate-200 px-4 py-2 rounded-xl text-[10px] font-black active:scale-95 transition-all" style={{color:'#475569'}}>آخر أسبوع</button>
          <button onClick={()=>{setDateFrom('');setDateTo('');}} className="bg-slate-200 px-4 py-2 rounded-xl text-[10px] font-black active:scale-95 transition-all" style={{color:'#475569'}}>الكل</button>
        </div>
        {(dateFrom||dateTo) && (
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-2 text-center">
            <p className="text-[9px] font-bold" style={{color:'#1d4ed8'}}>
              {dateFrom&&dateTo ? dateFrom===dateTo ? `📅 ${formatLocalDateArabic(dateFrom)}` : `من ${dateFrom} إلى ${dateTo}` : dateFrom ? `من ${dateFrom}` : `إلى ${dateTo}`}
            </p>
            <p className="text-[8px] mt-0.5" style={{color:'#93c5fd'}}>⏰ من 12:00 صباحاً إلى 11:59 مساءً</p>
          </div>
        )}
      </div>

      {/* ── Revenue Stats ───────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-5 rounded-[2rem] shadow-xl shadow-blue-200" style={{color:'#ffffff'}}>
          <div className="text-[10px] font-bold mb-1 opacity-80">
            الإيرادات المؤكدة {dailyStatsLoading && <span className="opacity-60">⏳</span>}
          </div>
          <div className="text-3xl font-black font-mono tracking-tighter">
            {totalRevenueFromStats.toFixed(0)} <span className="text-xs opacity-80">ج.م</span>
          </div>
        </div>
        <div className="bg-emerald-600 p-5 rounded-[2rem] shadow-xl shadow-emerald-200" style={{color:'#ffffff'}}>
          <div className="text-[10px] font-bold mb-1 opacity-80">إجمالي العمليات</div>
          <div className="text-3xl font-black font-mono tracking-tighter">{totalSessionsFromStats}</div>
        </div>
      </div>

      {/* ── Pending Revenue Banner ──────────── */}
      {(pendingRevenueFromStats>0||pendingRevenueCount>0) && (
        <div className="bg-amber-500 rounded-2xl p-4 mb-6 shadow-lg shadow-amber-200" style={{color:'#ffffff'}}>
          <div className="flex justify-between items-center">
            <div className="text-right">
              <h3 className="text-sm font-black">⏳ إيرادات معلقة ({pendingRevenueCount})</h3>
              <p className="text-[10px] opacity-80">تحتاج تأكيد من أصحاب الجراجات</p>
            </div>
            <div className="text-xl font-black font-mono">{pendingRevenueFromStats.toFixed(0)} <span className="text-xs">ج.م</span></div>
          </div>
        </div>
      )}

      {/* ── Daily Stats Table ───────────────── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-sm" style={{color:'#64748b'}}>{dailyStats.length} يوم</span>
          <h3 className="font-black text-lg flex items-center gap-2" style={{color:'#334155'}}>
            تقرير الإيرادات المؤكدة
            {dailyStatsLoading && <span className="text-xs" style={{color:'#94a3b8'}}>جاري التحديث...</span>}
          </h3>
        </div>
        <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
          <table className="w-full text-right min-w-[580px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="p-3 text-[9px] font-black" style={{color:'#64748b'}}>الجراج</th>
                <th className="p-3 text-[9px] font-black text-center" style={{color:'#0f172a'}}>المؤكد</th>
                <th className="p-3 text-[9px] font-black text-center" style={{color:'#d97706'}}>معلق</th>
                <th className="p-3 text-[9px] font-black text-center" style={{color:'#059669'}}>نقدي</th>
                <th className="p-3 text-[9px] font-black text-center" style={{color:'#7c3aed'}}>إنستاباي</th>
                <th className="p-3 text-[9px] font-black text-center" style={{color:'#2563eb'}}>محفظة</th>
                <th className="p-3 text-[9px] font-black text-center" style={{color:'#ea580c'}}>كاش</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {garageReportFromStats.map(r=>(
                <tr key={r.garageId} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3">
                    <div className="text-xs font-black" style={{color:'#0f172a'}}>{r.name}</div>
                    <div className="text-[8px]" style={{color:'#94a3b8'}}>{r.count} جلسة</div>
                  </td>
                  <td className="p-3 text-center text-xs font-mono font-black bg-slate-50/50" style={{color:'#0f172a'}}>{r.revenue.toFixed(0)}ج</td>
                  <td className="p-3 text-center text-xs font-mono" style={{color:'#d97706'}}>{r.pendingRevenue>0?`${r.pendingRevenue.toFixed(0)}ج`:<span style={{color:'#cbd5e1'}}>—</span>}</td>
                  <td className="p-3 text-center text-xs font-mono" style={{color:'#059669'}}>{r.cash.toFixed(0)}</td>
                  <td className="p-3 text-center text-xs font-mono" style={{color:'#7c3aed'}}>{r.instapay.toFixed(0)}</td>
                  <td className="p-3 text-center text-xs font-mono" style={{color:'#2563eb'}}>{r.wallet.toFixed(0)}</td>
                  <td className="p-3 text-center text-xs font-mono" style={{color:'#ea580c'}}>{r.cashwallet.toFixed(0)}</td>
                </tr>
              ))}
              {garageReportFromStats.length===0&&(
                <tr><td colSpan={7} className="p-6 text-center text-xs" style={{color:'#94a3b8'}}>{dailyStatsLoading?'⏳ جاري التحميل...':'لا توجد بيانات'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Revenue Sessions ────────────────── */}
      <div className="mb-8">
        <h3 className="font-black text-lg mb-4 flex items-center gap-2 justify-end" style={{color:'#334155'}}>
          إدارة الجلسات ({filteredSessions.length}) <Receipt size={18} />
        </h3>
        <div className="space-y-3 mb-4">
          <div className="flex gap-2">
            <button onClick={()=>setRevenueFilter('pending')}
              className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all shadow-sm ${revenueFilter==='pending'?'bg-amber-500 text-white shadow-amber-200':'bg-white border border-slate-200'}`}
              style={revenueFilter!=='pending'?{color:'#64748b'}:{}}>
              ⏳ معلق ({filteredSessions.filter(s=>!s.revenueConfirmed).length})
            </button>
            <button onClick={()=>setRevenueFilter('confirmed')}
              className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all shadow-sm ${revenueFilter==='confirmed'?'bg-emerald-600 text-white shadow-emerald-200':'bg-white border border-slate-200'}`}
              style={revenueFilter!=='confirmed'?{color:'#64748b'}:{}}>
              ✅ مؤكد ({filteredSessions.filter(s=>s.revenueConfirmed).length})
            </button>
            <button onClick={()=>setRevenueFilter('all')}
              className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all shadow-sm ${revenueFilter==='all'?'bg-blue-600 text-white shadow-blue-200':'bg-white border border-slate-200'}`}
              style={revenueFilter!=='all'?{color:'#64748b'}:{}}>
              الكل ({filteredSessions.length})
            </button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2" style={{color:'#94a3b8'}} />
            <input type="text" value={sessionSearch} onChange={(e)=>setSessionSearch(e.target.value)} placeholder="ابحث برقم العربية..."
              className="w-full bg-white border border-slate-200 p-2.5 pr-9 rounded-xl text-right font-bold outline-none text-xs shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" style={{color:'#0f172a'}} />
            {sessionSearch&&(<button onClick={()=>setSessionSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2" style={{color:'#94a3b8'}}><XCircle size={14}/></button>)}
          </div>
        </div>

        <div className="space-y-2">
          {displayedRevenueSessions.length===0?(
            <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center shadow-sm">
              <div className="text-3xl mb-3">📭</div>
              <p className="text-sm font-bold" style={{color:'#94a3b8'}}>
                {sessionSearch?`لا توجد نتائج لـ "${sessionSearch}"`:revenueFilter==='pending'?'لا توجد جلسات معلقة':revenueFilter==='confirmed'?'لا توجد جلسات مؤكدة':'لا توجد جلسات'}
              </p>
            </div>
          ):(
            displayedRevenueSessions.map(session=>{
              const g=garages.find((ga:any)=>ga.id===session.garageId);
              const rev=getRevenue(session);
              const endTime=session.endTime?typeof session.endTime==='number'?session.endTime:new Date(session.endTime).getTime():null;
              const time=endTime?new Date(endTime):null;
              const isDeleting=deleteConfirmId===session.id;

              return (
                <div key={session.id} className={`rounded-xl p-3 border-2 shadow-sm ${
                  isDeleting?'bg-red-50 border-red-300':session.revenueConfirmed?'bg-emerald-50 border-emerald-200':'bg-amber-50 border-amber-200'
                }`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono font-black" style={{color:session.revenueConfirmed?'#059669':'#d97706'}}>{rev.toFixed(0)} ج.م</span>
                      <span className={`text-[8px] px-2 py-0.5 rounded-full font-bold text-white ${session.source==='manual'?'bg-amber-500':'bg-blue-600'}`}>
                        {session.source==='manual'?'يدوي':'تطبيق'}
                      </span>
                      {session.paymentMethod&&(
                        <span className={`text-[8px] px-2 py-0.5 rounded-full font-bold text-white ${
                          session.paymentMethod==='cash'?'bg-emerald-600':session.paymentMethod==='instapay'?'bg-purple-600':session.paymentMethod==='wallet'?'bg-blue-600':'bg-orange-600'
                        }`}>
                          {session.paymentMethod==='cash'?'💵 نقدي':session.paymentMethod==='instapay'?'📱 إنستاباي':session.paymentMethod==='wallet'?'👝 محفظة':'📲 كاش'}
                        </span>
                      )}
                      <span className={`text-[8px] px-2 py-0.5 rounded-full font-bold text-white ${session.revenueConfirmed?'bg-emerald-600':'bg-amber-500'}`}>
                        {session.revenueConfirmed?'✅ مؤكد':'⏳ معلق'}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-black" style={{color:'#0f172a'}}>🚗 {session.carPlate}</div>
                      <div className="text-[9px]" style={{color:'#94a3b8'}}>{g?.name||'—'}</div>
                    </div>
                  </div>
                  {time&&(<div className="text-[9px] font-mono mb-2 text-left" style={{color:'#94a3b8'}}>
                    {time.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})} · {time.toLocaleDateString('ar-EG',{month:'short',day:'numeric'})}
                  </div>)}
                  {isDeleting?(
                    <div className="bg-red-100 border border-red-200 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-black text-center" style={{color:'#dc2626'}}>⚠️ حذف نهائياً؟</p>
                      <p className="text-[9px] text-center" style={{color:'#ef4444'}}>🚗 {session.carPlate} · {rev.toFixed(0)} ج.م</p>
                      <div className="flex gap-2">
                        <button onClick={async()=>{await removeSession(session.id);setDeleteConfirmId(null);await fetchDailyStats();toast.success('تم الحذف 🗑️');}}
                          className="flex-1 bg-red-600 text-white py-2 rounded-lg text-[10px] font-black active:scale-95 shadow-md">🗑️ تأكيد</button>
                        <button onClick={()=>setDeleteConfirmId(null)} className="flex-1 bg-slate-200 py-2 rounded-lg text-[10px] font-black active:scale-95" style={{color:'#475569'}}>إلغاء</button>
                      </div>
                    </div>
                  ):(
                    <div className="flex items-center gap-2">
                      {session.revenueConfirmed?(
                        <button onClick={async()=>{await unconfirmRevenue(session.id);await fetchDailyStats();toast('إلغاء التأكيد ↩️',{icon:'⏳'});}}
                          className="flex-1 bg-amber-500 text-white py-1.5 rounded-lg text-[9px] font-black active:scale-95 shadow-sm">↩️ إلغاء التأكيد</button>
                      ):(
                        <button onClick={async()=>{await confirmRevenue(session.id);await fetchDailyStats();toast.success('تم التأكيد ✅');}}
                          className="flex-1 bg-emerald-600 text-white py-1.5 rounded-lg text-[9px] font-black active:scale-95 shadow-sm">✅ تأكيد الإيراد</button>
                      )}
                      <button onClick={()=>setDeleteConfirmId(session.id)} className="bg-red-100 px-3 py-1.5 rounded-lg text-[9px] font-black active:scale-95" style={{color:'#dc2626'}}>🗑️</button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Pending Top-ups ──────────────────── */}
      <div className="mb-8">
        <h3 className="font-black text-lg mb-4 flex items-center gap-2 justify-end" style={{color:'#ea580c'}}>
          اعتمادات معلقة ({pendingTopUps.length}) <Clock size={18} />
        </h3>
        <div className="space-y-3">
          {pendingTopUps.map(w=>(
            <div key={w.id} className="bg-white p-4 rounded-2xl border-2 border-orange-200 shadow-md">
              <div className="flex justify-between items-center mb-3">
                <div className={`text-[9px] font-black p-1 px-3 rounded-full text-white ${w.method==='instapay'?'bg-purple-600':'bg-orange-600'}`}>
                  {w.method==='instapay'?'📱 إنستاباي':'📲 محفظة كاش'}
                </div>
                <div className="text-[9px] font-bold" style={{color:'#94a3b8'}}>{new Date(w.timestamp).toLocaleDateString('ar-EG',{hour:'2-digit',minute:'2-digit'})}</div>
              </div>
              <div className="text-3xl font-black font-mono mb-3" style={{color:'#0f172a'}}>{w.amount} <span className="text-xs" style={{color:'#94a3b8'}}>ج.م</span></div>
              <div className="bg-slate-50 rounded-xl p-3 mb-3 space-y-2 border border-slate-100">
                {w.userName&&(<div className="flex items-center justify-between"><span className="text-sm font-black" style={{color:'#0f172a'}}>{w.userName}</span><span className="text-[10px]" style={{color:'#94a3b8'}}>👤 الاسم</span></div>)}
                {w.userPhone&&(<div className="flex items-center justify-between"><span className="text-sm font-black font-mono" style={{color:'#2563eb'}}>{w.userPhone}</span><span className="text-[10px]" style={{color:'#94a3b8'}}>📞 الهاتف</span></div>)}
                {w.carPlate&&(<div className="flex items-center justify-between"><span className="text-sm font-black" style={{color:'#d97706'}}>{w.carPlate}</span><span className="text-[10px]" style={{color:'#94a3b8'}}>🚗 السيارة</span></div>)}
              </div>
              <div className="text-[9px] font-mono mb-3 bg-slate-50 p-2 rounded-lg border border-slate-100" style={{color:'#94a3b8'}}>مرجع: {w.transactionId}</div>
              <div className="flex gap-2">
                <button onClick={()=>{approveTopUp(w.id);toast.success(`تم اعتماد ${w.amount} ج.م ✅`);}} className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-black text-sm flex items-center justify-center gap-1 active:scale-95 shadow-md shadow-emerald-200"><CheckCircle size={16}/>اعتماد</button>
                <button onClick={()=>{rejectTopUp(w.id);toast.error('تم الرفض');}} className="bg-red-600 text-white px-4 py-3 rounded-xl font-black text-sm flex items-center justify-center active:scale-95 shadow-md"><XCircle size={16}/></button>
              </div>
            </div>
          ))}
          {pendingTopUps.length===0&&(<div className="bg-white border border-slate-200 rounded-2xl p-6 text-center shadow-sm" style={{color:'#94a3b8'}}>لا توجد اعتمادات معلقة</div>)}
        </div>
      </div>

      {/* ── Active Sessions ──────────────────── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-sm" style={{color:'#64748b'}}>{activeSessions.length} جلسة</span>
          <h3 className="font-black text-lg flex items-center gap-2" style={{color:'#059669'}}>الجلسات النشطة <Clock size={18}/></h3>
        </div>
        {activeSessions.length>0&&(
          <div className="grid grid-cols-2 gap-3 mb-4">
            {garages.map(g=>{
              const ga=activeSessions.filter(s=>s.garageId===g.id);
              if(ga.length===0) return null;
              const te=ga.reduce((a,s)=>{const st=typeof s.startTime==='number'?s.startTime:new Date(s.startTime).getTime();const secs=Math.max(0,Math.floor((Date.now()-st)/1000));return a+calculateCost(secs,Number(s.agreedPrice??g.basePrice));},0);
              return (
                <div key={g.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black font-mono" style={{color:'#059669'}}>{ga.length}</span>
                    <span className="text-[10px] font-black" style={{color:'#0f172a'}}>{g.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold" style={{color:'#059669'}}>{te.toFixed(0)} ج.م</span>
                    <span className="text-[9px]" style={{color:'#94a3b8'}}>إيراد متوقع</span>
                  </div>
                </div>
              );
            }).filter(Boolean)}
          </div>
        )}
        <div className="space-y-3">
          {activeSessions.length===0?(
            <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center shadow-sm" style={{color:'#94a3b8'}}>لا توجد جلسات نشطة</div>
          ):(
            activeSessions.map(s=>{
              const g=garages.find((ga:any)=>ga.id===s.garageId);
              const start=typeof s.startTime==='number'?s.startTime:new Date(s.startTime).getTime();
              const el=Math.max(0,Math.floor((Date.now()-start)/1000));
              const mins=Math.floor(el/60); const hrs=calculateFullHours(el);
              const rate=Number(s.agreedPrice??g?.basePrice??0); const cost=calculateCost(el,rate);
              const isM=s.source==='manual';
              return (
                <div key={s.id} className={`p-4 rounded-2xl border-2 shadow-sm ${isM?'bg-amber-50 border-amber-200':'bg-white border-slate-200'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${isM?'bg-amber-500':'bg-emerald-500'}`}/>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold text-white ${isM?'bg-amber-500':'bg-blue-600'}`}>{isM?'يدوي':'تطبيق'}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black" style={{color:'#0f172a'}}>🚗 {s.carPlate}</div>
                      <div className="text-xs" style={{color:'#64748b'}}>{g?.name||'غير معروف'}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      {v:mins,l:'دقيقة',c:'#0f172a'},
                      {v:hrs,l:'ساعة',c:'#2563eb'},
                      {v:cost,l:'ج.م',c:'#059669'},
                    ].map((x,i)=>(
                      <div key={i} className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                        <div className="text-sm font-black font-mono" style={{color:x.c}}>{x.v}</div>
                        <div className="text-[8px]" style={{color:'#94a3b8'}}>{x.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Messages ─────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <span className="bg-red-600 text-white px-2 py-1 rounded-lg text-[10px] font-black shadow-sm">{pendingMessages.length} جديد</span>
          <h3 className="font-black text-lg flex items-center gap-2" style={{color:'#2563eb'}}>الرسائل والشكاوى <MessageCircle size={18}/></h3>
        </div>
        <div className="flex gap-2 mb-4">
          <button onClick={()=>setMessagesTab('all')} className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all shadow-sm ${messagesTab==='all'?'bg-blue-600 text-white shadow-blue-200':'bg-white border border-slate-200'}`} style={messagesTab!=='all'?{color:'#64748b'}:{}}>الكل ({allMessages.length})</button>
          <button onClick={()=>setMessagesTab('pending')} className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all shadow-sm ${messagesTab==='pending'?'bg-amber-500 text-white shadow-amber-200':'bg-white border border-slate-200'}`} style={messagesTab!=='pending'?{color:'#64748b'}:{}}>⏳ معلقة ({pendingMessages.length})</button>
        </div>
        <div className="space-y-3">
          {displayedMessages.length===0?(
            <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center shadow-sm" style={{color:'#94a3b8'}}>لا توجد رسائل</div>
          ):(
            displayedMessages.map(msg=>{
              const isExp=expandedMessage===msg.id; const isRep=replyingTo===msg.id;
              return (
                <div key={msg.id} className={`rounded-2xl p-4 border-2 shadow-sm transition-all ${msg.status==='pending'?'bg-amber-50 border-amber-200':msg.status==='replied'?'bg-emerald-50 border-emerald-200':'bg-white border-slate-200'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold text-white ${msg.status==='pending'?'bg-amber-500':msg.status==='replied'?'bg-emerald-600':'bg-slate-400'}`}>
                        {msg.status==='pending'?'⏳ معلقة':msg.status==='replied'?'✅ تم الرد':'🔒 مغلقة'}
                      </span>
                      <span className="text-[9px]" style={{color:'#94a3b8'}}>{formatMsgTime(msg.timestamp)}</span>
                    </div>
                    <span className="text-[9px] bg-slate-100 px-2 py-0.5 rounded-full font-bold" style={{color:'#64748b'}}>{getTypeEmoji(msg.type)} {getTypeLabel(msg.type)}</span>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-2 mb-2 flex items-center justify-between border border-slate-100">
                    <span className="text-[10px] font-mono" style={{color:'#64748b'}}>{msg.userPhone}</span>
                    <div className="flex items-center gap-2">
                      {msg.userName&&<span className="text-[10px] font-bold" style={{color:'#0f172a'}}>{msg.userName}</span>}
                      {msg.carPlate&&<span className="text-[9px] font-mono" style={{color:'#2563eb'}}>🚗 {msg.carPlate}</span>}
                    </div>
                  </div>
                  {msg.subject&&<div className="text-xs font-black mb-1 text-right" style={{color:'#0f172a'}}>{msg.subject}</div>}
                  <div className={`text-[11px] text-right leading-relaxed mb-2 cursor-pointer ${isExp?'':'line-clamp-2'}`} style={{color:'#475569'}} onClick={()=>setExpandedMessage(isExp?null:msg.id)}>{msg.message}</div>
                  {!isExp&&msg.message.length>80&&(<button onClick={()=>setExpandedMessage(msg.id)} className="text-[9px] font-bold mb-2" style={{color:'#2563eb'}}>عرض الكامل ↓</button>)}
                  {msg.reply&&(
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-3">
                      <div className="text-[9px] font-bold text-right mb-1" style={{color:'#059669'}}>ردك السابق:</div>
                      <div className="text-[11px] text-right leading-relaxed" style={{color:'#047857'}}>{msg.reply}</div>
                      {msg.repliedAt&&(<div className="text-[8px] text-left mt-1" style={{color:'#6ee7b7'}}>{formatMsgTime(msg.repliedAt)}</div>)}
                    </div>
                  )}
                  {msg.status!=='closed'&&(
                    isRep?(
                      <div className="space-y-2">
                        <textarea value={replyText} onChange={(e)=>setReplyText(e.target.value)} placeholder="اكتب ردك هنا..." rows={3}
                          className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-right font-bold outline-none resize-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" style={{color:'#0f172a'}}/>
                        <div className="flex gap-2">
                          <button onClick={async()=>{if(!replyText.trim()){toast.error('اكتب الرد');return;}await replyMessage(msg.id,replyText.trim());toast.success('تم الإرسال ✅');setReplyText('');setReplyingTo(null);}}
                            className="flex-1 bg-emerald-600 text-white py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 active:scale-95 shadow-md shadow-emerald-200"><Send size={14}/>إرسال الرد</button>
                          <button onClick={()=>{setReplyingTo(null);setReplyText('');}} className="bg-slate-200 px-4 py-2.5 rounded-xl font-black text-xs active:scale-95" style={{color:'#475569'}}>إلغاء</button>
                        </div>
                      </div>
                    ):(
                      <div className="flex gap-2">
                        <button onClick={()=>{setReplyingTo(msg.id);setReplyText('');setExpandedMessage(msg.id);}}
                          className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 active:scale-95 shadow-md shadow-blue-200"><Send size={14}/>{msg.reply?'تعديل الرد':'رد'}</button>
                        <button onClick={async()=>{await closeMessage(msg.id);toast.success('تم الإغلاق');}}
                          className="bg-slate-200 px-4 py-2.5 rounded-xl font-black text-xs active:scale-95" style={{color:'#475569'}}>إغلاق</button>
                      </div>
                    )
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Manage Garages ────────────────────── */}
      <div className="mb-8">
        <h3 className="font-black text-lg mb-4 flex items-center gap-2 justify-end" style={{color:'#2563eb'}}>إدارة الجراجات <Warehouse size={18}/></h3>
        <div className="space-y-3">
          {garages.map(g=>(
            <div key={g.id} className="bg-white p-5 rounded-[2rem] border-2 border-slate-200 shadow-md hover:shadow-lg transition-all">
              <div className="flex justify-between mb-4">
                <div className="bg-blue-600 p-3 rounded-2xl text-center min-w-[60px] shadow-md shadow-blue-200" style={{color:'#ffffff'}}>
                  <div className="text-xl font-black font-mono">{g.availableSpots}</div>
                  <div className="text-[8px] font-bold opacity-80">شاغر</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black mb-1" style={{color:'#0f172a'}}>{g.name}</div>
                  <div className="text-[10px] flex items-center gap-1 justify-end" style={{color:'#94a3b8'}}><MapPin size={10}/>{g.location}</div>
                </div>
              </div>
              <button onClick={()=>{setCurrentGarageId(g.id);setView('garage');}} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-black text-sm active:scale-95 transition-all shadow-lg shadow-blue-200">دخول وإدارة</button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Add Garage ───────────────────────── */}
      <div className="mb-20">
        <h3 className="font-black text-lg mb-4 flex items-center gap-2 justify-end" style={{color:'#2563eb'}}>إضافة جراج جديد <Plus size={18}/></h3>
        <div className="bg-white p-5 rounded-[2rem] border-2 border-slate-200 space-y-4 shadow-md">
          <input className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm font-bold text-right outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" style={{color:'#0f172a'}} placeholder="اسم الجراج" value={gName} onChange={e=>setGName(e.target.value)} />
          <div className="flex gap-2">
            <input className="flex-1 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs font-bold text-right outline-none focus:border-blue-400" style={{color:'#0f172a'}} placeholder="المستخدم" value={gUser} onChange={e=>setGUser(e.target.value)} />
            <input className="flex-1 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs font-bold text-right outline-none focus:border-blue-400" style={{color:'#0f172a'}} placeholder="الهاتف" value={gPhone} onChange={e=>setGPhone(e.target.value)} />
          </div>
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
            <div className="text-[10px] font-bold mb-2" style={{color:'#2563eb'}}>تحديد الإحداثيات</div>
            <div className="grid grid-cols-2 gap-3 font-mono mb-3">
              <div>
                <span className="text-[8px] block px-1" style={{color:'#94a3b8'}}>خط العرض</span>
                <input type="number" value={lat} onChange={e=>setLat(parseFloat(e.target.value))} className="w-full bg-white p-2 rounded-lg border border-slate-200 text-xs outline-none" style={{color:'#0f172a'}} step="0.000001" />
              </div>
              <div>
                <span className="text-[8px] block px-1" style={{color:'#94a3b8'}}>خط الطول</span>
                <input type="number" value={lng} onChange={e=>setLng(parseFloat(e.target.value))} className="w-full bg-white p-2 rounded-lg border border-slate-200 text-xs outline-none" style={{color:'#0f172a'}} step="0.000001" />
              </div>
            </div>
          </div>
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 text-center">
            <div className="text-2xl mb-2">📍</div>
            <div className="text-xs font-bold mb-2" style={{color:'#64748b'}}>الموقع المحدد</div>
            <div className="text-sm font-black font-mono" style={{color:'#2563eb'}}>{lat.toFixed(4)}, {lng.toFixed(4)}</div>
            <button type="button" onClick={()=>{if('geolocation' in navigator){navigator.geolocation.getCurrentPosition(pos=>{setLat(pos.coords.latitude);setLng(pos.coords.longitude);toast.success('تم التحديث');},()=>toast.error('تعذر'));}}}
              className="mt-3 bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black active:scale-95 shadow-md shadow-blue-200">📍 استخدم موقعي</button>
          </div>
          <button onClick={()=>{if(gName&&gUser&&gPhone){addGarage({name:gName,username:gUser,phone:gPhone,capacity:50,basePrice:15,location:'موقع جديد',lat,lng});setGName('');setGUser('');setGPhone('');toast.success('تم الإضافة!');}else{toast.error('أكمل الحقول');}}}
            className="w-full bg-blue-600 py-4 rounded-xl font-black text-sm text-white shadow-xl shadow-blue-200 active:scale-95 transition-all">حفظ الجراج</button>
        </div>
      </div>
    </div>
  );
}