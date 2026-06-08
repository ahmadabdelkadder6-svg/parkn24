import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush          from 'https://esm.sh/web-push@3.6.6';

// ─── CORS Headers ──────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

// ─── Helper: JSON Response ─────────────────────────────────────
const jsonResponse = (
  body:   Record<string, unknown>,
  status: number = 200
): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
};

// ─── Helper: Sleep ─────────────────────────────────────────────
const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

// ─── Helper: إرسال إشعار واحد مع retry ────────────────────────
interface SendResult {
  success:    boolean;
  endpoint:   string;
  expired:    boolean;
  error?:     string;
}

const sendOnePush = async (
  subscription: {
    endpoint: string;
    p256dh:   string;
    auth:     string;
  },
  payload:  string,
  retries:  number = 1
): Promise<SendResult> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth:   subscription.auth,
          },
        },
        payload,
        {
          // ✅ TTL قصير - لو الجهاز offline لأكثر من دقيقتين، تجاهل
          TTL:     120,
          // ✅ أولوية قصوى للإشعار
          urgency: 'high',
          // ✅ topic لمنع تكرار الإشعارات
          topic:   'parknow-alert',
        }
      );

      return {
        success:  true,
        endpoint: subscription.endpoint,
        expired:  false,
      };

    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;

      // ✅ 410 = Gone (subscription expired)
      // ✅ 404 = Not Found
      if (statusCode === 410 || statusCode === 404) {
        return {
          success:  false,
          endpoint: subscription.endpoint,
          expired:  true,
          error:    `Subscription expired (${statusCode})`,
        };
      }

      // ✅ 413 = Payload too large
      if (statusCode === 413) {
        return {
          success:  false,
          endpoint: subscription.endpoint,
          expired:  false,
          error:    'Payload too large',
        };
      }

      // ✅ 429 = Too many requests - انتظر وأعد المحاولة
      if (statusCode === 429 && attempt < retries) {
        await sleep(1000);
        continue;
      }

      // ✅ 5xx errors - أعد المحاولة
      if (statusCode && statusCode >= 500 && attempt < retries) {
        await sleep(500);
        continue;
      }

      // ✅ خطأ نهائي
      return {
        success:  false,
        endpoint: subscription.endpoint,
        expired:  false,
        error:    String(err),
      };
    }
  }

  return {
    success:  false,
    endpoint: subscription.endpoint,
    expired:  false,
    error:    'Max retries exceeded',
  };
};

// ─── Main Handler ──────────────────────────────────────────────
serve(async (req) => {

  // ✅ معالجة CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // ✅ التحقق من المتغيرات
    const vapidEmail   = Deno.env.get('VAPID_EMAIL');
    const vapidPublic  = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
    const supabaseUrl  = Deno.env.get('SUPABASE_URL');
    const supabaseKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!vapidEmail || !vapidPublic || !vapidPrivate) {
      return jsonResponse(
        { success: false, error: 'VAPID env variables missing' },
        500
      );
    }

    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse(
        { success: false, error: 'Supabase env variables missing' },
        500
      );
    }

    // ✅ تهيئة web-push
    webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);

    // ✅ تهيئة Supabase
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ─── جلب التنبيهات المستحقة ─────────────────────────────
    const now = new Date().toISOString();

    const { data: alerts, error: alertsError } = await supabase
      .from('scheduled_push_alerts')
      .select('*')
      .eq('sent', false)
      .lte('send_at', now)
      .order('send_at', { ascending: true })
      .limit(50); // ✅ زدنا الحد لمعالجة كمية أكبر

    if (alertsError) {
      console.error('❌ Alerts fetch error:', alertsError);
      return jsonResponse(
        { success: false, error: alertsError.message },
        500
      );
    }

    if (!alerts || alerts.length === 0) {
      return jsonResponse({
        success:   true,
        message:   'No pending alerts',
        processed: 0,
        duration:  Date.now() - startTime,
      });
    }

    console.log(`📋 معالجة ${alerts.length} تنبيه مجدول`);

    // ✅ Lock الـ alerts فوراً لمنع التشغيل المزدوج
    const alertIds = alerts.map((a) => a.id);

    const { error: lockError } = await supabase
      .from('scheduled_push_alerts')
      .update({
        sent:            true,
        sent_at:         now,
        processing_started_at: now,
      })
      .in('id', alertIds)
      .eq('sent', false); // ✅ مهم - شرط إضافي لمنع race condition

    if (lockError) {
      console.error('❌ Lock error:', lockError);
      return jsonResponse(
        { success: false, error: 'Failed to lock alerts' },
        500
      );
    }

    // ─── جلب كل الـ subscriptions دفعة واحدة ────────────────
    const garageIds = [...new Set(alerts.map((a) => a.garage_id))];

    const { data: allSubscriptions, error: subsError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('garage_id', garageIds);

    if (subsError) {
      console.error('❌ Subscriptions fetch error:', subsError);
      return jsonResponse(
        { success: false, error: subsError.message },
        500
      );
    }

    // ✅ تجميع الـ subscriptions حسب garage_id
    const subscriptionsByGarage = new Map<string, typeof allSubscriptions>();
    for (const sub of allSubscriptions ?? []) {
      const list = subscriptionsByGarage.get(sub.garage_id) ?? [];
      list.push(sub);
      subscriptionsByGarage.set(sub.garage_id, list);
    }

    // ─── إرسال الإشعارات بالتوازي ───────────────────────────
    const expiredEndpoints: string[] = [];
    const successResults:    SendResult[] = [];
    const failedResults:     SendResult[] = [];

    // ✅ معالجة كل alert بالتوازي
    await Promise.all(
      alerts.map(async (alert) => {
        const subscriptions = subscriptionsByGarage.get(alert.garage_id) ?? [];

        if (subscriptions.length === 0) {
          console.warn(`⚠️ لا يوجد subscriptions للجراج ${alert.garage_id}`);
          return;
        }

        // ✅ بناء الـ payload
        const payload = JSON.stringify({
          notification: {
            title: alert.title,
            body:  alert.body,
          },
          data: {
            ...alert.data,
            tag:     alert.tag,
            alertId: alert.id,
          },
        });

        // ✅ التحقق من حجم الـ payload (4KB max)
        if (payload.length > 4000) {
          console.warn(`⚠️ Payload كبير جداً للـ alert ${alert.id}`);
        }

        // ✅ إرسال لكل الـ subscriptions بالتوازي
        const results = await Promise.all(
          subscriptions.map((sub) =>
            sendOnePush({
              endpoint: sub.endpoint,
              p256dh:   sub.p256dh,
              auth:     sub.auth,
            }, payload)
          )
        );

        // ✅ تصنيف النتائج
        for (const result of results) {
          if (result.success) {
            successResults.push(result);
          } else {
            failedResults.push(result);
            if (result.expired) {
              expiredEndpoints.push(result.endpoint);
            }
          }
        }
      })
    );

    // ─── حذف الـ subscriptions المنتهية ──────────────────────
    if (expiredEndpoints.length > 0) {
      const { error: deleteError } = await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', expiredEndpoints);

      if (deleteError) {
        console.error('❌ فشل حذف expired subscriptions:', deleteError);
      } else {
        console.log(`🗑️ تم حذف ${expiredEndpoints.length} subscription منتهية`);
      }
    }

    // ─── تسجيل log (اختياري) ────────────────────────────────
    try {
      await supabase.from('push_alerts_log').insert(
        alerts.map((alert) => ({
          garage_id:    alert.garage_id,
          car_plate:    alert.data?.carPlate ?? null,
          action:       'send_scheduled',
          alert_id:     alert.id,
          created_at:   now,
        }))
      );
    } catch (logErr) {
      console.warn('⚠️ فشل تسجيل log:', logErr);
    }

    // ─── Cleanup: حذف الـ alerts القديمة (أقدم من 24 ساعة) ──
    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await supabase
        .from('scheduled_push_alerts')
        .delete()
        .eq('sent', true)
        .lt('sent_at', yesterday);
    } catch (cleanupErr) {
      console.warn('⚠️ فشل cleanup:', cleanupErr);
    }

    const duration = Date.now() - startTime;

    console.log(
      `✅ تمت المعالجة | alerts: ${alerts.length} | success: ${successResults.length} | failed: ${failedResults.length} | expired: ${expiredEndpoints.length} | ${duration}ms`
    );

    return jsonResponse({
      success:           true,
      processed:         alerts.length,
      sent:              successResults.length,
      failed:            failedResults.length,
      expiredRemoved:    expiredEndpoints.length,
      duration,
    });

  } catch (err) {
    console.error('❌ خطأ غير متوقع:', err);
    return jsonResponse(
      {
        success: false,
        error:   String(err),
        duration: Date.now() - startTime,
      },
      500
    );
  }
});