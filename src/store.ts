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
  
  // 🌟 حقول منظومة الدليل والتصويت التشاركي النظيفة
  garageType?: 'partner' | 'directory';
  priceType?: 'hourly' | 'daily' | 'monthly';
  dailyPrice?: number;
  monthlyPrice?: number;
  pendingPriceVotes?: number;
  voterPhones?: string;
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

// ===================== 🎁 نظام الشرائح والهدايا =====================

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

// ===================== 🛡️ الحماية الأمنية =====================

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
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};

const safeRemoveStorage = (key: string) => {
  try { localStorage.removeItem(key); } catch {}
};

const safeGetStorage = (key: string) => {
  try { const item = localStorage.getItem(key); return item ? JSON.parse(item) : null; } catch { return null; }
};

export const getPlateFingerprint = (plate?: any): string => {
  if (!plate) return '';
  let str = String(plate).trim();
  str = str.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '');
  str = str.replace(/\u0640/g, '');
  str = str.normalize('NFKD');
  str = str.replace(/[\u064B-\u065F\u0670\u0654\u0655\u0653]/g, '');

  const easternDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '٧', '٨', '٩'];
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

export const normalizePlate = (plate?: any): string => getPlateFingerprint(plate);

export const normalizePhone = (phone?: any): string => {
  if (!phone) return '';
  let str = String(phone).trim();
  const arabicNums = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  for (let i = 0; i < 10; i++) str = str.replace(new RegExp(arabicNums[i], 'g'), String(i));
  let clean = str.replace(/[^\d]/g, '');
  if (clean.startsWith('0020')) clean = clean.substring(4);
  else if (clean.startsWith('20')) clean = clean.substring(2);
  if ((clean.startsWith('10') || clean.startsWith('11') || clean.startsWith('12') || clean.startsWith('15')) && clean.length === 10) {
    clean = '0' + clean;
  }
  return clean.substring(0, 11);
};

const samePlate = (a?: string, b?: string) =>
  normalizePlate(a) !== '' && normalizePlate(a) === normalizePlate(b);

const getMs = (value?: number | string) => { 
  if (!value) return 0;
  if (typeof value === 'number') return value < 1_000_000_000_000 ? value * 1000 : value;
  if (typeof value === 'string') {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0; 
};

// ===================== ⏱️ مزامنة توقيت السيرفر الذكية والخفيفة =====================
let serverTimeOffset = 0;
let lastClockSyncTime = 0;

export const syncServerClock = async () => {
  if (Date.now() - lastClockSyncTime < 15 * 60 * 1000 || !isSupabaseConfigured()) return;
  
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
      lastClockSyncTime = Date.now();
    }
  } catch {}
};

export const getServerNow = (): number => Date.now() + serverTimeOffset;

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
    if (session.synced && !existing.synced) {
      bestByPlateSource.set(key, session);
    } else if (!session.synced && existing.synced) {
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
    const aTime = a.status === 'active' ? getMs(a.startTime) : getMs(a.endTime);
    const bTime = b.status === 'active' ? getMs(b.startTime) : getMs(b.endTime);
    return bTime - aTime;
  });
};

// 🌟 الـ Mapper النظيف والمحترف: يقرأ من الأعمدة المخصصة مباشرة
const mapGarage = (r: any): Garage => {
  const isDirectory = r.garage_type === 'directory';

  return {
    id: r.id, 
    name: r.name, 
    username: r.username || '', 
    phone: r.phone || '',
    ownerPhone: r.owner_phone || r.phone || '',
    location: r.location || '', 
    lat: Number(r.lat) || 30.0444, 
    lng: Number(r.lng) || 31.2357, 
    capacity: Number(r.capacity) || 50,
    availableSpots: Number(r.available_spots ?? r.capacity ?? 50), 
    basePrice: Number(r.base_price || 15),
    rating: Number(r.rating || 4.5),
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

    // 🌟 ربط مباشر وحقيقي مع أعمدة الداتابيز النظيفة
    garageType: isDirectory ? 'directory' : 'vip',
    priceType: r.price_type || 'hourly',
    dailyPrice: r.daily_price != null ? Number(r.daily_price) : undefined,
    monthlyPrice: r.monthly_price != null ? Number(r.monthly_price) : undefined,
    pendingPriceVotes: r.pending_price_votes != null ? Number(r.pending_price_votes) : undefined,
    voterPhones: r.voter_phones || '',
  };
};

const mapSession = (r: any): ParkingSession => {
  const rawStart = r.start_time;
  const startTime = typeof rawStart === 'string' ? rawStart : new Date(getMs(rawStart) || getServerNow()).toISOString();
  const rawEnd = r.end_time;
  const endTime = rawEnd ? (typeof rawEnd === 'string' ? rawEnd : new Date(getMs(rawEnd)).toISOString()) : undefined;

  const isApp = r.source === 'app';
  const isFree = isApp && (r.is_first_free_session === true || r.is_first_free_session === 'true' || r.is_first_free_session === 1);

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

const sessionStartLocks = new Set<string>();
const sessionEndLocks = new Set<string>();
let walletDeductLock = false;

const resolveAddedBy = (explicitAddedBy?: string): string => {
  if (explicitAddedBy) return explicitAddedBy;
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
  setCurrentUser: (u: any) => Promise<void>;
  deductWallet: (amount: number) => Promise<boolean>; 
  markFreeSessionUsed: () => Promise<void>;
  garages: Garage[];
  currentGarageId: string | null;
  setCurrentGarageId: (id: string | null) => void;
  addGarage: (g: any) => Promise<void>;
  updateGarage: (id: string, updates: any) => Promise<void>;
  adjustGarageSpots: (id: string, delta: number) => Promise<void>;
  reportPriceUpdate: (garageId: string, newPrice: number, priceType?: string) => Promise<void>; // تحديث السعر
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
  addMessage: (m: any) => Promise<{ success: boolean; error?: string }>;
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
      const { data: existingUser } = await supabase
        .from('users')
        .select('wallet, name, phone, car_plate, has_used_free_session, bonus_balance')
        .eq('phone', cleanPhone)
        .maybeSingle();

      const finalHasUsedFree = existingUser?.has_used_free_session === true;

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
      } else {
        const { data: newUser } = await supabase
          .from('users')
          .insert({
            name: cleanName,
            phone: cleanPhone,
            car_plate: cleanPlate,
            wallet: cleanUser.wallet ?? 0,
            has_used_free_session: false,
            bonus_balance: 0,
          })
          .select()
          .single();

        if (newUser) {
          const updated = {
            name: newUser.name,
            phone: newUser.phone,
            carPlate: newUser.car_plate,
            wallet: Number(newUser.wallet),
            hasUsedFreeSession: false,
            bonusBalance: 0,
          };
          set({ currentUser: updated }); safeSetStorage('currentUser', updated);
        }
      }
    } catch (err) { console.error('Error setting user:', err); }
  },

  deductWallet: async (amount) => {
    if (walletDeductLock) return false;
    const user = get().currentUser;
    if (!user || amount <= 0 || (user.wallet || 0) < amount) return false;

    try {
      walletDeductLock = true;
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase.rpc('deduct_wallet_atomic', {
          p_phone: user.phone,
          p_amount: Math.floor(Number(amount)),
        });

        if (!error && data?.success) {
          const updated = { ...user, wallet: Number(data.new_wallet) };
          set({ currentUser: updated });
          safeSetStorage('currentUser', updated);
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
    const np = normalizePhone(phone);
    return get().garages.filter((g) => normalizePhone(g.ownerPhone || '') === np || normalizePhone(g.phone) === np);
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
      try { localStorage.setItem('acknowledgedSessionIds', JSON.stringify(Array.from(next))); } catch {}
      return { acknowledgedSessionIds: next };
    });
  },

  offers: [], walletTopUps: [], incomingCars: [], messages: [],

  logout: () => {
    set({ currentUser: null, currentGarageId: null, selectedGarageId: null, view: 'user', screen: 'splash', acknowledgedSessionIds: new Set() });
    safeRemoveStorage('currentUser'); safeRemoveStorage('appView'); safeRemoveStorage('appScreen');
    safeRemoveStorage('currentGarageId'); safeRemoveStorage('selectedGarageId');
    safeRemoveStorage('acknowledgedSessionIds');
  },

  fetchAll: async () => {
    if (!isSupabaseConfigured()) return;

    try {
      const [g, activeSessionsRes, o, w, ic, msgs] = await Promise.all([
        supabase.from('garages').select('*'),
        supabase.from('sessions').select('*').order('created_at', { ascending: false }).limit(40),
        supabase.from('offers').select('*').order('created_at', { ascending: false }).limit(10),
        supabase.from('wallet_topups').select('*').order('created_at', { ascending: false }).limit(10),
        supabase.from('incoming_cars').select('*').order('created_at', { ascending: false }),
        supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(10),
      ]);

      const fetchedGarages = g.data?.length ? g.data.map(mapGarage) : get().garages;
      const supabaseSessions = activeSessionsRes.data ? activeSessionsRes.data.map(mapSession) : [];
      const finalSessions = dedupeActiveSessions(supabaseSessions);

      set({
        garages: fetchedGarages,
        sessions: finalSessions,
        offers: o.data ? o.data.map(mapOffer) : get().offers,
        walletTopUps: w.data ? w.data.map(mapTopUp) : get().walletTopUps,
        incomingCars: ic.data ? ic.data.map(mapIncoming).filter(c => c.status === 'coming') : get().incomingCars,
        messages: msgs.data ? msgs.data.map(mapMessage) : get().messages,
      });

      const user = get().currentUser;
      if (user?.phone) {
        const { data: userData } = await supabase
          .from('users')
          .select('wallet, has_used_free_session, bonus_balance')
          .eq('phone', user.phone)
          .maybeSingle();

        if (userData) {
          const updated = {
            ...user,
            wallet: Number(userData.wallet || 0),
            hasUsedFreeSession: userData.has_used_free_session ?? user.hasUsedFreeSession,
            bonusBalance: Number(userData.bonus_balance ?? 0),
          };
          set({ currentUser: updated });
          safeSetStorage('currentUser', updated);
        }
      }
    } catch (err) {
      console.error('FetchAll light error:', err);
    }
  },

  // 🌟 إضافة الجراج بشكل مخصص للحقول النظيفة الجديدة
  addGarage: async (g) => {
    const isDirectory = g.garageType === 'directory';
    const finalPrice = isDirectory 
      ? (g.priceType === 'daily' ? g.dailyPrice : g.priceType === 'monthly' ? g.monthlyPrice : g.basePrice)
      : g.basePrice;

    const { data, error } = await supabase.from('garages').insert({
      name: g.name, 
      username: isDirectory ? `dir_${Date.now()}` : (g.username || `g_${Date.now()}`), 
      phone: g.phone || '01000000000',
      owner_phone: g.ownerPhone || g.phone || '01000000000',
      location: isDirectory ? 'دليل ركنات مجاني' : g.location, 
      lat: g.lat, lng: g.lng,
      capacity: g.capacity || 50, 
      available_spots: g.capacity || 50, 
      base_price: finalPrice || 15, 
      rating: 4.0,
      commission_rate: isDirectory ? 0 : 10,
      valet1_active: !isDirectory, valet2_active: !isDirectory, valet3_active: !isDirectory,
      valet_name_1: isDirectory ? '' : (g.valetName1 || ''), 
      valet_password_1: isDirectory ? '' : (g.valetPassword1 || ''),
      valet_name_2: isDirectory ? '' : (g.valetName2 || ''), valet_password_2: isDirectory ? '' : (g.valetPassword2 || ''),
      valet_name_3: isDirectory ? '' : (g.valetName3 || ''), valet_password_3: isDirectory ? '' : (g.valetPassword3 || ''),
      is_active: true,
      payment_mode: isDirectory ? 'cash' : 'both', 
      area: g.area || 'مناطق أخرى',
      
      // الحقول المخصصة الجديدة
      garage_type: g.garageType || 'partner',
      price_type: g.priceType || 'hourly',
      daily_price: isDirectory && g.priceType === 'daily' ? g.dailyPrice : null,
      monthly_price: isDirectory && g.priceType === 'monthly' ? g.monthlyPrice : null,
      last_price_update: new Date().toISOString(),
      price_updated_by: 'admin',
    }).select();
    if (!error && data) set((st) => ({ garages: [...st.garages, ...data.map(mapGarage)] }));
  },

  // 🌟 تعديل الجراج بالحقول النظيفة الجديدة
  updateGarage: async (id, updates) => {
    set((st) => ({ garages: st.garages.map((g) => g.id === id ? { ...g, ...updates } : g) }));
    if (!isSupabaseConfigured()) return;

    if (updates.isActive !== undefined) {
      await supabase.from('garages').update({ is_active: updates.isActive }).eq('id', id);
      return;
    }

    const isDirectory = updates.garageType === 'directory';
    const finalPrice = isDirectory 
      ? (updates.priceType === 'daily' ? updates.dailyPrice : updates.priceType === 'monthly' ? updates.monthlyPrice : updates.basePrice)
      : updates.basePrice;

    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (finalPrice !== undefined) dbUpdates.base_price = finalPrice;
    if (updates.availableSpots !== undefined) dbUpdates.available_spots = updates.availableSpots;
    if (updates.capacity !== undefined) dbUpdates.capacity = updates.capacity;
    if (updates.commissionRate !== undefined) dbUpdates.commission_rate = updates.commissionRate;
    if (updates.payment_mode !== undefined) dbUpdates.payment_mode = updates.payment_mode; 
    if (updates.area !== undefined) dbUpdates.area = updates.area; 
    
    // دعم حقول الجدولة الجديدة
    if (updates.garageType !== undefined) dbUpdates.garage_type = updates.garageType;
    if (updates.priceType !== undefined) dbUpdates.price_type = updates.priceType;
    if (updates.dailyPrice !== undefined) dbUpdates.daily_price = updates.dailyPrice;
    if (updates.monthlyPrice !== undefined) dbUpdates.monthly_price = updates.monthlyPrice;
    if (updates.lastPriceUpdate !== undefined) dbUpdates.last_price_update = updates.lastPriceUpdate;
    if (updates.priceUpdatedBy !== undefined) dbUpdates.price_updated_by = updates.priceUpdatedBy;

    if (Object.keys(dbUpdates).length > 0) {
      await supabase.from('garages').update(dbUpdates).eq('id', id);
    }
  },

  // 🌟 نظام التصويت التشاركي النظيف القائم على أعمدة مستقلة
  reportPriceUpdate: async (garageId, newPrice, priceType = 'hourly') => {
    const garage = get().garages.find(g => g.id === garageId);
    if (!garage) return;

    const user = get().currentUser;
    const userPhone = user?.phone ? normalizePhone(user.phone) : `anon_${Date.now()}`;

    // جلب أحدث أصوات من السيرفر
    const { data: dbGarage } = await supabase
      .from('garages')
      .select('pending_price_votes, voter_phones, base_price')
      .eq('id', garageId)
      .maybeSingle();

    const pendingPrice = dbGarage?.pending_price_votes ? Number(dbGarage.pending_price_votes) : null;
    const voterPhonesStr = dbGarage?.voter_phones || '';

    let voterPhones = voterPhonesStr ? voterPhonesStr.split(',') : [];
    const threshold = 3; 

    let finalBasePrice = garage.basePrice;
    let nextPendingPrice = pendingPrice;
    let nextVoterPhonesStr = voterPhonesStr;
    let actionStatus = 'pending';

    if (pendingPrice === newPrice) {
      if (voterPhones.includes(userPhone)) {
        throw new Error('لقد قمت بالإبلاغ عن هذا السعر بالفعل! بانتظار تأكيد مستخدمين آخرين.');
      } else {
        voterPhones.push(userPhone);
        const currentVotes = voterPhones.length;

        if (currentVotes >= threshold) {
          finalBasePrice = newPrice;
          nextPendingPrice = null;
          nextVoterPhonesStr = '';
          actionStatus = 'approved';
        } else {
          nextVoterPhonesStr = voterPhones.join(',');
          actionStatus = 'voted';
        }
      }
    } else {
      nextPendingPrice = newPrice;
      nextVoterPhonesStr = userPhone;
      actionStatus = 'started';
    }

    if (finalBasePrice === newPrice) {
      set((st) => ({
        garages: st.garages.map((g) => {
          if (g.id !== garageId) return g;
          return {
            ...g,
            basePrice: finalBasePrice,
            dailyPrice: g.priceType === 'daily' ? finalBasePrice : g.dailyPrice,
          };
        }),
      }));
    }

    if (isSupabaseConfigured()) {
      const updatePayload: any = {
        pending_price_votes: nextPendingPrice,
        voter_phones: nextVoterPhonesStr,
      };

      if (finalBasePrice !== garage.basePrice) {
        updatePayload.base_price = finalBasePrice;
        if (garage.priceType === 'daily') updatePayload.daily_price = finalBasePrice;
        if (garage.priceType === 'monthly') updatePayload.monthly_price = finalBasePrice;
      }

      await supabase.from('garages').update(updatePayload).eq('id', garageId);
    }

    const votesCount = nextVoterPhonesStr ? nextVoterPhonesStr.split(',').length : 0;
    return { success: true, status: actionStatus, votes: votesCount, required: threshold };
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
      const { data } = await supabase.rpc('adjust_spots', { garage_uuid: id, delta });
      if (data != null) {
        set((st) => ({ garages: st.garages.map((g) => g.id === id ? { ...g, availableSpots: Number(data) } : g) }));
      }
    } catch {}
  },

  addSession: async (s) => {
    const normalizedPlate = normalizePlate(s.carPlate);
    if (!normalizedPlate) return '';
    const sessionId = crypto.randomUUID();
    const lockKey = `${normalizedPlate}::${s.source}`;

    if (sessionStartLocks.has(lockKey)) {
      const existing = get().sessions.find((x) => samePlate(x.carPlate, normalizedPlate) && x.status === 'active');
      return existing?.id ?? '';
    }
    sessionStartLocks.add(lockKey);

    try {
      const addedByValue = resolveAddedBy(s.addedBy);
      const isAppBooking = s.source === 'app';
      const cleanPhone = s.customerPhone ? normalizePhone(s.customerPhone) : '';
      const eligibleForFree = isAppBooking && get().currentUser?.hasUsedFreeSession !== true;
      const startTimeISO = typeof s.startTime === 'string' ? s.startTime : new Date(getServerNow()).toISOString();

      const optimisticSession: ParkingSession = {
        ...s,
        id: sessionId,
        carPlate: normalizedPlate,
        startTime: startTimeISO,
        synced: false,
        revenueConfirmed: false,
        addedBy: addedByValue,
        customerPhone: cleanPhone || undefined,
        commissionAmount: 0,
        netRevenue: 0,
        settled: false,
        isFirstFreeSession: eligibleForFree,
        freeMinutesApplied: 0,
      };

      set((st) => ({ sessions: dedupeActiveSessions([optimisticSession, ...st.sessions]) }));
      await get().adjustGarageSpots(s.garageId, -1);

      if (isSupabaseConfigured()) {
        const { data } = await supabase.from('sessions').insert({
          id: sessionId,
          garage_id: s.garageId,
          car_plate: normalizedPlate,
          start_time: startTimeISO,
          status: s.status,
          source: s.source,
          agreed_price: s.agreedPrice ?? null,
          revenue_confirmed: false,
          added_by: addedByValue,
          customer_phone: cleanPhone || null,
          customer_name: s.customerName || null,
          incoming_car_id: s.incomingCarId || null,
          started_by: s.startedBy || null,
          commission_amount: 0,
          net_revenue: 0,
          settled: false,
          is_first_free_session: eligibleForFree,
          free_minutes_applied: 0,
        }).select().single();

        if (data) {
          set((st) => ({
            sessions: dedupeActiveSessions(st.sessions.map((x) => x.id === sessionId ? mapSession(data) : x)),
          }));
        }
      }
      return sessionId;
    } finally {
      sessionStartLocks.delete(lockKey);
    }
  },

  endSession: async (id, totalPrice, paymentMethod, freeMinutesApplied = 0, addedBy) => {
    const nowISO = new Date(getServerNow()).toISOString();
    const session = get().sessions.find((s) => s.id === id);
    if (!session || session.status !== 'active') return;

    const lockKey = `${session.garageId}:${normalizePlate(session.carPlate)}`;
    if (sessionEndLocks.has(lockKey)) return;
    sessionEndLocks.add(lockKey);

    try {
      const safeTotalPrice = Number(totalPrice) > 0 ? Number(totalPrice) : 0;
      const garage = get().garages.find((g) => g.id === session.garageId);
      const commissionRate = garage?.commissionRate ?? 10;
      const isAppSession = session.source === 'app';
      const commissionAmount = isAppSession ? Math.round(((safeTotalPrice * commissionRate) / 100) * 100) / 100 : 0;
      const netRevenue = Math.round((safeTotalPrice - commissionAmount) * 100) / 100;
      const isAutoConfirmed = paymentMethod === 'wallet';
      const finalAddedBy = resolveAddedBy(addedBy ?? session.addedBy);

      const endedSession: ParkingSession = {
        ...session,
        endTime: nowISO,
        totalPrice: safeTotalPrice,
        paymentMethod,
        status: 'completed' as const,
        revenueConfirmed: isAutoConfirmed,
        commissionAmount,
        netRevenue,
        settled: false,
        freeMinutesApplied,
        addedBy: finalAddedBy,
      };

      set((st) => ({ sessions: st.sessions.map((s) => (s.id === id ? endedSession : s)) }));
      await get().adjustGarageSpots(session.garageId, +1);

      if (paymentMethod === 'wallet' && isAppSession) {
        await get().deductWallet(safeTotalPrice);
      }

      if (session.isFirstFreeSession) {
        await get().markFreeSessionUsed();
      }

      if (isSupabaseConfigured()) {
        await supabase
          .from('sessions')
          .update({
            end_time: nowISO,
            total_price: safeTotalPrice,
            payment_method: paymentMethod,
            status: 'completed',
            revenue_confirmed: isAutoConfirmed,
            commission_amount: commissionAmount,
            net_revenue: netRevenue,
            settled: false,
            free_minutes_applied: freeMinutesApplied,
            added_by: finalAddedBy || null
          })
          .eq('id', id);
      }
    } finally {
      setTimeout(() => sessionEndLocks.delete(lockKey), 500);
    }
  },

  confirmRevenue: async (sessionId, addedBy) => {
    set((st) => ({ sessions: st.sessions.map((s) => (s.id === sessionId ? { ...s, revenueConfirmed: true } : s)) }));
    if (isSupabaseConfigured()) {
      const updateData: Record<string, unknown> = { revenue_confirmed: true };
      if (addedBy) updateData.added_by = addedBy;
      await supabase.from('sessions').update(updateData).eq('id', sessionId);
    }
  },

  unconfirmRevenue: async (sessionId) => {
    set((st) => ({ sessions: st.sessions.map((s) => (s.id === sessionId ? { ...s, revenueConfirmed: false } : s)) }));
    if (isSupabaseConfigured()) {
      await supabase.from('sessions').update({ revenue_confirmed: false }).eq('id', sessionId);
    }
  },

  assignSessionToValet: async (sessionId, valetName) => {
    if (!sessionId || !valetName) return;
    set((st) => ({
      sessions: st.sessions.map((s) => (s.id === sessionId ? { ...s, addedBy: valetName } : s)),
    }));
    if (isSupabaseConfigured()) {
      await supabase.from('sessions').update({ added_by: valetName }).eq('id', sessionId);
    }
  },

  cancelSession: (id) => {
    const session = get().sessions.find((s) => s.id === id);
    set((st) => ({ sessions: st.sessions.filter((s) => s.id !== id) }));
    if (session && session.status === 'active') get().adjustGarageSpots(session.garageId, +1);
    if (isSupabaseConfigured()) supabase.from('sessions').delete().eq('id', id);
  },

  removeSession: async (id) => {
    const target = get().sessions.find((s) => s.id === id);
    set((st) => ({ sessions: st.sessions.filter((s) => s.id !== id) }));
    if (target && target.status === 'active') await get().adjustGarageSpots(target.garageId, +1);
    if (isSupabaseConfigured()) {
      await supabase.from('sessions').delete().eq('id', id);
    }
  },

  addOffer: (o) => {
    const newO: Offer = { ...o, id: uid(), timestamp: Date.now() };
    set((st) => ({ offers: [newO, ...st.offers] }));
    if (isSupabaseConfigured()) {
      supabase.from('offers').insert({
        garage_id: o.garageId, user_id: o.userId,
        car_plate: o.carPlate, offered_price: o.offeredPrice, status: o.status,
      }).select().single().then(({ data }) => {
        if (data) set((st) => ({ offers: st.offers.map((x) => (x.id === newO.id ? mapOffer(data) : x)) }));
      });
    }
  },

  updateOffer: (id, status, counterPrice) => {
    set((st) => ({ offers: st.offers.map((o) => (o.id === id ? { ...o, status, counterPrice } : o)) }));
    if (isSupabaseConfigured()) {
      const u: Record<string, unknown> = { status };
      if (counterPrice !== undefined) u.counter_price = counterPrice;
      supabase.from('offers').update(u).eq('id', id);
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
        amount: w.amount, transaction_id: w.transactionId,
        car_plate: w.carPlate, method: w.method,
      }).select().single().then(({ data }) => {
        if (data) set((st) => ({ walletTopUps: st.walletTopUps.map((x) => (x.id === newW.id ? mapTopUp(data) : x)) }));
      });
    }
  },

  approveTopUp: async (id) => {
    if (!isSupabaseConfigured()) return;
    try {
      const { data, error } = await supabase.rpc('approve_topup_atomic', { p_topup_id: id });
      if (!error && data?.success) {
        set((st) => ({
          walletTopUps: st.walletTopUps.map((w) => w.id === id ? { ...w, status: 'approved' as const, bonusAmount: data.bonus_added } : w),
        }));
        await get().fetchAll();
      }
    } catch {}
  },

  rejectTopUp: async (id) => {
    set((st) => ({
      walletTopUps: st.walletTopUps.map((w) => (w.id === id ? { ...w, status: 'rejected' as const } : w)),
    }));
    if (isSupabaseConfigured()) {
      await supabase.from('wallet_topups').update({ status: 'rejected' }).eq('id', id);
    }
  },

  addIncomingCar: async (c) => {
    const incomingId = crypto.randomUUID();
    const newC: IncomingCar = { ...c, id: incomingId, startTime: Date.now(), status: 'coming' };
    set((st) => ({ incomingCars: [newC, ...st.incomingCars] }));
    if (!isSupabaseConfigured()) return;
    try {
      const { data } = await supabase.from('incoming_cars').insert({
        id: incomingId, garage_id: c.garageId, car_plate: c.carPlate,
        customer_name: c.customerName, customer_phone: c.customerPhone,
        agreed_price: c.agreedPrice, estimated_arrival: c.estimatedArrival,
      }).select().single();
      if (data) set((st) => ({ incomingCars: st.incomingCars.map((x) => (x.id === incomingId ? mapIncoming(data) : x)) }));
    } catch {}
  },

  removeIncomingCar: async (id) => {
    set((st) => ({ incomingCars: st.incomingCars.filter((c) => c.id !== id) }));
    if (!isSupabaseConfigured()) return;
    try {
      await supabase.from('incoming_cars').delete().eq('id', id);
    } catch {}
  },

  addMessage: async (msg) => {
    const cleanMsg = {
      ...msg,
      message: sanitizeInput(msg.message),
      subject: msg.subject ? sanitizeInput(msg.subject) : undefined,
      userName: msg.userName ? sanitizeInput(msg.userName) : undefined,
    };
    const optimisticMessage: Message = { ...cleanMsg, id: uid(), status: 'pending', timestamp: Date.now() };
    set((st) => ({ messages: [optimisticMessage, ...st.messages] }));
    if (!isSupabaseConfigured()) return { success: true };
    try {
      const { data, error = null } = await supabase.from('messages').insert({
        user_phone: cleanMsg.userPhone, user_name: cleanMsg.userName ?? null,
        car_plate: cleanMsg.carPlate ?? null, type: cleanMsg.type,
        subject: cleanMsg.subject ?? null, message: cleanMsg.message,
      }).select().single();
      if (error) return { success: false, error: error.message };
      if (data) set((st) => ({ messages: st.messages.map((m) => (m.id === optimisticMessage.id ? mapMessage(data) : m)) }));
      return { success: true };
    } catch {
      return { success: false, error: 'حدث خطأ' };
    }
  },

  replyMessage: async (id, reply) => {
    const now = Date.now();
    const cleanReply = sanitizeInput(reply);
    set((st) => ({ messages: st.messages.map((msg) => (msg.id === id ? { ...msg, reply: cleanReply, status: 'replied' as const, repliedAt: now } : msg)) }));
    if (isSupabaseConfigured()) {
      await supabase.from('messages').update({ reply: cleanReply, status: 'replied', replied_at: new Date(now).toISOString() }).eq('id', id);
    }
  },

  closeMessage: async (id) => {
    set((st) => ({ messages: st.messages.map((msg) => (msg.id === id ? { ...msg, status: 'closed' as const } : msg)) }));
    if (isSupabaseConfigured()) {
      await supabase.from('messages').update({ status: 'closed' }).eq('id', id);
    }
  },
}));

// ===================== Realtime الفائق والخفيف =====================
let realtimeStarted = false;
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let isOperationInProgress = false;
let pauseTimeout: ReturnType<typeof setTimeout> | null = null;

export function pausePolling(duration = 5000) {
  if (duration <= 0) {
    isOperationInProgress = false;
    if (pauseTimeout) clearTimeout(pauseTimeout);
    return;
  }
  isOperationInProgress = true;
  if (pauseTimeout) clearTimeout(pauseTimeout);
  pauseTimeout = setTimeout(() => { isOperationInProgress = false; }, duration);
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
    }, 25000);
  };

  startPolling();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      useStore.getState().fetchAll();
    }
  });
}