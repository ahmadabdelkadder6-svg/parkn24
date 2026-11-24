import { supabase } from './supabase';

// ============================================================
// 🛡️ THE SHIELD - Full Protection Engine (v5 - Ultra Light & Reliable)
// WakeLock + Silent Audio KeepAlive + WebAudio Siren + Haversine 50m
// + Car Speed Detection + Actual Parking Spot Anchor Lock
// ============================================================

export const SHIELD_RADIUS_METERS = 50;
// سرعة السيارة بالـ متر/ثانية (~8 كم/ساعة) لاكتشاف التحرك بالسيارة فوراً
export const SPEED_BREACH_MPS = 2.22;

let wakeLockObj: any = null;
let sharedAudioCtx: AudioContext | null = null;
let alarmInterval: any = null;
let keepAliveInterval: any = null;
let keepAliveAudioEl: HTMLAudioElement | null = null;
let gpsWatchId: number | null = null;
let gpsPollInterval: any = null;
let isAlarmPlaying = false;
let currentShieldId: string | null = null;
let lastGpsSendTime = 0;
let lastWatchTickTime = 0;
let isSendingGps = false;
let visibilityHandlerAttached = false;
let audioUnlockListenersAttached = false;

// Deduplicate concurrent registerShieldSession calls for the same sessionId
const inFlightRegistrations = new Map<string, Promise<string | null>>();

// 1-second silent WAV file encoded in base64 to keep mobile browser process alive in background
const SILENT_WAV_BASE64 =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

// ── Audio Context Initialization (Must be called on user gesture) ──
export function initAudioContext(): void {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!sharedAudioCtx && AudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    // Start silent audio immediately during user gesture so mobile OS permits background playback
    startKeepAlive();
  } catch (e) {
    console.warn('[Shield] AudioContext init error:', e);
  }
}

// ── Arm Background Audio (Called by SessionScreen & NavigationScreen) ──
export function armBackgroundAudio(): void {
  initAudioContext();

  if (typeof document === 'undefined' || audioUnlockListenersAttached) return;
  audioUnlockListenersAttached = true;

  const unlockOnGesture = () => {
    initAudioContext();
    document.removeEventListener('touchstart', unlockOnGesture);
    document.removeEventListener('click', unlockOnGesture);
    document.removeEventListener('keydown', unlockOnGesture);
    audioUnlockListenersAttached = false;
  };

  document.addEventListener('touchstart', unlockOnGesture, { once: true, passive: true });
  document.addEventListener('click', unlockOnGesture, { once: true, passive: true });
  document.addEventListener('keydown', unlockOnGesture, { once: true, passive: true });
}

// ── Silent Keep-Alive Audio (Prevents mobile OS from killing tab) ──
export function startKeepAlive(): void {
  try {
    if (!keepAliveAudioEl && typeof Audio !== 'undefined') {
      keepAliveAudioEl = new Audio(SILENT_WAV_BASE64);
      keepAliveAudioEl.loop = true;
      keepAliveAudioEl.volume = 0.01;
      keepAliveAudioEl.setAttribute('playsinline', 'true');
      // If mobile OS pauses the audio when locking screen, force play again
      keepAliveAudioEl.addEventListener('pause', () => {
        if (gpsWatchId !== null && keepAliveAudioEl) {
          keepAliveAudioEl.play().catch(() => {});
        }
      });
    }
    if (keepAliveAudioEl && keepAliveAudioEl.paused) {
      keepAliveAudioEl.play().catch(() => {});
    }
  } catch {}

  if (keepAliveInterval) return;
  keepAliveInterval = setInterval(() => {
    try {
      if (keepAliveAudioEl && keepAliveAudioEl.paused && gpsWatchId !== null) {
        keepAliveAudioEl.play().catch(() => {});
      }
      if (!sharedAudioCtx) return;
      if (sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume().catch(() => {});
      }
      // Ultra-silent 1Hz pulse for 30ms every 20 seconds to keep AudioContext warm
      const osc = sharedAudioCtx.createOscillator();
      const gain = sharedAudioCtx.createGain();
      osc.frequency.value = 1;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(sharedAudioCtx.destination);
      const now = sharedAudioCtx.currentTime;
      osc.start(now);
      osc.stop(now + 0.03);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {}
      };
    } catch {}
  }, 20_000);
}

export function stopKeepAlive(): void {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  if (keepAliveAudioEl) {
    try {
      keepAliveAudioEl.pause();
      keepAliveAudioEl.currentTime = 0;
    } catch {}
  }
}

// ── WakeLock (Keep screen & CPU awake) ──
const handleVisibilityChange = async () => {
  if (document.visibilityState === 'visible') {
    if (gpsWatchId !== null && !wakeLockObj) {
      try {
        if ('wakeLock' in navigator) {
          wakeLockObj = await (navigator as any).wakeLock.request('screen');
        }
      } catch {}
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    if (keepAliveAudioEl && keepAliveAudioEl.paused && gpsWatchId !== null) {
      keepAliveAudioEl.play().catch(() => {});
    }
  }
};

export async function requestWakeLock(): Promise<void> {
  try {
    if ('wakeLock' in navigator && !wakeLockObj) {
      wakeLockObj = await (navigator as any).wakeLock.request('screen');
      wakeLockObj.addEventListener('release', () => {
        wakeLockObj = null;
      });
    }
    if (!visibilityHandlerAttached && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });
      visibilityHandlerAttached = true;
    }
  } catch {}
}

export function releaseWakeLock(): void {
  if (wakeLockObj) {
    try {
      wakeLockObj.release();
    } catch {}
    wakeLockObj = null;
  }
}

// ── Notification Permissions ──
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}

// ── Local Push Notification (Immediate Alert) ──
export function sendImmediateNotification(title: string, body: string): void {
  try {
    if ('serviceWorker' in navigator && Notification.permission === 'granted') {
      navigator.serviceWorker.ready
        .then((reg) => {
          reg
            .showNotification(title, {
              body,
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              vibrate: [500, 150, 500, 150, 500, 150, 800],
              requireInteraction: true,
              tag: 'shield-breach-' + Date.now(),
              renotify: true,
            } as any)
            .catch(() => {});
        })
        .catch(() => {});
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icon-192.png' });
    }
  } catch {}
}

// ── Intense Police Siren Alarm (WebAudio API + Vibration) ──
let activeOsc: OscillatorNode | null = null;
let activeGain: GainNode | null = null;

export function playIntenseAlarm(): void {
  if (isAlarmPlaying) return;
  isAlarmPlaying = true;

  try {
    initAudioContext();
    if (!sharedAudioCtx) return;

    const triggerSirenCycle = () => {
      if (!isAlarmPlaying || !sharedAudioCtx) return;
      try {
        if (sharedAudioCtx.state === 'suspended') {
          sharedAudioCtx.resume().catch(() => {});
        }

        if (activeOsc) {
          try {
            activeOsc.stop();
            activeOsc.disconnect();
          } catch {}
          activeOsc = null;
        }
        if (activeGain) {
          try {
            activeGain.disconnect();
          } catch {}
          activeGain = null;
        }

        const osc = sharedAudioCtx.createOscillator();
        const gain = sharedAudioCtx.createGain();

        osc.type = 'sawtooth';
        const now = sharedAudioCtx.currentTime;

        // Siren frequencies: urgent high-low police sweep
        osc.frequency.setValueAtTime(650, now);
        osc.frequency.linearRampToValueAtTime(1400, now + 0.35);
        osc.frequency.linearRampToValueAtTime(550, now + 0.7);
        osc.frequency.linearRampToValueAtTime(1500, now + 1.05);
        osc.frequency.linearRampToValueAtTime(650, now + 1.4);

        gain.gain.setValueAtTime(0.95, now);

        osc.connect(gain);
        gain.connect(sharedAudioCtx.destination);

        osc.start(now);
        osc.stop(now + 1.45);

        osc.onended = () => {
          try {
            osc.disconnect();
            gain.disconnect();
          } catch {}
        };

        activeOsc = osc;
        activeGain = gain;

        if ('vibrate' in navigator) {
          navigator.vibrate([400, 100, 400, 100, 600]);
        }
      } catch {}
    };

    triggerSirenCycle();
    alarmInterval = setInterval(triggerSirenCycle, 1500);
  } catch (e) {
    console.warn('[Shield] Alarm play error:', e);
  }
}

// Aliases for playIntenseAlarm used across SessionScreen / NavigationScreen
export function triggerIntenseAlarm(): void {
  playIntenseAlarm();
}

export function playBreachAlarm(): void {
  playIntenseAlarm();
}

export function stopIntenseAlarm(): void {
  isAlarmPlaying = false;
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
  if (activeOsc) {
    try {
      activeOsc.stop();
      activeOsc.disconnect();
    } catch {}
    activeOsc = null;
  }
  if (activeGain) {
    try {
      activeGain.disconnect();
    } catch {}
    activeGain = null;
  }
  try {
    if ('vibrate' in navigator) navigator.vibrate(0);
  } catch {}
}

export function stopBreachAlarm(): void {
  stopIntenseAlarm();
}

// ── Haversine Distance (Meters) ──
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const calculateDistance = haversineDistance;

// ── LocalStorage Persistence for Shield State ──
const SHIELD_STORAGE_KEY = 'parkn_shield_active_v3';

export interface ShieldState {
  active: boolean;
  shieldId?: string;
  sessionId: string;
  garageId: string;
  garageName: string;
  garageLat: number;
  garageLng: number;
  userPhone: string;
  userName: string;
  carPlate: string;
  agreedPrice?: number;
  startedAt: number;
  anchorLocked?: boolean;
}

let cachedShieldState: ShieldState | null | undefined = undefined;

export function saveShieldState(state: ShieldState): void {
  cachedShieldState = state;
  try {
    localStorage.setItem(SHIELD_STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function loadShieldState(): ShieldState | null {
  if (cachedShieldState !== undefined) return cachedShieldState;
  try {
    const raw = localStorage.getItem(SHIELD_STORAGE_KEY);
    if (!raw) {
      cachedShieldState = null;
      return null;
    }
    cachedShieldState = JSON.parse(raw) as ShieldState;
    return cachedShieldState;
  } catch {
    cachedShieldState = null;
    return null;
  }
}

export function clearShieldState(): void {
  cachedShieldState = null;
  try {
    localStorage.removeItem(SHIELD_STORAGE_KEY);
  } catch {}
}

export function getShieldId(): string | null {
  return currentShieldId || loadShieldState()?.shieldId || null;
}

export function setShieldId(id: string | null): void {
  currentShieldId = id;
  const state = loadShieldState();
  if (state && id) {
    state.shieldId = id;
    saveShieldState(state);
  }
}

export function isShieldActive(): boolean {
  return gpsWatchId !== null || Boolean(loadShieldState()?.active);
}

// ── Register Shield Session in Supabase (`shield_sessions` table) ──
export async function registerShieldSession(
  stateOrSessionId: (Partial<ShieldState> & Record<string, any>) | string,
  userPhoneArg?: string,
  userNameArg?: string,
  carPlateArg?: string,
  garageIdArg?: string,
  garageNameArg?: string,
  garageLatArg?: number,
  garageLngArg?: number
): Promise<string | null> {
  const normalizedState: ShieldState =
    typeof stateOrSessionId === 'string'
      ? {
          active: true,
          sessionId: stateOrSessionId,
          userPhone: userPhoneArg || '',
          userName: userNameArg || 'عميل',
          carPlate: carPlateArg || '',
          garageId: garageIdArg || '',
          garageName: garageNameArg || '',
          garageLat: Number(garageLatArg) || 30.0444,
          garageLng: Number(garageLngArg) || 31.2357,
          startedAt: Date.now(),
        }
      : {
          active: stateOrSessionId.active ?? true,
          shieldId: stateOrSessionId.shieldId,
          sessionId: stateOrSessionId.sessionId || '',
          garageId: stateOrSessionId.garageId || '',
          garageName: stateOrSessionId.garageName || '',
          garageLat: Number(
            stateOrSessionId.garageLat ?? stateOrSessionId.parkingLat ?? 30.0444
          ),
          garageLng: Number(
            stateOrSessionId.garageLng ?? stateOrSessionId.parkingLng ?? 31.2357
          ),
          userPhone: stateOrSessionId.userPhone || '',
          userName:
            stateOrSessionId.userName || stateOrSessionId.customerName || 'عميل',
          carPlate: stateOrSessionId.carPlate || '',
          agreedPrice: stateOrSessionId.agreedPrice,
          startedAt: stateOrSessionId.startedAt || Date.now(),
          anchorLocked: stateOrSessionId.anchorLocked,
        };

  if (!normalizedState.sessionId) return null;

  // Reuse existing shieldId if already registered for the same session
  const existingState = loadShieldState();
  if (
    existingState?.sessionId === normalizedState.sessionId &&
    existingState?.shieldId
  ) {
    currentShieldId = existingState.shieldId;
    return existingState.shieldId;
  }

  // Deduplicate concurrent registration calls for the same session
  const inFlight = inFlightRegistrations.get(normalizedState.sessionId);
  if (inFlight) return inFlight;

  const registrationPromise = (async (): Promise<string | null> => {
    try {
      const { data: existing } = await supabase
        .from('shield_sessions')
        .select('id, parking_lat, parking_lng')
        .eq('session_id', normalizedState.sessionId)
        .eq('is_active', true)
        .maybeSingle();

      if (existing?.id) {
        // Restore locked parking coordinates if they were already saved on server
        const pLat = Number(existing.parking_lat);
        const pLng = Number(existing.parking_lng);
        if (
          Number.isFinite(pLat) &&
          Number.isFinite(pLng) &&
          pLat !== 0 &&
          pLng !== 0
        ) {
          normalizedState.garageLat = pLat;
          normalizedState.garageLng = pLng;
          normalizedState.anchorLocked = true;
          saveShieldState(normalizedState);
        }
        setShieldId(existing.id);
        return existing.id;
      }

      const { data, error } = await supabase
        .from('shield_sessions')
        .insert({
          session_id: normalizedState.sessionId,
          user_phone: normalizedState.userPhone,
          customer_name: normalizedState.userName,
          car_plate: normalizedState.carPlate,
          garage_id: normalizedState.garageId,
          garage_name: normalizedState.garageName,
          parking_lat: normalizedState.garageLat,
          parking_lng: normalizedState.garageLng,
          last_lat: normalizedState.garageLat,
          last_lng: normalizedState.garageLng,
          last_distance: 0,
          is_active: true,
          is_breached: false,
          alarm_triggered: false,
        })
        .select('id')
        .single();

      if (!error && data?.id) {
        setShieldId(data.id);
        return data.id;
      }
      return null;
    } catch (e) {
      console.warn('[Shield] registerShieldSession error:', e);
      return null;
    } finally {
      inFlightRegistrations.delete(normalizedState.sessionId);
    }
  })();

  inFlightRegistrations.set(normalizedState.sessionId, registrationPromise);
  return registrationPromise;
}

// ── Send Live GPS to `shield_sessions` & `shield_locations` ──
async function sendGPSToServer(
  lat: number,
  lng: number,
  dist: number,
  accuracy: number,
  isBreached: boolean
): Promise<void> {
  const now = Date.now();
  // Throttle updates: every 8 seconds normally, or every 3 seconds if breached
  const minInterval = isBreached ? 3000 : 8000;
  if (now - lastGpsSendTime < minInterval || isSendingGps) return;

  const state = loadShieldState();
  if (!state || !state.sessionId) return;

  lastGpsSendTime = now;
  isSendingGps = true;

  try {
    const shieldId = getShieldId();
    const roundedDist = Math.round(dist);
    const roundedAcc = Math.round(accuracy || 10);
    const isoNow = new Date().toISOString();

    const updatePayload: Record<string, any> = {
      last_lat: lat,
      last_lng: lng,
      last_distance: roundedDist,
      is_breached: isBreached,
      updated_at: isoNow,
    };
    if (isBreached) {
      updatePayload.alarm_triggered = true;
    }

    const updateQuery = shieldId
      ? supabase.from('shield_sessions').update(updatePayload).eq('id', shieldId)
      : supabase
          .from('shield_sessions')
          .update(updatePayload)
          .eq('session_id', state.sessionId);

    const tasks: PromiseLike<any>[] = [updateQuery];

    // Insert location log when shieldId is available
    if (shieldId) {
      tasks.push(
        supabase.from('shield_locations').insert({
          shield_id: shieldId,
          lat,
          lng,
          accuracy: roundedAcc,
          distance_from_car: roundedDist,
        })
      );
    }

    await Promise.all(tasks);
  } catch {
    // Silent fail to avoid interrupting radar loop
  } finally {
    isSendingGps = false;
  }
}

// ── Continuous GPS Radar (Locks actual parking spot + 50m Geofence + Car Speed) ──
export function startShieldGPS(
  garageLat: number,
  garageLng: number,
  onUpdate?: (dist: number, lat: number, lng: number, isOut: boolean) => void,
  onBreach?: (dist: number, lat: number, lng: number) => void,
  onReturnInside?: () => void
): void {
  stopShieldGPS();
  startKeepAlive();
  requestWakeLock();

  if (!('geolocation' in navigator)) return;

  let consecutiveBreaches = 0;
  let currentlyBreached = false;

  // Use locked parking anchor if already captured for this session
  const existingState = loadShieldState();
  let anchorLat = existingState?.anchorLocked ? existingState.garageLat : garageLat;
  let anchorLng = existingState?.anchorLocked ? existingState.garageLng : garageLng;
  let isAnchorLocked = Boolean(existingState?.anchorLocked);

  const lockParkingAnchor = (lat: number, lng: number) => {
    anchorLat = lat;
    anchorLng = lng;
    isAnchorLocked = true;

    const st = loadShieldState();
    if (st) {
      st.garageLat = lat;
      st.garageLng = lng;
      st.anchorLocked = true;
      saveShieldState(st);

      const shieldId = getShieldId();
      if (shieldId) {
        supabase
          .from('shield_sessions')
          .update({ parking_lat: lat, parking_lng: lng })
          .eq('id', shieldId)
          .then(() => {});
      } else if (st.sessionId) {
        supabase
          .from('shield_sessions')
          .update({ parking_lat: lat, parking_lng: lng })
          .eq('session_id', st.sessionId)
          .then(() => {});
      }
    }
  };

  const handlePosition = (pos: GeolocationPosition) => {
    lastWatchTickTime = Date.now();
    const { latitude, longitude, accuracy, speed } = pos.coords;

    // Ignore extremely inaccurate cell-tower jumps (> 120m) IF we already locked our parking spot
    if (accuracy && accuracy > 120 && isAnchorLocked) return;

    // Lock the exact spot where the customer parked on the very first GPS fix of the session!
    if (!isAnchorLocked) {
      lockParkingAnchor(latitude, longitude);
    }

    const dist = haversineDistance(anchorLat, anchorLng, latitude, longitude);
    const isMovingFastInCar =
      speed !== null &&
      speed !== undefined &&
      !Number.isNaN(speed) &&
      speed >= SPEED_BREACH_MPS &&
      dist > 25;

    const isOut = dist > SHIELD_RADIUS_METERS || isMovingFastInCar;

    if (onUpdate) {
      onUpdate(Math.round(dist), latitude, longitude, isOut);
    }

    // Send live coordinates to Supabase (throttled internally)
    sendGPSToServer(latitude, longitude, dist, accuracy || 10, isOut);

    if (isOut) {
      consecutiveBreaches++;
      // Confirm breach immediately if clearly past buffer (> 58m) or moving at car speed, or 2 consecutive readings > 50m
      if (
        (consecutiveBreaches >= 2 || dist > 58 || isMovingFastInCar) &&
        !currentlyBreached
      ) {
        currentlyBreached = true;
        playIntenseAlarm();
        sendImmediateNotification(
          '🚨 تحذير أمني عاجل - الدرع الذكي!',
          `السيارة تحركت لمسافة ${Math.round(dist)} متر من مكان ركنتها بدون إنهاء الجلسة!`
        );
        if (onBreach) {
          onBreach(Math.round(dist), latitude, longitude);
        }
      } else if (currentlyBreached && !isAlarmPlaying) {
        playIntenseAlarm();
      }
    } else {
      consecutiveBreaches = 0;
      if (currentlyBreached && dist <= SHIELD_RADIUS_METERS - 5) {
        currentlyBreached = false;
        stopIntenseAlarm();
        if (onReturnInside) onReturnInside();
      }
    }
  };

  // Get immediate initial position to lock the parking spot right away
  navigator.geolocation.getCurrentPosition(handlePosition, () => {}, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 8000,
  });

  // High-accuracy continuous watch
  gpsWatchId = navigator.geolocation.watchPosition(
    handlePosition,
    (err) => {
      console.warn('[Shield GPS watch warning]:', err.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 10000,
    }
  );

  // Fallback poll ONLY if watchPosition hasn't fired in the last 14 seconds (e.g. background throttling)
  gpsPollInterval = setInterval(() => {
    if (Date.now() - lastWatchTickTime < 14_000) return;
    navigator.geolocation.getCurrentPosition(handlePosition, () => {}, {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 8000,
    });
  }, 15_000);
}

export function stopShieldGPS(sessionId?: string): void {
  if (gpsWatchId !== null && 'geolocation' in navigator) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
  if (gpsPollInterval) {
    clearInterval(gpsPollInterval);
    gpsPollInterval = null;
  }
  stopIntenseAlarm();
  stopKeepAlive();
  releaseWakeLock();

  const state = loadShieldState();
  const targetSessionId = sessionId || state?.sessionId;
  const shieldId = getShieldId();

  if (shieldId) {
    supabase
      .from('shield_sessions')
      .update({
        is_active: false,
        is_breached: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', shieldId)
      .then(() => {});
  } else if (targetSessionId) {
    supabase
      .from('shield_sessions')
      .update({
        is_active: false,
        is_breached: false,
        updated_at: new Date().toISOString(),
      })
      .eq('session_id', targetSessionId)
      .then(() => {});
  }

  currentShieldId = null;
}

// ── Full Cleanup of Shield (Stops GPS, Siren, KeepAlive, WakeLock & Clears State) ──
export function destroyShield(sessionId?: string): void {
  stopShieldGPS(sessionId);
  clearShieldState();
}

// ── Trigger Emergency SOS in Supabase (Garage + Admin + Push + Shield Table) ──
let lastSosTime = 0;

export async function triggerSOS(
  sessionId: string,
  garageId: string,
  userPhone: string,
  userName: string,
  carPlate: string,
  lat: number,
  lng: number,
  distance: number,
  agreedPrice?: number
): Promise<void> {
  const now = Date.now();
  // Throttle SOS database writes to once every 15 seconds
  if (now - lastSosTime < 15000) return;
  lastSosTime = now;

  try {
    const roundedDist = Math.round(distance);
    const shieldId = getShieldId();
    const isoNow = new Date().toISOString();

    const dbTasks: PromiseLike<any>[] = [
      // 1. Update sessions table with SOS status & live coordinates
      supabase
        .from('sessions')
        .update({
          sos_active: true,
          sos_triggered_at: isoNow,
          user_lat: lat,
          user_lng: lng,
        })
        .eq('id', sessionId),

      // 2. Update shield_sessions table
      shieldId
        ? supabase
            .from('shield_sessions')
            .update({
              is_breached: true,
              alarm_triggered: true,
              last_lat: lat,
              last_lng: lng,
              last_distance: roundedDist,
              updated_at: isoNow,
            })
            .eq('id', shieldId)
        : supabase
            .from('shield_sessions')
            .update({
              is_breached: true,
              alarm_triggered: true,
              last_lat: lat,
              last_lng: lng,
              last_distance: roundedDist,
              updated_at: isoNow,
            })
            .eq('session_id', sessionId),

      // 3. Send urgent message to Garage & Admin
      supabase.from('messages').insert({
        id: 'sos_' + now + '_' + Math.random().toString(36).substring(2, 6),
        sender_phone: userPhone || 'SHIELD_SYSTEM',
        sender_name: `🚨 إنذار الدرع (${userName || 'عميل'})`,
        subject: `🚨 اختراق نطاق الجراج (50م) - لوحة: ${carPlate}`,
        content: `تحذير أمني عاجل!\nالسيارة رقم (${carPlate}) الخاصة بالعميل (${userName} - ${userPhone}) غادرت نطاق الـ 50 متر المسموح به (المسافة الحالية: ${roundedDist} متر) دون إنهاء الجلسة أو الدفع!\nالسعر المتفق عليه: ${agreedPrice || 0} ج.م\nالموقع الحالي: https://www.google.com/maps?q=${lat},${lng}`,
        garage_id: garageId,
        created_at: isoNow,
      }),
    ];

    // 4. Trigger Server Web Push Notification to Customer & Garage Owner
    const pushTask = fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userPhone,
        garageId,
        sessionId,
        isBreach: true,
        title: `🚨 إنذار الدرع: خروج بدون دفع! (${carPlate})`,
        body: `السيارة (${carPlate}) ابتعدت ${roundedDist}م عن نقطة الركن دون إنهاء الجلسة!`,
        url: '/',
      }),
    }).catch(() => {});

    await Promise.all([...dbTasks, pushTask]);
  } catch (e) {
    console.warn('[Shield SOS Error]:', e);
  }
}

// ── Trigger Breach Alarm (Used by SessionScreen - Supports Object or Positional Args) ──
export async function triggerBreachAlarm(
  paramsOrSessionId?:
    | {
        sessionId?: string;
        garageId?: string;
        garageName?: string;
        carPlate?: string;
        userName?: string;
        userPhone?: string;
        distance?: number;
        lat?: number;
        lng?: number;
        agreedPrice?: number;
      }
    | string,
  garageIdArg?: string,
  userPhoneArg?: string,
  userNameArg?: string,
  carPlateArg?: string,
  latArg?: number,
  lngArg?: number,
  distanceArg?: number,
  agreedPriceArg?: number
): Promise<void> {
  playIntenseAlarm();

  const state = loadShieldState();

  if (typeof paramsOrSessionId === 'object' && paramsOrSessionId !== null) {
    const sessionId = paramsOrSessionId.sessionId || state?.sessionId || '';
    const garageId = paramsOrSessionId.garageId || state?.garageId || '';
    const userPhone = paramsOrSessionId.userPhone || state?.userPhone || '';
    const userName = paramsOrSessionId.userName || state?.userName || 'عميل';
    const carPlate = paramsOrSessionId.carPlate || state?.carPlate || '';
    const lat = Number(paramsOrSessionId.lat ?? state?.garageLat ?? 30.0444);
    const lng = Number(paramsOrSessionId.lng ?? state?.garageLng ?? 31.2357);
    const distance = Number(paramsOrSessionId.distance ?? 55);
    const agreedPrice = Number(paramsOrSessionId.agreedPrice ?? state?.agreedPrice ?? 0);

    if (sessionId) {
      await triggerSOS(
        sessionId,
        garageId,
        userPhone,
        userName,
        carPlate,
        lat,
        lng,
        distance,
        agreedPrice
      );
    }
  } else if (typeof paramsOrSessionId === 'string' && paramsOrSessionId) {
    await triggerSOS(
      paramsOrSessionId,
      garageIdArg || state?.garageId || '',
      userPhoneArg || state?.userPhone || '',
      userNameArg || state?.userName || 'عميل',
      carPlateArg || state?.carPlate || '',
      Number(latArg ?? state?.garageLat ?? 30.0444),
      Number(lngArg ?? state?.garageLng ?? 31.2357),
      Number(distanceArg ?? 55),
      Number(agreedPriceArg ?? state?.agreedPrice ?? 0)
    );
  }
}

export async function clearSOS(sessionId: string): Promise<void> {
  try {
    const shieldId = getShieldId();
    const isoNow = new Date().toISOString();

    await Promise.all([
      supabase.from('sessions').update({ sos_active: false }).eq('id', sessionId),
      shieldId
        ? supabase
            .from('shield_sessions')
            .update({ is_breached: false, updated_at: isoNow })
            .eq('id', shieldId)
        : supabase
            .from('shield_sessions')
            .update({ is_breached: false, updated_at: isoNow })
            .eq('session_id', sessionId),
    ]);
  } catch {}
}