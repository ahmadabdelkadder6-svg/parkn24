import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush          from 'https://esm.sh/web-push@3.6.6';

// ─── CORS ─────────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (
  body: Record<string, unknown>,
  status: number = 200
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// ─── Types ────────────────────────────────────────────────────
interface PushMessage {
  title: string;
  body: string;
  tag?: string;
  data?: Record<string, unknown>;
}

interface ScheduledPushMessage extends PushMessage {
  sendAt: string;
}

interface RequestBody {
  garageId: string;
  immediate?: PushMessage | null;
  scheduled?: ScheduledPushMessage | null;
}

interface SendResult {
  success: boolean;
  endpoint: string;
  expired: boolean;
  error?: string;
}

// ─── Helper: بناء Payload آمن ─────────────────────────────────
const buildPayload = (msg: PushMessage): string => {
  const payload = JSON.stringify({
    notification: {
      title: msg.title,
      body: msg.body,
    },
    data: {
      ...(msg.data || {}),
      tag: msg.tag || 'parknow-push',
    },
  });

  // لو payload كبير جدًا، نقلله
  if (payload.length > 3800) {
    return JSON.stringify({
      notification: {
        title: msg.title,
        body: msg.body.substring(0, 100),
      },
      data: {
        tag: msg.tag || 'parknow-push',
      },
    });
  }

  return payload;
};

// ─── Helper: إرسال إشعار واحد ─────────────────────────────────
const sendOnePush = async (
  subscription: {
    endpoint: string;
    p256dh: string;
    auth: string;
  },
  payload: string
): Promise<SendResult> => {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      payload,
      {
        TTL: 120,
        urgency: 'high',
        topic: 'parknow-alert',
      }
    );

    return {
      success: true,
      endpoint: subscription.endpoint,
      expired: false,
    };
  } catch (err) {
    const statusCode = (err as { statusCode?: number })?.statusCode;

    if (statusCode === 404 || statusCode === 410) {
      return {
        success: false,
        endpoint: subscription.endpoint,
        expired: true,
        error: `Expired (${statusCode})`,
      };
    }

    return {
      success: false,
      endpoint: subscription.endpoint,
      expired: false,
      error: String(err),
    };
  }
};

// ─── Main ─────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  try {
    // ─── Env ────────────────────────────────────────────────
    const vapidEmail      = Deno.env.get('VAPID_EMAIL');
    const vapidPublicKey  = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    const supabaseUrl     = Deno.env.get('SUPABASE_URL');
    const supabaseKey     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!vapidEmail || !vapidPublicKey || !vapidPrivateKey) {
      return jsonResponse({ success: false, error: 'VAPID env missing' }, 500);
    }

    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse({ success: false, error: 'Supabase env missing' }, 500);
    }

    webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ─── Parse Body ─────────────────────────────────────────
    let body: RequestBody;

    try {
      body = await req.json();
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400);
    }

    const { garageId, immediate, scheduled } = body;

    if (!garageId || typeof garageId !== 'string') {
      return jsonResponse({ success: false, error: 'garageId is required' }, 400);
    }

    if (!immediate && !scheduled) {
      return jsonResponse(
        { success: false, error: 'At least one of immediate or scheduled is required' },
        400
      );
    }

    // ─── جلب Subscriptions ─────────────────────────────────
    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('garage_id', garageId);

    if (subscriptionsError) {
      console.error('❌ Fetch subscriptions error:', subscriptionsError);
      return jsonResponse(
        {
          success: false,
          error: 'Failed to fetch push subscriptions',
          details: subscriptionsError.message,
        },
        500
      );
    }

    // ✅ dedup بالـ endpoint
    const uniqueSubs = [
      ...new Map(
        (subscriptions ?? []).map((sub) => [sub.endpoint, sub])
      ).values(),
    ];

    console.log(
      `📋 Garage: ${garageId} | Subs: ${subscriptions?.length ?? 0} | Unique: ${uniqueSubs.length}`
    );

    let immediateSent = 0;
    let immediateFailed = 0;
    let expiredRemoved = 0;
    let scheduledSaved = false;

    // ─── إرسال فوري ────────────────────────────────────────
    if (immediate) {
      if (uniqueSubs.length === 0) {
        console.warn(`⚠️ No subscriptions for garage ${garageId}`);
      } else {
        const payload = buildPayload(immediate);

        const results = await Promise.all(
          uniqueSubs.map((sub) =>
            sendOnePush(
              {
                endpoint: sub.endpoint,
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
              payload
            )
          )
        );

        immediateSent = results.filter((r) => r.success).length;
        immediateFailed = results.filter((r) => !r.success).length;

        const expiredEndpoints = [
          ...new Set(results.filter((r) => r.expired).map((r) => r.endpoint)),
        ];

        if (expiredEndpoints.length > 0) {
          const { error: deleteError } = await supabase
            .from('push_subscriptions')
            .delete()
            .in('endpoint', expiredEndpoints)
            .eq('garage_id', garageId);

          if (deleteError) {
            console.error('❌ Delete expired subscriptions error:', deleteError);
          } else {
            expiredRemoved = expiredEndpoints.length;
          }
        }
      }
    }

    // ─── حفظ المجدول بـ upsert ─────────────────────────────
    if (scheduled) {
      const tag = scheduled.tag || 'parknow-push';

      const { error: upsertError } = await supabase
        .from('scheduled_push_alerts')
        .upsert(
          {
            garage_id: garageId,
            car_plate: String(scheduled.data?.carPlate || ''),
            title: scheduled.title,
            body: scheduled.body,
            tag,
            data: scheduled.data || {},
            send_at: scheduled.sendAt,

            // ✅ مهم جدًا: لو نفس tag اتعاد جدولته
            // يرجع alert كأنه جديد
            sent: false,
            sent_at: null,
            processing_started_at: null,
          },
          {
            // ✅ الصح بعد التعديل
            onConflict: 'garage_id,tag',
            ignoreDuplicates: false,
          }
        );

      if (upsertError) {
        console.error('❌ Scheduled upsert error:', upsertError);
        return jsonResponse(
          {
            success: false,
            error: 'Failed to save scheduled push',
            details: upsertError.message,
          },
          500
        );
      }

      scheduledSaved = true;
      console.log(`📅 Scheduled saved | garage:${garageId} | tag:${tag}`);
    }

    // ─── Log ───────────────────────────────────────────────
    try {
      const now = new Date().toISOString();
      const logs: Array<Record<string, unknown>> = [];

      if (immediate) {
        logs.push({
          garage_id: garageId,
          car_plate: immediate.data?.carPlate ?? null,
          action: 'send_immediate',
          subs_count: uniqueSubs.length,
          sent_count: immediateSent,
          created_at: now,
        });
      }

      if (scheduled) {
        logs.push({
          garage_id: garageId,
          car_plate: scheduled.data?.carPlate ?? null,
          action: 'schedule_push',
          send_at: scheduled.sendAt,
          created_at: now,
        });
      }

      if (logs.length > 0) {
        await supabase.from('push_alerts_log').insert(logs);
      }
    } catch (logErr) {
      console.warn('⚠️ Push log failed (non-critical):', logErr);
    }

    return jsonResponse({
      success: true,
      garageId,
      immediate: {
        requested: !!immediate,
        totalSubs: uniqueSubs.length,
        sent: immediateSent,
        failed: immediateFailed,
        expiredRemoved,
      },
      scheduled: {
        requested: !!scheduled,
        saved: scheduledSaved,
      },
    });
  } catch (err) {
    console.error('❌ Unexpected error:', err);
    return jsonResponse(
      {
        success: false,
        error: String(err),
      },
      500
    );
  }
});