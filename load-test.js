import http from 'k6/http';
import { check, sleep, group } from 'k6';

export const options = {
  stages: [
    { duration: '15s', target: 30 },  // 30 مستخدم
    { duration: '30s', target: 100 }, // 100 مستخدم في نفس اللحظة
    { duration: '15s', target: 0 },   // تبريد
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'], // الاستجابة في أقل من ثانية
    http_req_failed: ['rate<0.05'],    // نسبة الأخطاء أقل من 5%
  },
};

const SUPABASE_URL = __ENV.SUPABASE_URL || 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_KEY = __ENV.SUPABASE_ANON_KEY || 'YOUR_KEY';

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
};

export default function () {
  // 1️⃣ اختبار نبضات الـ GPS للسياس
  group('1. GPS Pings', () => {
    const payload = JSON.stringify({
      garage_id: 'test-garage',
      valet_number: Math.floor(Math.random() * 3) + 1,
      is_inside: true,
      distance: 50,
      updated_at: new Date().toISOString(),
    });

    const res = http.post(`${SUPABASE_URL}/rest/v1/valet_locations`, payload, { headers });
    check(res, {
      'GPS Ping Saved (201/200/409)': (r) => r.status === 201 || r.status === 200 || r.status === 409,
    });
  });

  sleep(1);

  // 2️⃣ اختبار جلب الجلسات والبيانات من السيرفر
  group('2. Fetch Sessions', () => {
    const res = http.get(`${SUPABASE_URL}/rest/v1/sessions?select=*&limit=20`, { headers });
    check(res, {
      'Fetch Sessions Success (200)': (r) => r.status === 200,
    });
  });

  sleep(1);
}