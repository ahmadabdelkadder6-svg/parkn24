import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '15s', target: 20 },  // زيادة تدريجية لـ 20 مستخدم
    { duration: '30s', target: 50 },  // رفع الضغط لـ 50 مستخدم متزامن
    { duration: '20s', target: 100 }, // الوصول لذروة الضغط (100 مستخدم في نفس الثانية)
    { duration: '15s', target: 0 },   // إنهاء تدريجي للزوار
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],    // نسبة الأخطاء أقل من 1%
    http_req_duration: ['p(95)<2000'], // سرعة الرد لـ 95% من الطلبات أقل من ثانيتين
  },
};

export default function () {
  const res = http.get('https://parkn24.vercel.app/');
  check(res, {
    '✅ تم فتح الصفحة الرئيسية (200 OK)': (r) => r.status === 200,
  });

  sleep(2);

  const installRes = http.get('https://parkn24.vercel.app/install');
  check(installRes, {
    '✅ صفحة التثبيت استجابت بنجاح': (r) => r.status === 200,
  });

  sleep(1);
}
