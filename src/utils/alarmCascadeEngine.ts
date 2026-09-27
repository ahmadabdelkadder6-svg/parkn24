// src/utils/alarmCascadeEngine.ts

/**
 * 🚨 بروتوكول الإنذار الشامل وقفل التحصيل (The Alarm Cascade Engine)
 */

import { supabase } from '../lib/supabase';

export interface BreachPayload {
  sessionId: string;
  plateNumber?: string;
  reason: string;
  lat?: number;
  lng?: number;
}

class AlarmCascadeService {
  private audioCtx: AudioContext | null = null;
  private isAlarmPlaying = false;
  private isVibrating = false;
  private sirenInterval: any = null;

  // ──────────────────────────────────────────────
  // 1️⃣ إطلاق صفارة الإنذار المزدوجة (2600Hz High-Pitch Siren)
  // ──────────────────────────────────────────────
  public startEmergencySiren() {
    if (this.isAlarmPlaying || typeof window === 'undefined') return;

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      this.audioCtx = new AudioCtxClass();
      this.isAlarmPlaying = true;

      let highTone = true;
      const playTone = () => {
        if (!this.audioCtx || !this.isAlarmPlaying) return;

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(highTone ? 2600 : 1200, this.audioCtx.currentTime);

        gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.25);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.25);

        highTone = !highTone;
      };

      playTone();
      this.sirenInterval = setInterval(playTone, 300);
    } catch (err) {
      console.warn('🚨 Emergency siren failed to trigger:', err);
    }
  }

  // ──────────────────────────────────────────────
  // 2️⃣ الاهتزاز التكتيكي العنيف (آمن ومحمي)
  // ──────────────────────────────────────────────
  public startTacticalVibration() {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        this.isVibrating = true;
        navigator.vibrate([500, 100, 500, 100, 800, 200, 1000]);
      }
    } catch (e) {
      // تجاهل الحظر المسبق للمتصفح بأمان
    }
  }

  // ──────────────────────────────────────────────
  // 3️⃣ إيقاف الإنذار والصفارة (بدون أخطاء للمتصفح)
  // ──────────────────────────────────────────────
  public stopAlarm() {
    this.isAlarmPlaying = false;
    if (this.sirenInterval) {
      clearInterval(this.sirenInterval);
      this.sirenInterval = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    // لا نستدعي إيقاف الاهتزاز إلا لو كان قد اشتغل بالفعل لمنع تدخل المتصفح
    if (this.isVibrating && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch {}
      this.isVibrating = false;
    }
  }

  // ──────────────────────────────────────────────
  // 4️⃣ بروتوكول الاختراق الكامل
  // ──────────────────────────────────────────────
  public async triggerBreachProtocol(payload: BreachPayload): Promise<boolean> {
    try {
      this.startEmergencySiren();
      this.startTacticalVibration();

      if (supabase) {
        const { error } = await supabase
          .from('sessions')
          .update({
            breach_reason: payload.reason,
            last_security_ping: new Date().toISOString(),
          })
          .eq('id', payload.sessionId);

        if (error) {
          console.error('❌ Failed to update breach status in DB:', error);
          return false;
        }
      }

      console.warn(`🚨 [BREACH CONFIRMED] Session: ${payload.sessionId} - Reason: ${payload.reason}`);
      return true;
    } catch (error) {
      console.error('🚨 Error executing breach protocol:', error);
      return false;
    }
  }

  // ──────────────────────────────────────────────
  // 5️⃣ فحص أمان التحصيل
  // ──────────────────────────────────────────────
  public isCheckoutAllowed(session: { breach_reason?: string | null }): boolean {
    return !session?.breach_reason;
  }
}

export const alarmCascade = new AlarmCascadeService();