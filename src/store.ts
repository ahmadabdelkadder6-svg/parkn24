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
  payment_mode?: 'cash' | 'wallet' | 'both';
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
  freeMinutesApplied?: number;
  isFirstFreeSession?: boolean;
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
  bonusAmount?: number;
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

// ===================== 🎁 نظام الشرائح والهدايا الموحد =====================

export const TOPUP_TIERS = [
  { id: 'bronze',   amount: 100,  bonus: 5,   label: '🥉 برونزي',   percentage: 5,  popular: false },
  { id: 'silver',   amount: 300,  bonus: 30,  label: '🥈 فضي',      percentage: 10, popular: false },
  { id: 'gold',     amount: 500,  bonus: 75,  label: '🥇 ذهبي',     percentage: 15, popular: true  },
  { id: 'platinum', amount: 1000, bonus: 200, label: '👑 بلاتيني', percentage: 20, popular: false },
];

export const calculateBonus = (amount: number): number => {
  const eligibleTier = [...TOPUP_TIERS].reverse().find((tier) => amount >= tier.amount);
  return eligibleTier ? eligibleTier.bonus : 0;
};

export const FREE_SESSION_DURATION_MS = 30 * 60 * 1000; 

export const isEligibleForFreeSession = (
  source: 'app' | 'manual',
  hasUsedFreeSession: boolean | undefined
): boolean => {
  if (source !== 'app') return false;
  if (hasUsedFreeSession === true) return false;
  return true;
};

export const calculateSessionPriceWithFreeGift = (
  durationMs: number,
  hourlyRate: number,
  isFirstFreeSession: boolean,
  originalPriceCalculator: (durMs: number, rate: number) => number
): { finalPrice: number; freeMinutes: number; billableMs: number } => {
  if (!isFirstFreeSession) {
    return {
      finalPrice: originalPriceCalculator(durationMs, hourlyRate),
      freeMinutes: 0,
      billableMs: durationMs,
    };
  }

  if (durationMs <= FREE_SESSION_DURATION_MS) {
    return {
      finalPrice: 0,
      freeMinutes: Math.floor(durationMs / 60000),
      billableMs: 0,
    };
  }

  const finalPrice = originalPriceCalculator(durationMs, hourlyRate);
  return {
    finalPrice,
    freeMinutes: 0,
    billableMs: durationMs,
  };
};

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

export const getPlateFingerprint = (plate?: string): string => {
  if (!plate) return '';

  let str = plate
    .trim()
    .toUpperCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[\s\-_.\/\\,|+*#@!~]/g, '');

  str = str
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶٧٨٩'.indexOf(d)));

  const enToArMap: Record<string, string> = {
    'A': 'ا', 'B': 'ب', 'C': 'س', 'D': 'د', 'E': 'ي', 'F': 'ف',
    'G': 'ج', 'H': 'ه', 'I': 'ي', 'J': 'ج', 'K': 'ك', 'L': 'ل',
    'M': 'م', 'N': 'ن', 'O': 'و', 'P': 'ب', 'Q': 'ق', 'R': 'ر',
    'S': 'س', 'T': 'ط', 'U': 'و', 'V': 'ف', 'W': 'و', 'X': 'س',
    'Y': 'ي', 'Z': 'ز'
  };
  str = str.replace(/[A-Z]/g, (char) => enToArMap[char] || '');

  const arNormalizeMap: Record<string, string> = {
    'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ء': 'ا',
    'ة': 'ت',
    'ى': 'ي', 'ئ': 'ي', 'ی': 'ي',
    'ؤ': 'و',
    'ك': 'ك', 'ک': 'ك',
    'پ': 'ب', 'چ': 'ج', 'ژ': 'ز', 'گ': 'ك', 'ڤ': 'ف',
  };
  str = str.replace(/./g, (char) => arNormalizeMap[char] || char);

  const letters = str.replace(/[^ \u0600-\u06FF]/g, '').replace(/\s+/g, '');
  const digits = str.replace(/[^0-9]/g, '');

  if (!letters && !digits) return '';
  if (!letters) return `_${digits}`;
  if (!digits) return `${letters}_`;

  return `${letters}_${digits}`;
};

export const normalizePlate = (plate?: string): string => {
  return getPlateFingerprint(plate);
};

export const normalizePhone = (phone?: string): string => {
  if (!phone) return '';
  let clean = phone.replace(/[^\d]/g, '');
  if (clean.startsWith('0020')) clean = clean.substring(4);
  else if (clean.startsWith('20')) clean = clean.substring(2);
  if (!clean.startsWith('0') && clean.length === 10) clean = '0' + clean;
  return clean.substring(0, 11);
};

const samePlate = (a?: string, b?: string) =>
  normalizePlate(a) !== '' && normalizePlate(a) === normalizePlate(b);
const getMs = (value?: number) => { if (typeof value === 'number') return value; return 0; };

const dedupeActiveSessions = (list: ParkingSession[]): ParkingSession[] => {
  const active = list.filter((s) => s.status === 'active');
  const completed = list.filter((s) => s.status === 'completed');
  const bestByPlateSource = new Map<string, ParkingSession>();

  for (const session of active) {
    const plate = normalizePlate(session.carPlate);
    if (!plate) continue;
    const key = `${plate}::${session.garageId}::${session.source}`;
    const existing = bestByPlateSource.get(key);
    if (!existing) { bestByPlateSource.set(key, session); continue; }
    const sessionSynced = session.synced === true;
    const existingSynced = existing.synced === true;
    if (sessionSynced && !existingSynced) {
      bestByPlateSource.set(key, session);
    } else if (!sessionSynced && existingSynced) {
      // keep
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
  payment_mode: r.payment_mode || 'both',
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

  const isFree = r.is_first_free_session === true || r.is_first_free_session === 'true' || r.is_first_free_session === 1;

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
    freeMinutesApplied: r.free_minutes_applied != null ? Number(r.free_minutes_applied) : 0,
    isFirstFreeSession: isFree,
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
  bonusAmount: r.bonus_amount != null ? Number(r.bonus_amount) : 0,
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
let walletDeductedAt = 0;
let walletDeductLock = false;
const deletedSessionIds = new Set<string>();
const locallyEndedSessions = new Map<string, ParkingSession>();

// ===================== State Interface =====================
interface AppState {
  view: ViewType;
  setView: (v: ViewType) => void;
  screen: ScreenType;
  setScreen: (s: ScreenType) => void;
  currentUser: any;
  setCurrentUser: (u: any) => void;
  deductWallet: (amount: number) => Promise<boolean>;
  markFreeSessionUsed: () => Promise<void>;
  garages: Garage[];
  currentGarageId: string | null;
  setCurrentGarageId: (id: string | null) => void;
  addGarage: (g: any) => Promise<void>;
  updateGarage: (id: string, updates: any) => Promise<void>;
  adjustGarageSpots: (id: string, delta: number) => Promise<void>;
  selectedGarageId: string | null;
  setSelectedGarageId: (id: string | null) => void;
  getMyOwnedGarages: (phone: string) => Garage[];
  sessions: ParkingSession[];
  acknowledgedSessionIds: Set<string>;
  acknowledgeSession: (id: string) => void;
  addSession: (s: Omit<ParkingSession, 'id'>) => Promise<string>;
  endSession: (id: string, totalPrice: number, paymentMethod: string, freeMinutesApplied?: number, addedBy?: string) => Promise<void>;
  cancelSession: (id: string) => void;
  removeSession: (id: string) => Promise<void>;
  confirmRevenue: (sessionId: string) => Promise<void>;
  unconfirmRevenue: (sessionId: string) => Promise<void>;
  assignSessionToValet: (sessionId: string, valetName: string) => Promise<void>;
  offers: Offer[];
  addOffer: (o: any) => void;
  updateOffer: (id: string, status: Offer['status'], counterPrice?: number) => void;
  cancelOffer: (id: string) => void;
  walletTopUps: WalletTopUp[];
  addWalletTopUp: (w: any) => void;
  approveTopUp: (id: string) => Promise<void>;
  rejectTopUp: (id: string) => Promise<void>;
  incomingCars: IncomingCar[];
  addIncomingCar: (c: any) => Promise<void>;
  removeIncomingCar: (id: string) => Promise<void>;
  messages: Message[];
  addMessage: (m: any) => Promise<any>;
  replyMessage: (id: string, reply: string) => Promise<void>;
  closeMessage: (id: string) => Promise<void>;
  fetchAll: () => Promise<void>;
  logout: () => void;
}

// ===================== Store =====================
export const useStore = create<AppState>((set, get) => ({
  view: (() => { try { return (localStorage.getItem('appView') as ViewType) || 'user'; } catch { return 'user'; } })(),
  setView: (v) => { set({ view: v }); localStorage.setItem('appView', v); },

  screen: (() => { try { return (localStorage.getItem('appScreen') as ScreenType) || 'splash'; } catch { return 'splash'; } })(),
  setScreen: (s) => { set({ screen: s }); localStorage.setItem('appScreen', s); },

  currentUser: safeGetStorage('currentUser'),

  setCurrentUser: async (u) => {
    if (!u) { set({ currentUser: null }); safeRemoveStorage('currentUser'); return; }
    const cleanPlate = getPlateFingerprint(u.carPlate);
    const cleanPhone = normalizePhone(u.phone);

    const cleanUser = {
      name: u.name || '',
      phone: cleanPhone,
      carPlate: cleanPlate,
      wallet: u.wallet ?? 0,
      hasUsedFreeSession: u.hasUsedFreeSession ?? false,
      bonusBalance: u.bonusBalance ?? 0,
    };
    set({ currentUser: cleanUser }); safeSetStorage('currentUser', cleanUser);
  },

  deductWallet: async (amount) => {
    if (walletDeductLock) return false;
    const user = get().currentUser;
    if (!user || amount <= 0) return false;
    if ((user.wallet || 0) < amount) return false;

    try {
      walletDeductLock = true;
      if (isSupabaseConfigured()) {
        const { data: userData } = await supabase.from('users').select('wallet').eq('phone', user.phone).single();
        if (userData && Number(userData.wallet || 0) >= amount) {
          const newWallet = Number(userData.wallet) - amount;
          await supabase.from('users').update({ wallet: newWallet }).eq('phone', user.phone);
          const updated = { ...user, wallet: newWallet };
          set({ currentUser: updated });
          safeSetStorage('currentUser', updated);
          walletDeductedAt = Date.now();
          return true;
        }
      }
      return false;
    } finally {
      walletDeductLock = false;
    }
  },

  markFreeSessionUsed: async () => {
    const user = get().currentUser;
    if (!user || user.hasUsedFreeSession) return;
    const updated = { ...user, hasUsedFreeSession: true };
    set({ currentUser: updated });
    safeSetStorage('currentUser', updated);
    if (isSupabaseConfigured()) {
      await supabase.from('users').update({ has_used_free_session: true }).eq('phone', user.phone);
    }
  },

  garages: [],
  currentGarageId: (() => { try { return localStorage.getItem('currentGarageId') || null; } catch { return null; } })(),
  setCurrentGarageId: (id) => { set({ currentGarageId: id }); if (id) localStorage.setItem('currentGarageId', id); else localStorage.removeItem('currentGarageId'); },

  selectedGarageId: (() => { try { return localStorage.getItem('selectedGarageId') || null; } catch { return null; } })(),
  setSelectedGarageId: (id) => { set({ selectedGarageId: id }); if (id) localStorage.setItem('selectedGarageId', id); else localStorage.removeItem('selectedGarageId'); },

  getMyOwnedGarages: (phone: string) => {
    if (!phone) return [];
    const normalizedPhone = normalizePhone(phone);
    return get().garages.filter((g) =>
      normalizePhone(g.ownerPhone || '') === normalizedPhone || normalizePhone(g.phone) === normalizedPhone
    );
  },

  sessions: [],
  acknowledgedSessionIds: new Set<string>(),
  acknowledgeSession: (id) => {},

  offers: [], walletTopUps: [], incomingCars: [], messages: [],

  logout: () => {
    set({ currentUser: null, currentGarageId: null, selectedGarageId: null, view: 'user', screen: 'splash' });
    safeRemoveStorage('currentUser'); safeRemoveStorage('appView'); safeRemoveStorage('appScreen');
    safeRemoveStorage('currentGarageId'); safeRemoveStorage('selectedGarageId');
    safeRemoveStorage('garageRole'); safeRemoveStorage('valetNumber'); safeRemoveStorage('valetName');
  },

  fetchAll: async () => {
    if (!isSupabaseConfigured()) return;

    const [g, activeAndUnsettledRes, recentSettledRes, o, w, ic, msgs] = await Promise.all([
      supabase.from('garages').select('*'),
      supabase.from('sessions').select('*').or('status.eq.active,settled.eq.false,settled.is.null').order('created_at', { ascending: false }).limit(50),
      supabase.from('sessions').select('*').eq('settled', true).eq('status', 'completed').order('created_at', { ascending: false }).limit(20),
      supabase.from('offers').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('wallet_topups').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('incoming_cars').select('*').order('created_at', { ascending: false }),
      supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(20),
    ]);

    const activeAndUnsettled = activeAndUnsettledRes.data ? activeAndUnsettledRes.data.map(mapSession) : [];
    const recentSettled = recentSettledRes.data ? recentSettledRes.data.map(mapSession) : [];
    const sessionsMap = new Map<string, ParkingSession>();
    [...activeAndUnsettled, ...recentSettled].forEach((s) => { sessionsMap.set(s.id, s); });
    const supabaseSessions = Array.from(sessionsMap.values());

    set({
      garages: g.data?.length ? g.data.map(mapGarage) : get().garages,
      sessions: dedupeActiveSessions(supabaseSessions),
      offers: o.data ? o.data.map(mapOffer) : get().offers,
      walletTopUps: w.data ? w.data.map(mapTopUp) : get().walletTopUps,
      incomingCars: ic.data ? ic.data.map(mapIncoming).filter(c => c.status === 'coming') : get().incomingCars,
      messages: msgs.data ? msgs.data.map(mapMessage) : get().messages,
    });
  },

  addGarage: async (g) => {},
  updateGarage: async (id, updates) => {
    set((st) => ({ garages: st.garages.map((g) => g.id === id ? { ...g, ...updates } : g) }));
    if (!isSupabaseConfigured()) return;
    const db: any = {};
    if (updates.basePrice !== undefined) db.base_price = updates.basePrice;
    if (updates.availableSpots !== undefined) db.available_spots = updates.availableSpots;
    if (updates.capacity !== undefined) db.capacity = updates.capacity;
    if (updates.valet1Active !== undefined) db.valet1_active = updates.valet1Active;
    if (updates.valet2Active !== undefined) db.valet2_active = updates.valet2Active;
    if (updates.valet3Active !== undefined) db.valet3_active = updates.valet3Active;
    if (updates.valetName1 !== undefined) db.valet_name_1 = updates.valetName1;
    if (updates.valetPassword1 !== undefined) db.valet_password_1 = updates.valetPassword1;
    if (updates.valetName2 !== undefined) db.valet_name_2 = updates.valetName2;
    if (updates.valetPassword2 !== undefined) db.valet_password_2 = updates.valetPassword2;
    if (updates.valetName3 !== undefined) db.valet_name_3 = updates.valetName3;
    if (updates.valetPassword3 !== undefined) db.valet_password_3 = updates.valetPassword3;
    if (updates.payment_mode !== undefined) db.payment_mode = updates.payment_mode;
    await supabase.from('garages').update(db).eq('id', id);
  },

  adjustGarageSpots: async (id, delta) => {
    set((st) => ({
      garages: st.garages.map((g) => g.id === id ? { ...g, availableSpots: Math.max(0, Math.min(g.capacity, g.availableSpots + delta)) } : g)
    }));
    if (isSupabaseConfigured()) {
      await supabase.rpc('adjust_spots', { garage_uuid: id, delta });
    }
  },

  addSession: async (s) => {
    const normalizedPlate = normalizePlate(s.carPlate);
    if (!normalizedPlate) return '';
    const sessionId = crypto.randomUUID();

    // السايس المسند صراحة
    const addedByValue = (s as any).addedBy || '';

    const optimisticSession: ParkingSession = {
      ...s,
      id: sessionId,
      carPlate: normalizedPlate,
      startTime: Date.now(),
      synced: false,
      revenueConfirmed: false,
      addedBy: addedByValue,
      commissionAmount: 0,
      netRevenue: 0,
      settled: false,
      isFirstFreeSession: s.isFirstFreeSession ?? false,
      freeMinutesApplied: 0,
    };

    set((st) => ({ sessions: dedupeActiveSessions([optimisticSession, ...st.sessions]) }));
    await get().adjustGarageSpots(s.garageId, -1);

    if (isSupabaseConfigured()) {
      const { data } = await supabase.from('sessions').insert({
        id: sessionId,
        garage_id: s.garageId,
        car_plate: normalizedPlate,
        start_time: new Date().toISOString(),
        status: s.status,
        source: s.source,
        agreed_price: s.agreedPrice ?? null,
        revenue_confirmed: false,
        added_by: addedByValue || null,
        customer_phone: (s as any).customerPhone || null,
        customer_name: (s as any).customerName || null,
        started_by: (s as any).startedBy || null,
        is_first_free_session: s.isFirstFreeSession ?? false,
      }).select().single();
      if (data) return data.id;
    }
    return sessionId;
  },

  // 🌟 تعديل صارم: إنهاء الجلسة يربط اسم السايس المرسل (سايس 3) مباشرة وبشكل قاطع
  endSession: async (id, totalPrice, paymentMethod, freeMinutesApplied = 0, addedBy) => {
    const now = Date.now();
    const session = get().sessions.find((s) => s.id === id);
    if (!session) return;

    const safeTotalPrice = Number(totalPrice) > 0 ? Number(totalPrice) : 0;
    const garage = get().garages.find((g) => g.id === session.garageId);
    const commissionRate = garage?.commissionRate ?? 10;
    const isAppSession = session.source === 'app';
    const commissionAmount = isAppSession ? Math.round(((safeTotalPrice * commissionRate) / 100) * 100) / 100 : 0;
    const netRevenue = Math.round((safeTotalPrice - commissionAmount) * 100) / 100;
    const isAutoConfirmed = paymentMethod === 'wallet';

    // 🌟 السايس المنفذ للعملية حالياً (إذا لم يُرسل، نأخذه من session.addedBy)
    const finalValet = (addedBy && addedBy.trim()) ? addedBy.trim() : (session.addedBy || '');

    const endedSession: ParkingSession = {
      ...session,
      endTime: now,
      totalPrice: safeTotalPrice,
      paymentMethod,
      status: 'completed',
      revenueConfirmed: isAutoConfirmed,
      commissionAmount,
      netRevenue,
      settled: false,
      freeMinutesApplied: freeMinutesApplied || 0,
      addedBy: finalValet, // 🌟 يثبت فوراً لسايس 3
    };

    set((st) => ({ sessions: st.sessions.map((s) => (s.id === id ? endedSession : s)) }));
    await get().adjustGarageSpots(session.garageId, +1);

    if (paymentMethod === 'wallet' && isAppSession) {
      await get().deductWallet(safeTotalPrice);
    }

    if (isSupabaseConfigured()) {
      await supabase.from('sessions').update({
        end_time: new Date(now).toISOString(),
        total_price: safeTotalPrice,
        payment_method: paymentMethod,
        status: 'completed',
        revenue_confirmed: isAutoConfirmed,
        commission_amount: commissionAmount,
        net_revenue: netRevenue,
        settled: false,
        free_minutes_applied: freeMinutesApplied || 0,
        added_by: finalValet || null, // 🌟 يكتب مباشرة في قاعدة البيانات
      }).eq('id', id);

      setTimeout(() => { get().fetchAll(); }, 1000);
    }
  },

  confirmRevenue: async (sessionId) => {
    set((st) => ({ sessions: st.sessions.map((s) => (s.id === sessionId ? { ...s, revenueConfirmed: true } : s)) }));
    if (isSupabaseConfigured()) {
      await supabase.from('sessions').update({ revenue_confirmed: true }).eq('id', sessionId);
    }
  },

  unconfirmRevenue: async (sessionId) => {
    set((st) => ({ sessions: st.sessions.map((s) => (s.id === sessionId ? { ...s, revenueConfirmed: false } : s)) }));
    if (isSupabaseConfigured()) {
      await supabase.from('sessions').update({ revenue_confirmed: false }).eq('id', sessionId);
    }
  },

  assignSessionToValet: async (sessionId: string, valetName: string) => {
    if (!sessionId || !valetName) return;
    set((st) => ({
      sessions: st.sessions.map((s) => (s.id === sessionId ? { ...s, addedBy: valetName } : s)),
    }));
    if (isSupabaseConfigured()) {
      await supabase.from('sessions').update({ added_by: valetName }).eq('id', sessionId);
    }
  },

  cancelSession: (id) => {
    set((st) => ({ sessions: st.sessions.filter((s) => s.id !== id) }));
    if (isSupabaseConfigured()) supabase.from('sessions').delete().eq('id', id);
  },

  removeSession: async (id) => {
    set((st) => ({ sessions: st.sessions.filter((s) => s.id !== id) }));
    if (isSupabaseConfigured()) supabase.from('sessions').delete().eq('id', id);
  },

  addOffer: () => {}, updateOffer: () => {}, cancelOffer: () => {},
  addWalletTopUp: () => {}, approveTopUp: async () => {}, rejectTopUp: async () => {},
  addIncomingCar: async () => {}, removeIncomingCar: async () => {},
  addMessage: async () => ({ success: true }), replyMessage: async () => {}, closeMessage: async () => {},
}));

export function pausePolling(duration = 5000) {}
export function setupRealtime() {
  if (!isSupabaseConfigured()) return;
  const channel = supabase.channel('parkn24_realtime');
  ['sessions', 'garages', 'incoming_cars', 'offers', 'wallet_topups'].forEach((table) => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
      useStore.getState().fetchAll();
    });
  });
  channel.subscribe();
}