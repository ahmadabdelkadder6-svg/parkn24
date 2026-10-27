import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

// ─── 29 إشعار في الـ Pool ─────────────────────────────
const ALERT_POOL = [
  // Warning (15%)
  { type: 'warning', title: '⚠️ تحذير أمني', body: 'تم رصد حركة مريبة حول سيارتك' },
  { type: 'warning', title: '⚠️ تنبيه', body: 'شخص غريب يقترب من سيارتك' },
  { type: 'warning', title: '⚠️ انتبه', body: 'تم رصد اهتزاز غير طبيعي' },
  { type: 'warning', title: '⚠️ إنذار', body: 'حركة مشبوهة بجوار السيارة' },
  { type: 'warning', title: '⚠️ تنبيه أمني', body: 'تم اكتشاف نشاط غير معتاد' },
  // Resolved (25%)
  { type: 'resolved', title: '✅ تم التأمين', body: 'السيارة آمنة، لا توجد تهديدات' },
  { type: 'resolved', title: '✅ تم التحقق', body: 'كل شيء على ما يرام' },
  { type: 'resolved', title: '✅ استقرار', body: 'المنطقة آمنة حالياً' },
  { type: 'resolved', title: '✅ آمن', body: 'تم فحص السيارة ولا يوجد خطر' },
  { type: 'resolved', title: '✅ طبيعي', body: 'لا توجد أي تهديدات نشطة' },
  // Status (40%)
  { type: 'status', title: '🛡️ الدرع نشط', body: 'حماية مستمرة لسيارتك' },
  { type: 'status', title: '🛡️ تحديث', body: 'الدرع يعمل بكفاءة كاملة' },
  { type: 'status', title: '🛡️ مراقبة', body: 'نراقب سيارتك على مدار الساعة' },
  { type: 'status', title: '🛡️ تقرير', body: 'لا توجد أحداث مشبوهة' },
  { type: 'status', title: '🛡️ نشط', body: 'نظام الحماية يعمل بشكل طبيعي' },
  { type: 'status', title: '🛡️ متصل', body: 'الدرع متصل ومستقر' },
  { type: 'status', title: '🛡️ فحص', body: 'تم فحص المحيط بنجاح' },
  { type: 'status', title: '🛡️ حراسة', body: 'سيارتك تحت المراقبة الكاملة' },
  // Report (12%)
  { type: 'report', title: '📋 تقرير أمني', body: 'تم فحص المنطقة المحيطة' },
  { type: 'report', title: '📋 ملخص', body: 'لا توجد مخالفات أمنية' },
  { type: 'report', title: '📋 تقرير', body: 'المنطقة هادئة وآمنة' },
  // QR Scan (8%)
  { type: 'qrScan', title: '📱 مسح QR', body: 'تم التحقق من هوية الحارس' },
  { type: 'qrScan', title: '📱 تأكيد', body: 'الحارس المعتمد في الموقع' },
];

function pickWeightedAlert() {
  const weights: Record<string, number> = {
    warning: 15, resolved: 25, status: 40, report: 12, qrScan: 8,
  };
  const filtered = ALERT_POOL;
  const totalWeight = filtered.reduce((sum, a) => sum + (weights[a.type] || 10), 0);
  let random = Math.random() * totalWeight;
  for (const alert of filtered) {
    random -= weights[alert.type] || 10;
    if (random <= 0) return alert;
  }
  return ALERT_POOL[0];
}

// ─── Helper: دقائق عشوائية ──────────────────────────
function randomMinutes(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ─── جلب الدروع النشطة ───────────────────────────
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
    let totalSkipped = 0;

    const now = new Date();

    for (const shield of shields) {
      console.log(`\n🛡️ Shield: id=${shield.id.slice(0, 8)}, phone=${shield.phone}, mode=${shield.fake_mode}, alerts=${shield.alert_count}`);

      // ─── الخطوة 1: تحديد الـ fake_mode (مرة واحدة بس) ───
      let fakeMode = shield.fake_mode;
      let nextAlertAt = shield.next_alert_at ? new Date(shield.next_alert_at) : null;

      if (fakeMode === -1 || fakeMode === null || fakeMode === undefined) {
        const roll = Math.random();
        if (roll < 0.35) {
          fakeMode = 0; // 35% — صفر إشعارات
          console.log('🎲 Mode: 0 (صفر إشعارات)');
        } else if (roll < 0.70) {
          fakeMode = 1; // 35% — رسالة واحدة
          const mins = randomMinutes(5, 15);
          nextAlertAt = new Date(new Date(shield.started_at).getTime() + mins * 60 * 1000);
          console.log(`🎲 Mode: 1 (رسالة واحدة) — أول إشعار بعد ${mins} دقيقة`);
        } else {
          fakeMode = 2; // 30% — رسالتين
          const mins = randomMinutes(5, 10);
          nextAlertAt = new Date(new Date(shield.started_at).getTime() + mins * 60 * 1000);
          console.log(`🎲 Mode: 2 (رسالتين) — أول إشعار بعد ${mins} دقيقة`);
        }

        await supabase
          .from('shield_sessions')
          .update({
            fake_mode: fakeMode,
            next_alert_at: nextAlertAt?.toISOString() ?? null,
          })
          .eq('id', shield.id);
      }

      // ─── الخطوة 2: هل نبعث إشعار؟ ──────────────────
      if (fakeMode === 0) {
        console.log('⏭️ Mode 0 — لا إشعارات');
        totalSkipped++;
        continue;
      }

      const alertCount = shield.alert_count || 0;
      if (alertCount >= fakeMode) {
        console.log(`⏭️ Already sent ${alertCount}/${fakeMode} alerts`);
        totalSkipped++;
        continue;
      }

      if (!nextAlertAt || now < nextAlertAt) {
        const waitMin = nextAlertAt
          ? Math.round((nextAlertAt.getTime() - now.getTime()) / 60000)
          : '?';
        console.log(`⏳ Not yet — waiting ${waitMin} min`);
        totalSkipped++;
        continue;
      }

      // ─── الخطوة 3: جلب الـ subscription ────────────
      const { data: subs, error: subError } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('phone', shield.phone)
        .limit(1);

      if (subError) {
        console.error('❌ Subscription DB error:', subError.message);
        continue;
      }

      if (!subs || subs.length === 0) {
        console.log('⚠️ No subscription found for phone:', shield.phone);
        continue;
      }

      const sub = subs[0];

      // ─── الخطوة 4: إرسال الـ push ──────────────────
      const alert = pickWeightedAlert();
      const payload = JSON.stringify({
        title: alert.title,
        body: alert.body,
        tag: `shield-${alert.type}-${shield.id.slice(0, 8)}-${alertCount}`,
        data: { type: 'shield', shieldId: shield.id },
      });

      try {
        console.log(`🚀 Sending [${alert.type}]: ${alert.title}`);

        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          { TTL: 86400, urgency: 'high' }
        );

        console.log('✅ Push sent!');
        totalSent++;

        const newAlertCount = alertCount + 1;
        let newNextAlertAt: string | null = null;

        // لو لسه فيه إشعار تاني (mode 2 وأول مرة)
        if (newAlertCount < fakeMode) {
          const gap = randomMinutes(6, 10);
          newNextAlertAt = new Date(now.getTime() + gap * 60 * 1000).toISOString();
          console.log(`📅 Next alert in ${gap} min`);
        } else {
          console.log(`🏁 All ${fakeMode} alerts sent — done!`);
        }

        await supabase
          .from('shield_sessions')
          .update({
            alert_count: newAlertCount,
            next_alert_at: newNextAlertAt,
          })
          .eq('id', shield.id);

      } catch (err: any) {
        console.error('❌ Push FAILED!');
        console.error('   Status:', err.statusCode);
        console.error('   Message:', err.message);

        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          console.log('🗑️ Deleted expired subscription');
        }
      }
    }

    console.log(`\n📊 Final: sent=${totalSent}, skipped=${totalSkipped}`);

    return new Response(
      JSON.stringify({ success: true, shields: shields.length, sent: totalSent, skipped: totalSkipped }),
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