import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const ALERT_POOL = [
  { type: 'warning', title: '⚠️ تحذير أمني', body: 'تم رصد حركة مريبة حول سيارتك', weight: 15 },
  { type: 'warning', title: '⚠️ تنبيه', body: 'شخص غريب يقترب من سيارتك', weight: 15 },
  { type: 'warning', title: '⚠️ انتبه', body: 'تم رصد اهتزاز غير طبيعي', weight: 15 },
  { type: 'resolved', title: '✅ تم التأمين', body: 'السيارة آمنة، لا توجد تهديدات', weight: 25 },
  { type: 'resolved', title: '✅ تم التحقق', body: 'كل شيء على ما يرام', weight: 25 },
  { type: 'resolved', title: '✅ استقرار', body: 'المنطقة آمنة حالياً', weight: 25 },
  { type: 'status', title: '🛡️ الدرع نشط', body: 'حماية مستمرة لسيارتك', weight: 40 },
  { type: 'status', title: '🛡️ تحديث', body: 'الدرع يعمل بكفاءة كاملة', weight: 40 },
  { type: 'status', title: '🛡️ مراقبة', body: 'نراقب سيارتك على مدار الساعة', weight: 40 },
  { type: 'status', title: '🛡️ تقرير', body: 'لا توجد أحداث مشبوهة', weight: 40 },
  { type: 'report', title: '📋 تقرير أمني', body: 'تم فحص المنطقة المحيطة', weight: 12 },
  { type: 'report', title: '📋 ملخص', body: 'لا توجد مخالفات أمنية', weight: 12 },
  { type: 'qrScan', title: '📱 مسح QR', body: 'تم التحقق من هوية الحارس', weight: 8 },
  { type: 'qrScan', title: '📱 تأكيد', body: 'الحارس المعتمد في الموقع', weight: 8 },
];

function pickWeightedAlert() {
  const totalWeight = ALERT_POOL.reduce((sum, a) => sum + a.weight, 0);
  let random = Math.random() * totalWeight;
  for (const alert of ALERT_POOL) {
    random -= alert.weight;
    if (random <= 0) return alert;
  }
  return ALERT_POOL[0];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🕐 Shield cron triggered at', new Date().toISOString());

    const VAPID_EMAIL = Deno.env.get('VAPID_EMAIL') || 'mailto:admin@parkn24.com';
    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    console.log('🔑 VAPID Public Key (first 20):', VAPID_PUBLIC_KEY.substring(0, 20));

    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1️⃣ جلب الدروع النشطة
    const { data: shields, error: shieldError } = await supabase
      .from('shield_sessions')
      .select('*')
      .is('ended_at', null);

    if (shieldError) {
      console.error('❌ Shield DB error:', shieldError);
      return new Response(JSON.stringify({ error: 'Shield DB error' }), { status: 500 });
    }

    console.log(`Found ${shields?.length ?? 0} active shields`);

    if (!shields || shields.length === 0) {
      return new Response(JSON.stringify({ success: true, shields: 0 }));
    }

    let totalSent = 0;
    let totalFailed = 0;

    // 2️⃣ لكل درع
    for (const shield of shields) {
      console.log(`\n🛡️ Processing shield: id=${shield.id}, phone=${shield.phone}, alerts=${shield.alert_count}`);

      // حد أقصى 2 إشعار وهمي
      if (shield.alert_count >= 2) {
        console.log(`⏭️ Skipping — already sent ${shield.alert_count} alerts (max 2)`);
        continue;
      }

      // 3️⃣ جلب الـ subscription
      const { data: subs, error: subError } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('phone', shield.phone)
        .limit(1);

      if (subError) {
        console.error('❌ Subscription DB error:', subError);
        continue;
      }

      console.log(`📋 Found ${subs?.length ?? 0} subscriptions for phone ${shield.phone}`);

      if (!subs || subs.length === 0) {
        console.log('⚠️ No subscription found for this phone!');
        continue;
      }

      const sub = subs[0];
      console.log(`📱 Subscription endpoint: ${sub.endpoint?.substring(0, 60)}...`);
      console.log(`📱 p256dh: ${sub.p256dh?.substring(0, 20)}...`);
      console.log(`📱 auth: ${sub.auth?.substring(0, 10)}...`);

      // 4️⃣ اختيار الإشعار
      const alert = pickWeightedAlert();
      console.log(`📨 Selected alert: [${alert.type}] ${alert.title}`);

      const payload = JSON.stringify({
        title: alert.title,
        body: alert.body,
        tag: `shield-${alert.type}-${shield.id.slice(0, 8)}-${shield.alert_count}`,
        data: { type: 'shield', shieldId: shield.id },
      });

      // 5️⃣ إرسال الـ push
      try {
        console.log('🚀 Sending push notification...');
        
        const result = await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload,
          { TTL: 86400, urgency: 'high' }
        );

        console.log('✅ Push sent successfully!', result.statusCode);
        totalSent++;

        // تحديث عداد الإشعارات
        await supabase
          .from('shield_sessions')
          .update({ alert_count: (shield.alert_count || 0) + 1 })
          .eq('id', shield.id);

        console.log(`📊 Alert count updated to ${(shield.alert_count || 0) + 1}`);

      } catch (err: any) {
        totalFailed++;
        console.error('❌ Push FAILED!');
        console.error('   Status:', err.statusCode);
        console.error('   Message:', err.message);
        console.error('   Body:', err.body);

        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          console.log('🗑️ Deleted expired subscription');
        }
      }
    }

    console.log(`\n📊 Final: sent=${totalSent}, failed=${totalFailed}`);

    return new Response(
      JSON.stringify({ success: true, shields: shields.length, sent: totalSent, failed: totalFailed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('❌ CRITICAL ERROR:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});