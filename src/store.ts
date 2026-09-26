// src/store.ts
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
  area?: string;
}

export interface ParkingSession {
  id: string;
  garageId: string;
  carPlate: string;
  startTime: number | string;
  endTime?: number | string;
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
  securityShieldActive?: boolean;
  isBreached?: boolean;
  magneticBaseline?: number;
  shieldAnchorLat?: number;
  shieldAnchorLng?: number;
  shieldActivatedAt?: string | number;
  shieldLocked?: boolean;
  responsibleValet?: string;
  valetNumber?: number;
  slotId?: string;
  breachReason?: string;
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
  securityShieldActive?: boolean;
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

const sanitizeInput = (input: string): string => {
  if (!input) return '';
  return input
    .replace(/[<>'"]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .replace(/&/g, '&amp;')
    .trim()
    .substring(0, 200);
};

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

export const haversineDistanceMeters = (
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const getPlateFingerprint = (plate?: any): string => {
  if (!plate) return '';
  let str = String(plate).trim();

  str = str.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '');
  str = str.replace(/\u0640/g, '');
  str = str.normalize('NFKD');
  str = str.replace(/[\u064B-\u065F\u0670\u0654\u0655\u0653]/g, '');

  const easternDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  for (let i = 0; i <= 9; i++) {
    str = str.split(easternDigits[i]).join(String(i));
    str = str.split(persianDigits[i]).join(String(i));
  }

  str = str.toUpperCase();
  const enToAr: Record<string, string> = {
    'A': 'ا', 'B': 'ب', 'C': 'س', 'D': 'د', 'E': 'ي', 'F': 'ف',
    'G': 'ج', 'H': 'ه', 'I': 'ي', 'J': 'ج', 'K': 'ك', 'L': 'ل',
    'M': 'م', 'N': 'ن', 'O': 'و', 'P': 'ب', 'Q': 'ق', 'R': 'ر',
    'S': 'س', 'T': 'ط', 'U': 'و', 'V': 'ف', 'W': 'و', 'X': 'س',
    'Y': 'ي', 'Z': 'ز'
  };
  str = str.replace(/[A-Z]/g, (ch) => enToAr[ch] || '');

  str = str.replace(/[\u0622\u0623\u0625\u0671\u0672\u0673\u0675\u0627]/g, 'ا');
  str = str.replace(/[ءئ]/g, 'ي').replace(/ؤ/g, 'و');
  str = str.replace(/ة/g, 'ه');
  str = str.replace(/[ىی]/g, 'ي');
  str = str.replace(/[کگ]/g, 'ك');

  const letters = str.replace(/[^ا-ي]/g, '');
  const digits = str.replace(/[^0-9]/g, '');

  if (!letters && !digits) return '';
  if (!letters) return `_${digits}`;
  if (!digits) return `${letters}_`;

  return `${letters}_${digits}`;
};

export const normalizePlate = (plate?: any): string => {
  return getPlateFingerprint(plate);
};

export const normalizePhone = (phone?: any): string => {
  if (!phone) return '';
  let str = String(phone).trim();

  const arabicNums = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  for (let i = 0; i < 10; i++) {
    str = str.replace(new RegExp(arabicNums[i], 'g'), String(i));
  }

  let clean = str.replace(/[^\d]/g, '');

  if (clean.startsWith('0020')) clean = clean.substring(4);
  else if (clean.startsWith('20')) clean = clean.substring(2);

  if ((clean.startsWith('10') || clean.startsWith('11') || clean.startsWith('12') || clean.startsWith('15')) && clean.length === 10) {
    clean = '0' + clean;
  }

  return clean.substring(0, 11);
};

export const isValidEgyptianPhone = (phone: string): boolean => {
  const clean = normalizePhone(phone);
  return /^01[0125][0-9]{8}$/.test(clean);
};

const samePlate = (a?: string, b?: string) =>
  normalizePlate(a) !== '' && normalizePlate(a) === normalizePlate(b);

const getMs = (value?: number | string) => { 
  if (!value) return 0;
  if (typeof value === 'number') {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0; 
};

let serverTimeOffset = 0;

export const syncServerClock = async () => {
  if (!isSupabaseConfigured()) return;
  try {
    const t0 = Date.now();
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/garages?select=id&limit=1`, {
      method: 'HEAD',
      headers: { 
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` 
      }
    });
    const t1 = Date.now();
    const serverDateHeader = resp.headers.get('date');
    if (serverDateHeader) {
      const roundTrip = (t1 - t0) / 2;
      const serverTimestamp = new Date(serverDateHeader).getTime() + roundTrip;
      serverTimeOffset = serverTimestamp - Date.now();
    }
  } catch (e) {
    // Fallback
  }
};

export const getServerNow = (): number => {
  return Date.now() + serverTimeOffset;
};

syncServerClock();

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
    bestByPlateSource.set(key, session);
  }

  return [...Array.from(bestByPlateSource.values()), ...completed].sort((a, b) => {
    const aTime = a.status === 'active' ? getMs(a.startTime) : typeof a.endTime === 'number' || typeof a.endTime === 'string' ? getMs(a.endTime) : 0;
    const bTime = b.status === 'active' ? getMs(b.startTime) : typeof b.endTime === 'number' || typeof b.endTime === 'string' ? getMs(b.endTime) : 0;
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
  area: r.area || 'مناطق أخرى', 
});

const mapSession = (r: any): ParkingSession => {
  const nowMs = getServerNow();
  const rawStart = r.start_time;
  let startTime = typeof rawStart === 'string' ? rawStart : new Date(nowMs).toISOString();
  let endTime = r.end_time ? (typeof r.end_time === 'string' ? r.end_time : new Date(r.end_time).toISOString()) : undefined;
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
    securityShieldActive: r.security_shield_active ?? false,
    isBreached: r.is_breached ?? false,
    magneticBaseline: r.magnetic_baseline != null ? Number(r.magnetic_baseline) : undefined,
    shieldAnchorLat: r.shield_anchor_lat != null ? Number(r.shield_anchor_lat) : undefined,
    shieldAnchorLng: r.shield_anchor_lng != null ? Number(r.shield_anchor_lng) : undefined,
    shieldActivatedAt: r.shield_activated_at || undefined,
    shieldLocked: r.shield_locked ?? false,
    responsibleValet: r.responsible_valet || undefined,
    valetNumber: r.valet_number != null ? Number(r.valet_number) : undefined,
    slotId: r.slot_id || undefined,
    breachReason: r.breach_reason || undefined,
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
  securityShieldActive: r.security_shield_active ?? false,
});

const mapMessage = (r: any): Message => ({
  id: r.id, userPhone: r.user_phone, userName: r.user_name, carPlate: r.car_plate,
  type: r.type || 'inquiry', subject: r.subject, message: r.message, reply: r.reply,
  status: r.status || 'pending', timestamp: new Date(r.created_at).getTime(),
  repliedAt: r.replied_at ? new Date(r.replied_at).getTime() : undefined,
});

let walletDeductedAt = 0;
let walletDeductLock = false;

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

// ===================== State Interface =====================
interface AppState {
  view: ViewType;
  setView: (v: ViewType) => void;
  screen: ScreenType;
  setScreen: (s: ScreenType) => void;
  currentUser: {
    name: string;
    phone: string;
    carPlate: string;
    wallet: number;
    hasUsedFreeSession?: boolean;
    bonusBalance?: number;
  } | null;
  setCurrentUser: (u: {
    name: string;
    phone: string;
    carPlate: string;
    wallet: number;
    hasUsedFreeSession?: boolean;
    bonusBalance?: number;
  } | null) => void;
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
  confirmRevenue: (sessionId: string, addedBy?: string) => Promise<void>;
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
  fetchAll: () => Promise<void>;
  logout: () => void;
  setSessionSecurityShield: (sessionId: string, active: boolean, lat?: number, lng?: number, magneticVal?: number) => Promise<void>;
  activateShield: (sessionId: string, clientLat: number, clientLng: number, garageLat: number, garageLng: number, magnetic: number, bleId?: string) => Promise<{ success: boolean; reason?: string; distance?: number }>;
  triggerSessionBreach: (sessionId: string, isBreached: boolean, reason?: string) => Promise<void>;
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
    const cleanPlate = getPlateFingerprint(u.carPlate);
    const cleanPhone = normalizePhone(u.phone);
    const cleanName = sanitizeInput(u.name);

    const cleanUser = {
      name: cleanName,
      phone: cleanPhone,
      carPlate: cleanPlate,
      wallet: u.wallet ?? 0,
      hasUsedFreeSession: u.hasUsedFreeSession ?? false,
      bonusBalance: u.bonusBalance ?? 0,
    };
    set({ currentUser: cleanUser }); safeSetStorage('currentUser', cleanUser);

    if (!isSupabaseConfigured()) return;

    try {
      let alreadyUsedFree = false;
      const { data: existingUser } = await supabase
        .from('users')
        .select('wallet, name, phone, car_plate, has_used_free_session, bonus_balance')
        .eq('phone', cleanPhone)
        .maybeSingle();

      if (existingUser?.has_used_free_session === true) {
        alreadyUsedFree = true;
      }

      const finalHasUsedFree = alreadyUsedFree || (existingUser?.has_used_free_session === true);

      if (existingUser) {
        const updated = {
          name: existingUser.name || cleanName,
          phone: cleanPhone,
          carPlate: cleanPlate,
          wallet: Number(existingUser.wallet || 0),
          hasUsedFreeSession: finalHasUsedFree,
          bonusBalance: Number(existingUser.bonus_balance ?? 0),
        };
        set({ currentUser: updated }); safeSetStorage('currentUser', updated);
        await supabase.from('users').update({
          name: cleanName,
          car_plate: cleanPlate,
          has_used_free_session: finalHasUsedFree
        }).eq('phone', cleanPhone);
      } else {
        await supabase.from('users').insert({
          name: cleanName,
          phone: cleanPhone,
          car_plate: cleanPlate,
          wallet: cleanUser.wallet ?? 0,
          has_used_free_session: finalHasUsedFree,
          bonus_balance: 0,
        });
      }
    } catch (err) { console.error('Error setting user:', err); }
  },

  deductWallet: async (amount) => {
    if (walletDeductLock) return false;
    const user = get().currentUser;
    if (!user || amount <= 0) return false;

    if ((user.wallet || 0) < amount) return false;

    try {
      walletDeductLock = true;
      if (isSupabaseConfigured()) {
        const newWallet = (user.wallet || 0) - amount;
        await supabase.from('users').update({ wallet: newWallet }).eq('phone', user.phone);
        const updated = { ...user, wallet: newWallet };
        set({ currentUser: updated });
        safeSetStorage('currentUser', updated);
        walletDeductedAt = Date.now();
        return true;
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
    if (!isSupabaseConfigured()) return;
    await supabase.from('users').update({ has_used_free_session: true }).eq('phone', user.phone);
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
      } catch (e) {}
      return { acknowledgedSessionIds: next };
    });
  },

  offers: [], walletTopUps: [], incomingCars: [], messages: [],

  logout: () => {
    set({ currentUser: null, currentGarageId: null, selectedGarageId: null, view: 'user', screen: 'splash', acknowledgedSessionIds: new Set() });
    safeRemoveStorage('currentUser'); safeRemoveStorage('appView'); safeRemoveStorage('appScreen');
    safeRemoveStorage('currentGarageId'); safeRemoveStorage('selectedGarageId');
    safeRemoveStorage('garageRole'); safeRemoveStorage('valetNumber'); safeRemoveStorage('valetName');
  },

  // 🌟 جلب شامل وسريع جداً وتحديث مباشر للحالة
  fetchAll: async () => {
    if (!isSupabaseConfigured()) return;

    try {
      const [g, sRes, o, w, ic, msgs] = await Promise.all([
        supabase.from('garages').select('*'),
        supabase.from('sessions').select('*').order('created_at', { ascending: false }).limit(60),
        supabase.from('offers').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('wallet_topups').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('incoming_cars').select('*').order('created_at', { ascending: false }),
        supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(20),
      ]);

      const fetchedGarages = g.data?.length ? g.data.map(mapGarage) : get().garages;
      const fetchedSessions = sRes.data ? sRes.data.map(mapSession) : get().sessions;
      const fetchedCars = ic.data ? ic.data.map(mapIncoming).filter((c) => c.status === 'coming') : (get().incomingCars ?? []);

      set({
        garages: fetchedGarages,
        sessions: dedupeActiveSessions(fetchedSessions),
        offers: o.data ? o.data.map(mapOffer) : (get().offers ?? []),
        walletTopUps: w.data ? w.data.map(mapTopUp) : (get().walletTopUps ?? []),
        incomingCars: fetchedCars,
        messages: msgs.data ? msgs.data.map(mapMessage) : (get().messages ?? []),
      });
    } catch (err) {
      console.error('fetchAll Error:', err);
    }
  },

  addGarage: async (g) => {
    const { data, error } = await supabase.from('garages').insert({
      name: g.name, username: g.username, phone: g.phone,
      owner_phone: g.ownerPhone || g.phone,
      location: g.location, lat: g.lat, lng: g.lng,
      capacity: g.capacity, available_spots: g.capacity, base_price: g.basePrice, rating: 4.0,
      commission_rate: 10,
      valet1_active: true, valet2_active: true, valet3_active: true,
      valet_name_1: g.valetName1 || '', valet_password_1: g.valetPassword1 || '',
      valet_name_2: g.valetName2 || '', valet_password_2: g.valetPassword2 || '',
      valet_name_3: g.valetName3 || '', valet_password_3: g.valetPassword3 || '',
      is_active: true,
      payment_mode: 'both', 
      area: g.area || 'مناطق أخرى', 
    }).select();
    if (!error && data) set((st) => ({ garages: [...st.garages, ...data.map(mapGarage)] }));
  },

  updateGarage: async (id, updates) => {
    set((st) => ({ garages: st.garages.map((g) => g.id === id ? { ...g, ...updates } : g) }));
    if (!isSupabaseConfigured()) return;
    await supabase.from('garages').update(updates).eq('id', id);
    await get().fetchAll();
  },

  adjustGarageSpots: async (id, delta) => {
    set((st) => ({
      garages: st.garages.map((g) => {
        if (g.id !== id) return g;
        return { ...g, availableSpots: Math.max(0, Math.min(g.capacity, g.availableSpots + delta)) };
      }),
    }));
    if (!isSupabaseConfigured()) return;
    await supabase.rpc('adjust_spots', { garage_uuid: id, delta });
  },

  addSession: async (s) => {
    const normalizedPlate = normalizePlate(s.carPlate);
    if (!normalizedPlate) return '';
    const sessionId = crypto.randomUUID();
    const addedByValue = resolveAddedBy((s as any).addedBy);
    const startTimeISO = typeof s.startTime === 'string' ? s.startTime : new Date(getServerNow()).toISOString();

    const optimisticSession: ParkingSession = {
      ...s,
      id: sessionId,
      carPlate: normalizedPlate,
      startTime: startTimeISO,
      synced: false,
      revenueConfirmed: false,
      addedBy: addedByValue,
      commissionAmount: 0,
      netRevenue: 0,
      settled: false,
    };

    set((st) => ({ sessions: dedupeActiveSessions([optimisticSession, ...st.sessions]) }));
    await get().adjustGarageSpots(s.garageId, -1);

    if (isSupabaseConfigured()) {
      await supabase.from('sessions').insert({
        id: sessionId,
        garage_id: s.garageId,
        car_plate: normalizedPlate,
        start_time: startTimeISO,
        status: s.status,
        source: s.source,
        agreed_price: s.agreedPrice ?? null,
        revenue_confirmed: false,
        added_by: addedByValue,
        customer_phone: (s as any).customerPhone || null,
        customer_name: (s as any).customerName || null,
        incoming_car_id: (s as any).incomingCarId || null,
        started_by: (s as any).startedBy || null,
        is_first_free_session: s.isFirstFreeSession ?? false,
        security_shield_active: s.securityShieldActive ?? false,
        slot_id: s.slotId ?? null,
      });
      // تحديث فوري مباشر
      get().fetchAll();
    }

    return sessionId;
  },

  endSession: async (id, totalPrice, paymentMethod, freeMinutesApplied = 0, addedBy) => {
    const nowISO = new Date(getServerNow()).toISOString();
    const session = get().sessions.find((s) => s.id === id);
    if (!session || session.status !== 'active') return;

    const safeTotalPrice = Number(totalPrice) > 0 ? Number(totalPrice) : 0;
    const garage = get().garages.find((g) => g.id === session.garageId);
    const commissionRate = garage?.commissionRate ?? 10;
    const isAppSession = session.source === 'app';
    
    const isShieldActive = isAppSession && (session.securityShieldActive === true);
    const shieldTimeOnlyPrice = isShieldActive ? Math.max(0, safeTotalPrice - 10) : safeTotalPrice;
    const timeCommission = isAppSession ? Math.round(((shieldTimeOnlyPrice * commissionRate) / 100) * 100) / 100 : 0;
    const commissionAmount = timeCommission + (isShieldActive ? 5 : 0);
    const netRevenue = Math.round((safeTotalPrice - commissionAmount) * 100) / 100;

    const endedSession: ParkingSession = {
      ...session,
      endTime: nowISO,
      totalPrice: safeTotalPrice,
      paymentMethod,
      status: 'completed',
      revenueConfirmed: paymentMethod === 'wallet',
      commissionAmount,
      netRevenue,
      settled: false,
      freeMinutesApplied,
      addedBy: resolveAddedBy(addedBy ?? session.addedBy),
    };

    set((st) => ({ sessions: st.sessions.map((s) => (s.id === id ? endedSession : s)) }));
    await get().adjustGarageSpots(session.garageId, +1);

    if (paymentMethod === 'wallet' && isAppSession) {
      await get().deductWallet(safeTotalPrice);
    }

    if (isSupabaseConfigured()) {
      await supabase.from('sessions').update({
        end_time: nowISO,
        total_price: safeTotalPrice,
        payment_method: paymentMethod,
        status: 'completed',
        revenue_confirmed: paymentMethod === 'wallet',
        commission_amount: commissionAmount,
        net_revenue: netRevenue,
        settled: false,
        free_minutes_applied: freeMinutesApplied,
        added_by: endedSession.addedBy || null
      }).eq('id', id);

      get().fetchAll();
    }
  },

  confirmRevenue: async (sessionId, addedBy) => {
    set((st) => ({ sessions: st.sessions.map((s) => (s.id === sessionId ? { ...s, revenueConfirmed: true } : s)) }));
    if (!isSupabaseConfigured()) return;
    await supabase.from('sessions').update({ revenue_confirmed: true, added_by: addedBy || null }).eq('id', sessionId);
  },

  unconfirmRevenue: async (sessionId) => {
    set((st) => ({ sessions: st.sessions.map((s) => (s.id === sessionId ? { ...s, revenueConfirmed: false } : s)) }));
    if (!isSupabaseConfigured()) return;
    await supabase.from('sessions').update({ revenue_confirmed: false }).eq('id', sessionId);
  },

  assignSessionToValet: async (sessionId, valetName) => {
    set((st) => ({ sessions: st.sessions.map((s) => (s.id === sessionId ? { ...s, addedBy: valetName } : s)) }));
    if (!isSupabaseConfigured()) return;
    await supabase.from('sessions').update({ added_by: valetName }).eq('id', sessionId);
  },

  cancelSession: (id) => {
    const session = get().sessions.find((s) => s.id === id);
    set((st) => ({ sessions: st.sessions.filter((s) => s.id !== id) }));
    if (session?.status === 'active') get().adjustGarageSpots(session.garageId, +1);
    if (isSupabaseConfigured()) supabase.from('sessions').delete().eq('id', id);
  },

  removeSession: async (id) => {
    set((st) => ({ sessions: st.sessions.filter((s) => s.id !== id) }));
    if (isSupabaseConfigured()) supabase.from('sessions').delete().eq('id', id);
  },

  addOffer: (o) => {
    const newO: Offer = { ...o, id: uid(), timestamp: Date.now() };
    set((st) => ({ offers: [newO, ...st.offers] }));
    if (isSupabaseConfigured()) {
      supabase.from('offers').insert({
        garage_id: o.garageId, user_id: o.userId, car_plate: o.carPlate, offered_price: o.offeredPrice, status: o.status,
      });
    }
  },

  updateOffer: (id, status, counterPrice) => {
    set((st) => ({ offers: st.offers.map((o) => (o.id === id ? { ...o, status, counterPrice } : o)) }));
    if (isSupabaseConfigured()) {
      supabase.from('offers').update({ status, counter_price: counterPrice }).eq('id', id);
    }
  },

  cancelOffer: (id) => {
    set((st) => ({ offers: st.offers.filter((o) => o.id !== id) }));
    if (isSupabaseConfigured()) supabase.from('offers').delete().eq('id', id);
  },

  addWalletTopUp: (w) => {
    const newW: WalletTopUp = { ...w, id: uid(), status: 'pending', timestamp: Date.now() };
    set((st) => ({ walletTopUps: [newW, ...st.walletTopUps] }));
    if (isSupabaseConfigured()) {
      supabase.from('wallet_topups').insert({
        user_id: w.userId, user_name: w.userName, user_phone: w.userPhone,
        amount: w.amount, transaction_id: w.transactionId, car_plate: w.carPlate, method: w.method,
      });
    }
  },

  approveTopUp: async (id) => {
    if (!isSupabaseConfigured()) return;
    await supabase.rpc('approve_topup_atomic', { p_topup_id: id });
    await get().fetchAll();
  },

  rejectTopUp: async (id) => {
    set((st) => ({ walletTopUps: st.walletTopUps.map((w) => (w.id === id ? { ...w, status: 'rejected' as const } : w)) }));
    if (!isSupabaseConfigured()) return;
    await supabase.from('wallet_topups').update({ status: 'rejected' }).eq('id', id);
  },

  // 🚀 إضافة سيارة قادمة وإذاعتها فوراً
  addIncomingCar: async (c) => {
    const incomingId = crypto.randomUUID();
    const newC: IncomingCar = { ...c, id: incomingId, startTime: Date.now(), status: 'coming', securityShieldActive: c.securityShieldActive ?? false };
    set((st) => ({ incomingCars: [newC, ...st.incomingCars] }));
    
    if (isSupabaseConfigured()) {
      await supabase.from('incoming_cars').insert({
        id: incomingId, 
        garage_id: c.garageId, 
        car_plate: c.carPlate,
        customer_name: c.customerName, 
        customer_phone: c.customerPhone,
        agreed_price: c.agreedPrice, 
        estimated_arrival: c.estimatedArrival,
        security_shield_active: c.securityShieldActive ?? false,
      });
      get().fetchAll();
    }
  },

  removeIncomingCar: async (id) => {
    set((st) => ({ incomingCars: st.incomingCars.filter((c) => c.id !== id) }));
    if (isSupabaseConfigured()) {
      await supabase.from('incoming_cars').delete().eq('id', id);
      get().fetchAll();
    }
  },

  addMessage: async (msg) => {
    const optimisticMessage: Message = { ...msg, id: uid(), status: 'pending', timestamp: Date.now() };
    set((st) => ({ messages: [optimisticMessage, ...(st.messages ?? [])] }));
    if (isSupabaseConfigured()) {
      await supabase.from('messages').insert({
        user_phone: msg.userPhone, user_name: msg.userName ?? null,
        car_plate: msg.carPlate ?? null, type: msg.type,
        subject: msg.subject ?? null, message: msg.message,
      });
    }
    return { success: true };
  },

  replyMessage: async (id, reply) => {
    set((st) => ({ messages: (st.messages ?? []).map((msg) => (msg.id === id ? { ...msg, reply, status: 'replied' as const } : msg)) }));
    if (isSupabaseConfigured()) {
      await supabase.from('messages').update({ reply, status: 'replied' }).eq('id', id);
    }
  },

  closeMessage: async (id) => {
    set((st) => ({ messages: (st.messages ?? []).map((msg) => (msg.id === id ? { ...msg, status: 'closed' as const } : msg)) }));
    if (isSupabaseConfigured()) {
      await supabase.from('messages').update({ status: 'closed' }).eq('id', id);
    }
  },

  setSessionSecurityShield: async (sessionId, active, lat, lng, magneticVal) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              securityShieldActive: active,
              shieldAnchorLat: lat,
              shieldAnchorLng: lng,
              magneticBaseline: magneticVal || 65,
              isBreached: false,
            }
          : s
      ),
    }));

    if (isSupabaseConfigured()) {
      await supabase.from('sessions').update({
        security_shield_active: active,
        magnetic_baseline: magneticVal || 65,
        shield_anchor_lat: lat,
        shield_anchor_lng: lng,
        is_breached: false,
      }).eq('id', sessionId);
    }
  },

  activateShield: async (sessionId, clientLat, clientLng, garageLat, garageLng, magnetic, bleId) => {
    const validGarageLat = parseFloat(String(garageLat || 0));
    const validGarageLng = parseFloat(String(garageLng || 0));

    let dist = 0;
    if (validGarageLat !== 0 && validGarageLng !== 0) {
      dist = haversineDistanceMeters(clientLat, clientLng, validGarageLat, validGarageLng);
      if (dist > 350) {
        return { success: false, reason: 'outside_geofence', distance: Math.round(dist) };
      }
    }

    const now = Date.now();
    const nowISO = new Date(now).toISOString();

    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              securityShieldActive: true,
              shieldLocked: true,
              shieldActivatedAt: now,
              shieldAnchorLat: clientLat,
              shieldAnchorLng: clientLng,
              magneticBaseline: magnetic,
              bleDeviceId: bleId,
              isBreached: false,
            }
          : s
      ),
    }));

    if (isSupabaseConfigured()) {
      await supabase.from('sessions').update({
        security_shield_active: true,
        shield_locked: true,
        shield_activated_at: nowISO,
        shield_anchor_lat: clientLat,
        shield_anchor_lng: clientLng,
        magnetic_baseline: magnetic,
        ble_device_id: bleId,
        is_breached: false,
      }).eq('id', sessionId);
    }

    return { success: true, distance: Math.round(dist) };
  },

  triggerSessionBreach: async (sessionId, isBreached, reason) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              isBreached,
              breachReason: isBreached ? (reason || 'تم رصد حركة مريبة!') : undefined,
            }
          : s
      ),
    }));

    if (isSupabaseConfigured()) {
      await supabase.from('sessions').update({
        is_breached: isBreached,
        breach_reason: isBreached ? (reason || 'تم رصد حركة مريبة!') : null,
      }).eq('id', sessionId);
    }
  },
}));

// ===================== ⚡ Realtime الخارق (استجابة فورية في 0.3 ثانية) =====================
let realtimeStarted = false;
let pollingInterval: ReturnType<typeof setInterval> | null = null;

export function pausePolling(duration = 2000) {
  // لا حاجة لتعطيل الـ Realtime
}

export function setupRealtime() {
  if (realtimeStarted) return;
  realtimeStarted = true;

  // استطلاع احتياطي سريع كل 4 ثوانٍ فقط كأمان مضاعف
  pollingInterval = setInterval(() => {
    if (document.visibilityState === 'visible') {
      useStore.getState().fetchAll();
    }
  }, 4000);

  if (!isSupabaseConfigured()) return;

  let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastRefresh = 0;

  const instantRefresh = () => {
    const now = Date.now();
    if (now - lastRefresh < 300) return; // Debounce 300ms
    lastRefresh = now;

    if (refreshTimeout) clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(() => {
      useStore.getState().fetchAll();
    }, 250);
  };

  const channelName = `parkn24_global_live`;
  const channel = supabase.channel(channelName);

  ['sessions', 'incoming_cars', 'offers', 'garages', 'wallet_topups', 'users'].forEach((table) => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, instantRefresh);
  });

  channel.subscribe();
}