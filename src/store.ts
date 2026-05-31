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
  | 'splash'
  | 'list'
  | 'offer'
  | 'waiting'
  | 'navigation'
  | 'session'
  | 'summary'
  | 'lastSession'
  | 'chat';

// ===================== Helpers =====================
const uid = () => crypto.randomUUID?.() || Date.now().toString();

const isSupabaseConfigured = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return !!url && !!key && !url.includes('YOUR_PROJECT');
};

const safeSetStorage = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Error saving to localStorage:', e);
  }
};

const safeRemoveStorage = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.error('Error removing from localStorage:', e);
  }
};

const safeGetStorage = (key: string) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch (e) {
    console.error('Error reading from localStorage:', e);
    return null;
  }
};

const normalizePlate = (plate?: string) => (plate ?? '').trim().toUpperCase();

const samePlate = (a?: string, b?: string) =>
  normalizePlate(a) !== '' && normalizePlate(a) === normalizePlate(b);

const getMs = (value?: number) => {
  if (typeof value === 'number') return value;
  return 0;
};

const dedupeActiveSessions = (list: ParkingSession[]): ParkingSession[] => {
  const active = list.filter((s) => s.status === 'active');
  const completed = list.filter((s) => s.status === 'completed');

  const bestByPlate = new Map<string, ParkingSession>();

  for (const session of active) {
    const key = normalizePlate(session.carPlate);
    if (!key) continue;

    const existing = bestByPlate.get(key);
    if (!existing) {
      bestByPlate.set(key, session);
      continue;
    }

    const sessionStart = getMs(session.startTime);
    const existingStart = getMs(existing.startTime);

    const shouldUseCurrent =
      (session.synced && !existing.synced) || sessionStart < existingStart;

    if (shouldUseCurrent) {
      bestByPlate.set(key, session);
    }
  }

  return [...Array.from(bestByPlate.values()), ...completed].sort((a, b) => {
    const aTime =
      a.status === 'active'
        ? getMs(a.startTime)
        : typeof a.endTime === 'number'
        ? a.endTime
        : 0;
    const bTime =
      b.status === 'active'
        ? getMs(b.startTime)
        : typeof b.endTime === 'number'
        ? b.endTime
        : 0;
    return bTime - aTime;
  });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const m = (r: any): Garage => ({
  id: r.id,
  name: r.name,
  username: r.username,
  phone: r.phone,
  location: r.location,
  lat: r.lat,
  lng: r.lng,
  capacity: r.capacity,
  availableSpots: r.available_spots,
  basePrice: Number(r.base_price),
  rating: Number(r.rating),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ms = (r: any): ParkingSession => {
  let startTime = Date.now();
  try {
    if (r.start_time) {
      const parsed = new Date(r.start_time).getTime();
      if (!isNaN(parsed) && parsed > 0) startTime = parsed;
    }
  } catch {}

  let endTime: number | undefined;
  try {
    if (r.end_time) {
      const parsed = new Date(r.end_time).getTime();
      if (!isNaN(parsed) && parsed > 0) endTime = parsed;
    }
  } catch {}

  if (endTime && endTime < startTime) {
    console.warn('⚠️ endTime قبل startTime:', {
      start: new Date(startTime).toISOString(),
      end: new Date(endTime).toISOString(),
    });
    const diff = startTime - endTime;
    if (diff < 4 * 60 * 60 * 1000) {
      endTime = endTime + diff + 60000;
    }
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
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mo = (r: any): Offer => ({
  id: r.id,
  garageId: r.garage_id,
  userId: r.user_id,
  carPlate: r.car_plate,
  offeredPrice: Number(r.offered_price),
  status: r.status,
  counterPrice: r.counter_price != null ? Number(r.counter_price) : undefined,
  timestamp: new Date(r.created_at).getTime(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mt = (r: any): WalletTopUp => ({
  id: r.id,
  userId: r.user_id,
  userName: r.user_name,
  userPhone: r.user_phone,
  amount: Number(r.amount),
  transactionId: r.transaction_id,
  carPlate: r.car_plate,
  method: r.method,
  status: r.status,
  timestamp: new Date(r.created_at).getTime(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mi = (r: any): IncomingCar => ({
  id: r.id,
  garageId: r.garage_id,
  carPlate: r.car_plate,
  customerName: r.customer_name,
  customerPhone: r.customer_phone,
  agreedPrice: Number(r.agreed_price),
  startTime: new Date(r.created_at).getTime(),
  estimatedArrival: r.estimated_arrival,
  status: 'coming',
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mm = (r: any): Message => ({
  id: r.id,
  userPhone: r.user_phone,
  userName: r.user_name,
  carPlate: r.car_plate,
  type: r.type || 'inquiry',
  subject: r.subject,
  message: r.message,
  reply: r.reply,
  status: r.status || 'pending',
  timestamp: new Date(r.created_at).getTime(),
  repliedAt: r.replied_at ? new Date(r.replied_at).getTime() : undefined,
});

// ===================== debounce لـ updateGarage =====================
let updateGarageTimeout: ReturnType<typeof setTimeout> | null = null;
const pendingGarageUpdates: Map<string, Record<string, unknown>> = new Map();

// ✅ locks لمنع التكرار
const sessionStartLocks = new Set<string>();
const sessionEndLocks = new Set<string>();

// ✅ حماية الرصيد من الـ override بعد الخصم
let walletDeductedAt = 0;

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
  } | null;
  setCurrentUser: (
    u: {
      name: string;
      phone: string;
      carPlate: string;
      wallet: number;
    } | null
  ) => void;
  deductWallet: (amount: number) => void;
  garages: Garage[];
  currentGarageId: string | null;
  setCurrentGarageId: (id: string | null) => void;
  addGarage: (
    g: Omit<Garage, 'id' | 'rating' | 'availableSpots'> & {
      capacity: number;
    }
  ) => Promise<void>;
  updateGarage: (
    id: string,
    updates: Partial<Pick<Garage, 'basePrice' | 'availableSpots' | 'capacity'>>
  ) => void;
  adjustGarageSpots: (id: string, delta: number) => Promise<void>;
  selectedGarageId: string | null;
  setSelectedGarageId: (id: string | null) => void;
  sessions: ParkingSession[];
  addSession: (s: Omit<ParkingSession, 'id'>) => Promise<string>;
  endSession: (
    id: string,
    totalPrice: number,
    paymentMethod: string
  ) => Promise<void>;
  cancelSession: (id: string) => void;
  removeSession: (id: string) => Promise<void>;
  confirmRevenue: (sessionId: string) => Promise<void>;
  unconfirmRevenue: (sessionId: string) => Promise<void>; // ✅ جديد
  offers: Offer[];
  addOffer: (o: Omit<Offer, 'id' | 'timestamp'>) => void;
  updateOffer: (
    id: string,
    status: Offer['status'],
    counterPrice?: number
  ) => void;
  cancelOffer: (id: string) => void;
  walletTopUps: WalletTopUp[];
  addWalletTopUp: (
    w: Omit<WalletTopUp, 'id' | 'timestamp' | 'status'>
  ) => void;
  approveTopUp: (id: string) => Promise<void>;
  rejectTopUp: (id: string) => Promise<void>;
  incomingCars: IncomingCar[];
  addIncomingCar: (
    c: Omit<IncomingCar, 'id' | 'startTime' | 'status'>
  ) => Promise<void>;
  removeIncomingCar: (id: string) => Promise<void>;
  messages: Message[];
  addMessage: (
    m: Omit<Message, 'id' | 'timestamp' | 'status'>
  ) => Promise<{ success: boolean; error?: string }>;
  replyMessage: (id: string, reply: string) => Promise<void>;
  closeMessage: (id: string) => Promise<void>;
  fetchAll: () => Promise<void>;
  logout: () => void;
}

// ===================== Store =====================
export const useStore = create<AppState>((set, get) => ({

  // ── View ──────────────────────────────────────────────────────────────────
  view: (() => {
    try {
      const saved = localStorage.getItem('appView');
      return (saved as ViewType) || 'user';
    } catch {
      return 'user' as ViewType;
    }
  })(),

  setView: (v) => {
    set({ view: v });
    localStorage.setItem('appView', v);
  },

  // ── Screen ────────────────────────────────────────────────────────────────
  screen: (() => {
    try {
      const saved = localStorage.getItem('appScreen');
      if (saved) return saved as ScreenType;
      return 'splash' as ScreenType;
    } catch {
      return 'splash' as ScreenType;
    }
  })(),

  setScreen: (s) => {
    set({ screen: s });
    localStorage.setItem('appScreen', s);
  },

  // ── User ──────────────────────────────────────────────────────────────────
  currentUser: safeGetStorage('currentUser'),

  setCurrentUser: async (u) => {
    if (!u) {
      set({ currentUser: null });
      safeRemoveStorage('currentUser');
      return;
    }

    set({ currentUser: u });
    safeSetStorage('currentUser', u);

    if (!isSupabaseConfigured()) return;

    try {
      const { data: existingUser } = await supabase
        .from('users')
        .select('wallet, name, phone, car_plate')
        .eq('phone', u.phone)
        .single();

      if (existingUser) {
        const updated = {
          name: existingUser.name || u.name,
          phone: existingUser.phone || u.phone,
          carPlate: existingUser.car_plate || u.carPlate,
          wallet: Number(existingUser.wallet),
        };
        set({ currentUser: updated });
        safeSetStorage('currentUser', updated);
        await supabase
          .from('users')
          .update({ name: u.name, car_plate: u.carPlate })
          .eq('phone', u.phone);
      } else {
        const { data: newUser } = await supabase
          .from('users')
          .insert({
            name: u.name,
            phone: u.phone,
            car_plate: u.carPlate,
            wallet: u.wallet ?? 0,
          })
          .select()
          .single();

        if (newUser) {
          const updated = {
            name: newUser.name,
            phone: newUser.phone,
            carPlate: newUser.car_plate,
            wallet: Number(newUser.wallet),
          };
          set({ currentUser: updated });
          safeSetStorage('currentUser', updated);
        }
      }
    } catch (err) {
      console.error('Error setting user:', err);
    }
  },

  // ── deductWallet ──────────────────────────────────────────────────────────
  deductWallet: (amount) => {
    const user = get().currentUser;
    if (!user) return;
    const nw = Math.max(0, user.wallet - amount);
    const updated = { ...user, wallet: nw };
    set({ currentUser: updated });
    safeSetStorage('currentUser', updated);

    walletDeductedAt = Date.now();

    if (isSupabaseConfigured()) {
      supabase
        .from('users')
        .update({ wallet: nw })
        .eq('phone', user.phone)
        .then(({ error }) => {
          if (error) {
            console.error('❌ خطأ في تحديث الرصيد:', error);
          }
        });
    }
  },

  // ── Garages ───────────────────────────────────────────────────────────────
  garages: [],

  currentGarageId: (() => {
    try {
      return localStorage.getItem('currentGarageId') || null;
    } catch {
      return null;
    }
  })(),

  setCurrentGarageId: (id) => {
    set({ currentGarageId: id });
    if (id) localStorage.setItem('currentGarageId', id);
    else localStorage.removeItem('currentGarageId');
  },

  selectedGarageId: (() => {
    try {
      return localStorage.getItem('selectedGarageId') || null;
    } catch {
      return null;
    }
  })(),

  setSelectedGarageId: (id) => {
    set({ selectedGarageId: id });
    if (id) localStorage.setItem('selectedGarageId', id);
    else localStorage.removeItem('selectedGarageId');
  },

  sessions: [],
  offers: [],
  walletTopUps: [],
  incomingCars: [],
  messages: [],

  // ── logout ────────────────────────────────────────────────────────────────
  logout: () => {
    set({
      currentUser: null,
      currentGarageId: null,
      selectedGarageId: null,
      view: 'user',
      screen: 'splash',
    });
    safeRemoveStorage('currentUser');
    safeRemoveStorage('appView');
    safeRemoveStorage('appScreen');
    safeRemoveStorage('currentGarageId');
    safeRemoveStorage('selectedGarageId');
    safeRemoveStorage('garageAuth');
    safeRemoveStorage('adminAuth');
  },

  // ── fetchAll ──────────────────────────────────────────────────────────────
  fetchAll: async () => {
    if (!isSupabaseConfigured()) return;

    const [g, s, o, w, ic, msgs] = await Promise.all([
      supabase.from('garages').select('*'),
      supabase
        .from('sessions')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('offers')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('wallet_topups')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('incoming_cars')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false }),
    ]);

    const currentGarages = get().garages;
    const fetchedGarages = g.data?.length ? g.data.map(m) : currentGarages;
    const garages = fetchedGarages.map((dbGarage) => {
      if (pendingGarageUpdates.has(dbGarage.id)) {
        return currentGarages.find((x) => x.id === dbGarage.id) ?? dbGarage;
      }
      return dbGarage;
    });

    const supabaseSessions = s.data ? s.data.map(ms) : [];
    const supabaseSessionIds = new Set(supabaseSessions.map((ss) => ss.id));
    const currentSessions = get().sessions;

    const supabaseActivePlates = new Set(
      supabaseSessions
        .filter((ss) => ss.status === 'active')
        .map((ss) => normalizePlate(ss.carPlate))
    );

    const localOnlySessions = currentSessions.filter(
      (cs) =>
        !supabaseSessionIds.has(cs.id) &&
        cs.status === 'active' &&
        !supabaseActivePlates.has(normalizePlate(cs.carPlate)) &&
        Date.now() - cs.startTime < 10000
    );

    const mergedSessions = supabaseSessions.map((ss) => {
      const localVersion = currentSessions.find((cs) => cs.id === ss.id);
      if (localVersion) {
        if (localVersion.status === 'completed') {
          return {
            ...localVersion,
            revenueConfirmed: ss.revenueConfirmed || localVersion.revenueConfirmed,
          };
        }
        if (localVersion.totalPrice != null && localVersion.totalPrice > 0) {
          return localVersion;
        }
      }
      return ss;
    });

    const finalSessions = dedupeActiveSessions([
      ...mergedSessions,
      ...localOnlySessions,
    ]);

    const supabaseTopUps = w.data ? w.data.map(mt) : get().walletTopUps;
    const currentTopUps = get().walletTopUps ?? [];
    const mergedTopUps = supabaseTopUps.map((st) => {
      const localVersion = currentTopUps.find((ct) => ct.id === st.id);
      if (
        localVersion &&
        localVersion.status !== 'pending' &&
        st.status === 'pending'
      ) {
        return localVersion;
      }
      return st;
    });

    const fetchedCars = ic.data
      ? ic.data.map(mi).filter((c) => c.status === 'coming')
      : (get().incomingCars ?? []);

    const currentMessages = get().messages ?? [];
    const supabaseMessages = msgs.data ? msgs.data.map(mm) : currentMessages;
    const mergedMessages = supabaseMessages.map((sm) => {
      const localVersion = currentMessages.find((cm) => cm.id === sm.id);
      if (
        localVersion &&
        localVersion.status !== 'pending' &&
        sm.status === 'pending'
      ) {
        return localVersion;
      }
      return sm;
    });

    set({
      garages,
      sessions: finalSessions,
      offers: o.data ? o.data.map(mo) : (get().offers ?? []),
      walletTopUps: mergedTopUps,
      incomingCars: fetchedCars,
      messages: mergedMessages,
    });

    const user = get().currentUser;
    if (user?.phone) {
      try {
        const timeSinceDeduct = Date.now() - walletDeductedAt;

        if (timeSinceDeduct < 20000) {
          const { data } = await supabase
            .from('users')
            .select('name, phone, car_plate')
            .eq('phone', user.phone)
            .single();

          if (data) {
            const updated = {
              name: data.name || user.name,
              phone: data.phone || user.phone,
              carPlate: data.car_plate || user.carPlate,
              wallet: user.wallet,
            };
            set({ currentUser: updated });
            safeSetStorage('currentUser', updated);
          }
        } else {
          const { data } = await supabase
            .from('users')
            .select('wallet, name, phone, car_plate')
            .eq('phone', user.phone)
            .single();

          if (data) {
            const updated = {
              name: data.name || user.name,
              phone: data.phone || user.phone,
              carPlate: data.car_plate || user.carPlate,
              wallet: Number(data.wallet),
            };
            set({ currentUser: updated });
            safeSetStorage('currentUser', updated);
          }
        }
      } catch (err) {
        console.error('Error fetching user wallet:', err);
      }
    }
  }, // ✅ إغلاق fetchAll

  // ── addGarage ─────────────────────────────────────────────────────────────
  addGarage: async (g) => {
    const { data, error } = await supabase
      .from('garages')
      .insert({
        name: g.name,
        username: g.username,
        phone: g.phone,
        location: g.location,
        lat: g.lat,
        lng: g.lng,
        capacity: g.capacity,
        available_spots: g.capacity,
        base_price: g.basePrice,
        rating: 4.0,
      })
      .select();
    if (!error && data) {
      set((st) => ({ garages: [...st.garages, ...data.map(m)] }));
    }
  },

  // ── updateGarage ──────────────────────────────────────────────────────────
  updateGarage: (id, updates) => {
    set((st) => ({
      garages: st.garages.map((g) =>
        g.id === id ? { ...g, ...updates } : g
      ),
    }));

    if (!isSupabaseConfigured()) return;

    const existing = pendingGarageUpdates.get(id) || {};
    const db: Record<string, unknown> = { ...existing };

    if (updates.basePrice !== undefined) db.base_price = updates.basePrice;
    if (updates.availableSpots !== undefined)
      db.available_spots = updates.availableSpots;
    if (updates.capacity !== undefined) db.capacity = updates.capacity;

    pendingGarageUpdates.set(id, db);

    if (updateGarageTimeout) clearTimeout(updateGarageTimeout);
    updateGarageTimeout = setTimeout(async () => {
      for (const [garageId, dbUpdates] of pendingGarageUpdates.entries()) {
        await supabase.from('garages').update(dbUpdates).eq('id', garageId);
      }
      pendingGarageUpdates.clear();
      updateGarageTimeout = null;
    }, 500);
  },

  // ── adjustGarageSpots ─────────────────────────────────────────────────────
  adjustGarageSpots: async (id, delta) => {
    set((st) => ({
      garages: st.garages.map((g) => {
        if (g.id !== id) return g;
        const optimisticSpots = Math.max(
          0,
          Math.min(g.capacity, g.availableSpots + delta)
        );
        return { ...g, availableSpots: optimisticSpots };
      }),
    }));

    if (!isSupabaseConfigured()) return;

    try {
      const pending = pendingGarageUpdates.get(id);
      if (pending && Object.keys(pending).length > 0) {
        const { error: flushError } = await supabase
          .from('garages')
          .update(pending)
          .eq('id', id);

        if (flushError) {
          console.error('❌ خطأ في حفظ التعديل:', flushError);
          await get().fetchAll();
          return;
        }

        pendingGarageUpdates.delete(id);
        if (pendingGarageUpdates.size === 0 && updateGarageTimeout) {
          clearTimeout(updateGarageTimeout);
          updateGarageTimeout = null;
        }
      }

      const { data, error } = await supabase.rpc('adjust_spots', {
        garage_uuid: id,
        delta: delta,
      });

      if (error) {
        console.error('❌ خطأ في تعديل الأماكن:', error);
        await get().fetchAll();
        return;
      }

      const realSpots = Number(data);
      set((st) => ({
        garages: st.garages.map((g) =>
          g.id === id ? { ...g, availableSpots: realSpots } : g
        ),
      }));
    } catch (err) {
      console.error('❌ خطأ غير متوقع في adjustGarageSpots:', err);
      await get().fetchAll();
    }
  },

  // ── addSession ────────────────────────────────────────────────────────────
  addSession: async (s) => {
    const normalizedPlate = normalizePlate(s.carPlate);
    if (!normalizedPlate) return '';

    const sessionId = crypto.randomUUID();
    const safeStartTime =
      typeof s.startTime === 'number' && !isNaN(s.startTime)
        ? s.startTime
        : Date.now();

    if (sessionStartLocks.has(normalizedPlate)) {
      const existing = get().sessions.find(
        (x) => samePlate(x.carPlate, normalizedPlate) && x.status === 'active'
      );
      return existing?.id ?? '';
    }

    sessionStartLocks.add(normalizedPlate);
    pausePolling(8000);

    try {
      const existingLocal = get().sessions.find(
        (existing) =>
          samePlate(existing.carPlate, normalizedPlate) &&
          existing.status === 'active'
      );

      if (existingLocal) {
        return existingLocal.id;
      }

      if (isSupabaseConfigured()) {
        try {
          const { data: dbCheck } = await supabase
            .from('sessions')
            .select('id, car_plate')
            .eq('status', 'active')
            .eq('car_plate', normalizedPlate)
            .limit(1);

          if (dbCheck && dbCheck.length > 0) {
            await get().fetchAll();
            return dbCheck[0].id;
          }
        } catch (err) {
          console.error('خطأ في التحقق من DB:', err);
        }
      }

      const optimisticSession: ParkingSession = {
        ...s,
        id: sessionId,
        carPlate: normalizedPlate,
        startTime: safeStartTime,
        synced: false,
        revenueConfirmed: false,
      };

      set((st) => ({
        sessions: dedupeActiveSessions([optimisticSession, ...st.sessions]),
      }));

      await get().adjustGarageSpots(s.garageId, -1);

      if (!isSupabaseConfigured()) return sessionId;

      try {
        const { data, error } = await supabase
          .from('sessions')
          .insert({
            id: sessionId,
            garage_id: s.garageId,
            car_plate: normalizedPlate,
            start_time: new Date(safeStartTime).toISOString(),
            status: s.status,
            source: s.source,
            agreed_price: s.agreedPrice ?? null,
            revenue_confirmed: false,
          })
          .select()
          .single();

        if (error) {
          console.error('❌ خطأ في إضافة الجلسة:', error);
          set((st) => ({
            sessions: st.sessions.filter((x) => x.id !== sessionId),
          }));
          await get().adjustGarageSpots(s.garageId, +1);
          return sessionId;
        }

        if (data) {
          const syncedSession: ParkingSession = { ...ms(data), synced: true };
          set((st) => ({
            sessions: dedupeActiveSessions(
              st.sessions.map((x) => (x.id === sessionId ? syncedSession : x))
            ),
          }));
          return data.id;
        }
      } catch (err) {
        console.error('❌ خطأ غير متوقع في addSession:', err);
        set((st) => ({
          sessions: st.sessions.filter((x) => x.id !== sessionId),
        }));
        await get().adjustGarageSpots(s.garageId, +1);
      }

      return sessionId;
    } finally {
      sessionStartLocks.delete(normalizedPlate);
    }
  },

  // ── endSession ────────────────────────────────────────────────────────────
  endSession: async (id, totalPrice, paymentMethod) => {
    const now = Date.now();
    const session = get().sessions.find((s) => s.id === id);

    if (!session) {
      console.error('❌ الجلسة مش موجودة:', id);
      return;
    }

    if (session.status !== 'active') {
      console.warn('⚠️ الجلسة مش نشطة:', session.status);
      return;
    }

    const lockKey = `${session.garageId}:${normalizePlate(session.carPlate)}`;
    if (sessionEndLocks.has(lockKey)) return;
    sessionEndLocks.add(lockKey);

    pausePolling(8000);

    try {
      const safeTotalPrice = Number(totalPrice) > 0 ? Number(totalPrice) : 0;

      set((st) => ({
        sessions: st.sessions.map((s) =>
          s.id === id
            ? {
                ...s,
                endTime: now,
                totalPrice: safeTotalPrice,
                paymentMethod,
                status: 'completed' as const,
                revenueConfirmed: false,
              }
            : s
        ),
      }));

      await get().adjustGarageSpots(session.garageId, +1);

      if (!isSupabaseConfigured()) return;

      const { error } = await supabase
        .from('sessions')
        .update({
          end_time: new Date(now).toISOString(),
          total_price: safeTotalPrice,
          payment_method: paymentMethod,
          status: 'completed',
          revenue_confirmed: false,
        })
        .eq('id', id)
        .eq('status', 'active');

      if (error) {
        console.error('❌ خطأ في إنهاء الجلسة:', error);
      }

      setTimeout(() => {
        get().fetchAll();
      }, 8000);
    } finally {
      setTimeout(() => {
        sessionEndLocks.delete(lockKey);
      }, 3000);
    }
  },

  // ── confirmRevenue ────────────────────────────────────────────────────────
  confirmRevenue: async (sessionId) => {
    set((st) => ({
      sessions: st.sessions.map((s) =>
        s.id === sessionId ? { ...s, revenueConfirmed: true } : s
      ),
    }));

    if (!isSupabaseConfigured()) return;

    const { error } = await supabase
      .from('sessions')
      .update({ revenue_confirmed: true })
      .eq('id', sessionId);

    if (error) {
      console.error('❌ خطأ في تأكيد الإيراد:', error);
      set((st) => ({
        sessions: st.sessions.map((s) =>
          s.id === sessionId ? { ...s, revenueConfirmed: false } : s
        ),
      }));
    }
  },

  // ── unconfirmRevenue ──────────────────────────────────────────────────────
  unconfirmRevenue: async (sessionId) => {
    // ✅ تحديث محلي فوري
    set((st) => ({
      sessions: st.sessions.map((s) =>
        s.id === sessionId ? { ...s, revenueConfirmed: false } : s
      ),
    }));

    if (!isSupabaseConfigured()) return;

    const { error } = await supabase
      .from('sessions')
      .update({ revenue_confirmed: false })
      .eq('id', sessionId);

    if (error) {
      console.error('❌ خطأ في إلغاء تأكيد الإيراد:', error);
      // ✅ rollback لو فشل
      set((st) => ({
        sessions: st.sessions.map((s) =>
          s.id === sessionId ? { ...s, revenueConfirmed: true } : s
        ),
      }));
    }
  },

  // ── cancelSession ─────────────────────────────────────────────────────────
  cancelSession: (id) => {
    const session = get().sessions.find((s) => s.id === id);

    set((st) => ({
      sessions: st.sessions.filter((s) => s.id !== id),
    }));

    if (session && session.status === 'active') {
      get().adjustGarageSpots(session.garageId, +1);
    }

    if (isSupabaseConfigured()) {
      supabase.from('sessions').delete().eq('id', id);
    }
  },

  // ── removeSession ─────────────────────────────────────────────────────────
  removeSession: async (id) => {
    const state = get();
    const target = state.sessions.find((s) => s.id === id);

    const idsToDelete = new Set<string>();
    idsToDelete.add(id);

    if (target) {
      state.sessions.forEach((s) => {
        if (
          samePlate(s.carPlate, target.carPlate) &&
          s.source === 'manual' &&
          s.status === 'active' &&
          Math.abs(s.startTime - target.startTime) < 10000
        ) {
          idsToDelete.add(s.id);
        }
      });
    }

    const activeDeletedCount = state.sessions.filter(
      (s) => idsToDelete.has(s.id) && s.status === 'active'
    ).length;

    set({
      sessions: state.sessions.filter((s) => !idsToDelete.has(s.id)),
    });

    if (target && activeDeletedCount > 0) {
      await get().adjustGarageSpots(target.garageId, activeDeletedCount);
    }

    if (isSupabaseConfigured()) {
      const deletePromises = Array.from(idsToDelete).map((did) =>
        supabase.from('sessions').delete().eq('id', did)
      );
      await Promise.all(deletePromises);

      if (target) {
        await supabase
          .from('sessions')
          .delete()
          .eq('car_plate', normalizePlate(target.carPlate))
          .eq('source', 'manual')
          .eq('status', 'active')
          .gte('start_time', new Date(target.startTime - 10000).toISOString())
          .lte('start_time', new Date(target.startTime + 10000).toISOString());
      }
    }
  },

  // ── Offers ────────────────────────────────────────────────────────────────
  addOffer: (o) => {
    const newO: Offer = { ...o, id: uid(), timestamp: Date.now() };
    set((st) => ({ offers: [newO, ...st.offers] }));
    if (isSupabaseConfigured()) {
      supabase
        .from('offers')
        .insert({
          garage_id: o.garageId,
          user_id: o.userId,
          car_plate: o.carPlate,
          offered_price: o.offeredPrice,
          status: o.status,
        })
        .select()
        .single()
        .then(({ data }) => {
          if (data)
            set((st) => ({
              offers: st.offers.map((x) => (x.id === newO.id ? mo(data) : x)),
            }));
        });
    }
  },

  updateOffer: (id, status, counterPrice) => {
    set((st) => ({
      offers: st.offers.map((o) =>
        o.id === id ? { ...o, status, counterPrice } : o
      ),
    }));
    if (isSupabaseConfigured()) {
      const u: Record<string, unknown> = { status };
      if (counterPrice !== undefined) u.counter_price = counterPrice;
      supabase.from('offers').update(u).eq('id', id);
    }
  },

  cancelOffer: (id) => {
    set((st) => ({ offers: st.offers.filter((o) => o.id !== id) }));
    if (isSupabaseConfigured()) {
      supabase.from('offers').delete().eq('id', id);
    }
  },

  // ── Wallet ────────────────────────────────────────────────────────────────
  addWalletTopUp: (w) => {
    const newW: WalletTopUp = {
      ...w,
      id: uid(),
      status: 'pending',
      timestamp: Date.now(),
    };
    set((st) => ({ walletTopUps: [newW, ...st.walletTopUps] }));
    if (isSupabaseConfigured()) {
      supabase
        .from('wallet_topups')
        .insert({
          user_id: w.userId,
          user_name: w.userName,
          user_phone: w.userPhone,
          amount: w.amount,
          transaction_id: w.transactionId,
          car_plate: w.carPlate,
          method: w.method,
        })
        .select()
        .single()
        .then(({ data }) => {
          if (data)
            set((st) => ({
              walletTopUps: st.walletTopUps.map((x) =>
                x.id === newW.id ? mt(data) : x
              ),
            }));
        });
    }
  },

  approveTopUp: async (id) => {
    const topUp = get().walletTopUps.find((w) => w.id === id);
    set((st) => ({
      walletTopUps: st.walletTopUps.map((w) =>
        w.id === id ? { ...w, status: 'approved' as const } : w
      ),
    }));
    if (!isSupabaseConfigured() || !topUp) return;

    const { error } = await supabase
      .from('wallet_topups')
      .update({ status: 'approved' })
      .eq('id', id);

    if (error && topUp.transactionId) {
      await supabase
        .from('wallet_topups')
        .update({ status: 'approved' })
        .eq('transaction_id', topUp.transactionId);
    }

    if (topUp.userPhone) {
      const { data } = await supabase
        .from('users')
        .select('wallet')
        .eq('phone', topUp.userPhone)
        .single();

      if (data) {
        const newWallet = Number(data.wallet) + topUp.amount;
        await supabase
          .from('users')
          .update({ wallet: newWallet })
          .eq('phone', topUp.userPhone);

        const currentUser = get().currentUser;
        if (currentUser && currentUser.phone === topUp.userPhone) {
          const updated = { ...currentUser, wallet: newWallet };
          set({ currentUser: updated });
          safeSetStorage('currentUser', updated);
        }
      }
    }
  },

  rejectTopUp: async (id) => {
    set((st) => ({
      walletTopUps: st.walletTopUps.map((w) =>
        w.id === id ? { ...w, status: 'rejected' as const } : w
      ),
    }));
    if (!isSupabaseConfigured()) return;
    const { error } = await supabase
      .from('wallet_topups')
      .update({ status: 'rejected' })
      .eq('id', id);
    if (error) console.error('❌ خطأ في رفض الشحن:', error);
  },

  // ── addIncomingCar ────────────────────────────────────────────────────────
  addIncomingCar: async (c) => {
    const incomingId = crypto.randomUUID();

    const newC: IncomingCar = {
      ...c,
      id: incomingId,
      startTime: Date.now(),
      status: 'coming',
    };

    set((st) => ({ incomingCars: [newC, ...st.incomingCars] }));

    if (!isSupabaseConfigured()) return;

    try {
      const { data, error } = await supabase
        .from('incoming_cars')
        .insert({
          id: incomingId,
          garage_id: c.garageId,
          car_plate: c.carPlate,
          customer_name: c.customerName,
          customer_phone: c.customerPhone,
          agreed_price: c.agreedPrice,
          estimated_arrival: c.estimatedArrival,
        })
        .select()
        .single();

      if (error) {
        console.error('❌ خطأ في addIncomingCar:', error);
        set((st) => ({
          incomingCars: st.incomingCars.filter((x) => x.id !== incomingId),
        }));
        return;
      }

      if (data) {
        set((st) => ({
          incomingCars: st.incomingCars.map((x) =>
            x.id === incomingId ? mi(data) : x
          ),
        }));
      }
    } catch (err) {
      console.error('❌ خطأ غير متوقع في addIncomingCar:', err);
      set((st) => ({
        incomingCars: st.incomingCars.filter((x) => x.id !== incomingId),
      }));
    }
  },

  // ── removeIncomingCar ─────────────────────────────────────────────────────
  removeIncomingCar: async (id) => {
    let savedCarPlate = '';
    let savedGarageId = '';

    set((st) => {
      const found = st.incomingCars.find((c) => c.id === id);
      if (found) {
        savedCarPlate = found.carPlate;
        savedGarageId = found.garageId;
      }
      return {
        incomingCars: st.incomingCars.filter((c) => c.id !== id),
      };
    });

    if (!isSupabaseConfigured()) return;

    try {
      await supabase.from('incoming_cars').delete().eq('id', id);

      if (savedCarPlate && savedGarageId) {
        await supabase
          .from('incoming_cars')
          .delete()
          .eq('car_plate', savedCarPlate)
          .eq('garage_id', savedGarageId);
      }
    } catch (err) {
      console.error('❌ خطأ في removeIncomingCar:', err);
    }

    setTimeout(() => {
      get().fetchAll();
    }, 1000);
  },

  // ── Messages ──────────────────────────────────────────────────────────────
  addMessage: async (msg) => {
    const optimisticMessage: Message = {
      ...msg,
      id: uid(),
      status: 'pending',
      timestamp: Date.now(),
    };

    set((st) => ({
      messages: [optimisticMessage, ...(st.messages ?? [])],
    }));

    if (!isSupabaseConfigured()) {
      return { success: true };
    }

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          user_phone: msg.userPhone,
          user_name: msg.userName ?? null,
          car_plate: msg.carPlate ?? null,
          type: msg.type,
          subject: msg.subject ?? null,
          message: msg.message,
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Supabase addMessage error:', error);
        set((st) => ({
          messages: (st.messages ?? []).filter(
            (m) => m.id !== optimisticMessage.id
          ),
        }));
        return {
          success: false,
          error: error.message || 'فشل إرسال الرسالة',
        };
      }

      if (data) {
        set((st) => ({
          messages: (st.messages ?? []).map((m) =>
            m.id === optimisticMessage.id ? mm(data) : m
          ),
        }));
      }

      return { success: true };
    } catch (err) {
      console.error('❌ Unexpected addMessage error:', err);
      set((st) => ({
        messages: (st.messages ?? []).filter(
          (m) => m.id !== optimisticMessage.id
        ),
      }));
      return {
        success: false,
        error: err instanceof Error ? err.message : 'حدث خطأ غير متوقع',
      };
    }
  },

  replyMessage: async (id, reply) => {
    const now = Date.now();
    set((st) => ({
      messages: (st.messages ?? []).map((msg) =>
        msg.id === id
          ? { ...msg, reply, status: 'replied' as const, repliedAt: now }
          : msg
      ),
    }));

    if (!isSupabaseConfigured()) return;

    const { error } = await supabase
      .from('messages')
      .update({
        reply,
        status: 'replied',
        replied_at: new Date(now).toISOString(),
      })
      .eq('id', id);

    if (error) console.error('❌ خطأ في إرسال الرد:', error);
  },

  closeMessage: async (id) => {
    set((st) => ({
      messages: (st.messages ?? []).map((msg) =>
        msg.id === id ? { ...msg, status: 'closed' as const } : msg
      ),
    }));

    if (!isSupabaseConfigured()) return;

    const { error } = await supabase
      .from('messages')
      .update({ status: 'closed' })
      .eq('id', id);

    if (error) console.error('❌ خطأ في إغلاق الرسالة:', error);
  },

})); // ✅ إغلاق useStore

// ===================== Realtime =====================
let realtimeStarted = false;
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let isOperationInProgress = false;
let pauseTimeout: ReturnType<typeof setTimeout> | null = null;

export function pausePolling(duration = 5000) {
  isOperationInProgress = true;
  if (pauseTimeout) clearTimeout(pauseTimeout);
  pauseTimeout = setTimeout(() => {
    isOperationInProgress = false;
    pauseTimeout = null;
  }, duration);
}

export function setupRealtime() {
  if (realtimeStarted) return;
  realtimeStarted = true;

  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(() => {
    if (!isOperationInProgress) {
      useStore.getState().fetchAll();
    }
  }, 5000);

  window.addEventListener('beforeunload', () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
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

  const tables = [
    'sessions',
    'offers',
    'incoming_cars',
    'garages',
    'wallet_topups',
    'users',
    'messages',
  ];

  tables.forEach((table) => {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      refresh
    );
  });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('✅ Realtime connected:', channelName);
      if (pollingInterval) clearInterval(pollingInterval);
      pollingInterval = setInterval(() => {
        if (!isOperationInProgress) useStore.getState().fetchAll();
      }, 10000);
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      if (pollingInterval) clearInterval(pollingInterval);
      pollingInterval = setInterval(() => {
        if (!isOperationInProgress) useStore.getState().fetchAll();
      }, 5000);
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