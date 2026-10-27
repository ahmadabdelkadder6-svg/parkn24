import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

// ─── ثوابت ───
const GEOFENCE_RADIUS = 250;           // 250 متر
const GPS_STALE_SECONDS = 900;         // 15 دقيقة - لو GPS أقدم من كده اعتبره قديم
const THEFT_MIN_DISTANCE = 250;        // لازم يكون بره السياج

// ─── 29 إشعار مختلف ──────────────────────────────────
const ALERT_POOL: { type: string; title: string; body: string }[] = [
  { type: 'warning', title: '⚠️ تحذير أمني', body: 'تم رصد حركة مريبة حول سيارتك' },
  { type: 'warning', title: '⚠️ تنبيه', body: 'شخص غريب يقترب من سيارتك' },
  { type: 'warning', title: '⚠️ انتبه', body: 'تم رصد اهتزاز غير طبيعي في السيارة' },
  { type: 'warning', title: '⚠️ إنذار', body: 'حركة مشبوهة بجوار سيارتك' },
  { type: 'warning', title: '⚠️ تنبيه أمني', body: 'تم اكتشاف نشاط غير معتاد في المنطقة' },

  { type: 'resolved', title: '✅ تم التأمين', body: 'السيارة آمنة، لا توجد تهديدات' },
  { type: 'resolved', title: '✅ تم التحقق', body: 'كل شيء على ما يرام حول سيارتك' },
  { type: 'resolved', title: '✅ استقرار', body: 'المنطقة آمنة حالياً' },
  { type: 'resolved', title: '✅ آمن', body: 'تم فحص السيارة ولا يوجد أي خطر' },
  { type: 'resolved', title: '✅ طبيعي', body: 'لا توجد أي تهديدات نشطة' },
  { type: 'resolved', title: '✅ تم الفحص', body: 'المحيط آمن تماماً' },
  { type: 'resolved', title: '✅ هدوء', body: 'لا توجد أي إشارات مقلقة' },

  { type: 'status', title: '🛡️ الدرع نشط', body: 'حماية مستمرة لسيارتك' },
  { type: 'status', title: '🛡️ تحديث', body: 'الدرع يعمل بكفاءة كاملة' },
  { type: 'status', title: '🛡️ مراقبة', body: 'نراقب سيارتك على مدار الساعة' },
  { type: 'status', title: '🛡️ تقرير', body: 'لا توجد أحداث مشبوهة حالياً' },
  { type: 'status', title: '🛡️ نشط', body: 'نظام الحماية يعمل بشكل طبيعي' },
  { type: 'status', title: '🛡️ متصل', body: 'الدرع متصل ومستقر' },
  { type: 'status', title: '🛡️ فحص', body: 'تم فحص المحيط بنجاح' },
  { type: 'status', title: '🛡️ حراسة', body: 'سيارتك تحت المراقبة الكاملة' },
  { type: 'status', title: '🛡️ تأمين', body: 'جميع أنظمة الحماية مفعّلة' },
  { type: 'status', title: '🛡️ رصد', body: 'المراقبة مستمرة بدون انقطاع' },
  { type: 'status', title: '🛡️ جاهز', body: 'الدرع في أعلى درجات الاستعداد' },

  { type: 'report', title: '📋 تقرير أمني', body: 'تم فحص المنطقة المحيطة بالسيارة' },
  { type: 'report', title: '📋 ملخص', body: 'لا توجد مخالفات أمنية مسجّلة' },
  { type: 'report', title: '📋 تقرير دوري', body: 'المنطقة هادئة وآمنة' },
  { type: 'report', title: '📋 سجل المراقبة', body: 'لا توجد أحداث تستدعي القلق' },

  { type: 'qrScan', title: '📱 مسح QR', body: 'تم التحقق من هوية الحارس' },
  { type: 'qrScan', title: '📱 تأكيد', body: 'الحارس المعتمد في الموقع الآن' },
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

// ─── Haversine ───
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── إرسال push ───
async function sendPush(shield: any, payload: any, supabase: any) {
  if (!shield.push_endpoint || !shield.push_p256dh || !shield.push_auth) {
    return { sent: false, reason: 'no-keys' };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: shield.push_endpoint,
        keys: { p256dh: shield.push_p256dh, auth: shield.push_auth },
      },
      JSON.stringify(payload),
      { TTL: 86400, urgency: 'high' }
    );
    return { sent: true };
  } catch (err: any) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // 🆕 امسح الـ push keys من الـ shield session نفسه (مش من جدول تاني)
      await supabase
        .from('shield_sessions')
        .update({
          push_endpoint: null,
          push_p256dh: null,
          push_auth: null,
        })
        .eq('id', shield.id);
    }
    return { sent: false, reason: err.message, status: err.statusCode };
  }
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

    // ─── جلب الدروع النشطة ───
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

    let totalBreaches = 0;
    let totalFakeSent = 0;
    let totalSkipped = 0;
    const now = new Date();

    for (const shield of shields) {
      console.log(`\n🛡️ Shield: id=${shield.id.slice(0, 8)}, phone=${shield.phone}`);

      // ═══════════════════════════════════════════════════
      // 🚨 الخطوة 1: فحص السرقة (الأولوية القصوى)
      // ═══════════════════════════════════════════════════
      // 🆕 لازم parking_lat/lng يكونوا موجودين عشان نقدر نحسب المسافة
      if (
        shield.parking_lat && shield.parking_lng &&
        shield.last_lat && shield.last_lng &&
        shield.last_gps_at
      ) {
        const gpsAge = (now.getTime() - new Date(shield.last_gps_at).getTime()) / 1000;

        // 🆕 الحالة أ: GPS حديث → احسب المسافة بنفسك
        if (gpsAge <= GPS_STALE_SECONDS) {
          const dist = haversine(
            shield.last_lat, shield.last_lng,
            shield.parking_lat, shield.parking_lng,
          );

          // 🚨 بره السياج + لسه ما اتبعتش إنذار
          if (dist > THEFT_MIN_DISTANCE && !shield.theft_alerted) {
            console.log(`🚨 BREACH! distance=${Math.round(dist)}m`);

            const result = await sendPush(shield, {
              title: '🚨 إنذار سرقة!',
              body: `سيارتك خرجت ${Math.round(dist)}م من السياج المحمي!`,
              tag: 'shield-breach',
              data: {
                type: 'shield-breach',
                shieldId: shield.id,
                distance: Math.round(dist),
              },
            }, supabase);

            if (result.sent) {
              totalBreaches++;
              await supabase.from('shield_sessions').update({
                theft_alerted: true,
                is_outside_fence: true,
                last_checked_at: now.toISOString(),
              }).eq('id', shield.id);
            }
            continue; // لو حصل breach، ما نبعتش أي إشعار وهمي
          }

          // ✅ رجع للسياج → reset
          if (dist <= THEFT_MIN_DISTANCE && shield.is_outside_fence) {
            console.log(`✅ Back inside fence`);
            await supabase.from('shield_sessions').update({
              is_outside_fence: false,
              theft_alerted: false,
              last_checked_at: now.toISOString(),
            }).eq('id', shield.id);
          }

          // ⚠️ لو بره السياج (حتى لو مش سرعة) → ما نبعتش إشعارات وهمية
          if (dist > THEFT_MIN_DISTANCE) {
            console.log(`⏭️ Outside fence, no fake alerts`);
            totalSkipped++;
            continue;
          }

        // 🆕 الحالة ب: GPS قديم (> 15 دقيقة) بس الـ client كان بعت flag إنه برة
        } else if (shield.is_outside_fence && !shield.theft_alerted) {
          console.log(`🚨 BREACH via client flag! (GPS stale ${Math.round(gpsAge)}s)`);

          const result = await sendPush(shield, {
            title: '🚨 إنذار سرقة!',
            body: 'سيارتك خرجت من السياج المحمي!',
            tag: 'shield-breach',
            data: {
              type: 'shield-breach',
              shieldId: shield.id,
              distance: 300,
            },
          }, supabase);

          if (result.sent) {
            totalBreaches++;
            await supabase.from('shield_sessions').update({
              theft_alerted: true,
              last_checked_at: now.toISOString(),
            }).eq('id', shield.id);
          }
          continue;
        }

      // 🆕 الحالة ج: مفيش parking_lat/lng (session قديم قبل التعديل)
      // اعتمد على الـ flag من الـ client بس
      } else if (shield.is_outside_fence && !shield.theft_alerted) {
        console.log(`🚨 BREACH via client flag only! (no parking coords)`);

        const result = await sendPush(shield, {
          title: '🚨 إنذار سرقة!',
          body: 'سيارتك خرجت من السياج المحمي!',
          tag: 'shield-breach',
          data: {
            type: 'shield-breach',
            shieldId: shield.id,
            distance: 300,
          },
        }, supabase);

        if (result.sent) {
          totalBreaches++;
          await supabase.from('shield_sessions').update({
            theft_alerted: true,
            last_checked_at: now.toISOString(),
          }).eq('id', shield.id);
        }
        continue;
      }

      // ═══════════════════════════════════════════════════
      // 📢 الخطوة 2: إشعارات وهمية (بس للجلسات الآمنة)
      // ═══════════════════════════════════════════════════
      let fakeMode = shield.fake_mode;
      let nextAlertAt = shield.next_alert_at ? new Date(shield.next_alert_at) : null;

      // تحديد الـ fake_mode (مرة واحدة في العمر)
      if (fakeMode === -1 || fakeMode === null || fakeMode === undefined) {
        const roll = Math.random();
        if (roll < 0.35) {
          fakeMode = 0;
          console.log('🎲 Mode: 0 (صفر إشعارات)');
        } else if (roll < 0.70) {
          fakeMode = 1;
          const mins = randomMinutes(5, 15);
          nextAlertAt = new Date(new Date(shield.started_at).getTime() + mins * 60 * 1000);
          console.log(`🎲 Mode: 1 (رسالة واحدة بعد ${mins} دقيقة)`);
        } else {
          fakeMode = 2;
          const mins = randomMinutes(5, 10);
          nextAlertAt = new Date(new Date(shield.started_at).getTime() + mins * 60 * 1000);
          console.log(`🎲 Mode: 2 (رسالتين بعد ${mins} دقيقة)`);
        }

        await supabase
          .from('shield_sessions')
          .update({
            fake_mode: fakeMode,
            next_alert_at: nextAlertAt?.toISOString() ?? null,
          })
          .eq('id', shield.id);
      }

      if (fakeMode === 0) {
        totalSkipped++;
        continue;
      }

      const alertCount = shield.alert_count || 0;
      if (alertCount >= fakeMode) {
        totalSkipped++;
        continue;
      }

      if (!nextAlertAt || now < nextAlertAt) {
        totalSkipped++;
        continue;
      }

      if (!shield.push_endpoint || !shield.push_p256dh || !shield.push_auth) {
        totalSkipped++;
        continue;
      }

      // 📤 ابعت إشعار وهمي
      const alert = pickWeightedAlert();
      const result = await sendPush(shield, {
        title: alert.title,
        body: alert.body,
        tag: `shield-${alert.type}-${shield.id.slice(0, 8)}-${alertCount}`,
        data: { type: 'shield', shieldId: shield.id },
      }, supabase);

      if (result.sent) {
        totalFakeSent++;
        const newAlertCount = alertCount + 1;
        let newNextAlertAt: string | null = null;

        if (newAlertCount < fakeMode) {
          const gap = randomMinutes(6, 10);
          newNextAlertAt = new Date(now.getTime() + gap * 60 * 1000).toISOString();
        }

        await supabase
          .from('shield_sessions')
          .update({
            alert_count: newAlertCount,
            next_alert_at: newNextAlertAt,
            last_checked_at: now.toISOString(),
          })
          .eq('id', shield.id);
      }
    }

    console.log(`\n📊 Final: breaches=${totalBreaches}, fake=${totalFakeSent}, skipped=${totalSkipped}`);

    return new Response(
      JSON.stringify({
        success: true,
        shields: shields.length,
        breaches: totalBreaches,
        fake_sent: totalFakeSent,
        skipped: totalSkipped,
      }),
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