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

function randomMinutes(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

    const { data: shields } = await supabase
      .from('shield_sessions')
      .select('*')
      .is('ended_at', null);

    if (!shields || shields.length === 0) {
      return new Response(JSON.stringify({ success: true, shields: 0 }));
    }

    console.log(`Found ${shields.length} active shields`);

    // ─── Test mode ───
    const url = new URL(req.url);
    if (url.searchParams.get('test') === '1') {
      let sent = 0;
      for (const s of shields) {
        if (!s.push_endpoint || !s.push_p256dh || !s.push_auth) continue;
        try {
          await webpush.sendNotification(
            { endpoint: s.push_endpoint, keys: { p256dh: s.push_p256dh, auth: s.push_auth } },
            JSON.stringify({ title: '🔔 اختبار', body: `لو وصلك ده على ${s.phone} يبقى شغال ✅`, tag: 'test', data: { url: '/garage' } }),
            { TTL: 3600, urgency: 'high' }
          );
          sent++;
        } catch (e: any) { console.error('Test fail:', e.statusCode); }
      }
      return new Response(JSON.stringify({ test: true, sent, total: shields.length }));
    }

    // ─── Cleanup: أغلق الجلسات المكررة ───
    const phoneGroups = new Map<string, any[]>();
    for (const s of shields) {
      const p = s.phone || 'unknown';
      if (!phoneGroups.has(p)) phoneGroups.set(p, []);
      phoneGroups.get(p)!.push(s);
    }
    for (const [, sessions] of phoneGroups) {
      if (sessions.length <= 1) continue;
      sessions.sort((a, b) => {
        const ta = a.last_gps_at ? new Date(a.last_gps_at).getTime() : 0;
        const tb = b.last_gps_at ? new Date(b.last_gps_at).getTime() : 0;
        return tb - ta;
      });
      for (let i = 1; i < sessions.length; i++) {
        await supabase.from('shield_sessions')
          .update({ ended_at: new Date().toISOString() })
          .eq('session_id', sessions[i].session_id);
      }
    }

    let totalSent = 0;
    let totalSkipped = 0;
    const now = new Date();

    for (const shield of shields) {
      console.log(`\n🛡️ Shield: ${shield.phone}, mode=${shield.fake_mode}, alerts=${shield.alert_count}`);

      // ─── هل عنده push keys؟ ───
      if (!shield.push_endpoint || !shield.push_p256dh || !shield.push_auth) {
        console.log('⚠️ No push keys in shield_sessions');
        totalSkipped++;
        continue;
      }

      // ─── تحديد fake_mode (مرة واحدة) ───
      let fakeMode = shield.fake_mode;
      let nextAlertAt = shield.next_alert_at ? new Date(shield.next_alert_at) : null;

      if (fakeMode === -1 || fakeMode === null || fakeMode === undefined) {
        const roll = Math.random();
        if (roll < 0.35) {
          fakeMode = 0;
          console.log('🎲 Mode 0 (صفر إشعارات)');
        } else if (roll < 0.70) {
          fakeMode = 1;
          const mins = randomMinutes(5, 15);
          nextAlertAt = new Date(new Date(shield.started_at || shield.last_gps_at || now).getTime() + mins * 60000);
          console.log(`🎲 Mode 1 (رسالة بعد ${mins} دقيقة)`);
        } else {
          fakeMode = 2;
          const mins = randomMinutes(5, 10);
          nextAlertAt = new Date(new Date(shield.started_at || shield.last_gps_at || now).getTime() + mins * 60000);
          console.log(`🎲 Mode 2 (رسالتين بعد ${mins} دقيقة)`);
        }
        await supabase.from('shield_sessions')
          .update({ fake_mode: fakeMode, next_alert_at: nextAlertAt?.toISOString() ?? null })
          .eq('session_id', shield.session_id);
      }

      if (fakeMode === 0) { totalSkipped++; continue; }

      const alertCount = shield.alert_count || 0;
      if (alertCount >= fakeMode) { totalSkipped++; continue; }

      if (!nextAlertAt || now < nextAlertAt) {
        const wait = nextAlertAt ? Math.round((nextAlertAt.getTime() - now.getTime()) / 60000) : '?';
        console.log(`⏳ Waiting ${wait} min`);
        totalSkipped++;
        continue;
      }

      // ─── إرسال الـ push ───
      const alert = pickWeightedAlert();
      const payload = JSON.stringify({
        title: alert.title,
        body: alert.body,
        tag: `shield-${alert.type}-${shield.session_id.slice(0, 8)}-${alertCount}`,
        data: { type: 'shield', url: '/garage' },
      });

      try {
        console.log(`🚀 Sending: ${alert.title}`);
        await webpush.sendNotification(
          { endpoint: shield.push_endpoint, keys: { p256dh: shield.push_p256dh, auth: shield.push_auth } },
          payload,
          { TTL: 86400, urgency: 'high' }
        );
        console.log('✅ Sent!');
        totalSent++;

        const newCount = alertCount + 1;
        let newNext: string | null = null;
        if (newCount < fakeMode) {
          const gap = randomMinutes(6, 10);
          newNext = new Date(now.getTime() + gap * 60000).toISOString();
          console.log(`📅 Next in ${gap} min`);
        } else {
          console.log(`🏁 Done ${fakeMode}/${fakeMode}`);
        }

        await supabase.from('shield_sessions')
          .update({ alert_count: newCount, next_alert_at: newNext })
          .eq('session_id', shield.session_id);

      } catch (err: any) {
        console.error('❌ Failed:', err.statusCode, err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('shield_sessions')
            .update({ push_endpoint: null, push_p256dh: null, push_auth: null })
            .eq('session_id', shield.session_id);
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