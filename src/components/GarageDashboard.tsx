import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Car, Clock, DollarSign, LogOut, Plus, CheckCircle, XCircle, Settings,
  Minus, Save, MapPin, Edit3, Navigation, Phone, CarFront, FileText,
  CalendarDays, Undo2, Zap,
} from 'lucide-react';
import { useStore, pausePolling } from '../store';
import { supabase } from '../lib/supabase';
import { calculateFullHours, calculateCost } from '../utils/pricing';
import toast from 'react-hot-toast';
import { subscribeToPush, refreshPushSubscriptionIfNeeded } from '../lib/pushManager';
import InstallPWABanner from './InstallPWABanner';

const UNDO_TIMEOUT_SECONDS = 30;

interface UndoableSession { sessionId: string; localId: string; carPlate: string; price: number; addedAt: number; }
interface DailyStat { garage_id: string; stat_date: string; total_sessions: number; manual_sessions: number; app_sessions: number; total_revenue: number; cash_revenue: number; instapay_revenue: number; wallet_revenue: number; cashwallet_revenue: number; confirmed_revenue: number; pending_revenue: number; }

const getLocalToday = (): string => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; };
const timestampToLocalDate = (ts: number): string => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const formatLocalDateArabic = (dateStr: string): string => { const [y,m,d] = dateStr.split('-').map(Number); return new Date(y,m-1,d).toLocaleDateString('ar-EG',{weekday:'long',year:'numeric',month:'long',day:'numeric'}); };

let audioCtxInstance: AudioContext|null = null;
let audioCtxReady = false;
const initAudioContext = async (): Promise<AudioContext|null> => { try { if(!audioCtxInstance){const A=window.AudioContext||(window as any).webkitAudioContext;if(!A)return null;audioCtxInstance=new A();} if(audioCtxInstance.state==='suspended')await audioCtxInstance.resume();audioCtxReady=audioCtxInstance.state==='running';return audioCtxInstance;}catch{return null;} };
const getAudioCtx = (): AudioContext|null => { if(!audioCtxInstance)return null;if(audioCtxInstance.state==='closed'){audioCtxInstance=null;audioCtxReady=false;return null;}return audioCtxInstance; };
const setupAudioOnInteraction = () => { const e=['touchstart','touchend','mousedown','keydown','click'];const h=async()=>{if(!audioCtxReady){await initAudioContext();if(audioCtxReady)e.forEach(ev=>document.removeEventListener(ev,h));}};e.forEach(ev=>document.addEventListener(ev,h,{passive:true})); };
setupAudioOnInteraction();
const vibrateDevice = () => { try{if('vibrate' in navigator)navigator.vibrate([500,150,500,150,700,200,700,150,500,150,900]);}catch{} };
const sendNotification = (title: string, body: string, tag: string) => { try{if('Notification' in window&&Notification.permission==='granted'){const n=new Notification(title,{body,icon:'/icons/icon-192x192.png',badge:'/icons/icon-96x96.png',tag,requireInteraction:true,silent:false});n.onclick=()=>{window.focus();n.close();};setTimeout(()=>n.close(),30000);}}catch{} };

const playFirstAlert = async () => { let ctx=getAudioCtx();if(!ctx||!audioCtxReady)ctx=await initAudioContext();if(!ctx)return;try{if(ctx.state==='suspended')await ctx.resume();[{freq:800,delay:0,dur:0.15},{freq:1000,delay:0.2,dur:0.15},{freq:1200,delay:0.4,dur:0.2},{freq:800,delay:0.7,dur:0.15},{freq:1000,delay:0.9,dur:0.15},{freq:1200,delay:1.1,dur:0.2},{freq:1400,delay:1.5,dur:0.4}].forEach(({freq,delay,dur})=>{const o=ctx!.createOscillator();const g=ctx!.createGain();o.connect(g);g.connect(ctx!.destination);o.type='square';o.frequency.value=freq;g.gain.setValueAtTime(0.5,ctx!.currentTime+delay);g.gain.exponentialRampToValueAtTime(0.01,ctx!.currentTime+delay+dur);o.start(ctx!.currentTime+delay);o.stop(ctx!.currentTime+delay+dur+0.05);});}catch(e){console.warn('⚠️',e);} };
const fireNewCarAlert = (carPlate: string, customerName?: string, agreedPrice?: number) => { playFirstAlert();vibrateDevice();sendNotification('🚨 سيارة في الطريق!',[`🚗 ${carPlate}`,customerName?`👤 ${customerName}`:'',agreedPrice?`💰 ${agreedPrice} ج.م/ساعة`:''].filter(Boolean).join('\n'),`incoming-${carPlate}`); };

const playApproachingAlert = async () => { let ctx=getAudioCtx();if(!ctx||!audioCtxReady)ctx=await initAudioContext();if(!ctx)return;try{if(ctx.state==='suspended')await ctx.resume();[{freq:1000,delay:0,dur:0.2},{freq:1300,delay:0.25,dur:0.2},{freq:1600,delay:0.5,dur:0.3},{freq:1000,delay:0.9,dur:0.2},{freq:1300,delay:1.15,dur:0.2},{freq:1600,delay:1.4,dur:0.3},{freq:1800,delay:1.8,dur:0.5}].forEach(({freq,delay,dur})=>{const o=ctx!.createOscillator();const g=ctx!.createGain();o.connect(g);g.connect(ctx!.destination);o.type='square';o.frequency.value=freq;g.gain.setValueAtTime(0.6,ctx!.currentTime+delay);g.gain.exponentialRampToValueAtTime(0.01,ctx!.currentTime+delay+dur);o.start(ctx!.currentTime+delay);o.stop(ctx!.currentTime+delay+dur+0.05);});}catch(e){console.warn('⚠️',e);} };
const fireApproachingAlert = (carPlate: string) => { playApproachingAlert();vibrateDevice();sendNotification('🚗 سيارة على وشك الوصول!',`🚗 ${carPlate} - باقي أقل من دقيقتين ⏰`,`approaching-${carPlate}`); };

export default function GarageDashboard() {
  const { garages,currentGarageId,setCurrentGarageId,sessions,addSession,endSession,removeSession,offers,updateOffer,cancelOffer,updateGarage,incomingCars,removeIncomingCar,fetchAll,confirmRevenue } = useStore();

  const garage = garages.find(g=>g.id===currentGarageId);
  const garageSessions = sessions.filter(s=>s.garageId===currentGarageId);
  const activeSessions = garageSessions.filter(s=>s.status==='active'&&Date.now()-s.startTime<24*60*60*1000);
  const completedSessions = garageSessions.filter(s=>s.status==='completed');
  const garageOffers = offers.filter(o=>o.garageId===currentGarageId&&o.status==='pending');
  const carsOnTheWay = incomingCars.filter(c=>c.garageId===currentGarageId&&c.status==='coming');

  const processedCarsRef=useRef<Set<string>>(new Set());
  const isEndingSessionRef=useRef(false);
  const prevIncomingIdsRef=useRef<Set<string>>(new Set());
  const prevOfferIdsRef=useRef<Set<string>>(new Set());
  const approachAlertedRef=useRef<Set<string>>(new Set());
  const audioInitializedRef=useRef(false);
  const pushSubscribedGarageRef=useRef<string|null>(null);

  const [undoableSessions,setUndoableSessions]=useState<UndoableSession[]>([]);
  const [newCarPlate,setNewCarPlate]=useState('');
  const [newCarPrice,setNewCarPrice]=useState(garage?.basePrice||15);
  const [showAddCar,setShowAddCar]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [editPrice,setEditPrice]=useState(garage?.basePrice||15);
  const [editSpots,setEditSpots]=useState(garage?.availableSpots||0);
  const [editCapacity,setEditCapacity]=useState(garage?.capacity||50);
  const [logDateFilter,setLogDateFilter]=useState(()=>getLocalToday());
  const [logPaymentFilter,setLogPaymentFilter]=useState<string>('all');
  const [confirmSession,setConfirmSession]=useState<{id:string;carPlate:string;cost:number;hours:number;minutes:number;source:'app'|'manual';agreedPrice?:number}|null>(null);
  const [confirmPaymentMethod,setConfirmPaymentMethod]=useState('cash');
  const [tick,setTick]=useState(0);
  const [garageDailyStats,setGarageDailyStats]=useState<DailyStat[]>([]);

  // Effects
  useEffect(()=>{const init=async()=>{if('Notification' in window&&Notification.permission==='default')await Notification.requestPermission();if(!audioInitializedRef.current){await initAudioContext();audioInitializedRef.current=true;}};init();},[]);
  useEffect(()=>{if(!currentGarageId||garages.length===0)return;if(pushSubscribedGarageRef.current===currentGarageId)return;(async()=>{try{const s=await subscribeToPush(currentGarageId);if(s)pushSubscribedGarageRef.current=currentGarageId;}catch(e){console.error('❌',e);}})();},[currentGarageId,garages]);
  useEffect(()=>{if(!currentGarageId)return;const h=async()=>{if(document.visibilityState==='visible'){await refreshPushSubscriptionIfNeeded(currentGarageId);await fetchAll();}};document.addEventListener('visibilitychange',h);return()=>document.removeEventListener('visibilitychange',h);},[currentGarageId,fetchAll]);

  useEffect(()=>{const ids=new Set(carsOnTheWay.map(c=>c.id));carsOnTheWay.forEach(car=>{if(!prevIncomingIdsRef.current.has(car.id)&&!document.hidden){fireNewCarAlert(car.carPlate,car.customerName,car.agreedPrice);toast(`🚨 سيارة في الطريق!\n🚗 ${car.carPlate}${car.agreedPrice?` - ${car.agreedPrice} ج.م/ساعة`:''}`,{duration:10000,icon:'🚨'});}});prevIncomingIdsRef.current.forEach(id=>{if(!ids.has(id)){approachAlertedRef.current.delete(id);try{if('vibrate' in navigator)navigator.vibrate(0);}catch{}}});prevIncomingIdsRef.current=ids;},[carsOnTheWay]);
  useEffect(()=>{carsOnTheWay.forEach(car=>{if(approachAlertedRef.current.has(car.id))return;const s=typeof car.startTime==='number'?car.startTime:new Date(car.startTime).getTime();const el=(Date.now()-s)/60000;const rem=Math.max(0,car.estimatedArrival-el);if(rem<=2&&rem>=0&&car.estimatedArrival>2){approachAlertedRef.current.add(car.id);if(!document.hidden){fireApproachingAlert(car.carPlate);toast(`🚗 على وشك الوصول!\n${car.carPlate}`,{duration:10000,icon:'⏰'});}}});},[carsOnTheWay,tick]);
  useEffect(()=>{garageOffers.forEach(o=>{if(!prevOfferIdsRef.current.has(o.id))toast(`💰 عرض جديد!\n🚗 ${o.carPlate} - ${o.offeredPrice} ج.م/ساعة`,{duration:8000,icon:'💰'});});prevOfferIdsRef.current=new Set(garageOffers.map(o=>o.id));},[garageOffers]);
  useEffect(()=>{return()=>{try{if('vibrate' in navigator)navigator.vibrate(0);}catch{}};},[]);

  const fetchGarageDailyStats=useCallback(async()=>{if(!currentGarageId)return;try{let q=supabase.from('daily_stats').select('*').eq('garage_id',currentGarageId);if(logDateFilter)q=q.eq('stat_date',logDateFilter);const{data,error}=await q;if(error){console.error('❌',error);return;}setGarageDailyStats(data??[]);}catch(e){console.error('❌',e);}},[currentGarageId,logDateFilter]);
  useEffect(()=>{fetchGarageDailyStats();},[fetchGarageDailyStats]);

  const totalRevenueFromStats=useMemo(()=>garageDailyStats.reduce((a,s)=>a+Number(s.confirmed_revenue??0),0),[garageDailyStats]);
  const pendingRevenueFromStats=useMemo(()=>garageDailyStats.reduce((a,s)=>a+Number(s.pending_revenue??0),0),[garageDailyStats]);
  const paymentStatsFromDB=useMemo(()=>({cash:garageDailyStats.reduce((a,s)=>a+Number(s.cash_revenue??0),0),instapay:garageDailyStats.reduce((a,s)=>a+Number(s.instapay_revenue??0),0),wallet:garageDailyStats.reduce((a,s)=>a+Number(s.wallet_revenue??0),0),cashwallet:garageDailyStats.reduce((a,s)=>a+Number(s.cashwallet_revenue??0),0),totalSessions:garageDailyStats.reduce((a,s)=>a+Number(s.total_sessions??0),0),manualSessions:garageDailyStats.reduce((a,s)=>a+Number(s.manual_sessions??0),0),appSessions:garageDailyStats.reduce((a,s)=>a+Number(s.app_sessions??0),0)}),[garageDailyStats]);

  const getSessionRevenue=useCallback((s:any)=>{if(s.totalPrice!=null&&Number(s.totalPrice)>0)return Number(s.totalPrice);if(s.endTime&&s.startTime){const st=typeof s.startTime==='number'?s.startTime:new Date(s.startTime).getTime();const en=typeof s.endTime==='number'?s.endTime:new Date(s.endTime).getTime();return calculateCost(Math.max(0,Math.floor((en-st)/1000)),Number(s.agreedPrice??garage?.basePrice??0));}return 0;},[garage?.basePrice]);
  const totalRevenue=useMemo(()=>completedSessions.filter(s=>s.revenueConfirmed).reduce((a,s)=>a+getSessionRevenue(s),0),[completedSessions,getSessionRevenue]);
  const getActiveCost=useCallback((s:any)=>{const st=typeof s.startTime==='number'?s.startTime:new Date(s.startTime).getTime();const el=Math.max(0,Math.floor((Date.now()-st)/1000));const r=Number(s.agreedPrice??garage?.basePrice??0);if(isNaN(el)||el<=0||isNaN(r)||r<=0)return 0;return calculateCost(el,r);},[garage?.basePrice]);

  const filteredCompleted=useMemo(()=>completedSessions.filter(s=>{if(logDateFilter&&s.endTime){const et=typeof s.endTime==='number'?s.endTime:new Date(s.endTime).getTime();if(timestampToLocalDate(et)!==logDateFilter)return false;}if(logPaymentFilter!=='all'&&s.paymentMethod!==logPaymentFilter)return false;return true;}),[completedSessions,logDateFilter,logPaymentFilter]);

  const filteredStats=useMemo(()=>{const c=filteredCompleted.filter(s=>s.revenueConfirmed);const u=filteredCompleted.filter(s=>!s.revenueConfirmed);const h=garageDailyStats.length>0;const cash=h?paymentStatsFromDB.cash:c.filter(s=>s.paymentMethod==='cash').reduce((a,s)=>a+getSessionRevenue(s),0);const instapay=h?paymentStatsFromDB.instapay:c.filter(s=>s.paymentMethod==='instapay').reduce((a,s)=>a+getSessionRevenue(s),0);const wallet=h?paymentStatsFromDB.wallet:c.filter(s=>s.paymentMethod==='wallet').reduce((a,s)=>a+getSessionRevenue(s),0);const cashwallet=h?paymentStatsFromDB.cashwallet:c.filter(s=>s.paymentMethod==='cashwallet').reduce((a,s)=>a+getSessionRevenue(s),0);const total=h?garageDailyStats.reduce((a,s)=>a+Number(s.confirmed_revenue??0),0):cash+instapay+wallet+cashwallet;const manual=c.filter(s=>s.source==='manual');const app=c.filter(s=>s.source==='app');const pr=h?pendingRevenueFromStats:u.reduce((a,s)=>a+getSessionRevenue(s),0);return{cash,instapay,wallet,cashwallet,total,manualCount:h?paymentStatsFromDB.manualSessions:manual.length,appCount:h?paymentStatsFromDB.appSessions:app.length,manualTotal:manual.reduce((a,s)=>a+getSessionRevenue(s),0),appTotal:app.reduce((a,s)=>a+getSessionRevenue(s),0),pendingRevenue:pr,pendingCount:u.length};},[filteredCompleted,getSessionRevenue,garageDailyStats,paymentStatsFromDB,pendingRevenueFromStats]);

  const handleUndoSession=useCallback((un:UndoableSession)=>{if(!garage)return;removeSession(un.sessionId);if(un.localId!==un.sessionId)removeSession(un.localId);const cs=useStore.getState().sessions;const ms=cs.find(s=>s.carPlate===un.carPlate&&s.source==='manual'&&s.status==='active'&&Math.abs(s.startTime-un.addedAt)<5000);if(ms)removeSession(ms.id);setUndoableSessions(p=>p.filter(u=>u.sessionId!==un.sessionId&&u.localId!==un.localId));toast('تم إلغاء '+un.carPlate+' ↩️',{icon:'🔙'});},[garage,removeSession]);
  const getUndoRemainingSeconds=useCallback((addedAt:number)=>Math.max(0,UNDO_TIMEOUT_SECONDS-Math.floor((Date.now()-addedAt)/1000)),[]);

  useEffect(()=>{const i=setInterval(()=>setTick(t=>t+1),1000);return()=>clearInterval(i);},[]);
  useEffect(()=>{if(garage)setNewCarPrice(garage.basePrice);},[garage?.basePrice,garage]);
  useEffect(()=>{setUndoableSessions(p=>p.filter(u=>Math.floor((Date.now()-u.addedAt)/1000)<UNDO_TIMEOUT_SECONDS).map(u=>{const e=sessions.find(s=>s.id===u.sessionId);if(!e){const n=sessions.find(s=>s.carPlate===u.carPlate&&s.source==='manual'&&s.status==='active'&&Math.abs(s.startTime-u.addedAt)<5000);if(n)return{...u,sessionId:n.id};}return u;}));},[tick,sessions]);

  if(!garage) return null;

  const handleAddCar=async()=>{if(!newCarPlate.trim()){toast.error('أدخل رقم السيارة');return;}const cp=newCarPlate.trim();const pr=newCarPrice;const at=Date.now();const sid=await addSession({garageId:garage.id,carPlate:cp,startTime:at,status:'active',source:'manual',agreedPrice:pr});const fid=sid||`fallback-${at}`;setUndoableSessions(p=>[...p,{sessionId:fid,localId:fid,carPlate:cp,price:pr,addedAt:at}]);toast.success(`تم إضافة السيارة بسعر ${pr} ج.م/ساعة`);setNewCarPlate('');setNewCarPrice(garage.basePrice);setShowAddCar(false);};

  const openConfirmPayment=(sid:string,cp:string,cost:number,hrs:number,mins:number,src:'app'|'manual',ap?:number)=>{const fc=cost>0?cost:(()=>{const s=activeSessions.find(s=>s.id===sid);if(!s)return 0;return getActiveCost(s);})();setConfirmSession({id:sid,carPlate:cp,cost:fc,hours:hrs,minutes:mins,source:src,agreedPrice:ap});setConfirmPaymentMethod('cash');};

  const handleConfirmPayment=async()=>{if(!confirmSession||isEndingSessionRef.current)return;isEndingSessionRef.current=true;pausePolling(20000);try{const sc={...confirmSession};const pc=confirmPaymentMethod;const sd=useStore.getState().sessions.find(s=>s.id===sc.id);const ia=sd?.source==='app';setConfirmSession(null);setUndoableSessions(p=>p.filter(u=>u.sessionId!==sc.id&&u.localId!==sc.id));await endSession(sc.id,sc.cost,pc);if(ia)await new Promise(r=>setTimeout(r,5000));await fetchGarageDailyStats();const ml=pc==='cash'?'نقدي 💵':pc==='instapay'?'إنستاباي 📱':pc==='wallet'?'محفظة 👝':'كاش 📲';toast.success(`تم تحصيل ${sc.cost} ج.م (${ml}) ✅`);}finally{setTimeout(()=>{isEndingSessionRef.current=false;},2000);}};

  const handleSaveSettings=()=>{updateGarage(garage.id,{basePrice:editPrice,availableSpots:Math.min(editSpots,editCapacity),capacity:editCapacity});toast.success('تم تحديث الإعدادات ⚡');setShowSettings(false);};
  const openSettings=()=>{setEditPrice(garage.basePrice);setEditSpots(garage.availableSpots);setEditCapacity(garage.capacity);setShowSettings(true);};

  const handleCarArrived=async(carId:string,carPlate:string,agreedPrice:number)=>{if(processedCarsRef.current.has(carId))return;processedCarsRef.current.add(carId);pausePolling(10000);try{const np=carPlate.trim().toUpperCase();const el=useStore.getState().sessions.find(s=>s.carPlate.trim().toUpperCase()===np&&s.status==='active');if(el){await removeIncomingCar(carId);await supabase.from('incoming_cars').delete().eq('car_plate',np).eq('garage_id',garage.id);toast('الجلسة شغالة ✅',{icon:'🚗'});return;}try{const{data:db}=await supabase.from('sessions').select('id').eq('car_plate',np).eq('status','active').limit(1);if(db&&db.length>0){await removeIncomingCar(carId);await supabase.from('incoming_cars').delete().eq('car_plate',np).eq('garage_id',garage.id);await fetchAll();toast('الجلسة شغالة ✅',{icon:'🚗'});return;}}catch(e){console.error(e);}const ro=offers.find(o=>o.carPlate.trim().toUpperCase()===np&&(o.status==='pending'||o.status==='accepted'));if(ro)cancelOffer(ro.id);await addSession({garageId:garage.id,carPlate:np,startTime:Date.now(),status:'active',source:'app',agreedPrice});await removeIncomingCar(carId);await supabase.from('incoming_cars').delete().eq('car_plate',np).eq('garage_id',garage.id);toast.success(`بدأ حساب ${carPlate} 🚗`);}catch(e){console.error('❌',e);processedCarsRef.current.delete(carId);toast.error('خطأ، حاول تاني');}};

  const calculateRemainingTime=(st:number,em:number)=>{const s=typeof st==='number'?st:new Date(st).getTime();return Math.max(0,em-Math.floor((Date.now()-s)/60000));};

  // ════════════════════════════════════════
  // JSX - النسخة الاحترافية الضخمة
  // ════════════════════════════════════════
  return (
    <div className="h-full overflow-y-auto" style={{ background: '#EBF2FF', color: '#0A1628', padding: 16 }}>

      {/* ══════ Header ══════ */}
      <div className="flex justify-between items-center mb-5 pt-14">
        <button onClick={()=>setCurrentGarageId(null)} className="active:scale-90 transition-all" style={{ background: '#fff', padding: 14, borderRadius: 20, border: '2px solid #D0DCFF', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <LogOut size={20} style={{ color: '#64748b' }} />
        </button>
        <div className="text-right flex-1 mr-3">
          <h2 className="font-black" style={{ fontSize: 22, color: '#0A1628' }}>{garage.name}</h2>
          <p className="flex items-center gap-1 justify-end" style={{ fontSize: 12, color: '#7B8CA6' }}>
            <MapPin size={12} /> {garage.location}
          </p>
        </div>
        <button onClick={openSettings} className="active:scale-90 transition-all" style={{ background: '#0066FF', padding: 14, borderRadius: 20, boxShadow: '0 6px 24px rgba(0,102,255,0.35)', color: '#fff' }}>
          <Settings size={20} />
        </button>
      </div>

      {/* ══════ مؤشر التنبيهات ══════ */}
      <div className="mb-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #00CC66 0%, #00AA55 100%)', borderRadius: 22, padding: '14px 18px', color: '#fff', boxShadow: '0 0 30px rgba(0,204,102,0.25), 0 6px 20px rgba(0,204,102,0.2)' }}>
        <button onClick={()=>{playFirstAlert();vibrateDevice();toast('🔔 تجربة!',{icon:'🔊'});}} className="font-black active:scale-95 transition-all" style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 14, padding: '8px 14px', fontSize: 11 }}>
          🔊 تجربة
        </button>
        <div className="text-right flex items-center gap-2">
          <div>
            <span className="font-black" style={{ fontSize: 13 }}>✅ التنبيهات مفعّلة</span>
            <div style={{ fontSize: 10, opacity: 0.8 }}>صوت + اهتزاز عند وصول العربيات</div>
          </div>
          <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, duration: 1.5 }} className="w-3 h-3 rounded-full bg-white" />
        </div>
      </div>

      <InstallPWABanner />

      {/* ══════ Settings Modal ══════ */}
      {showSettings && (
        <motion.div initial={{opacity:0}} animate={{opacity:1}} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }} onClick={()=>setShowSettings(false)}>
          <motion.div initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}} className="w-full max-w-sm max-h-[90vh] overflow-y-auto" style={{ background: '#fff', borderRadius: 32, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }} onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <button onClick={()=>setShowSettings(false)} style={{ color: '#94a3b8', fontSize: 20 }}>✕</button>
              <h3 className="font-black flex items-center gap-2" style={{ fontSize: 18, color: '#0A1628' }}><Settings size={18} style={{ color: '#0066FF' }} />إعدادات الجراج</h3>
            </div>

            {/* سعر الساعة */}
            <div className="mb-6">
              <label className="font-black block text-right mb-2" style={{ fontSize: 12, color: '#7B8CA6' }}>💰 سعر الساعة (ج.م)</label>
              <div style={{ background: '#F0F4FF', borderRadius: 22, padding: 16, border: '2px solid #D0DCFF' }}>
                <div className="flex items-center justify-between gap-4">
                  <button onClick={()=>setEditPrice(p=>Math.max(5,p-5))} className="active:scale-90 transition-all" style={{ background: '#FF3333', color: '#fff', width: 52, height: 52, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(255,51,51,0.3)' }}><Minus size={22} /></button>
                  <div className="text-center flex-1">
                    <input type="number" value={editPrice} onChange={e=>setEditPrice(Math.max(1,parseInt(e.target.value)||0))} className="bg-transparent text-center w-full outline-none font-mono font-black" style={{ fontSize: 40, color: '#0A1628' }} />
                    <div className="font-bold" style={{ fontSize: 11, color: '#94a3b8' }}>ج.م / ساعة</div>
                  </div>
                  <button onClick={()=>setEditPrice(p=>p+5)} className="active:scale-90 transition-all" style={{ background: '#00CC66', color: '#fff', width: 52, height: 52, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,204,102,0.3)' }}><Plus size={22} /></button>
                </div>
                <div className="flex gap-2 justify-center mt-3">
                  {[10,15,20,25,30].map(p=>(
                    <button key={p} onClick={()=>setEditPrice(p)} className="font-black transition-all" style={{ padding: '6px 14px', borderRadius: 12, fontSize: 12, background: editPrice===p?'#0066FF':'#fff', color: editPrice===p?'#fff':'#64748b', boxShadow: editPrice===p?'0 4px 12px rgba(0,102,255,0.3)':'none', border: editPrice===p?'none':'2px solid #D0DCFF' }}>{p}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* الأماكن */}
            <div className="mb-6">
              <label className="font-black block text-right mb-2" style={{ fontSize: 12, color: '#7B8CA6' }}>🚗 الأماكن المتاحة</label>
              <div style={{ background: '#F0F4FF', borderRadius: 22, padding: 16, border: '2px solid #D0DCFF' }}>
                <div className="flex items-center justify-between gap-4">
                  <button onClick={()=>setEditSpots(s=>Math.max(0,s-1))} className="active:scale-90 transition-all" style={{ background: '#FF3333', color: '#fff', width: 52, height: 52, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(255,51,51,0.3)' }}><Minus size={22} /></button>
                  <div className="text-center flex-1">
                    <input type="number" value={editSpots} onChange={e=>setEditSpots(Math.max(0,Math.min(editCapacity,parseInt(e.target.value)||0)))} className="bg-transparent text-center w-full outline-none font-mono font-black" style={{ fontSize: 40, color: '#0066FF' }} />
                    <div className="font-bold" style={{ fontSize: 11, color: '#94a3b8' }}>من {editCapacity} مكان</div>
                  </div>
                  <button onClick={()=>setEditSpots(s=>Math.min(editCapacity,s+1))} className="active:scale-90 transition-all" style={{ background: '#00CC66', color: '#fff', width: 52, height: 52, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,204,102,0.3)' }}><Plus size={22} /></button>
                </div>
                <div className="mt-3 overflow-hidden" style={{ background: '#D0DCFF', borderRadius: 10, height: 10 }}>
                  <div className="h-full transition-all duration-300" style={{ width: `${editCapacity>0?(editSpots/editCapacity)*100:0}%`, background: 'linear-gradient(90deg, #0066FF, #00CC66)', borderRadius: 10 }} />
                </div>
              </div>
            </div>

            {/* السعة */}
            <div className="mb-6">
              <label className="font-black block text-right mb-2" style={{ fontSize: 12, color: '#7B8CA6' }}>🏢 السعة الكلية</label>
              <div style={{ background: '#F0F4FF', borderRadius: 22, padding: 16, border: '2px solid #D0DCFF' }}>
                <div className="flex items-center justify-between gap-4">
                  <button onClick={()=>setEditCapacity(c=>Math.max(editSpots,c-10))} className="active:scale-90 transition-all" style={{ background: '#D0DCFF', color: '#64748b', width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={18} /></button>
                  <div className="text-center flex-1">
                    <input type="number" value={editCapacity} onChange={e=>setEditCapacity(Math.max(editSpots,parseInt(e.target.value)||editSpots))} className="bg-transparent text-center w-full outline-none font-mono font-black" style={{ fontSize: 28, color: '#7C3AED' }} />
                    <div className="font-bold" style={{ fontSize: 11, color: '#94a3b8' }}>مكان إجمالي</div>
                  </div>
                  <button onClick={()=>setEditCapacity(c=>c+10)} className="active:scale-90 transition-all" style={{ background: '#D0DCFF', color: '#64748b', width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={18} /></button>
                </div>
              </div>
            </div>

            <button onClick={handleSaveSettings} className="w-full font-black flex items-center justify-center gap-2 active:scale-95 transition-all" style={{ background: 'linear-gradient(135deg, #00CC66, #00AA55)', color: '#fff', padding: 18, borderRadius: 20, fontSize: 15, boxShadow: '0 8px 24px rgba(0,204,102,0.35)' }}>
              <Save size={20} /> حفظ التغييرات
            </button>
          </motion.div>
        </motion.div>
      )}

      {/* ══════ Confirm Payment Modal ══════ */}
      {confirmSession && (
        <motion.div initial={{opacity:0}} animate={{opacity:1}} className="fixed inset-0 z-50 flex items-end justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }} onClick={()=>setConfirmSession(null)}>
          <motion.div initial={{y:100,opacity:0}} animate={{y:0,opacity:1}} transition={{type:'spring',damping:25}} className="w-full max-w-sm" style={{ background: '#fff', borderRadius: '32px 32px 20px 20px', padding: 24, boxShadow: '0 -10px 40px rgba(0,0,0,0.1)' }} onClick={e=>e.stopPropagation()}>
            <div className="mx-auto mb-5" style={{ width: 40, height: 4, background: '#D0DCFF', borderRadius: 4 }} />
            <h3 className="font-black text-center mb-1" style={{ fontSize: 18, color: '#0A1628' }}>تأكيد تحصيل السداد</h3>
            <p className="text-center mb-5" style={{ fontSize: 12, color: '#7B8CA6' }}>لن يتم إنهاء الجلسة إلا بعد تأكيد السداد</p>

            <div className="mb-5" style={{ background: '#F0F4FF', borderRadius: 22, padding: 16, border: '2px solid #D0DCFF' }}>
              <div className="flex justify-between items-center mb-3">
                <span className="font-bold" style={{ fontSize: 10, padding: '4px 10px', borderRadius: 12, background: confirmSession.source==='manual'?'#FF9500':'#0066FF', color: '#fff' }}>
                  {confirmSession.source==='manual'?'يدوي':'تطبيق'}
                </span>
                <div className="font-black" style={{ fontSize: 18, color: '#0A1628' }}>🚗 {confirmSession.carPlate}</div>
              </div>
              {confirmSession.agreedPrice&&confirmSession.agreedPrice!==garage.basePrice&&(
                <div className="text-center mb-3" style={{ background: '#FFF3E0', borderRadius: 14, padding: 8, border: '1px solid #FFD180' }}>
                  <p className="font-bold" style={{ fontSize: 11, color: '#E65100' }}>💰 السعر المتفق: {confirmSession.agreedPrice} ج.م/ساعة</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center" style={{ background: '#fff', borderRadius: 16, padding: 12, border: '1px solid #E0EAFF' }}>
                  <div style={{ fontSize: 11, color: '#7B8CA6' }}>المدة</div>
                  <div className="font-black font-mono" style={{ fontSize: 16, color: '#0A1628' }}>{confirmSession.minutes} دقيقة</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>({confirmSession.hours} ساعة)</div>
                </div>
                <div className="text-center" style={{ background: '#fff', borderRadius: 16, padding: 12, border: '1px solid #E0EAFF' }}>
                  <div style={{ fontSize: 11, color: '#7B8CA6' }}>المستحق</div>
                  <div className="font-black font-mono" style={{ fontSize: 24, color: '#00AA44' }}>{confirmSession.cost>0?confirmSession.cost:'—'}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>ج.م</div>
                </div>
              </div>
            </div>

            {/* طريقة السداد */}
            <div className="mb-5">
              <h4 className="font-black mb-3 text-right" style={{ fontSize: 12, color: '#7B8CA6' }}>طريقة السداد</h4>
              {confirmSession.source==='manual'?(
                <div>
                  <div className="text-center" style={{ background: 'linear-gradient(135deg, #00CC66, #00AA55)', borderRadius: 18, padding: 18, color: '#fff', boxShadow: '0 6px 20px rgba(0,204,102,0.3)' }}>
                    <div style={{ fontSize: 28 }}>💵</div>
                    <div className="font-black" style={{ fontSize: 15 }}>نقدي</div>
                  </div>
                  <div className="text-center mt-3" style={{ background: '#FFF3E0', borderRadius: 14, padding: 8, border: '1px solid #FFD180' }}>
                    <p className="font-bold" style={{ fontSize: 11, color: '#E65100' }}>⚠️ يدوي = نقدي فقط</p>
                  </div>
                </div>
              ):(
                <div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {id:'cash',label:'نقدي',icon:'💵',bg:'#00CC66',shadow:'rgba(0,204,102,0.3)'},
                      {id:'instapay',label:'إنستاباي',icon:'📱',bg:'#7C3AED',shadow:'rgba(124,58,237,0.3)'},
                      {id:'wallet',label:'المحفظة',icon:'👝',bg:'#0066FF',shadow:'rgba(0,102,255,0.3)',disabled:true},
                      {id:'cashwallet',label:'محفظة كاش',icon:'📲',bg:'#FF8800',shadow:'rgba(255,136,0,0.3)'},
                    ].map(pm=>(
                      <button key={pm.id} onClick={()=>!pm.disabled&&setConfirmPaymentMethod(pm.id)} disabled={pm.disabled}
                        className="text-center transition-all active:scale-95"
                        style={{
                          borderRadius: 18, padding: 14,
                          background: pm.disabled?'#F0F4FF':confirmPaymentMethod===pm.id?pm.bg:'#fff',
                          color: pm.disabled?'#94a3b8':confirmPaymentMethod===pm.id?'#fff':'#475569',
                          border: pm.disabled?'2px solid #D0DCFF':confirmPaymentMethod===pm.id?'none':'2px solid #D0DCFF',
                          boxShadow: confirmPaymentMethod===pm.id?`0 6px 20px ${pm.shadow}`:'none',
                          opacity: pm.disabled?0.5:1,
                        }}>
                        <div style={{ fontSize: 24 }}>{pm.icon}</div>
                        <div className="font-black" style={{ fontSize: 11 }}>{pm.label}</div>
                        {pm.disabled&&<div className="font-bold" style={{ fontSize: 8, color: '#FF3333' }}>🔒 غير متاح</div>}
                      </button>
                    ))}
                  </div>
                  <div className="text-center mt-3" style={{ background: '#EBF2FF', borderRadius: 14, padding: 8, border: '1px solid #D0DCFF' }}>
                    <p className="font-bold" style={{ fontSize: 10, color: '#0066FF' }}>💡 المحفظة من تطبيق العميل فقط</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={handleConfirmPayment} className="flex-1 font-black flex items-center justify-center gap-2 active:scale-95 transition-all"
                style={{
                  padding: 18, borderRadius: 20, fontSize: 14, color: '#fff',
                  background: confirmPaymentMethod==='instapay'?'linear-gradient(135deg,#7C3AED,#5B21B6)':confirmPaymentMethod==='cashwallet'?'linear-gradient(135deg,#FF8800,#CC6600)':'linear-gradient(135deg,#00CC66,#00AA55)',
                  boxShadow: confirmPaymentMethod==='instapay'?'0 6px 24px rgba(124,58,237,0.35)':confirmPaymentMethod==='cashwallet'?'0 6px 24px rgba(255,136,0,0.35)':'0 6px 24px rgba(0,204,102,0.35)',
                }}>
                <CheckCircle size={20} /> تأكيد ({confirmSession.cost} ج.م)
              </button>
              <button onClick={()=>setConfirmSession(null)} className="active:scale-95 transition-all" style={{ background: '#F0F4FF', padding: '0 20px', borderRadius: 20, color: '#7B8CA6' }}>
                <XCircle size={20} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* ══════ Stats Cards ══════ */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { icon: <DollarSign size={22} />, value: (garageDailyStats.length>0?totalRevenueFromStats:totalRevenue).toFixed(0), label: 'مؤكد', bg: 'linear-gradient(135deg,#00CC66,#00AA55)', shadow: 'rgba(0,204,102,0.3)' },
          { icon: <Car size={22} />, value: garage.availableSpots, label: 'شاغر', bg: 'linear-gradient(135deg,#0066FF,#0044DD)', shadow: 'rgba(0,102,255,0.3)', onClick: openSettings },
          { icon: <DollarSign size={22} />, value: garage.basePrice, label: 'ج.م/ساعة', bg: 'linear-gradient(135deg,#7C3AED,#5B21B6)', shadow: 'rgba(124,58,237,0.3)', onClick: openSettings },
        ].map((s,i) => (
          <div key={i} onClick={s.onClick} className={`text-center ${s.onClick?'cursor-pointer active:scale-95':''} transition-all`}
            style={{ background: s.bg, borderRadius: 22, padding: '18px 10px', color: '#fff', boxShadow: `0 6px 24px ${s.shadow}` }}>
            <div className="mx-auto mb-1" style={{ opacity: 0.9 }}>{s.icon}</div>
            <div className="font-black font-mono" style={{ fontSize: 24 }}>{s.value}</div>
            <div className="font-bold flex items-center justify-center gap-1" style={{ fontSize: 9, opacity: 0.8 }}>{s.label} {s.onClick&&<Edit3 size={9} />}</div>
          </div>
        ))}
      </div>

      {/* ══════ Undo Banners ══════ */}
      <AnimatePresence>
        {undoableSessions.map(un=>{
          const rem=getUndoRemainingSeconds(un.addedAt);
          const prog=((UNDO_TIMEOUT_SECONDS-rem)/UNDO_TIMEOUT_SECONDS)*100;
          return (
            <motion.div key={un.localId} initial={{opacity:0,y:-20,scale:0.95}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-20,scale:0.95}} className="mb-4">
              <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#FF9500,#FF7700)', borderRadius: 22, padding: 16, color: '#fff', boxShadow: '0 6px 24px rgba(255,149,0,0.3)' }}>
                <div className="absolute bottom-0 left-0 right-0" style={{ height: 4, background: 'rgba(255,255,255,0.2)' }}>
                  <motion.div className="h-full" style={{ background: 'rgba(255,255,255,0.5)' }} initial={{width:'0%'}} animate={{width:`${prog}%`}} transition={{duration:0.5,ease:'linear'}} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <button onClick={()=>handleUndoSession(un)} className="font-black flex items-center gap-2 active:scale-95 transition-all shrink-0" style={{ background: '#FF3333', color: '#fff', padding: '12px 18px', borderRadius: 16, fontSize: 13, boxShadow: '0 4px 16px rgba(255,51,51,0.3)' }}>
                    <Undo2 size={18} /> تراجع
                  </button>
                  <div className="flex-1 text-right">
                    <div className="flex items-center justify-end gap-2 mb-1">
                      <span className="font-black" style={{ fontSize: 14 }}>🚗 {un.carPlate}</span>
                      <span className="font-bold" style={{ fontSize: 10, background: 'rgba(255,255,255,0.2)', padding: '3px 10px', borderRadius: 10 }}>يدوي</span>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <span style={{ fontSize: 11, opacity: 0.8 }}>{un.price} ج.م/ساعة</span>
                      <span style={{ opacity: 0.4 }}>|</span>
                      <span className="font-bold font-mono" style={{ fontSize: 11 }}>⏳ {rem} ثانية</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* ══════ سيارات في الطريق ══════ */}
      {carsOnTheWay.length>0&&(
        <div className="mb-5">
          <h3 className="font-black mb-3 flex items-center gap-2 justify-end" style={{ fontSize: 15, color: '#0099DD' }}>
            <span className="font-black" style={{ background: '#0099DD', color: '#fff', fontSize: 12, padding: '3px 12px', borderRadius: 20, boxShadow: '0 2px 8px rgba(0,153,221,0.3)' }}>{carsOnTheWay.length}</span>
            سيارات في الطريق <Navigation size={16} className="animate-pulse" />
          </h3>
          <div className="space-y-3">
            {carsOnTheWay.map(car=>{
              const rem=calculateRemainingTime(car.startTime,car.estimatedArrival);
              const started=sessions.some(s=>s.carPlate.trim().toUpperCase()===car.carPlate.trim().toUpperCase()&&s.status==='active');
              return (
                <motion.div key={car.id} initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} className="relative overflow-hidden" style={{ background: '#fff', border: '2.5px solid #00BBE0', borderRadius: 24, padding: 18, boxShadow: '0 4px 20px rgba(0,153,221,0.12)' }}>
                  <div className="absolute bottom-0 left-0 right-0" style={{ height: 5, background: '#E0F7FA' }}>
                    <div className="h-full transition-all" style={{ background: 'linear-gradient(90deg,#0099DD,#00CC66)', borderRadius: 5, width: `${Math.max(0,100-(rem/car.estimatedArrival)*100)}%` }} />
                  </div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                      <motion.div animate={{x:[0,-5,0]}} transition={{repeat:Infinity,duration:1.5}} style={{ background: '#0099DD', borderRadius: 16, padding: 10, color: '#fff', boxShadow: '0 4px 12px rgba(0,153,221,0.3)' }}>
                        <CarFront size={22} />
                      </motion.div>
                      {started?(
                        <span className="font-black" style={{ background: '#00CC66', color: '#fff', fontSize: 11, padding: '6px 14px', borderRadius: 14 }}>✅ شغالة</span>
                      ):(
                        <span className="font-black" style={{ background: rem<=2?'#FF9500':'#0099DD', color: '#fff', fontSize: 12, padding: '6px 14px', borderRadius: 14 }}>
                          {rem>0?`${rem} دقيقة`:'وصل تقريباً'}
                        </span>
                      )}
                    </div>
                    <div className="font-black" style={{ fontSize: 18, color: '#0A1628' }}>🚗 {car.carPlate}</div>
                  </div>
                  <div className="mb-3 space-y-2" style={{ background: '#F0F4FF', borderRadius: 18, padding: 14, border: '1px solid #D0DCFF' }}>
                    <div className="flex items-center justify-between">
                      <a href={`tel:${car.customerPhone}`} className="font-black font-mono" style={{ fontSize: 15, color: '#0066FF' }}>{car.customerPhone}</a>
                      <div className="flex items-center gap-1" style={{ color: '#94a3b8' }}><Phone size={14} /><span className="font-bold" style={{ fontSize: 11 }}>الهاتف</span></div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-black font-mono" style={{ fontSize: 15, color: '#00AA44' }}>{car.agreedPrice} ج.م / ساعة</span>
                      <div className="flex items-center gap-1" style={{ color: '#94a3b8' }}><DollarSign size={14} /><span className="font-bold" style={{ fontSize: 11 }}>السعر</span></div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={()=>handleCarArrived(car.id,car.carPlate,car.agreedPrice)} className="flex-1 font-black flex items-center justify-center gap-2 active:scale-95 transition-all"
                      style={{ background: started?'#94a3b8':'linear-gradient(135deg,#00CC66,#00AA55)', color: '#fff', borderRadius: 18, padding: 14, fontSize: 13, boxShadow: started?'none':'0 6px 20px rgba(0,204,102,0.3)' }}>
                      <CheckCircle size={18} /> {started?'تأكيد وإزالة':'وصلت وبدء الحساب'}
                    </button>
                    <a href={`tel:${car.customerPhone}`} className="flex items-center justify-center active:scale-95 transition-all" style={{ background: '#0066FF', color: '#fff', borderRadius: 18, padding: '0 16px', boxShadow: '0 4px 16px rgba(0,102,255,0.3)' }}>
                      <Phone size={20} />
                    </a>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════ شريط المعلومات ══════ */}
      <div className="mb-5 flex items-center justify-between" style={{ background: '#fff', borderRadius: 20, padding: '12px 16px', border: '2px solid #D0DCFF', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
        <button onClick={openSettings} className="font-bold flex items-center gap-1" style={{ fontSize: 11, color: '#0066FF' }}><Settings size={14} /> تعديل</button>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 11, color: '#7B8CA6' }}>السعر: <span className="font-mono font-black" style={{ color: '#00AA44' }}>{garage.basePrice}ج</span></span>
          <div style={{ width: 2, height: 14, background: '#D0DCFF', borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: '#7B8CA6' }}>متاح: <span className="font-mono font-black" style={{ color: '#0066FF' }}>{garage.availableSpots}/{garage.capacity}</span></span>
        </div>
      </div>

      {/* ══════ عروض الأسعار ══════ */}
      {garageOffers.length>0&&(
        <div className="mb-5">
          <h3 className="font-black mb-3 flex items-center gap-2 justify-end" style={{ fontSize: 15, color: '#FF9500' }}>عروض أسعار ({garageOffers.length})</h3>
          <div className="space-y-3">
            {garageOffers.map(o=>(
              <motion.div key={o.id} initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} style={{ background: '#fff', border: '2.5px solid #FFD180', borderRadius: 24, padding: 18, boxShadow: '0 4px 20px rgba(255,149,0,0.1)' }}>
                <div className="flex justify-between items-center mb-3">
                  <div className="font-black font-mono" style={{ fontSize: 22, color: '#0A1628' }}>
                    {o.offeredPrice} ج.م
                    {o.offeredPrice<garage.basePrice&&<span style={{ fontSize: 12, color: '#FF3333', marginRight: 8 }}>(أقل من {garage.basePrice})</span>}
                  </div>
                  <div className="font-black" style={{ fontSize: 15, color: '#0A1628' }}>🚗 {o.carPlate}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={()=>{updateOffer(o.id,'accepted');toast.success('تم القبول');}} className="flex-1 font-black flex items-center justify-center gap-1 active:scale-95 transition-all" style={{ background: 'linear-gradient(135deg,#00CC66,#00AA55)', color: '#fff', borderRadius: 16, padding: 14, fontSize: 13, boxShadow: '0 4px 16px rgba(0,204,102,0.3)' }}><CheckCircle size={18} /> قبول</button>
                  <button onClick={()=>{updateOffer(o.id,'rejected');toast.error('تم الرفض');}} className="flex-1 font-black flex items-center justify-center gap-1 active:scale-95 transition-all" style={{ background: 'linear-gradient(135deg,#FF3333,#CC0000)', color: '#fff', borderRadius: 16, padding: 14, fontSize: 13, boxShadow: '0 4px 16px rgba(255,51,51,0.3)' }}><XCircle size={18} /> رفض</button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* ══════ إضافة سيارة ══════ */}
      <div className="mb-5">
        {!showAddCar?(
          <button onClick={()=>setShowAddCar(true)} disabled={garage.availableSpots<=0} className="w-full font-black flex items-center justify-center gap-2 active:scale-95 transition-all"
            style={{ background: garage.availableSpots>0?'linear-gradient(135deg,#0066FF,#0044DD)':'#D0DCFF', color: garage.availableSpots>0?'#fff':'#94a3b8', borderRadius: 22, padding: 18, fontSize: 15, boxShadow: garage.availableSpots>0?'0 8px 32px rgba(0,102,255,0.35)':'none' }}>
            <Plus size={22} /> {garage.availableSpots>0?'إضافة سيارة جديدة':'لا توجد أماكن'}
          </button>
        ):(
          <motion.div initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}} className="space-y-3" style={{ background: '#fff', border: '2.5px solid #0066FF', borderRadius: 24, padding: 18, boxShadow: '0 4px 20px rgba(0,102,255,0.12)' }}>
            <input className="w-full font-bold text-right outline-none" style={{ background: '#F0F4FF', border: '2px solid #D0DCFF', padding: 14, borderRadius: 18, fontSize: 15, color: '#0A1628' }} placeholder="رقم لوحة السيارة" value={newCarPlate} onChange={e=>setNewCarPlate(e.target.value)} />
            <div>
              <label className="font-bold block text-right mb-1" style={{ fontSize: 11, color: '#7B8CA6' }}>💰 سعر الساعة - الافتراضي: {garage.basePrice} ج.م</label>
              <div className="flex items-center gap-2">
                <button onClick={()=>setNewCarPrice(p=>Math.max(5,p-5))} className="active:scale-90 transition-all" style={{ background: '#FF3333', color: '#fff', width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(255,51,51,0.3)' }}><Minus size={18} /></button>
                <input type="number" value={newCarPrice} onChange={e=>setNewCarPrice(Math.max(1,parseInt(e.target.value)||1))} className="flex-1 text-center font-black outline-none font-mono" style={{ background: '#F0F4FF', border: '2px solid #D0DCFF', padding: 10, borderRadius: 14, fontSize: 20, color: '#0A1628' }} />
                <button onClick={()=>setNewCarPrice(p=>p+5)} className="active:scale-90 transition-all" style={{ background: '#00CC66', color: '#fff', width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,204,102,0.3)' }}><Plus size={18} /></button>
              </div>
              <div className="flex gap-1.5 mt-2 justify-end">
                {[10,15,20,25,30].map(p=>(
                  <button key={p} onClick={()=>setNewCarPrice(p)} className="font-black transition-all active:scale-95" style={{ padding: '5px 12px', borderRadius: 10, fontSize: 11, background: newCarPrice===p?'#0066FF':'#F0F4FF', color: newCarPrice===p?'#fff':'#64748b', boxShadow: newCarPrice===p?'0 4px 12px rgba(0,102,255,0.3)':'none', border: newCarPrice===p?'none':'2px solid #D0DCFF' }}>{p}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddCar} className="flex-1 font-black active:scale-95 transition-all" style={{ background: 'linear-gradient(135deg,#00CC66,#00AA55)', color: '#fff', borderRadius: 18, padding: 14, fontSize: 14, boxShadow: '0 6px 20px rgba(0,204,102,0.3)' }}>إضافة ({newCarPrice} ج.م/ساعة)</button>
              <button onClick={()=>{setShowAddCar(false);setNewCarPlate('');setNewCarPrice(garage.basePrice);}} className="flex-1 font-black active:scale-95 transition-all" style={{ background: '#F0F4FF', color: '#64748b', borderRadius: 18, padding: 14, fontSize: 14, border: '2px solid #D0DCFF' }}>إلغاء</button>
            </div>
          </motion.div>
        )}
      </div>

      {/* ══════ الجلسات النشطة ══════ */}
      <div className="mb-5">
        <h3 className="font-black mb-3 flex items-center gap-2 justify-end" style={{ fontSize: 15, color: '#00AA44' }}>الجلسات النشطة ({activeSessions.length}) <Clock size={16} /></h3>
        <div className="space-y-3">
          {activeSessions.length===0?(
            <div className="text-center" style={{ background: '#fff', borderRadius: 22, padding: 28, border: '2px solid #D0DCFF', color: '#94a3b8', fontSize: 14 }}>لا توجد جلسات نشطة</div>
          ):(
            activeSessions.map(s=>{
              const st=typeof s.startTime==='number'?s.startTime:new Date(s.startTime).getTime();
              const el=Math.max(0,Math.floor((Date.now()-st)/1000));
              const mins=Math.floor(el/60);const hrs=calculateFullHours(el);const rate=Number(s.agreedPrice??garage.basePrice);const cost=calculateCost(el,rate);const isM=s.source==='manual';
              const un=undoableSessions.find(u=>u.sessionId===s.id||u.localId===s.id);
              return (
                <div key={s.id} className="overflow-hidden" style={{ background: isM?'#FFF8F0':'#fff', border: `2.5px solid ${isM?'#FFD180':'#D0DCFF'}`, borderRadius: 24, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <motion.span animate={{scale:[1,1.3,1]}} transition={{repeat:Infinity,duration:1.5}} className="rounded-full" style={{ width: 10, height: 10, background: isM?'#FF9500':'#00CC66' }} />
                      <span style={{ fontSize: 12, color: '#7B8CA6' }}>{mins} دقيقة ({hrs} ساعة)</span>
                      <span className="font-bold" style={{ fontSize: 10, padding: '4px 10px', borderRadius: 12, background: isM?'#FF9500':'#0066FF', color: '#fff' }}>{isM?'يدوي':'تطبيق'}</span>
                    </div>
                    <div className="font-black" style={{ fontSize: 15, color: '#0A1628' }}>🚗 {s.carPlate}</div>
                  </div>
                  {s.agreedPrice&&s.agreedPrice!==garage.basePrice&&(
                    <div className="text-center mb-2" style={{ background: '#FFF3E0', borderRadius: 12, padding: 6, border: '1px solid #FFD180' }}>
                      <span className="font-bold" style={{ fontSize: 10, color: '#E65100' }}>سعر متفق: {s.agreedPrice} ج.م/ساعة</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <button onClick={()=>openConfirmPayment(s.id,s.carPlate,cost,hrs,mins,s.source,s.agreedPrice)} className="font-black active:scale-95 transition-all" style={{ background: 'linear-gradient(135deg,#FF3333,#CC0000)', color: '#fff', padding: '10px 18px', borderRadius: 16, fontSize: 12, boxShadow: '0 4px 16px rgba(255,51,51,0.3)' }}>إنهاء وتحصيل</button>
                      {un&&(
                        <motion.button initial={{opacity:0,scale:0.8}} animate={{opacity:1,scale:1}} onClick={()=>handleUndoSession(un)} className="font-black flex items-center gap-1 active:scale-95 transition-all" style={{ background: '#FF9500', color: '#fff', padding: '10px 14px', borderRadius: 14, fontSize: 11, boxShadow: '0 4px 12px rgba(255,149,0,0.3)' }}>
                          <Undo2 size={14} /> ({getUndoRemainingSeconds(un.addedAt)}ث)
                        </motion.button>
                      )}
                    </div>
                    <div className="font-black font-mono" style={{ fontSize: 15, color: '#00AA44' }}>{cost} ج.م ({hrs}×{rate})</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ══════ سجل العمليات ══════ */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="font-bold" style={{ fontSize: 11, background: '#fff', padding: '6px 12px', borderRadius: 12, border: '2px solid #D0DCFF', color: '#7B8CA6' }}>{filteredCompleted.length} عملية</span>
          <h3 className="font-black flex items-center gap-2" style={{ fontSize: 15, color: '#334155' }}>سجل العمليات <FileText size={16} /></h3>
        </div>

        <div className="mb-4" style={{ background: '#fff', borderRadius: 24, padding: 16, border: '2px solid #D0DCFF', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center gap-2 mb-3 justify-end">
            <CalendarDays size={16} style={{ color: '#0066FF' }} />
            <span className="font-black" style={{ fontSize: 12, color: '#7B8CA6' }}>تصفية بالتاريخ</span>
          </div>
          <div className="flex gap-2 mb-3">
            <input type="date" value={logDateFilter} onChange={e=>setLogDateFilter(e.target.value)} className="flex-1 font-bold outline-none" style={{ background: '#F0F4FF', border: '2px solid #D0DCFF', padding: 12, borderRadius: 16, fontSize: 12, color: '#0A1628' }} />
            <button onClick={()=>setLogDateFilter(getLocalToday())} className="font-black active:scale-95 transition-all whitespace-nowrap" style={{ background: '#0066FF', color: '#fff', padding: '0 14px', borderRadius: 16, fontSize: 11, boxShadow: '0 4px 12px rgba(0,102,255,0.3)' }}>اليوم</button>
            <button onClick={()=>setLogDateFilter('')} className="font-black active:scale-95 transition-all whitespace-nowrap" style={{ background: '#F0F4FF', color: '#64748b', padding: '0 14px', borderRadius: 16, fontSize: 11, border: '2px solid #D0DCFF' }}>الكل</button>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {[{id:'all',label:'الكل',icon:'📊'},{id:'cash',label:'نقدي',icon:'💵'},{id:'instapay',label:'إنستاباي',icon:'📱'},{id:'wallet',label:'محفظة',icon:'👝'},{id:'cashwallet',label:'كاش',icon:'📲'}].map(f=>(
              <button key={f.id} onClick={()=>setLogPaymentFilter(f.id)} className="font-black transition-all active:scale-95"
                style={{ padding: '6px 12px', borderRadius: 12, fontSize: 10, background: logPaymentFilter===f.id?'#0066FF':'#F0F4FF', color: logPaymentFilter===f.id?'#fff':'#64748b', boxShadow: logPaymentFilter===f.id?'0 4px 12px rgba(0,102,255,0.3)':'none', border: logPaymentFilter===f.id?'none':'2px solid #D0DCFF' }}>
                {f.icon} {f.label}
              </button>
            ))}
          </div>
        </div>

        {filteredCompleted.length>0&&(
          <>
            {filteredStats.pendingCount>0&&(
              <div className="mb-4" style={{ background: 'linear-gradient(135deg,#FF9500,#FF7700)', borderRadius: 22, padding: 16, color: '#fff', boxShadow: '0 6px 24px rgba(255,149,0,0.3)' }}>
                <div className="flex justify-between items-center">
                  <div className="text-right">
                    <h3 className="font-black" style={{ fontSize: 14 }}>⏳ إيرادات معلقة ({filteredStats.pendingCount})</h3>
                    <p style={{ fontSize: 10, opacity: 0.8 }}>تحتاج تأكيد</p>
                  </div>
                  <div className="font-black font-mono" style={{ fontSize: 22 }}>{filteredStats.pendingRevenue.toFixed(0)} ج.م</div>
                </div>
              </div>
            )}

            <div className="mb-4 text-center" style={{ background: 'linear-gradient(135deg,#00CC66,#00AA55)', borderRadius: 24, padding: 22, color: '#fff', boxShadow: '0 8px 32px rgba(0,204,102,0.3)' }}>
              <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>{logDateFilter?`مؤكد - ${formatLocalDateArabic(logDateFilter)}`:'مؤكد - الكل'}</div>
              <div className="font-black font-mono" style={{ fontSize: 40 }}>{filteredStats.total.toFixed(0)} ج.م</div>
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{filteredCompleted.filter(s=>s.revenueConfirmed).length} عملية مؤكدة</div>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                {label:'نقدي',value:filteredStats.cash,icon:'💵',bg:'#00CC66',shadow:'rgba(0,204,102,0.3)'},
                {label:'إنستاباي',value:filteredStats.instapay,icon:'📱',bg:'#7C3AED',shadow:'rgba(124,58,237,0.3)'},
                {label:'محفظة',value:filteredStats.wallet,icon:'👝',bg:'#0066FF',shadow:'rgba(0,102,255,0.3)'},
                {label:'كاش',value:filteredStats.cashwallet,icon:'📲',bg:'#FF8800',shadow:'rgba(255,136,0,0.3)'},
              ].map(p=>(
                <div key={p.label} className="text-center" style={{ background: p.bg, borderRadius: 18, padding: '12px 6px', color: '#fff', boxShadow: `0 4px 16px ${p.shadow}` }}>
                  <div style={{ fontSize: 20, marginBottom: 2 }}>{p.icon}</div>
                  <div className="font-black font-mono" style={{ fontSize: 15 }}>{p.value.toFixed(0)}</div>
                  <div className="font-bold" style={{ fontSize: 8, opacity: 0.8 }}>{p.label}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {[
                {label:'يدوي',count:filteredStats.manualCount,total:filteredStats.manualTotal,bg:'#FF9500',shadow:'rgba(255,149,0,0.3)'},
                {label:'تطبيق',count:filteredStats.appCount,total:filteredStats.appTotal,bg:'#0066FF',shadow:'rgba(0,102,255,0.3)'},
              ].map(x=>(
                <div key={x.label} className="text-center" style={{ background: x.bg, borderRadius: 18, padding: 14, color: '#fff', boxShadow: `0 4px 16px ${x.shadow}` }}>
                  <div className="font-black" style={{ fontSize: 10, marginBottom: 4 }}>{x.label}</div>
                  <span className="font-black font-mono" style={{ fontSize: 16 }}>{x.count}</span>
                  <span style={{ fontSize: 10, opacity: 0.8, marginRight: 4 }}>عربية</span>
                  <div style={{ fontSize: 10, opacity: 0.8 }}>({x.total.toFixed(0)} ج.م)</div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="space-y-2">
          {filteredCompleted.map(session=>{
            const isM=session.source==='manual';
            const et=session.endTime?typeof session.endTime==='number'?session.endTime:new Date(session.endTime).getTime():null;
            const time=et?new Date(et):null;
            const rev=getSessionRevenue(session);
            const isC=session.revenueConfirmed;
            return (
              <div key={session.id} style={{ background: isC?(isM?'#FFF8F0':'#EBF5FF'):'#FFF8F0', border: `2px solid ${isC?(isM?'#FFD180':'#A0C4FF'):'#FFD180'}`, borderRadius: 18, padding: 14 }}>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-black" style={{ fontSize: 14, color: isM?'#E65100':'#0066FF' }}>{rev.toFixed(0)} ج.م</span>
                    <span className="font-bold" style={{ fontSize: 9, padding: '3px 10px', borderRadius: 10, background: isM?'#FF9500':'#0066FF', color: '#fff' }}>{isM?'يدوي':'تطبيق'}</span>
                    {!isC?(
                      <button onClick={async()=>{await confirmRevenue(session.id);await fetchGarageDailyStats();toast.success('تأكيد ✅');}} className="font-black active:scale-95 transition-all" style={{ background: '#FF9500', color: '#fff', padding: '3px 10px', borderRadius: 10, fontSize: 9 }}>⏳ تأكيد</button>
                    ):(
                      <span className="font-bold" style={{ fontSize: 9, color: '#00AA44' }}>✅ مؤكد</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="rounded-full" style={{ width: 6, height: 6, background: isM?'#FF9500':'#0066FF' }} />
                    <span className="font-bold" style={{ fontSize: 12, color: '#334155' }}>{session.carPlate}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    {session.paymentMethod&&(
                      <span className="font-bold" style={{ fontSize: 9, padding: '3px 10px', borderRadius: 10, color: '#fff', background: session.paymentMethod==='cash'?'#00CC66':session.paymentMethod==='instapay'?'#7C3AED':session.paymentMethod==='wallet'?'#0066FF':'#FF8800' }}>
                        {session.paymentMethod==='cash'?'💵 نقدي':session.paymentMethod==='instapay'?'📱 إنستاباي':session.paymentMethod==='wallet'?'👝 محفظة':'📲 كاش'}
                      </span>
                    )}
                    {session.agreedPrice&&session.agreedPrice!==garage.basePrice&&(
                      <span className="font-bold" style={{ fontSize: 9, color: '#E65100' }}>({session.agreedPrice}ج/س)</span>
                    )}
                  </div>
                  {time&&(
                    <span className="font-mono" style={{ fontSize: 10, color: '#94a3b8' }}>
                      {time.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {filteredCompleted.length===0&&(
            <div className="text-center" style={{ background: '#fff', borderRadius: 24, padding: 32, border: '2px solid #D0DCFF' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
              <p className="font-bold" style={{ fontSize: 14, color: '#7B8CA6' }}>لا توجد عمليات</p>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{logDateFilter?'جرب تغيير التاريخ':'لم تتم أي عمليات'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}