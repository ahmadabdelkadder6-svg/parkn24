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
  status: 'coming' | 'arrived';
  arrivedTime?: number;
}

export type ViewType = 'user' | 'garage' | 'admin';
export type ScreenType =
  | 'splash'
  | 'list'
  | 'offer'
  | 'waiting'
  | 'navigation'
  | 'session'
  | 'summary';

// ===================== Helpers =====================
const uid = () => crypto.randomUUID?.() || Date.now().toString();

const isSupabaseConfigured = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return !!url && !!key && !url.includes('YOUR_PROJECT');
};

// ✅ دوال مساعدة للتخزين المحلي
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
  status: r.status,
  arrivedTime: r.arrived_time ? new Date(r.arrived_time).getTime() : undefined,
});

// ===================== debounce لـ updateGarage =====================
let updateGarageTimeout: ReturnType<typeof setTimeout> | null = null;
const pendingGarageUpdates: Map<string, Record<string, unknown>> = new Map();

// ===================== State =====================
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
  selectedGarageId: string | null;
  setSelectedGarageId: (id: string | null) => void;
  sessions: ParkingSession[];
  addSession: (s: Omit<ParkingSession, 'id'>) => Promise<string>;  // ✅ ترجع الـ id
  endSession: (id: string, totalPrice: number, paymentMethod: string) => Promise<void>;
  cancelSession: (id: string) => void;
  removeSession: (id: string) => Promise<void>;  // ✅ جديد: للتراجع عن الإضافة
  offers: Offer[];
  addOffer: (o: Omit<Offer, 'id' | 'timestamp'>) => void;
  updateOffer: (id: string, status: Offer['status'], counterPrice?: number) => void;
  cancelOffer: (id: string) => void;
  walletTopUps: WalletTopUp[];
  addWalletTopUp: (w: Omit<WalletTopUp, 'id' | 'timestamp' | 'status'>) => void;
  approveTopUp: (id: string) => Promise<void>;
  rejectTopUp: (id: string) => Promise<void>;
  incomingCars: IncomingCar[];
  addIncomingCar: (c: Omit<IncomingCar, 'id' | 'startTime' | 'status'>) => void;
  markCarArrived: (id: string) => void;
  removeIncomingCar: (id: string) => Promise<void>;
  fetchAll: () => Promise<void>;
  logout: () => void;
}

// ===================== Initial Data =====================
const defaultGarages: Garage[] = [
  {
    id: '1',
    name: 'جراج التحرير',
    username: 'tahrir',
    phone: '01001234567',
    location: 'ميدان التحرير، وسط البلد',
    lat: 30.0444,
    lng: 31.2357,
    capacity: 120,
    availableSpots: 45,
    basePrice: 15,
    rating: 4.5,
  },
  {
    id: '2',
    name: 'جراج المعادي',
    username: 'maadi',
    phone: '01009876543',
    location: 'شارع 9، المعادي',
    lat: 29.9602,
    lng: 31.2569,
    capacity: 80,
    availableSpots: 22,
    basePrice: 20,
    rating: 4.2,
  },
  {
    id: '3',
    name: 'جراج مدينة نصر',
    username: 'nasr',
    phone: '01112223344',
    location: 'شارع عباس العقاد، مدينة نصر',
    lat: 30.0511,
    lng: 31.3462,
    capacity: 200,
    availableSpots: 78,
    basePrice: 10,
    rating: 4.7,
  },
  {
    id: '4',
    name: 'جراج الزمالك',
    username: 'zamalek',
    phone: '01223344556',
    location: 'شارع 26 يوليو، الزمالك',
    lat: 30.0616,
    lng: 31.2193,
    capacity: 60,
    availableSpots: 12,
    basePrice: 25,
    rating: 4.8,
  },
];

// ===================== Store =====================
export const useStore = create<AppState>((set, get) => ({
  // ===================== View =====================
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

  // ===================== Screen =====================
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

  // ===================== User =====================
  currentUser: safeGetStorage('currentUser'),

  setCurrentUser: async (u) => {
    set({ currentUser: u });

    if (u) {
      safeSetStorage('currentUser', u);
    } else {
      safeRemoveStorage('currentUser');
    }

    if (!u || !isSupabaseConfigured()) return;

    try {
      const { data } = await supabase
        .from('users')
        .upsert(
          {
            name: u.name,
            phone: u.phone,
            car_plate: u.carPlate,
            wallet: u.wallet,
          },
          { onConflict: 'phone' }
        )
        .select()
        .single();

      if (data) {
        const updated = { ...u, wallet: Number(data.wallet) };
        set({ currentUser: updated });
        safeSetStorage('currentUser', updated);
      }
    } catch (err) {
      console.error('Error setting user:', err);
    }
  },

  deductWallet: (amount) => {
    const user = get().currentUser;
    if (!user) return;
    const nw = Math.max(0, user.wallet - amount);
    const updated = { ...user, wallet: nw };
    set({ currentUser: updated });
    safeSetStorage('currentUser', updated);
    if (isSupabaseConfigured())
      supabase.from('users').update({ wallet: nw }).eq('phone', user.phone);
  },

  // ===================== Garages =====================
  garages: defaultGarages,

  currentGarageId: (() => {
    try {
      return localStorage.getItem('currentGarageId') || null;
    } catch {
      return null;
    }
  })(),

  setCurrentGarageId: (id) => {
    set({ currentGarageId: id });
    if (id) {
      localStorage.setItem('currentGarageId', id);
    } else {
      localStorage.removeItem('currentGarageId');
    }
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
    if (id) {
      localStorage.setItem('selectedGarageId', id);
    } else {
      localStorage.removeItem('selectedGarageId');
    }
  },

  sessions: [],
  offers: [],
  walletTopUps: [],
  incomingCars: [],

  // ===================== logout =====================
  logout: () => {
    const user = get().currentUser;

    // مسح بيانات الوصول المؤقتة
    if (user?.carPlate) {
      safeRemoveStorage(`arrival_${user.carPlate}`);
    }

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

  // ===================== fetchAll =====================
  fetchAll: async () => {
    if (!isSupabaseConfigured()) return;

    const [g, s, o, w, ic] = await Promise.all([
      supabase.from('garages').select('*'),
      supabase.from('sessions').select('*').order('created_at', { ascending: false }),
      supabase.from('offers').select('*').order('created_at', { ascending: false }),
      supabase.from('wallet_topups').select('*').order('created_at', { ascending: false }),
      supabase.from('incoming_cars').select('*').order('created_at', { ascending: false }),
    ]);

    const garages = g.data?.length ? g.data.map(m) : get().garages;

    const supabaseSessions = s.data ? s.data.map(ms) : [];
    const supabaseSessionIds = new Set(supabaseSessions.map((ss) => ss.id));
    const currentSessions = get().sessions;

    const localOnlySessions = currentSessions.filter(
      (cs) =>
        !supabaseSessionIds.has(cs.id) &&
        cs.status === 'active' &&
        Date.now() - cs.startTime < 30000
    );

    const mergedSessions = supabaseSessions.map((ss) => {
      const localVersion = currentSessions.find((cs) => cs.id === ss.id);
      if (
        localVersion &&
        localVersion.status === 'completed' &&
        localVersion.totalPrice != null &&
        (ss.totalPrice == null || ss.status === 'active')
      ) {
        return localVersion;
      }
      return ss;
    });

    const finalSessions = [...mergedSessions, ...localOnlySessions];

    const supabaseTopUps = w.data ? w.data.map(mt) : get().walletTopUps;
    const currentTopUps = get().walletTopUps;
    const mergedTopUps = supabaseTopUps.map((st) => {
      const localVersion = currentTopUps.find((ct) => ct.id === st.id);
      if (localVersion && localVersion.status !== 'pending' && st.status === 'pending') {
        return localVersion;
      }
      return st;
    });

    set({
      garages,
      sessions: finalSessions,
      offers: o.data ? o.data.map(mo) : get().offers,
      walletTopUps: mergedTopUps,
      incomingCars: ic.data ? ic.data.map(mi) : get().incomingCars,
    });

    const user = get().currentUser;
    if (user) {
      const { data } = await supabase
        .from('users')
        .select('wallet')
        .eq('phone', user.phone)
        .single();
      if (data) {
        const updated = { ...user, wallet: Number(data.wallet) };
        set({ currentUser: updated });
        safeSetStorage('currentUser', updated);
      }
    }
  },

  // ===================== addGarage =====================
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

  // ===================== updateGarage =====================
  updateGarage: (id, updates) => {
    set((st) => ({
      garages: st.garages.map((g) => (g.id === id ? { ...g, ...updates } : g)),
    }));

    if (!isSupabaseConfigured()) return;

    const existing = pendingGarageUpdates.get(id) || {};
    const db: Record<string, unknown> = { ...existing };

    if (updates.basePrice !== undefined) db.base_price = updates.basePrice;
    if (updates.availableSpots !== undefined) db.available_spots = updates.availableSpots;
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

  // ===================== addSession =====================
  // ✅ تعديل: ترجع الـ id للاستخدام في ميزة التراجع
  addSession: async (s) => {
    const sessionId = crypto.randomUUID();

    const safeStartTime =
      typeof s.startTime === 'number' && !isNaN(s.startTime)
        ? s.startTime
        : Date.now();

    const optimisticSession: ParkingSession = {
      ...s,
      id: sessionId,
      startTime: safeStartTime,
      synced: false,
    };

    set((st) => ({
      sessions: [optimisticSession, ...st.sessions],
    }));

    if (!isSupabaseConfigured()) return sessionId;  // ✅ ترجع الـ id

    try {
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          id: sessionId,
          garage_id: s.garageId,
          car_plate: s.carPlate,
          start_time: new Date(safeStartTime).toISOString(),
          status: s.status,
          source: s.source,
          agreed_price: s.agreedPrice ?? null,
        })
        .select()
        .single();

      if (error) {
        console.error('❌ خطأ في إضافة الجلسة:', error);
        return sessionId;  // ✅ ترجع الـ id المحلي
      }

      if (data) {
        const syncedSession: ParkingSession = {
          ...ms(data),
          synced: true,
        };

        set((st) => ({
          sessions: st.sessions.map((x) =>
            x.id === sessionId ? syncedSession : x
          ),
        }));

        return data.id;  // ✅ ترجع الـ id من Supabase
      }
    } catch (err) {
      console.error('❌ خطأ غير متوقع:', err);
    }

    return sessionId;  // ✅ ترجع الـ id المحلي
  },

  // ===================== endSession =====================
  endSession: async (id, totalPrice, paymentMethod) => {
    const now = Date.now();
    const session = get().sessions.find((s) => s.id === id);
    const user = get().currentUser;

    if (
      paymentMethod === 'wallet' &&
      user &&
      session &&
      session.carPlate === user.carPlate
    ) {
      const nw = Math.max(0, user.wallet - totalPrice);
      set({ currentUser: { ...user, wallet: nw } });
    }

    set((st) => ({
      sessions: st.sessions.map((s) =>
        s.id === id
          ? {
              ...s,
              endTime: now,
              totalPrice,
              paymentMethod,
              status: 'completed' as const,
            }
          : s
      ),
    }));

    if (!isSupabaseConfigured()) return;

    const { error } = await supabase
      .from('sessions')
      .update({
        end_time: new Date(now).toISOString(),
        total_price: totalPrice,
        payment_method: paymentMethod,
        status: 'completed',
      })
      .eq('id', id);

    if (error) {
      console.error('❌ خطأ في إنهاء الجلسة:', error);
      setTimeout(async () => {
        await supabase
          .from('sessions')
          .update({
            end_time: new Date(now).toISOString(),
            total_price: totalPrice,
            payment_method: paymentMethod,
            status: 'completed',
          })
          .eq('id', id);
      }, 2000);
    }

    if (paymentMethod === 'wallet' && session) {
      const { data: userData } = await supabase
        .from('users')
        .select('phone, wallet')
        .eq('car_plate', session.carPlate)
        .single();

      if (userData) {
        const newWallet = Math.max(0, Number(userData.wallet) - totalPrice);
        await supabase
          .from('users')
          .update({ wallet: newWallet })
          .eq('phone', userData.phone);

        const currentUser = get().currentUser;
        if (currentUser && currentUser.phone === userData.phone) {
          set({ currentUser: { ...currentUser, wallet: newWallet } });
        }
      }
    }
  },

  // ===================== cancelSession =====================
  cancelSession: (id) => {
    set((st) => ({
      sessions: st.sessions.filter((s) => s.id !== id),
    }));
    if (isSupabaseConfigured()) {
      supabase.from('sessions').delete().eq('id', id);
    }
  },

  // ===================== removeSession (للتراجع عن الإضافة اليدوية) =====================
  // ✅ جديد: دالة لحذف الجلسة عند التراجع خلال 30 ثانية
   // ✅ removeSession — يحذف من Supabase أولاً ثم محلياً
  removeSession: async (id) => {
    const state = get();
    const target = state.sessions.find((s) => s.id === id);

    // ✅ اجمع كل الـ ids المرتبطة
    const idsToDelete = new Set<string>();
    idsToDelete.add(id);

    if (target) {
      state.sessions.forEach((s) => {
        if (
          s.carPlate === target.carPlate &&
          s.source === 'manual' &&
          s.status === 'active' &&
          Math.abs(s.startTime - target.startTime) < 10000
        ) {
          idsToDelete.add(s.id);
        }
      });
    }

    // ✅ أضف للقائمة السوداء فوراً
    const newDeleted = new Set(state.deletedSessionIds);
    idsToDelete.forEach((did) => newDeleted.add(did));

    // ✅ احذف محلياً فوراً
    set({
      sessions: state.sessions.filter((s) => !idsToDelete.has(s.id)),
      deletedSessionIds: newDeleted,
    });

    // ✅ احذف من Supabase لكل id
    if (isSupabaseConfigured()) {
      const deletePromises = Array.from(idsToDelete).map((did) =>
        supabase.from('sessions').delete().eq('id', did)
      );
      await Promise.all(deletePromises);

      // ✅ احذف كمان بالـ carPlate + source عشان نضمن
      if (target) {
        await supabase
          .from('sessions')
          .delete()
          .eq('car_plate', target.carPlate)
          .eq('source', 'manual')
          .eq('status', 'active')
          .gte('start_time', new Date(target.startTime - 10000).toISOString())
          .lte('start_time', new Date(target.startTime + 10000).toISOString());
      }
    }
  },

  // ===================== Offers =====================
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
    set((st) => ({
      offers: st.offers.filter((o) => o.id !== id),
    }));
    if (isSupabaseConfigured()) {
      supabase.from('offers').delete().eq('id', id);
    }
  },

  // ===================== Wallet =====================
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

    if (topUp) {
      const user = get().currentUser;
      if (user && topUp.userPhone === user.phone) {
        set({
          currentUser: { ...user, wallet: user.wallet + topUp.amount },
        });
      }
    }

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
        await supabase
          .from('users')
          .update({ wallet: Number(data.wallet) + topUp.amount })
          .eq('phone', topUp.userPhone);
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

  // ===================== Incoming Cars =====================
  addIncomingCar: (c) => {
    const newC: IncomingCar = {
      ...c,
      id: uid(),
      startTime: Date.now(),
      status: 'coming',
    };
    set((st) => ({ incomingCars: [newC, ...st.incomingCars] }));
    if (isSupabaseConfigured()) {
      supabase
        .from('incoming_cars')
        .insert({
          garage_id: c.garageId,
          car_plate: c.carPlate,
          customer_name: c.customerName,
          customer_phone: c.customerPhone,
          agreed_price: c.agreedPrice,
          estimated_arrival: c.estimatedArrival,
        })
        .select()
        .single()
        .then(({ data }) => {
          if (data)
            set((st) => ({
              incomingCars: st.incomingCars.map((x) =>
                x.id === newC.id ? mi(data) : x
              ),
            }));
        });
    }
  },

  markCarArrived: (id) => {
    const now = Date.now();
    const car = get().incomingCars.find((c) => c.id === id);

    set((st) => ({
      incomingCars: st.incomingCars.map((c) =>
        c.id === id ? { ...c, status: 'arrived' as const, arrivedTime: now } : c
      ),
    }));

    // حفظ بيانات الوصول في localStorage
    if (car) {
      const arrivedCar = { ...car, status: 'arrived' as const, arrivedTime: now };
      safeSetStorage(`arrival_${car.carPlate}`, arrivedCar);
    }

    if (isSupabaseConfigured()) {
      supabase
        .from('incoming_cars')
        .update({
          status: 'arrived',
          arrived_time: new Date(now).toISOString(),
        })
        .eq('id', id);
    }
  },

  removeIncomingCar: async (id) => {
    const car = get().incomingCars.find((c) => c.id === id);

    set((st) => ({
      incomingCars: st.incomingCars.filter((c) => c.id !== id),
    }));

    // مسح بيانات الوصول المؤقتة
    if (car?.carPlate) {
      safeRemoveStorage(`arrival_${car.carPlate}`);
    }

    if (isSupabaseConfigured()) {
      const { error } = await supabase
        .from('incoming_cars')
        .delete()
        .eq('id', id);
      if (error) console.error('❌ خطأ في حذف السيارة:', error);
    }
  },
}));

// ===================== Realtime =====================
let realtimeStarted = false;

export function setupRealtime() {
  if (realtimeStarted) return;
  realtimeStarted = true;
  if (!isSupabaseConfigured()) return;

  let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastRefresh = 0;

  const refresh = () => {
    const now = Date.now();
    if (now - lastRefresh < 3000) {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        lastRefresh = Date.now();
        useStore.getState().fetchAll();
        refreshTimeout = null;
      }, 3000);
      return;
    }
    lastRefresh = now;
    if (refreshTimeout) clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(() => {
      useStore.getState().fetchAll();
      refreshTimeout = null;
    }, 1500);
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
    }
    if (status === 'CHANNEL_ERROR') {
      console.error('❌ Realtime channel error:', channelName);
    }
    if (status === 'TIMED_OUT') {
      console.warn('⚠️ Realtime timed out:', channelName);
    }
  });

  // cleanup
  window.addEventListener('beforeunload', () => {
    if (refreshTimeout) clearTimeout(refreshTimeout);
    channel.unsubscribe();
    supabase.removeChannel(channel);
  });
}