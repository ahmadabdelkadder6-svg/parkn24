import { create } from 'zustand';
import { supabase } from './lib/supabase';

// ===================== Types =====================

export interface Garage {
  id: string;
  name: string;
  username: string;
  phone: string;
  ownerPhone?: string;         
  location: string;
  lat: number;
  lng: number;
  capacity: number;
  availableSpots: number;
  basePrice: number;
  rating: number;
  valetName1: string;
  valetPassword1: string;
  valetName2: string;
  valetPassword2: string;
  valetName3: string;
  valetPassword3: string;
  commissionRate: number;
  valet1Active: boolean;
  valet2Active: boolean;
  valet3Active: boolean;
  isActive: boolean;
}

export interface ParkingSession {
  id: string;
  garageId: string;
  carPlate: string;
  startTime: number;
  endTime?: number;
  totalPrice?: number;
  paymentMethod?: string;
  status: 'active' | 'completed';
  source: 'app' | 'manual';
  agreedPrice?: number;
  synced?: boolean;
  revenueConfirmed?: boolean;
  addedBy?: string;
  customerPhone?: string;
  customerName?: string;
  incomingCarId?: string;
  startedBy?: 'garage' | 'customer';
  commissionAmount?: number;
  netRevenue?: number;
  settled?: boolean;       
  settled_at?: string;     
  isFirstFreeSession?: boolean; 
  refundAmount?: number;        
}

export interface Offer {
  id: string;
  garageId: string;
  userId: string;
  carPlate: string;
  offeredPrice: number;
  status: 'pending' | 'accepted' | 'rejected' | 'counter';
  counterPrice?: number;
  timestamp: number;
}

export interface WalletTopUp {
  id: string;
  userId: string;
  userName?: string;
  userPhone?: string;
  amount: number;
  transactionId: string;
  carPlate?: string;
  method: 'instapay' | 'cashwallet';
  status: 'pending' | 'approved' | 'rejected';
  timestamp: number;
}

export interface IncomingCar {
  id: string;
  garageId: string;
  carPlate: string;
  customerName: string;
  customerPhone: string;
  agreedPrice: number;
  startTime: number;
  estimatedArrival: number;
  status: 'coming';
}

export interface Message {
  id: string;
  userPhone: string;
  userName?: string;
  carPlate?: string;
  type: 'complaint' | 'inquiry' | 'suggestion' | 'technical';
  subject?: string;
  message: string;
  reply?: string;
  status: 'pending' | 'replied' | 'closed';
  timestamp: number;
  repliedAt?: number;
}

export type ViewType = 'user' | 'garage' | 'admin';
export type ScreenType =
  | 'splash' | 'list' | 'offer' | 'waiting' | 'navigation'
  | 'session' | 'summary' | 'lastSession' | 'chat';

// ===================== Helpers =====================
const uid = () => crypto.randomUUID?.() || Date.now().toString();

const isSupabaseConfigured = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return !!url && !!key && !url.includes('YOUR_PROJECT');
};

const safeSetStorage = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { console.error('Error saving to localStorage:', e); }
};

const safeRemoveStorage = (key: string) => {
  try { localStorage.removeItem(key); }
  catch (e) { console.error('Error removing from localStorage:', e); }
};

const safeGetStorage = (key: string) => {
  try { const item = localStorage.getItem(key); return item ? JSON.parse(item) : null; }
  catch (e) { console.error('Error reading from localStorage:', e); return null; }
};

const normalizePlate = (plate?: string) => (plate ?? '').trim().toUpperCase();
const samePlate = (a?: string, b?: string) =>
  normalizePlate(a) !== '' && normalizePlate(a) === normalizePlate(b);
const getMs = (value?: number) => { if (typeof value === 'number') return value; return 0; };

// ===================== دوال الحساب المالي الذكية =====================

/**
 * 🎁 التحقق من استحقاق الجلسة الأولى المجانية (حصراً للتطبيق وليس الإضافة اليدوية)
 */
const isEligibleForFreeFirstSession = (
  sessions: ParkingSession[],
  carPlate: string,
  customerPhone?: string
): boolean => {
  const normalizedPlate = normalizePlate(carPlate);
  if (!normalizedPlate) return false;

  const previousSessions = sessions.filter((s) => {
    const plateMatch = samePlate(s.carPlate, normalizedPlate);
    const phoneMatch = customerPhone && s.customerPhone === customerPhone;
    return (plateMatch || phoneMatch) && s.status === 'completed';
  });

  return previousSessions.length === 0;
};

/**
 * 💰 حساب السعر الأساسي للركنة
 */
const calculateSessionPrice = (
  durationMs: number,
  basePrice: number,
  isFirstFree: boolean
): { totalPrice: number; freeHours: number; chargeableHours: number } => {
  const HOUR_MS = 60 * 60 * 1000;
  const durationHours = durationMs / HOUR_MS;

  if (isFirstFree) {
    if (durationHours <= 1) {
      return { totalPrice: 0, freeHours: durationHours, chargeableHours: 0 };
    }
    const extraDurationMs = durationMs - HOUR_MS;
    const extraHours = Math.ceil(extraDurationMs / HOUR_MS);
    const totalPrice = extraHours * basePrice;
    return { totalPrice, freeHours: 1, chargeableHours: extraHours };
  }

  // الحساب العادي: كسر الساعة = ساعة كاملة
  const billedHours = Math.max(1, Math.ceil(durationHours));
  const totalPrice = billedHours * basePrice;
  return { totalPrice, freeHours: 0, chargeableHours: billedHours };
};

/**
 * 🔄 حساب شريحة الكاش باك بناءً على المبلغ (أو إجمالي الرصيد التراكمي المنفق من المحفظة)
 * 100 - 199 ج.م 👈 3%
 * 200 - 499 ج.م 👈 5%
 * 500 - 999 ج.م 👈 7%
 * 1000+ ج.م 👈 10%
 */
const getCashbackPercentage = (totalAccumulatedAmount: number): number => {
  if (totalAccumulatedAmount >= 1000) return 0.10;
  if (totalAccumulatedAmount >= 500) return 0.07;
  if (totalAccumulatedAmount >= 200) return 0.05;
  if (totalAccumulatedAmount >= 100) return 0.03;
  return 0;
};

/**
 * 🔄 حساب الكاش باك التراكمي الفعلي للركنة
 * يحسب بناءً على إجمالي ما أنفقه العميل سابقاً من المحفظة أو قيمة الركنة الحالية
 */
const calculateTierRefund = (
  currentSessionPrice: number,
  allSessions: ParkingSession[] = [],
  carPlate = '',
  customerPhone = ''
): number => {
  if (currentSessionPrice <= 0) return 0;

  // جمع إجمالي ما أنفقه العميل في ركنات المحفظة السابقة
  const normalized = normalizePlate(carPlate);
  const pastWalletTotal = allSessions
    .filter((s) => {
      const match = (normalized && samePlate(s.carPlate, normalized)) || (customerPhone && s.customerPhone === customerPhone);
      return match && s.status === 'completed' && s.paymentMethod === 'wallet';
    })
    .reduce((sum, s) => sum + (s.totalPrice || 0), 0);

  // الشريحة التراكمية = أيهما أكبر: إنفاقه التراكمي السابق + الحالي، أو الحالي وحده
  const qualifyingAmount = Math.max(currentSessionPrice, pastWalletTotal + currentSessionPrice);
  const percent = getCashbackPercentage(qualifyingAmount);

  return Math.round((currentSessionPrice * percent) * 100) / 100;
};

/**
 * 📊 حساب إجمالي الكاش باك التراكمي المسترد للعميل عبر كل ركناته
 */
const calculateUserTotalEarnedCashback = (
  allSessions: ParkingSession[],
  carPlate = '',
  customerPhone = ''
): number => {
  const normalized = normalizePlate(carPlate);
  return allSessions
    .filter((s) => {
      const match = (normalized && samePlate(s.carPlate, normalized)) || (customerPhone && s.customerPhone === customerPhone);
      return match && s.status === 'completed';
    })
    .reduce((sum, s) => sum + Number(s.refundAmount || 0), 0);
};

export {
  isEligibleForFreeFirstSession,
  calculateSessionPrice,
  calculateTierRefund,
  getCashbackPercentage,
  calculateUserTotalEarnedCashback
};

const dedupeActiveSessions = (list: ParkingSession[]): ParkingSession[] => {
  const active = list.filter((s) => s.status === 'active');
  const completed = list.filter((s) => s.status === 'completed');
  const bestByPlateSource = new Map<string, ParkingSession>();

  for (const session of active) {
    const plate = normalizePlate(session.carPlate);
    if (!plate) continue;
    const key = `${plate}::${session.source}`;
    const existing = bestByPlateSource.get(key);
    if (!existing) { bestByPlateSource.set(key, session); continue; }
    const sessionSynced = session.synced === true;
    const existingSynced = existing.synced === true;
    if (sessionSynced && !existingSynced) {
      bestByPlateSource.set(key, session);
    } else if (!sessionSynced && existingSynced) {
      // keep existing
    } else {
      const sessionStart = getMs(session.startTime);
      const existingStart = getMs(existing.startTime);
      if (sessionStart > 0 && existingStart > 0 && sessionStart < existingStart) {
        bestByPlateSource.set(key, session);
      }
    }
  }

  return [...Array.from(bestByPlateSource.values()), ...completed].sort((a, b) => {
    const aTime = a.status === 'active' ? getMs(a.startTime) : typeof a.endTime === 'number' ? a.endTime : 0;
    const bTime = b.status === 'active' ? getMs(b.startTime) : typeof b.endTime === 'number' ? b.endTime : 0;
    return bTime - aTime;
  });
};

const mapGarage = (r: any): Garage => ({
  id: r.id, name: r.name, username: r.username, phone: r.phone,
  ownerPhone: r.owner_phone || r.phone,  
  location: r.location, lat: r.lat, lng: r.lng, capacity: r.capacity,
  availableSpots: r.available_spots, basePrice: Number(r.base_price),
  rating: Number(r.rating),
  valetName1: r.valet_name_1 || '', valetPassword1: r.valet_password_1 || '',
  valetName2: r.valet_name_2 || '', valetPassword2: r.valet_password_2 || '',
  valetName3: r.valet_name_3 || '', valetPassword3: r.valet_password_3 || '',
  commissionRate: Number(r.commission_rate ?? 10),
  valet1Active: r.valet1_active !== false,
  valet2Active: r.valet2_active !== false,
  valet3Active: r.valet3_active !== false,
  isActive: r.is_active !== false,
});

const mapSession = (r: any): ParkingSession => {
  const nowMs = Date.now();
  const rawStart = r.start_time;
  let startTime: number;
  if (typeof rawStart === 'string') {
    const parsed = new Date(rawStart).getTime();
    startTime = Number.isFinite(parsed) && parsed > 0 ? parsed : nowMs;
  } else if (typeof rawStart === 'number') {
    startTime = rawStart < 1_000_000_000_000 ? rawStart * 1000 : rawStart;
    if (!Number.isFinite(startTime) || startTime <= 0) startTime = nowMs;
  } else {
    startTime = nowMs;
  }

  const rawEnd = r.end_time;
  let endTime: number | undefined;
  if (rawEnd) {
    if (typeof rawEnd === 'string') {
      const parsed = new Date(rawEnd).getTime();
      endTime = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    } else if (typeof rawEnd === 'number') {
      const ms = rawEnd < 1_000_000_000_000 ? rawEnd * 1000 : rawEnd;
      endTime = Number.isFinite(ms) && ms > 0 ? ms : undefined;
    }
  }

  if (endTime && endTime < startTime) {
    const diff = startTime - endTime;
    if (diff < 4 * 60 * 60 * 1000) endTime = endTime + diff + 60000;
  }

  return {
    id: r.id,
    garageId: r.garage_id,
    carPlate: r.car_plate,
    startTime,
    endTime,
    totalPrice: r.total_price != null ? Number(r.total_price) : undefined,
    paymentMethod: r.payment_method || undefined,
    status: r.status,
    source: r.source,
    agreedPrice: r.agreed_price != null ? Number(r.agreed_price) : undefined,
    synced: true,
    revenueConfirmed: r.revenue_confirmed ?? false,
    addedBy: r.added_by || '',
    customerPhone: r.customer_phone || undefined,
    customerName: r.customer_name || undefined,
    incomingCarId: r.incoming_car_id || undefined,
    startedBy: r.started_by || undefined,
    commissionAmount: r.commission_amount != null ? Number(r.commission_amount) : 0,
    netRevenue: r.net_revenue != null ? Number(r.net_revenue) : 0,
    settled: r.settled ?? false,                     
    settled_at: r.settled_at || undefined,           
    isFirstFreeSession: r.is_first_free_session ?? false,
    refundAmount: r.refund_amount != null ? Number(r.refund_amount) : 0,
  };
};

const mapTopUp = (r: any): WalletTopUp => ({
  id: r.id, userId: r.user_id, userName: r.user_name, userPhone: r.user_phone,
  amount: Number(r.amount), transactionId: r.transaction_id, carPlate: r.car_plate,
  method: r.method, status: r.status, timestamp: new Date(r.created_at).getTime(),
});

const mapIncoming = (r: any): IncomingCar => ({
  id: r.id, garageId: r.garage_id, carPlate: r.car_plate,
  customerName: r.customer_name, customerPhone: r.customer_phone,
  agreedPrice: Number(r.agreed_price),
  startTime: new Date(r.created_at).getTime(),
  estimatedArrival: r.estimated_arrival,
  status: 'coming',
});

const mapMessage = (r: any): Message => ({
  id: r.id, userPhone: r.user_phone, userName: r.user_name, carPlate: r.car_plate,
  type: r.type || 'inquiry', subject: r.subject, message: r.message, reply: r.reply,
  status: r.status || 'pending', timestamp: new Date(r.created_at).getTime(),
  repliedAt: r.replied_at ? new Date(r.replied_at).getTime() : undefined,
});

let updateGarageTimeout: ReturnType<typeof setTimeout> | null = null;
const pendingGarageUpdates: Map<string, Record<string, unknown>> = new Map();
const sessionStartLocks = new Set<string>();
const sessionEndLocks = new Set<string>();
const deletedSessionIds = new Set<string>();
const locallyEndedSessions = new Map<string, ParkingSession>();

const resolveAddedBy = (explicitAddedBy?: string): string => {
  if (explicitAddedBy !== undefined && explicitAddedBy !== null && explicitAddedBy !== '') {
    return explicitAddedBy;
  }
  const valetName = localStorage.getItem('valetName') || '';
  const garageRole = localStorage.getItem('garageRole') || '';
  const valetNumber = localStorage.getItem('valetNumber') || '';
  if (garageRole === 'owner') return '';
  if (valetName) return valetName;
  if (garageRole === 'valet') return `سايس ${valetNumber}`;
  return '';
};

let fetchAbortController: AbortController | null = null;
let lastFetchTime = 0;

// ===================== State Interface =====================
interface AppState {
  view: ViewType;
  setView: (v: ViewType) => void;
  screen: ScreenType;
  setScreen: (s: ScreenType) => void;
  currentUser: { name: string; phone: string; carPlate: string; wallet: number } | null;
  setCurrentUser: (u: { name: string; phone: string; carPlate: string; wallet: number } | null) => void;
  deductWallet: (amount: number) => void;
  refundToWallet: (amount: number) => void; 
  garages: Garage[];
  currentGarageId: string | null;
  setCurrentGarageId: (id: string | null) => void;
  addGarage: (g: Omit<Garage, 'id' | 'rating' | 'availableSpots' | 'commissionRate' | 'valet1Active' | 'valet2Active' | 'valet3Active' | 'isActive'> & { capacity: number; ownerPhone?: string }) => Promise<void>;
  updateGarage: (id: string, updates: Partial<Pick<Garage, 'basePrice' | 'availableSpots' | 'capacity' | 'commissionRate' | 'valet1Active' | 'valet2Active' | 'valet3Active' | 'ownerPhone' | 'isActive'>> & {
    valetName1?: string; valetPassword1?: string;
    valetName2?: string; valetPassword2?: string;
    valetName3?: string; valetPassword3?: string;
  }) => Promise<void>;
  adjustGarageSpots: (id: string, delta: number) => Promise<void>;
  selectedGarageId: string | null;
  setSelectedGarageId: (id: string | null) => void;
  getMyOwnedGarages: (phone: string) => Garage[];  
  sessions: ParkingSession[];
  historySessions: ParkingSession[];
  fetchGarageHistory: (garageId: string, startDateStr: string, endDateStr: string) => Promise<void>;
  acknowledgedSessionIds: Set<string>; 
  acknowledgeSession: (id: string) => void; 
  addSession: (s: Omit<ParkingSession, 'id'>) => Promise<string>;
  endSession: (id: string, totalPrice: number, paymentMethod: string) => Promise<void>;
  cancelSession: (id: string) => void;
  removeSession: (id: string) => Promise<void>;
  confirmRevenue: (sessionId: string) => Promise<void>;
  unconfirmRevenue: (sessionId: string) => Promise<void>;
  assignSessionToValet: (sessionId: string, valetName: string) => Promise<void>;
  offers: Offer[];
  walletTopUps: WalletTopUp[];
  addWalletTopUp: (w: Omit<WalletTopUp, 'id' | 'timestamp' | 'status'>) => void;
  approveTopUp: (id: string) => Promise<void>;
  rejectTopUp: (id: string) => Promise<void>;
  incomingCars: IncomingCar[];
  addIncomingCar: (c: Omit<IncomingCar, 'id' | 'startTime' | 'status'>) => Promise<void>;
  removeIncomingCar: (id: string) => Promise<void>;
  messages: Message[];
  addMessage: (m: Omit<Message, 'id' | 'timestamp' | 'status'>) => Promise<{ success: boolean; error?: string }>;
  replyMessage: (id: string, reply: string) => Promise<void>;
  closeMessage: (id: string) => Promise<void>;
  fetchAll: (force?: boolean) => Promise<void>;
  logout: () => void;
}

// ===================== Store =====================
export const useStore = create<AppState>((set, get) => ({
  view: (() => { try { const saved = localStorage.getItem('appView'); return (saved as ViewType) || 'user'; } catch { return 'user' as ViewType; } })(),
  setView: (v) => { set({ view: v }); localStorage.setItem('appView', v); },

  screen: (() => { try { const saved = localStorage.getItem('appScreen'); if (saved) return saved as ScreenType; return 'splash' as ScreenType; } catch { return 'splash' as ScreenType; } })(),
  setScreen: (s) => { set({ screen: s }); localStorage.setItem('appScreen', s); },

  currentUser: safeGetStorage('currentUser'),

  setCurrentUser: async (u) => {
    if (!u) { set({ currentUser: null }); safeRemoveStorage('currentUser'); return; }
    set({ currentUser: u }); safeSetStorage('currentUser', u);
    if (!isSupabaseConfigured()) return;
    try {
      const { data: existingUser } = await supabase.from('users').select('wallet, name, phone, car_plate').eq('phone', u.phone).single();
      if (existingUser) {
        const updated = { name: existingUser.name || u.name, phone: existingUser.phone || u.phone, carPlate: existingUser.car_plate || u.carPlate, wallet: Number(existingUser.wallet ?? 0) };
        set({ currentUser: updated }); safeSetStorage('currentUser', updated);
        await supabase.from('users').update({ name: u.name, car_plate: u.carPlate }).eq('phone', u.phone);
      } else {
        const { data: newUser } = await supabase.from('users').insert({ name: u.name, phone: u.phone, car_plate: u.carPlate, wallet: u.wallet ?? 0 }).select().single();
        if (newUser) {
          const updated = { name: newUser.name, phone: newUser.phone, carPlate: newUser.car_plate, wallet: Number(newUser.wallet ?? 0) };
          set({ currentUser: updated }); safeSetStorage('currentUser', updated);
        }
      }
    } catch (err) { console.error('Error setting user:', err); }
  },

  deductWallet: (amount) => {
    const user = get().currentUser; if (!user) return;
    const nw = Math.max(0, user.wallet - amount);
    const updated = { ...user, wallet: nw };
    set({ currentUser: updated }); safeSetStorage('currentUser', updated);
    if (isSupabaseConfigured()) {
      supabase.from('users').update({ wallet: nw }).eq('phone', user.phone).then(({ error }) => { if (error) console.error('❌', error); });
    }
  },

  refundToWallet: (amount) => {
    const user = get().currentUser; if (!user || amount <= 0) return;
    const nw = user.wallet + amount;
    const updated = { ...user, wallet: nw };
    set({ currentUser: updated }); safeSetStorage('currentUser', updated);
    if (isSupabaseConfigured()) {
      supabase.from('users').update({ wallet: nw }).eq('phone', user.phone).then(({ error }) => { 
        if (error) console.error('❌', error); 
      });
    }
  },

  garages: [],
  currentGarageId: (() => { try { return localStorage.getItem('currentGarageId') || null; } catch { return null; } })(),
  setCurrentGarageId: (id) => { set({ currentGarageId: id }); if (id) localStorage.setItem('currentGarageId', id); else localStorage.removeItem('currentGarageId'); },

  selectedGarageId: (() => { try { return localStorage.getItem('selectedGarageId') || null; } catch { return null; } })(),
  setSelectedGarageId: (id) => { set({ selectedGarageId: id }); if (id) localStorage.setItem('selectedGarageId', id); else localStorage.removeItem('selectedGarageId'); },

  getMyOwnedGarages: (phone: string) => {
    if (!phone) return [];
    const normalizedPhone = phone.trim();
    return get().garages.filter((g) => 
      g.ownerPhone === normalizedPhone || g.phone === normalizedPhone
    );
  },

  sessions: [],
  historySessions: [], 

  fetchGarageHistory: async (garageId: string, startDateStr: string, endDateStr: string) => {
    if (!isSupabaseConfigured() || !garageId) return;

    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('garage_id', garageId)
        .eq('status', 'completed')
        .gte('created_at', startDateStr)
        .lte('created_at', endDateStr)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ خطأ في جلب الأرشيف:', error);
        return;
      }

      if (data) {
        set({ historySessions: data.map(mapSession) });
      }
    } catch (err) {
      console.error('❌ خطأ غير متوقع في جلب الأرشيف:', err);
    }
  },
  
  acknowledgedSessionIds: (() => {
    try {
      const saved = localStorage.getItem('acknowledgedSessionIds');
      return new Set<string>(saved ? JSON.parse(saved) : []);
    } catch {
      return new Set<string>();
    }
  })(),

  acknowledgeSession: (id) => {
    set((st) => {
      const next = new Set(st.acknowledgedSessionIds);
      next.add(id);
      try {
        localStorage.setItem('acknowledgedSessionIds', JSON.stringify(Array.from(next)));
      } catch (e) {
        console.error('Error saving acknowledged session:', e);
      }
      return { acknowledgedSessionIds: next };
    });
  },

  offers: [], walletTopUps: [], incomingCars: [], messages: [],

  logout: () => {
    set({ currentUser: null, currentGarageId: null, selectedGarageId: null, view: 'user', screen: 'splash', acknowledgedSessionIds: new Set(), historySessions: [] });
    safeRemoveStorage('currentUser'); safeRemoveStorage('appView'); safeRemoveStorage('appScreen');
    safeRemoveStorage('currentGarageId'); safeRemoveStorage('selectedGarageId');
    safeRemoveStorage('garageAuth'); safeRemoveStorage('adminAuth');
    safeRemoveStorage('acknowledgedSessionIds');
  },

  fetchAll: async (force = false) => {
    if (!isSupabaseConfigured()) return;

    const now = Date.now();
    if (!force && now - lastFetchTime < 1500) {
      return; 
    }
    lastFetchTime = now;

    if (fetchAbortController) {
      fetchAbortController.abort();
    }
    fetchAbortController = new AbortController();
    const { signal } = fetchAbortController;

    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayIso = todayStart.toISOString();

      const [g, activeAndUnsettledRes, recentSettledRes, w, ic, msgs] = await Promise.all([
        supabase.from('garages').select('*').abortSignal(signal),
        supabase
          .from('sessions')
          .select('*')
          .or('status.eq.active,settled.eq.false,settled.is.null')
          .order('created_at', { ascending: false })
          .limit(100)
          .abortSignal(signal),
        supabase
          .from('sessions')
          .select('*')
          .eq('settled', true)
          .eq('status', 'completed')
          .gte('created_at', todayIso) 
          .order('created_at', { ascending: false })
          .limit(20)
          .abortSignal(signal),
        supabase.from('wallet_topups').select('*').order('created_at', { ascending: false }).limit(10).abortSignal(signal),
        supabase.from('incoming_cars').select('*').order('created_at', { ascending: false }).abortSignal(signal),
        supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(10).abortSignal(signal),
      ]);

      const currentGarages = get().garages;
      const fetchedGarages = g.data?.length ? g.data.map(mapGarage) : currentGarages;
      const garages = fetchedGarages.map((dbGarage) => {
        if (pendingGarageUpdates.has(dbGarage.id)) return currentGarages.find((x) => x.id === dbGarage.id) ?? dbGarage;
        return dbGarage;
      });

      const activeAndUnsettled = activeAndUnsettledRes.data ? activeAndUnsettledRes.data.map(mapSession) : [];
      const recentSettled = recentSettledRes.data ? recentSettledRes.data.map(mapSession) : [];
      
      const sessionsMap = new Map<string, ParkingSession>();
      [...activeAndUnsettled, ...recentSettled].forEach((s) => {
        if (!sessionsMap.has(s.id)) sessionsMap.set(s.id, s);
      });
      const supabaseSessions = Array.from(sessionsMap.values());
      
      const supabaseSessionIds = new Set(supabaseSessions.map((ss) => ss.id));
      const currentSessions = get().sessions;
      const supabaseActiveKeys = new Set(
        supabaseSessions.filter((ss) => ss.status === 'active').map((ss) => `${normalizePlate(ss.carPlate)}::${ss.source}`)
      );

      const localOnlySessions = currentSessions.filter((cs) =>
        !supabaseSessionIds.has(cs.id) &&
        cs.status === 'active' &&
        !supabaseActiveKeys.has(`${normalizePlate(cs.carPlate)}::${cs.source}`) &&
        !deletedSessionIds.has(cs.id) &&
        Date.now() - cs.startTime < 15000
      );

      const mergedSessions = supabaseSessions
        .filter((ss) => !deletedSessionIds.has(ss.id))
        .map((ss) => {
          const locallyEnded = locallyEndedSessions.get(ss.id);
          if (locallyEnded) {
            if (ss.status === 'completed') { locallyEndedSessions.delete(ss.id); return ss; }
            return locallyEnded;
          }
          const localVersion = currentSessions.find((cs) => cs.id === ss.id);
          if (localVersion) {
            if (ss.status === 'completed' && localVersion.status === 'active') return ss;
            if (localVersion.status === 'completed') {
              return { 
                ...localVersion, 
                revenueConfirmed: ss.revenueConfirmed || localVersion.revenueConfirmed,
                settled: ss.settled ?? localVersion.settled,           
                settled_at: ss.settled_at || localVersion.settled_at,   
              };
            }
            if (ss.status === 'active' && localVersion.status === 'active') {
              return {
                ...localVersion,
                startTime: ss.startTime,
                synced: true,
                addedBy: ss.addedBy || localVersion.addedBy || '',
                customerPhone: ss.customerPhone || localVersion.customerPhone,
                customerName: ss.customerName || localVersion.customerName,
                settled: ss.settled ?? localVersion.settled,
                settled_at: ss.settled_at || localVersion.settled_at,
              };
            }
            if (localVersion.totalPrice != null && localVersion.totalPrice > 0) return localVersion;
          }
          return ss;
        });

      const finalSessions = dedupeActiveSessions([...mergedSessions, ...localOnlySessions]);

      const supabaseTopUps = w.data ? w.data.map(mapTopUp) : get().walletTopUps;
      const currentTopUps = get().walletTopUps ?? [];
      const mergedTopUps = supabaseTopUps.map((st) => {
        const lv = currentTopUps.find((ct) => ct.id === st.id);
        if (lv && lv.status !== 'pending' && st.status === 'pending') return lv;
        return st;
      });

      const fetchedCars = ic.data
        ? ic.data.map(mapIncoming).filter((c) => c.status === 'coming')
        : (get().incomingCars ?? []);

      const currentMessages = get().messages ?? [];
      const supabaseMessages = msgs.data ? msgs.data.map(mapMessage) : currentMessages;
      const mergedMessages = supabaseMessages.map((sm) => {
        const lv = currentMessages.find((cm) => cm.id === sm.id);
        if (lv) {
          if (lv.status !== 'pending' && sm.status === 'pending') return lv;
          if (sm.status !== 'pending' && lv.status === 'pending') return sm;
          const smT = sm.repliedAt ?? sm.timestamp;
          const lvT = lv.repliedAt ?? lv.timestamp;
          if (smT > lvT) return sm;
          return lv;
        }
        return sm;
      });

      const supabaseMessageIds = new Set(supabaseMessages.map((sm) => sm.id));
      const localOnlyMessages = currentMessages.filter((cm) => !supabaseMessageIds.has(cm.id) && cm.status === 'pending');

      set({
        garages,
        sessions: finalSessions,
        walletTopUps: mergedTopUps,
        incomingCars: fetchedCars,
        messages: [...mergedMessages, ...localOnlyMessages],
      });

      // 🚀 تحديث رصيد المحفظة الفعلي للعميل من جدول users في Supabase
      const user = get().currentUser;
      if (user?.phone) {
        try {
          const { data } = await supabase.from('users').select('wallet, name, phone, car_plate').eq('phone', user.phone).single();
          if (data) {
            const updated = { 
              name: data.name || user.name, 
              phone: data.phone || user.phone, 
              carPlate: data.car_plate || user.carPlate, 
              wallet: Number(data.wallet ?? 0) 
            };
            set({ currentUser: updated }); 
            safeSetStorage('currentUser', updated);
          }
        } catch (err) { console.error('Error fetching user wallet:', err); }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('Fetch error:', err);
    }
  },

  addGarage: async (g) => {
    const { data, error } = await supabase.from('garages').insert({
      name: g.name, username: g.username, phone: g.phone,
      owner_phone: (g as any).ownerPhone || g.phone,  
      location: g.location, lat: g.lat, lng: g.lng,
      capacity: g.capacity, available_spots: g.capacity, base_price: g.basePrice, rating: 4.0,
      commission_rate: 10,
      valet1_active: true,
      valet2_active: true,
      valet3_active: true,
      valet_name_1: (g as any).valetName1 || '', valet_password_1: (g as any).valetPassword1 || '',
      valet_name_2: (g as any).valetName2 || '', valet_password_2: (g as any).valetPassword2 || '',
      valet_name_3: (g as any).valetName3 || '', valet_password_3: (g as any).valetPassword3 || '',
      is_active: true,
    }).select();
    if (!error && data) set((st) => ({ garages: [...st.garages, ...data.map(mapGarage)] }));
  },

  updateGarage: async (id, updates) => {
    set((st) => ({ garages: st.garages.map((g) => g.id === id ? { ...g, ...updates } : g) }));
    if (!isSupabaseConfigured()) return;

    if (updates.isActive !== undefined) {
      pausePolling(6000);
      const { error } = await supabase.from('garages').update({ is_active: updates.isActive }).eq('id', id);
      if (error) {
        console.error('❌ Failed to update isActive:', error);
        set((st) => ({ garages: st.garages.map((g) => g.id === id ? { ...g, isActive: !updates.isActive } : g) }));
      } else {
        await get().fetchAll(true);
      }
      return;
    }

    const existing = pendingGarageUpdates.get(id) || {};
    const db: Record<string, unknown> = { ...existing };
    if (updates.basePrice !== undefined) db.base_price = updates.basePrice;
    if (updates.availableSpots !== undefined) db.available_spots = updates.availableSpots;
    if (updates.capacity !== undefined) db.capacity = updates.capacity;
    if (updates.commissionRate !== undefined) db.commission_rate = updates.commissionRate;
    if ((updates as any).ownerPhone !== undefined) db.owner_phone = (updates as any).ownerPhone;  
    if (updates.valet1Active !== undefined) db.valet1_active = updates.valet1Active;
    if (updates.valet2Active !== undefined) db.valet2_active = updates.valet2Active;
    if (updates.valet3Active !== undefined) db.valet3_active = updates.valet3Active;
    if (updates.valetName1 !== undefined) db.valet_name_1 = updates.valetName1;
    if (updates.valetPassword1 !== undefined) db.valet_password_1 = updates.valetPassword1;
    if (updates.valetName2 !== undefined) db.valet_name_2 = updates.valetName2;
    if (updates.valetPassword2 !== undefined) db.valet_password_2 = updates.valetPassword2;
    if (updates.valetName3 !== undefined) db.valet_name_3 = updates.valetName3;
    if (updates.valetPassword3 !== undefined) db.valet_password_3 = updates.valetPassword3;

    pendingGarageUpdates.set(id, db);
    if (updateGarageTimeout) clearTimeout(updateGarageTimeout);
    updateGarageTimeout = setTimeout(async () => {
      for (const [garageId, dbUpdates] of pendingGarageUpdates.entries()) {
        if (Object.keys(dbUpdates).length > 0) {
          await supabase.from('garages').update(dbUpdates).eq('id', garageId);
        }
      }
      pendingGarageUpdates.clear(); updateGarageTimeout = null;
      await get().fetchAll(true);
    }, 500);
  },

  adjustGarageSpots: async (id, delta) => {
    set((st) => ({
      garages: st.garages.map((g) => {
        if (g.id !== id) return g;
        return { ...g, availableSpots: Math.max(0, Math.min(g.capacity, g.availableSpots + delta)) };
      }),
    }));
    if (!isSupabaseConfigured()) return;
    try {
      const pending = pendingGarageUpdates.get(id);
      if (pending && Object.keys(pending).length > 0) {
        const { error: flushError } = await supabase.from('garages').update(pending).eq('id', id);
        if (flushError) { console.error('❌', flushError); await get().fetchAll(true); return; }
        pendingGarageUpdates.delete(id);
        if (pendingGarageUpdates.size === 0 && updateGarageTimeout) { clearTimeout(updateGarageTimeout); updateGarageTimeout = null; }
      }
      const { data, error } = await supabase.rpc('adjust_spots', { garage_uuid: id, delta });
      if (error) { console.error('❌', error); await get().fetchAll(true); return; }
      set((st) => ({ garages: st.garages.map((g) => g.id === id ? { ...g, availableSpots: Number(data) } : g) }));
    } catch (err) { console.error('❌', err); await get().fetchAll(true); }
  },

  addSession: async (s) => {
    const normalizedPlate = normalizePlate(s.carPlate);
    if (!normalizedPlate) return '';
    const sessionId = crypto.randomUUID();
    const lockKey = `${normalizedPlate}::${s.source}`;

    if (sessionStartLocks.has(lockKey)) {
      const existing = get().sessions.find((x) => samePlate(x.carPlate, normalizedPlate) && x.status === 'active' && x.source === s.source);
      return existing?.id ?? '';
    }
    sessionStartLocks.add(lockKey);
    pausePolling(8000);

    try {
      const existingLocal = get().sessions.find((existing) =>
        samePlate(existing.carPlate, normalizedPlate) && existing.status === 'active' && existing.source === s.source
      );
      if (existingLocal) return existingLocal.id;

      if (isSupabaseConfigured()) {
        try {
          const { data: dbCheck } = await supabase.from('sessions').select('id, car_plate, source, start_time').eq('status', 'active').eq('car_plate', normalizedPlate).eq('source', s.source).limit(1);
          if (dbCheck && dbCheck.length > 0) {
            const { data: sessionData } = await supabase.from('sessions').select('*').eq('id', dbCheck[0].id).single();
            if (sessionData) {
              const syncedSession = { ...mapSession(sessionData), synced: true };
              set((st) => {
                const alreadyExists = st.sessions.find((x) => x.id === syncedSession.id);
                if (alreadyExists) {
                  return { sessions: dedupeActiveSessions(st.sessions.map((x) => x.id === syncedSession.id ? syncedSession : x)) };
                }
                return { sessions: dedupeActiveSessions([syncedSession, ...st.sessions]) };
              });
            }
            return dbCheck[0].id;
          }
        } catch (err) { console.error('خطأ في التحقق من DB:', err); }
      }

      const addedByValue = resolveAddedBy((s as any).addedBy);

      // 🎁 العربيات المضافة يدوي من السايس (manual) لا تطبق عليها الركنة المجانية أبداً
      const currentSessions = get().sessions;
      const customerPhone = (s as any).customerPhone;
      const isFirstFree = s.source === 'manual' 
        ? false 
        : isEligibleForFreeFirstSession(currentSessions, normalizedPlate, customerPhone);

      const optimisticSession: ParkingSession = {
        ...s, id: sessionId, carPlate: normalizedPlate,
        startTime: 0, synced: false, revenueConfirmed: false,
        addedBy: addedByValue,
        customerPhone: customerPhone || undefined,
        customerName: (s as any).customerName || undefined,
        incomingCarId: (s as any).incomingCarId || undefined,
        startedBy: (s as any).startedBy || undefined,
        commissionAmount: 0,
        netRevenue: 0,
        settled: false,
        isFirstFreeSession: isFirstFree,
        refundAmount: 0,
      };

      set((st) => ({ sessions: dedupeActiveSessions([optimisticSession, ...st.sessions]) }));
      await get().adjustGarageSpots(s.garageId, -1);

      if (!isSupabaseConfigured()) return sessionId;

      try {
        const { data, error } = await supabase.from('sessions').insert({
          id: sessionId, garage_id: s.garageId, car_plate: normalizedPlate,
          start_time: new Date().toISOString(), status: s.status, source: s.source,
          agreed_price: s.agreedPrice ?? null, revenue_confirmed: false,
          added_by: addedByValue,
          customer_phone: customerPhone || null,
          customer_name: (s as any).customerName || null,
          incoming_car_id: (s as any).incoming_car_id || null,
          started_by: (s as any).startedBy || null,
          commission_amount: 0,
          net_revenue: 0,
          settled: false,
          is_first_free_session: isFirstFree,
          refund_amount: 0,
        }).select().single();

        if (error) {
          console.error('❌ خطأ في إضافة الجلسة:', error);
          set((st) => ({ sessions: st.sessions.filter((x) => x.id !== sessionId) }));
          await get().adjustGarageSpots(s.garageId, +1);
          return sessionId;
        }

        if (data) {
          const syncedSession: ParkingSession = { ...mapSession(data), synced: true };
          set((st) => ({
            sessions: dedupeActiveSessions(st.sessions.map((x) => x.id === sessionId ? syncedSession : x)),
          }));
          return data.id;
        }
      } catch (err) {
        console.error('❌ خطأ غير متوقع في addSession:', err);
        set((st) => ({ sessions: st.sessions.filter((x) => x.id !== sessionId) }));
        await get().adjustGarageSpots(s.garageId, +1);
      }

      return sessionId;
    } finally {
      sessionStartLocks.delete(lockKey);
    }
  },

  // 🎯 =========================================================================
  // 🎯 دالة إنهاء الجلسة وحل مشكلة المحفظة والخصم المزدوج نهائياً
  // 🎯 =========================================================================
  endSession: async (id, totalPrice, paymentMethod) => {
    const now = Date.now();
    const session = get().sessions.find((s) => s.id === id);
    if (!session) { console.error('❌ الجلسة مش موجودة:', id); return; }
    if (session.status !== 'active') { console.warn('⚠️ الجلسة مش نشطة:', session.status); return; }

    const lockKey = `${session.garageId}:${normalizePlate(session.carPlate)}`;
    if (sessionEndLocks.has(lockKey)) return;
    sessionEndLocks.add(lockKey);
    pausePolling(15000);

    try {
      const garage = get().garages.find((g) => g.id === session.garageId);
      const basePrice = garage?.basePrice ?? 0;
      const rate = Number(session.agreedPrice ?? basePrice);
      const commissionRate = garage?.commissionRate ?? 10;
      const isAppSession = session.source === 'app';
      const isWalletPayment = paymentMethod === 'wallet';

      let finalPrice = Number(totalPrice) > 0 ? Number(totalPrice) : 0;
      let refundAmount = 0;
      const durationMs = now - session.startTime;

      // 🎁 فحص نوع الجلسة وتطبيق القواعد الصارمة
      if (session.source === 'manual') {
        // ✋ 1. إضافة يدوية من السايس: لا ركنة مجانية ولا كاش باك إطلاقاً (حساب عادي كسر الساعة بساعة)
        const { totalPrice: calculatedPrice } = calculateSessionPrice(durationMs, rate, false);
        finalPrice = calculatedPrice;
        refundAmount = 0;
      } else if (session.isFirstFreeSession) {
        // 🎁 2. جلسة عبر التطبيق وتستحق المجاني: أول ساعة مجاناً بالكامل
        const { totalPrice: calculatedPrice } = calculateSessionPrice(
          durationMs,
          rate,
          true
        );
        finalPrice = calculatedPrice;
        refundAmount = 0;
      } else {
        // 🔄 3. جلسة عادية عبر التطبيق (من ثاني ركنة):
        const { totalPrice: calculatedPrice } = calculateSessionPrice(durationMs, rate, false);
        finalPrice = calculatedPrice;

        // 💳 كاش باك المحفظة التراكمي: يطبق فقط للدفع بالمحفظة وعبر التطبيق
        if (isWalletPayment && finalPrice > 0) {
          const allSessions = get().sessions;
          refundAmount = calculateTierRefund(finalPrice, allSessions, session.carPlate, session.customerPhone);
          if (refundAmount > 0) {
            finalPrice = Math.max(0, finalPrice - refundAmount);
          }
        }
      }

      const commissionAmount = isAppSession
        ? Math.round(((finalPrice * commissionRate) / 100) * 100) / 100
        : 0;
      const netRevenue = Math.round((finalPrice - commissionAmount) * 100) / 100;
      const isAutoConfirmed = isWalletPayment;

      const endedSession: ParkingSession = {
        ...session,
        endTime: now,
        totalPrice: finalPrice,
        paymentMethod,
        status: 'completed' as const,
        revenueConfirmed: isAutoConfirmed,
        commissionAmount,
        netRevenue,
        settled: false,
        refundAmount,
      };

      locallyEndedSessions.set(id, endedSession);
      set((st) => ({ sessions: st.sessions.map((s) => (s.id === id ? endedSession : s)) }));
      await get().adjustGarageSpots(session.garageId, +1);

      // 🚀 =========================================================================
      // 🚀 تحديث رصيد المحفظة في Supabase وفي الذاكرة بالمبلغ الصافي لمرة واحدة فقط
      // 🚀 =========================================================================
      if (isSupabaseConfigured() && isWalletPayment) {
        const targetPhone = session.customerPhone || get().currentUser?.phone;
        if (targetPhone) {
          try {
            const { data: dbUser } = await supabase
              .from('users')
              .select('wallet')
              .eq('phone', targetPhone)
              .maybeSingle();

            if (dbUser) {
              const currentWallet = Number(dbUser.wallet || 0);
              const newWallet = Math.max(0, currentWallet - finalPrice);

              // تحديث جدول users في Supabase
              await supabase
                .from('users')
                .update({ wallet: newWallet })
                .eq('phone', targetPhone);

              // تحديث واجهة المستخدم فوراً
              const cu = get().currentUser;
              if (cu && cu.phone === targetPhone) {
                const updated = { ...cu, wallet: newWallet };
                set({ currentUser: updated });
                safeSetStorage('currentUser', updated);
              }
            }
          } catch (walletErr) {
            console.error('❌ خطأ في تحديث رصيد المحفظة بالسيرفر:', walletErr);
          }
        }
      }

      if (!isSupabaseConfigured()) return;

      const { error } = await supabase
        .from('sessions')
        .update({
          end_time: new Date(now).toISOString(),
          total_price: finalPrice,
          payment_method: paymentMethod,
          status: 'completed',
          revenue_confirmed: isAutoConfirmed,
          commission_amount: commissionAmount,
          net_revenue: netRevenue,
          settled: false,
          refund_amount: refundAmount,
        })
        .eq('id', id)
        .eq('status', 'active');

      if (error) {
        console.error('❌ Error ending session:', error);
      } else {
        setTimeout(() => {
          locallyEndedSessions.delete(id);
        }, 10000);
      }

      setTimeout(() => {
        get().fetchAll(true);
      }, 12000);
    } finally {
      setTimeout(() => {
        sessionEndLocks.delete(lockKey);
      }, 3000);
    }
  },

  confirmRevenue: async (sessionId) => {
    set((st) => ({ sessions: st.sessions.map((s) => (s.id === sessionId ? { ...s, revenueConfirmed: true } : s)) }));
    pausePolling(10000);
    if (!isSupabaseConfigured()) return;
    const { error } = await supabase.from('sessions').update({ revenue_confirmed: true }).eq('id', sessionId);
    if (error) {
      console.error('❌', error);
      set((st) => ({ sessions: st.sessions.map((s) => (s.id === sessionId ? { ...s, revenueConfirmed: false } : s)) }));
    }
  },

  unconfirmRevenue: async (sessionId) => {
    set((st) => ({ sessions: st.sessions.map((s) => (s.id === sessionId ? { ...s, revenueConfirmed: false } : s)) }));
    pausePolling(10000);
    if (!isSupabaseConfigured()) return;
    const { error } = await supabase.from('sessions').update({ revenue_confirmed: false }).eq('id', sessionId);
    if (error) {
      console.error('❌', error);
      set((st) => ({ sessions: st.sessions.map((s) => (s.id === sessionId ? { ...s, revenueConfirmed: true } : s)) }));
    }
  },

  assignSessionToValet: async (sessionId: string, valetName: string) => {
    if (!sessionId || !valetName) return;

    set((st) => ({
      sessions: st.sessions.map((s) => (s.id === sessionId ? { ...s, addedBy: valetName } : s)),
    }));

    if (!isSupabaseConfigured()) return;

    try {
      const { error } = await supabase
        .from('sessions')
        .update({ added_by: valetName })
        .eq('id', sessionId);

      if (error) {
        console.error('❌ assignSessionToValet error:', error);
      }
    } catch (err) {
      console.error('❌ assignSessionToValet unexpected error:', err);
    }
  },

  cancelSession: (id) => {
    const session = get().sessions.find((s) => s.id === id);
    set((st) => ({ sessions: st.sessions.filter((s) => s.id !== id) }));
    if (session && session.status === 'active') get().adjustGarageSpots(session.garageId, +1);
    if (isSupabaseConfigured()) supabase.from('sessions').delete().eq('id', id);
  },

  removeSession: async (id) => {
    deletedSessionIds.add(id); locallyEndedSessions.delete(id); pausePolling(10000);
    const state = get();
    const target = state.sessions.find((s) => s.id === id);
    const idsToDelete = new Set<string>(); idsToDelete.add(id);
    if (target) {
      state.sessions.forEach((s) => {
        if (samePlate(s.carPlate, target.carPlate) && s.source === 'manual' && s.status === 'active' && Math.abs(s.startTime - target.startTime) < 10000) {
          idsToDelete.add(s.id); deletedSessionIds.add(s.id);
        }
      });
    }
    const activeDeletedCount = state.sessions.filter((s) => idsToDelete.has(s.id) && s.status === 'active').length;
    set({ sessions: state.sessions.filter((s) => !idsToDelete.has(s.id)) });
    if (target && activeDeletedCount > 0) await get().adjustGarageSpots(target.garageId, activeDeletedCount);
    if (isSupabaseConfigured()) {
      await Promise.all(Array.from(idsToDelete).map((did) => supabase.from('sessions').delete().eq('id', did)));
      if (target) {
        await supabase.from('sessions').delete()
          .eq('car_plate', normalizePlate(target.carPlate))
          .eq('source', 'manual').eq('status', 'active')
          .gte('start_time', new Date(target.startTime - 10000).toISOString())
          .lte('start_time', new Date(target.startTime + 10000).toISOString());
      }
    }
    setTimeout(() => { idsToDelete.forEach((did) => deletedSessionIds.delete(did)); }, 30000);
  },

  addWalletTopUp: (w) => {
    const newW: WalletTopUp = { ...w, id: uid(), status: 'pending', timestamp: Date.now() };
    set((st) => ({ walletTopUps: [newW, ...st.walletTopUps] }));
    if (isSupabaseConfigured()) {
      supabase.from('wallet_topups').insert({
        user_id: w.userId, user_name: w.userName, user_phone: w.userPhone,
        amount: w.amount, transaction_id: w.transactionId, car_plate: w.carPlate, method: w.method,
      }).select().single()
        .then(({ data }) => { if (data) set((st) => ({ walletTopUps: st.walletTopUps.map((x) => (x.id === newW.id ? mapTopUp(data) : x)) })); });
    }
  },

  approveTopUp: async (id) => {
    const topUp = get().walletTopUps.find((w) => w.id === id); if (!topUp) return;
    set((st) => ({ walletTopUps: st.walletTopUps.map((w) => (w.id === id ? { ...w, status: 'approved' as const } : w)) }));
    if (!isSupabaseConfigured()) return;
    let dbRow: any = null;
    if (topUp.transactionId) { const { data } = await supabase.from('wallet_topups').select('id, user_id, user_phone, amount, status').eq('transaction_id', topUp.transactionId).maybeSingle(); if (data) dbRow = data; }
    if (!dbRow) { const { data } = await supabase.from('wallet_topups').select('id, user_id, user_phone, amount, status').eq('id', id).maybeSingle(); if (data) dbRow = data; }
    if (!dbRow) { console.error('❌ الطلب مش موجود'); return; }
    const supabaseId = dbRow.id;
    const { error: approveError = null } = await supabase.from('wallet_topups').update({ status: 'approved' }).eq('id', supabaseId);
    if (approveError) {
      console.error('❌', approveError);
      set((st) => ({ walletTopUps: st.walletTopUps.map((w) => (w.id === id ? { ...w, status: 'pending' as const } : w)) }));
      return;
    }
    set((st) => ({ walletTopUps: st.walletTopUps.map((w) => (w.id === id ? { ...w, id: supabaseId, status: 'approved' as const } : w)) }));
    const realUserId = dbRow.user_id || topUp.userId || '';
    const realUserPhone = dbRow.user_phone || topUp.userPhone || '';
    let userData: any = null;
    if (realUserPhone) { const { data } = await supabase.from('users').select('id, phone, wallet').eq('phone', realUserPhone).maybeSingle(); if (data) userData = data; }
    if (!userData && realUserId && realUserId.includes('-')) { const { data } = await supabase.from('users').select('id, phone, wallet').eq('id', realUserId).maybeSingle(); if (data) userData = data; }
    if (!userData && realUserId && !realUserId.includes('-')) { const { data } = await supabase.from('users').select('id, phone, wallet').eq('phone', realUserPhone).maybeSingle(); if (data) userData = data; }
    if (!userData) { console.error('❌ المستخدم مش موجود'); return; }
    const amount = Number(dbRow.amount || topUp.amount || 0);
    const newWallet = Number(userData.wallet || 0) + amount;
    const { error: walletError } = await supabase.from('users').update({ wallet: newWallet }).eq('id', userData.id);
    if (walletError) { console.error('❌', walletError); return; }
    const currentUser = get().currentUser;
    if (currentUser && (currentUser.phone === userData.phone || (currentUser as any).id === userData.id)) {
      const updated = { ...currentUser, wallet: newWallet };
      set({ currentUser: updated }); safeSetStorage('currentUser', updated);
    }
  },

  rejectTopUp: async (id) => {
    const topUp = get().walletTopUps.find((w) => w.id === id); if (!topUp) return;
    set((st) => ({ walletTopUps: st.walletTopUps.map((w) => (w.id === id ? { ...w, status: 'rejected' as const } : w)) }));
    if (!isSupabaseConfigured()) return;
    let supabaseId = id;
    if (topUp.transactionId) { const { data } = await supabase.from('wallet_topups').select('id').eq('transaction_id', topUp.transactionId).maybeSingle(); if (data) supabaseId = data.id; }
    const { error } = await supabase.from('wallet_topups').update({ status: 'rejected' }).eq('id', supabaseId);
    if (error) { console.error('❌', error); return; }
    if (supabaseId !== id) {
      set((st) => ({ walletTopUps: st.walletTopUps.map((w) => (w.id === id ? { ...w, id: supabaseId, status: 'rejected' as const } : w)) }));
    }
  },

  addIncomingCar: async (c) => {
    const incomingId = crypto.randomUUID();
    const newC: IncomingCar = { ...c, id: incomingId, startTime: Date.now(), status: 'coming' };
    set((st) => ({ incomingCars: [newC, ...st.incomingCars] }));
    if (!isSupabaseConfigured()) return;
    try {
      const { data, error } = await supabase.from('incoming_cars').insert({
        id: incomingId, garage_id: c.garageId, car_plate: c.carPlate,
        customer_name: c.customerName, customer_phone: c.customerPhone,
        agreed_price: c.agreedPrice, estimated_arrival: c.estimatedArrival,
      }).select().single();
      if (error) { console.error('❌', error); set((st) => ({ incomingCars: st.incomingCars.filter((x) => x.id !== incomingId) })); return; }
      if (data) set((st) => ({ incomingCars: st.incomingCars.map((x) => (x.id === incomingId ? mapIncoming(data) : x)) }));
    } catch (err) {
      console.error('❌', err);
      set((st) => ({ incomingCars: st.incomingCars.filter((x) => x.id !== incomingId) }));
    }
  },

  removeIncomingCar: async (id) => {
    let savedCarPlate = ''; let savedGarageId = '';
    set((st) => {
      const found = st.incomingCars.find((c) => c.id === id);
      if (found) { savedCarPlate = found.carPlate; savedGarageId = found.garageId; }
      return { incomingCars: st.incomingCars.filter((c) => c.id !== id) };
    });
    if (!isSupabaseConfigured()) return;
    try {
      await supabase.from('incoming_cars').delete().eq('id', id);
      if (savedCarPlate && savedGarageId) {
        await supabase.from('incoming_cars').delete().eq('car_plate', savedCarPlate).eq('garage_id', savedGarageId);
      }
    } catch (err) { console.error('❌', err); }
    setTimeout(() => { get().fetchAll(true); }, 1000);
  },

  addMessage: async (msg) => {
    const optimisticMessage: Message = { ...msg, id: uid(), status: 'pending', timestamp: Date.now() };
    set((st) => ({ messages: [optimisticMessage, ...(st.messages ?? [])] }));
    if (!isSupabaseConfigured()) return { success: true };
    try {
      const { data, error } = await supabase.from('messages').insert({
        user_phone: msg.userPhone, user_name: msg.userName ?? null,
        car_plate: msg.carPlate ?? null, type: msg.type,
        subject: msg.subject ?? null, message: msg.message,
      }).select().single();
      if (error) {
        console.error('❌', error);
        set((st) => ({ messages: (st.messages ?? []).filter((m) => m.id !== optimisticMessage.id) }));
        return { success: false, error: error.message || 'فشل إرسال الرسالة' };
      }
      if (data) set((st) => ({ messages: (st.messages ?? []).map((m) => (m.id === optimisticMessage.id ? mapMessage(data) : m)) }));
      return { success: true };
    } catch (err) {
      console.error('❌', err);
      set((st) => ({ messages: (st.messages ?? []).filter((m) => m.id !== optimisticMessage.id) }));
      return { success: false, error: err instanceof Error ? err.message : 'حدث خطأ غير متوقع' };
    }
  },

  replyMessage: async (id, reply) => {
    const now = Date.now();
    set((st) => ({ messages: (st.messages ?? []).map((msg) => (msg.id === id ? { ...msg, reply, status: 'replied' as const, repliedAt: now } : msg)) }));
    if (!isSupabaseConfigured()) return;
    const { error } = await supabase.from('messages').update({ reply, status: 'replied', replied_at: new Date(now).toISOString() }).eq('id', id);
    if (error) console.error('❌', error);
  },

  closeMessage: async (id) => {
    set((st) => ({ messages: (st.messages ?? []).map((msg) => (msg.id === id ? { ...msg, status: 'closed' as const } : msg)) }));
    if (!isSupabaseConfigured()) return;
    const { error } = await supabase.from('messages').update({ status: 'closed' }).eq('id', id);
    if (error) console.error('❌', error);
  },
}));

// ===================== Realtime =====================
let realtimeStarted = false;
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let isOperationInProgress = false;
let pauseTimeout: ReturnType<typeof setTimeout> | null = null;

export function pausePolling(duration = 5000) {
  isOperationInProgress = true;
  if (pauseTimeout) clearTimeout(pauseTimeout);
  pauseTimeout = setTimeout(() => { isOperationInProgress = false; pauseTimeout = null; }, duration);
}

export function setupRealtime() {
  if (realtimeStarted) return;
  realtimeStarted = true;

  const startPolling = () => {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => { 
      if (!isOperationInProgress && document.visibilityState === 'visible') {
        useStore.getState().fetchAll(); 
      }
    }, 10000);
  };

  startPolling();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      useStore.getState().fetchAll(true); 
      startPolling(); 
    } else {
      if (pollingInterval) {
        clearInterval(pollingInterval); 
        pollingInterval = null;
      }
      if (fetchAbortController) {
        fetchAbortController.abort(); 
      }
    }
  });

  if (!isSupabaseConfigured()) return;

  let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastRefresh = 0;

  const refresh = () => {
    if (isOperationInProgress) return;
    const now = Date.now();
    if (now - lastRefresh < 2000) {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        lastRefresh = Date.now();
        if (!isOperationInProgress) useStore.getState().fetchAll();
        refreshTimeout = null;
      }, 2000);
      return;
    }
    lastRefresh = now;
    if (refreshTimeout) clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(() => {
      if (!isOperationInProgress) useStore.getState().fetchAll();
      refreshTimeout = null;
    }, 1000);
  };

  const channelName = `parkn24_${Math.random().toString(36).slice(2, 8)}`;
  const channel = supabase.channel(channelName);

  ['sessions', 'incoming_cars', 'garages', 'wallet_topups', 'users', 'messages'].forEach((table) => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh);
  });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('✅ Realtime connected:', channelName);
      if (pollingInterval) clearInterval(pollingInterval);
      pollingInterval = setInterval(() => { if (!isOperationInProgress) useStore.getState().fetchAll(); }, 10000);
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      if (pollingInterval) clearInterval(pollingInterval);
      pollingInterval = setInterval(() => { if (!isOperationInProgress) useStore.getState().fetchAll(); }, 5000);
    }
  });

  window.addEventListener('beforeunload', () => {
    if (refreshTimeout) clearTimeout(refreshTimeout);
    if (pollingInterval) clearInterval(pollingInterval);
    if (pauseTimeout) clearTimeout(pauseTimeout);
    channel.unsubscribe();
    supabase.removeChannel(channel);
  });
}