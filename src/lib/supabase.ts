import { createClient } from '@supabase/supabase-js';

// ⚠️ غيّر هذه القيم لمشروعك على Supabase
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY';

// ─── Production Safety Check ───
// تنبيه في الكونسول لو لسه المفاتيح placeholder
if (
  SUPABASE_URL.includes('YOUR_PROJECT') ||
  SUPABASE_ANON_KEY === 'YOUR_ANON_KEY'
) {
  console.warn(
    "⚠️ [Park'n 24] Supabase credentials are still placeholders. " +
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
  );
}

// ─── Fetch with Exponential Backoff Retry ───
// إعادة المحاولة تلقائياً عند أخطاء السيرفر (5xx) أو انقطاع الشبكة
// لا يعيد المحاولة عند أخطاء العميل (4xx) لأنها لن تنجح
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(input, init);

      // أخطاء العميل (4xx) — لا فائدة من إعادة المحاولة
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // أخطاء السيرفر (5xx) — إعادة محاولة مع تأخير متزايد
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        const delay =
          BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200;
        console.warn(
          `⚠️ [Supabase] Server error ${response.status}, retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return response;
    } catch (err) {
      lastError = err as Error;

      // خطأ شبكة — إعادة محاولة
      if (attempt < MAX_RETRIES) {
        const delay =
          BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200;
        console.warn(
          `⚠️ [Supabase] Network error, retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    }
  }

  throw lastError ?? new Error('fetchWithRetry: all retries exhausted');
}

// ─── Supabase Client ───
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'parkn24-auth',
  },
  global: {
    fetch: fetchWithRetry,
    headers: {
      'X-Client-Info': 'parkn24-pwa',
    },
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  db: {
    schema: 'public',
  },
});