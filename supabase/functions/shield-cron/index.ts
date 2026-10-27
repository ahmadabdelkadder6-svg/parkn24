import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const ALERT_POOL = [
  { type: 'warning',  title: '⚠️ تنبيه أمني',       body: 'تم رصد حركة مشبوهة بجوار سيارتك' },
  { type: 'warning',  title: '⚠️ اقتراب غير مألوف',  body: 'شخص يقترب من السيارة بشكل متكرر' },
  { type: 'warning',  title: '⚠️ اهتزاز خفيف',       body: 'تم رصد اهتزاز في هيكل السيارة' },
  { type: 'warning',  title: '⚠️ باب مفتوح',          body: 'يبدو أن أحد الأبواب لم يُغلق بإحكام' },
  { type: 'resolved', title: '✅ تم الحل',            body: 'الحركة المشبوهة كانت عابرة، كلو أمان' },
  { type: 'resolved', title: '✅ إنذار كاذب',         body: 'الاهتزاز كان بسبب سيارة مجاورة، لا تقلق' },
  { type: 'resolved', title: '✅ تم التأكيد',         body: 'السايس أكد إن كل حاجة تمام حولين العربية' },
  { type: 'resolved', title: '✅ المنطقة آمنة',       body: 'تم فحص المنطقة المحيطة — لا توجد تهديدات' },
  { type: 'resolved', title: '✅ تنبيه سابق',         body: 'التنبيه السابق كان بسبب حيوان أليف، كلو كويس' },
  { type: 'resolved', title: '✅ تم التحقق',          body: 'المراقبة أكدت سلامة سيارتك' },
  { type: 'resolved', title: '✅ إنذار مغلوط',        body: 'الإنذار كان بسبب رياح قوية، سيارتك سليمة' },
  { type: 'status',   title: '🛡️ الدرع نشط',         body: 'سيارتك محمية ومراقبة بنجاح' },
  { type: 'status',   title: '🛡️ تحديث أمني',        body: 'نظام الدرع يعمل بكفاءة — لا تهديدات' },
  { type: 'status',   title: '🛡️ فحص دوري',          body: 'تم إجراء فحص أمني — كل شيء طبيعي' },
  { type: 'status',   title: '🛡️ مراقبة مستمرة',     body: 'كل شيء يعمل بشكل طبيعي' },
  { type: 'status',   title: '🛡️ اتصال مستقر',       body: 'اتصال الدرع بالسيرفر مستقر 100%' },
  { type: 'status',   title: '🛡️ بطارية المراقبة',   body: 'أجهزة المراقبة شغالة بكامل طاقتها' },
  { type: 'status',   title: '🛡️ GPS متصل',          body: 'تتبع موقع السيارة نشط ودقيق' },
  { type: 'status',   title: '🛡️ تحديث النظام',      body: 'تم تحديث خوارزمية الكشف عن التهديدات' },
  { type: 'status',   title: '🛡️ تقرير نصف ساعي',    body: 'لا توجد أي أحداث غير طبيعية' },
  { type: 'status',   title: '🛡️ المنطقة هادئة',     body: 'الجراج هادئ ومراقبة كاملة' },
  { type: 'status',   title: '🛡️ وضع الحماية',       body: 'الدرع في وضع الحماية القصوى' },
  { type: 'report',   title: '📋 تقرير أمني',         body: 'لا توجد تهديدات في المنطقة المحيطة' },
  { type: 'report',   title: '📋 ملخص المراقبة',      body: '0 تهديدات • 0 إنذارات • سيارتك بخير' },
  { type: 'report',   title: '📋 تقرير الجراج',       body: 'المكان آمن — 3 دوريات مرور اليوم' },
  { type: 'report',   title: '📋 سجل الأحداث',        body: 'آخر 30 دقيقة: لا أحداث مريبة' },
  { type: 'qrScan',   title: '📱 مسح QR',             body: 'تم مسح رمز التحقق بنجاح' },
  { type: 'qrScan',   title: '📱 تحقق دوري',          body: 'تم مسح رمز الدرع — الهوية مؤكدة' },
  { type: 'qrScan',   title: '📱 تأكيد أمني',         body: 'رمز التحقق تم مسحه — الدرع يعمل' },
];

function pickWeightedAlert() {
  const roll = Math.random() * 100;
  let type: string;
  if (roll < 15) type = 'warning';
  else if (roll < 40) type = 'resolved';
  else if (roll < 80) type = 'status';
  else if (roll < 92) type = 'report';
  else type = 'qrScan';
  const pool = ALERT_POOL.filter(a => a.type === type);
  return pool[Math.floor(Math.random() * pool.length)];
}

async function runShieldCron() {
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');

  if (!vapidPublic || !vapidPrivate) {
    console.error('❌ VAPID keys missing from secrets!');
    return { sent: 0, shields: 0, error: 'VAPID keys missing' };
  }

  // ✅ normalize الـ keys عشان تكون URL-safe بدون padding
  const cleanPublic = vapidPublic.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const cleanPrivate = vapidPrivate.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  webpush.setVapidDetails(
    'mailto:admin@parkn24.com',
    cleanPublic,
    cleanPrivate
  );

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: shields, error: dbErr } = await supabase
    .from('shield_sessions')
    .select('*')
    .is('ended_at', null)
    .not('push_endpoint', 'is', null);

  if (dbErr) {
    console.error('❌ DB error:', dbErr.message);
    return { sent: 0, shields: 0, error: dbErr.message };
  }

  if (!shields?.length) {
    console.log('No active shields found');
    return { sent: 0, shields: 0 };
  }

  console.log(`Found ${shields.length} active shields`);
  let totalSent = 0;

  for (const shield of shields) {
    const ageMin = (Date.now() - new Date(shield.started_at).getTime()) / 60000;
    if (ageMin < 5) continue;
    if (shield.alert_count >= 2) continue;

    const roll = Math.random();
    const count = roll < 0.35 ? 0 : roll < 0.70 ? 1 : 2;
    const actualCount = Math.min(count, 2 - shield.alert_count);
    if (actualCount === 0) continue;

    let sent = 0;
    for (let i = 0; i < actualCount; i++) {
      const alert = pickWeightedAlert();
      const tag = `shield-${alert.type}-${shield.id.slice(0, 8)}-${i}`;

      try {
        await webpush.sendNotification(
          {
            endpoint: shield.push_endpoint,
            keys: {
              p256dh: shield.push_p256dh,
              auth: shield.push_auth,
            },
          },
          JSON.stringify({
            title: alert.title,
            body: alert.body,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-192x192.png',
            tag,
            data: {
              type: `shield-${alert.type}`,
              sessionId: shield.session_id,
            },
          })
        );
        sent++;
        console.log(`✅ Sent ${alert.type} to ${shield.phone || shield.id}`);
      } catch (e: any) {
        console.error(`❌ Push failed:`, e.statusCode, e.message);
        if (e.statusCode === 410) {
          await supabase
            .from('shield_sessions')
            .update({ ended_at: new Date().toISOString() })
            .eq('id', shield.id);
          break;
        }
      }
    }

    if (sent > 0) {
      await supabase
        .from('shield_sessions')
        .update({ alert_count: shield.alert_count + sent })
        .eq('id', shield.id);
      totalSent += sent;
    }
  }

  return { sent: totalSent, shields: shields.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  console.log('🕐 Shield cron triggered at', new Date().toISOString());

  try {
    const result = await runShieldCron();
    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (err: any) {
    console.error('❌ Cron crashed:', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});