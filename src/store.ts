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
  pricePerHour?: number;
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
  garageType?: 'partner' | 'directory' | 'vip';
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
  isFreeSession?: boolean;
  // ═══ 🛡️ تكلفة الدرع للجلسة (0 = مجاني، 7 = مدفوع) ═══
  shieldCost?: number;
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

// ===================== 💰 نظام الشرائح والرسوم =====================
export const TOPUP_TIERS = [
  { id: 'trial',     amount: 20,   bonus: 2,   label: '🥉 تجربة',    percentage: 10, popular: false, bookings: 7   },
  { id: 'weekly',    amount: 50,   bonus: 5,   label: '🥈 أسبوع',    percentage: 10, popular: false, bookings: 18  },
  { id: 'monthly',   amount: 100,  bonus: 15,  label: '🥇 شهر',      percentage: 15, popular: true,  bookings: 38  },
  { id: 'quarterly', amount: 250,  bonus: 50,  label: '💎 3 شهور',   percentage: 20, popular: false, bookings: 100 },
];

export const calculateBonus = (amount: number): number => {
  const eligibleTier = [...TOPUP_TIERS].reverse().find((tier) => amount >= tier.amount);
  return eligibleTier ? eligibleTier.bonus : 0;
};

// 🌟 رسوم الحجز لكل ركنة VIP
export const BOOKING_FEE = 3;

// ═══════════════════════════════════════════════════════════════
// 🛡️ ثوابت درع الحماية
// ═══════════════════════════════════════════════════════════════
export const SHIELD_COST = 7;              // سعر الدرع (ج)
export const SHIELD_FIRST_FREE = true;     // أول مرة مجاناً
export const SHIELD_GEOFENCE_RADIUS = 250; // متر (نطاق الأمان حول الجراج)

// 📍 مسافة الـ Geofencing (متر)
export const GEOFENCE_RADIUS_METERS = 100;

// 📐 حساب المسافة بين نقطتين (Haversine Formula)
export const haversineDistance = (
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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
  const billableMs = Math.max(0, durationMs - FREE_SESSION_DURATION_MS);
  const finalPrice = originalPriceCalculator(billableMs, hourlyRate);
  return {
    finalPrice,
    freeMinutes: 30,
    billableMs,
  };
};

// ===================== 🛡️ الحماية الأمنية وسرعة المعالجة =====================
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

const getCachedGarages = (): Garage[] => {
  const cached = safeGetStorage('cached_garages_v2');
  return Array.isArray(cached) ? cached : [];
};

// ⚡ تحسين فائق السرعة لدالة getPlateFingerprint و normalizePhone مع كاش O(1) لمنع تجميد الموبايل والـ CPU
const enToArMap: Record<string, string> = {
  'A': 'ا', 'B': 'ب', 'C': 'س', 'D': 'د', 'E': 'ي', 'F': 'ف',
  'G': 'ج', 'H': 'ه', 'I': 'ي', 'J': 'ج', 'K': 'ك', 'L': 'ل',
  'M': 'م', 'N': 'ن', 'O': 'و', 'P': 'ب', 'Q': 'ق', 'R': 'ر',
  'S': 'س', 'T': 'ط', 'U': 'و', 'V': 'ف', 'W': 'و', 'X': 'س',
  'Y': 'ي', 'Z': 'ز'
};

const plateFingerprintCache = new Map<string, string>();
const phoneNormalizeCache = new Map<string, string>();

export const getPlateFingerprint = (plate?: any): string => {
  if (!plate) return '';
  const raw = String(plate);
  const cached = plateFingerprintCache.get(raw);
  if (cached !== undefined) return cached;

  let str = raw.trim();
  if (!str) return '';

  // إزالة المسافات الصفرية والتطويل والتشكيل
  str = str.replace(/[\u200B-\u200D\uFEFF\u00A0\u0640]/g, '');
  str = str.normalize('NFKD');
  str = str.replace(/[\u064B-\u065F\u0670\u0654\u0655\u0653]/g, '');

  // تحويل الأرقام الشرقية والفارسية بمرور واحد O(N)
  str = str.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (ch) => String(ch.charCodeAt(0) & 0x0f));

  str = str.toUpperCase();
  str = str.replace(/[A-Z]/g, (ch) => enToArMap[ch] || '');
  str = str.replace(/[\u0622\u0623\u0625\u0671\u0672\u0673\u0675\u0627]/g, 'ا');
  str = str.replace(/[ءئ]/g, 'ي').replace(/ؤ/g, 'و');
  str = str.replace(/ة/g, 'ه');
  str = str.replace(/[ىی]/g, 'ي');
  str = str.replace(/[کگ]/g, 'ك');

  const letters = str.replace(/[^ا-ي]/g, '');
  const digits = str.replace(/[^0-9]/g, '');

  let result = '';
  if (!letters && !digits) result = '';
  else if (!letters) result = `_${digits}`;
  else if (!digits) result = `${letters}_`;
  else result = `${letters}_${digits}`;

  if (plateFingerprintCache.size > 2500) plateFingerprintCache.clear();
  plateFingerprintCache.set(raw, result);
  return result;
};

export const normalizePlate = (plate?: any): string => getPlateFingerprint(plate);

export const normalizePhone = (phone?: any): string => {
  if (!phone) return '';
  const raw = String(phone);
  const cached = phoneNormalizeCache.get(raw);
  if (cached !== undefined) return cached;

  let str = raw.trim();
  str = str.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (ch) => String(ch.charCodeAt(0) & 0x0f));
  let clean = str.replace(/[^\d]/g, '');
  if (clean.startsWith('0020')) clean = clean.substring(4);
  else if (clean.startsWith('20')) clean = clean.substring(2);
  if ((clean.startsWith('10') || clean.startsWith('11') || clean.startsWith('12') || clean.startsWith('15')) && clean.length === 10) {
    clean = '0' + clean;
  }
  const result = clean.substring(0, 11);
  if (phoneNormalizeCache.size > 2500) phoneNormalizeCache.clear();
  phoneNormalizeCache.set(raw, result);
  return result;
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

// ===================== ⏱️ مزامنة توقيت السيرفر =====================
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
    if (!existing) { 
      bestByPlateSource.set(key, session); 
      continue; 
    }
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

const mapGarage = (r: any): Garage => {
  const isDirectory = r.garage_type === 'directory' || r.type === 'directory' || r.is_vip === false;
  const resolvedBasePrice = Number(r.base_price || (isDirectory ? 20 : 15));
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
    basePrice: resolvedBasePrice,
    pricePerHour: resolvedBasePrice,
    rating: Number(r.rating || 4.5),
    valetName1: r.valet_name_1 || '', valetPassword1: r.valet_password_1 || '',
    valetName2: r.valet_name_2 || '', valetPassword2: r.valet_password_2 || '',
    valetName3: r.valet_name_3 || '', valetPassword3: r.valet_password_3 || '',
    commissionRate: Number(r.commission_rate ?? 10),
    valet1Active: r.valet1_active !== false,
    valet2Active: r.valet2_active !== false,
    valet3Active: r.valet3_active !== false,
    isActive: r.is_active !== false,
    payment_mode: isDirectory ? 'cash' : (r.payment_mode || 'both'), 
    area: r.area || 'مناطق أخرى',
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
    isFreeSession: isFree,
    shieldCost: r.shield_cost != null ? Number(r.shield_cost) : 0,
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
  bonusAmount: r.bonus_amount != null ? Number(r.bonus_amount) : calculateBonus(Number(r.amount)),
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
  type: r.type || 'inquiry', subject: r.subject, message: r.message, 
  reply: r.reply || undefined,
  status: r.reply ? 'replied' : (r.status || 'pending'), 
  timestamp: new Date(r.created_at).getTime(),
  repliedAt: r.replied_at ? new Date(r.replied_at).getTime() : undefined,
});

// ⚡ مقارنة هيكلية سريعة لمنع إعادة رسم الشاشات إذا لم تتغير البيانات
const haveSessionsChanged = (prev: ParkingSession[], next: ParkingSession[]): boolean => {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (
      a.id !== b.id ||
      a.status !== b.status ||
      a.totalPrice !== b.totalPrice ||
      a.revenueConfirmed !== b.revenueConfirmed ||
      a.addedBy !== b.addedBy ||
      a.settled !== b.settled ||
      a.shieldCost !== b.shieldCost ||
      a.endTime !== b.endTime
    ) {
      return true;
    }
  }
  return false;
};

const haveTopUpsChanged = (prev: WalletTopUp[], next: WalletTopUp[]): boolean => {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i].id !== next[i].id || prev[i].status !== next[i].status) return true;
  }
  return false;
};

const haveIncomingChanged = (prev: IncomingCar[], next: IncomingCar[]): boolean => {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i].id !== next[i].id || prev[i].agreedPrice !== next[i].agreedPrice) return true;
  }
  return false;
};

const haveMessagesChanged = (prev: Message[], next: Message[]): boolean => {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i].id !== next[i].id || prev[i].status !== next[i].status || prev[i].reply !== next[i].reply) return true;
  }
  return false;
};

const sessionStartLocks = new Set<string>();
const sessionEndLocks = new Set<string>();
let walletDeductLock = false;

// ⏱️ نظام الخنق لمنع تكرار الـ fetchAll
let isFetchingAllInProgress = false;
let lastFetchAllTime = 0;
const FETCH_ALL_THROTTLE_MS = 3500;

const resolveAddedBy = (explicitAddedBy?: string): string => {
  const valetName = localStorage.getItem('valetName') || '';
  const garageRole = localStorage.getItem('garageRole') || '';
  const valetNumber = localStorage.getItem('valetNumber') || '';
  if (explicitAddedBy) return explicitAddedBy;
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
    shieldActivated?: boolean;
    shieldPhone?: string;
    shieldCode?: string;
  } | null;
  setCurrentUser: (u: any) => Promise<void>;
  deductWallet: (amount: number) => Promise<boolean>; 
  markFreeSessionUsed: () => Promise<void>;
  
  hasPaidBookingFee: boolean;
  setHasPaidBookingFee: (paid: boolean) => void;
  dailyDeductionCount: number;
  dailyDeductionDate: string;
  getDailyDeductionCount: () => number;
  recordDeduction: () => void;
  chargeBookingFee: () => Promise<boolean>;
  refundBookingFee: () => Promise<void>;
  
  activateShield: (phone: string) => Promise<{ success: boolean; code?: string; error?: string }>;
  chargeShieldFee: () => Promise<{ success: boolean; isFree: boolean; error?: string }>;
  updateSessionShieldCost: (sessionId: string, cost: number) => Promise<void>;
  
  garages: Garage[];
  currentGarageId: string | null;
  setCurrentGarageId: (id: string | null) => void;
  addGarage: (g: any) => Promise<void>;
  updateGarage: (id: string, updates: any) => Promise<void>;
  adjustGarageSpots: (id: string, delta: number) => Promise<void>;
  reportPriceUpdate: (garageId: string, newPrice: number, priceType?: string) => Promise<any>;
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
      shieldActivated: u.shieldActivated ?? false,
      shieldPhone: u.shieldPhone ?? '',
      shieldCode: u.shieldCode ?? '',
    };
    set({ currentUser: cleanUser }); safeSetStorage('currentUser', cleanUser);
    if (!isSupabaseConfigured()) return;
    try {
      const { data: existingUser } = await supabase
        .from('users')
        .select('wallet, name, phone, car_plate, has_used_free_session, bonus_balance, shield_activated, shield_phone, shield_code')
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
          shieldActivated: existingUser.shield_activated === true,
          shieldPhone: existingUser.shield_phone || '',
          shieldCode: existingUser.shield_code || '',
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
            shieldActivated: false,
            shieldPhone: '',
            shieldCode: '',
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
  hasPaidBookingFee: false,
  setHasPaidBookingFee: (paid) => set({ hasPaidBookingFee: paid }),
  dailyDeductionCount: (() => { try { const d = localStorage.getItem('dailyDeductionDate'); const c = localStorage.getItem('dailyDeductionCount'); const today = new Date().toLocaleDateString('en-CA'); if (d === today && c) return Number(c); return 0; } catch { return 0; } })(),
  dailyDeductionDate: (() => { try { const d = localStorage.getItem('dailyDeductionDate'); const today = new Date().toLocaleDateString('en-CA'); return d === today ? d : ''; } catch { return ''; } })(),
  getDailyDeductionCount: () => {
    const today = new Date().toLocaleDateString('en-CA');
    try {
      const savedDate = localStorage.getItem('dailyDeductionDate');
      const savedCount = localStorage.getItem('dailyDeductionCount');
      if (savedDate === today && savedCount) return Number(savedCount);
    } catch {}
    return 0;
  },
  recordDeduction: () => {
    const today = new Date().toLocaleDateString('en-CA');
    const currentCount = get().getDailyDeductionCount();
    const newCount = currentCount + 1;
    set({
      dailyDeductionDate: today,
      dailyDeductionCount: newCount,
    });
    try {
      localStorage.setItem('dailyDeductionDate', today);
      localStorage.setItem('dailyDeductionCount', String(newCount));
    } catch {}
  },
  chargeBookingFee: async () => {
    const user = get().currentUser;
    if (!user) return false;
    if (get().getDailyDeductionCount() >= 2) {
      set({ hasPaidBookingFee: true });
      return true;
    }
    if ((user.wallet || 0) < BOOKING_FEE) return false;
    const success = await get().deductWallet(BOOKING_FEE);
    if (success) {
      get().recordDeduction();
      set({ hasPaidBookingFee: true });
    }
    return success;
  },
  refundBookingFee: async () => {
    const user = get().currentUser;
    if (!user) return;
    const newWallet = (user.wallet || 0) + BOOKING_FEE;
    const updated = { ...user, wallet: newWallet };
    set({ currentUser: updated });
    safeSetStorage('currentUser', updated);
    if (isSupabaseConfigured()) {
      try {
        await supabase.from('users').update({ wallet: newWallet }).eq('phone', user.phone);
      } catch (err) {
        console.error('Refund booking fee error:', err);
      }
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
  activateShield: async (phone) => {
    const user = get().currentUser;
    if (!user) return { success: false, error: 'لم يتم تسجيل الدخول' };
    const cleanPhone = normalizePhone(phone);
    if (cleanPhone.length !== 11) {
      return { success: false, error: 'رقم موبايل غير صحيح' };
    }
    if (isSupabaseConfigured() && user.carPlate) {
      try {
        const { data: existing } = await supabase
          .from('users')
          .select('shield_code, shield_phone')
          .eq('car_plate', user.carPlate)
          .eq('shield_activated', true)
          .limit(1)
          .maybeSingle();
        if (existing?.shield_code) {
          const updated = {
            ...user,
            shieldActivated: true,
            shieldPhone: cleanPhone,
            shieldCode: existing.shield_code,
          };
          set({ currentUser: updated });
          safeSetStorage('currentUser', updated);
          try {
            await supabase
              .from('users')
              .update({
                shield_activated: true,
                shield_phone: cleanPhone,
                shield_code: existing.shield_code,
              })
              .eq('phone', user.phone);
          } catch {}
          return { success: true, code: existing.shield_code };
        }
      } catch (err) {
        console.error('Shield plate lookup error:', err);
      }
    }
    const shieldCode = `SH-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const updated = {
      ...user,
      shieldActivated: true,
      shieldPhone: cleanPhone,
      shieldCode,
    };
    set({ currentUser: updated });
    safeSetStorage('currentUser', updated);
    if (isSupabaseConfigured()) {
      try {
        await supabase
          .from('users')
          .update({
            shield_activated: true,
            shield_phone: cleanPhone,
            shield_code: shieldCode,
          })
          .eq('phone', user.phone);
      } catch (err) {
        console.error('Shield activation DB error:', err);
      }
    }
    return { success: true, code: shieldCode };
  },
  chargeShieldFee: async () => {
    const user = get().currentUser;
    if (!user) return { success: false, isFree: false, error: 'لم يتم تسجيل الدخول' };
    let alreadyUsed = user.shieldActivated === true;
    if (!alreadyUsed && isSupabaseConfigured() && user.carPlate) {
      try {
        const { data } = await supabase
          .from('users')
          .select('id')
          .eq('car_plate', user.carPlate)
          .eq('shield_activated', true)
          .limit(1);
        alreadyUsed = (data?.length ?? 0) > 0;
      } catch (err) {
        console.error('Shield plate check error:', err);
      }
    }
    if (!alreadyUsed) {
      return { success: true, isFree: true };
    }
    if ((user.wallet || 0) < SHIELD_COST) {
      return { success: false, isFree: false, error: 'الرصيد غير كافي' };
    }
    const success = await get().deductWallet(SHIELD_COST);
    if (success) {
      return { success: true, isFree: false };
    }
    return { success: false, isFree: false, error: 'فشل الخصم' };
  },
  updateSessionShieldCost: async (sessionId, cost) => {
    set((st) => ({
      sessions: st.sessions.map((s) =>
        s.id === sessionId ? { ...s, shieldCost: cost } : s
      ),
    }));
    if (isSupabaseConfigured()) {
      try {
        await supabase.from('sessions').update({ shield_cost: cost }).eq('id', sessionId);
      } catch (err) {
        console.error('Update shield cost error:', err);
      }
    }
  },
  garages: getCachedGarages(),
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
    safeRemoveStorage('dailyDeductionDate');
    safeRemoveStorage('dailyDeductionCount');
  },
  fetchAll: async () => {
    if (!isSupabaseConfigured()) return;
    const now = Date.now();
    if (isFetchingAllInProgress || (now - lastFetchAllTime < FETCH_ALL_THROTTLE_MS)) {
      return;
    }
    isFetchingAllInProgress = true;
    lastFetchAllTime = now;
    try {
      let currentGarages = get().garages;
      let garagesUpdated = false;

      // 🏢 2. جلب الجراجات بذكاء وتجنب التحديث العشوائي
      if (currentGarages.length === 0) {
        const fullRes = await supabase
          .from('garages')
          .select('*')
          .eq('is_active', true)
          .limit(1000);
        if (fullRes.data?.length) {
          currentGarages = fullRes.data.map(mapGarage);
          safeSetStorage('cached_garages_v2', currentGarages);
          garagesUpdated = true;
        }
      } else {
        const lightRes = await supabase
          .from('garages')
          .select('id, available_spots, base_price, pending_price_votes, daily_price, monthly_price, is_active, payment_mode, garage_type, type, is_vip')
          .eq('is_active', true)
          .limit(1000);
        if (lightRes.data) {
          const cachedIds = new Set(currentGarages.map((g) => g.id));
          const newIds = lightRes.data.filter((r: any) => !cachedIds.has(r.id)).map((r: any) => r.id);
          let newGaragesFull: Garage[] = [];
          if (newIds.length > 0) {
            const newRes = await supabase
              .from('garages')
              .select('*')
              .in('id', newIds);
            if (newRes.data) newGaragesFull = newRes.data.map(mapGarage);
          }
          const lightMap = new Map(lightRes.data.map((r: any) => [r.id, r]));
          const nextGarages = currentGarages
            .filter((g) => {
              const update: any = lightMap.get(g.id);
              return !update || update.is_active !== false;
            })
            .map((g) => {
              const update: any = lightMap.get(g.id);
              if (update) {
                const isDirectory = update.garage_type === 'directory' || update.type === 'directory' || update.is_vip === false;
                const nextSpots = update.available_spots ?? g.availableSpots;
                const nextBasePrice = Number(update.base_price || g.basePrice);
                if (g.availableSpots !== nextSpots || g.basePrice !== nextBasePrice) {
                  garagesUpdated = true;
                }
                return {
                  ...g,
                  availableSpots: nextSpots,
                  basePrice: nextBasePrice,
                  pricePerHour: nextBasePrice,
                  pendingPriceVotes: update.pending_price_votes != null ? Number(update.pending_price_votes) : g.pendingPriceVotes,
                  dailyPrice: update.daily_price != null ? Number(update.daily_price) : g.dailyPrice,
                  monthlyPrice: update.monthly_price != null ? Number(update.monthly_price) : g.monthlyPrice,
                  isActive: update.is_active !== false,
                  payment_mode: isDirectory ? 'cash' : (update.payment_mode || g.payment_mode),
                  garageType: isDirectory ? 'directory' : 'vip',
                };
              }
              return g;
            });

          if (newGaragesFull.length > 0 || nextGarages.length !== currentGarages.length) {
            currentGarages = [...nextGarages, ...newGaragesFull];
            garagesUpdated = true;
          } else if (garagesUpdated) {
            currentGarages = nextGarages;
          }
          if (garagesUpdated) safeSetStorage('cached_garages_v2', currentGarages);
        }
      }

      // ⚡ 3. تخصيص الاستعلامات حسب الدور لمنع الحمل الزائد
      const view = get().view;
      const user = get().currentUser;
      const currentGarageId = get().currentGarageId;

      // 🛑 لو المستخدم مش مسجل دخول وهو في وضع user، لا نرهق السيرفر بالبحث عن جلسات عامة لا تخصه
      if (view === 'user' && !user) {
        if (garagesUpdated) {
          set({ garages: currentGarages });
        }
        return;
      }

      let sessionsPromise: PromiseLike<{ data: any[] | null }>;
      let topupsPromise: PromiseLike<{ data: any[] | null }>;
      let incomingPromise: PromiseLike<{ data: any[] | null }>;
      let messagesPromise: PromiseLike<{ data: any[] | null }>;

      if (view === 'user' && user) {
        const userPhone = user.phone ? normalizePhone(user.phone) : '';
        const userPlate = user.carPlate ? normalizePlate(user.carPlate) : '';

        let sQuery = supabase.from('sessions').select('*').order('created_at', { ascending: false }).limit(30);
        let icQuery = supabase.from('incoming_cars').select('*').eq('status', 'coming').order('created_at', { ascending: false }).limit(15);

        if (userPhone && userPlate) {
          sQuery = sQuery.or(`customer_phone.eq.${userPhone},car_plate.eq.${userPlate}`);
          icQuery = icQuery.or(`customer_phone.eq.${userPhone},car_plate.eq.${userPlate}`);
        } else if (userPhone) {
          sQuery = sQuery.eq('customer_phone', userPhone);
          icQuery = icQuery.eq('customer_phone', userPhone);
        } else if (userPlate) {
          sQuery = sQuery.eq('car_plate', userPlate);
          icQuery = icQuery.eq('car_plate', userPlate);
        }

        sessionsPromise = sQuery;
        incomingPromise = icQuery;
        topupsPromise = userPhone
          ? supabase.from('wallet_topups').select('*').eq('user_phone', userPhone).order('created_at', { ascending: false }).limit(10)
          : Promise.resolve({ data: null });
        messagesPromise = userPhone
          ? supabase.from('messages').select('*').eq('user_phone', userPhone).order('created_at', { ascending: false }).limit(10)
          : Promise.resolve({ data: null });
      } else if (view === 'garage' && currentGarageId) {
        sessionsPromise = supabase.from('sessions').select('*').eq('garage_id', currentGarageId).order('created_at', { ascending: false }).limit(200);
        incomingPromise = supabase.from('incoming_cars').select('*').eq('status', 'coming').eq('garage_id', currentGarageId).order('created_at', { ascending: false }).limit(30);
        // لا نرسل طلبات شبكية لـ wallet_topups و messages في وضع الجراج
        topupsPromise = Promise.resolve({ data: null });
        messagesPromise = Promise.resolve({ data: null });
      } else {
        // وضع الأدمن
        sessionsPromise = supabase.from('sessions').select('*').order('created_at', { ascending: false }).limit(500);
        topupsPromise = supabase.from('wallet_topups').select('*').order('created_at', { ascending: false }).limit(50);
        incomingPromise = supabase.from('incoming_cars').select('*').eq('status', 'coming').order('created_at', { ascending: false }).limit(50);
        messagesPromise = supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(50);
      }

      const [activeSessionsRes, w, ic, msgs] = await Promise.all([
        sessionsPromise,
        topupsPromise,
        incomingPromise,
        messagesPromise,
      ]);

      const supabaseSessions = activeSessionsRes.data ? activeSessionsRes.data.map(mapSession) : get().sessions;
      const finalSessions = dedupeActiveSessions(supabaseSessions);
      const nextTopUps = w.data ? w.data.map(mapTopUp) : get().walletTopUps;
      const nextIncoming = ic.data ? ic.data.map(mapIncoming).filter((c) => c.status === 'coming') : get().incomingCars;
      const nextMessages = msgs.data ? msgs.data.map(mapMessage) : get().messages;

      // ⚡ تحديث الـ State فقط للأجزاء التي تغيرت فعلياً لمنع إعادة الرسم العشوائية
      const statePatch: Partial<AppState> = {};
      if (garagesUpdated) statePatch.garages = currentGarages;
      if (haveSessionsChanged(get().sessions, finalSessions)) statePatch.sessions = finalSessions;
      if (w.data && haveTopUpsChanged(get().walletTopUps, nextTopUps)) statePatch.walletTopUps = nextTopUps;
      if (ic.data && haveIncomingChanged(get().incomingCars, nextIncoming)) statePatch.incomingCars = nextIncoming;
      if (msgs.data && haveMessagesChanged(get().messages, nextMessages)) statePatch.messages = nextMessages;

      if (Object.keys(statePatch).length > 0) {
        set(statePatch);
      }

      // 💳 4. تحديث بيانات المستخدم فقط عند وجود تغير حقيقي
      const currentUserInStore = get().currentUser;
      if (currentUserInStore?.phone) {
        const { data: userData } = await supabase
          .from('users')
          .select('wallet, has_used_free_session, bonus_balance, shield_activated, shield_phone, shield_code')
          .eq('phone', currentUserInStore.phone)
          .maybeSingle();
        if (userData) {
          const nextWallet = Number(userData.wallet || 0);
          const nextHasUsedFree = userData.has_used_free_session ?? currentUserInStore.hasUsedFreeSession;
          const nextBonus = Number(userData.bonus_balance ?? 0);
          const nextShieldAct = userData.shield_activated === true;
          const nextShieldPhone = userData.shield_phone || currentUserInStore.shieldPhone || '';
          const nextShieldCode = userData.shield_code || currentUserInStore.shieldCode || '';

          if (
            currentUserInStore.wallet !== nextWallet ||
            currentUserInStore.hasUsedFreeSession !== nextHasUsedFree ||
            currentUserInStore.bonusBalance !== nextBonus ||
            currentUserInStore.shieldActivated !== nextShieldAct ||
            currentUserInStore.shieldPhone !== nextShieldPhone ||
            currentUserInStore.shieldCode !== nextShieldCode
          ) {
            const updated = {
              ...currentUserInStore,
              wallet: nextWallet,
              hasUsedFreeSession: nextHasUsedFree,
              bonusBalance: nextBonus,
              shieldActivated: nextShieldAct,
              shieldPhone: nextShieldPhone,
              shieldCode: nextShieldCode,
            };
            set({ currentUser: updated });
            safeSetStorage('currentUser', updated);
          }
        }
      }
    } catch (err) {
      console.error('FetchAll Delta Sync Error:', err);
    } finally {
      isFetchingAllInProgress = false;
    }
  },
  addGarage: async (g) => {
    const isDirectory = g.garageType === 'directory';
    const finalPrice = isDirectory 
      ? (g.priceType === 'daily' ? g.dailyPrice : g.priceType === 'monthly' ? g.monthlyPrice : (g.basePrice || 20))
      : (g.basePrice || 15);
    const { data, error } = await supabase.from('garages').insert({
      name: g.name, 
      username: isDirectory ? `dir_${Date.now()}` : (g.username || `g_${Date.now()}`), 
      phone: g.phone || '01000000000',
      owner_phone: g.ownerPhone || g.phone || '01000000000',
      location: isDirectory ? 'دليل ركنات مجاني' : g.location, 
      lat: g.lat, lng: g.lng,
      capacity: g.capacity || 50, 
      available_spots: g.capacity || 50, 
      base_price: finalPrice, 
      rating: 4.0,
      commission_rate: isDirectory ? 0 : 10,
      valet1_active: !isDirectory, valet2_active: !isDirectory, valet3_active: !isDirectory,
      valet_name_1: isDirectory ? '' : (g.valetName1 || ''), 
      valet_password_1: isDirectory ? '' : (g.valetPassword1 || ''),
      valet_name_2: isDirectory ? '' : (g.valetName2 || ''), valet_password_2: isDirectory ? '' : (g.valetPassword2 || ''),
      valet_name_3: isDirectory ? '' : (g.valetName3 || ''), valet_password_3: isDirectory ? '' : (g.valetPassword3 || ''),
      is_active: true,
      payment_mode: isDirectory ? 'cash' : (g.payment_mode || 'both'), 
      type: isDirectory ? 'directory' : 'vip',  
      is_vip: isDirectory ? false : true,       
      area: g.area || 'مناطق أخرى',
      garage_type: isDirectory ? 'directory' : 'partner',
      price_type: g.priceType || 'hourly',
      daily_price: isDirectory && g.priceType === 'daily' ? g.dailyPrice : null,
      monthly_price: isDirectory && g.priceType === 'monthly' ? g.monthlyPrice : null,
      last_price_update: new Date().toISOString(),
      price_updated_by: 'admin',
    }).select();
    
    if (!error && data) {
      const newG = data.map(mapGarage);
      set((st) => {
        const updated = [...st.garages, ...newG];
        safeSetStorage('cached_garages_v2', updated);
        return { garages: updated };
      });
    }
  },
  updateGarage: async (id, updates) => {
    set((st) => {
      const updated = st.garages.map((g) => {
        if (g.id !== id) return g;
        const nextBase = updates.basePrice !== undefined ? Number(updates.basePrice) : g.basePrice;
        return { ...g, ...updates, basePrice: nextBase, pricePerHour: nextBase };
      });
      safeSetStorage('cached_garages_v2', updated);
      return { garages: updated };
    });
    if (!isSupabaseConfigured()) return;
    const isDirectory = updates.garageType === 'directory';
    const finalPrice = isDirectory 
      ? (updates.priceType === 'daily' ? updates.dailyPrice : updates.priceType === 'monthly' ? updates.monthlyPrice : (updates.basePrice || 20))
      : updates.basePrice;
    const dbUpdates: Record<string, unknown> = {};
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (finalPrice !== undefined) dbUpdates.base_price = finalPrice;
    if (updates.availableSpots !== undefined) dbUpdates.available_spots = updates.availableSpots;
    if (updates.capacity !== undefined) dbUpdates.capacity = updates.capacity;
    if (updates.commissionRate !== undefined) dbUpdates.commission_rate = updates.commissionRate;
    if (updates.payment_mode !== undefined) dbUpdates.payment_mode = isDirectory ? 'cash' : updates.payment_mode; 
    if (updates.area !== undefined) dbUpdates.area = updates.area; 
    
    if (updates.garageType !== undefined) {
      dbUpdates.garage_type = updates.garageType;
      dbUpdates.type = updates.garageType === 'directory' ? 'directory' : 'vip';
      dbUpdates.is_vip = updates.garageType !== 'directory';
      if (updates.garageType === 'directory') {
        if (dbUpdates.commission_rate === undefined) dbUpdates.commission_rate = 0;
        if (dbUpdates.payment_mode === undefined) dbUpdates.payment_mode = 'cash';
      } else {
        if (dbUpdates.commission_rate === undefined) dbUpdates.commission_rate = 10;
      }
    }
    
    if (updates.priceType !== undefined) dbUpdates.price_type = updates.priceType;
    if (updates.dailyPrice !== undefined) dbUpdates.daily_price = updates.dailyPrice;
    if (updates.monthlyPrice !== undefined) dbUpdates.monthly_price = updates.monthlyPrice;
    if (updates.lastPriceUpdate !== undefined) dbUpdates.last_price_update = updates.lastPriceUpdate;
    if (updates.priceUpdatedBy !== undefined) dbUpdates.price_updated_by = updates.priceUpdatedBy;
    if (Object.keys(dbUpdates).length > 0) {
      await supabase.from('garages').update(dbUpdates).eq('id', id);
    }
  },
  reportPriceUpdate: async (garageId, newPrice, priceType = 'hourly') => {
    const garage = get().garages.find(g => g.id === garageId);
    if (!garage) return;
    const user = get().currentUser;
    const userPhone = user?.phone ? normalizePhone(user.phone) : `anon_${Date.now()}`;
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
            pricePerHour: finalBasePrice,
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
    set((st) => {
      const updated = st.garages.map((g) => g.id === id ? { ...g, availableSpots: Math.max(0, Math.min(g.capacity, g.availableSpots + delta)) } : g);
      safeSetStorage('cached_garages_v2', updated);
      return { garages: updated };
    });
    if (!isSupabaseConfigured()) return;
    try {
      const { data } = await supabase.rpc('adjust_spots', { garage_uuid: id, delta });
      if (data != null) {
        set((st) => ({ garages: st.garages.map((g) => g.id === id ? { ...g, availableSpots: Number(data) } : g) }));
      }
    } catch {}
  },
  addSession: async (s) => {
    if (sessionStartLocks.size > 50) sessionStartLocks.clear();
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
      let eligibleForFree = false;
      const explicitFreeFlag = s.isFirstFreeSession ?? (s as any).isFreeSession;
      if (isAppBooking) {
        if (explicitFreeFlag !== undefined) {
          eligibleForFree = Boolean(explicitFreeFlag);
        } else if (isSupabaseConfigured() && (cleanPhone || normalizedPlate)) {
          try {
            const now = new Date(getServerNow());
            const todayStart = new Date(now);
            todayStart.setHours(0, 0, 0, 0);
            const todayStartISO = todayStart.toISOString();
            const { data: todayAll } = cleanPhone
              ? await supabase
                  .from('sessions')
                  .select('id, is_first_free_session')
                  .eq('customer_phone', cleanPhone)
                  .gte('created_at', todayStartISO)
                  .limit(50)
              : await supabase
                  .from('sessions')
                  .select('id, is_first_free_session')
                  .eq('car_plate', normalizedPlate)
                  .gte('created_at', todayStartISO)
                  .limit(50);
            const freeCount = todayAll?.filter((row: any) =>
              row.is_first_free_session === true || row.is_first_free_session === 'true'
            ).length || 0;
            const paidCount = (todayAll?.length || 0) - freeCount;
            eligibleForFree = paidCount >= 2;
          } catch (err) {
            eligibleForFree = false;
          }
        }
      }
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
        isFreeSession: eligibleForFree,
        freeMinutesApplied: 0,
        shieldCost: (s as any).shieldCost ?? 0, 
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
          agreed_price: s.agreedPrice != null ? Number(s.agreedPrice) : null,
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
          shield_cost: (s as any).shieldCost ?? 0,
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
    if (sessionEndLocks.size > 50) sessionEndLocks.clear();
    const nowISO = new Date(getServerNow()).toISOString();
    const session = get().sessions.find((s) => s.id === id);
    if (!session || session.status !== 'active') return;
    const lockKey = `${session.garageId}:${normalizePlate(session.carPlate)}`;
    if (sessionEndLocks.has(lockKey)) return;
    sessionEndLocks.add(lockKey);
    try {
      const safeTotalPrice = Number.isFinite(Number(totalPrice)) && Number(totalPrice) > 0
        ? Math.round(Number(totalPrice) * 100) / 100
        : 0;
      const garage = get().garages.find((g) => g.id === session.garageId);
      const commissionRate = Number(garage?.commissionRate ?? 10);
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
      if (paymentMethod === 'wallet' && isAppSession && safeTotalPrice > 0) {
        await get().deductWallet(safeTotalPrice);
      }
      if (session.isFirstFreeSession || session.isFreeSession) {
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
            added_by: finalAddedBy || null,
            shield_cost: session.shieldCost ?? 0,
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
    set((st) => ({ offers: [newO, ...st.offers].slice(0, 20) }));
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
    const bonus = w.bonus ?? w.bonusAmount ?? calculateBonus(w.amount);
    const newW: WalletTopUp = { ...w, id: uid(), status: 'pending', timestamp: Date.now(), bonusAmount: bonus };
    set((st) => ({ walletTopUps: [newW, ...st.walletTopUps].slice(0, 20) }));
    if (isSupabaseConfigured()) {
      supabase.from('wallet_topups').insert({
        user_id: w.userId || w.user_id, 
        user_name: w.userName, 
        user_phone: w.userPhone || w.phone,
        amount: w.amount, 
        transaction_id: w.transactionId || 'instapay_transfer',
        car_plate: w.carPlate, 
        method: w.method || w.paymentMethod || 'instapay', 
        bonus_amount: bonus,
      }).select().single().then(({ data }) => {
        if (data) set((st) => ({ walletTopUps: st.walletTopUps.map((x) => (x.id === newW.id ? mapTopUp(data) : x)) }));
      });
    }
  },
  approveTopUp: async (id) => {
    const target = get().walletTopUps.find((w) => w.id === id);
    if (!target || target.status !== 'pending') return;
    const bonus = target.bonusAmount ?? calculateBonus(target.amount);
    const totalCredit = target.amount + bonus;
    const userPhone = normalizePhone(target.userPhone || '');
    set((st) => ({
      walletTopUps: st.walletTopUps.map((w) =>
        w.id === id ? { ...w, status: 'approved' as const, bonusAmount: bonus } : w
      ),
    }));
    if (isSupabaseConfigured()) {
      try {
        await supabase
          .from('wallet_topups')
          .update({ status: 'approved', bonus_amount: bonus })
          .eq('id', id);
        if (userPhone) {
          const { data: u } = await supabase
            .from('users')
            .select('wallet')
            .eq('phone', userPhone)
            .maybeSingle();
          if (u) {
            const newWallet = Number(u.wallet || 0) + totalCredit;
            await supabase
              .from('users')
              .update({ wallet: newWallet })
              .eq('phone', userPhone);
          }
        }
      } catch (err) {
        console.error('Approve error:', err);
        set((st) => ({
          walletTopUps: st.walletTopUps.map((w) =>
            w.id === id ? { ...w, status: 'pending' as const } : w
          ),
        }));
        throw err;
      }
    }
    const currentUser = get().currentUser;
    if (currentUser && normalizePhone(currentUser.phone) === userPhone) {
      const updated = { ...currentUser, wallet: (currentUser.wallet || 0) + totalCredit };
      set({ currentUser: updated });
      safeSetStorage('currentUser', updated);
    }
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
    set((st) => ({ incomingCars: [newC, ...st.incomingCars].slice(0, 30) }));
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
    set((st) => ({ messages: [optimisticMessage, ...st.messages].slice(0, 20) }));
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

// ===================== Realtime الفائق =====================
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