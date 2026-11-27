import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-cron-secret',
};

// ─── ⏱️ ثوابت التوقيت ───
const ALERT_INTERVAL_MS = 30 * 60 * 1000; // 30 دقيقة بين كل تنبيه والتاني (بالوقت الفعلي)
const MAX_ALERTS_PER_SESSION = 2;

// ─── 🛡️ بنك الـ 30 إشعار الأمني التكتيكي للرادار ───
interface TacticalAlert {
  type: 'status' | 'warning' | 'resolved' | 'report';
  title: string;
  body: string;
}

const ALERT_POOL: TacticalAlert[] = [
  { type: 'status', title: "🛡️ رادار Park'n 24", body: "جاري مسح المحيط الأمني لسيارتك.. الوضع مستقر تماماً." },
  { type: 'status', title: "🛰️ اتصال الأقمار الصناعية", body: "تم تثبيت إحداثيات GPS بدقة عالية. رادارك يعمل بنجاح." },
  { type: 'warning', title: "🔒 تأمين الحركة الفوري", body: "حساسات الاهتزاز مشفرة الآن. أي محاولة رفع بالونش ستصلك فوراً." },
  { type: 'status', title: "🤖 الذكاء الأمني نشط", body: "نظام التعرف على الحركة يراقب سيارتك. استمتع بمشوارك وأنت مطمئن." },
  { type: 'status', title: "📱 رادار الحماية الذكي", body: "تم تحديث بيانات الموقع. سيارتك في النطاق الآمن 100%." },
  { type: 'status', title: "🛡️ بروتوكول الحماية VIP", body: "نظام التتبع يعمل بأقصى طاقة الآن. سيارتك تحت حراستنا الإلكترونية." },
  { type: 'report', title: "🔍 مسح أمني شامل", body: "جاري فحص استقرار المركبة.. لا توجد اهتزازات غير طبيعية مسجلة." },
  { type: 'status', title: "📡 تردد الرادار مستقر", body: "اتصال حي ومستمر بين موبايلك ورادار السيارة. الحماية نشطة." },
  { type: 'warning', title: "🚨 نظام الردع الإلكتروني", body: "ملصقك الإلكتروني نشط في قاعدة البيانات الأمنيّة حالياً." },
  { type: 'resolved', title: "✨ طمأنينة Park'n 24", body: "نراقب سيارتك كأننا بجوارها تماماً. ركنة سعيدة!" },
  { type: 'report', title: "🛠️ فحص الحساسات", body: "تم التأكد من عمل حساس الميل (Tilt Sensor). سيارتك مؤمنة ضد الرفع." },
  { type: 'status', title: "🌐 شبكة الحماية الحية", body: "سيارتك ضمن نطاق \"المنطقة الخضراء\" المؤمنة بـ Park'n 24." },
  { type: 'status', title: "🛡️ درع الخصوصية", body: "وضع الحماية الصامت يعمل. التنبيه سيصدر فقط في حالة الخطر." },
  { type: 'status', title: "🛰️ تحديث الإحداثيات", body: "قمر صناعي نشط الآن لمتابعة موقع ركنتك. دقة التتبع: 1 متر." },
  { type: 'status', title: "🤖 مراقبة ذكية 24/7", body: "رادارك الذكي يعمل في الخلفية ويحمي السيارة من أي تدخل خارجي." },
  { type: 'warning', title: "🛡️ حماية فائقة", body: "تم تنشيط وضع \"تجميد الموقع\". سنخبرك بأي تحرك ولو لسنتيمتر واحد." },
  { type: 'resolved', title: "📍 تأكيد الموقع", body: "تم التحقق من بقاء السيارة في مكانها الأصلي بنجاح." },
  { type: 'status', title: "🧠 خوارزمية التتبع", body: "نظامنا يحلل محيط السيارة الآن لضمان أقصى درجات الأمان." },
  { type: 'status', title: "📱 حالة الدرع", body: "الدرع الإلكتروني: [نشط]. البطارية: [مستقرة]. الأمان: [100%]." },
  { type: 'resolved', title: "🌟 تميز مع Park'n 24", body: "شكرًا لثقتك في نظام حمايتنا. سيارتك في أيدي أمينة تكنولوجياً." },
  { type: 'warning', title: "🕵️ رادار كشف التطفل", body: "أي محاولة لفتح الأبواب أو لمس الزجاج ستفعل الإنذار فوراً." },
  { type: 'status', title: "🛡️ تأمين شامل", body: "سيارتك الآن جزء من شبكة المركبات المحمية إلكترونياً." },
  { type: 'status', title: "📡 إشارة الرادار", body: "قوة الإشارة ممتازة. التتبع اللحظي يعمل بدون أي تأخير." },
  { type: 'status', title: "🚗 وضع الانتظار الذكي", body: "نظام حماية الركنات الطويلة نشط. لا تقلق بشأن سيارتك نهائياً." },
  { type: 'warning', title: "⚡ استجابة فورية", body: "رادارك جاهز لإطلاق سارينة الطوارئ في أقل من ثانية عند الخطر." },
  { type: 'report', title: "🛡️ توثيق أمني", body: "تم تسجيل بدء جلسة الحماية بنجاح في سجلات الأمان الرقمية." },
  { type: 'status', title: "🌌 رادار المراقبة الليلية", body: "نظام الحماية الليلي نشط لمراقبة سيارتك في الظلام." },
  { type: 'resolved', title: "🛡️ فحص المسافة", body: "المسافة بينك وبين السيارة آمنة. الرادار يغطي المسافة بالكامل." },
  { type: 'status', title: "🛰️ تزامن الأقمار", body: "تم عمل Sync ناجح مع 4 أقمار صناعية لتأمين موقعك الحالي." },
  { type: 'resolved', title: "✅ فحص أخير", body: "كل الأنظمة تعمل بكفاءة. استمتع بيومك، نحن نتولى الحراسة!" },
];

// دالة اختيار إشعار عشوائي مع إمكانية استبعاد عنوان سابق لمنع التكرار
function pickTacticalAlert(excludeTitle?: string): TacticalAlert {
  const pool = excludeTitle
    ? ALERT_POOL.filter(a => a.title !== excludeTitle)
    : ALERT_POOL;
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ─── 🔐 حماية الـ cron بسر (x-cron-secret) ───
  const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';
  const providedSecret = req.headers.get('x-cron-secret') || '';
  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  try {
    console.log('🕐 Shield tactical cron executed at:', new Date().toISOString());

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

    // جلب كل الدروع النشطة حالياً
    const { data: shields, error: fetchErr } = await supabase
      .from('shield_sessions')
      .select('*')
      .is('ended_at', null);

    if (fetchErr) {
      console.error('❌ Error fetching shields:', fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500, headers: corsHeaders });
    }

    if (!shields || shields.length === 0) {
      return new Response(JSON.stringify({ success: true, shields: 0 }), { headers: corsHeaders });
    }

    console.log(`Found ${shields.length} active shields`);

    // ─── وضع الاختبار الفوري (?test=1) ───
    const url = new URL(req.url);
    if (url.searchParams.get('test') === '1') {
      let sent = 0;
      for (const s of shields) {
        if (!s.push_endpoint || !s.push_p256dh || !s.push_auth) continue;
        try {
          const sampleAlert = pickTacticalAlert();
          await webpush.sendNotification(
            { endpoint: s.push_endpoint, keys: { p256dh: s.push_p256dh, auth: s.push_auth } },
            JSON.stringify({
              title: sampleAlert.title,
              body: sampleAlert.body,
              icon: '/favicon.ico',
              tag: 'shield-test',
              data: { url: '/garage' }
            }),
            { TTL: 3600, urgency: 'high' }
          );
          sent++;
        } catch (e: any) {
          console.error(`Test fail for ${s.phone}:`, e.statusCode || e.message);
        }
      }
      return new Response(JSON.stringify({ test: true, sent, total: shields.length }), { headers: corsHeaders });
    }

    // ─── تنظيف: إغلاق أي جلسات مكررة لنفس رقم الهاتف ───
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
        await supabase
          .from('shield_sessions')
          .update({ ended_at: new Date().toISOString() })
          .eq('session_id', sessions[i].session_id);
      }
    }

    let totalSent = 0;
    let totalSkipped = 0;

    for (const shield of shields) {
      const alertCount = shield.alert_count || 0;
      const tick = shield.fake_tick || 0;
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      console.log(`\n🛡️ Shield: ${shield.phone}, alerts=${alertCount}/${MAX_ALERTS_PER_SESSION}, tick=${tick}`);

      // 1. التحقق من وجود مفاتيح الـ Push
      if (!shield.push_endpoint || !shield.push_p256dh || !shield.push_auth) {
        console.log('⚠️ No push keys');
        totalSkipped++;
        continue;
      }

      // 2. التحقق من أن الجلسة الأصلية لا تزال نشطة في جدول sessions
      const { data: originalSession } = await supabase
        .from('sessions')
        .select('id, status')
        .eq('id', shield.session_id)
        .maybeSingle();

      if (!originalSession || originalSession.status !== 'active') {
        await supabase
          .from('shield_sessions')
          .update({
            ended_at: nowIso,
            push_endpoint: null,
            push_p256dh: null,
            push_auth: null,
          })
          .eq('session_id', shield.session_id);
        console.log(`🔒 Session ${shield.session_id} ended — shield auto-closed`);
        totalSkipped++;
        continue;
      }

      // 3. حد أقصى صارم: إشعارين فقط لكل جلسة ركن
      if (alertCount >= MAX_ALERTS_PER_SESSION) {
        console.log('⏭️ Max 2 alerts reached — keeping shield active without push');
        totalSkipped++;
        continue;
      }

      // 4. توقيت الإرسال بالوقت الفعلي (مش بعدد مرات تشغيل الـ cron):
      // - المرجع = last_tick_at (وقت آخر تنبيه اتبعت أو اتحاول)، ولو مفيش يبقى created_at
      // - التنبيه بيتبعت لما الفرق يوصل 30 دقيقة، بغض النظر عن تردد الـ cron
      const anchorRaw = shield.last_tick_at || shield.created_at;
      const anchorMs = anchorRaw ? new Date(anchorRaw).getTime() : NaN;

      if (Number.isNaN(anchorMs)) {
        // مفيش مرجع زمني للجلسة: نبدأ العد من دلوقتي
        await supabase
          .from('shield_sessions')
          .update({ last_tick_at: nowIso })
          .eq('session_id', shield.session_id);
        console.log('🕒 No time anchor — initialized last_tick_at');
        totalSkipped++;
        continue;
      }

      const elapsedMs = nowMs - anchorMs;

      if (elapsedMs < ALERT_INTERVAL_MS) {
        const elapsedMin = Math.floor(elapsedMs / 60000);
        const remainingMin = Math.ceil((ALERT_INTERVAL_MS - elapsedMs) / 60000);
        // fake_tick بيفضل عداد للمتابعة بس، مش هو اللي بيحدد التوقيت
        await supabase
          .from('shield_sessions')
          .update({ fake_tick: tick + 1 })
          .eq('session_id', shield.session_id);
        console.log(`⏳ Waiting: ${elapsedMin} min elapsed, ${remainingMin} min left for alert #${alertCount + 1}`);
        totalSkipped++;
        continue;
      }

      // 5. حان وقت الإرسال -> اختيار إشعار مميز
      const chosenAlert = pickTacticalAlert();
      const payload = JSON.stringify({
        title: chosenAlert.title,
        body: chosenAlert.body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: `shield-${shield.session_id.slice(0, 8)}-${alertCount + 1}`,
        vibrate: [200, 100, 200],
        data: {
          type: 'shield',
          url: '/garage',
          alertIndex: alertCount + 1,
        },
      });

      try {
        console.log(`🚀 Sending tactical alert ${alertCount + 1}/${MAX_ALERTS_PER_SESSION} to ${shield.phone}: ${chosenAlert.title}`);

        await webpush.sendNotification(
          {
            endpoint: shield.push_endpoint,
            keys: {
              p256dh: shield.push_p256dh,
              auth: shield.push_auth,
            },
          },
          payload,
          { TTL: 86400, urgency: 'high' }
        );

        console.log('✅ Sent successfully!');
        totalSent++;

        await supabase
          .from('shield_sessions')
          .update({
            alert_count: alertCount + 1,
            fake_tick: 0,
            last_tick_at: nowIso,
          })
          .eq('session_id', shield.session_id);

      } catch (err: any) {
        console.error('❌ Push Failed:', err.statusCode, err.message);

        // نفس السلوك القديم: الفشل يأجل المحاولة 30 دقيقة تانية
        await supabase
          .from('shield_sessions')
          .update({
            fake_tick: 0,
            last_tick_at: nowIso,
          })
          .eq('session_id', shield.session_id);

        // إذا انتهت صلاحية الاشتراك أو تم حظره من المتصفح (410 Gone / 404 Not Found)
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase
            .from('shield_sessions')
            .update({
              push_endpoint: null,
              push_p256dh: null,
              push_auth: null,
            })
            .eq('session_id', shield.session_id);
          console.log(`🧹 Cleaned expired push subscription for ${shield.phone}`);
        }
      }
    }

    console.log(`\n📊 Execution Summary: sent=${totalSent}, skipped=${totalSkipped}`);

    return new Response(
      JSON.stringify({
        success: true,
        active_shields: shields.length,
        sent: totalSent,
        skipped: totalSkipped,
      }),
      { headers: corsHeaders }
    );

  } catch (err) {
    console.error('❌ Fatal Cron Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});