import { create } from 'zustand';
import { supabase } from './lib/supabase';

// ===================== Types =====================

export interface Garage {
  id: string;
  name: string;
  username: string;
  phone: string;
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
  isFreeSession?: boolean;
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
  isFreeSession?: boolean;
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

export interface LoyaltyStatus {
  paidSessions: number;
  remainingForFree: number;
  isNextFree: boolean;
  freeSessionsUsed: number;
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

const safeParseTime = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'string') {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : 0;
  }
  if (typeof value === 'number') {
    if (value <= 0) return 0;
    if (value < 1_000_000_000_000) return value * 1000;
    return value;
  }
  return 0;
};

const toMs = safeParseTime;

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
  location: r.location, lat: r.lat, lng: r.lng, capacity: r.capacity,
  availableSpots: r.available_spots, basePrice: Number(r.base_price),
  rating: Number(r.rating),
  valetName1: r.valet_name_1 || '', valetPassword1: r.valet_password_1 || '',
  valetName2: r.valet_name_2 || '', valetPassword2: r.valet_password_2 || '',
  valetName3: r.valet_name_3 || '', valetPassword3: r.valet_password_3 || '',
});

const mapSession = (r: any): ParkingSession => {
  const nowMs = Date.now();
  let startTime: number;
  const rawStart = r.start_time;
  if (typeof rawStart === 'string') {
    const parsed = new Date(rawStart).getTime();
    startTime = Number.isFinite(parsed) && parsed > 0 ? parsed : nowMs;
  } else if (typeof rawStart === 'number') {
    startTime = rawStart < 1_000_000_000_000 ? rawStart * 1000 : rawStart;
    if (!Number.isFinite(startTime) || startTime <= 0) startTime = nowMs;
  } else {
    startTime = nowMs;
  }

  let endTime: number | undefined;
  const rawEnd = r.end_time;
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
    id: r.id, garageId: r.garage_id, carPlate: r.car_plate, startTime, endTime,
    totalPrice: r.total_price != null ? Number(r.total_price) : undefined,
    paymentMethod: r.payment_method || undefined, status: r.status, source: r.source,
    agreedPrice: r.agreed_price != null ? Number(r.agreed_price) : undefined,
    synced: true, revenueConfirmed: r.revenue_confirmed ?? false,
    addedBy: r.added_by || '', customerPhone: r.customer_phone || undefined,
    customerName: r.customer_name || undefined, incomingCarId: r.incoming_car_id || undefined,
    startedBy: r.started_by || undefined, isFreeSession: r.is_free_session ?? false,
  };
};

const mapOffer = (r: any): Offer => ({
  id: r.id, garageId: r.garage_id, userId: r.user_id, carPlate: r.car_plate,
  offeredPrice: Number(r.offered_price), status: r.status,
  counterPrice: r.counter_price != null ? Number(r.counter_price) : undefined,
  timestamp: new Date(r.created_at).getTime(),
});

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
  estimatedArrival: r.estimated_arrival, status: 'coming',
  isFreeSession: r.is_free_session ?? false,
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
let walletDeductedAt = 0;
const deletedSessionIds = new Set<string>();
const locallyEndedSessions = new Map<string, ParkingSession>();

const resolveAddedBy = (explicitAddedBy?: string): string => {
  if (explicitAddedBy !== undefined && explicitAddedBy !== null && explicitAddedBy !== '') return explicitAddedBy;
  const valetName = localStorage.getItem('valetName') || '';
  const garageRole = localStorage.getItem('garageRole') || '';
  const valetNumber = localStorage.getItem('valetNumber') || '';
  if (garageRole === 'owner') return 'المالك';
  if (valetName) return valetName;
  if (garageRole === 'valet') return `سايس ${valetNumber}`;
  return '';
};

const resolveStartTime = (rawStartTime: any): number => {
  const nowMs = Date.now();
  if (!rawStartTime) return nowMs;
  let result: number;
  if (typeof rawStartTime === 'string') {
    result = new Date(rawStartTime).getTime();
  } else if (typeof rawStartTime === 'number') {
    result = rawStartTime < 1_000_000_000_000 ? rawStartTime * 1000 : rawStartTime;
  } else {
    return nowMs;
  }
  if (!Number.isFinite(result) || result <= 0) return nowMs;
  return result;
};

// ===================== State Interface =====================
interface AppState {
  view: ViewType;
  setView: (v: ViewType) => void;
  screen: ScreenType;
  setScreen: (s: ScreenType) => void;
  currentUser: { name: string; phone: string; carPlate: string; wallet: number } | null;
  setCurrentUser: (u: { name: string; phone: string; carPlate: string; wallet: number } | null) => void;
  deductWallet: (amount: number) => void;
  garages: Garage[];
  currentGarageId: string | null;
  setCurrentGarageId: (id: string | null) => void;
  addGarage: (g: Omit<Garage, 'id' | 'rating' | 'availableSpots'> & { capacity: number }) => Promise<void>;
  updateGarage: (id: string, updates: Partial<Pick<Garage, 'basePrice' | 'availableSpots' | 'capacity'>> & { valetName1?: string; valetPassword1?: string; valetName2?: string; valetPassword2?: string; valetName3?: string; valetPassword3?: string; }) => void;
  adjustGarageSpots: (id: string, delta: number) => Promise<void>;
  selectedGarageId: string | null;
  setSelectedGarageId: (id: string | null) => void;
  sessions: ParkingSession[];
  addSession: (s: Omit<ParkingSession, 'id'>) => Promise<string>;
  endSession: (id: string, totalPrice: number, paymentMethod: string) => Promise<void>;
  cancelSession: (id: string) => void;
  removeSession: (id: string) => Promise<void>;
  confirmRevenue: (sessionId: string) => Promise<void>;
  unconfirmRevenue: (sessionId: string) => Promise<void>;
  assignSessionToValet: (sessionId: string, valetName: string) => Promise<void>;
  offers: Offer[];
  addOffer: (o: Omit<Offer, 'id' | 'timestamp'>) => void;
  updateOffer: (id: string, status: Offer['status'], counterPrice?: number) => void;
  cancelOffer: (id: string) => void;
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
  loyaltyStatus: LoyaltyStatus | null;
  fetchLoyaltyStatus: () => Promise<void>;
  incrementLoyalty: () => Promise<boolean>;
  fetchAll: () => Promise<void>;
  logout: () => void;
}

// ===================== Store =====================
export const useStore = create<AppState>((set, get) => ({
  view: (() => { try { return (localStorage.getItem('appView') as ViewType) || 'user'; } catch { return 'user' as ViewType; } })(),
  setView: (v) => { set({ view: v }); localStorage.setItem('appView', v); },

  screen: (() => { try { const s = localStorage.getItem('appScreen'); return s ? s as ScreenType : 'splash'; } catch { return 'splash' as ScreenType; } })(),
  setScreen: (s) => { set({ screen: s }); localStorage.setItem('appScreen', s); },

  currentUser: safeGetStorage('currentUser'),

  setCurrentUser: async (u) => {
    if (!u) { set({ currentUser: null }); safeRemoveStorage('currentUser'); return; }
    set({ currentUser: u }); safeSetStorage('currentUser', u);
    if (!isSupabaseConfigured()) return;
    try {
      const { data: eu } = await supabase.from('users').select('wallet, name, phone, car_plate').eq('phone', u.phone).single();
      if (eu) {
        const up = { name: eu.name || u.name, phone: eu.phone || u.phone, carPlate: eu.car_plate || u.carPlate, wallet: Number(eu.wallet) };
        set({ currentUser: up }); safeSetStorage('currentUser', up);
        await supabase.from('users').update({ name: u.name, car_plate: u.carPlate }).eq('phone', u.phone);
      } else {
        const { data: nu } = await supabase.from('users').insert({ name: u.name, phone: u.phone, car_plate: u.carPlate, wallet: u.wallet ?? 0 }).select().single();
        if (nu) { const up = { name: nu.name, phone: nu.phone, carPlate: nu.car_plate, wallet: Number(nu.wallet) }; set({ currentUser: up }); safeSetStorage('currentUser', up); }
      }
    } catch (err) { console.error('Error setting user:', err); }
  },

  deductWallet: (amount) => {
    const user = get().currentUser; if (!user) return;
    const nw = Math.max(0, user.wallet - amount);
    const up = { ...user, wallet: nw };
    set({ currentUser: up }); safeSetStorage('currentUser', up);
    walletDeductedAt = Date.now();
    if (isSupabaseConfigured()) supabase.from('users').update({ wallet: nw }).eq('phone', user.phone).then(({ error }) => { if (error) console.error('❌', error); });
  },

  garages: [],
  currentGarageId: (() => { try { return localStorage.getItem('currentGarageId') || null; } catch { return null; } })(),
  setCurrentGarageId: (id) => { set({ currentGarageId: id }); if (id) localStorage.setItem('currentGarageId', id); else localStorage.removeItem('currentGarageId'); },

  selectedGarageId: (() => { try { return localStorage.getItem('selectedGarageId') || null; } catch { return null; } })(),
  setSelectedGarageId: (id) => { set({ selectedGarageId: id }); if (id) localStorage.setItem('selectedGarageId', id); else localStorage.removeItem('selectedGarageId'); },

  sessions: [], offers: [], walletTopUps: [], incomingCars: [], messages: [],
  loyaltyStatus: null,

  logout: () => {
    set({ currentUser: null, currentGarageId: null, selectedGarageId: null, view: 'user', screen: 'splash', loyaltyStatus: null });
    safeRemoveStorage('currentUser'); safeRemoveStorage('appView'); safeRemoveStorage('appScreen');
    safeRemoveStorage('currentGarageId'); safeRemoveStorage('selectedGarageId');
    safeRemoveStorage('garageAuth'); safeRemoveStorage('adminAuth');
  },

  // ══════════════════════════════════════════════
  // ██  Loyalty
  // ══════════════════════════════════════════════
  fetchLoyaltyStatus: async () => {
    const user = get().currentUser;
    if (!user?.phone || !user?.carPlate) return;
    if (!isSupabaseConfigured()) return;
    try {
      const { data, error } = await supabase.rpc('get_loyalty_status', {
        p_phone: user.phone,
        p_plate: normalizePlate(user.carPlate),
      });
      if (error) { console.error('❌ fetchLoyaltyStatus:', error); return; }
      if (data) {
        set({
          loyaltyStatus: {
            paidSessions: data.paid_sessions ?? 0,
            remainingForFree: data.remaining_for_free ?? 5,
            isNextFree: data.is_next_free ?? false,
            freeSessionsUsed: data.free_sessions_used ?? 0,
          },
        });
      }
    } catch (e) { console.error('❌ fetchLoyaltyStatus:', e); }
  },

  incrementLoyalty: async () => {
    const user = get().currentUser;
    if (!user?.phone || !user?.carPlate) return false;
    if (!isSupabaseConfigured()) return false;
    try {
      const { data, error } = await supabase.rpc('increment_paid_sessions', {
        p_phone: user.phone,
        p_plate: normalizePlate(user.carPlate),
      });
      if (error) { console.error('❌ incrementLoyalty:', error); return false; }
      const isFree = data?.is_free ?? false;
      set({
        loyaltyStatus: {
          paidSessions: data?.paid_sessions ?? 0,
          remainingForFree: 5 - (data?.paid_sessions ?? 0),
          isNextFree: (data?.paid_sessions ?? 0) >= 5,
          freeSessionsUsed: data?.free_sessions_used ?? 0,
        },
      });
      return isFree;
    } catch (e) { console.error('❌ incrementLoyalty:', e); return false; }
  },

  // ══════════════════════════════════════════════
  // ██  assignSessionToValet
  // ══════════════════════════════════════════════
  assignSessionToValet: async (sessionId, valetName) => {
    if (!sessionId || !valetName) return;
    set((st) => ({ sessions: st.sessions.map((s) => s.id === sessionId ? { ...s, addedBy: valetName } : s) }));
    if (!isSupabaseConfigured()) return;
    try {
      const { data: existing } = await supabase.from('sessions').select('id, added_by').eq('id', sessionId).single();
      const currentAddedBy = existing?.added_by || '';
      if (currentAddedBy && currentAddedBy.trim() !== '') {
        set((st) => ({ sessions: st.sessions.map((s) => s.id === sessionId ? { ...s, addedBy: currentAddedBy } : s) }));
        return;
      }
      await supabase.from('sessions').update({ added_by: valetName }).eq('id', sessionId);
    } catch (e) { console.error('❌ assignSessionToValet:', e); }
  },

  // ══════════════════════════════════════════════
  // ██  fetchAll
  // ══════════════════════════════════════════════
  fetchAll: async () => {
    if (!isSupabaseConfigured()) return;
    const [g, s, o, w, ic, msgs] = await Promise.all([
      supabase.from('garages').select('*'),
      supabase.from('sessions').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('offers').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('wallet_topups').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('incoming_cars').select('*').order('created_at', { ascending: false }),
      supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(50),
    ]);

    const currentGarages = get().garages;
    const fetchedGarages = g.data?.length ? g.data.map(mapGarage) : currentGarages;
    const garages = fetchedGarages.map((dbG) => {
      if (pendingGarageUpdates.has(dbG.id)) return currentGarages.find((x) => x.id === dbG.id) ?? dbG;
      return dbG;
    });

    const supabaseSessions = s.data ? s.data.map(mapSession) : [];
    const supabaseSessionIds = new Set(supabaseSessions.map((ss) => ss.id));
    const currentSessions = get().sessions;
    const supabaseActiveKeys = new Set(supabaseSessions.filter((ss) => ss.status === 'active').map((ss) => `${normalizePlate(ss.carPlate)}::${ss.source}`));

    const localOnlySessions = currentSessions.filter((cs) =>
      !supabaseSessionIds.has(cs.id) && cs.status === 'active' &&
      !supabaseActiveKeys.has(`${normalizePlate(cs.carPlate)}::${cs.source}`) &&
      !deletedSessionIds.has(cs.id) && Date.now() - cs.startTime < 15000
    );

    const mergedSessions = supabaseSessions.filter((ss) => !deletedSessionIds.has(ss.id)).map((ss) => {
      const locallyEnded = locallyEndedSessions.get(ss.id);
      if (locallyEnded) { if (ss.status === 'completed') { locallyEndedSessions.delete(ss.id); return ss; } return locallyEnded; }
      const lv = currentSessions.find((cs) => cs.id === ss.id);
      if (lv) {
        if (ss.status === 'completed' && lv.status === 'active') return ss;
        if (lv.status === 'completed') return { ...lv, revenueConfirmed: ss.revenueConfirmed || lv.revenueConfirmed };
        if (ss.status === 'active' && lv.status === 'active') {
          return { ...lv, startTime: ss.startTime, synced: true, addedBy: ss.addedBy || lv.addedBy || '', customerPhone: ss.customerPhone || lv.customerPhone, customerName: ss.customerName || lv.customerName, isFreeSession: ss.isFreeSession || lv.isFreeSession };
        }
        if (lv.totalPrice != null && lv.totalPrice > 0) return lv;
      }
      return ss;
    });

    const finalSessions = dedupeActiveSessions([...mergedSessions, ...localOnlySessions]);

    const supabaseTopUps = w.data ? w.data.map(mapTopUp) : get().walletTopUps;
    const currentTopUps = get().walletTopUps ?? [];
    const mergedTopUps = supabaseTopUps.map((st) => { const l = currentTopUps.find((ct) => ct.id === st.id); if (l && l.status !== 'pending' && st.status === 'pending') return l; return st; });

    const fetchedCars = ic.data ? ic.data.map(mapIncoming).filter((c) => c.status === 'coming') : (get().incomingCars ?? []);

    const currentMessages = get().messages ?? [];
    const supabaseMessages = msgs.data ? msgs.data.map(mapMessage) : currentMessages;
    const mergedMessages = supabaseMessages.map((sm) => {
      const l = currentMessages.find((cm) => cm.id === sm.id);
      if (l) { if (l.status !== 'pending' && sm.status === 'pending') return l; if (sm.status !== 'pending' && l.status === 'pending') return sm; return (sm.repliedAt ?? sm.timestamp) > (l.repliedAt ?? l.timestamp) ? sm : l; }
      return sm;
    });
    const supabaseMessageIds = new Set(supabaseMessages.map((sm) => sm.id));
    const localOnlyMessages = currentMessages.filter((cm) => !supabaseMessageIds.has(cm.id) && cm.status === 'pending');

    set({
      garages, sessions: finalSessions,
      offers: o.data ? o.data.map(mapOffer) : (get().offers ?? []),
      walletTopUps: mergedTopUps, incomingCars: fetchedCars,
      messages: [...mergedMessages, ...localOnlyMessages],
    });

    const user = get().currentUser;
    if (user?.phone) {
      try {
        const timeSinceDeduct = Date.now() - walletDeductedAt;
        if (timeSinceDeduct < 20000) {
          const { data } = await supabase.from('users').select('name, phone, car_plate').eq('phone', user.phone).single();
          if (data) { const up = { name: data.name || user.name, phone: data.phone || user.phone, carPlate: data.car_plate || user.carPlate, wallet: user.wallet }; set({ currentUser: up }); safeSetStorage('currentUser', up); }
        } else {
          const { data } = await supabase.from('users').select('wallet, name, phone, car_plate').eq('phone', user.phone).single();
          if (data) { const up = { name: data.name || user.name, phone: data.phone || user.phone, carPlate: data.car_plate || user.carPlate, wallet: Number(data.wallet) }; set({ currentUser: up }); safeSetStorage('currentUser', up); }
        }
      } catch (err) { console.error('Error fetching user wallet:', err); }
    }

    // ✅ تحديث الولاء
    await get().fetchLoyaltyStatus();
  },

  // ══════════════════════════════════════════════
  // ██  addGarage
  // ══════════════════════════════════════════════
  addGarage: async (g) => {
    const { data, error } = await supabase.from('garages').insert({
      name: g.name, username: g.username, phone: g.phone, location: g.location, lat: g.lat, lng: g.lng,
      capacity: g.capacity, available_spots: g.capacity, base_price: g.basePrice, rating: 4.0,
      valet_name_1: (g as any).valetName1 || '', valet_password_1: (g as any).valetPassword1 || '',
      valet_name_2: (g as any).valetName2 || '', valet_password_2: (g as any).valetPassword2 || '',
      valet_name_3: (g as any).valetName3 || '', valet_password_3: (g as any).valetPassword3 || '',
    }).select();
    if (!error && data) set((st) => ({ garages: [...st.garages, ...data.map(mapGarage)] }));
  },

  updateGarage: (id, updates) => {
    set((st) => ({ garages: st.garages.map((g) => g.id === id ? { ...g, ...updates } : g) }));
    if (!isSupabaseConfigured()) return;
    const existing = pendingGarageUpdates.get(id) || {};
    const db: Record<string, unknown> = { ...existing };
    if (updates.basePrice !== undefined) db.base_price = updates.basePrice;
    if (updates.availableSpots !== undefined) db.available_spots = updates.availableSpots;
    if (updates.capacity !== undefined) db.capacity = updates.capacity;
    if (updates.valetName1 !== undefined) db.valet_name_1 = updates.valetName1;
    if (updates.valetPassword1 !== undefined) db.valet_password_1 = updates.valetPassword1;
    if (updates.valetName2 !== undefined) db.valet_name_2 = updates.valetName2;
    if (updates.valetPassword2 !== undefined) db.valet_password_2 = updates.valetPassword2;
    if (updates.valetName3 !== undefined) db.valet_name_3 = updates.valetName3;
    if (updates.valetPassword3 !== undefined) db.valet_password_3 = updates.valetPassword3;
    pendingGarageUpdates.set(id, db);
    if (updateGarageTimeout) clearTimeout(updateGarageTimeout);
    updateGarageTimeout = setTimeout(async () => {
      for (const [gId, dbU] of pendingGarageUpdates.entries()) await supabase.from('garages').update(dbU).eq('id', gId);
      pendingGarageUpdates.clear(); updateGarageTimeout = null;
    }, 500);
  },

  adjustGarageSpots: async (id, delta) => {
    set((st) => ({ garages: st.garages.map((g) => g.id !== id ? g : { ...g, availableSpots: Math.max(0, Math.min(g.capacity, g.availableSpots + delta)) }) }));
    if (!isSupabaseConfigured()) return;
    try {
      const pending = pendingGarageUpdates.get(id);
      if (pending && Object.keys(pending).length > 0) {
        const { error } = await supabase.from('garages').update(pending).eq('id', id);
        if (error) { await get().fetchAll(); return; }
        pendingGarageUpdates.delete(id);
        if (pendingGarageUpdates.size === 0 && updateGarageTimeout) { clearTimeout(updateGarageTimeout); updateGarageTimeout = null; }
      }
      const { data, error } = await supabase.rpc('adjust_spots', { garage_uuid: id, delta });
      if (error) { await get().fetchAll(); return; }
      set((st) => ({ garages: st.garages.map((g) => g.id === id ? { ...g, availableSpots: Number(data) } : g) }));
    } catch { await get().fetchAll(); }
  },

  // ══════════════════════════════════════════════
  // ██  addSession
  // ══════════════════════════════════════════════
  addSession: async (s) => {
    const np = normalizePlate(s.carPlate);
    if (!np) return '';
    const sessionId = crypto.randomUUID();
    const safeStartTime = resolveStartTime(s.startTime);
    const lockKey = `${np}::${s.source}`;

    if (sessionStartLocks.has(lockKey)) {
      const ex = get().sessions.find((x) => samePlate(x.carPlate, np) && x.status === 'active' && x.source === s.source);
      return ex?.id ?? '';
    }
    sessionStartLocks.add(lockKey);
    pausePolling(8000);

    try {
      const exLocal = get().sessions.find((x) => samePlate(x.carPlate, np) && x.status === 'active' && x.source === s.source);
      if (exLocal) return exLocal.id;

      if (isSupabaseConfigured()) {
        try {
          const { data: dbCheck } = await supabase.from('sessions').select('id').eq('status', 'active').eq('car_plate', np).eq('source', s.source).limit(1);
          if (dbCheck && dbCheck.length > 0) {
            const { data: sd } = await supabase.from('sessions').select('*').eq('id', dbCheck[0].id).single();
            if (sd) {
              const synced = { ...mapSession(sd), synced: true };
              set((st) => {
                const exists = st.sessions.find((x) => x.id === synced.id);
                if (exists) return { sessions: dedupeActiveSessions(st.sessions.map((x) => x.id === synced.id ? synced : x)) };
                return { sessions: dedupeActiveSessions([synced, ...st.sessions]) };
              });
            }
            return dbCheck[0].id;
          }
        } catch (err) { console.error('DB check error:', err); }
      }

      const addedByValue = resolveAddedBy((s as any).addedBy);

      const optimistic: ParkingSession = {
        ...s, id: sessionId, carPlate: np, startTime: safeStartTime,
        synced: false, revenueConfirmed: false, addedBy: addedByValue,
        customerPhone: (s as any).customerPhone || undefined,
        customerName: (s as any).customerName || undefined,
        incomingCarId: (s as any).incomingCarId || undefined,
        startedBy: (s as any).startedBy || undefined,
        isFreeSession: (s as any).isFreeSession || false,
      };

      set((st) => ({ sessions: dedupeActiveSessions([optimistic, ...st.sessions]) }));
      await get().adjustGarageSpots(s.garageId, -1);
      if (!isSupabaseConfigured()) return sessionId;

      try {
        const { data, error } = await supabase.from('sessions').insert({
          id: sessionId, garage_id: s.garageId, car_plate: np,
          start_time: new Date(safeStartTime).toISOString(),
          status: s.status, source: s.source, agreed_price: s.agreedPrice ?? null,
          revenue_confirmed: false, added_by: addedByValue,
          customer_phone: (s as any).customerPhone || null,
          customer_name: (s as any).customerName || null,
          incoming_car_id: (s as any).incomingCarId || null,
          started_by: (s as any).startedBy || null,
          is_free_session: (s as any).isFreeSession || false,
        }).select().single();

        if (error) {
          set((st) => ({ sessions: st.sessions.filter((x) => x.id !== sessionId) }));
          await get().adjustGarageSpots(s.garageId, +1);
          return sessionId;
        }
        if (data) {
          const synced = { ...mapSession(data), synced: true };
          set((st) => ({ sessions: dedupeActiveSessions(st.sessions.map((x) => x.id === sessionId ? synced : x)) }));
          return data.id;
        }
      } catch {
        set((st) => ({ sessions: st.sessions.filter((x) => x.id !== sessionId) }));
        await get().adjustGarageSpots(s.garageId, +1);
      }
      return sessionId;
    } finally {
      sessionStartLocks.delete(lockKey);
    }
  },

  endSession: async (id, totalPrice, paymentMethod) => {
    const now = Date.now();
    const session = get().sessions.find((s) => s.id === id);
    if (!session || session.status !== 'active') return;
    const lockKey = `${session.garageId}:${normalizePlate(session.carPlate)}`;
    if (sessionEndLocks.has(lockKey)) return;
    sessionEndLocks.add(lockKey);
    pausePolling(15000);
    try {
      const safeTP = Number(totalPrice) > 0 ? Number(totalPrice) : 0;
      const ended: ParkingSession = { ...session, endTime: now, totalPrice: safeTP, paymentMethod, status: 'completed', revenueConfirmed: false };
      locallyEndedSessions.set(id, ended);
      set((st) => ({ sessions: st.sessions.map((s) => s.id === id ? ended : s) }));
      await get().adjustGarageSpots(session.garageId, +1);
      if (!isSupabaseConfigured()) return;
      const { error } = await supabase.from('sessions').update({
        end_time: new Date(now).toISOString(), total_price: safeTP,
        payment_method: paymentMethod, status: 'completed', revenue_confirmed: false,
      }).eq('id', id).eq('status', 'active');
      if (!error) setTimeout(() => { locallyEndedSessions.delete(id); }, 10000);
      setTimeout(() => { get().fetchAll(); }, 12000);
    } finally {
      setTimeout(() => { sessionEndLocks.delete(lockKey); }, 3000);
    }
  },

  confirmRevenue: async (sid) => {
    set((st) => ({ sessions: st.sessions.map((s) => s.id === sid ? { ...s, revenueConfirmed: true } : s) }));
    pausePolling(10000);
    if (!isSupabaseConfigured()) return;
    const { error } = await supabase.from('sessions').update({ revenue_confirmed: true }).eq('id', sid);
    if (error) set((st) => ({ sessions: st.sessions.map((s) => s.id === sid ? { ...s, revenueConfirmed: false } : s) }));
  },

  unconfirmRevenue: async (sid) => {
    set((st) => ({ sessions: st.sessions.map((s) => s.id === sid ? { ...s, revenueConfirmed: false } : s) }));
    pausePolling(10000);
    if (!isSupabaseConfigured()) return;
    const { error } = await supabase.from('sessions').update({ revenue_confirmed: false }).eq('id', sid);
    if (error) set((st) => ({ sessions: st.sessions.map((s) => s.id === sid ? { ...s, revenueConfirmed: true } : s) }));
  },

  cancelSession: (id) => {
    const session = get().sessions.find((s) => s.id === id);
    set((st) => ({ sessions: st.sessions.filter((s) => s.id !== id) }));
    if (session?.status === 'active') get().adjustGarageSpots(session.garageId, +1);
    if (isSupabaseConfigured()) supabase.from('sessions').delete().eq('id', id);
  },

  removeSession: async (id) => {
    deletedSessionIds.add(id); locallyEndedSessions.delete(id); pausePolling(10000);
    const state = get(); const target = state.sessions.find((s) => s.id === id);
    const ids = new Set<string>(); ids.add(id);
    if (target) state.sessions.forEach((s) => { if (samePlate(s.carPlate, target.carPlate) && s.source === 'manual' && s.status === 'active' && Math.abs(s.startTime - target.startTime) < 10000) { ids.add(s.id); deletedSessionIds.add(s.id); } });
    const activeCount = state.sessions.filter((s) => ids.has(s.id) && s.status === 'active').length;
    set({ sessions: state.sessions.filter((s) => !ids.has(s.id)) });
    if (target && activeCount > 0) await get().adjustGarageSpots(target.garageId, activeCount);
    if (isSupabaseConfigured()) {
      await Promise.all(Array.from(ids).map((d) => supabase.from('sessions').delete().eq('id', d)));
      if (target) await supabase.from('sessions').delete().eq('car_plate', normalizePlate(target.carPlate)).eq('source', 'manual').eq('status', 'active').gte('start_time', new Date(target.startTime - 10000).toISOString()).lte('start_time', new Date(target.startTime + 10000).toISOString());
    }
    setTimeout(() => { ids.forEach((d) => deletedSessionIds.delete(d)); }, 30000);
  },

  addOffer: (o) => {
    const n: Offer = { ...o, id: uid(), timestamp: Date.now() };
    set((st) => ({ offers: [n, ...st.offers] }));
    if (isSupabaseConfigured()) supabase.from('offers').insert({ garage_id: o.garageId, user_id: o.userId, car_plate: o.carPlate, offered_price: o.offeredPrice, status: o.status }).select().single().then(({ data }) => { if (data) set((st) => ({ offers: st.offers.map((x) => x.id === n.id ? mapOffer(data) : x) })); });
  },

  updateOffer: (id, status, cp) => {
    set((st) => ({ offers: st.offers.map((o) => o.id === id ? { ...o, status, counterPrice: cp } : o) }));
    if (isSupabaseConfigured()) { const u: any = { status }; if (cp !== undefined) u.counter_price = cp; supabase.from('offers').update(u).eq('id', id); }
  },

  cancelOffer: (id) => {
    set((st) => ({ offers: st.offers.filter((o) => o.id !== id) }));
    if (isSupabaseConfigured()) supabase.from('offers').delete().eq('id', id);
  },

  addWalletTopUp: (w) => {
    const n: WalletTopUp = { ...w, id: uid(), status: 'pending', timestamp: Date.now() };
    set((st) => ({ walletTopUps: [n, ...st.walletTopUps] }));
    if (isSupabaseConfigured()) supabase.from('wallet_topups').insert({ user_id: w.userId, user_name: w.userName, user_phone: w.userPhone, amount: w.amount, transaction_id: w.transactionId, car_plate: w.carPlate, method: w.method }).select().single().then(({ data }) => { if (data) set((st) => ({ walletTopUps: st.walletTopUps.map((x) => x.id === n.id ? mapTopUp(data) : x) })); });
  },

  approveTopUp: async (id) => {
    const topUp = get().walletTopUps.find((w) => w.id === id); if (!topUp) return;
    set((st) => ({ walletTopUps: st.walletTopUps.map((w) => w.id === id ? { ...w, status: 'approved' as const } : w) }));
    if (!isSupabaseConfigured()) return;
    let dbRow: any = null;
    if (topUp.transactionId) { const { data } = await supabase.from('wallet_topups').select('id, user_id, user_phone, amount, status').eq('transaction_id', topUp.transactionId).maybeSingle(); if (data) dbRow = data; }
    if (!dbRow) { const { data } = await supabase.from('wallet_topups').select('id, user_id, user_phone, amount, status').eq('id', id).maybeSingle(); if (data) dbRow = data; }
    if (!dbRow) return;
    const sid = dbRow.id;
    const { error } = await supabase.from('wallet_topups').update({ status: 'approved' }).eq('id', sid);
    if (error) { set((st) => ({ walletTopUps: st.walletTopUps.map((w) => w.id === id ? { ...w, status: 'pending' as const } : w) })); return; }
    set((st) => ({ walletTopUps: st.walletTopUps.map((w) => w.id === id ? { ...w, id: sid, status: 'approved' as const } : w) }));
    let userData: any = null;
    const rp = dbRow.user_phone || topUp.userPhone || ''; const ri = dbRow.user_id || topUp.userId || '';
    if (rp) { const { data } = await supabase.from('users').select('id, phone, wallet').eq('phone', rp).maybeSingle(); if (data) userData = data; }
    if (!userData && ri?.includes('-')) { const { data } = await supabase.from('users').select('id, phone, wallet').eq('id', ri).maybeSingle(); if (data) userData = data; }
    if (!userData && ri) { const { data } = await supabase.from('users').select('id, phone, wallet').eq('phone', ri).maybeSingle(); if (data) userData = data; }
    if (!userData) return;
    const nw = Number(userData.wallet || 0) + Number(dbRow.amount || topUp.amount || 0);
    await supabase.from('users').update({ wallet: nw }).eq('id', userData.id);
    const cu = get().currentUser;
    if (cu && cu.phone === userData.phone) { const up = { ...cu, wallet: nw }; set({ currentUser: up }); safeSetStorage('currentUser', up); }
  },

  rejectTopUp: async (id) => {
    const topUp = get().walletTopUps.find((w) => w.id === id); if (!topUp) return;
    set((st) => ({ walletTopUps: st.walletTopUps.map((w) => w.id === id ? { ...w, status: 'rejected' as const } : w) }));
    if (!isSupabaseConfigured()) return;
    let sid = id;
    if (topUp.transactionId) { const { data } = await supabase.from('wallet_topups').select('id').eq('transaction_id', topUp.transactionId).maybeSingle(); if (data) sid = data.id; }
    await supabase.from('wallet_topups').update({ status: 'rejected' }).eq('id', sid);
    if (sid !== id) set((st) => ({ walletTopUps: st.walletTopUps.map((w) => w.id === id ? { ...w, id: sid, status: 'rejected' as const } : w) }));
  },

  addIncomingCar: async (c) => {
    const iid = crypto.randomUUID();
    const n: IncomingCar = { ...c, id: iid, startTime: Date.now(), status: 'coming' };
    set((st) => ({ incomingCars: [n, ...st.incomingCars] }));
    if (!isSupabaseConfigured()) return;
    try {
const { data, error } = await supabase.from('incoming_cars').insert({ id: iid, garage_id: c.garageId, car_plate: c.carPlate, customer_name: c.customerName, customer_phone: c.customerPhone, agreed_price: c.agreedPrice, estimated_arrival: c.estimatedArrival, is_free_session: (c as any).isFreeSession || false }).select().single();
      if (error) { set((st) => ({ incomingCars: st.incomingCars.filter((x) => x.id !== iid) })); return; }
      if (data) set((st) => ({ incomingCars: st.incomingCars.map((x) => x.id === iid ? mapIncoming(data) : x) }));
    } catch { set((st) => ({ incomingCars: st.incomingCars.filter((x) => x.id !== iid) })); }
  },

  removeIncomingCar: async (id) => {
    let sp = ''; let sg = '';
    set((st) => { const f = st.incomingCars.find((c) => c.id === id); if (f) { sp = f.carPlate; sg = f.garageId; } return { incomingCars: st.incomingCars.filter((c) => c.id !== id) }; });
    if (!isSupabaseConfigured()) return;
    try { await supabase.from('incoming_cars').delete().eq('id', id); if (sp && sg) await supabase.from('incoming_cars').delete().eq('car_plate', sp).eq('garage_id', sg); } catch {}
    setTimeout(() => { get().fetchAll(); }, 1000);
  },

  addMessage: async (msg) => {
    const om: Message = { ...msg, id: uid(), status: 'pending', timestamp: Date.now() };
    set((st) => ({ messages: [om, ...(st.messages ?? [])] }));
    if (!isSupabaseConfigured()) return { success: true };
    try {
      const { data, error } = await supabase.from('messages').insert({ user_phone: msg.userPhone, user_name: msg.userName ?? null, car_plate: msg.carPlate ?? null, type: msg.type, subject: msg.subject ?? null, message: msg.message }).select().single();
      if (error) { set((st) => ({ messages: (st.messages ?? []).filter((m) => m.id !== om.id) })); return { success: false, error: error.message }; }
      if (data) set((st) => ({ messages: (st.messages ?? []).map((m) => m.id === om.id ? mapMessage(data) : m) }));
      return { success: true };
    } catch (err) { set((st) => ({ messages: (st.messages ?? []).filter((m) => m.id !== om.id) })); return { success: false, error: err instanceof Error ? err.message : 'خطأ' }; }
  },

  replyMessage: async (id, reply) => {
    const now = Date.now();
    set((st) => ({ messages: (st.messages ?? []).map((m) => m.id === id ? { ...m, reply, status: 'replied' as const, repliedAt: now } : m) }));
    if (isSupabaseConfigured()) await supabase.from('messages').update({ reply, status: 'replied', replied_at: new Date(now).toISOString() }).eq('id', id);
  },

  closeMessage: async (id) => {
    set((st) => ({ messages: (st.messages ?? []).map((m) => m.id === id ? { ...m, status: 'closed' as const } : m) }));
    if (isSupabaseConfigured()) await supabase.from('messages').update({ status: 'closed' }).eq('id', id);
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
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(() => { if (!isOperationInProgress) useStore.getState().fetchAll(); }, 5000);
  if (!isSupabaseConfigured()) return;
  let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastRefresh = 0;
  const refresh = () => {
    if (isOperationInProgress) return;
    const now = Date.now();
    if (now - lastRefresh < 2000) { if (refreshTimeout) clearTimeout(refreshTimeout); refreshTimeout = setTimeout(() => { lastRefresh = Date.now(); if (!isOperationInProgress) useStore.getState().fetchAll(); refreshTimeout = null; }, 2000); return; }
    lastRefresh = now;
    if (refreshTimeout) clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(() => { if (!isOperationInProgress) useStore.getState().fetchAll(); refreshTimeout = null; }, 1000);
  };
  const ch = supabase.channel(`parkn24_${Math.random().toString(36).slice(2, 8)}`);
  ['sessions', 'offers', 'incoming_cars', 'garages', 'wallet_topups', 'users', 'messages'].forEach((t) => ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, refresh));
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') { if (pollingInterval) clearInterval(pollingInterval); pollingInterval = setInterval(() => { if (!isOperationInProgress) useStore.getState().fetchAll(); }, 10000); }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { if (pollingInterval) clearInterval(pollingInterval); pollingInterval = setInterval(() => { if (!isOperationInProgress) useStore.getState().fetchAll(); }, 5000); }
  });
  window.addEventListener('beforeunload', () => { if (refreshTimeout) clearTimeout(refreshTimeout); if (pollingInterval) clearInterval(pollingInterval); if (pauseTimeout) clearTimeout(pauseTimeout); ch.unsubscribe(); supabase.removeChannel(ch); });
}