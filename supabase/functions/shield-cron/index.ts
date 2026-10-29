import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const GPS_STALE_SECONDS = 900;
const THEFT_MIN_DISTANCE = 250;
const CAR_SPEED_THRESHOLD = 5;

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

function isCarSpeed(speed: number | null | undefined): boolean {
  if (speed === null || speed === undefined || speed < 0) return false;
  return speed >= CAR_SPEED_THRESHOLD;
}

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
      await supabase
        .from('shield_sessions')
        .update({ push_endpoint: null, push_p256dh: null, push_auth: null })
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

    const { data: shields, error: shieldError } = await supabase
      .from('shield_sessions')
      .select('*')
      .is('ended_at', null);

    if (shieldError) {
      return new Response(JSON.stringify({ error: 'Shield DB error' }), { status: 500 });
    }

    if (!shields || shields.length === 0) {
      return new Response(JSON.stringify({ success: true, shields: 0 }));
    }

    let totalBreaches = 0;
    let totalFakeSent = 0;
    let totalSkipped = 0;
    const now = new Date();

    for (const shield of shields) {

      // ═══════════════════════════════════════════════════
      // 🚨 فحص الحركة (بدون أي تغيير)
      // ═══════════════════════════════════════════════════
      if (
        shield.parking_lat && shield.parking_lng &&
        shield.last_lat && shield.last_lng &&
        shield.last_gps_at
      ) {
        const gpsAge = (now.getTime() - new Date(shield.last_gps_at).getTime()) / 1000;

        if (gpsAge <= GPS_STALE_SECONDS) {
          const dist = haversine(
            shield.last_lat, shield.last_lng,
            shield.parking_lat, shield.parking_lng,
          );

          if (dist > THEFT_MIN_DISTANCE && !shield.theft_alerted && isCarSpeed(shield.last_speed)) {
            const result = await sendPush(shield, {
              title: '🚨 تنبيه حركة!',
              body: `السيارة اتحركت ${Math.round(dist)}م من مكان الركن!`,
              tag: 'shield-breach',
              data: { type: 'shield-breach', shieldId: shield.id, distance: Math.round(dist) },
            }, supabase);

            if (result.sent) {
              totalBreaches++;
              await supabase.from('shield_sessions').update({
                theft_alerted: true, is_outside_fence: true,
              }).eq('id', shield.id);
            }
            continue;
          }

          if (dist <= THEFT_MIN_DISTANCE && shield.is_outside_fence) {
            await supabase.from('shield_sessions').update({
              is_outside_fence: false, theft_alerted: false,
            }).eq('id', shield.id);
          }

        } else if (shield.is_outside_fence && !shield.theft_alerted && isCarSpeed(shield.last_speed)) {
          const result = await sendPush(shield, {
            title: '🚨 تنبيه حركة!',
            body: 'السيارة اتحركت من مكان الركن!',
            tag: 'shield-breach',
            data: { type: 'shield-breach', shieldId: shield.id, distance: 300 },
          }, supabase);

          if (result.sent) {
            totalBreaches++;
            await supabase.from('shield_sessions').update({
              theft_alerted: true,
            }).eq('id', shield.id);
          }
          continue;
        }

      } else if (shield.is_outside_fence && !shield.theft_alerted && isCarSpeed(shield.last_speed)) {
        const result = await sendPush(shield, {
          title: '🚨 تنبيه حركة!',
          body: 'السيارة اتحركت من مكان الركن!',
          tag: 'shield-breach',
          data: { type: 'shield-breach', shieldId: shield.id, distance: 300 },
        }, supabase);

        if (result.sent) {
          totalBreaches++;
          await supabase.from('shield_sessions').update({
            theft_alerted: true,
          }).eq('id', shield.id);
        }
        continue;
      }

      // ═══════════════════════════════════════════════════
      // 📢 إشعارات وهمية — منطق بسيط جداً:
      //    alert_count < fake_mode → ابعت
      //    alert_count >= fake_mode → skip
      //    خلاص! مفيش أي حساب على تواريخ
      // ═══════════════════════════════════════════════════
      let fakeMode = shield.fake_mode;

      // لو لسه ما اتحددش → حدده مرة واحدة
      if (fakeMode === -1 || fakeMode === null || fakeMode === undefined) {
        const roll = Math.random();
if (roll < 0.50) fakeMode = 1;
else fakeMode = 2;

        await supabase
          .from('shield_sessions')
          .update({ fake_mode: fakeMode })
          .eq('id', shield.id);
      }

      // مفيش إشعارات → skip
      if (fakeMode === 0) { totalSkipped++; continue; }

      // خلصنا كل الإشعارات → skip
      const alertCount = shield.alert_count || 0;
      if (alertCount >= fakeMode) { totalSkipped++; continue; }

      // مفيش push keys → skip
      if (!shield.push_endpoint || !shield.push_p256dh || !shield.push_auth) {
        totalSkipped++;
        continue;
      }

      // ✅ ابعت فوراً!
      const alert = pickWeightedAlert();
      const result = await sendPush(shield, {
        title: alert.title,
        body: alert.body,
        tag: `shield-${alert.type}-${shield.id.slice(0, 8)}-${alertCount}`,
        data: { type: 'shield', shieldId: shield.id },
      }, supabase);

      if (result.sent) {
        totalFakeSent++;
        await supabase
          .from('shield_sessions')
          .update({ alert_count: alertCount + 1 })
          .eq('id', shield.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true, shields: shields.length,
        breaches: totalBreaches, fake_sent: totalFakeSent, skipped: totalSkipped,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});