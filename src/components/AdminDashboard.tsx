// src/components/AdminDashboard.tsx

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, CheckCircle, XCircle, MapPin, Plus,
  MessageCircle, Send, Search, Percent,
  Minus, CalendarDays, Navigation, X,
  Zap, Filter, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useStore, normalizePhone, getServerNow, BOOKING_FEE } from '../store';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const BRAND = {
  blue: '#1656b8', blueDark: '#0f3d85', blueLight: '#e8f0fe', blueSoft: '#f0f5ff',
  green: '#8cc63f', greenDark: '#6ea62a', greenLight: '#f2fae6',
  navy: '#0a1628', slate: '#475569', slateMuted: '#94a3b8',
  border: '#e2e8f0', card: '#ffffff', bg: '#f4f7fc', red: '#dc2626',
};

const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'string') { const ms = new Date(value).getTime(); return Number.isFinite(ms) && ms > 0 ? ms : 0; }
  if (typeof value === 'number') return value < 1_000_000_000_000 ? value * 1000 : value;
  return 0;
};
const timestampToLocalDate = (ts: number): string => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const getLocalToday = (): string => { const n = new Date(getServerNow()); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; };
const getLocalYesterday = (): string => { const d = new Date(getServerNow()); d.setDate(d.getDate()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const getLocalDaysAgo = (days: number): string => { const d = new Date(getServerNow()); d.setDate(d.getDate()-days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const formatSessionTime = (ts: any): string => { const ms = toMs(ts); if (!ms) return '—'; const d = new Date(ms); return d.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})+' · '+d.toLocaleDateString('ar-EG',{month:'short',day:'numeric'}); };
const formatDuration = (s: number, e: number): string => { if (!s||!e) return '—'; const d = Math.max(0,Math.floor((e-s)/1000)); const h = Math.floor(d/3600); const m = Math.floor((d%3600)/60); return h>0?`${h}س ${m}د`:`${m}د`; };
const isSessionFree = (s: any): boolean => s.isFirstFreeSession === true || (s as any).is_first_free_session === true;

export default function AdminDashboard() {
  const { garages, sessions, walletTopUps, users, approveTopUp, rejectTopUp, addGarage, setCurrentGarageId, setView, logout, messages, replyMessage, closeMessage, updateGarage, fetchAll } = useStore() as any;

  const [, setTick] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [replyingTo, setReplyingTo] = useState<string|null>(null);
  const [expandedMessage, setExpandedMessage] = useState<string|null>(null);
  const [messagesTab, setMessagesTab] = useState<'pending'|'all'>('pending');
  const [processingTopUpId, setProcessingTopUpId] = useState<string|null>(null);
  const [editingCommissionGarageId, setEditingCommissionGarageId] = useState<string|null>(null);
  const [editCommissionRate, setEditCommissionRate] = useState(10);
  const [editArea, setEditArea] = useState('وسط البلد');
  const [editGarageType, setEditGarageType] = useState<'vip'|'directory'>('vip');
  const [editPriceType, setEditPriceType] = useState<'hourly'|'daily'|'monthly'>('hourly');
  const [editBasePrice, setEditBasePrice] = useState(15);
  const [editDailyPrice, setEditDailyPrice] = useState(20);
  const [editMonthlyPrice, setEditMonthlyPrice] = useState(1500);
  const [adminGarageTab, setAdminGarageTab] = useState<'vip'|'directory'>('vip');
  const [garageSearch, setGarageSearch] = useState('');
  const [vipReportDateFrom, setVipReportDateFrom] = useState(() => getLocalToday());
  const [vipReportDateTo, setVipReportDateTo] = useState(() => getLocalToday());
  const [vipGarageFilter, setVipGarageFilter] = useState<string>('all');
  const [vipPlateSearch, setVipPlateSearch] = useState('');
  const [walletReportDateFrom, setWalletReportDateFrom] = useState(getLocalDaysAgo(30));
  const [walletReportDateTo, setWalletReportDateTo] = useState(getLocalToday());
  const [walletStatusFilter, setWalletStatusFilter] = useState<string>('all');
  const [walletPaymentFilter, setWalletPaymentFilter] = useState<string>('all');
  const [walletVisibleCount, setWalletVisibleCount] = useState(10);
  const [vipPaymentFilter, setVipPaymentFilter] = useState<string>('all');
  const [vipExpandedGarageId, setVipExpandedGarageId] = useState<string|null>(null);
  const [vipVisibleSessions, setVipVisibleSessions] = useState(10);
  const [visibleVipGarages, setVisibleVipGarages] = useState(10);
  const [visibleGarageCount, setVisibleGarageCount] = useState(10);

  const [gName, setGName] = useState('');
  const [gUser, setGUser] = useState('');
  const [gPhone, setGPhone] = useState('');
  const [lat, setLat] = useState(30.04);
  const [lng, setLng] = useState(31.23);
  const [gArea, setGArea] = useState('وسط البلد');
  const [gType, setGType] = useState<'partner'|'directory'>('partner');
  const [gPriceType, setGPriceType] = useState<'hourly'|'daily'|'monthly'>('hourly');
  const [gBasePrice, setGBasePrice] = useState(15);
  const [gDailyPrice, setGDailyPrice] = useState(20);
  const [gMonthlyPrice, setGMonthlyPrice] = useState(1500);
  const [gValet1Name, setGValet1Name] = useState('');
  const [gValet1Pass, setGValet1Pass] = useState('');
  const [gValet2Name, setGValet2Name] = useState('');
  const [gValet2Pass, setGValet2Pass] = useState('');
  const [gValet3Name, setGValet3Name] = useState('');
  const [gValet3Pass, setGValet3Pass] = useState('');

  const filteredGaragesForAdmin = useMemo(() => { const q = garageSearch.trim().toLowerCase(); let l = garages.filter((g:any) => g.garageType === adminGarageTab); if (!q) return l; return l.filter((g:any) => g.name.toLowerCase().includes(q)); }, [garages, garageSearch, adminGarageTab]);

  useEffect(() => { const i = setInterval(() => setTick(t=>t+1), 60000); return () => clearInterval(i); }, []);

  const completedSessions = useMemo(() => sessions.filter((s:any) => s.status==='completed' || s.status==='active'), [sessions]);

  const pendingTopUps = walletTopUps.filter((w:any) => w.status==='pending');

  const vipGarages = useMemo(() => garages.filter((g:any)=>g.garageType==='vip'||(g as any).is_vip===true||g.type==='partner'), [garages]);

  // ✅ VIP sessions: include ALL (paid + free), free ones have is_first_free_session=true
  const vipFilteredSessions = useMemo(() => completedSessions.filter((s:any) => {
    if (s.endTime) { const d=timestampToLocalDate(toMs(s.endTime)); if (vipReportDateFrom&&d<vipReportDateFrom) return false; if (vipReportDateTo&&d>vipReportDateTo) return false; } else return false;
    const g=garages.find((ga:any)=>ga.id===s.garageId); if (!g) return false;
    if (!(g.garageType==='vip'||(g as any).is_vip===true||g.type==='partner')) return false;
    if (vipGarageFilter!=='all'&&s.garageId!==vipGarageFilter) return false;
    if (vipPaymentFilter!=='all'&&s.paymentMethod!==vipPaymentFilter) return false;
    if (vipPlateSearch.trim()) { const q=vipPlateSearch.trim().toUpperCase(); if (!(s.carPlate??'').toUpperCase().includes(q)) return false; }
    return true;
  }).sort((a:any,b:any)=>toMs(b.endTime)-toMs(a.endTime)), [completedSessions, garages, vipReportDateFrom, vipReportDateTo, vipGarageFilter, vipPaymentFilter, vipPlateSearch]);

  const vipReportStats = useMemo(() => {
    const ts = vipFilteredSessions.length;
    const freeSessions = vipFilteredSessions.filter((s:any) => isSessionFree(s));
    const paidSessions = vipFilteredSessions.filter((s:any) => !isSessionFree(s));
    const freeCount = freeSessions.length;
    const paidCount = paidSessions.length;
    // Revenue from PAID sessions only (free sessions have totalPrice=0 anyway, but be explicit)
    const tr = paidSessions.reduce((a:number,s:any)=>a+(s.totalPrice||0),0);
    // Booking fees from PAID sessions only
    const tf = paidCount*BOOKING_FEE;
    const gm = new Map<string,{name:string;area:string;count:number;paidCount:number;freeCount:number;revenue:number;fees:number}>();
    vipFilteredSessions.forEach((s:any) => {
      const g=garages.find((ga:any)=>ga.id===s.garageId); if(!g) return;
      const free = isSessionFree(s);
      const r = free ? 0 : (s.totalPrice||0);
      const fee = free ? 0 : BOOKING_FEE;
      const e=gm.get(s.garageId);
      if(e){e.count++;if(free)e.freeCount++;else e.paidCount++;e.revenue+=r;e.fees+=fee;}
      else gm.set(s.garageId,{name:g.name,area:g.area||'مناطق أخرى',count:1,paidCount:free?0:1,freeCount:free?1:0,revenue:r,fees:fee});
    });
    const pg = Array.from(gm.entries()).map(([id,d])=>({id,...d})).sort((a,b)=>b.count-a.count);
    const cc=paidSessions.filter((s:any)=>s.paymentMethod==='cash').length;
    const wc=paidSessions.filter((s:any)=>s.paymentMethod==='wallet').length;
    const ic=paidSessions.filter((s:any)=>s.paymentMethod==='instapay').length;
    return { totalSessions:ts, paidCount, freeCount, totalRevenue:tr, totalBookingFees:tf, perGarage:pg, cashCount:cc, walletCount:wc, instapayCount:ic, otherCount:paidCount-cc-wc-ic };
  }, [vipFilteredSessions, garages]);

  const filteredWalletTopUps = useMemo(() => {
    return walletTopUps.filter((w:any) => {
      if (walletStatusFilter !== 'all' && w.status !== walletStatusFilter) return false;
      if (walletPaymentFilter !== 'all' && (w.paymentMethod || '') !== walletPaymentFilter) return false;
      const createdTs = w.createdAt || w.timestamp;
      if (createdTs) {
        const d = timestampToLocalDate(toMs(createdTs));
        if (walletReportDateFrom && d < walletReportDateFrom) return false;
        if (walletReportDateTo && d > walletReportDateTo) return false;
      }
      return true;
    }).sort((a:any, b:any) => toMs(b.createdAt || b.timestamp) - toMs(a.createdAt || a.timestamp));
  }, [walletTopUps, walletStatusFilter, walletPaymentFilter, walletReportDateFrom, walletReportDateTo]);

  const walletReportStats = useMemo(() => {
    const total = filteredWalletTopUps.length;
    const totalAmount = filteredWalletTopUps.reduce((a:number, w:any) => a + (w.amount||0), 0);
    const approved = filteredWalletTopUps.filter((w:any) => w.status === 'approved');
    const pending = filteredWalletTopUps.filter((w:any) => w.status === 'pending');
    const rejected = filteredWalletTopUps.filter((w:any) => w.status === 'rejected');
    const approvedAmount = approved.reduce((a:number, w:any) => a + (w.amount||0), 0);
    const uniqueUsers = new Set(filteredWalletTopUps.map((w:any) => normalizePhone(w.userPhone||''))).size;
    return { total, totalAmount, approvedCount: approved.length, pendingCount: pending.length, rejectedCount: rejected.length, approvedAmount, uniqueUsers };
  }, [filteredWalletTopUps]);

  const safeMessages = messages ?? [];
  const pendingMessages = safeMessages.filter((m:any)=>m.status==='pending');
  const allMessages = [...safeMessages].sort((a:any,b:any)=>b.timestamp-a.timestamp);
  const displayedMessages = messagesTab==='pending' ? pendingMessages : allMessages;
  const getTypeEmoji = (t:string) => { switch(t){case 'complaint':return '🚨';case 'inquiry':return '❓';case 'suggestion':return '💡';case 'technical':return '🔧';default:return '💬';} };
  const getTypeLabel = (t:string) => { switch(t){case 'complaint':return 'شكوى';case 'inquiry':return 'استفسار';case 'suggestion':return 'اقتراح';case 'technical':return 'مشكلة تقنية';default:return 'رسالة';} };
  const formatMsgTime = (ts:number) => new Date(ts).toLocaleDateString('ar-EG',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});

  const handleAddGarage = () => {
    if (!gName) { toast.error('أدخل اسم الجراج'); return; }
    const isDir = gType==='directory';
    if (!isDir && (!gUser||!gPhone)) { toast.error('جراج الشريك يتطلب اسم مستخدم وهاتف للمالك'); return; }
    addGarage({ name:gName, username:isDir?`dir_${Date.now()}`:gUser, phone:isDir?'':gPhone, ownerPhone:isDir?'':gPhone, capacity:isDir?100:50, basePrice:isDir&&gPriceType==='hourly'?gBasePrice:isDir&&gPriceType==='daily'?gDailyPrice:gBasePrice, location:'موقع دليل إلكتروني', lat, lng, valetName1:isDir?'':gValet1Name, valetPassword1:isDir?'':gValet1Pass, valetName2:isDir?'':gValet2Name, valetPassword2:isDir?'':gValet2Pass, valetName3:isDir?'':gValet3Name, valetPassword3:isDir?'':gValet3Pass, area:gArea, garageType:gType, priceType:gPriceType, dailyPrice:isDir&&gPriceType==='daily'?gDailyPrice:undefined, monthlyPrice:isDir&&gPriceType==='monthly'?gMonthlyPrice:undefined } as any);
    setGName(''); setGUser(''); setGPhone(''); setGArea('وسط البلد'); setGValet1Name(''); setGValet1Pass(''); setGValet2Name(''); setGValet2Pass(''); setGValet3Name(''); setGValet3Pass(''); setGType('partner'); setGPriceType('hourly');
    toast.success('تمت إضافة الجراج بنجاح! 🎉');
  };

  const handleSaveGarageData = (garageId:string) => {
    const isDir = editGarageType==='directory';
    const fp = isDir&&editPriceType==='daily'?editDailyPrice:isDir&&editPriceType==='monthly'?editMonthlyPrice:editBasePrice;
    updateGarage(garageId, { commissionRate:isDir?0:editCommissionRate, area:editArea, garageType:editGarageType, priceType:editPriceType, basePrice:fp, dailyPrice:editDailyPrice, monthlyPrice:editMonthlyPrice, lastPriceUpdate:new Date().toISOString(), priceUpdatedBy:'admin' });
    setEditingCommissionGarageId(null);
    toast.success(`تم تحديث بيانات جراج ${garages.find((g:any)=>g.id===garageId)?.name} بنجاح ✅`);
  };

  const handleAdminEnterGarage = (g:any) => { localStorage.setItem('garageRole','owner'); localStorage.removeItem('valetNumber'); localStorage.removeItem('valetName'); localStorage.setItem('currentGarageId',g.id); setCurrentGarageId(g.id); setView('garage'); toast.success(`👋 تم الدخول المباشر لإدارة جراج: ${g.name}`,{icon:'🅿️',duration:3000}); };

  const handleApproveTopUp = async (id:string, amount:number) => { if(processingTopUpId) return; setProcessingTopUpId(id); const lt=toast.loading('جاري اعتماد الرصيد...'); try{await approveTopUp(id); toast.dismiss(lt); toast.success(`تم اعتماد شحن ${amount} ج.م ✅`,{duration:4000}); await fetchAll();}catch(e:any){toast.dismiss(lt); toast.error(e?.message||'فشل');}finally{setProcessingTopUpId(null);} };
  const handleRejectTopUp = async (id:string) => { if(processingTopUpId) return; setProcessingTopUpId(id); const lt=toast.loading('جاري الرفض...'); try{await rejectTopUp(id); toast.dismiss(lt); toast.error('تم الرفض ❌'); await fetchAll();}catch(e:any){toast.dismiss(lt); toast.error(e?.message||'فشل');}finally{setProcessingTopUpId(null);} };

  useEffect(() => {
    let dt:ReturnType<typeof setTimeout>|null=null;
    const tf=()=>{if(dt)clearTimeout(dt);dt=setTimeout(async()=>{try{await fetchAll();}catch(e){console.error(e);}},1500);};
    const ch=supabase.channel('admin-rt').on('postgres_changes',{event:'*',schema:'public',table:'sessions'},tf).on('postgres_changes',{event:'*',schema:'public',table:'wallet_topups'},tf).on('postgres_changes',{event:'*',schema:'public',table:'messages'},tf).on('postgres_changes',{event:'*',schema:'public',table:'garages'},tf).subscribe();
    return()=>{if(dt)clearTimeout(dt);supabase.removeChannel(ch);};
  },[fetchAll]);

  const AREA_OPTIONS = [
    'وسط البلد','الزمالك','مصر الجديدة','مدينة نصر','المعادي','المهندسين','الدقي','التجمع الخامس',
    'صلاح سالم والعروبة','ممشى أهل مصر','جاردن سيتي والقصر العيني','بولاق','العتبة والأسواق',
    'الحسين والأزهر','شيراتون المطار','الرحاب ومدينتي','القرية الذكية','الشيخ زايد','6 أكتوبر',
    'المقطم','المنيل','الجيزة','حدائق الأهرام','المريوطية والمنصورية','الكيت كات','إمبابة والوراق',
    'أرض اللواء','الوايلي والعباسية','الزيتون والمطرية','حدائق القبة','جسر السويس','شبرا ورمسيس',
    'شبرا الخيمة','مصر القديمة','مدينة الشروق','مدينة العبور','العاشر من رمضان','العاصمة الإدارية',
    'حلوان','الإسكندرية','الساحل الشمالي','المنصورة والدلتا','طنطا','مدن القناة','العين السخنة','مناطق أخرى'
  ];
  const AREA_EMOJI:Record<string,string> = {'وسط البلد':'🏢','الزمالك':'👑','مصر الجديدة':'🏰','مدينة نصر':'🏙️','المعادي':'🌳','المهندسين':'🛍️','الدقي':'🎓','التجمع الخامس':'💎','مناطق أخرى':'📍'};

  return (
    <div className="h-full overflow-y-auto pt-16 px-4 pb-12" style={{background:BRAND.bg,color:BRAND.navy}}>

      {/* ══ Header ══ */}
      <div className="flex justify-between items-center mb-6 pb-4" style={{borderBottom:`1px solid ${BRAND.border}`}}>
        <button onClick={()=>{localStorage.removeItem('adminSession');logout();}} className="font-black active:scale-95 transition-all text-xs border-0 px-4 py-2.5 rounded-xl cursor-pointer" style={{background:'#fef2f2',color:'#b91c1c',border:'1px solid #fca5a5'}}>تسجيل خروج</button>
        <h2 className="font-black flex items-center gap-2 text-base" style={{color:BRAND.blueDark}}>لوحة المشرف العام <Shield size={18} style={{color:BRAND.blue}}/></h2>
        <div className="font-bold text-xs px-3 py-1.5 rounded-lg" style={{background:BRAND.blueSoft,color:BRAND.blue,border:`1px solid ${BRAND.border}`}}>{sessions.length} عملية</div>
      </div>

      {/* ══ Wallet Top-ups Report ══ */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="font-black text-[9px] px-2.5 py-1 rounded-full text-white flex items-center gap-1" style={{background:`linear-gradient(135deg,${BRAND.greenDark},#059669)`}}>💰 {walletReportStats.total} عملية</span>
          <h3 className="font-black text-sm flex items-center gap-2" style={{color:BRAND.navy}}>تقرير شحنات المحفظة 💳</h3>
        </div>

        <div className="mb-4" style={{background:BRAND.card,border:`1px solid ${BRAND.border}`,borderRadius:20,padding:14,boxShadow:'0 2px 12px rgba(0,0,0,0.02)'}}>
          <div className="flex items-center gap-1.5 mb-3">
            <input type="date" value={walletReportDateFrom} onChange={e=>{setWalletReportDateFrom(e.target.value);setWalletVisibleCount(10);}} className="flex-1 font-black outline-none text-center font-mono py-2 rounded-xl text-xs border border-slate-200" style={{background:BRAND.blueSoft,color:BRAND.blueDark}}/>
            <span className="font-black text-slate-400 text-xs">←</span>
            <input type="date" value={walletReportDateTo} onChange={e=>{setWalletReportDateTo(e.target.value);setWalletVisibleCount(10);}} className="flex-1 font-black outline-none text-center font-mono py-2 rounded-xl text-xs border border-slate-200" style={{background:BRAND.blueSoft,color:BRAND.blueDark}}/>
            <CalendarDays size={16} style={{color:BRAND.greenDark}} className="shrink-0"/>
          </div>
          <div className="flex gap-1.5 mb-3">
            {[{l:'📅 اليوم',o:()=>{setWalletReportDateFrom(getLocalToday());setWalletReportDateTo(getLocalToday());},a:walletReportDateFrom===getLocalToday()&&walletReportDateTo===getLocalToday()},{l:'أمس',o:()=>{setWalletReportDateFrom(getLocalYesterday());setWalletReportDateTo(getLocalYesterday());},a:walletReportDateFrom===getLocalYesterday()&&walletReportDateTo===getLocalYesterday()},{l:'أسبوع',o:()=>{setWalletReportDateFrom(getLocalDaysAgo(7));setWalletReportDateTo(getLocalToday());},a:walletReportDateFrom===getLocalDaysAgo(7)&&walletReportDateTo===getLocalToday()},{l:'شهر',o:()=>{setWalletReportDateFrom(getLocalDaysAgo(30));setWalletReportDateTo(getLocalToday());},a:walletReportDateFrom===getLocalDaysAgo(30)&&walletReportDateTo===getLocalToday()}].map(b=>(<button key={b.l} onClick={()=>{b.o();setWalletVisibleCount(10);}} className="flex-1 font-black py-2 rounded-lg text-xs cursor-pointer border-0 active:scale-95 transition-all" style={{background:b.a?BRAND.greenDark:BRAND.blueSoft,color:b.a?'#fff':BRAND.slate}}>{b.l}</button>))}
          </div>
          <div className="flex gap-2">
            <select value={walletStatusFilter} onChange={e=>{setWalletStatusFilter(e.target.value);setWalletVisibleCount(10);}} className="flex-1 font-bold text-right outline-none text-xs py-2.5 px-3 rounded-lg border border-slate-200" style={{color:BRAND.navy}}>
              <option value="all">كل الحالات</option>
              <option value="approved">✅ مقبولة</option>
              <option value="pending">⏳ معلقة</option>
              <option value="rejected">❌ مرفوضة</option>
            </select>
            <select value={walletPaymentFilter} onChange={e=>{setWalletPaymentFilter(e.target.value);setWalletVisibleCount(10);}} className="flex-1 font-bold text-right outline-none text-xs py-2.5 px-3 rounded-lg border border-slate-200" style={{color:BRAND.navy}}>
              <option value="all">كل طرق الدفع</option>
              <option value="vodafone_cash">🔴 فودافون كاش</option>
              <option value="etisalat_cash">🟢 اتصالات كاش</option>
              <option value="orange_cash">🟠 أورانج كاش</option>
              <option value="instapay">📱 إنستاباي</option>
              <option value="bank">🏦 بنك</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <div className="text-center p-3 rounded-2xl border" style={{background:BRAND.card,borderColor:BRAND.border}}>
            <div className="text-[9px] font-bold" style={{color:BRAND.slate}}>💰 إجمالي الشحنات</div>
            <div className="font-black font-mono text-lg mt-1" style={{color:BRAND.greenDark}}>{walletReportStats.totalAmount.toLocaleString()}</div>
            <div className="text-[8px] font-bold" style={{color:BRAND.slateMuted}}>ج.م</div>
          </div>
          <div className="text-center p-3 rounded-2xl border" style={{background:BRAND.card,borderColor:BRAND.border}}>
            <div className="text-[9px] font-bold" style={{color:BRAND.slate}}>📄 عدد العمليات</div>
            <div className="font-black font-mono text-lg mt-1" style={{color:BRAND.navy}}>{walletReportStats.total}</div>
            <div className="text-[8px] font-bold" style={{color:BRAND.slateMuted}}>عملية</div>
          </div>
          <div className="text-center p-3 rounded-2xl border" style={{background:BRAND.card,borderColor:BRAND.border}}>
            <div className="text-[9px] font-bold" style={{color:BRAND.slate}}>✅ شحنات مقبولة</div>
            <div className="font-black font-mono text-lg mt-1" style={{color:BRAND.greenDark}}>{walletReportStats.approvedCount}</div>
            <div className="text-[8px] font-bold" style={{color:BRAND.slateMuted}}>{walletReportStats.approvedAmount.toLocaleString()} ج.م</div>
          </div>
          <div className="text-center p-3 rounded-2xl" style={{background:`linear-gradient(135deg,${BRAND.blueSoft} 0%,${BRAND.blueLight} 100%)`,border:`1.5px solid ${BRAND.blue}40`}}>
            <div className="text-[9px] font-black" style={{color:BRAND.blueDark}}>👥 عملاء فريدين</div>
            <div className="font-black font-mono text-lg mt-1" style={{color:BRAND.blue}}>{walletReportStats.uniqueUsers}</div>
            <div className="text-[8px] font-bold" style={{color:BRAND.blueDark}}>عميل</div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-1 mb-4 py-2 px-3 rounded-xl border" style={{background:BRAND.bg,borderColor:BRAND.border}}>
          {[{icon:'✅',label:'مقبول',count:walletReportStats.approvedCount,color:BRAND.greenDark},{icon:'⏳',label:'معلق',count:walletReportStats.pendingCount,color:'#f59e0b'},{icon:'❌',label:'مرفوض',count:walletReportStats.rejectedCount,color:BRAND.red}].map((p,i)=>(<div key={i} className="flex items-center gap-1 text-[10px]"><span>{p.icon}</span><span className="font-bold text-[9px]" style={{color:BRAND.slate}}>{p.label}</span><span className="font-black font-mono" style={{color:p.color}}>{p.count}</span>{i<2&&<div style={{width:1,height:14,background:BRAND.border,marginLeft:4,marginRight:2}}/>}</div>))}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="font-bold text-[9px]" style={{color:BRAND.slateMuted}}>عرض {Math.min(walletVisibleCount,filteredWalletTopUps.length)} من {filteredWalletTopUps.length} عملية</span>
            <h4 className="font-black text-[11px]" style={{color:BRAND.navy}}>📋 تفاصيل الشحنات</h4>
          </div>
          <div className="rounded-2xl border overflow-hidden" style={{background:BRAND.card,borderColor:BRAND.border}}>
            {filteredWalletTopUps.length===0?(
              <div className="text-center py-10">
                <span className="text-2xl block mb-1">📭</span>
                <p className="font-black text-xs" style={{color:BRAND.slateMuted}}>لا توجد شحنات في الفترة المحددة</p>
              </div>
            ):(<>
              <div className="grid px-3 py-2" style={{gridTemplateColumns:'1.6fr 0.7fr 0.55fr 0.5fr',gap:6,background:BRAND.navy,color:'#fff'}}>
                <div className="font-black text-[9px] text-right">العميل + الوقت</div>
                <div className="font-black text-[9px] text-center">المبلغ</div>
                <div className="font-black text-[9px] text-center">الحالة</div>
                <div className="font-black text-[9px] text-center">الدفع</div>
              </div>
              <div className="max-h-[500px] overflow-y-auto divide-y" style={{borderColor:BRAND.border}}>
                {filteredWalletTopUps.slice(0,walletVisibleCount).map((w:any)=>{
                  const u = (users||[]).find((usr:any)=>normalizePhone(usr.phone)===normalizePhone(w.userPhone||''));
                  const userName = u?.name || w.userName || 'غير معروف';
                  const created = w.createdAt || w.timestamp;
                  return(
                    <div key={w.id} className="grid px-3 py-2.5 items-center" style={{gridTemplateColumns:'1.6fr 0.7fr 0.55fr 0.5fr',gap:6}}>
                      <div className="text-right min-w-0">
                        <div className="font-black text-[11px] truncate mb-0.5" style={{color:BRAND.navy}}>👤 {userName}</div>
                        <div className="font-mono font-bold text-[10px] truncate" style={{color:BRAND.blue}} dir="ltr">📱 {w.userPhone||'—'}</div>
                        <div className="font-mono text-[9px] mt-0.5" style={{color:BRAND.slateMuted}}>🕐 {formatSessionTime(created)}</div>
                      </div>
                      <div className="text-center">
                        <div className="font-black font-mono text-[13px]" style={{color:BRAND.greenDark}}>{w.amount}</div>
                        <div className="text-[8px] font-bold" style={{color:BRAND.slateMuted}}>ج.م</div>
                      </div>
                      <div className="text-center">
                        <span className="font-black text-[9px] px-2 py-1 rounded text-white" style={{background:w.status==='approved'?BRAND.greenDark:w.status==='pending'?'#f59e0b':BRAND.red}}>
                          {w.status==='approved'?'✅':w.status==='pending'?'⏳':'❌'}
                        </span>
                      </div>
                      <div className="text-center">
                        <span className="font-black text-[9px] px-1.5 py-1 rounded" style={{background:BRAND.blueSoft,color:BRAND.blueDark}}>
                          {w.paymentMethod==='vodafone_cash'?'🔴':w.paymentMethod==='etisalat_cash'?'🟢':w.paymentMethod==='orange_cash'?'🟠':w.paymentMethod==='instapay'?'📱':'🏦'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {filteredWalletTopUps.length>walletVisibleCount&&(
                <div className="p-3 border-t text-center" style={{borderColor:BRAND.border}}>
                  <button onClick={()=>setWalletVisibleCount(p=>p+10)} className="w-full font-black py-2.5 rounded-xl text-[10px] cursor-pointer bg-white border active:scale-95 transition-all flex items-center justify-center gap-1.5" style={{color:BRAND.greenDark,borderColor:BRAND.border}}>
                    <ChevronDown size={14}/><span>عرض المزيد ({filteredWalletTopUps.length-walletVisibleCount} عملية أخرى)</span>
                  </button>
                </div>
              )}
            </>)}
          </div>
        </div>
      </div>

      {/* ══ Pending Top-ups ══ */}
      <div className="mb-8">
        <h3 className="font-black mb-3 text-right text-xs" style={{color:BRAND.navy}}>اعتمادات شحن معلقة ({pendingTopUps.length})</h3>
        <div className="space-y-3">
          {pendingTopUps.map((w:any)=>(<div key={w.id} className="border p-3" style={{background:BRAND.card,borderColor:BRAND.border,borderRadius:18}}>
            <div className="flex justify-between items-center mb-2"><div className="flex items-center gap-1.5"><span className="font-black text-[9px] px-2 py-0.5 rounded text-white" style={{background:w.method==='instapay'?'#7C3AED':'#f59e0b'}}>{w.method==='instapay'?'📱 إنستاباي':'📲 كاش'}</span><span className="font-bold font-mono text-[9px]" style={{color:BRAND.slateMuted}}>{new Date(w.timestamp).toLocaleDateString('ar-EG',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span></div><div className="font-black font-mono text-lg text-slate-900">{w.amount} <span className="text-[10px] font-bold text-slate-400">ج.م</span></div></div>
            <div className="flex items-center justify-between gap-2 mb-2 p-2 rounded-lg border bg-slate-50" style={{borderColor:BRAND.border}}><div className="flex items-center gap-1.5 flex-wrap">{w.userName&&<span className="font-black text-[10px]" style={{color:BRAND.navy}}>👤 {w.userName}</span>}{w.carPlate&&<span className="font-black text-[10px]" style={{color:'#c2410c'}}>🚗 {w.carPlate}</span>}</div>{w.userPhone&&<span className="font-black font-mono text-[10px]" style={{color:BRAND.blue}}>{w.userPhone}</span>}</div>
            <div className="flex gap-2"><button onClick={()=>handleApproveTopUp(w.id,w.amount)} disabled={processingTopUpId===w.id} className="flex-1 font-black py-2 rounded-lg text-xs cursor-pointer border-0 text-white flex items-center justify-center gap-1.5" style={{background:BRAND.greenDark}}><CheckCircle size={14}/>{processingTopUpId===w.id?'جاري...':'اعتماد الشحن'}</button><button onClick={()=>handleRejectTopUp(w.id)} disabled={processingTopUpId===w.id} className="font-black py-2 px-4 rounded-lg cursor-pointer border text-red-600 bg-red-50 border-red-200"><XCircle size={14}/></button></div>
          </div>))}
          {pendingTopUps.length===0 && <div className="text-center py-6 border-2 border-dashed rounded-2xl text-xs font-bold" style={{borderColor:BRAND.border,color:BRAND.slate}}>لا توجد اعتمادات معلقة للمحفظة</div>}
        </div>
      </div>

      {/* ══ Messages ══ */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3"><span className="font-black text-[9px] px-2 py-0.5 rounded text-white" style={{background:'#ef4444'}}>{pendingMessages.length} جديد</span><h3 className="font-black text-xs" style={{color:BRAND.navy}}>الرسائل والشكاوى <MessageCircle size={16}/></h3></div>
        <div className="flex gap-1.5 mb-3">{([{id:'all' as const,label:`الكل (${allMessages.length})`,bg:BRAND.blue},{id:'pending' as const,label:`⏳ معلقة (${pendingMessages.length})`,bg:'#f59e0b'}]).map(b=>(<button key={b.id} onClick={()=>setMessagesTab(b.id)} className="flex-1 font-black py-2 rounded-xl text-[10px] border-0 cursor-pointer transition-all" style={{background:messagesTab===b.id?b.bg:BRAND.blueSoft,color:messagesTab===b.id?'#fff':BRAND.slate,border:messagesTab!==b.id?`1px solid ${BRAND.border}`:'none'}}>{b.label}</button>))}</div>
        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
          {displayedMessages.length===0?<div className="text-center py-6 bg-white border rounded-2xl text-xs font-bold" style={{borderColor:BRAND.border,color:BRAND.slate}}>لا توجد رسائل</div>:displayedMessages.map((msg:any)=>{
            const isExp=expandedMessage===msg.id;const isRep=replyingTo===msg.id;
            return(<div key={msg.id} className="border p-3.5" style={{background:msg.status==='pending'?'#fff7ed':msg.status==='replied'?BRAND.greenLight:'#fff',borderColor:msg.status==='pending'?'#fed7aa':msg.status==='replied'?BRAND.green:BRAND.border,borderRadius:18}}>
              <div className="flex justify-between items-center mb-2"><div className="flex items-center gap-1.5"><span className="font-black text-[8px] px-1.5 py-0.5 rounded text-white" style={{background:msg.status==='pending'?'#f59e0b':msg.status==='replied'?BRAND.green:BRAND.slate}}>{msg.status==='pending'?'⏳ معلقة':msg.status==='replied'?'✅ تم الرد':'🔒 مغلقة'}</span><span className="text-[9px] font-bold" style={{color:BRAND.slateMuted}}>{formatMsgTime(msg.timestamp)}</span></div><span className="font-black text-[9px] px-2 py-0.5 rounded" style={{background:BRAND.blueSoft,color:BRAND.slate}}>{getTypeEmoji(msg.type)} {getTypeLabel(msg.type)}</span></div>
              <div className="flex items-center justify-between mb-2 p-1.5 rounded-lg border bg-slate-50" style={{borderColor:BRAND.border}}><span className="font-mono font-bold text-[10px]" style={{color:BRAND.blue}}>{msg.userPhone}</span><div className="flex items-center gap-1.5">{msg.userName&&<span className="font-black text-[10px]" style={{color:BRAND.navy}}>{msg.userName}</span>}{msg.carPlate&&<span className="font-black font-mono text-[10px]" style={{color:BRAND.blue}}>🚗 {msg.carPlate}</span>}</div></div>
              {msg.subject&&<div className="font-black mb-1 text-right text-xs" style={{color:BRAND.navy}}>{msg.subject}</div>}
              <div className={`text-right leading-relaxed mb-2 cursor-pointer ${isExp?'':'line-clamp-2'}`} style={{fontSize:'11px',fontWeight:950,color:'#000'}} onClick={()=>setExpandedMessage(isExp?null:msg.id)}>{msg.message}</div>
              {!isExp&&msg.message.length>80&&<button onClick={()=>setExpandedMessage(msg.id)} className="font-black mb-2 text-blue-600 border-0 bg-transparent cursor-pointer" style={{fontSize:9.5}}>عرض الكامل ↓</button>}
              {msg.reply&&<div className="mb-2.5 p-2.5 rounded-lg border" style={{background:BRAND.greenLight,borderColor:BRAND.green}}><div className="font-black text-right mb-1 text-[9px]" style={{color:BRAND.greenDark}}>ردك السابق:</div><div className="text-right leading-relaxed text-[11px] font-bold" style={{color:BRAND.navy}}>{msg.reply}</div></div>}
              {msg.status!=='closed'&&(isRep?<div className="space-y-2"><textarea value={replyText} onChange={e=>setReplyText(e.target.value)} placeholder="اكتب ردك هنا..." rows={3} className="w-full font-bold text-right outline-none resize-none text-xs p-2.5 rounded-xl border border-slate-200"/><div className="flex gap-2"><button onClick={async()=>{if(!replyText.trim()){toast.error('اكتب الرد');return;}await replyMessage(msg.id,replyText.trim());toast.success('تم ✅');setReplyText('');setReplyingTo(null);}} className="flex-1 font-black py-2 rounded-lg text-xs cursor-pointer border-0 text-white flex items-center justify-center gap-1" style={{background:BRAND.greenDark}}><Send size={12}/>إرسال</button><button onClick={()=>{setReplyingTo(null);setReplyText('');}} className="font-black py-2 px-4 rounded-lg text-xs cursor-pointer border bg-white" style={{color:BRAND.slate,borderColor:BRAND.border}}>إلغاء</button></div></div>:<div className="flex gap-2"><button onClick={()=>{setReplyingTo(msg.id);setReplyText('');setExpandedMessage(msg.id);}} className="flex-1 font-black py-2 rounded-lg text-xs cursor-pointer border-0 text-white flex items-center justify-center gap-1" style={{background:BRAND.blue}}><Send size={12}/>{msg.reply?'تعديل الرد':'الرد على الرسالة'}</button><button onClick={async()=>{await closeMessage(msg.id);toast.success('تم الإغلاق');}} className="font-black py-2 px-4 rounded-lg text-xs cursor-pointer border bg-white" style={{color:BRAND.slate,borderColor:BRAND.border}}>إلغاء</button></div>)}
            </div>);
          })}
        </div>
      </div>

      {/* ══ VIP Report ══ */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3"><span className="font-black text-[9px] px-2.5 py-1 rounded-full text-white flex items-center gap-1" style={{background:`linear-gradient(135deg,${BRAND.blue},${BRAND.blueDark})`}}><Zap size={10}/> {vipReportStats.totalSessions} ركنة</span><h3 className="font-black text-sm flex items-center gap-2" style={{color:BRAND.navy}}>تقارير خدمة VIP ⚡</h3></div>
        <div className="mb-4" style={{background:BRAND.card,border:`1px solid ${BRAND.border}`,borderRadius:20,padding:14,boxShadow:'0 2px 12px rgba(0,0,0,0.02)'}}>
          <div className="flex items-center gap-1.5 mb-3"><input type="date" value={vipReportDateFrom} onChange={e=>{setVipReportDateFrom(e.target.value);setVipVisibleSessions(20);}} className="flex-1 font-black outline-none text-center font-mono py-2 rounded-xl text-xs border border-slate-200" style={{background:BRAND.blueSoft,color:BRAND.blueDark}}/><span className="font-black text-slate-400 text-xs">←</span><input type="date" value={vipReportDateTo} onChange={e=>{setVipReportDateTo(e.target.value);setVipVisibleSessions(20);}} className="flex-1 font-black outline-none text-center font-mono py-2 rounded-xl text-xs border border-slate-200" style={{background:BRAND.blueSoft,color:BRAND.blueDark}}/><CalendarDays size={16} style={{color:BRAND.blue}} className="shrink-0"/></div>
          <div className="flex gap-1.5 mb-3">{[{l:'📅 اليوم',o:()=>{setVipReportDateFrom(getLocalToday());setVipReportDateTo(getLocalToday());},a:vipReportDateFrom===getLocalToday()&&vipReportDateTo===getLocalToday()},{l:'أمس',o:()=>{setVipReportDateFrom(getLocalYesterday());setVipReportDateTo(getLocalYesterday());},a:vipReportDateFrom===getLocalYesterday()&&vipReportDateTo===getLocalYesterday()},{l:'أسبوع',o:()=>{setVipReportDateFrom(getLocalDaysAgo(7));setVipReportDateTo(getLocalToday());},a:vipReportDateFrom===getLocalDaysAgo(7)&&vipReportDateTo===getLocalToday()},{l:'شهر',o:()=>{setVipReportDateFrom(getLocalDaysAgo(30));setVipReportDateTo(getLocalToday());},a:vipReportDateFrom===getLocalDaysAgo(30)&&vipReportDateTo===getLocalToday()}].map(b=>(<button key={b.l} onClick={()=>{b.o();setVipVisibleSessions(20);}} className="flex-1 font-black py-2 rounded-lg text-xs cursor-pointer border-0 active:scale-95 transition-all" style={{background:b.a?BRAND.blue:BRAND.blueSoft,color:b.a?'#fff':BRAND.slate,border:b.a?'none':`1px solid ${BRAND.border}`}}>{b.l}</button>))}</div>
          <div className="flex items-center gap-2 mb-2"><select value={vipGarageFilter} onChange={e=>{setVipGarageFilter(e.target.value);setVipVisibleSessions(20);}} className="flex-1 font-bold text-right outline-none text-xs py-2.5 px-3 rounded-lg border border-slate-200" style={{color:BRAND.navy}}><option value="all">كل جراجات VIP</option>{vipGarages.map((g:any)=>(<option key={g.id} value={g.id}>🅿️ {g.name}</option>))}</select><Filter size={14} style={{color:BRAND.blue}} className="shrink-0"/></div>
          <div className="flex gap-2"><select value={vipPaymentFilter} onChange={e=>{setVipPaymentFilter(e.target.value);setVipVisibleSessions(20);}} className="flex-1 font-bold text-right outline-none text-xs py-2.5 px-3 rounded-lg border border-slate-200" style={{color:BRAND.navy}}><option value="all">كل طرق الدفع</option><option value="cash">💵 نقدي</option><option value="wallet">👝 محفظة</option><option value="instapay">📱 إنستاباي</option></select><div className="flex-1 relative"><Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2" style={{color:BRAND.slateMuted}}/><input type="text" value={vipPlateSearch} onChange={e=>{setVipPlateSearch(e.target.value);setVipVisibleSessions(20);}} placeholder="🔍 لوحة..." className="w-full font-bold text-right outline-none text-xs py-2.5 px-8 rounded-lg border border-slate-200" style={{color:BRAND.navy}}/>{vipPlateSearch&&<button onClick={()=>setVipPlateSearch('')} className="absolute left-2 top-1/2 -translate-y-1/2 border-0 bg-transparent cursor-pointer" style={{color:BRAND.slateMuted}}><X size={12}/></button>}</div></div>
        </div>

        {/* ✅ VIP Stats: 4 cards — Paid Revenue, Paid Count, Free Count, VIP Fees */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <div className="text-center p-3 rounded-2xl border" style={{background:BRAND.card,borderColor:BRAND.border}}>
            <div className="text-[9px] font-bold" style={{color:BRAND.slate}}>💰 إيراد الركنات المدفوعة</div>
            <div className="font-black font-mono text-lg mt-1" style={{color:BRAND.greenDark}}>{vipReportStats.totalRevenue.toFixed(0)}</div>
            <div className="text-[8px] font-bold" style={{color:BRAND.slateMuted}}>ج.م (من {vipReportStats.paidCount} ركنة)</div>
          </div>
          <div className="text-center p-3 rounded-2xl border" style={{background:BRAND.card,borderColor:BRAND.border}}>
            <div className="text-[9px] font-bold" style={{color:BRAND.slate}}>🚗 إجمالي الركنات</div>
            <div className="font-black font-mono text-lg mt-1" style={{color:BRAND.blue}}>{vipReportStats.totalSessions}</div>
            <div className="text-[8px] font-bold" style={{color:BRAND.slateMuted}}>ركنة VIP</div>
          </div>
          <div className="text-center p-3 rounded-2xl border" style={{background:'#fefce8',borderColor:'#fde047'}}>
            <div className="text-[9px] font-bold" style={{color:'#854d0e'}}>🎁 ركنات مجانية</div>
            <div className="font-black font-mono text-lg mt-1" style={{color:'#ca8a04'}}>{vipReportStats.freeCount}</div>
            <div className="text-[8px] font-bold" style={{color:'#a16207'}}>من الركنة التالتة</div>
          </div>
          <div className="text-center p-3 rounded-2xl" style={{background:`linear-gradient(135deg,${BRAND.blueSoft} 0%,${BRAND.blueLight} 100%)`,border:`1.5px solid ${BRAND.blue}40`}}>
            <div className="text-[9px] font-black flex items-center justify-center gap-0.5" style={{color:BRAND.blueDark}}><Zap size={10}/> رسوم VIP</div>
            <div className="font-black font-mono text-lg mt-1" style={{color:BRAND.blue}}>{vipReportStats.totalBookingFees.toFixed(0)}</div>
            <div className="text-[8px] font-bold" style={{color:BRAND.blueDark}}>ج.م ({BOOKING_FEE}ج × {vipReportStats.paidCount} مدفوعة)</div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-1 mb-4 py-2 px-3 rounded-xl border" style={{background:BRAND.bg,borderColor:BRAND.border}}>{[{icon:'💵',label:'نقدي',count:vipReportStats.cashCount,color:BRAND.greenDark},{icon:'👝',label:'محفظة',count:vipReportStats.walletCount,color:BRAND.blue},{icon:'📱',label:'إنستا',count:vipReportStats.instapayCount,color:'#7c3aed'},{icon:'🎁',label:'مجاني',count:vipReportStats.freeCount,color:'#ca8a04'}].map((p,i)=>(<div key={i} className="flex items-center gap-1 text-[10px]"><span>{p.icon}</span><span className="font-black font-mono" style={{color:p.color}}>{p.count}</span>{i<3&&<div style={{width:1,height:14,background:BRAND.border,marginLeft:4,marginRight:2}}/>}</div>))}</div>

        {/* Per-garage accordion */}
        <div className="mb-4 space-y-2">
          <div className="flex items-center justify-between px-1"><span className="font-black text-[9px] px-2 py-0.5 rounded bg-slate-200" style={{color:BRAND.slate}}>عرض {Math.min(visibleVipGarages,vipReportStats.perGarage.length)} من {vipReportStats.perGarage.length} جراج</span><h4 className="font-black text-[11px]" style={{color:BRAND.navy}}>📊 تفصيلة كل جراج VIP</h4></div>
          {vipReportStats.perGarage.length===0?<div className="text-center py-8 border-2 border-dashed rounded-2xl" style={{background:BRAND.card,borderColor:BRAND.border}}><span className="text-2xl block mb-1">📭</span><p className="font-black text-[11px]" style={{color:BRAND.slateMuted}}>لا توجد ركنات VIP في هذه الفترة</p></div>:(<>
            {vipReportStats.perGarage.slice(0,visibleVipGarages).map((g:any)=>{const isExp=vipExpandedGarageId===g.id;const gs=vipFilteredSessions.filter((s:any)=>s.garageId===g.id);return(<div key={g.id} className="transition-all" style={{background:BRAND.card,border:`1.5px solid ${isExp?BRAND.blue:BRAND.border}`,borderRadius:18,overflow:'hidden'}}>
              <div onClick={()=>setVipExpandedGarageId(isExp?null:g.id)} className="flex justify-between items-center p-3.5 cursor-pointer active:scale-[0.99] transition-all">
                <div className="flex items-center gap-2">
                  <div className="text-center"><div className="font-black font-mono text-base" style={{color:BRAND.greenDark}}>{g.revenue.toFixed(0)}</div><div className="text-[8px] font-bold" style={{color:BRAND.slateMuted}}>ج.م إيراد</div></div>
                  <div style={{width:1,height:28,background:BRAND.border}}/>
                  <div className="text-center"><div className="font-black font-mono text-sm" style={{color:BRAND.blue}}>{g.fees.toFixed(0)}</div><div className="text-[8px] font-bold" style={{color:BRAND.slateMuted}}>ج.م رسوم</div></div>
                  <div style={{width:1,height:28,background:BRAND.border}}/>
                  <div className="text-center"><div className="font-black font-mono text-sm" style={{color:BRAND.navy}}>{g.count}</div><div className="text-[8px] font-bold" style={{color:BRAND.slateMuted}}>ركنة</div></div>
                  <div style={{width:1,height:28,background:BRAND.border}}/>
                  <div className="text-center"><div className="font-black font-mono text-sm" style={{color:'#ca8a04'}}>{g.freeCount}</div><div className="text-[8px] font-bold" style={{color:'#a16207'}}>🎁 مجاني</div></div>
                  {isExp?<ChevronUp size={14} style={{color:BRAND.slateMuted}}/>:<ChevronDown size={14} style={{color:BRAND.slateMuted}}/>}
                </div>
                <div className="text-right"><div className="font-black text-xs flex items-center justify-end gap-1" style={{color:BRAND.navy}}><span>{g.name}</span><Zap size={11} style={{color:BRAND.blue}}/></div><div className="text-[9px] font-bold mt-0.5" style={{color:BRAND.slate}}>{g.area}</div></div>
              </div>
              <AnimatePresence>{isExp&&(<motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} style={{borderTop:`1px solid ${BRAND.border}`,background:BRAND.bg}}>
                <div className="max-h-[320px] overflow-y-auto">{gs.length===0?<div className="text-center py-6 text-xs font-bold" style={{color:BRAND.slateMuted}}>لا توجد ركنات</div>:<div className="divide-y" style={{borderColor:BRAND.border}}>{gs.map((s:any)=>{const stMs=toMs(s.startTime);const enMs=toMs(s.endTime);const free=isSessionFree(s);const rev=free?0:(s.totalPrice||0);return(<div key={s.id} className="px-4 py-2.5 flex items-center justify-between gap-2" style={{background:free?'#fefce8':BRAND.card}}><div className="text-right flex-1 min-w-0"><div className="font-black text-xs truncate" style={{color:BRAND.navy}}>🚗 {s.carPlate} {free&&<span className="text-[8px] px-1 py-0.5 rounded bg-yellow-300 text-yellow-800 mr-1">🎁 مجانية</span>}</div><div className="flex items-center gap-1.5 justify-end mt-0.5 flex-wrap"><span className="font-mono text-[9px] font-bold" style={{color:BRAND.slateMuted}}>{formatSessionTime(s.startTime)}</span><span className="text-[8px]" style={{color:BRAND.border}}>→</span><span className="font-mono text-[9px] font-bold" style={{color:BRAND.slateMuted}}>{formatSessionTime(s.endTime)}</span></div></div><div className="text-center px-2"><div className="font-mono font-black text-[10px]" style={{color:BRAND.slate}}>{formatDuration(stMs,enMs)}</div></div><div className="text-left flex-shrink-0"><div className="font-black font-mono text-xs" style={{color:free?'#ca8a04':BRAND.greenDark}}>{free?'مجاني':`${rev.toFixed(0)} ج.م`}</div>{!free&&<div className="flex items-center gap-1 mt-0.5"><span className="font-black text-[7px] px-1.5 py-0.5 rounded text-white" style={{background:BRAND.blue}}>⚡{BOOKING_FEE}ج</span><span className="font-black text-[7px] px-1.5 py-0.5 rounded text-white" style={{background:s.paymentMethod==='cash'?BRAND.greenDark:s.paymentMethod==='wallet'?BRAND.blue:s.paymentMethod==='instapay'?'#7c3aed':BRAND.slate}}>{s.paymentMethod==='cash'?'💵':s.paymentMethod==='wallet'?'👝':s.paymentMethod==='instapay'?'📱':'📲'}</span></div>}</div></div>);})}</div>}</div>
              </motion.div>)}</AnimatePresence>
            </div>);})}
            {vipReportStats.perGarage.length>visibleVipGarages&&<div className="mt-3 text-center"><button onClick={()=>setVisibleVipGarages(p=>p+10)} className="w-full font-black py-2.5 rounded-xl text-[10px] cursor-pointer bg-white border active:scale-95 transition-all flex items-center justify-center gap-1.5" style={{color:BRAND.blue,borderColor:BRAND.border}}><ChevronDown size={14}/><span>عرض المزيد ({vipReportStats.perGarage.length-visibleVipGarages} جراج آخر)</span></button></div>}
          </>)}
        </div>

        {/* Full VIP sessions table */}
        <div>
          <div className="flex items-center justify-between mb-2 px-1"><span className="font-bold text-[9px]" style={{color:BRAND.slateMuted}}>عرض {Math.min(vipVisibleSessions,vipFilteredSessions.length)} من {vipFilteredSessions.length} عملية</span><h4 className="font-black text-[11px]" style={{color:BRAND.navy}}>📋 تفاصيل كل العمليات VIP</h4></div>
          <div className="rounded-2xl border overflow-hidden" style={{background:BRAND.card,borderColor:BRAND.border}}>
            {vipFilteredSessions.length===0?<div className="text-center py-10"><span className="text-2xl block mb-1">📭</span><p className="font-black text-xs" style={{color:BRAND.slateMuted}}>{vipPlateSearch?`لا توجد نتائج لـ "${vipPlateSearch}"`:'لا توجد عمليات VIP في الفترة المحددة'}</p></div>:(<>
              <div className="grid px-3 py-2" style={{gridTemplateColumns:'1fr auto auto auto',gap:8,background:BRAND.navy,color:'#fff'}}><div className="font-black text-[9px] text-right">اللوحة + الجراج</div><div className="font-black text-[9px] text-center">المدة</div><div className="font-black text-[9px] text-center">المبلغ</div><div className="font-black text-[9px] text-center">الدفع</div></div>
              <div className="max-h-[400px] overflow-y-auto divide-y" style={{borderColor:BRAND.border}}>{vipFilteredSessions.slice(0,vipVisibleSessions).map((s:any)=>{const g=garages.find((ga:any)=>ga.id===s.garageId);const stMs=toMs(s.startTime);const enMs=toMs(s.endTime);const free=isSessionFree(s);const rev=free?0:(s.totalPrice||0);return(<div key={s.id} className="grid px-3 py-2.5 items-center" style={{gridTemplateColumns:'1fr auto auto auto',gap:8,background:free?'#fefce8':'transparent'}}><div className="text-right min-w-0"><div className="font-black text-[11px] truncate" style={{color:BRAND.navy}}>🚗 {s.carPlate} {free&&<span className="text-[7px] px-1 py-0.5 rounded bg-yellow-300 text-yellow-800">🎁</span>}</div><div className="font-bold text-[9px] truncate" style={{color:BRAND.slate}}>{g?.name||'—'}</div><div className="font-mono text-[8px]" style={{color:BRAND.slateMuted}}>{formatSessionTime(s.endTime)}</div></div><div className="font-mono font-black text-[10px] text-center" style={{color:BRAND.slate}}>{formatDuration(stMs,enMs)}</div><div className="text-center"><div className="font-black font-mono text-[11px]" style={{color:free?'#ca8a04':BRAND.greenDark}}>{free?'مجاني':`${rev.toFixed(0)}ج`}</div>{!free&&<div className="font-black text-[7px]" style={{color:BRAND.blue}}>+{BOOKING_FEE}ج⚡</div>}</div><div className="text-center"><span className="font-black text-[8px] px-1.5 py-0.5 rounded text-white" style={{background:free?'#ca8a04':s.paymentMethod==='cash'?BRAND.greenDark:s.paymentMethod==='wallet'?BRAND.blue:s.paymentMethod==='instapay'?'#7c3aed':BRAND.slate}}>{free?'🎁':s.paymentMethod==='cash'?'💵':s.paymentMethod==='wallet'?'👝':s.paymentMethod==='instapay'?'📱':'📲'}</span></div></div>);})}</div>
              {vipFilteredSessions.length>vipVisibleSessions&&<div className="p-3 border-t text-center" style={{borderColor:BRAND.border}}><button onClick={()=>setVipVisibleSessions(p=>p+10)} className="w-full font-black py-2.5 rounded-xl text-[10px] cursor-pointer bg-white border active:scale-95 transition-all flex items-center justify-center gap-1.5" style={{color:BRAND.blue,borderColor:BRAND.border}}><ChevronDown size={14}/><span>عرض المزيد ({vipFilteredSessions.length-vipVisibleSessions} عملية أخرى)</span></button></div>}
            </>)}
          </div>
        </div>
      </div>

      {/* ══ Garage Management ══ */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-3"><span className="font-black text-[9px] px-2.5 py-1 rounded bg-slate-200" style={{color:BRAND.slate}}>{filteredGaragesForAdmin.length} جراج نشط بالقسم</span><h3 className="font-black text-xs" style={{color:BRAND.navy}}>إدارة وجرد الجراجات</h3></div>
        <div className="flex p-1 rounded-xl bg-slate-100 border border-slate-200 mb-3" style={{direction:'rtl'}}>
          <button type="button" onClick={()=>setAdminGarageTab('vip')} className="flex-1 py-2 rounded-lg font-black text-[10px] cursor-pointer border-0 transition-all flex items-center justify-center gap-1" style={{background:adminGarageTab==='vip'?BRAND.blue:'transparent',color:adminGarageTab==='vip'?'#fff':BRAND.slate,boxShadow:adminGarageTab==='vip'?'0 2px 6px rgba(22,86,184,0.15)':'none'}}><span>⭐ جراجات VIP الشريكة</span></button>
          <button type="button" onClick={()=>setAdminGarageTab('directory')} className="flex-1 py-2 rounded-lg font-black text-[10px] cursor-pointer border-0 transition-all flex items-center justify-center gap-1" style={{background:adminGarageTab==='directory'?BRAND.blueDark:'transparent',color:adminGarageTab==='directory'?'#fff':BRAND.slate,boxShadow:adminGarageTab==='directory'?'0 2px 6px rgba(15,61,133,0.15)':'none'}}><span>🧭 دليل الركنات المجاني</span></button>
        </div>

        <div className="space-y-3 mb-4"><div className="relative"><Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{color:BRAND.slateMuted}}/><input type="text" value={garageSearch} onChange={e=>setGarageSearch(e.target.value)} placeholder="ابحث عن جراج بالاسم..." className="w-full font-bold outline-none text-xs py-2.5 px-9 rounded-xl border border-slate-200" style={{color:BRAND.navy}}/>{garageSearch&&<button onClick={()=>setGarageSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 border-0 bg-transparent cursor-pointer" style={{color:BRAND.slateMuted}}><X size={14}/></button>}</div></div>
        <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
          {filteredGaragesForAdmin.length===0?<div className="text-center py-10 bg-white border rounded-2xl" style={{borderColor:BRAND.border}}><div className="text-2xl mb-1">🔍</div><p className="font-bold text-xs" style={{color:BRAND.slateMuted}}>لا توجد جراجات مطابقة للبحث</p></div>:filteredGaragesForAdmin.slice(0,visibleGarageCount).map((g:any)=>{
            const isEditingComm=editingCommissionGarageId===g.id;const isDirectory=g.garageType==='directory';const ownerPhone=(g as any).ownerPhone||g.phone;const sameOwnerCount=garages.filter((x:any)=>normalizePhone(x.ownerPhone||x.phone)===normalizePhone(ownerPhone)).length;
            return(<div key={g.id} className="border p-3.5" style={{background:BRAND.card,borderColor:BRAND.border,borderRadius:18}}>
              <div className="flex justify-between items-center mb-2"><div className="flex items-center gap-1">{isDirectory?<span className="font-black text-[9px] px-2.5 py-1 rounded-xl text-white bg-slate-600 flex items-center gap-1">🧭 دليل مجاني</span>:<div className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-white" style={{background:BRAND.blue}}><span className="font-black font-mono text-sm">{g.availableSpots}</span><span className="font-bold text-[9px] opacity-80">شاغر</span></div>}</div><div className="text-right flex items-center gap-1.5 flex-wrap justify-end">{sameOwnerCount>1&&!isDirectory&&<span className="font-black text-[9px] px-2 py-0.5 rounded" style={{background:BRAND.blueSoft,color:BRAND.blue}}>👑 {sameOwnerCount}</span>}<span className="font-black text-xs" style={{color:BRAND.navy}}>{g.name}</span></div></div>
              <div className="flex items-center justify-between mb-3 gap-2"><div className="flex flex-wrap gap-1 justify-start">{isDirectory?<span className="text-[9px] font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded">💵 الدفع نقدي للسايس</span>:[{n:1,name:(g as any).valetName1,pw:(g as any).valetPassword1,color:BRAND.blue},{n:2,name:(g as any).valetName2,pw:(g as any).valetPassword2,color:'#7c3aed'},{n:3,name:(g as any).valetName3,pw:(g as any).valetPassword3,color:'#f59e0b'}].filter(v=>v.pw).map(v=>(<span key={v.n} className="font-bold text-[8px] px-1.5 py-0.5 rounded" style={{color:v.color,background:BRAND.bg,border:`1px solid ${BRAND.border}`}}>👤 {v.name||`س${v.n}`}</span>))}</div><div className="flex items-center gap-1.5 text-slate-500 font-bold text-[9px]"><span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[8px] font-black">🗺️ {g.area||'مناطق أخرى'}</span><span style={{color:'#E2E8F0'}}>·</span><span className="truncate max-w-[100px]">{g.location}</span><MapPin size={10} className="shrink-0 text-slate-400"/></div></div>
              <div className="flex flex-col gap-2 mb-3 p-3 rounded-xl border bg-slate-50" style={{borderColor:BRAND.border}}>
                <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-1">{!isEditingComm?<button onClick={()=>{setEditingCommissionGarageId(g.id);setEditCommissionRate(g.commissionRate??10);setEditArea(g.area||'وسط البلد');setEditGarageType(g.garageType||'vip');setEditPriceType(g.priceType||'hourly');setEditBasePrice(g.basePrice||15);setEditDailyPrice(g.dailyPrice||20);setEditMonthlyPrice(g.monthlyPrice||1500);}} className="font-black border-0 py-1 px-2.5 rounded-lg text-[9px] cursor-pointer text-white" style={{background:'#f59e0b'}}>تعديل البيانات</button>:<div className="flex items-center gap-1"><button onClick={()=>handleSaveGarageData(g.id)} className="font-black py-1 px-2.5 rounded-lg text-[9px] cursor-pointer border-0 text-white" style={{background:BRAND.greenDark}}>حفظ</button><button onClick={()=>setEditingCommissionGarageId(null)} className="font-black py-1 px-2.5 rounded-lg text-[9px] cursor-pointer border bg-white" style={{color:BRAND.slate,borderColor:BRAND.border}}>✕</button></div>}</div><div className="flex items-center gap-1">{isDirectory?<span className="font-black text-xs text-slate-700">{g.priceType==='daily'?`${g.dailyPrice||g.basePrice}ج/يوم`:g.priceType==='monthly'?`${g.monthlyPrice||1500}ج/شهر`:`${g.basePrice}ج/ساعة`}</span>:<><Percent size={11} style={{color:BRAND.slate}}/><span className="font-black font-mono text-xs" style={{color:BRAND.navy}}>{isEditingComm?editCommissionRate:(g.commissionRate??10)}%</span><span className="font-bold text-[9px]" style={{color:BRAND.slateMuted}}>عمولة المنصة</span></>}</div></div>
                {isEditingComm&&(<div className="pt-2 border-t border-dashed space-y-2 text-right" style={{borderColor:BRAND.border}}>
                  <div className="flex justify-between items-center gap-2"><select value={editGarageType} onChange={e=>setEditGarageType(e.target.value as any)} className="font-bold outline-none text-right rounded-lg px-2 py-1 text-xs border"><option value="vip">🤝 شريك VIP معتمد</option><option value="directory">🧭 دليل ركنة مجاني</option></select><span className="font-black text-[10px]" style={{color:BRAND.slate}}>نوع الجراج:</span></div>
                  <div className="flex justify-between items-center gap-2"><select value={editArea} onChange={e=>setEditArea(e.target.value)} className="font-bold outline-none text-right rounded-lg px-2 py-1 text-xs border">{AREA_OPTIONS.map(a=>(<option key={a} value={a}>{AREA_EMOJI[a]||'📍'} {a}</option>))}</select><span className="font-black text-[10px]" style={{color:BRAND.slate}}>🗺️ المنطقة الجغرافية:</span></div>
                  {editGarageType==='vip'&&(<div className="flex justify-between items-center gap-2 pt-1 border-t border-dashed border-slate-200"><div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200"><button type="button" onClick={()=>setEditCommissionRate(r=>Math.max(0,r-1))} className="border-0 cursor-pointer flex items-center justify-center rounded bg-red-100 text-red-600 font-black" style={{width:22,height:24}}><Minus size={11}/></button><input type="number" value={editCommissionRate} onChange={e=>setEditCommissionRate(Math.max(0,Math.min(100,parseInt(e.target.value,10)||0)))} className="bg-transparent text-center outline-none font-mono font-black text-xs border-0" style={{width:34,color:'#f59e0b'}}/><button type="button" onClick={()=>setEditCommissionRate(r=>Math.min(100,r+1))} className="border-0 cursor-pointer flex items-center justify-center rounded bg-emerald-100 text-emerald-600 font-black" style={{width:22,height:24}}><Plus size={11}/></button></div><span className="font-black text-[10px]" style={{color:BRAND.slate}}>📊 نسبة عمولة المنصة (%):</span></div>)}
                  {editGarageType==='directory'&&(<><div className="flex justify-between items-center gap-2"><select value={editPriceType} onChange={e=>setEditPriceType(e.target.value as any)} className="font-bold outline-none text-right rounded-lg px-2 py-1 text-xs border"><option value="hourly">⏱️ بالساعة</option><option value="daily">☀️ يومي ثابت</option><option value="monthly">📅 اشتراك شهري</option></select><span className="font-black text-[10px]" style={{color:BRAND.slate}}>هيكل التسعير:</span></div><div className="flex justify-between items-center gap-2">{editPriceType==='hourly'&&<input type="number" value={editBasePrice} onChange={e=>setEditBasePrice(parseInt(e.target.value,10)||0)} className="w-24 text-center border p-1 rounded font-mono text-xs"/>}{editPriceType==='daily'&&<input type="number" value={editDailyPrice} onChange={e=>setEditDailyPrice(parseInt(e.target.value,10)||0)} className="w-24 text-center border p-1 rounded font-mono text-xs"/>}{editPriceType==='monthly'&&<input type="number" value={editMonthlyPrice} onChange={e=>setEditMonthlyPrice(parseInt(e.target.value,10)||0)} className="w-24 text-center border p-1 rounded font-mono text-xs"/>}<span className="font-black text-[10px]" style={{color:BRAND.slate}}>قيمة السعر الفعلي:</span></div></>)}
                </div>)}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={()=>{const ns=g.isActive===false?true:false;updateGarage(g.id,{isActive:ns});toast.success(ns?`تم تفعيل ${g.name} 🟢`:`تم تعطيل ${g.name} 🔴`);}} className="font-black py-2 px-3 rounded-xl text-[10px] cursor-pointer border-0 text-white flex items-center justify-center gap-1" style={{background:g.isActive!==false?BRAND.greenDark:'#dc2626'}}><span>{g.isActive!==false?'🟢 مفعّل':'🔴 معطّل'}</span></button>
                {!isDirectory&&<button onClick={()=>handleAdminEnterGarage(g)} className="flex-1 font-black py-2 rounded-xl text-xs cursor-pointer border-0 text-white flex items-center justify-center gap-1.5" style={{background:BRAND.blue}}><Navigation size={14}/>دخول وإدارة الجراج</button>}
              </div>
            </div>);
          })}
        </div>
        {filteredGaragesForAdmin.length>visibleGarageCount&&<div className="mt-4 text-center"><button onClick={()=>setVisibleGarageCount(p=>p+10)} className="w-full font-black py-3 rounded-xl text-xs cursor-pointer border-0 text-white active:scale-[0.98] transition-all flex items-center justify-center gap-2" style={{background:BRAND.blue,boxShadow:`0 4px 14px ${BRAND.blue}25`}}><ChevronDown size={14}/><span>عرض 10 جراجات إضافية (متبقي {filteredGaragesForAdmin.length-visibleGarageCount})</span></button></div>}
        {filteredGaragesForAdmin.length>10&&<div className="mt-2 text-center"><span className="font-bold text-[9px]" style={{color:BRAND.slateMuted}}>📊 يتم عرض {Math.min(visibleGarageCount,filteredGaragesForAdmin.length)} من إجمالي {filteredGaragesForAdmin.length} جراج</span></div>}
      </div>

      {/* ══ Add Garage ══ */}
      <div className="mb-20">
        <h3 className="font-black mb-3 text-right text-xs" style={{color:BRAND.navy}}>إضافة جراج جديد للشبكة</h3>
        <div className="space-y-4 p-5 bg-white border" style={{borderColor:BRAND.border,borderRadius:24}}>
          <div className="text-right"><label className="font-black block text-right mb-1.5 text-[10px]" style={{color:BRAND.slate}}>نوع الجراج المضاف للشبكة</label><select value={gType==='partner'?'vip':gType} onChange={e=>setGType(e.target.value as any)} className="w-full font-bold text-right outline-none text-xs py-2.5 px-3 rounded-lg border border-slate-200" style={{color:BRAND.navy}}><option value="vip">🤝 جراج شريك VIP معتمد</option><option value="directory">🧭 دليل ركنات مجاني</option></select></div>
          <input className="w-full font-bold text-right outline-none text-xs py-2.5 px-3 rounded-lg border border-slate-200" style={{color:BRAND.navy}} placeholder="اسم الجراج أو الساحة" value={gName} onChange={e=>setGName(e.target.value)}/>
          {gType==='partner'&&<div className="flex gap-2"><input className="flex-1 font-bold text-right outline-none text-xs py-2.5 px-3 rounded-lg border border-slate-200" style={{color:BRAND.navy}} placeholder="اسم المستخدم" value={gUser} onChange={e=>setGUser(e.target.value)}/><input className="flex-1 font-bold text-right outline-none text-xs py-2.5 px-3 rounded-lg border border-slate-200" style={{color:BRAND.navy}} placeholder="رقم هاتف المالك" value={gPhone} onChange={e=>setGPhone(e.target.value)}/></div>}
          <div className="text-right"><label className="font-black block text-right mb-1.5 text-[10px]" style={{color:BRAND.slate}}>🗺️ المنطقة الجغرافية للجراج</label><select value={gArea} onChange={e=>setGArea(e.target.value)} className="w-full font-bold text-right outline-none text-xs py-2.5 px-3 rounded-lg border border-slate-200" style={{color:BRAND.navy}}><option value="وسط البلد">🏢 وسط البلد</option><option value="مصر الجديدة">🏰 مصر الجديدة</option><option value="مدينة نصر">🏙️ مدينة نصر</option><option value="المعادي">🌳 المعادي</option><option value="المهندسين">🛍️ المهندسين</option><option value="الدقي">🎓 الدقي</option><option value="التجمع الخامس">💎 التجمع الخامس</option><option value="مناطق أخرى">📍 مناطق أخرى</option></select></div>
          {gType==='directory'?<div className="p-3 border rounded-xl" style={{background:BRAND.bg,borderColor:BRAND.border}}><div className="font-bold mb-3 text-right text-[10px]" style={{color:BRAND.slate}}>💰 هيكل وأسعار الركنة</div><div className="space-y-3"><select value={gPriceType} onChange={e=>setGPriceType(e.target.value as any)} className="w-full font-bold text-right outline-none text-xs p-2 rounded-lg border"><option value="hourly">⏱️ ركن بالساعة</option><option value="daily">☀️ سعر يومي ثابت</option><option value="monthly">📅 اشتراك شهري</option></select>{gPriceType==='hourly'&&<div><label className="text-[9px] text-slate-400 block mb-0.5">سعر الساعة:</label><input type="number" value={gBasePrice} onChange={e=>setGBasePrice(parseInt(e.target.value,10)||0)} className="w-full font-bold text-center text-xs p-2 rounded border"/></div>}{gPriceType==='daily'&&<div><label className="text-[9px] text-slate-400 block mb-0.5">سعر اليوم:</label><input type="number" value={gDailyPrice} onChange={e=>setGDailyPrice(parseInt(e.target.value,10)||0)} className="w-full font-bold text-center text-xs p-2 rounded border"/></div>}{gPriceType==='monthly'&&<div><label className="text-[9px] text-slate-400 block mb-0.5">سعر الشهر:</label><input type="number" value={gMonthlyPrice} onChange={e=>setGMonthlyPrice(parseInt(e.target.value,10)||0)} className="w-full font-bold text-center text-xs p-2 rounded border"/></div>}</div></div>:<div className="p-3 border rounded-xl" style={{background:BRAND.bg,borderColor:BRAND.border}}><div className="font-bold mb-3 text-right text-[10px]" style={{color:BRAND.slate}}>👤 حسابات السياس (اختياري)</div>{[{n:1,name:gValet1Name,setName:setGValet1Name,pass:gValet1Pass,setPass:setGValet1Pass,color:BRAND.blue},{n:2,name:gValet2Name,setName:setGValet2Name,pass:gValet2Pass,setPass:setGValet2Pass,color:'#7c3aed'},{n:3,name:gValet3Name,setName:setGValet3Name,pass:gValet3Pass,setPass:setGValet3Pass,color:'#f59e0b'}].map((v,i)=>(<div key={i} className={i<2?'mb-3 pb-3 border-b border-dashed':''} style={{borderColor:BRAND.border}}><div className="flex items-center justify-between mb-1.5"><span className="font-bold text-[9px]" style={{color:(v.name||v.pass)?BRAND.greenDark:BRAND.slateMuted}}>{(v.name||v.pass)?'✅ مفعّل':'❌ غير مفعّل'}</span><span className="font-black text-[10px]" style={{color:BRAND.navy}}>سايس {v.n}</span></div><div className="flex gap-2"><input type="text" value={v.name} onChange={e=>v.setName(e.target.value)} className="flex-1 font-bold text-right outline-none text-xs py-2 px-2.5 rounded-lg border border-slate-200" style={{color:BRAND.navy}} placeholder="الاسم"/><input type="text" value={v.pass} onChange={e=>v.setPass(e.target.value)} className="flex-1 font-mono font-black text-center outline-none text-xs py-2 px-2.5 rounded-lg border border-slate-200" style={{color:BRAND.navy,letterSpacing:2}} placeholder="الباسورد"/></div></div>))}</div>}
          <div className="p-3 border rounded-xl" style={{background:BRAND.bg,borderColor:BRAND.border}}><div className="font-bold mb-2 text-[10px]" style={{color:BRAND.slate}}>📍 تحديد الإحداثيات الجغرافية</div><div className="grid grid-cols-2 gap-3 font-mono">{[{label:'خط العرض',value:lat,set:setLat},{label:'خط الطول',value:lng,set:setLng}].map(c=>(<div key={c.label}><span className="text-[9px] text-slate-400 block mb-0.5">{c.label}</span><input type="number" value={c.value} onChange={e=>c.set(parseFloat(e.target.value))} className="w-full font-bold outline-none text-xs py-2 px-2.5 rounded-lg border border-slate-200" style={{color:BRAND.navy}} step="0.000001"/></div>))}</div></div>
          <div className="text-center p-3 border rounded-xl" style={{background:BRAND.bg,borderColor:BRAND.border}}><div className="font-bold mb-1 text-[11px]" style={{color:BRAND.navy}}>الموقع الإحداثي الحالي للمتصفح</div><div className="font-black font-mono text-xs" style={{color:BRAND.blue}}>{lat.toFixed(4)}, {lng.toFixed(4)}</div><button type="button" onClick={()=>{if('geolocation' in navigator)navigator.geolocation.getCurrentPosition(p=>{setLat(p.coords.latitude);setLng(p.coords.longitude);toast.success('تم تحديد الإحداثيات');},()=>toast.error('تعذر التحديد'));}} className="font-black py-1.5 px-3 rounded-lg text-[10px] cursor-pointer border bg-white mt-2" style={{color:BRAND.blue,borderColor:BRAND.blue}}>📍 استخدام موقعي الحالي</button></div>
          <button onClick={handleAddGarage} className="w-full font-black py-3.5 border-0 text-white rounded-xl text-xs active:scale-[0.98] transition-all cursor-pointer" style={{background:BRAND.blue,boxShadow:`0 4px 14px ${BRAND.blue}25`}}>حفظ وتسجيل الجراج بالشبكة 🚀</button>
        </div>
      </div>
    </div>
  );
}