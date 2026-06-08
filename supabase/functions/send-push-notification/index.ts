import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.6';

// ─── CORS ─────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── Helpers ──────────────────────────────────────────
const jsonResponse = (
  body: Record<string, unknown>,
  status: number = 200
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

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

// ─── إرسال إشعار واحد ─────────────────────────────────
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
        error: `Expired subscription (${statusCode})`,
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

// ─── Main ─────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  try {
    // ✅ التحقق من env
    const vapidEmail = Deno.env.get('VAPID_EMAIL');
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!vapidEmail || !vapidPublicKey || !vapidPrivateKey) {
      return jsonResponse(
        { success: false, error: 'VAPID env variables missing' },
        500
      );
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse(
        { success: false, error: 'Supabase env variables missing' },
        500
      );
    }

    webpush.setVapidDetails(
      vapidEmail,
      vapidPublicKey,
      vapidPrivateKey
    );

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ✅ قراءة body
    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        { success: false, error: 'Invalid JSON body' },
        400
      );
    }

    const { garageId, immediate, scheduled } = body;

    if (!garageId || typeof garageId !== 'string') {
      return jsonResponse(
        { success: false, error: 'garageId is required' },
        400
      );
    }

    if (!immediate && !scheduled) {
      return jsonResponse(
        { success: false, error: 'At least one of immediate or scheduled is required' },
        400
      );
    }

    // ✅ جلب subscriptions الخاصة بالجراج فقط
    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('garage_id', garageId);

    if (subscriptionsError) {
      console.error('❌ Subscriptions fetch error:', subscriptionsError);
      return jsonResponse(
        {
          success: false,
          error: 'Failed to fetch push subscriptions',
          details: subscriptionsError.message,
        },
        500
      );
    }

    let immediateSent = 0;
    let immediateFailed = 0;
    let expiredRemoved = 0;
    let scheduledSaved = false;

    // ─── إرسال فوري ─────────────────────────────────
    if (immediate && subscriptions && subscriptions.length > 0) {
      const payload = JSON.stringify({
        notification: {
          title: immediate.title,
          body: immediate.body,
        },
        data: {
          ...(immediate.data || {}),
          tag: immediate.tag || 'parknow-push',
        },
      });

      const results = await Promise.all(
        subscriptions.map((sub) =>
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

      const expiredEndpoints = results
        .filter((r) => r.expired)
        .map((r) => r.endpoint);

      immediateSent = results.filter((r) => r.success).length;
      immediateFailed = results.filter((r) => !r.success).length;

      if (expiredEndpoints.length > 0) {
        const { error: deleteError } = await supabase
          .from('push_subscriptions')
          .delete()
          .in('endpoint', expiredEndpoints)
          .eq('garage_id', garageId);

        if (deleteError) {
          console.error('❌ Failed to delete expired subscriptions:', deleteError);
        } else {
          expiredRemoved = expiredEndpoints.length;
        }
      }
    }

    // ─── حفظ المجدول ────────────────────────────────
    if (scheduled) {
      const { error: scheduledInsertError } = await supabase
        .from('scheduled_push_alerts')
        .insert({
          garage_id: garageId,
          car_plate: String(scheduled.data?.carPlate || ''),
          title: scheduled.title,
          body: scheduled.body,
          tag: scheduled.tag || 'parknow-push',
          data: scheduled.data || {},
          send_at: scheduled.sendAt,
          sent: false,
        });

      if (scheduledInsertError) {
        console.error('❌ Scheduled insert error:', scheduledInsertError);
        return jsonResponse(
          {
            success: false,
            error: 'Failed to save scheduled push',
            details: scheduledInsertError.message,
          },
          500
        );
      }

      scheduledSaved = true;
    }

    // ─── Log اختياري ───────────────────────────────
    try {
      const logs: Array<Record<string, unknown>> = [];

      if (immediate) {
        logs.push({
          garage_id: garageId,
          car_plate: immediate.data?.carPlate ?? null,
          action: 'send_immediate',
          created_at: new Date().toISOString(),
        });
      }

      if (scheduled) {
        logs.push({
          garage_id: garageId,
          car_plate: scheduled.data?.carPlate ?? null,
          action: 'schedule_push',
          created_at: new Date().toISOString(),
        });
      }

      if (logs.length > 0) {
        await supabase.from('push_alerts_log').insert(logs);
      }
    } catch (logErr) {
      console.warn('⚠️ Failed to write push log:', logErr);
    }

    return jsonResponse({
      success: true,
      garageId,
      immediate: {
        requested: !!immediate,
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