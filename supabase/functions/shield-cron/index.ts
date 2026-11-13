// supabase/functions/shield-cron/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const ALERT_POOL: { type: string; title: string; body: string }[] = [
  { type: 'warning', title: '⚠️ تنبيه حركة', body: 'تم رصد حركة قريبة من مكان الركن' },
  { type: 'warning', title: '⚠️ تنبيه', body: 'حركة غير مألوفة حول السيارة' },
  { type: 'warning', title: '⚠️ انتبه', body: 'تم رصد اهتزاز خفيف في السيارة' },
  { type: 'warning', title: '⚠️ تنبيه', body: 'حركة قريبة من مكان الركن' },
  { type: 'warning', title: '⚠️ تنبيه حركة', body: 'تم رصد نشاط في المنطقة المحيطة' },
  { type: 'resolved', title: '✅ تم التحقق', body: 'السيارة في مكانها، كلو تمام' },
  { type: 'resolved', title: '✅ تم التحقق', body: 'كل شيء طبيعي حول السيارة' },
  { type: 'resolved', title: '✅ استقرار', body: 'المنطقة هادئة حالياً' },
  { type: 'resolved', title: '✅ طبيعي', body: 'تم فحص السيارة ولا توجد ملاحظات' },
  { type: 'resolved', title: '✅ طبيعي', body: 'لا توجد أي ملاحظات غير عادية' },
  { type: 'resolved', title: '✅ تم الفحص', body: 'المحيط طبيعي تماماً' },
  { type: 'resolved', title: '✅ هدوء', body: 'لا توجد أي إشارات غير عادية' },
  { type: 'status', title: '🛡️ الحماية نشطة', body: 'مراقبة مستمرة للسيارة' },
  { type: 'status', title: '🛡️ تحديث', body: 'نظام المراقبة يعمل بكفاءة' },
  { type: 'status', title: '🛡️ مراقبة', body: 'نراقب السيارة على مدار الساعة' },
  { type: 'status', title: '🛡️ تقرير', body: 'لا توجد ملاحظات حالياً' },
  { type: 'status', title: '🛡️ نشط', body: 'نظام المراقبة يعمل بشكل طبيعي' },
  { type: 'status', title: '🛡️ متصل', body: 'نظام المراقبة متصل ومستقر' },
  { type: 'status', title: '🛡️ فحص', body: 'تم فحص المحيط بنجاح' },
  { type: 'status', title: '🛡️ حراسة', body: 'السيارة تحت المراقبة الكاملة' },
  { type: 'status', title: '🛡️ تأمين', body: 'جميع أنظمة المراقبة مفعّلة' },
  { type: 'status', title: '🛡️ رصد', body: 'المراقبة مستمرة بدون انقطاع' },
  { type: 'status', title: '🛡️ جاهز', body: 'نظام المراقبة في أعلى درجات الاستعداد' },
  { type: 'report', title: '📋 تقرير', body: 'تم فحص المنطقة المحيطة بالسيارة' },
  { type: 'report', title: '📋 ملخص', body: 'لا توجد ملاحظات مسجّلة' },
  { type: 'report', title: '📋 تقرير دوري', body: 'المنطقة هادئة وطبيعية' },
  { type: 'report', title: '📋 سجل المراقبة', body: 'لا توجد أحداث تستدعي التنبيه' },
  { type: 'qrScan', title: '📱 تحقق', body: 'تم التحقق من كود السيارة' },
  { type: 'qrScan', title: '📱 تأكيد', body: 'تم التحقق من مكان الركن' },
];

function pickWeightedAlert() {
  const typeWeights = [
    { type: 'warning', weight: 15 },
    { type: 'resolved', weight: 25 },
    { type: 'status', weight: 40 },
    { type: 'report', weight: 12 },
    { type: 'qrScan', weight: 8 },
  ];
  const total = typeWeights.reduce((sum, t) => sum + t.weight, 0);
  let roll = Math.random() * total;
  let chosenType = 'status';
  for (const tw of typeWeights) {
    roll -= tw.weight;
    if (roll <= 0) { chosenType = tw.type; break; }
  }
  const ofType = ALERT_POOL.filter((a) => a.type === chosenType);
  return ofType[Math.floor(Math.random() * ofType.length)];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🕐 Shield cron at', new Date().toISOString());

    const VAPID_EMAIL = Deno.env.get('VAPID_EMAIL') || 'mailto:admin@parkn24.com';
    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ✅ جلب الدروع النشطة
    const { data: shields } = await supabase
      .from('shield_sessions')
      .select('id, session_id, user_id, phone, alert_count, fake_tick')
      .is('ended_at', null);

    if (!shields || shields.length === 0) {
      return new Response(JSON.stringify({ success: true, shields: 0, message: 'No active shields' }));
    }

    console.log(`Found ${shields.length} active shields`);

    // ─── Test mode ───
    const url = new URL(req.url);
    if (url.searchParams.get('test') === '1') {
      let sent = 0;
      for (const s of shields) {
        // ✅ الحل: نجيب الـ UUID الحقيقي من جدول sessions
        const { data: session } = await supabase
          .from('sessions')
          .select('user_id')
          .eq('id', s.session_id)
          .maybeSingle();

        const realUserId = session?.user_id;
        if (!realUserId) {
          console.log(`⚠️ No real user_id for session ${s.session_id}`);
          continue;
        }

        const { data: subs } = await supabase
          .from('push_subscriptions')
          .select('endpoint, p256dh, auth')
          .eq('user_id', realUserId)
          .limit(1);

        if (!subs || subs.length === 0) {
          console.log(`⚠️ No push sub for user ${realUserId}`);
          continue;
        }

        try {
          await webpush.sendNotification(
            { endpoint: subs[0].endpoint, keys: { p256dh: subs[0].p256dh, auth: subs[0].auth } },
            JSON.stringify({ title: '🔔 اختبار', body: `لو وصلك ده على ${s.phone} يبقى شغال ✅`, tag: 'test', data: { url: '/garage' } }),
            { TTL: 3600, urgency: 'high' }
          );
          sent++;
        } catch (e: any) { console.error('Test fail:', e.statusCode); }
      }
      return new Response(JSON.stringify({ test: true, sent, total: shields.length }));
    }

    // ─── Cleanup ───
    const phoneGroups = new Map<string, any[]>();
    for (const s of shields) {
      const p = s.phone || 'unknown';
      if (!phoneGroups.has(p)) phoneGroups.set(p, []);
      phoneGroups.get(p)!.push(s);
    }
    for (const [, sessions] of phoneGroups) {
      if (sessions.length <= 1) continue;
      for (let i = 1; i < sessions.length; i++) {
        await supabase.from('shield_sessions')
          .update({ ended_at: new Date().toISOString() })
          .eq('session_id', sessions[i].session_id);
      }
    }

    let totalSent = 0;
    let totalSkipped = 0;

    for (const shield of shields) {
      const alertCount = shield.alert_count || 0;
      const tick = shield.fake_tick || 0;
      console.log(`\n🛡️ Shield: ${shield.phone}, alerts=${alertCount}, tick=${tick}/6`);

      // ✅ الحل: نجيب الـ UUID الحقيقي من جدول sessions
      const { data: session } = await supabase
        .from('sessions')
        .select('user_id, status')
        .eq('id', shield.session_id)
        .maybeSingle();

      if (!session || session.status !== 'active') {
        await supabase.from('shield_sessions')
          .update({ ended_at: new Date().toISOString() })
          .eq('session_id', shield.session_id);
        console.log(`🔒 Session ${shield.session_id} ended — shield auto-closed`);
        totalSkipped++;
        continue;
      }

      const realUserId = session.user_id;

      // ✅ اقرأ الـ Push Keys من push_subscriptions بالـ UUID الحقيقي
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', realUserId)
        .limit(1);

      if (!subs || subs.length === 0) {
        console.log(`⚠️ No push subscription for user ${realUserId}`);
        totalSkipped++;
        continue;
      }

      const pushSub = subs[0];

      // ✅ مفيش حد أقصى — إشعارات مستمرة
      const newTick = tick + 1;
      if (newTick < 6) {
        await supabase.from('shield_sessions')
          .update({ fake_tick: newTick })
          .eq('session_id', shield.session_id);
        console.log(`⏳ Tick ${newTick}/6`);
        totalSkipped++;
        continue;
      }

      const alert = pickWeightedAlert();
      const payload = JSON.stringify({
        title: alert.title,
        body: alert.body,
        tag: `shield-${alert.type}-${shield.session_id.slice(0, 8)}-${alertCount}`,
        data: { type: 'shield', url: '/garage' },
      });

      try {
        console.log(`🚀 Sending alert #${alertCount + 1}: ${alert.title}`);
        await webpush.sendNotification(
          { endpoint: pushSub.endpoint, keys: { p256dh: pushSub.p256dh, auth: pushSub.auth } },
          payload,
          { TTL: 86400, urgency: 'high' }
        );
        console.log('✅ Sent!');
        totalSent++;

        await supabase.from('shield_sessions')
          .update({ alert_count: alertCount + 1, fake_tick: 0 })
          .eq('session_id', shield.session_id);

      } catch (err: any) {
        console.error('❌ Failed:', err.statusCode, err.message);
        await supabase.from('shield_sessions')
          .update({ fake_tick: 0 })
          .eq('session_id', shield.session_id);

        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('push_subscriptions')
            .delete()
            .eq('endpoint', pushSub.endpoint);
        }
      }
    }

    console.log(`\n📊 sent=${totalSent}, skipped=${totalSkipped}`);
    return new Response(JSON.stringify({ success: true, shields: shields.length, sent: totalSent, skipped: totalSkipped }));

  } catch (err) {
    console.error('❌ Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});