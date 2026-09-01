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

export const FREE_SESSION_DURATION_MS = 60 * 60 * 1000;

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

  const freeMs = Math.min(durationMs, FREE_SESSION_DURATION_MS);
  const billableMs = Math.max(0, durationMs - freeMs);
  const freeMinutes = Math.floor(freeMs / 60000);

  if (billableMs === 0) {
    return { finalPrice: 0, freeMinutes, billableMs: 0 };
  }

  const finalPrice = originalPriceCalculator(billableMs, hourlyRate);
  return { finalPrice, freeMinutes: 60, billableMs };
};

// ===================== 🛡️ طبقات الحماية الأمنية =====================

// 🛡️ [1] حماية من الضغط العالي (Rate Limiter)
const rateLimiter = {
  requests: 0,
  lastReset: Date.now(),
  maxRequests: 50,
  windowMs: 10000,

  canProceed(): boolean {
    const now = Date.now();
    if (now - this.lastReset > this.windowMs) {
      this.requests = 0;
      this.lastReset = now;
    }
    this.requests++;
    return this.requests <= this.maxRequests;
  }
};

// 🛡️ [2] تنظيف المدخلات من الأكواد الخبيثة (XSS Protection)
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

// 🛡️ [3] حماية من تخمين الباسوردات (Brute Force Protection)
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();

export const checkLoginAttempt = (identifier: string): boolean => {
  const now = Date.now();
  const record = loginAttempts.get(identifier);

  if (record && now - record.lastAttempt < 300000) {
    if (record.count >= 5) return false;
    record.count++;
    record.lastAttempt = now;
  } else {
    loginAttempts.set(identifier, { count: 1, lastAttempt: now });
  }
  return true;
};

export const resetLoginAttempts = (identifier: string): void => {
  loginAttempts.delete(identifier);
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

// 🛡️ [محسّن أمنياً لأقصى درجة]: تنظيف وتوحيد رقم لوحة السيارة لدمجها ومنع التكرار
const normalizePlate = (plate?: string) => {
  if (!plate) return '';
  const cleaned = sanitizeInput(plate)
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶٧٨٩'.indexOf(d)))
    .replace(/[^A-Z0-9\u0600-\u06FF]/gi, '')
    .trim()
    .toUpperCase();
  return cleaned;
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
    freeMinutesApplied: r.free_minutes_applied != null ? Number(r.free_minutes_applied) : 0,
    isFirstFreeSession: r.is_first_free_session ?? false,
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
  deductWallet: (amount: number) => void;
  markFreeSessionUsed: () => Promise<void>;
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
  acknowledgedSessionIds: Set<string>;
  acknowledgeSession: (id: string) => void;
  addSession: (s: Omit<ParkingSession, 'id'>) => Promise<string>;
  endSession: (id: string, totalPrice: number, paymentMethod: string, freeMinutesApplied?: number) => Promise<void>;
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
  fetchAll: () => Promise<void>;
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
    const cleanPlate = normalizePlate(u.carPlate);
    const cleanPhone = u.phone.replace(/[^\d+]/g, '').substring(0, 15);
    const cleanName = sanitizeInput(u.name);

    const cleanUser = {
      ...u,
      name: cleanName,
      carPlate: cleanPlate,
      phone: cleanPhone,
    };
    set({ currentUser: cleanUser }); safeSetStorage('currentUser', cleanUser);

    if (!isSupabaseConfigured()) return;

    try {
      // 🛡️ فحص ذكي في قاعدة البيانات: هل اللوحة أو التليفون مؤهلين للعرض؟
      let isEligible = true;
      try {
        const { data: eligibilityData, error: rpcError } = await supabase.rpc('check_free_eligibility', {
          p_plate: cleanPlate,
          p_phone: cleanPhone,
        });
        if (!rpcError && typeof eligibilityData === 'boolean') {
          isEligible = eligibilityData;
        }
      } catch (e) {
        console.error('Eligibility RPC check error:', e);
      }

      // فحص احتياطي مباشر
      if (isEligible && cleanPlate) {
        const { data: existingPlateSessions } = await supabase
          .from('sessions')
          .select('id')
          .eq('car_plate', cleanPlate)
          .eq('is_first_free_session', true)
          .limit(1);

        if (existingPlateSessions && existingPlateSessions.length > 0) {
          isEligible = false;
        }
      }

      const hasUsedFree = !isEligible;

      const { data: existingUser } = await supabase
        .from('users')
        .select('wallet, name, phone, car_plate, has_used_free_session, bonus_balance')
        .eq('phone', cleanPhone)
        .maybeSingle();

      const finalHasUsedFree = hasUsedFree || (existingUser?.has_used_free_session === true);

      if (existingUser) {
        const updated = {
          name: existingUser.name || cleanName,
          phone: existingUser.phone || cleanPhone,
          carPlate: existingUser.car_plate || cleanPlate,
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
        const { data: newUser } = await supabase
          .from('users')
          .insert({
            name: cleanName,
            phone: cleanPhone,
            car_plate: cleanPlate,
            wallet: cleanUser.wallet ?? 0,
            has_used_free_session: finalHasUsedFree,
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
            hasUsedFreeSession: finalHasUsedFree,
            bonusBalance: 0,
          };
          set({ currentUser: updated }); safeSetStorage('currentUser', updated);

          if (!finalHasUsedFree) {
            try {
              localStorage.setItem('showWelcomeGift', 'true');
            } catch (e) {}
          } else {
            try {
              localStorage.removeItem('showWelcomeGift');
            } catch (e) {}
          }
        }
      }
    } catch (err) { console.error('Error setting user with anti-abuse check:', err); }
  },

  // 🛡️ [RPC + Fallback]: الخصم الآمن من المحفظة مع الارتداد التلقائي للمنع من الأعطال
  deductWallet: async (amount) => {
    const user = get().currentUser;
    if (!user || amount <= 0) return;

    if (isSupabaseConfigured()) {
      try {
        // [1] محاولة الخصم عبر دالة RPC المشفرة بالسيرفر
        const { data, error } = await supabase.rpc('deduct_wallet_atomic', {
          p_phone: user.phone,
          p_amount: Math.floor(Number(amount)),
        });

        if (!error && data?.success) {
          const updated = { ...user, wallet: Number(data.new_wallet) };
          set({ currentUser: updated });
          safeSetStorage('currentUser', updated);
          walletDeductedAt = Date.now();
          return;
        }
        console.warn('RPC deduct failed/missing, rolling back to direct transaction:', error || data?.error);
      } catch (rpcErr) {
        console.warn('RPC deduct exception, fallback active:', rpcErr);
      }

      // [2] نظام الارتداد الفوري (Fallback): التحديث الآمن المباشر للفرونت إند عند عدم وجود RPC
      try {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('wallet')
          .eq('phone', user.phone)
          .single();

        if (userError || !userData) return;
        const currentWallet = Number(userData.wallet || 0);
        if (currentWallet < amount) {
          console.error('Insufficient wallet balance');
          return;
        }
        const newWallet = currentWallet - amount;
        const { error: updateError } = await supabase
          .from('users')
          .update({ wallet: newWallet })
          .eq('phone', user.phone);

        if (!updateError) {
          const updated = { ...user, wallet: newWallet };
          set({ currentUser: updated });
          safeSetStorage('currentUser', updated);
          walletDeductedAt = Date.now();
        }
      } catch (fallbackErr) {
        console.error('Wallet deduct fallback failed:', fallbackErr);
      }
    }
  },

  markFreeSessionUsed: async () => {
    const user = get().currentUser;
    if (!user || user.hasUsedFreeSession) return;

    const updated = { ...user, hasUsedFreeSession: true };
    set({ currentUser: updated });
    safeSetStorage('currentUser', updated);

    try {
      localStorage.removeItem('showWelcomeGift');
    } catch (e) {}

    if (!isSupabaseConfigured()) return;
    const { error } = await supabase
      .from('users')
      .update({ has_used_free_session: true })
      .eq('phone', user.phone);
    if (error) {
      console.error('❌ Failed to mark free session used:', error);
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
    set({ currentUser: null, currentGarageId: null, selectedGarageId: null, view: 'user', screen: 'splash', acknowledgedSessionIds: new Set() });
    safeRemoveStorage('currentUser'); safeRemoveStorage('appView'); safeRemoveStorage('appScreen');
    safeRemoveStorage('currentGarageId'); safeRemoveStorage('selectedGarageId');
    safeRemoveStorage('garageAuth'); safeRemoveStorage('adminAuth');
    safeRemoveStorage('acknowledgedSessionIds');
  },

  fetchAll: async () => {
    if (!isSupabaseConfigured()) return;

    if (!rateLimiter.canProceed()) {
      console.warn('⚠️ Rate limit exceeded, skipping fetch');
      return;
    }

    const [g, activeAndUnsettledRes, recentSettledRes, o, w, ic, msgs] = await Promise.all([
      supabase.from('garages').select('*'),
      supabase
        .from('sessions')
        .select('*')
        .or('status.eq.active,settled.eq.false,settled.is.null')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('sessions')
        .select('*')
        .eq('settled', true)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('offers').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('wallet_topups').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('incoming_cars').select('*').order('created_at', { ascending: false }),
      supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(20),
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
              isFirstFreeSession: ss.isFirstFreeSession ?? localVersion.isFirstFreeSession,
              freeMinutesApplied: ss.freeMinutesApplied ?? localVersion.freeMinutesApplied,
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
      offers: o.data ? o.data.map(mapOffer) : (get().offers ?? []),
      walletTopUps: mergedTopUps,
      incomingCars: fetchedCars,
      messages: [...mergedMessages, ...localOnlyMessages],
    });

    const user = get().currentUser;
    if (user?.phone) {
      try {
        const timeSinceDeduct = Date.now() - walletDeductedAt;
        if (timeSinceDeduct < 20000) {
          const { data } = await supabase
            .from('users')
            .select('name, phone, car_plate, has_used_free_session, bonus_balance')
            .eq('phone', user.phone)
            .single();
          if (data) {
            const updated = {
              name: data.name || user.name, phone: data.phone || user.phone,
              carPlate: data.car_plate || user.carPlate, wallet: user.wallet,
              hasUsedFreeSession: data.has_used_free_session ?? user.hasUsedFreeSession ?? false,
              bonusBalance: Number(data.bonus_balance ?? user.bonusBalance ?? 0),
            };
            set({ currentUser: updated }); safeSetStorage('currentUser', updated);
          }
        } else {
          const { data } = await supabase
            .from('users')
            .select('wallet, name, phone, car_plate, has_used_free_session, bonus_balance')
            .eq('phone', user.phone)
            .single();
          if (data) {
            const updated = {
              name: data.name || user.name, phone: data.phone || user.phone,
              carPlate: data.car_plate || user.carPlate, wallet: Number(data.wallet),
              hasUsedFreeSession: data.has_used_free_session ?? false,
              bonusBalance: Number(data.bonus_balance ?? 0),
            };
            set({ currentUser: updated }); safeSetStorage('currentUser', updated);
          }
        }
      } catch (err) { console.error('Error fetching user wallet:', err); }
    }
  },

  addGarage: async (g) => {
    const { data, error } = await supabase.from('garages').insert({
      name: g.name, username: g.username, phone: g.phone,
      owner_phone: (g as any).ownerPhone || g.phone,
      location: g.location, lat: g.lat, lng: g.lng,
      capacity: g.capacity, available_spots: g.capacity, base_price: g.basePrice, rating: 4.0,
      commission_rate: 10,
      valet1_active: true, valet2_active: true, valet3_active: true,
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
        await get().fetchAll();
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
      await get().fetchAll();
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
        if (flushError) { console.error('❌', flushError); await get().fetchAll(); return; }
        pendingGarageUpdates.delete(id);
        if (pendingGarageUpdates.size === 0 && updateGarageTimeout) { clearTimeout(updateGarageTimeout); updateGarageTimeout = null; }
      }
      const { data, error } = await supabase.rpc('adjust_spots', { garage_uuid: id, delta });
      if (error) { console.error('❌', error); await get().fetchAll(); return; }
      set((st) => ({ garages: st.garages.map((g) => g.id === id ? { ...g, availableSpots: Number(data) } : g) }));
    } catch (err) { console.error('❌', err); await get().fetchAll(); }
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
      const currentUser = get().currentUser;
      let eligibleForFree = isEligibleForFreeSession(s.source, currentUser?.hasUsedFreeSession);

      // 🛡️ فحص صارم ومباشر في قاعدة البيانات عبر الدالة الذكية check_free_eligibility
      if (eligibleForFree && isSupabaseConfigured() && s.source === 'app') {
        try {
          const cleanPhone = (s as any).customerPhone ? (s as any).customerPhone.replace(/[^\d+]/g, '') : '';
          
          const { data: isStillEligible } = await supabase.rpc('check_free_eligibility', {
            p_plate: normalizedPlate,
            p_phone: cleanPhone,
          });

          if (isStillEligible === false) {
            eligibleForFree = false;
          }
        } catch (err) {
          console.error('⚠️ Abuse protection RPC failed:', err);
        }
      }

      const optimisticSession: ParkingSession = {
        ...s, id: sessionId, carPlate: normalizedPlate,
        startTime: 0, synced: false, revenueConfirmed: false,
        addedBy: addedByValue,
        customerPhone: (s as any).customerPhone || undefined,
        customerName: (s as any).customerName || undefined,
        incomingCarId: (s as any).incomingCarId || undefined,
        startedBy: (s as any).startedBy || undefined,
        commissionAmount: 0,
        netRevenue: 0,
        settled: false,
        isFirstFreeSession: eligibleForFree,
        freeMinutesApplied: 0,
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
          customer_phone: (s as any).customerPhone || null,
          customer_name: (s as any).customerName || null,
          incoming_car_id: (s as any).incoming_car_id || null,
          started_by: (s as any).startedBy || null,
          commission_amount: 0,
          net_revenue: 0,
          settled: false,
          is_first_free_session: eligibleForFree,
          free_minutes_applied: 0,
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
  endSession: async (id, totalPrice, paymentMethod, freeMinutesApplied = 0) => {
    const now = Date.now();
    const session = get().sessions.find((s) => s.id === id);
    if (!session) { console.error('❌ الجلسة مش موجودة:', id); return; }
    if (session.status !== 'active') { console.warn('⚠️ الجلسة مش نشطة:', session.status); return; }

    const lockKey = `${session.garageId}:${normalizePlate(session.carPlate)}`;
    if (sessionEndLocks.has(lockKey)) return;
    sessionEndLocks.add(lockKey);
    pausePolling(15000);

    try {
      const safeTotalPrice = Number(totalPrice) > 0 ? Number(totalPrice) : 0;

      const garage = get().garages.find((g) => g.id === session.garageId);
      const commissionRate = garage?.commissionRate ?? 10;
      const isAppSession = session.source === 'app';
      const commissionAmount = isAppSession
        ? Math.round(((safeTotalPrice * commissionRate) / 100) * 100) / 100
        : 0;
      const netRevenue = Math.round((safeTotalPrice - commissionAmount) * 100) / 100;

      const isAutoConfirmed = paymentMethod === 'wallet';

      const endedSession: ParkingSession = {
        ...session,
        endTime: now,
        totalPrice: safeTotalPrice,
        paymentMethod,
        status: 'completed' as const,
        revenueConfirmed: isAutoConfirmed,
        commissionAmount,
        netRevenue,
        settled: false,
        freeMinutesApplied: freeMinutesApplied || session.freeMinutesApplied || 0,
      };

      locallyEndedSessions.set(id, endedSession);
      set((st) => ({ sessions: st.sessions.map((s) => (s.id === id ? endedSession : s)) }));
      await get().adjustGarageSpots(session.garageId, +1);

      if (session.isFirstFreeSession) {
        await get().markFreeSessionUsed();
      }

      if (!isSupabaseConfigured()) return;

      const { error } = await supabase
        .from('sessions')
        .update({
          end_time: new Date(now).toISOString(),
          total_price: safeTotalPrice,
          payment_method: paymentMethod,
          status: 'completed',
          revenue_confirmed: isAutoConfirmed,
          commission_amount: commissionAmount,
          net_revenue: netRevenue,
          settled: false,
          free_minutes_applied: freeMinutesApplied || session.freeMinutesApplied || 0,
        })
        .eq('id', id)
        .eq('status', 'active');

      if (error) {
        console.error('❌', error);
      } else {
        setTimeout(() => {
          locallyEndedSessions.delete(id);
        }, 10000);
      }

      setTimeout(() => {
        get().fetchAll();
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
      if (error) console.error('❌ assignSessionToValet error:', error);
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

  addOffer: (o) => {
    const newO: Offer = { ...o, id: uid(), timestamp: Date.now() };
    set((st) => ({ offers: [newO, ...st.offers] }));
    if (isSupabaseConfigured()) {
      supabase
        .from('offers')
        .insert({
          garage_id: o.garageId, user_id: o.userId,
          car_plate: o.carPlate, offered_price: o.offeredPrice, status: o.status,
        })
        .select().single()
        .then(({ data }) => {
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
      supabase
        .from('wallet_topups')
        .insert({
          user_id: w.userId, user_name: w.userName, user_phone: w.userPhone,
          amount: w.amount, transaction_id: w.transactionId,
          car_plate: w.carPlate, method: w.method,
        })
        .select().single()
        .then(({ data }) => {
          if (data) set((st) => ({ walletTopUps: st.walletTopUps.map((x) => (x.id === newW.id ? mapTopUp(data) : x)) }));
        });
    }
  },

  // 🛡️ [الاعتماد الآمن المرن]: الاعتماد المزدوج RPC مع ارتداد بروتوكولي client-side مضمن لضمان التوافق والأمان
  approveTopUp: async (id) => {
    if (!isSupabaseConfigured()) return;
    try {
      // محاولة أولى مشفرة بالسيرفر RPC
      const { data, error } = await supabase.rpc('approve_topup_atomic', {
        p_topup_id: id,
      });

      if (!error && data?.success) {
        set((st) => ({
          walletTopUps: st.walletTopUps.map((w) =>
            w.id === id
              ? { ...w, status: 'approved' as const, bonusAmount: data.bonus_added }
              : w
          ),
        }));
        await get().fetchAll();
        return;
      }
      console.warn('RPC approve topup failed, executing robust fallback transaction:', error || data?.error);
    } catch (rpcErr) {
      console.warn('RPC approve exception, falling back:', rpcErr);
    }

    // الارتداد الفوري (Fallback): اعتماد وتحديث الرصيد التراكمي بطريقة آمنة
    const topUp = get().walletTopUps.find((w) => w.id === id);
    if (!topUp) return;

    try {
      let dbRow: any = null;
      if (topUp.transactionId) {
        const { data } = await supabase
          .from('wallet_topups')
          .select('*')
          .eq('transaction_id', topUp.transactionId)
          .maybeSingle();
        if (data) dbRow = data;
      }
      if (!dbRow) {
        const { data } = await supabase
          .from('wallet_topups')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (data) dbRow = data;
      }
      if (!dbRow) throw new Error('Top-up record not found');

      if (dbRow.status === 'approved') {
        await get().fetchAll();
        return;
      }

      const supabaseId = dbRow.id;
      const { error: approveError } = await supabase
        .from('wallet_topups')
        .update({ status: 'approved' })
        .eq('id', supabaseId);

      if (approveError) throw approveError;

      const realUserPhone = dbRow.user_phone || topUp.userPhone || '';
      let userData: any = null;
      if (realUserPhone) {
        const { data } = await supabase
          .from('users')
          .select('*')
          .eq('phone', realUserPhone)
          .maybeSingle();
        if (data) userData = data;
      }
      if (!userData) throw new Error('User account not found');

      const baseAmount = Number(dbRow.amount || topUp.amount || 0);
      let bonusAmount = 0;
      if (baseAmount >= 1000) bonusAmount = 200;
      else if (baseAmount >= 500) bonusAmount = 75;
      else if (baseAmount >= 300) bonusAmount = 30;
      else if (baseAmount >= 100) bonusAmount = 5;

      const totalToAdd = baseAmount + bonusAmount;
      const newWallet = Number(userData.wallet || 0) + totalToAdd;

      const { error: walletError } = await supabase
        .from('users')
        .update({ wallet: newWallet })
        .eq('id', userData.id);

      if (walletError) throw walletError;

      if (bonusAmount > 0) {
        await supabase
          .from('wallet_topups')
          .update({ bonus_amount: bonusAmount })
          .eq('id', supabaseId);
      }

      set((st) => ({
        walletTopUps: st.walletTopUps.map((w) =>
          w.id === id ? { ...w, status: 'approved' as const, bonusAmount } : w
        ),
      }));

      await get().fetchAll();
    } catch (err) {
      console.error('Direct fallback top-up approval failed:', err);
      throw err;
    }
  },

  rejectTopUp: async (id) => {
    const topUp = get().walletTopUps.find((w) => w.id === id);
    if (!topUp) return;

    set((st) => ({
      walletTopUps: st.walletTopUps.map((w) => (w.id === id ? { ...w, status: 'rejected' as const } : w)),
    }));

    if (!isSupabaseConfigured()) return;

    let supabaseId = id;
    if (topUp.transactionId) {
      const { data } = await supabase
        .from('wallet_topups')
        .select('id')
        .eq('transaction_id', topUp.transactionId)
        .maybeSingle();
      if (data) supabaseId = data.id;
    }

    const { error } = await supabase
      .from('wallet_topups')
      .update({ status: 'rejected' })
      .eq('id', supabaseId);

    if (error) {
      console.error('❌', error);
      return;
    }

    if (supabaseId !== id) {
      set((st) => ({
        walletTopUps: st.walletTopUps.map((w) => (w.id === id ? { ...w, id: supabaseId, status: 'rejected' as const } : w)),
      }));
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
    setTimeout(() => { get().fetchAll(); }, 1000);
  },

  addMessage: async (msg) => {
    const cleanMsg = {
      ...msg,
      message: sanitizeInput(msg.message),
      subject: msg.subject ? sanitizeInput(msg.subject) : undefined,
      userName: msg.userName ? sanitizeInput(msg.userName) : undefined,
    };
    const optimisticMessage: Message = { ...cleanMsg, id: uid(), status: 'pending', timestamp: Date.now() };
    set((st) => ({ messages: [optimisticMessage, ...(st.messages ?? [])] }));
    if (!isSupabaseConfigured()) return { success: true };
    try {
      const { data, error } = await supabase.from('messages').insert({
        user_phone: cleanMsg.userPhone, user_name: cleanMsg.userName ?? null,
        car_plate: cleanMsg.carPlate ?? null, type: cleanMsg.type,
        subject: cleanMsg.subject ?? null, message: cleanMsg.message,
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
    const cleanReply = sanitizeInput(reply);
    set((st) => ({ messages: (st.messages ?? []).map((msg) => (msg.id === id ? { ...msg, reply: cleanReply, status: 'replied' as const, repliedAt: now } : msg)) }));
    if (!isSupabaseConfigured()) return;
    const { error = null } = await supabase.from('messages').update({ reply: cleanReply, status: 'replied', replied_at: new Date(now).toISOString() }).eq('id', id);
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
      useStore.getState().fetchAll();
      startPolling();
    } else {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
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

  ['sessions', 'offers', 'incoming_cars', 'garages', 'wallet_topups', 'users', 'messages'].forEach((table) => {
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