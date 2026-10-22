// src/components/AdminDashboard.tsx

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Clock, CheckCircle, CheckCircle2, XCircle, MapPin, Warehouse, Plus,
  MessageCircle, Send, Receipt, Search, HardHat, Percent, DollarSign,
  Minus, Edit3, Archive, Lock, ArrowUp, ArrowDown,
  Settings, CalendarDays, Navigation, Globe, X, ExternalLink, HelpCircle,
  Zap, Car, Filter, ChevronDown, ChevronUp, Sparkles, Gift,
} from 'lucide-react';
import { useStore, pausePolling, normalizePlate, normalizePhone, calculateBonus, getServerNow, BOOKING_FEE } from '../store';
import { supabase } from '../lib/supabase';
import { calculateCost } from '../utils/pricing';
import toast from 'react-hot-toast';

const BRAND = {
  blue: '#1656b8', blueDark: '#0f3d85', blueLight: '#e8f0fe', blueSoft: '#f0f5ff',
  green: '#8cc63f', greenDark: '#6ea62a', greenLight: '#f2fae6',
  navy: '#0a1628', slate: '#475569', slateMuted: '#94a3b8',
  border: '#e2e8f0', card: '#ffffff', bg: '#f4f7fc',
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

interface SettlementRecord { id:string; garage_id:string; garage_name:string; settlement_date:string; amount:number; direction:'admin_to_garage'|'garage_to_admin'; session_ids:string[]; session_count:number; wallet_collected:number; commission_amount:number; notes?:string; created_at:string; }

export default function AdminDashboard() {
  const { garages, sessions, walletTopUps, approveTopUp, rejectTopUp, addGarage, setCurrentGarageId, setView, logout, messages, replyMessage, closeMessage, confirmRevenue, unconfirmRevenue, removeSession, updateGarage, fetchAll } = useStore();

  const [dateFrom, setDateFrom] = useState(() => getLocalToday());
  const [dateTo, setDateTo] = useState(() => getLocalToday());
  const [, setTick] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [replyingTo, setReplyingTo] = useState<string|null>(null);
  const [expandedMessage, setExpandedMessage] = useState<string|null>(null);
  const [messagesTab, setMessagesTab] = useState<'pending'|'all'>('pending');
  const [revenueFilter, setRevenueFilter] = useState<'all'|'confirmed'|'pending'>('pending');
  const [sessionSearch, setSessionSearch] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string|null>(null);
  const [processingTopUpId, setProcessingTopUpId] = useState<string|null>(null);
  const [editingCommissionGarageId, setEditingCommissionGarageId] = useState<string|null>(null);
  const [editCommissionRate, setEditCommissionRate] = useState(10);
  const [editArea, setEditArea] = useState('وسط البلد');
  const [editGarageType, setEditGarageType] = useState<'vip'|'directory'>('vip');
  const [editPriceType, setEditPriceType] = useState<'hourly'|'daily'|'monthly'>('hourly');
  const [editBasePrice, setEditBasePrice] = useState(15);
  const [editDailyPrice, setEditDailyPrice] = useState(20);
  const [editMonthlyPrice, setEditMonthlyPrice] = useState(1500);
  const [settlementRecords, setSettlementRecords] = useState<SettlementRecord[]>([]);
  const [confirmSettlementGarageId, setConfirmSettlementGarageId] = useState<string|null>(null);
  const [processingSettlement, setProcessingSettlement] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState('');
  const [visibleSettlements, setVisibleSettlements] = useState(4);
  const [activeAccordionGarageId, setActiveAccordionGarageId] = useState<string|null>(null);
  const [adminGarageTab, setAdminGarageTab] = useState<'vip'|'directory'>('vip');
  const [garageSearch, setGarageSearch] = useState('');
  const [vipReportDateFrom, setVipReportDateFrom] = useState(() => getLocalToday());
  const [vipReportDateTo, setVipReportDateTo] = useState(() => getLocalToday());
  const [vipGarageFilter, setVipGarageFilter] = useState<string>('all');
  const [vipPlateSearch, setVipPlateSearch] = useState('');
  const [vipPaymentFilter, setVipPaymentFilter] = useState<string>('all');
  const [vipExpandedGarageId, setVipExpandedGarageId] = useState<string|null>(null);
  const [vipVisibleSessions, setVipVisibleSessions] = useState(10);
  const [visibleVipGarages, setVisibleVipGarages] = useState(10);
  const [visibleGarageCount, setVisibleGarageCount] = useState(10);
  const [showFreeBookings, setShowFreeBookings] = useState(false);

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

  const filteredGaragesForAdmin = useMemo(() => { const q = garageSearch.trim().toLowerCase(); let l = garages.filter(g => g.garageType === adminGarageTab); if (!q) return l; return l.filter(g => g.name.toLowerCase().includes(q)); }, [garages, garageSearch, adminGarageTab]);

  useEffect(() => { const i = setInterval(() => setTick(t=>t+1), 60000); return () => clearInterval(i); }, []);
  const fetchSettlements = useCallback(async () => { try { const { data, error } = await supabase.from('settlements').select('*').order('created_at',{ascending:false}); if (!error) setSettlementRecords(data??[]); } catch(e) { console.error(e); } }, []);
  useEffect(() => { fetchSettlements(); }, [fetchSettlements]);

  const getRevenue = useCallback((s: any) => {
    const g = garages.find((ga:any) => ga?.id === s.garageId);
    const isVip = g && (g.garageType==='vip' || (g as any).is_vip===true || g.type==='partner');
    if (isVip) return 0;
    if (s.totalPrice != null) return Number(s.totalPrice);
    if (s.endTime && s.startTime) {
      const st = toMs(s.startTime); const en = toMs(s.endTime);
      const rate = Number(s.agreedPrice ?? g?.basePrice ?? 0);
      const el = Math.max(0, Math.floor((en-st)/1000));
      const isFree = s.isFirstFreeSession===true && el<=1800;
      return (isFree ? 0 : calculateCost(el, rate)) + (s.shieldEnabled ? 10 : 0);
    }
    return 0;
  }, [garages]);

  const getCommission = useCallback((s: any) => {
    if (s.commissionAmount != null && s.commissionAmount > 0) return Number(s.commissionAmount);
    if (s.source !== 'app' && !s.shieldEnabled) return 0;
    const rev = getRevenue(s); if (rev <= 0) return 0;
    const g = garages.find((ga:any) => ga?.id === s.garageId);
    const rate = g?.commissionRate ?? 10;
    const bp = s.shieldEnabled ? Math.max(0, rev-10) : rev;
    return Math.round(((bp*rate)/100 + (s.shieldEnabled?5:0))*100)/100;
  }, [garages, getRevenue]);

  const getNetRevenue = useCallback((s: any) => {
    if (s.netRevenue != null && s.netRevenue > 0) return Number(s.netRevenue);
    return Math.round((getRevenue(s)-getCommission(s))*100)/100;
  }, [getRevenue, getCommission]);

  const completedSessions = useMemo(() => sessions.filter(s => s.status==='completed' || s.status==='active'), [sessions]);

  const filteredSessions = useMemo(() => completedSessions.filter(s => { if (!s.endTime) return false; const d = timestampToLocalDate(toMs(s.endTime)); if (dateFrom && d<dateFrom) return false; if (dateTo && d>dateTo) return false; return true; }), [completedSessions, dateFrom, dateTo]);

  const validRevenueSessions = useMemo(() => completedSessions.filter(s => getRevenue(s)>0 || (s.totalPrice||0)>0), [completedSessions, getRevenue]);

  const freeSessionsList = useMemo(() => completedSessions.filter(s => getRevenue(s)===0 && (s.totalPrice||0)===0), [completedSessions, getRevenue]);

  const totalsFromSessions = useMemo(() => {
    let pendingRevenue = 0; let pendingCount = 0;
    validRevenueSessions.forEach(s => { if (!s.revenueConfirmed) { const r = getRevenue(s); if (r>0) { pendingRevenue+=r; pendingCount++; } } });
    const confirmed = validRevenueSessions.filter(s => s.revenueConfirmed);
    return { totalRevenueConfirmed: confirmed.reduce((a,s)=>a+getRevenue(s),0), totalPendingRevenue: pendingRevenue, totalSessionsCount: validRevenueSessions.length, pendingCount };
  }, [validRevenueSessions, getRevenue]);

  const commissionStats = useMemo(() => {
    const confirmed = validRevenueSessions.filter(s => s.revenueConfirmed && !(s as any).settled && (s.source==='app'||s.shieldEnabled));
    const tc = confirmed.reduce((a,s)=>a+getCommission(s),0);
    const tr = confirmed.reduce((a,s)=>a+getRevenue(s),0);
    const perGarage = garages.map(g => { const gs = confirmed.filter(s=>s.garageId===g.id); const gc = gs.reduce((a,s)=>a+getCommission(s),0); const gr = gs.reduce((a,s)=>a+getRevenue(s),0); return { id:g.id, name:g.name, commissionRate:g.commissionRate??10, totalRevenue:gr, commission:gc, netRevenue:gr-gc, walletRevenue:gs.filter(s=>s.paymentMethod==='wallet').reduce((a,s)=>a+getRevenue(s),0), appCount:gs.filter(s=>s.source==='app').length, totalCount:gs.length, sessionIds:gs.map(s=>s.id) }; }).filter(g=>g.totalCount>0);
    const tw = confirmed.filter(s=>s.paymentMethod==='wallet').reduce((a,s)=>a+getRevenue(s),0);
    return { totalCommission:tc, totalRevenue:tr, totalNet:tr-tc, perGarage, totalWalletCollected:tw, totalSettlement:tw-tc };
  }, [validRevenueSessions, garages, getRevenue, getCommission]);

  const garageReport = useMemo(() => garages.map(g => { const gs = validRevenueSessions.filter(s=>s.garageId===g.id); const c = gs.filter(s=>s.revenueConfirmed); const p = gs.filter(s=>!s.revenueConfirmed); return { name:g.name, garageId:g.id, commissionRate:g.commissionRate??10, count:gs.length, revenue:c.reduce((a,s)=>a+getRevenue(s),0), pendingRevenue:p.reduce((a,s)=>a+getRevenue(s),0), cash:c.filter(s=>s.paymentMethod==='cash').reduce((a,s)=>a+getRevenue(s),0), instapay:c.filter(s=>s.paymentMethod==='instapay').reduce((a,s)=>a+getRevenue(s),0), wallet:c.filter(s=>s.paymentMethod==='wallet').reduce((a,s)=>a+getRevenue(s),0), cashwallet:c.filter(s=>s.paymentMethod==='cashwallet').reduce((a,s)=>a+getRevenue(s),0) }; }).filter(r=>r.count>0||r.revenue>0||r.pendingRevenue>0), [garages, validRevenueSessions, getRevenue]);

  const pendingTopUps = walletTopUps.filter(w => w.status==='pending');

  const displayedRevenueSessions = useMemo(() => {
    const q = sessionSearch.trim().toUpperCase();
    let f = q ? completedSessions.filter(s=>getRevenue(s)>0||(s.totalPrice||0)>0) : validRevenueSessions;
    if (revenueFilter==='confirmed') f=f.filter(s=>s.revenueConfirmed);
    else if (revenueFilter==='pending') f=f.filter(s=>!s.revenueConfirmed);
    if (q) f=f.filter(s=>(s.carPlate??'').toUpperCase().includes(q));
    const sorted = [...f].sort((a,b)=>(b.endTime?toMs(b.endTime):0)-(a.endTime?toMs(a.endTime):0));
    return q ? sorted.slice(0,50) : sorted.slice(0,30);
  }, [completedSessions, validRevenueSessions, revenueFilter, sessionSearch, getRevenue]);

  const vipGarages = useMemo(() => garages.filter(g=>g.garageType==='vip'||(g as any).is_vip===true||g.type==='partner'), [garages]);

  const vipFilteredSessions = useMemo(() => completedSessions.filter(s => {
    if ((s.totalPrice||0)===0 && getRevenue(s)===0) return false;
    if (s.endTime) { const d=timestampToLocalDate(toMs(s.endTime)); if (vipReportDateFrom&&d<vipReportDateFrom) return false; if (vipReportDateTo&&d>vipReportDateTo) return false; } else return false;
    const g=garages.find(ga=>ga.id===s.garageId); if (!g) return false;
    if (!(g.garageType==='vip'||(g as any).is_vip===true||g.type==='partner')) return false;
    if (vipGarageFilter!=='all'&&s.garageId!==vipGarageFilter) return false;
    if (vipPaymentFilter!=='all'&&s.paymentMethod!==vipPaymentFilter) return false;
    if (vipPlateSearch.trim()) { const q=vipPlateSearch.trim().toUpperCase(); if (!(s.carPlate??'').toUpperCase().includes(q)) return false; }
    return true;
  }).sort((a,b)=>toMs(b.endTime)-toMs(a.endTime)), [completedSessions, garages, vipReportDateFrom, vipReportDateTo, vipGarageFilter, vipPaymentFilter, vipPlateSearch, getRevenue]);

  const vipReportStats = useMemo(() => {
    const ts = vipFilteredSessions.length; const tr = vipFilteredSessions.reduce((a,s)=>a+getRevenue(s),0); const tf = ts*BOOKING_FEE;
    const gm = new Map<string,{name:string;area:string;count:number;revenue:number;fees:number}>();
    vipFilteredSessions.forEach(s => { const g=garages.find(ga=>ga.id===s.garageId); if(!g) return; const e=gm.get(s.garageId); const r=getRevenue(s); if(e){e.count++;e.revenue+=r;e.fees+=BOOKING_FEE;}else gm.set(s.garageId,{name:g.name,area:g.area||'مناطق أخرى',count:1,revenue:r,fees:BOOKING_FEE}); });
    const pg = Array.from(gm.entries()).map(([id,d])=>({id,...d})).sort((a,b)=>b.count-a.count);
    const cc=vipFilteredSessions.filter(s=>s.paymentMethod==='cash').length; const wc=vipFilteredSessions.filter(s=>s.paymentMethod==='wallet').length; const ic=vipFilteredSessions.filter(s=>s.paymentMethod==='instapay').length;
    return { totalSessions:ts, totalRevenue:tr, totalBookingFees:tf, perGarage:pg, cashCount:cc, walletCount:wc, instapayCount:ic, otherCount:ts-cc-wc-ic };
  }, [vipFilteredSessions, garages, getRevenue]);

  const safeMessages = messages ?? [];
  const pendingMessages = safeMessages.filter(m=>m.status==='pending');
  const allMessages = [...safeMessages].sort((a,b)=>b.timestamp-a.timestamp);
  const displayedMessages = messagesTab==='pending' ? pendingMessages : allMessages;
  const getTypeEmoji = (t:string) => { switch(t){case 'complaint':return '🚨';case 'inquiry':return '❓';case 'suggestion':return '💡';case 'technical':return '🔧';default:return '💬';} };
  const getTypeLabel = (t:string) => { switch(t){case 'complaint':return 'شكوى';case 'inquiry':return 'استفسار';case 'suggestion':return 'اقتراح';case 'technical':return 'مشكلة تقنية';default:return 'رسالة';} };
  const formatMsgTime = (ts:number) => new Date(ts).toLocaleDateString('ar-EG',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  const setToday = () => { const t=getLocalToday(); setDateFrom(t); setDateTo(t); };

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
    toast.success(`تم تحديث بيانات جراج ${garages.find(g=>g.id===garageId)?.name} بنجاح ✅`);
  };

  const handleAdminEnterGarage = (g:typeof garages[0]) => { localStorage.setItem('garageRole','owner'); localStorage.removeItem('valetNumber'); localStorage.removeItem('valetName'); localStorage.setItem('currentGarageId',g.id); setCurrentGarageId(g.id); setView('garage'); toast.success(`👋 تم الدخول المباشر لإدارة جراج: ${g.name}`,{icon:'🅿️',duration:3000}); };

  const handleApproveTopUp = async (id:string, amount:number) => { if(processingTopUpId) return; setProcessingTopUpId(id); const lt=toast.loading('جاري اعتماد الرصيد...'); try{await approveTopUp(id); toast.dismiss(lt); toast.success(`تم اعتماد شحن ${amount} ج.م ✅`,{duration:4000}); await fetchAll();}catch(e:any){toast.dismiss(lt); toast.error(e?.message||'فشل');}finally{setProcessingTopUpId(null);} };
  const handleRejectTopUp = async (id:string) => { if(processingTopUpId) return; setProcessingTopUpId(id); const lt=toast.loading('جاري الرفض...'); try{await rejectTopUp(id); toast.dismiss(lt); toast.error('تم الرفض ❌'); await fetchAll();}catch(e:any){toast.dismiss(lt); toast.error(e?.message||'فشل');}finally{setProcessingTopUpId(null);} };

  const handleConfirmSettlement = async (garageId:string) => {
    if(processingSettlement) return; const gd=commissionStats.perGarage.find(g=>g.id===garageId); if(!gd){toast.error('لا توجد بيانات');return;}
    setProcessingSettlement(true); const lt=toast.loading('جاري الإقفال...');
    try{
      const st=gd.walletRevenue-gd.commission; const aog=st>0; const ab=Math.abs(st);
      const {error:ie}=await supabase.from('settlements').insert([{garage_id:garageId,garage_name:gd.name,settlement_date:getLocalToday(),amount:ab,direction:aog?'admin_to_garage':'garage_to_admin',session_ids:gd.sessionIds,session_count:gd.totalCount,wallet_collected:gd.walletRevenue,commission_amount:gd.commission,notes:`تسوية ${gd.totalCount} جلسة`,created_at:new Date(getServerNow()).toISOString()}]);
      if(ie) throw ie;
      for(let i=0;i<gd.sessionIds.length;i+=50){const b=gd.sessionIds.slice(i,i+50);const{error:ue}=await supabase.from('sessions').update({settled:true,settled_at:new Date(getServerNow()).toISOString()}).in('id',b);if(ue)throw ue;}
      toast.dismiss(lt); toast.success(`✅ تم إقفال ${gd.name} بمبلغ ${ab.toFixed(0)} ج.م`); setConfirmSettlementGarageId(null); await fetchSettlements(); await fetchAll();
    }catch(e:any){toast.dismiss(lt);toast.error(e?.message||'فشل');}finally{setProcessingSettlement(false);}
  };

  const handleDatabaseCleanup = async () => {
    if(!window.confirm("⚠️ هل أنت متأكد من تنظيف الأرشيف؟\n\nسيتم حذف الجلسات القديمة (+30 يوم) المؤكدة والمسواة.")) return;
    const lt=toast.loading('جاري التنظيف...');
    try{const d=new Date(getServerNow());d.setDate(d.getDate()-30);const{error,count}=await supabase.from('sessions').delete({count:'exact'}).eq('status','completed').eq('revenue_confirmed',true).eq('settled',true).lt('created_at',d.toISOString());toast.dismiss(lt);if(error)throw error;if(count&&count>0){toast.success(`🧹 تم حذف ${count} جلسة ✅`);await fetchAll();}else toast('نظيف بالفعل ✨',{icon:'✨'});}catch(e:any){toast.dismiss(lt);toast.error('فشل: '+(e.message||'خطأ'));}
  };

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

      {/* ══ Free Bookings Counter ══ */}
      <div className="mb-6 flex gap-3 flex-col sm:flex-row">
        <div className="flex-1 bg-white border rounded-2xl p-5 shadow-sm relative overflow-hidden" style={{borderColor:BRAND.border}}>
          <div className="absolute top-0 right-0 w-1.5 h-full" style={{background:BRAND.blue}}></div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black" style={{color:BRAND.slate}}>إجمالي الإيرادات المسجلة</span>
            <div className="p-2 rounded-xl text-white" style={{background:BRAND.blue}}><DollarSign className="w-4 h-4"/></div>
          </div>
          <div className="text-2xl font-black mb-1" style={{color:BRAND.navy}}>{garageReport.reduce((a,c)=>a+c.revenue,0).toLocaleString()} <span className="text-xs font-bold" style={{color:BRAND.slate}}>ج.م</span></div>
          <p className="text-[9px] font-bold" style={{color:BRAND.slate}}><CheckCircle2 className="w-3 h-3 inline ml-1" style={{color:BRAND.greenDark}}/>من {validRevenueSessions.length} جلسة مدفوعة</p>
        </div>
        <div className="flex-1 border rounded-2xl p-5 shadow-sm relative overflow-hidden" style={{background:'linear-gradient(to bottom left, #fffbeb, #ffffff)',borderColor:'#fcd34d'}}>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-amber-400"></div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black text-amber-700 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 text-amber-500"/> عداد الحجوزات المجانية</span>
            <div className="p-2 rounded-xl bg-amber-100 text-amber-500"><Gift className="w-4 h-4"/></div>
          </div>
          <div className="text-2xl font-black text-amber-600 mb-1">{freeSessionsList.length} <span className="text-xs font-bold text-amber-500/70">حجز مجاني 100%</span></div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-[9px] font-bold text-amber-700/80">دعم مُعفى: <strong className="text-amber-600">{freeSessionsList.length*3} ج.م</strong></p>
            <button onClick={()=>setShowFreeBookings(!showFreeBookings)} className="text-[9px] font-black bg-amber-50 text-amber-600 px-2 py-1 rounded border border-amber-200 cursor-pointer">{showFreeBookings?'إخفاء السجل':'عرض السجل'}</button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showFreeBookings && (
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} className="mb-6 border rounded-2xl overflow-hidden" style={{background:'#fffbeb',borderColor:'#fcd34d'}}>
            <div className="p-3 bg-amber-100/50 border-b border-amber-200"><h3 className="font-black text-xs text-amber-800 flex items-center gap-1"><Gift size={14}/> سجل العملاء (تجاوزوا خصم الـ VIP اليومي)</h3></div>
            <div className="p-3 space-y-2 max-h-[250px] overflow-y-auto">
              {freeSessionsList.length===0 ? <div className="text-center py-6 text-amber-600/60 font-bold text-xs">لا توجد حجوزات مجانية مسجلة حالياً</div> : freeSessionsList.map(s=>(
                <div key={s.id} className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-amber-100 shadow-sm">
                  <div><div className="font-black text-xs text-slate-800 mb-0.5">🚗 {s.carPlate}</div><div className="text-[9px] font-bold text-slate-500">{(s as any).garageName||'جراج VIP'}</div></div>
                  <div className="text-left"><span className="inline-block bg-amber-100 text-amber-600 font-black text-[9px] px-2 py-0.5 rounded-full mb-1">مجاني 0 ج.م</span><div className="text-[8px] font-mono text-slate-400">{s.endTime||s.startTime?new Date(s.endTime||s.startTime).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}):'—'}</div></div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ Pending Revenue Banner ══ */}
      {(totalsFromSessions.totalPendingRevenue>0||totalsFromSessions.pendingCount>0) && (
        <div className="mb-5 flex items-center justify-between px-4 py-3 rounded-xl text-white shadow-sm" style={{background:'linear-gradient(135deg, #f59e0b, #d97706)'}}>
          <div className="text-right"><h3 className="font-black text-xs">⏳ إيرادات معلقة ({totalsFromSessions.pendingCount})</h3><p className="text-[9px] opacity-80 mt-0.5">تحتاج تأكيد (الجلسات المجانية مستبعدة)</p></div>
          <div className="font-black font-mono text-xl">{totalsFromSessions.totalPendingRevenue.toFixed(0)} <span className="text-xs">ج.م</span></div>
        </div>
      )}

      {/* ══ Date Filter ══ */}
      <div className="mb-5" style={{background:BRAND.card,border:`1px solid ${BRAND.border}`,borderRadius:20,padding:14,boxShadow:'0 2px 12px rgba(0,0,0,0.02)'}}>
        <div className="flex items-center gap-1.5 mb-3">
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="flex-1 font-black outline-none text-center font-mono py-2 rounded-xl text-xs border border-slate-200" style={{background:BRAND.blueSoft,color:BRAND.blueDark}}/>
          <span className="font-black text-slate-400 text-xs">←</span>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="flex-1 font-black outline-none text-center font-mono py-2 rounded-xl text-xs border border-slate-200" style={{background:BRAND.blueSoft,color:BRAND.blueDark}}/>
          <CalendarDays size={16} style={{color:BRAND.blue}} className="shrink-0"/>
        </div>
        <div className="flex gap-1.5 mb-3">
          {[{l:'📅 اليوم',o:setToday,a:dateFrom===getLocalToday()&&dateTo===getLocalToday()},{l:'أمس',o:()=>{setDateFrom(getLocalYesterday());setDateTo(getLocalYesterday());},a:dateFrom===getLocalYesterday()&&dateTo===getLocalYesterday()},{l:'أسبوع',o:()=>{setDateFrom(getLocalDaysAgo(7));setDateTo(getLocalToday());},a:dateFrom===getLocalDaysAgo(7)},{l:'الكل',o:()=>{setDateFrom('');setDateTo('');},a:!dateFrom&&!dateTo}].map(b=>(
            <button key={b.l} onClick={b.o} className="flex-1 font-black py-2 rounded-lg text-xs cursor-pointer border-0 active:scale-95 transition-all" style={{background:b.a?BRAND.blue:BRAND.blueSoft,color:b.a?'#fff':BRAND.slate,border:b.a?'none':`1px solid ${BRAND.border}`}}>{b.l}</button>
          ))}
        </div>
        <div className="pt-3 border-t border-dashed" style={{borderColor:BRAND.border}}>
          <button onClick={handleDatabaseCleanup} className="w-full font-black py-2 rounded-lg text-xs cursor-pointer border-0 active:scale-95 transition-all flex items-center justify-center gap-1.5" style={{background:BRAND.navy,color:'#fff'}}>🧹 تنظيف الأرشيف (+30 يوم)</button>
        </div>
      </div>

      {/* ══ Revenue Stats ══ */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <div className="text-center p-3 rounded-xl border" style={{background:BRAND.card,borderColor:BRAND.border}}><div className="text-[10px] font-bold" style={{color:BRAND.slate}}>الإيرادات المؤكدة</div><div className="font-black font-mono text-lg mt-1" style={{color:BRAND.blue}}>{totalsFromSessions.totalRevenueConfirmed.toFixed(0)} <span className="text-[10px] font-bold text-slate-400">ج.م</span></div></div>
        <div className="text-center p-3 rounded-xl border" style={{background:BRAND.card,borderColor:BRAND.border}}><div className="text-[10px] font-bold" style={{color:BRAND.slate}}>إجمالي العمليات</div><div className="font-black font-mono text-lg mt-1" style={{color:BRAND.blue}}>{totalsFromSessions.totalSessionsCount} <span className="text-[10px] font-bold text-slate-400">عملية</span></div></div>
      </div>

      {/* ══ Commission Card ══ */}
      {commissionStats.totalCommission>0 && (<>
        <div className="flex justify-between items-stretch mb-3 text-center border" style={{background:BRAND.card,borderColor:BRAND.border,borderRadius:16,padding:'12px 10px'}}>
          <div className="flex-1 flex flex-col justify-center items-center border-l" style={{borderColor:BRAND.border}}><span className="text-[9px] font-black mb-1 block" style={{color:BRAND.slateMuted}}>💳 الإيراد الكلي</span><span className="font-mono font-black text-sm" style={{color:BRAND.navy}}>{commissionStats.totalRevenue.toFixed(0)} <span className="text-[9px] font-bold">ج</span></span></div>
          <div className="flex-1 flex flex-col justify-center items-center border-l" style={{borderColor:BRAND.border}}><span className="text-[9px] font-black mb-1 flex items-center gap-0.5 justify-center" style={{color:'#d97706'}}><Percent size={10}/> عمولتنا + حمايتنا 🛡️</span><span className="font-mono font-black text-sm" style={{color:'#d97706'}}>{commissionStats.totalCommission.toFixed(0)} <span className="text-[9px] font-bold">ج</span></span></div>
          <div className="flex-1 flex flex-col justify-center items-center"><span className="text-[9px] font-black mb-1 block" style={{color:BRAND.greenDark}}>🟢 صافي الجراجات</span><span className="font-mono font-black text-sm" style={{color:BRAND.greenDark}}>{commissionStats.totalNet.toFixed(0)} <span className="text-[9px] font-bold">ج</span></span></div>
        </div>
        {(()=>{const st=commissionStats.totalSettlement;const aog=st>0;const av=Math.abs(st).toFixed(0);return(
          <div className="mb-4 border" style={{background:aog?BRAND.greenLight:'#fff5f5',borderColor:aog?BRAND.green:'#fca5a5',borderRadius:16,padding:12}}>
            <div className="flex justify-between items-center mb-2"><div className="font-black font-mono text-lg" style={{color:aog?BRAND.greenDark:'#c53030'}}>{av} <span className="text-[10px] font-bold">ج.م</span></div><div className="text-right"><span className="font-black text-xs block" style={{color:BRAND.navy}}>{aog?'🟢 مستحق للجراجات':'🔴 مستحق للتطبيق'}</span><span className="font-bold text-[9px]" style={{color:BRAND.slate}}>{aog?'تحويل من الأدمن':'تحصيل من الجراج'}</span></div></div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-dashed" style={{borderColor:aog?'#c8e6a0':'#fecaca'}}><div className="text-center bg-white rounded-lg p-1.5 border border-slate-200 flex items-center justify-center gap-1"><span className="text-[9px] font-bold" style={{color:BRAND.slate}}>💳 محفظة:</span><span className="font-black font-mono text-xs" style={{color:BRAND.blue}}>{commissionStats.totalWalletCollected.toFixed(0)}ج</span></div><div className="text-center bg-white rounded-lg p-1.5 border border-amber-200 flex items-center justify-center gap-1"><span className="text-[9px] font-bold" style={{color:'#d97706'}}>📊 عمولة:</span><span className="font-black font-mono text-xs" style={{color:'#d97706'}}>{commissionStats.totalCommission.toFixed(0)}ج</span></div></div>
          </div>
        );})()}
      </>)}

      {/* ══ Accordion Settlements ══ */}
      <div className="mb-6 space-y-2">
        <div className="flex items-center justify-between mb-3"><span className="font-black text-[9px] px-2.5 py-0.5 rounded-full text-white" style={{background:BRAND.blue}}>{commissionStats.perGarage.length} جراجات نشطة</span><h3 className="font-black text-xs" style={{color:BRAND.navy}}>📊 التسويات النشطة للجراجات</h3></div>
        {commissionStats.perGarage.length===0 ? <div className="text-center py-8 border-2 border-dashed rounded-2xl" style={{background:BRAND.card,borderColor:BRAND.border}}><span className="text-2xl block mb-1">⚖️</span><p className="font-black text-[11px]" style={{color:BRAND.slate}}>جميع حسابات الجراجات متزنة ومقفلة بالكامل!</p></div> : commissionStats.perGarage.map(g=>{
          const st=g.walletRevenue-g.commission;const aog=st>0;const ab=Math.abs(st).toFixed(0);const isE=activeAccordionGarageId===g.id;const isC=confirmSettlementGarageId===g.id;
          return(<div key={g.id} className="transition-all" style={{background:BRAND.card,border:`1.5px solid ${isE?(aog?BRAND.green:'#fca5a5'):BRAND.border}`,borderRadius:18,overflow:'hidden'}}>
            <div onClick={()=>{setActiveAccordionGarageId(isE?null:g.id);setConfirmSettlementGarageId(null);}} className="flex justify-between items-center p-4 cursor-pointer active:scale-[0.99] transition-all">
              <div className="flex items-center gap-1.5"><span className="font-black text-[10px]" style={{color:aog?BRAND.greenDark:'#c53030'}}>{aog?'أرسل للجراج':'اطلب من الجراج'}</span><span className="font-black font-mono text-base" style={{color:aog?BRAND.greenDark:'#c53030'}}>{ab} ج.م</span><span className="font-bold text-xs" style={{color:BRAND.slateMuted}}>{isE?'▲':'▼'}</span></div>
              <div className="text-right"><div className="font-black text-sm" style={{color:BRAND.navy}}>{g.name}</div><div className="font-bold text-[9px]" style={{color:BRAND.slate,marginTop:2}}>{g.totalCount} جلسة معلقة تسويتها</div></div>
            </div>
            <AnimatePresence>{isE&&(<motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} style={{borderTop:`1px solid ${BRAND.border}`,background:BRAND.bg,padding:'0 16px 16px'}}>
              <div className="grid grid-cols-3 gap-2 my-3"><div className="text-center bg-white rounded-xl p-2 border" style={{borderColor:BRAND.border}}><div className="text-[8px] font-bold" style={{color:BRAND.slate}}>تحصيل محفظة</div><div className="font-black font-mono text-xs mt-1" style={{color:BRAND.blue}}>{g.walletRevenue.toFixed(0)}</div></div><div className="text-center bg-white rounded-xl p-2 border border-amber-200"><div className="text-[8px] font-bold" style={{color:'#d97706'}}>عمولتنا {g.commissionRate}%</div><div className="font-black font-mono text-xs mt-1" style={{color:'#d97706'}}>{g.commission.toFixed(0)}</div></div><div className="text-center rounded-xl p-2 border" style={{background:aog?BRAND.greenLight:'#fff5f5',borderColor:aog?BRAND.green:'#fca5a5'}}><div className="text-[8px] font-bold" style={{color:aog?BRAND.greenDark:'#c53030'}}>الفرق للتسوية</div><div className="font-black font-mono text-sm mt-1" style={{color:aog?BRAND.greenDark:'#c53030'}}>{ab}</div></div></div>
              {isC?<div className="p-3 border rounded-xl bg-white text-center" style={{borderColor:BRAND.border}}><p className="font-black text-[11px] mb-1" style={{color:BRAND.navy}}>⚠️ هل تم فعلياً {aog?'تحويل':'استلام'} <span style={{color:aog?BRAND.greenDark:'#c53030'}}>{ab} ج.م</span>؟</p><p className="text-[9px] mb-3" style={{color:BRAND.slate}}>عند التأكيد سيتم قفل {g.totalCount} جلسة نهائياً.</p><div className="flex gap-2"><button onClick={()=>{handleConfirmSettlement(g.id);setActiveAccordionGarageId(null);}} disabled={processingSettlement} className="flex-1 font-black py-2 rounded-lg text-xs cursor-pointer border-0 text-white flex items-center justify-center gap-1" style={{background:BRAND.greenDark}}><Lock size={12}/>{processingSettlement?'جاري...':'تأكيد وإقفال'}</button><button onClick={()=>setConfirmSettlementGarageId(null)} disabled={processingSettlement} className="flex-1 font-black py-2 rounded-lg text-xs cursor-pointer border border-slate-200 bg-white" style={{color:BRAND.slate}}>إلغاء</button></div></div>:<button onClick={()=>setConfirmSettlementGarageId(g.id)} className="w-full font-black py-2.5 rounded-xl text-xs cursor-pointer border-0 text-white flex items-center justify-center gap-1.5" style={{background:aog?BRAND.greenDark:'#dc2626'}}><Lock size={12}/> تسجيل تسوية وإقفال ({ab} ج.م)</button>}
            </motion.div>)}</AnimatePresence>
          </div>);
        })}
      </div>

      {/* ══ Archive ══ */}
      <div className="mb-5">
        <button onClick={()=>{setShowArchive(!showArchive);setVisibleSettlements(4);setArchiveSearch('');}} className="w-full font-black flex items-center justify-between bg-white border cursor-pointer px-4 py-3 rounded-xl" style={{borderColor:BRAND.border,color:BRAND.navy}}><span className="text-xs font-black" style={{color:BRAND.blue}}>{showArchive?'▲ إخفاء الأرشيف':'▼ عرض الأرشيف'}</span><div className="flex items-center gap-1.5"><span className="text-[10px] font-bold" style={{color:BRAND.slate}}>({settlementRecords.length} تسوية)</span><span className="text-xs font-black">📂 أرشيف التسويات</span></div></button>
        {showArchive&&(<div className="mt-3 space-y-3 p-3 rounded-xl border bg-white" style={{borderColor:BRAND.border}}>
          {settlementRecords.length>4&&<input type="text" value={archiveSearch} onChange={e=>{setArchiveSearch(e.target.value);setVisibleSettlements(4);}} placeholder="ابحث باسم الجراج..." className="w-full font-bold text-right outline-none text-xs py-2.5 px-3 rounded-lg border border-slate-200" style={{color:BRAND.navy}}/>}
          {(()=>{const f=settlementRecords.filter(r=>r.garage_name.toLowerCase().includes(archiveSearch.trim().toLowerCase()));if(!f.length)return<div className="text-center py-6 border-2 border-dashed rounded-xl" style={{borderColor:BRAND.border}}><div className="text-2xl mb-1">📭</div><p className="font-black text-xs" style={{color:BRAND.slateMuted}}>{archiveSearch?`لا توجد تسويات لـ "${archiveSearch}"`:'لم يتم تسجيل أي تسويات بعد'}</p></div>;const sl=f.slice(0,visibleSettlements);return(<><div className="space-y-2">{sl.map(r=>{const a2g=r.direction==='admin_to_garage';return(<div key={r.id} className="p-3 border rounded-xl" style={{borderColor:BRAND.border}}><div className="flex justify-between items-start mb-2"><div className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black" style={{background:a2g?BRAND.greenLight:'#fff5f5',color:a2g?BRAND.greenDark:'#c53030'}}>{a2g?'أرسل الأدمن':'استلم الأدمن'}</div><div className="text-right"><div className="font-black text-xs" style={{color:BRAND.navy}}>{r.garage_name}</div><div className="font-bold text-[9px] font-mono mt-0.5" style={{color:BRAND.slateMuted}}>{r.settlement_date}</div></div></div><div className="flex justify-between items-center border-t border-dashed pt-2 mt-2" style={{borderColor:BRAND.border}}><div className="font-black font-mono text-base" style={{color:a2g?BRAND.greenDark:'#c53030'}}>{Number(r.amount||0).toFixed(0)} <span className="text-[10px]">ج.م</span></div><div className="text-right font-bold text-[10px]" style={{color:BRAND.navy,lineHeight:1.4}}><div>{r.session_count} جلسة مقفلة 🔒</div><div className="text-[8px]" style={{color:BRAND.slate}}>محفظة: {r.wallet_collected.toFixed(0)}ج · عمولة: {r.commission_amount.toFixed(0)}ج</div></div></div></div>);})}</div>{f.length>visibleSettlements&&<button onClick={()=>setVisibleSettlements(p=>p+5)} className="w-full font-black py-2 rounded-lg text-[10px] cursor-pointer bg-white border border-slate-200" style={{color:BRAND.blue}}>عرض المزيد ({f.length-visibleSettlements} أخرى)</button>}</>);})()}
        </div>)}
      </div>

      {/* ══ Revenue Report ══ */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3"><span className="font-black text-[9px] px-2 py-0.5 rounded bg-slate-200" style={{color:BRAND.slate}}>{garageReport.length} جراج</span><h3 className="font-black text-xs" style={{color:BRAND.navy}}>📊 تقرير الإيرادات</h3></div>
        {garageReport.length===0?<div className="text-center py-8 border-2 border-dashed rounded-xl" style={{borderColor:BRAND.border}}><span className="text-2xl block mb-1">📭</span><p className="font-black text-xs" style={{color:BRAND.slate}}>لا توجد جراجات نشطة</p></div>:<div className="space-y-2">{garageReport.map(r=>(<div key={r.garageId} className="p-3 border" style={{background:BRAND.card,borderColor:BRAND.border,borderRadius:16}}><div className="flex justify-between items-center mb-2"><div className="flex items-center gap-1.5"><span className="font-black font-mono text-base" style={{color:BRAND.greenDark}}>{r.revenue.toFixed(0)} <span className="text-[10px] font-bold">ج</span></span><span className="text-[8px] font-black text-white px-1.5 py-0.5 rounded" style={{background:BRAND.green}}>مؤكد</span></div><div className="text-right"><span className="font-black text-xs" style={{color:BRAND.navy}}>{r.name}</span><span className="text-[9px] font-bold block" style={{color:BRAND.slate}}>{r.count} جلسة</span></div></div><div className="flex items-center justify-between gap-1 py-1 px-2.5 rounded-lg border" style={{background:BRAND.bg,borderColor:BRAND.border}}><div className="flex items-center gap-0.5 text-[10px]"><Percent size={9} style={{color:BRAND.slate}}/><span className="font-black font-mono" style={{color:BRAND.slate}}>{r.commissionRate}%</span></div><div style={{width:1,height:12,background:BRAND.border}}/><div className="flex items-center gap-0.5 text-[10px]"><span className="text-[9px]">⏳</span><span className="font-black font-mono text-amber-600">{r.pendingRevenue>0?`${r.pendingRevenue.toFixed(0)}ج`:'—'}</span></div><div style={{width:1,height:12,background:BRAND.border}}/><div className="flex items-center gap-0.5 text-[10px]"><span className="text-[9px]">💵</span><span className="font-black font-mono text-emerald-600">{r.cash.toFixed(0)}</span></div><div style={{width:1,height:12,background:BRAND.border}}/><div className="flex items-center gap-0.5 text-[10px]"><span className="text-[9px]">👝</span><span className="font-black font-mono text-blue-600">{r.wallet.toFixed(0)}</span></div></div></div>))}</div>}
      </div>

      {/* ══ Revenue Sessions ══ */}
      <div className="mb-8">
        <h3 className="font-black mb-3 text-right text-xs" style={{color:BRAND.navy}}>إدارة الجلسات ({filteredSessions.length})</h3>
        <div className="space-y-3 mb-4">
          <div className="flex gap-1.5">{([{id:'pending' as const,label:`⏳ معلق (${filteredSessions.filter(s=>!s?.revenueConfirmed).length})`,bg:'#f59e0b'},{id:'confirmed' as const,label:`✅ مؤكد (${filteredSessions.filter(s=>s?.revenueConfirmed).length})`,bg:BRAND.greenDark},{id:'all' as const,label:`الكل (${filteredSessions.length})`,bg:BRAND.blue}]).map(b=>(<button key={b.id} onClick={()=>setRevenueFilter(b.id)} className="flex-1 font-black py-2 rounded-xl text-[10px] border-0 cursor-pointer transition-all" style={{background:revenueFilter===b.id?b.bg:BRAND.blueSoft,color:revenueFilter===b.id?'#fff':BRAND.slate,border:revenueFilter!==b.id?`1px solid ${BRAND.border}`:'none'}}>{b.label}</button>))}</div>
          <div className="relative"><Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{color:BRAND.slateMuted}}/><input type="text" value={sessionSearch} onChange={e=>setSessionSearch(e.target.value)} placeholder="ابحث برقم العربية..." className="w-full font-bold outline-none text-xs py-2.5 px-9 rounded-xl border border-slate-200" style={{color:BRAND.navy}}/>{sessionSearch&&<button onClick={()=>setSessionSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 border-0 bg-transparent cursor-pointer" style={{color:BRAND.slateMuted}}><X size={14}/></button>}</div>
        </div>
        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
          {displayedRevenueSessions.length===0?<div className="text-center py-8 bg-white border rounded-2xl" style={{borderColor:BRAND.border}}><div className="text-2xl mb-1">📭</div><p className="font-bold text-xs" style={{color:BRAND.slateMuted}}>{sessionSearch?`لا توجد نتائج لـ "${sessionSearch}"`:'لا توجد جلسات'}</p></div>:displayedRevenueSessions.map(session=>{
            if(!session)return null;const g=(garages||[]).find((ga:any)=>ga?.id===session.garageId);const rev=getRevenue(session);const comm=getCommission(session);const net=getNetRevenue(session);const et=session.endTime?typeof session.endTime==='number'?session.endTime:new Date(session.endTime).getTime():null;const time=et?new Date(et):null;const isDel=deleteConfirmId===session.id;const isSettled=(session as any)?.settled===true;
            return(<div key={session.id} className="border" style={{background:isDel?'#fef2f2':isSettled?BRAND.bg:session.revenueConfirmed?BRAND.greenLight:BRAND.blueSoft,borderColor:isDel?'#fca5a5':isSettled?BRAND.border:session.revenueConfirmed?BRAND.green:BRAND.border,borderRadius:18,padding:14,opacity:isSettled?0.75:1}}>
              <div className="flex justify-between items-start mb-2"><div className="flex items-center gap-1.5 flex-wrap"><span className="font-mono font-black text-sm" style={{color:session.revenueConfirmed?BRAND.greenDark:'#d97706'}}>{Number(rev||0).toFixed(0)} ج.م</span>{[{show:true,bg:session.source==='manual'?'#f59e0b':BRAND.blue,text:session.source==='manual'?'يدوي':'تطبيق'},{show:!!session.paymentMethod,bg:BRAND.navy,text:session.paymentMethod==='cash'?'💵 نقدي':session.paymentMethod==='instapay'?'📱 إنستا':session.paymentMethod==='wallet'?'👝 محفظة':'📲 كاش'},{show:true,bg:session.revenueConfirmed?BRAND.green:'#f59e0b',text:session.revenueConfirmed?'✅ مؤكد':'⏳ معلق'},{show:isSettled,bg:BRAND.slateMuted,text:'🔒 تمت التسوية'},{show:session.isFirstFreeSession===true,bg:'#c2410c',text:rev===0?'🎁 ركن مجاني':'🎁 بونص منتهي'},{show:session.shieldEnabled===true,bg:'#0284c7',text:'🛡️ درع الرادار'}].filter(b=>b.show).map((b,i)=>(<span key={i} className="font-black text-[8px] px-1.5 py-0.5 rounded text-white" style={{background:b.bg}}>{b.text}</span>))}</div><div className="text-right"><div className="font-black text-xs" style={{color:BRAND.navy}}>🚗 {session.carPlate}</div><div className="text-[9px] font-bold" style={{color:BRAND.slateMuted}}>{g?.name||'—'}</div></div></div>
              {(session.source==='app'||session.shieldEnabled)&&comm>0&&<div className="flex items-center gap-2 mb-2 p-1.5 rounded-lg border bg-white" style={{borderColor:BRAND.border}}><span className="font-bold text-[9px]" style={{color:BRAND.slate}}>عمولتنا: {Number(comm||0).toFixed(0)} ج.م{session.shieldEnabled&&<span style={{color:BRAND.blue}}> (شامل 5ج درع 🛡️)</span>}</span><div style={{width:1,height:10,background:BRAND.border}}/><span className="font-bold text-[9px]" style={{color:BRAND.greenDark}}>صافي الجراج: {Number(net||0).toFixed(0)} ج.م</span></div>}
              {time&&<div className="font-mono text-left mb-2 text-[9px]" style={{color:BRAND.slateMuted}}>{time.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})} · {time.toLocaleDateString('ar-EG',{month:'short',day:'numeric'})}</div>}
              {isDel?<div className="p-3 border rounded-xl bg-white text-center" style={{borderColor:BRAND.border}}><p className="font-black text-xs text-red-600 mb-1">⚠️ حذف نهائياً؟</p><p className="text-[10px] text-slate-500 mb-3">🚗 {session.carPlate} · {Number(rev||0).toFixed(0)} ج.م</p><div className="flex gap-2"><button onClick={async()=>{await removeSession(session.id);setDeleteConfirmId(null);toast.success('تم الحذف 🗑️');}} className="flex-1 font-black py-2 rounded-lg text-xs cursor-pointer border-0 text-white bg-red-600">🗑️ تأكيد</button><button onClick={()=>setDeleteConfirmId(null)} className="flex-1 font-black py-2 rounded-lg text-xs cursor-pointer border bg-white" style={{color:BRAND.slate,borderColor:BRAND.border}}>إلغاء</button></div></div>:<div className="flex items-center gap-2">{session.revenueConfirmed?<button onClick={async()=>{await unconfirmRevenue(session.id);toast('إلغاء ↩️',{icon:'⏳'});}} disabled={isSettled} className="flex-1 font-black py-1.5 rounded-lg text-[10px] cursor-pointer border-0 text-white disabled:opacity-50" style={{background:'#f59e0b'}}>↩️ إلغاء التأكيد</button>:<button onClick={async()=>{await confirmRevenue(session.id,session.addedBy);toast.success('تأكيد ✅');}} className="flex-1 font-black py-1.5 rounded-lg text-[10px] cursor-pointer border-0 text-white" style={{background:BRAND.greenDark}}>✅ تأكيد الإيراد</button>}<button onClick={()=>setDeleteConfirmId(session.id)} disabled={isSettled} className="font-black py-1.5 px-3 rounded-lg text-[10px] cursor-pointer border-0 disabled:opacity-50 text-red-600 bg-red-50 border border-red-200">🗑️</button></div>}
            </div>);
          })}
        </div>
      </div>

      {/* ══ Pending Top-ups ══ */}
      <div className="mb-8">
        <h3 className="font-black mb-3 text-right text-xs" style={{color:BRAND.navy}}>اعتمادات شحن معلقة ({pendingTopUps.length})</h3>
        <div className="space-y-3">
          {pendingTopUps.map(w=>(<div key={w.id} className="border p-3" style={{background:BRAND.card,borderColor:BRAND.border,borderRadius:18}}>
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
          {displayedMessages.length===0?<div className="text-center py-6 bg-white border rounded-2xl text-xs font-bold" style={{borderColor:BRAND.border,color:BRAND.slate}}>لا توجد رسائل</div>:displayedMessages.map(msg=>{
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
          <div className="flex items-center gap-2 mb-2"><select value={vipGarageFilter} onChange={e=>{setVipGarageFilter(e.target.value);setVipVisibleSessions(20);}} className="flex-1 font-bold text-right outline-none text-xs py-2.5 px-3 rounded-lg border border-slate-200" style={{color:BRAND.navy}}><option value="all">كل جراجات VIP</option>{vipGarages.map(g=>(<option key={g.id} value={g.id}>🅿️ {g.name}</option>))}</select><Filter size={14} style={{color:BRAND.blue}} className="shrink-0"/></div>
          <div className="flex gap-2"><select value={vipPaymentFilter} onChange={e=>{setVipPaymentFilter(e.target.value);setVipVisibleSessions(20);}} className="flex-1 font-bold text-right outline-none text-xs py-2.5 px-3 rounded-lg border border-slate-200" style={{color:BRAND.navy}}><option value="all">كل طرق الدفع</option><option value="cash">💵 نقدي</option><option value="wallet">👝 محفظة</option><option value="instapay">📱 إنستاباي</option></select><div className="flex-1 relative"><Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2" style={{color:BRAND.slateMuted}}/><input type="text" value={vipPlateSearch} onChange={e=>{setVipPlateSearch(e.target.value);setVipVisibleSessions(20);}} placeholder="🔍 لوحة..." className="w-full font-bold text-right outline-none text-xs py-2.5 px-8 rounded-lg border border-slate-200" style={{color:BRAND.navy}}/>{vipPlateSearch&&<button onClick={()=>setVipPlateSearch('')} className="absolute left-2 top-1/2 -translate-y-1/2 border-0 bg-transparent cursor-pointer" style={{color:BRAND.slateMuted}}><X size={12}/></button>}</div></div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="text-center p-3 rounded-2xl border" style={{background:BRAND.card,borderColor:BRAND.border}}><div className="text-[9px] font-bold" style={{color:BRAND.slate}}>💰 إيراد الجراجات</div><div className="font-black font-mono text-lg mt-1" style={{color:BRAND.greenDark}}>{vipReportStats.totalRevenue.toFixed(0)}</div><div className="text-[8px] font-bold" style={{color:BRAND.slateMuted}}>ج.م</div></div>
          <div className="text-center p-3 rounded-2xl border" style={{background:BRAND.card,borderColor:BRAND.border}}><div className="text-[9px] font-bold" style={{color:BRAND.slate}}>🚗 عدد الركنات</div><div className="font-black font-mono text-lg mt-1" style={{color:BRAND.blue}}>{vipReportStats.totalSessions}</div><div className="text-[8px] font-bold" style={{color:BRAND.slateMuted}}>ركنة VIP</div></div>
          <div className="text-center p-3 rounded-2xl" style={{background:`linear-gradient(135deg,${BRAND.blueSoft} 0%,${BRAND.blueLight} 100%)`,border:`1.5px solid ${BRAND.blue}40`}}><div className="text-[9px] font-black flex items-center justify-center gap-0.5" style={{color:BRAND.blueDark}}><Zap size={10}/> رسوم VIP</div><div className="font-black font-mono text-lg mt-1" style={{color:BRAND.blue}}>{vipReportStats.totalBookingFees.toFixed(0)}</div><div className="text-[8px] font-bold" style={{color:BRAND.blueDark}}>ج.م ({BOOKING_FEE}ج × {vipReportStats.totalSessions})</div></div>
        </div>
        <div className="flex items-center justify-between gap-1 mb-4 py-2 px-3 rounded-xl border" style={{background:BRAND.bg,borderColor:BRAND.border}}>{[{icon:'💵',label:'نقدي',count:vipReportStats.cashCount,color:BRAND.greenDark},{icon:'👝',label:'محفظة',count:vipReportStats.walletCount,color:BRAND.blue},{icon:'📱',label:'إنستا',count:vipReportStats.instapayCount,color:'#7c3aed'},{icon:'📲',label:'أخرى',count:vipReportStats.otherCount,color:BRAND.slate}].map((p,i)=>(<div key={i} className="flex items-center gap-1 text-[10px]"><span>{p.icon}</span><span className="font-black font-mono" style={{color:p.color}}>{p.count}</span>{i<3&&<div style={{width:1,height:14,background:BRAND.border,marginLeft:4,marginRight:2}}/>}</div>))}</div>
        <div className="mb-4 space-y-2">
          <div className="flex items-center justify-between px-1"><span className="font-black text-[9px] px-2 py-0.5 rounded bg-slate-200" style={{color:BRAND.slate}}>عرض {Math.min(visibleVipGarages,vipReportStats.perGarage.length)} من {vipReportStats.perGarage.length} جراج</span><h4 className="font-black text-[11px]" style={{color:BRAND.navy}}>📊 تفصيلة كل جراج VIP</h4></div>
          {vipReportStats.perGarage.length===0?<div className="text-center py-8 border-2 border-dashed rounded-2xl" style={{background:BRAND.card,borderColor:BRAND.border}}><span className="text-2xl block mb-1">📭</span><p className="font-black text-[11px]" style={{color:BRAND.slateMuted}}>لا توجد ركنات VIP في هذه الفترة</p></div>:(<>
            {vipReportStats.perGarage.slice(0,visibleVipGarages).map(g=>{const isExp=vipExpandedGarageId===g.id;const gs=vipFilteredSessions.filter(s=>s.garageId===g.id);return(<div key={g.id} className="transition-all" style={{background:BRAND.card,border:`1.5px solid ${isExp?BRAND.blue:BRAND.border}`,borderRadius:18,overflow:'hidden'}}>
              <div onClick={()=>setVipExpandedGarageId(isExp?null:g.id)} className="flex justify-between items-center p-3.5 cursor-pointer active:scale-[0.99] transition-all"><div className="flex items-center gap-2"><div className="text-center"><div className="font-black font-mono text-base" style={{color:BRAND.greenDark}}>{g.revenue.toFixed(0)}</div><div className="text-[8px] font-bold" style={{color:BRAND.slateMuted}}>ج.م إيراد</div></div><div style={{width:1,height:28,background:BRAND.border}}/><div className="text-center"><div className="font-black font-mono text-sm" style={{color:BRAND.blue}}>{g.fees.toFixed(0)}</div><div className="text-[8px] font-bold" style={{color:BRAND.slateMuted}}>ج.م رسوم</div></div><div style={{width:1,height:28,background:BRAND.border}}/><div className="text-center"><div className="font-black font-mono text-sm" style={{color:BRAND.navy}}>{g.count}</div><div className="text-[8px] font-bold" style={{color:BRAND.slateMuted}}>ركنة</div></div>{isExp?<ChevronUp size={14} style={{color:BRAND.slateMuted}}/>:<ChevronDown size={14} style={{color:BRAND.slateMuted}}/>}</div><div className="text-right"><div className="font-black text-xs flex items-center justify-end gap-1" style={{color:BRAND.navy}}><span>{g.name}</span><Zap size={11} style={{color:BRAND.blue}}/></div><div className="text-[9px] font-bold mt-0.5" style={{color:BRAND.slate}}>{g.area}</div></div></div>
              <AnimatePresence>{isExp&&(<motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} style={{borderTop:`1px solid ${BRAND.border}`,background:BRAND.bg}}><div className="max-h-[320px] overflow-y-auto">{gs.length===0?<div className="text-center py-6 text-xs font-bold" style={{color:BRAND.slateMuted}}>لا توجد ركنات</div>:<div className="divide-y" style={{borderColor:BRAND.border}}>{gs.map(s=>{const stMs=toMs(s.startTime);const enMs=toMs(s.endTime);const rev=getRevenue(s);return(<div key={s.id} className="px-4 py-2.5 flex items-center justify-between gap-2" style={{background:BRAND.card}}><div className="text-right flex-1 min-w-0"><div className="font-black text-xs truncate" style={{color:BRAND.navy}}>🚗 {s.carPlate}</div><div className="flex items-center gap-1.5 justify-end mt-0.5 flex-wrap"><span className="font-mono text-[9px] font-bold" style={{color:BRAND.slateMuted}}>{formatSessionTime(s.startTime)}</span><span className="text-[8px]" style={{color:BRAND.border}}>→</span><span className="font-mono text-[9px] font-bold" style={{color:BRAND.slateMuted}}>{formatSessionTime(s.endTime)}</span></div></div><div className="text-center px-2"><div className="font-mono font-black text-[10px]" style={{color:BRAND.slate}}>{formatDuration(stMs,enMs)}</div></div><div className="text-left flex-shrink-0"><div className="font-black font-mono text-xs" style={{color:BRAND.greenDark}}>{rev.toFixed(0)} ج.م</div><div className="flex items-center gap-1 mt-0.5"><span className="font-black text-[7px] px-1.5 py-0.5 rounded text-white" style={{background:BRAND.blue}}>⚡{BOOKING_FEE}ج</span><span className="font-black text-[7px] px-1.5 py-0.5 rounded text-white" style={{background:s.paymentMethod==='cash'?BRAND.greenDark:s.paymentMethod==='wallet'?BRAND.blue:s.paymentMethod==='instapay'?'#7c3aed':BRAND.slate}}>{s.paymentMethod==='cash'?'💵':s.paymentMethod==='wallet'?'👝':s.paymentMethod==='instapay'?'📱':'📲'}</span></div></div></div>);})}</div>}</div></motion.div>)}</AnimatePresence>
            </div>);})}
            {vipReportStats.perGarage.length>visibleVipGarages&&<div className="mt-3 text-center"><button onClick={()=>setVisibleVipGarages(p=>p+10)} className="w-full font-black py-2.5 rounded-xl text-[10px] cursor-pointer bg-white border active:scale-95 transition-all flex items-center justify-center gap-1.5" style={{color:BRAND.blue,borderColor:BRAND.border}}><ChevronDown size={14}/><span>عرض المزيد ({vipReportStats.perGarage.length-visibleVipGarages} جراج آخر)</span></button></div>}
          </>)}
        </div>
        <div>
          <div className="flex items-center justify-between mb-2 px-1"><span className="font-bold text-[9px]" style={{color:BRAND.slateMuted}}>عرض {Math.min(vipVisibleSessions,vipFilteredSessions.length)} من {vipFilteredSessions.length} عملية</span><h4 className="font-black text-[11px]" style={{color:BRAND.navy}}>📋 تفاصيل كل العمليات VIP</h4></div>
          <div className="rounded-2xl border overflow-hidden" style={{background:BRAND.card,borderColor:BRAND.border}}>
            {vipFilteredSessions.length===0?<div className="text-center py-10"><span className="text-2xl block mb-1">📭</span><p className="font-black text-xs" style={{color:BRAND.slateMuted}}>{vipPlateSearch?`لا توجد نتائج لـ "${vipPlateSearch}"`:'لا توجد عمليات VIP في الفترة المحددة'}</p></div>:(<>
              <div className="grid px-3 py-2" style={{gridTemplateColumns:'1fr auto auto auto',gap:8,background:BRAND.navy,color:'#fff'}}><div className="font-black text-[9px] text-right">اللوحة + الجراج</div><div className="font-black text-[9px] text-center">المدة</div><div className="font-black text-[9px] text-center">المبلغ</div><div className="font-black text-[9px] text-center">الدفع</div></div>
              <div className="max-h-[400px] overflow-y-auto divide-y" style={{borderColor:BRAND.border}}>{vipFilteredSessions.slice(0,vipVisibleSessions).map(s=>{const g=garages.find(ga=>ga.id===s.garageId);const stMs=toMs(s.startTime);const enMs=toMs(s.endTime);const rev=getRevenue(s);return(<div key={s.id} className="grid px-3 py-2.5 items-center" style={{gridTemplateColumns:'1fr auto auto auto',gap:8}}><div className="text-right min-w-0"><div className="font-black text-[11px] truncate" style={{color:BRAND.navy}}>🚗 {s.carPlate}</div><div className="font-bold text-[9px] truncate" style={{color:BRAND.slate}}>{g?.name||'—'}</div><div className="font-mono text-[8px]" style={{color:BRAND.slateMuted}}>{formatSessionTime(s.endTime)}</div></div><div className="font-mono font-black text-[10px] text-center" style={{color:BRAND.slate}}>{formatDuration(stMs,enMs)}</div><div className="text-center"><div className="font-black font-mono text-[11px]" style={{color:BRAND.greenDark}}>{rev.toFixed(0)}ج</div><div className="font-black text-[7px]" style={{color:BRAND.blue}}>+{BOOKING_FEE}ج⚡</div></div><div className="text-center"><span className="font-black text-[8px] px-1.5 py-0.5 rounded text-white" style={{background:s.paymentMethod==='cash'?BRAND.greenDark:s.paymentMethod==='wallet'?BRAND.blue:s.paymentMethod==='instapay'?'#7c3aed':BRAND.slate}}>{s.paymentMethod==='cash'?'💵':s.paymentMethod==='wallet'?'👝':s.paymentMethod==='instapay'?'📱':'📲'}</span></div></div>);})}</div>
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
          {filteredGaragesForAdmin.length===0?<div className="text-center py-10 bg-white border rounded-2xl" style={{borderColor:BRAND.border}}><div className="text-2xl mb-1">🔍</div><p className="font-bold text-xs" style={{color:BRAND.slateMuted}}>لا توجد جراجات مطابقة للبحث</p></div>:filteredGaragesForAdmin.slice(0,visibleGarageCount).map(g=>{
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