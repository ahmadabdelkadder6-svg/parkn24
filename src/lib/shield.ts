// src/lib/shield.ts — Park'n 24 Tactical Shield Engine v19 (True Parking Anchor + Anti-Sleep)
import { supabase } from './supabase';

export const SHIELD_COST        = 0;
export const SHIELD_AUTO_FEE    = 1;
export const GEOFENCE_RADIUS    = 50; // 50 متر من مكان ركن السيارة الفعلي

const GPS_SEND_INTERVAL         = 12_000;
const MIN_MOVE_THRESHOLD        = 3;
const SPEED_BREACH_MPS          = 2.22; // ~8 كم/ساعة (سرعة تحرك السيارة)
const STORAGE_KEY_VAL           = 'parkn_shield_state';
export const SHIELD_STORAGE_KEY = STORAGE_KEY_VAL;

export interface ShieldState {
  isActive: boolean;
  shieldCode: string;
  phone: string;
  garageId: string;
  parkingLat: number;
  parkingLng: number;
  sessionId: string;
  shieldId?: string;
  anchorLocked?: boolean;
}

// ─── WebAudio & Keep-Alive Globals ──────────────────────────
let sharedAudioCtx: AudioContext | null = null;
let alarmOscillators: OscillatorNode[] = [];
let alarmGainNodes: GainNode[] = [];
let alarmIntervalId: ReturnType<typeof setInterval> | null = null;
let vibrateIntervalId: ReturnType<typeof setInterval> | null = null;
let isAlarmPlaying = false;

let keepAliveAudioEl: HTMLAudioElement | null = null;
let keepAliveOsc: OscillatorNode | null = null;
let keepAliveGain: GainNode | null = null;
let wakeLockSentinel: any = null;
let visibilityListenerAttached = false;

let activeWatchId: number | null = null;
let activeFallbackInterval: ReturnType<typeof setInterval> | null = null;
let lastGpsSentAt = 0;
let lastSentCoords: { lat: number; lng: number } | null = null;
let lastSpeedSentAt = 0;
let prevSpeedSample: { lat: number; lng: number; t: number } | null = null;

// منع تكرار تسجيل نفس الجلسة في نفس اللحظة
const inFlightRegistrations = new Map<string, Promise<string | null>>();

// ─── ملف صوتي صامت (1-second PCM WAV) لمنع نوم المتصفح في الخلفية ───
const SILENT_WAV_BASE64 =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

// ─── حساب المسافة (Haversine بالمتر) ─────────────────────────
export function calcDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
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

// ─── تشغيل الملف الصامت وقفل الشاشة لمنع المتصفح من النوم ─────
function startKeepAlive(): void {
  // 1) HTML5 Audio Loop (يبقي المتصفح يقظاً كمشغل وسائط في الخلفية)
  try {
    if (!keepAliveAudioEl && typeof Audio !== 'undefined') {
      keepAliveAudioEl = new Audio(SILENT_WAV_BASE64);
      keepAliveAudioEl.loop = true;
      keepAliveAudioEl.volume = 0.01;
      keepAliveAudioEl.setAttribute('playsinline', 'true');
      keepAliveAudioEl.addEventListener('pause', () => {
        if (keepAliveAudioEl && activeWatchId !== null) {
          keepAliveAudioEl.play().catch(() => {});
        }
      });
    }
    if (keepAliveAudioEl && keepAliveAudioEl.paused) {
      keepAliveAudioEl.play().catch(() => {});
    }
  } catch {}

  // 2) Sub-audible WebAudio Oscillator (يبقي AudioContext نشطاً للإنذار الفوري)
  try {
    if (sharedAudioCtx && !keepAliveOsc) {
      keepAliveOsc = sharedAudioCtx.createOscillator();
      keepAliveGain = sharedAudioCtx.createGain();
      keepAliveOsc.type = 'sine';
      keepAliveOsc.frequency.value = 1; // 1Hz غير مسموع للأذن البشرية
      keepAliveGain.gain.value = 0.001;
      keepAliveOsc.connect(keepAliveGain);
      keepAliveGain.connect(sharedAudioCtx.destination);
      keepAliveOsc.start();
    }
  } catch {}

  // 3) Screen WakeLock API
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator && !wakeLockSentinel) {
        wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        wakeLockSentinel?.addEventListener?.('release', () => {
          wakeLockSentinel = null;
        });
      }
    } catch {}
  };
  requestWakeLock();

  if (!visibilityListenerAttached && typeof document !== 'undefined') {
    visibilityListenerAttached = true;
    document.addEventListener('visibilitychange', () => {
      if (activeWatchId !== null) {
        if (document.visibilityState === 'visible') {
          requestWakeLock();
        }
        if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
          sharedAudioCtx.resume().catch(() => {});
        }
        if (keepAliveAudioEl && keepAliveAudioEl.paused) {
          keepAliveAudioEl.play().catch(() => {});
        }
      }
    });
  }
}

function stopKeepAlive(): void {
  try {
    if (keepAliveAudioEl) {
      keepAliveAudioEl.pause();
      keepAliveAudioEl.currentTime = 0;
      keepAliveAudioEl = null;
    }
  } catch {}

  try {
    if (keepAliveOsc) {
      keepAliveOsc.stop();
      keepAliveOsc.disconnect();
      keepAliveOsc = null;
    }
    if (keepAliveGain) {
      keepAliveGain.disconnect();
      keepAliveGain = null;
    }
  } catch {}

  try {
    if (wakeLockSentinel) {
      wakeLockSentinel.release().catch(() => {});
      wakeLockSentinel = null;
    }
  } catch {}
}

// ─── تهيئة AudioContext + تشغيل الصامت فوراً مع لمسة العميل ──
export function initAudioContext(): AudioContext | null {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    startKeepAlive();
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

// ─── إطلاق سارينة الإنذار القصوى والاهتزاز ──────────────────
export function triggerIntenseAlarm(): void {
  if (isAlarmPlaying) return;
  isAlarmPlaying = true;

  try {
    const ctx = initAudioContext();
    if (ctx) {
      const playSirenCycle = () => {
        if (!isAlarmPlaying || !sharedAudioCtx) return;
        try {
          if (sharedAudioCtx.state === 'suspended') {
            sharedAudioCtx.resume().catch(() => {});
          }
          const now = sharedAudioCtx.currentTime;
          const osc1 = sharedAudioCtx.createOscillator();
          const osc2 = sharedAudioCtx.createOscillator();
          const gain = sharedAudioCtx.createGain();

          osc1.type = 'sawtooth';
          osc2.type = 'square';

          osc1.frequency.setValueAtTime(880, now);
          osc1.frequency.linearRampToValueAtTime(1760, now + 0.35);
          osc1.frequency.linearRampToValueAtTime(880, now + 0.7);

          osc2.frequency.setValueAtTime(920, now);
          osc2.frequency.linearRampToValueAtTime(1840, now + 0.35);
          osc2.frequency.linearRampToValueAtTime(920, now + 0.7);

          gain.gain.setValueAtTime(0.95, now);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(sharedAudioCtx.destination);

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 0.72);
          osc2.stop(now + 0.72);

          osc1.onended = () => {
            try {
              osc1.disconnect();
              osc2.disconnect();
              gain.disconnect();
            } catch {}
          };

          alarmOscillators.push(osc1, osc2);
          alarmGainNodes.push(gain);
        } catch {}
      };

      playSirenCycle();
      if (alarmIntervalId) clearInterval(alarmIntervalId);
      alarmIntervalId = setInterval(playSirenCycle, 750);
    }
  } catch {}

  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([800, 150, 800, 150, 1000]);
      if (vibrateIntervalId) clearInterval(vibrateIntervalId);
      vibrateIntervalId = setInterval(() => {
        if (!isAlarmPlaying) return;
        try {
          navigator.vibrate([800, 150, 800, 150, 1000]);
        } catch {}
      }, 2800);
    }
  } catch {}
}

// ─── إيقاف السارينة وتنظيف عقد الصوت ─────────────────────────
export function stopIntenseAlarm(): void {
  isAlarmPlaying = false;

  if (alarmIntervalId) {
    clearInterval(alarmIntervalId);
    alarmIntervalId = null;
  }
  if (vibrateIntervalId) {
    clearInterval(vibrateIntervalId);
    vibrateIntervalId = null;
  }

  for (const osc of alarmOscillators) {
    try {
      osc.stop();
      osc.disconnect();
    } catch {}
  }
  alarmOscillators = [];

  for (const g of alarmGainNodes) {
    try {
      g.disconnect();
    } catch {}
  }
  alarmGainNodes = [];

  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(0);
    }
  } catch {}
}

// ─── حفظ واسترجاع حالة الدرع ─────────────────────────────────
export function saveShieldState(state: ShieldState): void {
  try {
    localStorage.setItem(SHIELD_STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function loadShieldState(): ShieldState | null {
  try {
    const raw = localStorage.getItem(SHIELD_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ShieldState;
  } catch {
    return null;
  }
}

// ─── فحص وجود العميل داخل الجراج ────────────────────────────
export function checkUserInsideGarage(
  garageLat: number,
  garageLng: number,
  radiusMeters: number = GEOFENCE_RADIUS
): Promise<{ inside: boolean; distance: number; lat?: number; lng?: number }> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ inside: false, distance: -1 });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = calcDistance(
          garageLat,
          garageLng,
          pos.coords.latitude,
          pos.coords.longitude
        );
        resolve({
          inside: dist <= radiusMeters,
          distance: dist,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        resolve({ inside: false, distance: -1 });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  });
}

// ─── تسجيل جلسة الدرع على السيرفر (مع منع التكرار المتزامن) ───
export async function registerShieldSession(params: {
  sessionId: string;
  userId: string;
  phone: string;
  garageId: string;
  parkingLat: number;
  parkingLng: number;
}): Promise<string | null> {
  const { sessionId, userId, phone, parkingLat, parkingLng } = params;
  if (!sessionId) return null;

  const existingPromise = inFlightRegistrations.get(sessionId);
  if (existingPromise) return existingPromise;

  const task = (async (): Promise<string | null> => {
    try {
      const identifier = phone || userId || 'unknown';
      const { data: existing } = await supabase
        .from('shield_sessions')
        .select('id, session_id')
        .eq('session_id', sessionId)
        .is('ended_at', null)
        .maybeSingle();

      if (existing?.id) {
        return String(existing.id);
      }

      const nowIso = new Date().toISOString();
      const { data: inserted, error } = await supabase
        .from('shield_sessions')
        .insert({
          session_id: sessionId,
          user_id: identifier,
          phone: identifier,
          parking_lat: parkingLat,
          parking_lng: parkingLng,
          last_lat: parkingLat,
          last_lng: parkingLng,
          last_gps_at: nowIso,
          client_outside: false,
          theft_alerted: false,
          fake_mode: -1,
          alert_count: 0,
          fake_tick: 0,
          last_speed: null,
        })
        .select('id')
        .maybeSingle();

      if (error) {
        console.warn('⚠️ registerShieldSession insert warning:', error.message);
        return null;
      }
      return inserted?.id ? String(inserted.id) : null;
    } catch (err) {
      console.warn('⚠️ registerShieldSession error:', err);
      return null;
    } finally {
      inFlightRegistrations.delete(sessionId);
    }
  })();

  inFlightRegistrations.set(sessionId, task);
  return task;
}

// ─── إرسال إحداثيات وسرعة الـ GPS للسيرفر بالتوازي ───────────
async function sendGPSToServer(params: {
  sessionId: string;
  shieldId?: string | null;
  lat: number;
  lng: number;
  parkingLat?: number;
  parkingLng?: number;
  accuracy?: number;
  distance: number;
  isOutside: boolean;
  speedKmh?: number | null;
}): Promise<void> {
  const {
    sessionId,
    shieldId,
    lat,
    lng,
    parkingLat,
    parkingLng,
    accuracy,
    distance,
    isOutside,
    speedKmh,
  } = params;
  const nowIso = new Date().toISOString();

  try {
    const updatePayload: Record<string, any> = {
      last_lat: lat,
      last_lng: lng,
      last_gps_at: nowIso,
      client_outside: isOutside,
    };
    if (typeof parkingLat === 'number' && typeof parkingLng === 'number') {
      updatePayload.parking_lat = parkingLat;
      updatePayload.parking_lng = parkingLng;
    }
    if (typeof speedKmh === 'number' && speedKmh >= 0) {
      updatePayload.last_speed = speedKmh;
    }
    if (isOutside) {
      updatePayload.theft_alerted = true;
    }

    const updateQuery = shieldId
      ? supabase.from('shield_sessions').update(updatePayload).eq('id', shieldId).is('ended_at', null)
      : supabase.from('shield_sessions').update(updatePayload).eq('session_id', sessionId).is('ended_at', null);

    const locationInsert = supabase.from('shield_locations').insert({
      session_id: sessionId,
      shield_id: shieldId || null,
      lat,
      lng,
      accuracy: accuracy ? Math.round(accuracy) : null,
      distance: Math.round(distance),
      is_outside: isOutside,
      recorded_at: nowIso,
    });

    await Promise.all([
      updateQuery,
      isOutside || Date.now() - lastGpsSentAt >= GPS_SEND_INTERVAL * 2 ? locationInsert : Promise.resolve(),
    ]);
  } catch {}
}

// ─── بدء مراقبة الـ GPS والسرعة والجيوفنس (50م من مكان الركن الفعلي) ──
export function startShieldGPS(options: {
  sessionId: string;
  shieldId?: string | null;
  parkingLat: number;
  parkingLng: number;
  onGeofenceBreach?: (distance: number) => void;
  onGPSError?: () => void;
  onLocationUpdate?: (lat: number, lng: number, distance: number) => void;
}): () => void {
  const {
    sessionId,
    shieldId,
    parkingLat,
    parkingLng,
    onGeofenceBreach,
    onGPSError,
    onLocationUpdate,
  } = options;

  stopShieldGPSOnly();
  startKeepAlive();

  // استرجاع نقطة الركن الفعلية المثبتة لهذه الجلسة إن وجدت
  const saved = loadShieldState();
  let anchorLat =
    saved && saved.sessionId === sessionId && saved.parkingLat
      ? saved.parkingLat
      : parkingLat;
  let anchorLng =
    saved && saved.sessionId === sessionId && saved.parkingLng
      ? saved.parkingLng
      : parkingLng;
  let isAnchorLocked = Boolean(saved && saved.sessionId === sessionId && saved.anchorLocked);

  let breachTriggered = false;
  let lastWatchTickAt = Date.now();

  const handlePosition = (pos: GeolocationPosition) => {
    const now = Date.now();
    lastWatchTickAt = now;

    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy || 0;

    // 🎯 عند أول قراءة GPS بعد بدء الجلسة: تثبيت موقع ركن السيارة الفعلي كمركز الـ 0 متر
    let newlyLockedAnchor = false;
    if (!isAnchorLocked) {
      isAnchorLocked = true;
      newlyLockedAnchor = true;
      anchorLat = lat;
      anchorLng = lng;
      const currentSaved = loadShieldState();
      if (currentSaved && currentSaved.sessionId === sessionId) {
        saveShieldState({
          ...currentSaved,
          parkingLat: anchorLat,
          parkingLng: anchorLng,
          anchorLocked: true,
        });
      }
    }

    const dist = calcDistance(anchorLat, anchorLng, lat, lng);

    let speedMps = pos.coords.speed && pos.coords.speed > 0 ? pos.coords.speed : 0;
    if (prevSpeedSample) {
      const dt = (now - prevSpeedSample.t) / 1000;
      if (dt > 1.5) {
        const dMoved = calcDistance(prevSpeedSample.lat, prevSpeedSample.lng, lat, lng);
        if (accuracy <= 65) {
          speedMps = Math.max(speedMps, dMoved / dt);
        }
      }
    }
    prevSpeedSample = { lat, lng, t: now };
    const speedKmh = speedMps >= 1 ? Math.round(speedMps * 3.6) : 0;
    const isMovingAtCarSpeed = speedMps >= SPEED_BREACH_MPS;

    onLocationUpdate?.(lat, lng, dist);

    // 🚨 شرط الاختراق: التحرك مسافة تزيد عن 50 متر من نقطة الركن المثبتة
    const isOutside = dist > GEOFENCE_RADIUS;
    if (isOutside && !breachTriggered) {
      breachTriggered = true;
      onGeofenceBreach?.(dist);
    }

    const movedSinceLastSent = lastSentCoords
      ? calcDistance(lastSentCoords.lat, lastSentCoords.lng, lat, lng)
      : 999;

    const shouldSendForSpeed = isMovingAtCarSpeed && now - lastSpeedSentAt >= 8000;
    const shouldSendRegular =
      now - lastGpsSentAt >= GPS_SEND_INTERVAL &&
      (movedSinceLastSent >= MIN_MOVE_THRESHOLD || !lastSentCoords);

    if (newlyLockedAnchor || isOutside || shouldSendForSpeed || shouldSendRegular) {
      lastGpsSentAt = now;
      if (shouldSendForSpeed) lastSpeedSentAt = now;
      lastSentCoords = { lat, lng };
      sendGPSToServer({
        sessionId,
        shieldId,
        lat,
        lng,
        parkingLat: newlyLockedAnchor ? anchorLat : undefined,
        parkingLng: newlyLockedAnchor ? anchorLng : undefined,
        accuracy,
        distance: dist,
        isOutside,
        speedKmh: isMovingAtCarSpeed ? speedKmh : null,
      });
    }
  };

  if ('geolocation' in navigator) {
    activeWatchId = navigator.geolocation.watchPosition(
      handlePosition,
      () => {
        onGPSError?.();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 10000,
      }
    );

    activeFallbackInterval = setInterval(() => {
      if (keepAliveAudioEl && keepAliveAudioEl.paused) {
        keepAliveAudioEl.play().catch(() => {});
      }
      if (Date.now() - lastWatchTickAt < 9_000) return;
      navigator.geolocation.getCurrentPosition(
        handlePosition,
        () => {},
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 8000 }
      );
    }, GPS_SEND_INTERVAL);
  } else {
    onGPSError?.();
  }

  return () => {
    stopShieldGPSOnly();
  };
}

function stopShieldGPSOnly(): void {
  if (activeWatchId !== null && 'geolocation' in navigator) {
    try {
      navigator.geolocation.clearWatch(activeWatchId);
    } catch {}
    activeWatchId = null;
  }
  if (activeFallbackInterval !== null) {
    clearInterval(activeFallbackInterval);
    activeFallbackInterval = null;
  }
}

// ─── تدمير وإيقاف الدرع بالكامل عند انتهاء الجلسة ────────────
export function destroyShield(): void {
  stopIntenseAlarm();
  stopShieldGPSOnly();
  stopKeepAlive();
  lastSentCoords = null;
  prevSpeedSample = null;
  lastGpsSentAt = 0;
  lastSpeedSentAt = 0;
}